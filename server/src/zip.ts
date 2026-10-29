/**
 * Kleiner ZIP-Schreiber (#153) – ohne Bibliothek.
 * - zipPuffer: kleine Dateien im Arbeitsspeicher, komprimiert (für .xlsx).
 * - zipStrom: große Dateien als Strom, unkomprimiert (Dokumente sind meist schon komprimiert),
 *   mit vorab bekannter Gesamtgröße. Kein ZIP64: höchstens 4 GiB.
 */
import { Readable } from 'node:stream';
import { deflateRawSync } from 'node:zlib';

const TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b: Buffer, start = 0xffffffff): number {
  let c = start;
  for (let i = 0; i < b.length; i++) c = TABELLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}
const crcEnde = (c: number) => (c ^ 0xffffffff) >>> 0;

/** DOS-Zeit und -Datum (lokal). */
function dosZeit(d: Date): { zeit: number; datum: number } {
  return {
    zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    datum: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Namen im ZIP: UTF-8 (Bit 11), ohne führende Schrägstriche und „..“. */
export function zipName(n: string): string {
  return n.replace(/\\/g, '/').split('/').filter((t) => t && t !== '.' && t !== '..').join('/').slice(0, 400) || 'datei';
}

function lokalerKopf(name: Buffer, f: { methode: number; crc: number; groesse: number; komprimiert: number; flags: number }, z: { zeit: number; datum: number }) {
  const k = Buffer.alloc(30);
  k.writeUInt32LE(0x04034b50, 0); k.writeUInt16LE(20, 4); k.writeUInt16LE(f.flags, 6); k.writeUInt16LE(f.methode, 8);
  k.writeUInt16LE(z.zeit, 10); k.writeUInt16LE(z.datum, 12); k.writeUInt32LE(f.crc, 14); k.writeUInt32LE(f.komprimiert, 18); k.writeUInt32LE(f.groesse, 22);
  k.writeUInt16LE(name.length, 26); k.writeUInt16LE(0, 28);
  return Buffer.concat([k, name]);
}
function zentralerEintrag(name: Buffer, f: { methode: number; crc: number; groesse: number; komprimiert: number; flags: number; versatz: number }, z: { zeit: number; datum: number }) {
  const k = Buffer.alloc(46);
  k.writeUInt32LE(0x02014b50, 0); k.writeUInt16LE(0x031e, 4); k.writeUInt16LE(20, 6); k.writeUInt16LE(f.flags, 8); k.writeUInt16LE(f.methode, 10);
  k.writeUInt16LE(z.zeit, 12); k.writeUInt16LE(z.datum, 14); k.writeUInt32LE(f.crc, 16); k.writeUInt32LE(f.komprimiert, 20); k.writeUInt32LE(f.groesse, 24);
  k.writeUInt16LE(name.length, 28); k.writeUInt32LE((0o100644 << 16) >>> 0, 38); k.writeUInt32LE(f.versatz, 42);
  return Buffer.concat([k, name]);
}
function ende(anzahl: number, groesse: number, versatz: number) {
  const k = Buffer.alloc(22);
  k.writeUInt32LE(0x06054b50, 0); k.writeUInt16LE(anzahl, 8); k.writeUInt16LE(anzahl, 10); k.writeUInt32LE(groesse, 12); k.writeUInt32LE(versatz, 16);
  return k;
}

/** Kleine Dateien komprimiert im Arbeitsspeicher. */
export function zipPuffer(dateien: Array<{ name: string; daten: Buffer }>, jetzt = new Date()): Buffer {
  const z = dosZeit(jetzt);
  const teile: Buffer[] = []; const zentral: Buffer[] = [];
  let versatz = 0;
  for (const d of dateien) {
    const name = Buffer.from(zipName(d.name), 'utf8');
    const roh = deflateRawSync(d.daten, { level: 6 });
    const f = { methode: 8, crc: crcEnde(crc32(d.daten)), groesse: d.daten.length, komprimiert: roh.length, flags: 0x0800 };
    const kopf = lokalerKopf(name, f, z);
    zentral.push(zentralerEintrag(name, { ...f, versatz }, z));
    teile.push(kopf, roh);
    versatz += kopf.length + roh.length;
  }
  const cd = Buffer.concat(zentral);
  return Buffer.concat([...teile, cd, ende(dateien.length, cd.length, versatz)]);
}

export interface ZipEintrag { name: string; groesse: number; inhalt: () => Promise<Readable | Buffer> }
export const ZIP_MAX = 0xffffffff;

/** Gesamtgröße eines zipStrom – vorab, für Content-Length. */
export function zipGroesse(eintraege: ZipEintrag[]): number {
  return eintraege.reduce((n, e) => { const l = Buffer.byteLength(zipName(e.name), 'utf8'); return n + 30 + l + e.groesse + 16 + 46 + l; }, 0) + 22;
}

/** Große Dateien als Strom, unkomprimiert, mit Datendeskriptor (Prüfsumme nach den Daten). */
export function zipStrom(eintraege: ZipEintrag[], jetzt = new Date()): Readable {
  const z = dosZeit(jetzt);
  async function* erzeuge() {
    const zentral: Buffer[] = [];
    let versatz = 0;
    for (const e of eintraege) {
      const name = Buffer.from(zipName(e.name), 'utf8');
      const flags = 0x0808; // UTF-8, Datendeskriptor
      const kopf = lokalerKopf(name, { methode: 0, crc: 0, groesse: 0, komprimiert: 0, flags }, z);
      yield kopf;
      let crc = 0xffffffff; let n = 0;
      const quelle = await e.inhalt();
      for await (const stueck of (Buffer.isBuffer(quelle) ? [quelle] : quelle)) {
        const b = stueck as Buffer;
        crc = crc32(b, crc); n += b.length;
        yield b;
      }
      if (n !== e.groesse) throw new Error(`Größe von „${e.name}“ stimmt nicht (${n} statt ${e.groesse} Bytes).`);
      const fertig = crcEnde(crc);
      const dd = Buffer.alloc(16);
      dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(fertig, 4); dd.writeUInt32LE(n, 8); dd.writeUInt32LE(n, 12);
      yield dd;
      zentral.push(zentralerEintrag(name, { methode: 0, crc: fertig, groesse: n, komprimiert: n, flags, versatz }, z));
      versatz += kopf.length + n + 16;
    }
    const cd = Buffer.concat(zentral);
    yield cd;
    yield ende(eintraege.length, cd.length, versatz);
  }
  return Readable.from(erzeuge());
}
