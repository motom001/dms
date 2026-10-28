import type postgres from 'postgres';
import type { Dokument, Mappe, Mappentyp, MappentypDaten, Werte } from '../../shared/src/model';
import { istUuid, type Repo, type Verweis } from './repo';

type Sql = postgres.Sql;
type Zeile = Record<string, unknown>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const alsTyp = (r: Zeile): Mappentyp => ({
  id: r.id as string,
  name: r.name as string,
  beschreibung: r.beschreibung as string,
  titelVorlage: r.titel_vorlage as string,
  felder: r.felder as Mappentyp['felder'],
  register: r.register as Mappentyp['register'],
  trefferliste: (r.trefferliste as string[] | null) ?? [],
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
  demo: !!r.demo,
  titel: (r.titel as string | null) ?? undefined,
  passt: (r.passt as boolean | null) ?? undefined,
  problem: (r.problem as string | null) ?? null,
});
const alsDokument = (r: Zeile): Dokument => ({
  id: r.id as string,
  mappeId: r.mappe_id as string,
  registerKey: r.register_key as string,
  name: r.name as string,
  mime: r.mime as string,
  groesse: Number(r.groesse),
  sha256: r.sha256 as string,
  anzeigbar: r.anzeigbar as boolean,
  erstellt: iso(r.erstellt),
  erstelltVon: (r.erstellt_von as string | null) ?? null,
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
        INSERT INTO mappentypen (id, haushalt_id, name, beschreibung, titel_vorlage, felder, register, trefferliste)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${d.beschreibung}, ${d.titelVorlage}, ${json(sql, d.felder)}, ${json(sql, d.register)}, ${json(sql, d.trefferliste ?? [])})
        RETURNING *`;
      return alsTyp(r);
    },
    async aendereTyp(id, d) {
      return sql.begin(async (tx) => {
        const [r] = await tx`
          UPDATE mappentypen SET name = ${d.name}, beschreibung = ${d.beschreibung}, titel_vorlage = ${d.titelVorlage},
            felder = ${json(sql, d.felder)}, register = ${json(sql, d.register)}, trefferliste = ${json(sql, d.trefferliste ?? [])}, geaendert = now()
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
    async legeMappeAn(id, typId, werte, vs, benutzerId, demo = false) {
      return sql.begin(async (tx) => {
        const [r] = await tx`
          INSERT INTO mappen (id, haushalt_id, typ_id, werte, erstellt_von, geaendert_von, demo)
          VALUES (${id}, ${haushaltId}, ${typId}, ${json(sql, werte)}, ${benutzerId}, ${benutzerId}, ${demo})
          RETURNING *`;
        await schreibeVerweise(tx, id, vs);
        return alsMappe(r);
      });
    },
    async legeMappenAn(liste) {
      if (!liste.length) return;
      await sql.begin(async (tx) => {
        await tx`INSERT INTO mappen ${tx(liste.map((m) => ({
          id: m.id, haushalt_id: haushaltId, typ_id: m.typId, werte: json(sql, m.werte), titel: m.titel,
          erstellt_von: m.benutzerId, geaendert_von: m.benutzerId, demo: m.demo,
        })))}`;
        const vs = liste.flatMap((m) => m.verweise.filter((v) => istUuid(v.zielId))
          .map((v) => ({ quelle_id: m.id, feld_key: v.feldKey, ziel_id: v.zielId, haushalt_id: haushaltId })));
        if (vs.length) await tx`INSERT INTO verweise ${tx(vs)} ON CONFLICT DO NOTHING`;
      });
    },
    async aendereMappe(id, werte, vs, benutzerId) {
      return sql.begin(async (tx) => {
        const [r] = await tx`
          UPDATE mappen SET werte = ${json(sql, werte)}, geaendert = now(), geaendert_von = ${benutzerId}, passt = true, problem = NULL
          WHERE haushalt_id = ${haushaltId} AND id = ${id}
          RETURNING *`;
        await schreibeVerweise(tx, id, vs);
        return alsMappe(r);
      });
    },
    async loescheMappe(id) {
      await sql`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },

    async holeMappen(ids) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return [];
      return (await sql`SELECT * FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[])`).map(alsMappe);
    },
    async titelVon(ids) {
      const r = new Map<string, string>();
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return r;
      const zeilen = await sql`SELECT id, titel FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[])`;
      for (const z of zeilen) r.set(z.id as string, (z.titel as string | null) ?? '');
      return r;
    },
    async setzeTitel(liste) {
      // In Paketen, damit auch zehntausende Mappen nicht eine riesige Anweisung ergeben.
      for (let i = 0; i < liste.length; i += 1000) {
        const teil = liste.slice(i, i + 1000);
        await sql`
          UPDATE mappen m SET titel = n.titel
          FROM unnest(${teil.map((x) => x.id)}::uuid[], ${teil.map((x) => x.titel)}::text[]) AS n(id, titel)
          WHERE m.id = n.id AND m.haushalt_id = ${haushaltId}`;
      }
    },
    async quellenVon(zielIds) {
      const gueltig = [...new Set(zielIds.filter(istUuid))];
      if (!gueltig.length) return [];
      const r = await sql`SELECT DISTINCT quelle_id FROM verweise WHERE haushalt_id = ${haushaltId} AND ziel_id = ANY(${gueltig}::uuid[])`;
      return r.map((z) => z.quelle_id as string);
    },
    async bezuege(ids) {
      const r = new Map<string, { titel: string; typId: string }>();
      const gueltig = [...new Set(ids.filter(istUuid))];
      for (let i = 0; i < gueltig.length; i += 5000) {
        const zeilen = await sql`SELECT id, typ_id, titel FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig.slice(i, i + 5000)}::uuid[])`;
        for (const z of zeilen) r.set(z.id as string, { titel: (z.titel as string | null) ?? '', typId: z.typ_id as string });
      }
      return r;
    },
    async seite(o) {
      const typ = o.typId && istUuid(o.typId) ? sql`AND typ_id = ${o.typId}` : o.typId ? sql`AND false` : sql``;
      const eingang = o.eingang
        ? sql`AND passt IS NOT TRUE AND (erstellt_von = ${istUuid(o.eingang.benutzerId) ? o.eingang.benutzerId : null}::uuid ${o.eingang.admin ? sql`OR erstellt_von IS NULL` : sql``})`
        : sql``;
      const muster = o.suche ? `%${o.suche.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
      const suche = muster
        ? sql`AND (titel ILIKE ${muster} OR EXISTS (SELECT 1 FROM jsonb_each_text(werte) e WHERE e.value ILIKE ${muster}))`
        : sql``;
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} ${typ} ${eingang} ${suche}`;
      const so = o.sortierung;
      const k = so?.key ?? '';
      const ausdruck = !so || so.art === 'titel' ? sql`lower(titel)`
        : so.art === 'erstellt' ? sql`erstellt` : so.art === 'geaendert' ? sql`geaendert`
        : so.art === 'erstelltVon' ? sql`(SELECT lower(coalesce(nullif(b.name, ''), b.email)) FROM benutzer b WHERE b.id = mappen.erstellt_von)`
        : so.art === 'geaendertVon' ? sql`(SELECT lower(coalesce(nullif(b.name, ''), b.email)) FROM benutzer b WHERE b.id = mappen.geaendert_von)`
        : so.art === 'typ' ? sql`(SELECT lower(t.name) FROM mappentypen t WHERE t.id = mappen.typ_id)`
        : so.art === 'zahl' || so.art === 'janein' ? sql`(werte -> ${k}::text)`
        : so.art === 'betrag' ? sql`((werte -> ${k}::text ->> 'betrag')::numeric)`
        : so.art === 'datum' ? sql`(werte ->> ${k}::text)`
        : sql`lower(werte ->> ${k}::text)`;
      const richtung = so?.absteigend ? sql`DESC NULLS LAST` : sql`ASC NULLS LAST`;
      const r = await sql`
        SELECT * FROM mappen WHERE haushalt_id = ${haushaltId} ${typ} ${eingang} ${suche}
        ORDER BY ${ausdruck} ${richtung}, lower(titel), id OFFSET ${o.von} LIMIT ${o.anzahl}`;
      return { gesamt: n as number, mappen: r.map(alsMappe) };
    },
    async zaehler(benutzerId, admin) {
      const r = await sql`
        SELECT typ_id, count(*)::int AS anzahl,
          count(*) FILTER (WHERE passt IS NOT TRUE)::int AS unpassend,
          count(*) FILTER (WHERE demo)::int AS demo,
          count(*) FILTER (WHERE passt IS NOT TRUE AND (erstellt_von = ${istUuid(benutzerId) ? benutzerId : null}::uuid OR (${admin} AND erstellt_von IS NULL)))::int AS eingang
        FROM mappen WHERE haushalt_id = ${haushaltId} GROUP BY typ_id`;
      return {
        typen: new Map(r.map((z) => [z.typ_id as string, { anzahl: z.anzahl as number, unpassend: z.unpassend as number, demo: z.demo as number }])),
        eingang: r.reduce((a, z) => a + (z.eingang as number), 0),
      };
    },
    async setzePassung(liste) {
      for (let i = 0; i < liste.length; i += 1000) {
        const teil = liste.slice(i, i + 1000);
        await sql`
          UPDATE mappen m SET passt = n.problem IS NULL, problem = n.problem
          FROM unnest(${teil.map((x) => x.id)}::uuid[], ${teil.map((x) => x.problem)}::text[]) AS n(id, problem)
          WHERE m.id = n.id AND m.haushalt_id = ${haushaltId}`;
      }
    },
    async unpassende(typId) {
      if (!istUuid(typId)) return [];
      return (await sql`SELECT id FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId} AND passt IS NOT TRUE`).map((z) => z.id as string);
    },
    async typenOhnePassung() {
      return (await sql`SELECT DISTINCT typ_id FROM mappen WHERE haushalt_id = ${haushaltId} AND passt IS NULL`).map((z) => z.typ_id as string);
    },
    async belegung(typId) {
      if (!istUuid(typId)) return {};
      const r = await sql`
        SELECT e.key, count(*)::int AS n FROM mappen m, jsonb_each(m.werte) e
        WHERE m.haushalt_id = ${haushaltId} AND m.typ_id = ${typId}
          AND e.value NOT IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
        GROUP BY e.key`;
      return Object.fromEntries(r.map((z) => [z.key as string, z.n as number]));
    },
    async ohneTitel() {
      return (await sql`SELECT id FROM mappen WHERE haushalt_id = ${haushaltId} AND titel IS NULL`).map((z) => z.id as string);
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
        SELECT v.quelle_id, v.feld_key, m.typ_id, m.titel
        FROM verweise v JOIN mappen m ON m.id = v.quelle_id
        WHERE v.ziel_id = ${zielId} AND v.haushalt_id = ${haushaltId}
        ORDER BY lower(m.titel), m.id`;
      return r.map((z) => ({ quelleId: z.quelle_id as string, quelleTypId: z.typ_id as string, feldKey: z.feld_key as string, titel: (z.titel as string | null) ?? '' }));
    },

    async listeDokumente(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT * FROM dokumente WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY erstellt DESC`).map(alsDokument);
    },
    async holeDokument(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsDokument(r) : undefined;
    },
    async legeDokumentAn(d) {
      const [r] = await sql`
        INSERT INTO dokumente (id, haushalt_id, mappe_id, register_key, name, mime, groesse, sha256, anzeigbar, erstellt_von)
        VALUES (${d.id}, ${haushaltId}, ${d.mappeId}, ${d.registerKey}, ${d.name}, ${d.mime}, ${d.groesse}, ${d.sha256}, ${d.anzeigbar}, ${d.erstelltVon})
        RETURNING *`;
      return alsDokument(r);
    },
    async loescheDokument(id) {
      await sql`DELETE FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async dokumenteMitSha(sha256) {
      return (await sql`SELECT * FROM dokumente WHERE haushalt_id = ${haushaltId} AND sha256 = ${sha256}`).map(alsDokument);
    },
    async zaehleDemo() {
      const r = await sql`SELECT typ_id, count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} AND demo GROUP BY typ_id`;
      return new Map(r.map((z) => [z.typ_id as string, z.n as number]));
    },
    async echteVerweiseAufDemo() {
      const [r] = await sql`
        SELECT count(DISTINCT q.id)::int AS n FROM verweise v
        JOIN mappen q ON q.id = v.quelle_id JOIN mappen z ON z.id = v.ziel_id
        WHERE z.demo AND NOT q.demo AND z.haushalt_id = ${haushaltId}`;
      return r.n as number;
    },
    async loescheDemo() {
      return sql.begin(async (tx) => {
        const dateien = (await tx`
          SELECT DISTINCT d.sha256 FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
          WHERE m.demo AND m.haushalt_id = ${haushaltId}`).map((z) => z.sha256 as string);
        // Demo-Mappen verweisen aufeinander. Erst die Verweise entfernen, sonst greift der
        // Fremdschlüssel auf ziel_id je nach Reihenfolge der Prüfungen vor der Kaskade.
        await tx`DELETE FROM verweise v USING mappen m
          WHERE m.id = v.quelle_id AND m.demo AND m.haushalt_id = ${haushaltId}`;
        const r = await tx`DELETE FROM mappen WHERE demo AND haushalt_id = ${haushaltId}`;
        return { anzahl: r.count, dateien };
      });
    },
    async dokumenteJeRegister(typId) {
      const r = await sql`
        SELECT d.register_key, count(*)::int AS n FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
        WHERE m.typ_id = ${typId} AND d.haushalt_id = ${haushaltId} GROUP BY d.register_key`;
      return new Map(r.map((z) => [z.register_key as string, z.n as number]));
    },
  };
}
