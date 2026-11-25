/**
 * Prüfstand (#1679): ein ganzer Lauf gegen eine nachgebaute Ablago (nur die Schnittstellen, die das Werkzeug nutzt) –
 * Einrichten mit Code, Pakete aus dem Katalog, Grundmappen mit Verweisen, Dokumente in der Reihenfolge ihres Datums als
 * Neue Post, Messen, im Lernlauf Zuordnen; dazu das Szenario „Ungleichgewicht“ (#1672). Mini-Satz wie in
 * pruefstand.test.ts (erfunden, example.org).
 */
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { miniSatz, type Ergebnis, type Pruefstand } from './pruefstand-hilfen';

const cli = (await import(new URL('../werkzeuge/pruefstand/pruefstand.mjs', import.meta.url).href)) as Pruefstand['cli'];

interface Mappe {
  id: string;
  typId: string;
  werte: Record<string, unknown>;
  dokumente: Array<{ id: string; register: string; name: string }>;
}
const feld = (key: string, typ = 'text', extra = {}) => ({ key, label: key, typ, ...extra });
const TYPEN = [
  { id: 't-post', schluessel: 'post', system: 'post', felder: [], register: [{ key: 'eingang', art: 'dokumente' }] },
  { id: 't-org', schluessel: 'basis:organisation', felder: [feld('name'), feld('email')], register: [{ key: 'dok', art: 'dokumente' }] },
  { id: 't-haus', schluessel: 'haus:immobilie', felder: [feld('bezeichnung')], register: [] },
  {
    id: 't-vertrag',
    schluessel: 'vertraege:vertrag',
    paket: 'vertraege',
    felder: [feld('von', 'referenz', { pflicht: true }), feld('vertragsnummer'), feld('beginn', 'datum')],
    register: [{ key: 'unterlagen', art: 'dokumente' }],
  },
  {
    id: 't-rechnung',
    schluessel: 'rechnung_bestellung:rechnung',
    felder: [feld('von', 'referenz'), feld('rechnungsnummer'), feld('betrag', 'betrag')],
    register: [{ key: 'belege', art: 'dokumente' }],
  },
];

const KLASSIFIZIERT = {
  typen: [{ typId: 't-vertrag', sicherheit: 0.8, belege: [{ weg: 'kern', sicherheit: 0.6 }] }],
  vorschlag: { typId: 't-vertrag' },
  schwelle: 0.3,
  wege: [{ weg: 'kern', stand: 'ok' }],
};
const VORSCHLAEGE = {
  vorschlaege: {
    vertragsnummer: { wert: 'ST-100' },
    beginn: { wert: '2025-02-01' },
    rechnungsnummer: { wert: 'W-7' },
    betrag: { wert: { betrag: 80.5, waehrung: 'EUR' } },
  },
};

/** Feste Antworten: Volltext, „Wohin gehört das?“ und „Aus Dokument ausfüllen“. */
const FEST: Array<[RegExp, unknown]> = [
  [/^\/api\/dokumente\/[^/]+\/volltext$/, { text: 'Text des Dokuments' }],
  [/^\/api\/klassifizieren$/, KLASSIFIZIERT],
  [/^\/api\/typen\/[^/]+\/vorschlaege$/, VORSCHLAEGE],
];

/** Nachgebaute Ablago: merkt sich Anfragen, Mappen und Zuordnungen. */
class Attrappe {
  eingerichtet = false;
  mappen = new Map<string, Mappe>();
  anfragen: Array<{ m: string; pfad: string; body: unknown }> = [];
  n = 0;
  id = (p: string) => `${p}${++this.n}`;
  nachName = (name: string) => [...this.mappen.values()].find((m) => m.werte.name === name || m.werte.vertragsnummer === name)?.id;

  antwort(m: string, url: URL, body: unknown, koepfe: IncomingMessage['headers']): [number, unknown] {
    const p = url.pathname;
    const b = (body ?? {}) as Record<string, unknown>;
    if (p.startsWith('/api/konto/') || p.startsWith('/api/werkbank/')) return this.verwaltung(m, p, koepfe);
    if (p === '/api/typen') return [200, TYPEN];
    if (p === '/api/mappen' && m === 'GET')
      return [200, [...this.mappen.values()].filter((x) => !url.searchParams.get('typ') || x.typId === url.searchParams.get('typ'))];
    if (p === '/api/mappen' || p === '/api/post') return this.lege(p === '/api/post' ? 't-post' : String(b.typId), b);
    const mappe = /^\/api\/mappen\/([^/]+)(\/.*)?$/.exec(p);
    if (mappe) return this.mappeRoute(m, mappe[1], mappe[2] ?? '', url, b);
    const fest = FEST.find(([muster]) => muster.test(p));
    return fest ? [200, fest[1]] : [404, { fehler: `unbekannt ${m} ${p}` }];
  }

  verwaltung(m: string, p: string, koepfe: IncomingMessage['headers']): [number, unknown] {
    if (p === '/api/konto/status') return [200, { einrichtungNoetig: !this.eingerichtet, einrichtung: { phase: 'konto' } }];
    if (p === '/api/konto/einrichten') {
      if (koepfe['x-einrichtungscode'] !== 'code-1') return [403, { fehler: 'Code' }];
      this.eingerichtet = true;
    }
    if (p === '/api/werkbank/pakete' && m === 'GET')
      return [200, { dms: '9.9.9', installiert: ['basis', 'vertraege', 'texterkennung'].map((id) => ({ id, version: '1.0.0' })) }];
    if (p === '/api/werkbank/pakete/ablauf/plan') return [200, { pakete: [{ id: 'basis' }], rechte: { stand: 'r1' } }];
    if (p === '/api/werkbank/pakete/ablauf/installieren') return [200, { installiert: [], fehlgeschlagen: [], nichtInstalliert: [] }];
    return [200, {}];
  }

  lege(typId: string, b: Record<string, unknown>): [number, unknown] {
    const t = TYPEN.find((x) => x.id === typId)!;
    const fehlt = t.felder.find((f) => 'pflicht' in f && !(b.werte as Record<string, unknown>)?.[f.key]);
    if (fehlt) return [422, { fehler: 'Pflicht', details: { felder: { [fehlt.key]: ['Pflichtfeld'] } } }];
    const x: Mappe = { id: this.id('m'), typId, werte: (b.werte as Record<string, unknown>) ?? {}, dokumente: [] };
    this.mappen.set(x.id, x);
    return [201, x];
  }

  mappeRoute(m: string, id: string, rest: string, url: URL, b: Record<string, unknown>): [number, unknown] {
    const x = this.mappen.get(id);
    if (!x) return [404, { fehler: 'Mappe' }];
    if (rest === '' && m === 'GET') return [200, { ...x, dokumente: x.dokumente.map((d) => ({ ...d, ocr: { stand: 'fertig' } })) }];
    if (rest === '' && m === 'PUT') {
      x.werte = { ...x.werte, ...(b.werte as object) };
      return [200, x];
    }
    if (rest === '/dokumente') {
      const t = TYPEN.find((y) => y.id === x.typId)!;
      if (!t.register.some((r) => r.key === url.searchParams.get('register'))) return [422, { fehler: 'Register' }];
      const d = { id: this.id('d'), register: url.searchParams.get('register')!, name: url.searchParams.get('name')! };
      x.dokumente.push(d);
      return [201, { dokument: d }];
    }
    if (rest === '/erkennung') {
      const org = this.nachName('Beispiel Strom AG');
      const vertrag = this.nachName('ST-100');
      return [
        200,
        { absender: org ? [{ mappeId: org }] : [], ziele: vertrag ? [{ mappeId: vertrag }] : [], neuerAbsender: null, auto: null },
      ];
    }
    if (rest === '/zuordnen') return [200, {}];
    return [404, { fehler: 'unbekannt' }];
  }

  bediene = (req: IncomingMessage, res: ServerResponse) => {
    const teile: Buffer[] = [];
    req.on('data', (c: Buffer) => teile.push(c));
    req.on('end', () => {
      const roh = Buffer.concat(teile);
      const json = req.headers['content-type'] === 'application/json' && roh.length ? JSON.parse(roh.toString()) : undefined;
      const url = new URL(req.url!, 'http://x');
      this.anfragen.push({ m: req.method!, pfad: url.pathname, body: json });
      const [s, d] = req.headers['x-dms'] === '1' ? this.antwort(req.method!, url, json, req.headers) : [400, { fehler: 'x-dms' }];
      res.writeHead(s, {
        'content-type': 'application/json',
        ...(url.pathname === '/api/konto/anmelden' ? { 'set-cookie': 'sitzung=1; Path=/' } : {}),
      });
      res.end(JSON.stringify(d));
    });
  };
}

const ordner = mkdtempSync(join(tmpdir(), 'pruefstand-lauf-'));
const satz = miniSatz(join(ordner, 'satz'));
let a: Attrappe;
let server: ReturnType<typeof createServer>;
let url = '';
before(async () => {
  a = new Attrappe();
  server = createServer(a.bediene);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  rmSync(ordner, { recursive: true, force: true });
});

const lies = (f: string) =>
  JSON.parse(readFileSync(f, 'utf8')) as {
    name: string;
    satz: { dokumente: number };
    lauf: { ergebnisse: Ergebnis[]; hinweise: string[] };
  };
const basis = () => ({ satz, url, email: 'pruefstand@example.org', passwort: 'ein-langes-probe-passwort', code: 'code-1', dateien: [] });

describe('Prüfstand: Lauf gegen Ablago (#1679)', () => {
  it('Lernlauf: einrichten, Pakete, Grundmappen, Dokumente nach Datum messen und zuordnen', async () => {
    const aus = join(ordner, 'lernen.json');
    await cli.lauf({ ...basis(), lernen: true, aus });
    const plan = a.anfragen.find((x) => x.pfad === '/api/werkbank/pakete/ablauf/installieren')!.body as {
      pakete: string[];
      rechteStand: string;
    };
    assert.deepEqual(plan.pakete, ['basis', 'haus', 'rechnung_bestellung', 'vertraege', 'texterkennung']);
    assert.equal(plan.rechteStand, 'r1');
    const r = lies(aus);
    assert.equal(r.name, 'lernen');
    assert.equal(r.satz.dokumente, 3);
    const [e1, e2, e3] = r.lauf.ergebnisse;
    assert.deepEqual([e1.id, e2.id, e3.id], ['a1-01', 'b1-01', 'a1-02']);
    // a1-01 legt den Vertrag erst an: Zielmappe nicht messbar; Absender als Grundmappe schon da.
    assert.equal(e1.erwartet.mappeDa, false);
    assert.deepEqual(e1.absender, ['org_strom']);
    assert.deepEqual(e1.felder, { 'vertrag_strom.vertragsnummer': 'richtig', 'vertrag_strom.beginn': 'falsch' });
    assert.deepEqual(e2.felder, { 're_wasser.rechnungsnummer': 'richtig', 're_wasser.betrag': 'richtig' });
    assert.equal(e3.erwartet.mappeDa, true);
    assert.deepEqual(e3.ziele, ['vertrag_strom']);
    assert.deepEqual(e3.typen?.[0].typ, 'vertraege:vertrag');
    // Vertrag mit Verweis auf die Organisation, Post im Register der Post, je Dokument zugeordnet.
    const vertrag = [...a.mappen.values()].find((m) => m.werte.vertragsnummer === 'ST-100')!;
    assert.equal(vertrag.werte.von, a.nachName('Beispiel Strom AG'));
    const zuordnen = a.anfragen.filter((x) => x.pfad.endsWith('/zuordnen')).map((x) => (x.body as { ziel: string }).ziel);
    assert.deepEqual([zuordnen[0], zuordnen[2]], [vertrag.id, vertrag.id]);
    assert.equal(a.mappen.get(zuordnen[1])!.werte.rechnungsnummer, 'W-7');
    assert.ok([...a.mappen.values()].filter((m) => m.typId === 't-post').every((m) => m.dokumente.every((d) => d.register === 'eingang')));
  });

  it('Ungleichgewicht: füllt den Typ auf und misst nur seltene Stücke und andere Typen', async () => {
    const aus = join(ordner, 'ungleich.json');
    const vorher = a.mappen.size;
    // Nur das erste Dokument (die Rechnung) messen – die Vorlage zum Auffüllen kommt trotzdem aus dem ganzen Satz.
    await cli.lauf({ ...basis(), auffuellen: '2', 'auffuell-typ': 'vertraege:vertrag', nur: 'b1-01,a1-02', aus });
    const r = lies(aus);
    assert.equal(r.name, 'ungleichgewicht-2');
    assert.deepEqual(
      r.lauf.ergebnisse.map((e) => e.id),
      ['b1-01', 'a1-02'],
    );
    assert.ok(r.lauf.ergebnisse.every((e) => e.fuellTyp === 'vertraege:vertrag'));
    const neu = [...a.mappen.values()].slice(vorher).filter((m) => m.dokumente.some((d) => d.name.startsWith('aufgefuellt-')));
    assert.equal(neu.length, 2);
    assert.ok(neu.every((m) => m.typId === 't-vertrag' && m.dokumente[0].register === 'unterlagen' && m.werte.von));
    assert.deepEqual(
      neu.map((m) => m.werte.vertragsnummer),
      ['1/2024', '2/2024'],
    );
  });
});
