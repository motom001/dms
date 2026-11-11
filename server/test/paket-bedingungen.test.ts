/**
 * Bedingungen in Paketen (#1108): Falsch Geschriebenes ist beim Lesen und Installieren ein Fehler mit Stelle und Grund,
 * statt still wegzufallen – Anzeige-Bedingungen, Ansichten und Automatisierungen. Eingaben der Werkbank bleiben wie bisher.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anzeigeEingabeFehler, bereinigeAnzeige } from '../../shared/src/anzeige';
import { undEingabeFehler } from '../../shared/src/automatisierung';
import { bedingungEingabeFehler } from '../../shared/src/sichten';
import { Fachfehler } from '../src/fehler';
import { liesPaket } from '../src/pakete';

const MANIFEST = 'schema: 1\nid: vertraege_test\nname: Verträge\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Markus, github: markus }\nlizenz: MIT\ndms: ">=0.228.0"\n'
  + 'inhalt: { mappentypen: mappentypen.yaml, sichten: sichten.yaml, automatisierungen: automatisierungen.yaml }\n';

/** Vertrag wie im Entwurf des Pakets Verträge (dms-registry #171); `bedingung` je Fall eingesetzt. */
const typen = (bedingung: string, abschnitt = '{ art: merkmal, merkmal: beruflich }') => `- schluessel: vertrag
  name: Vertrag
  felder:
    - { key: name, label: Name, typ: text, pflicht: true }
    - { key: verlaengerung, label: Verlängerung, typ: auswahl, optionen: [verlängert sich um, endet] }
    - { key: verlaengerung_um, label: Verlängert sich um, typ: zeitraum, anzeigen: { bedingungen: [${bedingung}] } }
    - { key: notiz, label: Notiz, typ: langtext }
  register:
    - { key: vertrag, name: Vertrag, art: felder, felder: [name, verlaengerung, verlaengerung_um, notiz], abschnitte: [{ vor: notiz, titel: Abschluss, anzeigen: { bedingungen: [${abschnitt}] } }] }
`;
const RICHTIG = '{ art: feld, bedingung: { art: feld, feld: verlaengerung, op: einerVon, wert: { art: fest, wert: [verlängert sich um] } } }';
const ENTWURF = '{ art: feld, bedingung: { feld: verlaengerung, op: einerVon, wert: { art: fest, wert: [verlängert sich um] } } }';
/** Schreibweisen aus den offiziellen Paketen (dms-registry main: haushalt, vermietung, haus). */
const SICHTEN = `- schluessel: vertraege
  name: Verträge
  typen: [vertrag]
  bedingungen:
    - { feld: verlaengerung, operator: einerVon, wert: [endet] }
    - { feld: notiz, operator: leer }
    - { feld: name, operator: gleich, wert: Strom }
- schluessel: fristen
  name: Fristen
  typen: [vertrag]
  bedingungen:
    - { feld: _erstellt, operator: zwischen, wert: [{ art: heute }, { art: heute, versatz: 3, einheit: monate }] }
    - { feld: _geaendert, operator: imZeitraum, wert: { art: jahr, versatz: -1 } }
`;
const AUTOMATISIERUNGEN = `- schluessel: erinnern
  name: Erinnern
  wenn: { art: mappe.angelegt, typ: vertrag }
  und: { modus: alle, karten: [{ art: bedingung, bedingung: { art: feld, feld: verlaengerung, op: leer } }] }
  dann:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: ersteller }], text: "Bitte Verlängerung eintragen: {titel}" }
`;

const paket = (t: { typen?: string; sichten?: string; automatisierungen?: string } = {}) => new Map([
  ['manifest.yaml', Buffer.from(MANIFEST)],
  ['mappentypen.yaml', Buffer.from(t.typen ?? typen(RICHTIG))],
  ['sichten.yaml', Buffer.from(t.sichten ?? SICHTEN)],
  ['automatisierungen.yaml', Buffer.from(t.automatisierungen ?? AUTOMATISIERUNGEN)],
]);

/** Gründe der Ablehnung; [] = das Paket ließ sich lesen. */
function gruende(dateien: Map<string, Buffer>): string[] {
  try { liesPaket(dateien); return []; } catch (e) {
    assert.ok(e instanceof Fachfehler, String(e));
    return ((e as Fachfehler).details as { gruende: string[] }).gruende;
  }
}

describe('Bedingungen in Paketen (#1108)', () => {
  it('richtig geschriebene Bedingungen (auch die der offiziellen Pakete) lesen sich ohne Fehler', () => {
    assert.deepEqual(gruende(paket()), []);
    const p = liesPaket(paket());
    assert.equal(p.sichten[0].bedingungen?.length, 3);
    assert.ok(p.typen[0].felder.find((f) => f.key === 'verlaengerung_um')?.anzeigen);
  });

  it('Schreibweise aus dem Entwurf Verträge ({ feld, op } ohne art): Fehler mit Typ, Feld und Grund statt still weg', () => {
    // Bisher: bereinigeAnzeige lässt sie weg – das Feld wäre immer zu sehen.
    assert.equal(bereinigeAnzeige({ bedingungen: [{ art: 'feld', bedingung: { feld: 'verlaengerung', op: 'einerVon' } }] }), undefined);
    const g = gruende(paket({ typen: typen(ENTWURF) }));
    assert.equal(g.length, 1, g.join(' | '));
    assert.match(g[0], /mappentypen\[1\] „vertrag“/);
    assert.match(g[0], /„verlaengerung_um“/);
    assert.match(g[0], /Bedingung 1: In bedingung fehlt art: feld\./);
  });

  it('Anzeige-Bedingungen: unbekannte Art, Merkmal, Operator, Wert und modus – an Feldern und Abschnitten', () => {
    const faelle: Array<[string, string, RegExp]> = [
      [RICHTIG, '{ art: merkml, merkmal: beruflich }', /„vertrag\.notiz“: anzeigen, Bedingung 1: unbekannte art „merkml“/],
      [RICHTIG, '{ art: merkmal, merkmal: geschaeftlich }', /„vertrag\.notiz“: anzeigen, Bedingung 1: .*geschaeftlich/],
      [RICHTIG, '{ merkmal: beruflich }', /„vertrag\.notiz“: anzeigen, Bedingung 1: art fehlt/],
      ['{ art: feld, bedingung: { art: feld, feld: verlaengerung, op: istEiner } }', '{ art: merkmal, merkmal: beruflich }', /„verlaengerung_um“: anzeigen, Bedingung 1: bedingung: unbekannter Operator „istEiner“/],
      ['{ art: feld, bedingung: { art: feld, feld: verlaengerung, op: gleich, wert: endet } }', '{ art: merkmal, merkmal: beruflich }', /„verlaengerung_um“: anzeigen, Bedingung 1: bedingung: wert ist kein gültiger Wert/],
      ['{ art: feld, bedingung: { art: merkmal, merkmal: beruflich } }', '{ art: merkmal, merkmal: beruflich }', /In bedingung steht art: merkmal/],
      ['{ art: verweistyp, feld: verlaengerung }', '{ art: merkmal, merkmal: beruflich }', /Bedingung 1: typ fehlt/],
      ['{ art: eigeneOrganisation }', '{ art: merkmal, merkmal: beruflich }', /Bedingung 1: feld fehlt/],
      ['"nur so"', '{ art: merkmal, merkmal: beruflich }', /Bedingung 1: Die Bedingung ist kein Objekt/],
    ];
    for (const [feld, abschnitt, erwartet] of faelle) {
      const g = gruende(paket({ typen: typen(feld, abschnitt) }));
      assert.equal(g.length, 1, `${feld} / ${abschnitt}: ${g.join(' | ')}`);
      assert.match(g[0], erwartet);
    }
    assert.match(gruende(paket({ typen: typen(RICHTIG).replace('anzeigen: { bedingungen:', 'anzeigen: { modus: jede, bedingungen:') }))[0], /modus „jede“/);
    assert.match(gruende(paket({ typen: typen(RICHTIG).replace(/anzeigen: \{ bedingungen: \[\{ art: feld.*\] \} \}/, 'anzeigen: ja }') }))[0], /anzeigen muss ein Objekt mit modus und bedingungen/);
    // Zu viele: nicht still gekürzt.
    assert.match(gruende(paket({ typen: typen(Array(11).fill(RICHTIG).join(', ')) })).join(' '), /höchstens 10 Bedingungen/);
    // „zeigt auf die Vorgabe“ (#1038) prüft das Paket selbst (Feld, Kennung) – hier kein zweiter Fehler.
    assert.deepEqual(anzeigeEingabeFehler({ bedingungen: [{ art: 'vorgabe', feld: 'art', vorgabe: ['miete'] }] }, ['vorgabe']), []);
  });

  it('Ansichten: op statt operator, unbekannter Operator, ungültiger Wert – mit Ansicht und Stelle', () => {
    const mit = (b: string) => gruende(paket({ sichten: `- { schluessel: offen, name: Offen, typen: [vertrag], bedingungen: [{ feld: name, operator: leer }, ${b}] }\n` }));
    assert.deepEqual(mit('{ feld: notiz, operator: nichtLeer }'), []);
    assert.match(mit('{ feld: notiz, op: leer }')[0], /^sichten\[1\] „offen“, bedingungen\[2\]: Bei Ansichten heißt es operator, nicht op\.$/);
    assert.match(mit('{ feld: notiz, operator: istLeer }')[0], /bedingungen\[2\]: unbekannter Operator „istLeer“/);
    assert.match(mit('{ feld: notiz, operator: kleiner, wert: { art: morgen } }')[0], /bedingungen\[2\]: wert ist kein gültiger Wert/);
    assert.match(mit('{ operator: leer }')[0], /bedingungen\[2\]: feld fehlt/);
    assert.match(mit('leer')[0], /bedingungen\[2\]: Die Bedingung ist kein Objekt/);
    assert.match(gruende(paket({ sichten: '- { schluessel: offen, name: Offen, bedingungen: { feld: name, operator: leer } }\n' }))[0], /sichten\[1\] „offen“: bedingungen muss eine Liste sein/);
  });

  it('Automatisierungen: Und-Karten mit falsch geschriebener Bedingung sind ein Fehler', () => {
    const mit = (und: string) => gruende(paket({ automatisierungen: AUTOMATISIERUNGEN.replace(/ {2}und: .*\n/, `  und: ${und}\n`) }));
    assert.match(mit('{ karten: [{ art: bedingung, bedingung: { feld: verlaengerung, op: leer } }] }')[0], /^automatisierungen\[1\] „erinnern“: und\.karten\[1\]: bedingung: art fehlt/);
    assert.match(mit('{ karten: [{ art: bedingug }] }')[0], /und\.karten\[1\]: unbekannte art „bedingug“/);
    assert.match(mit('{ karten: [{ art: gruppe, karten: [{ art: bedingung, bedingung: { art: feld, feld: notiz, op: gross } }] }] }')[0], /und\.karten\[1\]\.karten\[1\]: bedingung: unbekannter Operator „gross“/);
    assert.match(mit('[{ art: bedingung }]')[0], /und muss ein Objekt mit modus und karten/);
    assert.deepEqual(mit('{ modus: eine, karten: [{ art: bedingung, nicht: true, bedingung: { art: merkmal, merkmal: beruflich } }] }'), []);
    assert.deepEqual(undEingabeFehler(undefined), []);
  });

  it('Werkbank bleibt wie bisher: bereinigen ohne Fehler; die Prüfung kennt alle Arten, die der Editor erzeugt', () => {
    assert.deepEqual(bereinigeAnzeige({ modus: 'eine', bedingungen: [{ art: 'merkmal', merkmal: 'beruflich' }, { art: 'kaputt' }] }), { modus: 'eine', bedingungen: [{ art: 'merkmal', merkmal: 'beruflich' }] });
    for (const b of [
      { art: 'feld', feld: 'datum', op: 'zwischen', wert: { art: 'heute' }, bis: { art: 'heute', versatz: 30, einheit: 'tage' } },
      { art: 'feld', feld: 'an', op: 'gleich', wert: { art: 'ich' } },
      { art: 'dokumente', register: 'dokumente', vergleich: 'mehr', anzahl: 0 },
      { art: 'verknuepfungenGesamt', vergleich: 'gleich', anzahl: 2 },
      { art: 'favorit' }, { art: 'frist', feld: null, tage: 14 }, { art: 'merkmal', merkmal: 'beruflich', nicht: true },
    ]) assert.equal(bedingungEingabeFehler(b), null, JSON.stringify(b));
    assert.match(bedingungEingabeFehler({ art: 'feld', feld: 'x', op: 'leer', bis: { art: 'heute' } })!, /bis gibt es nur bei/);
    assert.match(bedingungEingabeFehler({ art: 'dokumente', vergleich: 'mehr', anzahl: 1 })!, /register fehlt/);
  });
});
