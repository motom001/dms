/**
 * Arbeit im Hintergrund mit niedrigerer Priorität (#893): Arbeiter-Fäden und gestartete Programme bekommen einen
 * höheren nice-Wert, der Hauptfaden behält seinen. Geht es nicht, ein Hinweis im Protokoll und weiter.
 */
import assert from 'node:assert/strict';
import { spawn as normalSpawn } from 'node:child_process';
import { getPriority } from 'node:os';
import { after, afterEach, describe, it } from 'node:test';
import { arbeite, beendeArbeiter, richteArbeiterEin } from '../src/arbeit';
import { execFile, faedenVon, hintergrundNiceAus, HINTERGRUND_NICE_VORGABE, richteHintergrundEin, senkePrioritaet, senkeProzess, spawn, type Prioritaet } from '../src/hintergrund';
import { protokoll } from '../src/protokoll';

const basis = getPriority(process.pid);
const ziel = Math.min(19, basis + HINTERGRUND_NICE_VORGABE);
const fehler = (code: string) => Object.assign(new Error(code), { code });

after(() => beendeArbeiter());
afterEach(() => { richteHintergrundEin({}); });

describe('Einstellung DMS_HINTERGRUND_NICE (#893)', () => {
  it('Vorgabe 10, 0 schaltet aus, Ungültiges mit Hinweis', () => {
    assert.deepEqual(hintergrundNiceAus({}), { wert: 10, quelle: 'vorgabe' });
    assert.deepEqual(hintergrundNiceAus({ DMS_HINTERGRUND_NICE: ' 5 ' }), { wert: 5, quelle: 'umgebung' });
    assert.deepEqual(hintergrundNiceAus({ DMS_HINTERGRUND_NICE: '0' }), { wert: 0, quelle: 'umgebung' });
    assert.deepEqual(hintergrundNiceAus({ DMS_HINTERGRUND_NICE: '19' }), { wert: 19, quelle: 'umgebung' });
    for (const roh of ['20', '-1', 'viel', '2.5']) {
      const e = hintergrundNiceAus({ DMS_HINTERGRUND_NICE: roh });
      assert.equal(e.wert, 10, roh);
      assert.match(e.fehler!, new RegExp(`DMS_HINTERGRUND_NICE=${roh.replace('.', '\\.')} ist keine Zahl von 0 bis 19`));
    }
  });
});

describe('Priorität der Arbeit im Hintergrund (#893)', () => {
  it('Programme über spawn und execFile laufen mit niedrigerer Priorität, ohne Wrapper nicht', async () => {
    const a = spawn('sleep', ['5']);
    const b = execFile('sleep', ['5'], () => {});
    const c = normalSpawn('sleep', ['5']);
    try {
      assert.equal(getPriority(a.pid!), ziel, 'spawn');
      assert.equal(getPriority(b.pid!), ziel, 'execFile');
      assert.equal(getPriority(c.pid!), basis, 'zum Vergleich: node:child_process');
      assert.equal(getPriority(process.pid), basis, 'Hauptfaden unverändert');
    } finally { a.kill(); b.kill(); c.kill(); }
  });

  it('Ergebnis von execFile kommt wie gewohnt an; fehlendes Programm bleibt ENOENT', async () => {
    // Die Priorität sinkt gleich nach dem Start (setPriority auf die PID) – ein schnelles „nice“ las manchmal noch den
    // alten Wert (#900). Darum liest das Programm wiederholt, bis der Wert nicht mehr der des DMS ist (höchstens 5 s).
    const skript = `i=0; while [ "$(nice)" = "${basis}" ] && [ $i -lt 250 ]; do sleep 0.02; i=$((i+1)); done; nice`;
    const aus = await new Promise<string>((ok, nein) => execFile('sh', ['-c', skript], { encoding: 'utf8' }, (e, o) => (e ? nein(e) : ok(o))));
    assert.equal(aus.trim(), String(ziel), 'das Programm sieht selbst den nice-Wert');
    const e = await new Promise<{ code?: unknown } | null>((ok) => execFile('gibt-es-nicht-893', [], (x) => ok(x)));
    assert.equal(e?.code, 'ENOENT');
  });

  it('DMS_HINTERGRUND_NICE=0: normale Priorität', () => {
    richteHintergrundEin({ DMS_HINTERGRUND_NICE: '0' });
    const a = spawn('sleep', ['5']);
    try { assert.equal(getPriority(a.pid!), basis); } finally { a.kill(); }
  });

  it('Arbeiter-Fäden rechnen niedriger, der Hauptfaden nicht', async () => {
    const vorher = new Set(faedenVon(process.pid));
    richteArbeiterEin({ DMS_ARBEITER: '1' });
    const r = await arbeite('exportTabellen', { titel: 'T', kopf: ['a'], text: [['1']] });
    assert.ok(r.csv);
    const neu = faedenVon(process.pid).filter((t) => !vorher.has(t)).map((t) => getPriority(t));
    assert.ok(neu.includes(ziel), `ein neuer Faden mit nice ${ziel} (neu: ${neu.join(', ')})`);
    assert.equal(getPriority(process.pid), basis);
    assert.equal(getPriority(0), basis, 'der aufrufende Faden auch');
    await beendeArbeiter();
  });

  it('ganzer Prozess: alle Fäden (Paket-Läufer)', async () => {
    const k = normalSpawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);
    try {
      await new Promise((r) => setTimeout(r, 300));
      assert.ok(faedenVon(k.pid!).length > 1, 'Node hat mehrere Fäden');
      assert.ok(senkeProzess(k.pid!));
      assert.deepEqual([...new Set(faedenVon(k.pid!).map((t) => getPriority(t)))], [ziel]);
    } finally { k.kill(); }
  });

  it('geht es nicht (EACCES/ENOSYS): false, ein Hinweis im Protokoll, kein Absturz', () => {
    const meldungen = () => protokoll.eintraege({}).filter((e) => e.text.includes('Priorität der Arbeit im Hintergrund lässt sich hier nicht senken'));
    const vorher = meldungen().length;
    const sys: Prioritaet = { getPriority: () => 0, setPriority: () => { throw fehler('EACCES'); } };
    assert.equal(senkePrioritaet(4711, sys), false);
    assert.equal(senkePrioritaet(4712, { ...sys, setPriority: () => { throw fehler('ENOSYS'); } }), false);
    assert.equal(senkeProzess(4713, sys, () => [4713, 4714]), false);
    const neu = meldungen().slice(vorher);
    assert.equal(neu.length, 1, 'nur einmal');
    assert.equal(neu[0].stufe, 'warn');
    assert.match(neu[0].text, /\(EACCES\)/);
  });

  it('schon beendetes Programm (ESRCH): kein Hinweis; schon niedrig: nichts gesetzt', () => {
    const vorher = protokoll.eintraege({}).length;
    assert.equal(senkePrioritaet(4711, { getPriority: (p) => { if (p === 4711) throw fehler('ESRCH'); return 0; }, setPriority: () => {} }), false);
    assert.equal(protokoll.eintraege({}).length, vorher);
    let gesetzt = 0;
    assert.equal(senkePrioritaet(4711, { getPriority: (p) => (p === process.pid ? 0 : 15), setPriority: () => { gesetzt++; } }), true);
    assert.equal(gesetzt, 0, 'nie höher als jetzt');
    assert.equal(senkePrioritaet(4711, { getPriority: (p) => (p === process.pid ? 12 : 0), setPriority: (_p, w) => { gesetzt = w; } }), true);
    assert.equal(gesetzt, 19, 'zusätzlich zum Hauptfaden, höchstens 19');
  });
});

describe('Programme enden mit Ablago (#1203)', () => {
  const lebt = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  // Ein Prozess wie Ablago startet über hintergrund.ts ein lange laufendes Programm und endet dann – geordnet
  // (process.exit nach SIGTERM) oder durch einen Absturz. Das Programm darf nicht übrig bleiben.
  for (const [art, ende] of [['Signal', "process.on('SIGTERM', () => process.exit(0)); process.kill(process.pid, 'SIGTERM');"], ['Absturz', "throw new Error('Absturz');"]] as const) {
    it(`nach ${art}: kein Kindprozess bleibt übrig`, async () => {
      const code = `const { spawn } = await import(${JSON.stringify(new URL('../src/hintergrund.ts', import.meta.url).href)});
        const k = spawn('sleep', ['60'], { stdio: 'ignore' }); process.stdout.write(String(k.pid) + '\\n');
        setTimeout(() => { ${ende} }, 100);`;
      const eltern = normalSpawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'ignore'] });
      let aus = '';
      eltern.stdout.on('data', (d: Buffer) => { aus += d.toString(); });
      await new Promise((ok) => eltern.once('exit', ok));
      const pid = Number(aus.trim());
      assert.ok(pid > 0, `PID des Programms: ${aus}`);
      for (let i = 0; i < 40 && lebt(pid); i++) await new Promise((r) => setTimeout(r, 50));
      const uebrig = lebt(pid);
      if (uebrig) process.kill(pid, 'SIGKILL');
      assert.equal(uebrig, false, 'das Programm endet mit dem Elternprozess');
    });
  }
});
