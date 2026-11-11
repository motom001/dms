/**
 * Aufkleberbogen als PDF (#345), gezeichnet in der PDF-Stelle (#541). Die Striche des Barcodes (Code 128)
 * berechnet `aufkleber.ts`; hier werden sie mit der lesbaren Nummer auf die Felder des Bogens gesetzt.
 */
import { PDFDocument, rgb } from 'pdf-lib';
import { pdfText, schriften } from './schrift';
import { t } from '../sprache';

export interface Aufkleberbogen {
  /** Etikett in mm: Breite × Höhe, Spalten × Zeilen je A4-Bogen (Ränder ergeben sich zentriert). */
  etikett: { breite: number; hoehe: number; spalten: number; zeilen: number };
  /** Erstes Feld (1 = oben links, zeilenweise) – für angebrochene Bögen. */
  start: number;
  /** Je Aufkleber die lesbare Nummer und die Breiten der Striche und Lücken (beginnt mit Strich). */
  aufkleber: Array<{ nummer: string; striche: number[] }>;
}

const MM = 72 / 25.4;
const A4 = { breite: 210, hoehe: 297 };

export async function aufkleberbogenPdf(b: Aufkleberbogen): Promise<Buffer> {
  const e = b.etikett;
  const doc = await PDFDocument.create();
  doc.setTitle('Archivnummern'); doc.setProducer('Ablago'); doc.setCreator('Ablago');
  const { normal: schrift, fett } = await schriften(doc, ['normal', 'fett']);
  const jeBogen = e.spalten * e.zeilen;
  const randX = (A4.breite - e.spalten * e.breite) / 2;
  const randY = (A4.hoehe - e.zeilen * e.hoehe) / 2;
  let seite = doc.addPage([A4.breite * MM, A4.hoehe * MM]);
  let feld = Math.max(0, Math.min(jeBogen - 1, b.start - 1));
  for (const { nummer, striche: breiten } of b.aufkleber) {
    const nr = pdfText(nummer, fett);
    if (feld >= jeBogen) { seite = doc.addPage([A4.breite * MM, A4.hoehe * MM]); feld = 0; }
    const sp = feld % e.spalten, ze = Math.floor(feld / e.spalten);
    const x0 = (randX + sp * e.breite) * MM;
    const y0 = (A4.hoehe - randY - (ze + 1) * e.hoehe) * MM;
    const w = e.breite * MM, h = e.hoehe * MM;
    // Barcode: Ruhezone 10 Module je Seite, Modulbreite so groß, wie es passt (mind. 0,19 mm).
    const module = breiten.reduce((a, c) => a + c, 0) + 20;
    const modul = Math.min((w - 4 * MM) / module, 0.5 * MM);
    const textGroesse = Math.min(11, h * 0.22);
    const barH = h - textGroesse - 5 * MM;
    let x = x0 + (w - module * modul) / 2 + 10 * modul;
    const yBar = y0 + textGroesse + 3 * MM;
    breiten.forEach((s, i) => {
      if (i % 2 === 0) seite.drawRectangle({ x, y: yBar, width: s * modul, height: barH, color: rgb(0, 0, 0) });
      x += s * modul;
    });
    const tw = fett.widthOfTextAtSize(nr, textGroesse);
    seite.drawText(nr, { x: x0 + (w - tw) / 2, y: y0 + 2 * MM, size: textGroesse, font: fett, color: rgb(0, 0, 0) });
    feld++;
  }
  // Hinweis klein am Rand der ersten Seite: Drucker auf 100 % (nicht „an Seite anpassen“).
  if (randY >= 6) doc.getPages()[0].drawText(pdfText(t('meldungen.aufkleber.drucken-mit-100-nicht'), schrift), { x: 6 * MM, y: 3 * MM, size: 6, font: schrift, color: rgb(0.5, 0.5, 0.5) });
  return Buffer.from(await doc.save());
}
