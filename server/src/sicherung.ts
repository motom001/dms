import { oeffneStrom } from './dateispeicher';
import { mkdir, open, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { OHNE_INHALT, type Datenquelle, type Zaehler } from './datenbankabzug';
import type { Einstellungen } from './einstellungen';
import { FASSUNG_PFAD } from './dateiumwandlung';
import { ARCHIV_PFAD } from './archivfassung';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { einstellungsMerker, laufeFaellige, wochentagVon } from './zeitplan';
import { schreibeSicherung, sha256Von, ZWECK, type Eintrag } from './sicherungsformat';
import { aufVolume, geraetVon } from './tresor';
import type { EreignisAufruf } from './volltext';
import { zeitzone } from '../../shared/src/region';
import { t } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';
import { GB, MB, STUECK_MAX } from './grenzen';
import type { Abrufbar } from './http/teilabruf';

/**
 * Sicherungen (#103–#105): Datenbank und Dateien zum selben Zeitpunkt, verschlüsselt mit dem
 * Schlüssel der Werkbank, dazu Metadaten als lesbares JSON. Zeitplan, Aufbewahrung, Speicherplatz
 * und Hinweise bei Problemen.
 */

const log = protokoll.modul('sicherung');
export const STANDARD_ORDNER = '/data/sicherung';
export const ENDUNG = '.dms-sicherung';
const TAG_MS = 24 * 60 * 60 * 1000;
/** Ab hier gilt die letzte erfolgreiche Sicherung als zu alt (#105). */
export const ZU_ALT_TAGE = 2;

export type Sicherungsart = 'manuell' | 'automatisch' | 'vor-wiederherstellung';

export interface Umgebung { dms: string; datenbankStand: string | null; postgres: string; node: string; system: string; architektur: string }

/** Inhalt der Datei <name>.json – für Menschen lesbar, ohne den Schlüssel. */
export interface Metadaten {
  format: number;
  datei: string;
  haushaltId: string;
  umgebung: Umgebung;
  art: Sicherungsart;
  ausgeloestVon: string;
  beginn: string; ende: string; dauerSekunden: number;
  /** fassungen (seit 0.140.1, #577): umgewandelte Fassungen von Paketen; zählen auch in `dateien` (je zwei Dateien). */
  anzahl: Zaehler & { dateien: number; tabellen: number; fassungen?: number; /** Archivfassungen (PDF/A, #631, seit 0.149.0). */ archivfassungen?: number };
  groessen: { datenbankBytes: number; dateienBytes: number; sicherungBytes: number };
  verschluesselung: { verfahren: string; fingerabdruck: string };
  sha256: string;
  migrationen: string[];
}

export interface Plan {
  aktiv: boolean;
  /** HH:MM */
  uhrzeit: string;
  haeufigkeit: 'taeglich' | 'woechentlich';
  /** 1 = Montag … 7 = Sonntag (bei wöchentlich). */
  wochentag: number;
  aufbewahrung: { taeglich: number; woechentlich: number; monatlich: number };
  /** Unter so viel freiem Platz beginnt keine Sicherung. */
  mindestFreiGB: number;
  /** Seit wann der Zeitplan an ist (für „noch nie gesichert“). */
  aktivSeit: string | null;
  /**
   * Lokal nur die neueste automatische Sicherung behalten (#585) – für knappen Platz, wenn eine Kopie außer Haus
   * entsteht. „Lokal keine“ gibt es bewusst nicht: Jede Wiederherstellung hinge sonst am externen Speicher.
   */
  nurNeueste: boolean;
}
export const PLAN_STANDARD: Plan = { aktiv: false, uhrzeit: '02:00', haeufigkeit: 'taeglich', wochentag: 7, aufbewahrung: { taeglich: 7, woechentlich: 4, monatlich: 12 }, mindestFreiGB: 1, aktivSeit: null, nurNeueste: false };

/* ---------- Sicherung außer Haus (#585) ---------- */

/**
 * Was ein Paket mit `dms:sicherung-lesen` über eine Sicherung erfährt – und was es neben die Datei auf das Ziel legt
 * (`<name>.json`). Bewusst ohne Person (ausgeloestVon), Umgebung (Versionen, System), Zähler und Ablage-Id.
 * Die Wiederherstellung kommt damit aus: Was fehlt, steht verschlüsselt im Kopf der Sicherung (#585).
 */
export interface SchlankeMetadaten {
  format: number; schlank: true; datei: string; groesse: number; sha256: string; beginn: string;
  verschluesselung: { verfahren: string; fingerabdruck: string };
}
export const schlankeMetadaten = (m: Metadaten): SchlankeMetadaten => ({
  format: m.format, schlank: true, datei: m.datei, groesse: m.groessen.sicherungBytes, sha256: m.sha256, beginn: m.beginn,
  verschluesselung: { verfahren: m.verschluesselung.verfahren, fingerabdruck: m.verschluesselung.fingerabdruck },
});
export const istSchlank = (x: unknown): x is SchlankeMetadaten => !!x && typeof x === 'object' && (x as { schlank?: unknown }).schlank === true;

/** Stand der Kopie außer Haus je Sicherung und Paket: Rückmeldung des Pakets (#585). */
export type ExternStatus = 'offen' | 'laeuft' | 'hochgeladen' | 'geprueft' | 'fehlgeschlagen';
/**
 * Wie das Paket die Kopie am Ziel geprüft hat: pruefsumme (SHA-256 vom Ziel bestätigt oder vollständig zurückgelesen),
 * stichprobe (Größe und Stichproben zurückgelesen), groesse (nur die Größe – z. B. Ziel ohne Lesezugriff), keine.
 */
export type ExternPruefung = 'pruefsumme' | 'stichprobe' | 'groesse' | 'keine';
export interface ExternStand {
  status: ExternStatus; pruefung?: ExternPruefung; grund?: string;
  /** Hilft eine Wiederholung nicht (Prüfsumme falsch, Anmeldung abgelehnt, aufgegeben)? Dann E-Mail. */
  endgueltig?: boolean;
  /** Ziel in Worten, vom Paket (ohne Zugangsdaten), z. B. „WebDAV https://cloud.example.org/…/DMS“. */
  ziel?: string;
  bytes?: number; gesamt?: number;
  /** Ereignis angelegt; letzte Rückmeldung. */
  seit: string; am: string;
}
/** Ein Paket, das Sicherungen außer Haus kopiert, mit der bestätigten Adresse aus seinen Einstellungen. */
export interface Sicherungsziel { id: string; name: string; adresse: string | null; ziel?: string | null }
/** Verbindung zu den Paketen (index.ts): Pakete mit dms:sicherung-lesen und das Ereignis sicherung.fertig. */
export interface ExternAnbindung {
  pakete(): Promise<Array<{ id: string; name: string; adresse: string | null }>>;
  melde(daten: SchlankeMetadaten & { name: string }): Promise<void>;
}
export { STUECK_MAX };
const EXTERN_STATUS: ExternStatus[] = ['laeuft', 'hochgeladen', 'geprueft', 'fehlgeschlagen'];
const EXTERN_PRUEFUNG: ExternPruefung[] = ['pruefsumme', 'stichprobe', 'groesse', 'keine'];
const erfolgreich = (s: ExternStand) => s.status === 'hochgeladen' || s.status === 'geprueft';
/** Zugangsdaten aus einer Adresse im Text entfernen (https://benutzer:passwort@host → https://host). */
export const ohneZugangsdaten = (t: string) => t.replace(/(\w+:\/\/)[^/@\s]*@/g, '$1');

export interface Lauf {
  art: 'sicherung' | 'pruefsumme';
  titel: string;
  status: 'laeuft' | 'fertig' | 'fehler';
  schritt: string;
  bytes: number;
  gesamt: number;
  gestartet: string;
  beendet?: string;
  fehler?: string;
  ergebnis?: unknown;
}

export interface Probeergebnis { am: string; ok: boolean; info: string }
/**
 * schlank (#585): Statt der vollständigen Metadaten liegt nur die schlanke Fassung daneben (z. B. vom externen Ziel
 * zurückgeholt); die Wiederherstellung liest den Rest mit dem Schlüssel aus der Sicherung selbst.
 * extern: Stand der Kopie außer Haus je Paket.
 */
export interface Eintragsliste { name: string; meta: Metadaten | null; schlank?: SchlankeMetadaten; bytes: number; pruefung?: { am: string; ok: boolean }; probe?: Probeergebnis; extern?: Record<string, ExternStand> }

/** Zeitplan der Probe-Wiederherstellung (#109), Standard sonntags 04:00. */
export interface ProbePlan { aktiv: boolean; wochentag: number; uhrzeit: string }
export const PROBE_STANDARD: ProbePlan = { aktiv: true, wochentag: 7, uhrzeit: '04:00' };
/** Ab hier ist die letzte erfolgreiche Probe zu alt (gelb). */
export const PROBE_TAGE = 8;

export interface Fehlerstand { am: string; art: Sicherungsart; grund: string }

export interface SicherungsQuellen {
  tresor: { bereit: boolean; fingerabdruck: string | null; abgeleitet(zweck: string): Buffer | null };
  einstellungen: Einstellungen;
  daten: Datenquelle;
  umgebung(): Promise<Omit<Umgebung, 'datenbankStand' | 'postgres'>>;
  /** Läuft der Wartungsmodus (#102)? Dann pausiert die automatische Sicherung. */
  wartungAktiv?: () => boolean;
  /** Mail an alle Administratoren (#105). */
  anAdmins?: (betreff: import('./mail').MailText, text: import('./mail').MailText) => Promise<void>;
  /** Für Tests: Einhängepunkte. */
  mountinfo?: string;
  jetzt?: () => Date;
}

const teileIn = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('de-DE', { timeZone: zeitzone(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
  .formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;
const WOCHENTAGE: Record<string, number> = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 7 };
/** Datum (JJJJ-MM-TT), Uhrzeit (HH:MM) und Wochentag (1–7) in deutscher Zeit. */
export function ortszeit(d: Date) {
  const t = teileIn(d);
  return { datum: `${t.year}-${t.month}-${t.day}`, uhr: `${t.hour === '24' ? '00' : t.hour}:${t.minute}`, wochentag: WOCHENTAGE[t.weekday.replace('.', '')] ?? 0 };
}
/** ISO-Woche (JJJJ-Www) eines Datums JJJJ-MM-TT. */
export function isoWoche(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`);
  const tag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - tag + 3);
  const jahr = d.getUTCFullYear();
  const erste = new Date(Date.UTC(jahr, 0, 4));
  const woche = 1 + Math.round(((d.getTime() - erste.getTime()) / TAG_MS - 3 + ((erste.getUTCDay() + 6) % 7)) / 7);
  return `${jahr}-W${String(woche).padStart(2, '0')}`;
}

/**
 * Welche automatischen Sicherungen die Aufbewahrung behält (Großvater-Vater-Sohn): je Tag, je
 * ISO-Woche und je Monat die neueste, von den neuesten Tagen/Wochen/Monaten so viele wie eingestellt.
 */
export function behalten(liste: Array<{ name: string; beginn: string }>, a: Plan['aufbewahrung']): Set<string> {
  const neu = [...liste].sort((x, y) => y.beginn.localeCompare(x.beginn));
  const bleibt = new Set<string>();
  const stufe = (schluessel: (datum: string) => string, anzahl: number) => {
    const gesehen = new Set<string>();
    for (const s of neu) {
      const k = schluessel(ortszeit(new Date(s.beginn)).datum);
      if (gesehen.has(k)) continue;
      if (gesehen.size >= anzahl) break;
      gesehen.add(k); bleibt.add(s.name);
    }
  };
  stufe((d) => d, a.taeglich);
  stufe(isoWoche, a.woechentlich);
  stufe((d) => d.slice(0, 7), a.monatlich);
  return bleibt;
}

export function bereinigePlan(e: unknown, alt: Plan = PLAN_STANDARD): Plan {
  const x = (e ?? {}) as Record<string, unknown>;
  const zahl = (v: unknown, std: number, min: number, max: number) => {
    if (v === undefined || v === null || v === '') return std;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Fachfehler(422, t('meldungen.sicherung.bitte-eine-zahl-zwischen', { min, max }));
    return Math.trunc(n);
  };
  const uhrzeit = x.uhrzeit === undefined ? alt.uhrzeit : String(x.uhrzeit);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new Fachfehler(422, t('meldungen.sicherung.die-uhrzeit-bitte-als'));
  const haeufigkeit = x.haeufigkeit === undefined ? alt.haeufigkeit : x.haeufigkeit === 'woechentlich' ? 'woechentlich' : x.haeufigkeit === 'taeglich' ? 'taeglich' : null;
  if (!haeufigkeit) throw new Fachfehler(422, t('meldungen.sicherung.haeufigkeit-taeglich-oder'));
  const a = (x.aufbewahrung ?? {}) as Record<string, unknown>;
  return {
    aktiv: x.aktiv === undefined ? alt.aktiv : x.aktiv === true,
    uhrzeit, haeufigkeit,
    wochentag: zahl(x.wochentag, alt.wochentag, 1, 7),
    aufbewahrung: {
      taeglich: zahl(a.taeglich, alt.aufbewahrung.taeglich, 0, 366),
      woechentlich: zahl(a.woechentlich, alt.aufbewahrung.woechentlich, 0, 260),
      monatlich: zahl(a.monatlich, alt.aufbewahrung.monatlich, 0, 240),
    },
    mindestFreiGB: zahl(x.mindestFreiGB, alt.mindestFreiGB, 0, 100_000),
    aktivSeit: typeof x.aktivSeit === 'string' ? x.aktivSeit : alt.aktivSeit ?? null,
    nurNeueste: x.nurNeueste === undefined ? alt.nurNeueste ?? false : x.nurNeueste === true,
  };
}

/** Alle Dateien unter einem Ordner, mit Pfad relativ zum Ordner (Trennzeichen „/“). */
export async function* dateienUnter(wurzel: string): AsyncGenerator<{ pfad: string; voll: string; groesse: number }> {
  let eintraege;
  try { eintraege = await readdir(wurzel, { withFileTypes: true, recursive: true }); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  const liste = eintraege.filter((d) => d.isFile() && !d.name.endsWith('.tmp'))
    .map((d) => join(d.parentPath ?? (d as unknown as { path: string }).path, d.name)).sort();
  for (const voll of liste) {
    const s = await stat(voll).catch(() => null);
    if (!s?.isFile()) continue; // inzwischen gelöscht
    yield { pfad: relative(wurzel, voll).split(sep).join('/'), voll, groesse: s.size };
  }
}

export class Sicherung {
  private lauf: Lauf | null = null;
  private zeitgeber?: NodeJS.Timeout;
  private jetzt: () => Date;
  /** Läuft gerade eine Wiederherstellung (#107)? Dann keine Sicherung (außer der davor). */
  sperre: () => boolean = () => false;
  /** Pakete, die jede Sicherung außer Haus kopieren (#585); null = keine Pakete eingerichtet (Tests, frühe Startphase). */
  extern: ExternAnbindung | null = null;

  constructor(
    /** Ordner der Sicherungen (eigenes Volume). */
    readonly ordner: string,
    /** Wurzel der Dateien (/data/files) und Haushalt: gesichert wird <wurzel>/<haushalt>. */
    readonly dateiWurzel: string,
    readonly haushaltId: string,
    private q: SicherungsQuellen,
  ) {
    this.jetzt = q.jetzt ?? (() => new Date());
  }

  get dateiOrdner() { return join(this.dateiWurzel, this.haushaltId); }
  get einstellungen() { return this.q.einstellungen; }
  aktuellerLauf(): Lauf | null { return this.lauf ? { ...this.lauf } : null; }
  laeuft() { return this.lauf?.status === 'laeuft'; }

  /** Ein einziger Lauf zur Zeit (Sicherung, Prüfung, später Wiederherstellung). */
  belege(art: Lauf['art'], titel: string): Lauf {
    if (this.laeuft()) throw new Fachfehler(409, t('meldungen.sicherung.es-laeuft-bereits-bitte', { titel: this.lauf!.titel }));
    if (titel !== 'Sicherung vor der Wiederherstellung' && this.sperre()) throw new Fachfehler(409, t('meldungen.sicherung.gerade-laeuft-eine-wiederherstellung'));
    this.lauf = { art, titel, status: 'laeuft', schritt: 'Vorbereiten', bytes: 0, gesamt: 0, gestartet: this.jetzt().toISOString() };
    return this.lauf;
  }

  /* ---------- Einstellungen ---------- */

  async plan(): Promise<Plan> {
    const g = await this.q.einstellungen.lies('sicherung_plan');
    try { return g ? bereinigePlan(g) : { ...PLAN_STANDARD }; } catch { return { ...PLAN_STANDARD }; }
  }

  async speicherePlan(e: unknown, von: string): Promise<Plan> {
    const alt = await this.plan();
    const neu = bereinigePlan({ ...(e as object), aktivSeit: undefined }, alt);
    neu.aktivSeit = neu.aktiv ? (alt.aktiv ? alt.aktivSeit : this.jetzt().toISOString()) : null;
    if (neu.aktiv && !alt.aktiv && !(await this.notfallblatt()).aktuell) {
      throw new Fachfehler(409, t('meldungen.sicherung.die-automatische-sicherung-laesst'));
    }
    await this.q.einstellungen.schreibe('sicherung_plan', neu);
    log.info('Zeitplan der Sicherung geändert', { von, ...neu });
    return neu;
  }

  async probePlan(): Promise<ProbePlan> {
    const g = (await this.q.einstellungen.lies('sicherung_probe_plan')) as Partial<ProbePlan> | null;
    return { ...PROBE_STANDARD, ...(g ?? {}) };
  }

  async speichereProbePlan(e: unknown, von: string): Promise<ProbePlan> {
    const x = (e ?? {}) as Record<string, unknown>;
    const alt = await this.probePlan();
    const uhrzeit = x.uhrzeit === undefined ? alt.uhrzeit : String(x.uhrzeit);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new Fachfehler(422, t('meldungen.sicherung.die-uhrzeit-bitte-als-2'));
    const wochentag = x.wochentag === undefined ? alt.wochentag : Number(x.wochentag);
    if (!Number.isInteger(wochentag) || wochentag < 1 || wochentag > 7) throw new Fachfehler(422, t('meldungen.sicherung.wochentag-1-montag-bis'));
    const neu: ProbePlan = { aktiv: x.aktiv === undefined ? alt.aktiv : x.aktiv === true, wochentag, uhrzeit };
    await this.q.einstellungen.schreibe('sicherung_probe_plan', neu);
    log.info('Zeitplan der Probe-Wiederherstellung geändert', { von, ...neu });
    return neu;
  }

  /** Ist mindestens der eingestellte Mindest-Speicherplatz frei? */
  async genugPlatz(): Promise<boolean> {
    try { const f = await statfs(this.ordner); return f.bavail * f.bsize >= (await this.plan()).mindestFreiGB * GB; } catch { return true; }
  }

  /**
   * Wurde das Notfallblatt zum aktuellen Schlüssel heruntergeladen (#106)? Seit #815 steht darauf auch der Notfallcode:
   * Ein Blatt aus der Zeit davor (`ohneCode`) und eines, dessen Code benutzt wurde (`codeBenutzt`), gelten nicht mehr
   * als aktuell – dann ist ein neues Blatt fällig.
   */
  async notfallblatt(): Promise<{ am: string | null; von: string | null; fingerabdruck: string | null; aktuell: boolean; ohneCode: boolean; codeBenutzt: string | null; grund: 'fehlt' | 'schluessel' | 'ohne-code' | 'benutzt' | null }> {
    const n = (await this.q.einstellungen.lies('notfallblatt')) as { am: string; von: string; fingerabdruck: string; notfallcode?: boolean; codeBenutzt?: string } | null;
    const schluessel = !!n && !!this.q.tresor.fingerabdruck && n.fingerabdruck === this.q.tresor.fingerabdruck;
    const ohneCode = !!n && n.notfallcode !== true;
    const codeBenutzt = n?.codeBenutzt ?? null;
    const aktuell = schluessel && !ohneCode && !codeBenutzt;
    // Warum nicht aktuell? Für den Hinweis in der Werkbank – der Schlüssel zuerst, dann der Notfallcode.
    const grund = aktuell ? null : !n ? 'fehlt' : !schluessel ? 'schluessel' : codeBenutzt ? 'benutzt' : 'ohne-code';
    return { am: n?.am ?? null, von: n?.von ?? null, fingerabdruck: n?.fingerabdruck ?? null, aktuell, ohneCode, codeBenutzt, grund };
  }

  /** Notfallblatt heruntergeladen – mit neuem Notfallcode (#815). */
  async notfallblattErstellt(von: string) {
    await this.q.einstellungen.schreibe('notfallblatt', { am: this.jetzt().toISOString(), von, fingerabdruck: this.q.tresor.fingerabdruck, notfallcode: true });
    log.warn('Notfallblatt heruntergeladen', { von, fingerabdruck: this.q.tresor.fingerabdruck });
  }

  /** Der Notfallcode des Blatts wurde benutzt (#815): Das Blatt gilt nicht mehr, ein neues ist Pflicht. */
  async notfallcodeBenutzt() {
    const n = (await this.q.einstellungen.lies('notfallblatt')) as Record<string, unknown> | null;
    if (n) await this.q.einstellungen.schreibe('notfallblatt', { ...n, codeBenutzt: this.jetzt().toISOString() });
  }

  /* ---------- Liste ---------- */

  async liste(): Promise<Eintragsliste[]> {
    let namen: string[];
    try { namen = await readdir(this.ordner); } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const pruefungen = ((await this.q.einstellungen.lies('sicherung_pruefungen')) as Record<string, { am: string; ok: boolean }> | null) ?? {};
    const proben = ((await this.q.einstellungen.lies('sicherung_proben')) as Record<string, Probeergebnis> | null) ?? {};
    const extern = await this.externStaende();
    const erg: Eintragsliste[] = [];
    for (const n of namen.filter((x) => x.endsWith(ENDUNG) && !x.startsWith('.'))) {
      const name = n.slice(0, -ENDUNG.length);
      const s = await stat(join(this.ordner, n)).catch(() => null);
      if (!s) continue;
      let meta: Metadaten | null = null;
      let schlank: SchlankeMetadaten | undefined;
      try {
        const j = JSON.parse(await readFile(join(this.ordner, `${name}.json`), 'utf8')) as unknown;
        if (istSchlank(j)) schlank = j; else meta = j as Metadaten;
      } catch { /* fehlt oder unlesbar */ }
      erg.push({ name, meta, ...(schlank ? { schlank } : {}), bytes: s.size, ...(pruefungen[name] ? { pruefung: pruefungen[name] } : {}), ...(proben[name] ? { probe: proben[name] } : {}), ...(extern[name] ? { extern: extern[name] } : {}) });
    }
    const beginn = (x: Eintragsliste) => x.meta?.beginn ?? x.schlank?.beginn ?? x.name;
    return erg.sort((a, b) => beginn(b).localeCompare(beginn(a)));
  }

  private pfad(name: string) {
    if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) throw new Fachfehler(422, t('meldungen.sicherung.ungueltiger-name-einer-sicherung'));
    return join(this.ordner, `${name}${ENDUNG}`);
  }

  async loesche(name: string, von: string) {
    const p = this.pfad(name);
    if (!(await stat(p).catch(() => null))) throw new Fachfehler(404, t('meldungen.sicherung.diese-sicherung-gibt-es'));
    await rm(p, { force: true });
    await rm(join(this.ordner, `${name}.json`), { force: true });
    await this.vergissExtern([name]);
    log.warn('Sicherung gelöscht', { name, von });
  }

  /**
   * Eine Sicherung zum Herunterladen (#975): die verschlüsselte Datei unverändert, nie entschlüsselt. Gelesen wird erst
   * beim Ausliefern und nur der verlangte Teil (`oeffne`, Range). Dateiname wie im Ordner (`<name>.dms-sicherung`, mit
   * Datum im Namen) – so findet die Wiederherstellung sie samt Metadaten wieder. ETag ist die SHA-256 aus den
   * Metadaten; fehlen sie, gibt es keinen, und Weiterlesen nach Abbruch beginnt von vorn.
   */
  async datei(name: string): Promise<Abrufbar & { name: string; sha256: string | null }> {
    const p = this.pfad(name);
    const s = await stat(p).catch(() => null);
    if (!s?.isFile()) throw new Fachfehler(404, t('meldungen.sicherung.diese-sicherung-gibt-es'));
    const j = JSON.parse(await readFile(join(this.ordner, `${name}.json`), 'utf8').catch(() => 'null')) as { sha256?: unknown } | null;
    const sha256 = typeof j?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(j.sha256) ? j.sha256 : null;
    return { name, dateiname: `${name}${ENDUNG}`, groesse: s.size, sha256, etag: sha256, oeffne: ({ start, ende }) => oeffneStrom(p, { start, end: ende }) };
  }

  /** Die Metadaten (`<name>.json`) unverändert zum Herunterladen (#975): ohne sie lässt sich die Sicherung nicht einspielen. */
  async metadatenDatei(name: string): Promise<{ inhalt: Buffer; dateiname: string }> {
    this.pfad(name);
    const inhalt = await readFile(join(this.ordner, `${name}.json`)).catch(() => null);
    if (!inhalt) throw new Fachfehler(404, t('meldungen.sicherung.zu-dieser-sicherung-fehlen'));
    return { inhalt, dateiname: `${name}.json` };
  }

  /** Protokoll (#975): wer welche Sicherung heruntergeladen hat – bei Weiterlesen nach Abbruch mit der Stelle. */
  merkeHerunterladen(name: string, von: string, bereich: { start: number; ende: number } | null, groesse: number) {
    if (!bereich) log.info('Sicherung heruntergeladen', { name, von, bytes: groesse });
    else log.info('Sicherung heruntergeladen (Teil)', { name, von, ab: bereich.start, bis: bereich.ende, bytes: groesse });
  }

  /** Prüfsummen-Check: Ist die Datei unverändert seit dem Anlegen? */
  pruefe(name: string, von: string): Lauf {
    const p = this.pfad(name);
    const lauf = this.belege('pruefsumme', t('meldungen.sicherung.pruefsumme-von', { name }));
    void (async () => {
      try {
        const metaText = await readFile(join(this.ordner, `${name}.json`), 'utf8').catch(() => null);
        if (!metaText) throw new Error('Die Metadaten-Datei (.json) fehlt – ohne sie lässt sich die Prüfsumme nicht vergleichen.');
        const meta = JSON.parse(metaText) as { sha256: string };
        lauf.schritt = t('meldungen.sicherung.pruefsumme-berechnen');
        lauf.gesamt = (await stat(p)).size;
        const sha = await sha256Von(p, (n) => { lauf.bytes = n; });
        const ok = sha === meta.sha256;
        const alle = ((await this.q.einstellungen.lies('sicherung_pruefungen')) as Record<string, unknown> | null) ?? {};
        await this.q.einstellungen.schreibe('sicherung_pruefungen', { ...alle, [name]: { am: this.jetzt().toISOString(), ok } });
        lauf.ergebnis = { ok };
        if (ok) log.info('Prüfsumme in Ordnung', { name, von }); else log.error('Prüfsumme weicht ab – die Sicherungsdatei wurde verändert oder ist beschädigt', { name, von });
        lauf.status = 'fertig';
      } catch (e) {
        lauf.status = 'fehler'; lauf.fehler = (e as Error).message;
      } finally { lauf.beendet = this.jetzt().toISOString(); lauf.schritt = 'Fertig'; }
    })();
    return lauf;
  }

  /* ---------- Speicherplatz (#104) und Speicherort (#105) ---------- */

  async speicher() {
    let dateienBytes = 0; let dateien = 0;
    for await (const f of dateienUnter(this.dateiOrdner)) { dateienBytes += f.groesse; dateien++; }
    const datenbankBytes = await this.q.daten.groesse().catch(() => 0);
    const liste = await this.liste();
    const sicherungenBytes = liste.reduce((s, x) => s + x.bytes, 0);
    let frei: number | null = null; let gesamt: number | null = null;
    try {
      await mkdir(this.ordner, { recursive: true });
      const f = await statfs(this.ordner);
      frei = f.bavail * f.bsize; gesamt = f.blocks * f.bsize;
    } catch { /* nicht feststellbar */ }
    const plan = await this.plan();
    const a = plan.aufbewahrung;
    // Jede Sicherung ist vollständig; Zahl der höchstens aufbewahrten Sicherungen.
    const stueck = plan.nurNeueste ? 1 : (plan.haeufigkeit === 'taeglich' ? a.taeglich : 0) + a.woechentlich + a.monatlich;
    const letzte = liste.find((x) => x.meta)?.bytes ?? dateienBytes + datenbankBytes;
    const mindest = plan.mindestFreiGB * GB;
    return {
      dateienBytes, dateien, datenbankBytes, sicherungenBytes, anzahl: liste.length, frei, gesamt,
      hochrechnung: { stueck, bytes: stueck * (dateienBytes + datenbankBytes) },
      mindestBytes: mindest,
      knapp: frei !== null && (frei < mindest || frei < 2 * letzte),
    };
  }

  /** Probleme mit dem Ordner: kein eigenes Volume, dieselbe Platte wie die Dateien (#105). */
  ort(): { ordner: string; volume: boolean | null; gleichePlatte: boolean | null } {
    const volume = this.q.mountinfo ? null : aufVolume(this.ordner);
    const a = geraetVon(this.ordner, this.q.mountinfo);
    const b = geraetVon(this.dateiWurzel, this.q.mountinfo);
    return { ordner: this.ordner, volume, gleichePlatte: a && b ? a === b : null };
  }

  /* ---------- Sicherung anlegen (#103) ---------- */

  /**
   * Startet eine Sicherung im Hintergrund. `warten` liefert eine Promise, die mit dem Ende des
   * Laufs erfüllt wird (für die automatische Sicherung und Tests).
   */
  async starte(art: Sicherungsart, von: string): Promise<{ lauf: Lauf; fertig: Promise<Metadaten | null> }> {
    const schluessel = this.q.tresor.abgeleitet(ZWECK);
    if (!schluessel || !this.q.tresor.fingerabdruck) throw new Fachfehler(409, t('meldungen.sicherung.ohne-schluessel-keine-sicherung'));
    const plan = await this.plan();
    await mkdir(this.ordner, { recursive: true });
    try {
      const f = await statfs(this.ordner);
      const frei = f.bavail * f.bsize;
      if (frei < plan.mindestFreiGB * GB) {
        const grund = t('meldungen.sicherung.zu-wenig-freier-speicherplatz', { replace: (frei / GB).toFixed(1).replace('.', ','), mindestFreiGB: plan.mindestFreiGB });
        await this.merkeFehler(art, grund);
        throw new Fachfehler(507, grund);
      }
    } catch (e) { if (e instanceof Fachfehler) throw e; }
    const lauf = this.belege('sicherung', art === 'automatisch' ? t('meldungen.sicherung.automatische-sicherung') : art === 'vor-wiederherstellung' ? t('meldungen.sicherung.sicherung-vor-der-wiederherstellung') : 'Sicherung');
    const fertig = this.fuehreAus(lauf, art, von, schluessel);
    return { lauf, fertig };
  }

  private async merkeFehler(art: Sicherungsart, grund: string) {
    const f: Fehlerstand = { am: this.jetzt().toISOString(), art, grund };
    await this.q.einstellungen.schreibe('sicherung_fehler', f);
    log.error('Sicherung fehlgeschlagen', { art, grund });
  }

  private async freierName(art: Sicherungsart): Promise<string> {
    const o = ortszeit(this.jetzt());
    const basis = `${o.datum}_${o.uhr.replace(':', '')}-${art}`;
    for (let i = 1; ; i++) {
      const name = i === 1 ? basis : `${basis}-${i}`;
      if (!(await stat(join(this.ordner, `${name}${ENDUNG}`)).catch(() => null))) return name;
    }
  }

  private async fuehreAus(lauf: Lauf, art: Sicherungsart, von: string, schluessel: Buffer): Promise<Metadaten | null> {
    const beginn = this.jetzt();
    const name = await this.freierName(art);
    const teil = join(this.ordner, `.${name}${ENDUNG}.teil`);
    const fingerabdruck = this.q.tresor.fingerabdruck!;
    log.info('Sicherung begonnen', { name, art, von });
    try {
      const umgebung = await this.q.umgebung();
      let dateienBytes = 0; let dateien = 0; let fassungen = 0; let archivfassungen = 0; let datenbankBytes = 0;
      for await (const f of dateienUnter(this.dateiOrdner)) dateienBytes += f.groesse;
      lauf.gesamt = dateienBytes + (await this.q.daten.groesse().catch(() => 0));
      const ergebnis = await this.q.daten.imSchnappschuss(async (s) => {
        const tabellen = s.tabellen.filter((t) => !OHNE_INHALT.has(t.name));
        const ordner = this.dateiOrdner;
        const haushaltId = this.haushaltId;
        async function* eintraege(): AsyncGenerator<Eintrag> {
          yield { art: 'M', kopf: { format: 1, haushaltId, erstellt: beginn.toISOString(), migrationen: s.migrationen, tabellen: s.tabellen, ohneInhalt: [...OHNE_INHALT], zaehler: s.zaehler } };
          for (const t of tabellen) {
            lauf.schritt = `Datenbank: ${t.name}`;
            const quelle = await s.inhalt(t);
            yield { art: 'T', kopf: { tabelle: t.name, spalten: t.spalten }, daten: (async function* () { for await (const c of quelle) { datenbankBytes += c.length; yield c; } })() };
          }
          lauf.schritt = 'Dateien';
          // Mit den Dateien: Designs und die umgewandelten Fassungen von Paketen (#577) mit ihren Angaben.
          for await (const f of dateienUnter(ordner)) {
            dateien++;
            if (f.pfad.endsWith('.fassung') && FASSUNG_PFAD.test(f.pfad)) fassungen++;
            if (f.pfad.endsWith('.fassung') && ARCHIV_PFAD.test(f.pfad)) archivfassungen++;
            yield { art: 'D', kopf: { pfad: f.pfad, groesse: f.groesse }, daten: (await oeffneStrom(f.voll)) as AsyncIterable<Buffer> };
          }
          yield { art: 'E', kopf: { tabellen: tabellen.length, dateien } };
        }
        const g = await schreibeSicherung(teil, schluessel, fingerabdruck, eintraege(), (n) => { lauf.bytes = n; });
        return { g, s: { postgres: s.postgres, migrationen: s.migrationen, zaehler: s.zaehler, tabellen: tabellen.length } };
      });
      lauf.schritt = 'Abschließen';
      const ende = this.jetzt();
      const meta: Metadaten = {
        format: 1, datei: `${name}${ENDUNG}`, haushaltId: this.haushaltId,
        umgebung: { ...umgebung, datenbankStand: ergebnis.s.migrationen.at(-1) ?? null, postgres: ergebnis.s.postgres },
        art, ausgeloestVon: von, beginn: beginn.toISOString(), ende: ende.toISOString(), dauerSekunden: Math.round((ende.getTime() - beginn.getTime()) / 1000),
        anzahl: { ...ergebnis.s.zaehler, dateien, tabellen: ergebnis.s.tabellen, fassungen, archivfassungen },
        groessen: { datenbankBytes, dateienBytes, sicherungBytes: ergebnis.g.bytes },
        verschluesselung: { verfahren: t('meldungen.sicherung.aes-256-gcm-schluessel'), fingerabdruck },
        sha256: ergebnis.g.sha256,
        migrationen: ergebnis.s.migrationen,
      };
      await writeFile(join(this.ordner, `.${name}.json.teil`), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
      await rename(teil, join(this.ordner, `${name}${ENDUNG}`));
      await rename(join(this.ordner, `.${name}.json.teil`), join(this.ordner, `${name}.json`));
      lauf.status = 'fertig'; lauf.ergebnis = meta; lauf.schritt = 'Fertig';
      log.info('Sicherung fertig', { name, art, mappen: meta.anzahl.mappen, dokumente: meta.anzahl.dokumente, dateien, mb: Math.round(ergebnis.g.bytes / MB), sekunden: meta.dauerSekunden });
      // Danach im Hintergrund außer Haus (#585): Die lokale Sicherung ist fertig, egal was dort geschieht.
      await this.kuendigeAn(name, meta);
      if (art === 'automatisch') await this.raeumeAuf();
      return meta;
    } catch (e) {
      await rm(teil, { force: true }).catch(() => {});
      await rm(join(this.ordner, `.${name}.json.teil`), { force: true }).catch(() => {});
      lauf.status = 'fehler'; lauf.fehler = (e as Error).message; lauf.schritt = 'Abgebrochen';
      await this.merkeFehler(art, (e as Error).message).catch(() => {});
      return null;
    } finally {
      lauf.beendet = this.jetzt().toISOString();
    }
  }

  /**
   * Aufbewahrung (#104): ältere automatische Sicherungen entfernen – bzw. alle außer der neuesten (#585, „lokal nur
   * die neueste“). Eine Sicherung, deren Kopie außer Haus noch läuft, bleibt bis zu 2 Tage stehen (#585).
   */
  async raeumeAuf(): Promise<string[]> {
    const plan = await this.plan();
    const liste = await this.liste();
    const auto = liste.filter((x) => x.meta?.art === 'automatisch').map((x) => ({ name: x.name, beginn: x.meta!.beginn }));
    const bleibt = plan.nurNeueste ? new Set([...auto].sort((x, y) => y.beginn.localeCompare(x.beginn)).slice(0, 1).map((x) => x.name)) : behalten(auto, plan.aufbewahrung);
    const jetzt = this.jetzt().getTime();
    const unterwegs = (n: string) => Object.values(liste.find((x) => x.name === n)?.extern ?? {})
      .some((s) => (s.status === 'offen' || s.status === 'laeuft') && jetzt - Date.parse(s.seit) < ZU_ALT_TAGE * TAG_MS);
    const weg = auto.filter((x) => !bleibt.has(x.name) && !unterwegs(x.name)).map((x) => x.name);
    for (const n of weg) {
      await rm(join(this.ordner, `${n}${ENDUNG}`), { force: true });
      await rm(join(this.ordner, `${n}.json`), { force: true });
    }
    await this.vergissExtern(weg);
    if (weg.length) log.info('Ältere automatische Sicherungen entfernt (Aufbewahrung)', { anzahl: weg.length, namen: weg });
    return weg;
  }

  /* ---------- Sicherung außer Haus (#585) ---------- */

  private async externStaende(): Promise<Record<string, Record<string, ExternStand>>> {
    const v = await this.q.einstellungen.lies('sicherung_extern');
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, Record<string, ExternStand>> : {};
  }

  /** Änderungen am Stand außer Haus nacheinander – Rückmeldung, neue Sicherung und Aufbewahrung können sich überschneiden. */
  private externKette: Promise<unknown> = Promise.resolve();
  private aendereExtern(f: (alle: Record<string, Record<string, ExternStand>>) => boolean): Promise<void> {
    const weiter = this.externKette.then(async () => {
      const alle = await this.externStaende();
      if (f(alle)) await this.q.einstellungen.schreibe('sicherung_extern', Object.keys(alle).length ? alle : null);
    });
    this.externKette = weiter.catch(() => {});
    return weiter;
  }

  private setzeExtern(name: string, paket: string, stand: ExternStand) {
    return this.aendereExtern((alle) => { alle[name] = { ...(alle[name] ?? {}), [paket]: stand }; return true; });
  }

  private vergissExtern(namen: string[]) {
    return this.aendereExtern((alle) => { const da = namen.filter((n) => n in alle); for (const n of da) delete alle[n]; return da.length > 0; });
  }

  /** Ziele außer Haus: Pakete mit dms:sicherung-lesen, mit Adresse und dem zuletzt gemeldeten Ziel. */
  async externZiele(): Promise<Sicherungsziel[]> {
    const pakete = await this.extern?.pakete().catch(() => []) ?? [];
    if (!pakete.length) return [];
    const alle = await this.externStaende();
    const zuletzt = (id: string) => Object.values(alle).map((x) => x[id]).filter((s): s is ExternStand => !!s?.ziel).sort((a, b) => b.am.localeCompare(a.am))[0]?.ziel ?? null;
    return pakete.map((p) => ({ ...p, ziel: zuletzt(p.id) }));
  }

  /** Nach einer Sicherung: Ereignis an die Pakete, Stand „offen“ je Paket. Fehler hier stören die Sicherung nicht. */
  private async kuendigeAn(name: string, meta: Metadaten) {
    try {
      const pakete = await this.extern?.pakete() ?? [];
      if (!pakete.length) return;
      const am = this.jetzt().toISOString();
      await this.aendereExtern((alle) => { alle[name] = Object.fromEntries(pakete.map((p) => [p.id, { status: 'offen', seit: am, am } satisfies ExternStand])); return true; });
      await this.extern!.melde({ name, ...schlankeMetadaten(meta) });
    } catch (e) { log.error('Kopie außer Haus nicht angestoßen', { name, fehler: (e as Error).message }); }
  }

  /** Darf das Paket diese Sicherung lesen? Nur die, die ihm mit sicherung.fertig gemeldet wurde – sonst 403/404. */
  private async externZugang(paket: string, name: string): Promise<{ pfad: string; groesse: number; stand: ExternStand }> {
    const pfad = this.pfad(name);
    const s = await stat(pfad).catch(() => null);
    if (!s?.isFile()) throw new Fachfehler(404, t('meldungen.sicherung.diese-sicherung-gibt-es-2'));
    const stand = (await this.externStaende())[name]?.[paket];
    if (!stand) throw new Fachfehler(403, t('meldungen.sicherung.diese-sicherung-wurde-dem'));
    return { pfad, groesse: s.size, stand };
  }

  /** Schlanke Metadaten einer gemeldeten Sicherung (GET /sicherungen/{name}). */
  async externMeta(paket: string, name: string): Promise<SchlankeMetadaten & { name: string }> {
    await this.externZugang(paket, name);
    const j = JSON.parse(await readFile(join(this.ordner, `${name}.json`), 'utf8').catch(() => 'null')) as unknown;
    if (!j) throw new Fachfehler(404, t('meldungen.sicherung.zu-dieser-sicherung-fehlen'));
    return { name, ...(istSchlank(j) ? j : schlankeMetadaten(j as Metadaten)) };
  }

  /** Ein Stück der verschlüsselten Datei (GET /sicherungen/{name}/datei): ab versatz höchstens laenge Bytes. */
  async externStueck(paket: string, name: string, versatz: unknown, laenge: unknown): Promise<{ inhalt: Buffer; groesse: number }> {
    const { pfad, groesse } = await this.externZugang(paket, name);
    const zahl = (v: unknown, std: number) => (v === undefined || v === '' ? std : Number(v));
    const ab = zahl(versatz, 0), n = zahl(laenge, STUECK_MAX);
    if (!Number.isSafeInteger(ab) || ab < 0 || ab > groesse) throw new Fachfehler(422, t('meldungen.sicherung.versatz-0-bis-groesse', { groesse }));
    if (!Number.isSafeInteger(n) || n < 1 || n > STUECK_MAX) throw new Fachfehler(422, t('meldungen.sicherung.laenge-1-bis-bytes', { STUECK_MAX }));
    const inhalt = Buffer.alloc(Math.min(n, groesse - ab));
    const f = await open(pfad, 'r');
    try { const { bytesRead } = await f.read(inhalt, 0, inhalt.length, ab); return { inhalt: inhalt.subarray(0, bytesRead), groesse }; }
    finally { await f.close(); }
  }

  /** Rückmeldung des Pakets je Sicherung (PUT /sicherungen/{name}/extern). */
  async externRueckmeldung(paket: string, name: string, e: unknown): Promise<ExternStand> {
    const { stand } = await this.externZugang(paket, name);
    const x = (e ?? {}) as Record<string, unknown>;
    const status = x.status as ExternStatus;
    if (!EXTERN_STATUS.includes(status)) throw new Fachfehler(422, `status: ${EXTERN_STATUS.join(', ')}.`);
    const pruefung = x.pruefung === undefined || x.pruefung === null ? undefined : x.pruefung as ExternPruefung;
    if (pruefung !== undefined && !EXTERN_PRUEFUNG.includes(pruefung)) throw new Fachfehler(422, `pruefung: ${EXTERN_PRUEFUNG.join(', ')}.`);
    if (status === 'geprueft' && pruefung !== 'pruefsumme' && pruefung !== 'stichprobe') throw new Fachfehler(422, t('meldungen.sicherung.geprueft-braucht-pruefung-pruefsumme'));
    if (status === 'hochgeladen' && (pruefung === 'pruefsumme' || pruefung === 'stichprobe')) throw new Fachfehler(422, t('meldungen.sicherung.mit-pruefsumme-oder-stichprobe'));
    const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? ohneZugangsdaten(v.trim().replace(/\s+/g, ' ')).slice(0, max) : undefined);
    const grund = text(x.grund, 500);
    if (status === 'fehlgeschlagen' && !grund) throw new Fachfehler(422, t('meldungen.sicherung.bei-fehlgeschlagen-bitte-einen'));
    const zahl = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined);
    const neu: ExternStand = {
      status, ...(pruefung ? { pruefung } : {}), ...(grund ? { grund } : {}), ...(status === 'fehlgeschlagen' && x.endgueltig === true ? { endgueltig: true } : {}),
      ...(text(x.ziel, 200) ?? stand.ziel ? { ziel: text(x.ziel, 200) ?? stand.ziel } : {}),
      ...(zahl(x.bytes) !== undefined ? { bytes: zahl(x.bytes) } : {}), ...(zahl(x.gesamt) !== undefined ? { gesamt: zahl(x.gesamt) } : {}),
      seit: stand.seit, am: this.jetzt().toISOString(),
    };
    await this.setzeExtern(name, paket, neu);
    if (status === 'fehlgeschlagen') log.warn('Kopie außer Haus fehlgeschlagen', { name, paket, grund, endgueltig: !!neu.endgueltig });
    else if (status !== 'laeuft') log.info(status === 'geprueft' ? 'Kopie außer Haus geprüft' : 'Kopie außer Haus hochgeladen', { name, paket, pruefung: pruefung ?? null, ziel: neu.ziel ?? null });
    if (status === 'fehlgeschlagen' && neu.endgueltig) void this.melde().catch(() => {});
    return neu;
  }

  /**
   * Antwort des Pakets auf einen Aufruf von sicherung.fertig (#636) – so meldet es seinen Stand, ohne schreiben zu dürfen:
   * als „extern“ im JSON-Ergebnis (auch neben „weiter“), dieselben Felder wie bei PUT /sicherungen/{name}/extern.
   * Ohne „extern“ zählt der Rückgabewert: 2 → „fehlgeschlagen“ (endgültig – hier muss jemand handeln), sonst ≠ 0 →
   * „läuft“ mit der Meldung als Grund; der Läufer wiederholt. Erfolg ohne „extern“ ändert nichts.
   */
  async externAntwort(paket: string, name: string, r: EreignisAufruf): Promise<void> {
    const stand = (await this.externStaende())[name]?.[paket];
    if (!stand) return;
    let extern: unknown;
    if (r.text.trimStart().startsWith('{')) { try { extern = (JSON.parse(r.text) as Record<string, unknown> | null)?.extern; } catch { /* kein JSON: Text */ } }
    if (extern !== undefined) {
      await this.externRueckmeldung(paket, name, extern).catch((f) => log.warn('Kopie außer Haus: Rückmeldung des Pakets nicht übernommen', { name, paket, fehler: (f as Error).message }));
      return;
    }
    // Erfolg ohne Stand; schon erfolgreich; oder während des Aufrufs schon gemeldet (Pakete vor #636, PUT): nichts ändern.
    if (r.ok || erfolgreich(stand) || Date.parse(stand.am) >= r.beginn) return;
    const endgueltig = r.rc === 2;
    const grund = ohneZugangsdaten((r.fehler ?? '').trim().replace(/\s+/g, ' ')).slice(0, 500) || t('meldungen.sicherung.das-paket-meldet-einen');
    await this.setzeExtern(name, paket, {
      status: endgueltig ? 'fehlgeschlagen' : 'laeuft', grund, ...(endgueltig ? { endgueltig: true } : {}),
      ...(stand.ziel ? { ziel: stand.ziel } : {}), ...(stand.bytes !== undefined ? { bytes: stand.bytes } : {}), ...(stand.gesamt !== undefined ? { gesamt: stand.gesamt } : {}),
      seit: stand.seit, am: this.jetzt().toISOString(),
    });
    log.warn(endgueltig ? 'Kopie außer Haus fehlgeschlagen' : 'Kopie außer Haus: Versuch fehlgeschlagen', { name, paket, grund, endgueltig });
    if (endgueltig) void this.melde().catch(() => {});
  }

  /** Das Paket hat das Ereignis aufgegeben (alle Wiederholungen fehlgeschlagen): „fehlgeschlagen“, endgültig. */
  async externAufgegeben(paket: string, name: string, fehler: string | null | undefined) {
    const stand = (await this.externStaende())[name]?.[paket];
    if (!stand || erfolgreich(stand)) return;
    await this.setzeExtern(name, paket, { ...stand, status: 'fehlgeschlagen', endgueltig: true, grund: t('meldungen.sicherung.nach-mehreren-versuchen-aufgegeben', { ohneZugangsdaten: ohneZugangsdaten(stand.status === 'fehlgeschlagen' && stand.grund ? stand.grund : fehler ?? t('meldungen.sicherung.unbekannter-fehler')).slice(0, 450) }), am: this.jetzt().toISOString() });
    log.error('Kopie außer Haus aufgegeben', { name, paket, fehler });
    void this.melde().catch(() => {});
  }

  /**
   * Zustand außer Haus: letzte erfolgreiche Kopie, aktueller Fehler, „hinkt mehr als 2 Tage hinterher“. Es zählen nur
   * Pakete, die noch installiert sind. zuAlt: Eine Sicherung, die älter als 2 Tage ist und neuer als die letzte
   * erfolgreiche Kopie, ist noch nicht außer Haus.
   */
  async externZustand(liste?: Eintragsliste[]) {
    const ziele = await this.externZiele();
    if (!ziele.length) return null;
    const ids = new Set(ziele.map((z) => z.id));
    const jetzt = this.jetzt().getTime();
    let letzte: { name: string; paket: string; beginn: string; stand: ExternStand } | null = null;
    let fehler: { name: string; paket: string; beginn: string; stand: ExternStand } | null = null;
    let aeltesteOffen: string | null = null;
    for (const e of liste ?? await this.liste()) {
      const st = Object.entries(e.extern ?? {}).filter(([p]) => ids.has(p));
      if (!st.length) continue;
      const beginn = e.meta?.beginn ?? e.schlank?.beginn ?? st[0][1].seit;
      const ok = st.find(([, s]) => erfolgreich(s));
      if (ok) { letzte = { name: e.name, paket: ok[0], beginn, stand: ok[1] }; break; }
      const f = st.find(([, s]) => s.status === 'fehlgeschlagen');
      if (f && !fehler) fehler = { name: e.name, paket: f[0], beginn, stand: f[1] };
      aeltesteOffen = e.meta?.ende ?? st[0][1].seit;
    }
    return { ziele, letzte, fehler, zuAlt: !!aeltesteOffen && jetzt - Date.parse(aeltesteOffen) > ZU_ALT_TAGE * TAG_MS };
  }

  /* ---------- Zustand und Hinweise (#105) ---------- */

  async zustand() {
    const liste = await this.liste();
    const extern = await this.externZustand(liste).catch(() => null);
    const letzte = liste.find((x) => x.meta)?.meta ?? null;
    const fehler = (await this.q.einstellungen.lies('sicherung_fehler')) as Fehlerstand | null;
    const jetzt = this.jetzt().getTime();
    const plan = await this.plan();
    const grenze = ZU_ALT_TAGE * TAG_MS;
    return {
      letzte: letzte ? { name: letzte.datei, ende: letzte.ende, art: letzte.art } : null,
      fehler: fehler && (!letzte || fehler.am > letzte.ende) ? fehler : null,
      /** Letzte erfolgreiche älter als 2 Tage – oder noch keine, obwohl der Zeitplan seit 2 Tagen an ist. */
      zuAlt: letzte ? jetzt - Date.parse(letzte.ende) > grenze : !!(plan.aktiv && plan.aktivSeit && jetzt - Date.parse(plan.aktivSeit) > grenze),
      planAktiv: plan.aktiv,
      notfallblatt: await this.notfallblatt(),
      schluessel: this.q.tresor.bereit,
      /** Fingerabdruck des aktuellen Schlüssels: Sicherungen mit anderem brauchen ein älteres Notfallblatt (#47). */
      fingerabdruck: this.q.tresor.fingerabdruck,
      ort: this.ort(),
      probe: await this.probeAmpel(letzte !== null),
      extern,
    };
  }

  /** Ampel der Probe-Wiederherstellung (#109): grün ≤ 8 Tage erfolgreich, gelb älter oder nie, rot fehlgeschlagen. */
  async probeAmpel(gibtSicherungen: boolean): Promise<{ ampel: 'gruen' | 'gelb' | 'rot' | null; letzte: (Probeergebnis & { name: string }) | null; plan: ProbePlan }> {
    const letzte = (await this.q.einstellungen.lies('sicherung_probe_letzte')) as (Probeergebnis & { name: string }) | null;
    const plan = await this.probePlan();
    if (!gibtSicherungen && !letzte) return { ampel: null, letzte: null, plan };
    const ampel = !letzte ? 'gelb' : !letzte.ok ? 'rot' : this.jetzt().getTime() - Date.parse(letzte.am) > PROBE_TAGE * TAG_MS ? 'gelb' : 'gruen';
    return { ampel, letzte, plan };
  }

  /** Einmal je Vorfall eine Mail an alle Administratoren (#105). */
  async melde(): Promise<string | null> {
    const z = await this.zustand();
    let vorfall: string | null = null; let betreff = ''; let text = '';
    if (z.fehler) {
      vorfall = `fehler:${z.fehler.am}`;
      betreff = t('meldungen.sicherung.ablago-sicherung-fehlgeschlagen');
      text = t('meldungen.sicherung.die-sicherung-am-ist', { wert: z.fehler.art === 'automatisch' ? 'automatische ' : '', wert2: new Date(z.fehler.am).toLocaleString(gebietsschema(), { timeZone: zeitzone() }), grund: z.fehler.grund });
    } else if (z.planAktiv && z.zuAlt) {
      vorfall = `alt:${z.letzte?.ende ?? 'nie'}`;
      betreff = t('meldungen.sicherung.ablago-die-letzte-sicherung');
      text = z.letzte ? t('meldungen.sicherung.die-letzte-erfolgreiche-sicherung', { wert: new Date(z.letzte.ende).toLocaleString(gebietsschema(), { timeZone: zeitzone() }), ZU_ALT_TAGE }) : t('meldungen.sicherung.es-gibt-noch-keine');
    }
    if (vorfall) return this.meldeVorfall('sicherung_gemeldet', vorfall, betreff, text);
    return this.meldeExtern(z.extern);
  }

  /** Kopie außer Haus (#585): endgültig fehlgeschlagen oder mehr als 2 Tage im Rückstand – einmal je Vorfall. Nennt nur das Ziel. */
  private async meldeExtern(x: Awaited<ReturnType<Sicherung['externZustand']>>): Promise<string | null> {
    if (!x) return null;
    const zielText = (id: string) => { const z = x.ziele.find((y) => y.id === id); return z ? `${z.name}${z.adresse ? ` (${ohneZugangsdaten(z.adresse)})` : z.ziel ? ` (${z.ziel})` : ''}` : id; };
    const wann = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { timeZone: zeitzone() });
    if (x.fehler?.stand.endgueltig) {
      return this.meldeVorfall('sicherung_extern_gemeldet', `extern-fehler:${x.fehler.name}:${x.fehler.paket}`, t('meldungen.sicherung.ablago-kopie-ausser-haus'),
        t('meldungen.sicherung.die-sicherung-vom-liess', { wann: wann(x.fehler.beginn), zielText: zielText(x.fehler.paket), wert: x.fehler.stand.grund ?? 'unbekannt' }));
    }
    if (x.zuAlt) {
      return this.meldeVorfall('sicherung_extern_gemeldet', `extern-alt:${x.letzte?.name ?? 'nie'}`, t('meldungen.sicherung.ablago-die-letzte-kopie'),
        t('meldungen.sicherung.neuere-sicherungen-sind-seit', { wert: x.letzte ? t('meldungen.sicherung.die-letzte-kopie-ausser', { wann: wann(x.letzte.beginn) }) : t('meldungen.sicherung.es-gibt-noch-keine-2'), ZU_ALT_TAGE, map: x.ziele.map((z) => zielText(z.id)).join(', '), wert2: x.fehler?.stand.grund ? t('meldungen.sicherung.letzter-fehler', { grund: x.fehler.stand.grund }) : '' }));
    }
    return null;
  }

  private async meldeVorfall(schluessel: string, vorfall: string, betreff: string, text: string): Promise<string | null> {
    if ((await this.q.einstellungen.lies(schluessel)) === vorfall) return null;
    await this.q.einstellungen.schreibe(schluessel, vorfall);
    log.warn(betreff.replace('Ablago: ', ''), { vorfall });
    try { await this.q.anAdmins?.(betreff, () => t('meldungen.sicherung.details-stehen-in-der', { text })); }
    catch (e) { log.warn('Mail zur Sicherung nicht verschickt', { fehler: (e as Error).message }); }
    return vorfall;
  }

  /* ---------- Zeitplan (#104) ---------- */

  /** Jede Minute: fällige automatische Sicherung starten, Probleme melden. */
  async tick(): Promise<'gestartet' | 'nichts'> {
    let gestartet: 'gestartet' | 'nichts' = 'nichts';
    const plan = await this.plan();
    // Läuft gerade eine Probe oder Wiederherstellung, in der nächsten Minute noch einmal versuchen.
    if (plan.aktiv && !this.q.wartungAktiv?.() && !this.laeuft() && !this.sperre()) {
      // Zeitplan-Baustein (#724): heute zur Uhrzeit, verpasste Läufe noch am selben Tag (auch nach einem Neustart).
      const takt = { uhrzeit: plan.uhrzeit, an: (tag: string) => plan.haeufigkeit === 'taeglich' || wochentagVon(tag) === plan.wochentag };
      await laufeFaellige(einstellungsMerker(this.q.einstellungen, 'sicherung_zuletzt_auto'), ortszeit(this.jetzt()), takt, async () => {
        try {
          const { fertig } = await this.starte('automatisch', 'Zeitplan');
          gestartet = 'gestartet';
          void fertig.then(() => this.melde()).catch(() => {});
        } catch (e) { log.warn('Automatische Sicherung nicht begonnen', { grund: (e as Error).message }); }
      });
    }
    if (gestartet === 'nichts') await this.melde();
    return gestartet;
  }

  /** Nach einem Neustart: halb geschriebene Sicherungen entfernen. */
  async raeumeTeileAuf() {
    let namen: string[] = [];
    try { namen = await readdir(this.ordner); } catch { return; }
    for (const n of namen.filter((x) => x.startsWith('.') && x.endsWith('.teil'))) await rm(join(this.ordner, n), { force: true });
  }

  start(ms = 60_000) {
    void this.raeumeTeileAuf();
    const lauf = () => void this.tick().catch((e) => log.error('Zeitplan der Sicherung gestört', { fehler: (e as Error).message }));
    this.zeitgeber = setInterval(lauf, ms);
    this.zeitgeber.unref?.();
  }
  stop() { if (this.zeitgeber) clearInterval(this.zeitgeber); }
}
