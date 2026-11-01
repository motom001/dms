/**
 * Testdaten für PDF verkleinern (#393): ein großes Bild-PDF wie ein Scan – ein JPEG mit hoher Auflösung
 * (pdftoppm rastert eine Seite mit Farbverlauf und Rauschen) auf einer A4-Seite, darüber unsichtbarer Text
 * (Darstellungsart 3, wie eine Textebene aus der Texterkennung).
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PDFDocument, PDFName, StandardFonts, TextRenderingMode, beginText, endText, moveText, setFontAndSize, setTextRenderingMode, showText,
} from 'pdf-lib';

export const TEXT = 'Rechnung Nummer 4711 Stadtwerke Musterstadt';

/** Rohe RGB-Bildpunkte: Verlauf mit Rauschen (fester Startwert). */
function bildpunkte(b: number, h: number): Buffer {
  const p = Buffer.alloc(b * h * 3);
  let s = 12345;
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const r = (s >> 16) & 0x3f;
    const i = (y * b + x) * 3;
    p[i] = Math.min(255, (x * 255) / b + r); p[i + 1] = Math.min(255, (y * 255) / h + r); p[i + 2] = Math.min(255, 160 + r);
  }
  return p;
}

const lauf = (cmd: string, args: string[]) => new Promise<void>((ok, f) => execFile(cmd, args, (e) => (e ? f(e) : ok())));

/** Ein JPEG mit `dpi` für eine A4-Seite (ca. 3300 × 4680 bei 400 dpi), wahlweise in Graustufen. */
export async function grossesJpeg(dpi = 400, qualitaet = 92, grau = false): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-test-jpeg-'));
  try {
    const doc = await PDFDocument.create();
    const seite = doc.addPage([595.28, 841.89]);
    const [b, h] = [600, 850];
    const st = doc.context.flateStream(bildpunkte(b, h), { Type: 'XObject', Subtype: 'Image', Width: b, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 });
    // flateStream packt selbst; die Rohdaten sind schon die Bildpunkte.
    const name = seite.node.newXObject('Im', doc.context.register(st));
    seite.node.set(PDFName.of('Contents'), doc.context.obj([doc.context.register(doc.context.flateStream(`q 595.28 0 0 841.89 0 0 cm ${name.toString()} Do Q`))]));
    const font = await doc.embedFont(StandardFonts.Helvetica);
    seite.drawText('Stadtwerke Musterstadt – Jahresabrechnung', { x: 60, y: 760, size: 22, font });
    await writeFile(join(dir, 'q.pdf'), await doc.save());
    await lauf('pdftoppm', ['-r', String(dpi), '-jpeg', '-jpegopt', `quality=${qualitaet}`, ...(grau ? ['-gray'] : []), '-singlefile', join(dir, 'q.pdf'), join(dir, 'b')]);
    return await readFile(join(dir, 'b.jpg'));
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** PDF mit `seiten` Seiten, je ein großes JPEG auf ganzer Seite plus unsichtbarer Text. */
export async function grossesPdf(o: { seiten?: number; dpi?: number; jpeg?: Buffer } = {}): Promise<Buffer> {
  const jpeg = o.jpeg ?? await grossesJpeg(o.dpi ?? 400);
  const doc = await PDFDocument.create();
  const bild = await doc.embedJpg(jpeg);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < (o.seiten ?? 1); i++) {
    const s = doc.addPage([595.28, 841.89]);
    s.drawImage(bild, { x: 0, y: 0, width: 595.28, height: 841.89 });
    const f = s.node.newFontDictionary('F', font.ref);
    s.pushOperators(beginText(), setFontAndSize(f, 12), setTextRenderingMode(TextRenderingMode.Invisible), moveText(60, 700),
      showText(font.encodeText(`${TEXT} Seite ${i + 1}`)), endText());
  }
  return Buffer.from(await doc.save());
}

/** Ein kleines PDF nur mit Text (Verkleinern bringt nichts). */
export async function textPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595.28, 841.89]).drawText(TEXT, { x: 60, y: 700, size: 14, font });
  return Buffer.from(await doc.save({ useObjectStreams: true }));
}

