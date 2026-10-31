/** Auswahlfilter am Referenzfeld (#172): Prüfung am Typ, Auswahl, strenge Prüfung neuer Werte, Hinweis bei alten. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { vorbelegungAus } from '../../shared/src/sichten';
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
