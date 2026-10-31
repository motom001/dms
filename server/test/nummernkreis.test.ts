/** Nummernkreise (#171): Muster, Zeiträume, Vergabe beim Anlegen, Schreibschutz, Wartung. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { datumIn, formatiereNummer, naechste, neubeginn, pruefeMuster, ziehe, zeitraumVon, type Nummernkreis } from '../../shared/src/nummernkreis';
import { geschuetzteFelder } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const okt = { jahr: 2026, monat: 10, tag: 31 };

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  await d.speichereNummernkreis({ neu: true, schluessel: 'rechnung', name: 'Rechnungsnummern', muster: '{jjjj}{mm}-R{zaehler:7}', start: 1 }, 'test');
  const t = await d.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Rechnungsnummer', typ: 'text', standard: '{nummernkreis:rechnung}', pflicht: true, eindeutig: true },
    { key: 'betreff', label: 'Betreff', typ: 'text', pflicht: true },
  ] });
  return { d, t };
}

describe('Nummernkreise (#171)', () => {
  it('Muster, Zeiträume, Formatierung', () => {
    assert.equal(formatiereNummer('{jjjj}{mm}-R{zaehler:7}', 0, okt), '202610-R0000000');
    assert.equal(formatiereNummer('{jj}/{tt}.{mm} #{zaehler}', 42, okt), '26/31.10 #42');
    assert.equal(neubeginn('{jjjj}{mm}-{zaehler}'), 'monatlich');
    assert.equal(neubeginn('{tt}{zaehler}'), 'taeglich');
    assert.equal(neubeginn('{jj}-{zaehler}'), 'jaehrlich');
    assert.equal(neubeginn('K-{zaehler:5}'), 'nie');
    assert.equal(zeitraumVon('{jjjj}{mm}{zaehler}', okt), '2026-10');
    assert.equal(zeitraumVon('{zaehler}', okt), 'immer');
    assert.equal(pruefeMuster('{jjjj}{mm}-R{zaehler:7}'), null);
    assert.match(pruefeMuster('{jjjj}-R')!, /genau einen/);
    assert.match(pruefeMuster('{zaehler}{zaehler}')!, /genau einen/);
    assert.match(pruefeMuster('{jahr}{zaehler}')!, /Unbekannter Platzhalter/);
    assert.match(pruefeMuster('{zaehler:0}')!, /Stellenzahl/);
    // Berlin: Silvester 23:30 UTC ist schon Neujahr
    assert.deepEqual(datumIn(new Date('2026-12-31T23:30:00Z')), { jahr: 2027, monat: 1, tag: 1 });
  });

  it('beginnt je Zeitraum neu', () => {
    let k: Nummernkreis = { schluessel: 'r', name: 'R', muster: '{jjjj}{mm}-{zaehler:3}', start: 1, staende: {}, zuletzt: [] };
    const nr = (d: typeof okt) => { const r = ziehe(k, d, null, ''); k = r.kreis; return r.nummer; };
    assert.equal(nr(okt), '202610-001');
    assert.equal(nr(okt), '202610-002');
    assert.equal(nr({ jahr: 2026, monat: 11, tag: 1 }), '202611-001');
    assert.equal(nr(okt), '202610-003');
    assert.equal(k.zuletzt[0].nummer, '202610-003');
    assert.equal(naechste(k, { jahr: 2026, monat: 11, tag: 2 }).nummer, '202611-002');
  });

  it('vergibt beim Anlegen, schreibgeschützt, keine Lücke bei Fehlern, keine doppelten Nummern', async () => {
    const { d, t } = await aufbau();
    // Eingabe zählt nicht
    const a = await d.legeMappeAn({ typId: t.id, werte: { nr: 'eigene', betreff: 'A' } });
    assert.match(String(a.werte.nr), /^\d{6}-R0000001$/);
    assert.equal(a.titel, a.werte.nr);
    // Pflichtfehler in einem anderen Feld: keine Nummer verbraucht
    await assert.rejects(d.legeMappeAn({ typId: t.id, werte: {} }), status(422));
    const b = await d.legeMappeAn({ typId: t.id, werte: { betreff: 'B' } });
    assert.match(String(b.werte.nr), /-R0000002$/);
    // Gleichzeitig
    const viele = await Promise.all(Array.from({ length: 25 }, (_, i) => d.legeMappeAn({ typId: t.id, werte: { betreff: `x${i}` } })));
    assert.equal(new Set(viele.map((m) => m.werte.nr)).size, 25);
    // Ändern abgelehnt, sonst speichern ok
    await assert.rejects(d.aendereMappe(a.id, { werte: { ...a.werte, nr: '1' } }), status(403));
    const a2 = await d.aendereMappe(a.id, { werte: { ...a.werte, betreff: 'A2' } });
    assert.equal(a2.werte.nr, a.werte.nr);
    assert.ok(geschuetzteFelder(t, a).nr);
    assert.match(geschuetzteFelder(t).nr, /beim Speichern/);
    // Übersicht
    const [k] = await d.listeNummernkreise();
    assert.equal(k.verwendet[0].feld, 'Rechnungsnummer');
    assert.match(k.naechste, /-R0000028$/);
    assert.equal(k.zuletzt.length, 10);
  });

  it('Mappentyp: nur Textfeld, Kreis muss existieren; Löschen nur unbenutzt; Zählerstand setzen', async () => {
    const { d, t } = await aufbau();
    await assert.rejects(d.legeTypAn({ name: 'X', felder: [{ key: 'n', label: 'N', typ: 'text', standard: '{nummernkreis:gibtsnicht}' }] }), status(422));
    await assert.rejects(d.legeTypAn({ name: 'Y', felder: [{ key: 'n', label: 'N', typ: 'zahl', standard: '{nummernkreis:rechnung}' }] }), status(422));
    await assert.rejects(d.loescheNummernkreis('rechnung', 'test'), /Rechnung · Rechnungsnummer/);
    await assert.rejects(d.speichereNummernkreis({ neu: true, schluessel: 'rechnung', name: 'Doppelt', muster: '{zaehler}' }, 't'), status(409));
    await assert.rejects(d.speichereNummernkreis({ neu: true, schluessel: 'Falsch!', name: 'x', muster: '{zaehler}' }, 't'), status(422));
    await d.setzeZaehler('rechnung', { naechster: 500 }, 'test');
    const m = await d.legeMappeAn({ typId: t.id, werte: { betreff: 'Umstieg' } });
    assert.match(String(m.werte.nr), /-R0000500$/);
    await d.speichereNummernkreis({ neu: true, schluessel: 'frei', name: 'Frei', muster: 'F{zaehler}', start: 0 }, 't');
    await d.loescheNummernkreis('frei', 'test');
    assert.equal((await d.listeNummernkreise()).length, 1);
  });

  it('Wartung: Nummern nachträglich vergeben, in der Reihenfolge des Anlegens', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const t = await d.legeTypAn({ name: 'Vertrag', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }, { key: 'name', label: 'Name', typ: 'text' }] });
    const alt = [];
    for (const n of ['a', 'b', 'c']) { alt.push(await d.legeMappeAn({ typId: t.id, werte: { name: n } })); await new Promise((r) => setTimeout(r, 2)); }
    await d.speichereNummernkreis({ neu: true, schluessel: 'vertrag', name: 'Verträge', muster: 'V-{zaehler:3}', start: 1 }, 't');
    await d.aendereTyp(t.id, { ...t, felder: [{ key: 'nr', label: 'Nr', typ: 'text', standard: '{nummernkreis:vertrag}' }, { key: 'name', label: 'Name', typ: 'text' }] });
    assert.deepEqual(await d.nummernVorschau(t.id, 'nr'), { anzahl: 3, von: 'V-001', bis: 'V-003' });
    await assert.rejects(d.nummernVorschau(t.id, 'name'), status(422));
    d.nummernNachtragen(t.id, 'nr', 'test');
    const a = await d.auftraege.warte();
    assert.deepEqual(a?.ergebnis, { vergeben: 3, erste: 'V-001', letzte: 'V-003' });
    assert.deepEqual(await Promise.all(alt.map(async (m) => (await d.holeMappe(m.id)).mappe.werte.nr)), ['V-001', 'V-002', 'V-003']);
    assert.deepEqual(await d.nummernVorschau(t.id, 'nr'), { anzahl: 0, von: null, bis: null });
  });
});
