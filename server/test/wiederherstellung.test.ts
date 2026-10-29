/**
 * Wiederherstellen (#107) und Probe-Wiederherstellung (#109) gegen PostgreSQL:
 * Sicherung anlegen, auf einem leeren System wiederherstellen, Mappen/Dokumente/Prüfwort
 * vergleichen; auf dem laufenden System; Abbrüche lassen den alten Stand unverändert.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { readdir } from 'node:fs/promises';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const MIGRATIONEN = fileURLToPath(new URL('../migrations', import.meta.url));

describe('Wiederherstellen mit PostgreSQL', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Sql = any;
  let haupt: Sql;
  const offen: Sql[] = [];
  const dbs = [`dms_wh_quelle_${process.pid}`, `dms_wh_ziel_${process.pid}`];
  const urlVon = (db: string) => { const u = new URL(url!); u.pathname = `/${db}`; return u.toString(); };

  before(async () => {
    const { verbinde } = await import('../src/db');
    haupt = verbinde(url!);
    for (const db of dbs) { await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`); await haupt.unsafe(`CREATE DATABASE ${db}`); }
  });
  after(async () => {
    for (const s of offen) await s.end().catch(() => {});
    for (const db of dbs) await haupt.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => {});
    await haupt?.end();
  });

  /** Ein DMS wie im Betrieb: Datenbank, Dateien, Schlüssel, Sicherung, Wiederherstellung. */
  async function system(db: string, opt: { mitDaten?: boolean; mitSchluessel?: boolean } = {}) {
    const { verbinde, migriere } = await import('../src/db');
    const { pgRepo } = await import('../src/repo-pg');
    const { Dienst } = await import('../src/dienst');
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const { ladeBeispiele } = await import('../src/beispiele');
    const { pgEinstellungen } = await import('../src/einstellungen');
    const { pgDatenquelle } = await import('../src/datenbankabzug');
    const { Tresor } = await import('../src/tresor');
    const { Sicherung } = await import('../src/sicherung');
    const { Wiederherstellung } = await import('../src/wiederherstellung');
    const sql = verbinde(urlVon(db));
    offen.push(sql);
    await migriere(sql, MIGRATIONEN, () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
    const wurzel = await mkdtemp(join(tmpdir(), `dms-wh-${db}-`));
    const einstellungen = pgEinstellungen(sql, HAUSHALT);
    const tresor = new Tresor(einstellungen, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
    await tresor.laden();
    if (opt.mitSchluessel) await tresor.erzeuge();
    const dienst = new Dienst(pgRepo(sql, HAUSHALT), ordnerSpeicher(join(wurzel, 'files'), HAUSHALT), { tresor, einstellungen });
    let benutzer = 0;
    if (opt.mitDaten) {
      await ladeBeispiele(dienst, null);
      const m = (await dienst.listeMappen())[0];
      await dienst.ladeHoch(m.id, { register: 'dokumente', name: 'brief.txt', typ: 'text/plain' }, Buffer.from('Hallo aus der Sicherung'), null);
      await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (gen_random_uuid(), ${HAUSHALT}, 'anna@example.org', 'Anna', 'admin')`;
      benutzer = 1;
    }
    let wartung = false; let neugestartet = 0;
    const sicherung = new Sicherung(join(wurzel, 'sicherung'), join(wurzel, 'files'), HAUSHALT, {
      tresor, einstellungen, daten: pgDatenquelle(sql), mountinfo: '/gibt-es-nicht',
      umgebung: async () => ({ dms: '0.21.0', node: process.versions.node, system: 'Linux', architektur: 'x64' }),
    });
    const [{ server_version: pg }] = await sql`SHOW server_version`;
    const w = new Wiederherstellung({
      url: urlVon(db), sql, migrationen: MIGRATIONEN, dateiWurzel: join(wurzel, 'files'), sicherung, tresor,
      laufzeit: async () => ({ dms: '0.21.0', postgres: pg, architektur: 'x64', haushaltId: HAUSHALT, migrationen: (await readdir(MIGRATIONEN)).filter((f) => f.endsWith('.sql')).sort() }),
      wartungAktiv: () => wartung,
      einrichtungNoetig: async () => Number((await sql`SELECT count(*)::int AS n FROM benutzer`)[0].n) === 0,
      neustart: () => { neugestartet++; },
    });
    sicherung.sperre = () => w.laeuft();
    return { sql, wurzel, tresor, dienst, sicherung, w, benutzer, setzeWartung: (an: boolean) => { wartung = an; }, neustarts: () => neugestartet };
  }
  const warte = async <T extends { status: string }>(w: { aktuellerLauf(): T | null }): Promise<T> => {
    for (let i = 0; i < 3000 && w.aktuellerLauf()?.status === 'laeuft'; i++) await new Promise((r) => setTimeout(r, 20));
    return w.aktuellerLauf()!;
  };
  /** Frische Verbindung (nach dem Umschalten der Schemas). */
  async function frisch(db: string) {
    const { verbinde } = await import('../src/db');
    const s = verbinde(urlVon(db)); offen.push(s); return s;
  }
  const zaehle = async (s: Sql) => ({
    mappen: Number((await s`SELECT count(*)::int AS n FROM mappen`)[0].n),
    dokumente: Number((await s`SELECT count(*)::int AS n FROM dokumente`)[0].n),
    benutzer: Number((await s`SELECT count(*)::int AS n FROM benutzer`)[0].n),
  });

  let quelle: Awaited<ReturnType<typeof system>>;
  let sicherungsName = '';

  it('stellt eine Sicherung auf einem frischen System wieder her – mit Schlüssel vom Notfallblatt', async () => {
    quelle = await system(dbs[0], { mitDaten: true, mitSchluessel: true });
    const vorher = await zaehle(quelle.sql);
    const meta = (await (await quelle.sicherung.starte('manuell', 'anna@example.org')).fertig)!;
    assert.ok(meta, JSON.stringify(quelle.sicherung.aktuellerLauf()));
    sicherungsName = meta.datei.replace('.dms-sicherung', '');

    const ziel = await system(dbs[1]);
    // Sicherungsdateien in den Sicherungsordner des neuen Systems legen.
    const { cp } = await import('node:fs/promises');
    await cp(quelle.sicherung.ordner, ziel.sicherung.ordner, { recursive: true });
    assert.equal(await ziel.w.pruefeZugang(false), 'frisch', 'frisches System: ohne Anmeldung');
    const a = await ziel.w.abgleich(sicherungsName);
    assert.equal(a.schluesselNoetig, true, 'kein Schlüssel auf dem neuen System');
    assert.deepEqual(a.probleme, []);
    assert.ok(a.vergleich.some((v) => v.was === 'Datenbank-Stand' && v.urteil === 'gleich'));
    const falsch = await ziel.w.abgleich(sicherungsName, 'A'.repeat(43));
    assert.match(falsch.probleme.join(' '), /Fingerabdruck/);
    await assert.rejects(ziel.w.starte({ name: sicherungsName }, null), /Schlüssel vom Notfallblatt/);

    const schluessel = quelle.tresor.alsText()!.match(/.{1,4}/g)!.join(' ');
    await ziel.w.starte({ name: sicherungsName, schluessel }, null);
    const lauf = await warte(ziel.w);
    assert.equal(lauf.status, 'neustart', JSON.stringify(lauf, null, 1));
    await new Promise((r) => setTimeout(r, 1700));
    assert.equal(ziel.neustarts(), 1, 'nach dem Umschalten startet das DMS neu');

    const neu = await frisch(dbs[1]);
    assert.deepEqual(await zaehle(neu), vorher, 'Mappen, Dokumente, Benutzer wie in der Quelle');
    const [dok] = await neu`SELECT sha256 FROM dokumente`;
    assert.equal(await readFile(join(ziel.wurzel, 'files', HAUSHALT, dok.sha256.slice(0, 2), dok.sha256), 'utf8'), 'Hallo aus der Sicherung');
    assert.equal((await readFile(ziel.tresor.datei, 'utf8')).trim(), quelle.tresor.alsText(), 'Schlüsseldatei angelegt');
    const { entschluesseleMit, PRUEFWORT } = await import('../src/tresor');
    const [pw] = await neu`SELECT wert FROM einstellungen WHERE schluessel = 'pruefwort'`;
    assert.equal(entschluesseleMit(Buffer.from(quelle.tresor.alsText()!, 'base64url'), pw.wert), PRUEFWORT, 'Prüfwort');
    const [ab] = await neu`SELECT wert FROM einstellungen WHERE schluessel = 'wiederherstellung_abschluss'`;
    assert.equal(ab.wert.sicherung, sicherungsName, 'Abschlussmeldung für nach dem Neustart');
    assert.equal((await neu`SELECT 1 FROM sitzungen`).length, 0);
    const schemas = (await neu`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'dms_%'`).map((r: { nspname?: unknown }) => String(r.nspname));
    assert.ok(schemas.some((s: string) => s.startsWith('dms_alt_')), 'der alte Stand liegt bis zum Neustart daneben');
    // Neustart: Aufräumen.
    const { Wiederherstellung } = await import('../src/wiederherstellung');
    await new Wiederherstellung({ ...(ziel.w as unknown as { q: ConstructorParameters<typeof Wiederherstellung>[0] }).q, sql: neu }).raeumeAuf();
    assert.equal((await neu`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'dms_%'`).length, 0);
  });

  it('auf dem laufenden System nur im Wartungsmodus; vorher wird der jetzige Stand gesichert', async () => {
    const q = quelle;
    // Nach der Sicherung kommt etwas dazu, das die Wiederherstellung wieder entfernt.
    const typ = (await q.dienst.listeTypen()).find((t) => t.name === 'Vertragspartner')!;
    await q.dienst.legeMappeAn({ typId: typ.id, werte: { name: 'Nach der Sicherung GmbH' } });
    const vorher = await zaehle(q.sql);
    await assert.rejects(q.w.pruefeZugang(false), /Administratorrechte/);
    await assert.rejects(q.w.pruefeZugang(true), /Wartungsmodus/);
    q.setzeWartung(true);
    await assert.rejects(q.w.starte({ name: sicherungsName }, { email: 'anna@example.org' }), /bestätigen/);
    await q.w.starte({ name: sicherungsName, bestaetigt: true }, { email: 'anna@example.org' });
    const lauf = await warte(q.w);
    assert.equal(lauf.status, 'neustart', JSON.stringify(lauf, null, 1));
    assert.equal(lauf.schritte[0].name, 'Sicherung des jetzigen Stands');
    assert.equal(lauf.schritte[0].status, 'ok');
    const neu = await frisch(dbs[0]);
    assert.equal((await zaehle(neu)).mappen, vorher.mappen - 1, 'die neue Mappe ist wieder weg');
    assert.equal((await neu`SELECT wert FROM einstellungen WHERE schluessel = 'wartung'`).length, 0, 'der Wartungsmodus endet mit der Wiederherstellung');
    const liste = await q.sicherung.liste();
    assert.ok(liste.some((x) => x.meta?.art === 'vor-wiederherstellung'), 'Sicherung vor der Wiederherstellung liegt bereit');
    quelle = { ...q, sql: neu };
  });

  it('Abbruch – veränderte Datei, falscher Schlüssel, neuere Sicherung – lässt den alten Stand unverändert', async () => {
    const ziel = await system(dbs[1]); // inzwischen mit den wiederhergestellten Daten
    const vorher = await zaehle(ziel.sql);
    const { cp } = await import('node:fs/promises');
    await cp(quelle.sicherung.ordner, ziel.sicherung.ordner, { recursive: true, force: true });
    const meta = (await ziel.sicherung.liste()).find((x) => x.name === sicherungsName)!.meta!;
    ziel.setzeWartung(true);
    const datei = join(ziel.sicherung.ordner, meta.datei);
    const original = await readFile(datei);
    const kaputt = Buffer.from(original); kaputt[kaputt.length - 100] ^= 1;
    await writeFile(datei, kaputt);
    const schluessel = quelle.tresor.alsText()!;
    await ziel.w.starte({ name: sicherungsName, schluessel, bestaetigt: true }, { email: 'anna@example.org' });
    const lauf = await warte(ziel.w);
    assert.equal(lauf.status, 'fehler');
    assert.match(lauf.fehler!, /Prüfsumme/);
    assert.deepEqual(await zaehle(ziel.sql), vorher);
    assert.equal((await ziel.sql`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'dms_wh_%'`).length, 0, 'kein halbes Schema');
    await writeFile(datei, original);

    // Neuere Sicherung: Metadaten mit einer unbekannten Migration.
    const jsonPfad = join(ziel.sicherung.ordner, `${sicherungsName}.json`);
    const json = JSON.parse(await readFile(jsonPfad, 'utf8'));
    await writeFile(jsonPfad, JSON.stringify({ ...json, umgebung: { ...json.umgebung, dms: '9.0.0', datenbankStand: '999_zukunft.sql' }, migrationen: [...json.migrationen, '999_zukunft.sql'] }));
    const a = await ziel.w.abgleich(sicherungsName, schluessel);
    assert.match(a.probleme.join(' '), /neueren DMS/);
    await assert.rejects(ziel.w.starte({ name: sicherungsName, schluessel, bestaetigt: true }, { email: 'x' }), /neueren DMS/);
    await writeFile(jsonPfad, JSON.stringify(json));
    assert.ok(existsSync(datei));
  });

  it('nur ein Lauf zur Zeit; scheitert das Umschalten, liegt die bisherige Schlüsseldatei wieder da', async () => {
    const ziel = await system(dbs[1]);
    const { cp } = await import('node:fs/promises');
    await cp(quelle.sicherung.ordner, ziel.sicherung.ordner, { recursive: true, force: true });
    ziel.setzeWartung(true);
    const schluessel = quelle.tresor.alsText()!;
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(ziel.wurzel, 'geheim'), { recursive: true });
    await writeFile(ziel.tresor.datei, 'ein-anderer-schluessel\n');
    // Umschalten scheitert (z. B. fehlendes Recht): sql.begin wirft.
    const q = (ziel.w as unknown as { q: { sql: Sql } }).q;
    const echt = q.sql;
    q.sql = new Proxy(echt, { get: (t, p) => (p === 'begin' ? async () => { throw new Error('keine Berechtigung zum Umbenennen'); } : Reflect.get(t, p)) });
    const vorher = await zaehle(echt);
    const [a, b] = await Promise.allSettled([
      ziel.w.starte({ name: sicherungsName, schluessel, bestaetigt: true }, { email: 'x' }),
      ziel.w.starte({ name: sicherungsName, schluessel, bestaetigt: true }, { email: 'x' }),
    ]);
    assert.ok([a.status, b.status].includes('rejected') && [a.status, b.status].includes('fulfilled'), 'zwei Starts gleichzeitig: nur einer läuft');
    const lauf = await warte(ziel.w);
    assert.equal(lauf.status, 'fehler', JSON.stringify(lauf, null, 1));
    assert.match(lauf.fehler!, /Umbenennen/);
    assert.equal(await readFile(ziel.tresor.datei, 'utf8'), 'ein-anderer-schluessel\n', 'bisherige Schlüsseldatei zurück');
    q.sql = echt;
    assert.deepEqual(await zaehle(echt), vorher);
    assert.equal((await echt`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'dms_wh_%'`).length, 0);
  });

  it('bricht der Leser einer Tabelle ab, endet der Schnappschuss trotzdem', async () => {
    const { pgDatenquelle } = await import('../src/datenbankabzug');
    const s = await frisch(dbs[0]);
    const r = await Promise.race([
      pgDatenquelle(s).imSchnappschuss(async (x) => {
        const t = x.tabellen.find((y) => y.name === 'mappen')!;
        for await (const _ of await x.inhalt(t)) break;
        return 'fertig';
      }),
      new Promise((res) => setTimeout(() => res('hängt'), 10_000)),
    ]);
    assert.equal(r, 'fertig');
  });

  it('Probe-Wiederherstellung: spielt ein, prüft, räumt auf, merkt sich das Ergebnis (#109)', async () => {
    const q = await system(dbs[0]);
    // Der Schlüssel der Quelle liegt in ihrem Ordner; dieses „System“ nimmt ihn mit.
    await writeFile(q.tresor.datei, `${quelle.tresor.alsText()}\n`, { flag: 'w' }).catch(async () => {
      const { mkdir } = await import('node:fs/promises'); await mkdir(join(q.wurzel, 'geheim'), { recursive: true });
      await writeFile(q.tresor.datei, `${quelle.tresor.alsText()}\n`);
    });
    await q.tresor.laden();
    const { cp } = await import('node:fs/promises');
    await cp(quelle.sicherung.ordner, q.sicherung.ordner, { recursive: true, force: true });
    const vorher = await zaehle(q.sql);
    const { fertig } = await q.w.starteProbe(sicherungsName, 'test');
    assert.equal(await fertig, true, JSON.stringify(q.w.aktuellerLauf(), null, 1));
    assert.deepEqual(await zaehle(q.sql), vorher, 'das laufende System bleibt unberührt');
    assert.equal((await q.sql`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'dms_wh_%'`).length, 0, 'aufgeräumt');
    const e = (await q.sicherung.liste()).find((x) => x.name === sicherungsName)!;
    assert.equal(e.probe?.ok, true);
    const ampel = await q.sicherung.probeAmpel(true);
    assert.equal(ampel.ampel, 'gruen');
  });
});
