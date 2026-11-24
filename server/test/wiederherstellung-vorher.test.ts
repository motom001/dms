/**
 * Wiederherstellen in KW48 gegen PostgreSQL: Sicherung des jetzigen Stands abwählbar und ihr Scheitern sichtbar
 * (#1530), Angaben zur Sicherung überstehen das Zurückholen (#1531), erste Sicherung samt Probe nach der Einrichtung
 * räumt auch beim Scheitern auf (#1509).
 */
import assert from 'node:assert/strict';
import { mkdtemp, open, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, afterEach, before, describe, it } from 'node:test';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const MIGRATIONEN = fileURLToPath(new URL('../migrations', import.meta.url));

describe(
  'Wiederherstellen: vorher sichern, Angaben, erste Sicherung (PostgreSQL)',
  { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' },
  () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sql aus dynamisch geladenem Modul; Typ im Test ohne Belang
    type Sql = any;
    let haupt: Sql;
    const offen: Sql[] = [];
    const wurzeln: string[] = [];
    const dbs = [`dms_whv_a_${process.pid}`, `dms_whv_b_${process.pid}`, `dms_whv_c_${process.pid}`, `dms_whv_d_${process.pid}`];
    const urlVon = (db: string) => {
      const u = new URL(url!);
      u.pathname = `/${db}`;
      return u.toString();
    };
    before(async () => {
      const { verbinde } = await import('../src/datenbank/db');
      haupt = verbinde(url!, 1);
      for (const db of dbs) {
        await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
        await haupt.unsafe(`CREATE DATABASE ${db}`);
      }
    });
    afterEach(async () => {
      for (const s of offen.splice(0)) await s.end({ timeout: 5 }).catch(() => {});
    });
    after(async () => {
      for (const db of dbs) await haupt.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => {});
      await haupt?.end();
      for (const w of wurzeln) await rm(w, { recursive: true, force: true });
    });

    async function system(db: string) {
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
      const sql = verbinde(urlVon(db), 3);
      offen.push(sql);
      await migriere(sql, MIGRATIONEN, () => {});
      await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
      const wurzel = await mkdtemp(join(tmpdir(), `dms-whv-${db}-`));
      wurzeln.push(wurzel);
      const einstellungen = pgEinstellungen(sql, HAUSHALT);
      const tresor = new Tresor(einstellungen, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
      await tresor.laden();
      await tresor.erzeuge();
      const dienst = new Dienst(pgRepo(sql, HAUSHALT), ordnerSpeicher(join(wurzel, 'files'), HAUSHALT), { tresor, einstellungen });
      await ladeBeispiele(dienst, null);
      await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (gen_random_uuid(), ${HAUSHALT}, 'anna@example.org', 'Anna', 'admin')`;
      let wartung = true;
      const sicherung = new Sicherung(join(wurzel, 'sicherung'), join(wurzel, 'files'), HAUSHALT, {
        tresor,
        einstellungen,
        daten: pgDatenquelle(sql),
        mountinfo: '/gibt-es-nicht',
        umgebung: async () => ({ dms: '0.305.0', node: process.versions.node, system: 'Linux', architektur: 'x64' }),
      });
      const [{ server_version: pg }] = await sql`SHOW server_version`;
      const w = new Wiederherstellung({
        url: urlVon(db),
        sql,
        migrationen: MIGRATIONEN,
        dateiWurzel: join(wurzel, 'files'),
        sicherung,
        tresor,
        laufzeit: async () => ({
          dms: '0.305.0',
          postgres: pg,
          architektur: 'x64',
          haushaltId: HAUSHALT,
          migrationen: (await readdir(MIGRATIONEN)).filter((f) => f.endsWith('.sql')).sort(),
        }),
        wartungAktiv: () => wartung,
        einrichtungNoetig: async () => false,
        neustart: () => {},
      });
      sicherung.sperre = () => w.laeuft();
      return {
        sql,
        dienst,
        einstellungen,
        sicherung,
        w,
        setzeWartung: (an: boolean) => {
          wartung = an;
        },
      };
    }
    const warte = async <T extends { status: string }>(w: { aktuellerLauf(): T | null }): Promise<T> => {
      for (let i = 0; i < 3000 && w.aktuellerLauf()?.status === 'laeuft'; i++) await new Promise((r) => setTimeout(r, 20));
      return w.aktuellerLauf()!;
    };
    async function frisch(db: string) {
      const { verbinde } = await import('../src/datenbank/db');
      const s = verbinde(urlVon(db), 2);
      offen.push(s);
      return s;
    }
    const wert = async (s: Sql, k: string) => (await s`SELECT wert FROM einstellungen WHERE schluessel = ${k}`)[0]?.wert ?? null;
    const mappen = async (s: Sql) => Number((await s`SELECT count(*)::int AS n FROM mappen`)[0].n);
    const schemas = async (s: Sql) => (await s`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'dms_wh_%'`).length;

    it('ohne Sicherung vorher (#1530): Schritt ausgelassen, keine neue Sicherung; Angaben zur Sicherung bleiben (#1531)', async () => {
      const q = await system(dbs[0]);
      const s1 = (await (await q.sicherung.starte('manuell', 'anna@example.org', { wozu: 'Vor dem Test' })).fertig)!;
      const name = s1.datei.replace(/\.dms-sicherung$/, '');
      // Nach der Sicherung: Probe mit ihr und „heute automatisch gesichert“ – das steht nicht in der Sicherung.
      const { fertig } = await q.w.starteProbe(name, 'test');
      assert.equal(await fertig, true);
      const probe = await q.einstellungen.lies('sicherung_probe_letzte');
      await q.einstellungen.schreibe('sicherung_zuletzt_auto', '2099-01-01');
      const typ = (await q.dienst.mappentypen.listeTypen()).find((t) => t.name === 'Vertragspartner')!;
      await q.dienst.mappen.legeMappeAn({ typId: typ.id, werte: { name: 'Nach der Sicherung GmbH' } });
      const vorher = await mappen(q.sql);
      const anzahl = (await q.sicherung.liste()).length;
      await q.w.starte({ name, bestaetigt: true, vorherSichern: false }, { email: 'anna@example.org' });
      const lauf = await warte(q.w);
      assert.equal(lauf.status, 'neustart', JSON.stringify(lauf, null, 1));
      assert.equal(lauf.ohneVorher, true);
      assert.deepEqual([lauf.schritte[0].name, lauf.schritte[0].status], ['Sicherung des jetzigen Stands', 'ausgelassen']);
      assert.equal((await q.sicherung.liste()).length, anzahl, 'keine Sicherung „vor einer Wiederherstellung“');
      const neu = await frisch(dbs[0]);
      assert.equal(await mappen(neu), vorher - 1, 'Stand der Sicherung');
      assert.deepEqual(await wert(neu, 'sicherung_probe_letzte'), probe, 'die Probe springt nicht zurück');
      assert.equal(await wert(neu, 'sicherung_zuletzt_auto'), '2099-01-01', 'zuletzt automatisch bleibt');
      assert.ok(
        String(await wert(neu, 'sicherung_probe_zuletzt')) >= new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10),
        'Probe nicht gleich nachholen',
      );
    });

    it('Sicherung vorher scheitert schon beim Beginn (#1530): Fehler mit Merkmal, nichts begonnen; ohne Sicherung geht es', async () => {
      const q = await system(dbs[1]);
      const name = (await (await q.sicherung.starte('manuell', 'anna@example.org')).fertig)!.datei.replace(/\.dms-sicherung$/, '');
      const { PLAN_STANDARD } = await import('../src/sicherung/sicherung');
      await q.einstellungen.schreibe('sicherung_plan', { ...PLAN_STANDARD, mindestFreiGB: 100_000 });
      await assert.rejects(
        q.w.starte({ name, bestaetigt: true }, { email: 'anna@example.org' }),
        (e: { status?: number; details?: { vorherGescheitert?: boolean }; message: string }) =>
          e.status === 507 && e.details?.vorherGescheitert === true && /ließ sich nicht beginnen/.test(e.message),
      );
      assert.equal(q.w.laeuft(), false, 'nichts begonnen, nichts wiederholt');
      assert.equal(q.w.aktuellerLauf(), null);
      await q.w.starte({ name, bestaetigt: true, vorherSichern: false }, { email: 'anna@example.org' });
      assert.equal((await warte(q.w)).status, 'neustart');
    });

    it('Sicherung vorher scheitert unterwegs (#1530): Abbruch mit „vorherGescheitert“, alter Stand unverändert', async () => {
      const q = await system(dbs[2]);
      const name = (await (await q.sicherung.starte('manuell', 'anna@example.org')).fertig)!.datei.replace(/\.dms-sicherung$/, '');
      const vorher = await mappen(q.sql);
      const echt = q.sicherung.starte.bind(q.sicherung);
      q.sicherung.starte = async (...a: Parameters<typeof echt>) => {
        const r = await echt(...a);
        return { lauf: r.lauf, fertig: r.fertig.then(() => null) };
      };
      await q.w.starte({ name, bestaetigt: true }, { email: 'anna@example.org' });
      const lauf = await warte(q.w);
      assert.equal(lauf.status, 'fehler');
      assert.equal(lauf.vorherGescheitert, true);
      assert.equal(lauf.schritte[0].status, 'fehler');
      assert.equal(await mappen(q.sql), vorher);
      assert.equal(await schemas(q.sql), 0);
    });

    it('erste Sicherung samt Probe (#1509): echte Probe im eigenen Schema, räumt auf – auch wenn sie scheitert', async () => {
      const q = await system(dbs[3]);
      const { vormerkeErste, laufeErste } = await import('../src/sicherung/erste-sicherung');
      await q.einstellungen.schreibe('sicherung_plan', null);
      assert.equal(await vormerkeErste(q.sicherung, 'lena@example.org'), true);
      assert.equal(await laufeErste(q.sicherung, q.w), true);
      const z = await q.sicherung.zustand();
      assert.equal(z.erste?.status, 'ok', JSON.stringify(z.erste));
      assert.equal(z.probe.ampel, 'gruen');
      assert.equal(await schemas(q.sql), 0, 'Probe aufgeräumt');
      // Scheitern: Die Sicherungsdatei ist beschädigt, bevor die Probe sie liest.
      await q.einstellungen.schreibe('sicherung_erste', { status: 'offen', seit: new Date().toISOString(), von: 'test' });
      const echt = q.w.starteProbe.bind(q.w);
      q.w.starteProbe = async (n: string, von: string) => {
        const f = await open(join(q.sicherung.ordner, `${n}.dms-sicherung`), 'r+');
        await f.write(Buffer.from('kaputt'), 0, 6, 200);
        await f.close();
        return echt(n, von);
      };
      assert.equal(await laufeErste(q.sicherung, q.w), true);
      const e = (await q.sicherung.zustand()).erste!;
      assert.deepEqual([e.status, e.schritt], ['fehler', 'probe']);
      assert.match(e.grund ?? '', /Prüfsumme/);
      assert.equal(await schemas(q.sql), 0, 'nichts Halbes bleibt liegen');
    });
  },
);
