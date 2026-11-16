/** Papierkorb (PostgreSQL, #43, #344, #424) und Löschprotokoll (#470). */
import { istSha } from '../../../../shared/src/loeschprotokoll';
import type { Werte } from '../../../../shared/src/model';
import { zeitzone } from '../../../../shared/src/region';
import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';
import { alsDokPapierkorb, alsLoeschEintrag, alsPapierkorb, loeschDok, loeschVersion, type Zeile } from './zeilen';

/** Wiederherstellen aus dem Papierkorb zum gemeinsamen Kontext. */
function wiederherstellenVon(k: PgKontext) {
  const { sql, haushaltId } = k;
  /** Papierkorb (#43, #424): mehrere zusammen wiederherstellen – erst alle Mappen, dann die Verweise. */
  async function stelleMehrereWiederHer(alle: string[]): Promise<{ verweiseEntfallen: number }> {
    const ids = [...new Set(alle.filter(istUuid))];
    if (!ids.length) return { verweiseEntfallen: 0 };
    return sql.begin(async (tx) => {
      // Zuerst alle Mappen, dann die Verweise: so kommen auch Verweise untereinander (#424) und Kreise zurück.
      const ps = await tx`SELECT id, verweise FROM papierkorb WHERE haushalt_id = ${haushaltId} AND id = ANY(${ids}::uuid[]) FOR UPDATE`;
      if (!ps.length) return { verweiseEntfallen: 0 };
      const da = ps.map((p) => p.id as string);
      // Benutzer, die es nicht mehr gibt, werden zu „unbekannt“ (wie ON DELETE SET NULL).
      await tx`
        INSERT INTO mappen
        SELECT (jsonb_populate_record(NULL::mappen, p.mappe || jsonb_build_object(
          'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = p.mappe ->> 'erstellt_von') THEN p.mappe -> 'erstellt_von' ELSE 'null'::jsonb END,
          'geaendert_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = p.mappe ->> 'geaendert_von') THEN p.mappe -> 'geaendert_von' ELSE 'null'::jsonb END))).*
        FROM papierkorb p WHERE p.id = ANY(${da}::uuid[])`;
      // Verweise nur auf Mappen, die es noch gibt; die übrigen bleiben als Wert stehen
      // und lassen die Mappe „nicht passen“ (Eingang).
      const v = await tx`
        INSERT INTO verweise
        SELECT r.* FROM papierkorb p, jsonb_populate_recordset(NULL::verweise, p.verweise) r
        WHERE p.id = ANY(${da}::uuid[]) AND EXISTS (SELECT 1 FROM mappen z WHERE z.id = r.ziel_id)
        ON CONFLICT DO NOTHING`;
      await tx`
        INSERT INTO dokumente
        SELECT (jsonb_populate_record(NULL::dokumente, d.value || jsonb_build_object(
          'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = d.value ->> 'erstellt_von') THEN d.value -> 'erstellt_von' ELSE 'null'::jsonb END,
          -- Archivnummer (#345) inzwischen anderweitig vergeben: ohne Nummer zurück.
          'archivnummer', CASE WHEN EXISTS (SELECT 1 FROM dokumente x WHERE x.haushalt_id = p.haushalt_id AND lower(x.archivnummer) = lower(d.value ->> 'archivnummer')) THEN 'null'::jsonb ELSE COALESCE(d.value -> 'archivnummer', 'null'::jsonb) END))).*
        FROM papierkorb p, jsonb_array_elements(p.dokumente) d WHERE p.id = ANY(${da}::uuid[])`;
      // Ältere Versionen (#194) mit ihren Dokumenten.
      await tx`
        INSERT INTO dokument_versionen
        SELECT (jsonb_populate_record(NULL::dokument_versionen, x.value || jsonb_build_object(
          'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'erstellt_von') THEN x.value -> 'erstellt_von' ELSE 'null'::jsonb END))).*
        FROM papierkorb p, jsonb_array_elements(coalesce(p.versionen, '[]'::jsonb)) x WHERE p.id = ANY(${da}::uuid[])
        ON CONFLICT DO NOTHING`;
      await tx`
        INSERT INTO notizen
        SELECT (jsonb_populate_record(NULL::notizen, n.value || jsonb_build_object(
          'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = n.value ->> 'erstellt_von') THEN n.value -> 'erstellt_von' ELSE 'null'::jsonb END,
          'geaendert_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = n.value ->> 'geaendert_von') THEN n.value -> 'geaendert_von' ELSE 'null'::jsonb END))).*
        FROM papierkorb p, jsonb_array_elements(p.notizen) n WHERE p.id = ANY(${da}::uuid[])`;
      // Aufgaben: Empfänger und Beteiligte nur, wenn es sie noch gibt.
      await tx`
        INSERT INTO aufgaben
        SELECT (jsonb_populate_record(NULL::aufgaben, x.value || jsonb_build_object(
          'empfaenger_id', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'empfaenger_id') THEN x.value -> 'empfaenger_id' ELSE 'null'::jsonb END,
          'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'erstellt_von') THEN x.value -> 'erstellt_von' ELSE 'null'::jsonb END,
          'erledigt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'erledigt_von') THEN x.value -> 'erledigt_von' ELSE 'null'::jsonb END))).*
        FROM papierkorb p, jsonb_array_elements(p.aufgaben) x WHERE p.id = ANY(${da}::uuid[])`;
      // Favoriten (#62): wieder da – für Benutzer, die es noch gibt.
      await tx`
        INSERT INTO favoriten
        SELECT r.* FROM papierkorb p, jsonb_populate_recordset(NULL::favoriten, coalesce(p.favoriten, '[]'::jsonb)) r
        WHERE p.id = ANY(${da}::uuid[]) AND EXISTS (SELECT 1 FROM benutzer b WHERE b.id = r.benutzer_id)
        ON CONFLICT DO NOTHING`;
      // Mappen-Abläufe (#131, #1044): wie Aufgaben; Einträge von vor #1044 sind Abläufe von „Erinnern“.
      await tx`
        INSERT INTO mappen_ablaeufe
        SELECT (jsonb_populate_record(NULL::mappen_ablaeufe, x.value || jsonb_build_object(
          'vorlage', coalesce(x.value -> 'vorlage', '"erinnern"'::jsonb),
          'empfaenger_id', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'empfaenger_id') THEN x.value -> 'empfaenger_id' ELSE 'null'::jsonb END,
          'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'erstellt_von') THEN x.value -> 'erstellt_von' ELSE 'null'::jsonb END))).*
        FROM papierkorb p, jsonb_array_elements(coalesce(p.erinnerungen, '[]'::jsonb)) x WHERE p.id = ANY(${da}::uuid[])`;
      await tx`DELETE FROM papierkorb WHERE id = ANY(${da}::uuid[])`;
      return { verweiseEntfallen: ps.reduce((s, p) => s + (p.verweise as unknown[]).length, 0) - v.count };
    });
  }

  return stelleMehrereWiederHer;
}

/** Mappen in den Papierkorb, zurück und endgültig löschen. */
export function pgPapierkorb(k: PgKontext) {
  const { sql, haushaltId } = k;
  const stelleMehrereWiederHer = wiederherstellenVon(k);
  return {
    /* ---------- Papierkorb (#43) ---------- */
    async legeInPapierkorb(id, benutzerId) {
      await sql.begin(async (tx) => {
        const r = await tx`
          INSERT INTO papierkorb (id, haushalt_id, typ_id, mappe, verweise, dokumente, versionen, geloescht_von, notizen, aufgaben, favoriten, erinnerungen)
          SELECT m.id, m.haushalt_id, m.typ_id, to_jsonb(m) - 'suchtext',
            (SELECT coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) FROM verweise v WHERE v.quelle_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(d) - 'suchindex'), '[]'::jsonb) FROM dokumente d WHERE d.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM dokument_versionen x JOIN dokumente d ON d.id = x.dokument_id WHERE d.mappe_id = m.id),
            ${istUuid(benutzerId) ? benutzerId : null}::uuid,
            (SELECT coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM notizen n WHERE n.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM aufgaben a WHERE a.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM favoriten f WHERE f.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM mappen_ablaeufe e WHERE e.mappe_id = m.id)
          FROM mappen m WHERE m.haushalt_id = ${haushaltId} AND m.id = ${id}`;
        // Ausgehende Verweise und Dokumente folgen per Kaskade.
        if (r.count) await tx`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      });
    },
    async legeVorgangInPapierkorb(alle, benutzerId, vorgang, entkoppelt) {
      const ids = [...new Set(alle.filter(istUuid))];
      if (!ids.length) return;
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO papierkorb (id, haushalt_id, typ_id, mappe, verweise, dokumente, versionen, geloescht_von, notizen, aufgaben, favoriten, erinnerungen, vorgang, entkoppelt)
          SELECT m.id, m.haushalt_id, m.typ_id, to_jsonb(m) - 'suchtext',
            (SELECT coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) FROM verweise v WHERE v.quelle_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(d) - 'suchindex'), '[]'::jsonb) FROM dokumente d WHERE d.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM dokument_versionen x JOIN dokumente d ON d.id = x.dokument_id WHERE d.mappe_id = m.id),
            ${istUuid(benutzerId) ? benutzerId : null}::uuid,
            (SELECT coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM notizen n WHERE n.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM aufgaben a WHERE a.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM favoriten f WHERE f.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM mappen_ablaeufe e WHERE e.mappe_id = m.id),
            ${vorgang}::uuid, coalesce(${json(sql, entkoppelt)}::jsonb -> (m.id::text), '[]'::jsonb)
          FROM mappen m WHERE m.haushalt_id = ${haushaltId} AND m.id = ANY(${ids}::uuid[])`;
        // Verweise untereinander zuerst (Kreise), dann die Mappen; Dokumente usw. folgen per Kaskade.
        // Verweist noch eine Mappe außerhalb darauf, scheitert alles (Fremdschlüssel) – nichts halb gelöscht.
        await tx`DELETE FROM verweise WHERE haushalt_id = ${haushaltId} AND quelle_id = ANY(${ids}::uuid[])`;
        await tx`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${ids}::uuid[])`;
      });
    },
    async papierkorb(f = {}) {
      return (
        await sql`
        SELECT id, typ_id, mappe, geloescht, geloescht_von, jsonb_array_length(dokumente) AS anzahl_dokumente, vorgang, entkoppelt
        FROM papierkorb WHERE haushalt_id = ${haushaltId}
          ${f.von ? sql`AND geloescht_von = ${istUuid(f.von) ? f.von : null}::uuid` : sql``}
          ${f.vor ? sql`AND geloescht < ${f.vor}` : sql``}
          ${f.typId ? sql`AND typ_id = ${istUuid(f.typId) ? f.typId : null}::uuid` : sql``}
        ORDER BY geloescht DESC, id`
      ).map(alsPapierkorb);
    },
    async holeAusPapierkorb(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`
        SELECT id, typ_id, mappe, geloescht, geloescht_von, jsonb_array_length(dokumente) AS anzahl_dokumente, vorgang, entkoppelt
        FROM papierkorb WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsPapierkorb(r) : undefined;
    },
    async stelleWiederHer(id) {
      return stelleMehrereWiederHer([id]);
    },
    stelleMehrereWiederHer,
    async leerePapierkorb(ids) {
      const gueltig = ids.filter(istUuid);
      if (!gueltig.length) return [];
      const r =
        await sql`DELETE FROM papierkorb WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) RETURNING dokumente, versionen`;
      return [
        ...new Set<string>(
          r.flatMap((z: Zeile) => [...(z.dokumente as Zeile[]), ...((z.versionen as Zeile[] | null) ?? [])].map((d) => d.sha256 as string)),
        ),
      ];
    },
    async zaehlePapierkorb(von) {
      // Mappen und einzelne Dokumente (#344).
      const [r] = await sql`SELECT
        (SELECT count(*)::int FROM papierkorb WHERE haushalt_id = ${haushaltId} ${von ? sql`AND geloescht_von = ${istUuid(von) ? von : null}::uuid` : sql``})
        + (SELECT count(*)::int FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId} ${von ? sql`AND geloescht_von = ${istUuid(von) ? von : null}::uuid` : sql``}) AS n`;
      return r.n as number;
    },
  } satisfies RepoTeil;
}

/** Einzelne Dokumente im Papierkorb (#344). */
export function pgDokumentPapierkorb(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    /* Einzelne Dokumente (#344) */
    async legeDokumentInPapierkorb(id, benutzerId) {
      if (!istUuid(id)) return;
      await sql.begin(async (tx) => {
        const r = await tx`
          INSERT INTO papierkorb_dokumente (id, haushalt_id, mappe_id, dokument, versionen, geloescht_von)
          SELECT d.id, d.haushalt_id, d.mappe_id, to_jsonb(d) - 'suchindex',
            (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.nummer), '[]'::jsonb) FROM dokument_versionen x WHERE x.dokument_id = d.id),
            ${istUuid(benutzerId) ? benutzerId : null}::uuid
          FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.id = ${id}`;
        // Ältere Versionen folgen per Kaskade.
        if (r.count) await tx`DELETE FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      });
    },
    async papierkorbDokumente(f = {}) {
      const ids = (f.mappeIds ?? []).filter(istUuid);
      return (
        await sql`
        SELECT id, mappe_id, dokument - 'volltext' AS dokument, geloescht, geloescht_von, jsonb_array_length(versionen) AS anzahl_versionen
        FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId}
          ${f.von ? sql`AND geloescht_von = ${istUuid(f.von) ? f.von : null}::uuid` : sql``}
          ${f.vor ? sql`AND geloescht < ${f.vor}` : sql``}
          ${f.mappeIds ? sql`AND mappe_id = ANY(${ids}::uuid[])` : sql``}
        ORDER BY geloescht DESC, id`
      ).map(alsDokPapierkorb);
    },
    async holeDokumentAusPapierkorb(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`
        SELECT id, mappe_id, dokument - 'volltext' AS dokument, geloescht, geloescht_von, jsonb_array_length(versionen) AS anzahl_versionen
        FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsDokPapierkorb(r) : undefined;
    },
    async stelleDokumentWiederHer(id) {
      await sql.begin(async (tx) => {
        const [p] = await tx`SELECT 1 FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id} FOR UPDATE`;
        if (!p) return;
        await tx`
          INSERT INTO dokumente
          SELECT (jsonb_populate_record(NULL::dokumente, p.dokument || jsonb_build_object(
            'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = p.dokument ->> 'erstellt_von') THEN p.dokument -> 'erstellt_von' ELSE 'null'::jsonb END,
            'archivnummer', CASE WHEN EXISTS (SELECT 1 FROM dokumente x WHERE x.haushalt_id = p.haushalt_id AND lower(x.archivnummer) = lower(p.dokument ->> 'archivnummer')) THEN 'null'::jsonb ELSE COALESCE(p.dokument -> 'archivnummer', 'null'::jsonb) END,
            -- Anlagen (#998): wieder an ihr Hauptdokument, wenn es in derselben Mappe ist – sonst ein eigenes Dokument.
            'anlage_zu', CASE WHEN EXISTS (SELECT 1 FROM dokumente h WHERE h.haushalt_id = p.haushalt_id AND h.id::text = p.dokument ->> 'anlage_zu' AND h.mappe_id = p.mappe_id) THEN p.dokument -> 'anlage_zu' ELSE 'null'::jsonb END,
            'anlage_nr', CASE WHEN EXISTS (SELECT 1 FROM dokumente h WHERE h.haushalt_id = p.haushalt_id AND h.id::text = p.dokument ->> 'anlage_zu' AND h.mappe_id = p.mappe_id) THEN COALESCE(p.dokument -> 'anlage_nr', 'null'::jsonb) ELSE 'null'::jsonb END))).*
          FROM papierkorb_dokumente p WHERE p.id = ${id}`;
        await tx`
          INSERT INTO dokument_versionen
          SELECT (jsonb_populate_record(NULL::dokument_versionen, x.value || jsonb_build_object(
            'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'erstellt_von') THEN x.value -> 'erstellt_von' ELSE 'null'::jsonb END))).*
          FROM papierkorb_dokumente p, jsonb_array_elements(p.versionen) x WHERE p.id = ${id}
          ON CONFLICT DO NOTHING`;
        await tx`DELETE FROM papierkorb_dokumente WHERE id = ${id}`;
      });
    },
    async leereDokumentPapierkorb(ids) {
      const gueltig = ids.filter(istUuid);
      if (!gueltig.length) return [];
      const r =
        await sql`DELETE FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) RETURNING dokument, versionen`;
      return [
        ...new Set<string>(
          r.flatMap((z: Zeile) => [
            (z.dokument as Zeile).sha256 as string,
            ...((z.versionen as Zeile[]) ?? []).map((v) => v.sha256 as string),
          ]),
        ),
      ];
    },
  } satisfies RepoTeil;
}

/** Inhalt des Papierkorbs für das Löschprotokoll (#470) und das Protokoll selbst. */
export function pgLoeschprotokoll(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    /* ---------- Löschprotokoll (#470) ---------- */
    async papierkorbInhalt(ids) {
      const g = ids.filter(istUuid);
      if (!g.length) return [];
      const r = await sql`
        SELECT id, typ_id, mappe -> 'werte' AS werte, coalesce((mappe ->> 'demo')::boolean, false) AS demo, vorgang,
          jsonb_array_length(coalesce(entkoppelt, '[]'::jsonb)) AS entkoppelt, jsonb_array_length(coalesce(notizen, '[]'::jsonb)) AS notizen, dokumente, versionen
        FROM papierkorb WHERE haushalt_id = ${haushaltId} AND id = ANY(${g}::uuid[])`;
      return r.map((z: Zeile) => ({
        id: z.id as string,
        typId: z.typ_id as string,
        werte: (z.werte as Werte) ?? {},
        demo: !!z.demo,
        vorgang: (z.vorgang as string | null) ?? null,
        entkoppelt: Number(z.entkoppelt),
        notizen: Number(z.notizen),
        dokumente: [...((z.dokumente as Zeile[]) ?? []).map(loeschDok), ...((z.versionen as Zeile[] | null) ?? []).map(loeschVersion)],
      }));
    },
    async papierkorbDokumentInhalt(ids) {
      const g = ids.filter(istUuid);
      if (!g.length) return [];
      const r =
        await sql`SELECT id, mappe_id, dokument - 'volltext' AS dokument, versionen FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId} AND id = ANY(${g}::uuid[])`;
      return r.map((z: Zeile) => ({
        id: z.id as string,
        mappeId: z.mappe_id as string,
        dokumente: [loeschDok(z.dokument as Zeile), ...((z.versionen as Zeile[]) ?? []).map(loeschVersion)],
      }));
    },
    async loeschprotokollSchreibe(liste) {
      if (!liste.length) return;
      const u = (v: string | null) => (v && istUuid(v) ? v : null);
      const zeilen = liste.map((e) => ({
        id: e.id,
        haushalt_id: haushaltId,
        zeit: e.zeit,
        art: e.art,
        schritt: e.schritt,
        weg: e.weg,
        mappe_id: e.mappeId,
        typ_id: u(e.typId),
        typ_name: e.typ,
        nummer: e.nummer,
        archivnummer: e.archivnummer,
        dokument_id: u(e.dokumentId),
        version: e.version,
        sha256: e.sha256,
        groesse: e.groesse,
        mime: e.mime,
        seiten: e.seiten,
        anzahl: e.anzahl ? json(sql, e.anzahl) : null,
        von_id: u(e.vonId),
        von_name: e.von,
        ausloeser: e.ausloeser,
        grund: e.grund,
        grund_text: e.grundText,
        vorgang: u(e.vorgang),
        start_id: u(e.startId),
      }));
      for (let i = 0; i < zeilen.length; i += 500) await sql`INSERT INTO loeschprotokoll ${sql(zeilen.slice(i, i + 500))}`;
    },
    async loeschprotokoll(f) {
      const such = f.suche?.trim().toLowerCase();
      const bed = sql`haushalt_id = ${haushaltId}
        ${f.von ? sql`AND (zeit AT TIME ZONE ${zeitzone()})::date >= ${f.von}::date` : sql``}
        ${f.bis ? sql`AND (zeit AT TIME ZONE ${zeitzone()})::date <= ${f.bis}::date` : sql``}
        ${f.typId ? sql`AND typ_id = ${istUuid(f.typId) ? f.typId : null}::uuid` : sql``}
        ${f.grund ? (f.grund === 'ohne' ? sql`AND grund IS NULL` : sql`AND grund = ${f.grund}`) : sql``}
        ${f.schritt ? sql`AND schritt = ${f.schritt}` : sql``}
        ${f.art ? sql`AND art = ${f.art}` : sql``}
        ${f.vorgang ? sql`AND (vorgang = ${istUuid(f.vorgang) ? f.vorgang : null}::uuid OR mappe_id = ${istUuid(f.vorgang) ? f.vorgang : null}::uuid)` : sql``}
        ${f.ids ? sql`AND (mappe_id = ANY(${f.ids.filter(istUuid)}::uuid[]) OR dokument_id = ANY(${f.ids.filter(istUuid)}::uuid[]))` : sql``}
        ${such ? (istSha(such) ? sql`AND sha256 = ${such}` : sql`AND (lower(coalesce(nummer, '') || ' ' || coalesce(archivnummer, '')) LIKE ${'%' + such.replace(/[\\%_]/g, (c) => '\\' + c) + '%'} OR mappe_id::text = ${such} OR dokument_id::text = ${such})`) : sql``}`;
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM loeschprotokoll WHERE ${bed}`;
      const r = await sql`SELECT * FROM loeschprotokoll WHERE ${bed} ORDER BY zeit DESC, art DESC, id LIMIT ${f.max ?? 500}`;
      return { eintraege: r.map(alsLoeschEintrag), gesamt: n as number };
    },
    async loeschprotokollAufraeumen(vor) {
      return sql.begin(async (tx) => {
        await tx`SELECT set_config('dms.loeschprotokoll_aufraeumen', 'ja', true)`;
        const r = await tx`DELETE FROM loeschprotokoll WHERE haushalt_id = ${haushaltId} AND zeit < ${vor}`;
        return r.count;
      });
    },
  } satisfies RepoTeil;
}
