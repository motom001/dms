/**
 * ZIP lesen (gespeichert oder Deflate) mit Obergrenzen gegen ZIP-Bomben.
 */
import { inflateRawSync } from 'node:zlib';
import { CODE_MAX, PAKET_MAX, inMB } from '../../../../shared/src/pakete';
import { Fachfehler } from '../../fehler';
import { t } from '../../sprache';
import { crc32 } from '../../zip';
import { ARCHIV_MAX, ENTPACKT_MAX, MB } from '../../grenzen';

export { ARCHIV_MAX };

const DATEIEN_MAX = 500;

/** Obergrenzen beim Entpacken; budget wird über mehrere Archive geteilt (Sammeldatei, #461). */
export interface ZipGrenzen {
  dateien: number;
  entpackt: number;
  budget?: { rest: number };
}

export const PAKET_GRENZEN: ZipGrenzen = { dateien: DATEIEN_MAX, entpackt: ENTPACKT_MAX };

/** Einträge des Inhaltsverzeichnisses (Central Directory), ohne etwas zu entpacken. */
function zipEintraege(buf: Buffer, max: number) {
  const kaputt = () => new Fachfehler(422, t('meldungen.pakete.das-archiv-ist-kein'));
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      e = i;
      break;
    }
  if (e < 0) throw kaputt();
  const anzahl = buf.readUInt16LE(e + 10);
  if (anzahl > max) throw new Fachfehler(422, t('meldungen.pakete.das-archiv-enthaelt-mehr', { max }));
  let p = buf.readUInt32LE(e + 16);
  const liste: Array<{ name: string; flags: number; methode: number; crc: number; csize: number; usize: number; lokal: number }> = [];
  for (let n = 0; n < anzahl; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw kaputt();
    const nlen = buf.readUInt16LE(p + 28),
      elen = buf.readUInt16LE(p + 30),
      klen = buf.readUInt16LE(p + 32);
    liste.push({
      name: buf.toString('utf8', p + 46, p + 46 + nlen).replace(/\\/g, '/'),
      flags: buf.readUInt16LE(p + 8),
      methode: buf.readUInt16LE(p + 10),
      crc: buf.readUInt32LE(p + 16),
      csize: buf.readUInt32LE(p + 20),
      usize: buf.readUInt32LE(p + 24),
      lokal: buf.readUInt32LE(p + 42),
    });
    p += 46 + nlen + elen + klen;
  }
  return liste;
}

/** Dateinamen eines ZIP-Archivs, ohne zu entpacken (z. B. um eine Sammeldatei zu erkennen, #461). */
export const zipNamen = (buf: Buffer, max = DATEIEN_MAX): string[] => zipEintraege(buf, max).map((x) => x.name);

/** Dateien der Beispiel-Dokumente (#878), auch mit einem Ordner davor (selbst gepacktes ZIP, Paket erstellen). */
const BEISPIEL_PFAD = /^(?:[^/]+\/)?inhalt\/beispiele\//;

/** Liest ein ZIP-Archiv (gespeichert oder Deflate) mit Obergrenzen gegen ZIP-Bomben. */
export function liesZip(buf: Buffer, grenzen: ZipGrenzen = PAKET_GRENZEN): Map<string, Buffer> {
  const kaputt = () => new Fachfehler(422, t('meldungen.pakete.das-archiv-ist-kein'));
  const dateien = new Map<string, Buffer>();
  let gesamt = 0,
    code = 0,
    beispiele = 0;
  for (const { name, flags, methode, crc, csize, usize, lokal } of zipEintraege(buf, grenzen.dateien)) {
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Fachfehler(422, t('meldungen.pakete.verschluesselte-archive-gehen-nicht'));
    if (name.startsWith('/') || name.split('/').includes('..'))
      throw new Fachfehler(422, t('meldungen.pakete.ungueltiger-dateiname-im-archiv', { name }));
    if (dateien.has(name)) throw new Fachfehler(422, t('meldungen.pakete.die-datei-steht-zweimal', { name }));
    // Beispiel-Dokumente (#878) zählen zur Paketgrenze, nicht zur Grenze für die Inhalte (YAML, README).
    if (name.startsWith('code/')) code += usize;
    else if (BEISPIEL_PFAD.test(name)) beispiele += usize;
    else gesamt += usize;
    if (gesamt > grenzen.entpackt) throw new Fachfehler(422, t('meldungen.pakete.das-archiv-ist-entpackt'));
    if (beispiele > PAKET_MAX) throw new Fachfehler(422, t('meldungen.pakete.beispiel-dokumente-zu-gross', { max: inMB(PAKET_MAX) }));
    // Grobe Obergrenze gegen ZIP-Bomben; die genaue Meldung zu code/ kommt aus liesCode.
    if (code > 2 * CODE_MAX) throw new Fachfehler(422, t('meldungen.pakete.die-dateien-unter-code', { wert: CODE_MAX / MB }));
    if (grenzen.budget && (grenzen.budget.rest -= usize) < 0) throw new Fachfehler(422, t('meldungen.pakete.die-pakete-der-sammeldatei'));
    if (lokal + 30 > buf.length || buf.readUInt32LE(lokal) !== 0x04034b50) throw kaputt();
    const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
    const roh = buf.subarray(start, start + csize);
    let daten: Buffer;
    try {
      daten =
        methode === 0
          ? Buffer.from(roh)
          : methode === 8
            ? inflateRawSync(roh, { maxOutputLength: Math.max(1, usize) })
            : (() => {
                throw new Fachfehler(422, t('meldungen.pakete.kompression-wird-nicht-unterstuetzt', { methode }));
              })();
    } catch (x) {
      if (x instanceof Fachfehler) throw x;
      throw kaputt();
    }
    if (daten.length !== usize || (crc32(daten) ^ 0xffffffff) >>> 0 !== crc) throw kaputt();
    dateien.set(name, daten);
  }
  return dateien;
}
