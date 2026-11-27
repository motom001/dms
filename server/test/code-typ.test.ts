/**
 * Mappentyp am Code erkennen (#1728): Passt ein gemerkter Code (#1723) auf das Code-Muster eines Felds, ist das in
 * „Wohin gehört das?“ ein eigener Weg `code` mit starker Stimme. Kommen die Codes erst nach der Vorberechnung (#1567),
 * rechnet Ablago neu. HU-Bericht von Lena Muster mit erfundenen Zugangsdaten; das Paket ist nachgestellt.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CODE_SICHERHEIT, codeBelege } from '../../shared/src/klassifizierung-code';
import type { Register } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import type { Vorberechnet } from '../src/erkennung/vorberechnung';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';

const FELDER: Register = { key: 'allgemein', name: 'Allgemein', art: 'felder' };
const DOKS: Register = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' };
const MUSTER = 'https://www\\.kba-online\\.de/dub/#/zugriffsdaten/[0-9A-Z]{12}/[0-9A-Z]+/[0-9]+';
const LINK = 'https://www.kba-online.de/dub/#/zugriffsdaten/A1B2C3D4E5F6/P0123456789/0815';
/** Ein Bericht, der im Text eher nach Rechnung aussieht (Gebühren mit Summe) – der Code soll den Typ entscheiden. */
const BERICHT = `Prüfstelle Beispiel · Werkstraße 1 · 01067 Musterstadt
Lena Muster, Lindenweg 4, 01234 Beispielort
Rechnung
Gebühren 128,50 EUR, Rechnungsnummer RE-2026-0815, zahlbar bis 15.12.2026
(4) km-Stand 9363`;

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena Muster', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const rechnung = await d.mappentypen.legeTypAn({
    name: 'Rechnung',
    erkennbarAn: 'Rechnungsnummer, Betrag, zahlbar bis',
    felder: [{ key: 'nr', label: 'Rechnungsnummer', typ: 'text', erkennung: { art: 'nummer' } }],
    register: [{ ...FELDER, felder: ['nr'] }, DOKS],
  });
  const hu = await d.mappentypen.legeTypAn({
    name: 'Hauptuntersuchung',
    felder: [{ key: 'bericht', label: 'Digitaler Bericht', typ: 'text', erkennung: { art: 'code', codeart: 'qr', muster: MUSTER } }],
    register: [{ ...FELDER, felder: ['bericht'] }, DOKS],
  });
  const A = await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' });
  // Paket „QR-Code lesen“, nachgestellt: liefert die Codes aus `antwort`.
  let antwort = '{"codes":[]}';
  let aufrufe = 0;
  const anbieter = {
    pakete: () => [{ id: 'qrcode', name: 'QR-Code lesen', netz: false }],
    lies: async () => {
      aufrufe++;
      return { text: antwort, ms: 1 };
    },
  };
  // Das Lesen im Hintergrund stoßen die Tests selbst an.
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
  await d.erkennung.vorberechnung.fertig();
  const vorberechnet = async () =>
    ((await d.kern.repo.erkennungLies(post.id))?.ergebnis as { vorberechnet?: Vorberechnet } | undefined)?.vorberechnet;
  const klass = () => d.erkennung.klassifizierung.klassifiziere({ dokumente: [dok.id] }, A);
  return {
    d,
    A,
    rechnung,
    hu,
    post,
    dok,
    anbieter,
    klass,
    vorberechnet,
    setze: (codes: unknown[]) => (antwort = JSON.stringify({ codes })),
    aufrufe: () => aufrufe,
  };
}

describe('Mappentyp am Code erkennen (#1728)', () => {
  it('Belege: nur Felder mit Muster, frühere Seite, mehrere Typen teilen sich die Stimme', () => {
    const typ = (id: string, erkennung: unknown) => ({ id, felder: [{ key: 'b', label: 'Bericht', typ: 'text', erkennung }] }) as never;
    const codes = [
      { art: 'qr', inhalt: 'https://www.example.org/datenschutz', seite: 1 },
      { art: 'qr', inhalt: LINK, seite: 2 },
    ];
    assert.deepEqual(codeBelege([typ('hu', { art: 'code', muster: MUSTER })], codes), [
      { typId: 'hu', weg: 'code', sicherheit: CODE_SICHERHEIT, feld: 'Bericht', wort: 'qr', seite: 2 },
    ]);
    assert.deepEqual(codeBelege([typ('x', { art: 'code' })], codes), [], 'ohne Muster sagt ein Code nichts über den Typ');
    assert.deepEqual(codeBelege([typ('hu', { art: 'code', muster: MUSTER })], []), []);
    const zwei = codeBelege([typ('a', { art: 'code', muster: MUSTER }), typ('b', { art: 'code', muster: MUSTER })], codes);
    assert.deepEqual(
      zwei.map((x) => x.sicherheit),
      [0.45, 0.45],
    );
  });

  it('passender Code: Hauptuntersuchung auf Platz 1 mit Beleg code und Fundort; ohne Codes unverändert', async () => {
    const x = await aufbau();
    const ohne = await x.klass();
    assert.notEqual(ohne.typen[0]?.typId, x.hu.id, 'am Text allein sieht es nach Rechnung aus');
    assert.equal(
      ohne.wege.some((w) => w.weg === 'code'),
      false,
    );
    x.d.erkennung.codes.anbieter = x.anbieter;
    x.setze([{ art: 'qr', inhalt: LINK, seite: 1 }]);
    await x.d.erkennung.codes.lies(x.dok.id, 1000);
    const mit = await x.klass();
    assert.equal(mit.typen[0].typId, x.hu.id);
    assert.equal(mit.vorschlag?.typId, x.hu.id);
    assert.deepEqual(
      mit.typen[0].belege.find((b) => b.weg === 'code'),
      { weg: 'code', sicherheit: CODE_SICHERHEIT, feld: 'Digitaler Bericht', wort: 'qr', seite: 1 },
    );
    assert.ok(mit.wege.some((w) => w.weg === 'code' && w.stand === 'ok'));
  });

  it('Code passt auf kein Muster: Klassifizierung unverändert', async () => {
    const x = await aufbau();
    const ohne = await x.klass();
    x.d.erkennung.codes.anbieter = x.anbieter;
    x.setze([{ art: 'qr', inhalt: 'https://www.example.org/datenschutz', seite: 1 }]);
    await x.d.erkennung.codes.lies(x.dok.id, 1000);
    assert.deepEqual(await x.klass(), ohne);
  });

  it('Codes nach der Vorberechnung: Ablago rechnet neu; Klassifizieren liest fehlende Codes im Hintergrund', async () => {
    const x = await aufbau();
    const vorher = await x.vorberechnet();
    assert.ok(vorher, 'vorberechnet ohne Codes');
    assert.notEqual(vorher.klass.typen[0]?.typId, x.hu.id);
    x.d.erkennung.codes.anbieter = x.anbieter;
    x.setze([{ art: 'qr', inhalt: LINK, seite: 1 }]);
    // Klassifizieren wartet nicht auf das Paket, stößt das Lesen aber an.
    await x.klass();
    await x.d.erkennung.codes.fertig();
    assert.equal(x.aufrufe(), 1);
    await x.d.erkennung.vorberechnung.fertig();
    const nachher = await x.vorberechnet();
    assert.notEqual(nachher?.zeit, undefined);
    assert.equal(nachher?.klass.typen[0]?.typId, x.hu.id, 'neu gerechnet mit dem Code');
    assert.equal(
      (nachher?.je[x.hu.id]?.vorschlaege?.vorschlaege.bericht as { wert?: unknown } | undefined)?.wert,
      LINK,
      'und das Feld mit dem Code ist vorberechnet',
    );
  });

  it('keine Codes: keine neue Vorberechnung', async () => {
    const x = await aufbau();
    const vorher = await x.vorberechnet();
    x.d.erkennung.codes.anbieter = x.anbieter;
    await x.d.erkennung.codes.lies(x.dok.id, 1000);
    await x.d.erkennung.vorberechnung.fertig();
    assert.equal((await x.vorberechnet())?.zeit, vorher?.zeit);
  });
});
