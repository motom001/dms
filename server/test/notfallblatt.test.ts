/** Notfallblatt in Ablago-Optik (#814): eine Seite, Schlüssel gut abtippbar, Links mit https://, QR-Code nur zur Hilfe. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PDFArray, PDFDict, PDFName, PDFString } from 'pdf-lib';
import { blattAdresse, inGruppen, lesehilfe, notfallblatt, notfallblattPlan, VERWECHSELBAR, type Notfalldaten } from '../src/notfallblatt';
import { NOTFALL_HILFE, NOTFALL_HILFE_EN, NOTFALL_QR } from '../src/notfallqr';
import { ladePdf } from '../src/pdf/laden';

const WURZEL = new URL('../..', import.meta.url).pathname;
// Ein Schlüssel mit allen verwechselbaren Zeichen (43 Zeichen wie echte, ohne „dms“ darin).
const SCHLUESSEL = 'O0o1lI-_AbCdEfGhJkMnPqRsTuVwXyZ23456789aBcD';
const daten = (x: Partial<Notfalldaten> = {}): Notfalldaten => ({
  name: 'Familie Beispiel', haushaltId: '3f6c2a9e-8b1d-4c7e-9a52-1d0e6b7f4c21', adresse: 'https://ablage.example.org', version: '0.184.0',
  erstellt: new Date('2026-11-04T10:00:00Z'), schluessel: SCHLUESSEL, fingerabdruck: 'a1b2c3d4e5f60718', ...x,
});

const hatPdftotext = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
function textAus(pdf: Buffer): string {
  const ordner = mkdtempSync(join(tmpdir(), 'notfallblatt-'));
  writeFileSync(join(ordner, 'b.pdf'), pdf);
  execFileSync('pdftotext', ['-layout', join(ordner, 'b.pdf'), join(ordner, 'b.txt')]);
  return readFileSync(join(ordner, 'b.txt'), 'utf8');
}

async function links(pdf: Buffer): Promise<string[]> {
  const doc = await ladePdf(pdf);
  return doc.getPages().flatMap((p) => {
    const a = p.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    return a ? a.asArray().map((r) => doc.context.lookup(r, PDFDict).lookup(PDFName.of('A'), PDFDict).lookup(PDFName.of('URI'), PDFString).decodeText()) : [];
  });
}

describe('Notfallblatt (#814): Gestaltung und Umfang', () => {
  it('genau eine Seite A4 – auch mit langem Namen, Kopie außer Haus und Notfallkontakten', async () => {
    const lang = daten({
      name: 'Familie Özdemir-Beispiel mit einem recht langen Namen der Ablage',
      aussenziele: [{ name: 'Sicherungsziel WebDAV', adresse: 'https://cloud.example.org/remote.php/dav/files/sicherung', ziel: null }, { name: 'Sicherungsziel S3', adresse: null, ziel: 'https://s3.example.net/eimer' }],
      kontakte: [{ name: 'Jonas', erreichbar: '0151 0000000' }, { name: 'Petra', erreichbar: 'petra@example.org' }],
      // #815: mit Notfallcode und einer langen Adresse ohne https.
      adresse: 'http://nas-im-keller.home.arpa:8080', notfallcode: 'WXYZ2345ABCDEFGHJKLMNPQRSTUV',
    });
    // #679/#671: dazu Aufrufe von außen (mehr als fünf) und Ziele nach außen (mehr als fünf).
    const aussen = { ...lang, aufrufe: Array.from({ length: 7 }, (_, i) => ({ name: `Wassermelder ${i}`, adresse: `https://ablage.example.org/api/aufruf/${'K'.repeat(43)}` })),
      ziele: Array.from({ length: 7 }, (_, i) => `hooks-${i}.example.org`) };
    // Mit vielen Aufrufen und Zielen darf das Blatt die Kontakte auf Seite 2 legen (#812) – es wirft nie „zu lang“ (#671).
    for (const d of [aussen, { ...lang, ziele: aussen.ziele }, daten({ ...aussen, name: 'Familie Beispiel' })]) assert.ok((await ladePdf(await notfallblatt(d))).getPageCount() <= 2);
    const knapp = notfallblattPlan(daten({ aufrufe: aussen.aufrufe.slice(0, 1), ziele: ['hooks.example.org'] })).ablage.zeilen.find((z) => z.kurz);
    assert.match(knapp!.kurz!, /1 Adresse nimmt Aufrufe an\. Automatisierungen melden an 1 Rechner/);
    for (const d of [daten(), daten({ notfallcode: 'WXYZ2345ABCDEFGHJKLMNPQRSTUV' }), lang, daten({ aufrufe: aussen.aufrufe.slice(0, 2), ziele: aussen.ziele.slice(0, 2) })]) {
      const doc = await ladePdf(await notfallblatt(d));
      assert.equal(doc.getPageCount(), 1);
      const { width, height } = doc.getPage(0).getSize();
      assert.deepEqual([Math.round(width), Math.round(height)], [595, 842]);
      assert.equal(doc.getTitle(), `Notfallblatt ${d.name}`);
    }
  });

  it('Markenfarben, Logo und Aufbau in der Reihenfolge des Issues', async () => {
    const quelle = readFileSync(join(WURZEL, 'server/src/pdf/notfallblatt.ts'), 'utf8');
    for (const f of ['0x1f / 255, 0x4e / 255, 0x79', '0xe8 / 255, 0xa3 / 255, 0x3d', '0x14 / 255, 0x1a / 255, 0x22']) assert.ok(quelle.includes(f), f);
    const p = notfallblattPlan(daten());
    assert.equal(p.kopf.name, 'Familie Beispiel');
    assert.match(p.kopf.unter, /4\. November 2026.*Ablago 0\.184\.0/);
    assert.deepEqual([p.schluessel.titel, p.ablage.titel, p.fragen.titel, p.hilfe.titel], ['Schlüssel', 'Diese Ablage', 'Wen fragen?', 'Etwas ist passiert?']);
  });

});

describe('Notfallblatt (#814): Schlüssel', () => {
  it('in Vierergruppen, jedes verwechselbare Zeichen mit Lesehilfe, dazu der Fingerabdruck', () => {
    const p = notfallblattPlan(daten());
    assert.equal(p.schluessel.gruppen.map((g) => g.map((z) => z.zeichen).join('')).join(' '), inGruppen(SCHLUESSEL));
    const hilfe = Object.fromEntries(p.schluessel.gruppen.flat().filter((z) => z.hilfe).map((z) => [z.zeichen, z.hilfe]));
    assert.deepEqual(hilfe, { O: 'groß O', '0': 'Null', o: 'klein o', '1': 'Eins', l: 'klein L', I: 'groß i', '-': 'Minus', _: 'Unterstrich' });
    assert.equal(lesehilfe('A'), null);
    assert.deepEqual(Object.keys(VERWECHSELBAR).sort(), ['-', '0', '1', 'I', 'O', '_', 'l', 'o']);
    assert.equal(p.schluessel.fingerabdruck, 'a1b2c3d4e5f60718');
    // Die Null wird durchgestrichen gezeichnet.
    assert.match(readFileSync(join(WURZEL, 'server/src/pdf/notfallblatt.ts'), 'utf8'), /z\.zeichen === '0'\) seite\.drawLine/);
  });

  it('kein QR-Code mit dem Schlüssel: der einzige QR-Code ist der feste Link zur Hilfeseite', async () => {
    const p = notfallblattPlan(daten());
    assert.equal(p.hilfe.qr, NOTFALL_QR);
    // Gleich dem, was die Bibliothek der Weboberfläche für die Adresse der Hilfeseite erzeugt.
    const QRCode = createRequire(join(WURZEL, 'web/package.json'))('qrcode') as { create(t: string, o: object): { modules: { size: number; data: Uint8Array } } };
    const q = QRCode.create(NOTFALL_HILFE, { errorCorrectionLevel: 'M' });
    const zeilen = Array.from({ length: q.modules.size }, (_, y) => Array.from({ length: q.modules.size }, (_, x) => (q.modules.data[y * q.modules.size + x] ? '1' : '0')).join(''));
    assert.deepEqual([...NOTFALL_QR], zeilen);
  });
});

describe('Notfallblatt (#814): Links und Inhalt', () => {
  it('Links klickbar und mit https:// – Deutsch /notfall, Englisch /emergency, die eigene Adresse', async () => {
    const pdf = await notfallblatt(daten());
    const l = await links(pdf);
    assert.ok(l.includes(NOTFALL_HILFE) && l.includes(NOTFALL_HILFE_EN) && l.some((x) => x === 'https://ablage.example.org'), l.join(', '));
    assert.ok(l.every((x) => x.startsWith('https://')));
    assert.deepEqual([NOTFALL_HILFE, NOTFALL_HILFE_EN], ['https://help.ablago.app/notfall', 'https://help.ablago.app/emergency']);
  });

  it('kein http:// auf dem Blatt: eine Adresse ohne https steht ohne Schema und ist nicht klickbar', async () => {
    assert.deepEqual(blattAdresse('http://nas.home.arpa:8080'), { text: 'nas.home.arpa:8080' });
    assert.deepEqual(blattAdresse('https://lena:geheim@cloud.example.org/dav'), { text: 'https://cloud.example.org/dav', link: 'https://cloud.example.org/dav' });
    const d = daten({ adresse: 'http://nas.home.arpa:8080', aussenziele: [{ name: 'Sicherungsziel SFTP', adresse: 'sftp://sicherung.example.net', ziel: null }] });
    assert.ok(!JSON.stringify(notfallblattPlan(d)).includes('http://'));
    const pdf = await notfallblatt(d);
    assert.ok(!(await links(pdf)).some((x) => x === 'http://nas.home.arpa:8080'));
    if (hatPdftotext) assert.ok(!textAus(pdf).includes('http://'));
  });

  it('keine Pfade und Dateinamen aus Docker oder vom NAS, Begriff „Ablage-Id“, kein „dms“', async () => {
    const d = daten({ aussenziele: [{ name: 'Sicherungsziel WebDAV', adresse: 'https://cloud.example.org', ziel: null }] });
    const plan = JSON.stringify(notfallblattPlan(d)).replace(SCHLUESSEL, '');
    for (const verboten of ['/volume1', '/data/', 'docker', 'compose', '.env', 'DB_PASSWORD', '.dms-sicherung', 'RESCUE', 'EINRICHTUNGSCODE', 'ghcr.io', 'Haushalts-Id', 'Haushalt']) assert.ok(!plan.toLowerCase().includes(verboten.toLowerCase()), verboten);
    assert.ok(!/\bdms\b/i.test(plan), 'kein „dms“');
    assert.ok(plan.includes('Ablage-Id'));
    if (hatPdftotext) {
      const text = textAus(await notfallblatt(d));
      for (const s of ['Notfallblatt', 'Ablage-Id', 'Wen fragen?', 'Etwas ist passiert?', 'https://help.ablago.app/notfall', 'Familie Beispiel']) assert.ok(text.includes(s), s);
      const mitCode = textAus(await notfallblatt(daten({ ...d, notfallcode: 'WXYZ2345ABCDEFGHJKLMNPQRSTUV' })));
      for (const s of ['Ausgesperrt?', 'https://ablage.example.org/notfall', 'WXYZ-2345-ABCD-EFGH-JKLM-NPQR-STUV']) assert.ok(mitCode.includes(s), s);
      assert.ok(!/\bdms\b/i.test(text.replace(inGruppen(SCHLUESSEL), '')));
    }
  });

  it('Wen fragen?: Notfallkontakte, sobald es sie gibt (#812) – sonst Zeilen zum Eintragen', () => {
    assert.match(notfallblattPlan(daten()).fragen.leer ?? '', /Name und Telefon/);
    const p = notfallblattPlan(daten({ kontakte: [{ name: 'Jonas', erreichbar: '0151 0000000' }] }));
    assert.equal(p.fragen.leer, null);
    assert.deepEqual(p.fragen.kontakte, [{ name: 'Jonas', erreichbar: '0151 0000000' }]);
  });
});

describe('Handbuchseite „Notfall“ (#814)', () => {
  const seite = readFileSync(join(WURZEL, 'docs/handbuch/admin/docs/was-ist-passiert.md'), 'utf8');
  it('„Was ist dir passiert?“ mit den vier Fällen, im Inhaltsverzeichnis', () => {
    assert.match(seite, /^# Notfall: Was ist dir passiert\?/m);
    for (const fall of ['Ablago startet nicht mehr', 'Mein Gerät ist kaputt', 'Ich komme nicht mehr hinein', 'Jemand anderes muss übernehmen']) assert.ok(seite.includes(fall), fall);
    assert.match(readFileSync(join(WURZEL, 'docs/handbuch/admin/mkdocs.yml'), 'utf8'), /was-ist-passiert\.md/);
  });
  it('Kurzadressen /notfall und /emergency bleiben dauerhaft und führen auf die Seite', () => {
    const v = readFileSync(join(WURZEL, 'docs/handbuch/werkzeuge/veroeffentlichen.py'), 'utf8');
    assert.match(v, /'notfall': 'admin\/aktuell\/was-ist-passiert\/'/);
    // Seit #730 auf die englische Notfallseite.
    assert.match(v, /'emergency': 'admin\/aktuell\/en\/was-ist-passiert\/'/);
  });
  it('englische Notfallseite (#730): gleiche Seite, gleiche Fälle, im englischen Handbuch', () => {
    const seite = readFileSync(join(WURZEL, 'docs/handbuch/admin/docs-en/was-ist-passiert.md'), 'utf8');
    assert.match(seite, /^# Emergency: What has happened to you\?/m);
    assert.ok(seite.includes('https://help.ablago.app/emergency'));
    assert.match(readFileSync(join(WURZEL, 'docs/handbuch/admin/mkdocs.en.yml'), 'utf8'), /was-ist-passiert\.md/);
  });
});
