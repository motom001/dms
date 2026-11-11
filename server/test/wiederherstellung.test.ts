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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sql aus dynamisch geladenem Modul; Typ im Test ohne Belang
  type Sql = any;
  let haupt: Sql;
  const offen: Sql[] = [];
  const dbs = [`dms_wh_quelle_${process.pid}`, `dms_wh_ziel_${process.pid}`, `dms_wh_wechsel_${process.pid}`, `dms_wh_fassq_${process.pid}`, `dms_wh_fassz_${process.pid}`, `dms_wh_aussen_${process.pid}`, `dms_wh_kennq_${process.pid}`, `dms_wh_kennz_${process.pid}`];
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
  async function system(db: string, opt: { mitDaten?: boolean; mitSchluessel?: boolean; migrationen?: string } = {}) {
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
    await migriere(sql, opt.migrationen ?? MIGRATIONEN, () => {});
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
      // Eine Mappe mit Register „dokumente“ (Vertragspartner); die Ablageorte haben keins.
      const partner = (await dienst.mappentypen.listeTypen()).find((t) => t.name === 'Vertragspartner')!;
      const m = (await dienst.mappen.listeMappen(partner.id))[0];
      await dienst.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'brief.txt', typ: 'text/plain' }, Buffer.from('Hallo aus der Sicherung'), null);
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
    assert.equal(ziel.neustarts(), 1, 'nach dem Umschalten startet Ablago neu');

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

    // #562: Nach Wiederherstellung und Aufräumen sind pg_trgm und unaccent noch da (eigenes Schema), die
    // Trigramm-Indizes stehen im neuen public, und die Tippfehler-Suche liefert weiter Vorschläge.
    assert.equal(lauf.schritte.find((x) => x.name === 'Erweiterungen der Datenbank')?.status, 'ok', JSON.stringify(lauf.schritte));
    const { liesErweiterungen, trigrammIndizes } = await import('../src/erweiterungen');
    assert.deepEqual((await liesErweiterungen(neu)).map((e: { name: string; schema: string | null; zustand: string }) => [e.name, e.schema, e.zustand]),
      [['pg_trgm', 'erweiterungen_dms', 'ok'], ['unaccent', 'erweiterungen_dms', 'ok']]);
    assert.deepEqual((await trigrammIndizes(neu, 'public')).sort(), ['dokumente_volltext_trgm_idx', 'suchwoerter_trgm']);
    // Die Trigger füllen beim Einspielen den Eingang des Wörterverzeichnisses (#575); im Betrieb übernimmt ihn das DMS
    // nach dem Neustart im Hintergrund.
    const { pgRepo } = await import('../src/repo-pg');
    assert.ok(await pgRepo(neu, HAUSHALT).woerterEinarbeiten() > 0);
    const [{ wort }] = await neu`SELECT wort FROM suchwoerter WHERE length(wort) >= 8 AND wort ~ '^[a-z]+$' ORDER BY wort LIMIT 1`;
    const tippfehler = `${wort.slice(0, 3)}${wort.slice(4)}`;
    const vorschlaege = await pgRepo(neu, HAUSHALT).aehnlicheWoerter([tippfehler], 3);
    assert.ok(vorschlaege[tippfehler]?.includes(wort), `Tippfehler „${tippfehler}“ schlägt „${wort}“ vor: ${JSON.stringify(vorschlaege)}`);
  });

  it('stellt eine Kopie außer Haus mit nur der schlanken Metadaten-Datei wieder her (#585)', async () => {
    const meta = JSON.parse(await readFile(join(quelle.sicherung.ordner, `${sicherungsName}.json`), 'utf8'));
    const { schlankeMetadaten } = await import('../src/sicherung');
    const ziel = await system(dbs[5]);
    const { cp } = await import('node:fs/promises');
    await cp(join(quelle.sicherung.ordner, `${sicherungsName}.dms-sicherung`), join(ziel.sicherung.ordner, `${sicherungsName}.dms-sicherung`));
    await writeFile(join(ziel.sicherung.ordner, `${sicherungsName}.json`), JSON.stringify(schlankeMetadaten(meta)));
    const ohne = await ziel.w.abgleich(sicherungsName);
    assert.equal(ohne.schluesselNoetig, true);
    assert.deepEqual(ohne.probleme, []);
    assert.deepEqual(ohne.vergleich, [], 'ohne Schlüssel nichts zu vergleichen');
    assert.match(ohne.hinweise.join(' '), /schlanke Metadaten-Datei/);
    const falsch = await ziel.w.abgleich(sicherungsName, 'A'.repeat(43));
    assert.match(falsch.probleme.join(' '), /Fingerabdruck/);
    const schluessel = quelle.tresor.alsText()!;
    const mit = await ziel.w.abgleich(sicherungsName, schluessel);
    assert.equal(mit.schluesselNoetig, false);
    assert.deepEqual(mit.probleme, []);
    assert.equal(mit.meta.haushaltId, HAUSHALT, 'aus der Inhaltsangabe der Sicherung');
    assert.ok(mit.vergleich.some((v) => v.was === 'Datenbank-Stand' && v.urteil === 'gleich'));
    assert.ok(mit.vergleich.some((v) => v.was === 'Ablago' && v.damals === 'unbekannt'));
    await ziel.w.starte({ name: sicherungsName, schluessel }, null);
    const lauf = await warte(ziel.w);
    assert.equal(lauf.status, 'neustart', JSON.stringify(lauf, null, 1));
    await new Promise((r) => setTimeout(r, 1700));
    const neu = await frisch(dbs[5]);
    assert.deepEqual(await zaehle(neu), await zaehle(quelle.sql), 'wie in der Quelle');
  });

  it('auf dem laufenden System nur im Wartungsmodus; vorher wird der jetzige Stand gesichert', async () => {
    const q = quelle;
    // Nach der Sicherung kommt etwas dazu, das die Wiederherstellung wieder entfernt.
    const typ = (await q.dienst.mappentypen.listeTypen()).find((t) => t.name === 'Vertragspartner')!;
    await q.dienst.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Nach der Sicherung GmbH' } });
    const vorher = await zaehle(q.sql);
    await assert.rejects(q.w.pruefeZugang(false), /Verwaltungsmodus/);
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
    assert.match(a.probleme.join(' '), /neueren Ablago/);
    await assert.rejects(ziel.w.starte({ name: sicherungsName, schluessel, bestaetigt: true }, { email: 'x' }), /neueren Ablago/);
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
    assert.equal(q.w.aktuellerLauf()!.schritte.find((x) => x.name === 'Erweiterungen der Datenbank')?.status, 'ok', 'Erweiterungen geprüft (#562)');
    const e = (await q.sicherung.liste()).find((x) => x.name === sicherungsName)!;
    assert.equal(e.probe?.ok, true);
    const ampel = await q.sicherung.probeAmpel(true);
    assert.equal(ampel.ampel, 'gruen');
  });

  it('umgewandelte Fassungen (#577) und Archivfassungen (#631) kommen mit: nach der Wiederherstellung ohne Paket sind Fassung, Archivfassung, Volltext und Vorschau da', async () => {
    const { Dateiumwandlung, fassungsOrdner, ordnerFassungen } = await import('../src/dateiumwandlung');
    const { Dienst } = await import('../src/dienst');
    const { pgRepo } = await import('../src/repo-pg');
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const { speicherAblage, Vorschaubilder } = await import('../src/vorschau');
    const { pdfMitText } = await import('./hilfen');
    const { createHash } = await import('node:crypto');
    const { cp, mkdir } = await import('node:fs/promises');
    /** Dienst mit Fassungen, Vorschaubildern (Ersatz-Erzeuger) – wie index.ts, ohne Paket. */
    const verbinde = (s: Sql, wurzel: string, dienst?: InstanceType<typeof Dienst>) => {
      const dateien = ordnerSpeicher(join(wurzel, 'files'), HAUSHALT);
      const d = dienst ?? new Dienst(pgRepo(s, HAUSHALT), dateien, {});
      const vorschau = new Vorschaubilder(speicherAblage(), dateien, async (inhalt, mime) => Buffer.from(`vorschau:${mime}:${inhalt.length}`));
      d.dokumente.verbindeVorschau(vorschau);
      const u = new Dateiumwandlung(d.dokumentUmwandlung.umwandlungAnbindung(ordnerFassungen(fassungsOrdner(join(wurzel, 'files'), HAUSHALT)), vorschau));
      d.dokumentUmwandlung.verbindeUmwandlung(u, vorschau);
      vorschau.fassung = (sha) => u.lies(sha);
      return { d, u, vorschau };
    };
    const q = await system(dbs[3], { mitSchluessel: true });
    const quelleU = verbinde(q.sql, q.wurzel, q.dienst);
    const typ = await q.dienst.mappentypen.legeTypAn({ name: 'Scan', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' }] });
    const m = await q.dienst.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Scans von Lena' } });
    const tiff = Buffer.concat([Buffer.from([0x49, 0x49, 42, 0, 8, 0, 0, 0]), Buffer.alloc(64, 7)]);
    const dok = (await q.dienst.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'scan.tif', typ: 'image/tiff' }, tiff, null)).dokument;
    assert.equal(dok.mime, 'image/tiff');
    // Die Fassung, wie das Paket Bildformate sie geliefert hätte, und der Text daraus.
    const pdf = pdfMitText(['Kontoauszug Oktober']);
    const info = { mime: 'application/pdf', groesse: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex'), paket: { id: 'bildformate', name: 'Bildformate', version: '1.0.0' }, erstellt: new Date().toISOString() };
    const ablage = ordnerFassungen(fassungsOrdner(join(q.wurzel, 'files'), HAUSHALT));
    await ablage.schreibe(dok.sha256, info, pdf);
    await q.dienst.volltexte.schreibeVolltext(dok.id, { text: 'Kontoauszug Oktober' }, { id: 'kern', herkunft: 'Text aus dem PDF', paket: false });
    // Eine halbe Fassung (nur Inhalt, ohne Angaben) – z. B. während der Sicherung entstanden – kommt nicht mit.
    await mkdir(join(q.wurzel, 'files', HAUSHALT, 'fassungen', 'ee'), { recursive: true });
    await writeFile(join(q.wurzel, 'files', HAUSHALT, 'fassungen', 'ee', `${'e'.repeat(64)}.fassung`), 'halb');
    assert.equal((await quelleU.u.pakete()).length, 0, 'kein Paket installiert');
    // Archivfassung (PDF/A, #631) zu einem PDF, wie das Paket PDF/A sie abgelegt hätte, mit Stand und Wortpositionen.
    const { archivOrdner, ordnerArchiv, woerterOrdner } = await import('../src/archivfassung');
    const archivAblage = (w: string) => ordnerArchiv(archivOrdner(join(w, 'files'), HAUSHALT), woerterOrdner(join(w, 'files'), HAUSHALT));
    const brief = (await q.dienst.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'brief.pdf', typ: 'application/pdf' }, pdfMitText(['Brief von Petra']), null)).dokument;
    const pdfa = pdfMitText(['Brief von Petra als PDF/A']);
    const archivInfo = { mime: 'application/pdf' as const, groesse: pdfa.length, sha256: createHash('sha256').update(pdfa).digest('hex'), seiten: 1, pdfa: { teil: 2, stufe: 'B' }, paket: { id: 'pdfa', name: 'PDF/A', version: '1.0.0' }, erstellt: new Date().toISOString() };
    await archivAblage(q.wurzel).schreibe(brief.sha256, archivInfo, pdfa);
    await archivAblage(q.wurzel).setzeWoerter(brief.sha256, { seiten: [[['Brief', 0.1, 0.1, 0.1, 0.02]]], von: 'Texterkennung', erstellt: '' });

    const meta = (await (await q.sicherung.starte('manuell', 'lena@example.org')).fertig)!;
    assert.ok(meta, JSON.stringify(q.sicherung.aktuellerLauf()));
    assert.equal(meta.anzahl.fassungen, 2, 'Fassungen in den Metadaten (die halbe zählt beim Sichern mit)');
    assert.equal(meta.anzahl.archivfassungen, 1, 'Archivfassungen in den Metadaten');
    const name = meta.datei.replace('.dms-sicherung', '');

    // Probe: prüft Fassung gegen Angaben, nennt sie und die unvollständige.
    const p = await q.w.starteProbe(name, 'test');
    assert.equal(await p.fertig, true, JSON.stringify(q.w.aktuellerLauf(), null, 1));
    assert.match(q.w.aktuellerLauf()!.schritte.find((x) => x.name === 'Entschlüsseln und Einspielen')!.info!, /eine umgewandelte Fassung \(1 unvollständig, nicht übernommen\), eine Archivfassung \(PDF\/A\)/);

    // Frisches System ohne Paket; dort liegt schon eine andere Fassung derselben Datei (anderes Paket) – die aus der
    // Sicherung ersetzt sie.
    const z = await system(dbs[4]);
    await cp(q.sicherung.ordner, z.sicherung.ordner, { recursive: true });
    const fremd = pdfMitText(['ganz anders umgewandelt']);
    await ordnerFassungen(fassungsOrdner(join(z.wurzel, 'files'), HAUSHALT)).schreibe(dok.sha256, { ...info, groesse: fremd.length, sha256: 'x', paket: { id: 'anders', name: 'Anders', version: '9.0.0' } }, fremd);
    await z.w.starte({ name, schluessel: q.tresor.alsText()! }, null);
    const lauf = await warte(z.w);
    assert.equal(lauf.status, 'neustart', JSON.stringify(lauf, null, 1));
    await new Promise((r) => setTimeout(r, 1700));
    assert.ok(!existsSync(join(z.wurzel, 'files', HAUSHALT, 'fassungen', 'ee', `${'e'.repeat(64)}.fassung`)), 'halbe Fassung nicht übernommen');

    const neu = await frisch(dbs[4]);
    const zielU = verbinde(neu, z.wurzel);
    assert.equal((await zielU.u.pakete()).length, 0, 'auch hier kein Paket');
    // Archivfassung und Wortpositionen sind da – ohne Paket.
    const { Archivfassung } = await import('../src/archivfassung');
    const za = new Archivfassung(zielU.d.dokumentArchiv.archivAnbindung(archivAblage(z.wurzel)));
    zielU.d.dokumentArchiv.verbindeArchivfassung(za);
    assert.deepEqual((await zielU.d.dokumentArchiv.archivfassungVon(brief.id)).inhalt, pdfa, 'Archivfassung ansehen');
    assert.equal((await archivAblage(z.wurzel).woerter(brief.sha256))?.seiten[0]?.[0][0], 'Brief');
    const f = await zielU.d.dokumentUmwandlung.fassungVon(dok.id);
    assert.deepEqual(f.inhalt, pdf, 'Fassung ansehen: dieselbe Fassung wie vorher');
    assert.deepEqual(f.info.paket, info.paket);
    assert.equal(f.info.sha256, info.sha256);
    assert.equal(await pgRepo(neu, HAUSHALT).volltext(dok.id), 'Kontoauszug Oktober', 'Volltext');
    assert.match((await pgRepo(neu, HAUSHALT).holeDokument(dok.id))!.ocr!.info ?? '', /umgewandelten Fassung \(Paket Bildformate 1\.0\.0\)/);
    // Vorschau: beim ersten Anzeigen aus der Fassung (ohne Paket).
    const d2 = (await pgRepo(neu, HAUSHALT).holeDokument(dok.id))!;
    assert.equal(await zielU.vorschau.bild(d2), null, 'erst eingereiht');
    let bild: Buffer | null = null;
    for (let i = 0; i < 500 && !bild; i++) { await new Promise((r) => setTimeout(r, 20)); bild = await zielU.vorschau.bild(d2); }
    assert.equal(bild?.toString(), `vorschau:application/pdf:${pdf.length}`);

    // Vollexport: die Fassung steht neben dem Original und in dokumente.csv.
    const { vollexport } = await import('../src/vollexport');
    const ex = await vollexport(zielU.d.vollexportQuelle({ mandant: 'Test', version: '0', benutzer: async () => ({ benutzer: [], vertretungen: [] }), designs: async () => [], protokoll: () => [] }), join(z.wurzel, 'export'), {});
    const rel = ex.pfade.dokumente.get(dok.id)!;
    assert.deepEqual(await readFile(join(ex.ordner, ...`${rel}.fassung.pdf`.split('/'))), pdf);
    const csvText = await readFile(join(ex.ordner, 'daten', 'dokumente.csv'), 'utf8');
    assert.ok(csvText.split('\r\n')[0].endsWith(',pfad,fassung,archivfassung'));
    const briefRel = ex.pfade.dokumente.get(brief.id)!;
    assert.deepEqual(await readFile(join(ex.ordner, ...`${briefRel}.pdfa.pdf`.split('/'))), pdfa, 'Archivfassung im Vollexport');
    assert.ok(csvText.includes(`${rel}.fassung.pdf`));
  });

  it('Schlüsselwechsel (#47): ganz oder gar nicht in PostgreSQL; ältere Sicherungen brauchen den alten Schlüssel', async () => {
    const x = await system(dbs[2], { mitDaten: true, mitSchluessel: true });
    const { pgRepo } = await import('../src/repo-pg');
    const repo = pgRepo(x.sql, HAUSHALT);
    const typ = await x.dienst.mappentypen.legeTypAn({ name: 'Zugang', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'pw', label: 'Kennwort', typ: 'passwort' }] });
    const a = await x.dienst.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'A', pw: { neu: 'geheim-a' } } });
    const b = await x.dienst.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'B', pw: { neu: 'geheim-b' } } });
    await x.dienst.loescheMappe(b.id);
    const meta = (await (await x.sicherung.starte('manuell', 'anna@example.org')).fertig)!;
    const name = meta.datei.replace('.dms-sicherung', '');
    const altText = x.tresor.alsText()!;
    const roh = async () => ({
      a: (await x.sql`SELECT werte FROM mappen WHERE id = ${a.id}`)[0].werte.pw,
      b: (await x.sql`SELECT mappe FROM papierkorb WHERE id = ${b.id}`)[0].mappe.werte.pw,
      pruefwort: (await x.sql`SELECT wert FROM einstellungen WHERE schluessel = 'pruefwort'`)[0].wert,
    });
    const vorher = await roh();
    // Abbruch nach dem ersten Wert: alles bleibt beim alten (Transaktion).
    let n = 0;
    await assert.rejects(x.tresor.wechsle((um, e) => repo.umschluesseln((v) => { if (++n > 1) throw new Error('Abbruch'); return um(v); }, e), 'anna'), /abgebrochen/);
    assert.deepEqual(await roh(), vorher);
    assert.equal(x.tresor.fingerabdruck, meta.verschluesselung.fingerabdruck);
    // Richtig wechseln.
    const w = await x.dienst.schluesselWechseln('anna@example.org');
    assert.equal(w.umgeschluesselt, 2);
    const nachher = await roh();
    assert.notEqual(nachher.a, vorher.a); assert.notEqual(nachher.b, vorher.b); assert.notEqual(nachher.pruefwort, vorher.pruefwort);
    assert.equal((await x.dienst.passwortfelder.zeigePasswort(a.id, 'pw')).wert, 'geheim-a');
    assert.equal((await x.sql`SELECT wert FROM einstellungen WHERE schluessel = 'tresor'`)[0].wert.fingerabdruck, w.neu);
    // Die Sicherung von vorher: früherer Schlüssel, Wiederherstellen fragt nach dem alten.
    const eintrag = (await x.sicherung.liste()).find((e) => e.name === name)!;
    assert.notEqual(eintrag.meta!.verschluesselung.fingerabdruck, (await x.sicherung.zustand()).fingerabdruck);
    assert.equal((await x.sicherung.notfallblatt()).aktuell, false);
    const ohne = await x.w.abgleich(name);
    assert.equal(ohne.schluesselNoetig, true);
    const mit = await x.w.abgleich(name, altText);
    assert.deepEqual(mit.probleme, []);
  });
  it('ältere Sicherung mit Kennungen <paket>_<schluessel> kommt in der neuen Form an – Zuordnung aus den Paketen (#1084)', async () => {
    const { cp } = await import('node:fs/promises');
    // Quelle auf dem Stand vor #1084: nur die Migrationen bis 092.
    const vorher = await mkdtemp(join(tmpdir(), 'dms-wh-mig-'));
    for (const f of (await readdir(MIGRATIONEN)).filter((x) => x.endsWith('.sql') && x < '094')) await cp(join(MIGRATIONEN, f), join(vorher, f));
    const q = await system(dbs[6], { mitSchluessel: true, migrationen: vorher });
    const [a, b, c] = ['00000000-0000-4000-8000-00000000a084', '00000000-0000-4000-8000-00000000b084', '00000000-0000-4000-8000-00000000c084'];
    const reg = q.sql.json([{ key: 'r', name: 'R', art: 'felder' }]);
    const tl = q.sql.json([{ key: 'standard', name: 'Standard', standard: true, spalten: [] }]);
    await q.sql`INSERT INTO mappentypen (id, haushalt_id, name, schluessel, register, trefferlisten) VALUES
      (${a}, ${HAUSHALT}, 'Pflanze', 'haus_garten_pflanze', ${reg}, ${tl}), (${b}, ${HAUSHALT}, 'Beet', 'haus_garten_beet', ${reg}, ${tl}),
      (${c}, ${HAUSHALT}, 'Eigen', 'garten_pflanze', ${reg}, ${tl})`;
    // Rechte-Regeln am Typ (per uuid): nach dem Wiederherstellen und der Umstellung genau dieselben (Sicherheit D).
    const regel = { grund: { C: 'nie', R: 'immer', U: 'nie', D: 'nie', P: 'nie' }, regeln: [{ wer: { art: 'rolle', id: '00000000-0000-4000-8000-0000000000e1' }, rechte: { U: 'immer' } }] };
    await q.sql`UPDATE mappentypen SET berechtigungen = ${q.sql.json(regel)} WHERE id = ${a}`;
    const rechteVorher = await q.sql`SELECT id::text, berechtigungen FROM mappentypen ORDER BY id`;
    await q.sql`INSERT INTO pakete (haushalt_id, id, version, daten) VALUES
      (${HAUSHALT}, 'haus', '1.0.0', ${q.sql.json({ id: 'haus', typen: { garten_pflanze: a } })}),
      (${HAUSHALT}, 'haus_garten', '1.0.0', ${q.sql.json({ id: 'haus_garten', typen: { beet: b } })})`;
    const meta = (await (await q.sicherung.starte('manuell', 'anna@example.org')).fertig)!;
    assert.ok(meta.migrationen.every((x) => x < '094'), 'Sicherung im alten Stand');
    const name = meta.datei.replace('.dms-sicherung', '');
    const z = await system(dbs[7]);
    await cp(q.sicherung.ordner, z.sicherung.ordner, { recursive: true });
    await z.w.starte({ name, schluessel: q.tresor.alsText()! }, null);
    const lauf = await warte(z.w);
    assert.equal(lauf.status, 'neustart', JSON.stringify(lauf, null, 1));
    await new Promise((r) => setTimeout(r, 1700));
    const neu = await frisch(dbs[7]);
    const typen = await neu`SELECT id::text, paket, schluessel FROM mappentypen WHERE id = ANY(${[a, b, c]}::uuid[]) ORDER BY id`;
    assert.deepEqual(typen.map((r: Record<string, unknown>) => [r.id, r.paket, r.schluessel]), [
      [a, 'haus', 'garten_pflanze'], [b, 'haus_garten', 'beet'], [c, null, 'garten_pflanze'],
    ], 'haus_garten_pflanze gehört laut Paket zu haus, nicht zu haus_garten; der eigene Typ bleibt');
    assert.deepEqual(await neu`SELECT id::text, berechtigungen FROM mappentypen ORDER BY id`, rechteVorher, 'dieselben Rechte-Regeln je Typ');
    assert.equal((await neu`SELECT daten->>'herausgeber' AS h FROM pakete WHERE id = 'haus'`)[0].h, null, 'nicht aus dem offiziellen Katalog: Herausgeber bleibt offen');
  });
});
