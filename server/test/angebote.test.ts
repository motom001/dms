/**
 * Angebote beim Ausfüllen (#1724): Ein Paket meldet unter `code.angebote` an, zu welchem Code es Daten holen kann. Steht
 * der Code auf dem Dokument, nennt „Aus Dokument ausfüllen“ das Angebot; erst der Abruf ruft das Paket (Paket-Aktion
 * `dms:angebot`), die Werte kommen als Vorschläge. HU-Bericht von Lena Muster mit erfundenen Zugangsdaten; Paket und
 * Läufer sind nachgestellt.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { angebotTexte, DMS_ANGEBOTE_AB, liesAngebote } from '../../shared/src/angebote';
import { liesCode, type InstalliertesPaket } from '../../shared/src/pakete';
import type { Register } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';

const FELDER: Register = { key: 'allgemein', name: 'Allgemein', art: 'felder' };
const DOKS: Register = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' };
const MUSTER = 'https://www\\.kba-online\\.de/dub/#/zugriffsdaten/[0-9A-Z]{12}/[0-9A-Z]+/[0-9]+';
const LINK = 'https://www.kba-online.de/dub/#/zugriffsdaten/A1B2C3D4E5F6/P0123456789/0815';
const BERICHT = `Prüfbericht Hauptuntersuchung gemäß § 29 StVZO
(4) km-Stand 9363  (7) ohne festgestellte Mängel
Gebühren 128,50 EUR`;
const ANGEBOT = {
  schluessel: 'dub',
  mappentypen: ['fahrzeuge:hauptuntersuchung'],
  code: { codeart: 'qr', muster: MUSTER },
  text: 'QR-Code zum Digitalen Untersuchungsbericht erkannt. Daten beim KBA abrufen und eintragen?',
  knopf: 'Daten beim KBA abrufen',
  beschriftungen: { en: { text: 'QR code of the digital inspection report found. Fetch the data?', knopf: 'Fetch from KBA' } },
};
const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));

const paket = (id: string, x: Partial<InstalliertesPaket> = {}, netz: string[] = []): InstalliertesPaket => ({
  id,
  name: id === 'fahrzeuge.kba' ? 'Fahrzeuge – KBA' : 'Fahrzeuge',
  version: '1.0.0',
  beschreibung: '',
  lizenz: 'MIT',
  autor: { name: 'T', github: 't' },
  herkunft: { art: 'hochgeladen', von: null, am: '' },
  installiert: '',
  installiertVon: null,
  aktualisiert: null,
  aktualisiertVon: null,
  typen: {},
  sichten: {},
  abhaengigkeiten: {},
  code: true,
  laeufer: {
    sprache: 'c',
    ereignisse: [],
    rechte: { lesen: [], schreiben: [], dokumente: 'keine' },
    netz,
    modul: { sha256: 'x', groesse: 1 },
    angebote: liesAngebote([ANGEBOT], []).angebote,
  },
  ...x,
});

async function aufbau(o: { netz?: boolean } = {}) {
  const einst = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: einst });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena Muster', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const fahrzeug = await d.mappentypen.legeTypAn({
    name: 'Fahrzeug',
    felder: [
      { key: 'kennzeichen', label: 'Kennzeichen', typ: 'text', eindeutig: true },
      { key: 'fin', label: 'FIN', typ: 'text', eindeutig: true },
    ],
    register: [{ ...FELDER, felder: ['kennzeichen', 'fin'] }, DOKS],
  });
  const hu = await d.mappentypen.legeTypAn({
    name: 'Hauptuntersuchung',
    felder: [
      { key: 'fahrzeug', label: 'Fahrzeug', typ: 'referenz', zielTyp: fahrzeug.id },
      { key: 'kilometerstand', label: 'Kilometerstand', typ: 'zahl', erkennung: {} },
      { key: 'geprueft_am', label: 'Geprüft am', typ: 'datum', erkennung: {} },
      { key: 'kosten', label: 'Kosten', typ: 'betrag', erkennung: {} },
      { key: 'bericht', label: 'Digitaler Bericht', typ: 'text', erkennung: { art: 'code', codeart: 'qr', muster: MUSTER } },
    ],
    register: [{ ...FELDER, felder: ['fahrzeug', 'kilometerstand', 'geprueft_am', 'kosten', 'bericht'] }, DOKS],
  });
  const brief = await d.mappentypen.legeTypAn({
    name: 'Brief',
    felder: [{ key: 'betreff', label: 'Betreff', typ: 'text', erkennung: {} }],
    register: [{ ...FELDER, felder: ['betreff'] }, DOKS],
  });
  await d.kern.repo.speicherePaket(
    paket('fahrzeuge', { code: false, laeufer: undefined, typen: { hauptuntersuchung: hu.id, fahrzeug: fahrzeug.id } }),
  );
  await d.kern.repo.speicherePaket(paket('fahrzeuge.kba', {}, o.netz ? ['https://www.kba-online.de'] : []));
  const A = await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' });
  // Läufer nachgestellt: Aufrufe merken, Antwort je Schritt aus `antworten`.
  const aufrufe: Array<{ paket: string; eingang: Record<string, unknown>; zugang: unknown }> = [];
  let antworten: Array<string | { ok: false; fehler: string }> = [];
  d.paketaktionen.laeufer = {
    geladen: (p) => p === 'fahrzeuge.kba',
    rufe: async (p, eingang, x) => {
      aufrufe.push({ paket: p, eingang, zugang: x.zugang });
      const a = antworten.shift() ?? '{"vorschlaege":{}}';
      return typeof a === 'string'
        ? { ok: true, text: a, fehler: null, dateien: [] }
        : { ok: false, text: '', fehler: a.fehler, dateien: [] };
    },
  };
  // Codes: „QR-Code lesen“, nachgestellt.
  let codes: unknown[] = [{ art: 'qr', inhalt: LINK, seite: 1 }];
  d.erkennung.codes.anbieter = {
    pakete: () => [{ id: 'qrcode', name: 'QR-Code lesen', netz: false }],
    lies: async () => ({ text: JSON.stringify({ codes }), ms: 1 }),
  };
  d.ereignisse.abbestellen('codes');
  const post = await d.post.legePostAn({ betreff: 'HU-Bericht' }, { id: lena.id, name: 'Lena Muster' });
  const dok = (
    await d.dokumente.ladeHoch(
      post.id,
      { register: 'dokumente', name: 'hu.pdf', typ: 'application/pdf' },
      Buffer.from('%PDF-1.4 hu'),
      lena.id,
    )
  ).dokument;
  await d.volltexte.schreibeVolltext(dok.id, { text: BERICHT }, { id: lena.id, herkunft: 'Test', paket: false });
  const h = { ich: { id: lena.id, rolle: 'admin', name: 'Lena Muster' }, z: A };
  const abrufen = (x: Record<string, unknown> = {}) =>
    d.ausfuellAngebote.abrufen(h, hu.id, { paket: 'fahrzeuge.kba', angebot: 'dub', dokument: dok.id, ...x });
  return {
    d,
    einst,
    lena,
    A,
    h,
    hu,
    fahrzeug,
    brief,
    dok,
    aufrufe,
    abrufen,
    setzeAntworten: (a: typeof antworten) => (antworten = a),
    setzeCodes: (c: unknown[]) => (codes = c),
  };
}

describe('Angebote beim Ausfüllen (#1724): Manifest', () => {
  it('code.angebote: Mappentypen, Code-Muster, Text de/en; Fehler mit Stelle', () => {
    const c = liesCode({ sprache: 'c', angebote: [ANGEBOT] });
    assert.deepEqual(c.fehler, []);
    assert.equal(c.code?.angebote?.[0].code.muster, MUSTER);
    assert.deepEqual(angebotTexte(c.code!.angebote![0], 'en'), { text: ANGEBOT.beschriftungen.en.text, knopf: 'Fetch from KBA' });
    assert.deepEqual(angebotTexte({ text: 'Abrufen?' }, 'de'), { text: 'Abrufen?', knopf: 'Abrufen und eintragen' });
    const f = liesCode({
      sprache: 'c',
      angebote: [
        { ...ANGEBOT, code: {} },
        { ...ANGEBOT, schluessel: 'b', mappentypen: ['dms:post'] },
        { ...ANGEBOT, schluessel: 'c', text: 'x'.repeat(201) },
        { ...ANGEBOT, schluessel: 'c' },
      ],
    }).fehler.join('\n');
    assert.match(f, /code\.angebote\[1\]: code\.muster fehlt/);
    assert.match(f, /code\.angebote\[2\]: mappentypen/);
    assert.match(f, /code\.angebote\[3\]: text/);
    assert.match(f, /code\.angebote\[4\]: Schlüssel „c“/);
    assert.match(liesCode({ sprache: 'c', angebote: Array(11).fill(ANGEBOT) }).fehler.join(), /höchstens 10/);
    assert.equal(liesCode({ sprache: 'c' }).code?.angebote, undefined, 'ohne Angebote wie bisher');
    assert.match(DMS_ANGEBOTE_AB, /^0\.\d+\.0$/, 'Pakete mit Angeboten geben dms: ">=DMS_ANGEBOTE_AB" an');
  });
});

describe('Angebote beim Ausfüllen (#1724): Angebot', () => {
  it('erscheint nur mit passendem Code, laufendem Paket, Recht und passendem Mappentyp', async () => {
    const x = await aufbau();
    const fuer = (typ = x.hu.id, z = x.A, e: Record<string, unknown> = {}) =>
      x.d.ausfuellAngebote.fuer(z, typ, { dokumente: [x.dok.id], ...e });
    assert.deepEqual(await fuer(), [
      {
        paket: { id: 'fahrzeuge.kba', name: 'Fahrzeuge – KBA' },
        schluessel: 'dub',
        text: ANGEBOT.text,
        knopf: ANGEBOT.knopf,
        beschriftungen: ANGEBOT.beschriftungen,
        dokument: x.dok.id,
      },
    ]);
    assert.deepEqual(x.aufrufe, [], 'Anzeigen ruft das Paket nie');
    assert.deepEqual(await fuer(x.brief.id), [], 'anderer Mappentyp');
    assert.deepEqual(await x.d.ausfuellAngebote.fuer(x.A, x.hu.id, { text: 'nur Text' }), [], 'ohne Dokument');
    // Recht wie bei „Aus Dokument ausfüllen“: Bearbeiten an der Mappe bzw. Anlegen im Typ.
    const andere = await x.d.mappen.legeMappeAn({ typId: x.brief.id, werte: { betreff: 'Brief' } }, x.lena.id);
    assert.deepEqual(await fuer(x.hu.id, x.A, { mappe: andere.id }), [], 'Mappe eines anderen Typs');
    const vorhanden = await x.d.mappen.legeMappeAn({ typId: x.hu.id, werte: {} }, x.lena.id);
    assert.equal((await fuer(x.hu.id, x.A, { mappe: vorhanden.id })).length, 1, 'bestehende Mappe mit Bearbeiten');
    // Angehalten: kein Angebot.
    const p = (await x.d.kern.repo.listePakete()).find((y) => y.id === 'fahrzeuge.kba')!;
    await x.d.kern.repo.speicherePaket({ ...p, angehalten: { grund: 'hand', am: '', von: 'lena' } } as InstalliertesPaket);
    assert.deepEqual(await fuer(), []);
  });

  it('kein passender Code (anderer Inhalt oder andere Codeart): kein Angebot', async () => {
    const x = await aufbau();
    x.setzeCodes([
      { art: 'qr', inhalt: 'https://www.example.org/datenschutz', seite: 1 },
      { art: 'datamatrix', inhalt: LINK, seite: 2 },
    ]);
    assert.deepEqual(await x.d.ausfuellAngebote.fuer(x.A, x.hu.id, { dokumente: [x.dok.id] }), []);
  });

  it('Paket mit Netz: nur an Mappentypen, die für Dienste im Netz zugelassen sind (#796)', async () => {
    const x = await aufbau({ netz: true });
    // Neue Installation (#1635): alle Bereiche zugelassen, bis die Verwaltung einen ausnimmt.
    await x.einst.schreibe('ki_typen', { ausgenommen: [] });
    assert.equal((await x.d.ausfuellAngebote.fuer(x.A, x.hu.id, { dokumente: [x.dok.id] })).length, 1);
    await x.einst.schreibe('ki_typen', { ausgenommen: [x.hu.id] });
    assert.deepEqual(await x.d.ausfuellAngebote.fuer(x.A, x.hu.id, { dokumente: [x.dok.id] }), []);
    await assert.rejects(x.abrufen(), status(404));
    assert.equal(x.aufrufe.length, 0);
  });
});

describe('Angebote beim Ausfüllen (#1724): Abruf', () => {
  it('Werte als Vorschläge mit Fundstelle; Verweis über eindeutige Felder; Eingang mit Code, ohne Mappe', async () => {
    const x = await aufbau();
    const fz = await x.d.mappen.legeMappeAn(
      { typId: x.fahrzeug.id, werte: { kennzeichen: 'DD-LM 123', fin: 'WVWZZZ1KZAW000001' } },
      x.lena.id,
    );
    x.setzeAntworten([
      JSON.stringify({
        vorschlaege: {
          kilometerstand: 9363,
          geprueft_am: { wert: '2026-04-16', sicherheit: 'hoch' },
          fahrzeug: fz.id, // Ids von Mappen nie vom Paket
          unbekannt: 'x',
        },
        verweise: { fahrzeug: { kennzeichen: 'dd lm 123', fin: 'WVWZZZ1KZAW000001' } },
      }),
    ]);
    const r = await x.abrufen();
    assert.ok('vorschlaege' in r);
    assert.deepEqual(r.vorschlaege.kilometerstand, { wert: 9363, sicherheit: 'hoch', fundstelle: 'abgerufen über „Fahrzeuge – KBA“' });
    assert.equal(r.vorschlaege.geprueft_am.wert, '2026-04-16');
    assert.equal(r.vorschlaege.fahrzeug.wert, fz.id, 'gefunden über das eindeutige Kennzeichen');
    assert.deepEqual(r.bezuege[fz.id]?.typId, x.fahrzeug.id);
    assert.equal(r.vorschlaege.kosten, undefined, 'nicht geliefert, bleibt');
    assert.equal(x.aufrufe.length, 1);
    const e = x.aufrufe[0].eingang;
    assert.equal(e.aktion, 'dms:angebot');
    assert.equal(e.angebot, 'dub');
    assert.deepEqual(e.code, { art: 'qr', inhalt: LINK, seite: 1 });
    assert.equal(e.schritt, 1);
    assert.equal(e.mappe, undefined, 'ohne Mappe (neue Post)');
    assert.equal(e.dokument, undefined, 'Paket ohne Dokumentrecht bekommt das Dokument nicht');
    assert.deepEqual((x.aufrufe[0].zugang as { dokumente: unknown }).dokumente, {}, 'eingeschränkter Zugriff ohne Dokument');
  });

  it('Verweis nicht gefunden: „neue Mappe anlegen“ mit den gelieferten Werten (nur Felder des Zieltyps)', async () => {
    const x = await aufbau();
    x.setzeAntworten([JSON.stringify({ verweise: { fahrzeug: { kennzeichen: 'DD-LM 999', fin: 'WVWZZZ1KZAW000002', farbe: 'rot' } } })]);
    const r = await x.abrufen();
    assert.ok('neu' in r);
    assert.deepEqual(r.neu.fahrzeug, {
      typId: x.fahrzeug.id,
      werte: { kennzeichen: 'DD-LM 999', fin: 'WVWZZZ1KZAW000002' },
      fundstelle: 'abgerufen über „Fahrzeuge – KBA“',
    });
    assert.equal(r.vorschlaege.fahrzeug, undefined);
  });

  it('Dialog des Pakets erlaubt: Lauf, Antworten, höchstens zwei Dialoge', async () => {
    const x = await aufbau();
    const dialog = {
      dialog: { titel: 'Abrufen', knopf: 'Weiter', felder: [{ art: 'haken', schluessel: 'ok', name: 'Einverstanden', pflicht: true }] },
    };
    x.setzeAntworten([JSON.stringify({ ...dialog, stand: { n: 1 } }), JSON.stringify({ vorschlaege: { kilometerstand: 9363 } })]);
    const a = await x.abrufen();
    assert.ok('dialog' in a);
    assert.equal(a.schritt, 1);
    await assert.rejects(x.abrufen({ lauf: a.lauf, antworten: {} }), status(422));
    await assert.rejects(x.abrufen({ lauf: a.lauf, angebot: 'anders', antworten: { ok: true } }), status(404));
    const b = await x.abrufen({ lauf: a.lauf, antworten: { ok: true } });
    assert.ok('vorschlaege' in b);
    assert.equal(b.vorschlaege.kilometerstand.wert, 9363);
    assert.deepEqual(x.aufrufe.at(-1)?.eingang.antworten, { ok: true });
    assert.deepEqual(x.aufrufe.at(-1)?.eingang.stand, { n: 1 });
    assert.equal(x.aufrufe.at(-1)?.eingang.kennung, a.lauf);
    await assert.rejects(x.abrufen({ lauf: a.lauf, antworten: { ok: true } }), status(404), 'Lauf ist zu Ende');
    // Drei Dialoge: abgebrochen.
    x.setzeAntworten([JSON.stringify(dialog), JSON.stringify(dialog), JSON.stringify(dialog)]);
    const c = await x.abrufen();
    assert.ok('lauf' in c);
    const d2 = await x.abrufen({ lauf: c.lauf, antworten: { ok: true } });
    assert.ok('lauf' in d2);
    await assert.rejects(x.abrufen({ lauf: c.lauf, antworten: { ok: true } }), status(502, /mehr als 2/));
  });

  it('Fehler des Pakets: Zeitgrenze, ungültige Antwort, eigene Meldung – verständlich, nichts übernommen', async () => {
    const x = await aufbau();
    x.setzeAntworten([{ ok: false, fehler: 'Keine Antwort innerhalb von 30000 ms.' }]);
    await assert.rejects(
      x.abrufen(),
      status(503, /hat nicht geklappt \(Keine Antwort innerhalb von 30000 ms\.\)\. Die übrigen Vorschläge bleiben/),
    );
    x.setzeAntworten(['kein json']);
    await assert.rejects(x.abrufen(), status(502, /keine gültige Antwort/));
    x.setzeAntworten([JSON.stringify({ fehler: 'Der Digitale Bericht ist nicht erreichbar.' })]);
    await assert.rejects(x.abrufen(), status(502, /„Fahrzeuge – KBA“ meldet: Der Digitale Bericht ist nicht erreichbar\./));
    x.setzeAntworten([JSON.stringify({ vorschlaege: { kilometerstand: 'viel' } })]);
    const r = await x.abrufen();
    assert.ok('hinweis' in r && r.hinweis);
    assert.deepEqual(r.vorschlaege, {});
  });

  it('Recht und Bedingungen bei jedem Abruf neu: Mappe eines anderen Typs, unbekanntes Dokument, kein Code', async () => {
    const x = await aufbau();
    const andere = await x.d.mappen.legeMappeAn({ typId: x.brief.id, werte: { betreff: 'Brief' } }, x.lena.id);
    await assert.rejects(x.abrufen({ mappe: andere.id }), status(422));
    await assert.rejects(x.abrufen({ dokument: '00000000-0000-4000-8000-00000000dead' }), status(404));
    await assert.rejects(x.abrufen({ angebot: 'gibtsnicht' }), status(404));
    x.setzeCodes([]);
    await x.d.dokumentVersionen.neueFassung(x.dok.id, {}, Buffer.from('%PDF-1.4 ohne'), x.lena.id);
    await assert.rejects(x.abrufen(), status(404));
    assert.equal(x.aufrufe.length, 0);
  });
});
