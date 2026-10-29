import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';

/**
 * Dateiformat einer Sicherung (#103), Version 1.
 *
 *   "DMS-SICHERUNG 1\n"           16 Byte, lesbar beim Öffnen der Datei
 *   u32 Länge + Kopf (JSON)        Verfahren, Fingerabdruck des Schlüssels, Nonce – unverschlüsselt,
 *                                  aber als „zusätzliche Daten“ mit geprüft (AAD)
 *   Geheimtext                     AES-256-GCM über gzip über die Einträge
 *   16 Byte Prüfwert (GCM-Tag)     erst am Ende prüfbar: wer liest, übernimmt nichts vorher
 *
 * Einträge (nach Entschlüsseln und Entpacken), nacheinander:
 *   u8 Art + u32 Länge + Kopf (JSON) + Stücke (u32 Länge + Bytes)… + u32 0
 *   Art M = Inhaltsangabe, T = Tabelle (COPY-Text), D = Datei, E = Ende
 * So lassen sich beliebig große Tabellen und Dateien streamen, ohne vorher ihre Größe zu kennen.
 */

export const MAGIE = Buffer.from('DMS-SICHERUNG 1\n', 'latin1');
export const FORMAT = 1;
export const ZWECK = 'dms-sicherung';
const STUECK = 1 << 20;

export interface Dateikopf { format: number; verfahren: string; ableitung: string; kompression: string; fingerabdruck: string; nonce: string }
export type Art = 'M' | 'T' | 'D' | 'E';
export interface Eintrag { art: Art; kopf: Record<string, unknown>; daten?: AsyncIterable<Buffer> | Buffer }

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

/** Einträge in Bytes umwandeln (unverschlüsselt, unkomprimiert). */
async function* eintraegeAlsBytes(eintraege: AsyncIterable<Eintrag>): AsyncGenerator<Buffer> {
  for await (const e of eintraege) {
    const kopf = Buffer.from(JSON.stringify(e.kopf), 'utf8');
    yield Buffer.concat([Buffer.from(e.art, 'latin1'), u32(kopf.length), kopf]);
    if (e.daten) {
      const quelle = Buffer.isBuffer(e.daten) ? [e.daten] : e.daten;
      for await (const roh of quelle) {
        const c = Buffer.isBuffer(roh) ? roh : Buffer.from(roh as Uint8Array);
        for (let i = 0; i < c.length; i += STUECK) {
          const teil = c.subarray(i, i + STUECK);
          yield Buffer.concat([u32(teil.length), teil]);
        }
      }
    }
    yield u32(0);
  }
}

export interface Geschrieben { bytes: number; sha256: string }

/**
 * Schreibt eine Sicherung nach `ziel` (die Datei darf noch nicht existieren).
 * `fortschritt` bekommt die Anzahl unverschlüsselter Bytes, die schon verarbeitet sind.
 */
export async function schreibeSicherung(ziel: string, schluessel: Buffer, fingerabdruck: string, eintraege: AsyncIterable<Eintrag>, fortschritt: (bytes: number) => void = () => {}): Promise<Geschrieben> {
  const nonce = randomBytes(12);
  const kopf: Dateikopf = { format: FORMAT, verfahren: 'AES-256-GCM', ableitung: `HKDF-SHA256 „${ZWECK}“ aus dem Schlüssel der Werkbank`, kompression: 'gzip', fingerabdruck, nonce: nonce.toString('base64url') };
  const kopfBytes = Buffer.from(JSON.stringify(kopf), 'utf8');
  const vorspann = Buffer.concat([MAGIE, u32(kopfBytes.length), kopfBytes]);
  const cipher = createCipheriv('aes-256-gcm', schluessel, nonce);
  cipher.setAAD(vorspann);
  const hash = createHash('sha256');
  const datei = await open(ziel, 'wx', 0o600);
  let bytes = 0;
  try {
    const schreibe = async (b: Buffer) => { if (!b.length) return; hash.update(b); bytes += b.length; await datei.write(b); };
    await schreibe(vorspann);
    let klar = 0;
    const quelle = Readable.from((async function* () {
      for await (const b of eintraegeAlsBytes(eintraege)) { klar += b.length; fortschritt(klar); yield b; }
    })());
    const gzip = createGzip({ level: 3 });
    quelle.pipe(gzip);
    quelle.on('error', (e) => gzip.destroy(e));
    for await (const z of gzip) await schreibe(cipher.update(z as Buffer));
    await schreibe(cipher.final());
    await schreibe(cipher.getAuthTag());
    await datei.sync();
  } finally {
    await datei.close();
  }
  return { bytes, sha256: hash.digest('hex') };
}

/** SHA-256 einer Datei (Prüfsummen-Check der Liste). */
export async function sha256Von(pfad: string, fortschritt: (bytes: number) => void = () => {}): Promise<string> {
  const h = createHash('sha256');
  let n = 0;
  for await (const c of createReadStream(pfad)) { h.update(c as Buffer); n += (c as Buffer).length; fortschritt(n); }
  return h.digest('hex');
}

/** Liest nur den unverschlüsselten Kopf (Fingerabdruck), ohne Schlüssel. */
export async function liesKopf(pfad: string): Promise<{ kopf: Dateikopf; vorspann: Buffer }> {
  const f = await open(pfad, 'r');
  try {
    const anfang = Buffer.alloc(MAGIE.length + 4);
    const { bytesRead } = await f.read(anfang, 0, anfang.length, 0);
    if (bytesRead < anfang.length || !anfang.subarray(0, MAGIE.length).equals(MAGIE)) throw new Error('Das ist keine Sicherungsdatei des DMS (oder ein unbekanntes Format).');
    const laenge = anfang.readUInt32BE(MAGIE.length);
    if (laenge > 64 * 1024) throw new Error('Der Kopf der Sicherungsdatei ist beschädigt.');
    const kopfBytes = Buffer.alloc(laenge);
    await f.read(kopfBytes, 0, laenge, anfang.length);
    const kopf = JSON.parse(kopfBytes.toString('utf8')) as Dateikopf;
    if (kopf.format !== FORMAT) throw new Error(`Die Sicherung hat das Format ${kopf.format}; dieses DMS kennt Format ${FORMAT}. Aktualisiere das DMS.`);
    return { kopf, vorspann: Buffer.concat([anfang, kopfBytes]) };
  } finally { await f.close(); }
}

/** Liest genau so viele Bytes aus einem Strom, wie verlangt. */
class Byteleser {
  private puffer: Buffer[] = [];
  private vorrat = 0;
  constructor(private quelle: AsyncIterator<Buffer>) {}
  async lies(n: number): Promise<Buffer> {
    while (this.vorrat < n) {
      const { value, done } = await this.quelle.next();
      if (done) throw new Error('Die Sicherungsdatei endet unerwartet (unvollständig oder beschädigt).');
      const b = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
      this.puffer.push(b); this.vorrat += b.length;
    }
    const alles = this.puffer.length === 1 ? this.puffer[0] : Buffer.concat(this.puffer);
    this.puffer = alles.length > n ? [alles.subarray(n)] : [];
    this.vorrat = alles.length - n;
    return alles.subarray(0, n);
  }
  async ende(): Promise<boolean> {
    if (this.vorrat) return false;
    const { value, done } = await this.quelle.next();
    if (done) return true;
    const b = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    if (b.length) { this.puffer.push(b); this.vorrat += b.length; }
    return !b.length ? this.ende() : false;
  }
}

export interface Gelesen { art: Art; kopf: Record<string, unknown>; daten: AsyncGenerator<Buffer> }

/**
 * Liest eine Sicherung Eintrag für Eintrag. Jeder Eintrag muss vollständig gelesen (oder mit
 * `ueberspringe` übersprungen) sein, bevor der nächste kommt. Ob die Datei echt ist, steht erst
 * fest, wenn alles gelesen ist (GCM-Tag) – bis dahin darf nichts endgültig übernommen werden.
 * Bei falschem Schlüssel oder veränderter Datei wirft das Lesen spätestens am Ende.
 */
export async function* liesSicherung(pfad: string, schluessel: Buffer, fortschritt: (bytes: number) => void = () => {}): AsyncGenerator<Gelesen> {
  const { vorspann, kopf } = await liesKopf(pfad);
  const groesse = (await stat(pfad)).size;
  if (groesse < vorspann.length + 16) throw new Error('Die Sicherungsdatei ist unvollständig.');
  const tag = Buffer.alloc(16);
  const f = await open(pfad, 'r');
  try { await f.read(tag, 0, 16, groesse - 16); } finally { await f.close(); }
  const decipher = createDecipheriv('aes-256-gcm', schluessel, Buffer.from(kopf.nonce, 'base64url'));
  decipher.setAAD(vorspann);
  decipher.setAuthTag(tag);
  let gelesen = vorspann.length;
  const geheim = createReadStream(pfad, { start: vorspann.length, end: groesse - 17 });
  geheim.on('data', (c) => { gelesen += (c as Buffer).length; fortschritt(gelesen); });
  const gunzip = createGunzip();
  geheim.pipe(decipher).pipe(gunzip);
  const fehler = (e: Error) => gunzip.destroy(e);
  geheim.on('error', fehler);
  decipher.on('error', (e) => gunzip.destroy(new Error(/auth/i.test(e.message) ? 'Die Sicherung ließ sich nicht entschlüsseln: falscher Schlüssel oder die Datei wurde verändert.' : e.message)));
  const leser = new Byteleser(gunzip[Symbol.asyncIterator]());
  try {
    for (;;) {
      const art = (await leser.lies(1)).toString('latin1') as Art;
      if (!['M', 'T', 'D', 'E'].includes(art)) throw new Error('Die Sicherungsdatei ist beschädigt (unbekannter Eintrag).');
      const k = JSON.parse((await leser.lies((await leser.lies(4)).readUInt32BE())).toString('utf8')) as Record<string, unknown>;
      let fertig = false;
      const daten = (async function* () {
        for (;;) {
          const n = (await leser.lies(4)).readUInt32BE();
          if (!n) { fertig = true; return; }
          yield await leser.lies(n);
        }
      })();
      yield { art, kopf: k, daten };
      if (!fertig) for await (const _ of daten) { /* Rest überspringen */ }
      if (art === 'E') break;
    }
    if (!(await leser.ende())) throw new Error('Nach dem Ende der Sicherung folgen noch Daten – die Datei ist beschädigt.');
  } catch (e) {
    geheim.destroy();
    const z = e as NodeJS.ErrnoException;
    if (typeof z.code === 'string' && z.code.startsWith('Z_')) throw new Error('Die Sicherung ließ sich nicht entschlüsseln: falscher Schlüssel oder die Datei wurde verändert.');
    throw e;
  }
}

/** Alle Bytes eines Eintrags einsammeln (für kleine Einträge wie die Inhaltsangabe). */
export async function sammle(daten: AsyncIterable<Buffer>): Promise<Buffer> {
  const teile: Buffer[] = [];
  for await (const c of daten) teile.push(c);
  return Buffer.concat(teile);
}
