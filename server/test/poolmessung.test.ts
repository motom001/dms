/**
 * Wo es unter Last hakt (#874) ohne Datenbank: Wartezeit auf Verbindungen aus den Meldungen von postgres.js
 * (diagnostics_channel), Zusammenzählen über Prozesse, Rechenzeit von PostgreSQL und Ablago aus /proc.
 */
import assert from 'node:assert/strict';
import dc from 'node:diagnostics_channel';
import { describe, it } from 'node:test';
import type postgres from 'postgres';
import { AN_MS, KLASSEN_MS, klasseVon, Poolmessung, poolZusammen, quantilAusKlassen } from '../src/poolmessung';
import { liesCpuJeArt, liesCpuSekunden } from '../src/systemlast';

const stats = { connections: 6, opening: 0, idle: 2, leased: 1, waiting: 3 };
const sql = { stats } as unknown as postgres.Sql;

describe('Poolmessung (#874)', () => {
  it('Klassen und Quantil', () => {
    assert.equal(klasseVon(0.2), 0);
    assert.equal(klasseVon(1), 0);
    assert.equal(klasseVon(1.2), 1);
    assert.equal(klasseVon(31_000), KLASSEN_MS.length);
    const k = new Array(KLASSEN_MS.length + 1).fill(0);
    k[0] = 94;
    k[klasseVon(40)] = 6;
    assert.equal(quantilAusKlassen(k, 0.95), 50);
    assert.equal(quantilAusKlassen(k, 0.5), 1);
  });

  it('misst erst nach an(): Abfragen (queued → sent) und ausgeliehene Verbindungen (lease, waited)', () => {
    let jetzt = 1_000_000;
    const m = new Poolmessung(sql, 6, () => jetzt);
    const abfrage = dc.tracingChannel('postgres:query');
    const pool = dc.channel('postgres:pool');
    const fertig = (ctx: object) => {
      abfrage.asyncEnd.publish(ctx);
    };
    fertig({ queued: 0, sent: 500 });
    assert.equal(m.stand().anzahl, 0, 'aus: nichts gemessen');
    m.an();
    try {
      fertig({ queued: 10, sent: 10.5 });
      fertig({ queued: 10, sent: 250 });
      fertig({ queued: 10, sent: null }); // nie gesendet (Fehler vorher): zählt nicht
      pool.publish({ event: 'lease', waited: 40 });
      pool.publish({ event: 'idle' });
      const s = m.stand();
      assert.equal(s.an, true);
      assert.equal(s.anzahl, 3);
      assert.equal(s.wartenMax, 240);
      assert.equal(s.klassen[0], 1);
      assert.equal(s.klassen[klasseVon(40)], 1);
      assert.deepEqual([s.max, s.offen, s.belegt, s.belegtMax, s.warteschlangeMax], [6, 6, 4, 4, 3]);
      // Nach dem Fenster gilt der Höchstwert nicht mehr; die Klassen zählen fortlaufend weiter.
      jetzt += 11_000;
      assert.equal(m.stand().wartenMax, null);
      assert.equal(m.stand().anzahl, 3);
      // Nach AN_MS ohne Frage schaltet sie sich ab (die Uhr prüft alle 250 ms; hier direkt).
      jetzt += AN_MS;
    } finally {
      m.aus();
    }
    fertig({ queued: 0, sent: 100 });
    assert.equal(m.stand().anzahl, 3, 'aus: keine weiteren');
    assert.equal(m.stand().an, false);
  });

  it('über alle Prozesse: Klassen und Verbindungen zusammen, Wartezeit das Höchste', () => {
    const a = { an: true, klassen: [1, 2, 0], anzahl: 3, wartenMax: 5, max: 6, offen: 6, belegt: 2, belegtMax: 5, warteschlangeMax: 1 };
    const b = { an: true, klassen: [3, 0, 1], anzahl: 4, wartenMax: 30, max: 6, offen: 4, belegt: 1, belegtMax: 6, warteschlangeMax: 0 };
    assert.deepEqual(poolZusammen([a, null, b]), {
      an: true,
      klassen: [4, 2, 1, ...new Array(KLASSEN_MS.length - 2).fill(0)],
      anzahl: 7,
      wartenMax: 30,
      max: 12,
      offen: 10,
      belegt: 3,
      belegtMax: 11,
      warteschlangeMax: 1,
    });
    assert.equal(poolZusammen([null, undefined]), null);
  });
});

describe('Rechenzeit je Art aus /proc (#874)', () => {
  // utime 300, stime 100, cutime 50, cstime 50 Takte = 5 s; der Name enthält Klammern und Leerzeichen.
  const stat = (u: number) => `42 (node (x) y) S 1 42 42 0 -1 4194304 1 0 0 0 ${u} 100 50 50 20 0 1 0 1 1 1`;
  const dateien: Record<string, string> = {
    '/proc/10/stat': stat(300),
    '/proc/10/comm': 'node\n',
    '/proc/11/stat': stat(100),
    '/proc/11/comm': 'node\n',
    '/proc/20/stat': stat(500),
    '/proc/20/comm': 'postgres\n',
    '/proc/21/stat': stat(0),
    '/proc/21/comm': 'postgres\n',
    '/sys/fs/cgroup/cpu.stat': 'usage_usec 25000000\n',
    '/sys/fs/cgroup/memory.current': '1',
  };
  const lies = (p: string) => dateien[p] ?? null;

  it('utime + stime + cutime + cstime in Sekunden', () => {
    assert.equal(liesCpuSekunden(lies, 10), 5);
    assert.equal(liesCpuSekunden(lies, 99), null);
  });

  it('PostgreSQL (nur im Container), Ablago (genannte Prozesse), Container', () => {
    assert.deepEqual(liesCpuJeArt(lies, { ablago: [10, 11], postgres: true, pids: () => [10, 11, 20, 21] }), {
      postgres: 9,
      ablago: 8,
      container: 25,
    });
    assert.deepEqual(liesCpuJeArt(lies, { ablago: [10], postgres: false, pids: () => [20] }), { postgres: null, ablago: 5, container: 25 });
    assert.equal(liesCpuJeArt(lies, { ablago: [10, 99], postgres: false }).ablago, null, 'ein Prozess nicht lesbar: keine halbe Summe');
  });
});
