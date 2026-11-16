/** Mappentypen (PostgreSQL): anlegen, ändern, Kennung und Berechtigungen, Passung der Mappen. */
import { teileKennung } from '../../../../shared/src/kennungen';
import { type MappentypDaten, standardliste, trefferlistenVon } from '../../../../shared/src/model';
import { istUuid, KonfigurationVeraltet, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';
import { alsTyp, iso } from './zeilen';

/** Mappentypen lesen und schreiben, Kennung, Schlüssel und Berechtigungen. */
export function pgTypen(k: PgKontext) {
  const { sql, haushaltId, imTx, alleTypen, STAND_WEITER } = k;
  return {
    async listeTypen() {
      return alleTypen();
    },
    async holeTyp(id) {
      if (!istUuid(id)) return undefined;
      // Aus den gemerkten Typen (#928, gleicher Stand `lesen` wie listeTypen): Anlegen einer Aufgabe las sonst dreimal
      // je einen Typ (Systemtypen). In einer Transaktion wie bisher aus der Tabelle.
      if (!imTx) return (await alleTypen()).find((t) => t.id === id);
      const [r] = await sql`SELECT * FROM mappentypen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsTyp(r) : undefined;
    },
    async legeTypAn(id, d: MappentypDaten, system) {
      const k = d.schluessel ? teileKennung(d.schluessel) : { paket: null, schluessel: null };
      const [r] = await sql`
        INSERT INTO mappentypen (id, haushalt_id, name, paket, schluessel, beschreibung, titel_vorlage, felder, register, trefferliste, trefferlisten, erstellen_erlaubt, loeschen_erlaubt, system, archiv, beschriftungen, aus_post, erkennbar_an, teil_von, in_suche)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${k.paket}, ${k.schluessel}, ${d.beschreibung}, ${d.titelVorlage}, ${json(sql, d.felder)}, ${json(sql, d.register)}, ${json(sql, standardliste(d).spalten)}, ${json(sql, trefferlistenVon(d))},
          ${d.erstellenErlaubt !== false}, ${d.loeschenErlaubt !== false}, ${system ?? null}, ${d.archiv ? json(sql, d.archiv) : null}, ${d.beschriftungen ? json(sql, d.beschriftungen) : null},
          ${typeof d.ausPost === 'boolean' ? d.ausPost : null}, ${d.erkennbarAn ?? ''}, ${d.teilVon || null}, ${typeof d.inSuche === 'boolean' ? d.inSuche : null})
        RETURNING *`;
      return alsTyp(r);
    },
    async aendereTyp(id, d, erwartet) {
      return sql.begin(async (tx) => {
        // Gleichzeitig bearbeitet (#917): nur auf dem Stand, auf dem die Bearbeitung beruht.
        if (erwartet !== undefined) {
          const [a] = await tx`SELECT geaendert FROM mappentypen WHERE haushalt_id = ${haushaltId} AND id = ${id} FOR UPDATE`;
          if (a && iso(a.geaendert) !== erwartet) throw new KonfigurationVeraltet();
        }
        // Die Kennung ist fest (#145); fehlt sie noch, gilt die neue – Paket und Schlüssel zusammen (#1084).
        const k = d.schluessel ? teileKennung(d.schluessel) : { paket: null, schluessel: null };
        const [r] = await tx`
          UPDATE mappentypen SET name = ${d.name}, paket = CASE WHEN schluessel IS NULL THEN ${k.paket} ELSE paket END, schluessel = coalesce(schluessel, ${k.schluessel}), beschreibung = ${d.beschreibung}, titel_vorlage = ${d.titelVorlage},
            felder = ${json(sql, d.felder)}, register = ${json(sql, d.register)}, trefferliste = ${json(sql, standardliste(d).spalten)}, trefferlisten = ${json(sql, trefferlistenVon(d))},
            erstellen_erlaubt = ${d.erstellenErlaubt !== false}, loeschen_erlaubt = ${d.loeschenErlaubt !== false}, archiv = ${d.archiv ? json(sql, d.archiv) : null},
            beschriftungen = ${d.beschriftungen ? json(sql, d.beschriftungen) : null}, aus_post = ${typeof d.ausPost === 'boolean' ? d.ausPost : null}, erkennbar_an = ${d.erkennbarAn ?? ''},
            teil_von = ${d.teilVon || null}, in_suche = ${typeof d.inSuche === 'boolean' ? d.inSuche : null}, geaendert = ${STAND_WEITER}
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
    async setzeTypKennung(typId, kennung) {
      const k = teileKennung(kennung);
      await sql`UPDATE mappentypen SET paket = ${k.paket}, schluessel = ${k.schluessel} WHERE haushalt_id = ${haushaltId} AND id = ${typId}`;
    },
    async setzeTypSchluessel(typId, schluessel) {
      await sql`UPDATE mappentypen SET schluessel = ${schluessel} WHERE haushalt_id = ${haushaltId} AND id = ${typId} AND schluessel IS NULL`;
    },
    async setzeBerechtigungen(typId, rw) {
      const [r] =
        await sql`UPDATE mappentypen SET berechtigungen = ${rw ? json(sql, rw) : null}, geaendert = ${STAND_WEITER} WHERE haushalt_id = ${haushaltId} AND id = ${typId} RETURNING *`;
      return alsTyp(r);
    },
  } satisfies RepoTeil;
}

/** Passen die Mappen zu ihrem Typ? Belegung der Felder. */
export function pgPassung(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
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
      return (await sql`SELECT id FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId} AND passt IS NOT TRUE`).map(
        (z) => z.id as string,
      );
    },
    async typenOhnePassung() {
      return (await sql`SELECT DISTINCT typ_id FROM mappen WHERE haushalt_id = ${haushaltId} AND passt IS NULL`).map(
        (z) => z.typ_id as string,
      );
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
  } satisfies RepoTeil;
}
