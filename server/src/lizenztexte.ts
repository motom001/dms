import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lizenztexte für selbst erstellte Pakete (#374): die Positivliste der Registry (REGELN.md), je mit dem
 * vollständigen Text für LICENSE. {jahr} und {name} setzt die Paketerstellung ein (nur MIT und BSD).
 * Quellen: Vorlage der Registry (MIT), SPDX (BSD), Debian common-licenses (Apache, MPL, GPL, LGPL, CC0),
 * LICENSE des DMS bis 0.92.0 (AGPL).
 *
 * Die Texte selbst stehen seit #1278 als Datendateien in `server/lizenzen/<SPDX>.txt` (byte-genau wie vorher die
 * Template-Strings) – wie die Schriften in `server/schriften/` neben dem Quelltext bzw. neben `server/dist`; das
 * Dockerfile kopiert den Ordner ins Image. Fehlt er, bricht schon das Laden ab statt still leere LICENSE-Dateien zu
 * schreiben.
 */
const SPDX = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'MPL-2.0',
  'LGPL-3.0-or-later',
  'GPL-3.0-or-later',
  'AGPL-3.0-or-later',
  'CC0-1.0',
];

/** Ordner `server/lizenzen/`: neben dem Quelltext (src/) bzw. neben server/dist – wie `schriftOrdner()` (pdf/schrift.ts). */
function lizenzOrdner(): string {
  const hier = dirname(fileURLToPath(import.meta.url));
  const kandidaten = [join(hier, '..', 'lizenzen'), join(process.cwd(), 'lizenzen'), join(process.cwd(), 'server', 'lizenzen')];
  const ordner = kandidaten.find((k) => SPDX.every((s) => existsSync(join(k, `${s}.txt`))));
  if (!ordner) throw new Error(`Lizenztexte fehlen (${SPDX.join(', ')} als .txt, gesucht in ${kandidaten.join(', ')})`);
  return ordner;
}

const ordner = lizenzOrdner();
export const LIZENZTEXTE: Record<string, string> = Object.fromEntries(SPDX.map((s) => [s, readFileSync(join(ordner, `${s}.txt`), 'utf8')]));
