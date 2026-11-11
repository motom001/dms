/**
 * Volltext-Ablauf mit Texterkennung als Paket (#458): Der Kern liest die Textebene, meldet „Volltext fertig“ an die
 * Pakete (auch ohne Text), Dokumente ohne Text warten auf das Paket; „Volltext neu erzeugen“ als Auftrag.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument, rgb } from 'pdf-lib';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { kenntVolltextOhneText, liesCode } from '../../shared/src/pakete';
import { infoWartet, volltextHerkunft } from '../../shared/src/volltext';
import { Auftraege } from '../src/auftrag';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import { Texterkennung, type Engine } from '../src/texterkennung';
import { pdfMitText } from './hilfen';

const warte = async (bis: () => Promise<boolean>, ms = 20_000) => {
  const ende = Date.now() + ms;
  while (!(await bis())) {
    if (Date.now() > ende) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 20));
  }
};

/** Ein PNG in Graustufen (8 Bit), Breite × Höhe, ohne Bildbibliothek. */
function kleinesPng(b: number, h: number): Buffer {
  const stueck = (art: string, daten: Buffer) => {
    const kopf = Buffer.alloc(4); kopf.writeUInt32BE(daten.length);
    const typ = Buffer.from(art, 'latin1');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typ, daten])));
    return Buffer.concat([kopf, typ, daten, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(b, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const zeilen = Buffer.concat(Array.from({ length: h }, () => Buffer.from([0, ...Array.from({ length: b }, () => 200)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), stueck('IHDR', ihdr), stueck('IDAT', deflateSync(zeilen)), stueck('IEND', Buffer.alloc(0))]);
}

const TEXT = 'Stromrechnung der Stadtwerke Musterstadt für Januar';

/** Ein installiertes Paket (nur der Datensatz; Ereignisse landen im Ausgangskorb). */
const paket = (id: string, o: { schnittstellen?: string[]; dms?: string; ereignisse?: string[] } = {}): InstalliertesPaket => ({
  id, name: id === 'texterkennung' ? 'Texterkennung' : `Paket ${id}`, version: '2.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' },
  herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
  typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, ...(o.dms ? { dms: o.dms } : {}),
  laeufer: { sprache: 'c', ereignisse: (o.ereignisse ?? ['volltext.fertig']) as never, rechte: { lesen: ['*'], schreiben: [], dokumente: 'schreiben', ...(o.schnittstellen ? { schnittstellen: o.schnittstellen as never } : {}) }, netz: [] },
});

/**
 * Aufbau mit Ersatz-Engine (Textebene): „Scans“ haben keine Textebene, „gemischt“ hat Text und Seiten ohne Text.
 * Zählt, wie oft der Kern eine Datei las.
 */
async function aufbau(mitPaket = true) {
  const repo = speicherRepo();
  const dateien = speicherDateien();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(repo, dateien, { einstellungen });
  const laeufe = { gelesen: 0 };
  let scanJetzt: boolean | 'gemischt' = false;
  const engine: Engine = async () => {
    const scan = scanJetzt;
    laeufe.gelesen++;
    if (scan === 'gemischt') return { text: TEXT, seiten: 3, info: 'Textebene des PDFs', ohneText: [2, 3] };
    return scan ? { text: '', seiten: 2, info: 'Textebene des PDFs', ohneText: [1, 2] } : { text: TEXT, seiten: 1, info: 'Textebene des PDFs', ohneText: [] };
  };
  const t = new Texterkennung(repo, dateien, einstellungen, engine, async () => ({ pdftotext: true, pdftoppm: true }));
  d.dokumente.verbindeTexterkennung(t);
  t.paket = () => d.volltexte.texterkennungPaket();
  t.nachher = (dok, e, k) => {
    if (e.stand !== 'fertig' && e.stand !== 'paket') return;
    void d.volltexte.volltextFertig({ dokument: dok.id, mappe: dok.mappeId }, { quelle: 'kern', text: k.text, mime: dok.mime, seiten: e.seiten ?? null, neu: k.neu, seitenOhneText: k.seitenOhneText });
  };
  if (mitPaket) await d.kern.repo.speicherePaket(paket('texterkennung', { schnittstellen: ['dms:texterkennung'], dms: '>=0.133.0' }));
  // Ein älteres Paket (z. B. für Vektoren) kennt nur Ereignisse mit Text; ein Paket von vor 0.133.0 hört auf texterkennung.fertig.
  await d.kern.repo.speicherePaket(paket('vektor', { dms: '>=0.120.0' }));
  await d.kern.repo.speicherePaket(paket('alt', { dms: '>=0.88.0', ereignisse: ['texterkennung.fertig'] }));
  const typ = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
  ] });
  const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: 'R-1' } });
  const hoch = async (name: string, mime: string, inhalt: Buffer, scan: boolean | 'gemischt' = false) => {
    scanJetzt = scan;
    const id = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name, typ: mime }, inhalt, null)).dokument.id;
    await warte(async () => !['wartet', 'laeuft'].includes((await repo.holeDokument(id))!.ocr!.stand));
    scanJetzt = false;
    return id;
  };
  const ereignisse = async (art = 'volltext.fertig') => (await d.ereignisse.verteile(), await repo.faelligeEreignisse(1000)).filter((e) => e.art === art);
  /** Wie die nächste gelesene Datei aussieht (für Dokumente, die später noch einmal gelesen werden). */
  const alsScan = (v: boolean | 'gemischt') => { scanJetzt = v; };
  return { d, t, repo, m, hoch, laeufe, ereignisse, alsScan };
}

describe('Volltext-Ablauf mit Texterkennung als Paket (#458)', () => {
  it('PDF mit Text: Text aus dem PDF, Ereignis mit text: true an alle; Scan: wartet auf das Paket, Ereignis ohne Text nur an Pakete, die es kennen', async () => {
    const { d, repo, hoch, laeufe, ereignisse } = await aufbau();
    const mitText = await hoch('brief.pdf', 'application/pdf', pdfMitText([TEXT]));
    const dok = (await repo.holeDokument(mitText))!;
    assert.equal(dok.ocr?.stand, 'fertig');
    assert.deepEqual(volltextHerkunft(dok.ocr), { art: 'pdf' });
    assert.equal((await d.volltexte.volltext(mitText)).text, TEXT);
    let ev = await ereignisse();
    assert.deepEqual(ev.map((e) => e.paketId).sort(), ['texterkennung', 'vektor']);
    assert.equal(ev[0].daten.text, true);
    assert.equal(ev[0].daten.quelle, 'kern');
    assert.equal(ev[0].daten.mime, 'application/pdf');
    assert.equal(ev[0].daten.neu, undefined);
    // Gleichlaut für ältere Pakete: texterkennung.fertig nach dem Schritt des Kerns.
    assert.equal((await ereignisse('texterkennung.fertig')).length, 1);

    const scan = await hoch('scan.pdf', 'application/pdf', pdfMitText(['scan']), true);
    const s = (await repo.holeDokument(scan))!;
    assert.equal(s.ocr?.stand, 'paket');
    assert.equal(s.ocr?.info, infoWartet({ name: 'Texterkennung' }));
    assert.deepEqual(volltextHerkunft(s.ocr), { art: 'wartet', paket: 'Texterkennung' });
    assert.equal(s.ocr?.seiten, 2);
    ev = (await ereignisse()).filter((e) => e.daten.dokument === scan);
    assert.deepEqual(ev.map((e) => e.paketId), ['texterkennung'], 'ohne Text nicht an das ältere Paket');
    assert.equal(ev[0].daten.text, false);
    assert.equal((await ereignisse('texterkennung.fertig')).length, 2, 'texterkennung.fertig auch ohne Text');

    // Bilder haben keine Textebene: gleich ans Paket, ohne die Datei zu lesen.
    const vorher = laeufe.gelesen;
    const bild = await hoch('foto.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
    assert.equal((await repo.holeDokument(bild))!.ocr?.stand, 'paket');
    assert.equal(laeufe.gelesen, vorher);
  });

  it('gemischtes PDF (Text und Scan-Seiten): wartet auf das Paket, Ereignis mit Text und seitenOhneText', async () => {
    const { d, repo, hoch, ereignisse } = await aufbau();
    const id = await hoch('gemischt.pdf', 'application/pdf', pdfMitText(['gemischt']), 'gemischt');
    assert.equal((await repo.holeDokument(id))!.ocr?.stand, 'paket');
    assert.equal((await d.volltexte.volltext(id)).text, TEXT, 'Text der Textseiten schon durchsuchbar');
    const [e] = (await ereignisse()).filter((x) => x.daten.dokument === id && x.paketId === 'texterkennung');
    assert.equal(e.daten.text, true);
    assert.deepEqual(e.daten.seitenOhneText, [2, 3]);
  });

  it('Paket schreibt den Volltext: fertig, Herkunft Paket, Ereignis an die anderen (nicht an sich selbst)', async () => {
    const { d, repo, hoch, ereignisse } = await aufbau();
    const scan = await hoch('scan.pdf', 'application/pdf', pdfMitText(['scan']), true);
    d.kern.paketKonten.set('konto-texterkennung', 'texterkennung');
    await d.volltexte.schreibeVolltext(scan, { text: TEXT, seiten: 2 }, { id: 'konto-texterkennung', herkunft: 'Texterkennung 2.0.0', paket: true });
    const s = (await repo.holeDokument(scan))!;
    assert.equal(s.ocr?.stand, 'fertig');
    assert.deepEqual(volltextHerkunft(s.ocr), { art: 'paket', paket: 'Texterkennung 2.0.0' });
    const ev = (await ereignisse()).filter((e) => e.daten.dokument === scan && e.daten.quelle === 'paket');
    assert.deepEqual(ev.map((e) => e.paketId), ['vektor'], 'das schreibende Paket bekommt sein Ergebnis nicht zurück');
    assert.equal(ev[0].daten.paket, 'texterkennung');
    // Ergebnis nach dem Schreiben ändert nichts mehr.
    await d.volltexte.nachTexterkennungsEreignis('texterkennung', { art: 'volltext.fertig', daten: { dokument: scan } }, { ok: true, text: '2 Seiten' });
    assert.equal((await repo.holeDokument(scan))!.ocr?.stand, 'fertig');
    assert.match((await repo.holeDokument(scan))!.ocr!.info!, /^Texterkennung durch Paket/);
  });

  it('Paket fertig ohne zu schreiben: wartet nicht länger; aufgegeben: Fehler; Fortschritt am Dokument', async () => {
    const { d, repo, hoch } = await aufbau();
    const a = await hoch('a.pdf', 'application/pdf', pdfMitText(['a']), true);
    const b = await hoch('b.pdf', 'application/pdf', pdfMitText(['b']), true);
    await d.volltexte.texterkennungFortschritt('texterkennung', { art: 'volltext.fertig', daten: { dokument: a } }, { fortschritt: 'Seite 20 von 64' });
    assert.equal((await repo.holeDokument(a))!.ocr?.info, 'wartet auf Texterkennung (Paket Texterkennung) – Seite 20 von 64');
    assert.deepEqual(volltextHerkunft((await repo.holeDokument(a))!.ocr), { art: 'wartet', paket: 'Texterkennung' });
    // Fremdes Paket: ändert nichts.
    await d.volltexte.nachTexterkennungsEreignis('vektor', { art: 'volltext.fertig', daten: { dokument: a } }, { ok: true, text: '' });
    assert.equal((await repo.holeDokument(a))!.ocr?.stand, 'paket');
    await d.volltexte.nachTexterkennungsEreignis('texterkennung', { art: 'volltext.fertig', daten: { dokument: a } }, { ok: true, text: 'Mappentyp nicht gewählt' });
    assert.equal((await repo.holeDokument(a))!.ocr?.stand, 'fertig');
    assert.equal((await repo.holeDokument(a))!.ocr?.info, 'ohne Text – Paket Texterkennung: Mappentyp nicht gewählt');
    // Ein Fehlversuch mit späterer Wiederholung ändert nichts, erst das Aufgeben.
    await d.volltexte.nachTexterkennungsEreignis('texterkennung', { art: 'volltext.fertig', daten: { dokument: b } }, { ok: false, text: '', fehler: 'Zeitgrenze erreicht' });
    assert.equal((await repo.holeDokument(b))!.ocr?.stand, 'paket');
    await d.volltexte.nachTexterkennungsEreignis('texterkennung', { art: 'volltext.fertig', daten: { dokument: b } }, { ok: false, text: '', fehler: 'Zeitgrenze erreicht', aufgegeben: true });
    assert.equal((await repo.holeDokument(b))!.ocr?.stand, 'fehler');
    assert.match((await repo.holeDokument(b))!.ocr!.info!, /Texterkennung durch Paket Texterkennung fehlgeschlagen: Zeitgrenze erreicht/);
  });

  it('„Volltext neu erzeugen“: ohne Text bzw. alle (mit neu), als Auftrag mit Fortschritt; abbrechbar', async () => {
    const { d, repo, hoch, ereignisse } = await aufbau();
    const mitText = await hoch('brief.pdf', 'application/pdf', pdfMitText([TEXT]));
    const scan = await hoch('scan.pdf', 'application/pdf', pdfMitText(['scan']), true);
    assert.deepEqual(await d.volltexte.volltextNeuAnzahl('ohne'), { umfang: 'ohne', anzahl: 1 });
    assert.deepEqual(await d.volltexte.volltextNeuAnzahl('alle'), { umfang: 'alle', anzahl: 2 });
    const vorher = (await ereignisse()).length;
    const a = d.volltexte.volltextNeu('ohne', 'admin@example.org');
    assert.equal(a.abbrechbar, true);
    const fertig = (await d.auftraege.warte())!;
    assert.equal(fertig.status, 'fertig');
    assert.deepEqual(fertig.ergebnis, { umfang: 'ohne', dokumente: 1, erledigt: 1, abgebrochen: false, paket: 'Texterkennung' });
    const neu = (await ereignisse()).slice(vorher);
    assert.ok(neu.every((e) => e.daten.dokument === scan && !e.daten.neu), JSON.stringify(neu.map((e) => e.daten)));

    d.volltexte.volltextNeu('alle', 'admin@example.org');
    assert.deepEqual((await d.auftraege.warte())!.ergebnis, { umfang: 'alle', dokumente: 2, erledigt: 2, abgebrochen: false, paket: 'Texterkennung' });
    const alle = (await ereignisse()).filter((e) => e.paketId === 'texterkennung' && e.daten.neu === true);
    assert.deepEqual(alle.map((e) => e.daten.dokument).sort(), [mitText, scan].sort(), 'neu: true für alle');
    // Mit „neu“ wartet auch das Dokument mit Text auf das Paket; sein Text bleibt so lange für die Suche stehen.
    assert.equal((await repo.holeDokument(mitText))!.ocr?.stand, 'paket');
    assert.equal((await d.volltexte.volltext(mitText)).text, TEXT);
  });

  it('am Dokument „neu erzeugen“: Ereignis mit neu; abbrechen verwirft das offene Ereignis', async () => {
    const { d, t, repo, hoch, ereignisse } = await aufbau();
    const mitText = await hoch('brief.pdf', 'application/pdf', pdfMitText([TEXT]));
    await d.volltexte.texterkennungErneut(mitText);
    await warte(async () => (await repo.holeDokument(mitText))!.ocr?.stand === 'paket');
    const ev = (await ereignisse()).filter((e) => e.daten.dokument === mitText && e.paketId === 'texterkennung');
    assert.equal(ev.at(-1)!.daten.neu, true);
    assert.deepEqual(await t.abbrechen([mitText], 'admin'), { abgebrochen: 1 });
    assert.equal((await repo.holeDokument(mitText))!.ocr?.stand, 'ausgelassen');
    assert.equal((await ereignisse()).filter((e) => e.daten.dokument === mitText).length, 0, 'offene Ereignisse zum Dokument verworfen');
    assert.equal((await d.volltexte.volltext(mitText)).text, TEXT, 'Text aus dem PDF bleibt');
  });

  it('ohne Paket (#459): Scans warten auf ein Paket; wird eins installiert, gehen sie an das Paket', async () => {
    const { d, repo, hoch, ereignisse, alsScan } = await aufbau(false);
    const mitText = await hoch('brief.pdf', 'application/pdf', pdfMitText([TEXT]));
    assert.equal((await repo.holeDokument(mitText))!.ocr?.stand, 'fertig', 'PDFs mit Text brauchen kein Paket');
    const scan = await hoch('scan.pdf', 'application/pdf', pdfMitText(['scan']), true);
    const s = (await repo.holeDokument(scan))!;
    assert.equal(s.ocr?.stand, 'paket');
    assert.equal(s.ocr?.info, infoWartet(null));
    assert.deepEqual(volltextHerkunft(s.ocr), { art: 'wartet', paket: null });
    assert.deepEqual((await ereignisse()).map((e) => [e.paketId, e.daten.text]), [['vektor', true]], 'ohne Text an kein älteres Paket');
    // „Neu erzeugen“ ohne Paket: Der Text aus dem PDF gilt weiter.
    await d.volltexte.texterkennungErneut(mitText);
    await warte(async () => (await repo.holeDokument(mitText))!.ocr?.stand === 'fertig');
    assert.equal((await d.volltexte.volltext(mitText)).text, TEXT);
    // Paket kommt: Wartende gehen wie neue Dokumente durch Textebene und Paket.
    await d.kern.repo.speicherePaket(paket('texterkennung', { schnittstellen: ['dms:texterkennung'], dms: '>=0.133.0' }));
    alsScan(true);
    assert.equal(await d.volltexte.texterkennungPaketDa(), 1);
    await warte(async () => (await repo.holeDokument(scan))!.ocr?.info === infoWartet({ name: 'Texterkennung' }));
    const ev = (await ereignisse()).filter((e) => e.paketId === 'texterkennung');
    assert.deepEqual(ev.map((e) => [e.daten.dokument, e.daten.text]), [[scan, false]]);
    assert.deepEqual((await d.volltexte.texterkennungPaket())?.sprachen, ['deu', 'eng']);
    await d.kern.repo.speicherePaket({ ...paket('texterkennung_fra'), abhaengigkeiten: { texterkennung: '>=2.0.0' } });
    assert.deepEqual((await d.volltexte.texterkennungPaket())?.sprachen, ['deu', 'eng', 'fra'], 'Sprach-Zusatzpaket (bisherige Id)');
    // #1084: Ergänzung mit Punkt.
    await d.kern.repo.speicherePaket({ ...paket('texterkennung.tur'), abhaengigkeiten: { texterkennung: '>=2.0.0' } });
    assert.deepEqual((await d.volltexte.texterkennungPaket())?.sprachen, ['deu', 'eng', 'fra', 'tur'], 'Sprach-Zusatzpaket mit Punkt');
  });

  it('Update (#459): vorhandener Volltext – auch von der früheren eingebauten Texterkennung – bleibt; Wartende gehen an das Paket', async () => {
    const { d, t, repo, m, ereignisse } = await aufbau();
    // Bestand wie vor dem Update: erkannt von der eingebauten Texterkennung, Textebene, noch wartend.
    const lege = async (name: string) => (await repo.legeDokumentAn({ id: randomUUID(), mappeId: m.id, registerKey: 'dokumente', name, mime: 'application/pdf', groesse: 10, sha256: createHash('sha256').update(name).digest('hex'), anzeigbar: true, erstellt: new Date().toISOString(), erstelltVon: null })).id;
    const alt = await lege('alt'), ebene = await lege('ebene'), wartend = await lege('wartend');
    await repo.ocrSetze(alt, { stand: 'fertig', text: 'Gescannter Brief der Stadtwerke', seiten: 1, info: 'Texterkennung (deu+eng) · Sprache: deu (90 %)', sprache: 'deu' });
    await repo.ocrSetze(ebene, { stand: 'fertig', text: TEXT, seiten: 1, info: 'Textebene des PDFs' });
    await (d as unknown as { dateien: { schreibe(sha: string, b: Buffer): Promise<void> } }).dateien.schreibe(createHash('sha256').update('wartend').digest('hex'), pdfMitText(['wartend']));
    await repo.ocrEinreihen([wartend]);
    await t.start();
    await warte(async () => (await repo.holeDokument(wartend))!.ocr?.stand !== 'wartet');
    assert.equal((await d.volltexte.volltext(alt)).text, 'Gescannter Brief der Stadtwerke');
    assert.equal((await repo.holeDokument(alt))!.ocr?.info, 'Texterkennung (deu+eng) · Sprache: deu (90 %)');
    assert.deepEqual(volltextHerkunft((await repo.holeDokument(alt))!.ocr), { art: 'eingebaut' });
    assert.equal((await d.volltexte.volltext(ebene)).text, TEXT);
    // Das Ereignis für das Paket entsteht kurz nach dem Wechsel des Stands (im Hintergrund) – darauf warten statt sofort prüfen.
    await warte(async () => (await ereignisse()).some((e) => e.paketId === 'texterkennung' && e.daten.dokument === wartend));
    assert.deepEqual(await repo.volltextHerkunft(), { pdf: 2, paket: 0, api: 0, eingebaut: 1, sonst: 0, ohneText: 0 });
  });

  it('Manifest: dms:texterkennung ist bekannt; wer bekommt Ereignisse ohne Text', () => {
    const c = liesCode({ sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'schreiben', schnittstellen: ['dms:texterkennung'] } });
    assert.deepEqual(c.fehler, []);
    assert.equal(kenntVolltextOhneText({ dms: '>=0.120.0', laeufer: undefined }), false);
    assert.equal(kenntVolltextOhneText({ dms: '>=0.133.0', laeufer: undefined }), true);
    assert.equal(kenntVolltextOhneText({ dms: '^0.133.0', laeufer: undefined }), true);
    assert.equal(kenntVolltextOhneText({ laeufer: undefined }), false, 'ältere Installation ohne dms');
    assert.equal(kenntVolltextOhneText({ dms: '>=0.88.0', laeufer: c.code! }), true, 'dms:texterkennung genügt');
  });

  it('Auftrag abbrechen: nur abbrechbare, die Arbeit endet von selbst', async () => {
    const a = new Auftraege();
    a.starte('x', 'Nicht abbrechbar', async () => { await new Promise((r) => setTimeout(r, 30)); });
    await assert.rejects(() => a.abbrechen(), /lässt sich nicht abbrechen/);
    await a.warte();
    let schritte = 0;
    const b = a.starte('y', 'Abbrechbar', async (_f, signal) => { while (!signal!.aborted) { schritte++; await new Promise((r) => setTimeout(r, 5)); } return { schritte }; }, [], { abbrechbar: true });
    await new Promise((r) => setTimeout(r, 30));
    await assert.rejects(() => a.abbrechen('falsch'), /kein Auftrag/);
    assert.equal((await a.abbrechen(b.id)).abgebrochen, true);
    const ende = (await a.warte())!;
    assert.equal(ende.status, 'fertig');
    assert.ok(schritte > 0);
  });

  const poppler = (() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
  it('Seite als Graustufenbild auch für PNG (Originalgröße)', { skip: !poppler && 'ohne poppler' }, async () => {
    const { d, hoch } = await aufbau();
    const png = kleinesPng(3, 2);
    const id = await hoch('bild.png', 'image/png', png);
    const pgm = await d.seiteAlsGraubild(id, 1, 300);
    assert.match(pgm.subarray(0, 12).toString('latin1'), /^P5\s+3\s+2\s+255/);
    await assert.rejects(d.seiteAlsGraubild(id, 2, 300), /hat eine Seite/);
    const pdf = await PDFDocument.create(); pdf.addPage([100, 100]);
    const pid = await hoch('leer.pdf', 'application/pdf', Buffer.from(await pdf.save()));
    assert.match((await d.seiteAlsGraubild(pid, 1, 72)).subarray(0, 2).toString('latin1'), /^P5/);
  });

  it('Farbiges Seitenbild für die Archivfassung (#716): PPM mit Farbe, ohne farbe weiter Graustufen', { skip: !poppler && 'ohne poppler' }, async () => {
    const { d, hoch } = await aufbau();
    const pdf = await PDFDocument.create();
    pdf.addPage([72, 72]).drawRectangle({ x: 0, y: 0, width: 72, height: 72, color: rgb(1, 0, 0) });
    const id = await hoch('rot.pdf', 'application/pdf', Buffer.from(await pdf.save()));
    const farbig = await d.seiteAlsGraubild(id, 1, 72, true);
    const kopf = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(farbig.subarray(0, 20).toString('latin1'));
    assert.ok(kopf, 'PPM P6');
    const mitte = farbig.length - Number(kopf[1]) * Number(kopf[2]) * 3 + (Math.floor(Number(kopf[2]) / 2) * Number(kopf[1]) + Math.floor(Number(kopf[1]) / 2)) * 3;
    assert.ok(farbig[mitte] > 200 && farbig[mitte + 1] < 60 && farbig[mitte + 2] < 60, `rot: ${[...farbig.subarray(mitte, mitte + 3)]}`);
    const grau = await d.seiteAlsGraubild(id, 1, 72);
    assert.match(grau.subarray(0, 2).toString('latin1'), /^P5/);
    assert.ok(farbig.length > grau.length * 2.5, 'drei Bytes je Bildpunkt');
    await assert.rejects(d.seiteAlsGraubild(id, 1, 500, true), /dpi/);
  });
});

describe('Volltext-Ablauf (#458) mit PostgreSQL', () => {
  it('Stand paket, Kandidaten für „neu erzeugen“, offene Ereignisse verwerfen, Daten einer Fortsetzung', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
    const { verbinde, migriere } = await import('../src/db');
    const { pgRepo } = await import('../src/repo-pg');
    const H = '00000000-0000-4000-8000-000000000001';
    const basis = ausUrl(process.env.TEST_DATABASE_URL)!;
    const a = { ...basis, datenbank: `dms_vt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
    await legeDatenbankAn(a);
    const sql = verbinde(alsUrl(a));
    try {
      await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
      await sql`INSERT INTO haushalte (id, name) VALUES (${H}, 'Test') ON CONFLICT DO NOTHING`;
      const repo = pgRepo(sql, H);
      const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
      await d.kern.repo.speicherePaket(paket('texterkennung', { schnittstellen: ['dms:texterkennung'], dms: '>=0.133.0' }));
      const typ = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' }] });
      const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1' } });
      const hoch = async (n: string) => (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: n, typ: 'application/pdf' }, pdfMitText([n]), null)).dokument.id;
      const mit = await hoch('mit.pdf'), ohne = await hoch('ohne.pdf');
      await repo.ocrSetze(mit, { stand: 'fertig', text: TEXT, info: 'Textebene des PDFs' });
      await repo.ocrSetze(ohne, { stand: 'paket', text: '', info: infoWartet({ name: 'Texterkennung' }) });
      assert.equal((await repo.holeDokument(ohne))!.ocr?.stand, 'paket', 'der neue Stand ist erlaubt');
      assert.equal((await repo.ocrZaehler()).paket, 1);
      assert.deepEqual((await repo.volltextKandidaten('ohne')).map((x) => x.id), [ohne]);
      assert.deepEqual((await repo.volltextKandidaten('alle')).map((x) => x.id).sort(), [mit, ohne].sort());
      await d.volltexte.volltextFertig({ dokument: ohne, mappe: m.id }, { quelle: 'kern', text: false, mime: 'application/pdf', seiten: 1 });
      await d.ereignisse.verteile();
      const [e] = (await repo.faelligeEreignisse(10)).filter((x) => x.art === 'volltext.fertig' && x.daten.dokument === ohne);
      assert.equal(e.daten.text, false);
      await repo.ereignisDaten(e.id, { ...e.daten, weiter: { seite: 3 }, abschnitt: 1 });
      assert.deepEqual((await repo.faelligeEreignisse(10)).find((x) => x.id === e.id)!.daten.weiter, { seite: 3 });
      assert.equal(await repo.loescheOffeneEreignisse('volltext.fertig', [ohne]), 1);
      // Herkunft (#459): aus dem Hinweis, wie volltextHerkunft.
      assert.deepEqual(await repo.volltextHerkunft(), { pdf: 1, paket: 0, api: 0, eingebaut: 0, sonst: 0, ohneText: 0 });
      await repo.ocrSetze(ohne, { stand: 'fertig', text: TEXT, info: 'übernommen (gleicher Inhalt): Texterkennung durch Paket Texterkennung 2.0.0' });
      assert.deepEqual(await repo.volltextHerkunft(), { pdf: 1, paket: 1, api: 0, eingebaut: 0, sonst: 0, ohneText: 0 });
      assert.equal((await repo.faelligeEreignisse(10)).filter((x) => x.daten.dokument === ohne && x.art === 'volltext.fertig').length, 0);
    } finally {
      await sql.end();
      const admin = verbinde(alsUrl(basis)); await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`); await admin.end();
    }
  });
});
