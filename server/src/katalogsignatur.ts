/**
 * Signierte Paketkataloge (#594, motom001/dms-registry#74): Ed25519 über die exakten Bytes von `katalog.json`,
 * geprüft mit `crypto.verify` aus Node – keine weitere Abhängigkeit.
 *
 * Dateien neben `katalog.json`:
 *
 *     katalog.sig              {"format":1,"verfahren":"ed25519","schluessel":"<kennung>","signatur":"<base64>","erstellt":"<ISO>"}
 *     katalog.schluessel       öffentlicher Schlüssel (PEM) – nur bei eigenen Katalogen, nicht beim offiziellen
 *     katalog.schluessel.sig   wie katalog.sig, aber über die Bytes von katalog.schluessel, signiert mit dem
 *                              BISHERIGEN Schlüssel – geordneter Schlüsselwechsel
 *
 * Kennung und Fingerabdruck: SHA-256 über die 32 Bytes des öffentlichen Schlüssels, hexadezimal; die Kennung
 * sind die ersten 16 Zeichen, der Fingerabdruck alle 64 in Vierergruppen. Die Registry rechnet genauso
 * (werkzeuge/signieren.py).
 */
import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto';
import { PROJEKT_SCHLUESSEL, type Projektschluessel } from './projektschluessel';
import { t } from './sprache';
import { SIGNATUR_MAX } from './grenzen';

export const SIGNATUR_DATEI = 'katalog.sig';
export const SCHLUESSEL_DATEI = 'katalog.schluessel';
export const WECHSEL_DATEI = 'katalog.schluessel.sig';
export { SIGNATUR_MAX };

export interface Schluessel { key: KeyObject; kennung: string; fingerabdruck: string; pem: string }

/** Öffentlichen Ed25519-Schlüssel lesen (PEM, SPKI); wirft bei allem anderen. */
export function liesSchluessel(pem: string): Schluessel {
  let key: KeyObject;
  try { key = createPublicKey({ key: pem, format: 'pem' }); } catch { throw new Error('kein öffentlicher Schlüssel im PEM-Format'); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`Schlüsselart ${key.asymmetricKeyType ?? '?'} statt Ed25519`);
  const roh = (key.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32);
  const hex = createHash('sha256').update(roh).digest('hex');
  return { key, kennung: hex.slice(0, 16), fingerabdruck: hex.match(/.{4}/g)!.join(' '), pem: key.export({ format: 'pem', type: 'spki' }).toString() };
}

/** Beide Schlüssel des DMS-Projekts (aktiv und Reserve); Tests geben eigene mit. */
export function projektSchluessel(liste: readonly Projektschluessel[] = PROJEKT_SCHLUESSEL): Schluessel[] { return liste.map((s) => liesSchluessel(s.pem)); }
/** Sind die Schlüssel noch Testschlüssel? */
export const nurTestschluessel = (liste: readonly Projektschluessel[] = PROJEKT_SCHLUESSEL) => liste.some((s) => s.test);

export interface Signatur { schluessel: string; signatur: Buffer; erstellt: string }

/** katalog.sig lesen; wirft mit verständlichem Grund. */
export function liesSignatur(roh: Buffer): Signatur {
  if (roh.length > SIGNATUR_MAX) throw new Error('Signaturdatei zu groß');
  let j: Record<string, unknown>;
  try { j = JSON.parse(roh.toString('utf8')); } catch { throw new Error('Signaturdatei ist kein JSON'); }
  if (!j || typeof j !== 'object') throw new Error('Signaturdatei ist kein JSON-Objekt');
  if (j.format !== undefined && j.format !== 1) throw new Error(`Signaturformat ${String(j.format)} unbekannt`);
  if (j.verfahren !== undefined && j.verfahren !== 'ed25519') throw new Error(`Verfahren ${String(j.verfahren)} unbekannt`);
  if (typeof j.signatur !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(j.signatur)) throw new Error('Signatur fehlt oder ist kein Base64');
  const signatur = Buffer.from(j.signatur, 'base64');
  if (signatur.length !== 64) throw new Error('Signatur hat nicht 64 Bytes');
  return { schluessel: typeof j.schluessel === 'string' ? j.schluessel : '', signatur, erstellt: typeof j.erstellt === 'string' ? j.erstellt : '' };
}

export type Pruefergebnis =
  | { ok: true; schluessel: Schluessel }
  | { ok: false; grund: string };

/** Prüft Daten gegen eine Signaturdatei und eine Liste erlaubter Schlüssel. */
export function pruefeSignatur(daten: Buffer, sigRoh: Buffer, erlaubt: Schluessel[]): Pruefergebnis {
  let s: Signatur;
  try { s = liesSignatur(sigRoh); } catch (e) { return { ok: false, grund: (e as Error).message }; }
  // Die Kennung wählt nur die Reihenfolge; geprüft wird gegen jeden erlaubten Schlüssel.
  const reihe = [...erlaubt].sort((a, b) => Number(b.kennung === s.schluessel) - Number(a.kennung === s.schluessel));
  for (const k of reihe) if (verify(null, daten, k.key, s.signatur)) return { ok: true, schluessel: k };
  return { ok: false, grund: s.schluessel && !erlaubt.some((k) => k.kennung === s.schluessel) ? t('meldungen.katalogsignatur.unbekannter-schluessel', { schluessel: s.schluessel }) : t('meldungen.katalogsignatur.signatur-passt-nicht-zum') };
}

/** Zeitpunkt aus `erstellt` (ISO); NaN, wenn keiner. */
export const zeitVon = (iso: unknown): number => (typeof iso === 'string' && iso ? Date.parse(iso) : NaN);
