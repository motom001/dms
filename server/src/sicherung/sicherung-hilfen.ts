/** Sicherung (#1278 aus sicherung.ts): Typen, Plan, Aufbewahrung und Hilfen ohne die Klasse. */
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { protokoll } from '../protokoll/protokoll';
import type { Zaehler, Datenquelle } from './datenbankabzug';
import { t } from '../sprache/sprache';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { zeitzone } from '../../../shared/src/region';
import { Fachfehler } from '../grundlagen/fehler';
import { nachweisJeTag } from '../protokoll/nachweisjournal';

/**
 * Sicherungen (#103–#105): Datenbank und Dateien zum selben Zeitpunkt, verschlüsselt mit dem
 * Schlüssel der Werkbank, dazu Metadaten als lesbares JSON. Zeitplan, Aufbewahrung, Speicherplatz
 * und Hinweise bei Problemen.
 */

export const log = protokoll.modul('sicherung');
export const ENDUNG = '.dms-sicherung';
export const TAG_MS = 24 * 60 * 60 * 1000;
/** Ab hier gilt die letzte erfolgreiche Sicherung als zu alt (#105). */
export const ZU_ALT_TAGE = 2;

export type Sicherungsart = 'manuell' | 'automatisch' | 'vor-wiederherstellung';

/**
 * Grund einer fehlgeschlagenen Sicherung im Nachweis-Journal (#1308) – nur diese festen Kennungen, nie ein Fehlertext,
 * ein Pfad oder Zugangsdaten (Geheimnis-Sperre #1055): `platz` zu wenig Speicherplatz, `schluessel` kein Schlüssel,
 * `ziel` Kopie außer Haus gescheitert, `abbruch` Lauf unterbrochen (z. B. Neustart mitten in der Sicherung), `fehler`
 * alles andere (Einzelheiten im Protokoll und unter Werkbank → Sicherung).
 */
export type Fehlgrund = 'platz' | 'schluessel' | 'ziel' | 'abbruch' | 'fehler';

/** Grund aus einem Fehler: voller Datenträger oder erschöpftes Kontingent → `platz`, sonst `fehler`. */
export function fehlgrundVon(e: unknown): Fehlgrund {
  const code = (e as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOSPC' || code === 'EDQUOT' ? 'platz' : 'fehler';
}

/** Art aus dem Namen einer Sicherung (`JJJJ-MM-TT_HHMM-<art>`, ggf. mit `-2` …); null, wenn der Name anders lautet. */
export function artAusName(name: string): Sicherungsart | null {
  const m = /-(manuell|automatisch|vor-wiederherstellung)(?:-\d+)?$/.exec(name);
  return m ? (m[1] as Sicherungsart) : null;
}

/**
 * Fehlgeschlagene Sicherung ins Nachweis-Journal (#1308): Art (automatisch oder von Hand), Ort (lokal oder außer Haus
 * mit dem Namen des Ziels) und Grund – ein Eintrag je Tag mit Anzahl. Scheitert nie.
 */
export function vermerkeFehlschlag(o: {
  art: Sicherungsart | null;
  ort: 'lokal' | 'ausser_haus';
  ziel?: string | null;
  grund: Fehlgrund;
}): Promise<void> {
  return nachweisJeTag('sicherung.fehlgeschlagen', {
    art: o.art === 'automatisch' ? 'automatisch' : 'hand',
    ort: o.ort,
    ziel: o.ort === 'ausser_haus' ? (o.ziel ?? null) : null,
    grund: o.grund,
  });
}

export interface Umgebung {
  dms: string;
  datenbankStand: string | null;
  postgres: string;
  node: string;
  system: string;
  architektur: string;
}

/** Inhalt der Datei <name>.json – für Menschen lesbar, ohne den Schlüssel. */
export interface Metadaten {
  format: number;
  datei: string;
  haushaltId: string;
  umgebung: Umgebung;
  art: Sicherungsart;
  ausgeloestVon: string;
  beginn: string;
  ende: string;
  dauerSekunden: number;
  /** fassungen (seit 0.140.1, #577): umgewandelte Fassungen von Paketen; zählen auch in `dateien` (je zwei Dateien). */
  anzahl: Zaehler & {
    dateien: number;
    tabellen: number;
    fassungen?: number;
    /** Archivfassungen (PDF/A, #631, seit 0.149.0). */ archivfassungen?: number;
  };
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
export const PLAN_STANDARD: Plan = {
  aktiv: false,
  uhrzeit: '02:00',
  haeufigkeit: 'taeglich',
  wochentag: 7,
  aufbewahrung: { taeglich: 7, woechentlich: 4, monatlich: 12 },
  mindestFreiGB: 1,
  aktivSeit: null,
  nurNeueste: false,
};

/* ---------- Sicherung außer Haus (#585) ---------- */

/**
 * Was ein Paket mit `dms:sicherung-lesen` über eine Sicherung erfährt – und was es neben die Datei auf das Ziel legt
 * (`<name>.json`). Bewusst ohne Person (ausgeloestVon), Umgebung (Versionen, System), Zähler und Ablage-Id.
 * Die Wiederherstellung kommt damit aus: Was fehlt, steht verschlüsselt im Kopf der Sicherung (#585).
 */
export interface SchlankeMetadaten {
  format: number;
  schlank: true;
  datei: string;
  groesse: number;
  sha256: string;
  beginn: string;
  verschluesselung: { verfahren: string; fingerabdruck: string };
}
export const schlankeMetadaten = (m: Metadaten): SchlankeMetadaten => ({
  format: m.format,
  schlank: true,
  datei: m.datei,
  groesse: m.groessen.sicherungBytes,
  sha256: m.sha256,
  beginn: m.beginn,
  verschluesselung: { verfahren: m.verschluesselung.verfahren, fingerabdruck: m.verschluesselung.fingerabdruck },
});
export const istSchlank = (x: unknown): x is SchlankeMetadaten =>
  !!x && typeof x === 'object' && (x as { schlank?: unknown }).schlank === true;

/** Stand der Kopie außer Haus je Sicherung und Paket: Rückmeldung des Pakets (#585). */
export type ExternStatus = 'offen' | 'laeuft' | 'hochgeladen' | 'geprueft' | 'fehlgeschlagen';
/**
 * Wie das Paket die Kopie am Ziel geprüft hat: pruefsumme (SHA-256 vom Ziel bestätigt oder vollständig zurückgelesen),
 * stichprobe (Größe und Stichproben zurückgelesen), groesse (nur die Größe – z. B. Ziel ohne Lesezugriff), keine.
 */
export type ExternPruefung = 'pruefsumme' | 'stichprobe' | 'groesse' | 'keine';
export interface ExternStand {
  status: ExternStatus;
  pruefung?: ExternPruefung;
  grund?: string;
  /** Hilft eine Wiederholung nicht (Prüfsumme falsch, Anmeldung abgelehnt, aufgegeben)? Dann E-Mail. */
  endgueltig?: boolean;
  /** Ziel in Worten, vom Paket (ohne Zugangsdaten), z. B. „WebDAV https://cloud.example.org/…/DMS“. */
  ziel?: string;
  bytes?: number;
  gesamt?: number;
  /** Ereignis angelegt; letzte Rückmeldung. */
  seit: string;
  am: string;
}
/** Ein Paket, das Sicherungen außer Haus kopiert, mit der bestätigten Adresse aus seinen Einstellungen. */
export interface Sicherungsziel {
  id: string;
  name: string;
  adresse: string | null;
  ziel?: string | null;
}
/** Aufruf eines Pakets mit dms:sicherung-holen (Läufer); Ergebnis als Text (#1278, Schritt 5b: vorher in sicherung-entfernt.ts). */
type HolAufruf = (paket: string, eingang: Record<string, unknown>, ms?: number) => Promise<string>;
/** Verbindung zu den Paketen (index.ts): Pakete mit dms:sicherung-lesen und das Ereignis sicherung.fertig. */
export interface ExternAnbindung {
  /** holen: Das Paket hat auch dms:sicherung-holen (#976). */
  pakete(): Promise<Array<{ id: string; name: string; adresse: string | null; holen?: boolean }>>;
  melde(daten: SchlankeMetadaten & { name: string }): Promise<void>;
  /** Aufträge „auflisten“ und „holen“ an ein Paket mit dms:sicherung-holen (#976). */
  holen?: HolAufruf;
}
export const EXTERN_STATUS: ExternStatus[] = ['laeuft', 'hochgeladen', 'geprueft', 'fehlgeschlagen'];
export const EXTERN_PRUEFUNG: ExternPruefung[] = ['pruefsumme', 'stichprobe', 'groesse', 'keine'];
export const erfolgreich = (s: ExternStand) => s.status === 'hochgeladen' || s.status === 'geprueft';
/** Zugangsdaten aus einer Adresse im Text entfernen (https://benutzer:passwort@host → https://host). */
export const ohneZugangsdaten = (t: string) => t.replace(/(\w+:\/\/)[^/@\s]*@/g, '$1');

export interface Lauf {
  art: 'sicherung' | 'pruefsumme' | 'holen';
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

export interface Probeergebnis {
  am: string;
  ok: boolean;
  info: string;
}
/**
 * schlank (#585): Statt der vollständigen Metadaten liegt nur die schlanke Fassung daneben (z. B. vom externen Ziel
 * zurückgeholt); die Wiederherstellung liest den Rest mit dem Schlüssel aus der Sicherung selbst.
 * extern: Stand der Kopie außer Haus je Paket.
 */
export interface Eintragsliste {
  name: string;
  meta: Metadaten | null;
  schlank?: SchlankeMetadaten;
  bytes: number;
  pruefung?: { am: string; ok: boolean };
  probe?: Probeergebnis;
  extern?: Record<string, ExternStand>;
}

/** Zeitplan der Probe-Wiederherstellung (#109), Standard sonntags 04:00. */
export interface ProbePlan {
  aktiv: boolean;
  wochentag: number;
  uhrzeit: string;
}
export const PROBE_STANDARD: ProbePlan = { aktiv: true, wochentag: 7, uhrzeit: '04:00' };
/** Ab hier ist die letzte erfolgreiche Probe zu alt (gelb). */
export const PROBE_TAGE = 8;

export interface Fehlerstand {
  am: string;
  art: Sicherungsart;
  grund: string;
}

export interface SicherungsQuellen {
  tresor: {
    bereit: boolean;
    fingerabdruck: string | null;
    abgeleitet(zweck: string): Buffer | null;
    /** Mehrere Prozesse (#745): Schlüssel neu lesen, den ein anderer Prozess eben erzeugt hat (#1419). */
    nachladen?(): Promise<boolean>;
  };
  einstellungen: Einstellungen;
  daten: Datenquelle;
  umgebung(): Promise<Omit<Umgebung, 'datenbankStand' | 'postgres'>>;
  /** Läuft der Wartungsmodus (#102)? Dann pausiert die automatische Sicherung. */
  wartungAktiv?: () => boolean;
  /** Mail an alle Administratoren (#105). */
  anAdmins?: (betreff: import('../mail/mail').MailText, text: import('../mail/mail').MailText) => Promise<void>;
  /** Für Tests: Einhängepunkte. */
  mountinfo?: string;
  jetzt?: () => Date;
}

const teileIn = (d: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('de-DE', {
      timeZone: zeitzone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
const WOCHENTAGE: Record<string, number> = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 7 };
/** Datum (JJJJ-MM-TT), Uhrzeit (HH:MM) und Wochentag (1–7) in deutscher Zeit. */
export function ortszeit(d: Date) {
  const t = teileIn(d);
  return {
    datum: `${t.year}-${t.month}-${t.day}`,
    uhr: `${t.hour === '24' ? '00' : t.hour}:${t.minute}`,
    wochentag: WOCHENTAGE[t.weekday.replace('.', '')] ?? 0,
  };
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
      gesehen.add(k);
      bleibt.add(s.name);
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
    if (!Number.isFinite(n) || n < min || n > max)
      throw new Fachfehler(422, t('meldungen.sicherung.bitte-eine-zahl-zwischen', { min, max }));
    return Math.trunc(n);
  };
  const uhrzeit = x.uhrzeit === undefined ? alt.uhrzeit : String(x.uhrzeit);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new Fachfehler(422, t('meldungen.sicherung.die-uhrzeit-bitte-als'));
  const haeufigkeit =
    x.haeufigkeit === undefined
      ? alt.haeufigkeit
      : x.haeufigkeit === 'woechentlich'
        ? 'woechentlich'
        : x.haeufigkeit === 'taeglich'
          ? 'taeglich'
          : null;
  if (!haeufigkeit) throw new Fachfehler(422, t('meldungen.sicherung.haeufigkeit-taeglich-oder'));
  const a = (x.aufbewahrung ?? {}) as Record<string, unknown>;
  return {
    aktiv: x.aktiv === undefined ? alt.aktiv : x.aktiv === true,
    uhrzeit,
    haeufigkeit,
    wochentag: zahl(x.wochentag, alt.wochentag, 1, 7),
    aufbewahrung: {
      taeglich: zahl(a.taeglich, alt.aufbewahrung.taeglich, 0, 366),
      woechentlich: zahl(a.woechentlich, alt.aufbewahrung.woechentlich, 0, 260),
      monatlich: zahl(a.monatlich, alt.aufbewahrung.monatlich, 0, 240),
    },
    mindestFreiGB: zahl(x.mindestFreiGB, alt.mindestFreiGB, 0, 100_000),
    aktivSeit: typeof x.aktivSeit === 'string' ? x.aktivSeit : (alt.aktivSeit ?? null),
    nurNeueste: x.nurNeueste === undefined ? (alt.nurNeueste ?? false) : x.nurNeueste === true,
  };
}

/** Alle Dateien unter einem Ordner, mit Pfad relativ zum Ordner (Trennzeichen „/“). */
export async function* dateienUnter(wurzel: string): AsyncGenerator<{ pfad: string; voll: string; groesse: number }> {
  let eintraege;
  try {
    eintraege = await readdir(wurzel, { withFileTypes: true, recursive: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  const liste = eintraege
    .filter((d) => d.isFile() && !d.name.endsWith('.tmp'))
    .map((d) => join(d.parentPath ?? (d as unknown as { path: string }).path, d.name))
    .sort();
  for (const voll of liste) {
    const s = await stat(voll).catch(() => null);
    if (!s?.isFile()) continue; // inzwischen gelöscht
    yield { pfad: relative(wurzel, voll).split(sep).join('/'), voll, groesse: s.size };
  }
}
