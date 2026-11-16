/**
 * Charakterisierung von `liesPaket` (#1278, Schritt 6a-2): Vor dem Zerlegen der langen Funktion hält dieser Test fest,
 * was sie zu einem vollständigen Paket liest und welche Gründe sie für viele kaputte Varianten nennt – Wortlaut und
 * Reihenfolge der Gründe, die Meldung und das gelesene Paket (Dateien als Größe).
 *
 * Erwartung: `test/charakter/lies-paket.json`. Neu schreiben nur, wenn sich das Verhalten bewusst ändert:
 * `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/pakete-lesen-charakter.test.ts` – dann den Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Fachfehler } from '../src/grundlagen/fehler';
import { liesPaket } from '../src/pakete/verwaltung/index';

const DATEI = fileURLToPath(new URL('./charakter/lies-paket.json', import.meta.url));
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01]);
const PDF = Buffer.from('%PDF-1.4\n% Beispiel\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const MANIFEST = `schema: 1
id: probe
name: " Probe "
version: 1.0.0
beschreibung: Probepaket für die Charakterisierung.
autor: { name: Test, github: test }
lizenz: MIT
dms: ">=0.231.0"
herausgeber: org.example
abhaengigkeiten:
  basis: ">=1.0.0"
kurzanleitung: { de: [Erst eine Akte anlegen.] }
inhalt:
  mappentypen: ./inhalt/mappentypen.yaml
  sichten: inhalt/sichten.yaml
  beispiele: inhalt/beispiele.yaml
  vorgaben: inhalt/vorgaben.yaml
  automatisierungen: inhalt/automatisierungen.yaml
  ablaufvorlagen: inhalt/ablaufvorlagen.yaml
  wortlisten: inhalt/wortlisten.yaml
  rundgaenge: inhalt/rundgaenge.yaml
  tipps: inhalt/tipps.yaml
umbau:
  - { von: "basis:organisation", nach: akte, felder: { name: name } }
code:
  sprache: c
  quelle: code/
  ereignisse: [mappe.geaendert, zeitplan.ausgefuehrt]
  mappentypen: [akte]
  rechte:
    lesen: [akte, "probe:vorgang"]
    schreiben: [akte]
mappenaktionen:
  - { schluessel: notiz, name: Notiz, mappentypen: [akte, "probe:vorgang"], rechte: [lesen] }
  - { schluessel: neu, name: Neuer Vorgang, mappentypen: [akte], rechte: [mappen_anlegen], anlegen: [vorgang] }
  - { schluessel: vorlage, name: Vorlage, mappentypen: ["basis:organisation"], rechte: [dokument_hinzufuegen], dialog: dms:vorlage }
`;

const TYPEN = `- schluessel: art
  name: Aktenart
  titelVorlage: "{name}"
  felder:
    - { key: name, label: Name, typ: text, pflicht: true }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name] }
- schluessel: akte
  name: " Akte "
  beschreibung: Eine Akte
  titelVorlage: "{name}"
  beschriftungen: { en: { name: File } }
  ausPost: true
  erkennbarAn: " Aktenzeichen "
  inSuche: false
  trefferliste: [name, stelle]
  archiv: { jahre: 6, stichtag: ende }
  felder:
    - { key: name, label: Name, typ: text, pflicht: true, beschriftungen: { en: { label: Name } } }
    - { key: altname, label: Alte Stelle, typ: text }
    - { key: stelle, label: Stelle, typ: referenz, ziel: "basis:organisation", aus_text: altname }
    - { key: art, label: Art, typ: referenz, ziel: art }
    - { key: wer, label: Wer, typ: referenz, ziel: "dms:benutzer" }
    - { key: summe, label: Summe, typ: betrag, negativ: true, berechnet: true, berechnetVon: fremd }
    - { key: eigen, label: Eigene, typ: janein, merkmal: eigeneOrganisation, schreibschutz: verwaltung }
    - { key: ende, label: Ende, typ: datum }
    - { key: posten, label: Posten, typ: tabelle, quelle: { typ: vorgang, feld: akte } }
    - { key: fremd, label: Fremd, typ: tabelle, quelle: { typ: "basis:organisation", feld: x } }
    - { key: kosten, label: Kosten, typ: betrag }
  register:
    - key: daten
      name: Daten
      art: felder
      felder: [name, altname, stelle, art, wer, summe, eigen, ende, posten, fremd, kosten]
      abschnitte: [{ vor: kosten, titel: Kosten, anzeigen: { bedingungen: [{ art: vorgabe, feld: art, vorgabe: [privat] }] } }]
    - { key: dok, name: Dokumente, art: dokumente }
- schluessel: vorgang
  name: Vorgang
  titelVorlage: "{titel}"
  gehoertZu: akte
  felder:
    - { key: titel, label: Titel, typ: text, pflicht: true }
    - { key: akte, label: Akte, typ: referenz, ziel: akte, pflicht: true, verweisart: zugehoerigkeit }
  register:
    - { key: daten, name: Daten, art: felder, felder: [titel, akte] }
`;

const SICHTEN = `- { schluessel: akten, name: " Akten ", beschreibung: Alle Akten, typen: [akte], symbol: folder, trefferliste: standard, beschriftungen: { en: { name: Files } } }
- schluessel: offene
  name: Offene
  eltern: akten
  symbol: gibtsnicht
  typen: [vorgang]
  bedingungen: [{ feld: titel, operator: leer }]
- schluessel: fremd
  name: Fremde
  fremde_typen: [{ kennung: "anderes:typ", name: " Anderer Typ " }, { kennung: "basis:organisation" }]
`;

const BEISPIELE = `- typ: art
  schluessel: a0
  werte: { name: Beruflich }
- typ: akte
  schluessel: a1
  werte: { name: Musterakte, art: { vorgabe: privat }, stelle: { beispiel: "basis:stadtwerke" } }
  dokumente:
    - { datei: beispiele/brief.pdf, titel: Brief, register: dok }
- typ: vorgang
  schluessel: v1
  werte: { titel: Erster, akte: { beispiel: a1 } }
- typ: "basis:organisation"
  werte: kein-objekt
`;

const VORGABEN = `- kennung: privat
  typ: art
  werte: { name: Privat }
`;

const AUTOMATISIERUNGEN = `- schluessel: erinnern
  name: " Erinnern "
  beschreibung: Erinnert an das Ende.
  wenn: { art: datum, typ: akte, feld: ende, vorlauf: 30, einheit: tage, uhrzeit: "07:00" }
  dann:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: ersteller }], text: "Ende {datum}" }
- schluessel: taeglich
  name: Täglich
  eingeschaltet: true
  wenn: { art: zeitplan, uhrzeit: "05:00", tage: [1, 2, 3, 4, 5, 6, 7] }
  dann:
    - { art: paket, aufgabe: taeglich }
`;

const ABLAUFVORLAGEN = `- schluessel: wiedervorlage
  name: Wiedervorlage
  typen: [akte, "basis:organisation"]
  wann: { art: in, anzahl: 6, einheit: monate }
  fragen: []
  karten:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: selbst }], text: "Wiedervorlage: {titel}" }
- schluessel: erinnern_neu
  name: Erinnern
  ersetzt: erinnern
  wann: { art: in, anzahl: 1, einheit: wochen }
  fragen: []
  karten:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: selbst }], text: "Erinnerung" }
`;

const RUNDGAENGE = `- schluessel: kennenlernen
  titel: Akten im Überblick
  beschreibung: Wo das Ende einer Akte steht.
  start: nach_installation
  oeffne:
    mappe: { typ: akte }
  ersatz: Sobald du eine Akte angelegt hast, zeigt dir Ablago hier, wie es geht.
  schritte:
    - schluessel: ende
      ziel: mappe.feld:ende
      ort: Rechts in der Mappe
      titel: Ende
      text: Hier steht das Ende.
    - schluessel: dokumente
      ziel: mappe.register:dok
      ort: Register oben in der Mappe
      titel: Dokumente
      text: Hier liegen die Briefe.
`;

const TIPPS = `- schluessel: ende
  text: Wusstest du schon? Ablago erinnert dich an jedes Ende.
  typ: akte
  rundgang: kennenlernen
`;

type Dateien = Record<string, string | Buffer>;
const VOLL: Dateien = {
  'manifest.yaml': MANIFEST,
  'README.md': '# Probe\n',
  LICENSE: 'MIT\n',
  'inhalt/mappentypen.yaml': TYPEN,
  'inhalt/sichten.yaml': SICHTEN,
  'inhalt/beispiele.yaml': BEISPIELE,
  'inhalt/beispiele/brief.pdf': PDF,
  'inhalt/vorgaben.yaml': VORGABEN,
  'inhalt/automatisierungen.yaml': AUTOMATISIERUNGEN,
  'inhalt/ablaufvorlagen.yaml': ABLAUFVORLAGEN,
  'inhalt/wortlisten.yaml': '- woerter: [Akte, Ordner]\n',
  'inhalt/rundgaenge.yaml': RUNDGAENGE,
  'inhalt/tipps.yaml': TIPPS,
  'code/modul.wasm': WASM,
  'code/daten/liste.json': '[]',
  'code/quelle/main.c': 'int main() { return 0; }\n',
};

/** Ersetzt in einer Datei (muss vorkommen); `null` als Datei-Inhalt entfernt die Datei. */
function mit(basis: Dateien, aenderungen: Array<[string, string, string] | [string, string | Buffer | null]>): Dateien {
  const d = { ...basis };
  for (const a of aenderungen) {
    if (a.length === 3) {
      const [datei, alt, neu] = a;
      const text = String(d[datei]);
      assert.ok(text.includes(alt), `${datei}: „${alt}“ fehlt`);
      d[datei] = text.replace(alt, neu);
    } else if (a[1] === null) delete d[a[0]];
    else d[a[0]] = a[1];
  }
  return d;
}
const M = (alt: string, neu: string): [string, string, string] => ['manifest.yaml', alt, neu];
const T = (alt: string, neu: string): [string, string, string] => ['inhalt/mappentypen.yaml', alt, neu];

/** Paket mit nur Manifest und Mappentypen (für Fälle, die den Rest nicht brauchen). */
const KLEIN_MANIFEST = `schema: 1
id: klein
name: Klein
version: 1.0.0
beschreibung: Klein.
autor: { name: Test, github: test }
lizenz: MIT
dms: ">=0.231.0"
inhalt:
  mappentypen: inhalt/mappentypen.yaml
`;
const klein = (typen: string, mehr: Dateien = {}, manifestZusatz = ''): Dateien => ({
  'manifest.yaml': KLEIN_MANIFEST + manifestZusatz,
  'inhalt/mappentypen.yaml': typen,
  ...mehr,
});
const kleinerTyp = (felder: string, extra = '') => `- schluessel: ding
  name: Ding
${extra}  felder:
${felder}
  register:
    - { key: daten, name: Daten, art: felder, felder: [a, b] }
`;

const FAELLE: Record<string, Dateien> = {
  voll: VOLL,
  // Ein Ordner davor (selbst gepacktes ZIP); Dateien außerhalb fallen weg.
  ordnerDavor: Object.fromEntries([...Object.entries(VOLL).map(([n, d]) => [`probe-1.0.0/${n}`, d]), ['anderswo/manifest.txt', 'x']]),
  ordnerOhneManifest: { 'probe/README.md': '# x\n' },
  ohneManifest: { 'README.md': '# x\n' },
  manifestLeer: { 'manifest.yaml': '' },
  manifestKaputt: { 'manifest.yaml': 'schema: [1\n' },
  manifestListe: { 'manifest.yaml': '- 1\n- 2\n' },
  manifestFalsch: {
    'manifest.yaml': `schema: 2
id: Falsch Id
version: x
name: "  "
dms: irgendwas
abhaengigkeiten: { "Böse": ">=1", gut: [1] }
herausgeber: nicht gut
ersetzt: [Falsch]
ergaenzt: 5
inhalt: { mappentypen: inhalt/fehlt.yaml, sichten: inhalt/kaputt.yaml, beispiele: inhalt/objekt.yaml, vorgaben: inhalt/leer.yaml }
`,
    'inhalt/kaputt.yaml': 'a: [\n',
    'inhalt/objekt.yaml': 'a: 1\n',
    'inhalt/leer.yaml': '',
  },
  idDms: {
    'manifest.yaml': KLEIN_MANIFEST.replace('id: klein', 'id: dms').replace('inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n', ''),
  },
  punktOhneErgaenzt: {
    'manifest.yaml': KLEIN_MANIFEST.replace('id: klein', 'id: basis.extra').replace(
      'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n',
      'abhaengigkeiten: { basis: ">=1.0.0" }\n',
    ),
  },
  punktMitErgaenzt: {
    'manifest.yaml': KLEIN_MANIFEST.replace('id: klein', 'id: basis.extra').replace(
      'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n',
      'abhaengigkeiten: { basis: ">=1.0.0" }\nergaenzt: basis\nersetzt: [alt_extra]\nherausgeber: org.example\n',
    ),
  },
  ergaenztOhneAbhaengigkeit: {
    'manifest.yaml': KLEIN_MANIFEST.replace('inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n', 'ergaenzt: basis\n'),
  },
  sprachpaket: {
    'manifest.yaml': `schema: 1
id: sprache_fr
name: Français
version: 1.0.0
beschreibung: Texte.
autor: { name: Test, github: test }
lizenz: CC0-1.0
dms: ">=0.203.0"
sprache: { kennung: fr, gebietsschema: fr-FR, ablago: 0.203.0, maschinell: true }
`,
    'README.md': '# Français\n',
    'texte/meldungen.json': JSON.stringify({ 'sprachen.unbekannt': 'Cette langue n’existe pas dans Ablago.' }),
    'beschriftungen/basis.yaml': 'mappentypen:\n  organisation:\n    name: Organisme\n',
  },
  sprachpaketFalsch: {
    'manifest.yaml': `schema: 1
id: sprache_fr
name: Français
version: 1.0.0
beschreibung: Texte.
autor: { name: Test, github: test }
lizenz: CC0-1.0
dms: ">=0.203.0"
sprache: { kennung: fr }
code: { sprache: c }
inhalt: { mappentypen: inhalt/mappentypen.yaml }
`,
    'inhalt/mappentypen.yaml': '[]',
  },
  typenFalsch: mit(VOLL, [
    T('- schluessel: art\n  name: Aktenart', '- schluessel: Art\n  name: " "\n  beschriftungen: [1]'),
    T(
      '{ key: name, label: Name, typ: text, pflicht: true }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [name] }\n- schluessel: akte',
      '{ key: Name, label: Name, typ: gibtsnicht, negativ: true, beschriftungen: 5 }\n  register: []\n- schluessel: akte',
    ),
    T(
      '{ key: summe, label: Summe, typ: betrag, negativ: true, berechnet: true, berechnetVon: fremd }',
      '{ key: summe, label: Summe, typ: betrag, negativ: ja, berechnet: ja }',
    ),
    T(
      '{ key: ende, label: Ende, typ: datum }',
      '{ key: ende, label: Ende, typ: datum, berechnet: true, pflicht: true }\n    - { key: pw, label: Kennwort, typ: passwort, berechnet: true, schreibschutz: verwaltung }\n    - { key: zwei, label: Zwei, typ: janein, merkmal: eigeneOrganisation }\n    - { key: drei, label: Drei, typ: text, merkmal: gibtsnicht, schreibschutz: alle }',
    ),
    T('archiv: { jahre: 6, stichtag: ende }', 'archiv: { jahre: -1, stichtag: gibtsnicht }'),
  ]),
  ausText: klein(
    kleinerTyp(`    - { key: a, label: A, typ: text }
    - { key: b, label: B, typ: datum }
    - { key: c, label: C, typ: text, aus_text: a }
    - { key: d, label: D, typ: referenz, ziel: ding, aus_text: "Kein Feld" }
    - { key: e, label: E, typ: referenz, ziel: ding, aus_text: e }
    - { key: f, label: F, typ: referenz, ziel: ding, aus_text: b }
    - { key: g, label: G, typ: referenz, ziel: ding, aus_text: a, pflicht: true }
    - { key: h, label: H, typ: referenz, ziel: [ding, ding2], aus_text: a }
    - { key: i, label: I, typ: referenz, ziel: ding, zielOptional: [ding], aus_text: a }
    - { key: j, label: J, typ: referenz, ziel: ding, aus_text: gibtsnicht }`),
  ),
  gehoertZuFalsch: klein(
    kleinerTyp(
      '    - { key: a, label: A, typ: text }\n    - { key: b, label: B, typ: text }',
      '  gehoertZu: gibtsnicht\n  ausPost: ja\n  erkennbarAn: "  "\n  inSuche: 1\n',
    ),
  ),
  gehoertZuNull: klein(
    kleinerTyp('    - { key: a, label: A, typ: text }\n    - { key: b, label: B, typ: text }', '  gehoertZu: null\n  felder2: 1\n'),
  ),
  felderKeineListe: klein('- schluessel: ding\n  name: Ding\n  felder: 5\n  register: 5\n'),
  sichtenFalsch: mit(VOLL, [
    ['inhalt/sichten.yaml', 'name: Fremde\n', 'name: Fremde\n  bedingungen: { feld: x }\n'],
    ['inhalt/sichten.yaml', '{ kennung: "basis:organisation" }', 'kein-objekt, { kennung: "Böse Kennung" }'],
    ['inhalt/sichten.yaml', '- { schluessel: akten, name: " Akten "', '- { schluessel: Akten, name: " "'],
    ['inhalt/sichten.yaml', 'eltern: akten', 'eltern: akten\n  fremde_typen: keine-liste'],
    ['inhalt/sichten.yaml', 'operator: leer }]', 'operator: leer }, kein-objekt]'],
  ]),
  sichtenDoppelt: mit(VOLL, [
    ['inhalt/sichten.yaml', 'schluessel: offene', 'schluessel: akten'],
    T('- schluessel: vorgang', '- schluessel: akte'),
  ]),
  beispieleFalsch: mit(VOLL, [
    ['inhalt/beispiele.yaml', 'schluessel: a0', 'schluessel: A0'],
    ['inhalt/beispiele.yaml', 'schluessel: v1', 'schluessel: a1'],
    [
      'inhalt/beispiele.yaml',
      '{ beispiel: a1 }',
      '{ beispiel: gibtsnicht }, art: { beispiel: "Böse Kennung" }, x: { beispiel: "fremd:y" }, y: { beispiel: "dms:z" }',
    ],
    ['inhalt/beispiele.yaml', 'register: dok }', 'register: daten }\n    - { datei: beispiele/brief.pdf, titel: Zwei }'],
    ['inhalt/beispiele.yaml', 'werte: kein-objekt', 'werte: kein-objekt\n  dokumente:\n    - { datei: beispiele/brief.pdf }'],
  ]),
  beispieleDokumenteOhneRegister: mit(VOLL, [
    T('    - { key: dok, name: Dokumente, art: dokumente }\n', ''),
    ['inhalt/beispiele.yaml', 'register: dok }', 'register: dok }\n    - { datei: beispiele/brief.pdf, titel: Zwei }'],
  ]),
  beispieleKreis: mit(VOLL, [
    ['inhalt/beispiele.yaml', 'werte: { name: Beruflich }', 'werte: { name: Beruflich, x: { beispiel: v1 } }'],
    T(
      '    - { key: name, label: Name, typ: text, pflicht: true }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [name] }\n- schluessel: akte',
      '    - { key: name, label: Name, typ: text, pflicht: true }\n    - { key: x, label: X, typ: referenz, ziel: vorgang }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [name, x] }\n- schluessel: akte',
    ),
    [
      'inhalt/beispiele.yaml',
      'werte: { titel: Erster, akte: { beispiel: a1 } }',
      'werte: { titel: Erster, akte: { beispiel: a1 } }\n- typ: akte\n  schluessel: a2\n  werte: { name: Zwei, art: { beispiel: a0 } }',
    ],
  ]),
  beispieleZyklus: klein(
    '- schluessel: ding\n  name: Ding\n  felder:\n    - { key: a, label: A, typ: referenz, ziel: ding }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [a] }\n',
    {
      'inhalt/beispiele.yaml':
        '- { typ: ding, schluessel: x, werte: { a: { beispiel: y } } }\n- { typ: ding, schluessel: y, werte: { a: { beispiel: x } } }\n',
    },
    '  beispiele: inhalt/beispiele.yaml\n',
  ),
  vorgabenFalsch: mit(VOLL, [
    T('vorgabe: [privat]', 'vorgabe: [gibtsnicht]'),
    T(
      'anzeigen: { bedingungen: [{ art: vorgabe, feld: art',
      'anzeigen: { bedingungen: [{ art: vorgabe, feld: name, vorgabe: [] }, { art: vorgabe, feld: art',
    ),
    ['inhalt/beispiele.yaml', 'art: { vorgabe: privat }', 'art: { vorgabe: weg }'],
  ]),
  automatisierungenFalsch: mit(VOLL, [
    [
      'inhalt/automatisierungen.yaml',
      AUTOMATISIERUNGEN +
        `- schluessel: Falsch
  name: " "
  wenn: { art: mappe_angelegt, typ: "Böse Typ", rolle: chef }
  dann: []
- schluessel: erinnern
  name: Doppelt
  wenn: kein-objekt
  dann:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: person, id: x }, { art: rolle, id: y }, kein-objekt], text: x }
    - kein-objekt
  und: { modus: vielleicht }
- schluessel: ohne_dann
  name: Ohne
  wenn: { art: mappe_angelegt, typ: null }
- schluessel: mit_und
  name: Mit Und
  wenn: { art: mappe_angelegt, typ: akte }
  und: { modus: alle, bedingungen: [] }
  dann:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: ersteller }], text: x }
`,
    ],
  ]),
  zeitplanOhneEreignis: mit(VOLL, [M('ereignisse: [mappe.geaendert, zeitplan.ausgefuehrt]', 'ereignisse: [mappe.geaendert]')]),
  ablaufvorlagenFalsch: mit(VOLL, [
    [
      'inhalt/ablaufvorlagen.yaml',
      ABLAUFVORLAGEN +
        `- schluessel: Falsch
  name: " "
  ersetzt: gibtsnicht
  typen: [gibtsnicht, "fremd:typ", "Böse Typ"]
  karten:
    - { art: email, an: x@example.org }
- schluessel: wiedervorlage
  name: Doppelt
  ersetzt: erinnern
  karten:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: feld, feld: wer }], text: x }
- schluessel: mit_feld
  name: Mit Feld
  typen: [akte]
  ersetzt: null
  karten:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: feld, feld: wer }], text: x }
`,
    ],
  ]),
  wortlistenFalsch: mit(VOLL, [
    ['inhalt/wortlisten.yaml', '- woerter: [Akte, Ordner]\n', '- woerter: Akte\n- woerter: [Akte]\n- {}\n- woerter: []\n'],
  ]),
  wortlistenZuViele: mit(VOLL, [
    ['inhalt/wortlisten.yaml', Array.from({ length: 1001 }, (_, i) => `- woerter: [Wort${i}a, Wort${i}b]`).join('\n') + '\n'],
  ]),
  tabellenFalsch: mit(VOLL, [
    T('quelle: { typ: vorgang, feld: akte }', 'quelle: { typ: "probe:gibtsnicht", feld: akte }'),
    T(
      '{ key: kosten, label: Kosten, typ: betrag }',
      '{ key: kosten, label: Kosten, typ: betrag }\n    - { key: t2, label: T2, typ: tabelle, quelle: { typ: vorgang, feld: titel } }\n    - { key: t3, label: T3, typ: tabelle, quelle: { typ: art, feld: name } }\n    - { key: t4, label: T4, typ: tabelle, quelle: { typ: "Böse Typ", feld: x } }',
    ),
  ]),
  entdeckenFalsch: mit(VOLL, [
    ['inhalt/rundgaenge.yaml', 'ziel: mappe.feld:ende', 'ziel: mappe.feld:gibtsnicht'],
    ['inhalt/tipps.yaml', 'rundgang: kennenlernen', 'rundgang: gibtsnicht'],
  ]),
  entdeckenLeer: mit(VOLL, [
    ['inhalt/rundgaenge.yaml', '[]\n'],
    ['inhalt/tipps.yaml', '[]\n'],
  ]),
  tippsOhneRundgaenge: mit(VOLL, [M('  rundgaenge: inhalt/rundgaenge.yaml\n', '')]),
  dmsVerweisUnbekannt: mit(VOLL, [
    T('ziel: "dms:benutzer"', 'ziel: "dms:gibtsnicht"'),
    ['inhalt/sichten.yaml', 'typen: [vorgang]', 'typen: [vorgang, "dms:auch_nicht"]'],
  ]),
  codeFalsch: mit(VOLL, [
    M(
      '  mappentypen: [akte]\n  rechte:',
      '  mappentypen: [akte, gibtsnicht, "*", "basis:organisation"]\n  einstellungen: [{ schluessel: Falsch, typ: gibtsnicht }]\n  reiter: 5\n  netz: keine-liste\n  rechte:',
    ),
    M('    schreiben: [akte]\n', '    schreiben: [vorgang]\n'),
    M(
      '{ schluessel: notiz, name: Notiz, mappentypen: [akte, "probe:vorgang"], rechte: [lesen] }',
      '{ schluessel: notiz, name: Notiz, mappentypen: [akte, "probe:vorgang", gibtsnicht, "fremd:typ", art], rechte: [lesen] }\n  - { schluessel: Falsch }',
    ),
    ['code/modul.wasm', Buffer.from('kein wasm')],
  ]),
  codeLesenStern: mit(VOLL, [M('lesen: [akte, "probe:vorgang"]', 'lesen: ["*"]'), M('schreiben: [akte]', 'schreiben: ["*"]')]),
  codeLesenMitPaket: mit(VOLL, [
    M('  mappentypen: [akte]\n  rechte:', '  mappentypen: ["probe:akte"]\n  rechte:'),
    M('lesen: [akte, "probe:vorgang"]', 'lesen: ["probe:akte", vorgang]'),
    M('schreiben: [akte]', 'schreiben: ["probe:akte"]'),
  ]),
  codeOhneLesen: mit(VOLL, [
    M('  mappentypen: [akte]\n  rechte:', '  mappentypen: [akte, gibtsnicht]\n  rechte:'),
    M('lesen: [akte, "probe:vorgang"]', 'lesen: [akte, gibtsnicht]'),
    M('schreiben: [akte]', 'schreiben: [vorgang]'),
    M(
      'mappentypen: [akte, "probe:vorgang"], rechte: [lesen] }',
      'mappentypen: [akte, "probe:vorgang", art, "basis:organisation"], rechte: [lesen] }',
    ),
  ]),
  codeKurz: mit(VOLL, [['code/modul.wasm', Buffer.from([0x00, 0x61])]]),
  ohneModul: mit(VOLL, [['code/modul.wasm', null]]),
  ohneCode: mit(VOLL, [
    M(/code:[\s\S]*?(?=mappenaktionen:)/.exec(MANIFEST)![0], ''),
    ['inhalt/automatisierungen.yaml', AUTOMATISIERUNGEN.slice(0, AUTOMATISIERUNGEN.indexOf('- schluessel: taeglich'))],
    T(', berechnet: true, berechnetVon: fremd', ''),
  ]),
  ohneCodeMitBerechnet: mit(VOLL, [M(/code:[\s\S]*?(?=mappenaktionen:)/.exec(MANIFEST)![0], '')]),
  einstellungen: mit(VOLL, [
    M(
      '  mappentypen: [akte]\n  rechte:',
      '  mappentypen: [akte]\n  einstellungen:\n    - { schluessel: limit, typ: zahl, name: Limit }\n  rechte:',
    ),
  ]),
  inhaltKeinObjekt: {
    'manifest.yaml': KLEIN_MANIFEST.replace('inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n', 'inhalt: 5\n').replace(
      'autor: { name: Test, github: test }',
      'autor: 5',
    ),
  },
  umbauFalsch: mit(VOLL, [
    M('{ von: "basis:organisation", nach: akte, felder: { name: name } }', '{ von: "basis:organisation", nach: gibtsnicht }'),
  ]),
};

/** Ergebnis als JSON: Puffer als Größe, Maps als Einträge; Fehler mit Meldung, Status und Gründen. */
function ergebnis(d: Dateien): unknown {
  const roh = new Map(Object.entries(d).map(([n, x]) => [n, Buffer.isBuffer(x) ? x : Buffer.from(x)] as const));
  try {
    const p = liesPaket(roh);
    return JSON.parse(
      JSON.stringify(p, function (this: Record<string, unknown>, k: string, v: unknown) {
        const x = this[k];
        if (Buffer.isBuffer(x)) return `puffer:${x.length}`;
        if (x instanceof Map) return [...x];
        return v;
      }),
    );
  } catch (e) {
    if (!(e instanceof Fachfehler)) return { anderer: (e as Error).message };
    return { status: e.status, meldung: e.message, details: e.details };
  }
}

describe('liesPaket: Charakterisierung (#1278)', () => {
  it('liest und lehnt ab wie festgehalten', () => {
    const ist: Record<string, unknown> = {};
    for (const [k, d] of Object.entries(FAELLE)) ist[k] = ergebnis(d);
    if (process.env.CHARAKTER_SCHREIBEN) {
      mkdirSync(dirname(DATEI), { recursive: true });
      writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
    }
    assert.ok(existsSync(DATEI), 'Erwartung fehlt');
    const soll = JSON.parse(readFileSync(DATEI, 'utf8')) as Record<string, unknown>;
    for (const k of Object.keys(soll)) assert.deepEqual(ist[k], soll[k], k);
    assert.deepEqual(Object.keys(ist), Object.keys(soll));
  });
});
