/**
 * Eigene Organisation (#995): Merkmal und Schreibschutz im Paketformat, Schreibschutz auf allen Wegen (Oberfläche,
 * API v1, Pakete; 403), Lesen mit Systemrechten nur über die feste Liste (Ergänzung Sicherheit), Wahl bei mehreren,
 * Notiz an die Verwaltung, Auskunft und Löschkonzept, Erkennung, Anzeige-Bedingung „zeigt auf eine eigene
 * Organisation“, Übernehmen der bisherigen Angabe. Namen sind erfunden (Personas). Läuft im Arbeitsspeicher und – mit
 * TEST_DATABASE_URL – gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { anzeigeBedingungTrifft, bereinigeAnzeige, beschreibeAnzeigeBedingung } from '../../shared/src/anzeige';
import type { Feld, Mappentyp } from '../../shared/src/model';
import { angabenFelder, darfGeschuetztSchreiben, geltendeOrganisation, liesAngaben, liesOrganisationEinstellung, verantwortlicherText, type EigeneOrganisation } from '../../shared/src/organisation';
import { MERKMALE_EINSTELLUNG } from '../../shared/src/merkmale';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { werteAusText } from '../src/organisation';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { mindestversion } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { bereicheDerRoute } from '../src/verwaltungsbereiche';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Verbindungen nur zum Schließen
const offen: any[] = [];
after(async () => { for (const s of offen) await s.end(); });

async function pgRepos(name: string): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const { sql } = await eigeneDatenbank(name);
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

const fehler = (s: number, re?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!re || re.test(e.message));
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));

const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const manifest = `schema: 1\nid: kontakte\nname: Kontakte\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.238.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`;
/** Wie Basis 1.7.0 (dms-registry #170): Organisation mit Merkmal, Schreibschutz und Abschnitt Datenschutz; Person. */
const TYPEN = (merkmal = 'merkmal: eigeneOrganisation, schreibschutz: verwaltung') => `- schluessel: organisation
  name: Organisation
  beschreibung: Test
  titelVorlage: "{name} {kundennummer}"
  felder:
    - { key: name, label: Name, typ: text, pflicht: true, maxLen: 120, erkennung: { art: name } }
    - { key: kuerzel, label: Kürzel, typ: text, maxLen: 20, erkennung: { art: name } }
    - { key: eigene_organisation, label: Eigene Organisation, typ: janein, standard: false, ${merkmal} }
    - { key: kundennummer, label: Kundennummer, typ: text, maxLen: 40, erkennung: { art: nummer }, wiederfinden: true }
    - { key: iban, label: IBAN, typ: text, maxLen: 40, format: iban, erkennung: { art: iban } }
    - { key: kennwort, label: Kennwort, typ: passwort }
    - { key: verantwortlicher, label: Verantwortlicher, typ: referenz, ziel: [organisation, person], verweisart: bezug }
    - { key: datenschutzbeauftragter, label: Datenschutzbeauftragter, typ: referenz, ziel: person, verweisart: bezug }
    - { key: telefon, label: Telefon, typ: text, maxLen: 40, format: telefon, erkennung: { art: telefon }, wiederfinden: true }
    - { key: email, label: E-Mail, typ: text, maxLen: 200, format: email, erkennung: { art: email }, wiederfinden: true }
    - { key: strasse, label: Straße, typ: text, maxLen: 120, erkennung: { art: strasse } }
    - { key: hausnummer, label: Hausnummer, typ: text, maxLen: 10, erkennung: { art: hausnummer } }
    - { key: plz, label: PLZ, typ: text, maxLen: 10, erkennung: { art: plz } }
    - { key: ort, label: Ort, typ: text, maxLen: 80, erkennung: { art: ort } }
    - { key: beschreibung, label: Beschreibung, typ: langtext }
  register:
    - key: stammdaten
      name: Stammdaten
      art: felder
      felder: [name, kuerzel, eigene_organisation, kundennummer, iban, kennwort, beschreibung, verantwortlicher, datenschutzbeauftragter]
      abschnitte:
        - { vor: verantwortlicher, titel: Datenschutz, anzeigen: { bedingungen: [{ art: feld, bedingung: { art: feld, feld: eigene_organisation, op: ja } }] } }
    - { key: kontakt, name: Kontakt, art: felder, felder: [telefon, email] }
    - { key: anschrift, name: Anschrift, art: felder, felder: [strasse, hausnummer, plz, ort] }
    - { key: dokumente, name: Dokumente, art: dokumente }
- schluessel: person
  name: Person
  beschreibung: Test
  titelVorlage: "{vorname} {nachname}"
  felder:
    - { key: vorname, label: Vorname, typ: text, maxLen: 80, erkennung: {} }
    - { key: nachname, label: Nachname, typ: text, pflicht: true, maxLen: 80, erkennung: {} }
    - { key: geburtstag, label: Geburtstag, typ: datum }
    - { key: email, label: E-Mail, typ: text, maxLen: 200, format: email, erkennung: {} }
    - { key: notiz, label: Notiz, typ: langtext }
  register:
    - { key: stammdaten, name: Stammdaten, art: felder, felder: [vorname, nachname, geburtstag, email, notiz] }
- schluessel: rechnung
  name: Rechnung
  beschreibung: Test
  felder:
    - { key: nummer, label: Nummer, typ: text, maxLen: 40 }
    - { key: von, label: Von, typ: referenz, ziel: organisation }
    - { key: zahlungseingang, label: Zahlungseingang am, typ: datum, pflicht: true }
  register:
    - key: rechnung
      name: Rechnung
      art: felder
      felder: [nummer, von, zahlungseingang]
      abschnitte:
        - { vor: zahlungseingang, titel: Ausgangsrechnung, anzeigen: { bedingungen: [{ art: eigeneOrganisation, feld: von }] } }
`;
const PAKET = (typen = TYPEN()) => ({ 'manifest.yaml': manifest, 'inhalt/mappentypen.yaml': typen });

async function aufbau(pg: boolean, name: string) {
  const r = pg ? await pgRepos(name) : { repo: speicherRepo(), konto: speicherKontoRepo() };
  const einstellungen = speicherEinstellungen();
  // Eigene Organisationen wirken nur bei beruflicher Nutzung (#1170) – die Tischlerei nutzt die Ablage beruflich.
  await einstellungen.schreibe(MERKMALE_EINSTELLUNG, { beruflich: true });
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen });
  const konten = new Konten(r.konto, () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const mails: string[] = [];
  d.verbindeVerwaltungsmail((bereich) => async (betreff, text) => { mails.push(`${bereich}|${typeof betreff === 'function' ? betreff() : betreff}|${typeof text === 'function' ? text() : text}`); });
  // Katrin hat Gesamte Verwaltung (Einrichtung), Markus nur den Bereich „Eigene Organisation“, Jonas verwaltet nicht.
  const { benutzer: katrin } = await konten.einrichten({ email: 'katrin@example.org', name: 'Katrin', passwort: 'ein-langes-passwort' });
  const markus = (await konten.legeBenutzerAn({ email: 'markus@example.org', name: 'Markus' }, katrin.id)).benutzer;
  const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, katrin.id)).benutzer;
  await konten.setzeVerwaltung({ ...(await konten.listeBenutzer()).find((b) => b.id === katrin.id)!, rolle: 'admin' }, markus.id, ['organisation']);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const p = new Paketverwaltung(d, { version: () => '0.238.0', abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
  const ICH = { id: katrin.id, email: katrin.email };
  const h = await p.hochladen(archiv(PAKET()), ICH);
  const inst = await p.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true }, ICH);
  const org = inst.typen.organisation, person = inst.typen.person, rechnung = inst.typen.rechnung;
  const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
  const tabelle = routen(d, konten, { apiSchluessel: schluessel });
  const route = (m: string, pfad: string) => { const x = tabelle.find((y) => y.methode === m && y.pfad === pfad); assert.ok(x, `${m} ${pfad}`); return x!; };
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  /** Oberfläche ohne Verwaltungsmodus. */
  const oberflaeche = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}) => route(m, pfad).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: { ...(await ich(b.id)), rolle: 'mitglied' } } as Anfrage);
  /** Oberfläche im Verwaltungsmodus (wie nach „Ablago verwalten“). */
  const verwaltend = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}) => route(m, pfad).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, verwaltungsmodus: true, benutzer: { ...(await ich(b.id)), rolle: 'admin' } } as Anfrage);
  /** API v1 mit dem Schlüssel einer Person – auch einer, die verwalten darf. */
  const api = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}) => {
    const k = (await schluessel.lege(await ich(b.id), { name: 'Skript', recht: 'schreiben' })).schluessel;
    const anfrage = { body: {}, params: {}, query: {}, ip: '127.0.0.1', ...x } as Anfrage;
    const r = route(m, `/api/v1${pfad}`);
    await pruefeZugang(r as Route, anfrage, (n) => (n === 'authorization' ? `Bearer ${k}` : undefined), konten, schluessel);
    return r.handler(anfrage);
  };
  const typ = async (id: string) => (await d.mappentypen.listeTypen()).find((x) => x.id === id)!;
  return { d, p, konten, katrin, markus, jonas, org, person, rechnung, typ, oberflaeche, verwaltend, api, mails, einstellungen, repo: r.repo };
}

/* ---------- Gemeinsamer Teil ---------- */

const feld = (key: string, typ: Feld['typ'], x: Partial<Feld> = {}): Feld => ({ key, label: key, typ, ...x });
const ORG = {
  felder: [feld('kuerzel', 'text', { erkennung: { art: 'name' } }), feld('name', 'text', { erkennung: { art: 'name' } }), feld('notiz', 'langtext', { erkennung: { art: 'strasse' } }),
    feld('geheim', 'passwort'), feld('email', 'text', { erkennung: {} }), feld('ort', 'text'), feld('plz', 'text', { erkennung: {} })],
  register: [{ key: 'a', name: 'A', art: 'felder' as const, felder: ['name', 'kuerzel', 'notiz', 'geheim'] }, { key: 'b', name: 'B', art: 'felder' as const, felder: ['email', 'ort', 'plz'] }],
};

describe('Eigene Organisation (#995): feste Liste und Bedeutungen', () => {
  it('je Bedeutung das erste Feld in Registerreihenfolge, nur Text mit „Aus Dokument füllen“, nie Passwort', () => {
    const f = angabenFelder(ORG);
    // Name steht im Register vor Kürzel (auch Kürzel trägt art: name) – Registerreihenfolge, nicht Feldreihenfolge.
    assert.equal(f.name?.key, 'name');
    // Langtext mit der Bedeutung Straße zählt nicht; Ort ohne „Aus Dokument füllen“ auch nicht; E-Mail und PLZ aus der Kennung.
    assert.deepEqual(Object.keys(f).sort(), ['email', 'name', 'plz']);
    const a = liesAngaben(ORG, { name: 'Tischlerei Brandt', kuerzel: 'TB', notiz: 'intern', geheim: 'x', email: ' info@example.org ', ort: 'Musterstadt', plz: '12345', iban: 'DE00' });
    assert.deepEqual(a, { name: 'Tischlerei Brandt', email: 'info@example.org', plz: '12345' });
    // Gekürzt auf 200 Zeichen.
    assert.equal(liesAngaben(ORG, { name: 'x'.repeat(500) }).name?.length, 200);
  });

  it('Verantwortlicher als Text: selbst, Person mit Anschrift der Organisation, Datenschutzbeauftragter', () => {
    const o: EigeneOrganisation = { mappeId: 'a', typId: 't', angaben: { name: 'Tischlerei Brandt', strasse: 'Hauptstraße', hausnummer: '5', plz: '12345', ort: 'Musterstadt', email: 'info@example.org' }, verantwortlicher: { selbst: true }, datenschutzbeauftragter: null };
    assert.equal(verantwortlicherText(o), 'Tischlerei Brandt\nHauptstraße 5\n12345 Musterstadt\nE-Mail: info@example.org');
    const mit = { ...o, verantwortlicher: { mappeId: 'p', typId: 'pt', angaben: { vorname: 'Katrin', nachname: 'Brandt' } }, datenschutzbeauftragter: { mappeId: 'd', typId: 'pt', angaben: { vorname: 'Petra', nachname: 'Muster', email: 'dsb@example.org' } } };
    assert.equal(verantwortlicherText(mit), 'Katrin Brandt\nfür Tischlerei Brandt\nHauptstraße 5\n12345 Musterstadt\nE-Mail: info@example.org\nDatenschutzbeauftragter: Petra Muster, dsb@example.org');
  });

  it('Wahl bei mehreren, Einstellung und Recht auf geschützte Felder', () => {
    const a = { mappeId: '1' }, b = { mappeId: '2' };
    assert.equal(geltendeOrganisation([a], { auskunft: null }), a);
    assert.equal(geltendeOrganisation([a, b], { auskunft: null }), null);
    assert.equal(geltendeOrganisation([a, b], { auskunft: '2' }), b);
    assert.equal(geltendeOrganisation([a], { auskunft: '9' }), a, 'eine nicht mehr eigene Wahl zählt nicht');
    assert.deepEqual(liesOrganisationEinstellung({ auskunft: 'kein', rollen: ['x', '00000000-0000-4000-8000-000000000009'], notizen: [{ was: 'boese' }] }), { auskunft: null, rollen: ['00000000-0000-4000-8000-000000000009'], notizen: [], gesehen: null });
    const e = { rollen: ['r1'] };
    assert.equal(darfGeschuetztSchreiben({ verwaltungsmodus: true, verwaltung: ['organisation'], rollen: [] }, e), true);
    assert.equal(darfGeschuetztSchreiben({ verwaltungsmodus: true, verwaltung: ['*'], rollen: [] }, e), true);
    assert.equal(darfGeschuetztSchreiben({ verwaltungsmodus: true, verwaltung: ['benutzer'], rollen: [] }, e), false, 'ein anderer Bereich reicht nicht');
    assert.equal(darfGeschuetztSchreiben({ verwaltungsmodus: false, verwaltung: ['*'], rollen: [] }, e), false, 'ohne Verwaltungsmodus nicht');
    assert.equal(darfGeschuetztSchreiben({ verwaltungsmodus: false, rollen: ['r1'] }, e), true, 'freigegebene Rolle');
    assert.equal(darfGeschuetztSchreiben({ verwaltungsmodus: false, art: 'dienst', rollen: ['r1'] }, e), false, 'Pakete nie');
  });

  it('Anzeige-Bedingung „zeigt auf eine eigene Organisation“', () => {
    const typ = { felder: [feld('von', 'referenz', { zielTypen: ['o'] }), feld('x', 'text')] };
    const b = bereinigeAnzeige({ bedingungen: [{ art: 'eigeneOrganisation', feld: 'von' }] })!.bedingungen[0];
    assert.deepEqual(b, { art: 'eigeneOrganisation', feld: 'von' });
    const eigen = (id: string) => id === 'wir';
    assert.equal(anzeigeBedingungTrifft(b, typ, { von: 'wir' }, { eigeneOrganisation: eigen }), true);
    assert.equal(anzeigeBedingungTrifft(b, typ, { von: 'andere' }, { eigeneOrganisation: eigen }), false);
    assert.equal(anzeigeBedingungTrifft({ ...b, nicht: true }, typ, { von: 'andere' }, { eigeneOrganisation: eigen }), true);
    assert.equal(anzeigeBedingungTrifft({ art: 'eigeneOrganisation', feld: 'x' }, typ, { x: 'wir' }), null, 'nur an Verweisfeldern');
    assert.equal(beschreibeAnzeigeBedingung(b, typ), '„von“ zeigt auf eine eigene Organisation');
  });

  it('Paketformat: merkmal nur am Ja/Nein-Feld, höchstens eines, schreibschutz verwaltung; Mindestversion', () => {
    const p = liesPaket(liesZip(archiv(PAKET())));
    const f = p.typen[0].felder.find((x) => x.key === 'eigene_organisation')!;
    assert.deepEqual([f.merkmal, f.schreibschutz], ['eigeneOrganisation', 'verwaltung']);
    assert.throws(() => liesPaket(liesZip(archiv(PAKET(TYPEN().replace('typ: text, maxLen: 20, erkennung: { art: name } }', 'typ: text, maxLen: 20, merkmal: eigeneOrganisation }'))))), gruende(/merkmal gibt es nur am Ja\/Nein-Feld/));
    assert.throws(() => liesPaket(liesZip(archiv(PAKET(TYPEN('merkmal: anderes'))))), gruende(/merkmal gibt es nur/));
    assert.throws(() => liesPaket(liesZip(archiv(PAKET(TYPEN('merkmal: eigeneOrganisation, schreibschutz: alle'))))), gruende(/schreibschutz ist verwaltung/));
    assert.throws(() => liesPaket(liesZip(archiv(PAKET(TYPEN().replace('    - { key: beschreibung, label: Beschreibung, typ: langtext }', '    - { key: beschreibung, label: Beschreibung, typ: langtext }\n    - { key: zweite, label: Zweite, typ: janein, merkmal: eigeneOrganisation }'))))), gruende(/höchstens ein Feld mit merkmal/));
    assert.equal(mindestversion(['organisation']).version, '0.238.0');
  });

  it('bisherige Angabe als Werte: Name, Straße, PLZ/Ort, E-Mail, Telefon; Rest in die Beschreibung', () => {
    const typ = { felder: liesPaket(liesZip(archiv(PAKET()))).typen[0].felder as Feld[], register: liesPaket(liesZip(archiv(PAKET()))).typen[0].register } as unknown as Mappentyp;
    assert.deepEqual(werteAusText(typ, 'Tischlerei Brandt\nInhaberin Katrin Brandt\nHauptstraße 5a\n12345 Musterstadt\nTel. 0123 45678\ninfo@example.org'), {
      name: 'Tischlerei Brandt', strasse: 'Hauptstraße', hausnummer: '5a', plz: '12345', ort: 'Musterstadt', telefon: '0123 45678', email: 'info@example.org', eigene_organisation: true, beschreibung: 'Inhaberin Katrin Brandt',
    });
  });
});

for (const pg of [false, true]) {
  const wo = pg ? ' – PostgreSQL' : '';
  describe(`Eigene Organisation (#995): Schreibschutz, Lesen und Nutzen${wo}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    it('Merkmal und Schreibschutz kommen aus dem Paket; die Werkbank kann sie nicht entfernen oder setzen', async () => {
      const x = await aufbau(pg, 'org_typ');
      const t = await x.typ(x.org);
      assert.deepEqual(t.felder.filter((f) => f.merkmal || f.schreibschutz).map((f) => [f.key, f.merkmal, f.schreibschutz]), [['eigene_organisation', 'eigeneOrganisation', 'verwaltung']]);
      // Mappentyp über die Werkbank ändern: Angaben weg bzw. auf einem anderen Feld – bleiben, wie sie waren.
      const felder = t.felder.map((f) => (f.key === 'eigene_organisation' ? { ...f, merkmal: undefined, schreibschutz: undefined } : f.key === 'name' ? { ...f, schreibschutz: 'verwaltung' as const } : f));
      await x.d.mappentypen.aendereTyp(x.org, { ...t, felder });
      const n = await x.typ(x.org);
      assert.deepEqual(n.felder.filter((f) => f.merkmal || f.schreibschutz).map((f) => f.key), ['eigene_organisation']);
      const p = await x.typ(x.person);
      await x.d.mappentypen.aendereTyp(x.person, { ...p, felder: [...p.felder, { key: 'wir', label: 'Wir', typ: 'janein', merkmal: 'eigeneOrganisation', schreibschutz: 'verwaltung' }], register: p.register.map((r, i) => (i === 0 ? { ...r, felder: [...(r.felder ?? []), 'wir'] } : r)) });
      assert.equal((await x.typ(x.person)).felder.find((f) => f.key === 'wir')?.merkmal, undefined);
    });

    it('Schreibschutz: Mitglied, API-Schlüssel (auch mit Verwaltungsrecht), anderer Bereich → 403; Verwaltungsmodus mit Bereich und freigegebene Rolle dürfen', async () => {
      const x = await aufbau(pg, 'org_schutz');
      // Anlegen mit Haken: Jonas (Mitglied) nicht, auch nicht Katrin ohne Verwaltungsmodus, auch nicht per API-Schlüssel.
      const neu = { body: { typId: x.org, werte: { name: 'Tischlerei Brandt', eigene_organisation: true } } };
      const schutz = (e: unknown) => fehler(403, /Eigene Organisation/)(e) && JSON.stringify((e as Fachfehler).details) === JSON.stringify({ schreibschutz: [{ feld: 'eigene_organisation', label: 'Eigene Organisation' }] });
      await assert.rejects(x.oberflaeche(x.jonas, 'POST', '/api/mappen', neu), schutz);
      await assert.rejects(x.oberflaeche(x.katrin, 'POST', '/api/mappen', neu), schutz);
      await assert.rejects(x.api(x.katrin, 'POST', '/mappen', neu), schutz);
      // Ohne Haken (nein ist die Vorgabe) geht es.
      const fremd = (await x.oberflaeche(x.jonas, 'POST', '/api/mappen', { body: { typId: x.org, werte: { name: 'Stadtwerke Musterstadt', eigene_organisation: false } } })).body as { id: string };
      // Markus (nur Bereich „Eigene Organisation“) im Verwaltungsmodus: ja.
      const wir = (await x.verwaltend(x.markus, 'POST', '/api/mappen', neu)).body as { id: string };
      assert.equal((await x.d.mappen.holeMappe(wir.id)).mappe.werte.eigene_organisation, true);
      // Jonas darf die Mappe bearbeiten, aber das Merkmal nicht ändern – Oberfläche und API v1; andere Felder gehen.
      await assert.rejects(x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id: wir.id }, body: { werte: { eigene_organisation: false } } }), fehler(403));
      await assert.rejects(x.api(x.jonas, 'PUT', '/mappen/:id', { params: { id: fremd.id }, body: { werte: { eigene_organisation: true } } }), fehler(403));
      await x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id: wir.id }, body: { werte: { eigene_organisation: true, telefon: '0123 4567' } } });
      // Das Formular erfährt, was gesperrt ist.
      const z = await x.d.rechtepruefung.zugriff({ id: x.jonas.id, rolle: 'mitglied' });
      assert.deepEqual((await x.d.mappen.holeMappe(wir.id, z)).schreibschutz, ['eigene_organisation']);
      const zm = await x.d.rechtepruefung.zugriff({ ...(await x.konten.listeBenutzer()).find((b) => b.id === x.markus.id)!, rolle: 'admin' });
      assert.deepEqual((await x.d.mappen.holeMappe(wir.id, zm)).schreibschutz, []);
      // Freigegebene Rolle (Werkbank): Jonas bekommt eine Rolle „Büro“, die das Merkmal setzen darf.
      const buero = (await x.d.mappen.legeMappeAn({ typId: (await x.d.kern.system()).rolle.id, werte: { name: 'Büro' } }, x.katrin.id)).id;
      await x.d.postSystemmappen.setzeRollen(x.jonas.id, [buero], x.katrin.id);
      await x.verwaltend(x.markus, 'PUT', '/api/werkbank/organisation', { body: { rollen: [buero] } });
      await x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id: fremd.id }, body: { werte: { eigene_organisation: true } } });
      assert.equal((await x.d.mappen.holeMappe(fremd.id)).mappe.werte.eigene_organisation, true);
      // Rollen nur aus der Liste der Rollen.
      await assert.rejects(x.verwaltend(x.markus, 'PUT', '/api/werkbank/organisation', { body: { rollen: [fremd.id] } }), fehler(422));
      // Die Routen gehören zum Bereich „Eigene Organisation“.
      assert.deepEqual(bereicheDerRoute('PUT', '/api/werkbank/organisation'), ['organisation']);
    });

    it('Werkbank liest nur die feste Liste – auch ohne Leserecht; die Mappe selbst bleibt verschlossen', async () => {
      const x = await aufbau(pg, 'org_lesen');
      const dsb = (await x.d.mappen.legeMappeAn({ typId: x.person, werte: { vorname: 'Petra', nachname: 'Muster', email: 'dsb@example.org', geburtstag: '1980-02-03', notiz: 'nur intern' } }, x.katrin.id)).id;
      const wir = (await x.verwaltend(x.katrin, 'POST', '/api/mappen', { body: { typId: x.org, werte: {
        name: 'Tischlerei Brandt', kuerzel: 'TB', eigene_organisation: true, kundennummer: 'K-1', iban: 'DE02120300000000202051', beschreibung: 'intern',
        telefon: '0123 4567', email: 'info@example.org', strasse: 'Hauptstraße', hausnummer: '5', plz: '12345', ort: 'Musterstadt', datenschutzbeauftragter: dsb,
      } } })).body as { id: string };
      // Niemand außer im Verwaltungsmodus darf Organisationen und Personen lesen.
      for (const t of [x.org, x.person]) await x.d.kern.repo.setzeBerechtigungen(t, { grund: { C: false, R: false, U: false, D: false, P: false }, regeln: [] });
      const s = (await x.verwaltend(x.markus, 'GET', '/api/werkbank/organisation')).body as { organisationen: EigeneOrganisation[]; geltend: string | null };
      assert.equal(s.geltend, wir.id);
      assert.deepEqual(s.organisationen, [{
        mappeId: wir.id, typId: x.org, angaben: { name: 'Tischlerei Brandt', telefon: '0123 4567', email: 'info@example.org', strasse: 'Hauptstraße', hausnummer: '5', plz: '12345', ort: 'Musterstadt' },
        verantwortlicher: { selbst: true }, datenschutzbeauftragter: { mappeId: dsb, typId: x.person, angaben: { vorname: 'Petra', nachname: 'Muster', email: 'dsb@example.org' } },
      }]);
      const json = JSON.stringify(s);
      for (const nie of ['K-1', 'DE02', 'geheim', 'intern', 'TB', '1980', 'Tischlerei Brandt K-1']) assert.ok(!json.includes(nie), `nicht in der Werkbank: ${nie}`);
      // Die API liefert die Mappe weiterhin nicht – auch nicht Markus mit seinem Schlüssel (Verwaltungsrecht gilt dort nie).
      await assert.rejects(x.api(x.markus, 'GET', '/mappen/:id', { params: { id: wir.id } }), (e: unknown) => e instanceof Fachfehler && (e.status === 403 || e.status === 404));
      await assert.rejects(x.oberflaeche(x.markus, 'GET', '/api/mappen/:id', { params: { id: wir.id } }), (e: unknown) => e instanceof Fachfehler && (e.status === 403 || e.status === 404));
      // Auskunft und Löschkonzept nehmen den Verantwortlichen von hier.
      const ds = await x.d.datenschutzDienst.datenschutzFuerUnterlagen();
      assert.equal(ds.verantwortlicher, 'Tischlerei Brandt\nHauptstraße 5\n12345 Musterstadt\nE-Mail: info@example.org\nTelefon: 0123 4567\nDatenschutzbeauftragter: Petra Muster, dsb@example.org');
      assert.equal((await x.d.datenschutzDienst.datenschutz()).verantwortlicher, '', 'die gespeicherte Einstellung bleibt, wie sie ist');
    });

    it('mehrere eigene Organisationen: Wahl „für Auskünfte und Unterlagen gilt …“, nur eigene wählbar', async () => {
      const x = await aufbau(pg, 'org_mehrere');
      const a = (await x.verwaltend(x.katrin, 'POST', '/api/mappen', { body: { typId: x.org, werte: { name: 'Katrin privat', eigene_organisation: true } } })).body as { id: string };
      const b = (await x.verwaltend(x.katrin, 'POST', '/api/mappen', { body: { typId: x.org, werte: { name: 'Tischlerei Brandt', eigene_organisation: true } } })).body as { id: string };
      const c = (await x.verwaltend(x.katrin, 'POST', '/api/mappen', { body: { typId: x.org, werte: { name: 'Stadtwerke Musterstadt' } } })).body as { id: string };
      assert.equal(((await x.verwaltend(x.katrin, 'GET', '/api/werkbank/organisation')).body as { geltend: string | null }).geltend, null);
      assert.equal(await x.d.organisation.verantwortlicherText(), null);
      await assert.rejects(x.verwaltend(x.katrin, 'PUT', '/api/werkbank/organisation', { body: { auskunft: c.id } }), fehler(422));
      const s = (await x.verwaltend(x.katrin, 'PUT', '/api/werkbank/organisation', { body: { auskunft: b.id } })).body as { geltend: string };
      assert.equal(s.geltend, b.id);
      assert.match((await x.d.datenschutzDienst.datenschutzFuerUnterlagen()).verantwortlicher, /^Tischlerei Brandt/);
      assert.notEqual(a.id, b.id);
    });

    it('Notiz an die Verwaltung bei Merkmal und Verantwortlichem; Mail an den Bereich; zur Kenntnis nehmen', async () => {
      const x = await aufbau(pg, 'org_notiz');
      const wir = (await x.verwaltend(x.katrin, 'POST', '/api/mappen', { body: { typId: x.org, werte: { name: 'Tischlerei Brandt', eigene_organisation: true } } })).body as { id: string };
      const katrin = (await x.d.mappen.legeMappeAn({ typId: x.person, werte: { vorname: 'Katrin', nachname: 'Brandt' } }, x.katrin.id)).id;
      await x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id: wir.id }, body: { werte: { verantwortlicher: katrin } } });
      // Andere Felder einer eigenen Organisation und fremde Organisationen geben keine Notiz.
      await x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id: wir.id }, body: { werte: { telefon: '0123' } } });
      const e = await x.d.organisation.einstellung();
      assert.deepEqual(e.notizen.map((n) => [n.was, n.titel, n.von]), [['verantwortlicher', 'Tischlerei Brandt', 'Jonas'], ['merkmal-an', 'Tischlerei Brandt', 'Katrin']]);
      assert.equal(x.mails.length, 2);
      assert.match(x.mails[0], /^organisation\|Ablago: eigene Organisation geändert\|.*Tischlerei Brandt.*als eigene Organisation gekennzeichnet/s);
      const s = (await x.verwaltend(x.markus, 'PUT', '/api/werkbank/organisation', { body: { gesehen: true } })).body as { neu: number };
      assert.equal(s.neu, 0);
      // Der Verantwortliche ist jetzt eine Person – für die Auskunft mit der Anschrift der Organisation.
      assert.match((await x.d.datenschutzDienst.datenschutzFuerUnterlagen()).verantwortlicher, /^Katrin Brandt\nfür Tischlerei Brandt/);
    });

    it('Erkennung: die eigene Organisation ist nie Absender eingehender Post', async () => {
      const x = await aufbau(pg, 'org_erkennung');
      await x.verwaltend(x.katrin, 'POST', '/api/mappen', { body: { typId: x.org, werte: { name: 'Tischlerei Brandt', eigene_organisation: true, email: 'info@tischlerei.example.org', telefon: '0123 45678' } } });
      const sw = (await x.d.mappen.legeMappeAn({ typId: x.org, werte: { name: 'Stadtwerke Musterstadt', email: 'kunden@stadtwerke.example.org' } }, x.katrin.id)).id;
      const p = await x.d.post.legePostAn({ betreff: 'Ihre Rechnung', nachricht: 'An Tischlerei Brandt, info@tischlerei.example.org, Tel. 0123 45678. Stadtwerke Musterstadt, kunden@stadtwerke.example.org' }, { id: x.katrin.id, name: 'Katrin' }, await x.d.rechtepruefung.zugriff({ id: x.katrin.id, rolle: 'mitglied' }));
      const e = await x.d.erkennung.fuerPost(p.id);
      assert.deepEqual(e?.absender.map((a) => a.mappeId), [sw]);
    });

    it('#1170: ohne „beruflich“ bleibt die eigene Organisation gespeichert, Ablago verwendet sie aber nicht', async () => {
      const x = await aufbau(pg, 'org_privat');
      const wir = ((await x.verwaltend(x.katrin, 'POST', '/api/mappen', { body: { typId: x.org, werte: { name: 'Tischlerei Brandt', eigene_organisation: true, email: 'info@tischlerei.example.org' } } })).body as { id: string }).id;
      assert.match(await x.d.organisation.verantwortlicherText() ?? '', /^Tischlerei Brandt/);
      await x.d.werkbank.setzeMerkmale({ beruflich: false }, 'test');
      // Auskunft, Löschkonzept und Briefkopf: keine eigene Organisation; die Werkbank zeigt sie weiter (blass), nichts ist gelöscht.
      assert.equal(await x.d.organisation.geltende(), null);
      assert.equal(await x.d.organisation.verantwortlicherText(), null);
      const s = (await x.verwaltend(x.katrin, 'GET', '/api/werkbank/organisation')).body as { organisationen: EigeneOrganisation[] };
      assert.deepEqual(s.organisationen.map((o) => o.mappeId), [wir]);
      assert.equal((await x.d.mappen.holeMappe(wir)).mappe.werte.eigene_organisation, true);
      // Erkennung: Sie zählt nicht mehr als eigene Mappe.
      assert.ok(!(await x.d.erkennung.eigeneLage()).ids.has(wir));
      await x.d.werkbank.setzeMerkmale({ beruflich: true }, 'test');
      assert.equal((await x.d.organisation.geltende())?.mappeId, wir);
      assert.ok((await x.d.erkennung.eigeneLage()).ids.has(wir));
    });

    it('Anzeige-Bedingung im Kern: Pflicht im Abschnitt „Ausgangsrechnung“ nur, wenn „Von“ eine eigene Organisation ist', async () => {
      const x = await aufbau(pg, 'org_anzeige');
      const wir = ((await x.verwaltend(x.katrin, 'POST', '/api/mappen', { body: { typId: x.org, werte: { name: 'Tischlerei Brandt', eigene_organisation: true } } })).body as { id: string }).id;
      const sw = (await x.d.mappen.legeMappeAn({ typId: x.org, werte: { name: 'Stadtwerke Musterstadt' } }, x.katrin.id)).id;
      // Eingangsrechnung: Abschnitt ausgeblendet, Zahlungseingang nicht Pflicht.
      await x.d.mappen.legeMappeAn({ typId: x.rechnung, werte: { nummer: 'E-1', von: sw } }, x.katrin.id);
      // Ausgangsrechnung: Abschnitt zu sehen – Zahlungseingang ist Pflicht.
      await assert.rejects(x.d.mappen.legeMappeAn({ typId: x.rechnung, werte: { nummer: 'A-1', von: wir } }, x.katrin.id), fehler(422, /Zahlungseingang/));
      const st = (await x.verwaltend(x.katrin, 'GET', '/api/werkbank/organisation')).body as { verwendungen: Array<{ art: string; typ?: string }> };
      assert.ok(st.verwendungen.some((v) => v.art === 'anzeige' && v.typ === 'Rechnung'));
      // Die Ablage bekommt die Ids für das Formular.
      assert.deepEqual((await x.d.sichten.zaehlerRahmen()).eigeneOrganisationen, [wir]);
    });

    it('bisherige Angabe der Auskunft übernehmen: neue Organisation mit Merkmal, verantwortlich selbst, alte Angabe leer', async () => {
      const x = await aufbau(pg, 'org_uebernehmen');
      await x.d.datenschutzDienst.setzeDatenschutz({ verantwortlicher: 'Tischlerei Brandt\nHauptstraße 5\n12345 Musterstadt' }, 'test');
      assert.equal((await x.d.datenschutzDienst.datenschutzFuerUnterlagen()).verantwortlicher, 'Tischlerei Brandt\nHauptstraße 5\n12345 Musterstadt', 'bis dahin gilt die bisherige Angabe');
      const s = (await x.verwaltend(x.katrin, 'POST', '/api/werkbank/organisation/uebernehmen')).body as { organisationen: EigeneOrganisation[]; bisher: string };
      assert.equal(s.bisher, '');
      assert.deepEqual(s.organisationen.map((o) => [o.angaben, o.verantwortlicher]), [[{ name: 'Tischlerei Brandt', strasse: 'Hauptstraße', hausnummer: '5', plz: '12345', ort: 'Musterstadt' }, { selbst: true }]]);
      assert.equal((await x.d.mappen.holeMappe(s.organisationen[0].mappeId)).mappe.werte.verantwortlicher, s.organisationen[0].mappeId);
      await assert.rejects(x.verwaltend(x.katrin, 'POST', '/api/werkbank/organisation/uebernehmen'), fehler(409));
    });

    it('#1045: „Deine Organisation“ aus dem Einrichtungsassistenten – feste Liste, Merkmal, verantwortlich selbst, nur einmal', async () => {
      const x = await aufbau(pg, 'org_anlegen');
      assert.deepEqual(bereicheDerRoute('POST', '/api/werkbank/organisation/anlegen'), ['organisation']);
      await assert.rejects(x.verwaltend(x.katrin, 'POST', '/api/werkbank/organisation/anlegen', { body: { name: '  ', ort: 'Musterstadt' } }), fehler(422));
      // Ohne Verwaltungsmodus darf niemand das Merkmal setzen (Schreibschutz, #995).
      await assert.rejects(x.oberflaeche(x.katrin, 'POST', '/api/werkbank/organisation/anlegen', { body: { name: 'Katrin Beispiel Grafikdesign' } }));
      const s = (await x.verwaltend(x.katrin, 'POST', '/api/werkbank/organisation/anlegen', {
        body: { name: ' Katrin  Beispiel Grafikdesign ', strasse: 'Hauptstraße', hausnummer: '5', plz: '12345', ort: 'Musterstadt', email: 'katrin@example.org', telefon: '', iban: 'DE00', kennwort: 'geheim' },
      })).body as { organisationen: EigeneOrganisation[] };
      assert.deepEqual(s.organisationen.map((o) => [o.angaben, o.verantwortlicher]), [[{ name: 'Katrin Beispiel Grafikdesign', strasse: 'Hauptstraße', hausnummer: '5', plz: '12345', ort: 'Musterstadt', email: 'katrin@example.org' }, { selbst: true }]]);
      const m = (await x.d.mappen.holeMappe(s.organisationen[0].mappeId)).mappe;
      assert.equal(m.werte.eigene_organisation, true);
      assert.equal(m.werte.verantwortlicher, m.id);
      assert.ok(!m.werte.iban && !m.werte.kennwort, 'nur die feste Liste – sonst nichts');
      await assert.rejects(x.verwaltend(x.katrin, 'POST', '/api/werkbank/organisation/anlegen', { body: { name: 'Zweite' } }), fehler(409));
    });
  });
}
