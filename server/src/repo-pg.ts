import type postgres from 'postgres';
import { alsText } from '../../shared/src/markdown';
import { TREFFER_ANFANG, TREFFER_ENDE, type Aufgabe, type Ausschnitt, type Dokument, type Historienart, type Historieneintrag, type Mappe, type Notiz, type Mappentyp, type MappentypDaten, type OcrStandArt, type Werte } from '../../shared/src/model';
import type { Filter, Klausel, Sicht, SichtDaten } from '../../shared/src/sichten';
import { istUuid, type PapierkorbEintrag, type Repo, type Verweis } from './repo';

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
  erstellenErlaubt: r.erstellen_erlaubt !== false,
  loeschenErlaubt: r.loeschen_erlaubt !== false,
  system: (r.system as Mappentyp['system']) ?? null,
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
  systemKennung: (r.system_kennung as string | null) ?? null,
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
  ocr: {
    stand: ((r.ocr_stand as OcrStandArt | null) ?? 'keiner'),
    info: (r.ocr_info as string | null) ?? null,
    seiten: (r.ocr_seiten as number | null) ?? null,
    zeit: r.ocr_zeit ? iso(r.ocr_zeit) : null,
  },
});
/** Ausschnitte aus dem Volltext: höchstens zwei Stellen, Treffer markiert (#45). */
const AUSSCHNITT = `StartSel=${TREFFER_ANFANG}, StopSel=${TREFFER_ENDE}, MaxFragments=2, MaxWords=18, MinWords=6, FragmentDelimiter=" … "`;
const alsAufgabe = (r: Zeile): Aufgabe => ({
  id: r.id as string, mappeId: r.mappe_id as string, empfaengerId: (r.empfaenger_id as string | null) ?? null,
  art: r.art as Aufgabe['art'], text: r.text as string, feldKey: (r.feld_key as string | null) ?? null,
  erstellt: iso(r.erstellt), erstelltVon: (r.erstellt_von as string | null) ?? null,
  erledigt: r.erledigt ? iso(r.erledigt) : null, erledigtVon: (r.erledigt_von as string | null) ?? null,
  ...(r.mappe_titel !== undefined ? { mappeTitel: (r.mappe_titel as string | null) ?? '', typId: r.typ_id as string } : {}),
});
const alsNotiz = (r: Zeile): Notiz => ({
  id: r.id as string, mappeId: r.mappe_id as string, text: r.text as string,
  erstellt: iso(r.erstellt), erstelltVon: (r.erstellt_von as string | null) ?? null,
  geaendert: iso(r.geaendert), geaendertVon: (r.geaendert_von as string | null) ?? null,
});
/** Fundstelle in einem Text: ein Ausschnitt um den ersten Treffer, markiert (#55). */
export function ausschnittAus(text: string, suche: string): string | null {
  const i = text.toLowerCase().indexOf(suche.toLowerCase());
  if (i < 0) return null;
  const vor = text.slice(Math.max(0, i - 50), i);
  return `${i > 50 ? '… ' : ''}${vor}${TREFFER_ANFANG}${text.slice(i, i + suche.length)}${TREFFER_ENDE}${text.slice(i + suche.length, i + suche.length + 60)}${i + suche.length + 60 < text.length ? ' …' : ''}`.replace(/\s+/g, ' ');
}
/** Eintrag im Papierkorb aus der Zeile; die Mappe steht als jsonb (Spaltennamen der Tabelle mappen) darin. */
const alsPapierkorb = (r: Zeile): PapierkorbEintrag => {
  const m = r.mappe as Zeile;
  return {
    id: r.id as string, typId: r.typ_id as string, titel: (m.titel as string | null) ?? '', werte: (m.werte as Werte) ?? {}, demo: !!m.demo,
    erstellt: iso(m.erstellt), erstelltVon: (m.erstellt_von as string | null) ?? null,
    geaendert: iso(m.geaendert), geaendertVon: (m.geaendert_von as string | null) ?? null,
    geloescht: iso(r.geloescht), geloeschtVon: (r.geloescht_von as string | null) ?? null,
    dokumente: Number(r.anzahl_dokumente ?? 0),
  };
};
// postgres.js erwartet für jsonb einen JSON-Wert; unsere Typen sind JSON-kompatibel.
const json = (sql: Sql, v: unknown) => sql.json(v as postgres.JSONValue);

const alsSicht = (r: Zeile): Sicht => ({
  id: r.id as string,
  name: r.name as string,
  beschreibung: r.beschreibung as string,
  elternId: (r.eltern_id as string | null) ?? null,
  position: r.position as number,
  typen: (r.typen as string[]) ?? [],
  bedingungen: (r.bedingungen as Sicht['bedingungen']) ?? [],
  erstellt: iso(r.erstellt),
  geaendert: iso(r.geaendert),
});

/* ---------- Bedingungen einer Sicht als SQL (#38, #40, #41) ---------- */

type Teil = postgres.PendingQuery<postgres.Row[]> | postgres.Fragment;

/** Wert eines Feldes als vergleichbarer SQL-Ausdruck; ungültige Werte werden NULL. */
function ausdruck(sql: Sql, f: Extract<Filter, { art: 'feld' }>) {
  const k = f.key;
  switch (f.key) {
    case '_erstellt': return sql`(mappen.erstellt AT TIME ZONE 'Europe/Berlin')::date`;
    case '_geaendert': return sql`(mappen.geaendert AT TIME ZONE 'Europe/Berlin')::date`;
    case '_erstelltVon': return sql`mappen.erstellt_von::text`;
    case '_geaendertVon': return sql`mappen.geaendert_von::text`;
  }
  switch (f.feldart) {
    case 'zahl': return sql`(CASE WHEN jsonb_typeof(mappen.werte -> ${k}::text) = 'number' THEN (mappen.werte ->> ${k}::text)::numeric END)`;
    case 'betrag': return sql`(CASE WHEN jsonb_typeof(mappen.werte -> ${k}::text -> 'betrag') = 'number' THEN (mappen.werte -> ${k}::text ->> 'betrag')::numeric END)`;
    case 'datum': return sql`(CASE WHEN mappen.werte ->> ${k}::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (mappen.werte ->> ${k}::text)::date END)`;
    default: return sql`nullif(mappen.werte ->> ${k}::text, '')`;
  }
}

function feldBedingung(sql: Sql, f: Extract<Filter, { art: 'feld' }>): Teil {
  const k = f.key;
  const x = ausdruck(sql, f);
  const zahl = f.feldart === 'zahl' || f.feldart === 'betrag';
  const datum = f.feldart === 'datum' || f.feldart === 'zeit';
  const wert = (v: unknown) => (zahl ? sql`${Number(v)}::numeric` : datum ? sql`${String(v)}::date` : sql`${String(v ?? '')}`);
  const liste = (v: unknown) => (Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]);
  // Leer: auch leere Listen und Beträge ohne Zahl.
  const leer = f.key.startsWith('_') ? sql`${x} IS NULL`
    : f.feldart === 'referenz' ? sql`NOT EXISTS (SELECT 1 FROM verweise v WHERE v.quelle_id = mappen.id AND v.feld_key = ${k})`
    : zahl || datum ? sql`${x} IS NULL`
    : sql`(mappen.werte -> ${k}::text IS NULL OR mappen.werte -> ${k}::text IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb))`;
  switch (f.op) {
    case 'leer': return leer;
    case 'nichtLeer': return sql`NOT (${leer})`;
    case 'ja': return sql`mappen.werte -> ${k}::text = 'true'::jsonb`;
    case 'nein': return sql`coalesce(mappen.werte -> ${k}::text, 'false'::jsonb) <> 'true'::jsonb`;
    case 'enthaelt': {
      const muster = `%${String(f.a ?? '').replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      return sql`${x} ILIKE ${muster}`;
    }
    case 'einerVon': {
      const l = liste(f.a);
      return sql`(mappen.werte ->> ${k}::text = ANY(${l}::text[]) OR (jsonb_typeof(mappen.werte -> ${k}::text) = 'array' AND mappen.werte -> ${k}::text ?| ${l}::text[]))`;
    }
    case 'zeigtAuf': {
      const l = liste(f.a);
      if (f.feldart === 'person') return sql`${x} = ANY(${l}::text[])`;
      return sql`EXISTS (SELECT 1 FROM verweise v WHERE v.quelle_id = mappen.id AND v.feld_key = ${k} AND v.ziel_id::text = ANY(${l}::text[]))`;
    }
    case 'gleich': return f.feldart === 'text' ? sql`lower(${x}) = lower(${String(f.a ?? '')})` : sql`${x} = ${wert(f.a)}`;
    case 'kleiner': return sql`${x} < ${wert(f.a)}`;
    case 'groesser': return sql`${x} > ${wert(f.a)}`;
    case 'zwischen': return sql`${x} BETWEEN ${wert(f.a)} AND ${wert(f.b)}`;
    case 'ausserhalb': return sql`(${x} < ${wert(f.a)} OR ${x} > ${wert(f.b)})`;
  }
  return sql`false`;
}

function zaehlBedingung(sql: Sql, anzahl: Teil, vergleich: string, n: number): Teil {
  return vergleich === 'mehr' ? sql`(${anzahl}) > ${n}` : vergleich === 'weniger' ? sql`(${anzahl}) < ${n}` : sql`(${anzahl}) = ${n}`;
}

function filterSql(sql: Sql, f: Filter): Teil {
  if (f.art === 'feld') return feldBedingung(sql, f);
  if (f.art === 'dokumente') {
    return zaehlBedingung(sql, sql`SELECT count(*) FROM dokumente d WHERE d.mappe_id = mappen.id AND d.register_key = ${f.register}`, f.vergleich, f.anzahl);
  }
  // Verknüpfungen wie im Register: alle Rückverweise oder nur die gewählten Quellen (Typ + Feld).
  const quellen = f.quellen.length
    ? sql`AND EXISTS (SELECT 1 FROM unnest(${f.quellen.map((x) => x.typId)}::text[], ${f.quellen.map((x) => x.feldKey)}::text[]) AS w(t, f) WHERE w.t = q.typ_id::text AND w.f = v.feld_key)`
    : sql``;
  return zaehlBedingung(sql, sql`SELECT count(DISTINCT v.quelle_id) FROM verweise v JOIN mappen q ON q.id = v.quelle_id WHERE v.ziel_id = mappen.id AND v.quelle_id <> mappen.id ${quellen}`, f.vergleich, f.anzahl);
}

/** ODER der Klauseln; jede Klausel: Typ passt UND alle Filter. Ohne Klauseln: nichts. */
export function klauselnSql(sql: Sql, klauseln: Klausel[]): Teil {
  const teile = klauseln.filter((k) => k.typen.some(istUuid)).map((k) => {
    const typen = k.typen.filter(istUuid);
    const und = k.filter.reduce<Teil>((acc, f) => sql`${acc} AND ${filterSql(sql, f)}`, sql`mappen.typ_id = ANY(${typen}::uuid[])`);
    return sql`(${und})`;
  });
  if (!teile.length) return sql`false`;
  return teile.slice(1).reduce<Teil>((acc, t) => sql`${acc} OR ${t}`, teile[0]);
}

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
    async legeTypAn(id, d: MappentypDaten, system) {
      const [r] = await sql`
        INSERT INTO mappentypen (id, haushalt_id, name, beschreibung, titel_vorlage, felder, register, trefferliste, erstellen_erlaubt, loeschen_erlaubt, system)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${d.beschreibung}, ${d.titelVorlage}, ${json(sql, d.felder)}, ${json(sql, d.register)}, ${json(sql, d.trefferliste ?? [])},
          ${d.erstellenErlaubt !== false}, ${d.loeschenErlaubt !== false}, ${system ?? null})
        RETURNING *`;
      return alsTyp(r);
    },
    async aendereTyp(id, d) {
      return sql.begin(async (tx) => {
        const [r] = await tx`
          UPDATE mappentypen SET name = ${d.name}, beschreibung = ${d.beschreibung}, titel_vorlage = ${d.titelVorlage},
            felder = ${json(sql, d.felder)}, register = ${json(sql, d.register)}, trefferliste = ${json(sql, d.trefferliste ?? [])},
            erstellen_erlaubt = ${d.erstellenErlaubt !== false}, loeschen_erlaubt = ${d.loeschenErlaubt !== false}, geaendert = now()
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
    async legeMappeAn(id, typId, werte, vs, benutzerId, demo = false, systemKennung = null) {
      return sql.begin(async (tx) => {
        const [r] = await tx`
          INSERT INTO mappen (id, haushalt_id, typ_id, werte, erstellt_von, geaendert_von, demo, system_kennung)
          VALUES (${id}, ${haushaltId}, ${typId}, ${json(sql, werte)}, ${benutzerId}, ${benutzerId}, ${demo}, ${systemKennung})
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
    async beruehreMappe(id, benutzerId) {
      await sql`UPDATE mappen SET geaendert = now(), geaendert_von = ${benutzerId} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async holeSystemMappe(kennung) {
      const [r] = await sql`SELECT * FROM mappen WHERE haushalt_id = ${haushaltId} AND system_kennung = ${kennung}`;
      return r ? alsMappe(r) : undefined;
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
      const typ = o.klauseln ? sql`AND (${klauselnSql(sql, o.klauseln)})`
        : o.typId && istUuid(o.typId) ? sql`AND typ_id = ${o.typId}` : o.typId ? sql`AND false` : sql``;
      const eingang = o.eingang
        ? sql`AND EXISTS (SELECT 1 FROM aufgaben a WHERE a.mappe_id = mappen.id AND a.erledigt IS NULL
            AND (a.empfaenger_id = ${istUuid(o.eingang.benutzerId) ? o.eingang.benutzerId : null}::uuid ${o.eingang.admin ? sql`OR a.empfaenger_id IS NULL` : sql``}))`
        : sql``;
      const muster = o.suche ? `%${o.suche.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
      const suche = muster
        ? sql`AND (titel ILIKE ${muster} OR EXISTS (SELECT 1 FROM jsonb_each_text(werte) e WHERE e.value ILIKE ${muster} AND e.value NOT LIKE 'dms1$%')
            ${o.notizen ? sql`OR EXISTS (SELECT 1 FROM notizen n WHERE n.mappe_id = mappen.id AND n.text ILIKE ${muster})` : sql``}
            ${o.volltext ? sql`OR EXISTS (SELECT 1 FROM dokumente d WHERE d.mappe_id = mappen.id
              AND to_tsvector('german', coalesce(d.volltext, '')) @@ websearch_to_tsquery('german', ${o.suche!}::text))` : sql``})`
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
      const mappen = r.map(alsMappe);
      if ((!o.volltext && !o.notizen) || !o.suche || !mappen.length) return { gesamt: n as number, mappen };
      const ausschnitte: Record<string, Ausschnitt> = {};
      if (o.notizen) {
        const nz = await sql`SELECT mappe_id, text FROM notizen WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${mappen.map((m) => m.id)}::uuid[]) AND text ILIKE ${muster} ORDER BY erstellt`;
        for (const z of nz) {
          const t = ausschnittAus(alsText(z.text as string), o.suche);
          if (t && !ausschnitte[z.mappe_id as string]) ausschnitte[z.mappe_id as string] = { dokument: 'Notiz', text: t };
        }
      }
      if (!o.volltext) return { gesamt: n as number, mappen, ausschnitte };
      // Fundstellen im Volltext: je Mappe das Dokument mit dem besten Treffer.
      const a = await sql`
        SELECT DISTINCT ON (d.mappe_id) d.mappe_id, d.name, ts_headline('german', d.volltext, q, ${AUSSCHNITT}::text) AS text
        FROM dokumente d, websearch_to_tsquery('german', ${o.suche}::text) q
        WHERE d.haushalt_id = ${haushaltId} AND d.mappe_id = ANY(${mappen.map((m) => m.id)}::uuid[])
          AND to_tsvector('german', coalesce(d.volltext, '')) @@ q
        ORDER BY d.mappe_id, ts_rank(to_tsvector('german', coalesce(d.volltext, '')), q) DESC`;
      for (const z of a) ausschnitte[z.mappe_id as string] ??= { dokument: z.name as string, text: z.text as string };
      return { gesamt: n as number, mappen, ausschnitte };
    },
    async zaehler(benutzerId, admin) {
      const r = await sql`
        SELECT typ_id, count(*)::int AS anzahl,
          count(*) FILTER (WHERE passt IS NOT TRUE)::int AS unpassend,
          count(*) FILTER (WHERE demo)::int AS demo,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM aufgaben a WHERE a.mappe_id = mappen.id AND a.erledigt IS NULL
            AND (a.empfaenger_id = ${istUuid(benutzerId) ? benutzerId : null}::uuid OR (${admin} AND a.empfaenger_id IS NULL))))::int AS eingang
        FROM mappen WHERE haushalt_id = ${haushaltId} GROUP BY typ_id`;
      return {
        typen: new Map(r.map((z) => [z.typ_id as string, { anzahl: z.anzahl as number, unpassend: z.unpassend as number, demo: z.demo as number }])),
        eingang: r.reduce((a, z) => a + (z.eingang as number), 0),
      };
    },
    async zaehleKlauseln(liste) {
      if (!liste.length) return [];
      const spalten = liste.map((k, i) => sql`count(*) FILTER (WHERE ${klauselnSql(sql, k)})::int AS ${sql(`s${i}`)}`);
      const sel = spalten.slice(1).reduce((acc, t) => sql`${acc}, ${t}`, spalten[0]);
      const [r] = await sql`SELECT ${sel} FROM mappen WHERE haushalt_id = ${haushaltId}`;
      return liste.map((_, i) => r[`s${i}`] as number);
    },

    async listeSichten() {
      return (await sql`SELECT * FROM sichten WHERE haushalt_id = ${haushaltId} ORDER BY position, lower(name)`).map(alsSicht);
    },
    async legeSichtAn(id, d: SichtDaten) {
      const [r] = await sql`
        INSERT INTO sichten (id, haushalt_id, name, beschreibung, eltern_id, position, typen, bedingungen)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${d.beschreibung}, ${d.elternId}, ${d.position}, ${json(sql, d.typen)}, ${json(sql, d.bedingungen)})
        RETURNING *`;
      return alsSicht(r);
    },
    async aendereSicht(id, d: SichtDaten) {
      const [r] = await sql`
        UPDATE sichten SET name = ${d.name}, beschreibung = ${d.beschreibung}, eltern_id = ${d.elternId}, position = ${d.position},
          typen = ${json(sql, d.typen)}, bedingungen = ${json(sql, d.bedingungen)}, geaendert = now()
        WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
      return alsSicht(r);
    },
    async loescheSicht(id) {
      await sql`DELETE FROM sichten WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
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
    /* ---------- Papierkorb (#43) ---------- */
    async legeInPapierkorb(id, benutzerId) {
      await sql.begin(async (tx) => {
        const r = await tx`
          INSERT INTO papierkorb (id, haushalt_id, typ_id, mappe, verweise, dokumente, geloescht_von, notizen, aufgaben)
          SELECT m.id, m.haushalt_id, m.typ_id, to_jsonb(m),
            (SELECT coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) FROM verweise v WHERE v.quelle_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM dokumente d WHERE d.mappe_id = m.id),
            ${istUuid(benutzerId) ? benutzerId : null}::uuid,
            (SELECT coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM notizen n WHERE n.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM aufgaben a WHERE a.mappe_id = m.id)
          FROM mappen m WHERE m.haushalt_id = ${haushaltId} AND m.id = ${id}`;
        // Ausgehende Verweise und Dokumente folgen per Kaskade.
        if (r.count) await tx`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      });
    },
    async papierkorb(f = {}) {
      return (await sql`
        SELECT id, typ_id, mappe, geloescht, geloescht_von, jsonb_array_length(dokumente) AS anzahl_dokumente
        FROM papierkorb WHERE haushalt_id = ${haushaltId}
          ${f.von ? sql`AND geloescht_von = ${istUuid(f.von) ? f.von : null}::uuid` : sql``}
          ${f.vor ? sql`AND geloescht < ${f.vor}` : sql``}
          ${f.typId ? sql`AND typ_id = ${istUuid(f.typId) ? f.typId : null}::uuid` : sql``}
        ORDER BY geloescht DESC, id`).map(alsPapierkorb);
    },
    async holeAusPapierkorb(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`
        SELECT id, typ_id, mappe, geloescht, geloescht_von, jsonb_array_length(dokumente) AS anzahl_dokumente
        FROM papierkorb WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsPapierkorb(r) : undefined;
    },
    async stelleWiederHer(id) {
      return sql.begin(async (tx) => {
        const [p] = await tx`SELECT verweise FROM papierkorb WHERE haushalt_id = ${haushaltId} AND id = ${id} FOR UPDATE`;
        if (!p) return { verweiseEntfallen: 0 };
        // Benutzer, die es nicht mehr gibt, werden zu „unbekannt“ (wie ON DELETE SET NULL).
        await tx`
          INSERT INTO mappen
          SELECT (jsonb_populate_record(NULL::mappen, p.mappe || jsonb_build_object(
            'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = p.mappe ->> 'erstellt_von') THEN p.mappe -> 'erstellt_von' ELSE 'null'::jsonb END,
            'geaendert_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = p.mappe ->> 'geaendert_von') THEN p.mappe -> 'geaendert_von' ELSE 'null'::jsonb END))).*
          FROM papierkorb p WHERE p.id = ${id}`;
        // Verweise nur auf Mappen, die es noch gibt; die übrigen bleiben als Wert stehen
        // und lassen die Mappe „nicht passen“ (Eingang).
        const v = await tx`
          INSERT INTO verweise
          SELECT r.* FROM papierkorb p, jsonb_populate_recordset(NULL::verweise, p.verweise) r
          WHERE p.id = ${id} AND EXISTS (SELECT 1 FROM mappen z WHERE z.id = r.ziel_id)
          ON CONFLICT DO NOTHING`;
        await tx`
          INSERT INTO dokumente
          SELECT (jsonb_populate_record(NULL::dokumente, d.value || jsonb_build_object(
            'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = d.value ->> 'erstellt_von') THEN d.value -> 'erstellt_von' ELSE 'null'::jsonb END))).*
          FROM papierkorb p, jsonb_array_elements(p.dokumente) d WHERE p.id = ${id}`;
        await tx`
          INSERT INTO notizen
          SELECT (jsonb_populate_record(NULL::notizen, n.value || jsonb_build_object(
            'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = n.value ->> 'erstellt_von') THEN n.value -> 'erstellt_von' ELSE 'null'::jsonb END,
            'geaendert_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = n.value ->> 'geaendert_von') THEN n.value -> 'geaendert_von' ELSE 'null'::jsonb END))).*
          FROM papierkorb p, jsonb_array_elements(p.notizen) n WHERE p.id = ${id}`;
        // Aufgaben: Empfänger und Beteiligte nur, wenn es sie noch gibt.
        await tx`
          INSERT INTO aufgaben
          SELECT (jsonb_populate_record(NULL::aufgaben, x.value || jsonb_build_object(
            'empfaenger_id', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'empfaenger_id') THEN x.value -> 'empfaenger_id' ELSE 'null'::jsonb END,
            'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'erstellt_von') THEN x.value -> 'erstellt_von' ELSE 'null'::jsonb END,
            'erledigt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'erledigt_von') THEN x.value -> 'erledigt_von' ELSE 'null'::jsonb END))).*
          FROM papierkorb p, jsonb_array_elements(p.aufgaben) x WHERE p.id = ${id}`;
        await tx`DELETE FROM papierkorb WHERE id = ${id}`;
        return { verweiseEntfallen: (p.verweise as unknown[]).length - v.count };
      });
    },
    async leerePapierkorb(ids) {
      const gueltig = ids.filter(istUuid);
      if (!gueltig.length) return [];
      const r = await sql`DELETE FROM papierkorb WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) RETURNING dokumente`;
      return [...new Set<string>(r.flatMap((z: Zeile) => (z.dokumente as Zeile[]).map((d) => d.sha256 as string)))];
    },
    async zaehlePapierkorb(von) {
      const [r] = await sql`SELECT count(*)::int AS n FROM papierkorb WHERE haushalt_id = ${haushaltId}
        ${von ? sql`AND geloescht_von = ${istUuid(von) ? von : null}::uuid` : sql``}`;
      return r.n as number;
    },
    async dateiBenutzt(sha256) {
      const [r] = await sql`
        SELECT EXISTS (SELECT 1 FROM dokumente WHERE haushalt_id = ${haushaltId} AND sha256 = ${sha256})
          OR EXISTS (SELECT 1 FROM papierkorb p, jsonb_array_elements(p.dokumente) d WHERE p.haushalt_id = ${haushaltId} AND d.value ->> 'sha256' = ${sha256}) AS ja`;
      return r.ja as boolean;
    },

    /* ---------- Texterkennung (#45) ---------- */
    async ocrEinreihen(ids) {
      const gueltig = ids.filter(istUuid);
      if (!gueltig.length) return;
      await sql`UPDATE dokumente SET ocr_stand = 'wartet', ocr_info = NULL WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[])`;
    },
    async ocrNaechster() {
      // SKIP LOCKED: mehrere Aufträge nehmen sich nie dasselbe Dokument.
      const [r] = await sql`
        UPDATE dokumente SET ocr_stand = 'laeuft', ocr_zeit = now()
        WHERE id = (SELECT id FROM dokumente WHERE haushalt_id = ${haushaltId} AND ocr_stand = 'wartet' ORDER BY erstellt, id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`;
      return r ? alsDokument(r) : undefined;
    },
    async ocrSetze(id, e) {
      await sql`
        UPDATE dokumente SET ocr_stand = ${e.stand}, ocr_info = ${e.info ?? null}, ocr_seiten = ${e.seiten ?? null}, ocr_zeit = now()
          ${e.text !== undefined ? sql`, volltext = ${e.text}` : sql``}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async ocrVonSha(sha256, ausser) {
      const [r] = await sql`
        SELECT volltext, ocr_seiten, ocr_info FROM dokumente
        WHERE haushalt_id = ${haushaltId} AND sha256 = ${sha256} AND id IS DISTINCT FROM ${istUuid(ausser) ? ausser : null}::uuid AND ocr_stand = 'fertig' AND volltext IS NOT NULL
        LIMIT 1`;
      return r ? { text: r.volltext as string, seiten: (r.ocr_seiten as number | null) ?? null, info: (r.ocr_info as string | null) ?? null } : undefined;
    },
    async ocrZurueckstellen() {
      const r = await sql`UPDATE dokumente SET ocr_stand = 'wartet' WHERE haushalt_id = ${haushaltId} AND ocr_stand = 'laeuft'`;
      return r.count;
    },
    async ocrZaehler() {
      const z = { keiner: 0, wartet: 0, laeuft: 0, fertig: 0, fehler: 0, ausgelassen: 0 };
      for (const r of await sql`SELECT coalesce(ocr_stand, 'keiner') AS s, count(*)::int AS n FROM dokumente WHERE haushalt_id = ${haushaltId} GROUP BY 1`) {
        z[r.s as OcrStandArt] = r.n as number;
      }
      return z;
    },
    async ocrOhneVolltext() {
      return (await sql`
        SELECT d.id, m.typ_id, d.register_key FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
        WHERE d.haushalt_id = ${haushaltId} AND coalesce(d.ocr_stand, 'keiner') = 'keiner'`)
        .map((r: Zeile) => ({ id: r.id as string, typId: r.typ_id as string, registerKey: r.register_key as string }));
    },
    async volltext(id) {
      if (!istUuid(id)) return null;
      const [r] = await sql`SELECT volltext FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? ((r.volltext as string | null) ?? null) : null;
    },

    /* ---------- Aufgaben (#54) ---------- */
    async aufgabenZurPassung(liste) {
      const offen = liste.filter((x) => x.problem && istUuid(x.id));
      const fertig = liste.filter((x) => !x.problem && istUuid(x.id)).map((x) => x.id);
      if (offen.length) {
        const ids = offen.map((x) => x.id);
        const texte = offen.map((x) => `Passt nicht zur Definition: ${x.problem}`);
        await sql`
          UPDATE aufgaben a SET text = n.text FROM unnest(${ids}::uuid[], ${texte}::text[]) AS n(mappe_id, text)
          WHERE a.mappe_id = n.mappe_id AND a.art = 'passung' AND a.erledigt IS NULL AND a.text <> n.text`;
        await sql`
          INSERT INTO aufgaben (id, haushalt_id, mappe_id, empfaenger_id, art, text)
          SELECT gen_random_uuid(), ${haushaltId}, n.mappe_id, m.erstellt_von, 'passung', n.text
          FROM unnest(${ids}::uuid[], ${texte}::text[]) AS n(mappe_id, text) JOIN mappen m ON m.id = n.mappe_id
          WHERE NOT EXISTS (SELECT 1 FROM aufgaben a WHERE a.mappe_id = n.mappe_id AND a.art = 'passung' AND a.erledigt IS NULL)`;
      }
      if (fertig.length) {
        await sql`UPDATE aufgaben SET erledigt = now() WHERE mappe_id = ANY(${fertig}::uuid[]) AND art = 'passung' AND erledigt IS NULL`;
      }
    },
    async legeAufgabeAn(a) {
      const [r] = await sql`
        INSERT INTO aufgaben (id, haushalt_id, mappe_id, empfaenger_id, art, text, feld_key, erstellt_von)
        VALUES (${a.id}, ${haushaltId}, ${a.mappeId}, ${istUuid(a.empfaengerId) ? a.empfaengerId : null}::uuid, ${a.art}, ${a.text}, ${a.feldKey ?? null},
          ${istUuid(a.erstelltVon) ? a.erstelltVon : null}::uuid)
        RETURNING *`;
      return alsAufgabe(r);
    },
    async holeAufgabe(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM aufgaben WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsAufgabe(r) : undefined;
    },
    async aufgabenVon(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT * FROM aufgaben WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY erledigt IS NOT NULL, erstellt DESC, id`).map(alsAufgabe);
    },
    async offeneAufgaben(f = {}) {
      const wer = f.benutzerId
        ? sql`AND (a.empfaenger_id = ${istUuid(f.benutzerId) ? f.benutzerId : null}::uuid ${f.admin ? sql`OR a.empfaenger_id IS NULL` : sql``})`
        : sql``;
      const welche = f.mappeIds ? sql`AND a.mappe_id = ANY(${f.mappeIds.filter(istUuid)}::uuid[])` : sql``;
      return (await sql`
        SELECT a.*, m.titel AS mappe_titel, m.typ_id FROM aufgaben a JOIN mappen m ON m.id = a.mappe_id
        WHERE a.haushalt_id = ${haushaltId} AND a.erledigt IS NULL ${wer} ${welche}
        ORDER BY a.erstellt, a.id`).map(alsAufgabe);
    },
    async erledigteAufgaben(max) {
      return (await sql`
        SELECT a.*, m.titel AS mappe_titel, m.typ_id FROM aufgaben a JOIN mappen m ON m.id = a.mappe_id
        WHERE a.haushalt_id = ${haushaltId} AND a.erledigt IS NOT NULL ORDER BY a.erledigt DESC, a.id LIMIT ${max}`).map(alsAufgabe);
    },
    async erledigeAufgabe(id, von) {
      await sql`UPDATE aufgaben SET erledigt = now(), erledigt_von = ${istUuid(von) ? von : null}::uuid WHERE haushalt_id = ${haushaltId} AND id = ${id} AND erledigt IS NULL`;
    },
    async delegiereAufgabe(id, an) {
      await sql`UPDATE aufgaben SET empfaenger_id = ${istUuid(an) ? an : null}::uuid WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },

    /* ---------- Notizen (#55) ---------- */
    async notizen(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT * FROM notizen WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY erstellt, id`).map(alsNotiz);
    },
    async holeNotiz(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM notizen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsNotiz(r) : undefined;
    },
    async legeNotizAn(n) {
      const [r] = await sql`
        INSERT INTO notizen (id, haushalt_id, mappe_id, text, erstellt_von, geaendert_von)
        VALUES (${n.id}, ${haushaltId}, ${n.mappeId}, ${n.text}, ${istUuid(n.erstelltVon) ? n.erstelltVon : null}::uuid, ${istUuid(n.erstelltVon) ? n.erstelltVon : null}::uuid)
        RETURNING *`;
      return alsNotiz(r);
    },
    async aendereNotiz(id, text, von) {
      const [r] = await sql`UPDATE notizen SET text = ${text}, geaendert = now(), geaendert_von = ${istUuid(von) ? von : null}::uuid
        WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
      return alsNotiz(r);
    },
    async loescheNotiz(id) { await sql`DELETE FROM notizen WHERE haushalt_id = ${haushaltId} AND id = ${id}`; },

    /* ---------- Änderungshistorie (#57) ---------- */
    async historieSchreibe(e) {
      if (!e.length) return;
      await sql`INSERT INTO historie ${sql(e.map((x) => ({
        haushalt_id: haushaltId, mappe_id: x.mappeId, benutzer_id: istUuid(x.benutzerId) ? x.benutzerId : null, art: x.art, daten: json(sql, x.daten ?? {}),
      })), 'haushalt_id', 'mappe_id', 'benutzer_id', 'art', 'daten')}`;
    },
    async historie(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY zeit DESC, id DESC`).map((r: Zeile) => ({
        id: Number(r.id), mappeId: r.mappe_id as string, zeit: iso(r.zeit), benutzerId: (r.benutzer_id as string | null) ?? null,
        art: r.art as Historienart, daten: (r.daten as Historieneintrag['daten']) ?? {},
      }));
    },
    async historieAufraeumen(vor) {
      const r = await sql`
        DELETE FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id IN (
          SELECT mappe_id FROM historie WHERE haushalt_id = ${haushaltId} AND art = 'endgueltig' AND zeit < ${vor})
          AND NOT EXISTS (SELECT 1 FROM mappen m WHERE m.id = historie.mappe_id)
          AND NOT EXISTS (SELECT 1 FROM papierkorb p WHERE p.id = historie.mappe_id)`;
      return r.count;
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
        // Demo-Mappen im Papierkorb gehen gleich mit (#43).
        const korb = await tx`DELETE FROM papierkorb WHERE haushalt_id = ${haushaltId} AND (mappe ->> 'demo')::boolean RETURNING dokumente`;
        for (const z of korb) for (const d of z.dokumente as Zeile[]) dateien.push(d.sha256 as string);
        return { anzahl: r.count + korb.count, dateien: [...new Set(dateien)] };
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
