import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { arbeite } from './arbeit';
import { zeitzone } from '../../shared/src/region';
import type { Zelle } from './xlsx';
import { aufbewahrenBis } from '../../shared/src/archiv';
import { EXPORT_TAGE } from '../../shared/src/auskunft';
import { kernTyp } from '../../shared/src/dateiumwandlung';
import { auswahlText, istLeer, verweiseVon, type Aufgabe, type Dokument, type DokumentVersion, type Mappe, type Mappentyp, type Notiz, type Vertretung, type Werte } from '../../shared/src/model';
import { istZeitraum, zeitraumIso } from '../../shared/src/feldarten';
import type { Erinnerung } from '../../shared/src/fristen';
import type { Nummernkreis } from '../../shared/src/nummernkreis';
import type { Sicht } from '../../shared/src/sichten';
import { exportSpalten, sichererName, spaltenKopf, zeile } from './export';
import { Fachfehler } from './fehler';
import type { PapierkorbEintrag } from './repo';
import { alsZeile, LOESCH_SPALTEN, type LoeschEintrag } from '../../shared/src/loeschprotokoll';
import { t } from './sprache';
import { EXPORT_STUECK_ZEICHEN as STUECK_ZEICHEN } from './grenzen';
import { kennungAlsDateiname } from '../../shared/src/kennungen';

/**
 * Vollexport aller Daten in offenen Formaten (#254): ein Ordner, lesbar ohne das DMS.
 * CSV (RFC 4180, Komma, UTF-8 mit BOM), JSON Lines, Excel, PDF, iCalendar, vCard 4.0,
 * Dokumente im Original (mit allen Versionen). manifest.json enthält SHA-256 und Größe jeder Datei.
 */

export const FORMATVERSION = 1;

/**
 * Wo jede Tabelle der Datenbank im Export steht – oder warum nicht. Ein Test vergleicht das mit den
 * Tabellen der Datenbank: Eine neue Tabelle ohne Eintrag hier lässt ihn fehlschlagen.
 */
export const EXPORT_TABELLEN: Record<string, string> = {
  haushalte: t('meldungen.vollexport.manifest-json-haushalt'),
  mappentypen: 'struktur/mappentypen.json',
  sichten: 'struktur/sichten.json',
  nummernkreise: 'struktur/nummernkreise.json',
  pakete: 'struktur/pakete.json',
  designs: 'struktur/designs.json',
  synonyme: t('meldungen.vollexport.struktur-synonyme-json-356'),
  automatisierungen: t('meldungen.vollexport.struktur-automatisierungen-json-674'),
  automatisierung_fassungen: t('meldungen.vollexport.struktur-automatisierungen-json-674-2'),
  automatisierung_laeufe: t('meldungen.vollexport.nicht-enthalten-laeufe-der'),
  benutzer: t('meldungen.vollexport.struktur-benutzer-json-ohne'),
  benutzer_einstellungen: t('meldungen.vollexport.struktur-benutzer-json-einstellungen'),
  mappen: t('meldungen.vollexport.daten-typ-csv-jsonl'),
  verweise: 'daten/verweise.csv',
  dokumente: t('meldungen.vollexport.daten-dokumente-csv-und'),
  dokument_versionen: t('meldungen.vollexport.daten-dokumente-csv-und-2'),
  notizen: 'daten/notizen.jsonl',
  aufgaben: t('meldungen.vollexport.daten-aufgaben-jsonl-und'),
  erinnerungen: t('meldungen.vollexport.daten-erinnerungen-jsonl-und'),
  historie: 'daten/historie.jsonl',
  favoriten: 'daten/favoriten.csv',
  papierkorb: 'daten/papierkorb.jsonl',
  papierkorb_dokumente: t('meldungen.vollexport.daten-papierkorb-dokumente-jsonl'),
  loeschprotokoll: t('meldungen.vollexport.daten-loeschprotokoll-csv-470'),
  vertretungen: 'daten/vertretungen.jsonl',
  aufgaben_ohne_leserecht: t('meldungen.vollexport.nicht-enthalten-aufgaben-bei'),
  fehlermeldungen: t('meldungen.vollexport.nicht-enthalten-gemeldete-fehler'),
  langlaeufer: t('meldungen.vollexport.nicht-enthalten-messwerte-langsamer'),
  einstellungen: t('meldungen.vollexport.nicht-enthalten'),
  api_schluessel: t('meldungen.vollexport.nicht-enthalten-geheimnisse'),
  paket_code: t('meldungen.vollexport.nicht-enthalten-code-installierter'),
  paket_sprachen: t('meldungen.vollexport.nicht-enthalten-sprachpakete'),
  paket_ereignisse: t('meldungen.vollexport.nicht-enthalten-ereignisse-fuer'),
  passwort_links: t('meldungen.vollexport.nicht-enthalten-geheimnisse'),
  notfallcode: t('meldungen.vollexport.nicht-enthalten-notfallcode-vom'),
  auskunft_links: t('meldungen.vollexport.nicht-enthalten-abruf-links'),
  sitzungen: t('meldungen.vollexport.nicht-enthalten-anmeldungen'),
  kurzzustand: t('meldungen.vollexport.nicht-enthalten-zustand-zwischen'),
  erkennungen: t('meldungen.vollexport.nicht-enthalten-ergebnis-der'),
  suchwoerter: t('meldungen.vollexport.nicht-enthalten-woerterverzeichnis'),
  suchwoerter_eingang: t('meldungen.vollexport.nicht-enthalten-neue-woerter'),
  fristtermine: t('meldungen.vollexport.nicht-enthalten-fristtermine'),
  vektoren: t('meldungen.vollexport.nicht-enthalten-vektoren-zu'),
  gesehen: t('meldungen.vollexport.nicht-enthalten-wann-ein'),
  zaehlerstaende: t('meldungen.vollexport.nicht-enthalten-stand-der'),
  haushaltsstand: t('meldungen.vollexport.nicht-enthalten-stand-der-2'),
  webhooks: t('meldungen.vollexport.nicht-enthalten-webhooks-der'),
  webhook_meldungen: t('meldungen.vollexport.nicht-enthalten-ausgangskorb-der'),
  ereignisse: t('meldungen.vollexport.nicht-enthalten-ausgangskorb-des'),
  frist_meldungen: t('meldungen.vollexport.nicht-enthalten-welche-fristen'),
  schema_migrationen: t('meldungen.vollexport.nicht-enthalten-stand-der-3'),
};

/** Kontaktfelder für vCard (#254): Feldschlüssel je Angabe; vom Administrator bestätigt. */
export interface KontaktZuordnung { name: string; email?: string; telefon?: string; adresse?: string; firma?: string; notiz?: string }
export interface ExportOptionen {
  /** Passwortfelder im Klartext als passwoerter.csv (Bitwarden-Format) – nur mit ausdrücklicher Bestätigung. */
  passwoerter?: boolean;
  /** Technische Protokolle (Arbeitsspeicher) mitnehmen. */
  protokolle?: boolean;
  /** vCard je Mappentyp: Typ-Id → Zuordnung. */
  kontakte?: Record<string, KontaktZuordnung>;
  /** Eigener Text für LIESMICH.md (Auskunft, #396); Standard: der des Vollexports. */
  liesmich?: string;
  /** Zweck im Manifest (Auskunft, #396); das Format bleibt dms-vollexport. */
  zweck?: string;
}

export interface ExportQuelle {
  mandant: string; version: string;
  typen(): Promise<Mappentyp[]>;
  sichten(): Promise<Sicht[]>;
  nummernkreise(): Promise<Nummernkreis[]>;
  /** Installierte Pakete (#188). */
  pakete(): Promise<unknown[]>;
  designs(): Promise<unknown[]>;
  /** Gleichbedeutende Wörter der Suche (#356); fehlt bei Auskunft und persönlichem Export. */
  synonyme?(): Promise<unknown[]>;
  /** Region der Ablage (#726); fehlt bei Auskunft und persönlichem Export. */
  region?(): Promise<unknown>;
  /** Merkmale der Ablage (#1032), z. B. „beruflich genutzt“; fehlt bei Auskunft und persönlichem Export. */
  merkmale?(): Promise<unknown>;
  /** Automatisierungen mit Änderungsverlauf (#674); fehlt bei Auskunft und persönlichem Export. */
  automatisierungen?(): Promise<unknown[]>;
  mappen(typId: string): Promise<Mappe[]>;
  papierkorb(): Promise<PapierkorbEintrag[]>;
  /** Einzeln gelöschte Dokumente (#344); fehlt bei älteren Quellen. */
  papierkorbDokumente?(): Promise<unknown[]>;
  /** Löschprotokoll (#470), älteste zuerst; fehlt bei Auskunft und persönlichem Export. */
  loeschprotokoll?(): Promise<LoeschEintrag[]>;
  /*
   * Gebündelt je Paket von Mappen bzw. Dokumenten (#367): ein Zugriff je Paket statt je Mappe
   * oder Dokument. Die Reihenfolge innerhalb einer Mappe bzw. eines Dokuments zählt, die zwischen
   * ihnen nicht.
   */
  dokumente(mappeIds: string[]): Promise<Dokument[]>;
  versionen(dokumentIds: string[]): Promise<DokumentVersion[]>;
  /** Volltexte; Dokumente ohne fehlen. */
  volltexte(dokumentIds: string[]): Promise<Map<string, string>>;
  datei(sha256: string): Promise<Readable | Buffer>;
  /** Umgewandelte Fassung eines Pakets (#577) für Dateitypen, die das DMS nicht selbst liest; fehlt bei älteren Quellen. */
  fassung?(sha256: string): Promise<{ mime: string; inhalt: Buffer } | null>;
  /** Archivfassung (PDF/A) eines Pakets (#631); `imOriginal`: das Original ist schon PDF/A. Fehlt bei der Auskunft. */
  archivfassung?(sha256: string): Promise<{ inhalt: Buffer | null } | { imOriginal: true } | null>;
  notizen(mappeIds: string[]): Promise<Notiz[]>;
  aufgaben(mappeIds: string[]): Promise<Aufgabe[]>;
  erinnerungen(): Promise<Erinnerung[]>;
  historie(mappeIds: string[]): Promise<Array<{ mappeId: string }>>;
  favoriten(): Promise<Array<{ benutzerId: string; mappeId: string }>>;
  benutzer(): Promise<{ benutzer: Array<Record<string, unknown>>; vertretungen: Vertretung[] }>;
  passwort(wert: unknown): string | null;
  protokoll(): unknown[];
  pdf(titel: string, mappen: Mappe[], typ: Mappentyp, uebersicht: boolean): Promise<Buffer>;
}

/* ---------- Formate ---------- */

const feld = (s: string) => (/[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** Eine Zeile CSV mit CRLF. */
const csvZeile = (z: string[]) => `${z.map(feld).join(',')}\r\n`;
const BOM = '\ufeff';
/** CSV nach RFC 4180: Komma, CRLF, Anführungszeichen bei Bedarf, UTF-8 mit BOM. */
export function csv(kopf: string[], zeilen: string[][]): Buffer {
  return Buffer.from(BOM + [kopf, ...zeilen].map(csvZeile).join(''), 'utf8');
}
const jsonl = (zeilen: unknown[]) => Buffer.from(zeilen.map((z) => JSON.stringify(z)).join('\n') + (zeilen.length ? '\n' : ''), 'utf8');
/**
 * Kurz die Ereignisschleife freigeben (#746), damit andere Anfragen drankommen: spätestens nach TAKT_MS Rechenzeit.
 * Nach der Zeit statt nach einer festen Zahl von Zeilen – eine Zeile für Excel kostet ein Vielfaches einer Zeile CSV.
 */
const TAKT_MS = 10;
let letztePause = performance.now();
async function pause() {
  if (performance.now() - letztePause < TAKT_MS) return;
  await new Promise<void>((r) => setImmediate(r));
  letztePause = performance.now();
}
const json = (x: unknown) => Buffer.from(JSON.stringify(x, null, 2) + '\n', 'utf8');

/** iCalendar: Text maskieren und Zeilen auf 75 Oktette falten. */
function ics(text: string) { return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function falte(z: string): string {
  const b = Buffer.from(z, 'utf8');
  if (b.length <= 75) return z;
  const teile: string[] = []; let rest = z;
  while (Buffer.byteLength(rest) > 75) {
    let n = 75; while (Buffer.byteLength(rest.slice(0, n)) > (teile.length ? 74 : 75)) n--;
    teile.push(rest.slice(0, n)); rest = rest.slice(n);
  }
  teile.push(rest);
  return teile.join('\r\n ');
}

/** Wert einer Zelle: maschinenlesbar (ISO 8601, Punkt als Dezimaltrennzeichen, Ids). */
function zelle(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).join(' | ');
  if (typeof v === 'object') {
    if ('betrag' in (v as object)) return String((v as { betrag: unknown }).betrag ?? '');
    // Zeitraum (#1035) nach ISO 8601: P3M = 3 Monate.
    if (istZeitraum(v)) return zeitraumIso(v);
    return JSON.stringify(v);
  }
  return String(v);
}
/** Passwortfelder nie im Klartext: nur „gesetzt“. */
function ohnePasswoerter(t: Mappentyp | undefined, w: Werte): Werte {
  const x = { ...w };
  for (const f of t?.felder ?? []) if (f.typ === 'passwort' && !istLeer(x[f.key])) x[f.key] = { gesetzt: true } as never;
  return x;
}

/* ---------- Schreiben mit Prüfwert ---------- */

interface Eintrag { pfad: string; bytes: number; sha256: string }

/**
 * Eine Datei Zeile für Zeile (#746): Text in Stücken an den Schreibstrom, mit Gegendruck (drain), Prüfwert beim
 * Schreiben und Pausen (TAKT_MS) – statt die ganze Datei als einen Text im Speicher zu bauen.
 */
class Zeilen {
  private readonly h = createHash('sha256');
  private n = 0;
  private stueck: string[] = [];
  private zeichen = 0;
  private fehler: Error | null = null;
  private readonly strom: WriteStream;
  /** `modus`: Rechte der Datei, z. B. 0o600 für Arbeitsdateien (nur der Dienstbenutzer). */
  constructor(readonly rel: string, pfad: string, modus?: number) {
    this.strom = createWriteStream(pfad, modus === undefined ? {} : { mode: modus, flags: 'wx' });
    this.strom.on('error', (e) => { this.fehler ??= e; });
  }
  async schreibe(text: string) {
    this.stueck.push(text);
    this.zeichen += text.length;
    if (this.zeichen >= STUECK_ZEICHEN) await this.leere();
    await pause();
  }
  private async leere() {
    if (this.fehler) throw this.fehler;
    if (!this.stueck.length) return;
    const b = Buffer.from(this.stueck.join(''), 'utf8');
    this.stueck = []; this.zeichen = 0;
    this.h.update(b); this.n += b.length;
    if (!this.strom.write(b)) {
      await new Promise<void>((r, f) => {
        const weiter = () => { this.strom.off('error', fehler); r(); };
        const fehler = (e: Error) => { this.strom.off('drain', weiter); f(e); };
        this.strom.once('drain', weiter); this.strom.once('error', fehler);
      });
    }
  }
  async ende(): Promise<Eintrag> {
    await this.leere();
    await new Promise<void>((r, f) => this.strom.end((e?: Error | null) => (e ?? this.fehler ? f(e ?? this.fehler) : r())));
    return { pfad: this.rel, bytes: this.n, sha256: this.h.digest('hex') };
  }
  abbrechen() { this.strom.destroy(); }
}

class Schreiber {
  readonly dateien: Eintrag[] = [];
  bytes = 0;
  private readonly offen = new Set<Zeilen>();
  constructor(readonly ordner: string) {}
  /** Datei zum zeilenweisen Schreiben öffnen; ins Manifest kommt sie mit `schliesse` (Reihenfolge wie bisher). */
  async oeffne(rel: string): Promise<Zeilen> {
    const pfad = join(this.ordner, ...rel.split('/'));
    await mkdir(dirname(pfad), { recursive: true });
    const z = new Zeilen(rel, pfad);
    this.offen.add(z);
    return z;
  }
  async schliesse(z: Zeilen) {
    const e = await z.ende();
    this.offen.delete(z);
    this.dateien.push(e);
    this.bytes += e.bytes;
  }
  /** Bei einem Fehler: offene Dateien schließen (der Ordner wird danach gelöscht). */
  abbrechen() { for (const z of this.offen) z.abbrechen(); this.offen.clear(); }
  async schreibe(rel: string, inhalt: Buffer | Readable | (() => Promise<Buffer | Readable>)) {
    const pfad = join(this.ordner, ...rel.split('/'));
    await mkdir(dirname(pfad), { recursive: true });
    const quelle = typeof inhalt === 'function' ? await inhalt() : inhalt;
    const h = createHash('sha256'); let n = 0;
    if (Buffer.isBuffer(quelle)) { h.update(quelle); n = quelle.length; await writeFile(pfad, quelle); }
    else {
      await pipeline(quelle, new Transform({ transform(c: Buffer, _e, cb) { h.update(c); n += c.length; cb(null, c); } }), createWriteStream(pfad));
    }
    this.dateien.push({ pfad: rel, bytes: n, sha256: h.digest('hex') });
    this.bytes += n;
  }
}

/** Eindeutige, sichere Namen innerhalb eines Ordners. */
function namen() {
  const vergeben = new Set<string>();
  return (wunsch: string) => {
    const s = sichererName(wunsch, 120) || 'Datei';
    const p = s.lastIndexOf('.');
    const [stamm, endung] = p > 0 ? [s.slice(0, p), s.slice(p)] : [s, ''];
    let n = s, i = 2;
    while (vergeben.has(n.toLowerCase())) n = `${stamm} (${i++})${endung}`;
    vergeben.add(n.toLowerCase());
    return n;
  };
}

/* ---------- Export ---------- */

/** Mappen je Zugriff beim Export (#367) und Dokumente je Zugriff auf die Volltexte. */
const EXPORT_PAKET = 200;
const VOLLTEXT_PAKET = 100;
function gruppiere<T>(liste: T[], schluessel: (x: T) => string): Map<string, T[]> {
  const r = new Map<string, T[]>();
  for (const x of liste) { const k = schluessel(x); const l = r.get(k); if (l) l.push(x); else r.set(k, [x]); }
  return r;
}

export interface ExportErgebnis {
  ordner: string; name: string; dateien: number; bytes: number; mappen: number; dokumente: number;
  /** Pfad (relativ zum Export) je Mappe (Ordner) und je Dokument (Datei) – für Übersichten, die darauf verlinken (#396). */
  pfade: { mappen: Map<string, string>; dokumente: Map<string, string> };
}

/** Phasen des Auftrags (#364): je Mappe ein Schritt, danach Listen, Kalender und Manifest. */
export const VOLLEXPORT_PHASEN = [
  { key: 'mappen', name: t('meldungen.vollexport.mappen-exportieren'), einheit: 'Mappen' },
  { key: 'abschluss', name: t('meldungen.vollexport.listen-und-pruefwerte-schreiben'), einheit: 'Schritte' },
];

export async function vollexport(q: ExportQuelle, ziel: string, opt: ExportOptionen, fortschritt: (fertig: number, gesamt: number, phase?: string) => void = () => {}, jetzt = new Date()): Promise<ExportErgebnis> {
  const name = `dms-export-${jetzt.toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;
  const ordner = join(ziel, name);
  await mkdir(ordner, { recursive: true });
  const w = new Schreiber(ordner);
  try {
    return await schreibeExport(q, w, name, opt, fortschritt, jetzt);
  } catch (e) {
    // Abgebrochen (#746, Sicherheit): Nichts Halbes liegen lassen – der Ordner ist unverschlüsselt.
    w.abbrechen();
    await rm(ordner, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

async function schreibeExport(q: ExportQuelle, w: Schreiber, name: string, opt: ExportOptionen, fortschritt: (fertig: number, gesamt: number, phase?: string) => void, jetzt: Date): Promise<ExportErgebnis> {
  const ordner = w.ordner;
  const typen = await q.typen();
  const typVon = new Map(typen.map((t) => [t.id, t] as const));
  const alleMappen = new Map<string, Mappe>();
  const jeTyp = new Map<string, Mappe[]>();
  for (const t of typen) { const ms = await q.mappen(t.id); jeTyp.set(t.id, ms); for (const m of ms) alleMappen.set(m.id, m); }
  const titel = (id: string | null | undefined) => (id ? alleMappen.get(id)?.titel ?? '' : '');
  const quelle = { typen: typVon, titel };
  let fertig = 0; const gesamt = alleMappen.size;
  const weiter = () => fortschritt(++fertig, gesamt, 'mappen');
  let schritt = 0;
  const abschluss = () => fortschritt(++schritt, 3, 'abschluss');
  fortschritt(0, gesamt, 'mappen');

  // Struktur
  const b = await q.benutzer();
  await w.schreibe('struktur/mappentypen.json', json(typen));
  await w.schreibe('struktur/sichten.json', json(await q.sichten()));
  await w.schreibe('struktur/nummernkreise.json', json(await q.nummernkreise()));
  await w.schreibe('struktur/pakete.json', json(await q.pakete()));
  await w.schreibe('struktur/designs.json', json(await q.designs()));
  if (q.synonyme) await w.schreibe('struktur/synonyme.json', json(await q.synonyme()));
  if (q.region) await w.schreibe('struktur/region.json', json(await q.region()));
  if (q.merkmale) await w.schreibe('struktur/merkmale.json', json(await q.merkmale()));
  if (q.automatisierungen) await w.schreibe('struktur/automatisierungen.json', json(await q.automatisierungen()));
  await w.schreibe('struktur/benutzer.json', json(b.benutzer));

  // Daten je Mappentyp
  const ordnerTyp = namen();
  // Listen über alle Mappen (#746): gleich beim Durchgang Zeile für Zeile schreiben, nicht erst sammeln.
  // Ins Manifest kommen sie unten in der bisherigen Reihenfolge.
  const verweise = await w.oeffne('daten/verweise.csv');
  await verweise.schreibe(BOM + csvZeile(['quelle_id', 'feld', 'feld_schluessel', 'ziel_id', 'ziel_titel']));
  const dokListe = await w.oeffne('daten/dokumente.csv');
  await dokListe.schreibe(BOM + csvZeile(['dokument_id', 'mappe_id', 'register', 'dateiname', 'typ', 'groesse', 'sha256', 'erstellt', 'erstellt_von', 'version', 'stand', 'pfad', 'fassung', 'archivfassung']));
  const notizDatei = await w.oeffne('daten/notizen.jsonl');
  const aufgabeDatei = await w.oeffne('daten/aufgaben.jsonl');
  const historieDatei = await w.oeffne('daten/historie.jsonl');
  const zahl = { verweise: 0, notizen: 0, aufgaben: 0, historie: 0 };
  /** Für den Kalender: nur offene Aufgaben mit Datum. */
  const termine: Array<{ id: string; datum: string; text: string; mappeId: string }> = [];
  const passwoerter: string[][] = [];
  const pfade: ExportErgebnis['pfade'] = { mappen: new Map(), dokumente: new Map() };
  let dokumente = 0;
  /** Umgewandelte Fassung (#577) neben das Original: `<Datei>.fassung.pdf` (bzw. .png, .jpg); liefert ihren Pfad. */
  const fassung = async (d: { mime: string; sha256: string }, rel: string): Promise<string> => {
    if (!q.fassung || kernTyp(d.mime)) return '';
    const f = await q.fassung(d.sha256).catch(() => null);
    if (!f) return '';
    const frel = `${rel}.fassung.${f.mime === 'application/pdf' ? 'pdf' : f.mime === 'image/png' ? 'png' : 'jpg'}`;
    await w.schreibe(frel, f.inhalt);
    return frel;
  };
  /** Archivfassung (#631) neben das Original: `<Datei>.pdfa.pdf`; ist das Original schon PDF/A: „original“. */
  const archiv = async (d: { sha256: string }, rel: string): Promise<string> => {
    if (!q.archivfassung) return '';
    const a = await q.archivfassung(d.sha256).catch(() => null);
    if (!a) return '';
    if ('imOriginal' in a) return 'original';
    if (!a.inhalt) return '';
    await w.schreibe(`${rel}.pdfa.pdf`, a.inhalt);
    return `${rel}.pdfa.pdf`;
  };
  for (const mappentyp of typen) {
    const ms = jeTyp.get(mappentyp.id) ?? [];
    // Kennung `paket:schluessel` (#1084): im Dateinamen mit Punkt statt Doppelpunkt (Windows kennt keinen Doppelpunkt).
    const dateiname = sichererName(mappentyp.schluessel ? kennungAlsDateiname(mappentyp.schluessel) : mappentyp.name, 130);
    // CSV und JSON Lines: alle Felder, Verweise als Id und Titel.
    const kopf = ['id', 'titel', 'angelegt', 'angelegt_von', 'geaendert', 'geaendert_von', ...(mappentyp.archiv ? ['aufbewahren_bis'] : []),
      ...mappentyp.felder.flatMap((f) => (f.typ === 'referenz' ? [f.key, `${f.key}_titel`] : f.typ === 'betrag' ? [f.key, `${f.key}_waehrung`] : [f.key]))];
    const csvZeileVon = (m: Mappe) => [m.id, m.titel ?? '', m.erstellt, m.erstelltVon ?? '', m.geaendert, m.geaendertVon ?? '', ...(mappentyp.archiv ? [aufbewahrenBis(mappentyp.archiv, m) ?? ''] : []),
      ...mappentyp.felder.flatMap((f) => {
        const v = m.werte[f.key];
        if (f.typ === 'passwort') return [istLeer(v) ? '' : '(gesetzt)'];
        if (f.typ === 'referenz') { const ids = Array.isArray(v) ? v.map(String) : v ? [String(v)] : []; return [ids.join(' | '), ids.map(titel).join(' | ')]; }
        if (f.typ === 'betrag') { const x = v && typeof v === 'object' ? v as { betrag?: unknown; waehrung?: unknown } : {}; return [x.betrag == null ? '' : String(x.betrag), String(x.waehrung ?? '')]; }
        return [zelle(v)];
      })];
    // CSV und JSON Lines Zeile für Zeile als Strom (#746).
    const c = await w.oeffne(`daten/${dateiname}.csv`);
    await c.schreibe(BOM + csvZeile(kopf));
    for (const m of ms) await c.schreibe(csvZeile(csvZeileVon(m)));
    await w.schliesse(c);
    const j = await w.oeffne(`daten/${dateiname}.jsonl`);
    for (const m of ms) await j.schreibe(`${JSON.stringify({ ...m, werte: ohnePasswoerter(mappentyp, m.werte) })}\n`);
    await w.schliesse(j);
    // Excel wie beim normalen Export (#542) im Arbeiter: Zeilen mit Pausen aufbereiten und als Strom in eine Arbeitsdatei
    // schreiben, die der Arbeiter liest; sie liegt nur kurz im Export-Ordner, nur für den Dienstbenutzer lesbar (0600),
    // und wird danach gelöscht (bei einem Abbruch geht sie mit dem Ordner).
    const spalten = exportSpalten([mappentyp], 'alle');
    const arbeitsdatei = join(ordner, `.tabelle-${dateiname}.jsonl`);
    const tab = new Zeilen('', arbeitsdatei, 0o600);
    try {
      for (const m of ms) await tab.schreibe(`${JSON.stringify(zeile({ ...m, werte: ohnePasswoerter(mappentyp, m.werte) }, spalten, quelle).werte satisfies Zelle[])}\n`);
      await tab.ende();
      await w.schreibe(`daten/${dateiname}.xlsx`, await arbeite('exportTabelleAusDatei', { titel: mappentyp.name, kopf: spalten.map((k) => spaltenKopf(k, [mappentyp])), datei: arbeitsdatei, zeitzone: zeitzone() }));
    } finally {
      tab.abbrechen();
      await rm(arbeitsdatei, { force: true });
    }
    if (ms.length) await w.schreibe(`uebersicht/${dateiname}.pdf`, () => q.pdf(mappentyp.name, ms.map((m) => ({ ...m, werte: ohnePasswoerter(mappentyp, m.werte) })), mappentyp, true));

    // Ablage: je Mappe ein Ordner. Dokumente, Volltexte, Versionen, Notizen, Aufgaben und Historie
    // je Paket von Mappen in einem Zugriff (#367) – nicht je Mappe oder Dokument.
    const tOrdner = ordnerTyp(mappentyp.name);
    const mOrdner = namen();
    for (let i = 0; i < ms.length; i += EXPORT_PAKET) {
      const paket = ms.slice(i, i + EXPORT_PAKET);
      const ids = paket.map((m) => m.id);
      const [dokJe, notizJe, aufgabeJe, historieJe] = await Promise.all([
        q.dokumente(ids).then((x) => gruppiere(x, (d) => d.mappeId)), q.notizen(ids).then((x) => gruppiere(x, (n) => n.mappeId)),
        q.aufgaben(ids).then((x) => gruppiere(x, (a) => a.mappeId)), q.historie(ids).then((x) => gruppiere(x, (h) => h.mappeId)),
      ]);
      const dokIds = [...dokJe.values()].flat().map((d) => d.id);
      const versionJe = gruppiere(await q.versionen(dokIds), (v) => v.dokumentId);
      // Volltexte in kleineren Paketen: sie können je Dokument groß sein.
      const texte = new Map<string, string>();
      for (let j = 0; j < dokIds.length; j += VOLLTEXT_PAKET) for (const [k, v] of await q.volltexte(dokIds.slice(j, j + VOLLTEXT_PAKET))) texte.set(k, v);
      for (const m of paket) {
        const pfad = `ablage/${tOrdner}/${mOrdner(`${m.titel || t('meldungen.vollexport.ohne-titel')} [${m.id.slice(0, 8)}]`)}`;
        pfade.mappen.set(m.id, pfad);
        await w.schreibe(`${pfad}/mappe.json`, json({ ...m, werte: ohnePasswoerter(mappentyp, m.werte), typ: mappentyp.name, ...(mappentyp.archiv ? { aufbewahrenBis: aufbewahrenBis(mappentyp.archiv, m) } : {}) }));
        await w.schreibe(`${pfad}/mappe.pdf`, () => q.pdf(m.titel || mappentyp.name, [{ ...m, werte: ohnePasswoerter(mappentyp, m.werte) }], mappentyp, false));
        for (const v of verweiseVon(mappentyp, m.werte)) { await verweise.schreibe(csvZeile([m.id, mappentyp.felder.find((f) => f.key === v.feldKey)?.label ?? v.feldKey, v.feldKey, v.zielId, titel(v.zielId)])); zahl.verweise++; }
        const dateiNamen = new Map<string, ReturnType<typeof namen>>();
        for (const d of dokJe.get(m.id) ?? []) {
          const reg = mappentyp.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey;
          const regName = sichererName(reg, 60);
          if (!dateiNamen.has(regName)) dateiNamen.set(regName, namen());
          const dn = dateiNamen.get(regName)!(d.name);
          const rel = `${pfad}/${regName}/${dn}`;
          await w.schreibe(rel, () => q.datei(d.sha256));
          pfade.dokumente.set(d.id, rel);
          const text = texte.get(d.id);
          if (text) await w.schreibe(`${rel}.txt`, Buffer.from(text, 'utf8'));
          await dokListe.schreibe(csvZeile([d.id, m.id, d.registerKey, d.name, d.mime, String(d.groesse), d.sha256, d.erstellt, d.erstelltVon ?? '', String(d.version ?? 1), 'aktuell', rel, await fassung(d, rel), await archiv(d, rel)]));
          dokumente++;
          const vn = namen();
          for (const v of versionJe.get(d.id) ?? []) {
            const vrel = `${pfad}/${regName}/Versionen/${vn(`v${v.nummer} ${v.name}`)}`;
            await w.schreibe(vrel, () => q.datei(v.sha256));
            await dokListe.schreibe(csvZeile([d.id, m.id, d.registerKey, v.name, v.mime, String(v.groesse), v.sha256, v.erstellt, v.erstelltVon ?? '', String(v.nummer), 'aelter', vrel, await fassung(v, vrel), await archiv(v, vrel)]));
          }
        }
        for (const n of notizJe.get(m.id) ?? []) { await notizDatei.schreibe(`${JSON.stringify(n)}\n`); zahl.notizen++; }
        for (const a of aufgabeJe.get(m.id) ?? []) {
          await aufgabeDatei.schreibe(`${JSON.stringify(a)}\n`); zahl.aufgaben++;
          if (a.datum && !a.erledigt) termine.push({ id: a.id, datum: a.datum, text: a.text, mappeId: a.mappeId });
        }
        for (const h of historieJe.get(m.id) ?? []) { await historieDatei.schreibe(`${JSON.stringify(h)}\n`); zahl.historie++; }
        if (opt.passwoerter) for (const f of mappentyp.felder.filter((x) => x.typ === 'passwort' && typeof m.werte[x.key] === 'string' && m.werte[x.key] !== '')) {
          const klar = q.passwort(m.werte[f.key]);
          if (klar === null) continue;
          const nutzer = mappentyp.felder.find((x) => x.typ === 'text' && /benutzer|login|user|e-?mail|konto/i.test(`${x.key} ${x.label}`));
          const url = mappentyp.felder.find((x) => x.typ === 'text' && /url|adresse|web|seite/i.test(`${x.key} ${x.label}`));
          passwoerter.push([mappentyp.name, '', 'login', `${m.titel || t('meldungen.vollexport.ohne-titel')}${mappentyp.felder.filter((x) => x.typ === 'passwort').length > 1 ? ` – ${f.label}` : ''}`, '', '', '0',
            url ? auswahlText(m.werte[url.key]) : '', nutzer ? auswahlText(m.werte[nutzer.key]) : '', klar, '']);
        }
        weiter();
      }
    }

    // vCard (#254): nur mit bestätigter Zuordnung
    const k = opt.kontakte?.[mappentyp.id];
    if (k && ms.length) {
      const wert = (m: Mappe, key?: string) => (key ? auswahlText(m.werte[key]) : '');
      const v = ms.map((m) => [
        'BEGIN:VCARD', 'VERSION:4.0', `FN:${ics(wert(m, k.name) || m.titel || '')}`,
        ...(wert(m, k.firma) ? [`ORG:${ics(wert(m, k.firma))}`] : []),
        ...(wert(m, k.email) ? [`EMAIL:${ics(wert(m, k.email))}`] : []),
        ...(wert(m, k.telefon) ? [`TEL:${ics(wert(m, k.telefon))}`] : []),
        ...(wert(m, k.adresse) ? [`ADR:;;${ics(wert(m, k.adresse))};;;;`] : []),
        ...(wert(m, k.notiz) ? [`NOTE:${ics(wert(m, k.notiz))}`] : []),
        t('meldungen.vollexport.uid-urn-uuid', { id: m.id }), 'END:VCARD',
      ].map(falte).join('\r\n')).join('\r\n') + '\r\n';
      await w.schreibe(`kontakte/${dateiname}.vcf`, Buffer.from(v, 'utf8'));
    }
  }

  await w.schliesse(verweise);
  await w.schliesse(dokListe);
  await w.schliesse(notizDatei);
  await w.schliesse(aufgabeDatei);
  const erinnerungen = await q.erinnerungen();
  await w.schreibe('daten/erinnerungen.jsonl', jsonl(erinnerungen));
  await w.schliesse(historieDatei);
  await w.schreibe('daten/favoriten.csv', csv(['benutzer_id', 'mappe_id'], (await q.favoriten()).map((f) => [f.benutzerId, f.mappeId])));
  await w.schreibe('daten/papierkorb.jsonl', jsonl((await q.papierkorb()).map((p) => ({ ...p, werte: ohnePasswoerter(typVon.get(p.typId), p.werte) }))));
  await w.schreibe('daten/papierkorb-dokumente.jsonl', jsonl(q.papierkorbDokumente ? await q.papierkorbDokumente() : []));
  if (q.loeschprotokoll) await w.schreibe('daten/loeschprotokoll.csv', csv(LOESCH_SPALTEN, (await q.loeschprotokoll()).map(alsZeile)));
  await w.schreibe('daten/vertretungen.jsonl', jsonl(b.vertretungen));
  abschluss();

  // Kalender: Fristen und Aufgaben mit Datum, Erinnerungen
  const tag = (d: string) => d.slice(0, 10).replace(/-/g, '');
  const stempel = jetzt.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ereignisse = [
    ...termine.map((a) => ({ id: a.id, datum: a.datum, titel: `${a.text}${titel(a.mappeId) ? ` – ${titel(a.mappeId)}` : ''}` })),
    ...erinnerungen.map((e) => ({ id: e.id, datum: e.datum, titel: `${e.text || t('meldungen.vollexport.erinnerung')}${titel(e.mappeId) ? ` – ${titel(e.mappeId)}` : ''}` })),
  ];
  await w.schreibe('kalender/fristen.ics', Buffer.from(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DMS//Vollexport//DE', 'CALSCALE:GREGORIAN',
    ...ereignisse.flatMap((e) => ['BEGIN:VEVENT', `UID:${e.id}@dms`, `DTSTAMP:${stempel}`, `DTSTART;VALUE=DATE:${tag(e.datum)}`, `SUMMARY:${ics(e.titel)}`, 'END:VEVENT']),
    'END:VCALENDAR'].map(falte).join('\r\n') + '\r\n', 'utf8'));

  if (opt.passwoerter) {
    await w.schreibe('passwoerter.csv', csv(['folder', 'favorite', 'type', 'name', 'notes', 'fields', 'reprompt', 'login_uri', 'login_username', 'login_password', 'login_totp'], passwoerter));
  }
  if (opt.protokolle) await w.schreibe('protokolle/protokoll.jsonl', jsonl(q.protokoll()));
  abschluss();

  const anzahlen = { mappentypen: typen.length, mappen: alleMappen.size, dokumente, verweise: zahl.verweise, notizen: zahl.notizen, aufgaben: zahl.aufgaben, erinnerungen: erinnerungen.length, historie: zahl.historie };
  await w.schreibe('LIESMICH.md', Buffer.from(opt.liesmich ?? liesmich(q, jetzt, anzahlen, opt), 'utf8'));
  // Manifest zuletzt; es nennt alle anderen Dateien mit Größe und Prüfwert.
  const manifest = { format: 'dms-vollexport', formatversion: FORMATVERSION, erstellt: jetzt.toISOString(), dms: q.version, mandant: q.mandant, anzahlen, passwoerter: !!opt.passwoerter, protokolle: !!opt.protokolle, ...(opt.zweck ? { zweck: opt.zweck } : {}), tabellen: EXPORT_TABELLEN, dateien: w.dateien };
  await writeFile(join(ordner, 'manifest.json'), json(manifest));
  abschluss();
  return { ordner, name, dateien: w.dateien.length + 1, bytes: w.bytes, mappen: alleMappen.size, dokumente, pfade };
}

function liesmich(q: ExportQuelle, jetzt: Date, n: Record<string, number>, opt: ExportOptionen) {
  return `# Ablago – Vollexport

Erstellt am ${jetzt.toISOString()} mit Ablago ${q.version} (Formatversion ${FORMATVERSION}), Haushalt „${q.mandant}“.
${n.mappen} Mappen in ${n.mappentypen} Mappentypen, ${n.dokumente} Dokumente.

Alles hier lässt sich ohne Ablago lesen. **Der Export ist unverschlüsselt** – bewahre ihn sicher auf.${opt.passwoerter ? '\n\n**Achtung: passwoerter.csv enthält Passwörter im Klartext.** Importiere sie in einen Passwortmanager (Bitwarden-CSV) und lösche die Datei danach.' : ''}

## Aufbau

| Ordner/Datei | Inhalt |
| --- | --- |
| \`manifest.json\` | Formatversion, Anzahlen, Größe und SHA-256 jeder Datei, wo jede Tabelle steht |
| \`struktur/\` | Mappentypen (Felder, Register, Titelvorlagen, Berechtigungen, Archiv), Ansichten, Nummernkreise, Designs, Benutzer (ohne Passwörter) |
| \`daten/<typ>.csv\` | je Mappentyp eine Tabelle: eine Zeile je Mappe, eine Spalte je Feldschlüssel; Verweise als Id und \`_titel\` |
| \`daten/<typ>.jsonl\` | dasselbe verlustfrei als JSON Lines (eine Mappe je Zeile) |
| \`daten/<typ>.xlsx\` | dasselbe für Excel/LibreOffice, mit Spaltenüberschriften |
| \`daten/verweise.csv\` | Mappe → Feld → Mappe |
| \`daten/dokumente.csv\` | alle Dokumente und ihre älteren Versionen mit Pfad im Export |
| \`daten/*.jsonl\` | Notizen, Aufgaben (mit Fristen), Erinnerungen, Historie, Papierkorb, Vertretungen; \`favoriten.csv\` |
| \`ablage/<Typ>/<Titel> [Id]/\` | je Mappe \`mappe.json\`, \`mappe.pdf\` und die Dokumente im Original je Register; \`.txt\` = erkannter Text; \`.fassung.pdf\` (bzw. \`.png\`, \`.jpg\`) = umgewandelte Fassung eines Pakets für Dateitypen wie TIFF; \`.pdfa.pdf\` = Archivfassung (PDF/A) eines Pakets, durchsuchbar, zum langfristigen Aufbewahren; \`Versionen/\` = ältere Versionen |
| \`uebersicht/<typ>.pdf\` | Übersicht je Mappentyp mit allen Mappen |
| \`kalender/fristen.ics\` | offene Fristen, Aufgaben mit Datum und Erinnerungen (iCalendar) |
| \`kontakte/<typ>.vcf\` | Kontakte als vCard 4.0 (nur, wenn beim Export zugeordnet) |

## Formate

- Text: UTF-8. CSV nach RFC 4180 mit Komma und BOM (Excel erkennt so UTF-8).
- Datum: \`JJJJ-MM-TT\`, Zeitpunkte ISO 8601 in UTC. Zahlen mit Punkt. Beträge: Spalte \`<feld>\` und \`<feld>_waehrung\`.
- Zeiträume nach ISO 8601 (\`P3M\` = 3 Monate, \`P14D\`, \`P2W\`, \`P1Y\`), in JSON als \`{ "anzahl": 3, "einheit": "monate" }\`. Prozent als Zahl (\`19\` für 19 %).
- Ids: UUID. Mehrfachwerte in CSV mit \` | \` getrennt; in JSON als Liste.
- Passwortfelder stehen nie in den Daten (nur „gesetzt“).

## Vollständig?

\`\`\`python
import hashlib, json, pathlib
basis = pathlib.Path(__file__).parent if '__file__' in dir() else pathlib.Path('.')
m = json.loads((basis / 'manifest.json').read_text('utf-8'))
fehler = [d['pfad'] for d in m['dateien'] if hashlib.sha256((basis / d['pfad']).read_bytes()).hexdigest() != d['sha256']]
print('alles in Ordnung' if not fehler else f'abweichend: {fehler}')
\`\`\`

## Weiterverarbeiten

- **Excel/LibreOffice:** \`daten/<typ>.xlsx\` öffnen – oder \`.csv\` (Komma, UTF-8).
- **Python:** \`pandas.read_csv('daten/rechnung.csv')\` oder Zeile für Zeile \`json.loads\` aus \`.jsonl\`.
- **Anderes Ablago:** \`ablage/\` enthält alle Dateien in lesbaren Ordnern; Metadaten in \`mappe.json\`.
`;
}

/* ---------- Verwaltung der Exporte ---------- */

/** `bis`: danach löscht Ablago den Export (#797), ebenso nach dem Herunterladen. */
export interface ExportStand { name: string; erstellt: string | null; bis: string; bytes: number; dateien: number; mappen: number | null; passwoerter: boolean }

const TAG_MS = 24 * 3600 * 1000;
/** Zeitpunkt aus dem Ordnernamen (dms-export-JJJJ-MM-TT-hh-mm-ss, UTC) – auch für Exporte ohne manifest.json. */
export function exportZeit(name: string): Date | null {
  const m = /^dms-export-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/.exec(name);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

/**
 * Bereitliegende Exporte, neueste zuerst. Wie bei der Auskunft (#396) räumt das Lesen auf: Was älter ist als
 * EXPORT_TAGE (#797), wird gelöscht. Maßgeblich ist `erstellt` aus manifest.json (oder dessen Zeitstempel, wenn
 * der später ist – so beim Umzug), sonst die Zeit im Namen – so bleibt ein Export, der gerade geschrieben wird
 * (noch ohne Manifest), stehen.
 */
export async function exporteIn(ziel: string, jetzt = new Date()): Promise<ExportStand[]> {
  let eintraege: string[];
  try { eintraege = await readdir(ziel); } catch { return []; }
  const erg: ExportStand[] = [];
  for (const n of eintraege.filter((x) => EXPORTNAME.test(x)).sort().reverse()) {
    let m: { erstellt: string; dateien: Eintrag[]; anzahlen?: { mappen: number }; passwoerter?: boolean } | null = null;
    let geaendert = 0;
    try {
      const datei = join(ziel, n, 'manifest.json');
      m = JSON.parse(await readFile(datei, 'utf8'));
      // Beim Umzug aus dem Sicherungsordner (#797) frisch gestempelt: Die Frist beginnt dann erst dort.
      geaendert = (await stat(datei)).mtimeMs;
    } catch { /* läuft noch oder unvollständig */ }
    const erstellt = (m?.erstellt ? new Date(m.erstellt) : null) ?? exportZeit(n);
    const ab = erstellt && geaendert > erstellt.getTime() ? new Date(geaendert) : erstellt;
    const bis = new Date((ab?.getTime() ?? jetzt.getTime()) + EXPORT_TAGE * TAG_MS);
    if (bis.getTime() <= jetzt.getTime()) { await loescheExport(join(ziel, n)); continue; }
    erg.push(m
      ? { name: n, erstellt: m.erstellt, bis: bis.toISOString(), bytes: m.dateien.reduce((a, d) => a + d.bytes, 0), dateien: m.dateien.length + 1, mappen: m.anzahlen?.mappen ?? null, passwoerter: !!m.passwoerter }
      : { name: n, erstellt: null, bis: bis.toISOString(), bytes: 0, dateien: 0, mappen: null, passwoerter: false });
  }
  return erg;
}

const EXPORTNAME = /^dms-export-[\d-]+$/;
export function exportOrdner(ziel: string, name: string) {
  if (!EXPORTNAME.test(name)) throw new Fachfehler(404, t('meldungen.vollexport.diesen-export-gibt-es'));
  return join(ziel, name);
}

/** Export prüfen: jede Datei aus dem Manifest gegen Größe und SHA-256. */
export async function pruefeExport(ordner: string) {
  let m: { dateien: Eintrag[] };
  try { m = JSON.parse(await readFile(join(ordner, 'manifest.json'), 'utf8')); } catch { throw new Fachfehler(404, t('meldungen.vollexport.diesen-export-gibt-es-2')); }
  const fehlend: string[] = [], abweichend: string[] = [];
  for (const d of m.dateien) {
    const p = join(ordner, ...d.pfad.split('/'));
    try {
      const h = createHash('sha256');
      await pipeline(createReadStream(p), new Transform({ transform(c: Buffer, _e, cb) { h.update(c); cb(); } }));
      if (h.digest('hex') !== d.sha256) abweichend.push(d.pfad);
    } catch { fehlend.push(d.pfad); }
  }
  return { ok: !fehlend.length && !abweichend.length, dateien: m.dateien.length, fehlend, abweichend };
}

/** Dateien eines Exports für den ZIP-Download (relativer Pfad, Größe). */
export async function exportDateien(ordner: string): Promise<Array<{ name: string; groesse: number; pfad: string }>> {
  const erg: Array<{ name: string; groesse: number; pfad: string }> = [];
  const lauf = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await lauf(p);
      else erg.push({ name: relative(ordner, p).split(sep).join('/'), groesse: (await stat(p)).size, pfad: p });
    }
  };
  await lauf(ordner);
  return erg;
}

export async function loescheExport(ordner: string) { await rm(ordner, { recursive: true, force: true }); }

/** Freier Platz am Ziel (Bytes) oder null. */
export async function freierPlatz(ziel: string): Promise<number | null> {
  try { await mkdir(ziel, { recursive: true }); const s = await statfs(ziel); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}
