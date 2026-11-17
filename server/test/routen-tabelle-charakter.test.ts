/**
 * Charakterisierung der Routentabellen (#1278, Schritt 6b-4b): Vor dem Aufteilen der langen Registrierfunktionen hält
 * dieser Test fest, welche Routen sie in welcher Reihenfolge liefern – Methode, Pfad, Zugang und alle weiteren Angaben
 * (Grenzen für den Körper, `lesend`, `still`, `api` …), ohne die Handler.
 *
 * Erwartung: `test/charakter/routen-tabelle.json`. Neu schreiben nur, wenn sich die Routen bewusst ändern:
 * `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/routen-tabelle-charakter.test.ts` – dann den Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Route } from '../src/http/routen-typen';
import { betriebRouten, systemzustandRouten } from '../src/system/system.routen';
import { werkbankRouten, werkbankUebersichtRouten } from '../src/werkbank/werkbank.routen';
import { ablageRouten } from '../src/sichten/sichten.routen';
import { dokumenteRouten } from '../src/dokumente/dokumente.routen';
import { dokumentePdfRouten } from '../src/dokumente/dokumente-pdf.routen';
import { dokumenteVolltextRouten } from '../src/dokumente/dokumente-volltext.routen';
import { automatisierungRouten } from '../src/automatisierung/automatisierung.routen';
import { paketeRouten } from '../src/pakete/pakete.routen';

const DATEI = fileURLToPath(new URL('./charakter/routen-tabelle.json', import.meta.url));

const BEREICHE = {
  betriebRouten,
  systemzustandRouten,
  werkbankRouten,
  werkbankUebersichtRouten,
  ablageRouten,
  dokumenteRouten,
  dokumentePdfRouten,
  dokumenteVolltextRouten,
  automatisierungRouten,
  paketeRouten,
};

/** Eine Route ohne Handler, als eine Zeile: „METHODE /pfad zugang {weitere Angaben}“. */
function zeile(r: Route): string {
  const { methode, pfad, zugang } = r;
  const rest = Object.fromEntries(Object.entries(r).filter(([s]) => !['methode', 'pfad', 'zugang', 'handler'].includes(s)));
  const weitere = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return `${methode} ${pfad} ${zugang}${weitere}`;
}

describe('Routentabellen der langen Registrierfunktionen (#1278, Schritt 6b-4b)', () => {
  // Beim Registrieren wird nichts aus dem Kontext aufgerufen, nur weitergereicht: Ein Stellvertreter genügt, der jede
  // Angabe als leere Funktion liefert (Routen-Kontext nur aus Routen, .dependency-cruiser.cjs).
  const leer = (): unknown => k;
  const k = new Proxy(leer, { get: () => leer }) as unknown as Parameters<typeof betriebRouten>[0];
  const ist = Object.fromEntries(Object.entries(BEREICHE).map(([name, f]) => [name, f(k).map(zeile)]));
  if (process.env.CHARAKTER_SCHREIBEN) {
    mkdirSync(dirname(DATEI), { recursive: true });
    writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
  }
  const soll = existsSync(DATEI) ? (JSON.parse(readFileSync(DATEI, 'utf8')) as Record<string, string[]>) : {};

  for (const name of Object.keys(BEREICHE)) {
    it(`${name}: Routen in Reihenfolge`, () => {
      assert.ok(ist[name].length > 0);
      assert.deepEqual(ist[name], soll[name]);
    });
  }
});
