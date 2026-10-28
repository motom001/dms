import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kontext, MAX_EINTRAEGE, Protokoll, zeile } from '../src/protokoll';

describe('Protokoll', () => {
  it('schreibt Module, Stufen und Benutzer aus dem Anfragekontext', () => {
    const zeilen: string[] = [];
    const p = new Protokoll('info', (z) => zeilen.push(z));
    p.modul('ablage').debug('nicht sichtbar');
    kontext.run({ anfrage: 'a1', benutzer: 'sabine@example.org', db: { anzahl: 0, ms: 0 } }, () => p.modul('ablage').info('Mappe angelegt', { titel: 'Strom 2026' }));
    p.modul('konto').warn('Anmeldung fehlgeschlagen', { email: 'x@example.org' });
    const alle = p.eintraege();
    assert.equal(alle.length, 2);
    assert.deepEqual([alle[0].modul, alle[0].stufe], ['konto', 'warn'], 'neueste zuerst');
    assert.equal(alle[1].benutzer, 'sabine@example.org');
    assert.equal(alle[1].anfrage, 'a1');
    assert.match(zeilen[0], /INFO +\[ablage\] Mappe angelegt benutzer=sabine@example.org titel="Strom 2026"/);
    assert.equal(p.eintraege({ modul: 'konto' }).length, 1);
    assert.equal(p.eintraege({ stufe: 'warn' }).length, 1);
    assert.equal(p.eintraege({ benutzer: 'sabine@example.org' }).length, 1);
    assert.equal(p.eintraege({ suche: 'STROM' }).length, 1);
    assert.equal(p.eintraege({ seit: alle[1].nr }).length, 1, 'nur neuere als seit');
  });

  it('schaltet den Debug-Modus ein und nach Ablauf wieder aus', () => {
    const p = new Protokoll('info', () => {});
    assert.equal(p.debugAn, false);
    const st = p.setzeDebug(true);
    assert.equal(st.an, true);
    assert.ok(Date.parse(st.bis!) - Date.now() > 59 * 60_000);
    p.modul('datenbank').debug('sichtbar');
    assert.equal(p.eintraege().length, 1);
    p.setzeDebug(false);
    p.modul('datenbank').debug('wieder unsichtbar');
    assert.equal(p.eintraege().length, 1);
  });

  it('behält höchstens 10.000 Einträge', () => {
    const p = new Protokoll('info', () => {});
    for (let i = 0; i < MAX_EINTRAEGE + 50; i++) p.modul('http').info(`Nr ${i}`);
    assert.equal(p.anzahl, MAX_EINTRAEGE);
    assert.equal(p.eintraege({ max: 1 })[0].text, `Nr ${MAX_EINTRAEGE + 49}`);
  });

  it('nimmt Meldungen von Fastify im Pino-Format an', () => {
    const p = new Protokoll('info', () => {});
    const f = p.fuerFastify();
    f.info('Server listening at http://0.0.0.0:3000');
    f.child({ reqId: 'r1' }).error({ err: new Error('kaputt'), req: { method: 'GET', url: '/api/x' } }, 'fehlgeschlagen');
    const [e, s] = p.eintraege();
    assert.deepEqual([s.modul, s.text], ['system', 'Server listening at http://0.0.0.0:3000']);
    assert.equal(e.modul, 'http');
    assert.equal(e.daten?.anfrage, 'GET /api/x');
    assert.match(String(e.daten?.fehler), /kaputt/);
    assert.match(zeile(e), /ERROR \[http\] fehlgeschlagen anfrage="GET \/api\/x"\n.*kaputt/);
  });
});

describe('Messung der Datenbankzugriffe', () => {
  it('zählt Zugriffe je Anfrage und merkt sich lange', async () => {
    const { Messung, speicherMessSpeicher } = await import('../src/messung');
    const m = new Messung(speicherMessSpeicher());
    await m.setze({ schwelleMs: 15, tage: 3 });
    const repo = m.umhuelle({
      async schnell() { return 1; },
      async langsam() { await new Promise((r) => setTimeout(r, 30)); return 2; },
      async kaputt() { throw new Error('nein'); },
    }, 'test');
    const k = { anfrage: 'x', pfad: 'GET /api/test', benutzer: 'a@example.org', db: { anzahl: 0, ms: 0 } };
    await kontext.run(k, async () => {
      assert.equal(await repo.schnell(), 1);
      assert.equal(await repo.langsam(), 2);
      await assert.rejects(repo.kaputt());
    });
    assert.equal(k.db.anzahl, 3);
    assert.ok(k.db.ms >= 25);
    const l = await m.speicher.liste(10);
    assert.equal(l.length, 1);
    assert.deepEqual([l[0].zugriff, l[0].anfrage, l[0].benutzer], ['test.langsam', 'GET /api/test', 'a@example.org']);
    await assert.rejects(m.setze({ schwelleMs: 0 }));
  });
});
