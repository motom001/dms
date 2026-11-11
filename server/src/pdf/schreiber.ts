/**
 * Textdokumente als PDF (#541): ein kleiner Schreiber mit Umbruch an Wortgrenzen und neuen Seiten von
 * selbst, dazu ein „Plan“ aus einfachen Anweisungen (Text, Linie, Abstand, Tabelle). Wer ein Textdokument
 * braucht (Auskunft, Löschkonzept, Löschprotokoll), beschreibt es als Plan; gezeichnet wird nur hier.
 * Ein Plan besteht aus einfachen Daten und lässt sich darum auch an einen Arbeiter geben (#542).
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { angabe, pdfText, schriften } from './schrift';

export const A4 = { b: 595.28, h: 841.89 };
export const RAND = 50;

export interface Schriften { normal: PDFFont; fett: PDFFont }
export interface TextOptionen { groesse?: number; fett?: boolean; x?: number; breite?: number; farbe?: number; abstand?: number }

export class PdfSchreiber {
  seite!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private f: Schriften, private quer = false) {}
  get breite() { return this.quer ? A4.h : A4.b; }
  get hoehe() { return this.quer ? A4.b : A4.h; }
  neueSeite() { this.seite = this.doc.addPage(this.quer ? [A4.h, A4.b] : [A4.b, A4.h]); this.y = this.hoehe - RAND; }
  platz(h: number) { if (this.y - h < RAND) this.neueSeite(); }
  /** Text mit Umbruch an Wortgrenzen (sehr lange Wörter hart getrennt). */
  zeilen(text: string, groesse: number, breite: number, fett = false): string[] {
    const font = fett ? this.f.fett : this.f.normal;
    const erg: string[] = [];
    for (const absatz of pdfText(text, font).split('\n')) {
      let z = '';
      for (const wort of absatz.split(' ')) {
        const probe = z ? `${z} ${wort}` : wort;
        if (font.widthOfTextAtSize(probe, groesse) <= breite) { z = probe; continue; }
        if (z) erg.push(z);
        // Sehr lange Wörter hart trennen.
        let w = wort;
        while (font.widthOfTextAtSize(w, groesse) > breite && w.length > 1) {
          let n = w.length; while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), groesse) > breite) n--;
          erg.push(w.slice(0, n)); w = w.slice(n);
        }
        z = w;
      }
      erg.push(z);
    }
    return erg;
  }
  text(text: string, o: TextOptionen = {}) {
    const groesse = o.groesse ?? 10; const x = o.x ?? RAND; const breite = o.breite ?? this.breite - RAND - x;
    this.y -= o.abstand ?? 0;
    for (const z of this.zeilen(text, groesse, breite, o.fett)) {
      this.platz(groesse * 1.35);
      this.y -= groesse * 1.35;
      this.seite.drawText(z, { x, y: this.y + groesse * 0.3, size: groesse, font: o.fett ? this.f.fett : this.f.normal, color: rgb(o.farbe ?? 0.1, o.farbe ?? 0.12, o.farbe ?? 0.16) });
    }
  }
  linie() { this.platz(8); this.y -= 4; this.seite.drawLine({ start: { x: RAND, y: this.y }, end: { x: this.breite - RAND, y: this.y }, thickness: 0.5, color: rgb(0.75, 0.78, 0.82) }); this.y -= 4; }

  /**
   * Tabelle über die ganze Breite: Spalten nach Gewicht, Zeilen umbrochen, Kopf (hinterlegt) bei jedem
   * Seitenwechsel wiederholt. Ohne Kopf ist die erste Spalte fett.
   */
  tabelle(kopf: string[], zeilen: string[][], gewichte: number[]) {
    const groesse = kopf.length > 5 ? 7.5 : 8.5;
    const zh = groesse * 1.3;
    const nutzbar = this.breite - 2 * RAND;
    const summe = gewichte.reduce((x, y) => x + y, 0);
    const breiten = gewichte.map((x) => (x / summe) * nutzbar);
    const mitKopf = kopf.some((k) => k);
    const reihe = (werte: string[], fett: boolean) => {
      const z = werte.map((t, i) => this.zeilen(t, groesse, breiten[i] - 6, fett || (!mitKopf && i === 0)));
      const h = Math.max(1, ...z.map((x) => x.length)) * zh + 5;
      return { z, h };
    };
    const zeichne = (r: { z: string[][]; h: number }, fett: boolean) => {
      if (fett) this.seite.drawRectangle({ x: RAND, y: this.y - r.h, width: nutzbar, height: r.h, color: rgb(0.93, 0.94, 0.96) });
      let x = RAND;
      r.z.forEach((zeilen, i) => {
        zeilen.forEach((t, j) => this.seite.drawText(t, { x: x + 3, y: this.y - 3 - (j + 1) * zh + groesse * 0.3, size: groesse, font: fett || (!mitKopf && i === 0) ? this.f.fett : this.f.normal, color: rgb(0.1, 0.12, 0.16) }));
        x += breiten[i];
      });
      this.y -= r.h;
      this.seite.drawLine({ start: { x: RAND, y: this.y }, end: { x: RAND + nutzbar, y: this.y }, thickness: 0.4, color: rgb(0.78, 0.8, 0.84) });
    };
    this.y -= 6;
    const k = mitKopf ? reihe(kopf, true) : null;
    if (k) { this.platz(k.h + 3 * zh); zeichne(k, true); }
    for (const werte of zeilen) {
      const r = reihe(werte, false);
      if (this.y - r.h < RAND) { this.neueSeite(); if (k) zeichne(k, true); }
      zeichne(r, false);
    }
  }
}

/** Neues PDF mit Titel und Noto Sans normal und fett (#826). */
export async function neuesDokument(titel: string): Promise<{ doc: PDFDocument; f: Schriften }> {
  const doc = await PDFDocument.create();
  doc.setTitle(angabe(titel)); doc.setProducer('Ablago'); doc.setCreator('Ablago');
  return { doc, f: await schriften(doc, ['normal', 'fett']) };
}

/** Eine Anweisung eines Textdokuments. */
export type Anweisung =
  | { art: 'seite' }
  | ({ art: 'text'; text: string } & TextOptionen)
  | { art: 'linie' }
  /** Neue Seite, wenn weniger als `hoehe` Platz bleibt. */
  | { art: 'platz'; hoehe: number }
  /** Senkrechter Abstand nach unten. */
  | { art: 'abstand'; hoehe: number }
  | { art: 'tabelle'; kopf: string[]; zeilen: string[][]; gewichte: number[] };

export interface Textdokument { titel: string; quer?: boolean; anweisungen: Anweisung[] }

/** Hilfe zum Aufschreiben eines Plans mit denselben Namen wie beim Schreiber. */
export function planer() {
  const anweisungen: Anweisung[] = [];
  return {
    anweisungen,
    neueSeite: () => { anweisungen.push({ art: 'seite' }); },
    text: (text: string, o: TextOptionen = {}) => { anweisungen.push({ art: 'text', text, ...o }); },
    linie: () => { anweisungen.push({ art: 'linie' }); },
  };
}

/** Zeichnet ein Textdokument nach seinem Plan. */
export async function textdokumentPdf(d: Textdokument): Promise<Buffer> {
  const { doc, f } = await neuesDokument(d.titel);
  const s = new PdfSchreiber(doc, f, !!d.quer);
  for (const a of d.anweisungen) {
    switch (a.art) {
      case 'seite': s.neueSeite(); break;
      case 'text': { const { art: _a, text, ...o } = a; s.text(text, o); break; }
      case 'linie': s.linie(); break;
      case 'platz': s.platz(a.hoehe); break;
      case 'abstand': s.y -= a.hoehe; break;
      case 'tabelle': s.tabelle(a.kopf, a.zeilen, a.gewichte); break;
    }
  }
  if (!doc.getPageCount()) doc.addPage([A4.b, A4.h]);
  return Buffer.from(await doc.save());
}
