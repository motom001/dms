/**
 * Umzug von PostgreSQL 17 auf 18 über Sicherung und Wiederherstellung (#1464, #1544) – der Weg, den Handbuch und
 * Startseite beschreiben: Sicherung auf einer Ablage mit PostgreSQL 17 ziehen, auf einer leeren mit 18 einspielen, und
 * danach sind die Daten gleich – Tabelle für Tabelle (Mappen, Dokumente, Historie, Benutzer, Pakete …) und die Dateien.
 *
 * Braucht zwei Server: TEST_DATABASE_URL (Ziel, in der CI postgres:18) und TEST_DATABASE_URL_PG17 (Quelle, in der CI
 * ein zweiter Dienst postgres:17 nur für diesen Test). Ohne TEST_DATABASE_URL_PG17 wird er übersprungen.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, describe, it } from 'node:test';
import { MIGRATIONEN } from './hilfe-db';

const ZIEL = process.env.TEST_DATABASE_URL;
const QUELLE = process.env.TEST_DATABASE_URL_PG17;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
/**
 * Was die Wiederherstellung bewusst neu setzt und darum nicht gleich sein muss:
 * - `sitzungen`: gelten nach dem Umzug nicht mehr (danach leer, eigens geprüft);
 * - `haushaltsstand`: Zähler für Zwischenspeicher, den die Trigger beim Einspielen weiterzählen;
 * - `suchwoerter_eingang`: Eingang des Wörterverzeichnisses, den die Trigger beim Einspielen füllen (#575) –
 *   `suchwoerter` selbst wird verglichen.
 */
const ANDERS = new Set(['sitzungen', 'haushaltsstand', 'suchwoerter_eingang']);
/** Spalten, die nur sagen, wann etwas lief (Migration, Verteilen eines Ereignisses) – ohne sie verglichen. */
const OHNE: Record<string, string[]> = {
  schema_migrationen: ['ausgefuehrt'],
  ereignisse: ['verteilt', 'gesperrt_bis', 'versuche', 'fehler'],
};
/** Zeilen, die die Wiederherstellung anlegt: die Abschlussmeldung für nach dem Neustart. */
// Ohne die Abschlussmeldung und die Betriebsangaben der Sicherung (#1531): Die übernimmt die Wiederherstellung bewusst
// aus dem jetzigen Stand (Merker der Zeitpläne, Proben, Prüfungen), sie gehören nicht zum Datenstand der Sicherung.
const WO: Record<string, string> = {
  einstellungen: `WHERE schluessel <> 'wiederherstellung_abschluss' AND schluessel NOT LIKE 'sicherung\\_%'`,
};

describe('Umzug PostgreSQL 17 → 18 über die Sicherung', { skip: ZIEL && QUELLE ? false : 'TEST_DATABASE_URL_PG17 nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sql aus dynamisch geladenem Modul; Typ im Test ohne Belang
  type Sql = any;
  const db = `dms_umzug18_${process.pid}`;
  const urlVon = (basis: string) => {
    const u = new URL(basis);
    u.pathname = `/${db}`;
    return u.toString();
  };
  const offen: Sql[] = [];
  const verwaltung: Sql[] = [];
  after(async () => {
    for (const s of offen) await s.end({ timeout: 5 }).catch(() => {});
    for (const s of verwaltung) {
      await s.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => {});
      await s.end().catch(() => {});
    }
  });

  async function system(basis: string, mitDaten: boolean) {
    const { verbinde, migriere } = await import('../src/datenbank/db');
    const { pgRepo } = await import('../src/repo/pg');
    const { Dienst } = await import('../src/dienst/dienst');
    const { ordnerSpeicher } = await import('../src/dateien/dateispeicher');
    const { ladeBeispiele } = await import('../src/beispiele/beispiele');
    const { pgEinstellungen } = await import('../src/einstellungen/einstellungen');
    const { pgDatenquelle } = await import('../src/sicherung/datenbankabzug');
    const { Tresor } = await import('../src/geheimnisse/tresor');
    const { Sicherung } = await import('../src/sicherung/sicherung');
    const { Wiederherstellung } = await import('../src/sicherung/wiederherstellung');
    const v = verbinde(basis, 1);
    verwaltung.push(v);
    await v.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await v.unsafe(`CREATE DATABASE ${db}`);
    const url = urlVon(basis);
    const sql = verbinde(url, 3);
    offen.push(sql);
    await migriere(sql, MIGRATIONEN, () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Familie Beispiel') ON CONFLICT DO NOTHING`;
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-umzug18-'));
    const einstellungen = pgEinstellungen(sql, HAUSHALT);
    const tresor = new Tresor(einstellungen, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
    await tresor.laden();
    if (mitDaten) await tresor.erzeuge();
    const dienst = new Dienst(pgRepo(sql, HAUSHALT), ordnerSpeicher(join(wurzel, 'files'), HAUSHALT), { tresor, einstellungen });
    if (mitDaten) {
      await ladeBeispiele(dienst, null);
      const partner = (await dienst.mappentypen.listeTypen()).find((t) => t.name === 'Vertragspartner')!;
      const m = (await dienst.mappen.listeMappen(partner.id))[0];
      const { dokument: dok } = await dienst.dokumente.ladeHoch(
        m.id,
        { register: 'dokumente', name: 'vertrag.txt', typ: 'text/plain' },
        Buffer.from('Fassung 1'),
        null,
      );
      // Zweite Fassung desselben Dokuments und eine Änderung an der Mappe: Versionen und Historie.
      await dienst.dokumentVersionen.neueFassung(dok.id, { name: 'vertrag.txt', typ: 'text/plain' }, Buffer.from('Fassung 2'), null);
      await dienst.mappen.aendereMappe(m.id, { werte: { ...m.werte, name: 'Stadtwerke Beispiel (umgezogen)' } });
      await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (gen_random_uuid(), ${HAUSHALT}, 'lena@example.org', 'Lena', 'admin')`;
      // Ein installiertes Paket, wie es die Paketverwaltung ablegt.
      await sql`INSERT INTO pakete (haushalt_id, id, version, daten) VALUES (${HAUSHALT}, 'umzug_probe', '1.2.3', ${sql.json({ name: 'Umzug-Probe', typen: [] })})`;
    }
    const sicherung = new Sicherung(join(wurzel, 'sicherung'), join(wurzel, 'files'), HAUSHALT, {
      tresor,
      einstellungen,
      daten: pgDatenquelle(sql),
      mountinfo: '/gibt-es-nicht',
      umgebung: async () => ({ dms: '0.305.0', node: process.versions.node, system: 'Linux', architektur: 'x64' }),
    });
    const [{ server_version: pg }] = await sql`SHOW server_version`;
    const w = new Wiederherstellung({
      url,
      sql,
      migrationen: MIGRATIONEN,
      dateiWurzel: join(wurzel, 'files'),
      sicherung,
      tresor,
      laufzeit: async () => ({
        dms: '0.306.0',
        postgres: pg,
        architektur: 'x64',
        haushaltId: HAUSHALT,
        migrationen: (await readdir(MIGRATIONEN)).filter((f) => f.endsWith('.sql')).sort(),
      }),
      wartungAktiv: () => false,
      einrichtungNoetig: async () => Number((await sql`SELECT count(*)::int AS n FROM benutzer`)[0].n) === 0,
      neustart: () => {},
    });
    return { sql, url, wurzel, tresor, sicherung, w, pg: String(pg) };
  }

  /** Inhalt jeder Tabelle in public als Prüfsumme über alle Zeilen (in fester Reihenfolge). */
  async function tabellen(s: Sql): Promise<Record<string, { zeilen: number; summe: string }>> {
    const namen = (await s`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`).map(
      (r: { tablename: string }) => r.tablename,
    );
    const aus: Record<string, { zeilen: number; summe: string }> = {};
    for (const n of namen) {
      const zeile = `(to_jsonb(t)${(OHNE[n] ?? []).map((c) => ` - '${c}'`).join('')})::text`;
      const [r] = await s.unsafe(
        `SELECT count(*)::int AS zeilen, md5(coalesce(string_agg(${zeile}, E'\\n' ORDER BY ${zeile}), '')) AS summe FROM public."${n}" t ${WO[n] ?? ''}`,
      );
      aus[n] = { zeilen: r.zeilen, summe: r.summe };
    }
    return aus;
  }
  /** Alle Dateien unter files als Pfad → SHA-256. */
  async function dateien(wurzel: string): Promise<Record<string, string>> {
    const aus: Record<string, string> = {};
    const basis = join(wurzel, 'files');
    for (const e of await readdir(basis, { recursive: true, withFileTypes: true }))
      if (e.isFile()) {
        const p = join(e.parentPath, e.name);
        aus[relative(basis, p)] = createHash('sha256')
          .update(await readFile(p))
          .digest('hex');
      }
    return aus;
  }

  it('Sicherung mit 17 ziehen → mit 18 einspielen → Daten gleich', async () => {
    const quelle = await system(QUELLE!, true);
    assert.match(quelle.pg, /^17\./, `Quelle soll PostgreSQL 17 sein, ist ${quelle.pg}`);
    const vorher = await tabellen(quelle.sql);
    for (const t of ['mappen', 'dokumente', 'dokument_versionen', 'historie', 'benutzer', 'pakete'])
      assert.ok(vorher[t]?.zeilen > 0, `Quelle ohne Daten in ${t}`);
    const meta = (await (await quelle.sicherung.starte('manuell', 'lena@example.org')).fertig)!;
    assert.ok(meta, JSON.stringify(quelle.sicherung.aktuellerLauf()));
    const name = meta.datei.replace('.dms-sicherung', '');

    const ziel = await system(ZIEL!, false);
    if (process.env.CI) assert.match(ziel.pg, /^18\./, `Ziel soll PostgreSQL 18 sein, ist ${ziel.pg}`);
    await cp(quelle.sicherung.ordner, ziel.sicherung.ordner, { recursive: true });
    const a = await ziel.w.abgleich(name);
    assert.deepEqual(a.probleme, []);
    await ziel.w.starte({ name, schluessel: quelle.tresor.alsText()! }, null);
    for (let i = 0; i < 3000 && ziel.w.aktuellerLauf()?.status === 'laeuft'; i++) await new Promise((r) => setTimeout(r, 20));
    const lauf = ziel.w.aktuellerLauf()!;
    assert.equal(lauf.status, 'neustart', JSON.stringify(lauf, null, 1));
    // Statistik nach dem Einspielen (#367, #1464): ANALYZE ist gelaufen, die Datenbank ist sofort schnell.
    const { verbinde } = await import('../src/datenbank/db');
    const neu = verbinde(ziel.url, 2);
    offen.push(neu);
    const [{ analysiert }] =
      await neu`SELECT count(*)::int AS analysiert FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname = 'mappen' AND (last_analyze IS NOT NULL OR last_autoanalyze IS NOT NULL)`;
    assert.equal(analysiert, 1, 'mappen nach dem Einspielen ohne Statistik');

    const nachher = await tabellen(neu);
    assert.deepEqual(Object.keys(nachher), Object.keys(vorher), 'dieselben Tabellen');
    const abweichend = Object.keys(vorher).filter((t) => !ANDERS.has(t) && JSON.stringify(vorher[t]) !== JSON.stringify(nachher[t]));
    assert.deepEqual(
      abweichend,
      [],
      `Tabellen mit anderem Inhalt: ${abweichend.map((t) => `${t} ${JSON.stringify(vorher[t])} → ${JSON.stringify(nachher[t])}`).join('; ')}`,
    );
    assert.equal(nachher.sitzungen.zeilen, 0, 'Sitzungen gelten nach dem Umzug nicht mehr');
    assert.deepEqual(await dateien(ziel.wurzel), await dateien(quelle.wurzel), 'dieselben Dateien');
  });
});
