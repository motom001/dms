/** Feiertage (#94): Ostern nach Gauß, Buß- und Bettag, Feiertage je Bundesland. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDESLAENDER, bussUndBettag, feiertagAm, feiertage, ostersonntag, type Bundesland } from '../../shared/src/feiertage';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('Feiertage (#94)', () => {
  it('berechnet Ostern für viele Jahre richtig (auch die Sonderfälle der Formel)', () => {
    const bekannt: Record<number, string> = {
      1954: '1954-04-18', 1981: '1981-04-19', 2000: '2000-04-23', 2008: '2008-03-23', 2011: '2011-04-24', 2019: '2019-04-21',
      2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16', 2038: '2038-04-25', 2049: '2049-04-18',
    };
    for (const [j, d] of Object.entries(bekannt)) assert.equal(iso(ostersonntag(Number(j))), d, j);
  });

  it('legt den Buß- und Bettag auf den Mittwoch vor dem 23. November', () => {
    assert.deepEqual([2022, 2023, 2024, 2025, 2026, 2027].map((j) => iso(bussUndBettag(j))),
      ['2022-11-16', '2023-11-22', '2024-11-20', '2025-11-19', '2026-11-18', '2027-11-17']);
  });

  it('kennt die landesweiten Feiertage je Bundesland', () => {
    const n = (l: Bundesland, j = 2026) => feiertage(j, l).size;
    assert.equal(n('BY'), 12); assert.equal(n('BW'), 12); assert.equal(n('NW'), 11); assert.equal(n('SL'), 12);
    assert.equal(n('BE'), 10, 'Frauentag'); assert.equal(n('HE'), 10, 'Fronleichnam'); assert.equal(n('SN'), 11, 'Reformationstag, Buß- und Bettag');
    assert.equal(n('TH'), 11, 'Weltkindertag, Reformationstag'); assert.equal(n('BB'), 12, 'mit Oster- und Pfingstsonntag');
    for (const l of Object.keys(BUNDESLAENDER) as Bundesland[]) assert.ok(n(l) >= 10, l);
    assert.equal(feiertagAm('2026-06-04', 'BY'), 'Fronleichnam');
    assert.equal(feiertagAm('2026-06-04', 'NI'), null);
    assert.equal(feiertagAm('2026-04-03', 'HH'), 'Karfreitag');
    assert.equal(feiertagAm('2026-10-31', 'HH'), 'Reformationstag');
    assert.equal(feiertagAm('2017-10-31', 'BY'), 'Reformationstag', '500 Jahre Reformation: bundesweit');
    assert.equal(feiertagAm('2016-10-31', 'HH'), null);
    assert.equal(feiertagAm('2022-03-08', 'MV'), null); assert.equal(feiertagAm('2023-03-08', 'MV'), 'Internationaler Frauentag');
    assert.equal(feiertagAm('2026-08-15', 'BY'), null, 'nur in Teilen Bayerns');
    assert.equal(feiertagAm('2026-11-18', 'SN'), 'Buß- und Bettag');
    assert.equal(feiertagAm('2026-12-25', null), null, 'ohne Bundesland keine Feiertage');
  });
});
