/**
 * Kleiner ZIP-Schreiber (#153) – ohne Bibliothek.
 * - zipPuffer: kleine Dateien im Arbeitsspeicher, komprimiert (für .xlsx).
 * - zipStrom: große Dateien als Strom, unkomprimiert (Dokumente sind meist schon komprimiert),
 *   mit vorab bekannter Gesamtgröße. Kein ZIP64: höchstens 4 GiB.
 */
import { createCipheriv, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import * as zlib from 'node:zlib';
import { deflateRawSync } from 'node:zlib';
import { ZIP_STUECK as STUECK } from './grenzen';

const TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
/** CRC-32 von zlib (Node ≥ 22.2, in C++) – im Hauptfaden viel schneller als in JavaScript (#542). */
const nativ = (zlib as { crc32?: (d: Uint8Array, v?: number) => number }).crc32;
/** Fortlaufende Prüfsumme: Zustand ohne Abschluss (Start 0xffffffff, Ende mit `crcEnde`). */
export function crc32(b: Buffer, start = 0xffffffff): number {
  if (nativ) return (~nativ(b, (~start) >>> 0)) >>> 0;
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

function lokalerKopf(name: Buffer, f: { methode: number; crc: number; groesse: number; komprimiert: number; flags: number; version?: number; extra?: Buffer }, z: { zeit: number; datum: number }) {
  const k = Buffer.alloc(30);
  const extra = f.extra ?? Buffer.alloc(0);
  k.writeUInt32LE(0x04034b50, 0); k.writeUInt16LE(f.version ?? 20, 4); k.writeUInt16LE(f.flags, 6); k.writeUInt16LE(f.methode, 8);
  k.writeUInt16LE(z.zeit, 10); k.writeUInt16LE(z.datum, 12); k.writeUInt32LE(f.crc, 14); k.writeUInt32LE(f.komprimiert, 18); k.writeUInt32LE(f.groesse, 22);
  k.writeUInt16LE(name.length, 26); k.writeUInt16LE(extra.length, 28);
  return Buffer.concat([k, name, extra]);
}
function zentralerEintrag(name: Buffer, f: { methode: number; crc: number; groesse: number; komprimiert: number; flags: number; versatz: number; version?: number; extra?: Buffer }, z: { zeit: number; datum: number }) {
  const k = Buffer.alloc(46);
  const extra = f.extra ?? Buffer.alloc(0);
  k.writeUInt32LE(0x02014b50, 0); k.writeUInt16LE(0x0300 | Math.max(30, f.version ?? 20), 4); k.writeUInt16LE(f.version ?? 20, 6); k.writeUInt16LE(f.flags, 8); k.writeUInt16LE(f.methode, 10);
  k.writeUInt16LE(z.zeit, 12); k.writeUInt16LE(z.datum, 14); k.writeUInt32LE(f.crc, 16); k.writeUInt32LE(f.komprimiert, 20); k.writeUInt32LE(f.groesse, 24);
  k.writeUInt16LE(name.length, 28); k.writeUInt16LE(extra.length, 30); k.writeUInt32LE((0o100644 << 16) >>> 0, 38); k.writeUInt32LE(f.versatz, 42);
  return Buffer.concat([k, name, extra]);
}

/* ---------- Verschlüsselung (#396): WinZip-AES (AE-2, AES-256) mit Bordmitteln von Node ---------- */

/**
 * AE-2: je Eintrag Salz (16 Bytes), Schlüssel per PBKDF2-HMAC-SHA1 (1000 Runden), AES-256 im
 * Zählermodus (Zähler little-endian ab 1), HMAC-SHA1 über den verschlüsselten Daten (10 Bytes).
 * Ohne CRC (AE-2 lässt ihn weg, damit er nichts über den Inhalt verrät). Lesen können das 7-Zip,
 * WinZip, macOS-Archivprogramme wie Keka und unzip-Varianten mit AES; der Explorer von Windows nicht.
 */
const AES_EXTRA = (() => {
  const e = Buffer.alloc(11);
  e.writeUInt16LE(0x9901, 0); e.writeUInt16LE(7, 2); e.writeUInt16LE(2, 4); e.write('AE', 6, 'latin1'); e.writeUInt8(3, 8); e.writeUInt16LE(0, 9);
  return e;
})();
/** Zusätzliche Bytes je verschlüsseltem Eintrag: Salz, Prüfwert, Authentifizierung. */
export const AES_ZUSATZ = 16 + 2 + 10;
export const ZIP_PASSWORT_MIN = 10;

/**
 * Schlüsselstrom und Prüfwert rechnet node:crypto (AES-256 auf den Zählerblöcken, HMAC-SHA1). Fertiges `aes-256-ctr`
 * passt nicht: WinZip zählt den Block little-endian hoch, OpenSSL big-endian. Übrig bleibt das XOR mit dem
 * Schlüsselstrom – seit #746 in 32-Bit-Worten statt Byte für Byte (rund viermal schneller), in Stücken von höchstens
 * STUECK Bytes, damit ein großes Stück den Faden nicht lange hält.
 */
/** Uint32Array schreibt in der Byte-Reihenfolge des Rechners; WinZip braucht little-endian (x86, ARM: ja). */
const KLEIN_ZUERST = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
class AesStrom {
  private zaehler = 1;
  private rest: Buffer = Buffer.alloc(0);
  private readonly ecb;
  private readonly hmac;
  readonly kopf: Buffer;
  constructor(passwort: string) {
    const salz = randomBytes(16);
    const k = pbkdf2Sync(Buffer.from(passwort, 'utf8'), salz, 1000, 66, 'sha1');
    this.ecb = createCipheriv('aes-256-ecb', k.subarray(0, 32), null);
    this.ecb.setAutoPadding(false);
    this.hmac = createHmac('sha1', k.subarray(32, 64));
    this.kopf = Buffer.concat([salz, k.subarray(64, 66)]);
  }
  /** Zählerblöcke (little-endian, ab 1) als Schlüsselstrom; `n` Bytes, Vielfaches von 16. */
  private schluesselstrom(n: number): Buffer {
    const w = new Uint32Array(n >>> 2);
    if (KLEIN_ZUERST) {
      for (let o = 0; o < w.length; o += 4) { w[o] = this.zaehler % 0x100000000; w[o + 1] = Math.floor(this.zaehler / 0x100000000); this.zaehler++; }
      return this.ecb.update(Buffer.from(w.buffer));
    }
    const z = Buffer.from(w.buffer);
    for (let o = 0; o < n; o += 16) { z.writeUInt32LE(this.zaehler % 0x100000000, o); z.writeUInt32LE(Math.floor(this.zaehler / 0x100000000), o + 4); this.zaehler++; }
    return this.ecb.update(z);
  }
  verschluessele(b: Buffer): Buffer {
    // Eigener, ausgerichteter Speicher: darin XOR in 32-Bit-Worten (Buffer aus dem Pool liegen oft unausgerichtet).
    const r = Buffer.from(new ArrayBuffer(b.length));
    b.copy(r);
    let i = 0;
    // Erst den Rest des letzten Blocks verbrauchen.
    for (; i < b.length && i < this.rest.length; i++) r[i] ^= this.rest[i];
    this.rest = this.rest.subarray(i);
    while (i < b.length) {
      const n = Math.min(STUECK, b.length - i);
      const strom = this.schluesselstrom(Math.ceil(n / 16) * 16);
      // Bis zur nächsten durch 4 teilbaren Stelle Byte für Byte, dann in Worten, den Rest wieder Byte für Byte.
      let j = 0;
      for (; j < n && ((i + j) & 3) !== 0; j++) r[i + j] ^= strom[j];
      const worte = (n - j) >>> 2;
      if (worte > 0) {
        const quelle = new Uint32Array(worte); // ausgerichtete Kopie des Schlüsselstroms
        Buffer.from(quelle.buffer).set(strom.subarray(j, j + worte * 4));
        const ziel = new Uint32Array(r.buffer, r.byteOffset + i + j, worte);
        for (let w = 0; w < worte; w++) ziel[w] ^= quelle[w];
        j += worte * 4;
      }
      for (; j < n; j++) r[i + j] ^= strom[j];
      this.rest = strom.subarray(n);
      i += n;
    }
    this.hmac.update(r);
    return r;
  }
  ende(): Buffer { return this.hmac.digest().subarray(0, 10); }
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

/** Gesamtgröße eines zipStrom – vorab, für Content-Length. Mit Passwort: AES-Einträge ohne Datendeskriptor. */
export function zipGroesse(eintraege: ZipEintrag[], verschluesselt = false): number {
  return eintraege.reduce((n, e) => {
    const l = Buffer.byteLength(zipName(e.name), 'utf8');
    return n + (verschluesselt ? 30 + l + 11 + e.groesse + AES_ZUSATZ + 46 + l + 11 : 30 + l + e.groesse + 16 + 46 + l);
  }, 0) + 22;
}

/**
 * Große Dateien als Strom, unkomprimiert, mit Datendeskriptor (Prüfsumme nach den Daten).
 * Mit `passwort` (#396): jeder Eintrag WinZip-AES-256 (AE-2); die Größen stehen dann schon im Kopf.
 */
export function zipStrom(eintraege: ZipEintrag[], jetzt = new Date(), passwort?: string): Readable {
  const z = dosZeit(jetzt);
  async function* erzeuge() {
    const zentral: Buffer[] = [];
    let versatz = 0;
    for (const e of eintraege) {
      const name = Buffer.from(zipName(e.name), 'utf8');
      if (passwort) {
        const groesse = e.groesse + AES_ZUSATZ;
        const f = { methode: 99, crc: 0, groesse: e.groesse, komprimiert: groesse, flags: 0x0801, version: 51, extra: AES_EXTRA };
        const kopf = lokalerKopf(name, f, z);
        yield kopf;
        const aes = new AesStrom(passwort);
        yield aes.kopf;
        let n = 0;
        const quelle = await e.inhalt();
        for await (const stueck of (Buffer.isBuffer(quelle) ? [quelle] : quelle)) { const b = stueck as Buffer; n += b.length; yield aes.verschluessele(b); }
        if (n !== e.groesse) throw new Error(`Größe von „${e.name}“ stimmt nicht (${n} statt ${e.groesse} Bytes).`);
        yield aes.ende();
        zentral.push(zentralerEintrag(name, { ...f, versatz }, z));
        versatz += kopf.length + groesse;
        continue;
      }
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
