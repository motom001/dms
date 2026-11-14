import { createHash } from 'node:crypto';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline, Transform, type Readable } from 'node:stream';

/**
 * Prüfsummen eines Vollexports (#1195).
 *
 * - `SHA256SUMS` im Standardformat von `sha256sum` (je Zeile Prüfwert, zwei Leerzeichen, Pfad) neben `manifest.json`:
 *   `sha256sum -c SHA256SUMS` (Linux), `shasum -a 256 -c SHA256SUMS` (macOS) prüft jede Datei, auch `manifest.json`.
 * - Die ZIP setzt Ablago erst beim Herunterladen zusammen; ihre SHA-256 rechnet `mitPruefsumme` dabei mit.
 * - Nach dem vollständigen Herunterladen bleiben von dem Export nur `SHA256SUMS` und `heruntergeladen.json` (Zeitpunkt,
 *   SHA-256 und Größe der ZIP) stehen, bis die Frist des Exports (`EXPORT_TAGE`) ab dem Herunterladen um ist.
 */

export const PRUEFSUMMEN = 'SHA256SUMS';
export const HERUNTERGELADEN = 'heruntergeladen.json';

/** Angaben nach dem Herunterladen; `erstellt`, `dateien`, `mappen` aus dem Manifest, das danach gelöscht ist. */
export interface Heruntergeladen { am: string; sha256: string; bytes: number; erstellt: string | null; dateien: number; mappen: number | null }

/**
 * Eine Zeile wie `sha256sum`: Enthält der Pfad einen Rückstrich oder Zeilenumbruch, beginnt die Zeile mit `\` und
 * beide sind maskiert – so liest `sha256sum -c` auch solche Namen.
 */
export function pruefsummenZeile(sha256: string, pfad: string): string {
  if (!/[\\\n\r]/.test(pfad)) return `${sha256}  ${pfad}`;
  return `\\${sha256}  ${pfad.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}`;
}

/** Inhalt von SHA256SUMS, nach Pfad sortiert. */
export function pruefsummen(dateien: Array<{ pfad: string; sha256: string }>): Buffer {
  const zeilen = [...dateien].sort((a, b) => (a.pfad < b.pfad ? -1 : a.pfad > b.pfad ? 1 : 0)).map((d) => pruefsummenZeile(d.sha256, d.pfad));
  return Buffer.from(`${zeilen.join('\n')}\n`, 'utf8');
}

/**
 * Strom durchreichen und dabei SHA-256 und Größe mitrechnen. `fertig` kommt erst, wenn der Empfänger alles gelesen
 * hat; bricht der Download ab, kommt es nicht. Fehler der Quelle beenden auch den durchgereichten Strom.
 */
export function mitPruefsumme(quelle: Readable, fertig: (e: { sha256: string; bytes: number }) => void): Readable {
  const h = createHash('sha256');
  let bytes = 0;
  const durch = new Transform({ transform(stueck: Buffer, _k, weiter) { h.update(stueck); bytes += stueck.length; weiter(null, stueck); } });
  durch.on('end', () => fertig({ sha256: h.digest('hex'), bytes }));
  return pipeline(quelle, durch, () => {});
}

/** Nach dem Herunterladen: alles außer SHA256SUMS löschen und die Angaben zur ZIP festhalten. */
export async function alsHeruntergeladen(ordner: string, zip: { sha256: string; bytes: number }, jetzt = new Date()): Promise<void> {
  let m: { erstellt?: string; dateien?: unknown[]; anzahlen?: { mappen?: number } } = {};
  try { m = JSON.parse(await readFile(join(ordner, 'manifest.json'), 'utf8')) as typeof m; } catch { /* ohne Manifest: nur die ZIP-Angaben */ }
  const stand: Heruntergeladen = { am: jetzt.toISOString(), ...zip, erstellt: m.erstellt ?? null, dateien: (m.dateien?.length ?? 0) + 1, mappen: m.anzahlen?.mappen ?? null };
  for (const e of await readdir(ordner)) if (e !== PRUEFSUMMEN) await rm(join(ordner, e), { recursive: true, force: true });
  await writeFile(join(ordner, HERUNTERGELADEN), JSON.stringify(stand, null, 2));
}

/** Angaben eines heruntergeladenen Exports oder null. */
export async function heruntergeladen(ordner: string): Promise<Heruntergeladen | null> {
  try { return JSON.parse(await readFile(join(ordner, HERUNTERGELADEN), 'utf8')) as Heruntergeladen; } catch { return null; }
}
