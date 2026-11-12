/**
 * Notfallblatt als PDF (#814): eine Seite A4 in Ablago-Optik, gezeichnet in der PDF-Stelle (#541) im Arbeiter.
 * Die Texte kommen fertig aus `notfallblattPlan` (server/src/notfallblatt.ts); hier stehen nur Lage, Farben und Logo.
 *
 * Marke: Ablago-Blau #1F4E79, Bernstein #E8A33D, Tinte #141A22 (docs/marke/). Auch in Schwarzweiß lesbar: Text in
 * Tinte oder Blau auf Weiß, Bernstein nur als Zierde. Schrift: Noto Sans (Überschriften, Text; eingebettet als Teilmenge,
 * #826) und Courier fett für Schlüssel, Codes und Ablage-Id – die bestehen nur aus ASCII, dafür reicht die Standardschrift.
 */
import { PDFDocument, PDFName, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { angabe, pdfText, schriften } from './schrift';
import type { NotfallblattPlan } from '../notfallblatt';
import { gebietsschema } from '../../../shared/src/sprache';

const BLAU = rgb(0x1f / 255, 0x4e / 255, 0x79 / 255);
const BERNSTEIN = rgb(0xe8 / 255, 0xa3 / 255, 0x3d / 255);
const TINTE = rgb(0x14 / 255, 0x1a / 255, 0x22 / 255);
const LEISE = rgb(0.33, 0.37, 0.42);
const LINIE = rgb(0.8, 0.83, 0.87);
const WEISS = rgb(1, 1, 1);

const BREITE = 595.28, HOEHE = 841.89, RAND = 48;
const INNEN = BREITE - 2 * RAND;

interface Schriften { normal: PDFFont; fett: PDFFont; mono: PDFFont }

/** Zeilen umbrechen nach echter Breite. */
function umbrechen(text: string, font: PDFFont, groesse: number, breite: number): string[] {
  const zeilen: string[] = [];
  for (const absatz of pdfText(text, font).split('\n')) {
    let z = '';
    for (const wort of absatz.split(' ')) {
      const probe = z ? `${z} ${wort}` : wort;
      if (z && font.widthOfTextAtSize(probe, groesse) > breite) { zeilen.push(z); z = wort; } else z = probe;
    }
    zeilen.push(z);
  }
  return zeilen;
}

/** Klickbarer Link (URI) über einem Rechteck. */
function verlinke(doc: PDFDocument, seite: PDFPage, url: string, x: number, y: number, b: number, h: number) {
  const annot = doc.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + b, y + h], Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
  });
  seite.node.addAnnot(doc.context.register(annot));
}

/** Logo wie docs/marke/ablago-logo-mit-schriftzug.svg: Kachel, Ablage, Blatt – und der Schriftzug. */
function logo(seite: PDFPage, s: Schriften, x: number, oben: number, groesse: number) {
  const k = groesse / 96;
  seite.drawSvgPath('M21 0H75A21 21 0 0 1 96 21V75A21 21 0 0 1 75 96H21A21 21 0 0 1 0 75V21A21 21 0 0 1 21 0Z', { x, y: oben, scale: k, color: BLAU });
  // Blatt: Rechteck 30 × 40 um (48, 32) um −12° gedreht.
  const w = (-12 * Math.PI) / 180;
  const ecke = (px: number, py: number) => { const dx = px - 48, dy = py - 32; return `${(48 + dx * Math.cos(w) - dy * Math.sin(w)).toFixed(2)} ${(32 + dx * Math.sin(w) + dy * Math.cos(w)).toFixed(2)}`; };
  seite.drawSvgPath(`M${ecke(33, 12)}L${ecke(63, 12)}L${ecke(63, 52)}L${ecke(33, 52)}Z`, { x, y: oben, scale: k, color: BERNSTEIN });
  seite.drawSvgPath('M12 60H28c4 8 11 12 20 12s16-4 20-12H84v16a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6Z', { x, y: oben, scale: k, color: WEISS });
  seite.drawText('Ablago', { x: x + groesse * 1.2, y: oben - groesse * 0.69, size: groesse * 0.58, font: s.fett, color: BLAU });
}

/**
 * Passen viele Notfallkontakte nicht mehr auf die Seite (#812), stehen sie auf einer zweiten Seite; auf der ersten
 * verweist „Wen fragen?“ dorthin. Alles andere bleibt auf der ersten Seite. Vorher (#671) werden Aufrufe von außen und
 * Ziele nach außen nur gezählt; passt es dann immer noch nicht, fehlt diese Zeile (die Werkbank zeigt sie).
 */
export async function notfallblattPdf(p: NotfallblattPlan): Promise<Uint8Array> {
  // #671: Zuerst die Zeilen „Aufrufe von außen“ / „Ziele nach außen“ knapp (nur gezählt), dann die Kontakte auf Seite 2.
  const kurz: NotfallblattPlan = { ...p, ablage: { ...p.ablage, zeilen: p.ablage.zeilen.map((z) => (z.kurz ? { ...z, text: z.kurz } : z)) } };
  const versuche: Array<[NotfallblattPlan, boolean]> = [[p, false], ...(kurz.ablage.zeilen.some((z, i) => z.text !== p.ablage.zeilen[i].text) ? [[kurz, false]] as Array<[NotfallblattPlan, boolean]> : [])];
  if (p.fragen.kontakte.length) versuche.push([kurz, true]);
  // Zuletzt ohne diese Zeilen (sehr langer Name, viele Ziele der Sicherung …): Sie stehen ohnehin in der Werkbank.
  const ohne: NotfallblattPlan = { ...p, ablage: { ...p.ablage, zeilen: p.ablage.zeilen.filter((z) => !z.kurz) } };
  if (ohne.ablage.zeilen.length < p.ablage.zeilen.length) versuche.push([ohne, p.fragen.kontakte.length > 0]);
  let letzter: unknown;
  for (const [plan, seite2] of versuche) {
    try { return await zeichne(plan, seite2); } catch (e) { if (!(e instanceof ZuLang)) throw e; letzter = e; }
  }
  throw letzter;
}

class ZuLang extends Error {}

async function zeichne(p: NotfallblattPlan, fragenAufSeite2: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(angabe(p.dokumenttitel)); doc.setProducer('Ablago'); doc.setCreator('Ablago'); doc.setLanguage(gebietsschema());
  const s: Schriften = { ...await schriften(doc, ['normal', 'fett']), mono: await doc.embedFont(StandardFonts.CourierBold) };
  let seite = doc.addPage([BREITE, HOEHE]);
  let y = HOEHE - RAND;

  /** Text mit Umbruch ab der aktuellen Zeile; liefert die Höhe. */
  const text = (t: string, o: { x?: number; breite?: number; font?: PDFFont; groesse?: number; farbe?: RGB; abstand?: number } = {}) => {
    const font = o.font ?? s.normal, g = o.groesse ?? 10, zh = g * 1.3, x = o.x ?? RAND; // 1,3 statt 1,35 (#826): Noto Sans ist breiter als Helvetica und bricht öfter um – so bleibt es bei einer Seite
    y -= o.abstand ?? 0;
    for (const z of umbrechen(t, font, g, o.breite ?? INNEN - (x - RAND))) { y -= zh; seite.drawText(z, { x, y: y + zh - g, size: g, font, color: o.farbe ?? TINTE }); }
  };
  const link = (marke: string, url: string, x: number, g = 10.5) => {
    y -= g * 1.5;
    const m = pdfText(`${marke}: `, s.fett);
    seite.drawText(m, { x, y, size: g, font: s.fett, color: TINTE });
    const u = pdfText(url, s.normal), lx = x + s.fett.widthOfTextAtSize(m, g), lb = s.normal.widthOfTextAtSize(u, g);
    seite.drawText(u, { x: lx, y, size: g, font: s.normal, color: BLAU });
    seite.drawLine({ start: { x: lx, y: y - 1.5 }, end: { x: lx + lb, y: y - 1.5 }, thickness: 0.6, color: BLAU });
    verlinke(doc, seite, url, lx, y - 3, lb, g + 3);
  };
  const abschnitt = (titel: string) => {
    y -= 20;
    seite.drawRectangle({ x: RAND, y: y - 2, width: 3, height: 13, color: BERNSTEIN });
    seite.drawText(pdfText(titel, s.fett), { x: RAND + 9, y, size: 13, font: s.fett, color: BLAU });
    y -= 6;
  };

  // Kopf: Logo links, rechts Notfallblatt, Name der Ablage, Datum und Version; darunter eine Linie in Blau.
  logo(seite, s, RAND, y, 40);
  const rechts = BREITE - RAND;
  const rechtsText = (t: string, font: PDFFont, g: number, farbe: RGB, hoehe: number) => {
    for (const z of umbrechen(t, font, g, 300)) { seite.drawText(z, { x: rechts - font.widthOfTextAtSize(z, g), y: hoehe, size: g, font, color: farbe }); hoehe -= g * 1.3; }
    return hoehe;
  };
  let ky = rechtsText(p.kopf.titel, s.fett, 20, TINTE, y - 18);
  ky = rechtsText(p.kopf.name, s.fett, 11, BLAU, ky - 2);
  ky = rechtsText(p.kopf.unter, s.normal, 8.5, LEISE, ky);
  y = Math.min(y - 48, ky - 4);
  seite.drawLine({ start: { x: RAND, y }, end: { x: rechts, y }, thickness: 1.5, color: BLAU });
  text(p.einleitung, { groesse: 9.5, abstand: 6 });

  // Schlüssel: groß, in Gruppen, die Null durchgestrichen, Lesehilfe unter verwechselbaren Zeichen.
  abschnitt(p.schluessel.titel);
  const ZG = 22, ZELLE = 20, LUECKE = 16, JE_ZEILE = 5, HILFE_G = 6.5;
  const kastenOben = y - 4;
  y -= 10;
  for (let r = 0; r * JE_ZEILE < p.schluessel.gruppen.length; r++) {
    y -= ZG;
    const grundlinie = y;
    let tiefer = 0;
    p.schluessel.gruppen.slice(r * JE_ZEILE, (r + 1) * JE_ZEILE).forEach((gruppe, gi) => {
      // Ebene der Lesehilfe: Folgen Hinweise aufeinander, stehen sie abwechselnd oben und eine Zeile tiefer.
      let ebene = -1;
      gruppe.forEach((z, zi) => {
        const zx = RAND + 12 + gi * (4 * ZELLE + LUECKE) + zi * ZELLE;
        const zeichen = pdfText(z.zeichen, s.mono), zb = s.mono.widthOfTextAtSize(zeichen, ZG);
        const x0 = zx + (ZELLE - zb) / 2;
        seite.drawText(zeichen, { x: x0, y: grundlinie, size: ZG, font: s.mono, color: TINTE });
        if (z.zeichen === '0') seite.drawLine({ start: { x: x0 + zb * 0.2, y: grundlinie + 1 }, end: { x: x0 + zb * 0.8, y: grundlinie + ZG * 0.6 }, thickness: 1.6, color: TINTE });
        if (z.hilfe) {
          ebene = ebene === 0 ? 1 : 0;
          const versatz = ebene * (HILFE_G + 1.5);
          const hilfe = pdfText(z.hilfe, s.normal), hb = s.normal.widthOfTextAtSize(hilfe, HILFE_G);
          seite.drawText(hilfe, { x: zx + (ZELLE - hb) / 2, y: grundlinie - 9 - versatz, size: HILFE_G, font: s.normal, color: LEISE });
          tiefer = Math.max(tiefer, versatz);
        } else ebene = -1;
      });
    });
    y -= 14 + tiefer;
  }
  seite.drawRectangle({ x: RAND, y: y - 2, width: INNEN, height: kastenOben - y + 2, borderColor: BLAU, borderWidth: 1, opacity: 0, borderOpacity: 1 });
  y -= 4;
  text(p.schluessel.hinweis, { groesse: 8.5, farbe: LEISE, abstand: 4 });
  y -= 14;
  const fm = pdfText(`${p.schluessel.fingerabdruckTitel}: `, s.fett);
  seite.drawText(fm, { x: RAND, y, size: 10, font: s.fett, color: TINTE });
  seite.drawText(pdfText(p.schluessel.fingerabdruck, s.mono), { x: RAND + s.fett.widthOfTextAtSize(fm, 10), y, size: 10, font: s.mono, color: TINTE });
  text(p.schluessel.fingerabdruckHinweis, { groesse: 8.5, farbe: LEISE, abstand: 3 });

  // Diese Ablage: Adresse, Ablage-Id, wo die Sicherungen liegen.
  abschnitt(p.ablage.titel);
  const MARKE = 96;
  for (const z of p.ablage.zeilen) {
    const oben = y;
    seite.drawText(pdfText(z.marke, s.fett), { x: RAND, y: oben - 10, size: 10, font: s.fett, color: TINTE });
    if (z.link) {
      const lt = pdfText(z.text, s.normal), lb = s.normal.widthOfTextAtSize(lt, 10);
      seite.drawText(lt, { x: RAND + MARKE, y: oben - 10, size: 10, font: s.normal, color: BLAU });
      seite.drawLine({ start: { x: RAND + MARKE, y: oben - 11.5 }, end: { x: RAND + MARKE + lb, y: oben - 11.5 }, thickness: 0.6, color: BLAU });
      verlinke(doc, seite, z.link, RAND + MARKE, oben - 13, lb, 13);
      y = oben - 13.5;
    } else text(z.text, { x: RAND + MARKE, font: z.mono ? s.mono : s.normal });
    y -= 3;
  }
  if (p.ablage.warnung) text(p.ablage.warnung, { groesse: 8.5, farbe: LEISE });

  // Wen fragen? Notfallkontakte (#812) in zwei Spalten: Name fett, darunter Telefon und E-Mail, dann die Notiz leise.
  // Passen sie nicht mehr auf die Seite, stehen sie auf Seite 2 – hier dann nur der Verweis – oder Zeilen zum Eintragen.
  const SPALTE = (INNEN - 16) / 2;
  const kontakte = () => {
    for (let i = 0; i < p.fragen.kontakte.length; i += 2) {
      const oben = y;
      let unten = y;
      p.fragen.kontakte.slice(i, i + 2).forEach((k, sp) => {
        y = oben;
        const x = RAND + sp * (SPALTE + 16);
        text(k.name, { x, breite: SPALTE, font: s.fett, groesse: 9.5, abstand: 2 });
        if (k.erreichbar) text(k.erreichbar, { x, breite: SPALTE, groesse: 9 });
        if (k.notiz) text(k.notiz, { x, breite: SPALTE, groesse: 8, farbe: LEISE });
        unten = Math.min(unten, y);
      });
      y = unten - 2;
    }
  };
  abschnitt(p.fragen.titel);
  if (fragenAufSeite2) text(p.fragen.seite2, { groesse: 9.5 });
  else kontakte();
  if (p.fragen.leer) {
    text(p.fragen.leer, { groesse: 9.5 });
    for (let i = 0; i < 2; i++) { y -= 20; seite.drawLine({ start: { x: RAND, y }, end: { x: RAND + INNEN, y }, thickness: 0.5, color: LINIE, dashArray: [2, 2] }); }
  }

  // Etwas ist passiert? Links (https://, klickbar) und QR-Code zur Hilfeseite – nie zum Schlüssel.
  abschnitt(p.hilfe.titel);
  const MODUL = 3, QR = p.hilfe.qr.length * MODUL, RUHE = 4 * MODUL;
  const qrX = RAND + INNEN - QR - RUHE, qrOben = y - 4;
  p.hilfe.qr.forEach((zeile, zy) => {
    for (let zx = 0; zx < zeile.length; zx++) if (zeile[zx] === '1') seite.drawRectangle({ x: qrX + RUHE / 2 + zx * MODUL, y: qrOben - RUHE / 2 - (zy + 1) * MODUL, width: MODUL, height: MODUL, color: TINTE });
  });
  verlinke(doc, seite, p.hilfe.links[0].url, qrX, qrOben - QR - RUHE, QR + RUHE, QR + RUHE);
  let qy = qrOben - QR - RUHE;
  for (const z of umbrechen(p.hilfe.qrText, s.normal, 7.5, QR + RUHE)) { qy -= 9; seite.drawText(z, { x: qrX + (QR + RUHE - s.normal.widthOfTextAtSize(z, 7.5)) / 2, y: qy, size: 7.5, font: s.normal, color: LEISE }); }
  const textBreite = INNEN - QR - RUHE - 16;
  text(p.hilfe.text, { breite: textBreite, abstand: 2 });
  y -= 2;
  for (const l of p.hilfe.links) link(l.marke, l.url, RAND);
  text(p.hilfe.handbuch, { breite: textBreite, groesse: 8.5, farbe: LEISE, abstand: 6 });
  y = Math.min(y, qy);

  // Ausgesperrt? Der Notfallcode (#815) in einem schmalen Kasten: Titel und Adresse mit /notfall, ein Satz, darunter
  // der Code in Vierergruppen und daneben der Hinweis, dass er einmal gilt.
  if (p.notfall) {
    const n = p.notfall, x0 = RAND + 8;
    y -= 6;
    const oben = y;
    y -= 15;
    const tt = pdfText(n.titel, s.fett);
    seite.drawText(tt, { x: x0, y, size: 10.5, font: s.fett, color: BLAU });
    if (n.adresse) {
      const ax = x0 + s.fett.widthOfTextAtSize(tt, 10.5) + 8, at = pdfText(n.adresse.text, n.adresse.link ? s.normal : s.fett), ab = s.normal.widthOfTextAtSize(at, 10);
      seite.drawText(at, { x: ax, y, size: 10, font: n.adresse.link ? s.normal : s.fett, color: n.adresse.link ? BLAU : TINTE });
      if (n.adresse.link) {
        seite.drawLine({ start: { x: ax, y: y - 1.5 }, end: { x: ax + ab, y: y - 1.5 }, thickness: 0.6, color: BLAU });
        verlinke(doc, seite, n.adresse.link, ax, y - 3, ab, 13);
      }
    }
    y -= 3;
    text(n.text, { x: x0, breite: INNEN - 16, groesse: 8.5 });
    y -= 16;
    const code = pdfText(n.code, s.mono);
    seite.drawText(code, { x: x0, y, size: 14, font: s.mono, color: TINTE });
    const hx = x0 + s.mono.widthOfTextAtSize(code, 14) + 12;
    let hy = y + 6;
    for (const z of umbrechen(n.hinweis, s.normal, 7.5, RAND + INNEN - 8 - hx)) { seite.drawText(z, { x: hx, y: hy, size: 7.5, font: s.normal, color: LEISE }); hy -= 9; }
    y = Math.min(y, hy + 9) - 6;
    seite.drawRectangle({ x: RAND, y, width: INNEN, height: oben - y, borderColor: BERNSTEIN, borderWidth: 1.2, opacity: 0, borderOpacity: 1 });
  }

  // Fuß: Linie und eine Zeile.
  seite.drawLine({ start: { x: RAND, y: RAND - 6 }, end: { x: rechts, y: RAND - 6 }, thickness: 0.5, color: LINIE });
  seite.drawText(pdfText(p.fuss, s.normal), { x: RAND, y: RAND - 18, size: 7.5, font: s.normal, color: LEISE });
  /** Seite 2 (#812): Titel und Name der Ablage, „Wen fragen?“ mit allen Kontakten, derselbe Fuß. */
  const zweiteSeite = () => {
    seite = doc.addPage([BREITE, HOEHE]);
    y = HOEHE - RAND;
    seite.drawText(pdfText(p.kopf.titel, s.fett), { x: RAND, y: y - 14, size: 14, font: s.fett, color: TINTE });
    const nb = s.fett.widthOfTextAtSize(pdfText(p.kopf.name, s.fett), 10);
    seite.drawText(pdfText(p.kopf.name, s.fett), { x: rechts - Math.min(nb, 300), y: y - 14, size: 10, font: s.fett, color: BLAU });
    y -= 24;
    seite.drawLine({ start: { x: RAND, y }, end: { x: rechts, y }, thickness: 1.5, color: BLAU });
    abschnitt(p.fragen.titel);
    kontakte();
    seite.drawLine({ start: { x: RAND, y: RAND - 6 }, end: { x: rechts, y: RAND - 6 }, thickness: 0.5, color: LINIE });
    seite.drawText(pdfText(p.fuss, s.normal), { x: RAND, y: RAND - 18, size: 7.5, font: s.normal, color: LEISE });
  };
  if (y < RAND) throw new ZuLang(`Notfallblatt passt nicht auf eine Seite (${Math.round(RAND - y)} pt zu lang)`);
  if (fragenAufSeite2) zweiteSeite();
  return doc.save();
}
