/** Systemzustand → Auslastung (#409): cgroup v1/v2, ohne Grenze, nicht lesbar; Netz; Anteile; Verlauf und Schwellen. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { totalmem } from 'node:os';
import { dauerhaftHoch, liesAnteile, liesCgroup, liesNetz, Systemlast, type Leser, type Messpunkt } from '../src/systemlast';

const dateien = (d: Record<string, string>): Leser => (p) => (p in d ? d[p] : null);
const G = '/sys/fs/cgroup';

const NETZ = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:  999999     100    0    0    0     0          0         0   999999     100    0    0    0     0       0          0
  eth0: 1000000    2000    0    0    0     0          0         0   500000    1500    0    0    0     0       0          0
  eth1:    2000      20    0    0    0     0          0         0     1000      10    0    0    0     0       0          0
`;

describe('Auslastung lesen (#409)', () => {
  it('cgroup v2 mit Grenzen', () => {
    const c = liesCgroup(dateien({ [`${G}/cpu.stat`]: 'usage_usec 5000000\nuser_usec 4000000\n', [`${G}/cpu.max`]: '150000 100000\n', [`${G}/memory.current`]: '536870912\n', [`${G}/memory.max`]: '1073741824\n' }));
    assert.deepEqual(c, { version: 'v2', cpuUs: 5_000_000, kerne: 1.5, speicher: 536870912, grenze: 1073741824 });
  });

  it('cgroup v2 ohne Grenzen', () => {
    const c = liesCgroup(dateien({ [`${G}/cpu.stat`]: 'usage_usec 42\n', [`${G}/cpu.max`]: 'max 100000\n', [`${G}/memory.current`]: '1000\n', [`${G}/memory.max`]: 'max\n' }));
    assert.equal(c.kerne, null);
    assert.equal(c.grenze, null);
    assert.equal(c.speicher, 1000);
  });

  it('cgroup v1, auch ohne Grenze (riesiger Wert, Quote -1)', () => {
    const c = liesCgroup(dateien({
      [`${G}/cpuacct/cpuacct.usage`]: '3000000000\n', [`${G}/cpu/cpu.cfs_quota_us`]: '200000\n', [`${G}/cpu/cpu.cfs_period_us`]: '100000\n',
      [`${G}/memory/memory.usage_in_bytes`]: '2048\n', [`${G}/memory/memory.limit_in_bytes`]: '4096\n',
    }));
    assert.deepEqual(c, { version: 'v1', cpuUs: 3_000_000, kerne: 2, speicher: 2048, grenze: 4096 });
    const ohne = liesCgroup(dateien({
      [`${G}/cpuacct/cpuacct.usage`]: '1\n', [`${G}/cpu/cpu.cfs_quota_us`]: '-1\n', [`${G}/cpu/cpu.cfs_period_us`]: '100000\n',
      [`${G}/memory/memory.usage_in_bytes`]: '2048\n', [`${G}/memory/memory.limit_in_bytes`]: '9223372036854771712\n',
    }));
    assert.equal(ohne.kerne, null);
    assert.equal(ohne.grenze, null);
  });

  it('nicht lesbar: alles null statt geschätzt', () => {
    assert.deepEqual(liesCgroup(dateien({})), { version: null, cpuUs: null, kerne: null, speicher: null, grenze: null });
    assert.equal(liesNetz(null), null);
    assert.equal(liesNetz('Inter-|\n face |\n    lo: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16\n'), null, 'nur lo');
  });

  it('Netz: alle Schnittstellen außer lo', () => {
    assert.deepEqual(liesNetz(NETZ), { rx: 1_002_000, tx: 501_000 });
  });

  it('Anteile am Arbeitsspeicher: DMS, Paket-Läufer, PostgreSQL (nur lesbar zählt)', () => {
    const pss = (kb: number) => `Rss: 1 kB\nPss:  ${kb} kB\n`;
    const lies = dateien({
      '/proc/10/smaps_rollup': pss(100), '/proc/20/smaps_rollup': pss(50),
      '/proc/30/comm': 'postgres\n', '/proc/30/smaps_rollup': pss(30), '/proc/31/comm': 'postgres\n', '/proc/31/smaps_rollup': pss(20), '/proc/40/comm': 'sh\n',
    });
    assert.deepEqual(liesAnteile(lies, { eigen: 10, laeufer: 20, postgres: true, pids: () => [10, 20, 30, 31, 40] }), { dms: 102400, pakete: 51200, datenbank: 51200 });
    assert.deepEqual(liesAnteile(lies, { eigen: 10, laeufer: null, postgres: false, pids: () => [] }), { dms: 102400, pakete: null, datenbank: null });
    // Ein PostgreSQL-Prozess nicht lesbar (anderer Benutzer): lieber „nicht verfügbar“ als zu wenig.
    const halb = dateien({ '/proc/30/comm': 'postgres\n', '/proc/30/smaps_rollup': pss(30), '/proc/31/comm': 'postgres\n' });
    assert.equal(liesAnteile(halb, { eigen: 1, laeufer: null, postgres: true, pids: () => [30, 31] }).datenbank, null);
  });

  it('Warnung erst, wenn ein Wert 5 Minuten lang über 90 % liegt', () => {
    const p = (cpu: number | null, speicher: number | null): Messpunkt => ({ zeit: '', cpu, speicher, rx: null, tx: null });
    assert.deepEqual(dauerhaftHoch([p(95, 91), p(95, 92), p(95, 93), p(95, 94)]), [], 'erst 4 Minuten');
    assert.deepEqual(dauerhaftHoch([p(10, 50), p(95, 91), p(95, 92), p(95, 93), p(95, 94), p(91, 95)]), ['cpu', 'speicher']);
    assert.deepEqual(dauerhaftHoch([p(95, 91), p(95, 92), p(85, 93), p(95, 94), p(95, 95)]), ['speicher']);
    assert.deepEqual(dauerhaftHoch([p(null, 99), p(null, 99), p(null, 99), p(null, 99), p(null, 99)]), ['speicher'], 'CPU nicht verfügbar');
  });

  it('Messung: CPU-Anteil an den erlaubten Kernen, Speicher an der Grenze, Netz je Sekunde; höchstens 60 Punkte', () => {
    let t = 0, usage = 0, rx = 0;
    const lies: Leser = (pfad) => ({
      [`${G}/cpu.stat`]: `usage_usec ${usage}\n`, [`${G}/cpu.max`]: '200000 100000\n', [`${G}/memory.current`]: '900\n', [`${G}/memory.max`]: '1000\n',
      '/proc/net/dev': `a\nb\n  eth0: ${rx} 0 0 0 0 0 0 0 ${rx / 2} 0 0 0 0 0 0 0\n`,
    } as Record<string, string>)[pfad] ?? null;
    const s = new Systemlast({ lies, jetzt: () => t });
    assert.equal(s.messe(), null, 'erste Messung ist nur der Ausgangswert');
    for (let i = 0; i < 70; i++) {
      t += 60_000; usage += 60_000_000; rx += 6_000_000; // eine volle Kern-Minute bei zwei Kernen = 50 %
      s.messe();
    }
    const st = s.stand();
    assert.equal(st.verlauf.length, 60);
    assert.deepEqual({ cpu: st.verlauf[59].cpu, speicher: st.verlauf[59].speicher, rx: st.verlauf[59].rx, tx: st.verlauf[59].tx }, { cpu: 50, speicher: 90, rx: 100_000, tx: 50_000 });
    assert.equal(st.kerne, 2);
    assert.ok(st.kerneBegrenzt);
    assert.deepEqual(st.speicher, { belegt: 900, grenze: 1000, ohneGrenze: false });
    assert.deepEqual(st.warnung, ['speicher'], 'Speicher 90 %');
    assert.equal(st.datenbankImContainer, false);
    // Ohne Grenze: Anteil am Gesamtspeicher des Rechners.
    const ohne = new Systemlast({ lies: dateien({ [`${G}/memory.current`]: '1000\n', [`${G}/memory.max`]: 'max\n' }) });
    assert.deepEqual(ohne.stand().speicher, { belegt: 1000, grenze: totalmem(), ohneGrenze: true });
    assert.equal(ohne.stand().jetzt.cpu, null);
  });
});
