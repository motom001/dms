/** Beispieltexte für die Schriften der eigenen PDFs (#826) – im Test und für die Messung (Größe, Zeit). */
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import type { Brief, Lauf } from '../../shared/src/textsatz';

/** Je Sprache eine Zeile; erfundene Namen und Pangramme, keine echten Personen. */
export const BEISPIELE = {
  deutsch: 'Grüße aus Dresden – „Straße“ € 12,50',
  tuerkisch: 'Şahin Özdemir, İstanbul, ılık, ağaç, Iğdır',
  polnisch: 'Łódź, Zażółć gęślą jaźń, Świętokrzyska',
  tschechisch: 'Příliš žluťoučký kůň úpěl ďábelské ódy',
  russisch: 'Съешь же ещё этих мягких французских булок',
  griechisch: 'Ξεσκεπάζω την ψυχοφθόρα βδελυγμία, Ωμέγα',
  // „Thị Liste office“: Mit ccmp setzte fontkit hier Zeichen zusammen, und Kopieren lieferte „Lịste“.
  vietnamesisch: 'Tiếng Việt: Nguyễn Thị Ngọc Ánh, Thị Liste office',
  ligaturen: 'office fifty flight ffl Waffel Auflage Schiff',
} as const;

/** Dieselben Wörter zerlegt (NFD): müssen im PDF genauso erscheinen wie zusammengesetzt. */
export const NFD = 'Nguyễn Şahin Příliš ещё'.normalize('NFD');

const t = (text: string, x: Partial<Lauf> = {}): Lauf[] => [{ text, ...x }];

/** Ein Brief mit allen Beispielen in allen Schnitten (normal, fett, kursiv, fett-kursiv, Code). */
export function beispielBrief(): Brief {
  const zeilen = Object.values(BEISPIELE);
  return {
    sprache: 'de-DE', titel: `Brief an ${BEISPIELE.tuerkisch.split(',')[0]}`, herkunft: 'Test #826',
    absender: ['Petra Nowak', 'Świętokrzyska 5', '00-001 Warszawa'], ruecksende: 'Petra Nowak · Świętokrzyska 5 · 00-001 Warszawa',
    anschrift: [t('Herr Şahin Özdemir'), t('İstiklal Caddesi 1'), t('34000 İstanbul')],
    datum: 'Dresden, 11.11.2026', betreff: t(`Betreff: ${BEISPIELE.tschechisch}`),
    bloecke: [
      ...zeilen.map((z) => ({ art: 'absatz' as const, laeufe: t(z) })),
      { art: 'absatz', laeufe: [...t(`${BEISPIELE.russisch} `, { fett: true }), ...t(BEISPIELE.griechisch, { kursiv: true })] },
      { art: 'absatz', laeufe: [...t(`${BEISPIELE.polnisch} `, { fett: true, kursiv: true }), ...t('Kód: ŁÓDŹ-ŞİĞ-ЖЁ', { mono: true })] },
      { art: 'absatz', laeufe: t(`NFD: ${NFD}`) },
    ],
    seitenText: 'Seite {seite} von {seiten}', seitenMax: 5,
  };
}

/**
 * Text im Inhaltsstrom einer Seite, ausgelesen über die ToUnicode-Tabelle der Schrift (eingebettete Schriften schreiben
 * Glyphen-Nummern, keine Buchstaben). Je gezeichneter Text eine Zeile; Schriften ohne Tabelle (Standardschriften) als
 * Latin-1. `roh`: der entpackte Strom selbst, `stroeme`: wie viele Inhaltsströme die Seite hat.
 */
export async function inhaltsstrom(pdf: Uint8Array, i = 0): Promise<{ roh: string; text: string; stroeme: number }> {
  const doc = await PDFDocument.load(pdf);
  const p = doc.getPage(i);
  const c = p.node.Contents();
  const eintrag = p.node.get(PDFName.of('Contents'));
  const refs = c instanceof PDFArray ? c.asArray() : eintrag ? [eintrag] : [];
  const roh = refs.map((r) => Buffer.from(decodePDFRawStream(doc.context.lookup(r) as PDFRawStream).decode()).toString('latin1')).join('\n');
  const tabellen = new Map<string, Map<string, string> | null>();
  const fonts = p.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
  for (const [name, ref] of fonts?.entries() ?? []) {
    const f = doc.context.lookup(ref, PDFDict);
    const tu = f.lookup(PDFName.of('ToUnicode'));
    if (!(tu instanceof PDFRawStream)) { tabellen.set(name.decodeText(), null); continue; }
    const cmap = Buffer.from(decodePDFRawStream(tu).decode()).toString('latin1');
    const t = new Map<string, string>();
    for (const block of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
      for (const [, code, uni] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) t.set(code.toUpperCase(), Buffer.from(uni, 'hex').swap16().toString('utf16le'));
    }
    tabellen.set(name.decodeText(), t);
  }
  const zeilen: string[] = [];
  let tabelle: Map<string, string> | null = null;
  for (const m of roh.matchAll(/\/([^\s/[\]()<>]+)\s+[-\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    if (m[1] !== undefined) { tabelle = tabellen.get(m[1]) ?? null; continue; }
    if (m[3] !== undefined) { zeilen.push(m[3].replace(/\\(.)/g, '$1')); continue; }
    const hex = m[2].replace(/\s/g, '').toUpperCase();
    if (!tabelle) { zeilen.push(Buffer.from(hex, 'hex').toString('latin1')); continue; }
    let z = '';
    for (let k = 0; k < hex.length; k += 4) z += tabelle.get(hex.slice(k, k + 4)) ?? '�';
    zeilen.push(z);
  }
  return { roh, text: zeilen.join('\n'), stroeme: refs.length };
}
