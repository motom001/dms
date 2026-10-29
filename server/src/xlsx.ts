/**
 * Kleiner Excel-Schreiber (#153): eine Tabelle als .xlsx (Office Open XML) – ohne Bibliothek.
 * Datum und Beträge sind echte Werte (sortier- und rechenbar), Beträge mit ihrer Währung als Format.
 */
import { zipPuffer } from './zip';

/** Eine Zelle: Text, Zahl, Ja/Nein, Datum (JJJJ-MM-TT), Zeitpunkt (ISO) oder Betrag. */
export type Zelle =
  | string | number | boolean | null
  | { datum: string } | { zeitpunkt: string } | { betrag: number; waehrung: string };

const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  // In XML 1.0 verbotene Steuerzeichen entfernen.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');

/** Spaltenbuchstaben: 0 → A, 26 → AA. */
export function spalte(i: number): string {
  let s = ''; let n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Excel-Seriennummer: Tage seit 30.12.1899 (UTC, ohne Zeitzone). */
export function seriell(iso: string, mitZeit = false): number | null {
  const d = mitZeit ? new Date(iso) : new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Zeitpunkte in Berliner Zeit, wie in der Oberfläche.
  const lokal = mitZeit ? new Date(d.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T') + 'Z') : d;
  return (lokal.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
}

export function xlsxAus(blatt: string, kopf: string[], zeilen: Zelle[][]): Buffer {
  // Formate: 164 Datum, 165 Datum+Zeit, ab 166 je Währung.
  const waehrungen: string[] = [];
  for (const z of zeilen) for (const c of z) if (c && typeof c === 'object' && 'betrag' in c && !waehrungen.includes(c.waehrung)) waehrungen.push(c.waehrung);
  const symbol = (w: string) => ({ EUR: '€', USD: '$', GBP: '£', CHF: 'CHF' }[w] ?? w);
  const numFmts = [
    '<numFmt numFmtId="164" formatCode="DD.MM.YYYY"/>', '<numFmt numFmtId="165" formatCode="DD.MM.YYYY HH:MM"/>',
    ...waehrungen.map((w, i) => `<numFmt numFmtId="${166 + i}" formatCode="${xml(`#,##0.00 "${symbol(w)}";-#,##0.00 "${symbol(w)}"`)}"/>`),
  ];
  // Stile: 0 normal, 1 fett (Kopf), 2 Datum, 3 Datum+Zeit, 4+i Währung i.
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>', '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>',
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>', '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>',
    ...waehrungen.map((_, i) => `<xf numFmtId="${166 + i}" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>`)];
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${numFmts.length}">${numFmts.join('')}</numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs></styleSheet>`;

  const zelle = (c: Zelle, ref: string): string => {
    if (c === null || c === '') return '';
    if (typeof c === 'number') return Number.isFinite(c) ? `<c r="${ref}"><v>${c}</v></c>` : '';
    if (typeof c === 'boolean') return `<c r="${ref}" t="b"><v>${c ? 1 : 0}</v></c>`;
    if (typeof c === 'string') return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(c.slice(0, 32767))}</t></is></c>`;
    if ('datum' in c) { const n = seriell(c.datum); return n === null ? '' : `<c r="${ref}" s="2"><v>${n}</v></c>`; }
    if ('zeitpunkt' in c) { const n = seriell(c.zeitpunkt, true); return n === null ? '' : `<c r="${ref}" s="3"><v>${n}</v></c>`; }
    return `<c r="${ref}" s="${4 + waehrungen.indexOf(c.waehrung)}"><v>${c.betrag}</v></c>`;
  };
  const reihen = [
    `<row r="1">${kopf.map((k, i) => `<c r="${spalte(i)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${xml(k)}</t></is></c>`).join('')}</row>`,
    ...zeilen.map((z, r) => `<row r="${r + 2}">${z.map((c, i) => zelle(c, `${spalte(i)}${r + 2}`)).join('')}</row>`),
  ];
  // Spaltenbreiten grob nach Inhalt.
  const breite = kopf.map((k, i) => Math.min(60, Math.max(10, k.length + 2, ...zeilen.slice(0, 200).map((z) => {
    const c = z[i];
    return typeof c === 'string' ? Math.min(c.length, 60) + 2 : c && typeof c === 'object' ? 14 : 10;
  }))));
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${breite.map((b, i) => `<col min="${i + 1}" max="${i + 1}" width="${b}" customWidth="1"/>`).join('')}</cols>
<sheetData>${reihen.join('')}</sheetData>${kopf.length ? `<autoFilter ref="A1:${spalte(kopf.length - 1)}${zeilen.length + 1}"/>` : ''}</worksheet>`;
  const name = xml(blatt.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Export');
  return zipPuffer([
    { name: '[Content_Types].xml', daten: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: '_rels/.rels', daten: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', daten: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>${kopf.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!$A$1:$${spalte(kopf.length - 1)}$${zeilen.length + 1}</definedName></definedNames>` : ''}</workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', daten: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/worksheets/sheet1.xml', daten: Buffer.from(sheet) },
    { name: 'xl/styles.xml', daten: Buffer.from(styles) },
  ]);
}

/** CSV für Excel: Semikolon, UTF-8 mit BOM, Zeilenende CRLF. */
export function csvAus(kopf: string[], zeilen: string[][]): Buffer {
  // Formeln entschärfen (CSV-Injection), negative Zahlen aber lassen.
  const formel = (s: string) => /^[=+@\t\r]/.test(s) || /^-(?![\d.,])/.test(s);
  const feld = (s: string) => (formel(s) || /[";\r\n]/.test(s) ? `"${(formel(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s);
  return Buffer.from('﻿' + [kopf, ...zeilen].map((z) => z.map(feld).join(';')).join('\r\n') + '\r\n', 'utf8');
}
