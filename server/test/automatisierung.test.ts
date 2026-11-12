/**
 * Motor der Automatisierungen (#674): Speichern nur gültig, Wenn passt, Und (umkehrbar, Gruppen, Ansicht, Favorit),
 * Reihenfolge und „Danach keine weiteren …“, Schutz (Selbstauslösung, Kette, Bremse), genau ein Lauf je Ereignis,
 * Trockenlauf, Wiederholen, Änderungsverlauf, rot und angehalten bei fehlendem Feld, „Datum in N Tagen“ mit Nachholen,
 * Platzhalter mit den Rechten des Systemkontos – im Arbeitsspeicher; das Repo in PostgreSQL steht in pg.test.ts.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { automatisierungsProblemOrte, automatisierungsProbleme, bereinigeAutomatisierung, kurzform } from '../../shared/src/automatisierung';
import type { KatalogEreignis } from '../../shared/src/ereignisse';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { Automatisierungen, pgAutomatisierungRepo, speicherAutomatisierungRepo } from '../src/automatisierung';
import type { Automatisierung } from '../../shared/src/automatisierung';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

async function aufbau(uhr: () => number = Date.now) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'status', label: 'Status', typ: 'auswahl', optionen: ['offen', 'erledigt'] },
    { key: 'kuendbar_bis', label: 'Kündbar bis', typ: 'datum' },
  ] });
  const repo = speicherAutomatisierungRepo(uhr);
  const motor = new Automatisierungen({ dienst: d, repo, uhr });
  const ereignis = (art: string, daten: Record<string, unknown>, ausloeser: KatalogEreignis['ausloeser'] = { art: 'benutzer', id: admin.id, konto: admin.id }): KatalogEreignis =>
    ({ id: crypto.randomUUID(), art: art as KatalogEreignis['art'], daten, ausloeser, erstellt: new Date().toISOString() });
  return { d, konten, admin, vertrag, repo, motor, ereignis };
}

const stopp = { id: 's', art: 'stopp' };

describe('Automatisierungen (#674): Modell', () => {
  it('bereinigt Eingaben, Reihenfolge 1–99, eindeutige Karten-Ids, Gruppen nur eine Ebene', () => {
    const a = bereinigateste();
    assert.equal(a.reihenfolge, 99);
    assert.deepEqual(a.dann.map((k) => k.id), ['s', 's-2']);
    assert.equal(a.und.karten.length, 1);
    assert.equal(a.und.karten[0].art, 'gruppe');
    assert.equal((a.und.karten[0] as { karten: unknown[] }).karten.length, 1, 'Gruppe in Gruppe fällt weg');
    function bereinigateste() {
      return bereinigeAutomatisierung({ name: ' Test ', reihenfolge: 500, wenn: { art: 'mappe.angelegt' }, dann: [stopp, stopp, { art: 'gibtsnicht' }],
        und: { karten: [{ art: 'gruppe', modus: 'eine', karten: [{ art: 'favorit', von: { art: 'person', id: 'x' } }, { art: 'gruppe', karten: [] }] }] } });
    }
  });

  it('meldet fehlende Typen, Felder, Ansichten und leere Dann-Bereiche; Kurzform', async () => {
    const { vertrag, d } = await aufbau();
    const k = await d.automatisierungshilfen.automatisierungKontext();
    const a = bereinigeAutomatisierung({ name: 'X', wenn: { art: 'datum', typ: vertrag.id, feld: 'kuendbar_bis', tage: 7 }, dann: [stopp] });
    assert.deepEqual(automatisierungsProbleme(a, k), []);
    assert.match(kurzform(a, k), /^Wenn Vertrag: Kündbar bis in 7 Tagen → danach keine weiteren$/);
    assert.match(automatisierungsProbleme({ ...a, wenn: { ...a.wenn, feld: 'gibts' } as never }, k).join(), /gibt es im Mappentyp „Vertrag“ nicht/);
    assert.match(automatisierungsProbleme({ ...a, dann: [] }, k).join(), /mindestens eine Dann-Karte/);
    assert.match(automatisierungsProbleme({ ...a, und: { modus: 'alle', karten: [{ art: 'ansicht', sicht: 'weg' }] } }, k).join(), /Ansicht/);
    assert.ok(!k.benutzer.some((b) => b.name === 'Automatisierung'), 'Systemkonto steht nicht in der Auswahl');
    // Jedes Problem mit seinem Bereich im Editor (#1000): Grunddaten, Wenn (mit Und) oder Dann.
    const orte = (x: typeof a) => [...new Set(automatisierungsProblemOrte(x, k).map((p) => p.ort))].sort();
    assert.deepEqual(orte({ ...a, name: '' }), ['grunddaten']);
    assert.deepEqual(orte({ ...a, wenn: { ...a.wenn, feld: 'gibts' } as never }), ['wenn']);
    assert.deepEqual(orte({ ...a, und: { modus: 'alle', karten: [{ art: 'ansicht', sicht: 'weg' }] } }), ['wenn'], 'Und-Bedingungen stehen bei Wenn');
    assert.deepEqual(orte({ ...a, name: '', dann: [] }), ['dann', 'grunddaten']);
    assert.deepEqual(automatisierungsProbleme({ ...a, name: '', dann: [] }, k), automatisierungsProblemOrte({ ...a, name: '', dann: [] }, k).map((p) => p.text), 'dieselben Texte');
  });
});

describe('Automatisierungen (#674): Verwalten', () => {
  it('nur gültig speicherbar, neu ausgeschaltet, Änderungsverlauf mit Wiederherstellen, Konflikt bei veraltetem Stand', async () => {
    const { motor, vertrag, admin } = await aufbau();
    await assert.rejects(motor.lege({ name: '', wenn: { art: 'mappe.angelegt' }, dann: [] }, admin.id), /Namen/);
    // Die Antwort nennt die Bereiche des Editors (#1000), damit die Oberfläche sie öffnet.
    await assert.rejects(motor.lege({ name: '', wenn: { art: 'mappe.angelegt' }, dann: [] }, admin.id), (e: { details?: { orte?: string[] } }) => (assert.deepEqual(e.details?.orte, ['grunddaten', 'dann']), true));
    const a = await motor.lege({ name: 'Neu', wenn: { art: 'mappe.angelegt', typ: vertrag.id }, dann: [stopp] }, admin.id);
    assert.equal(a.aktiv, false);
    assert.equal(a.reihenfolge, 50);
    const b = await motor.aendere(a.id, { name: 'Umbenannt', version: a.version }, admin.id);
    await assert.rejects(motor.aendere(a.id, { name: 'Alt', version: a.version }, admin.id), /inzwischen geändert/);
    assert.deepEqual((await motor.fassungen(a.id)).map((f) => f.daten.name), ['Umbenannt', 'Neu']);
    const c = await motor.stelleWieder(a.id, 1, admin.id);
    assert.equal(c.name, 'Neu');
    assert.equal(c.version, b.version + 1);
    const kopie = await motor.kopiere(a.id, admin.id);
    assert.equal(kopie.name, 'Neu (Kopie)');
    assert.equal((await motor.schalte(a.id, true, admin.id)).aktiv, true);
  });
});

describe('Automatisierungen (#674): Ausführen', () => {
  it('Wenn passt nach Typ und geänderten Feldern; genau ein Lauf je Ereignis; Und mit Umkehr und Gruppen', async () => {
    const { motor, vertrag, admin, d, ereignis } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', status: 'offen' } }, admin.id);
    const a = await motor.lege({ name: 'Status', aktiv: true, wenn: { art: 'mappe.geaendert', typ: vertrag.id, felder: ['status'] }, dann: [stopp],
      und: { modus: 'alle', karten: [{ art: 'bedingung', bedingung: { art: 'feld', feld: 'status', op: 'einerVon', wert: { art: 'fest', wert: ['erledigt'] } }, nicht: true }] } }, admin.id);
    await motor.ereignis(ereignis('mappe.geaendert', { mappe: m.id, typ: vertrag.id, felder: ['name'] }));
    assert.equal((await motor.laeufe(a.id)).length, 0, 'anderes Feld');
    const e = ereignis('mappe.geaendert', { mappe: m.id, typ: vertrag.id, felder: ['status'] });
    await motor.ereignis(e);
    await motor.ereignis(e);
    const [l] = await motor.laeufe(a.id);
    assert.equal((await motor.laeufe(a.id)).length, 1, 'dasselbe Ereignis zweimal = ein Lauf');
    assert.equal(l.zustand, 'abgeschlossen');
    assert.deepEqual(l.schritte.map((s) => `${s.teil}:${s.zustand}`), ['wenn:ok', 'und:ok', 'dann:ok']);
    await d.mappen.aendereMappe(m.id, { werte: { status: 'erledigt' } }, admin.id);
    await motor.ereignis(ereignis('mappe.geaendert', { mappe: m.id, typ: vertrag.id, felder: ['status'] }));
    assert.equal((await motor.laeufe(a.id))[0].zustand, 'unzutreffend', '„ist nicht erledigt“ trifft nicht mehr zu');
  });

  it('Reihenfolge nach Nummer, „Danach keine weiteren …“ nur für dieses Ereignis; Selbstauslösung und Kette', async () => {
    const { motor, vertrag, admin, d, ereignis } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    const wenn = { art: 'mappe.angelegt', typ: vertrag.id };
    const spaet = await motor.lege({ name: 'B spät', aktiv: true, reihenfolge: 60, wenn, dann: [stopp] }, admin.id);
    const frueh = await motor.lege({ name: 'A früh', aktiv: true, reihenfolge: 20, wenn, dann: [stopp] }, admin.id);
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: m.id, typ: vertrag.id }));
    assert.equal((await motor.laeufe(frueh.id))[0].zustand, 'abgeschlossen');
    const [l] = await motor.laeufe(spaet.id);
    assert.equal(l.zustand, 'uebersprungen');
    assert.match(l.schritte[0].text!, /Übersprungen durch „A früh“/);
    // Eine eigene Änderung löst sie nicht noch einmal aus; zu tiefe Ketten laufen nicht.
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: m.id, typ: vertrag.id }, { art: 'automatisierung', id: frueh.id, kette: 1 }));
    assert.equal((await motor.laeufe(frueh.id)).length, 1);
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: m.id, typ: vertrag.id }, { art: 'automatisierung', id: 'andere', kette: 3 }));
    assert.match((await motor.laeufe(frueh.id))[0].schritte[0].text!, /höchstens 3-mal/);
  });

  it('Bremse hält an; Einschalten hebt sie auf', async () => {
    const { motor, vertrag, admin, d, ereignis, repo } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    const a = await motor.lege({ name: 'Viel', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id }, dann: [stopp] }, admin.id);
    for (let i = 0; i < 31; i++) await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    assert.equal((await repo.hole(a.id))!.angehalten?.grund, 'bremse');
    assert.equal((await motor.warnungen()).angehalten.length, 1);
    await motor.schalte(a.id, true, admin.id);
    assert.equal((await repo.hole(a.id))!.angehalten, null);
  });

  it('fehlendes Feld: rot und angehalten statt blockieren; Wiederherstellung hält an; Trockenlauf', async () => {
    const { motor, vertrag, admin, d, ereignis, repo } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    const a = await motor.lege({ name: 'Feld', aktiv: true, wenn: { art: 'mappe.geaendert', typ: vertrag.id, felder: ['status'] }, dann: [stopp] }, admin.id);
    const trocken = await motor.wiedergeben(a.id, m.id, true);
    assert.equal(trocken.test, true);
    assert.equal(trocken.zustand, 'abgeschlossen');
    // Das Feld verschwindet – das DMS lässt das zu, die Automatisierung wird angehalten.
    await d.mappentypen.aendereTyp(vertrag.id, { ...vertrag, felder: vertrag.felder.filter((f) => f.key !== 'status') });
    await motor.ereignis(ereignis('mappe.geaendert', { mappe: m.id, typ: vertrag.id, felder: ['status'] }));
    const x = await repo.hole(a.id);
    assert.equal(x!.angehalten?.grund, 'fehlerhaft');
    assert.equal((await motor.laeufe(a.id))[0].zustand, 'fehlgeschlagen');
    assert.equal((await motor.uebersicht()).fehlgeschlagen, 1);
    const b = await motor.lege({ name: 'Wieder', aktiv: true, wenn: { art: 'mappe.angelegt' }, dann: [stopp] }, admin.id);
    assert.equal(await motor.nachWiederherstellung(), 1);
    assert.equal((await repo.hole(b.id))!.angehalten?.grund, 'wiederherstellung');
  });

  it('Datum in N Tagen: genau einmal je Mappe und Tag, verpasste Tage nachgeholt, erst ab der Uhrzeit', async () => {
    let jetzt = new Date(`${heuteIn()}T05:00:00Z`).getTime(); // 06:00 bzw. 07:00 in Berlin
    const { motor, vertrag, admin, d, repo } = await aufbau(() => jetzt);
    const heute = heuteIn(new Date(jetzt));
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendbar_bis: verschiebe(heute, 7) } }, admin.id);
    const n = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas', kuendbar_bis: verschiebe(heute, 9) } }, admin.id);
    const a = await motor.lege({ name: 'Kündigung', aktiv: true, wenn: { art: 'datum', typ: vertrag.id, feld: 'kuendbar_bis', tage: 7, uhrzeit: '08:00' }, dann: [stopp] }, admin.id);
    await motor.zeitplan();
    assert.equal((await motor.laeufe(a.id)).length, 0, 'vor 8 Uhr nichts');
    jetzt += 4 * 3_600_000;
    await motor.zeitplan();
    await motor.zeitplan();
    const l = await motor.laeufe(a.id);
    assert.deepEqual(l.map((x) => x.mappeId), [m.id], 'heute: nur Strom, genau einmal');
    // Zwei Tage aus: beim Start beide Tage nachgeholt.
    jetzt += 2 * 86_400_000;
    await motor.zeitplan();
    const ids = (await motor.laeufe(a.id)).map((x) => x.mappeId);
    assert.deepEqual(ids.filter((x) => x === n.id).length, 1, 'Gas (übermorgen + 7) nachgeholt');
    assert.equal((await repo.hole(a.id))!.letzterTag, heuteIn(new Date(jetzt)));
  });

  it('Platzhalter wie beim Titel, Passwörter nie, Testlauf nur mit passender Mappe', async () => {
    const { motor, vertrag, admin, d } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendbar_bis: '2031-09-30' } }, admin.id);
    const a = await motor.lege({ name: 'P', wenn: { art: 'mappe.angelegt', typ: vertrag.id }, dann: [stopp] }, admin.id);
    const z = await d.postSystemmappen.systemZugriff('automatisierung');
    const mappe = await d.rechtepruefung.pruefeRecht(z, m.id, 'R');
    const text = await motor.fuelle('{name} kündbar bis {kuendbar_bis} ({mappentyp}, {automatisierung}) {unbekannt}', { a, mappe, typ: vertrag, z, daten: {} });
    assert.equal(text, 'Strom kündbar bis 30.09.2031 (Vertrag, P) {unbekannt}');
    const fremd = await d.mappentypen.legeTypAn({ name: 'Zettel', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    const zettel = await d.mappen.legeMappeAn({ typId: fremd.id, werte: { name: 'x' } }, admin.id);
    await assert.rejects(motor.wiedergeben(a.id, zettel.id, true), /vom Typ „Vertrag“/);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe('Automatisierungen in PostgreSQL (#674)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let haupt: any; let sql: any;
  const db = `dms_auto_${process.pid}`;
  const HAUSHALT = '00000000-0000-4000-8000-000000000001';
  const A = '00000000-0000-4000-8000-0000000000e1';
  const E = '00000000-0000-4000-8000-0000000000e2';
  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  });
  after(async () => { await sql?.end(); await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`); await haupt?.end(); });

  it('Fassungen mit Versionsschutz, genau ein Lauf je Ereignis (auch zwei Server), Zustand, Aufräumen', async () => {
    const repo = pgAutomatisierungRepo(sql, HAUSHALT);
    const jetzt = new Date().toISOString();
    const a: Automatisierung = { ...bereinigeAutomatisierung({ name: 'Test', wenn: { art: 'mappe.angelegt' }, dann: [{ id: 's', art: 'stopp' }] }), id: A, aktiv: true, angehalten: null, herkunft: 'eigen', version: 1, erstellt: jetzt, erstelltVon: null, geaendert: jetzt, geaendertVon: null };
    await repo.lege(a);
    assert.equal(await repo.speichere(A, { ...a, name: 'Zwei' }, null, 1), true);
    assert.equal(await repo.speichere(A, { ...a, name: 'Alt' }, null, 1), false, 'veralteter Stand');
    assert.deepEqual((await repo.fassungen(A)).map((f) => f.daten.name), ['Zwei', 'Test']);
    await repo.setze(A, { letzterTag: '2026-11-03', angehalten: { grund: 'bremse', text: 'x', zeit: jetzt } });
    const x = await repo.hole(A);
    assert.equal(x!.letzterTag, '2026-11-03');
    assert.equal(x!.angehalten?.grund, 'bremse');
    assert.equal(x!.version, 2);
    const lauf = (id: string) => ({ id, automatisierungId: A, ereignisId: E, art: 'mappe.angelegt', daten: {}, mappeId: null, zustand: 'laeuft' as const, trocken: false, test: false, schritte: [], fehler: null, gestartet: jetzt, beendet: null });
    const r = await Promise.all([repo.beginne(lauf(crypto.randomUUID())), pgAutomatisierungRepo(sql, HAUSHALT).beginne(lauf(crypto.randomUUID()))]);
    assert.deepEqual(r.sort(), [false, true]);
    const [l] = await repo.laeufe(A, 10);
    await repo.aktualisiere(l.id, { zustand: 'fehlgeschlagen', fehler: 'kaputt', schritte: [{ teil: 'wenn', zustand: 'ok' }] });
    assert.equal((await repo.fehlgeschlagene()).length, 1);
    assert.equal((await repo.letzte()).get(A)!.fehler, 'kaputt');
    // Nicht wiederholen (#707): bleibt fehlgeschlagen, aber nicht mehr im Hinweis; ein Probelauf zählt nie.
    const B = '00000000-0000-4000-8000-0000000000b1';
    assert.equal(await repo.nichtWiederholen([l.id, 'kein-uuid'], B), 1);
    assert.equal(await repo.nichtWiederholen([l.id], B), 0, 'nur einmal');
    assert.equal((await repo.fehlgeschlagene()).length, 0);
    const n = (await repo.lauf(l.id))!;
    assert.equal(n.zustand, 'fehlgeschlagen');
    assert.equal(n.nichtWiederholt?.von, B);
    await repo.beginne({ ...lauf(crypto.randomUUID()), ereignisId: crypto.randomUUID(), zustand: 'fehlgeschlagen', test: true, trocken: true });
    assert.equal((await repo.fehlgeschlagene()).length, 0, 'Probelauf zählt nicht');
    assert.equal(await repo.zaehleSeit(A, new Date(Date.now() - 60_000).toISOString()), 1);
    assert.equal(await repo.raeumeAuf(30, 0, 10), 2);
    await repo.loesche(A);
    assert.equal((await repo.liste()).length, 0);
  });
});

describe('Automatisierungen: Ausprobieren und Rechte des Kontos (#709)', () => {
  it('nur Mappen, die die Automatisierung sehen darf; Meldung nennt das Konto; Warnung, wenn der Typ gar nicht lesbar ist', async () => {
    const { motor, vertrag, admin, d } = await aufbau();
    const rolle = (await d.postSystemmappen.listeRollen(true)).find((r) => r.konto && r.name === 'Systemkonto')!.id;
    const strom = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', status: 'offen' } }, admin.id);
    const geheim = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Geheim', status: 'erledigt' } }, admin.id);
    const a = await motor.lege({ name: 'Probe', wenn: { art: 'mappe.notiz', typ: vertrag.id }, dann: [stopp] }, admin.id);
    // Erledigte Verträge sind für das Systemkonto verboten.
    await d.berechtigungen.setzeBerechtigungen(vertrag.id, { grund: { C: true, R: true, U: true, D: true, P: false }, regeln: [{ id: 'r', name: 'Erledigte nicht', wenn: [{ art: 'rolle', rollen: [rolle] }, { art: 'feld', bedingung: { art: 'feld', feld: 'status', op: 'einerVon', wert: { art: 'fest', wert: ['erledigt'] } } }], dann: { R: 'entziehen' }, stopp: true }] } as never, true);
    const vorschlaege = await motor.testmappen(a.id, '');
    assert.deepEqual(vorschlaege.mappen.map((m) => m.titel), ['Strom'], 'nur lesbare Mappen vom Typ der Wenn-Karte');
    await assert.rejects(motor.wiedergeben(a.id, geheim.id, true), /Die Automatisierung darf diese Mappe nicht sehen \(Rechte am Mappentyp „Vertrag“\)/);
    assert.equal((await motor.wiedergeben(a.id, strom.id, true)).zustand, 'abgeschlossen');
    assert.equal((await motor.hole(a.id)).rechte, undefined, 'teilweise lesbar: keine Warnung');
    // Ganz verboten: Hinweis an der Automatisierung (Liste und Editor), Speichern bleibt erlaubt.
    await d.berechtigungen.setzeBerechtigungen(vertrag.id, { grund: { C: true, R: true, U: true, D: true, P: false }, regeln: [{ id: 'r', name: 'Nie', wenn: [{ art: 'rolle', rollen: [rolle] }], dann: { C: 'entziehen', R: 'entziehen', U: 'entziehen', D: 'entziehen', P: 'entziehen' }, stopp: true }] } as never, true);
    const x = await motor.hole(a.id);
    assert.match(x.rechte?.text ?? '', /kann nicht laufen: Das Konto „Automatisierung“ darf Mappen vom Typ „Vertrag“ nicht sehen/);
    assert.equal(x.rechte?.typId, vertrag.id);
    assert.ok(x.rechte?.kontoId, 'mit Konto für den Testlauf (#710)');
    assert.ok((await motor.uebersicht()).automatisierungen.find((y) => y.id === a.id)?.rechte);
    assert.equal((await motor.testmappen(a.id, '')).mappen.length, 0);
    await motor.aendere(a.id, { name: 'Probe 2', wenn: { art: 'mappe.notiz', typ: vertrag.id }, dann: [stopp] }, admin.id);
  });
});

describe('Automatisierungen: fehlgeschlagene Läufe nicht wiederholen (#707)', () => {
  it('Hinweis nennt Automatisierung und Zeit, „nicht wiederholen“ vermerkt Person und Zeit, Probeläufe zählen nicht', async () => {
    const { motor, vertrag, admin, d, repo } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    const a = await motor.lege({ name: 'Kaputt', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id }, dann: [stopp] }, admin.id);
    const jetzt = new Date().toISOString();
    const lauf = (test: boolean) => ({ id: crypto.randomUUID(), automatisierungId: a.id, ereignisId: crypto.randomUUID(), art: 'mappe.notiz', daten: { mappe: m.id, typ: vertrag.id }, mappeId: m.id, zustand: 'fehlgeschlagen' as const, trocken: test, test, schritte: [], fehler: 'kaputt', gestartet: jetzt, beendet: jetzt });
    const echt = lauf(false); const probe = lauf(true);
    await repo.beginne(echt); await repo.beginne(probe);
    let u = await motor.uebersicht();
    assert.equal(u.fehlgeschlagen, 1, 'Probelauf zählt nicht mit');
    assert.deepEqual(u.fehlschlaege.map((f) => [f.id, f.name]), [[echt.id, 'Kaputt']]);
    await motor.nichtWiederholen({ laufId: echt.id }, admin.id);
    u = await motor.uebersicht();
    assert.equal(u.fehlgeschlagen, 0);
    const x = await motor.lauf(echt.id);
    assert.equal(x.zustand, 'fehlgeschlagen', 'bleibt im Verlauf');
    assert.equal(x.nichtWiederholt?.von, admin.id);
    assert.deepEqual(await motor.wiederholeAlle(), { wiederholt: 0 });
    // Ein Probelauf wiederholt bleibt ein Probelauf.
    const w = await motor.wiederhole(probe.id);
    assert.equal(w.trocken, true);
    // Alle auf einmal.
    await repo.beginne(lauf(false)); await repo.beginne(lauf(false));
    assert.deepEqual(await motor.nichtWiederholen({}, admin.id), { anzahl: 2 });
    assert.equal((await motor.uebersicht()).fehlgeschlagen, 0);
  });
});
