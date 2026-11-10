import { createHash, randomUUID } from 'node:crypto';
import {
  kannAusPost, darfLoeschen, istLeer, sortierbar, MAX_AUSWAHL, MAX_DATEIGROESSE,
  ABRUF_ART, type Abrufweg, type Abruffassung, type Modusspur, type Kontorolle, type Systemkonto, verweiseVon,
  AUFGABE_MAX, fotoBetreff, istVersendet, istEmail, NOTIZ_MAX, POST_KANAL, POST_RICHTUNG, POST_STAND, auswahlText, darfPostAnlegen, abwesenheitWirkt, VERTRETER_SCHRITTE, type Abwesenheit, type Aufgabe, type AufgabenAnlass, type FallEnde, type FallOhneLeserecht, type Aufgabenart, type Benutzer, type Dokument, type Herkunft, type Vertretung, type Feld, type Feldaenderung, type Notiz, type Historienart, type Historieneintrag, type Mappe, type Mappentyp, type MappenBezug, type Register, type Wert, type Werte,
} from '../../shared/src/model';
import { DateiFehlt, type Dateispeicher } from './dateispeicher';
import type { Mailer } from './mail';
import { Auftraege } from './auftrag';
import { kontext, protokoll } from './protokoll';
import { istVerklemmung } from './db';
import { EIGENE_MAPPEN, fingerabdruck, Haushaltsstand, MINDESTENS_MS, mitFavoriten, NUR_FAVORITEN, zeitabhaengig, ZAEHLT_FUER_TERMINE, Zaehlerspeicher, type Gueltigkeit } from './zaehlerspeicher';
import { jeAnfrage } from './lesespeicher';
import { speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import { rechteMessen } from './messung';
import { graubild } from './graubild';
import { Fachfehler } from './fehler';
import { bilderZuPdf, fuegeZusammen, pruefeAuswahl, pruefeTeile, SEITENBILDER_MAX, Seitenbilder, seitenInfo, teile, teilName } from './pdfseiten';
import { bildSeitePdf } from './pdf';
import { aufkleberPdf, ETIKETTEN } from './aufkleber';
import { alsText, erwaehnungen } from '../../shared/src/markdown';
import { liesAnsicht, liesEigene, OHNE_EINSTELLUNG } from '../../shared/src/werkbankansicht';
import { istVerschluesselt, type Betroffen, type Tresor } from './tresor';
import type { Einstellungen } from './einstellungen';
import { istUuid, KonfigurationVeraltet, type DokumentImPapierkorb, type FristKandidat, type NeueMappe, type PapierkorbEintrag, type Repo, type Rueckverweis, type SeitenAnfrage, type SortierungIntern } from './repo';
import { suchbegriffe, vorschlagAus, type Varianten } from '../../shared/src/suche';
import { ausgangAus, bereinigeBeschriftungen, type TypTeile } from '../../shared/src/beschriftung';
import {
  auswahlKlausel, setzeEigeneWerte, bereinigeBedingungen, filterFuer, heuteIn, kinderVon, klauselnFuer, verschiebe, waereKreis, wirksameTypen, zeigtAlleTypen,
  type Aufloesung, type Bedingung, type Klausel, type Sicht, type SichtDaten,
} from '../../shared/src/sichten';
import type { Readable } from 'node:stream';
import { aufbewahrenBis, datumText, inFrist } from '../../shared/src/archiv';
import type { ExportQuelle } from './vollexport';
import { sammleBaum, type BaumQuelle } from './baum';
import { BAUM_STANDARD, bereinigeBaumOptionen, verweisartVon, type Baum } from '../../shared/src/baum';
import { liesLoeschAuswahl, loeschErinnerung, loeschVorschlag, LOESCH_TIEFE, planeLoeschung, type LoeschKante, type LoeschPlan, type LoeschVorschau } from '../../shared/src/loeschbaum';
import { AUSKUNFT_PASSWORT_MIN, auswahlProbleme as auskunftProbleme, fristBis, liesAuswahl, liesDatenschutz, personenTypen, type AuskunftErwaehnung, type AuskunftMappe, type AuskunftVorschau, type Datenschutz } from '../../shared/src/auskunft';
import { auskunftMail, auskunftVerzeichnis, FRIST_SCHLUESSEL, FRIST_TEXT_ANFANG, type AuskunftEintrag, LINK_FEHLVERSUCHE_MAX, LINK_STATUS, liesLinkEingabe, linkStatus, normiereCode, type AuskunftLink, type AuskunftStand } from '../../shared/src/auskunft';
import { neuerAbrufcode, SCHLUESSEL_MUSTER } from './abruf';
import { alsZeile, liesAnlass, liesFilter, LOESCH_MAX, LOESCH_SPALTEN, LOESCHGRUENDE, LOESCHPROTOKOLL_JAHRE_MAX, LOESCHPROTOKOLL_STANDARD_JAHRE, LOESCHSCHRITTE, LOESCHWEGE, AUSLOESER, type Ausloeser, type LoeschDokument, type LoeschEintrag, type LoeschKontext, type Loeschweg } from '../../shared/src/loeschprotokoll';
import { hashePasswort, hasheSchluessel, neuerSchluessel, pruefePasswort } from './passwort';
import type { AuskunftLinkIntern } from './repo';
import type { AuskunftDaten } from './auskunft';
import type { Nummernkreis } from '../../shared/src/nummernkreis';
import { csvAus, type Zelle } from './xlsx';
import { arbeite } from './arbeit';
import { schriftstueckPdf } from './schriftstueck';
import { eindeutig, exportSpalten, mappenPdf, sichererName, spaltenKopf, zeile } from './export';
import { zipGroesse, zipStrom, ZIP_MAX, type ZipEintrag } from './zip';
import { fuerAusgabe, kannStempeln, weitergabeWas, type Ausgabe } from './ausgabe';
import { mitnehmbar, pruefeAlle, sichtVerboten, verboten, type Ausgang, type Ausgangsrechte } from './ausgang';
import { analysiere as schwaerzAnalyse, schwaerze, seitenbild as schwaerzSeitenbild, type Analyse as SchwaerzAnalyse } from './schwaerzen';
import { bereicheVon, findeBegriff, findeMuster, geschwaerztName, istMuster, kannSchwaerzen, MUSTER, pruefeBegriffe, pruefeBereiche, SCHWAERZEN_MAX_SEITEN, stellenText, type Bereich } from '../../shared/src/schwaerzen';
import { analysiere, ergebnisText, istStufe, MIN_ERSPARNIS, STANDARD_STUFE, stufeAus, STUFEN, verkleinere, type Analyse, type Stufe } from './verkleinern';
import { geltenderStempel, liesStempelTyp, liesVorlagen, NEUER_STEMPEL, WEBDAV_VORLAGE, pruefeVorlage, stempelAus, StempelFehler, STEMPEL_MODI, STEMPEL_NAME_MAX, STEMPEL_VORLAGEN_MAX, stempelDatum, wunschAus, type GeltenderStempel, type StempelTyp, type StempelVorlage, type StempelWunsch } from '../../shared/src/stempel';
import { alleSichtRechte, bereinigeSichtRegelwerk, sichtRegelProblem, sichtTestlauf, type SichtRegelwerk } from '../../shared/src/sichtrechte';
import { liesDirektlink } from '../../shared/src/direktlink';
import { erkenneSprache, istTextsprache, SPRACHE_MARKE, sprachname, spracheZuInfo, TEXTSPRACHEN } from '../../shared/src/textsprache';
import { dokumentsprachen, MAX_SEITENSPRACHEN, seitentexte, seitenZusammensetzen, SEITENVORSCHUB, SPRACHEN_JE_SEITE, zeichenzahl, type Seitensprache } from '../../shared/src/seitensprachen';
import { ALLE_TYPEN, INHALT_EREIGNISSE, MAPPEN_EREIGNISSE, hatSchnittstelle, istKiPaket, kenntVolltextOhneText, PAKET_TEXT, PAKET_VOLLTEXT, type EreignisArt, type InstalliertesPaket, type KiUebersicht, type BeispielStand } from '../../shared/src/pakete';
import { INFO_TEXTEBENE, infoWartet, NICHT_GESPEICHERT } from '../../shared/src/volltext';
import { dateitypName, erkenneBildtyp, INFO_UMWANDLUNG, infoFassung, infoUmwandlung, katalogUmwandlung, kernTyp, UMWANDELN_MAX_BYTES, type FassungInfo } from '../../shared/src/dateiumwandlung';
import type { Dateiumwandlung, FassungsAblage, UmwandlungsAnbindung } from './dateiumwandlung';
import { PaketVolltext } from './paketvolltext';
import type { ArchivAblage, ArchivAnbindung, Archivfassung } from './archivfassung';
import type { EntsperrenAnbindung, PdfEntsperren } from './entsperren';
import { archivfassungName, MAIL_TYPEN, pruefeWoerter } from '../../shared/src/archivfassung';
import { vorgaben } from '../../shared/src/paketeinstellungen';
import { liesPdfA, textebeneWoerter } from './pdf';
import { INFO_VOLLTEXT_DURCH, INFO_VOLLTEXT_PAKET, infoVolltextPaket, katalogVolltext, VOLLTEXT_ZEICHEN_MAX } from '../../shared/src/paketvolltext';
import { systemkontoAuffaellig, type SystemkontoFehler } from '../../shared/src/systemkonten';
import { abfrageAus, liesSuche } from '../../shared/src/erweitertesuche';
import type { AusDokument } from '../../shared/src/erkennung';
import { FragenAnDieAblage } from './fragen';
import { Uebersetzung } from './uebersetzung';
import { Erkennung, sichereZuordnung, type PostErkennung } from './erkennung';
import { favoritenErlaubt, freigabeZumSpeichern, liesFavoritenFreigabe, type FavoritenFreigabe } from '../../shared/src/favoritenfreigabe';
import { t } from './sprache';
import { Ereignisverteiler } from './ereignisse';
import { zeitzone } from '../../shared/src/region';
import { Eingang, shaVon } from './hochladen';
import { EREIGNISKATALOG, VERALTETE_EREIGNISSE, type Ausloeser as EreignisAusloeser, type KatalogArt, type KatalogEreignis, type Katalogeintrag } from '../../shared/src/ereignisse';
import { datumDe, ERINNERUNG_TEXT_MAX, fristAb, fristEmpfaenger, fristFelder, fristText, folgetermine, istDatum, naechsterTermin, type Erinnerung, type Termin, type TermineAntwort } from '../../shared/src/fristen';
import { zeitraumProblem } from '../../shared/src/kalender';
import { ansichtSymbol } from '../../shared/src/ansichtsymbole';
import { feiertageZwischen, type Bundesland } from '../../shared/src/feiertage';
import { kontoRegelwerk, bereinigeRegelwerk, istOffen, kopiereRegel, kurz, leseAusdruck, NICHTS, nicht, oder, rechteAn as rechteAnMappe, rechteUebersicht, regelProblem, regelwerkVon, type Ausdruck, type Regelwerk, type Mappenquelle, type Recht, type Rechte } from '../../shared/src/rechte';
import { gebietsschema } from '../../shared/src/sprache';
import { EMAIL_MAX_ANHAENGE, KB, MB } from './grenzen';
import { SucheDienst } from './suche';
import { NICHT_SICHTBAR, ZugriffDienst } from './zugriff';
import { ABO_ARTEN, dokInfo, Kern, type Loeschprotokoll, PAPIERKORB_STANDARD_TAGE, versionInfo, type Anlass, type ProtokollMappe, type ProtokollTeil, type SystemIds, type Zugreifender, type Zugriff, type BenutzerGespiegelt } from './kern';
import { Systemausstattung } from './systemausstattung';
import { behalteBeschriftungen, bereinigeFeld, bereinigeTyp, liesStand, MappentypenDienst, Nummernkreise, Passung, Systemtypen, TYP_TEILE, TypPakete, type Benutzerspiegel } from './mappentypen';
export { bereinigeFeld, bereinigeTyp, behalteBeschriftungen };
export type { Benutzerspiegel };
export { ABO_ARTEN, PAPIERKORB_STANDARD_TAGE };
export type { Anlass, LeserechtAufZeit, Zugriff } from './kern';
import { paketEinstellungen } from './pakete/index';
import { bereinigeWerte, keinSchluessel, MappenArchiv, MappenDienst, MappenEingaben, MappenHistorie, MappenTitel, Passwortfelder } from './mappen';
export { ARCHIV_PRAEFIX, archivnummerAus, HISTORIE_SEITE_MAX, HISTORIE_STANDARD_TAGE } from './mappen';
export type { KatalogSchluessel, PaketQuelleEintrag } from './pakete/index';

/** Mappen in der Reihenfolge der Ids (#542: mit Index statt `indexOf` je Vergleich – bei 20.000 Mappen Sekunden). */
function inReihenfolge<T extends { id: string }>(liste: T[], ids: string[]): T[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return liste.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

/* ---------- Eingaben bereinigen: nur bekannte Eigenschaften übernehmen ---------- */

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
/** Empfänger aus Abfrageparametern (API v1) – gilt auch für den Pflicht-Stempel ohne eigenen Wunsch (#799). */
const empfaengerAus = (q: unknown) => { const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>; const e = o.empfaenger ?? o['empfänger']; const s = Array.isArray(e) ? e[0] : e; return typeof s === 'string' ? s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120) : ''; };

/** Dokument im Papierkorb mit Mappe und Register (#344). */
export interface DokumentImKorb extends DokumentImPapierkorb { art: 'dokument'; typId: string; mappeTitel: string; register: string; mappe: 'da' | 'papierkorb' | 'weg' }
/** Aufgelöste Post im Papierkorb (#936): in welche Mappe; `da` = die Mappe gibt es noch. */
export interface AufgeloestIn { id: string; typId: string; titel: string; da: boolean }
/** Wo eine gleiche Datei schon liegt (#333) – nur lesbare Mappen. */
/** Antwort eines Pakets auf einen Aufruf eines Ereignisses (#636). rc: Rückgabewert des Pakets; beginn: Start des Aufrufs (ms). */
export interface EreignisAufruf { ok: boolean; text: string; fehler: string | null; rc: number | null; beginn: number }
export interface Fundstelle { mappeId: string; typId: string; titel: string; typ: string; register: string; name: string; erstellt: string }
/** Zähler-Endpunkt (#625): nur Zahlen, keine Inhalte. */
export interface Zaehlerzahlen { neuePost: number; zuErledigen: number; ueberfaellig: number }


/** Ein Konto, das kein Mensch ist (#673), für Werkbank → Benutzer. */
export interface SystemkontoEintrag {
  id: string; name: string; rolle: Kontorolle; aktiv: boolean; systemkonto?: string;
  paketId?: string; paket?: string | null; automatisierungen: Array<{ id: string; name: string; angehalten?: boolean }>;
  /**
   * Auffälligkeiten (#817), auch eingeklappt in der Kopfzeile sichtbar: `fehler` – Konto deaktiviert (obwohl sein
   * Paket noch da ist) oder eine seiner Automatisierungen angehalten; `weitreichend` – das Paket darf alle Mappentypen ändern oder alle
   * lesen und dazu ins Netz (`systemkontoAuffaellig` in shared/src/systemkonten.ts).
   */
  fehler?: SystemkontoFehler; weitreichend?: boolean;
}

/** Ein Anhang einer E-Mail (#723): Dokument (oder das PDF „Angaben“, dann ohne Dokument) und was hinausgeht. */
interface Versandanhang {
  dokument: Dokument | null; name: string; mime: string; groesse: number;
  /** Bearbeitet (Stempel, verkleinert) oder Archivfassung: liegt als eigene Datei in der Post. */
  ausgabe: Ausgabe | null;
  inhalt(): Promise<Buffer | Readable>;
}
/** Alles, was von einer Mappe per E-Mail hinausgeht. `ausgaben`: die bearbeiteten (für Historie und Hinweise). */
interface Versandteil { m: Mappe; plan: GeltenderStempel | null; angaben: Versandanhang | null; dokumente: Versandanhang[]; ausgaben: Ausgabe[]; groesse: number }

/** Startseite (#918): der nächste Termin erst in so vielen Tagen gesucht, nur ohne Treffer im ganzen Jahr. */
export const NAECHSTER_TERMIN_ERST_TAGE = 31;
/** Obergrenze für geschriebenen Volltext (Zeichen). */
export const VOLLTEXT_MAX = VOLLTEXT_ZEICHEN_MAX;
/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Was mit dem Konto geschieht, wenn eine Benutzer-Mappe den Papierkorb verlässt (#43). */
export interface KontenHaken {
  /** Endgültig gelöscht: Konto löschen. */
  endgueltig(id: string): Promise<void>;
  /** Wiederhergestellt: Konto wieder aktivieren. */
  wiederda(id: string, von: string | null): Promise<void>;
  /** Alle Konten mit Abwesenheit und Vertreter – für die Umleitung von Aufgaben (#78). */
  benutzer?(): Promise<Benutzer[]>;
  /** Konten, die kein Mensch sind (#673): Systemkonten und Dienstkonten der Pakete – nur für den Testlauf der Rechte (#710). */
  ohneMensch?(): Promise<Benutzer[]>;
  /** Dienstkonten der Pakete (#686: Rechte des Paket-Benutzers bei der Zustellung von Ereignissen). */
  dienstkonten?(): Promise<Benutzer[]>;
  /** Persönliche Einstellungen eines Benutzers (#422: Favoriten benachrichtigen, Geänderte hervorheben). */
  einstellungen?(id: string): Promise<Record<string, unknown>>;
  /** Persönliche Einstellung setzen (#506: Vorgabe für neue Benutzer, „auf alle anwenden“); `null` löscht. */
  setzeEinstellung?(id: string, schluessel: string, wert: unknown): Promise<void>;
}

/** Post auflösen (#936): „Aus Post … angelegt“ nur, wenn dieselbe Person die Mappe höchstens so lange vorher angelegt hat. */
const AUFLOESEN_FRIST_MS = 60 * 60 * 1000;
export { EMAIL_MAX_ANHAENGE };
export const EMAIL_MAX_EMPFAENGER = 20;
/** Höchstens so viele Mappen in einer E-Mail (#151). */
export const EMAIL_MAX_MAPPEN = 100;
/** Sammel-Weitergabe (#415): höchstens so viele Aufgaben auf einmal; Schlüssel der Sammelbenachrichtigung. */
export const SAMMEL_MAX = 1000;
export const SAMMEL_WEITERGABE = 'weitergabe';
export interface DienstOptionen {
  /** Schlüssel für Passwortfelder (#39, #46). */
  tresor?: Tresor;
  /** Einstellungen des Haushalts (Papierkorb). Ohne: kein Papierkorb (Löschen sofort endgültig). */
  einstellungen?: Einstellungen;
  /**
   * Zustand zwischen Anfragen (#744). In PostgreSQL (`pgKurzzustand`) gilt er für alle Prozesse; ohne Angabe im
   * Arbeitsspeicher dieses Prozesses. (Der Stand des Haushalts liegt seit #741/#742 eigens in der Datenbank.)
   */
  zustand?: Kurzzustand;
}

const SYSTEMSORTIERUNG: Record<string, SortierungIntern['art']> = {
  _titel: 'titel', _typ: 'typ', _erstellt: 'erstellt', _geaendert: 'geaendert', _erstelltVon: 'erstelltVon', _geaendertVon: 'geaendertVon',
};
/** Sortierung aus Spalte und Richtung; unbekannte oder nicht sortierbare Spalten → nach Titel. */
export function sortierungAus(spalte: string, absteigend: boolean, typ?: Mappentyp): SortierungIntern | undefined {
  if (!spalte) return undefined;
  if (SYSTEMSORTIERUNG[spalte]) return { art: SYSTEMSORTIERUNG[spalte], absteigend };
  const f = typ?.felder.find((x) => x.key === spalte);
  if (!f || !sortierbar(spalte, typ)) return undefined;
  const art = f.typ === 'zahl' || f.typ === 'betrag' || f.typ === 'datum' || f.typ === 'janein' ? f.typ : 'text';
  return { art, key: f.key, absteigend };
}

/** Dateiname ohne Pfadanteile und Steuerzeichen. */
/** Automatisch verkleinern (#393): Einstellung in der Werkbank → Systemzustand; Standard aus. */
export interface VerkleinernEinstellung { automatisch: boolean; abMb: number; stufe: Stufe }
export const VERKLEINERN_STANDARD: VerkleinernEinstellung = { automatisch: false, abMb: 5, stufe: STANDARD_STUFE };
export function verkleinernEinstellungAus(v: unknown): VerkleinernEinstellung {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const abMb = Number(o.abMb);
  return {
    automatisch: o.automatisch === true,
    abMb: Number.isFinite(abMb) && abMb >= 1 && abMb <= 100 ? abMb : VERKLEINERN_STANDARD.abMb,
    stufe: istStufe(o.stufe) ? o.stufe : VERKLEINERN_STANDARD.stufe,
  };
}
/** Neue Dateien von außen, die automatisch verkleinert werden dürfen – nicht im DMS Bearbeitetes oder Zurückgeholtes. */
const AUTOMATISCH_VERKLEINERN: ReadonlySet<Herkunft> = new Set<Herkunft>(['hochgeladen', 'api', 'webdav', 'eingang']);
/** Werkbank: so viele große PDFs in der Liste und in einer Sammelaktion, davon so viele mit Schätzung. */
export const GROSSE_MAX = 200;
export const GROSSE_MIT_SCHAETZUNG = 60;
/** Volltext übernehmen statt neu erkennen (Verkleinern ohne Versionierung). */
interface Volltextuebernahme { text: string; seiten: number | null; info: string | null }

/** Kurztext der Historie für „PDF bearbeitet“ (#335). */
function pdfText(w: { seiten: number; vorher: number; gedreht?: number; teile?: number }): string {
  const eintrag: string[] = [];
  if (w.teile) eintrag.push(t('meldungen.dienst.in-teile-geteilt', { teile: w.teile }));
  if (w.seiten !== w.vorher && !w.teile) eintrag.push(`${w.vorher} → ${w.seiten} Seiten`);
  if (w.gedreht) eintrag.push(`${w.gedreht} ${t('meldungen.dienst.seiten', { anzahl: w.gedreht })} gedreht`);
  return eintrag.join(', ') || t('meldungen.dienst.seiten-umsortiert');
}

function dateiname(v: unknown): string {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen aus Dateinamen entfernen ist der Zweck
  const s = text(v).split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (s || 'Dokument').slice(0, 200);
}

/** Prüfwert von Feldwerten (#878): JSON mit sortierten Schlüsseln, damit die Reihenfolge aus der Datenbank nicht zählt. */
function pruefwertVon(werte: unknown): string {
  const sortiert = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortiert) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sortiert(x)])) : v);
  return createHash('sha256').update(JSON.stringify(sortiert(werte ?? {}))).digest('hex');
}

/** Nur PDF und gängige Bilder werden im Browser angezeigt – erkannt am Inhalt, nicht am Namen. */
export function erkenneAnzeigbar(b: Buffer): string | null {
  const kopf = b.subarray(0, 12).toString('latin1');
  if (kopf.startsWith('%PDF-')) return 'application/pdf';
  if (b[0] === 0x89 && kopf.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (kopf.startsWith('GIF87a') || kopf.startsWith('GIF89a')) return 'image/gif';
  if (kopf.startsWith('RIFF') && kopf.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/* ---------- Fachlogik ---------- */

/** Was der Dienst von der Texterkennung braucht (#45, #458). */
export interface TexterkennungAnbindung {
  anstossen(): void;
  erkenneSofort?(inhalt: Buffer, mime: string): Promise<{ text: string; info: string }>;
  /** Ausdrücklich neu erkennen (#458): Warteschlange, das Paket bekommt `neu`. */
  neuErkennen?(id: string): Promise<void>;
  /** Sofort, ohne Warteschlange (#458, „Volltext neu erzeugen“). */
  jetzt?(id: string, opt: { neu: boolean; signal?: AbortSignal }): Promise<void>;
}

/** Ereignis „Volltext fertig“ (#458): wer den Volltext geliefert hat und ob es Text gibt. */
export interface VolltextMeldung {
  /** kern: Textebene bzw. eingebaute Texterkennung; paket: ein Paket; api: über die Schnittstelle; kopie: von einem anderen Dokument übernommen. */
  quelle: 'kern' | 'paket' | 'api' | 'kopie';
  /** Nennenswerter Text vorhanden? */
  text: boolean;
  mime?: string; seiten?: number | null;
  /** Ausdrücklich neu erzeugen (Werkbank „für alle“, „erneut“ am Dokument): das Paket erkennt auch Dokumente mit Text neu. */
  neu?: boolean;
  /** Bei quelle paket: welches. */
  paket?: string;
  /** Gemischte PDFs (#458): Seiten (ab 1) ohne Textebene – eine Texterkennung erkennt nur diese und hängt sie an. */
  seitenOhneText?: number[];
  /** Umgewandelte Datei (#577): Typ des Originals; `mime` ist dann der Typ der Fassung. */
  original?: string;
}

/**
 * Alltags-Benutzer für Aufgaben ohne Empfänger (#719): aktiver Mensch. Seit #818 auch eine Person mit Verwaltungsrecht –
 * sie arbeitet im Alltag mit demselben Konto.
 */
export const taugtAlsAufgabenEmpfaenger = (b: Benutzer) => b.aktiv && !b.art;

const ABRUF_PRUEFUNG = 'abruf-pruefung';
/** Belegung einer Code-Prüfung am Abruf-Link: endet spätestens nach dieser Zeit (scrypt dauert Bruchteile davon). */
const ABRUF_PRUEFUNG_MS = 60_000;
/** Fehlende Dateien (#877), die beim Lesen auffielen: für den Hinweis der Werkbank-Übersicht (höchstens so viele). */
const FEHLENDE_DATEIEN = 'dateien_fehlen';
const FEHLENDE_DATEIEN_MAX = 1000;

export class Dienst {
  /**
   * Zustand zwischen Anfragen (#744) – in PostgreSQL für alle Prozesse, sonst im Arbeitsspeicher: u. a. Abruf-Links,
   * deren Code gerade geprüft wird (#455) und die Spur im Verwaltungsmodus (#820).
   */
  readonly kurzzustand: Kurzzustand;
  /** Hintergrundaufträge, z. B. Demo-Daten erzeugen. */
  readonly auftraege = new Auftraege((m) => protokoll.modul('werkbank').info(m));

  private tresor?: Tresor;
  private einstellungen?: Einstellungen;
  private konten?: KontenHaken;

  /**
   * Stand des Haushalts (#512): zählt nach jeder Änderung über das Repo hoch, seit #742 in der Datenbank
   * (Sequenz `haushaltsstand_zahlen`), wenn das Repo eine hat. Er zählt auch bei Erinnerungen (`ZAEHLT_FUER_TERMINE`,
   * für die Termine #528) – früher ein eigener Stand; eine Zahl in der Datenbank genügt, Erinnerungen ändern sich selten.
   */
  readonly stand = new Haushaltsstand(ZAEHLT_FUER_TERMINE);
  /**
   * Mappenstand (#918, Sequenz `haushaltsstand_mappen`): wie `stand`, zählt aber nicht bei Favoriten (`NUR_FAVORITEN`).
   * Daran hängen die Zahlen je Typ und Ansicht (ohne Favoriten), die Zahl der Treffer und die Termine ohne „nur
   * Favoriten“ – ein Stern rechnet sie nicht für alle neu.
   */
  readonly mappenstand = new Haushaltsstand(ZAEHLT_FUER_TERMINE, undefined, { ohne: NUR_FAVORITEN, art: EIGENE_MAPPEN });
  /** Termine (#528, #725): derselbe Stand (#742). */
  get fristenstand() { return this.stand; }
  /**
   * Zahlen der Ablage, die nicht von der Person abhängen (#742): je Typ und je Ansicht. Schlüssel ist der
   * Fingerabdruck genau der Eingaben der Zählung (Lesefilter, Klauseln der sichtbaren Ansichten, Verwaltungsmodus) –
   * wer dieselben Eingaben hat, bekommt dieselbe Zahl; anders geht es nicht.
   */
  private readonly bestand = new Zaehlerspeicher<Awaited<ReturnType<Repo['zaehleBestand']>>>(this.mappenstand);
  /** Dasselbe, wenn der Lesefilter Favoriten meint (#918): dann am Haushaltsstand. */
  private readonly bestandFav = new Zaehlerspeicher<Awaited<ReturnType<Repo['zaehleBestand']>>>(this.stand);
  /** Zahlen der Person (#742): Eingang, Favoriten, Papierkorb – je Person und Lesefilter. */
  private readonly persoenlich = new Zaehlerspeicher<Awaited<ReturnType<Repo['zaehlePersoenlich']>>>(this.stand);
  /** Termine (#528, #725): Zwischenspeicher je Benutzer, Rechte und Zeitraum. */
  private readonly termineSpeicher = new Zaehlerspeicher<Termin[]>(this.mappenstand);
  /** Termine „nur Favoriten“ (bzw. ein Lesefilter mit Favoriten): am Haushaltsstand (#918). */
  private readonly termineFavSpeicher = new Zaehlerspeicher<Termin[]>(this.stand);
  /**
   * Zahl der Treffer einer Liste (#918): je Anfrage ohne Blatt und Reihenfolge (Ansicht bzw. Bedingungen, Lesefilter,
   * Suche) – genau, ohne Mindestgültigkeit: gilt nur bei gleichem Mappenstand (mit Favoriten: Haushaltsstand).
   */
  private readonly trefferSpeicher = new Zaehlerspeicher<number>(this.mappenstand);
  private readonly trefferFavSpeicher = new Zaehlerspeicher<number>(this.stand);
  /** Zähler-Endpunkt (#625): „neue Post für mich bzw. ohne Für“ je Benutzer und Rechte, wie die Zahlen der Ansichten. */
  private readonly neuePostSpeicher = new Zaehlerspeicher<number>(this.stand);
  /** Mindestgültigkeit der Zahlen bei Anfragen nach Änderungen anderer (#742); Tests stellen sie auf 0. */
  mindestensMs = MINDESTENS_MS;
  /** Gültigkeit für die laufende Anfrage: in einer Anfrage mit Person kurz, sonst (Hintergrund) immer frisch. */
  private gueltigkeit(): Gueltigkeit {
    const wer = kontext.getStore()?.benutzerId;
    return wer ? { mindestensMs: this.mindestensMs, wer } : {};
  }

  /** Der Kern (#961): Repo, Transaktion, Ereignisse, Historie und Löschprotokoll schreiben. */
  readonly kern: Kern;
  /** Rechte prüfen (#1072): Zugriff bilden, Rechte an Mappen, lesbare Mappen. */
  readonly rechtepruefung: ZugriffDienst;
  /** Mappentypen (#1073): anlegen, ändern, löschen, prüfen. */
  readonly mappentypen: MappentypenDienst;
  /** Pakete am Mappentyp (#686, #1073). */
  readonly typpakete: TypPakete;
  /** Passung der Mappen zu ihrem Typ (#1073). */
  readonly passung: Passung;
  /** Nummernkreise (#171, #1073). */
  readonly nummernkreise: Nummernkreise;
  /** Systemtypen, Benutzer-Mappen, Spur im Verwaltungsmodus (#1073). */
  readonly systemtypen: Systemtypen;
  /** Historie der Mappen lesen, Abrufe (#57, #800, #1074). */
  readonly mappenHistorie: MappenHistorie;
  /** Titel der Mappen (#1074). */
  readonly mappenTitel: MappenTitel;
  /** Eingaben an Mappen prüfen (#1074). */
  readonly mappenEingaben: MappenEingaben;
  /** Passwortfelder (#46, #1074). */
  readonly passwortfelder: Passwortfelder;
  /** Archivnummern und Archivmodus (#345, #212, #1074). */
  readonly mappenArchiv: MappenArchiv;
  /** Mappen (#1074): anlegen, ändern, holen, Notizen, Favoriten. */
  readonly mappen: MappenDienst;
  /** Suche (#964): unscharfe Suche, gleichbedeutende Wörter, Vektoren und ähnliche Dokumente. */
  readonly suche: SucheDienst;
  /** Systemtypen, Systemrollen und mitgelieferte Ansichten anlegen (#963). */
  readonly systemausstattung: Systemausstattung;

  constructor(grundRepo: Repo, private dateien: Dateispeicher, opt: DienstOptionen = {}) {
    // Stand aus der Datenbank (#742), sonst nur dieser Prozess (speicherRepo in Tests).
    if (typeof grundRepo.haushaltsstand === 'function' && typeof grundRepo.erhoeheHaushaltsstand === 'function') {
      this.stand.verbinde({ lies: () => grundRepo.haushaltsstand!(), erhoehe: () => grundRepo.erhoeheHaushaltsstand!() });
    }
    if (typeof grundRepo.mappenstand === 'function' && typeof grundRepo.erhoeheMappenstand === 'function') {
      this.mappenstand.verbinde({ lies: () => grundRepo.mappenstand!(), erhoehe: () => grundRepo.erhoeheMappenstand!() });
    }
    this.kern = new Kern({ repo: this.stand.umhuelle(grundRepo, this.mappenstand), dateien, einstellungen: opt.einstellungen, stand: this.stand, wecke: () => this.ereignisse.wecke(), ausstatten: () => this.systemausstattung.anlegen(), zugriff: (ich) => this.zugriff(ich) });
    this.rechtepruefung = new ZugriffDienst(this.kern, { kiSperre: (p) => this.kiSperre(p), konten: () => this.konten });
    this.mappentypen = new MappentypenDienst(this.kern, {
      mitStempel: (typen) => this.mitStempel(typen), pruefeStempelTyp: (v) => this.pruefeStempelTyp(v), setzeStempelTyp: (id, st) => this.setzeStempelTyp(id, st),
      erkennung: () => this.erkennung, berechtigungenAusEingabe: (typ, e) => this.berechtigungenAusEingabe(typ, e),
      protokolliereBerechtigungen: (typ, n) => Dienst.protokolliereBerechtigungen(typ, n), konfigurationKonflikt: (art, aktuell) => Dienst.konfigurationKonflikt(art, aktuell),
    });
    this.typpakete = new TypPakete(this.kern, this.rechtepruefung, { kiSperre: (p) => this.kiSperre(p), konten: () => this.konten });
    this.passung = new Passung(this.kern, { passungsAufgaben: (liste) => this.passungsAufgaben(liste) });
    this.nummernkreise = new Nummernkreise(this.kern, { archivKreis: () => this.archivKreis(), aktualisiereTitel: (ids) => this.aktualisiereTitel(ids), auftraege: this.auftraege });
    this.systemtypen = new Systemtypen(this.kern, this.rechtepruefung, {
      schreibeSystemMappe: (typ, id, e, von, kennung) => this.schreibeSystemMappe(typ, id, e, von, kennung), loescheMappeIntern: (id, typ, von) => this.loescheMappeIntern(id, typ, von),
      spiegleBenutzer: (b, von, abwesenheit) => this.spiegleBenutzer(b, von, abwesenheit), aufgabenUebergeben: (id, an, von) => this.aufgabenUebergeben(id, an, von), kurzzustand: () => this.kurzzustand,
    });
    this.mappenHistorie = new MappenHistorie(this.kern);
    this.mappenTitel = new MappenTitel(this.kern, this.mappenHistorie);
    this.mappenEingaben = new MappenEingaben(this.kern, this.rechtepruefung, { verschluessele: (k) => this.verschluessele(k) });
    this.passwortfelder = new Passwortfelder(this.kern, this.mappenHistorie, { tresor: () => this.tresor, istVerschluesselt });
    this.mappenArchiv = new MappenArchiv(this.kern, this.rechtepruefung, this.mappenHistorie, {
      aufkleber: { ETIKETTEN, aufkleberPdf }, auftraege: this.auftraege, schreibeFehlendeDateien: (shas) => this.schreibeFehlendeDateien(shas),
    });
    this.mappen = new MappenDienst(this.kern, this.rechtepruefung, { historie: this.mappenHistorie, titel: this.mappenTitel, eingaben: this.mappenEingaben }, {
      konten: () => this.konten, favoritenBenachrichtigungErlaubt: (id) => this.favoritenBenachrichtigungErlaubt(id), ohneLeserechtText: (liste, lesbar, ich) => this.ohneLeserechtText(liste, lesbar, ich),
      mitArchivStand: (d) => this.mitArchivStand(d), mitPdfSchutz: (d) => this.mitPdfSchutz(d), datenschutz: () => this.datenschutz(),
      loeschPruefung: (m, typ, rueck, alleTypen) => this.loeschPruefung(m, typ, rueck, alleTypen), meldeVerknuepft: (typ, id, alt, neu, von) => this.meldeVerknuepft(typ, id, alt, neu, von),
      verschluessele: (k) => this.verschluessele(k), aktualisiereTitel: (ids) => this.aktualisiereTitel(ids),
    });
    this.suche = new SucheDienst(this.kern, this.rechtepruefung, { konten: () => this.konten });
    // Systemausstattung (#963): Mappentypen, Ansichten und Post nacheinander.
    this.systemausstattung = new Systemausstattung(this.kern, {
      mappentypen: { sichereSystemtypen: () => this.systemtypen.sichereSystemtypen() },
      sichten: { sichtFuerTyp: (typ) => this.sichtFuerTyp(typ), sichereFavoritenSicht: () => this.sichereFavoritenSicht() },
      post: { sicherePostSichten: (post) => this.sicherePostSichten(post) },
    });
    this.schliesseEmpfaengerAn();
    this.kurzzustand = opt.zustand ?? speicherKurzzustand();
    this.tresor = opt.tresor;
    this.einstellungen = opt.einstellungen;
    this.tresor?.registriere(() => this.unlesbarePasswoerter());
    // Was verschlüsselt ist, je Art (#410): dieselben Stellen, die der Schlüsselwechsel umschlüsselt.
    // Passwortfelder meldet unlesbarePasswoerter genauer (mit Feldnamen), den Mailserver der Betrieb.
    this.tresor?.registriereBestand(() => this.repo.verschluesselteFundstellen(), ['passwortfeld', 'mail']);
    // Erkennung (#336): rechnet, sobald der Volltext eines Dokuments fertig ist – egal, wer ihn geliefert hat.
    this.erkennung = new Erkennung(this, () => this.repo, () => this.einstellungen);
    this.fragen = new FragenAnDieAblage(this, () => this.repo, () => this.einstellungen);
    // Inhalte übersetzen (#732): auf Knopfdruck; Änderungen am Original lassen die Übersetzungen verfallen.
    this.uebersetzung = new Uebersetzung(this, () => this.repo, () => this.einstellungen, () => this.kurzzustand);
    this.ereignisse.abonniere('uebersetzung', (e) => this.uebersetzung.nachEreignis(e));
    this.beiVolltextFertig(async (e) => { await this.erkennung.nachVolltext(e); });
    // Ereigniskatalog (#670): Mappen-Ereignisse und Fristen an die Pakete, die diese Mappentypen abonniert haben.
    this.ereignisse.abonniere('pakete', (e) => this.ereignisAnPakete(e));
    // Volltext aus Paketen (#614): zuständige Pakete mit dms:volltext, Ereignis datei.volltext an genau dieses.
    this.paketVolltext = new PaketVolltext({ pakete: () => this.repo.listePakete(), melde: (paket, daten) => this.auftrag(paket, 'datei.volltext', daten) });
  }
  /**
   * Anschlusspunkte (#962): alle sofortigen Empfänger an dieser einen Stelle, in fester Reihenfolge (Test:
   * anlaesse.test.ts, Liste im Entwicklerhandbuch). Eine andere Reihenfolge ist ein eigener Pull Request. Die Empfänger
   * rufen ihre Methoden über `this`, damit Tests sie ersetzen können.
   */
  private schliesseEmpfaengerAn() {
    const a = this.kern.anlaesse;
    // Mappe angelegt bzw. geändert: Passung → Erwähnungen → Fristen → Post-Aufgaben.
    a.mappeGeaendert.anmelden('mappentypen.passung', async (e) => {
      // Gespeichert heißt: passt wieder – eine „passt nicht“-Aufgabe ist damit erledigt.
      if (!e.angelegt) await this.passungsAufgaben([{ id: e.mappe.id, problem: null }]);
      if (e.typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(e.typ);
    });
    a.mappeGeaendert.anmelden('aufgaben.erwaehnungen', async (e) => { if (!e.demo) await this.pruefeErwaehnungen(e.typ, e.mappe.id, e.alt, e.neu, e.von); });
    // Fristen (#129): neues Datum → „Frist erreicht“, verschobenes oder leeres → alte erledigt.
    a.mappeGeaendert.anmelden('aufgaben.fristen', async (e) => {
      if (e.angelegt && (e.demo || !fristFelder(e.typ).length)) return;
      await this.fristenAbgleichen({ mappeIds: [e.mappe.id] });
    });
    // Post (#192): „Für“ und Stand bestimmen die Aufgabe „Post für dich“.
    a.mappeGeaendert.anmelden('post.aufgaben', async (e) => { if (!e.angelegt && e.typ.system === 'post') await this.postAufgaben(e.mappe.id, e.von); });
    // Mappentyp geändert: Ansicht umbenennen → Titel → Passung → Fristen.
    a.typGeaendert.anmelden('sichten.umbenennen', async ({ alt, typ }) => {
      // Die Sicht, die für diesen Typ entstanden ist, heißt weiter wie er – solange sie niemand umbenannt hat.
      const eigene = (await this.repo.listeSichten()).find((x) => x.id === typ.id);
      if (eigene && eigene.name === alt.name && alt.name !== typ.name) await this.repo.aendereSicht(typ.id, { ...eigene, name: typ.name });
    });
    // Vorlage oder Felder können sich geändert haben: Titel aller Mappen dieses Typs neu berechnen.
    a.typGeaendert.anmelden('mappen.titel', async ({ typ }) => { await this.aktualisiereTitel((await this.repo.listeMappen(typ.id)).map((m) => m.id)); });
    a.typGeaendert.anmelden('mappentypen.passung', async ({ typ }) => { await this.pruefePassung(typ.id); });
    // Fristen (#129): Erinnerung neu an oder aus, Vorlauf geändert → gleich abgleichen.
    a.typGeaendert.anmelden('aufgaben.fristen', async ({ typ }) => { await this.fristenAbgleichen({ typId: typ.id }); });
    // Neue Mappentypen bekommen eine eigene Sicht (#38), außer der Administrator wählt das ab.
    a.typAngelegt.anmelden('sichten.eigeneSicht', async ({ typ, sicht }) => { if (sicht) await this.sichtFuerTyp(typ); });
    // Abwesenheit (#78): Historie an der Benutzer-Mappe, Ereignisse, Aufgaben mit Anlass „Abwesenheit“.
    a.benutzerGespiegelt.anmelden('aufgaben.abwesenheit', async ({ benutzer, von, abwesenheit }) => {
      if (abwesenheit) await this.abwesenheitGeaendert(benutzer, abwesenheit.vorher, von, abwesenheit.wegen);
    });
    a.schliessen();
  }

  /** Volltext aus Paketen (#614, paketvolltext.ts); die Texterkennung meldet darüber (index.ts). */
  readonly paketVolltext: PaketVolltext;

  /** Erkennung im Kern (#336, #391): Vorschläge aus dem Volltext. */
  readonly erkennung: Erkennung;
  /** „Frag deine Ablage“ (#444): Ausschnitte suchen, Antwort-Paket fragen, Quellen prüfen. */
  readonly fragen: FragenAnDieAblage;
  /** Inhalte übersetzen auf Knopfdruck (#732): Paket mit dms:uebersetzen, Zwischenspeicher im Kurzzustand. */
  readonly uebersetzung: Uebersetzung;
  private volltextHoerer: Array<(e: { dokument: string; mappe: string }) => Promise<void>> = [];
  /** Internes Ereignis „Volltext fertig“ abonnieren (#336). */
  beiVolltextFertig(f: (e: { dokument: string; mappe: string }) => Promise<void>) { this.volltextHoerer.push(f); }
  /**
   * Ereignis „Volltext fertig“ (#336, #442, #458): Der Volltext eines Dokuments steht fest – aus der Textebene bzw.
   * der eingebauten Texterkennung (quelle kern), von einem Paket, über die API oder übernommen. Für Pakete
   * `volltext.fertig` – auch ohne Text (`text: false`), dann aber nur für Pakete, die das kennen
   * (kenntVolltextOhneText). Wer den Text geschrieben hat (`von`), bekommt es nicht zurück. Die internen Hörer
   * (Erkennung #336) laufen nur mit Text; ihre Fehler landen nur im Protokoll.
   */
  async volltextFertig(e: { dokument: string; mappe: string }, m: VolltextMeldung = { quelle: 'kern', text: true }, von?: string | null): Promise<void> {
    const daten = { dokument: e.dokument, mappe: e.mappe, quelle: m.quelle, text: m.text, ...(m.mime ? { mime: m.mime } : {}), ...(m.seiten !== undefined ? { seiten: m.seiten } : {}), ...(m.neu ? { neu: true } : {}), ...(m.paket ? { paket: m.paket } : {}), ...(m.seitenOhneText?.length ? { seitenOhneText: m.seitenOhneText } : {}), ...(m.original ? { original: m.original, fassung: true } : {}) };
    // Einmal in den Ausgangskorb (#724): Automatisierungen, Pakete (#442, #458: z. B. „KI lokal – Ähnlichkeit“ rechnet den
    // Vektor, das Paket Texterkennung erkennt Scans) und – unter altem Namen – Pakete mit texterkennung.fertig.
    await this.ereignis('volltext.fertig', { ...daten, typ: await this.typVon(e.mappe) }, von);
    // Archivfassung (#631): erst jetzt, wenn der Volltext feststeht. Neuer Text (Paket, API, neu erzeugen) heißt neu.
    void this.archivNachVolltext(e.dokument, !!m.neu || m.quelle === 'paket' || m.quelle === 'api');
    if (!m.text) return;
    for (const h of this.volltextHoerer) {
      try { await h(e); } catch (x) { protokoll.modul('ablage').warn('Nach dem Volltext gestört', { dokument: e.dokument, fehler: (x as Error).message }); }
    }
  }

  /* ---------- Suche (#964: in suche/suche.dienst.ts) ---------- */

  /** Wer den Vektor eines Suchbegriffs liefert (Paket-Läufer, index.ts) – liegt bei der Suche. */
  get vektorAnbieter() { return this.suche.vektorAnbieter; }
  set vektorAnbieter(a: SucheDienst['vektorAnbieter']) { this.suche.vektorAnbieter = a; }
  suchVarianten(texte: Array<string | undefined>) { return this.suche.suchVarianten(texte); }
  unscharfAn() { return this.suche.unscharfAn(); }
  woerterEinarbeiten() { return this.suche.woerterEinarbeiten(); }
  sucheStand() { return this.suche.sucheStand(); }
  setzeSuche(e: unknown, von: string) { return this.suche.setzeSuche(e, von); }
  legeSynonymAn(e: unknown, von: string) { return this.suche.legeSynonymAn(e, von); }
  aendereSynonym(id: string, e: unknown, von: string) { return this.suche.aendereSynonym(id, e, von); }
  loescheSynonym(id: string, von: string) { return this.suche.loescheSynonym(id, von); }
  setzePaketSynonyme(paket: string, gruppen: string[][]) { return this.suche.setzePaketSynonyme(paket, gruppen); }
  paketSynonyme(paket: string) { return this.suche.paketSynonyme(paket); }
  woerterNeu(von: string) { return this.suche.woerterNeu(von); }
  vektorEinstellung() { return this.suche.vektorEinstellung(); }
  setzeVektorEinstellung(e: unknown) { return this.suche.setzeVektorEinstellung(e); }
  merkeVektorModell(paket: string, modell: string) { return this.suche.merkeVektorModell(paket, modell); }
  setzeVektor(z: Zugriff | undefined, dokumentId: string, modellRoh: unknown, eingabe: unknown) { return this.suche.setzeVektor(z, dokumentId, modellRoh, eingabe); }
  loescheVektor(z: Zugriff | undefined, dokumentId: string, modellRoh: unknown) { return this.suche.loescheVektor(z, dokumentId, modellRoh); }
  aehnlicheDokumente(...a: Parameters<SucheDienst['aehnlicheDokumente']>) { return this.suche.aehnlicheDokumente(...a); }
  aehnlicheZurMappe(z: Zugriff | undefined, mappeId: string) { return this.suche.aehnlicheZurMappe(z, mappeId); }
  aehnlicheZurSuche(...a: Parameters<SucheDienst['aehnlicheZurSuche']>) { return this.suche.aehnlicheZurSuche(...a); }
  aehnlicheZuText(z: Zugriff | undefined, text: string, anzahl: number, ms: number) { return this.suche.aehnlicheZuText(z, text, anzahl, ms); }
  aehnlicheTypen(...a: Parameters<SucheDienst['aehnlicheTypen']>) { return this.suche.aehnlicheTypen(...a); }
  vektorStand() { return this.suche.vektorStand(); }
  vektorenNeu(paket: string) { return this.suche.vektorenNeu(paket); }

  /**
   * Nachberechnung des Bestands (#442): für bis zu `max` Dokumente mit Volltext ohne Vektor dieses Modells ein
   * Ereignis „volltext.fertig“ an das Paket (nach = Dokument-Id, ab der weitergesucht wird). Liefert die Ids.
   */
  async vektorNachlauf(paket: string, modell: string, max: number, nach: string | null): Promise<string[]> {
    const alle = await this.kern.repoOhneTransaktion.ohneVektor(modell, max, nach);
    if (!alle.length) return [];
    // KI-Dienste (#796): Dokumente nicht zugelassener Mappentypen bekommt ein KI-Paket auch hier nicht (Stelle rückt trotzdem weiter).
    const gesperrt = await this.kiSperreFuer(paket);
    const typen = await this.kern.repoOhneTransaktion.typenVon([...new Set(alle.map((d) => d.mappeId))]);
    const liste = alle.filter((d) => { const typ = typen.get(d.mappeId); return !!typ && !gesperrt(typ); });
    if (liste.length) await this.kern.repoOhneTransaktion.legeEreignisseAn(liste.map((d) => ({ id: randomUUID(), paketId: paket, art: 'volltext.fertig', daten: { dokument: d.id, mappe: d.mappeId, nachberechnung: true } })));
    this.ereignisWecker?.();
    return alle.map((d) => d.id);
  }

  /** Das Repo – innerhalb von `inTransaktion` das der Transaktion (Kern). */
  private get repo(): Repo { return this.kern.repo; }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private inEinemZug<T>(f: () => Promise<T>): Promise<T> { return this.kern.inEinemZug(f); }
  private inAnfrage(): boolean { return this.kern.inAnfrage(); }
  private nachDerAntwort(f: () => Promise<unknown>): Promise<void> | void { return this.kern.nachDerAntwort(f); }
  private danach(f: () => void) { this.kern.danach(f); }

  /** Schlüssel wechseln (#47): alle Passwortfelder, der Papierkorb und die Einstellungen in einer Transaktion. */
  async schluesselWechseln(von: string) {
    if (!this.tresor) throw new Fachfehler(404, t('meldungen.dienst.die-verschluesselung-ist-nicht'));
    return this.tresor.wechsle((um, einstellungen) => this.repo.umschluesseln(um, einstellungen), von);
  }

  /** Konten anbinden: Benutzer-Mappen im Papierkorb (#43). */
  verbindeKonten(h: KontenHaken) { this.konten = h; }

  /** Texterkennung anbinden (#45): neue Dokumente stoßen sie an. */
  private ocr?: TexterkennungAnbindung;
  verbindeTexterkennung(t: TexterkennungAnbindung) { this.ocr = t; }

  /**
   * Text einer Datei sofort, ohne Warteschlange (#391, „Aus Dokument ausfüllen“): vCard und Text direkt, PDFs
   * und Bilder über die Texterkennung. Die Datei wird dabei nicht gespeichert.
   */
  async textAusDatei(inhalt: Buffer, name: string, mime: string): Promise<{ text: string; info: string }> {
    const art = erkenneAnzeigbar(inhalt) ?? mime;
    if (/\.(vcf|vcard|txt)$/i.test(name) || /^text\/(vcard|x-vcard|plain)$/.test(mime) || inhalt.subarray(0, 64).toString('utf8').includes('BEGIN:VCARD')) {
      return { text: inhalt.toString('utf8').slice(0, VOLLTEXT_MAX), info: t('meldungen.dienst.text-der-datei') };
    }
    if (!this.ocr?.erkenneSofort) throw new Fachfehler(503, t('meldungen.dienst.die-texterkennung-ist-nicht'));
    if (!/^(application\/pdf|image\/(jpeg|png|tiff|webp|gif|bmp))$/.test(art)) throw new Fachfehler(415, t('meldungen.dienst.diese-datei-laesst-sich'));
    return this.ocr.erkenneSofort(inhalt, art);
  }

  /** Vorschaubilder anbinden (#332): neue Dateien einreihen, gelöschte mit entfernen. */
  private vorschau?: { einreihen(d: Dokument[]): unknown; entferne(sha: string): Promise<void>; nachholen(d: Dokument[]): Promise<number> };
  verbindeVorschau(v: { einreihen(d: Dokument[]): unknown; entferne(sha: string): Promise<void>; nachholen(d: Dokument[]): Promise<number> }) { this.vorschau = v; }

  /** Vorschaubilder für vorhandene Dokumente nachholen (Werkbank → Wartungsoperationen, #332). */
  async vorschauNachholen(): Promise<number> {
    if (!this.vorschau) return 0;
    const ids = [...new Set((await this.repo.alleDateien()).map((f) => f.dokumentId))];
    const docs: Dokument[] = [];
    for (const id of ids) { const d = await this.repo.holeDokument(id); if (d) docs.push(d); }
    // Andere Dateitypen (#577): Dateien ohne Fassung gehen an das zuständige Paket; ihr Bild entsteht mit der Fassung.
    const gemeldet = await this.umwandlung?.anfordern(docs.filter((d) => !kernTyp(d.mime))).catch((e: Error) => { protokoll.modul('umwandlung').warn('Dateien nicht zum Umwandeln gemeldet', { fehler: e.message }); return 0; }) ?? 0;
    return (await this.vorschau.nachholen(docs)) + gemeldet;
  }

  /**
   * Neue Dateien (#332, #577, #827): Vorschaubild einreihen, andere Dateitypen an das Paket zum Umwandeln melden,
   * geschützte PDFs erkennen (Rechte-Sperre gleich aufheben, bei Post für eine Person deren gemerkte Passwörter).
   */
  private neueDateien(docs: Dokument[]) {
    this.vorschau?.einreihen(docs);
    const andere = docs.filter((d) => d && !kernTyp(d.mime));
    if (andere.length && this.umwandlung) void this.umwandlung.anfordern(andere).catch((e: Error) => protokoll.modul('umwandlung').warn('Datei nicht zum Umwandeln gemeldet', { fehler: e.message }));
    const pdfs = docs.filter((d) => d && d.mime === 'application/pdf');
    if (pdfs.length && this.entsperren) void this.entsperren.neu(pdfs, (d) => this.besitzerDerPost(d.mappeId)).catch((e: Error) => protokoll.modul('dokumente').warn('Geschützte PDFs nicht geprüft', { fehler: e.message }));
  }

  /* ---------- Geschützte PDFs (#827) ---------- */

  private entsperren?: PdfEntsperren;
  verbindeEntsperren(e: PdfEntsperren) { this.entsperren = e; }
  get pdfEntsperren() { return this.entsperren; }

  /** Was PdfEntsperren vom Dienst braucht (#827) – für index.ts und Tests. */
  entsperrenAnbindung(o: Omit<EntsperrenAnbindung, 'datei' | 'dokumenteMitSha' | 'nachEntsperren'>): EntsperrenAnbindung {
    return { ...o, datei: (sha) => this.kern.liesGanz(sha), dokumenteMitSha: (sha) => this.repo.dokumenteMitSha(sha), nachEntsperren: (docs, info) => this.nachEntsperren(docs, info) };
  }

  /**
   * Wem gehört die Post (#827)? Das Konto aus „Für“ einer Post-Mappe; bei Post für alle und anderen Mappen null –
   * dann probiert Ablago keine gemerkten Passwörter.
   */
  private async besitzerDerPost(mappeId: string): Promise<string | null> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) return null;
    const typ = (await this.listeTypen()).find((x) => x.id === m.typId);
    if (typ?.system !== 'post') return null;
    return alsListe(m.werte.fuer)[0] ?? null;
  }

  /**
   * Eine entsperrte Fassung ist da (#827): Vorschaubild daraus, Volltext neu (wo er am Schutz scheiterte), Archivfassung
   * (wo der Volltext schon steht) und – wenn eine Person entsperrt hat – ein Eintrag in der Historie.
   */
  private async nachEntsperren(docs: Dokument[], info: FassungInfo) {
    this.vorschauFassung?.ausFassung(docs);
    const neu = docs.filter((d) => d.ocr && (d.ocr.stand === 'ausgelassen' || d.ocr.stand === 'fehler')).map((d) => d.id);
    if (neu.length) { await this.repo.ocrEinreihen(neu); this.ocr?.anstossen(); }
    for (const d of docs) if (d.ocr?.stand === 'fertig') void this.archivNachVolltext(d.id);
    const e = info.entsperrt;
    if (!e || e.art === 'rechte') return;
    for (const d of docs) {
      const text = e.art === 'gemerkt' ? t('mappen.entsperren.historie.gemerkt', { name: e.name ?? '' }) : t('mappen.entsperren.historie.passwort');
      await this.notiere(d.mappeId, e.von, 'entsperrt', { dokument: d.name, text })
        .catch((f: Error) => protokoll.modul('dokumente').warn('Historie zum Entsperren nicht geschrieben', { dokument: d.id, fehler: f.message }));
    }
  }

  /** Geschütztes PDF mit Passwort entsperren (POST /dokumente/{id}/entsperren); Lesen prüft die Route. */
  async entsperreDokument(id: string, konto: string, e: { passwort?: unknown; merken?: unknown; name?: unknown }, merkenErlaubt: boolean) {
    if (!this.entsperren) throw new Fachfehler(404, t('mappen.entsperren.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (e.merken === true && !merkenErlaubt) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.nur-browser'));
    const r = await this.entsperren.mitPasswort(d, konto, e.passwort, e.merken === true ? { name: e.name } : null);
    return { dokument: d.id, ...r };
  }

  /** Inhalt der entsperrten Fassung zum Inhalt einer Datei (Stempel, Verkleinern, #827); null ohne. */
  private entsperrtZu = async (inhalt: Buffer): Promise<Buffer | null> => {
    if (!this.entsperren || inhalt.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
    return (await this.entsperren.fassung(createHash('sha256').update(inhalt).digest('hex')))?.inhalt ?? null;
  };

  /** Schutz je Dokument (#827), nur bei geschützten PDFs. */
  private async mitPdfSchutz(docs: Dokument[]): Promise<Dokument[]> {
    if (!this.entsperren || !docs.length) return docs;
    return Promise.all(docs.map(async (d) => {
      const s = await this.entsperren!.stand(d).catch(() => null);
      return s ? { ...d, pdfSchutz: s } : d;
    }));
  }

  /* ---------- Dateien umwandeln (#577) ---------- */

  /** Dateien umwandeln anbinden (#577, dateiumwandlung.ts). */
  private umwandlung?: Dateiumwandlung;
  private vorschauFassung?: { ausFassung(d: Dokument[]): unknown; setze(sha: string, bild: Buffer, mime: string): Promise<void> };
  verbindeUmwandlung(u: Dateiumwandlung, vorschau?: { ausFassung(d: Dokument[]): unknown; setze(sha: string, bild: Buffer, mime: string): Promise<void> }) {
    this.umwandlung = u;
    this.vorschauFassung = vorschau;
  }
  get dateiumwandlung() { return this.umwandlung; }

  /** Was Dateiumwandlung vom Dienst braucht (#577) – für index.ts und Tests. */
  umwandlungAnbindung(ablage: FassungsAblage, vorschau?: { setze(sha: string, bild: Buffer, mime: string): Promise<void> }): UmwandlungsAnbindung {
    return {
      ablage,
      pakete: () => this.repo.listePakete(),
      melde: (paket, daten) => this.auftrag(paket, 'datei.umwandeln', daten),
      dokumenteMitSha: (sha) => this.repo.dokumenteMitSha(sha),
      nachFassung: (docs, info) => this.nachFassung(docs, info),
      ...(vorschau ? { vorschaubild: (sha: string, bild: Buffer, mime: string) => vorschau.setze(sha, bild, mime) } : {}),
    };
  }

  /**
   * Eine neue Fassung ist da (#577): Vorschaubild daraus, Volltext neu (für Dokumente, die darauf warteten oder bisher
   * ohne Text ausgelassen waren) und ein Eintrag in der Historie jeder betroffenen Mappe.
   */
  async nachFassung(docs: Dokument[], info: FassungInfo) {
    this.vorschauFassung?.ausFassung(docs);
    // Liefert ein Paket mit dms:volltext den Text (#614), bleibt es dabei: Die Fassung gibt nur das Vorschaubild.
    const vp = await this.paketVolltext.pakete().catch(() => []);
    const neu = docs.filter((d) => !vp.some((p) => p.typen.includes(d.mime.toLowerCase())) && d.ocr && (d.ocr.stand === 'ausgelassen' || d.ocr.stand === 'fehler' || (d.ocr.stand === 'paket' && (d.ocr.info ?? '').startsWith(INFO_UMWANDLUNG)))).map((d) => d.id);
    if (neu.length) { await this.repo.ocrEinreihen(neu); this.ocr?.anstossen(); }
    const konto = [...this.paketKonten.entries()].find(([, p]) => p === info.paket.id)?.[0] ?? null;
    for (const d of docs) {
      await this.ereignis('datei.umgewandelt', { dokument: d.id, mappe: d.mappeId, typ: await this.typVon(d.mappeId), paket: info.paket.id }, konto);
      await this.notiere(d.mappeId, konto, 'umgewandelt', { dokument: d.name, text: `${dateitypName(d.mime)} → ${dateitypName(info.mime)} (${info.paket.name} ${info.paket.version})`, fassung: info.mime, groesse: info.groesse, paket: `${info.paket.name} ${info.paket.version}` })
        .catch((e: Error) => protokoll.modul('umwandlung').warn('Historie zur Fassung nicht geschrieben', { dokument: d.id, fehler: e.message }));
    }
  }

  /**
   * Ein Paket zum Umwandeln ist neu installiert (oder kann neue Dateitypen): Alle Dokumente dieser Typen ohne Fassung
   * gehen an das Paket; wer auf ein Paket wartete (ausgelassen, „mit dem Paket …“), bekommt so Vorschau und Volltext.
   */
  async umwandelPaketDa(typen: string[]): Promise<number> {
    if (!this.umwandlung || !typen.length) return 0;
    const docs = await this.repo.dokumenteMitTyp(typen);
    const n = await this.umwandlung.anfordern(docs);
    // Was bisher ohne Paket ausgelassen war, wartet jetzt sichtbar auf die Fassung.
    for (const d of docs) {
      if (d.ocr?.stand !== 'ausgelassen' || (await this.umwandlung.info(d.sha256))) continue;
      const p = await this.umwandlung.paketFuer(d.mime);
      if (p && d.groesse <= UMWANDELN_MAX_BYTES) await this.repo.ocrSetze(d.id, { stand: 'paket', info: infoUmwandlung(p), seiten: d.ocr.seiten ?? null });
    }
    protokoll.modul('umwandlung').info('Paket zum Umwandeln installiert – vorhandene Dateien gemeldet', { typen, dateien: n });
    return n;
  }

  /** Fassung eines Pakets übernehmen (#577, PUT /dokumente/{id}/fassung); Lesen des Dokuments prüft die Route. */
  async setzeFassung(z: Zugriff | undefined, id: string, sha: unknown, inhalt: unknown) {
    if (!this.umwandlung) throw new Fachfehler(404, t('pakete.vorschaubild.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const f = await this.umwandlung.setzeFassung(z?.paket, d, sha, inhalt);
    return { dokument: d.id, fassung: f };
  }

  /** Vorschaubild eines Pakets übernehmen (#577, PUT /dokumente/{id}/vorschaubild). */
  async setzeVorschaubild(z: Zugriff | undefined, id: string, sha: unknown, inhalt: unknown) {
    if (!this.umwandlung) throw new Fachfehler(404, t('pakete.vorschaubild.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return this.umwandlung.setzeVorschaubild(z?.paket, d, sha, inhalt);
  }

  /** Die umgewandelte Fassung eines Dokuments (#577) zum Ansehen; 404, wenn es keine gibt. */
  async fassungVon(id: string): Promise<{ d: Dokument; info: FassungInfo; inhalt: Buffer }> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    // Geschützte PDFs (#827): die entsperrte Fassung.
    const f = kernTyp(d.mime) ? (d.mime === 'application/pdf' ? await this.entsperren?.fassung(d.sha256) : null) : await this.umwandlung?.lies(d.sha256);
    if (!f) throw new Fachfehler(404, t('pakete.fassung.keine'));
    return { d, ...f };
  }

  /**
   * Für die Werkbank (#577): Pakete zum Umwandeln und je Dateityp, den der Kern nicht selbst liest, wie viele
   * Dokumente es gibt, welches Paket zuständig ist – oder welches aus dem Katalog es wäre.
   */
  async umwandlungStand() {
    const pakete = this.umwandlung ? await this.umwandlung.pakete() : [];
    const volltextPakete = await this.paketVolltext.pakete();
    const typen = await this.repo.dokumentTypen();
    const liste = await Promise.all(Object.entries(typen).filter(([m]) => !kernTyp(m) && (m !== 'application/octet-stream' || volltextPakete.some((p) => p.typen.includes(m)))).map(async ([mime, anzahl]) => {
      const p = this.umwandlung ? await this.umwandlung.paketFuer(mime, pakete) : null;
      const k = katalogUmwandlung(mime);
      // Volltext aus Paketen (#614): zuständiges Paket bzw. das aus dem Katalog.
      const v = await this.paketVolltext.paketFuer(mime, volltextPakete);
      const kv = katalogVolltext(mime);
      return { mime, name: dateitypName(mime), anzahl, paket: p ? { id: p.id, name: p.name } : null, katalog: k ? { id: k.id, name: k.name } : null,
        volltext: v ? { id: v.id, name: v.name } : null, volltextKatalog: kv ? { id: kv.id, name: kv.name } : null };
    }));
    return { pakete, volltextPakete, typen: liste.sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name)) };
  }

  /** Nach dem Ereignis „Datei umwandeln“ (#577): Wartet ein Dokument noch, aber es gibt keine Fassung, steht der Grund daran. */
  private async nachUmwandlungsEreignis(paket: string, e: { daten: Record<string, unknown> }, r: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }) {
    const sha = typeof e.daten.sha256 === 'string' ? e.daten.sha256 : '';
    if (!this.umwandlung || !sha) return;
    if (!r.ok && !r.aufgegeben) return;
    this.umwandlung.erledigt(sha);
    if (await this.umwandlung.info(sha)) return;
    const p = (await this.repo.listePakete()).find((x) => x.id === paket);
    const grund = (r.ok ? r.text : r.fehler ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
    for (const d of await this.repo.dokumenteMitSha(sha)) {
      if (d.ocr?.stand !== 'paket' || !(d.ocr.info ?? '').startsWith(INFO_UMWANDLUNG)) continue;
      const info = r.ok ? t('meldungen.dienst.umwandlung-durch-paket', { wert: p?.name ?? paket, wert2: grund || t('meldungen.dienst.keine-fassung-geliefert') }) : t('meldungen.dienst.umwandlung-durch-paket-2', { wert: p?.name ?? paket, wert2: grund ? `: ${grund}` : '' });
      await this.repo.ocrSetze(d.id, { stand: r.ok ? 'ausgelassen' : 'fehler', info: info.slice(0, 500), text: null });
    }
  }

  /* ---------- Archivfassung (PDF/A, #631) ---------- */

  private archiv?: Archivfassung;
  verbindeArchivfassung(a: Archivfassung) { this.archiv = a; }
  get archivfassung() { return this.archiv; }

  /** Was Archivfassung vom Dienst braucht (#631) – für index.ts und Tests. */
  archivAnbindung(ablage: ArchivAblage): ArchivAnbindung {
    return {
      ablage,
      pakete: () => this.repo.listePakete(),
      einstellung: async (paket, k) => {
        const w = (await paketEinstellungen(this.kern, paket))?.werte ?? {};
        if (k in w) return w[k];
        const p = (await this.repo.listePakete()).find((x) => x.id === paket);
        return p?.einstellungen ? vorgaben(p.einstellungen)[k] : undefined;
      },
      melde: (paket, daten) => this.auftrag(paket, 'datei.archivfassung', daten),
      dokumenteMitSha: (sha) => this.repo.dokumenteMitSha(sha),
      dokumenteMitTyp: (m) => this.repo.dokumenteMitTyp(m),
      lesefassung: async (sha) => (await this.umwandlung?.lies(sha)) ?? null,
      datei: (sha) => this.kern.liesGanz(sha),
      textebene: (pdf) => textebeneWoerter(pdf),
      liesPdfA: (pdf) => liesPdfA(pdf),
      notiere: async (d, paket, daten) => {
        const konto = [...this.paketKonten.entries()].find(([, p]) => p === paket)?.[0] ?? null;
        await this.notiere(d.mappeId, konto, 'archivfassung', daten);
        await this.ereignis('archivfassung.erstellt', { dokument: d.id, mappe: d.mappeId, typ: await this.typVon(d.mappeId), paket }, konto);
      },
    };
  }

  /**
   * Der Volltext steht fest (#631): Dokument an das Paket für die Archivfassung melden – im Hintergrund. Ob es passt
   * (Volltext fertig bzw. bei E-Mails auch ausgelassen, #946), entscheidet `anfordern`.
   */
  private async archivNachVolltext(id: string, neu?: boolean) {
    if (!this.archiv) return;
    try {
      const d = await this.repo.holeDokument(id);
      if (d) await this.archiv.anfordern(d, { neu });
    } catch (e) { protokoll.modul('archivfassung').warn('Dokument nicht zur Archivfassung gemeldet', { dokument: id, fehler: (e as Error).message }); }
  }

  /**
   * Der Kern hat den Volltext ausgelassen (#946), z. B. eine E-Mail ohne Paket, das ihren Text liefert: Für E-Mails
   * steht er damit fest (leer) – sie gehen trotzdem an das Paket für die Archivfassung. Andere Dokumente nicht.
   */
  volltextAusgelassen(id: string) { return this.archivNachVolltext(id); }

  /** Paket für die Archivfassung installiert, neue Dateitypen oder eine Art nachträglich angekreuzt: Bestand melden (#631, #660). */
  async archivPaketDa(typen: string[]): Promise<number> {
    if (!this.archiv || !typen.length) return 0;
    const klein = new Set(typen.map((m) => m.toLowerCase()));
    // E-Mails (#946) liegen oft als application/octet-stream mit Endung .eml/.msg da.
    if ([...klein].some((m) => MAIL_TYPEN.includes(m))) klein.add('application/octet-stream');
    const vorhanden = Object.keys(await this.repo.dokumentTypen()).filter((m) => klein.has(m.toLowerCase()));
    return this.archiv.bestand(vorhanden);
  }

  /** Archivfassung annehmen (PUT /dokumente/{id}/archivfassung?sha256=…); Lesen prüft die Route. */
  async setzeArchivfassung(z: Zugriff | undefined, id: string, sha: unknown, inhalt: unknown) {
    if (!this.archiv) throw new Fachfehler(404, t('pakete.archiv.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return { dokument: d.id, archivfassung: await this.archiv.setze(z?.paket, d, sha, inhalt) };
  }

  /** Die Archivfassung eines Dokuments zum Ansehen (nur die aktuelle – zur Datei des Dokuments); 404 ohne. */
  async archivfassungVon(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const f = await this.archiv?.lies(d.sha256);
    if (!f) throw new Fachfehler(404, t('pakete.archiv.keine'));
    return { d, ...f };
  }

  /** Wortpositionen eines Dokuments (#631, GET /dokumente/{id}/wortpositionen). */
  async wortpositionen(id: string) {
    if (!this.archiv) throw new Fachfehler(404, t('pakete.archiv.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return this.archiv.wortpositionen(d);
  }

  /** Werkbank → Texterkennung → Archivfassung (#631). */
  async archivStand() { return this.archiv ? this.archiv.uebersicht() : null; }

  /** Stand der Archivfassung je Dokument (#631), nur wenn es eine gibt oder ein Paket dran ist. */
  private async mitArchivStand(docs: Dokument[]): Promise<Dokument[]> {
    if (!this.archiv || !docs.length) return docs;
    return Promise.all(docs.map(async (d) => {
      const s = await this.archiv!.stand(d).catch(() => null);
      return s ? { ...d, archivfassung: s } : d;
    }));
  }

  /* ---------- Volltext aus Paketen (#614) ---------- */

  /**
   * Ein Paket mit dms:volltext ist neu installiert (oder kann neue Dateitypen): Alle Dokumente dieser Typen ohne Text
   * gehen durch die Warteschlange des Volltexts – und damit an das Paket. Dokumente mit Text bleiben, wie sie sind
   * (z. B. Text einer früheren Version des Pakets).
   */
  async volltextPaketDa(typen: string[]): Promise<number> {
    if (!typen.length) return 0;
    // Dateitypen so, wie sie an den Dokumenten stehen (Groß- und Kleinschreibung wie vom Browser).
    const klein = new Set(typen.map((m) => m.toLowerCase()));
    const vorhanden = Object.keys(await this.repo.dokumentTypen()).filter((m) => klein.has(m.toLowerCase()));
    const docs = new Set((await this.repo.dokumenteMitTyp(vorhanden)).map((d) => d.id));
    if (!docs.size) return 0;
    const mtypen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const ids = (await this.repo.volltextKandidaten('ohne')).filter((d) => docs.has(d.id) && Dienst.volltextAn(mtypen.get(d.typId), d.registerKey)).map((d) => d.id);
    if (!ids.length) return 0;
    await this.repo.ocrEinreihen(ids);
    this.ocr?.anstossen();
    protokoll.modul('texterkennung').info('Paket für Volltext installiert – vorhandene Dateien ohne Text gehen an das Paket', { typen, dokumente: ids.length });
    return ids.length;
  }

  /**
   * Ein Paket mit dms:volltext oder dms:umwandeln ist entfernt (Frage 49/51): Dokumente seiner Dateitypen, die noch
   * auf dieses Paket warteten, warten nicht mehr. Ohne Text gehen sie erneut durch die Warteschlange – dort steht dann
   * „kein Paket für diesen Dateityp“ (oder ein anderes zuständiges Paket übernimmt); mit Text von vorher bleibt der Text
   * stehen und der Stand wird *fertig*.
   */
  async paketWegFuerDateien(paket: { name: string }, typen: string[]): Promise<number> {
    if (!typen.length) return 0;
    const klein = new Set(typen.map((m) => m.toLowerCase()));
    const vorhanden = Object.keys(await this.repo.dokumentTypen()).filter((m) => klein.has(m.toLowerCase()));
    const marke = `(Paket ${paket.name})`;
    const wartend = (await this.repo.dokumenteMitTyp(vorhanden)).filter((d) => d.ocr?.stand === 'paket' && (d.ocr.info ?? '').includes(marke));
    if (!wartend.length) return 0;
    const ohne: string[] = [];
    for (const d of wartend) {
      const text = await this.repo.volltext(d.id);
      if (text && text.replace(/\s/g, '').length >= 20) await this.repo.ocrSetze(d.id, { stand: 'fertig', info: t('pakete.volltext.paket-entfernt', { paket: paket.name }), seiten: d.ocr?.seiten ?? null });
      else ohne.push(d.id);
    }
    if (ohne.length) { await this.repo.ocrEinreihen(ohne); this.ocr?.anstossen(); }
    protokoll.modul('texterkennung').info('Paket entfernt – wartende Dokumente zurückgesetzt', { paket: paket.name, dokumente: wartend.length, ohneText: ohne.length });
    return wartend.length;
  }

  /**
   * Darf dieses Dienstkonto den Volltext (bzw. die Sprache) des Dokuments schreiben (#614)? Mit „Dokumente schreiben“
   * immer (wie bisher, z. B. Paket Texterkennung); mit nur „lesen“ und dms:volltext nur für Dateitypen, für die das
   * Paket zuständig ist. Sonst 403.
   */
  async pruefeVolltextRecht(z: Zugriff, id: string): Promise<void> {
    if (!z.paket || z.paket.dokumente === 'schreiben') return;
    if (!z.paket.schnittstellen?.includes('dms:volltext')) throw new Fachfehler(403, t('meldungen.dienst.dieses-paket-darf-das'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!(await this.paketVolltext.darfSchreiben(z.paket.id, d))) throw new Fachfehler(403, t('pakete.volltext.typ-fremd', { typ: d.mime }));
  }

  /**
   * Nach dem Ereignis „Datei braucht Volltext“ (#614): Hat das Paket keinen Volltext geschrieben (z. B. verschlüsselte
   * Datei), wartet das Dokument nicht länger – sein Grund steht daran. Vorhandener Text (etwa von vorher) bleibt; gibt
   * der Läufer auf: Fehler.
   */
  private async nachVolltextEreignis(paket: string, e: { daten: Record<string, unknown> }, r: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }) {
    const id = typeof e.daten.dokument === 'string' ? e.daten.dokument : '';
    if (!id || (!r.ok && !r.aufgegeben)) return;
    this.paketVolltext.erledigt(id);
    const d = await this.repo.holeDokument(id);
    if (!d || d.ocr?.stand !== 'paket' || !(d.ocr.info ?? '').startsWith(INFO_VOLLTEXT_PAKET)) return;
    // Inzwischen eine neue Version: Für die gibt es ein eigenes Ereignis.
    if (typeof e.daten.sha256 === 'string' && e.daten.sha256 !== d.sha256) return;
    const p = (await this.repo.listePakete()).find((x) => x.id === paket);
    const grund = (r.ok ? r.text : r.fehler ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
    const text = await this.repo.volltext(d.id);
    const mitText = !!text && text.replace(/\s/g, '').length >= 20;
    const info = r.ok ? `${INFO_VOLLTEXT_DURCH} ${p?.name ?? paket}: ${grund || t('meldungen.dienst.kein-volltext-geliefert')}` : `${INFO_VOLLTEXT_DURCH} ${p?.name ?? paket} fehlgeschlagen${grund ? `: ${grund}` : ''}`;
    await this.repo.ocrSetze(d.id, { stand: !r.ok ? 'fehler' : mitText ? 'fertig' : 'ausgelassen', info: info.slice(0, 500), seiten: d.ocr.seiten ?? null });
    // Archivfassung (#631): mit Text; E-Mails (#946) auch ohne – ihr Volltext steht jetzt fest.
    if (r.ok) void this.archivNachVolltext(d.id, e.daten.neu === true);
  }

  /* ---------- Volltext (#45) ---------- */

  /** Erzeugt dieses Dokumentenregister einen Volltext? (Standard: ja) */
  private static volltextAn(typ: Mappentyp | undefined, registerKey: string) {
    const r = typ?.register.find((x) => x.key === registerKey);
    return !r || r.art !== 'dokumente' || r.volltext !== false;
  }

  /** Volltext für vorhandene Dokumente nachholen (Werkbank → Wartungsoperationen). */
  async volltextNachholen(): Promise<number> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const ids = (await this.repo.ocrOhneVolltext()).filter((d) => Dienst.volltextAn(typen.get(d.typId), d.registerKey)).map((d) => d.id);
    await this.repo.ocrEinreihen(ids);
    if (ids.length) protokoll.modul('werkbank').info('Volltext für vorhandene Dokumente nachholen', { dokumente: ids.length });
    this.ocr?.anstossen();
    return ids.length;
  }

  /** Texterkennung für ein Dokument erneut versuchen – ausdrücklich neu (#458): auch ein Paket erkennt dann neu. */
  async texterkennungErneut(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (this.ocr?.neuErkennen) await this.ocr.neuErkennen(id);
    else { await this.repo.ocrEinreihen([id]); this.ocr?.anstossen(); }
    return (await this.repo.holeDokument(id))!;
  }

  /** Das installierte Paket, das die Texterkennung übernimmt (#458, dms:texterkennung); bei mehreren das erste nach Id. */
  async texterkennungPaket(): Promise<{ id: string; name: string; version: string; sprachen: string[] } | null> {
    const alle = await this.repo.listePakete();
    const p = alle.filter((x) => hatSchnittstelle(x.laeufer, 'dms:texterkennung')).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!p) return null;
    // Sprachen (#459): Deutsch und Englisch im Paket, weitere aus Zusatzpaketen „<paket>_<kennung>“, die von ihm abhängen.
    const zusatz = alle.filter((x) => p.id in (x.abhaengigkeiten ?? {})).map((x) => new RegExp(`^${p.id}_([a-z]{3})$`).exec(x.id)?.[1]).filter((x): x is string => !!x);
    return { id: p.id, name: p.name, version: p.version, sprachen: [...new Set(['deu', 'eng', ...zusatz])] };
  }

  /**
   * Ein Paket für die Texterkennung ist neu installiert (#459): Dokumente, die darauf warteten (Stand paket, „kein
   * Paket installiert“), gehen wie neue Dokumente durch Textebene und Paket.
   */
  async texterkennungPaketDa(): Promise<number> {
    const ids: string[] = [];
    for (let von = 0; ; von += 200) {
      const r = await this.repo.ocrAuftraege({ stand: 'paket', von, anzahl: 200 });
      // Wer auf den Volltext eines Pakets mit dms:volltext wartet (#614), wartet weiter auf dieses.
      ids.push(...r.eintraege.filter((e) => !(e.dokument.ocr?.info ?? '').startsWith(INFO_VOLLTEXT_PAKET)).map((e) => e.dokument.id));
      if (r.eintraege.length < 200) break;
    }
    if (!ids.length) return 0;
    await this.repo.loescheOffeneEreignisse('volltext.fertig', ids).catch(() => 0);
    await this.repo.ocrEinreihen(ids);
    this.ocr?.anstossen();
    protokoll.modul('texterkennung').info('Paket für die Texterkennung installiert – wartende Dokumente gehen an das Paket', { dokumente: ids.length });
    return ids.length;
  }

  /** Wie viele Dokumente „Volltext neu erzeugen“ beträfe (#458) – für die Rückfrage. */
  async volltextNeuAnzahl(umfang: unknown): Promise<{ umfang: 'ohne' | 'alle'; anzahl: number }> {
    const u = umfang === 'alle' ? 'alle' : 'ohne';
    return { umfang: u, anzahl: (await this.volltextNeuIds(u)).length };
  }
  private async volltextNeuIds(umfang: 'ohne' | 'alle'): Promise<string[]> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    return (await this.repo.volltextKandidaten(umfang)).filter((d) => Dienst.volltextAn(typen.get(d.typId), d.registerKey)).map((d) => d.id);
  }

  /**
   * „Volltext neu erzeugen“ (#458, Werkbank → Wartungsoperationen): für Dokumente ohne Text bzw. für alle – wie bei
   * einem neuen Dokument: Textebene neu lesen, dann Ereignis an die Pakete. „alle“ ist ein ausdrückliches Neu
   * (`neu: true`): das Paket erkennt dann auch Dokumente mit Text neu. Läuft als Auftrag mit Fortschritt, abbrechbar.
   */
  volltextNeu(umfang: unknown, von: string) {
    const u = umfang === 'alle' ? 'alle' : 'ohne';
    const jetzt = this.ocr?.jetzt?.bind(this.ocr);
    if (!jetzt) throw new Fachfehler(404, t('meldungen.dienst.die-texterkennung-ist-nicht'));
    const titel = u === 'alle' ? t('meldungen.dienst.volltext-neu-erzeugen-alle') : t('meldungen.dienst.volltext-neu-erzeugen-dokumente');
    return this.auftraege.starte('volltext-neu', titel, async (fortschritt, signal) => {
      const ids = await this.volltextNeuIds(u);
      protokoll.modul('werkbank').info('Volltext neu erzeugen', { umfang: u, dokumente: ids.length, von });
      let fertig = 0;
      fortschritt(0, ids.length);
      for (const id of ids) {
        if (signal?.aborted) break;
        try { await jetzt(id, { neu: u === 'alle', signal }); } catch (e) { protokoll.modul('texterkennung').warn('Volltext neu erzeugen: Dokument übersprungen', { id, fehler: (e as Error).message }); }
        fortschritt(++fertig, ids.length);
      }
      const paket = await this.texterkennungPaket();
      return { umfang: u, dokumente: ids.length, erledigt: fertig, abgebrochen: !!signal?.aborted, paket: paket?.name ?? null };
    }, [{ key: 'dokumente', name: 'Textebene lesen und an die Texterkennung geben', einheit: 'Dokumente' }], { abbrechbar: true });
  }

  /**
   * Fortschritt einer Fortsetzung (#458): Gibt das Paket in `weiter` einen kurzen Text `fortschritt` mit (z. B.
   * „Seite 20 von 64“), steht er am wartenden Dokument.
   */
  async texterkennungFortschritt(paket: string, e: { art: string; daten: Record<string, unknown> }, weiter: Record<string, unknown>): Promise<void> {
    if (e.art === 'datei.volltext' && typeof e.daten.dokument === 'string' && typeof weiter.fortschritt === 'string') {
      // Volltext aus Paketen (#614): Fortschritt am wartenden Dokument, wie bei der Texterkennung.
      const d = await this.repo.holeDokument(e.daten.dokument);
      const vp = d ? await this.paketVolltext.paketFuer(d.mime) : null;
      if (!d || !vp || vp.id !== paket || d.ocr?.stand !== 'paket' || !(d.ocr.info ?? '').startsWith(INFO_VOLLTEXT_PAKET)) return;
      await this.repo.ocrSetze(d.id, { stand: 'paket', info: `${infoVolltextPaket(vp)} – ${weiter.fortschritt.replace(/\s+/g, ' ').slice(0, 80)}`, seiten: d.ocr.seiten ?? null });
      return;
    }
    if (e.art !== 'volltext.fertig' || typeof e.daten.dokument !== 'string' || typeof weiter.fortschritt !== 'string') return;
    const p = await this.texterkennungPaket();
    if (!p || p.id !== paket) return;
    const d = await this.repo.holeDokument(e.daten.dokument);
    if (!d || d.ocr?.stand !== 'paket') return;
    await this.repo.ocrSetze(d.id, { stand: 'paket', info: `${infoWartet(p)} – ${weiter.fortschritt.replace(/\s+/g, ' ').slice(0, 80)}`, seiten: d.ocr.seiten ?? null });
  }

  /** Sicherung außer Haus (#585): ein Paket hat das Ereignis sicherung.fertig aufgegeben (index.ts verbindet mit der Sicherung). */
  sicherungAufgegeben?: (paket: string, name: string, fehler: string | null | undefined) => Promise<void>;
  /** Sicherung außer Haus (#636): Antwort des Pakets auf einen Aufruf von sicherung.fertig (index.ts verbindet mit der Sicherung). */
  sicherungAntwort?: (paket: string, name: string, r: EreignisAufruf) => Promise<void>;

  /** Antwort eines Pakets auf jeden einzelnen Aufruf eines Ereignisses, auch Fortsetzungen und Fehlschläge (#636). */
  async nachEreignisAufruf(paket: string, e: { art: string; daten: Record<string, unknown> }, r: EreignisAufruf): Promise<void> {
    if (e.art === 'sicherung.fertig' && typeof e.daten.name === 'string') await this.sicherungAntwort?.(paket, e.daten.name, r);
  }

  /**
   * Ergebnis eines Ereignisses „Volltext fertig“ beim Paket für die Texterkennung (#458, aus dem Paket-Läufer):
   * Hat das Paket zugestellt bekommen, aber keinen Volltext geschrieben (z. B. Mappentyp nicht gewählt, Text aus dem
   * PDF reicht), wartet das Dokument nicht länger – es behält den Text aus dem PDF. Hat es aufgegeben: Fehler.
   */
  async nachTexterkennungsEreignis(paket: string, e: { art: string; daten: Record<string, unknown> }, r: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }): Promise<void> {
    if (e.art === 'datei.umwandeln') return this.nachUmwandlungsEreignis(paket, e, r);
    if (e.art === 'datei.archivfassung') return this.archiv?.nachEreignis(paket, e, r);
    if (e.art === 'datei.volltext') return this.nachVolltextEreignis(paket, e, r);
    // Sicherung außer Haus (#585): Aufgegeben heißt „fehlgeschlagen“ (endgültig) – auch wenn das Paket es nicht mehr melden konnte.
    if (e.art === 'sicherung.fertig') { if (r.aufgegeben && typeof e.daten.name === 'string') await this.sicherungAufgegeben?.(paket, e.daten.name, r.fehler); return; }
    if (e.art !== 'volltext.fertig' || typeof e.daten.dokument !== 'string') return;
    const p = await this.texterkennungPaket();
    if (!p || p.id !== paket) return;
    const d = await this.repo.holeDokument(e.daten.dokument);
    if (!d || d.ocr?.stand !== 'paket') return;
    if (!r.ok && !r.aufgegeben) return;
    const grund = (r.ok ? r.text : r.fehler ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    const text = await this.repo.volltext(d.id);
    const mitText = !!text && text.replace(/\s/g, '').length >= 20;
    const info = r.ok
      ? t('meldungen.dienst.paket', { wert: mitText ? INFO_TEXTEBENE : t('meldungen.dienst.ohne-text'), name: p.name, wert2: grund ? `: ${grund}` : ': nichts zu tun' })
      : t('meldungen.dienst.texterkennung-durch-paket', { name: p.name, wert: grund ? `: ${grund}` : '' });
    await this.repo.ocrSetze(d.id, { stand: r.ok ? 'fertig' : 'fehler', info: info.slice(0, 500), seiten: d.ocr.seiten ?? null });
    // Der Text aus dem PDF bleibt – jetzt steht der Volltext fest (#631).
    if (r.ok) void this.archivNachVolltext(d.id, e.daten.neu === true);
  }

  async volltext(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const text = await this.repo.volltext(id);
    // Seiten mit ihrer Sprache (#579), wenn das DMS sie kennt (mehrsprachig oder gemischtes PDF).
    const s = text ? await this.repo.seitensprachen(id) : null;
    const seiten = s && text ? seitentexte(text, s).map((t, i) => ({ seite: i + 1, sprachen: s[i].sprachen, text: t })) : null;
    return { dokument: d, text, seiten };
  }

  /**
   * Volltext schreiben (#338, für die Texterkennung als Paket): ersetzt den Volltext eines Dokuments.
   * Die Herkunft steht in ocr.info und in der Historie der Mappe; die eingebaute Texterkennung
   * überschreibt diesen Text danach nicht mehr von selbst (nur „Texterkennung erneut“).
   */
  async schreibeVolltext(id: string, eingabe: unknown, von: { id: string; herkunft: string; paket: boolean; ausgelesen?: boolean }) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    if (typeof e.text !== 'string') throw new Fachfehler(422, t('meldungen.dienst.text-fehlt'));
    if (e.text.length > VOLLTEXT_MAX) throw new Fachfehler(413, t('meldungen.dienst.der-text-ist-zu', { VOLLTEXT_MAX }));
    const seiten = Number.isInteger(e.seiten) && (e.seiten as number) > 0 ? e.seiten as number : null;
    // Nur Text eines Pakets schützt vor der eingebauten Texterkennung (PAKET_TEXT); über die API gesetzter nicht.
    // Die Herkunft darf die Sprachmarke nicht vortäuschen (#395); die erkannte Sprache hängt am Ende an.
    const herkunft = von.herkunft.split(SPRACHE_MARKE.trim()).join('Sprache:');
    // Aus der umgewandelten Fassung (#577): Das Paket hat die Fassung gelesen, nicht das Original.
    const fassung = !kernTyp(d.mime) ? await this.umwandlung?.info(d.sha256) : null;
    const info = ((von.paket ? `${von.ausgelesen ? PAKET_VOLLTEXT : PAKET_TEXT}${herkunft}` : `Volltext ${herkunft}`).slice(0, 200) + (fassung ? ` – ${infoFassung(fassung.paket)}` : '')).slice(0, 300);
    let text = e.text.replace(/\u0000/g, '');
    // Sprache (#400): angegeben (z. B. vom Paket Texterkennung) oder erkannt; sie bestimmt die Wortstämme der Suche.
    if (e.sprache !== undefined && e.sprache !== null && !istTextsprache(e.sprache)) throw new Fachfehler(422, t('meldungen.dienst.sprache-unbekannt-erlaubt-oder', { keys: Object.keys(TEXTSPRACHEN).join(', ') }));
    const angegeben = istTextsprache(e.sprache) ? e.sprache : null;
    // Sprache je Seite (#579): Seiten im Text durch Seitenvorschub (\f) getrennt, dazu je Seite ihre Sprache(n) –
    // oder ohne Angabe erkennt das DMS sie. Gespeichert wird der Text wie bisher (Seiten mit Leerzeile getrennt).
    const seitenAngabe = sprachlisten(e.seitensprachen);
    const weitereAngabe = e.weitere === undefined || e.weitere === null ? undefined : sprachliste(e.weitere, 'weitere');
    let mehr: { weitere?: string[]; seitensprachen?: Seitensprache[] } = {};
    let haupt: string | null = null;
    let seitenzahl = seiten;
    if (seitenAngabe || text.includes(SEITENVORSCHUB)) {
      const teile = text.split(SEITENVORSCHUB);
      if (seitenAngabe && seitenAngabe.length !== teile.length) throw new Fachfehler(422, t('meldungen.dienst.seitensprachen-eintraege-der-text', { seitenAngabe: seitenAngabe.length, teile: teile.length }));
      if (teile.length > MAX_SEITENSPRACHEN) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-seiten', { MAX_SEITENSPRACHEN }));
      const z = seitenZusammensetzen(teile.map((t, i) => ({ text: t, sprachen: seitenAngabe?.[i] ?? null })));
      text = z.text;
      seitenzahl ??= teile.length;
      const ds = dokumentsprachen(z.seiten, zeichenzahl(z.text));
      haupt = angegeben ?? ds.sprache;
      const alle = [ds.sprache, ...ds.weitere].filter((k): k is string => !!k && k !== haupt);
      if (alle.length) mehr = { weitere: alle, seitensprachen: z.seiten };
    } else if (weitereAngabe?.length) mehr = { weitere: weitereAngabe };
    if (mehr.weitere && weitereAngabe) mehr.weitere = [...new Set([...mehr.weitere, ...weitereAngabe])];
    // Wortpositionen (#631): je Seite (wie im Text durch \f getrennt) die Wörter mit Lage – für die Archivfassung.
    let woerter: ReturnType<typeof pruefeWoerter> | null | undefined;
    if (e.woerter !== undefined && e.woerter !== null) {
      try { woerter = pruefeWoerter(e.woerter, e.text.split(SEITENVORSCHUB).length); } catch (f) { throw new Fachfehler(422, t('pakete.archiv.woerter', { grund: (f as Error).message })); }
    } else if (e.woerter === null || (von.paket && (kernTyp(d.mime) || !!fassung))) woerter = null;
    const sprache = angegeben ? { sprache: angegeben, konfidenz: 1 } : haupt ? { sprache: haupt, konfidenz: 1 } : erkenneSprache(text);
    if (mehr.weitere) mehr.weitere = mehr.weitere.filter((k) => k !== sprache?.sprache);
    const vermerk = angegeben || haupt ? `${SPRACHE_MARKE}${sprache!.sprache}` : sprache ? spracheZuInfo(sprache) : '';
    // Vor dem Stand: Wer den fertigen Volltext sieht (Archivfassung), findet die passenden Wortpositionen. Ein Paket
    // ohne Wortpositionen (ältere Texterkennung) nimmt die alten mit weg – sie gehörten zu einem anderen Text.
    if (woerter !== undefined && this.archiv) await this.archiv.speichereWoerter(d.sha256, woerter, von.herkunft).catch((f: Error) => protokoll.modul('archivfassung').warn('Wortpositionen nicht gespeichert', { dokument: id, fehler: f.message }));
    try {
      await this.repo.ocrSetze(id, { stand: 'fertig', text, seiten: seitenzahl ?? d.ocr?.seiten ?? null, info: info + vermerk, sprache: sprache && istTextsprache(sprache.sprache) ? sprache.sprache : null, ...mehr });
    } catch (f) {
      if (!istVerklemmung(f)) throw f;
      // Auch nach den Wiederholungen nicht gespeichert (#575): sichtbar am Dokument, und der Absender erfährt es (503).
      protokoll.modul('ablage').error('Volltext nicht gespeichert', { dokument: id, herkunft: von.herkunft, fehler: (f as Error).message });
      await this.repo.ocrSetze(id, { stand: 'fehler', info: `${NICHT_GESPEICHERT} (${(f as Error).message})`.slice(0, 500), seiten: d.ocr?.seiten ?? null }).catch(() => {});
      throw new Fachfehler(503, t('meldungen.dienst.die-datenbank-war-ausgelastet'));
    }
    await this.notiere(d.mappeId, von.id, 'volltext', { dokument: d.name, text: info });
    protokoll.modul('ablage').info('Volltext geschrieben', { dokument: id, zeichen: e.text.length, herkunft: von.herkunft });
    // Volltext aus einem Paket (#614): Das Dokument darf danach wieder gemeldet werden.
    this.paketVolltext.erledigt(id);
    // Das schreibende Paket bekommt sein eigenes Ergebnis nicht zurück (#458: sonst erkennte es endlos neu).
    const paketId = von.paket ? this.paketKonten.get(von.id) : undefined;
    await this.volltextFertig({ dokument: id, mappe: d.mappeId }, { quelle: von.paket ? 'paket' : 'api', text: text.replace(/\s/g, '').length > 0, mime: fassung?.mime ?? d.mime, ...(fassung ? { original: d.mime } : {}), seiten: seitenzahl ?? d.ocr?.seiten ?? null, ...(paketId ? { paket: paketId } : {}) }, von.id);
    return (await this.repo.holeDokument(id))!;
  }

  /**
   * Sprache eines Dokuments setzen (#400, API v1): bestimmt die Wortstämme der Volltextsuche. null = keine Angabe
   * (Deutsch). Der Suchindex des Dokuments entsteht dabei neu.
   */
  async setzeDokumentSprache(id: string, eingabe: unknown, von: { id: string; wer: string }) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const x = (eingabe ?? {}) as { sprache?: unknown; weitere?: unknown };
    const s = x.sprache;
    if (s !== null && !istTextsprache(s)) throw new Fachfehler(422, t('meldungen.dienst.sprache-unbekannt-erlaubt-oder', { keys: Object.keys(TEXTSPRACHEN).join(', ') }));
    // Weitere Sprachen (#579): ohne Angabe bleiben sie; mit Angabe gelten sie fürs ganze Dokument.
    const weitere = x.weitere === undefined ? undefined : x.weitere === null ? [] : sprachliste(x.weitere, 'weitere').filter((k) => k !== s);
    await this.repo.setzeDokumentSprache(id, s, weitere);
    const auch = weitere?.length ? t('meldungen.dienst.enthaelt-auch', { map: weitere.map(sprachname).join(', ') }) : '';
    await this.notiere(d.mappeId, von.id, 'volltext', { dokument: d.name, text: t('meldungen.dienst.sprache', { wert: s ? sprachname(s) : t('meldungen.dienst.ohne-angabe'), auch, wer: von.wer }) });
    protokoll.modul('ablage').info('Sprache eines Dokuments gesetzt', { dokument: id, sprache: s, ...(weitere ? { weitere } : {}) });
    return (await this.repo.holeDokument(id))!;
  }

  /** Hinweis „Post teilen?“ wegklicken (#579): gilt für alle, bis das Dokument einen neuen Volltext bekommt. */
  async teilenHinweisAus(id: string) {
    if (!(await this.repo.teilenHinweisAus(id))) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return (await this.repo.holeDokument(id))!;
  }

  private verschluessele = (klartext: string) => (this.tresor ? this.tresor.verschluessele(klartext) : keinSchluessel());

  /* ---------- Passwortfelder (#46) ---------- */

  get passwoerterMoeglich() { return this.passwortfelder.passwoerterMoeglich; }
  unlesbarePasswoerter(): Promise<Betroffen[]> { return this.passwortfelder.unlesbarePasswoerter(); }
  zeigePasswort(mappeId: string, feldKey: string, benutzerId: string | null = null): Promise<{ wert: string }> { return this.passwortfelder.zeigePasswort(mappeId, feldKey, benutzerId); }
  entschluesselePasswoerter<T extends Mappe>(mappen: T[], wer: string, benutzerId: string | null = null): Promise<T[]> { return this.passwortfelder.entschluesselePasswoerter<T>(mappen, wer, benutzerId); }

  /* ---------- Aufgaben (#54) und Erwähnungen (#56) ---------- */

  /** Anzeigename eines Benutzers (auch für Platzhalter in Automatisierungen, #678). */
  name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }

  /** Ein aktiver Benutzer (seine Benutzer-Mappe), sonst 422. */
  private async pruefeEmpfaenger(id: unknown): Promise<string> {
    const { benutzer } = await this.kern.system();
    const m = istUuid(id) ? await this.repo.holeMappe(id) : undefined;
    if (!m || m.typId !== benutzer.id) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-benutzer-als'));
    if (m.werte.aktiv === false) throw new Fachfehler(422, t('meldungen.dienst.dieser-benutzer-ist-deaktiviert'));
    return m.id;
  }

  /**
   * Neue @-Erwähnungen in formatiertem Text werden Aufgaben (#56). Gibt es für Benutzer und Feld
   * schon eine offene, entsteht keine zweite; entfernte Erwähnungen stehen nur in der Historie.
   */
  private async pruefeErwaehnungen(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null) {
    for (const f of typ.felder.filter((x) => x.typ === 'formatiert')) {
      await this.erwaehnungenAbgleichen(mappeId, { key: f.key, ort: `in „${f.label}“` }, String(alt[f.key] ?? ''), String(neu[f.key] ?? ''), von);
    }
  }

  /**
   * Gemeinsamer Abgleich für Felder und Notizen (#81): `quelle.key` unterscheidet die Stelle
   * (Feldschlüssel oder `notiz:<id>`), `quelle.ort` steht im Text („in „Beschreibung““, „in einer Notiz“).
   */
  private async erwaehnungenAbgleichen(mappeId: string, quelle: { key: string; ort: string; auszug?: string }, altText: string, neuText: string, von: string | null) {
    const vorher = new Set(erwaehnungen(altText));
    const jetzt = new Set(erwaehnungen(neuText));
    if (!vorher.size && !jetzt.size) return;
    const { benutzer } = await this.kern.system();
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).filter((a) => a.art === 'erwaehnung' && a.feldKey === quelle.key);
    // #137: nur Benutzer, die der Erwähnende sehen darf.
    const sichtbar = von ? await this.sichtbarFuer(von, [...jetzt]) : new Set(jetzt);
    for (const id of jetzt) {
      if (vorher.has(id) || id === von || offen.some((a) => a.empfaengerId === id) || !sichtbar.has(id)) continue;
      const m = await this.repo.holeMappe(id);
      if (!m || m.typId !== benutzer.id) continue;
      // Deaktivierte nur, wenn ihr Vertreter übernimmt (#78).
      if (m.werte.aktiv === false && (await this.empfaengerAufloesen(id)).ziel === id) continue;
      const a = await this.neueAufgabe({
        id: randomUUID(), mappeId, empfaengerId: id, art: 'erwaehnung', feldKey: quelle.key,
        text: t('meldungen.dienst.erwaehnt-von', { name: await this.name(von), ort: quelle.ort, wert: quelle.auszug ? `: ${quelle.auszug}` : '' }).slice(0, AUFGABE_MAX),
        erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null,
      });
      await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erwaehnt', { name: await this.name(id), ort: quelle.ort }), aufgabe: a.id, aufgabenart: 'erwaehnung', fuer: id, aufgabentext: a.text });
      await this.leiteUm(a);
    }
    for (const id of vorher) {
      if (!jetzt.has(id)) await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erwaehnung-von-entfernt', { name: await this.name(id), ort: quelle.ort }) });
    }
  }


  /* ---------- Abwesenheit und Vertretung (#77, #78) ---------- */

  /**
   * Wer eine Aufgabe für `id` bekommt: der Benutzer selbst – oder, solange seine Abwesenheit wirkt
   * bzw. er deaktiviert ist, sein Vertreter. Ketten höchstens VERTRETER_SCHRITTE weit; bei einem
   * Kreis oder einem deaktivierten Vertreter bleibt sie beim letzten erreichbaren Empfänger.
   */
  async empfaengerAufloesen(id: string | null): Promise<{ ziel: string | null; abwesende: string[] }> {
    if (!id || !this.konten?.benutzer) return { ziel: id, abwesende: [] };
    const alle = new Map((await this.konten.benutzer()).map((b) => [b.id, b] as const));
    const heute = heuteIn();
    let ziel = id;
    const abwesende: string[] = [];
    const gesehen = new Set([id]);
    for (let i = 0; i < VERTRETER_SCHRITTE; i++) {
      const b = alle.get(ziel);
      if (!b || (b.aktiv && !abwesenheitWirkt(b.abwesenheit, heute))) break;
      const v = b.abwesenheit?.vertreterId;
      const vb = v ? alle.get(v) : undefined;
      if (!v || !vb || !vb.aktiv || gesehen.has(v)) break;
      abwesende.push(ziel); gesehen.add(v); ziel = v;
    }
    return { ziel, abwesende };
  }

  /** Neue Aufgabe eines Abwesenden an den Vertreter geben – wie „Weitergeben“, mit Protokolleintrag. Vertretungs-Aufgaben nie. */
  private async leiteUm(a: Aufgabe): Promise<Aufgabe> {
    if (a.art === 'vertretung' || !a.empfaengerId) return a;
    const { ziel, abwesende } = await this.empfaengerAufloesen(a.empfaengerId);
    if (!ziel || ziel === a.empfaengerId) return a;
    await this.repo.delegiereAufgabe(a.id, ziel);
    const namen = (await Promise.all(abwesende.map((x) => this.name(x)))).join(', ');
    await this.notiere(a.mappeId, null, 'aufgabe', {
      text: t('meldungen.dienst.weitergegeben-wegen-abwesenheit-von', { namen, name: await this.name(ziel), text: a.text }),
      aufgabe: a.id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text,
    });
    protokoll.modul('ablage').info('Aufgabe wegen Abwesenheit weitergegeben', { mappeId: a.mappeId, von: namen, an: await this.name(ziel) });
    return (await this.repo.holeAufgabe(a.id)) ?? a;
  }

  /** „Passt nicht“-Aufgaben anlegen bzw. erledigen; neue für Abwesende gehen an deren Vertreter. */
  private async passungsAufgaben(liste: Array<{ id: string; problem: string | null }>) {
    await this.repo.aufgabenZurPassung(liste);
    const ids = liste.filter((x) => x.problem).map((x) => x.id);
    if (!ids.length || !this.konten?.benutzer) return;
    for (const a of await this.repo.offeneAufgaben({ mappeIds: ids })) if (a.art === 'passung') await this.leiteUm(a);
  }

  /** Alle offenen Aufgaben eines Benutzers (ohne die der Administratoren) an einen anderen geben. */
  async aufgabenUebergeben(id: string, an: string, von: string | null): Promise<number> {
    const ziel = await this.pruefeEmpfaenger(an);
    if (!ziel || ziel === id) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-anderen-benutzer'));
    const offen = (await this.repo.offeneAufgaben({ benutzerId: id })).filter((a) => a.empfaengerId === id);
    for (const a of offen) {
      await this.repo.delegiereAufgabe(a.id, ziel);
      await this.notiere(a.mappeId, von, 'aufgabe', {
        text: t('meldungen.dienst.weitergegeben-von-an', { name: await this.name(id), name2: await this.name(ziel), text: a.text }),
        aufgabe: a.id, aufgabenart: a.art, vonId: id, anId: ziel, aufgabentext: a.text,
      });
    }
    if (offen.length) protokoll.modul('ablage').info('Offene Aufgaben übergeben', { von: await this.name(id), an: await this.name(ziel), anzahl: offen.length });
    await this.faelleNach(offen.map((a) => a.mappeId));
    return offen.length;
  }

  /**
   * Abwesenheit geändert (#78): Klartext im Protokoll der Benutzer-Mappe; die Aufgabe „Vertretung“
   * des bisherigen Vertreters erledigt sich, der aktuelle bekommt eine neue (nicht umgeleitet).
   */
  async abwesenheitGeaendert(b: Benutzer, alt: Abwesenheit, von: string | null, wegen?: string) {
    const neu = b.abwesenheit;
    if (!neu || JSON.stringify(neu) === JSON.stringify(alt)) return;
    const { benutzer: typ } = await this.kern.system();
    const m = await this.repo.holeMappe(b.id);
    if (!m || m.typId !== typ.id) return;
    const name = b.name || b.email;
    const datum = (t: string) => t.split('-').reverse().join('.');
    const zeitraum = (a: Abwesenheit) => (a.von && a.bis ? t('meldungen.dienst.vom-bis', { datum: datum(a.von), datum2: datum(a.bis) }) : a.von ? t('meldungen.dienst.ab-bis-die-abwesenheit', { datum: datum(a.von) })
      : a.bis ? t('meldungen.dienst.ab-sofort-bis', { datum: datum(a.bis) }) : t('meldungen.dienst.ab-sofort-bis-die'));
    const durch = von && von !== b.id ? t('meldungen.dienst.eingetragen-von', { name: await this.name(von) }) : '';
    const endet = alt.an && !neu.an;
    const text = endet ? t('meldungen.dienst.abwesenheit-beendet', { wert: wegen ? ` (${wegen})` : '' })
      : neu.an ? t('meldungen.dienst.abwesenheit-vertreter', { wert: alt.an ? t('meldungen.dienst.geaendert') : t('meldungen.dienst.eingetragen'), zeitraum: zeitraum(neu), name: await this.name(neu.vertreterId), durch })
      : t('meldungen.dienst.vertreter', { wert: neu.vertreterId ? t('meldungen.dienst.hinterlegt', { name: await this.name(neu.vertreterId) }) : t('meldungen.dienst.entfernt'), durch });
    await this.notiere(b.id, von, 'abwesenheit', { text });
    // Ereigniskatalog (#670): Abwesenheit gesetzt (auch geändert) bzw. beendet; Vertretung zurückgezogen (#678/#712)
    // für den bisherigen Vertreter, wenn die Abwesenheit endet oder ein anderer bzw. kein Vertreter eingetragen ist.
    const bisher = alt.an ? alt.vertreterId ?? null : null;
    const zurueck = bisher && (endet || !neu.an || neu.vertreterId !== bisher) ? bisher : null;
    if (endet) {
      await this.ereignis('benutzer.abwesenheit_beendet', { benutzer: b.id, vertreter: bisher }, von);
      // Aufgaben mit Anlass „Abwesenheit“ (#724, z. B. aus „Wenn Abwesenheit gesetzt“) erledigen sich.
      await this.erledigeNachAnlass(b.id, (x) => x.art === 'abwesenheit' && x.benutzer === b.id, t('meldungen.dienst.abwesenheit-beendet-2'));
    } else if (alt.an) {
      // Geändert (Zeitraum oder Vertreter): Was „Abwesenheit gesetzt“ angelegt hatte, erledigt sich; das Ereignis
      // unten legt es mit den neuen Angaben neu an – wie früher die Vertretungs-Aufgabe.
      await this.erledigeNachAnlass(b.id, (x) => x.art === 'abwesenheit' && x.benutzer === b.id, t('meldungen.dienst.vertretung-geaendert'));
    }
    if (zurueck) await this.ereignis('benutzer.vertretung_zurueckgezogen', { benutzer: b.id, vertreter: zurueck }, von);
    if (!endet && neu.an) await this.ereignis('benutzer.abwesenheit_gesetzt', { benutzer: b.id, von: neu.von, bis: neu.bis, vertreter: neu.vertreterId }, von);
    // Seit #712 legt der Kern keine Vertretungs-Aufgabe mehr an – das macht die Automatisierung „Vertretung eingetragen“
    // (Paket Benachrichtigungen bzw. beim Update übernommen). Alte Vertretungs-Aufgaben erledigen sich wie bisher.
    for (const a of (await this.repo.offeneAufgaben({ mappeIds: [b.id] })).filter((x) => x.art === 'vertretung')) {
      await this.repo.erledigeAufgabe(a.id, null);
      await this.notiere(b.id, null, 'aufgabe', { text: t('meldungen.dienst.erledigt', { wert: endet ? t('meldungen.dienst.abwesenheit-beendet-2') : t('meldungen.dienst.vertretung-geaendert'), text: a.text }), aufgabe: a.id, aufgabenart: 'vertretung', fuer: a.empfaengerId, aufgabentext: a.text });
    }
  }

  /** Aufgabe von Hand vergeben, z. B. „Bitte Rechnung prüfen“. */
  async legeAufgabeAn(mappeId: string, e: unknown, von: string | null): Promise<Aufgabe> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const x = (e ?? {}) as Record<string, unknown>;
    const text = typeof x.text === 'string' ? x.text.trim() : '';
    if (!text) throw new Fachfehler(422, t('meldungen.dienst.bitte-beschreiben-was-zu'));
    if (text.length > AUFGABE_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-zeichen', { AUFGABE_MAX }));
    const an = await this.pruefeEmpfaenger(x.empfaengerId);
    // #928: Typ und Name nur einmal lesen (je eine Abfrage weniger).
    const a = await this.neueAufgabe({ id: randomUUID(), mappeId, empfaengerId: an, art: 'manuell', text, erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null }, m.typId);
    const name = await this.name(an);
    await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.fuer', { name, text }), aufgabe: a.id, aufgabenart: 'manuell', fuer: an, aufgabentext: text });
    protokoll.modul('ablage').info('Aufgabe vergeben', { mappeId, an: name });
    const erg = await this.leiteUm(a);
    // #798: Darf der Empfänger die Mappe nicht lesen, entsteht ein Fall – der Admin erfährt davon.
    await this.faelleNach([mappeId]);
    return erg;
  }

  private async eigeneAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.repo.holeAufgabe(id);
    if (!a) throw new Fachfehler(404, t('meldungen.dienst.diese-aufgabe-gibt-es'));
    const meine = a.empfaengerId === ich.id || (!a.empfaengerId && await this.siehtOhneEmpfaenger(ich));
    if (!meine && ich.rolle !== 'admin') throw new Fachfehler(403, t('meldungen.dienst.das-ist-nicht-deine'));
    if (a.erledigt) throw new Fachfehler(409, t('meldungen.dienst.diese-aufgabe-ist-schon'));
    return a;
  }

  /** Bestätigen (Erwähnungen, manuelle Aufgaben). „Passt nicht“ erledigt sich, sobald die Mappe passt. */
  async erledigeAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.eigeneAufgabe(id, ich);
    if (a.art === 'passung') throw new Fachfehler(409, t('meldungen.dienst.diese-aufgabe-erledigt-sich'));
    // „Geändert“ bestätigen (#422) = gesehen; ohne Eintrag in der Historie der Mappe.
    if (a.art === 'aenderung') { await this.gesehen(ich, [a.mappeId]); return (await this.repo.holeAufgabe(id))!; }
    await this.repo.erledigeAufgabe(id, ich.id);
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.erledigt-2', { text: a.text }), aufgabe: id, aufgabenart: a.art, fuer: a.empfaengerId, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe erledigt', { mappeId: a.mappeId, aufgabe: a.text });
    await this.faelleNach([a.mappeId]);
    const folgetermin = await this.folgeterminVon(a);
    return { ...(await this.repo.holeAufgabe(id))!, ...(folgetermin ? { folgetermin } : {}) };
  }

  /** Weitergeben: durch den Empfänger selbst oder einen Administrator; steht im Protokoll. */
  async delegiereAufgabe(id: string, an: unknown, ich: { id: string; rolle: string }) {
    const a = await this.eigeneAufgabe(id, ich);
    const ziel = await this.pruefeEmpfaenger(an);
    if (ziel === a.empfaengerId) return a;
    await this.repo.delegiereAufgabe(id, ziel);
    const von = await this.name(a.empfaengerId), nach = await this.name(ziel);
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.weitergegeben-von-an-2', { von, nach, text: a.text }), aufgabe: id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe weitergegeben', { mappeId: a.mappeId, von, an: nach, aufgabe: a.text });
    await this.faelleNach([a.mappeId]);
    return (await this.repo.holeAufgabe(id))!;
  }

  /**
   * Sammel-Weitergabe (#415, #419): mehrere Aufgaben an einen Benutzer. Je Aufgabe dieselben Rechte wie beim
   * einzelnen Weitergeben (eigene oder – als Administrator – alle); zusätzlich muss das Ziel die Mappe lesen
   * dürfen. Was nicht geht, kommt mit Grund zurück. Jede Weitergabe steht in der Historie ihrer Mappe; der
   * Empfänger bekommt dafür **eine** Sammelbenachrichtigung statt vieler einzelner.
   */
  async aufgabenWeitergeben(ids: unknown, an: unknown, ich: { id: string; rolle: string }): Promise<{
    weitergegeben: string[]; nicht: Array<{ id: string; grund: string }>;
  }> {
    if (!Array.isArray(ids) || !ids.length) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-eine-aufgabe'));
    if (ids.length > SAMMEL_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-aufgaben-auf-einmal', { SAMMEL_MAX }));
    const ziel = await this.pruefeEmpfaenger(an);
    const nach = await this.name(ziel);
    const weitergegeben: string[] = [];
    const mappenWeiter: string[] = [];
    const nicht: Array<{ id: string; grund: string }> = [];
    for (const id of [...new Set(ids.map(String))]) {
      let a: Aufgabe;
      try { a = await this.eigeneAufgabe(id, ich); } catch (e) { if (!(e instanceof Fachfehler)) throw e; nicht.push({ id, grund: e.message }); continue; }
      if (a.empfaengerId === ziel) { nicht.push({ id, grund: t('meldungen.dienst.liegt-schon-bei', { nach }) }); continue; }
      // Lesen kann auch erst die Aufgabe selbst erlauben (Regel „hat eine Aufgabe“) – deshalb nach dem Umhängen
      // prüfen und bei Bedarf zurückhängen.
      await this.repo.delegiereAufgabe(id, ziel);
      if (!(await this.kannLesen(ziel, a.mappeId))) { await this.repo.delegiereAufgabe(id, a.empfaengerId); nicht.push({ id, grund: t('meldungen.dienst.darf-die-mappe-nicht', { nach }) }); continue; }
      const von = await this.name(a.empfaengerId);
      await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.weitergegeben-von-an-2', { von, nach, text: a.text }), aufgabe: id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text, sammel: true });
      weitergegeben.push(id);
      mappenWeiter.push(a.mappeId);
    }
    await this.faelleNach(mappenWeiter);
    if (weitergegeben.length) {
      protokoll.modul('ablage').info('Aufgaben gesammelt weitergegeben', { an: nach, anzahl: weitergegeben.length, nicht: nicht.length });
      if (ziel !== ich.id) await this.sammelHinweisWeitergabe(ziel, ich.id, weitergegeben.length);
    }
    return { weitergegeben, nicht };
  }

  /** Sammelaktion „erledigt“ (#415): wie erledigeAufgabe je Aufgabe; was nicht geht, mit Grund. */
  async aufgabenErledigen(ids: unknown, ich: { id: string; rolle: string }): Promise<{ erledigt: string[]; nicht: Array<{ id: string; grund: string }> }> {
    if (!Array.isArray(ids) || !ids.length) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-eine-aufgabe'));
    if (ids.length > SAMMEL_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-aufgaben-auf-einmal', { SAMMEL_MAX }));
    const erledigt: string[] = [];
    const nicht: Array<{ id: string; grund: string }> = [];
    for (const id of [...new Set(ids.map(String))]) {
      try { await this.erledigeAufgabe(id, ich); erledigt.push(id); } catch (e) { if (!(e instanceof Fachfehler)) throw e; nicht.push({ id, grund: e.message }); }
    }
    return { erledigt, nicht };
  }

  /**
   * Gebündelte Benachrichtigung (#415, #419; auch #422): eine offene Aufgabe je Empfänger, Mappe, Art und
   * Schlüssel. Ist schon eine offen, kommt keine zweite – `text` bekommt die bisherige und baut daraus den neuen
   * Text (etwa hochgezählt). Erst wenn der Empfänger sie erledigt hat, entsteht bei Bedarf wieder eine neue.
   */
  async benachrichtigeGebuendelt(e: { empfaengerId: string; mappeId: string; art: Aufgabenart; schluessel: string; von: string | null; text: (bisher: Aufgabe | undefined) => string | Promise<string> }) {
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [e.mappeId] })).find((a) => a.art === e.art && a.feldKey === e.schluessel && a.empfaengerId === e.empfaengerId);
    const text = (await e.text(offen)).slice(0, AUFGABE_MAX);
    if (offen) { if (offen.text !== text) await this.repo.aendereAufgabeText(offen.id, text); return offen.id; }
    const a = await this.neueAufgabe({ id: randomUUID(), mappeId: e.mappeId, empfaengerId: e.empfaengerId, art: e.art, feldKey: e.schluessel, text, erstellt: '', erstelltVon: e.von, erledigt: null, erledigtVon: null });
    return a.id;
  }

  /** Sammelbenachrichtigung der Weitergabe: an der Benutzer-Mappe dessen, der weitergegeben hat (#415). */
  private async sammelHinweisWeitergabe(ziel: string, von: string, n: number) {
    if (!(await this.repo.holeMappe(von))) return;
    const name = await this.name(von);
    await this.benachrichtigeGebuendelt({
      empfaengerId: ziel, mappeId: von, art: 'manuell', schluessel: SAMMEL_WEITERGABE, von,
      text: (bisher) => {
        const gesamt = n + Number(/(\d+) Aufgaben/.exec(bisher?.text ?? '')?.[1] ?? (bisher ? 1 : 0));
        return t('meldungen.dienst.hat-dir-aufgaben-weitergegeben', { anzahl: gesamt, name });
      },
    });
  }

  /** Meine offenen Aufgaben (mit denen der Administratoren, wenn ich einer bin). */
  async meineAufgaben(ich: { id: string; rolle: string }, z?: Zugriff) {
    const liste = await this.repo.offeneAufgaben({ benutzerId: ich.id, admin: await this.siehtOhneEmpfaenger(ich) });
    // Aufgaben zu Mappen, die man nicht lesen darf: ohne Titel (#127); automatische nur mit Hinweis (#798).
    const ok = await this.lesbare(z, liste.map((a) => a.mappeId));
    return (await this.ohneLeserechtText(liste, ok, ich.id)).map((a) => (ok.has(a.mappeId) ? a : { ...a, mappeTitel: NICHT_SICHTBAR, verborgen: true }));
  }

  /* ---------- Aufgaben bei Personen ohne Leserecht (#798) ---------- */

  /**
   * Automatische Aufgaben zu Mappen, die der Empfänger nicht lesen darf (#798): Statt des Textes steht nur „Aufgabe zu
   * einer Mappe, die du nicht sehen darfst – frag …“ (wer die Mappe angelegt hat, sonst ein Administrator); die
   * Fälligkeit bleibt – außer bei Fristen und Aufgaben zu einem Datumsfeld: Deren Datum ist ein Wert der Mappe und fällt
   * samt Feld weg (#958). Von Hand geschriebene Texte (Zugewiesen, Erinnerung – von einem Menschen) bleiben sichtbar.
   * `lesbar`: die Mappen, die er lesen darf. Gilt für „Zu erledigen“, die Mappe ohne Leserecht und die Tägliche Zusammenfassung.
   */
  private async ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string): Promise<T[]> {
    const fremd = liste.filter((a) => !lesbar.has(a.mappeId));
    if (!fremd.length) return liste;
    const menschen = new Set(this.konten?.benutzer ? (await this.konten.benutzer()).map((b) => b.id) : []);
    const vonHand = (a: Aufgabe) => (a.art === 'manuell' || a.art === 'erinnerung') && !a.anlass
      && (!a.feldKey || a.feldKey === SAMMEL_WEITERGABE) && !!a.erstelltVon && menschen.has(a.erstelltVon);
    const ersteller = new Map((await this.repo.holeMappen([...new Set(fremd.map((a) => a.mappeId))])).map((m) => [m.id, m.erstelltVon] as const));
    const text = new Map<string, string>();
    for (const id of new Set(fremd.map((a) => a.mappeId))) {
      const e = ersteller.get(id);
      text.set(id, e && e !== ich && menschen.has(e) ? t('mappen.aufgabe.ohne-leserecht', { name: await this.name(e) }) : t('mappen.aufgabe.ohne-leserecht.admin'));
    }
    // #958: Bei Fristen (und Aufgaben zu einem Datumsfeld) sind Datum und Feld Werte der Mappe – ohne Leserecht weg.
    const ausFeld = (a: Aufgabe) => a.art === 'frist' || a.anlass?.art === 'datum';
    const ohneFeld = (a: T): T => (ausFeld(a) ? { ...a, datum: null, feldKey: null, anlass: null } : a);
    return liste.map((a) => (lesbar.has(a.mappeId) ? a : ohneFeld(vonHand(a) ? a : { ...a, text: text.get(a.mappeId)! })));
  }

  /** Zugriff eines anderen Benutzers, etwa für Platzhalter mit den Rechten des Empfängers (#795); kein Mensch: null. */
  async zugriffVon(benutzerId: string): Promise<Zugriff | null> {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    return b ? this.zugriff(b) : null;
  }

  /** Wie sichtbarFuer, aber ohne Leserechte auf Zeit (#798): Was erlauben die Berechtigungen selbst? */
  async regulaerSichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    if (!b) return new Set(ids);
    return this.lesbare(await rechteMessen(() => this.bildeZugriff(b, { ohneAufZeit: true })), ids);
  }

  /**
   * Fälle abgleichen (#798): Wo liegt eine offene Aufgabe bei einem Menschen ohne Admin-Rechte, der die Mappe nach den
   * Berechtigungen nicht lesen darf? Neue Fälle anlegen; offene beenden, wenn die Aufgabe erledigt, gelöscht oder an
   * jemand anderen gegeben ist – oder die Person die Mappe inzwischen lesen darf. Endet ein Fall mit Leserecht auf
   * Zeit, steht der Entzug in der Historie der Mappe (das Recht selbst wirkt schon nicht mehr, sobald die Aufgabe
   * nicht mehr offen bei ihm liegt). Nach dem Vergeben, Weitergeben und Erledigen von Aufgaben (nur deren Mappen) und
   * regelmäßig für alle (Rechte geändert, Erwähnungen, Fristen …). Mehrere Server: Anlegen und Beenden sind eindeutig.
   */
  async faelleAbgleichen(f: { mappeIds?: string[] } = {}): Promise<{ neu: number; beendet: number }> {
    if (!this.konten?.benutzer || (f.mappeIds && !f.mappeIds.length)) return { neu: 0, beendet: 0 };
    const menschen = new Map((await this.konten.benutzer()).map((b) => [b.id, b] as const));
    const offen = (await this.repo.offeneAufgaben(f.mappeIds ? { mappeIds: f.mappeIds } : {})).filter((a) => a.empfaengerId && menschen.has(a.empfaengerId));
    const jeEmpfaenger = new Map<string, Aufgabe[]>();
    for (const a of offen) jeEmpfaenger.set(a.empfaengerId!, [...(jeEmpfaenger.get(a.empfaengerId!) ?? []), a]);
    const ohne = new Set<string>();
    for (const [id, liste] of jeEmpfaenger) {
      const ok = await this.regulaerSichtbarFuer(id, [...new Set(liste.map((a) => a.mappeId))]);
      for (const a of liste) if (!ok.has(a.mappeId)) ohne.add(a.id);
    }
    const nachId = new Map(offen.map((a) => [a.id, a] as const));
    const faelle = await this.repo.faelleOhneLeserecht({ offen: true, ...(f.mappeIds ? { mappeIds: f.mappeIds } : {}) });
    let beendet = 0;
    const bleiben = new Set<string>();
    for (const x of faelle) {
      const a = nachId.get(x.aufgabeId);
      let grund: FallEnde | null = null;
      let zeit: string | null = null;
      if (a) grund = a.empfaengerId !== x.benutzerId ? 'weitergegeben' : ohne.has(a.id) ? null : 'lesbar';
      else {
        const g = await this.repo.holeAufgabe(x.aufgabeId);
        if (!g || !(await this.repo.holeMappe(g.mappeId))) grund = 'geloescht';
        else if (g.erledigt) { grund = 'erledigt'; zeit = g.erledigt; }
        else if (g.empfaengerId !== x.benutzerId) grund = 'weitergegeben';
        // Offen bei ihm, aber kein Mensch ohne Admin-Rechte mehr (z. B. Administrator geworden): Er darf jetzt lesen.
        else grund = 'lesbar';
      }
      if (!grund) { bleiben.add(`${x.aufgabeId}|${x.benutzerId}`); continue; }
      if (!(await this.repo.beendeFall(x.id, grund, zeit))) continue;
      beendet++;
      if (x.leserechtSeit) {
        const name = await this.name(x.benutzerId);
        await this.notiere(x.mappeId, null, 'leserecht', { text: t.frei(`mappen.leserecht.entzogen.${grund}`, { name }), fall: x.id, fuer: x.benutzerId, aufgabe: x.aufgabeId, entzogen: true });
        protokoll.modul('ablage').info('Leserecht auf Zeit beendet', { mappeId: x.mappeId, fuer: name, grund });
      }
    }
    let neu = 0;
    for (const a of offen) {
      if (!ohne.has(a.id) || bleiben.has(`${a.id}|${a.empfaengerId}`)) continue;
      if (await this.repo.legeFallAn({ id: randomUUID(), aufgabeId: a.id, mappeId: a.mappeId, benutzerId: a.empfaengerId!, aufgabentext: a.text })) {
        neu++;
        protokoll.modul('ablage').info('Aufgabe bei einer Person ohne Leserecht', { mappeId: a.mappeId, fuer: await this.name(a.empfaengerId) });
      }
    }
    return { neu, beendet };
  }

  /**
   * Abgleich für einzelne Mappen nach dem Vergeben, Weitergeben oder Erledigen (#798) – ein Fehler hält die Aufgabe nicht auf.
   *
   * In einer Anfrage (#928) nach der Antwort, solange an diesen Mappen kein Leserecht auf Zeit hängt: Dann legt der Abgleich
   * höchstens Fälle für die Werkbank an oder schließt welche ohne Recht – an den Rechten ändert sich nichts, und die
   * Übersicht in der Werkbank gleicht vor dem Anzeigen ohnehin selbst ab. Hängt ein Leserecht auf Zeit daran, sofort:
   * Es endet mit der Aufgabe, nicht erst kurz danach („Nachhinken ja, falsch nie“).
   */
  private async faelleNach(mappeIds: string[]) {
    const ids = [...new Set(mappeIds)];
    const abgleichen = async () => {
      try { await this.faelleAbgleichen({ mappeIds: ids }); }
      catch (e) { protokoll.modul('ablage').warn('Aufgaben ohne Leserecht nicht abgeglichen', { fehler: (e as Error).message }); }
    };
    if (!ids.length || !this.konten?.benutzer) return;
    if (this.inAnfrage()) {
      let mitRecht = true;
      try { mitRecht = (await this.repo.faelleOhneLeserecht({ offen: true, mappeIds: ids })).some((f) => f.leserechtSeit); } catch { /* dann sofort */ }
      if (!mitRecht) { void this.nachDerAntwort(abgleichen); return; }
    }
    await abgleichen();
  }

  /** Offene Fälle (#798) – für den Hinweis in der Werkbank und die Mail an die Administratoren (#719). */
  async offeneFaelle(): Promise<FallOhneLeserecht[]> { return this.repo.faelleOhneLeserecht({ offen: true }); }

  /** Werkbank → Aufgaben → Ohne Leserecht (#798): erst abgleichen, dann offene Fälle oben, vergangene darunter. */
  async faelleUebersicht(): Promise<{ offen: FallOhneLeserecht[]; vergangen: FallOhneLeserecht[] }> {
    await this.faelleAbgleichen();
    const alle = await this.repo.faelleOhneLeserecht({ max: 500 });
    return { offen: alle.filter((x) => !x.ende), vergangen: alle.filter((x) => x.ende) };
  }

  /**
   * Leserecht für die Dauer der Aufgabe geben (#798, nur in der Werkbank): nur Lesen, nur diese Mappe; es endet von selbst,
   * wenn die Aufgabe erledigt, gelöscht oder an jemand anderen gegeben wird. Steht in der Historie der Mappe.
   */
  async leserechtAufZeitGeben(fallId: unknown, von: string | null): Promise<FallOhneLeserecht> {
    if (!istUuid(fallId)) throw new Fachfehler(404, t('werkbank.ohne-leserecht.fehler.weg'));
    const vorher = (await this.repo.faelleOhneLeserecht({ offen: true })).find((x) => x.id === fallId);
    if (vorher) await this.faelleAbgleichen({ mappeIds: [vorher.mappeId] });
    const f = (await this.repo.faelleOhneLeserecht({ offen: true })).find((x) => x.id === fallId);
    if (!f) throw new Fachfehler(409, t('werkbank.ohne-leserecht.fehler.weg'));
    if (!f.leserechtSeit) {
      if (!(await this.repo.gibLeserechtAufZeit(f.id, von))) throw new Fachfehler(409, t('werkbank.ohne-leserecht.fehler.weg'));
      const name = await this.name(f.benutzerId);
      const aufgabe = f.aufgabentext.length > 80 ? `${f.aufgabentext.slice(0, 79)}…` : f.aufgabentext;
      await this.notiere(f.mappeId, von, 'leserecht', { text: t('mappen.leserecht.vergeben', { name, aufgabe, von: await this.name(von) }), fall: f.id, fuer: f.benutzerId, aufgabe: f.aufgabeId, vergeben: true });
      protokoll.modul('werkbank').info('Leserecht auf Zeit gegeben', { mappeId: f.mappeId, fuer: name, von: await this.name(von) });
    }
    return (await this.repo.faelleOhneLeserecht({ offen: true, mappeIds: [f.mappeId] })).find((x) => x.id === f.id) ?? f;
  }
  /** Werkbank: alle offenen oder die zuletzt erledigten. */
  async alleAufgaben(erledigt = false) { return erledigt ? this.repo.erledigteAufgaben(500) : this.repo.offeneAufgaben(); }
  aufgabenVon(mappeId: string) { return this.repo.aufgabenVon(mappeId); }

  /* ---------- Fristen (#129–#133) ---------- */

  /**
   * Frist-Aufgaben abgleichen: offene Fristen erledigen sich, sobald das Datum nicht mehr stimmt; „Frist erreicht“
   * melden. Neue Frist-Aufgaben legt seit #712 nur noch die Automatisierung „Datum erreicht“ an.
   * Nach dem Speichern einer Mappe, nach Änderungen am Mappentyp und regelmäßig (täglicher Lauf).
   */
  async fristenAbgleichen(f: { typId?: string; mappeIds?: string[] } = {}, heute = heuteIn()): Promise<{ angelegt: number; erledigt: number }> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    let mappen: Mappe[];
    if (f.mappeIds) mappen = await this.repo.holeMappen(f.mappeIds);
    else {
      // Typen mit Erinnerung – und solche, an denen noch offene Fristen hängen (Erinnerung abgeschaltet).
      const offen = new Set((await this.repo.fristAufgaben()).filter((a) => !a.erledigt).map((a) => a.typId));
      const welche = [...typen.values()].filter((t) => (!f.typId || t.id === f.typId) && (fristFelder(t).length || offen.has(t.id)));
      mappen = (await Promise.all(welche.map((t) => this.repo.listeMappen(t.id)))).flat();
    }
    if (!mappen.length) return { angelegt: 0, erledigt: 0 };
    const vorhanden = await this.repo.fristAufgaben(f.mappeIds ?? (f.typId ? mappen.map((m) => m.id) : undefined));
    const angelegt = 0; let erledigt = 0;
    for (const m of mappen) {
      const typ = typen.get(m.typId);
      if (!typ) continue;
      // Offene Fristen, deren Datum sich geändert hat oder leer ist: erledigt.
      for (const a of vorhanden.filter((x) => x.mappeId === m.id && !x.erledigt)) {
        const feld = typ.felder.find((x) => x.key === a.feldKey);
        const wert = a.feldKey ? m.werte[a.feldKey] : null;
        // Aus einer Automatisierung (Anlass Datum): erledigt sich nur, wenn das Datum nicht mehr stimmt.
        const giltNoch = a.anlass?.art === 'datum' ? !!feld : !!feld?.frist;
        if (giltNoch && wert === a.datum) continue;
        const grund = !feld ? t('meldungen.dienst.feld-entfernt') : !giltNoch ? t('meldungen.dienst.keine-erinnerung-mehr') : !istDatum(wert) ? t('meldungen.dienst.datum-leer') : wert > (a.datum ?? '') ? t('meldungen.dienst.verschoben-auf', { datumDe: datumDe(wert) }) : t('meldungen.dienst.geaendert-auf', { datumDe: datumDe(wert) });
        await this.repo.erledigeAufgabe(a.id, null);
        await this.notiere(m.id, null, 'aufgabe', { text: t('meldungen.dienst.erledigt-3', { grund, text: a.text }), aufgabe: a.id, aufgabenart: 'frist', fuer: a.empfaengerId, aufgabentext: a.text });
        erledigt++;
      }
      for (const feld of fristFelder(typ)) {
        const wert = m.werte[feld.key];
        const fr = feld.frist!;
        // Ereigniskatalog (#670): „Frist erreicht“ zum Erinnerungszeitpunkt und am Tag selbst – je Zeitpunkt genau einmal.
        if (istDatum(wert) && !m.demo && wert >= heute && fristAb(wert, fr) <= heute) {
          const an = fristEmpfaenger(fr, m);
          await this.fristErreicht(m, feld.key, wert, 'vorlauf', an);
          if (wert === heute) await this.fristErreicht(m, feld.key, wert, 'faellig', an);
        }
        // #712: Das Feld legt keine Aufgaben mehr selbst an – das tun die Automatisierungen „Datum erreicht“, in die
        // jede Erinnerung am Feld beim Update übernommen wurde (Automatisierungen.fristenUebernehmen).
      }
    }
    if (angelegt || erledigt) protokoll.modul('ablage').info('Fristen abgeglichen', { angelegt, erledigt });
    return { angelegt, erledigt };
  }

  /**
   * „Frist erreicht“ (#670): Merken und Ereignis in einer Transaktion – auch wenn zwei Server den Fristen-Lauf zugleich
   * machen oder er nach einem Neustart wiederholt wird, kommt es je Mappe, Feld, Datum und Zeitpunkt genau einmal.
   */
  private async fristErreicht(m: Mappe, feld: string, datum: string, zeitpunkt: 'vorlauf' | 'faellig', empfaenger: string | null) {
    try {
      await this.inTransaktion(async () => {
        if (!(await this.repo.merkeFristMeldung({ mappeId: m.id, feld, datum, zeitpunkt }))) return;
        await this.ereignis('frist.erreicht', { mappe: m.id, typ: m.typId, feld, datum, zeitpunkt, empfaenger });
      });
    } catch (e) { protokoll.modul('ablage').warn('„Frist erreicht“ nicht gemeldet', { mappe: m.id, feld, fehler: (e as Error).message }); }
  }

  /** Fällige freie Erinnerungen (#131) werden zu Aufgaben. */
  async erinnerungenFaellig(heute = heuteIn()): Promise<number> {
    let n = 0;
    for (const e of await this.repo.erinnerungen({ bis: heute })) {
      const a = await this.neueAufgabe({ id: randomUUID(), mappeId: e.mappeId, empfaengerId: e.empfaengerId, art: 'erinnerung', text: e.text, datum: e.datum, erstellt: '', erstelltVon: e.erstelltVon, erledigt: null, erledigtVon: null });
      await this.repo.loescheErinnerung(e.id);
      await this.notiere(e.mappeId, null, 'aufgabe', { text: t('meldungen.dienst.erinnerung-faellig-fuer', { name: await this.name(e.empfaengerId), text: e.text }), aufgabe: a.id, aufgabenart: 'erinnerung', fuer: e.empfaengerId, aufgabentext: e.text });
      await this.leiteUm(a);
      n++;
    }
    return n;
  }

  /** Täglicher (bzw. stündlicher) Lauf: Fristen und fällige Erinnerungen. */
  async fristenLauf(heute = heuteIn()) {
    const f = await this.fristenAbgleichen({}, heute);
    return { ...f, erinnerungen: await this.erinnerungenFaellig(heute) };
  }

  private static erinnerungEingabe(e: unknown): { datum: string; text: string; empfaengerId?: unknown } {
    const x = (e ?? {}) as Record<string, unknown>;
    if (!istDatum(x.datum)) throw new Fachfehler(422, t('meldungen.dienst.bitte-ein-datum-angeben'));
    const text = typeof x.text === 'string' ? x.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) throw new Fachfehler(422, t('meldungen.dienst.woran-soll-erinnert-werden'));
    if (text.length > ERINNERUNG_TEXT_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-zeichen-2', { ERINNERUNG_TEXT_MAX }));
    return { datum: x.datum, text, empfaengerId: x.empfaengerId };
  }

  /** Erinnerung an einer Mappe (#131): für mich oder einen anderen Benutzer; ist das Datum schon da, gleich als Aufgabe. */
  async legeErinnerungAn(mappeId: string, e: unknown, von: string): Promise<Erinnerung | Aufgabe> {
    const x = Dienst.erinnerungEingabe(e);
    const an = x.empfaengerId ? await this.pruefeEmpfaenger(x.empfaengerId) : von;
    const r = await this.repo.legeErinnerungAn({ id: randomUUID(), mappeId, empfaengerId: an, datum: x.datum, text: x.text, erstellt: '', erstelltVon: von });
    await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erinnerung-fuer-am', { name: await this.name(an), datumDe: datumDe(x.datum), text: x.text }), aufgabenart: 'erinnerung', fuer: an, aufgabentext: x.text });
    if (x.datum <= heuteIn()) await this.erinnerungenFaellig();
    return r;
  }

  /** Ändern und Löschen: Ersteller, Empfänger oder ein Administrator. */
  private async eigeneErinnerung(id: string, ich: { id: string; rolle: string }): Promise<Erinnerung> {
    const e = await this.repo.holeErinnerung(id);
    if (!e) throw new Fachfehler(404, t('meldungen.dienst.diese-erinnerung-gibt-es'));
    if (e.erstelltVon !== ich.id && e.empfaengerId !== ich.id && ich.rolle !== 'admin') throw new Fachfehler(403, t('meldungen.dienst.aendern-kann-eine-erinnerung'));
    return e;
  }
  async erinnerungMappe(id: string) { const e = await this.repo.holeErinnerung(id); if (!e) throw new Fachfehler(404, t('meldungen.dienst.diese-erinnerung-gibt-es-2')); return e.mappeId; }

  async aendereErinnerung(id: string, e: unknown, ich: { id: string; rolle: string }): Promise<Erinnerung> {
    const alt = await this.eigeneErinnerung(id, ich);
    const x = Dienst.erinnerungEingabe(e);
    const an = x.empfaengerId ? await this.pruefeEmpfaenger(x.empfaengerId) : alt.empfaengerId;
    const neu = (await this.repo.aendereErinnerung(id, { datum: x.datum, text: x.text, empfaengerId: an }))!;
    await this.notiere(alt.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.erinnerung-geaendert-fuer-am', { name: await this.name(an), datumDe: datumDe(x.datum), text: x.text }), aufgabenart: 'erinnerung', fuer: an, aufgabentext: x.text });
    if (x.datum <= heuteIn()) await this.erinnerungenFaellig();
    return neu;
  }

  async loescheErinnerung(id: string, ich: { id: string; rolle: string }) {
    const e = await this.eigeneErinnerung(id, ich);
    await this.repo.loescheErinnerung(id);
    await this.notiere(e.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.erinnerung-geloescht', { text: e.text }), aufgabenart: 'erinnerung', fuer: e.empfaengerId, aufgabentext: e.text });
  }

  /**
   * Termine für „Zu erledigen“ → Monat und Jahr (#528, #725): von … bis (höchstens ein Jahr), nach Datum.
   *
   * - Eigene offene Aufgaben mit Datum (Fristen, Erinnerungen, andere wie „Auskunft bis …“) – Überfälliges auch
   *   außerhalb des Zeitraums (für „3 überfällig“).
   * - Die Daten der Frist-Felder („ist eine Frist“, #712) an allen Mappen, die man **lesen darf** – der Empfänger
   *   am Feld ist mit #712 weggefallen –, dazu die künftigen Termine wiederkehrender Fristen; `favoriten` grenzt
   *   auf die eigenen Favoriten ein.
   * - Eigene freie Erinnerungen und die Feiertage der Region (#726).
   *
   * Eine Vorschau „demnächst“ gibt es nicht mehr (#725): Automatisierungen legen die Aufgabe zum richtigen
   * Zeitpunkt in „Zu erledigen“.
   *
   * Zwischengespeichert wie die Zahlen der Ansichten (#512): je Benutzer, Rechte und Zeitraum, solange sich
   * am Haushalt nichts ändert (auch Erinnerungen zählen hier), höchstens 5 Minuten, nie über Mitternacht.
   */
  async termine(z: Zugriff, q: { von?: unknown; bis?: unknown; favoriten?: unknown } = {}, land?: Bundesland | null): Promise<TermineAntwort> {
    const heute = heuteIn();
    const problem = zeitraumProblem(q.von, q.bis);
    if (problem) throw new Fachfehler(422, problem);
    const von = q.von as string; const bis = q.bis as string;
    const nurFavoriten = q.favoriten === true || q.favoriten === '1' || q.favoriten === 'true';
    // #719: Sieht er die Aufgaben ohne Empfänger? Das ändert sich mit der Werkbank, nicht mit dem Haushaltsstand.
    const ohne = await this.siehtOhneEmpfaenger(z.ich);
    const schluessel = `${z.ich.id}|${z.ich.rolle}|${ohne ? 'o' : ''}|${fingerabdruck({ lesen: z.lesen, paket: z.paket?.id ?? null })}|${von}|${bis}|${nurFavoriten ? 'f' : 'a'}`;
    const beginn = performance.now();
    // #918: ohne Favoriten am Mappenstand – ein Stern rechnet die Termine nicht neu.
    const speicher = nurFavoriten || mitFavoriten(z.lesen) ? this.termineFavSpeicher : this.termineSpeicher;
    const r = await speicher.hole(schluessel, async () => ({ wert: await this.sammleTermine(z, heute, von, bis, nurFavoriten), zeitabhaengig: true }), this.gueltigkeit());
    const k = kontext.getStore();
    if (k) k.zwischenspeicher = { art: r.art, ms: performance.now() - beginn };
    return { heute, von, bis, eintraege: r.wert, feiertage: feiertageZwischen(von, bis, land) };
  }

  /**
   * Startseite (#725): der nächste Termin ab heute (innerhalb eines Jahres) und die Zahl des Überfälligen.
   *
   * #918: erst die nächsten 31 Tage, nur ohne Termin darin das ganze Jahr. Das Ergebnis ist dasselbe: Jeder Termin der
   * 31 Tage ist auch einer des Jahres, alles danach ist später; Überfälliges kommt in jedem Zeitraum ganz mit, und bei
   * gleichem Datum ordnet `sammleTermine` eindeutig. Ein Jahr umfasst bei jährlichen Fristen jede Mappe, 31 Tage nur
   * die mit einem Termin in diesen Monaten.
   */
  async naechsterTermin(z: Zugriff): Promise<{ termin: Termin | null; ueberfaellig: number }> {
    const heute = heuteIn();
    const aus = (t: TermineAntwort) => ({ termin: t.eintraege.find((x) => x.datum >= heute) ?? null, ueberfaellig: t.eintraege.filter((x) => x.faellig && x.datum < heute).length });
    const nah = aus(await this.termine(z, { von: heute, bis: verschiebe(heute, NAECHSTER_TERMIN_ERST_TAGE) }));
    return nah.termin ? nah : aus(await this.termine(z, { von: heute, bis: verschiebe(heute, 365) }));
  }

  private async sammleTermine(z: Zugriff, heute: string, von: string, bis: string, nurFavoriten: boolean): Promise<Termin[]> {
    const ich = z.ich.id;
    const ohne = await this.siehtOhneEmpfaenger(z.ich);
    const ab = von > heute ? von : heute;
    const erg: Termin[] = [];
    // Schon fällig: eigene offene Aufgaben mit Datum. Überfälliges immer, sonst nur im Zeitraum.
    const offen = (await this.repo.offeneAufgaben({ benutzerId: ich, admin: ohne })).filter((a) => istDatum(a.datum) && a.datum <= bis && (a.datum < heute || a.datum >= von));
    const lesbar = await this.lesbare(z, offen.map((a) => a.mappeId));
    for (const a of offen) {
      if (!lesbar.has(a.mappeId)) continue;
      const art = a.art === 'frist' || a.art === 'erinnerung' ? a.art : 'aufgabe';
      erg.push({ art, datum: a.datum!, ab: a.erstellt.slice(0, 10), text: a.text, mappeId: a.mappeId, mappeTitel: a.mappeTitel ?? '', typId: a.typId ?? '', faellig: true, feldKey: a.feldKey ?? null });
    }
    // Frist-Felder an lesbaren Mappen (#725: „lesen darf“ statt „für mich“), mit künftigen Terminen
    // wiederkehrender Fristen (#528), gerechnet vom eingetragenen Datum.
    for (const typ of [...z.typen.values()].filter((x) => fristFelder(x).length)) {
      const felder = fristFelder(typ);
      const wiederkehrend = felder.filter((f) => f.frist!.wiederholung);
      const termine = (m: FristKandidat, f: Feld): Array<{ datum: string; folge: boolean }> => {
        const w = m.werte[f.key];
        if (!istDatum(w)) return [];
        const x = w >= ab && w <= bis ? [{ datum: w, folge: false }] : [];
        return wiederkehrend.includes(f) ? [...x, ...folgetermine(w, f.frist!.wiederholung!, ab, bis).map((d) => ({ datum: d, folge: true }))] : x;
      };
      // Nur Mappen, die im Zeitraum einen Termin haben können (#477, #918: Vorfilter fristtermine, auch für
      // wiederkehrende Fristen), und von ihnen nur Titel und Datumswerte. Entschieden wird hier, mit `termine`.
      const kandidaten = await this.repo.fristKandidaten(typ.id, felder.map((f) => ({ key: f.key, monate: f.frist!.wiederholung ?? null })), ab, bis);
      let passend = kandidaten.filter((m) => felder.some((f) => termine(m, f).length));
      if (nurFavoriten && passend.length) { const fav = await this.repo.favoritenVon(ich, passend.map((m) => m.id)); passend = passend.filter((m) => fav.has(m.id)); }
      if (!passend.length) continue;
      const ok = await this.lesbare(z, passend.map((m) => m.id));
      const schon = new Set(erg.filter((x) => x.faellig && x.feldKey).map((x) => `${x.mappeId}|${x.feldKey}|${x.datum}`));
      for (const m of passend) {
        if (!ok.has(m.id)) continue;
        for (const f of felder) {
          for (const t of termine(m, f)) {
            if (schon.has(`${m.id}|${f.key}|${t.datum}`)) continue;
            erg.push({ art: 'frist', datum: t.datum, ab: t.datum, text: fristText(f.frist!, f, t.datum, m.titel ?? ''), mappeId: m.id, mappeTitel: m.titel ?? '', typId: m.typId, faellig: false, feldKey: f.key, ...(t.folge ? { folgetermin: true } : {}) });
          }
        }
      }
    }
    // Eigene freie Erinnerungen.
    const erinnerungen = (await this.repo.erinnerungen({ empfaengerId: ich, bis })).filter((e) => e.datum >= von);
    const ok = await this.lesbare(z, erinnerungen.map((e) => e.mappeId));
    for (const e of erinnerungen) {
      if (!ok.has(e.mappeId)) continue;
      erg.push({ art: 'erinnerung', datum: e.datum, ab: e.datum, text: e.text, mappeId: e.mappeId, mappeTitel: e.mappeTitel ?? '', typId: e.typId ?? '', faellig: false, erinnerungId: e.id });
    }
    let liste = erg;
    if (nurFavoriten) { const fav = await this.repo.favoritenVon(ich, [...new Set(erg.map((x) => x.mappeId))]); liste = erg.filter((x) => fav.has(x.mappeId)); }
    // Eindeutige Reihenfolge (#918): bei gleichem Datum und Titel fällige Aufgaben, Fristen, Erinnerungen, dann nach
    // Mappe, Feld und Erinnerung – unabhängig davon, in welcher Reihenfolge die Datenbank liefert.
    const rang = (x: Termin) => (x.faellig ? 0 : x.art === 'frist' ? 1 : 2);
    const vgl = (a?: string | null, b?: string | null) => ((a ?? '') < (b ?? '') ? -1 : (a ?? '') > (b ?? '') ? 1 : 0);
    liste.sort((a, b) => a.datum.localeCompare(b.datum) || a.mappeTitel.localeCompare(b.mappeTitel, 'de') || rang(a) - rang(b)
      || vgl(a.mappeId, b.mappeId) || vgl(a.feldKey, b.feldKey) || vgl(a.erinnerungId, b.erinnerungId) || vgl(a.text, b.text) || vgl(a.ab, b.ab));
    return liste;
  }

  /** Wiederkehrende Frist (#130): Vorschlag für den nächsten Termin, solange das Datum noch das der Frist ist. */
  private async folgeterminVon(a: Aufgabe): Promise<string | null> {
    if (a.art !== 'frist' || !a.feldKey || !a.datum) return null;
    const m = await this.repo.holeMappe(a.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const w = a.anlass?.art === 'datum' ? a.anlass.wiederholung : typ?.felder.find((f) => f.key === a.feldKey)?.frist?.wiederholung;
    return w && m && m.werte[a.feldKey] === a.datum ? naechsterTermin(a.datum, w) : null;
  }

  /** „Datum auf … setzen“ (#130): nie automatisch, nur auf Klick – mit Eintrag im Protokoll wie jede Änderung. */
  async setzeFolgetermin(aufgabeId: string, ich: { id: string; rolle: string }, z?: Zugriff) {
    const a = await this.repo.holeAufgabe(aufgabeId);
    if (!a) throw new Fachfehler(404, t('meldungen.dienst.diese-aufgabe-gibt-es'));
    const naechster = await this.folgeterminVon(a);
    if (!naechster) throw new Fachfehler(409, t('meldungen.dienst.das-datum-hat-sich'));
    return this.aendereMappe(a.mappeId, { werte: { [a.feldKey!]: naechster } }, ich.id, z);
  }

  /* ---------- Notizen (#55) ---------- */

  private static notiztext(e: unknown): string { return MappenDienst.notiztext(e); }
  private static vorschau(t: string) { return MappenDienst.vorschau(t); }
  notizen(mappeId: string): Promise<Notiz[]> { return this.mappen.notizen(mappeId); }

  /* ---------- E-Mail aus der Mappe (#58) ---------- */

  /**
   * Verschickt eine E-Mail mit ausgewählten Dokumenten der Mappe. Absender ist das DMS,
   * „Antworten an“ der Benutzer. Danach gibt es eine Post-Mappe (#192: Kanal E-Mail, ausgehend,
   * erledigt, zugeordnet zur Mappe) mit den Anhängen (dieselbe Datei, kein zweiter Speicherplatz)
   * und einen Eintrag im Protokoll.
   */
  /** Empfänger, Betreff und Nachricht einer E-Mail prüfen (#58, #151). */
  private static emailKopf(e: Record<string, unknown>) {
    const an = [...new Set(String(e.an ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))];
    const betreff = String(e.betreff ?? '').replace(/[\r\n]+/g, ' ').trim();
    const nachricht = String(e.nachricht ?? '');
    const fehler: Record<string, string> = {};
    if (!an.length) fehler.an = t('meldungen.dienst.mindestens-einen-empfaenger-angeben');
    else if (an.length > EMAIL_MAX_EMPFAENGER) fehler.an = t('meldungen.dienst.hoechstens-empfaenger', { EMAIL_MAX_EMPFAENGER });
    else if (an.some((x) => !istEmail(x))) fehler.an = t('meldungen.dienst.keine-gueltige-adresse', { filter: an.filter((x) => !istEmail(x)).join(', ') });
    if (!betreff) fehler.betreff = t('meldungen.dienst.der-betreff-fehlt');
    else if (betreff.length > 250) fehler.betreff = t('meldungen.dienst.der-betreff-ist-zu');
    if (nachricht.length > NOTIZ_MAX) fehler.nachricht = t('meldungen.dienst.die-nachricht-ist-zu');
    if (Object.keys(fehler).length) throw new Fachfehler(422, Object.values(fehler).join(' '), { felder: fehler });
    return { an, betreff, nachricht };
  }

  /**
   * Mehrere Mappen per E-Mail (#151): eine E-Mail an alle Empfänger. Anhänge: je Mappe ihre Angaben als
   * PDF („Titel.pdf“, wenn `angaben`) und die gewählten Dokumente (`dokumente`: „alle“ oder Ids).
   * Rechte: Lesen und Versenden (Recht E einer Ansicht, Regel A wie beim Export) je Mappe – über die gemeinsame
   * Prüfstelle (#723). Anhänge wie bei einer Mappe (`versandTeil`). Danach eine Post (Kanal E-Mail, ausgehend,
   * erledigt), die auf alle Mappen verweist, und je Mappe ein Eintrag in der Historie.
   */
  async versendeMappen(eingabe: unknown, ich: { id: string; name: string; email: string; rolle: string }, z: Zugriff, mailer: Mailer | null) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = [...new Set((Array.isArray(e.ids) ? e.ids : []).map(String).filter(istUuid))];
    if (!ids.length) throw new Fachfehler(422, t('meldungen.dienst.keine-mappen-ausgewaehlt'));
    if (ids.length > EMAIL_MAX_MAPPEN) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-mappen-in-einer', { EMAIL_MAX_MAPPEN }));
    const { an, betreff, nachricht } = Dienst.emailKopf(e);
    Dienst.pruefeFassungswahl(e);
    // Rechte (#723, gemeinsame Prüfstelle): jede Mappe lesbar und versendbar – sonst nichts verschicken (keine stillen Lücken).
    await this.pruefeAusgang(ich, z, 'email', ids);
    if (!mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand'));
    const mappen = inReihenfolge(await this.repo.holeMappen(ids), ids);
    if (mappen.length !== ids.length) throw new Fachfehler(404, t('meldungen.dienst.eine-ausgewaehlte-mappe-gibt'));
    const angaben = e.angaben !== false;
    const gewaehlt = e.dokumente === 'alle' ? null : new Set((Array.isArray(e.dokumente) ? e.dokumente : []).map(String));
    const dokJe = await this.dokumenteJeMappe(mappen.map((m) => m.id));
    if (gewaehlt) {
      const bekannt = new Set(mappen.flatMap((m) => (dokJe.get(m.id) ?? []).map((d) => d.id)));
      if ([...gewaehlt].some((id) => !bekannt.has(id))) throw new Fachfehler(422, t('meldungen.dienst.ein-ausgewaehltes-dokument-gehoert'));
    }
    const quelle = angaben ? await this.angabenQuelle(z, mappen) : null;
    const stempelDaten = await this.stempelDaten();
    const je: Versandteil[] = [];
    for (const m of mappen) {
      const docs = (dokJe.get(m.id) ?? []).filter((d) => !gewaehlt || gewaehlt.has(d.id));
      je.push(await this.versandTeil(m, docs, { e, an, ich, quelle, stempelDaten }));
    }
    const groesse = je.reduce((a, x) => a + x.groesse, 0);
    if (groesse > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, t('meldungen.dienst.die-anhaenge-sind-zusammen', { round: Math.round(EMAIL_MAX_ANHAENGE / 1e6) }));
    const { namen, anhaenge } = await this.versandAnhaenge(je);
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge });
    } catch (x) {
      throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-wurde', { message: (x as Error).message }));
    }
    const { post: typ } = await this.kern.system();
    const id = randomUUID();
    await this.schreibeSystemMappe(typ, id, {
      betreff, an: an.join(', '), absender: antwortAn.replace(/"/g, ''), datum: heuteIn(), bezug: ids, ...(nachricht.trim() ? { nachricht } : {}),
      kanal: POST_KANAL.email, richtung: POST_RICHTUNG.ausgehend, stand: POST_STAND.erledigt,
    }, ich.id);
    await this.legeVersandAb(typ, id, je, namen, ich.id);
    let i = 0;
    for (const x of je) {
      const teile = [...(x.angaben ? [x.angaben] : []), ...x.dokumente];
      const n = teile.length;
      const stempeltext = x.ausgaben.find((y) => y.stempeltext)?.stempeltext;
      const mitStempel = x.ausgaben.some((y) => y.gestempelt);
      const was = weitergabeWas(x.ausgaben);
      await this.notiere(x.m.id, ich.id, 'email', {
        text: t('meldungen.dienst.an-mit-mappen', { betreff, an: an.join(', '), mappen: mappen.length, wert: n ? t('meldungen.dienst.von-dieser-anhaenge', { anzahl: n }) : '', wert2: was ? `, ${was}` : '' }), email: id,
        an, betreff, nachricht: nachricht.slice(0, NOTIZ_MAX), mappen: mappen.length,
        anhaenge: teile.map((y) => ({ name: namen[i++], groesse: y.groesse })),
        ...(mitStempel ? { stempel: stempeltext ?? null, stempelAn: x.plan?.empfaenger ?? null } : {}),
      });
    }
    protokoll.modul('ablage').info('E-Mail mit mehreren Mappen verschickt', { mappen: mappen.length, empfaenger: an.length, anhaenge: anhaenge.length, bytes: groesse });
    return { id, typId: typ.id, mappen: mappen.length, anhaenge: anhaenge.length };
  }

  /** `fassung` und `fassungen` (je Dokument) kennen nur „original“ und „archiv“ – geprüft, bevor etwas geschieht. */
  private static pruefeFassungswahl(e: Record<string, unknown>) {
    const werte = [e.fassung, ...(e.fassungen && typeof e.fassungen === 'object' ? Object.values(e.fassungen) : [])];
    if (werte.some((v) => v !== undefined && v !== null && v !== 'original' && v !== 'archiv')) throw new Fachfehler(422, t('meldungen.dienst.fassung-kennt-nur-original'));
  }

  /** Typen und Titel der Verweise für das PDF „Angaben“ – mit `z` nur, was der Benutzer sehen darf. */
  private async angabenQuelle(z: Zugriff | undefined, mappen: Mappe[]): Promise<Parameters<typeof mappenPdf>[2]> {
    const typen = z?.typen ?? new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const verweise = mappen.flatMap((m) => { const t = typen.get(m.typId); return [...(t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v); });
    const bezuege = await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(verweise)]));
    return { typen, titel: (id: string | null | undefined) => (id ? bezuege[id]?.titel || NICHT_SICHTBAR : '') };
  }

  /**
   * Was von einer Mappe per E-Mail hinausgeht (#723: ein Weg für eine und mehrere Mappen). Für jedes Dokument gilt
   * dieselbe Wahl Original/Archivfassung (`fassungen` je Dokument, sonst `fassung` für alle; ohne Archivfassung
   * und bei E-Rechnungen das Original), derselbe Stempel (gewünscht oder Pflicht des Mappentyps) – auch auf dem
   * PDF „Angaben“ – und dasselbe Verkleinern. `groesse` zählt alles, was angehängt wird, das Angaben-PDF mit.
   */
  private async versandTeil(m: Mappe, docs: Dokument[], o: {
    e: Record<string, unknown>; an: string[]; ich: { name: string };
    /** Mit Angaben-PDF: Typen und Titel der Verweise; null = ohne. */
    quelle: Parameters<typeof mappenPdf>[2] | null;
    stempelDaten: Awaited<ReturnType<Dienst['stempelDaten']>>;
  }): Promise<Versandteil> {
    const wahl = (o.e.fassungen && typeof o.e.fassungen === 'object' ? o.e.fassungen : {}) as Record<string, unknown>;
    const quellen = await Promise.all(docs.map((d) => this.ausgabeQuelle(d, wahl[d.id] ?? o.e.fassung, wahl[d.id] === undefined)));
    const pdf = o.quelle ? await mappenPdf(m.titel || t('meldungen.dienst.ohne-titel'), [{ mappe: m, typ: o.quelle.typen.get(m.typId), dokumente: [], inhalt: (d: Dokument) => this.liesGanz(d.sha256) }], o.quelle, null) : null;
    // Stempel (#394): gewünscht oder vom Mappentyp verlangt; {empfänger} sind ohne Angabe die Adressen.
    const plan = docs.length || pdf ? await this.stempelPlan(m.typId, wunschAus(o.e.stempel), o.an.join(', '), o.stempelDaten) : null;
    // Verkleinert senden (#393): PDFs als verkleinerte Kopie, vor dem Stempeln.
    const klein = stufeAus(o.e.verkleinern);
    const kontext = (d?: Dokument) => ({ benutzer: o.ich.name, mappe: m.titel || t('meldungen.dienst.ohne-titel'), archivnummer: d?.archivnummer ?? null, entsperrt: this.entsperrtZu });
    const bearbeiten = !!plan || (!!klein && docs.length > 0);
    const dokumente: Versandanhang[] = await Promise.all(quellen.map(async (q, i): Promise<Versandanhang> => {
      const d = docs[i];
      if (bearbeiten) {
        const roh = await fuerAusgabe({ name: q.name, mime: q.mime, inhalt: await q.inhalt() }, { stempel: plan, verkleinern: klein }, kontext(d));
        // Unverändert, aber Archivfassung: in der Post liegt dann die Fassung, nicht das Original.
        const a: Ausgabe = q.archiv && roh.unveraendert ? { ...roh, unveraendert: undefined } : roh;
        return { dokument: d, name: a.name, mime: a.mime, groesse: a.inhalt.length, ausgabe: a, inhalt: async () => a.inhalt };
      }
      if (q.archiv) {
        const b = await q.inhalt();
        return { dokument: d, name: q.name, mime: q.mime, groesse: b.length, ausgabe: { name: q.name, mime: q.mime, inhalt: b, stempeltext: null }, inhalt: async () => b };
      }
      return { dokument: d, name: d.name, mime: d.mime, groesse: d.groesse, ausgabe: null, inhalt: () => this.dateien.lies(d.sha256) as Promise<Buffer | Readable> };
    }));
    let angaben: Versandanhang | null = null;
    if (pdf) {
      const name = `${m.titel || t('meldungen.dienst.ohne-titel')}.pdf`;
      // Das PDF „Angaben“ geht ebenso hinaus: der Stempel (Pflicht oder gewünscht) gilt auch für es (#723).
      const a = plan ? await fuerAusgabe({ name, mime: 'application/pdf', inhalt: pdf }, { stempel: plan }, kontext()) : null;
      const b = a?.inhalt ?? pdf;
      angaben = { dokument: null, name, mime: 'application/pdf', groesse: b.length, ausgabe: a ?? { name, mime: 'application/pdf', inhalt: b, stempeltext: null }, inhalt: async () => b };
    }
    const ausgaben = [...(angaben?.ausgabe?.gestempelt ? [angaben.ausgabe] : []), ...dokumente.flatMap((x) => (x.ausgabe ? [x.ausgabe] : []))];
    const groesse = (angaben?.groesse ?? 0) + dokumente.reduce((s, x) => s + x.groesse, 0);
    return { m, plan, angaben, dokumente, ausgaben, groesse };
  }

  /** Anhänge der E-Mail mit eindeutigen Dateinamen: je Mappe erst „Titel.pdf“ der Angaben, dann die Dokumente. */
  private async versandAnhaenge(je: Versandteil[]) {
    const teile = je.flatMap((x) => [...(x.angaben ? [x.angaben] : []), ...x.dokumente]);
    const namen = eindeutig(teile.map((x) => sichererName(x.name, 120)));
    const anhaenge = await Promise.all(teile.map(async (x, i) => ({ name: namen[i], mime: x.mime, inhalt: await x.inhalt() })));
    return { namen, anhaenge };
  }

  /** In der Post liegt, was verschickt wurde: gestempelte Kopien und Fassungen als eigene Datei, sonst dieselbe Datei. */
  private async legeVersandAb(typ: Mappentyp, postId: string, je: Versandteil[], namen: string[], von: string) {
    const reg = typ.register.find((r) => r.art === 'dokumente');
    if (!reg) return;
    let i = 0;
    for (const x of je) {
      for (const y of [...(x.angaben ? [x.angaben] : []), ...x.dokumente]) {
        const name = namen[i++];
        if (y.dokument) { await this.legeVersandkopieAn(y.dokument, y.ausgabe ?? undefined, postId, reg.key, von, name); continue; }
        const inhalt = y.ausgabe!.inhalt;
        const sha256 = createHash('sha256').update(inhalt).digest('hex');
        await this.dateien.schreibe(sha256, inhalt);
        const neu = await this.repo.legeDokumentAn({ id: randomUUID(), mappeId: postId, registerKey: reg.key, name, mime: 'application/pdf', groesse: inhalt.length, sha256, anzeigbar: true, erstellt: new Date().toISOString(), erstelltVon: von, herkunft: 'hochgeladen' });
        this.neueDateien([neu]);
      }
    }
  }

  /** Kopie eines verschickten Dokuments in der Post: gestempelt als eigene Datei (#394), sonst dieselbe Datei. */
  private async legeVersandkopieAn(d: Dokument, a: Ausgabe | undefined, postId: string, registerKey: string, von: string, name?: string) {
    const jetzt = new Date().toISOString();
    if (!a || a.unveraendert) { await this.repo.legeDokumentAn({ ...d, id: randomUUID(), mappeId: postId, registerKey, name: name ?? d.name, erstellt: jetzt, erstelltVon: von }); return; }
    const sha256 = createHash('sha256').update(a.inhalt).digest('hex');
    await this.dateien.schreibe(sha256, a.inhalt);
    const neu = await this.repo.legeDokumentAn({ id: randomUUID(), mappeId: postId, registerKey, name: name ?? a.name, mime: a.mime, groesse: a.inhalt.length, sha256, anzeigbar: true, erstellt: jetzt, erstelltVon: von, herkunft: 'hochgeladen' });
    this.neueDateien([neu]);
  }

  /**
   * Eine Mappe per E-Mail (#58). Mit `z` prüft die gemeinsame Prüfstelle (#723) Lesen und Exportrecht, bevor
   * irgendetwas anderes geschieht. Anhänge wie bei mehreren Mappen (`versandTeil`): Archivfassung je Dokument
   * (`fassungen`) oder für alle (`fassung`), Stempel, Verkleinern; mit `angaben: true` auch das PDF „Angaben“.
   */
  async versendeMappe(mappeId: string, eingabe: unknown, ich: { id: string; name: string; email: string }, mailer: Mailer | null, z?: Zugriff) {
    if (z) await this.pruefeAusgang(z.ich, z, 'email', [mappeId]);
    if (!mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand'));
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const { an, betreff, nachricht } = Dienst.emailKopf(e);
    Dienst.pruefeFassungswahl(e);
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : [];
    const alle = await this.repo.listeDokumente(mappeId);
    const dokumente = ids.map((id) => alle.find((d) => d.id === id));
    if (dokumente.some((d) => !d)) throw new Fachfehler(422, t('meldungen.dienst.ein-ausgewaehltes-dokument-gehoert-2'));
    const quelle = e.angaben === true ? await this.angabenQuelle(z, [m]) : null;
    const teil = await this.versandTeil(m, dokumente as Dokument[], { e, an, ich, quelle, stempelDaten: await this.stempelDaten() });
    if (teil.groesse > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, t('meldungen.dienst.die-anhaenge-sind-zusammen-2', { round: Math.round(EMAIL_MAX_ANHAENGE / 1e6) }));
    const { namen, anhaenge } = await this.versandAnhaenge([teil]);
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge });
    } catch (x) {
      throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-wurde', { message: (x as Error).message }));
    }
    const { post: typ } = await this.kern.system();
    const id = randomUUID();
    const datum = heuteIn();
    await this.schreibeSystemMappe(typ, id, {
      betreff, an: an.join(', '), absender: antwortAn.replace(/"/g, ''), datum, bezug: [mappeId], ...(nachricht.trim() ? { nachricht } : {}),
      kanal: POST_KANAL.email, richtung: POST_RICHTUNG.ausgehend, stand: POST_STAND.erledigt,
    }, ich.id);
    await this.legeVersandAb(typ, id, [teil], namen, ich.id);
    const stempeltext = teil.ausgaben.find((x) => x.stempeltext)?.stempeltext;
    const mitStempel = teil.ausgaben.some((x) => x.gestempelt);
    const was = weitergabeWas(teil.ausgaben);
    const n = anhaenge.length;
    await this.notiere(mappeId, ich.id, 'email', { text: t('meldungen.dienst.an', { betreff, an: an.join(', '), wert: n ? t('meldungen.dienst.mit-anhaengen', { anzahl: n }) : '', wert2: was ? `, ${was}` : '' }), email: id,
      an, betreff, nachricht: nachricht.slice(0, NOTIZ_MAX), anhaenge: anhaenge.map((x, i) => ({ name: x.name, groesse: [...(teil.angaben ? [teil.angaben] : []), ...teil.dokumente][i].groesse })),
      ...(mitStempel ? { stempel: stempeltext ?? null, stempelAn: teil.plan?.empfaenger ?? null } : {}) });
    protokoll.modul('ablage').info('E-Mail aus Mappe verschickt', { mappe: mappeId, empfaenger: an.length, anhaenge: n, bytes: teil.groesse });
    return { id, typId: typ.id };
  }

  async legeNotizAn(mappeId: string, text: unknown, von: string | null): Promise<Notiz> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const text2 = Dienst.notiztext(text);
    const n = await this.repo.legeNotizAn({ id: randomUUID(), mappeId, text: text2, erstellt: '', erstelltVon: von, geaendert: '', geaendertVon: von });
    await this.notiere(mappeId, von, 'notiz', { text: t('meldungen.dienst.angelegt', { vorschau: Dienst.vorschau(text2) }), voll: text2 });
    // Typ von oben (#928) – eine Abfrage weniger.
    await this.ereignis('mappe.notiz', { mappe: mappeId, typ: m.typId, notiz: n.id }, von);
    await this.erwaehnungenAbgleichen(mappeId, { key: `notiz:${n.id}`, ort: 'in einer Notiz', auszug: Dienst.vorschau(text2) }, '', text2, von);
    return n;
  }

  /** Bearbeiten und Löschen darf jeder (Abstimmung zu #55); die Historie hält fest, wer es war. */
  async aendereNotiz(id: string, text: unknown, von: string | null): Promise<Notiz> {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diese-notiz-gibt-es'));
    const text2 = Dienst.notiztext(text);
    if (text2 === alt.text) return alt;
    const n = await this.repo.aendereNotiz(id, text2, von);
    await this.uebersetzung.vergiss(alt.mappeId, `notiz:${id}`);
    await this.notiere(alt.mappeId, von, 'notiz', { text: t('meldungen.dienst.geaendert-2', { vorschau: Dienst.vorschau(text2) }), vorher: Dienst.vorschau(alt.text), alt: alt.text, neu: text2 });
    await this.erwaehnungenAbgleichen(alt.mappeId, { key: `notiz:${id}`, ort: 'in einer Notiz', auszug: Dienst.vorschau(text2) }, alt.text, text2, von);
    return n;
  }

  async loescheNotiz(id: string, von: string | null) {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diese-notiz-gibt-es'));
    await this.repo.loescheNotiz(id);
    await this.uebersetzung.vergiss(alt.mappeId, `notiz:${id}`);
    await this.notiere(alt.mappeId, von, 'notiz', { text: t('meldungen.dienst.geloescht', { vorschau: Dienst.vorschau(alt.text) }), voll: alt.text });
  }

  /* ---------- Änderungshistorie (#57) ---------- */

  private notiere(mappeId: string, benutzerId: string | null, art: Historienart, daten?: Historieneintrag['daten']) { return this.mappenHistorie.notiere(mappeId, benutzerId, art, daten); }

  /* ---------- Favorit = Abo (#422) ---------- */

  persoenlicheEinstellungen(benutzerId: string): Promise<Record<string, unknown>> { return this.mappen.persoenlicheEinstellungen(benutzerId); }
  private persoenlichAn(benutzerId: string, schluessel: string): Promise<boolean> { return this.mappen.persoenlichAn(benutzerId, schluessel); }

  /* ---------- Favoriten benachrichtigen: Freigabe in der Werkbank (#506) ---------- */

  async favoritenFreigabe(): Promise<FavoritenFreigabe> {
    return liesFavoritenFreigabe(await this.einstellungen?.lies('favoriten_freigabe'));
  }

  /** Für alle, je Rolle (Systemrollen und fachliche Rollen) oder gar nicht; dazu die Vorgabe für neue Benutzer. */
  async setzeFavoritenFreigabe(eingabe: unknown, von: string) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const f = liesFavoritenFreigabe(eingabe);
    if (f.erlaubt === 'rollen') {
      const bekannt = new Set((await this.listeRollen()).map((r) => r.id));
      f.rollen = f.rollen.filter((r) => bekannt.has(r));
      if (!f.rollen.length) throw new Fachfehler(422, t('werkbank.fehler.freigabe.rollen'));
    }
    await this.einstellungen.schreibe('favoriten_freigabe', freigabeZumSpeichern(f));
    protokoll.modul('werkbank').info('Benachrichtigung für Favoriten eingestellt', { von, erlaubt: f.erlaubt, rollen: f.rollen.length, vorgabe: f.vorgabe });
    return this.favoritenFreigabe();
  }

  /* ---------- Aufgaben ohne Empfänger an einen Alltags-Benutzer (#719) ---------- */

  /**
   * Wer im Alltag die Aufgaben ohne Empfänger bekommt (Aufgaben ohne Empfänger, Post ohne „Für“, Fristen ohne
   * Zuständige) – zusätzlich zu den Administratoren. Nur aktive Menschen ohne Admin-Rechte; passt der gespeicherte
   * Benutzer nicht mehr (deaktiviert, Administrator geworden), gilt niemand, bis die Werkbank einen neuen wählt.
   * `gesetzt`: Die Einstellung wurde schon einmal gespeichert (auch „niemand“) – dann setzt Ablago keine Vorgabe mehr.
   */
  async alltagsEmpfaenger(): Promise<{ benutzerId: string | null; wirksam: string | null; gesetzt: boolean; gespeichert: string | null }> {
    // Einmal je Anfrage (#741): Zahlen, Termine und Eingang fragen es mehrfach; braucht die Liste aller Personen.
    if (this.kern.inEigenerTransaktion()) return this.bildeAlltagsEmpfaenger();
    return { ...await jeAnfrage(`${this.kennung}|alltag`, () => this.bildeAlltagsEmpfaenger()) };
  }

  private async bildeAlltagsEmpfaenger(): Promise<{ benutzerId: string | null; wirksam: string | null; gesetzt: boolean; gespeichert: string | null }> {
    const e = (await this.einstellungen?.lies('aufgaben_empfaenger')) as { benutzer?: unknown } | null;
    const gespeichert = typeof e?.benutzer === 'string' ? e.benutzer : null;
    if (!gespeichert) return { benutzerId: null, wirksam: null, gesetzt: !!e, gespeichert: null };
    const alle = (await this.konten?.benutzer?.()) ?? [];
    const b = alle.find((x) => x.id === gespeichert);
    // Abwesend oder deaktiviert: wie jede Aufgabe beim Vertreter (#78) – sofern er sie bekommen darf.
    const { ziel } = b ? await this.empfaengerAufloesen(b.id) : { ziel: null };
    const z = alle.find((x) => x.id === ziel);
    return { benutzerId: b && taugtAlsAufgabenEmpfaenger(b) ? b.id : null, wirksam: z && taugtAlsAufgabenEmpfaenger(z) ? z.id : null, gesetzt: true, gespeichert };
  }

  /** Werkbank → Benutzer und Sicherheit (#719): Alltags-Benutzer wählen oder `null` (nur im Verwaltungsmodus). */
  async setzeAufgabenEmpfaenger(eingabe: unknown, von: string | null) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const id = (eingabe as { benutzerId?: unknown } | null)?.benutzerId ?? null;
    if (id !== null) {
      const b = typeof id === 'string' ? (await this.konten?.benutzer?.())?.find((x) => x.id === id) : undefined;
      if (!b) throw new Fachfehler(422, t('werkbank.aufgabenempfaenger.fehler.unbekannt'));
      if (!taugtAlsAufgabenEmpfaenger(b)) throw new Fachfehler(422, t('werkbank.aufgabenempfaenger.fehler.inaktiv'));
    }
    await this.einstellungen.schreibe('aufgaben_empfaenger', { benutzer: id });
    await this.stand.erhoehe();
    protokoll.modul('werkbank').info('Empfänger für Aufgaben ohne Empfänger eingestellt', { von: await this.name(von), an: id ? await this.name(id as string) : 'nur im Verwaltungsmodus' });
    return this.alltagsEmpfaenger();
  }

  /** Sieht dieser Benutzer die Aufgaben ohne Empfänger (#719)? Im Verwaltungsmodus immer, sonst nur der gewählte Alltags-Benutzer. */
  async siehtOhneEmpfaenger(ich: { id: string; rolle: string }): Promise<boolean> {
    if (ich.rolle === 'admin') return true;
    return (await this.alltagsEmpfaenger()).wirksam === ich.id;
  }

  /** Erster Mensch (#719): Vorgabe, solange die Werkbank noch nichts gewählt hat. */
  private async vorgabeAufgabenEmpfaenger(b: Benutzer) {
    if (!this.einstellungen || !taugtAlsAufgabenEmpfaenger(b) || (await this.alltagsEmpfaenger()).gesetzt) return;
    const neu = { benutzer: b.id };
    if (this.einstellungen.tausche ? await this.einstellungen.tausche('aufgaben_empfaenger', null, neu) : (await this.einstellungen.schreibe('aufgaben_empfaenger', neu), true)) {
      await this.stand.erhoehe();
      protokoll.modul('werkbank').info('Aufgaben ohne Empfänger gehen an den ersten Benutzer', { an: b.name || b.email });
    }
  }

  /** Darf dieser Benutzer bei Änderungen an Favoriten benachrichtigt werden? Rollen aus seiner Benutzer-Mappe. */
  async favoritenBenachrichtigungErlaubt(benutzerId: string): Promise<boolean> {
    const f = await this.favoritenFreigabe();
    if (f.erlaubt !== 'rollen') return f.erlaubt === 'alle';
    return favoritenErlaubt(f, alsListe((await this.repo.holeMappe(benutzerId))?.werte.rollen));
  }

  /** „Auf alle anwenden“: die Vorgabe für neue Benutzer bei allen bestehenden setzen; Anzahl. */
  async favoritenVorgabeAnwenden(von: string): Promise<number> {
    if (!this.konten?.benutzer || !this.konten.setzeEinstellung) throw new Fachfehler(404, t('meldungen.dienst.benutzerkonten-sind-nicht'));
    const { vorgabe } = await this.favoritenFreigabe();
    let n = 0;
    for (const b of await this.konten.benutzer()) {
      if (b.art === 'dienst') continue;
      await this.konten.setzeEinstellung(b.id, 'favoriten_benachrichtigen', vorgabe ? null : false);
      n++;
    }
    protokoll.modul('werkbank').info('Vorgabe für Favoriten auf alle Benutzer angewandt', { von, vorgabe, benutzer: n });
    return n;
  }

  /**
   * Hat jemand eine Mappe geändert, die andere als Favorit haben, bekommen die – sofern sie es nicht abgeschaltet
   * haben und die Mappe lesen dürfen – **eine** Aufgabe „Geändert“. Solange sie offen ist, zählt sie nur hoch
   * („3 Änderungen von Anna und Paul seit 01.11.“); erst nach dem Öffnen der Mappe oder „Erledigt“ kommt wieder eine.
   * Eigene Änderungen benachrichtigen nie.
   */
  async favoritenMelden(mappeId: string, von: string): Promise<number> {
    const fav = (await this.repo.favoritenDerMappe(mappeId)).filter((f) => f.benachrichtigen && f.benutzerId !== von);
    if (!fav.length) return 0;
    let n = 0;
    const aktiv = this.konten?.benutzer ? new Set((await this.konten.benutzer()).filter((b) => b.aktiv).map((b) => b.id)) : null;
    for (const { benutzerId } of fav) {
      if (aktiv && !aktiv.has(benutzerId)) continue;
      if (!(await this.persoenlichAn(benutzerId, 'favoriten_benachrichtigen'))) continue;
      if (!(await this.kannLesen(benutzerId, mappeId))) continue;
      n++;
      await this.benachrichtigeGebuendelt({
        empfaengerId: benutzerId, mappeId, art: 'aenderung', schluessel: 'aenderung', von,
        text: async (bisher) => {
          const seit = bisher?.erstellt ?? '';
          const h = (await this.repo.historie(mappeId)).filter((x) => x.zeit > seit && x.benutzerId && x.benutzerId !== benutzerId
            && (ABO_ARTEN as readonly string[]).includes(x.art) && x.daten?.aufgabenart !== 'aenderung');
          // Die erste Änderung steht vor der Aufgabe in der Historie; ihr Urheber ist erstelltVon der Aufgabe.
          const n = bisher ? 1 + h.length : 1;
          const namen = [...new Set(bisher ? [bisher.erstelltVon ?? von, ...h.map((x) => x.benutzerId!)] : [von])];
          const liste = await Promise.all(namen.slice(0, 3).map((id) => this.name(id)));
          const wer = namen.length > 3 ? t('meldungen.dienst.und-weiteren', { liste: liste.join(', ') }) : liste.length > 1 ? `${liste.slice(0, -1).join(', ')} und ${liste.at(-1)}` : liste[0];
          const tag = new Date(bisher?.erstellt || Date.now()).toLocaleDateString(gebietsschema(), { day: '2-digit', month: '2-digit', timeZone: zeitzone() });
          return t('meldungen.dienst.aenderungen-von-seit', { anzahl: n, wer, tag });
        },
      });
    }
    return n;
  }

  gesehen(ich: { id: string }, mappeIds: unknown, aufgaben?: Aufgabe[]) { return this.mappen.gesehen(ich, mappeIds, aufgaben); }
  setzeFavoritBenachrichtigen(ich: { id: string }, mappeId: string, an: unknown) { return this.mappen.setzeFavoritBenachrichtigen(ich, mappeId, an); }
  private aenderungen(typ: Mappentyp, alt: Werte, neu: Werte): Promise<Feldaenderung[]> { return this.mappenHistorie.aenderungen(typ, alt, neu); }
  historie(mappeId: string, o: { register?: unknown; max?: unknown; vor?: unknown } = {}): Promise<Historieneintrag[]> { return this.mappenHistorie.historie(mappeId, o); }
  notiereAbruf(x: { dokumentId: string; benutzerId: string | null; weg: Abrufweg; fassung?: Abruffassung; version?: number | null; gestempelt?: boolean; schluessel?: string | null; datei?: string }): Promise<boolean> { return this.mappenHistorie.notiereAbruf(x); }
  historieTage(): Promise<number> { return this.mappenHistorie.historieTage(); }
  setzeHistorieTage(eingabe: unknown): Promise<number> { return this.mappenHistorie.setzeHistorieTage(eingabe); }

  listeTypen() { return this.mappentypen.listeTypen(); }

  typenFuer(z: Zugriff) { return this.mappentypen.typenFuer(z); }

  /**
   * „Wohin gehört das?“ (#937): Mappentypen, die man aus Post anlegen kann – mit dem Haken „Kann aus Post angelegt
   * werden“ (Vorgabe: mit Dokumentenregister), nie Systemtypen, und nur solche, in denen die Person anlegen darf.
   * Grundlage für die Seite „Dokument übernehmen“ (#934) und die Klassifizierung (#939).
   */
  async ausPostZiele(z?: Zugriff): Promise<Mappentyp[]> {
    const typen = z ? [...z.typen.values()] : await this.repo.listeTypen();
    return typen.filter((x) => kannAusPost(x) && (!z || z.admin || (z.paket ? z.paket.schreiben.has(x.id) : rechteUebersicht(x, z.wer, z.a).C !== 'nie')))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  rechteUebersicht(z: Zugriff) { return this.mappentypen.rechteUebersicht(z); }
  legeTypAn(eingabe: unknown): Promise<Mappentyp> { return this.mappentypen.legeTypAn(eingabe); }
  aendereTyp(id: string, eingabe: unknown): Promise<Mappentyp> { return this.mappentypen.aendereTyp(id, eingabe); }
  ausDokumentVon(typId: string): Promise<AusDokument | null> { return this.mappentypen.ausDokumentVon(typId); }
  private typErkennungen() { return this.mappentypen.typErkennungen(); }
  loescheTyp(id: string): Promise<void> { return this.mappentypen.loescheTyp(id); }

  listeMappen(typId?: string) { return this.mappen.listeMappen(typId); }
  mappenKurz() { return this.mappen.mappenKurz(); }
  feldwerte(typId: string, key: string) { return this.mappen.feldwerte(typId, key); }
  verweisende(id: string, typId: string, feldKey: string, z?: Zugriff) { return this.mappen.verweisende(id, typId, feldKey, z); }
  holeMappe(id: string, z?: Zugriff) { return this.mappen.holeMappe(id, z); }

  /* ---------- Sichten: seitenweise und gezählt ---------- */

  /**
   * Eine Seite einer Sicht: „eingang“, eine verwaltete Sicht (#38) oder – für Links auf Mappen,
   * deren Typ keine eigene Sicht hat – eine Typ-Id. Mit den Bezügen für die Anzeige.
   */
  async seite(ich: { id: string; rolle: string }, q: { sicht?: string; link?: unknown; eigene?: unknown; von?: unknown; anzahl?: unknown; suche?: unknown; sortierung?: unknown; absteigend?: unknown; volltext?: unknown; notizen?: unknown; gesamt?: unknown }, z?: Zugriff, grenze = 500) {
    // Berechtigungen (#124): nur lesbare Mappen; der Eingang zeigt Aufgaben auch zu nicht lesbaren – ohne Inhalt.
    const lesen = z?.lesen ?? null;
    const von = Math.max(0, Math.floor(Number(q.von) || 0));
    const anzahl = Math.min(grenze, Math.max(1, Math.floor(Number(q.anzahl) || 100)));
    const suche = text(q.suche).slice(0, 200) || undefined;
    // Auch im Volltext der Dokumente (#45) und in Notizen (#55) suchen.
    const volltext = q.volltext === true || q.volltext === 'true' || undefined;
    const notizen = q.notizen === true || q.notizen === 'true' || undefined;
    // Mappentypen und Auflösung (Rollen, heute) hat der Zugriff schon gelesen (#615); ein Dienstkonto kennt nur seine Typen.
    const typen = z?.typen && !z.paket ? z.typen : new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const aufloesung = () => (z?.a && z.ich?.id === ich.id ? Promise.resolve(z.a) : this.aufloesung(ich.id));
    const sichten = await this.repo.listeSichten();
    // „typ:<id>“: alle Mappen eines Typs, ohne Bedingungen einer Sicht (z. B. Auswahl eines Verweises).
    const nurTyp = String(q.sicht ?? '').startsWith('typ:') ? String(q.sicht).slice(4) : null;
    // „feld:<typId>:<feldKey>“ (#172): Auswahl für ein Referenzfeld – Zieltyp mit dem Auswahlfilter des Felds.
    const auswahl = String(q.sicht ?? '').startsWith('feld:') ? (() => {
      const [, typId, key] = String(q.sicht).split(':');
      const f = typen.get(typId)?.felder.find((x) => x.key === key && x.typ === 'referenz');
      const ziel = f ? typen.get(f.zielTyp ?? '') : undefined;
      if (!f || !ziel) throw new Fachfehler(404, t('meldungen.dienst.dieses-verweisfeld-gibt-es'));
      // Werte der Mappe, die gerade ausgefüllt wird (#173).
      let eigene: Werte = {};
      try { const w = JSON.parse(text(q.eigene).slice(0, 8000) || '{}'); if (w && typeof w === 'object' && !Array.isArray(w)) eigene = w; } catch { /* ohne */ }
      return { f, ziel, eigene };
    })() : null;
    // Verborgene Sichten (#148) gibt es für den Benutzer nicht; ihre Mappen fehlen auch in der Elternsicht.
    const verborgen = this.verborgeneSichten(sichten, z);
    const sicht = nurTyp ? undefined : sichten.find((x) => x.id === q.sicht && !verborgen.has(x.id));
    // Sprechender Link (#98): „link“ mit den Parametern des Links in `link`.
    const gelesen = q.sicht === 'link' ? liesDirektlink(new URLSearchParams(text(q.link).slice(0, 4000)), [...typen.values()]) : null;
    if (gelesen && !gelesen.ok) throw new Fachfehler(422, gelesen.fehler.join(' '));
    const link = gelesen?.ok ? gelesen.link : null;
    // Erweiterte Suche (#199): „suche“ mit den Parametern der Suche in `link`; Rechte wie bei Sichten über `lesen`.
    const erweitert = q.sicht === 'suche' ? abfrageAus(liesSuche(new URLSearchParams(text(q.link).slice(0, 8000))), [...typen.values()]) : null;
    if (erweitert?.fehler.length) throw new Fachfehler(422, erweitert.fehler.join(' '));
    // Sortieren nach Feldern geht, wenn die Sicht genau einen Mappentyp zeigt.
    const fest = q.sicht === 'eingang' || q.sicht === 'favoriten';
    const einTyp = erweitert ? (erweitert.typen.length === 1 ? erweitert.typen[0] : undefined) : link ? link.typ : fest ? undefined : sicht ? (() => { const w = wirksameTypen(sichten, sicht.id, typen.keys()); return w.length === 1 ? typen.get(w[0]) : undefined; })() : typen.get(nurTyp ?? String(q.sicht));
    const sortierung = link && !text(q.sortierung)
      ? (link.sortierung ? sortierungAus(link.sortierung.spalte, link.sortierung.absteigend, einTyp) : undefined)
      : sortierungAus(text(q.sortierung), q.absteigend === 'true' || q.absteigend === true, einTyp);
    // Unscharfe Suche (#356): Varianten (gleichbedeutende Wörter, ohne Bindestrich) für Suche und Volltextfilter.
    const textfilter = erweitert?.volltext ?? undefined;
    const varianten = await this.suchVarianten([suche, textfilter?.text]);
    const anfrage: SeitenAnfrage = q.sicht === 'eingang'
      ? { eingang: { benutzerId: ich.id, admin: await this.siehtOhneEmpfaenger(ich) }, suche, volltext, notizen, von, anzahl, sortierung, lesen: suche ? lesen : null }
      : q.sicht === 'favoriten'
        ? { favoriten: { benutzerId: ich.id }, suche, volltext, notizen, von, anzahl, sortierung, lesen }
      : erweitert
        ? {
            klauseln: [{ typen: (erweitert.typen.length ? erweitert.typen : [...typen.values()]).map((t) => t.id), filter: filterFuer(erweitert, erweitert.typen, await aufloesung()) }],
            textfilter, suche, volltext, notizen, von, anzahl, sortierung, lesen }
      : link
        ? { klauseln: [{ typen: [link.typ.id], filter: filterFuer(link, [link.typ], await aufloesung()) }], suche, volltext, notizen, von, anzahl, sortierung, lesen }
      : auswahl
        ? { klauseln: [auswahlKlausel(setzeEigeneWerte(auswahl.f.auswahlFilter ?? [], auswahl.eigene), auswahl.ziel, await aufloesung())], suche, volltext, notizen, von, anzahl, sortierung, lesen }
      : sicht
        ? { klauseln: klauselnFuer(sichten, sicht.id, typen, await aufloesung(), verborgen), suche, volltext, notizen, von, anzahl, sortierung, lesen }
        : { typId: nurTyp ?? q.sicht, suche, volltext, notizen, von, anzahl, sortierung, lesen };
    // Beim Blättern ohne Suche (#740): die Zahl vom ersten Blatt statt noch einmal zu zählen.
    const bekannt = Number(q.gesamt);
    const gesamt = von > 0 && !suche && !textfilter && Number.isInteger(bekannt) && bekannt >= 0 ? bekannt : undefined;
    let r = gesamt !== undefined ? await this.repo.seite({ ...anfrage, varianten, gesamt }) : await this.seiteMitZahl(anfrage, varianten);
    // Ohne genauen Treffer (#356): mit ähnlichen Wörtern aus dem Wörterverzeichnis noch einmal – genaue Treffer gehen so
    // immer vor; „Meintest du …?“ schlägt die Suche mit dem besten ähnlichen Wort vor.
    let unscharf: { statt: string; vorschlag: string | null; begriffe: Record<string, string[]> } | null = null;
    const gesucht = suche ?? textfilter?.text;
    if (r.gesamt === 0 && gesucht && await this.unscharfAn()) {
      const begriffe = suchbegriffe(gesucht);
      const aehnlich = begriffe ? await this.repo.aehnlicheWoerter(begriffe, 5) : {};
      if (Object.keys(aehnlich).length) {
        const r2 = await this.repo.seite({ ...anfrage, varianten, aehnlich });
        if (r2.gesamt > 0) {
          r = r2;
          // „Meintest du …?“ nur, wenn der Vorschlag selbst etwas findet, das der Benutzer lesen darf – das
          // Wörterverzeichnis kennt auch Wörter aus Mappen, die er nicht sehen darf (ohne Lesefilter: alles lesbar).
          let vorschlag = vorschlagAus(begriffe!, aehnlich);
          if (vorschlag && anfrage.lesen) {
            const probe: SeitenAnfrage = suche ? { ...anfrage, suche: vorschlag } : { ...anfrage, textfilter: { ...textfilter!, text: vorschlag } };
            if (!(await this.repo.gibtTreffer(probe))) vorschlag = null;
          }
          unscharf = { statt: gesucht, vorschlag, begriffe: aehnlich };
        }
      }
    }
    if (q.sicht === 'eingang' && lesen) {
      const ok = await this.repo.lesbare(r.mappen.map((m) => m.id), lesen);
      r.mappen = r.mappen.map((m) => (ok.has(m.id) ? m : { id: m.id, typId: m.typId, werte: {}, titel: NICHT_SICHTBAR, erstellt: m.erstellt, erstelltVon: null, geaendert: m.geaendert, geaendertVon: null, verborgen: true }));
    }
    const ziele = r.mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
    // Eingang (#54): je Mappe, was für mich zu tun ist.
    const aufgaben: Record<string, string> = {};
    if (q.sicht === 'eingang' && r.mappen.length) {
      const offen = await this.repo.offeneAufgaben({ benutzerId: ich.id, admin: await this.siehtOhneEmpfaenger(ich), mappeIds: r.mappen.map((m) => m.id) });
      // #798: automatische Aufgaben an Mappen ohne Leserecht nur mit Hinweis.
      for (const a of await this.ohneLeserechtText(offen, new Set(r.mappen.filter((m) => !m.verborgen).map((m) => m.id)), ich.id)) {
        aufgaben[a.mappeId] = aufgaben[a.mappeId] ? `${aufgaben[a.mappeId]} · ${a.text}` : a.text;
      }
    }
    // Ähnliche Treffer (#442): nur in der Suche über alle Mappen bzw. der erweiterten Suche ohne Feldbedingungen,
    // auf der ersten Seite und mit „auch in Dokumenten“ – Treffer aus Ansichten mit Bedingungen würden diese verletzen.
    const aehnlich = erweitert && !erweitert.bedingungen.length && suche && volltext && von === 0
      ? await this.aehnlicheZurSuche(z, suche, { typen: erweitert.typen.length ? new Set(erweitert.typen.map((t) => t.id)) : null, ohneMappen: new Set(r.mappen.map((m) => m.id)) })
      : [];
    return {
      gesamt: r.gesamt, von, mappen: r.mappen, bezuege: await this.maskiereBezuege(z, await this.repo.bezuege(ziele)),
      ...(r.ausschnitte ? { ausschnitte: r.ausschnitte } : {}), ...(q.sicht === 'eingang' ? { aufgaben } : {}),
      ...(aehnlich.length ? { aehnlich } : {}),
      ...(unscharf ? { unscharf } : {}),
      /** Welche Mappen dieser Seite Favoriten des Benutzers sind (#62). */
      favoriten: [...await this.repo.favoritenVon(ich.id, r.mappen.map((m) => m.id))],
      /** Favorit = Abo (#422): Favoriten und eigene Mappen, die andere seit dem letzten Sehen geändert haben. */
      geaendert: await this.persoenlichAn(ich.id, 'geaenderte_hervorheben')
        ? [...await this.repo.geaendertVonAnderen(ich.id, r.mappen.filter((m) => !m.verborgen).map((m) => m.id), ABO_ARTEN)] : [],
      /** In der Favoritenliste und Ansichten mit „ist mein Favorit“ (#725): Favoriten ohne Benachrichtigung (#422). */
      ...(q.sicht === 'favoriten' || sicht?.bedingungen.some((x) => x.art === 'favorit') ? { stumm: [...await this.repo.stummeFavoriten(ich.id, r.mappen.map((m) => m.id))] } : {}),
    };
  }

  /**
   * Eine Seite mit der Zahl der Treffer aus dem Zwischenspeicher (#918): Die Zahl gilt je Anfrage ohne Blatt und
   * Reihenfolge – Ansicht bzw. Bedingungen, Lesefilter, Suche samt Varianten, Eingang oder Favoriten der Person – und nur
   * bei gleichem Mappenstand (mit Favoriten: Haushaltsstand), ohne Mindestgültigkeit: Sie bleibt genau. Einmal gezählt,
   * holt jede weitere Anfrage nur die Seite. Nicht zwischengespeichert wird die Suche in Dokumenten und Notizen: Deren
   * Texte (Texterkennung, Notizen) ändern keinen Stand.
   */
  private async seiteMitZahl(anfrage: SeitenAnfrage, varianten: Varianten) {
    const inhalte = (!!anfrage.suche && (!!anfrage.volltext || !!anfrage.notizen)) || !!anfrage.textfilter?.text.trim();
    if (inhalte) return this.repo.seite({ ...anfrage, varianten });
    const { von: _von, anzahl: _anzahl, sortierung: _sortierung, gesamt: _gesamt, zahl: _zahl, ...was } = anfrage;
    const speicher = mitFavoriten(was) ? this.trefferFavSpeicher : this.trefferSpeicher;
    let r: Awaited<ReturnType<Repo['seite']>> | undefined;
    const z = await speicher.hole(fingerabdruck({ v: 1, ...was, varianten }), async () => {
      r = await this.repo.seite({ ...anfrage, varianten });
      return { wert: r.gesamt, zeitabhaengig: zeitabhaengig(anfrage.klauseln) };
    });
    return r ?? this.repo.seite({ ...anfrage, varianten, zahl: z.wert });
  }

  /**
   * Anzahl Mappen je Typ (davon unpassend, Demo), je Sicht und im Eingang des Benutzers.
   * Zwischengespeichert je Benutzer und Rechte (#512), solange sich am Haushalt nichts ändert
   * (`Haushaltsstand`); zeitabhängige Ansichten laufen nach Minuten bzw. um Mitternacht ab. Ob der
   * Zwischenspeicher traf, steht im Header Server-Timing (`zs`).
   */
  async zaehler(ich: { id: string; rolle: string }, zg?: Zugriff) {
    const lesen = zg?.lesen ?? null;
    const alleSichten = await this.repo.listeSichten();
    // Verborgene Sichten (#148): kein Zähler, und ihre Mappen zählen auch in der Elternsicht nicht.
    const verborgen = this.verborgeneSichten(alleSichten, zg);
    const a = zg?.a && zg.ich.id === ich.id ? zg.a : await this.aufloesung(ich.id);
    const ohneEmpfaenger = await this.siehtOhneEmpfaenger(ich);
    const sichten = alleSichten.filter((x) => !verborgen.has(x.id));
    const typen = zg?.typen && !zg.paket ? zg.typen : new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const klauseln = sichten.map((x) => klauselnFuer(alleSichten, x.id, typen, a, verborgen));
    const zeitabh = alleSichten.some((x) => zeitabhaengig(x.bedingungen));
    // Ansichten, deren Bedingungen die Person selbst meinen (z. B. „ist mein Favorit“), zählen bei ihren eigenen Zahlen;
    // alle anderen gemeinsam für alle mit denselben Eingaben.
    const eigen = sichten.map((_, i) => JSON.stringify(klauseln[i]).includes(ich.id));
    const gemeinsam = sichten.map((x, i) => ({ id: x.id, k: klauseln[i], i })).filter((x) => !eigen[x.i]);
    const persoenlich = sichten.map((x, i) => ({ id: x.id, k: klauseln[i], i })).filter((x) => eigen[x.i]);
    // Rechte-Fingerabdruck (#742): genau die Eingaben der Zählung. Der Lesefilter enthält die Rechte samt Rollen und
    // Leserecht auf Zeit (wo eine Regel die Person selbst meint, steht ihre Id darin); die Klauseln enthalten Rollen
    // und „heute“, wo eine Ansicht sie nutzt. Der Verwaltungsmodus (alles lesen) steht zusätzlich darin. Gleiche
    // Eingaben, gleiche Abfrage, gleiche Zahl – wer etwas anderes lesen darf, hat einen anderen Schlüssel.
    const admin = !!zg?.admin || (!zg && ich.rolle === 'admin');
    const bestandSchluessel = fingerabdruck({ v: 2, admin, lesen, sichten: gemeinsam.map((x) => [x.id, x.k]) });
    const ichSchluessel = `${ich.id}|${ohneEmpfaenger ? 'o' : ''}|${fingerabdruck({ v: 2, admin, lesen, sichten: persoenlich.map((x) => [x.id, x.k]) })}`;
    const beginn = performance.now();
    const g = this.gueltigkeit();
    // #918: Der Mappenstand genügt, solange der Lesefilter keine Favoriten meint (die Ansichten mit „ist mein Favorit“
    // zählen bei den Zahlen der Person).
    const bestand = mitFavoriten(lesen) ? this.bestandFav : this.bestand;
    const [b, p] = await Promise.all([
      bestand.hole(bestandSchluessel, async () => ({ wert: await this.repo.zaehleBestand(gemeinsam.map((x) => x.k), lesen), zeitabhaengig: zeitabh }), g),
      this.persoenlich.hole(ichSchluessel, async () => ({ wert: await this.repo.zaehlePersoenlich(ich.id, ohneEmpfaenger, lesen, persoenlich.map((x) => x.k)), zeitabhaengig: zeitabh }), g),
    ]);
    // Server-Timing `zs`: die teure Zählung über alle Mappen; die Zahlen der Person sind kleine Zählungen.
    const k = kontext.getStore();
    if (k) k.zwischenspeicher = { art: b.art, ms: performance.now() - beginn };
    const n = new Map<string, number>([...gemeinsam.map((x, i) => [x.id, b.wert.sichten[i]] as const), ...persoenlich.map((x, i) => [x.id, p.wert.sichten[i]] as const)]);
    return {
      typen: Object.fromEntries(b.wert.typen), eingang: p.wert.eingang, favoriten: p.wert.favoriten,
      sichten: Object.fromEntries(sichten.map((x) => [x.id, n.get(x.id) ?? 0])),
      // Papierkorb (#43): eigene gelöschte Mappen.
      papierkorb: p.wert.papierkorb,
      ...await this.zaehlerRahmen(),
    };
  }

  /**
   * Was die Ablage ohne Zählen sofort braucht (#512): Tage im Papierkorb (0 = aus) und die Sicht
   * „Neue Post“. Die Oberfläche lädt das vorab, die Zahlen danach.
   */
  async zaehlerRahmen() {
    // Post (#192): Zahl der Sicht „Neue Post“ hervorheben wie im Eingang.
    return { papierkorbTage: await this.papierkorbTage(), neuePost: await this.neuePostSicht(), favoritenSicht: await this.favoritenSicht() };
  }

  /**
   * Zähler-Endpunkt (#625, GET /api/v1/ich/zaehler): nur Zahlen, in den Rechten des Benutzers, ohne Titel,
   * Namen oder Inhalte – für Hausautomatisierung, Anzeigen und Clients.
   *
   * - neuePost: Post im Stand „Neu“, deren „Für“ der Benutzer ist oder leer ist, und die er lesen darf.
   * - zuErledigen: wie „Zu erledigen“ in der Ablage (Mappen mit offenen Aufgaben für ihn).
   * - ueberfaellig: eigene offene Fristen, Erinnerungen und Aufgaben mit Datum vor heute.
   *
   * „anstehend“ gibt es seit #725 nicht mehr: Automatisierungen legen Aufgaben zum richtigen Zeitpunkt an.
   *
   * Alle Zahlen kommen aus den Zwischenspeichern von #512 und #528. Der Stand liegt in der Datenbank
   * (`zaehlerstaende`): Er zählt hoch, sobald die Zahlen beim Abruf anders sind als beim letzten – das übersteht
   * Neustarts und gilt für alle Server gleich. Das ETag ist Stand und Hash der Zahlen; gleiche Zahlen, gleiches ETag.
   */
  async zaehlerAbruf(z: Zugriff): Promise<{ zahlen: Zaehlerzahlen; stand: number; geaendert: string; etag: string }> {
    const ansichten = await this.zaehler(z.ich, z);
    const heute = heuteIn();
    const t = await this.termine(z, { von: heute, bis: heute });
    const ueberfaellig = t.eintraege.filter((e) => e.faellig && e.datum < heute).length;
    const zahlen: Zaehlerzahlen = { neuePost: await this.neuePostFuer(z), zuErledigen: ansichten.eingang, ueberfaellig };
    // Meist unverändert: dann nur lesen, nichts schreiben.
    const abdruck = fingerabdruck({ v: 1, ich: z.ich.id, zahlen });
    const da = await this.repo.zaehlerstand(z.ich.id);
    const s = da?.abdruck === abdruck ? da : await this.repo.setzeZaehlerstand(z.ich.id, abdruck);
    return { zahlen, stand: s.stand, geaendert: s.geaendert, etag: `"z${s.stand}-${s.abdruck}"` };
  }

  /**
   * Stand der Ablage für die Oberfläche (#919, `GET /api/ablage/stand`): ein kurzer Fingerabdruck, kein Inhalt. Die
   * Startseite und die Zähler der Seitenleiste fragen ihn alle 10–15 s ab und laden nur neu, wenn er sich geändert hat.
   *
   * Billig: Haushaltsstand (Zahlen, auch Favoriten und Erinnerungen) und Mappenstand (#918) kommen in einer Anfrage aus
   * der Abfrage der Sitzung (`standSpalten`), keine weitere Datenbankabfrage. Dazu, was für die Person zählt: das
   * Datum (zeitabhängige Ansichten und Termine wechseln um Mitternacht) und die wirksame Rolle (Verwaltungsmodus sieht
   * mehr). Nicht die Zähler dieses Prozesses – bei mehreren Prozessen wechselte der Wert sonst je nach Prozess.
   * „Nachhinken ja, falsch nie“: Er ändert sich höchstens zu oft, nie zu selten für Änderungen über das Repo.
   */
  async ablageStand(ich: { rolle: string }): Promise<string> {
    const [zahlen, mappen] = await Promise.all([this.stand.aktuell(), this.mappenstand.aktuell()]);
    return fingerabdruck({ v: 1, zahlen, mappen, heute: heuteIn(), rolle: ich.rolle });
  }

  /** Webhooks (#627): nach jeder Änderung, die Zahlen der Ansichten oder die Termine ändern kann. */
  beiAenderung(f: () => void) { this.stand.beiAenderung(f); }

  /** Neue Post für den Benutzer (#625): Stand „Neu“ und „Für“ ist er selbst oder leer; nur lesbare Post. */
  private async neuePostFuer(z: Zugriff): Promise<number> {
    const post = [...z.typen.values()].find((t) => t.system === 'post');
    if (!post) return 0;
    const schluessel = `${z.ich.id}|${z.ich.rolle}|${fingerabdruck({ lesen: z.lesen, rollen: z.a.meineRollen, post: post.id })}`;
    const r = await this.neuePostSpeicher.hole(schluessel, async () => {
      const neu = { art: 'feld' as const, feld: 'stand', op: 'einerVon' as const, wert: { art: 'fest' as const, wert: [POST_STAND.neu] } };
      const klausel = (fuer: Bedingung) => ({ typen: [post.id], filter: filterFuer({ bedingungen: [neu, fuer] }, [post], z.a) });
      const [n] = await this.repo.zaehleKlauseln([[
        klausel({ art: 'feld', feld: 'fuer', op: 'zeigtAuf', wert: { art: 'ich' } }),
        klausel({ art: 'feld', feld: 'fuer', op: 'leer' }),
      ]], z.lesen);
      return { wert: n, zeitabhaengig: false };
    }, this.gueltigkeit());
    return r.wert;
  }

  /* ---------- Favoriten (#62) ---------- */

  setzeFavorit(ich: { id: string }, mappeId: string, an: boolean) { return this.mappen.setzeFavorit(ich, mappeId, an); }
  istFavorit(ich: { id: string }, mappeId: string) { return this.mappen.istFavorit(ich, mappeId); }

  /* ---------- Berechtigungen (#123–#127) ---------- */

  /* ---------- Rechte prüfen (#1072: in zugriff/zugriff.dienst.ts) ---------- */

  /** Unterscheidet zwei Dienste in derselben Anfrage (Tests mit zwei „Prozessen“). */
  private readonly kennung = randomUUID();
  zugriff(ich: Zugreifender): Promise<Zugriff> { return this.rechtepruefung.zugriff(ich); }
  private bildeZugriff(ich: Zugreifender, o: { ohneAufZeit?: boolean } = {}): Promise<Zugriff> { return this.rechtepruefung.bildeZugriff(ich, o); }
  private typverweise(...a: Parameters<ZugriffDienst['typverweise']>) { return this.rechtepruefung.typverweise(...a); }
  rechteAn(z: Zugriff, m: Mappe, neu = false, aufgaben?: Aufgabe[]): Promise<Rechte> { return this.rechtepruefung.rechteAn(z, m, neu, aufgaben); }
  rechteAnVielen(z: Zugriff, ms: Mappe[]): Promise<Map<string, Rechte>> { return this.rechtepruefung.rechteAnVielen(z, ms); }
  private mappenquelle(benutzerId: string, mappeIds: string[]): Promise<Mappenquelle> { return this.rechtepruefung.mappenquelle(benutzerId, mappeIds); }
  pruefeRecht(z: Zugriff | undefined, id: string, recht: Recht): Promise<Mappe> { return this.rechtepruefung.pruefeRecht(z, id, recht); }
  lesbare(z: Zugriff | undefined, ids: string[]): Promise<Set<string>> { return this.rechtepruefung.lesbare(z, ids); }
  private maskiereBezuege(z: Zugriff | undefined, b: Map<string, MappenBezug>): Promise<Record<string, MappenBezug>> { return this.rechtepruefung.maskiereBezuege(z, b); }
  sichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> { return this.rechtepruefung.sichtbarFuer(benutzerId, ids); }
  wasSieht(benutzerId: unknown) { return this.rechtepruefung.wasSieht(benutzerId); }
  mappeVon(art: 'dokument' | 'notiz' | 'aufgabe', id: string): Promise<string> { return this.rechtepruefung.mappeVon(art, id); }
  mitPasswortRecht<T extends Mappe>(z: Zugriff, mappen: T[]): Promise<{ mit: T[]; ohne: T[] }> { return this.rechtepruefung.mitPasswortRecht(z, mappen); }
  kannLesen(benutzerId: string, mappeId: string): Promise<boolean> { return this.rechtepruefung.kannLesen(benutzerId, mappeId); }
  private aufloesung(benutzerId: string): Promise<Aufloesung> { return this.rechtepruefung.aufloesung(benutzerId); }

  /* ---------- Pakete am Mappentyp (#686) ---------- */

  private paketSiehtNicht(p: InstalliertesPaket, typId: string, mappeId: string | null): Promise<string | null> { return this.typpakete.paketSiehtNicht(p, typId, mappeId); }

  /**
   * Ein Ereignis ging wegen der KI-Sperre nicht an das Paket (#796): Wartet das Dokument auf die Texterkennung dieses
   * Pakets (`volltext.fertig`), wartet es nicht weiter. Aufträge (`datei.*`) behandelt der Aufrufer von `auftrag`.
   */
  private async kiUebersprungen(paket: string, art: string, daten: Record<string, unknown>) {
    const grund = t('meldungen.dienst.ki-nicht-zugelassen');
    try {
      if (art === 'volltext.fertig') await this.nachTexterkennungsEreignis(paket, { art, daten }, { ok: true, text: grund });
    } catch (x) {
      protokoll.modul('werkbank').warn('Stand nach KI-Sperre nicht nachgetragen', { paket, art, fehler: (x as Error).message });
    }
  }

  /** Je Mappentyp-Id die Pakete, denen der Admin diesen Typ verwehrt hat (Kern). */
  paketVerwehrt(): Promise<Record<string, string[]>> { return this.kern.paketVerwehrt(); }

  /* ---------- KI-Dienste und Mappentypen (#796) ---------- */

  /**
   * Mappentypen, die für KI-Dienste zugelassen sind (Einstellung `ki_typen`, Teil der Sicherung). Was nicht darin steht –
   * auch jeder neue Mappentyp –, geht an kein KI-Paket. Fehlt die Einstellung (frische Installation), ist nichts
   * zugelassen. `hinweis`: nach dem Update einmal in der Werkbank sagen, dass man jetzt ausschließen kann.
   */
  async kiTypen(): Promise<{ zugelassen: Set<string>; hinweis: boolean }> {
    const v = await this.einstellungen?.lies('ki_typen') as { zugelassen?: unknown; hinweis?: unknown } | null | undefined;
    const liste = v && typeof v === 'object' && Array.isArray(v.zugelassen) ? v.zugelassen.map(String) : [];
    return { zugelassen: new Set(liste), hinweis: !!v && v.hinweis === true };
  }

  private async schreibeKiTypen(k: { zugelassen: Set<string>; hinweis: boolean }) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe('ki_typen', { zugelassen: [...k.zugelassen].sort(), ...(k.hinweis ? { hinweis: true } : {}) });
  }

  /**
   * Für ein Paket: Ist dieser Mappentyp für es gesperrt, weil es ein KI-Paket ist und der Typ nicht zugelassen ist?
   * Für Pakete ohne Netz (oder ohne Zugriff auf Inhalte) immer nein. Je Aufruf neu gelesen – Änderungen wirken sofort.
   */
  async kiSperre(p: Pick<InstalliertesPaket, 'laeufer'> | null | undefined): Promise<(typId: string) => boolean> {
    if (!p || !istKiPaket(p.laeufer)) return () => false;
    const { zugelassen } = await this.kiTypen();
    return (typId) => !zugelassen.has(typId);
  }

  /** Wie `kiSperre`, für ein Paket nach Id (Erkennen, Antworten, Übersetzen). Unbekanntes Paket: nichts gesperrt. */
  async kiSperreFuer(paketId: string): Promise<(typId: string) => boolean> {
    return this.kiSperre((await this.repo.listePakete()).find((x) => x.id === paketId));
  }

  /**
   * Für die Werkbank: alle Mappentypen (außer Benutzer) mit „zugelassen“, die KI-Pakete und welche Mappentypen jedes
   * bekommt – bei Paketen mit Leserecht die lesbaren (bestätigte Rechte, nicht verwehrt) und zugelassenen, bei
   * Paketen, die Ausschnitte vom Kern bekommen (Antworten, Erkennen, Übersetzen), alle zugelassenen.
   */
  async kiUebersicht(): Promise<KiUebersicht> {
    const [typen, pakete, verwehrt, k] = [await this.repo.listeTypen(), await this.repo.listePakete(), await this.paketVerwehrt(), await this.kiTypen()];
    const liste = typen.filter((x) => x.system !== 'benutzer').sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const ki: KiUebersicht['pakete'] = [];
    for (const p of pakete) {
      const l = p.laeufer;
      if (!l || !istKiPaket(l)) continue;
      const lesbar = await this.typverweise(p.id, pakete, typen);
      // Ausschnitte bzw. Text vom Kern (auch „Wohin gehört das?“, #939) oder Ereignisse zu Dokumenten und Post (#796): kommen aus allen zugelassenen Typen, auch ohne Leserecht.
      const ueberKern = (l.rechte.schnittstellen ?? []).some((s) => s === 'dms:antworten' || s === 'dms:erkennen' || s === 'dms:klassifizieren' || s === 'dms:uebersetzen')
        || l.ereignisse.some((e) => INHALT_EREIGNISSE.includes(e) && !MAPPEN_EREIGNISSE.includes(e));
      const darf = lesbar(l.rechte.lesen);
      const bekommt = liste.filter((x) => k.zugelassen.has(x.id) && (ueberKern || (darf.has(x.id) && !verwehrt[x.id]?.includes(p.id)))).map((x) => x.id);
      ki.push({ id: p.id, name: p.name, bekommt });
    }
    return {
      typen: liste.map((x) => ({ id: x.id, name: x.name, zugelassen: k.zugelassen.has(x.id), ...(x.system ? { system: x.system } : {}) })),
      pakete: ki.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      hinweis: k.hinweis && ki.length > 0,
    };
  }

  /** Einen Mappentyp für KI-Dienste zulassen bzw. sperren; wirkt sofort (Lesen, Ereignisse, Antworten, Erkennen, Übersetzen). */
  async setzeKiTyp(typId: string, zugelassen: boolean, von: string | null): Promise<KiUebersicht> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    if (typ.system === 'benutzer') throw new Fachfehler(422, t('meldungen.dienst.ki-benutzer'));
    const k = await this.kiTypen();
    if (zugelassen) k.zugelassen.add(typId); else k.zugelassen.delete(typId);
    await this.schreibeKiTypen(k);
    protokoll.modul('werkbank').info(zugelassen ? 'Mappentyp für KI-Dienste zugelassen' : 'Mappentyp für KI-Dienste gesperrt', { typ: typ.name, von });
    return this.kiUebersicht();
  }

  /** Den Hinweis nach dem Update („Mappentypen lassen sich jetzt ausschließen“) nicht mehr zeigen. */
  async kiHinweisGelesen(): Promise<KiUebersicht> {
    const k = await this.kiTypen();
    if (k.hinweis) await this.schreibeKiTypen({ ...k, hinweis: false });
    return this.kiUebersicht();
  }

  paketeAmTyp(typId: string) { return this.typpakete.paketeAmTyp(typId); }
  setzePaketVerwehrt(typId: string, paketId: string, verwehrt: boolean, von: string | null): Promise<void> { return this.typpakete.setzePaketVerwehrt(typId, paketId, verwehrt, von); }

  /* ---------- Berechtigungen in der Werkbank (#123, #125) ---------- */

  /** Aktive Benutzer, für die Regeln gelten – alle; nur der Verwaltungsmodus hebt sie auf (#818). */
  private async regelBenutzer(): Promise<Benutzer[]> {
    return this.konten?.benutzer ? (await this.konten.benutzer()).filter((b) => b.aktiv) : [];
  }

  /** Übersicht: je Mappentyp Grundeinstellung und Anzahl Regeln. */
  async berechtigungenListe() {
    const typen = await this.repo.listeTypen();
    return typen.map((t) => ({ typId: t.id, name: t.name, system: t.system ?? null, berechtigungen: regelwerkVon(t) }));
  }

  /** Wie viele Mappen dieses Typs könnte mit diesem Regelwerk kein normaler Benutzer lesen? */
  async niemandLesbar(typ: Mappentyp, rw: Regelwerk): Promise<number> {
    const benutzer = await this.regelBenutzer();
    if (!benutzer.length) return 0;
    const t = { ...typ, berechtigungen: rw };
    const teile: Ausdruck[] = [];
    for (const b of benutzer) {
      const a = await this.aufloesung(b.id);
      teile.push(leseAusdruck(t, { id: b.id, rollen: a.meineRollen }, a));
    }
    const x = nicht(oder(...teile));
    return x.k === 'falsch' ? 0 : this.repo.zaehleAusdruck(typ.id, x);
  }

  /** Regelwerk speichern; mit Warnung, wenn danach Mappen niemand mehr lesen kann (#125). */
  async setzeBerechtigungen(typId: string, eingabe: unknown, bestaetigt: boolean): Promise<{ typ: Mappentyp; niemand: number }> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    const { rw, niemand } = await this.pruefeBerechtigungen(typ, eingabe, bestaetigt);
    const neu = await this.repo.setzeBerechtigungen(typId, istOffen(rw) ? null : rw);
    Dienst.protokolliereBerechtigungen(neu, niemand);
    return { typ: neu, niemand };
  }

  /** Regeln prüfen (Probleme → 422) und warnen, wenn Mappen danach niemand mehr lesen könnte (409 ohne Bestätigung). */
  private async pruefeBerechtigungen(typ: Mappentyp, eingabe: unknown, bestaetigt: boolean): Promise<{ rw: Regelwerk; niemand: number }> {
    const rw = bereinigeRegelwerk(eingabe);
    const probleme = rw.regeln.map((r) => regelProblem(r, typ)).filter((x): x is string => !!x);
    if (probleme.length) throw new Fachfehler(422, t('meldungen.dienst.berechtigungen', { probleme: probleme.join(' ') }), { gruende: probleme, berechtigungen: true });
    const niemand = await this.niemandLesbar(typ, rw);
    if (niemand && !bestaetigt) {
      throw new Fachfehler(409, t('meldungen.dienst.mappen-vom-typ-koennte', { anzahl: niemand, name: typ.name }), { niemand });
    }
    return { rw, niemand };
  }

  private static protokolliereBerechtigungen(typ: Mappentyp, niemand: number) {
    const rw = typ.berechtigungen;
    protokoll.modul('werkbank').warn('Berechtigungen geändert', {
      typ: typ.name, grund: rw?.grund ?? 'erteilt', regeln: rw?.regeln.length ?? 0,
      liste: rw?.regeln.map((x, i) => `${i + 1}. ${x.name} ${kurz(x.dann)}${x.stopp ? ' ■' : ''}`).join(' · ') || undefined,
      ...(niemand ? { niemandLesbar: niemand } : {}),
    });
  }

  /**
   * Berechtigungen mit dem Mappentyp speichern (#142): `berechtigungen` in der Eingabe (fehlt = unverändert),
   * `bestaetigt` für die Rückfrage „niemand kann lesen“. Geprüft wird gegen die neuen Felder – vor dem Speichern.
   */
  private async berechtigungenAusEingabe(typ: Mappentyp, eingabe: unknown): Promise<{ rw: Regelwerk; niemand: number } | null> {
    const e = (eingabe ?? {}) as { berechtigungen?: unknown; bestaetigt?: unknown };
    if (e.berechtigungen === undefined) return null;
    const r = await this.pruefeBerechtigungen(typ, e.berechtigungen, e.bestaetigt === true);
    return JSON.stringify(istOffen(r.rw) ? null : r.rw) === JSON.stringify(typ.berechtigungen ?? null) ? null : r;
  }

  /** Eine Regel in andere Mappentypen kopieren (ans Ende); Feldbedingungen nur, wo das Feld passt. */
  async kopiereRegel(typId: string, regelId: string, ziele: unknown): Promise<{ kopiert: number; ausgelassen: number }> {
    const typ = await this.repo.holeTyp(typId);
    const regel = typ ? regelwerkVon(typ).regeln.find((r) => r.id === regelId) : undefined;
    if (!typ || !regel) throw new Fachfehler(404, t('meldungen.dienst.diese-regel-gibt-es'));
    let kopiert = 0; let ausgelassen = 0;
    for (const id of (Array.isArray(ziele) ? ziele : []).map(String)) {
      const ziel = id === typId ? undefined : await this.repo.holeTyp(id);
      if (!ziel) continue;
      const k = kopiereRegel(regel, ziel);
      if (!k.regel.wenn.length) { ausgelassen += k.ausgelassen; continue; }
      const rw = regelwerkVon(ziel);
      await this.repo.setzeBerechtigungen(ziel.id, { grund: rw.grund, regeln: [...rw.regeln, k.regel] });
      kopiert++; ausgelassen += k.ausgelassen;
    }
    return { kopiert, ausgelassen };
  }

  /** Testlauf (#125): Mappe und Benutzer → CRUDP mit der Spur durch die Regeln (auch für einen ungespeicherten Entwurf). */
  async testlauf(e: { mappeId?: unknown; benutzerId?: unknown; berechtigungen?: unknown }) {
    const m = istUuid(e.mappeId) ? await this.repo.holeMappe(e.mappeId) : undefined;
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const person = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === e.benutzerId) : undefined;
    // Systemkonten und Paket-Benutzer (#710): auswählbar nur hier, damit man ihre Rechte nachprüfen kann.
    const b = person ?? (this.konten?.ohneMensch ? (await this.konten.ohneMensch()).find((x) => x.id === e.benutzerId && x.art) : undefined);
    if (!b) throw new Fachfehler(404, t('meldungen.dienst.diesen-benutzer-gibt-es'));
    const gespeichert = await this.repo.holeTyp(m.typId);
    if (!gespeichert) throw new Fachfehler(500, t('meldungen.dienst.der-mappentyp-dieser-mappe'));
    const typ = e.berechtigungen === undefined ? gespeichert : { ...gespeichert, berechtigungen: bereinigeRegelwerk(e.berechtigungen) };
    const mappe = { id: m.id, titel: m.titel ?? '', typId: m.typId };
    if (b.art) {
      // Wie im Zugriff solcher Konten: Rolle „Systemkonto“ bzw. „Paket“, nur Regeln, die diese Rolle nennen (#673).
      const konto = b.art === 'system' ? 'systemkonto' as const : 'paket' as const;
      const rolleId = (await this.kern.system()).kontorollen.get(konto)!;
      const a = await this.aufloesung(b.id);
      const name = b.art === 'dienst' ? `Paket: ${(await this.repo.listePakete()).find((p) => p.id === b.paketId)?.name ?? b.name}` : b.name;
      const z = await this.zugriff(b);
      const bestaetigt = !!z.typen.get(m.typId);
      const erg = rechteAnMappe(kontoRegelwerk(typ, rolleId), m, { id: b.id, rollen: [rolleId] }, a, await this.mappenquelle(b.id, [m.id]));
      // Wie rechteAn: Systemkonten sehen nie Passwörter; Pakete nie über die bei der Installation bestätigten Rechte hinaus.
      const w = erg.wirksam;
      const s = !!z.paket?.schreiben.has(m.typId);
      erg.wirksam = !bestaetigt ? { ...NICHTS } : z.paket ? { C: w.C && s, R: w.R, U: w.U && s, D: false, P: false } : { ...w, P: false };
      return { ...erg, admin: false, konto, ...(bestaetigt ? {} : { unbestaetigt: true }), mappe, benutzer: { id: b.id, name } };
    }
    const a = await this.aufloesung(b.id);
    const erg = rechteAnMappe(typ, m, { id: b.id, rollen: a.meineRollen }, a, await this.mappenquelle(b.id, [m.id]));
    // Leserecht auf Zeit (#798) mit seinem Grund: wirkt nur, wo die Regeln kein Lesen erlauben – und nur Lesen.
    const z = b.rolle === 'admin' ? undefined : (await this.repo.leserechteAufZeit(b.id)).find((x) => x.mappeId === m.id);
    const regulaer = erg.wirksam.R;
    if (z && !regulaer) erg.wirksam = { ...erg.wirksam, R: true };
    return {
      ...erg, admin: b.rolle === 'admin', mappe, benutzer: { id: b.id, name: b.name || b.email },
      ...(z ? { aufZeit: { aufgabe: z.aufgabentext, seit: z.seit, von: z.von ? await this.name(z.von) : null, wirkt: !regulaer } } : {}),
    };
  }

  /**
   * WebDAV-Laufwerk (#346): eine Mappe mit Lesen-Recht – Typ, Dokumente und die verknüpften Mappen
   * (Verweise in beide Richtungen, nur lesbare). Ohne Notizen, Aufgaben und Historie.
   */
  async laufwerkMappe(id: string, z: Zugriff) {
    const mappe = await this.pruefeRecht(z, id, 'R');
    const typ = z.typen.get(mappe.typId) ?? await this.repo.holeTyp(mappe.typId);
    const ziele = typ ? verweiseVon(typ, mappe.werte).map((v) => v.zielId) : [];
    const rueck = await this.repo.rueckverweise(id);
    const bezuege = await this.repo.bezuege([...new Set([...ziele, ...rueck.map((r) => r.quelleId)])].filter((x) => x !== id));
    const lesbar = await this.lesbare(z, [...bezuege.keys()]);
    const verknuepft = [...bezuege].filter(([k]) => lesbar.has(k)).map(([mid, x]) => ({ id: mid, titel: x.titel, typId: x.typId }));
    return { mappe, typ, dokumente: await this.repo.listeDokumente(id), verknuepft };
  }

  /* ---------- Sichten verwalten (#38) ---------- */

  /**
   * Sichten für die Ablage (#148): Administratoren alle mit Regeln; Benutzer nur die sichtbaren,
   * mit ihren Rechten daran und ohne die Regeln selbst.
   */
  async listeSichten(z?: Zugriff): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    if (!z || z.admin) return alle;
    const rechte = alleSichtRechte(alle, z.wer, false);
    return alle.filter((s) => rechte.get(s.id)?.R).map(({ berechtigungen: _b, ...s }) => ({ ...s, rechte: rechte.get(s.id)! }));
  }

  /** Ids der Sichten, die ein Benutzer nicht sehen darf (#148); Administratoren und ohne Zugriff: keine. */
  verborgeneSichten(alle: Sicht[], z?: Zugriff): Set<string> {
    if (!z || z.admin) return new Set();
    const rechte = alleSichtRechte(alle, z.wer, false);
    return new Set(alle.filter((s) => !rechte.get(s.id)?.R).map((s) => s.id));
  }

  /** Testlauf an einer Sicht (#148), auch mit ungespeicherten Regeln und Elternsicht. */
  async sichtTestlauf(e: unknown): Promise<unknown> {
    const x = (e ?? {}) as { sichtId?: unknown; benutzerId?: unknown; berechtigungen?: unknown; elternId?: unknown };
    const alle = await this.repo.listeSichten();
    const id = istUuid(x.sichtId) && alle.some((s) => s.id === x.sichtId) ? x.sichtId : randomUUID();
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((y) => y.id === x.benutzerId) : undefined;
    if (!b) throw new Fachfehler(404, t('meldungen.dienst.diesen-benutzer-gibt-es'));
    const elternId = istUuid(x.elternId) && alle.some((s) => s.id === x.elternId) && !waereKreis(alle, id, x.elternId) ? x.elternId : null;
    const alt = alle.find((s) => s.id === id);
    const probe: Sicht[] = [...alle.filter((s) => s.id !== id), {
      ...(alt ?? { name: t('meldungen.dienst.neue-ansicht'), beschreibung: '', position: 0, typen: [], bedingungen: [], erstellt: '', geaendert: '' }),
      id, elternId, berechtigungen: bereinigeSichtRegelwerk(x.berechtigungen),
    }];
    const a = await this.aufloesung(b.id);
    if (b.rolle === 'admin') return { admin: true, benutzer: { id: b.id, name: b.name || b.email }, kette: [] };
    const kette = sichtTestlauf(probe, id, { id: b.id, rollen: a.meineRollen });
    return { admin: false, benutzer: { id: b.id, name: b.name || b.email }, kette, wirksam: kette.at(-1)?.stand };
  }

  private async bereinigeSicht(e: unknown, id: string, alle: Sicht[]): Promise<SichtDaten> {
    const x = (e ?? {}) as Record<string, unknown>;
    const name = ausgangAus(x.beschriftungen, 'name', text(x.name)).slice(0, 80);
    if (!name) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-namen-fuer'));
    const elternId = istUuid(x.elternId) ? x.elternId : null;
    if (elternId && !alle.some((s) => s.id === elternId)) throw new Fachfehler(422, t('meldungen.dienst.die-gewaehlte-elternsicht-gibt'));
    if (waereKreis(alle, id, elternId)) throw new Fachfehler(422, t('meldungen.dienst.eine-ansicht-kann-nicht'));
    const vorhanden = new Set((await this.repo.listeTypen()).map((t) => t.id));
    const gewaehlt = [...new Set((Array.isArray(x.typen) ? x.typen : []).map(String))];
    // „Alle Mappentypen“ (#725) steht allein; sonst nur vorhandene Typen.
    const typen = gewaehlt.includes(ALLE_TYPEN) ? [ALLE_TYPEN] : gewaehlt.filter((t) => vorhanden.has(t));
    const geschwister = kinderVon(alle.filter((s) => s.id !== id), elternId);
    // Ohne Stelle: bleibt die Elternsicht, bleibt auch die Stelle (#917) – sonst ans Ende der neuen Ebene.
    const bisher = alle.find((s) => s.id === id);
    const position = Number.isFinite(Number(x.position)) && x.position !== null && x.position !== undefined
      ? Math.trunc(Number(x.position))
      : bisher && bisher.elternId === elternId ? bisher.position : (geschwister.at(-1)?.position ?? 0) + 10;
    // Trefferliste (#75): nur der Schlüssel; passt er nicht (mehr), gilt der Standard und die Werkbank zeigt es an.
    const trefferliste = text(x.trefferliste).slice(0, 40) || null;
    // Berechtigungen (#148): fehlt die Angabe, bleiben sie, wie sie sind.
    const berechtigungen: SichtRegelwerk | null = 'berechtigungen' in x ? bereinigeSichtRegelwerk(x.berechtigungen) : alle.find((s) => s.id === id)?.berechtigungen ?? null;
    const probleme = (berechtigungen?.regeln ?? []).map((r) => sichtRegelProblem(r, !!elternId)).filter((p): p is string => !!p);
    if (probleme.length) throw new Fachfehler(422, t('meldungen.dienst.berechtigungen', { probleme: probleme.join(' ') }), { gruende: probleme, berechtigungen: true });
    // Symbol (#428): nur Namen aus der festen Auswahl; fehlt die Angabe, bleibt es, wie es ist.
    const symbol = 'symbol' in x ? ansichtSymbol(x.symbol) : alle.find((s) => s.id === id)?.symbol ?? null;
    // Beschriftungen je Sprache (#728): fehlt die Angabe, bleiben sie, wie sie sind.
    const beschriftungen = 'beschriftungen' in x ? bereinigeBeschriftungen<TypTeile>(x.beschriftungen, TYP_TEILE) : alle.find((s) => s.id === id)?.beschriftungen;
    return { name, beschreibung: ausgangAus(x.beschriftungen, 'beschreibung', text(x.beschreibung)).slice(0, 500), elternId, position, typen, bedingungen: bereinigeBedingungen(x.bedingungen), trefferliste, berechtigungen, symbol, beschriftungen };
  }

  async legeSichtAn(e: unknown): Promise<Sicht> {
    const alle = await this.repo.listeSichten();
    const id = randomUUID();
    return this.repo.legeSichtAn(id, await this.bereinigeSicht(e, id, alle));
  }

  /**
   * Ansicht ändern. Gleichzeitig bearbeiten (#917): Mit `stand` (ihr `geaendert`, wie gelesen) speichert Ablago nur,
   * wenn seitdem niemand die Ansicht geändert hat – sonst 409 und nichts geht verloren. Ohne `stand` keine Prüfung.
   */
  async aendereSicht(id: string, e: unknown): Promise<Sicht> {
    const alle = await this.repo.listeSichten();
    const alt = alle.find((s) => s.id === id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diese-ansicht-gibt-es'));
    const stand = liesStand((e as { stand?: unknown } | null)?.stand, 'meldungen.dienst.stand-ungueltig');
    if (stand !== undefined && alt.geaendert !== stand) throw Dienst.konfigurationKonflikt('sicht', alt.geaendert);
    const d = await this.bereinigeSicht(e, id, alle);
    try { return await this.repo.aendereSicht(id, d, stand); }
    catch (f) { if (f instanceof KonfigurationVeraltet) throw Dienst.konfigurationKonflikt('sicht'); throw f; }
  }

  /** 409 „Jemand hat … inzwischen geändert“ (#917) für Mappentyp bzw. Ansicht; `aktuell` = der Stand jetzt. */
  private static konfigurationKonflikt(art: 'typ' | 'sicht', aktuell?: string): Fachfehler {
    return new Fachfehler(409, t(art === 'typ' ? 'meldungen.dienst.typ-konflikt' : 'meldungen.dienst.sicht-konflikt'), { konflikt: true, ...(aktuell ? { stand: aktuell } : {}) });
  }

  /** Untersichten rücken eine Ebene nach oben, an die Stelle der gelöschten. */
  async loescheSicht(id: string): Promise<void> {
    const alle = await this.repo.listeSichten();
    const s = alle.find((x) => x.id === id);
    if (!s) throw new Fachfehler(404, t('meldungen.dienst.diese-ansicht-gibt-es'));
    // Neue Reihenfolge der Ebene: Geschwister davor, die Kinder, Geschwister danach.
    const ebene = kinderVon(alle, s.elternId).flatMap((g) => (g.id === id ? kinderVon(alle, id) : [g]));
    for (const [i, g] of ebene.entries()) {
      if (g.elternId !== s.elternId || g.position !== (i + 1) * 10) await this.repo.setzeSichtOrt(g.id, s.elternId, (i + 1) * 10);
    }
    await this.repo.loescheSicht(id);
  }

  /** Reihenfolge unter Geschwistern setzen: Ids in der gewünschten Reihenfolge. */
  async ordneSichten(elternId: unknown, ids: unknown): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    const eltern = istUuid(elternId) ? elternId : null;
    const geschwister = kinderVon(alle, eltern);
    const liste = Array.isArray(ids) ? ids.map(String) : [];
    if (liste.length !== geschwister.length || !geschwister.every((g) => liste.includes(g.id))) throw new Fachfehler(422, t('meldungen.dienst.die-reihenfolge-muss-genau'));
    for (const [i, sid] of liste.entries()) {
      const g = geschwister.find((x) => x.id === sid)!;
      if (g.position !== (i + 1) * 10) await this.repo.setzeSichtOrt(sid, g.elternId, (i + 1) * 10);
    }
    return this.repo.listeSichten();
  }

  /**
   * Sicht verschieben (Drag & Drop, #73): unter `elternId` (null = oberste Ebene) an die Stelle `stelle`
   * (0 = zuerst). Untersichten wandern mit; Kreise sind unmöglich.
   */
  async verschiebeSicht(id: string, elternId: unknown, stelle: unknown): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    const s = alle.find((x) => x.id === id);
    if (!s) throw new Fachfehler(404, t('meldungen.dienst.diese-ansicht-gibt-es'));
    const eltern = istUuid(elternId) ? elternId : null;
    if (eltern && !alle.some((x) => x.id === eltern)) throw new Fachfehler(422, t('meldungen.dienst.die-gewaehlte-elternsicht-gibt'));
    if (waereKreis(alle, id, eltern)) throw new Fachfehler(422, t('meldungen.dienst.eine-ansicht-kann-nicht'));
    const geschwister = kinderVon(alle.filter((x) => x.id !== id), eltern);
    const n = Number(stelle);
    const i = Number.isFinite(n) ? Math.max(0, Math.min(geschwister.length, Math.trunc(n))) : geschwister.length;
    const neu = [...geschwister.slice(0, i), s, ...geschwister.slice(i)];
    for (const [j, g] of neu.entries()) {
      const position = (j + 1) * 10;
      if (g.id === id ? g.elternId !== eltern || g.position !== position : g.position !== position) {
        await this.repo.setzeSichtOrt(g.id, g.id === id ? eltern : g.elternId, position);
      }
    }
    return this.repo.listeSichten();
  }

  /** Anzahl Treffer einer (noch nicht gespeicherten) Sicht – für die Vorschau in der Werkbank. */
  async sichtVorschau(ich: { id: string }, id: unknown, e: unknown): Promise<{ anzahl: number }> {
    const alle = await this.repo.listeSichten();
    const sid = istUuid(id) && alle.some((s) => s.id === id) ? id : randomUUID();
    const d = await this.bereinigeSicht(e, sid, alle);
    const probe: Sicht[] = [...alle.filter((s) => s.id !== sid), { ...d, id: sid, erstellt: '', geaendert: '' }];
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const [anzahl] = await this.repo.zaehleKlauseln([klauselnFuer(probe, sid, typen, await this.aufloesung(ich.id))]);
    return { anzahl };
  }

  /**
   * Eigene Sicht für einen Mappentyp, mit der Id des Typs (Lesezeichen bleiben gültig), auf der
   * obersten Ebene angehängt. Benutzer und Rolle stehen dabei immer am Ende.
   */
  private async sichtFuerTyp(t: Mappentyp) {
    const alle = await this.repo.listeSichten();
    if (alle.some((s) => s.id === t.id)) return;
    const SYSTEM_AB = 100_000;
    const oben = kinderVon(alle, null).map((s) => s.position);
    const position = t.system
      ? Math.max(SYSTEM_AB, ...oben) + 10
      : Math.max(0, ...oben.filter((p) => p < SYSTEM_AB)) + 10;
    await this.repo.legeSichtAn(t.id, { name: t.name, beschreibung: t.beschreibung, elternId: null, position, typen: [t.id], bedingungen: [] });
  }

  async belegung(typId: string) {
    if (!(await this.repo.holeTyp(typId))) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    return this.repo.belegung(typId);
  }

  /* ---------- Passung: passt eine Mappe zur aktuellen Definition? ---------- */

  pruefePassung(typId: string): Promise<number> { return this.passung.pruefePassung(typId); }
  private pruefeUnpassende(typ: Mappentyp) { return this.passung.pruefeUnpassende(typ); }
  private passungFuer(typ: Mappentyp, ids: string[]) { return this.passung.passungFuer(typ, ids); }
  passungNachziehen(fortschritt?: (fertig: number, gesamt: number) => void): Promise<number> { return this.passung.passungNachziehen(fortschritt); }

  private titel(m: Mappe): Promise<string> { return this.mappenTitel.titel(m); }

  /* ---------- Titel ---------- */

  aktualisiereTitel(ids: string[]): Promise<Map<string, string>> { return this.mappenTitel.aktualisiereTitel(ids); }
  hakenUeberfuehren(): Promise<number> { return this.mappenTitel.hakenUeberfuehren(); }
  typSchluesselNachziehen(): Promise<number> { return this.mappenTitel.typSchluesselNachziehen(); }

  /* ---------- Ansicht der Werkbank (#281): nur Navigation, keine Funktion wird abgeschaltet ---------- */

  async werkbankAnsicht(wer: { id: string | null; email: string }) {
    const installation = liesAnsicht(await this.einstellungen?.lies('werkbank_ansicht'));
    return {
      installation: installation ?? OHNE_EINSTELLUNG,
      eingestellt: !!installation,
      eigene: liesEigene(await this.einstellungen?.lies(`werkbank_ansicht:${wer.id ?? wer.email}`)),
    };
  }
  async setzeWerkbankAnsicht(wer: { id: string | null; email: string }, body: Record<string, unknown>) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    if ('installation' in body) {
      const a = liesAnsicht(body.installation);
      if (!a) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-vorlage-waehlen'));
      await this.einstellungen.schreibe('werkbank_ansicht', a);
      protokoll.modul('werkbank').info('Werkbank angepasst', { vorlage: a.vorlage, ein: a.ein, aus: a.aus, von: wer.email });
    }
    if ('eigene' in body) {
      const e = liesEigene(body.eigene);
      await this.einstellungen.schreibe(`werkbank_ansicht:${wer.id ?? wer.email}`, e.ein.length || e.experte ? e : null);
    }
    return this.werkbankAnsicht(wer);
  }

  /* ---------- Pakete (#188): die Logik steckt in pakete.ts; die Ablage ruft das Repo des Kerns bzw. pakete/pakete.einstellungen.ts (#961) ---------- */

  /** Wird beim Anlegen eines Ereignisses aufgerufen (der Läufer stellt dann gleich zu). */
  ereignisWecker: (() => void) | null = null;
  /** Dienstkonten der Pakete (Benutzer-Id → Paket-Id), vom Paket-Läufer gepflegt (Kern). */
  get paketKonten(): Map<string, string> { return this.kern.paketKonten; }
  set paketKonten(m: Map<string, string>) { this.kern.paketKonten = m; }

  /* ---------- Ereigniskatalog (#670) ---------- */

  /** Verteiler des Katalogs; Abnehmer (Pakete hier, Automatisierungen #674, Webhooks #671) melden sich mit `abonniere` an. */
  readonly ereignisse = new Ereignisverteiler({ repo: () => this.kern.repoOhneTransaktion, ruht: () => this.ereignisseRuhen?.() ?? false });
  /** Wartung, Wiederherstellung (vom Start gesetzt): dann verteilt der Katalog nichts. */
  ereignisseRuhen?: () => boolean | Promise<boolean>;
  /** Startseite „Zuletzt geöffnet“ (#940): Anlegen und Ändern durch eine Person (vom Start gesetzt, Kern). */
  get beiEigenerAenderung() { return this.kern.beiEigenerAenderung; }
  set beiEigenerAenderung(f: ((benutzerId: string, mappeId: string) => Promise<void>) | undefined) { this.kern.beiEigenerAenderung = f; }

  /** `f` im Namen eines bestimmten Auslösers ausführen (#674); ohne Ereignisse (Import, Beispiele) – Kern. */
  mitAusloeser<T>(a: EreignisAusloeser, f: () => Promise<T>): Promise<T> { return this.kern.mitAusloeser(a, f); }
  ohneEreignisse<T>(f: () => Promise<T>): Promise<T> { return this.kern.ohneEreignisse(f); }

  /** Ein Ereignis des Katalogs (#670) in den Ausgangskorb (Kern). */
  ereignis(art: KatalogArt, daten: Record<string, unknown>, von?: string | null): Promise<void> { return this.kern.ereignis(art, daten, von); }

  /** Aufgabe anlegen und als „etwas ist zu erledigen“ melden (#670). */
  private async neueAufgabe(a: Aufgabe, typ?: string): Promise<Aufgabe> {
    const x = await this.repo.legeAufgabeAn(a);
    await this.ereignis('aufgabe.neu', { aufgabe: x.id, mappe: x.mappeId, typ: typ ?? await this.typVon(x.mappeId), empfaenger: x.empfaengerId ?? null, aufgabenart: x.art }, a.erstelltVon ?? null);
    return x;
  }

  /** Typ einer Mappe für ein Ereignis (null, wenn es sie nicht mehr gibt). */
  private typVon(mappeId: string): Promise<string | null> { return this.kern.typVon(mappeId); }

  /** Neue Verweise auf andere Mappen (#670: „zu dieser Mappe hin verknüpft“) – je neu verknüpfter Mappe ein Ereignis. */
  private async meldeVerknuepft(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null) {
    const vorher = new Set(verweiseVon(typ, alt).map((v) => `${v.feldKey}|${v.zielId}`));
    const ziele = verweiseVon(typ, neu).filter((v) => !vorher.has(`${v.feldKey}|${v.zielId}`) && v.zielId !== mappeId);
    if (!ziele.length) return;
    const typen = await this.repo.typenVon([...new Set(ziele.map((v) => v.zielId))]);
    for (const v of ziele) await this.ereignis('mappe.verknuepft', { mappe: v.zielId, typ: typen.get(v.zielId) ?? null, von: mappeId, vonTyp: typ.id, feld: v.feldKey }, von);
  }

  /**
   * Abnehmer „pakete“ (#670, #724): jedes Ereignis des Katalogs an die Pakete, die es abonniert haben – derselbe
   * Ausgangskorb wie für Automatisierungen und Webhooks, die Zustellung samt Wiederholung macht der Paket-Läufer.
   * - Ein Paket bekommt seine eigenen Änderungen nicht gemeldet (sonst Schleifen).
   * - Mappen-Ereignisse nur zu Typen unter `code.mappentypen` (eigene, fremde, „*“) und nur, wenn der Paket-Benutzer
   *   die Mappe gerade lesen darf (#686; sonst still nicht, Grund im Protokoll); Ereignisse aus Demo-Daten und Beispielen nur, wenn
   *   sie Dateien betreffen (Texterkennung, Vektoren), nie Mappen-Ereignisse.
   * - `volltext.fertig` ohne Text nur an Pakete, die das kennen; `sicherung.fertig` nur mit `dms:sicherung-lesen`.
   * - Veraltete Namen (Übergang): wer `texterkennung.fertig` abonniert hat, bekommt den Volltext der eingebauten
   *   Texterkennung unter diesem Namen.
   * Die Id je Paket ist fest (aus Ereignis, Paket und Name) – kommt das Ereignis noch einmal, entsteht nichts doppelt.
   */
  private async ereignisAnPakete(e: KatalogEreignis) {
    const k = EREIGNISKATALOG[e.art] as Katalogeintrag;
    if (!k.paket || k.gruppe === 'auftrag') return;
    if (e.ausloeser.still && k.mappentyp) return;
    const alt = Object.entries(VERALTETE_EREIGNISSE).filter(([, neu]) => neu === e.art).map(([name]) => name as EreignisArt);
    const zustellungen: Array<{ paket: InstalliertesPaket; art: EreignisArt }> = [];
    const pakete = await this.kern.repoOhneTransaktion.listePakete();
    const typen = k.mappentyp ? await this.kern.repoOhneTransaktion.listeTypen() : [];
    for (const p of pakete) {
      const l = p.laeufer;
      if (!l || (e.ausloeser.art === 'paket' && e.ausloeser.id === p.id)) continue;
      if (e.art === 'sicherung.fertig' && !hatSchnittstelle(l, 'dms:sicherung-lesen')) continue;
      if (k.mappentyp) {
        const abonniert = l.ereignisse.includes(e.art as EreignisArt);
        if (!abonniert || typeof e.daten.typ !== 'string' || !(await this.typverweise(p.id, pakete, typen))(l.mappentypen ?? []).has(e.daten.typ)) continue;
        // #686: nur, was der Paket-Benutzer gerade lesen darf (bestätigte Rechte, „Pakete“ am Mappentyp, Regeln für die Rolle „Paket“).
        const grund = await this.paketSiehtNicht(p, e.daten.typ, typeof e.daten.mappe === 'string' ? e.daten.mappe : null);
        if (grund) { protokoll.modul('werkbank').info('Ereignis nicht an Paket zugestellt', { paket: p.id, ereignis: e.art, mappe: e.daten.mappe ?? null, grund }); continue; }
      }
      // KI-Dienste (#796): Ereignisse zu Dokumenten und Mappen eines nicht zugelassenen Mappentyps bekommt ein KI-Paket
      // nicht – auch nicht Dateiname oder Ids. Lässt sich der Typ nicht bestimmen, gilt er als gesperrt (nie falsch).
      if (!k.mappentyp && istKiPaket(l) && (l.ereignisse.includes(e.art as EreignisArt) || alt.some((a) => l.ereignisse.includes(a)))) {
        const mappe = typeof e.daten.mappe === 'string' ? e.daten.mappe : null;
        const typ = typeof e.daten.typ === 'string' ? e.daten.typ : mappe ? (await this.kern.repoOhneTransaktion.holeMappe(mappe))?.typId ?? null : null;
        if ((typ && (await this.kiSperre(p))(typ)) || (!typ && (mappe || typeof e.daten.dokument === 'string'))) {
          protokoll.modul('werkbank').info('Ereignis nicht an Paket zugestellt', { paket: p.id, ereignis: e.art, mappe, grund: t('meldungen.dienst.ki-nicht-zugelassen') });
          await this.kiUebersprungen(p.id, e.art, e.daten);
          continue;
        }
      }
      const ohneText = e.art === 'volltext.fertig' && e.daten.text === false && !kenntVolltextOhneText(p);
      if (l.ereignisse.includes(e.art as EreignisArt) && !ohneText) zustellungen.push({ paket: p, art: e.art as EreignisArt });
      for (const a of alt) if (l.ereignisse.includes(a) && e.daten.quelle === 'kern') zustellungen.push({ paket: p, art: a });
    }
    if (!zustellungen.length) return;
    const daten: Record<string, unknown> = { ...e.daten, ereignis: e.id };
    // Name der Datei nur für Pakete (nicht im Ausgangskorb, der nur Ids kennt).
    if (e.art === 'dokument.hochgeladen' && typeof e.daten.dokument === 'string') daten.name = (await this.kern.repoOhneTransaktion.holeDokument(e.daten.dokument))?.name ?? null;
    const fuer = (art: EreignisArt): Record<string, unknown> => (art === 'texterkennung.fertig' ? { ...daten, seiten: daten.seiten ?? null } : daten);
    const feste = (paket: string, art: string) => { const h = createHash('sha256').update(`${e.id}|${paket}${art === e.art ? '' : `|${art}`}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
    await this.kern.repoOhneTransaktion.legeEreignisseAn(zustellungen.map((z) => ({ id: feste(z.paket.id, z.art), paketId: z.paket.id, art: z.art, daten: fuer(z.art) })));
    this.ereignisWecker?.();
  }

  /**
   * Auftrag an genau ein Paket (#577, #614, #631, #338): Der Kern bittet ein bestimmtes Paket um etwas (Datei umwandeln,
   * Volltext, Archivfassung) bzw. sagt ihm, dass seine Einstellungen geändert sind. Kein Geschehen für andere – daher
   * nicht im Ausgangskorb, sondern direkt in der Zustellung des Paket-Läufers (gleiche Wiederholung). In einer
   * Transaktion gehört er zur Änderung; sonst landen Fehler nur im Protokoll.
   */
  async auftrag(paket: string, art: Extract<EreignisArt, 'datei.umwandeln' | 'datei.volltext' | 'datei.archivfassung' | 'paket.einstellungen_geaendert'>, daten: Record<string, unknown>): Promise<'gesperrt' | void> {
    const inTx = this.kern.inEigenerTransaktion();
    try {
      const p = (await this.repo.listePakete()).find((x) => x.id === paket && x.laeufer?.ereignisse.includes(art));
      if (!p) return;
      // KI-Dienste (#796): Dateien eines nicht zugelassenen Mappentyps gehen an kein KI-Paket. „gesperrt“: Der Aufrufer
      // setzt den Stand selbst (bzw. stellt den Auftrag über ein anderes Dokument mit derselben Datei).
      if (istKiPaket(p.laeufer) && (typeof daten.mappe === 'string' || typeof daten.dokument === 'string')) {
        const typ = typeof daten.mappe === 'string' ? (await this.repo.holeMappe(daten.mappe))?.typId ?? null : null;
        if (!typ || (await this.kiSperre(p))(typ)) {
          protokoll.modul('werkbank').info('Auftrag nicht an Paket gegeben', { paket: p.id, art, grund: t('meldungen.dienst.ki-nicht-zugelassen') });
          return 'gesperrt';
        }
      }
      await this.repo.legeEreignisseAn([{ id: randomUUID(), paketId: p.id, art, daten }]);
      this.danach(() => this.ereignisWecker?.());
    } catch (e) {
      if (inTx) throw e;
      protokoll.modul('werkbank').error('Auftrag an Paket nicht gespeichert', { art, paket, fehler: (e as Error).message });
    }
  }

  /** Geheimnisse von Paketen mit dem Tresor des DMS. */
  verschluesselePaketGeheimnis(text: string): string {
    if (!this.tresor?.bereit) throw new Fachfehler(409, t('meldungen.dienst.fuer-geheimnisse-fehlt-der'));
    return this.tresor.verschluessele(text);
  }
  entschluessele(wert: string): string | null { return this.tresor?.entschluessele(wert) ?? null; }

  belegteTypen(ids: string[], ohne: string[] = []): Promise<string[]> { return this.mappentypen.belegteTypen(ids, ohne); }

  /** Nur für das Zurückrollen einer fehlgeschlagenen Paketinstallation: Mappen ohne Papierkorb entfernen (mit Dateien, #878). */
  async entferneMappenEndgueltig(ids: string[]) {
    const vorher = await this.lebendInhalt(await this.repo.holeMappen(ids));
    const dateien = new Set((await Promise.all(ids.map((id) => this.repo.listeDokumente(id)))).flat().map((d) => d.sha256));
    for (const id of await this.loeschReihenfolge(ids)) await this.repo.loescheMappe(id);
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'endgueltig', weg: 'zurueckgerollt' }), await this.loeschKontext(null, { ausloeser: 'automatisch' }));
    for (const sha of dateien) await this.raeumeAuf(sha);
  }

  /**
   * Reihenfolge zum endgültigen Löschen mehrerer Mappen (#878): Mappen, auf die andere aus der Liste verweisen, zuletzt –
   * sonst scheitert das Löschen am Fremdschlüssel der Verweise. Bei einem Kreis bleibt der Rest in der alten Reihenfolge.
   */
  private async loeschReihenfolge(ids: string[]): Promise<string[]> {
    const offen = new Set(ids);
    const quellen = new Map<string, string[]>();
    for (const id of ids) quellen.set(id, (await this.repo.rueckverweise(id)).map((r) => r.quelleId).filter((q) => q !== id && offen.has(q)));
    const erg: string[] = [];
    while (offen.size) {
      const frei = [...offen].filter((id) => !quellen.get(id)!.some((q) => offen.has(q)));
      for (const id of frei.length ? frei : [...offen]) { offen.delete(id); erg.push(id); }
    }
    return erg;
  }

  /* ---------- Beispiel-Mappen aus Paketen (#878) ---------- */

  /** Stand von Beispiel-Mappen direkt nach dem Anlegen: Prüfwert der Feldwerte und Dokumente (Id und Inhalt). */
  async beispielStand(ids: string[]): Promise<BeispielStand[]> {
    const mappen = await this.repo.holeMappen(ids);
    return Promise.all(mappen.map(async (m) => ({ id: m.id, werte: pruefwertVon(m.werte), dokumente: (await this.repo.listeDokumente(m.id)).map((d) => `${d.id}:${d.sha256}`).sort() })));
  }

  /**
   * Welche Beispiel-Mappen sind noch unverändert (#878)? Unverändert heißt: gleiche Feldwerte, dieselben Dokumente, keine
   * Notizen und kein Verweis aus einer Mappe, die kein Beispiel dieser Liste ist. Gelöschte (auch im Papierkorb) fehlen.
   */
  async pruefeBeispiele(staende: BeispielStand[]): Promise<{ unveraendert: string[]; geaendert: Array<{ id: string; typId: string; titel: string; grund: 'geaendert' | 'verwiesen' }> }> {
    const mappen = new Map((await this.repo.holeMappen(staende.map((s) => s.id))).map((m) => [m.id, m] as const));
    const alle = new Set(mappen.keys());
    const unveraendert: string[] = [];
    const geaendert: Array<{ id: string; typId: string; titel: string; grund: 'geaendert' | 'verwiesen' }> = [];
    for (const s of staende) {
      const m = mappen.get(s.id);
      if (!m) continue;
      const dok = (await this.repo.listeDokumente(m.id)).map((d) => `${d.id}:${d.sha256}`).sort();
      const gleich = pruefwertVon(m.werte) === s.werte && dok.join('|') === [...s.dokumente].sort().join('|') && !(await this.repo.notizen(m.id)).length;
      const fremd = gleich && (await this.repo.rueckverweise(m.id)).some((r) => !alle.has(r.quelleId));
      if (gleich && !fremd) unveraendert.push(m.id);
      else geaendert.push({ id: m.id, typId: m.typId, titel: m.titel || m.id, grund: gleich ? 'verwiesen' : 'geaendert' });
    }
    return { unveraendert, geaendert };
  }

  /** Beispiel-Mappen samt Dokumenten endgültig entfernen (#878): ohne Papierkorb und Ereignisse, im Löschprotokoll. */
  async entferneBeispielMappen(ids: string[], von: string | null) {
    const mappen = await this.repo.holeMappen(ids);
    const vorher = await this.lebendInhalt(mappen);
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const typVon = new Map(mappen.map((m) => [m.id, m.typId] as const));
    await this.ohneEreignisse(async () => { for (const id of await this.loeschReihenfolge([...typVon.keys()])) await this.loescheMappeIntern(id, typen.get(typVon.get(id)!), von); });
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'endgueltig', weg: 'beispiele' }), await this.loeschKontext(von));
    if (mappen.length) await this.aktualisiereStatistik();
  }

  /* ---------- Nummernkreise (#171) ---------- */

  listeNummernkreise(jetzt?: Date) { return this.nummernkreise.listeNummernkreise(jetzt); }
  speichereNummernkreis(e: unknown, von: string) { return this.nummernkreise.speichereNummernkreis(e, von); }
  loescheNummernkreis(schluessel: string, von: string) { return this.nummernkreise.loescheNummernkreis(schluessel, von); }
  setzeZaehler(schluessel: string, e: unknown, von: string, jetzt?: Date) { return this.nummernkreise.setzeZaehler(schluessel, e, von, jetzt); }
  nummernVorschau(typId: string, feldKey: string, jetzt?: Date) { return this.nummernkreise.nummernVorschau(typId, feldKey, jetzt); }
  nummernNachtragen(typId: string, feldKey: string, von: string) { return this.nummernkreise.nummernNachtragen(typId, feldKey, von); }

  absenderVorschau(): Promise<{ posten: Array<{ id: string; titel: string; absender: string; kanal: string; erstellt: string }> }> { return this.mappenTitel.absenderVorschau(); }
  absenderBereinigen(ids: unknown, von: { id: string | null; email: string }): Promise<{ bereinigt: number }> { return this.mappenTitel.absenderBereinigen(ids, von); }
  titelNachziehen(): Promise<number> { return this.mappenTitel.titelNachziehen(); }
  ehemaligZuruecksetzen(): Promise<number> { return this.mappenTitel.ehemaligZuruecksetzen(); }
  private pruefeWerte(typ: Mappentyp, werte: Werte, eigeneId?: string, alt?: Werte, z?: Zugriff) { return this.mappenEingaben.pruefeWerte(typ, werte, eigeneId, alt, z); }
  unpassendeFormate(): Promise<Array<{ typId: string; typ: string; felder: Array<{ key: string; label: string; anzahl: number; mappen: Array<{ id: string; titel: string; wert: string; grund: string }> }> }>> { return this.mappenEingaben.unpassendeFormate(); }
  legeMappeAn(eingabe: unknown, benutzerId: string | null = null, demo = false, z?: Zugriff): Promise<Mappe & { hinweis?: string }> { return this.mappen.legeMappeAn(eingabe, benutzerId, demo, z); }
  auswahlPruefen(e: unknown, benutzerId: string, z?: Zugriff) { return this.mappenEingaben.auswahlPruefen(e, benutzerId, z); }
  folgen(e: unknown, z?: Zugriff) { return this.mappenEingaben.folgen(e, z); }
  folgeVorschlaege(typ: Mappentyp, v: { vorschlaege: Record<string, { wert: Wert; sicherheit: 'hoch' | 'mittel' | 'niedrig'; fundstelle: string }>; bezuege: Record<string, MappenBezug>; neu: Record<string, unknown> }, z?: Zugriff): Promise<void> { return this.mappenEingaben.folgeVorschlaege(typ, v, z); }
  zaehleAuswahl(e: unknown, benutzerId: string) { return this.mappenEingaben.zaehleAuswahl(e, benutzerId); }
  private pruefeVerweisziele(z: Zugriff | undefined, typ: Mappentyp, werte: Werte, alt: Werte) { return this.mappenEingaben.pruefeVerweisziele(z, typ, werte, alt); }
  rechteVorschau(id: string, eingabe: unknown, z: Zugriff): Promise<Rechte> { return this.mappenEingaben.rechteVorschau(id, eingabe, z); }
  aendereMappe(id: string, eingabe: unknown, benutzerId: string | null = null, z?: Zugriff, anlass?: Record<string, unknown>): Promise<Mappe & { hinweis?: string }> { return this.mappen.aendereMappe(id, eingabe, benutzerId, z, anlass); }
  legeMappenAn(liste: NeueMappe[]) { return this.mappen.legeMappenAn(liste); }
  /** Nach Massenläufen (#367): Statistik der Datenbank auffrischen; ein Fehler dabei ist nur ein Hinweis. */
  async aktualisiereStatistik() {
    const t = Date.now();
    try { await this.repo.aktualisiereStatistik(); protokoll.modul('datenbank').info('Statistik aufgefrischt (ANALYZE)', { ms: Date.now() - t }); }
    catch (e) { protokoll.modul('datenbank').warn('Statistik ließ sich nicht auffrischen (ANALYZE)', { fehler: (e as Error).message }); }
  }

  /**
   * Ob und warum nicht eine Mappe gelöscht werden kann (#79). Dieselbe Prüfung nutzt das Löschen,
   * damit Anzeige und Löschen nie auseinanderlaufen.
   */
  private async loeschPruefung(m: Mappe, typ: Mappentyp | undefined, rueck: Rueckverweis[], alleTypen?: Mappentyp[]) {
    if (m.systemKennung) return { ok: false as const, status: 409, grund: t('meldungen.dienst.systemrollen-lassen-sich-nicht'), fremd: [], zuordnungen: [], emails: [] };
    if (typ && !darfLoeschen(typ)) return { ok: false as const, status: 403, grund: t('meldungen.dienst.mappen-vom-typ-lassen-2', { name: typ.name, wert: typ.system === 'benutzer' ? t('meldungen.dienst.benutzer-werden-in-der') : '' }), fremd: [], zuordnungen: [], emails: [] };
    // Archivmodus (#212): vor Fristende nicht löschen – auch nicht als Administrator.
    const bis = aufbewahrenBis(typ?.archiv, m);
    if (inFrist(bis)) return { ok: false as const, status: 409, grund: t('meldungen.dienst.aufbewahrungspflicht-bis-vorher', { datumText: datumText(bis!) }), fremd: [], zuordnungen: [], emails: [], aufbewahrenBis: bis };
    const typen = rueck.length ? alleTypen ?? await this.repo.listeTypen() : [];
    // Eine Rolle darf weg, auch wenn Benutzer sie haben: deren Zuordnung fällt weg.
    const benutzerTyp = typ?.system === 'rolle' ? typen.find((t) => t.system === 'benutzer') : undefined;
    const zuordnungen = benutzerTyp ? rueck.filter((r) => r.quelleTypId === benutzerTyp.id && r.feldKey === 'rollen') : [];
    // Post (#58, #192) verweist auf jede Mappe; sie hält das Löschen nicht auf, der Verweis entfällt.
    const emailTyp = typen.find((t) => t.system === 'post');
    const emails = emailTyp ? rueck.filter((r) => r.quelleTypId === emailTyp.id && r.feldKey === 'bezug') : [];
    const fremd = rueck.filter((r) => r.quelleId !== m.id && !zuordnungen.includes(r) && !emails.includes(r));
    if (fremd.length) {
      const ids = new Set(fremd.map((r) => r.quelleId));
      return { ok: false as const, status: 409, grund: t('meldungen.dienst.auf-diese-mappe-verweisen', { anzahl: ids.size }), fremd, zuordnungen, emails, benutzerTyp, emailTyp };
    }
    return { ok: true as const, status: 200, grund: undefined, fremd, zuordnungen, emails, benutzerTyp, emailTyp };
  }

  /**
   * Export mehrerer Mappen (#152, #153): Tabelle (csv, xlsx), ZIP mit Dokumenten oder ein PDF.
   * Recht E an der Sicht, Lesen je Mappe; Reihenfolge wie in der Liste. Passwörter nie.
   */
  async exportiere(ich: { id: string; rolle: string; name?: string }, e: unknown, z: Zugriff, spur?: (ids: string[]) => Promise<unknown>, weg: Abrufweg = 'oberflaeche'): Promise<{ name: string; mime: string; inhalt: Buffer | Readable; groesse: number; mappen: number; ausgelassen: number }> {
    const x = (e ?? {}) as Record<string, unknown>;
    const format = String(x.format ?? '');
    if (!['csv', 'xlsx', 'zip', 'pdf'].includes(format)) throw new Fachfehler(422, t('meldungen.dienst.unbekanntes-format'));
    const q = { sicht: text(x.sicht), link: x.link, suche: x.suche, volltext: x.volltext, notizen: x.notizen, sortierung: x.sortierung, absteigend: x.absteigend };
    const alle = await this.repo.listeSichten();
    const sicht = alle.find((s) => s.id === q.sicht);
    if (sicht && !z.admin) {
      const r = alleSichtRechte(alle, z.wer, false).get(sicht.id);
      if (!r?.R) throw new Fachfehler(404, t('meldungen.dienst.diese-ansicht-gibt-es'));
      if (!r.E) throw sichtVerboten();
    }
    const treffer = (await this.trefferIds(ich, q, z)).ids;
    const gewaehlt = Array.isArray(x.ids) ? new Set(x.ids.map(String)) : null;
    let ids = gewaehlt ? treffer.filter((id) => gewaehlt.has(id)) : treffer;
    if (!ids.length) throw new Fachfehler(422, t('meldungen.dienst.keine-mappen-zum-exportieren'));
    // Ohne Sicht (erweiterte Suche, Typ-Liste, Link …) gilt Regel A (#294): nur Mappen, die der Benutzer
    // in mindestens einer Sicht mit Recht E sehen würde; die übrigen werden ausgelassen und gezählt.
    let ausgelassen = 0;
    if (!sicht && !z.admin) {
      const erlaubt = await this.mitnehmbar(ich, z, ids);
      ausgelassen = ids.length - erlaubt.size;
      ids = ids.filter((id) => erlaubt.has(id));
      if (!ids.length) throw verboten('export', [], Math.max(2, ausgelassen));
    }
    // Verwaltungsmodus (#820): fremde Mappen im Export dauerhaft in ihrer Historie.
    await spur?.(ids);
    const mappen = inReihenfolge(await this.repo.holeMappen(ids), ids);
    const typen = [...new Set(mappen.map((m) => m.typId))].map((t) => z.typen.get(t)).filter((t): t is Mappentyp => !!t);
    const spalten = exportSpalten(typen, x.spalten === 'alle' ? 'alle' : 'liste', sicht?.trefferliste ?? null);
    const verweise = mappen.flatMap((m) => { const t = z.typen.get(m.typId); return [...(t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v); });
    const bezuege = await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(verweise)]));
    const quelle = { typen: z.typen, titel: (id: string | null | undefined) => (id ? bezuege[id]?.titel || NICHT_SICHTBAR : '') };
    const titel = sicht?.name ?? (q.sicht === 'suche' ? 'Suche' : typen[0]?.name) ?? t('meldungen.dienst.export');
    const datei = `${sichererName(titel, 60)} ${new Date().toISOString().slice(0, 10)}`;
    // Große Exporte (#542): Zeilen mit Pausen aufbereiten, Excel und CSV im Arbeiter schreiben.
    const tabelle = async (art: { xlsx?: boolean; csv?: boolean }) => {
      const kopf = spalten.map((k) => spaltenKopf(k, typen));
      const text: string[][] = []; const werte: Zelle[][] = [];
      for (const [i, m] of mappen.entries()) {
        const z = zeile(m, spalten, quelle);
        text.push(z.text); werte.push(z.werte);
        if (i % 1000 === 999) await new Promise<void>((r) => setImmediate(r));
      }
      const r = await arbeite('exportTabellen', { titel, kopf, ...(art.csv ? { text } : {}), ...(art.xlsx ? { werte } : {}), zeitzone: zeitzone() });
      return { xlsx: r.xlsx!, csv: r.csv! };
    };
    if (format === 'csv') { const b = (await tabelle({ csv: true })).csv; return { name: `${datei}.csv`, mime: 'text/csv; charset=utf-8', inhalt: b, groesse: b.length, mappen: mappen.length, ausgelassen }; }
    if (format === 'xlsx') { const b = (await tabelle({ xlsx: true })).xlsx; return { name: `${datei}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inhalt: b, groesse: b.length, mappen: mappen.length, ausgelassen }; }
    // Dokumente aller Mappen in einem Zugriff (#367).
    const dokJe = (format === 'pdf' || format === 'zip') ? await this.dokumenteJeMappe(mappen.map((m) => m.id)) : new Map<string, Dokument[]>();
    // Archivfassung oder Original (#715): je Dokument, ohne Archivfassung das Original.
    const fw = await this.archivWahl(x.fassung);
    if (x.fassung === 'archiv') for (const [id, docs] of dokJe) dokJe.set(id, await Promise.all(docs.map(fw.waehle)));
    // Stempel (#394): je Mappe, weil die Pflicht am Mappentyp hängt. Nur PDFs und Bilder werden gestempelt.
    const wunsch = wunschAus(x.stempel);
    const stempelDaten = await this.stempelDaten();
    const plaene = new Map<string, GeltenderStempel>();
    for (const m of mappen) {
      if (!(dokJe.get(m.id) ?? []).length) continue;
      const p = await this.stempelPlan(m.typId, wunsch, '', stempelDaten);
      if (p) plaene.set(m.id, p);
    }
    // Verkleinert exportieren (#393): PDFs als verkleinerte Kopie, vor dem Stempeln.
    const klein = stufeAus(x.verkleinern);
    const wie = format === 'pdf' ? t('meldungen.dienst.als-pdf-exportiert') : t('meldungen.dienst.als-zip-exportiert');
    const gestempelt = new Map<string, Ausgabe[]>();
    const ausgabe = async (m: Mappe, d: Dokument, streng: boolean): Promise<Ausgabe> => {
      const a = await fuerAusgabe({ name: d.name, mime: d.mime, inhalt: await fw.lies(d) }, { stempel: plaene.get(m.id), verkleinern: klein },
        { benutzer: ich.name ?? '', mappe: m.titel || t('meldungen.dienst.ohne-titel'), archivnummer: d.archivnummer, entsperrt: this.entsperrtZu }, streng);
      gestempelt.set(m.id, [...(gestempelt.get(m.id) ?? []), a]);
      return a;
    };
    const historie = async () => {
      for (const [id, a] of gestempelt) await this.notiereWeitergabe(id, ich.id, wie, plaene.get(id) ?? null, a);
      // #800: Ein Export mit Dokumenten ist Herunterladen – je Mappe ein Eintrag mit ihren Dateien. Nicht zusammengefasst:
      // Ein Export ist eine bewusste Handlung, kein Rauschen. In Teilen zu 500, damit große Exporte nicht eine Riesenabfrage schicken.
      const abrufe = mappen.filter((m) => (dokJe.get(m.id) ?? []).length).map((m) => ({ mappeId: m.id, benutzerId: ich.id, art: ABRUF_ART[weg], daten: {
        dokumente: (dokJe.get(m.id) ?? []).map((d) => d.name), weg, fassung: 'export', format, ...(plaene.has(m.id) ? { gestempelt: true } : {}),
      } }));
      for (let i = 0; i < abrufe.length; i += 500) await this.repo.historieSchreibe(abrufe.slice(i, i + 500));
    };
    const bearbeiten = (m: Mappe) => plaene.has(m.id) || (!!klein && (dokJe.get(m.id) ?? []).some((d) => d.mime === 'application/pdf'));
    if (format === 'pdf') {
      const b = await mappenPdf(titel, await Promise.all(mappen.map(async (m) => {
        const docs = dokJe.get(m.id) ?? [];
        const mitStempel = plaene.has(m.id);
        const mitAusgabe = bearbeiten(m);
        // Gestempelte Bilder kommen als PDF zurück und werden darum wie PDFs eingebunden.
        return {
          mappe: m, typ: z.typen.get(m.typId),
          dokumente: mitStempel ? docs.map((d) => (kannStempeln(d.mime) ? { ...d, mime: 'application/pdf' } : d)) : docs,
          inhalt: async (d: Dokument) => {
            if (!mitAusgabe) return fw.lies(d);
            const original = docs.find((y) => y.id === d.id)!;
            return (await ausgabe(m, original, false)).inhalt;
          },
        };
      })), quelle, x.uebersicht === true ? { spalten, typen } : null);
      await historie();
      return { name: `${datei}.pdf`, mime: 'application/pdf', inhalt: b, groesse: b.length, mappen: mappen.length, ausgelassen };
    }
    // ZIP: Tabelle als Excel und CSV, je Mappe ein Ordner mit ihren Dokumenten.
    const eintrag = await tabelle({ xlsx: true, csv: true });
    const eintraege: ZipEintrag[] = [
      { name: 'Mappen.xlsx', daten: eintrag.xlsx }, { name: 'Mappen.csv', daten: eintrag.csv },
    ].map((d) => ({ name: d.name, groesse: d.daten.length, inhalt: async () => d.daten }));
    const ordner = eindeutig(mappen.map((m) => sichererName(m.titel || t('meldungen.dienst.ohne-titel'))));
    const ausDatei: Dokument[] = [];
    for (const [i, m] of mappen.entries()) {
      const docs = dokJe.get(m.id) ?? [];
      // Gestempelte Kopien entstehen vorab: das ZIP braucht die Größen im Voraus.
      const aus = bearbeiten(m) ? await Promise.all(docs.map((d) => ausgabe(m, d, false))) : null;
      const namen = eindeutig(docs.map((d, j) => sichererName(aus?.[j].name ?? d.name, 120)));
      docs.forEach((d, j) => {
        const a = aus?.[j];
        if (!a && !fw.archiv(d)) ausDatei.push(d);
        eintraege.push(a ? { name: `${ordner[i]}/${namen[j]}`, groesse: a.inhalt.length, inhalt: async () => a.inhalt } : { name: `${ordner[i]}/${namen[j]}`, groesse: d.groesse, inhalt: () => fw.strom(d) });
      });
    }
    // Fehlende Datei (#877): vorher melden – im ZIP wäre der Kopf schon unterwegs, die Antwort bräche nur ab.
    await this.pruefeVorhanden(ausDatei);
    const groesse = zipGroesse(eintraege);
    if (groesse > ZIP_MAX) throw new Fachfehler(422, t('meldungen.dienst.der-export-waere-groesser'));
    await historie();
    return { name: `${datei}.zip`, mime: 'application/zip', inhalt: zipStrom(eintraege), groesse, mappen: mappen.length, ausgelassen };
  }

  /** Dokumente mehrerer Mappen mit einem Zugriff je 500 Mappen (#367), je Mappe neueste zuerst. */
  private async dokumenteJeMappe(ids: string[]): Promise<Map<string, Dokument[]>> {
    const r = new Map<string, Dokument[]>();
    for (let i = 0; i < ids.length; i += 500) {
      for (const d of await this.repo.dokumenteVon(ids.slice(i, i + 500))) { const l = r.get(d.mappeId); if (l) l.push(d); else r.set(d.mappeId, [d]); }
    }
    return r;
  }

  /**
   * Exportrecht ohne Sicht (#294, Regel A): welche dieser Mappen der Benutzer in mindestens einer Sicht
   * mit den Rechten R und E sehen würde (einschließlich Untersichten, ohne verborgene). Administratoren: alle.
   */
  async exportierbar(ich: { id: string; rolle: string }, z: Zugriff, ids: string[]): Promise<Set<string>> {
    if (z.admin) return new Set(ids);
    const alle = await this.repo.listeSichten();
    const rechte = alleSichtRechte(alle, z.wer, false);
    const verborgen = this.verborgeneSichten(alle, z);
    // Die Auflösung (Rollen, heute) hat der Zugriff desselben Benutzers schon (#615).
    const a = z.a && z.ich?.id === ich.id ? z.a : await this.aufloesung(ich.id);
    const klauseln = alle.filter((s) => rechte.get(s.id)?.R && rechte.get(s.id)?.E)
      .flatMap((s) => klauselnFuer(alle, s.id, z.typen, a, verborgen));
    return klauseln.length ? this.repo.inKlauseln(ids, klauseln) : new Set();
  }

  /** Lesen und Exportrecht für die Prüfstelle der Wege nach draußen (#723, `ausgang.ts`). */
  private ausgangsrechte(ich: { id: string; rolle: string }, z: Zugriff): Ausgangsrechte {
    return { lesbar: (ids) => this.lesbare(z, ids), exportierbar: (ids) => this.exportierbar(ich, z, ids) };
  }
  /** Welche dieser Mappen dürfen hinaus (Herunterladen, E-Mail, Export, Laufwerk)? Lesen und Exportrecht (#723). */
  async mitnehmbar(ich: { id: string; rolle: string }, z: Zugriff, ids: string[]): Promise<Set<string>> {
    return mitnehmbar(this.ausgangsrechte(ich, z), ids);
  }
  /** Gemeinsame Prüfstelle (#723): alle Mappen müssen über diesen Weg hinausdürfen, sonst 404 bzw. 403. */
  async pruefeAusgang(ich: { id: string; rolle: string }, z: Zugriff, ausgang: Ausgang, ids: string[]): Promise<void> {
    return pruefeAlle(this.ausgangsrechte(ich, z), ausgang, ids);
  }

  /** Alle Treffer einer Sicht mit Suche (#149): nur die Ids der lesbaren Mappen, höchstens MAX_AUSWAHL. */
  async trefferIds(ich: { id: string; rolle: string }, q: Parameters<Dienst['seite']>[1], z?: Zugriff): Promise<{ ids: string[]; gesamt: number }> {
    const s = await this.seite(ich, { ...q, von: 0, anzahl: MAX_AUSWAHL }, z, MAX_AUSWAHL);
    return { ids: s.mappen.filter((m) => !m.verborgen).map((m) => m.id), gesamt: s.gesamt };
  }

  /**
   * Mehrere Mappen löschen (#150): je Mappe das Recht D am Mappentyp; Verweise innerhalb der Auswahl halten
   * nicht auf. `probe`: nur zählen, nichts löschen. Was nicht geht, steht mit Grund in `ausgelassen`.
   */
  async loescheMappen(e: unknown, benutzerId: string, z: Zugriff, quelle?: Ausloeser): Promise<{ mappen: number; dokumente: number; geloescht: number; ausgelassen: Array<{ id: string; titel: string; grund: string }> }> {
    const x = (e ?? {}) as { ids?: unknown; probe?: unknown };
    const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map(String).filter(istUuid))];
    if (!ids.length) throw new Fachfehler(422, t('meldungen.dienst.keine-mappen-ausgewaehlt'));
    if (ids.length > MAX_AUSWAHL) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-mappen-auf-einmal', { MAX_AUSWAHL: MAX_AUSWAHL.toLocaleString(gebietsschema()) }));
    const auswahl = new Set(ids);
    const ausgelassen: Array<{ id: string; titel: string; grund: string }> = [];
    const kandidaten: Mappe[] = [];
    let dokumente = 0;
    for (const id of ids) {
      const m = await this.repo.holeMappe(id);
      if (!m) { ausgelassen.push({ id, titel: '', grund: t('meldungen.dienst.gibt-es-nicht-mehr') }); continue; }
      const r = await this.rechteAn(z, m);
      if (!r.R) { ausgelassen.push({ id, titel: NICHT_SICHTBAR, grund: t('meldungen.dienst.nicht-sichtbar') }); continue; }
      if (!r.D) { ausgelassen.push({ id, titel: m.titel ?? '', grund: t('meldungen.dienst.kein-recht-zum-loeschen') }); continue; }
      const p = await this.loeschPruefung(m, z.typen.get(m.typId), (await this.repo.rueckverweise(id)).filter((v) => !auswahl.has(v.quelleId)));
      if (!p.ok) { ausgelassen.push({ id, titel: m.titel ?? '', grund: p.fremd.length ? t('meldungen.dienst.es-wird-noch-auf') : p.grund }); continue; }
      kandidaten.push(m);
      dokumente += (await this.repo.listeDokumente(id)).length;
    }
    if (x.probe === true) return { mappen: kandidaten.length, dokumente, geloescht: 0, ausgelassen };
    // Verweise innerhalb der Auswahl: in Runden, bis keine Mappe mehr dazukommt.
    let offen = kandidaten;
    let geloescht = 0;
    while (offen.length) {
      const rest: Mappe[] = [];
      for (const m of offen) {
        try { await this.loescheMappe(m.id, benutzerId, z, { ...liesAnlass(x), ausloeser: quelle, weg: 'mehrere' }); geloescht++; }
        catch (err) {
          if (err instanceof Fachfehler && err.status === 409) rest.push(m);
          else ausgelassen.push({ id: m.id, titel: m.titel ?? '', grund: (err as Error).message });
        }
      }
      if (rest.length === offen.length) { for (const m of rest) ausgelassen.push({ id: m.id, titel: m.titel ?? '', grund: t('meldungen.dienst.es-wird-noch-auf') }); break; }
      offen = rest;
    }
    return { mappen: kandidaten.length, dokumente, geloescht, ausgelassen };
  }

  async loescheMappe(id: string, benutzerId: string | null = null, z?: Zugriff, anlass?: Anlass): Promise<void> {
    if (z) await this.pruefeRecht(z, id, 'D');
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const typ = await this.repo.holeTyp(m.typId);
    const p = await this.loeschPruefung(m, typ, await this.repo.rueckverweise(id));
    if (!p.ok) throw new Fachfehler(p.status, p.grund, p.fremd.length ? { rueckverweise: p.fremd } : undefined);
    const { zuordnungen, emails, benutzerTyp, emailTyp } = p;
    // Löschprotokoll (#470): was mit der Mappe geht, bevor es weg ist.
    const vorher = await this.lebendInhalt([m]);
    for (const z of zuordnungen) {
      const b = await this.repo.holeMappe(z.quelleId);
      if (b) await this.schreibeSystemMappe(benutzerTyp!, b.id, { rollen: alsListe(b.werte.rollen).filter((r) => r !== id) }, benutzerId);
    }
    for (const e of emails) {
      const x = await this.repo.holeMappe(e.quelleId);
      if (x) await this.schreibeSystemMappe(emailTyp!, x.id, { bezug: alsListe(x.werte.bezug).filter((b) => b !== id) }, benutzerId);
    }
    const korb = await this.papierkorbTage() > 0;
    if (korb) await this.legeInPapierkorb(id, typ, benutzerId);
    else await this.loescheMappeIntern(id, typ, benutzerId);
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: korb ? 'papierkorb' : 'endgueltig', weg: anlass?.weg ?? 'einzeln', verweise: { [id]: zuordnungen.length + emails.length } }),
      await this.loeschKontext(benutzerId, anlass));
  }

  /** In den Papierkorb (#43): eindeutige Werte werden frei, Dateien bleiben bis zum Leeren. */
  private async legeInPapierkorb(id: string, typ: Mappentyp | undefined, von: string | null) {
    await this.repo.legeInPapierkorb(id, von);
    await this.notiere(id, von, 'papierkorb');
    await this.ereignis('mappe.geloescht', { mappe: id, typ: typ?.id ?? null }, von);
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
  }

  private async loescheMappeIntern(id: string, typ: Mappentyp | undefined, von: string | null = null) {
    const dokumente = await this.repo.listeDokumente(id);
    await this.repo.loescheMappe(id);
    await this.notiere(id, von, 'endgueltig');
    await this.ereignis('mappe.endgueltig_geloescht', { mappe: id, typ: typ?.id ?? null }, von);
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    for (const sha of new Set(dokumente.map((d) => d.sha256))) await this.raeumeAuf(sha);
  }

  /* ---------- Systemtypen: Benutzer und Rollen (#26, #27) ---------- */

  /**
   * Legt die Systemausstattung an, soweit sie fehlt, und schlägt sie nach (#963: `systemausstattung.sicherstellen()`).
   * Läuft beim Start; wer nur Ids braucht, nimmt `kern.system()`.
   */
  sichereSystem(): Promise<SystemIds> { return this.systemausstattung.sicherstellen(); }

  ablageortTyp(): Promise<Mappentyp | undefined> { return this.systemtypen.ablageortTyp(); }

  private ablageortId(): Promise<string | undefined> { return this.kern.ablageortId(); }

  /** Der Ablageort, den der Kern vor #883 angelegt hat (Kern). */
  frueherAblageortTyp(): Promise<Mappentyp | undefined> { return this.kern.frueherAblageortTyp(); }

  vermerkeVerwaltungsmodus(alltag: { id: string; rolle: string; name?: string; email?: string }, ids: string[], was: Modusspur): Promise<Set<string>> { return this.systemtypen.vermerkeVerwaltungsmodus(alltag, ids, was); }
  imVerwaltungsmodus(max?: number) { return this.systemtypen.imVerwaltungsmodus(max); }

  /**
   * Sichten für Post (#192), einmal angelegt: „Neue Post“ ganz oben (Stand „Neu“), unter „Post“
   * „Eingegangen“ und „Versendet“. Löscht der Administrator sie, kommen sie nicht wieder.
   */
  private async sicherePostSichten(post: Mappentyp) {
    const merk = this.einstellungen ? ((await this.einstellungen.lies('post')) as { sichten?: boolean; neu?: string } | null) : null;
    if (merk?.sichten) return;
    const alle = await this.repo.listeSichten();
    const typSicht = alle.find((s) => s.id === post.id);
    if (typSicht && (typSicht.name === 'E-Mail' || typSicht.name === 'E-Mail (System)')) {
      await this.repo.aendereSicht(typSicht.id, { ...typSicht, name: post.name, beschreibung: post.beschreibung });
    }
    const bed = (feld: string, wert: string) => [{ art: 'feld' as const, feld, op: 'einerVon' as const, wert: { art: 'fest' as const, wert: [wert] } }];
    let neu = alle.find((s) => s.typen.length === 1 && s.typen[0] === post.id && s.bedingungen.some((b) => b.art === 'feld' && b.feld === 'stand'));
    if (!neu) {
      const oben = kinderVon(alle, null).map((s) => s.position);
      neu = await this.repo.legeSichtAn(randomUUID(), {
        name: t('meldungen.dienst.neue-post'), beschreibung: t('meldungen.dienst.post-die-noch-niemand'), elternId: null,
        position: Math.min(10, ...oben) - 10, typen: [post.id], bedingungen: bed('stand', POST_STAND.neu), symbol: 'inbox',
      });
    }
    if (typSicht && !kinderVon(alle, typSicht.id).length) {
      await this.repo.legeSichtAn(randomUUID(), { name: 'Eingegangen', beschreibung: t('meldungen.dienst.post-die-in-ablago'), elternId: typSicht.id, position: 10, typen: [post.id], bedingungen: bed('richtung', POST_RICHTUNG.eingehend) });
      await this.repo.legeSichtAn(randomUUID(), { name: 'Versendet', beschreibung: t('meldungen.dienst.aus-ablago-verschickte-e'), elternId: typSicht.id, position: 20, typen: [post.id], bedingungen: bed('richtung', POST_RICHTUNG.ausgehend) });
    }
    await this.einstellungen?.schreibe('post', { sichten: true, neu: neu.id });
    protokoll.modul('werkbank').info('Ansichten für Post angelegt', { neu: neu.id });
  }

  /**
   * Mitgelieferte Ansicht „Favoriten“ (#725): alle Mappentypen, Bedingung „ist mein Favorit“, ganz oben unter
   * „Neue Post“. Einmal angelegt; löscht der Administrator sie, kommt sie nicht wieder (die Favoriten selbst
   * bleiben, der Stern an der Mappe auch).
   */
  private async sichereFavoritenSicht() {
    if (!this.einstellungen) return;
    const merk = (await this.einstellungen.lies('favoriten_sicht')) as { id?: string } | null;
    if (merk?.id) return;
    const alle = await this.repo.listeSichten();
    let s = alle.find((x) => zeigtAlleTypen(x) && x.bedingungen.length === 1 && x.bedingungen[0].art === 'favorit');
    if (!s) {
      // Direkt unter „Neue Post“, sonst ganz oben.
      const postId = await this.neuePostSicht();
      const post = alle.find((x) => x.id === postId);
      const oben = kinderVon(alle, null).map((x) => x.position);
      s = await this.repo.legeSichtAn(randomUUID(), {
        name: 'Favoriten', beschreibung: t('meldungen.dienst.deine-mappen-mit-stern'), elternId: null,
        position: post ? post.position + 1 : Math.min(10, ...oben) - 10, typen: [ALLE_TYPEN], bedingungen: [{ art: 'favorit' }], symbol: 'star',
      });
      protokoll.modul('werkbank').info('Ansicht „Favoriten“ angelegt', { sicht: s.id });
    }
    await this.einstellungen.schreibe('favoriten_sicht', { id: s.id });
  }

  /** Id der mitgelieferten Ansicht „Favoriten“ (#725), solange es sie gibt. */
  async favoritenSicht(): Promise<string | null> {
    const merk = this.einstellungen ? ((await this.einstellungen.lies('favoriten_sicht')) as { id?: string } | null) : null;
    if (!merk?.id) return null;
    return (await this.repo.listeSichten()).some((x) => x.id === merk.id) ? merk.id : null;
  }

  /** Id der Sicht „Neue Post“ (#192), damit die Oberfläche ihre Zahl hervorhebt. */
  async neuePostSicht(): Promise<string | null> {
    const merk = this.einstellungen ? ((await this.einstellungen.lies('post')) as { neu?: string } | null) : null;
    const alle = await this.repo.listeSichten();
    return alle.find((s) => s.id === merk?.neu)?.id ?? null;
  }

  /* ---------- Post (#192) ---------- */

  /**
   * Neue Post anlegen (Oberfläche „+ Post“, API): Stand Neu, eingehend, heute. Die Dokumente kommen
   * danach über das Hochladen ins Dokumentenregister. Ob man Post anlegen darf, regeln die Berechtigungen.
   */
  /**
   * Post anlegen. `ich.id` null: kein echter Benutzer, sondern ein Eingangskanal (#195: „Eingangsordner“);
   * `herkunft` steht dann als eigener Eintrag in der Historie.
   * `alt` (Teilen, #445): Werte der Ausgangspost – Verweise, die dort schon stehen (z. B. „Für“), gelten nicht als neu.
   */
  async legePostAn(eingabe: unknown, ich: { id: string | null; name: string }, z?: Zugriff, kanal: string = POST_KANAL.hochgeladen, herkunft?: Historieneintrag['daten'], id: string = randomUUID(), alt: Werte = {}): Promise<Mappe> {
    const { post: typ } = await this.kern.system();
    if (!darfPostAnlegen(typ)) throw new Fachfehler(403, t('meldungen.dienst.post-laesst-sich-nicht'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const betreff = text(e.betreff).replace(/[\r\n]+/g, ' ').trim().slice(0, 250) || t('meldungen.dienst.neue-post');
    const datum = istDatum(text(e.datum)) ? text(e.datum) : heuteIn();
    const werte = bereinigeWerte(typ, {
      ...(e.werte && typeof e.werte === 'object' ? e.werte as Record<string, unknown> : {}),
      betreff, datum, kanal: Object.values(POST_KANAL).includes(text(e.kanal) as never) ? text(e.kanal) : kanal,
      richtung: POST_RICHTUNG.eingehend, stand: POST_STAND.neu,
      // Kein Rückgriff auf den Namen des Anlegenden (#494): Absender ist, wer den Brief geschickt hat.
      absender: text(e.absender).trim().slice(0, 250) || null, bezug: null,
      ...(e.fuer !== undefined ? { fuer: e.fuer || null } : {}), ...(typeof e.nachricht === 'string' ? { nachricht: e.nachricht.slice(0, NOTIZ_MAX) } : {}),
    }, {}, this.verschluessele);
    if (z && !z.admin) {
      const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte, erstellt: new Date().toISOString(), erstelltVon: ich.id, geaendert: new Date().toISOString(), geaendertVon: ich.id };
      if (!(await this.rechteAn(z, entwurf, true)).C) throw new Fachfehler(403, t('meldungen.dienst.post-anlegen-darfst-du'));
    }
    await this.pruefeVerweisziele(z, typ, werte, alt);
    await this.pruefeWerte(typ, werte);
    // Vorgegebene Id (#196): Eingangskanäle merken sie sich vorher und erkennen nach einem Absturz, dass es die Post schon gibt.
    // Post samt Historie, Aufgabe und Ereignis in einer Transaktion (#404).
    const { m, titel } = await this.inTransaktion(async () => {
      const m = await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), ich.id);
      await this.notiere(m.id, ich.id, 'angelegt', { aenderungen: await this.aenderungen(typ, {}, werte), ...(ich.id ? {} : { system: ich.name }) });
      if (herkunft) await this.notiere(m.id, null, 'uebernommen', { system: ich.name, ...herkunft });
      const titel = (await this.aktualisiereTitel([m.id])).get(m.id);
      await this.postAufgaben(m.id, ich.id);
      await this.ereignis('post.angelegt', { mappe: m.id, kanal: werte.kanal, fuer: typeof werte.fuer === 'string' ? werte.fuer : null }, ich.id);
      await this.meldeVerknuepft(typ, m.id, alt, werte, ich.id);
      return { m, titel };
    });
    protokoll.modul('ablage').info('Post angelegt', { mappe: m.id, kanal: werte.kanal });
    return { ...m, titel };
  }

  /**
   * Zuordnen (#192): Post gehört zu einer Mappe. Die gewählten Dokumente wandern in ein
   * Dokumentenregister der Zielmappe (oder werden kopiert – dieselbe Datei, kein zweiter Platz),
   * die Post verweist auf die Mappe und hat danach Stand „Zugeordnet“. Mehrmals möglich.
   *
   * Auflösen (#936, `aufloesen: true`): Ist die Zielmappe eben aus dieser Post angelegt worden, wird aus der Post die
   * Mappe – siehe `loesePostAuf`. Darf die Person die Post nicht löschen, bleibt es beim Zuordnen, mit `hinweis`.
   */
  async ordneZu(postId: string, eingabe: unknown, von: string | null, z?: Zugriff, auto?: { grund: string }, quelle?: Ausloeser) {
    const post = z ? await this.pruefeRecht(z, postId, 'U') : await this.repo.holeMappe(postId);
    if (!post) throw new Fachfehler(404, t('meldungen.dienst.diese-post-gibt-es'));
    const typ = await this.repo.holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(422, t('meldungen.dienst.zuordnen-geht-nur-mit'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const zielId = text(e.ziel);
    if (!istUuid(zielId) || zielId === postId) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-mappe-waehlen'));
    const ziel = z ? await this.pruefeRecht(z, zielId, 'U') : await this.repo.holeMappe(zielId);
    if (!ziel) throw new Fachfehler(404, t('meldungen.dienst.die-gewaehlte-mappe-gibt'));
    const zielTyp = await this.repo.holeTyp(ziel.typId);
    if (!zielTyp) throw new Fachfehler(500, t('meldungen.dienst.der-mappentyp-der-zielmappe'));
    if (zielTyp.system === 'post') throw new Fachfehler(422, t('meldungen.dienst.post-laesst-sich-nicht-2'));
    const alle = await this.repo.listeDokumente(postId);
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : alle.map((d) => d.id);
    const dokumente = ids.map((id) => alle.find((d) => d.id === id));
    if (dokumente.some((d) => !d)) throw new Fachfehler(422, t('meldungen.dienst.ein-ausgewaehltes-dokument-gehoert-3'));
    const regs = zielTyp.register.filter((r) => r.art === 'dokumente');
    const reg = regs.find((r) => r.key === text(e.register)) ?? (e.register ? undefined : regs[0]);
    if (dokumente.length && !reg) throw new Fachfehler(422, regs.length ? t('meldungen.dienst.dieses-dokumentenregister-gibt-es') : t('meldungen.dienst.hat-kein-dokumentenregister-ordne', { name: zielTyp.name }));
    const kopieren = e.kopieren === true;
    // Auflösen (#936, #934): auf Wunsch – in eine neue wie in eine bestehende Mappe. Nie automatisch (wegen „Automatik
    // rückgängig“), nie mit „Kopie in der Post behalten“ und nie bei versendeten E-Mails (Nachweis des Versands).
    const rest = alle.filter((d) => !ids.includes(d.id));
    let hinweis: string | undefined;
    if (e.aufloesen === true && !auto && !kopieren && !istVersendet(post.werte)) {
      const grund = await this.aufloesenSperre(post, typ, rest.length > 0, z);
      if (!grund) return this.loesePostAuf({ post, typ, ziel, zielTyp, reg, dokumente: dokumente as Dokument[], rest, von, quelle, neu: await this.ebenAngelegt(ziel, von) });
      hinweis = t('meldungen.dienst.post-bleibt-zugeordnet', { grund });
    }
    for (const d of dokumente as Dokument[]) {
      if (kopieren) {
        const neu = await this.repo.legeDokumentAn({ ...d, id: randomUUID(), mappeId: ziel.id, registerKey: reg!.key, erstellt: new Date().toISOString(), erstelltVon: von });
        const fertig = await this.repo.ocrVonSha(d.sha256, neu.id);
        if (fertig) await this.repo.ocrSetze(neu.id, { stand: 'fertig', text: fertig.text, seiten: fertig.seiten, info: fertig.info, sprache: fertig.sprache ?? null });
        else if (Dienst.volltextAn(zielTyp, reg!.key)) { await this.repo.ocrEinreihen([neu.id]); this.ocr?.anstossen(); }
      } else await this.verschiebeInRegister(d, ziel.id, zielTyp, reg!.key);
    }
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const zielTitel = await this.titel(ziel);
    const n = dokumente.length;
    const doks = n ? t('meldungen.dienst.mit-dokumenten-ins-register', { anzahl: n, wert: kopieren ? ' (kopiert)' : '', name: reg!.name }) : '';
    const bezug = [...new Set([...alsListe(post.werte.bezug), ziel.id])];
    await this.schreibeSystemMappe(typ, post.id, { bezug, stand: POST_STAND.zugeordnet }, von);
    // Automatisch (#337): Begründung in der Historie beider Mappen.
    const wie = auto ? { automatisch: true, grund: auto.grund, system: 'Erkennung' } : {};
    const warum = auto ? ` – automatisch: ${auto.grund}` : '';
    await this.notiere(post.id, von, 'zugeordnet', { text: t('meldungen.dienst.zugeordnet-zu', { wert: auto ? t('meldungen.dienst.automatisch') : '', zielTitel, doks, warum }), ziel: ziel.id, zielTyp: ziel.typId, dokumente: n, kopiert: kopieren, ...wie });
    await this.notiere(ziel.id, von, 'zugeordnet', { text: t('meldungen.dienst.post-zugeordnet', { betreff, wert: auto ? t('meldungen.dienst.automatisch') : '', doks, warum }), post: post.id, postTyp: typ.id, dokumente: n, kopiert: kopieren, ...wie });
    if (n) {
      await this.beruehre(ziel.id, zielTyp, von);
      await this.beruehre(post.id, typ, von);
    }
    await this.postAufgaben(post.id, von);
    protokoll.modul('ablage').info('Post zugeordnet', { post: post.id, ziel: ziel.id, dokumente: n, kopiert: kopieren, aufloesenGesperrt: hinweis ? true : undefined });
    return { post: (await this.repo.holeMappe(post.id))!, ziel: (await this.repo.holeMappe(ziel.id))!, aufgeloest: false as const, ...(hinweis ? { hinweis } : {}) };
  }

  /** Dokument in ein anderes Register (einer anderen Mappe); dort ist die Texterkennung vielleicht aus oder an. */
  private async verschiebeInRegister(d: Dokument, mappeId: string, typ: Mappentyp, registerKey: string) {
    await this.repo.verschiebeDokument(d.id, mappeId, registerKey);
    if (Dienst.volltextAn(typ, registerKey) && (d.ocr?.stand === 'keiner' || d.ocr?.stand === 'ausgelassen')) { await this.repo.ocrEinreihen([d.id]); this.ocr?.anstossen(); }
  }

  /**
   * Eben aus dieser Post angelegt (#936)? Die Zielmappe hat dieselbe Person vor höchstens einer Stunde angelegt, und ihr
   * ist noch keine Post zugeordnet. Seit #934 nur noch für den Wortlaut der Historie („Aus Post … angelegt“ bzw.
   * „Post … übernommen“) – auflösen lässt sich Post auch in eine bestehende Mappe.
   */
  private async ebenAngelegt(ziel: Mappe, von: string | null): Promise<boolean> {
    if ((ziel.erstelltVon ?? null) !== von) return false;
    if (Date.now() - Date.parse(ziel.erstellt) > AUFLOESEN_FRIST_MS) return false;
    return !(await this.repo.historie(ziel.id, { arten: ['zugeordnet'], max: 1 })).length;
  }

  /**
   * Warum sich die Post nicht auflösen lässt (#936), sonst null. Auflösen legt die Post in den Papierkorb – das darf nur,
   * wer sie auch löschen darf (Recht D und dieselbe Prüfung wie beim Löschen). Bleibt ein Teil der Dokumente übrig, kommt
   * er in eine neue Post – dafür braucht es das Recht, Post anzulegen.
   */
  private async aufloesenSperre(post: Mappe, typ: Mappentyp, mitRest: boolean, z?: Zugriff): Promise<string | null> {
    if (z && !(await this.rechteAn(z, post)).D) return t('meldungen.dienst.kein-recht-zum-loeschen');
    const p = await this.loeschPruefung(post, typ, await this.repo.rueckverweise(post.id));
    if (!p.ok) return p.grund ?? t('meldungen.dienst.kein-recht-zum-loeschen');
    if (mitRest) {
      if (!darfPostAnlegen(typ)) return t('meldungen.dienst.post-laesst-sich-nicht');
      if (z && !z.admin) {
        const jetzt = new Date().toISOString();
        const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte: { ...post.werte, stand: POST_STAND.neu, bezug: null }, erstellt: jetzt, erstelltVon: z.ich.id, geaendert: jetzt, geaendertVon: z.ich.id };
        if (!(await this.rechteAn(z, entwurf, true)).C) return t('meldungen.dienst.post-anlegen-darfst-du');
      }
    }
    return null;
  }

  /**
   * Post auflösen (#936, #934): Aus der Post wird die Mappe – eben angelegt oder vorhanden. Die gewählten Dokumente wandern in ihr Register,
   * die übrigen („abgetrennt“) in eine neue Post mit Verweis auf die Herkunft. Historie, Notizen, Aufgaben und
   * Erinnerungen der Post gehören danach der Mappe, dazu der Eintrag „Aus Post … angelegt“. Die leere Post kommt mit
   * „Aufgelöst in …“ in den Papierkorb (bei ausgeschaltetem Papierkorb endgültig weg); wiederherstellen lässt sie sich
   * nicht – der Weg zurück ist, die neue Mappe zu löschen (Thomas, 07.11.2026). Alles in einer Transaktion.
   */
  private async loesePostAuf(x: { post: Mappe; typ: Mappentyp; ziel: Mappe; zielTyp: Mappentyp; reg: Register | undefined; dokumente: Dokument[]; rest: Dokument[]; von: string | null; quelle?: Ausloeser; neu: boolean }) {
    const { post, typ, ziel, zielTyp, reg, dokumente, rest, von } = x;
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const zielTitel = await this.titel(ziel);
    const erg = await this.inTransaktion(async () => {
      for (const d of dokumente) await this.verschiebeInRegister(d, ziel.id, zielTyp, reg!.key);
      // Abgetrennt: die übrigen Dokumente als neue Post in „Neue Post“, Betreff, Datum, Absender, Kanal und „Für“ wie bisher.
      const abgetrennt = rest.length ? await this.legeAbgetrenntAn(post, typ, rest, von, {
        text: t(x.neu ? 'meldungen.dienst.abgetrennt-aus' : 'meldungen.dienst.abgetrennt-aus-uebernommen', { anzahl: rest.length, betreff, typ: zielTyp.name, zielTitel }),
        ziel: ziel.id, zielTyp: zielTyp.id,
      }) : undefined;
      // Stand „Zugeordnet“: erledigt die Aufgabe „Post für dich“ und Aufgaben mit Anlass „Post“; die Post verweist auf die Mappe.
      const bezug = [...new Set([...alsListe(post.werte.bezug), ziel.id, ...(abgetrennt ? [abgetrennt.id] : [])])];
      await this.schreibeSystemMappe(typ, post.id, { bezug, stand: POST_STAND.zugeordnet }, von);
      await this.postAufgaben(post.id, von);
      // Alles, was mit der Post passiert ist, steht jetzt bei der Mappe.
      const mit = await this.repo.uebertrageAnMappe(post.id, ziel.id);
      const n = dokumente.length;
      const doks = n ? t('meldungen.dienst.mit-dokumenten-ins-register', { anzahl: n, wert: '', name: reg!.name }) : '';
      const abg = abgetrennt ? t('meldungen.dienst.abgetrennt-als-neue-post', { anzahl: rest.length }) : '';
      await this.notiere(ziel.id, von, 'zugeordnet', {
        text: t(x.neu ? 'meldungen.dienst.aus-post-angelegt' : 'meldungen.dienst.aus-post-uebernommen', { betreff, doks, abg }), post: post.id, postTyp: typ.id, dokumente: n, aufgeloest: true,
        ...(abgetrennt ? { abgetrennt: abgetrennt.id } : {}),
      });
      await this.notiere(post.id, von, 'zugeordnet', { text: t('meldungen.dienst.aufgeloest-in', { typ: zielTyp.name, zielTitel }), ziel: ziel.id, zielTyp: zielTyp.id, aufgeloest: true });
      await this.beruehre(ziel.id, zielTyp, von);
      const vorher = (await this.repo.holeMappe(post.id))!;
      // Löschprotokoll (#470): Weg „aufgelöst“, als Grund nur Mappentyp und Id der Mappe – keine Titel.
      await this.loescheMappe(post.id, von, undefined, { weg: 'aufgeloest', ausloeser: x.quelle, text: t('meldungen.dienst.aufgeloest-grund', { typ: zielTyp.name, id: ziel.id }) });
      return { vorher, abgetrennt, mit };
    });
    const papierkorb = (await this.papierkorbTage()) > 0;
    protokoll.modul('ablage').info('Post aufgelöst', { post: post.id, ziel: ziel.id, dokumente: dokumente.length, abgetrennt: erg.abgetrennt?.id, papierkorb, ...erg.mit });
    return {
      post: erg.vorher, ziel: (await this.repo.holeMappe(ziel.id))!, aufgeloest: true as const, papierkorb,
      ...(erg.abgetrennt ? { abgetrennt: (await this.repo.holeMappe(erg.abgetrennt.id))! } : {}),
    };
  }

  /**
   * Abgetrennter Teil einer Post (#936, #934): neue Post in „Neue Post“ mit Betreff „… (abgetrennt)“, Datum, Absender,
   * Kanal und „Für“ wie bisher; die Dokumente wandern dorthin, ihre Historie nennt die Herkunft.
   */
  private async legeAbgetrenntAn(post: Mappe, typ: Mappentyp, dokumente: Dokument[], von: string | null, herkunft: { text: string } & Record<string, unknown>): Promise<Mappe> {
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const neu = await this.legePostAn({
      betreff: t('meldungen.dienst.abgetrennt-betreff', { betreff }), datum: post.werte.datum, absender: post.werte.absender ?? '', kanal: auswahlText(post.werte.kanal),
      fuer: alsListe(post.werte.fuer)[0] ?? null,
    }, { id: von, name: '' }, undefined, undefined, undefined, undefined, post.werte);
    for (const d of dokumente) await this.repo.verschiebeDokument(d.id, neu.id, d.registerKey);
    await this.notiere(neu.id, von, 'post_geteilt', { ...herkunft, post: post.id, postTyp: typ.id, dokumente: dokumente.length });
    await this.beruehre(neu.id, typ, von);
    return neu;
  }

  /**
   * „Ab hier abtrennen“ (#934): Passt ein Folgedokument nicht zur Mappe, kommen die gewählten Dokumente als neue Post
   * nach „Neue Post“ – mit Verweis auf die Herkunft in ihrer Historie. Die Post behält die übrigen (mindestens eins).
   * Braucht Bearbeiten an der Post und das Recht, Post anzulegen.
   */
  async trennePostAb(postId: string, eingabe: unknown, von: string | null, z?: Zugriff) {
    const post = z ? await this.pruefeRecht(z, postId, 'U') : await this.repo.holeMappe(postId);
    if (!post) throw new Fachfehler(404, t('meldungen.dienst.diese-post-gibt-es'));
    const typ = await this.repo.holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(422, t('meldungen.dienst.abtrennen-nur-post'));
    if (istVersendet(post.werte)) throw new Fachfehler(422, t('meldungen.dienst.abtrennen-versendet'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const alle = await this.repo.listeDokumente(postId);
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : [];
    const weg = ids.map((id) => alle.find((d) => d.id === id));
    if (!ids.length || weg.some((d) => !d)) throw new Fachfehler(422, t('meldungen.dienst.ein-ausgewaehltes-dokument-gehoert-3'));
    if (weg.length >= alle.length) throw new Fachfehler(422, t('meldungen.dienst.abtrennen-eins-bleibt'));
    if (!darfPostAnlegen(typ)) throw new Fachfehler(403, t('meldungen.dienst.post-laesst-sich-nicht'));
    if (z && !z.admin) {
      const jetzt = new Date().toISOString();
      const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte: { ...post.werte, stand: POST_STAND.neu, bezug: null }, erstellt: jetzt, erstelltVon: z.ich.id, geaendert: jetzt, geaendertVon: z.ich.id };
      if (!(await this.rechteAn(z, entwurf, true)).C) throw new Fachfehler(403, t('meldungen.dienst.post-anlegen-darfst-du'));
    }
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const neu = await this.inTransaktion(async () => {
      const n = await this.legeAbgetrenntAn(post, typ, weg as Dokument[], von, { text: t('meldungen.dienst.abgetrennt-von', { anzahl: weg.length, betreff }) });
      await this.notiere(post.id, von, 'post_geteilt', { text: t('meldungen.dienst.abgetrennt-nach', { anzahl: weg.length, betreff: auswahlText(n.werte.betreff) }), abgetrennt: n.id, postTyp: typ.id, dokumente: weg.length });
      await this.beruehre(post.id, typ, von);
      return n;
    });
    protokoll.modul('ablage').info('Post abgetrennt', { post: post.id, neu: neu.id, dokumente: weg.length });
    return { post: (await this.repo.holeMappe(post.id))!, neu: (await this.repo.holeMappe(neu.id))! };
  }

  /** Mappentypen mit „Post automatisch zuordnen“ (#337); Archivmodus- und Systemtypen nie (dort nur mit Bestätigung). */
  private async autoTypen(): Promise<Set<string>> {
    const e = await this.typErkennungen();
    return new Set((await this.repo.listeTypen()).filter((t) => e[t.id]?.auto && !t.archiv && !t.system).map((t) => t.id));
  }

  /**
   * Erkannte Post automatisch zuordnen (#337), wenn die Erkennung sicher ist (siehe sichereZuordnung) und der
   * Zieltyp das erlaubt (Standard aus). Nie: neue Mappen anlegen, Post ohne Leserecht des Empfängers zuordnen,
   * Archivmodus-Typen. Danach eine Aufgabe „Automatisch zugeordnet – bitte prüfen“ an den Empfänger (Feld „Für“,
   * sonst wer die Post ins DMS gebracht hat), mit Rückgängig. Je Post höchstens einmal.
   */
  async automatischZuordnen(postId: string, e: PostErkennung): Promise<{ ziel: string } | { nicht: string }> {
    const log = protokoll.modul('ablage');
    if (e.auto) return { nicht: t('meldungen.dienst.schon-einmal-automatisch-zugeordnet') };
    const autoTypen = await this.autoTypen();
    if (!autoTypen.size) return { nicht: t('meldungen.dienst.bei-keinem-mappentyp-eingeschaltet') };
    const post = await this.repo.holeMappe(postId);
    const typ = post && await this.repo.holeTyp(post.typId);
    if (!post || typ?.system !== 'post') return { nicht: t('meldungen.dienst.keine-post') };
    if (auswahlText(post.werte.stand) !== POST_STAND.neu || auswahlText(post.werte.richtung) === POST_RICHTUNG.ausgehend) return { nicht: t('meldungen.dienst.nicht-neu-oder-ausgehend') };
    const s = sichereZuordnung(e, autoTypen);
    const nicht = (grund: string) => { log.info('Post nicht automatisch zugeordnet', { post: postId, grund }); return { nicht: grund }; };
    if (!s.ziel) return nicht(s.grund);
    const empfaenger = alsListe(post.werte.fuer)[0] ?? post.erstelltVon;
    if (!empfaenger) return nicht(t('meldungen.dienst.niemand-der-es-pruefen'));
    if (!(await this.sichtbarFuer(empfaenger, [s.ziel.mappeId])).has(s.ziel.mappeId)) return nicht(t('meldungen.dienst.der-empfaenger-darf-die'));
    const ziel = await this.repo.holeMappe(s.ziel.mappeId);
    const zielTyp = ziel && await this.repo.holeTyp(ziel.typId);
    if (!ziel || !zielTyp || zielTyp.archiv) return nicht(t('meldungen.dienst.zielmappe-fehlt-oder-ist'));
    const dokumente = await this.repo.listeDokumente(post.id);
    if (dokumente.length && !zielTyp.register.some((r) => r.art === 'dokumente')) return nicht(t('meldungen.dienst.zielmappe-hat-kein'));
    const absender = (await this.repo.bezuege([e.eindeutig!])).get(e.eindeutig!)?.titel ?? '';
    const grund = s.grund.replace('Absender eindeutig', `Absender „${absender}“ eindeutig`);
    const zielTitel = await this.titel(ziel);
    let aufgabe: Aufgabe | null = null;
    await this.inTransaktion(async () => {
      await this.ordneZu(post.id, { ziel: ziel.id }, null, undefined, { grund });
      aufgabe = await this.neueAufgabe({
        id: randomUUID(), mappeId: post.id, empfaengerId: empfaenger, art: 'zugeordnet', text: t('meldungen.dienst.automatisch-zugeordnet-zu-bitte', { zielTitel }), feldKey: `auto:${ziel.id}`,
        erstellt: new Date().toISOString(), erstelltVon: null, erledigt: null, erledigtVon: null,
      });
      aufgabe = await this.leiteUm(aufgabe);
      await this.repo.erkennungSchreibe(post.id, { ...e, auto: { ziel: ziel.id, zeit: new Date().toISOString(), grund, dokumente: dokumente.map((d) => ({ id: d.id, register: d.registerKey })), aufgabe: aufgabe.id } }, e.eindeutig);
    });
    log.info('Post automatisch zugeordnet', { post: post.id, ziel: ziel.id, empfaenger, dokumente: dokumente.length });
    return { ziel: ziel.id };
  }

  /**
   * Rückgängig aus der Aufgabe „Automatisch zugeordnet – bitte prüfen“ (#337): Dokumente zurück in die Post (in ihr
   * altes Register), Verweis weg, Stand wieder „Neu“ (wenn sie sonst nirgends zugeordnet ist), Aufgabe erledigt.
   * Danach ordnet die Erkennung diese Post nie wieder von selbst zu.
   */
  async automatikRueckgaengig(aufgabeId: string, ich: { id: string; rolle: string }, z?: Zugriff) {
    const a = await this.eigeneAufgabe(aufgabeId, ich);
    if (a.art !== 'zugeordnet' || a.erledigt) throw new Fachfehler(409, t('meldungen.dienst.diese-aufgabe-gehoert-zu'));
    const post = await this.pruefeRecht(z, a.mappeId, 'U');
    const typ = (await this.repo.holeTyp(post.typId))!;
    const gespeichert = (await this.repo.erkennungLies(post.id))?.ergebnis as PostErkennung | undefined;
    const auto = gespeichert?.auto;
    if (!gespeichert || !auto || auto.rueckgaengig) throw new Fachfehler(409, t('meldungen.dienst.diese-automatische-zuordnung-ist'));
    const ziel = await this.repo.holeMappe(auto.ziel);
    let zurueck = 0;
    await this.inTransaktion(async () => {
      for (const x of auto.dokumente) {
        const d = await this.repo.holeDokument(x.id);
        if (!d || d.mappeId !== auto.ziel) continue;
        const reg = typ.register.find((r) => r.key === x.register && r.art === 'dokumente') ?? typ.register.find((r) => r.art === 'dokumente');
        if (!reg) continue;
        await this.repo.verschiebeDokument(d.id, post.id, reg.key);
        zurueck++;
      }
      const bezug = alsListe(post.werte.bezug).filter((id) => id !== auto.ziel);
      await this.schreibeSystemMappe(typ, post.id, { bezug, stand: bezug.length ? post.werte.stand : POST_STAND.neu }, ich.id);
      const zielTitel = ziel ? await this.titel(ziel) : t('meldungen.dienst.eine-geloeschte-mappe');
      const doks = zurueck ? t('meldungen.dienst.dokumente-zurueck-in-der', { anzahl: zurueck }) : '';
      await this.notiere(post.id, ich.id, 'zugeordnet', { text: t('meldungen.dienst.automatische-zuordnung-zu', { zielTitel, doks }), ziel: auto.ziel, rueckgaengig: true, dokumente: zurueck });
      if (ziel) await this.notiere(ziel.id, ich.id, 'zugeordnet', { text: t('meldungen.dienst.automatische-zuordnung-der-post', { wert: auswahlText(post.werte.betreff) || t('meldungen.dienst.post'), doks }), post: post.id, rueckgaengig: true, dokumente: zurueck });
      await this.repo.erledigeAufgabe(a.id, ich.id);
      await this.repo.erkennungSchreibe(post.id, { ...gespeichert, auto: { ...auto, rueckgaengig: { zeit: new Date().toISOString(), von: ich.id } } }, gespeichert.eindeutig);
      await this.postAufgaben(post.id, ich.id);
    });
    protokoll.modul('ablage').info('Automatische Zuordnung rückgängig gemacht', { post: post.id, ziel: auto.ziel, dokumente: zurueck });
    return { post: (await this.repo.holeMappe(post.id))!, dokumente: zurueck };
  }

  /**
   * „Für“ (#192): Solange Post neu ist und jemandem gilt, hat dieser eine Aufgabe „Neue Post“ im Eingang
   * (bei Abwesenheit sein Vertreter). Zugeordnet, erledigt oder an jemand anderen → die Aufgabe ist erledigt.
   */
  private async postAufgaben(mappeId: string, von: string | null) {
    const m = await this.repo.holeMappe(mappeId);
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).filter((a) => a.art === 'post');
    const fuer = m && auswahlText(m.werte.stand) === POST_STAND.neu ? alsListe(m.werte.fuer)[0] ?? null : null;
    const schluessel = fuer ? `fuer:${fuer}` : null;
    for (const a of offen) if (a.feldKey !== schluessel) await this.repo.erledigeAufgabe(a.id, von);
    // Aufgaben mit Anlass „Post“ (#724, z. B. aus „Wenn neue Post“): erledigt, sobald die Post nicht mehr neu ist.
    if (m && auswahlText(m.werte.stand) !== POST_STAND.neu) await this.erledigeNachAnlass(mappeId, (x) => x.art === 'post', t('meldungen.dienst.post-zugeordnet-2'));
    if (!fuer || offen.some((a) => a.feldKey === schluessel)) return;
    // Aufgaben gehen an Konten; ohne Kontenverwaltung (Tests) genügt der Verweis.
    if (this.konten?.benutzer && !(await this.konten.benutzer()).some((b) => b.id === fuer)) return;
    const a = await this.neueAufgabe({
      id: randomUUID(), mappeId, empfaengerId: fuer, art: 'post', text: t('meldungen.dienst.post-fuer-dich'), feldKey: schluessel,
      erstellt: new Date().toISOString(), erstelltVon: von, erledigt: null, erledigtVon: null,
    });
    await this.leiteUm(a);
  }


  /** Schreibt eine Mappe, die das System pflegt – ohne die Sperren der Ablage; Titel und Passung wie sonst. */
  private async schreibeSystemMappe(typ: Mappentyp, id: string, eingabe: Werte, von: string | null, kennung: string | null = null): Promise<Mappe> {
    const alt = await this.repo.holeMappe(id);
    const werte = bereinigeWerte(typ, eingabe, alt?.werte);
    if (alt && JSON.stringify(alt.werte) === JSON.stringify(werte)) return alt;
    const aenderungen = await this.aenderungen(typ, alt?.werte ?? {}, werte);
    // Feldweise (#609): Felder, die inzwischen ein Mensch geändert hat, bleiben.
    const neu = alt ? await this.repo.aendereMappe(id, werte, [], von, { basis: alt.werte, verweise: (w) => verweiseVon(typ, w) }) : undefined;
    if (!alt) await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), von, false, kennung);
    if (aenderungen.length) await this.notiere(id, von, alt ? 'geaendert' : 'angelegt', { aenderungen, ...(neu ? { stand: neu.geaendert } : {}) });
    await this.meldeVerknuepft(typ, id, alt?.werte ?? {}, werte, von);
    if (alt) await this.passungsAufgaben([{ id, problem: null }]);
    await this.aktualisiereTitel([id]);
    // Hat der Administrator den Typ um Pflichtfelder erweitert, landet die Mappe im Eingang.
    await this.passungFuer(typ, [id]);
    return (await this.repo.holeMappe(id))!;
  }

  /** Mappe eines Benutzers anlegen oder nachziehen. Weitere Rollen bleiben, die Systemrolle folgt dem Konto. */
  async spiegleBenutzer(b: Benutzer, von: string | null = null, abwesenheit?: BenutzerGespiegelt['abwesenheit']) {
    // Liegt die Mappe im Papierkorb, bleibt sie dort (der Benutzer ist bis zum Leeren deaktiviert).
    if (await this.repo.holeAusPapierkorb(b.id)) return;
    const { benutzer: typ, systemrollen } = await this.kern.system();
    const alt = await this.repo.holeMappe(b.id);
    // Neuer Benutzer (#506): Vorgabe „Favoriten benachrichtigen“ aus der Werkbank – nur, wenn sie aus ist.
    if (!alt && b.art !== 'dienst' && !(await this.favoritenFreigabe()).vorgabe) await this.konten?.setzeEinstellung?.(b.id, 'favoriten_benachrichtigen', false);
    // #719: Der erste Mensch ohne Admin-Rechte bekommt die Aufgaben ohne Empfänger, bis die Werkbank anders wählt.
    if (!alt) await this.vorgabeAufgabenEmpfaenger(b);
    const system = new Set(systemrollen.values());
    const weitere = alt ? alsListe(alt.werte.rollen).filter((r) => !system.has(r)) : [];
    const ab = b.abwesenheit;
    // In einer Transaktion (#962): Benutzer-Mappe, Ereignis und die sofortigen Empfänger (Abwesenheit) ganz oder gar nicht.
    await this.inEinemZug(async () => {
      // Ereigniskatalog (#670): Benutzer deaktiviert bzw. wieder aktiviert (die Mappe folgt dem Konto).
      if (alt && alt.werte.aktiv !== b.aktiv) await this.ereignis(b.aktiv ? 'benutzer.aktiviert' : 'benutzer.deaktiviert', { benutzer: b.id }, von);
      // Abwesenheit (#78): „abwesend“ = wirkt heute; Zeitraum nur, solange sie an ist; der Vertreter auch nach dem Deaktivieren.
      await this.schreibeSystemMappe(typ, b.id, {
        ...(alt?.werte ?? {}),
        // Systemrolle ist für jeden Menschen „Mitglied“ (#818: die Systemrolle „Administrator“ ist entfallen).
        name: b.name || b.email, email: b.email, rollen: [systemrollen.get('mitglied')!, ...weitere], aktiv: b.aktiv,
        abwesend: abwesenheitWirkt(ab, heuteIn()),
        abwesend_von: ab?.an ? ab.von : null, abwesend_bis: ab?.an ? ab.bis : null,
        vertreter: ab?.vertreterId && (ab.an || !b.aktiv) ? ab.vertreterId : null,
      }, von);
      await this.kern.anlaesse.benutzerGespiegelt.melde({ benutzer: b, von, ...(abwesenheit ? { abwesenheit } : {}) });
    });
  }

  /** Beim Start: alle Benutzer haben ihre Mappe, und sie stimmt mit dem Konto überein. */
  async gleicheBenutzerAb(liste: Benutzer[], fortschritt: (fertig: number, gesamt: number) => void = () => {}) {
    await this.sichereSystem();
    // Fortschritt für die Startseite (#802).
    for (const [i, b] of liste.entries()) { fortschritt(i, liste.length); await this.spiegleBenutzer(b); }
  }

  /** Prüft eine Auswahl weiterer Rollen, bevor etwas geändert wird; liefert die bereinigten Ids. */
  async pruefeRollen(eingabe: unknown): Promise<string[]> {
    if (!Array.isArray(eingabe)) throw new Fachfehler(422, t('meldungen.dienst.rollen-als-liste-angeben'));
    const ids = [...new Set(eingabe.map(String))];
    const { rolle, systemrollen, kontorollen } = await this.kern.system();
    const typVon = await this.repo.typenVon(ids.filter(istUuid));
    if (ids.some((id) => typVon.get(id) !== rolle.id)) throw new Fachfehler(422, t('meldungen.dienst.mindestens-eine-dieser-rollen'));
    const system = new Set(systemrollen.values());
    if (ids.some((id) => system.has(id))) throw new Fachfehler(422, t('meldungen.dienst.die-systemrolle-mitglied-hat'));
    if (ids.some((id) => [...kontorollen.values()].includes(id))) throw new Fachfehler(422, t('konten.fehler.kontorolle'));
    return ids;
  }

  /** Weitere (fachliche) Rollen eines Benutzers setzen – nur aus der Benutzerverwaltung. */
  async setzeRollen(benutzerId: string, eingabe: unknown, von: string | null = null) {
    const ids = await this.pruefeRollen(eingabe);
    const { benutzer: typ, systemrollen } = await this.kern.system();
    const m = await this.repo.holeMappe(benutzerId);
    if (!m || m.typId !== typ.id) throw new Fachfehler(404, t('meldungen.dienst.diesen-benutzer-gibt-es'));
    const system = new Set(systemrollen.values());
    const behalten = alsListe(m.werte.rollen).filter((r) => system.has(r));
    await this.schreibeSystemMappe(typ, benutzerId, { rollen: [...behalten, ...ids] }, von);
  }

  /** Alle Rollen für die Auswahl in der Benutzerverwaltung; Systemrollen zuerst. */
  async listeRollen(mitKonten = false) {
    const { rolle, kontorollen } = await this.kern.system();
    const konto = new Set(kontorollen.values());
    return (await this.repo.listeMappen(rolle.id))
      // Systemkonto und Paket (#673) vergibt niemand an Menschen – in Benutzerverwaltung und Freigaben nicht zur Wahl.
      .filter((m) => mitKonten || !konto.has(m.id))
      .map((m) => ({ id: m.id, name: m.titel || String(m.werte.name ?? ''), system: !!m.systemKennung, ...(konto.has(m.id) ? { konto: true } : {}) }))
      .sort((a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name, 'de'));
  }

  /**
   * Werkbank → Benutzer, Abschnitt „Systemkonten“ (#673): das Systemkonto „Automatisierung“ und die Dienstkonten der
   * Pakete mit ihrer Systemrolle; je Konto, welche Automatisierungen es ausführt (kommt mit #674 über `automatisierungenVon`).
   */
  async systemkontenUebersicht(system: Benutzer[], dienst: Benutzer[]): Promise<SystemkontoEintrag[]> {
    const pakete = new Map((await this.repo.listePakete()).map((p) => [p.id, p]));
    const eintrag = async (b: Benutzer, rolle: Kontorolle): Promise<SystemkontoEintrag> => {
      const paket = b.paketId ? pakete.get(b.paketId) ?? null : undefined;
      const automatisierungen = (await this.automatisierungenVon?.(b.id)) ?? [];
      const a = systemkontoAuffaellig({ aktiv: b.aktiv, rolle, paket: paket === undefined ? undefined : paket ? paket.name : null, automatisierungen, rechte: paket?.laeufer });
      return {
        id: b.id, name: b.name, rolle, aktiv: b.aktiv,
        ...(b.systemkonto ? { systemkonto: b.systemkonto } : {}),
        ...(b.paketId ? { paketId: b.paketId, paket: paket?.name ?? null } : {}),
        automatisierungen,
        ...(a.fehler ? { fehler: a.fehler } : {}), ...(a.weitreichend ? { weitreichend: true } : {}),
      };
    };
    return [...await Promise.all(system.map((b) => eintrag(b, 'systemkonto'))), ...await Promise.all(dienst.map((b) => eintrag(b, 'paket')))];
  }
  /** Systemkonten des DMS (#673), vom Start gesetzt (Konten legen sie bei Bedarf an). */
  systemkonten?: (kennung: Systemkonto) => Promise<Benutzer>;
  /** Zugriff eines Systemkontos (#673), z. B. für Automatisierungen: Rechte aus den Regeln für die Rolle „Systemkonto“. */
  async systemZugriff(kennung: Systemkonto = 'automatisierung'): Promise<Zugriff> {
    if (!this.systemkonten) throw new Fachfehler(500, t('meldungen.dienst.systemkonten-sind-nicht-eingerichtet'));
    return this.zugriff(await this.systemkonten(kennung));
  }
  /** Automatisierungen, die ein Konto ausführt (#674 setzt das); bis dahin keine. */
  automatisierungenVon?: (kontoId: string) => Promise<Array<{ id: string; name: string; angehalten?: boolean }>>;
  /** Tägliche Zusammenfassung an einen Benutzer (#678, Dann-Karte); setzt der Server aus der Aufgaben-Mail. */
  zusammenfassungAn?: (benutzerId: string, trocken: boolean) => Promise<{ gesendet: boolean; grund: string }>;
  /** Anmeldeschutz melden (#678, Dann-Karte): Sammelmeldung bzw. Kontosperre; setzt der Server aus dem Anmeldeschutz. */
  anmeldeschutzMelden?: (was: 'sammel' | 'konto', daten: Record<string, unknown>, trocken: boolean) => Promise<{ gesendet: boolean; grund: string }>;
  /** Erinnerungen am Feld als Automatisierungen übernehmen (#712); setzt der Baustein Automatisierungen. */
  fristenUebernehmen?: () => Promise<number>;
  /** Mitgelieferte Automatisierungen eines Pakets anlegen bzw. aktualisieren (#712); setzt der Baustein Automatisierungen. */
  paketAutomatisierungen?: (p: InstalliertesPaket, liste: Array<{ schluessel: string; name: string; beschreibung: string; wenn: Record<string, unknown>; und?: Record<string, unknown>; dann: unknown[] }>, ein?: string[]) => Promise<number>;
  /** Automatisierungen mit Änderungsverlauf für den Vollexport (#674 setzt das). */
  automatisierungenExport?: () => Promise<unknown[]>;

  /* ---------- Hilfen für Automatisierungen (#674) ---------- */

  /** Was eine Automatisierung prüfen muss: Mappentypen, Ansichten, Benutzer (ohne Systemkonten), Rollen. */
  async automatisierungKontext() {
    const { benutzer, kontorollen } = await this.kern.system();
    const konto = new Set(kontorollen.values());
    const [typen, sichten, rollen, leute] = await Promise.all([this.repo.listeTypen(), this.repo.listeSichten(), this.listeRollen(), this.repo.listeMappen(benutzer.id)]);
    return {
      typen, sichten: sichten.map((x) => ({ id: x.id, name: x.name, typen: x.typen })), rollen: rollen.map((r) => ({ id: r.id, name: r.name })),
      benutzer: leute.filter((m) => !alsListe(m.werte.rollen).some((r) => konto.has(r)) && !this.paketKonten.has(m.id)).map((m) => ({ id: m.id, name: m.titel || String(m.werte.name ?? ''), aktiv: m.werte.aktiv !== false })),
    };
  }

  /** Aktive Benutzer, die eine Rolle haben (Empfänger „Rolle“ einer Automatisierung). */
  async mitgliederDerRolle(rolleId: string): Promise<string[]> {
    const { benutzer } = await this.kern.system();
    return (await this.repo.listeMappen(benutzer.id)).filter((m) => m.werte.aktiv !== false && alsListe(m.werte.rollen).includes(rolleId)).map((m) => m.id);
  }

  /**
   * Teile einer Und-Bedingung für eine Mappe auswerten (#674): Bedingungen aus dem Baukasten der Ansichten,
   * „in Ansicht“ und „in den Favoriten von“. `ich` ist der Benutzer, für den „ich“ gilt (das Systemkonto).
   */
  async trifftTeile(mappeId: string, teile: Array<{ art: 'bedingungen'; bedingungen: Bedingung[] } | { art: 'sicht'; sicht: string } | { art: 'favorit'; benutzer: string[] }>, ich: string): Promise<boolean[]> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) return teile.map(() => false);
    const typ = await this.repo.holeTyp(m.typId);
    if (!typ) return teile.map(() => false);
    const a = await this.aufloesung(ich);
    let sichten: Sicht[] | null = null;
    const erg: boolean[] = [];
    for (const t of teile) {
      let klauseln: Klausel[];
      if (t.art === 'bedingungen') klauseln = [{ typen: [typ.id], filter: filterFuer({ bedingungen: t.bedingungen }, [typ], a) }];
      else if (t.art === 'sicht') { sichten ??= await this.repo.listeSichten(); klauseln = sichten.some((x) => x.id === t.sicht) ? klauselnFuer(sichten, t.sicht, new Map([[typ.id, typ]]), a) : []; }
      else klauseln = t.benutzer.map((b) => ({ typen: [typ.id], filter: [{ art: 'favorit' as const, benutzer: b }] }));
      erg.push(klauseln.length > 0 && (await this.repo.inKlauseln([m.id], klauseln)).has(m.id));
    }
    return erg;
  }

  /** Titel von Mappen, die `z` lesen darf (Platzhalter in Automatisierungen, #674); andere fehlen. */
  async lesbareTitel(z: Zugriff, ids: string[]): Promise<Map<string, string>> {
    const ok = await this.lesbare(z, ids);
    const t = await this.repo.titelVon([...ok]);
    return new Map([...t].filter(([k]) => ok.has(k)));
  }

  /**
   * Wer eine Aufgabe für den Benutzer `id` wirklich bekommt (#724, gemeinsamer Weg für Kern und Automatisierungen):
   * er selbst – abwesend oder deaktiviert sein Vertreter (`empfaengerAufloesen`); ist niemand Aktives erreichbar, die
   * Administratoren (null). Wirft nur, wenn `id` kein Benutzer ist; ein deaktivierter Empfänger bricht nichts ab.
   */
  async aufgabenEmpfaenger(id: string): Promise<{ an: string | null; ueber: string[] }> {
    const { benutzer } = await this.kern.system();
    const m = istUuid(id) ? await this.repo.holeMappe(id) : undefined;
    if (!m || m.typId !== benutzer.id) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-benutzer-als'));
    const { ziel, abwesende } = await this.empfaengerAufloesen(id);
    const aktiv = async (x: string | null) => !!x && (!this.konten?.benutzer ? (await this.repo.holeMappe(x))?.werte.aktiv !== false : (await this.konten.benutzer()).some((b) => b.id === x && b.aktiv));
    if (await aktiv(ziel)) return { an: ziel, ueber: abwesende };
    return { an: null, ueber: [...abwesende, ...(ziel ? [ziel] : [])] };
  }

  /**
   * Aufgabe oder Benachrichtigung aus einer Automatisierung (#676, #724) – auf demselben Weg wie die eingebauten:
   * - **Vertretung:** Ist der Empfänger abwesend oder deaktiviert, geht sie an den Vertreter (mit Eintrag in der
   *   Historie); ist niemand erreichbar, an die Administratoren. Der Lauf bricht dabei nicht ab.
   * - **Anlass:** Mit Anlass erledigt sie sich selbst, wenn er wegfällt (Datum geändert/geleert, Post zugeordnet,
   *   Abwesenheit beendet). Kommt sie von „Datum erreicht“, ist sie eine **Frist** (Art „Frist“, Feld und Datum,
   *   wiederkehrend mit Folgetermin) – dieselbe Person bekommt je Mappe, Feld und Datum nur eine (auch neben der
   *   eingebauten Erinnerung).
   * - **Text** (#795): als Funktion bekommt sie den, der die Aufgabe wirklich bekommt (nach der Vertretung), und füllt
   *   die Platzhalter mit dessen Rechten.
   * - **Ohne Leserecht** (#798): Die Aufgabe hängt trotzdem an der Mappe; der Empfänger sieht nur einen Hinweis und die
   *   Fälligkeit, der Admin den Fall in der Werkbank.
   * - Benachrichtigungen bündeln je Automatisierung, Mappe und Empfänger (eine offene, der Text wird aktualisiert).
   */
  async aufgabeAusAutomatisierung(e: { mappeId: string; empfaengerId: string; text: string | ((an: string | null) => Promise<string>); datum: string | null; von: string; buendeln: string | null; anlass: Record<string, unknown>; aufgabenAnlass?: AufgabenAnlass | null; frist?: { feld: string; datum: string } | null }): Promise<{ id: string; ohneLeserecht: boolean; vorhanden?: boolean; an: string | null }> {
    const { an, ueber } = await this.aufgabenEmpfaenger(e.empfaengerId);
    const ohneLeserecht = !!an && !(await this.sichtbarFuer(an, [e.mappeId])).has(e.mappeId);
    const text = (typeof e.text === 'string' ? e.text : await e.text(an)).slice(0, AUFGABE_MAX);
    if (e.buendeln && an) {
      const id = await this.benachrichtigeGebuendelt({ empfaengerId: an, mappeId: e.mappeId, art: 'manuell', schluessel: `auto:${e.buendeln}:${e.mappeId}`.slice(0, 120), von: e.von, text: () => text });
      if (ohneLeserecht) await this.faelleNach([e.mappeId]);
      return { id, ohneLeserecht, an };
    }
    const frist = e.frist ?? null;
    if (frist) {
      // Schon eine Frist für diese Person (eingebaut, weitergegeben oder von einer anderen Automatisierung)? Dann keine zweite.
      const schon = (await this.repo.fristAufgaben([e.mappeId])).find((x) => x.feldKey === frist.feld && x.datum === frist.datum && [an, e.empfaengerId].includes(x.empfaengerId));
      if (schon) return { id: schon.id, ohneLeserecht, vorhanden: true, an };
    }
    let a: Aufgabe;
    try {
      a = await this.neueAufgabe({
        id: randomUUID(), mappeId: e.mappeId, empfaengerId: an, art: frist ? 'frist' : 'manuell', text,
        ...(frist ? { feldKey: frist.feld, datum: frist.datum } : { datum: e.datum }),
        anlass: e.aufgabenAnlass ?? null,
        erstellt: '', erstelltVon: e.von, erledigt: null, erledigtVon: null,
      });
    } catch (x) {
      // Gleichzeitig angelegt (eindeutiger Index der Fristen): die vorhandene zählt.
      const schon = frist ? (await this.repo.fristAufgaben([e.mappeId])).find((y) => y.feldKey === frist.feld && y.datum === frist.datum && y.empfaengerId === an) : undefined;
      if (schon) return { id: schon.id, ohneLeserecht, vorhanden: true, an };
      throw x;
    }
    const weiter = ueber.length ? t('meldungen.dienst.weitergegeben-wegen-abwesenheit-von-2', { all: (await Promise.all(ueber.map((x) => this.name(x)))).join(', ') }) : '';
    await this.notiere(e.mappeId, e.von, 'aufgabe', { ...e.anlass, text: t('meldungen.dienst.fuer-2', { name: await this.name(an), weiter, text }), aufgabe: a.id, aufgabenart: a.art, fuer: an, aufgabentext: text });
    if (ohneLeserecht) await this.faelleNach([e.mappeId]);
    return { id: a.id, ohneLeserecht, an };
  }

  /** Offene Aufgaben einer Mappe, deren Anlass `passt`, als erledigt eintragen (#724: „erledigt sich selbst“). */
  private async erledigeNachAnlass(mappeId: string, passt: (x: AufgabenAnlass, a: Aufgabe) => boolean, grund: string): Promise<number> {
    let n = 0;
    for (const a of await this.repo.offeneAufgaben({ mappeIds: [mappeId] })) {
      if (!a.anlass || !passt(a.anlass, a)) continue;
      await this.repo.erledigeAufgabe(a.id, null);
      await this.notiere(mappeId, null, 'aufgabe', { text: t('meldungen.dienst.erledigt-3', { grund, text: a.text }), aufgabe: a.id, aufgabenart: a.art, fuer: a.empfaengerId, aufgabentext: a.text });
      n++;
    }
    if (n) await this.faelleNach([mappeId]);
    return n;
  }

  /** Mappen eines Typs, deren Datumsfeld genau dieses Datum hat („Datum in N Tagen“, #674). Nur Ids. */
  /** Wert eines Datumsfelds einer Mappe (#712: „Datum erreicht“ beim Speichern im Vorlauf); null ohne Datum oder bei Demo-Daten. */
  async datumVon(mappeId: string, feld: string): Promise<string | null> {
    const m = await this.repo.holeMappe(mappeId);
    const w = m?.werte[feld];
    return m && !m.demo && istDatum(w) ? w : null;
  }

  async mappenMitDatum(typId: string, feld: string, datum: string): Promise<string[]> {
    return (await this.repo.listeMappen(typId)).filter((m) => m.werte[feld] === datum && !m.demo).map((m) => m.id);
  }

  weitereRollen(): Promise<Map<string, string[]>> { return this.systemtypen.weitereRollen(); }
  entferneBenutzerMappe(id: string) { return this.systemtypen.entferneBenutzerMappe(id); }
  benutzerspiegel(): Benutzerspiegel { return this.systemtypen.benutzerspiegel(); }

  /* ---------- Papierkorb (#43) ---------- */

  /** Aufbewahrung in Tagen; 0 = kein Papierkorb (Löschen ist sofort endgültig) – Kern. */
  papierkorbTage(): Promise<number> { return this.kern.papierkorbTage(); }

  /** Aufbewahrung ändern. 0 schaltet den Papierkorb aus und leert ihn sofort. */
  async setzePapierkorbTage(eingabe: unknown, von?: string | null): Promise<{ tage: number; geleert: number }> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.der-papierkorb-ist-nicht'));
    const tage = Number(eingabe);
    if (!Number.isInteger(tage) || tage < 0 || tage > 3650) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-ganze-zahl-2'));
    await this.einstellungen.schreibe('papierkorb', { tage });
    protokoll.modul('werkbank').info(tage ? 'Aufbewahrung im Papierkorb geändert' : 'Papierkorb ausgeschaltet', { tage });
    const aus = { weg: 'ausgeschaltet' as const, kontext: await this.loeschKontext(von ?? null) };
    const geleert = tage ? await this.raeumePapierkorbAuf() : await this.leere((await this.repo.papierkorb()).map((e) => e.id), von ?? null, false, aus) + await this.leereDokumente((await this.repo.papierkorbDokumente()).map((d) => d.id), aus);
    return { tage, geleert };
  }

  /** Ablage: was ich gelöscht habe. Werkbank (alle): was alle gelöscht haben. */
  async papierkorb(ich: { id: string; rolle: string }, alle = false): Promise<Array<PapierkorbEintrag & { aufgeloestIn?: AufgeloestIn }>> {
    return this.mitAufloesung(await this.repo.papierkorb(alle && ich.rolle === 'admin' ? {} : { von: ich.id }));
  }

  /**
   * Aufgelöste Post (#936): „Aufgelöst in <Typ> <Titel>“ mit Link. `da` = die Mappe gibt es noch (sonst nur Typ und Titel,
   * soweit bekannt). Nur für Post – andere Mappen werden nie aufgelöst.
   */
  private async mitAufloesung<T extends PapierkorbEintrag>(liste: T[]): Promise<Array<T & { aufgeloestIn?: AufgeloestIn }>> {
    const postTyp = (await this.repo.listeTypen()).find((x) => x.system === 'post');
    const posten = postTyp ? liste.filter((e) => e.typId === postTyp.id).map((e) => e.id) : [];
    if (!posten.length) return liste;
    const auf = await this.repo.aufgeloesteIn(posten);
    if (!auf.size) return liste;
    const bezuege = await this.repo.bezuege([...new Set([...auf.values()].map((a) => a.ziel))]);
    return liste.map((e) => {
      const a = auf.get(e.id);
      if (!a) return e;
      const b = bezuege.get(a.ziel);
      return { ...e, aufgeloestIn: { id: a.ziel, typId: b?.typId ?? a.zielTyp, titel: b?.titel ?? '', da: !!b } };
    });
  }

  /**
   * Einzelne Dokumente im Papierkorb (#344), mit Mappe und Register zum Anzeigen.
   * mappe: „da“ (wiederherstellbar), „papierkorb“ (erst die Mappe wiederherstellen) oder „weg“.
   */
  async papierkorbDokumente(ich: { id: string; rolle: string }, alle = false): Promise<DokumentImKorb[]> {
    const liste = await this.repo.papierkorbDokumente(alle && ich.rolle === 'admin' ? {} : { von: ich.id });
    return this.mitMappe(liste);
  }

  private async mitMappe(liste: DokumentImPapierkorb[]): Promise<DokumentImKorb[]> {
    if (!liste.length) return [];
    const ids = [...new Set(liste.map((d) => d.mappeId))];
    const bezuege = await this.repo.bezuege(ids);
    const imKorb = new Map((await this.repo.papierkorb()).filter((e) => ids.includes(e.id)).map((e) => [e.id, e]));
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    return liste.map((d) => {
      const b = bezuege.get(d.mappeId);
      const k = imKorb.get(d.mappeId);
      const typId = b?.typId ?? k?.typId ?? '';
      const typ = typen.get(typId);
      return {
        ...d, art: 'dokument' as const, typId, mappeTitel: b?.titel ?? k?.titel ?? '',
        register: typ?.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey,
        mappe: b ? 'da' as const : k ? 'papierkorb' as const : 'weg' as const,
      };
    });
  }

  private async dokEintrag(id: string, ich: { id: string; rolle: string }, alle: boolean) {
    const e = await this.repo.holeDokumentAusPapierkorb(id);
    if (!e || !(e.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-liegt-nicht'));
    return e;
  }

  /** Dokument zurück in sein Register (#344). Rechte: wer es gelöscht hat (und die Mappe noch bearbeiten darf) oder ein Administrator. */
  async stelleDokumentWiederHer(id: string, ich: { id: string; rolle: string }, z: Zugriff | undefined, alle = false, quelle?: Ausloeser) {
    const e = await this.dokEintrag(id, ich, alle);
    const [x] = await this.mitMappe([e]);
    if (x.mappe === 'papierkorb') throw new Fachfehler(409, t('meldungen.dienst.die-mappe-liegt-selbst', { wert: x.mappeTitel || t('meldungen.dienst.ohne-titel-2') }));
    if (x.mappe === 'weg') throw new Fachfehler(409, t('meldungen.dienst.die-mappe-dieses-dokuments'));
    if (!(alle && ich.rolle === 'admin')) await this.pruefeRecht(z, e.mappeId, 'U');
    const typ = (await this.repo.holeTyp(x.typId))!;
    if (!typ.register.some((r) => r.key === e.registerKey && r.art === 'dokumente')) throw new Fachfehler(409, t('meldungen.dienst.das-register-gibt-es', { register: x.register }));
    const inhalt = (await this.repo.papierkorbDokumentInhalt([id]))[0];
    await this.repo.stelleDokumentWiederHer(id);
    await this.notiere(e.mappeId, ich.id, 'dokument_wiederhergestellt', { dokument: e.name, register: x.register });
    if (inhalt) await this.protokolliere(this.dokEintraege(inhalt.dokumente.slice(0, 1), { ...(await this.mappenInfo([e.mappeId], new Map()))(e.mappeId, id), schritt: 'wiederhergestellt', weg: 'dokument' }),
      await this.loeschKontext(ich.id, { ausloeser: quelle }));
    await this.beruehre(e.mappeId, typ, ich.id);
    this.neueDateien([(await this.repo.holeDokument(id))!]);
    protokoll.modul('ablage').info('Dokument wiederhergestellt', { dokument: e.name, id, mappe: e.mappeId });
    return { dokument: (await this.repo.holeDokument(id))!, typId: x.typId };
  }

  /** Dokumente endgültig löschen (ohne Rechteprüfung); Archivmodus der Mappe gilt weiter. */
  private async leereDokumente(ids: string[], wie: { weg: Loeschweg; kontext?: LoeschKontext } = { weg: 'papierkorb' }): Promise<number> {
    if (!ids.length) return 0;
    const inhalt = await this.repo.papierkorbDokumentInhalt(ids);
    const dateien = await this.repo.leereDokumentPapierkorb(ids);
    for (const sha of dateien) await this.raeumeAuf(sha);
    // Löschprotokoll (#470): je Dokument und Version; Mappe, Typ und Grund vom Schritt „in den Papierkorb“.
    const frueher = await this.letzteSchritte(inhalt.map((x) => x.id));
    const mappen = await this.mappenInfo(inhalt.map((x) => x.mappeId), frueher);
    const kontext = wie.kontext ?? await this.loeschKontext(null, { ausloeser: wie.weg === 'ablauf' ? 'automatisch' : undefined });
    await this.protokolliere(inhalt.flatMap((x) => this.dokEintraege(x.dokumente, { ...mappen(x.mappeId, x.id), schritt: 'endgueltig', weg: wie.weg })), kontext, true);
    return ids.length;
  }

  async loescheDokumentEndgueltig(ids: string[], ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser): Promise<number> {
    for (const id of ids) await this.dokEintrag(id, ich, alle);
    const n = await this.leereDokumente(ids, { weg: 'papierkorb', kontext: await this.loeschKontext(ich.id, { ausloeser: quelle }) });
    if (n) protokoll.modul('ablage').info('Dokumente aus dem Papierkorb endgültig gelöscht', { anzahl: n });
    return n;
  }

  /** Eintrag, den dieser Benutzer sehen darf (eigener oder als Administrator in der Werkbank); sonst 404. */
  private async eintrag(id: string, ich: { id: string; rolle: string }, alle: boolean) {
    const e = await this.repo.holeAusPapierkorb(id);
    if (!e || !(e.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-liegt-nicht'));
    return e;
  }

  async papierkorbEintrag(id: string, ich: { id: string; rolle: string }, alle = false) { return (await this.mitAufloesung([await this.eintrag(id, ich, alle)]))[0]; }

  /**
   * Wiederherstellen. Verweise auf Mappen, die es nicht mehr gibt, und eindeutige Werte, die
   * inzwischen eine andere Mappe hat, lassen die Mappe „nicht passen“: Sie erscheint im Eingang.
   */
  async stelleWiederHer(id: string, ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser) {
    const e = await this.eintrag(id, ich, alle);
    // Aufgelöste Post (#936): Dokumente und Historie liegen in der neuen Mappe – zurück geht es nur, indem man sie löscht.
    const [mitAuf] = await this.mitAufloesung([e]);
    if (mitAuf.aufgeloestIn) throw new Fachfehler(409, t('meldungen.dienst.aufgeloest-nicht-wiederherstellen', { titel: mitAuf.aufgeloestIn.titel || t('meldungen.dienst.ohne-titel-2') }), { aufgeloestIn: mitAuf.aufgeloestIn });
    const typ = await this.repo.holeTyp(e.typId);
    if (!typ) throw new Fachfehler(409, t('meldungen.dienst.den-mappentyp-dieser-mappe'));
    const r = await this.repo.stelleWiederHer(id);
    // Beim Löschen mit verknüpften Mappen entfernte Verweise (#424) kommen mit.
    const zurueck = e.entkoppelt.length ? await this.verbindeWieder(id, e.entkoppelt, ich.id) : { wieder: 0, entfallen: 0 };
    const verweiseEntfallen = r.verweiseEntfallen + zurueck.entfallen;
    await this.notiere(id, ich.id, 'wiederhergestellt', verweiseEntfallen ? { verweiseEntfallen } : undefined);
    await this.protokolliere([this.wiederEintrag(e, typ, e.vorgang)], await this.loeschKontext(ich.id, { ausloeser: quelle }));
    await this.aktualisiereTitel([id]);
    await this.passungFuer(typ, [id]);
    if (typ.system === 'benutzer') await this.konten?.wiederda(id, ich.id);
    const m = (await this.repo.holeMappe(id))!;
    protokoll.modul('ablage').info('Mappe wiederhergestellt', { typ: typ.name, titel: m.titel, id, passt: m.passt !== false || undefined, verweiseEntfallen: verweiseEntfallen || undefined });
    return { mappe: m, verweiseEntfallen };
  }

  /** Endgültig löschen (ohne Rechteprüfung): Dateien, an denen nichts mehr hängt, und Konten von Benutzer-Mappen. */
  private async leere(ids: string[], von: string | null = null, streng = false, wie: { weg: Loeschweg; kontext?: LoeschKontext } = { weg: 'papierkorb' }): Promise<number> {
    // Archivmodus (#212): Mappen in der Frist bleiben im Papierkorb (lagen dort schon vor dem Einschalten).
    if (ids.length) {
      const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
      const korb = (await this.repo.papierkorb()).filter((e) => ids.includes(e.id));
      const geschuetzt = korb.filter((e) => inFrist(aufbewahrenBis(typen.get(e.typId)?.archiv, e)));
      if (geschuetzt.length && streng) throw new Fachfehler(409, t('meldungen.dienst.aufbewahrungspflicht-bis-vorher-2', { datumText: datumText(aufbewahrenBis(typen.get(geschuetzt[0].typId)?.archiv, geschuetzt[0])!), wert: geschuetzt[0].titel || t('meldungen.dienst.die-mappe') }));
      ids = ids.filter((id) => !geschuetzt.some((e) => e.id === id));
    }
    if (!ids.length) return 0;
    await this.repo.historieSchreibe(ids.map((mappeId) => ({ mappeId, benutzerId: von, art: 'endgueltig' as const })));
    {
      const typVon = new Map((await this.repo.papierkorb()).filter((e) => ids.includes(e.id)).map((e) => [e.id, e.typId] as const));
      for (const id of ids) await this.ereignis('mappe.endgueltig_geloescht', { mappe: id, typ: typVon.get(id) ?? null }, von);
    }
    const benutzerTyp = (await this.repo.listeTypen()).find((t) => t.system === 'benutzer');
    const benutzer = benutzerTyp ? (await this.repo.papierkorb({ typId: benutzerTyp.id })).filter((e) => ids.includes(e.id)).map((e) => e.id) : [];
    // Löschprotokoll (#470): Inhalt vor dem Leeren; Grund vom Schritt „in den Papierkorb“.
    const inhalt = await this.repo.papierkorbInhalt(ids);
    const dateien = await this.repo.leerePapierkorb(ids);
    for (const sha of dateien) await this.raeumeAuf(sha);
    const kontext = wie.kontext ?? await this.loeschKontext(von, { ausloeser: wie.weg === 'ablauf' ? 'automatisch' : undefined });
    await this.protokolliere(this.mappenEintraege(await this.korbAlsInhalt(inhalt), { schritt: 'endgueltig', weg: wie.weg, verweise: Object.fromEntries(inhalt.map((k) => [k.id, k.entkoppelt])) }), kontext, true);
    // Einzeln gelöschte Dokumente dieser Mappen (#344) gehen mit – ohne Mappe lassen sie sich nicht mehr wiederherstellen.
    await this.leereDokumente((await this.repo.papierkorbDokumente({ mappeIds: ids })).map((d) => d.id), { weg: wie.weg, kontext });
    for (const id of benutzer) await this.konten?.endgueltig(id);
    return ids.length;
  }

  /** Einzelne Mappen endgültig löschen: eigene oder (in der Werkbank) alle. */
  async loescheEndgueltig(ids: string[], ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser): Promise<number> {
    for (const id of ids) await this.eintrag(id, ich, alle);
    const n = await this.leere(ids, ich.id, true, { weg: 'papierkorb', kontext: await this.loeschKontext(ich.id, { ausloeser: quelle }) });
    if (n) protokoll.modul('ablage').info('Aus dem Papierkorb endgültig gelöscht', { anzahl: n });
    return n;
  }

  /** Papierkorb leeren: eigener (Ablage) oder ganz (Werkbank). */
  async leerePapierkorb(ich: { id: string; rolle: string }, alle = false, wie: { weg?: 'leeren' | 'abmelden'; quelle?: Ausloeser } = {}): Promise<number> {
    const w = { weg: wie.weg ?? 'leeren' as const, kontext: await this.loeschKontext(ich.id, { ausloeser: wie.quelle }) };
    const n = await this.leere((await this.papierkorb(ich, alle)).map((e) => e.id), ich.id, false, w)
      + await this.leereDokumente((await this.repo.papierkorbDokumente(alle && ich.rolle === 'admin' ? {} : { von: ich.id })).map((d) => d.id), w);
    if (n) protokoll.modul('ablage').info(alle ? 'Papierkorb aller Benutzer geleert' : 'Papierkorb geleert', { anzahl: n });
    return n;
  }

  /** Abgelaufenes endgültig löschen; läuft stündlich. */
  async raeumePapierkorbAuf(jetzt = Date.now()): Promise<number> {
    const tage = await this.papierkorbTage();
    const vor = new Date(jetzt - tage * 24 * 60 * 60 * 1000).toISOString();
    const n = await this.leere((await this.repo.papierkorb(tage ? { vor } : {})).map((e) => e.id), null, false, { weg: 'ablauf' });
    if (n) protokoll.modul('system').info('Abgelaufene Mappen aus dem Papierkorb gelöscht', { anzahl: n, tage });
    const nd = await this.leereDokumente((await this.repo.papierkorbDokumente(tage ? { vor } : {})).map((d) => d.id), { weg: 'ablauf' });
    if (nd) protokoll.modul('system').info('Abgelaufene Dokumente aus dem Papierkorb gelöscht', { anzahl: nd, tage });
    // Historie endgültig gelöschter Mappen nach ihrer Frist (#57).
    const ht = await this.historieTage();
    const weg = await this.repo.historieAufraeumen(new Date(jetzt - ht * 24 * 60 * 60 * 1000).toISOString());
    if (weg) protokoll.modul('system').info('Historie endgültig gelöschter Mappen entfernt', { eintraege: weg, tage: ht });
    // Löschprotokoll (#470): eigene Aufbewahrung in Jahren.
    const lj = await this.loeschprotokollJahre();
    const lweg = await this.repo.loeschprotokollAufraeumen(new Date(jetzt - lj * 365.25 * 24 * 60 * 60 * 1000).toISOString());
    if (lweg) protokoll.modul('system').info('Alte Einträge des Löschprotokolls entfernt', { eintraege: lweg, jahre: lj });
    return n;
  }

  /* ---------- Löschprotokoll (#470) ---------- */

  /** Wer und warum. Ohne Benutzer: „DMS“ (automatisch) – Kern. */
  private loeschKontext(von: string | null, anlass: Anlass = {}): Promise<LoeschKontext> { return this.kern.loeschprotokoll.kontext(von, anlass); }

  /** Lebende Mappen samt Dokumenten (aller Versionen) und Notizen – für Einträge vor dem Löschen. Demo-Mappen bleiben draußen. */
  private async lebendInhalt(mappen: Mappe[]): Promise<ProtokollMappe[]> {
    const echt = mappen.filter((m) => !m.demo);
    if (!echt.length) return [];
    const ids = echt.map((m) => m.id);
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const dok = await this.dokumenteJeMappe(ids);
    const alle = [...dok.values()].flat();
    const versionen = alle.length ? await this.repo.versionenVonDokumenten(alle.map((d) => d.id)) : [];
    const notizen = await this.repo.notizenVon(ids);
    return echt.map((m) => {
      const d = dok.get(m.id) ?? [];
      const ds = new Set(d.map((x) => x.id));
      return { id: m.id, typId: m.typId, typ: typen.get(m.typId), werte: m.werte, notizen: notizen.filter((n) => n.mappeId === m.id).length,
        dokumente: [...d.map(dokInfo), ...versionen.filter((v) => ds.has(v.dokumentId)).map(versionInfo)] };
    });
  }

  private async korbAlsInhalt(liste: Awaited<ReturnType<Repo['papierkorbInhalt']>>): Promise<ProtokollMappe[]> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    return liste.filter((k) => !k.demo).map((k) => ({ id: k.id, typId: k.typId, typ: typen.get(k.typId), werte: k.werte, notizen: k.notizen, dokumente: k.dokumente, vorgang: k.vorgang }));
  }

  /** Einträge für Mappen und ihre Dokumente (Kern). */
  private mappenEintraege(liste: ProtokollMappe[], x: Parameters<Loeschprotokoll['mappenEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.mappenEintraege(liste, x); }
  private dokEintraege(liste: LoeschDokument[], x: Parameters<Loeschprotokoll['dokEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.dokEintraege(liste, x); }
  private wiederEintrag(e: PapierkorbEintrag, typ: Mappentyp | undefined, vorgang: string | null): ProtokollTeil { return this.kern.loeschprotokoll.wiederEintrag(e, typ, vorgang); }
  /** Letzter Eintrag „in den Papierkorb“ je Mappen- bzw. Dokument-Id (Kern). */
  private letzteSchritte(ids: string[]): Promise<Map<string, LoeschEintrag>> { return this.kern.loeschprotokoll.letzteSchritte(ids); }
  /** Typ, Nummer und Vorgang der Mappe eines Dokuments – lebend, im Papierkorb oder aus dem Protokoll (Kern). */
  private mappenInfo(mappeIds: string[], frueher: Map<string, LoeschEintrag>) { return this.kern.loeschprotokoll.mappenInfo(mappeIds, frueher); }
  /** Einträge ins Löschprotokoll schreiben (Kern). */
  private protokolliere(teile: ProtokollTeil[], k: LoeschKontext, nachGrund = false) { return this.kern.loeschprotokoll.schreibe(teile, k, nachGrund); }

  async loeschprotokollJahre(): Promise<number> {
    const e = this.einstellungen ? ((await this.einstellungen.lies('loeschprotokoll')) as { jahre?: number } | null) : null;
    return typeof e?.jahre === 'number' ? e.jahre : LOESCHPROTOKOLL_STANDARD_JAHRE;
  }

  async setzeLoeschprotokollJahre(eingabe: unknown, von: string): Promise<number> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const jahre = Number(eingabe);
    if (!Number.isInteger(jahre) || jahre < 1 || jahre > LOESCHPROTOKOLL_JAHRE_MAX) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-ganze-zahl-3', { LOESCHPROTOKOLL_JAHRE_MAX }));
    await this.einstellungen.schreibe('loeschprotokoll', { jahre });
    protokoll.modul('datenschutz').info('Aufbewahrung des Löschprotokolls geändert', { jahre, von });
    return jahre;
  }

  /** Ansicht (Werkbank → Datenschutz): Einträge nach Filter, neueste zuerst. */
  async loeschprotokoll(q: Record<string, unknown>) {
    const f = liesFilter(q);
    const r = await this.repo.loeschprotokoll(f);
    return { ...r, jahre: await this.loeschprotokollJahre(), max: f.max };
  }

  /** Ausgabe als CSV oder PDF (Nachweis); höchstens LOESCH_MAX × 10 Einträge. */
  async loeschprotokollAusgabe(q: Record<string, unknown>, format: 'csv' | 'pdf', x: { von: string; mandant: string; version: string }) {
    const f = { ...liesFilter(q), max: LOESCH_MAX * 10 };
    const { eintraege, gesamt } = await this.repo.loeschprotokoll(f);
    const tag = new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone() }).format(new Date());
    if (format === 'csv') { const b = csvAus(LOESCH_SPALTEN, eintraege.map(alsZeile)); return { name: t('meldungen.dienst.loeschprotokoll-csv', { tag }), mime: 'text/csv; charset=utf-8', inhalt: b }; }
    const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { timeZone: zeitzone(), dateStyle: 'short', timeStyle: 'short' });
    const filter = [f.von && `ab ${datumText(f.von)}`, f.bis && `bis ${datumText(f.bis)}`, f.typId && `Mappentyp ${eintraege.find((e) => e.typId === f.typId)?.typ ?? f.typId}`,
      f.grund && (f.grund === 'ohne' ? t('meldungen.dienst.ohne-grund') : LOESCHGRUENDE[f.grund]), f.schritt && LOESCHSCHRITTE[f.schritt], f.vorgang && `Vorgang ${f.vorgang}`, f.suche && `Suche „${f.suche}“`].filter(Boolean).join(', ');
    const b = await schriftstueckPdf({
      titel: t('meldungen.dienst.loeschprotokoll'), untertitel: x.mandant, quer: true,
      stand: t('meldungen.dienst.erstellt-am-von-ablago', { zeit: zeit(new Date().toISOString()), von: x.von, version: x.version, eintraege: eintraege.length, wert: gesamt > eintraege.length ? ` von ${gesamt}` : '', wert2: filter ? ` · Filter: ${filter}` : '' }),
      vorbemerkung: t('meldungen.dienst.nachweis-ueber-geloeschte-mappen'),
      abschnitte: [{ titel: t('meldungen.dienst.eintraege'), bloecke: [{ art: 'tabelle', breiten: [0.9, 0.85, 0.95, 0.8, 1.6, 2.1, 0.9, 1.0, 1.1], kopf: ['Zeit', 'Schritt', t('meldungen.dienst.mappentyp-nummer'), 'Wie', t('meldungen.dienst.mappe-dokument'), 'Inhalt', 'Von', 'Grund', 'Vorgang'],
        zeilen: eintraege.map((e) => [
          zeit(e.zeit), LOESCHSCHRITTE[e.schritt], [e.typ, e.nummer].filter(Boolean).join(' · '), LOESCHWEGE[e.weg] ?? e.weg,
          e.art === 'mappe' ? `Mappe ${e.mappeId}` : t('meldungen.dienst.dokument', { dokumentId: String(e.dokumentId), wert: e.version && e.version > 1 ? ` (Version ${e.version})` : '', wert2: e.archivnummer ? ` · Archivnummer ${e.archivnummer}` : '' }),
          e.art === 'mappe' ? (e.anzahl ? t('meldungen.dienst.dokumente-aeltere-versionen-notizen', { dokumente: e.anzahl.dokumente, versionen: e.anzahl.versionen, notizen: e.anzahl.notizen, verweise: e.anzahl.verweise }) : '')
            : t('meldungen.dienst.sha-256-bytes', { sha256: String(e.sha256), groesse: String(e.groesse), mime: String(e.mime), wert: e.seiten ? ` · ${e.seiten} Seiten` : '' }),
          `${e.von}${e.ausloeser !== 'benutzer' ? ` (${AUSLOESER[e.ausloeser]})` : ''}`, [e.grund ? LOESCHGRUENDE[e.grund] : '', e.grundText].filter(Boolean).join(': '), e.vorgang ? `${e.vorgang}${e.startId === e.mappeId ? ' (Start)' : ''}` : '',
        ]) }] }],
    });
    return { name: t('meldungen.dienst.loeschprotokoll-pdf', { tag }), mime: 'application/pdf', inhalt: b };
  }

  /** Für den Vollexport: alle Einträge (älteste zuerst). */
  async loeschprotokollAlle(): Promise<LoeschEintrag[]> {
    const { eintraege } = await this.repo.loeschprotokoll({ max: Number.MAX_SAFE_INTEGER });
    return eintraege.reverse();
  }

  /* ---------- Demo-Daten ---------- */

  /** Mappen je Typ, auch Systemtypen (#711: lassen sich Pflicht-Verweise der Demo-Daten füllen?). */
  async mappenJeTyp(): Promise<Map<string, number>> {
    const z = (await this.repo.zaehler('', false)).typen;
    return new Map([...z].map(([id, x]) => [id, x.anzahl]));
  }

  async demoUebersicht() {
    const demo = await this.repo.zaehleDemo();
    const z = (await this.repo.zaehler('', false)).typen;
    return (await this.repo.listeTypen()).filter((t) => !t.system).map((t) => ({
      typId: t.id, name: t.name, demo: demo.get(t.id) ?? 0, gesamt: z.get(t.id)?.anzahl ?? 0,
    }));
  }

  /** Alle Demo-Mappen samt Dokumenten entfernen – in Paketen mit Fortschritt (#248). */
  async entferneDemo(fortschritt: (fertig: number, gesamt: number) => void = () => {}, paket = 1000) {
    const echte = await this.repo.echteVerweiseAufDemo();
    if (echte) throw new Fachfehler(409, t('meldungen.dienst.echte-mappen-verweisen-auf', { anzahl: echte }));
    const gesamt = [...(await this.repo.zaehleDemo()).values()].reduce((a, b) => a + b, 0);
    let entfernt = 0;
    fortschritt(0, gesamt);
    for (;;) {
      const { anzahl, dateien } = await this.repo.loescheDemo(paket);
      for (const sha of dateien) await this.raeumeAuf(sha);
      entfernt += anzahl;
      fortschritt(Math.min(entfernt, gesamt), gesamt);
      if (anzahl < paket) break;
    }
    if (entfernt) await this.aktualisiereStatistik();
    return { entfernt };
  }

  /**
   * Demo-Dokument anlegen (#248): ohne Protokolleintrag je Datei und ohne „zuletzt geändert“ –
   * es sind tausende. Volltext wie beim Hochladen; eingereiht wird gesammelt (demoTexterkennung).
   */
  async legeDemoDokumentAn(mappeId: string, typ: Mappentyp, registerKey: string, name: string, mime: string, inhalt: Buffer, benutzerId: string | null) {
    if (inhalt.length > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.die-datei-ist-zu'));
    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    const erkannt = erkenneAnzeigbar(inhalt);
    await this.dateien.schreibe(sha256, inhalt);
    const d = await this.repo.legeDokumentAn({
      id: randomUUID(), mappeId, registerKey, name: dateiname(name), mime: erkannt ?? erkenneBildtyp(inhalt) ?? mime,
      groesse: inhalt.length, sha256, anzeigbar: !!erkannt, erstellt: new Date().toISOString(), erstelltVon: benutzerId,
    });
    return { id: d.id, volltext: Dienst.volltextAn(typ, registerKey) };
  }

  /* ---------- Eingangskanäle (#195) ---------- */

  async postTyp() { return (await this.kern.system()).post; }

  /** Historien-Eintrag eines Eingangskanals (#196), z. B. nicht übernommene Anhänge. */
  async notiereSystem(mappeId: string, system: string, text: string) { await this.notiere(mappeId, null, 'uebernommen', { system, text }); }
  async anzahlDokumente(mappeId: string) { return (await this.repo.listeDokumente(mappeId)).length; }
  /** Dokumente einer Mappe ohne Rechteprüfung (#878: Paket erstellen mit Beispiel-Dokumenten, nur für Administratoren). */
  listeDokumente(mappeId: string) { return this.repo.listeDokumente(mappeId); }

  /** Gibt es die Mappe (z. B. eine Post mit vorgegebener Id) schon? */
  async gibtMappe(id: string) { return !!(await this.repo.holeMappe(id)); }

  /** Mappen, die schon eine Datei mit diesem Inhalt haben („gleicher Inhalt wie …“). */
  async dokumenteMitInhalt(sha256: string) {
    const docs = await this.repo.dokumenteMitSha(sha256);
    const bezuege = await this.repo.bezuege([...new Set(docs.map((d) => d.mappeId))]);
    return docs.slice(0, 5).map((d) => ({ mappeId: d.mappeId, name: d.name, titel: bezuege.get(d.mappeId)?.titel ?? '' }));
  }

  /**
   * Doppelte Dateien (#333): Wo liegt eine Datei mit diesem Prüfwert schon? Nur Mappen, die der Benutzer
   * lesen darf – liegt sie nur in fremden Mappen, gibt es keinen Hinweis (nichts verraten).
   */
  async fundstellen(z: Zugriff | undefined, pruefwerte: unknown, ohneMappe?: string): Promise<Record<string, Fundstelle[]>> {
    const liste = Array.isArray(pruefwerte) ? [...new Set(pruefwerte.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)))] : [];
    if (liste.length > 100) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-100-pruefwerte-auf'));
    const erg: Record<string, Fundstelle[]> = {};
    for (const sha of liste) {
      const docs = (await this.repo.dokumenteMitSha(sha)).filter((d) => d.mappeId !== ohneMappe);
      if (!docs.length) continue;
      const lesbar = await this.lesbare(z, [...new Set(docs.map((d) => d.mappeId))]);
      const sichtbar = docs.filter((d) => lesbar.has(d.mappeId));
      if (!sichtbar.length) continue;
      const bezuege = await this.repo.bezuege(sichtbar.map((d) => d.mappeId));
      const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
      erg[sha] = sichtbar.slice(0, 5).map((d) => {
        const b = bezuege.get(d.mappeId);
        const t = b ? typen.get(b.typId) : undefined;
        return { mappeId: d.mappeId, typId: b?.typId ?? '', titel: b?.titel ?? '', typ: t?.name ?? '', register: t?.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey, name: d.name, erstellt: d.erstellt };
      });
    }
    return erg;
  }

  /** Eine Post, die seit `seit` ein Dokument mit diesem Inhalt bekommen hat (Aufräumen nach Abbruch). */
  async postMitDatei(sha256: string, seit: string): Promise<string | null> {
    const post = await this.postTyp();
    for (const d of await this.repo.dokumenteMitSha(sha256)) {
      if (d.erstellt < seit) continue;
      const m = await this.repo.holeMappe(d.mappeId);
      if (m?.typId === post.id) return m.id;
    }
    return null;
  }

  /** Demo-Dokumente gesammelt in die Warteschlange der Texterkennung. */
  async demoTexterkennung(ids: string[]) {
    if (!ids.length) return;
    await this.repo.ocrEinreihen(ids);
    this.ocr?.anstossen();
  }

  /* ---------- Dokumente ---------- */

  /** Löscht die Datei, wenn kein Dokument mehr auf sie zeigt. */
  private async raeumeAuf(sha256: string) {
    if (!(await this.repo.dateiBenutzt(sha256))) {
      await this.dateien.loesche(sha256);
      await this.vorschau?.entferne(sha256);
      await this.umwandlung?.entferne(sha256);
      await this.archiv?.entferne(sha256);
    }
  }

  /**
   * Hochladen. Gleicher Name im Register (#194): `gleicherName` = „zaehler“ (Standard: „Rechnung (2).pdf“),
   * „version“ (neue Version des vorhandenen, nur mit Versionierung) oder „ersetzen“ (vorhandenes löschen,
   * nur ohne Versionierung).
   */
  async ladeHoch(mappeId: string, e: { register?: string; name?: string; typ?: string; gleicherName?: string; herkunft?: Herkunft; volltext?: Volltextuebernahme; /** Nur intern (#878: Beispiel-Dokumente mit Datum). */ erstellt?: string }, inhalt: unknown, benutzerId: string | null) {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const typ = await this.repo.holeTyp(m.typId);
    const reg = typ?.register.find((r) => r.key === e.register && r.art === 'dokumente');
    if (!reg) throw new Fachfehler(422, t('meldungen.dienst.dieses-dokumentenregister-gibt-es-2'));
    // Upload als temporäre Datei (#746) oder Puffer; ganz gelesen wird er nur, wo es nötig ist (PDF verkleinern).
    let ein = Eingang.aus(inhalt);
    if (!ein || ein.groesse === 0) throw new Fachfehler(422, t('meldungen.dienst.die-datei-ist-leer'));
    if (ein.groesse > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.die-datei-ist-zu'));
    // Automatisch verkleinern (#393): neue PDFs von außen (Hochladen, Eingangsordner, Postfach, API, WebDAV) ab einer Größe.
    let automatisch: { vorher: number; nachher: number; stufe: Stufe } | null = null;
    if (AUTOMATISCH_VERKLEINERN.has(e.herkunft ?? 'hochgeladen') && !e.volltext) {
      const r = await this.automatischVerkleinert(ein, e.name ?? '');
      if (r) { automatisch = { vorher: r.vorher, nachher: r.nachher, stufe: r.stufe }; ein = Eingang.aus(r.inhalt)!; }
    }
    const groesse = ein.groesse;
    const art = e.gleicherName ?? 'zaehler';
    if (!['zaehler', 'version', 'ersetzen'].includes(art)) throw new Fachfehler(422, t('meldungen.dienst.gleichername-zaehler-version-oder'));
    const vorhanden = (await this.repo.listeDokumente(mappeId)).filter((d) => d.registerKey === reg.key);
    const gleich = vorhanden.find((d) => d.name.toLowerCase() === dateiname(e.name).toLowerCase());
    if (gleich && art === 'version') {
      if (!reg.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist'));
      return { dokument: await this.ersetzeDokument(gleich.id, { name: e.name, typ: e.typ, herkunft: e.herkunft }, ein, benutzerId), gleicherInhalt: [], version: true };
    }
    if (gleich && art === 'ersetzen') {
      if (reg.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-2'));
      await this.loescheDokument(gleich.id, benutzerId);
    }
    let name = dateiname(e.name);
    if (gleich && art === 'zaehler') {
      const namen = new Set(vorhanden.map((d) => d.name.toLowerCase()));
      const punkt = name.lastIndexOf('.');
      const [stamm, endung] = punkt > 0 ? [name.slice(0, punkt), name.slice(punkt)] : [name, ''];
      for (let i = 2; namen.has(name.toLowerCase()); i++) name = `${stamm} (${i})${endung}`;
    }

    const sha256 = await ein.sha256();
    const erkannt = erkenneAnzeigbar(ein.kopf);
    // TIFF, BMP, HEIC … am Inhalt (#577): Browser schicken sie oft ohne oder mit falschem Typ.
    const angegeben = erkenneBildtyp(ein.kopf) ?? (/^[\w.+-]+\/[\w.+-]+$/.test(e.typ ?? '') ? e.typ! : 'application/octet-stream');
    const gleicherInhalt = await this.repo.dokumenteMitSha(sha256);
    await ein.lege(this.dateien, sha256);
    // Dokument, Historie und Ereignis in einer Transaktion (#404); die Datei liegt schon (bleibt sie übrig, räumt die Wartung auf).
    const neu = await this.inTransaktion(async () => {
      await this.notiere(mappeId, benutzerId, 'dokument_hochgeladen', { dokument: name, groesse, mime: erkannt ?? angegeben, register: reg.name,
        ...(automatisch ? { verkleinert: `automatisch ${ergebnisText(automatisch.vorher, automatisch.nachher)} (${STUFEN[automatisch.stufe].name})` } : {}) });
      await this.beruehre(mappeId, typ, benutzerId);
      const dokument = await this.repo.legeDokumentAn({
        id: randomUUID(), mappeId, registerKey: reg.key, name, mime: erkannt ?? angegeben,
        groesse, sha256, anzeigbar: !!erkannt, erstellt: new Date().toISOString(), erstelltVon: benutzerId, herkunft: e.herkunft ?? 'hochgeladen',
      });
      if (e.erstellt) { await this.repo.setzeDokumentErstellt(dokument.id, e.erstellt); dokument.erstellt = e.erstellt; }
      this.danach(() => this.neueDateien([dokument]));
      // Volltext (#45): neues Dokument in die Warteschlange, wenn das Register das will.
      let neu = dokument;
      if (e.volltext) {
        // Verkleinert ohne Versionierung (#393): Der Volltext des bisherigen bleibt, keine neue Texterkennung.
        await this.repo.ocrSetze(dokument.id, { stand: 'fertig', ...e.volltext });
        neu = (await this.repo.holeDokument(dokument.id)) ?? dokument;
        this.danach(() => void this.volltextFertig({ dokument: dokument.id, mappe: mappeId }, { quelle: 'kopie', text: !!e.volltext?.text?.trim(), mime: dokument.mime, seiten: e.volltext?.seiten ?? null }));
      } else if (Dienst.volltextAn(typ, reg.key)) {
        await this.repo.ocrEinreihen([dokument.id]);
        neu = (await this.repo.holeDokument(dokument.id)) ?? dokument;
        this.danach(() => this.ocr?.anstossen());
      }
      await this.ereignis('dokument.hochgeladen', { dokument: dokument.id, mappe: mappeId, typ: await this.typVon(mappeId), mime: dokument.mime, groesse, volltextGeplant: neu.ocr?.stand === 'wartet' }, benutzerId);
      return neu;
    });
    const bezuege = await this.repo.bezuege(gleicherInhalt.map((d) => d.mappeId));
    return { dokument: neu, gleicherInhalt: gleicherInhalt.map((d) => ({ mappeId: d.mappeId, name: d.name, ...bezuege.get(d.mappeId) })), ...(automatisch ? { verkleinert: automatisch } : {}) };
  }

  /** Titel und Typ zu Mappen-Ids (ohne Rechteprüfung – vorher filtern). */
  bezuegeVon(ids: string[]) { return this.repo.bezuege(ids); }

  /** Startseite (#334): Gibt es noch keine Mappe außer denen des Systems (Benutzer, Rollen, Ablageorte) und Demo-Daten? */
  async ohneEigeneMappen(): Promise<boolean> {
    const ablageort = await this.ablageortId();
    const typen = (await this.repo.listeTypen()).filter((t) => !t.system && t.id !== ablageort);
    // Nur ob es eine gibt (#615): früher zählte das bei jedem Laden der Startseite alle Mappen je Typ.
    return !(await this.repo.gibtMappen(typen.map((t) => t.id)));
  }

  async holeDokument(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return d;
  }

  async dokumentInhalt(id: string) {
    const dokument = await this.repo.holeDokument(id);
    if (!dokument) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return { dokument, inhalt: await this.dateien.lies(dokument.sha256) };
  }

  /* ---------- Stempel beim Weitergeben (#394) ---------- */

  /** Vorlagen und Einstellung je Mappentyp – beides in den Einstellungen (Schlüssel „stempel“), ohne Migration. */
  private async stempelDaten(): Promise<{ vorlagen: StempelVorlage[]; typen: Record<string, StempelTyp> }> {
    const roh = (await this.einstellungen?.lies('stempel')) as { vorlagen?: unknown; typen?: unknown } | null;
    const typen: Record<string, StempelTyp> = {};
    if (roh?.typen && typeof roh.typen === 'object') for (const [k, v] of Object.entries(roh.typen)) { const t = liesStempelTyp(v); if (t) typen[k] = t; }
    return { vorlagen: liesVorlagen(roh?.vorlagen), typen };
  }
  private async schreibeStempelDaten(d: { vorlagen: StempelVorlage[]; typen: Record<string, StempelTyp> }) {
    if (!this.einstellungen) throw new Fachfehler(409, t('meldungen.dienst.einstellungen-lassen-sich-hier'));
    await this.einstellungen.schreibe('stempel', d);
  }

  /** Vorlagen für alle Angemeldeten (zum Auswählen beim Weitergeben). */
  async stempelVorlagen(): Promise<StempelVorlage[]> { return (await this.stempelDaten()).vorlagen; }

  /** Vorlage anlegen (`id` null) oder ändern (Werkbank). */
  async speichereStempelVorlage(id: string | null, eingabe: unknown, von: string): Promise<StempelVorlage[]> {
    const d = await this.stempelDaten();
    const alt = id ? d.vorlagen.find((v) => v.id === id) : undefined;
    if (id && !alt) throw new Fachfehler(404, t('meldungen.dienst.diese-stempel-vorlage-gibt'));
    if (!id && d.vorlagen.length >= STEMPEL_VORLAGEN_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-stempel-vorlagen', { STEMPEL_VORLAGEN_MAX }));
    const o = (eingabe ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? alt?.name ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, STEMPEL_NAME_MAX);
    // Neue Vorlagen beginnen mit 70 % und „wie Tinte“ (#799); gespeichert ist eine Umstellung erledigt (ohne `umgestellt`).
    const v: StempelVorlage = { id: alt?.id ?? randomUUID(), name, ...stempelAus(o, alt ?? NEUER_STEMPEL) };
    const fehler = pruefeVorlage(v, d.vorlagen.filter((x) => x.id !== v.id).map((x) => x.name));
    if (Object.keys(fehler).length) throw new Fachfehler(422, Object.values(fehler).join(' '), { felder: fehler });
    d.vorlagen = alt ? d.vorlagen.map((x) => (x.id === v.id ? v : x)) : [...d.vorlagen, v];
    await this.schreibeStempelDaten(d);
    protokoll.modul('werkbank').info(alt ? 'Stempel-Vorlage geändert' : 'Stempel-Vorlage angelegt', { name: v.name, text: v.text, von });
    return d.vorlagen;
  }

  /** Vorlage löschen – nicht, solange ein Mappentyp sie nutzt. */
  async loescheStempelVorlage(id: string, von: string): Promise<StempelVorlage[]> {
    const d = await this.stempelDaten();
    const v = d.vorlagen.find((x) => x.id === id);
    if (!v) throw new Fachfehler(404, t('meldungen.dienst.diese-stempel-vorlage-gibt'));
    const typen = await this.repo.listeTypen();
    const nutzer = Object.entries(d.typen).filter(([t, s]) => s.vorlage === id && typen.some((x) => x.id === t)).map(([t]) => typen.find((x) => x.id === t)!.name);
    if (nutzer.length) throw new Fachfehler(409, t('meldungen.dienst.die-vorlage-wird-noch', { anzahl: nutzer.length, name: v.name, map: nutzer.map((n) => `„${n}“`).join(', ') }));
    // Stempel beim Lesen über das Laufwerk (#722): ohne Angabe gilt die mitgelieferte Vorlage.
    const laufwerk = (await this.einstellungen?.lies('webdav')) as { stempel?: unknown } | null;
    if ((laufwerk && 'stempel' in laufwerk ? laufwerk.stempel : WEBDAV_VORLAGE) === id) throw new Fachfehler(409, t('api.webdav.vorlage-in-gebrauch', { name: v.name }));
    d.vorlagen = d.vorlagen.filter((x) => x.id !== id);
    await this.schreibeStempelDaten(d);
    protokoll.modul('werkbank').info('Stempel-Vorlage gelöscht', { name: v.name, von });
    return d.vorlagen;
  }

  /** Stempel-Einstellung eines Mappentyps prüfen (vor dem Speichern des Typs). */
  private async pruefeStempelTyp(v: unknown): Promise<StempelTyp | null> {
    if (v && typeof v === 'object' && typeof (v as { modus?: unknown }).modus === 'string' && !((v as { modus: string }).modus in STEMPEL_MODI)) {
      throw new Fachfehler(422, t('meldungen.dienst.stempel-beim-weitergeben-unbekannte'), { allgemein: [t('meldungen.dienst.stempel-beim-weitergeben-unbekannte')], felder: {}, orte: ['stempel'] });
    }
    const eintrag = liesStempelTyp(v);
    if (eintrag?.vorlage && !(await this.stempelDaten()).vorlagen.some((x) => x.id === eintrag.vorlage)) {
      throw new Fachfehler(422, t('meldungen.dienst.stempel-beim-weitergeben-diese'), { allgemein: [t('meldungen.dienst.stempel-beim-weitergeben-diese')], felder: {}, orte: ['stempel'] });
    }
    return eintrag;
  }
  private async setzeStempelTyp(typId: string, t: StempelTyp | null) {
    if (!this.einstellungen) return;
    const d = await this.stempelDaten();
    const vorher = d.typen[typId] ?? null;
    if (JSON.stringify(vorher) === JSON.stringify(t)) return;
    if (t) d.typen[typId] = t; else delete d.typen[typId];
    await this.schreibeStempelDaten(d);
    protokoll.modul('werkbank').info('Stempel beim Weitergeben eingestellt', { typ: typId, modus: t?.modus ?? 'aus', vorlage: t?.vorlage ?? null });
  }
  /** Mappentypen mit ihrer Stempel-Einstellung (für die Oberfläche). */
  private async mitStempel<T extends Mappentyp>(typen: T[]): Promise<T[]> {
    const { typen: s } = await this.stempelDaten();
    const e = await this.typErkennungen();
    return typen.map((t) => ({ ...t, stempel: s[t.id] ?? null, ausDokument: e[t.id]?.ausDokument ?? null, autoZuordnen: !!e[t.id]?.auto }));
  }

  /** Welcher Stempel für eine Mappe dieses Typs gilt (Wunsch, Pflicht); Fehler als 422. */
  private async stempelPlan(typId: string, wunsch: StempelWunsch | null, empfaengerErsatz = '', daten?: Awaited<ReturnType<Dienst['stempelDaten']>>): Promise<GeltenderStempel | null> {
    const d = daten ?? await this.stempelDaten();
    try { return geltenderStempel(wunsch, d.typen[typId], d.vorlagen, empfaengerErsatz); } catch (x) {
      if (x instanceof StempelFehler) throw new Fachfehler(422, x.message, { stempel: true, pflicht: d.typen[typId]?.modus === 'pflicht' });
      throw x;
    }
  }

  /**
   * Stempel beim Lesen über das WebDAV-Laufwerk (#722): Der Pflicht-Stempel des Mappentyps gewinnt immer – auch wenn
   * die Einstellung des Laufwerks „aus“ ist. Sonst gilt die Vorlage der Einstellung (`vorlage`, null = aus; eine
   * gelöschte Vorlage wirkt wie „aus“). {empfänger} und {benutzer} sind der lesende Benutzer (`leser`).
   * `fehler`: Der Stempel lässt sich nicht bilden – bei Pflicht geht die Datei dann nicht hinaus.
   */
  async laufwerkStempel(typId: string, vorlage: string | null, leser: string): Promise<{ pflicht: boolean; plan: GeltenderStempel | null; fehler?: string }> {
    const d = await this.stempelDaten();
    const pflicht = d.typen[typId]?.modus === 'pflicht';
    const wunsch = !pflicht && vorlage && d.vorlagen.some((v) => v.id === vorlage) ? { vorlage } : null;
    if (!pflicht && !wunsch) return { pflicht, plan: null };
    try { return { pflicht, plan: await this.stempelPlan(typId, wunsch, leser, d) }; } catch (x) {
      if (x instanceof Fachfehler) return { pflicht, plan: null, fehler: x.message };
      throw x;
    }
  }

  /** Gestempelte Kopie eines Dokuments fürs Laufwerk (#722); das gespeicherte Original bleibt unverändert. */
  async laufwerkAusgabe(d: Dokument, m: Pick<Mappe, 'titel'>, plan: GeltenderStempel, leser: string): Promise<Ausgabe> {
    return fuerAusgabe({ name: d.name, mime: d.mime, inhalt: await this.liesGanz(d.sha256) }, { stempel: plan },
      { benutzer: leser, mappe: m.titel || t('meldungen.dienst.ohne-titel'), archivnummer: d.archivnummer ?? null, entsperrt: this.entsperrtZu });
  }

  private liesGanz(sha256: string): Promise<Buffer> { return this.kern.liesGanz(sha256); }

  /** Historie (#394, #393): „weitergegeben mit Stempel ‚…‘, verkleinert (… → …) an …“. */
  private async notiereWeitergabe(mappeId: string, von: string | null, wie: string, plan: GeltenderStempel | null, ausgaben: Ausgabe[]) {
    const bearbeitet = ausgaben.filter((a) => a.gestempelt || a.verkleinert);
    if (!bearbeitet.length) return;
    const text = bearbeitet.find((a) => a.stempeltext)?.stempeltext ?? null;
    const klein = bearbeitet.filter((a) => a.verkleinert);
    await this.notiere(mappeId, von, 'weitergegeben', {
      text: `${weitergabeWas(ausgaben)}${plan?.empfaenger ? t('meldungen.dienst.an-2', { empfaenger: plan.empfaenger }) : ''} (${wie}: ${bearbeitet.map((a) => a.name).join(', ')})`,
      stempel: text, an: plan?.empfaenger || null, wie, vorlage: plan?.vorlage ?? null, pflicht: plan?.pflicht ?? false, dokumente: bearbeitet.map((a) => a.name),
      ...(klein.length ? { verkleinert: { vorher: klein.reduce((s, a) => s + a.verkleinert!.vorher, 0), nachher: klein.reduce((s, a) => s + a.verkleinert!.nachher, 0) } } : {}),
    });
  }

  /**
   * Ein Dokument oder eine ältere Version herunterladen (#394): mit Stempel, wenn gewünscht (`stempel`,
   * aus Anfragekörper oder Abfrageparametern) oder vom Mappentyp verlangt. Ohne Stempel unverändert als Strom.
   */
  /**
   * Archivfassung für mehrere Dokumente (#715: E-Mail mehrerer Mappen, Export): mit `fassung` = „archiv“ tritt an die
   * Stelle jedes Dokuments mit Archivfassung (keine E-Rechnung) ein Dokument mit Name, Typ und Größe der Fassung;
   * die übrigen bleiben Original – ohne Rückfrage. `lies`/`strom` lesen dann die richtige Datei.
   */
  private async archivWahl(fassung: unknown) {
    if (fassung !== undefined && fassung !== null && fassung !== 'original' && fassung !== 'archiv') throw new Fachfehler(422, t('meldungen.dienst.fassung-kennt-nur-original'));
    const original = new Map<string, Dokument>();
    const waehle = async (d: Dokument): Promise<Dokument> => {
      if (fassung !== 'archiv') return d;
      const q = await this.ausgabeQuelle(d, 'archiv', true);
      if (!q.archiv) return d;
      original.set(d.id, d);
      return { ...d, name: q.name, mime: q.mime, groesse: q.groesse };
    };
    const lies = async (d: Dokument): Promise<Buffer> => (original.has(d.id) ? (await this.ausgabeQuelle(original.get(d.id)!, 'archiv', true)).inhalt() : this.liesGanz(d.sha256));
    const strom = async (d: Dokument): Promise<Buffer | Readable> => (original.has(d.id) ? lies(d) : this.dateien.lies(d.sha256) as Promise<Buffer | Readable>);
    return { waehle, lies, strom, anzahl: () => original.size, archiv: (d: Dokument) => original.has(d.id) };
  }

  /**
   * Archivfassung statt Original weitergeben (#631): `fassung` = „archiv“ nimmt die aktuelle Archivfassung des
   * Dokuments (gibt es keine, 404), sonst das Original. `nurWo` (mehrere Dokumente): ohne Archivfassung und bei
   * E-Rechnungen das Original, ohne Fehler.
   */
  private async ausgabeQuelle(d: Pick<Dokument, 'name' | 'mime' | 'sha256' | 'groesse' | 'anzeigbar'>, fassung: unknown, nurWo = false): Promise<{ name: string; mime: string; sha256: string; groesse: number; anzeigbar: boolean; inhalt: () => Promise<Buffer>; archiv: boolean }> {
    const original = { name: d.name, mime: d.mime, sha256: d.sha256, groesse: d.groesse, anzeigbar: d.anzeigbar, inhalt: () => this.liesGanz(d.sha256), archiv: false };
    if (fassung === undefined || fassung === null || fassung === 'original') return original;
    if (fassung !== 'archiv') throw new Fachfehler(422, t('meldungen.dienst.fassung-kennt-nur-original'));
    const f = await this.archiv?.lies(d.sha256);
    if (!f || (nurWo && f.info.erechnung)) { if (nurWo) return original; throw new Fachfehler(404, t('pakete.archiv.keine')); }
    return { name: archivfassungName(d.name), mime: 'application/pdf', sha256: f.info.sha256, groesse: f.inhalt.length, anzeigbar: true, inhalt: async () => f.inhalt, archiv: true };
  }

  async dokumentFuerAusgabe(id: string, o: { version?: number; stempel?: unknown; verkleinern?: unknown; fassung?: unknown; ich: { id: string | null; name: string } }) {
    const dokument = await this.repo.holeDokument(id);
    if (!dokument) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const datei = o.version != null ? (await this.versionInhalt(id, o.version)).version : await this.ausgabeQuelle(dokument, o.fassung);
    const m = await this.repo.holeMappe(dokument.mappeId);
    const plan = m ? await this.stempelPlan(m.typId, wunschAus(o.stempel), empfaengerAus(o.stempel)) : null;
    // Verkleinert herunterladen (#393): nur PDFs; das gespeicherte Dokument bleibt, wie es ist.
    const klein = stufeAus(o.verkleinern);
    if (klein && datei.mime !== 'application/pdf' && !plan) throw new Fachfehler(422, t('meldungen.dienst.ist-kein-pdf-verkleinern', { name: datei.name }));
    const lies = async () => ('archiv' in datei && datei.archiv ? datei.inhalt() : this.liesGanz(datei.sha256));
    if (!plan && !klein) return { name: datei.name, mime: datei.mime, anzeigbar: datei.anzeigbar, groesse: datei.groesse, inhalt: ('archiv' in datei && datei.archiv ? await datei.inhalt() : await this.dateien.lies(datei.sha256)) as Buffer | Readable, gestempelt: false };
    const a = await fuerAusgabe({ name: datei.name, mime: datei.mime, inhalt: await lies() }, { stempel: plan, verkleinern: klein },
      { benutzer: o.ich.name, mappe: m!.titel || t('meldungen.dienst.ohne-titel'), archivnummer: dokument.archivnummer, entsperrt: this.entsperrtZu }, true);
    await this.notiereWeitergabe(m!.id, o.ich.id, o.version != null ? t('meldungen.dienst.heruntergeladen-version', { version: o.version }) : 'archiv' in datei && datei.archiv ? t('meldungen.dienst.heruntergeladen-archivfassung') : 'heruntergeladen', plan, [a]);
    if (plan) protokoll.modul('dokumente').info('Dokument mit Stempel heruntergeladen', { id, mappe: m!.id, pflicht: plan.pflicht });
    if (a.verkleinert) protokoll.modul('dokumente').info('Dokument verkleinert heruntergeladen', { id, mappe: m!.id, vorher: a.verkleinert.vorher, nachher: a.verkleinert.nachher });
    return { name: a.name, mime: a.mime, anzeigbar: true, groesse: a.inhalt.length, inhalt: a.inhalt as Buffer | Readable, gestempelt: !!a.gestempelt, verkleinert: a.verkleinert ?? null };
  }

  /**
   * Abruf mit API-Schlüssel ist Herausgeben (#799): die Archivfassung (#631) oder die umgewandelte Fassung (#577) mit
   * dem Stempel, den der Abruf wünscht oder der Mappentyp verlangt – auf den Seiten des Dokuments selbst, ohne eigenes
   * Deckblatt. Die gespeicherte Fassung bleibt unverändert. Ohne geltenden Stempel `null`: Dann geht die Fassung so
   * hinaus, wie sie gespeichert ist.
   */
  async fassungFuerAusgabe(id: string, art: 'archiv' | 'umgewandelt', o: { stempel?: unknown; ich: { id: string | null; name: string } }) {
    const f = art === 'archiv' ? await this.archivfassungVon(id) : await this.fassungVon(id);
    const m = await this.repo.holeMappe(f.d.mappeId);
    const wunsch = wunschAus(o.stempel);
    const plan = m ? await this.stempelPlan(m.typId, wunsch, empfaengerAus(o.stempel)) : null;
    if (!plan) return null;
    const punkt = f.d.name.lastIndexOf('.');
    const name = art === 'archiv' ? ((f.info as { imOriginal?: boolean }).imOriginal ? f.d.name : archivfassungName(f.d.name)) : `${punkt > 0 ? f.d.name.slice(0, punkt) : f.d.name} (umgewandelt).pdf`;
    const mime = art === 'archiv' ? 'application/pdf' : (f.info as FassungInfo).mime;
    const a = await fuerAusgabe({ name, mime, inhalt: f.inhalt }, { stempel: plan }, { benutzer: o.ich.name, mappe: m!.titel || t('meldungen.dienst.ohne-titel'), archivnummer: f.d.archivnummer ?? null }, true);
    await this.notiereWeitergabe(m!.id, o.ich.id, art === 'archiv' ? t('meldungen.dienst.ueber-die-api-archivfassung') : t('meldungen.dienst.ueber-die-api-umgewandelte'), plan, [a]);
    protokoll.modul('dokumente').info('Fassung mit Stempel über die API ausgegeben', { id, mappe: m!.id, art, pflicht: plan.pflicht });
    return a;
  }

  /** Gestempelte Kopien für Seitenbilder über die API (#799), kurz im Arbeitsspeicher: Seite für Seite wird nur einmal gestempelt. */
  private readonly apiKopien = new Map<string, Promise<Buffer>>();
  /**
   * Seitenbilder bei einem Abruf mit API-Schlüssel (#799): Gilt ein Stempel (Pflicht des Mappentyps oder gewünscht),
   * entstehen die Bilder aus der gestempelten Kopie – als PDF, auch bei Bildern und umgewandelten Dateien. Ohne
   * Stempel `null` (dann die üblichen Seitenbilder). Die Weitergabe steht einmal je Kopie in der Historie.
   */
  async gestempelteSeiten(id: string, o: { stempel?: unknown; ich: { id: string | null; name: string } }): Promise<{ schluessel: string; pdf: Buffer } | null> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const m = await this.repo.holeMappe(d.mappeId);
    if (!m) return null;
    const wunsch = wunschAus(o.stempel);
    const plan = await this.stempelPlan(m.typId, wunsch, empfaengerAus(o.stempel));
    if (!plan) return null;
    const kontext = { benutzer: o.ich.name, mappe: m.titel || t('meldungen.dienst.ohne-titel'), archivnummer: d.archivnummer ?? null, datum: stempelDatum() };
    const schluessel = `stempel:${d.sha256}:${createHash('sha256').update(JSON.stringify([plan, kontext])).digest('hex')}`;
    let p = this.apiKopien.get(schluessel);
    if (!p) {
      p = (async () => {
        let quelle: { name: string; mime: string; inhalt: Buffer };
        if (kernTyp(d.mime)) quelle = { name: d.name, mime: d.mime, inhalt: await this.liesGanz(d.sha256) };
        else {
          const f = await this.umwandlung?.lies(d.sha256);
          if (!f) throw new Fachfehler(422, t('meldungen.dienst.ist-weder-pdf-noch', { name: d.name }));
          quelle = { name: d.name, mime: f.info.mime, inhalt: f.inhalt };
        }
        const a = await fuerAusgabe(quelle, { stempel: plan }, kontext, true);
        await this.notiereWeitergabe(m.id, o.ich.id, t('meldungen.dienst.ueber-die-api-seitenbilder'), plan, [a]);
        return a.inhalt;
      })();
      this.apiKopien.set(schluessel, p);
      p.catch(() => this.apiKopien.delete(schluessel));
      while (this.apiKopien.size > 8) this.apiKopien.delete(this.apiKopien.keys().next().value!);
    }
    return { schluessel, pdf: await p };
  }

  async loescheDokument(id: string, benutzerId: string | null = null, anlass: Anlass = { weg: 'ersetzt' }) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    // Archivmodus (#212): Dokumente bleiben bis Fristende; ändern nur als neue Version.
    await this.pruefeArchivDokument(d.mappeId, 'löschen');
    // Alle Versionen (#194) gehen mit.
    const aeltere = await this.repo.versionenVon(id);
    // Papierkorb (#344): eingeschaltet → das Dokument zieht samt Versionen und Volltext dorthin um.
    const korb = (await this.kern.papierkorbTage()) > 0;
    if (korb) await this.repo.legeDokumentInPapierkorb(id, benutzerId);
    else await this.repo.loescheDokument(id);
    // Löschprotokoll (#470)
    const info = (await this.kern.loeschprotokoll.mappenInfo([d.mappeId], new Map()))(d.mappeId, id);
    await this.kern.loeschprotokoll.schreibe(this.kern.loeschprotokoll.dokEintraege([dokInfo(d), ...aeltere.map(versionInfo)], { ...info, schritt: korb ? 'papierkorb' : 'endgueltig', weg: anlass.weg ?? 'dokument' }),
      await this.kern.loeschprotokoll.kontext(benutzerId, anlass));
    await this.notiere(d.mappeId, benutzerId, korb ? 'dokument_papierkorb' : 'dokument_geloescht', { dokument: d.name, groesse: d.groesse, mime: d.mime, ...(aeltere.length ? { versionen: aeltere.length + 1 } : {}) });
    const m = await this.repo.holeMappe(d.mappeId);
    if (m) await this.beruehre(m.id, await this.repo.holeTyp(m.typId), benutzerId);
    if (!korb) for (const sha of new Set([d.sha256, ...aeltere.map((v) => v.sha256)])) await this.raeumeAuf(sha);
    return { papierkorb: korb };
  }

  /* ---------- PDF bearbeiten (#335) ---------- */

  /** Seitenbilder der Seitenansicht (im Arbeitsspeicher, für die letzten Dokumente). */
  readonly seitenbilder = new Seitenbilder();

  private async pdfVon(id: string): Promise<{ d: Dokument; inhalt: Buffer }> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (d.mime !== 'application/pdf') throw new Fachfehler(422, t('meldungen.dienst.ist-kein-pdf-bearbeiten', { name: d.name }));
    const s = await this.dateien.lies(d.sha256);
    return { d, inhalt: Buffer.isBuffer(s) ? s : Buffer.concat(await s.toArray() as Buffer[]) };
  }

  /**
   * Eine Seite als Graustufenbild (PGM) für eine Texterkennung im Paket (#338). JPEG und PNG (#458) haben genau eine
   * Seite: Das Bild wird ohne Neuberechnung in ein einseitiges PDF gelegt (wie bei den Vorschaubildern) und genauso
   * gerastert – kein zusätzliches Bildwerkzeug im Image. Bilder kommen in Originalgröße, dpi zählt dort nicht.
   * `farbe` (#716): als Farbbild (PPM) statt Graustufen, z. B. für die Archivfassung.
   */
  async seiteAlsGraubild(id: string, nr: number, dpi: number, farbe = false, gestempelt?: { pdf: Buffer } | null): Promise<Buffer> {
    // Abruf mit API-Schlüssel und Stempel (#799): aus der gestempelten Kopie.
    if (gestempelt) return graubild(gestempelt.pdf, nr, dpi, farbe);
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    // Andere Dateitypen (#577): die Seiten der umgewandelten Fassung (PDF, PNG oder JPEG) eines Pakets.
    if (!kernTyp(d.mime)) {
      const f = await this.umwandlung?.lies(d.sha256);
      if (!f) throw new Fachfehler(422, t('meldungen.dienst.ist-weder-pdf-noch', { name: d.name }));
      if (f.info.mime === 'application/pdf') return graubild(f.inhalt, nr, dpi, farbe);
      if (nr !== 1) throw new Fachfehler(404, t('meldungen.dienst.seite-gibt-es-nicht', { nr }));
      return graubild(await bildSeitePdf(f.inhalt, f.info.mime), 1, 72, farbe);
    }
    if (d.mime === 'image/jpeg' || d.mime === 'image/png') {
      if (nr !== 1) throw new Fachfehler(404, t('meldungen.dienst.seite-gibt-es-nicht', { nr }));
      const s = await this.dateien.lies(d.sha256);
      const bild = Buffer.isBuffer(s) ? s : Buffer.concat(await s.toArray() as Buffer[]);
      // Das Bild liegt in Originalgröße (1 Bildpunkt = 1 pt): bei 72 dpi kommen genau seine Bildpunkte.
      return graubild(await bildSeitePdf(bild, d.mime), 1, 72, farbe);
    }
    if (d.mime !== 'application/pdf') throw new Fachfehler(422, t('meldungen.dienst.ist-weder-pdf-noch-2', { name: d.name }));
    const { inhalt } = await this.pdfVon(id);
    return graubild(inhalt, nr, dpi, farbe);
  }

  /** Seitenzahl und Drehung je Seite. */
  async pdfSeiten(id: string) {
    const { d, inhalt } = await this.pdfVon(id);
    return { id: d.id, name: d.name, version: d.version ?? 1, sha256: d.sha256, ...(await seitenInfo(inhalt)), bilderBis: SEITENBILDER_MAX };
  }

  /** Bild einer Seite (Seitenansicht); null, wenn es keins gibt. */
  async pdfSeitenbild(id: string, nr: number, gestempelt?: { schluessel: string; pdf: Buffer } | null): Promise<Buffer | null> {
    if (gestempelt) return Number.isInteger(nr) && nr >= 1 && nr <= SEITENBILDER_MAX ? this.seitenbilder.bild(gestempelt.schluessel, nr, async () => gestempelt.pdf) : null;
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (d.mime !== 'application/pdf' || !Number.isInteger(nr) || nr < 1 || nr > SEITENBILDER_MAX) return null;
    return this.seitenbilder.bild(d.sha256, nr, async () => (await this.pdfVon(id)).inhalt);
  }

  /**
   * Seiten bearbeiten (#335): `seiten` = die Seiten des Ergebnisses in Reihenfolge (Nummer im Original,
   * Drehung), `teile` = Positionen in dieser Liste, an denen ein neuer Teil beginnt.
   * - Ohne Teilen: neue Version (Versionierung) bzw. – ohne Versionierung – Ersetzen nach Rückfrage
   *   (`bestaetigt`), das bisherige kommt in den Papierkorb.
   * - Teilen in einer Mappe: Teil 1 wird so zur neuen Version, die weiteren Teile werden eigene Dokumente
   *   im selben Register.
   * - Teilen bei Post: je Teil eine neue Post; die Ausgangspost behält ihr Dokument, ist erledigt und
   *   verweist auf die neuen.
   */
  async bearbeitePdf(id: string, eingabe: unknown, von: string | null, z?: Zugriff) {
    const { d, inhalt } = await this.pdfVon(id);
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const info = await seitenInfo(inhalt);
    const seiten = pruefeAuswahl(e.seiten, info.anzahl);
    const starts = pruefeTeile(e.teile, seiten.length);
    const m = await this.repo.holeMappe(d.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const reg = typ?.register.find((r) => r.key === d.registerKey && r.art === 'dokumente');
    if (!m || !typ || !reg) throw new Fachfehler(409, t('meldungen.dienst.das-register-dieses-dokuments'));
    const gleich = starts.length === 1 && seiten.length === info.anzahl && seiten.every((s, i) => s.nr === i + 1 && !s.drehung);
    if (gleich) throw new Fachfehler(422, t('meldungen.dienst.es-hat-sich-nichts'));
    const teileBuf = await teile(inhalt, seiten, starts);
    const gedreht = seiten.filter((s) => s.drehung).length;
    const was = { dokument: d.name, seiten: seiten.length, vorher: info.anzahl, ...(gedreht ? { gedreht } : {}), ...(starts.length > 1 ? { teile: starts.length } : {}) };

    if (typ.system === 'post' && starts.length > 1) return this.teilePost(m, typ, reg, d, teileBuf, von, z, was);

    const korb = (await this.papierkorbTage()) > 0;
    let erstes: Dokument;
    const name1 = starts.length > 1 ? teilName(d.name, 1) : d.name;
    if (reg.versionierung) {
      erstes = await this.ersetzeDokument(d.id, { name: name1, typ: 'application/pdf', herkunft: 'bearbeitet' }, teileBuf[0], von);
    } else {
      if (e.bestaetigt !== true) {
        throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-3', { wert: korb ? t('meldungen.dienst.das-bisherige-kommt-in') : t('meldungen.dienst.das-bisherige-ist-danach') }), { rueckfrage: true, papierkorb: korb });
      }
      await this.loescheDokument(d.id, von);
      erstes = (await this.ladeHoch(m.id, { register: reg.key, name: name1, typ: 'application/pdf', herkunft: 'bearbeitet' }, teileBuf[0], von)).dokument;
    }
    const weitere: Dokument[] = [];
    for (const [i, b] of teileBuf.slice(1).entries()) {
      weitere.push((await this.ladeHoch(m.id, { register: reg.key, name: teilName(d.name, i + 2), typ: 'application/pdf', herkunft: 'bearbeitet' }, b, von)).dokument);
    }
    await this.notiere(m.id, von, 'pdf_bearbeitet', { ...was, text: pdfText(was) });
    protokoll.modul('dokumente').info('PDF bearbeitet', { id: d.id, seiten: seiten.length, vorher: info.anzahl, teile: starts.length });
    return { dokumente: [erstes, ...weitere], posten: [] as Mappe[] };
  }

  private async teilePost(post: Mappe, typ: Mappentyp, reg: Register, d: Dokument, teileBuf: Buffer[], von: string | null, z: Zugriff | undefined, was: Record<string, unknown>) {
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const posten: Mappe[] = [];
    const dokumente: Dokument[] = [];
    for (const [i, b] of teileBuf.entries()) {
      // Je Teil: neue Post mit ihrem Dokument und beiden Ereignissen (post.angelegt, dokument.hochgeladen) ganz oder gar nicht (#404).
      await this.inTransaktion(async () => {
        const neu = await this.legePostAn({
          betreff: t('meldungen.dienst.teil', { betreff, wert: i + 1 }), datum: post.werte.datum, absender: post.werte.absender ?? '', kanal: auswahlText(post.werte.kanal),
          fuer: alsListe(post.werte.fuer)[0] ?? null,
        }, { id: von, name: '' }, z, undefined, undefined, undefined, post.werte);
        await this.notiere(neu.id, von, 'post_geteilt', { text: t('meldungen.dienst.teil-von-aus', { wert: i + 1, teileBuf: teileBuf.length, betreff }), post: post.id, postTyp: typ.id });
        dokumente.push((await this.ladeHoch(neu.id, { register: reg.key, name: teilName(d.name, i + 1), typ: 'application/pdf', herkunft: 'bearbeitet' }, b, von)).dokument);
        posten.push((await this.repo.holeMappe(neu.id))!);
      });
    }
    const bezug = [...new Set([...alsListe(post.werte.bezug), ...posten.map((p) => p.id)])];
    await this.schreibeSystemMappe(typ, post.id, { bezug, stand: POST_STAND.erledigt }, von);
    await this.notiere(post.id, von, 'post_geteilt', { ...was, text: t('meldungen.dienst.in-posts-geteilt', { name: d.name, posten: posten.length }), posten: posten.map((p) => p.id), postTyp: typ.id });
    await this.postAufgaben(post.id, von);
    protokoll.modul('ablage').info('Post geteilt', { post: post.id, teile: posten.length });
    return { dokumente, posten };
  }

  /**
   * Zusammenfügen (#335): mehrere PDF-Dokumente (auch aus mehreren Mappen oder Posts) zu einem neuen
   * Dokument in `ziel` (Standard: die Mappe des ersten). `originaleEntfernen`: die Ausgangsdokumente
   * kommen in den Papierkorb (ohne Papierkorb nur mit `bestaetigt`); eine Post, die dadurch kein
   * Dokument mehr hat, ist erledigt und verweist auf das Ziel.
   */
  async fuegePdfZusammen(eingabe: unknown, von: string | null, z?: Zugriff) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : [];
    if (ids.length < 2) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-zwei-pdf'));
    if (ids.length > 100) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-100-dokumente-auf'));
    const entfernen = e.originaleEntfernen === true;
    const quellen: Array<{ d: Dokument; inhalt: Buffer }> = [];
    for (const id of ids) {
      const d = await this.repo.holeDokument(id);
      if (!d) throw new Fachfehler(404, t('meldungen.dienst.ein-gewaehltes-dokument-gibt'));
      if (z) await this.pruefeRecht(z, d.mappeId, entfernen ? 'U' : 'R');
      quellen.push(await this.pdfVon(id));
    }
    const zielId = istUuid(text(e.ziel)) ? text(e.ziel) : quellen[0].d.mappeId;
    const ziel = z ? await this.pruefeRecht(z, zielId, 'U') : await this.repo.holeMappe(zielId);
    if (!ziel) throw new Fachfehler(404, t('meldungen.dienst.die-gewaehlte-mappe-gibt'));
    const zielTyp = await this.repo.holeTyp(ziel.typId);
    const regs = zielTyp?.register.filter((r) => r.art === 'dokumente') ?? [];
    const reg = e.register ? regs.find((r) => r.key === text(e.register)) : regs.find((r) => r.key === quellen[0].d.registerKey && ziel.id === quellen[0].d.mappeId) ?? regs[0];
    if (!reg) throw new Fachfehler(422, regs.length ? t('meldungen.dienst.dieses-dokumentenregister-gibt-es-2') : t('meldungen.dienst.die-mappe-hat-kein'));
    const mappen = [...new Set(quellen.map((q) => q.d.mappeId))];
    if (entfernen) {
      for (const mid of mappen) await this.pruefeArchivDokument(mid, 'entfernen');
      if ((await this.papierkorbTage()) === 0 && e.bestaetigt !== true) {
        throw new Fachfehler(409, t('meldungen.dienst.der-papierkorb-ist-ausgeschaltet'), { rueckfrage: true, papierkorb: false });
      }
    }
    const buf = await fuegeZusammen(quellen.map((q) => q.inhalt));
    if (buf.length > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.zusammengefuegt-waere-das-pdf'));
    let name = dateiname(text(e.name) || quellen[0].d.name);
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    // Erst entfernen, dann ablegen: so bekommt das Ergebnis den Namen des ersten ohne „(2)“.
    if (entfernen) for (const q of quellen) await this.loescheDokument(q.d.id, von);
    const neu = (await this.ladeHoch(ziel.id, { register: reg.key, name, typ: 'application/pdf', herkunft: 'bearbeitet' }, buf, von)).dokument;
    const was = { dokument: neu.name, zusammengefuegt: quellen.map((q) => q.d.name), seiten: (await seitenInfo(buf)).anzahl };
    await this.notiere(ziel.id, von, 'pdf_bearbeitet', { ...was, text: t('meldungen.dienst.pdfs-zu-zusammengefuegt', { quellen: quellen.length, name: neu.name }) });
    const erledigt: string[] = [];
    if (entfernen) {
      const zielTitel = await this.titel(ziel);
      for (const mid of mappen.filter((x) => x !== ziel.id)) {
        const p = await this.repo.holeMappe(mid);
        const eintrag = p ? await this.repo.holeTyp(p.typId) : undefined;
        if (!p || eintrag?.system !== 'post' || (await this.repo.listeDokumente(mid)).length) continue;
        await this.schreibeSystemMappe(eintrag, p.id, { bezug: [...new Set([...alsListe(p.werte.bezug), ziel.id])], stand: POST_STAND.erledigt }, von);
        await this.notiere(p.id, von, 'zugeordnet', { text: t('meldungen.dienst.dokumente-zusammengefuegt-in', { zielTitel }), ziel: ziel.id, zielTyp: ziel.typId });
        await this.postAufgaben(p.id, von);
        erledigt.push(p.id);
      }
    }
    protokoll.modul('dokumente').info('PDFs zusammengefügt', { ziel: ziel.id, anzahl: quellen.length, entfernt: entfernen });
    return { dokument: neu, erledigtePost: erledigt };
  }

  /* ---------- Post fotografieren (#490) ---------- */

  /**
   * Fotos als eine Post: Aus den Fotos (in dieser Reihenfolge) wird ein PDF, daraus eine neue Post
   * (Betreff „Post vom …“, wenn keiner angegeben ist). Die Fotos kommen vom Handy einzeln über den
   * Fotostapel; ein mehrseitiger Brief ist so ein PDF und eine Post.
   */
  async postAusFotos(eingabe: unknown, fotos: Buffer[], ich: { id: string | null; name: string }, z?: Zugriff, kanal: string = POST_KANAL.hochgeladen): Promise<{ post: Mappe; dokument: Dokument; seiten: number }> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const pdf = await bilderZuPdf(fotos);
    if (pdf.length > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.als-pdf-waeren-die'));
    const betreff = text(e.betreff).replace(/[\r\n]+/g, ' ').trim().slice(0, 250) || fotoBetreff();
    const post = await this.legePostAn({ betreff, ...(e.fuer ? { fuer: e.fuer } : {}) }, ich, z, kanal);
    const typ = await this.postTyp();
    const register = typ.register.find((r) => r.art === 'dokumente')?.key;
    const dokument = (await this.ladeHoch(post.id, { register, name: `${dateiname(betreff)}.pdf`, typ: 'application/pdf', herkunft: 'hochgeladen' }, pdf, ich.id)).dokument;
    protokoll.modul('ablage').info('Post fotografiert', { mappe: post.id, seiten: fotos.length });
    return { post: (await this.repo.holeMappe(post.id))!, dokument, seiten: fotos.length };
  }

  /**
   * Seiten an ein PDF anhängen (#490, „Seite hinzufügen“; Mechanik aus #335 „zusammenfügen“): neue Version,
   * ohne Versionierung ersetzt das Ergebnis das bisherige (es kommt in den Papierkorb – verloren geht nichts,
   * alle Seiten stecken im neuen PDF). `pdfs`: weitere PDFs, `fotos`: Fotos als Seiten, in dieser Reihenfolge.
   */
  private async haengeSeitenAn(d: Dokument, inhalt: Buffer, anhang: Buffer[], von: string | null, text: string): Promise<{ dokument: Dokument; seiten: number }> {
    const { m, reg } = await this.registerVon(d).then(async (x) => ({ ...x, m: await this.repo.holeMappe(d.mappeId) }));
    if (!m || !reg) throw new Fachfehler(409, t('meldungen.dienst.das-register-dieses-dokuments'));
    await this.pruefeArchivDokument(m.id, 'ersetzen');
    const buf = await fuegeZusammen([inhalt, ...anhang]);
    if (buf.length > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.zusammen-waere-das-pdf'));
    let dokument: Dokument;
    if (reg.versionierung) dokument = await this.ersetzeDokument(d.id, { name: d.name, typ: 'application/pdf', herkunft: 'bearbeitet' }, buf, von);
    else {
      await this.loescheDokument(d.id, von);
      dokument = (await this.ladeHoch(m.id, { register: reg.key, name: d.name, typ: 'application/pdf', herkunft: 'bearbeitet' }, buf, von)).dokument;
    }
    const seiten = (await seitenInfo(buf)).anzahl;
    await this.notiere(m.id, von, 'pdf_bearbeitet', { dokument: d.name, seiten, vorher: (await seitenInfo(inhalt)).anzahl, text });
    return { dokument, seiten };
  }

  /**
   * Fotos als Seiten an eine Mappe (#490): mit `dokument` ans Ende dieses PDFs, sonst als neues PDF
   * „Fotos vom ….pdf“ im ersten Dokumentenregister (bzw. `register`).
   */
  async fotosAnMappe(mappeId: string, eingabe: unknown, fotos: Buffer[], von: string | null, z?: Zugriff): Promise<{ dokument: Dokument; seiten: number }> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const m = z ? await this.pruefeRecht(z, mappeId, 'U') : await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const neu = await bilderZuPdf(fotos);
    if (e.dokument) {
      const { d, inhalt } = await this.pdfVon(text(e.dokument));
      if (d.mappeId !== m.id) throw new Fachfehler(422, t('meldungen.dienst.das-dokument-gehoert-nicht'));
      const n = fotos.length;
      return this.haengeSeitenAn(d, inhalt, [neu], von, t('meldungen.dienst.seiten-an-angehaengt-fotografiert', { anzahl: n, name: d.name }));
    }
    const typ = await this.repo.holeTyp(m.typId);
    const regs = typ?.register.filter((r) => r.art === 'dokumente') ?? [];
    const reg = e.register ? regs.find((r) => r.key === text(e.register)) : regs[0];
    if (!reg) throw new Fachfehler(422, t('meldungen.dienst.die-mappe-hat-kein'));
    const dokument = (await this.ladeHoch(m.id, { register: reg.key, name: `${dateiname(fotoBetreff().replace(/^Post/, 'Fotos'))}.pdf`, typ: 'application/pdf', herkunft: 'hochgeladen' }, neu, von)).dokument;
    return { dokument, seiten: fotos.length };
  }

  /**
   * Zwei Posts zusammenlegen (#490): Die Seiten der zweiten Post (PDFs und Fotos, in ihrer Reihenfolge)
   * kommen ans Ende des ersten PDFs der ersten Post (hat sie keins, entsteht eins), die zweite Post kommt
   * in den Papierkorb. Andere Dateien (z. B. Word) lassen sich nicht anhängen – dann 422.
   */
  async legePostZusammen(zielId: string, eingabe: unknown, von: string | null, z?: Zugriff): Promise<{ post: Mappe; dokument: Dokument; seiten: number }> {
    const quelleId = text((eingabe as Record<string, unknown> | null)?.quelle);
    if (!istUuid(quelleId) || quelleId === zielId) throw new Fachfehler(422, t('meldungen.dienst.bitte-die-post-waehlen'));
    const ziel = z ? await this.pruefeRecht(z, zielId, 'U') : await this.repo.holeMappe(zielId);
    const quelle = z ? await this.pruefeRecht(z, quelleId, 'D') : await this.repo.holeMappe(quelleId);
    if (!ziel || !quelle) throw new Fachfehler(404, t('meldungen.dienst.diese-post-gibt-es'));
    const typ = await this.postTyp();
    if (ziel.typId !== typ.id || quelle.typId !== typ.id) throw new Fachfehler(422, t('meldungen.dienst.zusammenlegen-geht-nur-mit'));
    if (istVersendet(ziel.werte) || istVersendet(quelle.werte)) throw new Fachfehler(422, t('meldungen.dienst.versendete-e-mails-bleiben'));
    const quellDoks = await this.repo.listeDokumente(quelleId);
    if (!quellDoks.length) throw new Fachfehler(422, t('meldungen.dienst.die-gewaehlte-post-hat'));
    const fremd = quellDoks.filter((d) => d.mime !== 'application/pdf' && d.mime !== 'image/jpeg' && d.mime !== 'image/png');
    if (fremd.length) throw new Fachfehler(422, t('meldungen.dienst.ist-kein-pdf-und', { name: fremd[0].name }));
    const anhang: Buffer[] = [];
    for (const d of quellDoks) {
      const s = await this.dateien.lies(d.sha256);
      const b = Buffer.isBuffer(s) ? s : Buffer.concat(await s.toArray() as Buffer[]);
      anhang.push(d.mime === 'application/pdf' ? b : await bilderZuPdf([b]));
    }
    const zielPdf = (await this.repo.listeDokumente(zielId)).find((d) => d.mime === 'application/pdf');
    const qTitel = await this.titel(quelle);
    let erg: { dokument: Dokument; seiten: number };
    if (zielPdf) {
      const { inhalt } = await this.pdfVon(zielPdf.id);
      erg = await this.haengeSeitenAn(zielPdf, inhalt, anhang, von, t('meldungen.dienst.seiten-aus-der-post', { qTitel }));
    } else {
      const buf = await fuegeZusammen(anhang);
      const reg = typ.register.find((r) => r.art === 'dokumente')!;
      const dokument = (await this.ladeHoch(zielId, { register: reg.key, name: `${dateiname(auswahlText(ziel.werte.betreff) || 'Post')}.pdf`, typ: 'application/pdf', herkunft: 'bearbeitet' }, buf, von)).dokument;
      erg = { dokument, seiten: (await seitenInfo(buf)).anzahl };
      await this.notiere(zielId, von, 'pdf_bearbeitet', { dokument: dokument.name, seiten: erg.seiten, text: t('meldungen.dienst.seiten-aus-der-post-2', { qTitel }) });
    }
    await this.notiere(quelleId, von, 'zugeordnet', { text: t('meldungen.dienst.seiten-an-die-post', { titel: await this.titel(ziel) }), ziel: zielId, zielTyp: typ.id });
    await this.loescheMappe(quelleId, von);
    protokoll.modul('ablage').info('Posts zusammengelegt', { ziel: zielId, quelle: quelleId, seiten: erg.seiten });
    return { post: (await this.repo.holeMappe(zielId))!, ...erg };
  }

  /* ---------- PDF verkleinern (#393) ---------- */

  /** Schätzungen je Prüfwert (Analyse ist schnell, aber nicht kostenlos – die Werkbank fragt viele ab). */
  private readonly analysen = new Map<string, Analyse>();
  private async analyseVon(d: Dokument): Promise<Analyse> {
    const da = this.analysen.get(d.sha256);
    if (da) return da;
    const a = await analysiere(await this.liesGanz(d.sha256));
    if (this.analysen.size > 500) this.analysen.delete(this.analysen.keys().next().value!);
    this.analysen.set(d.sha256, a);
    return a;
  }

  /** Für den Dialog: Größe, Bilder und geschätzte Größe je Stufe; dazu, was mit dem Ergebnis geschieht. */
  async verkleinernVorschau(id: string) {
    const { d } = await this.pdfVon(id);
    const { reg } = await this.registerVon(d);
    return { id: d.id, name: d.name, ...(await this.analyseVon(d)), versioniert: !!reg?.versionierung, papierkorb: (await this.papierkorbTage()) > 0, mindestens: MIN_ERSPARNIS };
  }

  /**
   * Verkleinern am Dokument: Ergebnis als neue Version (Versionierung) bzw. – ohne Versionierung – Ersetzen
   * nach Rückfrage (`bestaetigt`), das bisherige kommt in den Papierkorb (wie „PDF bearbeiten“, #335).
   * Der Volltext bleibt (die Textebene ist unverändert), es gibt keine neue Texterkennung.
   * Bringt es weniger als 10 %, bleibt alles, wie es ist (`unveraendert: true`). `ohneOriginal` (Sammelaktion):
   * die bisherige Version nicht behalten – nur außerhalb einer Aufbewahrungsfrist.
   */
  async verkleinereDokument(id: string, eingabe: unknown, von: string | null): Promise<{ dokument: Dokument; unveraendert: boolean; vorher: number; nachher: number; stufe: Stufe; meldung: string }> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const stufe = e.stufe === undefined ? STANDARD_STUFE : stufeAus(e.stufe) ?? STANDARD_STUFE;
    const { d, inhalt } = await this.pdfVon(id);
    const { typ, reg } = await this.registerVon(d);
    if (!reg) throw new Fachfehler(409, t('meldungen.dienst.das-register-dieses-dokuments'));
    const korb = (await this.papierkorbTage()) > 0;
    if (!reg.versionierung && e.bestaetigt !== true) {
      throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-4', { wert: korb ? t('meldungen.dienst.das-bisherige-kommt-in') : t('meldungen.dienst.das-bisherige-ist-danach') }), { rueckfrage: true, papierkorb: korb });
    }
    const r = await verkleinere(inhalt, stufe);
    if (!r.lohnt) {
      const meldung = t('meldungen.dienst.laesst-sich-kaum-verkleinern', { name: d.name, round: Math.round(MIN_ERSPARNIS * 100) });
      return { dokument: d, unveraendert: true, vorher: r.vorher, nachher: r.vorher, stufe, meldung };
    }
    const ocr = d.ocr?.stand === 'fertig' ? { text: (await this.repo.volltext(d.id)) ?? '', seiten: d.ocr.seiten ?? null, info: d.ocr.info ?? null } : null;
    let neu: Dokument;
    if (reg.versionierung) {
      const v = await this.repo.ersetzeDokument(d.id, {
        name: d.name, mime: 'application/pdf', groesse: r.inhalt.length, sha256: await this.legeDateiAb(r.inhalt), anzeigbar: true,
        erstelltVon: von, herkunft: 'bearbeitet', ...(ocr ? { volltext: ocr.text } : {}),
      });
      if (ocr) await this.repo.ocrSetze(v.id, { stand: 'fertig', ...ocr });
      this.neueDateien([v]);
      neu = await this.nachNeuerVersion(d, v, typ, reg, von);
      if (e.ohneOriginal === true && (await this.archivErlaubt(d.mappeId))) {
        const alt = (await this.repo.versionenVon(d.id)).find((x) => x.nummer === v.version! - 1);
        const sha = await this.repo.loescheVersion(d.id, v.version! - 1);
        if (sha) await this.raeumeAuf(sha);
        if (sha && alt) await this.protokolliere(this.dokEintraege([versionInfo(alt)], { ...(await this.mappenInfo([d.mappeId], new Map()))(d.mappeId, d.id), schritt: 'endgueltig', weg: 'version' }), await this.loeschKontext(von));
        neu = (await this.repo.holeDokument(d.id)) ?? neu;
      }
    } else {
      await this.loescheDokument(d.id, von);
      neu = (await this.ladeHoch(d.mappeId, { register: reg.key, name: d.name, typ: 'application/pdf', herkunft: 'bearbeitet', ...(ocr ? { volltext: ocr } : {}) }, r.inhalt, von)).dokument;
      if (d.archivnummer) neu = await this.setzeArchivnummer(neu.id, d.archivnummer, von).catch(() => neu);
    }
    const text = t('meldungen.dienst.verkleinert-stufe-dpi', { ergebnisText: ergebnisText(r.vorher, r.nachher), name: STUFEN[stufe].name, dpi: STUFEN[stufe].dpi });
    await this.notiere(d.mappeId, von, 'pdf_bearbeitet', { dokument: d.name, text, verkleinert: { vorher: r.vorher, nachher: r.nachher, stufe }, seiten: r.seiten, vorher: r.seiten });
    protokoll.modul('dokumente').info('PDF verkleinert', { id: d.id, stufe, vorher: r.vorher, nachher: r.nachher, bilder: r.bilder });
    return { dokument: neu, unveraendert: false, vorher: r.vorher, nachher: r.nachher, stufe, meldung: t('meldungen.dienst.verkleinert', { ergebnisText: ergebnisText(r.vorher, r.nachher) }) };
  }

  private async legeDateiAb(inhalt: Buffer): Promise<string> {
    // Prüfsumme in Stücken (#746): PDFs nach dem Bearbeiten sind bis zu 100 MB groß.
    const sha256 = await shaVon(inhalt);
    await this.dateien.schreibe(sha256, inhalt);
    return sha256;
  }

  /** Darf eine ältere Version weg? Nicht während einer Aufbewahrungsfrist (Archivmodus, #212). */
  private async archivErlaubt(mappeId: string): Promise<boolean> {
    try { await this.pruefeArchivDokument(mappeId, 'löschen'); return true; } catch { return false; }
  }

  /** Einstellung „automatisch verkleinern“ (Werkbank → Systemzustand); Standard aus. */
  async verkleinernEinstellung(): Promise<VerkleinernEinstellung> {
    return verkleinernEinstellungAus(await this.einstellungen?.lies('verkleinern'));
  }
  async setzeVerkleinernEinstellung(eingabe: unknown): Promise<VerkleinernEinstellung> {
    if (!this.einstellungen) throw new Fachfehler(409, t('meldungen.dienst.einstellungen-sind-nicht-verfuegbar'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const abMb = Number(e.abMb);
    if (!Number.isFinite(abMb) || abMb < 1 || abMb > 100) throw new Fachfehler(422, t('meldungen.dienst.ab-welcher-groesse-1'));
    if (!istStufe(e.stufe)) throw new Fachfehler(422, t('meldungen.dienst.stufe-bildschirm-standard-oder'));
    const neu: VerkleinernEinstellung = { automatisch: e.automatisch === true, abMb: Math.round(abMb * 10) / 10, stufe: e.stufe };
    await this.einstellungen.schreibe('verkleinern', neu);
    protokoll.modul('werkbank').info('Automatisch verkleinern geändert', { ...neu });
    return neu;
  }

  /** Verkleinert ein neues PDF, wenn das eingeschaltet ist und es groß genug ist; null = unverändert lassen. */
  private async automatischVerkleinert(ein: Eingang, name: string) {
    if (erkenneAnzeigbar(ein.kopf) !== 'application/pdf') return null;
    const e = await this.verkleinernEinstellung();
    if (!e.automatisch || ein.groesse < e.abMb * MB) return null;
    try {
      const r = await verkleinere(await ein.puffer(), e.stufe);
      if (!r.lohnt) return null;
      protokoll.modul('dokumente').info('Neues PDF automatisch verkleinert', { name, vorher: r.vorher, nachher: r.nachher, stufe: e.stufe });
      return r;
    } catch (x) {
      // Lässt es sich nicht verkleinern (verschlüsselt, beschädigt), wird es so abgelegt, wie es kam.
      protokoll.modul('dokumente').warn('Automatisch verkleinern übersprungen', { name, fehler: (x as Error).message });
      return null;
    }
  }

  /**
   * Werkbank: große PDF-Dokumente nach Größe, mit geschätzter Ersparnis der Stufe. Geschätzt werden nur die
   * ersten `GROSSE_MIT_SCHAETZUNG` (die Liste soll schnell da sein); `ab` in MB.
   */
  async grosseDokumente(f: { ab?: unknown; stufe?: unknown }) {
    const ab = Number(f.ab ?? 2);
    if (!Number.isFinite(ab) || ab < 0 || ab > 100) throw new Fachfehler(422, t('meldungen.dienst.ab-0-bis-100'));
    const stufe = f.stufe === undefined || f.stufe === '' ? STANDARD_STUFE : stufeAus(f.stufe) ?? STANDARD_STUFE;
    const docs = await this.repo.grossePdfs(Math.round(ab * MB), GROSSE_MAX);
    const bezuege = await this.repo.bezuege([...new Set(docs.map((d) => d.mappeId))]);
    const eintraege = [];
    for (const [i, d] of docs.entries()) {
      let geschaetzt: number | null = null, lohnt: boolean | null = null, fehler: string | null = null;
      if (i < GROSSE_MIT_SCHAETZUNG) {
        try { const a = (await this.analyseVon(d)).stufen[stufe]; geschaetzt = a.geschaetzt; lohnt = a.lohnt; } catch (x) { fehler = (x as Error).message; }
      }
      const b = bezuege.get(d.mappeId);
      eintraege.push({ id: d.id, name: d.name, groesse: d.groesse, mappeId: d.mappeId, mappeTitel: b?.titel ?? '', typId: b?.typId ?? null, version: d.version ?? 1, geschaetzt, lohnt, fehler });
    }
    const geschaetzteErsparnis = eintraege.reduce((s, x) => s + (x.lohnt && x.geschaetzt != null ? x.groesse - x.geschaetzt : 0), 0);
    return { stufe, ab, eintraege, geschaetzteErsparnis, mehr: docs.length === GROSSE_MAX };
  }

  /** Sammelaktion „Große Dokumente verkleinern“ als Hintergrundauftrag (eine Phase, Einheit Dokumente). */
  verkleinereViele(eingabe: unknown, von: { id: string | null; email: string }) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(e.ids) ? [...new Set(e.ids.map(String))].filter(istUuid) : [];
    if (!ids.length) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-ein-dokument'));
    if (ids.length > GROSSE_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-dokumente-auf-einmal', { GROSSE_MAX }));
    const stufe = stufeAus(e.stufe ?? STANDARD_STUFE) ?? STANDARD_STUFE;
    const ohneOriginal = e.ohneOriginal === true;
    // Ohne Versionierung ersetzt das Verkleinern das Dokument – das muss hier einmal für alle bestätigt sein.
    const bestaetigt = e.bestaetigt === true;
    return this.auftraege.starte('pdf-verkleinern', `${ids.length} ${ids.length === 1 ? 'PDF' : 'PDFs'} verkleinern (${STUFEN[stufe].name})`, async (fortschritt) => {
      let vorher = 0, nachher = 0, verkleinert = 0, unveraendert = 0;
      const fehler: Array<{ id: string; name: string; grund: string }> = [];
      fortschritt(0, ids.length);
      for (const [i, id] of ids.entries()) {
        try {
          const r = await this.verkleinereDokument(id, { stufe, bestaetigt, ohneOriginal }, von.id);
          if (r.unveraendert) unveraendert++; else { verkleinert++; vorher += r.vorher; nachher += r.nachher; }
        } catch (x) {
          const d = await this.repo.holeDokument(id).catch(() => undefined);
          fehler.push({ id, name: d?.name ?? id, grund: (x as Error).message });
        }
        fortschritt(i + 1, ids.length);
      }
      protokoll.modul('werkbank').info('Große Dokumente verkleinert', { von: von.email, stufe, verkleinert, unveraendert, fehler: fehler.length, vorher, nachher });
      return { stufe, verkleinert, unveraendert, fehler, vorher, nachher, ohneOriginal };
    }, [{ key: 'dokumente', name: 'PDFs verkleinern', einheit: 'Dokumente' }]);
  }

  /* ---------- Schwärzen (#392) ---------- */

  /** Wörter mit Lage je Prüfwert (aus der Textebene; der Dialog fragt Seite für Seite). */
  private readonly schwaerzAnalysen = new Map<string, Promise<SchwaerzAnalyse>>();

  private async schwaerzbar(id: string): Promise<{ d: Dokument; inhalt: Buffer }> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!kannSchwaerzen(d.mime)) throw new Fachfehler(422, t('meldungen.dienst.laesst-sich-nicht-schwaerzen', { name: d.name }));
    return { d, inhalt: await this.liesGanz(d.sha256) };
  }

  private schwaerzAnalyseVon(d: Dokument, inhalt: () => Promise<Buffer>): Promise<SchwaerzAnalyse> {
    let p = this.schwaerzAnalysen.get(d.sha256);
    if (!p) {
      p = (async () => schwaerzAnalyse(await inhalt(), d.mime))();
      this.schwaerzAnalysen.set(d.sha256, p);
      p.catch(() => this.schwaerzAnalysen.delete(d.sha256));
      while (this.schwaerzAnalysen.size > 20) this.schwaerzAnalysen.delete(this.schwaerzAnalysen.keys().next().value!);
    }
    return p;
  }

  /** Für den Dialog: Seiten mit Größe und Wörtern (für Suchbegriffe und Vorschläge), was mit dem Ergebnis geschieht. */
  async schwaerzenVorschau(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!kannSchwaerzen(d.mime)) throw new Fachfehler(422, t('meldungen.dienst.laesst-sich-nicht-schwaerzen', { name: d.name }));
    const a = await this.schwaerzAnalyseVon(d, () => this.liesGanz(d.sha256));
    const { reg } = await this.registerVon(d);
    return { id: d.id, name: d.name, mime: d.mime, sha256: d.sha256, ...a, versioniert: !!reg?.versionierung, kopieName: geschwaerztName(d.name), muster: MUSTER };
  }

  /** Seitenbild für den Dialog (größer als die Seitenansicht; Bilder in derselben Ausrichtung wie beim Schwärzen). */
  private readonly schwaerzBilder = new Map<string, Promise<Buffer | null>>();
  async schwaerzSeitenbild(id: string, nr: number, gestempelt?: { pdf: Buffer } | null): Promise<Buffer | null> {
    if (gestempelt) return Number.isInteger(nr) && nr >= 1 && nr <= SCHWAERZEN_MAX_SEITEN ? schwaerzSeitenbild(gestempelt.pdf, 'application/pdf', nr) : null;
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!kannSchwaerzen(d.mime) || !Number.isInteger(nr) || nr < 1 || nr > SCHWAERZEN_MAX_SEITEN) return null;
    const k = `${d.sha256}:${nr}`;
    let p = this.schwaerzBilder.get(k);
    if (!p) {
      p = (async () => schwaerzSeitenbild(await this.liesGanz(d.sha256), d.mime, nr))();
      this.schwaerzBilder.set(k, p);
      p.catch(() => this.schwaerzBilder.delete(k));
      while (this.schwaerzBilder.size > 40) this.schwaerzBilder.delete(this.schwaerzBilder.keys().next().value!);
    }
    return p;
  }

  /**
   * Seitenbild der Archivfassung (#934, „Dokument übernehmen“ mit „Original | PDF/A“): wie `schwaerzSeitenbild`, aber
   * aus dem PDF/A. Steckt die Archivfassung im Original (schon PDF/A), ist es dessen Seite. null: keine Archivfassung.
   */
  async archivSeitenbild(id: string, nr: number): Promise<Buffer | null> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!Number.isInteger(nr) || nr < 1 || nr > SCHWAERZEN_MAX_SEITEN) return null;
    const info = await this.archiv?.info(d.sha256);
    if (!info) return null;
    if (info.imOriginal) return this.schwaerzSeitenbild(id, nr);
    const k = `${d.sha256}:archiv:${nr}`;
    let p = this.schwaerzBilder.get(k);
    if (!p) {
      p = (async () => { const f = await this.archiv!.lies(d.sha256); return f ? schwaerzSeitenbild(f.inhalt, 'application/pdf', nr) : null; })();
      this.schwaerzBilder.set(k, p);
      p.catch(() => this.schwaerzBilder.delete(k));
      while (this.schwaerzBilder.size > 40) this.schwaerzBilder.delete(this.schwaerzBilder.keys().next().value!);
    }
    return p;
  }

  /**
   * Schwärzen (#392): `bereiche` (Seite ab 1, x, y, b, h relativ), `begriffe` (überall schwärzen) und/oder
   * `muster` (alle Vorschläge dieser Arten) → neues Dokument „… (geschwärzt)“ im selben Register (`ziel`
   * „kopie“, Standard) oder neue Version (`ziel` „version“, nur mit Versionierung). Das Original bleibt.
   * Historie und Protokoll nennen nur Zahlen, nie die Suchbegriffe oder den geschwärzten Text.
   */
  async schwaerzeDokument(id: string, eingabe: unknown, von: string | null) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ziel = e.ziel === undefined || e.ziel === null || e.ziel === '' ? 'kopie' : e.ziel;
    if (ziel !== 'kopie' && ziel !== 'version') throw new Fachfehler(422, t('meldungen.dienst.ziel-kopie-oder-version'));
    const { d, inhalt } = await this.schwaerzbar(id);
    const { typ, reg } = await this.registerVon(d);
    if (!reg) throw new Fachfehler(409, t('meldungen.dienst.das-register-dieses-dokuments'));
    if (ziel === 'version' && !reg.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-5'));
    let begriffe: string[];
    try { begriffe = pruefeBegriffe(e.begriffe); } catch (x) { throw new Fachfehler(422, (x as Error).message); }
    const roh = e.muster === undefined || e.muster === null ? [] : Array.isArray(e.muster) ? e.muster : [e.muster];
    if (roh.some((m) => !istMuster(m))) throw new Fachfehler(422, `muster: ${Object.keys(MUSTER).join(', ')}.`);
    const muster = [...new Set(roh)] as Array<keyof typeof MUSTER>;
    const a = await this.schwaerzAnalyseVon(d, async () => inhalt);
    let bereiche: Bereich[];
    try { bereiche = pruefeBereiche(e.bereiche, a.seiten.length); } catch (x) { throw new Fachfehler(422, (x as Error).message); }
    const gefunden = begriffe.map((b) => findeBegriff(a.seiten, b));
    bereiche = [...bereiche, ...bereicheVon(a.seiten, gefunden.flat()), ...(muster.length ? bereicheVon(a.seiten, findeMuster(a.seiten, muster)) : [])];
    if (!bereiche.length) {
      throw new Fachfehler(422, begriffe.length || muster.length
        ? t('meldungen.dienst.nichts-zu-schwaerzen', { wert: begriffe.length ? (t('meldungen.dienst.keiner-der-suchbegriffe-kommt', { anzahl: begriffe.length })) : t('meldungen.dienst.keines-der-muster-kommt'), wert2: a.quelle === 'keine' ? t('meldungen.dienst.das-dokument-hat-keinen') : '' })
        : t('meldungen.dienst.nichts-zu-schwaerzen-bitte'));
    }
    const r = await schwaerze(inhalt, d.mime, a, bereiche);
    // Volltext der geschwärzten Fassung (#459): Hat jede Seite eine Textebene, gilt der Text ohne die geschwärzten
    // Wörter gleich. Sonst (Scan, Foto, gemischt) läuft sie wie ein neues Dokument durch Textebene und Paket – das
    // Paket sieht nur die geschwärzte Fassung, nie das Original.
    const volltext = r.text !== null && !a.seiten.some((s) => !s.woerter.length) ? { text: r.text, seiten: r.seiten, info: t('meldungen.dienst.textebene-nach-dem-schwaerzen') } : null;
    const stellen = stellenText(bereiche);
    let neu: Dokument;
    if (ziel === 'version') {
      const sha256 = await this.legeDateiAb(r.inhalt);
      neu = await this.inTransaktion(async () => {
        const v = await this.repo.ersetzeDokument(d.id, {
          name: d.name, mime: r.mime, groesse: r.inhalt.length, sha256, anzeigbar: true, erstelltVon: von, herkunft: 'geschwaerzt',
          ...(volltext ? { volltext: volltext.text } : {}),
        });
        if (volltext) await this.repo.ocrSetze(v.id, { stand: 'fertig', ...volltext });
        // Der Vektor (#442) stammt noch aus dem ungeschwärzten Text: weg damit; das Ereignis „Volltext fertig“
        // lässt Pakete (z. B. Ähnlichkeit) ihn aus dem geschwärzten Text neu berechnen.
        await this.repo.vektorLoesche(v.id);
        this.danach(() => this.neueDateien([v]));
        if (volltext) this.danach(() => void this.volltextFertig({ dokument: v.id, mappe: d.mappeId }, { quelle: 'kern', text: !!volltext.text.trim(), mime: r.mime, seiten: volltext.seiten ?? null }).catch(() => {}));
        const x = await this.nachNeuerVersion(d, { ...v, ocr: volltext ? { stand: 'fertig' } as Dokument['ocr'] : v.ocr }, typ, reg, von);
        await this.notiere(d.mappeId, von, 'geschwaerzt', { dokument: d.name, text: t('meldungen.dienst.geschwaerzte-fassung-als-version', { wert: x.version ?? '', name: d.name, stellen }), version: x.version, stellen: r.bereiche, seiten: r.betroffen });
        return x;
      });
    } else {
      neu = await this.inTransaktion(async () => {
        const x = (await this.ladeHoch(d.mappeId, { register: reg.key, name: geschwaerztName(d.name), typ: r.mime, herkunft: 'geschwaerzt', ...(volltext ? { volltext } : {}) }, r.inhalt, von)).dokument;
        await this.notiere(d.mappeId, von, 'geschwaerzt', { dokument: x.name, text: t('meldungen.dienst.geschwaerzte-fassung-von-erstellt', { name: x.name, name2: d.name, stellen }), quelle: d.name, stellen: r.bereiche, seiten: r.betroffen });
        return x;
      });
    }
    protokoll.modul('dokumente').info('Dokument geschwärzt', { id: d.id, neu: neu.id, ziel, stellen: r.bereiche, seiten: r.betroffen, begriffe: begriffe.length, muster });
    return {
      dokument: neu, ziel, stellen: r.bereiche, seiten: r.betroffen,
      begriffe: gefunden.map((f) => ({ gefunden: f.length })),
      meldung: ziel === 'version' ? t('meldungen.dienst.geschwaerzt-version-die', { stellen, wert: neu.version ?? '' }) : t('meldungen.dienst.angelegt-das-original-bleibt', { name: neu.name, stellen }),
    };
  }

  /* ---------- Archivnummer (#345) ---------- */

  archivKreis(): Promise<Nummernkreis> { return this.mappenArchiv.archivKreis(); }
  setzeArchivnummer(id: string, eingabe: unknown, von: string | null): Promise<Dokument> { return this.mappenArchiv.setzeArchivnummer(id, eingabe, von); }
  findeArchivnummer(eingabe: unknown, z?: Zugriff) { return this.mappenArchiv.findeArchivnummer(eingabe, z); }
  archivAufkleber(eingabe: unknown, von: string) { return this.mappenArchiv.archivAufkleber(eingabe, von); }

  /* ---------- Vollexport (#254) ---------- */

  /** Datenquelle für den Vollexport; Benutzer, Designs und Protokoll kommen von außen. */
  vollexportQuelle(e: { mandant: string; version: string; benutzer: ExportQuelle['benutzer']; designs: ExportQuelle['designs']; protokoll: ExportQuelle['protokoll']; region?: ExportQuelle['region']; z?: Zugriff }): ExportQuelle {
    const r = this.repo;
    const { z, ...x } = e;
    const bezugCache = new Map<string, MappenBezug | undefined>();
    return {
      ...x,
      typen: () => r.listeTypen(),
      sichten: () => r.listeSichten(),
      nummernkreise: () => r.listeNummernkreise(),
      pakete: () => r.listePakete(),
      mappen: (typId) => r.listeMappen(typId),
      papierkorb: () => r.papierkorb(),
      papierkorbDokumente: () => r.papierkorbDokumente(),
      loeschprotokoll: () => this.loeschprotokollAlle(),
      synonyme: () => r.synonyme(),
      automatisierungen: () => this.automatisierungenExport?.() ?? Promise.resolve([]),
      // Gebündelt (#367): ein Zugriff je Paket, nicht je Mappe oder Dokument.
      dokumente: (ids) => r.dokumenteVon(ids),
      versionen: (ids) => r.versionenVonDokumenten(ids),
      volltexte: (ids) => r.volltexte(ids),
      datei: (sha) => this.dateien.lies(sha),
      // Umgewandelte Fassungen (#577) neben dem Original – wie in der Sicherung.
      fassung: async (sha) => { const f = await this.umwandlung?.lies(sha); return f ? { mime: f.info.mime, inhalt: f.inhalt } : null; },
      // Archivfassung (#631) neben dem Original: <Datei>.pdfa.pdf; ist das Original schon PDF/A, keine zweite Datei.
      archivfassung: async (sha) => { const i = await this.archiv?.info(sha); if (!i) return null; return i.imOriginal ? { imOriginal: true } : { inhalt: (await this.archiv!.lies(sha))?.inhalt ?? null }; },
      notizen: (ids) => r.notizenVon(ids),
      aufgaben: (ids) => r.aufgabenVonMappen(ids),
      erinnerungen: () => r.erinnerungen(),
      historie: (ids) => r.historieVon(ids),
      favoriten: () => r.alleFavoriten(),
      passwort: (w) => (istVerschluesselt(w) ? this.tresor?.entschluessele(w) ?? null : null),
      pdf: async (titel, mappen, typ, uebersicht) => {
        const ids = mappen.flatMap((m) => [...verweiseVon(typ, m.werte).map((v) => v.zielId), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v));
        // Bezüge merken (#367): je Mappe ein PDF, die Ziele wiederholen sich (Benutzer, Partner).
        const fehlt = [...new Set(ids)].filter((id) => !bezugCache.has(id));
        // Mit Zugriff (persönlicher Export): Titel von Mappen, die der Benutzer nicht lesen darf, verdeckt – wie in der Oberfläche.
        if (fehlt.length) {
          const neu = await r.bezuege(fehlt);
          const sichtbar = z ? await this.maskiereBezuege(z, neu) : null;
          for (const id of fehlt) bezugCache.set(id, sichtbar ? sichtbar[id] : neu.get(id));
        }
        const b = new Map([...new Set(ids)].map((id) => [id, bezugCache.get(id)] as const));
        const quelle = { typen: new Map([[typ.id, typ]]), titel: (id: string | null | undefined) => (id ? b.get(id)?.titel ?? '' : '') };
        return mappenPdf(titel, mappen.map((m) => ({ mappe: m, typ, dokumente: [], inhalt: async () => Buffer.alloc(0) })), quelle, uebersicht ? { spalten: exportSpalten([typ], 'liste'), typen: [typ] } : null);
      },
    };
  }

  /**
   * Persönlicher Export (#255): gleiches Format wie der Vollexport, beschränkt auf Mappen, die der
   * Benutzer lesen darf; seine Aufgaben, Erinnerungen, Favoriten, sein Profil. Keine Struktur anderer
   * Benutzer, keine Protokolle. Passwörter nur, wo er sie sehen darf (und nur mit Bestätigung).
   */
  async persoenlicheQuelle(z: Zugriff, x: { mandant: string; version: string; ich: { benutzer: Array<Record<string, unknown>>; vertretungen: Vertretung[] } }): Promise<ExportQuelle> {
    const voll = this.vollexportQuelle({ mandant: x.mandant, version: x.version, benutzer: async () => x.ich, designs: async () => [], protokoll: () => [], z });
    const ich = z.ich.id;
    const mappenJeTyp = new Map<string, Mappe[]>();
    const lesbar = new Set<string>();
    const pwErlaubt = new Set<string>();
    for (const t of await this.repo.listeTypen()) {
      const alle = await this.repo.listeMappen(t.id);
      const ok = await this.lesbare(z, alle.map((m) => m.id));
      const ms = alle.filter((m) => ok.has(m.id));
      if (!ms.length) continue;
      mappenJeTyp.set(t.id, ms);
      // Rechte gebündelt je Typ (#367) statt einer Abfrage je Mappe.
      const p = await this.rechteAnVielen(z, ms);
      for (const m of ms) { lesbar.add(m.id); if (z.admin || p.get(m.id)?.P) pwErlaubt.add(m.id); }
    }
    const typen = (await this.repo.listeTypen()).filter((t) => mappenJeTyp.has(t.id));
    const passwortVon = new Map<unknown, boolean>();
    for (const [, ms] of mappenJeTyp) for (const m of ms) for (const v of Object.values(m.werte)) if (istVerschluesselt(v)) passwortVon.set(v, pwErlaubt.has(m.id));
    return {
      ...voll,
      typen: async () => typen,
      sichten: async () => [],
      nummernkreise: async () => [],
      pakete: async () => [],
      mappen: async (typId) => mappenJeTyp.get(typId) ?? [],
      papierkorb: async () => (await this.repo.papierkorb({ von: ich })),
      // Nur Eigenes (#683): Dokumente im Papierkorb, die er gelöscht hat; Löschprotokoll, Synonyme und Automatisierungen
      // gehören dem ganzen Haushalt (Werkbank) und stehen nur im Vollexport.
      papierkorbDokumente: async () => (await this.repo.papierkorbDokumente({ von: ich })),
      loeschprotokoll: undefined, synonyme: undefined, automatisierungen: undefined,
      aufgaben: async (ids) => (await this.repo.aufgabenVonMappen(ids)).filter((a) => a.empfaengerId === ich || a.erstelltVon === ich),
      erinnerungen: async () => (await this.repo.erinnerungen({ empfaengerId: ich })).filter((e) => lesbar.has(e.mappeId)),
      favoriten: async () => (await this.repo.alleFavoriten()).filter((f) => f.benutzerId === ich),
      passwort: (w) => (passwortVon.get(w) ? voll.passwort(w) : null),
    };
  }

  /* ---------- Baum-Sammlung über Verweise (#396, #424) ---------- */

  /** Datenquelle der Baum-Sammlung für einen Zugriff (Rechte des Aufrufers). */
  baumQuelle(z: Zugriff): BaumQuelle {
    const r = this.repo;
    return {
      typen: z.typen,
      mappen: (ids) => r.holeMappen(ids),
      kanten: (ids) => r.kantenVon(ids),
      lesbare: (ids) => this.lesbare(z, ids),
      bezuege: (ids) => r.bezuege(ids),
      dokumente: (ids) => r.zaehleDokumente(ids),
      rechte: (ms) => this.rechteAnVielen(z, ms),
    };
  }

  /**
   * Alle Mappen, die über Verweise an `startId` hängen (#396, #424) – innerhalb der Rechte des
   * Aufrufers. Benutzer und Rollen sind ohne Angabe von `ohneTypen` ausgenommen.
   */
  async baum(startId: string, eingabe: unknown, z: Zugriff): Promise<Baum> {
    const sys = await this.kern.system();
    const opt = bereinigeBaumOptionen(eingabe, { ...BAUM_STANDARD, ohneTypen: [sys.benutzer.id, sys.rolle.id] });
    return sammleBaum(this.baumQuelle(z), startId, opt);
  }

  /* ---------- Mappe mit allen verknüpften Mappen löschen (#424) ---------- */

  /**
   * Vorschau (#424): Baum „nach unten“ (Mappen, die auf die Start-Mappe verweisen, und so weiter), ohne
   * Benutzer und Rollen; dazu alle Verweise im Baum, welche Mappen auch an anderen hängen (🔗) und welche
   * sich grundsätzlich nicht löschen lassen. Tiefe 1–10 (Standard 5), Obergrenze max (Standard 1000).
   * Weiter geht es nur über Verweise der Art „Zugehörigkeit“; Mappen, die nur über „Bezug“ dranhängen
   * (📎, z. B. Ansprechpartner), stehen als Blatt da – bei ihnen wird nur der Verweis entfernt.
   */
  async loeschVorschau(startId: string, eingabe: unknown, z: Zugriff): Promise<LoeschVorschau> {
    const sys = await this.kern.system();
    const ohne = new Set([sys.benutzer.id, sys.rolle.id]);
    const e = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
    const opt = bereinigeBaumOptionen({ tiefe: e.tiefe, max: e.max }, { ...BAUM_STANDARD, tiefe: LOESCH_TIEFE, richtungen: ['verwiesenVon'], seitwaerts: false, ohneTypen: [...ohne], nurZugehoerigkeit: true });
    const baum = await sammleBaum(this.baumQuelle(z), startId, opt);
    const imBaum = new Set(baum.knoten.map((k) => k.id));
    const alle: LoeschKante[] = [];
    for (let i = 0; i < baum.knoten.length; i += 500) alle.push(...await this.repo.kantenVon(baum.knoten.slice(i, i + 500).map((k) => k.id)));
    const gesehen = new Set<string>();
    const kanten = alle.filter((k) => imBaum.has(k.quelleId) && imBaum.has(k.zielId) && k.quelleId !== k.zielId && !gesehen.has(`${k.quelleId}|${k.feldKey}|${k.zielId}`) && !!gesehen.add(`${k.quelleId}|${k.feldKey}|${k.zielId}`));
    // 🔗: gehört auch zu einer Mappe außerhalb – über ein Feld der Art Zugehörigkeit, über das sie im Baum
    // hängt, oder zu einer Mappe desselben Typs wie im Baum (z. B. zusätzlich zu einem anderen Vertrag).
    // Bezug-Verweise (Aussteller, Kategorie, Ablageort) und Verweise auf Benutzer zählen nicht.
    const aussenZiele = [...new Set(alle.filter((k) => imBaum.has(k.quelleId) && !imBaum.has(k.zielId)).map((k) => k.zielId))];
    const typVon = await this.repo.typenVon(aussenZiele);
    const typIm = new Map(baum.knoten.map((k) => [k.id, k.typId] as const));
    const zugehoerig = (x: LoeschKante) => verweisartVon(z.typen.get(typIm.get(x.quelleId) ?? ''), x.feldKey) === 'zugehoerigkeit';
    const geteilt = baum.knoten.filter((k) => {
      if (k.nurBezug) return false;
      const innen = kanten.filter((x) => x.quelleId === k.id && zugehoerig(x));
      if (!innen.length) return false;
      const felder = new Set(innen.map((x) => x.feldKey));
      const typen = new Set(innen.map((x) => typIm.get(x.zielId)));
      return alle.some((x) => x.quelleId === k.id && !imBaum.has(x.zielId) && zugehoerig(x) && !ohne.has(typVon.get(x.zielId) ?? '') && (felder.has(x.feldKey) || typen.has(typVon.get(x.zielId))));
    }).map((k) => k.id);
    const nichtLoeschbar: Record<string, string> = {};
    const mappen = new Map((await this.repo.holeMappen(baum.knoten.filter((k) => !k.gesperrt && k.rechte.D).map((k) => k.id))).map((m) => [m.id, m] as const));
    for (const [id, m] of mappen) {
      const typ = z.typen.get(m.typId);
      if (!darfLoeschen(typ, m)) nichtLoeschbar[id] = m.systemKennung ? t('meldungen.dienst.systemrollen-lassen-sich-nicht-2') : t('meldungen.dienst.mappen-vom-typ-lassen-3', { wert: typ?.name ?? '' });
    }
    const v = { baum, kanten, geteilt, nichtLoeschbar };
    return { ...v, vorschlag: loeschVorschlag(v), papierkorbTage: await this.papierkorbTage() };
  }

  /**
   * Ausführen (#424): dieselbe Vorschau neu sammeln, Plan aus `auswahl` (Mappen-Id → loeschen |
   * entkoppeln | behalten; was fehlt, bleibt), dann in einem Vorgang: Verweise bleibender Mappen kappen
   * (für das Wiederherstellen gemerkt) und alle Mappen samt Dokumenten in den Papierkorb. Rechte und
   * Aufbewahrungsfristen werden dabei nie übergangen. Historie und Protokoll ohne Inhalte.
   */
  async loescheMitVerknuepften(startId: string, eingabe: unknown, benutzerId: string, z: Zugriff, quelle?: Ausloeser) {
    const e = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
    if (!e.auswahl || typeof e.auswahl !== 'object') throw new Fachfehler(422, t('meldungen.dienst.bitte-die-auswahl-angeben'));
    const v = await this.loeschVorschau(startId, e, z);
    const plan = planeLoeschung(v, liesLoeschAuswahl(e.auswahl));
    if (!plan.loeschen.length) throw new Fachfehler(422, t('meldungen.dienst.nach-dieser-auswahl-wird'), { plan });
    const weg = new Set(plan.loeschen);
    const gekappt = new Set(plan.entkoppeln.map((k) => `${k.quelleId}|${k.feldKey}|${k.zielId}`));
    // Zur Sicherheit je Mappe wie beim einzelnen Löschen prüfen – mit allen Verweisen, nicht nur denen im Baum.
    const mappen = new Map((await this.repo.holeMappen(plan.loeschen)).map((m) => [m.id, m] as const));
    for (const id of plan.loeschen) {
      const m = mappen.get(id);
      if (!m) throw new Fachfehler(409, t('meldungen.dienst.eine-der-mappen-gibt'));
      const rueck = (await this.repo.rueckverweise(id)).filter((r) => !weg.has(r.quelleId) && !gekappt.has(`${r.quelleId}|${r.feldKey}|${id}`));
      const p = await this.loeschPruefung(m, z.typen.get(m.typId), rueck);
      if (!p.ok) throw new Fachfehler(p.status, t('meldungen.dienst.bitte-die-vorschau-neu', { wert: m.titel || t('meldungen.dienst.ohne-titel'), grund: p.grund }));
    }
    // Verweise bleibender Mappen entfernen (🔗 „nur Verweis entfernen“).
    const entkoppelt: Record<string, Array<{ quelleId: string; feldKey: string }>> = {};
    const jeQuelle = new Map<string, LoeschKante[]>();
    for (const k of plan.entkoppeln) jeQuelle.set(k.quelleId, [...(jeQuelle.get(k.quelleId) ?? []), k]);
    for (const [quelleId, ks] of jeQuelle) {
      const m = await this.pruefeRecht(z, quelleId, 'U');
      const typ = (await this.repo.holeTyp(m.typId))!;
      const werte = { ...m.werte };
      for (const k of ks) {
        const rest = alsListe(werte[k.feldKey]).filter((x) => x !== k.zielId);
        if (rest.length) werte[k.feldKey] = typ.felder.find((f) => f.key === k.feldKey)?.mehrfach ? rest : rest[0];
        else delete werte[k.feldKey];
        (entkoppelt[k.zielId] ??= []).push({ quelleId, feldKey: k.feldKey });
      }
      await this.schreibeVerweisWerte(typ, m, werte, benutzerId);
    }
    const vorgang = weg.has(startId) ? startId : randomUUID();
    const vorher = await this.lebendInhalt(plan.loeschen.map((id) => mappen.get(id)!));
    await this.repo.legeVorgangInPapierkorb(plan.loeschen, benutzerId, vorgang, entkoppelt);
    const kontext = await this.loeschKontext(benutzerId, { ...liesAnlass(e), ausloeser: quelle });
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'papierkorb', weg: 'verknuepft', vorgang, startId: v.baum.knoten[0].id,
      verweise: Object.fromEntries(Object.entries(entkoppelt).map(([id, l]) => [id, l.length])) }), kontext);
    const start = v.baum.knoten[0];
    const z_ = plan.zahlen;
    const text = t('meldungen.dienst.mit-verknuepften-mappen-geloescht', { mappen: z_.mappen, wert: t('meldungen.dienst.mappen', { anzahl: z_.mappen }), dokumente: z_.dokumente, wert2: t('meldungen.dienst.dokumente', { anzahl: z_.dokumente }) });
    await this.repo.historieSchreibe(plan.loeschen.map((mappeId) => ({ mappeId, benutzerId, art: 'papierkorb' as const, daten: {
      vorgang, text, ...(mappeId === start.id ? { zahlen: z_ } : { start: start.id }),
    } })));
    // Ereigniskatalog (#670): je Mappe „gelöscht“ und „mit verknüpften Mappen gelöscht“ (gleicher Vorgang).
    for (const mappeId of plan.loeschen) {
      const typ = mappen.get(mappeId)?.typId ?? null;
      await this.ereignis('mappe.geloescht', { mappe: mappeId, typ }, benutzerId);
      await this.ereignis('mappe.geloescht_verknuepft', { mappe: mappeId, typ, vorgang, start: start.id }, benutzerId);
    }
    for (const typId of new Set([...mappen.values()].map((m) => m.typId))) {
      const typ = z.typen.get(typId);
      if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    }
    const tage = await this.papierkorbTage();
    if (!tage) await this.leere(plan.loeschen, benutzerId, false, { weg: 'ausgeschaltet', kontext });
    const erinnerung = await this.loeschErinnerungAn(v, plan, benutzerId);
    protokoll.modul('ablage').info(tage ? 'Mappe mit verknüpften Mappen in den Papierkorb gelegt' : 'Mappe mit verknüpften Mappen endgültig gelöscht', {
      von: benutzerId, start: startId, vorgang, mappen: z_.mappen, dokumente: z_.dokumente, verweiseEntfernt: z_.verweise,
      bleiben: { frist: z_.frist, ohneRecht: z_.ohneRecht, verweis: z_.gehalten, abgewaehlt: z_.abgewaehlt }, abgeschnitten: v.baum.abgeschnitten || undefined,
      erinnerung: erinnerung?.datum,
    });
    return { vorgang, endgueltig: !tage, zahlen: z_, loeschen: plan.loeschen, entkoppeln: plan.entkoppeln, erinnerung };
  }

  /**
   * Erinnerung zum Fristende (#424, Option D): Blieben Mappen wegen der Aufbewahrungsfrist stehen (und damit
   * die Start-Mappe), bekommt der Löschende an der Start-Mappe eine Erinnerung (#131) zum Tag nach dem
   * spätesten Fristende; dann steht sie als Aufgabe unter „Zu erledigen“. Gibt es dieselbe schon, keine zweite.
   */
  private async loeschErinnerungAn(v: LoeschVorschau, plan: LoeschPlan, benutzerId: string): Promise<{ id: string; datum: string; text: string } | null> {
    const x = loeschErinnerung(v, plan);
    if (!x) return null;
    const startId = v.baum.knoten[0].id;
    const da = (await this.repo.erinnerungen({ mappeId: startId, empfaengerId: benutzerId })).find((e) => e.text === x.text && e.datum === x.datum);
    if (da) return { id: da.id, datum: da.datum, text: da.text };
    const r = await this.repo.legeErinnerungAn({ id: randomUUID(), mappeId: startId, empfaengerId: benutzerId, datum: x.datum, text: x.text, erstellt: '', erstelltVon: benutzerId });
    await this.notiere(startId, benutzerId, 'aufgabe', { text: t('meldungen.dienst.erinnerung-fuer-am', { name: await this.name(benutzerId), datumDe: datumDe(x.datum), text: x.text }), aufgabenart: 'erinnerung', fuer: benutzerId, aufgabentext: x.text });
    return { id: r.id, datum: r.datum, text: r.text };
  }

  /** Verweisfelder einer Mappe neu schreiben (#424) – mit Historie, Titel und Passung wie beim Speichern. */
  private async schreibeVerweisWerte(typ: Mappentyp, m: Mappe, werte: Werte, von: string | null) {
    const aenderungen = await this.aenderungen(typ, m.werte, werte);
    const neu = await this.repo.aendereMappe(m.id, werte, [], von, { basis: m.werte, verweise: (w) => verweiseVon(typ, w) });
    if (aenderungen.length) await this.notiere(m.id, von, 'geaendert', { aenderungen, stand: neu.geaendert });
    await this.aktualisiereTitel([m.id]);
    await this.passungFuer(typ, [m.id]);
  }

  /** Beim Löschen entfernte Verweise wieder setzen (#424); liefert, wie viele nicht mehr gingen. */
  private async verbindeWieder(zielId: string, liste: Array<{ quelleId: string; feldKey: string }>, von: string | null): Promise<{ wieder: number; entfallen: number }> {
    let wieder = 0; let entfallen = 0;
    const jeQuelle = new Map<string, string[]>();
    for (const x of liste) jeQuelle.set(x.quelleId, [...(jeQuelle.get(x.quelleId) ?? []), x.feldKey]);
    for (const [quelleId, felder] of jeQuelle) {
      const m = await this.repo.holeMappe(quelleId);
      const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
      if (!m || !typ || !(await this.repo.holeMappe(zielId))) { entfallen += felder.length; continue; }
      const werte = { ...m.werte };
      for (const key of felder) {
        const f = typ.felder.find((x) => x.key === key && x.typ === 'referenz');
        const da = alsListe(werte[key]);
        if (!f) { entfallen++; continue; }
        if (da.includes(zielId)) { wieder++; continue; }
        if (f.mehrfach) { werte[key] = [...da, zielId]; wieder++; }
        else if (!da.length) { werte[key] = zielId; wieder++; }
        else entfallen++;
      }
      await this.schreibeVerweisWerte(typ, m, werte, von);
    }
    return { wieder, entfallen };
  }

  /**
   * Einen ganzen Vorgang (#424) wiederherstellen: alle Mappen mit ihren Dokumenten und Verweisen, dazu die
   * beim Löschen entfernten Verweise bleibender Mappen. Rechte wie beim einzelnen Wiederherstellen.
   */
  async stelleVorgangWiederHer(vorgang: string, ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser) {
    const eintraege = (await this.repo.papierkorb(alle && ich.rolle === 'admin' ? {} : { von: ich.id })).filter((e) => e.vorgang === vorgang);
    if (!istUuid(vorgang) || !eintraege.length) throw new Fachfehler(404, t('meldungen.dienst.diesen-vorgang-gibt-es'));
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const fehlt = eintraege.find((e) => !typen.has(e.typId));
    if (fehlt) throw new Fachfehler(409, t('meldungen.dienst.den-mappentyp-von-gibt', { wert: fehlt.titel || t('meldungen.dienst.ohne-titel') }));
    const ids = eintraege.map((e) => e.id);
    const { verweiseEntfallen } = await this.repo.stelleMehrereWiederHer(ids);
    await this.repo.historieSchreibe(ids.map((mappeId) => ({ mappeId, benutzerId: ich.id, art: 'wiederhergestellt' as const, daten: { vorgang } })));
    for (const e of eintraege) await this.ereignis('mappe.wiederhergestellt', { mappe: e.id, typ: e.typId }, ich.id);
    await this.protokolliere(eintraege.map((e) => this.wiederEintrag(e, typen.get(e.typId), vorgang)), await this.loeschKontext(ich.id, { ausloeser: quelle }));
    await this.aktualisiereTitel(ids);
    let wieder = 0; let entfallen = verweiseEntfallen;
    for (const e of eintraege) if (e.entkoppelt.length) { const r = await this.verbindeWieder(e.id, e.entkoppelt, ich.id); wieder += r.wieder; entfallen += r.entfallen; }
    for (const typId of new Set(eintraege.map((e) => e.typId))) await this.passungFuer(typen.get(typId)!, eintraege.filter((e) => e.typId === typId).map((e) => e.id));
    protokoll.modul('ablage').info('Vorgang aus dem Papierkorb wiederhergestellt', { von: ich.id, vorgang, mappen: ids.length, verweiseWieder: wieder, verweiseEntfallen: entfallen || undefined });
    return { mappen: ids.length, verweiseWieder: wieder, verweiseEntfallen: entfallen, startId: ids.includes(vorgang) ? vorgang : null };
  }

  /* ---------- Datenschutz: Auskunft nach Art. 15 DSGVO (#396) ---------- */

  async datenschutz(): Promise<Datenschutz> { return liesDatenschutz(await this.einstellungen?.lies('datenschutz')); }

  async setzeDatenschutz(eingabe: unknown, von: string): Promise<Datenschutz> {
    const sys = await this.kern.system();
    const typen = new Set((await this.repo.listeTypen()).filter((t) => t.id !== sys.benutzer.id && t.id !== sys.rolle.id).map((t) => t.id));
    const d = liesDatenschutz(eingabe);
    d.typen = Object.fromEntries(Object.entries(d.typen).filter(([id]) => typen.has(id)));
    await this.einstellungen?.schreibe('datenschutz', d);
    protokoll.modul('datenschutz').info('Einstellungen für Auskünfte gespeichert', { von, personentypen: personenTypen(d).length });
    return d;
  }

  /** Inhalte je Mappe für die Prüfliste: Dokumente, Notizen, Historie, Hinweis auf Dritte. */
  private async auskunftInhalte(ids: string[], typen: Map<string, Mappentyp>, dritte: Map<string, string[]>): Promise<Record<string, AuskunftMappe>> {
    const r = this.repo;
    const mappen = new Map((await r.holeMappen(ids)).map((m) => [m.id, m] as const));
    const erg: Record<string, AuskunftMappe> = {};
    for (const id of ids) erg[id] = { dokumente: [], notizen: [], historie: 0, dritte: dritte.get(id) ?? [], ohneFelder: [] };
    for (let i = 0; i < ids.length; i += 500) {
      const teil = ids.slice(i, i + 500);
      const [doks, notizen, historie] = await Promise.all([r.dokumenteVon(teil), r.notizenVon(teil), r.historieVon(teil)]);
      const geschwaerzt = new Map<string, string>();
      for (const d of doks) if (d.herkunft === 'geschwaerzt') geschwaerzt.set(`${d.mappeId}|${d.name}`, d.id);
      for (const d of doks) {
        const typ = typen.get(mappen.get(d.mappeId)?.typId ?? '');
        erg[d.mappeId]?.dokumente.push({
          id: d.id, name: d.name, register: typ?.register.find((x) => x.key === d.registerKey)?.name ?? d.registerKey, mime: d.mime, groesse: d.groesse,
          geschwaerzt: d.herkunft === 'geschwaerzt',
          geschwaerzteFassung: d.herkunft === 'geschwaerzt' ? null : geschwaerzt.get(`${d.mappeId}|${geschwaerztName(d.name)}`) ?? null,
          aeltere: d.aeltere ?? 0, schwaerzbar: kannSchwaerzen(d.mime),
        });
      }
      for (const n of notizen) erg[n.mappeId]?.notizen.push({ id: n.id, erstellt: n.erstellt, text: alsText(n.text).slice(0, 300) });
      for (const h of historie) if (erg[h.mappeId]) erg[h.mappeId].historie++;
    }
    for (const [id, m] of mappen) {
      const typ = typen.get(m.typId);
      erg[id].ohneFelder = (typ?.felder ?? []).filter((f) => f.typ === 'passwort' && !istLeer(m.werte[f.key])).map((f) => f.label);
    }
    return erg;
  }

  /**
   * Prüfliste einer Auskunft (#396, #472): Baum ab der Mappe des Betroffenen (Tiefe einstellbar, Vorgabe 2,
   * beide Richtungen, nach oben nie wieder nach unten, ohne Benutzer und Rollen), nur über Verweise der Art
   * Zugehörigkeit weiter – Bezug-Mappen stehen als Blatt da (`nurBezug`). Je Mappe Dokumente, Notizen,
   * Historie. Keine Volltext-Vorschläge mehr (#472); die Eingabe `vorschlaege` wird ignoriert.
   */
  async auskunftVorschau(e: unknown, z: Zugriff): Promise<AuskunftVorschau> {
    const o = (e ?? {}) as Record<string, unknown>;
    const mappeId = String(o.mappeId ?? '');
    const sys = await this.kern.system();
    const ohne = new Set([sys.benutzer.id, sys.rolle.id]);
    const baum = await this.baum(mappeId, { tiefe: o.tiefe, richtungen: o.richtungen, max: 1000, seitwaerts: false, ohneTypen: [...ohne], nurZugehoerigkeit: true }, z);
    const im = new Set(baum.knoten.map((k) => k.id));
    // „Daten Dritter?“: Nachbarn außerhalb der Sammlung, die selbst eine Person sind (Mappentyp „betrifft eine Person“).
    const person = new Set(personenTypen(await this.datenschutz()));
    const dritte = new Map(baum.knoten.map((k) => [k.id, [...new Set([...k.aussen.verweistAuf, ...k.aussen.verwiesenVon]
      .filter((a) => !!a.typId && person.has(a.typId) && !ohne.has(a.typId)).map((a) => a.titel))]] as [string, string[]]));
    const mappen = await this.auskunftInhalte([...im], z.typen, dritte);
    return { baum, mappen, frist: fristBis(heuteIn()) };
  }

  /**
   * Auskunft vorbereiten (#396): Auswahl gegen eine frische Sammlung prüfen und die Daten für die ZIP
   * zusammenstellen. Passwortfelder und verschlüsselte Werte fallen weg (auch aus den Mappentypen),
   * ältere Versionen von Dokumenten ebenso.
   */
  async auskunftDaten(e: unknown, z: Zugriff, x: { mandant: string; version: string }): Promise<AuskunftDaten> {
    const o = (e ?? {}) as Record<string, unknown>;
    if (o.geprueft !== true) throw new Fachfehler(422, t('meldungen.dienst.bitte-bestaetige-dass-du'));
    const vorschau = await this.auskunftVorschau({ mappeId: o.mappeId, tiefe: o.tiefe, richtungen: o.richtungen }, z);
    const bekannt = vorschau.mappen;
    const bezug = new Map(vorschau.baum.knoten.filter((k) => k.nurBezug && k.ueber).map((k) => [k.id, k] as const));
    const a = liesAuswahl(o.auswahl);
    const p = auskunftProbleme(a, bekannt, new Set(bezug.keys()));
    if (p.length) throw new Fachfehler(422, p.join(' '));
    // Bezug-Mappen (#472), die nicht ganz aufgenommen sind: nur Art, Titel und Feld.
    const erwaehnungen: AuskunftErwaehnung[] = a.erwaehnungen.filter((id) => !a.mappen.includes(id)).map((id) => bezug.get(id)!)
      .map((k) => ({ mappeId: k.id, typ: k.typ, titel: k.titel, feld: k.ueber!.feld, richtung: k.ueber!.richtung }));
    const passwort = typeof o.passwort === 'string' && o.passwort ? o.passwort : null;
    if (passwort && passwort.length < AUSKUNFT_PASSWORT_MIN) throw new Fachfehler(422, t('meldungen.dienst.das-passwort-fuer-die', { AUSKUNFT_PASSWORT_MIN }));
    const start = (await this.repo.holeMappe(vorschau.baum.startId))!;
    const ds = await this.datenschutz();
    const ohneGeheim = (t: Mappentyp, w: Werte): Werte => Object.fromEntries(Object.entries(w).filter(([k, v]) => !istVerschluesselt(v) && t.felder.find((f) => f.key === k)?.typ !== 'passwort'));
    const mappen = (await this.repo.holeMappen(a.mappen)).filter((m) => z.typen.has(m.typId)).map((m) => ({ ...m, werte: ohneGeheim(z.typen.get(m.typId)!, m.werte) }));
    const typIds = new Set(mappen.map((m) => m.typId));
    const typen = [...typIds].map((id) => z.typen.get(id)!).map((t) => {
      const { berechtigungen: _b, stempel: _s, darfAnlegen: _d, ...rest } = t;
      return { ...rest, felder: t.felder.filter((f) => f.typ !== 'passwort') } as Mappentyp;
    });
    const dok = new Set(a.dokumente); const not = new Set(a.notizen); const hist = new Set(a.historie);
    const mitZurueckgehaltenen = new Set(Object.entries(bekannt).filter(([id, x]) => a.mappen.includes(id) && x.notizen.some((n) => !not.has(n.id))).map(([id]) => id));
    const jeTyp = new Map<string, Mappe[]>();
    for (const m of mappen) jeTyp.set(m.typId, [...jeTyp.get(m.typId) ?? [], m]);
    const voll = this.vollexportQuelle({ mandant: x.mandant, version: x.version, benutzer: async () => ({ benutzer: [], vertretungen: [] }), designs: async () => [], protokoll: () => [] });
    const quelle: ExportQuelle = {
      ...voll,
      typen: async () => typen, sichten: async () => [], nummernkreise: async () => [], pakete: async () => [],
      mappen: async (typId) => jeTyp.get(typId) ?? [],
      papierkorb: async () => [], papierkorbDokumente: async () => [],
      // Nicht für Dritte (#683): Löschprotokoll, Synonyme und Automatisierungen betreffen den ganzen Haushalt.
      loeschprotokoll: undefined, synonyme: undefined, automatisierungen: undefined,
      dokumente: async (ids) => (await this.repo.dokumenteVon(ids)).filter((d) => dok.has(d.id)),
      versionen: async () => [],
      // Die Auskunft enthält die Dokumente, wie sie abgelegt sind – ohne Fassungen von Paketen (#577).
      fassung: undefined,
      archivfassung: undefined,
      notizen: async (ids) => (await this.repo.notizenVon(ids)).filter((n) => not.has(n.id)),
      aufgaben: async () => [], erinnerungen: async () => [], favoriten: async () => [],
      // Historie: ohne frühere Auskünfte (deren Begründungen sind intern); Mappen mit zurückgehaltenen
      // Notizen ohne Notiz-Einträge – die Historie nennt den Text einer Notiz.
      historie: async (ids) => (await this.repo.historieVon(ids)).filter((h) => hist.has(h.mappeId) && h.art !== 'auskunft' && !(h.art === 'notiz' && mitZurueckgehaltenen.has(h.mappeId))),
      passwort: () => null,
    };
    // Herkunft (Kanal der Post) und Speicherdauer (Archivmodus) für das Deckblatt.
    const post = (await this.kern.system()).post;
    const kanaele: Record<string, number> = {};
    for (const m of jeTyp.get(post.id) ?? []) { const k = auswahlText(m.werte.kanal) || 'unbekannt'; kanaele[k] = (kanaele[k] ?? 0) + 1; }
    const dokumente = (await this.repo.dokumenteVon(a.mappen)).filter((d) => dok.has(d.id));
    const ziele = mappen.flatMap((m) => [...verweiseVon(z.typen.get(m.typId)!, m.werte).map((v) => v.zielId), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v));
    const titel = Object.fromEntries(Object.entries(await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(ziele)]))).map(([id, b]) => [id, b.titel]));
    return {
      titel,
      start: { id: start.id, titel: start.titel ?? '', typ: z.typen.get(start.typId)?.name ?? '' },
      datenschutz: ds, quelle, mappen, typen, kanaele, passwort,
      erwaehnungen,
      anzahl: { mappen: mappen.length, dokumente: dokumente.length, bytes: dokumente.reduce((s, d) => s + d.groesse, 0), notizen: not.size, historie: hist.size, ohneNotizen: a.ohneNotizen.filter((n) => !not.has(n.id)).length, erwaehnungen: erwaehnungen.length },
      gruende: a.ohneNotizen.filter((n) => !not.has(n.id)).map((n) => n.grund),
      empfaenger: typeof o.empfaenger === 'string' ? o.empfaenger.trim().slice(0, 2000) : ds.empfaenger,
      anmerkung: typeof o.anmerkung === 'string' ? o.anmerkung.trim().slice(0, 2000) : '',
      aufbewahrung: typen.map((t) => {
        const bis = (jeTyp.get(t.id) ?? []).map((m) => aufbewahrenBis(t.archiv, m)).filter((b): b is string => !!b).sort();
        return { typ: t.name, archiv: t.archiv ? { jahre: t.archiv.jahre, stichtag: t.archiv.stichtag ? t.felder.find((f) => f.key === t.archiv!.stichtag)?.label ?? t.archiv.stichtag : null } : null, bis: bis.at(-1) ?? null };
      }),
    };
  }

  /** Nachweis (#396): Historie des Betroffenen und Protokoll – nur Zahlen, keine Inhalte. */
  async auskunftNachweis(d: AuskunftDaten, von: { id: string; email: string }, info: { id: string; bytes: number }) {
    const n = d.anzahl;
    await this.notiere(d.start.id, von.id, 'auskunft', {
      text: t('meldungen.dienst.auskunft-nach-art-15', { mappen: n.mappen, wert: t('meldungen.dienst.mappen', { anzahl: n.mappen }), dokumente: n.dokumente, wert2: t('meldungen.dienst.dokumente', { anzahl: n.dokumente }) }),
      mappen: n.mappen, dokumente: n.dokumente, notizen: n.notizen, historie: n.historie, ohneNotizen: n.ohneNotizen, ...(n.erwaehnungen ? { erwaehnungen: n.erwaehnungen } : {}),
      ...(d.gruende.length ? { gruende: d.gruende } : {}), verschluesselt: !!d.passwort, auskunft: info.id,
    });
    protokoll.modul('datenschutz').info('Auskunft erstellt', { mappeId: d.start.id, mappen: n.mappen, dokumente: n.dokumente, notizen: n.notizen, ohneNotizen: n.ohneNotizen, verschluesselt: !!d.passwort, mb: Math.round(info.bytes / MB), von: von.email });
  }

  /** Frist (#396): Aufgabe „Auskunft an … bis <Eingang + 1 Monat>“ am Betroffenen, für den Administrator. */
  async auskunftFrist(e: unknown, z: Zugriff, von: string): Promise<Aufgabe> {
    const o = (e ?? {}) as Record<string, unknown>;
    const m = await this.pruefeRecht(z, String(o.mappeId ?? ''), 'R');
    const eingang = typeof o.eingang === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.eingang) ? o.eingang : heuteIn();
    const bis = fristBis(eingang);
    const text = t('meldungen.dienst.auskunft-nach-art-15-2', { wert: m.titel || t('meldungen.dienst.ohne-titel'), datumText: datumText(bis), datumText2: datumText(eingang) });
    // feldKey (#668): so findet die Liste der Auskünfte die Antwortfrist wieder.
    const a = await this.neueAufgabe({ id: randomUUID(), mappeId: m.id, empfaengerId: von, art: 'manuell', feldKey: FRIST_SCHLUESSEL, text, datum: bis, erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null });
    await this.notiere(m.id, von, 'aufgabe', { text: t('meldungen.dienst.fuer', { name: await this.name(von), text }), aufgabe: a.id, aufgabenart: 'manuell', fuer: von, aufgabentext: text });
    return this.leiteUm(a);
  }

  /**
   * Liste der Auskünfte (#668): aus Historie (Nachweis auch nach dem Löschen der ZIP), bereitliegenden Dateien und
   * offenen Antwortfristen. `laufend`: der gerade erzeugte Auftrag (nur einer zur Zeit).
   */
  async auskunftVerzeichnis(bereit: AuskunftStand[], laufend?: { id: string; titel: string; gestartet: string } | null): Promise<AuskunftEintrag[]> {
    const historie = await this.repo.historieArt('auskunft', 2000);
    const fristen = (await this.repo.offeneAufgaben({})).filter((a) => a.art === 'manuell' && (a.feldKey === FRIST_SCHLUESSEL || a.text.startsWith(FRIST_TEXT_ANFANG)));
    const ids = [...new Set([...historie.map((h) => h.mappeId), ...historie.map((h) => h.benutzerId).filter((x): x is string => !!x), ...fristen.map((f) => f.mappeId)])];
    const titel = await this.repo.titelVon(ids);
    const namen = new Map([...titel].map(([k, v]) => [k, v.replace(/ \(ehemalig\)$/, '')]));
    return auskunftVerzeichnis({
      historie: historie.map((h) => ({ mappeId: h.mappeId, zeit: h.zeit, benutzerId: h.benutzerId, daten: h.daten as Record<string, unknown> })),
      bereit, titel, namen, laufend: laufend ?? null,
      fristen: fristen.map((f) => ({ id: f.id, mappeId: f.mappeId, mappeTitel: f.mappeTitel, datum: f.datum ?? null, erstellt: f.erstellt })),
    });
  }

  /** Nachweis (#668): Herunterladen bzw. Löschen einer Auskunft in der Historie der Person – ohne Inhalte. */
  async auskunftNotiz(stand: { id: string; mappeId: string }, von: string, art: 'download' | 'geloescht') {
    await this.notiere(stand.mappeId, von, 'auskunft', art === 'download'
      ? { text: t('meldungen.dienst.auskunft-heruntergeladen'), zustellung: 'download', auskunft: stand.id }
      : { text: t('meldungen.dienst.auskunft-geloescht'), geloescht: true, auskunft: stand.id });
  }

  /* ---------- Auskunft zustellen (#455): per E-Mail oder Abruf-Link mit Abrufcode ---------- */

  /** Abruf-Links für die Werkbank – ohne die Hashes von Schlüssel und Code. */
  async auskunftLinks(f?: { mappeId?: string; auskunftId?: string; max?: number }): Promise<AuskunftLink[]> {
    return (await this.repo.auskunftLinks(f)).map(({ schluessel: _s, code: _c, ...l }) => l);
  }

  /** Gilt für diese Auskunft gerade ein Abruf-Link? Dann bleibt die ZIP nach dem eigenen Herunterladen liegen. */
  async auskunftLinkAktiv(auskunftId: string): Promise<boolean> {
    return (await this.repo.auskunftLinks({ auskunftId })).some((l) => linkStatus(l) === 'aktiv');
  }

  /**
   * Weg 1 (#455): die ZIP als Anhang über den E-Mail-Versand des DMS – nur verschlüsselt; das Passwort
   * kennt das DMS nicht und schickt es darum auch nie mit. Zu groß für E-Mail → Abruf-Link.
   */
  async auskunftPerEmail(stand: AuskunftStand & { name: string }, datei: () => Promise<Readable>, eingabe: unknown, ich: { id: string; name: string; email: string }, mailer: Mailer | null) {
    if (!mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand-2'));
    if (!stand.verschluesselt) throw new Fachfehler(422, t('meldungen.dienst.per-e-mail-geht'));
    if (stand.bytes > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, t('meldungen.dienst.die-auskunft-ist-mit', { round: Math.round(stand.bytes / 1e6), round2: Math.round(EMAIL_MAX_ANHAENGE / 1e6) }));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const vorlage = auskunftMail.zip((await this.datenschutz()).anrede);
    const { an, betreff, nachricht } = Dienst.emailKopf({ betreff: vorlage.betreff, nachricht: vorlage.nachricht, ...e });
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge: [{ name: `${stand.name}.zip`, mime: 'application/zip', inhalt: await datei() }] });
    } catch (x) {
      throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-wurde', { message: (x as Error).message }));
    }
    await this.notiere(stand.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.auskunft-per-e-mail', { an: an.join(', '), max: Math.max(1, Math.round(stand.bytes / KB)) }), zustellung: 'email', an, betreff, auskunft: stand.id, bytes: stand.bytes });
    protokoll.modul('datenschutz').info('Auskunft per E-Mail gesendet', { mappeId: stand.mappeId, empfaenger: an.length, mb: Math.round(stand.bytes / MB), von: ich.email });
    return { an };
  }

  /**
   * Weg 2 (#455): Abruf-Link für genau diese Auskunft. Schlüssel (256 Bit) und Abrufcode liefert nur diese
   * Antwort im Klartext; gespeichert sind ihre Hashes. Ein noch gültiger Link derselben Auskunft wird
   * zurückgezogen. Mit `senden` geht der Link (ohne Code) per E-Mail an die Person.
   */
  async auskunftLinkAnlegen(stand: AuskunftStand, eingabe: unknown, ich: { id: string; name: string; email: string }, x: { adresse: string; mailer: Mailer | null }) {
    const e = liesLinkEingabe(eingabe);
    if (e.fehler.length) throw new Fachfehler(422, e.fehler.join(' '));
    if (e.senden && !x.mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand-3'));
    if (e.senden && !istEmail(e.an)) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-gueltige-e'));
    if (!x.adresse) throw new Fachfehler(409, t('meldungen.dienst.die-adresse-von-ablago'));
    for (const alt of await this.repo.auskunftLinks({ auskunftId: stand.id })) {
      if (linkStatus(alt) === 'aktiv' && (await this.repo.widerrufeAuskunftLink(alt.id))) await this.notiere(alt.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.abruf-link-zurueckgezogen-ersetzt'), zustellung: 'link', link: alt.id, auskunft: stand.id });
    }
    const schluessel = neuerSchluessel();
    const code = e.code ?? neuerAbrufcode();
    const jetzt = new Date();
    const link: AuskunftLinkIntern = {
      id: randomUUID(), auskunftId: stand.id, mappeId: stand.mappeId, titel: stand.titel, schluessel: hasheSchluessel(schluessel), code: await hashePasswort(code),
      codeArt: e.code ? 'eigen' : 'erzeugt', empfaenger: e.an || null, erstellt: jetzt.toISOString(), erstelltVon: ich.id,
      ablauf: new Date(jetzt.getTime() + e.tage * 24 * 3600 * 1000).toISOString(), maxAbrufe: e.abrufe, abrufe: 0, fehlversuche: 0, gesperrt: null, widerrufen: null, abgerufen: null,
    };
    await this.repo.legeAuskunftLinkAn(link);
    const url = `${x.adresse.replace(/\/+$/, '')}/abruf#${schluessel}`;
    const bis = datumText(link.ablauf.slice(0, 10));
    if (e.senden) {
      const ds = await this.datenschutz();
      const m = auskunftMail.link(ds.anrede, url, bis, link.maxAbrufe, ds.verantwortlicher);
      const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
      try { await x.mailer!.sende(e.an, m.betreff, m.nachricht, { antwortAn }); } catch (f) {
        await this.repo.widerrufeAuskunftLink(link.id);
        throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-mit', { message: (f as Error).message }));
      }
    }
    await this.notiere(stand.mappeId, ich.id, 'auskunft', {
      text: t('meldungen.dienst.abruf-link-erstellt-gueltig', { anzahl: link.maxAbrufe, bis, wert: e.senden ? t('meldungen.dienst.per-e-mail-an', { an: e.an }) : '', wert2: link.codeArt === 'eigen' ? t('meldungen.dienst.eigener-abrufcode') : '' }),
      zustellung: 'link', link: link.id, auskunft: stand.id, ablauf: link.ablauf, maxAbrufe: link.maxAbrufe, ...(e.senden ? { an: [e.an] } : {}),
    });
    protokoll.modul('datenschutz').info('Abruf-Link erstellt', { mappeId: stand.mappeId, link: link.id, tage: e.tage, abrufe: e.abrufe, code: link.codeArt, mail: e.senden, von: ich.email });
    const { schluessel: _s, code: _c, ...ohne } = link;
    // Eigener Code: so zurück, wie er eingegeben wurde (#666) – der Abruf vergleicht ohnehin normiert.
    return { link: ohne as AuskunftLink, url, code: e.codeWieEingegeben ?? code, gesendet: e.senden };
  }

  /** Zurückziehen (#455): Der Link gilt sofort nicht mehr; die Zeile bleibt als Nachweis. */
  async auskunftLinkWiderrufen(id: string, ich: { id: string; email: string }): Promise<AuskunftLink> {
    const [l] = await this.repo.auskunftLinks({ id, max: 1 });
    if (!l) throw new Fachfehler(404, t('meldungen.dienst.diesen-abruf-link-gibt'));
    if (await this.repo.widerrufeAuskunftLink(id)) {
      await this.notiere(l.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.abruf-link-zurueckgezogen'), zustellung: 'link', link: id, auskunft: l.auskunftId });
      protokoll.modul('datenschutz').info('Abruf-Link zurückgezogen', { mappeId: l.mappeId, link: id, von: ich.email });
    }
    return (await this.auskunftLinks({ auskunftId: l.auskunftId })).find((x) => x.id === id)!;
  }

  /**
   * Öffentliche Abrufseite (#455): Schlüssel und Abrufcode prüfen. Unbekannter Schlüssel, falscher Code und
   * gesperrter Link sehen nach außen gleich aus („falsch“) und kosten gleich viel Zeit (scrypt auch ohne
   * Treffer). Ein gesperrter Link prüft den Code gar nicht mehr. Erst mit richtigem Code sagt die Antwort,
   * dass der Link abgelaufen, verbraucht oder zurückgezogen ist. Jeder Versuch an einem bekannten Link
   * steht in der Historie (ohne IP, ohne Code).
   */
  async auskunftAbrufPruefen(schluessel: unknown, code: unknown, platz: () => (() => void) | null = () => () => {}): Promise<{ art: 'ok' | 'falsch' | 'ungueltig' | 'beschaeftigt'; link?: AuskunftLinkIntern }> {
    const s = typeof schluessel === 'string' && SCHLUESSEL_MUSTER.test(schluessel) ? schluessel : null;
    const c = normiereCode(code);
    const link = s ? await this.repo.auskunftLinkPerSchluessel(hasheSchluessel(s)) : undefined;
    // Ohne gültigen Link kein scrypt: Den 256-Bit-Schlüssel kann niemand erraten, ein gleicher Zeitaufwand
    // schützt hier nichts – er würde nur die Abrufseite zum Hebel für Last machen.
    if (!link || link.gesperrt || link.fehlversuche >= LINK_FEHLVERSUCHE_MAX) return { art: 'falsch' };
    // Je Link nur eine Prüfung gleichzeitig: Parallele Versuche könnten sonst alle vor dem Hochzählen
    // lesen und so mehr als LINK_FEHLVERSUCHE_MAX Codes ausprobieren.
    // Und insgesamt nur wenige scrypt-Prüfungen gleichzeitig (Platz vergibt die Bremse der Route).
    const frei = platz();
    if (!frei) return { art: 'beschaeftigt' };
    // Belegt in der Datenbank (#744), damit auch ein zweiter Prozess wartet; die Frist gibt den Platz frei, falls ein
    // Prozess mittendrin endet.
    if (!(await this.kurzzustand.belege(ABRUF_PRUEFUNG, link.id, ABRUF_PRUEFUNG_MS).catch((e) => { frei(); throw e; }))) { frei(); return { art: 'beschaeftigt' }; }
    try { return await this.auskunftAbrufCode(link, c); } finally { await this.kurzzustand.loesche(ABRUF_PRUEFUNG, link.id).catch(() => {}); frei(); }
  }

  private async auskunftAbrufCode(link: AuskunftLinkIntern, c: string): Promise<{ art: 'ok' | 'falsch' | 'ungueltig'; link?: AuskunftLinkIntern }> {
    if (!c || !(await pruefePasswort(c, link.code))) {
      const f = await this.repo.auskunftLinkFehlversuch(link.id, LINK_FEHLVERSUCHE_MAX);
      const gesperrt = !!f?.gesperrt;
      await this.notiere(link.mappeId, null, 'auskunft', { text: t('meldungen.dienst.abruf-fehlgeschlagen-falscher', { wert: gesperrt ? t('meldungen.dienst.link-nach-fehlversuchen-gesperrt', { fehlversuche: f!.fehlversuche }) : '' }), zustellung: 'abruf', erfolg: false, link: link.id, auskunft: link.auskunftId });
      if (gesperrt) {
        protokoll.modul('datenschutz').warn('Abruf-Link nach Fehlversuchen gesperrt', { mappeId: link.mappeId, link: link.id, versuche: f!.fehlversuche });
        await this.auskunftMelden(link, t('meldungen.dienst.abruf-link-fuer-die', { wert: link.titel || t('meldungen.dienst.ohne-titel'), fehlversuche: f!.fehlversuche }), 'gesperrt');
      }
      return { art: 'falsch', link };
    }
    const st = linkStatus(link);
    if (st !== 'aktiv') {
      await this.notiere(link.mappeId, null, 'auskunft', { text: t('meldungen.dienst.abruf-versucht-aber-der', { LINK_STATUS: LINK_STATUS[st] }), zustellung: 'abruf', erfolg: false, link: link.id, auskunft: link.auskunftId });
      return { art: 'ungueltig', link };
    }
    return { art: 'ok', link };
  }

  async auskunftLinkMitId(id: string): Promise<AuskunftLinkIntern | undefined> { return (await this.repo.auskunftLinks({ id, max: 1 }))[0]; }

  /** Einen Abruf zählen, solange der Link gilt (atomar); null = gilt nicht mehr. */
  auskunftAbrufZaehlen(id: string): Promise<number | null> { return this.repo.auskunftLinkAbruf(id); }

  /** Nachweis eines Abrufs (#455): Historie und Benachrichtigung an Ersteller und Favoriten-Inhaber. */
  async auskunftAbgerufen(link: AuskunftLink, nr: number, vollstaendig: boolean, standVon?: string) {
    await this.notiere(link.mappeId, null, 'auskunft', {
      text: vollstaendig ? t('meldungen.dienst.auskunft-abgerufen-von-hoechstens', { nr, maxAbrufe: link.maxAbrufe }) : t('meldungen.dienst.abruf-abgebrochen-von-hoechstens', { nr, maxAbrufe: link.maxAbrufe }),
      zustellung: 'abruf', erfolg: vollstaendig, link: link.id, auskunft: link.auskunftId, nr,
    });
    if (vollstaendig) await this.auskunftMelden(link, t('meldungen.dienst.auskunft-an-wurde-abgerufen', { wert: link.titel || t('meldungen.dienst.ohne-titel') }), 'abgerufen', standVon);
  }

  /**
   * Benachrichtigung (#455) als Aufgabe „Auskunft“ an der Mappe der Person: an den, der den Link erstellt
   * hat, den Ersteller der Auskunft und alle, die die Person als Favorit haben (Stern = Abo, #422).
   * Gebündelt: Solange eine solche Aufgabe offen ist, kommt für denselben Link keine zweite.
   */
  private async auskunftMelden(link: AuskunftLink, text: string, anlass: 'abgerufen' | 'gesperrt', standVon?: string) {
    // Favorit = Abo (#422): nur Favoriten mit eingeschalteter Benachrichtigung.
    const fav: string[] = [];
    for (const f of await this.repo.favoritenDerMappe(link.mappeId)) {
      if (f.benachrichtigen && await this.persoenlichAn(f.benutzerId, 'favoriten_benachrichtigen')) fav.push(f.benutzerId);
    }
    let an = [...new Set([link.erstelltVon, standVon, ...fav].filter((x): x is string => !!x && istUuid(x)))];
    if (this.konten?.benutzer) { const aktiv = new Set((await this.konten.benutzer()).filter((b) => b.aktiv).map((b) => b.id)); an = an.filter((id) => aktiv.has(id)); }
    const key = `${anlass}:${link.id}`;
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [link.mappeId] })).filter((a) => a.art === 'auskunft' && a.feldKey === key);
    for (const id of an) {
      if (offen.some((a) => a.empfaengerId === id)) continue;
      const a = await this.neueAufgabe({ id: randomUUID(), mappeId: link.mappeId, empfaengerId: id, art: 'auskunft', feldKey: key, text: text.slice(0, AUFGABE_MAX), erstellt: '', erstelltVon: null, erledigt: null, erledigtVon: null });
      await this.leiteUm(a);
    }
  }

  /** Dürfen Benutzer ihre Daten selbst exportieren (#255)? Ab Werk aus (#884): nur bei ausdrücklich `true`. */
  async persoenlicherExportErlaubt(): Promise<boolean> { return (await this.einstellungen?.lies('persoenlicher_export')) === true; }
  async setzePersoenlicherExport(an: unknown, von: string) {
    await this.einstellungen?.schreibe('persoenlicher_export', an === true);
    protokoll.modul('werkbank').info(an === true ? '„Meine Daten exportieren“ erlaubt' : '„Meine Daten exportieren“ abgeschaltet', { von });
    return this.persoenlicherExportErlaubt();
  }

  /** Abschätzung vor dem Vollexport: Mappen, Dokumente, Bytes (mit älteren Versionen). */
  async exportAbschaetzung() {
    const dateien = await this.repo.alleDateien();
    let mappen = 0;
    for (const t of await this.repo.listeTypen()) mappen += await this.repo.zaehleMappen(t.id);
    return { mappen, dokumente: dateien.length, bytes: dateien.reduce((a, d) => a + d.groesse, 0) };
  }

  /* ---------- Archivmodus (#212) ---------- */

  private pruefeArchivDokument(mappeId: string, was: string) { return this.mappenArchiv.pruefeArchivDokument(mappeId, was); }
  archivVorschau(typId: string, e: unknown) { return this.mappenArchiv.archivVorschau(typId, e); }
  darfWeg() { return this.mappenArchiv.darfWeg(); }
  pruefeDateien(von: string) { return this.mappenArchiv.pruefeDateien(von); }

  /* ---------- Fehlende Dateien (#877) ---------- */

  /**
   * Eine Datei fehlt im Ablageordner (beim ersten Lesen in diesem Prozess): einmal ins Protokoll – mit Prüfwert, Pfad
   * und den Mappen, nur dort – und für den Hinweis der Werkbank-Übersicht merken.
   */
  async merkeFehlendeDatei(f: { sha256: string; pfad: string; ablage: string }) {
    const doks = await this.repo.dokumenteMitSha(f.sha256).catch(() => [] as Dokument[]);
    protokoll.modul('dokumente').error('Datei eines Dokuments fehlt im Ablageordner', {
      sha256: f.sha256, pfad: f.pfad, ablage: f.ablage,
      ...(doks.length ? { dokumente: doks.slice(0, 5).map((d) => d.id).join(', '), mappen: [...new Set(doks.map((d) => d.mappeId))].slice(0, 5).join(', ') } : {}),
    });
    const alt = await this.gemerkteFehlendeDateien();
    if (!alt.includes(f.sha256)) await this.schreibeFehlendeDateien([...alt, f.sha256]);
  }

  private async gemerkteFehlendeDateien(): Promise<string[]> {
    const w = (await this.einstellungen?.lies(FEHLENDE_DATEIEN)) as { shas?: unknown } | null;
    return Array.isArray(w?.shas) ? w.shas.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)) : [];
  }

  private async schreibeFehlendeDateien(shas: string[]) {
    if (!this.einstellungen) return;
    const liste = [...new Set(shas)].slice(-FEHLENDE_DATEIEN_MAX);
    await this.einstellungen.schreibe(FEHLENDE_DATEIEN, liste.length ? { shas: liste, am: new Date().toISOString() } : null);
  }

  /**
   * Zahl der fehlenden Dateien für die Übersicht: die gemerkten, die noch gebraucht werden und immer noch fehlen.
   * Ist eine wieder da (Volume wieder eingebunden) oder kein Dokument zeigt mehr darauf, verschwindet sie aus der Liste.
   */
  async fehlendeDateien(): Promise<number> {
    const alt = await this.gemerkteFehlendeDateien();
    if (!alt.length) return 0;
    const noch: string[] = [];
    for (const sha of alt) if ((await this.repo.dateiBenutzt(sha)) && !(await this.dateiVorhanden(sha))) noch.push(sha);
    if (noch.length !== alt.length) await this.schreibeFehlendeDateien(noch);
    return noch.length;
  }

  private async dateiVorhanden(sha: string): Promise<boolean> {
    if (this.dateien.vorhanden) return this.dateien.vorhanden(sha);
    try { const s = await this.dateien.lies(sha); if (!Buffer.isBuffer(s)) s.destroy(); return true; } catch { return false; }
  }

  /**
   * Alle Dateien nur auf Vorhandensein prüfen (Lasttest #877: schnell, ohne zu lesen): Dokumente ohne Datei. Je
   * Datei ein `stat`, 32 gleichzeitig.
   */
  async dokumenteOhneDatei(): Promise<{ dateien: number; fehlend: number; dokumente: number }> {
    const alle = await this.repo.alleDateien();
    const shas = [...new Set(alle.map((x) => x.sha256))];
    const fehlt = new Set<string>();
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(32, shas.length) }, async () => {
      while (i < shas.length) { const sha = shas[i++]; if (!(await this.dateiVorhanden(sha))) fehlt.add(sha); }
    }));
    if (fehlt.size) await this.schreibeFehlendeDateien([...(await this.gemerkteFehlendeDateien()), ...fehlt]).catch(() => {});
    return { dateien: shas.length, fehlend: fehlt.size, dokumente: new Set(alle.filter((x) => fehlt.has(x.sha256)).map((x) => x.dokumentId)).size };
  }

  /** Vor einem Strom, dessen Kopf schon unterwegs wäre (ZIP): fehlt eine Datei, gleich ein sauberer Fehler. */
  private async pruefeVorhanden(docs: Array<Pick<Dokument, 'sha256' | 'name'>>) {
    if (!this.dateien.vorhanden) return;
    for (const d of docs) {
      if (await this.dateien.vorhanden(d.sha256)) continue;
      // Lesen meldet das Fehlen wie überall (einmal ins Protokoll, Hinweis der Übersicht).
      await this.dateien.lies(d.sha256).then((x) => { if (!Buffer.isBuffer(x)) x.destroy(); }, () => {});
      throw new DateiFehlt(d.sha256, d.name);
    }
  }

  /* ---------- Versionierung (#194) ---------- */

  private async registerVon(d: Dokument) {
    const m = await this.repo.holeMappe(d.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    return { typ, reg: typ?.register.find((r) => r.key === d.registerKey && r.art === 'dokumente') };
  }

  /** Neue Version eines Dokuments – unabhängig von Name und Dateityp; nur mit eingeschalteter Versionierung. */
  async ersetzeDokument(id: string, e: { name?: string; typ?: string; herkunft?: Herkunft }, inhalt: unknown, benutzerId: string | null): Promise<Dokument> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const { typ, reg } = await this.registerVon(d);
    if (!reg?.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-6'));
    // Upload als temporäre Datei (#746) oder Puffer.
    const ein = Eingang.aus(inhalt);
    if (!ein || ein.groesse === 0) throw new Fachfehler(422, t('meldungen.dienst.die-datei-ist-leer'));
    if (ein.groesse > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.die-datei-ist-zu'));
    const sha256 = await ein.sha256();
    const erkannt = erkenneAnzeigbar(ein.kopf);
    const angegeben = erkenneBildtyp(ein.kopf) ?? (/^[\w.+-]+\/[\w.+-]+$/.test(e.typ ?? '') ? e.typ! : 'application/octet-stream');
    await ein.lege(this.dateien, sha256);
    const neu = await this.repo.ersetzeDokument(id, {
      name: e.name ? dateiname(e.name) : d.name, mime: erkannt ?? angegeben, groesse: ein.groesse, sha256, anzeigbar: !!erkannt,
      erstelltVon: benutzerId, herkunft: e.herkunft ?? 'hochgeladen',
    });
    this.neueDateien([neu]);
    return this.nachNeuerVersion(d, neu, typ, reg, benutzerId);
  }

  /** Eine ältere Version zurückholen: als neue, höchste Version; es geht nichts verloren. */
  async holeVersionZurueck(id: string, nummer: number, benutzerId: string | null): Promise<Dokument> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const v = await this.repo.holeVersion(id, nummer);
    if (!v) throw new Fachfehler(404, t('meldungen.dienst.version-gibt-es-nicht', { nummer }));
    const { typ, reg } = await this.registerVon(d);
    if (!reg?.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-7'));
    const neu = await this.repo.ersetzeDokument(id, {
      name: v.name, mime: v.mime, groesse: v.groesse, sha256: v.sha256, anzeigbar: v.anzeigbar, erstelltVon: benutzerId, herkunft: 'zurueckgeholt', volltext: v.volltext,
    });
    return this.nachNeuerVersion(d, neu, typ, reg, benutzerId, nummer);
  }

  private async nachNeuerVersion(alt: Dokument, neu: Dokument, typ: Mappentyp | undefined, reg: Register, benutzerId: string | null, zurueckgeholt?: number) {
    await this.notiere(neu.mappeId, benutzerId, 'dokument_version', {
      dokument: neu.name, version: neu.version, vorher: alt.name, groesse: neu.groesse, mime: neu.mime, register: reg.name,
      ...(zurueckgeholt ? { zurueckgeholt } : {}),
    });
    await this.beruehre(neu.mappeId, typ, benutzerId);
    // „Nur die letzten N“ (mit der aktuellen): ältere entfernen, Dateien aufräumen.
    if (reg.versionenBehalten) {
      const vorher = await this.repo.versionenVon(neu.id);
      for (const sha of await this.repo.kuerzeVersionen(neu.id, reg.versionenBehalten - 1)) await this.raeumeAuf(sha);
      // Löschprotokoll (#470): auch ältere Versionen, die über die eingestellte Anzahl hinaus wegfallen.
      const bleiben = new Set((await this.repo.versionenVon(neu.id)).map((v) => v.nummer));
      const weg = vorher.filter((v) => !bleiben.has(v.nummer));
      if (weg.length) await this.kern.loeschprotokoll.schreibe(this.kern.loeschprotokoll.dokEintraege(weg.map(versionInfo), { ...(await this.kern.loeschprotokoll.mappenInfo([neu.mappeId], new Map()))(neu.mappeId, neu.id), schritt: 'endgueltig', weg: 'version' }),
        await this.kern.loeschprotokoll.kontext(benutzerId, { ausloeser: 'automatisch' }));
    }
    if (neu.ocr?.stand !== 'fertig' && Dienst.volltextAn(typ, reg.key)) {
      await this.repo.ocrEinreihen([neu.id]);
      this.ocr?.anstossen();
    }
    return (await this.repo.holeDokument(neu.id)) ?? neu;
  }

  async versionen(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return { aktuell: d, aeltere: await this.repo.versionenVon(id) };
  }

  async versionInhalt(id: string, nummer: number) {
    const v = await this.repo.holeVersion(id, nummer);
    if (!v) throw new Fachfehler(404, t('meldungen.dienst.version-gibt-es-nicht', { nummer }));
    const { volltext: _v, ...version } = v;
    return { version, inhalt: await this.dateien.lies(v.sha256) };
  }

  /** Dokumente hinzugefügt oder entfernt (#76): „zuletzt geändert“ nachziehen, Titel mit {geaendert} ebenso. */
  private async beruehre(mappeId: string, typ: Mappentyp | undefined, benutzerId: string | null) {
    await this.repo.beruehreMappe(mappeId, benutzerId);
    if (typ && /\{geaendert\}/.test(typ.titelVorlage ?? '')) await this.aktualisiereTitel([mappeId]);
  }
}

/** Liste von Sprachkennungen prüfen (#579): nur bekannte, ohne doppelte, höchstens alle Sprachen des DMS. */
function sprachliste(x: unknown, feld: string, max = Object.keys(TEXTSPRACHEN).length): string[] {
  if (!Array.isArray(x) || x.length > max || !x.every(istTextsprache)) throw new Fachfehler(422, `${feld}: Liste bekannter Sprachen erwartet (${Object.keys(TEXTSPRACHEN).join(', ')}), höchstens ${max}.`);
  return [...new Set(x as string[])];
}
/** Seitensprachen eines Pakets (#579): je Seite null (das DMS erkennt sie) oder ein bis zwei Sprachen. */
function sprachlisten(x: unknown): Array<string[] | null> | undefined {
  if (x === undefined || x === null) return undefined;
  if (!Array.isArray(x) || !x.length || x.length > MAX_SEITENSPRACHEN) throw new Fachfehler(422, t('meldungen.dienst.seitensprachen-liste-mit-einem', { MAX_SEITENSPRACHEN }));
  return x.map((e, i) => (e === null ? null : sprachliste(e, `seitensprachen[${i}]`, SPRACHEN_JE_SEITE)));
}
