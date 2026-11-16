import type { Abschnitt, Block } from '../../../shared/src/loeschkonzept';
import { textdokumentPdf, type Anweisung, type Textdokument } from '../pdf';
import { zipPuffer } from './zip';

/**
 * Schriftstück aus Abschnitten (Absatz, Punkte, Tabelle, Hinweis) als PDF und als Word-Datei (.docx) –
 * ohne Bibliothek für Word: ein kleines WordprocessingML, das Word, LibreOffice und Pages öffnen.
 * Für das Löschkonzept (#469) und das Löschprotokoll (#470).
 */
export interface Schriftstueck {
  titel: string;
  untertitel?: string;
  stand?: string;
  vorbemerkung?: string;
  abschnitte: Abschnitt[];
  /** Querformat (breite Tabellen). */
  quer?: boolean;
}

/* ---------- PDF ---------- */

const RAND = 50;
/** Pfeile kennt WinAnsi nicht. */
const p = (t: string) => t.replace(/→/g, '›');

/** Der Plan des PDFs (#541): gezeichnet wird in der PDF-Stelle. */
export function schriftstueckPlan(s: Schriftstueck): Textdokument {
  const a: Anweisung[] = [{ art: 'seite' }];
  if (s.untertitel) a.push({ art: 'text', text: p(s.untertitel), groesse: 9, farbe: 0.35 });
  a.push({ art: 'text', text: p(s.titel), groesse: 16, fett: true, abstand: 6 });
  if (s.stand) a.push({ art: 'text', text: p(s.stand), groesse: 9, farbe: 0.4, abstand: 2 });
  if (s.vorbemerkung) a.push({ art: 'abstand', hoehe: 6 }, { art: 'text', text: p(s.vorbemerkung), groesse: 9, farbe: 0.25 });
  a.push({ art: 'linie' });
  for (const ab of s.abschnitte) {
    a.push({ art: 'platz', hoehe: 60 }, { art: 'text', text: p(ab.titel), groesse: 12, fett: true, abstand: 10 });
    for (const b of ab.bloecke) a.push(...pdfBlock(b));
  }
  return { titel: s.titel, quer: !!s.quer, anweisungen: a };
}

export async function schriftstueckPdf(s: Schriftstueck): Promise<Buffer> {
  return textdokumentPdf(schriftstueckPlan(s));
}

function pdfBlock(b: Block): Anweisung[] {
  if (b.art === 'absatz') return [{ art: 'text', text: p(b.text), groesse: 9.5, abstand: 4 }];
  if (b.art === 'punkte') return b.punkte.map((x) => ({ art: 'text', text: p(`• ${x}`), groesse: 9.5, abstand: 3, x: RAND + 8 }));
  if (b.art === 'hinweis') {
    return [
      { art: 'text', text: p(b.titel), groesse: 9.5, fett: true, abstand: 8, farbe: 0.45 },
      ...b.punkte.map((x): Anweisung => ({ art: 'text', text: p(`– ${x}`), groesse: 9, abstand: 2, x: RAND + 8, farbe: 0.3 })),
    ];
  }
  // Tabelle: Spalten nach Gewicht, Zeilen umbrochen, Kopf bei jedem Seitenwechsel wiederholt.
  return [{ art: 'tabelle', kopf: b.kopf.map(p), zeilen: b.zeilen.map((z) => z.map(p)), gewichte: b.breiten }];
}

/* ---------- Word (.docx) ---------- */

const xml = (s: string) =>
  s
    .replace(/[^\x09\x0a\x0d\x20-퟿-�\u{10000}-\u{10ffff}]/gu, '')
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Text als Läufe; [eckige Klammern] gelb markiert (zum Ergänzen). */
function laeufe(text: string, o: { fett?: boolean; groesse?: number; farbe?: string } = {}): string {
  const teile = text.split(/(\[[^\]]*\])/);
  return teile
    .filter((t) => t)
    .map((t) => {
      const rpr = [
        o.fett ? '<w:b/>' : '',
        o.farbe ? `<w:color w:val="${o.farbe}"/>` : '',
        o.groesse ? `<w:sz w:val="${o.groesse * 2}"/><w:szCs w:val="${o.groesse * 2}"/>` : '',
        /^\[.*\]$/.test(t) ? '<w:highlight w:val="yellow"/>' : '',
      ].join('');
      return t
        .split('\n')
        .map((z, i) => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(z)}</w:t></w:r>`)
        .join('');
    })
    .join('');
}
const absatz = (
  text: string,
  o: { stil?: string; fett?: boolean; groesse?: number; farbe?: string; einzug?: number; nach?: number } = {},
) =>
  `<w:p><w:pPr>${o.stil ? `<w:pStyle w:val="${o.stil}"/>` : ''}${o.nach !== undefined ? `<w:spacing w:after="${o.nach}"/>` : ''}${o.einzug ? `<w:ind w:left="${o.einzug}" w:hanging="200"/>` : ''}</w:pPr>${laeufe(text, o)}</w:p>`;

function docxBlock(b: Block, breiteTwips: number): string {
  if (b.art === 'absatz') return absatz(b.text);
  if (b.art === 'punkte') return b.punkte.map((p) => absatz(`• ${p}`, { einzug: 360, nach: 60 })).join('');
  if (b.art === 'hinweis')
    return (
      absatz(b.titel, { fett: true, farbe: '8A5300' }) +
      b.punkte.map((p) => absatz(`– ${p}`, { einzug: 360, nach: 40, farbe: '5A3A00' })).join('')
    );
  const summe = b.breiten.reduce((x, y) => x + y, 0);
  const spalten = b.breiten.map((x) => Math.round((x / summe) * breiteTwips));
  const mitKopf = b.kopf.some((k) => k);
  const klein = b.kopf.length > 5 ? 8 : 9;
  const zelle = (t: string, i: number, kopf: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${spalten[i]}" w:type="dxa"/>${kopf ? '<w:shd w:val="clear" w:color="auto" w:fill="E9ECF1"/>' : ''}</w:tcPr>${absatz(t, { fett: kopf || (!mitKopf && i === 0), groesse: klein, nach: 0 })}</w:tc>`;
  const zeile = (werte: string[], kopf: boolean) =>
    `<w:tr>${kopf ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${werte.map((t, i) => zelle(t, i, kopf)).join('')}</w:tr>`;
  const rand = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((r) => `<w:${r} w:val="single" w:sz="4" w:space="0" w:color="C8CDD5"/>`)
    .join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${breiteTwips}" w:type="dxa"/><w:tblBorders>${rand}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${spalten.map((x) => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${mitKopf ? zeile(b.kopf, true) : ''}${b.zeilen.map((z) => zeile(z, false)).join('')}</w:tbl>${absatz('', { nach: 0 })}`
  );
}

const STILE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Titel"><w:name w:val="Title"/><w:basedOn w:val="Standard"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/><w:basedOn w:val="Standard"/><w:next w:val="Standard"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>`;

export function schriftstueckDocx(s: Schriftstueck): Buffer {
  // A4 (Twips), Ränder 1,8 cm.
  const [b, h] = s.quer ? [16838, 11906] : [11906, 16838];
  const rand = 1020;
  const breite = b - 2 * rand;
  const koerper = [
    s.untertitel ? absatz(s.untertitel, { farbe: '5A6270', groesse: 9 }) : '',
    absatz(s.titel, { stil: 'Titel' }),
    s.stand ? absatz(s.stand, { farbe: '5A6270', groesse: 9 }) : '',
    s.vorbemerkung ? absatz(s.vorbemerkung, { farbe: '3A404A', groesse: 9 }) : '',
    ...s.abschnitte.map((a) => absatz(a.titel, { stil: 'berschrift1' }) + a.bloecke.map((x) => docxBlock(x, breite)).join('')),
  ].join('');
  const dokument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${koerper}<w:sectPr><w:pgSz w:w="${b}" w:h="${h}"${s.quer ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${rand}" w:right="${rand}" w:bottom="${rand}" w:left="${rand}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const typen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(s.titel)}</dc:title><dc:creator>Ablago</dc:creator><dc:language>de-DE</dc:language></cp:coreProperties>`;
  return zipPuffer([
    { name: '[Content_Types].xml', daten: Buffer.from(typen) },
    { name: '_rels/.rels', daten: Buffer.from(rels) },
    { name: 'docProps/core.xml', daten: Buffer.from(core) },
    { name: 'word/_rels/document.xml.rels', daten: Buffer.from(docRels) },
    { name: 'word/styles.xml', daten: Buffer.from(STILE) },
    { name: 'word/document.xml', daten: Buffer.from(dokument) },
  ]);
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
