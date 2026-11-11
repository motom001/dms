/**
 * Sprache wählen, Englisch in der Oberfläche (#729): Rückfall en → de, Sprache je Anfrage und Person,
 * Einstellung „sprachen“ (Werkbank → Sprachen), Mails in der Sprache der Person, Formate je Sprache.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { erlaubteSprachen, setzeErlaubteSprachen } from '../../shared/src/beschriftung';
import { formatiere, systemfelder, type Feld } from '../../shared/src/model';
import { inSprache, setzeSprache, sprache, uebersetzer } from '../../shared/src/sprache';
import { liesSpracheinstellung, spracheAusKopf, wirksameSprache } from '../../shared/src/sprachwahl';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Mailer } from '../src/mail';
import { speicherRepo } from '../src/repo-speicher';
import { mitSprache, mitSpracheVon, t, tDe } from '../src/sprache';
import { SprachDienst } from '../src/sprachwahl';

const PW = 'ein-langes-passwort';

after(() => { setzeSprache('de'); setzeErlaubteSprachen(['de', 'en']); });

describe('Rückfall und Sprache je Anfrage (#729)', () => {
  it('fehlt ein Text, kommt erst Englisch, dann Deutsch – nie eine leere Stelle', () => {
    const tt = uebersetzer({ p: { a: 'A-de', b: 'B-de', c: 'C-de' } },
      { en: { p: { a: 'A-en', b: 'B-en' } }, fr: { p: { a: 'A-fr', b: '' } } });
    inSprache('fr', () => {
      assert.equal(tt('p.a'), 'A-fr');
      assert.equal(tt('p.b'), 'B-en', 'leerer Text zählt als fehlend');
      assert.equal(tt('p.c'), 'C-de');
    });
    inSprache('en', () => assert.equal(tt('p.c'), 'C-de'));
  });

  it('mitSprache gilt auch über await; Protokollzeilen bleiben deutsch', async () => {
    const r = await mitSprache('en', async () => {
      await new Promise((f) => setTimeout(f, 1));
      return { s: sprache(), m: t('meldungen.sprachen.unbekannt'), log: tDe('meldungen.sprachen.unbekannt') };
    });
    assert.equal(r.s, 'en');
    assert.equal(r.m, 'This language doesn’t exist in Ablago.');
    assert.match(r.log, /^Diese Sprache/);
    assert.equal(sprache(), 'de');
  });

  it('mitSpracheVon nimmt die Wahl der Person nur, wenn sie erlaubt ist', () => {
    setzeErlaubteSprachen(['de']);
    assert.equal(mitSpracheVon({ sprache: 'en' }, () => sprache()), 'de');
    setzeErlaubteSprachen(['de', 'en']);
    assert.equal(mitSpracheVon({ sprache: 'en' }, () => sprache()), 'en');
    assert.equal(mitSpracheVon({ sprache: null }, () => sprache()), 'de');
  });

  it('Kopf X-Sprache: erste erlaubte, auch aus „en-GB“', () => {
    assert.equal(spracheAusKopf('en-GB,de;q=0.8', ['de', 'en']), 'en');
    assert.equal(spracheAusKopf('fr-FR, en', ['de', 'en']), 'en');
    assert.equal(spracheAusKopf('fr', ['de', 'en']), undefined);
    assert.equal(spracheAusKopf(undefined, ['de']), undefined);
    const e = liesSpracheinstellung({ standard: 'de', erlaubt: ['de'] });
    assert.equal(wirksameSprache('en', e), 'de', 'nicht mehr erlaubt → Sprache der Installation');
  });
});

describe('Formate und Systemfelder je Sprache (#729)', () => {
  const datum: Feld = { key: 'd', label: 'D', typ: 'datum' } as Feld;
  const zahl: Feld = { key: 'z', label: 'Z', typ: 'zahl' } as Feld;
  const janein: Feld = { key: 'j', label: 'J', typ: 'janein' } as Feld;

  it('Datum, Zahl und ja/nein nach der Sprache', () => {
    assert.equal(formatiere(datum, '2026-03-04'), '04.03.2026');
    assert.equal(formatiere(zahl, 1234.5), '1.234,5');
    assert.equal(formatiere(janein, true), 'Ja');
    inSprache('en', () => {
      assert.equal(formatiere(datum, '2026-03-04'), '04/03/2026');
      assert.equal(formatiere(zahl, 1234.5), '1,234.5');
      assert.equal(formatiere(janein, true), 'Yes');
    });
  });

  it('Systemfelder tragen englische Beschriftungen, auch für die Werte der Post', () => {
    const post = systemfelder('post', 'r', 'b');
    const betreff = post.find((f) => f.key === 'betreff')!;
    assert.equal(betreff.label, 'Betreff');
    assert.equal(betreff.beschriftungen?.en?.label, 'Subject');
    const stand = post.find((f) => f.key === 'stand')!;
    assert.equal((stand.beschriftungen?.en?.optionen as Record<string, string> | undefined)?.Neu, 'New');
  });
});

describe('Einstellung „sprachen“ und Sprache der Person (#729)', () => {
  async function aufbau() {
    const mails: Array<{ an: string; betreff: string; text: string }> = [];
    const mailer: Mailer = { async sende(an, betreff, text) { mails.push({ an, betreff: String(betreff), text: String(text) }); } };
    const einst = speicherEinstellungen();
    const sprachen = new SprachDienst(einst);
    await sprachen.lade();
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: einst });
    const konten = new Konten(speicherKontoRepo(), mailer, 'http://nas', d.systemtypen.benutzerspiegel());
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
    const r = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id);
    const link = r.link ?? /\/passwort\/(\S+)/.exec(mails.at(-1)!.text)![0];
    await konten.passwortSetzen({ schluessel: link.split('/passwort/')[1], passwort: PW });
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    const { baueApp } = await import('../src/http');
    const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
    const app = await baueApp(d, konten, { apiSchluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()), sprachen });
    const anmelden = async (email: string) => {
      const a = await app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email, passwort: PW }, headers: { 'x-dms': '1' } });
      assert.equal(a.statusCode, 200, a.body);
      return ([] as string[]).concat(a.headers['set-cookie'] as string | string[])[0].split(';')[0];
    };
    const rufe = (cookie: string, method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown, kopf: Record<string, string> = {}) =>
      app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }), headers: { 'x-dms': '1', cookie, ...kopf } });
    return { app, konten, sprachen, mails, lena, jonas: r.benutzer, anmelden, rufe };
  }

  it('Werkbank → Sprachen: nur Administratoren, nur bekannte Sprachen, Standard muss erlaubt sein', async () => {
    const x = await aufbau();
    try {
      const lena = await x.anmelden('lena@example.org');
      const jonas = await x.anmelden('jonas@example.org');
      assert.equal((await x.rufe(jonas, 'GET', '/api/werkbank/sprachen')).statusCode, 403);
      assert.equal((await x.rufe(lena, 'POST', '/api/konto/verwaltung', {})).statusCode, 200, 'in den Verwaltungsmodus');
      const g = await x.rufe(lena, 'GET', '/api/werkbank/sprachen');
      assert.equal(g.statusCode, 200, g.body);
      assert.deepEqual(g.json().einstellung, { standard: 'de', erlaubt: ['de', 'en'] });
      assert.equal((await x.rufe(lena, 'PUT', '/api/werkbank/sprachen', { erlaubt: ['de', 'xx'] })).statusCode, 422);
      assert.equal((await x.rufe(lena, 'PUT', '/api/werkbank/sprachen', { standard: 'en', erlaubt: ['de'] })).statusCode, 422);
      const p = await x.rufe(lena, 'PUT', '/api/werkbank/sprachen', { erlaubt: ['de'] });
      assert.equal(p.statusCode, 200, p.body);
      assert.deepEqual(erlaubteSprachen(), ['de']);
      // Englisch nicht mehr erlaubt: die Person darf es nicht wählen.
      assert.equal((await x.rufe(jonas, 'PUT', '/api/konto/profil', { sprache: 'en' })).statusCode, 422);
      await x.rufe(lena, 'PUT', '/api/werkbank/sprachen', { standard: 'de', erlaubt: ['de', 'en'] });
    } finally { await x.app.close(); x.sprachen.stoppe(); }
  });

  it('die Person wählt ihre Sprache; Meldungen und Mails kommen dann in ihr', async () => {
    const x = await aufbau();
    try {
      const jonas = await x.anmelden('jonas@example.org');
      const p = await x.rufe(jonas, 'PUT', '/api/konto/profil', { sprache: 'en' });
      assert.equal(p.statusCode, 200, p.body);
      const s = await x.rufe(jonas, 'GET', '/api/sprache');
      assert.equal(s.json().sprache, 'en');
      // Meldung des Servers auf Englisch, ohne Kopf
      const f = await x.rufe(jonas, 'PUT', '/api/konto/profil', { sprache: 'xx' });
      assert.equal(f.statusCode, 422);
      assert.match(f.body, /This language isn’t allowed/);
      // Vor der Anmeldung zählt der Kopf, sonst die Installation.
      assert.equal((await x.app.inject({ method: 'GET', url: '/api/sprache', headers: { 'x-sprache': 'en-GB' } })).json().sprache, 'en');
      assert.equal((await x.app.inject({ method: 'GET', url: '/api/sprache' })).json().sprache, 'de');
      // Mail an Jonas auf Englisch, an Lena auf Deutsch
      await x.konten.neuerLink(x.jonas.id);
      await x.konten.neuerLink(x.lena.id);
      assert.deepEqual(x.mails.slice(-2).map((m) => m.betreff), ['Reset your Ablago password', 'Passwort für Ablago zurücksetzen']);
      // Zurück auf „wie die Ablage“
      assert.equal((await x.rufe(jonas, 'PUT', '/api/konto/profil', { sprache: null })).statusCode, 200);
      assert.equal((await x.rufe(jonas, 'GET', '/api/sprache')).json().sprache, 'de');
    } finally { await x.app.close(); x.sprachen.stoppe(); }
  });
});
