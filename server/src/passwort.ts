import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/* Passwörter: scrypt aus Node, ohne native Zusatzbibliothek (läuft auf jedem NAS). */

const N = 16384, R = 8, P = 1, LAENGE = 64;

function scryptAsync(passwort: string, salz: Buffer): Promise<Buffer> {
  return new Promise((ok, fehler) => scrypt(passwort.normalize('NFKC'), salz, LAENGE, { N, r: R, p: P }, (e, k) => (e ? fehler(e) : ok(k))));
}

/** Ergebnis: scrypt$N$r$p$salz$hash (Base64), damit Parameter später erhöht werden können. */
export async function hashePasswort(passwort: string): Promise<string> {
  const salz = randomBytes(16);
  const hash = await scryptAsync(passwort, salz);
  return ['scrypt', N, R, P, salz.toString('base64'), hash.toString('base64')].join('$');
}

export async function pruefePasswort(passwort: string, gespeichert: string | null | undefined): Promise<boolean> {
  if (!gespeichert) {
    // Gleich viel Arbeit wie bei einem echten Vergleich, damit die Antwortzeit nichts verrät.
    await scryptAsync(passwort, randomBytes(16));
    return false;
  }
  const [art, n, r, p, salz, hash] = gespeichert.split('$');
  if (art !== 'scrypt' || !salz || !hash) return false;
  const soll = Buffer.from(hash, 'base64');
  const ist = await new Promise<Buffer>((ok, fehler) =>
    scrypt(passwort.normalize('NFKC'), Buffer.from(salz, 'base64'), soll.length, { N: Number(n), r: Number(r), p: Number(p) }, (e, k) => (e ? fehler(e) : ok(k))));
  return ist.length === soll.length && timingSafeEqual(ist, soll);
}

/** Zufälliger Schlüssel für Sitzungen und Links (256 Bit, URL-tauglich). */
export const neuerSchluessel = () => randomBytes(32).toString('base64url');

/** In der Datenbank liegt nur der Hash eines Schlüssels. */
export const hasheSchluessel = (s: string) => createHash('sha256').update(s).digest('hex');
