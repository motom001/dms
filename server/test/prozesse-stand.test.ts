/**
 * Mehrere Prozesse (#1341): Den Stand von Probe-Wiederherstellung und Sicherung hält nur der Leiter. Gestartet über
 * Prozess 2 läuft der Lauf genau einmal im Leiter; Abfragen abwechselnd über beide Prozesse zeigen bis „fertig“ immer
 * denselben Stand – auch gleich nach dem Start, bevor der Leiter seinen Spiegel (jede Sekunde) verteilt hat.
 * Eingangsordner und Datenbank-Anbindung, gespeichert über Prozess 2: neu geplant nur im Leiter, „Neustart nötig“ überall.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const SERVER = new URL('..', import.meta.url).pathname;
const ORDNER = mkdtempSync(join(tmpdir(), 'dms-1341-'));
mkdirSync(join(ORDNER, 'eingang'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

describe('Stand der Läufe im Leiter, aus jedem Prozess (#1341)', () => {
  it('Start über Prozess 2, Abfragen abwechselnd, derselbe Stand bis „fertig“; Eingangsordner und Anbindung', { timeout: 60_000 }, async () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const p = spawn(process.execPath, ['--import', 'tsx', 'test/hilfen-prozesse-stand.ts'], { cwd: SERVER, env: { ...env, LOG_LEVEL: 'warn', DMS_TEST_ORDNER: ORDNER }, stdio: ['ignore', 'pipe', 'pipe'] });
    const zeilen: Array<{ art: string; nr: number; leiter: boolean; port: number }> = [];
    let rest = '', fehler = '';
    p.stdout.on('data', (d: Buffer) => {
      rest += d.toString();
      const teile = rest.split('\n'); rest = teile.pop()!;
      for (const z of teile) if (z.startsWith('{')) zeilen.push(JSON.parse(z));
    });
    p.stderr.on('data', (d: Buffer) => { fehler += d.toString(); });
    try {
      for (let i = 0; i < 400 && zeilen.filter((z) => z.art === 'bereit').length < 2; i++) await new Promise((r) => setTimeout(r, 50));
      const port = (nr: number) => zeilen.find((z) => z.art === 'bereit' && z.nr === nr)?.port;
      assert.ok(port(1) && port(2), `beide Prozesse bereit: ${JSON.stringify(zeilen)}\n${fehler}`);
      const rufe = async (nr: number, methode: string, pfad: string) => {
        const r = await fetch(`http://127.0.0.1:${port(nr)}${pfad}`, { method: methode });
        assert.equal(r.status, 200, `${methode} ${pfad} bei Prozess ${nr}: ${await r.clone().text()}`);
        return r.json() as Promise<Record<string, unknown> | null>;
      };
      /** Beide Prozesse abwechselnd (2, 1, 2, 1): immer derselbe Stand. */
      const gleich = async (pfad: string, was: string) => {
        const staende = [await rufe(2, 'GET', pfad), await rufe(1, 'GET', pfad), await rufe(2, 'GET', pfad), await rufe(1, 'GET', pfad)];
        for (const s of staende) assert.deepEqual(s, staende[0], `${was}: derselbe Stand in beiden Prozessen`);
        return staende[0]!;
      };

      for (const [pfad, schritt] of [['/probe', (s: Record<string, unknown>) => (s.schritte as Array<{ status: string }>).filter((x) => x.status === 'ok').length], ['/sicherung', (s: Record<string, unknown>) => s.bytes as number]] as const) {
        assert.equal(await rufe(2, 'GET', pfad), null, `${pfad}: vor dem Start kein Lauf`);
        const gestartet = await rufe(2, 'POST', pfad);
        assert.equal(gestartet?.status, 'laeuft');
        // Gleich nach dem Start – vorher meldete Prozess 2 hier „kein Lauf“, bis der Spiegel kam.
        assert.deepEqual(await gleich(pfad, `${pfad} gleich nach dem Start`), gestartet, `${pfad}: der Lauf aus dem Start, im Leiter`);
        let s = gestartet!;
        for (let n = 1; s.status === 'laeuft'; n++) {
          assert.ok(n <= 10, `${pfad}: endet`);
          await rufe(1, 'POST', '/weiter');
          s = await gleich(pfad, `${pfad} nach Schritt ${n}`);
          assert.equal(schritt(s), n, `${pfad}: Fortschritt ${n}`);
        }
        assert.equal(s.status, 'fertig');
        assert.equal(s.gestartet, gestartet!.gestartet, `${pfad}: genau ein Lauf`);
      }

      // Eingangsordner: gespeichert über Prozess 2 – neu geplant wird im Leiter, Prozess 2 hat keinen eigenen Zeitgeber.
      assert.equal((await rufe(2, 'POST', '/eingang'))?.abstand, 42);
      let leiter: unknown = null;
      for (let i = 0; i < 100 && leiter !== 42_000; i++) { leiter = await rufe(1, 'GET', '/eingang/zeitgeber'); if (leiter !== 42_000) await new Promise((r) => setTimeout(r, 20)); }
      assert.equal(leiter, 42_000, 'der Leiter plant mit dem neuen Abstand');
      assert.equal(await rufe(2, 'GET', '/eingang/zeitgeber'), null, 'kein Zeitgeber in Prozess 2');

      // Datenbank-Anbindung: gespeichert über Prozess 2 – „Neustart nötig“ und die neue Anbindung in beiden Prozessen.
      assert.equal((await rufe(1, 'GET', '/anbindung'))?.neustartNoetig, false);
      assert.equal((await rufe(2, 'POST', '/anbindung'))?.neustartNoetig, true);
      for (const nr of [1, 2]) {
        const a = await rufe(nr, 'GET', '/anbindung');
        assert.equal(a?.neustartNoetig, true, `Neustart nötig in Prozess ${nr}`);
        assert.equal((a?.anbindung as { host: string }).host, 'db-neu');
      }
    } finally {
      p.kill('SIGTERM');
      await new Promise((ok) => p.once('exit', ok));
    }
  });
});
