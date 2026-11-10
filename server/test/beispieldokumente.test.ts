/** Beispiel-Dokumente in Paketen (#878): lesen, prüfen, anlegen, entfernen, Paket erstellen – mit Speicher und PostgreSQL. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { BEISPIEL_DOKUMENTE_AB, PAKET_MAX } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { beispielDateiart, beispielName, liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { mindestversion, Paketerstellung } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };

/** Kleinste Dateien, die Ablago am Inhalt als PDF, PNG bzw. JPEG erkennt (erfundener Inhalt). */
const PDF = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);

const MANIFEST = 'schema: 1\nid: demo\nname: Demo-Ablage\nversion: 1.0.0\nbeschreibung: Beispiele mit Dokumenten.\nautor: { name: Lena Beispiel, github: lena-beispiel }\nlizenz: MIT\ndms: ">=0.223.0"\nabhaengigkeiten: {}\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n  beispiele: inhalt/beispiele.yaml\n';
const TYPEN = [
  '- schluessel: firma', '  name: Firma', '  titelVorlage: "{name}"', '  felder:', '    - { key: name, label: Name, typ: text, pflicht: true }',
  '  register:', '    - { key: daten, name: Daten, art: felder, felder: [name] }',
  '- schluessel: vertrag', '  name: Vertrag', '  titelVorlage: "{nr}"', '  felder:',
  '    - { key: nr, label: Nummer, typ: text, pflicht: true }', '    - { key: firma, label: Firma, typ: referenz, ziel: firma }',
  '  register:', '    - { key: daten, name: Daten, art: felder, felder: [nr, firma] }',
  '    - { key: unterlagen, name: Unterlagen, art: dokumente }', '    - { key: rechnungen, name: Rechnungen, art: dokumente }', '',
].join('\n');
const BEISPIELE = [
  '- typ: firma', '  schluessel: heizung', '  werte: { name: Heizungsbau Beispiel GmbH }',
  '- typ: vertrag', '  schluessel: wartung', '  werte: { nr: WV-2023-17, firma: { beispiel: heizung } }', '  dokumente:',
  '    - { datei: beispiele/heizung/wartungsvertrag.pdf, titel: Wartungsvertrag Heizung, datum: "2023-04-01" }',
  '    - { datei: beispiele/heizung/rechnung-2026.png, register: rechnungen }',
  '- typ: vertrag', '  werte: { nr: SV-4711 }', '  dokumente:', '    - { datei: beispiele/strom/vertrag.jpg, titel: Stromvertrag Jonas.jpg }', '',
].join('\n');
const DATEIEN: Record<string, string | Buffer> = {
  'manifest.yaml': MANIFEST, 'inhalt/mappentypen.yaml': TYPEN, 'inhalt/sichten.yaml': '- { schluessel: vertraege, name: Verträge, typen: [vertrag] }\n', 'inhalt/beispiele.yaml': BEISPIELE,
  'inhalt/beispiele/heizung/wartungsvertrag.pdf': PDF('Wartungsvertrag fuer Markus, example.org'),
  'inhalt/beispiele/heizung/rechnung-2026.png': PNG,
  'inhalt/beispiele/strom/vertrag.jpg': JPEG,
};
const zip = (d: Record<string, string | Buffer>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && ((e.details as { gruende?: string[] })?.gruende ?? [e.message]).some((g) => re.test(g));
const mitBeispielen = (yaml: string, extra: Record<string, string | Buffer> = {}) => ({ ...DATEIEN, 'inhalt/beispiele.yaml': yaml, ...extra });

describe('Beispiel-Dokumente lesen und prüfen (#878)', () => {
  it('liest dokumente mit Datei, Titel, Datum und Register; Name aus dem Titel mit Endung', () => {
    const p = liesPaket(liesZip(zip(DATEIEN)));
    assert.deepEqual(p.beispiele[1].dokumente, [
      { datei: 'beispiele/heizung/wartungsvertrag.pdf', titel: 'Wartungsvertrag Heizung', datum: '2023-04-01' },
      { datei: 'beispiele/heizung/rechnung-2026.png', register: 'rechnungen' },
    ]);
    assert.equal(p.beispielDateien?.size, 3);
    assert.equal(beispielName(p.beispiele[1].dokumente![0]), 'Wartungsvertrag Heizung.pdf');
    assert.equal(beispielName(p.beispiele[1].dokumente![1]), 'rechnung-2026.png');
    assert.equal(beispielName(p.beispiele[2].dokumente![0]), 'Stromvertrag Jonas.jpg', 'Endung steht schon im Titel');
  });

  it('erlaubt nur PDF, PNG und JPEG – am Inhalt erkannt und passend zur Endung', () => {
    assert.equal(beispielDateiart('a.pdf', PDF('x')), 'application/pdf');
    assert.equal(beispielDateiart('a.PNG', PNG), 'image/png');
    assert.equal(beispielDateiart('a.jpeg', JPEG), 'image/jpeg');
    assert.equal(beispielDateiart('a.png', PDF('x')), null, 'Endung passt nicht zum Inhalt');
    assert.equal(beispielDateiart('a.txt', Buffer.from('Hallo')), null);
    assert.equal(beispielDateiart('a.gif', Buffer.from('GIF89a......')), null, 'GIF ist kein erlaubtes Beispiel-Dokument');
    const yaml = '- typ: firma\n  werte: { name: X }\n  dokumente:\n    - { datei: beispiele/notiz.txt }\n    - { datei: beispiele/falsch.pdf }\n';
    assert.throws(() => liesPaket(liesZip(zip(mitBeispielen(yaml, { 'inhalt/beispiele/notiz.txt': 'Hallo', 'inhalt/beispiele/falsch.pdf': PNG })))), (e) => gruende(/notiz\.txt ist kein PDF/)(e) && gruende(/falsch\.pdf ist kein PDF/)(e));
  });

  it('Datei muss unter inhalt/beispiele/ liegen und im Paket sein; leere Dateien, Datum, Titel und Register werden geprüft', () => {
    const fall = (dok: string, extra: Record<string, string | Buffer> = {}) => () => liesPaket(liesZip(zip(mitBeispielen(`- typ: firma\n  werte: { name: X }\n  dokumente:\n    - ${dok}\n`, extra))));
    assert.throws(fall('{ datei: mappentypen.yaml }'), gruende(/muss unter inhalt\/beispiele\/ liegen/));
    assert.throws(fall('{ datei: beispiele/../manifest.yaml }'), gruende(/muss unter inhalt\/beispiele\/ liegen/));
    assert.throws(fall('{ datei: beispiele/gibtsnicht.pdf }'), gruende(/fehlt im Paket/));
    assert.throws(fall('{ datei: beispiele/leer.pdf }', { 'inhalt/beispiele/leer.pdf': Buffer.alloc(0) }), gruende(/ist leer/));
    assert.throws(fall('{ datei: beispiele/heizung/wartungsvertrag.pdf, datum: "2026-02-30" }'), gruende(/kein Datum/));
    assert.throws(fall('{ datei: beispiele/heizung/wartungsvertrag.pdf, titel: "a/b" }'), gruende(/titel/));
    assert.throws(fall('{ datei: beispiele/heizung/wartungsvertrag.pdf, register: "Ä" }'), gruende(/keine gültige Kennung/));
    // Firma hat kein Dokumentenregister: Das fällt schon beim Lesen auf (eigener Mappentyp).
    assert.throws(fall('{ datei: beispiele/heizung/wartungsvertrag.pdf }'), gruende(/kein passendes Dokumentenregister/));
    assert.throws(() => liesPaket(liesZip(zip(mitBeispielen('- typ: vertrag\n  werte: { nr: X }\n  dokumente:\n    - { datei: beispiele/heizung/wartungsvertrag.pdf, register: daten }\n')))), gruende(/kein passendes Dokumentenregister/));
    assert.throws(() => liesPaket(liesZip(zip(mitBeispielen('- typ: vertrag\n  werte: { nr: X }\n  dokumente: keine\n')))), gruende(/muss eine Liste sein/));
  });

  it('Beispiel-Dokumente zählen zur Paketgrenze, nicht zur Grenze der Inhalte (20 MB)', () => {
    const gross = Buffer.concat([PDF('gross'), Buffer.alloc(21 * 1024 * 1024)]);
    const yaml = '- typ: vertrag\n  werte: { nr: X }\n  dokumente:\n    - { datei: beispiele/gross.pdf }\n';
    const p = liesPaket(liesZip(zip(mitBeispielen(yaml, { 'inhalt/beispiele/gross.pdf': gross }))));
    assert.equal(p.beispielDateien?.get('beispiele/gross.pdf')?.length, gross.length);
    assert.throws(() => liesZip(zip({ ...DATEIEN, 'inhalt/gross.pdf': gross })), /entpackt zu groß/);
    // Auch mit einem Ordner davor (selbst gepacktes ZIP).
    assert.doesNotThrow(() => liesZip(zip({ 'demo/manifest.yaml': MANIFEST, 'demo/inhalt/beispiele/gross.pdf': gross })));
    assert.equal(PAKET_MAX, 128 * 1024 * 1024);
  });
});

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo-pg');
  const sql = (await eigeneDatenbank('bspdok')).sql;
  await sql`INSERT INTO haushalte (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, '00000000-0000-4000-8000-000000000001', ${ICH.email}, 'Admin', 'admin') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, '00000000-0000-4000-8000-000000000001') as never;
}

function faelle(pg: boolean) {
  describe(`Beispiel-Dokumente installieren und entfernen (#878)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function aufbau() {
      const dateien = speicherDateien();
      const r = await repo(pg);
      const d = new Dienst(r, dateien, { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => '0.223.0', katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } });
      return { d, p, r, dateien, e: new Paketerstellung(d, { version: () => '0.223.0' }) };
    }
    async function installiere(p: Paketverwaltung, d: Record<string, string | Buffer> = DATEIEN, beispiele = true) {
      const h = await p.hochladen(zip(d), ICH);
      return { vorschau: h.vorschau, paket: await p.installiere({ upload: h.upload, bestaetigt: true, beispiele }, ICH) };
    }
    const vertraege = async (d: Dienst) => {
      const typ = (await d.listeTypen()).find((t) => t.schluessel === 'demo_vertrag')!;
      return (await d.listeMappen(typ.id)).sort((a, b) => String(a.werte.nr).localeCompare(String(b.werte.nr)));
    };

    it('legt die Dokumente wie beim Hochladen an: Register, Name, Datum, Herkunft, Volltext; ohne Mappen-Ereignisse', async () => {
      const { d, p, r, dateien } = await aufbau();
      const { vorschau, paket } = await installiere(p);
      assert.deepEqual(vorschau.beispielDokumente, { anzahl: 3, bytes: DATEIEN['inhalt/beispiele/heizung/wartungsvertrag.pdf'].length + PNG.length + JPEG.length });
      const [strom, wartung] = await vertraege(d);
      const docs = await d.listeDokumente(wartung.id);
      assert.deepEqual(docs.map((x) => [x.name, x.registerKey, x.mime, x.herkunft]).sort(), [
        ['Wartungsvertrag Heizung.pdf', 'unterlagen', 'application/pdf', 'paket'],
        ['rechnung-2026.png', 'rechnungen', 'image/png', 'paket'],
      ]);
      assert.equal(docs.find((x) => x.mime === 'application/pdf')!.erstellt.slice(0, 10), '2023-04-01', 'Datum aus dem Paket');
      assert.equal(docs.find((x) => x.mime === 'application/pdf')!.ocr?.stand, 'wartet', 'Volltext wie beim Hochladen eingereiht');
      assert.ok(docs.every((x) => x.anzeigbar));
      assert.deepEqual((await d.listeDokumente(strom.id)).map((x) => x.name), ['Stromvertrag Jonas.jpg']);
      assert.ok(await dateien.lies(docs[0].sha256), 'Datei liegt im Dateispeicher');
      assert.equal(paket.beispielMappen?.length, 3, 'Stand aller drei Beispiele gemerkt');
      // Frage 71: keine Mappen-Ereignisse; Dateiereignisse für verarbeitende Pakete nur „still“.
      const ereignisse = await r.holeKatalogEreignisse(100, 1);
      assert.ok(!ereignisse.some((x) => x.art.startsWith('mappe.')), 'keine Mappen-Ereignisse');
      assert.ok(ereignisse.filter((x) => x.art === 'dokument.hochgeladen').every((x) => x.ausloeser.still), 'Dateiereignisse still');
    });

    it('ohne Haken keine Beispiele und keine Dokumente', async () => {
      const { d, p } = await aufbau();
      const { paket } = await installiere(p, DATEIEN, false);
      assert.equal((await vertraege(d)).length, 0);
      assert.equal(paket.beispielMappen, undefined);
    });

    it('scheitert ein Dokument, ist das Paket ganz zurückgenommen – auch die Dateien', async () => {
      const { d, p, dateien } = await aufbau();
      // Das zweite Beispiel scheitert (doppelte eindeutige Nummer) – das erste samt Dokument muss wieder weg.
      const kaputt = mitBeispielen('- typ: vertrag\n  werte: { nr: A-1 }\n  dokumente:\n    - { datei: beispiele/heizung/wartungsvertrag.pdf }\n- typ: vertrag\n  werte: { nr: A-1 }\n');
      await assert.rejects(installiere(p, { ...kaputt, 'inhalt/mappentypen.yaml': TYPEN.replace('{ key: nr, label: Nummer, typ: text, pflicht: true }', '{ key: nr, label: Nummer, typ: text, pflicht: true, eindeutig: true }') }), /Beispiel/);
      assert.ok(!(await d.listeTypen()).some((t) => t.schluessel?.startsWith('demo_')), 'keine Typen übrig');
      assert.deepEqual(await d.kern.repo.listePakete(), []);
      await assert.rejects(dateien.lies(createHashHex(DATEIEN['inhalt/beispiele/heizung/wartungsvertrag.pdf'] as Buffer)), 'Datei der zurückgenommenen Mappe ist weg');
    });

    it('Entfernen des Pakets nimmt unveränderte Beispiele samt Dokumenten mit; geänderte bleiben und werden genannt', async () => {
      const { d, p, dateien } = await aufbau();
      await installiere(p);
      const [strom] = await vertraege(d);
      const typ = (await d.listeTypen()).find((t) => t.schluessel === 'demo_vertrag')!;
      await d.aendereMappe(strom.id, { werte: { ...strom.werte, nr: 'SV-4712' } }, ICH.id);
      await assert.rejects(p.entferne('demo', ICH), (e) => gruende(/„SV-4712“ wurde geändert und bleibt/)(e) && gruende(/1 Mappe/)(e));
      assert.equal((await vertraege(d)).length, 2, 'beim Scheitern bleibt alles');
      // Geändertes Beispiel selbst löschen – dann geht das Paket samt den übrigen Beispielen.
      await d.entferneMappenEndgueltig([strom.id]);
      const sha = (await d.listeDokumente((await vertraege(d))[0].id))[0].sha256;
      const r = await p.entferne('demo', ICH);
      assert.deepEqual(r.beispieleBehalten, []);
      assert.ok(!(await d.listeTypen()).some((t) => t.id === typ.id));
      await assert.rejects(dateien.lies(sha), 'Dateien der Beispiele sind weg');
    });

    it('„Beispiele entfernen“: unveränderte gehen, geänderte und verwiesene bleiben und werden genannt', async () => {
      const { d, p } = await aufbau();
      await installiere(p);
      const firmaTyp = (await d.listeTypen()).find((t) => t.schluessel === 'demo_firma')!;
      const [strom, wartung] = await vertraege(d);
      // Ein eigener Vertrag verweist auf die Beispiel-Firma; an den Wartungsvertrag kommt ein weiteres Dokument.
      const firma = (await d.listeMappen(firmaTyp.id))[0];
      const vertragTyp = (await d.listeTypen()).find((t) => t.schluessel === 'demo_vertrag')!;
      await d.legeMappeAn({ typId: vertragTyp.id, werte: { nr: 'EIGEN-1', firma: firma.id } }, ICH.id);
      await d.ladeHoch(wartung.id, { register: 'unterlagen', name: 'Nachtrag.pdf' }, PDF('Nachtrag Petra'), ICH.id);
      const r = await p.beispieleEntfernen('demo', ICH);
      assert.equal(r.entfernt, 1);
      assert.deepEqual(r.behalten.map((b) => [b.titel, b.grund]).sort(), [['Heizungsbau Beispiel GmbH', 'verwiesen'], ['WV-2023-17', 'geaendert']]);
      assert.ok(!(await d.gibtMappe(strom.id)), 'unverändertes Beispiel samt Dokument weg');
      assert.ok(await d.gibtMappe(wartung.id) && await d.gibtMappe(firma.id));
      const nachher = (await d.kern.repo.listePakete()).find((x) => x.id === 'demo')!;
      assert.equal(nachher.beispielMappen, undefined, 'das Paket merkt sich keine Beispiele mehr');
      assert.deepEqual(Object.keys(nachher.beispiele ?? {}).sort(), ['heizung', 'wartung'], 'Schlüssel der gebliebenen bleiben für Verweise');
      assert.deepEqual(await p.beispieleEntfernen('demo', ICH), { entfernt: 0, behalten: [] });
    });

    it('Paket erstellen nimmt Dokumente der gewählten Beispiele nur auf Wunsch mit – und es lässt sich wieder installieren', async () => {
      const { d, p, e } = await aufbau();
      // Eigener Typ (nicht aus einem Paket) mit Beispiel-Mappe und Dokumenten: PDF, PNG und eines, das draußen bleibt.
      const typ = await d.legeTypAn({ name: 'Urkunde', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }], register: [{ key: 'daten', name: 'Daten', art: 'felder', felder: ['name'] }, { key: 'scans', name: 'Scans', art: 'dokumente' }] } as never);
      const m = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Geburtsurkunde Katrin' } }, ICH.id);
      await d.ladeHoch(m.id, { register: 'scans', name: 'Geburtsurkunde Katrin.pdf' }, PDF('Urkunde Katrin'), ICH.id);
      await d.ladeHoch(m.id, { register: 'scans', name: 'Rückseite.png' }, PNG, ICH.id);
      await d.ladeHoch(m.id, { register: 'scans', name: 'Notiz.txt', typ: 'text/plain' }, Buffer.from('Notiz'), ICH.id);
      const eingabe = { typen: [typ.id], sichten: [], beispiele: [m.id], wortlisten: [], id: 'urkunden', name: 'Urkunden', version: '1.0.0', beschreibung: 'Urkunden mit Beispielen.', autor: { name: 'Herr Özdemir', github: 'oezdemir' }, lizenz: 'MIT', lizenzArt: 'frei', dms: `>=${BEISPIEL_DOKUMENTE_AB}`, aenderungen: '' };
      const ohne = await e.pruefe(eingabe);
      assert.equal(ohne.inhalt.beispielDokumente, undefined);
      const mit = await e.pruefe({ ...eingabe, beispielDokumente: true });
      assert.deepEqual(mit.probleme, []);
      assert.equal(mit.inhalt.beispielDokumente, 2);
      assert.ok(mit.hinweise.some((h) => /kein PDF, PNG oder JPEG/.test(h)), 'Text-Datei bleibt draußen, mit Hinweis');
      assert.equal(mit.version.mindest, BEISPIEL_DOKUMENTE_AB);
      assert.equal(mindestversion(['beispielDokumente']).version, BEISPIEL_DOKUMENTE_AB);
      const archiv = await e.exportiere({ ...eingabe, beispielDokumente: true }, ICH);
      const inhalt = liesZip(archiv.daten);
      assert.ok(inhalt.has('urkunden/inhalt/beispiele/beispiel_1/Geburtsurkunde-Katrin.pdf'));
      assert.ok(inhalt.has('urkunden/inhalt/beispiele/beispiel_1/Ruckseite.png'));
      const bsp = parse(inhalt.get('urkunden/inhalt/beispiele.yaml')!.toString()) as Array<{ dokumente: Array<{ datei: string; titel: string; register: string; datum: string }> }>;
      assert.deepEqual(bsp[0].dokumente.map((x) => [x.datei, x.titel, x.register]).sort(), [
        ['beispiele/beispiel_1/Geburtsurkunde-Katrin.pdf', 'Geburtsurkunde Katrin.pdf', 'scans'],
        ['beispiele/beispiel_1/Ruckseite.png', 'Rückseite.png', 'scans'],
      ]);
      // In einer frischen Ablage: dieselben Dokumente an der Beispiel-Mappe.
      const ziel = await aufbau();
      await installiere(ziel.p, Object.fromEntries([...inhalt].map(([n, b]) => [n, b])));
      const zt = (await ziel.d.listeTypen()).find((t) => t.schluessel === 'urkunden_urkunde')!;
      const zm = (await ziel.d.listeMappen(zt.id))[0];
      assert.deepEqual((await ziel.d.listeDokumente(zm.id)).map((x) => x.name).sort(), ['Geburtsurkunde Katrin.pdf', 'Rückseite.png']);
      assert.ok(p);
    });
  });
}

/** sha256 als Hex (wie der Dateispeicher). */
const createHashHex = (b: Buffer) => createHash('sha256').update(b).digest('hex');

faelle(false);
faelle(true);

