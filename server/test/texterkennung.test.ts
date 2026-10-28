/**
 * Texterkennung und Volltextsuche (#45). Die echten Werkzeuge (tesseract, poppler) laufen nur,
 * wenn sie installiert sind (in GitHub Actions: ja); sonst prüft ein Ersatz die Warteschlange.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { TREFFER_ANFANG, TREFFER_ENDE } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import { bereinigeOcr, pruefeWerkzeuge, tesseractEngine, Texterkennung, type Engine } from '../src/texterkennung';
import { pdfMitText } from './hilfen';

const warte = async (bis: () => Promise<boolean>, ms = 60_000) => {
  const ende = Date.now() + ms;
  while (!(await bis())) {
    if (Date.now() > ende) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 50));
  }
};

async function aufbau(engine: Engine, opt: { volltext?: boolean } = {}) {
  const repo = speicherRepo();
  const dateien = speicherDateien();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(repo, dateien, { einstellungen });
  const t = new Texterkennung(repo, dateien, einstellungen, engine, async () => ({ tesseract: 'tesseract 5', sprachen: ['deu', 'eng'], pdftotext: true, pdftoppm: true }));
  d.verbindeTexterkennung(t);
  const typ = await d.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente', ...(opt.volltext === false ? { volltext: false } : {}) },
  ] });
  return { d, t, repo, typ };
}
const ich = { id: 'x', rolle: 'admin' };

describe('Texterkennung (#45)', () => {
  it('reiht neue Dokumente ein, arbeitet sie ab, übernimmt Text bei gleichem Inhalt und findet ihn in der Suche', async () => {
    let aufrufe = 0;
    const { d, t, repo, typ } = await aufbau(async () => { aufrufe++; return { text: 'Stromrechnung der Stadtwerke Musterstadt für Januar', seiten: 1, info: 'Ersatz' }; });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'R-1' } });
    const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'r.pdf', typ: 'application/pdf' }, pdfMitText(['x']), null);
    assert.equal(dokument.ocr?.stand, 'wartet');
    await warte(async () => (await repo.holeDokument(dokument.id))?.ocr?.stand === 'fertig');
    const zweite = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'R-2' } });
    const kopie = (await d.ladeHoch(zweite.id, { register: 'dokumente', name: 'kopie.pdf', typ: 'application/pdf' }, pdfMitText(['x']), null)).dokument;
    await warte(async () => (await repo.holeDokument(kopie.id))?.ocr?.stand === 'fertig');
    assert.equal(aufrufe, 1, 'gleicher Inhalt: Text übernommen');
    assert.match((await repo.holeDokument(kopie.id))!.ocr!.info!, /übernommen/);

    const ohne = await d.seite(ich, { sicht: `typ:${typ.id}`, suche: 'stadtwerke' });
    assert.equal(ohne.gesamt, 0, 'ohne Häkchen nur Titel und Werte');
    const mit = await d.seite(ich, { sicht: `typ:${typ.id}`, suche: 'stadtwerke', volltext: 'true' });
    assert.equal(mit.gesamt, 2);
    const a = (mit as { ausschnitte?: Record<string, { dokument: string; text: string }> }).ausschnitte![m.id];
    assert.equal(a.dokument, 'r.pdf');
    assert.ok(a.text.includes(`${TREFFER_ANFANG}Stadtwerke${TREFFER_ENDE}`), a.text);
    assert.equal((await d.volltext(dokument.id)).text, 'Stromrechnung der Stadtwerke Musterstadt für Januar');
    assert.equal((await t.status()).zaehler.fertig, 2);
  });

  it('beachtet Register, Dateityp, Größe, Ausschalten, Fehler und „erneut versuchen“', async () => {
    let fehler = true;
    const { d, t, repo, typ } = await aufbau(async () => { if (fehler) throw new Error('kaputt'); return { text: 'ok', seiten: 1, info: 'Ersatz' }; });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'R-1' } });
    const hoch = async (name: string, typ2: string, inhalt: Buffer) => (await d.ladeHoch(m.id, { register: 'dokumente', name, typ: typ2 }, inhalt, null)).dokument.id;
    const pdf = await hoch('a.pdf', 'application/pdf', pdfMitText(['a']));
    await warte(async () => (await repo.holeDokument(pdf))?.ocr?.stand === 'fehler');
    assert.equal((await repo.holeDokument(pdf))!.ocr!.info, 'kaputt');
    fehler = false;
    await d.texterkennungErneut(pdf);
    await warte(async () => (await repo.holeDokument(pdf))?.ocr?.stand === 'fertig');

    const txt = await hoch('n.txt', 'text/plain', Buffer.from('hallo'));
    await warte(async () => (await repo.holeDokument(txt))?.ocr?.stand === 'ausgelassen');
    await t.speichere({ typen: { 'application/pdf': 'aus' } });
    const aus = await hoch('b.pdf', 'application/pdf', pdfMitText(['b']));
    await warte(async () => (await repo.holeDokument(aus))?.ocr?.stand === 'ausgelassen');
    assert.match((await repo.holeDokument(aus))!.ocr!.info!, /ausgeschaltet/);
    await t.speichere({ typen: { 'application/pdf': 'tesseract' }, maxMB: 1 });
    const gross = await hoch('c.pdf', 'application/pdf', Buffer.concat([pdfMitText(['c']), Buffer.alloc(1024 * 1024 + 1)]));
    await warte(async () => (await repo.holeDokument(gross))?.ocr?.stand === 'ausgelassen');
    await t.speichere({ aktiv: false });
    const spaeter = await hoch('d.pdf', 'application/pdf', pdfMitText(['d']));
    await new Promise((r) => setTimeout(r, 100));
    assert.equal((await repo.holeDokument(spaeter))!.ocr!.stand, 'wartet', 'ausgeschaltet: bleibt in der Warteschlange');
    await t.speichere({ aktiv: true });
    await warte(async () => (await repo.holeDokument(spaeter))?.ocr?.stand === 'fertig');

    assert.throws(() => bereinigeOcr({ auftraege: 9 }), /Aufträge/);
    assert.throws(() => bereinigeOcr({ sprachen: 'deu; rm -rf' }), /Sprachen/);
  });

  it('holt Volltext für vorhandene Dokumente nach – nur in Registern mit Volltext', async () => {
    const { d, repo, typ } = await aufbau(async () => ({ text: 'x', seiten: 1, info: 'Ersatz' }), { volltext: false });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'R-1' } });
    const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, pdfMitText(['a']), null);
    assert.equal(dokument.ocr?.stand, 'keiner', 'Register ohne Volltext');
    assert.equal(await d.volltextNachholen(), 0);
    await d.aendereTyp(typ.id, { ...typ, register: typ.register.map((r) => ({ ...r, volltext: true })) });
    assert.equal(await d.volltextNachholen(), 1);
    await warte(async () => (await repo.holeDokument(dokument.id))?.ocr?.stand === 'fertig');
  });

  it('liest die Textebene eines PDFs und erkennt Text auf Bildern (mit tesseract und poppler)', async (k) => {
    const w = await pruefeWerkzeuge();
    if (!w.tesseract || !w.pdftotext || !w.pdftoppm) { k.skip('tesseract oder poppler nicht installiert'); return; }
    const { mkdtemp, writeFile, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = await mkdtemp(join(tmpdir(), 'dms-ocr-test-'));
    const o = { maxSeiten: 50, sprachen: 'deu+eng', werkzeuge: w };

    const mitText = join(dir, 'text.pdf');
    await writeFile(mitText, pdfMitText(['Rechnung Nummer 4711', 'Stadtwerke Musterstadt GmbH']));
    const a = await tesseractEngine(mitText, 'application/pdf', o);
    assert.match(a.text, /Rechnung Nummer 4711/);
    assert.equal(a.info, 'Textebene des PDFs');

    // Kaum Text auf der Seite: gilt als gescannt und geht durch die Texterkennung.
    const kurz = join(dir, 'kurz.pdf');
    await writeFile(kurz, pdfMitText(['INVOICE 2026'], 48));
    const b = await tesseractEngine(kurz, 'application/pdf', o);
    assert.match(b.text, /INVOICE/i);
    assert.match(b.info, /Texterkennung/);

    execFileSync('pdftoppm', ['-r', '150', '-png', '-singlefile', mitText, join(dir, 'bild')]);
    const c = await tesseractEngine(join(dir, 'bild.png'), 'image/png', o);
    assert.match(c.text, /Stadtwerke/);
    assert.ok((await readFile(join(dir, 'bild.png'))).length > 0);
  });
});

describe('Aufträge der Texterkennung in der Werkbank (#61)', () => {
  it('listet je Stand, startet neu, bricht ab; Passwort-PDFs werden ausgelassen', async () => {
    let modus: 'fehler' | 'passwort' | 'haengt' | 'ok' = 'fehler';
    const { d, t, repo, typ } = await aufbau(async (_p, _m, o) => {
      if (modus === 'fehler') throw new Error('kaputt');
      if (modus === 'passwort') throw new Error('Command Line Error: Incorrect password');
      if (modus === 'haengt') await new Promise((_r, nein) => o.signal?.addEventListener('abort', () => nein(new Error('abgebrochen'))));
      return { text: 'ok', seiten: 1, info: 'Ersatz' };
    });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'R-1' } });
    const hoch = async (name: string, i: string) => (await d.ladeHoch(m.id, { register: 'dokumente', name, typ: 'application/pdf' }, pdfMitText([i]), null)).dokument.id;
    const a = await hoch('a.pdf', 'a');
    await warte(async () => (await repo.holeDokument(a))?.ocr?.stand === 'fehler');
    const liste = await t.auftraege({ stand: 'fehler' });
    assert.equal(liste.gesamt, 1);
    assert.deepEqual([liste.eintraege[0].dokument.name, liste.eintraege[0].mappeTitel, liste.eintraege[0].typId], ['a.pdf', 'R-1', typ.id]);
    modus = 'ok';
    assert.equal((await t.fehlerNeuStarten('admin')).eingereiht, 1);
    await warte(async () => (await repo.holeDokument(a))?.ocr?.stand === 'fertig');

    modus = 'passwort';
    const p = await hoch('p.pdf', 'p');
    await warte(async () => (await repo.holeDokument(p))?.ocr?.stand === 'ausgelassen');
    assert.equal((await repo.holeDokument(p))!.ocr!.info, 'Das PDF ist mit einem Passwort geschützt.');

    modus = 'haengt';
    const h = await hoch('h.pdf', 'h');
    await warte(async () => (await repo.holeDokument(h))?.ocr?.stand === 'laeuft');
    assert.equal((await t.abbrechen([h], 'admin')).abgebrochen, 1);
    await warte(async () => (await repo.holeDokument(h))?.ocr?.stand === 'ausgelassen');
    assert.equal((await repo.holeDokument(h))!.ocr!.info, 'Vom Administrator abgebrochen.');
  });
});
