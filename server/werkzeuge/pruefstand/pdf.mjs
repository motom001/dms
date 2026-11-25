/**
 * Prüfstand (#1679): ein schlichtes PDF mit Textebene aus Zeilen – Helvetica, WinAnsi, A4, 60 Zeilen je Seite. Nur für
 * die aufgefüllten Dokumente des Szenarios „Ungleichgewicht“; ohne Abhängigkeiten.
 */

/** WinAnsi-Zeichen außerhalb von Latin-1 (Windows-1252). */
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };
const ERSATZ = { '\u2212': '-', '\u202f': ' ', '\u2009': ' ' };

/** Text als Bytes in WinAnsi, für eine PDF-Zeichenkette maskiert. */
export function winAnsi(text) {
  const bytes = [];
  for (const z0 of text) {
    const z = ERSATZ[z0] ?? z0;
    const c = z.codePointAt(0);
    const b = WIN[z] ?? (c < 256 && (c < 0x80 || c > 0x9f) ? c : 0x3f);
    if (b === 0x28 || b === 0x29 || b === 0x5c) bytes.push(0x5c);
    bytes.push(b);
  }
  return Buffer.from(bytes);
}

/** PDF aus Zeilen; `titel` kommt in die Metadaten. */
export function pdfAusZeilen(zeilen, { titel = '' } = {}) {
  const seiten = [];
  for (let i = 0; i < Math.max(zeilen.length, 1); i += 60) seiten.push(zeilen.slice(i, i + 60));
  const objekte = [];
  const n = seiten.length;
  // 1 Katalog, 2 Seitenbaum, 3 Schrift, 4 Info, danach je Seite: Seite und Inhalt.
  objekte.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));
  const kinder = seiten.map((_, i) => `${5 + 2 * i} 0 R`).join(' ');
  objekte.push(Buffer.from(`<< /Type /Pages /Kids [${kinder}] /Count ${n} >>`));
  objekte.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  objekte.push(Buffer.concat([Buffer.from('<< /Title ('), winAnsi(titel), Buffer.from(') /Producer (Ablago Pruefstand) >>')]));
  seiten.forEach((z, i) => {
    objekte.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`,
      ),
    );
    const teile = [Buffer.from('BT /F1 10 Tf 13 TL 56 790 Td\n')];
    for (const zeile of z) teile.push(Buffer.from('('), winAnsi(zeile), Buffer.from(") '\n"));
    teile.push(Buffer.from('ET'));
    const inhalt = Buffer.concat(teile);
    objekte.push(Buffer.concat([Buffer.from(`<< /Length ${inhalt.length} >>\nstream\n`), inhalt, Buffer.from('\nendstream')]));
  });
  const teile = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const lagen = [];
  let pos = teile[0].length;
  objekte.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    lagen.push(pos);
    pos += b.length;
    teile.push(b);
  });
  const xref = ['xref', `0 ${objekte.length + 1}`, '0000000000 65535 f ', ...lagen.map((l) => `${String(l).padStart(10, '0')} 00000 n `)];
  teile.push(
    Buffer.from(`${xref.join('\n')}\ntrailer\n<< /Size ${objekte.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${pos}\n%%EOF\n`),
  );
  return Buffer.concat(teile);
}
