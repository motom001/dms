import type postgres from 'postgres';

/**
 * Datenbank in einer Sicherung (#103) – ohne pg_dump: Das DMS liest seine Tabellen selbst,
 * alle in einem gemeinsamen Schnappschuss (REPEATABLE READ), als COPY-Text. So hängt die
 * Sicherung nicht an der PostgreSQL-Version und taugt auch für den Wechsel auf eine neue
 * Hauptversion; das Schema entsteht beim Wiederherstellen aus den Migrationen.
 */

export interface Tabelle { name: string; spalten: string[] }
export interface Zaehler { mappen: number; dokumente: number; benutzer: number }

/** Tabellen, deren Inhalt nicht in die Sicherung gehört. */
export const OHNE_INHALT = new Set(['sitzungen', 'schema_migrationen']);

export interface Schnappschuss {
  postgres: string;
  /** Ausgeführte Migrationen, in Reihenfolge. */
  migrationen: string[];
  /** Tabellen in der Reihenfolge, in der sie wieder eingespielt werden (Eltern vor Kindern). */
  tabellen: Tabelle[];
  zaehler: Zaehler;
  /** Inhalt einer Tabelle als COPY-Text. */
  inhalt(t: Tabelle): Promise<AsyncIterable<Buffer>>;
}

export interface Datenquelle {
  imSchnappschuss<T>(f: (s: Schnappschuss) => Promise<T>): Promise<T>;
  /** Größe der Datenbank in Bytes. */
  groesse(): Promise<number>;
}

export const bezeichner = (s: string) => `"${s.replace(/"/g, '""')}"`;

type Abfrage = postgres.Sql | postgres.TransactionSql;

/** Tabellen eines Schemas mit Spalten (ohne generierte), Eltern vor Kindern. */
export async function tabellenIn(sql: Abfrage, schema = 'public'): Promise<Tabelle[]> {
  const spalten = await sql`
    SELECT c.relname AS tabelle, a.attname AS spalte
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    WHERE n.nspname = ${schema} AND c.relkind IN ('r', 'p')
    ORDER BY c.relname, a.attnum`;
  const fks = await sql`
    SELECT k.relname AS kind, e.relname AS eltern
    FROM pg_constraint f
    JOIN pg_class k ON k.oid = f.conrelid
    JOIN pg_class e ON e.oid = f.confrelid
    JOIN pg_namespace n ON n.oid = f.connamespace
    WHERE f.contype = 'f' AND n.nspname = ${schema}`;
  const je = new Map<string, string[]>();
  for (const r of spalten) {
    const t = r.tabelle as string;
    if (!je.has(t)) je.set(t, []);
    je.get(t)!.push(r.spalte as string);
  }
  const eltern = new Map<string, Set<string>>([...je.keys()].map((t) => [t, new Set<string>()]));
  for (const r of fks) if (r.kind !== r.eltern) eltern.get(r.kind as string)?.add(r.eltern as string);
  // Topologisch sortieren; bei einem Kreis den Rest in Namensreihenfolge.
  const fertig: string[] = [];
  const offen = new Set([...je.keys()].sort());
  while (offen.size) {
    const bereit = [...offen].filter((t) => [...eltern.get(t)!].every((e) => !offen.has(e)));
    const naechste = bereit.length ? bereit : [[...offen][0]];
    for (const t of naechste) { fertig.push(t); offen.delete(t); }
  }
  return fertig.map((name) => ({ name, spalten: je.get(name)! }));
}

export function pgDatenquelle(sql: postgres.Sql, schema = 'public'): Datenquelle {
  return {
    async imSchnappschuss(f) {
      return (await sql.begin('isolation level repeatable read read only', async (tx) => {
        const [{ server_version: pg }] = await tx`SHOW server_version`;
        const migrationen = (await tx`SELECT name FROM ${tx(schema)}.schema_migrationen ORDER BY name`).map((r) => r.name as string);
        const tabellen = await tabellenIn(tx, schema);
        const anzahl = async (t: string) => (tabellen.some((x) => x.name === t) ? Number((await tx.unsafe(`SELECT count(*)::int AS n FROM ${bezeichner(schema)}.${bezeichner(t)}`))[0].n) : 0);
        const zaehler = { mappen: await anzahl('mappen'), dokumente: await anzahl('dokumente'), benutzer: await anzahl('benutzer') };
        return f({
          postgres: pg as string, migrationen, tabellen, zaehler,
          inhalt: async (t) => {
            const strom = await tx.unsafe(`COPY ${bezeichner(schema)}.${bezeichner(t.name)} (${t.spalten.map(bezeichner).join(', ')}) TO STDOUT`).readable();
            // Bricht der Leser ab (z. B. Platte voll), muss das COPY trotzdem zu Ende gelesen werden:
            // Ein zerstörter Strom lässt die Verbindung hängen, und die Transaktion endet nie.
            return (async function* () {
              let fertig = false;
              try {
                for await (const c of strom.iterator({ destroyOnReturn: false })) yield c as Buffer;
                fertig = true;
              } finally {
                if (!fertig) for await (const _ of strom) { /* Rest verwerfen */ }
              }
            })();
          },
        });
      })) as Awaited<ReturnType<typeof f>>;
    },
    async groesse() {
      const [{ n }] = await sql`SELECT pg_database_size(current_database())::bigint AS n`;
      return Number(n);
    },
  };
}
