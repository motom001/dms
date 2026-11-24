/**
 * Von Ablago mitgeliefert in der Werkbank (#1570): Schalter je mitgeliefertem Anbieter und „Wer macht das?“ – gespeichert
 * als Einstellung, ohne Einstellung alles an (bestehende Installationen ändern sich nicht). Ausgeschaltet ohne Ersatz
 * antwortet die Vermittlung mit `leistung.kein-anbieter` (Grund `aus`), und die Texterkennung lässt ein PDF mit diesem
 * Grund aus statt eines Fehlers.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { EINGEBAUTE_ANBIETER, zurWahl } from '../../shared/src/leistungen';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { speicherAuftraege, textAnbieter, type Anbieter } from '../src/leistungen';
import { speicherRepo } from '../src/repo/speicher';
import { Texterkennung } from '../src/volltext/texterkennung';
import { pdfMitText } from './hilfen';

const angehalten: Texterkennung[] = [];
after(() => {
  for (const t of angehalten) t.stop();
});

function aufbau() {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
  const te = new Texterkennung(speicherRepo(), speicherDateien());
  d.leistungen.anbieter.melde(textAnbieter((x, o) => te.alsAnbieter(x, o)));
  d.leistungen.verbindeSpeicher(speicherAuftraege());
  return { d, einstellungen };
}

/** Ein Test-Paket, das „Text lesen“ für PDFs kann (bis #1572 gibt es keine echten). */
const testPaket = (id = 'test-ocr'): Anbieter => ({
  id,
  art: 'paket',
  bietet: { 'dokument.lesen.text@1': { dateitypen: ['application/pdf'] } },
  fuehreAus: async () => ({ daten: { text: 'vom Paket', seiten: 1 } }),
});

const pdf = () => ({ datei: { inhalt: pdfMitText(['Hallo Welt']), mime: 'application/pdf', name: 'a.pdf' } });
const keinAnbieter = (e: unknown) =>
  e instanceof Fachfehler && (e.details as { code?: string; grund?: string }).code === 'leistung.kein-anbieter';

describe('Von Ablago mitgeliefert: Schalter und „Wer macht das?“ (#1570)', () => {
  it('ohne Einstellung (nach dem Update): alle sechs an, Vorgabe gilt, keine Wahl gespeichert', async () => {
    const { d, einstellungen } = aufbau();
    const s = await d.leistungen.wahl.stand();
    assert.deepEqual(
      s.mitgeliefert.map((a) => [a.id, a.an]),
      Object.keys(EINGEBAUTE_ANBIETER).map((id) => [id, true]),
    );
    assert.deepEqual(
      s.mitgeliefert.map((a) => a.name),
      ['Text aus PDF und Texterkennung', 'Archivfassung (PDF/A)', 'Umwandeln', 'PDF bearbeiten', 'Briefsatz', 'E-Rechnung lesen'],
      'Namen ohne „Ablago ·“',
    );
    assert.ok(s.taetigkeiten.every((x) => x.gewaehlt === null));
    assert.equal(await einstellungen.lies('leistungen_anbieter'), null, 'Lesen schreibt nichts');
    const r = await d.kern.leistung('dokument.lesen.text@1', pdf());
    assert.equal(r.anbieter, 'ablago.text');
  });

  it('„Wer macht das?“ ist bei nur einem je Tätigkeit nicht sichtbar, mit einem Paket schon', async () => {
    const { d } = aufbau();
    assert.deepEqual(zurWahl(await d.leistungen.wahl.stand()), []);
    d.leistungen.anbieter.melde(testPaket());
    const wahl = zurWahl(await d.leistungen.wahl.stand());
    assert.deepEqual(
      wahl.map((x) => [x.leistung, x.macher.map((m) => m.id)]),
      [['dokument.lesen.text@1', ['ablago.text', 'test-ocr']]],
    );
  });

  it('ausschalten ohne Ersatz: „kein Anbieter“ mit Grund „aus“ und Katalog; Folge nennt keinen Ersatz', async () => {
    const { d, einstellungen } = aufbau();
    const s = await d.leistungen.wahl.schalte('ablago.text', false);
    const a = s.mitgeliefert.find((x) => x.id === 'ablago.text')!;
    assert.equal(a.an, false);
    assert.deepEqual(a.taetigkeiten[0].ersatz, []);
    assert.match(a.taetigkeiten[0].katalog, /leistungen\/dokument\.lesen\.text%401$/);
    assert.deepEqual(await einstellungen.lies('leistungen_anbieter'), { aus: ['ablago.text'], wahl: {} });
    await assert.rejects(
      () => d.kern.leistung('dokument.lesen.text@1', pdf()),
      (e: unknown) => keinAnbieter(e) && (e as Fachfehler).status === 409,
    );
    await assert.rejects(
      () => d.kern.leistung('dokument.lesen.text@1', pdf()),
      (e: Fachfehler) => (e.details as { grund: string }).grund === 'aus' && /ausgeschaltet/.test(e.message),
    );
    // Wieder an: wie vorher.
    await d.leistungen.wahl.schalte('ablago.text', true);
    assert.equal((await d.kern.leistung('dokument.lesen.text@1', pdf())).anbieter, 'ablago.text');
    assert.deepEqual(await einstellungen.lies('leistungen_anbieter'), { aus: [], wahl: {} });
  });

  it('ausgeschaltet mit Ersatz: das Paket macht es, und die Folge nennt es', async () => {
    const { d } = aufbau();
    d.leistungen.anbieter.melde(testPaket());
    const s = await d.leistungen.wahl.schalte('ablago.text', false);
    assert.deepEqual(
      s.mitgeliefert.find((x) => x.id === 'ablago.text')!.taetigkeiten[0].ersatz.map((m) => m.id),
      ['test-ocr'],
    );
    assert.equal((await d.kern.leistung('dokument.lesen.text@1', pdf())).anbieter, 'test-ocr');
  });

  it('wählen: ein Paket statt Ablago, zurück zur Vorgabe; Unbekanntes wird abgelehnt', async () => {
    const { d, einstellungen } = aufbau();
    d.leistungen.anbieter.melde(testPaket());
    await d.leistungen.wahl.waehle('dokument.lesen.text@1', 'test-ocr');
    assert.equal((await d.kern.leistung('dokument.lesen.text@1', pdf())).anbieter, 'test-ocr');
    assert.equal((await d.leistungen.wahl.stand()).taetigkeiten.find((x) => x.leistung === 'dokument.lesen.text@1')!.gewaehlt, 'test-ocr');
    await d.leistungen.wahl.waehle('dokument.lesen.text@1', null);
    assert.equal((await d.kern.leistung('dokument.lesen.text@1', pdf())).anbieter, 'ablago.text');
    assert.deepEqual(await einstellungen.lies('leistungen_anbieter'), { aus: [], wahl: {} });
    await assert.rejects(() => d.leistungen.wahl.waehle('dokument.lesen.text@1', 'gibt-es-nicht'), { status: 422 });
    await assert.rejects(() => d.leistungen.wahl.waehle('dokument.lesen.barcode@1', 'test-ocr'), { status: 422 });
    await assert.rejects(() => d.leistungen.wahl.waehle('quatsch@1', null), { status: 422 });
    await assert.rejects(() => d.leistungen.wahl.schalte('test-ocr', false), { status: 404 }, 'nur Mitgeliefertes hat einen Schalter');
    await assert.rejects(() => d.leistungen.wahl.schalte('ablago.text', 'nein'), { status: 422 });
  });

  it('Katalog für alle (GET /api/leistungen) nennt den Stand des Schalters', async () => {
    const { d } = aufbau();
    await d.leistungen.wahl.schalte('ablago.pdf', false);
    const k = d.leistungen.katalog();
    assert.equal(k.find((x) => x.name === 'dokument.bearbeiten.verkleinern@1')!.anbieter[0].an, false);
    assert.equal(k.find((x) => x.name === 'dokument.lesen.text@1')!.anbieter[0].an, true);
  });

  it('Texterkennung: ausgeschaltet ohne Ersatz → „ausgelassen“ mit Grund statt Fehler', async () => {
    const repo = speicherRepo();
    const einstellungen = speicherEinstellungen();
    const dateien = speicherDateien();
    const d = new Dienst(repo, dateien, { einstellungen });
    const t = new Texterkennung(repo, dateien, einstellungen, undefined, async () => ({ pdftotext: true, pdftoppm: true }));
    angehalten.push(t);
    d.leistungen.anbieter.melde(textAnbieter((x, o) => t.alsAnbieter(x, o)));
    d.leistungen.verbindeSpeicher(speicherAuftraege());
    t.leistung = d.kern.leistung;
    d.dokumente.verbindeTexterkennung(t);
    await d.leistungen.wahl.schalte('ablago.text', false);
    const typ = await d.mappentypen.legeTypAn({
      name: 'Beleg',
      felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
      register: [
        { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
        { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
      ],
    });
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Belege' } });
    const dok = (
      await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, pdfMitText(['a']), null)
    ).dokument;
    t.anstossen();
    const ende = Date.now() + 5000;
    let ocr = (await repo.holeDokument(dok.id))?.ocr;
    while (ocr?.stand !== 'ausgelassen' && ocr?.stand !== 'fehler' && Date.now() < ende) {
      await new Promise((r) => setTimeout(r, 20));
      ocr = (await repo.holeDokument(dok.id))?.ocr;
    }
    assert.equal(ocr?.stand, 'ausgelassen', ocr?.info ?? '');
    assert.match(ocr?.info ?? '', /Text lesen.*ausgeschaltet.*Im Katalog nachsehen: https:\/\//);
  });
});
