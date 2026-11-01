/**
 * Dokumente endgültig schwärzen (#392) – ohne MuPDF/Ghostscript (AGPL), nur mit poppler (pdftoppm,
 * pdftotext), tesseract und pdf-lib.
 *
 * Ein schwarzer Kasten über dem Text reicht nicht: Text, Bilder und Textebene darunter blieben im PDF.
 * Darum entsteht das Ergebnis neu:
 * 1. **Alle** Seiten werden mit pdftoppm als Rasterbild (PPM, verlustfrei) gerendert – nicht nur die
 *    betroffenen. So kommt aus dem Original nichts mit: keine Schriften, Textebenen, verdeckten Inhalte,
 *    Ebenen (OCG), Anmerkungen, Formulare, Lesezeichen, JavaScript, eingebetteten Dateien, Metadaten
 *    (Info, XMP) oder Reste früherer Speicherungen. Der Preis: Vektortext wird zum Bild (150 dpi).
 * 2. In den Bildpunkten werden die Bereiche schwarz gefüllt – die Bildpunkte darunter sind danach weg.
 * 3. Die bearbeiteten Bilder werden als JPEG kodiert (wie beim Verkleinern über pdftoppm: jedes Bild allein
 *    auf einer Seite in Zielgröße) und mit pdf-lib zu einem neuen PDF ohne Metadaten zusammengesetzt.
 * 4. Die Textebene entsteht neu aus den Wörtern mit Koordinaten (pdftotext -bbox bzw. tesseract für Seiten
 *    ohne Text): als unsichtbarer Text, aber nur die Wörter, die keinen schwarzen Bereich berühren.
 *
 * Bilder (JPEG, PNG) werden genauso behandelt (Ausrichtung laut EXIF beachtet) und bleiben Bilder desselben
 * Typs – ohne EXIF-Daten.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  beginText, degrees, endText, PDFDocument, PDFName, PDFRawStream, popGraphicsState, pushGraphicsState, setCharacterSqueeze,
  setFontAndSize, setTextMatrix, setTextRenderingMode, showText, StandardFonts, TextRenderingMode, type PDFFont,
} from 'pdf-lib';
import { Fachfehler } from './fehler';
import { jpegMasse } from './verkleinern';
import { SCHWAERZEN_MAX_SEITEN, wortIn, type Bereich, type SchwaerzSeite, type Wort } from '../../shared/src/schwaerzen';
import { eigenerPuffer } from './pdf-puffer';

/** Auflösung des Ergebnisses (PDF). */
export const SCHWAERZEN_DPI = 150;
/** JPEG-Qualität des Ergebnisses. */
const QUALITAET = 82;
/** Seiten je Durchgang (begrenzt den Arbeitsspeicher: eine A4-Seite bei 150 dpi sind ca. 6 MB Bildpunkte). */
const STAPEL = 8;
/** Längste Seite eines Bildes, das geschwärzt wird (größere werden verkleinert). */
const BILD_MAX_PX = 8000;
/** Seitenbilder für den Dialog: längste Seite. */
export const ANSICHT_PX = 1400;

const ZEIT_MS = 5 * 60_000;

function starte(befehl: string, args: string[], zeit = ZEIT_MS): Promise<string> {
  return new Promise((ok, fehler) => {
    execFile(befehl, args, { timeout: zeit, maxBuffer: 64 << 20 }, (e, aus, err) => {
      if (!e) return ok(String(aus));
      const x = new Error(String(err).trim().slice(0, 300) || e.message) as NodeJS.ErrnoException;
      x.code = (e as NodeJS.ErrnoException).code;
      fehler(x);
    });
  });
}

function popplerFehler(e: unknown, was: string): never {
  if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Fachfehler(503, 'poppler (pdftoppm/pdftotext) fehlt – hier lässt sich nicht schwärzen.');
  throw new Fachfehler(422, `${was}: ${(e as Error).message}`);
}

/* ---------- Arbeits-PDF: das PDF selbst oder ein Bild als einseitiges PDF ---------- */

/** EXIF-Ausrichtung eines JPEG (1 = normal, 3 = 180°, 6 = 90° rechts, 8 = 90° links); 1, wenn keine. */
export function exifAusrichtung(b: Buffer): number {
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff) {
    const m = b[i + 1], l = b.readUInt16BE(i + 2);
    if (m === 0xda) break;
    if (m === 0xe1 && b.toString('latin1', i + 4, i + 10) === 'Exif\0\0') {
      const t = i + 10;
      const le = b.toString('latin1', t, t + 2) === 'II';
      const u16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
      const u32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
      try {
        const ifd = t + u32(t + 4);
        const n = u16(ifd);
        for (let k = 0; k < n; k++) {
          const e = ifd + 2 + k * 12;
          if (u16(e) === 0x0112) return u16(e + 8);
        }
      } catch { return 1; }
      return 1;
    }
    i += 2 + l;
  }
  return 1;
}
const DREHUNG_AUS_EXIF: Record<number, number> = { 3: 180, 6: 90, 8: 270 };

/** PDF zum Arbeiten: ein PDF bleibt, wie es ist; ein Bild kommt bildpunktgenau (1 pt = 1 px) auf eine Seite. */
export async function arbeitsPdf(inhalt: Buffer, mime: string): Promise<Buffer> {
  if (mime === 'application/pdf') return inhalt;
  const doc = await PDFDocument.create({ updateMetadata: false });
  let bild;
  try { bild = mime === 'image/png' ? await doc.embedPng(eigenerPuffer(inhalt)) : await doc.embedJpg(eigenerPuffer(inhalt)); } catch { throw new Fachfehler(422, 'Das Bild lässt sich nicht lesen.'); }
  const seite = doc.addPage([bild.width, bild.height]);
  seite.drawImage(bild, { x: 0, y: 0, width: bild.width, height: bild.height });
  const d = mime === 'image/jpeg' ? DREHUNG_AUS_EXIF[exifAusrichtung(inhalt)] : undefined;
  if (d) seite.setRotation(degrees(d));
  return Buffer.from(await doc.save());
}

/** Seitenzahl und Drehung je Seite; verschlüsselte oder kaputte PDFs mit verständlicher Meldung. */
async function seitenlage(pdf: Buffer): Promise<number[]> {
  let doc: PDFDocument, drehungen: number[];
  try {
    doc = await PDFDocument.load(pdf, { updateMetadata: false });
    drehungen = doc.getPages().map((p) => ((p.getRotation().angle % 360) + 360) % 360);
  } catch (e) {
    if (/encrypt/i.test((e as Error).message)) throw new Fachfehler(422, 'Das PDF ist mit einem Passwort geschützt und lässt sich nicht schwärzen.');
    throw new Fachfehler(422, 'Die Datei lässt sich nicht als PDF lesen.');
  }
  if (doc.isEncrypted) throw new Fachfehler(422, 'Das PDF ist mit einem Passwort geschützt und lässt sich nicht schwärzen.');
  const n = drehungen.length;
  if (!n) throw new Fachfehler(422, 'Das PDF hat keine Seiten.');
  if (n > SCHWAERZEN_MAX_SEITEN) throw new Fachfehler(422, `Das PDF hat ${n} Seiten – schwärzen lassen sich höchstens ${SCHWAERZEN_MAX_SEITEN} auf einmal. Teile es vorher („Seiten“).`);
  return drehungen;
}

/* ---------- Wörter mit Lage ---------- */

const ENTITAETEN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const entschluessele = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (g, e: string) => {
  if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(c) ? String.fromCodePoint(c) : g; }
  return ENTITAETEN[e] ?? g;
});
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

/**
 * Ausgabe von `pdftotext -bbox -cropbox` lesen. Die Seitengröße steht dort ungedreht, die Wörter liegen
 * aber in der gedrehten (angezeigten) Seite – darum die Drehung je Seite.
 */
export function liesBbox(html: string, drehungen: number[]): SchwaerzSeite[] {
  const seiten: SchwaerzSeite[] = [];
  const seiteRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  const wortRe = /<word xMin="([-\d.]+)" yMin="([-\d.]+)" xMax="([-\d.]+)" yMax="([-\d.]+)">([\s\S]*?)<\/word>/g;
  for (let m = seiteRe.exec(html); m; m = seiteRe.exec(html)) {
    const quer = drehungen[seiten.length] === 90 || drehungen[seiten.length] === 270;
    const breite = Number(quer ? m[2] : m[1]), hoehe = Number(quer ? m[1] : m[2]);
    const woerter: Wort[] = [];
    for (let w = wortRe.exec(m[3]); w; w = wortRe.exec(m[3])) {
      const [x1, y1, x2, y2] = [w[1], w[2], w[3], w[4]].map(Number);
      const t = entschluessele(w[5]).trim();
      if (!t || !(x2 > x1) || !(y2 > y1)) continue;
      woerter.push([t, r5(x1 / breite), r5(y1 / hoehe), r5((x2 - x1) / breite), r5((y2 - y1) / hoehe)]);
    }
    seiten.push({ breite: r5(breite), hoehe: r5(hoehe), woerter });
  }
  return seiten;
}

/** Wörter aus der TSV-Ausgabe von tesseract (Ebene 5), relativ zur Bildgröße. */
export function liesTsv(tsv: string, breite: number, hoehe: number): Wort[] {
  const r: Wort[] = [];
  for (const z of tsv.split('\n').slice(1)) {
    const s = z.split('\t');
    if (s.length < 12 || s[0] !== '5') continue;
    const t = s.slice(11).join('\t').trim();
    const [l, o, b, h] = [s[6], s[7], s[8], s[9]].map(Number);
    if (!t || !(b > 0) || !(h > 0)) continue;
    r.push([t, r5(l / breite), r5(o / hoehe), r5(b / breite), r5(h / hoehe)]);
  }
  return r;
}

/** Kopf eines PPM/PGM (P6/P5, 8 Bit): Maße und wo die Bildpunkte beginnen. */
export function pnmKopf(b: Buffer): { breite: number; hoehe: number; kanaele: number; start: number } {
  const felder: string[] = [];
  let i = 0;
  while (felder.length < 4 && i < b.length) {
    while (i < b.length && /\s/.test(String.fromCharCode(b[i]))) i++;
    if (b[i] === 0x23) { while (i < b.length && b[i] !== 0x0a) i++; continue; }
    let j = i;
    while (j < b.length && !/\s/.test(String.fromCharCode(b[j]))) j++;
    felder.push(b.toString('latin1', i, j));
    i = j;
  }
  const [art, w, h, max] = felder;
  if ((art !== 'P6' && art !== 'P5') || Number(max) !== 255) throw new Error('Unerwartetes Bildformat von pdftoppm.');
  return { breite: Number(w), hoehe: Number(h), kanaele: art === 'P6' ? 3 : 1, start: i + 1 };
}

export interface Analyse {
  seiten: SchwaerzSeite[];
  /** Woher die Wörter kommen. */
  quelle: 'textebene' | 'texterkennung' | 'gemischt' | 'keine';
  /** Seiten, die per Texterkennung gelesen wurden. */
  erkannt: number;
}

/** Seite ganz ohne Textebene (vermutlich gescannt). */
const ohneText = (s: SchwaerzSeite) => !s.woerter.length;

/**
 * Wörter mit Lage für alle Seiten: aus der Textebene; Seiten ohne Text liest tesseract (wenn da und
 * `sprachen` gesetzt), höchstens `maxErkennung` Seiten.
 */
export async function analysiere(inhalt: Buffer, mime: string, o: { sprachen?: string | null; maxErkennung?: number } = {}): Promise<Analyse> {
  const pdf = await arbeitsPdf(inhalt, mime);
  const drehungen = await seitenlage(pdf);
  const dir = await mkdtemp(join(tmpdir(), 'dms-schwarz-'));
  try {
    const ein = join(dir, 'ein.pdf');
    await writeFile(ein, pdf);
    let html: string;
    try { html = await starte('pdftotext', ['-bbox', '-cropbox', '-enc', 'UTF-8', ein, '-']); } catch (e) { popplerFehler(e, 'Der Text ließ sich nicht lesen'); }
    const seiten = liesBbox(html, drehungen);
    if (seiten.length !== drehungen.length) throw new Fachfehler(422, 'Die Seiten des PDFs ließen sich nicht lesen.');
    // Bilder haben nie eine Textebene; für sie wird immer erkannt.
    let erkannt = 0;
    const mitText = seiten.filter((s) => !ohneText(s)).length;
    if (o.sprachen) {
      const max = o.maxErkennung ?? 50;
      for (const [i, s] of seiten.entries()) {
        if (!ohneText(s) || erkannt >= max) continue;
        try {
          // PDF-Seiten mit 300 dpi; Bilder (1 pt = 1 px) in Originalgröße, höchstens 4000 px.
          const groesse = mime === 'application/pdf' ? ['-r', '300'] : Math.max(s.breite, s.hoehe) > 4000 ? ['-scale-to', '4000'] : ['-r', '72'];
          await starte('pdftoppm', ['-cropbox', '-f', String(i + 1), '-l', String(i + 1), ...groesse, '-gray', ein, join(dir, `o${i}`)]);
          const datei = (await readdir(dir)).find((n) => n.startsWith(`o${i}-`) && n.endsWith('.pgm'));
          if (!datei) continue;
          const k = pnmKopf(await readFile(join(dir, datei)));
          const tsv = await starte('tesseract', [join(dir, datei), 'stdout', '-l', o.sprachen, 'tsv'], 180_000);
          await rm(join(dir, datei), { force: true });
          s.woerter = liesTsv(tsv, k.breite, k.hoehe);
          erkannt++;
        } catch { break; /* ohne tesseract bleibt die Seite ohne Wörter */ }
      }
    }
    const quelle = erkannt && mitText ? 'gemischt' : erkannt ? 'texterkennung' : seiten.some((s) => s.woerter.length) ? 'textebene' : 'keine';
    return { seiten, quelle, erkannt };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Eine Seite als JPEG für den Dialog (längste Seite `px`). */
export async function seitenbild(inhalt: Buffer, mime: string, nr: number, px = ANSICHT_PX): Promise<Buffer | null> {
  const pdf = await arbeitsPdf(inhalt, mime);
  const dir = await mkdtemp(join(tmpdir(), 'dms-schwarz-'));
  try {
    const ein = join(dir, 'ein.pdf');
    await writeFile(ein, pdf);
    try {
      await starte('pdftoppm', ['-cropbox', '-f', String(nr), '-l', String(nr), '-scale-to', String(px), '-jpeg', '-jpegopt', 'quality=80', ein, join(dir, 's')]);
    } catch (e) { popplerFehler(e, 'Die Seite ließ sich nicht anzeigen'); }
    const datei = (await readdir(dir)).find((n) => n.startsWith('s-') && n.endsWith('.jpg'));
    return datei ? readFile(join(dir, datei)) : null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/* ---------- Schwärzen ---------- */

/** Bereiche in die Bildpunkte malen (schwarz, auf ganze Bildpunkte nach außen gerundet). */
export function maleSchwarz(px: Buffer, k: { breite: number; hoehe: number; kanaele: number; start: number }, bereiche: Bereich[]): void {
  for (const a of bereiche) {
    const x1 = Math.max(0, Math.floor(a.x * k.breite)), x2 = Math.min(k.breite, Math.ceil((a.x + a.b) * k.breite));
    const y1 = Math.max(0, Math.floor(a.y * k.hoehe)), y2 = Math.min(k.hoehe, Math.ceil((a.y + a.h) * k.hoehe));
    if (x2 <= x1) continue;
    for (let y = y1; y < y2; y++) {
      const s = k.start + (y * k.breite + x1) * k.kanaele;
      px.fill(0, s, s + (x2 - x1) * k.kanaele);
    }
  }
}

/** Sind (fast) alle Bildpunkte grau? Dann reicht ein Graustufen-JPEG. */
function istGrau(px: Buffer, k: { breite: number; hoehe: number; kanaele: number; start: number }): boolean {
  if (k.kanaele === 1) return true;
  const n = k.breite * k.hoehe;
  const schritt = Math.max(1, Math.floor(n / 200_000));
  for (let i = 0; i < n; i += schritt) {
    const o = k.start + i * 3;
    if (Math.abs(px[o] - px[o + 1]) > 12 || Math.abs(px[o + 1] - px[o + 2]) > 12) return false;
  }
  return true;
}

interface Roh { nr: number; px: Buffer; k: ReturnType<typeof pnmKopf>; grau: boolean }

/** Rohbilder über pdftoppm als JPEG bzw. PNG kodieren (je Bild eine Seite, 1 pt = 1 px). */
async function kodiere(bilder: Roh[], format: 'jpeg' | 'png', grau: boolean, dir: string, tag: string): Promise<Buffer[]> {
  if (!bilder.length) return [];
  const mini = await PDFDocument.create({ updateMetadata: false });
  for (const b of bilder) {
    const daten = grau && b.k.kanaele === 3 ? zuGrau(b.px, b.k) : b.px.subarray(b.k.start);
    const st = PDFRawStream.of(mini.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: b.k.breite, Height: b.k.hoehe, BitsPerComponent: 8,
      ColorSpace: grau || b.k.kanaele === 1 ? 'DeviceGray' : 'DeviceRGB', Filter: 'FlateDecode',
    }), deflateSync(daten, { level: 1 }));
    const ref = mini.context.register(st);
    const seite = mini.addPage([b.k.breite, b.k.hoehe]);
    const name = seite.node.newXObject('Bild', ref);
    seite.node.set(PDFName.of('Contents'), mini.context.register(mini.context.flateStream(`q ${b.k.breite} 0 0 ${b.k.hoehe} 0 0 cm ${name.toString()} Do Q`)));
  }
  const ein = join(dir, `${tag}.pdf`);
  await writeFile(ein, await mini.save());
  const endung = format === 'jpeg' ? '.jpg' : '.png';
  try {
    await starte('pdftoppm', ['-r', '72', ...(format === 'jpeg' ? ['-jpeg', '-jpegopt', `quality=${QUALITAET},optimize=y`] : ['-png']), '-aaVector', 'no', ...(grau ? ['-gray'] : []), ein, join(dir, tag)]);
  } catch (e) { popplerFehler(e, 'Die Seiten ließen sich nicht neu aufbauen'); }
  const namen = (await readdir(dir)).filter((n) => n.startsWith(`${tag}-`) && n.endsWith(endung))
    .sort((a, b) => Number(a.slice(tag.length + 1, -endung.length)) - Number(b.slice(tag.length + 1, -endung.length)));
  if (namen.length !== bilder.length) throw new Fachfehler(422, 'Die Seiten ließen sich nicht neu aufbauen.');
  const r = await Promise.all(namen.map((n) => readFile(join(dir, n))));
  await Promise.all(namen.map((n) => rm(join(dir, n), { force: true })));
  await rm(ein, { force: true });
  return r;
}

function zuGrau(px: Buffer, k: { breite: number; hoehe: number; start: number }): Buffer {
  const n = k.breite * k.hoehe;
  const g = Buffer.allocUnsafe(n);
  for (let i = 0, o = k.start; i < n; i++, o += 3) g[i] = (px[o] * 77 + px[o + 1] * 150 + px[o + 2] * 29) >> 8;
  return g;
}

/** Wörter, die stehen bleiben: die keinen Bereich der Seite berühren. */
export function verbleibende(seiten: SchwaerzSeite[], bereiche: Bereich[]): Wort[][] {
  return seiten.map((s, i) => {
    const hier = bereiche.filter((a) => a.seite === i + 1);
    return hier.length ? s.woerter.filter((w) => !hier.some((a) => wortIn(w, a))) : s.woerter;
  });
}

/** Volltext aus den Wörtern: neue Zeile, wenn ein Wort unter dem vorigen beginnt; Seiten mit Leerzeile getrennt. */
export function textAus(seiten: Wort[][]): string {
  return seiten.map((ws) => {
    let t = '', vor: Wort | null = null;
    for (const w of ws) {
      if (vor) t += w[2] >= vor[2] + vor[4] * 0.6 || w[1] + w[3] < vor[1] ? '\n' : ' ';
      t += w[0];
      vor = w;
    }
    return t;
  }).join('\n\n').trim();
}

/** Unsichtbarer Text (Darstellungsart 3) genau über den Wörtern – zum Suchen und Kopieren. */
function textebene(doc: PDFDocument, font: PDFFont, zeichen: Set<number>, seite: ReturnType<PDFDocument['addPage']>, woerter: Wort[], b: number, h: number) {
  if (!woerter.length) return;
  const name = seite.node.newFontDictionary('T', font.ref);
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
  for (const [roh, x, y, wb, wh] of woerter) {
    const t = [...roh].map((c) => (zeichen.has(c.codePointAt(0)!) ? c : '?')).join('');
    // Senkrechte Wörter (z. B. auf gedrehten Seiten) laufen von oben nach unten.
    const senkrecht = t.length > 1 && wh * h > wb * b * 1.5;
    const groesse = Math.max(1, (senkrecht ? wb * b : wh * h) * 0.8);
    const breite = font.widthOfTextAtSize(t, groesse);
    if (!(breite > 0)) continue;
    const laenge = senkrecht ? wh * h : wb * b;
    ops.push(
      setFontAndSize(name, groesse),
      setCharacterSqueeze(Math.max(1, Math.min(1000, (laenge / breite) * 100))),
      senkrecht
        ? setTextMatrix(0, -1, 1, 0, x * b + wb * b * 0.2, h - y * h)
        : setTextMatrix(1, 0, 0, 1, x * b, h - (y + wh) * h + wh * h * 0.2),
      showText(font.encodeText(t)),
    );
  }
  ops.push(endText(), popGraphicsState());
  seite.pushOperators(...ops);
}

export interface Ergebnis {
  inhalt: Buffer;
  mime: string;
  /** Volltext des Ergebnisses (ohne die geschwärzten Wörter); null ohne Wörter. */
  text: string | null;
  seiten: number;
  /** Geschwärzte Bereiche und betroffene Seiten. */
  bereiche: number;
  betroffen: number;
}

/**
 * Schwärzt: alle Seiten neu rendern, Bereiche schwarz füllen, neu zusammensetzen, Textebene ohne die
 * Wörter in den Bereichen. `analyse` sind die Wörter des Originals (siehe `analysiere`).
 */
export async function schwaerze(inhalt: Buffer, mime: string, analyse: Analyse, bereiche: Bereich[], dpi = SCHWAERZEN_DPI): Promise<Ergebnis> {
  const pdf = await arbeitsPdf(inhalt, mime);
  const drehungen = await seitenlage(pdf);
  const n = drehungen.length;
  if (analyse.seiten.length !== n) throw new Fachfehler(422, 'Die Seiten des Dokuments passen nicht zur Analyse.');
  const bild = mime !== 'application/pdf';
  const bleiben = verbleibende(analyse.seiten, bereiche);
  const dir = await mkdtemp(join(tmpdir(), 'dms-schwarz-'));
  try {
    const ein = join(dir, 'ein.pdf');
    await writeFile(ein, pdf);
    // Bilder in Originalgröße (72 dpi auf der 1-pt-=-1-px-Seite), PDFs in der Ergebnis-Auflösung.
    const groessenArgs = bild
      ? (analyse.seiten[0].breite > BILD_MAX_PX || analyse.seiten[0].hoehe > BILD_MAX_PX ? ['-scale-to', String(BILD_MAX_PX)] : ['-r', '72'])
      : ['-r', String(dpi)];
    const fertig: Array<{ daten: Buffer; grau: boolean }> = [];
    for (let a = 1; a <= n; a += STAPEL) {
      const e = Math.min(n, a + STAPEL - 1);
      try {
        await starte('pdftoppm', ['-cropbox', '-f', String(a), '-l', String(e), ...groessenArgs, ein, join(dir, 'r')]);
      } catch (x) { popplerFehler(x, 'Die Seiten ließen sich nicht rendern'); }
      const namen = (await readdir(dir)).filter((x) => /^r-\d+\.ppm$/.test(x)).sort((p, q) => Number(p.slice(2, -4)) - Number(q.slice(2, -4)));
      if (namen.length !== e - a + 1) throw new Fachfehler(422, 'Die Seiten ließen sich nicht rendern.');
      const roh: Roh[] = [];
      for (const [j, name] of namen.entries()) {
        const px = await readFile(join(dir, name));
        await rm(join(dir, name), { force: true });
        const k = pnmKopf(px);
        const nr = a + j;
        maleSchwarz(px, k, bereiche.filter((x) => x.seite === nr));
        roh.push({ nr, px, k, grau: istGrau(px, k) });
      }
      const format = bild && mime === 'image/png' ? 'png' : 'jpeg';
      const grau = await kodiere(roh.filter((r) => r.grau), format, true, dir, 'g');
      const farbe = await kodiere(roh.filter((r) => !r.grau), format, false, dir, 'f');
      let gi = 0, fi = 0;
      for (const r of roh) fertig.push(r.grau ? { daten: grau[gi++], grau: true } : { daten: farbe[fi++], grau: false });
    }
    const text = analyse.seiten.some((s) => s.woerter.length) ? textAus(bleiben) : null;
    const betroffen = new Set(bereiche.map((b) => b.seite)).size;
    if (bild) return { inhalt: fertig[0].daten, mime, text, seiten: 1, bereiche: bereiche.length, betroffen };

    const doc = await PDFDocument.create({ updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const zeichen = new Set(font.getCharacterSet());
    for (const [i, f] of fertig.entries()) {
      const m = jpegMasse(f.daten);
      if (!m) throw new Fachfehler(422, 'Die Seiten ließen sich nicht neu aufbauen.');
      const b = (m.breite * 72) / dpi, h = (m.hoehe * 72) / dpi;
      const seite = doc.addPage([b, h]);
      const jpg = await doc.embedJpg(eigenerPuffer(f.daten));
      seite.drawImage(jpg, { x: 0, y: 0, width: b, height: h });
      textebene(doc, font, zeichen, seite, bleiben[i], b, h);
      seite.node.delete(PDFName.of('Annots')); // pdf-lib legt eine leere Liste an
    }
    const aus = Buffer.from(await doc.save({ useObjectStreams: true }));
    return { inhalt: aus, mime: 'application/pdf', text, seiten: n, bereiche: bereiche.length, betroffen };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
