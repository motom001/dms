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
  let sql: any; let app: any; let betrieb: any;

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
    // Wie im Betrieb (index.ts): Konten spiegeln Benutzer in Mappen (#26).
    const dienst = new Dienst(messung.umhuelle(pgRepo(sql, HAUSHALT), 'mappen'), ordnerSpeicher(ordner, HAUSHALT));
    const { Betrieb, pgBetriebSpeicher } = await import('../src/betrieb');
    betrieb = new Betrieb(pgBetriebSpeicher(sql, HAUSHALT));
    await betrieb.laden();
    await betrieb.speichereAdresse('http://nas:3000');
    const konten = new Konten(messung.umhuelle(pgKontoRepo(sql, HAUSHALT), 'konto'), () => betrieb.mailer(), () => betrieb.adresseFuerLinks(), dienst.benutzerspiegel());
    await dienst.gleicheBenutzerAb(await konten.listeBenutzer());
    app = await baueApp(dienst, konten, {
        betrieb, sicher: () => betrieb.cookieNurHttps(),
        messung, system: (await import('../src/system')).pgSystemQuelle(sql, HAUSHALT),
        designs: new (await import('../src/designs')).Designs((await import('../src/designs')).pgDesignRepo(sql, HAUSHALT)),
        apiSchluessel: new (await import('../src/apischluessel')).ApiSchluesselDienst((await import('../src/apischluessel')).pgApiSchluesselRepo(sql)),
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
    const eigene = typen.filter((t: { system?: string | null }) => !t.system);
    assert.deepEqual(eigene.map((t: { name: string }) => t.name), ['Rechnung', 'Vertrag', 'Vertragspartner', 'Zahlung']);
    assert.deepEqual(typen.filter((t: { system?: string | null }) => t.system).map((t: { system: string }) => t.system).sort(), ['benutzer', 'rolle']);
    const ids = new Set(eigene.map((t: { id: string }) => t.id));
    assert.equal((await anfrage('GET', '/api/mappen')).body.filter((m: { typId: string }) => ids.has(m.typId)).length, 7);
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
    // Sortierung auf dem Server
    const nachBetrag = (await anfrage('GET', `/api/mappen?sicht=${rechnungTyp.id}&anzahl=50&sortierung=betrag&absteigend=true`)).body.mappen;
    const betraege = nachBetrag.map((m: { werte: { betrag?: { betrag: number } } }) => m.werte.betrag?.betrag ?? -1);
    assert.deepEqual(betraege, [...betraege].sort((a: number, b: number) => b - a), 'absteigend nach Betrag');
    const nachDatum = (await anfrage('GET', `/api/mappen?sicht=${rechnungTyp.id}&anzahl=50&sortierung=rechnungsdatum`)).body.mappen.map((m: { werte: { rechnungsdatum: string } }) => m.werte.rechnungsdatum);
    assert.deepEqual(nachDatum, [...nachDatum].sort());
    for (const sp of ['_erstellt', '_geaendertVon', '_typ', 'bezahlt', 'gibts_nicht']) {
      assert.equal((await anfrage('GET', `/api/mappen?sicht=${rechnungTyp.id}&anzahl=5&sortierung=${sp}`)).status, 200, sp);
    }
    assert.equal((await anfrage('GET', '/api/mappen?sicht=eingang&sortierung=_typ&absteigend=true')).status, 200);
    assert.equal((await anfrage('PUT', '/api/konto/einstellungen/sortierung:test', { wert: { spalte: 'betrag', absteigend: true } })).status, 204);
    assert.deepEqual((await anfrage('GET', '/api/konto/einstellungen')).body['sortierung:test'], { spalte: 'betrag', absteigend: true });
    const typNeu = await anfrage('PUT', `/api/typen/${rechnungTyp.id}`, { ...rechnungTyp, trefferliste: ['betrag', '_titel', 'rechnungsdatum'] });
    assert.deepEqual(typNeu.body.trefferliste, ['betrag', '_titel', 'rechnungsdatum']);

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

  it('verwaltet Designs mit Standard und Rückfall', async () => {
    const r = (await anfrage('GET', '/api/designs')).body;
    assert.deepEqual(r.designs.map((d: { name: string }) => d.name), ['Automatisch', 'Hell', 'Dunkel', 'Kontrast']);
    assert.equal(r.designs.find((d: { id: string }) => d.id === r.standard).name, 'Automatisch');
    assert.equal((await anfrage('POST', '/api/designs', { name: 'Hell', grundlage: 'hell', primaer: '#112233', sekundaer: '#445566' })).status, 409);
    assert.equal((await anfrage('POST', '/api/designs', { name: 'X', grundlage: 'bunt', primaer: 'rot', sekundaer: '#445566' })).status, 422);
    assert.equal((await anfrage('POST', '/api/designs', { name: 'X', grundlage: 'hell', primaer: '#112233', sekundaer: '#445566', css: '</style><script>' })).status, 422);
    const neu = (await anfrage('POST', '/api/designs', { name: 'Waldgrün', grundlage: 'dunkel', primaer: '#1e5e3b', sekundaer: '#b26b00', css: '.kopf { border-bottom-width: 3px; }' })).body;
    assert.equal(neu.primaer, '#1E5E3B');
    assert.equal((await anfrage('PUT', '/api/designs-standard', { id: neu.id })).body.standard, neu.id);
    assert.equal((await anfrage('DELETE', `/api/designs/${neu.id}`)).status, 409, 'Standard nicht löschbar');
    assert.equal((await anfrage('PUT', '/api/designs-standard', { id: r.standard })).status, 200);
    assert.equal((await anfrage('DELETE', `/api/designs/${neu.id}`)).status, 204);
  });

  it('bedient /api/v1 mit API-Schlüsseln und liefert die OpenAPI-Beschreibung', async () => {
    const v1 = async (methode: string, pfad: string, schluessel: string, payload?: unknown) => {
      const r = await app.inject({ method: methode, url: `/api/v1${pfad}`, payload, headers: { authorization: `Bearer ${schluessel}` } });
      return { status: r.statusCode as number, body: r.body && r.headers['content-type']?.toString().includes('json') ? JSON.parse(r.body) : r.body };
    };
    const lesen = (await anfrage('POST', '/api/konto/api-schluessel', { name: 'Nur lesen' })).body;
    const schreiben = (await anfrage('POST', '/api/konto/api-schluessel', { name: 'Scanner', recht: 'schreiben' })).body;
    assert.equal(lesen.recht, 'lesen');
    assert.ok(!JSON.stringify((await anfrage('GET', '/api/konto/api-schluessel')).body).includes(schreiben.schluessel));

    const ich = await v1('GET', '/ich', lesen.schluessel);
    assert.deepEqual([ich.status, ich.body.benutzer.email, ich.body.schluessel.recht], [200, 'admin@example.org', 'lesen']);
    const typen = (await v1('GET', '/typen', lesen.schluessel)).body;
    const partner = typen.find((t: { name: string }) => t.name === 'Vertragspartner');
    assert.equal((await v1('GET', '/mappen', lesen.schluessel)).status, 422, 'sicht fehlt');
    assert.ok((await v1('GET', `/mappen?sicht=${partner.id}&anzahl=2`, lesen.schluessel)).body.gesamt >= 1);
    assert.equal((await v1('POST', '/mappen', lesen.schluessel, { typId: partner.id, werte: { name: 'API GmbH' } })).status, 403);
    const neu = await v1('POST', '/mappen', schreiben.schluessel, { typId: partner.id, werte: { name: 'API GmbH' } });
    assert.equal(neu.status, 201);
    assert.equal(neu.body.titel, 'API GmbH');
    const hoch = await app.inject({ method: 'POST', url: `/api/v1/mappen/${neu.body.id}/dokumente?register=dokumente&name=a.pdf`,
      payload: Buffer.from('%PDF-1.7\n%%EOF'), headers: { authorization: `Bearer ${schreiben.schluessel}`, 'content-type': 'application/octet-stream' } });
    assert.equal(hoch.statusCode, 201);
    const dok = JSON.parse(hoch.body).dokument;
    assert.equal((await v1('GET', `/dokumente/${dok.id}/inhalt`, lesen.schluessel)).body, '%PDF-1.7\n%%EOF');
    assert.equal((await v1('DELETE', `/dokumente/${dok.id}`, schreiben.schluessel)).status, 204);
    assert.equal((await v1('PUT', `/mappen/${neu.body.id}`, schreiben.schluessel, { werte: { name: 'API AG' } })).body.titel, 'API AG');
    assert.equal((await v1('DELETE', `/mappen/${neu.body.id}`, schreiben.schluessel)).status, 204);
    assert.equal((await v1('GET', '/benutzer', schreiben.schluessel)).status, 200, 'Admin-Schlüssel darf Werkbank');
    // Interne Adressen nehmen keine Schlüssel an.
    assert.equal((await app.inject({ method: 'GET', url: '/api/typen', headers: { authorization: `Bearer ${lesen.schluessel}` } })).statusCode, 401);
    assert.equal((await v1('GET', '/ich', 'dms_falsch')).status, 401);
    // Abgelaufen
    assert.equal((await anfrage('PUT', `/api/konto/api-schluessel/${lesen.id}`, { name: 'Nur lesen', recht: 'lesen', ablauf: new Date(Date.now() + 1000).toISOString() })).status, 200);
    await sql`UPDATE api_schluessel SET ablauf = now() - interval '1 minute' WHERE id = ${lesen.id}`;
    assert.equal((await v1('GET', '/ich', lesen.schluessel)).status, 401);
    assert.equal((await anfrage('DELETE', `/api/konto/api-schluessel/${lesen.id}`)).status, 204);
    // OpenAPI ohne Anmeldung, passend zur Version
    const doc = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    assert.equal(doc.statusCode, 200);
    const j = JSON.parse(doc.body);
    assert.equal(j.openapi, '3.1.0');
    assert.ok(j.paths['/mappen/{id}'].put);
    assert.ok(j.info.version);
  });

  it('führt Benutzer und Rollen als geschützte Mappentypen (#26, #27)', async () => {
    const typen = (await anfrage('GET', '/api/typen')).body;
    const benutzerTyp = typen.find((t: { system?: string }) => t.system === 'benutzer');
    const rolleTyp = typen.find((t: { system?: string }) => t.system === 'rolle');
    const benutzer = (await anfrage('GET', '/api/benutzer')).body;
    const admin = benutzer.find((x: { email: string }) => x.email === 'admin@example.org');
    const mitglied = benutzer.find((x: { email: string }) => x.email === 'mitglied@example.org');
    const rollen = (await anfrage('GET', '/api/rollen')).body;
    const sys = { admin: rollen.find((r: { name: string }) => r.name === 'Administrator'), mitglied: rollen.find((r: { name: string }) => r.name === 'Mitglied') };
    assert.ok(sys.admin.system && sys.mitglied.system);

    // Jeder Benutzer hat seine Mappe; der Typ lässt sich erweitern, aber nicht löschen.
    const am = (await anfrage('GET', `/api/mappen/${admin.id}`)).body.mappe;
    assert.deepEqual([am.typId, am.werte.email, am.werte.rollen], [benutzerTyp.id, 'admin@example.org', [sys.admin.id]]);
    assert.equal((await anfrage('DELETE', `/api/typen/${benutzerTyp.id}`)).status, 409);
    assert.equal((await anfrage('DELETE', `/api/typen/${rolleTyp.id}`)).status, 409);
    const ohneEmail = { ...benutzerTyp, felder: benutzerTyp.felder.filter((f: { key: string }) => f.key !== 'email') };
    assert.equal((await anfrage('PUT', `/api/typen/${benutzerTyp.id}`, ohneEmail)).status, 422);
    const erweitert = await anfrage('PUT', `/api/typen/${benutzerTyp.id}`, { ...benutzerTyp, erstellenErlaubt: true, felder: [...benutzerTyp.felder, { key: 'telefon', label: 'Telefon', typ: 'text' }] });
    assert.equal(erweitert.status, 200);
    assert.equal(erweitert.body.erstellenErlaubt, false, 'Benutzer-Mappen entstehen nur in der Benutzerverwaltung');
    assert.equal((await anfrage('POST', '/api/mappen', { typId: benutzerTyp.id, werte: { name: 'X', email: 'x@example.org' } })).status, 403);
    assert.equal((await anfrage('DELETE', `/api/mappen/${mitglied.id}`)).status, 403);
    assert.equal((await anfrage('DELETE', `/api/mappen/${sys.admin.id}`)).status, 409, 'Systemrolle');

    // Rollen: jeder darf sie anlegen; die Zuordnung vergibt nur die Benutzerverwaltung.
    const steuern = await anfrage('POST', '/api/mappen', { typId: rolleTyp.id, werte: { name: 'Steuern' } });
    assert.equal(steuern.status, 201);
    assert.equal((await anfrage('PUT', `/api/benutzer/${mitglied.id}`, { name: 'Geändert', rollen: ['gibt-es-nicht'] })).status, 422);
    assert.equal((await anfrage('GET', '/api/benutzer')).body.find((x: { id: string }) => x.id === mitglied.id).name, 'Mitglied', 'ungültige Rollen ändern nichts');
    assert.equal((await anfrage('PUT', `/api/benutzer/${mitglied.id}`, { rollen: [sys.admin.id] })).status, 422);
    const zugeordnet = await anfrage('PUT', `/api/benutzer/${mitglied.id}`, { rollen: [steuern.body.id] });
    assert.deepEqual(zugeordnet.body.rollen, [steuern.body.id]);
    const mm = (await anfrage('GET', `/api/mappen/${mitglied.id}`)).body.mappe;
    assert.deepEqual(mm.werte.rollen, [sys.mitglied.id, steuern.body.id]);
    assert.equal((await anfrage('GET', `/api/mappen/${steuern.body.id}`)).body.rueckverweise.length, 1, 'die Rolle zeigt ihre Benutzer');

    // Sicherheit: ein Mitglied ändert weder fremde E-Mail-Adressen noch die eigenen Rollen über die Ablage.
    const login = await app.inject({ method: 'POST', url: '/api/konto/anmelden', headers: { 'x-dms': '1' }, payload: { email: 'mitglied@example.org', passwort: 'mitglied-passwort' } });
    const mc = String(login.headers['set-cookie']).split(';')[0];
    const alsMitglied = async (method: string, url: string, payload?: unknown) => (await app.inject({ method, url, payload, headers: { 'x-dms': '1', cookie: mc } })).statusCode;
    assert.equal(await alsMitglied('PUT', `/api/mappen/${admin.id}`, { werte: { ...am.werte, email: 'boese@example.org' } }), 403);
    assert.equal(await alsMitglied('PUT', `/api/mappen/${mitglied.id}`, { werte: { ...mm.werte, rollen: [sys.admin.id, sys.mitglied.id] } }), 403);
    assert.equal(await alsMitglied('PUT', `/api/mappen/${sys.admin.id}`, { werte: { name: 'Chef' } }), 403);
    assert.equal(await alsMitglied('PUT', `/api/mappen/${mitglied.id}`, { werte: { ...mm.werte, telefon: '0351 123' } }), 200, 'eigene Felder bleiben bearbeitbar');
    assert.equal(await alsMitglied('POST', '/api/mappen', { typId: rolleTyp.id, werte: { name: 'Garten' } }), 201);
    assert.equal(await alsMitglied('GET', '/api/rollen'), 403);
    assert.equal((await anfrage('GET', '/api/konto/status')).body.benutzer.email, 'admin@example.org');
    assert.equal((await anfrage('GET', `/api/mappen/${admin.id}`)).body.mappe.werte.email, 'admin@example.org');

    // Rolle mit Benutzern löschen: die Zuordnung fällt weg. Benutzer, die schon angemeldet waren, werden deaktiviert.
    assert.equal((await anfrage('DELETE', `/api/mappen/${steuern.body.id}`)).status, 204);
    assert.deepEqual((await anfrage('GET', `/api/mappen/${mitglied.id}`)).body.mappe.werte.rollen, [sys.mitglied.id]);
    assert.equal((await anfrage('DELETE', `/api/benutzer/${mitglied.id}`)).status, 409);
    assert.equal((await anfrage('PUT', `/api/benutzer/${mitglied.id}`, { aktiv: false })).status, 200);
    assert.match((await anfrage('GET', `/api/mappen/${mitglied.id}`)).body.mappe.titel, /\(ehemalig\)$/);
    assert.equal((await anfrage('PUT', `/api/benutzer/${mitglied.id}`, { aktiv: true })).status, 200);
    const doc = JSON.parse((await app.inject({ method: 'GET', url: '/api/openapi.json' })).body);
    assert.ok(doc.paths['/rollen'].get);
  });

  it('pflegt E-Mail-Versand und Adresse in der Werkbank (#37)', async () => {
    const st = (await anfrage('GET', '/api/werkbank/betrieb')).body;
    assert.deepEqual([st.mail.aktiv, st.adresse, st.mail.passwortGesetzt], [false, 'http://nas:3000', false]);
    assert.match(st.vorschlag, /^http:\/\//);
    assert.equal((await anfrage('PUT', '/api/werkbank/betrieb/adresse', { adresse: 'ftp://x' })).status, 422);
    assert.equal((await anfrage('PUT', '/api/werkbank/betrieb/adresse', { adresse: 'dms.example.org' })).body.adresse, 'http://dms.example.org');
    const neu = await anfrage('POST', '/api/benutzer', { email: 'link@example.org', rolle: 'mitglied' });
    assert.match(neu.body.link, /^http:\/\/dms\.example\.org\/passwort\//);
    // Ohne gepflegte Adresse: die der Anfrage
    await anfrage('PUT', '/api/werkbank/betrieb/adresse', { adresse: '' });
    const r = await app.inject({ method: 'POST', url: `/api/benutzer/${neu.body.benutzer.id}/link`, headers: { 'x-dms': '1', cookie, host: 'nas.local:8080' } });
    assert.match(JSON.parse(r.body).link, /^http:\/\/nas\.local:8080\/passwort\//);
    const m = await anfrage('PUT', '/api/werkbank/betrieb/mail', { aktiv: true, host: 'smtp.example.org', port: 587, verbindung: 'starttls', benutzer: 'dms', passwort: 'geheim' });
    assert.equal(m.status, 200);
    assert.ok(!JSON.stringify(m.body).includes('geheim'));
    assert.equal((await anfrage('GET', '/api/konto/status')).body.mail, true, 'sofort wirksam');
    assert.equal((await sql`SELECT wert FROM einstellungen WHERE schluessel = 'mail'`)[0].wert.passwort, 'geheim');
    await anfrage('PUT', '/api/werkbank/betrieb/mail', { ...m.body.mail, aktiv: false });
    assert.equal((await anfrage('GET', '/api/konto/status')).body.mail, false);
    await anfrage('PUT', '/api/werkbank/betrieb/adresse', { adresse: 'http://nas:3000' });
    assert.equal((await anfrage('DELETE', `/api/benutzer/${neu.body.benutzer.id}`)).status, 204);
    const sys = (await anfrage('GET', '/api/werkbank/system')).body;
    assert.equal(sys.einstellungen.Adresse, 'http://nas:3000');
  });

  it('verwaltet Sichten über HTTP; nur Administratoren ändern sie (#38)', async () => {
    const typen = (await anfrage('GET', '/api/typen')).body;
    const rechnung = typen.find((t: { name: string }) => t.name === 'Rechnung');
    const alt = (await anfrage('GET', '/api/sichten/definitionen')).body;
    assert.ok(alt.some((x: { id: string }) => x.id === rechnung.id), 'Sicht je Typ mit dessen Id');
    const gruppe = await anfrage('POST', '/api/sichten/definitionen', { name: 'Gruppe', typen: [] });
    assert.equal(gruppe.status, 201);
    const offen = await anfrage('POST', '/api/sichten/definitionen', { name: 'Offen', elternId: gruppe.body.id, typen: [rechnung.id], bedingungen: [{ art: 'feld', feld: 'bezahlt', op: 'nein' }] });
    const z = (await anfrage('GET', '/api/sichten')).body;
    assert.equal(z.sichten[gruppe.body.id], z.sichten[offen.body.id]);
    const seite = (await anfrage('GET', `/api/mappen?sicht=${gruppe.body.id}`)).body;
    assert.equal(seite.gesamt, z.sichten[gruppe.body.id]);
    assert.equal((await anfrage('POST', '/api/sichten/vorschau', { sicht: { name: 'x', typen: [rechnung.id] } })).body.anzahl, (await anfrage('GET', `/api/mappen?sicht=typ:${rechnung.id}`)).body.gesamt);
    assert.equal((await anfrage('PUT', `/api/sichten/definitionen/${gruppe.body.id}`, { ...gruppe.body, elternId: offen.body.id })).status, 422, 'kein Kreis');
    const login = await app.inject({ method: 'POST', url: '/api/konto/anmelden', headers: { 'x-dms': '1' }, payload: { email: 'mitglied@example.org', passwort: 'mitglied-passwort' } });
    const mc = String(login.headers['set-cookie']).split(';')[0];
    const alsMitglied = async (method: string, url: string, payload?: unknown) => (await app.inject({ method, url, payload, headers: { 'x-dms': '1', cookie: mc } })).statusCode;
    assert.equal(await alsMitglied('GET', '/api/sichten/definitionen'), 200);
    assert.equal(await alsMitglied('POST', '/api/sichten/definitionen', { name: 'Verboten', typen: [] }), 403);
    assert.equal(await alsMitglied('DELETE', `/api/sichten/definitionen/${gruppe.body.id}`), 403);
    assert.equal((await anfrage('DELETE', `/api/sichten/definitionen/${gruppe.body.id}`)).status, 204);
    assert.equal((await anfrage('GET', '/api/sichten/definitionen')).body.find((x: { id: string }) => x.id === offen.body.id).elternId, null, 'Untersicht rückt hoch');
    assert.equal((await anfrage('DELETE', `/api/sichten/definitionen/${offen.body.id}`)).status, 204);
  });
});
