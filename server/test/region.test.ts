/** Region der Ablage (#726): Land, Bundesland, Zeitzone an einer Stelle. */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { formatiere, tagVon, type Feld } from '../../shared/src/model';
import {
  datumsformat,
  istZeitzone,
  liesRegion,
  REGION_STANDARD,
  setzeZeitzone,
  tagIn,
  zahlformat,
  zeitText,
  zeitzone,
} from '../../shared/src/region';
import { heuteIn } from '../../shared/src/sichten';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { RegionDienst } from '../src/einstellungen/region';

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
    assert.deepEqual(
      f.map((x) => x.datum),
      [...f.map((x) => x.datum)].sort(),
    );
  });

  it('Formate gemerkt (#970): dasselbe Format je Sprache und Optionen, Ausgabe wie toLocaleString', () => {
    assert.equal(zahlformat('de-DE', { maximumFractionDigits: 2 }), zahlformat('de-DE', { maximumFractionDigits: 2 }));
    assert.notEqual(zahlformat('de-DE', { maximumFractionDigits: 2 }), zahlformat('en-GB', { maximumFractionDigits: 2 }));
    assert.equal(
      zahlformat('de-DE', { maximumFractionDigits: 10 }).format(1234.5),
      (1234.5).toLocaleString('de-DE', { maximumFractionDigits: 10 }),
    );
    assert.throws(() => zahlformat('de-DE', { style: 'currency', currency: 'XX1' }));
    const d = new Date('2026-11-15T23:30:00Z');
    assert.equal(
      datumsformat('de-DE', { dateStyle: 'short', timeStyle: 'short' }),
      datumsformat('de-DE', { dateStyle: 'short', timeStyle: 'short' }),
    );
    assert.equal(
      datumsformat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(d),
      d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }),
    );
    // Feste Zeitzone (Kalendertage in UTC) und Wechsel der eingestellten Zone ergeben je ein eigenes Format.
    assert.equal(datumsformat('de-DE', {}, 'UTC').format(d), '15.11.2026');
    setzeZeitzone('America/New_York');
    assert.equal(
      datumsformat('de-DE', { hour: '2-digit' }).format(d),
      d.toLocaleString('de-DE', { timeZone: 'America/New_York', hour: '2-digit' }),
    );
    const feld = (f: Partial<Feld>) => ({ key: 'x', label: 'X', typ: 'text', ...f }) as Feld;
    assert.equal(formatiere(feld({ typ: 'datum' }), '2026-11-15'), '15.11.2026');
    assert.equal(
      formatiere(feld({ typ: 'betrag' }), { betrag: 12.5, waehrung: 'EUR' }),
      (12.5).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }),
    );
  });

  it('zeitText (#1335): wie Date.toLocaleString in der eingestellten Zone, aber mit gemerktem Format', () => {
    const zeiten = [new Date('2026-11-15T23:30:05Z'), new Date('2026-03-29T00:59:59Z'), new Date('2026-07-01T12:00:00.250Z')];
    const faelle: Array<[string, Intl.DateTimeFormatOptions]> = [
      ['sv-SE', {}],
      ['de-DE', {}],
      ['en-GB', {}],
      ['de-DE', { dateStyle: 'short', timeStyle: 'short' }],
      ['de-DE', { dateStyle: 'long', timeStyle: 'short' }],
      ['de-DE', { weekday: 'long' }],
      ['de-DE', { hour: '2-digit', minute: '2-digit' }],
      // Zeitzonenname und Ära legen kein Datum fest: wie toLocaleString mit Datum und Uhrzeit.
      ['de-DE', { timeZoneName: 'short' }],
      ['en-US', { era: 'short' }],
    ];
    for (const zone of ['Europe/Berlin', 'America/New_York']) {
      setzeZeitzone(zone);
      for (const d of zeiten)
        for (const [sprache, o] of faelle)
          assert.equal(
            zeitText(d, o, sprache),
            d.toLocaleString(sprache, { ...o, timeZone: zone }),
            `${zone} ${sprache} ${JSON.stringify(o)}`,
          );
    }
    assert.equal(zeitText(zeiten[0], {}, 'de-DE'), zeitText(zeiten[0], {}, 'de-DE'));
  });
});
