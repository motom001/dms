/** Mappen (PostgreSQL): lesen, anlegen, ändern, Titel, Systemmappen, Stände und Verweise. */
import { fristMonat } from '../../../../shared/src/fristen';
import type { Werte } from '../../../../shared/src/model';
import { erhoeheMappenstand, erhoeheZahlenstand, liesStand } from '../../lesespeicher';
import { feldweise, istUuid, type RepoTeil, StandVeraltet } from '..';
import type { PgKontext } from './kontext';
import { STATISTIK_SPALTEN } from './spalten';
import { json } from './sql';
import { alsMappe, iso } from './zeilen';

/** Mappen lesen: einzeln, je Typ, mit Datum oder Frist, Titel und Typen. */
export function pgMappenLesen(k: PgKontext) {
  const { sql, haushaltId, MAP } = k;
  return {
    async zaehleMappen(typId) {
      const [r] = await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId}`;
      return r.n as number;
    },
    async listeMappen(typId) {
      const r = typId
        ? istUuid(typId)
          ? await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId} ORDER BY erstellt`
          : []
        : await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} ORDER BY erstellt`;
      return r.map(alsMappe);
    },
    async mappenMitDatum(typId, felder, von, bis) {
      if (!istUuid(typId) || !felder.length) return [];
      // Datumswerte stehen als Text JJJJ-MM-TT in werte; der Textvergleich ordnet sie richtig.
      const r = await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId}
        AND EXISTS (SELECT 1 FROM unnest(${felder}::text[]) AS f(k) WHERE werte->>f.k BETWEEN ${von} AND ${bis})
        ORDER BY erstellt`;
      return r.map(alsMappe);
    },
    async fristKandidaten(typId, felder, ab, bis) {
      if (!istUuid(typId) || !felder.length) return [];
      // Vorfilter aus fristtermine (#918, Migration 086, per Trigger mit der Mappe gepflegt). Wiederkehrend: ein Monat im
      // Zeitraum, der um ein Vielfaches des Rhythmus nach dem des Datums liegt (wie kannTerminHaben in shared/src/fristen.ts).
      const alle = felder.map((f) => f.key);
      const wk = felder.filter((f) => f.monate && f.monate >= 1);
      const von = fristMonat(ab);
      const ende = fristMonat(bis);
      const wiederkehrend = wk.length
        ? sql`OR (f.datum <= ${bis} AND EXISTS (SELECT 1 FROM unnest(${wk.map((f) => f.key)}::text[], ${wk.map((f) => Math.trunc(f.monate!))}::int[]) AS w(k, n)
            WHERE w.k = f.feld AND (f.monat IS NULL OR ${von === null || ende === null} OR (
              greatest(${von}::int, f.monat + w.n) + (((f.monat - greatest(${von}::int, f.monat + w.n)) % w.n) + w.n) % w.n <= ${ende}::int))))`
        : sql``;
      const r = await sql`
        SELECT m.id, m.typ_id, m.titel,
          (SELECT coalesce(jsonb_object_agg(k.k, m.werte -> k.k), '{}'::jsonb) FROM unnest(${alle}::text[]) AS k(k) WHERE m.werte ? k.k) AS werte
        FROM mappen m
        WHERE m.haushalt_id = ${haushaltId} AND m.typ_id = ${typId} AND m.id IN (
          SELECT f.mappe_id FROM fristtermine f
          WHERE f.haushalt_id = ${haushaltId} AND f.typ_id = ${typId} AND f.feld = ANY(${alle}::text[])
            AND ((f.datum BETWEEN ${ab} AND ${bis}) ${wiederkehrend}))`;
      return r.map((z) => ({
        id: z.id as string,
        typId: z.typ_id as string,
        titel: (z.titel as string | null) ?? null,
        werte: (z.werte ?? {}) as Werte,
      }));
    },
    async mappenKurz() {
      return (await sql`SELECT id, typ_id, coalesce(titel, '') AS titel FROM mappen WHERE haushalt_id = ${haushaltId}`).map((r) => ({
        id: r.id as string,
        typId: r.typ_id as string,
        titel: r.titel as string,
      }));
    },
    async feldwerte(typId, key) {
      if (!istUuid(typId)) return [];
      return (
        await sql`SELECT werte ->> ${key} AS w FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId} AND werte ? ${key}`
      )
        .map((r) => r.w as string)
        .filter((w) => w != null);
    },
    async holeMappe(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsMappe(r) : undefined;
    },
    async holeMappen(ids) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return [];
      return (await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[])`).map(alsMappe);
    },
    async titelVon(ids) {
      const r = new Map<string, string>();
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return r;
      const zeilen = await sql`SELECT id, titel FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[])`;
      for (const z of zeilen) r.set(z.id as string, (z.titel as string | null) ?? '');
      return r;
    },
    async typenVon(ids) {
      const r = new Map<string, string>();
      const gueltig = ids.filter(istUuid);
      if (!gueltig.length) return r;
      const zeilen = await sql`SELECT id, typ_id FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[])`;
      for (const z of zeilen) r.set(z.id as string, z.typ_id as string);
      return r;
    },
  } satisfies RepoTeil;
}

/** Mappen anlegen, ändern und löschen. */
export function pgMappenSchreiben(k: PgKontext) {
  const { sql, haushaltId, MAP, STAND_WEITER, zieheIn, schreibeVerweise } = k;
  return {
    async legeMappeAn(id, typId, werte, vs, benutzerId, demo = false, systemKennung = null, nummern) {
      return sql.begin(async (tx) => {
        // Nummernkreise (#171): Zeile sperren, ziehen, mit der Mappe zusammen speichern – scheitert das
        // Anlegen, rollt auch der Zähler zurück; gleichzeitiges Anlegen wartet auf die Sperre.
        if (nummern?.felder.length) {
          werte = { ...werte };
          for (const n of nummern.felder) werte[n.feldKey] = await zieheIn(tx, n.kreis, id, nummern.jetzt);
        }
        const [r] = await tx`
          INSERT INTO mappen (id, haushalt_id, typ_id, werte, erstellt_von, geaendert_von, demo, system_kennung)
          VALUES (${id}, ${haushaltId}, ${typId}, ${json(sql, werte)}, ${benutzerId}, ${benutzerId}, ${demo}, ${systemKennung})
          RETURNING ${MAP}`;
        await schreibeVerweise(tx, id, vs);
        return alsMappe(r);
      });
    },
    async aktualisiereStatistik() {
      // Ohne frische Statistik plant PostgreSQL nach zehntausenden neuen Zeilen mit alten Zahlen (#367).
      // Dokumente nur über ausgewählte Spalten (STATISTIK_SPALTEN): 0,1 s statt über einer Minute.
      await sql.unsafe(
        `ANALYZE mappen, verweise, aufgaben, notizen, historie, favoriten, ${Object.entries(STATISTIK_SPALTEN)
          .map(([t, c]) => `${t} (${c})`)
          .join(', ')}`,
      );
    },
    async legeMappenAn(liste) {
      if (!liste.length) return;
      await sql.begin(async (tx) => {
        await tx`INSERT INTO mappen ${tx(
          liste.map((m) => ({
            id: m.id,
            haushalt_id: haushaltId,
            typ_id: m.typId,
            werte: json(sql, m.werte),
            titel: m.titel,
            erstellt_von: m.benutzerId,
            geaendert_von: m.benutzerId,
            demo: m.demo,
          })),
        )}`;
        const vs = liste.flatMap((m) =>
          m.verweise
            .filter((v) => istUuid(v.zielId))
            .map((v) => ({ quelle_id: m.id, feld_key: v.feldKey, ziel_id: v.zielId, haushalt_id: haushaltId })),
        );
        if (vs.length) await tx`INSERT INTO verweise ${tx(vs)} ON CONFLICT DO NOTHING`;
      });
    },
    async aendereMappe(id, werte, vs, benutzerId, fw) {
      return sql.begin(async (tx) => {
        let neu = werte;
        let verweise = vs;
        // Feldweise (#609): unter Sperre der Zeile auf den aktuellen Stand legen. FOR NO KEY UPDATE (#928): Zwei
        // Änderungen derselben Mappe warten aufeinander wie bisher; neue Aufgaben, Notizen, Historie und Favoriten der
        // Mappe (Fremdschlüssel, FOR KEY SHARE) warten nicht mehr bis zum Ende der Transaktion.
        if (fw) {
          const [a] = await tx`SELECT werte, geaendert FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id} FOR NO KEY UPDATE`;
          if (a && fw.stand !== undefined && iso(a.geaendert) !== fw.stand) throw new StandVeraltet();
          neu = feldweise((a?.werte as Werte | undefined) ?? {}, fw.basis, werte);
          verweise = fw.verweise(neu);
        }
        // Titel im selben UPDATE (#743): eine Zeilenversion, Suchtext und Wörterverzeichnis nur einmal neu.
        const titel = fw?.titel?.(neu);
        const [r] = await tx`
          UPDATE mappen SET werte = ${json(sql, neu)}, geaendert = ${STAND_WEITER}, geaendert_von = ${benutzerId}, passt = true, problem = NULL
            ${titel !== undefined ? tx`, titel = ${titel}` : tx``}
          WHERE haushalt_id = ${haushaltId} AND id = ${id}
          RETURNING ${MAP}`;
        await schreibeVerweise(tx, id, verweise);
        return alsMappe(r);
      });
    },
    async setzeMappenTyp(ids, typId) {
      const liste = ids.filter(istUuid);
      if (!liste.length || !istUuid(typId)) return;
      // Fristtermine ziehen per Trigger mit (Migration 086, „Typ wechseln“).
      await sql`UPDATE mappen SET typ_id = ${typId}, geaendert = ${STAND_WEITER} WHERE haushalt_id = ${haushaltId} AND id = ANY(${liste}::uuid[])`;
    },
    async beruehreMappe(id, benutzerId) {
      await sql`UPDATE mappen SET geaendert = ${STAND_WEITER}, geaendert_von = ${benutzerId} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async loescheMappe(id) {
      await sql`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
  } satisfies RepoTeil;
}

/** Titel setzen, Mappen ohne Titel, doppelte Werte finden. */
export function pgMappenTitel(k: PgKontext) {
  const { sql, haushaltId, MAP } = k;
  return {
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
    async ohneTitel() {
      return (await sql`SELECT id FROM mappen WHERE haushalt_id = ${haushaltId} AND titel IS NULL`).map((z) => z.id as string);
    },
    async findeDoppelt(typId, feldKey, wert, ausser) {
      // Über den Index der Feldwerte (#743, Migration 075), danach genau wie bisher verglichen.
      const [r] = await sql`
        SELECT ${MAP} FROM mappen
        WHERE dms_gleichwerte(werte) @> dms_gleichwerte(jsonb_build_object(${feldKey}::text, ${wert}::text))
          AND haushalt_id = ${haushaltId} AND typ_id = ${typId}
          AND id <> ${istUuid(ausser) ? ausser : '00000000-0000-0000-0000-000000000000'}
          AND lower(trim(werte ->> ${feldKey}::text)) = lower(trim(${wert}::text))
        LIMIT 1`;
      return r ? alsMappe(r) : undefined;
    },
    async findeDoppelte(typId, liste) {
      const erg = new Map<string, { id: string; titel: string }>();
      if (!istUuid(typId)) return erg;
      const ohne = '00000000-0000-0000-0000-000000000000';
      for (let i = 0; i < liste.length; i += 1000) {
        const teil = liste.slice(i, i + 1000);
        const zeilen = await sql`
          SELECT q.mappe, q.feld, m.id, m.titel
          FROM unnest(${teil.map((x) => (istUuid(x.mappeId) ? x.mappeId : ohne))}::uuid[], ${teil.map((x) => x.feldKey)}::text[], ${teil.map((x) => x.wert)}::text[]) AS q(mappe, feld, wert)
          CROSS JOIN LATERAL (
            -- Nur über den Index der Feldwerte (OFFSET 0): Mit dem Typ-Index dazu (BitmapAnd) läse PostgreSQL je
            -- Eintrag alle Mappen des Typs aus dem Index.
            SELECT d.id, d.titel FROM (SELECT id, titel, haushalt_id, typ_id, werte FROM mappen
              WHERE dms_gleichwerte(werte) @> dms_gleichwerte(jsonb_build_object(q.feld, q.wert)) OFFSET 0) d
            WHERE d.haushalt_id = ${haushaltId} AND d.typ_id = ${typId} AND d.id <> q.mappe
              AND lower(trim(d.werte ->> q.feld)) = lower(trim(q.wert))
            LIMIT 1) m`;
        for (const z of zeilen)
          erg.set(`${z.mappe === ohne ? '' : z.mappe}|${z.feld}`, { id: z.id as string, titel: (z.titel as string | null) ?? '' });
      }
      return erg;
    },
  } satisfies RepoTeil;
}

/** Systemmappen und Vorgaben; Haushalts- und Mappenstand (#741). */
export function pgSystemmappen(k: PgKontext) {
  const { sql, haushaltId, MAP } = k;
  return {
    async holeSystemMappe(kennung) {
      const [r] = await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} AND system_kennung = ${kennung}`;
      return r ? alsMappe(r) : undefined;
    },
    async setzeSystemKennung(id, kennung) {
      if (!istUuid(id)) return;
      await sql`UPDATE mappen SET system_kennung = ${kennung} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async setzeVorgabe(id, kennung) {
      if (!istUuid(id)) return;
      await sql`UPDATE mappen SET vorgabe = ${kennung} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async mappenMitVorgabe(praefix) {
      return (await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} AND left(vorgabe, ${praefix.length}) = ${praefix}`).map(
        alsMappe,
      );
    },
    async haushaltsstand() {
      return liesStand(sql, haushaltId, 'zahlen');
    },
    async erhoeheHaushaltsstand() {
      return erhoeheZahlenstand(sql);
    },
    async mappenstand() {
      return liesStand(sql, haushaltId, 'mappen');
    },
    async erhoeheMappenstand() {
      return erhoeheMappenstand(sql);
    },
  } satisfies RepoTeil;
}

/** Verweise zwischen Mappen: Quellen, Bezüge, Rückverweise, Kanten. */
export function pgVerweise(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
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
        const zeilen =
          await sql`SELECT id, typ_id, titel FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig.slice(i, i + 5000)}::uuid[])`;
        for (const z of zeilen) r.set(z.id as string, { titel: (z.titel as string | null) ?? '', typId: z.typ_id as string });
      }
      return r;
    },
    async rueckverweise(zielId) {
      if (!istUuid(zielId)) return [];
      const r = await sql`
        SELECT v.quelle_id, v.feld_key, m.typ_id, m.titel
        FROM verweise v JOIN mappen m ON m.id = v.quelle_id
        WHERE v.ziel_id = ${zielId} AND v.haushalt_id = ${haushaltId}
        ORDER BY lower(m.titel), m.id`;
      return r.map((z) => ({
        quelleId: z.quelle_id as string,
        quelleTypId: z.typ_id as string,
        feldKey: z.feld_key as string,
        titel: (z.titel as string | null) ?? '',
      }));
    },
    async kantenVon(ids) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return [];
      const r = await sql`
        SELECT quelle_id, feld_key, ziel_id FROM verweise WHERE haushalt_id = ${haushaltId} AND quelle_id = ANY(${gueltig}::uuid[])
        UNION
        SELECT quelle_id, feld_key, ziel_id FROM verweise WHERE haushalt_id = ${haushaltId} AND ziel_id = ANY(${gueltig}::uuid[])`;
      return r.map((z) => ({ quelleId: z.quelle_id as string, feldKey: z.feld_key as string, zielId: z.ziel_id as string }));
    },
  } satisfies RepoTeil;
}
