/**
 * Integrationstest gegen ein echtes PostgreSQL und die HTTP-Schnittstelle.
 * Läuft nur mit TEST_DATABASE_URL (in GitHub Actions automatisch gesetzt).
 * ACHTUNG: leert das Schema „public“ der angegebenen Datenbank.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';

describe('PostgreSQL und HTTP', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any; let app: any;

  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { pgRepo } = await import('../src/repo-pg');
    const { Konten } = await import('../src/konten');
    const { pgKontoRepo } = await import('../src/konto-repo');
    sql = verbinde(url!);
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const dir = fileURLToPath(new URL('../migrations', import.meta.url));
    await migriere(sql, dir, () => {});
    await migriere(sql, dir, () => {}); // zweiter Lauf darf nichts tun
    app = await baueApp(new Dienst(pgRepo(sql, HAUSHALT)), new Konten(pgKontoRepo(sql, HAUSHALT), null, 'http://nas:3000'));
  });
  after(async () => { await app?.close(); await sql?.end(); });

  let cookie = '';
  const anfrage = async (method: string, pfad: string, payload?: unknown, mitCookie = true) => {
    const headers: Record<string, string> = { 'x-dms': '1' };
    if (mitCookie && cookie) headers.cookie = cookie;
    const r = await app.inject({ method, url: pfad, payload, headers });
    const gesetzt = r.headers['set-cookie'];
    if (gesetzt && mitCookie) cookie = String(gesetzt).split(';')[0];
    return { status: r.statusCode as number, body: r.body ? JSON.parse(r.body) : null };
  };

  it('verlangt eine Anmeldung und richtet den ersten Administrator ein', async () => {
    assert.equal((await anfrage('GET', '/api/typen')).status, 401);
    const st = await anfrage('GET', '/api/konto/status');
    assert.equal(st.body.einrichtungNoetig, true);
    const r = await anfrage('POST', '/api/konto/einrichten', { email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
    assert.equal(r.status, 201);
    assert.match(cookie, /^dms_sitzung=/);
    assert.equal((await anfrage('GET', '/api/konto/status')).body.benutzer.email, 'admin@example.org');
    assert.equal((await anfrage('POST', '/api/konto/einrichten', { email: 'x@example.org', passwort: 'ein-langes-passwort' }, false)).status, 409);
    // Ohne Kennung der Oberfläche werden ändernde Anfragen abgelehnt (CSRF-Schutz).
    const ohne = await app.inject({ method: 'POST', url: '/api/beispiele', headers: { cookie } });
    assert.equal(ohne.statusCode, 403);
  });

  it('lädt Beispiele und liefert Typen und Mappen', async () => {
    assert.equal((await anfrage('GET', '/api/gesundheit')).status, 200);
    assert.equal((await anfrage('POST', '/api/beispiele')).status, 204);
    assert.equal((await anfrage('POST', '/api/beispiele')).status, 409);
    const typen = (await anfrage('GET', '/api/typen')).body;
    assert.deepEqual(typen.map((t: { name: string }) => t.name), ['Rechnung', 'Vertrag', 'Vertragspartner', 'Zahlung']);
    assert.equal((await anfrage('GET', '/api/mappen')).body.length, 7);
  });

  it('liefert Rückverweise und schützt referenzierte Mappen vor dem Löschen', async () => {
    const mappen = (await anfrage('GET', '/api/mappen')).body;
    const sw = mappen.find((m: { werte: { name?: string } }) => m.werte.name === 'Stadtwerke Musterstadt');
    const r = await anfrage('GET', `/api/mappen/${sw.id}`);
    assert.equal(r.body.rueckverweise.length, 2);
    assert.equal((await anfrage('DELETE', `/api/mappen/${sw.id}`)).status, 409);
  });

  it('prüft eindeutige Werte und Pflichtfelder serverseitig', async () => {
    const typen = (await anfrage('GET', '/api/typen')).body;
    const partner = typen.find((t: { name: string }) => t.name === 'Vertragspartner');
    const doppelt = await anfrage('POST', '/api/mappen', { typId: partner.id, werte: { name: 'stadtwerke musterstadt' } });
    assert.equal(doppelt.status, 422);
    assert.ok(doppelt.body.details.felder.name);
    const leer = await anfrage('POST', '/api/mappen', { typId: partner.id, werte: {} });
    assert.equal(leer.status, 422);
    const neu = await anfrage('POST', '/api/mappen', { typId: partner.id, werte: { name: 'Neue Firma', art: 'Behörde' } });
    assert.equal(neu.status, 201);
    assert.equal((await anfrage('DELETE', `/api/mappen/${neu.body.id}`)).status, 204);
  });

  it('entfernt Verweise, wenn ein Referenzfeld aus dem Typ entfernt wird', async () => {
    const typen = (await anfrage('GET', '/api/typen')).body;
    const rechnung = typen.find((t: { name: string }) => t.name === 'Rechnung');
    const mappen = (await anfrage('GET', '/api/mappen')).body;
    const hb = mappen.find((m: { werte: { name?: string } }) => m.werte.name === 'Heizungsbau Beispiel GmbH');
    assert.equal((await anfrage('GET', `/api/mappen/${hb.id}`)).body.rueckverweise.length, 2);
    const geaendert = await anfrage('PUT', `/api/typen/${rechnung.id}`, { ...rechnung, felder: rechnung.felder.filter((f: { key: string }) => f.key !== 'aussteller') });
    assert.equal(geaendert.status, 200);
    assert.equal((await anfrage('GET', `/api/mappen/${hb.id}`)).body.rueckverweise.length, 1);
  });

  it('verweigert das Löschen eines Typs mit Mappen und meldet unbekannte Ids', async () => {
    const typen = (await anfrage('GET', '/api/typen')).body;
    const vertrag = typen.find((t: { name: string }) => t.name === 'Vertrag');
    const r = await anfrage('DELETE', `/api/typen/${vertrag.id}`);
    assert.equal(r.status, 409);
    assert.ok(r.body.details.gruende.length >= 1);
    assert.equal((await anfrage('GET', '/api/mappen/gibt-es-nicht')).status, 404);
    assert.equal((await anfrage('GET', '/api/gibt-es-nicht')).status, 404);
  });

  it('lädt Mitglieder per Link ein und beschränkt sie auf ihre Rolle', async () => {
    const r = await anfrage('POST', '/api/benutzer', { email: 'mitglied@example.org', name: 'Mitglied', rolle: 'mitglied' });
    assert.equal(r.status, 201);
    assert.equal(r.body.mailVerschickt, false);
    const schluessel = r.body.link.split('/passwort/')[1];
    assert.equal((await anfrage('GET', `/api/konto/link/${schluessel}`, undefined, false)).body.zweck, 'einladung');
    const adminCookie = cookie;
    const gesetzt = await anfrage('POST', '/api/konto/passwort-setzen', { schluessel, passwort: 'mitglied-passwort' });
    assert.equal(gesetzt.status, 200);
    assert.notEqual(cookie, adminCookie);
    assert.equal((await anfrage('GET', '/api/benutzer')).status, 403);
    assert.equal((await anfrage('GET', '/api/typen')).status, 200);
    const typen = (await anfrage('GET', '/api/typen')).body;
    const partner = typen.find((t: { name: string }) => t.name === 'Vertragspartner');
    const m = await anfrage('POST', '/api/mappen', { typId: partner.id, werte: { name: 'Vom Mitglied' } });
    assert.equal(m.body.erstelltVon, gesetzt.body.benutzer.id);
    assert.equal((await anfrage('POST', '/api/typen', { name: 'Verboten', felder: [] })).status, 403);
    assert.equal((await anfrage('POST', '/api/konto/abmelden')).status, 204);
    assert.equal((await anfrage('GET', '/api/typen')).status, 401);
    cookie = adminCookie;
  });
});
