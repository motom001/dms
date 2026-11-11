/**
 * Paket-Aktionen im Menü „Mappe“ (#1039): Schreibweise im Manifest und Prüfung beim Installieren, Rechte-Vorschau,
 * Angebot je Person (Schnittmenge aus angekündigten Rechten, Rechten der Person und des Pakets; Bedingung → gesperrt mit
 * Grund; ausgeschaltet; KI-Paket an gesperrtem Typ), Ablauf mit Dialog und Ergebnis, Rechte bei jedem Schritt, Bremse,
 * eingeschränkter Zugriff statt Dienstkonto, Herausgeben als Herunterladen, Historie mit Person und Paket, Kern-Dialog
 * „Brief aus Vorlage“. Der Paket-Läufer ist hier ein Ersatz, der vorgegebene Antworten liefert. Namen sind erfunden.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { AktionsSchritt } from '../../shared/src/paketaktionen';
import type { Regelwerk } from '../../shared/src/rechte';
import { NICHTS } from '../../shared/src/rechte';
import { openapi } from '../src/api-v1';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { Paketlaeufer } from '../src/laeufer/verwaltung';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { beantworteZugang, type AktionsDatei, type Zugangsanfrage } from '../src/paketaktionen';
import { liesAntwort, liesMappenaktionen, pruefeAntworten } from '../src/paketaktionen';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Tresor } from '../src/tresor';
import { zipPuffer } from '../src/zip';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const archiv = (d: Record<string, string | Buffer>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const TYPEN = `- schluessel: vertrag
  name: Vertrag
  felder:
    - { key: bezeichnung, label: Bezeichnung, typ: text, maxLen: 80 }
    - { key: anbieter, label: Anbieter, typ: text, maxLen: 80 }
    - { key: gekuendigt_am, label: Gekündigt am, typ: datum }
    - { key: kundenkennwort, label: Kundenkennwort, typ: passwort }
  register:
    - { key: vertrag, name: Vertrag, art: felder, felder: [bezeichnung, anbieter, gekuendigt_am, kundenkennwort] }
    - { key: dokumente, name: Dokumente, art: dokumente }
    - { key: historie, name: Historie, art: protokoll }
- schluessel: kuendigung
  name: Kündigung
  felder:
    - { key: betreff, label: Betreff, typ: text, maxLen: 80 }
  register:
    - { key: k, name: Kündigung, art: felder, felder: [betreff] }
`;
const AKTIONEN = `mappenaktionen:
  - schluessel: vorlage_hinzufuegen
    name: Vorlage hinzufügen
    mappentypen: [vertrag]
    rechte: [dokument_hinzufuegen]
    dialog: dms:vorlage
    bedingung:
      modus: alle
      bedingungen: [{ art: feld, bedingung: { art: feld, feld: anbieter, op: nichtLeer } }]
      grund: Erst einen Anbieter eintragen
  - schluessel: gekuendigt
    name: Als gekündigt markieren
    mappentypen: [vertrag]
    rechte: [aendern]
  - schluessel: zusammenfassung
    name: Zusammenfassung herunterladen
    mappentypen: [vertrag]
    rechte: [lesen, herausgeben]
  - schluessel: notiz
    name: Notiz als Dokument
    mappentypen: [vertrag]
    rechte: [dokument_hinzufuegen]
  - schluessel: kuendigung_anlegen
    name: Kündigung anlegen
    mappentypen: [vertrag]
    rechte: [mappen_anlegen]
    anlegen: [kuendigung]
`;
const CODE = (rechte = 'lesen: [vertrag, kuendigung]\n    schreiben: [vertrag, kuendigung]\n    dokumente: lesen', netz = '') => `code:\n  sprache: c\n  quelle: code/\n  ereignisse: [mappe.geaendert]\n  mappentypen: [vertrag]\n  rechte:\n    ${rechte}\n${netz}`;
const paket = (o: { version?: string; code?: string; aktionen?: string; id?: string } = {}) => ({
  'manifest.yaml': `schema: 1\nid: ${o.id ?? 'vertraege'}\nname: Verträge\nversion: ${o.version ?? '1.0.0'}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.242.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n${o.code ?? CODE()}${o.aktionen ?? AKTIONEN}`,
  'inhalt/mappentypen.yaml': TYPEN,
  'code/modul.wasm': WASM,
});

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
/** Wie das Paket im Läufer: `zugang` beantwortet Fragen wie der Läufer (beantworteZugang mit den Daten des Schritts). */
type Frage = (a: Zugangsanfrage) => Promise<{ status: number; body: Buffer }>;
type Skript = (eingang: Record<string, unknown>, o: { zugang: Frage; bezeichnung: string }) => Promise<{ ok: boolean; text: string; fehler: string | null }>;

async function aufbau(pg: boolean, name: string, o: { code?: string; aktionen?: string } = {}) {
  const r = pg ? await pgRepos(name) : { repo: speicherRepo(), konto: speicherKontoRepo() };
  const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-aktion-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const konten = new Konten(r.konto, () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const p = new Paketverwaltung(d, { version: () => '0.242.0', abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
  const hochladen = async (dateien: Record<string, string | Buffer>) => p.hochladen(archiv(dateien), ICH);
  const installiere = async (dateien: Record<string, string | Buffer>) => { const h = await hochladen(dateien); return p.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true }, ICH); };
  const v = await installiere(paket(o));
  const konto = await konten.dienstkonto('vertraege', 'Verträge');
  d.kern.paketKonten.set(konto.id, 'vertraege');
  const typId = v.typen.vertrag;
  // Ersatz für den Paket-Läufer: Antworten nach Skript, Aufrufe gezählt.
  const aufrufe: Array<Record<string, unknown>> = [];
  let skript: Skript = async () => ({ ok: true, text: JSON.stringify({ ergebnis: { meldung: 'Erledigt.' } }), fehler: null });
  d.paketaktionen.laeufer = { geladen: () => true, rufe: async (_p, eingang, x) => {
    aufrufe.push(eingang);
    const dateien: AktionsDatei[] = [];
    const r = await skript(eingang, { bezeichnung: x.bezeichnung, zugang: (q) => beantworteZugang(x.zugang, dateien, q, (sha) => d.kern.liesGanz(sha)) });
    return { ...r, dateien };
  } };
  const setzeSkript = (s: Skript) => { skript = s; };
  const tabelle = routen(d, konten, { apiSchluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()) });
  const route = (m: string, pfad: string) => { const x = tabelle.find((y) => y.methode === m && y.pfad === pfad); assert.ok(x, `${m} ${pfad}`); return x!; };
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const oberflaeche = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}) => route(m, pfad).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) } as Anfrage);
  const angebot = async (b: { id: string }, mappeId: string) => (await oberflaeche(b, 'GET', '/api/mappen/:id/paketaktionen', { params: { id: mappeId } })).body as { aktionen: Array<{ schluessel: string; gesperrt?: string; paket: { name: string } }>; eingebautAus: string[] };
  const starte = async (b: { id: string }, mappeId: string, aktion: string) => (await oberflaeche(b, 'POST', '/api/mappen/:id/paketaktionen/:paket/:aktion', { params: { id: mappeId, paket: 'vertraege', aktion } })).body as AktionsSchritt;
  const weiter = async (b: { id: string }, lauf: string, antworten: unknown) => (await oberflaeche(b, 'POST', '/api/paketaktionen/laeufe/:lauf', { params: { lauf }, body: { antworten } })).body as AktionsSchritt;
  // Herausgeben braucht das Exportrecht E – über eine Ansicht mit dem Mappentyp (#723).
  await d.legeSichtAn({ name: 'Verträge', typen: [typId], bedingungen: [] });
  const mappe = await d.mappen.legeMappeAn({ typId, werte: { bezeichnung: 'Strom Wohnung', anbieter: 'Stadtwerke Beispielstadt', kundenkennwort: 'geheim-123' } }, lena.id);
  return { d, p, konten, lena, jonas, typId, kuendigungTyp: v.typen.kuendigung, mappe, aufrufe, setzeSkript, oberflaeche, angebot, starte, weiter, hochladen, installiere, repo: r.repo };
}
const antwort = (x: unknown) => ({ ok: true, text: JSON.stringify(x), fehler: null });
const dialog = { dialog: { titel: 'Kündigung', knopf: 'Markieren', felder: [{ art: 'text', text: 'Wann ist die Kündigung rausgegangen?' }, { art: 'datum', schluessel: 'am', name: 'Gekündigt am', pflicht: true }] }, stand: { zaehler: 1 } };

describe('Paket-Aktionen (#1039): Schreibweise im Manifest', () => {
  it('liest Aktionen und meldet, was nicht passt', () => {
    const ok = liesMappenaktionen([{ schluessel: 'a', name: 'A', mappentypen: ['vertrag'], rechte: ['lesen'] }], { hatCode: true });
    assert.deepEqual(ok.fehler, []);
    assert.deepEqual(ok.aktionen[0].rechte, ['lesen']);
    const f = (x: unknown, hatCode = true) => liesMappenaktionen([x], { hatCode }).fehler.join(' | ');
    assert.match(f({ schluessel: 'a', name: 'A', mappentypen: ['vertrag'], rechte: ['loeschen'] }), /unbekanntes Recht „loeschen“/);
    assert.match(f({ schluessel: 'a', name: 'A', mappentypen: ['vertrag'], rechte: ['lesen'] }, false), /Ohne Code/);
    assert.match(f({ schluessel: 'a', name: 'A', mappentypen: ['vertrag'], rechte: ['aendern'], dialog: 'dms:vorlage' }), /dms:vorlage braucht das Recht dokument_hinzufuegen/);
    assert.match(f({ schluessel: 'a', name: 'A', mappentypen: ['vertrag'], rechte: ['mappen_anlegen'] }), /braucht anlegen/);
    assert.match(f({ schluessel: 'a', name: 'A', mappentypen: ['dms:benutzer'], rechte: ['lesen'] }), /kein Mappentyp eines Pakets/);
    assert.match(f({ schluessel: 'a', name: 'A', mappentypen: ['vertrag'], rechte: ['lesen'], bedingung: { modus: 'alle', bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'x', op: 'nichtLeer' } }] } }), /braucht einen grund/);
    assert.match(f({ schluessel: 'a', name: 'A', mappentypen: ['vertrag'], rechte: ['lesen'], dialog: 'html' }), /dialog „html“ gibt es nicht/);
    // Ohne Code geht ein Kern-Dialog (z. B. ein Paket nur mit Vorlagen).
    assert.deepEqual(liesMappenaktionen([{ schluessel: 'v', name: 'V', mappentypen: ['vertrag'], rechte: ['dokument_hinzufuegen'], dialog: 'dms:vorlage' }], { hatCode: false }).fehler, []);
  });

  it('Paketprüfung: Mappentyp muss es geben, Code muss ihn lesen dürfen', () => {
    const lies = (d: Record<string, string | Buffer>) => liesPaket(liesZip(archiv(d)));
    assert.equal(lies(paket()).mappenaktionen?.length, 5);
    assert.throws(() => lies(paket({ aktionen: 'mappenaktionen:\n  - { schluessel: a, name: A, mappentypen: [rechnung], rechte: [lesen] }\n' })), gruende(/Mappentyp „rechnung“ bringt weder/));
    const nurKuendigung = 'code:\n  sprache: c\n  quelle: code/\n  rechte:\n    lesen: [kuendigung]\n';
    assert.throws(() => lies(paket({ code: nurKuendigung, aktionen: 'mappenaktionen:\n  - { schluessel: a, name: A, mappentypen: [vertrag], rechte: [lesen] }\n' })), gruende(/muss den Mappentyp „vertrag“ lesen dürfen/));
  });

  it('Dialog nur aus Daten: kein Passwort, keine Datei, Texte bereinigt und begrenzt', () => {
    assert.throws(() => liesAntwort(JSON.stringify({ dialog: { felder: [{ art: 'passwort', schluessel: 'pw', name: 'Passwort' }] } })), /passwort/);
    assert.throws(() => liesAntwort(JSON.stringify({ dialog: { felder: [{ art: 'datei', schluessel: 'f', name: 'Datei' }] } })), /datei/);
    assert.throws(() => liesAntwort(JSON.stringify({ dialog: { felder: [] } })), /leer/);
    assert.throws(() => liesAntwort(JSON.stringify({ dialog: { felder: Array.from({ length: 31 }, (_, i) => ({ art: 'haken', schluessel: `h${i}`, name: 'H' })) } })), /höchstens 30/);
    assert.throws(() => liesAntwort(JSON.stringify({ dialog: { felder: [{ art: 'text', text: 'x' }] }, ergebnis: { meldung: 'y' } })), /genau eins/);
    const a = liesAntwort(JSON.stringify({ dialog: { titel: 'T‮est', knopf: 'OK', felder: [{ art: 'text', text: '<b>Bitte</b> erneut anmelden\u0007' }] } }));
    assert.equal(a.art, 'dialog');
    if (a.art === 'dialog') {
      assert.equal(a.dialog.titel, 'Test');
      // Text bleibt Text: Tags stehen als Zeichen da (die Oberfläche setzt nie HTML), Steuerzeichen fallen weg.
      assert.equal(a.dialog.felder[0].text, '<b>Bitte</b> erneut anmelden');
    }
    const d = liesAntwort(JSON.stringify(dialog));
    assert.equal(d.art, 'dialog');
    if (d.art === 'dialog') {
      assert.deepEqual(pruefeAntworten(d.dialog, {}).fehler, { am: 'pflicht' });
      assert.deepEqual(pruefeAntworten(d.dialog, { am: '2026-11-11', fremd: 'x' }).werte, { am: '2026-11-11' });
      assert.deepEqual(pruefeAntworten(d.dialog, { am: '11.11.2026' }).fehler, { am: 'ungueltig' });
    }
  });
});

for (const pg of [false, ...(url ? [true] : [])]) {
  describe(`Paket-Aktionen (#1039) ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'}`, () => {
    it('Installieren: Aktionen am Paket, Rechte-Vorschau nennt jede mit ihren Rechten; Update mit neuen Rechten fragt nach', async () => {
      const t = await aufbau(pg, 'aktionen_install');
      const ip = (await t.d.kern.repo.listePakete()).find((x) => x.id === 'vertraege')!;
      assert.equal(ip.mappenaktionen?.length, 5);
      const v = (await t.hochladen(paket({ version: '1.1.0', aktionen: AKTIONEN.replace('rechte: [lesen, herausgeben]', 'rechte: [lesen, herausgeben, aendern]') }))).vorschau;
      const z = v.aktionen?.find((a) => a.schluessel === 'zusammenfassung');
      assert.deepEqual(z?.rechte, ['lesen', 'herausgeben', 'aendern']);
      assert.equal(z?.neu, true);
      assert.equal(v.aktionen?.find((a) => a.schluessel === 'gekuendigt')?.neu, false);
      assert.deepEqual(z?.typen, ['Vertrag']);
      assert.equal(v.laeufer?.bestaetigen, true);
    });

    it('Angebot: Schnittmenge der Rechte, Bedingung sperrt mit Grund, ausgeschaltet fehlt', async () => {
      const t = await aufbau(pg, 'aktionen_angebot');
      const alle = await t.angebot(t.lena, t.mappe.id);
      assert.deepEqual(alle.aktionen.map((a) => a.schluessel).sort(), ['gekuendigt', 'kuendigung_anlegen', 'notiz', 'vorlage_hinzufuegen', 'zusammenfassung']);
      assert.equal(alle.aktionen[0].paket.name, 'Verträge');
      // Jonas darf nur lesen (und anlegen): Ändern und Dokument hinzufügen fehlen ganz, Lesen bleibt.
      const nurLesen: Regelwerk = { grund: { ...NICHTS, C: true }, regeln: [{ id: 'r', name: 'Lesen', wenn: [{ art: 'benutzer', benutzer: [t.jonas.id] }], dann: { R: 'erteilen' }, stopp: false }, { id: 's', name: 'Lena', wenn: [{ art: 'benutzer', benutzer: [t.lena.id] }], dann: { R: 'erteilen', U: 'erteilen' }, stopp: false }] };
      await t.d.setzeBerechtigungen(t.typId, nurLesen, true);
      const jonas = (await t.angebot(t.jonas, t.mappe.id)).aktionen.map((a) => a.schluessel);
      assert.ok(!jonas.includes('gekuendigt') && !jonas.includes('notiz') && !jonas.includes('vorlage_hinzufuegen'), jonas.join());
      assert.ok(jonas.includes('kuendigung_anlegen'));
      // Bedingung: ohne Anbieter gesperrt mit Grund – Start antwortet 409 mit dem Grund.
      await t.d.mappen.aendereMappe(t.mappe.id, { werte: { anbieter: '' } }, t.lena.id);
      assert.equal((await t.angebot(t.lena, t.mappe.id)).aktionen.find((a) => a.schluessel === 'vorlage_hinzufuegen')?.gesperrt, 'Erst einen Anbieter eintragen');
      await assert.rejects(t.starte(t.lena, t.mappe.id, 'vorlage_hinzufuegen'), fehler(409, /Anbieter/));
      // In den Einstellungen des Pakets ausgeschaltet: weg, auch beim Start; eingebaute an einer Stelle.
      await t.oberflaeche(t.lena, 'PUT', '/api/werkbank/pakete/:id/mappenaktionen', { params: { id: 'vertraege' }, body: { aus: ['notiz'] } });
      await t.oberflaeche(t.lena, 'PUT', '/api/werkbank/pakete/mappenaktionen', { body: { eingebautAus: ['email', 'link'] } });
      const danach = await t.angebot(t.lena, t.mappe.id);
      assert.ok(!danach.aktionen.some((a) => a.schluessel === 'notiz'));
      assert.deepEqual(danach.eingebautAus, ['email', 'link']);
      await assert.rejects(t.starte(t.lena, t.mappe.id, 'notiz'), fehler(404));
      await assert.rejects(t.oberflaeche(t.lena, 'PUT', '/api/werkbank/pakete/mappenaktionen', { body: { eingebautAus: ['loeschen'] } }), fehler(422));
    });

    it('Paket ohne Schreibrecht: Ändern fehlt auch für Lena; KI-Paket bietet an gesperrten Typen nichts an', async () => {
      const t = await aufbau(pg, 'aktionen_paketrechte', { code: CODE('lesen: [vertrag]\n    dokumente: keine') , aktionen: 'mappenaktionen:\n  - { schluessel: gekuendigt, name: Markieren, mappentypen: [vertrag], rechte: [aendern] }\n  - { schluessel: lesen, name: Lesen, mappentypen: [vertrag], rechte: [lesen] }\n' });
      assert.deepEqual((await t.angebot(t.lena, t.mappe.id)).aktionen.map((a) => a.schluessel), ['lesen']);
      await assert.rejects(t.starte(t.lena, t.mappe.id, 'gekuendigt'), fehler(403));
      const ki = await aufbau(pg, 'aktionen_ki', { code: CODE('lesen: [vertrag]\n    dokumente: keine', '  netz: [https://ki.example.org]\n'), aktionen: 'mappenaktionen:\n  - { schluessel: lesen, name: Lesen, mappentypen: [vertrag], rechte: [lesen] }\n' });
      assert.deepEqual((await ki.angebot(ki.lena, ki.mappe.id)).aktionen, []);
      await assert.rejects(ki.starte(ki.lena, ki.mappe.id, 'lesen'), fehler(403));
      assert.equal(ki.aufrufe.length, 0);
    });

    it('Ablauf: Dialog, Antwort, Ergebnis – mit dem Zugriff der Person, Historie nennt Person und Paket', async () => {
      const t = await aufbau(pg, 'aktionen_ablauf');
      t.setzeSkript(async (e) => (e.schritt === 1 ? antwort(dialog) : antwort({ ergebnis: { meldung: 'Als gekündigt markiert.', felder: { gekuendigt_am: (e.antworten as { am: string }).am } } })));
      const s1 = await t.starte(t.lena, t.mappe.id, 'gekuendigt');
      assert.ok('dialog' in s1);
      assert.equal(s1.paket.name, 'Verträge');
      // Das Paket bekommt die Kennung des Laufs und die Mappe – ohne Passwortfelder.
      const e1 = t.aufrufe[0];
      assert.equal(e1.aktion, 'dms:mappenaktion');
      assert.equal(e1.kennung, s1.lauf);
      assert.equal((e1.mappe as { werte: Record<string, unknown> }).werte.anbieter, 'Stadtwerke Beispielstadt');
      assert.ok(!('kundenkennwort' in (e1.mappe as { werte: Record<string, unknown> }).werte));
      await assert.rejects(t.weiter(t.lena, s1.lauf, {}), fehler(422));
      // Ein fremder Lauf gibt es für Jonas nicht.
      await assert.rejects(t.weiter(t.jonas, s1.lauf, { am: '2026-11-11' }), fehler(404));
      const s2 = await t.weiter(t.lena, s1.lauf, { am: '2026-11-11' });
      assert.ok('ergebnis' in s2);
      assert.equal(s2.ergebnis.meldung, 'Als gekündigt markiert.');
      assert.deepEqual(s2.ergebnis.geaendert, ['Gekündigt am']);
      assert.deepEqual(t.aufrufe[1].stand, { zaehler: 1 });
      const m = (await t.d.kern.repo.holeMappe(t.mappe.id))!;
      assert.equal(m.werte.gekuendigt_am, '2026-11-11');
      assert.equal(m.geaendertVon, t.lena.id);
      const h = await t.d.mappenHistorie.historie(t.mappe.id);
      const eintrag = h.find((x) => x.art === 'paketaktion');
      assert.equal(eintrag?.benutzerId, t.lena.id);
      assert.equal(eintrag?.daten.paket, 'vertraege');
      assert.match(String(eintrag?.daten.text), /Als gekündigt markieren.*Verträge/);
      assert.match(String(h.find((x) => x.art === 'geaendert')?.daten.text), /Verträge/);
      // Lauf zu Ende.
      await assert.rejects(t.weiter(t.lena, s1.lauf, { am: '2026-11-12' }), fehler(404));
    });

    it('Rechte bei jedem Schritt; Mappe nie aus der Antwort; Nicht-Angekündigtes ändert nichts', async () => {
      const t = await aufbau(pg, 'aktionen_schritt');
      const andere = await t.d.mappen.legeMappeAn({ typId: t.typId, werte: { bezeichnung: 'Gas' } }, t.lena.id);
      t.setzeSkript(async (e) => (e.schritt === 1 ? antwort(dialog) : antwort({ ergebnis: { meldung: 'ok', mappe: andere.id, felder: { gekuendigt_am: '2026-01-01' } } })));
      const s1 = await t.starte(t.lena, t.mappe.id, 'gekuendigt');
      const s2 = await t.weiter(t.lena, s1.lauf, { am: '2026-11-11' });
      assert.ok('ergebnis' in s2);
      assert.ok(!(await t.d.kern.repo.holeMappe(andere.id))!.werte.gekuendigt_am);
      assert.equal((await t.d.kern.repo.holeMappe(t.mappe.id))!.werte.gekuendigt_am, '2026-01-01');
      // Zwischen Start und Antwort verliert Lena das Recht zu ändern → 403 beim nächsten Schritt.
      const s3 = await t.starte(t.lena, t.mappe.id, 'gekuendigt');
      await t.d.setzeBerechtigungen(t.typId, { grund: { ...NICHTS, R: true, C: true }, regeln: [] }, true);
      await assert.rejects(t.weiter(t.lena, s3.lauf, { am: '2026-11-11' }), fehler(403));
      // Eine Lese-Aktion, die Felder schreiben will: 502, nichts geändert.
      t.setzeSkript(async () => antwort({ ergebnis: { meldung: 'x', felder: { bezeichnung: 'Gekapert' } } }));
      await assert.rejects(t.starte(t.lena, t.mappe.id, 'zusammenfassung'), fehler(502, /nicht angekündigt/));
      assert.equal((await t.d.kern.repo.holeMappe(t.mappe.id))!.werte.bezeichnung, 'Strom Wohnung');
    });

    it('Höchstens zwei Dialoge; ungültige Antwort und Zeitgrenze mit verständlicher Meldung', async () => {
      const t = await aufbau(pg, 'aktionen_grenzen');
      t.setzeSkript(async () => antwort(dialog));
      const s1 = await t.starte(t.lena, t.mappe.id, 'gekuendigt');
      const s2 = await t.weiter(t.lena, s1.lauf, { am: '2026-11-11' });
      assert.ok('dialog' in s2);
      await assert.rejects(t.weiter(t.lena, s2.lauf, { am: '2026-11-11' }), fehler(502, /mehr als 2 Rückfragen/));
      t.setzeSkript(async () => antwort({ dialog: { felder: [{ art: 'passwort', schluessel: 'pw', name: 'Bitte erneut anmelden' }] } }));
      await assert.rejects(t.starte(t.lena, t.mappe.id, 'gekuendigt'), fehler(502, /keine gültige Antwort/));
      t.setzeSkript(async () => ({ ok: false, text: '', fehler: 'Keine Antwort innerhalb von 30000 ms.' }));
      await assert.rejects(t.starte(t.lena, t.mappe.id, 'gekuendigt'), fehler(503, /antwortet gerade nicht/));
    });

    it('Bremse: höchstens ein laufender Ablauf je Person und Paket', async () => {
      const t = await aufbau(pg, 'aktionen_bremse');
      let los!: () => void, drin!: () => void;
      const warten = new Promise<void>((ok) => { los = ok; });
      const imSkript = new Promise<void>((ok) => { drin = ok; });
      t.setzeSkript(async () => { drin(); await warten; return antwort({ ergebnis: { meldung: 'fertig' } }); });
      const erster = t.starte(t.lena, t.mappe.id, 'zusammenfassung');
      // Erst prüfen, wenn der erste Ablauf wirklich läuft – eine feste Wartezeit reichte mit PostgreSQL in der CI nicht.
      await Promise.race([imSkript, erster]);
      await assert.rejects(t.starte(t.lena, t.mappe.id, 'gekuendigt'), fehler(429));
      los();
      assert.ok('ergebnis' in await erster);
      // Danach geht es wieder.
      assert.ok('ergebnis' in await t.starte(t.lena, t.mappe.id, 'zusammenfassung'));
    });

    it('Eingeschränkter Zugriff: nur diese Mappe, ihre Dokumente, Dateien ablegen; neues Dokument wie ein Upload', async () => {
      const t = await aufbau(pg, 'aktionen_zugang');
      const fremd = await t.d.mappen.legeMappeAn({ typId: t.typId, werte: { bezeichnung: 'Gas' } }, t.lena.id);
      const fremdDok = (await t.d.dokumente.ladeHoch(fremd.id, { register: 'dokumente', name: 'gas.txt', typ: 'text/plain' }, Buffer.from('Gas'), t.lena.id)).dokument;
      const eigenDok = (await t.d.dokumente.ladeHoch(t.mappe.id, { register: 'dokumente', name: 'strom.txt', typ: 'text/plain' }, Buffer.from('Strom'), t.lena.id)).dokument;
      const gesehen: Record<string, number> = {};
      t.setzeSkript(async (_e, o) => {
        const q = async (methode: string, pfad: string, body?: Buffer) => { const r = await o.zugang({ methode, pfad, ...(body ? { body } : {}) }); gesehen[`${methode} ${pfad}`] = r.status; return r; };
        const m = JSON.parse((await q('GET', '/mappe')).body.toString()) as { werte: Record<string, unknown>; dokumente: unknown[] };
        assert.ok(!('kundenkennwort' in m.werte));
        assert.equal(m.dokumente.length, 1);
        assert.equal((await q('GET', `/dokumente/${eigenDok.id}`)).body.toString(), 'Strom');
        await q('GET', `/dokumente/${fremdDok.id}`);
        await q('GET', `/mappen/${fremd.id}`);
        await q('PUT', `/mappen/${fremd.id}`);
        const d1 = JSON.parse((await q('POST', '/dateien?name=Notiz.txt&typ=text/plain', Buffer.from('Notiz zum Vertrag'))).body.toString()) as { datei: string };
        return antwort({ ergebnis: { meldung: 'Notiz als Dokument hinzugefügt.', dokument: { datei: d1.datei } } });
      });
      const s = await t.starte(t.lena, t.mappe.id, 'notiz');
      assert.deepEqual(gesehen, { 'GET /mappe': 200, [`GET /dokumente/${eigenDok.id}`]: 200, [`GET /dokumente/${fremdDok.id}`]: 404, [`GET /mappen/${fremd.id}`]: 403, [`PUT /mappen/${fremd.id}`]: 403, 'POST /dateien?name=Notiz.txt&typ=text/plain': 201 });
      assert.ok('ergebnis' in s);
      const neu = (await t.d.kern.repo.listeDokumente(t.mappe.id)).find((x) => x.id === s.ergebnis.dokument?.id)!;
      assert.equal(neu.name, 'Notiz.txt');
      assert.equal(neu.herkunft, 'paket');
      assert.equal(neu.erstelltVon, t.lena.id);
      // Ein kaputtes PDF kommt nicht in die Ablage.
      t.setzeSkript(async (_e, o) => {
        const d1 = JSON.parse((await o.zugang({ methode: 'POST', pfad: '/dateien?name=k.pdf&typ=application/pdf', body: Buffer.from('%PDF-1.7 kaputt') })).body.toString()) as { datei: string };
        return antwort({ ergebnis: { meldung: 'x', dokument: { datei: d1.datei } } });
      });
      await assert.rejects(t.starte(t.lena, t.mappe.id, 'notiz'), fehler(422, /kein lesbares PDF/));
    });

    it('Mappen anlegen nur im angekündigten Typ; Herausgeben wie Herunterladen', async () => {
      const t = await aufbau(pg, 'aktionen_anlegen');
      t.setzeSkript(async () => antwort({ ergebnis: { meldung: 'angelegt', mappen: [{ typ: 'kuendigung', werte: { betreff: 'Kündigung Strom' } }] } }));
      const s = await t.starte(t.lena, t.mappe.id, 'kuendigung_anlegen');
      assert.ok('ergebnis' in s);
      assert.equal(s.ergebnis.mappen?.[0].typId, t.kuendigungTyp);
      t.setzeSkript(async () => antwort({ ergebnis: { meldung: 'x', mappen: [{ typ: 'vertrag', werte: { bezeichnung: 'Neu' } }] } }));
      await assert.rejects(t.starte(t.lena, t.mappe.id, 'kuendigung_anlegen'), fehler(502, /nicht angekündigt/));
      // Herausgeben: Datei abholen ist Herunterladen – als Anhang, danach ist der Lauf zu Ende.
      t.setzeSkript(async (_e, o) => {
        const d1 = JSON.parse((await o.zugang({ methode: 'POST', pfad: '/dateien?name=Zusammenfassung.txt&typ=text/plain', body: Buffer.from('Strom Wohnung, Stadtwerke Beispielstadt') })).body.toString()) as { datei: string };
        return antwort({ ergebnis: { meldung: 'Zusammenfassung bereit.', herausgeben: { datei: d1.datei } } });
      });
      const z = await t.starte(t.lena, t.mappe.id, 'zusammenfassung');
      assert.ok('ergebnis' in z);
      assert.deepEqual(z.ergebnis.datei, { name: 'Zusammenfassung.txt', groesse: 39 });
      const datei = await t.oberflaeche(t.lena, 'POST', '/api/paketaktionen/laeufe/:lauf/datei', { params: { lauf: z.lauf } }) as unknown as { datei: { name: string; anzeigen: boolean; inhalt: Buffer } };
      assert.equal(datei.datei.anzeigen, false);
      assert.equal(datei.datei.inhalt.toString(), 'Strom Wohnung, Stadtwerke Beispielstadt');
      await assert.rejects(t.oberflaeche(t.lena, 'POST', '/api/paketaktionen/laeufe/:lauf/datei', { params: { lauf: z.lauf } }), fehler(404));
    });

    it('Kern-Dialog „Brief aus Vorlage“: nur Vorlagen dieses Pakets, Historie mit Person und Paket', async () => {
      const t = await aufbau(pg, 'aktionen_kern');
      const s = await t.starte(t.lena, t.mappe.id, 'vorlage_hinzufuegen');
      assert.ok('kern' in s);
      assert.equal(s.kern, 'dms:vorlage');
      assert.equal(t.aufrufe.length, 0, 'ohne Code des Pakets');
      const h = { ich: { id: t.lena.id, rolle: 'mitglied', name: 'Lena' }, z: await t.d.rechtepruefung.zugriff({ id: t.lena.id, rolle: 'mitglied' }) };
      await assert.rejects(t.d.paketaktionen.vorlageLauf(h, s.lauf, t.mappe.id, null, false), fehler(404));
      await assert.rejects(t.d.paketaktionen.vorlageLauf(h, s.lauf, t.mappe.id, 'vertraege', true), fehler(403));
      await t.d.paketaktionen.vorlageLauf(h, s.lauf, t.mappe.id, 'vertraege', false);
      const dok = (await t.d.dokumente.ladeHoch(t.mappe.id, { register: 'dokumente', name: 'Kündigung.pdf', typ: 'application/pdf' }, Buffer.from('x'), t.lena.id)).dokument;
      await t.d.paketaktionen.vorlageErledigt(h, s.lauf, { dokument: dok });
      const e = (await t.d.mappenHistorie.historie(t.mappe.id)).find((x) => x.art === 'paketaktion');
      assert.equal(e?.daten.dokument, 'Kündigung.pdf');
      assert.equal(e?.benutzerId, t.lena.id);
    });

    it('Pakete selbst lösen keine Aktion aus; die API v1 beschreibt die Routen', async () => {
      const t = await aufbau(pg, 'aktionen_api');
      const konto = await t.konten.dienstkonto('vertraege', 'Verträge');
      const tabelle = routen(t.d, t.konten, {});
      const r = tabelle.find((x) => x.methode === 'POST' && x.pfad === '/api/mappen/:id/paketaktionen/:paket/:aktion')!;
      await assert.rejects(r.handler({ body: {}, params: { id: t.mappe.id, paket: 'vertraege', aktion: 'gekuendigt' }, query: {}, ip: '1', benutzer: { ...konto, art: 'dienst', paketId: 'vertraege' } } as unknown as Anfrage), fehler(403));
      const pfade = Object.keys((openapi('0.242.0') as unknown as { paths: Record<string, unknown> }).paths);
      for (const p of ['/mappen/{id}/paketaktionen', '/mappen/{id}/paketaktionen/{paket}/{aktion}', '/paketaktionen/laeufe/{lauf}', '/paketaktionen/laeufe/{lauf}/datei']) assert.ok(pfade.includes(p), p);
    });
  });
}

describe('Paket-Läufer (#1039): Fragen aus einer Aktion gehen nie ans Dienstkonto', () => {
  it('mit Aufruf-Nummer an den eingeschränkten Zugriff, Speicher nur lesen; ohne wie bisher', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
    const api: Array<string> = [];
    const l = new Paketlaeufer({ dienst: d, konten, schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()), api: async (a) => { api.push(a.pfad); return { status: 200, kopf: {}, body: Buffer.from('dienstkonto') }; },
      einstellungen: async () => ({}), speicher: { lies: async () => ({ k: 'v' }), schreibe: async () => {} } });
    assert.ok(d.paketaktionen.laeufer, 'Der Läufer meldet sich bei den Paket-Aktionen an');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Innenleben des Läufers für den Test
    const innen = l as any;
    const dateien: AktionsDatei[] = [];
    innen.zugaenge.set(7, { paket: 'vertraege', zugang: { mappe: { id: 'm1', werte: { bezeichnung: 'Strom' } }, dokumente: {} }, dateien });
    const enc = (s: string) => new TextEncoder().encode(s);
    const frage = (methode: string, pfad: string, body?: Uint8Array) => innen.beantworte('vertraege', { art: 'api', json: JSON.stringify({ methode, pfad }), ...(body ? { body } : {}) }, 7);
    assert.equal((await frage('get', '/mappen')).status, 403);
    assert.equal((await frage('GET', '/mappe')).status, 200);
    assert.deepEqual(JSON.parse(new TextDecoder().decode((await frage('GET', '/mappe')).body)), { id: 'm1', werte: { bezeichnung: 'Strom' } });
    assert.equal((await frage('GET', '/dokumente/00000000-0000-4000-8000-000000000001')).status, 404);
    assert.equal((await frage('POST', '/dateien?name=a.txt&typ=text/plain', enc('A'))).status, 201);
    assert.equal(dateien[0].name, 'a.txt');
    assert.deepEqual(api, []);
    assert.equal((await innen.beantworte('vertraege', { art: 'speicher_schreiben', schluessel: 'k', wert: enc('x') }, 7)).status, 403);
    assert.equal((await innen.beantworte('vertraege', { art: 'speicher_lesen', schluessel: 'k' }, 7)).status, 200);
    // Anderes Paket mit derselben Nummer: abgelehnt.
    assert.equal((await innen.beantworte('rechnungen', { art: 'api', json: JSON.stringify({ pfad: '/mappen' }) }, 7)).status, 403);
    // Ohne Aufruf einer Aktion: wie bisher über das Dienstkonto (hier ohne Schlüssel → 401).
    assert.equal((await innen.beantworte('vertraege', { art: 'api', json: JSON.stringify({ pfad: '/mappen' }) }, 8)).status, 401);
  });
});
