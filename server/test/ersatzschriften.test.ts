/**
 * Schriften zum Rendern (#1329): Prüfung mit dem Probe-PDF (nicht eingebettete Helvetica und Arial), „Couldn't find a
 * font“ beim Rendern, Hinweis unter den eingebauten Werkzeugen, `pdffonts` lesen, Vorschaubilder neu erzeugen.
 * Ohne Schriften nachgestellt mit einer leeren fontconfig (FONTCONFIG_FILE) – so sah das Image vorher aus.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fehlendeProgramme, fehlendeWerkzeuge } from '../../shared/src/werkzeuge';
import { speicherDateien } from '../src/dateispeicher';
import { graubild } from '../src/graubild';
import { popplerSeiten } from '../src/pdfseiten';
import {
  leseFontliste,
  merkeSchriftfehler,
  nichtEingebettet,
  probePdf,
  pruefeSchriften,
  schriftfehlerGesehen,
} from '../src/ersatzschriften';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo/speicher';
import { Texterkennung } from '../src/texterkennung';
import { speicherAblage, Vorschaubilder } from '../src/vorschau';

const da = (cmd: string) => {
  try {
    execFileSync(cmd, ['-v'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ENOENT';
  }
};
const hatPoppler = da('pdftoppm') && da('pdffonts');

/** Während `f` findet fontconfig keine einzige Schrift (wie im Image vor #1329). */
async function ohneSchriften<T>(f: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-fc-'));
  const vorher = process.env.FONTCONFIG_FILE;
  try {
    await writeFile(
      join(dir, 'fonts.conf'),
      `<?xml version="1.0"?>\n<fontconfig><dir>${join(dir, 'leer')}</dir><cachedir>${join(dir, 'cache')}</cachedir></fontconfig>\n`,
    );
    process.env.FONTCONFIG_FILE = join(dir, 'fonts.conf');
    return await f();
  } finally {
    if (vorher === undefined) delete process.env.FONTCONFIG_FILE;
    else process.env.FONTCONFIG_FILE = vorher;
    await rm(dir, { recursive: true, force: true });
  }
}

describe('Schriften zum Rendern (#1329)', () => {
  it('Probe-PDF: Helvetica und Arial, nicht eingebettet; pdffonts-Ausgabe gelesen', async (t) => {
    const pdf = probePdf();
    assert.equal(pdf.subarray(0, 8).toString('latin1'), '%PDF-1.3');
    assert.match(pdf.toString('latin1'), /\/BaseFont \/Helvetica[\s\S]*\/BaseFont \/Arial/);
    assert.doesNotMatch(pdf.toString('latin1'), /FontFile/);
    const aus = [
      'name                                 type              encoding         emb sub uni object ID',
      '------------------------------------ ----------------- ---------------- --- --- --- ---------',
      'Helvetica                            Type 1            WinAnsi          no  no  no       5  0',
      'ABCDEF+NotoSans-Regular              CID TrueType      Identity-H       yes yes yes      9  0',
      'Arial,Bold                           TrueType          WinAnsi          no  no  no      12  0',
      '',
    ].join('\n');
    assert.deepEqual(leseFontliste(aus), ['Helvetica', 'Arial,Bold']);
    assert.deepEqual(leseFontliste('name type\n'), []);
    if (!hatPoppler) {
      t.diagnostic('poppler fehlt – pdffonts nicht geprüft');
      return;
    }
    assert.deepEqual(await nichtEingebettet(pdf), ['Helvetica', 'Arial']);
    assert.equal(await nichtEingebettet(Buffer.from('kein PDF')), null);
  });

  it("mit Ersatzschriften: Prüfung bestanden; ohne: „Couldn't find a font“ – Hinweis unter den Werkzeugen", async (t) => {
    if (!hatPoppler) {
      t.skip('poppler fehlt');
      return;
    }
    assert.equal(await pruefeSchriften(), true);
    assert.equal(await ohneSchriften(() => pruefeSchriften()), false);
    const w = { pdftotext: true, pdftoppm: true, qpdf: true, schriften: false };
    assert.deepEqual(fehlendeWerkzeuge(w), ['schriften']);
    assert.deepEqual(fehlendeProgramme(w, 'schriften'), ['font-liberation', 'font-dejavu']);
    // Ältere Stände ohne Prüfung der Schriften: gilt als vorhanden.
    assert.deepEqual(fehlendeWerkzeuge({ pdftotext: true, pdftoppm: true, qpdf: true }), []);
  });

  it('beim Rendern bemerkt: Werkzeuge melden die Schriften als fehlend, bis „Erneut prüfen“', async (t) => {
    if (!hatPoppler) {
      t.skip('poppler fehlt');
      return;
    }
    assert.equal(merkeSchriftfehler('Syntax Warning: irgendwas', 'test'), false);
    const ocr = new Texterkennung(speicherRepo(), speicherDateien(), speicherEinstellungen());
    assert.equal((await ocr.werkzeugeLaden(true)).schriften, true);
    // Seitenbilder ohne Schriften: Die Bilder entstehen, der Fehler ist gemerkt.
    const seiten = await ohneSchriften(() => popplerSeiten(probePdf()));
    assert.equal(seiten.length, 2);
    assert.ok(schriftfehlerGesehen());
    assert.equal((await ocr.werkzeugeLaden()).schriften, false);
    // Erneut prüfen (jetzt mit Schriften): wieder gut.
    assert.equal((await ocr.werkzeugeLaden(true)).schriften, true);
    assert.equal(schriftfehlerGesehen(), false);
  });

  it('Seitenbild für die Archivfassung (Farbe) ohne Schriften: Fehler mit Grund statt Bild ohne Text; Graustufen weiter', async (t) => {
    if (!hatPoppler) {
      t.skip('poppler fehlt');
      return;
    }
    await ohneSchriften(async () => {
      await assert.rejects(graubild(probePdf(), 1, 72, true), /fehlt der Ersatz/);
      assert.ok((await graubild(probePdf(), 1, 72, false)).length > 0);
    });
    assert.ok((await graubild(probePdf(), 1, 72, true)).length > 0);
    await pruefeSchriften();
  });

  it('Vorschaubilder neu erzeugen: das alte bleibt, bis das neue da ist; nicht ersetzbares bleibt', async () => {
    const dateien = speicherDateien();
    const ablage = speicherAblage();
    let gut = false;
    const v = new Vorschaubilder(ablage, dateien, async () => {
      if (!gut) throw new Error('kaputt');
      return Buffer.from('neu');
    });
    v.nachrangPauseMs = 0;
    const sha256 = 'a'.repeat(64);
    await dateien.schreibe(sha256, Buffer.from('%PDF-1.3 probe'));
    await ablage.schreibe(sha256, Buffer.from('alt'));
    const d = { sha256, mime: 'application/pdf', groesse: 14, name: 'rechnung.pdf' };
    assert.equal(v.neuErzeugen([d, { ...d, mime: 'image/tiff' }]), 1);
    await v.fertig();
    assert.equal((await ablage.lies(sha256))?.toString(), 'alt');
    gut = true;
    v.neuErzeugen([d]);
    await v.fertig();
    assert.equal((await ablage.lies(sha256))?.toString(), 'neu');
  });
});
