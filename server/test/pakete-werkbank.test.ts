/**
 * Werkbank → Pakete (#1167, #1168, #1047, #1048): Hilfen in shared/src, die die Paketseite nutzt – ohne Server und Netz.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { automatisierungKlartext, kurzanleitungIn, KURZANLEITUNG_SCHRITTE, liesKurzanleitung } from '../../shared/src/mitkommt';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Paketverwaltung } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';
import { aktualisierungsRunde, EMPFOHLEN_MAX, empfehlungen, liesKatalog, neueVersionen, paketArt, type Katalog, type KatalogPaket, type NeueVersion, type RundenVorschau } from '../../shared/src/pakete';

const OFFIZIELL = 'https://catalog.example.org/katalog.json';
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const WEITERER = 'https://pakete.example.org/katalog.json';

/** Katalogpaket mit den nötigen Angaben; Versionen neueste zuerst. */
function kp(id: string, versionen: string[], mehr: Partial<KatalogPaket> = {}): KatalogPaket {
  return {
    id, name: id, beschreibung: '', autor: { name: 'Lena', github: '' }, lizenz: 'MIT', aktuell: versionen[0],
    versionen: versionen.map((version) => ({ version, dms: '>=0.0.0', abhaengigkeiten: {}, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: 'a.zip', sha256: '0'.repeat(64), groesse: 1, veroeffentlicht: '', quelle: '', readme: '', changelog: '' })),
    ...mehr,
  };
}
const katalog = (pakete: KatalogPaket[]): Katalog => ({ format: 1, erstellt: '', quelle: '', pakete });
const inst = (id: string, version: string, url = OFFIZIELL) => ({ id, name: id, version, herkunft: { art: 'katalog' as const, url } });

describe('Neuere Versionen aus den abgerufenen Katalogen (#1167)', () => {
  const kataloge = [
    { url: OFFIZIELL, katalog: katalog([kp('vertraege', ['1.2.0', '1.1.0']), kp('basis', ['1.7.0']), kp('texterkennung.fra', ['2.0.0'], { ersetzt: ['texterkennung_fra'] })]) },
    { url: WEITERER, katalog: katalog([kp('eigenes', ['3.0.0'])]) },
  ];

  it('markiert nur Pakete mit neuerer Version in ihrer eigenen Quelle', () => {
    const erg = neueVersionen([inst('vertraege', '1.1.0'), inst('basis', '1.7.0'), inst('eigenes', '2.0.0', WEITERER), inst('vertraege', '1.0.0', WEITERER)], kataloge);
    assert.deepEqual(erg.map((x) => `${x.id} ${x.installiert}→${x.neu} ${x.quelle === OFFIZIELL ? 'offiziell' : 'weiter'}`), ['vertraege 1.1.0→1.2.0 offiziell', 'eigenes 2.0.0→3.0.0 weiter']);
  });

  it('nach dem Update verschwindet der Merker sofort – ohne erneut zu prüfen', () => {
    assert.equal(neueVersionen([inst('vertraege', '1.2.0')], kataloge).length, 0);
  });

  it('gibt es danach noch eine neuere Version, steht sie da', () => {
    const neuer = [{ url: OFFIZIELL, katalog: katalog([kp('vertraege', ['1.3.0', '1.2.0', '1.1.0'])]) }];
    assert.deepEqual(neueVersionen([inst('vertraege', '1.2.0')], neuer).map((x) => x.neu), ['1.3.0']);
  });

  it('umgezogene Pakete (#1084): Update unter der neuen Id, danach unter ihr ohne Merker', () => {
    assert.deepEqual(neueVersionen([inst('texterkennung_fra', '1.0.0')], kataloge).map((x) => `${x.id}→${x.neu}`), ['texterkennung_fra→2.0.0']);
    assert.equal(neueVersionen([inst('texterkennung.fra', '2.0.0')], kataloge).length, 0);
  });

  it('hochgeladene Pakete und nicht abgerufene Quellen zählen nicht', () => {
    const hoch = { id: 'vertraege', name: 'Verträge', version: '1.0.0', herkunft: { art: 'hochgeladen' as const, von: null, am: '' } };
    assert.equal(neueVersionen([hoch, inst('eigenes', '1.0.0', 'https://anders.example.org/k.json')], kataloge).length, 0);
    assert.equal(neueVersionen([inst('vertraege', '1.0.0')], [{ url: OFFIZIELL, katalog: null }]).length, 0);
  });
});

describe('Alle aktualisieren: Reihenfolge und Entscheidungen (#1168)', () => {
  const u = (id: string, neu: string, quelle = OFFIZIELL): NeueVersion => ({ id, name: id, installiert: '1.0.0', neu, quelle });
  const v = (id: string, version: string, abh: Record<string, string> = {}, mehr: Partial<RundenVorschau> = {}): RundenVorschau => ({
    paket: { id, version, abhaengigkeiten: abh }, abhaengigkeiten: Object.entries(abh).map(([a, bereich]) => ({ id: a, bereich })), probleme: [], ...mehr,
  });
  const offiziell = (q: string) => q === OFFIZIELL;

  it('erst das, wovon andere abhängen; Ergänzungen nach dem Hauptpaket', () => {
    const r = aktualisierungsRunde([
      { u: u('texterkennung.fra', '2.0.0'), v: v('texterkennung.fra', '2.0.0', { texterkennung: '>=2.0.0' }), fehler: null },
      { u: u('vermietung', '2.0.0'), v: v('vermietung', '2.0.0', { basis: '>=1.7.0', vertraege: '>=1.1.0' }), fehler: null },
      { u: u('texterkennung', '2.0.0'), v: v('texterkennung', '2.0.0'), fehler: null },
      { u: u('vertraege', '1.2.0'), v: v('vertraege', '1.2.0', { basis: '>=1.7.0' }), fehler: null },
      { u: u('basis', '1.7.0'), v: v('basis', '1.7.0'), fehler: null },
    ], offiziell);
    const pos = (id: string) => r.findIndex((e) => e.id === id);
    assert.ok(pos('basis') < pos('vertraege') && pos('vertraege') < pos('vermietung'));
    assert.ok(pos('texterkennung') < pos('texterkennung.fra'));
  });

  it('eine Abhängigkeit, die die Runde vorher passend macht, verhindert nichts – andere Probleme bleiben', () => {
    const problem = 'basis ist in Version 1.6.0 installiert, gebraucht wird >=1.7.0.';
    const vertraege = v('vertraege', '1.2.0', { basis: '>=1.7.0' }, { probleme: [problem, 'Das Paket braucht Ablago >=9.0.0.'] });
    vertraege.abhaengigkeiten[0].problem = problem;
    const [, e] = aktualisierungsRunde([{ u: u('vertraege', '1.2.0'), v: vertraege, fehler: null }, { u: u('basis', '1.7.0'), v: v('basis', '1.7.0'), fehler: null }], offiziell);
    assert.equal(e.id, 'vertraege');
    assert.deepEqual(e.geloest, [problem]);
    assert.deepEqual(e.probleme, ['Das Paket braucht Ablago >=9.0.0.']);
    // Ohne passendes Update in der Runde bleibt das Problem.
    const [allein] = aktualisierungsRunde([{ u: u('vertraege', '1.2.0'), v: vertraege, fehler: null }], offiziell);
    assert.equal(allein.probleme.length, 2);
  });

  it('aufgeklappt wird nur, was eine Entscheidung braucht', () => {
    const r = aktualisierungsRunde([
      { u: u('ruhig', '1.1.0'), v: v('ruhig', '1.1.0'), fehler: null },
      { u: u('rechte', '1.1.0'), v: v('rechte', '1.1.0', {}, { laeufer: { bestaetigen: true } }), fehler: null },
      { u: u('umbau', '1.1.0'), v: v('umbau', '1.1.0', {}, { umbau: [{}] }), fehler: null },
      { u: u('herausgeber', '1.1.0'), v: v('herausgeber', '1.1.0', {}, { herausgeberBestaetigen: 'app.ablago' }), fehler: null },
      { u: u('fremd', '1.1.0', WEITERER), v: v('fremd', '1.1.0'), fehler: null },
      { u: u('signiert', '1.1.0', WEITERER), v: v('signiert', '1.1.0', {}, { pruefung: { bestaetigen: false } }), fehler: null },
      { u: u('name', '1.1.0'), v: v('name', '1.1.0', {}, { probleme: ['Mappentyp „Auto“ gibt es schon.'], namenskonflikte: ['Mappentyp „Auto“ gibt es schon.'] }), fehler: null },
      { u: u('kaputt', '1.1.0'), v: null, fehler: 'lässt sich nicht herunterladen' },
    ], offiziell);
    assert.deepEqual(r.filter((e) => e.entscheiden).map((e) => e.id).sort(), ['fremd', 'herausgeber', 'name', 'rechte', 'umbau']);
    assert.deepEqual(r.find((e) => e.id === 'name')!.probleme, []);
    assert.equal(r.find((e) => e.id === 'kaputt')!.fehler, 'lässt sich nicht herunterladen');
  });
});

/* ---------- Was mitkommt und Kurzanleitung (#1047) ---------- */

describe('Was mitkommt: Automatisierungen in der Fassung des Katalogs (#1047)', () => {
  const name = (art: string) => ({ 'mappe.angelegt': 'Mappe angelegt' } as Record<string, string>)[art] ?? art;
  const datum = (vorlauf: number, wiederholung: number | null = null) => ({ art: 'datum' as const, typ: 'Mietvertrag', feld: 'Ende', vorlauf, einheit: 'tage' as const, uhrzeit: '07:00', wiederholung });

  it('Datum erreicht: vor, am Tag, nach; einmal je Termin oder wiederkehrend', () => {
    const ersteller = [{ art: 'aufgabe' as const, benachrichtigung: false, empfaenger: [{ art: 'ersteller' as const }] }];
    assert.deepEqual(automatisierungKlartext({ wenn: datum(60), dann: ersteller }, name), {
      wenn: '60 Tage vor „Ende“ (Mietvertrag), geprüft um 07:00', dann: 'Aufgabe an die Person, die die Mappe angelegt hat', ablauf: 'Einmal je Termin',
    });
    assert.equal(automatisierungKlartext({ wenn: datum(0), dann: ersteller }, name).wenn, 'am Tag „Ende“ (Mietvertrag), geprüft um 07:00');
    assert.equal(automatisierungKlartext({ wenn: datum(-7), dann: ersteller }, name).wenn, '7 Tage nach „Ende“ (Mietvertrag), geprüft um 07:00');
    assert.equal(automatisierungKlartext({ wenn: datum(1), dann: ersteller }, name).wenn, '1 Tag vor „Ende“ (Mietvertrag), geprüft um 07:00');
    assert.equal(automatisierungKlartext({ wenn: datum(60, 12), dann: ersteller }, name).ablauf, 'Wiederkehrend (jährlich): nach dem Erledigen schlägt Ablago den Folgetermin vor');
    assert.equal(automatisierungKlartext({ wenn: datum(60, 24), dann: ersteller }, name).ablauf, 'Wiederkehrend (alle 2 Jahre): nach dem Erledigen schlägt Ablago den Folgetermin vor');
  });

  it('Empfänger aus einem Feld, sonst an die Person, die die Mappe angelegt hat; Zeitplan und Ereignis', () => {
    const k = automatisierungKlartext({ wenn: { art: 'ereignis', ereignis: 'mappe.angelegt', typ: 'Vertrag' }, dann: [{ art: 'aufgabe', benachrichtigung: true, empfaenger: [{ art: 'feld', feld: 'Verantwortlich', sonstErsteller: true }] }] }, name);
    assert.deepEqual(k, { wenn: 'Vertrag: Mappe angelegt', dann: 'Benachrichtigung an „Verantwortlich“ (sonst an die Person, die die Mappe angelegt hat)', ablauf: 'Bei jedem Ereignis' });
    const z = automatisierungKlartext({ wenn: { art: 'zeitplan', tage: [1, 2, 3, 4, 5], uhrzeit: '07:00', feiertage: true, jeBenutzer: true, profilzeit: false }, dann: [{ art: 'zusammenfassung' }] }, name);
    assert.equal(z.wenn, 'werktags um 07:00 (nicht an Feiertagen) für jeden Benutzer');
    assert.equal(z.dann, 'Tägliche Zusammenfassung senden');
    assert.equal(z.ablauf, 'Wiederkehrend nach Zeitplan');
  });

  it('Kurzanleitung: je Sprache eine Liste von Schritten, Ungültiges fällt still weg', () => {
    assert.deepEqual(liesKurzanleitung({ de: ['Vertrag anlegen', '  Frist   eintragen ', 42, '<b>x</b>', ''], en: [], fr: 'Texte', '': ['x'] }), { de: ['Vertrag anlegen', 'Frist eintragen'] });
    assert.equal(liesKurzanleitung('Schritte'), undefined);
    assert.equal(liesKurzanleitung({ de: Array.from({ length: 20 }, (_, i) => `Schritt ${i}`) })!.de.length, KURZANLEITUNG_SCHRITTE);
    assert.deepEqual(kurzanleitungIn({ de: ['A'], en: ['B'] }, 'en-GB'), ['B']);
    assert.deepEqual(kurzanleitungIn({ de: ['A'] }, 'fr'), ['A']);
  });
});

const url = process.env.TEST_DATABASE_URL;
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'markus@example.org' };
const offen: Array<{ end(): Promise<void> }> = [];
after(async () => { for (const s of offen) await s.end(); });

/** Ein Paket mit Mietvertrag, Ansicht, Wortliste, Automatisierung und Kurzanleitung; mehr: Version 1.1.0 mit zweiter Automatisierung. */
function mietPaket(version = '1.0.0'): Record<string, string> {
  const zweite = version !== '1.0.0';
  return {
    'manifest.yaml': `schema: 1\nid: miete\nname: Miete\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\n`
      + 'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n  wortlisten: inhalt/wortlisten.yaml\n  automatisierungen: inhalt/automatisierungen.yaml\n'
      + 'kurzanleitung:\n  de: [Mietvertrag anlegen, Ende eintragen, Aufgabe abwarten]\n  en: [Create a tenancy, Enter the end, Wait for the to do]\n',
    'inhalt/mappentypen.yaml': `- schluessel: mietvertrag\n  name: Mietvertrag\n  beschreibung: Ein Mietvertrag.\n  felder: [{ key: name, label: Name, typ: text }, { key: ende, label: Ende, typ: datum }]\n  register: [{ key: daten, name: Daten, art: felder, felder: [name, ende] }]\n${zweite ? '- schluessel: nebenkosten\n  name: Nebenkosten\n  felder: [{ key: name, label: Name, typ: text }]\n  register: [{ key: daten, name: Daten, art: felder, felder: [name] }]\n' : ''}`,
    'inhalt/sichten.yaml': '- { schluessel: miete, name: Mietverträge, typen: [mietvertrag] }\n',
    'inhalt/wortlisten.yaml': '- woerter: [Miete, Mietvertrag]\n',
    'inhalt/automatisierungen.yaml': `- schluessel: ende\n  name: Mietvertrag endet\n  beschreibung: Erinnert an das Ende.\n  eingeschaltet: true\n  wenn: { art: datum, typ: mietvertrag, feld: ende, vorlauf: 60, einheit: tage, uhrzeit: "07:00", wiederholung: 12 }\n  dann: [{ art: aufgabe, text: "Kündigen?", empfaenger: [{ art: ersteller }] }]\n`
      + (zweite ? '- schluessel: neu\n  name: Neuer Mietvertrag\n  wenn: { art: mappe.angelegt, typ: mietvertrag }\n  dann: [{ art: aufgabe, text: "Prüfen", als: benachrichtigung, empfaenger: [{ art: ersteller }] }]\n' : ''),
  };
}

for (const pg of [false, true]) {
  describe(`Was mitkommt in Vorschau und Installation (#1047)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    async function aufbau() {
      let r: Repo = speicherRepo();
      if (pg) {
        const { pgRepo } = await import('../src/repo-pg');
        const { sql } = await eigeneDatenbank('mitkommt');
        offen.push(sql);
        await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
        r = pgRepo(sql, HAUSHALT) as never;
      }
      const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => '0.245.0', abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: OFFIZIELL });
      const archiv = (x: Record<string, string>) => zipPuffer(Object.entries(x).map(([n, inhalt]) => ({ name: n, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
      return { d, p, hoch: (x: Record<string, string>) => p.hochladen(archiv(x), ICH) };
    }

    it('Vorschau und Installation: alle Punkte, Kurzanleitung gespeichert', async () => {
      const { p, hoch } = await aufbau();
      const { upload, vorschau } = await hoch(mietPaket());
      const m = vorschau.mitkommt!;
      assert.deepEqual(m.mappentypen.map((x) => `${x.name} ${x.felder} ${x.beschreibung}`), ['Mietvertrag 2 Ein Mietvertrag.']);
      assert.deepEqual(m.sichten.map((x) => x.name), ['Mietverträge']);
      assert.deepEqual(m.wortlisten, [['Miete', 'Mietvertrag']]);
      assert.deepEqual(m.automatisierungen.map((a) => [a.name, a.an, a.wenn]), [['Mietvertrag endet', true, { art: 'datum', typ: 'Mietvertrag', feld: 'Ende', vorlauf: 60, einheit: 'tage', uhrzeit: '07:00', wiederholung: 12 }]]);
      assert.equal(m.code, false);
      assert.ok(!m.mappentypen.some((x) => x.neu), 'beim Installieren ist nichts „neu in dieser Version“');
      assert.deepEqual(vorschau.kurzanleitung, { de: ['Mietvertrag anlegen', 'Ende eintragen', 'Aufgabe abwarten'], en: ['Create a tenancy', 'Enter the end', 'Wait for the to do'] });
      const inst = await p.installiere({ upload, bestaetigt: true }, ICH);
      assert.deepEqual(inst.kurzanleitung?.de, ['Mietvertrag anlegen', 'Ende eintragen', 'Aufgabe abwarten']);
      assert.deepEqual(inst.mitkommt?.automatisierungen.map((a) => a.name), ['Mietvertrag endet']);
      const gelesen = (await p.installierte()).find((x) => x.id === 'miete')!;
      assert.deepEqual(gelesen.mitkommt?.mappentypen.map((x) => x.name), ['Mietvertrag'], 'gespeichert an der Installation');
    });

    it('Update: was dazukommt, trägt „neu in dieser Version“', async () => {
      const { p, hoch } = await aufbau();
      await p.installiere({ upload: (await hoch(mietPaket())).upload, bestaetigt: true }, ICH);
      const { vorschau } = await hoch(mietPaket('1.1.0'));
      const m = vorschau.mitkommt!;
      assert.deepEqual(m.mappentypen.map((x) => `${x.name}${x.neu ? ' neu' : ''}`), ['Mietvertrag', 'Nebenkosten neu']);
      assert.deepEqual(m.automatisierungen.map((x) => `${x.name}${x.neu ? ' neu' : ''}`), ['Mietvertrag endet', 'Neuer Mietvertrag neu']);
      assert.deepEqual(m.sichten.map((x) => `${x.name}${x.neu ? ' neu' : ''}`), ['Mietverträge']);
    });
  });
}

/* ---------- Pakete dazuholen (#1048) ---------- */

describe('Pakete dazuholen: Art, Empfehlungen, Liste aus dem Katalog (#1048)', () => {
  const sprache = kp('sprache_fr', ['1.0.0']);
  sprache.versionen[0].sprache = { kennung: 'fr', maschinell: true };
  const fra = kp('texterkennung.fra', ['1.0.0']);
  Object.assign(fra.versionen[0], { ergaenzt: { paket: 'texterkennung' }, abhaengigkeiten: { texterkennung: '>=2.0.0' } });
  const pakete = [kp('basis', ['1.7.0']), kp('haushalt', ['1.0.0']), kp('vertraege', ['1.1.0']), kp('rechnungen', ['1.1.0']), kp('compliance', ['1.0.0']), kp('texterkennung', ['2.0.0']), kp('trennblatt', ['1.0.0']), sprache, fra];

  it('Sprachpaket, Ergänzung oder Paket', () => {
    assert.deepEqual([paketArt(sprache), paketArt(fra), paketArt(pakete[0])], ['sprache', 'ergaenzung', 'paket']);
  });

  it('ohne Liste im Katalog: die des Einrichtungsassistenten; Compliance nur, wenn beruflich genutzt', () => {
    const k = katalog(pakete);
    assert.deepEqual(empfehlungen(k, { beruflich: false, dms: '', installiert: [] }).map((p) => p.id), ['basis', 'haushalt', 'vertraege', 'rechnungen', 'texterkennung']);
    assert.deepEqual(empfehlungen(k, { beruflich: true, dms: '', installiert: [{ id: 'basis' }] }).map((p) => p.id), ['haushalt', 'vertraege', 'rechnungen', 'texterkennung', 'compliance']);
  });

  it('mit Liste im Katalog: deren Reihenfolge, ohne Installiertes, Sprachen, Ergänzungen und Unbekanntes; höchstens acht', () => {
    const k = liesKatalog({ format: 1, empfohlen: ['trennblatt', 'sprache_fr', 'texterkennung.fra', 'gibtsnicht', 'basis', 'basis', 'Ungültig!', 'compliance'], pakete });
    assert.deepEqual(k.empfohlen, ['trennblatt', 'sprache_fr', 'texterkennung.fra', 'gibtsnicht', 'basis', 'compliance']);
    assert.deepEqual(empfehlungen(k, { beruflich: false, dms: '', installiert: [{ id: 'basis' }] }).map((p) => p.id), ['trennblatt']);
    assert.deepEqual(empfehlungen(k, { beruflich: true, dms: '', installiert: [] }).map((p) => p.id), ['trennblatt', 'basis', 'compliance']);
    const viele = katalog(Array.from({ length: 12 }, (_, i) => kp(`paket_${i}`, ['1.0.0'])));
    assert.equal(empfehlungen({ ...viele, empfohlen: viele.pakete.map((p) => p.id) }, { beruflich: false, dms: '', installiert: [] }).length, EMPFOHLEN_MAX);
    assert.equal(liesKatalog({ format: 1, pakete: [] }).empfohlen, undefined, 'ältere Kataloge ohne Liste');
  });
});
