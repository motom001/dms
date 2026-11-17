/**
 * Notfallblatt als PDF (#814): eine Seite A4 in Ablago-Optik, gezeichnet in der PDF-Stelle (#541) im Arbeiter.
 * Die Texte kommen fertig aus `notfallblattPlan` (server/src/notfall/notfallblatt.ts); hier stehen nur Lage, Farben und Logo.
 *
 * Marke: Ablago-Blau #1F4E79, Bernstein #E8A33D, Tinte #141A22 (docs/marke/). Auch in Schwarzweiß lesbar: Text in
 * Tinte oder Blau auf Weiß, Bernstein nur als Zierde. Schrift: Noto Sans (Überschriften, Text; eingebettet als Teilmenge,
 * #826) und Courier fett für Schlüssel, Codes und Ablage-Id – die bestehen nur aus ASCII, dafür reicht die Standardschrift.
 */
import { PDFDocument, PDFName, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { angabe, pdfText, schriften } from './schrift';
import { gebietsschema } from '../../../shared/src/sprache';

const BLAU = rgb(0x1f / 255, 0x4e / 255, 0x79 / 255);
const BERNSTEIN = rgb(0xe8 / 255, 0xa3 / 255, 0x3d / 255);
const TINTE = rgb(0x14 / 255, 0x1a / 255, 0x22 / 255);
const LEISE = rgb(0.33, 0.37, 0.42);
const LINIE = rgb(0.8, 0.83, 0.87);
const WEISS = rgb(1, 1, 1);

const BREITE = 595.28,
  HOEHE = 841.89,
  RAND = 48;
const INNEN = BREITE - 2 * RAND;

interface Schriften {
  normal: PDFFont;
  fett: PDFFont;
  mono: PDFFont;
}

/** Zeilen umbrechen nach echter Breite. */
function umbrechen(text: string, font: PDFFont, groesse: number, breite: number): string[] {
  const zeilen: string[] = [];
  for (const absatz of pdfText(text, font).split('\n')) {
    let z = '';
    for (const wort of absatz.split(' ')) {
      const probe = z ? `${z} ${wort}` : wort;
      if (z && font.widthOfTextAtSize(probe, groesse) > breite) {
        zeilen.push(z);
        z = wort;
      } else z = probe;
    }
    zeilen.push(z);
  }
  return zeilen;
}

/** Klickbarer Link (URI) über einem Rechteck. */
function verlinke(doc: PDFDocument, seite: PDFPage, url: string, x: number, y: number, b: number, h: number) {
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x, y, x + b, y + h],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
  });
  seite.node.addAnnot(doc.context.register(annot));
}

/** Logo wie docs/marke/ablago-logo-mit-schriftzug.svg: Kachel, Ablage, Blatt – und der Schriftzug. */
function logo(seite: PDFPage, s: Schriften, x: number, oben: number, groesse: number) {
  const k = groesse / 96;
  seite.drawSvgPath('M21 0H75A21 21 0 0 1 96 21V75A21 21 0 0 1 75 96H21A21 21 0 0 1 0 75V21A21 21 0 0 1 21 0Z', {
    x,
    y: oben,
    scale: k,
    color: BLAU,
  });
  // Blatt: Rechteck 30 × 40 um (48, 32) um −12° gedreht.
  const w = (-12 * Math.PI) / 180;
  const ecke = (px: number, py: number) => {
    const dx = px - 48,
      dy = py - 32;
    return `${(48 + dx * Math.cos(w) - dy * Math.sin(w)).toFixed(2)} ${(32 + dx * Math.sin(w) + dy * Math.cos(w)).toFixed(2)}`;
  };
  seite.drawSvgPath(`M${ecke(33, 12)}L${ecke(63, 12)}L${ecke(63, 52)}L${ecke(33, 52)}Z`, { x, y: oben, scale: k, color: BERNSTEIN });
  seite.drawSvgPath('M12 60H28c4 8 11 12 20 12s16-4 20-12H84v16a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6Z', { x, y: oben, scale: k, color: WEISS });
  seite.drawText('Ablago', { x: x + groesse * 1.2, y: oben - groesse * 0.69, size: groesse * 0.58, font: s.fett, color: BLAU });
}

/**
 * Texte des Blatts, fertig aus `notfallblattPlan` (notfall/notfallblatt.ts; #1278, Schritt 5b: die Form hier, damit die
 * PDF-Stelle den Notfall-Ordner nicht einbindet).
 */
export interface NotfallblattPlan {
  dokumenttitel: string;
  kopf: { titel: string; name: string; unter: string };
  einleitung: string;
  schluessel: {
    titel: string;
    gruppen: Array<Array<{ zeichen: string; hilfe: string | null }>>;
    hinweis: string;
    fingerabdruckTitel: string;
    fingerabdruck: string;
    fingerabdruckHinweis: string;
  };
  /** `kurz` (#671): knappere Fassung der Zeile, wenn das Blatt sonst nicht auf eine Seite passt (Aufrufe und Ziele nur gezählt). */
  ablage: {
    titel: string;
    zeilen: Array<{ marke: string; text: string; link?: string; mono?: boolean; kurz?: string }>;
    warnung: string | null;
  };
  /** `seite2`: Verweis, wenn die Kontakte auf eine zweite Seite ausweichen (#812). */
  fragen: { titel: string; kontakte: Array<{ name: string; erreichbar: string; notiz?: string }>; leer: string | null; seite2: string };
  hilfe: {
    titel: string;
    text: string;
    links: Array<{ marke: string; url: string }>;
    qr: readonly string[];
    qrText: string;
    handbuch: string;
  };
  /** Ausgesperrt? Notfallcode und wo man ihn eingibt (#815); null ohne Code. */
  notfall: { titel: string; code: string; text: string; adresse: { text: string; link?: string } | null; hinweis: string } | null;
  fuss: string;
}

/**
 * Passen viele Notfallkontakte nicht mehr auf die Seite (#812), stehen sie auf einer zweiten Seite; auf der ersten
 * verweist „Wen fragen?“ dorthin. Alles andere bleibt auf der ersten Seite. Vorher (#671) werden Aufrufe von außen und
 * Ziele nach außen nur gezählt; passt es dann immer noch nicht, fehlt diese Zeile (die Werkbank zeigt sie).
 */
export async function notfallblattPdf(p: NotfallblattPlan): Promise<Uint8Array> {
  // #671: Zuerst die Zeilen „Aufrufe von außen“ / „Ziele nach außen“ knapp (nur gezählt), dann die Kontakte auf Seite 2.
  const kurz: NotfallblattPlan = {
    ...p,
    ablage: { ...p.ablage, zeilen: p.ablage.zeilen.map((z) => (z.kurz ? { ...z, text: z.kurz } : z)) },
  };
  const versuche: Array<[NotfallblattPlan, boolean]> = [
    [p, false],
    ...(kurz.ablage.zeilen.some((z, i) => z.text !== p.ablage.zeilen[i].text)
      ? ([[kurz, false]] as Array<[NotfallblattPlan, boolean]>)
      : []),
  ];
  if (p.fragen.kontakte.length) versuche.push([kurz, true]);
  // Zuletzt ohne diese Zeilen (sehr langer Name, viele Ziele der Sicherung …): Sie stehen ohnehin in der Werkbank.
  const ohne: NotfallblattPlan = { ...p, ablage: { ...p.ablage, zeilen: p.ablage.zeilen.filter((z) => !z.kurz) } };
  if (ohne.ablage.zeilen.length < p.ablage.zeilen.length) versuche.push([ohne, p.fragen.kontakte.length > 0]);
  let letzter: unknown;
  for (const [plan, seite2] of versuche) {
    try {
      return await zeichne(plan, seite2);
    } catch (e) {
      if (!(e instanceof ZuLang)) throw e;
      letzter = e;
    }
  }
  throw letzter;
}

class ZuLang extends Error {}

const RECHTS = BREITE - RAND;
/** Breite einer Spalte der Notfallkontakte (zwei nebeneinander). */
const SPALTE = (INNEN - 16) / 2;

/** Das Blatt beim Zeichnen: Dokument, Schriften, Plan, die aktuelle Seite und die Höhe `y`, ab der es weitergeht. */
class Blatt {
  seite: PDFPage;
  y = HOEHE - RAND;

  constructor(
    readonly doc: PDFDocument,
    readonly s: Schriften,
    readonly p: NotfallblattPlan,
  ) {
    this.seite = doc.addPage([BREITE, HOEHE]);
  }

  /** Text mit Umbruch ab der aktuellen Zeile; liefert die Höhe. */
  text(t: string, o: { x?: number; breite?: number; font?: PDFFont; groesse?: number; farbe?: RGB; abstand?: number } = {}) {
    const font = o.font ?? this.s.normal,
      g = o.groesse ?? 10,
      zh = g * 1.3,
      x = o.x ?? RAND; // 1,3 statt 1,35 (#826): Noto Sans ist breiter als Helvetica und bricht öfter um – so bleibt es bei einer Seite
    this.y -= o.abstand ?? 0;
    for (const z of umbrechen(t, font, g, o.breite ?? INNEN - (x - RAND))) {
      this.y -= zh;
      this.seite.drawText(z, { x, y: this.y + zh - g, size: g, font, color: o.farbe ?? TINTE });
    }
  }

  /** „Marke: Adresse“, die Adresse unterstrichen und klickbar. */
  link(marke: string, url: string, x: number, g = 10.5) {
    const s = this.s;
    this.y -= g * 1.5;
    const m = pdfText(`${marke}: `, s.fett);
    this.seite.drawText(m, { x, y: this.y, size: g, font: s.fett, color: TINTE });
    const u = pdfText(url, s.normal),
      lx = x + s.fett.widthOfTextAtSize(m, g),
      lb = s.normal.widthOfTextAtSize(u, g);
    this.seite.drawText(u, { x: lx, y: this.y, size: g, font: s.normal, color: BLAU });
    this.seite.drawLine({ start: { x: lx, y: this.y - 1.5 }, end: { x: lx + lb, y: this.y - 1.5 }, thickness: 0.6, color: BLAU });
    verlinke(this.doc, this.seite, url, lx, this.y - 3, lb, g + 3);
  }

  /** Überschrift eines Abschnitts mit Bernstein-Strich davor. */
  abschnitt(titel: string) {
    this.y -= 20;
    this.seite.drawRectangle({ x: RAND, y: this.y - 2, width: 3, height: 13, color: BERNSTEIN });
    this.seite.drawText(pdfText(titel, this.s.fett), { x: RAND + 9, y: this.y, size: 13, font: this.s.fett, color: BLAU });
    this.y -= 6;
  }

  /** Notfallkontakte (#812) in zwei Spalten: Name fett, darunter Telefon und E-Mail, dann die Notiz leise. */
  kontakte() {
    const kontakte = this.p.fragen.kontakte;
    for (let i = 0; i < kontakte.length; i += 2) {
      const oben = this.y;
      let unten = this.y;
      kontakte.slice(i, i + 2).forEach((k, sp) => {
        this.y = oben;
        const x = RAND + sp * (SPALTE + 16);
        this.text(k.name, { x, breite: SPALTE, font: this.s.fett, groesse: 9.5, abstand: 2 });
        if (k.erreichbar) this.text(k.erreichbar, { x, breite: SPALTE, groesse: 9 });
        if (k.notiz) this.text(k.notiz, { x, breite: SPALTE, groesse: 8, farbe: LEISE });
        unten = Math.min(unten, this.y);
      });
      this.y = unten - 2;
    }
  }
}

async function zeichne(p: NotfallblattPlan, fragenAufSeite2: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(angabe(p.dokumenttitel));
  doc.setProducer('Ablago');
  doc.setCreator('Ablago');
  doc.setLanguage(gebietsschema());
  const s: Schriften = { ...(await schriften(doc, ['normal', 'fett'])), mono: await doc.embedFont(StandardFonts.CourierBold) };
  const b = new Blatt(doc, s, p);
  zeichneKopf(b);
  zeichneSchluessel(b);
  zeichneAblage(b);
  zeichneFragen(b, fragenAufSeite2);
  zeichneHilfe(b);
  zeichneNotfall(b);
  zeichneFuss(b);
  if (b.y < RAND) throw new ZuLang(`Notfallblatt passt nicht auf eine Seite (${Math.round(RAND - b.y)} pt zu lang)`);
  if (fragenAufSeite2) zweiteSeite(b);
  return doc.save();
}

/** Kopf: Logo links, rechts Notfallblatt, Name der Ablage, Datum und Version; darunter eine Linie in Blau. */
function zeichneKopf(b: Blatt) {
  logo(b.seite, b.s, RAND, b.y, 40);
  const rechtsText = (t: string, font: PDFFont, g: number, farbe: RGB, hoehe: number) => {
    for (const z of umbrechen(t, font, g, 300)) {
      b.seite.drawText(z, { x: RECHTS - font.widthOfTextAtSize(z, g), y: hoehe, size: g, font, color: farbe });
      hoehe -= g * 1.3;
    }
    return hoehe;
  };
  let ky = rechtsText(b.p.kopf.titel, b.s.fett, 20, TINTE, b.y - 18);
  ky = rechtsText(b.p.kopf.name, b.s.fett, 11, BLAU, ky - 2);
  ky = rechtsText(b.p.kopf.unter, b.s.normal, 8.5, LEISE, ky);
  b.y = Math.min(b.y - 48, ky - 4);
  b.seite.drawLine({ start: { x: RAND, y: b.y }, end: { x: RECHTS, y: b.y }, thickness: 1.5, color: BLAU });
  b.text(b.p.einleitung, { groesse: 9.5, abstand: 6 });
}

/** Schlüssel: groß, in Gruppen, die Null durchgestrichen, Lesehilfe unter verwechselbaren Zeichen. */
function zeichneSchluessel(b: Blatt) {
  const { seite } = b;
  b.abschnitt(b.p.schluessel.titel);
  const ZG = 22,
    ZELLE = 20,
    LUECKE = 16,
    JE_ZEILE = 5,
    HILFE_G = 6.5;
  const kastenOben = b.y - 4;
  b.y -= 10;
  for (let r = 0; r * JE_ZEILE < b.p.schluessel.gruppen.length; r++) {
    b.y -= ZG;
    const grundlinie = b.y;
    let tiefer = 0;
    b.p.schluessel.gruppen.slice(r * JE_ZEILE, (r + 1) * JE_ZEILE).forEach((gruppe, gi) => {
      // Ebene der Lesehilfe: Folgen Hinweise aufeinander, stehen sie abwechselnd oben und eine Zeile tiefer.
      let ebene = -1;
      gruppe.forEach((z, zi) => {
        const zx = RAND + 12 + gi * (4 * ZELLE + LUECKE) + zi * ZELLE;
        const zeichen = pdfText(z.zeichen, b.s.mono),
          zb = b.s.mono.widthOfTextAtSize(zeichen, ZG);
        const x0 = zx + (ZELLE - zb) / 2;
        seite.drawText(zeichen, { x: x0, y: grundlinie, size: ZG, font: b.s.mono, color: TINTE });
        if (z.zeichen === '0')
          seite.drawLine({
            start: { x: x0 + zb * 0.2, y: grundlinie + 1 },
            end: { x: x0 + zb * 0.8, y: grundlinie + ZG * 0.6 },
            thickness: 1.6,
            color: TINTE,
          });
        if (z.hilfe) {
          ebene = ebene === 0 ? 1 : 0;
          const versatz = ebene * (HILFE_G + 1.5);
          const hilfe = pdfText(z.hilfe, b.s.normal),
            hb = b.s.normal.widthOfTextAtSize(hilfe, HILFE_G);
          seite.drawText(hilfe, { x: zx + (ZELLE - hb) / 2, y: grundlinie - 9 - versatz, size: HILFE_G, font: b.s.normal, color: LEISE });
          tiefer = Math.max(tiefer, versatz);
        } else ebene = -1;
      });
    });
    b.y -= 14 + tiefer;
  }
  seite.drawRectangle({
    x: RAND,
    y: b.y - 2,
    width: INNEN,
    height: kastenOben - b.y + 2,
    borderColor: BLAU,
    borderWidth: 1,
    opacity: 0,
    borderOpacity: 1,
  });
  b.y -= 4;
  b.text(b.p.schluessel.hinweis, { groesse: 8.5, farbe: LEISE, abstand: 4 });
  b.y -= 14;
  const fm = pdfText(`${b.p.schluessel.fingerabdruckTitel}: `, b.s.fett);
  seite.drawText(fm, { x: RAND, y: b.y, size: 10, font: b.s.fett, color: TINTE });
  seite.drawText(pdfText(b.p.schluessel.fingerabdruck, b.s.mono), {
    x: RAND + b.s.fett.widthOfTextAtSize(fm, 10),
    y: b.y,
    size: 10,
    font: b.s.mono,
    color: TINTE,
  });
  b.text(b.p.schluessel.fingerabdruckHinweis, { groesse: 8.5, farbe: LEISE, abstand: 3 });
}

/** Diese Ablage: Adresse, Ablage-Id, wo die Sicherungen liegen. */
function zeichneAblage(b: Blatt) {
  b.abschnitt(b.p.ablage.titel);
  const MARKE = 96;
  for (const z of b.p.ablage.zeilen) {
    const oben = b.y;
    b.seite.drawText(pdfText(z.marke, b.s.fett), { x: RAND, y: oben - 10, size: 10, font: b.s.fett, color: TINTE });
    if (z.link) {
      const lt = pdfText(z.text, b.s.normal),
        lb = b.s.normal.widthOfTextAtSize(lt, 10);
      b.seite.drawText(lt, { x: RAND + MARKE, y: oben - 10, size: 10, font: b.s.normal, color: BLAU });
      b.seite.drawLine({
        start: { x: RAND + MARKE, y: oben - 11.5 },
        end: { x: RAND + MARKE + lb, y: oben - 11.5 },
        thickness: 0.6,
        color: BLAU,
      });
      verlinke(b.doc, b.seite, z.link, RAND + MARKE, oben - 13, lb, 13);
      b.y = oben - 13.5;
    } else b.text(z.text, { x: RAND + MARKE, font: z.mono ? b.s.mono : b.s.normal });
    b.y -= 3;
  }
  if (b.p.ablage.warnung) b.text(b.p.ablage.warnung, { groesse: 8.5, farbe: LEISE });
}

/**
 * Wen fragen? Notfallkontakte (#812). Passen sie nicht mehr auf die Seite, stehen sie auf Seite 2 – hier dann nur der
 * Verweis – oder Zeilen zum Eintragen.
 */
function zeichneFragen(b: Blatt, fragenAufSeite2: boolean) {
  b.abschnitt(b.p.fragen.titel);
  if (fragenAufSeite2) b.text(b.p.fragen.seite2, { groesse: 9.5 });
  else b.kontakte();
  if (b.p.fragen.leer) {
    b.text(b.p.fragen.leer, { groesse: 9.5 });
    for (let i = 0; i < 2; i++) {
      b.y -= 20;
      b.seite.drawLine({ start: { x: RAND, y: b.y }, end: { x: RAND + INNEN, y: b.y }, thickness: 0.5, color: LINIE, dashArray: [2, 2] });
    }
  }
}

/** Etwas ist passiert? Links (https://, klickbar) und QR-Code zur Hilfeseite – nie zum Schlüssel. */
function zeichneHilfe(b: Blatt) {
  b.abschnitt(b.p.hilfe.titel);
  const MODUL = 3,
    QR = b.p.hilfe.qr.length * MODUL,
    RUHE = 4 * MODUL;
  const qrX = RAND + INNEN - QR - RUHE,
    qrOben = b.y - 4;
  b.p.hilfe.qr.forEach((zeile, zy) => {
    for (let zx = 0; zx < zeile.length; zx++)
      if (zeile[zx] === '1')
        b.seite.drawRectangle({
          x: qrX + RUHE / 2 + zx * MODUL,
          y: qrOben - RUHE / 2 - (zy + 1) * MODUL,
          width: MODUL,
          height: MODUL,
          color: TINTE,
        });
  });
  verlinke(b.doc, b.seite, b.p.hilfe.links[0].url, qrX, qrOben - QR - RUHE, QR + RUHE, QR + RUHE);
  let qy = qrOben - QR - RUHE;
  for (const z of umbrechen(b.p.hilfe.qrText, b.s.normal, 7.5, QR + RUHE)) {
    qy -= 9;
    b.seite.drawText(z, {
      x: qrX + (QR + RUHE - b.s.normal.widthOfTextAtSize(z, 7.5)) / 2,
      y: qy,
      size: 7.5,
      font: b.s.normal,
      color: LEISE,
    });
  }
  const textBreite = INNEN - QR - RUHE - 16;
  b.text(b.p.hilfe.text, { breite: textBreite, abstand: 2 });
  b.y -= 2;
  for (const l of b.p.hilfe.links) b.link(l.marke, l.url, RAND);
  b.text(b.p.hilfe.handbuch, { breite: textBreite, groesse: 8.5, farbe: LEISE, abstand: 6 });
  b.y = Math.min(b.y, qy);
}

/**
 * Ausgesperrt? Der Notfallcode (#815) in einem schmalen Kasten: Titel und Adresse mit /notfall, ein Satz, darunter
 * der Code in Vierergruppen und daneben der Hinweis, dass er einmal gilt.
 */
function zeichneNotfall(b: Blatt) {
  if (b.p.notfall) {
    const n = b.p.notfall,
      x0 = RAND + 8;
    b.y -= 6;
    const oben = b.y;
    b.y -= 15;
    const tt = pdfText(n.titel, b.s.fett);
    b.seite.drawText(tt, { x: x0, y: b.y, size: 10.5, font: b.s.fett, color: BLAU });
    if (n.adresse) {
      const ax = x0 + b.s.fett.widthOfTextAtSize(tt, 10.5) + 8,
        at = pdfText(n.adresse.text, n.adresse.link ? b.s.normal : b.s.fett),
        ab = b.s.normal.widthOfTextAtSize(at, 10);
      b.seite.drawText(at, { x: ax, y: b.y, size: 10, font: n.adresse.link ? b.s.normal : b.s.fett, color: n.adresse.link ? BLAU : TINTE });
      if (n.adresse.link) {
        b.seite.drawLine({ start: { x: ax, y: b.y - 1.5 }, end: { x: ax + ab, y: b.y - 1.5 }, thickness: 0.6, color: BLAU });
        verlinke(b.doc, b.seite, n.adresse.link, ax, b.y - 3, ab, 13);
      }
    }
    b.y -= 3;
    b.text(n.text, { x: x0, breite: INNEN - 16, groesse: 8.5 });
    b.y -= 16;
    const code = pdfText(n.code, b.s.mono);
    b.seite.drawText(code, { x: x0, y: b.y, size: 14, font: b.s.mono, color: TINTE });
    const hx = x0 + b.s.mono.widthOfTextAtSize(code, 14) + 12;
    let hy = b.y + 6;
    for (const z of umbrechen(n.hinweis, b.s.normal, 7.5, RAND + INNEN - 8 - hx)) {
      b.seite.drawText(z, { x: hx, y: hy, size: 7.5, font: b.s.normal, color: LEISE });
      hy -= 9;
    }
    b.y = Math.min(b.y, hy + 9) - 6;
    b.seite.drawRectangle({
      x: RAND,
      y: b.y,
      width: INNEN,
      height: oben - b.y,
      borderColor: BERNSTEIN,
      borderWidth: 1.2,
      opacity: 0,
      borderOpacity: 1,
    });
  }
}

/** Fuß: Linie und eine Zeile. */
function zeichneFuss(b: Blatt) {
  b.seite.drawLine({ start: { x: RAND, y: RAND - 6 }, end: { x: RECHTS, y: RAND - 6 }, thickness: 0.5, color: LINIE });
  b.seite.drawText(pdfText(b.p.fuss, b.s.normal), { x: RAND, y: RAND - 18, size: 7.5, font: b.s.normal, color: LEISE });
}

/** Seite 2 (#812): Titel und Name der Ablage, „Wen fragen?“ mit allen Kontakten, derselbe Fuß. */
function zweiteSeite(b: Blatt) {
  b.seite = b.doc.addPage([BREITE, HOEHE]);
  b.y = HOEHE - RAND;
  b.seite.drawText(pdfText(b.p.kopf.titel, b.s.fett), { x: RAND, y: b.y - 14, size: 14, font: b.s.fett, color: TINTE });
  const nb = b.s.fett.widthOfTextAtSize(pdfText(b.p.kopf.name, b.s.fett), 10);
  b.seite.drawText(pdfText(b.p.kopf.name, b.s.fett), { x: RECHTS - Math.min(nb, 300), y: b.y - 14, size: 10, font: b.s.fett, color: BLAU });
  b.y -= 24;
  b.seite.drawLine({ start: { x: RAND, y: b.y }, end: { x: RECHTS, y: b.y }, thickness: 1.5, color: BLAU });
  b.abschnitt(b.p.fragen.titel);
  b.kontakte();
  b.seite.drawLine({ start: { x: RAND, y: RAND - 6 }, end: { x: RECHTS, y: RAND - 6 }, thickness: 0.5, color: LINIE });
  b.seite.drawText(pdfText(b.p.fuss, b.s.normal), { x: RAND, y: RAND - 18, size: 7.5, font: b.s.normal, color: LEISE });
}
