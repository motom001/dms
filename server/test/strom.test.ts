/**
 * Große Vorgänge als Strom (#746): Hochladen in eine temporäre Datei mit Prüfsumme beim Lesen (Grenze bleibt, Datei
 * nur für den Dienstbenutzer, danach weg), Vollexport Zeile für Zeile ohne lange Sperre der Ereignisschleife und
 * ohne Reste bei einem Abbruch, AES der ZIP-Dateien mit beliebig geschnittenen Stücken.
 */
import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { after, describe, it } from 'node:test';
import { ordnerSpeicher, speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Eingang, nimmAuf, raeumeHochladenAuf, richteHochladenEin, shaVon } from '../src/hochladen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { vollexport } from '../src/vollexport';
import { zipStrom } from '../src/zip';

const tmp = mkdtempSync(join(tmpdir(), 'dms-a746-strom-'));
const hochladen = join(tmp, 'hochladen');
richteHochladenEin({ ordner: hochladen });
after(() => rmSync(tmp, { recursive: true, force: true }));

const MB = 1024 * 1024;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
/** Körper in Stücken, wie er über das Netz kommt. */
const stuecke = (b: Buffer, groesse = 64 * 1024) => Readable.from((function* () { for (let i = 0; i < b.length; i += groesse) yield b.subarray(i, i + groesse); })());
const restDateien = async () => (await readdir(hochladen).catch(() => [] as string[])).filter((n) => n.endsWith('.tmp'));
const fachfehler = (status: number) => (e: unknown) => e instanceof Fachfehler && e.status === status;

describe('Hochladen als Strom (#746)', () => {
  it('nimmAuf: Größe, Prüfsumme und Kopf beim Lesen; Datei nur für den Dienstbenutzer (0600)', async () => {
    const inhalt = Buffer.alloc(3 * MB + 17, 7); inhalt.write('%PDF-1.7', 0, 'latin1');
    const h = await nimmAuf(stuecke(inhalt), 5 * MB);
    assert.equal(h.groesse, inhalt.length);
    assert.equal(h.sha256, sha(inhalt));
    assert.equal(h.kopf.subarray(0, 8).toString('latin1'), '%PDF-1.7');
    assert.equal((await stat(h.pfad)).mode & 0o777, 0o600);
    assert.deepEqual(await readFile(h.pfad), inhalt);
    await h.entferne();
    assert.deepEqual(await restDateien(), []);
  });

  it('Grenze bleibt: 413 nach Content-Length ohne zu lesen, 413 beim Überschreiten; nichts bleibt liegen', async () => {
    let gelesen = 0;
    const zaehlend = Readable.from((function* () { for (let i = 0; i < 8; i++) { gelesen += MB; yield Buffer.alloc(MB); } })());
    await assert.rejects(nimmAuf(zaehlend, 2 * MB, 8 * MB), fachfehler(413));
    assert.equal(gelesen, 0, 'nach Content-Length: kein Byte gelesen');
    await assert.rejects(nimmAuf(stuecke(Buffer.alloc(3 * MB)), 2 * MB), fachfehler(413));
    assert.deepEqual(await restDateien(), []);
  });

  it('abgebrochener Upload: 400, die temporäre Datei ist weg', async () => {
    const kaputt = new Readable({ read() {} });
    const p = nimmAuf(kaputt, 10 * MB);
    kaputt.push(Buffer.alloc(MB));
    setImmediate(() => kaputt.destroy(new Error('Verbindung weg')));
    await assert.rejects(p, fachfehler(400));
    assert.deepEqual(await restDateien(), []);
  });

  it('Speicherplatz wird vor dem Schreiben geprüft', async () => {
    richteHochladenEin({ ordner: hochladen, vorher: async () => { throw new Fachfehler(507, 'Speicher voll'); } });
    try { await assert.rejects(nimmAuf(stuecke(Buffer.alloc(10)), MB), fachfehler(507)); } finally { richteHochladenEin({ ordner: hochladen }); }
    assert.deepEqual(await restDateien(), []);
  });

  it('beim Start: übrig gebliebene temporäre Uploads löschen', async () => {
    await mkdir(hochladen, { recursive: true });
    await writeFile(join(hochladen, 'a.tmp'), 'x'); await writeFile(join(hochladen, 'b.tmp'), 'y'); await writeFile(join(hochladen, 'bleibt.txt'), 'z');
    assert.equal(await raeumeHochladenAuf(), 2);
    assert.deepEqual((await readdir(hochladen)).sort(), ['bleibt.txt']);
  });

  it('Dateispeicher übernimmt die Datei durch Umbenennen; gleicher Inhalt: Datei weg, Ablage unverändert', async () => {
    const wurzel = join(tmp, 'ablage');
    const s = ordnerSpeicher(wurzel, 'h');
    const inhalt = Buffer.from('%PDF-1.4 Vertrag');
    const h = await nimmAuf(stuecke(inhalt), MB);
    await Eingang.aus(h)!.lege(s, h.sha256);
    const ziel = join(wurzel, 'h', h.sha256.slice(0, 2), h.sha256);
    assert.deepEqual(await readFile(ziel), inhalt);
    assert.equal((await stat(ziel)).mode & 0o777, 0o644);
    assert.equal(await stat(h.pfad).then(() => true, () => false), false);
    const zweite = await nimmAuf(stuecke(inhalt), MB);
    await Eingang.aus(zweite)!.lege(s, zweite.sha256);
    assert.equal(await stat(zweite.pfad).then(() => true, () => false), false);
  });

  it('Prüfsumme eines Puffers in Stücken: wie in einem Zug', async () => {
    const b = Buffer.alloc(5 * MB + 3, 9);
    assert.equal(await shaVon(b), sha(b));
    assert.equal(await Eingang.aus(b)!.sha256(), sha(b));
    assert.equal(Eingang.aus({}), null);
  });

  it('über HTTP: Dokument und neue Version als Strom, mit richtiger Prüfsumme; danach keine temporären Dateien', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const typ = await d.mappentypen.legeTypAn({ name: 'Akte', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }],
      register: [{ key: 'daten', name: 'Daten', art: 'felder' }, { key: 'dok', name: 'Dokumente', art: 'dokumente', versionierung: true }] });
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Akte Jonas' } });
    const { baueApp } = await import('../src/http');
    const app = await baueApp(d, konten, {});
    try {
      const an = await app.inject({ method: 'POST', url: '/api/konto/anmelden', headers: { 'x-dms': '1', 'content-type': 'application/json' }, payload: JSON.stringify({ email: 'lena@example.org', passwort: 'ein-langes-passwort' }) });
      const cookie = String(([] as string[]).concat(an.headers['set-cookie'] ?? [])[0] ?? '').split(';')[0];
      const koepfe = { cookie, 'x-dms': '1', 'content-type': 'application/octet-stream' };
      const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2 * MB, 1)]);
      const r = await app.inject({ method: 'POST', url: `/api/mappen/${m.id}/dokumente?register=dok&name=Brief.pdf`, headers: koepfe, payload: stuecke(pdf) });
      assert.equal(r.statusCode, 201, r.body);
      const dok = JSON.parse(r.body).dokument as { id: string; sha256: string; groesse: number; mime: string; anzeigbar: boolean };
      assert.deepEqual([dok.sha256, dok.groesse, dok.mime, dok.anzeigbar], [sha(pdf), pdf.length, 'application/pdf', true]);
      const zwei = Buffer.from('%PDF-1.4 zweite Fassung');
      const v = await app.inject({ method: 'POST', url: `/api/dokumente/${dok.id}/ersetzen?name=Brief.pdf`, headers: koepfe, payload: stuecke(zwei) });
      assert.equal(v.statusCode, 201, v.body);
      assert.equal(JSON.parse(v.body).sha256, sha(zwei));
      // Öffentliche API (/api/v1) nimmt denselben Weg.
      const api = await app.inject({ method: 'POST', url: `/api/v1/mappen/${m.id}/dokumente?register=dok&name=api.txt`, headers: koepfe, payload: stuecke(Buffer.from('Text')) });
      assert.equal(api.statusCode, 201, api.body);
      const leer = await app.inject({ method: 'POST', url: `/api/mappen/${m.id}/dokumente?register=dok&name=leer.pdf`, headers: koepfe, payload: Buffer.alloc(0) });
      assert.equal(leer.statusCode, 422);
      const inhalt = await d.dokumentInhalt(dok.id);
      assert.deepEqual(inhalt.inhalt, zwei);
      // Aufgeräumt wird nach dem Senden der Antwort (onResponse) – kurz darauf warten.
      for (let i = 0; i < 50 && (await restDateien()).length; i++) await new Promise((x) => setTimeout(x, 20));
      assert.deepEqual(await restDateien(), []);
    } finally { await app.close(); }
  });
});

/** WinZip-AES (AE-2) entschlüsseln – unabhängig von zip.ts (wie in auskunft.test.ts). */
function aesAuf(d: Buffer, passwort: string): Buffer {
  const salz = d.subarray(0, 16); const daten = d.subarray(18, d.length - 10); const mac = d.subarray(d.length - 10);
  const k = pbkdf2Sync(passwort, salz, 1000, 66, 'sha1');
  assert.deepEqual(k.subarray(64), d.subarray(16, 18));
  assert.deepEqual(createHmac('sha1', k.subarray(32, 64)).update(daten).digest().subarray(0, 10), mac);
  const ecb = createCipheriv('aes-256-ecb', k.subarray(0, 32), null); ecb.setAutoPadding(false);
  const out = Buffer.alloc(daten.length);
  for (let i = 0; i < daten.length; i += 16) {
    const z = Buffer.alloc(16); z.writeUInt32LE(i / 16 + 1, 0);
    const ks = ecb.update(z);
    for (let j = 0; j < 16 && i + j < daten.length; j++) out[i + j] = daten[i + j] ^ ks[j];
  }
  return out;
}

describe('ZIP mit AES als Strom (#746)', () => {
  it('beliebig geschnittene, unausgerichtete Stücke ergeben dieselben Daten', async () => {
    const inhalt = Buffer.alloc(700_001);
    for (let i = 0; i < inhalt.length; i++) inhalt[i] = (i * 31 + 7) & 0xff;
    // Stücke von 1, 3, 15, 17 … Bytes und eins über die Grenze von 256 KB; dazu Teile aus dem Pool (unausgerichtet).
    const groessen = [1, 3, 15, 17, 4096, 300_000];
    const teile: Buffer[] = [];
    for (let i = 0, k = 0; i < inhalt.length; k++) { const n = groessen[k % groessen.length]; teile.push(Buffer.from(inhalt.subarray(i, i + n))); i += n; }
    const zip: Buffer[] = [];
    for await (const c of zipStrom([{ name: 'a.bin', groesse: inhalt.length, inhalt: async () => Readable.from(teile) }], new Date(), 'ein-langes-passwort')) zip.push(c as Buffer);
    const b = Buffer.concat(zip);
    const start = 30 + 'a.bin'.length + 11;
    assert.deepEqual(aesAuf(b.subarray(start, start + inhalt.length + 28), 'ein-langes-passwort'), inhalt);
  });
});

/** Quelle für den Vollexport ohne Datenbank: viele Mappen, PDFs nur angedeutet. */
function quelle(n: number, kaputtBei?: number) {
  const typ = { id: 't1', name: 'Rechnung', schluessel: 'rechnung', titelVorlage: '{f0}', felder: Array.from({ length: 10 }, (_, i) => ({ key: `f${i}`, label: `Feld ${i}`, typ: i === 3 ? 'datum' : i === 4 ? 'betrag' : 'text' })), register: [], berechtigungen: [] };
  const mappen = Array.from({ length: n }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, typId: 't1', titel: `Rechnung ${i}`, erstellt: '2026-01-01T00:00:00.000Z', geaendert: '2026-01-02T00:00:00.000Z', erstelltVon: null, geaendertVon: null,
    werte: Object.fromEntries(typ.felder.map((f) => [f.key, f.typ === 'datum' ? '2026-03-01' : f.typ === 'betrag' ? { betrag: 12.5, waehrung: 'EUR' } : `Strom und Wasser, Abschlag ${i}`])) }));
  let pdfs = 0;
  return {
    mandant: 'Test', version: '0',
    typen: async () => [typ], sichten: async () => [], nummernkreise: async () => [], pakete: async () => [], designs: async () => [],
    mappen: async () => mappen, papierkorb: async () => [], dokumente: async () => [], versionen: async () => [], volltexte: async () => new Map(),
    datei: async () => Buffer.alloc(0), notizen: async () => [], aufgaben: async () => [], erinnerungen: async () => [],
    historie: async (ids: string[]) => ids.map((id) => ({ mappeId: id, art: 'geaendert' })),
    favoriten: async () => [], benutzer: async () => ({ benutzer: [], vertretungen: [] }), passwort: () => null, protokoll: () => [],
    pdf: async () => { if (kaputtBei !== undefined && ++pdfs > kaputtBei) throw new Error('PDF kaputt'); return Buffer.from('%PDF-1.4'); },
  };
}

describe('Vollexport als Strom (#746)', () => {
  it('blockiert die Ereignisschleife nicht lange; Listen vollständig, keine Arbeitsdateien übrig', async () => {
    const ziel = join(tmp, 'export-gross');
    let zuletzt = performance.now(), laengste = 0;
    const t = setInterval(() => { const j = performance.now(); laengste = Math.max(laengste, j - zuletzt); zuletzt = j; }, 2);
    const r = await vollexport(quelle(4000) as never, ziel, {}).finally(() => clearInterval(t));
    // Vorher entstand die Excel-Tabelle in einem Zug im Hauptfaden (bei 4.000 Mappen rund 1,7 Sekunden auf dem Testrechner).
    assert.ok(laengste < 500, `längste Pause der Ereignisschleife ${Math.round(laengste)} ms`);
    const m = JSON.parse(await readFile(join(r.ordner, 'manifest.json'), 'utf8')) as { dateien: Array<{ pfad: string }>; anzahlen: { historie: number } };
    assert.equal(m.anzahlen.historie, 4000);
    assert.equal((await readFile(join(r.ordner, 'daten/historie.jsonl'), 'utf8')).split('\n').filter(Boolean).length, 4000);
    assert.equal((await readFile(join(r.ordner, 'daten/rechnung.csv'), 'utf8')).split('\r\n').filter(Boolean).length, 4001);
    assert.ok(!(await readdir(r.ordner)).some((n) => n.startsWith('.tabelle')), 'Arbeitsdatei für Excel gelöscht');
    assert.ok(m.dateien.some((d) => d.pfad === 'daten/rechnung.xlsx'));
  });

  it('Abbruch: kein halber (unverschlüsselter) Export bleibt liegen', async () => {
    const ziel = join(tmp, 'export-abbruch');
    await assert.rejects(vollexport(quelle(50, 10) as never, ziel, {}), /PDF kaputt/);
    assert.deepEqual(await readdir(ziel), []);
  });
});
