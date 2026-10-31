import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Archivnummern (#345): Aufkleberbogen als PDF mit Barcode (Code 128, Zeichensatz B) und Klartext.
 * Ohne fremde Bibliothek: Code 128 ist eine feste Tabelle aus Strich- und Lückenbreiten.
 */

/** Strich-/Lückenbreiten (in Modulen) der Werte 0–105; 106 = Stopp (mit Abschlussstrich). */
const MUSTER = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
export const CODE128_MUSTER = MUSTER;
const START_B = 104;
const STOPP = 106;

/** Werte (Start, Zeichen, Prüfzeichen, Stopp) für einen Text in Zeichensatz B (ASCII 32–126). */
export function code128Werte(text: string): number[] {
  if (!text || [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126)) throw new Error('Code 128 B: nur druckbare ASCII-Zeichen');
  const werte = [...text].map((c) => c.charCodeAt(0) - 32);
  const summe = werte.reduce((s, w, i) => s + w * (i + 1), START_B);
  return [START_B, ...werte, summe % 103, STOPP];
}

/** Breiten der Striche und Lücken nacheinander (beginnt mit Strich), ohne Ruhezonen. */
export function code128Breiten(text: string): number[] {
  return code128Werte(text).flatMap((w) => [...MUSTER[w]].map(Number));
}

/** Etikettenformate (A4): Breite × Höhe in mm, Spalten × Zeilen; Ränder ergeben sich zentriert. */
export const ETIKETTEN = {
  '48x25': { name: '48,5 × 25,4 mm (40 je Bogen, z. B. Avery L4736/3657)', breite: 48.5, hoehe: 25.4, spalten: 4, zeilen: 10 },
  '38x21': { name: '38,1 × 21,2 mm (65 je Bogen, z. B. Avery L7651)', breite: 38.1, hoehe: 21.2, spalten: 5, zeilen: 13 },
  '70x37': { name: '70 × 37 mm (24 je Bogen, z. B. Avery 3474)', breite: 70, hoehe: 37, spalten: 3, zeilen: 8 },
} as const;
export type Etikett = keyof typeof ETIKETTEN;

const MM = 72 / 25.4;
const A4 = { breite: 210, hoehe: 297 };

/**
 * Aufkleberbogen: `nummern` ab Feld `start` (1 = oben links, zeilenweise) – so lässt sich ein
 * angebrochener Bogen weiterverwenden. Je Aufkleber Barcode mit `praefix + nummer` und die Nummer lesbar.
 */
export async function aufkleberPdf(nummern: string[], etikett: Etikett, start: number, praefix: string): Promise<Buffer> {
  const e = ETIKETTEN[etikett];
  const doc = await PDFDocument.create();
  doc.setTitle('Archivnummern'); doc.setProducer('DMS'); doc.setCreator('DMS');
  const schrift = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const jeBogen = e.spalten * e.zeilen;
  const randX = (A4.breite - e.spalten * e.breite) / 2;
  const randY = (A4.hoehe - e.zeilen * e.hoehe) / 2;
  let seite = doc.addPage([A4.breite * MM, A4.hoehe * MM]);
  let feld = Math.max(0, Math.min(jeBogen - 1, start - 1));
  for (const nr of nummern) {
    if (feld >= jeBogen) { seite = doc.addPage([A4.breite * MM, A4.hoehe * MM]); feld = 0; }
    const sp = feld % e.spalten, ze = Math.floor(feld / e.spalten);
    const x0 = (randX + sp * e.breite) * MM;
    const y0 = (A4.hoehe - randY - (ze + 1) * e.hoehe) * MM;
    const w = e.breite * MM, h = e.hoehe * MM;
    // Barcode: Ruhezone 10 Module je Seite, Modulbreite so groß, wie es passt (mind. 0,19 mm).
    const breiten = code128Breiten(`${praefix}${nr}`);
    const module = breiten.reduce((a, b) => a + b, 0) + 20;
    const modul = Math.min((w - 4 * MM) / module, 0.5 * MM);
    const textGroesse = Math.min(11, h * 0.22);
    const barH = h - textGroesse - 5 * MM;
    let x = x0 + (w - module * modul) / 2 + 10 * modul;
    const yBar = y0 + textGroesse + 3 * MM;
    breiten.forEach((b, i) => {
      if (i % 2 === 0) seite.drawRectangle({ x, y: yBar, width: b * modul, height: barH, color: rgb(0, 0, 0) });
      x += b * modul;
    });
    const tw = fett.widthOfTextAtSize(nr, textGroesse);
    seite.drawText(nr, { x: x0 + (w - tw) / 2, y: y0 + 2 * MM, size: textGroesse, font: fett, color: rgb(0, 0, 0) });
    feld++;
  }
  // Hinweis klein am Rand der ersten Seite: Drucker auf 100 % (nicht „an Seite anpassen“).
  if (randY >= 6) doc.getPages()[0].drawText('Drucken mit 100 % (nicht „an Seite anpassen“).', { x: 6 * MM, y: 3 * MM, size: 6, font: schrift, color: rgb(0.5, 0.5, 0.5) });
  return Buffer.from(await doc.save());
}
