/** Hinweis „Umgebungsvariable nicht mehr nötig“ mit Grund je Variable (#478). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ueberfluessigeVariablen, variablenHinweis, VARIABLEN_GRUND } from '../../shared/src/umgebungsvariablen';
import { AnbindungVerwaltung, ausUrl, datenbankVomImage, umgebungAusCompose } from '../src/anbindung';

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
    assert.equal(h.ziel, '/werkbank/systemzustand#version');
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
    assert.deepEqual(h.zeilen, [{ name: 'HAUSHALT_ID', grund: 'die Ablage-Id ist gespeichert' }]);
    assert.match(h.schluss, /^Entferne die Variable /);
    assert.equal(h.ziel, '/werkbank/systemzustand#version');
  });

  it('gemischt: Grund je Zeile, feste Reihenfolge, „diese Variablen“', () => {
    const v = ueberfluessigeVariablen({ ordner: ['DMS_DATEIEN', 'DMS_SICHERUNG'], datenbank: true, haushalt: true });
    assert.deepEqual(v.map((x) => [x.name, x.art]), [['DMS_DATEIEN', 'ordner'], ['DMS_SICHERUNG', 'ordner'], ['DATABASE_URL', 'datenbank'], ['HAUSHALT_ID', 'haushalt']]);
    const h = variablenHinweis(v)!;
    assert.equal(h.zeilen.length, 4);
    assert.match(h.zeilen[2].grund, /Datenbank-Anbindung/);
    assert.match(h.zeilen[3].grund, /Ablage-Id ist gespeichert/);
    assert.equal(h.schluss, 'Entferne diese Variablen beim nächsten Update aus der Compose-Datei.');
    assert.doesNotMatch(h.schluss, /\bsie\b/);
    assert.equal(h.ziel, '/werkbank/systemzustand#version');
  });
});

/**
 * #805: dms-komplett setzt DATABASE_URL im Start-Skript selbst. Der Hinweis „nicht mehr nötig“ darf nur kommen,
 * wenn die Variable wirklich in der Compose-Datei steht. Geprüft wird der echte Abschnitt aus start.sh.
 */
describe('DATABASE_URL vom Image oder aus der Compose-Datei (#805)', () => {
  const INTERN = 'postgres://dms@127.0.0.1:5432/dms';
  const skript = readFileSync(join(import.meta.dirname, '../../deploy/komplett/start.sh'), 'utf8');
  const abschnitt = skript.slice(skript.indexOf('# anfang-datenbank-variable'), skript.indexOf('# ende-datenbank-variable'));

  /** Umgebung, die Ablago nach start.sh sieht; `compose` sind die Variablen aus der Compose-Datei. */
  function nachStartSkript(compose: Record<string, string>): Record<string, string | undefined> {
    const aus = execFileSync('sh', ['-c', `set -eu\n${abschnitt}\nenv`], { env: { PATH: process.env.PATH, DMS_VARIANTE: 'komplett', ...compose }, encoding: 'utf8' });
    return Object.fromEntries(aus.split('\n').filter((z) => z.includes('=')).map((z) => [z.slice(0, z.indexOf('=')), z.slice(z.indexOf('=') + 1)]));
  }

  /** Was die Werkbank-Übersicht zu DATABASE_URL meldet (wie in werkbank/werkbank.routen.ts). */
  function hinweis(env: Record<string, string | undefined>, laufend = ausUrl(INTERN)!) {
    const variante = process.env.DMS_VARIANTE;
    try {
      if (env.DMS_VARIANTE) process.env.DMS_VARIANTE = env.DMS_VARIANTE; else delete process.env.DMS_VARIANTE;
      const v = new AnbindungVerwaltung('/gibt-es-nicht', laufend, umgebungAusCompose(env, ausUrl(env.DATABASE_URL)), () => {});
      const umgebung = v.stand().umgebung;
      return { umgebung, variablen: ueberfluessigeVariablen({ datenbank: umgebung === 'gleich' }).map((x) => x.name) };
    } finally {
      if (variante === undefined) delete process.env.DMS_VARIANTE; else process.env.DMS_VARIANTE = variante;
    }
  }

  it('Abschnitt im Start-Skript gefunden, DATABASE_URL zeigt auf die Datenbank im Container', () => {
    assert.match(abschnitt, /export DATABASE_URL=/);
    assert.equal(nachStartSkript({}).DATABASE_URL, INTERN);
  });

  it('dms-komplett mit minimaler Compose-Datei: Variable vom Image, kein Hinweis', () => {
    const env = nachStartSkript({ DMS_EINRICHTUNGSCODE: '123456' });
    assert.equal(env.DMS_DATENBANK_VOM_IMAGE, '1');
    assert.equal(datenbankVomImage(env), true);
    assert.deepEqual(hinweis(env), { umgebung: 'fehlt', variablen: [] });
  });

  it('dms-komplett, Anbindung später geändert: auch kein „weicht ab“ wegen der Variable vom Image', () => {
    const env = nachStartSkript({});
    assert.equal(hinweis(env, { ...ausUrl(INTERN)!, host: 'db.example.org' }).umgebung, 'fehlt');
  });

  it('dms-komplett mit DATABASE_URL in der Compose-Datei: Hinweis wie bisher', () => {
    const env = nachStartSkript({ DATABASE_URL: INTERN });
    assert.equal(env.DMS_DATENBANK_VOM_IMAGE, undefined);
    assert.equal(datenbankVomImage(env), false);
    assert.deepEqual(hinweis(env), { umgebung: 'gleich', variablen: ['DATABASE_URL'] });
  });

  it('dms-komplett: eine Kennzeichnung aus der Compose-Datei hebelt den Hinweis nicht aus', () => {
    const env = nachStartSkript({ DATABASE_URL: INTERN, DMS_DATENBANK_VOM_IMAGE: '1' });
    assert.equal(env.DMS_DATENBANK_VOM_IMAGE, undefined);
    assert.deepEqual(hinweis(env).variablen, ['DATABASE_URL']);
  });

  it('Image dms: DATABASE_URL steht immer in der Compose-Datei, Hinweis wie bisher', () => {
    const url = 'postgres://dms:geheim@db:5432/dms';
    assert.deepEqual(hinweis({ DATABASE_URL: url }, ausUrl(url)!), { umgebung: 'gleich', variablen: ['DATABASE_URL'] });
    assert.equal(hinweis({ DATABASE_URL: url }, { ...ausUrl(url)!, host: 'anders' }).umgebung, 'abweichend');
    // Die Kennzeichnung gilt nur für dms-komplett.
    assert.equal(datenbankVomImage({ DATABASE_URL: url, DMS_DATENBANK_VOM_IMAGE: '1' }), false);
    assert.deepEqual(hinweis({ DATABASE_URL: url, DMS_DATENBANK_VOM_IMAGE: '1' }, ausUrl(url)!).variablen, ['DATABASE_URL']);
    assert.deepEqual(hinweis({}, ausUrl(url)!), { umgebung: 'fehlt', variablen: [] });
  });
});
