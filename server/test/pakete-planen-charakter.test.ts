/**
 * Charakterisierung von `plane` (#1278, Schritt 6a-2): Vor dem Zerlegen der langen Methode hält dieser Test fest, was
 * die Vorschau eines Pakets sagt – Neuinstallation, Update, Namenskonflikte und Umbenennen, geplante Typen und Ansichten
 * im Ablauf, Sammeldatei, Herausgeber und Umzug, Sprachpaket, Übernahme des Ablageorts und Umbau.
 *
 * Erwartung: `test/charakter/plane.json` (Ids durch Namen ersetzt, ohne Zeiten). Neu schreiben nur, wenn sich das
 * Verhalten bewusst ändert: `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/pakete-planen-charakter.test.ts`.
 * Die Zahl aller deutschen Texte (`abdeckung.gesamt` beim Sprachpaket) steht nicht in der Datei, sondern wird hier aus dem
 * Stand berechnet und geprüft (#1665): Sonst müsste jeder neue Sprachschlüssel die Datei ändern.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEUTSCH } from '../../shared/src/deutsch';
import type { HerkunftPruefung, InstalliertesPaket, Katalog, KatalogVersion } from '../../shared/src/pakete';
import { abdeckung } from '../../shared/src/sprachpaket';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { zipPuffer } from '../src/formate/zip';
import { liesPaket, Paketverwaltung } from '../src/pakete/verwaltung/index';
import { protokoll } from '../src/protokoll/protokoll';
import { speicherRepo } from '../src/repo/speicher';

const DATEI = fileURLToPath(new URL('./charakter/plane.json', import.meta.url));
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const KATALOG_URL = 'https://katalog.test/katalog.json';
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01]);

type Dateien = Record<string, string | Buffer>;
type Vorschau = Awaited<ReturnType<Paketverwaltung['vorschau']>>;
type PlanMehr = {
  geplant?: { typen: Set<string>; sichten: Set<string> };
  quelle?: { herkunft: InstalliertesPaket['herkunft']; pruefung: HerkunftPruefung };
  sammel?: Set<string>;
  ablauf?: boolean;
};
type Planer = {
  plane(
    paket: ReturnType<typeof liesPaket>,
    v?: KatalogVersion,
    katalog?: Katalog,
    namen?: Record<string, string>,
    sichtNamen?: Record<string, string>,
    mehr?: PlanMehr,
  ): Promise<Vorschau>;
};

const manifest = (id: string, name: string, version: string, extra = '') =>
  `schema: 1\nid: ${id}\nname: ${name}\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\n${extra}`;

/* ---------- Pakete ---------- */

const basis = (version = '1.0.0', extra = '') => ({
  'manifest.yaml': manifest(
    'basis',
    'Basis',
    version,
    `${extra}inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n`,
  ),
  'inhalt/mappentypen.yaml': `- schluessel: organisation
  name: Organisation
  titelVorlage: "{name}"
  felder:
    - { key: name, label: Name, typ: text }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [name] }
- schluessel: ablageort
  name: Ablageort
  titelVorlage: "{name}"
  felder:
    - { key: name, label: Name, typ: text }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [name] }
`,
  'inhalt/sichten.yaml':
    '- { schluessel: organisationen, name: Organisationen, typen: [organisation] }\n- { schluessel: orte, name: Ablageorte, typen: [ablageort] }\n- { schluessel: orte_neu, name: Neue Orte, typen: [ablageort], bedingungen: [{ feld: name, operator: leer }] }\n',
});

/** Basis nur mit Organisation (ohne Ablageort): dann zeigt dms:ablageort ins Leere. */
const basisOhneOrt = () => {
  const b = basis();
  return {
    ...b,
    'inhalt/mappentypen.yaml': b['inhalt/mappentypen.yaml'].slice(0, b['inhalt/mappentypen.yaml'].indexOf('- schluessel: ablageort')),
    'inhalt/sichten.yaml': '- { schluessel: organisationen, name: Organisationen, typen: [organisation] }\n',
  };
};

const PROBE_TYPEN = (neu: boolean) => `- schluessel: akte
  name: Akte
  beschreibung: ${neu ? 'Eine Akte (neu)' : 'Eine Akte'}
  titelVorlage: "{name}"
  beschriftungen: { en: { name: ${neu ? 'Record' : 'File'} } }
  archiv: { jahre: 6, jahreBeruflich: 10, stichtag: ende }
  felder:
    - { key: name, label: Name, typ: text, pflicht: true }
    - { key: altname, label: Alte Stelle, typ: text }
    - { key: stelle, label: Stelle, typ: referenz, ziel: "basis:organisation" }
    - { key: wer, label: Wer, typ: referenz, ziel: "dms:benutzer" }
    - { key: rolle, label: Rolle, typ: referenz, ziel: "dms:rolle" }
    - { key: ort, label: Ort, typ: referenz, ziel: "dms:ablageort" }
    - { key: ende, label: Ende, typ: datum }${
      neu
        ? `
    - { key: stellen, label: Stellen, typ: referenz, ziel: "basis:organisation", aus_text: altname }
    - { key: notiz, label: Notiz, typ: langtext }
    - { key: iban, label: IBAN, typ: text, erkennung: { art: iban } }`
        : ''
    }
  register:
    - key: daten
      name: Daten
      art: felder
      felder: [name, altname, stelle, wer, rolle, ort, ende${neu ? ', stellen, notiz, iban' : ''}]${neu ? '\n      abschnitte: [{ vor: notiz, titel: Mehr }]' : ''}
    - { key: dok, name: Dokumente, art: dokumente }${neu ? '\n    - { key: verlauf, name: Verlauf, art: protokoll }' : ''}
- schluessel: vorgang
  name: Vorgang
  titelVorlage: "{titel}"
  felder:
    - { key: titel, label: Titel, typ: text, pflicht: true }
    - { key: akte, label: Akte, typ: referenz, ziel: akte }
  register:
    - { key: daten, name: Daten, art: felder, felder: [titel, akte] }
`;

const PROBE_SICHTEN = (neu: boolean) => `- schluessel: akten
  name: Akten
  typen: [akte]
  symbol: folder
  bedingungen: [{ feld: stelle, operator: zeigtAufTyp, wert: ["basis:organisation", "dms:benutzer", "gibt:esnicht"] }, { feld: name, operator: nichtLeer }]
- { schluessel: offene, name: Offene Vorgänge, eltern: akten, typen: [vorgang] }
- { schluessel: fremd, name: Fremde, fremde_typen: [{ kennung: "anderes:typ", name: Anderer Typ }] }
- { schluessel: fremd_kind, name: Fremde Kinder, eltern: fremd, typen: [akte] }
- { schluessel: teils, name: Teils, typen: [akte], fremde_typen: [{ kennung: "anderes:zwei", name: Zweiter }, { kennung: "basis:organisation", name: Org }] }${
  neu ? '\n- { schluessel: neu, name: Neue Akten, eltern: akten, typen: [akte] }' : ''
}
`;

const probe = (version: '1.0.0' | '1.1.0', o: { extra?: string; code?: boolean } = {}) => {
  const neu = version === '1.1.0';
  const code = o.code !== false;
  return {
    'manifest.yaml': manifest(
      'probe',
      'Probe',
      version,
      `abhaengigkeiten: { basis: ">=1.0.0" }\nkurzanleitung: { de: [Erst eine Akte anlegen.] }\n${o.extra ?? ''}inhalt:
  mappentypen: inhalt/mappentypen.yaml
  sichten: inhalt/sichten.yaml
  beispiele: inhalt/beispiele.yaml
  wortlisten: inhalt/wortlisten.yaml
  automatisierungen: inhalt/automatisierungen.yaml
  ablaufvorlagen: inhalt/ablaufvorlagen.yaml
${
  code
    ? `code:
  sprache: c
  quelle: code/
  ereignisse: [mappe.geaendert]
  mappentypen: [akte]
  einstellungen:
    - { schluessel: limit, typ: zahl, name: ${neu ? 'Grenze' : 'Limit'} }
  rechte:
    lesen: [akte, "basis:organisation"]
    schreiben: [akte]
`
    : ''
}mappenaktionen:
  - { schluessel: vorlage, name: Vorlage, mappentypen: [akte], rechte: [dokument_hinzufuegen], dialog: dms:vorlage }
${
  code
    ? `  - { schluessel: notiz, name: Notiz, mappentypen: [akte, "basis:organisation"], rechte: [${neu ? 'lesen, herausgeben' : 'lesen'}] }
  - { schluessel: neu, name: Neu, mappentypen: [akte], rechte: [mappen_anlegen], anlegen: [${neu ? 'vorgang, akte' : 'vorgang'}] }
${neu ? '  - { schluessel: dazu, name: Dazu, mappentypen: [akte], rechte: [lesen] }\n' : ''}`
    : ''
}`,
    ),
    'inhalt/mappentypen.yaml': PROBE_TYPEN(neu),
    'inhalt/sichten.yaml': PROBE_SICHTEN(neu),
    'inhalt/beispiele.yaml':
      '- { typ: akte, schluessel: a1, werte: { name: Musterakte, stelle: { beispiel: "basis:stadtwerke" } } }\n- { typ: vorgang, werte: { titel: Erster, akte: { beispiel: a1 } } }\n',
    'inhalt/wortlisten.yaml': '- woerter: [Akte, Ordner]\n- woerter: [Vorgang, Fall]\n',
    'inhalt/automatisierungen.yaml': `- schluessel: erinnern
  name: Erinnern
  beschreibung: Erinnert an das Ende.
  eingeschaltet: false
  wenn: { art: datum, typ: akte, feld: ende, vorlauf: 30, einheit: tage, uhrzeit: "07:00" }
  dann:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: ersteller }], text: "Ende {datum}" }
- schluessel: angelegt
  name: Angelegt
  wenn: { art: mappe_angelegt, typ: "basis:organisation" }
  dann:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: ersteller }], text: "Neu" }
`,
    'inhalt/ablaufvorlagen.yaml': `- schluessel: wiedervorlage
  name: Wiedervorlage
  typen: [akte]
  wann: { art: in, anzahl: 6, einheit: monate }
  fragen: []
  karten:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: selbst }], text: "Wiedervorlage: {titel}" }
`,
    ...(code ? { 'code/modul.wasm': WASM } : {}),
  };
};

/** Namen, die es schon gibt: Typ „Organisation“, oberste Ansicht „Organisationen“ – und darunter eine gleichnamige. */
const konflikt = (extra = '') => ({
  'manifest.yaml': manifest(
    'konflikt',
    'Konflikt',
    '1.0.0',
    `${extra}inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n`,
  ),
  'inhalt/mappentypen.yaml': `- schluessel: organisation
  name: Organisation
  felder:
    - { key: name, label: Name, typ: text }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name] }
- schluessel: zweite
  name: "Organisation (Konflikt)"
  felder:
    - { key: name, label: Name, typ: text }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name] }
- schluessel: geplant
  name: Geplant
  felder:
    - { key: name, label: Name, typ: text }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name] }
`,
  'inhalt/sichten.yaml': `- { schluessel: organisationen, name: Organisationen, typen: [organisation] }
- { schluessel: unter, name: Organisationen, eltern: organisationen, typen: [organisation] }
- { schluessel: geplant, name: Geplante Sicht, typen: [geplant] }
- { schluessel: fremd, name: Fremd, fremde_typen: [{ kennung: "sammel:typ", name: Aus der Sammlung }, { kennung: "fehlt:typ", name: Fehlt }] }
`,
});

/** Hängt von „extern“ ab, das es nur im Katalog gibt (dessen Typ „Organisation“ heißt). */
const mitExtern = (extra = '') => ({
  'manifest.yaml': manifest(
    'nutzer',
    'Nutzer',
    '1.0.0',
    `abhaengigkeiten: { extern: ">=1.0.0", basis: ">=2.0.0" }\n${extra}inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`,
  ),
  'inhalt/mappentypen.yaml':
    '- schluessel: ding\n  name: Ding\n  felder:\n    - { key: name, label: Name, typ: text }\n  register:\n    - { key: daten, name: Daten, art: felder, felder: [name] }\n',
});

const extra = (id: string, version = '1.0.0', zusatz = '') => ({
  'manifest.yaml': manifest(id, 'Extra', version, `abhaengigkeiten: { basis: ">=1.0.0" }\n${zusatz}`),
});

const sprache = (id: string, ablago: string, texte: Record<string, string>) => ({
  'manifest.yaml': `schema: 1\nid: ${id}\nname: Français\nversion: 1.0.0\nbeschreibung: Texte.\nautor: { name: Test, github: test }\nlizenz: CC0-1.0\ndms: ">=0.203.0"\nsprache: { kennung: fr, gebietsschema: fr-FR, ablago: ${ablago}, maschinell: true }\n`,
  'texte/meldungen.json': JSON.stringify({ 'sprachen.unbekannt': 'Cette langue n’existe pas dans Ablago.', ...texte }),
  'beschriftungen/basis.yaml': 'mappentypen:\n  organisation:\n    name: Organisme\n',
});

/* Umbau (#1041): wie in paketumbau.test.ts, gekürzt. */
const UMBAU_HAUSHALT = {
  'manifest.yaml': manifest(
    'haushalt',
    'Haushalt',
    '1.0.0',
    'herausgeber: org.example\nabhaengigkeiten:\n  basis: ">=1.0.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n',
  ),
  'inhalt/mappentypen.yaml': `- schluessel: vertrag
  name: Vertrag
  felder:
    - { key: vertragspartner, label: Vertragspartner, typ: referenz, ziel: "basis:organisation" }
    - { key: betrag, label: Betrag, typ: betrag }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [vertragspartner, betrag] }
- schluessel: versicherung
  name: Versicherung
  felder:
    - { key: versicherer, label: Versicherer, typ: referenz, ziel: "basis:organisation" }
    - { key: beitrag, label: Beitrag, typ: betrag }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [versicherer, beitrag] }
`,
};
const UMBAU_VERTRAEGE = {
  'manifest.yaml': manifest(
    'vertraege',
    'Verträge',
    '1.0.0',
    `herausgeber: org.example\nabhaengigkeiten:\n  basis: ">=1.0.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\numbau:
  - { von: "haushalt:vertrag", nach: vertrag, felder: { vertragspartner: von, betrag: betrag } }
  - { von: "haushalt:versicherung", nach: vertrag, felder: { versicherer: von, beitrag: betrag } }
`,
  ),
  'inhalt/mappentypen.yaml': `- schluessel: vertrag
  name: Versicherung
  titelVorlage: "{bezeichnung}"
  felder:
    - { key: bezeichnung, label: Bezeichnung, typ: text }
    - { key: von, label: Anbieter, typ: referenz, ziel: ["basis:organisation"] }
    - { key: betrag, label: Betrag, typ: betrag }
  register:
    - { key: vertrag, name: Vertrag, art: felder, felder: [bezeichnung, von, betrag] }
`,
};

/* ---------- Aufbau ---------- */

const zip = (d: Dateien) =>
  zipPuffer(
    Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );
const lies = (d: Dateien) => liesPaket(new Map(Object.entries(d).map(([n, x]) => [n, Buffer.isBuffer(x) ? x : Buffer.from(x)] as const)));

function dms() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const p = new Paketverwaltung(d, {
    version: () => '0.290.13',
    katalogUrl: KATALOG_URL,
    abruf: async () => {
      throw new Error('ohne Netz');
    },
  });
  return { d, p, planer: p as unknown as Planer };
}
type Ablage = ReturnType<typeof dms>;

async function installiere(x: Ablage, d: Dateien, beispiele = false) {
  const h = await x.p.hochladen(zip(d), ICH);
  return x.p.installiere(
    { upload: h.upload, bestaetigt: true, rechteBestaetigt: true, herausgeberBestaetigt: true, umbauBestaetigt: true, beispiele },
    ICH,
  );
}

/** Ändert den Eintrag eines installierten Pakets (Herausgeber, Herkunft, Schlüssel …). */
async function aendere(x: Ablage, id: string, f: (p: InstalliertesPaket) => InstalliertesPaket) {
  const p = (await x.d.kern.repo.listePakete()).find((y) => y.id === id)!;
  await x.d.kern.repo.speicherePaket(f(structuredClone(p)));
}

/** Alle deutschen Texte (#1665): wächst mit jedem Sprachschlüssel und steht deshalb als „GESAMT“ in der Erwartung. */
const GESAMT = abdeckung(DEUTSCH, {}).gesamt;

/** Vorschau ohne Ids und Zeiten: Typen über ihre Kennung, Ansichten über den Namen, der Rest „ID“. */
async function neutral(x: Ablage, v: Vorschau | string): Promise<unknown> {
  if (typeof v === 'string') return { fehler: v };
  const namen = new Map<string, string>();
  for (const t of await x.d.mappentypen.listeTypen()) namen.set(t.id, `T(${t.schluessel ?? t.name})`);
  for (const s of await x.d.sichtenVerwaltung.listeSichten()) namen.set(s.id, `S(${s.name})`);
  namen.set(ICH.id, 'ICH');
  const erg = JSON.parse(
    JSON.stringify(v)
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (u) => namen.get(u) ?? 'ID')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, 'ZEIT'),
  ) as { sprache?: { abdeckung?: { gesamt: unknown } } | null };
  const a = erg.sprache?.abdeckung;
  if (a) {
    assert.ok(GESAMT > 1000, `nur ${GESAMT} deutsche Texte`);
    assert.equal(a.gesamt, GESAMT, 'abdeckung.gesamt: alle deutschen Texte');
    a.gesamt = 'GESAMT';
  }
  return erg;
}

async function plane(
  x: Ablage,
  d: Dateien,
  ...rest: [KatalogVersion?, Katalog?, Record<string, string>?, Record<string, string>?, PlanMehr?]
) {
  const v = await x.planer.plane(lies(d), ...rest).catch((e: Error) => e.message);
  return neutral(x, v);
}

const pruefung = (p: Partial<HerkunftPruefung>): HerkunftPruefung => ({ art: 'datei', offiziell: false, bestaetigen: false, ...p });
const hochgeladen: InstalliertesPaket['herkunft'] = { art: 'hochgeladen', von: ICH.email, am: '2026-01-01T00:00:00.000Z' };
const ausKatalog: InstalliertesPaket['herkunft'] = { art: 'katalog', url: KATALOG_URL };

const katalogVersion = (version: string, mehr: Partial<KatalogVersion> = {}): KatalogVersion =>
  ({
    version,
    dms: '>=0.1.0',
    abhaengigkeiten: {},
    inhalt: { mappentypen: [], sichten: [], beispiele: 0 },
    code: false,
    archiv: `archive/x-${version}.zip`,
    sha256: 'a'.repeat(64),
    groesse: 1,
    veroeffentlicht: '2026-01-01T00:00:00Z',
    quelle: 'https://example.org/quelle',
    readme: '# Liesmich',
    changelog: '## Änderungen',
    ...mehr,
  }) as KatalogVersion;
const katalog = (pakete: Array<{ id: string; name: string; herausgeber?: string; versionen: KatalogVersion[] }>): Katalog =>
  ({
    format: 1,
    erstellt: '2026-01-01T00:00:00Z',
    quelle: 'test',
    pakete: pakete.map((p) => ({
      beschreibung: '',
      autor: { name: 'Test', github: 'test' },
      lizenz: 'MIT',
      aktuell: p.versionen[0].version,
      ...p,
    })),
  }) as unknown as Katalog;

/* ---------- Szenarien ---------- */

async function lauf() {
  protokoll.setzeGrundstufe('fatal');
  const erg: Record<string, unknown> = {};

  // 1. Leere Ablage: Basis neu; Probe ohne Basis (Abhängigkeit aus dem Katalog); zu neue Ablago-Version, Code ohne Modul.
  {
    const x = dms();
    erg.leerBasis = await plane(x, basis());
    const k = katalog([
      {
        id: 'basis',
        name: 'Basis',
        versionen: [
          katalogVersion('1.0.0', { inhalt: { mappentypen: [{ schluessel: 'akte', name: 'Akte' }], sichten: [], beispiele: 0 } }),
        ],
      },
    ]);
    erg.leerProbe = await plane(x, probe('1.0.0'), katalogVersion('1.0.0'), k);
    const ohneModul = probe('1.0.0');
    delete (ohneModul as Dateien)['code/modul.wasm'];
    erg.leerZuNeu = await plane(x, {
      ...ohneModul,
      'manifest.yaml': ohneModul['manifest.yaml'].replace('dms: ">=0.231.0"', 'dms: ">=9.0.0"'),
    });
    erg.leerAblauf = await plane(x, probe('1.0.0'), undefined, k, {}, {}, { ablauf: true });
  }

  // 2. Mit Basis ohne Ablageort: dms:ablageort zeigt ins Leere, Beispiele auf Basis ohne Beispiele.
  {
    const x = dms();
    await installiere(x, basisOhneOrt());
    erg.ohneOrtProbe = await plane(x, probe('1.0.0'));
  }

  // 3. Mit Basis: schon installiert; Probe neu (beruflich); Konflikte, Umbenennen, geplant, Sammeldatei, Ablauf.
  {
    const x = dms();
    await installiere(x, basis());
    erg.basisSchonDa = await plane(x, basis());
    const beruflich = x.d.kern.merkmale.bind(x.d.kern);
    x.d.kern.merkmale = async () => ({ ...(await beruflich()), beruflich: true });
    erg.probeNeu = await plane(x, probe('1.0.0'));
    x.d.kern.merkmale = beruflich;
    erg.konflikt = await plane(x, konflikt());
    const geplant = { typen: new Set(['geplant']), sichten: new Set(['geplante sicht']) };
    erg.konfliktUmbenannt = await plane(
      x,
      konflikt(),
      undefined,
      undefined,
      { organisation: 'Stelle', zweite: ' Zweite ' },
      { organisationen: 'Stellen', unter: 'Unter' },
      { geplant },
    );
    erg.konfliktGeplant = { typen: [...geplant.typen], sichten: [...geplant.sichten] };
    erg.konfliktSammel = await plane(x, konflikt(), undefined, undefined, {}, {}, { sammel: new Set(['sammel:typ']) });
    const k = katalog([
      {
        id: 'extern',
        name: 'Extern',
        versionen: [
          katalogVersion('1.0.0', {
            inhalt: {
              mappentypen: [
                { schluessel: 'organisation', name: 'Organisation' },
                { schluessel: 'ding', name: 'Ding' },
              ],
              sichten: [],
              beispiele: 0,
            },
          }),
        ],
      },
    ]);
    erg.externKatalog = await plane(x, mitExtern(), undefined, k);
    erg.externAblauf = await plane(x, mitExtern(), undefined, k, {}, {}, { ablauf: true });
    erg.externSammel = await plane(x, mitExtern(), undefined, k, {}, {}, { sammel: new Set() });
  }

  // 4. Update: Probe 1.0.0 installiert (mit Mappen im alten Textfeld), Vorschau auf 1.1.0.
  {
    const x = dms();
    await installiere(x, basis());
    const ip = await installiere(x, probe('1.0.0'), true);
    const typId = ip.typen.akte;
    await x.d.mappen.legeMappeAn({ typId, werte: { name: 'Eins', altname: 'Stadtwerke' } }, ICH.id);
    await x.d.mappen.legeMappeAn({ typId, werte: { name: 'Zwei', altname: '' } }, ICH.id);
    erg.updateSchonDa = await plane(x, probe('1.0.0'));
    x.d.paketAutomatisierungenVergleich = async () => ({ erinnern: { id: 'x', aenderungen: ['Uhrzeit 07:00 → 08:00'] } });
    erg.update = await plane(x, probe('1.1.0'));
    x.d.paketAutomatisierungenVergleich = async () => {
      throw new Error('Probefehler');
    };
    erg.updateVergleichFehlt = await plane(x, probe('1.1.0'));
    x.d.paketAutomatisierungenVergleich = undefined;
    erg.updateOhneCode = await plane(x, probe('1.1.0', { code: false }));
    // Ohne Prüfwert der Ansichten (vor #1125): Vergleich mit der Fassung im Paket.
    await aendere(x, 'probe', (p) => ({ ...p, sichtStand: undefined }));
    erg.updateOhneStand = await plane(x, probe('1.1.0'));
    // Gelöschte Typen und Ansichten; ein Typ, dessen Kennung schon ein anderer hat.
    await aendere(x, 'probe', (p) => ({
      ...p,
      typen: { vorgang: '00000000-0000-4000-8000-00000000dead' },
      sichten: { ...p.sichten, offene: '00000000-0000-4000-8000-00000000beef', fremd: '00000000-0000-4000-8000-00000000f00d' },
    }));
    erg.updateGeloescht = await plane(x, probe('1.1.0'));
  }

  // 5. Herausgeber, Quelle und Schlüssel.
  {
    const x = dms();
    await installiere(x, basis());
    // app.ablago ohne Beleg aus dem offiziellen Katalog.
    erg.offiziellOhneBeleg = await plane(
      x,
      extra('offen', '1.0.0', 'herausgeber: app.ablago\n'),
      undefined,
      undefined,
      {},
      {},
      {
        quelle: { herkunft: hochgeladen, pruefung: pruefung({ art: 'unsigniert' }) },
      },
    );
    erg.offiziellBelegt = await plane(
      x,
      extra('offen', '1.0.0', 'herausgeber: app.ablago\n'),
      undefined,
      undefined,
      {},
      {},
      {
        quelle: { herkunft: ausKatalog, pruefung: pruefung({ art: 'projekt', offiziell: true }) },
      },
    );
    // Erstmals ein Herausgeber an einem Paket ohne; geprüft über einen weiteren signierten Katalog.
    erg.herausgeberErstmals = await plane(
      x,
      basis('1.1.0', 'herausgeber: org.example\n'),
      undefined,
      undefined,
      {},
      {},
      {
        quelle: {
          herkunft: { art: 'katalog', url: 'https://anbieter.example.org/katalog.json' },
          pruefung: pruefung({ art: 'anbieter', fingerabdruck: 'AB:CD' }),
        },
      },
    );
    await aendere(x, 'basis', (p) => ({ ...p, herausgeber: 'org.example', herausgeberSchluessel: 'AB:CD' }));
    erg.andererHerausgeber = await plane(x, basis('1.1.0', 'herausgeber: org.other\n'));
    erg.andererSchluessel = await plane(
      x,
      basis('1.1.0', 'herausgeber: org.example\n'),
      undefined,
      undefined,
      {},
      {},
      {
        quelle: {
          herkunft: { art: 'katalog', url: 'https://anbieter.example.org/katalog.json' },
          pruefung: pruefung({ art: 'anbieter', fingerabdruck: 'EF:01' }),
        },
      },
    );
    erg.schluesselGewechselt = await plane(
      x,
      basis('1.1.0', 'herausgeber: org.example\n'),
      undefined,
      undefined,
      {},
      {},
      {
        quelle: {
          herkunft: { art: 'katalog', url: 'https://anbieter.example.org/katalog.json' },
          pruefung: pruefung({ art: 'anbieter', fingerabdruck: 'EF:01', wechsel: true }),
        },
      },
    );
    // Abhängigkeit von einem anderen Herausgeber erfüllt nicht.
    erg.abhaengigkeitHerausgeber = await plane(x, extra('nutzer', '1.0.0', 'herausgeber: org.other\n'));
    erg.abhaengigkeitGleich = await plane(x, extra('nutzer', '1.0.0', 'herausgeber: org.example\n'));
    // Ergänzung mit Punkt: derselbe Herausgeber wie das Hauptpaket (installiert bzw. im Katalog).
    erg.ergaenzungFremd = await plane(x, extra('basis.extra', '1.0.0', 'ergaenzt: basis\nherausgeber: org.other\n'));
    erg.ergaenzungGleich = await plane(x, extra('basis.extra', '1.0.0', 'ergaenzt: basis\nherausgeber: org.example\n'));
  }
  {
    const x = dms();
    const k = (herausgeber?: string) =>
      katalog([{ id: 'haupt', name: 'Haupt', ...(herausgeber ? { herausgeber } : {}), versionen: [katalogVersion('1.0.0')] }]);
    const e = (h: string) => ({
      'manifest.yaml': manifest(
        'haupt.extra',
        'Extra',
        '1.0.0',
        `abhaengigkeiten: { haupt: ">=1.0.0" }\nergaenzt: haupt\nherausgeber: ${h}\n`,
      ),
    });
    erg.ergaenzungKatalog = await plane(x, e('org.other'), undefined, k('org.example'));
    erg.ergaenzungKatalogOffiziell = await plane(
      x,
      e('org.other'),
      undefined,
      k(),
      {},
      {},
      {
        quelle: { herkunft: ausKatalog, pruefung: pruefung({ art: 'projekt', offiziell: true }) },
      },
    );
    erg.ergaenzungKatalogHochgeladen = await plane(
      x,
      e('org.other'),
      undefined,
      k(),
      {},
      {},
      {
        quelle: { herkunft: hochgeladen, pruefung: pruefung({}) },
      },
    );
    erg.ergaenzungOhneHaupt = await plane(x, e('org.other'), undefined, katalog([]));
  }

  // 6. Umzug (ersetzt): Quelle, Vertrauen und Herausgeber.
  {
    const x = dms();
    await installiere(x, basis('1.0.0', 'herausgeber: org.example\n'));
    await installiere(x, extra('alt_extra'));
    const neu = (h = '') => extra('neu_extra', '2.0.0', `ersetzt: [alt_extra]\n${h}`);
    erg.umzugOhneQuelle = await plane(x, neu());
    erg.umzugAndereQuelle = await plane(
      x,
      neu(),
      undefined,
      undefined,
      {},
      {},
      { quelle: { herkunft: ausKatalog, pruefung: pruefung({}) } },
    );
    erg.umzugOhneHerausgeber = await plane(
      x,
      neu(),
      undefined,
      undefined,
      {},
      {},
      { quelle: { herkunft: hochgeladen, pruefung: pruefung({}) } },
    );
    await aendere(x, 'alt_extra', (p) => ({ ...p, herausgeber: 'org.example' }));
    erg.umzugAndererHerausgeber = await plane(
      x,
      neu('herausgeber: org.other\n'),
      undefined,
      undefined,
      {},
      {},
      {
        quelle: { herkunft: hochgeladen, pruefung: pruefung({}) },
      },
    );
    erg.umzug = await plane(
      x,
      neu('herausgeber: org.example\n'),
      undefined,
      undefined,
      {},
      {},
      {
        quelle: { herkunft: hochgeladen, pruefung: pruefung({}) },
      },
    );
    await aendere(x, 'alt_extra', (p) => ({ ...p, herkunft: ausKatalog }));
    erg.umzugWenigerVertrauen = await plane(
      x,
      neu('herausgeber: org.example\n'),
      undefined,
      undefined,
      {},
      {},
      {
        quelle: { herkunft: ausKatalog, pruefung: pruefung({ art: 'unsigniert' }) },
      },
    );
  }

  // 7. Sprachpaket: eines je Sprache, übergangene Texte, ältere Ablago-Version.
  {
    const x = dms();
    erg.spracheNeu = await plane(x, sprache('sprache_fr', '0.290.13', {}));
    await installiere(x, sprache('sprache_fr', '0.290.13', {}));
    erg.spracheSchonDa = await plane(x, sprache('sprache_fr2', '0.203.0', { 'gibt.es.nicht': 'Rien' }));
    erg.spracheUpdate = await plane(x, {
      ...sprache('sprache_fr', '0.290.13', {}),
      'manifest.yaml': sprache('sprache_fr', '0.290.13', {})['manifest.yaml'].replace('version: 1.0.0', 'version: 1.0.1'),
    });
  }

  // 8. Übernahme des früheren Ablageorts des Kerns durch Basis (#883).
  {
    const x = dms();
    const alt = await x.d.mappentypen.legeTypAn({
      name: 'Ablageort',
      felder: [{ key: 'name', label: 'Name', typ: 'text' }],
      register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] }],
    } as never);
    await x.d.sichtenVerwaltung.legeSichtAn({ name: 'Orte', typen: [alt.id], bedingungen: [] } as never);
    x.d.kern.frueherAblageortTyp = async () => alt;
    erg.uebernahme = await plane(x, basis());
  }

  // 9. Umbau: übernehmen und zusammenlegen; im Ablauf nie alle auf einmal.
  {
    const x = dms();
    await installiere(x, basis('1.0.0', 'herausgeber: org.example\n'));
    erg.umbauOhneHaushalt = await plane(x, UMBAU_VERTRAEGE);
    await installiere(x, UMBAU_HAUSHALT);
    erg.umbau = await plane(x, UMBAU_VERTRAEGE);
    erg.umbauAblauf = await plane(x, UMBAU_VERTRAEGE, undefined, undefined, {}, {}, { ablauf: true });
    erg.umbauKonflikt = await plane(
      x,
      UMBAU_VERTRAEGE,
      undefined,
      undefined,
      {},
      {},
      { geplant: { typen: new Set(['versicherung']), sichten: new Set() } },
    );
  }
  return erg;
}

describe('plane: Charakterisierung (#1278)', () => {
  it('Vorschau wie festgehalten', async () => {
    const ist = await lauf();
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
