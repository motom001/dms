/** Anmeldung über OpenID Connect (#241): Ablauf mit nachgestelltem Anbieter, Token-Prüfung, Zuordnung. */
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { describe, it } from 'node:test';
import { Dienst } from '../src/dienst';
import { speicherDateien } from '../src/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { identitaetAus, Oidc, pruefeAussteller, pruefeIdToken, type Abruf, type JsonWebKey } from '../src/oidc';
import { speicherRepo } from '../src/repo-speicher';

const ISS = 'https://login.example.org/tenant/v2.0';
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');

function schluesselpaar(art: 'rsa' | 'ec' | 'ed', kid: string) {
  const p = art === 'rsa' ? generateKeyPairSync('rsa', { modulusLength: 2048 }) : art === 'ec' ? generateKeyPairSync('ec', { namedCurve: 'P-256' }) : generateKeyPairSync('ed25519');
  return { privat: p.privateKey, jwk: { ...(p.publicKey.export({ format: 'jwk' }) as JsonWebKey), kid, use: 'sig' }, alg: art === 'rsa' ? 'RS256' : art === 'ec' ? 'ES256' : 'EdDSA' };
}
function token(claims: Record<string, unknown>, k: { privat: KeyObject; jwk: JsonWebKey; alg: string }, kopf: Record<string, unknown> = {}) {
  const h = b64({ alg: k.alg, kid: k.jwk.kid, typ: 'JWT', ...kopf });
  const c = b64(claims);
  const d = Buffer.from(`${h}.${c}`);
  const sig = k.alg === 'EdDSA' ? sign(null, d, k.privat) : k.alg === 'ES256' ? sign('sha256', d, { key: k.privat, dsaEncoding: 'ieee-p1363' }) : sign('sha256', d, k.privat);
  return `${h}.${c}.${sig.toString('base64url')}`;
}

/** Nachgestellter Anbieter: Discovery, JWKS, Token-Endpunkt; prüft PKCE und Client-Zugang. */
function anbieter(opt: { schluessel: ReturnType<typeof schluesselpaar>[]; signiert?: ReturnType<typeof schluesselpaar>; claims?: Record<string, unknown>; jetzt: () => number }) {
  const codes = new Map<string, { challenge: string; nonce: string; redirect: string }>();
  const log: string[] = [];
  const abruf: Abruf = async (url, init) => {
    log.push(`${init?.method ?? 'GET'} ${url}`);
    const antwort = (status: number, daten: unknown) => ({ ok: status < 400, status, json: async () => daten, text: async () => JSON.stringify(daten) });
    if (url === `${ISS}/.well-known/openid-configuration`) return antwort(200, {
      issuer: ISS, authorization_endpoint: 'https://login.example.org/authorize', token_endpoint: 'https://login.example.org/token',
      jwks_uri: 'https://login.example.org/keys', end_session_endpoint: 'https://login.example.org/logout', token_endpoint_auth_methods_supported: ['client_secret_basic'],
    });
    if (url === 'https://login.example.org/keys') return antwort(200, { keys: opt.schluessel.map((k) => k.jwk) });
    if (url === 'https://login.example.org/token') {
      if (init?.headers?.authorization !== `Basic ${Buffer.from('dms-client:geheim%20123').toString('base64')}`) return antwort(401, { error: 'invalid_client' });
      const q = new URLSearchParams(init.body);
      const c = codes.get(q.get('code')!);
      if (!c) return antwort(400, { error: 'invalid_grant' });
      if (createHash('sha256').update(q.get('code_verifier')!).digest('base64url') !== c.challenge) return antwort(400, { error: 'invalid_grant', error_description: 'PKCE' });
      if (q.get('redirect_uri') !== c.redirect) return antwort(400, { error: 'invalid_grant' });
      const s = Math.floor(opt.jetzt() / 1000);
      return antwort(200, { id_token: token({ iss: ISS, aud: 'dms-client', sub: 'abc', exp: s + 300, iat: s, nonce: c.nonce, email: 'anna@example.org', name: 'Anna A.', groups: ['dms-admins'], ...opt.claims }, opt.signiert ?? opt.schluessel[0]) });
    }
    return antwort(404, {});
  };
  /** Der Browser beim Anbieter: liefert den Code zur Anfrage. */
  const anmelden = (url: string) => {
    const u = new URL(url);
    const code = `code-${codes.size}`;
    codes.set(code, { challenge: u.searchParams.get('code_challenge')!, nonce: u.searchParams.get('nonce')!, redirect: u.searchParams.get('redirect_uri')! });
    return { code, state: u.searchParams.get('state')! };
  };
  return { abruf, anmelden, log };
}

async function oidcMit(a: ReturnType<typeof anbieter>, jetzt: () => number, extra: Record<string, unknown> = {}) {
  const o = new Oidc({ einstellungen: speicherEinstellungen(), verschluessele: (k) => `v:${k}`, entschluessele: (w) => (w.startsWith('v:') ? w.slice(2) : null), abruf: a.abruf, jetzt });
  await o.speichere({ aktiv: true, aussteller: `${ISS}/`, clientId: 'dms-client', clientSecret: 'geheim 123', ...extra }, 'test');
  return o;
}

describe('Anmeldung über OpenID Connect (#241)', () => {
  it('Aussteller: https, http nur im eigenen Netz', () => {
    assert.equal(pruefeAussteller('https://login.example.org/x/v2.0/'), 'https://login.example.org/x/v2.0');
    assert.equal(pruefeAussteller('http://keycloak.lan:8080/realms/dms'), 'http://keycloak.lan:8080/realms/dms');
    assert.equal(pruefeAussteller('http://192.168.1.5/application/o/dms'), 'http://192.168.1.5/application/o/dms');
    assert.throws(() => pruefeAussteller('http://login.example.org'), status(422));
    assert.throws(() => pruefeAussteller('kein url'), status(422));
    assert.throws(() => pruefeAussteller('https://x.example.org/?a=1'), status(422));
  });

  it('kompletter Ablauf mit PKCE, state, nonce und Bindung an den Browser', async () => {
    let t = 1_800_000_000_000;
    const k = schluesselpaar('rsa', 'k1');
    const a = anbieter({ schluessel: [k], jetzt: () => t });
    const o = await oidcMit(a, () => t);
    const ansicht = await o.ansicht();
    assert.equal(ansicht.secretGesetzt, true);
    assert.ok(!('clientSecret' in ansicht));
    const s = await o.start('https://dms.example.org/api/konto/anbieter/rueckkehr');
    const u = new URL(s.url);
    assert.equal(u.origin + u.pathname, 'https://login.example.org/authorize');
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(u.searchParams.get('scope'), 'openid email profile');
    const r = a.anmelden(s.url);
    // Anderer Browser (ohne passende Bindung): abgelehnt, und der state ist verbraucht.
    await assert.rejects(o.rueckkehr(r, 'fremd'), status(400));
    await assert.rejects(o.rueckkehr(r, s.bindung), status(400));
    const s2 = await o.start('https://dms.example.org/api/konto/anbieter/rueckkehr');
    const id = await o.rueckkehr(a.anmelden(s2.url), s2.bindung);
    assert.deepEqual(id, { sub: 'abc', email: 'anna@example.org', name: 'Anna A.', gruppen: ['dms-admins'] });
    // Fehler vom Anbieter
    const s3 = await o.start('https://dms.example.org/r');
    await assert.rejects(o.rueckkehr({ state: new URL(s3.url).searchParams.get('state')!, error: 'access_denied', error_description: 'nein' }, s3.bindung), /abgelehnt: nein/);
    // Abgelaufen
    const s4 = await o.start('https://dms.example.org/r');
    t += 11 * 60_000;
    await assert.rejects(o.rueckkehr(a.anmelden(s4.url), s4.bindung), /abgelaufen/);
    assert.equal(await o.abmeldeUrl('https://dms.example.org/'), 'https://login.example.org/logout?client_id=dms-client&post_logout_redirect_uri=https%3A%2F%2Fdms.example.org%2F');
  });

  it('holt neue Schlüssel, wenn der Anbieter gewechselt hat; EC und Ed25519', async () => {
    const t = 1_800_000_000_000;
    const alt = schluesselpaar('rsa', 'alt'), neu = schluesselpaar('ec', 'neu');
    const keys = [alt];
    const a = anbieter({ schluessel: keys, signiert: neu, jetzt: () => t });
    const o = await oidcMit(a, () => t);
    const s0 = await o.start('https://d/r');
    await assert.rejects(o.rueckkehr(a.anmelden(s0.url), s0.bindung), /kein Schlüssel/);
    keys.push(neu);
    const t2 = t + 2 * 60_000;
    const o2 = await oidcMit(a, () => t2);
    const s = await o2.start('https://d/r');
    assert.equal((await o2.rueckkehr(a.anmelden(s.url), s.bindung)).email, 'anna@example.org');
    const ed = schluesselpaar('ed', 'ed');
    const claims = { iss: ISS, aud: 'x', sub: 's', exp: t / 1000 + 60, nonce: 'n' };
    assert.equal(pruefeIdToken(token(claims, ed), [ed.jwk], { aussteller: ISS, clientId: 'x', nonce: 'n', jetzt: t }).sub, 's');
  });

  it('lehnt falsche Tokens ab', () => {
    const t = 1_800_000_000_000, s = t / 1000;
    const k = schluesselpaar('rsa', 'k1'), fremd = schluesselpaar('rsa', 'k1');
    const p = { aussteller: ISS, clientId: 'dms', nonce: 'n1', jetzt: t };
    const gut = { iss: ISS, aud: 'dms', sub: 'u', exp: s + 60, iat: s, nonce: 'n1' };
    assert.equal(pruefeIdToken(token(gut, k), [k.jwk], p).sub, 'u');
    assert.equal(pruefeIdToken(token({ ...gut, aud: ['dms', 'andere'], azp: 'dms' }, k), [k.jwk], p).sub, 'u');
    const falsch = (claims: Record<string, unknown>, re: RegExp, schl = k, kopf = {}) => assert.throws(() => pruefeIdToken(token({ ...gut, ...claims }, schl, kopf), [k.jwk], p), re);
    falsch({}, /Signatur/, fremd);
    falsch({ iss: 'https://boese.example.org' }, /Aussteller/);
    falsch({ aud: 'andere' }, /andere Anwendung/);
    falsch({ aud: ['dms', 'andere'], azp: 'andere' }, /andere Anwendung/);
    falsch({ exp: s - 120 }, /abgelaufen/);
    falsch({ iat: s + 3600 }, /Zukunft/);
    falsch({ nonce: 'n2' }, /gehört nicht/);
    falsch({ sub: '' }, /keinen Benutzer/);
    falsch({}, /nicht erlaubtem Verfahren/, k, { alg: 'none' });
    falsch({}, /nicht erlaubtem Verfahren/, k, { alg: 'HS256' });
    // Signatur mit anderem Inhalt
    const [h, , sig] = token(gut, k).split('.');
    assert.throws(() => pruefeIdToken(`${h}.${b64({ ...gut, sub: 'admin' })}.${sig}`, [k.jwk], p), /Signatur/);
  });

  it('E-Mail aus email, preferred_username oder upn; unbestätigte Adresse abgelehnt', () => {
    assert.equal(identitaetAus({ sub: '1', preferred_username: 'Bob@Firma.de', given_name: 'Bob', family_name: 'B' }, 'groups').email, 'bob@firma.de');
    assert.equal(identitaetAus({ sub: '1', preferred_username: 'Bob@Firma.de', given_name: 'Bob', family_name: 'B' }, 'groups').name, 'Bob B');
    assert.deepEqual(identitaetAus({ sub: '1', email: 'a@b.de', rollen: 'x' }, 'rollen').gruppen, ['x']);
    assert.throws(() => identitaetAus({ sub: '1', email: 'a@b.de', email_verified: false }, 'groups'), status(403));
    assert.throws(() => identitaetAus({ sub: '1', preferred_username: 'bob' }, 'groups'), /E-Mail-Adresse/);
  });

  it('Zuordnung zu Benutzern: vorhandene, anlegen, Admin-Gruppe, letzter Admin, deaktiviert, Passwort nur für Admins', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    const { benutzer: chef } = await konten.einrichten({ email: 'chef@example.org', name: 'Chef', passwort: 'ein-langes-passwort' });
    const basis = { aktiv: true, aussteller: ISS, clientId: 'c', clientSecret: '', knopf: 'Mit Firmenkonto', anlegen: false, standardrolle: 'mitglied' as const, adminGruppe: '', gruppenClaim: 'groups', lokalNurAdmins: false, abmeldenBeimAnbieter: false };
    const g = { ip: '1.1.1.1', geraet: '' };
    // Vorhandener Benutzer
    const r = await konten.anmeldenMitAnbieter({ sub: 'x', email: 'chef@example.org', name: '', gruppen: [] }, basis, g);
    assert.equal((r as { benutzer: { id: string } }).benutzer.id, chef.id);
    // Unbekannt, ohne Anlegen
    await assert.rejects(konten.anmeldenMitAnbieter({ sub: 'y', email: 'neu@example.org', name: 'Neu', gruppen: [] }, basis, g), status(403));
    // Anlegen mit Standardrolle bzw. Admin-Gruppe
    const neu = await konten.anmeldenMitAnbieter({ sub: 'y', email: 'neu@example.org', name: 'Neu', gruppen: [] }, { ...basis, anlegen: true }, g);
    assert.equal((neu as { benutzer: { rolle: string; name: string } }).benutzer.rolle, 'mitglied');
    assert.equal((neu as { benutzer: { name: string } }).benutzer.name, 'Neu');
    const mitGruppe = { ...basis, anlegen: true, adminGruppe: 'dms-admins' };
    const it2 = await konten.anmeldenMitAnbieter({ sub: 'z', email: 'it@example.org', name: 'IT', gruppen: ['dms-admins'] }, mitGruppe, g);
    assert.equal((it2 as { benutzer: { rolle: string } }).benutzer.rolle, 'admin');
    // Rolle folgt der Gruppe
    const neu2 = await konten.anmeldenMitAnbieter({ sub: 'y', email: 'neu@example.org', name: 'Neu', gruppen: ['dms-admins'] }, mitGruppe, g);
    assert.equal((neu2 as { benutzer: { rolle: string } }).benutzer.rolle, 'admin');
    const it3 = await konten.anmeldenMitAnbieter({ sub: 'z', email: 'it@example.org', name: 'IT', gruppen: [] }, mitGruppe, g);
    assert.equal((it3 as { benutzer: { rolle: string } }).benutzer.rolle, 'mitglied');
    // Letzter aktiver Administrator bleibt Administrator
    for (const e of ['neu@example.org']) await konten.anmeldenMitAnbieter({ sub: 'y', email: e, name: '', gruppen: [] }, mitGruppe, g);
    const chef2 = await konten.anmeldenMitAnbieter({ sub: 'x', email: 'chef@example.org', name: '', gruppen: [] }, mitGruppe, g);
    assert.equal((chef2 as { benutzer: { rolle: string } }).benutzer.rolle, 'admin');
    // Passwort nur für Administratoren
    konten.verbindeAnbieter(async () => ({ ...basis, lokalNurAdmins: true }));
    await konten.anmelden({ email: 'chef@example.org', passwort: 'ein-langes-passwort' }, '1.1.1.1');
    const link = await konten.neuerLink((await konten.listeBenutzer()).find((b) => b.email === 'neu@example.org')!.id);
    await assert.rejects(konten.passwortSetzen({ schluessel: link.link!.split('/passwort/')[1], passwort: 'ein-langes-passwort' }), /Mit Firmenkonto/);
  });
});
