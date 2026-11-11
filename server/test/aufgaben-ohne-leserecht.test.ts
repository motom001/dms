/**
 * Aufgaben und Leserecht (#795, #798):
 * - #795: Platzhalter einer Aufgabe aus einer Automatisierung mit den Rechten des Empfängers – je Empfänger, auch bei
 *   Rollen und Vertretung; der Testlauf nennt, wer etwas nicht sehen darf.
 * - #798: Aufgaben an Personen ohne Leserecht kommen an der Mappe an; automatische zeigen nur einen Hinweis und die
 *   Fälligkeit, von Hand geschriebene ihren Text. Fälle (offen und vergangen) für die Werkbank, Leserecht auf Zeit mit
 *   Historie, Testlauf der Rechte, Meldung an den Admin über die technischen Aufgaben (#719).
 * Der Kern läuft im Arbeitsspeicher und – mit TEST_DATABASE_URL – gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { wieImModus } from './hilfen';
import { after, describe, it } from 'node:test';
import type { KatalogEreignis } from '../../shared/src/ereignisse';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
let sql: any;
after(async () => { await sql?.end(); });

async function pgRepos(): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  // Je Aufruf eine frische eigene Datenbank (#900); gelöscht nach dem letzten Test.
  sql = (await eigeneDatenbank('aufgaben_ohne_leserecht')).sql;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

/**
 * Lena und Jonas dürfen Verträge lesen, Petra nicht; Kontakte liest nur Lena. Das Systemkonto „Automatisierung“ darf
 * alles (für Konten ohne Person gilt die Grundeinstellung nicht). Markus ist Administrator.
 */
async function aufbau(repos?: { repo: Repo; konto: KontoRepo }) {
  const d = new Dienst(repos?.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(repos?.konto ?? speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name }, markus.id)).benutzer;
  const lena = await neu('Lena'); const jonas = await neu('Jonas'); const petra = await neu('Petra');
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const benutzerTyp = (await d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer')!;
  const kontakt = await d.mappentypen.legeTypAn({ name: 'Kontakt', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }], titelVorlage: '{name}' });
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: kontakt.id },
    { key: 'kuendbar_bis', label: 'Kündbar bis', typ: 'datum' },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id },
  ] });
  const lesen = (ids: string[]): Regelwerk => ({ grund: { ...NICHTS, C: true }, regeln: [{ id: 'r', name: 'Lesen', wenn: [{ art: 'benutzer', benutzer: ids }], dann: { R: 'erteilen', U: 'erteilen' }, stopp: false }] });
  await d.setzeBerechtigungen(kontakt.id, lesen([lena.id]), true);
  await d.setzeBerechtigungen(vertrag.id, lesen([lena.id, jonas.id]), true);
  const stadtwerke = await d.legeMappeAn({ typId: kontakt.id, werte: { name: 'Stadtwerke' } }, lena.id);
  const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', partner: stadtwerke.id, kuendbar_bis: verschiebe(heuteIn(), 30) } }, lena.id);
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
  const ereignis = (art: string, daten: Record<string, unknown>): KatalogEreignis =>
    ({ id: crypto.randomUUID(), art: art as KatalogEreignis['art'], daten, ausloeser: { art: 'benutzer', id: lena.id, konto: lena.id }, erstellt: new Date().toISOString() });
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const route = (mt: string, p: string) => tabelle.find((r) => r.methode === mt && r.pfad === p)!;
  const rufe = async (b: { id: string }, mt: string, p: string, x: Partial<Anfrage> = {}) => route(mt, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus(await ich(b.id)) });
  const mitglied = (await d.listeRollen()).find((r) => r.system && r.name === 'Mitglied')!.id;
  return { d, konten, markus, lena, jonas, petra, kontakt, vertrag, stadtwerke, m, motor, ereignis, ich, rufe, lesen, mitglied };
}

describe('Platzhalter mit den Rechten des Empfängers (#795)', () => {
  it('je Empfänger einer Rolle: was er nicht sehen darf, steht als „(nicht sichtbar)“ da; die Aufgabe hängt an der Mappe', async () => {
    const { d, lena, jonas, petra, vertrag, m, motor, ereignis, mitglied } = await aufbau();
    const a = await motor.lege({ name: 'Prüfen', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'rolle', id: mitglied }], faellig: 3, text: 'Vertrag {name} mit {partner} ({titel}, {mappentyp})' }] }, lena.id);
    await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    const fuer = async (id: string) => (await d.alleAufgaben()).find((x) => x.empfaengerId === id && x.mappeId === m.id)!;
    assert.equal((await fuer(lena.id)).text, 'Vertrag Strom mit Stadtwerke (Strom, Vertrag)');
    assert.equal((await fuer(jonas.id)).text, 'Vertrag Strom mit (nicht sichtbar) (Strom, Vertrag)', 'Kontakt für Jonas nicht lesbar');
    // Petra darf den Vertrag gar nicht lesen: nichts aus der Mappe – die Aufgabe hängt trotzdem an der Mappe (#798).
    const p = await fuer(petra.id);
    assert.equal(p.text, 'Vertrag (nicht sichtbar) mit (nicht sichtbar) ((nicht sichtbar), (nicht sichtbar))');
    assert.equal(p.datum, verschiebe(heuteIn(), 3));
    // Markus verwaltet, ist im Alltag aber Mitglied wie alle (#818): auch er darf den Vertrag nicht lesen.
    assert.match(l.schritte[2].text!, /2 davon dürfen die Mappe nicht sehen/);
  });

  it('Testlauf im Editor nennt, wer etwas nicht sehen darf; der Trockenlauf legt nichts an', async () => {
    const { d, lena, jonas, petra, vertrag, m, motor } = await aufbau();
    const a = await motor.lege({ name: 'Melden', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id },
      dann: [{ art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'person', id: lena.id }, { art: 'person', id: jonas.id }, { art: 'person', id: petra.id }], text: 'Notiz an {name} ({partner})' }] }, lena.id);
    const l = await motor.wiedergeben(a.id, m.id, true);
    const text = l.schritte[2].text!;
    assert.match(text, /^Würde Benachrichtigung an 3 Personen senden: Notiz an Strom \(Stadtwerke\)/);
    assert.match(text, /Jonas darf nicht alles sehen/);
    assert.match(text, /Petra darf die Mappe nicht sehen und bekäme nur einen Hinweis/);
    assert.doesNotMatch(text, /Lena darf/);
    assert.equal((await d.alleAufgaben()).length, 0);
  });

  it('Vertretung (gemeinsamer Weg aus #724): gefüllt mit den Rechten dessen, der die Aufgabe wirklich bekommt', async () => {
    const { d, konten, lena, jonas, petra, vertrag, m, motor, ereignis, ich } = await aufbau();
    await konten.setzeAbwesenheit(await ich(lena.id), lena.id, { an: true, vertreterId: jonas.id });
    await motor.lege({ name: 'Prüfen', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'person', id: lena.id }], text: 'Bitte {name} mit {partner} prüfen' }] }, petra.id);
    await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    const [x] = (await d.alleAufgaben()).filter((y) => y.mappeId === m.id && y.art === 'manuell');
    assert.equal(x.empfaengerId, jonas.id, 'an die Vertretung');
    assert.equal(x.text, 'Bitte Strom mit (nicht sichtbar) prüfen', 'mit Jonas’ Rechten, nicht mit Lenas');
  });
});

describe('Aufgaben an Personen ohne Leserecht (#798)', () => {
  it('automatische zeigen nur Hinweis und Fälligkeit – in der Liste, in „Zu erledigen“ und an der Mappe; von Hand geschriebene ihren Text', async () => {
    const { d, lena, petra, vertrag, m, motor, ereignis, ich, rufe } = await aufbau();
    await motor.lege({ name: 'Prüfen', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'person', id: petra.id }], faellig: 5, text: 'Kündigung {name} prüfen' }] }, lena.id);
    await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    await d.legeAufgabeAn(m.id, { empfaengerId: petra.id, text: 'Bitte unterschreiben' }, lena.id);
    const liste = await d.meineAufgaben(await ich(petra.id), await d.rechtepruefung.zugriff(await ich(petra.id)));
    const auto = liste.find((x) => x.datum)!;
    assert.equal(auto.text, 'Aufgabe zu einer Mappe, die du nicht sehen darfst – frag Lena');
    assert.equal(auto.datum, verschiebe(heuteIn(), 5), 'Fälligkeit bleibt');
    assert.equal(auto.mappeTitel, 'nicht sichtbare Mappe');
    assert.ok(liste.some((x) => x.text === 'Bitte unterschreiben'), 'von Hand geschrieben bleibt sichtbar');
    // Tägliche Zusammenfassung nutzt dieselbe Liste; „Zu erledigen“ und die Mappe ohne Leserecht ebenso.
    const eingang = (await rufe(petra, 'GET', '/api/mappen', { query: { sicht: 'eingang' } })).body as { aufgaben: Record<string, string> };
    assert.doesNotMatch(eingang.aufgaben[m.id], /Kündigung|Strom/);
    assert.match(eingang.aufgaben[m.id], /frag Lena/);
    await assert.rejects(rufe(petra, 'GET', '/api/mappen/:id', { params: { id: m.id } }), (e: unknown) =>
      e instanceof Fachfehler && e.status === 404 && JSON.stringify(e.details).includes('frag Lena') && !JSON.stringify(e.details).includes('Kündigung'));
  });

  it('#958: Fristen an Mappen ohne Leserecht ohne Datum und Feld – wer lesen darf, sieht beides', async () => {
    for (const repos of [undefined, ...(url ? [await pgRepos()] : [])]) {
      const { d, lena, petra, m, ich, rufe } = await aufbau(repos);
      const datum = verschiebe(heuteIn(), 30);
      for (const an of [petra, lena]) {
        await d.aufgabeAusAutomatisierung({ mappeId: m.id, empfaengerId: an.id, text: 'Strom kündbar bis', datum: null, von: lena.id, buendeln: null, anlass: {},
          aufgabenAnlass: { art: 'datum', feld: 'kuendbar_bis' }, frist: { feld: 'kuendbar_bis', datum } });
      }
      const fuer = async (b: { id: string }) => (await d.meineAufgaben(await ich(b.id), await d.rechtepruefung.zugriff(await ich(b.id)))).find((x) => x.mappeId === m.id && x.art === 'frist')!;
      const p = await fuer(petra);
      assert.deepEqual([p.datum, p.feldKey, p.anlass, p.mappeTitel], [null, null, null, 'nicht sichtbare Mappe'], 'Petra darf den Vertrag nicht lesen');
      assert.doesNotMatch(JSON.stringify(p), /kuendbar_bis|Strom/);
      assert.doesNotMatch(JSON.stringify((await rufe(petra, 'GET', '/api/aufgaben')).body), new RegExp(`kuendbar_bis|${datum}`), 'auch über die API');
      const l = await fuer(lena);
      assert.deepEqual([l.datum, l.feldKey, l.anlass?.art], [datum, 'kuendbar_bis', 'datum'], 'Lena darf lesen');
    }
  });

  it('beim Zuweisen von Hand: Prüfung vorab, Aufgabe kommt an, der Admin erfährt es (Fall, Hinweis über #719)', async () => {
    const { d, lena, jonas, petra, m, rufe } = await aufbau();
    assert.deepEqual((await rufe(lena, 'GET', '/api/mappen/:id/leserecht/:benutzer', { params: { id: m.id, benutzer: petra.id } })).body, { lesen: false });
    assert.deepEqual((await rufe(lena, 'GET', '/api/mappen/:id/leserecht/:benutzer', { params: { id: m.id, benutzer: jonas.id } })).body, { lesen: true });
    await assert.rejects(rufe(petra, 'GET', '/api/mappen/:id/leserecht/:benutzer', { params: { id: m.id, benutzer: jonas.id } }), status(404), 'nur wer die Mappe lesen darf');
    const r = (await rufe(lena, 'POST', '/api/mappen/:id/aufgaben', { params: { id: m.id }, body: { empfaengerId: petra.id, text: 'Bitte unterschreiben' } })).body as { id: string; hinweis?: string };
    assert.match(r.hinweis ?? '', /nicht lesen/);
    const offen = await d.offeneFaelle();
    assert.equal(offen.length, 1);
    assert.deepEqual([offen[0].aufgabeId, offen[0].benutzerId, offen[0].mappeId, offen[0].aufgabentext, offen[0].leserechtSeit], [r.id, petra.id, m.id, 'Bitte unterschreiben', null]);
    // Jonas darf lesen: kein Fall.
    await d.legeAufgabeAn(m.id, { empfaengerId: jonas.id, text: 'Gegenlesen' }, lena.id);
    assert.equal((await d.offeneFaelle()).length, 1);
  });

  it('Leserecht auf Zeit: nur diese Mappe, nur Lesen, Historie für Vergabe und Entzug, Testlauf mit Grund; endet mit dem Erledigen', async () => {
    for (const repos of [undefined, ...(url ? [await pgRepos()] : [])]) {
      const { d, markus, lena, petra, vertrag, m, stadtwerke, rufe, ich } = await aufbau(repos);
      const andere = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas' } }, lena.id);
      const auf = await d.legeAufgabeAn(m.id, { empfaengerId: petra.id, text: 'Bitte unterschreiben' }, lena.id);
      const [fall] = (await d.faelleUebersicht()).offen;
      await assert.rejects(rufe(petra, 'GET', '/api/mappen/:id', { params: { id: m.id } }), status(404));
      await rufe(markus, 'POST', '/api/werkbank/aufgaben/ohne-leserecht/:id/leserecht', { params: { id: fall.id } });
      const z = await d.rechtepruefung.zugriff(await ich(petra.id));
      const offen = (await rufe(petra, 'GET', '/api/mappen/:id', { params: { id: m.id } })).body as { rechte: { R: boolean; U: boolean; D: boolean; P: boolean } };
      assert.deepEqual([offen.rechte.R, offen.rechte.U, offen.rechte.D, offen.rechte.P], [true, false, false, false], 'nur Lesen');
      assert.ok((await d.rechtepruefung.lesbare(z, [m.id, andere.id, stadtwerke.id])).has(m.id));
      assert.ok(!(await d.rechtepruefung.lesbare(z, [andere.id])).has(andere.id), 'nur diese Mappe');
      assert.ok(!(await d.rechtepruefung.lesbare(z, [stadtwerke.id])).has(stadtwerke.id));
      // Zweimal geben ändert nichts.
      await d.leserechtAufZeitGeben(fall.id, markus.id);
      const test = await d.testlauf({ mappeId: m.id, benutzerId: petra.id }) as { wirksam: { R: boolean }; aufZeit?: { aufgabe: string; von: string | null; wirkt: boolean } };
      assert.equal(test.wirksam.R, true);
      assert.deepEqual(test.aufZeit && [test.aufZeit.aufgabe, test.aufZeit.von, test.aufZeit.wirkt], ['Bitte unterschreiben', 'Markus', true]);
      await d.erledigeAufgabe(auf.id, { id: petra.id, rolle: 'mitglied' });
      await assert.rejects(rufe(petra, 'GET', '/api/mappen/:id', { params: { id: m.id } }), status(404), 'Recht endet mit dem Erledigen');
      const h = (await d.historie(m.id)).filter((x) => x.art === 'leserecht').map((x) => x.daten.text);
      assert.deepEqual(h.sort(), ['Leserecht an Petra wegen Aufgabe „Bitte unterschreiben“ vergeben (von Markus)', 'Leserecht von Petra nach Erledigen der Aufgabe wieder entzogen'].sort());
      const u = await d.faelleUebersicht();
      assert.equal(u.offen.length, 0);
      assert.deepEqual(u.vergangen.map((x) => [x.benutzerId, x.mappeId, x.endeGrund, !!x.leserechtSeit, x.leserechtVon, !!x.ende, x.mappeTitel]), [[petra.id, m.id, 'erledigt', true, markus.id, true, 'Strom']]);
      await assert.rejects(d.leserechtAufZeitGeben(fall.id, markus.id), status(409), 'vergangener Fall');
    }
  });

  it('Leserecht auf Zeit endet auch beim Weitergeben; rechtlich behobene Fälle enden als „darf jetzt lesen“', async () => {
    const { d, markus, lena, jonas, petra, vertrag, m, lesen } = await aufbau();
    const auf = await d.legeAufgabeAn(m.id, { empfaengerId: petra.id, text: 'Bitte unterschreiben' }, lena.id);
    const [fall] = (await d.faelleUebersicht()).offen;
    await d.leserechtAufZeitGeben(fall.id, markus.id);
    assert.ok((await d.rechtepruefung.sichtbarFuer(petra.id, [m.id])).has(m.id));
    await d.delegiereAufgabe(auf.id, jonas.id, { id: petra.id, rolle: 'mitglied' });
    assert.ok(!(await d.rechtepruefung.sichtbarFuer(petra.id, [m.id])).has(m.id));
    assert.ok((await d.historie(m.id)).some((x) => x.art === 'leserecht' && x.daten.text === 'Leserecht von Petra nach Weitergeben der Aufgabe wieder entzogen'));
    // Rechte nachträglich geändert: erst sieht Jonas den Vertrag nicht mehr (neuer Fall), dann wieder (Fall endet).
    await d.setzeBerechtigungen(vertrag.id, lesen([lena.id]), true);
    assert.deepEqual(await d.faelleAbgleichen(), { neu: 1, beendet: 0 });
    assert.equal((await d.offeneFaelle())[0].benutzerId, jonas.id);
    await d.setzeBerechtigungen(vertrag.id, lesen([lena.id, jonas.id]), true);
    assert.deepEqual(await d.faelleAbgleichen(), { neu: 0, beendet: 1 });
    const vergangen = (await d.faelleUebersicht()).vergangen.map((x) => [x.benutzerId, x.endeGrund, !!x.leserechtSeit]);
    assert.deepEqual(vergangen.sort(), [[jonas.id, 'lesbar', false], [petra.id, 'weitergegeben', true]].sort());
  });

  it('Werkbank: Übersicht der Fälle und Markierung in der Aufgabenliste, nur für Administratoren', async () => {
    const { d, markus, lena, petra, m, rufe } = await aufbau();
    const auf = await d.legeAufgabeAn(m.id, { empfaengerId: petra.id, text: 'Bitte unterschreiben' }, lena.id);
    const w = (await rufe(markus, 'GET', '/api/werkbank/aufgaben')).body as { unlesbar: string[] };
    assert.deepEqual(w.unlesbar, [auf.id]);
    const u = (await rufe(markus, 'GET', '/api/werkbank/aufgaben/ohne-leserecht')).body as { offen: Array<{ mappeTitel: string; typId: string }>; vergangen: unknown[] };
    assert.deepEqual([u.offen.length, u.offen[0].mappeTitel, u.vergangen.length], [1, 'Strom', 0]);
    const tabelle = routen(d, (await aufbau()).konten, {});
    assert.ok(['/api/werkbank/aufgaben/ohne-leserecht', '/api/werkbank/aufgaben/ohne-leserecht/:id/leserecht'].every((p) => tabelle.find((r) => r.pfad === p)?.zugang === 'admin'), 'nur Administratoren');
  });
});
