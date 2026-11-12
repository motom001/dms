/**
 * Anlagen (#998): Datenmodell (Reihenfolge, Name, genau ein Hauptdokument), „Als Anlage an … hängen“ und „Zum eigenen
 * Dokument machen“ mit Historie, Wandern mit dem Hauptdokument (Post → Mappe, Kopie, abtrennen, Papierkorb,
 * Wiederherstellen, Ersetzen), Rechte wie beim Hauptdokument, „mit Anlagen?“ über die Prüfstelle (#723), die neue
 * Paket-Fähigkeit dms:anlagen beim Teilen einer Post (Trennblatt, dms-registry #152), Erkennung/Klassifizieren/KI nur
 * mit Hauptdokumenten (#939, auch mit der KI-Typen-Sperre #796), Volltext „in Anlage n“, Vollexport. Namen und Inhalte
 * sind erfunden. Der Kern läuft im Arbeitsspeicher und – mit TEST_DATABASE_URL – gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { after, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { anlageName, anlagenVon, anlageVermerk, DMS_ANLAGEN_AB, gruppiere, laufwerkName, mitAnlagen, nurHauptdokumente, zumVerschieben } from '../../shared/src/anlagen';
import { HILFE } from '../../shared/src/hilfe';
import { POST_STAND, type Dokument } from '../../shared/src/model';
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
import type { Mailer } from '../src/mail';
import { liesZip, Paketverwaltung } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { vollexport } from '../src/vollexport';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';
import { wieImModus } from './hilfen';

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
const alsPuffer = async (x: Buffer | Readable) => (Buffer.isBuffer(x) ? x : Buffer.concat(await x.toArray() as Buffer[]));

/** PDF mit einer Seite je Breite – an der Breite erkennt der Test, welche Seiten wohin kamen. */
async function pdf(breiten: number[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const b of breiten) doc.addPage([b, 400]);
  return Buffer.from(await doc.save());
}
const breitenVon = async (inhalt: Buffer) => (await PDFDocument.load(inhalt)).getPages().map((p) => Math.round(p.getWidth()));

/* ---------- Paket „Trennblatt“ (mit zweitem Barcode) als Archiv ---------- */
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const archiv = (d: Record<string, string | Buffer>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const paket = (id: string, schnittstellen: string) => ({
  'manifest.yaml': `schema: 1\nid: ${id}\nname: ${id}\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=${DMS_ANLAGEN_AB}"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  ereignisse: [dokument.hochgeladen]\n  rechte:\n    lesen: [dms:post]\n    schreiben: [dms:post]\n    dokumente: schreiben\n    schnittstellen: ${schnittstellen}\n  netz: []\n`,
  'code/modul.wasm': WASM,
});
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };

/** Dokument-Stub für die reinen Funktionen. */
const dok = (id: string, name: string, anlageZu?: string, anlageNr?: number) => ({ id, name, ...(anlageZu ? { anlageZu, anlageNr } : {}) });

describe('Anlagen (#998): Regeln in shared/src/anlagen.ts', () => {
  const liste = [dok('r', 'Werkstattrechnung.pdf'), dok('a2', 'Arbeiten.pdf', 'r', 2), dok('x', 'Brief.pdf'), dok('a1', 'HU-Protokoll.pdf', 'r', 1), dok('a3', 'Teile.pdf', 'r', 3)];
  it('Anlagen in ihrer Reihenfolge unter dem Hauptdokument; ohne Hauptdokument eigene Zeile', () => {
    assert.deepEqual(anlagenVon(liste, 'r').map((x) => x.id), ['a1', 'a2', 'a3']);
    assert.deepEqual(gruppiere(liste).map((g) => [g.haupt.id, g.anlagen.map((a) => a.id)]), [['r', ['a1', 'a2', 'a3']], ['x', []]]);
    assert.deepEqual(gruppiere(liste.filter((x) => x.id !== 'r')).map((g) => g.haupt.id), ['a2', 'x', 'a1', 'a3'], 'nie verloren');
    assert.deepEqual(nurHauptdokumente(liste).map((x) => x.id), ['r', 'x']);
  });
  it('mit Anlagen (Vorgabe ja) und ohne; verschieben nur Hauptdokumente, Anlage allein erkannt', () => {
    assert.deepEqual(mitAnlagen([liste[0]], liste).map((x) => x.id), ['r', 'a1', 'a2', 'a3']);
    assert.deepEqual(mitAnlagen([liste[0]], liste, false).map((x) => x.id), ['r']);
    assert.deepEqual(mitAnlagen([liste[0], liste[3]], liste).map((x) => x.id), ['r', 'a1', 'a2', 'a3'], 'jedes einmal');
    assert.deepEqual(zumVerschieben([liste[0], liste[3]]), { bewegen: [liste[0]], allein: [] });
    assert.deepEqual(zumVerschieben([liste[2], liste[3]]).allein.map((x) => x.id), ['a1']);
  });
  it('Vorgabe-Name „<Name> – Anlage n“ mit der Endung der Anlage; im Laufwerk mit Namenszusatz', () => {
    assert.equal(anlageName('Werkstattrechnung.pdf', 1), 'Werkstattrechnung – Anlage 1.pdf');
    assert.equal(anlageName('Werkstattrechnung.pdf', 2, 'foto.jpg'), 'Werkstattrechnung – Anlage 2.jpg');
    assert.equal(laufwerkName('Werkstattrechnung.pdf', dok('a', 'Werkstattrechnung – Anlage 1.pdf', 'r', 1)), 'Werkstattrechnung – Anlage 1.pdf');
    assert.equal(laufwerkName('Werkstattrechnung.pdf', dok('a', 'HU-Protokoll.pdf', 'r', 2)), 'Werkstattrechnung – Anlage 2 – HU-Protokoll.pdf');
    assert.equal(anlageVermerk(2), 'in Anlage 2');
  });
});

describe('Anlagen (#998): Paket-Fähigkeit dms:anlagen', () => {
  it('braucht Post lesen und schreiben und Dokumente schreiben', () => {
    const c = (rechte: Record<string, unknown>) => liesCode({ sprache: 'c', rechte: { schnittstellen: ['dms:anlagen'], ...rechte } }).fehler;
    assert.deepEqual(c({ lesen: ['dms:post'], schreiben: ['dms:post'], dokumente: 'schreiben' }), []);
    assert.deepEqual(c({ lesen: ['*'], schreiben: ['*'], dokumente: 'schreiben' }), []);
    for (const r of [{ lesen: ['dms:post'], schreiben: ['dms:post'], dokumente: 'lesen' }, { lesen: ['dms:post'], dokumente: 'schreiben' }, {}]) assert.match(c(r).join(' '), /dms:anlagen braucht/, JSON.stringify(r));
  });
  it('Rechte-Vorschau nennt die Fähigkeit mit Handbuch-Stelle; Schlüssel mit Schreibrecht', () => {
    const code = liesCode({ sprache: 'c', rechte: { lesen: ['dms:post'], schreiben: ['dms:post'], dokumente: 'schreiben', schnittstellen: ['dms:anlagen'] } }).code!;
    const p = rechtePunkte(code, (v) => v).find((x) => x.text.includes('(dms:anlagen)'))!;
    assert.match(p.text, /Legt beim Teilen einer Post Anlagen an – nur in den Posts, die dabei entstehen/);
    assert.equal(p.hilfe, 'pakete.recht.anlagen');
    assert.ok(HILFE['pakete.recht.anlagen'] && HILFE['dokumente.anlagen']);
    assert.ok(rechteZeilen(rechtePunkte(code, (v) => v)).some((z) => z.includes('dms:anlagen')));
    assert.equal(schluesselRecht(code), 'schreiben');
  });
  it('OpenAPI: Anlagen lesen, anhängen, umsortieren, umbenennen, lösen; Teilen mit anlagen; Felder am Dokument', () => {
    const o = openapi('0.0.0') as { paths: Record<string, Record<string, unknown>>; components: { schemas: Record<string, { properties: Record<string, unknown> }> } };
    assert.ok(o.paths['/dokumente/{id}/anlagen'].get && o.paths['/dokumente/{id}/anlagen'].post && o.paths['/dokumente/{id}/anlagen'].put);
    assert.ok(o.paths['/dokumente/{id}/anlagen/{anlage}'].put && o.paths['/dokumente/{id}/anlagen/{anlage}'].delete);
    assert.ok(o.components.schemas.SeitenBearbeiten.properties.anlagen);
    assert.ok(o.components.schemas.Dokument.properties.anlageZu && o.components.schemas.Dokument.properties.anlageNr);
    assert.ok(o.components.schemas.EmailEingabe.properties.mitAnlagen && o.components.schemas.EmailMehrere.properties.mitAnlagen);
  });
});

async function aufbau(pg: boolean, name: string) {
  const r = pg ? await pgRepos(name) : { repo: speicherRepo(), konto: speicherKontoRepo() };
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(r.konto, () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id)).benutzer;
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const p = new Paketverwaltung(d, { version: () => DMS_ANLAGEN_AB, abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
  const installiere = async (dateien: Record<string, string | Buffer>) => { const h = await p.hochladen(archiv(dateien), ICH); return p.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true }, ICH); };
  await installiere(paket('trennblatt', '[dms:anlagen]'));
  await installiere(paket('ohneanlagen', '[]'));
  const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
  const tabelle = routen(d, konten, { apiSchluessel: schluessel });
  const route = (m: string, pfad: string) => { const x = tabelle.find((y) => y.methode === m && y.pfad === pfad); assert.ok(x, `${m} ${pfad}`); return x!; };
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const oberflaeche = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}) => route(m, pfad).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus(await ich(b.id)) } as Anfrage);
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
  const werkstatt = await d.mappentypen.legeTypAn({ name: 'Werkstatt', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'belege', name: 'Belege', art: 'dokumente', volltext: true, versionierung: true },
    { key: 'fotos', name: 'Fotos', art: 'dokumente' },
  ] } as never);
  // Werkstatt-Post: Hauptdokument und drei Anlagen (von Hand) plus ein eigener Brief.
  const post = await d.post.legePostAn({ betreff: 'Werkstatt Petra' }, { id: lena.id, name: 'Lena' });
  const lade = async (mappe: string, name: string, b: number[], register = 'dokumente') => (await d.dokumente.ladeHoch(mappe, { register, name, typ: 'application/pdf' }, await pdf(b), lena.id)).dokument;
  const rechnung = await lade(post.id, 'Werkstattrechnung.pdf', [201]);
  const hu = await lade(post.id, 'HU-Protokoll.pdf', [202, 203]);
  const arbeiten = await lade(post.id, 'Arbeiten.pdf', [204]);
  const teile = await lade(post.id, 'Teilebestellung.pdf', [205]);
  const brief = await lade(post.id, 'Brief.pdf', [206]);
  const haenge = (haupt: string, dokument: string, name?: string) => d.dokumentAnlagen.haengeAn(haupt, { dokument, ...(name ? { name } : {}) }, lena.id);
  const neueMappe = () => d.mappen.legeMappeAn({ typId: werkstatt.id, werte: { nr: 'W-2026-0815' } }, lena.id);
  return { d, konten, lena, jonas, werkstatt, post, rechnung, hu, arbeiten, teile, brief, haenge, lade, neueMappe, oberflaeche, alsPaket, repo: r.repo };
}
type Aufbau = Awaited<ReturnType<typeof aufbau>>;
const mitDrei = async (x: Aufbau) => { await x.haenge(x.rechnung.id, x.hu.id); await x.haenge(x.rechnung.id, x.arbeiten.id); return x.haenge(x.rechnung.id, x.teile.id); };

for (const pg of [false, true]) {
  const wo = pg ? ' (PostgreSQL)' : '';
  let nr = 0;
  const neu = () => aufbau(pg, `dmstest_x998_${++nr}`);
  describe(`Anlagen (#998): Datenmodell und von Hand${wo}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    it('„Als Anlage an … hängen“: Reihenfolge, Name bleibt (oder neu), Historie, lesen auch über die Anlage', async () => {
      const x = await neu();
      const s = await mitDrei(x);
      assert.deepEqual(s.anlagen.map((a) => [a.name, a.anlageNr, a.anlageZu]), [['HU-Protokoll.pdf', 1, x.rechnung.id], ['Arbeiten.pdf', 2, x.rechnung.id], ['Teilebestellung.pdf', 3, x.rechnung.id]]);
      assert.equal(s.dokument.anlageZu, undefined);
      assert.deepEqual((await x.d.dokumentAnlagen.liste(x.arbeiten.id)).anlagen.map((a) => a.id), [x.hu.id, x.arbeiten.id, x.teile.id], 'über eine Anlage: ihr Hauptdokument');
      const h = await x.repo.historie(x.post.id, { arten: ['anlage'] });
      assert.equal(h.length, 3);
      assert.ok(h.some((e) => /„HU-Protokoll\.pdf“ als Anlage 1 an „Werkstattrechnung\.pdf“ gehängt/.test(String(e.daten?.text))));
      // Umbenennen: die Vorgabe ist nur ein Vorschlag.
      const b = await x.d.dokumentAnlagen.benenne(x.rechnung.id, x.hu.id, { name: 'HU und AU-Protokoll.pdf' }, x.lena.id);
      assert.equal(b.anlagen[0].name, 'HU und AU-Protokoll.pdf');
      assert.equal((await x.repo.holeDokument(x.hu.id))!.name, 'HU und AU-Protokoll.pdf');
      await assert.rejects(x.d.dokumentAnlagen.benenne(x.rechnung.id, x.hu.id, { name: ' ' }, x.lena.id), fehler(422));
    });

    it('Regeln: nur dieselbe Mappe, keine Anlage an einer Anlage, nicht an sich selbst; Anlagen eines Dokuments kommen mit', async () => {
      const x = await neu();
      await x.haenge(x.rechnung.id, x.hu.id);
      await assert.rejects(x.haenge(x.hu.id, x.arbeiten.id), fehler(409, /selbst eine Anlage/));
      await assert.rejects(x.haenge(x.rechnung.id, x.rechnung.id), fehler(422));
      await assert.rejects(x.haenge(x.rechnung.id, x.hu.id), fehler(409, /schon eine Anlage/));
      const m = await x.neueMappe();
      const fremd = await x.lade(m.id, 'Fremd.pdf', [300], 'belege');
      await assert.rejects(x.haenge(x.rechnung.id, fremd.id), fehler(422, /nur innerhalb einer Mappe/));
      // Brief mit eigener Anlage an die Rechnung: seine Anlage kommt gleich dahinter mit.
      await x.haenge(x.brief.id, x.teile.id);
      const s = await x.haenge(x.rechnung.id, x.brief.id);
      assert.deepEqual(s.anlagen.map((a) => [a.id, a.anlageNr]), [[x.hu.id, 1], [x.brief.id, 2], [x.teile.id, 3]]);
      assert.deepEqual((await x.repo.anlagenVon(x.brief.id)).length, 0);
      // Wechsel zu einem anderen Hauptdokument: die alten rücken auf.
      await x.haenge(x.arbeiten.id, x.brief.id);
      assert.deepEqual((await x.repo.anlagenVon(x.rechnung.id)).map((a) => [a.id, a.anlageNr]), [[x.hu.id, 1], [x.teile.id, 2]]);
    });

    it('„Zum eigenen Dokument machen“, umsortieren; das Register folgt dem Hauptdokument', async () => {
      const x = await neu();
      await mitDrei(x);
      let s = await x.d.dokumentAnlagen.sortiere(x.rechnung.id, { reihenfolge: [x.teile.id, x.hu.id, x.arbeiten.id] }, x.lena.id);
      assert.deepEqual(s.anlagen.map((a) => [a.id, a.anlageNr]), [[x.teile.id, 1], [x.hu.id, 2], [x.arbeiten.id, 3]]);
      await assert.rejects(x.d.dokumentAnlagen.sortiere(x.rechnung.id, { reihenfolge: [x.hu.id] }, x.lena.id), fehler(422));
      s = await x.d.dokumentAnlagen.loese(x.rechnung.id, x.hu.id, x.lena.id);
      assert.deepEqual(s.anlagen.map((a) => [a.id, a.anlageNr]), [[x.teile.id, 1], [x.arbeiten.id, 2]]);
      const hu = (await x.repo.holeDokument(x.hu.id))!;
      assert.equal(hu.anlageZu, undefined);
      assert.equal(hu.mappeId, x.post.id);
      await assert.rejects(x.d.dokumentAnlagen.loese(x.rechnung.id, x.hu.id, x.lena.id), fehler(404));
      assert.ok((await x.repo.historie(x.post.id, { arten: ['anlage'] })).some((e) => /eigenes Dokument/.test(String(e.daten?.text))));
    });

    it('Post → Mappe: Anlagen wandern mit; eine Anlage allein nicht; Kopie hängt an der Kopie', async () => {
      const x = await neu();
      await mitDrei(x);
      await assert.rejects(x.d.post.ordneZu(x.post.id, { ziel: (await x.neueMappe()).id, register: 'belege', dokumente: [x.hu.id] }, x.lena.id), fehler(422, /geht nur mit ihrem Hauptdokument/));
      // Kopie in der Post behalten: die Kopien hängen an der Kopie.
      const k = await x.neueMappe();
      await x.d.post.ordneZu(x.post.id, { ziel: k.id, register: 'belege', dokumente: [x.rechnung.id], kopieren: true }, x.lena.id);
      const kd = await x.repo.listeDokumente(k.id);
      const kh = kd.find((y) => !y.anlageZu)!;
      assert.equal(kd.length, 4);
      assert.deepEqual(anlagenVon(kd, kh.id).map((a) => [a.name, a.anlageNr]), [['HU-Protokoll.pdf', 1], ['Arbeiten.pdf', 2], ['Teilebestellung.pdf', 3]]);
      assert.equal((await x.repo.anlagenVon(x.rechnung.id)).length, 3, 'die Post behält ihre');
      // Übernehmen: die Rechnung mit Anlagen in die Mappe, der Brief bleibt (abgetrennt in neuer Post).
      const m = await x.neueMappe();
      const r = await x.d.post.ordneZu(x.post.id, { ziel: m.id, register: 'belege', dokumente: [x.rechnung.id], aufloesen: true }, x.lena.id);
      assert.equal(r.aufgeloest, true);
      const inMappe = await x.repo.listeDokumente(m.id);
      assert.deepEqual(inMappe.map((y) => y.registerKey), ['belege', 'belege', 'belege', 'belege']);
      assert.deepEqual((await x.repo.anlagenVon(x.rechnung.id)).map((a) => a.mappeId), [m.id, m.id, m.id]);
      const abgetrennt = 'abgetrennt' in r ? r.abgetrennt! : null;
      assert.deepEqual((await x.repo.listeDokumente(abgetrennt!.id)).map((y) => y.id), [x.brief.id]);
      // Volltext (#45): das Register will ihn – auch für die Anlagen.
      assert.ok(inMappe.every((y) => y.ocr?.stand === 'wartet'), JSON.stringify(inMappe.map((y) => y.ocr)));
    });

    it('Ab hier abtrennen: Anlagen gehen mit dem Hauptdokument in die neue Post', async () => {
      const x = await neu();
      await mitDrei(x);
      await assert.rejects(x.d.postAufloesen.trennePostAb(x.post.id, { dokumente: [x.arbeiten.id] }, x.lena.id), fehler(422, /Hauptdokument/));
      const r = await x.d.postAufloesen.trennePostAb(x.post.id, { dokumente: [x.rechnung.id] }, x.lena.id);
      assert.deepEqual((await x.repo.listeDokumente(r.neu.id)).map((y) => y.id).sort(), [x.rechnung.id, x.hu.id, x.arbeiten.id, x.teile.id].sort());
      assert.equal((await x.repo.anlagenVon(x.rechnung.id)).length, 3);
      assert.deepEqual((await x.repo.listeDokumente(x.post.id)).map((y) => y.id), [x.brief.id]);
    });

    it('Papierkorb: das Hauptdokument nimmt seine Anlagen mit und bringt sie zurück; eine Anlage allein kommt an ihr Hauptdokument zurück', async () => {
      const x = await neu();
      await mitDrei(x);
      await x.d.dokumente.loescheDokument(x.teile.id, x.lena.id, { weg: 'dokument' });
      assert.deepEqual((await x.repo.anlagenVon(x.rechnung.id)).map((a) => a.id), [x.hu.id, x.arbeiten.id]);
      await x.d.papierkorbVerwaltung.stelleDokumentWiederHer(x.teile.id, { id: x.lena.id, rolle: 'admin' }, undefined);
      assert.deepEqual((await x.repo.anlagenVon(x.rechnung.id)).map((a) => [a.id, a.anlageNr]), [[x.hu.id, 1], [x.arbeiten.id, 2], [x.teile.id, 3]]);
      await x.d.dokumente.loescheDokument(x.rechnung.id, x.lena.id, { weg: 'dokument' });
      assert.deepEqual((await x.repo.listeDokumente(x.post.id)).map((y) => y.id), [x.brief.id], 'alle vier im Papierkorb');
      assert.equal((await x.repo.papierkorbDokumente()).filter((k) => k.anlageZu === x.rechnung.id).length, 3);
      await x.d.papierkorbVerwaltung.stelleDokumentWiederHer(x.rechnung.id, { id: x.lena.id, rolle: 'admin' }, undefined);
      assert.deepEqual((await x.repo.anlagenVon(x.rechnung.id)).map((a) => [a.id, a.anlageNr]), [[x.hu.id, 1], [x.arbeiten.id, 2], [x.teile.id, 3]]);
      assert.equal((await x.repo.papierkorbDokumente()).length, 0);
      // Anlage allein in den Papierkorb, dann das Hauptdokument endgültig weg: die Anlage kommt als eigenes Dokument zurück.
      await x.d.dokumente.loescheDokument(x.hu.id, x.lena.id, { weg: 'dokument' });
      await x.d.dokumente.loescheDokument(x.rechnung.id, x.lena.id, { weg: 'dokument' });
      await x.d.papierkorbVerwaltung.loescheDokumentEndgueltig([x.rechnung.id, x.arbeiten.id, x.teile.id], { id: x.lena.id, rolle: 'admin' }, true);
      await x.d.papierkorbVerwaltung.stelleDokumentWiederHer(x.hu.id, { id: x.lena.id, rolle: 'admin' }, undefined);
      assert.equal((await x.repo.holeDokument(x.hu.id))!.anlageZu, undefined);
    });

    it('Mappe in den Papierkorb und zurück: Zuordnung bleibt; Versionen hat jede Anlage selbst', async () => {
      const x = await neu();
      await mitDrei(x);
      const m = await x.neueMappe();
      await x.d.post.ordneZu(x.post.id, { ziel: m.id, register: 'belege', dokumente: [x.rechnung.id] }, x.lena.id);
      await x.d.dokumentVersionen.ersetzeDokument(x.hu.id, { name: 'HU-Protokoll.pdf' }, await pdf([210]), x.lena.id);
      const hu = (await x.repo.holeDokument(x.hu.id))!;
      assert.equal(hu.version, 2); assert.equal(hu.anlageZu, x.rechnung.id);
      await x.d.loeschen.loescheMappe(m.id, x.lena.id);
      await x.d.papierkorbVerwaltung.stelleWiederHer(m.id, { id: x.lena.id, rolle: 'admin' }, true);
      assert.deepEqual((await x.repo.anlagenVon(x.rechnung.id)).map((a) => [a.id, a.anlageNr]), [[x.hu.id, 1], [x.arbeiten.id, 2], [x.teile.id, 3]]);
    });

    it('Ersetzen ohne Versionierung (Seiten bearbeiten): die Anlagen hängen am neuen Dokument', async () => {
      const x = await neu();
      await mitDrei(x);
      const r = await x.d.pdfBearbeiten.bearbeitePdf(x.hu.id, { seiten: [{ nr: 2 }], bestaetigt: true }, x.lena.id);
      const neuHu = r.dokumente[0];
      assert.equal(neuHu.id === x.hu.id, false);
      assert.deepEqual((await x.repo.anlagenVon(x.rechnung.id)).map((a) => a.id), [neuHu.id, x.arbeiten.id, x.teile.id], 'bleibt Anlage 1');
      const r2 = await x.d.pdfBearbeiten.bearbeitePdf(x.rechnung.id, { seiten: [{ nr: 1, drehung: 90 }], bestaetigt: true }, x.lena.id);
      assert.equal((await x.repo.anlagenVon(r2.dokumente[0].id)).length, 3, 'Anlagen am neuen Hauptdokument');
    });

    it('Rechte wie beim Hauptdokument: lesen mit R, ändern mit U; Pakete nur mit dms:anlagen und nur in Post', async () => {
      const x = await neu();
      await x.d.berechtigungen.setzeBerechtigungen(x.post.typId, { grund: { C: true, R: true, U: false, D: false, P: true }, regeln: [{ id: 'l', name: 'Lena', wenn: [{ art: 'benutzer', benutzer: [x.lena.id] }], dann: { U: 'erteilen', D: 'erteilen' }, stopp: false }] }, true);
      await x.oberflaeche(x.lena, 'POST', '/api/dokumente/:id/anlagen', { params: { id: x.rechnung.id }, body: { dokument: x.hu.id } });
      const gelesen = await x.oberflaeche(x.jonas, 'GET', '/api/dokumente/:id/anlagen', { params: { id: x.hu.id } }) as { body: { anlagen: Dokument[] } };
      assert.equal(gelesen.body.anlagen.length, 1);
      await assert.rejects(x.oberflaeche(x.jonas, 'POST', '/api/dokumente/:id/anlagen', { params: { id: x.rechnung.id }, body: { dokument: x.arbeiten.id } }), fehler(403));
      await assert.rejects(x.oberflaeche(x.jonas, 'DELETE', '/api/dokumente/:id/anlagen/:anlage', { params: { id: x.rechnung.id, anlage: x.hu.id } }), fehler(403));
      // Pakete: ohne dms:anlagen nichts; mit nur in Post.
      await assert.rejects(x.alsPaket('ohneanlagen', 'POST', '/dokumente/:id/anlagen', { params: { id: x.rechnung.id }, body: { dokument: x.arbeiten.id } }), fehler(403, /dms:anlagen/));
      await x.alsPaket('trennblatt', 'POST', '/dokumente/:id/anlagen', { params: { id: x.rechnung.id }, body: { dokument: x.arbeiten.id } });
      assert.equal((await x.repo.anlagenVon(x.rechnung.id)).length, 2);
    });
  });

  describe(`Anlagen (#998): Teilen einer Post mit Anlagen (Paket-Läufer, Trennblatt)${wo}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    it('Werkstatt: ein Hauptdokument und Anlage 1–3 in der neuen Post; die Ausgangspost behält ihr Original', async () => {
      const x = await neu();
      const scan = await x.lade(x.post.id, 'scan.pdf', [101, 102, 103, 104, 105]);
      const r = await x.alsPaket('trennblatt', 'POST', '/dokumente/:id/seiten', { params: { id: scan.id }, body: { seiten: [1, 2, 3, 4, 5].map((nr) => ({ nr })), teile: [0], anlagen: [1, 3, 4] } }) as { body: { dokumente: Dokument[]; posten: Array<{ id: string; werte: Record<string, unknown> }> } };
      assert.equal(r.body.posten.length, 1);
      const neuPost = r.body.posten[0];
      assert.equal(neuPost.werte.betreff, 'Werkstatt Petra', 'ein Teil: Betreff bleibt');
      const doks = await x.repo.listeDokumente(neuPost.id);
      const haupt = doks.find((y) => !y.anlageZu)!;
      assert.equal(haupt.name, 'scan.pdf');
      const anl = anlagenVon(doks, haupt.id);
      assert.deepEqual(anl.map((a) => [a.name, a.anlageNr]), [['scan – Anlage 1.pdf', 1], ['scan – Anlage 2.pdf', 2], ['scan – Anlage 3.pdf', 3]]);
      const seiten = async (y: Dokument) => breitenVon(await alsPuffer(await x.d.kern.dateien.lies(y.sha256)));
      assert.deepEqual(await seiten(haupt), [101]);
      assert.deepEqual(await Promise.all(anl.map(seiten)), [[102, 103], [104], [105]]);
      const quelle = (await x.repo.holeMappe(x.post.id))!;
      assert.equal(quelle.werte.stand, POST_STAND.erledigt);
      assert.ok((await x.repo.holeDokument(scan.id)), 'Original bleibt');
    });

    it('zwei Dokumente mit je Anlagen: Anlagen nur im eigenen Teil', async () => {
      const x = await neu();
      const scan = await x.lade(x.post.id, 'scan.pdf', [101, 102, 103, 104, 105]);
      const r = await x.alsPaket('trennblatt', 'POST', '/dokumente/:id/seiten', { params: { id: scan.id }, body: { seiten: [1, 2, 3, 4, 5].map((nr) => ({ nr })), teile: [0, 2], anlagen: [1, 3, 4] } }) as { body: { posten: Array<{ id: string }> } };
      const [a, b] = await Promise.all(r.body.posten.map((p) => x.repo.listeDokumente(p.id)));
      assert.deepEqual([a.length, b.length], [2, 3]);
      assert.equal(a.filter((y) => y.anlageZu).length, 1);
      assert.equal(b.filter((y) => y.anlageZu).length, 2);
      assert.ok([...a, ...b].every((y) => !y.anlageZu || [...a, ...b].find((h) => h.id === y.anlageZu)!.mappeId === y.mappeId));
    });

    it('ohne dms:anlagen 403, nie am Anfang eines Teils, nur in Post', async () => {
      const x = await neu();
      const scan = await x.lade(x.post.id, 'scan.pdf', [101, 102, 103]);
      const body = (anlagen: number[], teile = [0]) => ({ params: { id: scan.id }, body: { seiten: [1, 2, 3].map((nr) => ({ nr })), teile, anlagen } });
      await assert.rejects(x.alsPaket('ohneanlagen', 'POST', '/dokumente/:id/seiten', body([1])), fehler(403, /dms:anlagen/));
      await assert.rejects(x.alsPaket('trennblatt', 'POST', '/dokumente/:id/seiten', body([0])), fehler(422));
      await assert.rejects(x.alsPaket('trennblatt', 'POST', '/dokumente/:id/seiten', body([1], [0, 1])), fehler(422));
      await assert.rejects(x.alsPaket('trennblatt', 'POST', '/dokumente/:id/seiten', body([3])), fehler(422));
      const m = await x.neueMappe();
      const inMappe = await x.lade(m.id, 'scan.pdf', [101, 102], 'belege');
      await assert.rejects(x.d.pdfBearbeiten.bearbeitePdf(inMappe.id, { seiten: [{ nr: 1 }, { nr: 2 }], anlagen: [1] }, x.lena.id), fehler(409, /nur in Post/));
      assert.equal((await x.repo.listeDokumente(x.post.id)).length, 6, 'nichts angelegt');
    });
  });
}

describe('Anlagen (#998): Weitergeben „mit Anlagen?“ über die Prüfstelle', () => {
  it('Herunterladen mit Anlagen als ZIP (Vorgabe in der Oberfläche); ohne Exportrecht E 403 wie beim Dokument', async () => {
    const x = await aufbau(false, '');
    await mitDrei(x);
    const r = await x.oberflaeche(x.lena, 'POST', '/api/dokumente/:id/herunterladen', { params: { id: x.rechnung.id }, body: { mitAnlagen: true } }) as { datei: { name: string; inhalt: Buffer | Readable; mime: string } };
    assert.equal(r.datei.name, 'Werkstattrechnung mit Anlagen.zip');
    const namen = [...liesZip(await alsPuffer(r.datei.inhalt)).keys()];
    assert.deepEqual(namen, ['Werkstattrechnung.pdf', 'HU-Protokoll.pdf', 'Arbeiten.pdf', 'Teilebestellung.pdf']);
    const einzeln = await x.oberflaeche(x.lena, 'POST', '/api/dokumente/:id/herunterladen', { params: { id: x.rechnung.id }, body: { mitAnlagen: false } }) as { datei: { name: string } };
    assert.equal(einzeln.datei.name, 'Werkstattrechnung.pdf');
    // Jonas ohne E an der Post (Lesen bleibt): weder einzeln noch mit Anlagen.
    for (const s of (await x.d.sichtenVerwaltung.listeSichten()).filter((y) => y.typen.includes(x.post.typId))) {
      await x.d.sichtenVerwaltung.aendereSicht(s.id, { ...s, berechtigungen: { grund: { R: true, C: true, E: true }, regeln: [{ id: 'e', name: 'kein Export', wenn: [{ art: 'benutzer', benutzer: [x.jonas.id] }], dann: { E: 'entziehen' }, stopp: false }] } });
    }
    for (const mitAnl of [true, false]) await assert.rejects(x.oberflaeche(x.jonas, 'POST', '/api/dokumente/:id/herunterladen', { params: { id: x.rechnung.id }, body: { mitAnlagen: mitAnl } }), fehler(403));
  });

  it('Abruf (#800) beim ZIP „mit Anlagen“: je Anlage ein eigener Eintrag mit Weg und Name des API-Schlüssels', async () => {
    const x = await aufbau(false, '');
    await mitDrei(x);
    const abrufe = async (art: 'heruntergeladen' | 'abruf_api') => (await x.repo.historie(x.post.id, { arten: [art] })).map((e) => e.daten as { dokumentId: string; weg: string; schluessel?: string; datei?: string });
    await x.oberflaeche(x.lena, 'POST', '/api/dokumente/:id/herunterladen', { params: { id: x.rechnung.id }, body: { mitAnlagen: true } });
    const ui = await abrufe('heruntergeladen');
    assert.deepEqual(new Set(ui.map((e) => e.dokumentId)), new Set([x.rechnung.id, x.hu.id, x.arbeiten.id, x.teile.id]), 'Hauptdokument und alle drei Anlagen');
    assert.ok(ui.every((e) => e.weg === 'oberflaeche' && !e.schluessel));
    assert.equal(ui.find((e) => e.dokumentId === x.rechnung.id)?.datei, 'Werkstattrechnung mit Anlagen.zip');
    // Mit dem API-Schlüssel eines Menschen: derselbe Weg für alle, jeweils mit dem Namen des Schlüssels.
    await x.oberflaeche(x.lena, 'POST', '/api/dokumente/:id/herunterladen', { params: { id: x.rechnung.id }, body: { mitAnlagen: true }, apiSchluessel: { id: 'k', name: 'Skript Lena', recht: 'lesen' } } as unknown as Partial<Anfrage>);
    const api = await abrufe('abruf_api');
    assert.deepEqual(api.map((e) => e.dokumentId).sort(), [x.rechnung.id, x.hu.id, x.arbeiten.id, x.teile.id].sort());
    assert.ok(api.every((e) => e.weg === 'api' && e.schluessel === 'Skript Lena'));
    // Ohne Anlagen bleibt es beim einen Abruf des Dokuments.
    await x.oberflaeche(x.lena, 'POST', '/api/dokumente/:id/herunterladen', { params: { id: x.brief.id }, body: { mitAnlagen: true } });
    assert.equal((await abrufe('heruntergeladen')).filter((e) => e.dokumentId === x.brief.id).length, 1);
  });

  it('E-Mail einer Mappe: gewählte Dokumente mit ihren Anlagen (Vorgabe ja), mitAnlagen=false nur das Gewählte', async () => {
    const x = await aufbau(false, '');
    await mitDrei(x);
    const gesendet: string[][] = [];
    const mailer: Mailer = { sende: async (_an, _b, _t, o) => { gesendet.push((o?.anhaenge ?? []).map((a) => a.name)); } };
    const ich = { id: x.lena.id, name: 'Lena', email: 'lena@example.org' };
    const z = await x.d.rechtepruefung.zugriff({ id: x.lena.id, rolle: 'admin' });
    await x.d.ausgangEmail.versendeMappe(x.post.id, { an: 'werkstatt@example.org', betreff: 'Rechnung', dokumente: [x.rechnung.id] }, ich, mailer, z);
    await x.d.ausgangEmail.versendeMappe(x.post.id, { an: 'werkstatt@example.org', betreff: 'Rechnung', dokumente: [x.rechnung.id], mitAnlagen: false }, ich, mailer, z);
    assert.deepEqual(gesendet, [['Werkstattrechnung.pdf', 'HU-Protokoll.pdf', 'Arbeiten.pdf', 'Teilebestellung.pdf'], ['Werkstattrechnung.pdf']]);
    // Nachweis: Der Eintrag „email“ nennt jede Anlage als Anhang, wie das Hauptdokument.
    const mails = (await x.repo.historie(x.post.id, { arten: ['email'] })).map((e) => (e.daten as { anhaenge: Array<{ name: string }> }).anhaenge.map((y) => y.name));
    assert.deepEqual(mails.sort((a, b) => b.length - a.length), gesendet);
    // Mehrere Mappen (#151): ebenso – Anhänge und Eintrag je Mappe mit den Anlagen.
    await x.d.ausgangEmail.versendeMappen({ ids: [x.post.id], an: 'werkstatt@example.org', betreff: 'Belege', angaben: false, dokumente: [x.rechnung.id] }, { ...ich, rolle: 'admin' }, z, mailer);
    assert.deepEqual(gesendet[2], gesendet[0]);
    const mehrere = (await x.repo.historie(x.post.id, { arten: ['email'] })).find((e) => (e.daten as { mappen?: number }).mappen === 1);
    assert.deepEqual((mehrere?.daten as { anhaenge: Array<{ name: string }> }).anhaenge.map((y) => y.name), gesendet[0]);
  });
});

describe('Anlagen (#998): Erkennung, Klassifizieren und KI nur mit dem Hauptdokument (#939)', () => {
  it('Klassifizieren, „Aus Dokument ausfüllen“, Abgleich und Post-Erkennung lassen Anlagen weg – auch bei KI-Paketen', async () => {
    const x = await aufbau(false, '');
    const text = async (id: string, t: string) => { await x.d.volltexte.schreibeVolltext(id, { text: t }, { id: x.lena.id, herkunft: 'Test', paket: false }); };
    await text(x.rechnung.id, 'Werkstattrechnung Nr. R-2026-117 Gesamtbetrag 184,20 EUR');
    await text(x.hu.id, 'AGB-ANLAGE Preisliste Hauptuntersuchung Protokoll Prüfplakette');
    await mitDrei(x);
    const typ = await x.d.mappentypen.aendereTyp(x.werkstatt.id, { ...x.werkstatt, beschreibung: 'Werkstatt', erkennbarAn: 'Werkstattrechnung', ausPost: true, felder: [{ key: 'nr', label: 'Nummer', typ: 'text', erkennung: {} }] } as never);
    for (const id of [typ.id, x.post.typId]) await x.d.ki.setzeKiTyp(id, true, null);
    const eingaenge: string[] = [];
    x.d.erkennung.klassifizierung.anbieter = { pakete: () => [{ id: 'ki', name: 'KI', netz: false, vektoren: false }], klassifiziere: async (_p, e) => { eingaenge.push(JSON.stringify(e)); return { text: JSON.stringify({ typen: [] }), ms: 1 }; } };
    x.d.erkennung.anbieter = { pakete: () => [{ id: 'ki', name: 'KI', netz: false }], erkenne: async (_p, e) => { eingaenge.push(JSON.stringify(e)); return { text: JSON.stringify({ nr: { wert: 'R-2026-117' } }), ms: 1 }; } };
    await x.d.kern.repo.speicherePaket({ id: 'ki', name: 'KI', version: '1.0.0', beschreibung: '', lizenz: 'MIT', autor: { name: 'T', github: 't' }, dms: `>=${DMS_ANLAGEN_AB}`, herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: { ...liesCode({ sprache: 'c', rechte: { schnittstellen: ['dms:erkennen', 'dms:klassifizieren'] } }).code!, modul: { sha256: 'x', groesse: 1 } } } as never);
    await x.d.erkennung.setzeStandard({ paket: 'ki', abfluss: true });
    const A = await x.d.rechtepruefung.zugriff({ id: x.lena.id, rolle: 'admin' });
    const ids = [x.rechnung.id, x.hu.id];
    await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: ids }, A);
    const v = await x.d.erkennung.fuerTyp(typ.id, { dokumente: ids }, A);
    const a = await x.d.erkennung.abgleichDokumente({ dokumente: [x.hu.id] }, A);
    assert.ok(eingaenge.length >= 2, 'beide Pakete gefragt');
    assert.ok(eingaenge.every((e) => !e.includes('AGB-ANLAGE')), 'kein Text der Anlage an ein Paket');
    assert.ok(eingaenge.some((e) => e.includes('R-2026-117')));
    assert.ok(v.zeichen < 100, `nur der Text der Rechnung (${v.zeichen})`);
    assert.deepEqual(a.ohneText, []);
    const post = await x.d.erkennung.fuerPost(x.post.id);
    assert.ok(!JSON.stringify(post).includes('Prüfplakette'));
    assert.equal(post?.dokumente, 1, 'nur das Hauptdokument zählt (der Brief hat keinen Text)');
  });
});

describe('Anlagen (#998): Volltext und Vollexport', () => {
  it('die Suche findet Anlagen mit Vermerk „in Anlage n“', async () => {
    const x = await aufbau(false, '');
    await mitDrei(x);
    await x.d.volltexte.schreibeVolltext(x.arbeiten.id, { text: 'Bremsscheiben vorne erneuert' }, { id: x.lena.id, herkunft: 'Test', paket: false });
    const s = await x.repo.seite({ typId: x.post.typId, suche: 'Bremsscheiben', volltext: true, von: 0, anzahl: 10 } as never);
    assert.deepEqual(s.mappen.map((m) => m.id), [x.post.id]);
    assert.equal(s.ausschnitte?.[x.post.id]?.anlage, 2);
    assert.equal(s.ausschnitte?.[x.post.id]?.dokument, 'Arbeiten.pdf');
  });

  it('Vollexport: dokumente.csv nennt Hauptdokument und Nummer jeder Anlage (am Ende der Zeile)', async () => {
    const x = await aufbau(false, '');
    await mitDrei(x);
    const quelle = x.d.vollexport.vollexportQuelle({ mandant: 'Familie Test', version: '0.0.0', benutzer: () => x.konten.exportDaten(), designs: async () => [], protokoll: () => [] });
    const ziel = await mkdtemp(join(tmpdir(), 'dms-x998-'));
    try {
      const r = await vollexport(quelle, ziel, {});
      const zeilen = (await readFile(join(r.ordner, 'daten/dokumente.csv'), 'utf8')).replace(/^\uFEFF/, '').trim().split('\r\n');
      assert.match(zeilen[0], /,archivfassung,anlage_zu,anlage_nr,eingang_nr,original_email$/);
      const hu = zeilen.find((z) => z.startsWith(x.hu.id))!;
      assert.ok(hu.endsWith(`,${x.rechnung.id},1,,`), hu);
      assert.ok(zeilen.find((z) => z.startsWith(x.rechnung.id))!.endsWith(',,,,'));
    } finally { await rm(ziel, { recursive: true, force: true }); }
  });
});
