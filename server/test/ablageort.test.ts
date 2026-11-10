/**
 * Ablageort (#168, #883): Seit #883 legt der Kern keinen Ablageort mehr an – er kommt mit dem Paket Basis. Ältere Ablagen
 * behalten ihren früheren Ablageort (verschachtelt mit Titelpfad, Verbleib in den Beispielen), bis Basis ihn übernimmt
 * (Übernahme: pakete.test.ts).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ladeBeispiele } from '../src/beispiele';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import { frueherAblageort } from './hilfen';

const neu = (repo = speicherRepo(), einstellungen = speicherEinstellungen()) => ({ d: new Dienst(repo, speicherDateien(), { einstellungen }), repo, einstellungen });

describe('Ablageort (#883): nicht mehr im Kern', () => {
  it('eine neue Ablage bringt nur Systemtypen mit – keinen Ablageort', async () => {
    const { d, einstellungen } = neu();
    await d.sichereSystem();
    assert.equal(await d.ablageortTyp(), undefined);
    assert.deepEqual((await d.listeTypen()).filter((t) => !t.system).map((t) => t.name), []);
    assert.equal(await einstellungen.lies('ablageort'), null);
  });

  it('Beispiel-Mappen kommen ohne Ablageort aus: kein Verbleib, keine Orte, keine Ansicht „Originale nach Ort“', async () => {
    const { d } = neu();
    await ladeBeispiele(d);
    const typen = await d.listeTypen();
    assert.deepEqual(typen.filter((t) => !t.system).map((t) => t.name).sort(), ['Rechnung', 'Vertrag', 'Vertragspartner', 'Zahlung']);
    assert.ok(!typen.some((t) => t.felder.some((f) => f.key === 'verbleib_original')));
    assert.ok(!(await d.listeSichten()).some((s) => s.name === 'Originale nach Ort'));
  });
});

describe('Ablageort (#168): der frühere aus einer älteren Ablage', () => {
  it('wird gefunden – auch nach einem Neustart – und lässt sich wie jeder Mappentyp löschen', async () => {
    const { d, repo, einstellungen } = neu();
    const a = await frueherAblageort(d, einstellungen);
    assert.equal((await d.ablageortTyp())!.id, a.id);
    assert.equal((await d.frueherAblageortTyp())!.id, a.id);
    const d2 = new Dienst(repo, speicherDateien(), { einstellungen });
    assert.equal((await d2.ablageortTyp())!.id, a.id, 'kein zweiter, keiner neu');
    assert.equal((await d2.listeTypen()).filter((t) => t.schluessel?.startsWith('ablageort')).length, 1);
    // Nicht mehr „Standard“: ohne Mappen und Verweise löschbar.
    await d2.loescheTyp(a.id);
    assert.equal(await d2.ablageortTyp(), undefined);
  });

  it('ohne Einstellungen (z. B. alter Stand): über die Kennung „ablageort“', async () => {
    const repo = speicherRepo();
    const vorher = new Dienst(repo, speicherDateien(), {});
    const a = await frueherAblageort(vorher);
    assert.equal((await new Dienst(repo, speicherDateien(), {}).ablageortTyp())!.id, a.id);
    // Mit Einstellungen zählt nur die gemerkte Id – ein eigener Typ mit der Kennung wird nicht zum Ablageort.
    assert.equal(await new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() }).ablageortTyp(), undefined);
  });

  it('zeigt den Pfad im Titel und zieht ihn beim Umzug nach – bis zu den Mappen darin', async () => {
    const { d, einstellungen } = neu();
    const a = await frueherAblageort(d, einstellungen);
    const ort = async (name: string, liegtIn?: string) => (await d.legeMappeAn({ typId: a.id, werte: { name, ...(liegtIn ? { liegt_in: liegtIn } : {}) } })).id;
    const haus = await ort('zu Hause');
    const schrank = await ort('Arbeitszimmer Schrank', haus);
    const ordner = await ort('roter Ordner', schrank);
    const titel = async (id: string) => (await d.holeMappe(id)).mappe.titel;
    assert.equal(await titel(haus), 'zu Hause', 'ganz oben ohne Trenner');
    assert.equal(await titel(ordner), 'zu Hause › Arbeitszimmer Schrank › roter Ordner');
    const vertrag = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{bezeichnung} ({verbleib_original})', felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true },
      { key: 'verbleib_original', label: 'Verbleib Originaldokumente', typ: 'referenz', zielTyp: a.id, verweisart: 'bezug' },
    ] });
    const v = await d.legeMappeAn({ typId: vertrag.id, werte: { bezeichnung: 'Strom', verbleib_original: ordner } });
    assert.equal(await titel(v.id), 'Strom (zu Hause › Arbeitszimmer Schrank › roter Ordner)');
    // Umzug: Der Schrank steht jetzt im Wohnzimmer – nur „Liegt in“ am Schrank ändert sich.
    const wohnzimmer = await ort('Wohnzimmer', haus);
    const s = (await d.holeMappe(schrank)).mappe;
    await d.aendereMappe(schrank, { werte: { ...s.werte, liegt_in: wohnzimmer } });
    assert.equal(await titel(ordner), 'zu Hause › Wohnzimmer › Arbeitszimmer Schrank › roter Ordner');
    assert.equal(await titel(v.id), 'Strom (zu Hause › Wohnzimmer › Arbeitszimmer Schrank › roter Ordner)');
  });

  it('Beispiele: Verbleib in Vertrag und Rechnung, verschachtelte Orte, Ansicht „Originale nach Ort“', async () => {
    const { d, einstellungen } = neu();
    const a = await frueherAblageort(d, einstellungen);
    await ladeBeispiele(d);
    const typen = await d.listeTypen();
    for (const name of ['Vertrag', 'Rechnung']) {
      const t = typen.find((x) => x.name === name)!;
      const f = t.felder.find((x) => x.key === 'verbleib_original');
      assert.ok(f, `${name} hat verbleib_original`);
      assert.equal(f.zielTypen?.[0], a.id);
    }
    assert.ok(!typen.find((x) => x.name === 'Vertragspartner')!.felder.some((f) => f.key === 'verbleib_original'));
    const orte = await d.listeMappen(a.id);
    assert.ok(orte.some((m) => m.titel === 'zu Hause › Arbeitszimmer Schrank › roter Ordner'));
    assert.ok(orte.some((m) => m.titel === 'vernichtet'));
    assert.ok((await d.listeSichten()).some((s) => s.name === 'Originale nach Ort'));
  });
});
