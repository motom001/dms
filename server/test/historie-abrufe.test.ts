/**
 * Historie: alles mitschreiben, je Register einstellen, was angezeigt wird (#800). Abrufe über Oberfläche, API und
 * Export, Rauschen unterdrücken (einmal je Person, Datei, Weg und Tag), seitenweise laden, Gruppen je Register,
 * Vollexport und Auskunft. Der Kern läuft im Arbeitsspeicher und – mit TEST_DATABASE_URL – gegen PostgreSQL.
 * WebDAV steht in webdav.test.ts.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import {
  HISTORIE_IMMER, HISTORIE_VORAUSWAHL, HISTORIENARTEN, HISTORIENGRUPPEN, historienartenVon, historiengruppenVon, pruefeMappentyp, type Historienart,
} from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { bereinigeTyp, Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { vollexport } from '../src/vollexport';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const PW = 'ein-langes-passwort';
const PDF = Buffer.from('%PDF-1.4\n% Rechnung\n');
const ABRUFE: Historienart[] = ['heruntergeladen', 'abruf_api', 'abruf_webdav'];
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
let sql: any;
const offen: Array<() => Promise<unknown>> = [];
after(async () => { for (const f of offen) await f(); });

/** Eigene Testdatenbank je Aufruf (andere Testdateien laufen gleichzeitig); danach wieder weg. */
async function pgRepos(): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const a = { ...ausUrl(url)!, datenbank: `dms_a800_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const s = verbinde(alsUrl(a));
  sql = s;
  offen.push(async () => { await s.end(); const w = verbinde(alsUrl(a, 'postgres')); await w.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}"`).catch(() => {}); await w.end(); });
  await migriere(s, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
  return { repo: pgRepo(s, HAUSHALT), konto: pgKontoRepo(s, HAUSHALT) };
}

/** Vertrag mit zwei Registern „Historie“: „Verlauf“ (Vorauswahl) und „Abrufe“ (nur Herunterladen, API, WebDAV). */
async function aufbau(repos?: { repo: Repo; konto: KontoRepo }) {
  const d = new Dienst(repos?.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(repos?.konto ?? speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id)).benutzer;
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const typ = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [
    { key: 'daten', name: 'Daten', art: 'felder' }, { key: 'belege', name: 'Belege', art: 'dokumente', versionierung: true },
    { key: 'verlauf', name: 'Verlauf', art: 'protokoll' },
    { key: 'abrufe', name: 'Abrufe', art: 'protokoll', zeigt: ['herunterladen', 'api', 'webdav'] },
  ] } as never);
  const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: 'V-1' } }, lena.id);
  const dok = (await d.dokumente.ladeHoch(m.id, { register: 'belege', name: 'Rechnung.pdf', typ: 'application/pdf' }, PDF, lena.id)).dokument;
  return { d, konten, lena, jonas, typ, m, dok };
}

describe('Historie: Gruppen und Register (#800)', () => {
  it('jede Art liegt in genau einer Gruppe; „im Verwaltungsmodus“ in keiner und immer dabei', () => {
    const alle = Object.keys(HISTORIENARTEN) as Historienart[];
    for (const art of alle) {
      const in_ = Object.entries(HISTORIENGRUPPEN).filter(([, arten]) => (arten as readonly string[]).includes(art)).map(([g]) => g);
      if (HISTORIE_IMMER.includes(art)) assert.deepEqual(in_, [], art);
      else assert.equal(in_.length, 1, `${art} liegt in ${in_.join(', ') || 'keiner Gruppe'}`);
    }
    // Vorauswahl: alles wie bisher, ohne die Abrufe.
    const vor = historienartenVon(HISTORIE_VORAUSWAHL);
    for (const a of ABRUFE) assert.ok(!vor.includes(a), a);
    assert.equal(vor.length, alle.length - ABRUFE.length);
    // Auch ein Register, das nichts zeigen soll, zeigt den Verwaltungsmodus.
    assert.deepEqual(historienartenVon([]), ['verwaltungsmodus']);
    assert.deepEqual(historiengruppenVon({}), [...HISTORIE_VORAUSWAHL]);
    assert.deepEqual(historiengruppenVon({ zeigt: [] }), []);
  });

  it('mehrere Register „Historie“; nur bekannte Gruppen, jede einmal', () => {
    const t = bereinigeTyp({ name: 'X', felder: [], register: [
      { key: 'verlauf', name: 'Verlauf', art: 'protokoll' },
      { key: 'abrufe', name: 'Abrufe', art: 'protokoll', zeigt: ['webdav', 'api', 'webdav', 'gibtsnicht', 7] },
      { key: 'dok', name: 'Dokumente', art: 'dokumente', zeigt: ['api'] },
    ] });
    assert.deepEqual(t.register.map((r) => [r.key, r.zeigt]), [['verlauf', undefined], ['abrufe', ['webdav', 'api']], ['dok', undefined]]);
    // Der Kern nimmt zwei Register „Historie“ an einem Mappentyp an.
    assert.deepEqual(pruefeMappentyp(t, { namenAndererTypen: [], existiertTyp: () => true }).allgemein, []);
  });
});

for (const pg of [false, ...(url ? [true] : [])]) {
  describe(`Historie: Abrufe mitschreiben (#800, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    it('einmal je Person, Datei, Fassung, Weg und Tag; ein späterer Tag bekommt einen eigenen Eintrag', async (t) => {
      const x = await aufbau(pg ? await pgRepos() : undefined);
      const abruf = (o: Partial<Parameters<Dienst['mappenHistorie']['notiereAbruf']>[0]> = {}) => x.d.mappenHistorie.notiereAbruf({ dokumentId: x.dok.id, benutzerId: x.lena.id, weg: 'oberflaeche', ...o });
      assert.equal(await abruf(), true);
      assert.equal(await abruf(), false, 'derselbe Abruf am selben Tag');
      // Gleichzeitig (z. B. Explorer liest parallel): trotzdem nur einer.
      assert.deepEqual((await Promise.all([1, 2, 3, 4, 5].map(() => abruf({ weg: 'webdav', schluessel: 'Laufwerk' })))).filter(Boolean).length, 1);
      assert.equal(await abruf({ weg: 'api', schluessel: 'Scanner' }), true, 'anderer Weg');
      assert.equal(await abruf({ benutzerId: x.jonas.id }), true, 'andere Person');
      assert.equal(await abruf({ fassung: 'archiv' }), true, 'andere Fassung');
      assert.equal(await abruf({ fassung: 'version', version: 1 }), true, 'ältere Version');
      assert.equal(await abruf({ fassung: 'version', version: 1 }), false);
      assert.equal(await x.d.mappenHistorie.notiereAbruf({ dokumentId: '00000000-0000-4000-8000-00000000dead', benutzerId: x.lena.id, weg: 'api' }), false, 'unbekanntes Dokument');
      const h = (await x.d.mappenHistorie.historie(x.m.id)).filter((e) => ABRUFE.includes(e.art));
      assert.equal(h.length, 6);
      const api = h.find((e) => e.art === 'abruf_api')!;
      assert.deepEqual({ ...api.daten }, { dokument: 'Rechnung.pdf', dokumentId: x.dok.id, weg: 'api', fassung: 'original', schluessel: 'Scanner' });
      assert.equal(api.benutzerId, x.lena.id);
      assert.equal(h.find((e) => e.art === 'abruf_webdav')!.daten.weg, 'webdav');
      // Zwei Tage später: neuer Abruf, neuer Eintrag. (In PostgreSQL setzt die Datenbank die Zeit – dort rücken die
      // Einträge zwei Tage zurück, statt die Uhr vorzustellen.)
      if (pg) await sql`UPDATE historie SET zeit = zeit - interval '2 days'`;
      else t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 2 * 86_400_000 });
      try {
        assert.equal(await abruf(), true);
        assert.equal(await abruf(), false);
      } finally { if (!pg) t.mock.timers.reset(); }
      assert.equal((await x.d.mappenHistorie.historie(x.m.id)).filter((e) => e.art === 'heruntergeladen').length, 5);
    });

    it('je Register nur seine Gruppen, „Im Verwaltungsmodus“ immer; seitenweise; ohne Angaben alles', async () => {
      const x = await aufbau(pg ? await pgRepos() : undefined);
      await x.d.mappenHistorie.notiereAbruf({ dokumentId: x.dok.id, benutzerId: x.lena.id, weg: 'webdav' });
      const repo = (x.d as unknown as { repo: Repo }).repo;
      await repo.historieSchreibe([{ mappeId: x.m.id, benutzerId: x.jonas.id, art: 'verwaltungsmodus', daten: { was: 'angesehen' } }]);
      const arten = async (register?: string) => [...new Set((await x.d.mappenHistorie.historie(x.m.id, { register })).map((e) => e.art))].sort();
      assert.deepEqual(await arten('abrufe'), ['abruf_webdav', 'verwaltungsmodus']);
      assert.ok(!(await arten('verlauf')).includes('abruf_webdav'));
      assert.ok((await arten('verlauf')).includes('verwaltungsmodus'));
      assert.ok((await arten('verlauf')).includes('dokument_hochgeladen'));
      assert.deepEqual(await arten('gibtsnicht'), await arten(), 'unbekanntes Register: alles');
      assert.ok((await arten()).includes('abruf_webdav'), 'ohne Register alles (API wie bisher)');
      // Seitenweise: 250 weitere Einträge, Seiten zu 100 ohne Lücke und ohne Doppel.
      await repo.historieSchreibe(Array.from({ length: 250 }, (_, i) => ({ mappeId: x.m.id, benutzerId: x.lena.id, art: 'notiz' as const, daten: { text: `n${i}` } })));
      const alle = await x.d.mappenHistorie.historie(x.m.id);
      const seiten: number[] = [];
      let vor: number | undefined;
      for (;;) {
        const s = await x.d.mappenHistorie.historie(x.m.id, { max: 100, vor });
        seiten.push(...s.map((e) => e.id));
        if (s.length < 100) break;
        vor = s[s.length - 1].id;
      }
      assert.deepEqual(seiten, alle.map((e) => e.id));
      assert.equal((await x.d.mappenHistorie.historie(x.m.id, { register: 'abrufe', max: 1 })).length, 1);
      await assert.rejects(x.d.mappenHistorie.historie(x.m.id, { max: 0 }), status(422));
      await assert.rejects(x.d.mappenHistorie.historie(x.m.id, { max: 5000 }), status(422));
      await assert.rejects(x.d.mappenHistorie.historie(x.m.id, { vor: 'x' }), status(422));
    });

    it('Export mit Dokumenten: je Mappe ein Eintrag mit ihren Dateien; Vollexport und Auskunft enthalten die Abrufe', async () => {
      const x = await aufbau(pg ? await pgRepos() : undefined);
      const sicht = await x.d.sichtenVerwaltung.legeSichtAn({ name: 'Verträge', typen: [x.typ.id] });
      const ohne = await x.d.mappen.legeMappeAn({ typId: x.typ.id, werte: { nr: 'V-2' } }, x.lena.id);
      const ich = { id: x.lena.id, rolle: 'admin', name: 'Lena' };
      const z = await x.d.rechtepruefung.zugriff(ich);
      const r = await x.d.exportiere(ich, { format: 'zip', sicht: sicht.id }, z, undefined, 'api');
      (r.inhalt as NodeJS.ReadableStream).resume?.();
      const e = (await x.d.mappenHistorie.historie(x.m.id)).find((h) => h.art === 'abruf_api')!;
      assert.deepEqual(e.daten.dokumente, ['Rechnung.pdf']);
      assert.equal(e.daten.fassung, 'export');
      assert.ok(!(await x.d.mappenHistorie.historie(ohne.id)).some((h) => ABRUFE.includes(h.art)), 'ohne Dokumente kein Abruf');
      await x.d.exportiere(ich, { format: 'csv', sicht: sicht.id }, z);
      assert.equal((await x.d.mappenHistorie.historie(x.m.id)).filter((h) => ABRUFE.includes(h.art)).length, 1, 'Tabelle allein: keine Dateien');
      await x.d.mappenHistorie.notiereAbruf({ dokumentId: x.dok.id, benutzerId: x.lena.id, weg: 'webdav' });
      // Vollexport: daten/historie.jsonl
      const quelle = x.d.vollexportQuelle({ mandant: 'Familie Test', version: '0.0.0', benutzer: () => x.konten.exportDaten(), designs: async () => [], protokoll: () => [] });
      const v = await vollexport(quelle, await mkdtemp(join(tmpdir(), 'dms-a800-')), {});
      const zeilen = (await readFile(join(v.ordner, 'daten/historie.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { art: string });
      assert.ok(zeilen.some((l) => l.art === 'abruf_webdav') && zeilen.some((l) => l.art === 'abruf_api'));
      // Auskunft (Art. 15 DSGVO): die Historie der Mappe geht mit – samt Abrufen.
      const daten = await x.d.auskunftDaten({ mappeId: x.m.id, geprueft: true, auswahl: { mappen: [x.m.id], dokumente: [], notizen: [], historie: [x.m.id] } }, z, { mandant: 'H', version: '0' });
      const hist = await daten.quelle.historie([x.m.id]) as unknown as Array<{ art: string }>;
      assert.ok(hist.some((h) => h.art === 'abruf_webdav') && hist.some((h) => h.art === 'abruf_api'));
    });
  });
}

describe('Historie: Abrufe über HTTP (#800)', () => {
  it('Herunterladen in der Oberfläche und mit API-Schlüssel kommt in die Historie, Anzeigen nicht', async () => {
    const x = await aufbau();
    const { baueApp } = await import('../src/http');
    const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
    const app = await baueApp(x.d, x.konten, { apiSchluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()) });
    offen.push(() => app.close());
    const an = await app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email: 'lena@example.org', passwort: PW }, headers: { 'x-dms': '1' } });
    const cookie = ([] as string[]).concat(an.headers['set-cookie'] as string | string[])[0].split(';')[0];
    const rufe = (method: 'GET' | 'POST', u: string, payload?: object) => app.inject({ method, url: u, ...(payload ? { payload } : {}), headers: { 'x-dms': '1', cookie } });
    const abrufe = async () => (await x.d.mappenHistorie.historie(x.m.id)).filter((e) => ABRUFE.includes(e.art));

    assert.equal((await rufe('GET', `/api/dokumente/${x.dok.id}/inhalt`)).statusCode, 200);
    assert.equal((await abrufe()).length, 0, 'Anzeigen im Browser ist kein Abruf');
    assert.equal((await rufe('GET', `/api/dokumente/${x.dok.id}/inhalt?herunterladen`)).statusCode, 200);
    assert.equal((await rufe('POST', `/api/dokumente/${x.dok.id}/herunterladen`, {})).statusCode, 200);
    assert.equal((await rufe('GET', `/api/dokumente/${x.dok.id}/inhalt?herunterladen`)).statusCode, 200);
    let h = await abrufe();
    assert.deepEqual(h.map((e) => [e.art, e.daten.weg, e.daten.fassung, e.daten.dokument]), [['heruntergeladen', 'oberflaeche', 'original', 'Rechnung.pdf']]);
    await x.d.dokumentVersionen.ersetzeDokument(x.dok.id, {}, Buffer.from('%PDF-1.4\n% Rechnung 2\n'), x.lena.id);
    assert.equal((await rufe('POST', `/api/dokumente/${x.dok.id}/herunterladen`, { version: 1 })).statusCode, 200);
    assert.equal((await abrufe()).length, 2, 'ältere Version ist eine eigene Fassung');
    assert.equal((await rufe('GET', `/api/dokumente/${x.dok.id}/inhalt?fassung=archiv`)).statusCode, 404);
    assert.equal((await abrufe()).length, 2, 'Fehler: kein Eintrag');

    const s = (await rufe('POST', '/api/konto/api-schluessel', { name: 'Scanner', recht: 'lesen' })).json().schluessel as string;
    const mit = (u: string) => app.inject({ method: 'GET', url: u, headers: { authorization: `Bearer ${s}` } });
    assert.equal((await mit(`/api/v1/dokumente/${x.dok.id}/inhalt`)).statusCode, 200);
    assert.equal((await mit(`/api/v1/dokumente/${x.dok.id}/inhalt`)).statusCode, 200);
    h = await abrufe();
    const api = h.filter((e) => e.art === 'abruf_api');
    assert.equal(api.length, 1);
    assert.equal(api[0].daten.schluessel, 'Scanner');
    assert.equal(api[0].benutzerId, x.lena.id);
    // Register „Abrufe“ über die Schnittstelle, seitenweise.
    const r = await rufe('GET', `/api/mappen/${x.m.id}/historie?register=abrufe&max=2`);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json().map((e: { art: string }) => e.art), ['abruf_api', 'heruntergeladen']);
    const weiter = await rufe('GET', `/api/mappen/${x.m.id}/historie?register=abrufe&max=2&vor=${r.json()[1].id}`);
    assert.deepEqual(weiter.json().map((e: { art: string }) => e.art), ['heruntergeladen']);
    assert.equal((await rufe('GET', `/api/mappen/${x.m.id}/historie?max=abc`)).statusCode, 422);
  });
});
