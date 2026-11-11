/**
 * „Ist Teil einer anderen Mappe“ (#1031): Einstellung am Typ und ihre Prüfung, keine eigene Ansicht, nicht in Ansichten,
 * erweiterter Suche und „Zuletzt geöffnet“, Suche findet die übergeordnete Mappe über ihre Teile – nur, wenn man beide
 * lesen darf (Ergänzung Sicherheit), direkter Zugriff mit den normalen Rechten, Leserechte als Vorgabe, Löschen und
 * Wiederherstellen samt Teilen (mit Rechten und Löschprotokoll), Paketformat (Lesen, Prüfen, Erstellen, Installieren in
 * der Schreibweise des Entwurfs Rechnungen). Personas und Werte sind erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { kannAusPost, pruefeMappentyp, type Mappe, type Mappentyp, type MappentypDaten } from '../../shared/src/model';
import { ALLE_TYPEN } from '../../shared/src/pakete';
import { ALLES, type Regelwerk } from '../../shared/src/rechte';
import { DMS_TEILE_AB, istTeiltyp, leserechteAus, teilProbleme, uebergeordneteId } from '../../shared/src/teile';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { mindestversion, Paketerstellung } from '../src/paketerstellung';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { imModus } from './hilfen';
import { eigeneDatenbank } from './hilfe-db';
import type { Repo } from '../src/repo';
import '../src/sprache';

const status = (s: number, muster?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!muster || muster.test(`${e.message} ${JSON.stringify(e.details ?? {})}`));
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
type Seite = { gesamt: number; mappen: Mappe[]; ausschnitte?: Record<string, { dokument: string; text: string; teil?: { id: string; typId: string; titel: string } }> };

/** Privat markierte Mappen sieht nur, wer sie angelegt hat. */
const privatNurErsteller: Regelwerk = {
  grund: ALLES,
  regeln: [{ id: 'privat', name: 'Privat nur für den Ersteller', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }, { art: 'feld', nicht: true, bedingung: { art: 'feld', feld: '_erstelltVon', op: 'zeigtAuf', wert: { art: 'ich' } } }], dann: { R: 'entziehen', U: 'entziehen', D: 'entziehen' }, stopp: true }],
};

/** Rechnung mit Tabelle „Positionen“; Rechnungsposition gehört über „rechnung“ dazu (Teil). */
async function rechnungen(d: Dienst) {
  const rechnung = await d.legeTypAn({ name: 'Rechnung', schluessel: 'rechnung', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Rechnungsnummer', typ: 'text', pflicht: true },
    { key: 'privat', label: 'Privat', typ: 'janein' },
  ] });
  const position = await d.legeTypAn({ name: 'Rechnungsposition', schluessel: 'rechnungsposition', titelVorlage: '{nr}. {beschreibung}', teilVon: 'rechnung', felder: [
    { key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTypen: [rechnung.id], pflicht: true, verweisart: 'zugehoerigkeit' },
    { key: 'nr', label: 'Nr.', typ: 'zahl' },
    { key: 'beschreibung', label: 'Beschreibung', typ: 'text', pflicht: true },
    { key: 'privat', label: 'Privat', typ: 'janein' },
  ], register: [{ key: 'angaben', name: 'Angaben', art: 'felder', felder: ['rechnung', 'nr', 'beschreibung', 'privat'] }, { key: 'belege', name: 'Belege', art: 'dokumente' }] });
  const mitTabelle = await d.aendereTyp(rechnung.id, { ...rechnung, felder: [...rechnung.felder,
    { key: 'positionen', label: 'Positionen', typ: 'tabelle', quelle: { typId: position.id, feldKey: 'rechnung', neu: '+ Position' } }] });
  return { rechnung: mitTabelle, position };
}

async function aufbau(repo: Repo = speicherRepo(), kontoRepo = speicherKontoRepo()) {
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(kontoRepo, null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const lena = (await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const route = (m: string, p: string) => tabelle.find((r) => r.methode === m && r.pfad === p)!;
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) => route(m, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: b.id === admin.id ? imModus(await ich(b.id)) : await ich(b.id) });
  const { rechnung, position } = await rechnungen(d);
  const suche = async (b: { id: string }, query: Record<string, string>) => (await rufe(b, 'GET', '/api/mappen', { query })).body as Seite;
  const zg = async (b: { id: string }) => d.rechtepruefung.zugriff(b.id === admin.id ? imModus(await ich(b.id)) : await ich(b.id));
  return { d, admin, lena, rechnung, position, rufe, suche, zg, ich };
}

describe('Einstellung am Mappentyp (#1031)', () => {
  const rechnung = { id: 'r', name: 'Rechnung', teilVon: null, system: null };
  const daten = (f: Record<string, unknown>, extra: Partial<MappentypDaten> = {}): MappentypDaten => ({ name: 'Position', beschreibung: '', titelVorlage: '', teilVon: 'rechnung',
    felder: [{ key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTypen: ['r'], pflicht: true, ...f }, { key: 'text', label: 'Text', typ: 'text' }],
    register: [{ key: 'angaben', name: 'Angaben', art: 'felder', felder: ['rechnung', 'text'] }], ...extra });
  const ctx = { eigeneId: 'p', typVon: (id: string) => (id === 'r' ? rechnung : id === 'k' ? { name: 'Kette', teilVon: 'x', system: null } : id === 'b' ? { name: 'Benutzer', teilVon: null, system: 'benutzer' as const } : undefined), teiltypenAuf: () => [] };

  it('ein Pflicht-Verweis auf genau einen anderen Typ, eine Mappe, immer sichtbar – sonst eine Meldung', () => {
    assert.deepEqual(teilProbleme(daten({}), ctx), []);
    assert.match(teilProbleme(daten({}, { teilVon: 'text' }), ctx).join(' '), /Wähle das Verweisfeld/);
    assert.match(teilProbleme(daten({}, { teilVon: 'gibt-es-nicht' }), ctx).join(' '), /Wähle das Verweisfeld/);
    assert.match(teilProbleme(daten({ pflicht: false }), ctx).join(' '), /muss Pflicht sein/);
    assert.match(teilProbleme(daten({ mehrfach: true }), ctx).join(' '), /nur eine Mappe/);
    assert.match(teilProbleme(daten({ zielTypen: ['r', 'k'] }), ctx).join(' '), /genau einen anderen Mappentyp/);
    assert.match(teilProbleme(daten({ zielTypen: ['p'] }), ctx).join(' '), /diesen Mappentyp selbst/);
    assert.match(teilProbleme(daten({ zielTypen: ['k'] }), ctx).join(' '), /Ketten gibt es nicht/);
    assert.match(teilProbleme(daten({ zielTypen: ['b'] }), ctx).join(' '), /Benutzer/);
    assert.match(teilProbleme(daten({ ausgeblendet: true }), ctx).join(' '), /immer zu sehen/);
    assert.match(teilProbleme(daten({}), { ...ctx, teiltypenAuf: () => ['Unterposition'] }).join(' '), /Unterposition/);
    assert.match(teilProbleme(daten({}), { ...ctx, system: 'post' }).join(' '), /Systemmappentypen/);
    // Über die gemeinsame Prüfung im Bereich Grunddaten.
    const p = pruefeMappentyp(daten({ pflicht: false }), { eigeneId: 'p', namenAndererTypen: [], existiertTyp: (id) => id === 'r', teile: ctx });
    assert.ok(p.orte?.includes('grunddaten'));
  });

  it('Teile nie bei „Wohin gehört das?“; die übergeordnete Mappe steht im Feld', () => {
    const t = { ...daten({}), id: 'p', erstellt: '', geaendert: '', register: [{ key: 'd', name: 'Dokumente', art: 'dokumente' as const }] } as Mappentyp;
    assert.equal(kannAusPost(t), false);
    assert.equal(kannAusPost({ ...t, teilVon: null }), true);
    assert.equal(uebergeordneteId(t, { rechnung: 'r1' }), 'r1');
    assert.equal(uebergeordneteId(t, {}), null);
  });

  it('Server: Einstellung gespeichert, ohne die Angabe behalten; Prüfung mit den anderen Typen (keine Ketten)', async () => {
    const { d, rechnung, position } = await aufbau();
    assert.equal(position.teilVon, 'rechnung');
    // Ein älteres Programm ohne teilVon behält die Einstellung.
    const ohne: Partial<Mappentyp> = { ...position };
    delete ohne.teilVon;
    assert.equal((await d.aendereTyp(position.id, ohne)).teilVon, 'rechnung');
    // Pflicht weg: abgelehnt.
    await assert.rejects(d.aendereTyp(position.id, { ...position, felder: position.felder.map((f) => (f.key === 'rechnung' ? { ...f, pflicht: false } : f)) }), status(422, /muss Pflicht sein/));
    // Die Rechnung hat Teile – sie selbst kann keiner werden.
    const kunde = await d.legeTypAn({ name: 'Kunde', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    await assert.rejects(d.aendereTyp(rechnung.id, { ...rechnung, felder: [...rechnung.felder, { key: 'kunde', label: 'Kunde', typ: 'referenz', zielTypen: [kunde.id], pflicht: true }], teilVon: 'kunde' }), status(422, /Rechnungsposition/));
    // Ein Typ, der zu Positionen gehören soll: Kette.
    await assert.rejects(d.legeTypAn({ name: 'Unterposition', teilVon: 'position', felder: [{ key: 'position', label: 'Position', typ: 'referenz', zielTypen: [position.id], pflicht: true }] }), status(422, /Ketten/));
  });

  it('keine eigene Ansicht; einschalten nimmt den Typ aus den Ansichten, ausschalten gibt ihm seine zurück', async () => {
    const { d, rechnung, position } = await aufbau();
    const sichten = async () => d.listeSichten();
    assert.ok((await sichten()).some((s) => s.id === rechnung.id));
    assert.equal((await sichten()).some((s) => s.id === position.id), false);
    // Ein eigenständiger Typ mit Ansicht und einer gemeinsamen Ansicht mit der Rechnung.
    const notiz = await d.legeTypAn({ name: 'Notizzettel', felder: [{ key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTypen: [rechnung.id], pflicht: true }, { key: 'text', label: 'Text', typ: 'text' }] });
    const gemeinsam = await d.legeSichtAn({ name: 'Belege', typen: [rechnung.id, notiz.id], bedingungen: [] });
    assert.ok((await sichten()).some((s) => s.id === notiz.id));
    const an = await d.aendereTyp(notiz.id, { ...notiz, teilVon: 'rechnung' });
    assert.equal((await sichten()).some((s) => s.id === notiz.id), false);
    assert.deepEqual((await sichten()).find((s) => s.id === gemeinsam.id)?.typen, [rechnung.id]);
    await d.aendereTyp(notiz.id, { ...an, teilVon: null });
    assert.ok((await sichten()).some((s) => s.id === notiz.id));
  });
});

describe('Ansichten, Suche und direkter Zugriff (#1031)', () => {
  /** r1 mit p1 „Bohrmaschine“; r2 mit p2 „Akkuschrauber“ (privat, für Lena nicht lesbar); r3 privat mit p3 „Stichsäge“. */
  async function mitMappen() {
    const a = await aufbau();
    const { d, admin, rechnung, position } = a;
    await d.setzeBerechtigungen(rechnung.id, privatNurErsteller, true);
    await d.setzeBerechtigungen(position.id, privatNurErsteller, true);
    const r1 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, admin.id);
    const r2 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2' } }, admin.id);
    const r3 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-3', privat: true } }, admin.id);
    const p1 = await d.legeMappeAn({ typId: position.id, werte: { rechnung: r1.id, nr: 1, beschreibung: 'Bohrmaschine' } }, admin.id);
    const p2 = await d.legeMappeAn({ typId: position.id, werte: { rechnung: r2.id, nr: 1, beschreibung: 'Akkuschrauber', privat: true } }, admin.id);
    const p3 = await d.legeMappeAn({ typId: position.id, werte: { rechnung: r3.id, nr: 1, beschreibung: 'Stichsäge' } }, admin.id);
    return { ...a, r1, r2, r3, p1, p2, p3 };
  }
  const ids = (s: Seite) => s.mappen.map((m) => m.id).sort();

  it('nicht in Ansichten (auch „alle Mappentypen“), nicht in der erweiterten Suche, aber über typ:<Id> wie alle Mappen', async () => {
    const { d, admin, suche, rechnung, position, r1, r2, r3, p1 } = await mitMappen();
    const alle = await d.legeSichtAn({ name: 'Alles', typen: [ALLE_TYPEN], bedingungen: [] });
    // Neben Benutzern und Rollen die drei Rechnungen – keine Position.
    const ohneSystem = async (q: Record<string, string>) => (await suche(admin, q)).mappen.filter((m) => m.typId === rechnung.id || m.typId === position.id).map((m) => m.id).sort();
    assert.deepEqual(await ohneSystem({ sicht: alle.id }), [r1.id, r2.id, r3.id].sort());
    assert.deepEqual(await ohneSystem({ sicht: 'suche', link: '' }), [r1.id, r2.id, r3.id].sort());
    assert.deepEqual(ids(await suche(admin, { sicht: 'suche', link: `typ=${position.schluessel}` })), []);
    assert.equal((await suche(admin, { sicht: `typ:${position.id}` })).gesamt, 3);
    // Zahlen der Ansichten zählen sie nicht.
    const z = await d.zaehler({ id: admin.id, rolle: 'admin' });
    assert.equal(z.sichten[alle.id], (await suche(admin, { sicht: alle.id })).gesamt);
    assert.equal(z.sichten[rechnung.id], 3);
    assert.ok(p1.id);
  });

  it('Suche: was in einem Teil steht, findet die übergeordnete Mappe („gefunden in …“) – auch in ihrer Ansicht', async () => {
    const { admin, suche, rechnung, r1, p1 } = await mitMappen();
    const s = await suche(admin, { sicht: 'suche', link: '', suche: 'Bohrmaschine' });
    assert.deepEqual(ids(s), [r1.id]);
    assert.deepEqual(s.ausschnitte?.[r1.id]?.teil, { id: p1.id, typId: p1.typId, titel: '1. Bohrmaschine' });
    assert.deepEqual(ids(await suche(admin, { sicht: rechnung.id, suche: 'bohrmasch' })), [r1.id]);
    // Erweiterte Suche mit Textfilter in Dokumenten ohne Treffer dort: nichts.
    assert.deepEqual(ids(await suche(admin, { sicht: 'suche', link: 'volltext=Bohrmaschine&in=dokumente' })), []);
  });

  it('nur, wenn man beide lesen darf: kein Hinweis auf nicht lesbare Teile, keine nicht lesbare Mappe (Ergänzung Sicherheit)', async () => {
    const { lena, admin, suche, r1, r2, r3 } = await mitMappen();
    assert.deepEqual(ids(await suche(lena, { sicht: 'suche', link: '', suche: 'Bohrmaschine' })), [r1.id]);
    // p2 darf Lena nicht lesen – r2 (lesbar) wird über das Wort darin nicht gefunden.
    assert.deepEqual(ids(await suche(lena, { sicht: 'suche', link: '', suche: 'Akkuschrauber' })), []);
    // r3 darf Lena nicht lesen – auch über den lesbaren Teil nicht.
    assert.deepEqual(ids(await suche(lena, { sicht: 'suche', link: '', suche: 'Stichsäge' })), []);
    assert.deepEqual(ids(await suche(admin, { sicht: 'suche', link: '', suche: 'Akkuschrauber' })), [r2.id]);
    assert.deepEqual(ids(await suche(admin, { sicht: 'suche', link: '', suche: 'Stichsäge' })), [r3.id]);
  });

  it('direkter Link und Schnittstelle prüfen die normalen Rechte; „Zuletzt geöffnet“ zeigt keine Teile', async () => {
    const { d, lena, rufe, zg, p1, p2, r1 } = await mitMappen();
    const m = await d.holeMappe(p1.id, await zg(lena));
    assert.equal(m.mappe.id, p1.id);
    assert.equal(m.bezuege[r1.id]?.titel, 'R-1');
    await assert.rejects(d.holeMappe(p2.id, await zg(lena)), status(404));
    // Öffnen merkt die Mappe nach der Antwort (#741).
    for (const id of [p1.id, r1.id]) for (const f of (await rufe(lena, 'GET', '/api/mappen/:id', { params: { id } })).danach ?? []) await f();
    const start = (await rufe(lena, 'GET', '/api/startseite/zuletzt')).body as Array<{ id: string }>;
    assert.deepEqual(start.map((x) => x.id), [r1.id]);
  });
});

describe('Leserechte als Vorgabe (#1031)', () => {
  it('beim Einschalten übernommen, nur Lesen; Regeln mit fehlendem Feld nicht; danach nicht verbunden', async () => {
    const { d, rechnung } = await aufbau();
    const nurBuero: Regelwerk = { grund: { ...ALLES, R: false }, regeln: [
      ...privatNurErsteller.regeln,
      { id: 'kunde', name: 'Kundenrechnungen', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'nr', op: 'enthaelt', wert: { art: 'fest', wert: 'K' } } }], dann: { R: 'erteilen' }, stopp: false },
      { id: 'u', name: 'Nur bearbeiten', wenn: [{ art: 'rolle', rollen: ['x'] }], dann: { U: 'entziehen' }, stopp: false },
    ] };
    await d.setzeBerechtigungen(rechnung.id, nurBuero, true);
    const notiz = await d.legeTypAn({ name: 'Notizzettel', felder: [{ key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTypen: [rechnung.id], pflicht: true }, { key: 'privat', label: 'Privat', typ: 'janein' }] });
    assert.equal(notiz.berechtigungen ?? null, null);
    const an = await d.aendereTyp(notiz.id, { ...notiz, teilVon: 'rechnung' });
    assert.equal(an.berechtigungen?.grund.R, false);
    assert.equal(an.berechtigungen?.grund.U, true);
    // „privat“ gibt es am Teil – übernommen, nur mit der Wirkung auf Lesen; „nr“ nicht (ausgelassen), „U“ gar nicht.
    assert.deepEqual(an.berechtigungen?.regeln.map((r) => [r.name, r.dann]), [['Privat nur für den Ersteller', { R: 'entziehen' }]]);
    // Spätere Änderungen an der Rechnung gelten nicht mit.
    await d.setzeBerechtigungen(rechnung.id, null, true);
    assert.equal((await d.listeTypen()).find((t) => t.id === notiz.id)?.berechtigungen?.grund.R, false);
    // Eigene Berechtigungen bleiben unangetastet.
    const eigen = await d.legeTypAn({ name: 'Anhang', felder: [{ key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTypen: [rechnung.id], pflicht: true }] });
    await d.setzeBerechtigungen(rechnung.id, nurBuero, true);
    await d.setzeBerechtigungen(eigen.id, { grund: { ...ALLES, D: false }, regeln: [] }, true);
    const e2 = await d.aendereTyp(eigen.id, { ...(await d.listeTypen()).find((t) => t.id === eigen.id)!, teilVon: 'rechnung' });
    assert.deepEqual(e2.berechtigungen?.grund, { ...ALLES, D: false });
  });

  it('leserechteAus: Grundeinstellung Lesen und Regeln zum Lesen, übrige Rechte bleiben', () => {
    const r = leserechteAus({ grund: { ...ALLES, R: false, D: false }, regeln: [{ id: 'a', name: 'A', wenn: [{ art: 'aufgabe' }], dann: { R: 'erteilen', U: 'erteilen' }, stopp: true }] }, { grund: ALLES, regeln: [] }, (x) => x);
    assert.deepEqual(r.regelwerk.grund, { ...ALLES, R: false });
    assert.deepEqual(r.regelwerk.regeln.map((x) => x.dann), [{ R: 'erteilen' }]);
    assert.equal(r.ausgelassen, 0);
  });
});

describe('Löschen und Papierkorb (#1031)', () => {
  async function mitRechnung(repo?: Repo) {
    const a = await aufbau(repo);
    const r = await a.d.legeMappeAn({ typId: a.rechnung.id, werte: { nr: 'R-7' } }, a.lena.id);
    const p1 = await a.d.legeMappeAn({ typId: a.position.id, werte: { rechnung: r.id, nr: 1, beschreibung: 'Schrauben' } }, a.lena.id);
    const p2 = await a.d.legeMappeAn({ typId: a.position.id, werte: { rechnung: r.id, nr: 2, beschreibung: 'Dübel' } }, a.lena.id);
    return { ...a, r, p1, p2 };
  }

  it('die Teile gehen mit – ein Vorgang, Löschprotokoll „mit ihren Teilen“; die Mappe zeigt vorher, wie viele', async () => {
    const { d, lena, zg, r, p1, p2 } = await mitRechnung();
    const vorher = await d.holeMappe(r.id, await zg(lena));
    assert.deepEqual(vorher.loeschbar, { ok: true, teile: 2 });
    await d.loescheMappe(r.id, lena.id, await zg(lena));
    for (const id of [r.id, p1.id, p2.id]) assert.equal(await d.kern.repo.holeMappe(id), undefined);
    const korb = await d.papierkorb({ id: lena.id, rolle: 'mitglied' });
    assert.deepEqual(korb.map((e) => [e.id, e.vorgang]).sort(), [[r.id, r.id], [p1.id, r.id], [p2.id, r.id]].sort());
    const lp = (await d.loeschprotokoll({})).eintraege.filter((e) => e.art === 'mappe');
    assert.deepEqual(lp.map((e) => [e.mappeId, e.weg, e.vorgang]).sort(), [[r.id, 'teile', r.id], [p1.id, 'teile', r.id], [p2.id, 'teile', r.id]].sort());
  });

  it('ohne Recht an einem Teil: abgelehnt mit der Anzahl, nichts gelöscht (Ergänzung Sicherheit)', async () => {
    const { d, admin, lena, zg, r, position, p1 } = await mitRechnung();
    // Eine Position hat der Administrator angelegt und als privat markiert – Lena darf sie weder lesen noch löschen.
    await d.setzeBerechtigungen(position.id, privatNurErsteller, true);
    await d.legeMappeAn({ typId: position.id, werte: { rechnung: r.id, nr: 3, beschreibung: 'Privat', privat: true } }, admin.id);
    await assert.rejects(d.loescheMappe(r.id, lena.id, await zg(lena)), status(403, /1 Teil/));
    assert.ok(await d.kern.repo.holeMappe(r.id));
    assert.ok(await d.kern.repo.holeMappe(p1.id));
    // Mit verknüpften Mappen löschen: Der nicht lesbare Teil fehlt im Baum und hält die Rechnung – sie bleibt samt ihm.
    const v = await d.loeschVorschau(r.id, {}, await zg(lena));
    assert.equal(v.baum.knoten.length, 3);
    const x = await d.loescheMitVerknuepften(r.id, { auswahl: Object.fromEntries(v.baum.knoten.map((k) => [k.id, 'loeschen'])) }, lena.id, await zg(lena));
    assert.equal(x.loeschen.includes(r.id), false);
    assert.ok(await d.kern.repo.holeMappe(r.id));
  });

  it('mit verknüpften Mappen: Teile lassen sich nicht abwählen oder nur entkoppeln, solange ihre Mappe geht', async () => {
    const { d, lena, zg, r, p1, p2 } = await mitRechnung();
    const v = await d.loeschVorschau(r.id, {}, await zg(lena));
    await assert.rejects(d.loescheMitVerknuepften(r.id, { auswahl: { [r.id]: 'loeschen', [p1.id]: 'loeschen', [p2.id]: 'entkoppeln' } }, lena.id, await zg(lena)), status(409, /gehört 1 Teil/));
    assert.ok(await d.kern.repo.holeMappe(p2.id));
    const x = await d.loescheMitVerknuepften(r.id, { auswahl: v.vorschlag }, lena.id, await zg(lena));
    assert.deepEqual([...x.loeschen].sort(), [r.id, p1.id, p2.id].sort());
  });

  it('wiederherstellen: die Mappe bringt ihre Teile mit; ein Teil allein erst mit ihr; endgültig löschen nimmt sie mit', async () => {
    const { d, lena, zg, r, p1, p2 } = await mitRechnung();
    const L = { id: lena.id, rolle: 'mitglied' };
    await d.loescheMappe(r.id, lena.id, await zg(lena));
    await assert.rejects(d.stelleWiederHer(p1.id, L), status(409, /übergeordneten Mappe/));
    const w = await d.stelleWiederHer(r.id, L);
    assert.equal(w.mappe.id, r.id);
    for (const id of [r.id, p1.id, p2.id]) assert.ok(await d.kern.repo.holeMappe(id));
    assert.deepEqual((await d.papierkorb(L)).length, 0);
    const lp = (await d.loeschprotokoll({ schritt: 'wiederhergestellt' })).eintraege.filter((e) => e.art === 'mappe');
    assert.equal(lp.length, 3);
    // Ein einzelner Teil lässt sich allein löschen und allein wiederherstellen.
    await d.loescheMappe(p2.id, lena.id, await zg(lena));
    await d.stelleWiederHer(p2.id, L);
    // Endgültig aus dem Papierkorb: die Teile gehen mit.
    await d.loescheMappe(r.id, lena.id, await zg(lena));
    assert.equal(await d.loescheEndgueltig([r.id], L), 3);
    assert.deepEqual(await d.papierkorb(L), []);
  });

  it('mehrere auswählen samt Teilen; ohne Papierkorb sofort endgültig', async () => {
    const { d, lena, zg, r, p1, p2 } = await mitRechnung();
    const x = await d.loescheMappen({ ids: [p1.id, r.id] }, lena.id, await zg(lena));
    assert.equal(x.ausgelassen.length, 0);
    for (const id of [r.id, p1.id, p2.id]) assert.equal(await d.kern.repo.holeMappe(id), undefined);
    const b = await mitRechnung();
    await b.d.setzePapierkorbTage(0);
    await b.d.loescheMappe(b.r.id, b.lena.id, await b.zg(b.lena));
    assert.deepEqual(await b.d.papierkorb({ id: b.lena.id, rolle: 'mitglied' }), []);
    for (const id of [b.r.id, b.p1.id]) assert.equal(await b.d.kern.repo.holeMappe(id), undefined);
  });
});

describe('Paketformat (#1031)', () => {
  const manifest = 'schema: 1\nid: rechnungen_test\nname: Rechnungen (Test)\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=0.235.0"\ninhalt: { mappentypen: mappentypen.yaml }\n';
  // Schreibweise wie im Entwurf des Pakets Rechnungen (dms-registry #172): gehoertZu nennt das Verweisfeld.
  const typen = (gehoert: string, feld = '{ key: rechnung, label: Rechnung, typ: referenz, ziel: rechnung, pflicht: true, verweisart: zugehoerigkeit }') => `- schluessel: rechnung
  name: Rechnung
  felder:
    - { key: nr, label: Nr., typ: text }
    - key: positionen
      label: Positionen
      typ: tabelle
      quelle: { typ: rechnungsposition, feld: rechnung, trefferliste: standard, neu: "+ Position" }
  register:
    - { key: rechnung, name: Rechnung, art: felder, felder: [nr, positionen] }
- schluessel: rechnungsposition
  name: Rechnungsposition
  beschreibung: Eine Zeile einer Rechnung. Gehört immer zu ihrer Rechnung und erscheint nur dort.
  titelVorlage: "{nr}. {beschreibung}"
${gehoert}
  felder:
    - ${feld}
    - { key: nr, label: Nr., typ: zahl }
    - { key: beschreibung, label: Beschreibung, typ: text, maxLen: 300, pflicht: true }
  register:
    - { key: position, name: Position, art: felder, felder: [rechnung, nr, beschreibung] }
  trefferliste: [nr, beschreibung]
`;
  const lies = (g: string, f?: string) => liesPaket(new Map([['manifest.yaml', Buffer.from(manifest)], ['mappentypen.yaml', Buffer.from(typen(g, f))]]));
  const gruende = (e: unknown) => (e instanceof Fachfehler ? ((e.details as { gruende?: string[] })?.gruende ?? [e.message]) : []).join(' | ');

  it('Lesen und Prüfen: gehoertZu nennt ein Pflicht-Verweisfeld mit einem Ziel; keine Ketten', () => {
    assert.equal(lies('  gehoertZu: rechnung').typen[1].gehoertZu, 'rechnung');
    assert.equal(lies('').typen[1].gehoertZu, undefined);
    assert.throws(() => lies('  gehoertZu: nr'), (e) => /Verweis auf genau einen Mappentyp/.test(gruende(e)));
    assert.throws(() => lies('  gehoertZu: fehlt'), (e) => /nennt kein Feld/.test(gruende(e)));
    assert.throws(() => lies('  gehoertZu: rechnung', '{ key: rechnung, label: Rechnung, typ: referenz, ziel: rechnung }'), (e) => /pflicht: true/.test(gruende(e)));
    assert.throws(() => lies('  gehoertZu: rechnung', '{ key: rechnung, label: Rechnung, typ: referenz, ziel: rechnung, pflicht: true, mehrfach: true }'), (e) => /nur auf eine Mappe/.test(gruende(e)));
    assert.throws(() => lies('  gehoertZu: rechnung', '{ key: rechnung, label: Rechnung, typ: referenz, ziel: [rechnung, rechnungsposition], pflicht: true }'), (e) => /genau einen Mappentyp/.test(gruende(e)));
    assert.throws(() => lies('  gehoertZu: rechnung', '{ key: rechnung, label: Rechnung, typ: referenz, ziel: rechnungsposition, pflicht: true }'), (e) => /eigenen Typs/.test(gruende(e)));
  });

  it('Installieren aus der Schreibweise der Registry, Erstellen mit Mindestversion, Update schaltet ein', async () => {
    const dms = () => {
      const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      return { d, p: new Paketverwaltung(d, { version: () => DMS_TEILE_AB, katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } }), e: new Paketerstellung(d, { version: () => DMS_TEILE_AB }) };
    };
    const { zipPuffer } = await import('../src/zip');
    const zip = (g: string, version = '1.0.0') => zipPuffer([{ name: 'rechnungen_test/manifest.yaml', daten: Buffer.from(manifest.replace('mappentypen.yaml', 'inhalt/mappentypen.yaml').replace('1.0.0', version)) }, { name: 'rechnungen_test/inhalt/mappentypen.yaml', daten: Buffer.from(typen(g)) }]);
    const a = dms();
    const h = await a.p.hochladen(zip('  gehoertZu: rechnung'), ICH);
    assert.deepEqual(h.vorschau.probleme, []);
    const paket = await a.p.installiere({ upload: h.upload, bestaetigt: true }, ICH);
    const pos = (await a.d.listeTypen()).find((t) => t.id === paket.typen.rechnungsposition)!;
    assert.equal(pos.teilVon, 'rechnung');
    assert.equal((await a.d.listeSichten()).some((s) => s.id === pos.id), false);
    // Paket erstellen schreibt gehoertZu und hebt die Mindestversion.
    assert.equal(mindestversion(['teile']).version, DMS_TEILE_AB);
    const b = dms();
    const { rechnung, position } = await rechnungen(b.d);
    const angaben = { typen: [rechnung.id, position.id], sichten: [], beispiele: [], id: 'rechnungen_eigen', name: 'Rechnungen (eigen)', version: '1.0.0', beschreibung: 'Rechnungen mit Positionen.',
      autor: { name: 'Lena Beispiel', github: 'lena' }, lizenz: 'MIT', dms: `>=${DMS_TEILE_AB}`, aenderungen: '' };
    const z = await b.e.exportiere(angaben, ICH);
    const inhalt = parse(liesZip(z.daten).get('rechnungen_eigen/inhalt/mappentypen.yaml')!.toString()) as Array<{ schluessel: string; gehoertZu?: string }>;
    assert.equal(inhalt.find((t) => t.schluessel === 'rechnungsposition')?.gehoertZu, 'rechnung');
    assert.equal(inhalt.find((t) => t.schluessel === 'rechnung')?.gehoertZu, undefined);
    // Update: Version 1.0.0 ohne, 1.1.0 mit gehoertZu – schaltet ein.
    const c = dms();
    const h1 = await c.p.hochladen(zip(''), ICH);
    const p1 = await c.p.installiere({ upload: h1.upload, bestaetigt: true }, ICH);
    assert.equal(istTeiltyp((await c.d.listeTypen()).find((t) => t.id === p1.typen.rechnungsposition)), false);
    const h2 = await c.p.hochladen(zip('  gehoertZu: rechnung', '1.1.0'), ICH);
    await c.p.installiere({ upload: h2.upload, bestaetigt: true }, ICH);
    assert.equal((await c.d.listeTypen()).find((t) => t.id === p1.typen.rechnungsposition)?.teilVon, 'rechnung');
  });
});

describe('Teile – PostgreSQL (#1031)', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('Suche über Teile mit Lesefilter, Löschen und Wiederherstellen samt Teilen in der Datenbank', async () => {
    const db = await eigeneDatenbank('teile');
    const { pgRepo } = await import('../src/repo-pg');
    const { pgKontoRepo } = await import('../src/konto-repo');
    const haushalt = '00000000-0000-4000-8000-000000000001';
    try {
      const { d, admin, lena, suche, zg, rechnung, position } = await aufbau(pgRepo(db.sql, haushalt) as never as Repo, pgKontoRepo(db.sql, haushalt));
      assert.equal((await d.listeTypen()).find((t) => t.id === position.id)?.teilVon, 'rechnung');
      await d.setzeBerechtigungen(position.id, privatNurErsteller, true);
      const r1 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, lena.id);
      const r2 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2' } }, admin.id);
      const p1 = await d.legeMappeAn({ typId: position.id, werte: { rechnung: r1.id, nr: 1, beschreibung: 'Bohrmaschine' } }, lena.id);
      await d.legeMappeAn({ typId: position.id, werte: { rechnung: r2.id, nr: 1, beschreibung: 'Akkuschrauber', privat: true } }, admin.id);
      const s = await suche(lena, { sicht: 'suche', link: '', suche: 'bohrmaschine' });
      assert.deepEqual(s.mappen.map((m) => m.id), [r1.id]);
      assert.equal(s.ausschnitte?.[r1.id]?.teil?.id, p1.id);
      assert.equal((await suche(lena, { sicht: 'suche', link: '', suche: 'Akkuschrauber' })).gesamt, 0);
      assert.equal((await suche(admin, { sicht: rechnung.id, suche: 'Akkuschrauber' })).gesamt, 1);
      // Mit Textfilter und Suche zugleich zählt der Fund im Teil für beides.
      assert.equal((await suche(admin, { sicht: 'suche', link: '', suche: 'Akkuschrauber', volltext: 'true' })).gesamt, 1);
      await d.loescheMappe(r1.id, lena.id, await zg(lena));
      assert.equal(await d.kern.repo.holeMappe(p1.id), undefined);
      await d.stelleWiederHer(r1.id, { id: lena.id, rolle: 'mitglied' });
      assert.ok(await d.kern.repo.holeMappe(p1.id));
      const lp = (await d.loeschprotokoll({})).eintraege.filter((e) => e.art === 'mappe' && e.weg === 'teile');
      assert.equal(lp.length, 2);
    } finally { await db.ende(); }
  });
});
