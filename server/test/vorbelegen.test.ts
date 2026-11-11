/**
 * Beim Auswählen übernehmen (#1037): Werte aus der verwiesenen Mappe vorschlagen.
 * - Mappentyp: Paare gespeichert und geprüft (Felder gibt es, passen zusammen, nie Passwortfelder), Typvergleich, Schnittstelle.
 * - Vorschläge für die Oberfläche (/api/mappen/vorbelegen): Werte nach Feldart, nur gültige, nie in berechnete Felder,
 *   nie aus Passwortfeldern, nur mit Leserecht – auch für Verweise in den Werten.
 * - Mehrere Zieltypen (#1036): je Typ, der das Feld hat.
 * - Aus Dokument ausfüllen / „Dokument übernehmen“: Werte der vorgeschlagenen Mappe mit `aus`, das Dokument geht vor,
 *   beim Bearbeiten nur leere Felder, mit den Rechten der Person, nie an ein KI-Paket.
 * - Paketformat: `vorbelegen: [{ von, nach }]` lesen und prüfen, installieren, aktualisieren, „Paket erstellen“.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { bereinigeVorbelegen, moeglicheVon, passtZusammen, vorbelegenProbleme } from '../../shared/src/vorbelegen';
import { typBild, typUnterschiede } from '../../shared/src/typvergleich';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import type { Feld, Mappentyp } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen } from '../src/routen';
import { openapi } from '../src/api-v1';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { baue, mindestversion } from '../src/paketerstellung';
import { zipPuffer } from '../src/zip';
import { Tresor } from '../src/tresor';
import { liesCode, type InstalliertesPaket } from '../../shared/src/pakete';

const meldet = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && re.test(JSON.stringify(e.details ?? {}) + e.message);
const OPTIONEN = ['laufzeitende', 'monatsende'];
const PAARE = [
  { von: 'kuendigungsfrist', nach: 'kuendigungsfrist' }, { von: 'kuendigung_zum', nach: 'kuendigung_zum' },
  { von: 'anbieter', nach: 'anbieter' }, { von: 'hinweis', nach: 'bemerkung' }, { von: 'online', nach: 'online' },
];

/** Schlüssel für Passwortfelder (#46) – die Vertragsart hat eins, das nie übernommen werden darf. */
async function tresor() {
  const m = new Map<string, unknown>();
  const t = new Tresor({ async lies(k: string) { return m.get(k) ?? null; }, async schreibe(k: string, w: unknown) { m.set(k, structuredClone(w)); } }, join(await mkdtemp(join(tmpdir(), 'dms-vb-')), 'dms.schluessel'), () => null);
  await t.laden();
  await t.erzeuge();
  return t;
}

/** Vertragsart mit üblichen Fristen, Vertrag mit „Art“ und den Paaren; ein berechnetes Feld „Kündigen bis“. */
async function aufbau(extra: { zu?: Regelwerk } = {}) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor: await tresor() });
  const organisation = await d.mappentypen.legeTypAn({ name: 'Organisation', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }], ...(extra.zu ? { berechtigungen: extra.zu } : {}) });
  const vertragsart = await d.mappentypen.legeTypAn({ name: 'Vertragsart', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text' },
    { key: 'kuendigungsfrist', label: 'Kündigungsfrist', typ: 'zeitraum' },
    { key: 'kuendigung_zum', label: 'Kündigung zum', typ: 'auswahl', optionen: OPTIONEN },
    { key: 'anbieter', label: 'Üblicher Anbieter', typ: 'referenz', zielTyp: organisation.id },
    { key: 'hinweis', label: 'Hinweis', typ: 'text' },
    { key: 'online', label: 'Online kündbar', typ: 'janein' },
    { key: 'pin', label: 'Kundenkennwort', typ: 'passwort' },
    { key: 'kuendigen_bis', label: 'Kündigen bis', typ: 'datum' },
  ] });
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{bezeichnung}', felder: [
    { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text' },
    { key: 'art', label: 'Vertragsart', typ: 'referenz', zielTyp: vertragsart.id, erkennung: {}, vorbelegen: [...PAARE, { von: 'kuendigen_bis', nach: 'kuendigen_bis' }] },
    { key: 'kuendigungsfrist', label: 'Kündigungsfrist', typ: 'zeitraum', erkennung: {} },
    { key: 'kuendigung_zum', label: 'Kündigung zum', typ: 'auswahl', optionen: [...OPTIONEN, 'jahresende'] },
    { key: 'anbieter', label: 'Anbieter', typ: 'referenz', zielTyp: organisation.id },
    { key: 'bemerkung', label: 'Bemerkungen', typ: 'langtext' },
    { key: 'online', label: 'Online kündbar', typ: 'janein' },
    // Berechnet (#1034): schreibt nur das Paket – auch kein Vorschlag aus der Vertragsart.
    { key: 'kuendigen_bis', label: 'Kündigen bis', typ: 'datum', berechnetVon: 'vertraege' },
  ] }, 'vertraege');
  const telekom = await d.legeMappeAn({ typId: organisation.id, werte: { name: 'Funknetz Beispiel AG' } });
  const mobilfunk = await d.legeMappeAn({ typId: vertragsart.id, werte: { name: 'Mobilfunk', kuendigungsfrist: { anzahl: 3, einheit: 'monate' }, kuendigung_zum: 'laufzeitende', anbieter: telekom.id, hinweis: 'Rufnummer mitnehmen', online: true, pin: { neu: 'geheim-1234' }, kuendigen_bis: '2027-01-31' } });
  const strom = await d.legeMappeAn({ typId: vertragsart.id, werte: { name: 'Strom', kuendigungsfrist: { anzahl: 2, einheit: 'wochen' }, kuendigung_zum: 'monatsende', online: false } });
  return { d, organisation, vertragsart, vertrag, telekom, mobilfunk, strom };
}

describe('Beim Auswählen übernehmen – Mappentyp (#1037)', () => {
  it('wird gespeichert, steht im Typvergleich und in der Schnittstelle; an anderen Feldarten fällt es weg', async () => {
    const { d, vertrag, vertragsart } = await aufbau();
    assert.equal(vertrag.felder.find((f) => f.key === 'art')?.vorbelegen?.length, 6);
    const ohne = { ...vertrag, felder: vertrag.felder.map((f) => ({ ...f, vorbelegen: undefined })) } as Mappentyp;
    assert.match(typUnterschiede(typBild(ohne), typBild(vertrag))?.liste.join(' ') ?? '', /Vertragsart“: Beim Auswählen übernehmen/);
    const doku = JSON.stringify(openapi('test'));
    assert.ok(doku.includes('"vorbelegen"') && doku.includes('vorgeschlagen aus'));
    const t2 = await d.mappentypen.legeTypAn({ name: 'Notiz', felder: [{ key: 'text', label: 'Text', typ: 'text', vorbelegen: [{ von: 'a', nach: 'b' }] }, { key: 'art', label: 'Art', typ: 'referenz', zielTyp: vertragsart.id, vorbelegen: [{ von: 'kuendigungsfrist', nach: 'frist' }, { von: 'name', nach: 'frist' }, { von: 'X y', nach: 'frist' }] }, { key: 'frist', label: 'Frist', typ: 'zeitraum' }] });
    assert.equal(t2.felder[0].vorbelegen, undefined, 'nur an Verweisfeldern');
    assert.deepEqual(t2.felder[1].vorbelegen, [{ von: 'kuendigungsfrist', nach: 'frist' }], 'je Zielfeld ein Paar, gültige Kennungen');
  });

  it('Prüfung: Felder gibt es, sie passen zusammen, nie Passwortfelder', async () => {
    const { d, vertragsart, organisation } = await aufbau();
    const typMit = (vorbelegen: unknown, felder: unknown[] = []) => d.mappentypen.legeTypAn({ name: `T${Math.random()}`, felder: [
      { key: 'art', label: 'Art', typ: 'referenz', zielTyp: vertragsart.id, vorbelegen },
      { key: 'frist', label: 'Frist', typ: 'zeitraum' }, { key: 'text', label: 'Text', typ: 'text' }, { key: 'kennwort', label: 'Kennwort', typ: 'passwort' }, ...felder] });
    await assert.rejects(typMit([{ von: 'kuendigungsfrist', nach: 'fehlt' }]), meldet(/„fehlt“ gibt es in diesem Mappentyp nicht/));
    await assert.rejects(typMit([{ von: 'gibtsnicht', nach: 'frist' }]), meldet(/„gibtsnicht“ gibt es in keinem Ziel-Mappentyp/));
    await assert.rejects(typMit([{ von: 'pin', nach: 'text' }]), meldet(/Kundenkennwort“ ist ein Passwortfeld/));
    await assert.rejects(typMit([{ von: 'hinweis', nach: 'kennwort' }]), meldet(/Kennwort“ ist ein Passwortfeld/));
    await assert.rejects(typMit([{ von: 'name', nach: 'frist' }]), meldet(/„Name“ passt nicht zu „Frist“/));
    await assert.rejects(typMit([{ von: 'kuendigungsfrist', nach: 'art' }]), meldet(/nicht in sich selbst/));
    // Auswahl: jede Option der Quelle muss es im Ziel geben; Verweise auf denselben Zieltyp.
    await assert.rejects(typMit([{ von: 'kuendigung_zum', nach: 'zum' }], [{ key: 'zum', label: 'Zum', typ: 'auswahl', optionen: ['laufzeitende'] }]), meldet(/passt nicht/));
    await assert.rejects(typMit([{ von: 'anbieter', nach: 'wer' }], [{ key: 'wer', label: 'Wer', typ: 'referenz', zielTyp: vertragsart.id }]), meldet(/passt nicht/));
    // Text auch in Langtext; Verweis auf denselben Typ passt.
    const ok = await typMit([{ von: 'hinweis', nach: 'lang' }, { von: 'anbieter', nach: 'wer' }], [{ key: 'lang', label: 'Lang', typ: 'langtext' }, { key: 'wer', label: 'Wer', typ: 'referenz', zielTyp: organisation.id }]);
    assert.equal(ok.felder[0].vorbelegen?.length, 2);
  });

  it('reine Funktionen: Mehrfachwerte nur in Mehrfachfelder, Passwörter und Tabellen nie, Bereinigen', () => {
    const f = (x: Partial<Feld>): Feld => ({ key: 'x', label: 'X', typ: 'text', ...x });
    assert.equal(passtZusammen(f({ typ: 'auswahl', mehrfach: true, optionen: ['a'] }), f({ typ: 'auswahl', optionen: ['a'] })), false);
    assert.equal(passtZusammen(f({ typ: 'auswahl', optionen: ['a'] }), f({ typ: 'auswahl', mehrfach: true, optionen: ['a', 'b'] })), true);
    assert.equal(passtZusammen(f({ typ: 'passwort' }), f({ typ: 'passwort' })), false);
    assert.equal(passtZusammen(f({ typ: 'langtext' }), f({ typ: 'text' })), false, 'Langtext nicht in Text (Länge)');
    assert.equal(passtZusammen(f({ typ: 'tabelle' }), f({ typ: 'tabelle' })), false);
    assert.deepEqual(bereinigeVorbelegen([{ von: 'a', nach: 'b' }, { von: 'c', nach: 'b' }, 'x', { von: '', nach: 'd' }]), [{ von: 'a', nach: 'b' }]);
    assert.deepEqual(vorbelegenProbleme([f({ key: 'r', typ: 'referenz', zielTypen: ['*'], vorbelegen: [{ von: 'a', nach: 'b' }] })], f({ key: 'r', typ: 'referenz', zielTypen: ['*'], vorbelegen: [{ von: 'a', nach: 'b' }] }), () => undefined).length, 1, 'nicht an „jede Mappe“');
    // Passwortfelder der Ziele sind nie wählbar.
    assert.deepEqual(moeglicheVon([[f({ key: 'pin', typ: 'passwort' }), f({ key: 'a' })]], f({ key: 'b' })).map((x) => x.key), ['a']);
  });
});

describe('Beim Auswählen übernehmen – Vorschläge (#1037)', () => {
  it('liefert die Werte der gewählten Mappe – gültig, ohne Passwort, nie in berechnete Felder, nichts Leeres', async () => {
    const { d, vertrag, mobilfunk, strom, telekom } = await aufbau();
    const r = await d.vorbelegen({ typId: vertrag.id, feldKey: 'art', id: mobilfunk.id });
    assert.deepEqual(r.felder, { kuendigungsfrist: { anzahl: 3, einheit: 'monate' }, kuendigung_zum: 'laufzeitende', anbieter: telekom.id, bemerkung: 'Rufnummer mitnehmen', online: true });
    assert.equal(r.titel, 'Mobilfunk');
    assert.equal(r.bezuege[telekom.id]?.titel, 'Funknetz Beispiel AG');
    assert.ok(!JSON.stringify(r).includes('geheim') && !JSON.stringify(r).includes(JSON.stringify(mobilfunk.werte.pin).slice(1, 20)), 'kein Passwort, auch nicht verschlüsselt');
    assert.ok(!('kuendigen_bis' in r.felder), 'berechnete Felder bekommen nie einen Vorschlag');
    // „nein“ und leere Werte schlagen nichts vor.
    assert.deepEqual(Object.keys((await d.vorbelegen({ typId: vertrag.id, feldKey: 'art', id: strom.id })).felder).sort(), ['kuendigung_zum', 'kuendigungsfrist']);
    // Unbekanntes Feld, fremde Mappe, falscher Typ: keine Felder.
    assert.deepEqual((await d.vorbelegen({ typId: vertrag.id, feldKey: 'bezeichnung', id: mobilfunk.id })).felder, {});
    assert.deepEqual((await d.vorbelegen({ typId: vertrag.id, feldKey: 'art', id: telekom.id })).felder, {}, 'Mappe vom falschen Typ');
    await assert.rejects(d.vorbelegen({ typId: 'kein-typ', feldKey: 'art', id: mobilfunk.id }), meldet(/Mappentyp/));
    // Speichern füllt nichts von selbst – es sind Vorschläge der Oberfläche.
    const m = await d.legeMappeAn({ typId: vertrag.id, werte: { bezeichnung: 'Handyvertrag', art: mobilfunk.id } });
    assert.equal(m.werte.kuendigungsfrist, null);
  });

  it('ungültige Werte für das Zielfeld fallen weg (Länge, Auswahl)', async () => {
    const { d, vertragsart, mobilfunk } = await aufbau();
    const knapp = await d.mappentypen.legeTypAn({ name: 'Knapp', felder: [
      { key: 'art', label: 'Art', typ: 'referenz', zielTyp: vertragsart.id, vorbelegen: [{ von: 'hinweis', nach: 'kurz' }, { von: 'kuendigung_zum', nach: 'zum' }] },
      { key: 'kurz', label: 'Kurz', typ: 'text', maxLen: 5 }, { key: 'zum', label: 'Zum', typ: 'auswahl', optionen: OPTIONEN },
    ] });
    assert.deepEqual((await d.vorbelegen({ typId: knapp.id, feldKey: 'art', id: mobilfunk.id })).felder, { zum: 'laufzeitende' });
  });

  it('nur mit Leserecht: nicht lesbare Mappe gibt nichts, Verweise auf nicht lesbare Mappen fallen weg', async () => {
    const x = await aufbau({ zu: { grund: NICHTS, regeln: [] } });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', x.d.systemtypen.benutzerspiegel());
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id)).benutzer;
    await x.d.gleicheBenutzerAb(await konten.listeBenutzer());
    const zJ = await x.d.rechtepruefung.zugriff((await konten.listeBenutzer()).find((b) => b.id === jonas.id)!);
    assert.ok(!(await x.d.rechtepruefung.lesbare(zJ, [x.telekom.id])).has(x.telekom.id), 'Jonas darf die Organisation nicht lesen');
    const r = await x.d.vorbelegen({ typId: x.vertrag.id, feldKey: 'art', id: x.mobilfunk.id }, zJ);
    assert.ok(!('anbieter' in r.felder) && !(x.telekom.id in r.bezuege), 'kein Titel über den Vorschlag');
    assert.deepEqual(r.felder.kuendigungsfrist, { anzahl: 3, einheit: 'monate' });
    // Vertragsart selbst gesperrt: gar nichts.
    await x.d.mappentypen.aendereTyp(x.vertragsart.id, { ...x.vertragsart, berechtigungen: { grund: NICHTS, regeln: [] } });
    const zJ2 = await x.d.rechtepruefung.zugriff((await konten.listeBenutzer()).find((b) => b.id === jonas.id)!);
    assert.deepEqual((await x.d.vorbelegen({ typId: x.vertrag.id, feldKey: 'art', id: x.mobilfunk.id }, zJ2)).felder, {});
    // Die Route ist angemeldet erreichbar.
    assert.ok(routen(x.d, konten, {}).some((r2) => r2.methode === 'POST' && r2.pfad === '/api/mappen/vorbelegen' && r2.zugang === 'angemeldet'));
  });

  it('mehrere Zieltypen (#1036): gilt je Typ, der das Feld hat', async () => {
    const { d, vertragsart, mobilfunk } = await aufbau();
    const tarif = await d.mappentypen.legeTypAn({ name: 'Tarif', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'hinweis', label: 'Hinweis', typ: 'text' }] });
    const t = await d.mappentypen.legeTypAn({ name: 'Abo', felder: [
      { key: 'grundlage', label: 'Grundlage', typ: 'referenz', zielTypen: [vertragsart.id, tarif.id], vorbelegen: [{ von: 'kuendigungsfrist', nach: 'frist' }, { von: 'hinweis', nach: 'notiz' }] },
      { key: 'frist', label: 'Frist', typ: 'zeitraum' }, { key: 'notiz', label: 'Notiz', typ: 'text' },
    ] });
    const basis = await d.legeMappeAn({ typId: tarif.id, werte: { name: 'Basis', hinweis: 'monatlich kündbar' } });
    assert.deepEqual((await d.vorbelegen({ typId: t.id, feldKey: 'grundlage', id: mobilfunk.id })).felder, { frist: { anzahl: 3, einheit: 'monate' }, notiz: 'Rufnummer mitnehmen' });
    assert.deepEqual((await d.vorbelegen({ typId: t.id, feldKey: 'grundlage', id: basis.id })).felder, { notiz: 'monatlich kündbar' }, 'Tarif hat keine Kündigungsfrist');
    // Passt ein gleichnamiges Feld in einem der Typen nicht, ist das Paar ungültig.
    const schief = await d.mappentypen.legeTypAn({ name: 'Schief', felder: [{ key: 'kuendigungsfrist', label: 'Frist als Text', typ: 'text' }] });
    await assert.rejects(d.mappentypen.legeTypAn({ name: 'Abo2', felder: [
      { key: 'grundlage', label: 'Grundlage', typ: 'referenz', zielTypen: [vertragsart.id, schief.id], vorbelegen: [{ von: 'kuendigungsfrist', nach: 'frist' }] },
      { key: 'frist', label: 'Frist', typ: 'zeitraum' },
    ] }), meldet(/passt nicht/));
  });
});

describe('Beim Auswählen übernehmen – aus Dokument ausfüllen und „Dokument übernehmen“ (#1037)', () => {
  it('Vorschlag für den Verweis bringt die Werte mit; das Dokument geht vor; beim Bearbeiten nur leere Felder', async () => {
    const { d, vertrag, mobilfunk } = await aufbau();
    const r = await d.erkennung.fuerTyp(vertrag.id, { text: 'Ihr Vertrag Mobilfunk\nTarif Allnet 20' });
    assert.equal(r.vorschlaege.art?.wert, mobilfunk.id);
    assert.deepEqual(r.vorschlaege.kuendigungsfrist?.wert, { anzahl: 3, einheit: 'monate' });
    assert.deepEqual(r.vorschlaege.kuendigungsfrist?.aus, { feld: 'art', mappe: mobilfunk.id });
    assert.equal(r.vorschlaege.kuendigungsfrist?.fundstelle, 'vorgeschlagen aus Vertragsart Mobilfunk');
    assert.equal(r.vorschlaege.kuendigen_bis, undefined, 'berechnet: kein Vorschlag');
    assert.ok(!JSON.stringify(r).includes('geheim'));
    // Steht die Frist im Dokument, gilt sie.
    const doc = await d.erkennung.fuerTyp(vertrag.id, { text: 'Ihr Vertrag Mobilfunk\nKündigungsfrist: 1 Monat' });
    if (doc.vorschlaege.kuendigungsfrist && !doc.vorschlaege.kuendigungsfrist.aus) assert.deepEqual(doc.vorschlaege.kuendigungsfrist.wert, { anzahl: 1, einheit: 'monate' });
    // Bearbeiten: was in der Mappe steht, bekommt keinen Vorschlag.
    const m = await d.legeMappeAn({ typId: vertrag.id, werte: { bezeichnung: 'Handy', bemerkung: 'eigene Notiz' } });
    const b = await d.erkennung.fuerTyp(vertrag.id, { text: 'Ihr Vertrag Mobilfunk', mappe: m.id });
    assert.equal(b.vorschlaege.bemerkung, undefined);
    assert.equal(b.vorschlaege.kuendigung_zum?.wert, 'laufzeitende');
  });

  it('nie an ein KI-Paket: die Werte kommen erst nach der Antwort dazu', async () => {
    const { d, vertrag, mobilfunk } = await aufbau();
    const gerufen: unknown[] = [];
    const lc = liesCode({ sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:erkennen'] }, netz: ['https://ki.example.org/v1'] });
    assert.deepEqual(lc.fehler, []);
    const c = lc.code!;
    await d.kern.repo.speicherePaket({ id: 'wolke', name: 'KI Wolke', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.153.0',
      herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
      typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: { ...c, modul: { sha256: 'x', groesse: 1 } } } as InstalliertesPaket);
    // Der Vertrag ist für KI-Dienste zugelassen (#796), die Vertragsart nicht – ihre Werte gehen trotzdem nie an das Paket.
    await d.ki.setzeKiTyp(vertrag.id, true, null);
    d.erkennung.anbieter = { pakete: () => [{ id: 'wolke', name: 'KI Wolke', netz: true }], erkenne: async (_p, e) => { gerufen.push(e); return { text: JSON.stringify({ kuendigungsfrist: { wert: { anzahl: 1, einheit: 'monate' }, fundstelle: 'Kündigungsfrist 1 Monat' } }), ms: 1 }; } };
    await d.erkennung.setzeStandard({ paket: 'wolke', abfluss: true });
    const r = await d.erkennung.fuerTyp(vertrag.id, { text: 'Ihr Vertrag Mobilfunk\nKündigungsfrist 1 Monat' });
    assert.deepEqual(r.engine, { art: 'paket', id: 'wolke', name: 'KI Wolke' }, r.hinweis);
    assert.equal(gerufen.length, 1);
    const gesendet = JSON.stringify(gerufen);
    assert.ok(!gesendet.includes('Rufnummer mitnehmen') && !gesendet.includes('geheim'), 'nichts aus der Vertragsart ging an das Paket');
    // Verweise erkennt Ablago selbst; die Frist aus dem Dokument (vom Paket) geht vor, der Rest kommt aus der Vertragsart.
    assert.equal(r.vorschlaege.art?.wert, mobilfunk.id);
    assert.deepEqual([r.vorschlaege.kuendigungsfrist?.wert, r.vorschlaege.kuendigungsfrist?.aus], [{ anzahl: 1, einheit: 'monate' }, undefined]);
    assert.equal(r.vorschlaege.bemerkung?.wert, 'Rufnummer mitnehmen');
    assert.deepEqual(r.vorschlaege.bemerkung?.aus, { feld: 'art', mappe: mobilfunk.id });
  });
});

/* ---------- Paketformat ---------- */

const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const paket = (typen: string, version = '1.0.0') => ({
  'manifest.yaml': `schema: 1\nid: vertraege\nname: Verträge\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`,
  'inhalt/mappentypen.yaml': typen,
});
const VERTRAEGE = (vorbelegen = '[{ von: kuendigungsfrist, nach: kuendigungsfrist }, { von: kuendigung_zum, nach: kuendigung_zum }]', art = '') => `- schluessel: vertrag
  name: Vertrag
  felder:
    - { key: bezeichnung, label: Bezeichnung, typ: text }
    - { key: art, label: Vertragsart, typ: referenz, ziel: vertragsart${art ? '' : `, vorbelegen: ${vorbelegen}`} }
    - { key: kuendigungsfrist, label: Kündigungsfrist, typ: zeitraum }
    - { key: kuendigung_zum, label: Kündigung zum, typ: auswahl, optionen: [laufzeitende, monatsende] }
    - { key: kennwort, label: Kennwort, typ: passwort }
  register:
    - { key: daten, name: Daten, art: felder, felder: [bezeichnung, art, kuendigungsfrist, kuendigung_zum, kennwort] }
- schluessel: vertragsart
  name: Vertragsart
  titelVorlage: "{name}"
  felder:
    - { key: name, label: Name, typ: text }
    - { key: kuendigungsfrist, label: Kündigungsfrist, typ: zeitraum }
    - { key: kuendigung_zum, label: Kündigung zum, typ: auswahl, optionen: [laufzeitende, monatsende] }
    - { key: pin, label: PIN, typ: passwort }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name, kuendigungsfrist, kuendigung_zum, pin] }
`;
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };

describe('Beim Auswählen übernehmen – Paketformat (#1037)', () => {
  it('Lesen: Schreibweise wie im Entwurf Verträge, Felder müssen existieren und passen', () => {
    const p = liesPaket(liesZip(archiv(paket(VERTRAEGE()))));
    assert.deepEqual(p.typen[0].felder.find((f) => f.key === 'art')?.vorbelegen, [{ von: 'kuendigungsfrist', nach: 'kuendigungsfrist' }, { von: 'kuendigung_zum', nach: 'kuendigung_zum' }]);
    const falsch = (v: string) => () => liesPaket(liesZip(archiv(paket(VERTRAEGE(v)))));
    assert.throws(falsch('[{ von: kuendigungsfrist, nach: gibtsnicht }]'), gruende(/nach „gibtsnicht“ – dieses Feld gibt es im Typ nicht/));
    assert.throws(falsch('[{ von: gibtsnicht, nach: kuendigungsfrist }]'), gruende(/von „gibtsnicht“ – dieses Feld gibt es im Typ „vertragsart“ nicht/));
    assert.throws(falsch('[{ von: pin, nach: bezeichnung }]'), gruende(/Passwortfeld/));
    assert.throws(falsch('[{ von: name, nach: kennwort }]'), gruende(/Passwortfelder und Tabellen/));
    assert.throws(falsch('[{ von: name, nach: kuendigungsfrist }]'), gruende(/„vertragsart.name“ passt nicht zu „kuendigungsfrist“/));
    // Berechnet (#1034; braucht Code – den meldet das Lesen zusätzlich).
    assert.throws(() => liesPaket(liesZip(archiv(paket(VERTRAEGE('[{ von: kuendigungsfrist, nach: bis }]').replace('    - { key: kennwort,', '    - { key: bis, label: Bis, typ: zeitraum, berechnet: true }\n    - { key: kennwort,'))))), gruende(/nach „bis“ ist berechnet/));
    assert.throws(falsch('{ von: a, nach: b }'), gruende(/Liste von Paaren/));
    assert.throws(falsch('[{ von: name, nach: bezeichnung, wert: x }]'), gruende(/Liste von Paaren/));
    assert.throws(falsch('[{ von: name, nach: bezeichnung }, { von: name, nach: bezeichnung }]'), gruende(/nur einmal unter nach/));
    assert.throws(() => liesPaket(liesZip(archiv(paket(VERTRAEGE().replace('{ key: bezeichnung, label: Bezeichnung, typ: text }', '{ key: bezeichnung, label: Bezeichnung, typ: text, vorbelegen: [{ von: a, nach: b }] }'))))), gruende(/nur bei Verweisfeldern/));
  });

  it('Installieren legt die Paare an, ein Update ergänzt sie an vorhandenen Verweisfeldern ohne eigene', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const p = new Paketverwaltung(d, { version: () => '0.234.0', abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
    const installiere = async (dateien: Record<string, string>) => { const h = await p.hochladen(archiv(dateien), ICH); return p.installiere({ upload: h.upload, bestaetigt: true }, ICH); };
    // Erst ohne Paare (Version 1.0.0), dann das Update mit Paaren.
    const r = await installiere(paket(VERTRAEGE('', 'ohne')));
    const art = async () => (await d.mappentypen.listeTypen()).find((x) => x.id === r.typen.vertrag)!.felder.find((f) => f.key === 'art')!;
    assert.equal((await art()).vorbelegen, undefined);
    const h = await p.hochladen(archiv(paket(VERTRAEGE(), '1.1.0')), ICH);
    const v = await p.vorschau({ upload: h.upload });
    assert.deepEqual(v.typen.find((x) => x.schluessel === 'vertrag')?.vorbelegen, ['Vertragsart']);
    await p.installiere({ upload: h.upload, bestaetigt: true }, ICH);
    assert.deepEqual((await art()).vorbelegen, [{ von: 'kuendigungsfrist', nach: 'kuendigungsfrist' }, { von: 'kuendigung_zum', nach: 'kuendigung_zum' }]);
    // Und es wirkt: Vorschläge aus der Vertragsart, das berechnete Feld nie.
    const mf = await d.legeMappeAn({ typId: r.typen.vertragsart, werte: { name: 'Mobilfunk', kuendigungsfrist: 'P3M', kuendigung_zum: 'laufzeitende' } });
    assert.deepEqual((await d.vorbelegen({ typId: r.typen.vertrag, feldKey: 'art', id: mf.id })).felder, { kuendigungsfrist: { anzahl: 3, einheit: 'monate' }, kuendigung_zum: 'laufzeitende' });
  });

  it('„Paket erstellen“ nimmt die Paare mit (nur mit Zielfeld im Paket) und hebt die Mindestversion', async () => {
    const { d, vertrag, vertragsart, organisation } = await aufbau();
    const bau = baue({ typen: [vertrag.id, vertragsart.id, organisation.id], sichten: [], beispiele: [], id: 'vertraege_eigen', name: 'Verträge', version: '1.0.0', beschreibung: 'Ein Paket zum Testen von vorbelegen.', autor: { name: 'Markus', github: 'markus' }, lizenz: 'MIT', dms: '>=0.234.0', aenderungen: '' },
      { typen: await d.mappentypen.listeTypen(), sichten: [], pakete: [], dmsTypen: new Map(), mappen: [], dmsVersion: '0.234.0', entwurf: null, jetzt: new Date('2026-11-10T12:00:00Z') });
    const yaml = bau.dateien.find((x) => x.name.endsWith('mappentypen.yaml'))!.daten.toString();
    assert.match(yaml, /vorbelegen:\s*\n\s*- von: kuendigungsfrist\s*\n\s*nach: kuendigungsfrist/);
    assert.equal(mindestversion(['vorbelegen']).version, '0.234.0');
    assert.ok(bau.version.gruende.some((g) => /Beim Auswählen übernehmen/.test(g)), bau.version.gruende.join(' | '));
    // Das erstellte Paket lässt sich wieder lesen.
    assert.ok(liesPaket(new Map(bau.dateien.map((x) => [x.name, x.daten] as const))).typen.some((x) => x.felder.some((f) => f.vorbelegen?.length)));
  });
});
