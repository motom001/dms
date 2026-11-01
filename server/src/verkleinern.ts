/**
 * PDF verkleinern (#393): große Scans und Foto-PDFs kleiner machen – ohne Ghostscript (AGPL).
 *
 * Verfahren:
 * 1. pdf-lib liest das PDF. In den Inhaltsströmen der Seiten (auch in Formularen, die sie zeichnen) wird
 *    verfolgt, wie groß jedes Bild auf der Seite erscheint (Transformationsmatrix bei „Do“). Daraus ergibt
 *    sich seine wirksame Auflösung in dpi.
 * 2. Bilder über der Ziel-Auflösung der Stufe werden heruntergerechnet und als JPEG neu kodiert. Das
 *    Rechnen übernimmt pdftoppm (poppler, für Texterkennung und Vorschaubilder ohnehin im Image): Jedes
 *    Bild kommt allein auf eine Seite in Zielgröße, pdftoppm rastert sie als JPEG. So liest poppler jedes
 *    Bildformat eines PDFs (JPEG, Flate, JPEG 2000, Farbräume, Decode) – ohne zusätzliche Bildbibliothek.
 *    Das neue Bild ersetzt das alte unter derselben Objektnummer; Transparenz (SMask) bleibt erhalten.
 * 3. Doppelte Ströme werden zusammengelegt, nicht mehr verwendete Objekte entfernt, unkomprimierte Ströme
 *    komprimiert, und pdf-lib schreibt mit Objektströmen. Ist qpdf (Apache-2.0) da, optimiert es zum
 *    Schluss die Struktur noch einmal (`--recompress-flate`); fehlt es, geht es auch ohne.
 *
 * Inhaltsströme, Schriften und damit Textebene und Volltext bleiben unverändert. Nicht angefasst werden
 * Schwarz-Weiß-Bilder (1 Bit, CCITT/JBIG2 – dort wäre JPEG größer und unschärfer), Bildmasken, Bilder mit
 * Farbschlüssel-Maske (/Mask), Sonderfarben (Separation, DeviceN) und Bilder, deren Platzierung sich nicht
 * ermitteln lässt (z. B. nur in Mustern oder Anmerkungen).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFObjectCopier, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream,
  type PDFObject,
} from 'pdf-lib';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { ergebnisText, istStufe, mb, MIN_ERSPARNIS, STANDARD_STUFE, STUFEN, type Stufe } from '../../shared/src/verkleinern';

const log = protokoll.modul('dokumente');

export { ergebnisText, istStufe, mb, MIN_ERSPARNIS, STANDARD_STUFE, STUFEN, type Stufe };

/** Stufe aus einer Eingabe: true/„ja“ = Standard, unbekannt/leer = keine. */
export function stufeAus(v: unknown): Stufe | null {
  if (v === true || v === 'true' || v === '1' || v === 'ja') return STANDARD_STUFE;
  if (istStufe(v)) return v;
  if (v === undefined || v === null || v === false || v === '' || v === 'false' || v === 'nein') return null;
  throw new Fachfehler(422, 'verkleinern: bildschirm, standard oder druck.');
}

/* ---------- Inhaltsströme lesen: Bilder und ihre Größe auf der Seite ---------- */

type Matrix = [number, number, number, number, number, number];
const EINS: Matrix = [1, 0, 0, 1, 0, 0];
/** m × ctm (PDF-Konvention: neue CTM = cm-Matrix × alte CTM). */
const mal = (m: Matrix, c: Matrix): Matrix => [
  m[0] * c[0] + m[1] * c[2], m[0] * c[1] + m[1] * c[3],
  m[2] * c[0] + m[3] * c[2], m[2] * c[1] + m[3] * c[3],
  m[4] * c[0] + m[5] * c[2] + c[4], m[4] * c[1] + m[5] * c[3] + c[5],
];

const WEISS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const TRENNER = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const regulaer = (b: number) => !WEISS.has(b) && !TRENNER.has(b);

/**
 * Durchläuft einen Inhaltsstrom und meldet q/Q/cm/Do – genug, um Bilder zu verorten. Zeichenketten,
 * Wörterbücher und eingebettete Bilder (BI … ID … EI) werden übersprungen.
 */
export function operatoren(daten: Uint8Array, f: (op: string, args: Array<number | string | null>) => void) {
  const n = daten.length;
  let i = 0;
  let stapel: Array<number | string | null> = [];
  const td = new TextDecoder('latin1');
  while (i < n) {
    const b = daten[i];
    if (WEISS.has(b)) { i++; continue; }
    if (b === 0x25) { while (i < n && daten[i] !== 0x0a && daten[i] !== 0x0d) i++; continue; }
    if (b === 0x28) { // (Zeichenkette) mit Klammerung und Escapes
      let tiefe = 1; i++;
      while (i < n && tiefe > 0) { const c = daten[i]; if (c === 0x5c) i += 2; else { if (c === 0x28) tiefe++; else if (c === 0x29) tiefe--; i++; } }
      stapel.push(null); continue;
    }
    if (b === 0x3c) {
      if (daten[i + 1] === 0x3c) { i += 2; stapel.push(null); continue; }
      while (i < n && daten[i] !== 0x3e) i++;
      i++; stapel.push(null); continue;
    }
    if (b === 0x3e) { i += daten[i + 1] === 0x3e ? 2 : 1; continue; }
    if (b === 0x5b || b === 0x5d || b === 0x7b || b === 0x7d) { i++; stapel.push(null); continue; }
    if (b === 0x29) { i++; continue; }
    if (b === 0x2f) { // /Name
      let j = i + 1;
      while (j < n && regulaer(daten[j])) j++;
      stapel.push(td.decode(daten.subarray(i + 1, j)).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
      i = j; continue;
    }
    let j = i;
    while (j < n && regulaer(daten[j])) j++;
    if (j === i) { i++; continue; }
    const wort = td.decode(daten.subarray(i, j));
    i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(wort)) { stapel.push(Number(wort)); continue; }
    if (wort === 'true' || wort === 'false' || wort === 'null') { stapel.push(null); continue; }
    if (wort === 'BI') {
      // Eingebettetes Bild: bis „ID“, dann Binärdaten bis „EI“ zwischen Leerraum.
      while (i < n - 1 && !(daten[i] === 0x49 && daten[i + 1] === 0x44 && WEISS.has(daten[i - 1]) && (i + 2 >= n || WEISS.has(daten[i + 2])))) i++;
      i += 3;
      while (i < n - 1 && !(daten[i] === 0x45 && daten[i + 1] === 0x49 && WEISS.has(daten[i - 1]) && (i + 2 >= n || WEISS.has(daten[i + 2]) || TRENNER.has(daten[i + 2])))) i++;
      i += 2; stapel = []; continue;
    }
    f(wort, stapel);
    stapel = [];
  }
}

const zahl = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined);

/** Entpackter Inhalt eines Stroms; null bei unbekanntem Filter. */
function entpacke(st: PDFObject | undefined): Uint8Array | null {
  try {
    if (st instanceof PDFRawStream) return decodePDFRawStream(st).decode();
    if (st instanceof PDFStream) return st.getContents();
  } catch { /* unbekannter Filter */ }
  return null;
}

/** Wo ein Bild erscheint: größte Breite und Höhe auf einer Seite (Zoll). */
interface Platzierung { breiteZoll: number; hoeheZoll: number }

/** Alle Bilder, die auf den Seiten gezeichnet werden, mit ihrer größten Darstellung. */
function verorte(doc: PDFDocument): Map<string, { ref: PDFRef; p: Platzierung }> {
  const ctx = doc.context;
  const bilder = new Map<string, { ref: PDFRef; p: Platzierung }>();
  let schritte = 0;
  const lauf = (inhalt: Uint8Array, res: PDFDict | undefined, start: Matrix, tiefe: number) => {
    const xo = res ? ctx.lookupMaybe(res.get(PDFName.of('XObject')), PDFDict) : undefined;
    const stapel: Matrix[] = [];
    let ctm = start;
    operatoren(inhalt, (op, args) => {
      if (++schritte > 5_000_000) throw new Error('Zu viele Zeichenbefehle.');
      if (op === 'q') stapel.push(ctm);
      else if (op === 'Q') ctm = stapel.pop() ?? ctm;
      else if (op === 'cm' && args.length >= 6 && args.slice(-6).every((x) => typeof x === 'number')) ctm = mal(args.slice(-6) as Matrix, ctm);
      else if (op === 'Do' && xo && typeof args[args.length - 1] === 'string') {
        const roh = xo.get(PDFName.of(args[args.length - 1] as string));
        if (!(roh instanceof PDFRef)) return;
        const st = ctx.lookup(roh);
        if (!(st instanceof PDFStream)) return;
        const art = st.dict.get(PDFName.of('Subtype'));
        if (art === PDFName.of('Image')) {
          const b = Math.hypot(ctm[0], ctm[1]) / 72, h = Math.hypot(ctm[2], ctm[3]) / 72;
          const alt = bilder.get(roh.toString());
          if (alt) { alt.p.breiteZoll = Math.max(alt.p.breiteZoll, b); alt.p.hoeheZoll = Math.max(alt.p.hoeheZoll, h); }
          else bilder.set(roh.toString(), { ref: roh, p: { breiteZoll: b, hoeheZoll: h } });
        } else if (art === PDFName.of('Form') && tiefe < 12) {
          const daten = entpacke(st);
          if (!daten) return;
          const m = ctx.lookupMaybe(st.dict.get(PDFName.of('Matrix')), PDFArray);
          const fm = m && m.size() === 6 ? Array.from({ length: 6 }, (_, k) => zahl(ctx.lookup(m.get(k))) ?? 0) as Matrix : EINS;
          const eigene = ctx.lookupMaybe(st.dict.get(PDFName.of('Resources')), PDFDict);
          lauf(daten, eigene ?? res, mal(fm, ctm), tiefe + 1);
        }
      }
    });
  };
  for (const seite of doc.getPages()) {
    const c = seite.node.Contents();
    const teile: Uint8Array[] = [];
    if (c instanceof PDFArray) for (let k = 0; k < c.size(); k++) { const d = entpacke(ctx.lookup(c.get(k))); if (d) teile.push(d, new Uint8Array([0x0a])); }
    else if (c) { const d = entpacke(c); if (d) teile.push(d); }
    const alles = Buffer.concat(teile);
    const ur = zahl(ctx.lookup(seite.node.get(PDFName.of('UserUnit'))));
    const start: Matrix = ur && ur !== 1 ? [ur, 0, 0, ur, 0, 0] : EINS;
    lauf(alles, seite.node.Resources(), start, 0);
  }
  return bilder;
}

/* ---------- Welche Bilder, wie groß ---------- */

interface BildInfo {
  ref: PDFRef; breite: number; hoehe: number; bytes: number; filter: string; grau: boolean;
  /** Größte Darstellung auf einer Seite (Zoll). */
  p: Platzierung;
  /** Warum das Bild nicht angefasst wird. */
  aus?: string;
}

function filterVon(d: PDFDict, ctx: PDFDocument['context']): string {
  const f = ctx.lookup(d.get(PDFName.of('Filter')));
  if (f instanceof PDFName) return f.decodeText();
  if (f instanceof PDFArray) return f.asArray().map((x) => (ctx.lookup(x) as PDFName)?.decodeText?.() ?? '').join('+');
  return '';
}

/** Farbraum: grau, farbig oder (Sonderfarben) nicht anfassen. */
function farbraum(o: PDFObject | undefined, ctx: PDFDocument['context']): 'grau' | 'farbe' | 'nein' {
  const cs = ctx.lookup(o);
  if (cs instanceof PDFName) {
    const n = cs.decodeText();
    return n === 'DeviceGray' || n === 'CalGray' || n === 'G' ? 'grau' : n === 'DeviceRGB' || n === 'DeviceCMYK' || n === 'CalRGB' || n === 'RGB' || n === 'CMYK' ? 'farbe' : 'nein';
  }
  if (cs instanceof PDFArray && cs.size()) {
    const art = (ctx.lookup(cs.get(0)) as PDFName | undefined)?.decodeText?.();
    if (art === 'ICCBased') { const st = ctx.lookup(cs.get(1)); const nn = st instanceof PDFStream ? zahl(ctx.lookup(st.dict.get(PDFName.of('N')))) : undefined; return nn === 1 ? 'grau' : nn === 3 || nn === 4 ? 'farbe' : 'nein'; }
    if (art === 'CalGray') return 'grau';
    if (art === 'CalRGB' || art === 'Lab' || art === 'Indexed' || art === 'I') return 'farbe';
  }
  return 'nein';
}

function bildInfos(doc: PDFDocument): BildInfo[] {
  const ctx = doc.context;
  const r: BildInfo[] = [];
  for (const { ref, p } of verorte(doc).values()) {
    const st = ctx.lookup(ref);
    if (!(st instanceof PDFRawStream)) continue;
    const d = st.dict;
    const breite = zahl(ctx.lookup(d.get(PDFName.of('Width')))) ?? 0, hoehe = zahl(ctx.lookup(d.get(PDFName.of('Height')))) ?? 0;
    const bpc = zahl(ctx.lookup(d.get(PDFName.of('BitsPerComponent'))));
    const filter = filterVon(d, ctx);
    const fr = farbraum(d.get(PDFName.of('ColorSpace')), ctx);
    const info: BildInfo = { ref, breite, hoehe, bytes: st.getContentsSize(), filter, grau: fr === 'grau', p };
    const maske = ctx.lookup(d.get(PDFName.of('ImageMask')));
    if (maske && maske.toString() === 'true') info.aus = 'Bildmaske';
    else if (d.has(PDFName.of('Mask'))) info.aus = 'Farbschlüssel-Maske';
    else if (!breite || !hoehe || bpc === undefined) info.aus = 'unvollständig';
    else if (bpc < 8 || /CCITT|JBIG2/.test(filter)) info.aus = 'Schwarz-Weiß';
    else if (fr === 'nein') info.aus = 'Farbraum';
    else if (p.breiteZoll <= 0.01 || p.hoeheZoll <= 0.01) info.aus = 'unsichtbar';
    r.push(info);
  }
  return r;
}

/** Faktor (≤ 1), auf den ein Bild für die Ziel-Auflösung schrumpft. */
function faktor(b: BildInfo, dpi: number): number {
  return Math.min(1, Math.max((b.p.breiteZoll * dpi) / b.breite, (b.p.hoeheZoll * dpi) / b.hoehe));
}
/** Wirksame Auflösung (kleinere Achse), gerundet. */
const wirksameDpi = (b: BildInfo) => Math.round(Math.min(b.breite / b.p.breiteZoll, b.hoehe / b.p.hoeheZoll));

/** Ab hier lohnt ein Bild die Arbeit (kleinere Bilder bleiben). */
const MIN_BILD_BYTES = 24 * 1024;
/** Herunterrechnen erst, wenn es spürbar weniger Bildpunkte werden (sonst nur Qualitätsverlust). */
const MIN_SCHRUMPF = 0.85;
/** Typische Bytes je Bildpunkt eines JPEG bei der Qualität der Stufe (Farbe; Grau etwa 60 %). */
const BPP: Record<Stufe, number> = { bildschirm: 0.1, standard: 0.14, druck: 0.2 };

interface Plan { b: BildInfo; breite: number; hoehe: number }
function plane(bilder: BildInfo[], stufe: Stufe): Plan[] {
  const { dpi } = STUFEN[stufe];
  const r: Plan[] = [];
  for (const b of bilder) {
    if (b.aus || b.bytes < MIN_BILD_BYTES) continue;
    const f = faktor(b, dpi);
    const schrumpft = f < MIN_SCHRUMPF;
    // Ohne Herunterrechnen nur neu kodieren, wenn das Bild ungewöhnlich viel Platz braucht (z. B. Flate-Foto).
    const dicht = b.bytes / (b.breite * b.hoehe) > BPP[stufe] * (b.grau ? 0.6 : 1) * 1.6;
    if (!schrumpft && (stufe === 'druck' || !dicht)) continue;
    const k = schrumpft ? f : 1;
    r.push({ b, breite: Math.max(1, Math.round(b.breite * k)), hoehe: Math.max(1, Math.round(b.hoehe * k)) });
  }
  return r;
}

/* ---------- Analyse für den Dialog ---------- */

export interface Analyse {
  groesse: number;
  seiten: number;
  /** Alle gezeichneten Bilder und davon die, die sich verkleinern lassen (je Stufe). */
  bilder: number;
  /** Höchste wirksame Auflösung eines Bildes (dpi), null ohne Bilder. */
  hoechsteDpi: number | null;
  /** Geschätzte Größe danach und ob es sich lohnt (≥ 10 % kleiner). */
  stufen: Record<Stufe, { dpi: number; geschaetzt: number; lohnt: boolean; bilder: number }>;
}

async function lade(inhalt: Buffer): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(inhalt, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test((e as Error).message)) throw new Fachfehler(422, 'Das PDF ist mit einem Passwort geschützt und lässt sich nicht verkleinern.');
    throw new Fachfehler(422, 'Die Datei lässt sich nicht als PDF lesen.');
  }
}

/** Schätzung je Stufe – ohne etwas zu rechnen (schnell, für den Dialog). */
export async function analysiere(inhalt: Buffer): Promise<Analyse> {
  const doc = await lade(inhalt);
  let bilder: BildInfo[];
  try { bilder = bildInfos(doc); } catch { bilder = []; }
  const stufen = {} as Analyse['stufen'];
  for (const s of Object.keys(STUFEN) as Stufe[]) {
    const plaene = plane(bilder, s);
    let ersparnis = 0;
    for (const p of plaene) {
      const neu = p.breite * p.hoehe * BPP[s] * (p.b.grau ? 0.6 : 1);
      ersparnis += Math.max(0, p.b.bytes - neu);
    }
    // Struktur (Objektströme, Komprimierung) bringt meist ein paar Prozent; nicht eingerechnet.
    const geschaetzt = Math.max(Math.round(inhalt.length * 0.02), Math.round(inhalt.length - ersparnis));
    stufen[s] = { dpi: STUFEN[s].dpi, geschaetzt, lohnt: geschaetzt <= inhalt.length * (1 - MIN_ERSPARNIS), bilder: plaene.length };
  }
  const sichtbar = bilder.filter((b) => !b.aus);
  return {
    groesse: inhalt.length, seiten: doc.getPageCount(), bilder: bilder.length,
    hoechsteDpi: sichtbar.length ? Math.max(...sichtbar.map(wirksameDpi)) : null, stufen,
  };
}

/* ---------- Rechnen ---------- */

const ZEIT_MS = 5 * 60_000;

function starte(befehl: string, args: string[], zeit = ZEIT_MS): Promise<void> {
  return new Promise((ok, fehler) => {
    execFile(befehl, args, { timeout: zeit, maxBuffer: 4 << 20 }, (e, _o, err) => {
      if (!e) return ok();
      const x = new Error(String(err).trim().slice(0, 300) || e.message) as NodeJS.ErrnoException;
      x.code = (e as NodeJS.ErrnoException).code;
      fehler(x);
    });
  });
}

/** Bilder in Zielgröße als JPEG: je Bild eine Seite, pdftoppm rastert alle in einem Aufruf. */
async function rechne(doc: PDFDocument, plaene: Plan[], grau: boolean, qualitaet: number, dir: string, tag: string): Promise<Buffer[]> {
  if (!plaene.length) return [];
  const mini = await PDFDocument.create({ updateMetadata: false });
  const kopierer = PDFObjectCopier.for(doc.context, mini.context);
  for (const p of plaene) {
    const st = kopierer.copy(doc.context.lookup(p.b.ref) as PDFRawStream);
    // Transparenz gehört nicht ins Rasterbild; sie bleibt am neuen Bild als SMask erhalten.
    st.dict.delete(PDFName.of('SMask'));
    st.dict.delete(PDFName.of('SMaskInData'));
    const ref = mini.context.register(st);
    const seite = mini.addPage([p.breite, p.hoehe]);
    const name = seite.node.newXObject('Bild', ref);
    seite.node.set(PDFName.of('Contents'), mini.context.register(mini.context.flateStream(`q ${p.breite} 0 0 ${p.hoehe} 0 0 cm ${name.toString()} Do Q`)));
  }
  const ein = join(dir, `${tag}.pdf`);
  await writeFile(ein, await mini.save());
  try {
    await starte('pdftoppm', ['-r', '72', '-jpeg', '-jpegopt', `quality=${qualitaet},optimize=y`, '-aaVector', 'no', ...(grau ? ['-gray'] : []), ein, join(dir, tag)]);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Fachfehler(503, 'pdftoppm fehlt – PDFs lassen sich hier nicht verkleinern.');
    throw new Fachfehler(422, `Die Bilder ließen sich nicht umrechnen: ${(e as Error).message}`);
  }
  const dateien = (await readdir(dir)).filter((n) => n.startsWith(`${tag}-`) && n.endsWith('.jpg'))
    .sort((a, b) => Number(a.slice(tag.length + 1, -4)) - Number(b.slice(tag.length + 1, -4)));
  if (dateien.length !== plaene.length) throw new Fachfehler(422, 'Die Bilder ließen sich nicht umrechnen.');
  return Promise.all(dateien.map((n) => readFile(join(dir, n))));
}

/**
 * Maße und Farbkomponenten eines JPEG aus dem SOF-Kopf. pdftoppm rundet selten um einen Bildpunkt, und
 * mit -gray schreibt es je nach poppler-Version ein JPEG mit einer oder mit drei Komponenten – der
 * Farbraum im PDF muss zur Datei passen, nicht zum Wunsch.
 */
export function jpegMasse(b: Buffer): { breite: number; hoehe: number; komponenten: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    const l = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { hoehe: b.readUInt16BE(i + 5), breite: b.readUInt16BE(i + 7), komponenten: b[i + 9] };
    i += 2 + l;
  }
  return null;
}

/** Alle Verweise in einem Objekt ersetzen (doppelte Ströme). */
function ersetzeVerweise(o: PDFObject, karte: Map<string, PDFRef>): void {
  if (o instanceof PDFDict) {
    for (const [k, v] of o.entries()) {
      if (v instanceof PDFRef) { const z = karte.get(v.toString()); if (z) o.set(k, z); } else ersetzeVerweise(v, karte);
    }
  } else if (o instanceof PDFArray) {
    for (let i = 0; i < o.size(); i++) {
      const v = o.get(i);
      if (v instanceof PDFRef) { const z = karte.get(v.toString()); if (z) o.set(i, z); } else ersetzeVerweise(v, karte);
    }
  } else if (o instanceof PDFStream) ersetzeVerweise(o.dict, karte);
}

/** Doppelte Ströme zusammenlegen (gleiches Wörterbuch, gleicher Inhalt). */
function legeDoppelteZusammen(doc: PDFDocument): number {
  const ctx = doc.context;
  const gesehen = new Map<string, PDFRef>();
  const karte = new Map<string, PDFRef>();
  for (const [ref, o] of ctx.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream) || o.getContentsSize() < 256) continue;
    const typ = o.dict.get(PDFName.of('Type'));
    if (typ === PDFName.of('ObjStm') || typ === PDFName.of('XRef')) continue;
    const kopf = [...o.dict.entries()].filter(([k]) => k !== PDFName.of('Length')).map(([k, v]) => `${k.toString()} ${v.toString()}`).sort().join('|');
    const h = createHash('sha256').update(kopf).update(o.getContents()).digest('hex');
    const da = gesehen.get(h);
    if (da) karte.set(ref.toString(), da); else gesehen.set(h, ref);
  }
  if (!karte.size) return 0;
  for (const [, o] of ctx.enumerateIndirectObjects()) ersetzeVerweise(o, karte);
  for (const k of ['Root', 'Info'] as const) {
    const r = ctx.trailerInfo[k];
    if (r instanceof PDFRef && karte.has(r.toString())) (ctx.trailerInfo as Record<string, unknown>)[k] = karte.get(r.toString());
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (karte.has(ref.toString())) ctx.delete(ref);
  return karte.size;
}

/** Was vom Katalog und den Dokumentinfos nicht erreichbar ist, fliegt raus. */
function entferneUnbenutzte(doc: PDFDocument): number {
  const ctx = doc.context;
  const erreicht = new Set<string>();
  const offen: PDFObject[] = [];
  const merke = (o: PDFObject | undefined) => {
    if (o instanceof PDFRef) { if (erreicht.has(o.toString())) return; erreicht.add(o.toString()); const z = ctx.lookup(o); if (z) offen.push(z); }
    else if (o) offen.push(o);
  };
  merke(ctx.trailerInfo.Root as PDFObject | undefined);
  merke(ctx.trailerInfo.Info as PDFObject | undefined);
  while (offen.length) {
    const o = offen.pop()!;
    if (o instanceof PDFDict) for (const [, v] of o.entries()) merke(v);
    else if (o instanceof PDFArray) for (let i = 0; i < o.size(); i++) merke(o.get(i));
    else if (o instanceof PDFStream) for (const [, v] of o.dict.entries()) merke(v);
  }
  let n = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!erreicht.has(ref.toString())) { ctx.delete(ref); n++; }
  return n;
}

/** Unkomprimierte Ströme (ohne Filter) mit Flate packen. */
function komprimiere(doc: PDFDocument): void {
  const ctx = doc.context;
  for (const [ref, o] of ctx.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream) || o.dict.has(PDFName.of('Filter')) || o.getContentsSize() < 512) continue;
    if (o.dict.get(PDFName.of('Type')) === PDFName.of('Metadata')) continue; // XMP bleibt lesbar
    const gepackt = deflateSync(o.getContents(), { level: 9 });
    if (gepackt.length >= o.getContentsSize()) continue;
    const d = o.dict.clone(ctx);
    d.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    d.delete(PDFName.of('DecodeParms'));
    ctx.assign(ref, PDFRawStream.of(d, gepackt));
  }
}

/** qpdf vorhanden? Einmal nachsehen. */
let qpdfDa: Promise<boolean> | undefined;
export function hatQpdf(): Promise<boolean> {
  qpdfDa ??= starte('qpdf', ['--version'], 10_000).then(() => true, () => false);
  return qpdfDa;
}

export interface Ergebnis {
  inhalt: Buffer;
  vorher: number;
  nachher: number;
  /** Mindestens 10 % kleiner? Sonst bleibt das Original. */
  lohnt: boolean;
  stufe: Stufe;
  /** Neu kodierte Bilder. */
  bilder: number;
  seiten: number;
}

/**
 * Verkleinert ein PDF. Bringt es weniger als 10 %, ist `lohnt` falsch und `inhalt` das Original.
 */
export async function verkleinere(inhalt: Buffer, stufe: Stufe = STANDARD_STUFE): Promise<Ergebnis> {
  const doc = await lade(inhalt);
  const seiten = doc.getPageCount();
  const { qualitaet } = STUFEN[stufe];
  let plaene: Plan[] = [];
  try { plaene = plane(bildInfos(doc), stufe); } catch (e) { log.warn('PDF verkleinern: Bilder nicht verortet', { fehler: (e as Error).message }); }
  const dir = await mkdtemp(join(tmpdir(), 'dms-klein-'));
  let neu = 0;
  try {
    for (const grau of [true, false]) {
      const teil = plaene.filter((p) => p.b.grau === grau);
      const jpegs = await rechne(doc, teil, grau, qualitaet, dir, grau ? 'g' : 'f');
      teil.forEach((p, i) => {
        const j = jpegs[i];
        if (j.length >= p.b.bytes * 0.9) return; // lohnt bei diesem Bild nicht
        const m = jpegMasse(j);
        if (!m || (m.komponenten !== 1 && m.komponenten !== 3)) return; // unerwartetes JPEG: Bild bleibt, wie es ist
        const alt = doc.context.lookup(p.b.ref) as PDFRawStream;
        const d = doc.context.obj({
          Type: 'XObject', Subtype: 'Image', Width: m.breite, Height: m.hoehe,
          ColorSpace: m.komponenten === 1 ? 'DeviceGray' : 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode',
        });
        for (const k of ['SMask', 'Interpolate', 'Intent', 'OC', 'Metadata', 'StructParent']) {
          const v = alt.dict.get(PDFName.of(k));
          if (v) d.set(PDFName.of(k), v);
        }
        doc.context.assign(p.b.ref, PDFRawStream.of(d, j));
        neu++;
      });
    }
    legeDoppelteZusammen(doc);
    entferneUnbenutzte(doc);
    komprimiere(doc);
    let erg = Buffer.from(await doc.save({ useObjectStreams: true, updateFieldAppearances: false }));
    if (await hatQpdf()) {
      try {
        await writeFile(join(dir, 'ein.pdf'), erg);
        await starte('qpdf', ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '--warning-exit-0', join(dir, 'ein.pdf'), join(dir, 'aus.pdf')]);
        const q = await readFile(join(dir, 'aus.pdf'));
        if (q.length < erg.length) erg = q;
      } catch (e) { log.warn('PDF verkleinern: qpdf übersprungen', { fehler: (e as Error).message }); }
    }
    const lohnt = erg.length <= inhalt.length * (1 - MIN_ERSPARNIS);
    return { inhalt: lohnt ? erg : inhalt, vorher: inhalt.length, nachher: lohnt ? erg.length : inhalt.length, lohnt, stufe, bilder: neu, seiten };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
