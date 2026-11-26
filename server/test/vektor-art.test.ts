/**
 * `dms:vektor` mit Art (#1706): Das Paket erfährt, ob ein Suchbegriff oder der Text eines Dokuments kommt – genauere
 * Modelle (z. B. multilingual-e5) rechnen beides unterschiedlich („query:“/„passage:“).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/anmeldung/apischluessel';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { Paketlaeufer } from '../src/laeufer/verwaltung';
import { speicherRepo } from '../src/repo/speicher';

describe('dms:vektor mit Art (#1706)', () => {
  it('Suchbegriff, Dokument, nur Modell – und getrennt zwischengespeichert', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const l = new Paketlaeufer({
      dienst: d,
      konten,
      schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()),
      api: async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') }),
      einstellungen: async () => ({}),
      speicher: { lies: async () => ({}), schreibe: async () => {} },
      grenzen: { sekunden: 5, speicherMB: 16 },
    });
    const gesendet: unknown[] = [];
    const x = l as unknown as Record<string, unknown>;
    x.vektorPaket = () => 'ki_genau';
    x.vektorZiel = () => 'ki_genau'; // Modellabfrage geht an das gewählte Paket (#1707)
    x.laeuft = () => true;
    x.rufe = async (_p: string, _w: string, daten: unknown) => {
      gesendet.push(daten);
      return { ok: true, text: JSON.stringify({ modell: 'e5/8', vektor: [1, 0, 0, 0, 0, 0, 0, 0] }) };
    };
    await l.vektorFuer('Strom', 1000);
    await l.vektorFuer('Stromrechnung der Beispiel Energie für März', 1000, 'dokument');
    await l.vektorFuer('Strom', 1000, 'dokument');
    await l.vektorFuer('Strom', 1000, 'suche');
    assert.deepEqual(gesendet, [
      { aktion: 'dms:vektor', text: 'Strom', art: 'suche' },
      { aktion: 'dms:vektor', text: 'Stromrechnung der Beispiel Energie für März', art: 'dokument' },
      { aktion: 'dms:vektor', text: 'Strom', art: 'dokument' },
    ]);
    // Das Modell abfragen (leerer Text) ohne Art – so wie bisher.
    gesendet.length = 0;
    await (x.vektorAnfrage as (t: string, ms: number) => Promise<unknown>).call(l, '', 1000);
    assert.deepEqual(gesendet, [{ aktion: 'dms:vektor', text: '' }]);
  });
});
