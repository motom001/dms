/** Dokumente (PostgreSQL): lesen, anlegen, verschieben, Anlagen, Versionen (#194) und Dateien. */
import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { alsDokument, alsVersion } from './zeilen';
import type { GelesenerCode } from '../../../../shared/src/codes';

/** Dokumente lesen, anlegen, verschieben, löschen; Anlagen (#998). */
export function pgDokumente(k: PgKontext) {
  const { sql, haushaltId, DOK, DOK_RUECK } = k;
  return {
    async zaehleDokumente(ids) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return new Map();
      const r =
        await sql`SELECT mappe_id, count(*)::int AS n FROM dokumente WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) GROUP BY mappe_id`;
      return new Map(r.map((z) => [z.mappe_id as string, z.n as number]));
    },
    async listeDokumente(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (
        await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.mappe_id = ${mappeId} ORDER BY d.erstellt DESC`
      ).map(alsDokument);
    },
    async dokumenteVon(mappeIds) {
      const gueltig = [...new Set(mappeIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (
        await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.mappe_id = ANY(${gueltig}::uuid[]) ORDER BY d.mappe_id, d.erstellt DESC`
      ).map(alsDokument);
    },
    async holeDokument(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.id = ${id}`;
      return r ? alsDokument(r) : undefined;
    },
    async mappenVonDokumenten(ids) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return new Map();
      const r = await sql`SELECT id, mappe_id FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[])`;
      return new Map(r.map((z) => [z.id as string, z.mappe_id as string]));
    },
    async setzeDokumentErstellt(id, erstellt) {
      if (istUuid(id)) await sql`UPDATE dokumente SET erstellt = ${erstellt} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async legeDokumentAn(d) {
      const [r] = await sql`
        INSERT INTO dokumente (id, haushalt_id, mappe_id, register_key, name, mime, groesse, sha256, anzeigbar, erstellt_von, herkunft, original_email)
        VALUES (${d.id}, ${haushaltId}, ${d.mappeId}, ${d.registerKey}, ${d.name}, ${d.mime}, ${d.groesse}, ${d.sha256}, ${d.anzeigbar}, ${d.erstelltVon}, ${d.herkunft ?? null}, ${d.originalEmail === true ? true : null})
        RETURNING ${DOK_RUECK}`;
      return alsDokument(r);
    },
    async setzeEingang(id, x) {
      if (!istUuid(id) || (x.nr === undefined && x.originalEmail === undefined && x.fuer === undefined)) return;
      await sql`UPDATE dokumente SET
        eingang_nr = ${x.nr === undefined ? sql`eingang_nr` : x.nr && x.nr > 0 ? Math.round(x.nr) : null},
        original_email = ${x.originalEmail === undefined ? sql`original_email` : x.originalEmail},
        eingang_fuer = ${x.fuer === undefined ? sql`eingang_fuer` : x.fuer && istUuid(x.fuer) ? x.fuer : null}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async loescheDokument(id) {
      await sql`DELETE FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async verschiebeDokument(id, mappeId, registerKey) {
      if (!istUuid(id)) return;
      // Anlagen (#998) wandern mit ihrem Hauptdokument; eine Anlage allein in eine andere Mappe ist danach ein eigenes Dokument.
      await sql`UPDATE dokumente SET mappe_id = ${mappeId}, register_key = ${registerKey} WHERE haushalt_id = ${haushaltId} AND (id = ${id} OR anlage_zu = ${id})`;
      await sql`UPDATE dokumente d SET anlage_zu = NULL, anlage_nr = NULL WHERE d.haushalt_id = ${haushaltId} AND d.id = ${id} AND d.anlage_zu IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dokumente h WHERE h.id = d.anlage_zu AND h.mappe_id = d.mappe_id)`;
    },
    async anlagenVon(id) {
      if (!istUuid(id)) return [];
      return (
        await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.anlage_zu = ${id} ORDER BY d.anlage_nr, d.name, d.id`
      ).map(alsDokument);
    },
    async setzeAnlage(id, anlageZu, nr, name) {
      if (!istUuid(id) || (anlageZu !== null && !istUuid(anlageZu))) return false;
      const r =
        await sql`UPDATE dokumente SET anlage_zu = ${anlageZu}, anlage_nr = ${anlageZu ? nr : null} ${name !== undefined ? sql`, name = ${name}` : sql``}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r.count > 0;
    },
    async benenneDokument(id, name) {
      if (!istUuid(id)) return false;
      const r = await sql`UPDATE dokumente SET name_original = coalesce(name_original, name), name = ${name}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r.count > 0;
    },
    async setzeVerkleinert(id, sha256, dpi) {
      if (!istUuid(id)) return;
      await sql`UPDATE dokumente SET verkleinert = ${sql.json({ sha256, dpi })}
        WHERE haushalt_id = ${haushaltId} AND id = ${id} AND sha256 = ${sha256}`;
    },
    async dokumenteJeRegister(typId) {
      const r = await sql`
        SELECT d.register_key, count(*)::int AS n FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
        WHERE m.typ_id = ${typId} AND d.haushalt_id = ${haushaltId} GROUP BY d.register_key`;
      return new Map(r.map((z) => [z.register_key as string, z.n as number]));
    },
  } satisfies RepoTeil;
}

/** Codes auf dem Dokument (#1723): eigene Abfrage, nicht in DOKUMENT_SPALTEN – sie gehören nicht zum Dokument der API. */
export function pgDokumentCodes(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    async liesCodes(id) {
      if (!istUuid(id)) return null;
      const [r] = await sql`SELECT codes FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      const c = r?.codes as { sha256?: unknown; codes?: unknown } | null | undefined;
      return c && typeof c.sha256 === 'string' && Array.isArray(c.codes) ? { sha256: c.sha256, codes: c.codes as GelesenerCode[] } : null;
    },
    async merkeCodes(id, sha256, codes) {
      if (!istUuid(id)) return;
      await sql`UPDATE dokumente SET codes = ${sql.json({ sha256, codes } as never)}
        WHERE haushalt_id = ${haushaltId} AND id = ${id} AND sha256 = ${sha256}`;
    },
  } satisfies RepoTeil;
}

/** Ältere Versionen eines Dokuments (#194). */
export function pgVersionen(k: PgKontext) {
  const { sql, haushaltId, DOK_RUECK, VERS } = k;
  return {
    /* ---------- Versionierung (#194) ---------- */
    async versionenVon(dokumentId) {
      if (!istUuid(dokumentId)) return [];
      return (
        await sql`SELECT ${VERS} FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} ORDER BY nummer DESC`
      ).map(alsVersion);
    },
    async versionenVonDokumenten(dokumentIds) {
      const gueltig = [...new Set(dokumentIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (
        await sql`SELECT ${VERS} FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ANY(${gueltig}::uuid[]) ORDER BY dokument_id, nummer DESC`
      ).map(alsVersion);
    },
    async holeVersion(dokumentId, nummer) {
      if (!istUuid(dokumentId) || !Number.isInteger(nummer)) return undefined;
      const [r] =
        await sql`SELECT * FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} AND nummer = ${nummer}`;
      return r ? { ...alsVersion(r), volltext: (r.volltext as string | null) ?? null } : undefined;
    },
    async ersetzeDokument(id, neu) {
      return sql.begin(async (tx) => {
        const [alt] = await tx`SELECT version FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id} FOR UPDATE`;
        if (!alt) throw new Error('Dokument fehlt');
        const nummer = (alt.version as number | null) ?? 1;
        // In der Datenbank kopieren: der Volltext muss nicht zum Server und zurück (#367).
        await tx`
          INSERT INTO dokument_versionen (dokument_id, haushalt_id, nummer, name, mime, groesse, sha256, anzeigbar, erstellt, erstellt_von, herkunft, volltext)
          SELECT id, haushalt_id, ${nummer}, name, mime, groesse, sha256, anzeigbar, erstellt, erstellt_von, herkunft, volltext
          FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
        const uebernehmen = neu.volltext !== undefined;
        const [r] = await tx`
          UPDATE dokumente SET name = ${neu.name}, mime = ${neu.mime}, groesse = ${neu.groesse}, sha256 = ${neu.sha256}, anzeigbar = ${neu.anzeigbar},
            erstellt = now(), erstellt_von = ${neu.erstelltVon}, herkunft = ${neu.herkunft}, version = ${nummer + 1},
            volltext = ${uebernehmen ? (neu.volltext ?? null) : null}, ocr_stand = ${uebernehmen && neu.volltext != null ? 'fertig' : 'keiner'},
            ocr_info = NULL, ocr_seiten = NULL, ocr_zeit = ${uebernehmen && neu.volltext != null ? sql`now()` : null},
            weitere_sprachen = NULL, seitensprachen = NULL, teilen_hinweis_aus = NULL, leerseiten = NULL
          WHERE haushalt_id = ${haushaltId} AND id = ${id}
          RETURNING ${DOK_RUECK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = ${id}) AS aeltere`;
        return alsDokument(r);
      });
    },
    async kuerzeVersionen(dokumentId, behalten) {
      const weg = await sql`
        DELETE FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId}
          AND nummer NOT IN (SELECT nummer FROM dokument_versionen WHERE dokument_id = ${dokumentId} ORDER BY nummer DESC LIMIT ${Math.max(0, behalten)})
        RETURNING sha256`;
      return [...new Set(weg.map((r) => r.sha256 as string))];
    },
    async loescheVersion(dokumentId, nummer) {
      const [r] =
        await sql`DELETE FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} AND nummer = ${nummer} RETURNING sha256`;
      return r ? (r.sha256 as string) : null;
    },
  } satisfies RepoTeil;
}

/** Dateien über alle Dokumente: Prüfsummen, Arten, große PDFs. */
export function pgDateien(k: PgKontext) {
  const { sql, haushaltId, DOK } = k;
  return {
    async alleDateien() {
      const r = await sql`
        SELECT d.sha256, d.groesse, d.id AS dokument_id, d.mappe_id, d.name, coalesce(d.version, 1) AS version FROM dokumente d WHERE d.haushalt_id = ${haushaltId}
        UNION ALL
        SELECT v.sha256, v.groesse, v.dokument_id, d.mappe_id, v.name, v.nummer FROM dokument_versionen v JOIN dokumente d ON d.id = v.dokument_id WHERE v.haushalt_id = ${haushaltId}`;
      return r.map((z) => ({
        sha256: z.sha256 as string,
        groesse: Number(z.groesse),
        dokumentId: z.dokument_id as string,
        mappeId: z.mappe_id as string,
        name: z.name as string,
        version: Number(z.version),
      }));
    },
    async dateiBenutzt(sha256) {
      const [r] = await sql`
        SELECT EXISTS (SELECT 1 FROM dokumente WHERE haushalt_id = ${haushaltId} AND sha256 = ${sha256})
          OR EXISTS (SELECT 1 FROM papierkorb_dokumente p WHERE p.haushalt_id = ${haushaltId} AND (p.dokument ->> 'sha256' = ${sha256} OR EXISTS (SELECT 1 FROM jsonb_array_elements(p.versionen) v WHERE v.value ->> 'sha256' = ${sha256})))
          OR EXISTS (SELECT 1 FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND sha256 = ${sha256})
          OR EXISTS (SELECT 1 FROM papierkorb p, jsonb_array_elements(p.dokumente) d WHERE p.haushalt_id = ${haushaltId} AND d.value ->> 'sha256' = ${sha256})
          OR EXISTS (SELECT 1 FROM papierkorb p, jsonb_array_elements(p.versionen) v WHERE p.haushalt_id = ${haushaltId} AND v.value ->> 'sha256' = ${sha256}) AS ja`;
      return r.ja as boolean;
    },
    async dokumenteMitSha(sha256) {
      return (await sql`SELECT ${DOK} FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.sha256 = ${sha256}`).map(alsDokument);
    },
    async dokumenteMitTyp(mimes) {
      if (!mimes.length) return [];
      return (
        await sql`SELECT ${DOK} FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.mime = ANY(${mimes}::text[]) ORDER BY d.erstellt, d.id`
      ).map(alsDokument);
    },
    async dokumentTypen() {
      const z: Record<string, number> = {};
      for (const r of await sql`SELECT mime, count(*)::int AS n FROM dokumente WHERE haushalt_id = ${haushaltId} GROUP BY mime`)
        z[r.mime as string] = r.n as number;
      return z;
    },
    async grossePdfs(ab, max) {
      return (
        await sql`
        SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere FROM dokumente d
        WHERE d.haushalt_id = ${haushaltId} AND d.mime = 'application/pdf' AND d.groesse >= ${ab}
        ORDER BY d.groesse DESC, d.id LIMIT ${max}`
      ).map(alsDokument);
    },
  } satisfies RepoTeil;
}
