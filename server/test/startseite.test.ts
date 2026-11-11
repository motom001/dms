/** Startseite (#334): zuletzt geöffnete Mappen (nur lesbare) und leere Installation. */
import assert from 'node:assert/strict';
import { wieImModus } from './hilfen';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  // Wie in ablago.ts (#940): Anlegen und Ändern zählen wie Öffnen.
  d.kern.beiEigenerAenderung = (benutzerId, mappeId) => konten.merkeGeoeffnet({ id: benutzerId }, mappeId);
  const tabelle = routen(d, konten, {});
  // Wie nach der Antwort über HTTP (#741): erst danach „zuletzt geöffnet“ merken.
  const rufe = async (b: { id: string }, m: string, pf: string, x: Partial<Anfrage> = {}) => {
    const r = await tabelle.find((t) => t.methode === m && t.pfad === pf)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus(await ich(b.id)) });
    for (const f of r.danach ?? []) await f();
    return r as { body: unknown };
  };
  return { d, konten, admin, anna, rufe };
}
type Start = { zuletzt: Array<{ id: string; titel: string }>; leer: boolean };

describe('Startseite (#334)', () => {
  it('leere Installation, dann zuletzt geöffnete Mappen – neueste zuerst, höchstens 5, nur lesbare', async () => {
    const { d, admin, anna, rufe } = await aufbau();
    assert.equal(((await rufe(anna, 'GET', '/api/startseite')).body as Start).leer, true, 'nur Systemmappen: leer');
    const ALLES = { C: true, R: true, U: true, D: true, P: true };
    const typ = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
    const geheim = await d.mappentypen.legeTypAn({ name: 'Geheim', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
      berechtigungen: { grund: ALLES, regeln: [{ id: 'x', name: 'nicht Anna', wenn: [{ art: 'benutzer', benutzer: [anna.id] }], dann: { R: 'entziehen' }, stopp: false }] } } as never);
    const m = [];
    for (let i = 1; i <= 6; i++) m.push(await d.legeMappeAn({ typId: typ.id, werte: { nr: `V-${i}` } }, anna.id));
    const g = await d.legeMappeAn({ typId: geheim.id, werte: { nr: 'G' } }, admin.id);
    for (const x of m) await rufe(anna, 'GET', '/api/mappen/:id', { params: { id: x.id } });
    await rufe(anna, 'GET', '/api/mappen/:id', { params: { id: m[0].id } });
    const s = (await rufe(anna, 'GET', '/api/startseite')).body as Start;
    assert.equal(s.leer, false);
    assert.deepEqual(s.zuletzt.map((x) => x.titel), ['V-1', 'V-6', 'V-5', 'V-4', 'V-3']);
    // Admin öffnet die geheime Mappe; Anna sähe sie nicht, selbst wenn sie in ihrer Liste stünde.
    await rufe(admin, 'GET', '/api/mappen/:id', { params: { id: g.id } });
    assert.deepEqual(((await rufe(admin, 'GET', '/api/startseite')).body as Start).zuletzt.map((x) => x.titel), ['G']);
    await d.loescheMappe(m[0].id, anna.id);
    assert.equal(((await rufe(anna, 'GET', '/api/startseite')).body as Start).zuletzt[0].titel, 'V-6', 'gelöschte fallen heraus');
  });

  it('über einen API-Schlüssel wird nichts gemerkt', async () => {
    const { d, admin, anna, rufe } = await aufbau();
    const typ = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
    const x = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'A' } }, admin.id);
    await rufe(anna, 'GET', '/api/mappen/:id', { params: { id: x.id }, apiSchluessel: { id: 'k', name: 'Skript' } as never });
    assert.deepEqual(((await rufe(anna, 'GET', '/api/startseite')).body as Start).zuletzt, []);
  });
});

type Zuletzt = Array<{ id: string; typId: string; titel: string; am: string | null }>;
describe('Liste „Zuletzt geöffnet“ (#940)', () => {
  it('die letzten 25, neueste oben, mit Mappentyp und Zeitpunkt; Papierkorb und Unlesbares fehlen', async () => {
    const { d, konten, admin, anna, rufe } = await aufbau();
    const typ = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
    // Admin legt an – zählt für Admin, nicht für Anna.
    const m = [];
    for (let i = 1; i <= 30; i++) m.push(await d.legeMappeAn({ typId: typ.id, werte: { nr: `V-${i}` } }, admin.id));
    for (const x of m) await rufe(anna, 'GET', '/api/mappen/:id', { params: { id: x.id } });
    const liste = (await rufe(anna, 'GET', '/api/startseite/zuletzt')).body as Zuletzt;
    assert.equal(liste.length, 25, 'höchstens 25');
    assert.equal(liste[0].titel, 'V-30', 'neueste oben');
    assert.equal(liste[24].titel, 'V-6');
    assert.equal(liste[0].typId, typ.id);
    assert.ok(liste[0].am && Math.abs(Date.parse(liste[0].am) - Date.now()) < 60_000, 'mit Zeitpunkt');
    // Je Person: Annas Öffnen steht nicht bei Admin – dort stehen seine angelegten Mappen.
    const beimAdmin = (await rufe(admin, 'GET', '/api/startseite/zuletzt')).body as Zuletzt;
    assert.equal(beimAdmin[0].titel, 'V-30', 'Anlegen zählt als geöffnet');
    // Papierkorb fehlt.
    await d.loescheMappe(m[29].id, admin.id);
    assert.equal(((await rufe(anna, 'GET', '/api/startseite/zuletzt')).body as Zuletzt)[0].titel, 'V-29');
    // Frühere Einträge ohne Zeitpunkt bleiben lesbar.
    await konten.setzeEinstellung(await (async () => (await konten.listeBenutzer()).find((b) => b.id === anna.id)!)(), 'zuletzt_geoeffnet', [m[0].id]);
    assert.deepEqual(((await rufe(anna, 'GET', '/api/startseite/zuletzt')).body as Zuletzt).map((x) => [x.titel, x.am]), [['V-1', null]]);
  });

  it('Anlegen und Ändern zählen als geöffnet – nur für die Person, die es tut', async () => {
    const { d, admin, anna, rufe } = await aufbau();
    const typ = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
    const a = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'A' } }, anna.id);
    const b = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'B' } }, anna.id);
    assert.deepEqual(((await rufe(anna, 'GET', '/api/startseite/zuletzt')).body as Zuletzt).map((x) => x.titel), ['B', 'A'], 'Anlegen');
    await d.aendereMappe(a.id, { werte: { nr: 'A2' } }, anna.id);
    assert.deepEqual(((await rufe(anna, 'GET', '/api/startseite/zuletzt')).body as Zuletzt).map((x) => x.titel), ['A2', 'B'], 'Ändern');
    // Ändert jemand anderes, rückt die Mappe bei Anna nicht nach oben.
    await d.aendereMappe(b.id, { werte: { nr: 'B2' } }, admin.id);
    assert.deepEqual(((await rufe(anna, 'GET', '/api/startseite/zuletzt')).body as Zuletzt).map((x) => x.titel), ['A2', 'B2']);
    // Ohne Benutzer (System, Eingangsordner) zählt nichts.
    await d.legeMappeAn({ typId: typ.id, werte: { nr: 'S' } }, null);
    assert.equal(((await rufe(anna, 'GET', '/api/startseite/zuletzt')).body as Zuletzt).length, 2);
    // Die Startseite zeigt davon die ersten fünf, ebenfalls mit Zeitpunkt.
    assert.ok(((await rufe(anna, 'GET', '/api/startseite')).body as { zuletzt: Zuletzt }).zuletzt[0].am);
  });
});
