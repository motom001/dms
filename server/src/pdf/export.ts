/**
 * PDF für mehrere Mappen (#152), gezeichnet in der PDF-Stelle (#541). Was auf den Seiten steht (Titel,
 * Felder ohne Passwörter, Übersicht), stellt `export.ts` zusammen; hier entstehen nur die Seiten: optional
 * eine Übersicht als Tabelle, je Mappe eine Seite mit Feldern und Liste der Dokumente, danach die PDFs
 * eingebunden und Bilder (JPEG, PNG) als eigene Seite.
 */
import { PDFDocument, rgb } from 'pdf-lib';
import { eigenerPuffer } from './puffer';
import { A4, neuesDokument, PdfSchreiber, RAND } from './schreiber';
import { groesseText } from './text';
import { pdfText } from './schrift';
import { ladePdf } from './laden';
import { t } from '../sprache';

export interface PdfMappenSeite {
  titel: string;
  /** Kleine Zeile unter dem Titel (Typ, angelegt, geändert). */
  zeile: string;
  /** Felder je Register: Name nur, wenn er als Zwischenüberschrift erscheinen soll. */
  register: Array<{ name: string | null; felder: Array<[string, string]> }>;
  /** Dokumente; `inhalt` nur bei PDFs und Bildern, null wenn er sich nicht lesen ließ. */
  dokumente: Array<{ name: string; groesse: number; mime: string; inhalt?: Uint8Array | null }>;
}

export interface MappenPdfDaten {
  titel: string;
  uebersicht: { zeile: string; kopf: string[]; zeilen: string[][] } | null;
  mappen: PdfMappenSeite[];
}

export async function mappenPdfZeichnen(daten: MappenPdfDaten): Promise<Buffer> {
  const { doc, f } = await neuesDokument(daten.titel);

  if (daten.uebersicht) {
    const u = daten.uebersicht;
    const s = new PdfSchreiber(doc, f, true);
    s.neueSeite();
    s.text(daten.titel, { groesse: 16, fett: true });
    s.text(u.zeile, { groesse: 9, farbe: 0.4, abstand: 2 });
    s.y -= 8;
    const nutzbar = s.breite - 2 * RAND;
    const w = nutzbar / u.kopf.length;
    const reihe = (werte: string[], fett: boolean) => {
      const z = werte.map((t) => s.zeilen(t, 8.5, w - 6, fett).slice(0, 4));
      const h = Math.max(...z.map((x) => x.length)) * 11 + 4;
      if (s.y - h < RAND) { s.neueSeite(); }
      z.forEach((zeilen, i) => zeilen.forEach((t, j) => s.seite.drawText(t, { x: RAND + i * w, y: s.y - 10 - j * 11, size: 8.5, font: fett ? f.fett : f.normal, color: rgb(0.1, 0.12, 0.16) })));
      s.y -= h;
      s.seite.drawLine({ start: { x: RAND, y: s.y + 1 }, end: { x: RAND + nutzbar, y: s.y + 1 }, thickness: 0.3, color: rgb(0.8, 0.82, 0.85) });
    };
    reihe(u.kopf, true);
    for (const z of u.zeilen) reihe(z, false);
  }

  for (const m of daten.mappen) {
    // Erst die Anhänge vorbereiten, damit die Seite der Mappe sagen kann, was eingebunden ist.
    const pdfs: PDFDocument[] = []; const bilder: Array<{ name: string; b: Uint8Array; png: boolean }> = [];
    const hinweis: string[] = [];
    for (const d of m.dokumente) {
      const istBild = d.mime === 'image/jpeg' || d.mime === 'image/png';
      if (d.mime !== 'application/pdf' && !istBild) { hinweis.push(t('meldungen.export.nicht-eingebunden')); continue; }
      if (!d.inhalt) { hinweis.push(t('meldungen.export.konnte-nicht-eingebunden-werden')); continue; }
      if (istBild) { bilder.push({ name: d.name, b: d.inhalt, png: d.mime === 'image/png' }); hinweis.push(t('meldungen.export.als-bild-eingebunden')); continue; }
      try { pdfs.push(await ladePdf(d.inhalt, { ignoreEncryption: true, updateMetadata: false })); hinweis.push('eingebunden'); } catch { hinweis.push(t('meldungen.export.konnte-nicht-eingebunden-werden')); }
    }
    const s = new PdfSchreiber(doc, f);
    s.neueSeite();
    s.text(m.titel, { groesse: 16, fett: true });
    s.text(m.zeile, { groesse: 8.5, farbe: 0.4, abstand: 2 });
    s.linie();
    for (const r of m.register) {
      if (r.name) s.text(r.name, { groesse: 11, fett: true, abstand: 6 });
      for (const [bezeichnung, wert] of r.felder) {
        const vor = s.y;
        s.text(bezeichnung, { groesse: 9, fett: true, breite: 150, abstand: 3 });
        const nach = s.y; s.y = vor;
        // Wert neben der Bezeichnung; ist er länger, rückt die nächste Zeile darunter.
        s.text(wert, { groesse: 9.5, x: RAND + 160, abstand: 3 });
        s.y = Math.min(s.y, nach);
      }
    }
    if (m.dokumente.length) {
      s.text('Dokumente', { groesse: 11, fett: true, abstand: 10 });
      m.dokumente.forEach((d, i) => s.text(`• ${d.name} (${groesseText(d.groesse)}) – ${hinweis[i]}`, { groesse: 9, abstand: 2 }));
    }
    for (const b of bilder) {
      try {
        const bild = b.png ? await doc.embedPng(eigenerPuffer(b.b)) : await doc.embedJpg(eigenerPuffer(b.b));
        const seite = doc.addPage([A4.b, A4.h]);
        const max = { b: A4.b - 2 * RAND, h: A4.h - 2 * RAND - 24 };
        const k = Math.min(1, max.b / bild.width, max.h / bild.height);
        seite.drawText([...pdfText(`${m.titel} – ${b.name}`, f.normal).replace(/\n/g, ' ')].slice(0, 120).join(''), { x: RAND, y: A4.h - RAND, size: 9, font: f.normal, color: rgb(0.4, 0.42, 0.46) });
        seite.drawImage(bild, { x: RAND, y: A4.h - RAND - 18 - bild.height * k, width: bild.width * k, height: bild.height * k });
      } catch { /* defektes Bild: genannt ist es schon */ }
    }
    for (const p of pdfs) {
      try {
        const seiten = await doc.copyPages(p, p.getPageIndices());
        for (const sp of seiten) doc.addPage(sp);
      } catch { /* z. B. verschlüsselt: genannt ist es schon */ }
    }
  }
  if (!doc.getPageCount()) doc.addPage([A4.b, A4.h]);
  return Buffer.from(await doc.save());
}
