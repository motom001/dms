/**
 * Codes auf Dokumenten (#1723): Ein Paket mit `dms:codes` liest QR-Codes und Barcodes, Ablago merkt sie sich je Datei
 * und trägt den passenden Inhalt in Felder mit der Erkennungsart `code` ein. HU-Berichte von Lena Muster mit erfundenen
 * Zugangsdaten; das Paket ist durch einen ersetzten Läuferaufruf nachgestellt. Mit TEST_DATABASE_URL auch PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { liesFeldErkennung } from '../../shared/src/erkennung';
import { liesCode, rechtePunkte } from '../../shared/src/pakete';
import { DMS_CODES_AB, passenderCode, type GelesenerCode } from '../../shared/src/codes';
import { HILFE } from '../../shared/src/hilfe';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/anmeldung/apischluessel';
import { Paketlaeufer } from '../src/laeufer/verwaltung';
import { openapi } from '../src/http/api-v1';
import { liesCodeAntwort } from '../src/erkennung/codes';
import { genutzteFunktionen } from '../src/pakete/erstellung/bau-dateien';
import { mindestversion } from '../src/pakete/erstellung/mindestversion';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo/speicher';
import { eigeneDatenbank } from './hilfe-db';

const DUB = 'https://www.kba-online.de/dub/#/zugriffsdaten/';
const LINK = `${DUB}A1B2C3D4E5F6/P0123456789/0815`;
const LINK2 = `${DUB}Z9Y8X7W6V5U4/P9876543210/0815`;
const DATENSCHUTZ = 'https://www.example.org/datenschutz';
const BERICHT = `Prüfbericht Hauptuntersuchung gemäß § 29 StVZO
(1) Fz-Id.Nr. WVWZZZ1KZAW000001  (2) Amtl. Kennz. DD-LM 123
(4) km-St. 9363  (7) Ergebnis: ohne festgestellte Mängel
Bericht-Nr. P0123456789`;

describe('Erkennungsart code und Schnittstelle dms:codes (#1723)', () => {
  it('Manifest: dms:codes braucht Dokumente; Rückfrage mit Hilfe; API-Beschreibung nennt muster und codeart', () => {
    assert.match(liesCode({ sprache: 'c', rechte: { schnittstellen: ['dms:codes'] } }).fehler.join(' '), /dms:codes braucht/);
    const c = liesCode({ sprache: 'c', rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:codes'] } });
    assert.deepEqual(c.fehler, []);
    const p = rechtePunkte(c.code!, (v) => v).find((x) => x.text.includes('(dms:codes)'))!;
    assert.equal(p.hilfe, 'pakete.recht.codes');
    assert.ok(HILFE['pakete.recht.codes']);
    const o = openapi('0.0.0') as { components: { schemas: Record<string, { properties: Record<string, unknown> }> } };
    const feld = Object.values(o.components.schemas).find((s) => s.properties?.erkennung)!;
    const e = feld.properties.erkennung as { properties: Record<string, { enum?: string[] }> };
    assert.ok(e.properties.art.enum?.includes('code'));
    assert.ok(e.properties.muster && e.properties.codeart);
  });

  it('Feld: muster und codeart nur mit art code, nur an Text und Langtext; Grenzen', () => {
    assert.deepEqual(liesFeldErkennung({ art: 'code', muster: ` ${DUB} `, codeart: 'QR' }, 'text'), {
      art: 'code',
      muster: DUB,
      codeart: 'qr',
    });
    assert.deepEqual(liesFeldErkennung({ art: 'code' }, 'langtext'), { art: 'code' });
    assert.deepEqual(liesFeldErkennung({ art: 'nummer', muster: DUB }, 'text'), { art: 'nummer' }, 'Muster nur mit art code');
    assert.deepEqual(liesFeldErkennung({ art: 'code', muster: DUB }, 'datum'), {}, 'nicht an Datumsfeldern');
    assert.deepEqual(liesFeldErkennung({ art: 'code', muster: 'x'.repeat(201), codeart: 'QR Code!' }, 'text'), { art: 'code' });
  });

  it('Paket erstellen: ein Feld mit art code hebt die Mindestversion', () => {
    const typ = (erkennung: unknown) => ({ felder: [{ key: 'bericht', label: 'Digitaler Bericht', typ: 'text', erkennung }] }) as never;
    const x = { dmsVerweise: false, beispielVerweise: false, dokumente: 0, fremdeTypen: false, wortlisten: 0, automatisierungen: 0 };
    assert.ok(genutzteFunktionen({ ...x, paketTypen: [typ({ art: 'code', muster: DUB })] }).includes('codes'));
    assert.ok(!genutzteFunktionen({ ...x, paketTypen: [typ({ art: 'nummer' })] }).includes('codes'));
    assert.equal(mindestversion(['codes']).version, DMS_CODES_AB);
  });

  it('passender Code: Anfang des Inhalts, Art, frühere Seite gewinnt', () => {
    const codes: GelesenerCode[] = [
      { art: 'qr', inhalt: DATENSCHUTZ, seite: 1 },
      { art: 'QR_CODE', inhalt: LINK2, seite: 2 },
      { art: 'qr', inhalt: LINK, seite: 1 },
      { art: 'code128', inhalt: 'ABLAGO-4711' },
    ];
    assert.equal(passenderCode({ muster: DUB }, codes)?.inhalt, LINK);
    assert.equal(passenderCode({ muster: DUB.toUpperCase(), codeart: 'qr' }, codes)?.inhalt, LINK, 'ohne Groß- und Kleinschreibung');
    assert.equal(passenderCode({ codeart: 'code' }, codes)?.inhalt, 'ABLAGO-4711');
    assert.equal(passenderCode({}, codes)?.inhalt, DATENSCHUTZ, 'ohne Angaben: der erste auf der frühesten Seite');
    assert.equal(passenderCode({ muster: 'https://www.example.org/anderes' }, codes), null);
    assert.equal(passenderCode({ muster: DUB, codeart: 'ean' }, codes), null);
  });

  it('Antwort des Pakets: Schema der Leistung dokument.lesen.barcode@1', () => {
    assert.deepEqual(liesCodeAntwort(JSON.stringify({ codes: [{ art: 'qr', inhalt: LINK, seite: 1 }] })), {
      codes: [{ art: 'qr', inhalt: LINK, seite: 1 }],
    });
    assert.deepEqual(liesCodeAntwort('kein json'), { grund: 'kein JSON' });
    assert.deepEqual(liesCodeAntwort(JSON.stringify({ codes: [{ art: 'qr' }] })), { grund: 'codes[0].inhalt: fehlt' });
    assert.deepEqual(liesCodeAntwort(JSON.stringify({ codes: [{ art: 'qr', inhalt: 'x'.repeat(4001) }] })), {
      grund: 'codes[0].inhalt: zu-lang',
    });
    assert.deepEqual(liesCodeAntwort(JSON.stringify({ codes: [], mehr: 1 })), { grund: 'mehr: unbekannt' });
    const viele = { codes: Array.from({ length: 201 }, (_, i) => ({ art: 'qr', inhalt: `${i}` })) };
    assert.deepEqual(liesCodeAntwort(JSON.stringify(viele)), { grund: 'codes: zu-lang' });
  });
});

const offen: Array<{ end(): Promise<void> }> = [];
after(async () => {
  for (const s of offen) await s.end();
});
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const LENA = '00000000-0000-4000-8000-0000000000aa';
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo/pg');
  const { sql } = await eigeneDatenbank('codes');
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${LENA}, ${HAUSHALT}, 'lena@example.org', 'Lena Muster', 'admin') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT) as never;
}

async function aufbau(pg = false, hinweis?: string) {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen });
  const register = [
    { key: 'allgemein', name: 'Allgemein', art: 'felder' as const, felder: ['pruefbericht_nr', 'bericht'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' as const },
  ];
  const hu = await d.mappentypen.legeTypAn({
    name: 'Hauptuntersuchung',
    felder: [
      { key: 'pruefbericht_nr', label: 'Prüfbericht-Nr.', typ: 'text', erkennung: {} },
      {
        key: 'bericht',
        label: 'Digitaler Bericht',
        typ: 'text',
        erkennung: { art: 'code', muster: DUB, codeart: 'qr', ...(hinweis ? { hinweis } : {}) },
      },
    ],
    register,
  });
  const A = await d.rechtepruefung.zugriff({ id: LENA, rolle: 'admin' });
  const lena = { id: LENA };
  const ablage = await d.mappen.legeMappeAn({ typId: hu.id, werte: {} }, LENA);
  const datei = async (name: string, typ: string, inhalt: string) =>
    (await d.dokumente.ladeHoch(ablage.id, { register: 'dokumente', name, typ }, Buffer.from(inhalt), LENA)).dokument;
  const hochladen = async (name = 'hu-bericht.pdf') => {
    const x = await datei(name, 'application/pdf', `%PDF-1.4 ${name}`);
    await d.volltexte.schreibeVolltext(x.id, { text: BERICHT }, { id: LENA, herkunft: 'Test', paket: false });
    return x.id;
  };
  // Das Paket „QR-Code lesen“, nachgestellt: je Dokument die Codes aus `antworten`, Aufrufe in `aufrufe`.
  const antworten = new Map<string, string>();
  const aufrufe: Array<{ paket: string; eingang: Record<string, unknown> }> = [];
  const pakete = [{ id: 'qrcode', name: 'QR-Code lesen', netz: false }];
  const anbieter = {
    pakete: () => pakete,
    lies: async (paket: string, eingang: Record<string, unknown>) => {
      aufrufe.push({ paket, eingang });
      return { text: antworten.get(String(eingang.datei)) ?? '{"codes":[]}', ms: 2 };
    },
  };
  d.erkennung.codes.anbieter = anbieter;
  // Das Lesen im Hintergrund stoßen die Tests selbst an (nachEreignis), damit es nicht vor der Antwort des Pakets läuft.
  assert.ok(d.ereignisse.namen.includes('codes'), 'Abnehmer im Ereigniskatalog angemeldet');
  d.ereignisse.abbestellen('codes');
  const fuellen = async (dok: string) => (await d.erkennung.fuerTyp(hu.id, { dokumente: [dok] }, A)).vorschlaege;
  return { d, einstellungen, lena, hu, A, hochladen, datei, antworten, aufrufe, pakete, anbieter, fuellen };
}

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Feld aus einem QR-Code füllen (#1723, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    it('ein passender Code: Vorschlag mit hoher Sicherheit und Fundstelle; einmal gelesen und gemerkt', async () => {
      const x = await aufbau(pg);
      const dok = await x.hochladen();
      x.antworten.set(dok, JSON.stringify({ codes: [{ art: 'qr', inhalt: LINK, seite: 1 }] }));
      const v = await x.fuellen(dok);
      assert.deepEqual(v.bericht, { wert: LINK, sicherheit: 'hoch', fundstelle: 'QR-Code auf Seite 1' });
      assert.deepEqual(x.aufrufe, [{ paket: 'qrcode', eingang: { datei: dok, mime: 'application/pdf' } }]);
      assert.deepEqual(await x.d.kern.repo.liesCodes(dok), {
        sha256: (await x.d.kern.repo.holeDokument(dok))!.sha256,
        codes: [{ art: 'qr', inhalt: LINK, seite: 1 }],
      });
      await x.fuellen(dok);
      assert.equal(x.aufrufe.length, 1, 'gemerkt: kein zweites Lesen');
    });

    it('kein Code und Code passt nicht zum Muster: Feld bleibt leer', async () => {
      const x = await aufbau(pg);
      const ohne = await x.hochladen('ohne.pdf');
      assert.equal((await x.fuellen(ohne)).bericht, undefined);
      const fremd = await x.hochladen('fremd.pdf');
      x.antworten.set(fremd, JSON.stringify({ codes: [{ art: 'qr', inhalt: DATENSCHUTZ, seite: 1 }] }));
      assert.equal((await x.fuellen(fremd)).bericht, undefined);
    });

    it('zwei Codes auf verschiedenen Seiten: der auf der früheren Seite; nie ein Wert aus dem Text', async () => {
      // Ein Erkennungshinweis mit Muster füllte das Feld sonst aus dem Text – bei art code zählt nur der gelesene Code.
      const x = await aufbau(pg, 'Muster P##########');
      const dok = await x.hochladen();
      assert.equal((await x.fuellen(dok)).bericht, undefined, 'ohne Code: leer, nicht aus dem Text');
      assert.equal((await x.d.erkennung.fuerTyp(x.hu.id, { text: BERICHT }, x.A)).vorschlaege.bericht, undefined, 'nur Text: leer');
      x.antworten.set(
        dok,
        JSON.stringify({
          codes: [
            { art: 'qr', inhalt: DATENSCHUTZ, seite: 1 },
            { art: 'qr', inhalt: LINK2, seite: 3 },
            { art: 'qr', inhalt: LINK, seite: 2 },
          ],
        }),
      );
      await x.d.dokumentVersionen.neueFassung(dok, {}, Buffer.from('%PDF-1.4 zwei'), x.lena.id);
      await x.d.volltexte.schreibeVolltext(dok, { text: BERICHT }, { id: x.lena.id, herkunft: 'Test', paket: false });
      const v = await x.fuellen(dok);
      assert.deepEqual(v.bericht, { wert: LINK, sicherheit: 'hoch', fundstelle: 'QR-Code auf Seite 2' });
    });

    it('im Hintergrund nach „Volltext fertig“; neu gelesen nur bei geänderter Datei', async () => {
      const x = await aufbau(pg);
      const dok = await x.hochladen();
      x.antworten.set(dok, JSON.stringify({ codes: [{ art: 'qr', inhalt: LINK, seite: 1 }] }));
      const ereignis = (art: string) => ({ id: 'e1', art, daten: { dokument: dok }, ausloeser: {}, erstellt: '' }) as never;
      await x.d.erkennung.codes.nachEreignis(ereignis('mappe.geaendert'));
      await x.d.erkennung.codes.nachEreignis(ereignis('volltext.fertig'));
      await x.d.erkennung.codes.fertig();
      assert.equal(x.aufrufe.length, 1);
      await x.d.erkennung.codes.nachEreignis(ereignis('volltext.fertig'));
      await x.d.erkennung.codes.fertig();
      assert.equal(x.aufrufe.length, 1, 'gleiche Datei: nicht noch einmal');
      assert.equal((await x.fuellen(dok)).bericht?.wert, LINK);
      // Neue Datei (z. B. eine bessere Fassung): die gemerkten Codes gelten nicht mehr.
      x.antworten.set(dok, JSON.stringify({ codes: [{ art: 'qr', inhalt: LINK2, seite: 1 }] }));
      await x.d.dokumentVersionen.neueFassung(dok, {}, Buffer.from('%PDF-1.4 neu'), x.lena.id);
      await x.d.volltexte.schreibeVolltext(dok, { text: BERICHT }, { id: x.lena.id, herkunft: 'Test', paket: false });
      assert.equal((await x.fuellen(dok)).bericht?.wert, LINK2);
      assert.equal(x.aufrufe.length, 2);
      // Codes zu einer alten Datei merkt das Repo nicht.
      await x.d.kern.repo.merkeCodes(dok, 'f'.repeat(64), []);
      assert.deepEqual((await x.d.kern.repo.liesCodes(dok))?.codes, [{ art: 'qr', inhalt: LINK2, seite: 1 }]);
    });

    it('ohne Paket, mit ungültiger Antwort, mit Fehler des Pakets: keine Wirkung, keine Meldung, nichts gemerkt', async () => {
      const x = await aufbau(pg);
      const dok = await x.hochladen();
      x.d.erkennung.codes.anbieter = undefined;
      await x.d.erkennung.codes.nachEreignis({
        id: 'e',
        art: 'volltext.fertig',
        daten: { dokument: dok },
        ausloeser: {},
        erstellt: '',
      } as never);
      let r = await x.d.erkennung.fuerTyp(x.hu.id, { dokumente: [dok] }, x.A);
      assert.equal(r.vorschlaege.bericht, undefined);
      assert.equal(r.hinweis, undefined);
      x.d.erkennung.codes.anbieter = x.anbieter;
      x.antworten.set(dok, '{"codes":[{"art":"qr"}]}');
      r = await x.d.erkennung.fuerTyp(x.hu.id, { dokumente: [dok] }, x.A);
      assert.equal(r.vorschlaege.bericht, undefined);
      assert.equal(r.hinweis, undefined);
      assert.equal(await x.d.kern.repo.liesCodes(dok), null);
      x.d.erkennung.codes.anbieter = { ...x.anbieter, lies: async () => Promise.reject(new Error('Zeitgrenze')) };
      r = await x.d.erkennung.fuerTyp(x.hu.id, { dokumente: [dok] }, x.A);
      assert.equal(r.vorschlaege.bericht, undefined);
      assert.equal(r.hinweis, undefined);
    });

    it('Paket mit Netz nur nach Freigabe (Erkennung gewählt, Datenabfluss bestätigt, Mappentyp zugelassen)', async () => {
      const x = await aufbau(pg);
      const dok = await x.hochladen();
      x.pakete.splice(0, 1, { id: 'qr_wolke', name: 'QR in der Wolke', netz: true });
      x.antworten.set(dok, JSON.stringify({ codes: [{ art: 'qr', inhalt: LINK, seite: 1 }] }));
      assert.equal((await x.fuellen(dok)).bericht, undefined);
      assert.equal(x.aufrufe.length, 0, 'ohne Freigabe geht nichts hinaus');
      await x.einstellungen.schreibe('erkennung_engine', { paket: 'qr_wolke', abfluss: true });
      assert.equal((await x.fuellen(dok)).bericht?.wert, LINK);
      assert.equal(x.aufrufe.length, 1);
    });

    it('nur bei Feldern mit art code; Anlagen und andere Dateitypen werden nicht gelesen', async () => {
      const x = await aufbau(pg);
      const typ = await x.d.mappentypen.legeTypAn({
        name: 'Brief',
        felder: [{ key: 'nr', label: 'Nr', typ: 'text', erkennung: {} }],
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
          { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
        ],
      });
      const A = await x.d.rechtepruefung.zugriff({ id: LENA, rolle: 'admin' });
      const dok = await x.hochladen();
      await x.d.erkennung.fuerTyp(typ.id, { dokumente: [dok] }, A);
      assert.equal(x.aufrufe.length, 0);
      const txt = await x.datei('notiz.txt', 'text/plain', 'Notiz');
      assert.equal(await x.d.erkennung.codes.lies(txt.id, 1000), null);
      assert.equal(x.aufrufe.length, 0);
    });
  });
}

describe('dms:codes im Paket-Läufer (#1723)', () => {
  it('Aufruf mit dem Dokument, ohne Inhalt in der Werkbank; nur Pakete mit dms:codes', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const l = new Paketlaeufer({
      dienst: d,
      konten,
      schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()),
      api: async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') }),
      einstellungen: async () => ({}),
      speicher: { lies: async () => ({}), schreibe: async () => {} },
      grenzen: { sekunden: 5, speicherMB: 16 },
    });
    const x = l as unknown as Record<string, unknown>;
    const gesendet: Array<{ eingang: unknown; opt: Record<string, unknown> }> = [];
    x.laeuft = () => true;
    x.rufe = async (_p: string, _w: string, eingang: unknown, opt: Record<string, unknown>) => {
      gesendet.push({ eingang, opt });
      return { ok: true, text: '{"codes":[]}', ms: 1 };
    };
    x.pakete = [
      { id: 'qrcode', name: 'QR-Code lesen', laeufer: { rechte: { schnittstellen: ['dms:codes'] }, netz: [] } },
      { id: 'andere', name: 'Andere', laeufer: { rechte: { schnittstellen: ['dms:erkennen'] }, netz: [] } },
    ];
    x.ladefehler = new Map([
      ['qrcode', null],
      ['andere', null],
    ]);
    assert.deepEqual(d.erkennung.codes.anbieter!.pakete(), [{ id: 'qrcode', name: 'QR-Code lesen', netz: false }]);
    await d.erkennung.codes.anbieter!.lies('qrcode', { datei: 'd1' }, 1000);
    assert.deepEqual(gesendet[0].eingang, { datei: 'd1', aktion: 'dms:codes' });
    assert.equal(gesendet[0].opt.ohneInhalt, true);
    assert.equal(gesendet[0].opt.ms, 1000);
  });
});
