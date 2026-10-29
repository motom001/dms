/** Export mehrerer Mappen (#152, #153): CSV, Excel, ZIP mit Dokumenten, PDF; Recht E an Sichten. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { pdfAus } from '../src/pdf';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage, type Datei } from '../src/routen';
import { Tresor } from '../src/tresor';
import { csvAus, seriell, spalte } from '../src/xlsx';
import { crc32, zipPuffer } from '../src/zip';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
// 1×1-PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const python = (code: string, ...args: string[]) => execFileSync('python3', ['-c', code, ...args], { encoding: 'utf8' }).trim();
const hatPython = (() => { try { python('import openpyxl'); return true; } catch { return false; } })();

async function aufbau() {
  const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-export-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'mitglied' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const partner = await d.legeTypAn({ name: 'Partner', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] });
  const vertrag = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true },
    { key: 'beginn', label: 'Beginn', typ: 'datum' },
    { key: 'betrag', label: 'Betrag', typ: 'betrag', waehrung: 'EUR' },
    { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: partner.id },
    { key: 'kennwort', label: 'Kennwort', typ: 'passwort' },
    { key: 'notiz', label: 'Notiz', typ: 'text' },
  ] });
  const p = await d.legeMappeAn({ typId: partner.id, werte: { name: 'Stadtwerke' } }, anna.id);
  const v1 = await d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'V-1', beginn: '2026-03-01', betrag: { betrag: 1234.5, waehrung: 'EUR' }, partner: p.id, kennwort: { neu: 'streng-geheim-123' }, notiz: '=SUMME(A1)' } }, anna.id);
  const v2 = await d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'V-2', notiz: 'Zeile;mit "Zeichen"' } }, anna.id);
  await d.ladeHoch(v1.id, { register: 'dokumente', name: 'Vertrag.pdf' }, pdfAus([{ text: 'Seite aus dem Dokument' }]), anna.id);
  await d.ladeHoch(v1.id, { register: 'dokumente', name: 'Foto.png' }, PNG, anna.id);
  await d.ladeHoch(v1.id, { register: 'dokumente', name: 'notiz.txt' }, Buffer.from('nur genannt'), anna.id);
  const sicht = (await d.listeSichten()).find((s) => s.id === vertrag.id)!;
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, { tresor });
  const rufe = async (b: { id: string }, m: string, pf: string, x: Partial<Anfrage> = {}) => tabelle.find((t) => t.methode === m && t.pfad === pf)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) });
  const exportiere = async (b: { id: string }, body: Record<string, unknown>) => {
    const r = await rufe(b, 'POST', '/api/export', { body: { sicht: vertrag.id, ...body } });
    const f = (r as { datei: Datei }).datei;
    const inhalt = Buffer.isBuffer(f.inhalt) ? f.inhalt : Buffer.concat(await (f.inhalt as Readable).toArray() as Buffer[]);
    assert.equal(inhalt.length, f.groesse, 'Content-Length stimmt');
    return { ...f, inhalt };
  };
  return { d, admin, anna, vertrag, sicht, v1, v2, exportiere, rufe };
}

describe('Bausteine (#153)', () => {
  it('CRC32, Spaltenbuchstaben, Excel-Datum, CSV', () => {
    assert.equal(crc32(Buffer.from('123456789')) ^ 0xffffffff, 0xcbf43926 | 0);
    assert.deepEqual([0, 25, 26, 701, 702].map(spalte), ['A', 'Z', 'AA', 'ZZ', 'AAA']);
    assert.equal(seriell('2026-03-01'), 46082);
    const csv = csvAus(['a', 'b'], [['-12,50', '=1+1'], ['x;y', 'z']]).toString('utf8');
    assert.equal(csv, '﻿a;b\r\n-12,50;"\'=1+1"\r\nx;y";z\r\n'.replace('x;y";z', '"x;y";z'));
  });
  it('ZIP lässt sich lesen', { skip: !hatPython && 'ohne python3' }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dms-zip-'));
    await writeFile(join(dir, 'a.zip'), zipPuffer([{ name: 'ä/b.txt', daten: Buffer.from('hallo '.repeat(100)) }]));
    assert.equal(python('import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip(), z.namelist(), z.read(z.namelist()[0])[:5])', join(dir, 'a.zip')), "None ['ä/b.txt'] b'hallo'");
  });
});

describe('Export (#152, #153)', () => {
  it('CSV: Spalten der Liste bzw. alle Felder, deutsch formatiert, ohne Passwörter, Formeln entschärft', async () => {
    const { anna, exportiere } = await aufbau();
    const csv = (await exportiere(anna, { format: 'csv', spalten: 'alle' })).inhalt.toString('utf8');
    const [kopf, z1, z2] = csv.replace('﻿', '').split('\r\n');
    assert.equal(kopf, 'Titel;Nummer;Beginn;Betrag;Partner;Notiz;Angelegt;Angelegt von;Zuletzt geändert;Zuletzt geändert von');
    assert.match(z1, /^V-1;V-1;01\.03\.2026;1\.234,50\s€;Stadtwerke;"'=SUMME\(A1\)";.*;Anna;.*;Anna$/);
    assert.match(z2, /^V-2;V-2;;;;"Zeile;mit ""Zeichen""";/);
    assert.doesNotMatch(csv, /Kennwort|streng-geheim|••/);
  });

  it('Auswahl und Reihenfolge der Liste', async () => {
    const { anna, v2, exportiere } = await aufbau();
    const csv = (await exportiere(anna, { format: 'csv', ids: [v2.id] })).inhalt.toString('utf8');
    assert.equal(csv.trim().split('\r\n').length, 2);
    const ab = (await exportiere(anna, { format: 'csv', sortierung: 'nr', absteigend: true })).inhalt.toString('utf8').split('\r\n');
    assert.match(ab[1], /^V-2/);
  });

  it('Excel: echte Datums- und Betragswerte', { skip: !hatPython && 'ohne python3' }, async () => {
    const { anna, exportiere } = await aufbau();
    const x = await exportiere(anna, { format: 'xlsx', spalten: 'alle' });
    assert.equal(x.name.endsWith('.xlsx'), true);
    const dir = await mkdtemp(join(tmpdir(), 'dms-xlsx-'));
    await writeFile(join(dir, 'e.xlsx'), x.inhalt);
    const r = python('import openpyxl,sys; ws=openpyxl.load_workbook(sys.argv[1]).active; print(ws["A1"].value, type(ws["C2"].value).__name__, ws["C2"].value.date(), ws["D2"].value, ws["D2"].number_format, ws["F2"].value, ws.max_column)', join(dir, 'e.xlsx'));
    assert.equal(r, 'Titel datetime 2026-03-01 1234.5 #,##0.00 "€";-#,##0.00 "€" =SUMME(A1) 10');
  });

  it('ZIP: Tabelle und je Mappe ein Ordner mit Dokumenten', { skip: !hatPython && 'ohne python3' }, async () => {
    const { anna, exportiere } = await aufbau();
    const x = await exportiere(anna, { format: 'zip' });
    const dir = await mkdtemp(join(tmpdir(), 'dms-zipx-'));
    await writeFile(join(dir, 'e.zip'), x.inhalt);
    assert.equal(python('import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip(), sorted(z.namelist()))', join(dir, 'e.zip')),
      "None ['Mappen.csv', 'Mappen.xlsx', 'V-1/Foto.png', 'V-1/Vertrag.pdf', 'V-1/notiz.txt']");
  });

  it('PDF: Seite je Mappe, PDF-Dokumente und Bilder eingebunden, Übersicht, keine Passwörter', async () => {
    const { anna, exportiere } = await aufbau();
    const ohne = await PDFDocument.load((await exportiere(anna, { format: 'pdf' })).inhalt);
    // V-1: Seite + Bild + eingebundenes PDF; V-2: Seite
    assert.equal(ohne.getPageCount(), 4);
    const mit = await exportiere(anna, { format: 'pdf', uebersicht: true });
    assert.equal((await PDFDocument.load(mit.inhalt)).getPageCount(), 5);
    assert.doesNotMatch(mit.inhalt.toString('latin1'), /streng-geheim|Kennwort/);
  });

  it('Recht E an der Sicht, vererbt; Admins immer', async () => {
    const { d, admin, anna, sicht, exportiere } = await aufbau();
    const haus = await d.legeSichtAn({ name: 'Haus', typen: [] });
    await d.aendereSicht(sicht.id, { ...sicht, elternId: haus.id });
    await d.aendereSicht(haus.id, { ...haus, berechtigungen: { grund: { R: true, C: true, E: true }, regeln: [{ id: 'a', name: 'Anna exportiert nicht', wenn: [{ art: 'benutzer', benutzer: [anna.id] }], dann: { E: 'entziehen' }, stopp: false }] } });
    await assert.rejects(exportiere(anna, { format: 'csv' }), status(403));
    assert.equal((await exportiere(admin, { format: 'csv' })).inhalt.length > 0, true);
    await assert.rejects(exportiere(anna, { format: 'doc' }), status(422));
  });
});
