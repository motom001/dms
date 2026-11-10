/** Größengrenzen an einer Stelle (#901). */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { after, describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { KB, KOERPER_SPIELRAUM, LOGO_MAX, MB, SAMMEL_MAX, UPLOADS_SPEICHER_MAX } from '../src/grenzen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { Paketverwaltung } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';
import { routen } from '../src/routen';

const SRC = new URL('../src/', import.meta.url).pathname;

async function tsDateien(ordner: string): Promise<string[]> {
  const aus: string[] = [];
  for (const e of await readdir(ordner, { withFileTypes: true })) {
    const p = join(ordner, e.name);
    if (e.isDirectory()) aus.push(...(await tsDateien(p)));
    else if (e.name.endsWith('.ts')) aus.push(p);
  }
  return aus;
}

/** Kommentare weg – dort dürfen Größen in Worten stehen („bis 100 MB“). */
const ohneKommentare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

describe('Größengrenzen (#901)', () => {
  let schliessen: (() => Promise<unknown>) | undefined;
  after(async () => { await schliessen?.(); });

  it('kein Byte-Literal außerhalb von grenzen.ts', async () => {
    const funde: string[] = [];
    for (const f of await tsDateien(SRC)) {
      if (f.endsWith('/grenzen.ts')) continue;
      const zeilen = ohneKommentare(await readFile(f, 'utf8')).split('\n');
      zeilen.forEach((z, i) => {
        if (/\b1024\b|\b1048576\b|<<\s*(10|20|30)\b|\b\d[\d_.]*\s*\*\s*(KB|MB|GB)\b/.test(z)) funde.push(`${relative(SRC, f)}:${i + 1}: ${z.trim().slice(0, 100)}`);
      });
    }
    assert.deepEqual(funde, [], 'Grenzen gehören mit Namen nach server/src/grenzen.ts');
  });

  it('jede Route mit rohem Körper nennt eine eigene, endliche Grenze', () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    const alle = routen(d, konten, {});
    const roh = alle.filter((r) => r.roh !== undefined);
    assert.ok(roh.length >= 10, `nur ${roh.length} Routen mit rohem Körper gefunden`);
    for (const r of roh) {
      assert.ok(Number.isFinite(r.roh) && r.roh! >= KB, `${r.methode} ${r.pfad}: roh = ${r.roh}`);
      assert.ok(r.roh! <= SAMMEL_MAX + KOERPER_SPIELRAUM, `${r.methode} ${r.pfad}: ${r.roh! / MB} MB ist mehr als die größte Grenze`);
    }
    // Ströme (Dokumente ablegen) haben immer auch eine Grenze.
    for (const r of alle.filter((x) => x.strom)) assert.ok(r.roh, `${r.methode} ${r.pfad}: Strom ohne Grenze`);
    assert.equal(alle.find((r) => r.pfad === '/api/designs/:id/logo')?.roh, LOGO_MAX + KOERPER_SPIELRAUM);
  });

  it('eine Datei an eine Route ohne eigene Grenze: 415, ohne den Körper zu lesen', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    await konten.einrichten({ email: 'admin@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const { baueApp } = await import('../src/http');
    const app = await baueApp(d, konten, {});
    schliessen = () => app.close();
    let gelesen = 0;
    const stueck = Buffer.alloc(MB);
    const koerper = Readable.from((function* () { for (let i = 0; i < 16; i++) { gelesen += stueck.length; yield stueck; } })());
    const r = await app.inject({ method: 'POST', url: '/api/mappen/folgen', payload: koerper, headers: { 'content-type': 'application/octet-stream', 'x-dms': '1' } });
    assert.equal(r.statusCode, 415, r.body);
    assert.ok(gelesen < 4 * MB, `${gelesen / MB} MB gelesen`);
    // JSON an dieselbe Route geht wie bisher bis zur Anmeldung.
    const j = await app.inject({ method: 'POST', url: '/api/mappen/folgen', payload: { ids: [] }, headers: { 'x-dms': '1' } });
    assert.equal(j.statusCode, 401, j.body);
  });

  it('nicht installierte Pakete: höchstens UPLOADS_SPEICHER_MAX im Arbeitsspeicher, Abgelaufenes fliegt heraus', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'grenzen-'));
    try {
      const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => '1.0.0', katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); }, uploadOrdner: ordner });
      const intern = p as unknown as { behalte(k: string, u: object): void; uploads: Map<string, { zeit: number }> };
      const u = (bytes: number, zeit = Date.now()) => ({ paket: {}, von: { email: 'a@example.org' }, am: '', zeit, pruefung: { art: 'ohne' }, bytes });
      intern.behalte('a', u(200 * MB));
      intern.behalte('b', u(200 * MB));
      intern.behalte('c', u(200 * MB));
      assert.deepEqual([...intern.uploads.keys()], ['b', 'c'], 'das älteste fällt heraus');
      assert.ok(p.uploadsBytes() <= UPLOADS_SPEICHER_MAX);
      // Nach Zeit (#901): auch ohne neuen Upload, im Speicher und im Ordner.
      intern.behalte('alt', u(KB, Date.now() - 31 * 60_000));
      const datei = join(ordner, 'alt.zip');
      await writeFile(datei, 'x');
      const vorher = new Date(Date.now() - 31 * 60_000);
      await utimes(datei, vorher, vorher);
      await p.raeumeUploadsAuf();
      assert.equal(intern.uploads.has('alt'), false);
      assert.deepEqual(await readdir(ordner), []);
    } finally { await rm(ordner, { recursive: true, force: true }); }
  });
});
