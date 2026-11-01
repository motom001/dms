/**
 * Mappe mit allen verknüpften Mappen löschen (#424): Vorschau als Baum, Plan (Kreise, geteilte
 * Verweise, gesperrte Mappen, fehlende Rechte, große Bäume), ein Papierkorb-Vorgang und gemeinsames
 * Wiederherstellen samt entfernter Verweise. Arbeitsspeicher und – mit TEST_DATABASE_URL – PostgreSQL.
 * Erfundene Beispieldaten: ein Vertragspartner mit Verträgen und Rechnungen.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { Baum, BaumKnoten } from '../../shared/src/baum';
import { kennzeichen, liesLoeschAuswahl, loeschVorschlag, loeschZusammenfassung, planeLoeschung, type LoeschVorschau } from '../../shared/src/loeschbaum';
import { ALLES } from '../../shared/src/rechte';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { V1_TABELLE } from '../src/api-v1';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const H = '00000000-0000-4000-8000-000000000001';

/* ---------- Plan als reine Funktion ---------- */

const R = { C: true, R: true, U: true, D: true, P: true };
function knoten(id: string, x: Partial<BaumKnoten> = {}): BaumKnoten {
  return {
    id, typId: 't', typ: 'T', titel: id.toUpperCase(), ebene: 1, ueber: null, auchUeber: [], dokumente: 1,
    aussen: { verweistAuf: [], verwiesenVon: [], anzahl: { verweistAuf: 0, verwiesenVon: 0 } }, aufbewahrenBis: null, gesperrt: false, rechte: R, ...x,
  };
}
function vorschau(ks: BaumKnoten[], kanten: Array<[string, string]>, x: Partial<LoeschVorschau> = {}) {
  const baum: Baum = { startId: ks[0].id, optionen: { richtungen: ['verwiesenVon'], tiefe: 5, max: 1000, seitwaerts: false, ohneTypen: [], nurZugehoerigkeit: true }, knoten: ks, abgeschnitten: false, kreise: 0, verborgen: 0, tieferMoeglich: false };
  return { baum, kanten: kanten.map(([quelleId, zielId]) => ({ quelleId, feldKey: 'f', zielId })), geteilt: [], nichtLoeschbar: {}, ...x };
}

describe('Mit verknüpften Mappen löschen: Plan (#424)', () => {
  it('alles an: alles weg; Kreise halten nichts auf', () => {
    // p ← a ← b, a ↔ c (Kreis)
    const v = vorschau([knoten('p', { ebene: 0 }), knoten('a'), knoten('b'), knoten('c')], [['a', 'p'], ['b', 'a'], ['c', 'a'], ['a', 'c']]);
    const p = planeLoeschung(v, loeschVorschlag(v));
    assert.deepEqual(p.loeschen, ['p', 'a', 'b', 'c']);
    assert.equal(p.zahlen.dokumente, 4);
    assert.equal(loeschZusammenfassung(p, true), '4 Mappen und 4 Dokumente werden in den Papierkorb gelegt.');
  });

  it('🔒 gesperrt und ⛔ ohne Recht bleiben – und halten, worauf sie verweisen; Verweise darauf werden nie gekappt', () => {
    const v = vorschau([
      knoten('p', { ebene: 0 }), knoten('a'), knoten('b', { gesperrt: true, aufbewahrenBis: '2031-12-31' }), knoten('c'), knoten('d', { rechte: { ...R, D: false } }), knoten('e'),
    ], [['a', 'p'], ['b', 'a'], ['c', 'p'], ['d', 'c'], ['e', 'p']]);
    assert.equal(kennzeichen(v, v.baum.knoten[2]), 'gesperrt');
    assert.equal(kennzeichen(v, v.baum.knoten[4]), 'ohneRecht');
    // Auch wenn jemand „löschen“ verlangt: gesperrt und ohne Recht bleiben.
    const p = planeLoeschung(v, { p: 'loeschen', a: 'loeschen', b: 'loeschen', c: 'loeschen', d: 'loeschen', e: 'loeschen' });
    assert.deepEqual(p.loeschen, ['e']);
    assert.equal(p.bleibt.b.weil, 'frist');
    assert.match(p.bleibt.b.text, /31\.12\.2031/);
    assert.equal(p.bleibt.d.weil, 'recht');
    assert.equal(p.bleibt.a.weil, 'verweis');
    assert.match(p.bleibt.p.text, /verweist darauf und bleibt/);
    assert.deepEqual([p.zahlen.frist, p.zahlen.ohneRecht, p.zahlen.gehalten], [1, 1, 3]);
    assert.deepEqual(p.entkoppeln, []);
    assert.match(loeschZusammenfassung(p, true), /^1 Mappe und 1 Dokument werden in den Papierkorb gelegt; 1 bleibt wegen Aufbewahrungsfrist; 1 bleibt mangels Recht; 3 bleiben/);
  });

  it('🔗 geteilt: Vorgabe „nur Verweis entfernen“ (mit Recht zum Bearbeiten); wählbar „löschen“', () => {
    const v = vorschau([knoten('p', { ebene: 0 }), knoten('a'), knoten('r')], [['a', 'p'], ['r', 'a']], { geteilt: ['r'] });
    assert.equal(kennzeichen(v, v.baum.knoten[2]), 'geteilt');
    const vor = loeschVorschlag(v);
    assert.equal(vor.r, 'entkoppeln');
    const p = planeLoeschung(v, vor);
    assert.deepEqual(p.loeschen, ['p', 'a']);
    assert.deepEqual(p.entkoppeln, [{ quelleId: 'r', feldKey: 'f', zielId: 'a' }]);
    assert.equal(p.bleibt.r.weil, 'entkoppelt');
    assert.match(loeschZusammenfassung(p, true), /1 Verweis wird entfernt\.$/);
    assert.deepEqual(planeLoeschung(v, { ...vor, r: 'loeschen' }).loeschen, ['p', 'a', 'r']);
    // Ohne Recht zum Bearbeiten: nicht entkoppeln – dann hält r die Mappe a (und damit p).
    const ohneU = vorschau([knoten('p', { ebene: 0 }), knoten('a'), knoten('r', { rechte: { ...R, U: false } })], [['a', 'p'], ['r', 'a']], { geteilt: ['r'] });
    assert.equal(loeschVorschlag(ohneU).r, 'behalten');
    assert.deepEqual(planeLoeschung(ohneU, { p: 'loeschen', a: 'loeschen', r: 'entkoppeln' }).loeschen, []);
  });

  it('📎 nur über Bezug verbunden: nie gelöscht, auch „loeschen“ entfernt nur den Verweis; ohne Recht zum Bearbeiten hält sie', () => {
    const ueber = { vonId: 'p', richtung: 'verwiesenVon' as const, feldKey: 'ansprechpartner', feld: 'Ansprechpartner', verweisart: 'bezug' as const };
    const v = vorschau([knoten('p', { ebene: 0 }), knoten('a'), knoten('x', { nurBezug: true, ueber })], [['a', 'p'], ['x', 'p']]);
    assert.equal(kennzeichen(v, v.baum.knoten[2]), 'bezug');
    assert.equal(loeschVorschlag(v).x, 'entkoppeln');
    for (const wunsch of ['entkoppeln', 'loeschen'] as const) {
      const p = planeLoeschung(v, { p: 'loeschen', a: 'loeschen', x: wunsch });
      assert.deepEqual(p.loeschen, ['p', 'a']);
      assert.deepEqual(p.entkoppeln, [{ quelleId: 'x', feldKey: 'f', zielId: 'p' }]);
      assert.equal(p.bleibt.x.text, 'nur der Verweis „Ansprechpartner“ wird entfernt');
    }
    // abgewählt: Verweis bleibt → hält p
    assert.deepEqual(planeLoeschung(v, { p: 'loeschen', a: 'loeschen', x: 'behalten' }).loeschen, ['a']);
    const ohneU = vorschau([knoten('p', { ebene: 0 }), knoten('x', { nurBezug: true, ueber, rechte: { ...R, U: false } })], [['x', 'p']]);
    assert.equal(loeschVorschlag(ohneU).x, 'behalten');
    assert.equal(planeLoeschung(ohneU, { p: 'loeschen', x: 'loeschen' }).bleibt.p.weil, 'verweis');
    // 🔒 in der Frist: auch der Verweis bleibt (gesperrte Mappen werden nicht verändert)
    const frist = vorschau([knoten('p', { ebene: 0 }), knoten('x', { nurBezug: true, ueber, gesperrt: true, aufbewahrenBis: '2030-12-31' })], [['x', 'p']]);
    const pf = planeLoeschung(frist, loeschVorschlag(frist));
    assert.deepEqual(pf.loeschen, []);
    assert.match(pf.bleibt.x.text, /auch der Verweis bleibt/);
  });

  it('Verweise von außen halten; Fehlendes in der Auswahl bleibt; Unsinn in der Auswahl fällt weg', () => {
    const aussen = { verweistAuf: [], verwiesenVon: [], anzahl: { verweistAuf: 0, verwiesenVon: 2 } };
    const v = vorschau([knoten('p', { ebene: 0 }), knoten('a', { aussen }), knoten('b')], [['a', 'p'], ['b', 'p']]);
    const p = planeLoeschung(v, loeschVorschlag(v));
    assert.deepEqual(p.loeschen, ['b']);
    assert.equal(p.bleibt.a.weil, 'aussen');
    assert.deepEqual(planeLoeschung(v, { b: 'loeschen' }).loeschen, ['b'], 'p fehlt in der Auswahl → bleibt');
    assert.deepEqual(liesLoeschAuswahl({ a: 'loeschen', b: 'weg', c: 3 }), { a: 'loeschen' });
    assert.deepEqual(liesLoeschAuswahl(['a']), {});
  });
});

/* ---------- Dienst, Papierkorb und HTTP ---------- */

const offen: Array<{ end(): Promise<void> }> = [];
async function repos(pg: boolean): Promise<{ repo: Repo; konto: ReturnType<typeof speicherKontoRepo> }> {
  if (!pg) return { repo: speicherRepo(), konto: speicherKontoRepo() };
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_loesch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  return { repo: pgRepo(sql, H) as never, konto: pgKontoRepo(sql, H) as never };
}

async function aufbau(pg: boolean) {
  const r = await repos(pg);
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(r.konto, null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'verwalter@example.org', name: 'Vera Verwalter', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'mitglied' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const reg = [{ key: 'daten', name: 'Daten', art: 'felder' as const }, { key: 'dok', name: 'Unterlagen', art: 'dokumente' as const }];
  const kategorie = await d.legeTypAn({ name: 'Kategorie', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
  const partner = await d.legeTypAn({ name: 'Vertragspartner', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text', eindeutig: true }], register: reg });
  const vertrag = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text' }, { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: partner.id, verweisart: 'zugehoerigkeit' },
    { key: 'kategorie', label: 'Kategorie', typ: 'referenz', zielTyp: kategorie.id },
  ], register: reg });
  await d.aendereTyp(vertrag.id, { ...(await d.listeTypen()).find((t) => t.id === vertrag.id)!, felder: [...vertrag.felder, { key: 'bezug', label: 'Bezug', typ: 'referenz', zielTyp: vertrag.id, verweisart: 'zugehoerigkeit' }] });
  const rechnung = await d.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', archiv: { jahre: 2, stichtag: 'datum' }, felder: [
    { key: 'nr', label: 'Nummer', typ: 'text' }, { key: 'datum', label: 'Datum', typ: 'datum' },
    { key: 'vertrag', label: 'Verträge', typ: 'referenz', zielTyp: vertrag.id, mehrfach: true, verweisart: 'zugehoerigkeit' },
    // Bezug (Entscheidung Thomas zu #424): darüber wird nie mitgelöscht, nur der Verweis entfernt.
    { key: 'ansprechpartner', label: 'Ansprechpartner', typ: 'referenz', zielTyp: partner.id },
  ], register: reg });
  const lieferschein = await d.legeTypAn({ name: 'Lieferschein', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text' }, { key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTyp: rechnung.id, verweisart: 'zugehoerigkeit' },
  ], register: reg });
  const k = await d.legeMappeAn({ typId: kategorie.id, werte: { name: 'Strom' } }, admin.id);
  const p = await d.legeMappeAn({ typId: partner.id, werte: { name: 'Stadtwerke Beispiel' } }, admin.id);
  const q = await d.legeMappeAn({ typId: partner.id, werte: { name: 'Andere GmbH' } }, admin.id);
  const v1 = await d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'V-1', partner: p.id, kategorie: k.id } }, admin.id);
  // Kreis: V-2 bezieht sich auf V-1, V-1 auf V-2
  const v2 = await d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'V-2', partner: p.id, bezug: v1.id } }, admin.id);
  await d.aendereMappe(v1.id, { werte: { nr: 'V-1', partner: p.id, kategorie: k.id, bezug: v2.id } }, admin.id);
  const vx = await d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'X-1', partner: q.id } }, admin.id);
  const r1 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1', datum: '2015-03-01', vertrag: [v1.id] } }, admin.id);
  // geteilt: R-2 gehört auch zum Vertrag X-1 des anderen Partners
  const r2 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2', datum: '2016-05-01', vertrag: [v1.id, vx.id] } }, admin.id);
  await d.ladeHoch(v1.id, { register: 'dok', name: 'Vertrag.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 v1'), admin.id);
  await d.ladeHoch(r1.id, { register: 'dok', name: 'R-1.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 r1'), admin.id);
  const tabelle = routen(d, konten, {});
  const route = (m: string, pf: string) => tabelle.find((x) => x.methode === m && x.pfad === pf)!;
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const rufe = async (b: { id: string }, m: string, pf: string, x: Partial<Anfrage> = {}) => route(m, pf).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) } as Anfrage);
  return { d, admin, anna, typen: { kategorie, partner, vertrag, rechnung, lieferschein }, m: { k, p, q, v1, v2, vx, r1, r2 }, rufe };
}

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Mit verknüpften Mappen löschen (#424, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    after(async () => { for (const s of offen.splice(0)) await s.end(); });

    it('Vorschau, ein Papierkorb-Vorgang mit Kreis und geteilter Rechnung, gemeinsames Wiederherstellen samt Verweisen', async () => {
      const { d, admin, m, rufe } = await aufbau(pg);
      const v = (await rufe(admin, 'GET', '/api/mappen/:id/loeschvorschau', { params: { id: m.p.id } })).body as LoeschVorschau;
      const ids = v.baum.knoten.map((x) => x.id);
      assert.deepEqual(new Set(ids), new Set([m.p.id, m.v1.id, m.v2.id, m.r1.id, m.r2.id]), 'nur „nach unten“: Kategorie, X-1 und der andere Partner nicht');
      assert.deepEqual(v.geteilt, [m.r2.id], '🔗 nur die Rechnung, die auch zu X-1 gehört – nicht der Verweis auf die Kategorie');
      assert.equal(v.vorschlag[m.r2.id], 'entkoppeln');
      assert.ok(v.kanten.some((x) => x.quelleId === m.v1.id && x.zielId === m.v2.id) && v.kanten.some((x) => x.quelleId === m.v2.id && x.zielId === m.v1.id), 'Kreis in den Kanten');
      assert.equal(v.papierkorbTage, 30);
      await assert.rejects(rufe(admin, 'POST', '/api/mappen/:id/mit-verknuepften-loeschen', { params: { id: m.p.id }, body: {} }), status(422), 'ohne Auswahl nichts');

      const e = (await rufe(admin, 'POST', '/api/mappen/:id/mit-verknuepften-loeschen', { params: { id: m.p.id }, body: { auswahl: v.vorschlag } })).body as { vorgang: string; zahlen: { mappen: number; dokumente: number; verweise: number }; endgueltig: boolean };
      assert.equal(e.vorgang, m.p.id);
      assert.deepEqual([e.zahlen.mappen, e.zahlen.dokumente, e.zahlen.verweise, e.endgueltig], [4, 2, 1, false]);
      for (const x of [m.p, m.v1, m.v2, m.r1]) await assert.rejects(d.holeMappe(x.id), status(404));
      const r2 = (await d.holeMappe(m.r2.id)).mappe;
      assert.deepEqual(r2.werte.vertrag, [m.vx.id], 'nur der Verweis auf V-1 ist weg');
      const korb = (await d.papierkorb({ id: admin.id, rolle: 'admin' })).filter((x) => x.vorgang === m.p.id);
      assert.equal(korb.length, 4);
      assert.deepEqual(korb.find((x) => x.id === m.v1.id)!.entkoppelt, [{ quelleId: m.r2.id, feldKey: 'vertrag' }]);
      // Historie ohne Inhalte, mit Vorgang
      const h = (await d.historie(m.p.id)).find((x) => x.art === 'papierkorb')!;
      assert.equal(h.daten.vorgang, m.p.id);
      assert.match(String(h.daten.text), /4 Mappen, 2 Dokumente/);
      assert.ok(!JSON.stringify(h.daten).includes('Stadtwerke'));
      assert.ok((await d.historie(m.r2.id)).some((x) => x.art === 'geaendert' && JSON.stringify(x.daten).includes('vertrag')));

      // Gemeinsam wiederherstellen: Mappen, Dokumente, Verweise untereinander (Kreis) und der gekappte Verweis
      const w = (await rufe(admin, 'POST', '/api/papierkorb/vorgang/:id/wiederherstellen', { params: { id: m.p.id } })).body as { mappen: number; verweiseWieder: number; verweiseEntfallen: number };
      assert.deepEqual(w, { mappen: 4, verweiseWieder: 1, verweiseEntfallen: 0, startId: m.p.id } as never);
      assert.deepEqual((await d.holeMappe(m.r2.id)).mappe.werte.vertrag, [m.vx.id, m.v1.id]);
      const v1 = await d.holeMappe(m.v1.id);
      assert.equal(v1.dokumente.length, 1);
      assert.deepEqual(new Set(v1.rueckverweise.map((x) => x.quelleId)), new Set([m.v2.id, m.r1.id, m.r2.id]));
      assert.deepEqual(new Set((await d.holeMappe(m.p.id)).rueckverweise.map((x) => x.quelleId)), new Set([m.v1.id, m.v2.id]));
      assert.equal((await d.papierkorb({ id: admin.id, rolle: 'admin' })).length, 0);
      await assert.rejects(d.stelleVorgangWiederHer(m.p.id, { id: admin.id, rolle: 'admin' }), status(404));

      // Noch einmal löschen, dann nur V-1 einzeln zurück: der entfernte Verweis der Rechnung kommt mit.
      const z = await d.zugriff({ id: admin.id, rolle: 'admin' });
      await d.loescheMitVerknuepften(m.p.id, { auswahl: (await d.loeschVorschau(m.p.id, {}, z)).vorschlag }, admin.id, z);
      const einzeln = await d.stelleWiederHer(m.v1.id, { id: admin.id, rolle: 'admin' });
      assert.deepEqual((await d.holeMappe(m.r2.id)).mappe.werte.vertrag, [m.vx.id, m.v1.id]);
      assert.equal(einzeln.verweiseEntfallen, 2, 'Partner und V-2 liegen noch im Papierkorb');
      await assert.rejects(rufe({ id: admin.id }, 'POST', '/api/papierkorb/vorgang/:id/wiederherstellen', { params: { id: m.p.id } }).then(() => d.stelleVorgangWiederHer('00000000-0000-4000-8000-00000000ffff', { id: admin.id, rolle: 'admin' })), status(404));
      assert.equal((await d.papierkorb({ id: admin.id, rolle: 'admin' })).length, 0, 'der Rest des Vorgangs ist auch zurück');
    });

    it('🔒 Aufbewahrungsfrist: bleibt samt allem, worauf sie verweist; ohne Start eigene Vorgangs-Id', async () => {
      const { d, admin, m, typen } = await aufbau(pg);
      const z = await d.zugriff({ id: admin.id, rolle: 'admin' });
      const heute = new Date().toISOString().slice(0, 10);
      const r3 = await d.legeMappeAn({ typId: typen.rechnung.id, werte: { nr: 'R-3', datum: heute, vertrag: [m.v2.id] } }, admin.id);
      const v = await d.loeschVorschau(m.p.id, {}, z);
      const k3 = v.baum.knoten.find((x) => x.id === r3.id)!;
      assert.equal(kennzeichen(v, k3), 'gesperrt');
      const plan = planeLoeschung(v, { ...v.vorschlag, [r3.id]: 'loeschen' });
      // R-3 hält V-2, V-2 hält V-1 (Kreis) und den Partner; R-1 darf weg, R-2 bleibt unverändert
      assert.deepEqual(plan.loeschen, [m.r1.id]);
      assert.equal(plan.bleibt[r3.id].weil, 'frist');
      assert.equal(plan.bleibt[m.p.id].weil, 'verweis');
      const e = await d.loescheMitVerknuepften(m.p.id, { auswahl: { ...v.vorschlag, [r3.id]: 'loeschen' } }, admin.id, z);
      assert.deepEqual(e.loeschen, [m.r1.id]);
      assert.equal(e.vorgang.length, 36);
      assert.notEqual(e.vorgang, m.p.id, 'Start bleibt → eigene Vorgangs-Id');
      assert.ok(await d.holeMappe(r3.id));
      assert.ok(await d.holeMappe(m.p.id));

      // Nichts mehr zu löschen → 422
      await assert.rejects(d.loescheMitVerknuepften(m.p.id, { auswahl: { [r3.id]: 'loeschen' } }, admin.id, z), status(422));
    });

    it('nur innerhalb der Rechte: ⛔ kein Löschrecht hält; nicht Lesbares hält, ohne verraten zu werden; fremder Start 404', async () => {
      const { d, anna, admin, m, typen, rufe } = await aufbau(pg);
      // Anna darf Rechnungen nicht löschen
      await d.setzeBerechtigungen(typen.rechnung.id, { grund: { ...ALLES, D: false }, regeln: [] }, true);
      const za = await d.zugriff({ id: anna.id, rolle: 'mitglied' });
      const v = await d.loeschVorschau(m.p.id, {}, za);
      assert.equal(kennzeichen(v, v.baum.knoten.find((x) => x.id === m.r1.id)!), 'ohneRecht');
      const p = planeLoeschung(v, Object.fromEntries(v.baum.knoten.map((x) => [x.id, 'loeschen' as const])));
      assert.deepEqual(p.loeschen, [], 'R-1 hält V-1, der Kreis V-2 und den Partner');
      await assert.rejects(rufe(anna, 'POST', '/api/mappen/:id/mit-verknuepften-loeschen', { params: { id: m.p.id }, body: { auswahl: Object.fromEntries(v.baum.knoten.map((x) => [x.id, 'loeschen'])) } }), status(422));
      assert.ok(await d.holeMappe(m.r1.id));

      // Eine Mappe, die Anna nicht sehen darf, verweist auf V-2: V-2 bleibt
      await d.setzeBerechtigungen(typen.rechnung.id, { grund: ALLES, regeln: [] }, true);
      const geheim = await d.legeTypAn({ name: 'Geheim', titelVorlage: '{t}', felder: [{ key: 't', label: 'T', typ: 'text' }, { key: 'vertrag', label: 'Vertrag', typ: 'referenz', zielTyp: typen.vertrag.id }] });
      await d.setzeBerechtigungen(geheim.id, { grund: { ...ALLES, R: false }, regeln: [] }, true);
      await d.legeMappeAn({ typId: geheim.id, werte: { t: 'intern', vertrag: m.v2.id } }, admin.id);
      const v2 = await d.loeschVorschau(m.p.id, {}, await d.zugriff({ id: anna.id, rolle: 'mitglied' }));
      assert.equal(v2.baum.verborgen, 1);
      const p2 = planeLoeschung(v2, v2.vorschlag);
      assert.equal(p2.bleibt[m.v2.id].weil, 'aussen');
      assert.ok(!JSON.stringify(v2).includes('intern'));
      assert.deepEqual(new Set(p2.loeschen), new Set([m.r1.id]), 'V-2 hält V-1 (Kreis) und den Partner');

      // Start nicht lesbar: 404
      await d.setzeBerechtigungen(typen.partner.id, { grund: { ...ALLES, R: false }, regeln: [] }, true);
      await assert.rejects(d.loeschVorschau(m.p.id, {}, await d.zugriff({ id: anna.id, rolle: 'mitglied' })), status(404));
    });

    it('große Bäume: Obergrenze schneidet ab, Abgeschnittenes hält; ohne Papierkorb sofort endgültig', async () => {
      const { d, admin, m, typen } = await aufbau(pg);
      const z = await d.zugriff({ id: admin.id, rolle: 'admin' });
      const viele = pg ? 30 : 520;
      for (let i = 0; i < viele; i++) await d.legeMappeAn({ typId: typen.rechnung.id, werte: { nr: `M-${i}`, datum: '2010-01-01', vertrag: [m.v2.id] } }, admin.id);
      const ganz = await d.loeschVorschau(m.p.id, { max: 5000 }, z);
      assert.equal(ganz.baum.knoten.length, viele + 5);
      assert.equal(planeLoeschung(ganz, ganz.vorschlag).loeschen.length, viele + 4, 'alle bis auf die geteilte Rechnung');
      const knapp = await d.loeschVorschau(m.p.id, { max: 10 }, z);
      assert.equal(knapp.baum.abgeschnitten, true);
      const pk = planeLoeschung(knapp, knapp.vorschlag);
      assert.ok(!pk.loeschen.includes(m.v2.id), 'V-2 hat Rechnungen außerhalb der Obergrenze → bleibt');
      assert.equal(pk.bleibt[m.v2.id].weil, 'aussen');

      await d.setzePapierkorbTage(0);
      const e = await d.loescheMitVerknuepften(m.p.id, { max: 5000, auswahl: ganz.vorschlag }, admin.id, z);
      assert.equal(e.endgueltig, true);
      assert.equal(e.zahlen.mappen, viele + 4);
      assert.equal((await d.papierkorb({ id: admin.id, rolle: 'admin' }, true)).length, 0, 'nichts im Papierkorb');
      assert.deepEqual((await d.holeMappe(m.r2.id)).mappe.werte.vertrag, [m.vx.id]);
    });

    it('nur nach unten und nur über Zugehörigkeit: Bezug-Mappe bleibt (nur Verweis weg), über sie nichts weiter; nie nach oben', async () => {
      const { d, admin, m, typen } = await aufbau(pg);
      const z = await d.zugriff({ id: admin.id, rolle: 'admin' });
      // R-9 gehört zum Vertrag X-1 des anderen Partners, nennt die Stadtwerke aber als Ansprechpartner (Bezug).
      const r9 = await d.legeMappeAn({ typId: typen.rechnung.id, werte: { nr: 'R-9', datum: '2014-01-01', vertrag: [m.vx.id], ansprechpartner: m.p.id } }, admin.id);
      const l9 = await d.legeMappeAn({ typId: typen.lieferschein.id, werte: { nr: 'L-9', rechnung: r9.id } }, admin.id);
      // R-1 nennt die Stadtwerke auch als Ansprechpartner – gehört aber über V-1 dazu: wird gelöscht.
      await d.aendereMappe(m.r1.id, { werte: { nr: 'R-1', datum: '2015-03-01', vertrag: [m.v1.id], ansprechpartner: m.p.id } }, admin.id);
      // Lieferschein zu R-1: geht mit; sein Weg nach oben wird nicht verfolgt.
      const l1 = await d.legeMappeAn({ typId: typen.lieferschein.id, werte: { nr: 'L-1', rechnung: m.r1.id } }, admin.id);
      const v = await d.loeschVorschau(m.p.id, {}, z);
      const k9 = v.baum.knoten.find((x) => x.id === r9.id)!;
      assert.equal(k9.nurBezug, true);
      assert.equal(k9.ueber?.verweisart, 'bezug');
      assert.equal(k9.ueber?.feld, 'Ansprechpartner');
      assert.equal(kennzeichen(v, k9), 'bezug');
      assert.ok(!v.baum.knoten.some((x) => x.id === l9.id), 'über die Bezug-Mappe wird nicht weitergesammelt');
      assert.ok(!v.baum.knoten.some((x) => x.id === m.vx.id || x.id === m.q.id || x.id === m.k.id), 'nie nach oben oder seitwärts');
      const k1 = v.baum.knoten.find((x) => x.id === m.r1.id)!;
      assert.ok(!k1.nurBezug, 'über Zugehörigkeit erreicht – zählt als zugehörig');
      assert.equal(k1.ueber?.vonId, m.v1.id);
      assert.equal(k1.ueber?.verweisart, 'zugehoerigkeit');
      assert.ok(v.baum.knoten.some((x) => x.id === l1.id && x.ueber?.vonId === m.r1.id));
      assert.equal(v.vorschlag[r9.id], 'entkoppeln');
      assert.ok(!v.geteilt.includes(r9.id));

      const e = await d.loescheMitVerknuepften(m.p.id, { auswahl: { ...v.vorschlag, [r9.id]: 'loeschen' } }, admin.id, z);
      assert.ok(e.loeschen.includes(m.r1.id) && e.loeschen.includes(l1.id));
      assert.ok(!e.loeschen.includes(r9.id));
      const nachher = (await d.holeMappe(r9.id)).mappe;
      assert.equal(nachher.werte.ansprechpartner, undefined, 'nur der Verweis ist weg');
      assert.deepEqual(nachher.werte.vertrag, [m.vx.id]);
      assert.ok(await d.holeMappe(l9.id));
      // Wiederherstellen setzt auch den Bezug-Verweis wieder
      await d.stelleVorgangWiederHer(e.vorgang, { id: admin.id, rolle: 'admin' });
      assert.equal((await d.holeMappe(r9.id)).mappe.werte.ansprechpartner, m.p.id);
    });

    it('API v1: Vorschau, Ausführen und Wiederherstellen des Vorgangs sind beschrieben', () => {
      for (const p of ['/mappen/{id}/loeschvorschau', '/mappen/{id}/mit-verknuepften-loeschen', '/papierkorb/vorgang/{id}/wiederherstellen']) assert.ok(V1_TABELLE.some((x) => x.pfad === p), p);
    });
  });
}
