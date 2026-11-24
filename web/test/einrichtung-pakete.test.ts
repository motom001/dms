/**
 * Einrichtungsassistent (#1566, #1591): Ablago wählt die Pakete nach „Wofür nutzt du Ablago?“, der Empfehlung im
 * Katalog und der Antwort auf „Welche Pakete darf Ablago nutzen?“. Nie kommt ein Paket über der Grenze in die Auswahl;
 * was wegfällt, hat einen Grund in Worten. „Selbst auswählen“ graut dieselben Pakete mit demselben Grund aus.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { erlaubt, PAKETE_GRENZEN, type PaketStufe } from '../../shared/src/darf';
import type { Katalog, KatalogStufe } from '../../shared/src/pakete';

const WEB = new URL('../../web/src/', import.meta.url).href;
const { vorschlag, gesperrteAus, ersterSatz, zielName } = (await import(
  WEB + 'assistent/paketwahl.ts'
)) as typeof import('../src/assistent/paketwahl');

const version = (code: boolean) => ({
  version: '1.0.0',
  dms: '>=0.1.0',
  abhaengigkeiten: {},
  inhalt: { mappentypen: [], sichten: [], beispiele: 0 },
  code,
  archiv: 'x.zip',
  sha256: '0'.repeat(64),
  groesse: 1,
  veroeffentlicht: '2026-11-01T00:00:00Z',
  quelle: '',
  readme: '',
  changelog: '',
});
const paket = (id: string, code: boolean) => ({
  id,
  name: id,
  beschreibung: `${id}. Mehr.`,
  autor: { name: 'Test', github: 'test' },
  lizenz: 'MIT',
  aktuell: '1.0.0',
  versionen: [version(code)],
});
/** Basis und Haushalt ohne Code, Texterkennung als eingebauter Helfer, Trennblatt nur hier, Sicherung mit Internet. */
const STUFE: Record<string, PaketStufe | null> = {
  basis: 'vorlagen',
  haushalt: 'vorlagen',
  vertraege: 'vorlagen',
  texterkennung: null,
  trennblatt: 'lokal',
  sicherung_webdav: 'netz',
};
const katalog: Katalog = {
  format: 1,
  erstellt: '2026-11-01T00:00:00Z',
  quelle: '',
  empfohlen: ['basis', 'haushalt', 'texterkennung', 'vertraege', 'trennblatt', 'sicherung_webdav'],
  pakete: Object.entries(STUFE).map(([id, st]) => paket(id, st !== 'vorlagen')),
} as Katalog;
const stufen = (grenze: (typeof PAKETE_GRENZEN)[number]): KatalogStufe[] =>
  Object.entries(STUFE).map(([id, stufe]) => {
    const ok = !stufe || erlaubt(grenze, stufe);
    return {
      id,
      stufe,
      erlaubt: ok,
      ...(ok ? {} : { grund: `„${id}“ geht nicht.` }),
      netz: stufe === 'netz' ? ['https://dav.example.org'] : [],
      adressen: [],
    };
  });
const o = { nutzung: 'privat' as const, organisation: false, dms: '0.310.0', installiert: [] };

describe('Ablago wählt die Pakete (#1566)', () => {
  for (const grenze of PAKETE_GRENZEN)
    it(`Antwort „${grenze}“: nur erlaubte Pakete, die übrigen mit Grund`, () => {
      const v = vorschlag(katalog, stufen(grenze), o);
      for (const id of v.ids) {
        const st = STUFE[id];
        assert.ok(!st || erlaubt(grenze, st), `${id} über der Grenze`);
      }
      if (grenze !== 'netz') assert.ok(!v.ids.includes('sicherung_webdav'), 'nie ein Paket mit Netz unterhalb von „mit Internet“');
      assert.ok(v.ids.includes('texterkennung'), 'eingebauter Helfer auf jeder Antwort');
      for (const n of v.nicht) assert.match(n.grund, /geht nicht/);
      assert.equal(v.ids.length + v.nicht.length, Object.keys(STUFE).length);
    });

  it('folgt der Nutzung: Organisation bringt Basis, Installiertes und Unbekanntes fällt weg', () => {
    const v = vorschlag(katalog, stufen('netz'), { ...o, installiert: [{ id: 'haushalt' }] });
    assert.ok(!v.ids.includes('haushalt'), 'schon installiert');
    assert.ok(!v.ids.includes('rechnungen'), 'nicht im Katalog');
    const ohne = vorschlag({ ...katalog, empfohlen: ['texterkennung'] }, stufen('netz'), { ...o, nutzung: null, organisation: true });
    assert.deepEqual(ohne.ids, ['basis', 'texterkennung']);
  });

  it('ohne Einordnung schlägt Ablago nichts vor – lieber zu wenig als zu viel', () => {
    assert.deepEqual(vorschlag(katalog, [], o), { ids: [], nicht: [] });
  });

  it('„Selbst auswählen“: gesperrt mit demselben Grund', () => {
    assert.deepEqual(gesperrteAus(stufen('lokal')), { sicherung_webdav: '„sicherung_webdav“ geht nicht.' });
    assert.deepEqual(gesperrteAus(stufen('netz')), {});
  });

  it('je Paket ein Satz, Ziele als Host', () => {
    assert.equal(ersterSatz('Ordner und Verträge. Mit Vorlagen.'), 'Ordner und Verträge.');
    assert.equal(ersterSatz('ohne Punkt'), 'ohne Punkt');
    assert.equal(zielName('https://api.example.org/v1'), 'api.example.org');
    assert.equal(zielName('kein url'), 'kein url');
  });
});
