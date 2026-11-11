/**
 * Stempel auf PDFs (#394, #799), gezeichnet in der PDF-Stelle (#541). Was gestempelt wird und wann,
 * entscheidet `ausgabe.ts`. Der Stempel steht auf den Seiten des Dokuments selbst, nie auf einem eigenen
 * Deckblatt, das man einfach entfernen könnte.
 *
 * Der Stempel wird als Seiteninhalt gezeichnet (Textoperatoren im Inhaltsstrom der Seite), nicht als
 * Anmerkung. Danach werden alle Inhaltsströme einer Seite zu einem einzigen zusammengeführt, damit der
 * Stempel nicht als eigener, leicht löschbarer Strom übrig bleibt.
 */
import {
  BlendMode, PDFArray, PDFContentStream, PDFDocument, PDFName, PDFRawStream, PDFRef, concatTransformationMatrix, decodePDFRawStream,
  popGraphicsState, pushGraphicsState, rgb, type PDFFont, type PDFPage,
} from 'pdf-lib';
import { ersetzePlatzhalter, STEMPEL_FARBEN, stempelLayout, type Stempel } from '../../../shared/src/stempel';
import { Fachfehler } from '../fehler';
import { eigenerPuffer } from './puffer';
import { pdfText, schriften } from './schrift';
import { ladePdf } from './laden';
import { t } from '../sprache';

export interface StempelAuftrag {
  /** Name (nur für Meldungen), Art und Inhalt der Datei: PDF, JPEG oder PNG. */
  name: string; mime: string; inhalt: Uint8Array;
  stempel: Stempel;
  /** Stempeltext mit ersetzten Platzhaltern; {seite} und {seiten} ersetzt erst diese Stelle je Seite (#799). */
  text: string;
  /** Mit Objektströmen speichern (nach dem Verkleinern, sonst wäre ein Teil der Ersparnis wieder weg). */
  objektstroeme?: boolean;
}

/** Stempelt eine Datei; Bilder werden dabei zum PDF in A4. */
export async function stempelePdf(a: StempelAuftrag): Promise<Buffer> {
  let doc: PDFDocument;
  try {
    doc = a.mime === 'application/pdf' ? await ladePdf(a.inhalt, { updateMetadata: false }) : await bildDokument(a.inhalt, a.mime === 'image/png');
  } catch (x) {
    const verschluesselt = /encrypt/i.test((x as Error).message);
    throw new Fachfehler(422, verschluesselt ? t('meldungen.stempel.ist-verschluesselt-und-laesst', { name: a.name }) : t('meldungen.stempel.liess-sich-nicht-lesen', { name: a.name }));
  }
  // Kaputte Seiten (z. B. kreisförmiger Seitenbaum, falsche Inhalte) zeigen sich erst beim Zeichnen oder Speichern (#823):
  // dann dieselbe verständliche Meldung statt eines Fehlers aus pdf-lib.
  try {
    await stempele(doc, a.stempel, a.text);
    return Buffer.from(await doc.save({ useObjectStreams: !!a.objektstroeme }));
  } catch (x) {
    if (x instanceof Fachfehler) throw x;
    throw new Fachfehler(422, t('meldungen.stempel.liess-sich-nicht-lesen', { name: a.name }));
  }
}

/** Ein Bild (JPEG/PNG) als PDF-Seite in A4, Hoch- oder Querformat nach dem Bild. */
export async function bildAlsA4Pdf(bild: Uint8Array, png: boolean): Promise<Buffer> {
  return Buffer.from(await (await bildDokument(bild, png)).save());
}

async function bildDokument(bild: Uint8Array, png: boolean): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setProducer('Ablago'); doc.setCreator('Ablago');
  const b = png ? await doc.embedPng(eigenerPuffer(bild)) : await doc.embedJpg(eigenerPuffer(bild));
  const quer = b.width > b.height;
  const [w, h] = quer ? [841.89, 595.28] : [595.28, 841.89];
  const rand = 28;
  const k = Math.min((w - 2 * rand) / b.width, (h - 2 * rand) / b.height);
  const seite = doc.addPage([w, h]);
  seite.drawImage(b, { x: (w - b.width * k) / 2, y: (h - b.height * k) / 2, width: b.width * k, height: b.height * k });
  return doc;
}

/**
 * Zeichnet den Stempel auf die Seiten (je Seite mit {seite} und {seiten}) und führt danach die Inhaltsströme
 * zusammen. Das Layout kommt aus `stempelLayout` (shared) – dieselbe Rechnung wie die Vorschau der Werkbank.
 */
async function stempele(doc: PDFDocument, s: Stempel, text: string) {
  const { fett } = await schriften(doc, ['fett']);
  const seiten = doc.getPages();
  const gestempelt: PDFPage[] = [];
  seiten.forEach((p, i) => {
    if (s.seiten === 'erste' && i > 0) return;
    const t = pdfText(ersetzePlatzhalter(text, { seite: i + 1, seiten: seiten.length }), fett);
    if (!t.trim()) return;
    zeichneStempel(p, s, t, fett);
    gestempelt.push(p);
  });
  verschmelzeInhalte(doc, gestempelt);
}

/** Sichtbarer Bereich der Seite und Abbildung „sichtbar (Ursprung unten links) → Seitenkoordinaten“ (/Rotate). */
function rahmen(p: PDFPage) {
  const box = p.getCropBox();
  const r = ((p.getRotation().angle % 360) + 360) % 360;
  const quer = r === 90 || r === 270;
  const w = quer ? box.height : box.width, h = quer ? box.width : box.height;
  const nach = (vx: number, vy: number): { x: number; y: number } => {
    switch (r) {
      case 90: return { x: box.x + box.width - vy, y: box.y + vx };
      case 180: return { x: box.x + box.width - vx, y: box.y + box.height - vy };
      case 270: return { x: box.x + vy, y: box.y + box.height - vx };
      default: return { x: box.x + vx, y: box.y + vy };
    }
  };
  return { w, h, r, nach };
}

/**
 * Ein Stempel als Block: Koordinatensystem in die Mitte des Stempels legen und um die Drehung kippen (auch bei
 * gedrehten Seiten), darin Zeilen und Rahmen zeichnen. „Wie Tinte“ ist der Mischmodus „Multiplizieren“.
 */
function zeichneStempel(p: PDFPage, s: Stempel, t: string, font: PDFFont) {
  const R = rahmen(p);
  const L = stempelLayout(s, t, R.w, R.h, (z, g) => font.widthOfTextAtSize(z, g));
  // Lokal (lx, ly; y nach oben) → sichtbar (unten links) → Seite. Im Uhrzeigersinn drehen heißt mathematisch negativ.
  const phi = (-L.winkel * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const abb = (lx: number, ly: number) => R.nach(L.cx + lx * cos - ly * sin, R.h - L.cy + lx * sin + ly * cos);
  const o = abb(0, 0), ex = abb(1, 0), ey = abb(0, 1);
  const [rr, gg, bb] = STEMPEL_FARBEN[s.farbe];
  const farbe = rgb(rr, gg, bb);
  const misch = s.tinte ? BlendMode.Multiply : undefined;
  p.pushOperators(pushGraphicsState(), concatTransformationMatrix(ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y));
  if (L.rahmen) {
    const { b, h, doppelt } = L.rahmen;
    const rand = { borderColor: farbe, borderOpacity: s.deckkraft, opacity: 0, blendMode: misch };
    p.drawRectangle({ x: -b / 2, y: -h / 2, width: b, height: h, borderWidth: doppelt ? 2 : 1.5, ...rand });
    if (doppelt) { const e = L.groesse * 0.22; p.drawRectangle({ x: -b / 2 + e, y: -h / 2 + e, width: b - 2 * e, height: h - 2 * e, borderWidth: 0.75, ...rand }); }
  }
  for (const z of L.zeilen) p.drawText(z.text, { x: z.x, y: -z.y, size: L.groesse, font, color: farbe, opacity: s.deckkraft, blendMode: misch });
  p.pushOperators(popGraphicsState());
}

/**
 * Alle Inhaltsströme der Seiten zu einem zusammenführen (#394): Der Stempel steckt danach im selben Strom
 * wie der übrige Seiteninhalt. Ströme, die nirgends mehr verwendet werden, fliegen aus der Datei.
 * Lässt sich ein Strom nicht entpacken (unbekannter Filter), bleibt die Seite, wie sie ist.
 */
function verschmelzeInhalte(doc: PDFDocument, seiten: PDFPage[]) {
  const ctx = doc.context;
  const alt = new Set<PDFRef>();
  for (const p of seiten) {
    const c = p.node.Contents();
    if (!(c instanceof PDFArray)) continue;
    const teile: Uint8Array[] = [];
    const refs: PDFRef[] = [];
    let ok = true;
    for (let i = 0; i < c.size(); i++) {
      const ref = c.get(i);
      const st = ctx.lookup(ref);
      try {
        if (st instanceof PDFRawStream) teile.push(decodePDFRawStream(st).decode());
        else if (st instanceof PDFContentStream) teile.push(st.getUnencodedContents());
        else { ok = false; break; }
      } catch { ok = false; break; }
      if (ref instanceof PDFRef) refs.push(ref);
    }
    if (!ok) continue;
    const laenge = teile.reduce((a, b) => a + b.length + 1, 0);
    const alles = new Uint8Array(laenge);
    let o = 0;
    for (const b of teile) { alles.set(b, o); o += b.length; alles[o++] = 0x0a; }
    p.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(alles)));
    for (const r of refs) alt.add(r);
  }
  if (!alt.size) return;
  const benutzt = new Set<string>();
  for (const p of doc.getPages()) {
    const c = p.node.get(PDFName.of('Contents'));
    if (c instanceof PDFRef) benutzt.add(c.toString());
    const arr = p.node.Contents();
    if (arr instanceof PDFArray) for (let i = 0; i < arr.size(); i++) { const r = arr.get(i); if (r instanceof PDFRef) benutzt.add(r.toString()); }
  }
  for (const r of alt) if (!benutzt.has(r.toString())) ctx.delete(r);
}
