/** Einrichtungsassistent (#119): Anbindung, Einrichtungscode, Einrichtungsmodus, Mandant und Administrator. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { alsUrl, anbindungAus, AnbindungVerwaltung, ausUrl, ausVariablen, deute, liesAnbindung, schreibeAnbindung, type Anbindung, type Pruefung } from '../src/anbindung';
import { Einrichtung } from '../src/einrichtung';
import { Einrichtungscode, neuerCode } from '../src/einrichtungscode';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';

const ordner = () => mkdtemp(join(tmpdir(), 'dms-einrichtung-'));
const A: Anbindung = { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'gä#heim/1' };

describe('Datenbank-Anbindung (#119)', () => {
  it('URL hin und zurück, auch mit Sonderzeichen im Passwort', () => {
    const url = alsUrl(A);
    assert.equal(url, 'postgres://dms:g%C3%A4%23heim%2F1@db:5432/dms');
    assert.deepEqual(ausUrl(url), A);
    assert.equal(ausUrl('mysql://x@y/z'), null);
    assert.equal(ausUrl('kaputt'), null);
  });

  it('DMS_DB_PASSWORT (#184): Standard-Anbindung mit Passwort, Host änderbar, Sonderzeichen ohne Maskieren', () => {
    assert.equal(ausVariablen({}), null);
    assert.deepEqual(ausVariablen({ DMS_DB_PASSWORT: 'a:b@c/d' }), { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'a:b@c/d' });
    assert.equal(ausVariablen({ DMS_DB_PASSWORT: 'x', DMS_DB_HOST: 'datenbank' })?.host, 'datenbank');
    assert.equal(ausVariablen({ DMS_DB_PASSWORT: 'x', DMS_DB_PORT: '5433' })?.port, 5433);
    assert.equal(ausVariablen({ DMS_DB_PASSWORT: 'x', DMS_DB_PORT: 'kaputt' })?.port, 5432);
  });

  it('Eingabe prüfen; leeres Passwort heißt „wie bisher“', () => {
    assert.throws(() => anbindungAus({ host: '', port: 99999, datenbank: '', benutzer: '' }, null), (e: unknown) => e instanceof Fachfehler && Object.keys((e.details as { felder: object }).felder).length === 4);
    assert.equal(anbindungAus({ host: 'db', port: '5432', datenbank: 'dms', benutzer: 'dms', passwort: '' }, A).passwort, A.passwort);
    assert.equal(anbindungAus({ host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'neu' }, A).passwort, 'neu');
  });

  it('verständliche Meldungen', () => {
    assert.equal(deute({ code: 'ENOTFOUND' }, A).art, 'nicht_erreichbar');
    assert.equal(deute({ code: 'ECONNREFUSED' }, A).art, 'nicht_erreichbar');
    assert.match(deute({ code: '28P01' }, A).text, /Passwort für den Benutzer „dms“ ist falsch/);
    assert.equal(deute({ code: '3D000' }, A).art, 'datenbank_fehlt');
  });

  it('Datei nur für den Besitzer lesbar, mit Mandant', async () => {
    const o = await ordner();
    await schreibeAnbindung(o, { ...A, mandant: '00000000-0000-4000-8000-000000000001' });
    assert.equal((await stat(join(o, 'datenbank.json'))).mode & 0o777, 0o600);
    assert.deepEqual(await liesAnbindung(o), { ...A, mandant: '00000000-0000-4000-8000-000000000001' });
    assert.equal(await liesAnbindung(join(o, 'fehlt')), null);
  });

  it('Werkbank: erst testen, leere Datenbank nur mit Bestätigung, Hinweis auf DATABASE_URL', async () => {
    const o = await ordner();
    let antwort: Pruefung = { ok: false, art: 'anmeldung', text: 'Passwort falsch', technisch: '28P01' };
    const v = new AnbindungVerwaltung(o, { ...A, mandant: 'm' }, { ...A, host: 'anders' }, () => {}, async () => antwort);
    assert.equal(v.stand().umgebung, 'abweichend');
    assert.equal(v.stand().anbindung.passwortGesetzt, true);
    assert.ok(!('passwort' in v.stand().anbindung));
    await assert.rejects(v.speichere({ host: 'db2', port: 5432, datenbank: 'dms', benutzer: 'dms' }, 'admin'), /Passwort falsch/);
    antwort = { ok: true, postgres: '17', eingerichtet: false, benutzer: 0 };
    await assert.rejects(v.speichere({ host: 'db2', port: 5432, datenbank: 'dms', benutzer: 'dms' }, 'admin'), (e: unknown) => e instanceof Fachfehler && e.status === 409);
    antwort = { ok: true, postgres: '17', eingerichtet: true, benutzer: 3 };
    const s = await v.speichere({ host: 'db2', port: 5432, datenbank: 'dms', benutzer: 'dms' }, 'admin');
    assert.equal(s.neustartNoetig, true);
    const datei = await liesAnbindung(o);
    assert.equal(datei?.host, 'db2');
    assert.equal(datei?.passwort, A.passwort, 'Passwort bleibt');
    assert.equal(datei?.mandant, 'm', 'Mandant bleibt');
  });
});

describe('Einrichtungscode (#119)', () => {
  it('Format ohne verwechselbare Zeichen', () => {
    for (let i = 0; i < 50; i++) assert.match(neuerCode(), /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  });

  it('Datei, Prüfung ohne Groß-/Kleinschreibung und Bindestriche, Sperre, Entfernen', async () => {
    const o = await ordner();
    let jetzt = 0;
    const c = new Einrichtungscode(o, () => jetzt);
    const code = await c.bereitstellen();
    assert.equal((await readFile(join(o, 'EINRICHTUNGSCODE'), 'utf8')).trim(), code);
    assert.equal(await new Einrichtungscode(o).bereitstellen(), code, 'bleibt über Neustarts gleich');
    c.pruefe(code.toLowerCase().replace(/-/g, ' '));
    assert.throws(() => c.pruefe(undefined), /Bitte den Einrichtungscode eingeben/);
    for (let i = 0; i < 9; i++) assert.throws(() => c.pruefe('AAAA-AAAA-AAAA'), /stimmt nicht/);
    assert.throws(() => c.pruefe(code), /Zu viele/);
    jetzt += 11 * 60_000;
    c.pruefe(code);
    await c.entfernen();
    assert.ok(!existsSync(join(o, 'EINRICHTUNGSCODE')));
    assert.throws(() => c.pruefe(code), /bereits abgeschlossen/);
  });

  it('abgeschaltet (DMS_EINRICHTUNGSCODE=aus, #176): keine Datei, jede Eingabe gilt', async () => {
    const o = await ordner();
    const c = new Einrichtungscode(o, Date.now, true);
    assert.equal(await c.bereitstellen(), '');
    assert.ok(!existsSync(join(o, 'EINRICHTUNGSCODE')));
    assert.equal(c.noetig, false);
    assert.equal(c.aktiv, false);
    c.pruefe(undefined);
    assert.equal(c.stimmt(undefined), true);
    const konten = new Konten(speicherKontoRepo(), null, 'http://dms');
    let name: string | null = 'Mandant';
    const e = new Einrichtung({ konten, code: c, einstellungen: speicherEinstellungen(), mandant: { name: async () => name, umbenennen: async (n) => { name = n; } }, schriftzug: async () => {} });
    assert.equal(e.codeNoetig, false);
    const r = await e.einrichten({ mandant: 'Familie Ohne Code', name: 'Admin', email: 'admin@example.org', passwort: 'ein-langes-passwort' }, undefined, { ip: '1', geraet: '' });
    assert.equal(r.benutzer.rolle, 'admin');
    await assert.rejects(e.einrichten({ mandant: 'X', name: 'B', email: 'b@example.org', passwort: 'ein-langes-passwort' }, undefined, { ip: '1', geraet: '' }), /bereits abgeschlossen/);
  });
});

// Fastify fehlt in manchen lokalen Umgebungen; in der CI läuft der Test immer.
const mitFastify = await import('fastify').then(() => true, () => false);

describe('Einrichtungsmodus ohne Datenbank (#119)', () => {
  it('nur mit Code; prüft, legt an, übernimmt und gibt den Port frei', { skip: !mitFastify && 'fastify nicht installiert' }, async () => {
    const { einrichtungsmodus } = await import('../src/einrichtungsmodus');
    const o = await ordner();
    const code = new Einrichtungscode(o);
    const port = 4300 + Math.floor(Math.random() * 500);
    let vorhanden = false;
    const fertig = einrichtungsmodus({
      geheim: o, code, vorbelegt: null, quelle: null, fehler: null, port, host: '127.0.0.1',
      pruefe: async (a) => (vorhanden ? { ok: true, postgres: '17', eingerichtet: false, benutzer: 0 } : { ok: false, ...deute({ code: '3D000' }, a), anlegenMoeglich: true }),
      anlegen: async () => { vorhanden = true; },
    });
    const url = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50 && !existsSync(join(o, 'EINRICHTUNGSCODE')); i++) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 100));
    const c = (await readFile(join(o, 'EINRICHTUNGSCODE'), 'utf8')).trim();
    const post = (pfad: string, body: unknown, mitCode = c) => fetch(url + pfad, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dms': '1', 'x-einrichtungscode': mitCode }, body: JSON.stringify(body) });
    const st = await (await fetch(`${url}/api/konto/status`)).json() as { einrichtung: { phase: string } };
    assert.equal(st.einrichtung.phase, 'datenbank');
    assert.equal((await fetch(`${url}/api/mappen`)).status, 503);
    const eingabe = { anbindung: { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'x' } };
    assert.equal((await post('/api/einrichtung/datenbank/pruefen', eingabe, 'FALSCH')).status, 403);
    const p = await (await post('/api/einrichtung/datenbank/pruefen', eingabe)).json() as { ok: boolean; art: string; anlegenMoeglich: boolean };
    assert.equal(p.art, 'datenbank_fehlt');
    assert.equal(p.anlegenMoeglich, true);
    assert.equal((await (await post('/api/einrichtung/datenbank/anlegen', eingabe)).json() as { ok: boolean }).ok, true);
    assert.equal((await post('/api/einrichtung/datenbank/uebernehmen', eingabe)).status, 200);
    const a = await fertig;
    assert.equal(a.host, 'db');
    assert.equal((await liesAnbindung(o))?.passwort, 'x');
    await assert.rejects(fetch(`${url}/api/konto/status`), 'Port ist wieder frei');
  });
});

describe('Mandant und Administrator mit Code (#119)', () => {
  it('legt beides an, setzt Schriftzug, löscht den Code, merkt die weiteren Schritte', async () => {
    const o = await ordner();
    const code = new Einrichtungscode(o);
    const c = await code.bereitstellen();
    const konten = new Konten(speicherKontoRepo(), null, 'http://dms');
    let name: string | null = 'Mandant';
    let schriftzug = '';
    const e = new Einrichtung({ konten, code, einstellungen: speicherEinstellungen(), mandant: { name: async () => name, umbenennen: async (n) => { name = n; } }, schriftzug: async (t) => { schriftzug = t; } });
    const daten = { mandant: '  Familie   Muster ', name: 'Admin', email: 'admin@example.org', passwort: 'ein-langes-passwort' };
    await assert.rejects(e.einrichten(daten, 'FALSCH', { ip: '1', geraet: '' }), /stimmt nicht/);
    await assert.rejects(e.einrichten({ ...daten, mandant: '' }, c, { ip: '1', geraet: '' }), /Namen angeben/);
    const r = await e.einrichten(daten, c, { ip: '1', geraet: '' });
    assert.equal(r.benutzer.rolle, 'admin');
    assert.equal(name, 'Familie Muster');
    assert.equal(schriftzug, 'Familie Muster');
    assert.equal(e.codeNoetig, false);
    assert.ok(!existsSync(code.datei));
    assert.deepEqual(await e.stand(), { offen: true, erledigt: [], uebersprungen: [], mandant: 'Familie Muster' });
    await e.merke('benutzer', false, 'admin');
    await e.merke('optional', true, 'admin');
    const s = await e.merke('fertig', false, 'admin');
    assert.equal(s.offen, false);
    assert.deepEqual(s.uebersprungen, ['optional']);
    await assert.rejects(e.einrichten(daten, c, { ip: '1', geraet: '' }), /bereits abgeschlossen/);
  });
});

describe('Anbindung und Mandant gegen PostgreSQL (#119)', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('fehlende Datenbank erkennen, anlegen, migrieren; Mandant bestimmen und merken', async () => {
    const { pruefeAnbindung, legeDatenbankAn } = await import('../src/anbindung');
    const { verbinde, migriere } = await import('../src/db');
    const { bestimmeMandant, STANDARD_MANDANT } = await import('../src/mandant');
    const basis = ausUrl(process.env.TEST_DATABASE_URL)!;
    const a: Anbindung = { ...basis, datenbank: `dms_einr_${Date.now().toString(36)}` };
    const fehlt = await pruefeAnbindung(a);
    assert.equal(fehlt.ok, false);
    assert.equal(!fehlt.ok && fehlt.art, 'datenbank_fehlt');
    assert.equal(!fehlt.ok && fehlt.anlegenMoeglich, true);
    await legeDatenbankAn(a);
    try {
      const leer = await pruefeAnbindung(a);
      assert.deepEqual(leer.ok && [leer.eingerichtet, leer.benutzer], [false, 0]);
      const sql = verbinde(alsUrl(a));
      try {
        await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
        const gemerkt: Anbindung[] = [];
        const neu = await bestimmeMandant(sql, { ...a }, {}, async (x) => { gemerkt.push(x); });
        assert.deepEqual([neu.id, neu.quelle], [STANDARD_MANDANT, 'neu']);
        assert.equal(gemerkt[0].mandant, STANDARD_MANDANT);
        // Bisherige Installation mit eigener HAUSHALT_ID: wird übernommen, Hinweis zum Entfernen
        const id = '11111111-1111-4111-8111-111111111111';
        const env = await bestimmeMandant(sql, { ...a }, { HAUSHALT_ID: id }, async () => {});
        assert.deepEqual([env.id, env.quelle], [id, 'umgebung']);
        assert.match(env.hinweis ?? '', /entfernt werden/);
        // Bisherige Installation ohne Variable: der Mandant mit Benutzern
        await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (gen_random_uuid(), ${id}, 'x@example.org', 'X', 'admin')`;
        const bestand = await bestimmeMandant(sql, { ...a }, {}, async () => {});
        assert.deepEqual([bestand.id, bestand.quelle], [id, 'bestand']);
        // Datei ist führend
        const datei = await bestimmeMandant(sql, { ...a, mandant: STANDARD_MANDANT }, { HAUSHALT_ID: id }, async () => { throw new Error('nichts zu merken'); });
        assert.deepEqual([datei.id, datei.quelle], [STANDARD_MANDANT, 'datei']);
        assert.match(datei.hinweis ?? '', /weicht .* ab/);
        const ok = await pruefeAnbindung(a);
        assert.deepEqual(ok.ok && [ok.eingerichtet, ok.benutzer], [true, 1]);
      } finally { await sql.end(); }
    } finally {
      const admin = verbinde(alsUrl(basis));
      await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`);
      await admin.end();
    }
  });
});
