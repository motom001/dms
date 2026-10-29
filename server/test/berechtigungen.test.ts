/** Berechtigungen (#123–#127, #137): Regeln, Durchsetzung, Testlauf, Aufgaben, Benutzerauswahl. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { erwaehnung } from '../../shared/src/markdown';
import type { Mappentyp } from '../../shared/src/model';
import { kurz, lesefilter, rechteAn, type Regelwerk } from '../../shared/src/rechte';
import { heuteIn } from '../../shared/src/sichten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Tresor } from '../src/tresor';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const A0 = { heute: '2026-10-29', ich: 'u1', meineRollen: [] as string[] };

async function aufbau(repos?: { repo: ReturnType<typeof speicherRepo>; konto: ReturnType<typeof speicherKontoRepo> }) {
  const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-recht-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const d = new Dienst(repos?.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const konten = new Konten(repos?.konto ?? speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name, rolle: 'mitglied' }, admin.id)).benutzer;
  const fibu = await neu('Fibu'); const max = await neu('Max'); const prakt = await neu('Prakt'); const api = await neu('Api');
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const typen = await d.listeTypen();
  const rolleTyp = typen.find((t) => t.system === 'rolle')!;
  const benutzerTyp = typen.find((t) => t.system === 'benutzer')!;
  const rolle = async (name: string) => (await d.legeMappeAn({ typId: rolleTyp.id, werte: { name } }, admin.id)).id;
  const R = { fibu: await rolle('FiBu'), praktikant: await rolle('Praktikant'), api: await rolle('API') };
  await d.setzeRollen(fibu.id, [R.fibu]);
  await d.setzeRollen(prakt.id, [R.praktikant]);
  await d.setzeRollen(api.id, [R.api]);
  const mitglied = (await d.listeRollen()).find((r) => r.system && r.name === 'Mitglied')!.id;
  const rechnung = await d.legeTypAn({ name: 'Rechnung', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id },
    { key: 'privat', label: 'Privat', typ: 'janein' },
    { key: 'kennwort', label: 'Kennwort', typ: 'passwort' },
    { key: 'text', label: 'Text', typ: 'formatiert' },
  ] });
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const route = (m: string, p: string) => tabelle.find((r) => r.methode === m && r.pfad === p)!;
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) => route(m, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) });
  return { d, konten, admin, fibu, max, prakt, api, R, mitglied, rechnung, benutzerTyp, rolleTyp, ich, rufe };
}

/** Das Beispiel aus #123 (Grundeinstellung „entzogen“). */
function beispiel(R: { fibu: string; praktikant: string }, mitglied: string): Regelwerk {
  return {
    grund: 'entzogen',
    regeln: [
      { id: 'privat', name: 'Privat nur für den Ersteller', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }, { art: 'feld', nicht: true, bedingung: { art: 'feld', feld: '_erstelltVon', op: 'zeigtAuf', wert: { art: 'ich' } } }], dann: { C: 'entziehen', R: 'entziehen', U: 'entziehen', D: 'entziehen', P: 'entziehen' }, stopp: true },
      { id: 'fibu', name: 'FiBu darf alles', wenn: [{ art: 'rolle', rollen: [R.fibu] }], dann: { C: 'erteilen', R: 'erteilen', U: 'erteilen', D: 'erteilen', P: 'erteilen' }, stopp: true },
      { id: 'verantw', name: 'Verantwortlich darf alles', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'verantwortlich', op: 'zeigtAuf', wert: { art: 'ich' } } }], dann: { C: 'erteilen', R: 'erteilen', U: 'erteilen', D: 'erteilen', P: 'erteilen' }, stopp: true },
      { id: 'aufgabe', name: 'Mit Aufgabe lesen und bearbeiten', wenn: [{ art: 'aufgabe' }], dann: { R: 'erteilen', U: 'erteilen' }, stopp: false },
      { id: 'mitglied', name: 'Mitglieder lesen', wenn: [{ art: 'rolle', rollen: [mitglied] }], dann: { R: 'erteilen' }, stopp: false },
      { id: 'praktikant', name: 'Praktikanten keine Passwörter', wenn: [{ art: 'rolle', rollen: [R.praktikant] }], dann: { P: 'entziehen' }, stopp: false },
    ],
  };
}

describe('Regelwerk (#123)', () => {
  const typ = { id: 't', name: 'T', felder: [{ key: 'privat', label: 'Privat', typ: 'janein' }], register: [], titelVorlage: '', beschreibung: '' } as unknown as Mappentyp;
  const m = { id: 'm1', typId: 't', werte: { privat: true }, erstellt: '', erstelltVon: 'u2', geaendert: '', geaendertVon: null };
  const z = { dokumente: () => 0, verknuepfungen: () => 0 };

  it('ohne Regeln: alles erteilt, kein Filter', () => {
    assert.equal(lesefilter([typ], { id: 'u1', rollen: [] }, A0), null);
    assert.deepEqual(rechteAn(typ, m, { id: 'u1', rollen: [] }, A0, z).wirksam, { C: true, R: true, U: true, D: true, P: true });
  });

  it('Reihenfolge, Stopp, „–“ bleibt, ohne R wirkt nichts außer C, Spur', () => {
    const t = { ...typ, berechtigungen: { grund: 'erteilt', regeln: [
      { id: 'a', name: 'Privat', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }], dann: { R: 'entziehen' }, stopp: true },
      { id: 'b', name: 'Nie erreicht', wenn: [{ art: 'benutzer', benutzer: ['u1'] }], dann: { R: 'erteilen' }, stopp: false },
    ] } } as Mappentyp;
    const e = rechteAn(t, m, { id: 'u1', rollen: [] }, A0, z);
    assert.deepEqual(e.rechte, { C: true, R: false, U: true, D: true, P: true });
    assert.deepEqual(e.wirksam, { C: true, R: false, U: false, D: false, P: false }, 'ohne R wirkt nichts außer C');
    assert.deepEqual(e.spur.map((s) => s.traf), [true, null]);
    const f = lesefilter([t], { id: 'u1', rollen: [] }, A0)!;
    assert.equal(f.je.length, 1, 'Lesen hängt von der Mappe ab');
    assert.equal(kurz({ C: 'erteilen', R: 'erteilen', P: 'entziehen' }), '+CR −P');
  });
});

describe('Durchsetzung (#124), Ablage (#126), Aufgaben (#127)', () => {
  it('Beispiel aus #123: Listen, Zähler, Lesen, Bearbeiten, Löschen, Passwörter, Anlegen', async () => {
    const { d, admin, fibu, max, prakt, R, mitglied, rechnung, rufe } = await aufbau();
    const m1 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1', kennwort: { neu: 'geheim' } } }, fibu.id);
    const m2 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2', verantwortlich: max.id } }, fibu.id);
    const m3 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-3', privat: true } }, max.id);
    await d.setzeBerechtigungen(rechnung.id, beispiel(R, mitglied), true);

    const liste = async (b: { id: string }) => ((await rufe(b, 'GET', '/api/mappen', { query: { sicht: `typ:${rechnung.id}` } })).body as { mappen: Array<{ id: string }> }).mappen.map((x) => x.id).sort();
    // Mitglieder lesen; Privat sieht nur der Ersteller (Max) – FiBu auch nicht, weil Regel 1 vorher stoppt.
    assert.deepEqual(await liste(max), [m1.id, m2.id, m3.id].sort());
    assert.deepEqual(await liste(fibu), [m1.id, m2.id].sort());
    assert.deepEqual(await liste(prakt), [m1.id, m2.id].sort());
    assert.deepEqual(await liste(admin), [m1.id, m2.id, m3.id].sort(), 'Administratoren: Regeln gelten nicht (#128)');
    const zaehler = (await rufe(prakt, 'GET', '/api/sichten')).body as { typen: Record<string, { anzahl: number }> };
    assert.equal(zaehler.typen[rechnung.id].anzahl, 2);

    // Lesen einer privaten Mappe: 404 wie „gibt es nicht“
    await assert.rejects(rufe(fibu, 'GET', '/api/mappen/:id', { params: { id: m3.id } }), status(404));
    // Bearbeiten: Mitglied liest nur, Verantwortlicher darf alles
    await assert.rejects(rufe(prakt, 'PUT', '/api/mappen/:id', { params: { id: m2.id }, body: { werte: { nr: 'X' } } }), status(403));
    assert.equal(((await rufe(max, 'PUT', '/api/mappen/:id', { params: { id: m2.id }, body: { werte: { nr: 'R-2b', verantwortlich: max.id } } })).body as { titel: string }).titel, 'R-2b');
    // Selbst entzogen: Hinweis nach dem Speichern
    const weg = (await rufe(max, 'PUT', '/api/mappen/:id', { params: { id: m2.id }, body: { werte: { nr: 'R-2b', verantwortlich: '' } } })).body as { hinweis?: string };
    assert.match(weg.hinweis ?? '', /nicht mehr bearbeiten/);
    // Löschen nur mit D
    await assert.rejects(rufe(max, 'DELETE', '/api/mappen/:id', { params: { id: m1.id } }), status(403));
    // Passwörter: FiBu ja, Praktikant nicht (und Max als Mitglied auch nicht)
    assert.deepEqual((await rufe(fibu, 'POST', '/api/mappen/:id/passwoerter/:feld', { params: { id: m1.id, feld: 'kennwort' } })).body, { wert: 'geheim' });
    await assert.rejects(rufe(prakt, 'POST', '/api/mappen/:id/passwoerter/:feld', { params: { id: m1.id, feld: 'kennwort' } }), status(403));
    // Rechte an der Mappe für die Oberfläche
    const sicht = (await rufe(prakt, 'GET', '/api/mappen/:id', { params: { id: m1.id } })).body as { rechte: Record<string, boolean> };
    assert.deepEqual(sicht.rechte, { C: false, R: true, U: false, D: false, P: false });
    // Anlegen mit den eingegebenen Werten: Mitglied nein, mit sich als Verantwortlichem ja
    await assert.rejects(rufe(max, 'POST', '/api/mappen', { body: { typId: rechnung.id, werte: { nr: 'R-9' } } }), status(403));
    assert.equal((await rufe(max, 'POST', '/api/mappen', { body: { typId: rechnung.id, werte: { nr: 'R-9', verantwortlich: max.id } } })).status, 201);
    // Typen: Regeln nur für Administratoren, sonst „darf anlegen“
    const typen = (await rufe(max, 'GET', '/api/typen')).body as Array<{ id: string; berechtigungen: unknown; darfAnlegen?: boolean }>;
    const t = typen.find((x) => x.id === rechnung.id)!;
    assert.deepEqual([t.berechtigungen, t.darfAnlegen], [null, true]);
    // Profil: Übersicht je Typ
    const ue = (await rufe(prakt, 'GET', '/api/konto/rechte')).body as Array<{ typId: string; rechte: Record<string, string> }>;
    assert.deepEqual(ue.find((x) => x.typId === rechnung.id)!.rechte, { C: 'teils', R: 'teils', U: 'teils', D: 'teils', P: 'teils' });
  });

  it('Aufgabe gibt Zugriff; Eingang ohne Titel, wenn nicht; Hinweis beim Vergeben', async () => {
    const { d, admin, fibu, prakt, R, mitglied, rechnung, rufe } = await aufbau();
    const rw = beispiel(R, mitglied);
    // Ohne die Regel „Mitglieder lesen“ – damit nur die Aufgabe Zugriff gibt
    await d.setzeBerechtigungen(rechnung.id, { ...rw, regeln: rw.regeln.filter((r) => r.id !== 'mitglied') }, true);
    const m = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, fibu.id);
    await assert.rejects(rufe(prakt, 'GET', '/api/mappen/:id', { params: { id: m.id } }), status(404));
    await rufe(fibu, 'POST', '/api/mappen/:id/aufgaben', { params: { id: m.id }, body: { empfaengerId: prakt.id, text: 'Prüfen' } });
    assert.equal(((await rufe(prakt, 'GET', '/api/mappen/:id', { params: { id: m.id } })).body as { rechte: { U: boolean } }).rechte.U, true);
    // Ohne Aufgaben-Regel: Hinweis beim Vergeben, Eingang ohne Titel
    await d.setzeBerechtigungen(rechnung.id, { ...rw, regeln: rw.regeln.filter((r) => r.id !== 'mitglied' && r.id !== 'aufgabe') }, true);
    const auf = (await rufe(fibu, 'POST', '/api/mappen/:id/aufgaben', { params: { id: m.id }, body: { empfaengerId: prakt.id, text: 'Nochmal' } })).body as { hinweis?: string };
    assert.match(auf.hinweis ?? '', /nicht lesen/);
    const eingang = (await rufe(prakt, 'GET', '/api/mappen', { query: { sicht: 'eingang' } })).body as { mappen: Array<{ id: string; titel: string; verborgen?: boolean; werte: object }> };
    assert.deepEqual(eingang.mappen.map((x) => [x.id, x.titel, x.verborgen, x.werte]), [[m.id, 'nicht sichtbare Mappe', true, {}]]);
    const aufgaben = (await rufe(prakt, 'GET', '/api/aufgaben')).body as Array<{ mappeTitel: string }>;
    assert.ok(aufgaben.every((x) => x.mappeTitel === 'nicht sichtbare Mappe'));
    // Mappe ohne Lesen: nur die eigenen Aufgaben, zum Weitergeben
    await assert.rejects(rufe(prakt, 'GET', '/api/mappen/:id', { params: { id: m.id } }), (e: unknown) => e instanceof Fachfehler && e.status === 404 && (e.details as { aufgaben: unknown[] }).aufgaben.length === 2);
    // Administrator sieht im Eingang alles (#128)
    assert.equal(((await rufe(admin, 'GET', '/api/mappen/:id', { params: { id: m.id } })).body as { rechte: { R: boolean } }).rechte.R, true);
  });

  it('Titel verwiesener Mappen und verweisende Mappen ohne Leserecht', async () => {
    const { d, fibu, max, R, mitglied, rechnung, rufe } = await aufbau();
    const projekt = await d.legeTypAn({ name: 'Projekt', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTyp: rechnung.id }] });
    const geheim = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'GEHEIM', privat: true } }, fibu.id);
    const p = await d.legeMappeAn({ typId: projekt.id, werte: { name: 'Haus', rechnung: geheim.id } }, fibu.id);
    await d.setzeBerechtigungen(rechnung.id, beispiel(R, mitglied), true);
    const sicht = (await rufe(max, 'GET', '/api/mappen/:id', { params: { id: p.id } })).body as { bezuege: Record<string, { titel: string; verborgen?: boolean }> };
    assert.deepEqual(sicht.bezuege[geheim.id], { titel: 'nicht sichtbare Mappe', typId: rechnung.id, verborgen: true });
    // Verweis auf eine nicht sichtbare Mappe neu setzen: abgelehnt; bestehender bleibt erlaubt
    const p2 = await d.legeMappeAn({ typId: projekt.id, werte: { name: 'Garten' } }, max.id);
    await assert.rejects(rufe(max, 'PUT', '/api/mappen/:id', { params: { id: p2.id }, body: { werte: { name: 'Garten', rechnung: geheim.id } } }), status(422));
    await rufe(max, 'PUT', '/api/mappen/:id', { params: { id: p.id }, body: { werte: { name: 'Haus 2', rechnung: geheim.id } } });
  });

  it('Systemfelder bleiben geschützt, auch mit Bearbeiten-Recht (#124); eigener Papierkorb (#126)', async () => {
    const { d, max, R, benutzerTyp, rechnung, rufe } = await aufbau();
    await d.setzeBerechtigungen(benutzerTyp.id, { grund: 'erteilt', regeln: [] }, true);
    const eigene = (await rufe(max, 'GET', '/api/mappen/:id', { params: { id: max.id } })).body as { mappe: { werte: Record<string, unknown> } };
    await assert.rejects(rufe(max, 'PUT', '/api/mappen/:id', { params: { id: max.id }, body: { werte: { ...eigene.mappe.werte, rollen: [...(eigene.mappe.werte.rollen as string[]), R.fibu] } } }), status(403));
    await assert.rejects(rufe(max, 'PUT', '/api/mappen/:id', { params: { id: max.id }, body: { werte: { ...eigene.mappe.werte, aktiv: false } } }), status(403));
    // Papierkorb: gelöscht, danach nicht mehr lesbar – trotzdem wiederherstellbar
    await d.setzePapierkorbTage(30);
    const m = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'P-1' } }, max.id);
    await rufe(max, 'DELETE', '/api/mappen/:id', { params: { id: m.id } });
    await d.setzeBerechtigungen(rechnung.id, { grund: 'entzogen', regeln: [] }, true);
    assert.deepEqual(((await rufe(max, 'GET', '/api/papierkorb')).body as Array<{ id: string }>).map((x) => x.id), [m.id]);
    const r = (await rufe(max, 'POST', '/api/papierkorb/:id/wiederherstellen', { params: { id: m.id } })).body as { hinweis?: string };
    assert.match(r.hinweis ?? '', /nicht mehr sehen/);
  });
});

describe('Benutzerauswahl nur mit sichtbaren Benutzern (#137)', () => {
  it('ERP-API: Rolle API am Typ Benutzer ausblenden – nicht für sich selbst', async () => {
    const { d, max, api, R, benutzerTyp, rechnung, rufe } = await aufbau();
    await d.setzeBerechtigungen(benutzerTyp.id, { grund: 'erteilt', regeln: [
      { id: 'api', name: 'API-Benutzer ausblenden', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'rollen', op: 'zeigtAuf', wert: { art: 'fest', wert: [R.api] } } }, { art: 'eigeneMappe', nicht: true }], dann: { C: 'entziehen', R: 'entziehen', U: 'entziehen', D: 'entziehen', P: 'entziehen' }, stopp: true },
    ] }, true);
    const personen = async (b: { id: string }) => ((await rufe(b, 'GET', '/api/personen')).body as Array<{ name: string }>).map((p) => p.name);
    assert.ok(!(await personen(max)).includes('Api'));
    assert.ok((await personen(api)).includes('Api'), 'sich selbst sieht der API-Benutzer');
    const m = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, max.id);
    await assert.rejects(rufe(max, 'POST', '/api/mappen/:id/aufgaben', { params: { id: m.id }, body: { empfaengerId: api.id, text: 'x' } }), status(422));
    await assert.rejects(rufe(max, 'PUT', '/api/mappen/:id', { params: { id: m.id }, body: { werte: { nr: 'R-1', verantwortlich: api.id } } }), status(422));
    await assert.rejects(rufe(max, 'PUT', '/api/konto/abwesenheit', { body: { an: true, vertreterId: api.id } }), status(422));
    // Erwähnung eines nicht sichtbaren Benutzers erzeugt keine Aufgabe
    await rufe(max, 'PUT', '/api/mappen/:id', { params: { id: m.id }, body: { werte: { nr: 'R-1', text: `Hallo ${erwaehnung('Api', api.id)}` } } });
    assert.equal((await d.meineAufgaben({ id: api.id, rolle: 'mitglied' })).length, 0);
    // Eigene Mappe sieht der API-Benutzer weiter
    assert.equal(((await rufe(api, 'GET', '/api/mappen/:id', { params: { id: api.id } })).body as { rechte: { R: boolean } }).rechte.R, true);
  });
});

describe('Werkbank (#123, #125)', () => {
  it('Warnung „niemand kann lesen“, Kopieren, Testlauf mit Spur, „Was sieht Benutzer X?“', async () => {
    const { d, fibu, prakt, R, mitglied, rechnung, rufe, admin } = await aufbau();
    await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, fibu.id);
    await assert.rejects(rufe(admin, 'PUT', '/api/werkbank/berechtigungen/:typId', { params: { typId: rechnung.id }, body: { berechtigungen: { grund: 'entzogen', regeln: [] } } }),
      (e: unknown) => e instanceof Fachfehler && e.status === 409 && (e.details as { niemand: number }).niemand === 1);
    await assert.rejects(rufe(admin, 'PUT', '/api/werkbank/berechtigungen/:typId', { params: { typId: rechnung.id }, body: { berechtigungen: { grund: 'erteilt', regeln: [{ name: '', wenn: [], dann: {} }] } } }), status(422));
    await rufe(admin, 'PUT', '/api/werkbank/berechtigungen/:typId', { params: { typId: rechnung.id }, body: { berechtigungen: beispiel(R, mitglied) } });
    const projekt = await d.legeTypAn({ name: 'Projekt', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    const k = (await rufe(admin, 'POST', '/api/werkbank/berechtigungen/:typId/kopieren', { params: { typId: rechnung.id }, body: { regelId: 'verantw', ziele: [projekt.id] } })).body as { kopiert: number; ausgelassen: number };
    assert.deepEqual(k, { kopiert: 0, ausgelassen: 1 }, 'Feld Verantwortlich fehlt in Projekt');
    assert.deepEqual((await rufe(admin, 'POST', '/api/werkbank/berechtigungen/:typId/kopieren', { params: { typId: rechnung.id }, body: { regelId: 'fibu', ziele: [projekt.id] } })).body, { kopiert: 1, ausgelassen: 0 });
    const m = (await d.listeMappen(rechnung.id))[0];
    const t = (await rufe(admin, 'POST', '/api/werkbank/berechtigungen/testlauf', { body: { mappeId: m.id, benutzerId: prakt.id } })).body as { wirksam: Record<string, boolean>; spur: Array<{ regel: string; traf: boolean | null }> };
    assert.deepEqual(t.wirksam, { C: false, R: true, U: false, D: false, P: false });
    assert.deepEqual(t.spur.map((s) => [s.regel, s.traf]), [['privat', false], ['fibu', false], ['verantw', false], ['aufgabe', false], ['mitglied', true], ['praktikant', true]]);
    const sieht = (await rufe(admin, 'GET', '/api/werkbank/berechtigungen/sicht/:benutzerId', { params: { benutzerId: prakt.id } })).body as { typen: Array<{ typId: string; gesamt: number; lesbar: number }> };
    assert.deepEqual(sieht.typen.filter((x) => x.typId === rechnung.id).map((x) => [x.gesamt, x.lesbar]), [[1, 1]]);
    assert.equal(heuteIn().length, 10);
  });
});

describe('Berechtigungen am Mappentyp (#142)', () => {
  it('werden mit „Mappentyp speichern“ gespeichert, dürfen neue Felder nutzen, fragen bei „niemand kann lesen“', async () => {
    const { d, fibu, max, R, rechnung, rufe, admin } = await aufbau();
    await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, fibu.id);
    const t = (await d.listeTypen()).find((x) => x.id === rechnung.id)!;
    const geheim = { key: 'geheim', label: 'Geheim', typ: 'janein' };
    const rw = { grund: 'erteilt', regeln: [{ id: 'g', name: 'Geheimes nur FiBu', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'geheim', op: 'ja' } }, { art: 'rolle', nicht: true, rollen: [R.fibu] }], dann: { R: 'entziehen' }, stopp: false }] };
    // Neues Feld und Regel darauf in einem Zug.
    const neu = (await rufe(admin, 'PUT', '/api/typen/:id', { params: { id: rechnung.id }, body: { ...t, felder: [...t.felder, geheim], berechtigungen: rw } })).body as typeof t;
    assert.equal(neu.berechtigungen?.regeln[0].name, 'Geheimes nur FiBu');
    assert.ok(neu.felder.some((f) => f.key === 'geheim'));
    const m = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2', geheim: true } }, fibu.id);
    await assert.rejects(rufe(max, 'GET', '/api/mappen/:id', { params: { id: m.id } }), status(404));
    // Ohne berechtigungen in der Eingabe bleiben die Regeln (z. B. API-Skripte).
    const ohne = (await rufe(admin, 'PUT', '/api/typen/:id', { params: { id: rechnung.id }, body: { ...neu, berechtigungen: undefined, beschreibung: 'x' } })).body as typeof t;
    assert.equal(ohne.berechtigungen?.regeln.length, 1);
    // Regel auf ein Feld, das gleichzeitig entfernt wird: 422, nichts gespeichert.
    await assert.rejects(rufe(admin, 'PUT', '/api/typen/:id', { params: { id: rechnung.id }, body: { ...neu, felder: t.felder, berechtigungen: rw } }), status(422));
    assert.ok((await d.listeTypen()).find((x) => x.id === rechnung.id)!.felder.some((f) => f.key === 'geheim'), 'Typ unverändert');
    // Niemand kann lesen → 409, mit bestaetigt gespeichert.
    const zu = { grund: 'entzogen', regeln: [] };
    await assert.rejects(rufe(admin, 'PUT', '/api/typen/:id', { params: { id: rechnung.id }, body: { ...neu, berechtigungen: zu } }), status(409));
    const ok = (await rufe(admin, 'PUT', '/api/typen/:id', { params: { id: rechnung.id }, body: { ...neu, berechtigungen: zu, bestaetigt: true } })).body as typeof t;
    assert.equal(ok.berechtigungen?.grund, 'entzogen');
    // Neuer Typ gleich mit Regeln.
    const n = (await rufe(admin, 'POST', '/api/typen', { body: { name: 'Gehalt', felder: [{ key: 'name', label: 'Name', typ: 'text' }], berechtigungen: zu } })).body as typeof t;
    assert.equal(n.berechtigungen?.grund, 'entzogen');
  });
});

describe('Berechtigungen in PostgreSQL (#124)', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('Lesefilter als SQL: Listen, Zähler, Suche, Eingang wie im Arbeitsspeicher', async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
    const { verbinde, migriere } = await import('../src/db');
    const { pgRepo } = await import('../src/repo-pg');
    const { pgKontoRepo } = await import('../src/konto-repo');
    const basis = ausUrl(process.env.TEST_DATABASE_URL)!;
    const a = { ...basis, datenbank: `dms_recht_${Date.now().toString(36)}` };
    await legeDatenbankAn(a);
    const sql = verbinde(alsUrl(a));
    try {
      await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
      const H = '00000000-0000-4000-8000-000000000001';
      const { d, fibu, max, prakt, R, mitglied, rechnung, rufe } = await aufbau({ repo: pgRepo(sql, H) as never, konto: pgKontoRepo(sql, H) as never });
      const m1 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, fibu.id);
      const m2 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2', verantwortlich: max.id } }, fibu.id);
      const m3 = await d.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-3', privat: true } }, max.id);
      await d.setzeBerechtigungen(rechnung.id, beispiel(R, mitglied), true);
      const liste = async (b: { id: string }, q: Record<string, string> = {}) => ((await rufe(b, 'GET', '/api/mappen', { query: { sicht: `typ:${rechnung.id}`, ...q } })).body as { mappen: Array<{ id: string }> }).mappen.map((x) => x.id).sort();
      assert.deepEqual(await liste(max), [m1.id, m2.id, m3.id].sort());
      assert.deepEqual(await liste(fibu), [m1.id, m2.id].sort());
      assert.deepEqual(await liste(fibu, { suche: 'R-3' }), [], 'Suche findet nichts Unsichtbares');
      assert.equal(((await rufe(prakt, 'GET', '/api/sichten')).body as { typen: Record<string, { anzahl: number }> }).typen[rechnung.id].anzahl, 2);
      // Aufgaben-Regel als SQL
      await d.setzeBerechtigungen(rechnung.id, { ...beispiel(R, mitglied), regeln: beispiel(R, mitglied).regeln.filter((r) => r.id !== 'mitglied') }, true);
      assert.deepEqual(await liste(prakt), []);
      await d.legeAufgabeAn(m1.id, { empfaengerId: prakt.id, text: 'Prüfen' }, fibu.id);
      assert.deepEqual(await liste(prakt), [m1.id]);
      assert.equal(await d.niemandLesbar((await d.listeTypen()).find((t) => t.id === rechnung.id)!, { grund: 'entzogen', regeln: [] }), 3);
    } finally {
      await sql.end();
      const admin = verbinde(alsUrl(basis));
      await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`);
      await admin.end();
    }
  });
});
