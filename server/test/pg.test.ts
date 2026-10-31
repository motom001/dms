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
  let sql: any; let app: any; let betrieb: any; let texterkennung: any;

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
    const { Betrieb, pgBetriebSpeicher } = await import('../src/betrieb');
    // Schlüssel für Passwörter (#39): eigene Datei, erst im Test erzeugt.
    const { Tresor } = await import('../src/tresor');
    const tresor = new Tresor(pgBetriebSpeicher(sql, HAUSHALT), join(ordner, 'geheim', 'dms.schluessel'), () => null);
    await tresor.laden();
    // Papierkorb (#43) zunächst aus, damit Löschen wie bisher sofort endgültig ist; der Test dazu schaltet ihn ein.
    await pgBetriebSpeicher(sql, HAUSHALT).schreibe('papierkorb', { tage: 0 });
    // Wie im Betrieb (index.ts): Konten spiegeln Benutzer in Mappen (#26).
    const dienst = new Dienst(messung.umhuelle(pgRepo(sql, HAUSHALT), 'mappen'), ordnerSpeicher(ordner, HAUSHALT), { tresor, einstellungen: pgBetriebSpeicher(sql, HAUSHALT) });
    betrieb = new Betrieb(pgBetriebSpeicher(sql, HAUSHALT), undefined, tresor);
    await betrieb.laden();
    await betrieb.speichereAdresse('http://nas:3000');
    const konten = new Konten(messung.umhuelle(pgKontoRepo(sql, HAUSHALT), 'konto'), () => betrieb.mailer(), () => betrieb.adresseFuerLinks(), dienst.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    // Texterkennung wie im Betrieb (#45); in GitHub Actions sind tesseract und poppler installiert.
    const { Texterkennung } = await import('../src/texterkennung');
    texterkennung = new Texterkennung(pgRepo(sql, HAUSHALT), ordnerSpeicher(ordner, HAUSHALT), pgBetriebSpeicher(sql, HAUSHALT));
    dienst.verbindeTexterkennung(texterkennung);
    await texterkennung.start();
    await dienst.gleicheBenutzerAb(await konten.listeBenutzer());
    app = await baueApp(dienst, konten, {
        betrieb, tresor, texterkennung, sicher: () => betrieb.cookieNurHttps(),
        messung, system: (await import('../src/system')).pgSystemQuelle(sql, HAUSHALT),
        designs: new (await import('../src/designs')).Designs((await import('../src/designs')).pgDesignRepo(sql, HAUSHALT)),
        apiSchluessel: schluesselDienst = new (await import('../src/apischluessel')).ApiSchluesselDienst((await import('../src/apischluessel')).pgApiSchluesselRepo(sql)),
        // Kein Internet im Test: Abgleich mit festen Antworten.
        abruf: async (url: string) => { if (url.includes('npmjs')) return { version: '99.0.0' }; throw new Error('offline'); },
      });
  });
  after(async () => { texterkennung?.stop(); await app?.close(); await sql?.end(); });

  let schluesselDienst!: import('../src/apischluessel').ApiSchluesselDienst;
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
    assert.deepEqual(typen.filter((t: { system?: string | null }) => t.system).map((t: { system: string }) => t.system).sort(), ['benutzer', 'post', 'rolle']);
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

    // Wachstumstests (#248): Abschätzung, Dokumente zu den Mappen, Entfernen in Paketen.
    const opt = { anzahl: 120, startwert: 'pg', dokumente: { anteil: 100, von: 1, bis: 2, mischung: { brief: 70, mehrseitig: 30 }, duplikate: 10 } };
    const schaetzung = (await anfrage('POST', '/api/werkbank/demo/abschaetzung', opt)).body;
    assert.ok(schaetzung.dokumente.dokumente > 0 && schaetzung.mappen >= 120, JSON.stringify(schaetzung));
    assert.equal((await anfrage('POST', '/api/werkbank/demo', opt)).status, 202);
    const mitDok = await auftrag();
    assert.equal(mitDok.status, 'fertig', mitDok.fehler);
    assert.ok(mitDok.ergebnis.dokumente.anzahl > 0);
    assert.equal(mitDok.fertig, mitDok.gesamt);
    const rechnung = (await anfrage('GET', `/api/mappen?sicht=${rechnungTyp.id}&anzahl=200`)).body.mappen.find((m: { demo?: boolean }) => m.demo);
    const mitDetails = (await anfrage('GET', `/api/mappen/${rechnung.id}`)).body;
    assert.ok(mitDetails.dokumente.length >= 1, 'Rechnung hat Dokumente');
    assert.equal((await anfrage('DELETE', '/api/werkbank/demo')).status, 202);
    assert.equal((await auftrag()).ergebnis.entfernt, mitDok.ergebnis.gesamt);
    assert.equal((await anfrage('GET', '/api/werkbank/demo')).body.reduce((a: number, t: { demo: number }) => a + t.demo, 0), 0);

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
    // #128: Administratoren bekommen keine API-Schlüssel – das Programm arbeitet als normaler Benutzer.
    assert.equal((await anfrage('POST', '/api/konto/api-schluessel', { name: 'Admin' })).status, 403);
    const programm = (await anfrage('POST', '/api/benutzer', { email: 'api-programm@example.org', name: 'Scanner', rolle: 'mitglied' })).body.benutzer;
    const lesen = await schluesselDienst.lege(programm, { name: 'Nur lesen' });
    const schreiben = await schluesselDienst.lege(programm, { name: 'Scanner', recht: 'schreiben' });
    assert.equal(lesen.recht, 'lesen');
    assert.ok(!JSON.stringify(await schluesselDienst.liste(programm)).includes(schreiben.schluessel));

    const ich = await v1('GET', '/ich', lesen.schluessel);
    assert.deepEqual([ich.status, ich.body.benutzer.email, ich.body.schluessel.recht], [200, 'api-programm@example.org', 'lesen']);
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
    assert.equal((await v1('GET', '/benutzer', schreiben.schluessel)).status, 403, 'Schlüssel eines Mitglieds darf keine Werkbank');
    // Interne Adressen nehmen keine Schlüssel an.
    assert.equal((await app.inject({ method: 'GET', url: '/api/typen', headers: { authorization: `Bearer ${lesen.schluessel}` } })).statusCode, 401);
    assert.equal((await v1('GET', '/ich', 'dms_falsch')).status, 401);
    // Abgelaufen
    await schluesselDienst.aendere(programm, lesen.id, { name: 'Nur lesen', recht: 'lesen', ablauf: new Date(Date.now() + 1000).toISOString() });
    await sql`UPDATE api_schluessel SET ablauf = now() - interval '1 minute' WHERE id = ${lesen.id}`;
    assert.equal((await v1('GET', '/ich', lesen.schluessel)).status, 401);
    await schluesselDienst.loesche(programm, lesen.id);
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
    assert.equal((await anfrage('PUT', `/api/benutzer/${mitglied.id}`, { aktiv: false })).status, 409, 'erst mit Vertreter (#77)');
    const abw = await anfrage('PUT', `/api/benutzer/${mitglied.id}/abwesenheit`, { an: false, vertreterId: admin.id });
    assert.equal(abw.status, 200, JSON.stringify(abw.body));
    assert.equal((await anfrage('POST', `/api/benutzer/${mitglied.id}/aufgaben-uebergeben`)).status, 200);
    const aus = await anfrage('PUT', `/api/benutzer/${mitglied.id}`, { aktiv: false });
    assert.equal(aus.status, 200, JSON.stringify(aus.body));
    assert.ok(aus.body.deaktiviert, 'Datum der Deaktivierung (Migration 025)');
    assert.equal((await anfrage('GET', `/api/mappen/${mitglied.id}`)).body.mappe.werte.vertreter, admin.id);
    assert.match((await anfrage('GET', `/api/mappen/${mitglied.id}`)).body.mappe.titel, /\(ehemalig\)$/);
    assert.equal((await anfrage('PUT', `/api/benutzer/${mitglied.id}`, { aktiv: true })).status, 200);
    const doc = JSON.parse((await app.inject({ method: 'GET', url: '/api/openapi.json' })).body);
    assert.ok(doc.paths['/rollen'].get);
  });

  it('pflegt E-Mail-Versand und Adresse in der Werkbank, Passwort verschlüsselt (#37, #39)', async () => {
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
    const mail = { aktiv: true, host: 'smtp.example.org', port: 587, verbindung: 'starttls', benutzer: 'dms', passwort: 'geheim' };
    // Ohne Schlüssel kein Passwort (#39); erzeugt wird er in der Werkbank.
    assert.equal((await anfrage('GET', '/api/werkbank/tresor')).body.zustand, 'fehlt');
    assert.equal((await anfrage('PUT', '/api/werkbank/betrieb/mail', mail)).status, 409);
    assert.equal((await anfrage('GET', '/api/konto/status')).body.passwoerterMoeglich, false);
    const t = await anfrage('POST', '/api/werkbank/tresor/erzeugen');
    assert.deepEqual([t.status, t.body.zustand], [200, 'vorhanden']);
    assert.equal((await anfrage('POST', '/api/werkbank/tresor/erzeugen')).status, 409, 'nie überschreiben');
    assert.equal((await anfrage('GET', '/api/konto/status')).body.passwoerterMoeglich, true);
    const tresorStand = JSON.stringify((await sql`SELECT wert FROM einstellungen WHERE schluessel = 'tresor'`)[0].wert);
    assert.ok(tresorStand.includes(t.body.fingerabdruck) && !/[A-Za-z0-9_-]{43}/.test(tresorStand), 'in der Datenbank nur der Fingerabdruck');
    const m = await anfrage('PUT', '/api/werkbank/betrieb/mail', mail);
    assert.equal(m.status, 200);
    assert.ok(!JSON.stringify(m.body).includes('geheim'));
    assert.equal((await anfrage('GET', '/api/konto/status')).body.mail, true, 'sofort wirksam');
    const gespeichert = (await sql`SELECT wert FROM einstellungen WHERE schluessel = 'mail'`)[0].wert.passwort;
    assert.match(gespeichert, /^dms1\$/, 'verschlüsselt');
    assert.ok(!gespeichert.includes('geheim'));
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
  it('speichert Passwortfelder verschlüsselt und gibt sie nur gezielt heraus (#46)', async () => {
    const typ = (await anfrage('POST', '/api/typen', { name: 'Zugang', felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'kennwort', label: 'Kennwort', typ: 'passwort' },
    ] })).body;
    const m = await anfrage('POST', '/api/mappen', { typId: typ.id, werte: { name: 'Onlinebank', kennwort: { neu: 'sehr-geheim' } } });
    assert.equal(m.status, 201);
    assert.deepEqual(m.body.werte.kennwort, { gesetzt: true, lesbar: true });
    const [roh] = await sql`SELECT werte ->> 'kennwort' AS k FROM mappen WHERE id = ${m.body.id}`;
    assert.match(roh.k, /^dms1\$/);
    assert.equal((await anfrage('GET', `/api/mappen?sicht=typ:${typ.id}&suche=${encodeURIComponent(roh.k.slice(5, 12))}`)).body.gesamt, 0, 'nicht durchsuchbar');
    assert.ok(!JSON.stringify((await anfrage('GET', `/api/mappen/${m.body.id}`)).body).includes('dms1$'));
    assert.deepEqual((await anfrage('POST', `/api/mappen/${m.body.id}/passwoerter/kennwort`)).body, { wert: 'sehr-geheim' });
    // Unverändert zurückgeschickt bleibt es, wie es ist.
    await anfrage('PUT', `/api/mappen/${m.body.id}`, { werte: { name: 'Onlinebank', kennwort: { gesetzt: true } } });
    assert.equal((await sql`SELECT werte ->> 'kennwort' AS k FROM mappen WHERE id = ${m.body.id}`)[0].k, roh.k);

    // Schlüssel gehören einem normalen Benutzer (#128); er ist im API-Test angelegt.
    const programm = (await anfrage('GET', '/api/benutzer')).body.find((b: { email: string }) => b.email === 'api-programm@example.org');
    const ohne = await schluesselDienst.lege(programm, { name: 'Ohne Passwörter' });
    const mit = await schluesselDienst.lege(programm, { name: 'Mit Passwörtern', passwoerter: true });
    assert.equal(mit.passwoerter, true);
    const v1 = async (pfad: string, s: string) => {
      const r = await app.inject({ method: 'GET', url: `/api/v1${pfad}`, headers: { authorization: `Bearer ${s}` } });
      return { status: r.statusCode as number, body: JSON.parse(r.body) };
    };
    assert.deepEqual((await v1(`/mappen/${m.body.id}`, mit.schluessel)).body.mappe.werte.kennwort, { gesetzt: true, lesbar: true });
    assert.equal((await v1(`/mappen/${m.body.id}?passwoerter=anzeigen`, ohne.schluessel)).status, 403);
    assert.equal((await v1(`/mappen/${m.body.id}?passwoerter=anzeigen`, mit.schluessel)).body.mappe.werte.kennwort, 'sehr-geheim');
    const seite = await v1(`/mappen?sicht=typ:${typ.id}&passwoerter=anzeigen`, mit.schluessel);
    assert.equal(seite.body.mappen[0].werte.kennwort, 'sehr-geheim');
    assert.equal((await anfrage('DELETE', `/api/mappen/${m.body.id}`)).status, 204);
    assert.equal((await anfrage('DELETE', `/api/typen/${typ.id}`)).status, 204);
  });

  it('legt Gelöschtes in den Papierkorb und stellt es samt Verweisen und Dokumenten wieder her (#43)', async () => {
    assert.deepEqual((await anfrage('PUT', '/api/werkbank/papierkorb/einstellungen', { tage: 30 })).body, { tage: 30, geleert: 0, historieTage: 365 });
    const partner = (await anfrage('POST', '/api/typen', { name: 'Korbpartner', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] })).body;
    const vertrag = (await anfrage('POST', '/api/typen', { name: 'Korbvertrag', felder: [
      { key: 'nummer', label: 'Nummer', typ: 'text', pflicht: true, eindeutig: true }, { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: partner.id },
    ] })).body;
    const p = (await anfrage('POST', '/api/mappen', { typId: partner.id, werte: { name: 'Papierkorb GmbH' } })).body;
    const v = await anfrage('POST', '/api/mappen', { typId: vertrag.id, werte: { nummer: 'K-1', partner: p.id } });
    assert.equal(v.status, 201, JSON.stringify(v.body));
    const hoch = await app.inject({ method: 'POST', url: `/api/mappen/${v.body.id}/dokumente?register=dokumente&name=k.pdf`, payload: Buffer.from('%PDF-1.7 korb'), headers: { 'x-dms': '1', cookie, 'content-type': 'application/octet-stream' } });
    assert.equal(hoch.statusCode, 201);
    const sha = JSON.parse(hoch.body).dokument.sha256;

    assert.equal((await anfrage('DELETE', `/api/mappen/${v.body.id}`)).status, 204);
    assert.equal((await anfrage('GET', `/api/mappen/${v.body.id}`)).status, 404);
    const korb = (await anfrage('GET', '/api/papierkorb')).body;
    assert.deepEqual(korb.map((e: { id: string; dokumente: number }) => [e.id, e.dokumente]), [[v.body.id, 1]]);
    assert.equal((await anfrage('GET', '/api/sichten')).body.papierkorb, 1);
    assert.equal((await anfrage('GET', `/api/mappen/${p.id}`)).body.rueckverweise.length, 0, 'Verweis ist mit umgezogen');
    assert.equal((await sql`SELECT count(*)::int AS n FROM dokumente WHERE sha256 = ${sha}`)[0].n, 0);

    const w = await anfrage('POST', `/api/papierkorb/${v.body.id}/wiederherstellen`);
    assert.equal(w.status, 200, JSON.stringify(w.body));
    assert.equal(w.body.verweiseEntfallen, 0);
    const zurueck = (await anfrage('GET', `/api/mappen/${v.body.id}`)).body;
    assert.equal(zurueck.dokumente.length, 1);
    assert.equal(zurueck.mappe.titel, v.body.titel);
    assert.equal((await anfrage('GET', `/api/mappen/${p.id}`)).body.rueckverweise.length, 1);
    assert.equal((await app.inject({ method: 'GET', url: `/api/dokumente/${zurueck.dokumente[0].id}/inhalt`, headers: { cookie } })).statusCode, 200, 'Datei ist noch da');

    // Endgültig: Datei verschwindet erst jetzt; der Partner lässt sich danach löschen.
    await anfrage('DELETE', `/api/mappen/${v.body.id}`);
    await anfrage('DELETE', `/api/mappen/${p.id}`);
    assert.equal((await anfrage('GET', '/api/werkbank/papierkorb')).body.eintraege.length, 2);
    assert.equal((await anfrage('DELETE', `/api/werkbank/papierkorb/${p.id}`)).body.geloescht, 1);
    assert.equal((await anfrage('DELETE', '/api/papierkorb')).body.geloescht, 1);
    assert.equal((await anfrage('GET', '/api/papierkorb')).body.length, 0);
    const v1 = await app.inject({ method: 'GET', url: '/api/v1/papierkorb', headers: { cookie } });
    assert.deepEqual(JSON.parse(v1.body), []);
    assert.deepEqual((await anfrage('PUT', '/api/werkbank/papierkorb/einstellungen', { tage: 0 })).body, { tage: 0, geleert: 0, historieTage: 365 });
    assert.equal((await anfrage('DELETE', `/api/typen/${vertrag.id}`)).status, 204);
    assert.equal((await anfrage('DELETE', `/api/typen/${partner.id}`)).status, 204);
  });
  it('Notizen, Aufgaben, Protokoll und E-Mail aus der Mappe (#54–#58)', async () => {
    const ich = (await anfrage('GET', '/api/konto/status')).body.benutzer;
    const typ = (await anfrage('POST', '/api/typen', { name: 'Vorgang', felder: [
      { key: 'nr', label: 'Nr', typ: 'text', pflicht: true }, { key: 'text', label: 'Beschreibung', typ: 'formatiert' },
    ], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr', 'text'] }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
      { key: 'protokoll', name: 'Protokoll', art: 'protokoll' },
    ] })).body;
    const m = (await anfrage('POST', '/api/mappen', { typId: typ.id, werte: { nr: 'V-1' } })).body;
    // Formatierter Text mit Erwähnung → Aufgabe, nur einmal (#53, #56)
    const mit = { nr: 'V-1', text: `**Bitte** prüfen, @[Ich](benutzer:${ich.id})` };
    assert.equal((await anfrage('PUT', `/api/mappen/${m.id}`, { werte: mit })).status, 200);
    assert.equal((await anfrage('PUT', `/api/mappen/${m.id}`, { werte: { ...mit, nr: 'V-1a' } })).status, 200);
    let auf = (await anfrage('GET', `/api/mappen/${m.id}/aufgaben`)).body;
    assert.equal(auf.filter((a: { art: string }) => a.art === 'erwaehnung').length, 0, 'sich selbst erwähnen ergibt keine Aufgabe');
    const manuell = await anfrage('POST', `/api/mappen/${m.id}/aufgaben`, { empfaengerId: ich.id, text: 'Ablegen' });
    assert.equal(manuell.status, 201, JSON.stringify(manuell.body));
    const eingang = async () => (await anfrage('GET', '/api/mappen?sicht=eingang&suche=V-1a&anzahl=500')).body.mappen.some((x: { id: string }) => x.id === m.id);
    assert.equal(await eingang(), true);
    assert.equal((await anfrage('POST', `/api/aufgaben/${manuell.body.id}/erledigt`)).status, 200);
    assert.equal(await eingang(), false);
    auf = (await anfrage('GET', '/api/werkbank/aufgaben?erledigt')).body.aufgaben;
    assert.equal(auf[0].id, manuell.body.id);
    // Notizen und Suche darin (#55)
    const n = await anfrage('POST', `/api/mappen/${m.id}/notizen`, { text: 'Rückruf bei Firma Zander' });
    assert.equal(n.status, 201);
    assert.equal((await anfrage('GET', `/api/mappen?sicht=typ:${typ.id}&suche=Zander`)).body.gesamt, 0);
    assert.equal((await anfrage('GET', `/api/mappen?sicht=typ:${typ.id}&suche=Zander&notizen=true`)).body.gesamt, 1);
    // Protokoll (#57)
    const h = (await anfrage('GET', `/api/mappen/${m.id}/historie`)).body;
    assert.deepEqual([...new Set(h.map((e: { art: string }) => e.art))].sort(), ['angelegt', 'aufgabe', 'geaendert', 'notiz']);
    // E-Mail (#58): ohne Versand 409; mit Versand eine Post-Mappe (#192) mit Anhang
    const hoch = await app.inject({ method: 'POST', url: `/api/mappen/${m.id}/dokumente?register=dokumente&name=v.pdf`, payload: Buffer.from('%PDF-1.7 mail'), headers: { 'x-dms': '1', cookie, 'content-type': 'application/octet-stream' } });
    const dok = JSON.parse(hoch.body).dokument;
    const email = { an: 'amt@example.org', betreff: 'Vorgang V-1a', nachricht: 'Anbei', dokumente: [dok.id] };
    assert.equal((await anfrage('POST', `/api/mappen/${m.id}/email`, email)).status, 409);
    const gesendet: unknown[] = [];
    const vorher = betrieb.mailer;
    betrieb.mailer = () => ({ async sende(...a: unknown[]) { gesendet.push(a); } });
    try {
      assert.equal((await anfrage('GET', '/api/email/bereit')).body.bereit, true);
      const e = await anfrage('POST', `/api/mappen/${m.id}/email`, email);
      assert.equal(e.status, 201, JSON.stringify(e.body));
      assert.equal(gesendet.length, 1);
      const em = (await anfrage('GET', `/api/mappen/${e.body.id}`)).body;
      assert.deepEqual(em.mappe.werte.bezug, [m.id]);
      assert.equal(em.mappe.werte.kanal, 'E-Mail');
      assert.equal(em.dokumente[0].sha256, dok.sha256);
      assert.equal((await anfrage('GET', '/api/typen')).body.find((t: { id: string }) => t.id === e.body.typId).system, 'post');
      assert.equal((await anfrage('GET', `/api/mappen/${m.id}/historie`)).body[0].art, 'email');
      // Die Mappe lässt sich trotz E-Mail löschen; die Datei bleibt für die E-Mail.
      assert.equal((await anfrage('DELETE', `/api/mappen/${m.id}`)).status, 204);
      assert.equal((await app.inject({ method: 'GET', url: `/api/dokumente/${em.dokumente[0].id}/inhalt`, headers: { cookie } })).statusCode, 200);
      assert.equal((await anfrage('DELETE', `/api/mappen/${e.body.id}`)).status, 204);
    } finally { betrieb.mailer = vorher; }
    // Post (#192): anlegen, Dokument hochladen, einer Mappe zuordnen – das Dokument wandert mit Volltext.
    const p = await anfrage('POST', '/api/post', { betreff: 'Brief' });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    assert.equal(p.body.werte.stand, 'Neu');
    const ph = await app.inject({ method: 'POST', url: `/api/mappen/${p.body.id}/dokumente?register=dokumente&name=brief.pdf`, payload: Buffer.from('%PDF-1.7 brief'), headers: { 'x-dms': '1', cookie, 'content-type': 'application/octet-stream' } });
    assert.equal(ph.statusCode, 201, ph.body);
    const ziel = (await anfrage('POST', '/api/mappen', { typId: typ.id, werte: { nr: 'V-2' } })).body;
    const zu = await anfrage('POST', `/api/mappen/${p.body.id}/zuordnen`, { ziel: ziel.id });
    assert.equal(zu.status, 200, JSON.stringify(zu.body));
    assert.deepEqual(zu.body.post.werte.bezug, [ziel.id]);
    assert.equal(zu.body.post.werte.stand, 'Zugeordnet');
    const zd = (await anfrage('GET', `/api/mappen/${ziel.id}`)).body;
    assert.deepEqual(zd.dokumente.map((x: { name: string }) => x.name), ['brief.pdf']);
    assert.equal((await anfrage('GET', `/api/mappen/${p.body.id}`)).body.dokumente.length, 0);
    assert.equal((await anfrage('DELETE', `/api/mappen/${ziel.id}`)).status, 204);
    assert.deepEqual((await anfrage('GET', `/api/mappen/${p.body.id}`)).body.mappe.werte.bezug, null);
    assert.equal((await anfrage('DELETE', `/api/mappen/${p.body.id}`)).status, 204);
    assert.equal((await anfrage('DELETE', `/api/typen/${typ.id}`)).status, 204);
  });

  it('Übersicht der Werkbank, Diagnose und eigene Geräte (#68, #69, #70)', async () => {
    const u = await anfrage('GET', '/api/werkbank/uebersicht');
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.equal(typeof u.body.aufgaben.offen, 'number');
    assert.ok(u.body.bestand && u.body.bestand.mappen >= 0);
    assert.equal(u.body.version.version, (await anfrage('GET', '/api/werkbank/system')).body.dms.version);
    const dg = await anfrage('GET', '/api/konto/diagnose');
    assert.equal(dg.status, 200);
    assert.match(dg.body.postgres ?? '', /\d/);
    assert.ok(!JSON.stringify(dg.body).includes('passwort'));
    const geraete = await anfrage('GET', '/api/konto/sitzungen');
    assert.ok(geraete.body.some((x: { aktuell: boolean }) => x.aktuell));
    const eigene = geraete.body.find((x: { aktuell: boolean }) => x.aktuell);
    assert.equal((await anfrage('DELETE', `/api/konto/sitzungen/${eigene.id}`)).status, 409, 'nicht das eigene Gerät');
    assert.equal((await anfrage('POST', '/api/konto/sitzungen/andere-beenden')).status, 200);
    assert.equal((await anfrage('GET', '/api/werkbank/texterkennung/auftraege?stand=fertig')).status, 200);
  });

  it('Favoriten, Trefferlisten und Sichten verschieben über HTTP (#62, #73, #75)', async () => {
    const typen = (await anfrage('GET', '/api/typen')).body as Array<{ id: string; name: string; trefferlisten: Array<{ key: string; spalten: string[]; standard?: boolean }> }>;
    const t = typen.find((x) => x.name === 'Rechnung') ?? typen[0];
    assert.ok(t.trefferlisten.some((l) => l.standard), 'Migration 024: Standardliste');
    const neu = await anfrage('PUT', `/api/typen/${t.id}`, { ...t, trefferliste: undefined, trefferlisten: [...t.trefferlisten, { key: 'kurz', name: 'Kurz', spalten: ['_titel'] }] });
    assert.equal(neu.status, 200, JSON.stringify(neu.body));
    assert.deepEqual(neu.body.trefferlisten.map((l: { key: string }) => l.key).slice(-1), ['kurz']);
    const seite = (await anfrage('GET', `/api/mappen?sicht=typ:${t.id}&anzahl=1`)).body;
    const m = seite.mappen[0];
    assert.equal((await anfrage('PUT', `/api/mappen/${m.id}/favorit`)).status, 200);
    assert.equal((await anfrage('GET', `/api/mappen/${m.id}`)).body.favorit, true);
    const fav = (await anfrage('GET', '/api/mappen?sicht=favoriten')).body;
    assert.deepEqual(fav.favoriten, [m.id]);
    assert.equal((await anfrage('GET', '/api/sichten')).body.favoriten, 1);
    assert.equal((await anfrage('DELETE', `/api/mappen/${m.id}/favorit`)).status, 200);
    assert.equal((await anfrage('GET', '/api/mappen?sicht=favoriten')).body.gesamt, 0);
    const sichten = (await anfrage('GET', '/api/sichten/definitionen')).body as Array<{ id: string; elternId: string | null }>;
    const oben = sichten.filter((x) => !x.elternId);
    if (oben.length >= 2) {
      const r = await anfrage('POST', `/api/sichten/definitionen/${oben[1].id}/verschieben`, { elternId: null, stelle: 0 });
      assert.equal(r.status, 200);
      assert.equal(r.body.filter((x: { elternId: string | null }) => !x.elternId).sort((a: { position: number }, b: { position: number }) => a.position - b.position)[0].id, oben[1].id);
      assert.equal((await anfrage('POST', `/api/sichten/definitionen/${oben[0].id}/verschieben`, { elternId: oben[0].id, stelle: 0 })).status, 422, 'kein Kreis');
    }
  });

  it('erkennt Text in Dokumenten und findet ihn mit der Volltextsuche (#45)', async () => {
    const { pdfMitText } = await import('./hilfen');
    const st = (await anfrage('GET', '/api/werkbank/texterkennung')).body;
    assert.equal(st.einstellungen.auftraege, 1);
    assert.equal(st.einstellungen.maxSeiten, 50);
    const typ = (await anfrage('POST', '/api/typen', { name: 'Beleg', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }] })).body;
    const m = (await anfrage('POST', '/api/mappen', { typId: typ.id, werte: { nr: 'B-1' } })).body;
    const hoch = await app.inject({ method: 'POST', url: `/api/mappen/${m.id}/dokumente?register=dokumente&name=beleg.pdf&typ=application/pdf`,
      payload: pdfMitText(['Jahresabrechnung der Stadtwerke Musterstadt', 'Abschlagszahlungen und Nachzahlung']), headers: { 'x-dms': '1', cookie, 'content-type': 'application/octet-stream' } });
    assert.equal(hoch.statusCode, 201);
    const dok = JSON.parse(hoch.body).dokument;
    assert.ok(['wartet', 'laeuft', 'fertig'].includes(dok.ocr.stand));
    const ende = Date.now() + 60_000;
    let stand = dok.ocr;
    while (stand.stand !== 'fertig' && stand.stand !== 'fehler' && Date.now() < ende) {
      await new Promise((r) => setTimeout(r, 200));
      stand = (await anfrage('GET', `/api/mappen/${m.id}`)).body.dokumente[0].ocr;
    }
    assert.equal(stand.stand, 'fertig', JSON.stringify(stand));
    assert.equal(stand.info, 'Textebene des PDFs');
    const volltext = (await anfrage('GET', `/api/dokumente/${dok.id}/volltext`)).body;
    assert.match(volltext.text, /Jahresabrechnung der Stadtwerke/);
    const ohne = (await anfrage('GET', `/api/mappen?sicht=typ:${typ.id}&suche=${encodeURIComponent('Abrechnungen Stadtwerk')}`)).body;
    assert.equal(ohne.gesamt, 0);
    const mit = (await anfrage('GET', `/api/mappen?sicht=typ:${typ.id}&suche=${encodeURIComponent('stadtwerke nachzahlung')}&volltext=true`)).body;
    assert.equal(mit.gesamt, 1);
    assert.match(mit.ausschnitte[m.id].text, /\u0002Stadtwerke\u0003/);
    // Wartungsoperation: nichts nachzuholen, alles hat schon einen Volltext.
    assert.equal((await anfrage('POST', '/api/werkbank/wartung/volltext')).body.eingereiht >= 0, true);
    assert.equal((await anfrage('PUT', '/api/werkbank/texterkennung', { auftraege: 7 })).status, 422);
    assert.equal((await anfrage('PUT', '/api/werkbank/texterkennung', { auftraege: 2 })).body.einstellungen.auftraege, 2);
    // Neu eingereiht; ein freier Auftrag kann es sofort aufgreifen.
    assert.match((await anfrage('POST', `/api/dokumente/${dok.id}/texterkennung`)).body.ocr.stand, /^(wartet|laeuft)$/);
  });

  it('Nummernkreise: gleichzeitig angelegte Mappen bekommen verschiedene Nummern (#171)', async () => {
    assert.equal((await anfrage('POST', '/api/werkbank/nummernkreise', { schluessel: 'beleg', name: 'Belege', muster: 'B{jjjj}-{zaehler:5}', start: 1 })).status, 201);
    const t = (await anfrage('POST', '/api/typen', { name: 'Ausgangsbeleg', felder: [
      { key: 'nr', label: 'Belegnummer', typ: 'text', standard: '{nummernkreis:beleg}', eindeutig: true },
      { key: 'betreff', label: 'Betreff', typ: 'text', pflicht: true },
    ] })).body;
    assert.ok(t.id, JSON.stringify(t));
    const r = await Promise.all(Array.from({ length: 20 }, (_, i) => anfrage('POST', '/api/mappen', { typId: t.id, werte: { betreff: `B${i}`, nr: 'egal' } })));
    assert.ok(r.every((x) => x.status === 201), JSON.stringify(r.find((x) => x.status !== 201)));
    const nummern = r.map((x) => x.body.werte.nr as string).sort();
    assert.equal(new Set(nummern).size, 20);
    assert.match(nummern[0], /^B\d{4}-00001$/);
    assert.match(nummern[19], /-00020$/);
    // Fehlgeschlagenes Anlegen verbraucht keine Nummer
    assert.equal((await anfrage('POST', '/api/mappen', { typId: t.id, werte: {} })).status, 422);
    const n = (await anfrage('POST', '/api/mappen', { typId: t.id, werte: { betreff: 'danach' } })).body.werte.nr as string;
    assert.match(n, /-00021$/);
    // Schreibgeschützt
    const m = r[0].body;
    assert.equal((await anfrage('PUT', `/api/mappen/${m.id}`, { werte: { ...m.werte, nr: 'X' } })).status, 403);
    const liste = (await anfrage('GET', '/api/werkbank/nummernkreise')).body;
    assert.match(liste[0].naechste, /-00022$/);
    assert.equal((await anfrage('DELETE', '/api/werkbank/nummernkreise/beleg')).status, 409);
  });

  it('Versionierung: ersetzen, Versionen, zurückholen, gleicher Name, Speicherplatz (#194)', async () => {
    const t = (await anfrage('POST', '/api/typen', { name: 'Versionsbeleg', felder: [{ key: 'name', label: 'Name', typ: 'text' }], register: [
      { key: 'daten', name: 'Daten', art: 'felder' }, { key: 'belege', name: 'Belege', art: 'dokumente', versionierung: true, versionenBehalten: 3 },
    ] })).body;
    assert.ok(t.id, JSON.stringify(t));
    const m = (await anfrage('POST', '/api/mappen', { typId: t.id, werte: { name: 'Kasse' } })).body;
    const lade = async (url: string, inhalt: Buffer) => {
      const r = await app.inject({ method: 'POST', url, payload: inhalt, headers: { 'x-dms': '1', cookie, 'content-type': 'application/octet-stream' } });
      return { status: r.statusCode as number, body: JSON.parse(r.body) };
    };
    const a = (await lade(`/api/mappen/${m.id}/dokumente?register=belege&name=Bon.jpg`, Buffer.from('erstes'))).body.dokument;
    const b = await lade(`/api/dokumente/${a.id}/ersetzen?name=Bon.pdf&typ=application/pdf`, Buffer.from('%PDF-1.4\nzweites'));
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal(b.body.version, 2);
    // Gleicher Name als neue Version
    const c = await lade(`/api/mappen/${m.id}/dokumente?register=belege&name=Bon.pdf&gleicherName=version`, Buffer.from('%PDF-1.4\ndrittes'));
    assert.equal(c.body.dokument.version, 3);
    // Gleicher Name mit Zähler
    assert.equal((await lade(`/api/mappen/${m.id}/dokumente?register=belege&name=Bon.pdf`, Buffer.from('anderes'))).body.dokument.name, 'Bon (2).pdf');
    const v = (await anfrage('GET', `/api/dokumente/${a.id}/versionen`)).body;
    assert.deepEqual(v.aeltere.map((x: { nummer: number }) => x.nummer), [2, 1]);
    const alt = await app.inject({ method: 'GET', url: `/api/dokumente/${a.id}/versionen/1/inhalt?herunterladen=1`, headers: { cookie } });
    assert.equal(alt.body, 'erstes');
    const z = await anfrage('POST', `/api/dokumente/${a.id}/versionen/1/zurueckholen`);
    assert.equal(z.status, 201);
    assert.equal(z.body.version, 4);
    // Nur die letzten 3: Version 1 ist weg
    assert.deepEqual((await anfrage('GET', `/api/dokumente/${a.id}/versionen`)).body.aeltere.map((x: { nummer: number }) => x.nummer), [3, 2]);
    assert.equal((await app.inject({ method: 'GET', url: `/api/dokumente/${a.id}/inhalt?herunterladen=1`, headers: { cookie } })).body, 'erstes');
    const det = (await anfrage('GET', `/api/mappen/${m.id}`)).body;
    assert.equal(det.dokumente.find((x: { id: string }) => x.id === a.id).aeltere, 2);
    assert.equal((await anfrage('DELETE', `/api/dokumente/${a.id}`)).status, 204);
    assert.equal((await anfrage('GET', `/api/dokumente/${a.id}/versionen`)).status, 404);
  });

  it('Archivmodus: Löschsperre, Darf weg, Dateien prüfen (#212)', async () => {
    const t = (await anfrage('POST', '/api/typen', { name: 'Archivbeleg', archiv: { jahre: 8, stichtag: 'datum' },
      felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'datum', label: 'Datum', typ: 'datum' }],
      register: [{ key: 'daten', name: 'Daten', art: 'felder' }, { key: 'belege', name: 'Belege', art: 'dokumente' }] })).body;
    assert.deepEqual(t.archiv, { jahre: 8, stichtag: 'datum' });
    assert.equal(t.register.find((r: { key: string }) => r.key === 'belege').versionierung, true);
    const jung = (await anfrage('POST', '/api/mappen', { typId: t.id, werte: { name: 'Jung', datum: '2026-02-01' } })).body;
    const alt = (await anfrage('POST', '/api/mappen', { typId: t.id, werte: { name: 'Alt', datum: '2010-02-01' } })).body;
    const r = await anfrage('DELETE', `/api/mappen/${jung.id}`);
    assert.equal(r.status, 409);
    assert.match(r.body.fehler, /31\.12\.2034/);
    assert.equal((await anfrage('GET', `/api/mappen/${jung.id}`)).body.aufbewahrenBis, '2034-12-31');
    const weg = (await anfrage('GET', '/api/werkbank/darf-weg')).body;
    assert.deepEqual(weg.map((x: { id: string }) => x.id), [alt.id]);
    assert.equal((await anfrage('DELETE', `/api/mappen/${alt.id}`)).status, 204);
    assert.equal((await anfrage('POST', '/api/werkbank/wartung/dateien')).status, 202);
  });
});
