/**
 * Werkbank → Rundgänge (#941): Prüfen mit Zeile, eigene speichern mit Konfliktschutz (#917), an/aus für alle,
 * eigene Rundgänge in „Ablago entdecken“, Umschreiben für „Paket erstellen“.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ankerListe, Entdecken } from '../src/entdecken/entdecken';
import {
  insPaket,
  pruefeRundgangDatei,
  RundgaengeWerkbank,
  rundgangAlsYaml,
  WERKBANK_EINSTELLUNG,
} from '../src/entdecken/entdecken-werkbank';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';

const TYPEN = new Map([['urlaubsantrag', { kennung: 'urlaubsantrag', felder: ['zeitraum'], register: ['dokumente'] }]]);
const pruefung = async () => ({ anker: ankerListe(), typ: (k: string) => TYPEN.get(k) ?? null });
const GUT = `schluessel: urlaub
titel: Urlaub beantragen
beschreibung: Wo Urlaubsanträge liegen.
oeffne:
  neu: { typ: urlaubsantrag }
schritte:
  - schluessel: zeitraum
    ziel: mappe.feld:zeitraum
    ort: Rechts im Formular
    titel: Zeitraum
    text: Trag hier ein, wann du frei hast.
`;

describe('Werkbank → Rundgänge: Prüfen (#941)', () => {
  it('Fehler mit Zeile und verständlicher Ursache', async () => {
    const o = await pruefung();
    assert.deepEqual(pruefeRundgangDatei(GUT, o).fehler, []);
    const falsch = pruefeRundgangDatei(
      GUT.replace('mappe.feld:zeitraum', 'mappe.feld:gibt_es_nicht').replace('titel: Zeitraum', 'titel: Zeitraum\n    farbe: rot'),
      o,
    );
    assert.deepEqual(
      falsch.fehler.map((f) => f.zeile),
      [11, 8],
    );
    assert.match(falsch.fehler[1].text, /^Schritt 1: Das Feld „gibt_es_nicht“ gibt es im Mappentyp „urlaubsantrag“ nicht\./);
    assert.match(falsch.fehler[0].text, /unbekanntes Feld „farbe“/);
    assert.match(pruefeRundgangDatei('schluessel: [', o).fehler[0].text, /Kein gültiges YAML/);
    assert.match(pruefeRundgangDatei('- a: 1\n- b: 2\n', o).fehler[0].text, /genau einen Rundgang/);
    const neun = `${GUT.split('schritte:')[0]}schritte:\n${Array.from({ length: 9 }, (_, i) => `  - { schluessel: s${i}, titel: T, text: X }`).join('\n')}\n`;
    assert.match(pruefeRundgangDatei(neun, o).fehler[0].text, /9 Schritte, höchstens 8/);
    assert.match(
      pruefeRundgangDatei(GUT.replace('schritte:', 'start: erste_anmeldung\nschritte:'), o).fehler[0].text,
      /nur für Ablagos eigenen Rundgang/,
      'eigene starten nie von selbst',
    );
  });

  it('Ausprobieren (#1533): Rundgang aus einem Paket bzw. von Ablago wird mit seiner Herkunft geprüft, gespeichert nur als eigener', async () => {
    const e = speicherEinstellungen();
    const speicher = { lies: () => e.lies(WERKBANK_EINSTELLUNG), schreibe: (x: unknown) => e.schreibe(WERKBANK_EINSTELLUNG, x) };
    const w = new RundgaengeWerkbank({ speicher, pruefung });
    const paket = GUT.replace('schritte:', 'start: nach_installation\nschritte:');
    assert.match((await w.pruefe(paket)).fehler[0].text, /nur für Rundgänge aus Paketen/, 'ohne Herkunft wie bisher');
    assert.deepEqual((await w.pruefe(paket, 'paket:haushalt')).fehler, [], 'Paket-Rundgang lässt sich ausprobieren');
    const ablago = GUT.replace('schritte:', 'start: erste_anmeldung\nschritte:');
    assert.deepEqual((await w.pruefe(ablago, 'ablago')).fehler, [], 'Ablagos Rundgang lässt sich ausprobieren');
    assert.equal((await w.pruefe(paket, 'paket:../x')).fehler.length, 1, 'unbekannte Herkunft gilt als eigen');
    await assert.rejects(
      w.speichere(null, { yaml: paket, herkunft: 'paket:haushalt' }, 'lena@example.org'),
      (x: unknown) => x instanceof Fachfehler && x.status === 422,
      'gespeichert wird immer als eigener',
    );
  });

  it('Datei eines Rundgangs zum Ansehen und Kopieren lässt sich wieder prüfen', async () => {
    const o = await pruefung();
    const r = pruefeRundgangDatei(GUT, o).rundgang!;
    const zurueck = pruefeRundgangDatei(rundgangAlsYaml({ ...r, schluessel: 'eigen:urlaub' }), o);
    assert.deepEqual(zurueck.fehler, []);
    assert.deepEqual(zurueck.rundgang, r);
  });
});

describe('Werkbank → Rundgänge: speichern, an/aus, in „Ablago entdecken“ (#941)', () => {
  async function aufbau() {
    const e = speicherEinstellungen();
    const speicher = {
      lies: () => e.lies(WERKBANK_EINSTELLUNG),
      schreibe: (w: unknown) => e.schreibe(WERKBANK_EINSTELLUNG, w),
      tausche: (a: unknown, n: unknown) => e.tausche!(WERKBANK_EINSTELLUNG, a, n),
    };
    const w = new RundgaengeWerkbank({ speicher, pruefung });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas');
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const ent = new Entdecken({
      einstellungen: (b) => konten.einstellungen(b),
      setzeEinstellung: (b, k, x) => konten.setzeEinstellung(b, k, x),
      version: () => '0.260.0',
      heute: () => '2026-11-15',
      funktionen: async () => new Set(),
      typen: async () => [...TYPEN.values()],
      werkbank: () => e.lies(WERKBANK_EINSTELLUNG),
    });
    return { w, ent, lena: { ...lena, letzteAnmeldung: null } };
  }

  it('nur ohne Fehler; zwei Verwaltende überschreiben sich nicht (409)', async () => {
    const { w } = await aufbau();
    await assert.rejects(
      w.speichere(null, { yaml: 'schluessel: x' }, 'lena@example.org'),
      (x: unknown) => x instanceof Fachfehler && x.status === 422,
    );
    const a = await w.speichere(null, { yaml: GUT }, 'lena@example.org');
    assert.equal(a.schluessel, 'urlaub');
    await assert.rejects(w.speichere(null, { yaml: GUT }, 'markus@example.org'), /gibt es schon/);
    const b = await w.speichere('urlaub', { yaml: GUT.replace('Urlaub beantragen', 'Urlaub'), stand: a.geaendert }, 'markus@example.org');
    await assert.rejects(
      w.speichere('urlaub', { yaml: GUT, stand: a.geaendert }, 'lena@example.org'),
      (x: unknown) => x instanceof Fachfehler && x.status === 409,
    );
    assert.equal((await w.lies()).rundgaenge[0].von, 'markus@example.org');
    assert.notEqual(b.geaendert, '');
  });

  it('eigene stehen unter „Ablago entdecken“ (nie von selbst); ausgeschaltete fallen für alle weg', async () => {
    const { w, ent, lena } = await aufbau();
    await w.speichere(null, { yaml: GUT }, 'lena@example.org');
    let s = await ent.stand(lena);
    const eigen = s.rundgaenge.find((r) => r.schluessel === 'eigen:urlaub');
    assert.equal(eigen?.herkunft, 'eigen');
    assert.equal(eigen?.start, 'manuell');
    assert.equal(s.starten, 'ablago');
    await w.schalte('rundgang', 'ablago', false);
    await w.schalte('rundgang', 'eigen:urlaub', false);
    s = await ent.stand(lena);
    assert.equal(s.starten, null, 'Ablagos Rundgang ausgeschaltet: startet nicht');
    assert.ok(!s.rundgaenge.some((r) => r.schluessel === 'eigen:urlaub' || r.schluessel === 'ablago'));
    assert.ok(!s.tipps.some((x) => x.rundgang === 'ablago'), 'kein Tipp, der einen ausgeschalteten Rundgang startet');
    const liste = await w.liste((await ent.quellen({ alle: true })).rundgaenge, () => undefined, new Map());
    assert.equal(liste.find((r) => r.schluessel === 'eigen:urlaub')?.an, false, 'die Werkbank zeigt auch Ausgeschaltetes');
    await w.loesche('urlaub');
    assert.deepEqual((await w.lies()).aus, ['rundgang:ablago']);
  });

  it('„Paket erstellen“: Mappentypen werden zum Schlüssel im Paket bzw. zur Abhängigkeit', () => {
    const roh = { schluessel: 'urlaub', oeffne: { neu: { typ: 'urlaubsantrag' } }, schritte: [] };
    assert.deepEqual(insPaket(roh, (k) => (k === 'urlaubsantrag' ? 'antrag' : null)).roh.oeffne, { neu: { typ: 'antrag' } });
    assert.deepEqual(insPaket(roh, () => null).fehlt, ['urlaubsantrag']);
    assert.deepEqual(roh.oeffne, { neu: { typ: 'urlaubsantrag' } }, 'das Original bleibt');
  });
});

describe('Werkbank → Tipps (#942)', () => {
  async function aufbau() {
    const e = speicherEinstellungen();
    const speicher = {
      lies: () => e.lies(WERKBANK_EINSTELLUNG),
      schreibe: (w: unknown) => e.schreibe(WERKBANK_EINSTELLUNG, w),
      tausche: (a: unknown, n: unknown) => e.tausche!(WERKBANK_EINSTELLUNG, a, n),
    };
    const w = new RundgaengeWerkbank({ speicher, pruefung });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas');
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const ent = new Entdecken({
      einstellungen: (b) => konten.einstellungen(b),
      setzeEinstellung: (b, k, x) => konten.setzeEinstellung(b, k, x),
      version: () => '0.260.0',
      heute: () => '2026-11-15',
      funktionen: async () => new Set(),
      typen: async () => [...TYPEN.values()],
      werkbank: () => e.lies(WERKBANK_EINSTELLUNG),
    });
    const kontext = async () => {
      const q = await ent.quellen({ alle: true });
      return {
        anker: q.anker,
        typ: (k: string) => TYPEN.get(k) ?? null,
        rundgaenge: q.rundgaenge.map((r) => r.schluessel),
        tipps: q.tipps,
        originale: q.tippOriginale,
      };
    };
    return { w, ent, lena: { ...lena, letzteAnmeldung: null }, kontext };
  }

  it('eigener Tipp: Formularfehler am Feld, gespeichert erscheint er für alle', async () => {
    const { w, ent, lena, kontext } = await aufbau();
    await assert.rejects(
      w.speichereTipp(
        null,
        { daten: { text: 'x'.repeat(161), bereich: 'suche', ziel: 'startseite.suche' } },
        'lena@example.org',
        await kontext(),
      ),
      (x: unknown) => x instanceof Fachfehler && JSON.stringify(x.details).includes('"feld":"text"'),
    );
    await assert.rejects(
      w.speichereTipp(null, { daten: { text: 'Kurz.', bereich: 'suche', ziel: 'mappe.feld:zeitraum' } }, null, await kontext()),
      /fehler/i,
    );
    const n = await w.speichereTipp(
      null,
      { daten: { text: 'Urlaub trägst du in der Mappe ein.', bereich: 'mappen', ziel: 'mappe.feld:zeitraum', typ: 'urlaubsantrag' } },
      'lena@example.org',
      await kontext(),
    );
    assert.equal(n.schluessel, 'eigen:tipp_1');
    const s = await ent.stand(lena);
    assert.deepEqual(s.tipps.find((x) => x.schluessel === 'eigen:tipp_1')?.ziel, { anker: 'mappe.feld:zeitraum', typ: 'urlaubsantrag' });
  });

  it('Tipp von Ablago anpassen: getrennt gespeichert, Original bleibt, Hinweis bei geändertem Original, zurücksetzen', async () => {
    const { w, ent, lena, kontext } = await aufbau();
    const k = await kontext();
    const original = k.tipps.find((x) => x.schluessel === 'favoriten')!;
    await w.speichereTipp('favoriten', { daten: { ...original, text: 'Bei uns heißen Favoriten „Merkliste“.' } }, 'lena@example.org', {
      ...k,
      original,
    });
    assert.equal((await ent.stand(lena)).tipps.find((x) => x.schluessel === 'favoriten')?.text, 'Bei uns heißen Favoriten „Merkliste“.');
    const q = await ent.quellen({ alle: true });
    let liste = await w.tippListe(q.tipps, q.tippOriginale, () => undefined, q.tippFehler);
    let f = liste.find((x) => x.schluessel === 'favoriten')!;
    assert.equal(f.angepasst, true);
    assert.equal(f.original?.text, original.text);
    assert.equal(f.originalVorher, undefined);
    // Das Original ändert sich (z. B. Update): Anpassung bleibt, Hinweis mit Vergleich.
    liste = await w.tippListe(q.tipps, new Map([['favoriten', { ...original, text: 'Neuer Wortlaut.' }]]), () => undefined, q.tippFehler);
    f = liste.find((x) => x.schluessel === 'favoriten')!;
    assert.equal(f.originalVorher?.text, original.text);
    assert.equal(f.daten.text, 'Bei uns heißen Favoriten „Merkliste“.');
    // Konfliktschutz und zurücksetzen.
    await assert.rejects(
      w.speichereTipp('favoriten', { daten: original, stand: 'veraltet' }, null, { ...k, original }),
      (x: unknown) => x instanceof Fachfehler && x.status === 409,
    );
    await w.loescheTipp('favoriten');
    assert.equal((await ent.stand(lena)).tipps.find((x) => x.schluessel === 'favoriten')?.text, original.text);
    // Ausschalten gilt für alle.
    await w.schalte('tipp', 'favoriten', false);
    assert.ok(!(await ent.stand(lena)).tipps.some((x) => x.schluessel === 'favoriten'));
  });
});
