import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Erreichbarkeit, istAusfall, wartezeit, ZURUECK_MS, PRUEF_ABSTAND_MS, type Gesundheit } from '../../shared/src/erreichbarkeit';

/** Uhr und Timer zum Weiterdrehen, Server zum Umschalten. */
function aufbau() {
  let jetzt = 1_000_000;
  let timer: { f: () => void; bis: number; id: number }[] = [];
  let id = 0;
  const server: { antwort: Gesundheit | null; abfragen: number } = { antwort: { ok: true, stand: 'a' }, abfragen: 0 };
  let wieder = 0;
  const e = new Erreichbarkeit({
    gesundheit: async () => { server.abfragen++; return server.antwort; },
    jetzt: () => jetzt,
    spaeter: (f, ms) => { timer.push({ f, bis: jetzt + ms, id: ++id }); return id; },
    abbrechen: (t) => { timer = timer.filter((x) => x.id !== t); },
  }, () => { wieder++; });
  const warte = async (ms: number) => {
    jetzt += ms;
    for (const t of timer.filter((x) => x.bis <= jetzt)) { timer = timer.filter((x) => x !== t); t.f(); }
    await new Promise((r) => setImmediate(r));
  };
  return { e, server, warte, wieder: () => wieder, offeneTimer: () => timer.length };
}

test('istAusfall: Proxy-Antworten und keine Verbindung, nicht aber Antworten des DMS', () => {
  assert.equal(istAusfall(0, null), true);
  assert.equal(istAusfall(502, null), true);
  assert.equal(istAusfall(504, '<html>'), true);
  assert.equal(istAusfall(503, null), true);
  assert.equal(istAusfall(503, { fehler: 'Wartung' }), false, 'Wartungsmodus des DMS');
  assert.equal(istAusfall(500, null), false);
  assert.equal(istAusfall(404, null), false);
});

test('wartezeit wächst von 2 auf 30 Sekunden', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(wartezeit), [2000, 4000, 8000, 16000, 30000, 30000]);
});

test('Ausfall, Nachfragen mit wachsendem Abstand, wieder erreichbar', async () => {
  const { e, server, warte, wieder } = aufbau();
  await e.pruefe();
  assert.equal(e.zustand.stufe, 'ok');
  server.antwort = null;
  e.ausfall();
  e.ausfall();
  assert.equal(e.zustand.stufe, 'weg');
  assert.equal(server.abfragen, 1);
  await warte(2000);
  assert.equal(server.abfragen, 2);
  await warte(3999);
  assert.equal(server.abfragen, 2, 'zweiter Versuch erst nach 4 s');
  await warte(1);
  assert.equal(server.abfragen, 3);
  server.antwort = { ok: true, stand: 'a' };
  await warte(8000);
  assert.equal(e.zustand.stufe, 'zurueck');
  assert.equal(e.zustand.neueVersion, false);
  assert.equal(wieder(), 1);
  await warte(ZURUECK_MS);
  assert.equal(e.zustand.stufe, 'ok');
});

test('anderer Stand nach dem Neustart: neue Version', async () => {
  const { e, server, warte } = aufbau();
  await e.pruefe();
  server.antwort = null;
  e.ausfall();
  server.antwort = { ok: true, stand: 'b' };
  await warte(2000);
  assert.equal(e.zustand.stufe, 'zurueck');
  assert.equal(e.zustand.neueVersion, true);
});

test('Antwort einer Anfrage während des Ausfalls: sofort nachsehen', async () => {
  const { e, server, warte } = aufbau();
  await e.pruefe();
  server.antwort = null;
  e.ausfall();
  server.antwort = { ok: true, stand: 'a' };
  e.antwort();
  await warte(0);
  assert.equal(e.zustand.stufe, 'zurueck');
});

test('bedarf: höchstens einmal pro Minute, während eines Ausfalls immer', async () => {
  const { e, server, warte } = aufbau();
  await e.pruefe();
  e.bedarf(); await warte(0);
  assert.equal(server.abfragen, 1);
  await warte(PRUEF_ABSTAND_MS);
  server.antwort = { ok: true, stand: 'neu' };
  e.bedarf(); await warte(0);
  assert.equal(server.abfragen, 2);
  assert.equal(e.zustand.neueVersion, true, 'Update im Hintergrund ohne bemerkten Ausfall');
  assert.equal(e.zustand.stufe, 'ok');
});

test('fehlschlagende Prüfung ohne vorherigen Ausfall meldet ihn; schliessen blendet aus', async () => {
  const { e, server, warte, offeneTimer } = aufbau();
  server.antwort = null;
  await e.pruefe();
  assert.equal(e.zustand.stufe, 'weg');
  server.antwort = { ok: true };
  await e.pruefe();
  assert.equal(e.zustand.stufe, 'zurueck');
  e.schliessen();
  assert.equal(e.zustand.stufe, 'ok');
  assert.equal(offeneTimer(), 0);
  await warte(ZURUECK_MS);
  assert.equal(e.zustand.stufe, 'ok');
});

test('veraltet: nachgeladene Teile fehlen', () => {
  const { e } = aufbau();
  let gemeldet = 0;
  e.abonniere(() => gemeldet++);
  e.veraltet(); e.veraltet();
  assert.equal(e.zustand.neueVersion, true);
  assert.equal(gemeldet, 1);
});

test('standKennung (#122): kurzer Hash, ändert sich mit dem Commit', async () => {
  const { standKennung } = await import('../src/system');
  const alt = process.env.DMS_COMMIT;
  try {
    process.env.DMS_COMMIT = 'aaa';
    const a = standKennung();
    assert.match(a, /^[0-9a-f]{12}$/);
    process.env.DMS_COMMIT = 'bbb';
    assert.notEqual(standKennung(), a);
  } finally { if (alt === undefined) delete process.env.DMS_COMMIT; else process.env.DMS_COMMIT = alt; }
});
