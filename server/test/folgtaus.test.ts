/**
 * Verweisfeld „folgt aus“ (#886) und „Verweis passt nicht“ mit Grund (#887):
 * - Mappentyp: Eigenschaft gespeichert, geprüft (Felder, Zieltyp, nur eine Mappe, keine Kreise), im Typvergleich.
 * - Speichern (Oberfläche wie Schnittstelle): ein leeres Feld füllt sich aus seiner Quelle – nur wenn die Anfrage es
 *   nicht selbst setzt, nie überschreibend, nichts ohne Wert am Ziel, nichts ohne Leserecht; bestehende Mappen bleiben.
 * - Gegenrichtung über den Auswahlfilter (dms-registry #139); die Ablehnung neuer unpassender Werte bleibt.
 * - Konflikte an der Mappe: Feld, eigenes Feld, „Auswahlregel“; die Prüfung vor dem Speichern liefert die Gründe.
 * - Aus Dokument ausfüllen: Vorschlag für das Feld, das aus einem vorgeschlagenen Verweis folgt.
 * - Betreff der Post nur in ein Textfeld ohne festes Format (#934, Nacharbeit).
 * Im Arbeitsspeicher und – mit TEST_DATABASE_URL – in PostgreSQL (eigene Datenbank über hilfe-db.ts).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { folgeReihenfolge, folgtAusKreis } from '../../shared/src/folgtaus';
import { betreffFeld } from '../../shared/src/uebernehmen';
import { typBild, typUnterschiede } from '../../shared/src/typvergleich';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import type { Feld, Mappentyp } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { openapi } from '../src/api-v1';
import { eigeneDatenbank } from './hilfe-db';
import { imModus } from './hilfen';

const meldet = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && re.test(JSON.stringify(e.details ?? {}) + e.message);
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const offen: Array<{ end(): Promise<void> }> = [];
after(async () => { for (const s of offen.splice(0)) await s.end(); });

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo-pg');
  const sql = (await eigeneDatenbank('folgtaus')).sql;
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT) as never;
}

/** Basis im Kleinen: Organisation, Niederlassung (gehört zu einer Organisation), Person mit beiden Richtungen. */
async function aufbau(pg = false) {
  const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const organisation = await d.mappentypen.legeTypAn({ name: 'Organisation', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] });
  const niederlassung = await d.mappentypen.legeTypAn({ name: 'Niederlassung', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'organisation', label: 'Organisation', typ: 'referenz', zielTyp: organisation.id },
  ] });
  const person = await d.mappentypen.legeTypAn({ name: 'Person', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'organisation', label: 'Organisation', typ: 'referenz', zielTyp: organisation.id, folgtAus: { feld: 'niederlassung', zielFeld: 'organisation' } },
    // dms-registry #139: nur Niederlassungen der gewählten Organisation (leer: alle).
    { key: 'niederlassung', label: 'Niederlassung', typ: 'referenz', zielTyp: niederlassung.id,
      auswahlFilter: [{ art: 'feld', feld: 'organisation', op: 'zeigtAuf', wert: { art: 'eigenesFeld', feld: 'organisation' } }] },
  ] });
  const org = async (name: string) => d.mappen.legeMappeAn({ typId: organisation.id, werte: { name } });
  const sparkasse = await org('Sparkasse Musterstadt'), volksbank = await org('Volksbank Beispiel');
  const nl = async (name: string, o: string | null) => d.mappen.legeMappeAn({ typId: niederlassung.id, werte: { name, organisation: o } });
  return {
    d, organisation, niederlassung, person, sparkasse, volksbank,
    nord: await nl('Zweigstelle Nordviertel', sparkasse.id), markt: await nl('Filiale Marktplatz', volksbank.id), lose: await nl('Außenstelle ohne Träger', null),
  };
}

describe('Folgt aus – Mappentyp (#886)', () => {
  it('wird gespeichert, steht im Typvergleich und in der Schnittstelle', async () => {
    const { person } = await aufbau();
    assert.deepEqual(person.felder.find((f) => f.key === 'organisation')?.folgtAus, { feld: 'niederlassung', zielFeld: 'organisation' });
    const ohne = { ...person, felder: person.felder.map((f) => ({ ...f, folgtAus: undefined })) } as Mappentyp;
    assert.match(typUnterschiede(typBild(ohne), typBild(person))?.liste.join(' ') ?? '', /Organisation“: Folgt aus/, 'Änderung ist im Vergleich sichtbar');
    // Schnittstelle (#886, #887): Feld folgtAus, an der Mappe die Konflikte.
    const doku = JSON.stringify(openapi('test'));
    assert.ok(doku.includes('"folgtAus"') && doku.includes('"konflikte"'));
  });

  it('Prüfung: Felder gibt es, Verweis mit einer Mappe, Zielfeld auf denselben Typ, keine Kreise', async () => {
    const { d, organisation, niederlassung } = await aufbau();
    const probe = (felder: Partial<Feld>[]) => d.mappentypen.legeTypAn({ name: `Probe ${Math.random()}`, felder });
    const org: Partial<Feld> = { key: 'org', label: 'Organisation', typ: 'referenz', zielTypen: [organisation.id ]};
    const nl: Partial<Feld> = { key: 'nl', label: 'Niederlassung', typ: 'referenz', zielTypen: [niederlassung.id ]};
    await assert.rejects(probe([{ ...org, folgtAus: { feld: 'fehlt', zielFeld: 'organisation' } }, nl]), meldet(/Das Feld „fehlt“ gibt es/));
    await assert.rejects(probe([{ ...org, folgtAus: { feld: 'nl', zielFeld: 'gibtsnicht' } }, nl]), meldet(/haben kein Feld „gibtsnicht“/));
    await assert.rejects(probe([{ ...org, folgtAus: { feld: 'nl', zielFeld: 'name' } }, nl]), meldet(/zeigt nicht auf eine einzelne Mappe/));
    await assert.rejects(probe([{ ...org, folgtAus: { feld: 'nl', zielFeld: 'organisation' } }, { ...nl, mehrfach: true }]), meldet(/erlaubt mehrere Mappen/));
    await assert.rejects(probe([{ ...org, folgtAus: { feld: 'name', zielFeld: 'organisation' } }, nl, { key: 'name', label: 'Name', typ: 'text' }]), meldet(/kein Verweisfeld/));
    // Kreis: a aus b, b aus a (beide zeigen auf Organisation, die Organisation zeigt auf sich selbst).
    const mutter = await d.mappentypen.legeTypAn({ name: 'Firma', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    const tochter = await d.mappentypen.legeTypAn({ name: 'Tochter', felder: [{ key: 'mutter', label: 'Mutter', typ: 'referenz', zielTyp: mutter.id }] });
    await d.mappentypen.aendereTyp(mutter.id, { ...mutter, felder: [...mutter.felder, { key: 'tochter', label: 'Tochter', typ: 'referenz', zielTyp: tochter.id }] });
    const a: Partial<Feld> = { key: 'a', label: 'A', typ: 'referenz', zielTypen: [mutter.id], folgtAus: { feld: 'b', zielFeld: 'mutter' } };
    const b: Partial<Feld> = { key: 'b', label: 'B', typ: 'referenz', zielTypen: [tochter.id], folgtAus: { feld: 'a', zielFeld: 'tochter' } };
    await assert.rejects(probe([a, b]), meldet(/folgen im Kreis/));
    assert.deepEqual(folgtAusKreis([a, b] as Feld[]), ['a', 'b']);
    // Kette: a aus b, b aus c – b füllt sich zuerst.
    const kette = [{ ...a, folgtAus: { feld: 'b', zielFeld: 'x' } }, { ...b, folgtAus: { feld: 'c', zielFeld: 'y' } }, { key: 'c', label: 'C', typ: 'referenz', zielTyp: 'z' }] as Feld[];
    assert.deepEqual(folgeReihenfolge(kette).map((x) => x.feld.key), ['b', 'a']);
    // Nicht an Feldern auf „jede Mappe“ und nicht an anderen Feldarten (bereinigt, kein Fehler).
    const t = await probe([{ key: 'x', label: 'X', typ: 'text', folgtAus: { feld: 'nl', zielFeld: 'organisation' } } as Partial<Feld>, nl]);
    assert.equal(t.felder[0].folgtAus, undefined);
  });
});

describe('Folgt aus – Speichern in Oberfläche und Schnittstelle (#886)', () => {
  for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
    it(`leeres Feld füllt sich aus der Quelle; nie überschreibend, nicht ohne Wert am Ziel${pg ? ' (PostgreSQL)' : ''}`, async () => {
      const { d, person, sparkasse, volksbank, nord, markt, lose } = await aufbau(pg);
      // Niederlassung gewählt, Organisation nicht genannt → füllt sich.
      const lena = await d.mappen.legeMappeAn({ typId: person.id, werte: { name: 'Lena', niederlassung: nord.id } });
      assert.equal(lena.werte.organisation, sparkasse.id);
      // Die Anfrage nennt das Feld selbst (auch leer): bleibt, wie es ist.
      const jonas = await d.mappen.legeMappeAn({ typId: person.id, werte: { name: 'Jonas', niederlassung: nord.id, organisation: null } });
      assert.equal(jonas.werte.organisation, null);
      // Ziel ohne Wert: nichts übernehmen.
      const petra = await d.mappen.legeMappeAn({ typId: person.id, werte: { name: 'Petra', niederlassung: lose.id } });
      assert.equal(petra.werte.organisation, null);
      // Später die Niederlassung wechseln: nur ein leeres Feld füllt sich, ein gesetztes bleibt.
      const p2 = await d.mappen.aendereMappe(petra.id, { werte: { niederlassung: nord.id } });
      assert.equal(p2.werte.organisation, sparkasse.id);
      const l2 = await d.mappen.aendereMappe(lena.id, { werte: { name: 'Lena B.' } });
      assert.equal(l2.werte.organisation, sparkasse.id, 'unverändert');
      // Bestehende Mappen werden nicht umgeschrieben: Die Niederlassung wechselt die Organisation – Lena bleibt.
      await d.mappen.aendereMappe(nord.id, { werte: { organisation: volksbank.id } });
      assert.equal((await d.mappen.holeMappe(lena.id)).mappe.werte.organisation, sparkasse.id);
      // … und der Hinweis an der Mappe nennt Feld und eigenes Feld (#887).
      const det = await d.mappen.holeMappe(lena.id);
      assert.deepEqual(det.konflikte, [{ feld: 'niederlassung', eigeneFelder: ['organisation'], ids: [nord.id] }]);
      assert.deepEqual(det.unpassend, { niederlassung: [nord.id] });
      // Speichern bleibt möglich (bestehender Wert), Ändern anderer Felder auch.
      await d.mappen.aendereMappe(lena.id, { werte: { name: 'Lena C.' } });
      assert.ok(markt);
    });
  }

  it('Auswahlfilter (dms-registry #139): nur Niederlassungen der Organisation; leer: alle; neu Unpassendes lehnt der Server ab', async () => {
    const { d, person, sparkasse, nord, markt, lose } = await aufbau();
    const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };
    const titel = async (eigene: Record<string, unknown>) => (await d.sichten.seite(ICH, { sicht: `feld:${person.id}:niederlassung`, eigene: JSON.stringify(eigene) })).mappen.map((m) => m.titel).sort();
    assert.deepEqual(await titel({ organisation: sparkasse.id }), ['Zweigstelle Nordviertel']);
    assert.deepEqual(await titel({}), ['Außenstelle ohne Träger', 'Filiale Marktplatz', 'Zweigstelle Nordviertel']);
    await assert.rejects(d.mappen.legeMappeAn({ typId: person.id, werte: { name: 'X', organisation: sparkasse.id, niederlassung: markt.id } }), meldet(/passt nicht zur Auswahl/));
    // Zuerst die Niederlassung, die Organisation folgt – passt also zum Filter.
    const x = await d.mappen.legeMappeAn({ typId: person.id, werte: { name: 'Y', niederlassung: nord.id } });
    assert.equal(x.werte.organisation, sparkasse.id);
    assert.ok(lose);
  });

  it('Gründe (#887): eigenes Feld, „Auswahlregel“ bei festen Bedingungen; die Prüfung vor dem Speichern liefert sie', async () => {
    const { d, person, organisation, sparkasse, volksbank, nord, markt } = await aufbau();
    const ICH = '00000000-0000-4000-8000-0000000000aa';
    const r = await d.mappenEingaben.auswahlPruefen({ typId: person.id, feldKey: 'niederlassung', ids: [nord.id, markt.id], werte: { organisation: volksbank.id } }, ICH);
    assert.deepEqual(r.unpassend, [nord.id]);
    assert.deepEqual(r.gruende, { [nord.id]: ['organisation'] });
    // Feste Bedingung ohne eigenes Feld: Grund leer = „Auswahlregel dieses Felds“.
    const regel = await d.mappentypen.legeTypAn({ name: 'Vermerk', felder: [{ key: 'bank', label: 'Bank', typ: 'referenz', zielTyp: organisation.id, auswahlFilter: [{ art: 'feld', feld: 'name', op: 'enthaelt', wert: { art: 'fest', wert: 'Sparkasse' } }] }] });
    const v = await d.mappen.legeMappeAn({ typId: regel.id, werte: { bank: sparkasse.id } });
    await d.mappen.aendereMappe(sparkasse.id, { werte: { name: 'Stadtbank Musterstadt' } });
    assert.deepEqual((await d.mappen.holeMappe(v.id)).konflikte, [{ feld: 'bank', eigeneFelder: [], regel: true, ids: [sparkasse.id] }]);
    const r2 = await d.mappenEingaben.auswahlPruefen({ typId: regel.id, feldKey: 'bank', ids: [sparkasse.id], werte: {} }, ICH);
    assert.deepEqual(r2, { unpassend: [sparkasse.id], gruende: { [sparkasse.id]: [] } });
    // Felder ohne Filter und ohne „folgt aus“: nichts zu prüfen.
    assert.deepEqual(await d.mappenEingaben.auswahlPruefen({ typId: person.id, feldKey: 'organisation', ids: [sparkasse.id], werte: {} }, ICH), { unpassend: [], gruende: {} });
  });

  it('Oberfläche: /api/mappen/folgen sagt, was aus der Quelle folgt (null ohne Wert am Ziel)', async () => {
    const { d, person, sparkasse, nord, lose } = await aufbau();
    assert.deepEqual(await d.mappenEingaben.folgen({ typId: person.id, werte: { niederlassung: nord.id } }), { felder: { organisation: { quelle: 'niederlassung', wert: sparkasse.id, titel: 'Sparkasse Musterstadt', typId: sparkasse.typId } } });
    assert.deepEqual(await d.mappenEingaben.folgen({ typId: person.id, werte: { niederlassung: lose.id } }), { felder: { organisation: { quelle: 'niederlassung', wert: null } } });
    assert.deepEqual(await d.mappenEingaben.folgen({ typId: person.id, werte: {} }), { felder: {} });
  });
});

describe('Folgt aus – nur lesbare Werte, auch über die Schnittstelle (#886)', () => {
  it('ohne Leserecht an der Organisation füllt sich nichts; die Route der API füllt wie die Oberfläche', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const { benutzer: admin } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, admin.id)).benutzer;
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    const zu: Regelwerk = { grund: NICHTS, regeln: [] };
    const organisation = await d.mappentypen.legeTypAn({ name: 'Organisation', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }], berechtigungen: zu });
    const niederlassung = await d.mappentypen.legeTypAn({ name: 'Niederlassung', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'organisation', label: 'Organisation', typ: 'referenz', zielTyp: organisation.id }] });
    const person = await d.mappentypen.legeTypAn({ name: 'Person', titelVorlage: '{name}', felder: [
      { key: 'name', label: 'Name', typ: 'text' },
      { key: 'organisation', label: 'Organisation', typ: 'referenz', zielTyp: organisation.id, folgtAus: { feld: 'niederlassung', zielFeld: 'organisation' } },
      { key: 'niederlassung', label: 'Niederlassung', typ: 'referenz', zielTyp: niederlassung.id },
    ] });
    const sk = await d.mappen.legeMappeAn({ typId: organisation.id, werte: { name: 'Sparkasse Musterstadt' } }, admin.id);
    const nord = await d.mappen.legeMappeAn({ typId: niederlassung.id, werte: { name: 'Nordviertel', organisation: sk.id } }, admin.id);
    const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
    const zJ = await d.rechtepruefung.zugriff(await ich(jonas.id));
    assert.ok(!(await d.rechtepruefung.lesbare(zJ, [sk.id])).has(sk.id), 'Jonas darf die Organisation nicht lesen');
    const m = await d.mappen.legeMappeAn({ typId: person.id, werte: { name: 'Markus', niederlassung: nord.id } }, jonas.id, false, zJ);
    assert.equal(m.werte.organisation, null);
    assert.deepEqual((await d.mappenEingaben.folgen({ typId: person.id, werte: { niederlassung: nord.id } }, zJ)).felder.organisation.wert, null);
    // Über die Route (dieselbe wie POST /api/v1/mappen) als Lena im Verwaltungsmodus (darf alles lesen): füllt sich.
    const tabelle = routen(d, konten, {});
    const route = tabelle.find((r) => r.methode === 'POST' && r.pfad === '/api/mappen')!;
    const body = { typId: person.id, werte: { name: 'Katrin', niederlassung: nord.id } };
    const r = await route.handler({ body, params: {}, query: {}, ip: '1', benutzer: imModus(await ich(admin.id)) } as unknown as Anfrage);
    assert.equal((r.body as { werte: Record<string, unknown> }).werte.organisation, sk.id);
  });
});

describe('Folgt aus – aus Dokument ausfüllen (#886)', () => {
  it('Vorschlag für den Verweis bringt den Vorschlag für das Feld mit, das daraus folgt', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const partner = await d.mappentypen.legeTypAn({ name: 'Vertragspartner', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{bezeichnung}', felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text' },
      { key: 'nummer', label: 'Vertragsnummer', typ: 'text', erkennung: { art: 'nummer' }, wiederfinden: true },
      { key: 'partner', label: 'Vertragspartner', typ: 'referenz', zielTyp: partner.id },
    ] });
    const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', felder: [
      { key: 'nr', label: 'Rechnungsnummer', typ: 'text', erkennung: { art: 'nummer' } },
      { key: 'vertrag', label: 'Vertrag', typ: 'referenz', zielTyp: vertrag.id, erkennung: {} },
      { key: 'aussteller', label: 'Aussteller', typ: 'referenz', zielTyp: partner.id, folgtAus: { feld: 'vertrag', zielFeld: 'partner' } },
    ] });
    const hb = await d.mappen.legeMappeAn({ typId: partner.id, werte: { name: 'Heizungsbau Beispiel GmbH' } });
    const wv = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { bezeichnung: 'Wartungsvertrag Heizung', nummer: 'WV-2023-17', partner: hb.id } });
    const r = await d.erkennung.fuerTyp(rechnung.id, { text: 'Rechnung R-2026-117\nVertragsnummer WV-2023-17\nWartung der Heizungsanlage' });
    assert.equal(r.vorschlaege.vertrag?.wert, wv.id);
    assert.equal(r.vorschlaege.aussteller?.wert, hb.id);
    assert.equal(r.vorschlaege.aussteller?.fundstelle, 'aus Vertrag');
    assert.equal(r.bezuege[hb.id]?.titel, 'Heizungsbau Beispiel GmbH');
    assert.equal(r.neu.aussteller, undefined);
  });
});

describe('Betreff der Post als Vorschlag (#934, Nacharbeit)', () => {
  const typ = (felder: Partial<Feld>[], titelVorlage?: string) => ({ felder: felder as Feld[], titelVorlage }) as Pick<Mappentyp, 'felder' | 'titelVorlage'>;
  it('nur ins erste Titelfeld und nur, wenn es ein Textfeld ohne festes Format ist', () => {
    // Vertrag: Bezeichnung ist frei → Betreff.
    assert.equal(betreffFeld(typ([{ key: 'bezeichnung', label: 'Bezeichnung', typ: 'text' }, { key: 'nummer', label: 'Vertragsnummer', typ: 'text' }], '{bezeichnung}'))?.key, 'bezeichnung');
    // Rechnung: Rechnungsnummer zuerst im Titel → leer (früher landete der Betreff dort), auch kein anderes Feld.
    assert.equal(betreffFeld(typ([{ key: 'rechnungsnummer', label: 'Rechnungsnummer', typ: 'text' }, { key: 'notiz', label: 'Notiz', typ: 'text' }], '{rechnungsnummer} vom {rechnungsdatum}')), undefined);
    // Nummernkreis, Format, Muster, eindeutig, ausgeblendet → leer.
    assert.equal(betreffFeld(typ([{ key: 'az', label: 'Zeichen', typ: 'text', standard: '{nummernkreis:akten}' }], '{az}')), undefined);
    assert.equal(betreffFeld(typ([{ key: 'mail', label: 'Kontakt', typ: 'text', format: 'email' }], '{mail}')), undefined);
    assert.equal(betreffFeld(typ([{ key: 'kz', label: 'Kürzel', typ: 'text', muster: '[A-Z]{3}' }], '{kz}')), undefined);
    assert.equal(betreffFeld(typ([{ key: 'name', label: 'Name', typ: 'text', eindeutig: true }], '{name}')), undefined);
    assert.equal(betreffFeld(typ([{ key: 'titel', label: 'Titel', typ: 'text', ausgeblendet: true }], '{titel}')), undefined);
    // Keine Zahl, kein Datum, keine Auswahl, kein Verweis.
    for (const t of ['zahl', 'datum', 'auswahl', 'referenz', 'langtext'] as const) assert.equal(betreffFeld(typ([{ key: 'x', label: 'X', typ: t }, { key: 'y', label: 'Y', typ: 'text' }], '{x} {y}')), undefined, t);
    // Erster Platzhalter kein Feld (angelegt) → leer; ohne Vorlage das erste Textfeld.
    assert.equal(betreffFeld(typ([{ key: 'y', label: 'Betreff', typ: 'text' }], '{angelegt} {y}')), undefined);
    assert.equal(betreffFeld(typ([{ key: 'n', label: 'Anzahl', typ: 'zahl' }, { key: 'y', label: 'Betreff', typ: 'text' }]))?.key, 'y');
  });
});
