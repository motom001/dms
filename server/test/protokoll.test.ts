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

describe('Versionsübersicht', () => {
  it('vergleicht Versionen und meldet Neueres, Veraltetes und Fehler je Komponente', async () => {
    const { uebersicht, versionsabgleich, vergleicheVersion } = await import('../src/system');
    assert.ok(vergleicheVersion('22.11.0', '22.9.1') > 0);
    assert.equal(vergleicheVersion('v17.4', '17.4.0'), 0);
    process.env.DMS_COMMIT = 'aaaaaaa1111111';
    const u = await uebersicht({ async datenbank() { return { version: '17.4 (Debian 17.4-1.pgdg120+2)', groesseBytes: 1, mappen: 1, typen: 1, benutzer: 1, dokumente: 0, dokumenteBytes: 0 }; } }, undefined);
    delete process.env.DMS_COMMIT;
    assert.equal(u.laufzeit.node, process.versions.node);
    assert.ok('version' in u.datenbank);
    const nodeReihe = process.versions.node.split('.')[0];
    const abruf = async (url: string): Promise<unknown> => {
      if (url.includes('/commits/main')) return { sha: 'bbbbbbb2222222', commit: { committer: { date: '2026-10-28T08:00:00Z' }, message: 'Neues\n\nDetails' } };
      if (url.includes('/compare/')) return { ahead_by: 3 };
      if (url.endsWith('/nodejs.json')) return [{ cycle: '99', latest: '99.0.0', eol: '2099-01-01', lts: '2098-01-01' }, { cycle: nodeReihe, latest: '999.0.0', eol: '2000-01-01', lts: true }];
      if (url.endsWith('/postgresql.json')) return [{ cycle: '18', latest: '18.1', eol: '2030-11-14' }, { cycle: '17', latest: '17.4', eol: '2029-11-08' }];
      if (url.includes('registry.npmjs.org/fastify')) throw new Error('503 Service Unavailable');
      return { version: '0.0.1' };
    };
    // Ohne Release (Abfrage liefert keinen Tag): Rückfall auf main.
    const r = await versionsabgleich(u, { react: '19.1.0' }, abruf);
    const v = (k: string) => r.find((x) => x.komponente === k)!;
    assert.equal(v('DMS').status, 'neuer');
    assert.match(v('DMS').hinweis!, /3 neuere Änderungen/);
    assert.match(v('DMS').aktuell!, /^main \(bbbbbbb/);
    // Mit Releases (#206): neueste Version und Datum, Status über die Versionsnummer.
    const [ma, mi] = u.dms.version.split('.').map(Number);
    const neu = `${ma}.${mi + 1}.0`;
    const mitRelease = async (url: string): Promise<unknown> => {
      if (url.endsWith('/releases/latest')) return { tag_name: `v${neu}`, published_at: '2026-10-30T19:00:00Z', html_url: 'https://github.com/motom001/dms/releases/tag/v' + neu };
      if (url.includes('/releases?')) return [{ tag_name: `v${neu}` }, { tag_name: `v${ma}.${mi}.9` }, { tag_name: `v${u.dms.version}` }, { tag_name: 'v0.1.0' }];
      return abruf(url);
    };
    const d = (await versionsabgleich(u, {}, mitRelease)).find((x) => x.komponente === 'DMS')!;
    assert.equal(d.aktuell, `${neu} (Release vom 30.10.2026)`);
    assert.equal(d.status, 'neuer');
    assert.match(d.hinweis!, /neuere Versionen \(bis/);
    const gleich = async (url: string): Promise<unknown> => (url.endsWith('/releases/latest') ? { tag_name: `v${u.dms.version}`, published_at: '2026-10-29T10:00:00Z' } : abruf(url));
    const g = (await versionsabgleich(u, {}, gleich)).find((x) => x.komponente === 'DMS')!;
    assert.equal(g.status, 'aktuell');
    assert.match(g.hinweis!, /Auf main gibt es 3 neuere Änderungen, die noch in keinem Release sind/);
    assert.equal(v('Node.js').status, 'veraltet');
    assert.equal(v('PostgreSQL').status, 'aktuell');
    assert.match(v('PostgreSQL').hinweis!, /Neueste Reihe: 18/);
    assert.equal(v('fastify').status, 'unbekannt');
    assert.match(v('fastify').hinweis!, /503/);
    assert.equal(v('react').status, 'aktuell');
  });
});
