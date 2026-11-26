/**
 * Erkennung vorberechnen (#1567): Nach dem Volltext rechnet Ablago „Wohin gehört das?“ und für die wahrscheinlichsten
 * Typen „Aus Dokument ausfüllen“ und den Abgleich im Hintergrund; beim Öffnen wird nur gelesen. Texte und Firmen sind
 * erfunden (Persona Lena Muster, example.org).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DARF_EINSTELLUNG } from '../../shared/src/darf';
import type { Register } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { volleSicht, type Vorberechnet } from '../src/erkennung/vorberechnung';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';

const FELDER: Register = { key: 'allgemein', name: 'Allgemein', art: 'felder' };
const DOKS: Register = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' };

const RECHNUNG = `Beispiel Handwerk GmbH · Werkstraße 1 · 01067 Musterstadt
Lena Muster, Lindenweg 4, 01234 Beispielort

Rechnung
Rechnungsnummer RE-2026-0815
Betrag 119,00 EUR, zahlbar bis 15.12.2026. Fragen: info@example.org`;

async function aufbau(darf?: { pakete: string; selbst: string }) {
  const einst = speicherEinstellungen();
  if (darf) await einst.schreibe(DARF_EINSTELLUNG, { ...darf, hoechstens: {}, herkunft: 'neu' });
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: einst });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena Muster', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const rechnung = await d.mappentypen.legeTypAn({
    name: 'Rechnung',
    erkennbarAn: 'Rechnungsnummer, Betrag, zahlbar bis',
    felder: [
      { key: 'nr', label: 'Rechnungsnummer', typ: 'text', erkennung: { art: 'nummer' } },
      { key: 'betrag', label: 'Betrag', typ: 'betrag', erkennung: {} },
    ],
    register: [{ ...FELDER, felder: ['nr', 'betrag'] }, DOKS],
  });
  await d.mappentypen.legeTypAn({
    name: 'Vertrag',
    felder: [{ key: 'vnr', label: 'Vertragsnummer', typ: 'text' }],
    register: [{ ...FELDER, felder: ['vnr'] }, DOKS],
  });
  const A = await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' });
  const post = await d.post.legePostAn({ betreff: 'Brief' }, { id: lena.id, name: 'Lena Muster' });
  const dok = (
    await d.dokumente.ladeHoch(
      post.id,
      { register: 'dokumente', name: 'brief.pdf', typ: 'application/pdf' },
      Buffer.from('%PDF-1.4 x'),
      lena.id,
    )
  ).dokument;
  await d.volltexte.schreibeVolltext(dok.id, { text: RECHNUNG }, { id: lena.id, herkunft: 'Test', paket: false });
  await d.erkennung.vorberechnung.fertig();
  const vorberechnet = async () =>
    ((await d.kern.repo.erkennungLies(post.id))?.ergebnis as { vorberechnet?: Vorberechnet } | undefined)?.vorberechnet;
  return { d, lena, A, rechnung, post, dok, vorberechnet };
}

describe('Erkennung vorberechnen (#1567)', () => {
  it('nach dem Volltext liegt das Ergebnis an der Post; beim Öffnen dasselbe wie live gerechnet', async () => {
    const x = await aufbau();
    const v = await x.vorberechnet();
    assert.ok(v, 'vorberechnet');
    assert.deepEqual(v.dokumente, [x.dok.id]);
    assert.equal(v.klass.vorschlag?.typId, x.rechnung.id);
    assert.ok(v.je[x.rechnung.id]?.vorschlaege, 'Felder für den wahrscheinlichsten Typ');
    const eingabe = { dokumente: [x.dok.id] };
    const gelesen = await x.d.erkennung.vorberechnung.klass(eingabe, x.A);
    assert.deepEqual(gelesen, await x.d.erkennung.klassifizierung.klassifiziere(eingabe, x.A));
    const felder = await x.d.erkennung.vorberechnung.felder(x.rechnung.id, eingabe, x.A);
    assert.deepEqual(felder, await x.d.erkennung.fuerTyp(x.rechnung.id, eingabe, x.A));
    assert.equal((felder?.vorschlaege.nr as { wert?: unknown } | undefined)?.wert, 'RE-2026-0815');
    assert.ok(await x.d.erkennung.vorberechnung.abgleich({ ...eingabe, typ: x.rechnung.id }, x.A));
  });

  it('nicht für andere Dokumente, mit Text, für fremde Typen oder ohne volle Sicht', async () => {
    const x = await aufbau();
    const v = x.d.erkennung.vorberechnung;
    assert.equal(await v.klass({ dokumente: [] }, x.A), null);
    assert.equal(await v.felder(x.rechnung.id, { dokumente: [x.dok.id], text: 'x' }, x.A), null);
    assert.equal(await v.felder('unbekannt', { dokumente: [x.dok.id] }, x.A), null);
    const mitglied = await x.d.rechtepruefung.zugriff({ id: x.lena.id, rolle: 'mitglied' });
    assert.equal(volleSicht(mitglied), false);
    assert.equal(await v.klass({ dokumente: [x.dok.id] }, mitglied), null, 'Mitglied rechnet live wie bisher');
  });

  it('veraltet, sobald sich ein Mappentyp ändert; „neu starten“ rechnet wieder', async () => {
    const x = await aufbau();
    const eingabe = { dokumente: [x.dok.id] };
    assert.ok(await x.d.erkennung.vorberechnung.klass(eingabe, x.A));
    await x.d.mappentypen.legeTypAn({
      name: 'Mahnung',
      felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
      register: [{ ...FELDER, felder: ['nr'] }, DOKS],
    });
    assert.equal(await x.d.erkennung.vorberechnung.klass(eingabe, x.A), null, 'veraltet: live rechnen');
    assert.equal(await x.d.erkennung.vorberechnung.rechne(x.post.id), true);
    assert.ok(await x.d.erkennung.vorberechnung.klass(eingabe, x.A));
  });

  it('„Nichts von sich aus“: nichts im Hintergrund, nur auf ausdrücklichen Wunsch', async () => {
    const x = await aufbau({ pakete: 'lokal', selbst: 'nichts' });
    assert.equal(await x.vorberechnet(), undefined);
    assert.equal(await x.d.erkennung.vorberechnung.rechne(x.post.id), false);
    assert.equal(await x.d.erkennung.vorberechnung.rechne(x.post.id, { auchWennAus: true }), true);
    assert.ok(await x.vorberechnet());
  });
});
