/**
 * Dateien umwandeln (#577): Pakete mit `dms:umwandeln` bekommen Dateien, die der Kern nicht selbst liest, und geben
 * eine Fassung (PDF, PNG, JPEG) zurück; daraus entstehen Vorschaubild und Volltext. Manifest, Ereignis, API, Rechte,
 * Grenzen und Fehlerfälle.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { erkenneBildtyp, fassungAusInfo, FASSUNG_MAX_BYTES, INFO_UMWANDLUNG, UMWANDELN_MAX_BYTES } from '../../shared/src/dateiumwandlung';
import { HILFE } from '../../shared/src/hilfe';
import { liesCode, rechtePunkte, type InstalliertesPaket } from '../../shared/src/pakete';
import { volltextHerkunft } from '../../shared/src/volltext';
import { speicherApiSchluesselRepo, ApiSchluesselDienst } from '../src/apischluessel';
import { bildGroesse, Dateiumwandlung, fassungsTyp, speicherFassungen } from '../src/dateiumwandlung';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst, type Zugriff } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { schluesselRecht } from '../src/laeufer/verwaltung';
import { Texterkennung, type Engine } from '../src/texterkennung';
import { speicherAblage, Vorschaubilder } from '../src/vorschau';
import { pdfMitText } from './hilfen';

const warte = async (bis: () => Promise<boolean>, ms = 20_000) => {
  const ende = Date.now() + ms;
  while (!(await bis())) {
    if (Date.now() > ende) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 20));
  }
};

/** PNG in Graustufen ohne Bildbibliothek (nur IHDR, IDAT, IEND). */
function png(b: number, h: number): Buffer {
  const stueck = (art: string, daten: Buffer) => {
    const kopf = Buffer.alloc(4); kopf.writeUInt32BE(daten.length);
    const typ = Buffer.from(art, 'latin1');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typ, daten])));
    return Buffer.concat([kopf, typ, daten, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(b, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const zeilen = Buffer.concat(Array.from({ length: Math.min(h, 4) }, () => Buffer.from([0, ...Array.from({ length: Math.min(b, 64) }, () => 200)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), stueck('IHDR', ihdr), stueck('IDAT', deflateSync(zeilen)), stueck('IEND', Buffer.alloc(0))]);
}
/** Kopf eines TIFF (Little Endian) – mehr braucht der Kern nicht, er liest TIFF nie selbst. */
const TIFF = Buffer.concat([Buffer.from([0x49, 0x49, 42, 0, 8, 0, 0, 0]), Buffer.alloc(64, 1)]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(32)]);
const TEXT = 'Stromrechnung der Stadtwerke Musterstadt für Januar';
const SHA0 = '0'.repeat(64);

const MANIFEST_CODE = { sprache: 'c', ereignisse: ['datei.umwandeln'], umwandeln: ['image/tiff', 'image/webp', 'image/gif', 'image/bmp'], rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:umwandeln'] } };

const paket = (id: string, code: Record<string, unknown>, name = 'Bildformate'): InstalliertesPaket => ({
  id, name, version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.137.0',
  herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
  typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: liesCode(code).code!,
});
const texterkennungPaket = (): InstalliertesPaket => paket('texterkennung', { sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'schreiben', schnittstellen: ['dms:texterkennung'] } }, 'Texterkennung');

/** Dienst mit Texterkennung (Ersatz-Engine), Vorschaubildern (Ersatz-Erzeuger) und Dateiumwandlung im Speicher. */
async function aufbau(o: { mitPaket?: boolean; mitTexterkennung?: boolean; mitHoerer?: boolean; mitNetz?: boolean } = {}) {
  const repo = speicherRepo();
  const dateien = speicherDateien();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(repo, dateien, { einstellungen });
  const gelesen: string[] = [];
  const engine: Engine = async (_pfad, mime) => { gelesen.push(mime); return { text: TEXT, seiten: 2, info: 'Textebene des PDFs', ohneText: [] }; };
  const t = new Texterkennung(repo, dateien, einstellungen, engine, async () => ({ pdftotext: true, pdftoppm: true }));
  d.verbindeTexterkennung(t);
  t.paket = () => d.texterkennungPaket();
  t.nachher = (dok, e, k) => {
    if (e.stand !== 'fertig' && e.stand !== 'paket') return;
    void d.volltextFertig({ dokument: dok.id, mappe: dok.mappeId }, { quelle: 'kern', text: k.text, mime: k.mime ?? dok.mime, ...(k.original ? { original: k.original } : {}), seiten: e.seiten ?? null, neu: k.neu });
  };
  const bilder = speicherAblage();
  const vorschau = new Vorschaubilder(bilder, dateien, async (inhalt, mime) => Buffer.from(`vorschau:${mime}:${inhalt.length}`));
  d.verbindeVorschau(vorschau);
  const ablage = speicherFassungen();
  const u = new Dateiumwandlung(d.umwandlungAnbindung(ablage, vorschau));
  d.verbindeUmwandlung(u, vorschau);
  vorschau.fassung = (sha) => u.lies(sha);
  t.umwandlung = { lies: (sha) => u.lies(sha), paketFuer: (m) => u.paketFuer(m), anfordern: (x) => u.anfordern(x), gesperrt: (sha) => u.gesperrt(sha) };
  if (o.mitPaket !== false) await d.kern.repo.speicherePaket(paket('bildformate', o.mitNetz ? { ...MANIFEST_CODE, netz: ['https://umwandler.example.org/v1'] } : MANIFEST_CODE));
  if (o.mitTexterkennung) await d.kern.repo.speicherePaket(texterkennungPaket());
  // Ein Paket, das nur „Volltext fertig“ hört (z. B. für Vektoren) – damit das Ereignis im Ausgangskorb landet.
  if (o.mitHoerer) await d.kern.repo.speicherePaket(paket('hoerer', { sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'lesen' } }, 'Hörer'));
  const typ = await d.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
  ] });
  const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'R-1' } });
  const hoch = async (name: string, inhalt: Buffer, typAngabe = 'application/octet-stream') => {
    const id = (await d.ladeHoch(m.id, { register: 'dokumente', name, typ: typAngabe }, inhalt, null)).dokument.id;
    await warte(async () => !['wartet', 'laeuft'].includes((await repo.holeDokument(id))!.ocr!.stand));
    return id;
  };
  const ereignisse = async (art: string) => (await repo.faelligeEreignisse(1000)).filter((e) => e.art === art);
  const alsPaket = { paket: { id: 'bildformate', schreiben: new Set<string>(), dokumente: 'lesen' as const, schnittstellen: ['dms:umwandeln' as const] } } as unknown as Zugriff;
  const dok = async (id: string) => (await repo.holeDokument(id))!;
  return { d, t, u, repo, m, typ, hoch, ereignisse, ablage, bilder, vorschau, alsPaket, gelesen, dok, warte };
}

describe('Dateien umwandeln (#577): Manifest und Rechte', () => {
  it('code.umwandeln mit dms:umwandeln, Lesen von Dokumenten und dem Ereignis; Fehler mit Grund', () => {
    const c = liesCode(MANIFEST_CODE);
    assert.deepEqual(c.fehler, []);
    assert.deepEqual(c.code!.umwandeln, ['image/tiff', 'image/webp', 'image/gif', 'image/bmp']);
    const f = (code: Record<string, unknown>) => liesCode({ ...MANIFEST_CODE, ...code }).fehler.join(' ');
    assert.match(f({ umwandeln: ['application/pdf'] }), /PDF \(application\/pdf\) liest Ablago selbst/);
    assert.match(f({ umwandeln: ['image/jpeg', 'image/png'] }), /JPEG .* liest Ablago selbst/);
    assert.match(f({ umwandeln: ['TIFF'] }), /kein Dateityp/);
    assert.match(f({ umwandeln: [] }), /dms:umwandeln braucht code.umwandeln/);
    assert.match(f({ rechte: { lesen: ['*'], schnittstellen: ['dms:umwandeln'] } }), /braucht auch code.rechte.dokumente: lesen/);
    assert.match(f({ ereignisse: [] }), /braucht das Ereignis datei.umwandeln/);
    assert.match(f({ rechte: { lesen: ['*'], dokumente: 'lesen' } }), /code.umwandeln: braucht code.rechte.schnittstellen/);
    assert.match(liesCode({ sprache: 'c', ereignisse: ['datei.umwandeln'], rechte: { dokumente: 'lesen' } }).fehler.join(' '), /datei.umwandeln gibt es nur mit/);
    assert.match(f({ umwandeln: Array.from({ length: 21 }, (_, i) => `image/x-${i}`) }), /höchstens 20 Dateitypen/);
    // Rückfrage bei der Installation: Recht mit den Dateitypen, Ereignis, Handbuch-Stellen.
    const punkte = rechtePunkte(c.code!, (v) => v);
    const p = punkte.find((x) => x.text.includes('dms:umwandeln'))!;
    assert.match(p.text, /^Dateien umwandeln, die Ablago nicht selbst lesen kann .*\(dms:umwandeln\): TIFF, WebP, GIF, BMP$/);
    assert.ok(HILFE[p.hilfe], 'Handbuch-Stelle zum Recht');
    assert.ok(punkte.some((x) => x.unter?.some((u) => u.text.startsWith('Eine Datei soll umgewandelt werden') && HILFE[u.hilfe])), 'Ereignis mit Handbuch-Stelle');
  });

  it('Dateityp am Inhalt: TIFF, BMP, HEIC, GIF, WebP; Zufall „BM“ und PDF nicht', () => {
    assert.equal(erkenneBildtyp(TIFF), 'image/tiff');
    assert.equal(erkenneBildtyp(Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8])), 'image/tiff');
    assert.equal(erkenneBildtyp(HEIC), 'image/heic');
    assert.equal(erkenneBildtyp(Buffer.from('GIF89a\x01\x00', 'latin1')), 'image/gif');
    assert.equal(erkenneBildtyp(Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')])), 'image/webp');
    const bmp = Buffer.alloc(54); bmp.write('BM', 0, 'latin1'); bmp.writeUInt32LE(40, 14);
    assert.equal(erkenneBildtyp(bmp), 'image/bmp');
    assert.equal(erkenneBildtyp(Buffer.from('BM ist kein Bild, nur ein Brief vom Markus', 'latin1')), null);
    assert.equal(erkenneBildtyp(pdfMitText(['x'])), null);
  });

  it('Fassung am Inhalt: PDF, PNG, JPEG; Bildgröße aus PNG und JPEG', () => {
    assert.equal(fassungsTyp(pdfMitText(['x'])), 'application/pdf');
    assert.equal(fassungsTyp(png(3, 2)), 'image/png');
    assert.deepEqual(bildGroesse(png(300, 200), 'image/png'), { breite: 300, hoehe: 200 });
    // JPEG: SOI, APP0 (übersprungen), SOF0 mit Höhe 480, Breite 640.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0xe0, 0x02, 0x80, 1, 1, 0x11, 0, 0xff, 0xd9]);
    assert.equal(fassungsTyp(jpeg), 'image/jpeg');
    assert.deepEqual(bildGroesse(jpeg, 'image/jpeg'), { breite: 640, hoehe: 480 });
    assert.equal(fassungsTyp(TIFF), null);
  });
});

describe('Dateien umwandeln (#577): Ablauf im Kern', () => {
  it('ohne Paket: wie bisher ausgelassen, mit Hinweis auf das passende Paket; kein Ereignis, kein Vorschaubild', async () => {
    const x = await aufbau({ mitPaket: false });
    const id = await x.hoch('scan.tif', TIFF);
    const dok = await x.dok(id);
    assert.equal(dok.mime, 'image/tiff', 'am Inhalt erkannt, obwohl der Browser nichts sagte');
    assert.equal(dok.ocr?.stand, 'ausgelassen');
    assert.match(dok.ocr?.info ?? '', /^TIFF-Dateien bekommen Vorschau und Volltext mit dem Paket „Bildformate“/);
    const heic = await x.dok(await x.hoch('foto.heic', HEIC));
    assert.equal(heic.mime, 'image/heic');
    assert.match(heic.ocr?.info ?? '', /HEIC bekommt keinen Volltext/);
    assert.deepEqual(await x.ereignisse('datei.umwandeln'), []);
    assert.equal(await x.vorschau.bild(dok), null);
    const stand = await x.d.umwandlungStand();
    assert.deepEqual(stand.typen.map((t) => [t.name, t.anzahl, t.paket, t.katalog?.id ?? null]), [['HEIC', 1, null, null], ['TIFF', 1, null, 'bildformate']]);
  });

  it('mit Paket: Ereignis an das zuständige Paket (einmal), „wartet auf Umwandlung“; Fassung als PDF → Vorschau, Volltext, Historie', async () => {
    const x = await aufbau({ mitHoerer: true });
    const id = await x.hoch('scan.tif', TIFF);
    let dok = await x.dok(id);
    assert.equal(dok.ocr?.stand, 'paket');
    assert.equal(dok.ocr?.info, `${INFO_UMWANDLUNG} (Paket Bildformate)`);
    assert.deepEqual(volltextHerkunft(dok.ocr), { art: 'umwandlung', paket: 'Bildformate' });
    const ev = await x.ereignisse('datei.umwandeln');
    assert.equal(ev.length, 1, 'beim Hochladen und vom Volltext: nur einmal gemeldet');
    assert.equal(ev[0].paketId, 'bildformate');
    assert.deepEqual(ev[0].daten, { dokument: id, mappe: x.m.id, name: 'scan.tif', mime: 'image/tiff', groesse: TIFF.length, sha256: dok.sha256 });
    assert.deepEqual(await x.ereignisse('volltext.fertig'), [], 'Volltext fertig erst mit der Fassung');

    const pdf = pdfMitText([TEXT]);
    const r = await x.d.setzeFassung(x.alsPaket, id, dok.sha256, pdf);
    assert.equal(r.fassung.mime, 'application/pdf');
    assert.deepEqual(r.fassung.paket, { id: 'bildformate', name: 'Bildformate', version: '1.0.0' });
    assert.equal(r.fassung.seiten, 1);
    // Original unverändert, Fassung daneben.
    dok = await x.dok(id);
    assert.equal(dok.mime, 'image/tiff');
    assert.ok(x.ablage.fassungen.get(dok.sha256)?.inhalt.equals(pdf));
    // Volltext aus der Fassung (Textebene), gekennzeichnet.
    await warte(async () => (await x.dok(id)).ocr?.stand === 'fertig');
    dok = await x.dok(id);
    assert.equal(fassungAusInfo(dok.ocr?.info), 'Bildformate 1.0.0');
    assert.deepEqual(volltextHerkunft(dok.ocr), { art: 'pdf' });
    assert.equal((await x.d.volltext(id)).text, TEXT);
    assert.deepEqual(x.gelesen, ['application/pdf'], 'der Kern las die Fassung als PDF');
    const vf = await x.ereignisse('volltext.fertig');
    assert.equal(vf.length, 1);
    assert.equal(vf[0].daten.mime, 'application/pdf');
    assert.equal(vf[0].daten.original, 'image/tiff');
    assert.equal(vf[0].daten.fassung, true);
    // Vorschaubild aus der Fassung.
    await x.vorschau.fertig();
    assert.equal((await x.vorschau.bild(dok))?.toString(), `vorschau:application/pdf:${pdf.length}`);
    // Historie der Mappe: umgewandelte Fassung.
    const h = (await x.d.historie(x.m.id)).find((e) => e.art === 'umgewandelt');
    assert.ok(h, 'Eintrag in der Historie');
    assert.match(String(h.daten?.text), /TIFF → PDF \(Bildformate 1\.0\.0\)/);
    // Zum Ansehen.
    const f = await x.d.fassungVon(id);
    assert.equal(f.info.mime, 'application/pdf');
  });

  it('Fassung als PNG mit Paket Texterkennung: wartet auf die Texterkennung, Seite 1 aus der Fassung, Ereignis mit mime der Fassung', async () => {
    const x = await aufbau({ mitTexterkennung: true });
    const gif = Buffer.from('GIF89a\x10\x00\x10\x00\x00\x00\x00;', 'latin1');
    const id = await x.hoch('logo.gif', gif, 'image/gif');
    const sha = (await x.dok(id)).sha256;
    await x.d.setzeFassung(x.alsPaket, id, sha, png(16, 16));
    await warte(async () => (await x.dok(id)).ocr?.stand === 'paket' && !(await x.dok(id)).ocr?.info?.startsWith(INFO_UMWANDLUNG));
    assert.deepEqual(volltextHerkunft((await x.dok(id)).ocr), { art: 'wartet', paket: 'Texterkennung' });
    const vf = (await x.ereignisse('volltext.fertig')).filter((e) => e.paketId === 'texterkennung');
    assert.equal(vf.length, 1);
    assert.equal(vf[0].daten.mime, 'image/png');
    assert.equal(vf[0].daten.original, 'image/gif');
    assert.equal(vf[0].daten.text, false);
    // Das Paket Texterkennung holt die Seite – aus der Fassung (pdftoppm wie bei PNG).
    const seite = await x.d.seiteAlsGraubild(id, 1, 300);
    assert.equal(seite.subarray(0, 2).toString('latin1'), 'P5');
    await assert.rejects(x.d.seiteAlsGraubild(id, 2, 300), (e: { status?: number }) => e.status === 404);
    // Schreibt es den Volltext, ist der als „aus der umgewandelten Fassung“ gekennzeichnet; das Ereignis nennt beides.
    await x.d.schreibeVolltext(id, { text: TEXT }, { id: 'konto', herkunft: 'Texterkennung 2.0.0', paket: true });
    const dok = await x.dok(id);
    assert.equal(volltextHerkunft(dok.ocr)?.art, 'paket');
    assert.equal(fassungAusInfo(dok.ocr?.info), 'Bildformate 1.0.0');
  });

  it('Fehlerfälle: falscher Prüfwert, fremdes Recht, nicht zuständig, kein PDF/PNG/JPEG, zu groß, zu viele Bildpunkte, kaputtes PDF', async () => {
    const x = await aufbau();
    const id = await x.hoch('scan.tif', TIFF);
    const sha = (await x.dok(id)).sha256;
    const status = (n: number) => (e: { status?: number }) => e.status === n;
    await assert.rejects(x.d.setzeFassung(x.alsPaket, id, SHA0, png(2, 2)), status(409));
    await assert.rejects(x.d.setzeFassung(x.alsPaket, id, 'abc', png(2, 2)), status(422));
    await assert.rejects(x.d.setzeFassung(undefined, id, sha, png(2, 2)), /nur Pakete mit dem Recht „dms:umwandeln“/);
    await assert.rejects(x.d.setzeFassung({ paket: { ...x.alsPaket.paket!, schnittstellen: [] } } as unknown as Zugriff, id, sha, png(2, 2)), /hat das Recht „dms:umwandeln“ nicht/);
    await assert.rejects(x.d.setzeFassung({ paket: { ...x.alsPaket.paket!, id: 'anderes' } } as unknown as Zugriff, id, sha, png(2, 2)), /nicht zuständig/);
    const heic = await x.hoch('foto.heic', HEIC);
    await assert.rejects(x.d.setzeFassung(x.alsPaket, heic, (await x.dok(heic)).sha256, png(2, 2)), /Typ image\/heic ist dieses Paket nicht zuständig/);
    await assert.rejects(x.d.setzeFassung(x.alsPaket, id, sha, TIFF), status(415));
    await assert.rejects(x.d.setzeFassung(x.alsPaket, id, sha, Buffer.alloc(0)), status(422));
    await assert.rejects(x.d.setzeFassung(x.alsPaket, id, sha, Buffer.concat([pdfMitText(['x']), Buffer.alloc(FASSUNG_MAX_BYTES)])), status(413));
    await assert.rejects(x.d.setzeFassung(x.alsPaket, id, sha, png(10_000, 4_000)), /10000 × 4000 Bildpunkte – höchstens 36 Millionen/);
    await assert.rejects(x.d.setzeFassung(x.alsPaket, id, sha, Buffer.from('%PDF-1.4 kaputt', 'latin1')), /Das PDF lässt sich nicht lesen/);
    assert.equal(x.ablage.fassungen.size, 0, 'nichts gespeichert');
    // Vorschaubild: nur JPEG/PNG, wird verkleinert gespeichert.
    await assert.rejects(x.d.setzeVorschaubild(x.alsPaket, id, sha, pdfMitText(['x'])), status(415));
    await x.d.setzeVorschaubild(x.alsPaket, id, sha, png(400, 300));
    assert.match((await x.vorschau.bild(await x.dok(id)))?.toString() ?? '', /^vorschau:image\/png:/);
  });

  it('Paket fertig ohne Fassung: Grund am Dokument; aufgegeben: Fehler; danach darf die Datei wieder gemeldet werden', async () => {
    const x = await aufbau();
    const id = await x.hoch('kaputt.tif', TIFF);
    const sha = (await x.dok(id)).sha256;
    const [e] = await x.ereignisse('datei.umwandeln');
    await x.d.nachTexterkennungsEreignis('bildformate', e, { ok: true, text: 'TIFF lässt sich nicht lesen: Seite 1 kaputt' });
    let dok = await x.dok(id);
    assert.equal(dok.ocr?.stand, 'ausgelassen');
    assert.equal(dok.ocr?.info, 'Umwandlung durch Paket Bildformate: TIFF lässt sich nicht lesen: Seite 1 kaputt');
    // „Erneut versuchen“ meldet die Datei wieder (sie ist nicht mehr unterwegs).
    await x.d.texterkennungErneut(id);
    await warte(async () => (await x.dok(id)).ocr?.stand === 'paket');
    assert.equal((await x.ereignisse('datei.umwandeln')).length, 2);
    await x.d.nachTexterkennungsEreignis('bildformate', e, { ok: false, text: '', fehler: 'Zeitgrenze', aufgegeben: true });
    dok = await x.dok(id);
    assert.equal(dok.ocr?.stand, 'fehler');
    assert.match(dok.ocr?.info ?? '', /Umwandlung durch Paket Bildformate fehlgeschlagen: Zeitgrenze/);
    // Mit Fassung bleibt alles, wie es ist.
    await x.d.setzeFassung(x.alsPaket, id, sha, pdfMitText([TEXT]));
    await warte(async () => (await x.dok(id)).ocr?.stand === 'fertig');
    await x.d.nachTexterkennungsEreignis('bildformate', e, { ok: true, text: 'egal' });
    assert.equal((await x.dok(id)).ocr?.stand, 'fertig');
  });

  it('Paket installiert: vorhandene Dateien gehen an das Paket; Grenzen (Größe) und „Vorschaubilder nachholen“; Löschen nimmt die Fassung mit', async () => {
    const x = await aufbau({ mitPaket: false });
    const a = await x.hoch('a.tif', TIFF);
    const b = await x.hoch('b.tif', Buffer.concat([TIFF, Buffer.from('b')]));
    assert.equal((await x.dok(a)).ocr?.stand, 'ausgelassen');
    await x.d.kern.repo.speicherePaket(paket('bildformate', MANIFEST_CODE));
    assert.equal(await x.d.umwandelPaketDa(['image/tiff']), 2);
    assert.equal((await x.dok(a)).ocr?.info, `${INFO_UMWANDLUNG} (Paket Bildformate)`, 'wartet jetzt sichtbar');
    assert.deepEqual((await x.ereignisse('datei.umwandeln')).map((e) => e.daten.dokument).sort(), [a, b].sort());
    assert.equal(await x.d.umwandelPaketDa(['image/tiff']), 0, 'unterwegs: nicht noch einmal');
    // Zu große Dateien meldet der Kern nicht.
    const gross = { id: 'x', mappeId: x.m.id, name: 'gross.tif', mime: 'image/tiff', groesse: UMWANDELN_MAX_BYTES + 1, sha256: '1'.repeat(64) };
    assert.equal(await x.u.anfordern([gross]), 0);
    // Mit Fassung: kein weiteres Ereignis, auch nicht beim Nachholen; ohne: Nachholen meldet.
    await x.d.setzeFassung(x.alsPaket, a, (await x.dok(a)).sha256, pdfMitText([TEXT]));
    x.u.erledigt((await x.dok(b)).sha256);
    const vorher = (await x.ereignisse('datei.umwandeln')).length;
    await x.d.vorschauNachholen();
    const neu = (await x.ereignisse('datei.umwandeln')).slice(vorher);
    assert.deepEqual(neu.map((e) => e.daten.dokument), [b]);
    // Löschen ohne Papierkorb: Datei weg → Fassung weg.
    const sha = (await x.dok(a)).sha256;
    await x.d.setzePapierkorbTage(0);
    await x.d.loescheDokument(a, null);
    assert.equal(x.ablage.fassungen.has(sha), false);
  });
});

describe('Dateien umwandeln (#577): API für Pakete', () => {
  it('PUT /dokumente/{id}/fassung: Paket mit dms:umwandeln und Lesen genügt; ohne das Recht 403; GET liefert die Fassung', async () => {
    const x = await aufbau();
    await x.d.kern.repo.speicherePaket(paket('nurlesen', { sprache: 'c', ereignisse: [], rechte: { lesen: ['*'], dokumente: 'lesen' } }, 'Nur lesen'));
    const konten = new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', x.d.benutzerspiegel());
    const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    const tabelle = routen(x.d, konten, { apiSchluessel: schluessel });
    const rufe = async (paketId: string, methode: string, pfad: string, params: Record<string, string>, body: unknown, query: Record<string, string> = {}) => {
      const konto = await konten.dienstkonto(paketId, paketId);
      const r = tabelle.find((y) => y.methode === methode && y.pfad === pfad)!;
      assert.ok(r, `${methode} ${pfad}`);
      const a = { body, params, query, ip: '127.0.0.1' } as unknown as Anfrage;
      // Wie der Läufer: das Recht des Schlüssels aus dem Manifest (dms:umwandeln braucht „lesen und schreiben“).
      const key = await schluessel.fuerDienstkonto(konto, schluesselRecht((await x.d.kern.repo.listePakete()).find((y) => y.id === paketId)!.laeufer!));
      await pruefeZugang(r as Route, a, (n) => (n === 'authorization' ? `Bearer ${key}` : undefined), konten, schluessel);
      return r.handler(a);
    };
    assert.equal(schluesselRecht(liesCode(MANIFEST_CODE).code!), 'schreiben', 'Fassung zurückgeben ist ein PUT');
    assert.equal(schluesselRecht(liesCode({ sprache: 'c', rechte: { lesen: ['*'], dokumente: 'lesen' } }).code!), 'lesen');
    const id = await x.hoch('scan.tif', TIFF);
    const sha = (await x.dok(id)).sha256;
    const pdf = pdfMitText([TEXT]);
    const r = await rufe('bildformate', 'PUT', '/api/v1/dokumente/:id/fassung', { id }, pdf, { sha256: sha });
    assert.equal((r.body as { fassung: { mime: string } }).fassung.mime, 'application/pdf');
    await assert.rejects(rufe('nurlesen', 'PUT', '/api/v1/dokumente/:id/fassung', { id }, pdf, { sha256: sha }), /darf nur lesen/);
    await assert.rejects(rufe('nurlesen', 'PUT', '/api/v1/dokumente/:id/vorschaubild', { id }, png(4, 4), { sha256: sha }), /darf nur lesen/);
    // Auch mit „lesen und schreiben“ (z. B. weil es Mappen schreiben darf): ohne dms:umwandeln nicht.
    await x.d.kern.repo.speicherePaket(paket('schreiber', { sprache: 'c', ereignisse: [], rechte: { lesen: ['*'], schreiben: ['*'], dokumente: 'lesen' } }, 'Schreiber'));
    await assert.rejects(rufe('schreiber', 'PUT', '/api/v1/dokumente/:id/fassung', { id }, pdf, { sha256: sha }), /hat das Recht „dms:umwandeln“ nicht/);
    const g = await rufe('bildformate', 'GET', '/api/v1/dokumente/:id/fassung', { id }, undefined);
    const datei = (g as unknown as { datei: { name: string; mime: string; koepfe: Record<string, string> } }).datei;
    assert.equal(datei.name, 'scan (umgewandelt).pdf');
    assert.equal(datei.mime, 'application/pdf');
    assert.equal(datei.koepfe['x-dms-fassung-paket'], 'bildformate 1.0.0');
  });
});

describe('Dateien umwandeln (#577): Ablage im Haushaltsordner (seit 0.140.1, in der Sicherung)', () => {
  it('zieht Fassungen vom früheren Ort um; vorhandene am neuen Ort bleiben; mehrfach ausführbar', async () => {
    const { mkdtemp, readFile, readdir, rm } = await import('node:fs/promises');
    const { existsSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { FASSUNG_PFAD, fassungsOrdner, ordnerFassungen, zieheFassungenUm } = await import('../src/dateiumwandlung');
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-fassung-umzug-'));
    try {
      const haushalt = '00000000-0000-4000-8000-000000000001';
      const a = 'a'.repeat(64); const b = 'b'.repeat(64);
      const alt = ordnerFassungen(join(wurzel, 'fassungen', haushalt));
      const info = (n: string) => ({ mime: 'application/pdf', groesse: 1, sha256: n, paket: { id: 'p', name: 'P', version: '1' }, erstellt: '' });
      await alt.schreibe(a, info('alt-a'), Buffer.from('A'));
      await alt.schreibe(b, info('alt-b'), Buffer.from('B alt'));
      const neu = ordnerFassungen(fassungsOrdner(wurzel, haushalt));
      await neu.schreibe(b, info('neu-b'), Buffer.from('B neu'));
      assert.equal(await zieheFassungenUm(wurzel, haushalt), 2, 'a.json und a.fassung');
      assert.equal(fassungsOrdner(wurzel, haushalt), join(wurzel, haushalt, 'fassungen'));
      assert.equal((await neu.lies(a))?.inhalt.toString(), 'A');
      assert.equal((await neu.lies(b))?.inhalt.toString(), 'B neu', 'am neuen Ort vorhandene gilt');
      assert.equal((await neu.info(b))?.sha256, 'neu-b');
      assert.ok(!existsSync(join(wurzel, 'fassungen')), 'alter Ordner weg');
      assert.equal(await zieheFassungenUm(wurzel, haushalt), 0);
      // So stehen sie in der Sicherung (Pfad relativ zum Haushaltsordner).
      const namen = (await readdir(join(wurzel, haushalt, 'fassungen', 'aa'))).sort();
      assert.deepEqual(namen, [`${a}.fassung`, `${a}.json`]);
      assert.ok(namen.every((n) => FASSUNG_PFAD.test(`fassungen/aa/${n}`)));
      assert.ok(!FASSUNG_PFAD.test(`aa/${a}`) && !FASSUNG_PFAD.test('designs/aa/x.json'));
      assert.equal(JSON.parse(await readFile(join(wurzel, haushalt, 'fassungen', 'aa', `${a}.json`), 'utf8')).sha256, 'alt-a');
    } finally { await rm(wurzel, { recursive: true, force: true }); }
  });
});

describe('Dateien umwandeln (#796): KI-Sperre je Mappentyp', () => {
  /** Paket mit Netz (KI-Paket); „Gesundheit“ ist neu und damit gesperrt, „Rechnung“ wird zugelassen. */
  async function mitSperre() {
    const x = await aufbau({ mitNetz: true });
    const gesundheit = await x.d.legeTypAn({ name: 'Gesundheit', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' }] });
    const befund = await x.d.legeMappeAn({ typId: gesundheit.id, werte: { nr: 'B-1' } });
    const hochGesperrt = async (name: string, inhalt: Buffer) => {
      const id = (await x.d.ladeHoch(befund.id, { register: 'dokumente', name, typ: 'image/tiff' }, inhalt, null)).dokument.id;
      await x.warte(async () => !['wartet', 'laeuft'].includes((await x.repo.holeDokument(id))!.ocr!.stand));
      return id;
    };
    return { ...x, hochGesperrt };
  }

  it('nur gesperrte Dokumente mit dieser Datei: kein Auftrag, das Dokument ist gleich ausgelassen (ohne Zeitgeber)', async () => {
    const x = await mitSperre();
    const id = await x.hochGesperrt('befund.tif', TIFF);
    assert.deepEqual(await x.ereignisse('datei.umwandeln'), []);
    const o = (await x.dok(id)).ocr!;
    assert.equal(o.stand, 'ausgelassen');
    assert.match(o.info ?? '', /KI-Dienste/);
    assert.equal(x.u.gesperrt((await x.dok(id)).sha256), true);
  });

  it('dieselbe Datei auch in einem zugelassenen Typ: Auftrag über das zugelassene Dokument; dessen Stand bleibt unberührt', async () => {
    const x = await mitSperre();
    await x.d.setzeKiTyp(x.typ.id, true, null);
    const erlaubt = await x.hoch('rechnung.tif', TIFF, 'image/tiff');
    const gesperrt = await x.hochGesperrt('befund.tif', TIFF);
    let ev = await x.ereignisse('datei.umwandeln');
    assert.deepEqual(ev.map((e) => e.daten.dokument), [erlaubt], 'nie das gesperrte Dokument');
    // Erneut angefordert über das gesperrte Dokument: Der Auftrag geht über das zugelassene derselben Datei.
    await x.u.anfordern([await x.dok(gesperrt)], { erneut: true });
    ev = await x.ereignisse('datei.umwandeln');
    assert.deepEqual(ev.map((e) => e.daten.dokument), [erlaubt, erlaubt]);
    assert.ok(!JSON.stringify(ev.map((e) => e.daten)).includes('befund'), 'weder Name noch Mappe des gesperrten');
    assert.equal((await x.dok(erlaubt)).ocr!.stand, 'paket', 'wartet weiter auf die Fassung – nicht ausgelassen');
    assert.equal(x.u.gesperrt((await x.dok(erlaubt)).sha256), false);
  });
});
