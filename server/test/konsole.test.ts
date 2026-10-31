/** Befehl dms im Container (#244): Zugang über Schlüssel und Loopback, Befehle, Fehlermeldungen. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Dienst } from '../src/dienst';
import { speicherDateien } from '../src/dateispeicher';
import { fuehreAus, type Holen, KonsolenFehler, verbinde, zerlege, type Aus, type Ein, type Verbindung } from '../src/dms';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { istLoopback, konsolenBenutzer, Konsolenzugang, lokaleUrl } from '../src/konsole';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, type Anfrage, type Route } from '../src/routen';
import type { Benutzer } from '../../shared/src/model';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const benutzer = (x: Partial<Benutzer>): Benutzer => ({ id: x.email!, email: '', name: '', rolle: 'mitglied', aktiv: true, hatPasswort: true, erstellt: '2026-01-01', letzteAnmeldung: null, ...x });

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  return { konten, anna };
}

describe('Befehl dms im Container (#244)', () => {
  it('zerlegt Argumente', () => {
    assert.deepEqual(zerlege(['passwort', 'a@x.de', '--passwort', 'geheim', '--json']), { befehl: ['passwort', 'a@x.de'], opt: { json: true, ja: false, werte: { passwort: 'geheim' } } });
    assert.deepEqual(zerlege(['--als=b@x.de', 'benutzer', 'anlegen', 'c@x.de', 'Carl', 'C.', '--admin', '--ja']).opt, { json: false, ja: true, als: 'b@x.de', werte: { admin: 'ja' } });
    assert.deepEqual(zerlege(['api', 'POST', '/api/x', '--', '--json']).befehl, ['api', 'POST', '/api/x', '--json']);
    assert.throws(() => zerlege(['passwort', 'x', '--passwort']), KonsolenFehler);
  });

  it('Loopback, Adresse, handelnder Administrator', () => {
    assert.ok(istLoopback('127.0.0.1') && istLoopback('::1') && istLoopback('::ffff:127.0.0.1'));
    assert.ok(!istLoopback('172.17.0.1') && !istLoopback(undefined) && !istLoopback('::ffff:10.0.0.1'));
    assert.equal(lokaleUrl(3000), 'http://127.0.0.1:3000');
    assert.equal(lokaleUrl(8080, '::'), 'http://127.0.0.1:8080');
    assert.equal(lokaleUrl(8080, '10.0.0.5'), 'http://10.0.0.5:8080');
    const liste = [
      benutzer({ email: 'neu@x.de', rolle: 'admin', erstellt: '2026-05-01' }),
      benutzer({ email: 'alt@x.de', rolle: 'admin', erstellt: '2026-02-01' }),
      benutzer({ email: 'aus@x.de', rolle: 'admin', erstellt: '2026-01-01', aktiv: false }),
      benutzer({ email: 'm@x.de' }),
    ];
    assert.equal(konsolenBenutzer(liste, undefined).email, 'alt@x.de');
    assert.equal(konsolenBenutzer(liste, 'NEU@x.de').email, 'neu@x.de');
    assert.throws(() => konsolenBenutzer(liste, 'm@x.de'), status(404));
    assert.throws(() => konsolenBenutzer(liste, 'aus@x.de'), status(404));
    assert.throws(() => konsolenBenutzer([], undefined), status(409));
  });

  it('Schlüsseldatei nur für den Eigentümer; Schlüssel passt nur genau', async () => {
    const datei = join(await mkdtemp(join(tmpdir(), 'dms-k-')), 'konsole.json');
    const k = new Konsolenzugang(datei);
    await k.schreibe('http://127.0.0.1:3000');
    const z = JSON.parse(await readFile(datei, 'utf8'));
    assert.equal(z.url, 'http://127.0.0.1:3000');
    if (process.platform !== 'win32') assert.equal((await stat(datei)).mode & 0o777, 0o600);
    assert.ok(k.passt(z.schluessel));
    assert.ok(!k.passt(`${z.schluessel}x`) && !k.passt('') && !k.passt(undefined));
    await k.schreibe('http://127.0.0.1:3000'); // Neustart: überschreibt
    await k.entferne();
    await assert.rejects(stat(datei));
  });

  it('pruefeZugang: Schlüssel und Loopback nötig; Konsolen-Routen nur über die Konsole', async () => {
    const { konten, anna } = await aufbau();
    const datei = join(await mkdtemp(join(tmpdir(), 'dms-k-')), 'konsole.json');
    const k = new Konsolenzugang(datei);
    await k.schreibe('x');
    const schluessel = JSON.parse(await readFile(datei, 'utf8')).schluessel as string;
    const admin: Route = { methode: 'POST', pfad: '/api/benutzer', zugang: 'admin', handler: async () => ({}) };
    const nurKonsole: Route = { methode: 'POST', pfad: '/api/konsole/passwort', zugang: 'offen', konsole: true, handler: async () => ({}) };
    const anfrage = (peer: string): Anfrage => ({ body: {}, params: {}, query: {}, ip: peer, peer });
    const koepfe = (h: Record<string, string>) => (n: string) => h[n];

    const a = anfrage('127.0.0.1');
    await pruefeZugang(admin, a, koepfe({ 'x-dms-konsole': schluessel }), konten, undefined, k);
    assert.equal(a.konsole, true);
    assert.equal(a.benutzer?.id, anna.id);
    await assert.rejects(pruefeZugang(admin, anfrage('172.17.0.1'), koepfe({ 'x-dms-konsole': schluessel }), konten, undefined, k), status(401));
    await assert.rejects(pruefeZugang(admin, anfrage('127.0.0.1'), koepfe({ 'x-dms-konsole': 'falsch' }), konten, undefined, k), status(401));
    await assert.rejects(pruefeZugang(admin, anfrage('127.0.0.1'), koepfe({ 'x-dms-konsole': schluessel }), konten, undefined, undefined), status(401));
    await assert.rejects(pruefeZugang(nurKonsole, anfrage('127.0.0.1'), koepfe({ 'x-dms': '1' }), konten, undefined, k), status(404));
    await assert.rejects(pruefeZugang(admin, anfrage('127.0.0.1'), koepfe({ 'x-dms-konsole': schluessel, 'x-dms-als': 'wer@x.de' }), konten, undefined, k), status(404));
  });

  it('Passwort direkt setzen beendet die Sitzungen', async () => {
    const { konten, anna } = await aufbau();
    const s = await konten.anmelden({ email: 'anna@example.org', passwort: 'ein-langes-passwort' }, '1.1.1.1');
    const sitzung = (s as { schluessel: string }).schluessel;
    assert.ok(await konten.anmeldungZu(sitzung));
    await assert.rejects(konten.setzePasswortDirekt('anna@example.org', 'kurz'), status(422));
    await assert.rejects(konten.setzePasswortDirekt('wer@example.org', 'ein-neues-langes-passwort'), status(404));
    const b = await konten.setzePasswortDirekt('Anna@Example.org', 'ein-neues-langes-passwort');
    assert.equal(b.id, anna.id);
    assert.equal(await konten.anmeldungZu(sitzung), undefined);
    await konten.anmelden({ email: 'anna@example.org', passwort: 'ein-neues-langes-passwort' }, '1.1.1.1');
  });

  it('Befehle rufen die passende Schnittstelle', async () => {
    const aufrufe: string[] = [];
    const v: Verbindung = {
      async anfrage<T>(m: string, p: string, body?: unknown) {
        aufrufe.push(`${m} ${p}${body !== undefined ? ` ${JSON.stringify(body)}` : ''}`);
        if (p === '/api/benutzer' && m === 'GET') return [{ id: 'u1', email: 'a@x.de', name: 'A', rolle: 'admin', aktiv: true, hatPasswort: true, letzteAnmeldung: null }] as T;
        if (p.endsWith('/sitzungen')) return { beendet: 2 } as T;
        if (p === '/api/benutzer') return { benutzer: { email: 'c@x.de', rolle: 'admin' }, mailVerschickt: false } as T;
        if (p === '/api/konsole/passwort') return { email: 'a@x.de', aktiv: true, zweifaktor: true } as T;
        if (p === '/api/werkbank/anmeldeschutz') return { gesperrt: [{ ip: '9.9.9.9', grund: 'zu viele', seit: '2026-10-31T10:00:00Z', bis: null }] } as T;
        return {} as T;
      },
    };
    const zeilen: string[] = [];
    const aus: Aus = { zeile: (t) => zeilen.push(t), json: (d) => zeilen.push(JSON.stringify(d)) };
    const fragen: string[] = [];
    const ein = (antworten: string[], interaktiv = true): Ein => ({ interaktiv, frage: async (f) => { fragen.push(f); return antworten.shift() ?? ''; } });
    const lauf = (args: string[], e: Ein = ein([])) => fuehreAus(zerlege(args), v, e, aus);

    await lauf(['passwort', 'a@x.de'], ein(['ein-neues-passwort', 'ein-neues-passwort']));
    assert.equal(aufrufe.pop(), 'POST /api/konsole/passwort {"email":"a@x.de","passwort":"ein-neues-passwort"}');
    assert.ok(zeilen.some((z) => z.includes('dms zweifaktor-zuruecksetzen a@x.de')));
    await assert.rejects(lauf(['passwort', 'a@x.de'], ein(['eins', 'zwei'])), /stimmen nicht/);
    await assert.rejects(lauf(['passwort', 'a@x.de'], ein([], false)), /--passwort/);

    await lauf(['abmelden', 'a@x.de']);
    assert.equal(aufrufe.pop(), 'DELETE /api/benutzer/u1/sitzungen');
    await assert.rejects(lauf(['abmelden', '--alle'], ein([], false)), /--ja/);
    await lauf(['abmelden', '--alle', '--ja']);
    assert.equal(aufrufe.pop(), 'DELETE /api/benutzer/u1/sitzungen');

    await lauf(['zweifaktor-zuruecksetzen', 'a@x.de'], ein(['j']));
    assert.equal(aufrufe.pop(), 'POST /api/benutzer/u1/zweifaktor/zuruecksetzen');
    await assert.rejects(lauf(['zweifaktor-zuruecksetzen', 'a@x.de'], ein(['n'])), /Abgebrochen/);
    await assert.rejects(lauf(['benutzer', 'deaktivieren', 'b@x.de']), /keinen Benutzer/);

    await lauf(['entsperren', '9.9.9.9']);
    assert.equal(aufrufe.pop(), 'POST /api/werkbank/anmeldeschutz/entsperren {"ip":"9.9.9.9"}');
    zeilen.length = 0;
    await lauf(['gesperrt']);
    assert.match(zeilen[1], /^9\.9\.9\.9 .*bis entsperrt/);
    await lauf(['wartung', 'aus']);
    assert.equal(aufrufe.pop(), 'POST /api/werkbank/wartung/aus');
    await lauf(['benutzer', 'anlegen', 'c@x.de', 'Carl', 'C.', '--admin']);
    assert.equal(aufrufe.pop(), 'POST /api/benutzer {"email":"c@x.de","name":"Carl C.","rolle":"admin"}');
    await lauf(['api', 'put', '/api/werkbank/zweifaktor', '{"admin":true}']);
    assert.equal(aufrufe.pop(), 'PUT /api/werkbank/zweifaktor {"admin":true}');
    await assert.rejects(lauf(['api', 'GET', 'werkbank']), /Aufruf/);
    await assert.rejects(lauf(['gibtsnicht']), (e) => e instanceof KonsolenFehler && e.code === 2);
  });

  it('klare Meldung, wenn das DMS nicht läuft oder im Einrichtungsmodus ist', async () => {
    const env = { DMS_KONSOLE_DATEI: join(tmpdir(), 'gibt-es-nicht-dms.json'), PORT: '3999' };
    await assert.rejects(verbinde(env, undefined, (async () => { throw new Error('ECONNREFUSED'); }) as Holen), /läuft nicht/);
    await assert.rejects(verbinde(env, undefined, (async () => new Response('{}', { status: 200 })) as Holen), /Einrichtungsmodus/);
  });
});
