/** Hinweis „Umgebungsvariable nicht mehr nötig“ mit Grund je Variable (#478). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ueberfluessigeVariablen, variablenHinweis, VARIABLEN_GRUND } from '../../shared/src/umgebungsvariablen';

describe('Überflüssige Umgebungsvariablen (#478)', () => {
  it('nichts zu tun: kein Hinweis', () => {
    assert.deepEqual(ueberfluessigeVariablen({}), []);
    assert.equal(variablenHinweis([]), null);
  });

  it('nur eine Ordner-Variable: Grund feste Ordner, „die Variable“, zur Technik', () => {
    const v = ueberfluessigeVariablen({ ordner: ['DMS_DATEIEN'] });
    assert.deepEqual(v, [{ name: 'DMS_DATEIEN', art: 'ordner', grund: VARIABLEN_GRUND.ordner }]);
    const h = variablenHinweis(v)!;
    assert.match(h.zeilen[0].grund, /Ordner im Container sind fest/);
    assert.equal(h.schluss, 'Entferne die Variable beim nächsten Update aus der Compose-Datei.');
    assert.equal(h.ziel, '/werkbank/technik');
  });

  it('nur DATABASE_URL: Grund Datei, nicht „Ordner“, Knopf zur Anbindung', () => {
    const v = ueberfluessigeVariablen({ datenbank: true });
    assert.deepEqual(v.map((x) => x.name), ['DATABASE_URL']);
    const h = variablenHinweis(v)!;
    assert.equal(h.zeilen[0].grund, 'die Datenbank-Anbindung steht jetzt in einer Datei im Datenordner');
    assert.doesNotMatch(h.zeilen[0].grund, /Ordner im Container/);
    assert.match(h.schluss, /^Entferne die Variable /);
    assert.equal(h.ziel, '/werkbank/anbindung');
    assert.equal(h.knopf, 'Zur Anbindung');
  });

  it('nur HAUSHALT_ID: Grund Kennung gespeichert', () => {
    const h = variablenHinweis(ueberfluessigeVariablen({ haushalt: true }))!;
    assert.deepEqual(h.zeilen, [{ name: 'HAUSHALT_ID', grund: 'die Kennung des Haushalts ist gespeichert' }]);
    assert.match(h.schluss, /^Entferne die Variable /);
    assert.equal(h.ziel, '/werkbank/technik');
  });

  it('gemischt: Grund je Zeile, feste Reihenfolge, „diese Variablen“', () => {
    const v = ueberfluessigeVariablen({ ordner: ['DMS_DATEIEN', 'DMS_SICHERUNG'], datenbank: true, haushalt: true });
    assert.deepEqual(v.map((x) => [x.name, x.art]), [['DMS_DATEIEN', 'ordner'], ['DMS_SICHERUNG', 'ordner'], ['DATABASE_URL', 'datenbank'], ['HAUSHALT_ID', 'haushalt']]);
    const h = variablenHinweis(v)!;
    assert.equal(h.zeilen.length, 4);
    assert.match(h.zeilen[2].grund, /Datenbank-Anbindung/);
    assert.match(h.zeilen[3].grund, /Kennung des Haushalts/);
    assert.equal(h.schluss, 'Entferne diese Variablen beim nächsten Update aus der Compose-Datei.');
    assert.doesNotMatch(h.schluss, /\bsie\b/);
    assert.equal(h.ziel, '/werkbank/technik');
  });
});
