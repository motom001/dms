/**
 * Automatisierungsvorlagen und Mappen-Abläufe (#1044): „Aufgabe vergeben“ und „Erinnern“ über einen Motor.
 *
 * - Gleiches Verhalten wie vorher (Speicher und PostgreSQL): Aufgabe sofort, Erinnerung am Datum als Aufgabe
 *   „Erinnerung“, Vertretung, erledigt sich wie bisher, steht in der Täglichen Zusammenfassung.
 * - Sicherheit: Rechte der Person zur Laufzeit (deaktiviert, Leserecht verloren → angehalten, Hinweis an die
 *   Verwaltung), Empfänger ohne Leserecht nur mit Hinweis (#798), Platzhalter mit den Rechten des Empfängers (#795),
 *   nur erlaubte Karten (auch aus Paketen), Bremse je Person und Mappe bzw. Minute.
 * - Umstellung (nur PostgreSQL): Erinnerungen vor 105 werden Abläufe von „Erinnern“ – mit dem heutigen Ersteller, ohne
 *   bekannten (oder als Systemkonto) mit dem Empfänger; am Datum entsteht dieselbe Aufgabe.
 */
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { bereinigeVorlage, kernVorlage, vorlagenEingabeFehler, vorlagenProbleme } from '../../shared/src/ablaufvorlagen';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { ABLAEUFE_JE_PERSON_UND_MAPPE } from '../src/grenzen';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { liesPaket } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { eigeneDatenbank, MIGRATIONEN } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const heute = heuteIn();
const in_ = (tage: number) => verschiebe(heute, tage);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung geladen
const offen: any[] = [];
after(async () => { for (const s of offen) await s.end?.().catch(() => {}); });

async function pgRepos(kurz: string): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const sql = (await eigeneDatenbank(kurz)).sql;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

/** Lena und Jonas dürfen Verträge lesen, Petra nicht; Markus ist Administrator. Motor angeschlossen (Platzhalter). */
async function aufbau(repos?: { repo: Repo; konto: KontoRepo }) {
  const d = new Dienst(repos?.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(repos?.konto ?? speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name }, markus.id)).benutzer;
  const lena = await neu('Lena'); const jonas = await neu('Jonas'); const petra = await neu('Petra');
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
  const benutzerTyp = (await d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer')!;
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id },
  ] });
  const lesen = (ids: string[]): Regelwerk => ({ grund: { ...NICHTS, C: true }, regeln: [{ id: 'r', name: 'Lesen', wenn: [{ art: 'benutzer', benutzer: ids }], dann: { R: 'erteilen', U: 'erteilen' }, stopp: false }] });
  await d.berechtigungen.setzeBerechtigungen(vertrag.id, lesen([lena.id, jonas.id]), true);
  const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', verantwortlich: jonas.id } }, lena.id);
  return { d, konten, markus, lena, jonas, petra, vertrag, m, lesen, admin: { id: markus.id, rolle: 'admin' } };
}

function verhalten(name: string, repos?: () => Promise<{ repo: Repo; konto: KontoRepo }>) {
  describe(`Mappen-Abläufe (#1044) – ${name}`, () => {
    it('„Aufgabe vergeben“ ohne Paket: sofort, Ersteller = Person, Historie und Vertretung wie bisher', async () => {
      const { d, konten, lena, jonas, petra, m } = await aufbau(await repos?.());
      const v = (await d.ablaeufe.vorlagen()).map((x) => x.kennung);
      assert.deepEqual(v.slice(0, 2), ['aufgabe_vergeben', 'erinnern'], 'Kern-Vorgaben gibt es auch ohne Paket');
      const r = await d.ablaeufe.anwenden(m.id, 'aufgabe_vergeben', { empfaengerId: jonas.id, text: '  Bitte prüfen ' }, lena.id);
      assert.equal(r.ablauf, null, 'sofort: kein geplanter Ablauf');
      assert.equal(r.aufgaben.length, 1);
      const a = r.aufgaben[0];
      assert.equal(a.art, 'manuell'); assert.equal(a.text, 'Bitte prüfen'); assert.equal(a.erstelltVon, lena.id); assert.equal(a.empfaengerId, jonas.id);
      assert.ok((await d.mappenHistorie.historie(m.id)).some((h) => h.art === 'aufgabe' && h.benutzerId === lena.id && /Jonas/.test(String(h.daten.text)) && /Bitte prüfen/.test(String(h.daten.text))));
      assert.equal((await d.kern.repo.ablaeufe({ mappeId: m.id })).length, 0, 'verschwindet sofort');
      // Vertretung: Jonas abwesend → Petra … darf den Vertrag aber nicht lesen (Fall #798, die Aufgabe kommt trotzdem an).
      await konten.setzeAbwesenheit(jonas, jonas.id, { an: true, vertreterId: petra.id });
      const v2 = (await d.ablaeufe.anwenden(m.id, 'aufgabe_vergeben', { empfaengerId: jonas.id, text: 'Zweite' }, lena.id)).aufgaben[0];
      assert.equal(v2.empfaengerId, petra.id, 'an den Vertreter weitergegeben');
      assert.ok((await d.ohneLeserecht.offeneFaelle()).some((f) => f.benutzerId === petra.id), 'Fall ohne Leserecht für den Admin');
      // Gleiche Meldungen wie früher.
      await assert.rejects(d.ablaeufe.anwenden(m.id, 'aufgabe_vergeben', { empfaengerId: jonas.id, text: ' ' }, lena.id), status(422));
      await assert.rejects(d.ablaeufe.anwenden(m.id, 'aufgabe_vergeben', { text: 'x' }, lena.id), status(422));
      // Der alte Weg ist derselbe Weg.
      const alt = await d.vertretung.legeAufgabeAn(m.id, { empfaengerId: lena.id, text: 'Auch so' }, jonas.id);
      assert.equal(alt.art, 'manuell'); assert.equal(alt.erstelltVon, jonas.id);
    });

    it('„Erinnern“: geplant unter „Geplant“, am Datum dieselbe Aufgabe „Erinnerung“ – ändern, löschen, Termine, Zusammenfassung', async () => {
      const { d, lena, jonas, m } = await aufbau(await repos?.());
      const r = await d.ablaeufe.anwenden(m.id, 'erinnern', { datum: in_(5), text: 'Angebote   vergleichen', empfaengerId: jonas.id }, lena.id);
      assert.ok(r.ablauf); assert.equal(r.ablauf.text, 'Angebote vergleichen'); assert.equal(r.ablauf.erstelltVon, lena.id); assert.equal(r.ablauf.vorlage, 'erinnern');
      assert.equal((await d.ablaeufe.anMappe(m.id)).length, 1);
      assert.ok((await d.mappenHistorie.historie(m.id)).some((h) => /Erinnerung für Jonas am/.test(String(h.daten.text))));
      // Termine von „Zu erledigen“: Jonas sieht sie, Lena nicht.
      const termine = async (id: string) => (await d.fristen.termine(await d.rechtepruefung.zugriff({ id, rolle: 'mitglied' }), { von: heute, bis: in_(30) })).eintraege.filter((x) => x.art === 'erinnerung');
      assert.equal((await termine(jonas.id)).length, 1); assert.equal((await termine(lena.id)).length, 0);
      // Ändern: nur Ersteller, Empfänger, Admin.
      await assert.rejects(d.ablaeufe.aendere(r.ablauf.id, { datum: in_(6), text: 'x' }, { id: (await d.kern.repo.listeTypen())[0].id, rolle: 'mitglied' }), status(403));
      await d.ablaeufe.aendere(r.ablauf.id, { datum: in_(7), text: 'Neu' }, { id: jonas.id, rolle: 'mitglied' });
      assert.equal((await d.kern.repo.holeAblauf(r.ablauf.id))!.datum, in_(7));
      // Noch nicht fällig → nichts; fällig → Aufgabe „Erinnerung“ mit Datum, Ablauf weg, Verlauf der Vorlage.
      assert.equal(await d.ablaeufe.faellige(heute), 0);
      assert.equal(await d.ablaeufe.faellige(in_(7)), 1);
      const auf = (await d.kern.repo.offeneAufgaben({ mappeIds: [m.id] })).find((a) => a.art === 'erinnerung')!;
      assert.equal(auf.text, 'Neu'); assert.equal(auf.datum, in_(7)); assert.equal(auf.empfaengerId, jonas.id); assert.equal(auf.erstelltVon, lena.id);
      assert.equal((await d.kern.repo.ablaeufe({ mappeId: m.id })).length, 0, 'gelaufen: verschwunden');
      assert.equal(await d.ablaeufe.faellige(in_(8)), 0, 'genau einmal');
      assert.ok((await d.ablaeufe.verlauf('erinnern')).some((x) => x.art === 'gelaufen' && x.mappeId === m.id));
      // Erledigt sich wie jede Erinnerung (von Hand) und steht vorher in der Zusammenfassung (offene Aufgaben des Empfängers).
      assert.ok((await d.vertretung.meineAufgaben({ id: jonas.id, rolle: 'mitglied' })).some((a) => a.id === auf.id));
      await d.vertretung.erledigeAufgabe(auf.id, { id: jonas.id, rolle: 'mitglied' });
      // Datum heute: läuft gleich (wie früher die Erinnerung).
      await d.ablaeufe.anwenden(m.id, 'erinnern', { datum: heute, text: 'Gleich' }, lena.id);
      assert.ok((await d.kern.repo.offeneAufgaben({ mappeIds: [m.id] })).some((a) => a.text === 'Gleich' && a.empfaengerId === lena.id), 'ohne Empfänger: man selbst');
      // Löschen.
      const x = (await d.ablaeufe.anwenden(m.id, 'erinnern', { datum: in_(3), text: 'Weg' }, lena.id)).ablauf!;
      await d.ablaeufe.loesche(x.id, { id: lena.id, rolle: 'mitglied' });
      assert.equal(await d.kern.repo.holeAblauf(x.id), undefined);
    });

    it('Rechte zur Laufzeit: deaktiviert oder ohne Leserecht → angehalten mit Hinweis; Fortsetzen prüft erneut', async () => {
      const { d, konten, markus, lena, jonas, vertrag, m, lesen } = await aufbau(await repos?.());
      const a = (await d.ablaeufe.anwenden(m.id, 'erinnern', { datum: in_(2), text: 'Später', empfaengerId: jonas.id }, lena.id)).ablauf!;
      // Lena verliert das Leserecht am Vertrag.
      await d.berechtigungen.setzeBerechtigungen(vertrag.id, lesen([jonas.id]), true);
      assert.equal(await d.ablaeufe.faellige(in_(2)), 0);
      const h = (await d.kern.repo.holeAblauf(a.id))!;
      assert.equal(h.angehalten?.grund, 'leserecht', 'nie mit gespeichertem Zugriff aus der Zeit des Anlegens');
      assert.equal((await d.kern.repo.offeneAufgaben({ mappeIds: [m.id] })).filter((x) => x.art === 'erinnerung').length, 0);
      assert.equal((await d.ablaeufe.warnungen()).angehalten.length, 1, 'Hinweis an die Verwaltung');
      // Wieder Leserecht → Fortsetzen lässt ihn laufen.
      await d.berechtigungen.setzeBerechtigungen(vertrag.id, lesen([lena.id, jonas.id]), true);
      await d.ablaeufe.fortsetzen(a.id, markus.id);
      // Fortsetzen läuft am Datum (heute noch nicht): erst der Lauf am Datum.
      assert.equal(await d.ablaeufe.faellige(in_(2)), 1);
      // Deaktiviert → angehalten.
      const b = (await d.ablaeufe.anwenden(m.id, 'erinnern', { datum: in_(3), text: 'Noch eins', empfaengerId: jonas.id }, lena.id)).ablauf!;
      await konten.setzeAbwesenheit(lena, lena.id, { an: false, vertreterId: jonas.id });
      await konten.aendereBenutzer(markus, lena.id, { aktiv: false });
      assert.equal(await d.ablaeufe.faellige(in_(3)), 0);
      assert.equal((await d.kern.repo.holeAblauf(b.id))!.angehalten?.grund, 'deaktiviert');
    });

    it('Platzhalter mit den Rechten des Empfängers (#795); Ausprobieren zeigt es', async () => {
      const { d, lena, petra, m, admin } = await aufbau(await repos?.());
      await d.ablaeufe.legeVorlage({ name: 'Nachfassen', wann: { art: 'sofort' }, fragen: ['empfaenger'], karten: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'frage' }], text: 'Bitte {titel} nachfassen ({person})' }] }, admin.id);
      const k = (await d.ablaeufe.vorlagen()).find((v) => v.name === 'Nachfassen')!.kennung;
      const zeilen = await d.ablaeufe.ausprobieren(k, m.id, { empfaengerId: petra.id }, { id: lena.id, rolle: 'mitglied' }, await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'mitglied' }));
      assert.ok(zeilen.some((z) => /nicht sichtbar/.test(z)), zeilen.join(' | '));
      assert.ok(zeilen.some((z) => /Petra darf die Mappe nicht lesen/.test(z)), zeilen.join(' | '));
      const a = (await d.ablaeufe.anwenden(m.id, k, { empfaengerId: petra.id }, lena.id)).aufgaben[0];
      assert.match(a.text, /\(nicht sichtbar\)/); assert.match(a.text, /\(Lena\)/);
      assert.doesNotMatch(a.text, /Strom/, 'Petra sieht den Titel nicht');
      // Die Eingabe wird nie selbst Platzhalter.
      await d.ablaeufe.legeVorlage({ name: 'Echo', wann: { art: 'sofort' }, fragen: ['text'], karten: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '{eingabe}' }] }, admin.id);
      const e = (await d.ablaeufe.vorlagen()).find((v) => v.name === 'Echo')!.kennung;
      assert.equal((await d.ablaeufe.anwenden(m.id, e, { text: '{titel}' }, lena.id)).aufgaben[0].text, '{titel}');
    });

    it('Bremse: höchstens N offene je Person und Mappe', async () => {
      const { d, lena, m } = await aufbau(await repos?.());
      for (let i = 0; i < ABLAEUFE_JE_PERSON_UND_MAPPE; i++) await d.kern.repo.legeAblaufAn({ id: crypto.randomUUID(), vorlage: 'erinnern', mappeId: m.id, empfaengerId: lena.id, datum: in_(9), text: `x${i}`, erstellt: '', erstelltVon: lena.id, angehalten: null });
      await assert.rejects(d.ablaeufe.anwenden(m.id, 'erinnern', { datum: in_(9), text: 'eine zu viel' }, lena.id), status(429));
    });

    it('Vorlagen aus Paketen: überlagern Kern-Vorgaben, Entfernen gibt sie zurück, offene Abläufe bleiben', async () => {
      const { d, lena, m } = await aufbau(await repos?.());
      const p = { id: 'benachrichtigungen', name: 'Benachrichtigungen', typen: {} };
      await d.ablaeufe.ausPaket(p, [
        { schluessel: 'erinnern', ersetzt: 'erinnern', daten: { name: 'Erinnern', wann: { art: 'datum' }, fragen: ['datum', 'empfaenger', 'text'], karten: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'frage' }], text: '{eingabe}' }] } },
        { schluessel: 'wiedervorlage', daten: { name: 'Wiedervorlage', wann: { art: 'in', anzahl: 6, einheit: 'monate' }, fragen: [], karten: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: 'Wiedervorlage: {titel}' }] } },
        { schluessel: 'boese', daten: { name: 'Böse', wann: { art: 'sofort' }, fragen: [], karten: [{ art: 'email', an: 'x@example.org' }] } },
      ]);
      const alle = await d.ablaeufe.uebersicht();
      assert.equal(alle.find((v) => v.kennung === 'erinnern')!.herkunft, 'paket');
      assert.ok(alle.some((v) => v.kennung === 'benachrichtigungen:wiedervorlage'));
      assert.ok(!alle.some((v) => v.name === 'Böse'), 'Karte nicht erlaubt: nicht übernommen');
      const w = (await d.ablaeufe.anwenden(m.id, 'benachrichtigungen:wiedervorlage', {}, lena.id)).ablauf!;
      assert.equal(w.datum, verschiebe(heute, 6, 'monate'));
      const e = (await d.ablaeufe.anwenden(m.id, 'erinnern', { datum: in_(4), text: 'bleibt' }, lena.id)).ablauf!;
      // Paket entfernt: Kern-Vorgabe gilt wieder, die Wiedervorlage bleibt mit offenem Ablauf als eigene.
      await d.ablaeufe.ausPaket(p, []);
      const danach = await d.ablaeufe.vorlagen();
      assert.equal(danach.find((v) => v.kennung === 'erinnern')!.herkunft, 'kern');
      assert.equal(danach.find((v) => v.kennung === 'benachrichtigungen:wiedervorlage')!.herkunft, 'eigen');
      assert.ok(await d.kern.repo.holeAblauf(e.id)); assert.ok(await d.kern.repo.holeAblauf(w.id));
      assert.equal(await d.ablaeufe.faellige(in_(4)), 1, 'läuft mit der Kern-Vorgabe');
    });

    it('Werkbank: ändern mit Änderungsverlauf, Zurücksetzen, nur erlaubte Karten, eigene löschen erst ohne offene Abläufe', async () => {
      const { d, lena, m, admin } = await aufbau(await repos?.());
      const v = await d.ablaeufe.aendereVorlage('aufgabe_vergeben', { name: 'Bitte erledigen', version: 0 }, admin.id);
      assert.equal(v.name, 'Bitte erledigen'); assert.equal(v.herkunft, 'kern'); assert.equal(v.version, 1);
      await assert.rejects(d.ablaeufe.aendereVorlage('aufgabe_vergeben', { karten: [{ art: 'url', adresse: 'https://example.org' }], version: 1 }, admin.id), status(422));
      assert.equal((await d.ablaeufe.fassungen('aufgabe_vergeben')).length, 1);
      assert.equal((await d.ablaeufe.zuruecksetzen('aufgabe_vergeben')).name, kernVorlage('aufgabe_vergeben').name);
      const eigen = await d.ablaeufe.legeVorlage({ name: 'Später ansehen', wann: { art: 'in', anzahl: 2, einheit: 'wochen' }, fragen: [], karten: [{ art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'selbst' }], text: 'Ansehen: {titel}' }] }, admin.id);
      const a = (await d.ablaeufe.anwenden(m.id, eigen.kennung, {}, lena.id)).ablauf!;
      assert.equal((await d.ablaeufe.benutzt(eigen.kennung)).length, 1);
      await assert.rejects(d.ablaeufe.loescheVorlage(eigen.kennung), status(409));
      await assert.rejects(d.ablaeufe.loescheVorlage('erinnern'), status(409));
      assert.equal(await d.ablaeufe.faellige(a.datum), 1);
      // Benachrichtigung gebündelt an Lena.
      assert.ok((await d.kern.repo.offeneAufgaben({ mappeIds: [m.id] })).some((x) => x.empfaengerId === lena.id && x.text === 'Ansehen: Strom'));
      await d.ablaeufe.loescheVorlage(eigen.kennung);
      await d.ablaeufe.schalteVorlage('erinnern', false, admin.id);
      await assert.rejects(d.ablaeufe.anwenden(m.id, 'erinnern', { datum: in_(1), text: 'x' }, lena.id), status(409));
    });
  });
}

verhalten('Speicher');
if (url) verhalten('PostgreSQL', () => pgRepos('ablaufvorlagen'));

describe('Automatisierungsvorlagen: Prüfen (#1044, Sicherheit)', () => {
  it('nur erlaubte Karten und Empfänger; Fragen passen zum Wann', () => {
    assert.ok(vorlagenEingabeFehler({ karten: [{ art: 'email' }] }).length);
    assert.ok(vorlagenEingabeFehler({ karten: [{ art: 'aufgabe', empfaenger: [{ art: 'person', id: 'x' }] }] }).length, 'keine festen Personen');
    assert.deepEqual(vorlagenEingabeFehler({ karten: [{ art: 'aufgabe', empfaenger: [{ art: 'frage' }] }] }), []);
    const d = bereinigeVorlage({ name: 'x', wann: { art: 'datum' }, fragen: ['text'], karten: [{ art: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '{eingabe}' }] });
    assert.ok(vorlagenProbleme(d, []).length, 'am Datum ohne Frage „Datum“');
    assert.deepEqual(vorlagenProbleme(kernVorlage('erinnern'), []), []);
    assert.deepEqual(vorlagenProbleme(kernVorlage('aufgabe_vergeben'), []), []);
  });

  it('Paketformat: ablaufvorlagen mit verbotener Karte macht das Paket ungültig', async () => {
    const manifest = 'schema: 1\nid: probe\nname: Probe\nversion: 1.0.0\nbeschreibung: x\nautor: { name: x, github: x }\nlizenz: Apache-2.0\ndms: ">=0.256.0"\ninhalt:\n  ablaufvorlagen: inhalt/ablaufvorlagen.yaml\n';
    const gut = '- schluessel: wiedervorlage\n  name: Wiedervorlage\n  wann: { art: in, anzahl: 6, einheit: monate }\n  fragen: []\n  karten:\n    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: selbst }], text: "Wiedervorlage: {titel}" }\n';
    const boese = '- schluessel: weg\n  name: Weg\n  karten:\n    - { art: email, an: x@example.org }\n';
    const lies = (inhalt: string) => liesPaket(new Map([['manifest.yaml', Buffer.from(manifest)], ['inhalt/ablaufvorlagen.yaml', Buffer.from(inhalt)]]));
    assert.equal((await lies(gut)).ablaufvorlagen?.length, 1);
    await assert.rejects(Promise.resolve().then(() => lies(boese)), (e: unknown) => e instanceof Fachfehler && /Aufgabe \/ Benachrichtigung/.test(JSON.stringify(e.details)));
  });
});

if (url) {
  describe('Umstellung beim Update (#1044, Migration 105)', () => {
    it('Erinnerungen werden Abläufe von „Erinnern“: heutiger Ersteller, sonst der Empfänger, nie das Systemkonto', async () => {
      const { migriere } = await import('../src/db');
      const { pgRepo } = await import('../src/repo-pg');
      const { pgKontoRepo } = await import('../src/konto-repo');
      const db = await eigeneDatenbank('ablaufvorlagen_umstellung', { migrieren: false });
      // Stand vor 105.
      const vorher = mkdtempSync(join(tmpdir(), 'migrationen-'));
      try {
        for (const f of readdirSync(MIGRATIONEN).filter((x) => x.endsWith('.sql') && x < '105')) copyFileSync(join(MIGRATIONEN, f), join(vorher, f));
        await migriere(db.sql, vorher, () => {});
      } finally { rmSync(vorher, { recursive: true, force: true }); }
      const sql = db.sql;
      const konten0 = new Konten(pgKontoRepo(sql, HAUSHALT), null, 'http://nas');
      const { benutzer: markus } = await konten0.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
      const { benutzer: lena } = await konten0.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, markus.id);
      const { benutzer: jonas } = await konten0.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, markus.id);
      const system = await konten0.systemkonto('automatisierung');
      // Typ und Mappe wie in der alten Version angelegt (das berührt die Erinnerungen nicht).
      const alt = new Dienst(pgRepo(sql, HAUSHALT), speicherDateien(), { einstellungen: speicherEinstellungen() });
      const typ = await alt.mappentypen.legeTypAn({ name: 'Vertrag', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] });
      const mappe = await alt.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Strom' } }, lena.id);
      const erinnerung = (id: string, von: string | null, an: string | null, datum: string, text: string) =>
        sql`INSERT INTO erinnerungen (id, haushalt_id, mappe_id, empfaenger_id, datum, text, erstellt_von) VALUES (${id}, ${HAUSHALT}, ${mappe.id}, ${an}, ${datum}::date, ${text}, ${von})`;
      const [e1, e2, e3] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      await erinnerung(e1, lena.id, jonas.id, in_(1), 'Von Lena für Jonas');
      await erinnerung(e2, null, jonas.id, in_(1), 'Ohne Ersteller');
      await erinnerung(e3, system.id, lena.id, in_(1), 'Vom Systemkonto');
      // Update: 105 läuft.
      await migriere(sql, MIGRATIONEN, () => {});
      const repo = pgRepo(sql, HAUSHALT);
      const a = new Map((await repo.ablaeufe()).map((x) => [x.id, x] as const));
      assert.equal(a.size, 3);
      for (const x of a.values()) assert.equal(x.vorlage, 'erinnern');
      assert.equal(a.get(e1)!.erstelltVon, lena.id, 'heutiger Ersteller');
      assert.equal(a.get(e2)!.erstelltVon, jonas.id, 'ohne Ersteller: der Empfänger');
      assert.equal(a.get(e3)!.erstelltVon, lena.id, 'nie das Systemkonto: der Empfänger');
      // Gleiches Verhalten: am Datum dieselbe Aufgabe „Erinnerung“.
      const { Dienst: D } = await import('../src/dienst');
      const d = new D(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const konten = new Konten(pgKontoRepo(sql, HAUSHALT), null, 'http://nas', d.systemtypen.benutzerspiegel());
      d.verbindeKonten(konten.papierkorbHaken());
      await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
      assert.equal(await d.ablaeufe.faellige(in_(1)), 3);
      const auf = await repo.offeneAufgaben({ mappeIds: [mappe.id] });
      assert.deepEqual(auf.map((x) => [x.art, x.text, x.empfaengerId, x.datum]).sort(), [
        ['erinnerung', 'Ohne Ersteller', jonas.id, in_(1)], ['erinnerung', 'Vom Systemkonto', lena.id, in_(1)], ['erinnerung', 'Von Lena für Jonas', jonas.id, in_(1)],
      ].sort());
    });
  });
}
