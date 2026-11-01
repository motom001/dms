/** Hintergrundaufträge mit Phase und Einheit (#364). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fortschrittText, meldeFortschritt, neuerStand } from '../../shared/src/auftrag';
import { Auftraege } from '../src/auftrag';
import { ladeBeispiele } from '../src/beispiele';
import { speicherDateien } from '../src/dateispeicher';
import { demoPhasen, erzeugeDemo } from '../src/demo';
import { Dienst } from '../src/dienst';
import { speicherRepo } from '../src/repo-speicher';

describe('Auftragsstatus mit Phasen (#364)', () => {
  it('zählt je Phase, die Summe bleibt in fertig/gesamt', () => {
    const a = neuerStand(demoPhasen(true));
    assert.equal(a.phase, 'mappen');
    assert.deepEqual(a.phasen.map((p) => p.status), ['laeuft', 'wartet']);
    assert.equal(fortschrittText(a), 'Mappen anlegen: wird ermittelt … · Dokumente erzeugen: folgt');
    meldeFortschritt(a, 500, 1000, 'mappen');
    assert.equal(fortschrittText(a), 'Mappen anlegen: 500 von 1.000 · Dokumente erzeugen: folgt');
    meldeFortschritt(a, 1000, 1000, 'mappen');
    meldeFortschritt(a, 1326, 1907, 'dokumente');
    assert.equal(a.phase, 'dokumente');
    assert.deepEqual(a.phasen.map((p) => p.status), ['fertig', 'laeuft']);
    assert.equal(fortschrittText(a), 'Mappen anlegen: 1.000 von 1.000 ✓ · Dokumente erzeugen: 1.326 von 1.907');
    // Alte Felder für die API: Summe über alle Phasen.
    assert.deepEqual([a.fertig, a.gesamt], [2326, 2907]);
    // Ohne Phasenangabe zählt die laufende Phase weiter.
    meldeFortschritt(a, 1400, 1907);
    assert.equal(a.phasen[1].fertig, 1400);
  });

  it('ohne Phasen wie früher, mit Einheit aus der Oberfläche', () => {
    const a = neuerStand([]);
    meldeFortschritt(a, 3, 10);
    assert.deepEqual([a.fertig, a.gesamt, a.phasen.length], [3, 10, 0]);
    assert.equal(fortschrittText(a, 'Dateien'), '3 von 10 Dateien');
    assert.equal(fortschrittText({ fertig: 1200, gesamt: 2000 }), '1.200 von 2.000');
  });

  it('Auftraege: Phasen laufen mit und sind am Ende fertig', async () => {
    const q = new Auftraege();
    let weiter!: () => void;
    const halt = new Promise<void>((r) => { weiter = r; });
    const a = q.starte('test', 'Test', async (f) => {
      f(2, 2, 'eins');
      f(1, 4, 'zwei');
      await halt;
      f(4, 4);
      return 'ok';
    }, [{ key: 'eins', name: 'Eins zählen', einheit: 'Dinge' }, { key: 'zwei', name: 'Zwei zählen', einheit: 'Sachen' }]);
    assert.equal(a.status, 'laeuft');
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(q.aktuell()!.phase, 'zwei');
    assert.equal(fortschrittText(q.aktuell()!), 'Eins zählen: 2 von 2 ✓ · Zwei zählen: 1 von 4');
    weiter();
    const b = (await q.warte())!;
    assert.equal(b.status, 'fertig');
    assert.equal(b.phase, undefined);
    assert.deepEqual(b.phasen.map((p) => [p.status, p.einheit, p.fertig, p.gesamt]), [['fertig', 'Dinge', 2, 2], ['fertig', 'Sachen', 4, 4]]);
    assert.deepEqual([b.fertig, b.gesamt], [6, 6]);
  });

  it('Demo-Daten: Mappen passen zur Eingabe, Dokumente zählen eigens', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await ladeBeispiele(d);
    const o = { anzahl: 40, startwert: 'phasen', dokumente: { anteil: 100, von: 1, bis: 2, mischung: { brief: 100, mehrseitig: 0, scan: 0, bild: 0, gross: 0 }, duplikate: 0 } };
    const zwischen: string[] = [];
    d.auftraege.starte('demo-erzeugen', 'Demo', (f) => erzeugeDemo(d, o, null, (x, y, p) => { f(x, y, p); zwischen.push(fortschrittText(d.auftraege.aktuell()!)); }), demoPhasen(true));
    const a = (await d.auftraege.warte())!;
    assert.equal(a.status, 'fertig', a.fehler ?? '');
    const r = a.ergebnis as { gesamt: number; dokumente: { anzahl: number } };
    const [mappen, dokumente] = a.phasen;
    assert.deepEqual([mappen.einheit, mappen.gesamt, mappen.fertig], ['Mappen', 40, r.gesamt]);
    assert.deepEqual([dokumente.einheit, dokumente.fertig, dokumente.gesamt], ['Dokumente', r.dokumente.anzahl, r.dokumente.anzahl]);
    assert.ok(zwischen.some((t) => /^Mappen anlegen: \d+ von 40 · Dokumente erzeugen: folgt$/.test(t)), zwischen.join('\n'));
    assert.ok(zwischen.some((t) => /^Mappen anlegen: \d+ von 40 ✓ · Dokumente erzeugen: \d+ von \d+$/.test(t)), zwischen.join('\n'));

    // Ohne Dokumente nur eine Phase.
    d.auftraege.starte('demo-erzeugen', 'Demo', (f) => erzeugeDemo(d, { anzahl: 15 }, null, f), demoPhasen(false));
    const b = (await d.auftraege.warte())!;
    assert.equal(fortschrittText(b), 'Mappen anlegen: 15 von 15 ✓');
  });
});
