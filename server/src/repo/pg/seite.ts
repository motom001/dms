/** Listen und Zahlen (PostgreSQL): eine Seite Mappen mit Suche und Fundstellen (#740), Zähler und Klauseln. */
import type postgres from 'postgres';
import { alsText } from '../../../../shared/src/markdown';
import type { Ausschnitt } from '../../../../shared/src/model';
import { falte, normal, suchbegriffe, teilwoerter, type Varianten } from '../../../../shared/src/suche';
import { ausschnittAus } from '../ausschnitt';
import { istUuid, type RepoTeil, type SeitenAnfrage } from '..';
import type { PgKontext } from './kontext';
import {
  ausdruckSql,
  AUSSCHNITT,
  eingangSql,
  klauselnSql,
  lesefilterSql,
  nurFavoritenVon,
  type SqlTeil,
  suchanfrage,
  type Teil,
  zeitraumTageSql,
  type Sql,
} from './sql';
import { alsMappe, type Zeile } from './zeilen';

/** Treffermenge und Textfilter (#740) samt übergeordneten Mappen, die über ihre Teile gefunden wurden (#1031). */
const mitTeilen = (sql: Sql, roh: Teil | null, tf: Teil | null, auch: string[]) => ({
  treffer: roh && auch.length ? sql`${roh} UNION SELECT unnest(${auch}::uuid[])` : roh,
  textfilter: !tf
    ? sql``
    : auch.length
      ? sql`AND (mappen.id IN (${tf}) OR mappen.id = ANY(${auch}::uuid[]))`
      : sql`AND mappen.id IN (${tf})`,
});

/** Bedingungen einer Seite (#740) zum gemeinsamen Kontext. */
function seitenTeileVon(k: PgKontext) {
  const { sql, haushaltId, tsAnfrage, SUCHINDEX } = k;
  /**
   * Bedingungen einer Seite (#740): `wo` (Typ, Eingang/Favoriten, Textfilter der erweiterten Suche, Lesefilter – je mit
   * AND davor) und, mit Suche, `treffer`: die Ids der Mappen, die den Begriff enthalten, als eine Menge (UNION aus
   * Mappe, Notizen und Dokumenten). Jede Teilmenge nutzt ihren Index (Trigramm auf suchtext, Notizen, Suchindex
   * der Dokumente) – mit OR in einer Bedingung über alle Mappen ginge das nicht. Gleiche Treffer wie vorher.
   */
  const seitenTeile = async (o: SeitenAnfrage) => {
    const typ = o.klauseln
      ? sql`AND (${klauselnSql(sql, o.klauseln)})`
      : o.typId && istUuid(o.typId)
        ? sql`AND typ_id = ${o.typId}`
        : o.typId
          ? sql`AND false`
          : sql``;
    const eingang = o.eingang
      ? sql`AND EXISTS (SELECT 1 FROM aufgaben a WHERE a.mappe_id = mappen.id AND a.erledigt IS NULL
          AND (a.empfaenger_id = ${istUuid(o.eingang.benutzerId) ? o.eingang.benutzerId : null}::uuid ${o.eingang.admin ? sql`OR a.empfaenger_id IS NULL` : sql``}))`
      : o.favoriten
        ? sql`AND EXISTS (SELECT 1 FROM favoriten fav WHERE fav.mappe_id = mappen.id AND fav.benutzer_id = ${istUuid(o.favoriten.benutzerId) ? o.favoriten.benutzerId : null}::uuid)`
        : sql``;
    const musterAus = (t: string) => `%${t.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    // Unscharfe Suche (#356): Titel, Werte und Notizen ohne Umlaute, Groß-/Kleinschreibung und Bindestriche
    // verglichen; ein einzelner Begriff auch in seinen Varianten (gleichbedeutende Wörter, ähnliche Schreibweisen).
    const nurV = o.varianten ?? {};
    // Ähnliche Schreibweisen (Tippfehler) gelten wie Varianten – nur nicht für Wortteile im Volltext.
    const v: Varianten = { ...nurV };
    for (const [k, w] of Object.entries(o.aehnlich ?? {})) v[k] = [...(v[k] ?? []), ...w];
    // Volltext (#400): je Sprache der Ablage eine Anfrage; gleiche Anfragen (dieselben Wortstämme) nur einmal.
    const anfragen = new Map<string, SqlTeil>();
    for (const t of [o.volltext ? o.suche : undefined, o.textfilter?.dokumente ? o.textfilter.text.trim() : undefined]) {
      if (t && !anfragen.has(t)) anfragen.set(t, (await tsAnfrage(t, v)).q);
    }
    const schreibweisen = (t: string) => {
      const b = suchbegriffe(t);
      return b?.length === 1 ? [t, ...(v[falte(b[0])] ?? [])] : [t];
    };
    const enthaelt = (spalte: Teil, t: string) =>
      schreibweisen(t)
        .map((x) => sql`replace(lower(dms_falte(${spalte})), '-', '') LIKE ${musterAus(normal(x))}`)
        .reduce((a, b) => sql`${a} OR ${b}`);
    // Teilwörter im Volltext (#161): „Ofen“ findet „Backofen“ – zusätzlich zu den Wortformen; je Wort auch die Varianten.
    const teilSql = (spalte: string, teil: string[]) =>
      teil
        .map((w) =>
          [w, ...(nurV[falte(w)] ?? []).map((x) => x.toLowerCase()).filter((x) => x.length >= 3)]
            .map((x) => sql`${sql.unsafe(spalte)} ILIKE ${musterAus(x)}`)
            .reduce((a, b) => sql`${a} OR ${b}`),
        )
        .reduce((a, b) => sql`(${a}) AND (${b})`);
    // Ids der Mappen mit dem Begriff in einer Notiz bzw. einem Dokument – einmal über die Indizes (#356).
    const inNotizen = (t: string) =>
      sql`SELECT n.mappe_id FROM notizen n WHERE n.haushalt_id = ${haushaltId} AND (${enthaelt(sql`n.text`, t)})`;
    const inDokumenten = (t: string) => {
      const teil = teilwoerter(t);
      return sql`SELECT d.mappe_id FROM dokumente d WHERE d.haushalt_id = ${haushaltId}
        AND (${SUCHINDEX} @@ ${anfragen.get(t) ?? suchanfrage(sql, t, v)}${teil ? sql` OR (${teilSql('d.volltext', teil)})` : sql``})`;
    };
    // Vorfilter (#615, #740): Titel und Werte stehen gefaltet in suchtext (Migration 055, nie leer seit 075) – was in
    // einem davon vorkommt, kommt auch dort vor; der Trigramm-Index findet diese Mappen. Danach wird je Titel und Wert
    // genau verglichen (dieselben Treffer wie vorher), aber nur noch für die wenigen Mappen, die den Begriff enthalten.
    const vorfilter = (t: string) =>
      schreibweisen(t)
        .map((x) => sql`mappen.suchtext LIKE ${musterAus(normal(x))}`)
        .reduce((a, b) => sql`${a} OR ${b}`);
    const inMappen = (t: string) => sql`SELECT mappen.id FROM mappen WHERE mappen.haushalt_id = ${haushaltId} AND (${vorfilter(t)})
      AND (${enthaelt(sql`titel`, t)} OR EXISTS (SELECT 1 FROM jsonb_each_text(werte) e WHERE e.value NOT LIKE 'dms1$%' AND (${enthaelt(sql`e.value`, t)})))`;
    const vereint = (teile: Teil[]) => teile.reduce((a, b) => sql`${a} UNION ${b}`);
    const suche = o.suche
      ? vereint([inMappen(o.suche), ...(o.notizen ? [inNotizen(o.suche)] : []), ...(o.volltext ? [inDokumenten(o.suche)] : [])])
      : null;
    // Erweiterte Suche (#199): Begriff in Dokumenten oder Notizen, zusätzlich zu allen anderen Bedingungen.
    // Mit `felder` (#1218) auch Titel und Felder – so findet Enter im Suchfeld oben dasselbe wie die Suche einer Liste.
    const tf = o.textfilter?.text.trim() && (o.textfilter.dokumente || o.textfilter.notizen || o.textfilter.felder) ? o.textfilter : null;
    const tfMenge = tf
      ? vereint([
          ...(tf.felder ? [inMappen(tf.text)] : []),
          ...(tf.dokumente ? [inDokumenten(tf.text)] : []),
          ...(tf.notizen ? [inNotizen(tf.text)] : []),
        ])
      : null;
    // Ohne Suche ist der Textfilter die Treffermenge; mit Suche eine weitere Bedingung. Teile (#1031): übergeordnete
    // Mappen, in deren Teilen der Begriff steht (auchIds), zählen für beides als Treffer.
    const { treffer, textfilter } = mitTeilen(sql, suche ?? tfMenge, suche && tfMenge, (o.auchIds ?? []).filter(istUuid));
    // Berechtigungen (#124): nur, was der Benutzer lesen darf.
    const lesen = o.lesen ? sql`AND ${lesefilterSql(sql, o.lesen)}` : sql``;
    const wo = sql`${typ} ${eingang} ${textfilter} ${lesen}`;
    // Ohne Lesefilter (#1265): für die Zahl der verborgenen Zeilen in derselben Abfrage wie die Seite.
    const ohneLesen = sql`${typ} ${eingang} ${textfilter}`;
    const so = o.sortierung;
    const k = so?.key ?? '';
    const ausdruck =
      !so || so.art === 'titel'
        ? sql`lower(titel)`
        : so.art === 'erstellt'
          ? sql`erstellt`
          : so.art === 'geaendert'
            ? sql`geaendert`
            : so.art === 'erstelltVon'
              ? sql`(SELECT lower(coalesce(nullif(b.name, ''), b.email)) FROM benutzer b WHERE b.id = mappen.erstellt_von)`
              : so.art === 'geaendertVon'
                ? sql`(SELECT lower(coalesce(nullif(b.name, ''), b.email)) FROM benutzer b WHERE b.id = mappen.geaendert_von)`
                : so.art === 'typ'
                  ? sql`(SELECT lower(t.name) FROM mappentypen t WHERE t.id = mappen.typ_id)`
                  : // Zahl und Prozent (#1035) als Zahl: Ein gespeichertes null (JSON) stünde sonst vor allen Zahlen statt zuletzt.
                    so.art === 'zahl'
                    ? sql`(CASE WHEN jsonb_typeof(werte -> ${k}::text) = 'number' THEN (werte ->> ${k}::text)::numeric END)`
                    : so.art === 'janein'
                      ? sql`(werte -> ${k}::text)`
                      : so.art === 'betrag'
                        ? sql`((werte -> ${k}::text ->> 'betrag')::numeric)`
                        : so.art === 'zeitraum'
                          ? zeitraumTageSql(sql, sql`werte`, k)
                          : so.art === 'datum'
                            ? sql`(werte ->> ${k}::text)`
                            : sql`lower(werte ->> ${k}::text)`;
    // Leere Werte zuletzt. erstellt und geaendert sind nie leer (NOT NULL), ohne „NULLS LAST“ liest PostgreSQL ihren
    // Index auch rückwärts (#740). Ebenso Titel absteigend: Ein Titel fehlt nur kurz vor dem ersten Berechnen.
    const ohneLeere = !so || ['titel', 'erstellt', 'geaendert'].includes(so.art);
    const richtung = so?.absteigend ? (ohneLeere ? sql`DESC` : sql`DESC NULLS LAST`) : sql`ASC NULLS LAST`;
    return { wo, ohneLesen, treffer, ausdruck, richtung, tf, enthaelt, schreibweisen, anfragen, v, teilSql };
  };

  return seitenTeile;
}

/** Eine Seite Mappen (#740) mit Fundstellen. */
export function pgSeite(k: PgKontext) {
  const { sql, haushaltId, MAP, SUCHINDEX, tsAnfrage } = k;
  const seitenTeile = seitenTeileVon(k);
  return {
    async seite(o) {
      const { wo, ohneLesen, treffer, ausdruck, richtung, tf, enthaelt, schreibweisen, anfragen, v, teilSql } = await seitenTeile(o);
      let n: number | undefined;
      let r: postgres.Row[];
      if (o.mitVerborgenen && !treffer && o.zahl === undefined) {
        // Tabellenfeld (#1265): Seite, Zahl der lesbaren und Zahl aller Mappen in einer Abfrage – vorher zwei bis drei
        // Zählungen über alle Mappen des Haushalts. Innen ohne Lesefilter, dafür je Mappe „lesbar“; nur lesbare Zeilen
        // verlassen die Datenbank, von den anderen nur ihre Zahl (#1208). Ohne Lesefilter ist jede lesbar.
        const lesbar = o.lesen ? sql`coalesce(${lesefilterSql(sql, o.lesen)}, false)` : sql`true`;
        r = await sql`
          SELECT * FROM (
            SELECT *, count(*) OVER () AS dms_alle, count(*) FILTER (WHERE dms_lesbar) OVER () AS dms_gesamt FROM (
              SELECT ${MAP}, ${lesbar} AS dms_lesbar FROM mappen WHERE haushalt_id = ${haushaltId} ${ohneLesen} OFFSET 0) AS mappen
          ) AS mappen WHERE dms_lesbar
          ORDER BY ${ausdruck} ${richtung}, lower(titel), id OFFSET ${o.von} LIMIT ${o.anzahl}`;
        // Blatt hinter dem Ende: keine Zeile, die die Zahlen trägt – dann eigens zählen (auch das in einer Abfrage).
        const [z] = r.length
          ? [{ n: Number(r[0].dms_gesamt), alle: Number(r[0].dms_alle) }]
          : await sql`SELECT count(*) FILTER (WHERE ${lesbar})::int AS n, count(*)::int AS alle FROM mappen WHERE haushalt_id = ${haushaltId} ${ohneLesen}`;
        return { gesamt: Number(z.n), verborgen: Math.max(0, Number(z.alle) - Number(z.n)), mappen: r.map(alsMappe) };
      }
      if (o.zahl !== undefined) {
        // Zahl der Treffer schon bekannt (#918): nur die Seite, ohne Zählen.
        n = o.zahl;
        r = treffer
          ? await sql`
            SELECT * FROM (SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId}
              AND id IN (SELECT id FROM (${treffer}) AS t(id)) ${wo} OFFSET 0) AS mappen
            ORDER BY ${ausdruck} ${richtung}, lower(titel), id OFFSET ${o.von} LIMIT ${o.anzahl}`
          : await sql`
            SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} ${wo}
            ORDER BY ${ausdruck} ${richtung}, lower(titel), id OFFSET ${o.von} LIMIT ${o.anzahl}`;
      } else if (treffer) {
        // Mit Suche (#740): erst die Treffer als eine Id-Menge (Mappe, Notizen, Dokumente – je über ihren Index),
        // dann Typ, Bedingungen und Lesefilter, Gesamtzahl und Seite in einer Abfrage. OFFSET 0 hält die Treffer
        // zusammen (sonst geht PostgreSQL bei einem seltenen Begriff einen Sortier-Index der Reihe nach durch).
        r = await sql`
          SELECT *, count(*) OVER () AS dms_gesamt FROM (SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId}
            AND id IN (SELECT id FROM (${treffer}) AS t(id)) ${wo} OFFSET 0) AS mappen
          ORDER BY ${ausdruck} ${richtung}, lower(titel), id OFFSET ${o.von} LIMIT ${o.anzahl}`;
        // Blatt hinter dem Ende: keine Zeile, die die Zahl trägt – dann eigens zählen.
        n = r.length ? Number(r[0].dms_gesamt) : o.von === 0 ? 0 : undefined;
        if (n === undefined)
          [{ n }] =
            await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} AND id IN (SELECT id FROM (${treffer}) AS t(id)) ${wo}`;
      } else {
        // Ohne Suche liefert ein Index die Seite direkt in der richtigen Reihenfolge (#740).
        r = await sql`
          SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} ${wo}
          ORDER BY ${ausdruck} ${richtung}, lower(titel), id OFFSET ${o.von} LIMIT ${o.anzahl}`;
        // Gezählt wird nur beim ersten Blatt (#740); beim Blättern gilt die Zahl vom ersten Blatt (o.gesamt).
        // Ist die Seite nicht voll, ist die Zahl ohnehin klar.
        if (o.von > 0 && r.length > 0 && r.length < o.anzahl) n = o.von + r.length;
        else if (o.von > 0 && r.length > 0 && o.gesamt !== undefined) n = Math.max(o.gesamt, o.von + r.length);
        else [{ n }] = await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} ${wo}`;
      }
      const mappen = r.map(alsMappe);
      // Fundstellen: zur Suche oder – in der erweiterten Suche – zum Volltextfilter.
      const fund =
        o.suche && (o.volltext || o.notizen)
          ? { text: o.suche, volltext: !!o.volltext, notizen: !!o.notizen }
          : tf
            ? { text: tf.text.trim(), volltext: tf.dokumente, notizen: tf.notizen }
            : null;
      if (!fund || !mappen.length) return { gesamt: n as number, mappen };
      const ausschnitte: Record<string, Ausschnitt> = {};
      if (fund.notizen) {
        const nz =
          await sql`SELECT mappe_id, text FROM notizen n WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${mappen.map((m) => m.id)}::uuid[]) AND (${enthaelt(sql`n.text`, fund.text)}) ORDER BY erstellt`;
        for (const z of nz) {
          const klar = alsText(z.text as string);
          const t = schreibweisen(fund.text)
            .map((x) => ausschnittAus(klar, x))
            .find(Boolean);
          if (t && !ausschnitte[z.mappe_id as string]) ausschnitte[z.mappe_id as string] = { dokument: 'Notiz', text: t };
        }
      }
      if (!fund.volltext) return { gesamt: n as number, mappen, ausschnitte };
      // Fundstellen im Volltext: je Mappe das Dokument mit dem besten Treffer, Wortstämme in der Sprache des Dokuments
      // (bei mehrsprachigen in der Sprache, in der die Anfrage trifft, #579).
      const a = await sql`
        SELECT DISTINCT ON (d.mappe_id) d.mappe_id, d.name, d.anlage_zu, d.anlage_nr, dms_ausschnitt(d.sprache, d.weitere_sprachen, d.volltext, x.q, ${AUSSCHNITT}::text) AS text
        FROM dokumente d CROSS JOIN LATERAL (SELECT ${anfragen.get(fund.text) ?? (await tsAnfrage(fund.text, v)).q} AS q) x
        WHERE d.haushalt_id = ${haushaltId} AND d.mappe_id = ANY(${mappen.map((m) => m.id)}::uuid[])
          AND ${SUCHINDEX} @@ x.q
        ORDER BY d.mappe_id, ts_rank(${SUCHINDEX}, x.q) DESC`;
      // Anlagen (#998): Treffer mit Vermerk „in Anlage 2“.
      const anlage = (z: Zeile) => (z.anlage_zu ? { anlage: (z.anlage_nr as number | null) ?? 1 } : {});
      for (const z of a) ausschnitte[z.mappe_id as string] ??= { dokument: z.name as string, text: z.text as string, ...anlage(z) };
      // Nur als Teilwort gefunden: Ausschnitt um die erste Fundstelle.
      const teil = teilwoerter(fund.text);
      const ohne = mappen.filter((m) => !ausschnitte[m.id]).map((m) => m.id);
      if (teil && ohne.length) {
        const b = await sql`
          SELECT DISTINCT ON (d.mappe_id) d.mappe_id, d.name, d.anlage_zu, d.anlage_nr, substr(d.volltext, greatest(1, strpos(lower(d.volltext), ${teil[0]}) - 80), 240 + ${teil[0].length}) AS text
          FROM dokumente d
          WHERE d.haushalt_id = ${haushaltId} AND d.mappe_id = ANY(${ohne}::uuid[]) AND ${teilSql('d.volltext', teil)}
          ORDER BY d.mappe_id, d.erstellt`;
        for (const z of b) {
          const t = ausschnittAus(String(z.text ?? ''), teil[0]);
          if (t) ausschnitte[z.mappe_id as string] ??= { dokument: z.name as string, text: t, ...anlage(z) };
        }
      }
      return { gesamt: n as number, mappen, ausschnitte };
    },
  } satisfies RepoTeil;
}

/**
 * Nur die Ids einer Seite (#1335): dieselben Bedingungen, dieselbe Reihenfolge wie `seite`, aber nur `id` verlässt die
 * Datenbank. Gezählt wird nur, wenn das Blatt voll ist (sonst ist die Zahl die Länge, `von` ist dabei 0).
 */
export function pgTrefferIds(k: PgKontext) {
  const { sql, haushaltId, MAP } = k;
  const seitenTeile = seitenTeileVon(k);
  return {
    async trefferIds(o) {
      const { wo, treffer, ausdruck, richtung } = await seitenTeile(o);
      const r = treffer
        ? await sql<{ id: string; dms_gesamt: string }[]>`
          SELECT mappen.id, count(*) OVER () AS dms_gesamt FROM (SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId}
            AND id IN (SELECT id FROM (${treffer}) AS t(id)) ${wo} OFFSET 0) AS mappen
          ORDER BY ${ausdruck} ${richtung}, lower(titel), id OFFSET ${o.von} LIMIT ${o.anzahl}`
        : await sql<{ id: string }[]>`
          SELECT id FROM mappen WHERE haushalt_id = ${haushaltId} ${wo}
          ORDER BY ${ausdruck} ${richtung}, lower(titel), id OFFSET ${o.von} LIMIT ${o.anzahl}`;
      const ids = r.map((z) => z.id);
      if (treffer && r.length) return { gesamt: Number((r[0] as { dms_gesamt: string }).dms_gesamt), ids };
      if (o.von === 0 && r.length < o.anzahl) return { gesamt: r.length, ids };
      const [{ n }] = treffer
        ? await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} AND id IN (SELECT id FROM (${treffer}) AS t(id)) ${wo}`
        : await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} ${wo}`;
      return { gesamt: Number(n), ids };
    },
  } satisfies RepoTeil;
}

/** Zahlen für die Navigation (#625, #928): Bestand und Persönliches. */
export function pgZaehler(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    async zaehler(benutzerId, admin, lesefilter) {
      const lesen = lesefilter ? sql`AND ${lesefilterSql(sql, lesefilter)}` : sql``;
      const r = await sql`
        SELECT typ_id, count(*)::int AS anzahl,
          count(*) FILTER (WHERE passt IS NOT TRUE)::int AS unpassend,
          count(*) FILTER (WHERE demo)::int AS demo
        FROM mappen WHERE haushalt_id = ${haushaltId} ${lesen} GROUP BY typ_id`;
      // Eingang (#477): von den offenen Aufgaben aus statt je Mappe (EXISTS über alle Mappen), ohne Lesefilter.
      const [e] = await sql`SELECT ${eingangSql(sql, haushaltId, istUuid(benutzerId) ? benutzerId : null, admin)} AS n`;
      const [f] = await sql`SELECT count(*)::int AS n FROM favoriten f JOIN mappen ON mappen.id = f.mappe_id
        WHERE f.haushalt_id = ${haushaltId} AND f.benutzer_id = ${istUuid(benutzerId) ? benutzerId : null}::uuid ${lesen}`;
      return {
        favoriten: f.n as number,
        typen: new Map(
          r.map((z) => [z.typ_id as string, { anzahl: z.anzahl as number, unpassend: z.unpassend as number, demo: z.demo as number }]),
        ),
        eingang: e.n as number,
      };
    },
    async zaehleBestand(liste, lesefilter) {
      // Ein Lauf (#742): je Typ gruppiert, die Sichten als count(*) FILTER je Gruppe – danach über die Typen summiert.
      const lesen = lesefilter ? sql`AND ${lesefilterSql(sql, lesefilter)}` : sql``;
      const spalten = liste.map((k, i) => sql`, count(*) FILTER (WHERE ${klauselnSql(sql, k)})::int AS ${sql(`s${i}`)}`);
      const sel = spalten.reduce((acc, t) => sql`${acc}${t}`, sql``);
      const r = await sql`
        SELECT typ_id, count(*)::int AS anzahl,
          count(*) FILTER (WHERE passt IS NOT TRUE)::int AS unpassend,
          count(*) FILTER (WHERE demo)::int AS demo ${sel}
        FROM mappen WHERE haushalt_id = ${haushaltId} ${lesen} GROUP BY typ_id`;
      return {
        typen: new Map(
          r.map((z) => [z.typ_id as string, { anzahl: z.anzahl as number, unpassend: z.unpassend as number, demo: z.demo as number }]),
        ),
        sichten: liste.map((_, i) => r.reduce((n, z) => n + (z[`s${i}`] as number), 0)),
      };
    },
    async zaehlePersoenlich(benutzerId, ohneEmpfaenger, lesefilter, liste = []) {
      const ich = istUuid(benutzerId) ? benutzerId : null;
      const lesen = lesefilter ? sql`AND ${lesefilterSql(sql, lesefilter)}` : sql``;
      // Ansichten mit Bezug auf die Person: ein Lauf nur über die Typen dieser Ansichten.
      // Ansichten mit Bezug auf die Person: ein Lauf je Gruppe nur über die Typen ihrer Ansichten. Ansichten, die nur
      // Favoriten einer Person zählen („ist mein Favorit“), gehen von deren Favoriten aus statt über alle Mappen der
      // Typen (#928: bei 50.000 Mappen 34 ms → unter 1 ms) – jede ihrer Klauseln verlangt den Favoriten, also fehlt
      // keine Mappe, die sie zählen würden.
      const gruppen = new Map<string, number[]>();
      liste.forEach((k, i) => {
        const g = nurFavoritenVon(k) ?? '';
        gruppen.set(g, [...(gruppen.get(g) ?? []), i]);
      });
      const teile = [...gruppen].flatMap(([fav, idx], g) => {
        const typIds = [...new Set(idx.flatMap((i) => liste[i].flatMap((k) => k.typen)))].filter(istUuid);
        if (!typIds.length) return [];
        const spalten = idx.map((i) => sql`count(*) FILTER (WHERE ${klauselnSql(sql, liste[i])})::int`);
        const nurFav = fav ? sql`AND id IN (SELECT mappe_id FROM favoriten WHERE benutzer_id = ${fav}::uuid)` : sql``;
        return [
          {
            idx,
            teil: sql`, (SELECT ARRAY[${spalten.slice(1).reduce((acc, t) => sql`${acc}, ${t}`, spalten[0])}] FROM mappen
            WHERE haushalt_id = ${haushaltId} AND typ_id = ANY(${typIds}::uuid[]) ${nurFav} ${lesen}) AS ${sql(`s${g}`)}`,
          },
        ];
      });
      // Drei kleine Zählungen über Indizes in einer Abfrage (#742); Eingang wie in `zaehler` (#477, #928), Papierkorb wie
      // in `zaehlePapierkorb` (eigene Mappen und Dokumente, #344).
      const [r] = await sql`SELECT
        ${eingangSql(sql, haushaltId, ich, ohneEmpfaenger)} AS eingang,
        (SELECT count(*)::int FROM favoriten f JOIN mappen ON mappen.id = f.mappe_id
          WHERE f.haushalt_id = ${haushaltId} AND f.benutzer_id = ${ich}::uuid ${lesen}) AS favoriten,
        (SELECT count(*)::int FROM papierkorb WHERE haushalt_id = ${haushaltId} AND geloescht_von = ${ich}::uuid)
          + (SELECT count(*)::int FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId} AND geloescht_von = ${ich}::uuid) AS papierkorb
        ${teile.reduce<Teil>((acc, t) => sql`${acc} ${t.teil}`, sql``)}`;
      const n = new Map<number, number>();
      [...gruppen].forEach(([, idx], g) => {
        const w = (r[`s${g}`] as number[] | undefined) ?? [];
        idx.forEach((i, j) => n.set(i, Number(w[j] ?? 0)));
      });
      return {
        eingang: r.eingang as number,
        favoriten: r.favoriten as number,
        papierkorb: r.papierkorb as number,
        sichten: liste.map((_, i) => n.get(i) ?? 0),
      };
    },
  } satisfies RepoTeil;
}

/** Gibt es Treffer oder Mappen? Klauseln, Lesbarkeit und Ausdrücke zählen. */
export function pgKlauseln(k: PgKontext) {
  const { sql, haushaltId } = k;
  const seitenTeile = seitenTeileVon(k);
  return {
    async gibtTreffer(o) {
      const { wo, treffer } = await seitenTeile(o);
      const [r] = await sql`SELECT EXISTS (SELECT 1 FROM mappen WHERE haushalt_id = ${haushaltId}
        ${treffer ? sql`AND id IN (SELECT id FROM (${treffer}) AS t(id))` : sql``} ${wo} LIMIT 1) AS da`;
      return r.da as boolean;
    },
    async gibtMappen(typIds) {
      const t = typIds.filter(istUuid);
      if (!t.length) return false;
      const [r] = await sql`SELECT EXISTS (SELECT 1 FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ANY(${t}::uuid[])) AS da`;
      return r.da as boolean;
    },
    async zaehleKlauseln(liste, lesefilter) {
      if (!liste.length) return [];
      const spalten = liste.map((k, i) => sql`count(*) FILTER (WHERE ${klauselnSql(sql, k)})::int AS ${sql(`s${i}`)}`);
      const sel = spalten.slice(1).reduce((acc, t) => sql`${acc}, ${t}`, spalten[0]);
      const lesen = lesefilter ? sql`AND ${lesefilterSql(sql, lesefilter)}` : sql``;
      const [r] = await sql`SELECT ${sel} FROM mappen WHERE haushalt_id = ${haushaltId} ${lesen}`;
      return liste.map((_, i) => r[`s${i}`] as number);
    },
    async lesbare(ids, lesefilter) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return new Set();
      const r =
        await sql`SELECT id FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) AND ${lesefilterSql(sql, lesefilter)}`;
      return new Set(r.map((z) => z.id as string));
    },
    async inKlauseln(ids, klauseln) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length || !klauseln.length) return new Set();
      const r =
        await sql`SELECT id FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) AND (${klauselnSql(sql, klauseln)})`;
      return new Set(r.map((z) => z.id as string));
    },
    async zaehleAusdruck(typId, x) {
      if (!istUuid(typId)) return 0;
      const [r] =
        await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId} AND ${ausdruckSql(sql, x)}`;
      return r.n as number;
    },
  } satisfies RepoTeil;
}
