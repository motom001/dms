/** Namen der Feldarten aus den Sprachdateien (#1094): jede Feldart hat einen Namen in de und en, die Kennung bleibt. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FELDTYPEN, feldtypName, type Feldtyp } from '../../shared/src/model';
import { inSprache } from '../../shared/src/sprache';
import de from '../../shared/src/sprachen/de/gemeinsam.json';
import en from '../../shared/src/sprachen/en/gemeinsam.json';
import { openapi } from '../src/api-v1';

const ARTEN = Object.keys(FELDTYPEN) as Feldtyp[];
const name = (datei: Record<string, string>, typ: Feldtyp) => datei[`model.feldart.${typ}`];

describe('Namen der Feldarten (#1094)', () => {
  it('jede Feldart hat einen Namen in de und en', () => {
    for (const typ of ARTEN) {
      assert.ok(name(de, typ)?.trim(), `de: Name für „${typ}“ fehlt (gemeinsam.json, model.feldart.${typ})`);
      assert.ok(name(en, typ)?.trim(), `en: Name für „${typ}“ fehlt (gemeinsam.json, model.feldart.${typ})`);
    }
  });

  it('keine Namen für Feldarten, die es nicht gibt', () => {
    for (const datei of [de, en]) {
      const ueberzaehlig = Object.keys(datei).filter((k) => k.startsWith('model.feldart.') && !ARTEN.includes(k.slice('model.feldart.'.length) as Feldtyp));
      assert.deepEqual(ueberzaehlig, []);
    }
  });

  it('der deutsche Name stimmt mit FELDTYPEN überein', () => {
    for (const typ of ARTEN) assert.equal(name(de, typ), FELDTYPEN[typ], typ);
  });

  it('feldtypName folgt der Sprache', () => {
    assert.equal(inSprache('de', () => feldtypName('zeitraum')), 'Zeitraum');
    assert.equal(inSprache('en', () => feldtypName('zeitraum')), 'Period');
    assert.equal(inSprache('en', () => feldtypName('betrag')), 'Amount');
  });

  it('OpenAPI nennt Kennung und Namen, die Kennungen bleiben', () => {
    const doku = openapi('test') as { components: { schemas: { Feld: { properties: { typ: { enum: string[]; description: string } } } } } };
    const typ = doku.components.schemas.Feld.properties.typ;
    assert.deepEqual(typ.enum, ARTEN);
    assert.match(typ.description, /zeitraum = Zeitraum \/ Period/);
    assert.match(typ.description, /betrag = Betrag \/ Amount/);
  });
});
