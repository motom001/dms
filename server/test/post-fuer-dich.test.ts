/**
 * „Post für dich“ als Automatisierung (#1001, dms-registry #153) – gleiches Verhalten wie die bis 0.256 eingebaute
 * Aufgabe (Muster E5): anlegen, Vertretung, erledigt sich selbst (zugeordnet, erledigt, an jemand anderen), keine
 * Dubletten. Dazu das Update (mit und ohne Paket „Benachrichtigungen“), der Umzug der Freigabe „Favoriten
 * benachrichtigen“ in die Automatisierung und die Wenn-Karte „Mappe gespeichert“ mit „auch beim Anlegen“.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { bereinigeAutomatisierung, kurzform, automatisierungsProbleme } from '../../shared/src/automatisierung';
import { POST_STAND, type Aufgabe } from '../../shared/src/model';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { Automatisierungen, BENACHRICHTIGUNGEN_PAKET, istPostFuerDich, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { liesPaket } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';

/** Die Automatisierung so, wie sie in pakete/benachrichtigungen/inhalt/automatisierungen.yaml (1.3.0) steht. */
const AUS_DEM_PAKET = {
  schluessel: 'post_fuer_dich', name: 'Post für dich', beschreibung: 'Wer bei neuer Post unter „An“ steht, bekommt eine Aufgabe.',
  wenn: { art: 'mappe.geaendert', typ: 'dms:post', felder: ['an', 'stand'], angelegt: true },
  und: { modus: 'alle', karten: [
    { art: 'bedingung', bedingung: { art: 'feld', feld: 'an', op: 'nichtLeer' } },
    { art: 'bedingung', bedingung: { art: 'feld', feld: 'stand', op: 'einerVon', wert: { art: 'fest', wert: ['Neu'] } } },
  ] },
  dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'feld', feld: 'an' }], text: 'Post für dich – bitte zuordnen' }],
};

const paket = (id = BENACHRICHTIGUNGEN_PAKET): InstalliertesPaket => ({
  id, name: 'Benachrichtigungen', version: '1.2.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'Markus', github: 'beispiel' },
  herkunft: { art: 'katalog', url: 'https://example.org/katalog.json' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
  typen: {}, sichten: {},
} as unknown as InstalliertesPaket);

async function aufbau() {
  const einst = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: einst });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name }, markus.id)).benutzer;
  const lena = await neu('Lena'); const jonas = await neu('Jonas'); const petra = await neu('Petra');
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const konto = await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
  d.ereignisse.abonniere('automatisierungen', (e) => motor.ereignis(e));
  const postTyp = (await d.kern.system()).post.id;
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
  /** Ausgangskorb verteilen, auch gebündelte Ereignisse („Mappe geändert“, 5 s). */
  const verteile = async () => {
    const echt = Date.now;
    Date.now = () => echt() + 6000;
    try { await d.ereignisse.verteile(); } finally { Date.now = echt; }
  };
  const offene = async (mappeId: string) => ((await d.ohneLeserecht.aufgabenVon(mappeId)) as Aufgabe[]).filter((a) => !a.erledigt && a.art === 'post');
  const ich = { id: markus.id, name: 'Markus' };
  const nutzer = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  return { d, einst, konten, motor, markus, lena, jonas, petra, konto, postTyp, vertrag, verteile, offene, ich, nutzer };
}

/** Wie das Paket 1.3.0: über die Installation (`ausPaket`) mit `dms:post`. */
async function ausDemPaket(x: Awaited<ReturnType<typeof aufbau>>, ein = ['post_fuer_dich']) {
  const p = paket();
  await x.d.kern.repo.speicherePaket(p);
  await x.motor.ausPaket(p, [AUS_DEM_PAKET], ein);
  return (await x.motor.uebersicht()).automatisierungen.find((a) => a.herkunft === 'paket' && a.paketId === p.id)!;
}

describe('„Post für dich“ als Automatisierung (#1001, dms-registry #153)', () => {
  it('aus dem Paket: dms:post wird der Typ Post, eingeschaltet, nichts angehalten; Kurzform „Post angelegt oder …“', async () => {
    const x = await aufbau();
    const a = await ausDemPaket(x);
    assert.equal(a.wenn.art, 'mappe.geaendert');
    assert.deepEqual([a.wenn.typ, a.wenn.art === 'mappe.geaendert' && a.wenn.angelegt, a.aktiv, a.angehalten, a.probleme], [x.postTyp, true, true, null, []]);
    assert.ok(istPostFuerDich(a, x.postTyp));
    assert.match(a.kurz, /Post angelegt oder/);
    // Der Kern liest das Paket so, wie es im Katalog liegt (Form wie in dms-registry).
    assert.equal((await x.motor.warnungen()).ohnePostFuerDich, false);
  });

  it('gleiches Verhalten wie bisher: anlegen, „An“ wechselt, erledigt, zugeordnet – je Post und Person eine', async () => {
    const x = await aufbau();
    const { d, lena, jonas, markus, konto, vertrag, verteile, offene, ich } = x;
    const a = await ausDemPaket(x);
    // Der Kern legt sie nicht mehr selbst an.
    const post = await d.post.legePostAn({ betreff: 'Brief der Stadtwerke', an: lena.id }, ich);
    assert.equal((await offene(post.id)).length, 0);
    await verteile();
    let p = await offene(post.id);
    assert.deepEqual(p.map((y) => [y.empfaengerId, y.feldKey, y.text, y.erstelltVon, y.anlass?.art, y.anlass?.automatisierung]),
      [[lena.id, `an:${lena.id}`, 'Post für dich – bitte zuordnen', konto.id, 'post', a.id]]);
    assert.equal(p[0].art, 'post', 'Art „Post für dich“ wie bisher (Filter, Anzeige)');
    // Noch einmal ausgelöst (Ausprobieren, gleiches Ereignis): keine zweite.
    await x.motor.wiedergeben(a.id, post.id, false);
    await d.mappen.aendereMappe(post.id, { werte: { betreff: 'Brief der Stadtwerke (Abschlag)' } }, markus.id);
    await verteile();
    assert.equal((await offene(post.id)).length, 1);
    // An Jonas: Lenas erledigt sich sofort (Kern), Jonas bekommt eine.
    await d.mappen.aendereMappe(post.id, { werte: { an: jonas.id } }, markus.id);
    assert.equal((await offene(post.id)).length, 0);
    await verteile();
    p = await offene(post.id);
    assert.deepEqual(p.map((y) => [y.empfaengerId, y.feldKey]), [[jonas.id, `an:${jonas.id}`]]);
    // „An“ geleert: erledigt, keine neue (die Bedingung „An ist nicht leer“ trifft nicht zu, kein Fehler).
    await d.mappen.aendereMappe(post.id, { werte: { an: null } }, markus.id);
    await verteile();
    assert.equal((await offene(post.id)).length, 0);
    assert.equal((await x.motor.laeufe(a.id))[0].zustand, 'unzutreffend');
    // Wieder an Lena, dann zugeordnet: erledigt.
    await d.mappen.aendereMappe(post.id, { werte: { an: lena.id } }, markus.id);
    await verteile();
    assert.equal((await offene(post.id)).length, 1);
    const ziel = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, lena.id);
    await d.post.ordneZu(post.id, { ziel: ziel.id }, lena.id);
    await verteile();
    assert.equal((await offene(post.id)).length, 0);
    // Erledigt ohne Zuordnung: ebenso.
    const zweite = await d.post.legePostAn({ betreff: 'Werbung', an: jonas.id }, ich);
    await verteile();
    assert.equal((await offene(zweite.id)).length, 1);
    await d.mappen.aendereMappe(zweite.id, { werte: { stand: POST_STAND.erledigt } }, jonas.id);
    await verteile();
    assert.equal((await offene(zweite.id)).length, 0);
    // Ohne „An“: keine Aufgabe, kein Fehlschlag.
    const ohne = await d.post.legePostAn({ betreff: 'Für alle' }, ich);
    await verteile();
    assert.equal((await offene(ohne.id)).length, 0);
    assert.equal((await x.motor.warnungen()).fehlgeschlagen, 0);
  });

  it('Vertretung: ist die Person unter „An“ abwesend, bekommt die Vertretung die Aufgabe – sie erledigt sich wie bisher', async () => {
    const x = await aufbau();
    const { d, konten, lena, jonas, petra, markus, verteile, offene, ich, nutzer } = x;
    await ausDemPaket(x);
    await konten.setzeAbwesenheit(await nutzer(lena.id), lena.id, { an: true, vertreterId: jonas.id });
    const post = await d.post.legePostAn({ betreff: 'Brief', an: lena.id }, ich);
    await verteile();
    const p = await offene(post.id);
    assert.deepEqual(p.map((y) => [y.empfaengerId, y.feldKey]), [[jonas.id, `an:${lena.id}`]]);
    assert.ok((await d.mappenHistorie.historie(post.id)).some((h) => h.art === 'aufgabe' && /weitergegeben wegen Abwesenheit von Lena/.test(String(h.daten.text))));
    // Noch einmal gespeichert: keine zweite (auch nicht bei Lena).
    await d.mappen.aendereMappe(post.id, { werte: { stand: POST_STAND.neu, betreff: 'Brief!' } }, markus.id);
    await verteile();
    assert.equal((await offene(post.id)).length, 1);
    // An Petra: Jonas' (für Lena) erledigt sich.
    await d.mappen.aendereMappe(post.id, { werte: { an: petra.id } }, markus.id);
    await verteile();
    assert.deepEqual((await offene(post.id)).map((y) => y.empfaengerId), [petra.id]);
  });

  it('versandte E-Mails (ausgehend, erledigt) und andere Mappentypen: keine Aufgabe', async () => {
    const x = await aufbau();
    const { d, lena, vertrag, verteile, offene, ich } = x;
    await ausDemPaket(x);
    const post = await d.post.legePostAn({ betreff: 'Erledigt', an: lena.id }, ich);
    await d.mappen.aendereMappe(post.id, { werte: { stand: POST_STAND.erledigt } }, lena.id);
    await verteile();
    assert.equal((await offene(post.id)).length, 0);
    const v = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, lena.id);
    await verteile();
    assert.equal((await d.ohneLeserecht.aufgabenVon(v.id)).length, 0);
  });
});

describe('Update auf 0.257 (#1001)', () => {
  it('ohne Paket „Benachrichtigungen“: keine Automatisierung, Hinweis in der Übersicht; einmal', async () => {
    const x = await aufbau();
    assert.equal(await x.motor.postFuerDichUebernehmen(), 0);
    assert.equal((await x.motor.uebersicht()).automatisierungen.length, 0);
    const w = await x.motor.warnungen();
    assert.deepEqual([w.ohneBenachrichtigungen, w.ohnePostFuerDich], [true, true]);
    assert.deepEqual(await x.einst.lies('post_umzug').then((v) => (v as { paket: boolean }).paket), false);
    // Neue Post bleibt ohne Aufgabe – so entschieden in #1001.
    const post = await x.d.post.legePostAn({ betreff: 'Brief', an: x.lena.id }, x.ich);
    await x.verteile();
    assert.equal((await x.offene(post.id)).length, 0);
    // Auch nach dem späteren Installieren entsteht beim nächsten Start keine eigene (das Paket bringt sie mit).
    await x.d.kern.repo.speicherePaket(paket());
    assert.equal(await x.motor.postFuerDichUebernehmen(), 0);
  });

  it('mit Paket: eingeschaltete Automatisierung; offene Aufgaben von vorher bleiben, erledigen sich, keine Dublette; das Paket-Update ersetzt sie', async () => {
    const x = await aufbau();
    const { d, lena, jonas, markus, vertrag, verteile, offene, ich } = x;
    // Vor dem Update: „Post für dich“, wie der Kern sie bis 0.256 anlegte (ohne Anlass).
    const alt = await d.post.legePostAn({ betreff: 'Alt', an: lena.id }, ich);
    const altA = await d.kern.repo.legeAufgabeAn({ id: randomUUID(), mappeId: alt.id, empfaengerId: lena.id, art: 'post', text: 'Post für dich', feldKey: `an:${lena.id}`, erstellt: new Date().toISOString(), erstelltVon: markus.id, erledigt: null, erledigtVon: null });
    await d.kern.repo.speicherePaket(paket());
    assert.equal(await x.motor.postFuerDichUebernehmen(), 1);
    assert.equal(await x.motor.postFuerDichUebernehmen(), 0, 'nur einmal');
    const [u] = (await x.motor.uebersicht()).automatisierungen;
    assert.deepEqual([u.name, u.aktiv, u.herkunft, u.probleme], ['Post für dich', true, 'eigen', []]);
    assert.equal((await x.motor.warnungen()).ohnePostFuerDich, false);
    await verteile();
    // Die alte bleibt, keine zweite daneben – auch nicht nach erneutem Auslösen.
    await x.motor.wiedergeben(u.id, alt.id, false);
    assert.deepEqual((await offene(alt.id)).map((y) => y.id), [altA.id]);
    // Sie erledigt sich wie bisher.
    const ziel = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, lena.id);
    await d.post.ordneZu(alt.id, { ziel: ziel.id }, lena.id);
    assert.equal((await offene(alt.id)).length, 0);
    // Neue Post: wie bisher.
    const neu = await d.post.legePostAn({ betreff: 'Neu', an: jonas.id }, ich);
    await verteile();
    assert.deepEqual((await offene(neu.id)).map((y) => y.empfaengerId), [jonas.id]);
    // Paket-Update auf 1.3.0 (auch ohne Haken): ersetzt die übernommene, an bleibt an.
    await x.motor.ausPaket(paket(), [AUS_DEM_PAKET], []);
    const liste = (await x.motor.uebersicht()).automatisierungen;
    assert.deepEqual(liste.map((a) => [a.herkunft, a.aktiv]), [['paket', true]]);
    const weitere = await d.post.legePostAn({ betreff: 'Weitere', an: lena.id }, ich);
    await verteile();
    assert.equal((await offene(weitere.id)).length, 1);
    assert.equal((await offene(neu.id)).length, 1, 'keine zweite für Jonas');
  });
});

describe('Zähler „Neue Post“ unverändert (#1001)', () => {
  it('neue Post zählt bei der Person unter „An“, mit und ohne Automatisierung gleich', async () => {
    const x = await aufbau();
    const L = { id: x.lena.id, rolle: 'mitglied' as const };
    const zahl = async () => (await x.d.sichten.zaehlerAbruf(await x.d.rechtepruefung.zugriff(L))).zahlen;
    const vorher = await zahl();
    await x.d.post.legePostAn({ betreff: 'Ohne Automatisierung', an: x.lena.id }, x.ich);
    await x.verteile();
    const ohne = await zahl();
    assert.equal(ohne.neuePost, vorher.neuePost + 1);
    assert.equal(ohne.zuErledigen, vorher.zuErledigen, 'ohne Automatisierung keine Aufgabe');
    await ausDemPaket(x);
    await x.d.post.legePostAn({ betreff: 'Mit Automatisierung', an: x.lena.id }, x.ich);
    await x.verteile();
    const mit = await zahl();
    assert.equal(mit.neuePost, ohne.neuePost + 1, 'Neue Post zählt die Post, nicht die Aufgaben');
  });
});

describe('Favoriten benachrichtigen: Freigabe → Automatisierung (#1001)', () => {
  const favoriten = { name: 'Favoriten-Änderungen melden', aktiv: true, wenn: { art: 'favorit.geaendert' }, dann: [{ art: 'favoriten' }] };

  it('„nur bestimmte Rollen“ und „Vorgabe aus“ wandern in die Karte; die Einstellung fällt weg', async () => {
    const x = await aufbau();
    const rolle = (await x.d.postSystemmappen.listeRollen()).find((r) => r.system)!;
    const a = await x.motor.lege(favoriten, null);
    await x.einst.schreibe('favoriten_freigabe', { erlaubt: 'rollen', rollen: [rolle.id], vorgabe: false });
    assert.equal(await x.motor.favoritenFreigabeUebernehmen(), 1);
    const neu = await x.motor.hole(a.id);
    assert.deepEqual(neu.dann.map((k) => (k.art === 'favoriten' ? [k.rollen, k.vorgabe] : null)), [[[rolle.id], false]]);
    assert.equal(neu.aktiv, true);
    assert.equal(neu.geaendertVon, x.konto.id, 'gilt als angepasst – ein Paket-Update überschreibt es nicht');
    assert.equal(await x.einst.lies('favoriten_freigabe'), null);
    assert.equal(await x.motor.favoritenFreigabeUebernehmen(), 0, 'nur einmal');
    // Wirkt: Regeln für Profil und neue Benutzer.
    assert.deepEqual(await x.d.favoritenRegeln!(), [{ rollen: [rolle.id], vorgabe: false }]);
    assert.equal(await x.d.ohneEmpfaenger.favoritenVorgabe(), false);
    assert.match(neu.kurz, /nur /);
  });

  it('„für niemanden“ schaltet die Automatisierung aus; „für alle“ ändert nichts', async () => {
    const x = await aufbau();
    const a = await x.motor.lege(favoriten, null);
    await x.einst.schreibe('favoriten_freigabe', { erlaubt: 'aus', rollen: [], vorgabe: true });
    await x.motor.favoritenFreigabeUebernehmen();
    assert.equal((await x.motor.hole(a.id)).aktiv, false);
    assert.equal(await x.d.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(x.lena.id), false);
    const y = await aufbau();
    const b = await y.motor.lege(favoriten, null);
    await y.einst.schreibe('favoriten_freigabe', { erlaubt: 'alle', rollen: [], vorgabe: true });
    assert.equal(await y.motor.favoritenFreigabeUebernehmen(), 0);
    assert.equal((await y.motor.hole(b.id)).version, 1);
    assert.equal(await y.d.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(y.lena.id), true);
  });

  it('Karte: Rollen und Vorgabe werden gespeichert, eine gelöschte Rolle ist ein Problem', () => {
    const d = bereinigeAutomatisierung({ name: 'F', wenn: { art: 'favorit.geaendert' }, dann: [{ art: 'favoriten', rollen: ['r1', 'r1', ''], vorgabe: false }] });
    assert.deepEqual(d.dann, [{ id: 'k1', art: 'favoriten', rollen: ['r1'], vorgabe: false }]);
    const k = { typen: [], sichten: [], benutzer: [], rollen: [{ id: 'r1', name: 'Buchhaltung' }] };
    assert.deepEqual(automatisierungsProbleme(d, k), []);
    assert.match(kurzform(d, k), /nur Buchhaltung/);
    assert.ok(automatisierungsProbleme(d, { ...k, rollen: [] }).some((p) => /Rollen gibt es nicht mehr/.test(p)));
    assert.deepEqual(bereinigeAutomatisierung({ name: 'F', wenn: { art: 'favorit.geaendert' }, dann: [{ art: 'favoriten' }] }).dann, [{ id: 'k1', art: 'favoriten' }]);
  });
});

describe('Wenn „Mappe gespeichert“ auch beim Anlegen (#1001)', () => {
  it('nur bei „Mappe gespeichert“; löst bei neuen Mappen aus, beim Speichern nur mit den gewählten Feldern', async () => {
    assert.equal('angelegt' in bereinigeAutomatisierung({ wenn: { art: 'mappe.angelegt', angelegt: true } }).wenn, false);
    assert.equal('angelegt' in bereinigeAutomatisierung({ wenn: { art: 'mappe.geaendert', angelegt: 'ja' } }).wenn, false);
    const x = await aufbau();
    const { d, motor, vertrag, lena, verteile } = x;
    const a = await motor.lege({ name: 'Neu oder Name', aktiv: true, wenn: { art: 'mappe.geaendert', typ: vertrag.id, felder: ['name'], angelegt: true },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'person', id: lena.id }], text: 'Ansehen: {name}' }] }, null);
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, lena.id);
    await verteile();
    assert.equal((await motor.laeufe(a.id)).length, 1, 'beim Anlegen');
    await d.mappen.aendereMappe(m.id, { werte: { name: 'Strom 2027' } }, lena.id);
    await verteile();
    assert.equal((await motor.laeufe(a.id)).length, 2, 'Name geändert');
    // Ohne „auch beim Anlegen“ nur beim Speichern.
    const b = await motor.aendere(a.id, { ...(await motor.hole(a.id)), wenn: { art: 'mappe.geaendert', typ: vertrag.id, felder: ['name'] } }, null);
    await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas' } }, lena.id);
    await verteile();
    assert.equal((await motor.laeufe(b.id)).length, 2);
  });

  it('pakete.ts: dms:post erlaubt, andere Typen von Ablago und feste Rollen an „favoriten“ nicht', async () => {
    const yaml = (autos: string) => new Map<string, Buffer>([
      ['manifest.yaml', Buffer.from('schema: 1\nid: probe\nname: Probe\nversion: 1.0.0\nbeschreibung: Probe\nautor: { name: Markus, github: beispiel }\nlizenz: Apache-2.0\ndms: ">=0.257.0"\nabhaengigkeiten: {}\ninhalt:\n  automatisierungen: inhalt/automatisierungen.yaml\n')],
      ['inhalt/automatisierungen.yaml', Buffer.from(autos)], ['README.md', Buffer.from('# Probe\n')], ['LICENSE', Buffer.from('Apache')], ['CHANGELOG.md', Buffer.from('# Änderungen\n')],
    ]);
    const gut = liesPaket(yaml('- schluessel: p\n  name: P\n  wenn: { art: mappe.geaendert, typ: "dms:post", felder: [an], angelegt: true }\n  dann:\n    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: feld, feld: an }], text: x }\n'));
    assert.equal(gut.automatisierungen[0].wenn.typ, 'dms:post');
    const gruende = (f: () => unknown) => { try { f(); return ''; } catch (e) { return JSON.stringify((e as { details?: unknown }).details); } };
    assert.match(gruende(() => liesPaket(yaml('- schluessel: r\n  name: R\n  wenn: { art: mappe.geaendert, typ: "dms:rolle" }\n  dann:\n    - { art: stopp }\n'))), /nur dms:post/);
    assert.match(gruende(() => liesPaket(yaml('- schluessel: f\n  name: F\n  wenn: { art: favorit.geaendert }\n  dann:\n    - { art: favoriten, rollen: [x] }\n'))), /feste Rollen/);
  });

  it('Ausprobieren der Täglichen Zusammenfassung mit einer Benutzer-Mappe (statt „Jetzt senden“)', async () => {
    const x = await aufbau();
    const an: string[] = [];
    x.d.zusammenfassungAn = async (id) => { an.push(id); return { gesendet: true, grund: 'ok' }; };
    const a = await x.motor.lege({ name: 'Tägliche Zusammenfassung', aktiv: true, wenn: { art: 'zeitplan', uhrzeit: '07:00', tage: [1, 2, 3, 4, 5], feiertage: true, jeBenutzer: true, profilzeit: true }, dann: [{ art: 'zusammenfassung' }] }, null);
    const l = await x.motor.wiedergeben(a.id, x.lena.id, false);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    assert.deepEqual(an, [x.lena.id]);
    assert.equal((await x.d.zusammenfassungVorgabe!())?.uhrzeit, '07:00');
  });
});

