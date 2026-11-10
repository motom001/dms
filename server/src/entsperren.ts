/**
 * Geschützte PDFs entsperren (#827).
 *
 * - **Erkennen:** Beim Ablegen (Post, Hochladen, Postfach, WebDAV – alles läuft über `Dienst.neueDateien`) und beim
 *   Anzeigen der Mappe sieht Ablago nach, ob ein PDF geschützt ist (`qpdf --requires-password`, nur wenn `/Encrypt`
 *   im PDF steht). Das Ergebnis steht als `pdfSchutz` am Dokument.
 * - **Entsperren:** Mit dem Passwort entsteht über `qpdf --decrypt` eine **entsperrte Fassung**. Sie liegt wie die
 *   umgewandelten Fassungen (#577) in `<haushalt>/fassungen/` (Prüfwert des Originals) und geht damit in Sicherung und
 *   Vollexport. Vorschau, Volltext, Stempel und Archivfassung nehmen sie; das **Original bleibt unverändert**
 *   (Herunterladen, Weitergeben ohne Stempel, Versionen).
 * - **Passwort:** geht nur über die Standardeingabe an qpdf (`--password-file=-`), nie über die Befehlszeile, wo andere
 *   Prozesse es sehen könnten. Es steht nicht in der Datenbank, nicht im Protokoll und nicht in der Historie – außer die
 *   Person merkt es sich ausdrücklich (unten).
 * - **Rechte-Sperre** (Öffnen ohne Passwort, Drucken oder Kopieren verboten): ohne Rückfrage entsperrt.
 * - **Falsche Passwörter:** höchstens `VERSUCHE_MAX` je Person und Dokument in `VERSUCHE_MS`, danach 429.
 * - **Passwörter für Dokumente merken** (Variante A): im Konto der Person (Einstellung `dokpasswoerter_<konto>`),
 *   jedes Passwort einzeln mit dem Schlüssel von Ablago verschlüsselt (Tresor, #39) – damit verschlüsselt in der
 *   Sicherung, beim Schlüsselwechsel umgeschlüsselt, nicht im Vollexport. Höchstens `GEMERKT_MAX`. Anzeigen und Ändern
 *   nur nach erneuter Bestätigung (`BESTAETIGUNG_MS`, je Sitzung). Kommt neue Post für diese Person („Für“), probiert
 *   Ablago die gemerkten Passwörter still durch – jedes als eigener qpdf-Prozess mit Zeitgrenze.
 */
import { spawn } from './hintergrund';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FassungInfo } from '../../shared/src/dateiumwandlung';
import {
  BESTAETIGUNG_MS, GEMERKT_MAX, NAME_MAX, PASSWORT_MAX, VERSUCHE_MAX, VERSUCHE_MS,
  type Entsperrt, type GemerktesPasswort, type PdfSchutz, type PdfSchutzArt,
} from '../../shared/src/entsperren';
import type { Dokument } from '../../shared/src/model';
import type { FassungsAblage } from './dateiumwandlung';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { hashe, speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import { protokoll } from './protokoll';
import { t } from './sprache';
import { KB } from './grenzen';

const log = protokoll.modul('dokumente');

/** Zeitgrenze für einen qpdf-Aufruf. */
export const QPDF_MS = 60_000;
/** Zeitgrenze für einen Versuch mit einem gemerkten Passwort und für alle Versuche an einem Dokument zusammen. */
export const GEMERKT_VERSUCH_MS = 20_000;
export const GEMERKT_GESAMT_MS = 120_000;
/** So viele Prüfergebnisse (Prüfwert → Schutz) behält Ablago im Speicher. */
const SCHUTZ_CACHE = 20_000;
/** Kennung der entsperrten Fassung in `FassungInfo.paket` – kein Paket, sondern Ablago selbst. */
export const ABLAGO = { id: 'ablago', name: 'Ablago', version: '' } as const;

const PDF = 'application/pdf';
const ENCRYPT = Buffer.from('/Encrypt');

/** Falsches Passwort (qpdf: „invalid password“). */
export class FalschesPasswort extends Error {
  constructor() { super(t('meldungen.entsperren.falsches-passwort')); }
}

interface Lauf { code: number | null; stderr: string }

/**
 * qpdf als eigener Prozess mit Zeitgrenze. `eingabe` geht über die Standardeingabe (für `--password-file=-`), nie
 * in die Befehlszeile. Kein Protokoll, keine Ausgabe der Eingabe.
 */
function qpdf(args: string[], eingabe: string | null, ms = QPDF_MS): Promise<Lauf> {
  return new Promise((ok, fehler) => {
    const p = spawn('qpdf', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    const uhr = setTimeout(() => p.kill('SIGKILL'), ms);
    p.stderr.on('data', (c: Buffer) => { if (stderr.length < 8192) stderr += c.toString('utf8'); });
    p.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(uhr);
      fehler(e.code === 'ENOENT' ? new Fachfehler(503, t('mappen.entsperren.ohne-qpdf')) : e);
    });
    p.on('close', (code, signal) => {
      clearTimeout(uhr);
      if (signal === 'SIGKILL') { fehler(new Fachfehler(422, t('mappen.entsperren.zu-lange', { s: Math.round(ms / 1000) }))); return; }
      ok({ code, stderr });
    });
    // Ein Fehler beim Schreiben (qpdf schon beendet) zeigt sich am Ergebnis.
    p.stdin.on('error', () => {});
    if (eingabe !== null) p.stdin.write(`${eingabe}\n`);
    p.stdin.end();
  });
}

async function mitDatei<T>(pdf: Buffer, f: (ein: string, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-entsperren-'));
  try {
    const ein = join(dir, 'ein.pdf');
    await writeFile(ein, pdf);
    return await f(ein, dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/**
 * Wie ist ein PDF geschützt? null: gar nicht (oder kein PDF). Ohne `/Encrypt` im Inhalt startet kein Prozess – ein
 * verschlüsseltes PDF muss das Wort im Trailer bzw. im Querverweis-Strom tragen, und der ist nie gepackt.
 */
export async function schutzVon(pdf: Buffer): Promise<PdfSchutzArt | null> {
  if (pdf.subarray(0, KB).indexOf('%PDF-') < 0 || pdf.indexOf(ENCRYPT) < 0) return null;
  // qpdf --requires-password: 0 = Passwort nötig, 3 = verschlüsselt ohne Passwort zum Öffnen, 2 = nicht verschlüsselt.
  const r = await mitDatei(pdf, (ein) => qpdf(['--requires-password', ein], null, 30_000));
  return r.code === 0 ? 'passwort' : r.code === 3 ? 'rechte' : null;
}

/** Eingabe prüfen: Text, nicht zu lang, ohne Zeilenumbruch (qpdf liest nur die erste Zeile). */
export function passwortAus(x: unknown): string {
  if (typeof x !== 'string' || !x.length) throw new Fachfehler(422, t('mappen.entsperren.passwort-fehlt'));
  if (x.length > PASSWORT_MAX) throw new Fachfehler(422, t('mappen.entsperren.passwort-lang', { max: PASSWORT_MAX }));
  if (/[\r\n\0]/.test(x)) throw new Fachfehler(422, t('mappen.entsperren.passwort-zeile'));
  return x;
}

/**
 * Entsperrte Fassung mit qpdf (`--decrypt`). `passwort` null: ohne Passwort (Rechte-Sperre). Wirft `FalschesPasswort`
 * bei falschem Passwort, sonst Fachfehler 422 mit verständlicher Meldung.
 */
export async function entsperrePdf(pdf: Buffer, passwort: string | null, ms = QPDF_MS): Promise<Buffer> {
  if (passwort !== null) passwortAus(passwort);
  return mitDatei(pdf, async (ein, dir) => {
    const aus = join(dir, 'aus.pdf');
    const r = await qpdf([...(passwort !== null ? ['--password-file=-'] : []), '--decrypt', '--warning-exit-0', ein, aus], passwort, ms);
    if (r.code === 2 && /invalid password/i.test(r.stderr)) throw new FalschesPasswort();
    if (r.code !== 0) throw new Fachfehler(422, t('mappen.entsperren.kaputt'));
    const b = await readFile(aus);
    if (b.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Fachfehler(422, t('mappen.entsperren.kaputt'));
    return b;
  });
}

/* ---------- Gemerkte Passwörter ---------- */

interface Gespeichert { id: string; name: string; passwort: string; erstellt: string; zuletzt: string | null }
interface Ablage { eintraege: Gespeichert[] }
/** Schlüssel der Einstellung je Konto. */
export const gemerktSchluessel = (konto: string) => `dokpasswoerter_${konto}`;

const nameAus = (x: unknown): string => {
  const n = typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '';
  if (!n) throw new Fachfehler(422, t('mappen.entsperren.name-fehlt'));
  return n.slice(0, NAME_MAX);
};

export interface EntsperrenAnbindung {
  /** Dieselbe Ablage wie die umgewandelten Fassungen (#577): `<haushalt>/fassungen/`. */
  ablage: FassungsAblage;
  /** Inhalt einer Datei (Original). */
  datei(sha: string): Promise<Buffer>;
  /** Alle Dokumente mit dieser Datei. */
  dokumenteMitSha(sha: string): Promise<Dokument[]>;
  /** Danach: Vorschaubild, Volltext, Archivfassung und Historie (Dienst). */
  nachEntsperren?(docs: Dokument[], info: FassungInfo): Promise<void>;
  /** Für die gemerkten Passwörter. */
  speicher?: Einstellungen;
  verschluessele?(klartext: string): string;
  entschluessele?(wert: string): string | null;
  jetzt?(): number;
  /** Zustand zwischen Anfragen (#744: Fehlversuche, Bestätigung je Sitzung); ohne Angabe im Arbeitsspeicher. */
  zustand?: Kurzzustand;
}

/** Arten im Kurzzustand (#744). */
const VERSUCHE = 'pdf-passwort-fehler';
const BESTAETIGT = 'dokumentpasswort-bestaetigt';
const BESTAETIG_VERSUCHE = 'dokumentpasswort-fehler';

export class PdfEntsperren {
  /** Schutz je Prüfwert: hängt nur am Inhalt der Datei, darf je Prozess gemerkt bleiben (#744). */
  private schutzCache = new Map<string, PdfSchutzArt | null>();
  /**
   * Im Kurzzustand (#744), für alle Prozesse: falsche Versuche je Konto und Prüfwert, Bestätigung je Sitzung (nur der
   * Hash der Sitzung) und falsche Bestätigungen je Konto – je ein Zähler mit festem Fenster von `VERSUCHE_MS`.
   */
  private zustand: Kurzzustand;
  /** Laufendes Entsperren je Prüfwert (gleiche Datei nicht doppelt) – nur gegen doppelte Arbeit in diesem Prozess. */
  private laufend = new Map<string, Promise<unknown>>();

  constructor(private o: EntsperrenAnbindung) { this.zustand = o.zustand ?? speicherKurzzustand(() => this.jetzt()); }

  private jetzt() { return this.o.jetzt?.() ?? Date.now(); }

  /** Schutz eines Dokuments (nur PDFs), je Prüfwert gemerkt. */
  async schutz(d: Pick<Dokument, 'sha256' | 'mime'>): Promise<PdfSchutzArt | null> {
    if (d.mime !== PDF) return null;
    if (this.schutzCache.has(d.sha256)) return this.schutzCache.get(d.sha256)!;
    const s = await schutzVon(await this.o.datei(d.sha256));
    if (this.schutzCache.size >= SCHUTZ_CACHE) this.schutzCache.delete(this.schutzCache.keys().next().value!);
    this.schutzCache.set(d.sha256, s);
    return s;
  }

  /** Entsperrte Fassung (nur die, keine umgewandelte eines Pakets) oder null. */
  async fassung(sha: string): Promise<{ info: FassungInfo; inhalt: Buffer } | null> {
    const f = await this.o.ablage.lies(sha).catch(() => null);
    return f?.info.entsperrt ? f : null;
  }

  /** Für die Mappe: Schutz und entsperrte Fassung; null bei ungeschützten PDFs und anderen Dateien. */
  async stand(d: Pick<Dokument, 'sha256' | 'mime'>): Promise<PdfSchutz | null> {
    if (d.mime !== PDF) return null;
    const i = await this.o.ablage.info(d.sha256).catch(() => null);
    if (i?.entsperrt) return { art: i.entsperrt.art === 'rechte' ? 'rechte' : 'passwort', entsperrt: { ...i.entsperrt, am: i.erstellt } };
    const art = await this.schutz(d).catch(() => null);
    return art ? { art, entsperrt: null } : null;
  }

  /** Fassung ablegen und die Folgen anstoßen (einmal je Prüfwert). */
  private async lege(sha: string, inhalt: Buffer, e: Entsperrt): Promise<FassungInfo> {
    const info: FassungInfo = { mime: PDF, groesse: inhalt.length, sha256: createHash('sha256').update(inhalt).digest('hex'), paket: { ...ABLAGO }, erstellt: new Date(this.jetzt()).toISOString(), entsperrt: e };
    await this.o.ablage.schreibe(sha, info, inhalt);
    const docs = await this.o.dokumenteMitSha(sha).catch(() => [] as Dokument[]);
    await this.o.nachEntsperren?.(docs, info).catch((f: Error) => log.warn('Folgen des Entsperrens nicht angestoßen', { sha256: sha.slice(0, 12), fehler: f.message }));
    return info;
  }

  private einmal<T>(sha: string, f: () => Promise<T>): Promise<T> {
    const vorher = this.laufend.get(sha) ?? Promise.resolve();
    const p = vorher.catch(() => {}).then(f);
    this.laufend.set(sha, p);
    void p.finally(() => { if (this.laufend.get(sha) === p) this.laufend.delete(sha); }).catch(() => {});
    return p;
  }

  /** Falsche Versuche im laufenden Fenster. */
  /** Einen falschen Versuch zählen (atomar, für alle Prozesse); liefert die Zahl im Fenster. */
  private async falsch(art: string, schluessel: string): Promise<number> { return (await this.zustand.zaehle(art, schluessel, VERSUCHE_MS)).anzahl; }

  /**
   * Mit eingegebenem Passwort entsperren (POST /dokumente/{id}/entsperren). `merken`: zusätzlich im Konto merken.
   * Bei Rechte-Sperre genügt der Aufruf ohne Passwort.
   */
  async mitPasswort(d: Dokument, konto: string, passwort: unknown, merken?: { name: unknown } | null): Promise<{ pdfSchutz: PdfSchutz | null; gemerkt: boolean; hinweis?: string }> {
    if (d.mime !== PDF) throw new Fachfehler(422, t('mappen.entsperren.kein-pdf'));
    return this.einmal(d.sha256, async () => {
      if (await this.fassung(d.sha256)) return { pdfSchutz: await this.stand(d), gemerkt: false };
      const art = await this.schutz(d);
      if (!art) throw new Fachfehler(422, t('mappen.entsperren.nicht-geschuetzt'));
      if (art === 'rechte') {
        await this.lege(d.sha256, await entsperrePdf(await this.o.datei(d.sha256), null), { art: 'rechte', von: null });
        return { pdfSchutz: await this.stand(d), gemerkt: false };
      }
      const schluessel = `${konto}|${d.sha256}`;
      // Versuch vorab zählen (#956): atomar für alle Prozesse, bevor das Passwort geprüft wird.
      const n = await this.falsch(VERSUCHE, schluessel);
      if (n > VERSUCHE_MAX) { await this.zustand.erhoehe(VERSUCHE, schluessel, -1); throw new Fachfehler(429, t('mappen.entsperren.zu-viele', { minuten: VERSUCHE_MS / 60_000 })); }
      const pw = passwortAus(passwort);
      let klar: Buffer;
      try { klar = await entsperrePdf(await this.o.datei(d.sha256), pw); } catch (e) {
        if (!(e instanceof FalschesPasswort)) { await this.zustand.erhoehe(VERSUCHE, schluessel, -1); throw e; }
        log.info('Falsches Passwort für ein geschütztes PDF', { dokument: d.id, versuch: n });
        const uebrig = VERSUCHE_MAX - n;
        throw new Fachfehler(422, uebrig > 0 ? t('mappen.entsperren.falsch', { anzahl: uebrig }) : t('mappen.entsperren.zu-viele', { minuten: VERSUCHE_MS / 60_000 }));
      }
      await this.zustand.loesche(VERSUCHE, schluessel);
      await this.lege(d.sha256, klar, { art: 'passwort', von: konto });
      log.info('Geschütztes PDF entsperrt', { dokument: d.id });
      let gemerkt = false;
      let hinweis: string | undefined;
      if (merken) {
        try { await this.merke(konto, merken.name, pw); gemerkt = true; } catch (e) { hinweis = (e as Error).message; }
      }
      return { pdfSchutz: await this.stand(d), gemerkt, ...(hinweis ? { hinweis } : {}) };
    });
  }

  /**
   * Neue Dateien (#827): Rechte-Sperre sofort aufheben; bei Passwortschutz und Post für eine Person (`besitzer`) deren
   * gemerkte Passwörter still probieren. Bei Post für alle geschieht nichts – dann fragt Ablago beim Öffnen.
   */
  async neu(docs: Dokument[], besitzer: (d: Dokument) => Promise<string | null>): Promise<number> {
    let n = 0;
    const gesehen = new Set<string>();
    for (const d of docs) {
      if (!d || d.mime !== PDF || gesehen.has(d.sha256)) continue;
      gesehen.add(d.sha256);
      try {
        if (await this.o.ablage.info(d.sha256).catch(() => null)) continue;
        const art = await this.schutz(d);
        if (art === 'rechte') {
          await this.einmal(d.sha256, async () => {
            if (await this.fassung(d.sha256)) return;
            await this.lege(d.sha256, await entsperrePdf(await this.o.datei(d.sha256), null), { art: 'rechte', von: null });
            n++;
          });
          continue;
        }
        if (art !== 'passwort') continue;
        const konto = await besitzer(d).catch(() => null);
        if (!konto) continue;
        if (await this.mitGemerkten(d, konto)) n++;
      } catch (e) {
        log.warn('Schutz eines PDFs nicht geprüft', { dokument: d.id, fehler: (e as Error).message.slice(0, 200) });
      }
    }
    return n;
  }

  /** Gemerkte Passwörter einer Person durchprobieren (zuletzt benutzte zuerst). true, wenn eins passte. */
  private async mitGemerkten(d: Dokument, konto: string): Promise<boolean> {
    const a = await this.lies(konto);
    if (!a.eintraege.length || !this.o.entschluessele) return false;
    const reihe = [...a.eintraege].sort((x, y) => (y.zuletzt ?? '').localeCompare(x.zuletzt ?? '') || x.erstellt.localeCompare(y.erstellt));
    const inhalt = await this.o.datei(d.sha256);
    const ende = this.jetzt() + GEMERKT_GESAMT_MS;
    for (const e of reihe) {
      if (this.jetzt() > ende) break;
      const pw = this.o.entschluessele(e.passwort);
      if (pw === null) continue;
      let klar: Buffer;
      try { klar = await entsperrePdf(inhalt, pw, GEMERKT_VERSUCH_MS); } catch (f) { if (f instanceof FalschesPasswort) continue; throw f; }
      return this.einmal(d.sha256, async () => {
        if (await this.fassung(d.sha256)) return false;
        await this.lege(d.sha256, klar, { art: 'gemerkt', von: konto, name: e.name });
        await this.benutzt(konto, e.id);
        log.info('Geschütztes PDF mit gemerktem Passwort entsperrt', { dokument: d.id });
        return true;
      });
    }
    return false;
  }

  /* ---------- Passwörter für Dokumente (Mein Konto → Sicherheit) ---------- */

  private speicher(): Einstellungen {
    if (!this.o.speicher) throw new Fachfehler(404, t('mappen.entsperren.gemerkt.aus'));
    return this.o.speicher;
  }

  private async lies(konto: string): Promise<Ablage> {
    if (!this.o.speicher) return { eintraege: [] };
    const w = (await this.o.speicher.lies(gemerktSchluessel(konto))) as Ablage | null;
    return { eintraege: Array.isArray(w?.eintraege) ? w!.eintraege : [] };
  }

  private async schreibe(konto: string, a: Ablage) {
    await this.speicher().schreibe(gemerktSchluessel(konto), a.eintraege.length ? a : null);
  }

  private verschluessele(pw: string): string {
    if (!this.o.verschluessele) throw new Fachfehler(409, t('mappen.entsperren.gemerkt.ohne-schluessel'));
    try { return this.o.verschluessele(pw); } catch { throw new Fachfehler(409, t('mappen.entsperren.gemerkt.ohne-schluessel')); }
  }

  /** Liste ohne Passwörter. */
  async liste(konto: string): Promise<GemerktesPasswort[]> {
    return (await this.lies(konto)).eintraege.map(({ id, name, erstellt, zuletzt }) => ({ id, name, erstellt, zuletzt }));
  }

  /** Neues Passwort merken; ist dasselbe schon gemerkt, bleibt es bei dem (mit neuem Namen). */
  async merke(konto: string, name: unknown, passwort: unknown): Promise<GemerktesPasswort> {
    const n = nameAus(name);
    const pw = passwortAus(passwort);
    const a = await this.lies(konto);
    const gleich = a.eintraege.find((e) => this.o.entschluessele?.(e.passwort) === pw);
    if (gleich) { gleich.name = n; await this.schreibe(konto, a); return { id: gleich.id, name: n, erstellt: gleich.erstellt, zuletzt: gleich.zuletzt }; }
    if (a.eintraege.length >= GEMERKT_MAX) throw new Fachfehler(409, t('mappen.entsperren.gemerkt.voll', { max: GEMERKT_MAX }));
    const e: Gespeichert = { id: randomUUID(), name: n, passwort: this.verschluessele(pw), erstellt: new Date(this.jetzt()).toISOString(), zuletzt: null };
    a.eintraege.push(e);
    await this.schreibe(konto, a);
    log.info('Passwort für Dokumente gemerkt', { benutzer: konto });
    return { id: e.id, name: e.name, erstellt: e.erstellt, zuletzt: null };
  }

  private async eintrag(konto: string, id: string) {
    const a = await this.lies(konto);
    const e = a.eintraege.find((x) => x.id === id);
    if (!e) throw new Fachfehler(404, t('mappen.entsperren.gemerkt.unbekannt'));
    return { a, e };
  }

  private async benutzt(konto: string, id: string) {
    const { a, e } = await this.eintrag(konto, id).catch(() => ({ a: null, e: null }));
    if (!a || !e) return;
    e.zuletzt = new Date(this.jetzt()).toISOString();
    await this.schreibe(konto, a).catch(() => {});
  }

  /** Klartext eines gemerkten Passworts – nur nach Bestätigung (prüft der Aufrufer mit `pruefeBestaetigt`). */
  async zeige(konto: string, id: string): Promise<string> {
    const { e } = await this.eintrag(konto, id);
    const pw = this.o.entschluessele?.(e.passwort) ?? null;
    if (pw === null) throw new Fachfehler(409, t('mappen.entsperren.gemerkt.unlesbar'));
    log.info('Gemerktes Passwort für Dokumente angezeigt', { benutzer: konto });
    return pw;
  }

  /** Name oder Passwort ändern (Passwort nur nach Bestätigung, prüft der Aufrufer). */
  async aendere(konto: string, id: string, x: { name?: unknown; passwort?: unknown }): Promise<GemerktesPasswort> {
    const { a, e } = await this.eintrag(konto, id);
    if (x.name !== undefined) e.name = nameAus(x.name);
    if (x.passwort !== undefined) e.passwort = this.verschluessele(passwortAus(x.passwort));
    await this.schreibe(konto, a);
    log.info('Gemerktes Passwort für Dokumente geändert', { benutzer: konto, passwort: x.passwort !== undefined });
    return { id: e.id, name: e.name, erstellt: e.erstellt, zuletzt: e.zuletzt };
  }

  async loesche(konto: string, id: string): Promise<void> {
    const { a } = await this.eintrag(konto, id);
    a.eintraege = a.eintraege.filter((x) => x.id !== id);
    await this.schreibe(konto, a);
    log.info('Gemerktes Passwort für Dokumente gelöscht', { benutzer: konto });
  }

  /** Alle gemerkten Passwörter einer Person entfernen (z. B. beim Löschen des Kontos). */
  async vergiss(konto: string) { if (this.o.speicher) await this.o.speicher.schreibe(gemerktSchluessel(konto), null); }

  /**
   * Erneute Bestätigung für diese Sitzung: `pruefe` prüft Passwort bzw. Code (wirft bei Fehler). Höchstens
   * `VERSUCHE_MAX` Fehlversuche je Konto in `VERSUCHE_MS`. Liefert, bis wann sie gilt.
   */
  async bestaetige(konto: string, sitzung: string | undefined, pruefe: () => Promise<void>): Promise<string> {
    if (!sitzung) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.nur-browser'));
    // Versuch vorab zählen (#956): sonst kämen gleichzeitige Anfragen alle an der Grenze vorbei.
    if ((await this.falsch(BESTAETIG_VERSUCHE, konto)) > VERSUCHE_MAX) {
      await this.zustand.erhoehe(BESTAETIG_VERSUCHE, konto, -1);
      throw new Fachfehler(429, t('mappen.entsperren.zu-viele', { minuten: VERSUCHE_MS / 60_000 }));
    }
    await pruefe();
    await this.zustand.loesche(BESTAETIG_VERSUCHE, konto);
    const bis = this.jetzt() + BESTAETIGUNG_MS;
    await this.zustand.setze(BESTAETIGT, hashe(sitzung), null, bis);
    return new Date(bis).toISOString();
  }

  /** Bis wann die Bestätigung dieser Sitzung gilt (null: keine). */
  async bestaetigtBis(sitzung: string | undefined): Promise<string | null> {
    const x = sitzung ? await this.zustand.lies(BESTAETIGT, hashe(sitzung)) : null;
    return x?.bis ? new Date(x.bis).toISOString() : null;
  }

  async pruefeBestaetigt(sitzung: string | undefined) {
    if (!(await this.bestaetigtBis(sitzung))) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.bestaetigen'), { bestaetigen: true });
  }
}
