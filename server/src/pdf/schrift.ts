/**
 * Schrift für Ablagos eigene PDFs (#826): Noto Sans (SIL Open Font License 1.1) als eingebettete Teilmenge – nur die
 * Zeichen, die im PDF vorkommen. So stehen Türkisch, Polnisch, Tschechisch, Vietnamesisch, Griechisch und Kyrillisch
 * richtig im PDF statt als „?“, und die Archivfassung (PDF/A) findet eingebettete Schriften mit ToUnicode.
 *
 * Bibliothek: pdf-lib 1.17.1 mit `@pdf-lib/fontkit` 1.1.1 (Entscheidung #823). Drei Vorkehrungen sind Pflicht:
 * 1. Die Schriftdateien sind **aufbereitet** (`server/werkzeuge/schriften/aufbereiten.py`: gekürzt, ohne Hinting,
 *    `glyf.padding = 4`). Mit den Originaldateien beschädigt fontkit 1.1.1 die Teilmenge (unsichtbare Zeichen).
 * 2. Einbetten mit `features: { ccmp: false }`: Sonst fasst fontkit Zeichen zusammen, und Kopieren oder Suchen
 *    liefert falschen Text (aus „Thị“ wird „Lịste“).
 * 3. Jeder Text vorher nach **NFC**: pdf-lib setzt kombinierende Zeichen ohne ihren Versatz; zusammengesetzte
 *    Buchstaben (ä statt a + ¨) sehen richtig aus.
 *
 * Zeichen, die die Schrift nicht hat (z. B. Arabisch, Chinesisch, Emoji), werden zum sichtbaren Ersatzzeichen „�“.
 * Welche das waren, sammelt diese Datei je Auftrag; der Arbeiter gibt sie mit dem Ergebnis zurück, und der Pool schreibt
 * einmal je Auftrag einen Hinweis ins Protokoll (`arbeit/`). Die PDF-Stelle selbst schreibt nichts ins Protokoll.
 *
 * Die Schriftdateien liest der Arbeiter einmal, fontkit wertet jede einmal aus; jedes PDF bettet danach nur seine
 * Teilmenge ein.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

export type Schnitt = 'normal' | 'fett' | 'kursiv' | 'fettKursiv' | 'mono';

const DATEIEN: Record<Schnitt, string> = {
  normal: 'NotoSans-Regular.ttf',
  fett: 'NotoSans-Bold.ttf',
  kursiv: 'NotoSans-Italic.ttf',
  fettKursiv: 'NotoSans-BoldItalic.ttf',
  mono: 'NotoSansMono-Regular.ttf',
};

/** Ersatz für Zeichen, die die Schrift nicht hat – sichtbar, nicht still „?“. */
export const ERSATZZEICHEN = '�';

/** Ordner mit den Schriften: `server/schriften/`, neben dem Quelltext (src/pdf/) bzw. neben server/dist. */
function schriftOrdner(): string {
  const hier = dirname(fileURLToPath(import.meta.url));
  const kandidaten = [join(hier, '..', '..', 'schriften'), join(hier, '..', 'schriften'), join(process.cwd(), 'schriften'), join(process.cwd(), 'server', 'schriften')];
  const ordner = kandidaten.find((k) => existsSync(join(k, DATEIEN.normal)));
  if (!ordner) throw new Error(`Schriften für PDFs fehlen (${DATEIEN.normal}, gesucht in ${kandidaten.join(', ')})`);
  return ordner;
}

let ordner: string | null = null;
const daten = new Map<Schnitt, Uint8Array>();
/** Bytes einer Schrift, je Arbeiter einmal gelesen. */
function schriftDaten(s: Schnitt): Uint8Array {
  let d = daten.get(s);
  if (!d) {
    ordner ??= schriftOrdner();
    const b = readFileSync(join(ordner, DATEIEN[s]));
    d = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    daten.set(s, d);
  }
  return d;
}

/** So viele gesetzte Texte merkt sich jede Schrift (Breite messen und Zeichnen setzen denselben Text oft mehrfach). */
const GESETZT_MAX = 4000;
type Gesetzt = { glyphs: unknown[] };
interface Glyphe { codePoints: number[] }
interface Fontkitschrift { layout: (text: string, features?: unknown) => Gesetzt; getGlyph: (id: number, zeichen?: number[]) => Glyphe | null }

/**
 * fontkit mit Gedächtnis: pdf-lib ruft `create` bei jedem Einbetten auf und wertet die ganze Datei neu aus. Für dieselben
 * Bytes gibt es hier dasselbe Objekt zurück (die Teilmenge bildet pdf-lib je Dokument neu, das Objekt der Schrift
 * ändert sich dabei nicht). Dazu merkt es sich gesetzte Texte: Das Setzen (`layout`, die Regeln der Schrift für
 * Ersetzungen) kostet die meiste Zeit, und pdf-lib setzt jeden Text beim Messen und beim Zeichnen neu.
 */
const ausgewertet = new WeakMap<Uint8Array, Fontkitschrift>();
const fontkitEinmal = {
  create(b: Uint8Array, name?: string) {
    if (name) return fontkit.create(b, name);
    let f = ausgewertet.get(b);
    if (!f) {
      f = fontkit.create(b) as unknown as Fontkitschrift;
      // fontkit merkt sich jede Glyphe mit den Zeichen, mit denen sie zuerst gebraucht wurde. Beim Speichern holt die
      // Teilmenge Bestandteile zusammengesetzter Glyphen (u in ü) ohne Zeichen – im nächsten PDF fehlte dem u dann die
      // Zuordnung zum Buchstaben (ToUnicode), Kopieren lieferte „�“. Darum die Zeichen nachtragen, sobald sie bekannt sind.
      const glyphe = f.getGlyph.bind(f);
      f.getGlyph = (id, zeichen = []) => {
        const g = glyphe(id, zeichen);
        if (g && zeichen.length && !g.codePoints.length) g.codePoints = zeichen;
        return g;
      };
      const setze = f.layout.bind(f);
      const gesetzt = new Map<string, Gesetzt>();
      f.layout = (text, features) => {
        let g = gesetzt.get(text);
        if (!g) {
          g = setze(text, features);
          if (gesetzt.size >= GESETZT_MAX) gesetzt.delete(gesetzt.keys().next().value!);
          gesetzt.set(text, g);
        }
        return g;
      };
      ausgewertet.set(b, f);
    }
    return f;
  },
} as unknown as Parameters<PDFDocument['registerFontkit']>[0];

/**
 * Merkmale beim Setzen: `ccmp` aus (Vorkehrung 2 oben). Die Merkmale für Abstände (Unterschneidung, Lage der Akzente)
 * wertet pdf-lib nicht aus – es zeichnet jedes Zeichen mit seiner Breite; aus spart darum nur Zeit.
 * Immer dieselben Merkmale: Der Speicher oben merkt sich Texte ohne sie.
 */
const MERKMALE = { ccmp: false, kern: false, mark: false, mkmk: false, dist: false };

/* ---------- Fehlende Zeichen je Auftrag ---------- */

const fehlend = new Set<string>();
/** Fehlende Zeichen seit dem letzten Aufruf (und wieder leeren) – der Arbeiter fragt nach jedem Auftrag. */
export function fehlendeZeichen(): string[] {
  const z = [...fehlend];
  fehlend.clear();
  return z;
}

/* ---------- Text ---------- */

const zeichensaetze = new WeakMap<PDFFont, Set<number>>();
const zeichensatz = (f: PDFFont) => {
  let z = zeichensaetze.get(f);
  if (!z) { z = new Set(f.getCharacterSet()); zeichensaetze.set(f, z); }
  return z;
};
/** Unsichtbare Zeichen ohne Glyphe (Variantenwähler, Steuerzeichen für die Schreibrichtung …) fallen weg. */
const UNSICHTBAR = /^\p{Default_Ignorable_Code_Point}$/u;

/**
 * Text für `font`: NFC, Tabulator als vier Leerzeichen, Zeilenumbruch bleibt, andere Steuerzeichen fallen weg;
 * Zeichen, die die Schrift nicht hat, werden zu „�“ (und für den Hinweis im Protokoll gemerkt). Geht auch für die
 * Standardschriften (Courier für Codes im Notfallblatt): Sie haben kein „�“, dort bleibt es beim „?“.
 */
export function pdfText(s: string, font: PDFFont): string {
  const z = zeichensatz(font);
  let r = '';
  for (const ch of s.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '    ')) {
    const c = ch.codePointAt(0)!;
    if (ch === '\n') r += ch;
    else if (c < 0x20 || (c >= 0x7f && c < 0xa0)) continue;
    else if (z.has(c)) r += ch;
    else if (UNSICHTBAR.test(ch)) continue;
    else { fehlend.add(ch); r += z.has(0xfffd) ? ERSATZZEICHEN : '?'; }
  }
  return r;
}

/** Für Angaben ohne Schrift (Titel, Betreff in den Eigenschaften des PDF): nur NFC und ohne Steuerzeichen. */
export const angabe = (s: string) => s.normalize('NFC').replace(/\p{Cc}/gu, ' ');

/* ---------- Einbetten ---------- */

/** Sechs Großbuchstaben aus den verwendeten Zeichen: das Kürzel der Teilmenge („ABCDEF+NotoSans-Regular“, PDF 9.6.4). */
function kuerzel(name: string, glyphen: Iterable<number>): string {
  const h = createHash('sha256').update(name).update([...glyphen].sort((a, b) => a - b).join(',')).digest();
  return Array.from(h.subarray(0, 6), (b) => String.fromCharCode(65 + (b % 26))).join('');
}

/** Interna von pdf-lib 1.17.1, die das Kürzel braucht (fest so in CustomFontSubsetEmbedder). */
interface Einbetter { fontName: string; customName?: string; glyphIdMap: Map<number, number>; embedIntoContext: (...a: unknown[]) => unknown }

/**
 * Bettet die Schnitte als Teilmenge in `doc` ein. Den Namen der Teilmenge bildet pdf-lib sonst als „NotoSans-Regular-1234“;
 * PDF/A-Prüfer erwarten das Kürzel aus sechs Großbuchstaben. Es entsteht erst beim Speichern aus den verwendeten Zeichen –
 * gleiche Zeichen, gleiches Kürzel (die Demo-Dokumente bleiben bei gleichem Startwert gleich).
 */
export async function schriften<S extends Schnitt>(doc: PDFDocument, schnitte: readonly S[]): Promise<Record<S, PDFFont>> {
  doc.registerFontkit(fontkitEinmal);
  const aus = {} as Record<S, PDFFont>;
  for (const s of schnitte) {
    const font = await doc.embedFont(schriftDaten(s), { subset: true, features: MERKMALE });
    const e = (font as unknown as { embedder: Einbetter }).embedder;
    const einbetten = e.embedIntoContext.bind(e);
    e.embedIntoContext = (...a: unknown[]) => { e.customName = `${kuerzel(e.fontName, e.glyphIdMap.keys())}+${e.fontName}`; return einbetten(...a); };
    aus[s] = font;
  }
  return aus;
}
