/** Pakete (PostgreSQL): installierte Pakete, Code, Sprachpakete, Verlauf (#1003) und Hinweise (#1034). */
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { VERLAUF_FEHLER, VERLAUF_MAX, VERLAUF_TAGE, type VerlaufEintrag } from '../../../../shared/src/paketreiter';
import { dienstEmail, istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';
import { iso } from './zeilen';

/** Installierte Pakete, ihr Code und Sprachpakete; Hinweise von Paketen (#1034). */
export function pgPakete(k: PgKontext) {
  const { sql, haushaltId, gemerkt } = k;
  return {
    async listePakete() {
      return gemerkt('pakete', async () =>
        (await sql`SELECT daten FROM pakete WHERE haushalt_id = ${haushaltId} ORDER BY id`).map((r) => r.daten as InstalliertesPaket),
      );
    },
    async speicherePaket(p) {
      await sql`
        INSERT INTO pakete (haushalt_id, id, version, daten, installiert) VALUES (${haushaltId}, ${p.id}, ${p.version}, ${json(sql, p)}, ${p.installiert})
        ON CONFLICT (haushalt_id, id) DO UPDATE SET version = EXCLUDED.version, daten = EXCLUDED.daten`;
    },
    async loeschePaket(id) {
      await sql`DELETE FROM pakete WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async benennePaketUm(alt, neu) {
      await sql.begin(async (tx) => {
        await tx`UPDATE pakete SET id = ${neu}, daten = jsonb_set(daten, '{id}', to_jsonb(${neu}::text)) WHERE haushalt_id = ${haushaltId} AND id = ${alt}`;
        await tx`UPDATE pakete SET daten = jsonb_set(daten, '{abhaengigkeiten}', ((daten->'abhaengigkeiten') - ${alt}::text) || jsonb_build_object(${neu}::text, daten->'abhaengigkeiten'->${alt}::text))
          WHERE haushalt_id = ${haushaltId} AND jsonb_typeof(daten->'abhaengigkeiten') = 'object' AND daten->'abhaengigkeiten' ? ${alt}::text`;
        await tx`UPDATE paket_code SET paket_id = ${neu} WHERE haushalt_id = ${haushaltId} AND paket_id = ${alt}`;
        await tx`UPDATE paket_sprachen SET paket_id = ${neu} WHERE haushalt_id = ${haushaltId} AND paket_id = ${alt}`;
        await tx`UPDATE paket_sprachen SET paketbeschriftungen = (paketbeschriftungen - ${alt}::text) || jsonb_build_object(${neu}::text, paketbeschriftungen->${alt}::text)
          WHERE haushalt_id = ${haushaltId} AND paketbeschriftungen ? ${alt}::text`;
        await tx`UPDATE paket_ereignisse SET paket_id = ${neu} WHERE haushalt_id = ${haushaltId} AND paket_id = ${alt}`;
        await tx`UPDATE paket_verlauf SET paket_id = ${neu} WHERE haushalt_id = ${haushaltId} AND paket_id = ${alt}`;
        await tx`UPDATE synonyme SET quelle = ${neu} WHERE haushalt_id = ${haushaltId} AND quelle = ${alt}`;
        await tx`UPDATE mappentypen SET paket = ${neu} WHERE haushalt_id = ${haushaltId} AND paket = ${alt}`;
        // Vorgaben (#1038): Die feste Kennung nennt das Paket – sie zieht mit um.
        await tx`UPDATE mappen SET vorgabe = ${`paket:${neu}:`} || substr(vorgabe, ${`paket:${alt}:`.length + 1}) WHERE haushalt_id = ${haushaltId} AND left(vorgabe, ${`paket:${alt}:`.length}) = ${`paket:${alt}:`}`;
        await tx`UPDATE vektoren SET paket = ${neu} WHERE haushalt_id = ${haushaltId} AND paket = ${alt}`;
        await tx`UPDATE automatisierungen SET paket_id = ${neu} WHERE haushalt_id = ${haushaltId} AND paket_id = ${alt}`;
        await tx`UPDATE benutzer SET paket_id = ${neu}, email = ${dienstEmail(neu, haushaltId)} WHERE haushalt_id = ${haushaltId} AND art = 'dienst' AND paket_id = ${alt}`;
      });
    },
    async speicherePaketCode(id, dateien) {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM paket_code WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`;
        for (const d of dateien)
          await tx`INSERT INTO paket_code (haushalt_id, paket_id, name, inhalt) VALUES (${haushaltId}, ${id}, ${d.name}, ${d.inhalt})`;
      });
    },
    async paketCode(id) {
      return (await sql`SELECT name, inhalt FROM paket_code WHERE haushalt_id = ${haushaltId} AND paket_id = ${id} ORDER BY name`).map(
        (r) => ({ name: r.name as string, inhalt: Buffer.from(r.inhalt as Uint8Array) }),
      );
    },
    async loeschePaketCode(id) {
      await sql`DELETE FROM paket_code WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`;
    },
    async speichereSprachpaket(id, d) {
      await sql`
        INSERT INTO paket_sprachen (haushalt_id, paket_id, kennung, texte, paketbeschriftungen) VALUES (${haushaltId}, ${id}, ${d.kennung}, ${json(sql, d.texte)}, ${json(sql, d.beschriftungen)})
        ON CONFLICT (haushalt_id, paket_id) DO UPDATE SET kennung = EXCLUDED.kennung, texte = EXCLUDED.texte, paketbeschriftungen = EXCLUDED.paketbeschriftungen`;
    },
    async sprachpakete() {
      return (
        await sql`SELECT paket_id, kennung, texte, paketbeschriftungen FROM paket_sprachen WHERE haushalt_id = ${haushaltId} ORDER BY paket_id`
      ).map((r) => ({
        paketId: r.paket_id as string,
        kennung: r.kennung as string,
        texte: r.texte as import('../../../../shared/src/sprachpaket').Sprachtexte,
        beschriftungen: r.paketbeschriftungen as Record<string, import('../../../../shared/src/sprachpaket').SprachBeschriftung>,
      }));
    },
    async loescheSprachpaket(id) {
      await sql`DELETE FROM paket_sprachen WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`;
    },
    /* ---------- Notizen (#55) ---------- */
    // Hinweise von Paketen (#1034)
    async hinweise(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (
        await sql`SELECT paket_id, schluessel, text, gesetzt FROM mappen_hinweise WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY gesetzt, paket_id, schluessel`
      ).map((r) => ({ paket: r.paket_id as string, schluessel: r.schluessel as string, text: r.text as string, gesetzt: iso(r.gesetzt) }));
    },
    async setzeHinweis(h) {
      if (!istUuid(h.mappeId)) return;
      await sql`INSERT INTO mappen_hinweise (haushalt_id, mappe_id, paket_id, schluessel, text) VALUES (${haushaltId}, ${h.mappeId}, ${h.paket}, ${h.schluessel}, ${h.text})
        ON CONFLICT (mappe_id, paket_id, schluessel) DO UPDATE SET text = EXCLUDED.text, gesetzt = now()`;
    },
    async loescheHinweis(mappeId, paket, schluessel) {
      if (!istUuid(mappeId)) return false;
      return (
        (
          await sql`DELETE FROM mappen_hinweise WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} AND paket_id = ${paket} AND schluessel = ${schluessel}`
        ).count > 0
      );
    },
    async loescheHinweiseVon(paket) {
      return (await sql`DELETE FROM mappen_hinweise WHERE haushalt_id = ${haushaltId} AND paket_id = ${paket}`).count;
    },
  } satisfies RepoTeil;
}

/** Verlauf und Auslastung der Pakete (#1003). */
export function pgPaketVerlauf(k: PgKontext) {
  const { sql, haushaltId, stand } = k;
  return {
    async notiereVerlauf(liste) {
      if (!liste.length) return;
      await sql`INSERT INTO paket_verlauf ${sql(
        liste.map((e) => ({
          haushalt_id: haushaltId,
          paket_id: e.paket,
          art: e.art,
          was: (e.was ?? '').slice(0, 200),
          ergebnis: e.ergebnis ?? null,
          ms: e.ms ?? null,
          speicher_mb: e.speicherMB ?? null,
          text: (e.text ?? '').slice(0, 500),
          wer: e.wer ?? null,
          bezug: e.bezug ? json(sql, e.bezug) : null,
          netz: e.netz?.length ? json(sql, e.netz.slice(0, 20)) : null,
        })),
      )}`;
      // Aufräumen höchstens alle 10 Minuten: 30 Tage, höchstens VERLAUF_MAX je Paket.
      if (Date.now() - stand.verlaufAufgeraeumt < 600_000) return;
      stand.verlaufAufgeraeumt = Date.now();
      await sql`DELETE FROM paket_verlauf WHERE haushalt_id = ${haushaltId} AND zeit < now() - make_interval(days => ${VERLAUF_TAGE})`;
      await sql`DELETE FROM paket_verlauf v USING (SELECT nr FROM (SELECT nr, row_number() OVER (PARTITION BY paket_id ORDER BY nr DESC) AS rang
        FROM paket_verlauf WHERE haushalt_id = ${haushaltId}) x WHERE x.rang > ${VERLAUF_MAX}) alt WHERE v.nr = alt.nr`;
    },
    async paketVerlauf(id, f) {
      const fehler = f.nurFehler ? sql`AND ergebnis = ANY(${[...VERLAUF_FEHLER]}::text[])` : sql``;
      const suche = f.suche?.trim()
        ? sql`AND (was || ' ' || text) ILIKE ${`%${f.suche.trim().replace(/[\\%_]/g, (x) => `\\${x}`)}%`}`
        : sql``;
      const vor = f.vor ? sql`AND nr < ${f.vor}` : sql``;
      return (
        await sql`SELECT nr, zeit, art, was, ergebnis, ms, speicher_mb, text, wer, bezug, netz FROM paket_verlauf
        WHERE haushalt_id = ${haushaltId} AND paket_id = ${id} ${vor} ${fehler} ${suche} ORDER BY nr DESC LIMIT ${f.anzahl}`
      ).map((r) => ({
        nr: Number(r.nr),
        zeit: (r.zeit as Date).toISOString(),
        art: r.art as VerlaufEintrag['art'],
        was: r.was as string,
        ergebnis: (r.ergebnis as VerlaufEintrag['ergebnis']) ?? null,
        ms: (r.ms as number | null) ?? null,
        speicherMB: (r.speicher_mb as number | null) ?? null,
        text: r.text as string,
        wer: (r.wer as string | null) ?? null,
        bezug: (r.bezug as VerlaufEintrag['bezug']) ?? null,
        netz: (r.netz as string[] | null) ?? [],
      }));
    },
    async paketAuslastung(id, tage) {
      const zeilen = await sql`SELECT to_char(date_trunc('day', zeit AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS tag,
          count(*)::int AS aufrufe, count(*) FILTER (WHERE ergebnis IN ('fehler', 'zeit', 'speicher'))::int AS fehler,
          count(*) FILTER (WHERE ergebnis = 'zeit')::int AS zeit, count(*) FILTER (WHERE ergebnis = 'speicher')::int AS speicher,
          coalesce(sum(ms), 0)::bigint AS ms_summe, coalesce(max(ms), 0)::int AS ms_max, coalesce(max(speicher_mb), 0)::int AS speicher_max
        FROM paket_verlauf WHERE haushalt_id = ${haushaltId} AND paket_id = ${id} AND art IN ('ereignis', 'aufruf') AND zeit >= now() - make_interval(days => ${tage})
        GROUP BY 1 ORDER BY 1`;
      const [z] =
        await sql`SELECT max(zeit) AS zuletzt FROM paket_verlauf WHERE haushalt_id = ${haushaltId} AND paket_id = ${id} AND art IN ('ereignis', 'aufruf')`;
      return {
        tage: zeilen.map((r) => ({
          tag: r.tag as string,
          aufrufe: r.aufrufe as number,
          fehler: r.fehler as number,
          zeit: r.zeit as number,
          speicher: r.speicher as number,
          msSumme: Number(r.ms_summe),
          msMax: r.ms_max as number,
          speicherMax: r.speicher_max as number,
        })),
        zuletzt: z?.zuletzt ? (z.zuletzt as Date).toISOString() : null,
      };
    },
    async loescheVerlauf(id) {
      await sql`DELETE FROM paket_verlauf WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`;
    },
  } satisfies RepoTeil;
}
