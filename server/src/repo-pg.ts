import type postgres from 'postgres';
import { teilwoerter } from '../../shared/src/suche';
import { alsText } from '../../shared/src/markdown';
import { SPRACHE_SQL_MUSTER } from '../../shared/src/textsprache';
import { standardliste, TREFFER_ANFANG, TREFFER_ENDE, trefferlistenVon, type Aufgabe, type Ausschnitt, type Dokument, type DokumentVersion, type Herkunft, type Historienart, type Historieneintrag, type Mappe, type Notiz, type Mappentyp, type MappentypDaten, type OcrStandArt, type Werte } from '../../shared/src/model';
import type { Filter, Klausel, Sicht, SichtDaten } from '../../shared/src/sichten';
import type { Ausdruck, Lesefilter } from '../../shared/src/rechte';
import type { Erinnerung } from '../../shared/src/fristen';
import { umschluesseleTief } from './tresor';
import { datumIn, ziehe, type Nummernkreis } from '../../shared/src/nummernkreis';
import type { Quelle } from '../../shared/src/model';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { istUuid, type AuskunftLinkIntern, type DokumentImPapierkorb, type PapierkorbEintrag, type Repo, type Verweis } from './repo';
import { istSha, type LoeschDokument, type LoeschEintrag } from '../../shared/src/loeschprotokoll';

type Sql = postgres.Sql;
type Zeile = Record<string, unknown>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const isoOder = (v: unknown) => (v === null || v === undefined ? null : iso(v));
/** Abruf-Link (#455) aus einer Zeile. */
const alsLink = (r: Record<string, unknown>): AuskunftLinkIntern => ({
  id: r.id as string, auskunftId: r.auskunft_id as string, mappeId: r.mappe_id as string, titel: (r.titel as string) ?? '',
  schluessel: r.schluessel as string, code: r.code as string, codeArt: r.code_art as 'erzeugt' | 'eigen', empfaenger: (r.empfaenger as string | null) ?? null,
  erstellt: iso(r.erstellt), erstelltVon: (r.erstellt_von as string | null) ?? null, ablauf: iso(r.ablauf), maxAbrufe: r.max_abrufe as number,
  abrufe: r.abrufe as number, fehlversuche: r.fehlversuche as number, gesperrt: isoOder(r.gesperrt), widerrufen: isoOder(r.widerrufen), abgerufen: isoOder(r.abgerufen),
});
const alsTyp = (r: Zeile): Mappentyp => ({
  id: r.id as string,
  name: r.name as string,
  ...(r.schluessel ? { schluessel: r.schluessel as string } : {}),
  beschreibung: r.beschreibung as string,
  titelVorlage: r.titel_vorlage as string,
  felder: r.felder as Mappentyp['felder'],
  register: r.register as Mappentyp['register'],
  trefferliste: (r.trefferliste as string[] | null) ?? [],
  trefferlisten: (r.trefferlisten as Mappentyp['trefferlisten'] | null) ?? undefined,
  erstellenErlaubt: r.erstellen_erlaubt !== false,
  loeschenErlaubt: r.loeschen_erlaubt !== false,
  system: (r.system as Mappentyp['system']) ?? null,
  berechtigungen: (r.berechtigungen as Mappentyp['berechtigungen']) ?? null,
  archiv: (r.archiv as Mappentyp['archiv']) ?? null,
  erstellt: iso(r.erstellt),
  geaendert: iso(r.geaendert),
});
const alsKreis = (r: Zeile): Nummernkreis => ({
  schluessel: String(r.schluessel), name: String(r.name), muster: String(r.muster), start: Number(r.start),
  staende: (r.staende ?? {}) as Record<string, number>, zuletzt: (r.zuletzt ?? []) as Nummernkreis['zuletzt'],
});

const alsVersion = (r: Zeile): DokumentVersion => ({
  dokumentId: r.dokument_id as string, nummer: r.nummer as number, name: r.name as string, mime: r.mime as string, groesse: Number(r.groesse),
  sha256: r.sha256 as string, anzeigbar: r.anzeigbar as boolean, erstellt: iso(r.erstellt), erstelltVon: (r.erstellt_von as string | null) ?? null,
  herkunft: (r.herkunft as Herkunft | null) ?? null,
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
  archivnummer: (r.archivnummer as string | null) ?? null,
  ocr: {
    stand: ((r.ocr_stand as OcrStandArt | null) ?? 'keiner'),
    info: (r.ocr_info as string | null) ?? null,
    seiten: (r.ocr_seiten as number | null) ?? null,
    zeit: r.ocr_zeit ? iso(r.ocr_zeit) : null,
  },
  // Versionierung (#194)
  version: (r.version as number | null) ?? 1,
  herkunft: (r.herkunft as Herkunft | null) ?? null,
  ...(r.aeltere !== undefined ? { aeltere: Number(r.aeltere) } : {}),
});
/**
 * Spalten eines Dokuments ohne `volltext` (#367): Der Volltext kann je Dokument viele KB bis MB groß
 * sein und wird nur über `volltext()`/`volltexte()` gelesen, nie in Listen.
 */
export const DOKUMENT_SPALTEN = ['id', 'haushalt_id', 'mappe_id', 'register_key', 'name', 'mime', 'groesse', 'sha256', 'anzeigbar', 'erstellt', 'erstellt_von',
  'ocr_stand', 'ocr_info', 'ocr_seiten', 'ocr_zeit', 'version', 'herkunft', 'archivnummer'] as const;
/**
 * ANALYZE (#367) für Tabellen mit Volltext nur über diese Spalten: Ohne Spaltenliste rechnet PostgreSQL
 * auch die Statistik des Index `to_tsvector('german', volltext)` – über eine Minute bei 20.000 Dokumenten.
 */
export const STATISTIK_SPALTEN: Record<string, string> = {
  dokumente: 'id, haushalt_id, mappe_id, register_key, sha256, erstellt, erstellt_von, ocr_stand, archivnummer',
  dokument_versionen: 'dokument_id, haushalt_id, sha256',
};
/** Spalten einer älteren Version ohne `volltext`. */
const VERSION_SPALTEN = 'dokument_id, haushalt_id, nummer, name, mime, groesse, sha256, anzeigbar, erstellt, erstellt_von, herkunft';
/** Ausschnitte aus dem Volltext: höchstens zwei Stellen, Treffer markiert (#45). */
const AUSSCHNITT = `StartSel=${TREFFER_ANFANG}, StopSel=${TREFFER_ENDE}, MaxFragments=2, MaxWords=18, MinWords=6, FragmentDelimiter=" … "`;
const alsAufgabe = (r: Zeile): Aufgabe => ({
  id: r.id as string, mappeId: r.mappe_id as string, empfaengerId: (r.empfaenger_id as string | null) ?? null,
  art: r.art as Aufgabe['art'], text: r.text as string, feldKey: (r.feld_key as string | null) ?? null,
  ...(r.datum ? { datum: tag(r.datum) } : {}),
  erstellt: iso(r.erstellt), erstelltVon: (r.erstellt_von as string | null) ?? null,
  erledigt: r.erledigt ? iso(r.erledigt) : null, erledigtVon: (r.erledigt_von as string | null) ?? null,
  ...(r.mappe_titel !== undefined ? { mappeTitel: (r.mappe_titel as string | null) ?? '', typId: r.typ_id as string } : {}),
});
const alsHistorie = (r: Zeile): Historieneintrag => ({
  id: Number(r.id), mappeId: r.mappe_id as string, zeit: iso(r.zeit), benutzerId: (r.benutzer_id as string | null) ?? null,
  art: r.art as Historienart, daten: (r.daten as Historieneintrag['daten']) ?? {},
});
/** date-Spalte → JJJJ-MM-TT (postgres.js liest „2027-09-30“ als Mitternacht UTC). */
const tag = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
const alsErinnerung = (r: Zeile): Erinnerung => ({
  id: r.id as string, mappeId: r.mappe_id as string, empfaengerId: (r.empfaenger_id as string | null) ?? null,
  datum: tag(r.datum), text: r.text as string, erstellt: iso(r.erstellt), erstelltVon: (r.erstellt_von as string | null) ?? null,
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
/** Dokument im Papierkorb (#344). */
const alsDokPapierkorb = (r: Zeile): DokumentImPapierkorb => {
  const d = r.dokument as Zeile;
  return {
    id: r.id as string, mappeId: r.mappe_id as string, registerKey: d.register_key as string, name: d.name as string, mime: d.mime as string,
    groesse: Number(d.groesse), sha256: d.sha256 as string, erstellt: iso(d.erstellt), erstelltVon: (d.erstellt_von as string | null) ?? null,
    versionen: Number(r.anzahl_versionen ?? 0), geloescht: iso(r.geloescht), geloeschtVon: (r.geloescht_von as string | null) ?? null,
  };
};
const alsPapierkorb = (r: Zeile): PapierkorbEintrag => {
  const m = r.mappe as Zeile;
  return {
    id: r.id as string, typId: r.typ_id as string, titel: (m.titel as string | null) ?? '', werte: (m.werte as Werte) ?? {}, demo: !!m.demo,
    erstellt: iso(m.erstellt), erstelltVon: (m.erstellt_von as string | null) ?? null,
    geaendert: iso(m.geaendert), geaendertVon: (m.geaendert_von as string | null) ?? null,
    geloescht: iso(r.geloescht), geloeschtVon: (r.geloescht_von as string | null) ?? null,
    dokumente: Number(r.anzahl_dokumente ?? 0),
    vorgang: (r.vorgang as string | null) ?? null, entkoppelt: (r.entkoppelt as Array<{ quelleId: string; feldKey: string }> | null) ?? [],
  };
};
// postgres.js erwartet für jsonb einen JSON-Wert; unsere Typen sind JSON-kompatibel.
const json = (sql: Sql, v: unknown) => sql.json(v as postgres.JSONValue);

/* Löschprotokoll (#470) */
const loeschDok = (d: Zeile): LoeschDokument => ({
  dokumentId: d.id as string, version: Number(d.version ?? 1), sha256: d.sha256 as string, groesse: Number(d.groesse), mime: String(d.mime ?? ''),
  seiten: d.ocr_seiten === null || d.ocr_seiten === undefined ? null : Number(d.ocr_seiten), archivnummer: (d.archivnummer as string | null) ?? null,
});
const loeschVersion = (v: Zeile): LoeschDokument => ({
  dokumentId: v.dokument_id as string, version: Number(v.nummer), sha256: v.sha256 as string, groesse: Number(v.groesse), mime: String(v.mime ?? ''), seiten: null, archivnummer: null,
});
const alsLoeschEintrag = (r: Zeile): LoeschEintrag => ({
  id: r.id as string, zeit: iso(r.zeit), art: r.art as LoeschEintrag['art'], schritt: r.schritt as LoeschEintrag['schritt'], weg: r.weg as LoeschEintrag['weg'],
  mappeId: r.mappe_id as string, typId: (r.typ_id as string | null) ?? null, typ: r.typ_name as string, nummer: (r.nummer as string | null) ?? null, archivnummer: (r.archivnummer as string | null) ?? null,
  dokumentId: (r.dokument_id as string | null) ?? null, version: r.version === null ? null : Number(r.version), sha256: (r.sha256 as string | null) ?? null,
  groesse: r.groesse === null ? null : Number(r.groesse), mime: (r.mime as string | null) ?? null, seiten: r.seiten === null ? null : Number(r.seiten),
  anzahl: (r.anzahl as LoeschEintrag['anzahl']) ?? null, vonId: (r.von_id as string | null) ?? null, von: r.von_name as string,
  ausloeser: r.ausloeser as LoeschEintrag['ausloeser'], grund: (r.grund as LoeschEintrag['grund']) ?? null, grundText: r.grund_text as string,
  vorgang: (r.vorgang as string | null) ?? null, startId: (r.start_id as string | null) ?? null,
});

const alsSicht = (r: Zeile): Sicht => ({
  id: r.id as string,
  name: r.name as string,
  beschreibung: r.beschreibung as string,
  elternId: (r.eltern_id as string | null) ?? null,
  position: r.position as number,
  typen: (r.typen as string[]) ?? [],
  bedingungen: (r.bedingungen as Sicht['bedingungen']) ?? [],
  trefferliste: (r.trefferliste as string | null) ?? null,
  berechtigungen: (r.berechtigungen as Sicht['berechtigungen']) ?? null,
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
  if (f.art === 'aufgabe') {
    return sql`EXISTS (SELECT 1 FROM aufgaben auf WHERE auf.mappe_id = mappen.id AND auf.erledigt IS NULL AND auf.empfaenger_id = ${istUuid(f.benutzer) ? f.benutzer : null}::uuid)`;
  }
  if (f.art === 'id') return sql`mappen.id = ANY(${f.ids.filter(istUuid)}::uuid[])`;
  if (f.art === 'frist') {
    // Eines der Datumsfelder in [von, bis]; mit ich nur Fristen dieses Empfängers (Benutzerfeld, sonst Ersteller).
    const teile = f.felder.map((x) => {
      const d = sql`(CASE WHEN mappen.werte ->> ${x.key}::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (mappen.werte ->> ${x.key}::text)::date END)`;
      const wer = !f.ich ? sql``
        : x.empfaengerFeld ? sql`AND coalesce(nullif(mappen.werte ->> ${x.empfaengerFeld}::text, ''), mappen.erstellt_von::text) = ${f.ich}`
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
    return zaehlBedingung(sql, sql`SELECT count(DISTINCT v.quelle_id) FROM verweise v JOIN mappen q ON q.id = v.quelle_id WHERE v.ziel_id = mappen.id AND v.quelle_id <> mappen.id ${q}`, f.vergleich, f.anzahl);
  };
  if (f.quellenJeTyp) {
    // Gemeinsames Register mehrerer Typen (#66): je Typ über die Quellen seines eigenen Registers.
    const teile = Object.entries(f.quellenJeTyp).filter(([t]) => istUuid(t)).map(([t, q]) => sql`(mappen.typ_id = ${t}::uuid AND ${zaehle(q)})`);
    return teile.length ? teile.slice(1).reduce<Teil>((acc, x) => sql`${acc} OR ${x}`, teile[0]) : sql`false`;
  }
  return zaehle(f.quellen);
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

/** Ausdruck der Berechtigungen (#123) als SQL über `mappen`. */
export function ausdruckSql(sql: Sql, x: Ausdruck): Teil {
  switch (x.k) {
    case 'wahr': return sql`true`;
    case 'falsch': return sql`false`;
    case 'filter': return sql`(${filterSql(sql, x.f)})`;
    case 'nicht': return sql`NOT (${ausdruckSql(sql, x.a)})`;
    case 'und': return x.teile.slice(1).reduce<Teil>((acc, t) => sql`${acc} AND ${ausdruckSql(sql, t)}`, sql`(${ausdruckSql(sql, x.teile[0])})`);
    case 'oder': return sql`(${x.teile.slice(1).reduce<Teil>((acc, t) => sql`${acc} OR ${ausdruckSql(sql, t)}`, ausdruckSql(sql, x.teile[0]))})`;
    case 'wenn': return sql`(CASE WHEN ${ausdruckSql(sql, x.bed)} THEN ${ausdruckSql(sql, x.dann)} ELSE ${ausdruckSql(sql, x.sonst)} END)`;
  }
}

/** Lesefilter (#124): Mappen offener Typen und je Typ sein Ausdruck; null/undefined = alles. */
export function lesefilterSql(sql: Sql, f: Lesefilter | null | undefined): Teil {
  if (!f) return sql`true`;
  const teile: Teil[] = [];
  const offen = f.offen.filter(istUuid);
  if (offen.length) teile.push(sql`mappen.typ_id = ANY(${offen}::uuid[])`);
  for (const j of f.je) if (istUuid(j.typId)) teile.push(sql`(mappen.typ_id = ${j.typId}::uuid AND ${ausdruckSql(sql, j.ausdruck)})`);
  if (!teile.length) return sql`false`;
  return sql`(${teile.slice(1).reduce<Teil>((acc, t) => sql`${acc} OR ${t}`, teile[0])})`;
}

/** PostgreSQL-Umsetzung für genau einen Haushalt. */
/**
 * Verbindung einer laufenden Transaktion, die sich wie `sql` benutzen lässt (#404): `begin` wird dort
 * zum Sicherungspunkt, damit die Methoden des Repos unverändert auch in einer Transaktion laufen.
 */
function inTransaktion(tx: postgres.TransactionSql): Sql {
  return new Proxy(tx, {
    get(ziel, prop, empfaenger) {
      if (prop === 'begin') return (...args: unknown[]) => ziel.savepoint(args[args.length - 1] as (s: postgres.TransactionSql) => Promise<unknown>);
      return Reflect.get(ziel, prop, empfaenger);
    },
  }) as unknown as Sql;
}

export function pgRepo(sql: Sql, haushaltId: string): Repo {
  // Dokumente immer mit ausdrücklichen Spalten, nie `d.*` (#367): sonst kommt der Volltext mit.
  const DOK = sql.unsafe(DOKUMENT_SPALTEN.map((c) => `d.${c}`).join(', '));
  const DOK_RUECK = sql.unsafe(DOKUMENT_SPALTEN.join(', '));
  const VERS = sql.unsafe(VERSION_SPALTEN);
  let ereignisseAufgeraeumt = 0;
  /** Nummer ziehen (#171) – nur innerhalb einer Transaktion; die Zeile bleibt bis zu deren Ende gesperrt. */
  async function zieheIn(tx: postgres.TransactionSql, schluessel: string, mappeId: string | null, jetzt: Date): Promise<string> {
    const [r] = await tx`SELECT * FROM nummernkreise WHERE haushalt_id = ${haushaltId} AND schluessel = ${schluessel} FOR UPDATE`;
    if (!r) throw new Error(`Nummernkreis ${schluessel} fehlt`);
    const z = ziehe(alsKreis(r), datumIn(jetzt), mappeId, jetzt.toISOString());
    await tx`UPDATE nummernkreise SET staende = ${tx.json(z.kreis.staende)}, zuletzt = ${tx.json(z.kreis.zuletzt as unknown as postgres.JSONValue)}
      WHERE haushalt_id = ${haushaltId} AND schluessel = ${schluessel}`;
    return z.nummer;
  }

  async function schreibeVerweise(tx: postgres.TransactionSql, quelleId: string, vs: Verweis[]) {
    await tx`DELETE FROM verweise WHERE quelle_id = ${quelleId}`;
    const gueltig = vs.filter((v) => istUuid(v.zielId));
    if (!gueltig.length) return;
    const zeilen = gueltig.map((v) => ({ quelle_id: quelleId, feld_key: v.feldKey, ziel_id: v.zielId, haushalt_id: haushaltId }));
    await tx`INSERT INTO verweise ${tx(zeilen)} ON CONFLICT DO NOTHING`;
  }

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
      // Erinnerungen (#131): wie Aufgaben.
      await tx`
        INSERT INTO erinnerungen
        SELECT (jsonb_populate_record(NULL::erinnerungen, x.value || jsonb_build_object(
          'empfaenger_id', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'empfaenger_id') THEN x.value -> 'empfaenger_id' ELSE 'null'::jsonb END,
          'erstellt_von', CASE WHEN EXISTS (SELECT 1 FROM benutzer b WHERE b.id::text = x.value ->> 'erstellt_von') THEN x.value -> 'erstellt_von' ELSE 'null'::jsonb END))).*
        FROM papierkorb p, jsonb_array_elements(coalesce(p.erinnerungen, '[]'::jsonb)) x WHERE p.id = ANY(${da}::uuid[])`;
      await tx`DELETE FROM papierkorb WHERE id = ANY(${da}::uuid[])`;
      return { verweiseEntfallen: ps.reduce((s, p) => s + (p.verweise as unknown[]).length, 0) - v.count };
    });
  }

  return {
    transaktion(f) {
      return sql.begin((tx) => f(pgRepo(inTransaktion(tx), haushaltId))) as Promise<Awaited<ReturnType<typeof f>>>;
    },
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
        INSERT INTO mappentypen (id, haushalt_id, name, schluessel, beschreibung, titel_vorlage, felder, register, trefferliste, trefferlisten, erstellen_erlaubt, loeschen_erlaubt, system, archiv)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${d.schluessel ?? null}, ${d.beschreibung}, ${d.titelVorlage}, ${json(sql, d.felder)}, ${json(sql, d.register)}, ${json(sql, standardliste(d).spalten)}, ${json(sql, trefferlistenVon(d))},
          ${d.erstellenErlaubt !== false}, ${d.loeschenErlaubt !== false}, ${system ?? null}, ${d.archiv ? json(sql, d.archiv) : null})
        RETURNING *`;
      return alsTyp(r);
    },
    async aendereTyp(id, d) {
      return sql.begin(async (tx) => {
        const [r] = await tx`
          UPDATE mappentypen SET name = ${d.name}, schluessel = coalesce(schluessel, ${d.schluessel ?? null}), beschreibung = ${d.beschreibung}, titel_vorlage = ${d.titelVorlage},
            felder = ${json(sql, d.felder)}, register = ${json(sql, d.register)}, trefferliste = ${json(sql, standardliste(d).spalten)}, trefferlisten = ${json(sql, trefferlistenVon(d))},
            erstellen_erlaubt = ${d.erstellenErlaubt !== false}, loeschen_erlaubt = ${d.loeschenErlaubt !== false}, archiv = ${d.archiv ? json(sql, d.archiv) : null}, geaendert = now()
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
    async mappenMitDatum(typId, felder, von, bis) {
      if (!istUuid(typId) || !felder.length) return [];
      // Datumswerte stehen als Text JJJJ-MM-TT in werte; der Textvergleich ordnet sie richtig.
      const r = await sql`SELECT * FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId}
        AND EXISTS (SELECT 1 FROM unnest(${felder}::text[]) AS f(k) WHERE werte->>f.k BETWEEN ${von} AND ${bis})
        ORDER BY erstellt`;
      return r.map(alsMappe);
    },
    async mappenKurz() {
      return (await sql`SELECT id, typ_id, coalesce(titel, '') AS titel FROM mappen WHERE haushalt_id = ${haushaltId}`)
        .map((r) => ({ id: r.id as string, typId: r.typ_id as string, titel: r.titel as string }));
    },
    async feldwerte(typId, key) {
      if (!istUuid(typId)) return [];
      return (await sql`SELECT werte ->> ${key} AS w FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId} AND werte ? ${key}`)
        .map((r) => r.w as string).filter((w) => w != null);
    },
    async holeMappe(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsMappe(r) : undefined;
    },
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
          RETURNING *`;
        await schreibeVerweise(tx, id, vs);
        return alsMappe(r);
      });
    },
    async aktualisiereStatistik() {
      // Ohne frische Statistik plant PostgreSQL nach zehntausenden neuen Zeilen mit alten Zahlen (#367).
      // Dokumente nur über ausgewählte Spalten (STATISTIK_SPALTEN): 0,1 s statt über einer Minute.
      await sql.unsafe(`ANALYZE mappen, verweise, aufgaben, notizen, historie, favoriten, ${Object.entries(STATISTIK_SPALTEN).map(([t, c]) => `${t} (${c})`).join(', ')}`);
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
    async listePakete() {
      return (await sql`SELECT daten FROM pakete WHERE haushalt_id = ${haushaltId} ORDER BY id`).map((r) => r.daten as InstalliertesPaket);
    },
    async speicherePaket(p) {
      await sql`
        INSERT INTO pakete (haushalt_id, id, version, daten, installiert) VALUES (${haushaltId}, ${p.id}, ${p.version}, ${json(sql, p)}, ${p.installiert})
        ON CONFLICT (haushalt_id, id) DO UPDATE SET version = EXCLUDED.version, daten = EXCLUDED.daten`;
    },
    async loeschePaket(id) { await sql`DELETE FROM pakete WHERE haushalt_id = ${haushaltId} AND id = ${id}`; },
    async speicherePaketCode(id, dateien) {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM paket_code WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`;
        for (const d of dateien) await tx`INSERT INTO paket_code (haushalt_id, paket_id, name, inhalt) VALUES (${haushaltId}, ${id}, ${d.name}, ${d.inhalt})`;
      });
    },
    async paketCode(id) {
      return (await sql`SELECT name, inhalt FROM paket_code WHERE haushalt_id = ${haushaltId} AND paket_id = ${id} ORDER BY name`).map((r) => ({ name: r.name as string, inhalt: Buffer.from(r.inhalt as Uint8Array) }));
    },
    async loeschePaketCode(id) { await sql`DELETE FROM paket_code WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`; },
    async legeEreignisseAn(liste) {
      if (!liste.length) return;
      await sql`INSERT INTO paket_ereignisse ${sql(liste.map((e) => ({ id: e.id, haushalt_id: haushaltId, paket_id: e.paketId, art: e.art, daten: json(sql, e.daten) })))}`;
    },
    async faelligeEreignisse(anzahl) {
      // Reihenfolge je Paket: Wartet ein älteres Ereignis auf seine Wiederholung, warten die späteren mit.
      return (await sql`SELECT e.id, e.paket_id, e.art, e.daten, e.erstellt, e.versuche FROM paket_ereignisse e
        WHERE e.haushalt_id = ${haushaltId} AND e.zugestellt IS NULL AND e.faellig <= now()
          AND NOT EXISTS (SELECT 1 FROM paket_ereignisse a WHERE a.haushalt_id = e.haushalt_id AND a.paket_id = e.paket_id
            AND a.zugestellt IS NULL AND a.faellig > now() AND a.faellig <> 'infinity' AND a.erstellt < e.erstellt)
        ORDER BY e.erstellt, e.id LIMIT ${anzahl}`)
        .map((r) => ({ id: r.id as string, paketId: r.paket_id as string, art: r.art as string, daten: r.daten as Record<string, unknown>, erstellt: (r.erstellt as Date).toISOString(), versuche: r.versuche as number }));
    },
    async ereignisZugestellt(id) {
      await sql`UPDATE paket_ereignisse SET zugestellt = now(), fehler = NULL WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      // Aufräumen höchstens alle 10 Minuten: Zugestelltes bleibt 7 Tage (für die Übersicht), Aufgegebenes 30 Tage.
      if (Date.now() - ereignisseAufgeraeumt < 600_000) return;
      ereignisseAufgeraeumt = Date.now();
      await sql`DELETE FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} AND (zugestellt < now() - interval '7 days' OR (zugestellt IS NULL AND faellig = 'infinity' AND erstellt < now() - interval '30 days'))`;
    },
    async ereignisFehlgeschlagen(id, fehler, naechster) {
      await sql`UPDATE paket_ereignisse SET versuche = versuche + 1, fehler = ${fehler.slice(0, 1000)},
        faellig = ${naechster ? sql`${naechster}` : sql`'infinity'::timestamptz`} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async ereignisStand() {
      const erg: Record<string, { offen: number; aufgegeben: number; zugestellt: number }> = {};
      for (const r of await sql`SELECT paket_id,
          count(*) FILTER (WHERE zugestellt IS NULL AND faellig <> 'infinity')::int AS offen,
          count(*) FILTER (WHERE zugestellt IS NULL AND faellig = 'infinity')::int AS aufgegeben,
          count(*) FILTER (WHERE zugestellt IS NOT NULL)::int AS zugestellt
        FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} GROUP BY paket_id`) erg[r.paket_id as string] = { offen: r.offen as number, aufgegeben: r.aufgegeben as number, zugestellt: r.zugestellt as number };
      return erg;
    },
    async loescheEreignisse(id) { await sql`DELETE FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`; },
    async listeNummernkreise() {
      return (await sql`SELECT * FROM nummernkreise WHERE haushalt_id = ${haushaltId} ORDER BY name`).map(alsKreis);
    },
    async speichereNummernkreis(k) {
      const [r] = await sql`
        INSERT INTO nummernkreise (haushalt_id, schluessel, name, muster, start) VALUES (${haushaltId}, ${k.schluessel}, ${k.name}, ${k.muster}, ${k.start})
        ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET name = EXCLUDED.name, muster = EXCLUDED.muster, start = EXCLUDED.start
        RETURNING *`;
      return alsKreis(r);
    },
    async loescheNummernkreis(s) { await sql`DELETE FROM nummernkreise WHERE haushalt_id = ${haushaltId} AND schluessel = ${s}`; },
    async setzeZaehler(s, zeitraum, letzter) {
      const [r] = await sql`
        UPDATE nummernkreise SET staende = staende || ${json(sql, { [zeitraum]: letzter })}
        WHERE haushalt_id = ${haushaltId} AND schluessel = ${s} RETURNING *`;
      return r ? alsKreis(r) : undefined;
    },
    async vergebeNummer(mappeId, feldKey, kreis, jetzt) {
      return sql.begin(async (tx) => {
        const [m] = await tx`SELECT werte FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${mappeId} FOR UPDATE`;
        const alt = (m?.werte as Werte | undefined)?.[feldKey];
        if (!m || (alt != null && alt !== '')) return null;
        const nummer = await zieheIn(tx, kreis, mappeId, jetzt);
        await tx`UPDATE mappen SET werte = werte || ${json(sql, { [feldKey]: nummer })} WHERE haushalt_id = ${haushaltId} AND id = ${mappeId}`;
        return nummer;
      });
    },
    async zieheNummern(kreis, anzahl, jetzt) {
      return sql.begin(async (tx) => {
        const erg: string[] = [];
        for (let i = 0; i < anzahl; i++) erg.push(await zieheIn(tx, kreis, null, jetzt));
        return erg;
      });
    },
    async setzeArchivnummer(dokumentId, nummer) {
      if (!istUuid(dokumentId)) return false;
      if (nummer) {
        const [x] = await sql`SELECT 1 FROM dokumente WHERE haushalt_id = ${haushaltId} AND lower(archivnummer) = lower(${nummer}) AND id <> ${dokumentId}`;
        if (x) return false;
      }
      try { await sql`UPDATE dokumente SET archivnummer = ${nummer} WHERE haushalt_id = ${haushaltId} AND id = ${dokumentId}`; }
      catch (e) { if ((e as { code?: string }).code === '23505') return false; throw e; }
      return true;
    },
    async findeArchivnummer(nummer) {
      const [r] = await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND lower(d.archivnummer) = lower(${nummer})`;
      return r ? alsDokument(r) : undefined;
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
        : o.favoriten
        ? sql`AND EXISTS (SELECT 1 FROM favoriten fav WHERE fav.mappe_id = mappen.id AND fav.benutzer_id = ${istUuid(o.favoriten.benutzerId) ? o.favoriten.benutzerId : null}::uuid)`
        : sql``;
      const musterAus = (t: string) => `%${t.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      const muster = o.suche ? musterAus(o.suche) : null;
      // Teilwörter im Volltext (#161): „Ofen“ findet „Backofen“ – zusätzlich zu den Wortformen.
      const teilSql = (spalte: string, teil: string[]) => teil.map((w) => sql`${sql.unsafe(spalte)} ILIKE ${musterAus(w)}`)
        .reduce((a, b) => sql`${a} AND ${b}`);
      const inNotizen = (t: string) => sql`EXISTS (SELECT 1 FROM notizen n WHERE n.mappe_id = mappen.id AND n.text ILIKE ${musterAus(t)})`;
      const inDokumenten = (t: string) => {
        const teil = teilwoerter(t);
        return sql`EXISTS (SELECT 1 FROM dokumente d WHERE d.mappe_id = mappen.id
          AND (to_tsvector('german', coalesce(d.volltext, '')) @@ websearch_to_tsquery('german', ${t}::text)${teil ? sql` OR (${teilSql('d.volltext', teil)})` : sql``}))`;
      };
      const suche = muster
        ? sql`AND (titel ILIKE ${muster} OR EXISTS (SELECT 1 FROM jsonb_each_text(werte) e WHERE e.value ILIKE ${muster} AND e.value NOT LIKE 'dms1$%')
            ${o.notizen ? sql`OR ${inNotizen(o.suche!)}` : sql``}
            ${o.volltext ? sql`OR ${inDokumenten(o.suche!)}` : sql``})`
        : sql``;
      // Erweiterte Suche (#199): Begriff in Dokumenten oder Notizen, zusätzlich zu allen anderen Bedingungen.
      const tf = o.textfilter?.text.trim() && (o.textfilter.dokumente || o.textfilter.notizen) ? o.textfilter : null;
      const textfilter = tf
        ? sql`AND (${[...(tf.dokumente ? [inDokumenten(tf.text)] : []), ...(tf.notizen ? [inNotizen(tf.text)] : [])].reduce((a, b) => sql`${a} OR ${b}`)})`
        : sql``;
      // Berechtigungen (#124): nur, was der Benutzer lesen darf.
      const lesen = o.lesen ? sql`AND ${lesefilterSql(sql, o.lesen)}` : sql``;
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} ${typ} ${eingang} ${suche} ${textfilter} ${lesen}`;
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
        SELECT * FROM mappen WHERE haushalt_id = ${haushaltId} ${typ} ${eingang} ${suche} ${textfilter} ${lesen}
        ORDER BY ${ausdruck} ${richtung}, lower(titel), id OFFSET ${o.von} LIMIT ${o.anzahl}`;
      const mappen = r.map(alsMappe);
      // Fundstellen: zur Suche oder – in der erweiterten Suche – zum Volltextfilter.
      const fund = o.suche && (o.volltext || o.notizen) ? { text: o.suche, volltext: !!o.volltext, notizen: !!o.notizen }
        : tf ? { text: tf.text.trim(), volltext: tf.dokumente, notizen: tf.notizen } : null;
      if (!fund || !mappen.length) return { gesamt: n as number, mappen };
      const ausschnitte: Record<string, Ausschnitt> = {};
      if (fund.notizen) {
        const nz = await sql`SELECT mappe_id, text FROM notizen WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${mappen.map((m) => m.id)}::uuid[]) AND text ILIKE ${musterAus(fund.text)} ORDER BY erstellt`;
        for (const z of nz) {
          const t = ausschnittAus(alsText(z.text as string), fund.text);
          if (t && !ausschnitte[z.mappe_id as string]) ausschnitte[z.mappe_id as string] = { dokument: 'Notiz', text: t };
        }
      }
      if (!fund.volltext) return { gesamt: n as number, mappen, ausschnitte };
      // Fundstellen im Volltext: je Mappe das Dokument mit dem besten Treffer.
      const a = await sql`
        SELECT DISTINCT ON (d.mappe_id) d.mappe_id, d.name, ts_headline('german', d.volltext, q, ${AUSSCHNITT}::text) AS text
        FROM dokumente d, websearch_to_tsquery('german', ${fund.text}::text) q
        WHERE d.haushalt_id = ${haushaltId} AND d.mappe_id = ANY(${mappen.map((m) => m.id)}::uuid[])
          AND to_tsvector('german', coalesce(d.volltext, '')) @@ q
        ORDER BY d.mappe_id, ts_rank(to_tsvector('german', coalesce(d.volltext, '')), q) DESC`;
      for (const z of a) ausschnitte[z.mappe_id as string] ??= { dokument: z.name as string, text: z.text as string };
      // Nur als Teilwort gefunden: Ausschnitt um die erste Fundstelle.
      const teil = teilwoerter(fund.text);
      const ohne = mappen.filter((m) => !ausschnitte[m.id]).map((m) => m.id);
      if (teil && ohne.length) {
        const b = await sql`
          SELECT DISTINCT ON (d.mappe_id) d.mappe_id, d.name, substr(d.volltext, greatest(1, strpos(lower(d.volltext), ${teil[0]}) - 80), 240 + ${teil[0].length}) AS text
          FROM dokumente d
          WHERE d.haushalt_id = ${haushaltId} AND d.mappe_id = ANY(${ohne}::uuid[]) AND ${teilSql('d.volltext', teil)}
          ORDER BY d.mappe_id, d.erstellt`;
        for (const z of b) {
          const t = ausschnittAus(String(z.text ?? ''), teil[0]);
          if (t) ausschnitte[z.mappe_id as string] ??= { dokument: z.name as string, text: t };
        }
      }
      return { gesamt: n as number, mappen, ausschnitte };
    },
    async zaehler(benutzerId, admin, lesefilter) {
      const lesen = lesefilter ? sql`AND ${lesefilterSql(sql, lesefilter)}` : sql``;
      const r = await sql`
        SELECT typ_id, count(*)::int AS anzahl,
          count(*) FILTER (WHERE passt IS NOT TRUE)::int AS unpassend,
          count(*) FILTER (WHERE demo)::int AS demo
        FROM mappen WHERE haushalt_id = ${haushaltId} ${lesen} GROUP BY typ_id`;
      // Eingang (#477): von den offenen Aufgaben aus statt je Mappe (EXISTS über alle Mappen), ohne Lesefilter.
      const [e] = await sql`SELECT count(DISTINCT a.mappe_id)::int AS n FROM aufgaben a JOIN mappen m ON m.id = a.mappe_id
        WHERE m.haushalt_id = ${haushaltId} AND a.erledigt IS NULL
          AND (a.empfaenger_id = ${istUuid(benutzerId) ? benutzerId : null}::uuid OR (${admin} AND a.empfaenger_id IS NULL))`;
      const [f] = await sql`SELECT count(*)::int AS n FROM favoriten f JOIN mappen ON mappen.id = f.mappe_id
        WHERE f.haushalt_id = ${haushaltId} AND f.benutzer_id = ${istUuid(benutzerId) ? benutzerId : null}::uuid ${lesen}`;
      return {
        favoriten: f.n as number,
        typen: new Map(r.map((z) => [z.typ_id as string, { anzahl: z.anzahl as number, unpassend: z.unpassend as number, demo: z.demo as number }])),
        eingang: e.n as number,
      };
    },
    async zaehleKlauseln(liste, lesefilter) {
      if (!liste.length) return [];
      const spalten = liste.map((k, i) => sql`count(*) FILTER (WHERE ${klauselnSql(sql, k)})::int AS ${sql(`s${i}`)}`);
      const sel = spalten.slice(1).reduce((acc, t) => sql`${acc}, ${t}`, spalten[0]);
      const lesen = lesefilter ? sql`AND ${lesefilterSql(sql, lesefilter)}` : sql``;
      const [r] = await sql`SELECT ${sel} FROM mappen WHERE haushalt_id = ${haushaltId} ${lesen}`;
      return liste.map((_, i) => r[`s${i}`] as number);
    },

    async listeSichten() {
      return (await sql`SELECT * FROM sichten WHERE haushalt_id = ${haushaltId} ORDER BY position, lower(name)`).map(alsSicht);
    },
    async legeSichtAn(id, d: SichtDaten) {
      const [r] = await sql`
        INSERT INTO sichten (id, haushalt_id, name, beschreibung, eltern_id, position, typen, bedingungen, trefferliste, berechtigungen)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${d.beschreibung}, ${d.elternId}, ${d.position}, ${json(sql, d.typen)}, ${json(sql, d.bedingungen)}, ${d.trefferliste ?? null}, ${d.berechtigungen ? json(sql, d.berechtigungen) : null})
        RETURNING *`;
      return alsSicht(r);
    },
    async aendereSicht(id, d: SichtDaten) {
      const [r] = await sql`
        UPDATE sichten SET name = ${d.name}, beschreibung = ${d.beschreibung}, eltern_id = ${d.elternId}, position = ${d.position},
          typen = ${json(sql, d.typen)}, bedingungen = ${json(sql, d.bedingungen)}, trefferliste = ${d.trefferliste ?? null},
          berechtigungen = ${d.berechtigungen ? json(sql, d.berechtigungen) : null}, geaendert = now()
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
    async lesbare(ids, lesefilter) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return new Set();
      const r = await sql`SELECT id FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) AND ${lesefilterSql(sql, lesefilter)}`;
      return new Set(r.map((z) => z.id as string));
    },
    async inKlauseln(ids, klauseln) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length || !klauseln.length) return new Set();
      const r = await sql`SELECT id FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) AND (${klauselnSql(sql, klauseln)})`;
      return new Set(r.map((z) => z.id as string));
    },
    async zaehleAusdruck(typId, x) {
      if (!istUuid(typId)) return 0;
      const [r] = await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId} AND ${ausdruckSql(sql, x)}`;
      return r.n as number;
    },
    async setzeTypSchluessel(typId, schluessel) {
      await sql`UPDATE mappentypen SET schluessel = ${schluessel} WHERE haushalt_id = ${haushaltId} AND id = ${typId} AND schluessel IS NULL`;
    },
    async setzeBerechtigungen(typId, rw) {
      const [r] = await sql`UPDATE mappentypen SET berechtigungen = ${rw ? json(sql, rw) : null}, geaendert = now() WHERE haushalt_id = ${haushaltId} AND id = ${typId} RETURNING *`;
      return alsTyp(r);
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

    async kantenVon(ids) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return [];
      const r = await sql`
        SELECT quelle_id, feld_key, ziel_id FROM verweise WHERE haushalt_id = ${haushaltId} AND quelle_id = ANY(${gueltig}::uuid[])
        UNION
        SELECT quelle_id, feld_key, ziel_id FROM verweise WHERE haushalt_id = ${haushaltId} AND ziel_id = ANY(${gueltig}::uuid[])`;
      return r.map((z) => ({ quelleId: z.quelle_id as string, feldKey: z.feld_key as string, zielId: z.ziel_id as string }));
    },
    async zaehleDokumente(ids) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return new Map();
      const r = await sql`SELECT mappe_id, count(*)::int AS n FROM dokumente WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) GROUP BY mappe_id`;
      return new Map(r.map((z) => [z.mappe_id as string, z.n as number]));
    },

    async listeDokumente(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.mappe_id = ${mappeId} ORDER BY d.erstellt DESC`).map(alsDokument);
    },
    async dokumenteVon(mappeIds) {
      const gueltig = [...new Set(mappeIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.mappe_id = ANY(${gueltig}::uuid[]) ORDER BY d.mappe_id, d.erstellt DESC`).map(alsDokument);
    },
    async holeDokument(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.id = ${id}`;
      return r ? alsDokument(r) : undefined;
    },
    async legeDokumentAn(d) {
      const [r] = await sql`
        INSERT INTO dokumente (id, haushalt_id, mappe_id, register_key, name, mime, groesse, sha256, anzeigbar, erstellt_von, herkunft)
        VALUES (${d.id}, ${haushaltId}, ${d.mappeId}, ${d.registerKey}, ${d.name}, ${d.mime}, ${d.groesse}, ${d.sha256}, ${d.anzeigbar}, ${d.erstelltVon}, ${d.herkunft ?? null})
        RETURNING ${DOK_RUECK}`;
      return alsDokument(r);
    },
    /* ---------- Versionierung (#194) ---------- */
    async versionenVon(dokumentId) {
      if (!istUuid(dokumentId)) return [];
      return (await sql`SELECT ${VERS} FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} ORDER BY nummer DESC`).map(alsVersion);
    },
    async versionenVonDokumenten(dokumentIds) {
      const gueltig = [...new Set(dokumentIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (await sql`SELECT ${VERS} FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ANY(${gueltig}::uuid[]) ORDER BY dokument_id, nummer DESC`).map(alsVersion);
    },
    async holeVersion(dokumentId, nummer) {
      if (!istUuid(dokumentId) || !Number.isInteger(nummer)) return undefined;
      const [r] = await sql`SELECT * FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} AND nummer = ${nummer}`;
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
            volltext = ${uebernehmen ? neu.volltext ?? null : null}, ocr_stand = ${uebernehmen && neu.volltext != null ? 'fertig' : 'keiner'},
            ocr_info = NULL, ocr_seiten = NULL, ocr_zeit = ${uebernehmen && neu.volltext != null ? sql`now()` : null}
          WHERE haushalt_id = ${haushaltId} AND id = ${id}
          RETURNING ${DOK_RUECK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = ${id}) AS aeltere`;
        return alsDokument(r);
      });
    },
    async alleDateien() {
      const r = await sql`
        SELECT d.sha256, d.groesse, d.id AS dokument_id, d.mappe_id, d.name, coalesce(d.version, 1) AS version FROM dokumente d WHERE d.haushalt_id = ${haushaltId}
        UNION ALL
        SELECT v.sha256, v.groesse, v.dokument_id, d.mappe_id, v.name, v.nummer FROM dokument_versionen v JOIN dokumente d ON d.id = v.dokument_id WHERE v.haushalt_id = ${haushaltId}`;
      return r.map((z) => ({ sha256: z.sha256 as string, groesse: Number(z.groesse), dokumentId: z.dokument_id as string, mappeId: z.mappe_id as string, name: z.name as string, version: Number(z.version) }));
    },
    async kuerzeVersionen(dokumentId, behalten) {
      const weg = await sql`
        DELETE FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId}
          AND nummer NOT IN (SELECT nummer FROM dokument_versionen WHERE dokument_id = ${dokumentId} ORDER BY nummer DESC LIMIT ${Math.max(0, behalten)})
        RETURNING sha256`;
      return [...new Set(weg.map((r) => r.sha256 as string))];
    },
    async loescheDokument(id) {
      await sql`DELETE FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async verschiebeDokument(id, mappeId, registerKey) {
      await sql`UPDATE dokumente SET mappe_id = ${mappeId}, register_key = ${registerKey} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async setzeFavorit(benutzerId, mappeId, an) {
      if (!istUuid(benutzerId) || !istUuid(mappeId)) return;
      if (an) await sql`INSERT INTO favoriten (benutzer_id, mappe_id, haushalt_id) VALUES (${benutzerId}, ${mappeId}, ${haushaltId}) ON CONFLICT DO NOTHING`;
      else await sql`DELETE FROM favoriten WHERE benutzer_id = ${benutzerId} AND mappe_id = ${mappeId}`;
    },
    async alleFavoriten() {
      return (await sql`SELECT benutzer_id, mappe_id FROM favoriten WHERE haushalt_id = ${haushaltId} ORDER BY benutzer_id, mappe_id`).map((r) => ({ benutzerId: r.benutzer_id as string, mappeId: r.mappe_id as string }));
    },
    async legeAuskunftLinkAn(l) {
      await sql`INSERT INTO auskunft_links (id, haushalt_id, auskunft_id, mappe_id, titel, schluessel, code, code_art, empfaenger, erstellt, erstellt_von, ablauf, max_abrufe)
        VALUES (${l.id}, ${haushaltId}, ${l.auskunftId}, ${l.mappeId}, ${l.titel}, ${l.schluessel}, ${l.code}, ${l.codeArt}, ${l.empfaenger}, ${l.erstellt}, ${istUuid(l.erstelltVon ?? '') ? l.erstelltVon : null}, ${l.ablauf}, ${l.maxAbrufe})`;
    },
    async auskunftLinkPerSchluessel(hash) {
      const [r] = await sql`SELECT * FROM auskunft_links WHERE haushalt_id = ${haushaltId} AND schluessel = ${hash}`;
      return r ? alsLink(r) : undefined;
    },
    async auskunftLinks(f = {}) {
      const r = await sql`SELECT * FROM auskunft_links WHERE haushalt_id = ${haushaltId}
        ${f.mappeId ? sql`AND mappe_id = ${istUuid(f.mappeId) ? f.mappeId : null}::uuid` : sql``}
        ${f.auskunftId ? sql`AND auskunft_id = ${istUuid(f.auskunftId) ? f.auskunftId : null}::uuid` : sql``}
        ORDER BY erstellt DESC, id LIMIT ${f.max ?? 500}`;
      return r.map(alsLink);
    },
    async auskunftLinkFehlversuch(id, max) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`UPDATE auskunft_links SET fehlversuche = fehlversuche + 1,
          gesperrt = CASE WHEN gesperrt IS NULL AND fehlversuche + 1 >= ${max} THEN now() ELSE gesperrt END
        WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING fehlversuche, gesperrt`;
      return r ? { fehlversuche: r.fehlversuche as number, gesperrt: r.gesperrt !== null } : undefined;
    },
    async auskunftLinkAbruf(id) {
      if (!istUuid(id)) return null;
      const [r] = await sql`UPDATE auskunft_links SET abrufe = abrufe + 1, abgerufen = now()
        WHERE haushalt_id = ${haushaltId} AND id = ${id} AND abrufe < max_abrufe AND ablauf > now() AND gesperrt IS NULL AND widerrufen IS NULL
        RETURNING abrufe`;
      return r ? r.abrufe as number : null;
    },
    async widerrufeAuskunftLink(id) {
      if (!istUuid(id)) return false;
      const r = await sql`UPDATE auskunft_links SET widerrufen = now() WHERE haushalt_id = ${haushaltId} AND id = ${id} AND widerrufen IS NULL RETURNING id`;
      return r.length > 0;
    },
    async favoritenDerMappe(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT benutzer_id, benachrichtigen FROM favoriten WHERE mappe_id = ${mappeId}`).map((r) => ({ benutzerId: r.benutzer_id as string, benachrichtigen: r.benachrichtigen !== false }));
    },
    async setzeFavoritBenachrichtigen(benutzerId, mappeId, an) {
      if (!istUuid(benutzerId) || !istUuid(mappeId)) return;
      await sql`UPDATE favoriten SET benachrichtigen = ${an ? null : false} WHERE benutzer_id = ${benutzerId} AND mappe_id = ${mappeId}`;
    },
    async stummeFavoriten(benutzerId, mappeIds) {
      const ids = mappeIds.filter(istUuid);
      if (!istUuid(benutzerId) || !ids.length) return new Set();
      return new Set((await sql`SELECT mappe_id FROM favoriten WHERE benutzer_id = ${benutzerId} AND mappe_id = ANY(${ids}::uuid[]) AND benachrichtigen = false`).map((r) => r.mappe_id as string));
    },
    async merkeGesehen(benutzerId, mappeIds) {
      const ids = [...new Set(mappeIds.filter(istUuid))];
      if (!istUuid(benutzerId) || !ids.length) return;
      await sql`INSERT INTO gesehen (benutzer_id, mappe_id, haushalt_id)
        SELECT ${benutzerId}::uuid, m.id, m.haushalt_id FROM mappen m WHERE m.haushalt_id = ${haushaltId} AND m.id = ANY(${ids}::uuid[])
        ON CONFLICT (benutzer_id, mappe_id) DO UPDATE SET zeit = now()`;
    },
    async geaendertVonAnderen(benutzerId, mappeIds, arten) {
      const ids = [...new Set(mappeIds.filter(istUuid))];
      if (!istUuid(benutzerId) || !ids.length) return new Set();
      // Nur die Mappen dieser Seite: Favorit oder selbst angelegt; je Mappe ein Blick in den Index historie (mappe_id, zeit).
      return new Set((await sql`
        WITH k AS (
          SELECT m.id, GREATEST(g.zeit, f.erstellt, m.erstellt) AS seit
          FROM mappen m
          LEFT JOIN favoriten f ON f.mappe_id = m.id AND f.benutzer_id = ${benutzerId}
          LEFT JOIN gesehen g ON g.mappe_id = m.id AND g.benutzer_id = ${benutzerId}
          WHERE m.haushalt_id = ${haushaltId} AND m.id = ANY(${ids}::uuid[]) AND (f.mappe_id IS NOT NULL OR m.erstellt_von = ${benutzerId})
        )
        SELECT k.id FROM k WHERE EXISTS (
          SELECT 1 FROM historie h WHERE h.mappe_id = k.id AND h.zeit > k.seit AND h.benutzer_id IS NOT NULL AND h.benutzer_id <> ${benutzerId}
            AND h.art = ANY(${[...arten]}::text[]) AND coalesce(h.daten->>'aufgabenart', '') <> 'aenderung')`).map((r) => r.id as string));
    },
    async favoritenVon(benutzerId, mappeIds) {
      const ids = mappeIds.filter(istUuid);
      if (!istUuid(benutzerId) || !ids.length) return new Set();
      return new Set((await sql`SELECT mappe_id FROM favoriten WHERE benutzer_id = ${benutzerId} AND mappe_id = ANY(${ids}::uuid[])`).map((r) => r.mappe_id as string));
    },
    /* ---------- Papierkorb (#43) ---------- */
    async legeInPapierkorb(id, benutzerId) {
      await sql.begin(async (tx) => {
        const r = await tx`
          INSERT INTO papierkorb (id, haushalt_id, typ_id, mappe, verweise, dokumente, versionen, geloescht_von, notizen, aufgaben, favoriten, erinnerungen)
          SELECT m.id, m.haushalt_id, m.typ_id, to_jsonb(m),
            (SELECT coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) FROM verweise v WHERE v.quelle_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM dokumente d WHERE d.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM dokument_versionen x JOIN dokumente d ON d.id = x.dokument_id WHERE d.mappe_id = m.id),
            ${istUuid(benutzerId) ? benutzerId : null}::uuid,
            (SELECT coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM notizen n WHERE n.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM aufgaben a WHERE a.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM favoriten f WHERE f.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM erinnerungen e WHERE e.mappe_id = m.id)
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
          SELECT m.id, m.haushalt_id, m.typ_id, to_jsonb(m),
            (SELECT coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) FROM verweise v WHERE v.quelle_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM dokumente d WHERE d.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM dokument_versionen x JOIN dokumente d ON d.id = x.dokument_id WHERE d.mappe_id = m.id),
            ${istUuid(benutzerId) ? benutzerId : null}::uuid,
            (SELECT coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM notizen n WHERE n.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM aufgaben a WHERE a.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM favoriten f WHERE f.mappe_id = m.id),
            (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM erinnerungen e WHERE e.mappe_id = m.id),
            ${vorgang}::uuid, coalesce(${json(sql, entkoppelt)}::jsonb -> (m.id::text), '[]'::jsonb)
          FROM mappen m WHERE m.haushalt_id = ${haushaltId} AND m.id = ANY(${ids}::uuid[])`;
        // Verweise untereinander zuerst (Kreise), dann die Mappen; Dokumente usw. folgen per Kaskade.
        // Verweist noch eine Mappe außerhalb darauf, scheitert alles (Fremdschlüssel) – nichts halb gelöscht.
        await tx`DELETE FROM verweise WHERE haushalt_id = ${haushaltId} AND quelle_id = ANY(${ids}::uuid[])`;
        await tx`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${ids}::uuid[])`;
      });
    },
    async papierkorb(f = {}) {
      return (await sql`
        SELECT id, typ_id, mappe, geloescht, geloescht_von, jsonb_array_length(dokumente) AS anzahl_dokumente, vorgang, entkoppelt
        FROM papierkorb WHERE haushalt_id = ${haushaltId}
          ${f.von ? sql`AND geloescht_von = ${istUuid(f.von) ? f.von : null}::uuid` : sql``}
          ${f.vor ? sql`AND geloescht < ${f.vor}` : sql``}
          ${f.typId ? sql`AND typ_id = ${istUuid(f.typId) ? f.typId : null}::uuid` : sql``}
        ORDER BY geloescht DESC, id`).map(alsPapierkorb);
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
      const r = await sql`DELETE FROM papierkorb WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) RETURNING dokumente, versionen`;
      return [...new Set<string>(r.flatMap((z: Zeile) => [...(z.dokumente as Zeile[]), ...((z.versionen as Zeile[] | null) ?? [])].map((d) => d.sha256 as string)))];
    },
    async zaehlePapierkorb(von) {
      // Mappen und einzelne Dokumente (#344).
      const [r] = await sql`SELECT
        (SELECT count(*)::int FROM papierkorb WHERE haushalt_id = ${haushaltId} ${von ? sql`AND geloescht_von = ${istUuid(von) ? von : null}::uuid` : sql``})
        + (SELECT count(*)::int FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId} ${von ? sql`AND geloescht_von = ${istUuid(von) ? von : null}::uuid` : sql``}) AS n`;
      return r.n as number;
    },
    /* Einzelne Dokumente (#344) */
    async legeDokumentInPapierkorb(id, benutzerId) {
      if (!istUuid(id)) return;
      await sql.begin(async (tx) => {
        const r = await tx`
          INSERT INTO papierkorb_dokumente (id, haushalt_id, mappe_id, dokument, versionen, geloescht_von)
          SELECT d.id, d.haushalt_id, d.mappe_id, to_jsonb(d),
            (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.nummer), '[]'::jsonb) FROM dokument_versionen x WHERE x.dokument_id = d.id),
            ${istUuid(benutzerId) ? benutzerId : null}::uuid
          FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.id = ${id}`;
        // Ältere Versionen folgen per Kaskade.
        if (r.count) await tx`DELETE FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      });
    },
    async papierkorbDokumente(f = {}) {
      const ids = (f.mappeIds ?? []).filter(istUuid);
      return (await sql`
        SELECT id, mappe_id, dokument - 'volltext' AS dokument, geloescht, geloescht_von, jsonb_array_length(versionen) AS anzahl_versionen
        FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId}
          ${f.von ? sql`AND geloescht_von = ${istUuid(f.von) ? f.von : null}::uuid` : sql``}
          ${f.vor ? sql`AND geloescht < ${f.vor}` : sql``}
          ${f.mappeIds ? sql`AND mappe_id = ANY(${ids}::uuid[])` : sql``}
        ORDER BY geloescht DESC, id`).map(alsDokPapierkorb);
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
            'archivnummer', CASE WHEN EXISTS (SELECT 1 FROM dokumente x WHERE x.haushalt_id = p.haushalt_id AND lower(x.archivnummer) = lower(p.dokument ->> 'archivnummer')) THEN 'null'::jsonb ELSE COALESCE(p.dokument -> 'archivnummer', 'null'::jsonb) END))).*
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
      const r = await sql`DELETE FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) RETURNING dokument, versionen`;
      return [...new Set<string>(r.flatMap((z: Zeile) => [(z.dokument as Zeile).sha256 as string, ...((z.versionen as Zeile[]) ?? []).map((v) => v.sha256 as string)]))];
    },
    /* ---------- Löschprotokoll (#470) ---------- */
    async papierkorbInhalt(ids) {
      const g = ids.filter(istUuid);
      if (!g.length) return [];
      const r = await sql`
        SELECT id, typ_id, mappe -> 'werte' AS werte, coalesce((mappe ->> 'demo')::boolean, false) AS demo, vorgang,
          jsonb_array_length(coalesce(entkoppelt, '[]'::jsonb)) AS entkoppelt, jsonb_array_length(coalesce(notizen, '[]'::jsonb)) AS notizen, dokumente, versionen
        FROM papierkorb WHERE haushalt_id = ${haushaltId} AND id = ANY(${g}::uuid[])`;
      return r.map((z: Zeile) => ({
        id: z.id as string, typId: z.typ_id as string, werte: (z.werte as Werte) ?? {}, demo: !!z.demo, vorgang: (z.vorgang as string | null) ?? null,
        entkoppelt: Number(z.entkoppelt), notizen: Number(z.notizen),
        dokumente: [...((z.dokumente as Zeile[]) ?? []).map(loeschDok), ...((z.versionen as Zeile[] | null) ?? []).map(loeschVersion)],
      }));
    },
    async papierkorbDokumentInhalt(ids) {
      const g = ids.filter(istUuid);
      if (!g.length) return [];
      const r = await sql`SELECT id, mappe_id, dokument - 'volltext' AS dokument, versionen FROM papierkorb_dokumente WHERE haushalt_id = ${haushaltId} AND id = ANY(${g}::uuid[])`;
      return r.map((z: Zeile) => ({ id: z.id as string, mappeId: z.mappe_id as string, dokumente: [loeschDok(z.dokument as Zeile), ...((z.versionen as Zeile[]) ?? []).map(loeschVersion)] }));
    },
    async loeschprotokollSchreibe(liste) {
      if (!liste.length) return;
      const u = (v: string | null) => (v && istUuid(v) ? v : null);
      const zeilen = liste.map((e) => ({
        id: e.id, haushalt_id: haushaltId, zeit: e.zeit, art: e.art, schritt: e.schritt, weg: e.weg, mappe_id: e.mappeId, typ_id: u(e.typId), typ_name: e.typ,
        nummer: e.nummer, archivnummer: e.archivnummer, dokument_id: u(e.dokumentId), version: e.version, sha256: e.sha256, groesse: e.groesse, mime: e.mime, seiten: e.seiten,
        anzahl: e.anzahl ? json(sql, e.anzahl) : null, von_id: u(e.vonId), von_name: e.von, ausloeser: e.ausloeser, grund: e.grund, grund_text: e.grundText,
        vorgang: u(e.vorgang), start_id: u(e.startId),
      }));
      for (let i = 0; i < zeilen.length; i += 500) await sql`INSERT INTO loeschprotokoll ${sql(zeilen.slice(i, i + 500))}`;
    },
    async loeschprotokoll(f) {
      const such = f.suche?.trim().toLowerCase();
      const bed = sql`haushalt_id = ${haushaltId}
        ${f.von ? sql`AND (zeit AT TIME ZONE 'Europe/Berlin')::date >= ${f.von}::date` : sql``}
        ${f.bis ? sql`AND (zeit AT TIME ZONE 'Europe/Berlin')::date <= ${f.bis}::date` : sql``}
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
    async dateiBenutzt(sha256) {
      const [r] = await sql`
        SELECT EXISTS (SELECT 1 FROM dokumente WHERE haushalt_id = ${haushaltId} AND sha256 = ${sha256})
          OR EXISTS (SELECT 1 FROM papierkorb_dokumente p WHERE p.haushalt_id = ${haushaltId} AND (p.dokument ->> 'sha256' = ${sha256} OR EXISTS (SELECT 1 FROM jsonb_array_elements(p.versionen) v WHERE v.value ->> 'sha256' = ${sha256})))
          OR EXISTS (SELECT 1 FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND sha256 = ${sha256})
          OR EXISTS (SELECT 1 FROM papierkorb p, jsonb_array_elements(p.dokumente) d WHERE p.haushalt_id = ${haushaltId} AND d.value ->> 'sha256' = ${sha256})
          OR EXISTS (SELECT 1 FROM papierkorb p, jsonb_array_elements(p.versionen) v WHERE p.haushalt_id = ${haushaltId} AND v.value ->> 'sha256' = ${sha256}) AS ja`;
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
        RETURNING ${DOK_RUECK}`;
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
    async ocrAuftraege({ stand, von, anzahl }) {
      const bed = stand === 'keiner' ? sql`coalesce(d.ocr_stand, 'keiner') = 'keiner'` : sql`d.ocr_stand = ${stand}`;
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM dokumente d JOIN mappen m ON m.id = d.mappe_id WHERE d.haushalt_id = ${haushaltId} AND ${bed}`;
      const r = await sql`
        SELECT ${DOK}, m.titel AS mappe_titel, m.typ_id AS mappe_typ FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
        WHERE d.haushalt_id = ${haushaltId} AND ${bed}
        ORDER BY coalesce(d.ocr_zeit, d.erstellt) DESC, d.id LIMIT ${anzahl} OFFSET ${von}`;
      return { gesamt: n as number, eintraege: r.map((x) => ({ dokument: alsDokument(x), mappeTitel: (x.mappe_titel as string) ?? '', typId: x.mappe_typ as string })) };
    },
    async ocrOhneVolltext() {
      return (await sql`
        SELECT d.id, m.typ_id, d.register_key FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
        WHERE d.haushalt_id = ${haushaltId} AND coalesce(d.ocr_stand, 'keiner') = 'keiner'`)
        .map((r: Zeile) => ({ id: r.id as string, typId: r.typ_id as string, registerKey: r.register_key as string }));
    },
    async ocrSprachen() {
      const z: Record<string, number> = {};
      for (const r of await sql`
        SELECT substring(ocr_info from ${SPRACHE_SQL_MUSTER}::text) AS s, count(*)::int AS n FROM dokumente
        WHERE haushalt_id = ${haushaltId} AND ocr_stand = 'fertig' AND ocr_info LIKE '%· Sprache: %' GROUP BY 1`) {
        if (r.s) z[r.s as string] = r.n as number;
      }
      return z;
    },
    async erkennungLies(mappeId) {
      if (!istUuid(mappeId)) return undefined;
      const [r] = await sql`SELECT ergebnis, zeit FROM erkennungen WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId}`;
      return r ? { ergebnis: r.ergebnis, zeit: (r.zeit as Date).toISOString() } : undefined;
    },
    async erkennungSchreibe(mappeId, ergebnis, absenderId) {
      if (!istUuid(mappeId)) return;
      await sql`INSERT INTO erkennungen (mappe_id, haushalt_id, absender_id, ergebnis)
        SELECT m.id, m.haushalt_id, ${absenderId && istUuid(absenderId) ? absenderId : null}::uuid, ${json(sql, ergebnis)} FROM mappen m WHERE m.haushalt_id = ${haushaltId} AND m.id = ${mappeId}
        ON CONFLICT (mappe_id) DO UPDATE SET absender_id = EXCLUDED.absender_id, ergebnis = EXCLUDED.ergebnis, zeit = now()`;
    },
    async erkennungenMitAbsender(absenderId, max) {
      if (!istUuid(absenderId)) return [];
      return (await sql`SELECT mappe_id FROM erkennungen WHERE haushalt_id = ${haushaltId} AND absender_id = ${absenderId} ORDER BY zeit DESC LIMIT ${max}`).map((r) => r.mappe_id as string);
    },
    async volltext(id) {
      if (!istUuid(id)) return null;
      const [r] = await sql`SELECT volltext FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? ((r.volltext as string | null) ?? null) : null;
    },
    async volltexte(ids) {
      const r = new Map<string, string>();
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return r;
      for (const z of await sql`SELECT id, volltext FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) AND volltext IS NOT NULL`) r.set(z.id as string, z.volltext as string);
      return r;
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
        INSERT INTO aufgaben (id, haushalt_id, mappe_id, empfaenger_id, art, text, feld_key, erstellt_von, datum)
        VALUES (${a.id}, ${haushaltId}, ${a.mappeId}, ${istUuid(a.empfaengerId) ? a.empfaengerId : null}::uuid, ${a.art}, ${a.text}, ${a.feldKey ?? null},
          ${istUuid(a.erstelltVon) ? a.erstelltVon : null}::uuid, ${a.datum ?? null}::date)
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
    async aufgabenVonMappen(mappeIds) {
      const gueltig = [...new Set(mappeIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (await sql`SELECT * FROM aufgaben WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) ORDER BY mappe_id, erledigt IS NOT NULL, erstellt DESC, id`).map(alsAufgabe);
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
    async aendereAufgabeText(id, text) {
      await sql`UPDATE aufgaben SET text = ${text} WHERE haushalt_id = ${haushaltId} AND id = ${id} AND erledigt IS NULL`;
    },
    async fristAufgaben(mappeIds) {
      const welche = mappeIds ? sql`AND a.mappe_id = ANY(${mappeIds.filter(istUuid)}::uuid[])` : sql``;
      return (await sql`
        SELECT a.*, m.titel AS mappe_titel, m.typ_id FROM aufgaben a JOIN mappen m ON m.id = a.mappe_id
        WHERE a.haushalt_id = ${haushaltId} AND a.art = 'frist' ${welche} ORDER BY a.erstellt, a.id`).map(alsAufgabe);
    },

    async umschluesseln(um, einstellungen) {
      return sql.begin(async (tx) => {
        let umgeschluesselt = 0; let unlesbar = 0;
        const zaehle = (x: { geaendert: number; unlesbar: number }) => { umgeschluesselt += x.geaendert; unlesbar += x.unlesbar; };
        const muster = '%dms1$%';
        for (const r of await tx`SELECT id, werte FROM mappen WHERE haushalt_id = ${haushaltId} AND werte::text LIKE ${muster} FOR UPDATE`) {
          const x = umschluesseleTief(r.werte, um); zaehle(x);
          if (x.geaendert) await tx`UPDATE mappen SET werte = ${tx.json(x.wert as postgres.JSONValue)} WHERE id = ${r.id}`;
        }
        for (const r of await tx`SELECT id, mappe FROM papierkorb WHERE haushalt_id = ${haushaltId} AND mappe::text LIKE ${muster} FOR UPDATE`) {
          const x = umschluesseleTief(r.mappe, um); zaehle(x);
          if (x.geaendert) await tx`UPDATE papierkorb SET mappe = ${tx.json(x.wert as postgres.JSONValue)} WHERE id = ${r.id}`;
        }
        const gesetzt = Object.keys(einstellungen);
        for (const r of await tx`SELECT schluessel, wert FROM einstellungen WHERE haushalt_id = ${haushaltId} AND wert::text LIKE ${muster} AND NOT (schluessel = ANY(${gesetzt}::text[])) FOR UPDATE`) {
          const x = umschluesseleTief(r.wert, um); zaehle(x);
          if (x.geaendert) await tx`UPDATE einstellungen SET wert = ${tx.json(x.wert as postgres.JSONValue)} WHERE haushalt_id = ${haushaltId} AND schluessel = ${r.schluessel}`;
        }
        for (const [k, w] of Object.entries(einstellungen)) {
          await tx`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, ${k}, ${tx.json(w as postgres.JSONValue)})
            ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
        }
        return { umgeschluesselt, unlesbar };
      });
    },

    async verschluesselteFundstellen() {
      // Dieselben Stellen wie umschluesseln (#410); Benutzername für die Zwei-Faktor-Anmeldung.
      const muster = '%dms1$%';
      const mappen = await sql`SELECT id, titel, werte FROM mappen WHERE haushalt_id = ${haushaltId} AND werte::text LIKE ${muster}`;
      const korb = await sql`SELECT id, mappe FROM papierkorb WHERE haushalt_id = ${haushaltId} AND mappe::text LIKE ${muster}`;
      const einst = await sql`
        SELECT e.schluessel, e.wert, coalesce(nullif(b.name, ''), b.email) AS titel FROM einstellungen e
        LEFT JOIN benutzer b ON b.haushalt_id = e.haushalt_id AND e.schluessel = 'zweifaktor_' || b.id::text
        WHERE e.haushalt_id = ${haushaltId} AND e.wert::text LIKE ${muster} ORDER BY e.schluessel`;
      return [
        ...mappen.map((r) => ({ quelle: 'mappe' as const, schluessel: String(r.id), wert: r.werte, titel: r.titel as string })),
        ...korb.map((r) => ({ quelle: 'papierkorb' as const, schluessel: String(r.id), wert: r.mappe, titel: (r.mappe as { titel?: string }).titel ?? null })),
        ...einst.map((r) => ({ quelle: 'einstellung' as const, schluessel: r.schluessel as string, wert: r.wert, titel: (r.titel as string | null) ?? null })),
      ];
    },

    /* ---------- Freie Erinnerungen (#131) ---------- */
    async erinnerungen(f = {}) {
      return (await sql`
        SELECT e.*, m.titel AS mappe_titel, m.typ_id FROM erinnerungen e JOIN mappen m ON m.id = e.mappe_id
        WHERE e.haushalt_id = ${haushaltId}
          ${f.mappeId ? sql`AND e.mappe_id = ${istUuid(f.mappeId) ? f.mappeId : null}::uuid` : sql``}
          ${f.empfaengerId ? sql`AND e.empfaenger_id = ${istUuid(f.empfaengerId) ? f.empfaengerId : null}::uuid` : sql``}
          ${f.bis ? sql`AND e.datum <= ${f.bis}::date` : sql``}
        ORDER BY e.datum, e.erstellt, e.id`).map(alsErinnerung);
    },
    async holeErinnerung(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM erinnerungen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsErinnerung(r) : undefined;
    },
    async legeErinnerungAn(e) {
      const [r] = await sql`
        INSERT INTO erinnerungen (id, haushalt_id, mappe_id, empfaenger_id, datum, text, erstellt_von)
        VALUES (${e.id}, ${haushaltId}, ${e.mappeId}, ${istUuid(e.empfaengerId) ? e.empfaengerId : null}::uuid, ${e.datum}::date, ${e.text},
          ${istUuid(e.erstelltVon) ? e.erstelltVon : null}::uuid)
        RETURNING *`;
      return alsErinnerung(r);
    },
    async aendereErinnerung(id, e) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`
        UPDATE erinnerungen SET datum = ${e.datum}::date, text = ${e.text}, empfaenger_id = ${istUuid(e.empfaengerId) ? e.empfaengerId : null}::uuid
        WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
      return r ? alsErinnerung(r) : undefined;
    },
    async loescheErinnerung(id) {
      if (istUuid(id)) await sql`DELETE FROM erinnerungen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },

    /* ---------- Notizen (#55) ---------- */
    async notizen(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT * FROM notizen WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY erstellt, id`).map(alsNotiz);
    },
    async notizenVon(mappeIds) {
      const gueltig = [...new Set(mappeIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (await sql`SELECT * FROM notizen WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) ORDER BY mappe_id, erstellt, id`).map(alsNotiz);
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
      return (await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY zeit DESC, id DESC`).map(alsHistorie);
    },
    async historieVon(mappeIds) {
      const gueltig = [...new Set(mappeIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) ORDER BY mappe_id, zeit DESC, id DESC`).map(alsHistorie);
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
      return (await sql`SELECT ${DOK} FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.sha256 = ${sha256}`).map(alsDokument);
    },
    async grossePdfs(ab, max) {
      return (await sql`
        SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere FROM dokumente d
        WHERE d.haushalt_id = ${haushaltId} AND d.mime = 'application/pdf' AND d.groesse >= ${ab}
        ORDER BY d.groesse DESC, d.id LIMIT ${max}`).map(alsDokument);
    },
    async loescheVersion(dokumentId, nummer) {
      const [r] = await sql`DELETE FROM dokument_versionen WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} AND nummer = ${nummer} RETURNING sha256`;
      return r ? r.sha256 as string : null;
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
    async loescheDemo(max) {
      return sql.begin(async (tx) => {
        const grenze = max && Number.isFinite(max) ? Math.max(1, Math.floor(max)) : null;
        const ids = (grenze
          ? await tx`SELECT id FROM mappen WHERE demo AND haushalt_id = ${haushaltId} LIMIT ${grenze}`
          : await tx`SELECT id FROM mappen WHERE demo AND haushalt_id = ${haushaltId}`).map((z) => z.id as string);
        const dateien = ids.length ? (await tx`
          SELECT DISTINCT sha256 FROM dokumente WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${ids}::uuid[])`).map((z) => z.sha256 as string) : [];
        let anzahl = 0;
        if (ids.length) {
          // Demo-Mappen verweisen aufeinander. Erst die Verweise entfernen (auch die auf dieses Paket),
          // sonst greift der Fremdschlüssel auf ziel_id vor der Kaskade.
          await tx`DELETE FROM verweise WHERE haushalt_id = ${haushaltId} AND (quelle_id = ANY(${ids}::uuid[]) OR ziel_id = ANY(${ids}::uuid[]))`;
          anzahl = (await tx`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${ids}::uuid[])`).count;
        }
        // Demo-Mappen im Papierkorb gehen mit (#43) – im letzten Paket.
        if (!grenze || ids.length < grenze) {
          const korb = await tx`DELETE FROM papierkorb WHERE haushalt_id = ${haushaltId} AND (mappe ->> 'demo')::boolean RETURNING dokumente`;
          for (const z of korb) for (const d of z.dokumente as Zeile[]) dateien.push(d.sha256 as string);
          anzahl += korb.count;
        }
        return { anzahl, dateien: [...new Set(dateien)] };
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
