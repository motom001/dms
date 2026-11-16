/**
 * Prüft den offiziellen Katalog unter seiner echten Adresse (#688): katalog.json und katalog.sig sind per HTTPS
 * erreichbar, Weiterleitungen nur auf https://, und die Signatur stimmt mit einem der Projektschlüssel.
 * Läuft in der CI (Workflow „Prüfen und Image bauen“), nicht in den Tests: Es braucht das Internet.
 * Aufruf: node --import tsx server/werkzeuge/katalog-erreichbar.ts
 */
import { OFFIZIELLER_KATALOG } from '../../shared/src/pakete';
import { projektSchluessel, pruefeSignatur } from '../src/katalogsignatur';

async function hole(adresse: string): Promise<Buffer> {
  let u = new URL(adresse);
  for (let i = 0; i < 5; i++) {
    if (u.protocol !== 'https:') throw new Error(`${adresse}: Weiterleitung auf ${u.href} ist nicht https`);
    const r = await fetch(u, { redirect: 'manual' });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      u = new URL(r.headers.get('location')!, u);
      continue;
    }
    if (!r.ok) throw new Error(`${u.href}: HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error(`${adresse}: zu viele Weiterleitungen`);
}

const katalog = await hole(OFFIZIELLER_KATALOG);
const sig = await hole(new URL('katalog.sig', OFFIZIELLER_KATALOG).href);
const ergebnis = pruefeSignatur(katalog, sig, projektSchluessel());
console.log(
  `${OFFIZIELLER_KATALOG}: ${katalog.length} Bytes, Signatur ${ergebnis.ok ? `gültig (Schlüssel ${ergebnis.schluessel.kennung})` : `ungültig: ${ergebnis.grund}`}`,
);
if (!ergebnis.ok) process.exit(1);
