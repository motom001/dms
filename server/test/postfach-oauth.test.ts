/** Postfächer: Anmeldung per OAuth 2.0 (#358) – PKCE/state, Code-Tausch, Gerätecode, Erneuerung, Ablauf, keine Token nach außen. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Abruf } from '../src/oidc';
import { Postfaecher, type ImapSitzung, type Zugang } from '../src/postfach';
import { AnmeldungAbgelaufen, endpunkte, pkceChallenge, PostfachOAuth } from '../src/postfach-oauth';
import { speicherRepo } from '../src/repo-speicher';
import { POSTFACH_BINDUNG_COOKIE, pruefeZugang, routen, type Anfrage } from '../src/routen';
import { Tresor } from '../src/tresor';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const MS_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GERAET = 'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode';

/** Nachgestellter Microsoft-Anbieter: prüft PKCE, Client, Rückruf-Adresse; Aktualisierungstoken rotieren. */
function anbieter() {
  const codes = new Map<string, { challenge: string; redirect: string }>();
  const gueltig = new Set<string>();
  const aufrufe: Array<{ url: string; felder: Record<string, string> }> = [];
  let nr = 0;
  let geraetFertig = false;
  const antwort = (s: number, d: unknown) => ({ ok: s < 400, status: s, json: async () => d, text: async () => JSON.stringify(d) });
  const ausstellen = () => { nr++; const a = `aktualisierung-${nr}-GEHEIM`; gueltig.add(a); return { access_token: `zugriff-${nr}-GEHEIM`, refresh_token: a, expires_in: 3600, token_type: 'Bearer' }; };
  const abruf: Abruf = async (url, init) => {
    const felder = Object.fromEntries(new URLSearchParams(init?.body ?? ''));
    aufrufe.push({ url, felder });
    if (url === MS_GERAET) return antwort(200, { device_code: 'geraet-1', user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5 });
    if (url !== MS_TOKEN) return antwort(404, {});
    if (felder.client_id !== 'app-1') return antwort(401, { error: 'invalid_client' });
    if (felder.grant_type === 'authorization_code') {
      if (felder.client_secret !== 'app-geheimnis') return antwort(401, { error: 'invalid_client' });
      const c = codes.get(felder.code);
      codes.delete(felder.code);
      if (!c) return antwort(400, { error: 'invalid_grant' });
      if (createHash('sha256').update(felder.code_verifier ?? '').digest('base64url') !== c.challenge) return antwort(400, { error: 'invalid_grant', error_description: 'PKCE' });
      if (felder.redirect_uri !== c.redirect) return antwort(400, { error: 'invalid_grant', error_description: 'redirect_uri' });
      return antwort(200, ausstellen());
    }
    if (felder.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
      if (felder.client_secret) return antwort(401, { error: 'invalid_client', error_description: 'AADSTS700025 public client' });
      return geraetFertig ? antwort(200, ausstellen()) : antwort(400, { error: 'authorization_pending' });
    }
    if (felder.grant_type === 'refresh_token') {
      if (!gueltig.has(felder.refresh_token)) return antwort(400, { error: 'invalid_grant', error_description: 'AADSTS70008: The refresh token has expired.' });
      gueltig.delete(felder.refresh_token);
      return antwort(200, ausstellen());
    }
    return antwort(400, { error: 'unsupported_grant_type' });
  };
  /** Der Browser beim Anbieter: Code zur Anfrage. */
  const anmelden = (url: string) => {
    const u = new URL(url);
    const code = `code-${codes.size + 1}-${Math.random()}`;
    codes.set(code, { challenge: u.searchParams.get('code_challenge')!, redirect: u.searchParams.get('redirect_uri')! });
    return { code, state: u.searchParams.get('state')!, u };
  };
  return { abruf, anmelden, aufrufe, gueltig, geraet: () => { geraetFertig = true; } };
}

async function aufbau() {
  let jetzt = Date.parse('2026-11-01T10:00:00Z');
  const einstellungen = speicherEinstellungen();
  const tresor = new Tresor(einstellungen, join(await mkdtemp(join(tmpdir(), 'dms-oauth-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const admin2 = (await konten.legeBenutzerAn({ email: 'zweit@example.org', name: 'Zweit', rolle: 'admin' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const a = anbieter();
  const mails: string[] = [];
  const anAdmins = async (b: string) => { mails.push(b); };
  const oauth = new PostfachOAuth({ einstellungen, verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w), abruf: a.abruf, jetzt: () => jetzt, anAdmins });
  const zugaenge: Zugang[] = [];
  let imapFehler: Error | null = null;
  const verbinde = async (z: Zugang): Promise<ImapSitzung> => {
    zugaenge.push(z);
    if (imapFehler) throw imapFehler;
    return { uidValidity: '1', anzahl: 0, neue: async () => [], quelle: async () => Buffer.alloc(0), verschiebe: async () => {}, gelesen: async () => {}, loesche: async () => {}, ordnerListe: async () => ['INBOX'], schliessen: async () => {} };
  };
  const pf = new Postfaecher({
    dienst: d, einstellungen, verbinde, lies: async () => { throw new Error('keine Mails'); },
    verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w), anAdmins, oauth, jetzt: () => jetzt,
  });
  const tabelle = routen(d, konten, { postfaecher: pf, postfachOAuth: oauth, betrieb: { adresseFuerLinks: () => 'https://dms.example.org/' } as never });
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const rufe = async (b: { id: string } | null, m: string, pfad: string, x: Partial<Anfrage> = {}) =>
    tabelle.find((t) => t.methode === m && t.pfad === pfad)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: b ? await ich(b.id) : undefined });
  await rufe(admin, 'PUT', '/api/werkbank/postfaecher-oauth/:anbieter', { params: { anbieter: 'microsoft' }, body: { clientId: 'app-1', clientSecret: 'app-geheimnis', tenant: 'common' } });
  const [p] = await pf.speichere({ name: 'Firma', server: 'outlook.office365.com', benutzer: 'dms@firma.example', anmeldung: 'oauth', anbieter: 'microsoft' }, null, 'test');
  /** Ganzer Browser-Ablauf über die Routen; liefert die Rückkehr-Adresse. */
  const browser = async (start = admin, rueck: { id: string } | null = admin, cookieAendern?: (c: string) => string) => {
    const s = await rufe(start, 'POST', '/api/werkbank/postfaecher/:id/oauth/start', { params: { id: p.id } });
    const bindung = /dms_postfach_bindung=([^;]*)/.exec(s.cookies![0])![1];
    const { code, state, u } = a.anmelden((s.body as { url: string }).url);
    const cookie = `${POSTFACH_BINDUNG_COOKIE}=${cookieAendern ? cookieAendern(bindung) : bindung}`;
    const r = await rufe(rueck, 'GET', '/api/oauth/postfach/rueckruf', { query: { code, state }, cookieKopf: cookie });
    return { r, state, u, code, cookie };
  };
  return { pf, oauth, p, a, mails, admin, admin2, rufe, browser, tabelle, konten, einstellungen, zugaenge, tresor, weiter: (ms: number) => { jetzt += ms; }, imap: (e: Error | null) => { imapFehler = e; } };
}

/** Hält die nächste Anfrage an den Anbieter an, bis `los()` – alle weiteren gehen durch. */
function halte(oauth: PostfachOAuth) {
  const o = oauth as unknown as { d: { abruf: Abruf } };
  const echt = o.d.abruf;
  let los!: () => void, angekommen!: () => void;
  const tor = new Promise<void>((r) => { los = r; });
  const da = new Promise<void>((r) => { angekommen = r; });
  let erst = true;
  o.d.abruf = async (url, init) => { if (erst) { erst = false; angekommen(); await tor; } return echt(url, init); };
  return { da, los: () => { o.d.abruf = echt; los(); } };
}
const PP = (id: string) => ({ id, name: 'Firma', benutzer: 'dms@firma.example', anbieter: 'microsoft' as const });

describe('Postfächer: OAuth 2.0 (#358)', () => {
  it('Voreinstellungen der Anbieter', () => {
    const ms = endpunkte('microsoft', { clientId: 'x', clientSecret: '', tenant: 'contoso.onmicrosoft.com' });
    assert.equal(ms.autorisierung, 'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize');
    assert.equal(ms.bereich, 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access');
    const g = endpunkte('google', { clientId: 'x', clientSecret: '' });
    assert.equal(g.token, 'https://oauth2.googleapis.com/token');
    assert.equal(g.bereich, 'https://mail.google.com/');
    assert.equal(g.geraet, null);
    assert.throws(() => endpunkte('andere', { clientId: 'x', clientSecret: '' }), status(422));
  });

  it('bestehende Postfächer bleiben bei „Passwort“', async () => {
    const { pf } = await aufbau();
    const [, alt] = await pf.speichere({ name: 'Alt', server: 'imap.example.org', benutzer: 'a@example.org', passwort: 'pw' }, null, 'test');
    assert.equal(alt.anmeldung, 'passwort');
    assert.equal(alt.oauth, null);
    assert.equal(alt.passwortGesetzt, true);
  });

  it('Autorisierungscode mit PKCE (S256) und state; Rückkehr fest in die Werkbank', async () => {
    const { browser, p, pf, zugaenge, a } = await aufbau();
    const { r, u } = await browser();
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(u.searchParams.get('redirect_uri'), 'https://dms.example.org/api/oauth/postfach/rueckruf');
    assert.equal(u.searchParams.get('scope'), 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access');
    assert.ok((u.searchParams.get('state') ?? '').length >= 40);
    assert.equal(r.weiterleiten, `/werkbank/postfaecher/${p.id}?oauth=angemeldet`);
    assert.match(r.cookies![0], /Max-Age=0/, 'Bindungs-Cookie gelöscht');
    const tausch = a.aufrufe.find((x) => x.felder.grant_type === 'authorization_code')!;
    assert.equal(pkceChallenge(tausch.felder.code_verifier), u.searchParams.get('code_challenge'));
    const [ansicht] = await pf.ansicht();
    assert.equal(ansicht.oauth?.zustand, 'ok');
    assert.equal(await pf.teste({}, p.id).then((x) => x.ok), true);
    assert.equal(zugaenge.at(-1)?.zugriffstoken, 'zugriff-1-GEHEIM');
    assert.equal(zugaenge.at(-1)?.passwort, '');
  });

  it('falscher, wiederverwendeter oder abgelaufener state, fremder Administrator, anderer Browser → abgelehnt', async () => {
    const { rufe, p, browser, a, weiter, admin, admin2, oauth } = await aufbau();
    // Unbekannter state: zurück zur Liste, ohne Postfach in der Adresse.
    const r1 = await rufe(admin, 'GET', '/api/oauth/postfach/rueckruf', { query: { code: 'x', state: 'erfunden' } });
    assert.equal(r1.weiterleiten, '/werkbank/postfaecher?oauthfehler=abgelaufen');
    // state ein zweites Mal: abgelehnt.
    const { state, code, cookie } = await browser();
    const r2 = await rufe(admin, 'GET', '/api/oauth/postfach/rueckruf', { query: { code, state }, cookieKopf: cookie });
    assert.equal(r2.weiterleiten, '/werkbank/postfaecher?oauthfehler=abgelaufen');
    // Fremder Administrator / nicht angemeldet / anderer Browser – nur feste Codes in der Adresse, kein Text.
    assert.equal((await browser(admin, admin2)).r.weiterleiten, `/werkbank/postfaecher/${p.id}?oauthfehler=admin`);
    assert.equal((await browser(admin, null)).r.weiterleiten, '/werkbank/postfaecher?oauthfehler=admin');
    assert.equal((await browser(admin, admin, (c) => `${c}x`)).r.weiterleiten, `/werkbank/postfaecher/${p.id}?oauthfehler=browser`);
    // Fehlertext des Anbieters landet nie in der Adresse.
    const s3 = await rufe(admin, 'POST', '/api/werkbank/postfaecher/:id/oauth/start', { params: { id: p.id } });
    const st3 = new URL((s3.body as { url: string }).url).searchParams.get('state')!;
    const r3 = await rufe(admin, 'GET', '/api/oauth/postfach/rueckruf', { query: { state: st3, error: 'access_denied', error_description: 'Bitte ruf 0900-123 an' }, cookieKopf: `${POSTFACH_BINDUNG_COOKIE}=${/dms_postfach_bindung=([^;]*)/.exec(s3.cookies![0])![1]}` });
    assert.equal(r3.weiterleiten, `/werkbank/postfaecher/${p.id}?oauthfehler=abgelehnt`);
    // Abgelaufen (nach 10 Minuten).
    const s = await rufe(admin, 'POST', '/api/werkbank/postfaecher/:id/oauth/start', { params: { id: p.id } });
    const b = /dms_postfach_bindung=([^;]*)/.exec(s.cookies![0])![1];
    const x = a.anmelden((s.body as { url: string }).url);
    weiter(11 * 60_000);
    await assert.rejects(oauth.rueckruf({ code: x.code, state: x.state }, { id: admin.id }, b), status(400));
    // Fehler des Anbieters (error=access_denied): kein Token-Tausch.
    const vorher = a.aufrufe.length;
    const s2 = await rufe(admin, 'POST', '/api/werkbank/postfaecher/:id/oauth/start', { params: { id: p.id } });
    const st = new URL((s2.body as { url: string }).url).searchParams.get('state')!;
    await assert.rejects(oauth.rueckruf({ error: 'access_denied', state: st }, { id: admin.id }, /dms_postfach_bindung=([^;]*)/.exec(s2.cookies![0])![1]), status(401));
    assert.equal(a.aufrufe.length, vorher);
  });

  it('ohne Adresse des DMS kein Browser-Fluss; Passwort-Postfach lehnt OAuth ab', async () => {
    const { oauth, p, pf, rufe, admin } = await aufbau();
    await assert.rejects(oauth.start({ id: p.id, anbieter: 'microsoft', benutzer: 'x' }, { id: admin.id, email: admin.email }, ''), status(409));
    // Rückruf nur über https (http nur für localhost).
    await assert.rejects(oauth.start({ id: p.id, anbieter: 'microsoft', benutzer: 'x' }, { id: admin.id, email: admin.email }, 'http://nas.local/api/oauth/postfach/rueckruf'), status(409));
    for (const ok of ['http://localhost:8080/api/oauth/postfach/rueckruf', 'http://127.0.0.1/api/oauth/postfach/rueckruf', 'http://[::1]:3000/api/oauth/postfach/rueckruf']) {
      assert.match((await oauth.start({ id: p.id, anbieter: 'microsoft', benutzer: 'x' }, { id: admin.id, email: admin.email }, ok)).url, /^https:\/\/login\.microsoftonline\.com\//);
    }
    const l = await pf.speichere({ name: 'PW', server: 'imap.example.org', benutzer: 'a@example.org', passwort: 'pw' }, null, 'test');
    await assert.rejects(rufe(admin, 'POST', '/api/werkbank/postfaecher/:id/oauth/start', { params: { id: l[1].id } }), status(409));
  });

  it('Gerätecode: warten, dann angemeldet (ohne Client-Geheimnis)', async () => {
    const { rufe, p, admin, admin2, a, weiter, oauth } = await aufbau();
    const g = await rufe(admin, 'POST', '/api/werkbank/postfaecher/:id/oauth/geraet', { params: { id: p.id } });
    assert.deepEqual({ ...(g.body as object), bis: undefined }, { code: 'ABCD-EFGH', adresse: 'https://microsoft.com/devicelogin', bis: undefined, intervall: 5 });
    await assert.rejects(rufe(admin2, 'POST', '/api/werkbank/postfaecher/:id/oauth/geraet/pruefen', { params: { id: p.id } }), status(404));
    assert.equal(((await rufe(admin, 'POST', '/api/werkbank/postfaecher/:id/oauth/geraet/pruefen', { params: { id: p.id } })).body as { fertig: boolean }).fertig, false);
    a.geraet();
    // Vor dem Intervall wird nicht nachgefragt.
    const n = a.aufrufe.length;
    assert.equal(((await rufe(admin, 'POST', '/api/werkbank/postfaecher/:id/oauth/geraet/pruefen', { params: { id: p.id } })).body as { fertig: boolean }).fertig, false);
    assert.equal(a.aufrufe.length, n);
    weiter(5_000);
    assert.equal(((await rufe(admin, 'POST', '/api/werkbank/postfaecher/:id/oauth/geraet/pruefen', { params: { id: p.id } })).body as { fertig: boolean }).fertig, true);
    assert.equal((await oauth.status(p.id)).zustand, 'ok');
    // Erneuern eines öffentlichen Clients: ohne Geheimnis.
    weiter(2 * 3600_000);
    await oauth.zugriffstoken({ id: p.id, name: 'Firma', benutzer: 'dms@firma.example', anbieter: 'microsoft' });
    assert.equal(a.aufrufe.at(-1)!.felder.grant_type, 'refresh_token');
    assert.equal(a.aufrufe.at(-1)!.felder.client_secret, undefined);
  });

  it('Erneuerung vor Ablauf mit neuem Aktualisierungstoken', async () => {
    const { browser, oauth, p, weiter, a, einstellungen, tresor } = await aufbau();
    await browser();
    const pp = { id: p.id, name: 'Firma', benutzer: 'dms@firma.example', anbieter: 'microsoft' as const };
    assert.equal(await oauth.zugriffstoken(pp), 'zugriff-1-GEHEIM');
    weiter(56 * 60_000); // 4 Minuten vor Ablauf
    assert.equal(await oauth.zugriffstoken(pp), 'zugriff-2-GEHEIM');
    const r = a.aufrufe.at(-1)!;
    assert.equal(r.felder.refresh_token, 'aktualisierung-1-GEHEIM');
    assert.equal(r.felder.client_secret, 'app-geheimnis');
    const t = (await einstellungen.lies(`postfach_oauth_${p.id}`)) as Record<string, string>;
    assert.equal(tresor.entschluessele(t.aktualisierung), 'aktualisierung-2-GEHEIM');
    // Zwei gleichzeitige Abrufe erneuern nur einmal.
    weiter(3600_000);
    const vorher = a.aufrufe.length;
    const [x, y] = await Promise.all([oauth.zugriffstoken(pp), oauth.zugriffstoken(pp)]);
    assert.equal(x, y);
    assert.equal(a.aufrufe.length, vorher + 1);
  });

  it('invalid_grant → Zustand „abgelaufen“, Warnung, genau eine Mail; kein weiterer Abruf', async () => {
    const { browser, oauth, p, pf, weiter, a, mails } = await aufbau();
    await browser();
    a.gueltig.clear(); // beim Anbieter entzogen bzw. 7-Tage-Grenze
    weiter(2 * 3600_000);
    await assert.rejects(pf.abrufen(p.id), (e) => e instanceof Fachfehler && /neu anmelden/.test(e.message));
    assert.equal(mails.length, 1);
    assert.match(mails[0], /Anmeldung abgelaufen/);
    const s = await oauth.status(p.id);
    assert.equal(s.zustand, 'abgelaufen');
    assert.match(s.fehler!, /AADSTS70008/);
    assert.deepEqual(await pf.anmeldungFehlt(), [{ id: p.id, name: 'Firma', zustand: 'abgelaufen' }]);
    // Weitere Versuche: keine Anfrage beim Anbieter, keine weitere Mail (auch nicht nach drei Fehlern).
    const n = a.aufrufe.length;
    for (let i = 0; i < 4; i++) await assert.rejects(pf.abrufen(p.id), AnmeldungAbgelaufen);
    await pf.faellige();
    assert.equal(a.aufrufe.length, n);
    assert.equal(mails.length, 1);
    // Neu anmelden: wieder ok, Warnung weg.
    await browser();
    assert.equal((await oauth.status(p.id)).zustand, 'ok');
    assert.deepEqual(await pf.anmeldungFehlt(), []);
  });

  it('Netzfehler beim Erneuern ist kein Ablauf', async () => {
    const { browser, oauth, p, weiter, mails } = await aufbau();
    await browser();
    weiter(2 * 3600_000);
    const o = oauth as unknown as { d: { abruf: Abruf } };
    const echt = o.d.abruf;
    o.d.abruf = async () => { throw new Error('ECONNRESET'); };
    await assert.rejects(oauth.zugriffstoken({ id: p.id, name: 'Firma', benutzer: 'x', anbieter: 'microsoft' }), status(502));
    o.d.abruf = echt;
    assert.equal((await oauth.status(p.id)).zustand, 'ok');
    assert.equal(mails.length, 0);
  });

  it('Token und Geheimnis erscheinen nie in API-Antworten und nur verschlüsselt in den Einstellungen', async () => {
    const { browser, rufe, admin, p, einstellungen } = await aufbau();
    await browser();
    const antworten = JSON.stringify([
      (await rufe(admin, 'GET', '/api/werkbank/postfaecher')).body,
      (await rufe(admin, 'GET', '/api/werkbank/postfaecher-oauth')).body,
      (await rufe(admin, 'PUT', '/api/werkbank/postfaecher/:id', { params: { id: p.id }, body: { name: 'Firma 2' } })).body,
    ]);
    assert.doesNotMatch(antworten, /GEHEIM|app-geheimnis|dms1\$/);
    assert.match(antworten, /"secretGesetzt":true/);
    assert.match(antworten, /"zustand":"ok"/);
    const roh = JSON.stringify([await einstellungen.lies(`postfach_oauth_${p.id}`), await einstellungen.lies('postfach_oauth_apps')]);
    assert.doesNotMatch(roh, /GEHEIM|app-geheimnis/);
    assert.match(roh, /dms1\$/);
  });

  it('Abmelden löscht die Token; Anbieter- oder Kontowechsel ebenso', async () => {
    const { browser, rufe, admin, p, pf, einstellungen, oauth } = await aufbau();
    await browser();
    const l = (await rufe(admin, 'POST', '/api/werkbank/postfaecher/:id/oauth/abmelden', { params: { id: p.id } })).body as Array<{ oauth: { zustand: string } }>;
    assert.equal(l[0].oauth.zustand, 'abgemeldet');
    assert.equal(await einstellungen.lies(`postfach_oauth_${p.id}`), null);
    await assert.rejects(pf.abrufen(p.id), (e) => e instanceof Fachfehler && /nicht per OAuth angemeldet/.test(e.message));
    await browser();
    await pf.speichere({ benutzer: 'anderes@firma.example' }, p.id, 'test');
    assert.equal((await oauth.status(p.id)).zustand, 'abgemeldet');
    await browser();
    await pf.speichere({ anmeldung: 'passwort', passwort: 'pw' }, p.id, 'test');
    assert.equal(await einstellungen.lies(`postfach_oauth_${p.id}`), null);
  });

  it('IMAP lehnt das Token ab: verständliche Meldung', async () => {
    const { browser, pf, p, imap } = await aufbau();
    await browser();
    imap(Object.assign(new Error('AUTHENTICATE failed'), { authenticationFailed: true }));
    const r = await pf.teste({}, p.id);
    assert.equal(r.ok, false);
    assert.match(r.text, /OAuth abgelehnt.*IMAP\.AccessAsUser\.All/);
  });

  /* ---------- Sicherheits-Review (S1): Negativfälle ---------- */

  it('neue Routen nur für Administratoren; Rückruf eines Mitglieds tauscht keinen Code', async () => {
    const { tabelle, konten, admin, a, browser } = await aufbau();
    const neu = tabelle.filter((r) => /postfaecher-oauth|\/oauth\//.test(r.pfad));
    assert.ok(neu.length >= 7);
    for (const r of neu) assert.equal(r.zugang, r.pfad === '/api/oauth/postfach/rueckruf' ? 'offen' : 'admin', r.pfad);
    const { benutzer: ben } = await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben', rolle: 'mitglied' }, admin.id);
    await konten.setzePasswortDirekt('ben@example.org', 'ein-langes-passwort-ben');
    const { schluessel } = (await konten.anmelden({ email: 'ben@example.org', passwort: 'ein-langes-passwort-ben' }, '1.1.1.1')) as { schluessel: string };
    for (const r of neu.filter((x) => x.zugang === 'admin')) {
      await assert.rejects(pruefeZugang(r, { body: {}, params: {}, query: {}, ip: '1', sitzung: schluessel }, (n) => (n === 'x-dms' ? '1' : undefined), konten), status(403), r.pfad);
    }
    const vorher = a.aufrufe.length;
    assert.equal((await browser(admin, ben)).r.weiterleiten, '/werkbank/postfaecher?oauthfehler=admin');
    assert.equal(a.aufrufe.length, vorher, 'kein Token-Tausch');
  });

  it('ungültiger Mandant oder Endpunkt → 422; neuer Mandant meldet die Postfächer ab', async () => {
    const { rufe, admin, oauth, browser, p } = await aufbau();
    const put = (anbieter: string, body: object) => rufe(admin, 'PUT', '/api/werkbank/postfaecher-oauth/:anbieter', { params: { anbieter }, body });
    for (const tenant of ['evil.example/../x', 'a b', 'x?y=1', 'x#y']) await assert.rejects(put('microsoft', { tenant }), status(422), tenant);
    for (const token of ['ftp://x.example/token', 'https://x.example/token#f', 'keine Adresse', 'http://extern.example/token']) {
      await assert.rejects(put('andere', { clientId: 'c', autorisierung: 'https://x.example/auth', token, bereich: 'imap' }), status(422), token);
    }
    await assert.rejects(put('unbekannt', { clientId: 'c' }), status(422));
    await browser();
    // Nur das Geheimnis neu: Anmeldung bleibt.
    await put('microsoft', { clientSecret: 'app-geheimnis' });
    assert.equal((await oauth.status(p.id)).zustand, 'ok');
    // Anderer Mandant = anderer Token-Endpunkt: abgemeldet, damit kein Aktualisierungstoken dorthin geht.
    await put('microsoft', { tenant: 'contoso.onmicrosoft.com' });
    assert.equal((await oauth.status(p.id)).zustand, 'abgemeldet');
  });

  it('Testen: gespeichertes Token/Passwort nur an den gespeicherten Server; „keine“ mit OAuth verboten', async () => {
    const { browser, pf, p, zugaenge, a, oauth } = await aufbau();
    await browser();
    const z = zugaenge.length, n = a.aufrufe.length;
    await assert.rejects(pf.teste({ server: 'angreifer.example' }, p.id), (e) => status(400)(e) && /erst speichern/.test((e as Error).message));
    await assert.rejects(pf.teste({ port: 143, verschluesselung: 'starttls' }, p.id), status(400));
    const k = await pf.teste({ server: 'angreifer.example', verschluesselung: 'keine', port: 143, unverschluesseltBestaetigt: true }, p.id);
    assert.equal(k.ok, false);
    assert.match(k.text, /OAuth 2\.0 nur mit Verschlüsselung/);
    assert.equal(zugaenge.length, z, 'keine Verbindung');
    assert.equal(a.aufrufe.length, n, 'keine Erneuerung beim Anbieter');
    await assert.rejects(pf.speichere({ verschluesselung: 'keine', port: 143, unverschluesseltBestaetigt: true }, p.id, 'test'), status(422));
    // Neuer Server gespeichert: Anmeldung entfernt (Token gehört zum alten Server).
    await pf.speichere({ server: 'imap.anders.example' }, p.id, 'test');
    assert.equal((await oauth.status(p.id)).zustand, 'abgemeldet');

    const [, q] = await pf.speichere({ name: 'PW', server: 'imap.example.org', benutzer: 'a@example.org', passwort: 'pw-GEHEIM' }, null, 'test');
    await assert.rejects(pf.teste({ server: 'angreifer.example' }, q.id), (e) => status(400)(e) && /Passwort neu eingeben/.test((e as Error).message));
    await assert.rejects(pf.teste({ verschluesselung: 'keine', port: 143, unverschluesseltBestaetigt: true }, q.id), status(400));
    // Ohne Bestätigung für „keine“: Fehler wie beim Speichern (nicht mehr stillschweigend bestätigt).
    assert.match((await pf.teste({ verschluesselung: 'keine', port: 143, passwort: 'x' }, q.id)).text, /ausdrücklich bestätigen/);
    assert.equal(zugaenge.length, z);
    // Frisch eingegebenes Passwort: darf an jeden Server.
    assert.equal((await pf.teste({ server: 'anderer.example', passwort: 'neu' }, q.id)).ok, true);
    assert.deepEqual([zugaenge.at(-1)!.server, zugaenge.at(-1)!.passwort], ['anderer.example', 'neu']);
    assert.equal((await pf.teste({}, q.id)).ok, true);
    assert.equal(zugaenge.at(-1)!.passwort, 'pw-GEHEIM');
    // Speichern mit neuem Server verlangt das Passwort neu.
    await assert.rejects(pf.speichere({ server: 'anderer.example' }, q.id, 'test'), (e) => status(422)(e) && /Passwort neu eingeben/.test((e as Error).message));
    await pf.speichere({ server: 'anderer.example', passwort: 'neu' }, q.id, 'test');
  });

  it('Steuerzeichen im Benutzernamen → 422', async () => {
    const { pf, p } = await aufbau();
    for (const benutzer of ['dms@firma.example\r\nx', 'a\u0001b', 'a\u007fb']) await assert.rejects(pf.speichere({ benutzer }, p.id, 'test'), status(422));
  });

  it('Abmelden oder Löschen während einer Erneuerung: bleibt abgemeldet', async () => {
    const { browser, oauth, p, pf, weiter, einstellungen } = await aufbau();
    await browser();
    weiter(2 * 3600_000);
    const h = halte(oauth);
    const lauf = oauth.zugriffstoken(PP(p.id));
    await h.da;
    await oauth.abmelden(p.id, 'test');
    h.los();
    await assert.rejects(lauf, AnmeldungAbgelaufen);
    assert.equal(await einstellungen.lies(`postfach_oauth_${p.id}`), null);
    assert.equal((await oauth.status(p.id)).zustand, 'abgemeldet');
    await assert.rejects(oauth.zugriffstoken(PP(p.id)), AnmeldungAbgelaufen);
    // Postfach löschen während der Erneuerung.
    await browser();
    weiter(2 * 3600_000);
    const h2 = halte(oauth);
    const lauf2 = oauth.zugriffstoken(PP(p.id));
    await h2.da;
    await pf.loesche(p.id, 'test');
    h2.los();
    await assert.rejects(lauf2, AnmeldungAbgelaufen);
    assert.equal(await einstellungen.lies(`postfach_oauth_${p.id}`), null);
  });

  it('neue Anmeldung während einer Erneuerung wird weder überschrieben noch als abgelaufen markiert', async () => {
    const { browser, oauth, p, weiter, a, mails, einstellungen, tresor } = await aufbau();
    await browser();
    weiter(2 * 3600_000);
    a.gueltig.clear(); // die laufende Erneuerung endet mit invalid_grant
    const h = halte(oauth);
    const lauf = oauth.zugriffstoken(PP(p.id));
    await h.da;
    await browser(); // neue Anmeldung: zugriff-2
    h.los();
    assert.equal(await lauf, 'zugriff-2-GEHEIM');
    assert.equal((await oauth.status(p.id)).zustand, 'ok');
    assert.equal(mails.length, 0);
    const t = (await einstellungen.lies(`postfach_oauth_${p.id}`)) as Record<string, string>;
    assert.equal(tresor.entschluessele(t.aktualisierung), 'aktualisierung-2-GEHEIM');
    // Erfolgreiche Erneuerung der alten Anmeldung schreibt nicht über die neue.
    weiter(2 * 3600_000);
    const vorher = (await einstellungen.lies(`postfach_oauth_${p.id}`)) as Record<string, string>;
    const h2 = halte(oauth);
    const lauf2 = oauth.zugriffstoken(PP(p.id)); // erneuert mit aktualisierung-2 → zugriff-4
    await h2.da;
    await browser(); // zugriff-3
    h2.los();
    assert.equal(await lauf2, 'zugriff-3-GEHEIM');
    const nachher = (await einstellungen.lies(`postfach_oauth_${p.id}`)) as Record<string, string>;
    assert.notEqual(nachher.kennung, vorher.kennung);
    assert.equal(tresor.entschluessele(nachher.zugriff), 'zugriff-3-GEHEIM');
  });
});
