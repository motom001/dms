import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { OHNE_INHALT, type Datenquelle, type Zaehler } from './datenbankabzug';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { schreibeSicherung, sha256Von, ZWECK, type Eintrag } from './sicherungsformat';
import { aufVolume, geraetVon } from './tresor';

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
const ZONE = 'Europe/Berlin';

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
  anzahl: Zaehler & { dateien: number; tabellen: number };
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
}
export const PLAN_STANDARD: Plan = { aktiv: false, uhrzeit: '02:00', haeufigkeit: 'taeglich', wochentag: 7, aufbewahrung: { taeglich: 7, woechentlich: 4, monatlich: 12 }, mindestFreiGB: 1, aktivSeit: null };

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
export interface Eintragsliste { name: string; meta: Metadaten | null; bytes: number; pruefung?: { am: string; ok: boolean }; probe?: Probeergebnis }

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
  anAdmins?: (betreff: string, text: string) => Promise<void>;
  /** Für Tests: Einhängepunkte. */
  mountinfo?: string;
  jetzt?: () => Date;
}

const teileIn = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
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
    if (!Number.isFinite(n) || n < min || n > max) throw new Fachfehler(422, `Bitte eine Zahl zwischen ${min} und ${max} angeben.`);
    return Math.trunc(n);
  };
  const uhrzeit = x.uhrzeit === undefined ? alt.uhrzeit : String(x.uhrzeit);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new Fachfehler(422, 'Die Uhrzeit bitte als HH:MM angeben, z. B. 02:00.');
  const haeufigkeit = x.haeufigkeit === undefined ? alt.haeufigkeit : x.haeufigkeit === 'woechentlich' ? 'woechentlich' : x.haeufigkeit === 'taeglich' ? 'taeglich' : null;
  if (!haeufigkeit) throw new Fachfehler(422, 'Häufigkeit: täglich oder wöchentlich.');
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

  constructor(
    /** Ordner der Sicherungen (eigenes Volume). */
    readonly ordner: string,
    /** Wurzel der Dateien (FILES_DIR) und Haushalt: gesichert wird <wurzel>/<haushalt>. */
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
    if (this.laeuft()) throw new Fachfehler(409, `Es läuft bereits: ${this.lauf!.titel}. Bitte warten, bis das fertig ist.`);
    if (titel !== 'Sicherung vor der Wiederherstellung' && this.sperre()) throw new Fachfehler(409, 'Gerade läuft eine Wiederherstellung oder Probe. Bitte warten, bis sie fertig ist.');
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
      throw new Fachfehler(409, 'Die automatische Sicherung lässt sich erst einschalten, wenn du das Notfallblatt heruntergeladen hast – ohne den Schlüssel darauf ist eine Sicherung wertlos.');
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
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new Fachfehler(422, 'Die Uhrzeit bitte als HH:MM angeben, z. B. 04:00.');
    const wochentag = x.wochentag === undefined ? alt.wochentag : Number(x.wochentag);
    if (!Number.isInteger(wochentag) || wochentag < 1 || wochentag > 7) throw new Fachfehler(422, 'Wochentag: 1 (Montag) bis 7 (Sonntag).');
    const neu: ProbePlan = { aktiv: x.aktiv === undefined ? alt.aktiv : x.aktiv === true, wochentag, uhrzeit };
    await this.q.einstellungen.schreibe('sicherung_probe_plan', neu);
    log.info('Zeitplan der Probe-Wiederherstellung geändert', { von, ...neu });
    return neu;
  }

  /** Ist mindestens der eingestellte Mindest-Speicherplatz frei? */
  async genugPlatz(): Promise<boolean> {
    try { const f = await statfs(this.ordner); return f.bavail * f.bsize >= (await this.plan()).mindestFreiGB * 1024 ** 3; } catch { return true; }
  }

  /** Wurde das Notfallblatt zum aktuellen Schlüssel heruntergeladen (#106)? */
  async notfallblatt(): Promise<{ am: string | null; von: string | null; fingerabdruck: string | null; aktuell: boolean }> {
    const n = (await this.q.einstellungen.lies('notfallblatt')) as { am: string; von: string; fingerabdruck: string } | null;
    return { am: n?.am ?? null, von: n?.von ?? null, fingerabdruck: n?.fingerabdruck ?? null, aktuell: !!n && !!this.q.tresor.fingerabdruck && n.fingerabdruck === this.q.tresor.fingerabdruck };
  }

  async notfallblattErstellt(von: string) {
    await this.q.einstellungen.schreibe('notfallblatt', { am: this.jetzt().toISOString(), von, fingerabdruck: this.q.tresor.fingerabdruck });
    log.warn('Notfallblatt heruntergeladen', { von, fingerabdruck: this.q.tresor.fingerabdruck });
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
    const erg: Eintragsliste[] = [];
    for (const n of namen.filter((x) => x.endsWith(ENDUNG) && !x.startsWith('.'))) {
      const name = n.slice(0, -ENDUNG.length);
      const s = await stat(join(this.ordner, n)).catch(() => null);
      if (!s) continue;
      let meta: Metadaten | null = null;
      try { meta = JSON.parse(await readFile(join(this.ordner, `${name}.json`), 'utf8')) as Metadaten; } catch { /* fehlt oder unlesbar */ }
      erg.push({ name, meta, bytes: s.size, ...(pruefungen[name] ? { pruefung: pruefungen[name] } : {}), ...(proben[name] ? { probe: proben[name] } : {}) });
    }
    return erg.sort((a, b) => (b.meta?.beginn ?? b.name).localeCompare(a.meta?.beginn ?? a.name));
  }

  private pfad(name: string) {
    if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) throw new Fachfehler(422, 'Ungültiger Name einer Sicherung.');
    return join(this.ordner, `${name}${ENDUNG}`);
  }

  async loesche(name: string, von: string) {
    const p = this.pfad(name);
    if (!(await stat(p).catch(() => null))) throw new Fachfehler(404, 'Diese Sicherung gibt es nicht (mehr).');
    await rm(p, { force: true });
    await rm(join(this.ordner, `${name}.json`), { force: true });
    log.warn('Sicherung gelöscht', { name, von });
  }

  /** Prüfsummen-Check: Ist die Datei unverändert seit dem Anlegen? */
  pruefe(name: string, von: string): Lauf {
    const p = this.pfad(name);
    const lauf = this.belege('pruefsumme', `Prüfsumme von ${name}`);
    void (async () => {
      try {
        const metaText = await readFile(join(this.ordner, `${name}.json`), 'utf8').catch(() => null);
        if (!metaText) throw new Error('Die Metadaten-Datei (.json) fehlt – ohne sie lässt sich die Prüfsumme nicht vergleichen.');
        const meta = JSON.parse(metaText) as Metadaten;
        lauf.gesamt = (await stat(p)).size;
        lauf.schritt = 'Prüfsumme berechnen';
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
    const stueck = (plan.haeufigkeit === 'taeglich' ? a.taeglich : 0) + a.woechentlich + a.monatlich;
    const letzte = liste.find((x) => x.meta)?.bytes ?? dateienBytes + datenbankBytes;
    const mindest = plan.mindestFreiGB * 1024 ** 3;
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
    if (!schluessel || !this.q.tresor.fingerabdruck) throw new Fachfehler(409, 'Ohne Schlüssel keine Sicherung: Erzeuge ihn zuerst unter Werkbank → Verschlüsselung.');
    const plan = await this.plan();
    await mkdir(this.ordner, { recursive: true });
    try {
      const f = await statfs(this.ordner);
      const frei = f.bavail * f.bsize;
      if (frei < plan.mindestFreiGB * 1024 ** 3) {
        const grund = `Zu wenig freier Speicherplatz im Sicherungsordner: ${(frei / 1024 ** 3).toFixed(1).replace('.', ',')} GB frei, mindestens ${plan.mindestFreiGB} GB eingestellt.`;
        await this.merkeFehler(art, grund);
        throw new Fachfehler(507, grund);
      }
    } catch (e) { if (e instanceof Fachfehler) throw e; }
    const lauf = this.belege('sicherung', art === 'automatisch' ? 'Automatische Sicherung' : art === 'vor-wiederherstellung' ? 'Sicherung vor der Wiederherstellung' : 'Sicherung');
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
      let dateienBytes = 0; let dateien = 0; let datenbankBytes = 0;
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
          for await (const f of dateienUnter(ordner)) {
            dateien++;
            yield { art: 'D', kopf: { pfad: f.pfad, groesse: f.groesse }, daten: createReadStream(f.voll) as AsyncIterable<Buffer> };
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
        anzahl: { ...ergebnis.s.zaehler, dateien, tabellen: ergebnis.s.tabellen },
        groessen: { datenbankBytes, dateienBytes, sicherungBytes: ergebnis.g.bytes },
        verschluesselung: { verfahren: 'AES-256-GCM, Schlüssel per HKDF-SHA256 aus dem Schlüssel der Werkbank abgeleitet, Inhalt gzip-komprimiert', fingerabdruck },
        sha256: ergebnis.g.sha256,
        migrationen: ergebnis.s.migrationen,
      };
      await writeFile(join(this.ordner, `.${name}.json.teil`), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
      await rename(teil, join(this.ordner, `${name}${ENDUNG}`));
      await rename(join(this.ordner, `.${name}.json.teil`), join(this.ordner, `${name}.json`));
      lauf.status = 'fertig'; lauf.ergebnis = meta; lauf.schritt = 'Fertig';
      log.info('Sicherung fertig', { name, art, mappen: meta.anzahl.mappen, dokumente: meta.anzahl.dokumente, dateien, mb: Math.round(ergebnis.g.bytes / 1024 / 1024), sekunden: meta.dauerSekunden });
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

  /** Aufbewahrung (#104): ältere automatische Sicherungen entfernen. */
  async raeumeAuf(): Promise<string[]> {
    const plan = await this.plan();
    const auto = (await this.liste()).filter((x) => x.meta?.art === 'automatisch').map((x) => ({ name: x.name, beginn: x.meta!.beginn }));
    const bleibt = behalten(auto, plan.aufbewahrung);
    const weg = auto.filter((x) => !bleibt.has(x.name)).map((x) => x.name);
    for (const n of weg) {
      await rm(join(this.ordner, `${n}${ENDUNG}`), { force: true });
      await rm(join(this.ordner, `${n}.json`), { force: true });
    }
    if (weg.length) log.info('Ältere automatische Sicherungen entfernt (Aufbewahrung)', { anzahl: weg.length, namen: weg });
    return weg;
  }

  /* ---------- Zustand und Hinweise (#105) ---------- */

  async zustand() {
    const liste = await this.liste();
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
      ort: this.ort(),
      probe: await this.probeAmpel(letzte !== null),
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
      betreff = 'DMS: Sicherung fehlgeschlagen';
      text = `Die ${z.fehler.art === 'automatisch' ? 'automatische ' : ''}Sicherung am ${new Date(z.fehler.am).toLocaleString('de-DE', { timeZone: ZONE })} ist fehlgeschlagen:\n\n${z.fehler.grund}\n\n`;
    } else if (z.planAktiv && z.zuAlt) {
      vorfall = `alt:${z.letzte?.ende ?? 'nie'}`;
      betreff = 'DMS: Die letzte Sicherung ist zu alt';
      text = z.letzte ? `Die letzte erfolgreiche Sicherung ist vom ${new Date(z.letzte.ende).toLocaleString('de-DE', { timeZone: ZONE })} – älter als ${ZU_ALT_TAGE} Tage.\n\n` : 'Es gibt noch keine erfolgreiche Sicherung, obwohl die automatische Sicherung eingeschaltet ist.\n\n';
    }
    if (!vorfall) return null;
    if ((await this.q.einstellungen.lies('sicherung_gemeldet')) === vorfall) return null;
    await this.q.einstellungen.schreibe('sicherung_gemeldet', vorfall);
    log.warn(betreff.replace('DMS: ', ''), { vorfall });
    try { await this.q.anAdmins?.(betreff, `${text}Details stehen in der Werkbank unter „Sicherung“ und im Protokoll (Modul sicherung).`); }
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
      const o = ortszeit(this.jetzt());
      const tagPasst = plan.haeufigkeit === 'taeglich' || o.wochentag === plan.wochentag;
      if (tagPasst && o.uhr >= plan.uhrzeit && (await this.q.einstellungen.lies('sicherung_zuletzt_auto')) !== o.datum) {
        await this.q.einstellungen.schreibe('sicherung_zuletzt_auto', o.datum);
        try {
          const { fertig } = await this.starte('automatisch', 'Zeitplan');
          gestartet = 'gestartet';
          void fertig.then(() => this.melde()).catch(() => {});
        } catch (e) { log.warn('Automatische Sicherung nicht begonnen', { grund: (e as Error).message }); }
      }
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
