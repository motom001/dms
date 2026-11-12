import type postgres from 'postgres';
import { AEHNLICH_AB, falte, normal, suchbegriffe, teilwoerter, TIPPFEHLER_MIN, type Varianten } from '../../shared/src/suche';
import { alsText } from '../../shared/src/markdown';
import { SPRACHE_MARKE, SPRACHE_SQL_MUSTER, spracheAusInfo, suchkonfig } from '../../shared/src/textsprache';
import { alsSeitensprachen, teilenAb } from '../../shared/src/seitensprachen';
import { alsLeerseiten } from '../../shared/src/leerseiten';
import { normalisiereZiele, standardliste, TREFFER_ANFANG, TREFFER_ENDE, trefferlistenVon, type Aufgabe, type Ausschnitt, type Dokument, type FallEnde, type FallOhneLeserecht, type DokumentVersion, type Herkunft, type Historienart, type Historieneintrag, type Mappe, type Notiz, type Mappentyp, type MappentypDaten, type OcrStandArt, type Werte } from '../../shared/src/model';
import { istZahlvergleich, type Filter, type Klausel, type Sicht, type SichtDaten } from '../../shared/src/sichten';
import { TAGE_JE_EINHEIT } from '../../shared/src/feldarten';
import type { Ausdruck, Lesefilter } from '../../shared/src/rechte';
import { fristMonat } from '../../shared/src/fristen';
import type { AblaufVerlauf, Ablaufvorlage, AblaufvorlageDaten, MappenAblauf } from '../../shared/src/ablaufvorlagen';
import { umschluesseleTief } from './tresor';
import { datumIn, ziehe, type Nummernkreis } from '../../shared/src/nummernkreis';
import type { Quelle } from '../../shared/src/model';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { beiVerklemmungWiederholen } from './db';
import { protokoll } from './protokoll';
import { erhoeheMappenstand, erhoeheZahlenstand, lesespeicherFuer, liesStand } from './lesespeicher';
import { dienstEmail, feldweise, istUuid, KonfigurationVeraltet, StandVeraltet, WOERTER_JE_LAUF, type AuskunftLinkIntern, type DokumentImPapierkorb, type PapierkorbEintrag, type Repo, type SeitenAnfrage, type Verweis } from './repo';
import { istSha, type LoeschDokument, type LoeschEintrag } from '../../shared/src/loeschprotokoll';
import { zeitzone } from '../../shared/src/region';
import { t } from './sprache';
import { teileKennung, typKennung } from '../../shared/src/kennungen';
import type { Notfallkontakt } from '../../shared/src/notfallkontakte';
import type { FassungArt, GespeicherteFassung } from '../../shared/src/fassungen';
/** Sprachmarke im Hinweis der Texterkennung (#395) samt Konfidenz, zum Ersetzen (#400). */
const log = protokoll.modul('texterkennung');
const SPRACHE_INFO_SQL = ' · Sprache: [a-z_]{3,10}( \\(\\d{1,3} %\\))?';

type Sql = postgres.Sql;
type Zeile = Record<string, unknown>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const isoOder = (v: unknown) => (v === null || v === undefined ? null : iso(v));
/** Zeile der Tabelle notfallkontakte (#812). */
const notfallkontaktAus = (z: Record<string, unknown>): Notfallkontakt => ({
  id: z.id as string, name: z.name as string, email: z.email as string, telefon: z.telefon as string, notiz: z.notiz as string,
  antwortAn: z.antwort_an === true, eingetragenVon: (z.eingetragen_von as string | null) ?? null, eingetragenVonName: z.eingetragen_von_name as string,
  mailStand: z.mail_stand as Notfallkontakt['mailStand'], mailAm: isoOder(z.mail_am), mailFehler: (z.mail_fehler as string | null) ?? null,
  erstellt: iso(z.erstellt), geaendert: iso(z.geaendert),
});
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
  // Paket und Schlüssel getrennt gespeichert (#1084), nach außen `paket:schluessel`.
  ...(r.schluessel ? { schluessel: typKennung(r.paket as string | null, r.schluessel as string) } : {}),
  ...(r.paket ? { paket: r.paket as string } : {}),
  beschreibung: r.beschreibung as string,
  titelVorlage: r.titel_vorlage as string,
  // Ziele (#1036): Migration 095 schreibt `zielTypen`; ältere Zeilen (etwa während eines Updates) gleicht das Lesen an.
  felder: (r.felder as Mappentyp['felder']).map(normalisiereZiele),
  register: r.register as Mappentyp['register'],
  trefferliste: (r.trefferliste as string[] | null) ?? [],
  trefferlisten: (r.trefferlisten as Mappentyp['trefferlisten'] | null) ?? undefined,
  erstellenErlaubt: r.erstellen_erlaubt !== false,
  loeschenErlaubt: r.loeschen_erlaubt !== false,
  system: (r.system as Mappentyp['system']) ?? null,
  berechtigungen: (r.berechtigungen as Mappentyp['berechtigungen']) ?? null,
  archiv: (r.archiv as Mappentyp['archiv']) ?? null,
  // Beschriftungen je Sprache (#728, Migration 080): nur, wenn es welche gibt.
  ...(r.beschriftungen ? { beschriftungen: r.beschriftungen as Mappentyp['beschriftungen'] } : {}),
  // Dokument übernehmen (#937, Migration 089): null = Vorgabe.
  ausPost: (r.aus_post as boolean | null) ?? null,
  erkennbarAn: (r.erkennbar_an as string | null) ?? '',
  // Ist Teil einer anderen Mappe (#1031, Migration 097): nur, wenn eingestellt.
  ...(r.teil_von ? { teilVon: r.teil_von as string } : {}),
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
  ...(r.vorgabe ? { vorgabe: r.vorgabe as string } : {}),
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
  // Sprache (#400): eigenes Feld; ältere Dokumente nennen sie nur im Hinweis der Texterkennung (#395).
  sprache: (r.sprache as string | null | undefined) ?? (r.ocr_stand === 'fertig' ? spracheAusInfo(r.ocr_info as string | null)?.sprache ?? null : null),
  // Mehrere Sprachen (#579): weitere Sprachen und der Hinweis „Post teilen?“ aus den Seitensprachen.
  weitereSprachen: (r.weitere_sprachen as string[] | null | undefined) ?? [],
  teilenAb: r.teilen_hinweis_aus ? null : teilenAb(alsSeitensprachen(r.seitensprachen)),
  // Leerseiten (#997): nur, wenn ein Paket oder eine Person Seiten markiert hat.
  ...(r.leerseiten ? { leerseiten: alsLeerseiten(r.leerseiten) } : {}),
  // Anlagen (#998): nur an Anlagen.
  ...(r.anlage_zu ? { anlageZu: r.anlage_zu as string, anlageNr: (r.anlage_nr as number | null) ?? null } : {}),
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
  'ocr_stand', 'ocr_info', 'ocr_seiten', 'ocr_zeit', 'version', 'herkunft', 'archivnummer', 'sprache', 'weitere_sprachen', 'seitensprachen', 'teilen_hinweis_aus', 'leerseiten',
  'anlage_zu', 'anlage_nr'] as const;
/**
 * Spalten einer Mappe ohne `suchtext` (#615): Der gefaltete Suchtext (Migration 055) ist nur für die Suche da und
 * etwa so groß wie Titel und Werte zusammen – Listen und „Mappe öffnen“ lesen ihn nie.
 */
export const MAPPEN_SPALTEN = ['id', 'haushalt_id', 'typ_id', 'werte', 'erstellt', 'geaendert', 'erstellt_von', 'geaendert_von', 'demo', 'titel', 'passt', 'problem', 'system_kennung', 'vorgabe'] as const;
/**
 * ANALYZE (#367) für Tabellen mit Volltext nur über diese Spalten: Ohne Spaltenliste rechnet PostgreSQL
 * auch die Statistik des Index `to_tsvector('german', volltext)` – über eine Minute bei 20.000 Dokumenten.
 */
export const STATISTIK_SPALTEN: Record<string, string> = {
  dokumente: t('meldungen.repopg.id-haushalt-id-mappe'),
  dokument_versionen: 'dokument_id, haushalt_id, sha256',
};
/** Spalten einer älteren Version ohne `volltext`. */
const VERSION_SPALTEN = t('meldungen.repopg.dokument-id-haushalt-id');
/**
 * Suchindex der Dokumente (#356, #400, Migration 048): gespeicherter tsvector mit Wortstämmen in der Sprache des
 * Dokuments, Umlauten gefaltet und Wörtern mit Bindestrich auch zusammengeschrieben; ein Trigger hält ihn aktuell.
 */
const SUCHINDEX_TEXT = 'd.suchindex';
type SqlTeil = postgres.PendingQuery<postgres.Row[]> | postgres.Fragment;
/**
 * Suchanfrage für den Volltext: Bei einer einfachen Suche je Begriff seine Varianten (ODER), die Begriffe mit UND;
 * mit Suchsyntax (Anführungszeichen, Minus, „or“) genau wie eingegeben.
 */
function suchanfrage(sql: Sql, t: string, v: Varianten, konfigs: string[] = ['dms_german']): SqlTeil {
  // Je Sprache der Ablage (#400) die Anfrage mit deren Wortstämmen; ein Dokument passt, wenn eine davon passt.
  return konfigs.map((konfig) => {
    const eins = (x: string) => sql`websearch_to_tsquery(${konfig}::regconfig, dms_falte(${x}::text))`;
    const b = suchbegriffe(t);
    if (!b) return eins(t);
    return b.map((w) => [w, ...(v[falte(w)] ?? [])].map(eins).reduce((x, y) => sql`(${x} || ${y})`)).reduce((x, y) => sql`(${x} && ${y})`);
  }).reduce((x, y) => sql`(${x} || ${y})`);
}
/** Ausschnitte aus dem Volltext: höchstens zwei Stellen, Treffer markiert (#45). */
const AUSSCHNITT = t('meldungen.repopg.startsel-stopsel-maxfragments-2', { TREFFER_ANFANG, TREFFER_ENDE });
const alsFall = (r: Zeile): FallOhneLeserecht => ({
  id: r.id as string, aufgabeId: r.aufgabe_id as string, mappeId: r.mappe_id as string, benutzerId: r.benutzer_id as string,
  aufgabentext: r.aufgabentext as string, beginn: iso(r.beginn), ende: isoOder(r.ende), endeGrund: (r.ende_grund as FallEnde | null) ?? null,
  leserechtSeit: isoOder(r.leserecht_seit), leserechtVon: (r.leserecht_von as string | null) ?? null,
  ...(r.typ_id ? { mappeTitel: (r.mappe_titel as string | null) ?? '', typId: r.typ_id as string } : {}),
});
const alsAufgabe = (r: Zeile): Aufgabe => ({
  id: r.id as string, mappeId: r.mappe_id as string, empfaengerId: (r.empfaenger_id as string | null) ?? null,
  art: r.art as Aufgabe['art'], text: r.text as string, feldKey: (r.feld_key as string | null) ?? null,
  ...(r.datum ? { datum: tag(r.datum) } : {}),
  ...(r.anlass ? { anlass: r.anlass as Aufgabe['anlass'] } : {}),
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
const alsAblauf = (r: Zeile): MappenAblauf => ({
  id: r.id as string, vorlage: (r.vorlage as string | null) ?? 'erinnern', mappeId: r.mappe_id as string, empfaengerId: (r.empfaenger_id as string | null) ?? null,
  datum: tag(r.datum), text: r.text as string, erstellt: iso(r.erstellt), erstelltVon: (r.erstellt_von as string | null) ?? null,
  angehalten: (r.angehalten as MappenAblauf['angehalten']) ?? null,
  ...(r.mappe_titel !== undefined ? { mappeTitel: (r.mappe_titel as string | null) ?? '', typId: r.typ_id as string } : {}),
});
const alsVorlage = (r: Zeile): Ablaufvorlage => {
  const d = (r.daten ?? {}) as Partial<AblaufvorlageDaten>;
  return {
    kennung: r.kennung as string, name: r.name as string, reihenfolge: Number(r.reihenfolge), beschreibung: d.beschreibung ?? '', typen: d.typen ?? [],
    wann: d.wann ?? { art: 'sofort' }, fragen: d.fragen ?? [], karten: d.karten ?? [], aktiv: r.aktiv as boolean,
    herkunft: r.herkunft as Ablaufvorlage['herkunft'], paketId: (r.paket_id as string | null) ?? null, version: Number(r.version),
    geaendert: iso(r.geaendert), geaendertVon: (r.geaendert_von as string | null) ?? null,
  };
};
const alsVerlauf = (r: Zeile): AblaufVerlauf => ({
  id: r.id as string, vorlage: r.vorlage as string, mappeId: (r.mappe_id as string | null) ?? null, ablaufId: (r.ablauf_id as string | null) ?? null,
  personId: (r.person_id as string | null) ?? null, zeit: iso(r.zeit), art: r.art as AblaufVerlauf['art'], text: (r.text as string) ?? '',
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
    ...(d.anlage_zu ? { anlageZu: d.anlage_zu as string } : {}),
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
/** Eine Zeile der Tabelle fassungen (#1006). */
const alsFassung = (r: postgres.Row): GespeicherteFassung => ({
  art: r.art as FassungArt, eintrag: r.eintrag as string, nr: Number(r.nr), name: r.name as string, daten: r.daten, urheber: r.urheber as GespeicherteFassung['urheber'],
  vorgang: (r.vorgang as string | null) ?? null, wiederhergestellt: r.wiederhergestellt == null ? null : Number(r.wiederhergestellt),
  zeit: iso(r.zeit), bis: iso(r.bis), geloescht: (r.geloescht as GespeicherteFassung['geloescht']) ?? null,
});

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
  symbol: (r.symbol as string | null) ?? null,
  ...(r.beschriftungen ? { beschriftungen: r.beschriftungen as Sicht['beschriftungen'] } : {}),
  erstellt: iso(r.erstellt),
  geaendert: iso(r.geaendert),
});

/* ---------- Bedingungen einer Sicht als SQL (#38, #40, #41) ---------- */

type Teil = postgres.PendingQuery<postgres.Row[]> | postgres.Fragment;

/**
 * Länge eines Zeitraums in Tagen (#1035) wie `zeitraumTage` in shared/src/feldarten.ts: Monat 30,4375, Jahr 365,25
 * Tage. Ohne Zahl oder mit unbekannter Einheit NULL.
 */
function zeitraumTageSql(sql: Sql, werte: Teil, k: string) {
  const t = TAGE_JE_EINHEIT;
  return sql`(CASE WHEN jsonb_typeof(${werte} -> ${k}::text -> 'anzahl') = 'number' THEN (${werte} -> ${k}::text ->> 'anzahl')::numeric * (CASE ${werte} -> ${k}::text ->> 'einheit' WHEN 'tage' THEN ${t.tage}::numeric WHEN 'wochen' THEN ${t.wochen}::numeric WHEN 'monate' THEN ${t.monate}::numeric WHEN 'jahre' THEN ${t.jahre}::numeric END) END)`;
}

/** Wert eines Feldes als vergleichbarer SQL-Ausdruck; ungültige Werte werden NULL. */
function ausdruck(sql: Sql, f: Extract<Filter, { art: 'feld' }>) {
  const k = f.key;
  switch (f.key) {
    case '_erstellt': return sql`(mappen.erstellt AT TIME ZONE ${zeitzone()})::date`;
    case '_geaendert': return sql`(mappen.geaendert AT TIME ZONE ${zeitzone()})::date`;
    case '_erstelltVon': return sql`mappen.erstellt_von::text`;
    case '_geaendertVon': return sql`mappen.geaendert_von::text`;
  }
  switch (f.feldart) {
    case 'zahl': return sql`(CASE WHEN jsonb_typeof(mappen.werte -> ${k}::text) = 'number' THEN (mappen.werte ->> ${k}::text)::numeric END)`;
    case 'betrag': return sql`(CASE WHEN jsonb_typeof(mappen.werte -> ${k}::text -> 'betrag') = 'number' THEN (mappen.werte -> ${k}::text ->> 'betrag')::numeric END)`;
    case 'prozent': return sql`(CASE WHEN jsonb_typeof(mappen.werte -> ${k}::text) = 'number' THEN (mappen.werte ->> ${k}::text)::numeric END)`;
    case 'zeitraum': return zeitraumTageSql(sql, sql`mappen.werte`, k);
    case 'datum': return sql`(CASE WHEN mappen.werte ->> ${k}::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (mappen.werte ->> ${k}::text)::date END)`;
    default: return sql`nullif(mappen.werte ->> ${k}::text, '')`;
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
    case 'gleich': return f.feldart === 'text' || f.feldart === 'zusammengesetzt' ? sql`lower(${x}) = lower(${String(f.a ?? '')})` : sql`${x} = ${wert(f.a)}`;
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
  if (f.art === 'zieltyp') {
    // „zeigt auf Mappe vom Typ …“ (#1036) über die Verweise; `ausser`: auf eine Mappe, deren Typ keiner davon ist.
    const typ = f.ausser ? sql`zm.typ_id::text <> ALL(${f.typen}::text[])` : sql`zm.typ_id::text = ANY(${f.typen}::text[])`;
    return sql`EXISTS (SELECT 1 FROM verweise v JOIN mappen zm ON zm.id = v.ziel_id WHERE v.quelle_id = mappen.id AND v.feld_key = ${f.key} AND ${typ})`;
  }
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
function eingangSql(sql: Sql, haushaltId: string, ich: string | null, ohneEmpfaenger: boolean): Teil {
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
function nurFavoritenVon(klauseln: Klausel[]): string | null {
  const wirksam = klauseln.filter((k) => k.typen.some(istUuid));
  if (!wirksam.length) return null;
  const je = wirksam.map((k) => k.filter.find((f): f is Extract<Filter, { art: 'favorit' }> => f.art === 'favorit' && istUuid(f.benutzer))?.benutzer ?? null);
  return je.every((b) => b && b === je[0]) ? je[0] : null;
}

/** ODER der Klauseln; jede Klausel: Typ passt UND alle Filter. Ohne Klauseln: nichts. */
export function klauselnSql(sql: Sql, klauseln: Klausel[]): Teil {
  const teile = klauseln.filter((k) => k.typen.some(istUuid)).map((k) => {
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
    case 'wahr': return sql`true`;
    case 'falsch': return sql`false`;
    // Ein Feld ohne Wert ergibt in SQL NULL, im Arbeitsspeicher „trifft nicht zu“ (rechte.ts, werte). Ohne coalesce
    // machte ein „nicht“ daraus wieder NULL – eine entziehende Regel auf ein leeres Feld (z. B. die mitgenommenen Regeln
    // nach einem Paket-Umbau, #1041) sperrte dann in Listen auch Mappen, die sie gar nicht betrifft.
    case 'filter': return sql`coalesce((${filterSql(sql, x.f)}), false)`;
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
  if (offen.length) teile.push(typIn(sql, offen));
  for (const j of f.je) if (istUuid(j.typId)) teile.push(sql`(mappen.typ_id = ${j.typId}::uuid AND ${ausdruckSql(sql, j.ausdruck)})`);
  if (!teile.length) return sql`false`;
  return sql`(${teile.slice(1).reduce<Teil>((acc, t) => sql`${acc} OR ${t}`, teile[0])})`;
}

/** PostgreSQL-Umsetzung für genau einen Haushalt. */
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

function inTransaktion(tx: postgres.TransactionSql): Sql {
  return new Proxy(tx, {
    get(ziel, prop, empfaenger) {
      if (prop === 'begin') return (...args: unknown[]) => ziel.savepoint(args[args.length - 1] as (s: postgres.TransactionSql) => Promise<unknown>);
      return Reflect.get(ziel, prop, empfaenger);
    },
  }) as unknown as Sql;
}

/**
 * real[] im Binärformat von PostgreSQL (array_send): Kopf mit Dimensionen, Flags, Typ, Länge, Untergrenze,
 * dann je Wert Länge (4) und float4 (big-endian). Nur eindimensional ohne NULL (so legt vektorSetze sie an).
 */
export function realArray(b: Buffer): Float32Array {
  const ndim = b.readInt32BE(0);
  if (ndim === 0) return new Float32Array(0);
  const n = b.readInt32BE(12);
  const v = new Float32Array(n);
  for (let i = 0, p = 20; i < n; i++, p += 8) v[i] = b.readFloatBE(p + 4);
  return v;
}

/**
 * `imTx`: Repo innerhalb einer Transaktion – dort nie aus dem Lesespeicher (#741), denn die Transaktion sieht ihre
 * eigenen, noch nicht abgeschlossenen Änderungen, der Haushaltsstand zählt aber erst beim Abschluss.
 */
export function pgRepo(sql: Sql, haushaltId: string, imTx = false): Repo {
  /** Mappentypen, Ansichten und Pakete (#741): für alle gleich, gültig bei gleichem Haushaltsstand `lesen`. */
  const gemerkt = <T>(schluessel: string, lade: () => Promise<T>): Promise<T> => (imTx ? lade() : lesespeicherFuer(sql, haushaltId).hole(schluessel, lade));
  const alleTypen = () => gemerkt('typen', async () => (await sql`SELECT * FROM mappentypen WHERE haushalt_id = ${haushaltId} ORDER BY lower(name)`).map(alsTyp));
  // Dokumente immer mit ausdrücklichen Spalten, nie `d.*` (#367): sonst kommt der Volltext mit.
  const DOK = sql.unsafe(DOKUMENT_SPALTEN.map((c) => `d.${c}`).join(', '));
  const DOK_RUECK = sql.unsafe(DOKUMENT_SPALTEN.join(', '));
  // Mappen ebenso ohne `suchtext` (#615).
  const MAP = sql.unsafe(MAPPEN_SPALTEN.join(', '));
  const SUCHINDEX = sql.unsafe(SUCHINDEX_TEXT);
  // „Zuletzt geändert“ (#609): auf Millisekunden genau (wie in der API) und bei jedem Schreiben größer als vorher.
  const STAND_WEITER = sql.unsafe(t('meldungen.repopg.greatest-date-trunc-milliseconds'));
  /**
   * Suchkonfigurationen der Sprachen, die in der Ablage vorkommen (#400): Deutsch immer, dazu die der Dokumente.
   * Eine Minute gemerkt; neu, sobald eine Sprache gesetzt wird. Lockerer Indexlauf über (haushalt_id, sprache), dazu
   * die weiteren Sprachen mehrsprachiger Dokumente (#579, Teilindex – nur diese wenigen Zeilen).
   */
  let sprachenZwischen: { zeit: number; konfigs: Promise<string[]> } | null = null;
  const sprachKonfigs = () => {
    if (!sprachenZwischen || Date.now() - sprachenZwischen.zeit > 60_000) {
      sprachenZwischen = { zeit: Date.now(), konfigs: sql`
        WITH RECURSIVE s AS (
          (SELECT sprache FROM dokumente WHERE haushalt_id = ${haushaltId} AND sprache IS NOT NULL ORDER BY sprache LIMIT 1)
          UNION ALL
          SELECT (SELECT d.sprache FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.sprache > s.sprache ORDER BY d.sprache LIMIT 1) FROM s WHERE s.sprache IS NOT NULL)
        SELECT sprache FROM s WHERE sprache IS NOT NULL
        UNION
        SELECT DISTINCT unnest(weitere_sprachen) FROM dokumente WHERE haushalt_id = ${haushaltId} AND weitere_sprachen IS NOT NULL`
        .then((r) => [...new Set(['dms_german', ...r.map((z) => suchkonfig(z.sprache as string))])], () => ['dms_german']) };
    }
    return sprachenZwischen.konfigs;
  };
  /**
   * Suchanfrage über alle Sprachen der Ablage (#400) als feste tsquery: Die Anfragen je Sprache rechnet PostgreSQL
   * vorab aus, gleiche fallen weg – sonst läse der Index bei häufigen Wörtern dieselben Listen mehrfach.
   */
  // Ergebnis in einem Objekt: Ein sql-Fragment ist „thenable“ – aus einer async-Funktion zurückgegeben, liefe es los.
  const tsAnfrage = async (t: string, v: Varianten): Promise<{ q: SqlTeil }> => {
    const konfigs = await sprachKonfigs();
    if (konfigs.length === 1) return { q: suchanfrage(sql, t, v, konfigs) };
    const [z] = await sql`SELECT ARRAY[${konfigs.map((k) => sql`${suchanfrage(sql, t, v, [k])}::text`).reduce((a, b) => sql`${a}, ${b}`)}] AS q`;
    return { q: [...new Set(z.q as string[])].map((q) => sql`${q}::tsquery`).reduce((a, b) => sql`(${a} || ${b})`) };
  };
  /** Schema von pg_trgm (#356), einmal nachgesehen; null ohne Erweiterung. */
  let trgmSchema: Promise<string | null> | null = null;
  const trigrammSchema = () => (trgmSchema ??= sql`SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'`
    .then((r) => (r[0] ? `"${String(r[0].nspname).replace(/"/g, '""')}"` : null), () => null));
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

  /** Treffermenge und Textfilter (#740) samt übergeordneten Mappen, die über ihre Teile gefunden wurden (#1031). */
  const mitTeilen = (roh: Teil | null, tf: Teil | null, auch: string[]) => ({
    treffer: roh && auch.length ? sql`${roh} UNION SELECT unnest(${auch}::uuid[])` : roh,
    textfilter: !tf ? sql`` : auch.length ? sql`AND (mappen.id IN (${tf}) OR mappen.id = ANY(${auch}::uuid[]))` : sql`AND mappen.id IN (${tf})`,
  });

  /**
   * Bedingungen einer Seite (#740): `wo` (Typ, Eingang/Favoriten, Textfilter der erweiterten Suche, Lesefilter – je mit
   * AND davor) und, mit Suche, `treffer`: die Ids der Mappen, die den Begriff enthalten, als eine Menge (UNION aus
   * Mappe, Notizen und Dokumenten). Jede Teilmenge nutzt ihren Index (Trigramm auf suchtext, Notizen, Suchindex
   * der Dokumente) – mit OR in einer Bedingung über alle Mappen ginge das nicht. Gleiche Treffer wie vorher.
   */
  const seitenTeile = async (o: SeitenAnfrage) => {
    const typ = o.klauseln ? sql`AND (${klauselnSql(sql, o.klauseln)})`
      : o.typId && istUuid(o.typId) ? sql`AND typ_id = ${o.typId}` : o.typId ? sql`AND false` : sql``;
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
    const schreibweisen = (t: string) => { const b = suchbegriffe(t); return b?.length === 1 ? [t, ...(v[falte(b[0])] ?? [])] : [t]; };
    const enthaelt = (spalte: Teil, t: string) => schreibweisen(t)
      .map((x) => sql`replace(lower(dms_falte(${spalte})), '-', '') LIKE ${musterAus(normal(x))}`).reduce((a, b) => sql`${a} OR ${b}`);
    // Teilwörter im Volltext (#161): „Ofen“ findet „Backofen“ – zusätzlich zu den Wortformen; je Wort auch die Varianten.
    const teilSql = (spalte: string, teil: string[]) => teil.map((w) => [w, ...(nurV[falte(w)] ?? []).map((x) => x.toLowerCase()).filter((x) => x.length >= 3)]
      .map((x) => sql`${sql.unsafe(spalte)} ILIKE ${musterAus(x)}`).reduce((a, b) => sql`${a} OR ${b}`))
      .reduce((a, b) => sql`(${a}) AND (${b})`);
    // Ids der Mappen mit dem Begriff in einer Notiz bzw. einem Dokument – einmal über die Indizes (#356).
    const inNotizen = (t: string) => sql`SELECT n.mappe_id FROM notizen n WHERE n.haushalt_id = ${haushaltId} AND (${enthaelt(sql`n.text`, t)})`;
    const inDokumenten = (t: string) => {
      const teil = teilwoerter(t);
      return sql`SELECT d.mappe_id FROM dokumente d WHERE d.haushalt_id = ${haushaltId}
        AND (${SUCHINDEX} @@ ${anfragen.get(t) ?? suchanfrage(sql, t, v)}${teil ? sql` OR (${teilSql('d.volltext', teil)})` : sql``})`;
    };
    // Vorfilter (#615, #740): Titel und Werte stehen gefaltet in suchtext (Migration 055, nie leer seit 075) – was in
    // einem davon vorkommt, kommt auch dort vor; der Trigramm-Index findet diese Mappen. Danach wird je Titel und Wert
    // genau verglichen (dieselben Treffer wie vorher), aber nur noch für die wenigen Mappen, die den Begriff enthalten.
    const vorfilter = (t: string) => schreibweisen(t)
      .map((x) => sql`mappen.suchtext LIKE ${musterAus(normal(x))}`).reduce((a, b) => sql`${a} OR ${b}`);
    const inMappen = (t: string) => sql`SELECT mappen.id FROM mappen WHERE mappen.haushalt_id = ${haushaltId} AND (${vorfilter(t)})
      AND (${enthaelt(sql`titel`, t)} OR EXISTS (SELECT 1 FROM jsonb_each_text(werte) e WHERE e.value NOT LIKE 'dms1$%' AND (${enthaelt(sql`e.value`, t)})))`;
    const vereint = (teile: Teil[]) => teile.reduce((a, b) => sql`${a} UNION ${b}`);
    const suche = o.suche
      ? vereint([inMappen(o.suche), ...(o.notizen ? [inNotizen(o.suche)] : []), ...(o.volltext ? [inDokumenten(o.suche)] : [])])
      : null;
    // Erweiterte Suche (#199): Begriff in Dokumenten oder Notizen, zusätzlich zu allen anderen Bedingungen.
    const tf = o.textfilter?.text.trim() && (o.textfilter.dokumente || o.textfilter.notizen) ? o.textfilter : null;
    const tfMenge = tf ? vereint([...(tf.dokumente ? [inDokumenten(tf.text)] : []), ...(tf.notizen ? [inNotizen(tf.text)] : [])]) : null;
    // Ohne Suche ist der Textfilter die Treffermenge; mit Suche eine weitere Bedingung. Teile (#1031): übergeordnete
    // Mappen, in deren Teilen der Begriff steht (auchIds), zählen für beides als Treffer.
    const { treffer, textfilter } = mitTeilen(suche ?? tfMenge, suche && tfMenge, (o.auchIds ?? []).filter(istUuid));
    // Berechtigungen (#124): nur, was der Benutzer lesen darf.
    const lesen = o.lesen ? sql`AND ${lesefilterSql(sql, o.lesen)}` : sql``;
    const wo = sql`${typ} ${eingang} ${textfilter} ${lesen}`;
    const so = o.sortierung;
    const k = so?.key ?? '';
    const ausdruck = !so || so.art === 'titel' ? sql`lower(titel)`
      : so.art === 'erstellt' ? sql`erstellt` : so.art === 'geaendert' ? sql`geaendert`
      : so.art === 'erstelltVon' ? sql`(SELECT lower(coalesce(nullif(b.name, ''), b.email)) FROM benutzer b WHERE b.id = mappen.erstellt_von)`
      : so.art === 'geaendertVon' ? sql`(SELECT lower(coalesce(nullif(b.name, ''), b.email)) FROM benutzer b WHERE b.id = mappen.geaendert_von)`
      : so.art === 'typ' ? sql`(SELECT lower(t.name) FROM mappentypen t WHERE t.id = mappen.typ_id)`
      // Zahl und Prozent (#1035) als Zahl: Ein gespeichertes null (JSON) stünde sonst vor allen Zahlen statt zuletzt.
      : so.art === 'zahl' ? sql`(CASE WHEN jsonb_typeof(werte -> ${k}::text) = 'number' THEN (werte ->> ${k}::text)::numeric END)`
      : so.art === 'janein' ? sql`(werte -> ${k}::text)`
      : so.art === 'betrag' ? sql`((werte -> ${k}::text ->> 'betrag')::numeric)`
      : so.art === 'zeitraum' ? zeitraumTageSql(sql, sql`werte`, k)
      : so.art === 'datum' ? sql`(werte ->> ${k}::text)`
      : sql`lower(werte ->> ${k}::text)`;
    // Leere Werte zuletzt. erstellt und geaendert sind nie leer (NOT NULL), ohne „NULLS LAST“ liest PostgreSQL ihren
    // Index auch rückwärts (#740). Ebenso Titel absteigend: Ein Titel fehlt nur kurz vor dem ersten Berechnen.
    const ohneLeere = !so || ['titel', 'erstellt', 'geaendert'].includes(so.art);
    const richtung = so?.absteigend ? (ohneLeere ? sql`DESC` : sql`DESC NULLS LAST`) : sql`ASC NULLS LAST`;
    return { wo, treffer, ausdruck, richtung, tf, enthaelt, schreibweisen, anfragen, v, teilSql };
  };

  return {
    transaktion(f) {
      return sql.begin((tx) => f(pgRepo(inTransaktion(tx), haushaltId, true))) as Promise<Awaited<ReturnType<typeof f>>>;
    },
    async listeTypen() { return alleTypen(); },
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
        INSERT INTO mappentypen (id, haushalt_id, name, paket, schluessel, beschreibung, titel_vorlage, felder, register, trefferliste, trefferlisten, erstellen_erlaubt, loeschen_erlaubt, system, archiv, beschriftungen, aus_post, erkennbar_an, teil_von)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${k.paket}, ${k.schluessel}, ${d.beschreibung}, ${d.titelVorlage}, ${json(sql, d.felder)}, ${json(sql, d.register)}, ${json(sql, standardliste(d).spalten)}, ${json(sql, trefferlistenVon(d))},
          ${d.erstellenErlaubt !== false}, ${d.loeschenErlaubt !== false}, ${system ?? null}, ${d.archiv ? json(sql, d.archiv) : null}, ${d.beschriftungen ? json(sql, d.beschriftungen) : null},
          ${typeof d.ausPost === 'boolean' ? d.ausPost : null}, ${d.erkennbarAn ?? ''}, ${d.teilVon || null})
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
            teil_von = ${d.teilVon || null}, geaendert = ${STAND_WEITER}
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
        ? (istUuid(typId) ? await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} AND typ_id = ${typId} ORDER BY erstellt` : [])
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
      const von = fristMonat(ab); const ende = fristMonat(bis);
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
      return r.map((z) => ({ id: z.id as string, typId: z.typ_id as string, titel: (z.titel as string | null) ?? null, werte: (z.werte ?? {}) as Werte }));
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
      const [r] = await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
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
          RETURNING ${MAP}`;
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
      return gemerkt('pakete', async () => (await sql`SELECT daten FROM pakete WHERE haushalt_id = ${haushaltId} ORDER BY id`).map((r) => r.daten as InstalliertesPaket));
    },
    async speicherePaket(p) {
      await sql`
        INSERT INTO pakete (haushalt_id, id, version, daten, installiert) VALUES (${haushaltId}, ${p.id}, ${p.version}, ${json(sql, p)}, ${p.installiert})
        ON CONFLICT (haushalt_id, id) DO UPDATE SET version = EXCLUDED.version, daten = EXCLUDED.daten`;
    },
    async loeschePaket(id) { await sql`DELETE FROM pakete WHERE haushalt_id = ${haushaltId} AND id = ${id}`; },
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
        for (const d of dateien) await tx`INSERT INTO paket_code (haushalt_id, paket_id, name, inhalt) VALUES (${haushaltId}, ${id}, ${d.name}, ${d.inhalt})`;
      });
    },
    async paketCode(id) {
      return (await sql`SELECT name, inhalt FROM paket_code WHERE haushalt_id = ${haushaltId} AND paket_id = ${id} ORDER BY name`).map((r) => ({ name: r.name as string, inhalt: Buffer.from(r.inhalt as Uint8Array) }));
    },
    async loeschePaketCode(id) { await sql`DELETE FROM paket_code WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`; },
    async speichereSprachpaket(id, d) {
      await sql`
        INSERT INTO paket_sprachen (haushalt_id, paket_id, kennung, texte, paketbeschriftungen) VALUES (${haushaltId}, ${id}, ${d.kennung}, ${json(sql, d.texte)}, ${json(sql, d.beschriftungen)})
        ON CONFLICT (haushalt_id, paket_id) DO UPDATE SET kennung = EXCLUDED.kennung, texte = EXCLUDED.texte, paketbeschriftungen = EXCLUDED.paketbeschriftungen`;
    },
    async sprachpakete() {
      return (await sql`SELECT paket_id, kennung, texte, paketbeschriftungen FROM paket_sprachen WHERE haushalt_id = ${haushaltId} ORDER BY paket_id`)
        .map((r) => ({ paketId: r.paket_id as string, kennung: r.kennung as string, texte: r.texte as import('../../shared/src/sprachpaket').Sprachtexte, beschriftungen: r.paketbeschriftungen as Record<string, import('../../shared/src/sprachpaket').SprachBeschriftung> }));
    },
    async loescheSprachpaket(id) { await sql`DELETE FROM paket_sprachen WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`; },
    async legeEreignisseAn(liste) {
      if (!liste.length) return;
      // Gleiche Id = schon angelegt (#670: Ereignisse aus dem Katalog kommen mindestens einmal).
      await sql`INSERT INTO paket_ereignisse ${sql(liste.map((e) => ({ id: e.id, haushalt_id: haushaltId, paket_id: e.paketId, art: e.art, daten: json(sql, e.daten) })))} ON CONFLICT (id) DO NOTHING`;
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
        FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} GROUP BY paket_id`) erg[r.paket_id as string] = { offen: r.offen as number, aufgegeben: r.aufgegeben as number, zugestellt: r.zugestellt as number, zuletzt: r.zuletzt ? (r.zuletzt as Date).toISOString() : null };
      return erg;
    },
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
      return (await sql`UPDATE ereignisse SET gesperrt_bis = now() + make_interval(secs => ${sperreS})
        WHERE haushalt_id = ${haushaltId} AND id IN (SELECT id FROM ereignisse WHERE haushalt_id = ${haushaltId} AND verteilt IS NULL
          AND faellig <= now() AND (gesperrt_bis IS NULL OR gesperrt_bis < now()) ORDER BY nr LIMIT ${anzahl} FOR UPDATE SKIP LOCKED)
        RETURNING id, nr, art, daten, ausloeser, erstellt, versuche`)
        .map((r) => ({ id: r.id as string, nr: Number(r.nr), art: r.art as string, daten: r.daten as Record<string, unknown>, ausloeser: r.ausloeser as Record<string, unknown>, erstellt: (r.erstellt as Date).toISOString(), versuche: r.versuche as number }))
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
      return { offen: r.offen as number, aufgegeben: r.aufgegeben as number, verteilt: r.verteilt as number, aeltestesOffen: r.aeltestes ? (r.aeltestes as Date).toISOString() : null };
    },
    async merkeFristMeldung(f) {
      const r = await sql`INSERT INTO frist_meldungen (haushalt_id, mappe_id, feld, datum, zeitpunkt)
        VALUES (${haushaltId}, ${f.mappeId}, ${f.feld}, ${f.datum}, ${f.zeitpunkt}) ON CONFLICT DO NOTHING RETURNING 1`;
      return r.length > 0;
    },
    async loescheEreignisse(id) { await sql`DELETE FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} AND paket_id = ${id}`; },
    async loescheOffeneEreignisse(art, dokumente) {
      if (!dokumente.length) return 0;
      const r = await sql`DELETE FROM paket_ereignisse WHERE haushalt_id = ${haushaltId} AND art = ${art} AND zugestellt IS NULL AND daten->>'dokument' = ANY(${dokumente}::text[])`;
      return r.count;
    },
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
        // FOR NO KEY UPDATE (#928): sperrt gegen andere Änderungen der Mappe, nicht gegen neue Aufgaben, Notizen, Historie
        // und Favoriten (deren Fremdschlüssel prüft mit FOR KEY SHARE – das wartete bei FOR UPDATE bis zum Ende).
        const [m] = await tx`SELECT werte FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${mappeId} FOR NO KEY UPDATE`;
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
    async aendereMappe(id, werte, vs, benutzerId, fw) {
      return sql.begin(async (tx) => {
        let neu = werte; let verweise = vs;
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
      return (await sql`SELECT ${MAP} FROM mappen WHERE haushalt_id = ${haushaltId} AND left(vorgabe, ${praefix.length}) = ${praefix}`).map(alsMappe);
    },
    async loescheMappe(id) {
      await sql`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
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
      const { wo, treffer, ausdruck, richtung, tf, enthaelt, schreibweisen, anfragen, v, teilSql } = await seitenTeile(o);
      let n: number | undefined;
      let r: postgres.Row[];
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
        if (n === undefined) [{ n }] = await sql`SELECT count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} AND id IN (SELECT id FROM (${treffer}) AS t(id)) ${wo}`;
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
      const fund = o.suche && (o.volltext || o.notizen) ? { text: o.suche, volltext: !!o.volltext, notizen: !!o.notizen }
        : tf ? { text: tf.text.trim(), volltext: tf.dokumente, notizen: tf.notizen } : null;
      if (!fund || !mappen.length) return { gesamt: n as number, mappen };
      const ausschnitte: Record<string, Ausschnitt> = {};
      if (fund.notizen) {
        const nz = await sql`SELECT mappe_id, text FROM notizen n WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${mappen.map((m) => m.id)}::uuid[]) AND (${enthaelt(sql`n.text`, fund.text)}) ORDER BY erstellt`;
        for (const z of nz) {
          const klar = alsText(z.text as string);
          const t = schreibweisen(fund.text).map((x) => ausschnittAus(klar, x)).find(Boolean);
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
        typen: new Map(r.map((z) => [z.typ_id as string, { anzahl: z.anzahl as number, unpassend: z.unpassend as number, demo: z.demo as number }])),
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
        typen: new Map(r.map((z) => [z.typ_id as string, { anzahl: z.anzahl as number, unpassend: z.unpassend as number, demo: z.demo as number }])),
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
      liste.forEach((k, i) => { const g = nurFavoritenVon(k) ?? ''; gruppen.set(g, [...(gruppen.get(g) ?? []), i]); });
      const teile = [...gruppen].flatMap(([fav, idx], g) => {
        const typIds = [...new Set(idx.flatMap((i) => liste[i].flatMap((k) => k.typen)))].filter(istUuid);
        if (!typIds.length) return [];
        const spalten = idx.map((i) => sql`count(*) FILTER (WHERE ${klauselnSql(sql, liste[i])})::int`);
        const nurFav = fav ? sql`AND id IN (SELECT mappe_id FROM favoriten WHERE benutzer_id = ${fav}::uuid)` : sql``;
        return [{ idx, teil: sql`, (SELECT ARRAY[${spalten.slice(1).reduce((acc, t) => sql`${acc}, ${t}`, spalten[0])}] FROM mappen
            WHERE haushalt_id = ${haushaltId} AND typ_id = ANY(${typIds}::uuid[]) ${nurFav} ${lesen}) AS ${sql(`s${g}`)}` }];
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
      [...gruppen].forEach(([, idx], g) => { const w = (r[`s${g}`] as number[] | undefined) ?? []; idx.forEach((i, j) => n.set(i, Number(w[j] ?? 0))); });
      return { eingang: r.eingang as number, favoriten: r.favoriten as number, papierkorb: r.papierkorb as number, sichten: liste.map((_, i) => n.get(i) ?? 0) };
    },
    async haushaltsstand() { return liesStand(sql, haushaltId, 'zahlen'); },
    async erhoeheHaushaltsstand() { return erhoeheZahlenstand(sql); },
    async mappenstand() { return liesStand(sql, haushaltId, 'mappen'); },
    async erhoeheMappenstand() { return erhoeheMappenstand(sql); },
    async zaehleKlauseln(liste, lesefilter) {
      if (!liste.length) return [];
      const spalten = liste.map((k, i) => sql`count(*) FILTER (WHERE ${klauselnSql(sql, k)})::int AS ${sql(`s${i}`)}`);
      const sel = spalten.slice(1).reduce((acc, t) => sql`${acc}, ${t}`, spalten[0]);
      const lesen = lesefilter ? sql`AND ${lesefilterSql(sql, lesefilter)}` : sql``;
      const [r] = await sql`SELECT ${sel} FROM mappen WHERE haushalt_id = ${haushaltId} ${lesen}`;
      return liste.map((_, i) => r[`s${i}`] as number);
    },

    async listeSichten() {
      return gemerkt('sichten', async () => (await sql`SELECT * FROM sichten WHERE haushalt_id = ${haushaltId} ORDER BY position, lower(name)`).map(alsSicht));
    },
    async legeSichtAn(id, d: SichtDaten) {
      const [r] = await sql`
        INSERT INTO sichten (id, haushalt_id, name, beschreibung, eltern_id, position, typen, bedingungen, trefferliste, berechtigungen, symbol, beschriftungen)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${d.beschreibung}, ${d.elternId}, ${d.position}, ${json(sql, d.typen)}, ${json(sql, d.bedingungen)}, ${d.trefferliste ?? null}, ${d.berechtigungen ? json(sql, d.berechtigungen) : null}, ${d.symbol ?? null}, ${d.beschriftungen ? json(sql, d.beschriftungen) : null})
        RETURNING *`;
      return alsSicht(r);
    },
    async aendereSicht(id, d: SichtDaten, erwartet) {
      const schreibe = async (q: typeof sql) => {
        const [r] = await q`
          UPDATE sichten SET name = ${d.name}, beschreibung = ${d.beschreibung}, eltern_id = ${d.elternId}, position = ${d.position},
            typen = ${json(sql, d.typen)}, bedingungen = ${json(sql, d.bedingungen)}, trefferliste = ${d.trefferliste ?? null},
            berechtigungen = ${d.berechtigungen ? json(sql, d.berechtigungen) : null}, symbol = ${d.symbol ?? null}, beschriftungen = ${d.beschriftungen ? json(sql, d.beschriftungen) : null}, geaendert = ${STAND_WEITER}
          WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
        return alsSicht(r);
      };
      if (erwartet === undefined) return schreibe(sql);
      // Gleichzeitig bearbeitet (#917): nur auf dem Stand, auf dem die Bearbeitung beruht.
      return sql.begin(async (tx) => {
        const [a] = await tx`SELECT geaendert FROM sichten WHERE haushalt_id = ${haushaltId} AND id = ${id} FOR UPDATE`;
        if (a && iso(a.geaendert) !== erwartet) throw new KonfigurationVeraltet();
        return schreibe(tx as unknown as typeof sql);
      });
    },
    async setzeSichtOrt(id, elternId, position) {
      // Nur der Wechsel der Elternsicht ist eine Änderung der Ansicht (#917); Umnummerieren lässt den Stand.
      await sql`
        UPDATE sichten SET geaendert = CASE WHEN eltern_id IS DISTINCT FROM ${elternId}::uuid THEN ${STAND_WEITER} ELSE geaendert END,
          eltern_id = ${elternId}, position = ${position}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
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
        for (const z of zeilen) erg.set(`${z.mappe === ohne ? '' : z.mappe}|${z.feld}`, { id: z.id as string, titel: (z.titel as string | null) ?? '' });
      }
      return erg;
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
    async setzeTypKennung(typId, kennung) {
      const k = teileKennung(kennung);
      await sql`UPDATE mappentypen SET paket = ${k.paket}, schluessel = ${k.schluessel} WHERE haushalt_id = ${haushaltId} AND id = ${typId}`;
    },
    async setzeTypSchluessel(typId, schluessel) {
      await sql`UPDATE mappentypen SET schluessel = ${schluessel} WHERE haushalt_id = ${haushaltId} AND id = ${typId} AND schluessel IS NULL`;
    },
    async setzeBerechtigungen(typId, rw) {
      const [r] = await sql`UPDATE mappentypen SET berechtigungen = ${rw ? json(sql, rw) : null}, geaendert = ${STAND_WEITER} WHERE haushalt_id = ${haushaltId} AND id = ${typId} RETURNING *`;
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
    async setzeDokumentErstellt(id, erstellt) {
      if (istUuid(id)) await sql`UPDATE dokumente SET erstellt = ${erstellt} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
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
            ocr_info = NULL, ocr_seiten = NULL, ocr_zeit = ${uebernehmen && neu.volltext != null ? sql`now()` : null},
            weitere_sprachen = NULL, seitensprachen = NULL, teilen_hinweis_aus = NULL, leerseiten = NULL
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
      if (!istUuid(id)) return;
      // Anlagen (#998) wandern mit ihrem Hauptdokument; eine Anlage allein in eine andere Mappe ist danach ein eigenes Dokument.
      await sql`UPDATE dokumente SET mappe_id = ${mappeId}, register_key = ${registerKey} WHERE haushalt_id = ${haushaltId} AND (id = ${id} OR anlage_zu = ${id})`;
      await sql`UPDATE dokumente d SET anlage_zu = NULL, anlage_nr = NULL WHERE d.haushalt_id = ${haushaltId} AND d.id = ${id} AND d.anlage_zu IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dokumente h WHERE h.id = d.anlage_zu AND h.mappe_id = d.mappe_id)`;
    },
    async anlagenVon(id) {
      if (!istUuid(id)) return [];
      return (await sql`SELECT ${DOK}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
        FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.anlage_zu = ${id} ORDER BY d.anlage_nr, d.name, d.id`).map(alsDokument);
    },
    async setzeAnlage(id, anlageZu, nr, name) {
      if (!istUuid(id) || (anlageZu !== null && !istUuid(anlageZu))) return false;
      const r = await sql`UPDATE dokumente SET anlage_zu = ${anlageZu}, anlage_nr = ${anlageZu ? nr : null} ${name !== undefined ? sql`, name = ${name}` : sql``}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r.count > 0;
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
      if (f.id !== undefined && !istUuid(f.id)) return [];
      const r = await sql`SELECT * FROM auskunft_links WHERE haushalt_id = ${haushaltId}
        ${f.id ? sql`AND id = ${f.id}::uuid` : sql``}
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
    async zaehlerstand(benutzerId) {
      if (!istUuid(benutzerId)) return undefined;
      const [r] = await sql`SELECT stand, abdruck, geaendert FROM zaehlerstaende WHERE benutzer_id = ${benutzerId}`;
      return r ? { stand: Number(r.stand), abdruck: r.abdruck as string, geaendert: (r.geaendert as Date).toISOString() } : undefined;
    },
    async setzeZaehlerstand(benutzerId, abdruck) {
      // Ein Befehl: gleichzeitige Abrufe zählen je echter Änderung höchstens einmal hoch (Zeilensperre im UPSERT).
      const [r] = await sql`INSERT INTO zaehlerstaende (benutzer_id, haushalt_id, stand, abdruck) VALUES (${benutzerId}, ${haushaltId}, 1, ${abdruck})
        ON CONFLICT (benutzer_id) DO UPDATE SET stand = zaehlerstaende.stand + 1, abdruck = EXCLUDED.abdruck, geaendert = now()
          WHERE zaehlerstaende.abdruck IS DISTINCT FROM EXCLUDED.abdruck
        RETURNING stand, abdruck, geaendert`;
      if (r) return { stand: Number(r.stand), abdruck: r.abdruck as string, geaendert: (r.geaendert as Date).toISOString() };
      const [d] = await sql`SELECT stand, abdruck, geaendert FROM zaehlerstaende WHERE benutzer_id = ${benutzerId}`;
      return { stand: Number(d.stand), abdruck: d.abdruck as string, geaendert: (d.geaendert as Date).toISOString() };
    },
    async merkeGesehen(benutzerId, mappeIds) {
      const ids = [...new Set(mappeIds.filter(istUuid))];
      if (!istUuid(benutzerId) || !ids.length) return;
      // Ein Merkposten (Hervorhebung „geändert“, #422): ohne Warten auf die Platte (#615, wie „Zuletzt geöffnet“).
      await sql`INSERT INTO gesehen (benutzer_id, mappe_id, haushalt_id)
        SELECT ${benutzerId}::uuid, m.id, m.haushalt_id FROM mappen m, ${ohneWarten(sql)} WHERE m.haushalt_id = ${haushaltId} AND m.id = ANY(${ids}::uuid[])
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
      // Bricht PostgreSQL das Speichern wegen einer Verklemmung ab (#575), noch einmal versuchen – in einer eigenen
      // Transaktion bzw. innerhalb einer Transaktion in einem Sicherungspunkt, damit der Versuch wiederholbar ist.
      await beiVerklemmungWiederholen(() => sql.begin((tx) => tx`
        UPDATE dokumente SET ocr_stand = ${e.stand}, ocr_info = ${e.info ?? null}, ocr_seiten = ${e.seiten ?? null}, ocr_zeit = now()
          ${e.text !== undefined ? tx`, volltext = ${e.text}` : tx``}${e.sprache !== undefined ? tx`, sprache = ${e.sprache}` : tx``}
          ${e.text !== undefined || e.weitere !== undefined ? tx`, weitere_sprachen = ${e.weitere?.length ? e.weitere : null}` : tx``}
          ${e.text !== undefined || e.seitensprachen !== undefined ? tx`, seitensprachen = ${e.seitensprachen?.length ? tx.json(e.seitensprachen as unknown as postgres.JSONValue) : null}, teilen_hinweis_aus = NULL` : tx``}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`), {
        nochmal: (versuch, f) => log.warn('Volltext speichern: Datenbank hat abgebrochen, neuer Versuch', { dokument: id, versuch, fehler: (f as Error).message }),
      });
      if (e.sprache || e.weitere?.length) sprachenZwischen = null;
    },
    async ocrVonSha(sha256, ausser) {
      const [r] = await sql`
        SELECT volltext, ocr_seiten, ocr_info, sprache, weitere_sprachen, seitensprachen FROM dokumente
        WHERE haushalt_id = ${haushaltId} AND sha256 = ${sha256} AND id IS DISTINCT FROM ${istUuid(ausser) ? ausser : null}::uuid AND ocr_stand = 'fertig' AND volltext IS NOT NULL
        LIMIT 1`;
      return r ? { text: r.volltext as string, seiten: (r.ocr_seiten as number | null) ?? null, info: (r.ocr_info as string | null) ?? null, sprache: (r.sprache as string | null) ?? null,
        weitere: (r.weitere_sprachen as string[] | null) ?? null, seitensprachen: alsSeitensprachen(r.seitensprachen) } : undefined;
    },
    async setzeDokumentSprache(id, sprache, weitere) {
      if (!istUuid(id)) return false;
      // Der Hinweis der Texterkennung nennt danach dieselbe Sprache (ältere Dokumente lesen sie nur von dort).
      // Weitere Sprachen (#579): ohne Angabe bleiben sie (ohne die neue Hauptsprache); mit Angabe gelten sie fürs
      // ganze Dokument, die Seitensprachen entfallen.
      const r = await sql`UPDATE dokumente SET sprache = ${sprache},
          ocr_info = CASE WHEN ocr_info IS NULL THEN NULL ELSE regexp_replace(ocr_info, ${SPRACHE_INFO_SQL}, '') || coalesce(${SPRACHE_MARKE} || ${sprache}::text, '') END,
          ${weitere !== undefined
            ? sql`weitere_sprachen = ${weitere.length ? weitere : null}, seitensprachen = NULL, teilen_hinweis_aus = NULL`
            : sql`weitere_sprachen = nullif(array_remove(weitere_sprachen, ${sprache}::text), '{}')`}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      if (r.count) sprachenZwischen = null;
      return r.count > 0;
    },
    async seitensprachen(id) {
      if (!istUuid(id)) return null;
      const [r] = await sql`SELECT seitensprachen FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsSeitensprachen(r.seitensprachen) : null;
    },
    async teilenHinweisAus(id) {
      if (!istUuid(id)) return false;
      const r = await sql`UPDATE dokumente SET teilen_hinweis_aus = true WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r.count > 0;
    },
    async setzeLeerseiten(id, l) {
      if (!istUuid(id)) return false;
      // Nur, solange die Datei dieselbe ist (#997): Eine neue Fassung dazwischen setzt die Markierung zurück.
      const r = l
        ? await sql`UPDATE dokumente SET leerseiten = ${sql.json(l as unknown as postgres.JSONValue)} WHERE haushalt_id = ${haushaltId} AND id = ${id} AND sha256 = ${l.sha256}`
        : await sql`UPDATE dokumente SET leerseiten = NULL WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r.count > 0;
    },
    async ocrZurueckstellen() {
      const r = await sql`UPDATE dokumente SET ocr_stand = 'wartet' WHERE haushalt_id = ${haushaltId} AND ocr_stand = 'laeuft'`;
      return r.count;
    },
    async ocrZaehler() {
      const z = { keiner: 0, wartet: 0, laeuft: 0, fertig: 0, fehler: 0, ausgelassen: 0, paket: 0 };
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
    async volltextKandidaten(umfang) {
      const ohne = umfang === 'ohne' ? sql`AND coalesce(btrim(d.volltext), '') = ''` : sql``;
      return (await sql`
        SELECT d.id, m.typ_id, d.register_key FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
        WHERE d.haushalt_id = ${haushaltId} AND coalesce(d.ocr_stand, 'keiner') NOT IN ('wartet', 'laeuft') ${ohne}
        ORDER BY d.erstellt, d.id`)
        .map((r: Zeile) => ({ id: r.id as string, typId: r.typ_id as string, registerKey: r.register_key as string }));
    },
    async volltextHerkunft() {
      const [r] = await sql`
        SELECT count(*) FILTER (WHERE leer)::int AS ohne,
          count(*) FILTER (WHERE NOT leer AND (i LIKE 'Texterkennung durch Paket %' OR i LIKE 'Volltext durch Paket %'))::int AS paket,
          count(*) FILTER (WHERE NOT leer AND i LIKE 'Textebene des PDFs%')::int AS pdf,
          count(*) FILTER (WHERE NOT leer AND i LIKE 'Volltext über die API%')::int AS api,
          count(*) FILTER (WHERE NOT leer AND i NOT LIKE 'Texterkennung durch Paket %' AND i NOT LIKE 'Volltext durch Paket %' AND i NOT LIKE 'Textebene des PDFs%' AND i NOT LIKE 'Volltext über die API%' AND i LIKE '%Texterkennung%')::int AS eingebaut,
          count(*) FILTER (WHERE NOT leer AND i NOT LIKE 'Texterkennung durch Paket %' AND i NOT LIKE 'Volltext durch Paket %' AND i NOT LIKE 'Textebene des PDFs%' AND i NOT LIKE 'Volltext über die API%' AND i NOT LIKE '%Texterkennung%')::int AS sonst
        FROM (SELECT coalesce(btrim(volltext), '') = '' AS leer, regexp_replace(coalesce(ocr_info, ''), '^übernommen \\(gleicher Inhalt\\): ', '') AS i
          FROM dokumente WHERE haushalt_id = ${haushaltId} AND ocr_stand = 'fertig') x`;
      return { pdf: r.pdf as number, paket: r.paket as number, api: r.api as number, eingebaut: r.eingebaut as number, sonst: r.sonst as number, ohneText: r.ohne as number };
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
    /* ---------- Vektoren (#442) ---------- */
    async vektorSetze(e) {
      if (!istUuid(e.dokumentId)) return false;
      const r = await sql`INSERT INTO vektoren (dokument_id, haushalt_id, paket, modell, vektor)
        SELECT d.id, d.haushalt_id, ${e.paket}, ${e.modell}, ${Array.from(e.vektor)}::real[] FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.id = ${e.dokumentId}
        ON CONFLICT (dokument_id, modell) DO UPDATE SET paket = EXCLUDED.paket, vektor = EXCLUDED.vektor, zeit = now()`;
      return r.count > 0;
    },
    async vektorLoesche(dokumentId, modell) {
      if (!istUuid(dokumentId)) return 0;
      const r = modell === undefined
        ? await sql`DELETE FROM vektoren WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId}`
        : await sql`DELETE FROM vektoren WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} AND modell = ${modell}`;
      return r.count;
    },
    async vektorenLoeschePaket(paket, ausser) {
      const r = ausser === undefined
        ? await sql`DELETE FROM vektoren WHERE haushalt_id = ${haushaltId} AND paket = ${paket}`
        : await sql`DELETE FROM vektoren WHERE haushalt_id = ${haushaltId} AND paket = ${paket} AND modell <> ${ausser}`;
      return r.count;
    },
    async vektorenLaden(modell, jeTeil) {
      // Binär (array_send) statt als Text (dreimal schneller) und in Teilen über einen Cursor (wenig Speicher auf einmal).
      await sql`SELECT v.dokument_id, d.mappe_id, array_send(v.vektor) AS b FROM vektoren v JOIN dokumente d ON d.id = v.dokument_id
        WHERE v.haushalt_id = ${haushaltId} AND v.modell = ${modell}`.cursor(2000, (r: Zeile[]) => {
        jeTeil(r.map((z) => ({ dokumentId: z.dokument_id as string, mappeId: z.mappe_id as string, vektor: realArray(z.b as Buffer) })));
      });
    },
    async vektorVon(dokumentId, modell) {
      if (!istUuid(dokumentId)) return null;
      const [r] = await sql`SELECT vektor::text AS v FROM vektoren WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} AND modell = ${modell}`;
      return r ? Float32Array.from((r.v as string).slice(1, -1).split(','), Number) : null;
    },
    async vektorStand() {
      return (await sql`SELECT paket, modell, count(*)::int AS n FROM vektoren WHERE haushalt_id = ${haushaltId} GROUP BY 1, 2 ORDER BY 1, 2`)
        .map((r: Zeile) => ({ paket: r.paket as string, modell: r.modell as string, anzahl: r.n as number }));
    },
    async ohneVektor(modell, max, nach) {
      const ab = nach && istUuid(nach) ? nach : '00000000-0000-0000-0000-000000000000';
      return (await sql`SELECT d.id, d.mappe_id FROM dokumente d
        WHERE d.haushalt_id = ${haushaltId} AND d.id > ${ab}::uuid AND d.volltext IS NOT NULL AND d.volltext <> ''
          AND NOT EXISTS (SELECT 1 FROM vektoren v WHERE v.dokument_id = d.id AND v.modell = ${modell})
        ORDER BY d.id LIMIT ${max}`).map((r: Zeile) => ({ id: r.id as string, mappeId: r.mappe_id as string }));
    },
    async mitVolltext() {
      const [r] = await sql`SELECT count(*)::int AS n FROM dokumente WHERE haushalt_id = ${haushaltId} AND volltext IS NOT NULL AND volltext <> ''`;
      return r.n as number;
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
    async fragenFundstellen(o) {
      const woerter = o.woerter.filter((w) => /^[\p{L}\p{N}]{2,40}$/u.test(w)).slice(0, 12);
      if (!woerter.length) return { dokumente: [], mappen: [] };
      const lesen = o.lesen ? sql`AND ${lesefilterSql(sql, o.lesen)}` : sql``;
      // Ein Wort genügt (ODER); Füllwörter entfernt die deutsche Konfiguration. Erst die besten Dokumente, dann
      // nur für sie die Ausschnitte (ts_headline ist teuer).
      const q = woerter.join(' | ');
      // Je Sprache der Ablage (#400) die Wortstämme dieser Sprache.
      const anfrage = (await sprachKonfigs()).map((k) => sql`to_tsquery(${k}::regconfig, dms_falte(${q}::text))`).reduce((x, y) => sql`(${x} || ${y})`);
      const dokumente = o.dokumente < 1 ? [] : await sql`
        WITH beste AS (
          SELECT d.id, d.mappe_id, d.name, ts_rank_cd(${SUCHINDEX}, x.q) AS rang
          FROM dokumente d JOIN mappen ON mappen.id = d.mappe_id AND mappen.haushalt_id = ${haushaltId} CROSS JOIN LATERAL (SELECT ${anfrage} AS q) x
          WHERE d.haushalt_id = ${haushaltId} AND ${SUCHINDEX} @@ x.q ${lesen}
          ORDER BY rang DESC, d.id LIMIT ${o.dokumente})
        SELECT b.id, b.mappe_id, b.name, b.rang, dms_ausschnitt(d.sprache, d.weitere_sprachen, d.volltext, ${anfrage},
          'MaxFragments=3, MaxWords=40, MinWords=15, ShortWord=2, StartSel="", StopSel="", FragmentDelimiter=" … "') AS text
        FROM beste b JOIN dokumente d ON d.id = b.id ORDER BY b.rang DESC, b.id`;
      const muster = woerter.map((w) => `%${w}%`);
      const mappen = o.mappen < 1 ? [] : await sql`
        SELECT * FROM (
          SELECT ${sql.unsafe(MAPPEN_SPALTEN.map((x) => `mappen.${x}`).join(', '))}, (SELECT count(*) FROM unnest(${muster}::text[]) w
            WHERE mappen.titel ILIKE w OR EXISTS (SELECT 1 FROM jsonb_each_text(mappen.werte) e WHERE e.value ILIKE w AND e.value NOT LIKE 'dms1$%')) AS punkte
          FROM mappen WHERE haushalt_id = ${haushaltId} ${lesen}) x
        WHERE punkte > 0 ORDER BY punkte DESC, geaendert DESC, id LIMIT ${o.mappen}`;
      return {
        dokumente: dokumente.map((z) => ({ id: z.id as string, mappeId: z.mappe_id as string, name: z.name as string, text: String(z.text ?? '') })),
        mappen: mappen.map(alsMappe),
      };
    },

    /* ---------- Unscharfe Suche (#356) ---------- */
    async aehnlicheWoerter(woerter, max) {
      const r: Record<string, string[]> = {};
      const liste = [...new Set(woerter.map(falte).filter((w) => w.length >= TIPPFEHLER_MIN && w.length <= 40))];
      if (!liste.length) return r;
      // pg_trgm kann fehlen (keine Rechte) oder in einem anderen Schema liegen: Funktion und Operator mit Schema.
      const trgm = await trigrammSchema();
      if (!trgm) return r;
      const aehnl = sql.unsafe(`${trgm}.similarity`);
      const op = sql.unsafe(`OPERATOR(${trgm}.%)`);
      for (const w of liste) {
        const z = await sql`
          SELECT wort FROM suchwoerter
          WHERE haushalt_id = ${haushaltId} AND wort ${op} ${w}::text AND wort <> ${w} AND ${aehnl}(wort, ${w}::text) >= ${AEHNLICH_AB}
          ORDER BY ${aehnl}(wort, ${w}::text) DESC, anzahl DESC, wort LIMIT ${max}`;
        if (z.length) r[w] = z.map((x) => x.wort as string);
      }
      return r;
    },
    async woerterAnzahl() {
      const [r] = await sql`SELECT count(*)::int AS n FROM suchwoerter WHERE haushalt_id = ${haushaltId}`;
      return r.n as number;
    },
    async woerterNeu() {
      const [r] = await sql`SELECT dms_woerter_neu(${haushaltId}::uuid) AS n`;
      return Number(r.n);
    },
    async woerterEinarbeiten(grenze = WOERTER_JE_LAUF) {
      const [r] = await sql`SELECT dms_woerter_einarbeiten(${grenze}::int) AS n`;
      return Number(r.n);
    },
    async synonyme() {
      return (await sql`SELECT id, woerter, quelle, geaendert FROM synonyme WHERE haushalt_id = ${haushaltId} ORDER BY quelle <> 'werkbank', quelle, erstellt, id`)
        .map((z) => ({ id: z.id as string, woerter: z.woerter as string[], quelle: z.quelle as string, geaendert: iso(z.geaendert) }));
    },
    async legeSynonymAn(g) {
      await sql`INSERT INTO synonyme (id, haushalt_id, woerter, quelle) VALUES (${g.id}, ${haushaltId}, ${g.woerter}::text[], ${g.quelle})`;
    },
    async aendereSynonym(id, woerter, erwartet) {
      if (!istUuid(id)) return false;
      return sql.begin(async (tx) => {
        // Gleichzeitig bearbeitet (#917, #992): nur auf dem Stand, auf dem die Bearbeitung beruht.
        if (erwartet !== undefined) {
          const [a] = await tx`SELECT geaendert FROM synonyme WHERE haushalt_id = ${haushaltId} AND id = ${id} AND quelle = 'werkbank' FOR UPDATE`;
          if (a && iso(a.geaendert) !== erwartet) throw new KonfigurationVeraltet();
        }
        return (await tx`UPDATE synonyme SET woerter = ${woerter}::text[], geaendert = ${STAND_WEITER} WHERE haushalt_id = ${haushaltId} AND id = ${id} AND quelle = 'werkbank'`).count > 0;
      });
    },
    async loescheSynonym(id) {
      if (!istUuid(id)) return false;
      return (await sql`DELETE FROM synonyme WHERE haushalt_id = ${haushaltId} AND id = ${id} AND quelle = 'werkbank'`).count > 0;
    },
    async setzeSynonyme(quelle, gruppen) {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM synonyme WHERE haushalt_id = ${haushaltId} AND quelle = ${quelle}`;
        for (const g of gruppen) await tx`INSERT INTO synonyme (id, haushalt_id, woerter, quelle) VALUES (gen_random_uuid(), ${haushaltId}, ${g}::text[], ${quelle})`;
      });
    },


    /* ---------- Notfallkontakte (#812) ---------- */
    async notfallkontakte() {
      return (await sql`SELECT * FROM notfallkontakte WHERE haushalt_id = ${haushaltId} ORDER BY erstellt, id`).map(notfallkontaktAus);
    },
    async holeNotfallkontakt(id) {
      if (!istUuid(id)) return null;
      const [z] = await sql`SELECT * FROM notfallkontakte WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return z ? notfallkontaktAus(z) : null;
    },
    async legeNotfallkontaktAn(k, max) {
      return sql.begin(async (tx) => {
        // Grenze auch bei gleichzeitigen Anfragen und mehreren Prozessen (Durchsicht Sicherheit): Sperre je Haushalt
        // bis zum Ende der Transaktion, dann zählen und anlegen.
        await tx`SELECT pg_advisory_xact_lock(812, hashtext(${haushaltId}::text))`;
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM notfallkontakte WHERE haushalt_id = ${haushaltId}`;
        if (Number(n) >= max) return false;
        await tx`INSERT INTO notfallkontakte (id, haushalt_id, name, email, telefon, notiz, antwort_an, eingetragen_von, eingetragen_von_name, mail_stand, mail_am, mail_fehler, erstellt, geaendert)
          VALUES (${k.id}, ${haushaltId}, ${k.name}, ${k.email}, ${k.telefon}, ${k.notiz}, ${k.antwortAn}, ${k.eingetragenVon}, ${k.eingetragenVonName}, ${k.mailStand}, ${k.mailAm}, ${k.mailFehler},
            date_trunc('milliseconds', now()), date_trunc('milliseconds', now()))`;
        return true;
      });
    },
    async aendereNotfallkontakt(id, w) {
      if (!istUuid(id)) return false;
      return (await sql`UPDATE notfallkontakte SET name = ${w.name}, email = ${w.email}, telefon = ${w.telefon}, notiz = ${w.notiz}, antwort_an = ${w.antwortAn},
        mail_stand = ${w.mailStand}, mail_am = ${w.mailAm}, mail_fehler = ${w.mailFehler}, geaendert = ${STAND_WEITER}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`).count > 0;
    },
    async setzeNotfallkontaktMail(id, m) {
      if (!istUuid(id)) return false;
      return (await sql`UPDATE notfallkontakte SET mail_stand = ${m.mailStand}, mail_am = ${m.mailAm}, mail_fehler = ${m.mailFehler} WHERE haushalt_id = ${haushaltId} AND id = ${id}`).count > 0;
    },
    async loescheNotfallkontakt(id) {
      if (!istUuid(id)) return null;
      const [z] = await sql`DELETE FROM notfallkontakte WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
      return z ? notfallkontaktAus(z) : null;
    },

    /* ---------- Aufgaben (#54) ---------- */
    async aufgabenZurPassung(liste) {
      const offen = liste.filter((x) => x.problem && istUuid(x.id));
      const fertig = liste.filter((x) => !x.problem && istUuid(x.id)).map((x) => x.id);
      if (offen.length) {
        const ids = offen.map((x) => x.id);
        const texte = offen.map((x) => t('meldungen.repopg.passt-nicht-zur-definition', { problem: String(x.problem) }));
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
        INSERT INTO aufgaben (id, haushalt_id, mappe_id, empfaenger_id, art, text, feld_key, erstellt_von, datum, anlass)
        VALUES (${a.id}, ${haushaltId}, ${a.mappeId}, ${istUuid(a.empfaengerId) ? a.empfaengerId : null}::uuid, ${a.art}, ${a.text}, ${a.feldKey ?? null},
          ${istUuid(a.erstelltVon) ? a.erstelltVon : null}::uuid, ${a.datum ?? null}::date, ${a.anlass ? sql.json(a.anlass as never) : null})
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

    // Aufgaben bei Personen ohne Leserecht (#798)
    async faelleOhneLeserecht(f = {}) {
      const offen = f.offen ? sql`AND f.ende IS NULL` : sql``;
      const welche = f.mappeIds ? sql`AND f.mappe_id = ANY(${f.mappeIds.filter(istUuid)}::uuid[])` : sql``;
      return (await sql`
        SELECT f.*, m.titel AS mappe_titel, m.typ_id FROM aufgaben_ohne_leserecht f LEFT JOIN mappen m ON m.id = f.mappe_id
        WHERE f.haushalt_id = ${haushaltId} ${offen} ${welche}
        ORDER BY f.ende IS NOT NULL, coalesce(f.ende, f.beginn) DESC, f.id LIMIT ${f.max ?? 1000}`).map(alsFall);
    },
    async legeFallAn(f) {
      const r = await sql`
        INSERT INTO aufgaben_ohne_leserecht (id, haushalt_id, aufgabe_id, mappe_id, benutzer_id, aufgabentext)
        VALUES (${f.id}, ${haushaltId}, ${f.aufgabeId}, ${f.mappeId}, ${f.benutzerId}, ${f.aufgabentext})
        ON CONFLICT (aufgabe_id, benutzer_id) WHERE ende IS NULL DO NOTHING`;
      return r.count > 0;
    },
    async beendeFall(id, grund, zeit) {
      const r = await sql`UPDATE aufgaben_ohne_leserecht SET ende = coalesce(${zeit ?? null}::timestamptz, now()), ende_grund = ${grund}
        WHERE haushalt_id = ${haushaltId} AND id = ${id} AND ende IS NULL`;
      return r.count > 0;
    },
    async gibLeserechtAufZeit(id, von) {
      const r = await sql`UPDATE aufgaben_ohne_leserecht SET leserecht_seit = now(), leserecht_von = ${istUuid(von) ? von : null}::uuid
        WHERE haushalt_id = ${haushaltId} AND id = ${id} AND ende IS NULL AND leserecht_seit IS NULL`;
      return r.count > 0;
    },
    async leserechteAufZeit(benutzerId) {
      if (!istUuid(benutzerId)) return [];
      return (await sql`
        SELECT f.id, f.mappe_id, m.typ_id, f.aufgabe_id, f.aufgabentext, f.leserecht_seit, f.leserecht_von
        FROM aufgaben_ohne_leserecht f JOIN aufgaben a ON a.id = f.aufgabe_id JOIN mappen m ON m.id = f.mappe_id
        WHERE f.haushalt_id = ${haushaltId} AND f.benutzer_id = ${benutzerId} AND f.ende IS NULL AND f.leserecht_seit IS NOT NULL
          AND a.erledigt IS NULL AND a.empfaenger_id = f.benutzer_id AND a.mappe_id = f.mappe_id`).map((r) => ({
        fallId: r.id as string, mappeId: r.mappe_id as string, typId: r.typ_id as string, aufgabeId: r.aufgabe_id as string,
        aufgabentext: r.aufgabentext as string, seit: iso(r.leserecht_seit), von: (r.leserecht_von as string | null) ?? null,
      }));
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
        // Aufruf von außen (#679): Geheimnis für die Signatur.
        for (const r of await tx`SELECT automatisierung_id, geheimnis FROM automatisierung_aufrufe WHERE haushalt_id = ${haushaltId} AND geheimnis LIKE ${muster} FOR UPDATE`) {
          const x = umschluesseleTief(r.geheimnis as string, um); zaehle(x);
          if (x.geaendert) await tx`UPDATE automatisierung_aufrufe SET geheimnis = ${x.wert} WHERE automatisierung_id = ${r.automatisierung_id}`;
        }
        for (const [k, w] of Object.entries(einstellungen)) {
          await tx`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, ${k}, ${tx.json(w as postgres.JSONValue)})
            ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
        }
        return { umgeschluesselt, unlesbar };
      });
    },

    async verschluesselteFundstellen() {
      // Dieselben Stellen wie umschluesseln (#410); Benutzername für die Zwei-Faktor-Anmeldung; Aufruf von außen (#679).
      const muster = '%dms1$%';
      const mappen = await sql`SELECT id, titel, werte FROM mappen WHERE haushalt_id = ${haushaltId} AND werte::text LIKE ${muster}`;
      const korb = await sql`SELECT id, mappe FROM papierkorb WHERE haushalt_id = ${haushaltId} AND mappe::text LIKE ${muster}`;
      const einst = await sql`
        SELECT e.schluessel, e.wert, coalesce(nullif(b.name, ''), b.email) AS titel FROM einstellungen e
        LEFT JOIN benutzer b ON b.haushalt_id = e.haushalt_id AND (e.schluessel = 'zweifaktor_' || b.id::text OR e.schluessel = 'dokpasswoerter_' || b.id::text)
        WHERE e.haushalt_id = ${haushaltId} AND e.wert::text LIKE ${muster} ORDER BY e.schluessel`;
      const aufrufe = await sql`SELECT x.automatisierung_id, x.geheimnis, a.name FROM automatisierung_aufrufe x JOIN automatisierungen a ON a.id = x.automatisierung_id
        WHERE x.haushalt_id = ${haushaltId} AND x.geheimnis LIKE ${muster} ORDER BY x.erstellt, x.automatisierung_id`;
      return [
        ...mappen.map((r) => ({ quelle: 'mappe' as const, schluessel: String(r.id), wert: r.werte, titel: r.titel as string })),
        ...korb.map((r) => ({ quelle: 'papierkorb' as const, schluessel: String(r.id), wert: r.mappe, titel: (r.mappe as { titel?: string }).titel ?? null })),
        ...einst.map((r) => ({ quelle: 'einstellung' as const, schluessel: r.schluessel as string, wert: r.wert, titel: (r.titel as string | null) ?? null })),
        ...aufrufe.map((r) => ({ quelle: 'aufruf' as const, schluessel: String(r.automatisierung_id), wert: r.geheimnis, titel: r.name as string })),
      ];
    },

    /* ---------- Mappen-Abläufe (#1044; früher freie Erinnerungen, #131) ---------- */
    async ablaeufe(f = {}) {
      const id = (x: string | undefined) => (istUuid(x) ? x : null);
      return (await sql`
        SELECT e.*, m.titel AS mappe_titel, m.typ_id FROM mappen_ablaeufe e JOIN mappen m ON m.id = e.mappe_id
        WHERE e.haushalt_id = ${haushaltId}
          ${f.mappeId ? sql`AND e.mappe_id = ${id(f.mappeId)}::uuid` : sql``}
          ${f.empfaengerId ? sql`AND e.empfaenger_id = ${id(f.empfaengerId)}::uuid` : sql``}
          ${f.personId ? sql`AND e.erstellt_von = ${id(f.personId)}::uuid` : sql``}
          ${f.vorlage ? sql`AND e.vorlage = ${f.vorlage}` : sql``}
          ${f.bis ? sql`AND e.datum <= ${f.bis}::date` : sql``}
          ${f.angehalten === undefined ? sql`` : f.angehalten ? sql`AND e.angehalten IS NOT NULL` : sql`AND e.angehalten IS NULL`}
        ORDER BY e.datum, e.erstellt, e.id`).map(alsAblauf);
    },
    async holeAblauf(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM mappen_ablaeufe WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsAblauf(r) : undefined;
    },
    async legeAblaufAn(e) {
      const [r] = await sql`
        INSERT INTO mappen_ablaeufe (id, haushalt_id, mappe_id, vorlage, empfaenger_id, datum, text, erstellt_von, angehalten)
        VALUES (${e.id}, ${haushaltId}, ${e.mappeId}, ${e.vorlage}, ${istUuid(e.empfaengerId) ? e.empfaengerId : null}::uuid, ${e.datum}::date, ${e.text},
          ${istUuid(e.erstelltVon) ? e.erstelltVon : null}::uuid, ${e.angehalten ? json(sql, e.angehalten) : null}::jsonb)
        RETURNING *`;
      return alsAblauf(r);
    },
    async aendereAblauf(id, e) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`
        UPDATE mappen_ablaeufe SET datum = ${e.datum}::date, text = ${e.text}, empfaenger_id = ${istUuid(e.empfaengerId) ? e.empfaengerId : null}::uuid
        WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
      return r ? alsAblauf(r) : undefined;
    },
    async setzeAblaufAngehalten(id, a) {
      if (istUuid(id)) await sql`UPDATE mappen_ablaeufe SET angehalten = ${a ? json(sql, a) : null}::jsonb WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async loescheAblauf(id) {
      if (!istUuid(id)) return false;
      return (await sql`DELETE FROM mappen_ablaeufe WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING id`).length > 0;
    },

    /* ---------- Automatisierungsvorlagen (#1044) ---------- */
    async ablaufvorlagen() {
      // Gemerkt wie Typen und Pakete (Trigger in 105): Mappe öffnen braucht sie fürs Menü „Mappe“ (#1044).
      return gemerkt('ablaufvorlagen', async () => (await sql`SELECT * FROM ablaufvorlagen WHERE haushalt_id = ${haushaltId} ORDER BY reihenfolge, name, kennung`).map(alsVorlage));
    },
    async speichereAblaufvorlage(v, von, erwartet) {
      const daten = { beschreibung: v.beschreibung, typen: v.typen, wann: v.wann, fragen: v.fragen, karten: v.karten };
      if (erwartet === null) {
        return (await sql`INSERT INTO ablaufvorlagen (haushalt_id, kennung, name, reihenfolge, daten, aktiv, herkunft, paket_id, version, geaendert_von)
          VALUES (${haushaltId}, ${v.kennung}, ${v.name}, ${v.reihenfolge}, ${json(sql, daten)}::jsonb, ${v.aktiv}, ${v.herkunft}, ${v.paketId}, 1, ${istUuid(von) ? von : null}::uuid)
          ON CONFLICT DO NOTHING RETURNING version`).length > 0;
      }
      return (await sql`UPDATE ablaufvorlagen SET name = ${v.name}, reihenfolge = ${v.reihenfolge}, daten = ${json(sql, daten)}::jsonb, aktiv = ${v.aktiv},
        herkunft = ${v.herkunft}, paket_id = ${v.paketId}, version = version + 1, geaendert = now(), geaendert_von = ${istUuid(von) ? von : null}::uuid
        WHERE haushalt_id = ${haushaltId} AND kennung = ${v.kennung} AND version = ${erwartet} RETURNING version`).length > 0;
    },
    async loescheAblaufvorlage(kennung) {
      await sql`DELETE FROM ablaufvorlagen WHERE haushalt_id = ${haushaltId} AND kennung = ${kennung}`;
    },
    async vermerkeAblauf(e) {
      await sql`INSERT INTO ablauf_verlauf (id, haushalt_id, vorlage, mappe_id, ablauf_id, person_id, art, text, zeit)
        VALUES (${e.id}, ${haushaltId}, ${e.vorlage}, ${istUuid(e.mappeId) ? e.mappeId : null}::uuid, ${istUuid(e.ablaufId) ? e.ablaufId : null}::uuid,
          ${istUuid(e.personId) ? e.personId : null}::uuid, ${e.art}, ${e.text}, ${e.zeit || new Date().toISOString()}::timestamptz)`;
    },
    async ablaufVerlauf(f) {
      return (await sql`SELECT * FROM ablauf_verlauf WHERE haushalt_id = ${haushaltId}
        ${f.vorlage ? sql`AND vorlage = ${f.vorlage}` : sql``} ${f.mappeId ? sql`AND mappe_id = ${istUuid(f.mappeId) ? f.mappeId : null}::uuid` : sql``}
        ORDER BY zeit DESC, id LIMIT ${f.anzahl}`).map(alsVerlauf);
    },
    async zaehleAblaufVerlauf(personId, seit, arten) {
      if (!istUuid(personId)) return 0;
      const [r] = await sql`SELECT count(*)::int AS n FROM ablauf_verlauf WHERE haushalt_id = ${haushaltId} AND person_id = ${personId} AND zeit >= ${seit}::timestamptz AND art = ANY(${arten}::text[])`;
      return r.n as number;
    },
    async raeumeAblaufVerlaufAuf(tage, je) {
      const r = await sql`DELETE FROM ablauf_verlauf l USING (
          SELECT id, row_number() OVER (PARTITION BY vorlage ORDER BY zeit DESC) AS nr, zeit FROM ablauf_verlauf WHERE haushalt_id = ${haushaltId}
        ) x WHERE l.id = x.id AND (x.nr > ${je} OR x.zeit < now() - make_interval(days => ${tage}))`;
      return r.count;
    },

    /* ---------- Notizen (#55) ---------- */
    // Hinweise von Paketen (#1034)
    async hinweise(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT paket_id, schluessel, text, gesetzt FROM mappen_hinweise WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY gesetzt, paket_id, schluessel`)
        .map((r) => ({ paket: r.paket_id as string, schluessel: r.schluessel as string, text: r.text as string, gesetzt: iso(r.gesetzt) }));
    },
    async setzeHinweis(h) {
      if (!istUuid(h.mappeId)) return;
      await sql`INSERT INTO mappen_hinweise (haushalt_id, mappe_id, paket_id, schluessel, text) VALUES (${haushaltId}, ${h.mappeId}, ${h.paket}, ${h.schluessel}, ${h.text})
        ON CONFLICT (mappe_id, paket_id, schluessel) DO UPDATE SET text = EXCLUDED.text, gesetzt = now()`;
    },
    async loescheHinweis(mappeId, paket, schluessel) {
      if (!istUuid(mappeId)) return false;
      return (await sql`DELETE FROM mappen_hinweise WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} AND paket_id = ${paket} AND schluessel = ${schluessel}`).count > 0;
    },
    async loescheHinweiseVon(paket) {
      return (await sql`DELETE FROM mappen_hinweise WHERE haushalt_id = ${haushaltId} AND paket_id = ${paket}`).count;
    },
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
    async historie(mappeId, o = {}) {
      if (!istUuid(mappeId)) return [];
      const vor = Number.isSafeInteger(o.vor) ? o.vor! : null;
      // #800: Seiten über den Index historie (mappe_id, zeit DESC, id DESC) – ab dem Eintrag `vor`, nicht mit OFFSET.
      return (await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId}
        ${o.arten ? sql`AND art = ANY(${[...o.arten]}::text[])` : sql``}
        ${vor !== null ? sql`AND (zeit, id) < (SELECT v.zeit, v.id FROM historie v WHERE v.id = ${vor} AND v.mappe_id = ${mappeId})` : sql``}
        ORDER BY zeit DESC, id DESC ${o.max ? sql`LIMIT ${o.max}` : sql``}`).map(alsHistorie);
    },
    async letzterAbruf(mappeId, art, benutzerId, dokumentId, fassung, version, seit) {
      if (!istUuid(mappeId)) return null;
      // #800: nur die Einträge der Mappe seit `seit` (Index historie_mappe_idx), darin dieselbe Person, Datei und Fassung.
      const [r] = await sql`SELECT zeit FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} AND zeit >= ${seit} AND art = ${art}
        AND benutzer_id IS NOT DISTINCT FROM ${istUuid(benutzerId) ? benutzerId : null}::uuid AND daten->>'dokumentId' = ${dokumentId}
        AND coalesce(daten->>'fassung', '') = ${fassung} AND coalesce(daten->>'version', '') = ${version === null ? '' : String(version)}
        ORDER BY zeit DESC LIMIT 1`;
      return r ? iso(r.zeit) : null;
    },
    async letzteBerechnung(mappeId, benutzerId, seit) {
      if (!istUuid(mappeId)) return null;
      const [r] = await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} AND zeit >= ${seit} AND art = 'geaendert'
        AND benutzer_id IS NOT DISTINCT FROM ${istUuid(benutzerId) ? benutzerId : null}::uuid AND daten->>'berechnet' = 'true'
        ORDER BY zeit DESC, id DESC LIMIT 1`;
      return r ? alsHistorie(r) : null;
    },
    async historieDatenErsetzen(id, daten) {
      if (daten === null) await sql`DELETE FROM historie WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      else await sql`UPDATE historie SET daten = ${json(sql, daten)} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async historieVon(mappeIds) {
      const gueltig = [...new Set(mappeIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) ORDER BY mappe_id, zeit DESC, id DESC`).map(alsHistorie);
    },
    async historieArt(art, max) {
      return (await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND art = ${art} ORDER BY zeit DESC, id DESC LIMIT ${max}`).map(alsHistorie);
    },
    async uebertrageAnMappe(von, nach) {
      if (!istUuid(von) || !istUuid(nach)) return { historie: 0, notizen: 0, aufgaben: 0, ablaeufe: 0 };
      // Aufgaben „Post für dich“ bleiben an der Post: Sie gelten nur dort und sind beim Auflösen schon erledigt.
      const h = await sql`UPDATE historie SET mappe_id = ${nach}, daten = daten || ${json(sql, { ausPost: von })}::jsonb WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von}`;
      const n = await sql`UPDATE notizen SET mappe_id = ${nach} WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von}`;
      const a = await sql`UPDATE aufgaben SET mappe_id = ${nach} WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von} AND art <> 'post'`;
      const e = await sql`UPDATE mappen_ablaeufe SET mappe_id = ${nach} WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von}`;
      // Offene Fälle „Aufgabe ohne Leserecht“ (#798) folgen ihrer Aufgabe; vergangene bleiben, wie sie waren.
      await sql`UPDATE aufgaben_ohne_leserecht SET mappe_id = ${nach} WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von} AND ende IS NULL`;
      return { historie: h.count, notizen: n.count, aufgaben: a.count, ablaeufe: e.count };
    },
    async aufgeloesteIn(ids) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      const m = new Map<string, { ziel: string; zielTyp: string }>();
      if (!gueltig.length) return m;
      for (const r of await sql`SELECT mappe_id, daten->>'ziel' AS ziel, coalesce(daten->>'zielTyp', '') AS ziel_typ FROM historie
        WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) AND art = 'zugeordnet' AND daten->>'aufgeloest' = 'true' ORDER BY zeit, id`) {
        if (r.ziel) m.set(r.mappe_id as string, { ziel: r.ziel as string, zielTyp: r.ziel_typ as string });
      }
      return m;
    },
    /* ---------- Fassungen (#1006) ---------- */
    async fassungen(art, eintrag, max) {
      return (await sql`SELECT * FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag}
        ORDER BY nr DESC ${max !== undefined ? sql`LIMIT ${max}` : sql``}`).map(alsFassung);
    },
    async zaehleFassungen(art, eintrag) {
      return Number((await sql`SELECT count(*)::int AS n FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag}`)[0].n);
    },
    async fassung(art, eintrag, nr) {
      const [r] = await sql`SELECT * FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr = ${nr}`;
      return r ? alsFassung(r) : undefined;
    },
    async letzteFassungen(art) {
      const rows = await sql`SELECT DISTINCT ON (eintrag) * FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} ORDER BY eintrag, nr DESC`;
      return new Map(rows.map((r) => [r.eintrag as string, alsFassung(r)] as const));
    },
    async legeFassungAn(f) {
      await sql`INSERT INTO fassungen (haushalt_id, art, eintrag, nr, name, daten, urheber, vorgang, wiederhergestellt, zeit, bis, geloescht)
        VALUES (${haushaltId}, ${f.art}, ${f.eintrag}, ${f.nr}, ${f.name}, ${json(sql, f.daten)}, ${json(sql, f.urheber)}, ${f.vorgang}, ${f.wiederhergestellt},
          ${f.zeit}, ${f.bis}, ${f.geloescht ? json(sql, f.geloescht) : null})`;
    },
    async schreibeFassungFort(art, eintrag, nr, d) {
      await sql`UPDATE fassungen SET name = ${d.name}, daten = ${json(sql, d.daten)}, bis = ${d.bis}
        WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr = ${nr}`;
    },
    async loescheFassung(art, eintrag, nr) {
      await sql`DELETE FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr = ${nr}`;
    },
    async vermerkeLoeschung(art, eintrag, vermerk) {
      const [r] = await sql`SELECT max(nr) AS nr FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag}`;
      if (r?.nr == null) return;
      await sql`DELETE FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr < ${r.nr}`;
      await sql`UPDATE fassungen SET geloescht = ${json(sql, vermerk)} WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr = ${r.nr}`;
    },
    async geloeschteFassungen(arten) {
      return (await sql`SELECT * FROM fassungen WHERE haushalt_id = ${haushaltId} AND geloescht IS NOT NULL AND art = ANY(${[...arten] as string[]}::text[])
        ORDER BY geloescht->>'zeit' DESC, art, eintrag`).map(alsFassung);
    },
    async alleFassungen() {
      return (await sql`SELECT * FROM fassungen WHERE haushalt_id = ${haushaltId} ORDER BY art, eintrag, nr`).map(alsFassung);
    },

    async historieAufraeumen(vor) {
      const r = await sql`
        DELETE FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id IN (
          SELECT mappe_id FROM historie WHERE haushalt_id = ${haushaltId} AND art = 'endgueltig' AND zeit < ${vor})
          -- #820: „Im Verwaltungsmodus angesehen“ ist nicht löschbar und bleibt auch nach dem Aufräumen stehen.
          AND art <> 'verwaltungsmodus'
          AND NOT EXISTS (SELECT 1 FROM mappen m WHERE m.id = historie.mappe_id)
          AND NOT EXISTS (SELECT 1 FROM papierkorb p WHERE p.id = historie.mappe_id)`;
      return r.count;
    },

    async dokumenteMitSha(sha256) {
      return (await sql`SELECT ${DOK} FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.sha256 = ${sha256}`).map(alsDokument);
    },
    async dokumenteMitTyp(mimes) {
      if (!mimes.length) return [];
      return (await sql`SELECT ${DOK} FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.mime = ANY(${mimes}::text[]) ORDER BY d.erstellt, d.id`).map(alsDokument);
    },
    async dokumentTypen() {
      const z: Record<string, number> = {};
      for (const r of await sql`SELECT mime, count(*)::int AS n FROM dokumente WHERE haushalt_id = ${haushaltId} GROUP BY mime`) z[r.mime as string] = r.n as number;
      return z;
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
