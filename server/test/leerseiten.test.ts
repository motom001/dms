/**
 * Leerseiten (#997): Paketformat (`dms:leerseiten`), Rechte-Vorschau, Markieren nur durch das Paket (nur Post, nur
 * dieselbe Datei, ändert nichts), Wahl je Seite durch Menschen („Doch behalten“ / „Auch weglassen“), Weglassen beim
 * Übernehmen (neue Fassung, Original als frühere Version, Historie, Texterkennung neu), nichts ohne Übernehmen, nie beim
 * automatischen Zuordnen, nie das ganze Dokument. Namen und Inhalte sind erfunden. Der Kern läuft im Arbeitsspeicher und
 * – mit TEST_DATABASE_URL – gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { DMS_LEERSEITEN_AB, neueErkennung, pruefeSeitenliste, waehle, wegfallendeSeiten, wirdGekuerzt, type Leerseiten } from '../../shared/src/leerseiten';
import { POST_STAND } from '../../shared/src/model';
import { liesCode, rechtePunkte, rechteZeilen } from '../../shared/src/pakete';
import { openapi } from '../src/api-v1';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { schluesselRecht } from '../src/laeufer/verwaltung';
import { Paketverwaltung } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Verbindungen nur zum Schließen
const offen: any[] = [];
after(async () => { for (const s of offen) await s.end(); });

async function pgRepos(name: string): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const { sql } = await eigeneDatenbank(name);
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

const fehler = (s: number, re?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!re || re.test(e.message));

/** PDF mit einer Seite je Breite – an der Breite erkennt der Test, welche Seiten geblieben sind. */
async function pdf(breiten: number[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const b of breiten) doc.addPage([b, 400]);
  return Buffer.from(await doc.save());
}
const breitenVon = async (inhalt: Buffer) => (await PDFDocument.load(inhalt)).getPages().map((p) => Math.round(p.getWidth()));

/* ---------- Paket „Leerseiten“ als Archiv ---------- */
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const archiv = (d: Record<string, string | Buffer>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const paket = (id: string, name: string, schnittstellen = '[dms:leerseiten]') => ({
  'manifest.yaml': `schema: 1\nid: ${id}\nname: ${name}\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=${DMS_LEERSEITEN_AB}"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  ereignisse: [dokument.hochgeladen]\n  rechte:\n    lesen: [dms:post]\n    dokumente: lesen\n    schnittstellen: ${schnittstellen}\n  netz: []\n`,
  'code/modul.wasm': WASM,
});

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };

async function aufbau(pg: boolean, name: string) {
  const r = pg ? await pgRepos(name) : { repo: speicherRepo(), konto: speicherKontoRepo() };
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(r.konto, () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const p = new Paketverwaltung(d, { version: () => DMS_LEERSEITEN_AB, abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
  const installiere = async (dateien: Record<string, string | Buffer>) => { const h = await p.hochladen(archiv(dateien), ICH); return p.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true }, ICH); };
  await installiere(paket('leerseiten', 'Leerseiten'));
  const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
  const tabelle = routen(d, konten, { apiSchluessel: schluessel });
  const route = (m: string, pfad: string) => { const x = tabelle.find((y) => y.methode === m && y.pfad === pfad); assert.ok(x, `${m} ${pfad}`); return x!; };
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const oberflaeche = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}) => route(m, pfad).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) } as Anfrage);
  const alsPaket = async (paketId: string, m: string, pfad: string, x: Partial<Anfrage> = {}) => {
    const konto = await konten.dienstkonto(paketId, paketId);
    d.kern.paketKonten.set(konto.id, paketId);
    const laeufer = (await d.kern.repo.listePakete()).find((y) => y.id === paketId)!.laeufer!;
    const k = await schluessel.fuerDienstkonto(konto, schluesselRecht(laeufer));
    const anfrage = { body: {}, params: {}, query: {}, ip: '127.0.0.1', ...x } as Anfrage;
    const rt = route(m, `/api/v1${pfad}`);
    await pruefeZugang(rt as Route, anfrage, (n) => (n === 'authorization' ? `Bearer ${k}` : undefined), konten, schluessel);
    return rt.handler(anfrage);
  };
  const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'belege', name: 'Belege', art: 'dokumente' },
  ] });
  // Ein beidseitiger Scan mit sechs Seiten: Rückseiten 2, 4 und 6 sind leer.
  const post = await d.post.legePostAn({ betreff: 'Brief der Stadtwerke' }, { id: lena.id, name: 'Lena' });
  const scan = (await d.dokumente.ladeHoch(post.id, { register: 'dokumente', name: 'scan.pdf', typ: 'application/pdf' }, await pdf([101, 102, 103, 104, 105, 106]), lena.id)).dokument;
  const markiere = (seiten: unknown, sha = scan.sha256, id = scan.id, paketId = 'leerseiten') => alsPaket(paketId, 'PUT', '/dokumente/:id/leerseiten', { params: { id }, body: { sha256: sha, seiten } });
  const waehleSeite = (nr: number, weglassen: boolean, id = scan.id) => oberflaeche(lena, 'PUT', '/api/dokumente/:id/leerseiten/:nr', { params: { id, nr: String(nr) }, body: { weglassen } });
  const neueMappe = () => d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2026-0815' } }, lena.id);
  return { d, p, konten, lena, rechnung, post, scan, installiere, oberflaeche, alsPaket, markiere, waehleSeite, neueMappe, repo: r.repo };
}

describe('Leerseiten (#997): Regeln in shared/src/leerseiten.ts', () => {
  const l: Leerseiten = { paket: 'leerseiten', paketName: 'Leerseiten', sha256: 'a', seiten: 6, erkannt: [2, 4, 6], behalten: [4], weglassen: [5], geaendert: '' };
  it('wegfallend = erkannt ohne „Doch behalten“, dazu „Auch weglassen“', () => {
    assert.deepEqual(wegfallendeSeiten(l), [2, 5, 6]);
    assert.deepEqual(wegfallendeSeiten(waehle(l, 4, true, 'x')), [2, 4, 5, 6]);
    assert.deepEqual(wegfallendeSeiten(waehle(l, 5, false, 'x')), [2, 6]);
    assert.deepEqual(wegfallendeSeiten(waehle(l, 2, false, 'x')), [5, 6]);
  });
  it('neue Erkennung behält die Wahl nur für dieselbe Datei', () => {
    const gleich = neueErkennung(l, { paket: 'leerseiten', paketName: 'Leerseiten', sha256: 'a', seiten: 6, erkannt: [4, 6] }, 'y');
    assert.deepEqual([gleich.behalten, gleich.weglassen], [[4], [5]]);
    const andere = neueErkennung(l, { paket: 'leerseiten', paketName: 'Leerseiten', sha256: 'b', seiten: 6, erkannt: [4, 6] }, 'y');
    assert.deepEqual([andere.behalten, andere.weglassen], [[], []]);
  });
  it('ein Dokument fällt nie ganz weg; nur PDFs werden gekürzt', () => {
    assert.equal(wirdGekuerzt({ sha256: 'a', mime: 'application/pdf', leerseiten: l }), true);
    assert.equal(wirdGekuerzt({ sha256: 'a', mime: 'application/pdf', leerseiten: { ...l, seiten: 1, erkannt: [1], behalten: [], weglassen: [] } }), false);
    assert.equal(wirdGekuerzt({ sha256: 'a', mime: 'image/png', leerseiten: l }), false);
    assert.equal(wirdGekuerzt({ sha256: 'b', mime: 'application/pdf', leerseiten: l }), false, 'andere Datei');
  });
  it('Seitenlisten: nur ganze Zahlen im Bereich', () => {
    assert.deepEqual(pruefeSeitenliste([3, 1, 3], 4), { seiten: [1, 3] });
    assert.deepEqual(pruefeSeitenliste([0], 4), { fehler: 'seite' });
    assert.deepEqual(pruefeSeitenliste([5], 4), { fehler: 'seite' });
    assert.deepEqual(pruefeSeitenliste('2', 4), { fehler: 'liste' });
  });
});

describe('Leerseiten (#997): Paketformat und Rechte-Vorschau', () => {
  it('dms:leerseiten braucht Lesen von Post und ihren Dokumenten', () => {
    assert.deepEqual(liesCode({ sprache: 'c', rechte: { lesen: ['dms:post'], dokumente: 'lesen', schnittstellen: ['dms:leerseiten'] } }).fehler, []);
    assert.match(liesCode({ sprache: 'c', rechte: { lesen: ['dms:post'], schnittstellen: ['dms:leerseiten'] } }).fehler.join(' '), /dms:leerseiten braucht/);
    assert.match(liesCode({ sprache: 'c', rechte: { lesen: ['rechnung'], dokumente: 'lesen', schnittstellen: ['dms:leerseiten'] } }).fehler.join(' '), /dms:leerseiten braucht/);
    assert.deepEqual(liesCode({ sprache: 'c', rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:leerseiten'] } }).fehler, []);
  });
  it('Rechte-Vorschau: „Markiert leere Seiten in neuer Post – löscht nichts“; Schlüssel mit Schreibrecht', () => {
    const c = liesCode({ sprache: 'c', ereignisse: ['dokument.hochgeladen'], rechte: { lesen: ['dms:post'], dokumente: 'lesen', schnittstellen: ['dms:leerseiten'] } }).code!;
    const zeilen = rechteZeilen(rechtePunkte(c, (v) => (v === 'dms:post' ? 'Post' : v))).join('\n');
    assert.match(zeilen, /Markiert leere Seiten in neuer Post – löscht nichts.*\(dms:leerseiten\)/);
    assert.match(zeilen, /Mappen lesen: Post/);
    assert.match(zeilen, /kein Zugriff auf Netzwerk und Internet/);
    assert.equal(schluesselRecht(c), 'schreiben');
  });
  it('OpenAPI beschreibt Lesen, Markieren und Wählen', () => {
    const o = openapi(DMS_LEERSEITEN_AB) as { paths: Record<string, Record<string, unknown>> };
    assert.ok(o.paths['/dokumente/{id}/leerseiten']?.get);
    assert.ok(o.paths['/dokumente/{id}/leerseiten']?.put);
    assert.ok(o.paths['/dokumente/{id}/leerseiten/{nr}']?.put);
  });
});

for (const pg of [false, true]) {
  const wo = pg ? ' – PostgreSQL' : '';
  describe(`Leerseiten (#997): markieren, wählen, weglassen${wo}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    it('das Paket markiert – Post und Datei bleiben unverändert; Lena liest die Markierung', async () => {
      const x = await aufbau(pg, 'leer_markieren');
      const vorher = await x.d.mappen.holeMappe(x.post.id);
      const historie = (await x.d.mappenHistorie.historie(x.post.id)).length;
      const r = (await x.markiere([6, 2, 4])).body as { wegfallend: number[]; leerseiten: Leerseiten };
      assert.deepEqual(r.wegfallend, [2, 4, 6]);
      assert.equal(r.leerseiten.paketName, 'Leerseiten');
      const nachher = await x.d.mappen.holeMappe(x.post.id);
      assert.equal(nachher.mappe.geaendert, vorher.mappe.geaendert, 'kein „zuletzt geändert“');
      assert.equal((await x.d.mappenHistorie.historie(x.post.id)).length, historie, 'keine Historie');
      const dok = nachher.dokumente.find((y) => y.id === x.scan.id)!;
      assert.equal(dok.sha256, x.scan.sha256, 'Datei unverändert');
      assert.deepEqual(dok.leerseiten?.erkannt, [2, 4, 6]);
      const lesen = (await x.oberflaeche(x.lena, 'GET', '/api/dokumente/:id/leerseiten', { params: { id: x.scan.id } })).body as { wegfallend: number[]; seiten: number };
      assert.deepEqual([lesen.seiten, lesen.wegfallend], [6, [2, 4, 6]]);
    });

    it('nur Pakete mit dms:leerseiten, nur Post, nur dieselbe Datei, nur Seiten der Datei', async () => {
      const x = await aufbau(pg, 'leer_regeln');
      await assert.rejects(x.markiere([2], 'f'.repeat(64)), fehler(409, /geändert/));
      await assert.rejects(x.markiere([7]), fehler(400, /1 bis 6/));
      await assert.rejects(x.markiere('2'), fehler(400));
      // Menschen markieren nicht.
      await assert.rejects(x.oberflaeche(x.lena, 'PUT', '/api/dokumente/:id/leerseiten', { params: { id: x.scan.id }, body: { sha256: x.scan.sha256, seiten: [2] } }), fehler(403));
      // Ein Paket ohne das Recht.
      await x.installiere(paket('anderes', 'Anderes', '[]'));
      await assert.rejects(x.markiere([2], x.scan.sha256, x.scan.id, 'anderes'), fehler(403));
      await assert.rejects(x.d.postLeerseiten.markiere({ paket: { id: 'anderes', schreiben: new Set(), dokumente: 'lesen', schnittstellen: [] } } as never, x.scan.id, { sha256: x.scan.sha256, seiten: [2] }), fehler(403, /dms:leerseiten/));
      // Ein Dokument in einer Mappe: Lena darf es lesen, aber es ist keine Post.
      const m = await x.neueMappe();
      const beleg = (await x.d.dokumente.ladeHoch(m.id, { register: 'belege', name: 'beleg.pdf', typ: 'application/pdf' }, await pdf([200, 201]), x.lena.id)).dokument;
      await assert.rejects(x.oberflaeche(x.lena, 'GET', '/api/dokumente/:id/leerseiten', { params: { id: beleg.id } }), fehler(409, /nur an Dokumenten in Post/));
      // Das Paket sieht nur Post: Die Rechnung ist für es nicht da.
      await assert.rejects(x.markiere([2], beleg.sha256, beleg.id), (e: unknown) => e instanceof Fachfehler && (e.status === 404 || e.status === 403));
    });

    it('„Doch behalten“ und „Auch weglassen“: nur Menschen; die Wahl bleibt bei neuer Erkennung derselben Datei', async () => {
      const x = await aufbau(pg, 'leer_wahl');
      await x.markiere([2, 4, 6]);
      await x.waehleSeite(4, false);
      const r = (await x.waehleSeite(5, true)).body as { wegfallend: number[] };
      assert.deepEqual(r.wegfallend, [2, 5, 6]);
      await x.markiere([2, 4, 6]);
      assert.deepEqual(((await x.oberflaeche(x.lena, 'GET', '/api/dokumente/:id/leerseiten', { params: { id: x.scan.id } })).body as { wegfallend: number[] }).wegfallend, [2, 5, 6]);
      await assert.rejects(x.alsPaket('leerseiten', 'PUT', '/dokumente/:id/leerseiten/:nr', { params: { id: x.scan.id, nr: '3' }, body: { weglassen: true } }), fehler(403));
      await assert.rejects(x.waehleSeite(9, true), fehler(404));
      // Ohne Markierung eines Pakets geht die Wahl auch (z. B. über die Schnittstelle).
      const p2 = await x.d.post.legePostAn({ betreff: 'Zweiter Brief' }, { id: x.lena.id, name: 'Lena' });
      const s2 = (await x.d.dokumente.ladeHoch(p2.id, { register: 'dokumente', name: 'zwei.pdf', typ: 'application/pdf' }, await pdf([301, 302]), x.lena.id)).dokument;
      assert.deepEqual(((await x.waehleSeite(2, true, s2.id)).body as { wegfallend: number[]; leerseiten: Leerseiten }).leerseiten.paket, null);
    });

    it('Übernehmen: neue Fassung ohne die Seiten, Original als frühere Version, Historie, Texterkennung neu', async () => {
      const x = await aufbau(pg, 'leer_uebernehmen');
      await x.markiere([2, 4, 6]);
      await x.waehleSeite(4, false);
      const ziel = await x.neueMappe();
      const r = await x.d.post.ordneZu(x.post.id, { ziel: ziel.id, register: 'belege', aufloesen: true }, x.lena.id);
      assert.equal(r.aufgeloest, true);
      assert.equal((r as { leerseiten?: number }).leerseiten, 2);
      const dok = (await x.d.mappen.holeMappe(ziel.id)).dokumente.find((y) => y.id === x.scan.id)!;
      assert.equal(dok.version, 2);
      assert.notEqual(dok.sha256, x.scan.sha256);
      assert.equal(dok.leerseiten ?? null, null, 'Markierung ist weg');
      assert.deepEqual(await breitenVon(await x.d.kern.liesGanz(dok.sha256)), [101, 103, 104, 105]);
      const v = await x.d.dokumentVersionen.versionen(x.scan.id);
      assert.deepEqual(v.aeltere.map((y) => [y.nummer, y.sha256]), [[1, x.scan.sha256]], 'das Original bleibt als frühere Version – auch ohne Versionierung');
      const h = await x.d.mappenHistorie.historie(ziel.id);
      assert.ok(h.some((y) => y.art === 'pdf_bearbeitet' && /2 leere Seiten entfernt/.test(String(y.daten.text))), 'Historie „2 leere Seiten entfernt“');
      assert.ok(['wartet', 'laeuft', 'fertig', 'keiner'].includes(dok.ocr?.stand ?? ''));
      assert.equal(dok.ocr?.stand === 'fertig' && dok.ocr.zeit && dok.ocr.zeit < dok.erstellt, false, 'kein alter Volltext auf der neuen Fassung');
    });

    it('Zuordnen in eine bestehende Mappe, mit Kopie und mit „alle behalten“', async () => {
      const x = await aufbau(pg, 'leer_zuordnen');
      await x.markiere([2, 4, 6]);
      const ziel = await x.neueMappe();
      // Kopie: die Post behält ihr Dokument samt Markierung, die Kopie in der Mappe hat die Seiten nicht.
      const k = await x.d.post.ordneZu(x.post.id, { ziel: ziel.id, register: 'belege', kopieren: true }, x.lena.id);
      assert.equal((k as { leerseiten?: number }).leerseiten, 3);
      const inPost = (await x.d.mappen.holeMappe(x.post.id)).dokumente.find((y) => y.id === x.scan.id)!;
      assert.equal(inPost.sha256, x.scan.sha256);
      assert.deepEqual(inPost.leerseiten?.erkannt, [2, 4, 6]);
      const kopie = (await x.d.mappen.holeMappe(ziel.id)).dokumente[0];
      assert.deepEqual(await breitenVon(await x.d.kern.liesGanz(kopie.sha256)), [101, 103, 105]);
      // „Alle behalten“: das Dokument wandert unverändert.
      const ziel2 = await x.neueMappe();
      const b = await x.d.post.ordneZu(x.post.id, { ziel: ziel2.id, register: 'belege', leerseiten: 'behalten' }, x.lena.id);
      assert.equal((b as { leerseiten?: number }).leerseiten, undefined);
      const dok = (await x.d.mappen.holeMappe(ziel2.id)).dokumente.find((y) => y.id === x.scan.id)!;
      assert.equal(dok.sha256, x.scan.sha256);
      assert.equal(dok.version, 1);
    });

    it('ohne Übernehmen wird nichts gelöscht; automatisch zugeordnet bleibt alles; ganz leer bleibt es, wie es ist', async () => {
      const x = await aufbau(pg, 'leer_nichts');
      await x.markiere([2, 4, 6]);
      await x.d.mappen.aendereMappe(x.post.id, { werte: { stand: POST_STAND.erledigt } }, x.lena.id);
      assert.deepEqual(await breitenVon(await x.d.kern.liesGanz((await x.repo.holeDokument(x.scan.id))!.sha256)), [101, 102, 103, 104, 105, 106]);
      // Automatisch (#337): niemand hat hingesehen – keine Seite fällt weg.
      const ziel = await x.neueMappe();
      await x.d.post.ordneZu(x.post.id, { ziel: ziel.id, register: 'belege' }, null, undefined, { grund: 'Test' });
      const auto = (await x.repo.holeDokument(x.scan.id))!;
      assert.equal(auto.sha256, x.scan.sha256);
      assert.equal(auto.version, 1);
      // Alle Seiten markiert: Das Dokument fällt nicht ganz weg.
      const p2 = await x.d.post.legePostAn({ betreff: 'Leerer Scan' }, { id: x.lena.id, name: 'Lena' });
      const leer = (await x.d.dokumente.ladeHoch(p2.id, { register: 'dokumente', name: 'leer.pdf', typ: 'application/pdf' }, await pdf([401, 402]), x.lena.id)).dokument;
      await x.markiere([1, 2], leer.sha256, leer.id);
      const ziel2 = await x.neueMappe();
      const r = await x.d.post.ordneZu(p2.id, { ziel: ziel2.id, register: 'belege', aufloesen: true }, x.lena.id);
      assert.equal((r as { leerseiten?: number }).leerseiten, undefined);
      assert.equal((await x.repo.holeDokument(leer.id))!.sha256, leer.sha256);
    });

    it('eine neue Fassung in der Post (PDF bearbeiten) setzt die Markierung zurück', async () => {
      const x = await aufbau(pg, 'leer_fassung');
      await x.markiere([2]);
      await x.d.pdfBearbeiten.bearbeitePdf(x.scan.id, { seiten: [{ nr: 2 }, { nr: 1 }, { nr: 3 }, { nr: 4 }, { nr: 5 }, { nr: 6 }], bestaetigt: true }, x.lena.id);
      const nach = (await x.d.mappen.holeMappe(x.post.id)).dokumente[0];
      const stand = (await x.oberflaeche(x.lena, 'GET', '/api/dokumente/:id/leerseiten', { params: { id: nach.id } })).body as { leerseiten: Leerseiten | null };
      assert.equal(stand.leerseiten, null);
    });
  });
}
