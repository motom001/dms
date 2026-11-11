/**
 * Verweisfeld auf mehrere Mappentypen (#1036): Datenmodell (alt lesen, neu schreiben), Prüfung beim Speichern
 * (Zieltypen, „alle vom selben Typ“), Rechte-Regeln „zeigt auf Mappe vom Typ …“ im Zweifel geschlossen, „(nicht
 * sichtbar)“ ohne Typ, Bedingungen und erweiterte Suche, Pakete mit Liste und `zielOptional`.
 * Der Kern läuft im Arbeitsspeicher und – mit TEST_DATABASE_URL – gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { abfrageAus, alsParameter, liesSuche } from '../../shared/src/erweitertesuche';
import { normalisiereZiele, pruefeMappe, zielErlaubt, zieleVon, type Feld, type Mappentyp } from '../../shared/src/model';
import { ALLES, NICHTS, rechteAn, type Regel, type Regelwerk } from '../../shared/src/rechte';
import { bedingungsProblem, erfuellt, filterFuer } from '../../shared/src/sichten';
import { typBild, typUnterschiede } from '../../shared/src/typvergleich';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { aenderung } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { zipPuffer } from '../src/zip';
import { imModus, wieImModus } from './hilfen';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const status = (s: number, re?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s
  && (!re || [e.message, ...Object.values((e.details as { felder?: Record<string, string[]> })?.felder ?? {}).flat()].some((x) => re.test(x)));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
const offen: any[] = [];
after(async () => { for (const s of offen) await s.end(); });

async function pgRepos(name: string): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const { sql } = await eigeneDatenbank(name);
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

describe('Ziele eines Verweisfelds (#1036): Modell', () => {
  it('alte Form lesen, neue schreiben; „*“ allein; Ziele prüfen', () => {
    assert.deepEqual(normalisiereZiele({ key: 'a', label: 'A', typ: 'referenz', zielTyp: 't1' } as Feld & { zielTyp: string }), { key: 'a', label: 'A', typ: 'referenz', zielTypen: ['t1'] });
    assert.deepEqual(normalisiereZiele({ key: 'b', label: 'B', typ: 'text', zielTyp: '' } as Feld & { zielTyp: string }), { key: 'b', label: 'B', typ: 'text' });
    const neu = { key: 'c', label: 'C', typ: 'referenz', zielTypen: ['t1', 't2'] } as Feld;
    assert.equal(normalisiereZiele(neu), neu, 'neue Form bleibt, wie sie ist');
    assert.deepEqual(zieleVon({ zielTypen: ['*'] }), []);
    assert.equal(zielErlaubt({ zielTypen: ['*'] }, 'x'), true);
    assert.equal(zielErlaubt({ zielTypen: ['t1', 't2'] }, 't2'), true);
    assert.equal(zielErlaubt({ zielTypen: ['t1', 't2'] }, 't3'), false);
  });

  it('Werte: jede Mappe von einem der Zieltypen; „alle vom selben Typ“', () => {
    const typ = { felder: [{ key: 'betrifft', label: 'betrifft', typ: 'referenz', mehrfach: true, gleicherTyp: true, zielTypen: ['fz', 'wo'] }] } as unknown as Mappentyp;
    const typVon = (id: string) => ({ auto: 'fz', rad: 'fz', haus: 'wo', vertrag: 'vt' } as Record<string, string>)[id];
    const p = (werte: Record<string, unknown>) => pruefeMappe(typ, werte as never, { typVon, doppelt: () => undefined }).felder.betrifft?.[0];
    assert.equal(p({ betrifft: ['auto', 'rad'] }), undefined);
    assert.match(p({ betrifft: ['auto', 'haus'] })!, /selben Mappentyp/);
    assert.match(p({ betrifft: ['vertrag'] })!, /anderen Mappentyps/);
  });

  it('Bedingung „zeigt auf Mappe vom Typ …“: nur bei mehreren Zieltypen, nur ihre Typen; im Arbeitsspeicher über typVon', () => {
    const typ = { id: 'r', felder: [
      { key: 'betrifft', label: 'betrifft', typ: 'referenz', mehrfach: true, zielTypen: ['fz', 'wo'] },
      { key: 'vertrag', label: 'Vertrag', typ: 'referenz', zielTypen: ['vt'] },
    ], register: [] } as unknown as Mappentyp;
    const b = (feld: string, wert: string[]) => ({ art: 'feld' as const, feld, op: 'zeigtAufTyp' as const, wert: { art: 'fest' as const, wert } });
    assert.equal(bedingungsProblem(b('betrifft', ['fz']), [typ]), null);
    assert.match(bedingungsProblem(b('betrifft', ['vt']), [typ])!, /zeigt nicht auf Mappen dieses Typs/);
    assert.match(bedingungsProblem(b('vertrag', ['vt']), [typ])!, /passt nicht/);
    const f = filterFuer({ bedingungen: [b('betrifft', ['fz'])] }, [typ], { heute: '2026-11-10', ich: '', meineRollen: [] });
    const z = { dokumente: () => 0, verknuepfungen: () => 0, typVon: (id: string) => ({ auto: 'fz', haus: 'wo' } as Record<string, string>)[id] };
    const m = (betrifft: string[]) => ({ id: 'm', typId: 'r', werte: { betrifft }, erstellt: '', geaendert: '' }) as never;
    assert.equal(erfuellt(m(['haus', 'auto']), f, z), true);
    assert.equal(erfuellt(m(['haus']), f, z), false);
    assert.equal(erfuellt(m(['unbekannt']), f, z), false, 'unbekannter Typ trifft nicht zu');
  });

  it('erweiterte Suche: „feld.typ=…“ in der Adresse wird zur Bedingung', () => {
    const typen = [
      { id: 'fz', name: 'Fahrzeug', schluessel: 'fahrzeuge:fahrzeug', felder: [], register: [] },
      { id: 'wo', name: 'Wohnung', schluessel: 'wohnung', felder: [], register: [] },
      { id: 'r', name: 'Rechnung', schluessel: 'rechnung', felder: [{ key: 'betrifft', label: 'betrifft', typ: 'referenz', mehrfach: true, zielTypen: ['fz', 'wo'] }], register: [] },
    ] as unknown as Mappentyp[];
    const f = liesSuche(new URLSearchParams('typ=rechnung&betrifft.typ=fahrzeuge:fahrzeug'));
    assert.deepEqual(f.felder.betrifft.typen, ['fahrzeuge:fahrzeug']);
    assert.equal(alsParameter(f).toString(), 'typ=rechnung&betrifft.typ=fahrzeuge%3Afahrzeug');
    const a = abfrageAus(f, typen);
    assert.deepEqual(a.fehler, []);
    assert.deepEqual(a.bedingungen, [{ art: 'feld', feld: 'betrifft', op: 'zeigtAufTyp', wert: { art: 'fest', wert: ['fz'] } }]);
  });

  it('Paketstand: optionale Ziele, die später dazukommen, sind keine eigene Änderung', () => {
    const alt = { id: 'r', name: 'R', beschreibung: '', titelVorlage: '', register: [], felder: [{ key: 'betrifft', label: 'b', typ: 'referenz', zielTypen: ['vt'], zielOptional: ['fahrzeuge:fahrzeug'] }] } as unknown as Mappentyp;
    const neu = { ...alt, felder: [{ ...alt.felder[0], zielTypen: ['vt', 'fz'] }] } as Mappentyp;
    const kennung = (id: string) => (id === 'fz' ? 'fahrzeuge:fahrzeug' : undefined);
    assert.equal(typUnterschiede(typBild(alt, kennung), typBild(neu, kennung)), null);
    assert.notEqual(typUnterschiede(typBild(alt), typBild({ ...alt, felder: [{ ...alt.felder[0], zielTypen: ['vt', 'x'] }] } as Mappentyp)), null);
    // Ältere Stände mit „zielTyp“ vergleichen gleich, solange es genau ein Ziel ist.
    const vorher = { name: 'R', beschreibung: '', titelVorlage: '', register: [], felder: [{ key: 'betrifft', label: 'b', werte: { typ: 'referenz', zielTyp: 'vt' } }] };
    assert.equal(typUnterschiede(vorher, typBild({ ...alt, felder: [{ key: 'betrifft', label: 'b', typ: 'referenz', zielTypen: ['vt'] }] } as Mappentyp)), null);
  });
});

/** Rechte-Regeln „zeigt auf Mappe vom Typ …“ im Zweifel geschlossen – je Fall ein Test (Sicherheit). */
describe('„zeigt auf Mappe vom Typ …“ in Rechten (#1036): im Zweifel geschlossen', () => {
  const typ = (regeln: Regel[], grund = NICHTS) => ({ id: 'r', name: 'Rechnung', felder: [{ key: 'betrifft', label: 'betrifft', typ: 'referenz', mehrfach: true, zielTypen: ['fz', 'geheim'] }], register: [], berechtigungen: { grund, regeln } }) as unknown as Mappentyp;
  const regel = (wirkung: 'erteilen' | 'entziehen', typen: string[], nicht = false): Regel => ({ id: 'x', name: 'x', wenn: [{ art: 'feld', ...(nicht ? { nicht: true } : {}), bedingung: { art: 'feld', feld: 'betrifft', op: 'zeigtAufTyp', wert: { art: 'fest', wert: typen } } }], dann: { R: wirkung }, stopp: false });
  const typVon = (id: string) => ({ auto: 'fz', akte: 'geheim' } as Record<string, string>)[id];
  const z = { dokumente: () => 0, verknuepfungen: () => 0, typVon };
  const m = (betrifft: string[]) => ({ id: 'm', typId: 'r', werte: { betrifft }, erstellt: '', geaendert: '' }) as never;
  const a = { heute: '2026-11-10', ich: 'u', meineRollen: [], sichtbareTypen: ['r', 'fz'] };
  const lesen = (t: Mappentyp, betrifft: string[]) => rechteAn(t, m(betrifft), { id: 'u', rollen: [] }, a, z).rechte.R;

  it('gibt Recht, Typ sichtbar: erfüllt', () => assert.equal(lesen(typ([regel('erteilen', ['fz'])]), ['auto']), true));
  it('gibt Recht, Zielmappe von einem Typ, den die Person nicht sehen darf: nicht erfüllt', () => assert.equal(lesen(typ([regel('erteilen', ['geheim'])]), ['akte']), false));
  it('gibt Recht mit „nicht“, unsichtbarer Typ: auch nicht erfüllt', () => assert.equal(lesen(typ([regel('erteilen', ['fz'], true)]), ['akte']), false));
  it('nimmt Recht, unsichtbarer Typ: erfüllt (auch wenn die Regel einen anderen Typ nennt)', () => assert.equal(lesen(typ([regel('entziehen', ['fz'])], ALLES), ['akte']), false));
  it('nimmt Recht mit „nicht“, unsichtbarer Typ: auch erfüllt', () => assert.equal(lesen(typ([regel('entziehen', ['geheim'], true)], ALLES), ['akte']), false));
  it('nimmt Recht, Typ sichtbar und nicht genannt: nicht erfüllt', () => assert.equal(lesen(typ([regel('entziehen', ['geheim'])], ALLES), ['auto']), true));
  it('ohne Angabe der sichtbaren Typen (Administrator, Ansichten): wie die Bedingung sagt', () => {
    const t = typ([regel('erteilen', ['geheim'])]);
    assert.equal(rechteAn(t, m(['akte']), { id: 'u', rollen: [] }, { ...a, sichtbareTypen: undefined }, z).rechte.R, true);
  });
});

/**
 * Lena ist Mitglied; Fahrzeuge und Wohnungen sieht sie, „Akte“ nicht (Grundeinstellung ohne Lesen). Rechnungen
 * *betreffen* ein Fahrzeug, eine Wohnung oder eine Akte. Markus ist Administrator.
 */
async function aufbau(repos?: { repo: Repo; konto: KontoRepo }) {
  const d = new Dienst(repos?.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(repos?.konto ?? speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const lena = (await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, markus.id)).benutzer;
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const name = [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }];
  const fahrzeug = await d.mappentypen.legeTypAn({ name: 'Fahrzeug', titelVorlage: '{name}', felder: name });
  const wohnung = await d.mappentypen.legeTypAn({ name: 'Wohnung', titelVorlage: '{name}', felder: name });
  const akte = await d.mappentypen.legeTypAn({ name: 'Akte', titelVorlage: '{name}', felder: name });
  await d.berechtigungen.setzeBerechtigungen(akte.id, { grund: NICHTS, regeln: [] }, true);
  const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true },
    { key: 'betrifft', label: 'betrifft', typ: 'referenz', mehrfach: true, gleicherTyp: true, zielTypen: [fahrzeug.id, wohnung.id, akte.id] },
    // Alte Form (#1036): ein Zieltyp in „zielTyp“ gilt weiter.
    { key: 'fahrzeug', label: 'Fahrzeug', typ: 'referenz', zielTyp: fahrzeug.id },
  ] });
  const golf = await d.mappen.legeMappeAn({ typId: fahrzeug.id, werte: { name: 'Golf' } }, markus.id);
  const polo = await d.mappen.legeMappeAn({ typId: fahrzeug.id, werte: { name: 'Polo' } }, markus.id);
  const haus = await d.mappen.legeMappeAn({ typId: wohnung.id, werte: { name: 'Haus' } }, markus.id);
  const geheim = await d.mappen.legeMappeAn({ typId: akte.id, werte: { name: 'Geheim' } }, markus.id);
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const route = (mt: string, p: string) => tabelle.find((r) => r.methode === mt && r.pfad === p)!;
  const rufe = async (b: { id: string }, mt: string, p: string, x: Partial<Anfrage> = {}) => route(mt, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus(await ich(b.id)) });
  return { d, konten, markus, lena, fahrzeug, wohnung, akte, rechnung, golf, polo, haus, geheim, ich, rufe };
}

for (const pg of [false, true]) {
  describe(`Verweise auf mehrere Mappentypen (#1036)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    const neu = async (n: string) => aufbau(pg ? await pgRepos(`verweisziele_${n}`) : undefined);

    it('gespeichert als zielTypen (auch aus der alten Form); die Schnittstelle nennt zielTyp bei genau einem Ziel weiter', async () => {
      const { d, rechnung, fahrzeug, wohnung, akte, lena, rufe } = await neu('modell');
      const t = (await d.mappentypen.listeTypen()).find((x) => x.id === rechnung.id)!;
      assert.deepEqual(t.felder.find((f) => f.key === 'betrifft')!.zielTypen, [fahrzeug.id, wohnung.id, akte.id]);
      assert.deepEqual(t.felder.find((f) => f.key === 'fahrzeug')!.zielTypen, [fahrzeug.id]);
      assert.equal('zielTyp' in t.felder.find((f) => f.key === 'fahrzeug')!, false);
      const api = (await rufe(lena, 'GET', '/api/typen')).body as Array<{ id: string; felder: Array<Record<string, unknown>> }>;
      const felder = api.find((x) => x.id === rechnung.id)!.felder;
      assert.equal(felder.find((f) => f.key === 'fahrzeug')!.zielTyp, fahrzeug.id, 'veraltet, aber weiter da');
      assert.equal(felder.find((f) => f.key === 'betrifft')!.zielTyp, undefined, 'bei mehreren nicht');
    });

    it('Server prüft beim Speichern Zieltypen und „alle vom selben Typ“ – auch über die Schnittstelle', async () => {
      const { d, rechnung, golf, polo, haus, markus, lena, fahrzeug, rufe } = await neu('pruefen');
      const ok = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R1', betrifft: [golf.id, polo.id] } }, markus.id);
      assert.deepEqual(ok.werte.betrifft, [golf.id, polo.id]);
      await assert.rejects(d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R2', betrifft: [golf.id, haus.id] } }, markus.id), status(422, /selben Mappentyp/));
      await assert.rejects(rufe(lena, 'POST', '/api/mappen', { body: { typId: rechnung.id, werte: { nr: 'R3', betrifft: [golf.id, haus.id] } } }), status(422, /selben Mappentyp/));
      // Ein fremder Typ (die Rechnung selbst) geht nie – auch nicht über das Feld mit einem Ziel.
      await assert.rejects(rufe(lena, 'POST', '/api/mappen', { body: { typId: rechnung.id, werte: { nr: 'R4', betrifft: [ok.id] } } }), status(422, /anderen Mappentyps/));
      await assert.rejects(d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R5', fahrzeug: haus.id } }, markus.id), status(422, /anderen Mappentyps/));
      // Ohne „alle vom selben Typ“ gehen gemischte Typen.
      const t = (await d.mappentypen.listeTypen()).find((x) => x.id === rechnung.id)!;
      await d.mappentypen.aendereTyp(rechnung.id, { ...t, felder: t.felder.map((f) => (f.key === 'betrifft' ? { ...f, gleicherTyp: false } : f)) });
      const gemischt = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R6', betrifft: [golf.id, haus.id] } }, markus.id);
      assert.deepEqual(gemischt.werte.betrifft, [golf.id, haus.id]);
      // Ein Zieltyp von mehreren lässt sich löschen (ohne Mappen) – er geht aus dem Feld; ist er der einzige, nicht.
      const leer = await d.mappentypen.legeTypAn({ name: 'Leer', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
      const t2 = (await d.mappentypen.listeTypen()).find((x) => x.id === rechnung.id)!;
      await d.mappentypen.aendereTyp(rechnung.id, { ...t2, felder: [...t2.felder, { key: 'nur_leer', label: 'Nur leer', typ: 'referenz', zielTypen: [leer.id] }, { key: 'beide', label: 'Beide', typ: 'referenz', zielTypen: [leer.id, fahrzeug.id] }] });
      await assert.rejects(d.mappentypen.loescheTyp(leer.id), status(409));
      const t3 = (await d.mappentypen.listeTypen()).find((x) => x.id === rechnung.id)!;
      await d.mappentypen.aendereTyp(rechnung.id, { ...t3, felder: t3.felder.filter((f) => f.key !== 'nur_leer') });
      await d.mappentypen.loescheTyp(leer.id);
      assert.deepEqual((await d.mappentypen.listeTypen()).find((x) => x.id === rechnung.id)!.felder.find((f) => f.key === 'beide')!.zielTypen, [fahrzeug.id]);
    });

    it('„(nicht sichtbar)“ ohne Titel und ohne Typ; Auswahl über alle Zieltypen, nur lesbare', async () => {
      const { d, rechnung, golf, haus, geheim, markus, lena, rufe } = await neu('maske');
      await d.berechtigungen.setzeBerechtigungen(rechnung.id, { grund: ALLES, regeln: [] }, true);
      const r = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R1', betrifft: [geheim.id] } }, markus.id);
      const sicht = (await rufe(lena, 'GET', '/api/mappen/:id', { params: { id: r.id } })).body as { bezuege: Record<string, unknown> };
      assert.deepEqual(sicht.bezuege[geheim.id], { titel: 'nicht sichtbare Mappe', typId: '', verborgen: true });
      const s = (await rufe(lena, 'GET', '/api/mappen', { query: { sicht: `feld:${rechnung.id}:betrifft`, anzahl: '50' } })).body as { mappen: Array<{ id: string }>; gesamt: number };
      assert.deepEqual(new Set(s.mappen.map((m) => m.id)), new Set([golf.id, haus.id, (await d.mappen.listeMappen(golf.typId)).find((m) => m.titel === 'Polo')!.id]));
      assert.equal(s.gesamt, 3, 'die Akte zählt nicht mit');
    });

    for (const fall of [
      { name: 'gibt Recht, Typ sichtbar → erfüllt', wirkung: 'erteilen' as const, typ: 'fahrzeug' as const, ziel: 'golf' as const, nicht: false, lesbar: true },
      { name: 'gibt Recht, Zielmappe unsichtbaren Typs → nicht erfüllt', wirkung: 'erteilen' as const, typ: 'akte' as const, ziel: 'geheim' as const, nicht: false, lesbar: false },
      { name: 'gibt Recht mit „nicht“, unsichtbarer Typ → nicht erfüllt', wirkung: 'erteilen' as const, typ: 'fahrzeug' as const, ziel: 'geheim' as const, nicht: true, lesbar: false },
      { name: 'nimmt Recht, unsichtbarer Typ → erfüllt', wirkung: 'entziehen' as const, typ: 'wohnung' as const, ziel: 'geheim' as const, nicht: false, lesbar: false },
      { name: 'nimmt Recht, sichtbarer anderer Typ → nicht erfüllt', wirkung: 'entziehen' as const, typ: 'wohnung' as const, ziel: 'golf' as const, nicht: false, lesbar: true },
    ]) {
      it(`Rechte-Regel „zeigt auf Mappe vom Typ …“: ${fall.name} (Mappe und Liste)`, async () => {
        const x = await neu(`recht_${fall.wirkung}_${fall.typ}_${fall.nicht ? 'n' : 'j'}`);
        const { d, rechnung, markus, lena } = x;
        const rw: Regelwerk = { grund: fall.wirkung === 'erteilen' ? { ...NICHTS, C: true } : ALLES, regeln: [{ id: 'r', name: 'Typ', stopp: false, dann: { R: fall.wirkung },
          wenn: [{ art: 'feld', ...(fall.nicht ? { nicht: true } : {}), bedingung: { art: 'feld', feld: 'betrifft', op: 'zeigtAufTyp', wert: { art: 'fest', wert: [x[fall.typ].id] } } }] }] };
        await d.berechtigungen.setzeBerechtigungen(rechnung.id, rw, true);
        const r = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R1', betrifft: [x[fall.ziel].id] } }, markus.id);
        const z = await d.rechtepruefung.zugriff(await x.ich(lena.id));
        assert.equal(z.a.sichtbareTypen?.includes(x.akte.id), false, 'die Akte sieht Lena nicht');
        assert.equal((await d.rechtepruefung.rechteAn(z, r)).R, fall.lesbar, 'Rechte an der Mappe');
        assert.equal((await d.rechtepruefung.lesbare(z, [r.id])).has(r.id), fall.lesbar, 'Lesefilter der Listen');
        // Testlauf rechnet genauso.
        const tl = await d.berechtigungen.testlauf({ mappeId: r.id, benutzerId: lena.id });
        assert.equal(tl.wirksam.R, fall.lesbar, 'Testlauf');
        // Im Verwaltungsmodus gelten die Regeln nicht.
        assert.equal((await d.rechtepruefung.rechteAn(await d.rechtepruefung.zugriff(imModus(await x.ich(markus.id))), r)).R, true);
      });
    }
  });
}

/** Ein kleines Paket aus Manifest und Mappentypen. */
const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
function paket(id: string, typen: string, extra = ''): Record<string, string> {
  return {
    'manifest.yaml': `schema: 1\nid: ${id}\nname: ${id}\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\n${extra}inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`,
    'inhalt/mappentypen.yaml': typen,
  };
}
const RECHNUNGEN = `- schluessel: vertrag
  name: Vertrag
  felder:
    - { key: name, label: Name, typ: text }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name] }
- schluessel: rechnung
  name: Rechnung
  felder:
    - { key: nr, label: Nummer, typ: text }
    - { key: betrifft, label: betrifft, typ: referenz, mehrfach: true, gleicherTyp: true, ziel: [vertrag], zielOptional: [fahrzeuge:fahrzeug] }
    - { key: steuerjahr, label: Steuerjahr, typ: referenz, zielOptional: [haushalt:steuerjahr] }
  register:
    - { key: daten, name: Daten, art: felder, felder: [nr, betrifft, steuerjahr] }
`;
const FAHRZEUGE = `- schluessel: fahrzeug
  name: Fahrzeug
  felder:
    - { key: name, label: Name, typ: text }
    - { key: rechnungen, label: Rechnungen, typ: referenz, mehrfach: true, ziel: rechnungen:rechnung }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name, rechnungen] }
`;
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));

describe('Paketformat (#1036): ziel als Liste, zielOptional', () => {
  it('Prüfung beim Lesen', () => {
    const p = liesPaket(liesZip(archiv(paket('rechnungen', RECHNUNGEN))));
    const f = p.typen[1].felder.find((x) => x.key === 'betrifft')!;
    assert.deepEqual([f.ziel, f.zielOptional, f.gleicherTyp], [['vertrag'], ['fahrzeuge:fahrzeug'], true]);
    const falsch = (feld: string) => () => liesPaket(liesZip(archiv(paket('rechnungen', `- schluessel: rechnung\n  name: Rechnung\n  felder:\n    - ${feld}\n  register:\n    - { key: daten, name: Daten, art: felder }\n`))));
    assert.throws(falsch('{ key: a, label: A, typ: referenz, zielOptional: [rechnungen:rechnung] }'), gruende(/eigene Typen gehören unter ziel/));
    assert.throws(falsch('{ key: a, label: A, typ: referenz, zielOptional: [fahrzeug] }'), gruende(/paket:schluessel/));
    assert.throws(falsch('{ key: a, label: A, typ: referenz, zielOptional: [dms:benutzer] }'), gruende(/paket:schluessel/));
    assert.throws(falsch('{ key: a, label: A, typ: referenz, ziel: [] }'), gruende(/leere Liste/));
    assert.throws(falsch('{ key: a, label: A, typ: referenz }'), gruende(/ohne ziel und ohne zielOptional/));
    assert.throws(falsch('{ key: a, label: A, typ: text, zielOptional: [x:y] }'), gruende(/nur bei Verweisfeldern/));
    assert.throws(falsch('{ key: a, label: A, typ: referenz, ziel: [rechnung, x:y], aus_text: t }\n    - { key: t, label: T, typ: text }'), gruende(/aus_text geht nur mit genau einem Zieltyp/));
  });
});

for (const pg of [false, true]) {
  describe(`Pakete mit optionalen Zieltypen (#1036)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    it('optional aufgenommen, sobald es den Typ gibt – auch nachträglich; beim Entfernen bleibt das Feld', async () => {
      const repo = pg ? (await pgRepos('verweisziele_pakete')).repo : speicherRepo();
      const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const p = new Paketverwaltung(d, { version: () => '0.230.0', abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
      const installiere = async (dateien: Record<string, string>) => { const h = await p.hochladen(archiv(dateien), ICH); return p.installiere({ upload: h.upload, bestaetigt: true }, ICH); };
      const r = await installiere(paket('rechnungen', RECHNUNGEN));
      const feld = async (key: string) => (await d.mappentypen.listeTypen()).find((x) => x.id === r.typen.rechnung)!.felder.find((f) => f.key === key)!;
      assert.deepEqual((await feld('betrifft')).zielTypen, [r.typen.vertrag]);
      assert.deepEqual((await feld('betrifft')).zielOptional, ['fahrzeuge:fahrzeug']);
      assert.deepEqual((await feld('steuerjahr')).zielTypen, [], 'nur optional: Feld ohne Zieltyp, kein Fehler');
      // Fahrzeuge kommt später (und hängt selbst von Rechnungen ab): das Feld nimmt den Typ auf.
      const f = await installiere(paket('fahrzeuge', FAHRZEUGE, 'abhaengigkeiten:\n  rechnungen: ">=1.0.0"\n'));
      assert.deepEqual((await feld('betrifft')).zielTypen, [r.typen.vertrag, f.typen.fahrzeug]);
      // Das ist keine eigene Änderung am Typ aus dem Paket Rechnungen.
      const rp = (await p.installierte()).find((x) => x.id === 'rechnungen')!;
      const rt = (await d.mappentypen.listeTypen()).find((x) => x.id === r.typen.rechnung)!;
      assert.equal(aenderung(rt, rp, (id) => (id === f.typen.fahrzeug ? 'fahrzeuge:fahrzeug' : undefined)).geaendert, false);
      // Speichern mit einem Fahrzeug geht.
      const golf = await d.mappen.legeMappeAn({ typId: f.typen.fahrzeug, werte: { name: 'Golf' } }, null);
      await d.mappen.legeMappeAn({ typId: r.typen.rechnung, werte: { nr: 'R1', betrifft: [golf.id] } }, null);
      // Fahrzeuge wieder entfernen (ohne Mappen): Rechnung bleibt, nur der Typ geht aus dem Feld; optional bleibt notiert.
      await d.entferneMappenEndgueltig((await d.mappen.listeMappen(r.typen.rechnung)).map((m) => m.id));
      await d.entferneMappenEndgueltig([golf.id]);
      await p.entferne('fahrzeuge', { id: ICH.id, email: ICH.email } as never);
      assert.deepEqual((await feld('betrifft')).zielTypen, [r.typen.vertrag]);
      assert.deepEqual((await feld('betrifft')).zielOptional, ['fahrzeuge:fahrzeug']);
      // Und wieder installiert: kommt wieder dazu.
      const f2 = await installiere(paket('fahrzeuge', FAHRZEUGE, 'abhaengigkeiten:\n  rechnungen: ">=1.0.0"\n'));
      assert.deepEqual((await feld('betrifft')).zielTypen, [r.typen.vertrag, f2.typen.fahrzeug]);
    });
  });
}
