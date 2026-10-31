/** Ablageort (#168): im Standard vorhanden, nicht löschbar, verschachtelt mit Titelpfad, Verbleib in den Beispielen. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ladeBeispiele } from '../src/beispiele';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const neu = (repo = speicherRepo(), einstellungen = speicherEinstellungen()) => ({ d: new Dienst(repo, speicherDateien(), { einstellungen }), repo, einstellungen });

describe('Ablageort (#168)', () => {
  it('gibt es in jeder Installation, einmal, mit eigener Ansicht – auch nach einem Neustart', async () => {
    const { d, repo, einstellungen } = neu();
    const a = await d.ablageortTyp();
    assert.ok(a);
    assert.equal(a.name, 'Ablageort');
    assert.equal(a.schluessel, 'ablageort');
    assert.equal(a.system ?? null, null, 'kein Systemmappentyp');
    assert.deepEqual(a.register.map((r) => r.name), ['Allgemein', 'Enthält', 'Liegt hier', 'Fotos']);
    assert.ok((await d.listeSichten()).some((s) => s.id === a.id), 'eigene Ansicht');
    assert.deepEqual(await einstellungen.lies('ablageort'), { id: a.id });
    // Neuer Dienst auf denselben Daten (Neustart): kein zweiter Ablageort.
    const d2 = new Dienst(repo, speicherDateien(), { einstellungen });
    assert.equal((await d2.ablageortTyp())!.id, a.id);
    assert.equal((await d2.listeTypen()).filter((t) => t.schluessel?.startsWith('ablageort')).length, 1);
  });

  it('lässt sich erweitern und umbenennen, aber nicht löschen', async () => {
    const { d } = neu();
    const a = (await d.ablageortTyp())!;
    const umbenannt = await d.aendereTyp(a.id, { ...a, name: 'Wo liegt es?', felder: [...a.felder, { key: 'raum', label: 'Raum', typ: 'text' }] });
    assert.equal(umbenannt.name, 'Wo liegt es?');
    await assert.rejects(d.loescheTyp(a.id), (e) => e instanceof Fachfehler && e.status === 409 && /nicht löschen/.test(e.message));
    assert.equal((await d.ablageortTyp())!.name, 'Wo liegt es?');
  });

  it('zeigt den Pfad im Titel und zieht ihn beim Umzug nach – bis zu den Mappen darin', async () => {
    const { d } = neu();
    const a = (await d.ablageortTyp())!;
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

  it('übernimmt einen eigenen Mappentyp mit der Kennung „ablageort“ statt einen zweiten anzulegen', async () => {
    const repo = speicherRepo();
    const einstellungen = speicherEinstellungen();
    const vorher = new Dienst(repo, speicherDateien(), {});
    // Ohne Einstellungen (z. B. alter Stand): eigener Typ mit derselben Kennung.
    await vorher.sichereSystem();
    const eigen = (await vorher.ablageortTyp())!;
    const d = new Dienst(repo, speicherDateien(), { einstellungen });
    assert.equal((await d.ablageortTyp())!.id, eigen.id);
    assert.deepEqual(await einstellungen.lies('ablageort'), { id: eigen.id });
  });

  it('Beispiele: Verbleib in Vertrag und Rechnung, verschachtelte Orte, Ansicht „Originale nach Ort“', async () => {
    const { d } = neu();
    const a = (await d.ablageortTyp())!;
    await ladeBeispiele(d);
    const typen = await d.listeTypen();
    for (const name of ['Vertrag', 'Rechnung']) {
      const t = typen.find((x) => x.name === name)!;
      const f = t.felder.find((x) => x.key === 'verbleib_original');
      assert.ok(f, `${name} hat verbleib_original`);
      assert.equal(f.zielTyp, a.id);
    }
    assert.ok(!typen.find((x) => x.name === 'Vertragspartner')!.felder.some((f) => f.key === 'verbleib_original'));
    const orte = await d.listeMappen(a.id);
    assert.ok(orte.some((m) => m.titel === 'zu Hause › Arbeitszimmer Schrank › roter Ordner'));
    assert.ok(orte.some((m) => m.titel === 'vernichtet'));
    assert.ok((await d.listeSichten()).some((s) => s.name === 'Originale nach Ort'));
  });
});
