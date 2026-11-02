/**
 * Messung der Vektoren (#442): Speicher und Antwortzeit bei vielen Dokumenten – ohne pgvector.
 *
 *   cd server && MESS_DATABASE_URL=postgres://…/messung node --expose-gc --import tsx test/vektoren-messen.ts 10000 100000
 *
 * Legt je Anzahl eine eigene Datenbank an (Name aus MESS_DATABASE_URL + _<anzahl>), füllt sie mit Dokumenten und
 * Zufallsvektoren (256 Dimensionen wie das Paket „KI lokal – Ähnlichkeit“) und misst:
 *   - Speicher der Tabelle vektoren in PostgreSQL,
 *   - Laden des Zwischenspeichers (erste Abfrage nach dem Start),
 *   - Antwortzeit „ähnliche Dokumente“ über den Dienst (Median aus 21 Abfragen),
 *   - zum Vergleich: Kosinus in SQL (unnest) und „alle Vektoren holen, in JS vergleichen“.
 * Danach wird die Datenbank wieder gelöscht.
 */
import { alsUrl, ausUrl, legeDatenbankAn } from '../src/anbindung';
import { migriere, verbinde } from '../src/db';
import { Dienst } from '../src/dienst';
import { speicherDateien } from '../src/dateispeicher';
import { pgRepo } from '../src/repo-pg';
import type { Repo } from '../src/repo';

const D = 256;
const H = '00000000-0000-4000-8000-000000000001';
const median = (l: number[]) => [...l].sort((a, b) => a - b)[l.length >> 1];
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

async function miss(n: number) {
  const basis = ausUrl(process.env.MESS_DATABASE_URL)!;
  const a = { ...basis, datenbank: `${basis.datenbank}_${n}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  try {
    await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${H}, 'Messung') ON CONFLICT DO NOTHING`;
    const d = new Dienst(pgRepo(sql, H) as never as Repo, speicherDateien());
    const typ = await d.legeTypAn({ name: 'Rechnung', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    const reg = typ.register.find((r) => r.art === 'dokumente')!.key;
    let t = Date.now();
    await sql`INSERT INTO mappen (id, haushalt_id, typ_id, werte) SELECT gen_random_uuid(), ${H}, ${typ.id}, jsonb_build_object('name', 'Mappe ' || i) FROM generate_series(1, ${n}) i`;
    await sql`INSERT INTO dokumente (id, haushalt_id, mappe_id, register_key, name, mime, groesse, sha256, volltext)
      SELECT gen_random_uuid(), ${H}, m.id, ${reg}, 'brief.pdf', 'application/pdf', 1000, md5(m.id::text), 'Text ' || m.id FROM mappen m WHERE m.haushalt_id = ${H}`;
    await sql`INSERT INTO vektoren (dokument_id, haushalt_id, paket, modell, vektor)
      SELECT d.id, ${H}, 'ki_aehnlich', 'messung/256', (SELECT array_agg((random() - 0.5)::real) FROM generate_series(1, ${D}) WHERE d.id IS NOT NULL) FROM dokumente d WHERE d.haushalt_id = ${H}`;
    await sql`VACUUM ANALYZE vektoren`;
    const fuellen = Date.now() - t;
    const [{ groesse }] = await sql`SELECT pg_total_relation_size('vektoren') AS groesse`;
    const gc = (globalThis as { gc?: () => void }).gc ?? (() => {});
    gc();
    const rss0 = process.memoryUsage().rss;
    // Erste Abfrage: lädt den Zwischenspeicher.
    const [{ id: erstes }] = await sql`SELECT dokument_id AS id FROM vektoren LIMIT 1`;
    await d.merkeVektorModell('ki_aehnlich', 'messung/256');
    t = performance.now();
    await d.aehnlicheDokumente(undefined, { dokument: erstes as string, anzahl: 10 });
    const laden = performance.now() - t;
    gc();
    const rss = process.memoryUsage().rss - rss0;
    const index = (await d.vektorStand()).zwischenspeicherMB;
    const ids = (await sql`SELECT dokument_id AS id FROM vektoren ORDER BY random() LIMIT 21`).map((r) => r.id as string);
    const zeiten: number[] = [];
    for (const id of ids) { t = performance.now(); await d.aehnlicheDokumente(undefined, { dokument: id, anzahl: 10 }); zeiten.push(performance.now() - t); }
    // Vergleich: Kosinus in SQL (unnest) und alle holen + JS.
    const q = Array.from({ length: D }, () => Math.random() - 0.5);
    const sqlZeiten: number[] = [], holenZeiten: number[] = [];
    for (let i = 0; i < 5; i++) {
      t = performance.now();
      await sql`SELECT dokument_id, (SELECT sum(x * y) FROM unnest(vektor, ${q}::real[]) AS u(x, y)) AS s FROM vektoren WHERE haushalt_id = ${H} AND modell = 'messung/256' ORDER BY s DESC LIMIT 10`;
      sqlZeiten.push(performance.now() - t);
      t = performance.now();
      const alle: Float32Array[] = [];
      await pgRepo(sql, H).vektorenLaden('messung/256', (teil) => { for (const x of teil) alle.push(x.vektor); });
      holenZeiten.push(performance.now() - t);
    }
    console.log(`${n.toLocaleString('de-DE')} Dokumente (${D} Dimensionen), gefüllt in ${(fuellen / 1000).toFixed(1)} s`);
    console.log(`  PostgreSQL, Tabelle vektoren:     ${mb(Number(groesse))} (${(Number(groesse) / n).toFixed(0)} Bytes je Dokument)`);
    console.log(`  Zwischenspeicher laden (1. Mal):  ${laden.toFixed(0)} ms; Vektoren darin ${index} MB, Prozess insgesamt +${mb(rss)}`);
    console.log(`  Ähnliche Dokumente (Median 21):   ${median(zeiten).toFixed(1)} ms (höchstens ${Math.max(...zeiten).toFixed(1)} ms)`);
    console.log(`  Vergleich – Kosinus in SQL:       ${median(sqlZeiten).toFixed(0)} ms; nur alle Vektoren holen: ${median(holenZeiten).toFixed(0)} ms`);
  } finally {
    await sql.end();
    const admin = verbinde(alsUrl(basis));
    await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`);
    await admin.end();
  }
}

for (const n of process.argv.slice(2).map(Number).filter((x) => x > 0)) await miss(n);
