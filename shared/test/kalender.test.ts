/** Kalender in „Zu erledigen“ (#528, #725): Rechnen mit Tagen, Wochen, Monaten und Folgeterminen. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feiertageZwischen } from '../../shared/src/feiertage';
import { folgetermine } from '../../shared/src/fristen';
import { blaettere, istTag, jahresZeitraum, monatsende, monatsraster, monatsZeitraum, montag, tageZwischen, ueberfaelligSeit, wochentag, zeitraumProblem } from '../../shared/src/kalender';

describe('Kalender (#528)', () => {
  it('Tage, Wochentage, Monate', () => {
    assert.ok(istTag('2028-02-29') && !istTag('2027-02-29') && !istTag('2027-13-01') && !istTag('27-01-01') && !istTag(null));
    assert.equal(tageZwischen('2026-12-30', '2027-01-02'), 3);
    assert.equal(tageZwischen('2027-01-02', '2026-12-30'), -3);
    assert.equal(wochentag('2026-11-02'), 1); // Montag
    assert.equal(wochentag('2026-11-08'), 7); // Sonntag
    assert.equal(montag('2026-11-08'), '2026-11-02');
    assert.equal(blaettere('2026-12', 1), '2027-01');
    assert.equal(blaettere('2026-01', -1), '2025-12');
    assert.equal(monatsende('2028-02'), '2028-02-29');
  });

  it('Monatsraster von Montag bis Sonntag, 4–6 Wochen', () => {
    // Februar 2027 beginnt an einem Montag und hat 28 Tage: genau vier Wochen.
    assert.equal(monatsraster('2027-02').length, 4);
    // November 2026: 1. ist ein Sonntag → Raster ab 26.10., sechs Wochen bis 06.12.
    const r = monatsraster('2026-11');
    assert.equal(r.length, 6);
    assert.deepEqual([r[0][0], r[5][6]], ['2026-10-26', '2026-12-06']);
    assert.ok(r.every((w) => w.length === 7 && wochentag(w[0]) === 1));
    assert.deepEqual(monatsZeitraum('2026-11'), { von: '2026-10-26', bis: '2026-12-06' });
    assert.deepEqual(jahresZeitraum(2027), { von: '2027-01-01', bis: '2027-12-31' });
  });

  it('Zeitraum prüfen', () => {
    assert.equal(zeitraumProblem('2027-01-01', '2027-12-31'), null);
    assert.equal(zeitraumProblem('2028-01-01', '2028-12-31'), null); // Schaltjahr
    assert.match(zeitraumProblem('2027-01-01', undefined)!, /von.*bis/);
    assert.match(zeitraumProblem('2027-02-01', '2027-01-01')!, /vor/);
    assert.match(zeitraumProblem('2027-01-01', '2028-02-05')!, /400 Tage/);
  });

  it('„überfällig seit“', () => {
    const heute = '2026-11-04';
    assert.equal(ueberfaelligSeit('2026-10-23', heute), 12);
    assert.equal(ueberfaelligSeit('2026-11-05', heute), 0);
  });

  it('Folgetermine wiederkehrender Fristen, vom Datum aus gerechnet', () => {
    assert.deepEqual(folgetermine('2026-01-31', 1, '2026-01-01', '2026-05-31'), ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    assert.deepEqual(folgetermine('2024-02-29', 12, '2026-11-02', '2028-12-31'), ['2027-02-28', '2028-02-29']);
    assert.deepEqual(folgetermine('2026-06-15', 3, '2026-06-15', '2027-01-01'), ['2026-09-15', '2026-12-15']);
    assert.deepEqual(folgetermine('2030-01-01', 12, '2026-01-01', '2027-01-01'), []);
    assert.deepEqual(folgetermine('2026-01-01', 0, '2026-01-01', '2027-01-01'), []);
  });

  it('Feiertage im Zeitraum, auch über den Jahreswechsel', () => {
    assert.deepEqual(feiertageZwischen('2026-12-20', '2027-01-07', 'BY'), { '2026-12-25': '1. Weihnachtstag', '2026-12-26': '2. Weihnachtstag', '2027-01-01': 'Neujahr', '2027-01-06': 'Heilige Drei Könige' });
    assert.deepEqual(feiertageZwischen('2026-12-20', '2027-01-07', null), {});
  });
});
