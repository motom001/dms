import type postgres from 'postgres';
import type { Mappe, Mappentyp, MappentypDaten, Werte } from '../../shared/src/model';
import { istUuid, type Repo, type Verweis } from './repo';

type Sql = postgres.Sql;
type Zeile = Record<string, unknown>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const alsTyp = (r: Zeile): Mappentyp => ({
  id: r.id as string,
  name: r.name as string,
  beschreibung: r.beschreibung as string,
  titelFeld: r.titel_feld as string,
  felder: r.felder as Mappentyp['felder'],
  erstellt: iso(r.erstellt),
  geaendert: iso(r.geaendert),
});
const alsMappe = (r: Zeile): Mappe => ({
  id: r.id as string,
  typId: r.typ_id as string,
  werte: r.werte as Werte,
  erstellt: iso(r.erstellt),
  erstelltVon: (r.erstellt_von as string | null) ?? null,
  geaendert: iso(r.geaendert),
  geaendertVon: (r.geaendert_von as string | null) ?? null,
});
// postgres.js erwartet für jsonb einen JSON-Wert; unsere Typen sind JSON-kompatibel.
const json = (sql: Sql, v: unknown) => sql.json(v as postgres.JSONValue);

/** PostgreSQL-Umsetzung für genau einen Haushalt. */
export function pgRepo(sql: Sql, haushaltId: string): Repo {
  async function schreibeVerweise(tx: postgres.TransactionSql, quelleId: string, vs: Verweis[]) {
    await tx`DELETE FROM verweise WHERE quelle_id = ${quelleId}`;
    const gueltig = vs.filter((v) => istUuid(v.zielId));
    if (!gueltig.length) return;
    const zeilen = gueltig.map((v) => ({ quelle_id: quelleId, feld_key: v.feldKey, ziel_id: v.zielId, haushalt_id: haushaltId }));
    await tx`INSERT INTO verweise ${tx(zeilen)} ON CONFLICT DO NOTHING`;
  }

  return {
    async listeTypen() {
      const r = await sql`SELECT * FROM mappentypen WHERE haushalt_id = ${haushaltId} ORDER BY lower(name)`;
      return r.map(alsTyp);
    },
    async holeTyp(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM mappentypen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsTyp(r) : undefined;
    },
    async legeTypAn(id, d: MappentypDaten) {
      const [r] = await sql`
        INSERT INTO mappentypen (id, haushalt_id, name, beschreibung, titel_feld, felder)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${d.beschreibung}, ${d.titelFeld}, ${json(sql, d.felder)})
        RETURNING *`;
      return alsTyp(r);
    },
    async aendereTyp(id, d) {
      return sql.begin(async (tx) => {
        const [r] = await tx`
          UPDATE mappentypen SET name = ${d.name}, beschreibung = ${d.beschreibung}, titel_feld = ${d.titelFeld},
            felder = ${json(sql, d.felder)}, geaendert = now()
          WHERE haushalt_id = ${haushaltId} AND id = ${id}
          RETURNING *`;
        const refKeys = d.felder.filter((f) => f.typ === 'referenz').map((f) => f.key);
        await tx`
          DELETE FROM verweise
          WHERE quelle_id IN (SELECT id FROM mappen WHERE typ_id = ${id})
            AND NOT (feld_key = ANY(${refKeys}::text[]))`;
        return alsTyp(r);
      });
    },
    async loescheTyp(id) {
      await sql`DELETE FROM mappentypen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async zaehleMappen(typId) {
      const [r] = await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId}`;
      return r.n as number;
    },

    async listeMappen(typId) {
      const r = typId
        ? (istUuid(typId) ? await sql`SELECT * FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId} ORDER BY erstellt` : [])
        : await sql`SELECT * FROM mappen WHERE haushalt_id = ${haushaltId} ORDER BY erstellt`;
      return r.map(alsMappe);
    },
    async holeMappe(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsMappe(r) : undefined;
    },
    async legeMappeAn(id, typId, werte, vs, benutzerId) {
      return sql.begin(async (tx) => {
        const [r] = await tx`
          INSERT INTO mappen (id, haushalt_id, typ_id, werte, erstellt_von, geaendert_von)
          VALUES (${id}, ${haushaltId}, ${typId}, ${json(sql, werte)}, ${benutzerId}, ${benutzerId})
          RETURNING *`;
        await schreibeVerweise(tx, id, vs);
        return alsMappe(r);
      });
    },
    async aendereMappe(id, werte, vs, benutzerId) {
      return sql.begin(async (tx) => {
        const [r] = await tx`
          UPDATE mappen SET werte = ${json(sql, werte)}, geaendert = now(), geaendert_von = ${benutzerId}
          WHERE haushalt_id = ${haushaltId} AND id = ${id}
          RETURNING *`;
        await schreibeVerweise(tx, id, vs);
        return alsMappe(r);
      });
    },
    async loescheMappe(id) {
      await sql`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },

    async typenVon(ids) {
      const r = new Map<string, string>();
      const gueltig = ids.filter(istUuid);
      if (!gueltig.length) return r;
      const zeilen = await sql`SELECT id, typ_id FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[])`;
      for (const z of zeilen) r.set(z.id as string, z.typ_id as string);
      return r;
    },
    async findeDoppelt(typId, feldKey, wert, ausser) {
      const [r] = await sql`
        SELECT * FROM mappen
        WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId}
          AND id <> ${istUuid(ausser) ? ausser : '00000000-0000-0000-0000-000000000000'}
          AND lower(trim(werte ->> ${feldKey})) = lower(trim(${wert}))
        LIMIT 1`;
      return r ? alsMappe(r) : undefined;
    },
    async rueckverweise(zielId) {
      if (!istUuid(zielId)) return [];
      const r = await sql`
        SELECT v.quelle_id, v.feld_key, m.typ_id
        FROM verweise v JOIN mappen m ON m.id = v.quelle_id
        WHERE v.ziel_id = ${zielId} AND v.haushalt_id = ${haushaltId}`;
      return r.map((z) => ({ quelleId: z.quelle_id as string, quelleTypId: z.typ_id as string, feldKey: z.feld_key as string }));
    },
  };
}
