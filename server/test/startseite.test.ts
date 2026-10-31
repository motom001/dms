/** Startseite (#334): zuletzt geöffnete Mappen (nur lesbare) und leere Installation. */
import assert from 'node:assert/strict';
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
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'mitglied' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const rufe = async (b: { id: string }, m: string, pf: string, x: Partial<Anfrage> = {}) => (tabelle.find((t) => t.methode === m && t.pfad === pf)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) }) as Promise<{ body: unknown }>);
  return { d, konten, admin, anna, rufe };
}
type Start = { zuletzt: Array<{ id: string; titel: string }>; leer: boolean };

describe('Startseite (#334)', () => {
  it('leere Installation, dann zuletzt geöffnete Mappen – neueste zuerst, höchstens 5, nur lesbare', async () => {
    const { d, admin, anna, rufe } = await aufbau();
    assert.equal(((await rufe(anna, 'GET', '/api/startseite')).body as Start).leer, true, 'nur Systemmappen: leer');
    const ALLES = { C: true, R: true, U: true, D: true, P: true };
    const typ = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
    const geheim = await d.legeTypAn({ name: 'Geheim', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
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
    const { d, anna, rufe } = await aufbau();
    const typ = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
    const x = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'A' } }, anna.id);
    await rufe(anna, 'GET', '/api/mappen/:id', { params: { id: x.id }, apiSchluessel: { id: 'k', name: 'Skript' } as never });
    assert.deepEqual(((await rufe(anna, 'GET', '/api/startseite')).body as Start).zuletzt, []);
  });
});
