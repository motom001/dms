/**
 * Brief als PDF (#1040, „Text setzen“): Briefkopf, Anschrift, Datum, Betreff und der Text einer Vorlage im Aufbau
 * ähnlich DIN 5008 (Form B), schlicht und barrierearm. Gezeichnet mit pdf-lib wie alle eigenen PDFs (keine zweite
 * Satz-Engine, kein Netz, keine Bilder, keine Links); läuft im Arbeiter (`arbeit/vorgaenge.ts`).
 *
 * Barrierearm heißt hier (Hinweise Qualität): ein **getaggtes PDF** – Strukturbaum (Document → P/H1–H3/L/LI/BlockQuote)
 * in der Lesereihenfolge Absender, Anschrift, Datum, Betreff, Text; jeder Text als markierter Inhalt mit MCID,
 * Linien und Seitenzahlen als Artefakt; Sprache (/Lang), Titel (im Fenstertitel), /MarkInfo und /Tabs /S.
 *
 * Schrift: die Standardschriften Helvetica und Courier (WinAnsi) wie bei allen eigenen PDFs; eine eingebettete Schrift
 * mit allen Zeichen (Noto Sans) kommt mit #826 für alle Erzeuger zugleich.
 */
import { PDFDocument, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, StandardFonts, rgb, type PDFFont, type PDFObject, type PDFPage } from 'pdf-lib';
import type { Brief, BriefBlock, Lauf } from '../../../shared/src/textsatz';
import { pdfSicher } from './text';

const MM = 72 / 25.4;
const A4 = { b: 595.28, h: 841.89 };
const LINKS = 25 * MM;
const RECHTS = 20 * MM;
const OBEN = 20 * MM;
const UNTEN = 25 * MM;
const BREITE = A4.b - LINKS - RECHTS;
const GROESSE = 11;
const ZEILE = 1.35;
const FARBE = rgb(0.1, 0.1, 0.12);
const LEISE = rgb(0.35, 0.36, 0.4);

interface Schriften { normal: PDFFont; fett: PDFFont; kursiv: PDFFont; fettKursiv: PDFFont; mono: PDFFont }
interface Stueck { text: string; font: PDFFont }
/** Ein Wort aus Stücken verschiedener Schrift („**fett**,“) – umbrochen wird nur zwischen Wörtern. */
interface Wort { stuecke: Stueck[]; breite: number; leerDavor: boolean }
type Zeile = Stueck[];

/** Ein Element im Strukturbaum: Art (P, H1 …), Eltern, Kinder (Elemente oder markierte Inhalte einer Seite). */
interface Element { s: string; eltern: number | null; kinder: Array<number | { seite: number; mcid: number }> }

/** Seiten, markierte Inhalte und Strukturbaum. */
class Satz {
  seiten: PDFPage[] = [];
  y = 0;
  private elemente: Element[] = [{ s: 'Document', eltern: null, kinder: [] }];
  /** Je Seite: MCID → Element. */
  private eltern: number[][] = [];
  private offen: { el: number; seite: number } | null = null;
  constructor(private doc: PDFDocument, readonly f: Schriften, private max: number) {}

  get seite() { return this.seiten[this.seiten.length - 1]; }
  neueSeite() {
    this.schliesse();
    if (this.seiten.length >= this.max) throw new BriefZuLang(this.max);
    this.seiten.push(this.doc.addPage([A4.b, A4.h]));
    this.eltern.push([]);
    this.y = A4.h - OBEN;
  }
  /** Platz für `h` – sonst neue Seite (ein offenes Element geht dort weiter). */
  platz(h: number) {
    if (this.y - h >= UNTEN) return;
    const el = this.offen?.el;
    this.neueSeite();
    if (el !== undefined) this.markiere(el);
  }

  element(s: string, eltern = 0): number {
    this.elemente.push({ s, eltern, kinder: [] });
    const id = this.elemente.length - 1;
    this.elemente[eltern].kinder.push(id);
    return id;
  }
  /** Inhalt für `el` auf der aktuellen Seite markieren (BDC mit MCID); ein anderes offenes wird geschlossen. */
  markiere(el: number) {
    const seite = this.seiten.length - 1;
    if (this.offen?.el === el && this.offen.seite === seite) return;
    this.schliesse();
    const mcid = this.eltern[seite].length;
    this.eltern[seite].push(el);
    this.elemente[el].kinder.push({ seite, mcid });
    this.seite.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of(this.elemente[el].s), this.doc.context.obj({ MCID: mcid }) as unknown as PDFName]));
    this.offen = { el, seite };
  }
  schliesse() {
    if (!this.offen) return;
    this.seiten[this.offen.seite].pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
    this.offen = null;
  }
  /** Linien, Seitenzahlen: Artefakt, kein Teil des Texts. */
  artefakt(seite: PDFPage, zeichne: () => void) {
    this.schliesse();
    seite.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContent, [PDFName.of('Artifact')]));
    zeichne();
    seite.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }

  /** Strukturbaum, Elternbaum und Katalog-Einträge schreiben. */
  struktur() {
    this.schliesse();
    const ctx = this.doc.context;
    const wurzel = ctx.nextRef();
    const refs = this.elemente.map(() => ctx.nextRef());
    const seitenRefs = this.seiten.map((s) => s.ref);
    this.elemente.forEach((e, i) => {
      const kinder = e.kinder.map((k) => (typeof k === 'number' ? refs[k] : ctx.obj({ Type: 'MCR', Pg: seitenRefs[k.seite], MCID: k.mcid })));
      ctx.assign(refs[i], ctx.obj({ Type: 'StructElem', S: e.s, P: e.eltern === null ? wurzel : refs[e.eltern], K: kinder }));
    });
    const nums: PDFObject[] = [];
    this.eltern.forEach((liste, i) => {
      nums.push(PDFNumber.of(i), ctx.obj(liste.map((el) => refs[el])));
      this.seiten[i].node.set(PDFName.of('StructParents'), PDFNumber.of(i));
      this.seiten[i].node.set(PDFName.of('Tabs'), PDFName.of('S'));
    });
    ctx.assign(wurzel, ctx.obj({ Type: 'StructTreeRoot', K: [refs[0]], ParentTree: ctx.obj({ Nums: nums }), ParentTreeNextKey: this.seiten.length }));
    this.doc.catalog.set(PDFName.of('StructTreeRoot'), wurzel);
    this.doc.catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }));
  }
}

/** Mehr Seiten als erlaubt (grenzen.ts). */
export class BriefZuLang extends Error {
  constructor(readonly seiten: number) { super(`Brief länger als ${seiten} Seiten`); }
}

const schrift = (f: Schriften, l: Pick<Lauf, 'fett' | 'kursiv' | 'mono'>) => (l.mono ? f.mono : l.fett && l.kursiv ? f.fettKursiv : l.fett ? f.fett : l.kursiv ? f.kursiv : f.normal);
const breiteVon = (s: Stueck[], g: number) => s.reduce((a, x) => a + x.font.widthOfTextAtSize(x.text, g), 0);

/** Läufe in Wörter; `null` steht für einen Zeilenumbruch. */
function woerter(laeufe: Lauf[], f: Schriften, g: number): Array<Wort | null> {
  const aus: Array<Wort | null> = [];
  let akt: Wort | null = null;
  let leer = false;
  const fertig = () => { if (akt) { akt.breite = breiteVon(akt.stuecke, g); aus.push(akt); akt = null; } };
  for (const l of laeufe) {
    const font = schrift(f, l);
    for (const teil of pdfSicher(l.text).split(/(\n| +)/)) {
      if (!teil) continue;
      if (teil === '\n') { fertig(); aus.push(null); leer = false; continue; }
      if (teil.startsWith(' ')) { fertig(); leer = true; continue; }
      if (!akt) { akt = { stuecke: [], breite: 0, leerDavor: leer }; leer = false; }
      (akt as Wort).stuecke.push({ text: teil, font });
    }
  }
  fertig();
  return aus;
}

/** Ein zu breites Wort hart trennen. */
function trenne(w: Wort, breite: number, g: number): Wort[] {
  const teile: Wort[] = [];
  let akt: Stueck[] = [];
  for (const s of w.stuecke) {
    for (const ch of s.text) {
      const probe = [...akt, { text: ch, font: s.font }];
      if (akt.length && breiteVon(probe, g) > breite) { teile.push({ stuecke: akt, breite: breiteVon(akt, g), leerDavor: false }); akt = []; }
      const letzt = akt[akt.length - 1];
      if (letzt && letzt.font === s.font) letzt.text += ch; else akt.push({ text: ch, font: s.font });
    }
  }
  if (akt.length) teile.push({ stuecke: akt, breite: breiteVon(akt, g), leerDavor: false });
  if (teile[0]) teile[0].leerDavor = w.leerDavor;
  return teile;
}

/** Zeilen mit Umbruch an Wortgrenzen; Zeilenumbrüche der Vorlage bleiben (Grußformel, Unterschrift). */
export function umbrechen(laeufe: Lauf[], f: Schriften, g: number, breite: number): Zeile[] {
  const zeilen: Zeile[] = [];
  let z: Zeile = [];
  let b = 0;
  const neu = () => { zeilen.push(z); z = []; b = 0; };
  for (const w0 of woerter(laeufe, f, g)) {
    if (w0 === null) { neu(); continue; }
    for (const w of w0.breite > breite ? trenne(w0, breite, g) : [w0]) {
      const leer = z.length && w.leerDavor ? w.stuecke[0].font.widthOfTextAtSize(' ', g) : 0;
      if (z.length && b + leer + w.breite > breite) neu();
      if (z.length && w.leerDavor) z.push({ text: ' ', font: w.stuecke[0].font });
      z.push(...w.stuecke);
      b = breiteVon(z, g);
    }
  }
  if (z.length || !zeilen.length) zeilen.push(z);
  return zeilen;
}

/** Zeilen eines Elements zeichnen (markiert), ab `x`; `rechtsbuendig`: an den rechten Rand. */
function zeichneZeilen(s: Satz, el: number, zeilen: Zeile[], o: { g: number; x?: number; breite?: number; rechtsbuendig?: boolean; farbe?: ReturnType<typeof rgb> }) {
  const x0 = o.x ?? LINKS;
  for (const z of zeilen) {
    s.platz(o.g * ZEILE);
    s.y -= o.g * ZEILE;
    if (!z.length) continue;
    s.markiere(el);
    let x = o.rechtsbuendig ? x0 + (o.breite ?? BREITE) - breiteVon(z, o.g) : x0;
    for (const st of z) {
      s.seite.drawText(st.text, { x, y: s.y + o.g * 0.25, size: o.g, font: st.font, color: o.farbe ?? FARBE });
      x += st.font.widthOfTextAtSize(st.text, o.g);
    }
  }
}

const UEBERSCHRIFT = { 1: 13, 2: 12, 3: 11 } as const;

/** Blöcke der Vorlage: Überschriften, Absätze, Listen, Zitate. */
function zeichneBloecke(s: Satz, bloecke: BriefBlock[], o: { eltern: number; x: number; breite: number }) {
  for (const b of bloecke) {
    switch (b.art) {
      case 'ueberschrift': {
        const g = UEBERSCHRIFT[b.stufe];
        s.y -= g * 0.6;
        s.platz(g * ZEILE * 2);
        zeichneZeilen(s, s.element(`H${b.stufe}`, o.eltern), umbrechen(b.laeufe.map((l) => ({ ...l, fett: true })), s.f, g, o.breite), { g, x: o.x });
        s.y -= g * 0.2;
        break;
      }
      case 'absatz':
        zeichneZeilen(s, s.element('P', o.eltern), umbrechen(b.laeufe, s.f, GROESSE, o.breite), { g: GROESSE, x: o.x });
        s.y -= GROESSE * 0.6;
        break;
      case 'liste': {
        const liste = s.element('L', o.eltern);
        const einzug = 6 * MM;
        b.punkte.forEach((p, i) => {
          const li = s.element('LI', liste);
          const zeichen = b.nummeriert ? `${i + 1}.` : '•';
          s.platz(GROESSE * ZEILE);
          const yVor = s.y;
          zeichneZeilen(s, s.element('Lbl', li), [[{ text: zeichen, font: s.f.normal }]], { g: GROESSE, x: o.x });
          s.y = yVor;
          zeichneZeilen(s, s.element('LBody', li), umbrechen(p, s.f, GROESSE, o.breite - einzug), { g: GROESSE, x: o.x + einzug });
        });
        s.y -= GROESSE * 0.6;
        break;
      }
      case 'abstand':
        s.y -= b.zeilen * GROESSE * ZEILE;
        break;
      case 'zitat':
        zeichneBloecke(s, b.bloecke.map((x) => kursiv(x)), { eltern: s.element('BlockQuote', o.eltern), x: o.x + 8 * MM, breite: o.breite - 8 * MM });
        break;
    }
  }
}

/** Zitate kursiv. */
function kursiv(b: BriefBlock): BriefBlock {
  const k = (l: Lauf[]) => l.map((x) => ({ ...x, kursiv: true }));
  switch (b.art) {
    case 'ueberschrift': case 'absatz': return { ...b, laeufe: k(b.laeufe) };
    case 'liste': return { ...b, punkte: b.punkte.map(k) };
    case 'zitat': return { ...b, bloecke: b.bloecke.map(kursiv) };
    case 'abstand': return b;
  }
}

const text = (s: string): Lauf[] => [{ text: s }];

/** Zeichnet den Brief; mehr Seiten als `b.seitenMax`: `{ zuLang }` (über die Grenze des Arbeiters hinweg ohne Fehlerklasse). */
export async function briefPdf(b: Brief): Promise<{ pdf: Uint8Array; seiten: number } | { zuLang: number }> {
  try { return await zeichneBrief(b); } catch (e) { if (e instanceof BriefZuLang) return { zuLang: e.seiten }; throw e; }
}

async function zeichneBrief(b: Brief): Promise<{ pdf: Uint8Array; seiten: number }> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const titel = pdfSicher(b.titel).slice(0, 300);
  doc.setTitle(titel, { showInWindowTitleBar: true });
  doc.setSubject(pdfSicher(b.herkunft).slice(0, 500));
  doc.setCreator('Ablago'); doc.setProducer('Ablago');
  doc.setLanguage(b.sprache);
  const jetzt = new Date();
  doc.setCreationDate(jetzt); doc.setModificationDate(jetzt);
  const f: Schriften = {
    normal: await doc.embedFont(StandardFonts.Helvetica), fett: await doc.embedFont(StandardFonts.HelveticaBold),
    kursiv: await doc.embedFont(StandardFonts.HelveticaOblique), fettKursiv: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const s = new Satz(doc, f, Math.max(1, b.seitenMax));
  s.neueSeite();

  // Briefkopf oben rechts (Absender): Name fett, darunter Anschrift und Kontakt.
  if (b.absender.length) {
    const x = LINKS + BREITE * 0.55;
    const br = BREITE * 0.45;
    s.y = A4.h - 15 * MM;
    const kopf = s.element('P');
    zeichneZeilen(s, kopf, umbrechen([{ text: b.absender[0], fett: true }], f, 10, br), { g: 10, x });
    zeichneZeilen(s, kopf, umbrechen(text(b.absender.slice(1).join('\n')), f, 9, br), { g: 9, x, farbe: LEISE });
  }
  // Anschriftfeld (DIN 5008 Form B: ab 45 mm von oben): Rücksendeangabe klein, dann die Anschrift.
  s.y = A4.h - 47 * MM;
  if (b.ruecksende) {
    const zeilen = umbrechen(text(b.ruecksende), f, 7, 85 * MM).slice(0, 1);
    zeichneZeilen(s, s.element('P'), zeilen, { g: 7, farbe: LEISE });
    const seite = s.seite; const y = s.y - 1.5;
    s.artefakt(seite, () => seite.drawLine({ start: { x: LINKS, y }, end: { x: LINKS + Math.min(85 * MM, breiteVon(zeilen[0] ?? [], 7)), y }, thickness: 0.3, color: LEISE }));
  }
  s.y = A4.h - 57 * MM;
  const anschrift = s.element('P');
  for (const z of b.anschrift) zeichneZeilen(s, anschrift, umbrechen(z, f, GROESSE, 85 * MM).slice(0, 2), { g: GROESSE });
  // Datum rechtsbündig (Höhe des Informationsblocks), dann der Betreff fett.
  s.y = A4.h - 98 * MM;
  if (b.datum) zeichneZeilen(s, s.element('P'), umbrechen(text(b.datum), f, GROESSE, BREITE), { g: GROESSE, rechtsbuendig: true });
  s.y = Math.min(s.y, A4.h - 103.4 * MM) - GROESSE;
  if (b.betreff?.length) {
    zeichneZeilen(s, s.element('H1'), umbrechen(b.betreff.map((l) => ({ ...l, fett: true })), f, GROESSE, BREITE), { g: GROESSE });
    s.y -= GROESSE * 1.5;
  }
  zeichneBloecke(s, b.bloecke, { eltern: 0, x: LINKS, breite: BREITE });

  // Seitenzahlen ab zwei Seiten (Artefakt).
  const n = s.seiten.length;
  if (n > 1) {
    s.seiten.forEach((seite, i) => {
      const t = pdfSicher(b.seitenText.replace('{seite}', String(i + 1)).replace('{seiten}', String(n)));
      const w = f.normal.widthOfTextAtSize(t, 8);
      s.artefakt(seite, () => seite.drawText(t, { x: LINKS + BREITE - w, y: 12 * MM, size: 8, font: f.normal, color: LEISE }));
    });
  }
  s.struktur();
  return { pdf: await doc.save({ useObjectStreams: false }), seiten: n };
}
