/**
 * Charakterisierung von `baueApp` (#1278, Schritt 6b-1): Vor dem Zerlegen der langen Funktion hält dieser Test fest,
 * in welcher Reihenfolge Hooks und Parser hängen – an der Wurzel und an je einer Route jeder Art (JSON, Upload mit
 * `roh`, Körper als Bytes, Hochladen als Strom, WebDAV, Oberfläche) – und wie typische Anfragen beantwortet werden.
 *
 * Erwartung: `test/charakter/http-app.json`. Neu schreiben nur, wenn sich das Verhalten bewusst ändert:
 * `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/http-app-charakter.test.ts` – dann den Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { InjectOptions } from 'fastify';
import { baueApp } from '../src/http/http';
import { Ueberlastschutz } from '../src/http/ueberlast';
import { Dienst } from '../src/dienst/dienst';
import { speicherRepo } from '../src/repo/speicher';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/anmeldung/apischluessel';
import { Webdav } from '../src/webdav/webdav';

const DATEI = fileURLToPath(new URL('./charakter/http-app.json', import.meta.url));

/** Je Route der Kette: Art des Hooks → Namen der Funktionen in Reihenfolge (aus `printRoutes`). */
type Hooks = Record<string, string[]>;

/** `printRoutes` als Baum in volle Pfade zerlegen: „METHODE /pfad“ → Hooks. */
function routenMitHooks(baum: string): Map<string, Hooks> {
  const routen = new Map<string, Hooks>();
  const stapel: string[] = [];
  let aktuell: Hooks[] = [];
  for (const zeile of baum.split('\n')) {
    const m = /^([│ ]*(?:[├└]── )?)(.*)$/.exec(zeile)!;
    const inhalt = m[2];
    if (!inhalt) continue;
    const hook = /^• \((\w+)\) (.*)$/.exec(inhalt);
    if (hook) {
      for (const h of aktuell) h[hook[1]] = JSON.parse(hook[2]) as string[];
      continue;
    }
    const knoten = /^(.*) \(([A-Z, ]+)\)$/.exec(inhalt);
    if (!knoten) continue;
    const tiefe = m[1].length / 4 - 1;
    stapel.length = tiefe;
    stapel[tiefe] = knoten[1];
    const pfad = stapel.join('');
    aktuell = knoten[2].split(', ').map((methode) => {
      const h: Hooks = {};
      routen.set(`${methode} ${pfad}`, h);
      return h;
    });
  }
  return routen;
}

/** Je eine Route jeder Art. */
const BEISPIELE = [
  'GET /api/gesundheit',
  'HEAD /api/gesundheit',
  'POST /api/typen',
  'POST /api/fotostapel',
  'POST /api/aufruf/:kennung',
  'POST /api/mappen/:id/dokumente',
  // Unter /webdav/* (printRoutes zeigt den Platzhalter ohne Schrägstrich).
  'PROPFIND /webdav*',
  'OPTIONS /webdav',
  'GET /',
  'OPTIONS /',
  'GET /assets/a.js',
];

describe('baueApp: Hooks, Parser und Antworten (#1278, Schritt 6b-1)', () => {
  let web = '';
  let ist: Record<string, unknown> = {};
  before(async () => {
    web = mkdtempSync(join(tmpdir(), 'http-charakter-'));
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>x</title>');
    mkdirSync(join(web, 'assets'));
    writeFileSync(join(web, 'assets', 'a.js'), 'console.log(1)');
    const dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    const wd = new Webdav({ dienst, konten, schluessel, einstellungen: speicherEinstellungen(), adresse: () => 'https://dms.example.org' });
    const app = await baueApp(dienst, konten, { apiSchluessel: schluessel, webdav: wd, webDir: web, ueberlast: new Ueberlastschutz(50) });
    await app.ready();

    const symbole = Object.fromEntries(Object.getOwnPropertySymbols(app).map((s) => [s.description, (app as never)[s]]));
    const wurzel = symbole['fastify.hooks'] as Record<string, unknown[]>;
    const parser = symbole['fastify.contentTypeParser'] as { customParsers: Map<string, unknown> };
    const routen = routenMitHooks(app.printRoutes({ commonPrefix: false, includeHooks: true }));

    const antworten: Record<string, unknown> = {};
    const frage = async (name: string, o: InjectOptions) => {
      const r = await app.inject(o);
      antworten[name] = {
        status: r.statusCode,
        koepfe: Object.keys(r.headers)
          .filter((k) => !['date', 'last-modified', 'etag', 'content-length', 'transfer-encoding'].includes(k))
          .sort()
          .map((k) =>
            ['cache-control', 'content-type', 'x-frame-options', 'retry-after'].includes(k) ? `${k}: ${String(r.headers[k])}` : k,
          ),
        ...(r.statusCode >= 400 && r.headers['content-type']?.toString().startsWith('application/json')
          ? { body: r.body.replace(/Anfrage [0-9a-f]{8}/g, 'Anfrage ID') }
          : {}),
      };
      return r;
    };
    await frage('gesundheit', { method: 'GET', url: '/api/gesundheit' });
    const e = await frage('einrichten', {
      method: 'POST',
      url: '/api/konto/einrichten',
      headers: { 'x-dms': '1' },
      payload: { email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' },
    });
    const cookie = String(e.headers['set-cookie']).split(';')[0];
    await frage('typ anlegen', { method: 'POST', url: '/api/typen', headers: { cookie, 'x-dms': '1' }, payload: { name: 'Vertrag' } });
    await frage('Datei an JSON-Route', {
      method: 'POST',
      url: '/api/typen',
      headers: { cookie, 'x-dms': '1', 'content-type': 'application/octet-stream' },
      payload: Buffer.from('xx'),
    });
    await frage('Upload ohne Anmeldung', {
      method: 'POST',
      url: '/api/fotostapel',
      headers: { 'x-dms': '1', 'content-type': 'application/octet-stream' },
      payload: Buffer.from('xx'),
    });
    await frage('JSON kaputt', {
      method: 'POST',
      url: '/api/konto/anmelden',
      headers: { 'x-dms': '1', 'content-type': 'application/json' },
      payload: '{kaputt',
    });
    await frage('API unbekannt', { method: 'GET', url: '/api/gibtsnicht' });
    // Interner Fehler im Handler (mit Kontext der Anfrage) und vor dem Lesen eines Uploads (ohne Kontext): 500.
    const typenFuer = dienst.mappentypen.typenFuer.bind(dienst.mappentypen);
    dienst.mappentypen.typenFuer = async () => {
      throw new Error('kaputt im Handler');
    };
    await frage('Fehler im Handler', { method: 'GET', url: '/api/typen', headers: { cookie, 'x-dms': '1' } });
    dienst.mappentypen.typenFuer = typenFuer;
    const anmeldungZu = konten.anmeldungZu.bind(konten);
    konten.anmeldungZu = async () => {
      throw new Error('kaputt vor dem Körper');
    };
    await frage('Fehler vor dem Körper', {
      method: 'POST',
      url: '/api/fotostapel',
      headers: { cookie, 'x-dms': '1', 'content-type': 'application/octet-stream' },
      payload: Buffer.from('xx'),
    });
    konten.anmeldungZu = anmeldungZu;
    // Antwort Stück für Stück (#444): „Frag deine Ablage“ mit einer Attrappe statt des Pakets.
    dienst.fragen.frage = async (_z, _e, schreibe) => {
      schreibe({ art: 'fertig' } as never);
    };
    const strom = await frage('Strom', { method: 'POST', url: '/api/fragen', headers: { cookie, 'x-dms': '1' }, payload: { frage: 'x' } });
    antworten['Strom: Inhalt'] = strom.body;
    await frage('Oberfläche', { method: 'GET', url: '/irgendwo/tief' });
    await frage('Datei der Oberfläche', { method: 'GET', url: '/assets/a.js' });
    await frage('WebDAV aus', { method: 'OPTIONS', url: '/webdav/' });
    await wd.speichere({ aktiv: true }, 'markus@example.org');
    await frage('WebDAV an', { method: 'OPTIONS', url: '/webdav/' });
    await frage('WebDAV ohne Anmeldung', { method: 'PROPFIND', url: '/webdav/', headers: { depth: '1' } });
    await app.close();

    ist = {
      wurzel: Object.fromEntries(Object.entries(wurzel).map(([k, l]) => [k, Array.isArray(l) ? l.length : l])),
      parser: [...parser.customParsers.keys()],
      routen: Object.fromEntries(BEISPIELE.map((r) => [r, routen.get(r) ?? null])),
      antworten,
    };
    if (process.env.CHARAKTER_SCHREIBEN) {
      mkdirSync(dirname(DATEI), { recursive: true });
      writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
    }
  });
  after(() => rmSync(web, { recursive: true, force: true }));

  const soll = () => (existsSync(DATEI) ? (JSON.parse(readFileSync(DATEI, 'utf8')) as Record<string, unknown>) : {});
  it('Hooks an der Wurzel', () => assert.deepEqual(ist.wurzel, soll().wurzel));
  it('Inhaltstyp-Parser an der Wurzel', () => assert.deepEqual(ist.parser, soll().parser));
  it('Hooks je Art der Route, in Reihenfolge', () => {
    for (const r of BEISPIELE) assert.ok((ist.routen as Record<string, unknown>)[r], `${r} fehlt`);
    assert.deepEqual(ist.routen, soll().routen);
  });
  it('Antworten', () => assert.deepEqual(ist.antworten, soll().antworten));
});
