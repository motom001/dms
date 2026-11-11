/**
 * Berechnete Felder und Hinweise von Paketen (#1034): Paketformat und Prüfung beim Installieren, nur das Paket schreibt
 * (Oberfläche, API v1, andere Pakete, Automatisierungen, Erkennung, „folgt aus“ – 400 mit Paketnamen), das Paket durchläuft
 * alle Prüfungen, Hinweise (nur Text, ≤ 300 Zeichen, ≤ 3 je Paket und Mappe, mit Paketnamen, Speichern nie gehindert),
 * Historie ohne Rauschen, Rechte-Vorschau, „nicht mehr berechnet“ und „Feld wieder freigeben“. Namen sind erfunden.
 * Der Kern läuft im Arbeitsspeicher und – mit TEST_DATABASE_URL – gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { berechnungAktiv, HINWEIS_MAX, pruefeHinweistext, vonAussenFuellbar } from '../../shared/src/berechnet';
import { fuellfelder, pruefeVorschlaege, schemaFuer } from '../../shared/src/erkennung';
import type { Mappentyp } from '../../shared/src/model';
import { liesCode, rechtePunkte, rechteZeilen } from '../../shared/src/pakete';
import { openapi } from '../src/api-v1';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { schluesselRecht } from '../src/laeufer/verwaltung';
import { berechnetAenderung, liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
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

/** 400 (bzw. s) mit Text in der Meldung. */
const fehler = (s: number, re?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!re || re.test(e.message));
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));

/* ---------- Pakete als Archiv ---------- */
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const archiv = (d: Record<string, string | Buffer>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const manifest = (id: string, name: string, code: string, extra = '') => `schema: 1\nid: ${id}\nname: ${name}\nversion: ${extra.includes('version:') ? '' : '1.0.0'}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\n${extra}inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n${code}`;
const VERTRAG = (berechnet = 'true') => `- schluessel: vertrag
  name: Vertrag
  felder:
    - { key: bezeichnung, label: Bezeichnung, typ: text, maxLen: 40 }
    - { key: beginn, label: Beginn, typ: datum }
    - { key: kuendigen_bis, label: Kündigen bis, typ: datum, berechnet: ${berechnet} }
    - { key: status, label: Status, typ: text, maxLen: 200, berechnet: true }
    - { key: aktiv, label: Läuft, typ: janein, berechnet: true }
  register:
    - { key: vertrag, name: Vertrag, art: felder, felder: [bezeichnung, beginn, kuendigen_bis, status, aktiv] }
    - { key: historie, name: Historie, art: protokoll }
`;
const CODE_VERTRAEGE = 'code:\n  sprache: c\n  quelle: code/\n  ereignisse: [mappe.geaendert]\n  mappentypen: [vertrag]\n  rechte:\n    lesen: [vertrag]\n    schreiben: [vertrag]\n    schnittstellen: [dms:hinweise]\n';
const vertraege = (o: { typen?: string; code?: string; version?: string } = {}) => ({
  'manifest.yaml': manifest('vertraege', 'Verträge', o.code ?? CODE_VERTRAEGE).replace('version: 1.0.0', `version: ${o.version ?? '1.0.0'}`),
  'inhalt/mappentypen.yaml': o.typen ?? VERTRAG(),
  'code/modul.wasm': WASM,
});
/** Ein anderes Paket, das Verträge schreiben darf – aber nicht deren berechnete Felder. */
const ANDERES = {
  'manifest.yaml': `schema: 1\nid: rechnungen\nname: Rechnungen\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\nabhaengigkeiten:\n  vertraege: ">=1.0.0"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  rechte:\n    lesen: [vertraege:vertrag]\n    schreiben: [vertraege:vertrag]\n    schnittstellen: [dms:hinweise]\n`,
  'code/modul.wasm': WASM,
};

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };

async function aufbau(pg: boolean, name: string) {
  const r = pg ? await pgRepos(name) : { repo: speicherRepo(), konto: speicherKontoRepo() };
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(r.konto, () => null, () => 'http://localhost', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const p = new Paketverwaltung(d, { version: () => '0.231.0', abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
  const installiere = async (dateien: Record<string, string | Buffer>) => { const h = await p.hochladen(archiv(dateien), ICH); return p.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true }, ICH); };
  const v = await installiere(vertraege());
  const typId = v.typen.vertrag;
  const typ = async () => (await d.listeTypen()).find((x) => x.id === typId)!;
  const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
  const tabelle = routen(d, konten, { apiSchluessel: schluessel });
  const route = (m: string, pfad: string) => { const x = tabelle.find((y) => y.methode === m && y.pfad === pfad); assert.ok(x, `${m} ${pfad}`); return x!; };
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  /** Wie die Oberfläche: angemeldet, ohne Schlüssel. */
  const oberflaeche = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}) => route(m, pfad).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) } as Anfrage);
  /** API v1 mit dem Schlüssel einer Person. */
  const api = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}) => {
    const k = (await schluessel.lege(await ich(b.id), { name: 'Skript', recht: 'schreiben' })).schluessel;
    const anfrage = { body: {}, params: {}, query: {}, ip: '127.0.0.1', ...x } as Anfrage;
    const r = route(m, `/api/v1${pfad}`);
    await pruefeZugang(r as Route, anfrage, (n) => (n === 'authorization' ? `Bearer ${k}` : undefined), konten, schluessel);
    return r.handler(anfrage);
  };
  /** Wie der Paket-Läufer: Dienstkonto des Pakets mit seinem Schlüssel. */
  const alsPaket = async (paketId: string, m: string, pfad: string, x: Partial<Anfrage> = {}) => {
    const konto = await konten.dienstkonto(paketId, paketId);
    d.kern.paketKonten.set(konto.id, paketId);
    const laeufer = (await d.kern.repo.listePakete()).find((y) => y.id === paketId)!.laeufer!;
    const k = await schluessel.fuerDienstkonto(konto, schluesselRecht(laeufer));
    const anfrage = { body: {}, params: {}, query: {}, ip: '127.0.0.1', ...x } as Anfrage;
    const r = route(m, `/api/v1${pfad}`);
    await pruefeZugang(r as Route, anfrage, (n) => (n === 'authorization' ? `Bearer ${k}` : undefined), konten, schluessel);
    return r.handler(anfrage);
  };
  const mappe = await d.legeMappeAn({ typId, werte: { bezeichnung: 'Strom Wohnung', beginn: '2025-04-01' } }, lena.id);
  return { d, p, konten, lena, jonas, typId, typ, installiere, oberflaeche, api, alsPaket, mappe, repo: r.repo };
}

describe('Berechnete Felder (#1034): Paketformat und Prüfung beim Installieren', () => {
  it('berechnet: true wird zu berechnetVon; ohne Code mit Schreibrecht, als Pflicht oder Passwort abgelehnt', () => {
    const p = liesPaket(liesZip(archiv(vertraege())));
    assert.deepEqual(p.typen[0].felder.filter((f) => f.berechnet).map((f) => f.key), ['kuendigen_bis', 'status', 'aktiv']);
    const ohneCode = { ...vertraege(), 'manifest.yaml': manifest('vertraege', 'Verträge', '') };
    assert.throws(() => liesPaket(liesZip(archiv(ohneCode))), gruende(/braucht das Paket Code mit code.rechte.schreiben/));
    const nurLesen = vertraege({ code: CODE_VERTRAEGE.replace('    schreiben: [vertrag]\n', '').replace('    schnittstellen: [dms:hinweise]\n', '') });
    assert.throws(() => liesPaket(liesZip(archiv(nurLesen))), gruende(/Vertrag.*Kündigen bis/));
    assert.throws(() => liesPaket(liesZip(archiv(vertraege({ typen: VERTRAG('true, pflicht: true') })))), gruende(/nie Pflicht/));
    assert.throws(() => liesPaket(liesZip(archiv(vertraege({ typen: VERTRAG('ja') })))), gruende(/berechnet ist true oder false/));
    assert.throws(() => liesPaket(liesZip(archiv(vertraege({ typen: VERTRAG().replace('typ: text, maxLen: 200, berechnet: true', 'typ: passwort, berechnet: true') })))), gruende(/Passwortfelder/));
    // dms:hinweise nur mit Schreibrecht.
    assert.match(liesCode({ sprache: 'c', rechte: { lesen: ['vertrag'], schnittstellen: ['dms:hinweise'] } }).fehler.join(' '), /dms:hinweise braucht code.rechte.schreiben/);
    assert.deepEqual(liesCode({ sprache: 'c', rechte: { schreiben: ['vertrag'], schnittstellen: ['dms:hinweise'] } }).fehler, []);
  });

  it('Rechte-Vorschau nennt „berechnet Felder …“, „setzt Hinweise“ und wer die Werte sieht (Ergänzung Sicherheit)', async () => {
    const c = liesCode({ sprache: 'c', rechte: { lesen: ['vertrag'], schreiben: ['vertrag'], schnittstellen: ['dms:hinweise'] } }).code!;
    const zeilen = rechteZeilen(rechtePunkte(c, (v) => (v === 'vertrag' ? 'Vertrag' : v), [{ typ: 'Vertrag', felder: ['Kündigen bis', 'Status'] }])).join('\n');
    assert.match(zeilen, /Berechnet Felder, die nur dieses Paket schreibt.*Vertrag: Kündigen bis, Status/);
    assert.match(zeilen, /Setzt Hinweise an Mappen.*\(dms:hinweise\)/);
    assert.match(zeilen, /Schreibt Werte und Hinweise, die alle sehen, die die Mappe lesen/);
    // Ohne berechnete Felder und ohne Hinweise kein solcher Satz.
    const schlicht = rechteZeilen(rechtePunkte(liesCode({ sprache: 'c', rechte: { schreiben: ['vertrag'] } }).code!, () => 'Vertrag')).join('\n');
    assert.doesNotMatch(schlicht, /alle sehen, die die Mappe lesen|Berechnet Felder/);
    // In der Vorschau der Paketverwaltung.
    const x = await aufbau(false, '');
    const h = await x.p.hochladen(archiv(vertraege({ version: '1.0.1' })), ICH);
    const v = await x.p.vorschau({ upload: h.upload });
    assert.match(rechteZeilen(v.laeufer!.rechte).join('\n'), /Vertrag: Kündigen bis, Status, Läuft/);
    // Hinweise brauchen einen Schlüssel mit Schreibrecht.
    assert.equal(schluesselRecht(liesCode({ sprache: 'c', rechte: { schreiben: ['vertrag'], schnittstellen: ['dms:hinweise'] } }).code!), 'schreiben');
  });
});

for (const pg of [false, true]) {
  const wo = pg ? ' – PostgreSQL' : '';
  describe(`Berechnete Felder (#1034): nur das Paket schreibt${wo}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    it('Installation: berechnetVon am Feld, nie Pflicht; Mappentyp nennt Paket und Stand', async () => {
      const x = await aufbau(pg, 'berechnet_install');
      const t = await x.typ();
      assert.deepEqual(t.felder.filter((f) => f.berechnetVon).map((f) => [f.key, f.berechnetVon, !!f.pflicht]), [['kuendigen_bis', 'vertraege', false], ['status', 'vertraege', false], ['aktiv', 'vertraege', false]]);
      const fuer = await x.d.typenFuer(await x.d.rechtepruefung.zugriff({ id: x.jonas.id, rolle: 'mitglied' }));
      assert.deepEqual(fuer.find((y) => y.id === x.typId)!.berechnung, { vertraege: { name: 'Verträge', aktiv: true } });
    });

    it('Oberfläche, API v1, Administratorin und andere Pakete: 400 mit Paketname; unveränderte Werte stören nicht', async () => {
      const x = await aufbau(pg, 'berechnet_schreiben');
      const id = x.mappe.id;
      // Oberfläche (Jonas, Mitglied) – ändern und schon beim Anlegen.
      await assert.rejects(x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id }, body: { werte: { status: 'gekündigt' } } }), fehler(400, /„Status“ berechnet das Paket Verträge/));
      await assert.rejects(x.oberflaeche(x.jonas, 'POST', '/api/mappen', { body: { typId: x.typId, werte: { bezeichnung: 'Handy', kuendigen_bis: '2027-01-01', status: 'x' } } }), (e: unknown) => fehler(400, /Verträge/)(e)
        && JSON.stringify((e as Fachfehler).details) === JSON.stringify({ berechnet: [{ feld: 'kuendigen_bis', label: 'Kündigen bis', paket: 'vertraege', paketName: 'Verträge' }, { feld: 'status', label: 'Status', paket: 'vertraege', paketName: 'Verträge' }] }));
      // Administratorin über die Oberfläche: auch nicht.
      await assert.rejects(x.oberflaeche(x.lena, 'PUT', '/api/mappen/:id', { params: { id }, body: { werte: { aktiv: true } } }), fehler(400, /Läuft/));
      // API v1 mit dem Schlüssel einer Person.
      await assert.rejects(x.api(x.jonas, 'PUT', '/mappen/:id', { params: { id }, body: { werte: { kuendigen_bis: '2027-03-31' } } }), fehler(400, /Kündigen bis.*Verträge/));
      // Ein anderes Paket mit Schreibrecht auf Verträge: nur die eigenen (angekündigten) Felder – die gewöhnlichen gehen.
      await x.installiere(ANDERES);
      await assert.rejects(x.alsPaket('rechnungen', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { status: 'von Rechnungen' } } }), fehler(400, /Verträge/));
      await x.alsPaket('rechnungen', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { bezeichnung: 'Strom Wohnung (Rechnungen)' } } });
      // Wer die ganze Mappe zurückschickt, wie er sie gelesen hat, stört nicht.
      const m = (await x.d.holeMappe(id)).mappe;
      await x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id }, body: { werte: { ...m.werte, bezeichnung: 'Strom' } } });
      assert.equal((await x.d.holeMappe(id)).mappe.werte.bezeichnung, 'Strom');
      // Nichts davon hat einen berechneten Wert gesetzt.
      assert.deepEqual([m.werte.status, m.werte.kuendigen_bis, m.werte.aktiv], [null, null, false]);
    });

    it('das Paket selbst: schon beim Anlegen, beim Ändern – und durch dieselben Prüfungen wie alle (#917, Formular)', async () => {
      const x = await aufbau(pg, 'berechnet_paket');
      const neu = (await x.alsPaket('vertraege', 'POST', '/mappen', { body: { typId: x.typId, werte: { bezeichnung: 'Handy Jonas', status: 'läuft', kuendigen_bis: '2028-02-14', aktiv: true } } })).body as { id: string };
      assert.deepEqual((await x.d.holeMappe(neu.id)).mappe.werte.status, 'läuft');
      const id = x.mappe.id;
      await x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { status: 'läuft – kündigen bis 14.02.2028' } } });
      assert.equal((await x.d.holeMappe(id)).mappe.werte.status, 'läuft – kündigen bis 14.02.2028');
      // Formularprüfung: Länge, Datum.
      await assert.rejects(x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { status: 'x'.repeat(201) } } }), fehler(422));
      await assert.rejects(x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { kuendigen_bis: 'morgen' } } }), fehler(422));
      // Gleichzeitig bearbeiten (#609): Mit altem Stand und einem inzwischen geänderten Feld gewinnt der Mensch (409).
      const stand = (await x.d.holeMappe(id)).mappe.geaendert;
      await x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id }, body: { werte: { bezeichnung: 'Strom neu' } } });
      await assert.rejects(x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { bezeichnung: 'vom Paket' }, stand } }), fehler(409));
      // Rechte: ein Typ ohne Schreibrecht des Pakets.
      const fremd = await x.d.legeTypAn({ name: 'Notiz', felder: [{ key: 'text', label: 'Text', typ: 'text' }] });
      const n = await x.d.legeMappeAn({ typId: fremd.id, werte: { text: 'a' } }, x.lena.id);
      await assert.rejects(x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id: n.id }, body: { werte: { text: 'b' } } }), (e: unknown) => e instanceof Fachfehler && [403, 404].includes(e.status));
    });

    it('nie überschreiben: Automatisierung „Feld ändern“, Frist weiterschieben, „folgt aus“, Erkennung und Vorschläge', async () => {
      const x = await aufbau(pg, 'berechnet_nie');
      const id = x.mappe.id;
      // Automatisierung: Systemkonto über denselben Weg wie die Karte „Feld ändern“.
      const auto = await x.konten.systemkonto?.('automatisierung').catch(() => undefined);
      const z = await x.d.rechtepruefung.zugriff({ id: auto?.id ?? '00000000-0000-4000-8000-0000000000ff', rolle: 'mitglied', art: 'system', systemkonto: 'automatisierung' });
      await assert.rejects(x.d.aendereMappe(id, { werte: { status: 'von der Automatisierung' } }, auto?.id ?? null, z, { automatisierung: 'Test' }), fehler(400, /Verträge/));
      // Erkennung und „Aus Dokument ausfüllen“ fragen berechnete Felder nicht an und nehmen keine Vorschläge dafür.
      const t = await x.typ();
      assert.deepEqual(fuellfelder(t).map((f) => f.feld.key).sort(), ['beginn', 'bezeichnung']);
      assert.deepEqual(Object.keys((schemaFuer(t) as { properties: Record<string, unknown> }).properties).sort(), ['beginn', 'bezeichnung']);
      const v = pruefeVorschlaege(t, { status: { wert: 'gekündigt', sicherheit: 'hoch', fundstelle: '' }, bezeichnung: { wert: 'Strom', sicherheit: 'hoch', fundstelle: '' } });
      assert.deepEqual([Object.keys(v.vorschlaege), v.verworfen.map((y) => y.feld)], [['bezeichnung'], ['status']]);
      const r = await x.d.erkennung.fuerTyp(x.typId, { text: 'Status: gekündigt\nKündigen bis 31.03.2027\nBezeichnung Strom' }, await x.d.rechtepruefung.zugriff({ id: x.jonas.id, rolle: 'mitglied' }));
      assert.ok(!('status' in r.vorschlaege) && !('kuendigen_bis' in r.vorschlaege), 'keine Vorschläge für berechnete Felder');
      // Vorschläge aus der verwiesenen Mappe (#1037) und alle künftigen Wege fragen hier.
      assert.deepEqual(t.felder.filter(vonAussenFuellbar).map((f) => f.key), ['bezeichnung', 'beginn']);
    });

    it('nicht mehr berechnet: Paket ohne Code – letzter Wert bleibt, Feld bleibt gesperrt; freigeben nur mit Verwaltung der Mappentypen', async () => {
      const x = await aufbau(pg, 'berechnet_frei');
      const id = x.mappe.id;
      await x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { status: 'läuft' } } });
      // Das Paket läuft nicht mehr (Code weg): Wert bleibt, Kennzeichnung „nicht mehr berechnet“.
      const ip = (await x.d.kern.repo.listePakete()).find((y) => y.id === 'vertraege')!;
      const ohne = { ...ip, code: false };
      delete ohne.laeufer;
      await x.d.kern.repo.speicherePaket(ohne);
      const z = await x.d.rechtepruefung.zugriff({ id: x.jonas.id, rolle: 'mitglied' });
      assert.deepEqual((await x.d.typenFuer(z)).find((y) => y.id === x.typId)!.berechnung, { vertraege: { name: 'Verträge', aktiv: false } });
      assert.equal(berechnungAktiv(undefined, { schluessel: 'vertraege:vertrag' }), false);
      assert.equal((await x.d.holeMappe(id)).mappe.werte.status, 'läuft');
      await assert.rejects(x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id }, body: { werte: { status: 'anders' } } }), fehler(400));
      // Über die Werkbank lässt sich kein Feld zum berechneten machen – und ohne ausdrückliche Freigabe bleibt es berechnet.
      const t = await x.typ();
      const r = await x.oberflaeche(x.lena, 'PUT', '/api/typen/:id', { params: { id: x.typId }, body: { ...t, felder: t.felder.map((f) => (f.key === 'beginn' ? { ...f, berechnetVon: 'vertraege' } : f.key === 'status' ? Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'berechnetVon')) : f)) } });
      const nach = (r.body as Mappentyp).felder;
      assert.deepEqual(nach.filter((f) => f.berechnetVon).map((f) => f.key), ['kuendigen_bis', 'status', 'aktiv']);
      // „Feld wieder freigeben“ nur in der Werkbank (Route nur für Administratoren).
      assert.equal(x.d && (await import('../src/routen')).routen(x.d, x.konten, {}).find((y) => y.methode === 'PUT' && y.pfad === '/api/typen/:id')!.zugang, 'admin');
      const r2 = await x.oberflaeche(x.lena, 'PUT', '/api/typen/:id', { params: { id: x.typId }, body: { ...t, felder: t.felder.map((f) => (f.key === 'status' ? { ...f, berechnetVon: null } : f)) } });
      assert.deepEqual((r2.body as Mappentyp).felder.filter((f) => f.berechnetVon).map((f) => f.key), ['kuendigen_bis', 'aktiv']);
      await x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id }, body: { werte: { status: 'von Hand' } } });
      assert.equal((await x.d.holeMappe(id)).mappe.werte.status, 'von Hand');
    });

    it('Update: neu berechnet bzw. nicht mehr berechnet; ein Update rechnet wieder', async () => {
      const x = await aufbau(pg, 'berechnet_update');
      const ohne = VERTRAG('false');
      assert.deepEqual([...berechnetAenderung(liesPaket(liesZip(archiv(vertraege({ typen: ohne })))).typen[0], await x.typ(), 'vertraege')], [['kuendigen_bis', null]]);
      await x.installiere(vertraege({ typen: ohne, version: '1.1.0' }));
      assert.deepEqual((await x.typ()).felder.filter((f) => f.berechnetVon).map((f) => f.key), ['status', 'aktiv']);
      await x.installiere(vertraege({ version: '1.2.0' }));
      assert.deepEqual((await x.typ()).felder.filter((f) => f.berechnetVon).map((f) => f.key), ['kuendigen_bis', 'status', 'aktiv']);
    });

    it('Historie ohne Rauschen: Änderungen des Pakets an berechneten Feldern je Mappe und Tag ein Eintrag', async () => {
      const x = await aufbau(pg, 'berechnet_historie');
      const id = x.mappe.id;
      const geaendert = async () => (await x.d.historie(id)).filter((h) => h.art === 'geaendert');
      let gemeldet = 0;
      const ereignis = x.d.kern.ereignis.bind(x.d.kern);
      x.d.kern.ereignis = (async (...a: Parameters<typeof ereignis>) => { if (a[0] === 'mappe.geaendert' && (a[1] as { mappe?: string }).mappe === id) gemeldet++; return ereignis(...a); }) as typeof ereignis;
      await x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { status: 'läuft', aktiv: true } } });
      await x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { status: 'läuft – kündbar ab 01.04.2026' } } });
      await x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { kuendigen_bis: '2027-02-28' } } });
      let h = await geaendert();
      assert.equal(h.length, 1, 'ein Eintrag für den Tag');
      assert.equal(h[0].daten.berechnet, true);
      assert.match(String(h[0].daten.text), /Berechnet vom Paket Verträge/);
      assert.deepEqual(h[0].daten.aenderungen!.map((a) => [a.feld, a.alt, a.neu]), [['status', '', 'läuft – kündbar ab 01.04.2026'], ['aktiv', 'Nein', 'Ja'], ['kuendigen_bis', '', '28.02.2027']]);
      // Das Ereignis „Mappe geändert“ gibt es trotzdem jedes Mal (Automatisierungen, andere Pakete).
      assert.equal(gemeldet, 3);
      // Was am Ende des Tags wieder wie am Morgen ist, fällt heraus.
      await x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { aktiv: false } } });
      h = await geaendert();
      assert.deepEqual(h[0].daten.aenderungen!.map((a) => a.feld), ['status', 'kuendigen_bis']);
      // Ein Mensch bekommt wie bisher seinen eigenen Eintrag – auch am selben Tag.
      await x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id }, body: { werte: { bezeichnung: 'Strom Haus' } } });
      // Gemischt (berechnet und anderes) ist kein reines Rechnen: eigener Eintrag.
      await x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { status: 'endet', bezeichnung: 'Strom Haus (alt)' } } });
      h = await geaendert();
      assert.equal(h.length, 3);
      // Am nächsten Tag: ein neuer Eintrag.
      const echt = Date.now;
      Date.now = () => echt() + 26 * 3600_000;
      const datum = globalThis.Date;
      class Morgen extends datum { constructor(...a: unknown[]) { if (a.length) super(...(a as [string])); else super(echt() + 26 * 3600_000); } static now() { return echt() + 26 * 3600_000; } }
      globalThis.Date = Morgen as DateConstructor;
      try {
        await x.alsPaket('vertraege', 'PUT', '/mappen/:id', { params: { id }, body: { werte: { status: 'beendet' } } });
      } finally { globalThis.Date = datum; Date.now = echt; }
      if (!pg) assert.equal((await geaendert()).length, 4, 'neuer Tag, neuer Eintrag');
    });
  });

  describe(`Hinweise an Mappen (#1034)${wo}`, { skip: pg && !url ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    it('setzen, lesen mit Paketname, ersetzen, entfernen – ohne Änderung an der Mappe', async () => {
      const x = await aufbau(pg, 'hinweise');
      const id = x.mappe.id;
      const vorher = (await x.d.holeMappe(id)).mappe.geaendert;
      const historie = (await x.d.historie(id)).length;
      const r = await x.alsPaket('vertraege', 'PUT', '/mappen/:id/hinweise/:schluessel', { params: { id, schluessel: 'summe' }, body: { text: 'Die Positionen ergeben 118,40 €, die Rechnung sagt 120,80 €.' } });
      assert.deepEqual(Object.fromEntries(Object.entries(r.body as Record<string, unknown>).filter(([k]) => k !== 'gesetzt')), { paket: 'vertraege', paketName: 'Verträge', schluessel: 'summe', text: 'Die Positionen ergeben 118,40 €, die Rechnung sagt 120,80 €.' });
      // Jede Person, die die Mappe lesen darf, sieht ihn – mit dem Namen des Pakets.
      const lesen = await x.oberflaeche(x.jonas, 'GET', '/api/mappen/:id', { params: { id } });
      assert.deepEqual((lesen.body as { hinweise: Array<{ paketName: string; text: string }> }).hinweise.map((h) => [h.paketName, h.text]), [['Verträge', 'Die Positionen ergeben 118,40 €, die Rechnung sagt 120,80 €.']]);
      // Mappe unverändert: kein „zuletzt geändert“, kein Historieneintrag.
      assert.equal((await x.d.holeMappe(id)).mappe.geaendert, vorher);
      assert.equal((await x.d.historie(id)).length, historie);
      // Ersetzen unter demselben Schlüssel; Speichern hindert er nie.
      await x.alsPaket('vertraege', 'PUT', '/mappen/:id/hinweise/:schluessel', { params: { id, schluessel: 'summe' }, body: { text: 'Zeile\nzwei  ' } });
      assert.deepEqual((await x.d.holeMappe(id)).hinweise.map((h) => h.text), ['Zeile zwei']);
      await x.oberflaeche(x.jonas, 'PUT', '/api/mappen/:id', { params: { id }, body: { werte: { bezeichnung: 'trotz Hinweis' } } });
      await x.alsPaket('vertraege', 'DELETE', '/mappen/:id/hinweise/:schluessel', { params: { id, schluessel: 'summe' } });
      assert.deepEqual((await x.d.holeMappe(id)).hinweise, []);
      await x.alsPaket('vertraege', 'DELETE', '/mappen/:id/hinweise/:schluessel', { params: { id, schluessel: 'summe' } });
    });

    it('nur Text, höchstens 300 Zeichen, höchstens 3 je Paket und Mappe; nur Pakete mit dms:hinweise; je Paket eigene Schlüssel', async () => {
      const x = await aufbau(pg, 'hinweise_regeln');
      const id = x.mappe.id;
      const setze = (text: string, schluessel = 'a', paket = 'vertraege') => x.alsPaket(paket, 'PUT', '/mappen/:id/hinweise/:schluessel', { params: { id, schluessel }, body: { text } });
      await assert.rejects(setze('<b>fett</b>'), fehler(400, /ohne HTML/));
      await assert.rejects(setze('Siehe &amp; so'), fehler(400, /ohne HTML/));
      await assert.rejects(setze('Siehe [hier](x)'), fehler(400, /ohne Markdown/));
      await assert.rejects(setze('**wichtig** prüfen'), fehler(400, /ohne Markdown/));
      await assert.rejects(setze('Mehr unter https://example.org'), fehler(400, /keine Links/));
      await assert.rejects(setze('Mehr unter www.example.org'), fehler(400, /keine Links/));
      await assert.rejects(setze('x'.repeat(HINWEIS_MAX + 1)), fehler(400, /höchstens 300 Zeichen/));
      await assert.rejects(setze('   '), fehler(400, /leer/));
      await assert.rejects(setze('gut', 'Gross'), fehler(400, /Kennung/));
      assert.deepEqual(pruefeHinweistext(`${'ä'.repeat(HINWEIS_MAX)}`), { text: 'ä'.repeat(HINWEIS_MAX) });
      assert.deepEqual(pruefeHinweistext('Die Positionen ergeben 118,40 € – 2,40 € zu wenig (3 * 0,80 €).'), { text: 'Die Positionen ergeben 118,40 € – 2,40 € zu wenig (3 * 0,80 €).' });
      for (const k of ['a', 'b', 'c']) await setze(`Hinweis ${k}`, k);
      await assert.rejects(setze('vierter', 'd'), fehler(400, /Höchstens 3 Hinweise/));
      await setze('a ersetzt', 'a');
      // Ein anderes Paket hat eigene Schlüssel – und eigene drei.
      await x.installiere(ANDERES);
      await setze('von Rechnungen', 'a', 'rechnungen');
      await x.alsPaket('rechnungen', 'DELETE', '/mappen/:id/hinweise/:schluessel', { params: { id, schluessel: 'b' } });
      const hinweise = (await x.d.holeMappe(id)).hinweise;
      assert.deepEqual(hinweise.map((h) => `${h.paketName}:${h.schluessel}=${h.text}`).sort(), ['Rechnungen:a=von Rechnungen', 'Verträge:a=a ersetzt', 'Verträge:b=Hinweis b', 'Verträge:c=Hinweis c']);
      // Menschen und Schlüssel von Personen setzen keine Hinweise.
      await assert.rejects(x.api(x.lena, 'PUT', '/mappen/:id/hinweise/:schluessel', { params: { id, schluessel: 'a' }, body: { text: 'von Lena' } }), fehler(403));
      await assert.rejects(x.oberflaeche(x.lena, 'PUT', '/api/mappen/:id/hinweise/:schluessel', { params: { id, schluessel: 'a' }, body: { text: 'von Lena' } }), fehler(403));
      // Ein Paket ohne dms:hinweise.
      const ohne = { ...ANDERES, 'manifest.yaml': ANDERES['manifest.yaml'].replace('id: rechnungen', 'id: rechnen').replace('name: Rechnungen', 'name: Rechnen').replace('    schnittstellen: [dms:hinweise]\n', '') };
      await x.installiere(ohne);
      await assert.rejects(setze('ohne Recht', 'a', 'rechnen'), fehler(403, /dms:hinweise/));
      // Nur an Mappen, die das Paket schreiben darf.
      const fremd = await x.d.legeTypAn({ name: 'Notiz', felder: [{ key: 'text', label: 'Text', typ: 'text' }] });
      const n = await x.d.legeMappeAn({ typId: fremd.id, werte: { text: 'a' } }, x.lena.id);
      await assert.rejects(x.alsPaket('vertraege', 'PUT', '/mappen/:id/hinweise/:schluessel', { params: { id: n.id, schluessel: 'a' }, body: { text: 'nicht hier' } }), (e: unknown) => e instanceof Fachfehler && [403, 404].includes(e.status));
      // Mit dem Paket gehen seine Hinweise.
      await x.p.entferne('rechnen', ICH);
      await x.p.entferne('rechnungen', ICH);
      assert.deepEqual((await x.d.holeMappe(id)).hinweise.map((h) => h.paket), ['vertraege', 'vertraege', 'vertraege']);
      assert.deepEqual(await x.repo.hinweise(id).then((l) => l.filter((h) => h.paket === 'rechnungen')), []);
    });
  });
}

describe('API v1 (#1034)', () => {
  it('Hinweise setzen und entfernen, berechnetVon und hinweise in der Beschreibung', () => {
    const o = openapi('0.231.0') as { paths: Record<string, Record<string, unknown>>; components: { schemas: Record<string, { properties?: Record<string, unknown> }> } };
    assert.ok(o.paths['/mappen/{id}/hinweise/{schluessel}'].put && o.paths['/mappen/{id}/hinweise/{schluessel}'].delete);
    assert.ok(o.components.schemas.Feld.properties!.berechnetVon);
    assert.ok(o.components.schemas.MappeDetails.properties!.hinweise);
    assert.ok(o.components.schemas.PaketHinweis);
  });
});
