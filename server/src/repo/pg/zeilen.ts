/** Zeilen der Datenbank → Objekte des Repos (PostgreSQL). Hängt von nichts im Repo ab außer den Typen. */
import type postgres from 'postgres';
import type { AblaufVerlauf, Ablaufvorlage, AblaufvorlageDaten, MappenAblauf } from '../../../../shared/src/ablaufvorlagen';
import type { FassungArt, GespeicherteFassung } from '../../../../shared/src/fassungen';
import { typKennung } from '../../../../shared/src/kennungen';
import { alsLeerseiten } from '../../../../shared/src/leerseiten';
import type { LoeschDokument, LoeschEintrag } from '../../../../shared/src/loeschprotokoll';
import {
  type Aufgabe,
  type Dokument,
  type DokumentVersion,
  type FallEnde,
  type FallOhneLeserecht,
  type Herkunft,
  type Historienart,
  type Historieneintrag,
  type Mappe,
  type Mappentyp,
  normalisiereZiele,
  type Notiz,
  type OcrStandArt,
  type Werte,
} from '../../../../shared/src/model';
import type { Notfallkontakt } from '../../../../shared/src/notfallkontakte';
import type { Nummernkreis } from '../../../../shared/src/nummernkreis';
import { alsSeitensprachen, teilenAb } from '../../../../shared/src/seitensprachen';
import type { Sicht } from '../../../../shared/src/sichten';
import { spracheAusInfo } from '../../../../shared/src/textsprache';
import type { AuskunftLinkIntern, DokumentImPapierkorb, PapierkorbEintrag } from '..';

export type Zeile = Record<string, unknown>;

export const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const isoOder = (v: unknown) => (v === null || v === undefined ? null : iso(v));
/** Zeile der Tabelle notfallkontakte (#812). */
export const notfallkontaktAus = (z: Record<string, unknown>): Notfallkontakt => ({
  id: z.id as string,
  name: z.name as string,
  email: z.email as string,
  telefon: z.telefon as string,
  notiz: z.notiz as string,
  antwortAn: z.antwort_an === true,
  eingetragenVon: (z.eingetragen_von as string | null) ?? null,
  eingetragenVonName: z.eingetragen_von_name as string,
  mailStand: z.mail_stand as Notfallkontakt['mailStand'],
  mailAm: isoOder(z.mail_am),
  mailFehler: (z.mail_fehler as string | null) ?? null,
  erstellt: iso(z.erstellt),
  geaendert: iso(z.geaendert),
});
/** Abruf-Link (#455) aus einer Zeile. */
export const alsLink = (r: Record<string, unknown>): AuskunftLinkIntern => ({
  id: r.id as string,
  auskunftId: r.auskunft_id as string,
  mappeId: r.mappe_id as string,
  titel: (r.titel as string) ?? '',
  schluessel: r.schluessel as string,
  code: r.code as string,
  codeArt: r.code_art as 'erzeugt' | 'eigen',
  empfaenger: (r.empfaenger as string | null) ?? null,
  erstellt: iso(r.erstellt),
  erstelltVon: (r.erstellt_von as string | null) ?? null,
  ablauf: iso(r.ablauf),
  maxAbrufe: r.max_abrufe as number,
  abrufe: r.abrufe as number,
  fehlversuche: r.fehlversuche as number,
  gesperrt: isoOder(r.gesperrt),
  widerrufen: isoOder(r.widerrufen),
  abgerufen: isoOder(r.abgerufen),
});
export const alsTyp = (r: Zeile): Mappentyp => ({
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
  // Mehrzahl (#1446, Migration 122): nur, wenn eingetragen.
  ...(r.mehrzahl ? { mehrzahl: r.mehrzahl as string } : {}),
  // Ist Teil einer anderen Mappe (#1031, Migration 097): nur, wenn eingestellt.
  ...(r.teil_von ? { teilVon: r.teil_von as string } : {}),
  // In der allgemeinen Suche zeigen (#1220, Migration 116): nur, wenn eingestellt.
  ...(typeof r.in_suche === 'boolean' ? { inSuche: r.in_suche } : {}),
  erstellt: iso(r.erstellt),
  geaendert: iso(r.geaendert),
});
export const alsKreis = (r: Zeile): Nummernkreis => ({
  schluessel: String(r.schluessel),
  name: String(r.name),
  muster: String(r.muster),
  start: Number(r.start),
  staende: (r.staende ?? {}) as Record<string, number>,
  zuletzt: (r.zuletzt ?? []) as Nummernkreis['zuletzt'],
});

export const alsVersion = (r: Zeile): DokumentVersion => ({
  dokumentId: r.dokument_id as string,
  nummer: r.nummer as number,
  name: r.name as string,
  mime: r.mime as string,
  groesse: Number(r.groesse),
  sha256: r.sha256 as string,
  anzeigbar: r.anzeigbar as boolean,
  erstellt: iso(r.erstellt),
  erstelltVon: (r.erstellt_von as string | null) ?? null,
  herkunft: (r.herkunft as Herkunft | null) ?? null,
});

export const alsMappe = (r: Zeile): Mappe => ({
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
/** E-Mail-Postfach (#999): Eingangsreihenfolge und Kennzeichen „Original-E-Mail“ – nur, wo gesetzt. */
const eingangsfelder = (r: Zeile): Pick<Dokument, 'eingangNr' | 'originalEmail' | 'eingangFuer'> => ({
  ...(r.eingang_nr ? { eingangNr: r.eingang_nr as number } : {}),
  ...(r.original_email ? { originalEmail: true } : {}),
  ...(r.eingang_fuer ? { eingangFuer: r.eingang_fuer as string } : {}),
});
export const alsDokument = (r: Zeile): Dokument => ({
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
  sprache:
    (r.sprache as string | null | undefined) ??
    (r.ocr_stand === 'fertig' ? (spracheAusInfo(r.ocr_info as string | null)?.sprache ?? null) : null),
  // Mehrere Sprachen (#579): weitere Sprachen und der Hinweis „Post teilen?“ aus den Seitensprachen.
  weitereSprachen: (r.weitere_sprachen as string[] | null | undefined) ?? [],
  teilenAb: r.teilen_hinweis_aus ? null : teilenAb(alsSeitensprachen(r.seitensprachen)),
  // Leerseiten (#997): nur, wenn ein Paket oder eine Person Seiten markiert hat.
  ...(r.leerseiten ? { leerseiten: alsLeerseiten(r.leerseiten) } : {}),
  // Anlagen (#998): nur an Anlagen.
  ...(r.anlage_zu ? { anlageZu: r.anlage_zu as string, anlageNr: (r.anlage_nr as number | null) ?? null } : {}),
  ...eingangsfelder(r),
  ocr: {
    stand: (r.ocr_stand as OcrStandArt | null) ?? 'keiner',
    info: (r.ocr_info as string | null) ?? null,
    seiten: (r.ocr_seiten as number | null) ?? null,
    zeit: r.ocr_zeit ? iso(r.ocr_zeit) : null,
  },
  // Versionierung (#194)
  version: (r.version as number | null) ?? 1,
  herkunft: (r.herkunft as Herkunft | null) ?? null,
  ...(r.aeltere !== undefined ? { aeltere: Number(r.aeltere) } : {}),
});
export const alsFall = (r: Zeile): FallOhneLeserecht => ({
  id: r.id as string,
  aufgabeId: r.aufgabe_id as string,
  mappeId: r.mappe_id as string,
  benutzerId: r.benutzer_id as string,
  aufgabentext: r.aufgabentext as string,
  beginn: iso(r.beginn),
  ende: isoOder(r.ende),
  endeGrund: (r.ende_grund as FallEnde | null) ?? null,
  leserechtSeit: isoOder(r.leserecht_seit),
  leserechtVon: (r.leserecht_von as string | null) ?? null,
  ...(r.typ_id ? { mappeTitel: (r.mappe_titel as string | null) ?? '', typId: r.typ_id as string } : {}),
});
export const alsAufgabe = (r: Zeile): Aufgabe => ({
  id: r.id as string,
  mappeId: r.mappe_id as string,
  empfaengerId: (r.empfaenger_id as string | null) ?? null,
  art: r.art as Aufgabe['art'],
  text: r.text as string,
  feldKey: (r.feld_key as string | null) ?? null,
  ...(r.datum ? { datum: tag(r.datum) } : {}),
  ...(r.anlass ? { anlass: r.anlass as Aufgabe['anlass'] } : {}),
  erstellt: iso(r.erstellt),
  erstelltVon: (r.erstellt_von as string | null) ?? null,
  erledigt: r.erledigt ? iso(r.erledigt) : null,
  erledigtVon: (r.erledigt_von as string | null) ?? null,
  ...(r.mappe_titel !== undefined ? { mappeTitel: (r.mappe_titel as string | null) ?? '', typId: r.typ_id as string } : {}),
});
export const alsHistorie = (r: Zeile): Historieneintrag => ({
  id: Number(r.id),
  mappeId: r.mappe_id as string,
  zeit: iso(r.zeit),
  benutzerId: (r.benutzer_id as string | null) ?? null,
  art: r.art as Historienart,
  daten: (r.daten as Historieneintrag['daten']) ?? {},
});
/** date-Spalte → JJJJ-MM-TT (postgres.js liest „2027-09-30“ als Mitternacht UTC). */
const tag = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
export const alsAblauf = (r: Zeile): MappenAblauf => ({
  id: r.id as string,
  vorlage: (r.vorlage as string | null) ?? 'erinnern',
  mappeId: r.mappe_id as string,
  empfaengerId: (r.empfaenger_id as string | null) ?? null,
  datum: tag(r.datum),
  text: r.text as string,
  erstellt: iso(r.erstellt),
  erstelltVon: (r.erstellt_von as string | null) ?? null,
  angehalten: (r.angehalten as MappenAblauf['angehalten']) ?? null,
  ...(r.mappe_titel !== undefined ? { mappeTitel: (r.mappe_titel as string | null) ?? '', typId: r.typ_id as string } : {}),
});
export const alsVorlage = (r: Zeile): Ablaufvorlage => {
  const d = (r.daten ?? {}) as Partial<AblaufvorlageDaten>;
  return {
    kennung: r.kennung as string,
    name: r.name as string,
    reihenfolge: Number(r.reihenfolge),
    beschreibung: d.beschreibung ?? '',
    typen: d.typen ?? [],
    wann: d.wann ?? { art: 'sofort' },
    fragen: d.fragen ?? [],
    karten: d.karten ?? [],
    aktiv: r.aktiv as boolean,
    herkunft: r.herkunft as Ablaufvorlage['herkunft'],
    paketId: (r.paket_id as string | null) ?? null,
    version: Number(r.version),
    geaendert: iso(r.geaendert),
    geaendertVon: (r.geaendert_von as string | null) ?? null,
  };
};
export const alsVerlauf = (r: Zeile): AblaufVerlauf => ({
  id: r.id as string,
  vorlage: r.vorlage as string,
  mappeId: (r.mappe_id as string | null) ?? null,
  ablaufId: (r.ablauf_id as string | null) ?? null,
  personId: (r.person_id as string | null) ?? null,
  zeit: iso(r.zeit),
  art: r.art as AblaufVerlauf['art'],
  text: (r.text as string) ?? '',
});
export const alsNotiz = (r: Zeile): Notiz => ({
  id: r.id as string,
  mappeId: r.mappe_id as string,
  text: r.text as string,
  erstellt: iso(r.erstellt),
  erstelltVon: (r.erstellt_von as string | null) ?? null,
  geaendert: iso(r.geaendert),
  geaendertVon: (r.geaendert_von as string | null) ?? null,
});
/** Eintrag im Papierkorb aus der Zeile; die Mappe steht als jsonb (Spaltennamen der Tabelle mappen) darin. */
/** Dokument im Papierkorb (#344). */
export const alsDokPapierkorb = (r: Zeile): DokumentImPapierkorb => {
  const d = r.dokument as Zeile;
  return {
    id: r.id as string,
    mappeId: r.mappe_id as string,
    registerKey: d.register_key as string,
    name: d.name as string,
    mime: d.mime as string,
    groesse: Number(d.groesse),
    sha256: d.sha256 as string,
    erstellt: iso(d.erstellt),
    erstelltVon: (d.erstellt_von as string | null) ?? null,
    ...(d.anlage_zu ? { anlageZu: d.anlage_zu as string } : {}),
    versionen: Number(r.anzahl_versionen ?? 0),
    geloescht: iso(r.geloescht),
    geloeschtVon: (r.geloescht_von as string | null) ?? null,
  };
};
export const alsPapierkorb = (r: Zeile): PapierkorbEintrag => {
  const m = r.mappe as Zeile;
  return {
    id: r.id as string,
    typId: r.typ_id as string,
    titel: (m.titel as string | null) ?? '',
    werte: (m.werte as Werte) ?? {},
    demo: !!m.demo,
    erstellt: iso(m.erstellt),
    erstelltVon: (m.erstellt_von as string | null) ?? null,
    geaendert: iso(m.geaendert),
    geaendertVon: (m.geaendert_von as string | null) ?? null,
    geloescht: iso(r.geloescht),
    geloeschtVon: (r.geloescht_von as string | null) ?? null,
    dokumente: Number(r.anzahl_dokumente ?? 0),
    vorgang: (r.vorgang as string | null) ?? null,
    entkoppelt: (r.entkoppelt as Array<{ quelleId: string; feldKey: string }> | null) ?? [],
  };
};
export const alsFassung = (r: postgres.Row): GespeicherteFassung => ({
  art: r.art as FassungArt,
  eintrag: r.eintrag as string,
  nr: Number(r.nr),
  name: r.name as string,
  daten: r.daten,
  urheber: r.urheber as GespeicherteFassung['urheber'],
  vorgang: (r.vorgang as string | null) ?? null,
  wiederhergestellt: r.wiederhergestellt == null ? null : Number(r.wiederhergestellt),
  zeit: iso(r.zeit),
  bis: iso(r.bis),
  geloescht: (r.geloescht as GespeicherteFassung['geloescht']) ?? null,
});

/* Löschprotokoll (#470) */
export const loeschDok = (d: Zeile): LoeschDokument => ({
  dokumentId: d.id as string,
  version: Number(d.version ?? 1),
  sha256: d.sha256 as string,
  groesse: Number(d.groesse),
  mime: String(d.mime ?? ''),
  seiten: d.ocr_seiten === null || d.ocr_seiten === undefined ? null : Number(d.ocr_seiten),
  archivnummer: (d.archivnummer as string | null) ?? null,
});
export const loeschVersion = (v: Zeile): LoeschDokument => ({
  dokumentId: v.dokument_id as string,
  version: Number(v.nummer),
  sha256: v.sha256 as string,
  groesse: Number(v.groesse),
  mime: String(v.mime ?? ''),
  seiten: null,
  archivnummer: null,
});
export const alsLoeschEintrag = (r: Zeile): LoeschEintrag => ({
  id: r.id as string,
  zeit: iso(r.zeit),
  art: r.art as LoeschEintrag['art'],
  schritt: r.schritt as LoeschEintrag['schritt'],
  weg: r.weg as LoeschEintrag['weg'],
  mappeId: r.mappe_id as string,
  typId: (r.typ_id as string | null) ?? null,
  typ: r.typ_name as string,
  nummer: (r.nummer as string | null) ?? null,
  archivnummer: (r.archivnummer as string | null) ?? null,
  dokumentId: (r.dokument_id as string | null) ?? null,
  version: r.version === null ? null : Number(r.version),
  sha256: (r.sha256 as string | null) ?? null,
  groesse: r.groesse === null ? null : Number(r.groesse),
  mime: (r.mime as string | null) ?? null,
  seiten: r.seiten === null ? null : Number(r.seiten),
  anzahl: (r.anzahl as LoeschEintrag['anzahl']) ?? null,
  vonId: (r.von_id as string | null) ?? null,
  von: r.von_name as string,
  ausloeser: r.ausloeser as LoeschEintrag['ausloeser'],
  grund: (r.grund as LoeschEintrag['grund']) ?? null,
  grundText: r.grund_text as string,
  vorgang: (r.vorgang as string | null) ?? null,
  startId: (r.start_id as string | null) ?? null,
});

export const alsSicht = (r: Zeile): Sicht => ({
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
