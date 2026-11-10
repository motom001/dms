import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { dirname, join, normalize, sep } from 'node:path';
import postgres from 'postgres';
import { FASSUNG_PFAD } from './dateiumwandlung';
import { ARCHIV_PFAD, WOERTER_PFAD } from './archivfassung';
import { migriere, verbinde } from './db';
import { bezeichner, OHNE_INHALT, type Tabelle } from './datenbankabzug';
import { beschreibe, liesErweiterungen, problemeAus, TRIGRAMM_INDEXNAMEN, trigrammIndizes } from './erweiterungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { einstellungsMerker, laufeFaellige, wochentagVon } from './zeitplan';
import { ortszeit, type Eintragsliste, type Metadaten, type SchlankeMetadaten, type Sicherung } from './sicherung';
import { liesKopf, liesSicherung, sha256Von, ZWECK } from './sicherungsformat';
import { entschluesseleMit, fingerabdruck, istPruefwort, leiteAb, schluesselAusText } from './tresor';
import { STATISTIK_SPALTEN } from './repo-pg';
import { t } from './sprache';
import { GB, PLATZ_RESERVE } from './grenzen';

/**
 * Wiederherstellen einer Sicherung (#107) und Probe-Wiederherstellung (#109).
 *
 * Sicher umschalten: Die Datenbank entsteht in einem eigenen, leeren Schema (aus den Migrationen,
 * die die Sicherung kannte), die Dateien in einem Ordner daneben. Erst wenn alles gelesen, geprüft
 * (GCM-Tag, Prüfwort, Anzahl) und auf den heutigen Stand migriert ist, tauscht eine einzige
 * Transaktion die Schemas; danach startet das DMS neu. Bricht etwas vorher ab, bleibt der alte
 * Stand unverändert. Die Probe spielt genauso ein, schaltet aber nie um und räumt danach auf.
 */

const log = protokoll.modul('sicherung');
const STAGING = 'dms_wh_';
const ALT = 'dms_alt_';
/** Altes Schema, wenn vorher keine Sicherung möglich war: bleibt 7 Tage. */
const BEHALTEN = 'dms_alt_behalten_';
const BEHALTEN_TAGE = 7;
/** Prüfschritt (#562): Erweiterungen der Suche vorhanden und sicher vor dem Aufräumen, Trigramm-Indizes eingespielt. */
const ERWEITERUNGEN_SCHRITT = t('meldungen.wiederherstellung.erweiterungen-der-datenbank');

export type Schrittstatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'hinweis' | 'ausgelassen';
export interface Schritt { name: string; status: Schrittstatus; info?: string }

export interface Wiederherstellungslauf {
  art: 'wiederherstellung' | 'probe';
  sicherung: string;
  von: string;
  status: 'laeuft' | 'fertig' | 'fehler' | 'neustart';
  schritte: Schritt[];
  bytes: number;
  gesamt: number;
  gestartet: string;
  beendet?: string;
  fehler?: string;
}

/** Was nach dem Neustart als Abschlussmeldung erscheint. */
export interface Abschluss { am: string; sicherung: string; von: string; schritte: Schritt[]; hinweise: string[] }

export interface Abgleich {
  name: string;
  meta: Metadaten;
  /** Versionen damals ↔ heute. */
  vergleich: Array<{ was: string; damals: string; heute: string; urteil: 'gleich' | 'ok' | 'hinweis' | 'fehler'; info?: string }>;
  probleme: string[];
  hinweise: string[];
  /** Ohne Eingabe vom Notfallblatt nicht lesbar (Schlüssel fehlt oder passt nicht). */
  schluesselNoetig: boolean;
}

export interface Laufzeit { dms: string; postgres: string; architektur: string; haushaltId: string; migrationen: string[] }

export interface WiederherstellungsQuellen {
  /** Verbindungs-URL der Datenbank (für eigene Verbindungen ins neue Schema). */
  url: string;
  /** Hauptverbindung (Schema public). */
  sql: postgres.Sql;
  migrationen: string;
  dateiWurzel: string;
  sicherung: Sicherung;
  tresor: { datei: string; fingerabdruck: string | null; alsText(): string | null };
  laufzeit(): Promise<Laufzeit>;
  /** Läuft der Wartungsmodus aktiv (#102)? */
  wartungAktiv(): boolean;
  /** Gibt es schon Benutzer? (Frisches System = nein.) */
  einrichtungNoetig(): Promise<boolean>;
  /** Nach dem Umschalten: neu starten (im Container: Prozess beenden, Docker startet neu). */
  neustart(): void;
  /** Gehört die Sicherung zu einem anderen Mandanten: dessen Id für den Neustart übernehmen (#119). */
  mandantUebernehmen?: (id: string) => Promise<void>;
  /** Einrichtungscode prüfen (frisches System, #119); wirft bei falschem Code. */
  pruefeCode?: (code: unknown) => void;
  anAdmins?: (betreff: import('./mail').MailText, text: import('./mail').MailText) => Promise<void>;
  jetzt?: () => Date;
}

/** Spaltenwerte eines Satzes; null = nicht gefunden. */
const istSicherer = (pfad: string) => {
  const n = normalize(pfad);
  return !!pfad && !n.startsWith('..') && !n.startsWith(sep) && !n.includes(`..${sep}`) && !/^[a-zA-Z]:/.test(n);
};

/** Versionen vergleichen: „0.20.0“ < „0.21.0“. */
function vergleicheVersion(a: string, b: string): number {
  const x = a.split(/[.-]/).map((t) => Number.parseInt(t, 10)); const y = b.split(/[.-]/).map((t) => Number.parseInt(t, 10));
  for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

export class Wiederherstellung {
  private lauf: Wiederherstellungslauf | null = null;
  /** Belegt ab dem ersten Prüfen eines Starts – verhindert zwei gleichzeitige Läufe. */
  private belegt = false;
  private jetzt: () => Date;

  constructor(private q: WiederherstellungsQuellen) { this.jetzt = q.jetzt ?? (() => new Date()); }

  aktuellerLauf(): Wiederherstellungslauf | null { return this.lauf ? structuredClone(this.lauf) : null; }
  laeuft() { return this.belegt || this.lauf?.status === 'laeuft' || this.lauf?.status === 'neustart'; }

  /** Belegen (synchron, vor jedem await) – sonst könnten zwei Starts gleichzeitig durchrutschen. */
  private belege() {
    if (this.laeuft() || this.q.sicherung.laeuft()) throw new Fachfehler(409, t('meldungen.wiederherstellung.es-laeuft-bereits-eine'));
    this.belegt = true;
  }

  /** Wer darf? Frisches System: jeder (wie die Ersteinrichtung). Laufendes System: Admin im aktiven Wartungsmodus. */
  async pruefeZugang(admin: boolean, einrichtungscode?: unknown) {
    if (await this.q.einrichtungNoetig()) {
      // Frisches System (#119): nur mit dem Einrichtungscode.
      this.q.pruefeCode?.(einrichtungscode);
      return 'frisch' as const;
    }
    if (!admin) throw new Fachfehler(403, t('meldungen.wiederherstellung.das-geht-nur-im'));
    if (!this.q.wartungAktiv()) throw new Fachfehler(409, t('meldungen.wiederherstellung.wiederherstellen-geht-nur-im'));
    return 'laufend' as const;
  }

  /* ---------- Abgleich ---------- */

  async abgleich(name: string, schluesselText?: string): Promise<Abgleich> {
    const eintrag = (await this.q.sicherung.liste()).find((x) => x.name === name);
    if (!eintrag) throw new Fachfehler(404, t('meldungen.wiederherstellung.diese-sicherung-gibt-es'));
    const probleme: string[] = []; const hinweise: string[] = [];
    // Kopie außer Haus (#585): daneben nur die schlanke Metadaten-Datei – den Rest liest das DMS mit dem Schlüssel aus der Sicherung.
    const aussen = !eintrag.meta && eintrag.schlank ? await this.metaAusSicherung(eintrag as Eintragsliste & { schlank: SchlankeMetadaten }, schluesselText) : null;
    if (!eintrag.meta && !aussen) throw new Fachfehler(422, t('meldungen.wiederherstellung.zu-dieser-sicherung-fehlt'));
    const m = eintrag.meta ?? aussen!.meta;
    if (aussen) {
      hinweise.push(t('meldungen.wiederherstellung.neben-dieser-sicherung-liegt'));
      if (aussen.problem) probleme.push(aussen.problem);
      if (!aussen.gelesen) {
        if (!aussen.problem) hinweise.push(t('meldungen.wiederherstellung.gib-den-schluessel-vom', { fingerabdruck: m.verschluesselung.fingerabdruck }));
        return { name, meta: m, vergleich: [], probleme, hinweise, schluesselNoetig: true };
      }
    }
    const heute = await this.q.laufzeit();
    // Die .json liegt unverschlüsselt daneben: was in Pfade einfließt, streng prüfen.
    if (m.datei !== `${name}.dms-sicherung` || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.haushaltId ?? '') || !Array.isArray(m.migrationen) || m.migrationen.some((x) => !/^[\w.-]+\.sql$/.test(String(x)))) {
      throw new Fachfehler(422, t('meldungen.wiederherstellung.die-metadaten-datei-json'));
    }
    const vergleich: Abgleich['vergleich'] = [];

    const unbekannt = m.migrationen.filter((x) => !heute.migrationen.includes(x));
    const dms = aussen ? -1 : vergleicheVersion(m.umgebung.dms, heute.dms);
    if (unbekannt.length) {
      probleme.push(t('meldungen.wiederherstellung.die-sicherung-stammt-von', { anzahl: unbekannt.length, dms: m.umgebung.dms, datenbankStand: String(m.umgebung.datenbankStand), dms2: heute.dms }));
    }
    if (aussen) vergleich.push({ was: 'Ablago', damals: 'unbekannt', heute: heute.dms, urteil: unbekannt.length ? 'fehler' : 'ok', info: unbekannt.length ? undefined : t('meldungen.wiederherstellung.steht-nicht-in-der') });
    else vergleich.push({ was: 'Ablago', damals: m.umgebung.dms, heute: heute.dms, urteil: unbekannt.length ? 'fehler' : dms === 0 ? 'gleich' : 'ok', info: !unbekannt.length && dms < 0 ? t('meldungen.wiederherstellung.aelter-wird-nach-dem') : undefined });
    const fehlende = heute.migrationen.filter((x) => !m.migrationen.includes(x)).length;
    vergleich.push({ was: t('meldungen.wiederherstellung.datenbank-stand'), damals: m.umgebung.datenbankStand ?? '–', heute: heute.migrationen.at(-1) ?? '–', urteil: unbekannt.length ? 'fehler' : fehlende ? 'ok' : 'gleich', info: fehlende && !unbekannt.length ? `${fehlende} ${t('meldungen.wiederherstellung.aenderungen-laufen', { anzahl: fehlende })} danach` : undefined });
    if (!aussen) {
      const pgDamals = m.umgebung.postgres.split('.')[0]; const pgHeute = heute.postgres.split('.')[0];
      vergleich.push({ was: 'PostgreSQL', damals: m.umgebung.postgres, heute: heute.postgres, urteil: pgDamals === pgHeute ? 'gleich' : 'ok', info: pgDamals !== pgHeute ? t('meldungen.wiederherstellung.andere-hauptversion-geht-die') : undefined });
      vergleich.push({ was: 'Architektur', damals: m.umgebung.architektur, heute: heute.architektur, urteil: m.umgebung.architektur === heute.architektur ? 'gleich' : 'ok' });
    }
    vergleich.push({ was: t('meldungen.wiederherstellung.ablage-id'), damals: m.haushaltId, heute: heute.haushaltId, urteil: m.haushaltId === heute.haushaltId ? 'gleich' : 'hinweis', info: m.haushaltId !== heute.haushaltId ? t('meldungen.wiederherstellung.abweichend-siehe-hinweis') : undefined });
    if (m.haushaltId !== heute.haushaltId) {
      hinweise.push(this.q.mandantUebernehmen
        ? t('meldungen.wiederherstellung.die-sicherung-gehoert-zur', { haushaltId: m.haushaltId, haushaltId2: heute.haushaltId })
        : t('meldungen.wiederherstellung.die-sicherung-gehoert-zur-2', { haushaltId: m.haushaltId, haushaltId2: heute.haushaltId }));
    }

    let schluesselNoetig = !aussen?.mitEingabe && this.q.tresor.fingerabdruck !== m.verschluesselung.fingerabdruck;
    if (schluesselText !== undefined && schluesselText.trim()) {
      const k = schluesselAusText(schluesselText);
      if (!k) probleme.push(t('meldungen.wiederherstellung.der-eingegebene-schluessel-hat'));
      else if (fingerabdruck(k) !== m.verschluesselung.fingerabdruck) probleme.push(t('meldungen.wiederherstellung.der-eingegebene-schluessel-hat-2', { fingerabdruck: fingerabdruck(k), fingerabdruck2: m.verschluesselung.fingerabdruck }));
      else schluesselNoetig = false;
    }
    if (schluesselNoetig) hinweise.push(t('meldungen.wiederherstellung.der-schluessel-dieser-installation', { fingerabdruck: m.verschluesselung.fingerabdruck }));
    try {
      const { kopf } = await liesKopf(join(this.q.sicherung.ordner, m.datei));
      if (kopf.fingerabdruck !== m.verschluesselung.fingerabdruck) probleme.push(t('meldungen.wiederherstellung.sicherungsdatei-und-metadaten-passen'));
    } catch (e) { probleme.push((e as Error).message); }
    return { name, meta: m, vergleich, probleme, hinweise, schluesselNoetig };
  }

  /**
   * Metadaten aus der Sicherung selbst (#585), wenn daneben nur die schlanke Fassung liegt: Mit dem Schlüssel (eingegeben
   * oder der dieses DMS, wenn der Fingerabdruck passt) wird nur der erste Eintrag (Inhaltsangabe) entschlüsselt.
   * Echt ist die Datei erst, wenn beim Einspielen der GCM-Prüfwert am Ende stimmt. Ohne Schlüssel: gelesen = false.
   */
  private async metaAusSicherung(e: Eintragsliste & { schlank: SchlankeMetadaten }, schluesselText?: string): Promise<{ meta: Metadaten; gelesen: boolean; mitEingabe: boolean; problem?: string }> {
    const s = e.schlank;
    if (s.datei !== `${e.name}.dms-sicherung` || !/^[0-9a-f]{64}$/.test(String(s.sha256)) || typeof s.verschluesselung?.fingerabdruck !== 'string') {
      throw new Fachfehler(422, t('meldungen.wiederherstellung.die-metadaten-datei-json'));
    }
    const meta: Metadaten = {
      format: 1, datei: s.datei, haushaltId: '', art: 'manuell', ausgeloestVon: '–', beginn: s.beginn, ende: s.beginn, dauerSekunden: 0,
      umgebung: { dms: '–', datenbankStand: null, postgres: '–', node: '–', system: '–', architektur: '–' },
      // dateien: -1 = unbekannt (steht erst am Ende der Sicherung); geprüft wird dann gegen den Endeintrag.
      anzahl: { mappen: 0, dokumente: 0, benutzer: 0, dateien: -1, tabellen: 0 } as Metadaten['anzahl'],
      groessen: { datenbankBytes: 0, dateienBytes: e.bytes, sicherungBytes: e.bytes },
      verschluesselung: { verfahren: String(s.verschluesselung.verfahren ?? ''), fingerabdruck: s.verschluesselung.fingerabdruck }, sha256: s.sha256, migrationen: [],
    };
    const text = schluesselText?.trim() ? schluesselText : null;
    const k = text ? schluesselAusText(text) : this.q.tresor.fingerabdruck === meta.verschluesselung.fingerabdruck ? schluesselAusText(this.q.tresor.alsText() ?? '') : null;
    if (text && !k) return { meta, gelesen: false, mitEingabe: false, problem: t('meldungen.wiederherstellung.der-eingegebene-schluessel-hat') };
    if (!k) return { meta, gelesen: false, mitEingabe: false };
    if (fingerabdruck(k) !== meta.verschluesselung.fingerabdruck) return { meta, gelesen: false, mitEingabe: false, problem: t('meldungen.wiederherstellung.der-eingegebene-schluessel-hat-2', { fingerabdruck: fingerabdruck(k), fingerabdruck2: meta.verschluesselung.fingerabdruck }) };
    try {
      const it = liesSicherung(join(this.q.sicherung.ordner, s.datei), leiteAb(k, ZWECK))[Symbol.asyncIterator]();
      const erst = await it.next();
      await it.return?.(undefined);
      const kopf = (erst.done ? null : erst.value.art === 'M' ? erst.value.kopf : null) as { haushaltId?: unknown; migrationen?: unknown; tabellen?: unknown; ohneInhalt?: unknown; zaehler?: Record<string, unknown> } | null;
      if (!kopf) throw new Error('Die Sicherung beginnt nicht mit der Inhaltsangabe – die Datei ist beschädigt.');
      const migrationen = Array.isArray(kopf.migrationen) ? kopf.migrationen.map(String) : [];
      const ohne = new Set(Array.isArray(kopf.ohneInhalt) ? kopf.ohneInhalt.map(String) : []);
      const tabellen = Array.isArray(kopf.tabellen) ? (kopf.tabellen as Array<{ name?: unknown }>).filter((t) => !ohne.has(String(t?.name))).length : 0;
      const z = kopf.zaehler ?? {};
      return {
        meta: { ...meta, haushaltId: String(kopf.haushaltId ?? ''), migrationen, umgebung: { ...meta.umgebung, datenbankStand: migrationen.at(-1) ?? null },
          anzahl: { ...meta.anzahl, mappen: Number(z.mappen) || 0, dokumente: Number(z.dokumente) || 0, benutzer: Number(z.benutzer) || 0, tabellen } as Metadaten['anzahl'] },
        gelesen: true, mitEingabe: !!text,
      };
    } catch (x) {
      return { meta, gelesen: false, mitEingabe: false, problem: t('meldungen.wiederherstellung.die-sicherung-laesst-sich', { message: (x as Error).message }) };
    }
  }

  private schluessel(m: Metadaten, schluesselText?: string): Buffer {
    const eigen = this.q.tresor.alsText();
    const text = schluesselText?.trim() ? schluesselText : this.q.tresor.fingerabdruck === m.verschluesselung.fingerabdruck ? eigen : null;
    const k = text ? schluesselAusText(text) : null;
    if (!k) throw new Fachfehler(422, t('meldungen.wiederherstellung.bitte-den-schluessel-vom'));
    if (fingerabdruck(k) !== m.verschluesselung.fingerabdruck) throw new Fachfehler(422, t('meldungen.wiederherstellung.der-schluessel-passt-nicht', { fingerabdruck: m.verschluesselung.fingerabdruck }));
    return k;
  }

  /* ---------- Starten ---------- */

  async starte(e: { name?: unknown; schluessel?: unknown; bestaetigt?: unknown }, admin: { email: string } | null, einrichtungscode?: unknown): Promise<Wiederherstellungslauf> {
    const art = await this.pruefeZugang(!!admin, einrichtungscode);
    this.belege();
    try { return await this.starteBelegt(e, admin, art); } catch (x) { this.belegt = false; throw x; }
  }

  private async starteBelegt(e: { name?: unknown; schluessel?: unknown; bestaetigt?: unknown }, admin: { email: string } | null, art: 'frisch' | 'laufend'): Promise<Wiederherstellungslauf> {
    const name = String(e.name ?? '');
    const text = typeof e.schluessel === 'string' ? e.schluessel : undefined;
    const a = await this.abgleich(name, text);
    if (a.probleme.length) throw new Fachfehler(422, a.probleme.join(' '));
    if (art === 'laufend' && e.bestaetigt !== true) throw new Fachfehler(422, t('meldungen.wiederherstellung.bitte-bestaetigen-dass-der'));
    const k = this.schluessel(a.meta, text);
    await this.pruefePlatz(a.meta);
    const von = admin?.email ?? t('meldungen.wiederherstellung.einrichtung-frisches-system');
    const lauf = this.neuerLauf('wiederherstellung', name, von, [
      ...(art === 'laufend' ? [t('meldungen.wiederherstellung.sicherung-des-jetzigen-stands')] : []),
      t('meldungen.wiederherstellung.pruefsumme-der-datei'), t('meldungen.wiederherstellung.entschluesseln-und-einspielen'), 'Prüfwort', t('meldungen.wiederherstellung.anzahl-mappen-dokumente-benutzer'), t('meldungen.wiederherstellung.auf-den-heutigen-stand'), ERWEITERUNGEN_SCHRITT, t('meldungen.wiederherstellung.dateien-uebernehmen'), 'Schlüsseldatei', 'Umschalten', 'Neustart',
    ]);
    log.warn('Wiederherstellung begonnen', { sicherung: name, von, art });
    void this.fuehreAus(lauf, a, k, art).catch(() => {}).finally(() => { this.belegt = false; });
    return this.aktuellerLauf()!;
  }

  /** Probe (#109): wie eine Wiederherstellung, aber ohne Umschalten; danach aufräumen. */
  async starteProbe(name: string | null, von: string): Promise<{ lauf: Wiederherstellungslauf; fertig: Promise<boolean> }> {
    this.belege();
    try { return await this.starteProbeBelegt(name, von); } catch (x) { this.belegt = false; throw x; }
  }

  private async starteProbeBelegt(name: string | null, von: string): Promise<{ lauf: Wiederherstellungslauf; fertig: Promise<boolean> }> {
    const liste = (await this.q.sicherung.liste()).filter((x) => x.meta);
    const ziel = name ? liste.find((x) => x.name === name) : liste[0];
    if (!ziel) throw new Fachfehler(404, name ? t('meldungen.wiederherstellung.diese-sicherung-gibt-es-2') : t('meldungen.wiederherstellung.es-gibt-noch-keine'));
    const m = ziel.meta!;
    const k = this.q.tresor.fingerabdruck === m.verschluesselung.fingerabdruck ? schluesselAusText(this.q.tresor.alsText() ?? '') : null;
    const lauf = this.neuerLauf('probe', ziel.name, von, [t('meldungen.wiederherstellung.pruefsumme-der-datei'), t('meldungen.wiederherstellung.entschluesseln-und-einspielen'), 'Prüfwort', t('meldungen.wiederherstellung.anzahl-mappen-dokumente-benutzer'), t('meldungen.wiederherstellung.auf-den-heutigen-stand'), ERWEITERUNGEN_SCHRITT, 'Aufräumen']);
    log.info('Probe-Wiederherstellung begonnen', { sicherung: ziel.name, von });
    const fertig = (async () => {
      if (!k) {
        this.fehlschlag(lauf, t('meldungen.wiederherstellung.pruefsumme-der-datei'), t('meldungen.wiederherstellung.die-sicherung-braucht-den', { fingerabdruck: m.verschluesselung.fingerabdruck, wert: this.q.tresor.fingerabdruck ?? 'keinen' }));
        await this.merkeProbe(ziel.name, false, lauf.fehler!);
        return false;
      }
      const a: Abgleich = { name: ziel.name, meta: m, vergleich: [], probleme: [], hinweise: [], schluesselNoetig: false };
      return this.fuehreAus(lauf, a, k, 'probe');
    })().finally(() => { this.belegt = false; });
    return { lauf: this.aktuellerLauf()!, fertig };
  }

  private neuerLauf(art: Wiederherstellungslauf['art'], sicherung: string, von: string, schritte: string[]): Wiederherstellungslauf {
    this.lauf = { art, sicherung, von, status: 'laeuft', schritte: schritte.map((name) => ({ name, status: 'offen' })), bytes: 0, gesamt: 0, gestartet: this.jetzt().toISOString() };
    return this.lauf;
  }

  private schritt(lauf: Wiederherstellungslauf, name: string, status: Schrittstatus, info?: string) {
    const s = lauf.schritte.find((x) => x.name === name);
    if (s) { s.status = status; if (info !== undefined) s.info = info; }
  }

  private fehlschlag(lauf: Wiederherstellungslauf, aktuell: string | null, grund: string) {
    if (aktuell) this.schritt(lauf, aktuell, 'fehler', grund);
    for (const s of lauf.schritte) if (s.status === 'offen' || s.status === 'laeuft') s.status = s.status === 'laeuft' ? 'fehler' : 'ausgelassen';
    lauf.status = 'fehler'; lauf.fehler = grund; lauf.beendet = this.jetzt().toISOString();
  }

  private async pruefePlatz(m: Metadaten) {
    try {
      const f = await statfs(this.q.dateiWurzel);
      const frei = f.bavail * f.bsize;
      if (frei < m.groessen.dateienBytes * 1.05 + PLATZ_RESERVE) {
        throw new Fachfehler(507, t('meldungen.wiederherstellung.zu-wenig-platz-fuer', { replace: (frei / GB).toFixed(1).replace('.', ','), replace2: (m.groessen.dateienBytes / GB).toFixed(1).replace('.', ',') }));
      }
    } catch (e) { if (e instanceof Fachfehler) throw e; }
  }

  /** Der eigentliche Ablauf. Bei Probe: nie umschalten, immer aufräumen. */
  private async fuehreAus(lauf: Wiederherstellungslauf, a: Abgleich, k: Buffer, art: 'frisch' | 'laufend' | 'probe'): Promise<boolean> {
    const m = a.meta;
    const stempel = `${this.jetzt().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomBytes(3).toString('hex')}`;
    const schema = `${STAGING}${stempel}`;
    const staging = join(this.q.dateiWurzel, `.wiederherstellung-${stempel}`);
    const probe = art === 'probe';
    let neu: postgres.Sql | null = null;
    let w: Writable | null = null;
    let schluesselZurueck: (() => Promise<void>) | null = null;
    let behalten = false;
    let aktuell: string | null = null;
    const schritt = (name: string) => { aktuell = name; this.schritt(lauf, name, 'laeuft'); };
    const ok = (info?: string) => { if (aktuell) this.schritt(lauf, aktuell, 'ok', info); };
    try {
      if (art === 'laufend' && !this.q.tresor.alsText()) {
        // Ohne (passenden) Schlüssel lässt sich der jetzige Stand nicht sichern – z. B. wenn er verloren ist.
        // Dann bleibt das alte Schema nach dem Umschalten noch eine Weile in der Datenbank.
        behalten = true;
        this.schritt(lauf, t('meldungen.wiederherstellung.sicherung-des-jetzigen-stands'), 'hinweis', t('meldungen.wiederherstellung.nicht-moeglich-diese-installation', { BEHALTEN_TAGE }));
      } else if (art === 'laufend') {
        schritt(t('meldungen.wiederherstellung.sicherung-des-jetzigen-stands'));
        const { fertig } = await this.q.sicherung.starte('vor-wiederherstellung', lauf.von);
        const vorher = await fertig;
        if (!vorher) throw new Error(`Die Sicherung des jetzigen Stands ist fehlgeschlagen: ${this.q.sicherung.aktuellerLauf()?.fehler ?? 'unbekannt'}. Ohne sie wird nichts ersetzt.`);
        ok(vorher.datei);
      }

      schritt(t('meldungen.wiederherstellung.pruefsumme-der-datei'));
      const pfad = join(this.q.sicherung.ordner, m.datei);
      lauf.gesamt = (await stat(pfad)).size;
      const sha = await sha256Von(pfad, (n) => { lauf.bytes = n; });
      if (sha !== m.sha256) throw new Error('Die Prüfsumme der Sicherungsdatei stimmt nicht mit den Metadaten überein – die Datei ist verändert oder beschädigt.');
      ok('unverändert');

      schritt(t('meldungen.wiederherstellung.entschluesseln-und-einspielen'));
      await this.q.sql.unsafe(`CREATE SCHEMA ${bezeichner(schema)}`);
      neu = postgres(this.q.url, { max: 1, onnotice: () => {}, infer: true, connection: { search_path: schema } });
      await neu.unsafe(`SET search_path TO ${bezeichner(schema)}`);
      // Schema auf den Stand der Sicherung bringen: genau ihre Migrationen.
      await neu.begin(async (tx) => {
        await tx`CREATE TABLE schema_migrationen (name text PRIMARY KEY, ausgefuehrt timestamptz NOT NULL DEFAULT now())`;
        for (const datei of m.migrationen) {
          await tx.unsafe(await readFile(join(this.q.migrationen, datei), 'utf8'));
          await tx`INSERT INTO schema_migrationen (name) VALUES (${datei})`;
        }
      });
      // Was die Migrationen selbst angelegt haben (z. B. den Mandanten), kommt aus der Sicherung.
      const leeren = (await neu`SELECT tablename FROM pg_tables WHERE schemaname = ${schema} AND tablename <> 'schema_migrationen'`).map((r) => bezeichner(r.tablename as string));
      if (leeren.length) await neu.unsafe(`TRUNCATE ${leeren.join(', ')} CASCADE`);
      if (!probe) await mkdir(staging, { recursive: true });
      let tabellen = 0; let dateien = 0; let stichprobe = 0; let iDatei = 0; let endeTabellen: number | null = null; let dateienEnde: number | null = null;
      // Ohne Anzahl (schlanke Metadaten, #585) jede Datei prüfen.
      const jede = Math.max(1, Math.ceil(m.anzahl.dateien / 20));
      let zaehlerSicherung: Record<string, number> | null = null;
      // Umgewandelte Fassungen (#577, seit 0.140.1 in der Sicherung): Prüfwert des Inhalts und der in den Angaben.
      const fassungIst = new Map<string, string>(); const fassungSoll = new Map<string, string>();
      // Archivfassungen (#631): ebenso; Angaben „imOriginal“ (das Original ist schon PDF/A) haben keinen eigenen Inhalt.
      const archivIst = new Map<string, string>(); const archivSoll = new Map<string, string>(); const archivOriginal = new Set<string>();
      lauf.bytes = 0;
      for await (const e of liesSicherung(pfad, leiteAb(k, ZWECK), (n) => { lauf.bytes = n; })) {
        if (e.art === 'M') {
          if (e.kopf.haushaltId !== m.haushaltId) throw new Error('Inhalt und Metadaten der Sicherung passen nicht zusammen (Ablage-Id).');
          zaehlerSicherung = (e.kopf.zaehler as Record<string, number>) ?? null;
        } else if (e.art === 'T') {
          const tabelle2 = { name: String(e.kopf.tabelle), spalten: (e.kopf.spalten as string[]).map(String) } as Tabelle;
          if (OHNE_INHALT.has(tabelle2.name)) { for await (const _ of e.daten) { /* übergehen */ } continue; }
          this.schritt(lauf, t('meldungen.wiederherstellung.entschluesseln-und-einspielen'), 'laeuft', t('meldungen.wiederherstellung.tabelle', { name: tabelle2.name }));
          w = await neu.unsafe(`COPY ${bezeichner(schema)}.${bezeichner(tabelle2.name)} (${tabelle2.spalten.map(bezeichner).join(', ')}) FROM STDIN`).writable();
          for await (const c of e.daten) if (!w.write(c)) await once(w, 'drain');
          w.end();
          await once(w, 'finish');
          w = null;
          tabellen++;
        } else if (e.art === 'D') {
          const rel = String(e.kopf.pfad);
          if (!istSicherer(rel)) throw new Error(`Ungültiger Dateipfad in der Sicherung: ${rel}`);
          const pruefen = iDatei++ % jede === 0;
          const name = rel.split('/').pop()!;
          const fassung = FASSUNG_PFAD.exec(rel) ?? ARCHIV_PFAD.exec(rel);
          const istArchiv = !!fassung && rel.startsWith('archivfassungen/');
          const h = pruefen && /^[0-9a-f]{64}$/.test(name) ? createHash('sha256') : null;
          // Fassungen und Archivfassungen immer ganz prüfen: Inhalt gegen den Prüfwert in ihren Angaben (.json).
          const hf = fassung?.[2] === 'fassung' ? createHash('sha256') : null;
          const angaben: Buffer[] | null = fassung?.[2] === 'json' ? [] : null;
          // Streamen statt puffern: auch große Dokumente brauchen kaum Arbeitsspeicher.
          let ausgabe: Writable | null = null;
          if (!probe) {
            const ziel = join(staging, m.haushaltId, ...rel.split('/'));
            await mkdir(dirname(ziel), { recursive: true });
            ausgabe = createWriteStream(ziel, { flags: 'wx', flush: true });
            w = ausgabe;
          }
          for await (const c of e.daten) {
            h?.update(c); hf?.update(c);
            if (angaben && angaben.length < 64) angaben.push(c);
            if (ausgabe && !ausgabe.write(c)) await once(ausgabe, 'drain');
          }
          if (ausgabe) { ausgabe.end(); await once(ausgabe, 'close'); w = null; }
          if (h) {
            if (h.digest('hex') !== name) throw new Error(`Die Datei ${rel} in der Sicherung ist beschädigt (Prüfwert stimmt nicht).`);
            stichprobe++;
          }
          if (hf) (istArchiv ? archivIst : fassungIst).set(fassung![1], hf.digest('hex'));
          if (angaben) {
            let soll = ''; let imOriginal = false;
            try { const j = JSON.parse(Buffer.concat(angaben).toString('utf8')) as { sha256?: unknown; imOriginal?: unknown }; soll = String(j.sha256 ?? ''); imOriginal = j.imOriginal === true; } catch { /* unlesbar */ }
            (istArchiv ? archivSoll : fassungSoll).set(fassung![1], soll);
            if (istArchiv && imOriginal) archivOriginal.add(fassung![1]);
          }
          dateien++;
        } else if (e.art === 'E') {
          endeTabellen = Number(e.kopf.tabellen);
          dateienEnde = Number(e.kopf.dateien);
        }
      }
      // Erst hier ist der GCM-Prüfwert geprüft: Die Datei ist echt und vollständig.
      if (endeTabellen === null || tabellen !== endeTabellen || tabellen !== m.anzahl.tabellen) throw new Error(`Die Sicherung ist unvollständig: ${tabellen} Tabellen eingespielt, erwartet ${m.anzahl.tabellen}.`);
      // Fassung und Angaben gehören zusammen. Passt ein Paar nicht (z. B. während der Sicherung neu umgewandelt), kommt
      // es nicht mit: Das Paket wandelt die Datei dann neu um (wie bei einer Sicherung ohne Fassungen).
      let fassungen = 0; let fassungenOhne = 0;
      for (const sha of new Set([...fassungIst.keys(), ...fassungSoll.keys()])) {
        if (fassungIst.has(sha) && fassungIst.get(sha) === fassungSoll.get(sha)) { fassungen++; continue; }
        fassungenOhne++;
        log.warn('Umgewandelte Fassung in der Sicherung unvollständig – nicht übernommen', { datei: sha });
        if (!probe) for (const endung of ['json', 'fassung']) await rm(join(staging, m.haushaltId, 'fassungen', sha.slice(0, 2), `${sha}.${endung}`), { force: true });
      }
      let archiv = 0; let archivOhne = 0;
      for (const sha of new Set([...archivIst.keys(), ...archivSoll.keys()])) {
        // „Original ist schon PDF/A“: nur Angaben, ihr Prüfwert ist der des Originals.
        if (archivOriginal.has(sha) && !archivIst.has(sha) && archivSoll.get(sha) === sha) { archiv++; continue; }
        if (archivIst.has(sha) && archivIst.get(sha) === archivSoll.get(sha)) { archiv++; continue; }
        archivOhne++;
        log.warn('Archivfassung in der Sicherung unvollständig – nicht übernommen', { datei: sha });
        if (!probe) for (const endung of ['json', 'fassung']) await rm(join(staging, m.haushaltId, 'archivfassungen', sha.slice(0, 2), `${sha}.${endung}`), { force: true });
      }
      ok(t('meldungen.wiederherstellung.tabellen-dateien', { tabellen, dateien, wert: fassungen ? t('meldungen.wiederherstellung.umgewandelte-fassungen', { anzahl: fassungen }) : '', wert2: fassungenOhne ? t('meldungen.wiederherstellung.unvollstaendig-nicht-uebernommen', { fassungenOhne }) : '', wert3: archiv ? t('meldungen.wiederherstellung.archivfassungen-pdf-a', { anzahl: archiv }) : '', wert4: archivOhne ? t('meldungen.wiederherstellung.unvollstaendig-nicht-uebernommen-2', { archivOhne }) : '', wert5: stichprobe ? t('meldungen.wiederherstellung.pruefwerte-von-dateien-nachgerechnet', { stichprobe }) : '' }));
      // Zähler der Sequenzen nachziehen.
      for (const r of await neu`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ${schema} AND column_default LIKE 'nextval(%'`) {
        const t = `${bezeichner(schema)}.${bezeichner(r.table_name as string)}`;
        await neu.unsafe(`SELECT setval(pg_get_serial_sequence('${t.replace(/'/g, "''")}', '${String(r.column_name).replace(/'/g, "''")}'), coalesce((SELECT max(${bezeichner(r.column_name as string)}) FROM ${t}), 0) + 1, false)`);
      }
      // Statistik der eingespielten Tabellen (#367): COPY füllt sie, ANALYZE erst macht sie dem Planer bekannt.
      try {
        for (const r of await neu`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema} AND table_type = 'BASE TABLE'`) {
          const spalten = STATISTIK_SPALTEN[r.table_name as string];
          await neu.unsafe(`ANALYZE ${bezeichner(schema)}.${bezeichner(r.table_name as string)}${spalten ? ` (${spalten})` : ''}`);
        }
      } catch { /* nur Leistung: der Autovacuum-Dienst holt es später nach */ }

      schritt(t('meldungen.wiederherstellung.pruefwort'));
      const [pw] = await neu`SELECT wert FROM einstellungen WHERE schluessel = 'pruefwort' LIMIT 1`;
      if (!pw) this.schritt(lauf, t('meldungen.wiederherstellung.pruefwort'), 'hinweis', t('meldungen.wiederherstellung.die-sicherung-enthaelt-noch'));
      else if (!istPruefwort(entschluesseleMit(k, String(pw.wert)))) throw new Error('Das Prüfwort lässt sich mit diesem Schlüssel nicht lesen – der Schlüssel passt nicht zu den Daten.');
      else ok(t('meldungen.wiederherstellung.mit-dem-schluessel-lesbar'));

      schritt(t('meldungen.wiederherstellung.anzahl-mappen-dokumente-benutzer'));
      const n = async (t: string) => Number((await neu!.unsafe(`SELECT count(*)::int AS n FROM ${bezeichner(schema)}.${bezeichner(t)}`))[0].n);
      const ist = { mappen: await n('mappen'), dokumente: await n('dokumente'), benutzer: await n('benutzer') };
      const soll = zaehlerSicherung ?? m.anzahl;
      const abw = (['mappen', 'dokumente', 'benutzer'] as const).filter((x) => ist[x] !== Number(soll[x]));
      if (abw.length) throw new Error(`Die Anzahl stimmt nicht: ${abw.map((x) => `${x} ${ist[x]} statt ${soll[x]}`).join(', ')}.`);
      // Kopie außer Haus mit schlanken Metadaten (#585): Anzahl aus dem Endeintrag der Sicherung (dateienEnde).
      const dateienSoll = m.anzahl.dateien >= 0 ? m.anzahl.dateien : dateienEnde;
      if (dateienSoll !== dateien) throw new Error(`Die Anzahl der Dateien stimmt nicht: ${dateien} statt ${dateienSoll ?? 'unbekannt'}.`);
      ok(t('meldungen.wiederherstellung.mappen-dokumente-benutzer', { mappen: ist.mappen, dokumente: ist.dokumente, benutzer: ist.benutzer }));

      schritt(t('meldungen.wiederherstellung.auf-den-heutigen-stand'));
      const vorher = m.migrationen.length;
      await migriere(neu, this.q.migrationen, () => {});
      const nachher = Number((await neu`SELECT count(*)::int AS n FROM schema_migrationen`)[0].n);
      ok(nachher > vorher ? t('meldungen.wiederherstellung.aenderungen-ausgefuehrt', { wert: nachher - vorher }) : t('meldungen.wiederherstellung.schon-aktuell'));
      // Automatisierungen (#674): nach einer Wiederherstellung vorhanden, aber angehalten, bis ein Admin sie einschaltet.
      if (!probe) await neu`UPDATE automatisierungen SET angehalten = ${neu.json({ grund: 'wiederherstellung', text: 'Angehalten nach einer Wiederherstellung. Prüfe die Automatisierung und schalte sie wieder ein.', zeit: new Date().toISOString() })}
        WHERE aktiv AND angehalten IS NULL`;

      // Erweiterungen (#562): Fehlt pg_trgm oder unaccent, läuft die Suche nach dem Umschalten schlechter – das soll
      // vorher sichtbar sein, nicht still passieren. Die Daten sind trotzdem vollständig, daher nur ein Hinweis.
      schritt(ERWEITERUNGEN_SCHRITT);
      const erweiterungen = await liesErweiterungen(this.q.sql);
      const mitTrgm = erweiterungen.some((e) => e.name === 'pg_trgm' && e.zustand !== 'fehlt');
      const indizes = mitTrgm ? await trigrammIndizes(neu, schema) : [];
      const fehlt = [
        ...problemeAus(erweiterungen).map(beschreibe),
        ...(mitTrgm ? TRIGRAMM_INDEXNAMEN.filter((n) => !indizes.includes(n)).map((n) => t('meldungen.wiederherstellung.trigramm-index-fehlt', { n })) : []),
      ];
      if (fehlt.length) {
        const text = `${fehlt.join('; ')}. Die Daten sind vollständig; Abhilfe steht unter Werkbank → Systemzustand.`;
        this.schritt(lauf, ERWEITERUNGEN_SCHRITT, 'hinweis', text);
        a.hinweise.push(t('meldungen.wiederherstellung.erweiterungen-der-datenbank-2', { text }));
        log.warn('Erweiterungen der Datenbank unvollständig', { probe, fehlt: fehlt.join('; ') });
      } else ok(t('meldungen.wiederherstellung.pg-trgm-und-unaccent'));

      if (probe) {
        schritt(t('meldungen.wiederherstellung.aufraeumen'));
        await neu.end(); neu = null;
        await this.q.sql.unsafe(`DROP SCHEMA ${bezeichner(schema)} CASCADE`);
        ok();
        lauf.status = 'fertig'; lauf.beendet = this.jetzt().toISOString();
        await this.merkeProbe(lauf.sicherung, true, lauf.schritte.map((s) => `${s.name}: ${s.info ?? s.status}`).join('; '));
        log.info('Probe-Wiederherstellung erfolgreich', { sicherung: lauf.sicherung, mappen: ist.mappen, dateien });
        return true;
      }

      // Abschlussmeldung und Ende des Wartungsmodus stehen schon in der neuen Datenbank.
      const hinweise = [...a.hinweise.filter((h) => !/Notfallblatt ein/.test(h))];
      const abschluss: Abschluss = { am: this.jetzt().toISOString(), sicherung: lauf.sicherung, von: lauf.von, schritte: [], hinweise };
      const setze = async (k2: string, w: unknown) => {
        await neu!`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${m.haushaltId}, ${k2}, ${neu!.json(w as postgres.JSONValue)})
          ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
      };
      await neu`DELETE FROM einstellungen WHERE schluessel = 'wartung'`;
      // Ereignisse (#670) aus der Zeit vor der Sicherung nicht noch einmal verteilen.
      const [{ da }] = await neu<{ da: string | null }[]>`SELECT to_regclass('ereignisse')::text AS da`;
      if (da) await neu`UPDATE ereignisse SET verteilt = now() WHERE verteilt IS NULL`;

      schritt(t('meldungen.wiederherstellung.dateien-uebernehmen'));
      let uebernommen = 0; let schonDa = 0;
      for (const d of await readdir(staging, { recursive: true, withFileTypes: true })) {
        if (!d.isFile()) continue;
        const quelle = join(d.parentPath ?? (d as unknown as { path: string }).path, d.name);
        const rel = quelle.slice(staging.length + 1);
        const ziel = join(this.q.dateiWurzel, rel);
        // Gleicher Prüfwert = gleicher Inhalt. Nicht bei Fassungen (#577): Ihr Name ist der Prüfwert des Originals – die
        // aus der Sicherung ersetzt eine inzwischen anders umgewandelte, damit alles so dasteht wie damals.
        // Archivfassungen, ihr Stand und die Wortpositionen (#631) ebenso.
        const innen = rel.split(sep).slice(1).join('/');
        const istFassung = FASSUNG_PFAD.test(innen) || ARCHIV_PFAD.test(innen) || WOERTER_PFAD.test(innen);
        if (!istFassung && await stat(ziel).then(() => true, () => false)) { schonDa++; continue; }
        await mkdir(dirname(ziel), { recursive: true });
        await rename(quelle, ziel);
        uebernommen++;
      }
      await rm(staging, { recursive: true, force: true });
      ok(t('meldungen.wiederherstellung.neu-schon-vorhanden', { uebernommen, schonDa }));

      // Die Schlüsseldatei erst ganz zum Schluss – und bei jedem späteren Fehler wieder zurück.
      schritt(t('meldungen.wiederherstellung.schluesseldatei'));
      const datei = this.q.tresor.datei;
      const schluesselText = k.toString('base64url');
      const vorhanden = await readFile(datei, 'utf8').then((t) => t.trim(), () => null);
      if (vorhanden !== schluesselText) {
        const alteDatei = vorhanden !== null ? `${datei}.alt-${stempel}` : null;
        if (alteDatei) await rename(datei, alteDatei);
        schluesselZurueck = async () => { await rm(datei, { force: true }); if (alteDatei) await rename(alteDatei, datei); };
        await mkdir(dirname(datei), { recursive: true, mode: 0o700 });
        await writeFile(datei, `${schluesselText}\n`, { mode: 0o600, flag: 'wx' });
        ok(alteDatei ? t('meldungen.wiederherstellung.ersetzt-die-bisherige-liegt', { pop: String(alteDatei.split('/').pop()) }) : 'angelegt');
      } else ok(t('meldungen.wiederherstellung.passt-schon'));

      schritt(t('meldungen.wiederherstellung.umschalten'));
      const altSchema = `${behalten ? BEHALTEN : ALT}${stempel}`;
      if (behalten) abschluss.hinweise.push(t('meldungen.wiederherstellung.der-bisherige-stand-liegt', { BEHALTEN_TAGE, altSchema }));
      abschluss.schritte = lauf.schritte.map((s) => ({ ...s, ...(s.name === 'Umschalten' ? { status: 'ok' as const } : {}) }));
      await setze('wiederherstellung_abschluss', abschluss);
      await neu.end(); neu = null;
      await this.q.sql.begin(async (tx) => {
        await tx.unsafe(`ALTER SCHEMA public RENAME TO ${bezeichner(altSchema)}`);
        await tx.unsafe(`ALTER SCHEMA ${bezeichner(schema)} RENAME TO public`);
      });
      schluesselZurueck = null;
      // Anderer Mandant (#119): seine Id gilt ab dem Neustart.
      if (this.q.mandantUebernehmen && m.haushaltId !== (await this.q.laufzeit()).haushaltId) {
        await this.q.mandantUebernehmen(m.haushaltId);
        log.warn('Ablage-Id der Sicherung übernommen', { mandant: m.haushaltId });
      }
      ok();
      this.schritt(lauf, t('meldungen.wiederherstellung.neustart'), 'laeuft', t('meldungen.wiederherstellung.ablago-startet-neu'));
      lauf.status = 'neustart';
      log.warn('Wiederherstellung abgeschlossen, Ablago startet neu', { sicherung: lauf.sicherung, von: lauf.von, mappen: ist.mappen, dateien });
      setTimeout(() => this.q.neustart(), 1500).unref?.();
      return true;
    } catch (e) {
      const grund = (e as Error).message;
      log.error(probe ? 'Probe-Wiederherstellung fehlgeschlagen' : 'Wiederherstellung abgebrochen – der bisherige Stand ist unverändert', { sicherung: lauf.sicherung, schritt: aktuell, grund });
      // Erst aufräumen, dann „fehlgeschlagen“ melden: Wer auf das Ende wartet, sieht den alten Stand.
      w?.destroy(e as Error);
      await neu?.end({ timeout: 5 }).catch(() => {});
      if (schluesselZurueck) await schluesselZurueck().catch((x) => log.error('Bisherige Schlüsseldatei nicht zurückgelegt', { fehler: (x as Error).message }));
      await this.q.sql.unsafe(`DROP SCHEMA IF EXISTS ${bezeichner(schema)} CASCADE`).catch((x) => log.warn("Bereich der Wiederherstellung nicht entfernt", { schema, fehler: (x as Error).message }));
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      if (probe) await this.merkeProbe(lauf.sicherung, false, grund);
      this.fehlschlag(lauf, aktuell, grund);
      return false;
    }
  }

  /* ---------- Probe (#109): Ergebnisse, Zeitplan, Ampel ---------- */

  private async merkeProbe(name: string, ok: boolean, info: string) {
    const e = this.q.sicherung.einstellungen;
    const alle = ((await e.lies('sicherung_proben')) as Record<string, unknown> | null) ?? {};
    const eintrag = { am: this.jetzt().toISOString(), ok, info: info.slice(0, 1000) };
    await e.schreibe('sicherung_proben', { ...alle, [name]: eintrag });
    await e.schreibe('sicherung_probe_letzte', { name, ...eintrag });
    if (!ok) {
      const vorfall = `probe:${eintrag.am}`;
      if ((await e.lies('sicherung_probe_gemeldet')) !== vorfall) {
        await e.schreibe('sicherung_probe_gemeldet', vorfall);
        try { await this.q.anAdmins?.(() => t('meldungen.wiederherstellung.ablago-probe-wiederherstellung'), () => t('meldungen.wiederherstellung.die-probeweise-wiederherstellung-der', { name, info })); }
        catch (x) { log.warn('Mail zur Probe nicht verschickt', { fehler: (x as Error).message }); }
      }
    }
  }

  /** Jede Minute: fällige Probe starten (Standard sonntags 04:00). */
  async tick(): Promise<'gestartet' | 'nichts'> {
    const plan = await this.q.sicherung.probePlan();
    if (!plan.aktiv || this.q.wartungAktiv() || this.laeuft() || this.q.sicherung.laeuft()) return 'nichts';
    // Zeitplan-Baustein (#724): am gewählten Wochentag zur Uhrzeit, verpasst noch am selben Tag.
    const tage = await laufeFaellige(einstellungsMerker(this.q.sicherung.einstellungen, 'sicherung_probe_zuletzt'), ortszeit(this.jetzt()),
      { uhrzeit: plan.uhrzeit, an: (tag) => wochentagVon(tag) === plan.wochentag }, async () => {});
    if (!tage.length) return 'nichts';
    if (!(await this.q.sicherung.liste()).some((x) => x.meta)) return 'nichts';
    if (!(await this.q.sicherung.genugPlatz())) { log.warn('Probe-Wiederherstellung nicht begonnen: zu wenig freier Speicherplatz'); return 'nichts'; }
    try { await this.starteProbe(null, 'Zeitplan'); return 'gestartet'; } catch (x) { log.warn('Probe-Wiederherstellung nicht begonnen', { grund: (x as Error).message }); return 'nichts'; }
  }

  /** Nach einem Neustart: Reste abgebrochener Läufe und das alte Schema entfernen. */
  async raeumeAuf() {
    for (const r of await this.q.sql`SELECT nspname FROM pg_namespace WHERE nspname LIKE ${`${STAGING}%`} OR nspname LIKE ${`${ALT}%`}`) {
      const name = r.nspname as string;
      if (name.startsWith(BEHALTEN)) {
        // Ohne vorherige Sicherung: 7 Tage aufheben (Zeitstempel JJJJMMTTHHMMSS im Namen).
        const z = /^(\d{4})(\d{2})(\d{2})/.exec(name.slice(BEHALTEN.length));
        const alter = z ? this.jetzt().getTime() - Date.UTC(Number(z[1]), Number(z[2]) - 1, Number(z[3])) : Infinity;
        if (alter < BEHALTEN_TAGE * 24 * 3600 * 1000) continue;
      }
      await this.q.sql.unsafe(`DROP SCHEMA ${bezeichner(r.nspname as string)} CASCADE`).catch((e) => log.warn('Altes Schema nicht entfernt', { schema: r.nspname, fehler: (e as Error).message }));
      log.info('Bereich einer früheren Wiederherstellung entfernt', { schema: r.nspname });
    }
    for (const n of await readdir(this.q.dateiWurzel).catch(() => [] as string[])) {
      if (n.startsWith('.wiederherstellung-')) await rm(join(this.q.dateiWurzel, n), { recursive: true, force: true });
    }
  }
}

/** Neue Verbindung mit gleicher URL (für Tests). */
export const neueVerbindung = (url: string) => verbinde(url);
