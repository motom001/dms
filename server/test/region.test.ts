/** Region der Ablage (#726): Land, Bundesland, Zeitzone an einer Stelle. */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { tagVon } from '../../shared/src/model';
import { istZeitzone, liesRegion, REGION_STANDARD, setzeZeitzone, tagIn, zeitzone } from '../../shared/src/region';
import { heuteIn } from '../../shared/src/sichten';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { RegionDienst } from '../src/region';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

describe('Region (#726)', () => {
  afterEach(() => setzeZeitzone('Europe/Berlin'));

  it('Vorgabe: Deutschland, ohne Bundesland, Europe/Berlin', async () => {
    assert.deepEqual(REGION_STANDARD, { land: 'DE', bundesland: null, zeitzone: 'Europe/Berlin' });
    assert.deepEqual(await new RegionDienst(speicherEinstellungen()).lies(), REGION_STANDARD);
    assert.deepEqual(liesRegion({ land: 'XX', bundesland: 'XX', zeitzone: 'Mond/Krater' }), REGION_STANDARD);
  });

  it('übernimmt das Bundesland der Täglichen Zusammenfassung, solange es keine Region gibt (Update ändert nichts)', async () => {
    const e = speicherEinstellungen();
    await e.schreibe('aufgaben_mail', { aktiv: true, uhrzeit: '07:00', bundesland: 'SN' });
    const r = new RegionDienst(e);
    assert.deepEqual(await r.lies(), { land: 'DE', bundesland: 'SN', zeitzone: 'Europe/Berlin' });
    await r.speichere({ bundesland: 'BY' });
    assert.equal((await r.lies()).bundesland, 'BY');
    await r.speichere({ bundesland: null });
    assert.equal((await r.lies()).bundesland, null, 'kein Rückfall auf das alte Bundesland, sobald die Region gespeichert ist');
  });

  it('prüft Land, Bundesland und Zeitzone', async () => {
    const r = new RegionDienst(speicherEinstellungen());
    await assert.rejects(r.speichere({ land: 'AT' }), status(422));
    await assert.rejects(r.speichere({ bundesland: 'XX' }), status(422));
    await assert.rejects(r.speichere({ zeitzone: 'Europe/Nirgendwo' }), status(422));
    assert.ok(istZeitzone('Europe/Vienna') && !istZeitzone('') && !istZeitzone(7));
    assert.deepEqual(await r.speichere({ zeitzone: 'Europe/Vienna' }), { land: 'DE', bundesland: null, zeitzone: 'Europe/Vienna' });
  });

  it('die Zeitzone gilt für „heute“ und Tage aus Zeitstempeln', async () => {
    const r = new RegionDienst(speicherEinstellungen());
    const spaet = new Date('2026-11-04T23:30:00Z'); // Berlin: 05.11. 00:30, New York: 04.11. 18:30
    assert.equal(heuteIn(spaet), '2026-11-05');
    assert.equal(tagVon(spaet.toISOString()), '05.11.2026');
    await r.speichere({ zeitzone: 'America/New_York' });
    assert.equal(zeitzone(), 'America/New_York');
    assert.equal(heuteIn(spaet), '2026-11-04');
    assert.equal(tagIn(spaet), '2026-11-04');
    assert.equal(tagVon(spaet.toISOString()), '04.11.2026');
    // Ein anderer Server liest die Einstellung beim nächsten Durchlauf.
    setzeZeitzone('Europe/Berlin');
    await r.lade();
    assert.equal(zeitzone(), 'America/New_York');
  });

  it('Feiertage des laufenden Jahres als Vorschau', () => {
    assert.deepEqual(RegionDienst.feiertageIm({ ...REGION_STANDARD }, 2027), []);
    const f = RegionDienst.feiertageIm({ ...REGION_STANDARD, bundesland: 'SN' }, 2027);
    assert.equal(f[0].datum, '2027-01-01');
    assert.ok(f.some((x) => x.datum === '2027-11-17' && x.name === 'Buß- und Bettag'));
    assert.deepEqual(f.map((x) => x.datum), [...f.map((x) => x.datum)].sort());
  });
});
