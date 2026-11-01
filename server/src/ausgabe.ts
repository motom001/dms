/**
 * Ausgabe-Bearbeitungen (#394): Was beim Weitergeben mit einem Dokument passiert – an EINER Stelle für
 * Herunterladen, Export (PDF, ZIP) und E-Mail. Das gespeicherte Original bleibt immer unverändert; hier
 * entsteht nur die ausgegebene Kopie.
 *
 * Heute: Stempel und Wasserzeichen. Später kommen hier PDF verkleinern (#393) und Schwärzen (#392) dazu –
 * als weitere Felder von `Ausgabewunsch` und weitere Schritte in `fuerAusgabe`.
 *
 * Der Stempel wird als Seiteninhalt gezeichnet (Textoperatoren im Inhaltsstrom der Seite), nicht als
 * Anmerkung. Danach werden alle Inhaltsströme einer Seite zu einem einzigen zusammengeführt, damit der
 * Stempel nicht als eigener, leicht löschbarer Strom übrig bleibt. Wer PDF-Werkzeuge beherrscht, kann
 * Textoperatoren trotzdem entfernen – ein Pixel-genaues „Einbrennen“ ist das nicht (siehe Handbuch).
 */
import {
  PDFArray, PDFContentStream, PDFDocument, PDFName, PDFRawStream, PDFRef, StandardFonts, decodePDFRawStream, degrees, rgb,
  type PDFFont, type PDFPage,
} from 'pdf-lib';
import { ersetzePlatzhalter, kannStempeln, type GeltenderStempel, type Stempel } from '../../shared/src/stempel';
import { pdfSicher } from './export';
import { Fachfehler } from './fehler';

export interface Ausgabedatei { name: string; mime: string; inhalt: Buffer }
/** Was mit der Kopie geschehen soll. Später: `verkleinern` (#393), `schwaerzen` (#392). */
export interface Ausgabewunsch { stempel?: GeltenderStempel | null }
export interface Ausgabekontext { benutzer: string; mappe: string; archivnummer?: string | null; datum?: string }
export interface Ausgabe extends Ausgabedatei {
  /** Der Stempeltext mit ersetzten Platzhaltern, wenn gestempelt wurde. */
  stempeltext: string | null;
  /** Grund, warum die Datei unverändert bleibt (z. B. kein PDF/Bild bei freiwilligem Stempel). */
  unveraendert?: string;
}

export { kannStempeln };
export const brauchtBearbeitung = (w: Ausgabewunsch | null | undefined) => !!w?.stempel;

/** „foto.jpg“ → „foto.pdf“ (Bilder werden beim Stempeln zum PDF). */
export function pdfName(name: string): string {
  const p = name.lastIndexOf('.');
  return `${p > 0 ? name.slice(0, p) : name}.pdf`;
}

/**
 * Bereitet eine Datei für die Ausgabe auf. Ohne Bearbeitung kommt sie unverändert zurück.
 * `streng`: eine Datei, die sich nicht stempeln lässt, ist ein Fehler (einzelnes Herunterladen);
 * sonst bleibt sie unverändert – außer der Mappentyp verlangt den Stempel (Pflicht).
 */
export async function fuerAusgabe(d: Ausgabedatei, w: Ausgabewunsch | null | undefined, k: Ausgabekontext, streng = false): Promise<Ausgabe> {
  const g = w?.stempel;
  if (!g) return { ...d, stempeltext: null };
  const text = ersetzePlatzhalter(g.stempel.text, { datum: k.datum, empfaenger: g.empfaenger, benutzer: k.benutzer, mappe: k.mappe });
  if (!kannStempeln(d.mime)) {
    const grund = `„${d.name}“ lässt sich nicht stempeln – das geht nur bei PDFs und Bildern (JPEG, PNG).`;
    if (streng || g.pflicht) throw new Fachfehler(422, g.pflicht ? `${grund} Der Mappentyp verlangt beim Weitergeben einen Stempel.` : grund);
    return { ...d, stempeltext: null, unveraendert: grund };
  }
  let doc: PDFDocument;
  try {
    doc = d.mime === 'application/pdf' ? await PDFDocument.load(d.inhalt, { updateMetadata: false }) : await bildAlsPdf(d.inhalt, d.mime === 'image/png');
  } catch (x) {
    const verschluesselt = /encrypt/i.test((x as Error).message);
    throw new Fachfehler(422, verschluesselt ? `„${d.name}“ ist verschlüsselt und lässt sich darum nicht stempeln.` : `„${d.name}“ ließ sich nicht lesen und darum nicht stempeln.`);
  }
  await stempele(doc, g.stempel, text, k.archivnummer ?? null);
  const inhalt = Buffer.from(await doc.save({ useObjectStreams: false }));
  return { name: d.mime === 'application/pdf' ? d.name : pdfName(d.name), mime: 'application/pdf', inhalt, stempeltext: text || null };
}

/** Ein Bild (JPEG/PNG) als PDF-Seite in A4, Hoch- oder Querformat nach dem Bild. */
export async function bildAlsPdf(bild: Buffer, png: boolean): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setProducer('DMS'); doc.setCreator('DMS');
  const b = png ? await doc.embedPng(bild) : await doc.embedJpg(bild);
  const quer = b.width > b.height;
  const [w, h] = quer ? [841.89, 595.28] : [595.28, 841.89];
  const rand = 28;
  const k = Math.min((w - 2 * rand) / b.width, (h - 2 * rand) / b.height);
  const seite = doc.addPage([w, h]);
  seite.drawImage(b, { x: (w - b.width * k) / 2, y: (h - b.height * k) / 2, width: b.width * k, height: b.height * k });
  return doc;
}

const ROT = rgb(0.75, 0.08, 0.08);
const SCHWARZ = rgb(0.15, 0.15, 0.18);

/** Zeichnet Stempel und Fußzeile auf die Seiten und führt danach die Inhaltsströme zusammen. */
export async function stempele(doc: PDFDocument, s: Stempel, text: string, archivnummer: string | null) {
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const seiten = doc.getPages();
  const t = pdfSicher(text);
  const fuss = (i: number) => [s.archivnummer && archivnummer ? pdfSicher(archivnummer) : '', s.seitenzahlen ? `Seite ${i + 1} von ${seiten.length}` : ''].filter(Boolean).join(' · ');
  seiten.forEach((p, i) => {
    const f = fuss(i);
    if (t && (s.seiten === 'alle' || i === 0)) zeichneStempel(p, s, t, fett, !!f);
    if (f) zeichneFuss(p, f, normal);
  });
  verschmelzeInhalte(doc, s.seiten === 'erste' && !s.seitenzahlen && !s.archivnummer ? seiten.slice(0, 1) : seiten);
}

/** Sichtbarer Bereich der Seite und Abbildung „sichtbar → Seitenkoordinaten“ (gedrehte Seiten, /Rotate). */
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

/** Text an einer Stelle im sichtbaren Koordinatensystem, um `winkel` gedreht (Grad, gegen den Uhrzeigersinn). */
function text(p: PDFPage, s: string, vx: number, vy: number, winkel: number, groesse: number, font: PDFFont, farbe = ROT, deckkraft = 1) {
  const R = rahmen(p);
  const { x, y } = R.nach(vx, vy);
  p.drawText(s, { x, y, size: groesse, font, color: farbe, opacity: deckkraft, rotate: degrees(winkel + R.r) });
}

function zeichneStempel(p: PDFPage, s: Stempel, t: string, font: PDFFont, mitFuss: boolean) {
  const { w, h } = rahmen(p);
  const breite = (g: number) => font.widthOfTextAtSize(t, g);
  const passend = (max: number, platz: number, min = 6) => Math.max(min, Math.min(max, max * platz / Math.max(1, breite(max))));
  const rand = Math.max(18, Math.min(w, h) * 0.04);
  if (s.lage === 'diagonal') {
    const a = Math.atan2(h, w);
    const laenge = Math.hypot(w, h);
    const g = passend(110, laenge * 0.75, 10);
    const tw = breite(g);
    const cos = Math.cos(a), sin = Math.sin(a);
    // Mitte der Seite; Grundlinie um die halbe Versalhöhe nach unten versetzt.
    const hoehe = font.heightAtSize(g, { descender: false }) / 2;
    const vx = w / 2 - (tw / 2) * cos + hoehe * sin;
    const vy = h / 2 - (tw / 2) * sin - hoehe * cos;
    text(p, t, vx, vy, (a * 180) / Math.PI, g, font, ROT, s.deckkraft);
  } else if (s.lage === 'kopf' || s.lage === 'fuss') {
    const g = passend(14, w - 2 * rand);
    const vy = s.lage === 'kopf' ? h - rand - g * 0.75 : rand + (mitFuss ? 14 : 0);
    text(p, t, (w - breite(g)) / 2, vy, 0, g, font, ROT, s.deckkraft);
  } else {
    // Ecke: wie ein Stempel mit Rahmen, oben rechts.
    const g = passend(13, w * 0.45);
    const pad = g * 0.5;
    const bw = breite(g) + 2 * pad, bh = g + 2 * pad;
    const vx = w - rand - bw, vy = h - rand - bh;
    const R = rahmen(p);
    const o = R.nach(vx, vy);
    p.drawRectangle({ x: o.x, y: o.y, width: bw, height: bh, borderColor: ROT, borderWidth: 1.5, borderOpacity: s.deckkraft, opacity: 0, rotate: degrees(R.r) });
    text(p, t, vx + pad, vy + pad + g * 0.12, 0, g, font, ROT, s.deckkraft);
  }
}

function zeichneFuss(p: PDFPage, f: string, font: PDFFont) {
  const { w } = rahmen(p);
  const g = 8;
  text(p, f, w - 18 - font.widthOfTextAtSize(f, g), 10, 0, g, font, SCHWARZ, 1);
}

/**
 * Alle Inhaltsströme der Seiten zu einem zusammenführen (#394): Der Stempel steckt danach im selben Strom
 * wie der übrige Seiteninhalt. Ströme, die nirgends mehr verwendet werden, fliegen aus der Datei.
 * Lässt sich ein Strom nicht entpacken (unbekannter Filter), bleibt die Seite, wie sie ist.
 */
export function verschmelzeInhalte(doc: PDFDocument, seiten: PDFPage[]) {
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
