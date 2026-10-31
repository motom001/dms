/** Auswahlfilter am Referenzfeld (#172): Prüfung am Typ, Auswahl, strenge Prüfung neuer Werte, Hinweis bei alten. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bedingungsProblem, vorbelegungAus } from '../../shared/src/sichten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const partner = await d.legeTypAn({ name: 'Vertragspartner', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'art', label: 'Art', typ: 'auswahl', optionen: ['Arzt', 'Versicherung', 'Handwerker'] },
    { key: 'aktiv', label: 'Aktiv', typ: 'janein' },
  ] });
  const filter = [
    { art: 'feld', feld: 'art', op: 'einerVon', wert: { art: 'fest', wert: ['Arzt'] } },
    { art: 'feld', feld: 'aktiv', op: 'ja' },
  ];
  const bericht = await d.legeTypAn({ name: 'Arztbericht', felder: [
    { key: 'arzt', label: 'Arzt', typ: 'referenz', zielTyp: partner.id, auswahlFilter: filter },
    { key: 'kopie', label: 'Kopie an', typ: 'referenz', zielTyp: partner.id, mehrfach: true, auswahlFilter: filter },
  ] });
  const p = async (name: string, art: string, aktiv = true) => d.legeMappeAn({ typId: partner.id, werte: { name, art, aktiv } });
  return { d, partner, bericht, mueller: await p('Dr. Müller', 'Arzt'), meier: await p('Dr. Meier', 'Arzt'), alt: await p('Dr. Alt', 'Arzt', false), allianz: await p('Allianz', 'Versicherung') };
}

describe('Auswahlfilter am Referenzfeld (#172)', () => {
  it('Mappentyp: Filter wird gespeichert, unbekannte Felder werden gemeldet, nicht bei „jede Mappe“', async () => {
    const { d, partner, bericht } = await aufbau();
    assert.equal(bericht.felder[0].auswahlFilter?.length, 2);
    await assert.rejects(d.legeTypAn({ name: 'Falsch', felder: [{ key: 'x', label: 'X', typ: 'referenz', zielTyp: partner.id, auswahlFilter: [{ art: 'feld', feld: 'gibtsnicht', op: 'leer' }] }] }),
      (e) => e instanceof Fachfehler && JSON.stringify(e.details).includes('Auswahlfilter'));
    const dok = await d.legeTypAn({ name: 'Notiz', felder: [{ key: 'x', label: 'X', typ: 'text' }] });
    assert.equal(dok.felder[0].auswahlFilter, undefined);
    assert.deepEqual(await d.zaehleAuswahl({ zielTyp: partner.id, bedingungen: bericht.felder[0].auswahlFilter }, ICH.id), { passen: 2, gesamt: 4, probleme: [] });
  });

  it('Auswahl bietet nur passende Mappen an; Vorbelegung zum Anlegen', async () => {
    const { d, bericht, partner } = await aufbau();
    const s = await d.seite(ICH, { sicht: `feld:${bericht.id}:arzt` });
    assert.deepEqual(s.mappen.map((m) => m.titel).sort(), ['Dr. Meier', 'Dr. Müller']);
    const s2 = await d.seite(ICH, { sicht: `feld:${bericht.id}:arzt`, suche: 'Mei' });
    assert.deepEqual(s2.mappen.map((m) => m.titel), ['Dr. Meier']);
    await assert.rejects(d.seite(ICH, { sicht: `feld:${bericht.id}:gibtsnicht` }), status(404));
    assert.deepEqual(vorbelegungAus(bericht.felder[0].auswahlFilter!, partner), { art: 'Arzt', aktiv: true });
  });

  it('streng: neue und geänderte Werte müssen passen; bestehende bleiben mit Hinweis', async () => {
    const { d, bericht, partner, mueller, meier, allianz, alt } = await aufbau();
    await assert.rejects(d.legeMappeAn({ typId: bericht.id, werte: { arzt: allianz.id } }), (e) => e instanceof Fachfehler && e.status === 422 && JSON.stringify(e.details).includes('Allianz'));
    await assert.rejects(d.legeMappeAn({ typId: bericht.id, werte: { kopie: [mueller.id, alt.id] } }), status(422));
    const b = await d.legeMappeAn({ typId: bericht.id, werte: { arzt: mueller.id, kopie: [meier.id] } });
    // Dr. Müller passt später nicht mehr (Art geändert): bleibt gültig, mit Hinweis
    await d.aendereMappe(mueller.id, { werte: { ...mueller.werte, art: 'Handwerker' } });
    const det = await d.holeMappe(b.id);
    assert.deepEqual(det.unpassend, { arzt: [mueller.id] });
    await d.aendereMappe(b.id, { werte: { ...b.werte, kopie: [meier.id] } });
    // Neu hinzu muss passen
    await assert.rejects(d.aendereMappe(b.id, { werte: { ...b.werte, kopie: [meier.id, allianz.id] } }), status(422));
    // Wechsel auf eine andere unpassende geht nicht, zurück auf die alte unpassende auch nicht (sie ist dann neu)
    await assert.rejects(d.aendereMappe(b.id, { werte: { ...b.werte, arzt: allianz.id } }), status(422));
    // Filter geändert: bestehende Werte bleiben
    await d.aendereTyp(bericht.id, { ...bericht, felder: [{ ...bericht.felder[0], auswahlFilter: [{ art: 'feld', feld: 'art', op: 'einerVon', wert: { art: 'fest', wert: ['Versicherung'] } }] }, bericht.felder[1]] });
    const b2 = await d.aendereMappe(b.id, { werte: { ...b.werte } });
    assert.equal(b2.werte.arzt, mueller.id);
    assert.ok(partner);
  });
});

describe('Auswahlfilter mit Werten der eigenen Mappe (#173)', () => {
  async function aufbau2() {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const GEBIETE = ['Kardiologie', 'Orthopädie', 'Zahnmedizin'];
    const partner = await d.legeTypAn({ name: 'Arzt', titelVorlage: '{name}', felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true },
      { key: 'fach', label: 'Fachgebiet', typ: 'auswahl', optionen: GEBIETE },
    ] });
    const filter = [{ art: 'feld', feld: 'fach', op: 'einerVon', wert: { art: 'eigenesFeld', feld: 'gebiet' } }];
    const bericht = await d.legeTypAn({ name: 'Bericht', felder: [
      { key: 'gebiet', label: 'Fachgebiet', typ: 'auswahl', optionen: ['Kardiologie', 'Orthopädie'] },
      { key: 'arzt', label: 'Arzt', typ: 'referenz', zielTyp: partner.id, auswahlFilter: filter },
    ] });
    const a = (name: string, fach: string) => d.legeMappeAn({ typId: partner.id, werte: { name, fach } });
    return { d, partner, bericht, herz: await a('Dr. Herz', 'Kardiologie'), knie: await a('Dr. Knie', 'Orthopädie'), zahn: await a('Dr. Zahn', 'Zahnmedizin') };
  }

  it('Mappentyp: eigenes Feld muss existieren, passen und darf nicht das Referenzfeld selbst sein', async () => {
    const { d, partner } = await aufbau2();
    const probe = (felder: unknown[]) => d.legeTypAn({ name: `T${Math.random()}`, felder });
    const ref = (wert: unknown) => ({ key: 'arzt', label: 'Arzt', typ: 'referenz', zielTyp: partner.id, auswahlFilter: [{ art: 'feld', feld: 'fach', op: 'einerVon', wert }] });
    const meldet = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && re.test(JSON.stringify(e.details));
    await assert.rejects(probe([ref({ art: 'eigenesFeld', feld: 'fehlt' })]), meldet(/gibt es nicht/));
    await assert.rejects(probe([ref({ art: 'eigenesFeld', feld: 'arzt' })]), meldet(/eigene Referenzfeld/));
    await assert.rejects(probe([{ key: 'n', label: 'Nummer', typ: 'zahl' }, ref({ art: 'eigenesFeld', feld: 'n' })]), meldet(/passt nicht/));
    // Auswahl mit Werten, die es am Ziel nicht gibt
    await assert.rejects(probe([{ key: 'g', label: 'G', typ: 'auswahl', optionen: ['Kardiologie', 'Neurologie'] }, ref({ art: 'eigenesFeld', feld: 'g' })]), meldet(/passt nicht/));
    // In einer Sicht gibt es das nicht
    // In Sichten gibt es das nicht (die Bedingung hat ein Problem und wird ignoriert).
    assert.match(bedingungsProblem({ art: 'feld', feld: 'fach', op: 'einerVon', wert: { art: 'eigenesFeld', feld: 'x' } }, [partner])!, /nur im Auswahlfilter/);
  });

  it('Auswahl folgt dem eigenen Wert; leer = alle', async () => {
    const { d, bericht } = await aufbau2();
    const titel = async (eigene: unknown) => (await d.seite(ICH, { sicht: `feld:${bericht.id}:arzt`, eigene: JSON.stringify(eigene) })).mappen.map((m) => m.titel).sort();
    assert.deepEqual(await titel({ gebiet: 'Kardiologie' }), ['Dr. Herz']);
    assert.deepEqual(await titel({ gebiet: 'Orthopädie' }), ['Dr. Knie']);
    assert.deepEqual(await titel({}), ['Dr. Herz', 'Dr. Knie', 'Dr. Zahn']);
  });

  it('Server prüft mit den Werten, die gespeichert werden; Hinweis vor dem Speichern', async () => {
    const { d, bericht, herz, knie } = await aufbau2();
    await assert.rejects(d.legeMappeAn({ typId: bericht.id, werte: { gebiet: 'Kardiologie', arzt: knie.id } }), status(422));
    const b = await d.legeMappeAn({ typId: bericht.id, werte: { gebiet: 'Kardiologie', arzt: herz.id } });
    // Beide Felder im selben Zug geändert: passt
    const b2 = await d.aendereMappe(b.id, { werte: { gebiet: 'Orthopädie', arzt: knie.id } });
    assert.equal(b2.werte.arzt, knie.id);
    // Nur das Fachgebiet geändert: bestehender Arzt bleibt, Hinweis
    await d.aendereMappe(b.id, { werte: { gebiet: 'Kardiologie', arzt: knie.id } });
    assert.deepEqual((await d.holeMappe(b.id)).unpassend, { arzt: [knie.id] });
    assert.deepEqual(await d.auswahlPruefen({ typId: bericht.id, feldKey: 'arzt', ids: [knie.id, herz.id], werte: { gebiet: 'Kardiologie' } }, ICH.id), { unpassend: [knie.id] });
  });
});
