/** Sicherung (#103–#105): anlegen, Liste, Prüfsumme, Zeitplan, Aufbewahrung, Speicherplatz, Hinweise. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Datenquelle } from '../src/datenbankabzug';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { protokoll } from '../src/protokoll';
import { behalten, bereinigePlan, isoWoche, ortszeit, PLAN_STANDARD, Sicherung, type Metadaten } from '../src/sicherung';
import { liesSicherung, sammle, ZWECK } from '../src/sicherungsformat';
import { leiteAb, Tresor } from '../src/tresor';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';

function falscheDaten(): Datenquelle {
  return {
    async imSchnappschuss(f) {
      return f({
        postgres: '17.0', migrationen: ['001_a.sql', '002_b.sql'], tabellen: [{ name: 'mappen', spalten: ['id', 'titel'] }, { name: 'sitzungen', spalten: ['x'] }],
        zaehler: { mappen: 2, dokumente: 1, benutzer: 1 },
        inhalt: async () => (async function* () { yield Buffer.from('1\tA\n2\tB\n'); })(),
      });
    },
    async groesse() { return 4096; },
  };
}

async function aufbau(opt: { jetzt?: () => Date; daten?: Datenquelle; wartung?: () => boolean } = {}) {
  const wurzel = await mkdtemp(join(tmpdir(), 'dms-sich-'));
  const einstellungen = speicherEinstellungen();
  const tresor = new Tresor(einstellungen, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
  await tresor.laden();
  await tresor.erzeuge();
  const dateien = join(wurzel, 'files');
  await mkdir(join(dateien, HAUSHALT, 'ab'), { recursive: true });
  await writeFile(join(dateien, HAUSHALT, 'ab', 'abcdef'), 'Inhalt eines Dokuments');
  await mkdir(join(dateien, HAUSHALT, 'designs'), { recursive: true });
  await writeFile(join(dateien, HAUSHALT, 'designs', 'logo'), 'LOGO');
  await writeFile(join(dateien, HAUSHALT, 'ab', 'halb.123.tmp'), 'halb geschrieben');
  const mails: string[] = [];
  const s = new Sicherung(join(wurzel, 'sicherung'), dateien, HAUSHALT, {
    tresor, einstellungen, daten: opt.daten ?? falscheDaten(),
    umgebung: async () => ({ dms: '0.20.0', node: '22', system: 'Linux', architektur: 'x64' }),
    wartungAktiv: opt.wartung, anAdmins: async (b) => { mails.push(b); }, mountinfo: '/gibt-es-nicht', jetzt: opt.jetzt,
  });
  return { s, tresor, einstellungen, wurzel, mails };
}

describe('Sicherung (#103–#105)', () => {
  it('legt eine verschlüsselte Sicherung mit Metadaten an; ohne Sitzungen, mit allen Dateien', async () => {
    const { s, tresor } = await aufbau();
    const vorher = protokoll.letzteNr;
    const { fertig } = await s.starte('manuell', 'admin@example.org');
    const meta = (await fertig)!;
    assert.ok(meta, JSON.stringify(s.aktuellerLauf()));
    assert.equal(meta.haushaltId, HAUSHALT);
    assert.equal(meta.verschluesselung.fingerabdruck, tresor.fingerabdruck);
    assert.equal(meta.umgebung.datenbankStand, '002_b.sql');
    assert.deepEqual(meta.anzahl, { mappen: 2, dokumente: 1, benutzer: 1, dateien: 2, tabellen: 1 });
    const namen = (await readdir(s.ordner)).sort();
    assert.equal(namen.length, 2, namen.join(', '));
    assert.ok(namen.some((n) => n.endsWith('.json')) && namen.some((n) => n.endsWith('.dms-sicherung')));
    const json = JSON.parse(await readFile(join(s.ordner, namen.find((n) => n.endsWith('.json'))!), 'utf8')) as Metadaten;
    assert.equal(json.sha256, meta.sha256);
    assert.ok(!JSON.stringify(json).includes(tresor.alsText()!), 'der Schlüssel steht nicht in den Metadaten');

    // Lesen mit dem abgeleiteten Schlüssel: Inhaltsangabe, Tabelle, Dateien, Ende.
    const arten: string[] = []; const pfade: string[] = []; let tabelle = '';
    for await (const e of liesSicherung(join(s.ordner, meta.datei), leiteAb(Buffer.from(tresor.alsText()!, 'base64url'), ZWECK))) {
      arten.push(e.art);
      const d = await sammle(e.daten);
      if (e.art === 'T') tabelle = `${e.kopf.tabelle}:${d}`;
      if (e.art === 'D') pfade.push(`${e.kopf.pfad}=${d}`);
    }
    assert.deepEqual(arten, ['M', 'T', 'D', 'D', 'E']);
    assert.equal(tabelle, 'mappen:1\tA\n2\tB\n', 'sitzungen ohne Inhalt');
    assert.deepEqual(pfade, ['ab/abcdef=Inhalt eines Dokuments', 'designs/logo=LOGO']);
    const texte = protokoll.eintraege({ seit: vorher, modul: 'sicherung' }).map((e) => e.text);
    assert.ok(texte.includes('Sicherung begonnen') && texte.includes('Sicherung fertig'), texte.join(' | '));

    // Liste und Prüfsumme
    const liste = await s.liste();
    assert.equal(liste.length, 1);
    assert.equal(liste[0].meta?.art, 'manuell');
    s.pruefe(liste[0].name, 'admin');
    while (s.laeuft()) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(s.aktuellerLauf()?.ergebnis, { ok: true });
    const datei = join(s.ordner, meta.datei);
    const b = await readFile(datei); b[b.length - 1] ^= 1; await writeFile(datei, b);
    s.pruefe(liste[0].name, 'admin');
    while (s.laeuft()) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(s.aktuellerLauf()?.ergebnis, { ok: false });
    assert.equal((await s.liste())[0].pruefung?.ok, false);
  });

  it('ohne Schlüssel keine Sicherung; bei zu wenig Platz auch nicht', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-sich-'));
    const t = new Tresor(speicherEinstellungen(), join(wurzel, 'k'), () => null);
    await t.laden();
    const s = new Sicherung(join(wurzel, 's'), join(wurzel, 'f'), HAUSHALT, { tresor: t, einstellungen: speicherEinstellungen(), daten: falscheDaten(), umgebung: async () => ({ dms: '', node: '', system: '', architektur: '' }) });
    await assert.rejects(s.starte('manuell', 'x'), (e: unknown) => e instanceof Fachfehler && e.status === 409 && /Verschlüsselung/.test(e.message));
    const { s: s2, einstellungen } = await aufbau();
    await einstellungen.schreibe('sicherung_plan', { ...PLAN_STANDARD, mindestFreiGB: 100_000 });
    await assert.rejects(s2.starte('manuell', 'x'), /Zu wenig freier Speicherplatz/);
    assert.match((await s2.zustand()).fehler!.grund, /Speicherplatz/);
  });

  it('behält je Tag, Woche und Monat die neueste Sicherung (7/4/12)', () => {
    const liste = Array.from({ length: 120 }, (_, i) => ({ name: `s${i}`, beginn: new Date(Date.UTC(2026, 9, 29, 1) - i * 24 * 3600 * 1000).toISOString() }));
    const bleibt = behalten(liste, { taeglich: 7, woechentlich: 4, monatlich: 12 });
    for (let i = 0; i < 7; i++) assert.ok(bleibt.has(`s${i}`), `Tag ${i}`);
    assert.ok(bleibt.size <= 7 + 4 + 12 && bleibt.size >= 10, String(bleibt.size));
    assert.ok(bleibt.has('s59') && bleibt.has('s90'), 'je Monat die neueste: 31.08. und 31.07.');
    assert.equal(isoWoche('2026-01-01'), '2026-W01');
    assert.equal(isoWoche('2027-01-01'), '2026-W53');
    assert.deepEqual(ortszeit(new Date('2026-10-29T01:30:00Z')), { datum: '2026-10-29', uhr: '02:30', wochentag: 4 });
  });

  it('prüft den Zeitplan und schaltet ihn erst nach dem Notfallblatt ein', async () => {
    assert.throws(() => bereinigePlan({ uhrzeit: '25:00' }), /HH:MM/);
    assert.throws(() => bereinigePlan({ aufbewahrung: { taeglich: -1 } }), /zwischen/);
    let jetzt = new Date('2026-10-29T00:30:00Z'); // 01:30 deutscher Zeit
    let wartung = false;
    const { s, mails } = await aufbau({ jetzt: () => jetzt, wartung: () => wartung });
    await assert.rejects(s.speicherePlan({ aktiv: true }, 'admin'), /Notfallblatt/);
    await s.notfallblattErstellt('admin');
    assert.ok((await s.notfallblatt()).aktuell);
    await s.speicherePlan({ aktiv: true, uhrzeit: '02:00', aufbewahrung: { taeglich: 2, woechentlich: 0, monatlich: 0 } }, 'admin');
    assert.equal(await s.tick(), 'nichts', 'noch nicht 02:00');
    jetzt = new Date('2026-10-29T01:05:00Z');
    wartung = true;
    assert.equal(await s.tick(), 'nichts', 'pausiert im Wartungsmodus');
    wartung = false;
    assert.equal(await s.tick(), 'gestartet');
    while (s.laeuft()) await new Promise((r) => setTimeout(r, 10));
    assert.equal(await s.tick(), 'nichts', 'nur einmal am Tag');
    // Zwei weitere Tage: es bleiben die zwei neuesten.
    for (const iso of ['2026-10-30T01:05:00Z', '2026-10-31T01:05:00Z']) {
      jetzt = new Date(iso);
      assert.equal(await s.tick(), 'gestartet');
      while (s.laeuft()) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 20));
    }
    const liste = await s.liste();
    assert.deepEqual(liste.map((x) => x.meta?.beginn.slice(0, 10)), ['2026-10-31', '2026-10-30']);
    assert.deepEqual(mails, [], 'alles in Ordnung: keine Mail');
    // Vier Tage später ohne Sicherung: einmal eine Mail.
    await s.speicherePlan({ uhrzeit: '23:59' }, 'admin');
    jetzt = new Date('2026-11-04T10:00:00Z');
    await s.tick(); await s.tick();
    assert.deepEqual(mails, ['DMS: Die letzte Sicherung ist zu alt']);
    const sp = await s.speicher();
    assert.equal(sp.anzahl, 2);
    assert.equal(sp.dateien, 2);
    assert.equal(sp.datenbankBytes, 4096);
    assert.equal(sp.hochrechnung.stueck, 2);
  });

  it('meldet eine fehlgeschlagene Sicherung einmal', async () => {
    const kaputt: Datenquelle = { ...falscheDaten(), async imSchnappschuss() { throw new Error('Datenbank weg'); } };
    const { s, mails } = await aufbau({ daten: kaputt });
    const { fertig } = await s.starte('manuell', 'admin');
    assert.equal(await fertig, null);
    assert.equal(s.aktuellerLauf()?.status, 'fehler');
    assert.deepEqual(await readdir(s.ordner), [], 'keine halben Dateien');
    await s.melde(); await s.melde();
    assert.deepEqual(mails, ['DMS: Sicherung fehlgeschlagen']);
    assert.equal((await s.zustand()).fehler?.grund, 'Datenbank weg');
  });
});

/* ---------- Gegen PostgreSQL: echter Schnappschuss ---------- */

const url = process.env.TEST_DATABASE_URL;
describe('Sicherung mit PostgreSQL', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let haupt: any; let sql: any;
  const db = `dms_sicherung_${process.pid}`;
  before(async () => {
    const { verbinde } = await import('../src/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
  });
  after(async () => {
    await sql?.end();
    await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt?.end();
  });

  it('sichert alle Tabellen in einem Schnappschuss, Eltern vor Kindern, ohne Sitzungen', async () => {
    const { fileURLToPath } = await import('node:url');
    const { migriere } = await import('../src/db');
    const { pgDatenquelle, tabellenIn } = await import('../src/datenbankabzug');
    const { pgRepo } = await import('../src/repo-pg');
    const { Dienst } = await import('../src/dienst');
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const { ladeBeispiele } = await import('../src/beispiele');
    const { pgEinstellungen: pgBetriebSpeicher } = await import('../src/einstellungen');
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-sich-pg-'));
    const d = new Dienst(pgRepo(sql, HAUSHALT), ordnerSpeicher(join(wurzel, 'files'), HAUSHALT), { einstellungen: pgBetriebSpeicher(sql, HAUSHALT) });
    await ladeBeispiele(d, null);
    // Eine Mappe mit Register „dokumente“ (Vertragspartner); die Ablageorte haben keins.
    const partner = (await d.listeTypen()).find((t) => t.name === 'Vertragspartner')!;
    const m = (await d.listeMappen(partner.id))[0];
    await d.ladeHoch(m.id, { register: 'dokumente', name: 'brief.txt', typ: 'text/plain' }, Buffer.from('Hallo Welt'), null);

    const reihenfolge = (await tabellenIn(sql)).map((t) => t.name);
    assert.ok(reihenfolge.indexOf('haushalte') < reihenfolge.indexOf('mappen'));
    assert.ok(reihenfolge.indexOf('mappen') < reihenfolge.indexOf('dokumente'));
    assert.ok(reihenfolge.indexOf('benutzer') < reihenfolge.indexOf('sitzungen'));

    const tresor = new Tresor(pgBetriebSpeicher(sql, HAUSHALT), join(wurzel, 'geheim', 'k'), () => null);
    await tresor.laden(); await tresor.erzeuge();
    assert.equal(await tresor.pruefwort(), true);
    const s = new Sicherung(join(wurzel, 'sicherung'), join(wurzel, 'files'), HAUSHALT, {
      tresor, einstellungen: pgBetriebSpeicher(sql, HAUSHALT), daten: pgDatenquelle(sql),
      umgebung: async () => ({ dms: 'test', node: process.versions.node, system: 'Linux', architektur: 'x64' }), mountinfo: '/gibt-es-nicht',
    });
    const meta = (await (await s.starte('manuell', 'test')).fertig)!;
    assert.ok(meta, JSON.stringify(s.aktuellerLauf()));
    assert.equal(meta.anzahl.mappen, (await d.listeMappen()).length);
    assert.equal(meta.anzahl.dokumente, 1);
    assert.equal(meta.anzahl.dateien, 1);
    assert.ok(meta.migrationen.includes('001_grundgeruest.sql'));
    const tabellen: string[] = []; let pruefwort = false;
    for await (const e of liesSicherung(join(s.ordner, meta.datei), tresor.abgeleitet(ZWECK)!)) {
      const daten = (await sammle(e.daten)).toString();
      if (e.art === 'T') tabellen.push(e.kopf.tabelle as string);
      if (e.art === 'T' && e.kopf.tabelle === 'einstellungen' && daten.includes('pruefwort')) pruefwort = true;
      if (e.art === 'D') assert.equal(daten, 'Hallo Welt');
    }
    assert.ok(!tabellen.includes('sitzungen') && !tabellen.includes('schema_migrationen'));
    assert.ok(tabellen.includes('mappen') && tabellen.includes('dokumente') && tabellen.includes('benutzer'));
    assert.ok(pruefwort, 'das Prüfwort ist in der Sicherung');
  });
});

describe('Notfallblatt (#106)', () => {
  it('liefert ein PDF mit Schlüssel und Fingerabdruck und merkt sich den Download', async () => {
    const { notfallblatt, inGruppen } = await import('../src/notfallblatt');
    const { routen } = await import('../src/routen');
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    assert.equal(inGruppen('abcdefghij'), 'abcd efgh ij');
    const { s, tresor } = await aufbau();
    const pdf = notfallblatt({ name: 'Familie Muster', haushaltId: HAUSHALT, adresse: 'http://nas:8080', version: '0.20.0', erstellt: new Date(), schluessel: tresor.alsText()!, fingerabdruck: tresor.fingerabdruck!, sicherungsordner: '/data/sicherung', schluesselordner: '/data/geheim' });
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(pdf.includes(Buffer.from(inGruppen(tresor.alsText()!), 'latin1')), 'Schlüssel in Vierergruppen');
    assert.ok(pdf.includes(Buffer.from(tresor.fingerabdruck!, 'latin1')));

    const konten = new Konten(speicherKontoRepo(), null, 'x');
    const { benutzer } = await konten.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    const route = routen(new Dienst(speicherRepo(), speicherDateien()), konten, { tresor, sicherung: s }).find((r) => r.pfad === '/api/werkbank/notfallblatt')!;
    const vorher = protokoll.letzteNr;
    const a = await route.handler({ body: {}, params: {}, query: {}, ip: '', benutzer });
    assert.equal(a.datei?.mime, 'application/pdf');
    assert.match(a.datei!.name, /^DMS-Notfallblatt-\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.equal((await s.notfallblatt()).aktuell, true);
    const eintrag = protokoll.eintraege({ seit: vorher }).find((e) => e.text === 'Notfallblatt heruntergeladen');
    assert.ok(eintrag && !JSON.stringify(eintrag).includes(tresor.alsText()!), 'im Protokoll, ohne Schlüssel');
  });
});
