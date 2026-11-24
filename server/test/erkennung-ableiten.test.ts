/**
 * Erkennung (KW49): Verweisfeld aus einem Datum ableiten (#1648) und „Wie sicher ist Ablago?“ (#1645).
 * Kontoauszüge von Lena Muster bei einer erfundenen Bank; Nummern, IBAN und Daten sind erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCHWELLE_STANDARD, erkennbarImText } from '../../shared/src/klassifizierung';
import type { Register } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { Fachfehler } from '../src/grundlagen/fehler';

const meldet = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && re.test(JSON.stringify(e.details ?? {}) + e.message);

const FELDER: Register = { key: 'allgemein', name: 'Allgemein', art: 'felder' };
const DOKS: Register = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' };
const AUSZUG = (von: string, bis: string) => `Sparkasse Musterstadt · Am Markt 1 · 01067 Musterstadt
F I N A N Z S T A T U S vom ${von} -
${bis}
Kontoinhaber Lena Muster
IBAN DE89 3704 0044 0532 0130 00
Kontostand 1.234,56 EUR`;

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena Muster', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const steuerjahr = await d.mappentypen.legeTypAn({
    name: 'Steuerjahr',
    titelVorlage: 'Steuerjahr {jahr}',
    felder: [{ key: 'jahr', label: 'Jahr', typ: 'text', pflicht: true }],
    register: [{ ...FELDER, felder: ['jahr'] }, DOKS],
  });
  const konto = await d.mappentypen.legeTypAn({
    name: 'Konto',
    felder: [{ key: 'iban', label: 'IBAN', typ: 'text', format: 'iban', wiederfinden: true }],
    register: [{ ...FELDER, felder: ['iban'] }, DOKS],
  });
  const kontoauszug = await d.mappentypen.legeTypAn({
    name: 'Kontoauszug',
    erkennbarAn: 'Kontoauszug einer Bank: Kontostand, Buchungen, Zeitraum, IBAN oder Kontonummer',
    felder: [
      { key: 'konto', label: 'Konto', typ: 'referenz', zielTyp: konto.id },
      { key: 'beginn', label: 'Von', typ: 'datum', erkennung: { art: 'datum' } },
      { key: 'ende', label: 'Bis', typ: 'datum', erkennung: { art: 'datum' } },
      {
        key: 'steuerjahr',
        label: 'Steuerjahr',
        typ: 'referenz',
        zielTyp: steuerjahr.id,
        ausDatum: { datumFeld: 'ende', zielFeld: 'jahr' },
      },
    ],
    register: [{ ...FELDER, felder: ['konto', 'beginn', 'ende', 'steuerjahr'] }, DOKS],
  });
  const rechnung = await d.mappentypen.legeTypAn({
    name: 'Rechnung',
    erkennbarAn: 'Enthält Rechnungsnummer, Betrag und Zahlungsziel',
    felder: [{ key: 'nr', label: 'Rechnungsnummer', typ: 'text', erkennung: {} }],
    register: [{ ...FELDER, felder: ['nr'] }, DOKS],
  });
  // Zugriff erst nach den Mappentypen – er kennt die Typen beim Erzeugen.
  const A = await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' });
  const j2012 = await d.mappen.legeMappeAn({ typId: steuerjahr.id, werte: { jahr: '2012' } }, lena.id);
  const post = async (text: string) => {
    const p = await d.post.legePostAn({ betreff: 'Brief' }, { id: lena.id, name: 'Lena Muster' });
    const x = (
      await d.dokumente.ladeHoch(
        p.id,
        { register: 'dokumente', name: 'auszug.pdf', typ: 'application/pdf' },
        Buffer.from('%PDF-1.4 a'),
        lena.id,
      )
    ).dokument;
    await d.volltexte.schreibeVolltext(x.id, { text }, { id: lena.id, herkunft: 'Test', paket: false });
    return x.id;
  };
  return { d, lena, A, steuerjahr, konto, kontoauszug, rechnung, j2012, post };
}

describe('Verweisfeld aus einem Datum ableiten (#1648)', () => {
  it('am Mappentyp gespeichert und geprüft', async () => {
    const x = await aufbau();
    assert.deepEqual(x.kontoauszug.felder.find((f) => f.key === 'steuerjahr')?.ausDatum, { datumFeld: 'ende', zielFeld: 'jahr' });
    await assert.rejects(
      x.d.mappentypen.legeTypAn({
        name: 'Nebenkosten',
        felder: [
          { key: 'titel', label: 'Titel', typ: 'text' },
          {
            key: 'steuerjahr',
            label: 'Steuerjahr',
            typ: 'referenz',
            zielTyp: x.steuerjahr.id,
            ausDatum: { datumFeld: 'titel', zielFeld: 'jahr' },
          },
        ],
        register: [{ ...FELDER, felder: ['titel', 'steuerjahr'] }],
      }),
      meldet(/kein Datumsfeld/),
    );
    await assert.rejects(
      x.d.mappentypen.legeTypAn({
        name: 'Nebenkosten',
        felder: [
          { key: 'ende', label: 'Ende', typ: 'datum' },
          {
            key: 'steuerjahr',
            label: 'Steuerjahr',
            typ: 'referenz',
            zielTyp: x.steuerjahr.id,
            ausDatum: { datumFeld: 'ende', zielFeld: 'gibtsnicht' },
          },
        ],
        register: [{ ...FELDER, felder: ['ende', 'steuerjahr'] }],
      }),
      meldet(/kein Feld „gibtsnicht“/),
    );
  });

  it('Aus Dokument ausfüllen: Von/Bis als Zeitraum, Steuerjahr als Vorschlag', async () => {
    const x = await aufbau();
    const r = await x.d.erkennung.fuerTyp(x.kontoauszug.id, { dokumente: [await x.post(AUSZUG('01.07.2012', '31.07.2012'))] }, x.A);
    assert.equal(r.vorschlaege.beginn?.wert, '2012-07-01');
    assert.equal(r.vorschlaege.ende?.wert, '2012-07-31');
    assert.equal(r.vorschlaege.steuerjahr?.wert, x.j2012.id);
    assert.match(r.vorschlaege.steuerjahr!.fundstelle, /„Bis“: Jahr 2012/);
    assert.equal(r.bezuege[x.j2012.id]?.titel, 'Steuerjahr 2012');
    assert.equal(r.neu.steuerjahr, undefined);
  });

  it('kein passendes Steuerjahr: „anlegen“ mit dem Jahr – angelegt wird nichts', async () => {
    const x = await aufbau();
    const vorher = (await x.d.kern.repo.listeMappen(x.steuerjahr.id)).length;
    const r = await x.d.erkennung.fuerTyp(x.kontoauszug.id, { dokumente: [await x.post(AUSZUG('01.07.2013', '31.07.2013'))] }, x.A);
    assert.equal(r.vorschlaege.steuerjahr, undefined);
    assert.deepEqual(r.neu.steuerjahr && { typId: r.neu.steuerjahr.typId, werte: r.neu.steuerjahr.werte }, {
      typId: x.steuerjahr.id,
      werte: { jahr: '2013' },
    });
    assert.equal((await x.d.kern.repo.listeMappen(x.steuerjahr.id)).length, vorher);
  });

  it('beim Ändern des Datums (Oberfläche): passende Mappe, sonst „anlegen“; mehrere passende: keine', async () => {
    const x = await aufbau();
    const f = (ende: string) => x.d.mappenEingaben.folgen({ typId: x.kontoauszug.id, werte: { ende } }, x.A);
    assert.deepEqual((await f('2012-12-31')).felder.steuerjahr, {
      quelle: 'ende',
      wert: x.j2012.id,
      titel: 'Steuerjahr 2012',
      typId: x.steuerjahr.id,
    });
    assert.deepEqual((await f('2014-01-31')).felder.steuerjahr, {
      quelle: 'ende',
      wert: null,
      neu: { typId: x.steuerjahr.id, werte: { jahr: '2014' } },
    });
    assert.deepEqual((await f('kein Datum')).felder.steuerjahr, { quelle: 'ende', wert: null });
    await x.d.mappen.legeMappeAn({ typId: x.steuerjahr.id, werte: { jahr: '2012' } }, x.lena.id);
    assert.deepEqual((await f('2012-07-31')).felder.steuerjahr, { quelle: 'ende', wert: null });
  });
});

describe('Wie sicher ist Ablago? (#1645)', () => {
  it('je Typ, was fehlte: Überschrift, bekanntes Konto, „Woran man ihn erkennt“', async () => {
    const x = await aufbau();
    const r = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [await x.post(AUSZUG('01.07.2012', '31.07.2012'))] }, x.A);
    assert.equal(r.schwelle, SCHWELLE_STANDARD);
    const g = r.gruende![x.kontoauszug.id];
    assert.deepEqual(
      g.find((y) => y.art === 'ueberschrift-fehlt'),
      { art: 'ueberschrift-fehlt' },
    );
    assert.deepEqual(
      g.find((y) => y.art === 'merkmal-fehlt'),
      { art: 'merkmal-fehlt', feld: 'konto', typId: x.konto.id },
    );
    const e = g.find((y) => y.art === 'erkennbar') as { gefunden: number; von: number };
    assert.ok(e.von >= 6 && e.gefunden >= 2 && e.gefunden < e.von, JSON.stringify(e));
    // Nur Kennungen und Zahlen – kein Text aus dem Dokument.
    assert.doesNotMatch(JSON.stringify(r.gruende), /Lena|DE89|1\.234/);
    // Steuerjahr verweist auf nichts mit Merkmalen; „Woran man ihn erkennt“ ist leer.
    assert.deepEqual(r.gruende![x.steuerjahr.id], [{ art: 'ueberschrift-fehlt' }, { art: 'erkennbar-leer' }]);
  });

  it('mit bekanntem Konto fehlt es nicht mehr – und der Typ steht unter den besten', async () => {
    const x = await aufbau();
    await x.d.mappen.legeMappeAn({ typId: x.konto.id, werte: { iban: 'DE89 3704 0044 0532 0130 00' } }, x.lena.id);
    const r = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [await x.post(AUSZUG('01.07.2012', '31.07.2012'))] }, x.A);
    assert.equal(
      r.gruende![x.kontoauszug.id].find((y) => y.art === 'merkmal-fehlt'),
      undefined,
    );
    assert.equal(r.typen[0]?.typId, x.kontoauszug.id);
  });

  it('Schwelle im Expertenmodus: einstellbar, geprüft, ohne die Wahl der Erkennung zu ändern', async () => {
    const x = await aufbau();
    assert.equal((await x.d.erkennung.engineStand()).schwelle, SCHWELLE_STANDARD);
    const s = await x.d.erkennung.setzeStandard({ schwelle: 0.6 });
    assert.equal(s.schwelle, 0.6);
    assert.deepEqual(s.standard, { paket: null });
    await assert.rejects(x.d.erkennung.setzeStandard({ schwelle: 2 }), /zwischen 5 und 95 Prozent/);
    const brief = await x.post('Rechnung\nRechnungsnummer R-2026-117\nGesamtbetrag 184,20 EUR');
    const r = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [brief] }, x.A);
    assert.equal(r.typen[0]?.typId, x.rechnung.id);
    assert.equal(r.schwelle, 0.6);
    assert.equal(r.vorschlag?.typId, x.rechnung.id, 'die Überschrift allein (0,6) reicht genau');
    await x.d.erkennung.setzeStandard({ schwelle: 0.61 });
    assert.equal((await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [brief] }, x.A)).vorschlag, null, 'darüber nicht mehr');
    await x.d.erkennung.setzeStandard({ schwelle: null });
    const v = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [brief] }, x.A);
    assert.equal(v.vorschlag?.typId, x.rechnung.id);
    assert.equal(v.schwelle, SCHWELLE_STANDARD);
  });

  it('Wörter aus „Woran man ihn erkennt“: ohne Füllwörter, nur Zahlen', () => {
    assert.deepEqual(erkennbarImText('Enthält Rechnungsnummer, Betrag und Zahlungsziel', 'Rechnungsnummer R-1, Betrag 12,00 EUR'), {
      gefunden: 2,
      von: 3,
    });
    assert.deepEqual(erkennbarImText('', 'irgendwas'), { gefunden: 0, von: 0 });
  });
});
