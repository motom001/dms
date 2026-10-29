/**
 * Sehr kleiner PDF-Schreiber für Textseiten (Notfallblatt, #106) – ohne Bibliothek.
 * Standardschriften Helvetica und Courier mit WinAnsi-Kodierung (deutsche Umlaute, €, „“, –).
 * Zeilen werden nach geschätzter Breite umbrochen; neue Seiten entstehen von selbst.
 */

export type Schrift = 'normal' | 'fett' | 'mono';
export interface Absatz { text: string; schrift?: Schrift; groesse?: number; /** Abstand davor in pt. */ abstand?: number; einzug?: number }

const SCHRIFTEN: Record<Schrift, { name: string; breite: number }> = {
  normal: { name: 'Helvetica', breite: 0.52 },
  fett: { name: 'Helvetica-Bold', breite: 0.56 },
  mono: { name: 'Courier-Bold', breite: 0.6 },
};
const NR: Record<Schrift, string> = { normal: 'F1', fett: 'F2', mono: 'F3' };
const BREITE = 595; const HOEHE = 842; const RAND = 56;

/** Zeichen außerhalb von Latin-1, die WinAnsi trotzdem kennt. */
const WIN_ANSI: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

/** Text als PDF-String (in Klammern), WinAnsi-kodiert. */
function pdfText(s: string): Buffer {
  const bytes: number[] = [0x28];
  for (const ch of s) {
    let c = WIN_ANSI[ch] ?? ch.codePointAt(0)!;
    if (c > 0xff || (c >= 0x80 && c < 0xa0 && !Object.values(WIN_ANSI).includes(c))) c = 0x3f; // ?
    if (c === 0x28 || c === 0x29 || c === 0x5c) bytes.push(0x5c);
    bytes.push(c);
  }
  bytes.push(0x29);
  return Buffer.from(bytes);
}

function umbrechen(text: string, maxZeichen: number): string[] {
  const zeilen: string[] = [];
  for (const absatz of text.split('\n')) {
    let z = '';
    for (const wort of absatz.split(' ')) {
      if (z && (z + ' ' + wort).length > maxZeichen) { zeilen.push(z); z = wort; } else z = z ? `${z} ${wort}` : wort;
    }
    zeilen.push(z);
  }
  return zeilen;
}

export function pdfAus(absaetze: Absatz[], titel = 'Dokument'): Buffer {
  const seiten: Buffer[][] = [[]];
  let y = HOEHE - RAND;
  for (const a of absaetze) {
    const schrift = a.schrift ?? 'normal';
    const groesse = a.groesse ?? 10.5;
    const zeilenhoehe = groesse * 1.35;
    const einzug = a.einzug ?? 0;
    const max = Math.floor((BREITE - 2 * RAND - einzug) / (groesse * SCHRIFTEN[schrift].breite));
    y -= a.abstand ?? 0;
    for (const z of umbrechen(a.text, max)) {
      if (y - zeilenhoehe < RAND) { seiten.push([]); y = HOEHE - RAND; }
      y -= zeilenhoehe;
      seiten.at(-1)!.push(Buffer.concat([Buffer.from(`BT /${NR[schrift]} ${groesse} Tf ${RAND + einzug} ${y.toFixed(1)} Td `, 'latin1'), pdfText(z), Buffer.from(' Tj ET\n', 'latin1')]));
    }
  }

  const objekte: Buffer[] = [];
  const neu = (inhalt: Buffer | string) => { objekte.push(Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt, 'latin1')); return objekte.length; };
  const katalog = neu(''); const seitenObj = neu('');
  const fonts = (Object.keys(SCHRIFTEN) as Schrift[]).map((s) => neu(`<< /Type /Font /Subtype /Type1 /BaseFont /${SCHRIFTEN[s].name} /Encoding /WinAnsiEncoding >>`));
  const ressourcen = `<< /Font << ${(Object.keys(SCHRIFTEN) as Schrift[]).map((s, i) => `/${NR[s]} ${fonts[i]} 0 R`).join(' ')} >> >>`;
  const kinder: number[] = [];
  for (const inhalt of seiten) {
    const strom = Buffer.concat(inhalt);
    const s = neu(Buffer.concat([Buffer.from(`<< /Length ${strom.length} >>\nstream\n`, 'latin1'), strom, Buffer.from('endstream', 'latin1')]));
    kinder.push(neu(`<< /Type /Page /Parent ${seitenObj} 0 R /MediaBox [0 0 ${BREITE} ${HOEHE}] /Contents ${s} 0 R /Resources ${ressourcen} >>`));
  }
  objekte[katalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${seitenObj} 0 R >>`, 'latin1');
  objekte[seitenObj - 1] = Buffer.from(`<< /Type /Pages /Kids [${kinder.map((k) => `${k} 0 R`).join(' ')}] /Count ${kinder.length} >>`, 'latin1');
  const info = neu(Buffer.concat([Buffer.from('<< /Title ', 'latin1'), pdfText(titel), Buffer.from(' /Producer (DMS) >>', 'latin1')]));

  const teile: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let pos = teile[0].length;
  const versatz: number[] = [];
  objekte.forEach((o, i) => {
    versatz.push(pos);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')]);
    teile.push(b); pos += b.length;
  });
  const xref = pos;
  teile.push(Buffer.from(`xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${versatz.map((v) => `${String(v).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objekte.length + 1} /Root ${katalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(teile);
}
