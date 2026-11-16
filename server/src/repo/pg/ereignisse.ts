/** Ereignisse (PostgreSQL): Zustellung an Pakete und Ereigniskatalog (#670). */
import type { RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';

/** Ereignisse an Pakete: anlegen, fällige holen, zugestellt oder fehlgeschlagen. */
export function pgEreignisse(k: PgKontext) {
  const { sql, haushaltId, stand } = k;
  return {
    async legeEreignisseAn(liste) {
      if (!liste.length) return;
      // Gleiche Id = schon angelegt (#670: Ereignisse aus dem Katalog kommen mindestens einmal).
      await sql`INSERT INTO paket_ereignisse ${sql(liste.map((e) => ({ id: e.id, haushalt_id: haushaltId, paket_id: e.paketId, art: e.art, daten: json(sql, e.daten) })))} ON CONFLICT (id) DO NOTHING`;
    },
    async faelligeEreignisse(anzahl) {
      // Reihenfolge je Paket: Wartet ein älteres Ereignis auf seine Wiederholung, warten die späteren mit.
      return (
        await sql`SELECT e.id, e.paket_id, e.art, e.daten, e.erstellt, e.versuche FROM paket_ereignisse e
        WHERE e.haushalt_id = ${haushaltId} AND e.zugestellt IS NULL AND e.faellig <= now()
          AND NOT EXISTS (SELECT 1 FROM paket_ereignisse a WHERE a.haushalt_id = e.haushalt_id AND a.paket_id = e.paket_id
            AND a.zugestellt IS NULL AND a.faellig > now() AND a.faellig <> 'infinity' AND a.erstellt < e.erstellt)
        ORDER BY e.erstellt, e.id LIMIT ${anzahl}`
      ).map((r) => ({
        id: r.id as string,
        paketId: r.paket_id as string,
        art: r.art as string,
        daten: r.daten as Record<string, unknown>,
        erstellt: (r.erstellt as Date).toISOString(),
        versuche: r.versuche as number,
      }));
    },
    async ereignisZugestellt(id) {
      await sql`UPDATE paket_ereignisse SET zugestellt = now(), fehler = NULL WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      // Aufräumen höchstens alle 10 Minuten: Zugestelltes bleibt 7 Tage (für die Übersicht), Aufgegebenes 30 Tage.
      if (Date.now() - stand.ereignisseAufgeraeumt < 600_000) return;
      stand.ereignisseAufgeraeumt = Date.now();
      await sql`DELETE FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} AND (zugestellt < now() - interval '7 days' OR (zugestellt IS NULL AND faellig = 'infinity' AND erstellt < now() - interval '30 days'))`;
    },
    async ereignisDaten(id, daten) {
      await sql`UPDATE paket_ereignisse SET daten = ${json(sql, daten)} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async ereignisFehlgeschlagen(id, fehler, naechster) {
      await sql`UPDATE paket_ereignisse SET versuche = versuche + 1, fehler = ${fehler.slice(0, 1000)},
        faellig = ${naechster ? sql`${naechster}` : sql`'infinity'::timestamptz`} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async ereignisStand() {
      const erg: Record<string, { offen: number; aufgegeben: number; zugestellt: number; zuletzt: string | null }> = {};
      for (const r of await sql`SELECT paket_id,
          count(*) FILTER (WHERE zugestellt IS NULL AND faellig <> 'infinity')::int AS offen,
          count(*) FILTER (WHERE zugestellt IS NULL AND faellig = 'infinity')::int AS aufgegeben,
          count(*) FILTER (WHERE zugestellt IS NOT NULL)::int AS zugestellt,
          max(zugestellt) AS zuletzt
        FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} GROUP BY paket_id`)
        erg[r.paket_id as string] = {
          offen: r.offen as number,
          aufgegeben: r.aufgegeben as number,
          zugestellt: r.zugestellt as number,
          zuletzt: r.zuletzt ? (r.zuletzt as Date).toISOString() : null,
        };
      return erg;
    },
    async merkeFristMeldung(f) {
      const r = await sql`INSERT INTO frist_meldungen (haushalt_id, mappe_id, feld, datum, zeitpunkt)
        VALUES (${haushaltId}, ${f.mappeId}, ${f.feld}, ${f.datum}, ${f.zeitpunkt}) ON CONFLICT DO NOTHING RETURNING 1`;
      return r.length > 0;
    },
    async loescheEreignisse(id) {
      await sql`DELETE FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`;
    },
    async loescheOffeneEreignisse(art, dokumente) {
      if (!dokumente.length) return 0;
      const r =
        await sql`DELETE FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} AND art = ${art} AND zugestellt IS NULL AND daten->>'dokument' = ANY(${dokumente}::text[])`;
      return r.count;
    },
  } satisfies RepoTeil;
}

/** Ereigniskatalog (#670): anlegen, verteilen, aufräumen. */
export function pgKatalog(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    async legeKatalogEreignisAn(e, mische) {
      if (e.buendel && mische) {
        // Zusammenfassen (#670): ein offenes, noch nicht geholtes Ereignis mit demselben Bündel, dessen Frist noch läuft.
        const [da] = await sql`SELECT id, daten FROM ereignisse WHERE haushalt_id = ${haushaltId} AND buendel = ${e.buendel}
          AND verteilt IS NULL AND gesperrt_bis IS NULL AND versuche = 0 AND faellig > now() ORDER BY nr LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (da) {
          await sql`UPDATE ereignisse SET daten = ${json(sql, mische(da.daten as Record<string, unknown>))} WHERE haushalt_id = ${haushaltId} AND id = ${da.id as string}`;
          return da.id as string;
        }
      }
      await sql`INSERT INTO ereignisse (id, haushalt_id, art, daten, ausloeser, buendel, faellig)
        VALUES (${e.id}, ${haushaltId}, ${e.art}, ${json(sql, e.daten)}, ${json(sql, e.ausloeser)}, ${e.buendel ?? null},
          now() + make_interval(secs => ${e.buendel ? (e.buendelS ?? 0) : 0}))`;
      return e.id;
    },
    async holeKatalogEreignisse(anzahl, sperreS) {
      return (
        await sql`UPDATE ereignisse SET gesperrt_bis = now() + make_interval(secs => ${sperreS})
        WHERE haushalt_id = ${haushaltId} AND id IN (SELECT id FROM ereignisse WHERE haushalt_id = ${haushaltId} AND verteilt IS NULL
          AND faellig <= now() AND (gesperrt_bis IS NULL OR gesperrt_bis < now()) ORDER BY nr LIMIT ${anzahl} FOR UPDATE SKIP LOCKED)
        RETURNING id, nr, art, daten, ausloeser, erstellt, versuche`
      )
        .map((r) => ({
          id: r.id as string,
          nr: Number(r.nr),
          art: r.art as string,
          daten: r.daten as Record<string, unknown>,
          ausloeser: r.ausloeser as Record<string, unknown>,
          erstellt: (r.erstellt as Date).toISOString(),
          versuche: r.versuche as number,
        }))
        .sort((a, b) => a.nr - b.nr);
    },
    async katalogEreignisseVerteilt(ids) {
      if (!ids.length) return;
      await sql`UPDATE ereignisse SET verteilt = now(), fehler = NULL, gesperrt_bis = NULL WHERE haushalt_id = ${haushaltId} AND id = ANY(${ids}::uuid[])`;
    },
    async katalogEreignisFehlgeschlagen(id, fehler, naechster) {
      await sql`UPDATE ereignisse SET versuche = versuche + 1, fehler = ${fehler.slice(0, 1000)}, gesperrt_bis = NULL,
        faellig = ${naechster ? sql`${naechster}` : sql`faellig`}, verteilt = ${naechster ? null : sql`now()`}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async raeumeKatalogEreignisseAuf(tage) {
      const r = await sql`DELETE FROM ereignisse WHERE haushalt_id = ${haushaltId} AND verteilt < now() - make_interval(days => ${tage})`;
      await sql`DELETE FROM frist_meldungen WHERE haushalt_id = ${haushaltId} AND datum < (now() - interval '1 year')::date`;
      return r.count;
    },
    async katalogEreignisStand() {
      const [r] = await sql`SELECT count(*) FILTER (WHERE verteilt IS NULL)::int AS offen,
          count(*) FILTER (WHERE verteilt IS NOT NULL AND fehler IS NOT NULL)::int AS aufgegeben,
          count(*) FILTER (WHERE verteilt IS NOT NULL AND fehler IS NULL)::int AS verteilt,
          min(erstellt) FILTER (WHERE verteilt IS NULL) AS aeltestes
        FROM ereignisse WHERE haushalt_id = ${haushaltId}`;
      return {
        offen: r.offen as number,
        aufgegeben: r.aufgegeben as number,
        verteilt: r.verteilt as number,
        aeltestesOffen: r.aeltestes ? (r.aeltestes as Date).toISOString() : null,
      };
    },
  } satisfies RepoTeil;
}
