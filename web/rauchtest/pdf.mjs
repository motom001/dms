/**
 * Beispiel-PDFs mit Textebene für Rauchtests (#897, #1162, #1255) und die Oberflächen-Messung (#1276). Eigene Datei
 * ohne node:test und ohne Playwright, damit auch eigenständige Skripte sie laden können.
 */

/** Kleines, gültiges PDF mit einer Zeile Text (mehrere Zeilen mit \n getrennt). */
export function beispielPdf(zeile) {
  const inhalt = `BT /F1 18 Tf 60 760 Td ${zeile.split('\n').map((z) => `(${z}) Tj`).join(' 0 -28 Td ')} ET`;
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const pos = [];
  objekte.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** Mehrseitiges PDF (#1162): je Eintrag eine Seite mit einer Zeile Text – wie beispielPdf im Bildskript des Handbuchs. */
export function beispielPdfSeiten(zeilen) {
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${zeilen.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${zeilen.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  zeilen.forEach((z, i) => {
    // Mehrere Zeilen je Seite mit „\n“ (lange Post, #1255), kleiner gesetzt.
    const inhalt = z.includes('\n') ? `BT /F1 9 Tf 40 800 Td ${z.split('\n').map((y) => `(${y}) Tj`).join(' 0 -13 Td ')} ET` : `BT /F1 18 Tf 60 760 Td (${z}) Tj ET`;
    objekte.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objekte.push(`<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`);
  });
  let pdf = '%PDF-1.4\n';
  const pos = [];
  objekte.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
