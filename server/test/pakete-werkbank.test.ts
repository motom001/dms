/**
 * Werkbank → Pakete (#1167, #1168, #1047, #1048): Hilfen in shared/src, die die Paketseite nutzt – ohne Server und Netz.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aktualisierungsRunde, neueVersionen, type Katalog, type KatalogPaket, type NeueVersion, type RundenVorschau } from '../../shared/src/pakete';

const OFFIZIELL = 'https://catalog.example.org/katalog.json';
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
