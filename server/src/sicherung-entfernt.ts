/**
 * Entfernte Sicherungen (#976): Sicherungen, die ein Sicherungsziel-Paket außer Haus führt – auch solche, die es lokal
 * nicht mehr gibt (Aufbewahrung, Plattenschaden, neu aufgesetzt). Zwei Quellen:
 *
 * - **Eigene Merkliste** (`sicherung_entfernt`): Räumt Ablago eine Sicherung lokal weg, deren Kopie außer Haus angekommen
 *   ist, merkt es sich Ziel und schlanke Metadaten (Größe, SHA-256, Beginn). So stehen sie auch bei älteren Paketen in der
 *   Liste – dort mit Ort und Dateiname statt eines Knopfs.
 * - **Liste des Ziels**: Pakete mit `dms:sicherung-holen` beantworten den Auftrag `auflisten` mit ihren Sicherungen samt
 *   der `<name>.json` vom Ziel und liefern eine Sicherung mit dem Auftrag `holen` in Stücken zurück
 *   (`PUT /sicherungen/{name}/holen`). Ablago schreibt sie in eine Teildatei, prüft Größe und SHA-256 gegen die eigene
 *   Merkliste bzw. die Liste des Ziels und legt sie erst dann als lokale Sicherung ab. Danach gehen Herunterladen,
 *   Prüfen und Wiederherstellen wie bei jeder lokalen Sicherung.
 *
 * Pakete bekommen dabei nie den Schlüssel und nie andere Dateien; ein Paket liefert nur, was Ablago bei ihm angefordert
 * hat, und nur so viele Bytes, wie die Sicherung groß ist.
 */
import { open, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { t } from './sprache';
import { sha256Von } from './sicherungsformat';
import { STUECK_MAX } from './grenzen';
import type { ExternStand, Lauf, SchlankeMetadaten, Sicherung } from './sicherung';

const log = protokoll.modul('sicherung');
const ENDUNG = '.dms-sicherung';
/** Höchstens so viele Sicherungen merkt sich Ablago, die es nur noch außer Haus gibt (die neuesten). */
export const ENTFERNT_MAX = 100;
/** Höchstens so viele Einträge nimmt Ablago aus der Liste eines Ziels (das Ergebnis eines Aufrufs hat 64 KB). */
export const ZIEL_LISTE_MAX = 150;
/** So lange gilt die Liste eines Ziels, bevor Ablago neu fragt. */
const LISTE_MS = 2 * 60_000;
/** Zeitgrenze für „auflisten“. */
const AUFLISTEN_MS = 30_000;
/** Wartezeit je Aufruf beim Holen; das Paket antwortet nach etwa der halben Zeitgrenze des Läufers. */
const HOLEN_MS = 15 * 60_000;
/** Ohne Fortschritt nach so vielen Aufrufen hintereinander bricht das Zurückholen ab. */
const STILLSTAND_MAX = 3;
/** Höchstens so viele Aufrufe je Zurückholen (wie die Fortsetzungen eines Ereignisses). */
const AUFRUFE_MAX = 500;

/** Warum Ablago eine entfernte Sicherung nicht selbst zurückholen kann. */
export type EntferntGrund = 'kann-nicht' | 'nicht-erreichbar' | 'nicht-am-ziel' | 'ohne-pruefsumme' | 'abweichend';

export interface EntfernteSicherung {
  name: string; datei: string; paket: string; paketName: string;
  /** Ziel in Worten, ohne Zugangsdaten (vom Paket). */
  ziel: string | null;
  groesse: number | null; sha256: string | null; beginn: string | null;
  holbar: boolean;
  grund?: EntferntGrund;
}
export interface EntferntStand {
  /** Sicherungen, die es nur noch außer Haus gibt. */
  nur: EntfernteSicherung[];
  /** Lokale Sicherungen, die ein Ziel ebenfalls führt: Name → Pakete. */
  auchAmZiel: Record<string, string[]>;
  /** Ziele, deren Liste nicht kam. */
  fehler: Array<{ paket: string; paketName: string; grund: string }>;
}

/** Ein Paket mit dms:sicherung-lesen; `holen`: auch dms:sicherung-holen. */
export interface ZielPaket { id: string; name: string; adresse?: string | null; holen?: boolean }
/** Aufruf eines Pakets mit dms:sicherung-holen (Läufer); Ergebnis als Text. */
export type HolAufruf = (paket: string, eingang: Record<string, unknown>, ms?: number) => Promise<string>;

type Merkeintrag = { ziel?: string; meta: SchlankeMetadaten; am: string };
type Merkliste = Record<string, Record<string, Merkeintrag>>;
type ZielEintrag = { name: string; groesse: number; meta: SchlankeMetadaten | null };
type Holstand = { paket: string; name: string; groesse: number; sha256: string; meta: SchlankeMetadaten; seit: string };

const NAME = /^[\w.-]{1,120}$/;
const gueltigerName = (n: unknown): n is string => typeof n === 'string' && NAME.test(n) && !n.startsWith('.');
const zahl = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
/** Zugangsdaten aus einer Adresse im Text entfernen (wie in sicherung.ts). */
const ohneZugangsdaten = (s: string) => s.replace(/(\w+:\/\/)[^/@\s]*@/g, '$1');

/** Schlanke Metadaten vom Ziel, streng geprüft: passen sie zu Name und Größe, und ist alles da, was die Wiederherstellung braucht? */
export function schlankGueltig(x: unknown, name: string, groesse?: number): SchlankeMetadaten | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const m = x as Record<string, unknown>;
  const v = (m.verschluesselung ?? {}) as Record<string, unknown>;
  const kopf = m.schlank === true && zahl(m.format) !== null && m.datei === `${name}${ENDUNG}` && zahl(m.groesse) !== null && (groesse === undefined || m.groesse === groesse);
  const pruefsumme = typeof m.sha256 === 'string' && /^[0-9a-f]{64}$/.test(m.sha256) && typeof m.beginn === 'string' && !Number.isNaN(Date.parse(m.beginn));
  const kurz = (w: unknown): w is string => typeof w === 'string' && w.length <= 200;
  if (!kopf || !pruefsumme || !kurz(v.verfahren) || !kurz(v.fingerabdruck)) return null;
  return { format: m.format as number, schlank: true, datei: m.datei as string, groesse: m.groesse as number, sha256: m.sha256 as string, beginn: m.beginn as string, verschluesselung: { verfahren: v.verfahren, fingerabdruck: v.fingerabdruck } };
}

/** Antwort auf „auflisten“: `{ "ziel": "…", "sicherungen": [ { "name", "groesse", "meta": {…} } ] }`. */
export function liesZielListe(roh: string): { ziel: string | null; eintraege: ZielEintrag[] } {
  let j: unknown;
  try { j = JSON.parse(roh); } catch { throw new Error(t('meldungen.sicherung.entfernt.liste-ungueltig')); }
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
  if (!Array.isArray(o.sicherungen)) throw new Error(t('meldungen.sicherung.entfernt.liste-ungueltig'));
  const eintraege: ZielEintrag[] = [];
  for (const e of o.sicherungen.slice(0, ZIEL_LISTE_MAX * 2)) {
    const x = (e ?? {}) as Record<string, unknown>;
    const groesse = zahl(x.groesse);
    if (!gueltigerName(x.name) || groesse === null || eintraege.some((y) => y.name === x.name)) continue;
    eintraege.push({ name: x.name, groesse, meta: schlankGueltig(x.meta, x.name, groesse) });
  }
  const ziel = text(o.ziel, 200);
  return { ziel: ziel ? ohneZugangsdaten(ziel) : null, eintraege: eintraege.slice(0, ZIEL_LISTE_MAX) };
}

type ZielListe = { ziel: string | null; eintraege: ZielEintrag[] };

/** Warum nicht holbar? Der eigene Stand zählt vor dem des Pakets: Weicht die Liste des Ziels davon ab, holt Ablago nichts. */
function grundFuer(p: ZielPaket, liste: ZielListe | null, amZiel: ZielEintrag | undefined, meta: SchlankeMetadaten | null): EntferntGrund | undefined {
  if (!p.holen) return 'kann-nicht';
  if (!liste) return 'nicht-erreichbar';
  if (!amZiel) return 'nicht-am-ziel';
  if (!meta) return 'ohne-pruefsumme';
  return amZiel.groesse !== meta.groesse || (amZiel.meta && amZiel.meta.sha256 !== meta.sha256) ? 'abweichend' : undefined;
}

/** Die Sicherungen eines Ziels einsortieren: lokal und am Ziel → auchAmZiel, sonst eine entfernte Zeile. */
function eintragen(erg: EntferntStand, p: ZielPaket, liste: ZielListe | null, merk: Merkliste, hier: Set<string>) {
  const namen = new Set([...Object.keys(merk).filter((n) => merk[n][p.id]), ...(liste?.eintraege.map((e) => e.name) ?? [])]);
  for (const name of namen) {
    const amZiel = liste?.eintraege.find((e) => e.name === name);
    if (hier.has(name)) { if (amZiel) (erg.auchAmZiel[name] ??= []).push(p.id); continue; }
    erg.nur.push(entfernteZeile(name, p, liste, amZiel, merk[name]?.[p.id]));
  }
}

function entfernteZeile(name: string, p: ZielPaket, liste: ZielListe | null, amZiel: ZielEintrag | undefined, gemerkt: Merkeintrag | undefined): EntfernteSicherung {
  const meta = gemerkt?.meta ?? amZiel?.meta ?? null;
  const grund = grundFuer(p, liste, amZiel, meta);
  return {
    name, datei: `${name}${ENDUNG}`, paket: p.id, paketName: p.name, ziel: liste?.ziel ?? gemerkt?.ziel ?? p.adresse ?? null,
    groesse: meta?.groesse ?? amZiel?.groesse ?? null, sha256: meta?.sha256 ?? null, beginn: meta?.beginn ?? null,
    holbar: !grund, ...(grund ? { grund } : {}),
  };
}

export class EntfernteSicherungen {
  private listen = new Map<string, { am: number; ziel: string | null; eintraege: ZielEintrag[] }>();

  constructor(private s: Sicherung) {}

  private async merkliste(): Promise<Merkliste> {
    const v = await this.s.einstellungen.lies('sicherung_entfernt');
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Merkliste : {};
  }

  /**
   * Vor dem lokalen Löschen (Aufbewahrung oder von Hand): Sicherungen, deren Kopie außer Haus angekommen ist, mit Ziel und
   * schlanken Metadaten merken – höchstens ENTFERNT_MAX, die neuesten.
   */
  async merke(namen: string[], extern: Record<string, Record<string, ExternStand>>): Promise<void> {
    const neu: Merkliste = {};
    for (const name of namen) {
      const ok = Object.entries(extern[name] ?? {}).filter(([, st]) => st.status === 'hochgeladen' || st.status === 'geprueft');
      if (!ok.length) continue;
      const j = JSON.parse(await readFile(join(this.s.ordner, `${name}.json`), 'utf8').catch(() => 'null')) as Record<string, unknown> | null;
      if (!j) continue;
      const meta = j.schlank === true ? schlankGueltig(j, name) : schlankGueltig({
        format: j.format, schlank: true, datei: j.datei, groesse: (j.groessen as { sicherungBytes?: unknown } | undefined)?.sicherungBytes,
        sha256: j.sha256, beginn: j.beginn, verschluesselung: j.verschluesselung,
      }, name);
      if (!meta) continue;
      neu[name] = Object.fromEntries(ok.map(([paket, st]) => [paket, { ...(st.ziel ? { ziel: st.ziel } : {}), meta, am: st.am }]));
    }
    if (!Object.keys(neu).length) return;
    const alle = { ...await this.merkliste(), ...neu };
    const behalten = Object.entries(alle).sort(([, a], [, b]) => (Object.values(b)[0]?.meta.beginn ?? '').localeCompare(Object.values(a)[0]?.meta.beginn ?? '')).slice(0, ENTFERNT_MAX);
    await this.s.einstellungen.schreibe('sicherung_entfernt', Object.fromEntries(behalten));
  }

  /** Ist eine schon lokal entfernte Sicherung bei einem dieser Pakete außer Haus angekommen (#1194)? */
  async angekommen(pakete: Set<string>): Promise<boolean> {
    return Object.values(await this.merkliste()).some((x) => Object.keys(x).some((p) => pakete.has(p)));
  }

  /** Paket entfernt oder Sicherung wieder lokal: aus der Merkliste nehmen. */
  private async vergiss(name: string) {
    const alle = await this.merkliste();
    if (!(name in alle)) return;
    delete alle[name];
    await this.s.einstellungen.schreibe('sicherung_entfernt', Object.keys(alle).length ? alle : null);
  }

  /** Liste eines Ziels (zwischengespeichert); wirft mit verständlicher Meldung. */
  private async zielListe(p: ZielPaket, frisch = false): Promise<ZielListe> {
    const da = this.listen.get(p.id);
    if (da && !frisch && Date.now() - da.am < LISTE_MS) return da;
    const rufe = this.s.extern?.holen;
    if (!rufe) throw new Error(t('meldungen.sicherung.entfernt.laeufer'));
    const r = liesZielListe(await rufe(p.id, { auftrag: 'auflisten' }, AUFLISTEN_MS));
    const x = { am: Date.now(), ...r };
    this.listen.set(p.id, x);
    return x;
  }

  /** Entfernte Sicherungen und wo die lokalen außerdem liegen; `lokal`: Namen der lokalen Sicherungen. */
  async stand(lokal: string[], frisch = false): Promise<EntferntStand | null> {
    const pakete = await this.s.extern?.pakete().catch(() => []) ?? [];
    if (!pakete.length) return null;
    const merk = await this.merkliste();
    const erg: EntferntStand = { nur: [], auchAmZiel: {}, fehler: [] };
    for (const p of pakete) {
      let liste: ZielListe | null = null;
      if (p.holen) {
        try { liste = await this.zielListe(p, frisch); } catch (e) { erg.fehler.push({ paket: p.id, paketName: p.name, grund: ohneZugangsdaten((e as Error).message).slice(0, 300) }); }
      }
      eintragen(erg, p, liste, merk, new Set(lokal));
    }
    erg.nur.sort((a, b) => (b.beginn ?? b.name).localeCompare(a.beginn ?? a.name));
    return erg;
  }

  private holPfade(name: string) {
    this.s.pfad(name);
    return { teil: join(this.s.ordner, `.holen-${name}.teil`), stand: join(this.s.ordner, `.holen-${name}.json`) };
  }

  /**
   * Zurückholen (#976): Ablago bittet das Paket, die Sicherung in Stücken zu liefern, prüft Größe und SHA-256 und legt
   * sie als lokale Sicherung mit den schlanken Metadaten ab. Ein Lauf zur Zeit (wie Sichern und Prüfen).
   */
  async hole(name: string, paketWunsch: unknown, von: string): Promise<Lauf> {
    if (await stat(this.s.pfad(name)).catch(() => null)) throw new Fachfehler(409, t('meldungen.sicherung.entfernt.schon-lokal'));
    const stand = await this.stand([], true);
    const e = stand?.nur.find((x) => x.name === name && (typeof paketWunsch !== 'string' || x.paket === paketWunsch));
    if (!e) throw new Fachfehler(404, t('meldungen.sicherung.diese-sicherung-gibt-es'));
    if (!e.holbar) throw new Fachfehler(409, t(`meldungen.sicherung.entfernt.grund.${e.grund ?? 'kann-nicht'}`));
    const meta = (await this.merkliste())[name]?.[e.paket]?.meta ?? this.listen.get(e.paket)?.eintraege.find((x) => x.name === name)?.meta;
    if (!meta) throw new Fachfehler(409, t('meldungen.sicherung.entfernt.grund.ohne-pruefsumme'));
    const platz = await statfs(this.s.ordner).catch(() => null);
    if (platz && platz.bavail * platz.bsize < meta.groesse) throw new Fachfehler(409, t('meldungen.sicherung.entfernt.platz'));
    const lauf = this.s.belege('holen', t('meldungen.sicherung.entfernt.titel', { name }));
    lauf.gesamt = meta.groesse;
    const pfade = this.holPfade(name);
    const h: Holstand = { paket: e.paket, name, groesse: meta.groesse, sha256: meta.sha256, meta, seit: new Date().toISOString() };
    await writeFile(pfade.teil, Buffer.alloc(0));
    await writeFile(pfade.stand, JSON.stringify(h));
    log.info('Sicherung wird zurückgeholt', { name, paket: e.paket, von, bytes: meta.groesse });
    void this.holeLauf(lauf, h, pfade, von);
    return lauf;
  }

  private async holeLauf(lauf: Lauf, h: Holstand, pfade: { teil: string; stand: string }, von: string) {
    const groesse = async () => (await stat(pfade.teil)).size;
    try {
      const rufe = this.s.extern?.holen;
      if (!rufe) throw new Error(t('meldungen.sicherung.entfernt.laeufer'));
      lauf.schritt = t('meldungen.sicherung.entfernt.schritt-holen');
      let stillstand = 0;
      for (let i = 0; i < AUFRUFE_MAX; i++) {
        const vorher = await groesse();
        if (vorher >= h.groesse) break;
        let fehler: string | null = null;
        await rufe(h.paket, { auftrag: 'holen', name: h.name, datei: `${h.name}${ENDUNG}`, versatz: vorher, groesse: h.groesse }, HOLEN_MS).catch((x) => { fehler = (x as Error).message; });
        const nachher = await groesse();
        lauf.bytes = nachher;
        if (nachher > vorher) { stillstand = 0; continue; }
        if (++stillstand >= STILLSTAND_MAX) throw new Error(fehler ? ohneZugangsdaten(fehler).slice(0, 300) : t('meldungen.sicherung.entfernt.stillstand'));
      }
      if (await groesse() !== h.groesse) throw new Error(t('meldungen.sicherung.entfernt.stillstand'));
      lauf.schritt = t('meldungen.sicherung.pruefsumme-berechnen');
      lauf.bytes = 0;
      const sha = await sha256Von(pfade.teil, (n) => { lauf.bytes = n; });
      if (sha !== h.sha256) throw new Error(t('meldungen.sicherung.entfernt.pruefsumme'));
      // Erst die Metadaten, dann die Datei: Ohne .json gäbe es eine Sicherung, die sich nicht einspielen lässt.
      await writeFile(join(this.s.ordner, `${h.name}.json`), JSON.stringify(h.meta, null, 2));
      await rename(pfade.teil, this.s.pfad(h.name));
      await this.s.merkePruefung(h.name, true);
      await this.vergiss(h.name);
      this.listen.delete(h.paket);
      log.info('Sicherung zurückgeholt', { name: h.name, paket: h.paket, von, bytes: h.groesse, sha256: sha });
      lauf.ergebnis = { name: h.name };
      lauf.status = 'fertig';
    } catch (e) {
      await rm(pfade.teil, { force: true });
      lauf.status = 'fehler'; lauf.fehler = (e as Error).message;
      log.warn('Sicherung nicht zurückgeholt', { name: h.name, paket: h.paket, von, fehler: lauf.fehler });
    } finally {
      await rm(pfade.stand, { force: true });
      lauf.beendet = new Date().toISOString(); lauf.schritt = 'Fertig';
    }
  }

  /**
   * Ein Stück vom Paket (PUT /sicherungen/{name}/holen?versatz=…): nur, solange Ablago diese Sicherung bei genau diesem
   * Paket angefordert hat, lückenlos ab dem bisherigen Ende und nie über die Größe hinaus. Stand in einer Datei im
   * Sicherungsordner – so passt es auch, wenn ein anderer Prozess das Zurückholen begonnen hat.
   */
  async nimmStueck(paket: string, name: string, versatz: unknown, inhalt: unknown): Promise<{ versatz: number; groesse: number }> {
    const pfade = this.holPfade(name);
    const h = JSON.parse(await readFile(pfade.stand, 'utf8').catch(() => 'null')) as Holstand | null;
    if (!h || h.paket !== paket || h.name !== name) throw new Fachfehler(403, t('meldungen.sicherung.entfernt.nicht-angefordert'));
    if (!Buffer.isBuffer(inhalt) || !inhalt.length || inhalt.length > STUECK_MAX) throw new Fachfehler(422, t('meldungen.sicherung.laenge-1-bis-bytes', { STUECK_MAX }));
    const bisher = (await stat(pfade.teil).catch(() => null))?.size;
    if (bisher === undefined) throw new Fachfehler(403, t('meldungen.sicherung.entfernt.nicht-angefordert'));
    const ab = versatz === undefined || versatz === '' ? NaN : Number(versatz);
    if (ab !== bisher) throw new Fachfehler(409, t('meldungen.sicherung.entfernt.versatz', { versatz: bisher }), { versatz: bisher });
    if (bisher + inhalt.length > h.groesse) throw new Fachfehler(422, t('meldungen.sicherung.entfernt.zu-gross', { groesse: h.groesse }));
    const f = await open(pfade.teil, 'a');
    try { await f.write(inhalt); } finally { await f.close(); }
    return { versatz: bisher + inhalt.length, groesse: h.groesse };
  }
}
