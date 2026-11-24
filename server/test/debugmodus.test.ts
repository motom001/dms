/**
 * Debug-Modus über Neustarts und Prozesse (#1528): `LOG_LEVEL=debug` mit Zeitpunkt in der Datenbank, Ende nach 24
 * Stunden mit Hinweis, neu beginnen nach erneutem Setzen; Schalter der Werkbank übersteht den Neustart eines Prozesses.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { DEBUG_DAUER_MS, protokoll } from '../src/protokoll/protokoll';
import { debugAbgleich, debugWerkbank } from '../src/protokoll/debugmodus';

// Ab jetzt: Das Protokoll vergleicht die Fristen mit der echten Uhr.
const T0 = Date.now();
const STUNDE = 3600_000;
/** Ein frisch gestarteter Prozess: Stufe aus der Umgebung, nichts aus der Datenbank. */
const neuerProzess = (env: NodeJS.ProcessEnv) =>
  protokoll.wendeDebugAn({ grund: env.LOG_LEVEL === 'debug' ? 'debug' : 'info', werkbankBis: 0, variable: null });

describe('Debug-Modus (#1528)', () => {
  afterEach(() => protokoll.wendeDebugAn({ grund: 'info', werkbankBis: 0, variable: null }));

  it('LOG_LEVEL=debug: ab der ersten Zeile, Zeitpunkt in der Datenbank, nach 24 Stunden aus mit Hinweis; neu setzen beginnt von vorn', async () => {
    assert.equal(DEBUG_DAUER_MS, 24 * STUNDE);
    const e = speicherEinstellungen();
    const env = { LOG_LEVEL: 'debug' };
    neuerProzess(env);
    assert.equal(protokoll.stufe, 'debug', 'vor der Datenbank: Stufe aus der Variable');
    let d = await debugAbgleich(e, env, T0);
    assert.deepEqual([d.an, d.quelle, d.bis], [true, 'variable', new Date(T0 + 24 * STUNDE).toISOString()]);
    // Neustart eines Prozesses 10 Stunden später: dieselbe Frist, nicht von vorn.
    neuerProzess(env);
    d = await debugAbgleich(e, env, T0 + 10 * STUNDE);
    assert.equal(d.bis, new Date(T0 + 24 * STUNDE).toISOString());
    // Nach 24 Stunden: info, mit Hinweis – auch wenn die Variable noch gesetzt ist.
    d = await debugAbgleich(e, env, T0 + 24 * STUNDE + 1);
    assert.deepEqual([d.an, protokoll.stufe, d.grundstufe], [false, 'info', 'info']);
    assert.ok(d.variableBeendet);
    neuerProzess(env);
    await debugAbgleich(e, env, T0 + 30 * STUNDE);
    assert.equal(protokoll.stufe, 'info', 'ein neuer Prozess bleibt nach Ablauf auf info');
    // Variable entfernt, später wieder gesetzt: 24 Stunden von vorn.
    await debugAbgleich(e, {}, T0 + 31 * STUNDE);
    assert.equal(await e.lies('debug_variable'), null);
    d = await debugAbgleich(e, env, T0 + 40 * STUNDE);
    assert.deepEqual([d.an, d.quelle, d.bis], [true, 'variable', new Date(T0 + 64 * STUNDE).toISOString()]);
  });

  it('Schalter der Werkbank: übersteht den Neustart eines Prozesses, endet nach 24 Stunden', async () => {
    const e = speicherEinstellungen();
    await debugWerkbank(e, true, 'lena@example.org', T0);
    neuerProzess({});
    assert.equal(protokoll.stufe, 'info');
    let d = await debugAbgleich(e, {}, T0 + STUNDE);
    assert.deepEqual([d.an, d.quelle, protokoll.stufe], [true, 'werkbank', 'debug']);
    d = await debugAbgleich(e, {}, T0 + 24 * STUNDE + 1);
    assert.deepEqual([d.an, protokoll.stufe], [false, 'info']);
    assert.equal(await e.lies('debug_werkbank'), null);
  });

  it('„Ausschalten“ in der Werkbank beendet auch LOG_LEVEL=debug', async () => {
    const e = speicherEinstellungen();
    const env = { LOG_LEVEL: 'debug' };
    await debugAbgleich(e, env, T0);
    await debugWerkbank(e, false, 'lena@example.org', T0 + STUNDE);
    const d = await debugAbgleich(e, env, T0 + STUNDE);
    assert.deepEqual([d.an, protokoll.stufe], [false, 'info']);
  });
});
