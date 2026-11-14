/**
 * Werkbank → Pakete (#1167, #1168, #1047, #1048): Hilfen in shared/src, die die Paketseite nutzt – ohne Server und Netz.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { neueVersionen, type Katalog, type KatalogPaket } from '../../shared/src/pakete';

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
