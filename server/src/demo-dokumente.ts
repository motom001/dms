import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { DOKUMENTARTEN, MAX_DUPLIKATE, MAX_JE_MAPPE, MISCHUNGEN, STUFEN, type DokumentOptionen, type Dokumentart, type Mischung, type Stufe } from '../../shared/src/demodaten';
import { absatz, anschrift, euro, person, position, satz, ueberschrift } from './demo-text';
import { Fachfehler } from './fehler';
import type { Zufall } from './zufall';

/**
 * Demo-Dokumente für Wachstumstests (#248). Fünf Arten, jede Datei einzigartig:
 *  - brief:      einseitiges PDF (Brief/Rechnung) mit den Werten der Mappe – die Volltextsuche findet es über sie,
 *  - mehrseitig: 2–50 Seiten (selten bis 300) mit Überschriften, Absätzen, Aufzählungen, Tabellen,
 *  - scan:       PDF ohne Textebene (Seiten nur als Bild), damit die Texterkennung arbeitet,
 *  - bild:       JPEG/PNG von etwa 100 KB bis 15 MB, als Beleg-Foto mit Text oder abstrakt,
 *  - gross:      PDF mit 20–100 MB für Hochladen, Vorschau, Export und Sicherung.
 * Ohne neue Bibliothek: pdf-lib (wie der Export) und pdftoppm (im Image für die Texterkennung).
 */

// Arten, Mischungen, Erwartungswerte und die Abschätzung liegen in shared (#365), damit die Oberfläche live rechnet.
export { DOKUMENTARTEN, ERWARTUNG, MAX_JE_MAPPE, MISCHUNGEN, STUFEN, schaetze, type Abschaetzung, type DokumentOptionen, type Dokumentart, type Mischung, type Stufe } from '../../shared/src/demodaten';
const MAX_GROSS = 95 * 1024 * 1024;

export function pruefeDokumentOptionen(x: unknown): DokumentOptionen | null {
  if (x == null || x === false) return null;
  const o = (typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const zahl = (v: unknown, std: number, min: number, max: number, name: string) => {
    const n = v === undefined || v === '' ? std : Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Fachfehler(422, `${name}: bitte eine Zahl von ${min} bis ${max}.`);
    return n;
  };
  const anteil = zahl(o.anteil, 30, 0, 100, 'Anteil der Mappen mit Dokumenten');
  const von = Math.round(zahl(o.von, 1, 1, MAX_JE_MAPPE, 'Dokumente je Mappe (von)'));
  const bis = Math.round(zahl(o.bis, 3, 1, MAX_JE_MAPPE, 'Dokumente je Mappe (bis)'));
  if (bis < von) throw new Fachfehler(422, 'Dokumente je Mappe: „bis“ darf nicht kleiner als „von“ sein.');
  const stufe = STUFEN.includes(o.stufe as Stufe) ? (o.stufe as Stufe) : 'realistisch';
  const m = (o.mischung && typeof o.mischung === 'object' ? o.mischung : MISCHUNGEN[stufe]) as Record<string, unknown>;
  const mischung = Object.fromEntries(DOKUMENTARTEN.map((a) => [a, zahl(m[a] ?? 0, 0, 0, 100, `Anteil ${a}`)])) as Mischung;
  if (!DOKUMENTARTEN.some((a) => mischung[a] > 0)) throw new Fachfehler(422, 'Bitte mindestens eine Art von Dokumenten wählen.');
  return { anteil, von, bis, mischung, duplikate: zahl(o.duplikate, 0, 0, MAX_DUPLIKATE, 'Anteil Duplikate') };
}

/** Was die Mappe zum Dokument beiträgt: Titel und ihre Werte als „Bezeichnung: Wert“. */
export interface MappenInhalt {
  titel: string;
  typ: string;
  angaben: Array<[string, string]>;
  /** Name des verknüpften Vertragspartners o. Ä. (Titel einer verwiesenen Mappe). */
  partner?: string;
  betrag?: number;
  datum?: string;
}

export interface ErzeugtesDokument { name: string; mime: string; inhalt: Buffer; art: Dokumentart; seiten: number }

/* ---------- PDF-Bausteine ---------- */

const A4: [number, number] = [595.28, 841.89];
const RAND = 56;

/** Zeichen, die die Standardschrift (WinAnsi) nicht kennt, ersetzen. */
const winAnsi = (s: string) => s.replace(/[  ]/g, ' ').replace(/[^\x20-\x7e¡-ÿ€„“”‚‘’–—…•]/g, '?');

class Blatt {
  seite!: PDFPage;
  y = 0;
  seiten = 0;
  /** Schmale Blätter (Kassenbon): kleinerer Rand und kleinere Schrift. */
  private rand: number;
  private skala: number;
  constructor(private doc: PDFDocument, private schrift: PDFFont, private fett: PDFFont, private groesse: [number, number] = A4) {
    this.skala = Math.min(1, groesse[0] / A4[0] * 1.6);
    this.rand = RAND * this.skala * 0.5 + (this.skala === 1 ? RAND / 2 : 0);
    this.neueSeite();
  }
  neueSeite() {
    this.seite = this.doc.addPage(this.groesse);
    this.y = this.groesse[1] - this.rand;
    this.seiten++;
    this.beiNeuerSeite?.(this.seite);
  }
  beiNeuerSeite?: (s: PDFPage) => void;
  private platz(h: number) { if (this.y - h < this.rand) this.neueSeite(); }
  text(t: string, o: { fett?: boolean; groesse?: number; einzug?: number; abstand?: number } = {}) {
    const f = o.fett ? this.fett : this.schrift;
    const g = (o.groesse ?? 10.5) * this.skala;
    const breite = this.groesse[0] - 2 * this.rand - (o.einzug ?? 0) * this.skala;
    this.y -= (o.abstand ?? 0) * this.skala;
    const zeilen: string[] = [];
    for (const absatz of t.split('\n')) {
      let zeile = '';
      for (const wort of winAnsi(absatz).split(' ')) {
        const probe = zeile ? `${zeile} ${wort}` : wort;
        if (zeile && f.widthOfTextAtSize(probe, g) > breite) { zeilen.push(zeile); zeile = wort; } else zeile = probe;
      }
      zeilen.push(zeile);
    }
    for (const z of zeilen) {
      this.platz(g * 1.4);
      this.y -= g * 1.4;
      this.seite.drawText(z, { x: this.rand + (o.einzug ?? 0) * this.skala, y: this.y, size: g, font: f });
    }
  }
  tabelle(kopf: string[], zeilen: string[][], spalten: number[]) {
    const g = 9.5 * this.skala, h = g * 1.6;
    const passend = Math.min(1, (this.groesse[0] - 2 * this.rand) / spalten.reduce((x, y) => x + y, 0));
    const zeichne = (z: string[], fett: boolean) => {
      this.platz(h);
      this.y -= h;
      let x = this.rand;
      z.forEach((c, i) => { this.seite.drawText(winAnsi(c).slice(0, 60), { x, y: this.y, size: g, font: fett ? this.fett : this.schrift }); x += spalten[i] * passend; });
    };
    zeichne(kopf, true);
    this.seite.drawLine({ start: { x: this.rand, y: this.y - 3 }, end: { x: this.groesse[0] - this.rand, y: this.y - 3 }, thickness: 0.5, color: rgb(0.4, 0.4, 0.4) });
    for (const z of zeilen) zeichne(z, false);
  }
}

async function neuesPdf(titel: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(titel));
  doc.setProducer('DMS Demo-Daten');
  // Feste Zeitstempel: gleicher Startwert ergibt gleiche Dateien.
  doc.setCreationDate(new Date(Date.UTC(2026, 0, 1)));
  doc.setModificationDate(new Date(Date.UTC(2026, 0, 1)));
  return { doc, schrift: await doc.embedFont(StandardFonts.Helvetica), fett: await doc.embedFont(StandardFonts.HelveticaBold) };
}

/** Kleines PNG ohne Bibliothek (RGB, Filter 0). */
export function png(breite: number, hoehe: number, rgbDaten: Buffer): Buffer {
  const chunk = (typ: string, daten: Buffer) => {
    const kopf = Buffer.alloc(8);
    kopf.writeUInt32BE(daten.length, 0);
    kopf.write(typ, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), daten])) >>> 0, 0);
    return Buffer.concat([kopf, daten, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0); ihdr.writeUInt32BE(hoehe, 4); ihdr[8] = 8; ihdr[9] = 2;
  const zeilen = Buffer.alloc((breite * 3 + 1) * hoehe);
  for (let y = 0; y < hoehe; y++) rgbDaten.copy(zeilen, y * (breite * 3 + 1) + 1, y * breite * 3, (y + 1) * breite * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(zeilen, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Rauschen wie bei einem Handyfoto: eine Rausch-Textur über die ganze Seite. Ohne sie wären
 * gerasterte Seiten auch in 12 MP nur wenige hundert KB groß; mit ihr erreichen Fotos die
 * Größen echter Handyfotos (mehrere MB).
 */
async function rausche(z: Zufall, doc: PDFDocument, s: PDFPage, [w, h]: [number, number], staerke: number, pixelBreite = 384) {
  // Etwa die Auflösung des Zielbilds (höchstens 3000 Pixel breit), damit das Rauschen fein bleibt.
  const bw = Math.max(64, Math.min(3000, Math.round(pixelBreite)));
  const bh = Math.max(64, Math.round(bw * h / w));
  const img = await doc.embedPng(png(bw, bh, z.bytes(bw * bh * 3)));
  s.drawImage(img, { x: 0, y: 0, width: w, height: h, opacity: staerke });
}

/** Brief oder Rechnung; die Werte der Mappe stehen im Text. */
async function brief(z: Zufall, m: MappenInhalt, kennung: string, blattGroesse: [number, number] = A4, rauschen = 0, pixelBreite?: number): Promise<{ inhalt: Buffer; seiten: number }> {
  const { doc, schrift, fett } = await neuesPdf(m.titel);
  const b = new Blatt(doc, schrift, fett, blattGroesse);
  if (rauschen) await rausche(z, doc, b.seite, blattGroesse, rauschen, pixelBreite);
  const absender = m.partner || `${person(z)} ${z.eins(['GmbH', 'Service', 'e. K.', ''])}`.trim();
  b.text(absender, { fett: true, groesse: 14 });
  b.text(anschrift(z), { groesse: 9 });
  b.text(`${person(z)}, ${anschrift(z)}`, { abstand: 24 });
  b.text(`${z.eins(['Dresden', 'Leipzig', 'Chemnitz'])}, ${m.datum ?? new Date(Date.UTC(2023 + z.int(4), z.int(12), 1 + z.int(28))).toLocaleDateString('de-DE')}`, { abstand: 12 });
  const rechnung = m.betrag != null || /rechnung|zahlung|beleg/i.test(m.typ);
  b.text(`${rechnung ? 'Rechnung' : 'Betreff'}: ${m.titel}`, { fett: true, groesse: 12, abstand: 18 });
  for (const [k, v] of m.angaben.slice(0, 12)) b.text(`${k}: ${v}`, { groesse: 9.5 });
  b.text(z.eins(['Sehr geehrte Damen und Herren,', `Guten Tag ${person(z)},`, 'Liebe Kundin, lieber Kunde,']), { abstand: 14 });
  b.text(absatz(z), { abstand: 6 });
  if (rechnung) {
    const n = z.von(1, 5);
    const ziel = m.betrag ?? z.zwischen(20, 900);
    const teile = Array.from({ length: n }, () => z.zwischen(0.2, 1));
    const s = teile.reduce((a, x) => a + x, 0);
    const betraege = teile.map((x) => Math.round((ziel * x / s) * 100) / 100);
    betraege[n - 1] = Math.round((ziel - betraege.slice(0, -1).reduce((a, x) => a + x, 0)) * 100) / 100;
    b.y -= 10;
    b.tabelle(['Pos.', 'Leistung', 'Menge', 'Betrag'], betraege.map((x, i) => [String(i + 1), position(z), String(z.von(1, 3)), euro(x)]), [40, 260, 60, 100]);
    b.text(`Summe: ${euro(ziel)}`, { fett: true, abstand: 8 });
  }
  b.text(absatz(z, z.von(1, 3)), { abstand: 10 });
  b.text(`Mit freundlichen Grüßen\n${absender}`, { abstand: 14 });
  b.text(`Dokument-Nr. ${kennung}`, { groesse: 7, abstand: 18 });
  return { inhalt: Buffer.from(await doc.save()), seiten: b.seiten };
}

/** Mehrseitiges Dokument mit Überschriften, Absätzen, Aufzählungen und Tabellen. */
async function mehrseitig(z: Zufall, m: MappenInhalt, kennung: string, seitenZiel: number): Promise<{ inhalt: Buffer; seiten: number }> {
  const { doc, schrift, fett } = await neuesPdf(m.titel);
  const b = new Blatt(doc, schrift, fett);
  b.text(m.titel, { fett: true, groesse: 16 });
  b.text(`${m.typ} · Dokument-Nr. ${kennung}`, { groesse: 8 });
  for (const [k, v] of m.angaben.slice(0, 8)) b.text(`${k}: ${v}`, { groesse: 9.5 });
  let abschnitt = 0;
  while (b.seiten < seitenZiel) {
    abschnitt++;
    b.text(`${abschnitt}. ${ueberschrift(z)}`, { fett: true, groesse: 12.5, abstand: 16 });
    for (let i = z.von(1, 3); i > 0; i--) b.text(absatz(z), { abstand: 6 });
    if (z.chance(0.5)) for (let i = z.von(2, 5); i > 0; i--) b.text(`•  ${satz(z)}`, { einzug: 12 });
    if (z.chance(0.35)) {
      b.y -= 8;
      b.tabelle(['Datum', 'Vorgang', 'Betrag'], Array.from({ length: z.von(3, 10) }, () => [
        new Date(Date.UTC(2023 + z.int(4), z.int(12), 1 + z.int(28))).toLocaleDateString('de-DE'), position(z), euro(z.zwischen(5, 2000)),
      ]), [90, 300, 100]);
    }
  }
  return { inhalt: Buffer.from(await doc.save()), seiten: b.seiten };
}

/* ---------- Rastern mit pdftoppm ---------- */

function starte(cmd: string, args: string[]): Promise<void> {
  return new Promise((ok, fehler) => execFile(cmd, args, { timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (e, _o, stderr) => (e ? fehler(new Error(`${cmd}: ${stderr || e.message}`)) : ok())));
}

let pdftoppmDa: Promise<boolean> | undefined;
/** Gibt es pdftoppm? (Im Image ja; in der Entwicklung vielleicht nicht.) */
export function kannRastern(): Promise<boolean> {
  pdftoppmDa ??= new Promise((ok) => execFile('pdftoppm', ['-v'], (e) => ok(!e || (e as NodeJS.ErrnoException).code !== 'ENOENT')));
  return pdftoppmDa;
}

/** Seiten eines PDFs als Bilder (JPEG oder PNG). */
async function rastere(pdf: Buffer, o: { format: 'jpeg' | 'png'; dpi?: number; breite?: number; grau?: boolean; qualitaet?: number }): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-demo-'));
  try {
    await writeFile(join(dir, 'q.pdf'), pdf);
    const args = [`-${o.format}`];
    if (o.grau) args.push('-gray');
    if (o.breite) args.push('-scale-to-x', String(o.breite), '-scale-to-y', '-1'); else args.push('-r', String(o.dpi ?? 150));
    if (o.format === 'jpeg') args.push('-jpegopt', `quality=${o.qualitaet ?? 85}`);
    await starte('pdftoppm', [...args, join(dir, 'q.pdf'), join(dir, 's')]);
    const dateien = (await readdir(dir)).filter((f) => f.startsWith('s')).sort();
    return Promise.all(dateien.map((f) => readFile(join(dir, f))));
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** „Gescanntes“ PDF: Seiten nur als Bild, leicht schief, ohne Textebene. */
async function scan(z: Zufall, m: MappenInhalt, kennung: string): Promise<{ inhalt: Buffer; seiten: number }> {
  const seiten = z.chance(0.6) ? 1 : z.von(2, 6);
  const vorlage = seiten === 1 ? await brief(z, m, kennung) : await mehrseitig(z, m, kennung, seiten);
  const bilder = await rastere(vorlage.inhalt, { format: 'jpeg', dpi: z.eins([150, 200, 200, 300]), grau: z.chance(0.7), qualitaet: z.von(60, 85) });
  const doc = await PDFDocument.create();
  doc.setProducer('DMS Demo-Daten (Scan)');
  doc.setCreationDate(new Date(Date.UTC(2026, 0, 1)));
  doc.setModificationDate(new Date(Date.UTC(2026, 0, 1)));
  for (const bild of bilder) {
    const img = await doc.embedJpg(bild);
    const seite = doc.addPage(A4);
    seite.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(0.97, 0.97, 0.95) });
    seite.drawImage(img, { x: z.zwischen(-4, 4), y: z.zwischen(-4, 4), width: A4[0], height: A4[1], rotate: degrees(z.zwischen(-0.8, 0.8)) });
  }
  return { inhalt: Buffer.from(await doc.save()), seiten: bilder.length };
}

/** Foto eines Belegs (Kassenbon mit Text) oder abstraktes Bild. */
async function bild(z: Zufall, m: MappenInhalt, kennung: string): Promise<{ inhalt: Buffer; mime: string; endung: string }> {
  // Ziel: Bildschirm (0,3 MP) bis Handyfoto (12 MP), logarithmisch verteilt.
  const mp = Math.exp(z.zwischen(Math.log(0.3), Math.log(12)));
  let pdf: Buffer;
  let format: 'jpeg' | 'png' = 'jpeg';
  const beleg = z.chance(0.6);
  const verhaeltnis = beleg ? 600 / 226 : 0.75;
  const breite = Math.round(Math.sqrt((mp * 1e6) / verhaeltnis));
  if (beleg) {
    pdf = (await brief(z, { ...m, angaben: m.angaben.slice(0, 6) }, kennung, [226, 600], z.chance(0.8) ? z.zwischen(0.08, 0.45) : 0, breite)).inhalt;
  } else {
    const { doc } = await neuesPdf(m.titel);
    const s = doc.addPage([400, 300]);
    s.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(z.zahl(), z.zahl(), z.zahl()) });
    for (let i = z.von(20, 200); i > 0; i--) {
      const farbe = rgb(z.zahl(), z.zahl(), z.zahl());
      if (z.chance(0.5)) s.drawCircle({ x: z.zwischen(0, 400), y: z.zwischen(0, 300), size: z.zwischen(2, 80), color: farbe, opacity: z.zwischen(0.2, 1) });
      else s.drawRectangle({ x: z.zwischen(-50, 400), y: z.zwischen(-50, 300), width: z.zwischen(2, 150), height: z.zwischen(2, 150), color: farbe, opacity: z.zwischen(0.2, 1), rotate: degrees(z.zwischen(0, 90)) });
    }
    if (z.chance(0.6)) await rausche(z, doc, s, [400, 300], z.zwischen(0.08, 0.45), breite);
    pdf = Buffer.from(await doc.save());
    if (z.chance(0.4)) format = 'png';
  }
  const [b] = await rastere(pdf, { format, breite, qualitaet: z.von(80, 95) });
  return { inhalt: b, mime: format === 'png' ? 'image/png' : 'image/jpeg', endung: format === 'png' ? 'png' : 'jpg' };
}

/** Großes PDF: eine Textseite und ein großer, nicht komprimierbarer Anhang (Messdaten). */
async function gross(z: Zufall, m: MappenInhalt, kennung: string): Promise<{ inhalt: Buffer; seiten: number }> {
  const groesse = Math.min(MAX_GROSS, Math.round(z.zwischen(20, 95) * 1024 * 1024));
  const { doc, schrift, fett } = await neuesPdf(m.titel);
  const b = new Blatt(doc, schrift, fett);
  b.text(`Große Datei: ${m.titel}`, { fett: true, groesse: 14 });
  b.text(`Dokument-Nr. ${kennung} · Anhang mit ${(groesse / 1024 / 1024).toFixed(0)} MB Messdaten zum Testen von Hochladen, Vorschau, Export und Sicherung.`);
  b.text(absatz(z), { abstand: 8 });
  await doc.attach(z.bytes(groesse), 'messdaten.bin', { mimeType: 'application/octet-stream', description: 'Demo-Messdaten', creationDate: new Date(Date.UTC(2026, 0, 1)), modificationDate: new Date(Date.UTC(2026, 0, 1)) });
  return { inhalt: Buffer.from(await doc.save({ useObjectStreams: false })), seiten: 1 };
}

const NAMEN: Record<Dokumentart, string[]> = {
  brief: ['Rechnung', 'Schreiben', 'Bestätigung', 'Mitteilung', 'Abrechnung'],
  mehrseitig: ['Vertragsbedingungen', 'Bedienungsanleitung', 'Jahresübersicht', 'Versicherungsbedingungen', 'Protokoll'],
  scan: ['Scan', 'Eingescannt', 'Brief eingescannt', 'Beleg Scan'],
  bild: ['Foto', 'Beleg', 'Kassenbon', 'Bild'],
  gross: ['Messdaten', 'Archiv', 'Große Datei'],
};

/** Ein Dokument der gewünschten Art. Ohne pdftoppm werden Scans und Bilder zu Briefen. */
export async function erzeugeDokument(z: Zufall, art: Dokumentart, m: MappenInhalt, kennung: string, rastern: boolean): Promise<ErzeugtesDokument> {
  const name = (endung: string) => `${z.eins(NAMEN[art])} ${m.titel}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80).trim() + ` ${kennung.slice(0, 8)}.${endung}`;
  if ((art === 'scan' || art === 'bild') && !rastern) art = 'brief';
  switch (art) {
    case 'brief': { const r = await brief(z, m, kennung); return { name: name('pdf'), mime: 'application/pdf', inhalt: r.inhalt, art, seiten: r.seiten }; }
    case 'mehrseitig': {
      const seiten = z.chance(0.03) ? z.von(51, 300) : z.von(2, 50);
      const r = await mehrseitig(z, m, kennung, seiten);
      return { name: name('pdf'), mime: 'application/pdf', inhalt: r.inhalt, art, seiten: r.seiten };
    }
    case 'scan': { const r = await scan(z, m, kennung); return { name: name('pdf'), mime: 'application/pdf', inhalt: r.inhalt, art, seiten: r.seiten }; }
    case 'bild': { const r = await bild(z, m, kennung); return { name: name(r.endung), mime: r.mime, inhalt: r.inhalt, art, seiten: 1 }; }
    case 'gross': { const r = await gross(z, m, kennung); return { name: name('pdf'), mime: 'application/pdf', inhalt: r.inhalt, art, seiten: r.seiten }; }
  }
}
