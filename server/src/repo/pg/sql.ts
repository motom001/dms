/** SQL-Bausteine des PostgreSQL-Repos: Suchanfrage, Bedingungen einer Sicht (#38, #40, #41), Lesefilter (#124). */
import type postgres from 'postgres';
import { TAGE_JE_EINHEIT } from '../../../../shared/src/feldarten';
import { type Quelle, TREFFER_ANFANG, TREFFER_ENDE } from '../../../../shared/src/model';
import type { Ausdruck, Lesefilter } from '../../../../shared/src/rechte';
import { zeitzone } from '../../../../shared/src/region';
import { type Filter, istZahlvergleich, type Klausel } from '../../../../shared/src/sichten';
import { falte, suchbegriffe, type Varianten } from '../../../../shared/src/suche';
import { istUuid } from '..';

export type Sql = postgres.Sql;

export type SqlTeil = postgres.PendingQuery<postgres.Row[]> | postgres.Fragment;
/**
 * Suchanfrage für den Volltext: Bei einer einfachen Suche je Begriff seine Varianten (ODER), die Begriffe mit UND;
 * mit Suchsyntax (Anführungszeichen, Minus, „or“) genau wie eingegeben.
 */
export function suchanfrage(sql: Sql, t: string, v: Varianten, konfigs: string[] = ['dms_german']): SqlTeil {
  // Je Sprache der Ablage (#400) die Anfrage mit deren Wortstämmen; ein Dokument passt, wenn eine davon passt.
  return konfigs
    .map((konfig) => {
      const eins = (x: string) => sql`websearch_to_tsquery(${konfig}::regconfig, dms_falte(${x}::text))`;
      const b = suchbegriffe(t);
      if (!b) return eins(t);
      return b
        .map((w) => [w, ...(v[falte(w)] ?? [])].map(eins).reduce((x, y) => sql`(${x} || ${y})`))
        .reduce((x, y) => sql`(${x} && ${y})`);
    })
    .reduce((x, y) => sql`(${x} || ${y})`);
}
/** Ausschnitte aus dem Volltext: höchstens zwei Stellen, Treffer markiert (#45). */
export const AUSSCHNITT = `StartSel=${TREFFER_ANFANG}, StopSel=${TREFFER_ENDE}, MaxFragments=2, MaxWords=18, MinWords=6, FragmentDelimiter=" … "`;

// postgres.js erwartet für jsonb einen JSON-Wert; unsere Typen sind JSON-kompatibel.
export const json = (sql: Sql, v: unknown) => sql.json(v as postgres.JSONValue);
/** Eine Zeile der Tabelle fassungen (#1006). */

/* ---------- Bedingungen einer Sicht als SQL (#38, #40, #41) ---------- */

export type Teil = postgres.PendingQuery<postgres.Row[]> | postgres.Fragment;

/**
 * Länge eines Zeitraums in Tagen (#1035) wie `zeitraumTage` in shared/src/feldarten.ts: Monat 30,4375, Jahr 365,25
 * Tage. Ohne Zahl oder mit unbekannter Einheit NULL.
 */
export function zeitraumTageSql(sql: Sql, werte: Teil, k: string) {
  const t = TAGE_JE_EINHEIT;
  return sql`(CASE WHEN jsonb_typeof(${werte} -> ${k}::text -> 'anzahl') = 'number' THEN (${werte} -> ${k}::text ->> 'anzahl')::numeric * (CASE ${werte} -> ${k}::text ->> 'einheit' WHEN 'tage' THEN ${t.tage}::numeric WHEN 'wochen' THEN ${t.wochen}::numeric WHEN 'monate' THEN ${t.monate}::numeric WHEN 'jahre' THEN ${t.jahre}::numeric END) END)`;
}

/** Wert eines Feldes als vergleichbarer SQL-Ausdruck; ungültige Werte werden NULL. */
function ausdruck(sql: Sql, f: Extract<Filter, { art: 'feld' }>) {
  const k = f.key;
  switch (f.key) {
    case '_erstellt':
      return sql`(mappen.erstellt AT TIME ZONE ${zeitzone()})::date`;
    case '_geaendert':
      return sql`(mappen.geaendert AT TIME ZONE ${zeitzone()})::date`;
    case '_erstelltVon':
      return sql`mappen.erstellt_von::text`;
    case '_geaendertVon':
      return sql`mappen.geaendert_von::text`;
  }
  switch (f.feldart) {
    case 'zahl':
      return sql`(CASE WHEN jsonb_typeof(mappen.werte -> ${k}::text) = 'number' THEN (mappen.werte ->> ${k}::text)::numeric END)`;
    case 'betrag':
      return sql`(CASE WHEN jsonb_typeof(mappen.werte -> ${k}::text -> 'betrag') = 'number' THEN (mappen.werte -> ${k}::text ->> 'betrag')::numeric END)`;
    case 'prozent':
      return sql`(CASE WHEN jsonb_typeof(mappen.werte -> ${k}::text) = 'number' THEN (mappen.werte ->> ${k}::text)::numeric END)`;
    case 'zeitraum':
      return zeitraumTageSql(sql, sql`mappen.werte`, k);
    case 'datum':
      return sql`(CASE WHEN mappen.werte ->> ${k}::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (mappen.werte ->> ${k}::text)::date END)`;
    default:
      return sql`nullif(mappen.werte ->> ${k}::text, '')`;
  }
}

function feldBedingung(sql: Sql, f: Extract<Filter, { art: 'feld' }>): Teil {
  const k = f.key;
  const x = ausdruck(sql, f);
  const zahl = istZahlvergleich(f.feldart);
  const datum = f.feldart === 'datum' || f.feldart === 'zeit';
  const wert = (v: unknown) => (zahl ? sql`${Number(v)}::numeric` : datum ? sql`${String(v)}::date` : sql`${String(v ?? '')}`);
  const liste = (v: unknown) => (Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]);
  // Leer: auch leere Listen und Beträge ohne Zahl.
  const leer = f.key.startsWith('_')
    ? sql`${x} IS NULL`
    : f.feldart === 'referenz'
      ? sql`NOT EXISTS (SELECT 1 FROM verweise v WHERE v.quelle_id = mappen.id AND v.feld_key = ${k})`
      : zahl || datum
        ? sql`${x} IS NULL`
        : sql`(mappen.werte -> ${k}::text IS NULL OR mappen.werte -> ${k}::text IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb))`;
  switch (f.op) {
    case 'leer':
      return leer;
    case 'nichtLeer':
      return sql`NOT (${leer})`;
    case 'ja':
      return sql`mappen.werte -> ${k}::text = 'true'::jsonb`;
    case 'nein':
      return sql`coalesce(mappen.werte -> ${k}::text, 'false'::jsonb) <> 'true'::jsonb`;
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
      // Von den Zielen aus (#1265): Der Index auf verweise.ziel_id liefert die wenigen Quellen; so muss PostgreSQL nicht je
      // Mappe des Typs nachsehen (Tabellenfeld unter Last: im Mittel 599 ms). Gleiche Treffer wie vorher (ziel_id::text
      // = Id): Nur Ids in der Schreibweise von PostgreSQL (klein) können passen, alle anderen nie.
      const ziele = l.filter((id) => istUuid(id) && id === id.toLowerCase());
      if (!ziele.length) return sql`false`;
      return sql`mappen.id IN (SELECT v.quelle_id FROM verweise v WHERE v.ziel_id = ANY(${ziele}::uuid[]) AND v.feld_key = ${k})`;
    }
    case 'gleich':
      return f.feldart === 'text' || f.feldart === 'zusammengesetzt'
        ? sql`lower(${x}) = lower(${String(f.a ?? '')})`
        : sql`${x} = ${wert(f.a)}`;
    case 'kleiner':
      return sql`${x} < ${wert(f.a)}`;
    case 'groesser':
      return sql`${x} > ${wert(f.a)}`;
    case 'zwischen':
      return sql`${x} BETWEEN ${wert(f.a)} AND ${wert(f.b)}`;
    case 'ausserhalb':
      return sql`(${x} < ${wert(f.a)} OR ${x} > ${wert(f.b)})`;
  }
  return sql`false`;
}

function zaehlBedingung(sql: Sql, anzahl: Teil, vergleich: string, n: number): Teil {
  return vergleich === 'mehr' ? sql`(${anzahl}) > ${n}` : vergleich === 'weniger' ? sql`(${anzahl}) < ${n}` : sql`(${anzahl}) = ${n}`;
}

function filterSql(sql: Sql, f: Filter): Teil {
  if (f.art === 'feld') return feldBedingung(sql, f);
  if (f.art === 'aufgabe') {
    return sql`EXISTS (SELECT 1 FROM aufgaben auf WHERE auf.mappe_id = mappen.id AND auf.erledigt IS NULL AND auf.empfaenger_id = ${istUuid(f.benutzer) ? f.benutzer : null}::uuid)`;
  }
  if (f.art === 'id') return sql`mappen.id = ANY(${f.ids.filter(istUuid)}::uuid[])`;
  if (f.art === 'zieltyp') {
    // „zeigt auf Mappe vom Typ …“ (#1036) über die Verweise; `ausser`: auf eine Mappe, deren Typ keiner davon ist.
    const typ = f.ausser ? sql`zm.typ_id::text <> ALL(${f.typen}::text[])` : sql`zm.typ_id::text = ANY(${f.typen}::text[])`;
    return sql`EXISTS (SELECT 1 FROM verweise v JOIN mappen zm ON zm.id = v.ziel_id WHERE v.quelle_id = mappen.id AND v.feld_key = ${f.key} AND ${typ})`;
  }
  if (f.art === 'frist') {
    // Eines der Datumsfelder in [von, bis]; mit ich nur Fristen dieses Empfängers (Benutzerfeld, sonst Ersteller).
    const teile = f.felder.map((x) => {
      const d = sql`(CASE WHEN mappen.werte ->> ${x.key}::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (mappen.werte ->> ${x.key}::text)::date END)`;
      const wer = !f.ich
        ? sql``
        : x.empfaengerFeld
          ? sql`AND coalesce(nullif(mappen.werte ->> ${x.empfaengerFeld}::text, ''), mappen.erstellt_von::text) = ${f.ich}`
          : sql`AND mappen.erstellt_von::text = ${f.ich}`;
      return sql`(${d} BETWEEN ${f.von}::date AND ${f.bis}::date ${wer})`;
    });
    return teile.length ? sql`(${teile.reduce((a, b) => sql`${a} OR ${b}`)})` : sql`false`;
  }
  if (f.art === 'favorit') {
    return sql`EXISTS (SELECT 1 FROM favoriten fav WHERE fav.mappe_id = mappen.id AND fav.benutzer_id = ${istUuid(f.benutzer) ? f.benutzer : null}::uuid)`;
  }
  if (f.art === 'dokumente') {
    // register null = alle Dokumente der Mappe (#67).
    const reg = f.register === null ? sql`` : sql`AND d.register_key = ${f.register}`;
    return zaehlBedingung(sql, sql`SELECT count(*) FROM dokumente d WHERE d.mappe_id = mappen.id ${reg}`, f.vergleich, f.anzahl);
  }
  // Verknüpfungen wie im Register: alle Rückverweise oder nur die gewählten Quellen (Typ + Feld).
  const zaehle = (quellen: Quelle[]) => {
    const q = quellen.length
      ? sql`AND EXISTS (SELECT 1 FROM unnest(${quellen.map((x) => x.typId)}::text[], ${quellen.map((x) => x.feldKey)}::text[]) AS w(t, f) WHERE w.t = q.typ_id::text AND w.f = v.feld_key)`
      : sql``;
    return zaehlBedingung(
      sql,
      sql`SELECT count(DISTINCT v.quelle_id) FROM verweise v JOIN mappen q ON q.id = v.quelle_id WHERE v.ziel_id = mappen.id AND v.quelle_id <> mappen.id ${q}`,
      f.vergleich,
      f.anzahl,
    );
  };
  if (f.quellenJeTyp) {
    // Gemeinsames Register mehrerer Typen (#66): je Typ über die Quellen seines eigenen Registers.
    const teile = Object.entries(f.quellenJeTyp)
      .filter(([t]) => istUuid(t))
      .map(([t, q]) => sql`(mappen.typ_id = ${t}::uuid AND ${zaehle(q)})`);
    return teile.length ? teile.slice(1).reduce<Teil>((acc, x) => sql`${acc} OR ${x}`, teile[0]) : sql`false`;
  }
  return zaehle(f.quellen);
}

/**
 * Typ der Mappe aus einer Liste. Ein einzelner Typ als Gleichheit (#615): Mit `= ANY(…)` nutzt PostgreSQL 16 den
 * Index (haushalt_id, typ_id, lower(titel)) nicht für die Reihenfolge und sortiert jede Seite einer Ansicht über
 * alle ihre Mappen (bei 20 000 Mappen rund 45 ms statt 1 ms).
 */
function typIn(sql: Sql, typen: string[]): Teil {
  return typen.length === 1 ? sql`mappen.typ_id = ${typen[0]}::uuid` : sql`mappen.typ_id = ANY(${typen}::uuid[])`;
}

/**
 * Zahl „Zu erledigen“ (#477, #928): Mappen mit offenen Aufgaben für `ich`, mit `ohneEmpfaenger` auch mit offenen Aufgaben
 * ohne Empfänger. Zwei Zweige statt `empfaenger_id = … OR (… AND empfaenger_id IS NULL)`: Mit dem ODER über einen
 * Parameter nahm der allgemeine Plan der vorbereiteten Abfrage alle offenen Aufgaben und verband sie per Hash mit allen
 * Mappen des Haushalts (50.000 Mappen: 16 ms, wächst mit dem Bestand). Jetzt je Zweig der Index
 * `aufgaben_offen_empfaenger_idx` (Migration 087), der zweite Zweig fällt ohne `ohneEmpfaenger` ganz weg. Die Mappe
 * wird je gefundener Mappe über ihren Schlüssel geprüft (Haushalt) – als Unterabfrage, damit PostgreSQL nicht doch alle
 * Mappen liest. Gezählt wird genau wie vorher: jede Mappe einmal.
 */
export function eingangSql(sql: Sql, haushaltId: string, ich: string | null, ohneEmpfaenger: boolean): Teil {
  return sql`(SELECT count(*)::int FROM (
      SELECT a.mappe_id FROM aufgaben a WHERE a.erledigt IS NULL AND a.empfaenger_id = ${ich}::uuid
      UNION
      SELECT a.mappe_id FROM aufgaben a WHERE ${ohneEmpfaenger}::boolean AND a.erledigt IS NULL AND a.empfaenger_id IS NULL
    ) o WHERE (SELECT m.haushalt_id FROM mappen m WHERE m.id = o.mappe_id) = ${haushaltId}::uuid)`;
}

/**
 * Zählt eine Ansicht nur Favoriten einer Person (#928)? Dann deren Id: Jede Klausel, die überhaupt etwas zählen kann
 * (mit gültigem Typ), verlangt „ist Favorit von“ derselben Person. Sonst null.
 */
export function nurFavoritenVon(klauseln: Klausel[]): string | null {
  const wirksam = klauseln.filter((k) => k.typen.some(istUuid));
  if (!wirksam.length) return null;
  const je = wirksam.map(
    (k) => k.filter.find((f): f is Extract<Filter, { art: 'favorit' }> => f.art === 'favorit' && istUuid(f.benutzer))?.benutzer ?? null,
  );
  return je.every((b) => b && b === je[0]) ? je[0] : null;
}

/** ODER der Klauseln; jede Klausel: Typ passt UND alle Filter. Ohne Klauseln: nichts. */
export function klauselnSql(sql: Sql, klauseln: Klausel[]): Teil {
  const teile = klauseln
    .filter((k) => k.typen.some(istUuid))
    .map((k) => {
      const typen = k.typen.filter(istUuid);
      const und = k.filter.reduce<Teil>((acc, f) => sql`${acc} AND ${filterSql(sql, f)}`, typIn(sql, typen));
      return sql`(${und})`;
    });
  if (!teile.length) return sql`false`;
  return teile.slice(1).reduce<Teil>((acc, t) => sql`${acc} OR ${t}`, teile[0]);
}

/** Ausdruck der Berechtigungen (#123) als SQL über `mappen`. */
export function ausdruckSql(sql: Sql, x: Ausdruck): Teil {
  switch (x.k) {
    case 'wahr':
      return sql`true`;
    case 'falsch':
      return sql`false`;
    // Ein Feld ohne Wert ergibt in SQL NULL, im Arbeitsspeicher „trifft nicht zu“ (rechte.ts, werte). Ohne coalesce
    // machte ein „nicht“ daraus wieder NULL – eine entziehende Regel auf ein leeres Feld (z. B. die mitgenommenen Regeln
    // nach einem Paket-Umbau, #1041) sperrte dann in Listen auch Mappen, die sie gar nicht betrifft.
    case 'filter':
      return sql`coalesce((${filterSql(sql, x.f)}), false)`;
    case 'nicht':
      return sql`NOT (${ausdruckSql(sql, x.a)})`;
    case 'und':
      return x.teile.slice(1).reduce<Teil>((acc, t) => sql`${acc} AND ${ausdruckSql(sql, t)}`, sql`(${ausdruckSql(sql, x.teile[0])})`);
    case 'oder':
      return sql`(${x.teile.slice(1).reduce<Teil>((acc, t) => sql`${acc} OR ${ausdruckSql(sql, t)}`, ausdruckSql(sql, x.teile[0]))})`;
    case 'wenn':
      return sql`(CASE WHEN ${ausdruckSql(sql, x.bed)} THEN ${ausdruckSql(sql, x.dann)} ELSE ${ausdruckSql(sql, x.sonst)} END)`;
  }
}

/** Lesefilter (#124): Mappen offener Typen und je Typ sein Ausdruck; null/undefined = alles. */
export function lesefilterSql(sql: Sql, f: Lesefilter | null | undefined): Teil {
  if (!f) return sql`true`;
  const teile: Teil[] = [];
  const offen = f.offen.filter(istUuid);
  if (offen.length) teile.push(typIn(sql, offen));
  for (const j of f.je) if (istUuid(j.typId)) teile.push(sql`(mappen.typ_id = ${j.typId}::uuid AND ${ausdruckSql(sql, j.ausdruck)})`);
  if (!teile.length) return sql`false`;
  return sql`(${teile.slice(1).reduce<Teil>((acc, t) => sql`${acc} OR ${t}`, teile[0])})`;
}

/**
 * Verbindung einer laufenden Transaktion, die sich wie `sql` benutzen lässt (#404): `begin` wird dort
 * zum Sicherungspunkt, damit die Methoden des Repos unverändert auch in einer Transaktion laufen.
 */
/**
 * Schreiben, ohne auf die Platte zu warten (#615): als Tabelle in FROM setzt das `synchronous_commit = off` nur für
 * die Transaktion dieser einen Anweisung (set_config mit is_local) – ohne eigene Transaktion und ohne weitere
 * Rundreise. Nur für Merkposten, deren Verlust bei einem Absturz (höchstens die letzten Millisekunden) nichts kaputt
 * macht; die Datenbank bleibt dabei in sich stimmig. Unter Last hält so ein Schreiben seine Zeilen nicht mehr bis zum
 * Schreiben auf die Platte gesperrt. In einer laufenden Transaktion: nichts (sonst gälte es für die ganze).
 */
export function ohneWarten(sql: Sql): Teil {
  return 'savepoint' in sql ? sql`(SELECT 1) AS ohne_warten` : sql`(SELECT set_config('synchronous_commit', 'off', true)) AS ohne_warten`;
}
