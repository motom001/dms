/**
 * Protokoll der Werkbank mit zwei Prozessen (#1490): Die Werkbank zeigt die Einträge aller Prozesse, nach Zeit gemischt,
 * jeder mit seinem Prozess; „nur neue“ (Live) nimmt je Prozess den eigenen Stand; der Debug-Modus gilt für alle;
 * Meldungen des Paket-Läufers stehen im Modul „pakete“. Mit einem Prozess bleibt die Antwort wie bisher.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';
import { MODULE } from '../../shared/src/protokollmodule';
import { protokollStand, seitFuer, setzeDebugAlle, type ProtokollStand } from '../src/protokoll/alleprozesse';
import { protokoll } from '../src/protokoll/protokoll';
import { einzeln } from '../src/prozesse/prozesse';

const SERVER = new URL('..', import.meta.url).pathname;

describe('Protokoll aller Prozesse (#1490)', () => {
  it('seit: Zahl mit einem Prozess, je Prozess-Id mit mehreren', () => {
    assert.equal(seitFuer('17', 4711), 17);
    assert.equal(seitFuer('4711:5,4712:9', 4712), 9);
    assert.equal(seitFuer('4711:5,4712:9', 9999), undefined, 'neu gestarteter Prozess: alles');
    assert.equal(seitFuer(undefined, 1), undefined);
  });

  it('ein Prozess: Antwort wie bisher – ohne Prozessnummer, letzte als Zahl', async () => {
    protokoll.modul('system').warn('Ein Prozess: Meldung');
    const s = await protokollStand(einzeln(), { max: 5 });
    assert.equal(typeof s.letzte, 'number');
    assert.equal(s.letzte, protokoll.letzteNr);
    assert.ok(s.eintraege.length > 0);
    assert.ok(s.eintraege.every((e) => e.prozess === undefined));
    const vorher = protokoll.letzteNr;
    protokoll.modul('system').warn('Ein Prozess: danach');
    assert.deepEqual(
      (await protokollStand(undefined, {}, String(vorher))).eintraege.map((e) => e.text),
      ['Ein Prozess: danach'],
    );
    const d = await setzeDebugAlle(einzeln(), true);
    assert.equal(d.an, true);
    assert.equal(protokoll.debugAn, true);
    await setzeDebugAlle(einzeln(), false);
    assert.equal(protokoll.debugAn, false);
  });

  it('Modul „pakete“ im Filter', () => {
    assert.ok((MODULE as readonly string[]).includes('pakete'));
  });

  it('zwei Prozesse: alle Einträge gemischt mit Prozess, „nur neue“ je Prozess, Debug-Modus überall', { timeout: 60_000 }, async () => {
    const { NODE_TEST_CONTEXT: _t, ...env } = process.env;
    const p = spawn(process.execPath, ['--import', 'tsx', 'test/hilfen-prozesse-protokoll.ts'], {
      cwd: SERVER,
      env: { ...env, LOG_LEVEL: 'warn' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const zeilen: Array<Record<string, unknown>> = [];
    let rest = '',
      fehler = '';
    p.stdout.on('data', (d: Buffer) => {
      rest += d.toString();
      const teile = rest.split('\n');
      rest = teile.pop()!;
      for (const z of teile) if (z.startsWith('{')) zeilen.push(JSON.parse(z));
    });
    p.stderr.on('data', (d: Buffer) => {
      fehler += d.toString();
    });
    try {
      for (let i = 0; i < 400 && !zeilen.some((z) => z.art === 'debug'); i++) await new Promise((r) => setTimeout(r, 50));
      const zeile = <T>(art: string) => {
        const z = zeilen.find((x) => x.art === art);
        assert.ok(z, `${art} fehlt: ${JSON.stringify(zeilen)}\n${fehler}`);
        return z as T;
      };
      const { stand } = zeile<{ stand: ProtokollStand }>('stand');
      const texte = stand.eintraege.map((e) => [e.prozess, e.modul, e.text]);
      for (const erwartet of [
        [1, 'system', 'Meldung aus Prozess 1'],
        [1, 'pakete', 'Paket rechnungen: Aufruf fehlgeschlagen'],
        [2, 'system', 'Meldung aus Prozess 2'],
        [2, 'system', 'Zweite Meldung aus Prozess 2'],
      ])
        assert.ok(
          texte.some((x) => JSON.stringify(x) === JSON.stringify(erwartet)),
          `${JSON.stringify(erwartet)} fehlt: ${JSON.stringify(texte)}`,
        );
      const zeiten = stand.eintraege.map((e) => e.zeit);
      assert.deepEqual(zeiten, [...zeiten].sort().reverse(), 'neueste zuerst, über beide Prozesse');
      assert.equal(stand.eintraege[0].text, 'Zweite Meldung aus Prozess 2');
      assert.match(String(stand.letzte), /^\d+:\d+,\d+:\d+$/);
      assert.equal(stand.gespeichert, stand.eintraege.length, 'gespeichert über beide Prozesse');
      assert.equal(stand.jeModul.pakete, 1);
      const { neu } = zeile<{ neu: ProtokollStand }>('neu');
      assert.deepEqual(
        neu.eintraege.map((e) => [e.prozess, e.text]),
        [[1, 'Neu im Leiter']],
        'nur neue: je Prozess ab seinem Stand',
      );
      const { pakete } = zeile<{ pakete: ProtokollStand }>('pakete');
      assert.deepEqual(
        pakete.eintraege.map((e) => [e.prozess, e.text]),
        [[1, 'Paket rechnungen: Aufruf fehlgeschlagen']],
      );
      const d = zeile<{ debug: { an: boolean; bis: string | null }; alle: boolean[] }>('debug');
      assert.equal(d.debug.an, true);
      assert.ok(d.debug.bis);
      assert.deepEqual(d.alle, [true, true], 'Debug-Modus in beiden Prozessen');
    } finally {
      p.kill('SIGTERM');
      await new Promise((r) => (p.exitCode !== null ? r(null) : p.once('exit', r)));
    }
  });
});
