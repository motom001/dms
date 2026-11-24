/**
 * PostgreSQL 18 als Standard (#1464, #1544): Mindestversion beim Start, Startseite für einen Datenbank-Ordner von
 * PostgreSQL 17 in dms-komplett und die feste „letzte Version mit PostgreSQL 17“, die Startseite, start.sh, Handbuch
 * und Release-Notizen gleich nennen müssen.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  hauptversion,
  pgUrteil,
  pruefePgVersion,
  PG_GETESTET,
  PG_MINDESTVERSION,
  ZuAlteDatenbankFehler,
} from '../src/datenbank/pg-version';
import { LETZTE_VERSION_PG17, startfehlerAus } from '../src/einrichtung/startfehler';
import { Startmodus } from '../src/einrichtung/startmodus';

const WURZEL = join(import.meta.dirname, '../..');
const lies = (p: string) => readFileSync(join(WURZEL, p), 'utf8');
/** Abfrage-Ersatz: liefert für jede Abfrage die eine Zeile mit server_version_num. */
const mitVersion = (num: string) => (async () => [{ v: num }]) as unknown as Parameters<typeof pruefePgVersion>[0];
const vergleiche = (a: string, b: string) => {
  const x = a.split('.').map(Number),
    y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

describe('Hauptversion von PostgreSQL beim Start (#1464)', () => {
  it('liest die Hauptversion aus server_version_num', () => {
    assert.equal(hauptversion('180001'), 18);
    assert.equal(hauptversion(170012), 17);
    assert.equal(hauptversion('160015'), 16);
    assert.equal(hauptversion('90624'), 9);
    assert.equal(hauptversion('kaputt'), 0);
  });

  it('Mindestversion 16, getestet 18', () => {
    assert.equal(PG_MINDESTVERSION, 16);
    assert.equal(PG_GETESTET, 18);
    assert.equal(pgUrteil(15), 'zu-alt');
    assert.equal(pgUrteil(16), 'ungetestet');
    assert.equal(pgUrteil(17), 'ungetestet');
    assert.equal(pgUrteil(18), 'ok');
    assert.equal(pgUrteil(19), 'ungetestet');
  });

  it('lehnt zu alte ab, meldet ungetestete, schweigt bei 18', async () => {
    const hinweise: string[] = [];
    await assert.rejects(
      pruefePgVersion(mitVersion('150010'), (h) => hinweise.push(h)),
      (e: Error) => {
        assert.ok(e instanceof ZuAlteDatenbankFehler);
        assert.match(e.message, /PostgreSQL 15\. Ablago braucht mindestens PostgreSQL 16/);
        return true;
      },
    );
    assert.equal(await pruefePgVersion(mitVersion('170012'), (h) => hinweise.push(h)), 17);
    assert.equal(await pruefePgVersion(mitVersion('180001'), (h) => hinweise.push(h)), 18);
    assert.equal(await pruefePgVersion(mitVersion('190000'), (h) => hinweise.push(h)), 19);
    assert.equal(hinweise.length, 2);
    assert.match(hinweise[0], /PostgreSQL 17\. Ablago wird nur noch mit PostgreSQL 18 getestet/);
    assert.match(hinweise[1], /PostgreSQL 19\. .*noch nicht geprüft/);
  });

  it('Startseite: zu alte Datenbank mit Mindestversion und Weg, ohne Version aus dem System', () => {
    const f = startfehlerAus(new ZuAlteDatenbankFehler(14), { schritt: 'schluessel', nr: null, von: null }, null);
    assert.deepEqual(f, { art: 'datenbank', grund: 'zu-alt' });
    const s = new Startmodus({ port: 0, host: '127.0.0.1' });
    s.fehler(new ZuAlteDatenbankFehler(14));
    const text = s.seite();
    assert.match(text, /zu alten Version von PostgreSQL\. Ablago braucht mindestens PostgreSQL 16, getestet ist es mit 18/);
    assert.match(text, /postgres:18/);
    assert.doesNotMatch(text, /PostgreSQL 14/, 'die Version der Datenbank steht nur im Protokoll');
  });
});

describe('dms-komplett: Datenbank-Ordner von PostgreSQL 17 (#1464)', () => {
  it('Startseite nennt Grund und Weg mit der festen Version; nichts wird gelöscht', () => {
    const s = new Startmodus({ port: 0, host: '127.0.0.1', komplett: true });
    s.vorstartFehler('pg-17');
    const text = s.seite();
    assert.match(text, /stammt noch von PostgreSQL 17/);
    assert.match(text, /gelöscht wird nichts/);
    assert.ok(text.includes(`Ziehe mit Ablago ${LETZTE_VERSION_PG17} (letzte Version mit PostgreSQL 17) eine Sicherung`));
    assert.ok(text.includes(`dms-komplett:${LETZTE_VERSION_PG17}`));
    assert.match(text, /Leere danach den Datenbank-Ordner/);
    assert.match(text, /Aus einer Sicherung wiederherstellen/);
    assert.doesNotMatch(text, /\/data\//, 'keine Pfade');
  });

  it('start.sh: 17 → 18 zeigt die Seite pg-17, andere Versionen die allgemeine; dieselbe feste Version', () => {
    const skript = lies('deploy/komplett/start.sh');
    assert.ok(skript.includes(`LETZTE_PG17=${LETZTE_VERSION_PG17}\n`), 'LETZTE_PG17 in start.sh wie LETZTE_VERSION_PG17');
    assert.match(
      skript,
      /if \[ "\$IST" = 17 \] && \[ "\$SOLL" = 18 \]; then[\s\S]{0,400}fehlerseite pg-17[\s\S]{0,40}else\s+fehlerseite pg-version/,
    );
    assert.match(skript, /initdb -D "\$PGDATA" -U postgres -E UTF8 --locale=C --data-checksums /);
    assert.doesNotMatch(skript, /\brm -rf? "?\$PGDATA/, 'start.sh löscht den Datenbank-Ordner nie');
  });

  it('dms-komplett bringt PostgreSQL 18 mit', () => {
    assert.match(lies('Dockerfile'), /^RUN apk add --no-cache postgresql18 postgresql18-contrib$/m);
  });

  it('die feste Version ist wirklich die letzte mit PostgreSQL 17', () => {
    // Vor dem Merge steht auf main noch diese Version; danach ist die nächste Version die mit #1464.
    const versionen = readdirSync(join(WURZEL, 'docs/releases'))
      .map((d) => /^v(\d+\.\d+\.\d+)\.md$/.exec(d)?.[1])
      .filter((v): v is string => !!v)
      .sort(vergleiche);
    assert.ok(versionen.includes(LETZTE_VERSION_PG17), `docs/releases/v${LETZTE_VERSION_PG17}.md fehlt`);
    const spaeter = versionen.filter((v) => vergleiche(v, LETZTE_VERSION_PG17) > 0);
    if (!spaeter.length) {
      const jetzt = JSON.parse(lies('package.json')).version;
      assert.equal(
        jetzt,
        LETZTE_VERSION_PG17,
        `Nach dem Rebase LETZTE_VERSION_PG17 (und LETZTE_PG17 in start.sh, Handbuch) auf ${jetzt} setzen`,
      );
    } else assert.match(lies(`docs/releases/v${spaeter[0]}.md`), /#1464/, `v${spaeter[0]} ist nicht die Version mit PostgreSQL 18`);
  });

  it('Handbuch und Release-Notiz nennen dieselbe Version (de/en)', () => {
    for (const p of ['docs/handbuch/admin/docs/aktualisieren.md', 'docs/handbuch/admin/docs-en/aktualisieren.md'])
      assert.ok(lies(p).includes(`dms-komplett:${LETZTE_VERSION_PG17}`), `${p} nennt dms-komplett:${LETZTE_VERSION_PG17}`);
  });
});
