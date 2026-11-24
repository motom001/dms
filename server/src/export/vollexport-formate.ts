/** Vollexport (#1278 aus vollexport.ts): Formate (CSV, JSON Lines, iCalendar, Excel-Zellen) und Schreiben mit Prüfwert. */
import { createHash } from 'node:crypto';
import { type WriteStream, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { istZeitraum, zeitraumIso } from '../../../shared/src/feldarten';
import { type Mappentyp, type Werte, istLeer } from '../../../shared/src/model';

import { EXPORT_STUECK_ZEICHEN as STUECK_ZEICHEN } from '../grundlagen/grenzen';
import { sichererName } from './export';

/* ---------- Formate ---------- */

const feld = (s: string) => (/[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** Eine Zeile CSV mit CRLF. */
export const csvZeile = (z: string[]) => `${z.map(feld).join(',')}\r\n`;
export const BOM = '\ufeff';
/** CSV nach RFC 4180: Komma, CRLF, Anführungszeichen bei Bedarf, UTF-8 mit BOM. */
export function csv(kopf: string[], zeilen: string[][]): Buffer {
  return Buffer.from(BOM + [kopf, ...zeilen].map(csvZeile).join(''), 'utf8');
}
export const jsonl = (zeilen: unknown[]) =>
  Buffer.from(zeilen.map((z) => JSON.stringify(z)).join('\n') + (zeilen.length ? '\n' : ''), 'utf8');
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
export const json = (x: unknown) => Buffer.from(JSON.stringify(x, null, 2) + '\n', 'utf8');

/** iCalendar: Text maskieren und Zeilen auf 75 Oktette falten. */
export function ics(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
export function falte(z: string): string {
  const b = Buffer.from(z, 'utf8');
  if (b.length <= 75) return z;
  const teile: string[] = [];
  let rest = z;
  while (Buffer.byteLength(rest) > 75) {
    let n = 75;
    while (Buffer.byteLength(rest.slice(0, n)) > (teile.length ? 74 : 75)) n--;
    teile.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  teile.push(rest);
  return teile.join('\r\n ');
}

/** Wert einer Zelle: maschinenlesbar (ISO 8601, Punkt als Dezimaltrennzeichen, Ids). */
export function zelle(v: unknown): string {
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
export function ohnePasswoerter(t: Mappentyp | undefined, w: Werte): Werte {
  const x = { ...w };
  for (const f of t?.felder ?? []) if (f.typ === 'passwort' && !istLeer(x[f.key])) x[f.key] = { gesetzt: true } as never;
  return x;
}

/* ---------- Schreiben mit Prüfwert ---------- */

export interface Eintrag {
  pfad: string;
  bytes: number;
  sha256: string;
}

/**
 * Eine Datei Zeile für Zeile (#746): Text in Stücken an den Schreibstrom, mit Gegendruck (drain), Prüfwert beim
 * Schreiben und Pausen (TAKT_MS) – statt die ganze Datei als einen Text im Speicher zu bauen.
 */
export class Zeilen {
  private readonly h = createHash('sha256');
  private n = 0;
  private stueck: string[] = [];
  private zeichen = 0;
  private fehler: Error | null = null;
  private readonly strom: WriteStream;
  /** `modus`: Rechte der Datei, z. B. 0o600 für Arbeitsdateien (nur der Dienstbenutzer). */
  constructor(
    readonly rel: string,
    pfad: string,
    modus?: number,
  ) {
    this.strom = createWriteStream(pfad, modus === undefined ? {} : { mode: modus, flags: 'wx' });
    this.strom.on('error', (e) => {
      this.fehler ??= e;
    });
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
    this.stueck = [];
    this.zeichen = 0;
    this.h.update(b);
    this.n += b.length;
    if (!this.strom.write(b)) {
      await new Promise<void>((r, f) => {
        const weiter = () => {
          this.strom.off('error', fehler);
          r();
        };
        const fehler = (e: Error) => {
          this.strom.off('drain', weiter);
          f(e);
        };
        this.strom.once('drain', weiter);
        this.strom.once('error', fehler);
      });
    }
  }
  async ende(): Promise<Eintrag> {
    await this.leere();
    await new Promise<void>((r, f) => this.strom.end((e?: Error | null) => ((e ?? this.fehler) ? f(e ?? this.fehler) : r())));
    return { pfad: this.rel, bytes: this.n, sha256: this.h.digest('hex') };
  }
  abbrechen() {
    this.strom.destroy();
  }
}

export class Schreiber {
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
  abbrechen() {
    for (const z of this.offen) z.abbrechen();
    this.offen.clear();
  }
  async schreibe(rel: string, inhalt: Buffer | Readable | (() => Promise<Buffer | Readable>)) {
    const pfad = join(this.ordner, ...rel.split('/'));
    await mkdir(dirname(pfad), { recursive: true });
    const quelle = typeof inhalt === 'function' ? await inhalt() : inhalt;
    const h = createHash('sha256');
    let n = 0;
    if (Buffer.isBuffer(quelle)) {
      h.update(quelle);
      n = quelle.length;
      await writeFile(pfad, quelle);
    } else {
      await pipeline(
        quelle,
        new Transform({
          transform(c: Buffer, _e, cb) {
            h.update(c);
            n += c.length;
            cb(null, c);
          },
        }),
        createWriteStream(pfad),
      );
    }
    this.dateien.push({ pfad: rel, bytes: n, sha256: h.digest('hex') });
    this.bytes += n;
  }
}

/* ---------- Länge der Pfade (#1506) ---------- */

/**
 * Höchstlänge eines Pfads in der ZIP in Bytes (UTF-8), einschließlich des obersten Ordners: Der Explorer von Windows
 * lehnt eine ZIP ab 260 Bytes ganz ab; so bleibt Platz für den Zielordner beim Entpacken.
 */
export const PFAD_MAX = 200;
/** Länger ist keine Endung, die beim Kürzen erhalten bleibt (sonst wird der ganze Name gekürzt). */
const ENDUNG_MAX = 16;
export const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

/** Text auf höchstens `max` Bytes (UTF-8) kürzen, ohne ein Zeichen zu teilen; ohne Leerzeichen und Punkte am Ende (Windows). */
export function kuerzeAufBytes(s: string, max: number): string {
  if (bytes(s) <= max) return s;
  let r = '';
  let n = 0;
  for (const z of s) {
    n += bytes(z);
    if (n > max) break;
    r += z;
  }
  return r.replace(/[.\s]+$/u, '');
}

/**
 * Eindeutige, sichere Namen innerhalb eines Ordners. Mit `max` (Bytes, #1506) wird ein zu langer Name gekürzt: der
 * Stamm, die Endung bleibt. `zusaetze`: Dateien, die neben jedem Namen entstehen (z. B. `.txt`) – auch sie dürfen keinen
 * anderen Namen treffen; `belegt`: Namen, die es im Ordner schon gibt (z. B. `Versionen`). `zeichen`: Höchstlänge in
 * Zeichen vor dem Kürzen (wie bisher 120).
 */
export function namen(o: { zusaetze?: readonly string[]; belegt?: readonly string[]; zeichen?: number } = {}) {
  const vergeben = new Set((o.belegt ?? []).map((x) => x.toLowerCase()));
  const zusaetze = o.zusaetze ?? [];
  const frei = (n: string) => ![n, ...zusaetze.map((z) => n + z)].some((x) => vergeben.has(x.toLowerCase()));
  return (wunsch: string, max = Infinity) => {
    const s = sichererName(wunsch, o.zeichen ?? 120) || 'Datei';
    const p = s.lastIndexOf('.');
    const [stamm, endung] = p > 0 ? [s.slice(0, p), s.slice(p)] : [s, ''];
    const name = (zusatz: string) => {
      const voll = `${stamm}${zusatz}${endung}`;
      if (bytes(voll) <= max) return voll;
      const e = bytes(endung) <= ENDUNG_MAX ? endung : '';
      return `${kuerzeAufBytes(e ? stamm : s, max - bytes(zusatz + e)) || '_'}${zusatz}${e}`;
    };
    let n = name(''),
      i = 2;
    while (!frei(n)) n = name(` (${i++})`);
    for (const x of [n, ...zusaetze.map((z) => n + z)]) vergeben.add(x.toLowerCase());
    return n;
  };
}
