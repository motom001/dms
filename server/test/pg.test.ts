/**
 * Integrationstest gegen ein echtes PostgreSQL und die HTTP-Schnittstelle.
 * Läuft nur mit TEST_DATABASE_URL (in GitHub Actions automatisch gesetzt).
 * ACHTUNG: leert das Schema „public“ der angegebenen Datenbank.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const ordner = await mkdtemp(join(tmpdir(), 'dms-test-'));
    sql = verbinde(url!);
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const dir = fileURLToPath(new URL('../migrations', import.meta.url));
    await migriere(sql, dir, () => {});
    await migriere(sql, dir, () => {}); // zweiter Lauf darf nichts tun
    const { Messung, pgMessSpeicher } = await import('../src/messung');
    const messung = new Messung(pgMessSpeicher(sql, HAUSHALT));
    await messung.start();
    app = await baueApp(new Dienst(messung.umhuelle(pgRepo(sql, HAUSHALT), 'mappen'), ordnerSpeicher(ordner, HAUSHALT)),
      new Konten(messung.umhuelle(pgKontoRepo(sql, HAUSHALT), 'konto'), null, 'http://nas:3000'), {
        messung, system: (await import('../src/system')).pgSystemQuelle(sql, HAUSHALT),
        // Kein Internet im Test: Abgleich mit festen Antworten.
        abruf: async (url: string) => { if (url.includes('npmjs')) return { version: '99.0.0' }; throw new Error('offline'); },
      });
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

  it('lädt Dokumente hoch und liefert sie sicher aus', async () => {
    const mappen = (await anfrage('GET', '/api/mappen')).body;
    const rechnung = mappen.find((m: { werte: { rechnungsnummer?: string } }) => m.werte.rechnungsnummer === 'R-2026-117');
    const hoch = async (name: string, inhalt: Buffer, typ: string) => {
      const r = await app.inject({ method: 'POST', url: `/api/mappen/${rechnung.id}/dokumente?register=dokumente&name=${encodeURIComponent(name)}&typ=${encodeURIComponent(typ)}`,
        payload: inhalt, headers: { 'x-dms': '1', cookie, 'content-type': 'application/octet-stream' } });
      return { status: r.statusCode, body: JSON.parse(r.body) };
    };
    const pdf = await hoch('Rechnung März.pdf', Buffer.from('%PDF-1.7\n%%EOF'), 'application/pdf');
    assert.equal(pdf.status, 201);
    assert.equal(pdf.body.dokument.anzeigbar, true);
    const html = await hoch('x.html', Buffer.from('<script>alert(1)</script>'), 'text/html');
    assert.equal(html.body.dokument.anzeigbar, false);

    const a = await app.inject({ method: 'GET', url: `/api/dokumente/${pdf.body.dokument.id}/inhalt`, headers: { cookie } });
    assert.equal(a.statusCode, 200);
    assert.equal(a.headers['content-type'], 'application/pdf');
    assert.match(String(a.headers['content-disposition']), /^inline;.*filename\*=UTF-8''Rechnung%20M%C3%A4rz\.pdf/);
    assert.equal(a.body, '%PDF-1.7\n%%EOF');
    const b = await app.inject({ method: 'GET', url: `/api/dokumente/${html.body.dokument.id}/inhalt`, headers: { cookie } });
    assert.equal(b.headers['content-type'], 'application/octet-stream');
    assert.match(String(b.headers['content-disposition']), /^attachment/);
    assert.match(String(b.headers['content-security-policy']), /sandbox/);
    assert.equal((await app.inject({ method: 'GET', url: `/api/dokumente/${pdf.body.dokument.id}/inhalt` })).statusCode, 401);

    const m = await anfrage('GET', `/api/mappen/${rechnung.id}`);
    assert.equal(m.body.dokumente.length, 2);
    assert.equal((await anfrage('DELETE', `/api/dokumente/${html.body.dokument.id}`)).status, 204);
    assert.equal((await anfrage('DELETE', `/api/mappen/${rechnung.id}`)).status, 204);
  });

  it('speichert Titel und zieht sie bei Änderungen nach', async () => {
    const typen = (await anfrage('GET', '/api/typen')).body;
    const partnerTyp = typen.find((t: { name: string }) => t.name === 'Vertragspartner');
    const vertragTyp = typen.find((t: { name: string }) => t.name === 'Vertrag');
    const p = (await anfrage('POST', '/api/mappen', { typId: partnerTyp.id, werte: { name: 'Titeltest GmbH' } })).body;
    assert.equal(p.titel, 'Titeltest GmbH');
    const pflicht = Object.fromEntries(vertragTyp.felder.filter((f: { pflicht?: boolean }) => f.pflicht).map((f: { key: string; typ: string }) =>
      [f.key, f.typ === 'referenz' ? p.id : f.typ === 'datum' ? '2026-01-01' : f.typ === 'betrag' ? { betrag: 1, waehrung: 'EUR' } : f.typ === 'zahl' ? 1 : 'X']));
    const ref = vertragTyp.felder.find((f: { typ: string; zielTyp?: string }) => f.typ === 'referenz' && f.zielTyp === partnerTyp.id);
    const r = await anfrage('PUT', `/api/typen/${vertragTyp.id}`, { ...vertragTyp, titelVorlage: `{${ref.key}} seit {angelegt}` });
    assert.equal(r.status, 200);
    const v = await anfrage('POST', '/api/mappen', { typId: vertragTyp.id, werte: { ...pflicht, [ref.key]: p.id } });
    assert.equal(v.status, 201);
    assert.match(v.body.titel, /^Titeltest GmbH seit \d{2}\.\d{2}\.\d{4}$/);
    await anfrage('PUT', `/api/mappen/${p.id}`, { werte: { name: 'Titeltest AG' } });
    assert.match((await anfrage('GET', `/api/mappen/${v.body.id}`)).body.mappe.titel, /^Titeltest AG seit /);
    assert.ok((await anfrage('GET', '/api/mappen')).body.every((m: { titel?: string }) => typeof m.titel === 'string'));
    assert.equal((await anfrage('PUT', `/api/typen/${vertragTyp.id}`, vertragTyp)).status, 200);
    assert.equal((await anfrage('DELETE', `/api/mappen/${v.body.id}`)).status, 204);
    assert.equal((await anfrage('DELETE', `/api/mappen/${p.id}`)).status, 204);
  });

  it('erzeugt Demo-Daten, entfernt sie und ändert das eigene Passwort', async () => {
    // Läuft im Hintergrund: sofort 202, dann den Auftrag abfragen, bis er fertig ist.
    const auftrag = async () => {
      for (;;) {
        const a = (await anfrage('GET', '/api/werkbank/auftrag')).body;
        if (a.status !== 'laeuft') return a;
        await new Promise((x) => setTimeout(x, 50));
      }
    };
    const start = await anfrage('POST', '/api/werkbank/demo', { anzahl: 1200 });
    assert.equal(start.status, 202);
    assert.equal(start.body.status, 'laeuft');
    assert.equal((await anfrage('POST', '/api/werkbank/demo', { anzahl: 1 })).status, 409);
    const fertig = await auftrag();
    assert.equal(fertig.status, 'fertig', fertig.fehler);
    const r = fertig.ergebnis;
    assert.deepEqual(r.uebersprungen, []);
    assert.equal(fertig.fertig, r.gesamt);
    const u = (await anfrage('GET', '/api/werkbank/demo')).body;
    assert.equal(u.reduce((a: number, t: { demo: number }) => a + t.demo, 0), r.gesamt);
    const mappen = (await anfrage('GET', '/api/mappen')).body;
    assert.ok(mappen.filter((m: { demo?: boolean }) => m.demo).every((m: { titel?: string }) => m.titel), 'Demo-Mappen haben Titel');
    // Seitenweise laden, zählen, suchen
    const typen = (await anfrage('GET', '/api/typen')).body;
    const rechnungTyp = typen.find((t: { name: string }) => t.name === 'Rechnung');
    const zaehler = (await anfrage('GET', '/api/sichten')).body;
    const anzahlRechnungen = zaehler.typen[rechnungTyp.id].anzahl;
    assert.ok(anzahlRechnungen > 300, `nur ${anzahlRechnungen} Rechnungen`);
    assert.equal(zaehler.typen[rechnungTyp.id].unpassend, 0);
    const s1 = (await anfrage('GET', `/api/mappen?sicht=${rechnungTyp.id}&von=0&anzahl=100`)).body;
    assert.equal(s1.gesamt, anzahlRechnungen);
    assert.equal(s1.mappen.length, 100);
    assert.ok(Object.keys(s1.bezuege).length > 0, 'Bezüge für Verweise');
    const s2 = (await anfrage('GET', `/api/mappen?sicht=${rechnungTyp.id}&von=100&anzahl=100`)).body;
    assert.equal(new Set([...s1.mappen, ...s2.mappen].map((m: { id: string }) => m.id)).size, 200, 'keine Überschneidung');
    const such = s1.mappen[5].werte.rechnungsnummer;
    const treffer = (await anfrage('GET', `/api/mappen?sicht=${rechnungTyp.id}&suche=${encodeURIComponent(such)}`)).body;
    assert.ok(treffer.mappen.some((m: { id: string }) => m.id === s1.mappen[5].id));
    assert.equal((await anfrage('GET', `/api/mappen?sicht=${rechnungTyp.id}&suche=${encodeURIComponent('%_\\')}`)).body.gesamt, 0);
    const eingang = (await anfrage('GET', '/api/mappen?sicht=eingang')).body;
    assert.equal(eingang.gesamt, zaehler.eingang);
    const belegung = (await anfrage('GET', `/api/typen/${rechnungTyp.id}/belegung`)).body;
    assert.ok(belegung.rechnungsnummer > 0);
    const detail = (await anfrage('GET', `/api/mappen/${s1.mappen[0].id}`)).body;
    assert.ok(Object.values(detail.bezuege).every((b) => typeof (b as { titel: string }).titel === 'string'));

    assert.equal((await anfrage('DELETE', '/api/werkbank/demo')).status, 202);
    assert.equal((await auftrag()).ergebnis.entfernt, r.gesamt);

    assert.equal((await anfrage('PUT', '/api/konto/passwort', { passwortAlt: 'falsch-falsch', passwortNeu: 'neues-admin-passwort' })).status, 403);
    const alt = cookie;
    assert.equal((await anfrage('PUT', '/api/konto/passwort', { passwortAlt: 'ein-langes-passwort', passwortNeu: 'neues-admin-passwort' })).status, 200);
    assert.notEqual(cookie, alt);
    assert.equal((await app.inject({ method: 'GET', url: '/api/typen', headers: { cookie: alt } })).statusCode, 401);
    assert.equal((await anfrage('GET', '/api/typen')).status, 200);
  });

  it('zeigt Sitzungen, beendet sie und lässt den Admin als Mitglied agieren', async () => {
    const mitglied = (await anfrage('GET', '/api/benutzer')).body.find((x: { email: string }) => x.email === 'mitglied@example.org');
    const login = await app.inject({ method: 'POST', url: '/api/konto/anmelden', headers: { 'x-dms': '1', 'user-agent': 'Mozilla/5.0 (iPhone) Safari/604.1' },
      payload: { email: 'mitglied@example.org', passwort: 'mitglied-passwort' } });
    assert.equal(login.statusCode, 200);
    const mitgliedCookie = String(login.headers['set-cookie']).split(';')[0];
    const sitzungen = (await anfrage('GET', `/api/benutzer/${mitglied.id}/sitzungen`)).body;
    assert.equal(sitzungen.length, 1);
    assert.match(sitzungen[0].geraet, /iPhone/);
    assert.ok((await anfrage('GET', '/api/benutzer')).body.find((x: { id: string }) => x.id === mitglied.id).zuletztAktiv);
    assert.equal((await anfrage('DELETE', `/api/benutzer/${mitglied.id}/sitzungen/${sitzungen[0].id}`)).status, 204);
    assert.equal((await app.inject({ method: 'GET', url: '/api/typen', headers: { cookie: mitgliedCookie } })).statusCode, 401);

    const adminCookie = cookie;
    const v = await anfrage('POST', `/api/benutzer/${mitglied.id}/vertreten`);
    assert.equal(v.status, 200);
    assert.notEqual(cookie, adminCookie);
    const st = (await anfrage('GET', '/api/konto/status')).body;
    assert.equal(st.benutzer.id, mitglied.id);
    assert.equal(st.vertretung.adminName, 'Admin');
    assert.deepEqual(st.hinweise, []);
    assert.equal((await anfrage('GET', '/api/benutzer')).status, 403, 'nur die Rechte des Mitglieds');
    const z = await anfrage('POST', '/api/konto/vertretung-beenden');
    assert.equal(z.body.benutzer.email, 'admin@example.org');
    assert.equal((await anfrage('GET', '/api/benutzer')).status, 200);

    const wieder = await app.inject({ method: 'POST', url: '/api/konto/anmelden', headers: { 'x-dms': '1' }, payload: { email: 'mitglied@example.org', passwort: 'mitglied-passwort' } });
    const mc = String(wieder.headers['set-cookie']).split(';')[0];
    const hinweise = JSON.parse((await app.inject({ method: 'GET', url: '/api/konto/status', headers: { cookie: mc } })).body).hinweise;
    assert.equal(hinweise.length, 1);
    assert.equal(hinweise[0].adminName, 'Admin');
    assert.equal((await app.inject({ method: 'POST', url: '/api/konto/hinweise/gesehen', headers: { cookie: mc, 'x-dms': '1' } })).statusCode, 204);
    assert.deepEqual(JSON.parse((await app.inject({ method: 'GET', url: '/api/konto/status', headers: { cookie: mc } })).body).hinweise, []);
    assert.deepEqual((await anfrage('DELETE', `/api/benutzer/${mitglied.id}/sitzungen`)).body, { beendet: 1 });
  });

  it('protokolliert Anfragen und Aktionen und schaltet den Debug-Modus', async () => {
    const r = (await anfrage('GET', '/api/werkbank/protokoll?modul=ablage&suche=Titeltest')).body;
    assert.ok(r.eintraege.some((e: { text: string; benutzer?: string }) => e.text === 'Mappe angelegt' && e.benutzer === 'admin@example.org'));
    assert.ok(r.module.includes('konto'));
    const fehl = (await anfrage('GET', '/api/werkbank/protokoll?modul=konto&stufe=warn')).body.eintraege;
    assert.ok(fehl.some((e: { text: string }) => e.text === 'Administrator agiert als anderer Benutzer'));
    const d = (await anfrage('PUT', '/api/werkbank/debug', { an: true })).body;
    assert.equal(d.an, true);
    await anfrage('GET', '/api/sichten');
    const dbg = (await anfrage('GET', `/api/werkbank/protokoll?seit=${r.letzte}&stufe=debug`)).body.eintraege;
    assert.ok(dbg.some((e: { text: string }) => e.text === 'GET /api/sichten 200'), 'Anfragen im Debug-Modus sichtbar');
    assert.equal((await anfrage('PUT', '/api/werkbank/debug', { an: false })).body.an, false);
  });

  it('misst Datenbankzugriffe und merkt sich lange', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/sichten', headers: { cookie } });
    assert.match(String(r.headers['server-timing']), /^app;dur=[\d.]+, db;dur=[\d.]+;desc="\d+"$/);
    assert.ok(Number(/desc="(\d+)"/.exec(String(r.headers['server-timing']))![1]) >= 2, 'Sitzung und Zähler');
    // Schwelle auf 1 ms: dann gilt praktisch jeder Zugriff als lang.
    assert.equal((await anfrage('PUT', '/api/werkbank/datenbank', { schwelleMs: 0, tage: 7 })).status, 422);
    assert.deepEqual((await anfrage('PUT', '/api/werkbank/datenbank', { schwelleMs: 1, tage: 7 })).body, { schwelleMs: 1, tage: 7 });
    await anfrage('GET', '/api/mappen?sicht=eingang&suche=xyz');
    await anfrage('PUT', `/api/typen/${(await anfrage('GET', '/api/typen')).body[0].id}`, (await anfrage('GET', '/api/typen')).body[0]);
    await new Promise((x) => setTimeout(x, 100));
    const d = (await anfrage('GET', '/api/werkbank/datenbank')).body;
    assert.deepEqual(d.einstellungen, { schwelleMs: 1, tage: 7 });
    assert.ok(Array.isArray(d.laufend));
    assert.ok(d.langlaeufer.length >= 1, 'mindestens ein Zugriff über 1 ms');
    assert.match(d.langlaeufer[0].zugriff, /^(mappen|konto)\./);
    assert.equal((await anfrage('PUT', '/api/werkbank/datenbank', { schwelleMs: 500, tage: 30 })).status, 200);
    // Entwicklermodus im Profil
    assert.equal((await anfrage('PUT', '/api/konto/profil', { entwicklermodus: true })).body.entwicklermodus, true);
    assert.equal((await anfrage('GET', '/api/konto/status')).body.benutzer.entwicklermodus, true);
  });

  it('zeigt Technik und Versionen und gleicht sie auf Knopfdruck ab', async () => {
    const u = (await anfrage('GET', '/api/werkbank/system')).body;
    assert.match(u.datenbank.version, /^17/);
    assert.ok(u.datenbank.mappen >= 1);
    assert.equal(u.bibliotheken.fastify?.split('.')[0], '5');
    assert.ok(!JSON.stringify(u).includes('dms:dms'), 'keine Zugangsdaten');
    const r = (await anfrage('POST', '/api/werkbank/system/abgleich', { browser: { react: '19.0.0' } })).body;
    assert.equal(r.find((v: { komponente: string }) => v.komponente === 'fastify').status, 'neuer');
    assert.equal(r.find((v: { komponente: string }) => v.komponente === 'Node.js').status, 'unbekannt');
    assert.ok(r.some((v: { komponente: string }) => v.komponente === 'react'));
  });
});
