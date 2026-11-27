/**
 * Datumsfeld mit Genauigkeit „Monat“ (#1722): Feldangabe nur am Datumsfeld, Speichern als Monatsletzter, Filter und
 * Sortierung ohne Sonderfall, Paketformat (Lesen, Paket erstellen mit Mindestversion, Update). Werte erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import type { Feld, Mappentyp } from '../../shared/src/model';
import type { Bedingung } from '../../shared/src/sichten';
import { DMS_DATUM_MONAT_AB } from '../../shared/src/monatsdatum';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { bereinigeFeld } from '../src/mappentypen/index';
import { formatNeu, liesPaket, liesZip } from '../src/pakete/verwaltung/index';
import { mindestversion, Paketerstellung } from '../src/pakete/erstellung/index';
import { speicherRepo } from '../src/repo/speicher';
import '../src/sprache/sprache';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const ADMIN = { id: 'x', rolle: 'admin' };

const FELDER: Feld[] = [
  { key: 'kennzeichen', label: 'Kennzeichen', typ: 'text', pflicht: true },
  { key: 'geprueft_am', label: 'Geprüft am', typ: 'datum' },
  { key: 'naechste_hu', label: 'Nächste HU', typ: 'datum', genauigkeit: 'monat' },
];

const dienst = () => new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
async function fahrzeuge(d: Dienst) {
  const typ = await d.mappentypen.legeTypAn({
    name: 'Fahrzeug',
    schluessel: 'fahrzeug',
    titelVorlage: '{kennzeichen}',
    felder: FELDER.map((f) => ({ ...f })),
    trefferliste: ['kennzeichen', 'naechste_hu'],
  });
  const m = async (kennzeichen: string, werte: Record<string, unknown>) =>
    d.mappen.legeMappeAn({ typId: typ.id, werte: { kennzeichen, ...werte } });
  return { typ, m };
}

describe('Feldangabe genauigkeit (#1722)', () => {
  it('nur am Datumsfeld und nur „monat“ gespeichert; „tag“ und Fehlendes wie bisher', () => {
    assert.equal(bereinigeFeld({ key: 'hu', label: 'HU', typ: 'datum', genauigkeit: 'monat' }).genauigkeit, 'monat');
    assert.equal(bereinigeFeld({ key: 'hu', label: 'HU', typ: 'datum', genauigkeit: 'tag' }).genauigkeit, undefined);
    assert.equal(bereinigeFeld({ key: 'hu', label: 'HU', typ: 'datum' }).genauigkeit, undefined);
    assert.equal(bereinigeFeld({ key: 'hu', label: 'HU', typ: 'text', genauigkeit: 'monat' }).genauigkeit, undefined);
    assert.equal(bereinigeFeld({ key: 'hu', label: 'HU', typ: 'datum', genauigkeit: 'jahr' }).genauigkeit, undefined);
  });
});

describe('Speichern, Filter und Sortierung (#1722)', () => {
  it('gespeichert wird der Monatsletzte – aus JJJJ-MM oder einem Tag des Monats; Tag-Felder bleiben, wie sie sind', async () => {
    const d = dienst();
    const { typ, m } = await fahrzeuge(d);
    assert.equal(typ.felder.find((f) => f.key === 'naechste_hu')!.genauigkeit, 'monat');
    const a = await m('MU-LM 1', { naechste_hu: '2028-04', geprueft_am: '2026-04-15' });
    assert.equal(a.werte.naechste_hu, '2028-04-30');
    assert.equal(a.werte.geprueft_am, '2026-04-15', 'Tag-genau unverändert');
    const b = await m('MU-LM 2', { naechste_hu: '2028-02-03' });
    assert.equal(b.werte.naechste_hu, '2028-02-29');
    const c = await d.mappen.aendereMappe(a.id, { werte: { naechste_hu: '2027-11-01' } });
    assert.equal(c.werte.naechste_hu, '2027-11-30');
    await assert.rejects(m('MU-LM 3', { naechste_hu: '04/2028' }), (e) => e instanceof Fachfehler && /Nächste HU/.test(e.message));
    await assert.rejects(m('MU-LM 4', { naechste_hu: '2028-13' }), (e) => e instanceof Fachfehler);
  });

  it('Filter und Sortierung arbeiten mit dem Monatsletzten wie mit jedem Datum', async () => {
    const d = dienst();
    const { typ, m } = await fahrzeuge(d);
    await m('A', { naechste_hu: '2028-04' });
    await m('B', { naechste_hu: '2027-03' });
    await m('C', { naechste_hu: '2028-05' });
    await m('D', {});
    const kz = async (sortierung: string, absteigend = false) =>
      (await d.sichten.seite(ADMIN, { sicht: typ.id, sortierung, absteigend: String(absteigend) })).mappen
        .map((x) => String(x.werte.kennzeichen))
        .join('');
    assert.equal(await kz('naechste_hu'), 'BACD');
    const treffer = async (bedingungen: Bedingung[]) => {
      const s = await d.sichtenVerwaltung.legeSichtAn({ name: `S ${Math.random()}`, typen: [typ.id], bedingungen });
      return (await d.sichten.seite(ADMIN, { sicht: s.id, sortierung: 'kennzeichen' })).mappen
        .map((x) => String(x.werte.kennzeichen))
        .join('');
    };
    // „HU fällig im April 2028“: der ganze April, das Monatsende eingeschlossen.
    const april = { art: 'fest', wert: '2028-04-01' } as const;
    const ende = { art: 'fest', wert: '2028-04-30' } as const;
    assert.equal(await treffer([{ art: 'feld', feld: 'naechste_hu', op: 'zwischen', wert: april, bis: ende }]), 'A');
    assert.equal(await treffer([{ art: 'feld', feld: 'naechste_hu', op: 'kleiner', wert: { art: 'fest', wert: '2028-05-01' } }]), 'AB');
  });
});

describe('Paketformat (#1722)', () => {
  const MANIFEST =
    'schema: 1\nid: hu_test\nname: HU (Test)\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=0.86.0"\ninhalt: { mappentypen: mappentypen.yaml }\n';
  const typen = (felder: string) =>
    `- schluessel: fahrzeug\n  name: Fahrzeug\n  felder:\n${felder}  register:\n    - { key: angaben, name: Angaben, art: felder, felder: [hu] }\n`;
  const lies = (felder: string) =>
    liesPaket(
      new Map([
        ['manifest.yaml', Buffer.from(MANIFEST)],
        ['mappentypen.yaml', Buffer.from(typen(felder))],
      ]),
    );
  const gruende = (e: unknown) =>
    (e instanceof Fachfehler ? ((e.details as { gruende?: string[] })?.gruende ?? [e.message]) : []).join(' | ');

  it('Lesen: genauigkeit monat am Datumsfeld; an anderen Feldarten oder mit unbekanntem Wert ein Fehler', () => {
    assert.equal(lies('    - { key: hu, label: Nächste HU, typ: datum, genauigkeit: monat }\n').typen[0].felder[0].genauigkeit, 'monat');
    assert.equal(
      lies('    - { key: hu, label: Nächste HU, typ: datum }\n').typen[0].felder[0].genauigkeit,
      undefined,
      'ältere Pakete wie bisher',
    );
    for (const f of ['{ key: hu, label: HU, typ: text, genauigkeit: monat }', '{ key: hu, label: HU, typ: datum, genauigkeit: jahr }'])
      assert.throws(
        () => lies(`    - ${f}\n`),
        (e) => /genauigkeit gibt es nur bei Datumsfeldern/.test(gruende(e)),
        f,
      );
  });

  it('Update: ein vorhandenes Datumsfeld bekommt die Genauigkeit Monat, sonst ändert sich nichts', () => {
    const paket = { felder: [{ key: 'hu', label: 'Nächste HU', typ: 'datum', genauigkeit: 'monat' }] } as never;
    assert.deepEqual(formatNeu(paket, { felder: [{ key: 'hu', label: 'Nächste HU', typ: 'datum' }] }), [
      { key: 'hu', label: 'Nächste HU', vorgaben: { genauigkeit: 'monat' } },
    ]);
    assert.deepEqual(formatNeu(paket, { felder: [{ key: 'hu', label: 'Nächste HU', typ: 'datum', genauigkeit: 'monat' }] }), []);
    assert.deepEqual(formatNeu(paket, { felder: [{ key: 'hu', label: 'Nächste HU', typ: 'text' }] }), []);
    const ohne = { felder: [{ key: 'hu', label: 'Nächste HU', typ: 'datum' }] } as never;
    assert.deepEqual(formatNeu(ohne, { felder: [{ key: 'hu', label: 'Nächste HU', typ: 'datum' }] }), []);
  });

  it('Paket erstellen nimmt die Genauigkeit mit und hebt die Mindestversion', async () => {
    assert.equal(mindestversion(['datumMonat']).version, DMS_DATUM_MONAT_AB);
    const d = dienst();
    const e = new Paketerstellung(d, { version: () => DMS_DATUM_MONAT_AB });
    const { typ } = await fahrzeuge(d);
    const angaben = (dms: string) => ({
      typen: [typ.id],
      sichten: [],
      beispiele: [],
      id: 'fahrzeuge_test',
      name: 'Fahrzeuge (Test)',
      version: '1.0.0',
      beschreibung: 'Fahrzeuge mit nächster HU.',
      autor: { name: 'Lena Muster', github: 'lena' },
      lizenz: 'MIT',
      dms,
      aenderungen: '',
    });
    const zuAlt = await e.pruefe(angaben('>=0.86.0'));
    assert.ok(
      zuAlt.probleme.some((p) => p.includes('Genauigkeit Monat') && p.includes(DMS_DATUM_MONAT_AB)),
      zuAlt.probleme.join(' | '),
    );
    const zip = await e.exportiere(angaben(`>=${DMS_DATUM_MONAT_AB}`), ICH);
    const yaml = parse(liesZip(zip.daten).get('fahrzeuge_test/inhalt/mappentypen.yaml')!.toString()) as Array<Pick<Mappentyp, 'felder'>>;
    assert.deepEqual(
      yaml[0].felder.filter((f) => f.typ === 'datum').map((f) => [f.key, f.genauigkeit ?? null]),
      [
        ['geprueft_am', null],
        ['naechste_hu', 'monat'],
      ],
    );
  });
});
