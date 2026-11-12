/**
 * Automatisierungen, Stufe 2 (#677): Sonst-Zweig im Motor, Werkbank-Karten (Fehler gemeldet, Protokollmeldung, neue
 * Version, Sicherung anstoßen) und die festen Werkbank-Rechte des Systemkontos – je „darf nicht“ ein Test. Personen und
 * Texte sind erfunden; der Kern läuft im Arbeitsspeicher.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  automatisierungsProbleme, bereinigeAutomatisierung, DANN_ARTEN, kurzform, platzhalterFuer, PROTOKOLL_TEXT_MAX, protokollPasst, SYSTEMKONTO_WERKBANK, WENN_EREIGNISSE, werkbankBereiche,
  type WennKarte,
} from '../../shared/src/automatisierung';
import { EREIGNISKATALOG, PAKET_KATALOG, type KatalogEreignis } from '../../shared/src/ereignisse';
import { darfBereich, darfVerwalten } from '../../shared/src/verwaltungsrecht';
import { BEREICHE } from '../../shared/src/werkbankansicht';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { Betriebsmelder, systemWerkbank, type SystemWerkbank, type SystemWerkbankQuellen } from '../src/automatisierung-werkbank';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Fehlermeldungen, speicherFehlerRepo } from '../src/fehlermeldungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { liesPaket, liesZip } from '../src/pakete';
import { Protokoll, type Eintrag } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { neueStabileVersion } from '../src/system';
import { zipPuffer } from '../src/zip';

/** Sicherung zum Zuschauen: zählt Starts, kann „läuft“, „kein Platz“ oder „Wiederherstellung“. */
function testSicherung(o: { laeuft?: boolean; fehler?: string } = {}) {
  const s = { starts: [] as Array<{ art: string; von: string }>, laeuft: o.laeuft ?? false };
  const sicherung: SystemWerkbankQuellen['sicherung'] = {
    laeuft: () => s.laeuft,
    starte: async (art, von) => {
      if (o.fehler) throw new Fachfehler(507, o.fehler);
      s.starts.push({ art, von });
      return { lauf: {} as never, fertig: Promise.resolve(null) };
    },
  };
  return { s, sicherung };
}

async function aufbau(o: { version?: string | null; sicherung?: ReturnType<typeof testSicherung>; uhr?: () => number; verteiler?: boolean } = {}) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, markus.id);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'status', label: 'Status', typ: 'auswahl', optionen: ['offen', 'erledigt'] },
    { key: 'bemerkung', label: 'Bemerkung', typ: 'text' },
  ] });
  const fehlermeldungen = new Fehlermeldungen(speicherFehlerRepo(), speicherDateien());
  const sich = o.sicherung ?? testSicherung();
  const protokoll = new Protokoll('info', () => {});
  const werkbank = systemWerkbank({ sicherung: sich.sicherung, fehlermeldungen, version: async () => (o.version === undefined ? null : o.version), protokoll });
  const repo = speicherAutomatisierungRepo(o.uhr);
  const motor = new Automatisierungen({ dienst: d, repo, werkbank, uhr: o.uhr });
  // Wie in ablago.ts: Eingang einer Fehlermeldung → Ereignis „Fehler gemeldet“.
  fehlermeldungen.beimMelden = (m) => d.kern.ereignis('fehler.gemeldet', { fehlermeldung: m.id, benutzer: m.benutzerId, zeitpunkt: m.erstellt }, m.benutzerId);
  // Mit `verteiler` gibt der Verteiler den Ausgangskorb an den Motor (wie motor.start()) – und an den Test, der mitliest.
  // Ohne ruft der Test motor.ereignis selbst (sonst liefe „Mappe angelegt“ aus dem Aufbau nebenher mit).
  const gesehen: KatalogEreignis[] = [];
  d.ereignisse.abonniere('test', async (e) => { gesehen.push(e); });
  if (o.verteiler) d.ereignisse.abonniere('automatisierungen', (e) => motor.ereignis(e));
  /** Alles verteilen; liefert die Ereignisse seit dem letzten Aufruf. */
  const verteile = async () => { await d.ereignisse.verteile(); return gesehen.splice(0); };
  const aufgabenVon = async (id: string) => (await d.ohneLeserecht.alleAufgaben()).filter((x) => x.empfaengerId === id);
  return { d, konten, markus, jonas, vertrag, motor, repo, werkbank, fehlermeldungen, sich, protokoll, verteile, aufgabenVon };
}

const ereignis = (art: string, daten: Record<string, unknown>, ausloeser: KatalogEreignis['ausloeser'] = { art: 'system' }): KatalogEreignis =>
  ({ id: crypto.randomUUID(), art: art as KatalogEreignis['art'], daten, ausloeser, erstellt: new Date().toISOString() });
const leereWelt = { typen: [], sichten: [], benutzer: [{ id: 'p1', name: 'Markus' }], rollen: [{ id: 'r1', name: 'Administrator' }] };

describe('Sonst-Zweig (#677)', () => {
  it('Bedingung trifft nicht zu: Sonst-Karten laufen, Dann ist übersprungen; trifft sie zu, umgekehrt; ohne Sonst „trifft nicht zu“', async () => {
    const { d, markus, vertrag, motor } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', status: 'offen' } }, markus.id);
    const a = await motor.lege({ name: 'Status prüfen', aktiv: true, wenn: { art: 'mappe.geaendert', typ: vertrag.id },
      und: { modus: 'alle', karten: [{ art: 'bedingung', bedingung: { art: 'feld', feld: 'status', op: 'einerVon', wert: { art: 'fest', wert: ['erledigt'] } } }] },
      dann: [{ id: 'd1', art: 'feld', werte: { bemerkung: 'fertig' } }], sonst: [{ id: 's1', art: 'feld', werte: { bemerkung: 'noch offen: {name}' } }] }, markus.id);
    assert.deepEqual(a.sonst.map((k) => k.id), ['s1']);
    assert.match(a.kurz, /→ Bemerkung setzen; sonst Bemerkung setzen$/);
    await motor.ereignis(ereignis('mappe.geaendert', { mappe: m.id, typ: vertrag.id, felder: ['status'] }, { art: 'benutzer', id: markus.id, konto: markus.id }));
    let [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    assert.deepEqual(l.schritte.map((s) => `${s.teil}:${s.zustand}`), ['wenn:ok', 'und:nein', 'dann:uebersprungen', 'sonst:ok']);
    assert.equal((await d.mappen.holeMappe(m.id)).mappe.werte.bemerkung, 'noch offen: Strom');
    // Trifft zu: nur Dann.
    await d.mappen.aendereMappe(m.id, { werte: { status: 'erledigt' } }, markus.id);
    await motor.ereignis(ereignis('mappe.geaendert', { mappe: m.id, typ: vertrag.id, felder: ['status'] }, { art: 'benutzer', id: markus.id, konto: markus.id }));
    [l] = await motor.laeufe(a.id);
    assert.deepEqual(l.schritte.map((s) => `${s.teil}:${s.zustand}`), ['wenn:ok', 'und:ok', 'dann:ok', 'sonst:uebersprungen']);
    assert.equal((await d.mappen.holeMappe(m.id)).mappe.werte.bemerkung, 'fertig');
    // Ohne Sonst-Karten wie bisher.
    const ohne = await motor.lege({ name: 'Ohne Sonst', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id },
      und: { modus: 'alle', karten: [{ art: 'bedingung', bedingung: { art: 'feld', feld: 'status', op: 'einerVon', wert: { art: 'fest', wert: ['offen'] } } }] }, dann: [{ id: 's', art: 'stopp' }] }, markus.id);
    await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    assert.equal((await motor.laeufe(ohne.id))[0].zustand, 'unzutreffend');
  });

  it('„Danach keine weiteren …“ im Sonst-Zweig beendet die Reihe; Probelauf zeigt Sonst; Fehler in Sonst ist ein Fehlschlag', async () => {
    const { d, markus, vertrag, motor } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas', status: 'offen' } }, markus.id);
    const nie = { modus: 'alle' as const, karten: [{ art: 'bedingung', bedingung: { art: 'feld', feld: 'status', op: 'einerVon', wert: { art: 'fest', wert: ['erledigt'] } } }] };
    const wenn = { art: 'mappe.notiz', typ: vertrag.id };
    const frueh = await motor.lege({ name: 'A', aktiv: true, reihenfolge: 10, wenn, und: nie, dann: [{ id: 'x', art: 'feld', werte: { bemerkung: 'a' } }], sonst: [{ id: 'st', art: 'stopp' }] }, markus.id);
    const spaet = await motor.lege({ name: 'B', aktiv: true, reihenfolge: 20, wenn, dann: [{ id: 'y', art: 'feld', werte: { bemerkung: 'b' } }] }, markus.id);
    await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    assert.equal((await motor.laeufe(frueh.id))[0].zustand, 'abgeschlossen');
    assert.equal((await motor.laeufe(spaet.id))[0].zustand, 'uebersprungen', 'Stopp aus dem Sonst-Zweig gilt');
    const probe = await motor.wiedergeben(frueh.id, m.id, true);
    assert.deepEqual(probe.schritte.map((s) => `${s.teil}:${s.zustand}`), ['wenn:ok', 'und:nein', 'dann:uebersprungen', 'sonst:ok']);
    // Ein Fehler im Sonst-Zweig: fehlgeschlagen, die übrigen Sonst-Karten übersprungen.
    const kaputt = await motor.lege({ name: 'C', aktiv: true, reihenfolge: 5, wenn: { art: 'mappe.notiz', typ: vertrag.id }, und: nie, dann: [{ id: 'z', art: 'stopp' }],
      sonst: [{ id: 'f', art: 'feld', werte: { name: '' } }, { id: 'g', art: 'stopp' }] }, markus.id);
    await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    const [l] = await motor.laeufe(kaputt.id);
    assert.equal(l.zustand, 'fehlgeschlagen');
    assert.deepEqual(l.schritte.map((s) => `${s.teil}:${s.zustand}`), ['wenn:ok', 'und:nein', 'dann:uebersprungen', 'sonst:fehler', 'sonst:uebersprungen']);
  });
});

describe('Werkbank-Karten (#677): Modell', () => {
  it('Wenn-Karten: Fehler, Protokoll, Version – nicht „Sicherung fertig“; nur für Automatisierungen, nie für Pakete', () => {
    for (const a of ['fehler.gemeldet', 'protokoll.meldung', 'version.neu'] as const) {
      assert.ok((WENN_EREIGNISSE as string[]).includes(a), a);
      assert.equal(EREIGNISKATALOG[a].gruppe, 'betrieb');
      assert.ok(!(PAKET_KATALOG as string[]).includes(a), `${a} nie an Pakete`);
    }
    assert.ok(!(WENN_EREIGNISSE as string[]).includes('sicherung.fertig'), 'Erfolg einer Sicherung sieht das Systemkonto nicht');
    assert.ok(DANN_ARTEN.includes('sicherung'));
  });

  it('bereinigt Wenn-Karten aus dem Betrieb, prüft Bedingungen und Empfänger ohne Mappe, Platzhalter, Kurzform', () => {
    const p = bereinigeAutomatisierung({ name: 'Mail kaputt', wenn: { art: 'protokoll.meldung', stufe: 'warn', modul: 'mail', enthaelt: '  SMTP  ', typ: 'x' }, dann: [{ id: 's', art: 'sicherung', ziel: '/tmp' }] });
    assert.deepEqual(p.wenn, { art: 'protokoll.meldung', stufe: 'warn', modul: 'mail', enthaelt: 'SMTP' });
    assert.deepEqual(p.dann, [{ id: 's', art: 'sicherung' }]);
    assert.deepEqual(bereinigeAutomatisierung({ wenn: { art: 'protokoll.meldung', stufe: 'debug', modul: 'gibtsnicht' } }).wenn, { art: 'protokoll.meldung', stufe: 'error', modul: null, enthaelt: null });
    assert.deepEqual(bereinigeAutomatisierung({ wenn: { art: 'fehler.gemeldet', typ: 'vertrag' } }).wenn, { art: 'fehler.gemeldet' });
    assert.equal(kurzform(p, leereWelt, (a) => (a === 'protokoll.meldung' ? 'Protokollmeldung' : a)), 'Wenn Protokollmeldung ab Warnung (mail, „SMTP“) → Sicherung anstoßen');
    assert.deepEqual(automatisierungsProbleme(p, leereWelt), []);
    const ohneMappe = bereinigeAutomatisierung({ name: 'x', wenn: { art: 'fehler.gemeldet' },
      und: { karten: [{ art: 'bedingung', bedingung: { art: 'feld', feld: 'status', op: 'nichtLeer' } }] },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Bitte ansehen' }] });
    const probleme = automatisierungsProbleme(ohneMappe, leereWelt);
    assert.ok(probleme.some((x) => /nur ein Merkmal/.test(x)), probleme.join(' | '));
    assert.ok(probleme.some((x) => /nur Personen und Rollen/.test(x)), probleme.join(' | '));
    const merkmal = bereinigeAutomatisierung({ ...ohneMappe, und: { karten: [{ art: 'bedingung', bedingung: { art: 'merkmal', merkmal: 'beruflich' } }] }, dann: [{ art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'rolle', id: 'r1' }], text: '{meldung}' }] });
    assert.deepEqual(automatisierungsProbleme(merkmal, leereWelt), []);
    assert.deepEqual(platzhalterFuer({ art: 'fehler.gemeldet' }, null).map((x) => x.key), ['heute', 'automatisierung', 'zeitpunkt', 'meldung', 'gemeldet_von']);
    assert.deepEqual(platzhalterFuer({ art: 'version.neu' }, null).map((x) => x.key), ['heute', 'automatisierung', 'version', 'installiert']);
    assert.deepEqual(werkbankBereiche(p), ['protokoll', 'sicherung']);
  });

  it('Protokollmeldung passt nach Stufe ab, Modul und Text (ohne Groß/klein)', () => {
    const w = { art: 'protokoll.meldung' as const, stufe: 'warn' as const, modul: 'mail', enthaelt: 'smtp' };
    assert.equal(protokollPasst(w, { stufe: 'error', modul: 'mail', text: 'SMTP-Server antwortet nicht' }), true);
    assert.equal(protokollPasst(w, { stufe: 'warn', modul: 'mail', text: 'IMAP' }), false, 'Text fehlt');
    assert.equal(protokollPasst(w, { stufe: 'warn', modul: 'sicherung', text: 'smtp' }), false, 'anderes Modul');
    assert.equal(protokollPasst({ ...w, stufe: 'error' }, { stufe: 'warn', modul: 'mail', text: 'smtp' }), false, 'nur ab Fehler');
    assert.equal(protokollPasst({ art: 'protokoll.meldung', stufe: 'warn' }, { stufe: 'info', modul: 'mail', text: 'x' }), false, 'Hinweise nie');
  });
});

describe('Werkbank-Rechte des Systemkontos (#677): genau die Tabelle', () => {
  it('nur die vier Handlungen der Liste, eingefroren', () => {
    const w = systemWerkbank({ sicherung: testSicherung().sicherung, fehlermeldungen: new Fehlermeldungen(speicherFehlerRepo(), speicherDateien()) });
    assert.deepEqual(Object.keys(w).sort(), Object.keys(SYSTEMKONTO_WERKBANK).sort());
    assert.deepEqual(Object.keys(SYSTEMKONTO_WERKBANK).sort(), ['fehlermeldung', 'neueVersion', 'protokoll', 'sicherungAnstossen']);
    assert.ok(Object.isFrozen(w));
    assert.throws(() => { (w as unknown as Record<string, unknown>).wiederherstellen = () => null; });
  });

  it('Benutzer: nichts in der Werkbank – das Systemkonto darf keinen Bereich verwalten', async () => {
    const { konten } = await aufbau();
    const konto = await konten.systemkonto('automatisierung');
    assert.equal(darfVerwalten(konto), false);
    for (const b of BEREICHE) assert.equal(darfBereich(konto, b.pfad), false, b.pfad);
  });

  it('Wiederherstellen, Volltext, Papierkorb, Benutzer: keine Karte und keine Handlung', () => {
    const verboten = /wiederherst|volltext|papierkorb|benutzer|rechte|notfall|loesch|leeren/i;
    for (const a of DANN_ARTEN) assert.doesNotMatch(a, verboten, a);
    for (const k of Object.keys(SYSTEMKONTO_WERKBANK)) assert.doesNotMatch(k, verboten, k);
  });

  it('Sicherung: nur „angestoßen“ / „läuft schon“ – Erfolg, Größe, Speicherplatz, Ort und Notfallblatt bleiben verborgen', async () => {
    const sich = testSicherung();
    const w = systemWerkbank({ sicherung: sich.sicherung, fehlermeldungen: new Fehlermeldungen(speicherFehlerRepo(), speicherDateien()) });
    assert.equal(await w.sicherungAnstossen('Automatisierung „Nachts“'), 'angestossen');
    assert.deepEqual(sich.s.starts, [{ art: 'automatisch', von: 'Automatisierung „Nachts“' }], 'wie die automatische Sicherung (Aufbewahrung)');
    sich.s.laeuft = true;
    assert.equal(await w.sicherungAnstossen('x'), 'laeuft');
    assert.equal(sich.s.starts.length, 1, 'keine zweite');
    // Kein Platz (oder Wiederherstellung, kein Schlüssel): Fehler ohne Einzelheiten.
    const voll = systemWerkbank({ sicherung: testSicherung({ fehler: 'Zu wenig freier Speicherplatz: 0,5 GB frei auf /backup' }).sicherung, fehlermeldungen: new Fehlermeldungen(speicherFehlerRepo(), speicherDateien()) });
    await assert.rejects(voll.sicherungAnstossen('x'), (e: Error) => /Werkbank → Sicherung/.test(e.message) && !/GB|backup|Speicherplatz/.test(e.message));
    assert.ok(!('notfallblatt' in w) && !('liste' in w) && !('plan' in w) && !('ort' in w));
  });

  it('Karte „Sicherung anstoßen“: Probelauf, angestoßen, läuft schon – im Verlauf nichts über Ergebnis oder Ort', async () => {
    const sich = testSicherung();
    const { d, markus, vertrag, motor } = await aufbau({ sicherung: sich });
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, markus.id);
    const a = await motor.lege({ name: 'Nach Vertrag sichern', aktiv: true, wenn: { art: 'mappe.angelegt', typ: vertrag.id }, dann: [{ id: 's', art: 'sicherung' }] }, markus.id);
    const probe = await motor.wiedergeben(a.id, m.id, true);
    assert.match(probe.schritte[2].text!, /Würde eine Sicherung anstoßen/);
    assert.equal(sich.s.starts.length, 0);
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: m.id, typ: vertrag.id }));
    let [l] = (await motor.laeufe(a.id)).filter((x) => !x.test);
    assert.equal(l.zustand, 'abgeschlossen');
    assert.equal(l.schritte[2].text, 'Sicherung angestoßen.');
    assert.deepEqual(sich.s.starts.map((x) => x.von), ['Automatisierung „Nach Vertrag sichern“']);
    sich.s.laeuft = true;
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: m.id, typ: vertrag.id }));
    [l] = (await motor.laeufe(a.id)).filter((x) => !x.test);
    assert.match(l.schritte[2].text!, /läuft schon/);
  });

  it('Einrichten nur mit dem Recht am Bereich; Bestehendes bleibt bearbeitbar; Kopieren prüft wie Anlegen', async () => {
    const { markus, motor } = await aufbau();
    const nurAutos = (b: string) => b === 'automatisierungen';
    const neu = { name: 'Nachts sichern', aktiv: false, wenn: { art: 'zeitplan', uhrzeit: '03:00', tage: [1, 2, 3, 4, 5, 6, 7] }, dann: [{ id: 's', art: 'sicherung' }] };
    await assert.rejects(motor.lege(neu, markus.id, 'eigen', nurAutos), (e: Fachfehler) => e.status === 403 && /„Sicherung“/.test(e.message));
    await assert.rejects(motor.lege({ ...neu, wenn: { art: 'fehler.gemeldet' }, dann: [{ id: 's', art: 'stopp' }] }, markus.id, 'eigen', nurAutos), (e: Fachfehler) => /„Gemeldete Fehler“/.test(e.message));
    await assert.rejects(motor.lege({ ...neu, wenn: { art: 'protokoll.meldung', stufe: 'error' }, dann: [{ id: 's', art: 'stopp' }] }, markus.id, 'eigen', nurAutos), (e: Fachfehler) => /„Protokoll“/.test(e.message));
    const a = await motor.lege(neu, markus.id, 'eigen', () => true);
    // Wer nur Automatisierungen darf, kann den Namen ändern – aber keine neue Werkbank-Karte dazunehmen.
    assert.equal((await motor.aendere(a.id, { name: 'Nachts sichern (neu)', version: a.version }, markus.id, nurAutos)).name, 'Nachts sichern (neu)');
    const b = await motor.hole(a.id);
    await assert.rejects(motor.aendere(a.id, { wenn: { art: 'version.neu' }, version: b.version }, markus.id, nurAutos), (e: Fachfehler) => e.status === 403);
    await assert.rejects(motor.kopiere(a.id, markus.id, nurAutos), (e: Fachfehler) => e.status === 403);
  });

  it('Wenn-Karte der Werkbank ändern braucht den Bereich – auch bei Bestehenden; Name, an/aus, Dann und Sonst bleiben offen (PR #1155)', async () => {
    const { markus, motor, d } = await aufbau();
    const nurAutos = (b: string) => b === 'automatisierungen';
    const a = await motor.lege({ name: 'Mail gestört', aktiv: false, wenn: { art: 'protokoll.meldung', stufe: 'error', modul: 'mail', enthaelt: 'SMTP' },
      dann: [{ id: 'a', art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'person', id: markus.id }], text: '{meldung}' }] }, markus.id, 'eigen', () => true);
    const wenn = (await motor.hole(a.id)).wenn;
    // Offen: Name, Beschreibung, Dann und Sonst, an/aus – und dieselbe Wenn-Karte unverändert mitgeschickt.
    let b = await motor.aendere(a.id, { name: 'Mail (neu)', wenn: { ...wenn }, sonst: [{ id: 's', art: 'stopp' }], version: a.version }, markus.id, nurAutos);
    assert.equal(b.name, 'Mail (neu)');
    assert.equal((await motor.schalte(a.id, true, markus.id)).aktiv, true);
    b = await motor.hole(a.id);
    // Gesperrt: Filter (Text, Modul, Stufe) und Art der Wenn-Karte – auch weg von der Werkbank.
    for (const w of [{ ...wenn, enthaelt: 'Passwort' }, { ...wenn, modul: 'sicherung' }, { ...wenn, stufe: 'warn' }, { art: 'fehler.gemeldet' }, { art: 'zeitplan', uhrzeit: '03:00', tage: [1] }]) {
      await assert.rejects(motor.aendere(a.id, { wenn: w, version: b.version }, markus.id, nurAutos), (e: Fachfehler) => e.status === 403 && /„Protokoll“|„Gemeldete Fehler“/.test(e.message), JSON.stringify(w));
    }
    // Wer das Protokoll verwaltet, darf den Filter ändern.
    const mitProtokoll = (x: string) => x === 'automatisierungen' || x === 'protokoll';
    // (als andere Person gespeichert, damit es eine eigene Fassung wird)
    await d.kern.mitFassungsKontext({ urheber: { art: 'person', id: 'katrin' } }, () => motor.aendere(a.id, { wenn: { ...wenn, enthaelt: 'TLS' }, version: b.version }, markus.id, mitProtokoll));
    // Auch eine Fassung (#1006), die die Wenn-Karte ändert, stellt nur her, wer den Bereich verwaltet.
    const liste = await d.fassungen.liste('automatisierung', a.id);
    const alte = liste.fassungen.at(-1)!.nr;
    await assert.rejects(d.fassungen.stelleWiederHer('automatisierung', a.id, alte, { stand: liste.stand }, { id: markus.id, email: null, darf: nurAutos }), (e: Fachfehler) => e.status === 403);
    await d.fassungen.stelleWiederHer('automatisierung', a.id, alte, { stand: liste.stand }, { id: markus.id, email: null, darf: mitProtokoll });
    const w2 = (await motor.hole(a.id)).wenn;
    assert.equal(w2.art === 'protokoll.meldung' ? w2.enthaelt : null, 'SMTP');
  });

  it('Verlauf: Text der Protokollmeldung und Konto der Fehlermeldung nur mit dem Bereich (zwei Admins, PR #1155)', async () => {
    const { markus, jonas, konten, motor, fehlermeldungen, verteile } = await aufbau({ verteiler: true });
    const { benutzer: petra } = await konten.legeBenutzerAn({ email: 'petra@example.org', name: 'Petra', verwaltung: ['automatisierungen'] }, markus.id);
    const alsMarkus = (b: string) => darfBereich(markus, b);
    const alsPetra = (b: string) => darfBereich(petra, b);
    assert.ok(alsMarkus('protokoll') && alsMarkus('fehlermeldungen') && alsPetra('automatisierungen') && !alsPetra('protokoll') && !alsPetra('fehlermeldungen'));
    const stopp = [{ id: 's', art: 'stopp' }];
    const p = await motor.lege({ name: 'Protokoll', aktiv: true, wenn: { art: 'protokoll.meldung', stufe: 'warn' }, dann: stopp }, markus.id);
    const f = await motor.lege({ name: 'Fehler', aktiv: true, wenn: { art: 'fehler.gemeldet' }, dann: stopp }, markus.id);
    await motor.ereignis(ereignis('protokoll.meldung', { stufe: 'error', modul: 'mail', text: 'Anmeldung bei mail.example.org abgelehnt', zeitpunkt: new Date().toISOString() }));
    await fehlermeldungen.melde(jonas.id, { text: 'Die Vorschau bleibt leer.' });
    await verteile();
    const [lp] = await motor.laeufe(p.id, 50, alsPetra);
    const [lf] = await motor.laeufe(f.id, 50, alsPetra);
    assert.equal(lp.daten.text, undefined, 'kein Text ohne Protokoll');
    assert.equal(lp.daten.modul, 'mail');
    assert.equal(lf.daten.benutzer, undefined, 'kein Konto ohne Gemeldete Fehler');
    assert.ok(typeof lf.daten.fehlermeldung === 'string');
    assert.equal((await motor.lauf(lp.id, alsPetra)).daten.text, undefined);
    assert.equal((await motor.lauf(lf.id, alsPetra)).daten.benutzer, undefined);
    assert.ok(!JSON.stringify(await motor.laeufe(p.id, 50, alsPetra)).includes('mail.example.org'));
    assert.ok(!JSON.stringify(await motor.laeufe(f.id, 50, alsPetra)).includes(jonas.id));
    // Gesamtverwaltung sieht beides; gespeichert bleibt alles (Wiederholen).
    assert.equal((await motor.laeufe(p.id, 50, alsMarkus))[0].daten.text, 'Anmeldung bei mail.example.org abgelehnt');
    assert.equal((await motor.laeufe(f.id, 50, alsMarkus))[0].daten.benutzer, jonas.id);
    assert.equal((await motor.lauf(lf.id)).daten.benutzer, jonas.id);
  });

  it('Pakete bringen keine Werkbank-Karten mit', () => {
    const archiv = (autos: string) => zipPuffer([
      { name: 'manifest.yaml', daten: Buffer.from('schema: 1\nid: betrieb\nname: Betrieb\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\ninhalt:\n  automatisierungen: inhalt/automatisierungen.yaml\n') },
      { name: 'inhalt/automatisierungen.yaml', daten: Buffer.from(autos) },
    ], new Date('2026-01-01T12:00:00Z'));
    const fehlerVon = (autos: string) => { try { liesPaket(liesZip(archiv(autos))); return ''; } catch (e) { return [(e as Error).message, ...(((e as Fachfehler).details as { gruende?: string[] })?.gruende ?? [])].join(' | '); } };
    assert.match(fehlerVon('- schluessel: melden\n  name: Melden\n  wenn: { art: fehler.gemeldet }\n  dann:\n    - { art: stopp }\n'), /„fehler\.gemeldet“ gibt es nur in der Werkbank/);
    assert.match(fehlerVon('- schluessel: sichern\n  name: Sichern\n  wenn: { art: zeitplan, uhrzeit: "03:00" }\n  dann:\n    - { art: sicherung }\n'), /„Sicherung anstoßen“ gibt es nur in der Werkbank/);
  });
});

describe('Wenn-Karte „Fehler gemeldet“ (#677)', () => {
  it('Aufgabe an der Benutzer-Mappe des Empfängers; Text der Meldung nur für wer „Gemeldete Fehler“ verwaltet', async () => {
    const { markus, jonas, motor, fehlermeldungen, verteile, aufgabenVon } = await aufbau({ verteiler: true });
    const a = await motor.lege({ name: 'Fehler melden', aktiv: true, wenn: { art: 'fehler.gemeldet' },
      dann: [{ id: 'a', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'person', id: markus.id }, { art: 'person', id: jonas.id }], text: 'Fehler von {gemeldet_von}: {meldung}', faellig: 1 }] }, markus.id);
    await fehlermeldungen.melde(jonas.id, { text: 'Die Vorschau bleibt leer.' });
    const verteilt = (await verteile()).filter((e) => e.art === 'fehler.gemeldet');
    assert.equal(verteilt.length, 1);
    assert.deepEqual(Object.keys(verteilt[0].daten).sort(), ['benutzer', 'fehlermeldung', 'zeitpunkt'], 'nur Ids und Zeit im Ereignis');
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    assert.equal(l.mappeId, null, 'keine Mappe – auch nicht die der meldenden Person');
    const [fuerMarkus] = await aufgabenVon(markus.id);
    assert.equal(fuerMarkus.mappeId, markus.id, 'an seiner Benutzer-Mappe');
    assert.equal(fuerMarkus.text, 'Fehler von Jonas: Die Vorschau bleibt leer.');
    const [fuerJonas] = await aufgabenVon(jonas.id);
    assert.equal(fuerJonas.mappeId, jonas.id);
    assert.equal(fuerJonas.text, 'Fehler von (nicht sichtbar): (nicht sichtbar)', 'Jonas verwaltet keine gemeldeten Fehler');
  });

  it('Probelauf ohne Mappe mit einer Beispielmeldung', async () => {
    const { markus, motor } = await aufbau();
    const a = await motor.lege({ name: 'Fehler melden', aktiv: true, wenn: { art: 'fehler.gemeldet' },
      dann: [{ id: 'a', art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'person', id: markus.id }], text: '{meldung}' }] }, markus.id);
    const l = await motor.wiedergeben(a.id, undefined, true);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    assert.match(l.schritte[2].text!, /Beispiel: Beim Speichern/);
  });
});

describe('Wenn-Karte „Protokollmeldung“ (#677)', () => {
  it('nur passende Meldungen, nie die einer Automatisierung, höchstens eine je 15 Minuten', async () => {
    const zeit = { jetzt: Date.parse('2026-11-12T10:00:00Z') };
    const { markus, motor, repo, werkbank, protokoll, verteile, d, aufgabenVon } = await aufbau({ uhr: () => zeit.jetzt, verteiler: true });
    const a = await motor.lege({ name: 'Mail gestört', aktiv: true, wenn: { art: 'protokoll.meldung', stufe: 'error', modul: 'mail' },
      dann: [{ id: 'a', art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'person', id: markus.id }], text: '{stufe} in {modul}: {meldung}' }] }, markus.id);
    let inAuto = false;
    const melder = new Betriebsmelder({ werkbank, automatisierungen: () => repo.liste(), uhr: () => zeit.jetzt, inAutomatisierung: () => inAuto,
      ereignis: (m) => d.kern.ereignis('protokoll.meldung', { ...m }, null) });
    melder.start(60_000);
    try {
      protokoll.modul('mail').warn('Nur eine Warnung');
      protokoll.modul('sicherung').error('Anderes Modul');
      protokoll.modul('automatisierung').error('Aus einer Automatisierung');
      inAuto = true; protokoll.modul('mail').error('Im Lauf einer Automatisierung'); inAuto = false;
      assert.equal(await melder.sende(), 0);
      protokoll.modul('mail').error('Versand fehlgeschlagen', { passwort: 'geheim' });
      protokoll.modul('mail').error('Noch einmal fehlgeschlagen');
      assert.equal(await melder.sende(), 1, 'die zweite liegt in der Pause');
      const [e] = (await verteile()).filter((x) => x.art === 'protokoll.meldung');
      assert.deepEqual(Object.keys(e.daten).sort(), ['modul', 'stufe', 'text', 'zeitpunkt']);
      assert.equal(e.daten.text, 'Versand fehlgeschlagen');
      const [n] = await aufgabenVon(markus.id);
      assert.equal(n.text, 'Fehler in E-Mail: Versand fehlgeschlagen');
      // Ein zweiter Prozess meldet in der Pause: Der Motor lässt sie aus.
      await motor.ereignis(ereignis('protokoll.meldung', { stufe: 'error', modul: 'mail', text: 'Anderer Prozess', zeitpunkt: new Date(zeit.jetzt).toISOString() }));
      assert.equal((await motor.laeufe(a.id)).length, 1);
      zeit.jetzt += 16 * 60_000;
      protokoll.modul('mail').error('Nach der Pause');
      assert.equal(await melder.sende(), 1);
      await verteile();
      assert.equal((await motor.laeufe(a.id)).length, 2);
    } finally { melder.stop(); }
  });

  it('Text ohne Geheimnisse: verschlüsselte Werte und Passwort-Hashes werden zu „•••“, erst dann gekürzt (PR #1155)', async () => {
    const zeit = { jetzt: Date.parse('2026-11-12T10:00:00Z') };
    const { markus, motor, repo, werkbank } = await aufbau({ uhr: () => zeit.jetzt });
    await motor.lege({ name: 'Alles', aktiv: true, wenn: { art: 'protokoll.meldung', stufe: 'warn' }, dann: [{ id: 's', art: 'stopp' }] }, markus.id);
    const gesendet: string[] = [];
    const melder = new Betriebsmelder({ werkbank, automatisierungen: () => repo.liste(), inAutomatisierung: () => false, uhr: () => zeit.jetzt, ereignis: async (m) => { gesendet.push(m.text); } });
    const geheim = 'dms1$abcdefgh12345678:ijklmnop87654321';
    const hash = 'scrypt$16384$8$1$c2FsenNhbHo=$aGFzaGhhc2hoYXNo';
    const eintrag = (text: string) => ({ nr: 1, zeit: new Date(zeit.jetzt).toISOString(), stufe: 'error', modul: 'mail', text }) as Eintrag;
    melder.merke(eintrag(`Start abgebrochen: ${geheim} und ${hash}`));
    assert.equal(await melder.sende(), 1);
    // Am Ende der Grenze angeschnitten bliebe ein Teil des Geheimnisses stehen – deshalb erst bereinigen, dann kürzen.
    zeit.jetzt += 16 * 60_000;
    melder.merke(eintrag(`${'x'.repeat(PROTOKOLL_TEXT_MAX - 20)}${geheim}`));
    assert.equal(await melder.sende(), 1);
    assert.equal(gesendet[0], 'Start abgebrochen: ••• und •••');
    assert.equal(gesendet[1], `${'x'.repeat(PROTOKOLL_TEXT_MAX - 20)}•••`);
    for (const x of gesendet) assert.ok(!x.includes('abcdefgh') && !x.includes('c2FsenNhbHo'), x);
  });

  it('ohne passende eingeschaltete Automatisierung kein Ereignis', async () => {
    const { markus, motor, repo, werkbank, protokoll, d } = await aufbau();
    const a = await motor.lege({ name: 'Aus', aktiv: false, wenn: { art: 'protokoll.meldung', stufe: 'warn' }, dann: [{ id: 's', art: 'stopp' }] }, markus.id);
    assert.equal(a.aktiv, false);
    const melder = new Betriebsmelder({ werkbank, automatisierungen: () => repo.liste(), inAutomatisierung: () => false, ereignis: (m) => d.kern.ereignis('protokoll.meldung', { ...m }, null) });
    melder.merke({ nr: 1, zeit: new Date().toISOString(), stufe: 'error', modul: 'mail', text: 'x' } as Eintrag);
    assert.equal(await melder.sende(), 0);
    void protokoll;
  });
});

describe('Wenn-Karte „Neue Version verfügbar“ (#677)', () => {
  it('einmal am Tag geprüft, nur solange eine solche Automatisierung an ist; je Version genau ein Ereignis', async () => {
    const zeit = { jetzt: Date.parse('2026-11-12T08:00:00Z') };
    const version = { neu: '9.0.0' as string | null };
    const { markus, motor, verteile, aufgabenVon } = await aufbau({ uhr: () => zeit.jetzt, verteiler: true });
    let gefragt = 0;
    (motor as unknown as { d: { werkbank: SystemWerkbank } }).d.werkbank = { ...systemWerkbank({ sicherung: testSicherung().sicherung, fehlermeldungen: new Fehlermeldungen(speicherFehlerRepo(), speicherDateien()) }), neueVersion: async () => { gefragt++; return version.neu; } };
    await motor.zeitplan();
    assert.equal(gefragt, 0, 'ohne Automatisierung keine Anfrage an GitHub');
    await motor.lege({ name: 'Update', aktiv: true, wenn: { art: 'version.neu' }, dann: [{ id: 'a', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'person', id: markus.id }], text: 'Ablago {version} ist da (installiert: {installiert}).' }] }, markus.id);
    await motor.zeitplan();
    await motor.zeitplan();
    assert.equal(gefragt, 1, 'einmal am Tag');
    await verteile();
    const [x] = await aufgabenVon(markus.id);
    assert.match(x.text, /^Ablago 9\.0\.0 ist da \(installiert: \d+\.\d+\.\d+.*\)\.$/);
    zeit.jetzt += 86_400_000;
    await motor.zeitplan();
    assert.equal(gefragt, 2);
    assert.deepEqual(await verteile(), [], 'dieselbe Version nicht noch einmal');
  });

  it('vergleicht mit dem neuesten stabilen Release', async () => {
    assert.equal(await neueStabileVersion(async () => ({ tag_name: 'v0.300.0' }), '0.256.0'), '0.300.0');
    assert.equal(await neueStabileVersion(async () => ({ tag_name: 'v0.256.0' }), '0.256.0'), null);
    assert.equal(await neueStabileVersion(async () => ({ tag_name: 'nightly' }), '0.256.0'), null);
  });
});

describe('Ereigniskatalog (#677)', () => {
  it('„Sicherung fertig“ löst keine Automatisierung aus', async () => {
    const { markus, motor } = await aufbau();
    // Auch eine (unmöglich gespeicherte) Wenn-Karte auf „sicherung.fertig“ würde bereinigt.
    assert.equal(bereinigeAutomatisierung({ wenn: { art: 'sicherung.fertig' } }).wenn.art, 'mappe.angelegt');
    const a = await motor.lege({ name: 'Fehler', aktiv: true, wenn: { art: 'fehler.gemeldet' }, dann: [{ id: 's', art: 'stopp' }] }, markus.id);
    await motor.ereignis(ereignis('sicherung.fertig', { datei: 'x', groesse: 1 }));
    assert.equal((await motor.laeufe(a.id)).length, 0);
    void (a.wenn as WennKarte);
  });
});
