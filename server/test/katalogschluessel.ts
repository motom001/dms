/**
 * NUR FÜR TESTS: private Testschlüssel für den offiziellen Katalog (#594) und für einen „eigenen Katalog“.
 * Die echten Projektschlüssel in server/src/projektschluessel.ts gehören nicht dazu; Tests geben stattdessen
 * TEST_PROJEKT als `projektSchluessel` an die Paketverwaltung bzw. an projektSchluessel() mit. Ein DMS im
 * Betrieb kennt diese Schlüssel nicht – der Test „Projektschlüssel“ prüft das.
 *
 * Gespeichert ist nur der 32-Byte-Kern (Seed) als Hex, kein PEM.
 */
import { createHash, createPrivateKey, createPublicKey, sign, type KeyObject } from 'node:crypto';
import type { Projektschluessel } from '../src/projektschluessel';

/** PKCS#8-Kopf für einen Ed25519-Schlüssel; dahinter kommt der Seed. */
const PKCS8_KOPF = '302e020100300506032b657004220420';

export const TEST_SEED = {
  signier: '7a664abf74731d27b46936f845f29ae2e97fc2e54bc9166e9a9f72d9233d9697',
  reserve: '47d6bde66f62384fe3e247603a25f97582fc77f7179ffb90ee6da5cc3e640b4c',
  /** Anbieter eines eigenen Katalogs (Lena), bisheriger und neuer Schlüssel. */
  anbieter: '1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100',
  anbieterNeu: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  /** Ein Schlüssel, den das DMS nicht kennt. */
  fremd: 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100',
} as const;

export const privat = (seed: string): KeyObject => createPrivateKey({ key: Buffer.from(PKCS8_KOPF + seed, 'hex'), format: 'der', type: 'pkcs8' });
export const oeffentlichPem = (seed: string): string => createPublicKey(privat(seed)).export({ format: 'pem', type: 'spki' }).toString();
const kennung = (seed: string) => createHash('sha256').update((createPublicKey(privat(seed)).export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32)).digest('hex').slice(0, 16);

/** katalog.sig über genau diese Bytes, wie werkzeuge/signieren.py in der Registry sie schreibt. */
export function signatur(daten: Buffer, seed: string, erstellt = ''): Buffer {
  return Buffer.from(JSON.stringify({ format: 1, verfahren: 'ed25519', schluessel: kennung(seed), signatur: sign(null, daten, privat(seed)).toString('base64'), erstellt }));
}

/** Projektschlüssel für Tests (unabhängig davon, was in server/src/projektschluessel.ts steht). */
export const TEST_PROJEKT: Projektschluessel[] = [
  { rolle: 'signier', test: true, pem: oeffentlichPem(TEST_SEED.signier) },
  { rolle: 'reserve', test: true, pem: oeffentlichPem(TEST_SEED.reserve) },
];

/**
 * Abruf mit signiertem offiziellem Katalog (#1351): `katalog.sig` neben `katalogUrl` ist die Testsignatur über das,
 * was der Abruf dort liefert. Dazu `projektSchluessel: TEST_PROJEKT` an die Paketverwaltung; der Katalog braucht `erstellt`.
 */
export const testSigniert = (katalogUrl: string, abruf: (url: string) => Promise<Buffer>) => async (url: string): Promise<Buffer> =>
  (url === new URL('katalog.sig', katalogUrl).href ? signatur(await abruf(katalogUrl), TEST_SEED.signier) : abruf(url));
