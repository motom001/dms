/**
 * E-Mail-Versand leicht einrichten (#813): Server aus der Adresse finden (Liste, DNS, Autoconfig, Thunderbird nur
 * auf Knopfdruck, Zeitlimit), verständliche Fehlermeldungen und Versand über OAuth mit der Anmeldung der Postfächer.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { absenderVorschlag, anbieterFuerAdresse, anbieterFuerMx, MAIL_ANBIETER } from '../../shared/src/mailanbieter';
import { Betrieb, mailFehler, speicherBetrieb, type transport } from '../src/betrieb';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { Einrichtung } from '../src/einrichtung';
import { Einrichtungscode } from '../src/einrichtungscode';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { ausAutoconfig, sucheMailserver, type SucheDeps } from '../src/mailsuche';
import type { Abruf } from '../src/oidc';
import { endpunkte, PostfachOAuth, VERSAND_OAUTH_ID } from '../src/postfach-oauth';
import { speicherRepo } from '../src/repo-speicher';
import { POSTFACH_BINDUNG_COOKIE, routen, type Anfrage } from '../src/routen';
import { Tresor } from '../src/tresor';
import { wieImModus } from './hilfen';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

/** Nachgestelltes Netz: merkt sich jede Anfrage; was nicht vorgegeben ist, gibt es nicht. */
function netz(o: { srv?: Record<string, Array<{ name: string; port: number }>>; mx?: Record<string, string[]>; dateien?: Record<string, string>; haengt?: boolean } = {}) {
  const gefragt: string[] = [];
  const nie = new Promise<never>(() => {});
  const d: SucheDeps = {
    zeitMs: 200,
    srv: async (n) => { gefragt.push(`srv ${n}`); if (o.haengt) return nie; const l = o.srv?.[n]; if (!l) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); return l.map((x) => ({ ...x, priority: 0, weight: 0 })); },
    mx: async (n) => { gefragt.push(`mx ${n}`); if (o.haengt) return nie; const l = o.mx?.[n]; if (!l) throw new Error('ENODATA'); return l.map((exchange, priority) => ({ exchange, priority })); },
    abruf: async (url, init) => {
      gefragt.push(`https ${url} ${init.redirect}`);
      if (o.haengt) return new Promise((_, nein) => init.signal.addEventListener('abort', () => nein(new Error('abgebrochen'))));
      const t = o.dateien?.[url];
      return { ok: t !== undefined, status: t !== undefined ? 200 : 404, text: async () => t ?? '' };
    },
  };
  return { d, gefragt };
}

const XML = (host: string, port: number, art: string, user = '%EMAILADDRESS%') => `<?xml version="1.0"?><clientConfig version="1.1"><emailProvider id="example.org">
  <incomingServer type="imap"><hostname>imap.example.org</hostname><port>993</port><socketType>SSL</socketType></incomingServer>
  <outgoingServer type="smtp"><hostname>${host}</hostname><port>${port}</port><socketType>${art}</socketType><username>${user}</username><authentication>password-cleartext</authentication></outgoingServer>
</emailProvider></clientConfig>`;

describe('Server aus der Adresse finden (#813)', () => {
  it('eingebaute Liste: GMX, WEB.DE, T-Online, Gmail, Outlook, iCloud, Posteo, mailbox.org – ohne jeden Netzaufruf', async () => {
    const { d, gefragt } = netz();
    for (const [adresse, host, port, verbindung] of [
      ['lena@gmx.de', 'mail.gmx.net', 587, 'starttls'], ['lena@web.de', 'smtp.web.de', 587, 'starttls'], ['lena@t-online.de', 'securesmtp.t-online.de', 465, 'ssl'],
      ['lena@gmail.com', 'smtp.gmail.com', 465, 'ssl'], ['lena@outlook.de', 'smtp-mail.outlook.com', 587, 'starttls'], ['lena@icloud.com', 'smtp.mail.me.com', 587, 'starttls'],
      ['lena@posteo.de', 'posteo.de', 587, 'starttls'], ['lena@mailbox.org', 'smtp.mailbox.org', 465, 'ssl'], ['Lena@GMX.NET', 'mail.gmx.net', 587, 'starttls'],
    ] as const) {
      const r = await sucheMailserver(adresse, {}, d);
      assert.deepEqual([r.fund?.host, r.fund?.port, r.fund?.verbindung, r.fund?.quelle], [host, port, verbindung, 'liste'], adresse);
      assert.deepEqual(r.gefragt, []);
    }
    assert.deepEqual(gefragt, []);
    // Auch der Knopf „Thunderbird“ fragt bei bekannten Anbietern niemanden.
    assert.equal((await sucheMailserver('lena@gmx.de', { thunderbird: true }, d)).fund?.quelle, 'liste');
    assert.deepEqual(gefragt, []);
  });

  it('Liste: Hinweise mit Link, OAuth bei Microsoft und Google, keine doppelten Domains', () => {
    assert.equal(anbieterFuerAdresse('lena@gmx.de')?.hinweise[0].text, 'werkbank.mail.hinweis.freischalten');
    assert.match(anbieterFuerAdresse('lena@gmail.com')!.hinweise[0].link!, /^https:\/\/support\.google\.com\//);
    assert.equal(anbieterFuerAdresse('lena@icloud.com')?.hinweise[0].text, 'werkbank.mail.hinweis.app-passwort');
    assert.equal(anbieterFuerAdresse('lena@hotmail.com')?.oauth, 'microsoft');
    assert.equal(anbieterFuerAdresse('lena@googlemail.com')?.oauth, 'google');
    assert.equal(anbieterFuerAdresse('lena@example.org'), null);
    const alle = MAIL_ANBIETER.flatMap((a) => a.domains);
    assert.equal(new Set(alle).size, alle.length);
    for (const a of MAIL_ANBIETER) for (const h of a.hinweise) if (h.link) assert.match(h.link, /^https:\/\//);
    assert.equal(anbieterFuerMx('mx00.ionos.de.')?.id, 'ionos');
    assert.equal(anbieterFuerMx('brandt-example-org.mail.protection.outlook.com')?.id, 'microsoft365');
    assert.equal(anbieterFuerMx('evil-ionos.de'), null);
  });

  it('Absender-Vorschlag: „Ablago – Name der Ablage <adresse>“', () => {
    assert.equal(absenderVorschlag('lena@example.org', 'Familie Beispiel'), 'Ablago – Familie Beispiel <lena@example.org>');
    assert.equal(absenderVorschlag(' lena@example.org ', ''), 'Ablago <lena@example.org>');
    assert.equal(absenderVorschlag('lena@example.org', 'A <b> "c"'), 'Ablago – A b c <lena@example.org>');
  });

  it('eigene Domain: SRV-Eintrag (RFC 8314 vor RFC 6186), nur die Domain geht hinaus', async () => {
    const { d, gefragt } = netz({ srv: { '_submission._tcp.example.org': [{ name: 'smtp.example.org', port: 587 }], '_submissions._tcp.example.org': [{ name: 'smtps.example.org.', port: 465 }] } });
    const r = await sucheMailserver('lena.geheim@example.org', {}, d);
    assert.deepEqual(r.fund, { host: 'smtps.example.org', port: 465, verbindung: 'ssl', quelle: 'dns', anbieter: null, benutzer: 'adresse' });
    assert.deepEqual(r.gefragt, ['DNS (example.org)']);
    assert.ok(gefragt.every((g) => !g.includes('lena')), gefragt.join());
    // „.“ heißt laut RFC 6186: kein Dienst.
    const n2 = netz({ srv: { '_submission._tcp.example.org': [{ name: '.', port: 0 }] } });
    assert.equal((await sucheMailserver('lena@example.org', {}, n2.d)).fund?.quelle ?? null, null);
  });

  it('eigene Domain bei IONOS, Strato, Microsoft 365: am MX-Eintrag erkannt', async () => {
    const { d } = netz({ mx: { 'example.org': ['mx01.ionos.de', 'mx00.ionos.de'], 'example.com': ['smtpin.rzone.de'], 'example.net': ['example-net.mail.protection.outlook.com'] } });
    assert.deepEqual((await sucheMailserver('lena@example.org', {}, d)).fund, { host: 'smtp.ionos.de', port: 587, verbindung: 'starttls', quelle: 'mx', anbieter: 'ionos', benutzer: 'adresse' });
    assert.equal((await sucheMailserver('lena@example.com', {}, d)).fund?.host, 'smtp.strato.de');
    const m365 = (await sucheMailserver('brandt@example.net', {}, d)).fund!;
    assert.deepEqual([m365.host, m365.anbieter], ['smtp.office365.com', 'microsoft365']);
  });

  it('Autoconfig des eigenen Anbieters: ohne Adresse in der Anfrage, ohne Weiterleitung', async () => {
    const { d, gefragt } = netz({ dateien: { 'https://example.org/.well-known/autoconfig/mail/config-v1.1.xml': XML('smtp.example.org', 587, 'STARTTLS', '%EMAILLOCALPART%') } });
    const r = await sucheMailserver('lena@example.org', {}, d);
    assert.deepEqual(r.fund, { host: 'smtp.example.org', port: 587, verbindung: 'starttls', quelle: 'autoconfig', anbieter: null, benutzer: 'lokalteil' });
    assert.deepEqual(r.gefragt, ['DNS (example.org)', 'autoconfig.example.org', 'example.org']);
    const https = gefragt.filter((g) => g.startsWith('https'));
    assert.deepEqual(https, ['https https://autoconfig.example.org/mail/config-v1.1.xml error', 'https https://example.org/.well-known/autoconfig/mail/config-v1.1.xml error']);
    assert.ok(!gefragt.some((g) => g.includes('thunderbird')));
  });

  it('Autoconfig: SSL/TLS bevorzugt, unverschlüsselt und ungültige Namen nicht', () => {
    const zwei = XML('smtp.example.org', 587, 'STARTTLS').replace('</emailProvider>', `<outgoingServer type="smtp"><hostname>smtp.example.org</hostname><port>465</port><socketType>SSL</socketType></outgoingServer></emailProvider>`);
    assert.deepEqual(ausAutoconfig(zwei), { host: 'smtp.example.org', port: 465, verbindung: 'ssl', benutzer: 'adresse' });
    assert.equal(ausAutoconfig(XML('smtp.example.org', 25, 'plain')), null);
    assert.equal(ausAutoconfig(XML('smtp example;org', 465, 'SSL')), null);
    assert.equal(ausAutoconfig('kein xml'), null);
  });

  it('Thunderbird-Datenbank nur auf Knopfdruck, dann nur sie', async () => {
    const { d, gefragt } = netz({ dateien: { 'https://autoconfig.thunderbird.net/v1.1/example.org': XML('mail.example.org', 465, 'SSL') } });
    const ohne = await sucheMailserver('lena@example.org', {}, d);
    assert.equal(ohne.fund, null);
    assert.ok(!gefragt.some((g) => g.includes('thunderbird')));
    gefragt.length = 0;
    const mit = await sucheMailserver('lena@example.org', { thunderbird: true }, d);
    assert.deepEqual([mit.fund?.host, mit.fund?.quelle], ['mail.example.org', 'thunderbird']);
    assert.deepEqual(mit.gefragt, ['autoconfig.thunderbird.net']);
    assert.deepEqual(gefragt, ['https https://autoconfig.thunderbird.net/v1.1/example.org follow']);
  });

  it('Zeitlimit: hängt DNS oder Server, kommt die Antwort trotzdem', async () => {
    const { d } = netz({ haengt: true });
    const start = Date.now();
    const r = await sucheMailserver('lena@example.org', {}, d);
    assert.equal(r.fund, null);
    assert.ok(Date.now() - start < 2000, `${Date.now() - start} ms`);
  });

  it('ungültige Adresse: 422', async () => {
    await assert.rejects(sucheMailserver('keine-adresse', {}, netz().d), status(422));
  });
});

describe('Verständliche Fehlermeldungen beim Prüfen (#813)', () => {
  const f = (x: Record<string, unknown>) => mailFehler(Object.assign(new Error(String(x.message ?? '')), x));
  it('Ursache statt Server-Code, Antwort des Servers zum Nachlesen', () => {
    const p = f({ code: 'EAUTH', responseCode: 535, response: '535 Authentication credentials invalid' });
    assert.match(p.text, /^Passwort falsch oder App-Passwort nötig/);
    assert.equal(p.technisch, '535 Authentication credentials invalid');
    assert.match(f({ code: 'EAUTH', responseCode: 534, response: '534-5.7.9 Application-specific password required.' }).text, /App-Passwort/);
    assert.match(f({ code: 'EAUTH', responseCode: 535, response: '535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Tenant.' }).text, /Microsoft .*OAuth/);
    assert.match(mailFehler(Object.assign(new Error('x'), { code: 'EAUTH', responseCode: 535 }), 'oauth').text, /OAuth abgelehnt.*SMTP\.Send/);
    assert.match(f({ code: 'EENVELOPE', responseCode: 553, response: '553 5.7.1 Sender address rejected: not owned by user' }).text, /Absender/);
    assert.match(f({ code: 'ESOCKET', message: 'C0:error:0A00010B:SSL routines:ssl3_get_record:wrong version number' }).text, /465 gehört zu SSL\/TLS/);
    assert.match(f({ code: 'ESOCKET', message: 'self-signed certificate' }).text, /Zertifikat/);
    assert.match(f({ code: 'EDNS', message: 'getaddrinfo ENOTFOUND smtp.example.org' }).text, /gibt es nicht/);
    assert.match(f({ code: 'ETIMEDOUT', message: 'Connection timeout' }).text, /antwortet nicht/);
    assert.match(f({ code: 'ESOCKET', message: 'connect ECONNREFUSED 127.0.0.1:25' }).text, /Keine Verbindung/);
    assert.match(f({ message: 'etwas Unerwartetes' }).text, /Antwort steht darunter/);
    // Keine Zeilenumbrüche, begrenzte Länge.
    assert.ok(!f({ response: `a\r\nb${'x'.repeat(900)}` }).technisch.includes('\n'));
    assert.ok(f({ response: 'x'.repeat(900) }).technisch.length <= 500);
  });

  it('„Verbindung prüfen“ liefert Ursache und Antwort getrennt', async () => {
    const b = new Betrieb(speicherBetrieb(), 'http://nas', undefined, { transport: () => ({ verify: async () => { throw Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535, response: '535 Authentication failed' }); }, sendMail: async () => ({}) }) as never });
    const p = await b.pruefeVerbindung({ host: 'mail.gmx.net', port: 587, verbindung: 'starttls', benutzer: 'lena@gmx.de', passwort: 'falsch' });
    assert.equal(p.ok, false);
    assert.match(p.meldung, /^Passwort falsch oder App-Passwort nötig/);
    assert.equal(p.technisch, '535 Authentication failed');
  });
});

/** Nachgestellter Microsoft-Anbieter (wie in postfach-oauth.test.ts), merkt sich den Bereich. */
function microsoft() {
  const TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const codes = new Map<string, string>();
  const bereiche: string[] = [];
  let nr = 0;
  const antwort = (s: number, d: unknown) => ({ ok: s < 400, status: s, json: async () => d, text: async () => JSON.stringify(d) });
  const abruf: Abruf = async (url, init) => {
    const felder = Object.fromEntries(new URLSearchParams(init?.body ?? ''));
    if (url !== TOKEN) return antwort(404, {});
    if (felder.scope) bereiche.push(felder.scope);
    if (felder.grant_type === 'authorization_code' && codes.has(felder.code)) { codes.delete(felder.code); nr++; return antwort(200, { access_token: `zugriff-${nr}-GEHEIM`, refresh_token: `aktualisierung-${nr}-GEHEIM`, expires_in: 3600 }); }
    if (felder.grant_type === 'refresh_token') { nr++; return antwort(200, { access_token: `zugriff-${nr}-GEHEIM`, expires_in: 3600 }); }
    return antwort(400, { error: 'invalid_grant' });
  };
  const anmelden = (url: string) => { const u = new URL(url); const code = `code-${Math.random()}`; codes.set(code, u.searchParams.get('scope')!); return { code, state: u.searchParams.get('state')!, u }; };
  return { abruf, anmelden, bereiche };
}

async function aufbau() {
  let jetzt = Date.parse('2026-11-04T10:00:00Z');
  const einstellungen = speicherEinstellungen();
  const tresor = new Tresor(einstellungen, join(await mkdtemp(join(tmpdir(), 'dms-a813-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  const { benutzer: admin } = await konten.einrichten({ email: 'katrin@example.org', name: 'Katrin', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const ms = microsoft();
  const oauth = new PostfachOAuth({ einstellungen, verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w), abruf: ms.abruf, jetzt: () => jetzt });
  const versand: Array<{ host: string; zugriff?: string; passwort: string; an?: string }> = [];
  const tr: typeof transport = (m, passwort, zugriff) => ({ verify: async () => true, sendMail: async (x: { to?: string }) => { versand.push({ host: m.host, zugriff, passwort, an: x.to }); return {}; } }) as never;
  const betrieb = new Betrieb(speicherBetrieb(), 'https://dms.example.org', tresor, { transport: tr, suche: netz().d });
  await betrieb.laden();
  betrieb.verbindeOAuth(oauth);
  const tabelle = routen(d, konten, { postfachOAuth: oauth, betrieb });
  const ich = async () => (await konten.listeBenutzer()).find((b) => b.id === admin.id)!;
  const rufe = async (m: string, pfad: string, x: Partial<Anfrage> = {}) =>
    tabelle.find((t) => t.methode === m && t.pfad === pfad)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus(await ich()) });
  await betrieb.speichereAdresse('https://dms.example.org');
  await rufe('PUT', '/api/werkbank/postfaecher-oauth/:anbieter', { params: { anbieter: 'microsoft' }, body: { clientId: 'app-1', clientSecret: 'app-geheimnis', tenant: 'common' } });
  return { betrieb, oauth, ms, rufe, versand, einstellungen, weiter: (x: number) => { jetzt += x; } };
}

const M365 = { aktiv: true, anmeldung: 'oauth', anbieter: 'microsoft', host: 'smtp.office365.com', port: 587, verbindung: 'starttls', benutzer: 'brandt@example.org', absender: 'Ablago – Tischlerei Brandt <brandt@example.org>' };

describe('Versand über OAuth (#813)', () => {
  it('Bereich zum Senden: Microsoft SMTP.Send, Google mail.google.com; „anderer Anbieter“ nicht', () => {
    assert.equal(endpunkte('microsoft', { clientId: 'x', clientSecret: '' }, 'versand').bereich, 'https://outlook.office.com/SMTP.Send offline_access');
    assert.equal(endpunkte('microsoft', { clientId: 'x', clientSecret: '' }).bereich, 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access');
    assert.equal(endpunkte('google', { clientId: 'x', clientSecret: '' }, 'versand').bereich, 'https://mail.google.com/');
    assert.throws(() => endpunkte('andere', { clientId: 'x', clientSecret: '', autorisierung: 'https://a', token: 'https://b', bereich: 'c' }, 'versand'), status(422));
  });

  it('Token nur an den Server des Anbieters, nur verschlüsselt, Benutzer ist die Adresse', async () => {
    const { betrieb } = await aufbau();
    await assert.rejects(betrieb.speichereMail({ ...M365, host: 'smtp.example.org' }), (e) => e instanceof Fachfehler && /smtp\.office365\.com/.test(e.message));
    await assert.rejects(betrieb.speichereMail({ ...M365, anbieter: 'google' }), status(422));
    await assert.rejects(betrieb.speichereMail({ ...M365, verbindung: 'keine' }), status(422));
    await assert.rejects(betrieb.speichereMail({ ...M365, benutzer: 'brandt' }), status(422));
    await assert.rejects(betrieb.speichereMail({ ...M365, anbieter: 'andere' }), status(422));
    const s = await betrieb.speichereMail({ ...M365, passwort: 'bleibt-nicht', selbstsigniert: true });
    assert.deepEqual([s.mail.anmeldung, s.mail.anbieter, s.mail.passwortGesetzt, s.mail.selbstsigniert], ['oauth', 'microsoft', false, false]);
    assert.equal(s.oauth?.zustand, 'abgemeldet');
  });

  it('Anmeldung im Browser über dieselbe App und denselben Rückruf; zurück zu E-Mail und Adresse; Versand mit Token', async () => {
    const { betrieb, ms, rufe, versand } = await aufbau();
    // Vor dem Speichern gibt es keine Anmeldung.
    await assert.rejects(rufe('POST', '/api/werkbank/betrieb/mail/oauth/start'), status(409));
    await betrieb.speichereMail(M365);
    const s = await rufe('POST', '/api/werkbank/betrieb/mail/oauth/start');
    const bindung = /dms_postfach_bindung=([^;]*)/.exec(s.cookies![0])![1];
    const { code, state, u } = ms.anmelden((s.body as { url: string }).url);
    assert.equal(u.searchParams.get('scope'), 'https://outlook.office.com/SMTP.Send offline_access');
    assert.equal(u.searchParams.get('redirect_uri'), 'https://dms.example.org/api/oauth/postfach/rueckruf');
    assert.equal(u.searchParams.get('login_hint'), 'brandt@example.org');
    const r = await rufe('GET', '/api/oauth/postfach/rueckruf', { query: { code, state }, cookieKopf: `${POSTFACH_BINDUNG_COOKIE}=${bindung}` });
    assert.equal(r.weiterleiten, '/werkbank/betrieb?oauth=angemeldet');
    const st = await rufe('GET', '/api/werkbank/betrieb');
    assert.equal((st.body as Awaited<ReturnType<Betrieb['stand']>>).oauth?.zustand, 'ok');
    assert.ok(!JSON.stringify(st.body).includes('GEHEIM'));
    await betrieb.mailer()!.sende('petra@example.org', 'Hallo', 'Text');
    assert.deepEqual(versand.at(-1), { host: 'smtp.office365.com', zugriff: 'zugriff-1-GEHEIM', passwort: '', an: 'petra@example.org' });
    // Prüfen und Testmail gehen mit derselben Anmeldung.
    assert.equal((await betrieb.pruefeVerbindung(M365)).ok, true);
    assert.equal((await betrieb.sendeTestmail(M365, 'petra@example.org')).ok, true);
    // Mit ungespeichert anderem Konto kein Token.
    await assert.rejects(betrieb.pruefeVerbindung({ ...M365, benutzer: 'herr.oezdemir@example.org' }), status(409));
  });

  it('Token läuft ab → wird erneuert mit dem Bereich zum Senden', async () => {
    const { betrieb, ms, rufe, versand, weiter } = await aufbau();
    await betrieb.speichereMail(M365);
    const s = await rufe('POST', '/api/werkbank/betrieb/mail/oauth/start');
    const { code, state } = ms.anmelden((s.body as { url: string }).url);
    await rufe('GET', '/api/oauth/postfach/rueckruf', { query: { code, state }, cookieKopf: `${POSTFACH_BINDUNG_COOKIE}=${/dms_postfach_bindung=([^;]*)/.exec(s.cookies![0])![1]}` });
    weiter(2 * 3600_000);
    await betrieb.mailer()!.sende('petra@example.org', 'Hallo', 'Text');
    assert.equal(versand.at(-1)?.zugriff, 'zugriff-2-GEHEIM');
    assert.equal(ms.bereiche.at(-1), 'https://outlook.office.com/SMTP.Send offline_access');
  });

  it('Konto, Anbieter oder Anmeldeart geändert: Anmeldung entfernt', async () => {
    const { betrieb, ms, rufe, einstellungen } = await aufbau();
    await betrieb.speichereMail(M365);
    const s = await rufe('POST', '/api/werkbank/betrieb/mail/oauth/start');
    const { code, state } = ms.anmelden((s.body as { url: string }).url);
    await rufe('GET', '/api/oauth/postfach/rueckruf', { query: { code, state }, cookieKopf: `${POSTFACH_BINDUNG_COOKIE}=${/dms_postfach_bindung=([^;]*)/.exec(s.cookies![0])![1]}` });
    assert.ok(await einstellungen.lies(`postfach_oauth_${VERSAND_OAUTH_ID}`));
    await betrieb.speichereMail({ ...M365, benutzer: 'jonas@example.org' });
    assert.equal(await einstellungen.lies(`postfach_oauth_${VERSAND_OAUTH_ID}`), null);
    assert.equal((await betrieb.stand()).oauth?.zustand, 'abgemeldet');
    // Ohne Anmeldung scheitert der Versand mit einer klaren Meldung, nicht mit einem Server-Code.
    await assert.rejects(betrieb.mailer()!.sende('petra@example.org', 'x', 'y'), /nicht per OAuth angemeldet/);
  });

  it('neue App-Registrierung (anderer Mandant) meldet auch den Versand ab', async () => {
    const { betrieb, ms, rufe, einstellungen } = await aufbau();
    await betrieb.speichereMail(M365);
    const s = await rufe('POST', '/api/werkbank/betrieb/mail/oauth/start');
    const { code, state } = ms.anmelden((s.body as { url: string }).url);
    await rufe('GET', '/api/oauth/postfach/rueckruf', { query: { code, state }, cookieKopf: `${POSTFACH_BINDUNG_COOKIE}=${/dms_postfach_bindung=([^;]*)/.exec(s.cookies![0])![1]}` });
    await rufe('PUT', '/api/werkbank/postfaecher-oauth/:anbieter', { params: { anbieter: 'microsoft' }, body: { tenant: 'example.org' } });
    assert.equal(await einstellungen.lies(`postfach_oauth_${VERSAND_OAUTH_ID}`), null);
  });

  it('Passwort-Anmeldung wie bisher; ältere Stände ohne „anmeldung“ gelten als Passwort', async () => {
    const speicher = speicherBetrieb();
    await speicher.schreibe('mail', { aktiv: true, host: 'smtp.example.org', port: 587, verbindung: 'starttls', benutzer: 'lena@example.org', passwort: 'alt', absender: '', selbstsigniert: false });
    const versand: Array<{ passwort: string; zugriff?: string }> = [];
    const b = new Betrieb(speicher, 'http://nas', undefined, { transport: ((_m: unknown, passwort: string, zugriff?: string) => ({ verify: async () => true, sendMail: async () => { versand.push({ passwort, zugriff }); return {}; } })) as never });
    await b.laden();
    assert.equal(b.ansicht().mail.anmeldung, 'passwort');
    await b.mailer()!.sende('jonas@example.org', 'x', 'y');
    assert.deepEqual(versand, [{ passwort: 'alt', zugriff: undefined }]);
  });

  it('Routen: nur für Administratoren', async () => {
    const t = routen(new Dienst(speicherRepo(), speicherDateien()), new Konten(speicherKontoRepo(), null, 'http://nas'), {});
    for (const r of t.filter((x) => x.pfad.startsWith('/api/werkbank/betrieb/mail/'))) assert.equal(r.zugang, 'admin', r.pfad);
  });
});

describe('E-Mail-Versand im Einrichtungsassistenten (#813, #804)', () => {
  it('Server-Suche vor der Einrichtung nur mit gültigem Code; danach nur für den Administrator bei offenem Assistenten', async () => {
    const code = new Einrichtungscode(await mkdtemp(join(tmpdir(), 'dms-a803-')));
    const c = await code.bereitstellen();
    const d = new Dienst(speicherRepo(), speicherDateien());
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const einrichtung = new Einrichtung({ konten, code, einstellungen: speicherEinstellungen(), mandant: { name: async () => null, umbenennen: async () => {} }, datenbank: () => ({ host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms' }) });
    const { d: suche, gefragt } = netz({ srv: { '_submissions._tcp.example.org': [{ name: 'smtp.example.org', port: 465 }] } });
    const betrieb = new Betrieb(speicherBetrieb(), 'http://nas', undefined, { suche });
    await betrieb.laden();
    const tabelle = routen(d, konten, { einrichtung, betrieb });
    const route = tabelle.find((r) => r.methode === 'POST' && r.pfad === '/api/einrichtung/mail/finden')!;
    assert.equal(route.zugang, 'offen');
    assert.equal(route.lesend, true);
    const rufe = (x: Partial<Anfrage>) => route.handler({ body: { email: 'lena@example.org' }, params: {}, query: {}, ip: '1', ...x });
    await assert.rejects(rufe({}), status(403));
    await assert.rejects(rufe({ einrichtungscode: 'AAAA-AAAA-AAAA' }), status(403));
    assert.deepEqual(gefragt, [], 'ohne Code fragt Ablago niemanden');
    const r = (await rufe({ einrichtungscode: c })).body as { fund: { host: string; port: number; quelle: string } | null };
    assert.deepEqual([r.fund?.host, r.fund?.port, r.fund?.quelle], ['smtp.example.org', 465, 'dns']);
    // Gespeichert ist dabei nichts (#804).
    assert.equal(betrieb.ansicht().mail.host, '');
    await einrichtung.einrichten({ mandant: 'Familie Beispiel', name: 'Lena', email: 'lena@example.org', passwort: 'ein-langes-passwort' }, c, { ip: '1', geraet: '' });
    await assert.rejects(rufe({ einrichtungscode: c }), status(409));
  });
});
