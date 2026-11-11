/**
 * Sicherung herunterladen (#975): nur mit Bereich „Sicherung“ und frischer Anmeldung (heikle Handlung), die
 * verschlüsselte Datei unverändert als Strom, Weiterlesen nach Abbruch (Range), Metadaten daneben, Protokoll ohne
 * Geheimnisse und keine neue Datei im Sicherungsordner. Über HTTP (Fastify inject) wie im Betrieb.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { after, describe, it } from 'node:test';
import type { Datenquelle } from '../src/datenbankabzug';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { abruf, liesBereich } from '../src/http/teilabruf';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Sicherung } from '../src/sicherung';
import { Tresor } from '../src/tresor';
import { heikleHandlung } from '../src/verwaltungsbereiche';
import { imModus } from './hilfen';

const PW = 'ein-langes-passwort';
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const MIN = 60_000;
const ordner: string[] = [];
const offen: Array<() => Promise<unknown>> = [];
after(async () => { for (const f of offen) await f(); for (const o of ordner) await rm(o, { recursive: true, force: true }); });
const marke = () => Math.max(0, ...protokoll.eintraege({}).map((e) => e.nr));

function daten(): Datenquelle {
  return {
    async imSchnappschuss(f) {
      return f({
        postgres: '17.0', migrationen: ['001_a.sql'], tabellen: [{ name: 'mappen', spalten: ['id'] }],
        zaehler: { mappen: 1, dokumente: 0, benutzer: 1 },
        inhalt: async () => (async function* () { yield Buffer.from('1\n'); })(),
      });
    },
    async groesse() { return 10; },
  };
}

async function aufbau() {
  const wurzel = await mkdtemp(join(tmpdir(), 'dms-laden-'));
  ordner.push(wurzel);
  const einstellungen = speicherEinstellungen();
  const tresor = new Tresor(einstellungen, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
  await tresor.laden();
  await tresor.erzeuge();
  await mkdir(join(wurzel, 'files', HAUSHALT, 'ab'), { recursive: true });
  // Zufall lässt sich nicht packen: Die Sicherung wird größer als ein Stück des Stroms (64 KB).
  await writeFile(join(wurzel, 'files', HAUSHALT, 'ab', 'gross'), randomBytes(300_000));
  const s = new Sicherung(join(wurzel, 'sicherung'), join(wurzel, 'files'), HAUSHALT, {
    tresor, einstellungen, daten: daten(), mountinfo: '/gibt-es-nicht',
    umgebung: async () => ({ dms: '0.250.0', node: '24', system: 'Linux', architektur: 'x64' }),
  });
  const meta = (await (await s.starte('manuell', 'lena@example.org')).fertig)!;
  const name = meta.datei.replace(/\.dms-sicherung$/, '');
  const inhalt = await readFile(join(s.ordner, meta.datei));

  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  const mitRecht = async (email: string, name: string, recht: string[]) => {
    const r = await konten.legeBenutzerAn({ email, name }, lena.id);
    await konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PW });
    await konten.setzeVerwaltung(imModus(lena), r.benutzer.id, recht);
    return r.benutzer;
  };
  await mitRecht('jonas@example.org', 'Jonas', ['benutzer']);
  await mitRecht('markus@example.org', 'Markus', ['sicherung']);
  const { baueApp } = await import('../src/http');
  const app = await baueApp(d, konten, { sicherung: s, tresor });
  offen.push(() => app.close());
  const jetzt = { t: Date.now() };
  konten.uhr = () => jetzt.t;
  const anmelden = async (email: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email, passwort: PW }, headers: { 'x-dms': '1' } });
    assert.equal(r.statusCode, 200, r.body);
    const c = ([] as string[]).concat(r.headers['set-cookie'] as string | string[])[0].split(';')[0];
    assert.equal((await app.inject({ method: 'POST', url: '/api/konto/verwaltung', payload: {}, headers: { 'x-dms': '1', cookie: c } })).statusCode, 200);
    return c;
  };
  const rufe = (cookie: string, method: 'GET' | 'POST', url: string, kopf: Record<string, string> = {}, payload?: object) =>
    app.inject({ method, url, ...(payload ? { payload } : {}), headers: { 'x-dms': '1', cookie, ...kopf } });
  const url = `/api/werkbank/sicherung/${name}/datei`;
  return { s, d, konten, tresor, meta, name, inhalt, anmelden, rufe, url, jetzt, lena };
}

describe('Sicherung herunterladen (#975)', () => {
  it('ist eine heikle Handlung; die Metadaten daneben nicht', () => {
    assert.equal(heikleHandlung('GET', '/api/werkbank/sicherung/:name/datei', null), 'sicherung');
    assert.equal(heikleHandlung('GET', '/api/werkbank/sicherung/:name/metadaten', null), null);
    assert.equal(heikleHandlung('GET', '/api/werkbank/sicherung', null), null, 'die Liste bleibt ohne frische Anmeldung');
  });

  it('ohne Recht auf „Sicherung“ 403, ohne frische Anmeldung 403 mit frisch; danach die Datei unverändert', async () => {
    const x = await aufbau();
    // Jonas verwaltet nur Benutzer.
    const j = await x.anmelden('jonas@example.org');
    const ohneRecht = await x.rufe(j, 'GET', x.url);
    assert.equal(ohneRecht.statusCode, 403, ohneRecht.body);
    assert.equal(ohneRecht.json().details.bereich, 'sicherung');
    assert.equal((await x.rufe(j, 'GET', `/api/werkbank/sicherung/${x.name}/metadaten`)).statusCode, 403);

    // Markus hat „Sicherung“; 11 Minuten nach der Anmeldung, aber aktiv: Modus läuft, die Anmeldung ist nicht frisch.
    const m = await x.anmelden('markus@example.org');
    x.jetzt.t += 6 * MIN; await x.rufe(m, 'GET', '/api/werkbank/sicherung', { 'x-dms-aktiv': '1' });
    x.jetzt.t += 5 * MIN;
    const nichtFrisch = await x.rufe(m, 'GET', x.url);
    assert.equal(nichtFrisch.statusCode, 403, nichtFrisch.body);
    assert.deepEqual([nichtFrisch.json().details.frisch, nichtFrisch.json().details.handlung], [true, 'sicherung']);
    // Die Metadaten gehen auch ohne frische Anmeldung (kein Schlüssel darin).
    const meta = await x.rufe(m, 'GET', `/api/werkbank/sicherung/${x.name}/metadaten`);
    assert.equal(meta.statusCode, 200, meta.body);
    assert.deepEqual(meta.rawPayload, await readFile(join(x.s.ordner, `${x.name}.json`)));
    assert.match(String(meta.headers['content-disposition']), new RegExp(`filename="${x.name}\\.json"`));

    assert.equal((await x.rufe(m, 'POST', '/api/konto/verwaltung/bestaetigen', {}, { passwort: PW })).statusCode, 200);
    const vorher = (await readdir(x.s.ordner)).sort();
    const seit = marke();
    const r = await x.rufe(m, 'GET', x.url);
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(r.rawPayload.equals(x.inhalt), 'Inhalt gleich der Datei im Sicherungsordner (verschlüsselt, unverändert)');
    assert.equal(createHash('sha256').update(r.rawPayload).digest('hex'), x.meta.sha256);
    assert.equal(r.headers['content-type'], 'application/octet-stream');
    assert.equal(Number(r.headers['content-length']), x.inhalt.length);
    assert.match(String(r.headers['content-disposition']), new RegExp(`^attachment; filename="${x.name}\\.dms-sicherung"`));
    assert.match(x.name, /^\d{4}-\d{2}-\d{2}_\d{4}-manuell$/, 'Dateiname mit Datum');
    assert.equal(r.headers['accept-ranges'], 'bytes');
    assert.equal(r.headers.etag, `"${x.meta.sha256}"`);
    assert.equal(r.headers['cache-control'], 'no-store');
    // Keine Datei neu angelegt (weder im Sicherungs- noch in einem Export-Ordner daneben).
    assert.deepEqual((await readdir(x.s.ordner)).sort(), vorher);
    // Protokoll: wer, welche Sicherung – ohne Schlüssel.
    const e = protokoll.eintraege({ seit }).filter((y) => y.modul === 'sicherung' && y.text === 'Sicherung heruntergeladen');
    assert.equal(e.length, 1);
    assert.deepEqual([e[0].daten?.name, e[0].daten?.von, e[0].daten?.bytes], [x.name, 'markus@example.org', x.inhalt.length]);
    const text = JSON.stringify(protokoll.eintraege({ seit }));
    assert.ok(!text.includes(x.tresor.alsText()!), 'kein Schlüssel im Protokoll');
    // Ein unbekannter oder unzulässiger Name: 404 bzw. 422 – nie eine Datei außerhalb des Ordners.
    assert.equal((await x.rufe(m, 'GET', '/api/werkbank/sicherung/gibt-es-nicht/datei')).statusCode, 404);
    assert.equal((await x.rufe(m, 'GET', '/api/werkbank/sicherung/..%2Fgeheim%2Fdms/datei')).statusCode, 422);
  });

  it('Weiterlesen nach Abbruch (Range): Teil, Ende, hinter dem Ende, If-Range', async () => {
    const x = await aufbau();
    const c = await x.anmelden('lena@example.org');
    const n = x.inhalt.length;
    const teil = await x.rufe(c, 'GET', x.url, { range: 'bytes=100-1099' });
    assert.equal(teil.statusCode, 206, teil.body);
    assert.equal(teil.headers['content-range'], `bytes 100-1099/${n}`);
    assert.equal(Number(teil.headers['content-length']), 1000);
    assert.ok(teil.rawPayload.equals(x.inhalt.subarray(100, 1100)));
    const rest = await x.rufe(c, 'GET', x.url, { range: `bytes=${n - 10}-`, 'if-range': `"${x.meta.sha256}"` });
    assert.equal(rest.statusCode, 206);
    assert.ok(rest.rawPayload.equals(x.inhalt.subarray(n - 10)));
    const ende = await x.rufe(c, 'GET', x.url, { range: 'bytes=-7' });
    assert.ok(ende.rawPayload.equals(x.inhalt.subarray(n - 7)));
    const dahinter = await x.rufe(c, 'GET', x.url, { range: `bytes=${n}-` });
    assert.equal(dahinter.statusCode, 416);
    assert.equal(dahinter.headers['content-range'], `bytes */${n}`);
    // Die Datei hat sich geändert (anderer ETag): die ganze Datei statt des Teils.
    const anders = await x.rufe(c, 'GET', x.url, { range: 'bytes=0-9', 'if-range': '"anders"' });
    assert.equal(anders.statusCode, 200);
    assert.ok(anders.rawPayload.equals(x.inhalt));
    // Mehrere Bereiche: die ganze Datei (erlaubt nach RFC 9110).
    assert.equal((await x.rufe(c, 'GET', x.url, { range: 'bytes=0-1,5-6' })).statusCode, 200);
  });

  it('liefert einen Strom, nie die ganze Datei im Speicher; Protokoll beim Weiterlesen mit Stelle', async () => {
    const x = await aufbau();
    const route = routen(x.d, x.konten, { sicherung: x.s, tresor: x.tresor }).find((r) => r.methode === 'GET' && r.pfad === '/api/werkbank/sicherung/:name/datei')!;
    assert.equal(route.zugang, 'admin');
    assert.equal(route.ohneHead, true);
    const kopf: Record<string, string> = { range: 'bytes=10-' };
    const seit = marke();
    const a = await route.handler({ params: { name: x.name }, query: {}, body: {}, ip: '1', benutzer: imModus(x.lena), verwaltungsmodus: true, kopf: (k: string) => kopf[k] } as unknown as Anfrage);
    assert.ok(a.datei && a.datei.inhalt instanceof Readable, 'Strom statt Puffer');
    const t: Buffer[] = [];
    for await (const b of a.datei.inhalt as Readable) t.push(b as Buffer);
    assert.ok(t.length > 1, 'in mehreren Stücken gelesen');
    assert.ok(Buffer.concat(t).equals(x.inhalt.subarray(10)));
    const e = protokoll.eintraege({ seit }).find((y) => y.text === 'Sicherung heruntergeladen (Teil)')!;
    assert.deepEqual([e.daten?.name, e.daten?.von, e.daten?.ab], [x.name, 'lena@example.org', 10]);
  });

  it('liesBereich und abruf: Grenzfälle', async () => {
    assert.equal(liesBereich(undefined, 10), null);
    assert.deepEqual(liesBereich('bytes=0-', 10), { start: 0, ende: 9 });
    assert.deepEqual(liesBereich('bytes=5-100', 10), { start: 5, ende: 9 });
    assert.deepEqual(liesBereich('bytes=-100', 10), { start: 0, ende: 9 });
    assert.equal(liesBereich('bytes=-0', 10), 'unerfuellbar');
    assert.equal(liesBereich('bytes=10-', 10), 'unerfuellbar');
    assert.equal(liesBereich('bytes=5-2', 10), null, 'ungültig: ganze Datei');
    assert.equal(liesBereich('items=0-1', 10), null);
    assert.equal(liesBereich('bytes=0-1', 0), null, 'leere Datei: immer ganz');
    // Eine leere Datei öffnet abruf gar nicht erst.
    const leer = await abruf({ dateiname: 'leer.bin', groesse: 0, oeffne: () => { throw new Error('nicht öffnen'); } }, () => undefined);
    assert.equal(leer.antwort.datei?.groesse, 0);
  });
});
