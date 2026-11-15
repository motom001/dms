/**
 * Geordnet beenden (#1011) mit Gesamtfrist (#1340): Ein hängender Stopp-Schritt verzögert das Ende nicht über die Frist;
 * was dann noch läuft, steht im Protokoll. Ohne Hänger laufen alle Schritte, ein gescheiterter gibt Code 1.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';
import { BEENDEN_FRIST_MS, beendeGeordnet } from '../src/beenden';

const SERVER = new URL('..', import.meta.url).pathname;

function protokoll() {
  const eintraege: Array<{ stufe: string; text: string; kontext?: Record<string, unknown> }> = [];
  return {
    eintraege,
    log: {
      error: (text: string, kontext?: Record<string, unknown>) => { eintraege.push({ stufe: 'error', text, kontext }); },
      warn: (text: string, kontext?: Record<string, unknown>) => { eintraege.push({ stufe: 'warn', text, kontext }); },
    },
  };
}

describe('Beenden mit Gesamtfrist (#1340)', () => {
  it('die Frist liegt unter den 8 s des Hauptprozesses (#1328) und den 10 s von docker stop', () => {
    assert.ok(BEENDEN_FRIST_MS < 8_000);
  });

  it('alle Schritte nacheinander; ein gescheiterter hält die übrigen nicht auf und gibt Code 1', async () => {
    const p = protokoll();
    const gelaufen: string[] = [];
    const codes: number[] = [];
    await beendeGeordnet([
      { name: 'a', f: () => { gelaufen.push('a'); } },
      { name: 'b', f: async () => { gelaufen.push('b'); throw new Error('kaputt'); } },
      { name: 'c', f: async () => { await new Promise((r) => setTimeout(r, 10)); gelaufen.push('c'); } },
    ], { log: p.log, ende: (c) => codes.push(c), frist: 1000 });
    assert.deepEqual(gelaufen, ['a', 'b', 'c']);
    assert.deepEqual(codes, [1]);
    assert.deepEqual(p.eintraege.map((e) => e.text), ['Beenden: b fehlgeschlagen']);

    const codes0: number[] = [];
    await beendeGeordnet([{ name: 'a', f: () => {} }], { log: protokoll().log, ende: (c) => codes0.push(c), frist: 1000 });
    assert.deepEqual(codes0, [0], 'ohne Fehler Code 0');
  });

  it('ein hängender Schritt: Ende nach der Frist, mit Schritt und Ausgelassenen im Protokoll', async () => {
    const p = protokoll();
    const t0 = Date.now();
    const codes: number[] = [];
    let danach = false;
    await new Promise<void>((fertig) => {
      void beendeGeordnet([
        { name: 'app.close', f: () => new Promise(() => {}) },
        { name: 'sql.end', f: () => { danach = true; } },
      ], { log: p.log, ende: (c) => { codes.push(c); fertig(); }, frist: 200 });
    });
    const ms = Date.now() - t0;
    assert.ok(ms >= 190 && ms < 1000, `nach der Frist beendet (${ms} ms)`);
    assert.deepEqual(codes, [1]);
    assert.equal(danach, false);
    assert.deepEqual(p.eintraege, [{ stufe: 'warn', text: 'Beenden: nach 0.2 s noch nicht fertig – hängt bei „app.close“, Prozess wird beendet', kontext: { ausgelassen: ['sql.end'] } }]);
  });

  it('echter Prozess: hängt ein Schritt, endet er selbst nach der Frist (ohne SIGKILL von außen)', { timeout: 20_000 }, async () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const code = `import { beendeGeordnet } from './src/beenden.ts';
      setInterval(() => {}, 1000);
      process.on('SIGTERM', () => void beendeGeordnet([{ name: 'haengt', f: () => new Promise(() => {}) }],
        { log: { error: () => {}, warn: (t) => console.log(t) }, ende: (c) => process.exit(c), frist: 300 }));
      console.log('bereit');`;
    const p = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: SERVER, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let aus = '';
    p.stdout.on('data', (d: Buffer) => { aus += d.toString(); });
    for (let i = 0; i < 200 && !aus.includes('bereit'); i++) await new Promise((r) => setTimeout(r, 50));
    const t0 = Date.now();
    p.kill('SIGTERM');
    const ende = await new Promise<number | null>((ok) => p.once('exit', (c) => ok(c)));
    assert.equal(ende, 1);
    assert.ok(Date.now() - t0 < 3000, 'endet nach der Frist');
    assert.match(aus, /hängt bei „haengt“/);
  });
});
