/**
 * Eingebaute Werkzeuge (#1189): was fehlt, in fester Reihenfolge, mit den Programmen für Fachleute – und die Prüfung
 * im Kern (Poppler, qpdf).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fehlendeProgramme, fehlendeWerkzeuge } from '../../shared/src/werkzeuge';
import { pruefeWerkzeuge } from '../src/texterkennung';

const da = (cmd: string, arg: string) => { try { execFileSync(cmd, [arg], { stdio: 'ignore' }); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ENOENT'; } };

describe('Eingebaute Werkzeuge (#1189)', () => {
  it('nichts fehlt: kein Hinweis; noch nicht geprüft: auch keiner', () => {
    assert.deepEqual(fehlendeWerkzeuge({ pdftotext: true, pdftoppm: true, qpdf: true }), []);
    assert.deepEqual(fehlendeWerkzeuge(null), []);
    // Ältere Stände ohne qpdf-Prüfung: qpdf gilt als vorhanden.
    assert.deepEqual(fehlendeWerkzeuge({ pdftotext: true, pdftoppm: true }), []);
  });

  it('fehlt etwas: Poppler vor qpdf, mit den fehlenden Programmen', () => {
    const w = { pdftotext: true, pdftoppm: false, qpdf: false };
    assert.deepEqual(fehlendeWerkzeuge(w), ['poppler', 'qpdf']);
    assert.deepEqual(fehlendeProgramme(w, 'poppler'), ['pdftoppm']);
    assert.deepEqual(fehlendeProgramme(w, 'qpdf'), ['qpdf']);
    assert.deepEqual(fehlendeWerkzeuge({ pdftotext: false, pdftoppm: true, qpdf: true }), ['poppler']);
  });

  it('die Prüfung im Kern stimmt mit dem System überein', async () => {
    const w = await pruefeWerkzeuge();
    assert.equal(w.pdftotext, da('pdftotext', '-v'));
    assert.equal(w.pdftoppm, da('pdftoppm', '-v'));
    assert.equal(w.qpdf, da('qpdf', '--version'));
  });
});
