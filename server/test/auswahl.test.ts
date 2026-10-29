/** Auswahl mehrerer Mappen (#149) und Mehrfach-Löschen (#150). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
type Ergebnis = { mappen: number; dokumente: number; geloescht: number; ausgelassen: Array<{ id: string; titel: string; grund: string }> };

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'mitglied' }, admin.id)).benutzer;
  const max = (await konten.legeBenutzerAn({ email: 'max@example.org', name: 'Max', rolle: 'mitglied' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const partner = await d.legeTypAn({ name: 'Partner', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] });
  // Max darf Rechnungen nicht löschen.
  const rechnung = await d.legeTypAn({ name: 'Rechnung', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true },
    { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: partner.id },
  ], berechtigungen: { grund: { C: true, R: true, U: true, D: true, P: true }, regeln: [{ id: 'max', name: 'Max löscht nicht', wenn: [{ art: 'benutzer', benutzer: [max.id] }], dann: { D: 'entziehen' }, stopp: false }] } });
  const p1 = await d.legeMappeAn({ typId: partner.id, werte: { name: 'Stadtwerke' } }, anna.id);
  const r: Array<{ id: string }> = [];
  for (const nr of ['R-1', 'R-2', 'R-3']) r.push(await d.legeMappeAn({ typId: rechnung.id, werte: { nr, partner: nr === 'R-1' ? p1.id : null } }, anna.id));
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) => tabelle.find((t) => t.methode === m && t.pfad === p)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) });
  const loesche = async (b: { id: string }, ids: string[], probe = false) => (await rufe(b, 'POST', '/api/mappen/loeschen', { body: { ids, probe } })).body as Ergebnis;
  return { d, anna, max, partner, rechnung, p1, r, rufe, loesche };
}

describe('Auswahl und Mehrfach-Löschen (#149, #150)', () => {
  it('alle Treffer einer Sicht als Ids, mit Suche', async () => {
    const { anna, rechnung, rufe } = await aufbau();
    const alle = (await rufe(anna, 'GET', '/api/mappen/auswahl', { query: { sicht: rechnung.id } })).body as { ids: string[]; gesamt: number };
    assert.equal(alle.ids.length, 3);
    assert.equal(alle.gesamt, 3);
    const zwei = (await rufe(anna, 'GET', '/api/mappen/auswahl', { query: { sicht: rechnung.id, suche: 'R-2' } })).body as { ids: string[] };
    assert.equal(zwei.ids.length, 1);
  });

  it('Probe zählt, löscht nichts; Recht D je Mappe', async () => {
    const { d, anna, max, r, loesche } = await aufbau();
    const probe = await loesche(anna, r.map((x) => x.id), true);
    assert.equal(probe.mappen, 3);
    assert.equal(probe.geloescht, 0);
    assert.equal((await d.listeMappen()).filter((m) => r.some((x) => x.id === m.id)).length, 3);
    const ohne = await loesche(max, r.map((x) => x.id));
    assert.equal(ohne.geloescht, 0);
    assert.deepEqual(ohne.ausgelassen.map((x) => x.grund), ['kein Recht zum Löschen', 'kein Recht zum Löschen', 'kein Recht zum Löschen']);
    const ja = await loesche(anna, [r[1].id, r[2].id]);
    assert.equal(ja.geloescht, 2);
    // In den Papierkorb, je Mappe ein Eintrag.
    assert.equal((await d.papierkorb({ id: anna.id })).length, 2);
  });

  it('Verweise: innerhalb der Auswahl kein Hindernis, sonst ausgelassen', async () => {
    const { anna, p1, r, loesche } = await aufbau();
    const allein = await loesche(anna, [p1.id]);
    assert.equal(allein.geloescht, 0);
    assert.equal(allein.ausgelassen[0].grund, 'es wird noch auf sie verwiesen');
    // Partner zuerst gewählt, die verweisende Rechnung danach: geht in zwei Runden.
    const beide = await loesche(anna, [p1.id, r[0].id]);
    assert.equal(beide.geloescht, 2);
    assert.deepEqual(beide.ausgelassen, []);
  });

  it('prüft die Eingabe', async () => {
    const { anna, rufe } = await aufbau();
    await assert.rejects(rufe(anna, 'POST', '/api/mappen/loeschen', { body: { ids: [] } }), status(422));
    await assert.rejects(rufe(anna, 'POST', '/api/mappen/loeschen', { body: { ids: Array.from({ length: 5001 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) } }), status(422));
  });
});
