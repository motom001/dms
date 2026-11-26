/**
 * Auswahllisten in der Erkennung (#1689): Ein Eintrag wie Vertragsart „Versicherung“ mit dem Erkennungswort
 * „Versicherungsschein“ spricht für den Typ, der auf die Liste verweist (Vertrag), füllt dessen Verweisfeld vor und wird
 * selbst nie vorgeschlagen. Firmen und Texte sind erfunden (Persona Lena Muster, example.org).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findeWort, fuellfelder, istAuswahlliste, woerterVon, artVon } from '../../shared/src/erkennung';
import type { Feld, Register } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';

const FELDER: Register = { key: 'allgemein', name: 'Allgemein', art: 'felder' };
const DOKS: Register = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' };

const SCHEIN = `Beispiel Versicherung AG · Postfach 1 · 01067 Musterstadt
Lena Muster, Lindenweg 4, 01234 Beispielort

Ihr neuer Versicherungsschein
Versicherungsnehmer: Lena Muster
Beitrag 84,00 EUR jährlich. Fragen: service@example.org`;

describe('Auswahllisten (#1689): Wörter', () => {
  const art: Feld = { key: 'erkennungswoerter', label: 'Erkennungswörter', typ: 'text' };
  const liste = { felder: [{ key: 'name', label: 'Name', typ: 'text' as const }, art] };

  it('Erkennungswörter: eigene Art, nie aus dem Dokument gefüllt, kein Merkmal', () => {
    assert.equal(artVon(art), 'woerter');
    assert.deepEqual(
      fuellfelder({ felder: [art, { key: 'nr', label: 'Nummer', typ: 'text', erkennung: {} }] }).map((x) => x.feld.key),
      ['nr'],
    );
    assert.equal(istAuswahlliste({ ...liste, ausPost: false }), true);
    assert.equal(istAuswahlliste({ ...liste, ausPost: null }), false, 'nur ausdrücklich „nie aus Post“');
    assert.equal(
      istAuswahlliste({ felder: [{ key: 'name', label: 'Name', typ: 'text', wiederfinden: true }], ausPost: false }),
      false,
      'mit Feldern zum Wiederfinden (Organisation) keine Auswahlliste',
    );
  });

  it('jedes Wort einzeln, nur ganze Wörter, Groß und klein egal, kurze zählen nicht', () => {
    const w = woerterVon(liste, { titel: 'Versicherung', werte: { erkennungswoerter: 'Versicherungsschein, Police, KV, police' } });
    assert.deepEqual(w, ['Versicherung', 'Versicherungsschein', 'Police']);
    assert.equal(findeWort('Ihr neuer VERSICHERUNGSSCHEIN', w), 'Versicherungsschein');
    assert.equal(findeWort('Versicherungsscheinnummer 12', w), null, 'nur als ganzes Wort');
    assert.equal(findeWort('Policen-Nr. 7', ['Police']), null);
    assert.equal(findeWort('Ihre Police.', ['Police']), 'Police');
    assert.equal(findeWort('Kfz-Versicherung (a+b)', ['a+b']), 'a+b', 'Sonderzeichen gelten wörtlich');
  });
});

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena Muster', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const art = await d.mappentypen.legeTypAn({
    name: 'Vertragsart',
    ausPost: false,
    felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true },
      { key: 'erkennungswoerter', label: 'Erkennungswörter', typ: 'text' },
    ],
    titelFeld: 'name',
    register: [{ ...FELDER, felder: ['name', 'erkennungswoerter'] }],
  });
  const vertrag = await d.mappentypen.legeTypAn({
    name: 'Vertrag',
    felder: [{ key: 'art', label: 'Vertragsart', typ: 'referenz', zielTyp: art.id, erkennung: {} }],
    register: [{ ...FELDER, felder: ['art'] }, DOKS],
  });
  const rechnung = await d.mappentypen.legeTypAn({
    name: 'Rechnung',
    felder: [{ key: 'nr', label: 'Rechnungsnummer', typ: 'text' }],
    register: [{ ...FELDER, felder: ['nr'] }, DOKS],
  });
  const A = await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' });
  const eintrag = (name: string, erkennungswoerter: string) =>
    d.mappen.legeMappeAn({ typId: art.id, werte: { name, erkennungswoerter } }, lena.id);
  const brief = async (text: string) => {
    const p = await d.post.legePostAn({ betreff: 'Brief' }, { id: lena.id, name: 'Lena Muster' });
    const x = (
      await d.dokumente.ladeHoch(
        p.id,
        { register: 'dokumente', name: 'brief.pdf', typ: 'application/pdf' },
        Buffer.from('%PDF-1.4 x'),
        lena.id,
      )
    ).dokument;
    await d.volltexte.schreibeVolltext(x.id, { text }, { id: lena.id, herkunft: 'Test', paket: false });
    return x.id;
  };
  return { d, A, art, vertrag, rechnung, eintrag, brief };
}

describe('Auswahllisten (#1689): Klassifizieren und Ausfüllen', () => {
  it('„Versicherungsschein“ → Vertrag mit Beleg aus der Vertragsart; die Liste selbst nie', async () => {
    const x = await aufbau();
    const vers = await x.eintrag('Versicherung', 'Versicherungsschein, Police');
    await x.eintrag('Strom', 'Stromliefervertrag, Abschlag');
    const dok = await x.brief(SCHEIN);
    const k = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [dok] }, x.A);
    assert.equal(k.vorschlag?.typId, x.vertrag.id, JSON.stringify(k.typen));
    const beleg = k.vorschlag!.belege.find((b) => b.weg === 'auswahl');
    assert.deepEqual(
      { mappe: beleg?.mappeId, feld: beleg?.feld, wort: beleg?.wort },
      { mappe: vers.id, feld: 'Vertragsart', wort: 'Versicherungsschein' },
    );
    assert.ok(k.vorschlag!.sicherheit < 0.75, 'allein höchstens „wahrscheinlich“');
    assert.equal(k.bezuege[vers.id]?.titel, 'Versicherung');
    assert.ok(!k.typen.some((t) => t.typId === x.art.id), 'Auswahlliste nie vorgeschlagen');
    assert.ok(k.wege.some((w) => w.weg === 'auswahl' && w.stand === 'ok'));
  });

  it('füllt das Verweisfeld vor; zwei passende Einträge oder keiner: leer, nie „neu anlegen“', async () => {
    const x = await aufbau();
    const vers = await x.eintrag('Versicherung', 'Versicherungsschein');
    const r = await x.d.erkennung.fuerTyp(x.vertrag.id, { dokumente: [await x.brief(SCHEIN)] }, x.A);
    assert.deepEqual(r.vorschlaege.art?.wert, vers.id);
    assert.equal(r.vorschlaege.art?.sicherheit, 'mittel');
    // Ein zweiter Eintrag passt ebenfalls („Beitrag“) – nicht raten.
    await x.eintrag('Beitragsverträge', 'Beitrag');
    const zwei = await x.d.erkennung.fuerTyp(x.vertrag.id, { dokumente: [await x.brief(SCHEIN)] }, x.A);
    assert.equal(zwei.vorschlaege.art, undefined);
    assert.equal(zwei.neu?.art, undefined, 'nie „neu anlegen“ aus dem Briefkopf');
    const ohne = await x.d.erkennung.fuerTyp(x.vertrag.id, { dokumente: [await x.brief('Rechnung Nr. 4711')] }, x.A);
    assert.equal(ohne.vorschlaege.art, undefined);
    assert.equal(ohne.neu?.art, undefined);
  });

  it('ohne Treffer bleibt alles wie bisher', async () => {
    const x = await aufbau();
    await x.eintrag('Versicherung', 'Versicherungsschein');
    const k = await x.d.erkennung.klassifizierung.klassifiziere(
      { dokumente: [await x.brief('Rechnung Nr. 4711, zahlbar bis 01.02.2027')] },
      x.A,
    );
    assert.ok(!k.typen.some((t) => t.belege.some((b) => b.weg === 'auswahl')));
    assert.ok(!k.wege.some((w) => w.weg === 'auswahl'));
  });
});
