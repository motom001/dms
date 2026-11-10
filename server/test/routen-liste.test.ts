/**
 * Routenliste des Servers (#960): Beim Aufteilen von routen.ts in Fachdateien darf keine Route verloren gehen oder
 * doppelt hinzukommen, und jede nennt ihre Zugriffsstufe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen } from '../src/routen';

/** Interne Routen, öffentliche API /api/v1 und die beiden Beschreibungen (openapi.json). Neue Routen: Zahl anpassen. */
const ANZAHL = 619;

describe('Routenliste (#960)', () => {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  const alle = routen(d, konten, {});

  it('Anzahl der Routen unverändert', () => {
    assert.equal(alle.length, ANZAHL);
  });

  it('jede Route mit Zugriffsstufe und Handler', () => {
    for (const r of alle) {
      assert.ok(['offen', 'angemeldet', 'admin'].includes(r.zugang), `${r.methode} ${r.pfad}: zugang = ${String(r.zugang)}`);
      assert.equal(typeof r.handler, 'function', `${r.methode} ${r.pfad}: ohne Handler`);
    }
  });

  it('keine Kombination aus Methode und Adresse doppelt', () => {
    const gesehen = new Set<string>();
    const doppelt = alle.map((r) => `${r.methode} ${r.pfad}`).filter((k) => (gesehen.has(k) ? true : (gesehen.add(k), false)));
    assert.deepEqual(doppelt, []);
  });
});
