/**
 * Regionspakete (#1696): Die deutschen Regeln (`shared/regionen/de.yaml`, Inhalt von „Region Deutschland“) liefern genau
 * dasselbe wie der eingebaute Rechner `feiertage()` – alle 16 Bundesländer, 1990–2100 – samt strenger Prüfung. Paket lesen und prüfen (echter Installer wie `pakete-pruefen`), Speichern am installierten
 * Paket, Feiertagsquelle (Paket oder eingebauter Rechner) und Übernahme des Bundeslands beim späteren Installieren.
 * Belegt: Termine und Fristen vorhandener Daten sowie „nicht an Feiertagen“ sind mit den Regeln aus dem Paket und mit dem
 * eingebauten Rechner gleich.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { parse } from 'yaml';
import { BUNDESLAENDER, feiertage, type Bundesland } from '../../shared/src/feiertage';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import {
  DMS_REGIONSPAKETE_AB,
  feiertageAusRegeln,
  pruefeRegionsregeln,
  regionenAusRegeln,
  type Regionsregeln,
} from '../../shared/src/regionspaket';
import { inSprache } from '../../shared/src/sprache';
import { REGION_STANDARD } from '../../shared/src/region';
import { verschiebe } from '../../shared/src/sichten';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { feiertagsquelle } from '../../shared/src/feiertagsquelle';
import { RegionDienst } from '../src/einstellungen/region';
import { Fachfehler } from '../src/grundlagen/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { pruefePakete } from '../src/pakete/paketpruefung';
import { speicherRepo } from '../src/repo/speicher';

const DE_YAML = readFileSync(new URL('../../shared/regionen/de.yaml', import.meta.url), 'utf8');
const geprueft = pruefeRegionsregeln(parse(DE_YAML));
const DE = geprueft.regeln as Regionsregeln;
const LAENDER = Object.keys(BUNDESLAENDER) as Bundesland[];
const tmp = mkdtempSync(join(tmpdir(), 'regionspaket-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

function ordner(name: string, dateien: Record<string, string>): string {
  const pfad = join(tmp, name);
  for (const [n, inhalt] of Object.entries(dateien)) {
    mkdirSync(dirname(join(pfad, n)), { recursive: true });
    writeFileSync(join(pfad, n), inhalt);
  }
  return pfad;
}
const manifest = (version: string, mitRegion: boolean) =>
  `schema: 1\nid: region_de\nname: Region Deutschland\nversion: ${version}\nbeschreibung: Feiertage.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=${DMS_REGIONSPAKETE_AB}"\n` +
  (mitRegion ? 'inhalt:\n  region: inhalt/region.yaml\n' : 'inhalt: {}\n');
/** Ein installiertes Paket mit Regeln, wie die Paketverwaltung es speichert. */
const installiert = (region: Regionsregeln, id = 'region_de'): InstalliertesPaket =>
  ({ id, name: 'Region Deutschland', version: '1.0.0', region }) as InstalliertesPaket;

describe('Regionspakete (#1696)', () => {
  it('installiert die Datei mit dem echten Installer, speichert sie am Paket; ein Update übernimmt das Bundesland', async () => {
    const repo = speicherRepo();
    const einst = speicherEinstellungen();
    const region = new RegionDienst(einst);
    // Vorher: Bundesland aus dem Kern gewählt (bestehende Installation).
    await region.speichere({ bundesland: 'SN' });
    const v1 = ordner('v1', { 'manifest.yaml': manifest('1.0.0', false) });
    const v2 = ordner('v2', { 'manifest.yaml': manifest('1.1.0', true), 'inhalt/region.yaml': DE_YAML });
    const erg = await pruefePakete([v1, v2], { version: DMS_REGIONSPAKETE_AB, repo });
    assert.deepEqual(
      erg.map((e) => [e.version, e.ok, e.gruende]),
      [
        ['1.0.0', true, []],
        ['1.1.0', true, []],
      ],
    );
    const [p] = await repo.listePakete();
    assert.deepEqual(p.region, DE, 'gespeichert wie andere Paketinhalte, am installierten Paket');
    // Die Einstellung bleibt im Kern – kein Umzug nötig, die Kennungen sind dieselben.
    const r = await region.lies();
    assert.equal(r.bundesland, 'SN');
    const q = feiertagsquelle(await repo.listePakete(), r);
    assert.deepEqual(q.paket, { id: 'region_de', name: 'Region Deutschland' });
    assert.deepEqual(Object.keys(q.regionen), LAENDER);
    assert.equal(q.am('2026-11-18'), 'Buß- und Bettag');
  });

  it('lehnt eine fehlerhafte Datei mit klaren Gründen ab (de/en)', async () => {
    const kaputt = DE_YAML.replace('ostern: -2 }', "ostern: -2, datum: '04-01' }").replace('regionen: [SN]', 'regionen: [XX]');
    const o = ordner('kaputt', { 'manifest.yaml': manifest('1.0.0', true), 'inhalt/region.yaml': kaputt });
    const [de] = await pruefePakete([o], { version: DMS_REGIONSPAKETE_AB });
    assert.equal(de.ok, false);
    assert.ok(
      de.gruende.includes('inhalt/region.yaml: feiertage[5]: genau eine Angabe aus datum, ostern und vorDatum.'),
      de.gruende.join('\n'),
    );
    assert.ok(
      de.gruende.some((g) => g.startsWith('inhalt/region.yaml: feiertage[20]: die Region „XX“')),
      de.gruende.join('\n'),
    );
    const [en] = await pruefePakete([o], { version: DMS_REGIONSPAKETE_AB, sprache: 'en' });
    assert.ok(en.gruende.includes('inhalt/region.yaml: feiertage[5]: exactly one of datum, ostern and vorDatum.'), en.gruende.join('\n'));
    const liste = ordner('liste', { 'manifest.yaml': manifest('1.0.0', true), 'inhalt/region.yaml': '- land: DE\n' });
    assert.ok(
      (await pruefePakete([liste], { version: DMS_REGIONSPAKETE_AB }))[0].gruende.includes('inhalt/region.yaml: erwartet ein Objekt.'),
    );
    const gross = ordner('gross', {
      'manifest.yaml': manifest('1.0.0', true),
      'inhalt/region.yaml': `# ${'x'.repeat(70_000)}\n${DE_YAML}`,
    });
    assert.ok(
      (await pruefePakete([gross], { version: DMS_REGIONSPAKETE_AB }))[0].gruende.includes('inhalt/region.yaml ist größer als 64 KB.'),
    );
  });

  it('Feiertagsquelle: Paket, sonst eingebauter Rechner; „nicht an Feiertagen“ ist für jeden Tag 2020–2035 gleich', () => {
    for (const l of LAENDER) {
      const kern = feiertagsquelle([], { land: 'DE', bundesland: l });
      const paket = feiertagsquelle([installiert(DE)], { land: 'DE', bundesland: l });
      assert.equal(kern.paket, null);
      assert.equal(paket.paket?.id, 'region_de');
      for (let tag = '2020-01-01'; tag <= '2035-12-31'; tag = verschiebe(tag, 1)) assert.equal(paket.am(tag), kern.am(tag), `${l} ${tag}`);
      assert.deepEqual(paket.zwischen('2027-01-01', '2028-12-31'), kern.zwischen('2027-01-01', '2028-12-31'), l);
    }
    // Ohne Bundesland: keine Feiertage wie bisher. Kennt das Paket die Region nicht oder gilt es für ein anderes Land: Kern.
    assert.deepEqual(feiertagsquelle([installiert(DE)], { land: 'DE', bundesland: null }).zwischen('2027-01-01', '2027-12-31'), {});
    const nurSachsen = { ...DE, regionen: DE.regionen.filter((r) => r.id === 'SN') };
    const nurSn = feiertagsquelle(
      [
        installiert({
          ...nurSachsen,
          feiertage: DE.feiertage
            .map((f) => ({ ...f, regionen: f.regionen?.filter((x) => x === 'SN') }))
            .filter((f) => f.regionen?.length !== 0),
        }),
      ],
      { land: 'DE', bundesland: 'BY' },
    );
    assert.equal(nurSn.paket, null);
    assert.equal(nurSn.am('2026-06-04'), 'Fronleichnam');
    assert.equal(feiertagsquelle([installiert({ ...DE, land: 'AT' })], { land: 'DE', bundesland: 'SN' }).paket, null);
  });

  it('Regionen beim Speichern: aus dem Paket, sonst die Bundesländer des Kerns', async () => {
    const r = new RegionDienst(speicherEinstellungen());
    const eigen: Regionsregeln = {
      land: 'DE',
      regionen: [{ id: 'X1', name: { de: 'Testland' } }],
      feiertage: [{ name: { de: 'Testtag' }, datum: '02-02', regionen: ['X1'] }],
    };
    const unbekannt = (e: unknown) => e instanceof Fachfehler && e.status === 422;
    await assert.rejects(r.speichere({ bundesland: 'X1' }), unbekannt);
    assert.equal((await r.speichere({ bundesland: 'X1' }, [installiert(eigen)])).bundesland, 'X1');
    await assert.rejects(r.speichere({ bundesland: 'SN' }, [installiert(eigen)]), unbekannt);
    assert.equal((await r.lies()).bundesland, 'X1', 'gelesen bleibt die Kennung des Pakets');
    assert.deepEqual(
      RegionDienst.feiertageIm(
        { ...REGION_STANDARD, bundesland: 'X1' },
        2027,
        feiertagsquelle([installiert(eigen)], { land: 'DE', bundesland: 'X1' }),
      ),
      [{ datum: '2027-02-02', name: 'Testtag' }],
    );
  });

  it('Termine und Fristen vorhandener Daten sind mit Paket-Regeln und eingebautem Rechner gleich', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const { benutzer: admin } = await konten.einrichten({
      email: 'admin@example.org',
      name: 'Lena Muster',
      passwort: 'ein-langes-passwort',
    });
    const vertrag = await d.mappentypen.legeTypAn({
      name: 'Vertrag',
      felder: [
        { key: 'name', label: 'Name', typ: 'text', pflicht: true },
        {
          key: 'kuendigung',
          label: 'Kündigung bis',
          typ: 'datum',
          frist: { vorlauf: 2, einheit: 'wochen', text: '{feld} {datum}', wiederholung: 12 },
        },
      ],
    });
    for (const [name, datum] of [
      ['Strom', '2027-10-31'],
      ['Gas', '2026-12-25'],
      ['Wasser', '2027-11-17'],
    ])
      await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name, kuendigung: datum } }, admin.id);
    const z = await d.rechtepruefung.zugriff({ id: admin.id, rolle: 'admin' });
    for (const jahr of [2026, 2027, 2028])
      for (const l of LAENDER) {
        const zeitraum = { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
        const region = { land: 'DE', bundesland: l };
        const kern = await d.fristen.termine(z, zeitraum, feiertagsquelle([], region));
        const paket = await d.fristen.termine(z, zeitraum, feiertagsquelle([installiert(DE)], region));
        assert.deepEqual(paket, kern, `${l} ${jahr}`);
        assert.ok(kern.eintraege.length >= 1 && Object.keys(kern.feiertage).length >= 9, `${l} ${jahr}`);
      }
  });
});

const sortiert = (m: Map<string, string>) => [...m].sort((a, b) => a[0].localeCompare(b[0]));

describe('Regionspakete: deutsche Regeln gleich dem eingebauten Rechner (#1696)', () => {
  it('die deutschen Regeln sind gültig und kennen die 16 Bundesländer', () => {
    assert.deepEqual(geprueft.fehler, []);
    assert.deepEqual(Object.keys(regionenAusRegeln(DE)), LAENDER);
    assert.deepEqual(regionenAusRegeln(DE), { ...BUNDESLAENDER }, 'Namen wie im Kern');
  });

  it('liefern für alle Bundesländer 1990–2100 dieselben Feiertage wie der eingebaute Rechner (Tage und Namen)', () => {
    let tage = 0;
    for (let j = 1990; j <= 2100; j++)
      for (const l of LAENDER) {
        const kern = sortiert(feiertage(j, l));
        assert.deepEqual(sortiert(feiertageAusRegeln(DE, j, l)), kern, `${l} ${j}`);
        tage += kern.length;
      }
    assert.ok(tage > 16 * 111 * 9, String(tage));
  });

  it('auf Englisch: dieselben Tage; wo der Kern übersetzt, derselbe Name', () => {
    inSprache('en', () => {
      for (let j = 1990; j <= 2100; j++)
        for (const l of LAENDER) {
          const kern = feiertage(j, l);
          const regeln = feiertageAusRegeln(DE, j, l);
          assert.deepEqual([...regeln.keys()].sort(), [...kern.keys()].sort(), `${l} ${j}`);
          for (const [d, n] of kern) if (n !== inSprache('de', () => feiertage(j, l).get(d))) assert.equal(regeln.get(d), n, `${l} ${d}`);
        }
      assert.equal(feiertageAusRegeln(DE, 2026, 'SN').get('2026-01-01'), 'New Year’s Day');
    });
  });

  it('ohne Region nur die Feiertage im ganzen Land', () => {
    const f = feiertageAusRegeln(DE, 2017, null);
    assert.equal(f.get('2017-10-31'), 'Reformationstag', '2017 bundesweit');
    assert.equal(f.size, 10);
    assert.equal(feiertageAusRegeln(DE, 2026, null).size, 9);
  });

  it('prüft streng: Art, Tage, Jahre, Regionen, unbekannte Angaben und Grenzen', () => {
    const fehler = (x: unknown) => pruefeRegionsregeln(x).fehler;
    const basis = { land: 'DE', regionen: [{ id: 'SN', name: { de: 'Sachsen' } }], feiertage: [] as unknown[] };
    const mit = (r: unknown) => fehler({ ...basis, feiertage: [r] });
    const name = { de: 'Tag' };
    assert.deepEqual(fehler(basis), []);
    assert.equal(fehler(null).length, 1);
    assert.match(fehler({ ...basis, land: 'Deutschland' })[0], /^land:/);
    assert.match(fehler({ ...basis, extra: 1 })[0], /extra/);
    assert.match(mit({ name, datum: '02-29' })[0], /02-29/);
    assert.match(mit({ name, datum: '13-01' })[0], /13-01/);
    assert.match(mit({ name, datum: '01-01', ostern: 1 })[0], /datum, ostern/);
    assert.match(mit({ name })[0], /datum, ostern/);
    assert.match(mit({ name, ostern: 300 })[0], /-80/);
    assert.match(mit({ name, ostern: 1.5 })[0], /ostern/);
    assert.match(mit({ name, vorDatum: { wochentag: 7, datum: '11-23' } })[0], /wochentag/);
    assert.match(mit({ name, datum: '01-01', regionen: ['BY'] })[0], /BY/);
    assert.equal(mit({ name, datum: '01-01', regionen: [] }).length, 1);
    assert.match(mit({ name, datum: '01-01', ab: 2020, bis: 2019 })[0], /ab/);
    assert.match(mit({ name, datum: '01-01', ab: 1200 })[0], /1583/);
    assert.match(mit({ name, datum: '01-01', jahre: [] })[0], /jahre/);
    assert.match(mit({ name: { en: 'Day' }, datum: '01-01' })[0], /name/);
    assert.match(mit({ name: { de: 'x'.repeat(81) }, datum: '01-01' })[0], /80/);
    assert.match(mit({ name, datum: '01-01', farbe: 'rot' })[0], /farbe/);
    assert.match(fehler({ ...basis, regionen: [...basis.regionen, { id: 'SN', name: { de: 'x' } }] })[0], /doppelt/);
    assert.match(fehler({ ...basis, regionen: [{ id: 'sachsen', name: { de: 'x' } }] })[0], /sachsen/);
    assert.match(fehler({ ...basis, feiertage: Array.from({ length: 81 }, () => ({ name, datum: '01-01' })) })[0], /80/);
  });

  it('rechnet „Wochentag vor Datum“ ohne den Tag selbst', () => {
    const r: Regionsregeln = { land: 'DE', regionen: [], feiertage: [{ name: { de: 'B' }, vorDatum: { wochentag: 3, datum: '11-23' } }] };
    // 2022-11-23 ist ein Mittwoch: Es gilt der Mittwoch davor.
    assert.deepEqual([...feiertageAusRegeln(r, 2022, null).keys()], ['2022-11-16']);
    assert.deepEqual([...feiertageAusRegeln(r, 2023, null).keys()], ['2023-11-22']);
  });
});
