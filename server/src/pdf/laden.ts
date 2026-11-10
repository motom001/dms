/**
 * PDF laden mit Grenze für gepackte Objektströme (#823).
 *
 * pdf-lib entpackt beim Laden alle Objekt- und Querverweis-Ströme (`/Type /ObjStm`, `/Type /XRef`) vollständig in den
 * Speicher. Ein präpariertes PDF von 2 MB kann so mehrere GB belegen – als `ArrayBuffer`, den die Speichergrenze der
 * Arbeiter (#542, `maxOldGenerationSizeMb`) nicht erfasst. Darum prüft Ablago diese Ströme vorher mit einer harten
 * Obergrenze (zlib `maxOutputLength`) und lehnt ab, was sie überschreitet oder ungewöhnlich verpackt ist.
 *
 * Inhalte und Bilder entpackt pdf-lib erst bei Bedarf; dort gelten die Grenzen der jeweiligen Vorgänge.
 */
import { inflateSync } from 'node:zlib';
import { PDFDocument, type LoadOptions } from 'pdf-lib';
import { Fachfehler } from '../fehler';
import { eigenerPuffer } from './puffer';
import { t } from '../sprache';
import { OBJEKTSTROEME_MAX, OBJEKTSTROM_MAX } from '../grenzen';

export { OBJEKTSTROM_MAX };
export { OBJEKTSTROEME_MAX };

const latin1 = new TextDecoder('latin1');
const STREAM = Buffer.from('stream');
const ENDSTREAM = Buffer.from('endstream');

/** Wörterbuch vor einem `stream`: Text ab dem letzten `obj` (höchstens 8 KB zurück). */
function woerterbuchVor(daten: Uint8Array, pos: number): string {
  const ab = Math.max(0, pos - 8192);
  const text = latin1.decode(daten.subarray(ab, pos));
  const i = text.lastIndexOf(' obj');
  return i >= 0 ? text.slice(i) : text;
}

/**
 * Prüft alle Objekt- und Querverweis-Ströme. Wirft Fachfehler 422, wenn einer entpackt zu groß ist, sich nicht
 * entpacken lässt oder mit anderen Filtern als FlateDecode gepackt ist.
 */
export function pruefeObjektstroeme(daten: Uint8Array): void {
  const buf = Buffer.from(daten.buffer, daten.byteOffset, daten.byteLength);
  let summe = 0;
  for (let pos = buf.indexOf(STREAM); pos >= 0; pos = buf.indexOf(STREAM, pos + STREAM.length)) {
    // „endstream“ enthält auch „stream“ – überspringen.
    if (pos >= 3 && buf.subarray(pos - 3, pos).toString('latin1') === 'end') continue;
    const dict = woerterbuchVor(daten, pos);
    const objektstrom = /\/ObjStm\b/.test(dict) || (/\/First\b/.test(dict) && /\/N\b/.test(dict));
    const querverweis = /\/XRef\b/.test(dict) || /\/W\s*\[/.test(dict);
    if (!objektstrom && !querverweis) continue;
    let start = pos + STREAM.length;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const ende = buf.indexOf(ENDSTREAM, start);
    if (ende < 0) continue; // pdf-lib scheitert selbst
    const filter = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(dict)?.[1]?.replace(/\s+/g, ' ').trim();
    if (!filter) { pruefeAngaben(dict, ende - start, objektstrom); summe += ende - start; continue; }
    if (filter !== '/FlateDecode' && filter !== '[/FlateDecode]' && filter !== '[ /FlateDecode ]') {
      throw new Fachfehler(422, t('meldungen.laden.das-pdf-ist-ungewoehnlich'));
    }
    let n: number;
    try {
      n = inflateSync(buf.subarray(start, ende), { maxOutputLength: OBJEKTSTROM_MAX, finishFlush: 2 /* Z_SYNC_FLUSH: Rest am Ende erlauben */ }).length;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) {
        throw new Fachfehler(422, t('meldungen.laden.das-pdf-entpackt-sich'));
      }
      // Kaputt gepackt: pdf-lib entscheidet selbst – unmögliche Angaben lehnen wir trotzdem ab.
      pruefeAngaben(dict, Infinity, objektstrom);
      continue;
    }
    pruefeAngaben(dict, n, objektstrom);
    summe += n;
    if (summe > OBJEKTSTROEME_MAX) throw new Fachfehler(422, t('meldungen.laden.das-pdf-entpackt-sich'));
  }
}

/** Höchstens so viele Einträge hat ein Objekt- oder Querverweis-Strom (auch wenn er sich nicht entpacken lässt). */
export const EINTRAEGE_MAX = 10_000_000;
const SPIEL = 1000;

/** Zahlen in einem Feld wie `/W [1 2 1]`; null ohne Feld. */
function feld(dict: string, name: string): number[] | null {
  const m = new RegExp(`/${name}\\s*\\[([^\\]]*)\\]`).exec(dict);
  return m ? m[1].trim().split(/\s+/).filter(Boolean).map(Number) : null;
}

/**
 * Angaben eines Objekt- oder Querverweis-Stroms gegen seine entpackte Länge prüfen (#823, gefunden mit den
 * Fuzz-Tests): Mit unmöglichen Breiten (`/W`), Bereichen (`/Index`, `/Size`) oder Anzahlen (`/N`) läuft pdf-lib beim
 * Laden Milliarden Schritte bzw. belegt den ganzen Speicher – ein PDF von 1 KB hielte einen Arbeiter bis zur
 * Zeitgrenze fest. Jeder Eintrag braucht Platz im Strom; deutlich mehr Einträge, als hineinpassen, lehnt Ablago ab.
 * Großzügig (`SPIEL`, doppelte Zahl), damit ungenaue, aber harmlose Erzeuger durchkommen – die Hänger brauchen Milliarden.
 */
function pruefeAngaben(dict: string, laenge: number, objektstrom: boolean) {
  const unstimmig = () => new Fachfehler(422, t('mappen.pdf.unstimmig'));
  if (objektstrom) {
    const n = Number(/\/N\s+(-?\d+)/.exec(dict)?.[1] ?? 0);
    const first = Number(/\/First\s+(-?\d+)/.exec(dict)?.[1] ?? 0);
    // Je Objekt mindestens „1 0 “ im Kopf.
    if (n < 0 || first < 0 || n > EINTRAEGE_MAX || first > laenge || n > laenge + SPIEL) throw unstimmig();
    return;
  }
  const w = feld(dict, 'W');
  if (!w || w.length !== 3 || w.some((x) => !Number.isInteger(x) || x < 0 || x > 8)) throw unstimmig();
  const breite = w[0] + w[1] + w[2];
  const index = feld(dict, 'Index');
  const size = Number(/\/Size\s+(-?\d+)/.exec(dict)?.[1] ?? 0);
  if (!Number.isInteger(size) || size < 0) throw unstimmig();
  let anzahl = size;
  if (index) {
    if (index.length % 2 || index.some((x) => !Number.isInteger(x) || x < 0)) throw unstimmig();
    anzahl = 0;
    for (let i = 1; i < index.length; i += 2) anzahl += index[i];
  }
  if (anzahl > EINTRAEGE_MAX || (breite === 0 ? anzahl > SPIEL : anzahl > (laenge / breite) * 2 + SPIEL)) throw unstimmig();
}

/** PDFDocument.load mit Prüfung der Objektströme und eigenem Puffer (#456). */
export async function ladePdf(daten: Uint8Array, optionen?: LoadOptions): Promise<PDFDocument> {
  pruefeObjektstroeme(daten);
  return PDFDocument.load(eigenerPuffer(daten), optionen);
}
