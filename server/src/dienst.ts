import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import {
  darfErstellen, ERKENNBAR_AN_MAX, kannAusPost, darfLoeschen, ersterGrund, FELDTYPEN, formatiere, geschuetzteFelder, istLeer, istPasswortWert, istSystemspalte, sortierbar, istOk, leseZahl, MAX_AUSWAHL, MAX_DATEIGROESSE, pruefeMappe, pruefeMappentyp,
  REGISTERARTEN, REGISTERNAMEN, ABRUF_ART, type Abrufweg, type Abruffassung, historienartenVon, historiengruppenVon, istHistoriengruppe, SYSTEMTYPEN, ROLLEN, FRUEHERE_ADMINROLLE, type Modusspur, KONTOROLLEN, kontorolleKennung, type Kontorolle, type Systemkonto, freierSchluessel, schluesselAus, standardRegister, systemfelder, systemBeschriftung, systemrolleKennung, titelAus, verweiseVon, verweisAusText,
  AUFGABE_MAX, fotoBetreff, istVersendet, istEmail, NOTIZ_MAX, POST_KANAL, POST_RICHTUNG, POST_STAND, auswahlText, darfPostAnlegen, abwesenheitWirkt, VERTRETER_SCHRITTE, type Abwesenheit, type Aufgabe, type AufgabenAnlass, type FallEnde, type FallOhneLeserecht, type Aufgabenart, type Benutzer, type Dokument, type DokumentVersion, type Herkunft, type Vertretung, type Feld, type Feldaenderung, type Feldkonflikt, type Mappenkonflikt, type Verweiskonflikt, type Notiz, type Historienart, type Historieneintrag, type Mappe, type Mappentyp, type MappentypDaten, type MappenBezug, type Quelle, type Register, type Trefferliste, trefferlistenVon, standardliste, type Rolle, type Systemtyp, type Wert, type Werte,
} from '../../shared/src/model';
import { DateiFehlt, type Dateispeicher } from './dateispeicher';
import type { Mailer } from './mail';
import { Auftraege } from './auftrag';
import { kontext, protokoll } from './protokoll';
import { beiVerklemmungWiederholen, istVerklemmung } from './db';
import { EIGENE_MAPPEN, fingerabdruck, Haushaltsstand, MINDESTENS_MS, mitFavoriten, NUR_FAVORITEN, zeitabhaengig, ZAEHLT_FUER_TERMINE, Zaehlerspeicher, type Gueltigkeit } from './zaehlerspeicher';
import { jeAnfrage } from './lesespeicher';
import { speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import { rechteMessen } from './messung';
import { graubild } from './graubild';
import { Fachfehler } from './fehler';
import { bilderZuPdf, fuegeZusammen, pruefeAuswahl, pruefeTeile, SEITENBILDER_MAX, Seitenbilder, seitenInfo, teile, teilName } from './pdfseiten';
import { bildSeitePdf } from './pdf';
import { aufkleberPdf, ETIKETTEN, type Etikett } from './aufkleber';
import { alsText, erwaehnungen } from '../../shared/src/markdown';
import { liesAnsicht, liesEigene, OHNE_EINSTELLUNG } from '../../shared/src/werkbankansicht';
import { istVerschluesselt, type Betroffen, type Tresor } from './tresor';
import type { Einstellungen } from './einstellungen';
import { istUuid, KonfigurationVeraltet, StandVeraltet, WOERTER_JE_LAUF, type DokumentImPapierkorb, type FristKandidat, type NeueMappe, type PapierkorbEintrag, type Repo, type Rueckverweis, type SeitenAnfrage, type SortierungIntern } from './repo';
import { liesWortgruppe, suchbegriffe, variantenVon, vorschlagAus, type Varianten } from '../../shared/src/suche';
import { ausgangAus, bereinigeBeschriftungen, ergaenzeBeschriftungen, optionsGruppen, type Beschriftungen, type FeldTeile, type NamensTeile, type TypTeile } from '../../shared/src/beschriftung';
import { inSprache } from '../../shared/src/sprache';
import { ausgeblendeteFelder, bereinigeAbschnitte, festigeDarstellung } from '../../shared/src/darstellung';
/** Höchstens so viele eigene Gruppen gleichbedeutender Wörter (#356). */
const SYNONYM_GRUPPEN_MAX = 2000;
import {
  auswahlKlausel, auswahlProbleme, bereinigeAuswahlfilter, setzeEigeneWerte, erfuellt, bereinigeBedingungen, filterFuer, heuteIn, kinderVon, klauselnFuer, verschiebe, waereKreis, wirksameTypen, zeigtAlleTypen,
  type Aufloesung, type Bedingung, type Klausel, type Sicht, type SichtDaten,
} from '../../shared/src/sichten';
import type { Readable } from 'node:stream';
import { bereinigeFolgtAus, enthaeltId, ersteId, folgeReihenfolge } from '../../shared/src/folgtaus';
import { aufbewahrenBis, datumText, inFrist, JAHRE_MAX } from '../../shared/src/archiv';
import type { ExportQuelle } from './vollexport';
import { sammleBaum, type BaumQuelle } from './baum';
import { BAUM_STANDARD, bereinigeBaumOptionen, verweisartVon, type Baum } from '../../shared/src/baum';
import { liesLoeschAuswahl, loeschErinnerung, loeschVorschlag, LOESCH_TIEFE, planeLoeschung, type LoeschKante, type LoeschPlan, type LoeschVorschau } from '../../shared/src/loeschbaum';
import { AUSKUNFT_PASSWORT_MIN, auswahlProbleme as auskunftProbleme, fristBis, liesAuswahl, liesDatenschutz, personenTypen, type AuskunftErwaehnung, type AuskunftMappe, type AuskunftVorschau, type Datenschutz } from '../../shared/src/auskunft';
import { auskunftMail, auskunftVerzeichnis, FRIST_SCHLUESSEL, FRIST_TEXT_ANFANG, type AuskunftEintrag, LINK_FEHLVERSUCHE_MAX, LINK_STATUS, liesLinkEingabe, linkStatus, normiereCode, type AuskunftLink, type AuskunftStand } from '../../shared/src/auskunft';
import { neuerAbrufcode, SCHLUESSEL_MUSTER } from './abruf';
import { alsZeile, liesAnlass, liesFilter, LOESCH_MAX, LOESCH_SPALTEN, LOESCHGRUENDE, LOESCHPROTOKOLL_JAHRE_MAX, LOESCHPROTOKOLL_STANDARD_JAHRE, LOESCHSCHRITTE, LOESCHWEGE, AUSLOESER, nummerVon, type Ausloeser, type LoeschAnlass, type LoeschDokument, type LoeschEintrag, type LoeschKontext, type Loeschweg } from '../../shared/src/loeschprotokoll';
import { hashePasswort, hasheSchluessel, neuerSchluessel, pruefePasswort } from './passwort';
import type { AuskunftLinkIntern } from './repo';
import type { AuskunftDaten } from './auskunft';
import { datumIn, KREIS_SCHLUESSEL, kreisVon, naechste, neubeginn, pruefeMuster, type Nummernkreis } from '../../shared/src/nummernkreis';
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
import { ALLE_TYPEN, INHALT_EREIGNISSE, MAPPEN_EREIGNISSE, hatSchnittstelle, istKiPaket, kenntVolltextOhneText, PAKET_TEXT, PAKET_VOLLTEXT, type EreignisArt, type InstalliertesPaket, type KiUebersicht, type PaketCode, type Schnittstelle, type BeispielStand } from '../../shared/src/pakete';
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
import { jeMappe, liesModell, liesVektor, SCHWELLE_STANDARD, Vektorindex, type Treffer } from './vektoren';
import type { PaketEntwurf } from '../../shared/src/paketerstellung';
import { systemkontoAuffaellig, type SystemkontoFehler } from '../../shared/src/systemkonten';
import { abfrageAus, liesSuche } from '../../shared/src/erweitertesuche';
import type { Lesefilter } from '../../shared/src/rechte';
import { liesAusDokument, liesFeldErkennung, liesWiederfinden, type AusDokument } from '../../shared/src/erkennung';
import { gleicheFormateAn, hatVorgaben, HEUTE, pruefeFormate, unpassendeAngaben, type Feldformat } from '../../shared/src/feldformate';
import { FragenAnDieAblage } from './fragen';
import { Uebersetzung } from './uebersetzung';
import { Erkennung, sichereZuordnung, type PostErkennung } from './erkennung';
import { favoritenErlaubt, freigabeZumSpeichern, liesFavoritenFreigabe, type FavoritenFreigabe } from '../../shared/src/favoritenfreigabe';
import { t } from './sprache';
import { Ereignisverteiler } from './ereignisse';
import { tagIn, zeitzone } from '../../shared/src/region';
import { Eingang, shaVon } from './hochladen';
import { EREIGNISKATALOG, mischeFelder, VERALTETE_EREIGNISSE, type Ausloeser as EreignisAusloeser, type KatalogArt, type KatalogEreignis, type Katalogeintrag } from '../../shared/src/ereignisse';
import { bereinigeFrist, datumDe, empfaengerFelder, ERINNERUNG_TEXT_MAX, fristAb, fristEmpfaenger, fristFelder, fristText, folgetermine, istDatum, naechsterTermin, type Erinnerung, type Termin, type TermineAntwort } from '../../shared/src/fristen';
import { tageZwischen, zeitraumProblem } from '../../shared/src/kalender';
import { ansichtSymbol } from '../../shared/src/ansichtsymbole';
import { feiertageZwischen, type Bundesland } from '../../shared/src/feiertage';
import { ALLES, hatKontoRegeln, kontoRegelwerk, RECHTE_LISTE, kurzStandard, systemSperre, bereinigeRegelwerk, FALSCH, istOffen, kopiereRegel, kurz, leseAusdruck, lesefilter, NICHTS, nicht, oder, rechteAn as rechteAnMappe, rechteUebersicht, regelProblem, regelwerkVon, wirksamVon, type Ausdruck, type Regelwerk, type Mappenquelle, type Recht, type Rechte, type Wer } from '../../shared/src/rechte';
import { gebietsschema } from '../../shared/src/sprache';

/** Mappen in der Reihenfolge der Ids (#542: mit Index statt `indexOf` je Vergleich – bei 20.000 Mappen Sekunden). */
function inReihenfolge<T extends { id: string }>(liste: T[], ids: string[]): T[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return liste.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

/* ---------- Eingaben bereinigen: nur bekannte Eigenschaften übernehmen ---------- */

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
/** Empfänger aus Abfrageparametern (API v1) – gilt auch für den Pflicht-Stempel ohne eigenen Wunsch (#799). */
const empfaengerAus = (q: unknown) => { const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>; const e = o.empfaenger ?? o['empfänger']; const s = Array.isArray(e) ? e[0] : e; return typeof s === 'string' ? s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120) : ''; };

/* Löschprotokoll (#470) */
/** Grund und Auslöser einer Löschung (aus Oberfläche/Schnittstelle) und wie gelöscht wurde. */
export type Anlass = LoeschAnlass & { ausloeser?: Ausloeser; weg?: Loeschweg };
/** Ein Eintrag ohne Zeit, Id und „wer/warum“ (kommt aus dem Kontext). */
type ProtokollTeil = Omit<LoeschEintrag, 'id' | 'zeit' | 'vonId' | 'von' | 'ausloeser' | 'grund' | 'grundText'>;
interface ProtokollMappe { id: string; typId: string; typ: Mappentyp | undefined; werte: Werte; notizen: number; dokumente: LoeschDokument[]; vorgang?: string | null }
const dokInfo = (d: Dokument): LoeschDokument => ({ dokumentId: d.id, version: d.version ?? 1, sha256: d.sha256, groesse: d.groesse, mime: d.mime, seiten: d.ocr?.seiten ?? null, archivnummer: d.archivnummer ?? null });
const versionInfo = (v: DokumentVersion): LoeschDokument => ({ dokumentId: v.dokumentId, version: v.nummer, sha256: v.sha256, groesse: v.groesse, mime: v.mime, seiten: null, archivnummer: null });

/** Zugriff eines Benutzers (#124): Rollen, Auflösung dynamischer Werte, Lesefilter (null = alles). */
/** Dokument im Papierkorb mit Mappe und Register (#344). */
export interface DokumentImKorb extends DokumentImPapierkorb { art: 'dokument'; typId: string; mappeTitel: string; register: string; mappe: 'da' | 'papierkorb' | 'weg' }
/** Aufgelöste Post im Papierkorb (#936): in welche Mappe; `da` = die Mappe gibt es noch. */
export interface AufgeloestIn { id: string; typId: string; titel: string; da: boolean }
/** Wo eine gleiche Datei schon liegt (#333) – nur lesbare Mappen. */
/** Bestätigter bzw. neuer (gesperrter) Schlüssel eines eigenen Katalogs (#594). */
/** Antwort eines Pakets auf einen Aufruf eines Ereignisses (#636). rc: Rückgabewert des Pakets; beginn: Start des Aufrufs (ms). */
export interface EreignisAufruf { ok: boolean; text: string; fehler: string | null; rc: number | null; beginn: number }
export interface KatalogSchluessel { pem: string; fingerabdruck: string; von: string | null; am: string }
/** Eine weitere Katalogquelle (#189) mit Schlüssel des Anbieters (#594). */
export interface PaketQuelleEintrag { url: string; aktiv: boolean; von: string | null; am: string; schluessel?: KatalogSchluessel | null; gesperrt?: KatalogSchluessel | null }
export interface Fundstelle { mappeId: string; typId: string; titel: string; typ: string; register: string; name: string; erstellt: string }
/** Zähler-Endpunkt (#625): nur Zahlen, keine Inhalte. */
export interface Zaehlerzahlen { neuePost: number; zuErledigen: number; ueberfaellig: number }

export interface Zugriff {
  ich: { id: string; rolle: string };
  admin: boolean;
  wer: Wer;
  a: Aufloesung;
  typen: Map<string, Mappentyp>;
  lesen: Lesefilter | null;
  /**
   * Dienstkonto eines Pakets (#338): Rechte fest aus dem bestätigten Manifest statt aus Regeln.
   * typen enthält dann nur die lesbaren Typen; schreiben = Ids der Typen mit Anlegen/Bearbeiten.
   */
  paket?: { id: string; schreiben: Set<string>; dokumente: PaketCode['rechte']['dokumente']; schnittstellen?: Schnittstelle[];
    /** Typen mit Regeln für die Rolle „Paket“ (#673), schon auf diese Regeln zugeschnitten – sie schränken die bestätigten Rechte weiter ein. */
    regeln?: Map<string, Mappentyp> };
  /** Systemkonto (#673), z. B. „Automatisierung“: Rechte aus den Regeln für die Rolle „Systemkonto“ (typen sind darauf zugeschnitten). */
  systemkonto?: string;
  /**
   * Leserecht auf Zeit (#798) je Mappe: vom Admin für die Dauer einer Aufgabe gegeben. Nur Lesen, nur diese Mappe,
   * nur solange die Aufgabe offen bei dieser Person liegt – steht schon im Lesefilter (`lesen`).
   */
  aufZeit?: Map<string, LeserechtAufZeit>;
}
/** Ein wirksames Leserecht auf Zeit (#798): Grund ist die Aufgabe; von = der Admin, der es gegeben hat. */
export interface LeserechtAufZeit { fallId: string; aufgabeId: string; aufgabentext: string; seit: string; von: string | null }

/** Lesefilter um Leserechte auf Zeit erweitern (#798): je Mappentyp „oder die Mappe ist eine dieser“. */
function mitAufZeit(f: Lesefilter | null, typen: Mappentyp[], aufZeit: Array<{ mappeId: string; typId: string }>): Lesefilter | null {
  if (!f || !aufZeit.length) return f;
  const je = new Map<string, string[]>();
  for (const x of aufZeit) if (typen.some((t) => t.id === x.typId) && !f.offen.includes(x.typId)) je.set(x.typId, [...(je.get(x.typId) ?? []), x.mappeId]);
  if (!je.size) return f;
  const neu: Lesefilter = { offen: [...f.offen], je: f.je.map((e) => ({ ...e })) };
  for (const [typId, ids] of je) {
    const ausdruck: Ausdruck = { k: 'filter', f: { art: 'id', ids: [...new Set(ids)].sort() } };
    const e = neu.je.find((x) => x.typId === typId);
    if (e) e.ausdruck = oder(e.ausdruck, ausdruck); else neu.je.push({ typId, ausdruck });
  }
  return neu;
}
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
export const NICHT_SICHTBAR = t('meldungen.dienst.nicht-sichtbare-mappe');

/** Ein Anhang einer E-Mail (#723): Dokument (oder das PDF „Angaben“, dann ohne Dokument) und was hinausgeht. */
interface Versandanhang {
  dokument: Dokument | null; name: string; mime: string; groesse: number;
  /** Bearbeitet (Stempel, verkleinert) oder Archivfassung: liegt als eigene Datei in der Post. */
  ausgabe: Ausgabe | null;
  inhalt(): Promise<Buffer | Readable>;
}
/** Alles, was von einer Mappe per E-Mail hinausgeht. `ausgaben`: die bearbeiteten (für Historie und Hinweise). */
interface Versandteil { m: Mappe; plan: GeltenderStempel | null; angaben: Versandanhang | null; dokumente: Versandanhang[]; ausgaben: Ausgabe[]; groesse: number }

/** Titel nicht lesbarer Mappen ausblenden (#124); `ok`: die lesbaren. */
function maskiert(b: Map<string, MappenBezug>, ok: Set<string>): Record<string, MappenBezug> {
  return Object.fromEntries([...b].map(([id, x]) => [id, ok.has(id) ? x : { titel: NICHT_SICHTBAR, typId: x.typId, verborgen: true }]));
}

/** Für die Rechte im Arbeitsspeicher (Regel „mit Aufgabe“): offene Aufgaben des Benutzers aus einer Liste. */
function quelleAus(benutzerId: string, aufgaben: Aufgabe[]): Mappenquelle {
  const mit = new Set(aufgaben.filter((x) => !x.erledigt && x.empfaengerId === benutzerId).map((x) => x.mappeId));
  return { dokumente: () => 0, verknuepfungen: () => 0, aufgabe: (id, b) => b === benutzerId && mit.has(id) };
}
/** So lange wartet die Suche höchstens auf den Vektor des Suchbegriffs (#442); danach ohne Ähnlichkeit. */
export const SUCHE_VEKTOR_MS = 1500;
/** Startseite (#918): der nächste Termin erst in so vielen Tagen gesucht, nur ohne Treffer im ganzen Jahr. */
export const NAECHSTER_TERMIN_ERST_TAGE = 31;
const liesModellOder422 = (x: unknown) => { try { return liesModell(x); } catch (e) { throw new Fachfehler(422, (e as Error).message); } };
/** Obergrenze für geschriebenen Volltext (Zeichen). */
export const VOLLTEXT_MAX = VOLLTEXT_ZEICHEN_MAX;
/** Auswahlfilter (#172) zählen nichts – nur Bedingungen auf Felder. */
/** Laufende Transaktion je Aufruf (#404): Repo der Transaktion und was erst nach dem Speichern geschehen soll. */
const transaktionen = new AsyncLocalStorage<{ dienst: object; repo: Repo; nachher: Array<() => void> }>();
/** Historie → Ereignis des Katalogs (#670); Löschen meldet die Stelle selbst (die Mappe ist danach weg). */
const NOTIERT_ALS: Partial<Record<Historienart, KatalogArt>> = { angelegt: 'mappe.angelegt', geaendert: 'mappe.geaendert', wiederhergestellt: 'mappe.wiederhergestellt' };
/**
 * Ereigniskatalog (#670): Wer gerade handelt (z. B. eine Automatisierung, #674) bzw. ob gerade gar nichts ausgelöst
 * werden soll (Import, Beispiel-Mappen, Wiederherstellung).
 */
const ereignisKontext = new AsyncLocalStorage<{ ausloeser?: EreignisAusloeser; still?: boolean }>();

const KEINE_ZAEHLUNG = { dokumente: () => 0, verknuepfungen: () => 0 };
const VERBOTEN: Record<Recht, string> = {
  C: t('meldungen.dienst.mappen-dieses-typs-darfst'),
  R: t('meldungen.dienst.diese-mappe-darfst-du'),
  U: t('meldungen.dienst.diese-mappe-darfst-du-2'),
  D: t('meldungen.dienst.diese-mappe-darfst-du-3'),
  P: t('meldungen.dienst.passwoerter-dieser-mappe-darfst'),
};
function zahlOderNull(v: unknown): number | null {
  const n = leseZahl(v);
  return n == null || Number.isNaN(n) ? null : n;
}

/** Teile, die sich je Sprache beschriften lassen (#728). */
const FELD_TEILE = ['label', 'hilfe', 'optionen'] as const satisfies ReadonlyArray<keyof FeldTeile>;
const NAMENS_TEILE = ['name'] as const satisfies ReadonlyArray<keyof NamensTeile>;
const TYP_TEILE = ['name', 'beschreibung'] as const satisfies ReadonlyArray<keyof TypTeile>;
/** Am Mappentyp zusätzlich „Woran man ihn erkennt“ (#937); Ansichten haben das nicht. */
const MAPPENTYP_TEILE = [...TYP_TEILE, 'erkennbarAn'] as const satisfies ReadonlyArray<keyof TypTeile>;
/** Beschriftungen oder nichts – leere Angaben werden nicht gespeichert. */
const mitBeschriftungen = <T extends object>(b: T | undefined): { beschriftungen?: T } => (b ? { beschriftungen: b } : {});
/**
 * Standard-Beschriftungen eines Systemfelds ergänzen (#729): Was der Administrator schon beschriftet hat, bleibt; Bezeichnung
 * und Hilfetext anderer Sprachen nur, solange der deutsche Text der Standard ist.
 */
function mitSystemBeschriftung(f: Feld, s: Feld): { beschriftungen?: Beschriftungen<FeldTeile> } {
  const std = structuredClone(s.beschriftungen ?? {}) as Record<string, FeldTeile>;
  for (const e of Object.values(std)) {
    if (f.label && f.label !== s.label) delete e.label;
    if (f.hilfe && f.hilfe !== s.hilfe) delete e.hilfe;
  }
  return mitBeschriftungen(ergaenzeBeschriftungen(f.beschriftungen, std));
}

export function bereinigeFeld(e: unknown): Feld {
  const f = (e ?? {}) as Record<string, unknown>;
  const typ = (text(f.typ) in FELDTYPEN ? text(f.typ) : 'text') as Feld['typ'];
  const std = f.standard;
  // Auswahl (#728): die festen Werte, jeder einmal; gespeicherte Mappen behalten ihren Wert.
  const optionen = Array.isArray(f.optionen) ? [...new Set(f.optionen.map(text).filter(Boolean))] : [];
  return {
    key: text(f.key),
    // Deutsch ist der Ausgangstext; `beschriftungen.de.label` (z. B. aus einem Paket) gilt als Bezeichnung.
    label: ausgangAus(f.beschriftungen, 'label', text(f.label)),
    typ,
    pflicht: !!f.pflicht,
    eindeutig: !!f.eindeutig && (typ === 'text' || typ === 'zahl'),
    hilfe: ausgangAus(f.beschriftungen, 'hilfe', text(f.hilfe)),
    standard: std == null || std === '' || typ === 'passwort' ? null : typeof std === 'boolean' ? std : String(std),
    minLen: zahlOderNull(f.minLen),
    maxLen: zahlOderNull(f.maxLen),
    muster: text(f.muster),
    // Datum (#535): „heute“ oder ein Datum; ungültige Angaben bleiben stehen, damit die Prüfung sie meldet.
    min: typ === 'datum' ? datumsgrenze(f.min) : zahlOderNull(f.min),
    max: typ === 'datum' ? datumsgrenze(f.max) : zahlOderNull(f.max),
    nachkomma: zahlOderNull(f.nachkomma),
    waehrung: typ === 'betrag' ? (text(f.waehrung) || 'EUR').toUpperCase().slice(0, 3) : undefined,
    optionen,
    mehrfach: !!f.mehrfach && (typ === 'auswahl' || typ === 'referenz'),
    zielTyp: typ === 'referenz' ? text(f.zielTyp) : '',
    // Auswahlfilter (#172): nur an Referenzfeldern mit festem Zieltyp.
    ...(typ === 'referenz' && text(f.zielTyp) && text(f.zielTyp) !== '*' && bereinigeAuswahlfilter(f.auswahlFilter).length ? { auswahlFilter: bereinigeAuswahlfilter(f.auswahlFilter) } : {}),
    // Folgt aus (#886): nur an Verweisfeldern mit festem Zieltyp; geprüft wird im Mappentyp.
    ...(typ === 'referenz' && text(f.zielTyp) && text(f.zielTyp) !== '*' && bereinigeFolgtAus(f.folgtAus) ? { folgtAus: bereinigeFolgtAus(f.folgtAus) } : {}),
    verweisart: f.verweisart === 'zugehoerigkeit' ? 'zugehoerigkeit' : 'bezug',
    // Fristen (#129): nur an Datumsfeldern.
    ...(typ === 'datum' && bereinigeFrist(f.frist) ? { frist: bereinigeFrist(f.frist) } : {}),
    // Aus Dokument füllen (#336, #938; früher „Für die Erkennung nutzen“): Art und Erkennungshinweis; nur bei geeigneten Feldarten.
    ...(liesFeldErkennung(f.erkennung, typ) ? { erkennung: liesFeldErkennung(f.erkennung, typ) } : {}),
    // Zum Wiederfinden nutzen (#938): nur Text, Zahl und Verweis.
    ...(liesWiederfinden(f.wiederfinden, typ) ? { wiederfinden: true } : {}),
    // Paket-Update (#534): Verweisfeld, das sich aus einem alten Textfeld füllen lässt.
    ...(typ === 'referenz' && /^[a-z][a-z0-9_]{0,39}$/.test(text(f.ausText)) && text(f.ausText) !== text(f.key) ? { ausText: text(f.ausText) } : {}),
    // Feldformat (#535): nur an Textfeldern; das Land-Feld nur beim Format PLZ.
    ...(typ === 'text' && text(f.format) ? { format: text(f.format) as Feldformat } : {}),
    ...(typ === 'text' && text(f.format) === 'plz' && text(f.landFeld) ? { landFeld: text(f.landFeld) } : {}),
    // Beschriftungen je Sprache (#728): Bezeichnung, Hilfetext und – bei Auswahl – die Optionen.
    ...mitBeschriftungen(bereinigeBeschriftungen<FeldTeile>(f.beschriftungen, FELD_TEILE, typ === 'auswahl' ? optionen : undefined)),
    // Ausgeblendet (#655): nur gespeichert, wenn an; Pflicht hebt festigeDarstellung auf.
    ...(f.ausgeblendet === true ? { ausgeblendet: true } : {}),
  };
}

/** Datumsgrenze (#535) aus einer Eingabe: leer = keine, sonst getrimmt („Heute“ → „heute“). */
function datumsgrenze(v: unknown): string | null {
  const x = v == null ? '' : String(v).trim();
  return !x ? null : x.toLowerCase() === HEUTE ? HEUTE : x;
}

export function bereinigeRegister(e: unknown, felder: Feld[]): Register[] {
  if (!Array.isArray(e) || !e.length) return standardRegister(felder);
  const bekannt = new Set(felder.map((f) => f.key));
  const reg = e.map((x: Record<string, unknown>): Register => {
    const art = (String(x?.art) in REGISTERARTEN ? x.art : 'felder') as Register['art'];
    const name = ausgangAus(x?.beschriftungen, 'name', text(x?.name));
    const r: Register = { key: text(x?.key) || schluesselAus(name), name, art, ...mitBeschriftungen(bereinigeBeschriftungen<NamensTeile>(x?.beschriftungen, NAMENS_TEILE)) };
    if (art === 'felder') r.felder = (Array.isArray(x?.felder) ? x.felder.map(text) : []).filter((k) => bekannt.has(k));
    // Ausgeblendet (#655): ob es bei diesem Register geht, prüft festigeDarstellung.
    if (x?.ausgeblendet === true) r.ausgeblendet = true;
    if (art === 'verknuepfungen') {
      r.quellen = (Array.isArray(x?.quellen) ? x.quellen : [])
        .map((q: Record<string, unknown>): Quelle => ({ typId: text(q?.typId), feldKey: text(q?.feldKey), ...(text(q?.trefferliste) ? { trefferliste: text(q?.trefferliste).slice(0, 40) } : {}) }))
        .filter((q) => q.typId && q.feldKey);
    }
    // Volltext (#45): nur das Abschalten wird gespeichert; Standard ist an.
    if (art === 'dokumente' && x?.volltext === false) r.volltext = false;
    // Historie (#800): welche Gruppen das Register zeigt – nur bekannte, jede einmal; fehlt = Vorauswahl.
    if (art === 'protokoll' && Array.isArray(x?.zeigt)) r.zeigt = [...new Set(x.zeigt.filter(istHistoriengruppe))];
    // Versionierung (#194): Standard aus; „nur die letzten N“ ab 2, leer = alle.
    if (art === 'dokumente' && x?.versionierung === true) {
      r.versionierung = true;
      const n = Math.trunc(Number(x.versionenBehalten));
      if (x.versionenBehalten != null && x.versionenBehalten !== '' && Number.isFinite(n) && n >= 2) r.versionenBehalten = Math.min(n, 1000);
    }
    return r;
  });
  // Felder ohne Register landen auf dem ersten Feldregister.
  const erstes = reg.find((r) => r.art === 'felder');
  if (erstes) {
    const vergeben = new Set(reg.flatMap((r) => r.felder ?? []));
    for (const f of felder) if (!vergeben.has(f.key)) erstes.felder!.push(f.key);
  }
  // Abschnitte (#890): nur in Feldregistern, nur vor eigenen Feldern; leer = keine (nichts gespeichert).
  reg.forEach((r, i) => {
    if (r.art !== 'felder') return;
    const a = bereinigeAbschnitte((e[i] as Record<string, unknown> | undefined)?.abschnitte, r.felder ?? []);
    if (a?.length) r.abschnitte = a;
  });
  return reg;
}

/** Nur bekannte Spalten, jede einmal; Spalten entfernter Felder und Passwortfelder fallen still weg. */
function bereinigeSpalten(e: unknown, felder: Feld[]): string[] {
  return [...new Set((Array.isArray(e) ? e : []).map(text))]
    .filter((k) => (istSystemspalte(k) && k !== '_typ') || felder.some((f) => f.key === k && f.typ !== 'passwort'));
}

/**
 * Trefferlisten (#75): mindestens eine, Schlüssel eindeutig, genau eine ist Standard.
 * Die ältere Angabe `trefferliste` (nur Spalten) ersetzt – falls angegeben – die Spalten der Standardliste.
 */
export function bereinigeTrefferlisten(t: Record<string, unknown>, felder: Feld[]): { trefferlisten: Trefferliste[]; trefferliste: string[] } {
  const roh = Array.isArray(t.trefferlisten) ? (t.trefferlisten as Array<Record<string, unknown>>) : [];
  const listen: Trefferliste[] = [];
  for (const x of roh) {
    const name = ausgangAus(x?.beschriftungen, 'name', text(x?.name)).slice(0, 80) || 'Trefferliste';
    let key = (text(x?.key) || schluesselAus(name) || 'liste').slice(0, 40);
    for (let i = 2; listen.some((l) => l.key === key); i++) key = `${(text(x?.key) || schluesselAus(name) || 'liste').slice(0, 36)}_${i}`;
    listen.push({ key, name, spalten: bereinigeSpalten(x?.spalten, felder), ...(x?.standard === true ? { standard: true } : {}), ...mitBeschriftungen(bereinigeBeschriftungen<NamensTeile>(x?.beschriftungen, NAMENS_TEILE)) });
  }
  if (!listen.length) listen.push({ key: 'standard', name: 'Standard', spalten: [], standard: true });
  const std = listen.find((l) => l.standard) ?? listen[0];
  for (const l of listen) { if (l === std) l.standard = true; else delete l.standard; }
  if (Array.isArray(t.trefferliste) && (!roh.length || JSON.stringify(t.trefferliste) !== JSON.stringify(std.spalten))) {
    // Nur die alte Form angegeben, oder sie weicht ab (z. B. { ...typ, trefferliste: [...] } über die API).
    std.spalten = bereinigeSpalten(t.trefferliste, felder);
  }
  return { trefferlisten: listen, trefferliste: std.spalten };
}

export function bereinigeTyp(e: unknown): MappentypDaten {
  const t = (e ?? {}) as Record<string, unknown>;
  const felder = Array.isArray(t.felder) ? t.felder.map(bereinigeFeld) : [];
  // Archivmodus (#212): Frist 1–30 Jahre, Stichtag ein Feldschlüssel oder null (Anlagedatum).
  const a = t.archiv && typeof t.archiv === 'object' ? t.archiv as Record<string, unknown> : null;
  const jahre = a ? Math.trunc(Number(a.jahre)) : 0;
  const archiv = a && jahre >= 1 && jahre <= JAHRE_MAX ? { jahre, stichtag: text(a.stichtag) || null } : null;
  const register = bereinigeRegister(t.register, felder);
  // Im Archivmodus ist die Versionierung Pflicht, und ältere Versionen bleiben bis zum Fristende.
  if (archiv) for (const r of register) if (r.art === 'dokumente') { r.versionierung = true; delete r.versionenBehalten; }
  // Ausblenden (#655): nur, wo es geht; ausgeblendete Felder sind nie Pflicht.
  festigeDarstellung({ felder, register });
  return {
    name: ausgangAus(t.beschriftungen, 'name', text(t.name)),
    ...(text(t.schluessel) ? { schluessel: text(t.schluessel) } : {}),
    beschreibung: ausgangAus(t.beschriftungen, 'beschreibung', text(t.beschreibung)),
    // Name, Beschreibung und „Woran man ihn erkennt“ je Sprache (#728, #937); undefined = keine (die Datenbank speichert NULL).
    beschriftungen: kuerzeErkennbarAn(bereinigeBeschriftungen<TypTeile>(t.beschriftungen, MAPPENTYP_TEILE)),
    // Kann aus Post angelegt werden (#937): ja, nein oder null = Vorgabe (an mit Dokumentenregister).
    ausPost: typeof t.ausPost === 'boolean' ? t.ausPost : null,
    // Woran man ihn erkennt (#937): kurz, für die Klassifizierung.
    erkennbarAn: ausgangAus(t.beschriftungen, 'erkennbarAn', text(t.erkennbarAn)).replace(/\s+/g, ' ').trim().slice(0, ERKENNBAR_AN_MAX),
    // Altes Format: titelFeld → Vorlage {feld}
    titelVorlage: text(t.titelVorlage) || (text(t.titelFeld) ? `{${text(t.titelFeld)}}` : ''),
    felder,
    register,
    ...bereinigeTrefferlisten(t, felder),
    archiv,
    // Die Haken „Neue Mappen/Löschen erlauben“ gibt es nicht mehr (#146): das regeln die Berechtigungen.
    erstellenErlaubt: true,
    loeschenErlaubt: true,
  };
}

/** „Woran man ihn erkennt“ (#937) auch in anderen Sprachen höchstens ERKENNBAR_AN_MAX Zeichen. */
function kuerzeErkennbarAn(b: Beschriftungen<TypTeile> | undefined): Beschriftungen<TypTeile> | undefined {
  if (!b) return b;
  for (const x of Object.values(b)) if (x?.erkennbarAn) x.erkennbarAn = x.erkennbarAn.replace(/\s+/g, ' ').trim().slice(0, ERKENNBAR_AN_MAX);
  return b;
}

/**
 * Angaben behalten, die eine Eingabe nicht nennt (#937, #938): Wer einen Mappentyp ohne `ausPost` bzw. `erkennbarAn`
 * speichert (z. B. ein älteres Programm über die API), behält die bisherigen; ebenso je Feld `wiederfinden`.
 */
export function behalteErkennung(roh: unknown, d: MappentypDaten, alt: Pick<MappentypDaten, 'ausPost' | 'erkennbarAn' | 'felder'>): MappentypDaten {
  const r = (roh ?? {}) as Record<string, unknown>;
  const rohFelder = Array.isArray(r.felder) ? r.felder as unknown[] : [];
  const felder = d.felder.map((f) => {
    const q = rohFelder.find((y) => !!y && typeof y === 'object' && text((y as Record<string, unknown>).key) === f.key) as Record<string, unknown> | undefined;
    if (q && 'wiederfinden' in q) return f;
    const vorher = alt.felder.find((y) => y.key === f.key && y.typ === f.typ);
    return vorher?.wiederfinden ? { ...f, wiederfinden: true } : f;
  });
  return {
    ...d, felder,
    ...('ausPost' in r ? {} : { ausPost: alt.ausPost ?? null }),
    ...('erkennbarAn' in r || hatErkennbarAnBeschriftung(r.beschriftungen) ? {} : { erkennbarAn: alt.erkennbarAn ?? '' }),
  };
}
/**
 * Darstellung behalten (#655, #890): Wer einen Mappentyp ohne `ausgeblendet` an Feld bzw. Register oder ohne `abschnitte`
 * an einem Feldregister speichert (z. B. ein älteres Programm über die API), behält die bisherigen Angaben. Abschnitte
 * vor Feldern, die nicht mehr auf dem Register liegen, fallen weg.
 */
export function behalteDarstellung(roh: unknown, d: MappentypDaten, alt: Pick<MappentypDaten, 'felder' | 'register'>): MappentypDaten {
  const r = (roh ?? {}) as Record<string, unknown>;
  const quelle = (liste: unknown, key: string) => (Array.isArray(liste) ? liste : []).find((y) => !!y && typeof y === 'object' && text((y as Record<string, unknown>).key) === key) as Record<string, unknown> | undefined;
  const felder = d.felder.map((f) => {
    const q = quelle(r.felder, f.key);
    if (q && 'ausgeblendet' in q) return f;
    return alt.felder.find((y) => y.key === f.key)?.ausgeblendet ? { ...f, ausgeblendet: true } : f;
  });
  const register = d.register.map((x) => {
    const q = quelle(r.register, x.key);
    const vorher = alt.register.find((y) => y.key === x.key && y.art === x.art);
    let neu = x;
    if (!(q && 'ausgeblendet' in q) && vorher?.ausgeblendet) neu = { ...neu, ausgeblendet: true };
    if (x.art === 'felder' && !(q && 'abschnitte' in q) && vorher?.abschnitte?.length) {
      const a = bereinigeAbschnitte(vorher.abschnitte, x.felder ?? []);
      if (a?.length) neu = { ...neu, abschnitte: a };
    }
    return neu;
  });
  const erg = { ...d, felder, register };
  festigeDarstellung(erg);
  return erg;
}
const hatErkennbarAnBeschriftung = (b: unknown) => !!b && typeof b === 'object' && Object.values(b as Record<string, unknown>).some((x) => !!x && typeof x === 'object' && 'erkennbarAn' in x && (x as Record<string, unknown>).erkennbarAn != null);

/**
 * Beschriftungen behalten (#728): Wer einen Mappentyp ohne die Angabe `beschriftungen` speichert (z. B. ein älteres
 * Programm über die API), löscht damit keine – je Typ, Feld, Register und Trefferliste bleiben dann die bisherigen.
 * Wer sie mitgibt (auch leer oder null), setzt sie neu.
 */
export function behalteBeschriftungen(roh: unknown, d: MappentypDaten, alt: Pick<MappentypDaten, 'beschriftungen' | 'felder' | 'register' | 'trefferlisten'>): MappentypDaten {
  const r = (roh ?? {}) as Record<string, unknown>;
  const hat = (x: unknown) => !!x && typeof x === 'object' && 'beschriftungen' in x;
  const nachKey = <T extends { key: string; beschriftungen?: unknown }>(neu: T[], rohe: unknown, vorher: T[] | undefined): T[] => {
    const liste = Array.isArray(rohe) ? rohe : [];
    return neu.map((x) => {
      const quelle = liste.find((y) => !!y && typeof y === 'object' && text((y as Record<string, unknown>).key) === x.key);
      if (hat(quelle)) return x;
      const a = vorher?.find((y) => y.key === x.key);
      return a?.beschriftungen ? { ...x, beschriftungen: a.beschriftungen } : x;
    });
  };
  const felder = nachKey(d.felder, r.felder, alt.felder).map((f) => {
    // Beschriftungen entfernter Optionen fallen weg.
    if (!f.beschriftungen) return f;
    const b = bereinigeBeschriftungen<FeldTeile>(f.beschriftungen, FELD_TEILE, f.typ === 'auswahl' ? f.optionen : undefined);
    const { beschriftungen: _b, ...rest } = f;
    return b ? { ...rest, beschriftungen: b } : rest;
  });
  return {
    ...d,
    ...(hat(r) ? {} : { beschriftungen: alt.beschriftungen }),
    felder,
    register: nachKey(d.register, r.register, alt.register),
    ...(d.trefferlisten ? { trefferlisten: nachKey(d.trefferlisten, r.trefferlisten, alt.trefferlisten) } : {}),
  };
}

/** Wert eines Mehrfachverweises als Liste. */
/** Post (#192): Beschreibung und Spalten der Standard-Trefferliste. */
const POST_BESCHREIBUNG = t('meldungen.dienst.alles-was-in-ablago');
const POST_SPALTEN = ['datum', 'stand', 'kanal', 'absender'];

const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Für die Benutzerverwaltung: Benutzer-Mappen anlegen, nachziehen und entfernen. */
export interface Benutzerspiegel {
  /** Legt die Mappe des Benutzers an oder zieht sie nach (Name, E-Mail, Systemrolle, aktiv). */
  aktualisiere(b: Benutzer, von?: string | null): Promise<void>;
  /** Entfernt die Mappe; wirft, wenn noch etwas auf sie verweist. */
  entferne(id: string): Promise<void>;
  /** Ist der Papierkorb an (#43)? Dann wird ein Benutzer deaktiviert und seine Mappe kommt in den Papierkorb. */
  papierkorbAn?(): Promise<boolean>;
  /** Legt die Mappe in den Papierkorb; wirft, wenn noch etwas auf sie verweist. */
  inPapierkorb?(id: string, von: string | null): Promise<void>;
  /** Anzahl offener Aufgaben eines Benutzers (ohne die der Administratoren) – Deaktivieren nur ohne (#77). */
  offeneAufgaben?(id: string): Promise<number>;
  /** Alle offenen Aufgaben eines Benutzers an einen anderen geben (#78); Anzahl. */
  aufgabenUebergeben?(id: string, an: string, von: string | null): Promise<number>;
  /** Abwesenheit geändert: Protokoll an der Benutzer-Mappe und Aufgabe „Vertretung“ (#78). */
  abwesenheitGeaendert?(b: Benutzer, alt: Abwesenheit, von: string | null, wegen?: string): Promise<void>;
}

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

export const PAPIERKORB_STANDARD_TAGE = 30;
/** Post auflösen (#936): „Aus Post … angelegt“ nur, wenn dieselbe Person die Mappe höchstens so lange vorher angelegt hat. */
const AUFLOESEN_FRIST_MS = 60 * 60 * 1000;
/** Anhänge einer E-Mail zusammen höchstens (#58); die Oberfläche warnt schon ab 20 MB. */
export const EMAIL_MAX_ANHAENGE = 50_000_000;
export const EMAIL_MAX_EMPFAENGER = 20;
/** Höchstens so viele Mappen in einer E-Mail (#151). */
export const EMAIL_MAX_MAPPEN = 100;
export const HISTORIE_STANDARD_TAGE = 365;
/** Sammel-Weitergabe (#415): höchstens so viele Aufgaben auf einmal; Schlüssel der Sammelbenachrichtigung. */
export const SAMMEL_MAX = 1000;
export const SAMMEL_WEITERGABE = 'weitergabe';
/** Favorit = Abo (#422): Diese Historieneinträge sind Änderungen an der Mappe (Felder, Dokumente, Notizen, Register, Aufgaben). */
export const ABO_ARTEN = ['geaendert', 'dokument_hochgeladen', 'dokument_geloescht', 'dokument_version', 'dokument_papierkorb', 'dokument_wiederhergestellt',
  'pdf_bearbeitet', 'geschwaerzt', 'notiz', 'aufgabe', 'papierkorb', 'wiederhergestellt', 'zugeordnet', 'archivnummer'] as const satisfies readonly Historienart[];
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

/** Kreis und Barcode-Präfix der Archivnummern (#345). */
export const ARCHIV_KREIS = 'archivnummer';
export const ARCHIV_PRAEFIX = 'DMS-ASN:';
/** Eingabe → Archivnummer (Präfix aus dem Barcode weg, ohne Rand); leer → null. */
export function archivnummerAus(v: unknown): string | null {
  const t = String(v ?? '').trim().replace(/^DMS-ASN:/i, '').trim();
  return t || null;
}

function dateiname(v: unknown): string {
  // eslint-disable-next-line no-control-regex
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

/** Nur Werte zu bekannten Feldern; leere Eingaben werden zu null. */
/**
 * Passwortfeld (#46): neues Passwort verschlüsseln, entfernen oder das bisherige behalten.
 * - { neu: '…' } oder ein Text: neues Passwort
 * - null, '' oder { entfernen: true }: entfernen
 * - fehlt oder { gesetzt: true } (so, wie die Oberfläche es bekam): unverändert
 */
function passwortWert(eingabe: unknown, hatEingabe: boolean, bisher: unknown, verschluessele: (k: string) => string): Werte[string] {
  // Ohne Eingabe oder unverändert durchgereicht (System, z. B. beim Nachziehen einer Benutzer-Mappe): behalten.
  if (!hatEingabe || (eingabe === bisher && eingabe !== undefined)) return (bisher ?? null) as Werte[string];
  if (eingabe === null || eingabe === '') return null;
  if (typeof eingabe === 'string') {
    if (eingabe.startsWith('dms1$')) throw new Fachfehler(422, t('meldungen.dienst.verschluesselte-werte-lassen-sich'));
    return verschluessele(eingabe.slice(0, 1000));
  }
  if (istPasswortWert(eingabe)) {
    if (eingabe.entfernen) return null;
    if (typeof eingabe.neu === 'string' && eingabe.neu !== '') return verschluessele(eingabe.neu.slice(0, 1000));
    return (eingabe.gesetzt ? bisher ?? null : null) as Werte[string];
  }
  throw new Fachfehler(422, t('meldungen.dienst.ungueltiger-wert-fuer-ein'));
}

/** Stand einer Änderung (#609): „zuletzt geändert“ als ISO-Zeitpunkt; fehlt = ohne Prüfung. */
function liesStand(v: unknown, fehler: 'mappen.konflikt.standUngueltig' | 'meldungen.dienst.stand-ungueltig' = 'mappen.konflikt.standUngueltig'): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms)) throw new Fachfehler(422, t(fehler));
  return new Date(ms).toISOString();
}

function bereinigeWerte(typ: Mappentyp, eingabe: unknown, bisher: Werte = {}, verschluessele: (k: string) => string = keinSchluessel): Werte {
  const roh = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
  const bekannt = new Set(typ.felder.map((f) => f.key));
  const werte: Werte = {};
  // Werte aus entfernten Feldern bleiben erhalten.
  for (const [k, v] of Object.entries(bisher)) if (!bekannt.has(k)) werte[k] = v;
  for (const f of typ.felder) {
    if (f.typ === 'passwort') { werte[f.key] = passwortWert(roh[f.key], f.key in roh, bisher[f.key], verschluessele); continue; }
    const v = f.key in roh ? roh[f.key] : bisher[f.key];
    werte[f.key] = istLeer(v) ? (f.typ === 'janein' ? false : null) : (v as Werte[string]);
  }
  // Feldformate (#535): geänderte Eingaben angleichen (https:// ergänzen, IBAN in Vierergruppen).
  return gleicheFormateAn(typ, werte, bisher);
}

/** Felder, die eine Anfrage selbst setzt – auch leer. „Folgt aus“ (#886) füllt sie nicht. */
const gesendeteFelder = (w: unknown) => new Set(w && typeof w === 'object' && !Array.isArray(w) ? Object.keys(w) : []);

const keinSchluessel = (): never => {
  throw new Fachfehler(409, t('meldungen.dienst.passwoerter-lassen-sich-erst'));
};

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

/** Dieselbe fremde Mappe im Verwaltungsmodus innerhalb so vieler Minuten nur einmal in der Historie (#820). */
export const MODUSSPUR_MINUTEN = 10;
/** Arten im Kurzzustand (#744). */
const MODUSSPUR = 'modusspur';
/** Höchstens so viele Einträge der Historie auf einer Seite (#800). */
export const HISTORIE_SEITE_MAX = 1000;
const ABRUF_PRUEFUNG = 'abruf-pruefung';
/** Belegung einer Code-Prüfung am Abruf-Link: endet spätestens nach dieser Zeit (scrypt dauert Bruchteile davon). */
const ABRUF_PRUEFUNG_MS = 60_000;
/** Fehlende Dateien (#877), die beim Lesen auffielen: für den Hinweis der Werkbank-Übersicht (höchstens so viele). */
const FEHLENDE_DATEIEN = 'dateien_fehlen';
const FEHLENDE_DATEIEN_MAX = 1000;

/** Ereignisse, nach denen eine Mappe unter „Zuletzt geöffnet“ nach oben rückt (#940: Anlegen und Ändern zählen). */
const ZULETZT_ARTEN = new Set<KatalogArt>(['mappe.angelegt', 'mappe.geaendert', 'dokument.hochgeladen', 'mappe.notiz']);

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

  constructor(private grundRepo: Repo, private dateien: Dateispeicher, opt: DienstOptionen = {}) {
    // Stand aus der Datenbank (#742), sonst nur dieser Prozess (speicherRepo in Tests).
    if (typeof grundRepo.haushaltsstand === 'function' && typeof grundRepo.erhoeheHaushaltsstand === 'function') {
      this.stand.verbinde({ lies: () => grundRepo.haushaltsstand!(), erhoehe: () => grundRepo.erhoeheHaushaltsstand!() });
    }
    if (typeof grundRepo.mappenstand === 'function' && typeof grundRepo.erhoeheMappenstand === 'function') {
      this.mappenstand.verbinde({ lies: () => grundRepo.mappenstand!(), erhoehe: () => grundRepo.erhoeheMappenstand!() });
    }
    this.grundRepo = this.stand.umhuelle(grundRepo, this.mappenstand);
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

  /* ---------- Vektoren zu Dokumenten (#442) ---------- */

  /**
   * Wer den Vektor eines Suchbegriffs liefert (der Paket-Läufer, index.ts). null = kein Paket mit dms:vektoren
   * oder es antwortet nicht in der Zeit – dann läuft die Suche wie bisher.
   */
  vektorAnbieter?: { paket(): string | null; vektorFuer(text: string, ms: number): Promise<{ paket: string; modell: string; vektor: Float32Array; schwelle: number } | null> };
  /** Zwischenspeicher je Modell (beim ersten Bedarf aus der Datenbank geladen). */
  private vektorIndizes = new Map<string, Promise<Vektorindex | null>>();
  /** Aktuelles Modell je Paket: ändert es sich, sind die alten Vektoren ungültig. */
  private vektorModelle = new Map<string, string>();

  private vektorIndex(modell: string): Promise<Vektorindex | null> {
    let x = this.vektorIndizes.get(modell);
    if (!x) {
      const t = Date.now();
      let i: Vektorindex | null = null;
      x = this.grundRepo.vektorenLaden(modell, (teil) => {
        for (const e of teil) { i ??= new Vektorindex(e.vektor.length); if (e.vektor.length === i.dimension) i.setze(e.dokumentId, e.mappeId, e.vektor); }
      }).then(() => {
        this.vektorGeladen.add(modell);
        if (i) protokoll.modul('ablage').info('Vektoren geladen', { modell, anzahl: i.anzahl, ms: Date.now() - t, mb: Math.round(i.bytes / 1048576) });
        return i;
      });
      x.catch(() => { this.vektorIndizes.delete(modell); this.vektorGeladen.delete(modell); });
      this.vektorIndizes.set(modell, x);
    }
    return x;
  }
  /** Modelle, deren Zwischenspeicher fertig geladen ist (die Suche wartet nicht auf das Laden). */
  private vektorGeladen = new Set<string>();

  /* ---------- Unscharfe Suche (#356) ---------- */

  /** Gruppen gleichbedeutender Wörter, eine Minute gemerkt (jede Suche braucht sie). */
  private synonymZwischen: { zeit: number; gruppen: string[][] } | null = null;
  private async synonymGruppen(): Promise<string[][]> {
    if (!this.synonymZwischen || Date.now() - this.synonymZwischen.zeit > 60_000) this.synonymZwischen = { zeit: Date.now(), gruppen: (await this.repo.synonyme()).map((g) => g.woerter) };
    return this.synonymZwischen.gruppen;
  }
  /** Varianten der Begriffe einer einfachen Suche: gleichbedeutende Wörter und die Schreibweise ohne Bindestrich. */
  async suchVarianten(texte: Array<string | undefined>): Promise<Varianten> {
    const begriffe = texte.flatMap((t) => (t ? suchbegriffe(t) ?? [] : []));
    if (!begriffe.length) return {};
    // Beschriftungen der Auswahlwerte (#728) gelten wie gleichbedeutende Wörter: „Electricity“ findet den Wert „strom“.
    return variantenVon(begriffe, [...await this.synonymGruppen(), ...optionsGruppen((await this.repo.listeTypen()).flatMap((x) => x.felder))]);
  }
  /** Tippfehler-Suche an (Werkbank → Suche)? Standard: an. */
  async unscharfAn(): Promise<boolean> {
    return ((await this.einstellungen?.lies('suche')) as { unscharf?: boolean } | null)?.unscharf !== false;
  }
  /**
   * Neue Wörter ins Wörterverzeichnis übernehmen (#575): Die Trigger legen sie nur in einen Eingang (keine
   * Verklemmung mit Mappen und Texterkennung); das DMS arbeitet ihn alle paar Sekunden ab – in Teilen, damit ein
   * großer Import die Datenbank nicht lange am Stück beschäftigt. Liefert die Zahl der übernommenen Einträge.
   */
  async woerterEinarbeiten(): Promise<number> {
    let n = 0;
    for (;;) {
      const r = await this.repo.woerterEinarbeiten(WOERTER_JE_LAUF);
      if (r > 0) n += r;
      if (r < WOERTER_JE_LAUF) return n;
    }
  }
  /** Werkbank → Suche: Einstellung, Gruppen (Pakete mit Namen), Größe des Wörterverzeichnisses. */
  async sucheStand() {
    // Die Zahl der Wörter mit allem, was schon im Eingang steht (#575).
    await this.woerterEinarbeiten().catch(() => 0);
    const pakete = new Map((await this.repo.listePakete()).map((p) => [p.id, p.name] as const));
    return {
      unscharf: await this.unscharfAn(), woerter: await this.repo.woerterAnzahl(),
      synonyme: (await this.repo.synonyme()).map((g) => ({ ...g, ...(g.quelle !== 'werkbank' ? { paketName: pakete.get(g.quelle) ?? g.quelle } : {}) })),
    };
  }
  async setzeSuche(e: unknown, von: string) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const x = (e ?? {}) as { unscharf?: unknown };
    if (typeof x.unscharf !== 'boolean') throw new Fachfehler(422, t('meldungen.dienst.unscharf-true-oder-false'));
    await this.einstellungen.schreibe('suche', x.unscharf ? null : { unscharf: false });
    protokoll.modul('werkbank').info('Suche: Tippfehler', { von, an: x.unscharf });
    return this.sucheStand();
  }
  private wortgruppe(roh: unknown): string[] {
    const g = liesWortgruppe(roh);
    if (g.fehler) throw new Fachfehler(422, g.fehler);
    return g.woerter;
  }
  async legeSynonymAn(e: unknown, von: string) {
    const woerter = this.wortgruppe((e as { woerter?: unknown } | null)?.woerter);
    if ((await this.repo.synonyme()).filter((g) => g.quelle === 'werkbank').length >= SYNONYM_GRUPPEN_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-eigene-gruppen', { SYNONYM_GRUPPEN_MAX }));
    await this.repo.legeSynonymAn({ id: randomUUID(), woerter, quelle: 'werkbank' });
    this.synonymZwischen = null;
    protokoll.modul('werkbank').info('Suche: gleichbedeutende Wörter angelegt', { von, woerter: woerter.length });
    return this.sucheStand();
  }
  async aendereSynonym(id: string, e: unknown, von: string) {
    const woerter = this.wortgruppe((e as { woerter?: unknown } | null)?.woerter);
    if (!(await this.repo.aendereSynonym(id, woerter))) throw new Fachfehler(404, t('meldungen.dienst.diese-gruppe-gibt-es'));
    this.synonymZwischen = null;
    protokoll.modul('werkbank').info('Suche: gleichbedeutende Wörter geändert', { von, woerter: woerter.length });
    return this.sucheStand();
  }
  async loescheSynonym(id: string, von: string) {
    if (!(await this.repo.loescheSynonym(id))) throw new Fachfehler(404, t('meldungen.dienst.diese-gruppe-gibt-es'));
    this.synonymZwischen = null;
    protokoll.modul('werkbank').info('Suche: gleichbedeutende Wörter entfernt', { von });
    return this.sucheStand();
  }
  /** Wortlisten eines Pakets (#356): ersetzen alle Gruppen dieses Pakets; leer = entfernen. */
  async setzePaketSynonyme(paket: string, gruppen: string[][]) {
    await this.repo.setzeSynonyme(paket, gruppen);
    this.synonymZwischen = null;
  }
  async paketSynonyme(paket: string): Promise<string[][]> {
    return (await this.repo.synonyme()).filter((g) => g.quelle === paket).map((g) => g.woerter);
  }
  async woerterNeu(von: string) {
    const t0 = Date.now();
    const n = await this.repo.woerterNeu();
    protokoll.modul('werkbank').info('Suche: Wörterverzeichnis neu aufgebaut', { von, woerter: n, ms: Date.now() - t0 });
    return this.sucheStand();
  }

  /** Suche mit Ähnlichkeit an (Werkbank → Pakete, Einstellung des Kerns)? Standard: an. */
  async vektorEinstellung(): Promise<{ suche: boolean }> {
    const v = (await this.einstellungen?.lies('vektoren')) as { suche?: boolean } | null;
    return { suche: v?.suche !== false };
  }
  async setzeVektorEinstellung(e: unknown): Promise<{ suche: boolean }> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const x = (e ?? {}) as { suche?: unknown };
    if (typeof x.suche !== 'boolean') throw new Fachfehler(422, t('meldungen.dienst.suche-true-oder-false'));
    await this.einstellungen.schreibe('vektoren', x.suche ? null : { suche: false });
    return this.vektorEinstellung();
  }

  /**
   * Das Modell eines Pakets ist (wieder) bekannt. Neues Modell → die Vektoren des alten sind ungültig und
   * fallen weg; die Nachberechnung (Paket-Läufer) rechnet sie im Hintergrund neu.
   */
  async merkeVektorModell(paket: string, modell: string): Promise<void> {
    if (this.vektorModelle.get(paket) === modell) return;
    this.vektorModelle.set(paket, modell);
    const weg = await this.grundRepo.vektorenLoeschePaket(paket, modell);
    if (weg) {
      for (const k of [...this.vektorIndizes.keys()]) if (k !== modell) { this.vektorIndizes.delete(k); this.vektorGeladen.delete(k); }
      protokoll.modul('werkbank').info('Vektoren eines alten Modells entfernt', { paket, modell, entfernt: weg });
    }
    // Zwischenspeicher schon jetzt im Hintergrund laden (bei 100 000 Dokumenten gut eine Sekunde).
    void this.vektorIndex(modell).catch(() => {});
  }

  private pruefeVektorRecht(z: Zugriff | undefined): string {
    if (!z?.paket) throw new Fachfehler(403, t('meldungen.dienst.vektoren-schreiben-nur-pakete'));
    if (!z.paket.schnittstellen?.includes('dms:vektoren')) throw new Fachfehler(403, t('meldungen.dienst.dieses-paket-hat-das'));
    return z.paket.id;
  }

  /** Vektor eines Dokuments setzen (nur Pakete mit dms:vektoren; das Dokument muss das Paket lesen dürfen – prüft die Route). */
  async setzeVektor(z: Zugriff | undefined, dokumentId: string, modellRoh: unknown, eingabe: unknown) {
    const paket = this.pruefeVektorRecht(z);
    const modell = liesModellOder422(modellRoh);
    const index = await this.vektorIndex(modell);
    let vektor: Float32Array;
    try { vektor = liesVektor((eingabe as { vektor?: unknown } | null)?.vektor, index?.dimension); } catch (e) { throw new Fachfehler(422, (e as Error).message); }
    await this.merkeVektorModell(paket, modell);
    const d = await this.repo.holeDokument(dokumentId);
    if (!d || !(await this.repo.vektorSetze({ dokumentId, paket, modell, vektor }))) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const i = await this.vektorIndex(modell);
    if (i) i.setze(dokumentId, d.mappeId, vektor);
    else this.vektorIndizes.set(modell, Promise.resolve(new Vektorindex(vektor.length, [{ dokumentId, mappeId: d.mappeId, vektor }])));
    return { dokument: dokumentId, modell, dimension: vektor.length };
  }

  async loescheVektor(z: Zugriff | undefined, dokumentId: string, modellRoh: unknown) {
    this.pruefeVektorRecht(z);
    const modell = liesModellOder422(modellRoh);
    const n = await this.repo.vektorLoesche(dokumentId, modell);
    (await this.vektorIndex(modell))?.entferne(dokumentId);
    return { entfernt: n };
  }

  /**
   * Ähnliche Dokumente zu einem Vektor oder zu einem Dokument – nur in Mappen, die der Aufrufer lesen darf.
   * Ohne Modell: das aktuelle Modell des Pakets mit dms:vektoren.
   */
  async aehnlicheDokumente(z: Zugriff | undefined, q: { modell?: unknown; vektor?: unknown; dokument?: string; anzahl?: unknown; schwelle?: unknown }): Promise<{ modell: string; treffer: Treffer[] }> {
    const modell = q.modell === undefined || q.modell === '' ? this.aktuellesVektorModell() : liesModellOder422(q.modell);
    if (!modell) return { modell: '', treffer: [] };
    const index = await this.vektorIndex(modell);
    if (!index) return { modell, treffer: [] };
    const anzahl = Math.min(100, Math.max(1, Math.floor(Number(q.anzahl) || 10)));
    const schwelle = q.schwelle === undefined || q.schwelle === '' ? -1 : Number(q.schwelle);
    if (!Number.isFinite(schwelle) || schwelle < -1 || schwelle > 1) throw new Fachfehler(422, t('meldungen.dienst.schwelle-eine-zahl-von'));
    let v: Float32Array;
    const ohne = new Set<string>();
    if (q.dokument) {
      const x = index.vektor(q.dokument);
      if (!x) throw new Fachfehler(404, t('meldungen.dienst.zu-diesem-dokument-gibt'));
      v = x; ohne.add(q.dokument);
    } else {
      try { v = liesVektor(q.vektor, index.dimension); } catch (e) { throw new Fachfehler(422, (e as Error).message); }
    }
    return { modell, treffer: await this.lesbareTreffer(z, index, v, anzahl, { schwelle, ohne }) };
  }

  /** Die besten lesbaren Treffer: erst mehr Kandidaten holen, dann nach Rechten filtern (bei Bedarf mehr). */
  private async lesbareTreffer(z: Zugriff | undefined, index: Vektorindex, v: Float32Array, anzahl: number, opt: { schwelle: number; ohne?: Set<string>; jeMappe?: boolean; ohneMappen?: Set<string> }): Promise<Treffer[]> {
    for (let k = Math.max(50, anzahl * 5); ; k *= 4) {
      const roh = index.suche(v, k, { schwelle: opt.schwelle, ohne: opt.ohne });
      const ok = await this.lesbare(z, [...new Set(roh.map((t) => t.mappeId))]);
      const lesbar = roh.filter((t) => ok.has(t.mappeId) && !opt.ohneMappen?.has(t.mappeId));
      const erg = opt.jeMappe ? jeMappe(lesbar, anzahl) : lesbar.slice(0, anzahl);
      if (erg.length >= anzahl || roh.length < k || k >= index.anzahl) return erg;
    }
  }

  /** Aktuelles Modell (Paket mit dms:vektoren); ohne Antwort des Pakets das zuletzt gesehene. */
  private aktuellesVektorModell(): string | null {
    const p = this.vektorAnbieter?.paket();
    return (p && this.vektorModelle.get(p)) ?? [...this.vektorModelle.values()][0] ?? null;
  }

  /**
   * „Ähnliche Dokumente“ an einer Mappe: je Dokument der Mappe die ähnlichsten Dokumente anderer lesbarer
   * Mappen, zusammengefasst je Mappe. verfuegbar = es gibt ein Paket mit dms:vektoren.
   */
  async aehnlicheZurMappe(z: Zugriff | undefined, mappeId: string): Promise<{ verfuegbar: boolean; berechnet: boolean; mappen: Array<{ id: string; titel: string; typId: string; dokument: { id: string; name: string }; aehnlichkeit: number }> }> {
    const paket = this.vektorAnbieter?.paket() ?? null;
    if (!paket) return { verfuegbar: false, berechnet: false, mappen: [] };
    await this.pruefeRecht(z, mappeId, 'R');
    const modell = this.aktuellesVektorModell();
    const index = modell ? await this.vektorIndex(modell) : null;
    const eigene = (await this.repo.dokumenteVon([mappeId])).map((d) => d.id);
    const vektoren = index ? eigene.map((id) => index.vektor(id)).filter((v): v is Float32Array => !!v) : [];
    if (!index || !vektoren.length) return { verfuegbar: true, berechnet: false, mappen: [] };
    const schwelle = this.vektorSchwelle.get(modell!) ?? SCHWELLE_STANDARD;
    const alle = (await Promise.all(vektoren.map((v) => this.lesbareTreffer(z, index, v, 5, { schwelle, jeMappe: true, ohneMappen: new Set([mappeId]) })))).flat();
    return { verfuegbar: true, berechnet: true, mappen: await this.trefferMitTitel(jeMappe(alle, 5)) };
  }

  /** Schwelle je Modell, wie das Paket sie mit dem Vektor des Suchbegriffs meldet. */
  private vektorSchwelle = new Map<string, number>();

  private async trefferMitTitel(t: Treffer[]) {
    if (!t.length) return [];
    const b = await this.repo.bezuege(t.map((x) => x.mappeId));
    const namen = new Map<string, string>();
    for (const x of t) { const d = await this.repo.holeDokument(x.dokumentId); if (d) namen.set(x.dokumentId, d.name); }
    return t.filter((x) => b.has(x.mappeId)).map((x) => ({ id: x.mappeId, titel: b.get(x.mappeId)!.titel, typId: b.get(x.mappeId)!.typId, dokument: { id: x.dokumentId, name: namen.get(x.dokumentId) ?? '' }, aehnlichkeit: Math.round(x.aehnlichkeit * 100) / 100 }));
  }

  /**
   * Ähnliche Treffer zu einem Suchbegriff (#442): das Paket liefert den Vektor (mit Zeitgrenze), der Kern
   * vergleicht. Leer, wenn die Einstellung aus ist, kein Paket da ist oder es nicht rechtzeitig antwortet.
   * typen: nur Mappen dieser Typen (die der Ansicht); ohneMappen: schon in der normalen Trefferliste.
   */
  async aehnlicheZurSuche(z: Zugriff | undefined, suche: string, opt: { typen: Set<string> | null; ohneMappen: Set<string>; anzahl?: number; ms?: number }) {
    if (!this.vektorAnbieter?.paket() || suche.trim().length < 3 || !(await this.vektorEinstellung()).suche) return [];
    const ms = opt.ms ?? SUCHE_VEKTOR_MS, start = Date.now();
    const q = await this.vektorAnbieter.vektorFuer(suche, ms).catch(() => null);
    if (!q) return [];
    await this.merkeVektorModell(q.paket, q.modell);
    this.vektorSchwelle.set(q.modell, q.schwelle);
    // Lädt der Zwischenspeicher noch (kurz nach dem Start): höchstens die restliche Zeit warten, sonst ohne Ähnlichkeit.
    if (!this.vektorGeladen.has(q.modell)) {
      const rest = Math.max(0, ms - (Date.now() - start));
      await Promise.race([this.vektorIndex(q.modell).catch(() => null), new Promise((ok) => setTimeout(ok, rest).unref?.())]);
      if (!this.vektorGeladen.has(q.modell)) return [];
    }
    const index = await this.vektorIndex(q.modell);
    if (!index || index.dimension !== q.vektor.length) return [];
    let treffer = await this.lesbareTreffer(z, index, q.vektor, (opt.anzahl ?? 5) * 3, { schwelle: q.schwelle, jeMappe: true, ohneMappen: opt.ohneMappen });
    if (opt.typen) {
      const b = await this.repo.bezuege(treffer.map((t) => t.mappeId));
      treffer = treffer.filter((t) => opt.typen!.has(b.get(t.mappeId)?.typId ?? ''));
    }
    return this.trefferMitTitel(treffer.slice(0, opt.anzahl ?? 5));
  }

  /**
   * Ähnliche Dokumente zu einem freien Text (#444, „Frag deine Ablage“): das Paket liefert den Vektor (mit
   * Zeitgrenze), der Kern vergleicht – nur lesbare Mappen, je Mappe das beste Dokument. Leer ohne Paket.
   */
  async aehnlicheZuText(z: Zugriff | undefined, text: string, anzahl: number, ms: number): Promise<Treffer[]> {
    if (!this.vektorAnbieter?.paket() || text.trim().length < 3) return [];
    const q = await this.vektorAnbieter.vektorFuer(text, ms).catch(() => null);
    if (!q) return [];
    await this.merkeVektorModell(q.paket, q.modell);
    if (!this.vektorGeladen.has(q.modell)) return [];
    const index = await this.vektorIndex(q.modell);
    if (!index || index.dimension !== q.vektor.length) return [];
    return this.lesbareTreffer(z, index, q.vektor, anzahl, { schwelle: q.schwelle, jeMappe: true });
  }

  /**
   * Ähnlichkeit für „Wohin gehört das?“ (#939, dms-registry#142): die Mappentypen der ähnlichsten abgelegten Dokumente
   * zu einem Text – nur Mappen, die die Person **und** der Benutzer des Pakets lesen dürfen, und nur Typen aus `typen`
   * (Kandidaten: „Kann aus Post angelegt werden“, Anlegerecht, für KI-Dienste zugelassen). Je Mappe das beste Dokument,
   * höchstens `anzahl`. Heraus gehen nur Typ und Ähnlichkeit – keine Ids, Titel oder Inhalte. null: kein Paket mit
   * dms:vektoren (bzw. ein anderes als `paket`), keine Antwort in `ms` oder der Zwischenspeicher lädt noch.
   */
  async aehnlicheTypen(z: Zugriff | undefined, paket: string, text: string, typen: ReadonlySet<string>, anzahl: number, ms: number): Promise<Array<{ typ: string; aehnlichkeit: number }> | null> {
    if (this.vektorAnbieter?.paket() !== paket || text.trim().length < 3 || !typen.size) return null;
    const start = Date.now();
    const q = await this.vektorAnbieter.vektorFuer(text, ms).catch(() => null);
    if (!q || q.paket !== paket) return null;
    await this.merkeVektorModell(q.paket, q.modell);
    if (!this.vektorGeladen.has(q.modell)) {
      const rest = Math.max(0, ms - (Date.now() - start));
      await Promise.race([this.vektorIndex(q.modell).catch(() => null), new Promise((ok) => setTimeout(ok, rest).unref?.())]);
      if (!this.vektorGeladen.has(q.modell)) return null;
    }
    const index = await this.vektorIndex(q.modell);
    if (!index || index.dimension !== q.vektor.length) return null;
    const konto = (await this.konten?.dienstkonten?.())?.find((b) => b.paketId === paket);
    const zp = await this.zugriff({ id: konto?.id ?? `paket:${paket}`, rolle: 'mitglied', art: 'dienst', paketId: paket });
    const roh = index.suche(q.vektor, Math.min(index.anzahl, Math.max(200, anzahl * 20)), { schwelle: q.schwelle });
    const ids = [...new Set(roh.map((x) => x.mappeId))];
    const [person, paketDarf, bezuege] = await Promise.all([this.lesbare(z, ids), this.lesbare(zp, ids), this.repo.bezuege(ids)]);
    const ok = roh.filter((x) => person.has(x.mappeId) && paketDarf.has(x.mappeId) && typen.has(bezuege.get(x.mappeId)?.typId ?? ''));
    return jeMappe(ok, anzahl).map((x) => ({ typ: bezuege.get(x.mappeId)!.typId, aehnlichkeit: Math.round(x.aehnlichkeit * 100) / 100 }));
  }

  /** Für die Werkbank: Vektoren je Modell, Dokumente mit Volltext, Einstellung. */
  async vektorStand(): Promise<{ paket: string | null; modell: string | null; mitVektor: number; mitVolltext: number; modelle: Array<{ paket: string; modell: string; anzahl: number }>; suche: boolean; zwischenspeicherMB: number | null }> {
    const paket = this.vektorAnbieter?.paket() ?? null;
    const modell = paket ? this.vektorModelle.get(paket) ?? null : this.aktuellesVektorModell();
    const modelle = await this.repo.vektorStand();
    const index = modell && this.vektorIndizes.has(modell) ? await this.vektorIndex(modell) : null;
    return {
      paket, modell, modelle,
      mitVektor: modelle.filter((m) => m.paket === paket && m.modell === modell).reduce((n, m) => n + m.anzahl, 0),
      mitVolltext: await this.repo.mitVolltext(),
      suche: (await this.vektorEinstellung()).suche,
      zwischenspeicherMB: index ? Math.round(index.bytes / 104857.6) / 10 : null,
    };
  }

  /** „Neu berechnen“ in der Werkbank: alle Vektoren des Pakets weg, die Nachberechnung beginnt von vorn. */
  async vektorenNeu(paket: string): Promise<{ entfernt: number }> {
    const n = await this.grundRepo.vektorenLoeschePaket(paket);
    this.vektorIndizes.clear(); this.vektorGeladen.clear();
    return { entfernt: n };
  }

  /**
   * Nachberechnung des Bestands (#442): für bis zu `max` Dokumente mit Volltext ohne Vektor dieses Modells ein
   * Ereignis „volltext.fertig“ an das Paket (nach = Dokument-Id, ab der weitergesucht wird). Liefert die Ids.
   */
  async vektorNachlauf(paket: string, modell: string, max: number, nach: string | null): Promise<string[]> {
    const alle = await this.grundRepo.ohneVektor(modell, max, nach);
    if (!alle.length) return [];
    // KI-Dienste (#796): Dokumente nicht zugelassener Mappentypen bekommt ein KI-Paket auch hier nicht (Stelle rückt trotzdem weiter).
    const gesperrt = await this.kiSperreFuer(paket);
    const typen = await this.grundRepo.typenVon([...new Set(alle.map((d) => d.mappeId))]);
    const liste = alle.filter((d) => { const typ = typen.get(d.mappeId); return !!typ && !gesperrt(typ); });
    if (liste.length) await this.grundRepo.legeEreignisseAn(liste.map((d) => ({ id: randomUUID(), paketId: paket, art: 'volltext.fertig', daten: { dokument: d.id, mappe: d.mappeId, nachberechnung: true } })));
    this.ereignisWecker?.();
    return alle.map((d) => d.id);
  }

  /** Das Repo – innerhalb von `inTransaktion` das der Transaktion. */
  private get repo(): Repo {
    const t = transaktionen.getStore();
    return t?.dienst === this ? t.repo : this.grundRepo;
  }

  /**
   * Änderungen samt Ereignissen ganz oder gar nicht (#404). Verschachtelt läuft alles in der äußeren
   * Transaktion. Nur Datenbank-Arbeit hineinlegen: Dateien schreiben vorher, Anstöße (Vorschau,
   * Texterkennung, Läufer) mit `danach`.
   */
  private async inTransaktion<T>(f: () => Promise<T>): Promise<T> {
    if (transaktionen.getStore()?.dienst === this) return f();
    const nachher: Array<() => void> = [];
    const erg = await this.grundRepo.transaktion((repo) => transaktionen.run({ dienst: this, repo, nachher }, f));
    for (const n of nachher) n();
    return erg;
  }

  /**
   * Wie `inTransaktion`; bricht PostgreSQL die eigene Transaktion wegen einer Verklemmung ab (#575), noch einmal von
   * vorn (#743). In einer äußeren Transaktion nicht – die ist dann ohnehin verloren.
   */
  private async inEinemZug<T>(f: () => Promise<T>): Promise<T> {
    if (transaktionen.getStore()?.dienst === this) return f();
    return beiVerklemmungWiederholen(() => this.inTransaktion(f));
  }

  /** Läuft das in einer HTTP-Anfrage, die Arbeit nach der Antwort annimmt (#928)? */
  private inAnfrage(): boolean { return !!kontext.getStore()?.nachAntwort; }

  /**
   * Nach der Antwort (#928, über den Nachlauf von #741): Arbeit, die nicht zur Antwort gehört und auch nicht zu dem, was
   * die Person gleich danach sieht. Ohne Anfrage (Tests, Hintergrund, Automatisierungen) gleich – dann wird gewartet.
   * Erst nach dem Speichern einer Transaktion; wird sie zurückgerollt, nie. Fehler nur im Protokoll.
   */
  private nachDerAntwort(f: () => Promise<unknown>): Promise<void> | void {
    const k = kontext.getStore();
    if (!k?.nachAntwort) return f().then(() => undefined);
    const liste = k.nachAntwort;
    this.danach(() => { if (!liste.includes(f)) liste.push(f); });
  }

  /** Verteiler des Ereigniskatalogs wecken – in einer Anfrage erst nach der Antwort (#928), einmal je Anfrage. */
  private readonly weckeVerteiler = async () => { this.ereignisse.wecke(); };

  /** Nach dem Speichern (bzw. sofort ohne Transaktion); bei Zurückrollen nie. */
  private danach(f: () => void) {
    const t = transaktionen.getStore();
    if (t?.dienst === this) t.nachher.push(f); else f();
  }

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
    return { ...o, datei: (sha) => this.liesGanz(sha), dokumenteMitSha: (sha) => this.repo.dokumenteMitSha(sha), nachEntsperren: (docs, info) => this.nachEntsperren(docs, info) };
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
        const w = (await this.paketEinstellungen(paket))?.werte ?? {};
        if (k in w) return w[k];
        const p = (await this.repo.listePakete()).find((x) => x.id === paket);
        return p?.einstellungen ? vorgaben(p.einstellungen)[k] : undefined;
      },
      melde: (paket, daten) => this.auftrag(paket, 'datei.archivfassung', daten),
      dokumenteMitSha: (sha) => this.repo.dokumenteMitSha(sha),
      dokumenteMitTyp: (m) => this.repo.dokumenteMitTyp(m),
      lesefassung: async (sha) => (await this.umwandlung?.lies(sha)) ?? null,
      datei: (sha) => this.liesGanz(sha),
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

  /** Lassen sich gerade Passwörter speichern? */
  get passwoerterMoeglich() { return !!this.tresor?.bereit; }

  /** Passwortfelder, die mit dem vorhandenen Schlüssel nicht lesbar sind (für die Werkbank). */
  async unlesbarePasswoerter(): Promise<Betroffen[]> {
    const out: Betroffen[] = [];
    for (const mappentyp of await this.repo.listeTypen()) {
      const felder = mappentyp.felder.filter((f) => f.typ === 'passwort');
      if (!felder.length) continue;
      for (const m of await this.repo.listeMappen(mappentyp.id)) {
        for (const f of felder) {
          const v = m.werte[f.key];
          if (istVerschluesselt(v) && !this.tresor?.lesbar(v)) out.push({ bereich: mappentyp.name, was: `${m.titel || t('meldungen.dienst.mappe-ohne-titel')}: ${f.label}`, wo: t('meldungen.dienst.in-der-ablage-neu') });
        }
      }
    }
    return out;
  }

  /** Klartext eines Passworts zum Anzeigen; jeder Aufruf steht im Protokoll (ohne den Wert). */
  async zeigePasswort(mappeId: string, feldKey: string, benutzerId: string | null = null): Promise<{ wert: string }> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const typ = await this.repo.holeTyp(m.typId);
    const f = typ?.felder.find((x) => x.key === feldKey && x.typ === 'passwort');
    if (!f) throw new Fachfehler(404, t('meldungen.dienst.dieses-passwortfeld-gibt-es'));
    const v = m.werte[f.key];
    if (!istVerschluesselt(v)) throw new Fachfehler(404, t('meldungen.dienst.in-diesem-feld-ist'));
    const klar = this.tresor?.entschluessele(v) ?? null;
    if (klar === null) throw new Fachfehler(409, t('meldungen.dienst.dieses-passwort-ist-nicht'));
    protokoll.modul('ablage').info('Passwort angezeigt', { mappe: m.titel || m.id, mappeId: m.id, feld: f.label });
    await this.notiere(m.id, benutzerId, 'passwort_angezeigt', { feld: f.label });
    return { wert: klar };
  }

  /**
   * Für die API mit dem Recht „Passwörter lesen“: Passwörter einer oder mehrerer Mappen
   * im Klartext; je Mappe ein Protokolleintrag (ohne die Werte).
   */
  async entschluesselePasswoerter<T extends Mappe>(mappen: T[], wer: string, benutzerId: string | null = null): Promise<T[]> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const historie: Parameters<Repo['historieSchreibe']>[0] = [];
    const ergebnis = mappen.map((m) => {
      const felder = typen.get(m.typId)?.felder.filter((f) => f.typ === 'passwort' && istVerschluesselt(m.werte[f.key])) ?? [];
      if (!felder.length) return m;
      const werte = { ...m.werte };
      for (const f of felder) werte[f.key] = this.tresor?.entschluessele(werte[f.key] as string) ?? null;
      protokoll.modul('ablage').info('Passwörter über die API abgerufen', { mappe: m.titel || m.id, mappeId: m.id, felder: felder.map((f) => f.label).join(', '), schluessel: wer });
      historie.push({ mappeId: m.id, benutzerId, art: 'passwort_angezeigt', daten: { feld: felder.map((f) => f.label).join(', '), api: wer } });
      return { ...m, werte };
    });
    await this.repo.historieSchreibe(historie);
    return ergebnis;
  }

  /* ---------- Aufgaben (#54) und Erwähnungen (#56) ---------- */

  /** Anzeigename eines Benutzers (auch für Platzhalter in Automatisierungen, #678). */
  async name(benutzerId: string | null): Promise<string> {
    if (!benutzerId) return t('meldungen.dienst.ohne-empfaenger');
    return (await this.repo.titelVon([benutzerId])).get(benutzerId) || 'unbekannt';
  }

  /** Ein aktiver Benutzer (seine Benutzer-Mappe), sonst 422. */
  private async pruefeEmpfaenger(id: unknown): Promise<string> {
    const { benutzer } = await this.sichereSystem();
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
    const { benutzer } = await this.sichereSystem();
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
    const { benutzer: typ } = await this.sichereSystem();
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
   * Fälligkeit bleibt. Von Hand geschriebene Texte (Zugewiesen, Erinnerung – von einem Menschen) bleiben sichtbar.
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
    return liste.map((a) => (lesbar.has(a.mappeId) || vonHand(a) ? a : { ...a, text: text.get(a.mappeId)! }));
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
      if (!mitRecht) { this.nachDerAntwort(abgleichen); return; }
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

  private static notiztext(e: unknown): string {
    const text2 = typeof e === 'string' ? e.replace(/\r\n?/g, '\n').trim() : '';
    if (!text2) throw new Fachfehler(422, t('meldungen.dienst.die-notiz-ist-leer'));
    if (text2.length > NOTIZ_MAX) throw new Fachfehler(422, t('meldungen.dienst.eine-notiz-darf-hoechstens', { NOTIZ_MAX: NOTIZ_MAX.toLocaleString(gebietsschema()) }));
    return text2;
  }
  private static vorschau(t: string) { const x = alsText(t); return x.length > 80 ? `${x.slice(0, 77)} …` : x; }

  async notizen(mappeId: string): Promise<Notiz[]> {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    return this.repo.notizen(mappeId);
  }

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
    const { post: typ } = await this.sichereSystem();
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
    const { post: typ } = await this.sichereSystem();
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

  /** Ein Eintrag in die Historie einer Mappe – und bei Favoriten anderer die gebündelte Benachrichtigung (#422). */
  private async notiere(mappeId: string, benutzerId: string | null, art: Historienart, daten?: Historieneintrag['daten']) {
    await this.repo.historieSchreibe([{ mappeId, benutzerId, art, daten }]);
    // Ereigniskatalog (#670): was in der Historie steht, ist auch ein Ereignis – nur mit Ids und Feldschlüsseln.
    const katalog = NOTIERT_ALS[art];
    if (katalog) {
      const felder = art === 'geaendert' ? [...new Set(((daten?.aenderungen ?? []) as Feldaenderung[]).map((a) => a.feld).filter((f) => !f.startsWith('_')))].sort() : undefined;
      if (art !== 'geaendert' || felder?.length) await this.ereignis(katalog, { mappe: mappeId, typ: await this.typVon(mappeId), ...(felder ? { felder } : {}) }, benutzerId);
    }
    // Favoriten (#422, #678): Das Melden übernimmt die Automatisierung „Favoriten-Änderungen melden“ (Paket
    // „Benachrichtigungen“). Ein Ereignis gibt es nur, wenn jemand anderes die Mappe als Favorit mit „benachrichtigen“ hat.
    if (benutzerId && (ABO_ARTEN as readonly string[]).includes(art) && daten?.aufgabenart !== 'aenderung') {
      try {
        if ((await this.repo.favoritenDerMappe(mappeId)).some((f) => f.benachrichtigen && f.benutzerId !== benutzerId)) await this.ereignis('favorit.geaendert', { mappe: mappeId, typ: await this.typVon(mappeId), von: benutzerId }, benutzerId);
      } catch (e) { protokoll.modul('ablage').warn('Benachrichtigung zu Favoriten nicht angelegt', { mappeId, fehler: (e as Error).message }); }
    }
  }

  /* ---------- Favorit = Abo (#422) ---------- */

  /**
   * Persönliche Einstellung (Vorgabe an): „favoriten_benachrichtigen“ bzw. „geaenderte_hervorheben“ = false schaltet ab.
   * Benachrichtigen nur, wenn die Werkbank es für den Benutzer erlaubt (#506); seine Einstellung bleibt dabei gespeichert.
   */
  /** Persönliche Einstellungen eines Benutzers (#678: Zeitplan „für jeden Benutzer“ mit Uhrzeit aus dem Profil). */
  async persoenlicheEinstellungen(benutzerId: string): Promise<Record<string, unknown>> { return (await this.konten?.einstellungen?.(benutzerId)) ?? {}; }

  private async persoenlichAn(benutzerId: string, schluessel: string): Promise<boolean> {
    if (schluessel === 'favoriten_benachrichtigen' && !(await this.favoritenBenachrichtigungErlaubt(benutzerId))) return false;
    return (await this.konten?.einstellungen?.(benutzerId))?.[schluessel] !== false;
  }

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
    if (transaktionen.getStore()?.dienst === this) return this.bildeAlltagsEmpfaenger();
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

  /**
   * Mappen gesehen (#422): geöffnet oder „Alle als gesehen markieren“. Die Hervorhebung verschwindet, und eine
   * offene Benachrichtigung „Geändert“ erledigt sich – die nächste Änderung bringt wieder eine.
   */
  /** `aufgaben`: alle Aufgaben dieser Mappen, wenn sie schon gelesen sind (#615, „Mappe öffnen“). */
  async gesehen(ich: { id: string }, mappeIds: unknown, aufgaben?: Aufgabe[]) {
    const ids = (Array.isArray(mappeIds) ? mappeIds : [mappeIds]).filter((x): x is string => istUuid(x)).slice(0, 1000);
    if (!ids.length) return;
    await this.repo.merkeGesehen(ich.id, ids);
    const offen = aufgaben ? aufgaben.filter((x) => !x.erledigt && ids.includes(x.mappeId)) : await this.repo.offeneAufgaben({ mappeIds: ids });
    for (const a of offen.filter((x) => x.art === 'aenderung' && x.empfaengerId === ich.id)) {
      await this.repo.erledigeAufgabe(a.id, ich.id);
    }
  }

  /** Je Favorit „bei Änderungen benachrichtigen“ (#422, Schalter in der Favoritenliste). */
  async setzeFavoritBenachrichtigen(ich: { id: string }, mappeId: string, an: unknown) {
    if (!(await this.repo.favoritenVon(ich.id, [mappeId])).has(mappeId)) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-ist-kein'));
    await this.repo.setzeFavoritBenachrichtigen(ich.id, mappeId, an !== false);
    return { benachrichtigen: an !== false };
  }

  /** Was sich zwischen zwei Ständen geändert hat – lesbar, wie es zu diesem Zeitpunkt aussah. */
  private async aenderungen(typ: Mappentyp, alt: Werte, neu: Werte): Promise<Feldaenderung[]> {
    const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const felder = typ.felder.filter((f) => !gleich(alt[f.key], neu[f.key]) && !(istLeer(alt[f.key]) && istLeer(neu[f.key])));
    if (!felder.length) return [];
    const ids = felder.filter((f) => f.typ === 'referenz').flatMap((f) => [alt[f.key], neu[f.key]].flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))).map(String).filter(istUuid);
    const titel = await this.repo.titelVon(ids);
    const lesbar = (f: Feld, v: Werte[string] | undefined) => {
      const text2 = formatiere(f, v, (id) => titel.get(id) || t('meldungen.dienst.ohne-titel'));
      return text2.length > 500 ? `${text2.slice(0, 497)} …` : text2;
    };
    // Altes Textfeld neben seinem Verweis (#534): „Halter (Text)“ statt zweimal „Halter“.
    const label = (f: Feld) => (verweisAusText(typ, f) ? t('pakete.historie.alttext', { label: f.label }) : f.label);
    return felder.map((f) => (f.typ === 'passwort'
      ? { feld: f.key, label: label(f), geheim: true }
      : { feld: f.key, label: label(f), alt: lesbar(f, alt[f.key]), neu: lesbar(f, neu[f.key]) }));
  }

  /**
   * Historie einer Mappe (auch im Papierkorb). Ohne Angaben alle Einträge (wie bisher, auch für die API). #800: Mit
   * `register` nur, was dieses Register „Historie“ zeigt (seine Einstellung, sonst die Vorauswahl; ein unbekanntes
   * Register zeigt alles); mit `max` (1–1000) eine Seite, mit `vor` (Id des letzten Eintrags) die nächste.
   */
  async historie(mappeId: string, o: { register?: unknown; max?: unknown; vor?: unknown } = {}): Promise<Historieneintrag[]> {
    const m = (await this.repo.holeMappe(mappeId)) ?? (await this.repo.holeAusPapierkorb(mappeId));
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const zahl = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    const max = zahl(o.max), vor = zahl(o.vor);
    if (max !== undefined && (!Number.isInteger(max) || max < 1 || max > HISTORIE_SEITE_MAX)) throw new Fachfehler(422, t('meldungen.dienst.historie-max', { max: HISTORIE_SEITE_MAX }));
    if (vor !== undefined && !Number.isSafeInteger(vor)) throw new Fachfehler(422, t('meldungen.dienst.historie-vor'));
    let arten: string[] | undefined;
    if (typeof o.register === 'string' && o.register) {
      const reg = (await this.repo.holeTyp(m.typId))?.register.find((r) => r.key === o.register && r.art === 'protokoll');
      if (reg) arten = historienartenVon(historiengruppenVon(reg));
    }
    return this.repo.historie(mappeId, { ...(arten ? { arten } : {}), ...(max ? { max } : {}), ...(vor !== undefined ? { vor } : {}) });
  }

  /** Rauschen unterdrücken (#800): derselbe Abruf wird nacheinander geprüft und geschrieben, nicht gleichzeitig doppelt. */
  private readonly abrufeLaufend = new Map<string, Promise<boolean>>();

  /**
   * Abruf einer Datei in die Historie (#800): in der Oberfläche heruntergeladen, mit einem API-Schlüssel oder über das
   * WebDAV-Laufwerk abgerufen – mit Wer, Wann, Weg, Datei und Fassung. Ruft dieselbe Person dieselbe Datei (und
   * Fassung) auf demselben Weg am selben Kalendertag (Zeitzone der Ablage) noch einmal ab, bleibt es bei einem
   * Eintrag: Vorschaubilder und das mehrfache Lesen durch Explorer oder Office zählen so nur einmal. Ein Abruf an
   * einem späteren Tag bekommt einen eigenen Eintrag. Liefert, ob ein Eintrag geschrieben wurde.
   */
  async notiereAbruf(x: { dokumentId: string; benutzerId: string | null; weg: Abrufweg; fassung?: Abruffassung; version?: number | null; gestempelt?: boolean; schluessel?: string | null; datei?: string }): Promise<boolean> {
    const art = ABRUF_ART[x.weg];
    const fassung = x.fassung ?? 'original';
    const version = x.version ?? null;
    const k = [x.dokumentId, x.benutzerId ?? '', art, fassung, version ?? ''].join('|');
    const vorher = this.abrufeLaufend.get(k);
    const lauf = (vorher ?? Promise.resolve(false)).catch(() => false).then(async () => {
      const d = await this.repo.holeDokument(x.dokumentId);
      if (!d) return false;
      const jetzt = new Date();
      // Seit 26 Stunden über den Index der Mappe; „derselbe Tag“ entscheidet dann der Kalendertag in der Zeitzone.
      const letzter = await this.repo.letzterAbruf(d.mappeId, art, x.benutzerId, d.id, fassung, version, new Date(jetzt.getTime() - 26 * 3600_000).toISOString());
      if (letzter && tagIn(new Date(letzter)) === tagIn(jetzt)) return false;
      await this.notiere(d.mappeId, x.benutzerId, art, {
        dokument: d.name, dokumentId: d.id, weg: x.weg, fassung,
        ...(version !== null ? { version } : {}), ...(x.gestempelt ? { gestempelt: true } : {}),
        ...(x.schluessel ? { schluessel: x.schluessel } : {}), ...(x.datei && x.datei !== d.name ? { datei: x.datei } : {}),
      });
      return true;
    });
    this.abrufeLaufend.set(k, lauf);
    try { return await lauf; } finally { if (this.abrufeLaufend.get(k) === lauf) this.abrufeLaufend.delete(k); }
  }

  /** Wie lange die Historie endgültig gelöschter Mappen bleibt (Tage). */
  async historieTage(): Promise<number> {
    const e = this.einstellungen ? ((await this.einstellungen.lies('historie')) as { tage?: number } | null) : null;
    return typeof e?.tage === 'number' ? e.tage : HISTORIE_STANDARD_TAGE;
  }

  async setzeHistorieTage(eingabe: unknown): Promise<number> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const tage = Number(eingabe);
    if (!Number.isInteger(tage) || tage < 0 || tage > 36500) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-ganze-zahl'));
    await this.einstellungen.schreibe('historie', { tage });
    protokoll.modul('werkbank').info('Aufbewahrung der Historie gelöschter Mappen geändert', { tage });
    return tage;
  }

  listeTypen() { return this.repo.listeTypen(); }

  /** Mappentypen für einen Benutzer: Administratoren mit Regeln, alle anderen ohne – dafür „darf anlegen“ (#126). */
  async typenFuer(z: Zugriff) {
    const typen = await this.mitStempel([...z.typen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')));
    if (z.admin) return typen;
    return typen.map(({ berechtigungen, ...t }) => ({ ...t, berechtigungen: null, darfAnlegen: rechteUebersicht({ ...t, berechtigungen }, z.wer, z.a).C !== 'nie' }));
  }

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

  /** Profil (#126): je Mappentyp, welche Rechte man hat – „immer“, „nie“ oder „je nach Mappe“. */
  async rechteUebersicht(z: Zugriff) {
    return [...z.typen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((t) => ({
      typId: t.id, name: t.name,
      rechte: z.admin ? Object.fromEntries((['C', 'R', 'U', 'D', 'P'] as Recht[]).map((k) => [k, (k === 'C' && systemSperre(t).C) || (k === 'D' && systemSperre(t).D) ? 'nie' : 'immer'])) : rechteUebersicht(t, z.wer, z.a),
    }));
  }

  private async pruefeTyp(d: MappentypDaten, eigeneId: string) {
    if (d.archiv?.stichtag && d.felder.find((f) => f.key === d.archiv!.stichtag)?.typ !== 'datum') {
      throw new Fachfehler(422, t('meldungen.dienst.archivmodus-der-stichtag-muss'), { allgemein: [t('meldungen.dienst.archivmodus-der-stichtag-muss')], felder: {} });
    }
    const alle = await this.repo.listeTypen();
    // Quellen von Verknüpfungsregistern, deren Feld es nicht mehr gibt, still entfernen.
    for (const r of d.register) {
      if (r.art !== 'verknuepfungen') continue;
      r.quellen = (r.quellen ?? []).filter((q) => {
        const felder = q.typId === eigeneId ? d.felder : alle.find((t) => t.id === q.typId)?.felder;
        const f = felder?.find((x) => x.key === q.feldKey);
        return f?.typ === 'referenz' && (f.zielTyp === eigeneId || f.zielTyp === '*');
      });
    }
    // Fristen (#129): Empfängerfeld nur, wenn es ein einfaches Benutzerfeld dieses Typs ist.
    const benutzerTyp = alle.find((t) => t.system === 'benutzer')?.id;
    const taugt = new Set(empfaengerFelder(d, benutzerTyp).map((f) => f.key));
    for (const f of d.felder) if (f.frist?.empfaengerFeld && !taugt.has(f.frist.empfaengerFeld)) f.frist.empfaengerFeld = null;
    const p = pruefeMappentyp(d, {
      eigeneId,
      namenAndererTypen: alle.filter((t) => t.id !== eigeneId).map((t) => t.name),
      schluesselAndererTypen: alle.filter((t) => t.id !== eigeneId && t.schluessel).map((t) => t.schluessel!),
      existiertTyp: (id) => alle.some((t) => t.id === id),
      felderVon: (id) => alle.find((t) => t.id === id)?.felder,
      nummernkreise: (await this.repo.listeNummernkreise()).map((k) => k.schluessel),
      auswahlProbleme: (bed, felder, eigene) => auswahlProbleme(bed, { felder }, eigene),
    });
    if (!istOk(p)) throw new Fachfehler(422, t('meldungen.dienst.der-mappentyp-ist-so'), p);
  }

  /** Mappentyp anlegen bzw. ändern; die Stempel-Einstellung (#394) liegt daneben in den Einstellungen. */
  async legeTypAn(eingabe: unknown): Promise<Mappentyp> { return this.mitStempelEingabe(eingabe, (e) => this.legeTypAnIntern(e)); }
  async aendereTyp(id: string, eingabe: unknown): Promise<Mappentyp> { return this.mitStempelEingabe(eingabe, (e) => this.aendereTypIntern(id, e)); }
  private async mitStempelEingabe(eingabe: unknown, f: (e: unknown) => Promise<Mappentyp>): Promise<Mappentyp> {
    const hat = !!eingabe && typeof eingabe === 'object' && 'stempel' in eingabe;
    const st = hat ? await this.pruefeStempelTyp((eingabe as { stempel: unknown }).stempel) : undefined;
    // „Aus Dokument ausfüllen“ (#391): Beschriftung bzw. ausgeblendet – liegt wie der Stempel in den Einstellungen.
    const hatAd = !!eingabe && typeof eingabe === 'object' && 'ausDokument' in eingabe;
    // Erkennung per Paket (#511): vor dem Speichern prüfen (Paket da, Datenabfluss bestätigt).
    if (hatAd) await this.erkennung.pruefeTypWahl(liesAusDokument((eingabe as { ausDokument: unknown }).ausDokument));
    const t = await f(eingabe);
    if (hat) await this.setzeStempelTyp(t.id, st ?? null);
    if (hatAd) await this.setzeTypErkennung(t.id, { ausDokument: liesAusDokument((eingabe as { ausDokument: unknown }).ausDokument) });
    // Post automatisch zuordnen (#337), Standard aus.
    if (!!eingabe && typeof eingabe === 'object' && 'autoZuordnen' in eingabe) await this.setzeTypErkennung(t.id, { auto: (eingabe as { autoZuordnen: unknown }).autoZuordnen === true && !t.system });
    return (await this.mitStempel([t]))[0];
  }

  /** „Aus Dokument ausfüllen“ eines Mappentyps (#391, #511): Beschriftung, ausgeblendet, Erkennung. */
  async ausDokumentVon(typId: string): Promise<AusDokument | null> { return (await this.typErkennungen())[typId]?.ausDokument ?? null; }

  /** Einstellungen der Erkennung je Mappentyp (#391, #337): Einstellung erkennung_typen, Typ-Id → Angaben. */
  private async typErkennungen(): Promise<Record<string, { ausDokument?: AusDokument | null; auto?: boolean }>> {
    const v = await this.einstellungen?.lies('erkennung_typen');
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, { ausDokument?: AusDokument | null; auto?: boolean }> : {};
  }
  private async setzeTypErkennung(typId: string, teil: { ausDokument?: AusDokument | null; auto?: boolean }) {
    if (!this.einstellungen) return;
    const alle = await this.typErkennungen();
    const neu = { ...(alle[typId] ?? {}), ...teil };
    if (!neu.ausDokument) delete neu.ausDokument;
    if (!neu.auto) delete neu.auto;
    if (JSON.stringify(neu) === JSON.stringify(alle[typId] ?? {})) return;
    if (Object.keys(neu).length) alle[typId] = neu; else delete alle[typId];
    await this.einstellungen.schreibe('erkennung_typen', Object.keys(alle).length ? alle : null);
    protokoll.modul('werkbank').info('Erkennung am Mappentyp eingestellt', { typ: typId, ...teil });
  }

  private async legeTypAnIntern(eingabe: unknown): Promise<Mappentyp> {
    const roh = (eingabe ?? {}) as { id?: unknown };
    // Die Oberfläche darf die Id vorgeben, damit ein neuer Typ auf sich selbst verweisen kann.
    const id = istUuid(roh.id) && !(await this.repo.holeTyp(roh.id)) ? roh.id : randomUUID();
    const d = bereinigeTyp(eingabe);
    // Schlüssel (#145): ohne Angabe aus dem Namen, eindeutig.
    if (!d.schluessel) d.schluessel = freierSchluessel(d.name || 'mappentyp', (await this.repo.listeTypen()).map((t) => t.schluessel ?? ''));
    await this.pruefeTyp(d, id);
    const rechte = await this.berechtigungenAusEingabe({ ...d, id, erstellt: '', geaendert: '', berechtigungen: null }, eingabe);
    let typ = await this.repo.legeTypAn(id, d);
    if (rechte) { typ = await this.repo.setzeBerechtigungen(id, istOffen(rechte.rw) ? null : rechte.rw); Dienst.protokolliereBerechtigungen(typ, 0); }
    // Neue Mappentypen bekommen eine eigene Sicht (#38), außer der Administrator wählt das ab.
    if ((roh as { sichtAnlegen?: unknown }).sichtAnlegen !== false) await this.sichtFuerTyp(typ);
    return typ;
  }

  /**
   * Gleichzeitig bearbeiten (#917): Mit `stand` (`geaendert` des Typs, wie gelesen) speichert Ablago nur, wenn seitdem
   * niemand den Typ geändert hat – sonst 409, nichts wird überschrieben. Ohne `stand` keine Prüfung (wie bisher).
   */
  private async aendereTypIntern(id: string, eingabe: unknown): Promise<Mappentyp> {
    const alt = await this.repo.holeTyp(id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    const stand = liesStand((eingabe as { stand?: unknown } | null)?.stand, 'meldungen.dienst.stand-ungueltig');
    if (stand !== undefined && alt.geaendert !== stand) throw Dienst.konfigurationKonflikt('typ', alt.geaendert);
    let d = behalteDarstellung(eingabe, behalteErkennung(eingabe, behalteBeschriftungen(eingabe, bereinigeTyp(eingabe), alt), alt), alt);
    if (alt.system) d = await this.mitSystemfeldern(d, alt.system);
    // Ausblenden (#655): erst jetzt sind die Systemfelder bekannt – sie und ihre Register bleiben sichtbar.
    festigeDarstellung(d);
    // Der Schlüssel ist fest (#145); fehlt er noch, gilt der eingegebene bzw. einer aus dem Namen.
    d.schluessel = alt.schluessel ?? d.schluessel ?? freierSchluessel(d.name || 'mappentyp', (await this.repo.listeTypen()).filter((t) => t.id !== id).map((t) => t.schluessel ?? ''));
    await this.pruefeTyp(d, id);
    // Berechtigungen (#142) gegen die neuen Felder prüfen, bevor etwas gespeichert ist.
    const rechte = await this.berechtigungenAusEingabe({ ...alt, ...d }, eingabe);
    const bleiben = new Set(d.register.filter((r) => r.art === 'dokumente').map((r) => r.key));
    for (const [key, n] of await this.repo.dokumenteJeRegister(id)) {
      if (bleiben.has(key)) continue;
      const name = alt.register.find((r) => r.key === key)?.name ?? key;
      throw new Fachfehler(409, t('meldungen.dienst.im-register-liegen-noch', { anzahl: n, name }));
    }
    let typ: Mappentyp;
    try { typ = await this.repo.aendereTyp(id, d, stand); }
    catch (f) { if (f instanceof KonfigurationVeraltet) throw Dienst.konfigurationKonflikt('typ'); throw f; }
    // Die Sicht, die für diesen Typ entstanden ist, heißt weiter wie er – solange sie niemand umbenannt hat.
    const eigene = (await this.repo.listeSichten()).find((x) => x.id === id);
    if (eigene && eigene.name === alt.name && alt.name !== typ.name) await this.repo.aendereSicht(id, { ...eigene, name: typ.name });
    // Vorlage oder Felder können sich geändert haben: Titel aller Mappen dieses Typs neu berechnen.
    await this.aktualisiereTitel((await this.repo.listeMappen(id)).map((m) => m.id));
    await this.pruefePassung(id);
    // Fristen (#129): Erinnerung neu an oder aus, Vorlauf geändert → gleich abgleichen.
    await this.fristenAbgleichen({ typId: id });
    if (rechte) {
      const mit = await this.repo.setzeBerechtigungen(id, istOffen(rechte.rw) ? null : rechte.rw);
      Dienst.protokolliereBerechtigungen(mit, rechte.niemand);
      return mit;
    }
    return typ;
  }

  /**
   * Systemtypen: Systemfelder müssen bleiben und behalten ihre feste Definition;
   * Bezeichnung und Hilfetext darf der Administrator ändern. Benutzer-Mappen entstehen
   * und verschwinden nur über die Benutzerverwaltung.
   */
  private async mitSystemfeldern(d: MappentypDaten, system: Systemtyp): Promise<MappentypDaten> {
    const typen = await this.repo.listeTypen();
    const soll = systemfelder(system, typen.find((t) => t.system === 'rolle')?.id ?? '', typen.find((t) => t.system === 'benutzer')?.id ?? '');
    const fehlen = soll.filter((s) => !d.felder.some((f) => f.key === s.key));
    if (fehlen.length) throw new Fachfehler(422, t('meldungen.dienst.systemfelder-lassen-sich-nicht', { map: fehlen.map((f) => f.label).join(', ') }));
    const felder = d.felder.map((f) => {
      const s = soll.find((x) => x.key === f.key);
      // Beschriftungen je Sprache (#728) darf der Administrator wie Bezeichnung und Hilfetext setzen.
      return s ? { ...s, label: f.label || s.label, hilfe: f.hilfe || s.hilfe, ...mitSystemBeschriftung(f, s) } : f;
    });
    // Systemtypen (#937): nie aus Post anzulegen, kein „Woran man ihn erkennt“.
    const ohneErkennbar = d.beschriftungen ? Object.fromEntries(Object.entries(d.beschriftungen).map(([k, v]) => { const { erkennbarAn: _e, ...rest } = v ?? {}; return [k, rest]; })) : undefined;
    return { ...d, felder, ausPost: false, erkennbarAn: '', beschriftungen: ohneErkennbar, ...(system === 'benutzer' ? { erstellenErlaubt: false, loeschenErlaubt: false } : system === 'post' ? { erstellenErlaubt: false } : {}) };
  }

  async loescheTyp(id: string): Promise<void> {
    const eintrag = await this.repo.holeTyp(id);
    if (!eintrag) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    if (eintrag.system) throw new Fachfehler(409, t('meldungen.dienst.ist-ein-systemmappentyp-er', { name: eintrag.name }));
    const gruende: string[] = [];
    const n = await this.repo.zaehleMappen(id);
    if (n) gruende.push(t('meldungen.dienst.mappen-gehoeren-zu-diesem', { anzahl: n }));
    const imKorb = (await this.repo.papierkorb({ typId: id })).length;
    if (imKorb) gruende.push(t('meldungen.dienst.mappen-dieses-typs-liegen', { anzahl: imKorb }));
    for (const mappentyp of await this.repo.listeTypen()) {
      if (mappentyp.id === id) continue;
      for (const f of mappentyp.felder) if (f.typ === 'referenz' && f.zielTyp === id) gruende.push(t('meldungen.dienst.das-feld-verweist-auf', { name: mappentyp.name, label: f.label }));
    }
    if (gruende.length) throw new Fachfehler(409, t('meldungen.dienst.dieser-mappentyp-kann-noch'), { gruende });
    await this.repo.loescheTyp(id);
    // Aus den Sichten entfernen; Sichten, die nur diesen Typ hatten und keine Kinder, verschwinden mit.
    const alle = await this.repo.listeSichten();
    for (const x of alle.filter((v) => v.typen.includes(id))) {
      const typen = x.typen.filter((t) => t !== id);
      if (!typen.length && !kinderVon(alle, x.id).length) await this.repo.loescheSicht(x.id);
      else await this.repo.aendereSicht(x.id, { ...x, typen });
    }
  }

  listeMappen(typId?: string) { return this.repo.listeMappen(typId); }
  /** Schlank für viele Mappen (Demo-Daten, #248). */
  mappenKurz() { return this.repo.mappenKurz(); }
  feldwerte(typId: string, key: string) { return this.repo.feldwerte(typId, key); }

  /**
   * Verweisende Mappen eines Typs über ein Feld, vollständig (für die Tabelle im
   * Verknüpfungsregister, #75): höchstens 1000, nach Titel sortiert.
   */
  async verweisende(id: string, typId: string, feldKey: string, z?: Zugriff) {
    await this.pruefeRecht(z, id, 'R');
    const rv = (await this.repo.rueckverweise(id)).filter((r) => r.quelleTypId === typId && r.feldKey === feldKey);
    const sichtbar = await this.lesbare(z, rv.map((r) => r.quelleId));
    const ids = [...new Set(rv.map((r) => r.quelleId))].filter((x) => sichtbar.has(x));
    const mappen = (await this.repo.holeMappen(ids.slice(0, 1000))).sort((a, b) => (a.titel ?? '').localeCompare(b.titel ?? '', 'de'));
    const typ = await this.repo.holeTyp(typId);
    const ziele = typ ? mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)) : [];
    return { gesamt: ids.length, mappen, bezuege: await this.maskiereBezuege(z, await this.repo.bezuege(ziele)) };
  }

  async holeMappe(id: string, z?: Zugriff) {
    // Aufgaben der Mappe nur einmal lesen (#615): für die Regel „mit Aufgabe“, für die Antwort und fürs Gesehen.
    // Mappe und Aufgaben gleichzeitig (#741).
    const [mappe, aufgaben] = await Promise.all([this.repo.holeMappe(id), this.repo.aufgabenVon(id)]);
    if (!mappe) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    // Berechtigungen (#124): ohne Lesen nur die eigenen offenen Aufgaben – zum Erledigen oder Weitergeben.
    const rechte = z ? await this.rechteAn(z, mappe, false, aufgaben) : null;
    if (z && rechte && !rechte.R) {
      // #798: automatische Aufgaben nur mit Hinweis und Fälligkeit; von Hand geschriebene mit Text.
      const meine = await this.ohneLeserechtText(aufgaben.filter((x) => !x.erledigt && x.empfaengerId === z.ich.id), new Set(), z.ich.id);
      throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es-2'), { verborgen: true, aufgaben: meine });
    }
    // Mappentypen hat der Zugriff schon gelesen (#615); ein Dienstkonto kennt nur seine – dann wie bisher.
    const alleTypen = z?.typen && !z.paket ? [...z.typen.values()] : undefined;
    const typ = (alleTypen ? z!.typen.get(mappe.typId) : undefined) ?? await this.repo.holeTyp(mappe.typId);
    const ziele = typ ? verweiseVon(typ, mappe.werte).map((v) => v.zielId) : [];
    // Was nur noch von der Mappe abhängt, gleichzeitig (#741) – erst nach der Prüfung des Leserechts.
    const [alleRueck, roheBezuege, dokumente, notizen, erinnerungen, unpassend, datenschutz] = await Promise.all([
      this.repo.rueckverweise(id), this.repo.bezuege(ziele),
      this.repo.listeDokumente(id).then((d) => this.mitArchivStand(d)).then((d) => this.mitPdfSchutz(d)),
      this.repo.notizen(id), this.repo.erinnerungen({ mappeId: id }),
      this.verweiskonflikte(typ, mappe.werte, z?.ich.id ?? '', alleTypen && z?.a ? { typen: alleTypen, a: z.a } : undefined, z),
      z?.admin ? this.datenschutz() : Promise.resolve(null),
    ]);
    // Lesbar (#124, #126): verweisende und verwiesene Mappen in einem Zugriff.
    const sichtbar = await this.lesbare(z, [...alleRueck.map((r) => r.quelleId), ...roheBezuege.keys()]);
    const rueckverweise = alleRueck.filter((r) => sichtbar.has(r.quelleId));
    const p = await this.loeschPruefung(mappe, typ, alleRueck, alleTypen);
    // Verweisende Mappen, die man nicht sehen darf: nur ihre Anzahl (#126).
    const fremd = p.fremd.map((r) => (sichtbar.has(r.quelleId) ? r : { ...r, titel: NICHT_SICHTBAR, verborgen: true }));
    return {
      mappe,
      rueckverweise,
      /** Wirksame Rechte des Benutzers an dieser Mappe (#126). */
      rechte: rechte ?? { C: true, R: true, U: true, D: true, P: true },
      /** Ob „Mappe löschen“ geht, sonst warum nicht (#79). */
      loeschbar: p.ok ? { ok: true } : { ok: false, grund: p.grund, rueckverweise: fremd },
      dokumente,
      /** Notizen an der Mappe (#55). */
      notizen,
      /** Aufgaben an der Mappe, offene zuerst (#54). */
      aufgaben,
      /** Noch nicht fällige Erinnerungen (#131). */
      erinnerungen,
      /** Titel und Typ der Mappen, auf die diese verweist (nicht lesbare ohne Titel). */
      bezuege: maskiert(roheBezuege, sichtbar),
      /** Verweise, die nicht (mehr) zum Auswahlfilter oder zu einem Feld passen, das aus ihnen folgt (#172, #886). */
      unpassend: unpassend.unpassend,
      /** Dasselbe je Verweisfeld mit den eigenen Feldern, mit denen es nicht zusammenpasst (#887). */
      konflikte: unpassend.konflikte,
      /** Archivmodus (#212): aufbewahren bis (JJJJ-12-31) oder null. */
      aufbewahrenBis: aufbewahrenBis(typ?.archiv, mappe),
      /** Auskunft nach Art. 15 DSGVO (#396): Administratoren, Mappentyp „betrifft eine Person“. */
      ...(z?.admin && datenschutz?.typen[mappe.typId]?.person ? { auskunft: true } : {}),
    };
  }

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

  /** Persönlich: ändert weder „zuletzt geändert“ noch das Protokoll der Mappe. */
  async setzeFavorit(ich: { id: string }, mappeId: string, an: boolean) {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const schon = an && (await this.repo.favoritenVon(ich.id, [mappeId])).has(mappeId);
    await this.repo.setzeFavorit(ich.id, mappeId, an);
    if (an && !schon) await this.ereignis('favorit.neu', { benutzer: ich.id, mappe: mappeId, typ: m.typId }, ich.id);
    return { favorit: an };
  }

  async istFavorit(ich: { id: string }, mappeId: string) { return (await this.repo.favoritenVon(ich.id, [mappeId])).has(mappeId); }

  /* ---------- Berechtigungen (#123–#127) ---------- */

  /**
   * Wer greift zu, und was darf er lesen? Für Administratoren gelten die Regeln nicht (#128):
   * lesen = null (alles). Wird je Anfrage einmal gebildet.
   */
  async zugriff(ich: { id: string; rolle: string; art?: 'dienst' | 'system'; paketId?: string; systemkonto?: string }): Promise<Zugriff> {
    // Einmal je Anfrage (#741), nie über die Anfrage hinaus; nach einer Änderung in der Anfrage und in einer
    // Transaktion (sie sieht ihre eigenen Änderungen) neu.
    if (transaktionen.getStore()?.dienst === this) return rechteMessen(() => this.bildeZugriff(ich));
    return jeAnfrage(`${this.kennung}|zugriff|${ich.id}|${ich.rolle}|${ich.art ?? ''}|${ich.paketId ?? ''}|${ich.systemkonto ?? ''}`, () => rechteMessen(() => this.bildeZugriff(ich)));
  }
  /** Unterscheidet zwei Dienste in derselben Anfrage (Tests mit zwei „Prozessen“). */
  private readonly kennung = randomUUID();

  private async bildeZugriff(ich: { id: string; rolle: string; art?: 'dienst' | 'system'; paketId?: string; systemkonto?: string }, o: { ohneAufZeit?: boolean } = {}): Promise<Zugriff> {
    const a = await this.aufloesung(ich.id);
    const typen = await this.repo.listeTypen();
    const admin = ich.rolle === 'admin' && !ich.art;
    if (ich.art) {
      // Konten, die kein Mensch sind (#673): ihre Rolle (Systemkonto bzw. Paket) statt der Rollen aus einer Benutzer-Mappe.
      const rolleId = (await this.sichereSystem()).kontorollen.get(ich.art === 'system' ? 'systemkonto' : 'paket')!;
      const wer: Wer = { id: ich.id, rollen: [rolleId] };
      if (ich.art === 'dienst') return this.paketZugriff(ich, a, wer, typen, rolleId);
      const eigene = typen.map((t) => kontoRegelwerk(t, rolleId));
      return { ich: { id: ich.id, rolle: 'mitglied' }, admin: false, wer, a, typen: new Map(eigene.map((t) => [t.id, t])), lesen: lesefilter(eigene, wer, a), systemkonto: ich.systemkonto ?? 'system' };
    }
    const wer: Wer = { id: ich.id, rollen: a.meineRollen };
    const lesen = admin ? null : lesefilter(typen, wer, a);
    // Leserecht auf Zeit (#798): nur für Menschen ohne Admin-Rechte, nur wenn die Regeln nicht ohnehin alles erlauben.
    const aufZeit = admin || !lesen || o.ohneAufZeit ? [] : await this.repo.leserechteAufZeit(ich.id);
    return {
      ich, admin, wer, a, typen: new Map(typen.map((t) => [t.id, t])), lesen: mitAufZeit(lesen, typen, aufZeit),
      ...(aufZeit.length ? { aufZeit: new Map(aufZeit.map((x) => [x.mappeId, { fallId: x.fallId, aufgabeId: x.aufgabeId, aufgabentext: x.aufgabentext, seit: x.seit, von: x.von }])) } : {}),
    };
  }

  /** Zugriff eines Dienstkontos (#338): nur die Typen und Rechte, die bei der Installation bestätigt wurden. */
  private async paketZugriff(ich: { id: string; rolle: string; paketId?: string }, a: Aufloesung, wer: Wer, typen: Mappentyp[], rolleId: string): Promise<Zugriff> {
    const pakete = await this.repo.listePakete();
    const p = pakete.find((x) => x.id === ich.paketId);
    const r = p?.laeufer?.rechte ?? { lesen: [], schreiben: [], dokumente: 'keine' as const };
    const aufloesen = await this.typverweise(p?.id ?? '', pakete, typen);
    // „Pakete“ am Mappentyp (#686): Der Admin kann einem Paket einzelne Mappentypen verwehren – dann sieht es sie gar nicht.
    const verwehrt = await this.paketVerwehrt();
    const lesbar = aufloesen(r.lesen);
    // KI-Dienste (#796): Ein KI-Paket sieht nur Mappentypen, die für KI-Dienste zugelassen sind – sonst gar nicht.
    const kiGesperrt = await this.kiSperre(p);
    const sichtbar = typen.filter((t) => lesbar.has(t.id) && !(p && verwehrt[t.id]?.includes(p.id)) && !kiGesperrt(t.id));
    // Regeln für die Rolle „Paket“ (#673) schränken die bestätigten Rechte weiter ein; ohne solche Regeln wie bisher.
    const mitRegeln = sichtbar.filter((t) => hatKontoRegeln(t, rolleId)).map((t) => kontoRegelwerk(t, rolleId));
    // Nie null („alles lesbar“): lesefilter() liefert null, wenn alle übergebenen Typen offen sind – hier sind das nur
    // die für das Paket sichtbaren. null hieße für Repo und lesbare() aber „alle Mappen aller Typen“.
    const offen = { offen: sichtbar.map((t) => t.id), je: [] };
    const lesen = mitRegeln.length ? lesefilter(sichtbar.map((t) => mitRegeln.find((x) => x.id === t.id) ?? kontoRegelwerk(t, rolleId)), wer, a) ?? offen : offen;
    return {
      ich: { id: ich.id, rolle: 'mitglied' }, admin: false, wer, a, typen: new Map(sichtbar.map((t) => [t.id, t])),
      lesen,
      paket: { id: p?.id ?? '', schreiben: aufloesen(r.schreiben), dokumente: r.dokumente, schnittstellen: r.schnittstellen ?? [], ...(mitRegeln.length ? { regeln: new Map(mitRegeln.map((t) => [t.id, t])) } : {}) },
    };
  }

  /**
   * Verweise auf Mappentypen aus einem Paket-Manifest (`code.rechte`, `code.mappentypen`) → Typ-Ids: eigener Schlüssel
   * ohne Präfix, `paket:typ`, `dms:ablageort|rolle|post` oder `*` (alle außer Benutzer). Unbekanntes fällt still weg.
   */
  private async typverweise(paketId: string, pakete: InstalliertesPaket[], typen: Mappentyp[]): Promise<(liste: string[]) => Set<string>> {
    const dms = await this.sichereSystem();
    const ablageort = await this.ablageortId();
    return (liste) => {
      const ids = new Set<string>();
      for (const vw of liste) {
        if (vw === ALLE_TYPEN) { for (const t of typen) if (t.system !== 'benutzer') ids.add(t.id); continue; }
        const [pk, sl] = vw.includes(':') ? vw.split(':') : [paketId, vw];
        // dms:benutzer lehnt liesCode ab; hier trotzdem nie auflösen (Pakete sehen keine Benutzer). dms:post seit #435.
        const id = pk === 'dms' ? (sl === 'ablageort' ? ablageort : sl === 'rolle' ? dms.rolle.id : sl === 'post' ? dms.post.id : null)
          : pakete.find((x) => x.id === pk)?.typen[sl];
        if (id) ids.add(id);
      }
      return ids;
    };
  }

  /* ---------- Pakete am Mappentyp (#686) ---------- */

  /**
   * Darf der Benutzer dieses Pakets die Mappe (bzw. Mappen dieses Typs, wenn es sie nicht mehr gibt) lesen? null = ja,
   * sonst der Grund fürs Protokoll. Wird je Zustellung neu gebildet – Rechteänderungen wirken sofort.
   */
  private async paketSiehtNicht(p: InstalliertesPaket, typId: string, mappeId: string | null): Promise<string | null> {
    const konto = (await this.konten?.dienstkonten?.())?.find((b) => b.paketId === p.id);
    const z = await this.zugriff({ id: konto?.id ?? `paket:${p.id}`, rolle: 'mitglied', art: 'dienst', paketId: p.id });
    if (!z.typen.has(typId)) return (await this.paketVerwehrt())[typId]?.includes(p.id) ? t('meldungen.dienst.mappentyp-fuer-dieses-paket') : (await this.kiSperre(p))(typId) ? t('meldungen.dienst.ki-nicht-zugelassen') : t('meldungen.dienst.kein-leserecht-am-mappentyp');
    const m = mappeId ? await this.repo.holeMappe(mappeId) : null;
    if (m && !(await this.rechteAn(z, m)).R) return t('meldungen.dienst.kein-leserecht-an-dieser');
    return null;
  }

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

  /** Je Mappentyp-Id die Pakete, denen der Admin diesen Typ verwehrt hat (Einstellung, Teil der Sicherung). */
  async paketVerwehrt(): Promise<Record<string, string[]>> {
    const v = await this.einstellungen?.lies('paket_verwehrt');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => Array.isArray(x)).map(([k, x]) => [k, (x as unknown[]).map(String)]));
  }

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

  /**
   * Pakete mit Code, die Mappen dieses Typs lesen dürften (bestätigte Rechte), samt ob sie Ereignisse dazu abonniert
   * haben und ob der Admin ihnen den Typ verwehrt hat – für den Abschnitt „Pakete“ im Mappentyp-Editor.
   */
  async paketeAmTyp(typId: string): Promise<Array<{ id: string; name: string; ereignisse: boolean; schreiben: boolean; verwehrt: boolean }>> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    if (typ.system === 'benutzer') return [];
    const [pakete, typen, verwehrt] = [await this.repo.listePakete(), await this.repo.listeTypen(), await this.paketVerwehrt()];
    const erg: Array<{ id: string; name: string; ereignisse: boolean; schreiben: boolean; verwehrt: boolean }> = [];
    for (const p of pakete) {
      const l = p.laeufer;
      if (!l) continue;
      const auf = await this.typverweise(p.id, pakete, typen);
      if (!auf(l.rechte.lesen).has(typId)) continue;
      erg.push({
        id: p.id, name: p.name, schreiben: auf(l.rechte.schreiben).has(typId), verwehrt: !!verwehrt[typId]?.includes(p.id),
        ereignisse: l.ereignisse.some((e) => MAPPEN_EREIGNISSE.includes(e)) && auf(l.mappentypen ?? []).has(typId),
      });
    }
    return erg.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  /** Einem Paket einen Mappentyp verwehren bzw. wieder erlauben; wirkt sofort (Lesen, Schreiben, Ereignisse). */
  async setzePaketVerwehrt(typId: string, paketId: string, verwehrt: boolean, von: string | null): Promise<void> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const am = await this.paketeAmTyp(typId);
    const p = am.find((x) => x.id === paketId);
    if (!p) throw new Fachfehler(404, t('meldungen.dienst.dieses-paket-darf-mappen'));
    const alle = await this.paketVerwehrt();
    const liste = new Set(alle[typId] ?? []);
    if (verwehrt) liste.add(paketId); else liste.delete(paketId);
    if (liste.size) alle[typId] = [...liste].sort(); else delete alle[typId];
    await this.einstellungen.schreibe('paket_verwehrt', Object.keys(alle).length ? alle : null);
    const typ = await this.repo.holeTyp(typId);
    protokoll.modul('werkbank').info(verwehrt ? 'Paket den Mappentyp verwehrt' : 'Paket den Mappentyp wieder erlaubt', { paket: paketId, typ: typ?.name ?? typId, von });
  }

  /** Wirksame Rechte an einer Mappe (Administrator: alles im Rahmen der Haken am Mappentyp). */
  /**
   * `aufgaben`: alle Aufgaben dieser Mappe, wenn sie schon gelesen sind (#615, „Mappe öffnen“) – dann fragt die
   * Regel „mit Aufgabe“ nicht noch einmal nach.
   */
  async rechteAn(z: Zugriff, m: Mappe, neu = false, aufgaben?: Aufgabe[]): Promise<Rechte> {
    return rechteMessen(() => this.rechteAnEine(z, m, neu, aufgaben));
  }

  private async rechteAnEine(z: Zugriff, m: Mappe, neu: boolean, aufgaben?: Aufgabe[]): Promise<Rechte> {
    const typ = z.typen.get(m.typId);
    if (!typ) return { ...NICHTS };
    if (z.admin) return wirksamVon(ALLES, typ);
    // Dienstkonto (#338): lesen, was bestätigt ist; anlegen/bearbeiten nur die Typen unter „schreiben“; nie löschen, nie Passwörter.
    if (z.paket) {
      const w = wirksamVon(ALLES, typ); const s = z.paket.schreiben.has(typ.id);
      const bestaetigt = { C: w.C && s, R: w.R, U: w.U && s, D: false, P: false };
      const regeln = z.paket.regeln?.get(typ.id);
      if (!regeln) return bestaetigt;
      // Regeln für die Rolle „Paket“ (#673): nur einschränken, nie über die bestätigten Rechte hinaus.
      const quelle = aufgaben && !neu ? quelleAus(z.wer.id, aufgaben.filter((x) => x.mappeId === m.id)) : await this.mappenquelle(z.wer.id, neu ? [] : [m.id]);
      const r = rechteAnMappe(regeln, m, z.wer, z.a, quelle, neu).wirksam;
      return { C: bestaetigt.C && r.C, R: bestaetigt.R && r.R, U: bestaetigt.U && r.U, D: false, P: false };
    }
    const quelle = aufgaben && !neu ? quelleAus(z.wer.id, aufgaben.filter((x) => x.mappeId === m.id)) : await this.mappenquelle(z.wer.id, neu ? [] : [m.id]);
    const r = rechteAnMappe(typ, m, z.wer, z.a, quelle, neu).wirksam;
    // Leserecht auf Zeit (#798): nur Lesen – Bearbeiten, Löschen und Passwörter bleiben, wie die Regeln sagen (ohne Lesen: nein).
    if (!r.R && !neu && z.aufZeit?.has(m.id)) return { ...r, R: true };
    // Systemkonto (#673): Passwörter sieht es nie (Platzhalter in Automatisierungen würden sie sonst hinaustragen).
    return z.systemkonto ? { ...r, P: false } : r;
  }

  /** Wie `rechteAn` für viele Mappen mit einem Zugriff (#367). */
  async rechteAnVielen(z: Zugriff, ms: Mappe[]): Promise<Map<string, Rechte>> {
    return rechteMessen(() => this.rechteAnMehreren(z, ms));
  }

  private async rechteAnMehreren(z: Zugriff, ms: Mappe[]): Promise<Map<string, Rechte>> {
    const r = new Map<string, Rechte>();
    if (z.admin) { for (const m of ms) { const typ = z.typen.get(m.typId); r.set(m.id, typ ? wirksamVon(ALLES, typ) : { ...NICHTS }); } return r; }
    // Dienstkonto (#338): wie in rechteAn, ohne Regeln.
    if (z.paket) { for (const m of ms) r.set(m.id, await this.rechteAnEine(z, m, false)); return r; }
    const quelle = await this.mappenquelle(z.wer.id, ms.map((m) => m.id));
    for (const m of ms) {
      const typ = z.typen.get(m.typId);
      const x = typ ? rechteAnMappe(typ, m, z.wer, z.a, quelle, false).wirksam : { ...NICHTS };
      // Leserecht auf Zeit (#798): wie in rechteAn.
      const y = !x.R && typ && z.aufZeit?.has(m.id) ? { ...x, R: true } : x;
      r.set(m.id, z.systemkonto ? { ...y, P: false } : y);
    }
    return r;
  }

  /** Für die Auswertung im Arbeitsspeicher: nur Aufgaben werden nachgeschlagen. */
  private async mappenquelle(benutzerId: string, mappeIds: string[]): Promise<Mappenquelle> {
    return quelleAus(benutzerId, mappeIds.length ? await this.repo.offeneAufgaben({ benutzerId, mappeIds }) : []);
  }

  /** Mappe holen und ein Recht verlangen. Ohne Lesen: 404 (wer nichts sehen darf, erfährt nicht, dass es sie gibt). */
  async pruefeRecht(z: Zugriff | undefined, id: string, recht: Recht): Promise<Mappe> {
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    if (!z) return m;
    const r = await this.rechteAn(z, m);
    if (!r.R) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es-2'), { verborgen: true });
    if (!r[recht]) throw new Fachfehler(403, VERBOTEN[recht]);
    return m;
  }

  /** Welche dieser Mappen darf der Benutzer lesen? */
  async lesbare(z: Zugriff | undefined, ids: string[]): Promise<Set<string>> {
    if (!z || !z.lesen) return new Set(ids);
    return rechteMessen(() => this.repo.lesbare(ids, z.lesen!));
  }

  /** Titel nicht lesbarer Mappen ausblenden (#124). */
  private async maskiereBezuege(z: Zugriff | undefined, b: Map<string, MappenBezug>): Promise<Record<string, MappenBezug>> {
    return maskiert(b, await this.lesbare(z, [...b.keys()]));
  }

  /** Welche dieser Mappen sieht ein (anderer) Benutzer? Unbekannte Benutzer (System): alle. */
  async sichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    if (!b) return new Set(ids);
    return this.lesbare(await this.zugriff(b), ids);
  }

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
      const rolleId = (await this.sichereSystem()).kontorollen.get(konto)!;
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

  /** „Was sieht Benutzer X?“ (#125): je Mappentyp gesamt und lesbar, dazu einige Titel. */
  async wasSieht(benutzerId: unknown) {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    if (!b) throw new Fachfehler(404, t('meldungen.dienst.diesen-benutzer-gibt-es'));
    const z = await this.zugriff(b);
    const erg: Array<{ typId: string; name: string; gesamt: number; lesbar: number; beispiele: Array<{ id: string; titel: string }> }> = [];
    for (const t of [...z.typen.values()].sort((x, y) => x.name.localeCompare(y.name, 'de'))) {
      const gesamt = await this.repo.zaehleMappen(t.id);
      const lesbar = !z.lesen || z.lesen.offen.includes(t.id) ? gesamt : await this.repo.zaehleAusdruck(t.id, z.lesen.je.find((x) => x.typId === t.id)?.ausdruck ?? FALSCH);
      const seite: { mappen: Mappe[] } = lesbar ? await this.repo.seite({ typId: t.id, von: 0, anzahl: 10, lesen: z.lesen }) : { mappen: [] };
      erg.push({ typId: t.id, name: t.name, gesamt, lesbar, beispiele: seite.mappen.map((m) => ({ id: m.id, titel: m.titel ?? '' })) });
    }
    return { admin: z.admin, typen: erg };
  }

  /** Zu welcher Mappe gehört ein Dokument, eine Notiz, eine Aufgabe? (für die Prüfung der Rechte) */
  async mappeVon(art: 'dokument' | 'notiz' | 'aufgabe', id: string): Promise<string> {
    const x = !istUuid(id) ? undefined : art === 'dokument' ? await this.repo.holeDokument(id) : art === 'notiz' ? await this.repo.holeNotiz(id) : await this.repo.holeAufgabe(id);
    if (!x) throw new Fachfehler(404, art === 'dokument' ? t('meldungen.dienst.dieses-dokument-gibt-es') : art === 'notiz' ? t('meldungen.dienst.diese-notiz-gibt-es') : t('meldungen.dienst.diese-aufgabe-gibt-es'));
    return x.mappeId;
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

  /** Klartext von Passwortfeldern nur dort, wo P gilt (#124). */
  async mitPasswortRecht<T extends Mappe>(z: Zugriff, mappen: T[]): Promise<{ mit: T[]; ohne: T[] }> {
    const mit: T[] = []; const ohne: T[] = [];
    // Gebündelt (#477): eine Abfrage für alle Mappen statt einer je Mappe.
    const r = await this.rechteAnVielen(z, mappen);
    for (const m of mappen) (r.get(m.id)?.P ? mit : ohne).push(m);
    return { mit, ohne };
  }

  /** Darf ein anderer Benutzer diese Mappe lesen? (Warnungen bei Aufgaben und Erwähnungen, #127) */
  async kannLesen(benutzerId: string, mappeId: string): Promise<boolean> {
    return (await this.sichtbarFuer(benutzerId, [mappeId])).has(mappeId);
  }

  /** Dynamische Werte für den angemeldeten Benutzer: heute, er selbst, seine Rollen. */
  private async aufloesung(benutzerId: string): Promise<Aufloesung> {
    const bilde = async (): Promise<Aufloesung> => {
      const m = istUuid(benutzerId) ? await this.repo.holeMappe(benutzerId) : undefined;
      return { heute: heuteIn(), ich: benutzerId, meineRollen: m ? alsListe(m.werte.rollen) : [] };
    };
    // Rollen einmal je Anfrage (#741) wie der Zugriff; jeder Aufrufer bekommt eine eigene Kopie.
    if (transaktionen.getStore()?.dienst === this) return bilde();
    const a = await jeAnfrage(`${this.kennung}|rollen|${benutzerId}`, bilde);
    return { ...a, meineRollen: [...a.meineRollen] };
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

  /** Prüft alle Mappen eines Typs (nach einer Änderung des Typs) und speichert das Ergebnis. */
  async pruefePassung(typId: string): Promise<number> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) return 0;
    const mappen = await this.repo.listeMappen(typId);
    const typVon = await this.repo.typenVon(mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)).filter(istUuid));
    // Eindeutige Felder: gleiche Werte im Arbeitsspeicher suchen statt je Mappe in der Datenbank.
    const gleiche = new Map<string, Map<string, Mappe[]>>();
    for (const f of typ.felder) {
      if (!f.eindeutig || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
      const nachWert = new Map<string, Mappe[]>();
      for (const m of mappen) {
        if (istLeer(m.werte[f.key])) continue;
        const w = String(m.werte[f.key]).trim().toLowerCase();
        nachWert.set(w, [...(nachWert.get(w) ?? []), m]);
      }
      gleiche.set(f.key, nachWert);
    }
    const ergebnis = mappen.map((m) => {
      const p = pruefeMappe(typ, m.werte, {
        typVon: (id) => typVon.get(id),
        doppelt: (k, v) => {
          const andere = gleiche.get(k)?.get(String(v).trim().toLowerCase())?.find((x) => x.id !== m.id);
          return andere ? andere.titel || t('meldungen.dienst.ohne-titel') : undefined;
        },
      });
      return { id: m.id, problem: ersterGrund(typ, p), alt: m.problem ?? null, passtAlt: m.passt };
    });
    const geaendert = ergebnis.filter((e) => e.problem !== e.alt || e.passtAlt === undefined).map(({ id, problem }) => ({ id, problem }));
    await this.repo.setzePassung(geaendert);
    // Passt eine Mappe nicht, hat ihr Ersteller eine Aufgabe (#54); passt sie wieder, ist sie erledigt.
    await this.passungsAufgaben(geaendert);
    return ergebnis.filter((e) => e.problem).length;
  }

  /**
   * Nach dem Speichern einer Mappe: Andere Mappen desselben Typs, die bisher nicht passten,
   * können jetzt passen (z. B. weil ein doppelter Wert geändert wurde). Das sind meist wenige.
   */
  private async pruefeUnpassende(typ: Mappentyp) {
    const ids = await this.repo.unpassende(typ.id);
    if (ids.length) await this.passungFuer(typ, ids);
  }

  /** Prüft einzelne Mappen eines Typs gegen seine Definition und speichert das Ergebnis. */
  private async passungFuer(typ: Mappentyp, ids: string[]) {
    const liste: Array<{ id: string; problem: string | null }> = [];
    const mappen = await this.repo.holeMappen(ids);
    // In einem Zug statt je Mappe (#743): Typen der Verweisziele und „Bereits vergeben“ über den Index.
    const typen = await this.repo.typenVon([...new Set(mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)))].filter(istUuid));
    const eindeutig = typ.felder.filter((f) => f.eindeutig && (f.typ === 'text' || f.typ === 'zahl'));
    const funde = await this.repo.findeDoppelte(typ.id, mappen.flatMap((m) => eindeutig.filter((f) => !istLeer(m.werte[f.key])).map((f) => ({ mappeId: m.id, feldKey: f.key, wert: String(m.werte[f.key]) }))));
    for (const m of mappen) {
      const doppelt = (k: string) => { const d = funde.get(`${m.id}|${k}`); return d ? d.titel || t('meldungen.dienst.ohne-titel') : undefined; };
      const problem = ersterGrund(typ, pruefeMappe(typ, m.werte, { typVon: (id) => typen.get(id), doppelt }));
      if (problem !== m.problem) liste.push({ id: m.id, problem });
    }
    await this.repo.setzePassung(liste);
    await this.passungsAufgaben(liste);
  }

  /** Beim Start: Passung für Typen nachholen, deren Mappen noch nie geprüft wurden. */
  async passungNachziehen(fortschritt: (fertig: number, gesamt: number) => void = () => {}): Promise<number> {
    const typen = await this.repo.typenOhnePassung();
    // Fortschritt für die Startseite (#802).
    for (const [i, t] of typen.entries()) { fortschritt(i, typen.length); await this.pruefePassung(t); }
    return typen.length;
  }

  private async titel(m: Mappe): Promise<string> {
    return m.titel || titelAus(await this.repo.holeTyp(m.typId), m.werte, undefined, m) || t('meldungen.dienst.ohne-titel');
  }

  /* ---------- Titel ---------- */

  /**
   * Berechnet die gespeicherten Titel der angegebenen Mappen neu. Ändert sich ein Titel,
   * werden die Mappen nachgezogen, die auf sie verweisen (deren Titel kann ihn enthalten).
   * Bei Verweisen im Kreis endet das nach einigen Runden.
   */
  async aktualisiereTitel(ids: string[]): Promise<Map<string, string>> {
    const neu = new Map<string, string>();
    if (!ids.length) return neu;
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    let offen = [...new Set(ids)];
    for (let runde = 0; offen.length && runde < 6; runde++) {
      const geaendert: Array<{ id: string; titel: string }> = [];
      for (let i = 0; i < offen.length; i += 2000) {
        const mappen = await this.repo.holeMappen(offen.slice(i, i + 2000));
        const ziele = mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
        const gespeichert = await this.repo.titelVon(ziele.filter((z) => !neu.has(z)));
        const titelVon = (z: string) => neu.get(z) || gespeichert.get(z) || t('meldungen.dienst.ohne-titel');
        for (const m of mappen) {
          const t = titelAus(typen.get(m.typId), m.werte, titelVon, m);
          neu.set(m.id, t);
          if (t !== m.titel) geaendert.push({ id: m.id, titel: t });
        }
      }
      await this.repo.setzeTitel(geaendert);
      offen = geaendert.length ? await this.repo.quellenVon(geaendert.map((g) => g.id)) : [];
    }
    return neu;
  }

  /** Beim Start: Titel berechnen, die noch fehlen (z. B. nach dem Update auf eine Version mit gespeicherten Titeln). */
  /**
   * Die Haken „Neue Mappen erlauben“ und „Löschen erlauben“ in die Berechtigungen überführen (#146),
   * ohne dass Benutzer danach mehr dürfen: Standard C bzw. D ✗, Regeln verlieren genau dieses ✓.
   */
  async hakenUeberfuehren(): Promise<number> {
    let n = 0;
    for (const t of await this.repo.listeTypen()) {
      if (t.system || (t.erstellenErlaubt !== false && t.loeschenErlaubt !== false)) continue;
      const rw = structuredClone(regelwerkVon(t));
      const ohneC = t.erstellenErlaubt === false; const ohneD = t.loeschenErlaubt === false;
      if (ohneC) rw.grund.C = false;
      if (ohneD) rw.grund.D = false;
      const geaendert: string[] = [];
      for (const r of rw.regeln) {
        if (ohneC && r.dann.C === 'erteilen') { delete r.dann.C; geaendert.push(`${r.name}: ohne +C`); }
        if (ohneD && r.dann.D === 'erteilen') { delete r.dann.D; geaendert.push(`${r.name}: ohne +D`); }
      }
      // Regeln, die danach nichts mehr tun, fallen weg.
      const weg = rw.regeln.filter((r) => !RECHTE_LISTE.some((k) => r.dann[k]) && !r.stopp).map((r) => r.name);
      rw.regeln = rw.regeln.filter((r) => RECHTE_LISTE.some((k) => r.dann[k]) || r.stopp);
      await this.repo.aendereTyp(t.id, { ...t, erstellenErlaubt: true, loeschenErlaubt: true });
      await this.repo.setzeBerechtigungen(t.id, istOffen(rw) ? null : rw);
      protokoll.modul('werkbank').warn('Haken „Neue Mappen/Löschen erlauben“ in die Berechtigungen übernommen', {
        typ: t.name, standard: kurzStandard(rw.grund), ...(geaendert.length ? { regeln: geaendert.join(' · ') } : {}), ...(weg.length ? { entfallen: weg.join(', ') } : {}),
      });
      n++;
    }
    return n;
  }

  /** Schlüssel für Mappentypen ohne (nach dem Update auf 0.31, #145): Systemtypen zuerst, dann aus dem Namen. */
  async typSchluesselNachziehen(): Promise<number> {
    const typen = await this.repo.listeTypen();
    const vergeben = new Set(typen.map((t) => t.schluessel ?? '').filter(Boolean));
    let n = 0;
    for (const t of typen.filter((x) => !x.schluessel).sort((a, b) => Number(!a.system) - Number(!b.system))) {
      const k = freierSchluessel(t.system ?? t.name, vergeben);
      vergeben.add(k);
      await this.repo.setzeTypSchluessel(t.id, k);
      n++;
    }
    if (n) protokoll.modul('werkbank').info('Kennungen für Mappentypen vergeben', { anzahl: n });
    return n;
  }

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

  /* ---------- Pakete (#188): Ablage der installierten Pakete; die Logik steckt in pakete.ts ---------- */

  listePakete() { return this.repo.listePakete(); }
  /** Einstellungen für Bausteine neben dem Dienst (#712: Automatisierungen merken, welche Fristen übernommen sind). */
  get einstellungenSpeicher(): Einstellungen | undefined { return this.einstellungen; }
  speicherePaketCode(id: string, dateien: Array<{ name: string; inhalt: Buffer }>) { return this.repo.speicherePaketCode(id, dateien); }
  paketCode(id: string) { return this.repo.paketCode(id); }
  loeschePaketCode(id: string) { return this.repo.loeschePaketCode(id); }
  /** Sprachpakete (#731): Texte und Beschriftungen. */
  speichereSprachpaket(id: string, d: import('./repo').SprachpaketDaten) { return this.repo.speichereSprachpaket(id, d); }
  sprachpakete() { return this.repo.sprachpakete(); }
  loescheSprachpaket(id: string) { return this.repo.loescheSprachpaket(id); }
  loescheEreignisse(id: string) { return this.repo.loescheEreignisse(id); }
  /** Ereignisse für Pakete (#338). */
  faelligeEreignisse(n: number) { return this.repo.faelligeEreignisse(n); }
  ereignisZugestellt(id: string) { return this.repo.ereignisZugestellt(id); }
  ereignisDaten(id: string, daten: Record<string, unknown>) { return this.repo.ereignisDaten(id, daten); }
  ereignisFehlgeschlagen(id: string, fehler: string, naechster: Date | null) { return this.repo.ereignisFehlgeschlagen(id, fehler, naechster); }
  ereignisStand() { return this.repo.ereignisStand(); }
  /** Wird beim Anlegen eines Ereignisses aufgerufen (der Läufer stellt dann gleich zu). */
  ereignisWecker: (() => void) | null = null;
  /** Dienstkonten der Pakete (Benutzer-Id → Paket-Id), vom Paket-Läufer gepflegt. */
  paketKonten = new Map<string, string>();

  /* ---------- Ereigniskatalog (#670) ---------- */

  /** Verteiler des Katalogs; Abnehmer (Pakete hier, Automatisierungen #674, Webhooks #671) melden sich mit `abonniere` an. */
  readonly ereignisse = new Ereignisverteiler({ repo: () => this.grundRepo, ruht: () => this.ereignisseRuhen?.() ?? false });
  /** Wartung, Wiederherstellung (vom Start gesetzt): dann verteilt der Katalog nichts. */
  ereignisseRuhen?: () => boolean | Promise<boolean>;
  /** Startseite „Zuletzt geöffnet“ (#940): Anlegen und Ändern durch eine Person (vom Start gesetzt: Konten merken es). */
  beiEigenerAenderung?: (benutzerId: string, mappeId: string) => Promise<void>;

  /** `f` im Namen eines bestimmten Auslösers ausführen (#674: eine Automatisierung handelt; Ketten zählen mit). */
  mitAusloeser<T>(a: EreignisAusloeser, f: () => Promise<T>): Promise<T> { return ereignisKontext.run({ ...ereignisKontext.getStore(), ausloeser: a }, f); }
  /** `f` ohne Ereignisse ausführen (Import, Beispiel-Mappen, Wiederherstellung – „lösen nichts aus“). */
  ohneEreignisse<T>(f: () => Promise<T>): Promise<T> { return ereignisKontext.run({ ...ereignisKontext.getStore(), still: true }, f); }
  /** Wer gerade handelt – aus dem Kontext oder aus dem Konto `von`. */
  private ausloeser(von: string | null | undefined): EreignisAusloeser {
    const k = ereignisKontext.getStore()?.ausloeser;
    if (k) return k;
    if (!von) return { art: 'system', id: null, konto: null };
    const paket = this.paketKonten.get(von);
    return paket ? { art: 'paket', id: paket, konto: von } : { art: 'benutzer', id: von, konto: von };
  }

  /**
   * Ein Ereignis des Katalogs (#670) in den Ausgangskorb – in der Transaktion der Änderung, sofern es eine gibt
   * (dann scheitert beides zusammen), sonst gleich danach; Fehler außerhalb einer Transaktion landen nur im Protokoll.
   * Nur Ids, Typ, Feldschlüssel und Datum. Demo-Mappen und alles in `ohneEreignisse` lösen nichts aus.
   */
  async ereignis(art: KatalogArt, daten: Record<string, unknown>, von?: string | null): Promise<void> {
    const k = EREIGNISKATALOG[art] as Katalogeintrag;
    // Still (Demo, Beispiele, Import): nur was Pakete an Dateien verarbeiten (Volltext, Vektoren) – wie vor #724.
    const still = !!ereignisKontext.getStore()?.still;
    if (still && (!k.paket || k.mappentyp)) return;
    const inTx = transaktionen.getStore()?.dienst === this;
    const ausloeser = this.ausloeser(von);
    const mappe = typeof daten.mappe === 'string' ? daten.mappe : null;
    // „Zuletzt geöffnet“ (#940): Was eine Person selbst anlegt oder ändert, zählt wie geöffnet – nach der Antwort.
    const merken = this.beiEigenerAenderung;
    if (merken && mappe && !still && ausloeser.art === 'benutzer' && ausloeser.id && ZULETZT_ARTEN.has(art)) {
      const benutzerId = ausloeser.id;
      await this.nachDerAntwort(() => merken(benutzerId, mappe).catch((e) => protokoll.modul('ereignisse').warn('„Zuletzt geöffnet“ nicht gemerkt', { fehler: (e as Error).message })));
    }
    try {
      await this.repo.legeKatalogEreignisAn({
        id: randomUUID(), art, daten, ausloeser: { ...ausloeser, ...(still ? { still: true } : {}) },
        ...(k.buendelS && mappe ? { buendel: `${art}|${mappe}`, buendelS: k.buendelS } : {}),
      }, k.buendelS ? (alt) => mischeFelder(alt, daten) : undefined);
      // #928: Der Verteiler (Automatisierungen, Pakete, Webhooks) teilte sich sonst Datenbank und Rechenzeit mit der
      // Anfrage, die das Ereignis auslöst; das Ereignis steht schon im Ausgangskorb.
      if (this.inAnfrage()) void this.nachDerAntwort(this.weckeVerteiler);
      else this.danach(() => this.ereignisse.wecke());
    } catch (e) {
      if (inTx) throw e;
      protokoll.modul('ereignisse').error('Ereignis nicht gespeichert', { art, fehler: (e as Error).message });
    }
  }

  /** Aufgabe anlegen und als „etwas ist zu erledigen“ melden (#670). */
  private async neueAufgabe(a: Aufgabe, typ?: string): Promise<Aufgabe> {
    const x = await this.repo.legeAufgabeAn(a);
    await this.ereignis('aufgabe.neu', { aufgabe: x.id, mappe: x.mappeId, typ: typ ?? await this.typVon(x.mappeId), empfaenger: x.empfaengerId ?? null, aufgabenart: x.art }, a.erstelltVon ?? null);
    return x;
  }

  /** Typ einer Mappe für ein Ereignis (null, wenn es sie nicht mehr gibt). */
  private async typVon(mappeId: string): Promise<string | null> { return (await this.repo.holeMappe(mappeId))?.typId ?? null; }

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
    const pakete = await this.grundRepo.listePakete();
    const typen = k.mappentyp ? await this.grundRepo.listeTypen() : [];
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
        const typ = typeof e.daten.typ === 'string' ? e.daten.typ : mappe ? (await this.grundRepo.holeMappe(mappe))?.typId ?? null : null;
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
    if (e.art === 'dokument.hochgeladen' && typeof e.daten.dokument === 'string') daten.name = (await this.grundRepo.holeDokument(e.daten.dokument))?.name ?? null;
    const fuer = (art: EreignisArt): Record<string, unknown> => (art === 'texterkennung.fertig' ? { ...daten, seiten: daten.seiten ?? null } : daten);
    const feste = (paket: string, art: string) => { const h = createHash('sha256').update(`${e.id}|${paket}${art === e.art ? '' : `|${art}`}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
    await this.grundRepo.legeEreignisseAn(zustellungen.map((z) => ({ id: feste(z.paket.id, z.art), paketId: z.paket.id, art: z.art, daten: fuer(z.art) })));
    this.ereignisWecker?.();
  }

  /**
   * Auftrag an genau ein Paket (#577, #614, #631, #338): Der Kern bittet ein bestimmtes Paket um etwas (Datei umwandeln,
   * Volltext, Archivfassung) bzw. sagt ihm, dass seine Einstellungen geändert sind. Kein Geschehen für andere – daher
   * nicht im Ausgangskorb, sondern direkt in der Zustellung des Paket-Läufers (gleiche Wiederholung). In einer
   * Transaktion gehört er zur Änderung; sonst landen Fehler nur im Protokoll.
   */
  async auftrag(paket: string, art: Extract<EreignisArt, 'datei.umwandeln' | 'datei.volltext' | 'datei.archivfassung' | 'paket.einstellungen_geaendert'>, daten: Record<string, unknown>): Promise<'gesperrt' | void> {
    const inTx = transaktionen.getStore()?.dienst === this;
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
  speicherePaket(p: InstalliertesPaket) { return this.repo.speicherePaket(p); }
  loeschePaket(id: string) { return this.repo.loeschePaket(id); }

  /**
   * Weitere Katalogadressen (#189), global; der offizielle Katalog steht nicht darin. Mit bestätigtem
   * Schlüssel des Anbieters bzw. Sperre nach einem Schlüsselwechsel (#594).
   */
  async paketQuellen(): Promise<PaketQuelleEintrag[]> {
    const v = await this.einstellungen?.lies('paket_kataloge');
    const schluessel = (x: unknown) => (x && typeof x === 'object' && typeof (x as { fingerabdruck?: unknown }).fingerabdruck === 'string' ? x as never : null);
    return Array.isArray(v) ? v.filter((q) => q && typeof q.url === 'string').map((q) => ({
      url: q.url, aktiv: q.aktiv !== false, von: q.von ?? null, am: String(q.am ?? ''),
      schluessel: schluessel(q.schluessel), gesperrt: schluessel(q.gesperrt),
    })) : [];
  }
  async setzePaketQuellen(liste: PaketQuelleEintrag[]) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe('paket_kataloge', liste.length ? liste : null);
  }
  /** Neuester gesehener Stand (`erstellt`) je signiertem Katalog (#594) – gegen das Zurückdrehen auf ältere Kataloge. */
  async paketKatalogStaende(): Promise<Record<string, string>> {
    const v = await this.einstellungen?.lies('paket_katalog_staende');
    return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')) as Record<string, string> : {};
  }
  async setzePaketKatalogStand(url: string, stand: string) {
    if (!this.einstellungen) return;
    await this.einstellungen.schreibe('paket_katalog_staende', { ...(await this.paketKatalogStaende()), [url]: stand });
  }

  /** Umwandlungen Text → Verweis nach Paket-Updates (#534): die letzten Vorgänge zum Rückgängigmachen (Einstellung, Teil der Sicherung). */
  async paketUmwandlungen(): Promise<unknown[]> {
    const v = await this.einstellungen?.lies('paket_umwandlungen');
    return Array.isArray(v) ? v : [];
  }
  async setzePaketUmwandlungen(liste: unknown[]) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe('paket_umwandlungen', liste.length ? liste : null);
  }

  /** Selbst erstellte Pakete (#374): Angaben des letzten Exports je Paket-Id (Einstellung, Teil der Sicherung). */
  async paketEntwuerfe(): Promise<PaketEntwurf[]> {
    const v = await this.einstellungen?.lies('paket_entwuerfe');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === 'string' && typeof e.version === 'string').map((e) => ({ typen: [], sichten: [], beispiele: [], schluessel: {}, verlauf: [], aenderungen: '', ...e })) : [];
  }
  async setzePaketEntwuerfe(liste: PaketEntwurf[]) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe('paket_entwuerfe', liste.length ? liste : null);
  }

  /** Gemerkte Archive selbst erstellter Pakete (#652): je Paket-Id eine Einstellung (Teil der Sicherung). */
  async paketArchive(id: string): Promise<unknown> { return (await this.einstellungen?.lies(`paket_erstellt_${id}`)) ?? null; }
  async setzePaketArchive(id: string, liste: unknown[] | null) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe(`paket_erstellt_${id}`, liste?.length ? liste : null);
  }

  /** Paket-Einstellungen (#197): je Paket getrennt in den Einstellungen (Teil der Sicherung, Schlüsselwechsel inklusive). */
  async paketEinstellungen(id: string): Promise<{ werte: Record<string, unknown>; status?: { letzterLauf: string | null; meldungen: string[] } } | null> {
    const v = await this.einstellungen?.lies(`paket:${id}`);
    return v && typeof v === 'object' ? v as { werte: Record<string, unknown> } : null;
  }
  async setzePaketEinstellungen(id: string, v: { werte: Record<string, unknown>; status?: { letzterLauf: string | null; meldungen: string[] } } | null) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe(`paket:${id}`, v);
  }
  /** Kleiner eigener Speicher eines Pakets mit Code (#338), getrennt von den Einstellungen. */
  async paketSpeicher(id: string): Promise<Record<string, string>> {
    const v = await this.einstellungen?.lies(`paketspeicher:${id}`);
    return v && typeof v === 'object' ? v as Record<string, string> : {};
  }
  async setzePaketSpeicher(id: string, werte: Record<string, string> | null) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe(`paketspeicher:${id}`, werte);
  }
  /** Geheimnisse von Paketen mit dem Tresor des DMS. */
  verschluesselePaketGeheimnis(text: string): string {
    if (!this.tresor?.bereit) throw new Fachfehler(409, t('meldungen.dienst.fuer-geheimnisse-fehlt-der'));
    return this.tresor.verschluessele(text);
  }
  entschluessele(wert: string): string | null { return this.tresor?.entschluessele(wert) ?? null; }

  /** Warum Mappentypen nicht weg dürfen: Mappen oder Papierkorb-Einträge. Leer = frei. */
  async belegteTypen(ids: string[], ohne: string[] = []): Promise<string[]> {
    const gruende: string[] = [];
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    // Mappen, die ohnehin mitgehen (#878: unveränderte Beispiele), zählen nicht.
    const mitgehend = new Map<string, number>();
    for (const m of await this.repo.holeMappen(ohne)) mitgehend.set(m.typId, (mitgehend.get(m.typId) ?? 0) + 1);
    for (const id of ids) {
      const eintrag = typen.get(id);
      if (!eintrag) continue;
      const n = await this.repo.zaehleMappen(id) - (mitgehend.get(id) ?? 0);
      if (n) gruende.push(`${eintrag.name}: ${n} ${t('meldungen.dienst.mappen', { anzahl: n })}.`);
      const korb = (await this.repo.papierkorb({ typId: id })).length;
      if (korb) gruende.push(`${eintrag.name}: ${korb} im Papierkorb.`);
    }
    return gruende;
  }

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

  /** Felder, die einen Kreis nutzen: „Mappentyp · Feld“. */
  private async kreisVerwendung(): Promise<Map<string, Array<{ typId: string; typ: string; feldKey: string; feld: string }>>> {
    const v = new Map<string, Array<{ typId: string; typ: string; feldKey: string; feld: string }>>();
    for (const t of await this.repo.listeTypen()) for (const f of t.felder) {
      const k = kreisVon(f);
      if (k) v.set(k, [...(v.get(k) ?? []), { typId: t.id, typ: t.name, feldKey: f.key, feld: f.label }]);
    }
    return v;
  }

  async listeNummernkreise(jetzt = new Date()) {
    await this.archivKreis(); // Archivnummern (#345): der Kreis ist immer da
    const v = await this.kreisVerwendung();
    const d = datumIn(jetzt);
    return (await this.repo.listeNummernkreise()).map((k) => {
      const n = naechste(k, d);
      return { ...k, naechste: n.nummer, naechsterZaehler: n.zaehler, zeitraum: n.zeitraum, neubeginn: neubeginn(k.muster), verwendet: v.get(k.schluessel) ?? [] };
    });
  }

  async speichereNummernkreis(e: unknown, von: string) {
    const x = (e ?? {}) as Record<string, unknown>;
    const schluessel = text(x.schluessel).toLowerCase();
    const name = text(x.name).slice(0, 80);
    const muster = String(x.muster ?? '').trim();
    const start = Number(x.start ?? 1);
    const vorhanden = (await this.repo.listeNummernkreise()).find((k) => k.schluessel === schluessel);
    if (x.neu === true && vorhanden) throw new Fachfehler(409, t('meldungen.dienst.die-kennung-hat-schon', { schluessel, name: vorhanden.name }));
    if (x.neu !== true && !vorhanden) throw new Fachfehler(404, t('meldungen.dienst.diesen-nummernkreis-gibt-es'));
    if (!KREIS_SCHLUESSEL.test(schluessel)) throw new Fachfehler(422, t('meldungen.dienst.kennung-kleinbuchstaben-ziffern-und'));
    if (!name) throw new Fachfehler(422, t('meldungen.dienst.der-nummernkreis-braucht-einen'));
    const fm = pruefeMuster(muster);
    if (fm) throw new Fachfehler(422, fm);
    if (!Number.isSafeInteger(start) || start < 0) throw new Fachfehler(422, t('meldungen.dienst.der-startwert-muss-eine'));
    const k = await this.repo.speichereNummernkreis({ schluessel, name, muster, start });
    protokoll.modul('werkbank').info(vorhanden ? 'Nummernkreis geändert' : 'Nummernkreis angelegt', { von, schluessel, muster, start, ...(vorhanden && vorhanden.muster !== muster ? { musterVorher: vorhanden.muster } : {}) });
    return k;
  }

  async loescheNummernkreis(schluessel: string, von: string) {
    if (schluessel === ARCHIV_KREIS) throw new Fachfehler(409, t('meldungen.dienst.den-nummernkreis-der-archivnummern'));
    const v = (await this.kreisVerwendung()).get(schluessel);
    if (v?.length) throw new Fachfehler(409, t('meldungen.dienst.der-nummernkreis-wird-noch', { map: v.map((x) => `${x.typ} · ${x.feld}`).join(', ') }));
    await this.repo.loescheNummernkreis(schluessel);
    protokoll.modul('werkbank').info('Nummernkreis gelöscht', { von, schluessel });
  }

  /** Zählerstand setzen (#171): `naechster` ist der Zähler der nächsten Nummer im aktuellen Zeitraum. */
  async setzeZaehler(schluessel: string, e: unknown, von: string, jetzt = new Date()) {
    const naechster = Number((e as { naechster?: unknown })?.naechster);
    if (!Number.isSafeInteger(naechster) || naechster < 0) throw new Fachfehler(422, t('meldungen.dienst.der-zaehlerstand-muss-eine'));
    const k = (await this.repo.listeNummernkreise()).find((x) => x.schluessel === schluessel);
    if (!k) throw new Fachfehler(404, t('meldungen.dienst.diesen-nummernkreis-gibt-es'));
    const vorher = naechste(k, datumIn(jetzt));
    const neu = await this.repo.setzeZaehler(schluessel, vorher.zeitraum, naechster - 1);
    protokoll.modul('werkbank').warn('Zählerstand eines Nummernkreises gesetzt', { von, schluessel, zeitraum: vorher.zeitraum, vorher: vorher.zaehler, naechster });
    return neu;
  }

  /** Wartung (#171): Mappen eines Typs ohne Nummer – Anzahl und welche Nummern entstehen. */
  async nummernVorschau(typId: string, feldKey: string, jetzt = new Date()) {
    const { kreis, ohne } = await this.ohneNummer(typId, feldKey);
    if (!ohne.length) return { anzahl: 0, von: null, bis: null };
    const d = datumIn(jetzt);
    const n = naechste(kreis, d);
    const bis = naechste({ ...kreis, staende: { ...kreis.staende, [n.zeitraum]: n.zaehler + ohne.length - 2 } }, d);
    return { anzahl: ohne.length, von: n.nummer, bis: ohne.length === 1 ? n.nummer : bis.nummer };
  }

  private async ohneNummer(typId: string, feldKey: string): Promise<{ typ: Mappentyp; kreis: Nummernkreis; ohne: Mappe[] }> {
    const typ = await this.repo.holeTyp(typId);
    const f = typ?.felder.find((x) => x.key === feldKey);
    const k = f ? kreisVon(f) : null;
    if (!typ || !f || !k) throw new Fachfehler(422, t('meldungen.dienst.dieses-feld-nutzt-keinen'));
    const kreis = (await this.repo.listeNummernkreise()).find((x) => x.schluessel === k);
    if (!kreis) throw new Fachfehler(409, t('meldungen.dienst.den-nummernkreis-gibt-es', { k }));
    const ohne = (await this.repo.listeMappen(typId)).filter((m) => istLeer(m.werte[feldKey]))
      .sort((a, b) => a.erstellt.localeCompare(b.erstellt) || a.id.localeCompare(b.id));
    return { typ, kreis, ohne };
  }

  /** Wartung (#171): Nummern nachträglich vergeben, in der Reihenfolge des Anlegens; als Auftrag. */
  nummernNachtragen(typId: string, feldKey: string, von: string) {
    return this.auftraege.starte('nummern', 'Nummern nachträglich vergeben', async (fortschritt) => {
      const { typ, ohne } = await this.ohneNummer(typId, feldKey);
      const label = typ.felder.find((f) => f.key === feldKey)!.label;
      let vergeben = 0; let erste: string | null = null; let letzte: string | null = null;
      for (const [i, m] of ohne.entries()) {
        const nr = await this.repo.vergebeNummer(m.id, feldKey, kreisVon(typ.felder.find((f) => f.key === feldKey)!)!, new Date());
        if (nr) {
          vergeben++; erste ??= nr; letzte = nr;
          await this.notiere(m.id, null, 'geaendert', { aenderungen: [{ feld: feldKey, label, neu: nr }] satisfies Feldaenderung[] });
        }
        fortschritt(i + 1, ohne.length);
      }
      await this.aktualisiereTitel(ohne.map((m) => m.id));
      protokoll.modul('werkbank').info('Nummern nachträglich vergeben', { von, typ: typ.name, feld: label, vergeben, erste, letzte });
      return { vergeben, erste, letzte };
    }, [{ key: 'nummern', name: 'Nummern vergeben', einheit: 'Mappen' }]);
  }

  /**
   * Wartung „Absender bereinigen“ (#494): Bis 0.99 bekam eingehende Post ohne Absender den Namen dessen,
   * der sie angelegt hat (beim Eingangsordner „Eingangsordner“). Gesucht wird eingehende Post aus
   * Hochladen, API, WebDAV und Eingangsordner, deren Absender genau so lautet. Postfach-Abrufe und
   * versendete Post bleiben außen vor – dort kommt der Absender aus der E-Mail bzw. ist richtig.
   */
  async absenderVorschau(): Promise<{ posten: Array<{ id: string; titel: string; absender: string; kanal: string; erstellt: string }> }> {
    const typ = await this.postTyp();
    const kanaele = new Set<string>([POST_KANAL.hochgeladen, POST_KANAL.api, POST_KANAL.webdav, POST_KANAL.ordner]);
    const kandidaten = (await this.repo.listeMappen(typ.id)).filter((m) => auswahlText(m.werte.richtung) === POST_RICHTUNG.eingehend
      && kanaele.has(auswahlText(m.werte.kanal)) && typeof m.werte.absender === 'string' && m.werte.absender.trim() !== '');
    const namen = new Map<string, string>();
    const posten: Array<{ id: string; titel: string; absender: string; kanal: string; erstellt: string }> = [];
    for (const m of kandidaten) {
      const absender = String(m.werte.absender).trim();
      let passt = auswahlText(m.werte.kanal) === POST_KANAL.ordner && absender === 'Eingangsordner';
      if (!passt && m.erstelltVon) {
        if (!namen.has(m.erstelltVon)) namen.set(m.erstelltVon, await this.name(m.erstelltVon));
        passt = absender === namen.get(m.erstelltVon);
      }
      if (passt) posten.push({ id: m.id, titel: m.titel ?? '', absender, kanal: auswahlText(m.werte.kanal), erstellt: m.erstellt });
    }
    posten.sort((a, b) => b.erstellt.localeCompare(a.erstellt));
    return { posten };
  }

  /** Absender der gewählten Posts leeren (#494) – nur, wenn sie noch zur Vorschau passen; mit Eintrag in der Historie. */
  async absenderBereinigen(ids: unknown, von: { id: string | null; email: string }): Promise<{ bereinigt: number }> {
    const gewaehlt = new Set(Array.isArray(ids) ? ids.map(String) : []);
    if (!gewaehlt.size) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-eine-post'));
    const typ = await this.postTyp();
    const passend = (await this.absenderVorschau()).posten.filter((p) => gewaehlt.has(p.id));
    for (const p of passend) {
      const m = await this.repo.holeMappe(p.id);
      if (!m) continue;
      const werte = { ...m.werte, absender: null };
      await this.inTransaktion(async () => {
        const neu = await this.repo.aendereMappe(m.id, werte, [], von.id, { basis: m.werte, verweise: (w) => verweiseVon(typ, w) });
        await this.notiere(m.id, von.id, 'geaendert', {
          stand: neu.geaendert,
          aenderungen: await this.aenderungen(typ, m.werte, werte),
          text: t('meldungen.dienst.absender-bereinigt-wartung-er'),
        });
      });
      await this.aktualisiereTitel([m.id]);
    }
    protokoll.modul('werkbank').info('Absender bereinigt', { von: von.email, anzahl: passend.length });
    return { bereinigt: passend.length };
  }

  async titelNachziehen(): Promise<number> {
    const ids = await this.repo.ohneTitel();
    await this.aktualisiereTitel(ids);
    return ids.length;
  }

  /**
   * Beim Start (#663): Bis 0.159 hieß die Mappe eines deaktivierten Benutzers „… (ehemalig)“. Diese Titel
   * aus der Vorlage neu berechnen – samt Mappen, deren Titel den Namen enthält. Danach findet sich nichts mehr.
   */
  async ehemaligZuruecksetzen(): Promise<number> {
    const typ = (await this.repo.listeTypen()).find((t) => t.system === 'benutzer');
    if (!typ) return 0;
    const ids = (await this.repo.listeMappen(typ.id)).filter((m) => m.werte.aktiv === false && / \(ehemalig\)$/.test(m.titel ?? '')).map((m) => m.id);
    if (ids.length) await this.aktualisiereTitel(ids);
    return ids.length;
  }

  /**
   * Werte vor dem Speichern prüfen. „Bereits vergeben“ (#743): alle eindeutigen Felder in einer Abfrage über den Index;
   * liegt der gleiche Wert in einer Mappe, die der Benutzer nicht lesen darf, nennt die Meldung ihren Titel nicht.
   */
  private async pruefeWerte(typ: Mappentyp, werte: Werte, eigeneId?: string, alt?: Werte, z?: Zugriff) {
    const ids = [...new Set(verweiseVon(typ, werte).map((v) => v.zielId))].filter(istUuid);
    const typen = await this.repo.typenVon(ids);
    const doppelt = new Map<string, string>();
    const eindeutig = typ.felder.filter((f) => f.eindeutig && !istLeer(werte[f.key]) && (f.typ === 'text' || f.typ === 'zahl'));
    if (eindeutig.length) {
      const funde = await this.repo.findeDoppelte(typ.id, eindeutig.map((f) => ({ mappeId: eigeneId ?? null, feldKey: f.key, wert: String(werte[f.key]) })));
      const lesbar = await this.lesbare(z, [...new Set([...funde.values()].map((d) => d.id))]);
      for (const f of eindeutig) {
        const d = funde.get(`${eigeneId ?? ''}|${f.key}`);
        if (d) doppelt.set(f.key, lesbar.has(d.id) ? d.titel || 'Ohne Titel' : '');
      }
    }
    const p = pruefeMappe(typ, werte, { typVon: (id) => typen.get(id), doppelt: (k) => doppelt.get(k) });
    // Formate und Datumsgrenzen (#535): beim Bearbeiten nur, was sich ändert – der Bestand bleibt gültig.
    for (const [k, m] of Object.entries(pruefeFormate(typ, werte, alt))) p.felder[k] ??= m;
    // Ausgeblendete Felder (#655): Was dort unverändert steht, hält das Speichern nicht auf – sehen kann es hier keiner.
    if (alt) {
      const aus = ausgeblendeteFelder(typ);
      for (const k of Object.keys(p.felder)) if (aus.has(k) && JSON.stringify(werte[k] ?? null) === JSON.stringify(alt[k] ?? null)) delete p.felder[k];
    }
    if (!istOk(p)) {
      const namen = Object.keys(p.felder).map((k) => typ.felder.find((f) => f.key === k)?.label ?? k);
      throw new Fachfehler(422, namen.length ? t('meldungen.dienst.bitte-die-markierten-felder', { namen: namen.join(', ') }) : t('meldungen.dienst.bitte-die-markierten-felder-2'), p);
    }
  }

  /**
   * Angaben, die nicht zum Format bzw. zu den Datumsgrenzen passen (#535) – je Mappentyp und Feld, für die
   * Werkbank (Wartungsoperationen). Gespeichert bleiben sie gültig; beim nächsten Ändern des Felds müssen sie passen.
   */
  async unpassendeFormate(): Promise<Array<{ typId: string; typ: string; felder: Array<{ key: string; label: string; anzahl: number; mappen: Array<{ id: string; titel: string; wert: string; grund: string }> }> }>> {
    const heute = heuteIn();
    const aus = [];
    for (const typ of await this.repo.listeTypen()) {
      if (!typ.felder.some(hatVorgaben)) continue;
      const funde = unpassendeAngaben(typ, await this.repo.listeMappen(typ.id), heute);
      if (!funde.length) continue;
      const titel = new Map((await this.repo.holeMappen([...new Set(funde.map((f) => f.mappeId))])).map((m) => [m.id, m.titel || t('meldungen.dienst.ohne-titel')] as const));
      const felder = typ.felder.flatMap((f) => {
        const je = funde.filter((x) => x.feldKey === f.key);
        return je.length ? [{ key: f.key, label: f.label, anzahl: je.length, mappen: je.slice(0, 200).map((x) => ({ id: x.mappeId, titel: titel.get(x.mappeId) ?? t('meldungen.dienst.ohne-titel'), wert: x.wert.slice(0, 120), grund: x.grund })) }] : [];
      });
      aus.push({ typId: typ.id, typ: typ.name, felder });
    }
    return aus;
  }

  async legeMappeAn(eingabe: unknown, benutzerId: string | null = null, demo = false, z?: Zugriff): Promise<Mappe & { hinweis?: string }> {
    const e = (eingabe ?? {}) as { id?: unknown; typId?: unknown; werte?: unknown };
    const typ = istUuid(e.typId) ? await this.repo.holeTyp(e.typId) : undefined;
    if (!typ) throw new Fachfehler(422, t('meldungen.dienst.unbekannter-mappentyp'));
    if (!darfErstellen(typ)) throw new Fachfehler(403, t('meldungen.dienst.mappen-vom-typ-lassen', { name: typ.name, wert: typ.system === 'benutzer' ? t('meldungen.dienst.benutzer-legt-ein-administrator') : '' }));
    const werte = bereinigeWerte(typ, e.werte, {}, this.verschluessele);
    // Berechtigungen (#123): Anlegen wird mit den eingegebenen Werten geprüft.
    if (z && !z.admin) {
      const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte, erstellt: new Date().toISOString(), erstelltVon: z.ich.id, geaendert: new Date().toISOString(), geaendertVon: z.ich.id };
      if (!(await this.rechteAn(z, entwurf, true)).C) throw new Fachfehler(403, t('meldungen.dienst.mappen-vom-typ-mit', { name: typ.name }));
    }
    // Nummernkreise (#171): Eingaben zählen nicht; die Nummer zieht das Repo beim Anlegen.
    const nummern = typ.felder.flatMap((f) => { const k = kreisVon(f); return k ? [{ feldKey: f.key, kreis: k }] : []; });
    for (const n of nummern) delete werte[n.feldKey];
    if (nummern.length) {
      const da = new Set((await this.repo.listeNummernkreise()).map((k) => k.schluessel));
      const fehlt = nummern.find((n) => !da.has(n.kreis));
      if (fehlt) throw new Fachfehler(409, t('meldungen.dienst.den-nummernkreis-fuer-gibt', { kreis: fehlt.kreis, label: String(typ.felder.find((f) => f.key === fehlt.feldKey)?.label) }));
    }
    // Folgt aus (#886): leere Felder füllen sich aus ihrer Quelle – was die Anfrage selbst setzt, bleibt.
    await this.folgeFuellen(typ, werte, {}, gesendeteFelder(e.werte), z);
    await this.pruefeVerweisziele(z, typ, werte, {});
    await this.pruefeAuswahlfilter(typ, werte, {}, benutzerId);
    await this.pruefeWerte(typ, werte, undefined, undefined, z);
    const id = istUuid(e.id) && !(await this.repo.holeMappe(e.id)) ? e.id : randomUUID();
    // In einer Transaktion (#743): Mappe, Titel, Historie, Ereignisse und Fristen ganz oder gar nicht.
    const { m, titel } = await this.inEinemZug(async () => {
      const m = await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), benutzerId, demo, null, nummern.length ? { felder: nummern, jetzt: new Date() } : undefined);
      if (!demo) {
        await this.notiere(m.id, benutzerId, 'angelegt', { aenderungen: await this.aenderungen(typ, {}, m.werte) });
        await this.meldeVerknuepft(typ, m.id, {}, m.werte, benutzerId);
        await this.pruefeErwaehnungen(typ, m.id, {}, werte, benutzerId);
      }
      const titel = (await this.aktualisiereTitel([m.id])).get(m.id);
      if (typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
      if (!demo && fristFelder(typ).length) await this.fristenAbgleichen({ mappeIds: [m.id] });
      return { m, titel };
    });
    const hinweis = z ? await this.hinweisDanach(z, m.id) : undefined;
    return { ...m, titel, ...(hinweis ? { hinweis } : {}) };
  }

  /**
   * Auswahlfilter (#172): neue Verweise müssen den Filter des Felds erfüllen; bisherige bleiben
   * gültig, auch wenn sie inzwischen nicht mehr passen.
   */
  private async pruefeAuswahlfilter(typ: Mappentyp, werte: Werte, alt: Werte, benutzerId: string | null) {
    const mitFilter = typ.felder.filter((f) => f.typ === 'referenz' && f.auswahlFilter?.length);
    if (!mitFilter.length) return;
    const ids = (w: unknown) => (Array.isArray(w) ? w : w ? [w] : []).map(String).filter(istUuid);
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const a = await this.aufloesung(benutzerId ?? '');
    const fehler: Record<string, string[]> = {};
    for (const f of mitFilter) {
      const vorher = new Set(ids(alt[f.key]));
      const neu = ids(werte[f.key]).filter((x) => !vorher.has(x));
      const ziel = typen.get(f.zielTyp ?? '');
      if (!neu.length || !ziel) continue;
      // Werte aus der eigenen Mappe (#173): die, die gespeichert werden sollen.
      const k = auswahlKlausel(setzeEigeneWerte(f.auswahlFilter!, werte), ziel, a);
      const falsch = (await this.repo.holeMappen(neu)).filter((m) => m.typId !== ziel.id || !erfuellt(m, k.filter, KEINE_ZAEHLUNG));
      if (falsch.length) fehler[f.key] = [t('meldungen.dienst.passt-nicht-zur-auswahl', { map: falsch.map((m) => `„${m.titel || t('meldungen.dienst.ohne-titel')}“`).join(', ') })];
    }
    if (Object.keys(fehler).length) throw new Fachfehler(422, t('meldungen.dienst.bitte-die-markierten-felder-2'), { allgemein: [], felder: fehler });
  }

  /**
   * Verweise, die nicht (mehr) zu dieser Mappe passen – für den Hinweis am Feld und die Zeile über den Registern (#172,
   * #886, #887): je Verweisfeld die unpassenden Mappen (`unpassend`) und je Feld die eigenen Felder, mit denen es nicht
   * zusammenpasst (`konflikte`). Bestehende Werte bleiben gültig – das ist nur ein Hinweis.
   */
  private async verweiskonflikte(typ: Mappentyp | undefined, werte: Werte, benutzerId: string, schon?: { typen: Mappentyp[]; a: Aufloesung }, z?: Zugriff): Promise<{ unpassend: Record<string, string[]>; konflikte: Verweiskonflikt[] }> {
    const felder = typ?.felder.filter((f) => f.typ === 'referenz' && (f.auswahlFilter?.length || typ.felder.some((x) => x.folgtAus?.feld === f.key))) ?? [];
    if (!typ || !felder.length) return { unpassend: {}, konflikte: [] };
    const typen = new Map((schon?.typen ?? await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const a = schon?.a ?? await this.aufloesung(benutzerId);
    const unpassend: Record<string, string[]> = {};
    const konflikte: Verweiskonflikt[] = [];
    for (const f of felder) {
      const ids = (Array.isArray(werte[f.key]) ? werte[f.key] as string[] : werte[f.key] ? [String(werte[f.key])] : []).filter(istUuid);
      if (!ids.length) continue;
      const gruende = await this.verweisGruende(typ, f, await this.repo.holeMappen(ids), werte, typen.get(f.zielTyp ?? ''), a, z);
      const falsch = ids.filter((id) => gruende[id]);
      if (!falsch.length) continue;
      unpassend[f.key] = falsch;
      const eigene = [...new Set(falsch.flatMap((id) => gruende[id]))];
      konflikte.push({ feld: f.key, eigeneFelder: eigene, ...(falsch.some((id) => !gruende[id].length) ? { regel: true } : {}), ids: falsch });
    }
    return { unpassend, konflikte };
  }

  /**
   * Passen gewählte Mappen eines Verweisfelds zu den übrigen Werten dieser Mappe (#172, #173, #886, #887)? Je unpassender
   * Mappe die eigenen Felder, mit denen sie nicht zusammenpasst: Felder, aus denen der Auswahlfilter Werte nimmt, und
   * Felder, die aus diesem Feld folgen und etwas anderes enthalten. Eine leere Liste heißt: passt nur nicht zu den festen
   * Bedingungen des Auswahlfilters. Was folgt, zählt nur mit Mappen, die die Person lesen darf.
   */
  private async verweisGruende(typ: Mappentyp, f: Feld, mappen: Mappe[], werte: Werte, ziel: Mappentyp | undefined, a: Aufloesung, z?: Zugriff): Promise<Record<string, string[]>> {
    const gruende: Record<string, string[]> = {};
    const dazu = (id: string, k?: string) => { const g = (gruende[id] ??= []); if (k && !g.includes(k)) g.push(k); };
    if (ziel && f.auswahlFilter?.length) {
      const k = auswahlKlausel(setzeEigeneWerte(f.auswahlFilter, werte), ziel, a);
      const eigene = f.auswahlFilter.filter((b) => b.wert?.art === 'eigenesFeld');
      for (const m of mappen) {
        if (m.typId === ziel.id && erfuellt(m, k.filter, KEINE_ZAEHLUNG)) continue;
        dazu(m.id);
        for (const b of eigene) {
          const kb = auswahlKlausel(setzeEigeneWerte([b], werte), ziel, a);
          if (!erfuellt(m, kb.filter, KEINE_ZAEHLUNG)) dazu(m.id, (b.wert as { feld: string }).feld);
        }
      }
    }
    const folgen = typ.felder.filter((x) => x.typ === 'referenz' && x.folgtAus?.feld === f.key && !istLeer(werte[x.key]));
    if (folgen.length) {
      const lesbar = await this.lesbare(z, mappen.map((m) => m.id));
      for (const m of mappen) {
        if (!lesbar.has(m.id) || m.typId !== f.zielTyp) continue;
        for (const x of folgen) {
          const soll = ersteId(m.werte[x.folgtAus!.zielFeld]);
          if (istUuid(soll) && !enthaeltId(werte[x.key], soll)) dazu(m.id, x.key);
        }
      }
    }
    return gruende;
  }

  /** Auswahlfilter (#172, #173) und „folgt aus“ (#886) beim Ausfüllen: welche der gewählten Mappen passen nicht, und womit nicht? */
  async auswahlPruefen(e: unknown, benutzerId: string, z?: Zugriff) {
    const x = (e ?? {}) as { typId?: unknown; feldKey?: unknown; ids?: unknown; werte?: unknown };
    const typ = istUuid(x.typId) ? await this.repo.holeTyp(x.typId) : undefined;
    const f = typ?.felder.find((y) => y.key === x.feldKey && y.typ === 'referenz');
    const ziel = f ? await this.repo.holeTyp(f.zielTyp ?? '') : undefined;
    // Nur Mappen, die man lesen darf – sonst verriete die Antwort etwas über ihre Werte.
    const roh = (Array.isArray(x.ids) ? x.ids : []).map(String).filter(istUuid).slice(0, 200);
    const lesbar = await this.lesbare(z, roh);
    const ids = roh.filter((id) => lesbar.has(id));
    const leer = { unpassend: [] as string[], gruende: {} as Record<string, string[]> };
    if (!typ || !f || !ziel || !ids.length || !(f.auswahlFilter?.length || typ.felder.some((y) => y.folgtAus?.feld === f.key))) return leer;
    const werte = x.werte && typeof x.werte === 'object' ? x.werte as Werte : {};
    const gruende = await this.verweisGruende(typ, f, await this.repo.holeMappen(ids), werte, ziel, await this.aufloesung(benutzerId), z);
    return { unpassend: ids.filter((id) => gruende[id]), gruende };
  }

  /**
   * Folgt aus (#886) beim Speichern: Ein leeres Verweisfeld mit „folgt aus“ füllt sich aus dem Ziel seiner Quelle – nur,
   * wenn die Quelle neu gesetzt oder geändert ist, die Anfrage das Feld nicht selbst setzt (auch nicht leer) und die
   * Person beide Mappen lesen darf. Was schon drinsteht, überschreibt das nie; hat das Ziel keinen Wert, bleibt alles.
   */
  private async folgeFuellen(typ: Mappentyp, werte: Werte, alt: Werte, gesendet: Set<string>, z?: Zugriff): Promise<void> {
    for (const { feld: f, quelle, zielFeld } of folgeReihenfolge(typ.felder)) {
      if (gesendet.has(f.key) || !istLeer(werte[f.key])) continue;
      const q = ersteId(werte[quelle.key]);
      if (!istUuid(q) || q === ersteId(alt[quelle.key])) continue;
      const m = await this.folgeWert(quelle, zielFeld, f, q, z);
      if (m) werte[f.key] = f.mehrfach ? [m.id] : m.id;
    }
  }

  /** Was aus der Quelle folgt: die Mappe im Feld `zielFeld` der Mappe `q` – vom passenden Typ und für die Person lesbar. */
  private async folgeWert(quelle: Feld, zielFeld: string, f: Feld, q: string, z?: Zugriff): Promise<Mappe | null> {
    const m = await this.repo.holeMappe(q);
    if (!m || m.typId !== quelle.zielTyp) return null;
    const id = ersteId(m.werte[zielFeld]);
    if (!istUuid(id)) return null;
    const ziel = await this.repo.holeMappe(id);
    if (!ziel || ziel.typId !== f.zielTyp) return null;
    const lesbar = await this.lesbare(z, [q, id]);
    return lesbar.has(q) && lesbar.has(id) ? ziel : null;
  }

  /**
   * Folgt aus (#886) für die Oberfläche: Was folgt aus den Quellen in `werte`? Je Feld mit „folgt aus“, dessen Quelle
   * einen Wert hat, die Mappe (mit Titel) oder null (das Ziel hat keinen Wert oder ist nicht lesbar).
   */
  async folgen(e: unknown, z?: Zugriff) {
    const x = (e ?? {}) as { typId?: unknown; werte?: unknown };
    const typ = istUuid(x.typId) ? await this.repo.holeTyp(x.typId) : undefined;
    if (!typ || (z && !z.admin && z.typen && !z.typen.has(typ.id))) throw new Fachfehler(422, t('meldungen.dienst.unbekannter-mappentyp'));
    const werte = x.werte && typeof x.werte === 'object' ? x.werte as Werte : {};
    const felder: Record<string, { quelle: string; wert: string | null; titel?: string; typId?: string }> = {};
    for (const { feld: f, quelle, zielFeld } of folgeReihenfolge(typ.felder)) {
      const q = ersteId(werte[quelle.key]);
      if (!istUuid(q)) continue;
      const m = await this.folgeWert(quelle, zielFeld, f, q, z);
      felder[f.key] = m ? { quelle: quelle.key, wert: m.id, titel: m.titel ?? '', typId: m.typId } : { quelle: quelle.key, wert: null };
    }
    return { felder };
  }

  /**
   * Folgt aus (#886) beim Ausfüllen aus Dokumenten: Hat die Erkennung eine Quelle vorgeschlagen, kommt für das Feld, das
   * daraus folgt, ein Vorschlag dazu (wenn es selbst keinen hat) – mit derselben Sicherheit und „aus …“ als Fundstelle.
   */
  async folgeVorschlaege(typ: Mappentyp, v: { vorschlaege: Record<string, { wert: Wert; sicherheit: 'hoch' | 'mittel' | 'niedrig'; fundstelle: string }>; bezuege: Record<string, MappenBezug>; neu: Record<string, unknown> }, z?: Zugriff): Promise<void> {
    for (const { feld: f, quelle, zielFeld } of folgeReihenfolge(typ.felder)) {
      if (v.vorschlaege[f.key]) continue;
      const vq = v.vorschlaege[quelle.key];
      const q = ersteId(vq?.wert);
      if (!vq || !istUuid(q)) continue;
      const m = await this.folgeWert(quelle, zielFeld, f, q, z);
      if (!m) continue;
      v.vorschlaege[f.key] = { wert: f.mehrfach ? [m.id] : m.id, sicherheit: vq.sicherheit, fundstelle: t('meldungen.dienst.folgt-aus', { feld: quelle.label || quelle.key }) };
      v.bezuege[m.id] = { titel: m.titel ?? '', typId: m.typId };
      delete v.neu[f.key];
    }
  }

  /** Auswahlfilter (#172) in der Werkbank: wie viele Mappen des Zieltyps passen? */
  async zaehleAuswahl(e: unknown, benutzerId: string) {
    const x = (e ?? {}) as { zielTyp?: unknown; bedingungen?: unknown };
    const ziel = istUuid(x.zielTyp) ? await this.repo.holeTyp(x.zielTyp) : undefined;
    if (!ziel) throw new Fachfehler(422, t('meldungen.dienst.unbekannter-ziel-mappentyp'));
    // Bedingungen mit Werten der eigenen Mappe (#173) zählen hier nicht – die Mappe gibt es noch nicht.
    const bed = setzeEigeneWerte(bereinigeAuswahlfilter(x.bedingungen), {});
    const [passen] = await this.repo.zaehleKlauseln([[auswahlKlausel(bed, ziel, await this.aufloesung(benutzerId))]], null);
    return { passen, gesamt: await this.repo.zaehleMappen(ziel.id), probleme: auswahlProbleme(bed, ziel) };
  }

  /** Verweise nur auf Mappen, die man sehen darf (#124, #137); bisherige Ziele bleiben erlaubt. */
  private async pruefeVerweisziele(z: Zugriff | undefined, typ: Mappentyp, werte: Werte, alt: Werte) {
    if (!z || z.admin || !z.lesen) return;
    const vorher = new Set(verweiseVon(typ, alt).map((v) => v.zielId));
    const neu = [...new Set(verweiseVon(typ, werte).map((v) => v.zielId))].filter((x) => istUuid(x) && !vorher.has(x));
    if (!neu.length) return;
    const ok = await this.repo.lesbare(neu, z.lesen);
    if (neu.some((x) => !ok.has(x))) throw new Fachfehler(422, t('meldungen.dienst.ein-verweis-zeigt-auf'));
  }

  /** Nach dem Speichern: Hat man sich selbst das Bearbeiten oder Lesen entzogen? (#126) */
  private async hinweisDanach(z: Zugriff, id: string): Promise<string | undefined> {
    if (z.admin) return undefined;
    const m = await this.repo.holeMappe(id);
    if (!m) return undefined;
    const r = await this.rechteAn(z, m);
    if (!r.R) return t('meldungen.dienst.gespeichert-diese-mappe-kannst');
    if (!r.U) return t('meldungen.dienst.gespeichert-diese-mappe-kannst-2');
    return undefined;
  }

  /** Vor dem Speichern (#126): welche Rechte hätte man mit diesen Werten? */
  async rechteVorschau(id: string, eingabe: unknown, z: Zugriff): Promise<Rechte> {
    const m = await this.pruefeRecht(z, id, 'U');
    const typ = z.typen.get(m.typId);
    if (!typ) throw new Fachfehler(500, t('meldungen.dienst.der-mappentyp-dieser-mappe'));
    const werte = bereinigeWerte(typ, (eingabe as { werte?: unknown })?.werte, m.werte, this.verschluessele);
    return this.rechteAn(z, { ...m, werte });
  }

  /**
   * Gleichzeitig bearbeiten (#609): übergebene Felder, die seit `stand` geändert wurden (laut Historie, Einträge
   * mit `stand`) und die die Eingabe jetzt anders setzen will. Gleicher Wert ist kein Konflikt.
   */
  private async feldkonflikte(typ: Mappentyp, m: Mappe, werte: Werte, gesendet: string[], stand: string): Promise<Feldkonflikt[]> {
    const seit = new Map<string, Historieneintrag>();
    // Neueste zuerst: je Feld zählt die letzte Änderung.
    for (const h of await this.repo.historie(m.id)) {
      if (h.art !== 'geaendert' || typeof h.daten.stand !== 'string' || h.daten.stand <= stand) continue;
      for (const a of h.daten.aenderungen ?? []) if (!seit.has(a.feld)) seit.set(a.feld, h);
    }
    const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (istLeer(a as Werte[string]) && istLeer(b as Werte[string]));
    const felder = typ.felder.filter((f) => gesendet.includes(f.key) && seit.has(f.key) && !gleich(werte[f.key], m.werte[f.key]));
    if (!felder.length) return [];
    const ids = felder.filter((f) => f.typ === 'referenz').flatMap((f) => [werte[f.key], m.werte[f.key]].flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))).map(String).filter(istUuid);
    const titel = await this.repo.titelVon(ids);
    const lesbar = (f: Feld, v: Werte[string] | undefined) => (f.typ === 'passwort' ? '' : formatiere(f, v, (x) => titel.get(x) || t('meldungen.dienst.ohne-titel')).slice(0, 500));
    const liste: Feldkonflikt[] = [];
    for (const f of felder) {
      const h = seit.get(f.key)!;
      liste.push({
        feld: f.key, label: f.label, deins: lesbar(f, werte[f.key]), aktuell: lesbar(f, m.werte[f.key]),
        ...(f.typ === 'passwort' ? { geheim: true } : { wert: m.werte[f.key] ?? null }),
        von: h.benutzerId, name: h.benutzerId ? await this.name(h.benutzerId) : t('mappen.konflikt.system'), zeit: h.zeit,
      });
    }
    return liste;
  }

  /**
   * Mappe ändern. Übergebene Felder ersetzen die bisherigen, nicht übergebene bleiben (#609: auch wenn sie
   * inzwischen jemand anderes geändert hat – geschrieben wird feldweise auf den aktuellen Stand).
   * `eingabe.stand` (optional, „zuletzt geändert“ beim Lesen): Hat seitdem jemand ein übergebenes Feld
   * geändert und soll es jetzt anders lauten, kommt 409 mit den Feldern (`Mappenkonflikt`) statt Überschreiben.
   * `anlass`: steht zusätzlich im Eintrag der Historie, z. B. die Umwandlung nach einem Paket-Update (#534).
   */
  async aendereMappe(id: string, eingabe: unknown, benutzerId: string | null = null, z?: Zugriff, anlass?: Record<string, unknown>): Promise<Mappe & { hinweis?: string }> {
    // Schreibt zwischen Lesen und Schreiben jemand anderes, noch einmal von vorn (#609). In einer eigenen Transaktion
    // (#743) auch nach einer Verklemmung – die Transaktion ist dann ganz zurückgerollt.
    const eigene = transaktionen.getStore()?.dienst !== this;
    for (let versuch = 1; ; versuch++) {
      try {
        const neu = await this.inTransaktion(() => this.aendereMappeEinmal(id, eingabe, benutzerId, z, anlass));
        const hinweis = z ? await this.hinweisDanach(z, id) : undefined;
        return { ...neu, ...(hinweis ? { hinweis } : {}) };
      } catch (e) { if (!(e instanceof StandVeraltet || (eigene && istVerklemmung(e))) || versuch >= 5) throw e; }
    }
  }

  /**
   * Titel einer Mappe, bevor sie geschrieben wird (#743): mit den Titeln der Mappen, auf die die Werte verweisen.
   * Die Funktion liefert undefined, wenn die geschriebenen Werte auf eine Mappe verweisen, deren Titel nicht vorab
   * gelesen wurde (jemand hat inzwischen einen Verweis gesetzt) – dann rechnet `aktualisiereTitel` danach wie bisher.
   */
  private async titelVorab(typ: Mappentyp, werte: Werte, m: Mappe): Promise<(w: Werte) => string | undefined> {
    const ziele = [...new Set([...verweiseVon(typ, werte), ...verweiseVon(typ, m.werte)].map((v) => v.zielId))];
    const titel = await this.repo.titelVon(ziele.filter(istUuid));
    // „Zuletzt geändert“ im Titel ({geaendert}) zeigt den Tag des Speicherns.
    const index = { ...m, geaendert: new Date().toISOString() };
    return (w) => (verweiseVon(typ, w).every((v) => titel.has(v.zielId) || !istUuid(v.zielId))
      ? titelAus(typ, w, (x) => titel.get(x) || t('meldungen.dienst.ohne-titel'), index) : undefined);
  }

  /** Ein Versuch, in einer Transaktion (#743): Werte, Titel, Historie, Ereignisse, Passung, Fristen ganz oder gar nicht. */
  private async aendereMappeEinmal(id: string, eingabe: unknown, benutzerId: string | null, z: Zugriff | undefined, anlass: Record<string, unknown> | undefined): Promise<Mappe> {
    const m = z ? await this.pruefeRecht(z, id, 'U') : await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const typ = await this.repo.holeTyp(m.typId);
    if (!typ) throw new Fachfehler(500, t('meldungen.dienst.der-mappentyp-dieser-mappe'));
    const e = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as { werte?: unknown; stand?: unknown };
    const stand = liesStand(e.stand);
    const werte = bereinigeWerte(typ, e.werte, m.werte, this.verschluessele);
    // Stand (#609): Hat sich seitdem ein Feld geändert, das diese Eingabe anders setzen will? Dann fragen.
    if (stand && stand !== m.geaendert) {
      const gesendet = e.werte && typeof e.werte === 'object' ? Object.keys(e.werte) : [];
      const konflikte = await this.feldkonflikte(typ, m, werte, gesendet, stand);
      if (konflikte.length) {
        const k: Mappenkonflikt = { stand: m.geaendert, konflikte };
        throw new Fachfehler(409, t('mappen.konflikt.fehler', { felder: konflikte.map((x) => `„${x.label}“`).join(', ') }), k);
      }
    }
    // Geschützte Felder (Benutzer, Name einer Systemrolle) ändert nur das System.
    for (const [k, grund] of Object.entries(geschuetzteFelder(typ, m))) {
      if (JSON.stringify(werte[k] ?? null) !== JSON.stringify(m.werte[k] ?? null)) {
        throw new Fachfehler(403, t('meldungen.dienst.laesst-sich-hier-nicht', { wert: typ.felder.find((f) => f.key === k)?.label ?? k, grund }));
      }
    }
    await this.folgeFuellen(typ, werte, m.werte, gesendeteFelder(e.werte), z);
    await this.pruefeVerweisziele(z, typ, werte, m.werte);
    await this.pruefeAuswahlfilter(typ, werte, m.werte, benutzerId);
    await this.pruefeWerte(typ, werte, id, m.werte, z);
    const aenderungen = await this.aenderungen(typ, m.werte, werte);
    // Archivmodus (#212): eine neue Frist steht in der Historie.
    const bisAlt = aufbewahrenBis(typ.archiv, m), bisNeu = aufbewahrenBis(typ.archiv, { ...m, werte });
    if (bisAlt !== bisNeu) aenderungen.push({ feld: '_aufbewahrenBis', label: t('meldungen.dienst.aufbewahren-bis'), alt: bisAlt ? datumText(bisAlt) : '', neu: bisNeu ? datumText(bisNeu) : '' });
    // Feldweise (#609); mit Stand nur, wenn sich die Mappe seit dem Lesen oben nicht geändert hat.
    const titelFuer = await this.titelVorab(typ, werte, m);
    const neu = await this.repo.aendereMappe(id, werte, [], benutzerId, { basis: m.werte, verweise: (w) => verweiseVon(typ, w), titel: titelFuer, ...(stand ? { stand: m.geaendert } : {}) });
    if (aenderungen.length) await this.notiere(id, benutzerId, 'geaendert', { ...anlass, aenderungen, stand: neu.geaendert });
    await this.meldeVerknuepft(typ, id, m.werte, neu.werte, benutzerId);
    // Gespeichert heißt: passt wieder – eine „passt nicht“-Aufgabe ist damit erledigt.
    await this.passungsAufgaben([{ id, problem: null }]);
    await this.pruefeErwaehnungen(typ, id, m.werte, werte, benutzerId);
    // Titel (#743): stand er schon im UPDATE, nur noch die Mappen nachziehen, die auf diese verweisen (wenn er sich
    // geändert hat); sonst wie bisher.
    const vorab = titelFuer(neu.werte);
    let titel = neu.titel;
    if (vorab === undefined || vorab !== neu.titel) titel = (await this.aktualisiereTitel([id])).get(id);
    else if (vorab !== m.titel) await this.aktualisiereTitel(await this.repo.quellenVon([id]));
    if (typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    // Fristen (#129): neues Datum → neue Aufgabe, verschobenes oder leeres → alte erledigt.
    await this.fristenAbgleichen({ mappeIds: [id] });
    // Post (#192): „Für“ und Stand bestimmen die Aufgabe „Neue Post“.
    if (typ.system === 'post') await this.postAufgaben(id, benutzerId);
    return { ...neu, titel };
  }

  /** Viele neue Mappen auf einmal (Demo-Daten); Werte sind bereits geprüft. */
  legeMappenAn(liste: NeueMappe[]) { return this.repo.legeMappenAn(liste); }
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

  private sichern?: Promise<{ benutzer: Mappentyp; rolle: Mappentyp; post: Mappentyp; systemrollen: Map<Rolle, string>; kontorollen: Map<Kontorolle, string> }>;

  /**
   * Legt die Systemtypen „Benutzer“ und „Rolle“ und die Systemrollen an, falls sie fehlen.
   * Läuft beim Start und vor jedem Spiegeln; gleichzeitige Aufrufe teilen sich einen Lauf.
   */
  sichereSystem() {
    this.sichern ??= this.sichereSystemJetzt().catch((e) => { this.sichern = undefined; throw e; });
    return this.sichern.then(async (s) => ({
      // Definitionen können sich seitdem geändert haben (Felder ergänzt, umbenannt).
      benutzer: (await this.repo.holeTyp(s.benutzer.id)) ?? s.benutzer,
      rolle: (await this.repo.holeTyp(s.rolle.id)) ?? s.rolle,
      post: (await this.repo.holeTyp(s.post.id)) ?? s.post,
      systemrollen: s.systemrollen,
      kontorollen: s.kontorollen,
    }));
  }

  /**
   * Ablageort (#168, #883): Seit #883 bringt ihn das Paket Basis mit (`basis:ablageort`); der Kern legt keinen mehr an.
   * Ältere Ablagen haben noch den Ablageort, den der Kern früher anlegte – Basis übernimmt ihn beim Installieren bzw.
   * Aktualisieren mit gleicher Id. Ohne Basis und ohne früheren Ablageort gibt es keinen (gewollt). `dms:ablageort` in
   * Paketen zeigt eine Zeit lang auf diesen Typ (Alias).
   */
  async ablageortTyp(): Promise<Mappentyp | undefined> {
    await this.sichereSystem();
    const id = await this.ablageortId();
    return id ? this.repo.holeTyp(id) : undefined;
  }

  private async ablageortId(): Promise<string | undefined> {
    const basis = (await this.listePakete()).find((p) => p.id === 'basis')?.typen.ablageort;
    if (basis && (await this.repo.holeTyp(basis))) return basis;
    return (await this.frueherAblageortTyp())?.id;
  }

  /**
   * Der Ablageort, den der Kern vor #883 angelegt hat – solange ihn kein Paket übernommen hat. Gemerkt über seine Id in
   * den Einstellungen (ohne Einstellungen, z. B. in Tests: über die Kennung `ablageort`).
   */
  async frueherAblageortTyp(): Promise<Mappentyp | undefined> {
    const merk = (await this.einstellungen?.lies('ablageort')) as { id?: string } | null | undefined;
    const id = merk?.id ?? (this.einstellungen ? undefined : (await this.repo.listeTypen()).find((t) => !t.system && t.schluessel === 'ablageort')?.id);
    if (!id || (await this.listePakete()).some((p) => Object.values(p.typen).includes(id))) return undefined;
    return this.repo.holeTyp(id);
  }

  private async sichereSystemJetzt() {
    const typen = await this.repo.listeTypen();
    let rolle = typen.find((t) => t.system === 'rolle');
    let benutzer = typen.find((t) => t.system === 'benutzer');
    let post = typen.find((t) => t.system === 'post');
    const frei = (name: string) => (typen.some((t) => t.name.trim().toLowerCase() === name.toLowerCase()) ? `${name} (System)` : name);
    // Feste Schlüssel der Systemtypen (#145): benutzer, rolle, post.
    const sk = (k: string) => freierSchluessel(k, typen.map((t) => t.schluessel ?? ''));
    const ids = { rolle: rolle?.id ?? randomUUID(), benutzer: benutzer?.id ?? randomUUID() };
    if (!rolle) {
      rolle = await this.repo.legeTypAn(ids.rolle, {
        name: frei(SYSTEMTYPEN.rolle), schluessel: sk('rolle'), beschreibung: t('meldungen.dienst.rollen-die-benutzer-haben'), titelVorlage: '{name}',
        felder: systemfelder('rolle', ids.rolle),
        register: [
          { key: 'allgemein', name: REGISTERNAMEN.allgemein, art: 'felder', felder: ['name'] },
          { key: 'benutzer', name: REGISTERNAMEN.benutzer, art: 'verknuepfungen', quellen: [{ typId: ids.benutzer, feldKey: 'rollen' }] },
        ],
        trefferliste: [], erstellenErlaubt: true, loeschenErlaubt: true,
      }, 'rolle');
      await this.sichtFuerTyp(rolle);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: rolle.name });
    }
    if (!benutzer) {
      benutzer = await this.repo.legeTypAn(ids.benutzer, {
        name: frei(SYSTEMTYPEN.benutzer), schluessel: sk('benutzer'), beschreibung: t('meldungen.dienst.die-benutzer-dieser-installation'), titelVorlage: '{name}',
        felder: systemfelder('benutzer', rolle.id, ids.benutzer),
        register: [
          { key: 'allgemein', name: REGISTERNAMEN.allgemein, art: 'felder', felder: ['name', 'email', 'rollen', 'aktiv', 'abwesend', 'abwesend_von', 'abwesend_bis', 'vertreter'] },
          { key: 'dokumente', name: REGISTERNAMEN.dokumente, art: 'dokumente' },
          { key: 'verknuepfungen', name: REGISTERNAMEN.verknuepfungen, art: 'verknuepfungen', quellen: [] },
        ],
        trefferliste: ['name', 'email', 'rollen', 'aktiv'], erstellenErlaubt: false, loeschenErlaubt: false,
      }, 'benutzer');
      await this.sichtFuerTyp(benutzer);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: benutzer.name });
    }
    if (!post) {
      // Post (#192): alles, was hinein- oder hinausgeht; ersetzt den früheren Typ E-Mail (#58).
      post = await this.repo.legeTypAn(randomUUID(), {
        name: frei(SYSTEMTYPEN.post), schluessel: sk('post'), beschreibung: POST_BESCHREIBUNG, titelVorlage: '{betreff}',
        felder: systemfelder('post', rolle.id, benutzer.id),
        register: [
          { key: 'allgemein', name: REGISTERNAMEN.allgemein, art: 'felder', felder: systemfelder('post', rolle.id, benutzer.id).map((f) => f.key) },
          { key: 'dokumente', name: REGISTERNAMEN.dokumente, art: 'dokumente' },
          { key: 'protokoll', name: REGISTERNAMEN.historie, art: 'protokoll' },
        ],
        trefferliste: POST_SPALTEN, erstellenErlaubt: false, loeschenErlaubt: true,
      }, 'post');
      await this.sichtFuerTyp(post);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: post.name });
    }
    post = await this.wandleZuPost(post, rolle.id, benutzer.id);
    await this.sicherePostSichten(post);
    await this.sichereFavoritenSicht();
    benutzer = await this.ergaenzeSystemfelder(benutzer, rolle.id);
    const systemrollen = new Map<keyof typeof ROLLEN, string>();
    for (const r of Object.keys(ROLLEN) as Array<keyof typeof ROLLEN>) {
      const kennung = systemrolleKennung(r);
      let m = await this.repo.holeSystemMappe(kennung);
      if (!m) {
        const name = (await this.repo.findeDoppelt(rolle.id, 'name', ROLLEN[r])) ? `${ROLLEN[r]} (System)` : ROLLEN[r];
        m = await this.schreibeSystemMappe(rolle, randomUUID(), { name }, null, kennung);
      }
      systemrollen.set(r, m.id);
    }
    // Systemrollen für Konten, die kein Mensch sind (#673): Systemkonto und Paket – nur in Regeln am Mappentyp, nie an Menschen vergeben.
    const kontorollen = new Map<Kontorolle, string>();
    for (const r of Object.keys(KONTOROLLEN) as Kontorolle[]) {
      const kennung = kontorolleKennung(r);
      let m = await this.repo.holeSystemMappe(kennung);
      if (!m) {
        const name = (await this.repo.findeDoppelt(rolle.id, 'name', KONTOROLLEN[r])) ? `${KONTOROLLEN[r]} (System)` : KONTOROLLEN[r];
        m = await this.schreibeSystemMappe(rolle, randomUUID(), { name }, null, kennung);
      }
      kontorollen.set(r, m.id);
    }
    await this.loeseFruehereAdminrolle(benutzer);
    rolle = await this.beschrifteSystemtyp(rolle, rolle.id, benutzer.id);
    benutzer = await this.beschrifteSystemtyp(benutzer, rolle.id, benutzer.id);
    post = await this.beschrifteSystemtyp(post, rolle.id, benutzer.id);
    return { benutzer, rolle, post, systemrollen, kontorollen };
  }

  /**
   * Beschriftungen der Systemmappentypen (#729): Name, Beschreibung, Register und Systemfelder auf Englisch (und in
   * installierten Sprachen) – bei jedem Start ergänzt, nie überschrieben. Eigene Namen des Administrators bleiben ohne
   * fremde Beschriftung, damit dort nicht plötzlich der Standardname erscheint.
   */
  private async beschrifteSystemtyp(typ: Mappentyp, rolleId: string, benutzerId: string): Promise<Mappentyp> {
    const system = typ.system;
    if (!system) return typ;
    const soll = systemfelder(system, rolleId, benutzerId);
    const felder = typ.felder.map((f) => { const x = f.system ? soll.find((y) => y.key === f.key) : undefined; return x ? { ...f, ...mitSystemBeschriftung(f, x) } : f; });
    const BESCHREIBUNG: Record<string, string> = { rolle: 'meldungen.dienst.rollen-die-benutzer-haben', benutzer: 'meldungen.dienst.die-benutzer-dieser-installation', post: 'meldungen.dienst.alles-was-in-ablago' };
    const tb = systemBeschriftung<TypTeile>({
      ...(typ.name === SYSTEMTYPEN[system] ? { name: `gemeinsam.model.systemtyp.${system}` } : {}),
      ...(typ.beschreibung === inSprache('de', () => t.frei(BESCHREIBUNG[system])) ? { beschreibung: BESCHREIBUNG[system] } : {}),
    });
    const REG: Record<string, keyof typeof REGISTERNAMEN> = { allgemein: 'allgemein', dokumente: 'dokumente', verknuepfungen: 'verknuepfungen', benutzer: 'benutzer', protokoll: 'historie' };
    const register = typ.register.map((r) => {
      const k = REG[r.key];
      const b = k && r.name === REGISTERNAMEN[k] ? systemBeschriftung<NamensTeile>({ name: `gemeinsam.model.register.${k}` }) : undefined;
      return b ? { ...r, ...mitBeschriftungen(ergaenzeBeschriftungen(r.beschriftungen, b)) } : r;
    });
    const beschriftungen = ergaenzeBeschriftungen(typ.beschriftungen, tb);
    const neu = { ...typ, felder, register, ...mitBeschriftungen(beschriftungen) };
    if (JSON.stringify(neu) === JSON.stringify(typ)) return typ;
    return this.repo.aendereTyp(typ.id, { ...neu, trefferlisten: trefferlistenVon(neu), trefferliste: undefined });
  }

  /**
   * Umstellung #818: Die Systemrolle „Administrator“ entfällt. Ihre Mappe verliert die Kennung und wird eine
   * gewöhnliche Rolle ohne Mitglieder – so bleiben Regeln gültig, die sie nennen; ohne solche Regeln kann man sie
   * löschen. Einmalig beim ersten Start nach dem Update.
   */
  private async loeseFruehereAdminrolle(benutzerTyp: Mappentyp) {
    const alt = await this.repo.holeSystemMappe(FRUEHERE_ADMINROLLE);
    if (!alt) return;
    for (const m of await this.repo.listeMappen(benutzerTyp.id)) {
      const rollen = alsListe(m.werte.rollen);
      if (rollen.includes(alt.id)) await this.schreibeSystemMappe(benutzerTyp, m.id, { ...m.werte, rollen: rollen.filter((r) => r !== alt.id) }, null);
    }
    await this.repo.setzeSystemKennung(alt.id, null);
    protokoll.modul('werkbank').warn('Systemrolle „Administrator“ aufgelöst: jetzt eine gewöhnliche Rolle ohne Mitglieder', { rolle: alt.titel || String(alt.werte.name ?? '') });
  }

  /**
   * Spur im Verwaltungsmodus (#820): Für jede Mappe, die die Person mit ihren Alltagsrechten (`alltag`, ohne Modus)
   * nicht lesen dürfte, steht in der Historie „im Verwaltungsmodus“ mit `was` – nicht löschbar. Dieselbe Mappe kurz
   * hintereinander (`MODUSSPUR_MINUTEN`) nur einmal je Person und Art. Liefert die betroffenen Mappen.
   */
  async vermerkeVerwaltungsmodus(alltag: { id: string; rolle: string; name?: string; email?: string }, ids: string[], was: Modusspur): Promise<Set<string>> {
    const z = await this.zugriff({ id: alltag.id, rolle: 'mitglied' });
    const lesbar = await this.lesbare(z, ids);
    const fremd = [...new Set(ids)].filter((id) => !lesbar.has(id));
    if (!fremd.length) return new Set();
    // „Kurz hintereinander nur einmal“ (#744): Merker in der Datenbank – wer ihn anlegt, schreibt den Eintrag, auch wenn
    // dieselbe Person gleichzeitig über zwei Prozesse kommt.
    const belegt = await this.kurzzustand.belegeAlle(MODUSSPUR, fremd.map((id) => `${alltag.id}|${id}|${was}`), MODUSSPUR_MINUTEN * 60_000);
    const neu = fremd.filter((id) => belegt.has(`${alltag.id}|${id}|${was}`));
    if (neu.length) {
      const titel = new Map((await this.repo.holeMappen(neu)).map((m) => [m.id, m.titel ?? '']));
      await this.repo.historieSchreibe(neu.map((id) => ({ mappeId: id, benutzerId: alltag.id, art: 'verwaltungsmodus' as const, daten: { was, titel: titel.get(id) ?? '' } })));
      protokoll.modul('ablage').warn('Im Verwaltungsmodus: fremde Mappe', { was, anzahl: neu.length, von: alltag.email ?? alltag.id, imVerwaltungsmodus: true });
    }
    return new Set(fremd);
  }

  /** Werkbank (#820): „Im Verwaltungsmodus angesehen“ – Person, Mappe, Zeit; neueste zuerst. */
  async imVerwaltungsmodus(max = 500) {
    const liste = await this.repo.historieArt('verwaltungsmodus', max);
    // Typ für den Link in die Ablage; endgültig gelöschte Mappen bleiben in der Liste, nur ohne Link.
    const typ = new Map((await this.repo.holeMappen([...new Set(liste.map((h) => h.mappeId))])).map((m) => [m.id, m.typId]));
    return liste.map((h) => ({
      id: h.id, zeit: h.zeit, mappeId: h.mappeId, typId: typ.get(h.mappeId) ?? null, benutzerId: h.benutzerId, was: String(h.daten.was ?? 'angesehen'), titel: String(h.daten.titel ?? ''),
    }));
  }

  /**
   * Aus dem früheren Typ E-Mail (#58) wird Post (#192). Die Migration 031 hat Kennung, Schlüssel und
   * Werte umgestellt; hier folgt die Definition: Systemfelder mit ihrer festen Form (z. B. „Zugeordnet zu“
   * mehrfach), neue Felder, Name und Register, solange der Administrator sie nicht geändert hat.
   * Läuft bei jedem Start und ändert nur, was noch nicht passt.
   */
  private async wandleZuPost(mappentyp: Mappentyp, rolleId: string, benutzerId: string): Promise<Mappentyp> {
    const soll = systemfelder('post', rolleId, benutzerId);
    // Alte Standardbezeichnungen weichen den neuen; eigene des Administrators bleiben.
    const alteNamen: Record<string, string[]> = { an: ['An'], bezug: ['Bezug'] };
    const alteHilfen = [t('meldungen.dienst.wer-die-e-mail'), t('meldungen.dienst.die-mappe-aus-der')];
    let geaendert = false;
    const felder = mappentyp.felder.map((f) => {
      const s = soll.find((x) => x.key === f.key);
      if (!s || !f.system) return f;
      const label = alteNamen[f.key]?.includes(f.label) ? s.label : f.label || s.label;
      const hilfe = !f.hilfe || alteHilfen.includes(f.hilfe) ? s.hilfe : f.hilfe;
      const neu: Feld = { ...s, label, ...(hilfe ? { hilfe } : {}), ...mitSystemBeschriftung({ ...f, label, hilfe }, s) };
      if (!hilfe) delete neu.hilfe;
      if (JSON.stringify(neu) !== JSON.stringify(f)) geaendert = true;
      return neu;
    });
    const altName = mappentyp.name === 'E-Mail' || mappentyp.name === 'E-Mail (System)';
    const register = mappentyp.register.map((r) => (r.art === 'dokumente' && r.name === 'Anhänge' ? { ...r, name: 'Dokumente' } : r));
    const altListe = JSON.stringify(standardliste(mappentyp).spalten) === JSON.stringify(['datum', 'an', 'bezug']);
    if (geaendert || altName || JSON.stringify(register) !== JSON.stringify(mappentyp.register) || altListe || mappentyp.beschreibung === 'Aus Ablago verschickte E-Mails mit Anhängen') {
      const typen = await this.repo.listeTypen();
      const name = altName ? (typen.some((x) => x.id !== mappentyp.id && x.name.trim().toLowerCase() === 'post') ? t('meldungen.dienst.post-system') : 'Post') : mappentyp.name;
      const beschreibung = mappentyp.beschreibung === 'Aus Ablago verschickte E-Mails mit Anhängen' ? POST_BESCHREIBUNG : mappentyp.beschreibung;
      const trefferlisten = altListe ? trefferlistenVon(mappentyp).map((l) => (l.standard ? { ...l, spalten: POST_SPALTEN } : l)) : trefferlistenVon(mappentyp);
      mappentyp = await this.repo.aendereTyp(mappentyp.id, { ...mappentyp, name, beschreibung, felder, register, trefferlisten, trefferliste: undefined });
      protokoll.modul('werkbank').info('Systemmappentyp Post nachgezogen', { typ: mappentyp.name });
    }
    // Neue Systemfelder (Stand, Kanal, Richtung, Für) ergänzen – wie bei jedem Systemtyp.
    return this.ergaenzeSystemfelder(mappentyp, rolleId, benutzerId);
  }

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
    const { post: typ } = await this.sichereSystem();
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

  /**
   * Neue Systemfelder einer Version (z. B. Abwesenheit, #78) in einen vorhandenen Systemtyp aufnehmen.
   * Hat der Administrator schon ein eigenes Feld mit diesem Schlüssel, wird seines umbenannt
   * (z. B. vertreter → vertreter_alt) – samt Werten, Register, Trefferlisten und Titel-Vorlage.
   */
  private async ergaenzeSystemfelder(t: Mappentyp, rolleId: string, benutzerId = t.id): Promise<Mappentyp> {
    if (!t.system) return t;
    const soll = systemfelder(t.system, rolleId, benutzerId);
    const fehlen = soll.filter((x) => !t.felder.some((f) => f.key === x.key && f.system));
    if (!fehlen.length) return t;
    const felder = [...t.felder];
    const register = structuredClone(t.register);
    let trefferlisten = trefferlistenVon(t);
    let titelVorlage = t.titelVorlage;
    const umbenannt: Array<[string, string]> = [];
    for (const x of fehlen) {
      const i = felder.findIndex((f) => f.key === x.key);
      if (i >= 0) {
        let neu = `${x.key}_alt`;
        for (let n = 2; felder.some((f) => f.key === neu); n++) neu = `${x.key}_alt${n}`;
        felder[i] = { ...felder[i], key: neu };
        for (const r of register) if (r.felder) r.felder = r.felder.map((k) => (k === x.key ? neu : k));
        trefferlisten = trefferlisten.map((l) => ({ ...l, spalten: l.spalten.map((k) => (k === x.key ? neu : k)) }));
        titelVorlage = titelVorlage.replace(new RegExp(`\\{${x.key}(?=[|}])`, 'g'), `{${neu}`);
        umbenannt.push([x.key, neu]);
      }
      felder.push(x);
      const allgemein = register.find((r) => r.art === 'felder');
      if (allgemein) allgemein.felder = [...(allgemein.felder ?? []), x.key];
    }
    const neuTyp = await this.repo.aendereTyp(t.id, { ...t, felder, register, trefferlisten, trefferliste: undefined, titelVorlage });
    if (umbenannt.length) {
      for (const m of await this.repo.listeMappen(t.id)) {
        const werte = { ...m.werte };
        for (const [alt, neu] of umbenannt) if (alt in werte) { werte[neu] = werte[alt]; delete werte[alt]; }
        await this.repo.aendereMappe(m.id, werte, [], null, { basis: m.werte, verweise: (w) => verweiseVon(neuTyp, w) });
      }
      protokoll.modul('werkbank').warn('Eigene Felder wegen neuer Systemfelder umbenannt', { typ: t.name, felder: umbenannt.map(([a, b]) => `${a} → ${b}`).join(', ') });
    }
    protokoll.modul('werkbank').info('Systemfelder ergänzt', { typ: t.name, felder: fehlen.map((f) => f.label).join(', ') });
    return neuTyp;
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
  async spiegleBenutzer(b: Benutzer, von: string | null = null) {
    // Liegt die Mappe im Papierkorb, bleibt sie dort (der Benutzer ist bis zum Leeren deaktiviert).
    if (await this.repo.holeAusPapierkorb(b.id)) return;
    const { benutzer: typ, systemrollen } = await this.sichereSystem();
    const alt = await this.repo.holeMappe(b.id);
    // Neuer Benutzer (#506): Vorgabe „Favoriten benachrichtigen“ aus der Werkbank – nur, wenn sie aus ist.
    if (!alt && b.art !== 'dienst' && !(await this.favoritenFreigabe()).vorgabe) await this.konten?.setzeEinstellung?.(b.id, 'favoriten_benachrichtigen', false);
    // #719: Der erste Mensch ohne Admin-Rechte bekommt die Aufgaben ohne Empfänger, bis die Werkbank anders wählt.
    if (!alt) await this.vorgabeAufgabenEmpfaenger(b);
    const system = new Set(systemrollen.values());
    const weitere = alt ? alsListe(alt.werte.rollen).filter((r) => !system.has(r)) : [];
    const ab = b.abwesenheit;
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
    const { rolle, systemrollen, kontorollen } = await this.sichereSystem();
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
    const { benutzer: typ, systemrollen } = await this.sichereSystem();
    const m = await this.repo.holeMappe(benutzerId);
    if (!m || m.typId !== typ.id) throw new Fachfehler(404, t('meldungen.dienst.diesen-benutzer-gibt-es'));
    const system = new Set(systemrollen.values());
    const behalten = alsListe(m.werte.rollen).filter((r) => system.has(r));
    await this.schreibeSystemMappe(typ, benutzerId, { rollen: [...behalten, ...ids] }, von);
  }

  /** Alle Rollen für die Auswahl in der Benutzerverwaltung; Systemrollen zuerst. */
  async listeRollen(mitKonten = false) {
    const { rolle, kontorollen } = await this.sichereSystem();
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
    const { benutzer, kontorollen } = await this.sichereSystem();
    const konto = new Set(kontorollen.values());
    const [typen, sichten, rollen, leute] = await Promise.all([this.repo.listeTypen(), this.repo.listeSichten(), this.listeRollen(), this.repo.listeMappen(benutzer.id)]);
    return {
      typen, sichten: sichten.map((x) => ({ id: x.id, name: x.name, typen: x.typen })), rollen: rollen.map((r) => ({ id: r.id, name: r.name })),
      benutzer: leute.filter((m) => !alsListe(m.werte.rollen).some((r) => konto.has(r)) && !this.paketKonten.has(m.id)).map((m) => ({ id: m.id, name: m.titel || String(m.werte.name ?? ''), aktiv: m.werte.aktiv !== false })),
    };
  }

  /** Aktive Benutzer, die eine Rolle haben (Empfänger „Rolle“ einer Automatisierung). */
  async mitgliederDerRolle(rolleId: string): Promise<string[]> {
    const { benutzer } = await this.sichereSystem();
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
    const { benutzer } = await this.sichereSystem();
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

  /** Weitere (nicht System-)Rollen je Benutzer. */
  async weitereRollen(): Promise<Map<string, string[]>> {
    const { benutzer, systemrollen } = await this.sichereSystem();
    const system = new Set(systemrollen.values());
    return new Map((await this.repo.listeMappen(benutzer.id)).map((m) => [m.id, alsListe(m.werte.rollen).filter((r) => !system.has(r))]));
  }

  /** Benutzer werden deaktiviert statt gelöscht; gelöscht wird nur, worauf nichts verweist. */
  async entferneBenutzerMappe(id: string) {
    const m = await this.repo.holeMappe(id);
    if (!m) return;
    const fremd: Rueckverweis[] = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
    if (fremd.length) {
      throw new Fachfehler(409, t('meldungen.dienst.auf-diesen-benutzer-verweisen', { anzahl: fremd.length }), { rueckverweise: fremd });
    }
    await this.loescheMappeIntern(id, await this.repo.holeTyp(m.typId));
  }

  benutzerspiegel(): Benutzerspiegel {
    return {
      aktualisiere: (b, von) => this.spiegleBenutzer(b, von ?? null),
      offeneAufgaben: async (id) => (await this.repo.offeneAufgaben({ benutzerId: id })).filter((a) => a.empfaengerId === id).length,
      aufgabenUebergeben: (id, an, von) => this.aufgabenUebergeben(id, an, von),
      abwesenheitGeaendert: (b, alt, von, wegen) => this.abwesenheitGeaendert(b, alt, von, wegen),
      entferne: (id) => this.entferneBenutzerMappe(id),
      papierkorbAn: async () => (await this.papierkorbTage()) > 0,
      inPapierkorb: async (id, von) => {
        const m = await this.repo.holeMappe(id);
        if (!m) return;
        const fremd = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
        if (fremd.length) throw new Fachfehler(409, t('meldungen.dienst.auf-diesen-benutzer-verweisen', { anzahl: fremd.length }), { rueckverweise: fremd });
        await this.repo.legeInPapierkorb(id, von);
        await this.notiere(id, von, 'papierkorb');
      },
    };
  }

  /* ---------- Papierkorb (#43) ---------- */

  /** Aufbewahrung in Tagen; 0 = kein Papierkorb (Löschen ist sofort endgültig). */
  async papierkorbTage(): Promise<number> {
    if (!this.einstellungen) return 0;
    const e = (await this.einstellungen.lies('papierkorb')) as { tage?: number } | null;
    return typeof e?.tage === 'number' ? e.tage : PAPIERKORB_STANDARD_TAGE;
  }

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

  /** Wer und warum. Ohne Benutzer: „DMS“ (automatisch). */
  private async loeschKontext(von: string | null, anlass: Anlass = {}): Promise<LoeschKontext> {
    const a = liesAnlass({ grund: anlass.grund, text: anlass.text });
    const ausloeser: Ausloeser = anlass.ausloeser ?? (von ? 'benutzer' : 'automatisch');
    return { vonId: von, von: von ? await this.name(von) : 'Ablago', ausloeser, grund: a.grund ?? null, grundText: a.text ?? '' };
  }

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

  /** Einträge für Mappen und ihre Dokumente. */
  private mappenEintraege(liste: ProtokollMappe[], x: { schritt: LoeschEintrag['schritt']; weg: Loeschweg; vorgang?: string; startId?: string; verweise?: Record<string, number> }): ProtokollTeil[] {
    return liste.flatMap((m) => {
      const nummer = nummerVon(m.typ, m.werte);
      const vorgang = x.vorgang ?? m.vorgang ?? null;
      const gemeinsam = { mappeId: m.id, typId: m.typId, typ: m.typ?.name ?? '', nummer, vorgang, startId: vorgang ? (x.startId ?? (m.id === vorgang ? m.id : null)) : null, schritt: x.schritt, weg: x.weg };
      const dokumente = new Set(m.dokumente.map((d) => d.dokumentId)).size;
      return [
        { ...gemeinsam, art: 'mappe' as const, dokumentId: null, archivnummer: null, version: null, sha256: null, groesse: null, mime: null, seiten: null,
          anzahl: { dokumente, versionen: m.dokumente.length - dokumente, notizen: m.notizen, verweise: x.verweise?.[m.id] ?? 0 } },
        ...this.dokEintraege(m.dokumente, gemeinsam),
      ];
    });
  }

  private dokEintraege(liste: LoeschDokument[], x: { mappeId: string; typId: string | null; typ: string; nummer: string | null; vorgang: string | null; startId: string | null; schritt: LoeschEintrag['schritt']; weg: Loeschweg }): ProtokollTeil[] {
    return liste.map((d) => ({ ...x, art: 'dokument' as const, dokumentId: d.dokumentId, archivnummer: d.archivnummer, version: d.version, sha256: d.sha256, groesse: d.groesse, mime: d.mime, seiten: d.seiten, anzahl: null }));
  }

  private wiederEintrag(e: PapierkorbEintrag, typ: Mappentyp | undefined, vorgang: string | null): ProtokollTeil {
    return { art: 'mappe', schritt: 'wiederhergestellt', weg: vorgang ? 'verknuepft' : 'einzeln', mappeId: e.id, typId: e.typId, typ: typ?.name ?? '', nummer: nummerVon(typ, e.werte),
      archivnummer: null, dokumentId: null, version: null, sha256: null, groesse: null, mime: null, seiten: null, anzahl: null, vorgang, startId: vorgang && e.id === vorgang ? e.id : null };
  }

  /** Letzter Eintrag „in den Papierkorb“ je Mappen- bzw. Dokument-Id (für Grund, Typ und Nummer beim endgültigen Löschen). */
  private async letzteSchritte(ids: string[]): Promise<Map<string, LoeschEintrag>> {
    const r = new Map<string, LoeschEintrag>();
    for (let i = 0; i < ids.length; i += 500) {
      const teil = ids.slice(i, i + 500);
      const { eintraege } = await this.repo.loeschprotokoll({ ids: teil, schritt: 'papierkorb', max: LOESCH_MAX * 5 });
      // Neueste zuerst: der erste Treffer je Id zählt.
      for (const e of eintraege) { const k = e.art === 'dokument' ? e.dokumentId! : e.mappeId; if (!r.has(k)) r.set(k, e); }
    }
    return r;
  }

  /** Typ, Nummer und Vorgang der Mappe eines Dokuments – lebend, im Papierkorb oder aus dem Protokoll. */
  private async mappenInfo(mappeIds: string[], frueher: Map<string, LoeschEintrag>) {
    const ids = [...new Set(mappeIds)];
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const lebend = new Map((await this.repo.holeMappen(ids)).map((m) => [m.id, m] as const));
    const korb = new Map((await this.repo.papierkorbInhalt(ids.filter((id) => !lebend.has(id)))).map((k) => [k.id, k] as const));
    return (mappeId: string, dokumentId: string) => {
      const m = lebend.get(mappeId); const k = korb.get(mappeId); const f = frueher.get(dokumentId);
      const typId = m?.typId ?? k?.typId ?? f?.typId ?? null;
      const typ = typId ? typen.get(typId) : undefined;
      return { mappeId, typId, typ: typ?.name ?? f?.typ ?? '', nummer: m ? nummerVon(typ, m.werte) : k ? nummerVon(typ, k.werte) : f?.nummer ?? null, vorgang: k?.vorgang ?? f?.vorgang ?? null, startId: f?.startId ?? null };
    };
  }

  /**
   * Einträge schreiben. `nachGrund`: Grund und Text vom Schritt „in den Papierkorb“ übernehmen, wenn dieser
   * Schritt selbst keinen hat (endgültig löschen, Ablauf). Ein Fehler hier macht das Löschen nicht rückgängig,
   * steht aber im Protokoll.
   */
  private async protokolliere(teile: ProtokollTeil[], k: LoeschKontext, nachGrund = false) {
    if (!teile.length) return;
    try {
      const frueher = nachGrund && !k.grund ? await this.letzteSchritte([...new Set(teile.map((t) => (t.art === 'dokument' ? t.dokumentId! : t.mappeId)))]) : new Map<string, LoeschEintrag>();
      const zeit = new Date().toISOString();
      await this.repo.loeschprotokollSchreibe(teile.map((t) => {
        const f = frueher.get(t.art === 'dokument' ? t.dokumentId! : t.mappeId) ?? frueher.get(t.mappeId);
        return { ...t, id: randomUUID(), zeit, vonId: k.vonId, von: k.von, ausloeser: k.ausloeser, grund: k.grund ?? f?.grund ?? null, grundText: k.grund ? k.grundText : (f?.grundText ?? k.grundText),
          vorgang: t.vorgang ?? f?.vorgang ?? null, startId: t.startId ?? f?.startId ?? null };
      }));
    } catch (e) {
      protokoll.modul('datenschutz').error('Löschprotokoll nicht geschrieben', { fehler: (e as Error).message, eintraege: teile.length });
    }
  }

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

  async postTyp() { return (await this.sichereSystem()).post; }

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

  private async liesGanz(sha256: string): Promise<Buffer> {
    const x = await this.dateien.lies(sha256);
    return Buffer.isBuffer(x) ? x : Buffer.concat(await x.toArray() as Buffer[]);
  }

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
    const korb = (await this.papierkorbTage()) > 0;
    if (korb) await this.repo.legeDokumentInPapierkorb(id, benutzerId);
    else await this.repo.loescheDokument(id);
    // Löschprotokoll (#470)
    const info = (await this.mappenInfo([d.mappeId], new Map()))(d.mappeId, id);
    await this.protokolliere(this.dokEintraege([dokInfo(d), ...aeltere.map(versionInfo)], { ...info, schritt: korb ? 'papierkorb' : 'endgueltig', weg: anlass.weg ?? 'dokument' }),
      await this.loeschKontext(benutzerId, anlass));
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
    if (!e.automatisch || ein.groesse < e.abMb * 1024 * 1024) return null;
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
    const docs = await this.repo.grossePdfs(Math.round(ab * 1024 * 1024), GROSSE_MAX);
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

  /** Der Nummernkreis der Archivnummern; entsteht beim ersten Gebrauch („A-000001“), Muster in der Werkbank änderbar. */
  async archivKreis(): Promise<Nummernkreis> {
    const da = (await this.repo.listeNummernkreise()).find((k) => k.schluessel === ARCHIV_KREIS);
    return da ?? this.repo.speichereNummernkreis({ schluessel: ARCHIV_KREIS, name: 'Archivnummer', muster: 'A-{zaehler:6}', start: 1 });
  }

  /** Archivnummer am Dokument setzen oder entfernen (leer); eindeutig je Haushalt. */
  async setzeArchivnummer(id: string, eingabe: unknown, von: string | null): Promise<Dokument> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const nr = archivnummerAus(eingabe);
    if (nr && nr.length > 40) throw new Fachfehler(422, t('meldungen.dienst.die-archivnummer-ist-zu'));
    if (nr && /\s/.test(nr)) throw new Fachfehler(422, t('meldungen.dienst.die-archivnummer-darf-keine'));
    if ((d.archivnummer ?? null) === nr) return d;
    if (!(await this.repo.setzeArchivnummer(id, nr))) {
      throw new Fachfehler(409, t('meldungen.dienst.die-archivnummer-hat-schon', { nr: String(nr) }));
    }
    await this.notiere(d.mappeId, von, 'archivnummer', { dokument: d.name, text: nr ? `${d.name}: ${nr}` : `${d.name}: entfernt`, alt: d.archivnummer ?? null, neu: nr });
    protokoll.modul('dokumente').info(nr ? 'Archivnummer gesetzt' : 'Archivnummer entfernt', { id, nr, vorher: d.archivnummer ?? undefined });
    return (await this.repo.holeDokument(id))!;
  }

  /** Dokument zu einer Archivnummer (auch mit Präfix aus dem Barcode); nur, wenn die Mappe lesbar ist. */
  async findeArchivnummer(eingabe: unknown, z?: Zugriff) {
    const nr = archivnummerAus(eingabe);
    const d = nr ? await this.repo.findeArchivnummer(nr) : undefined;
    const m = d ? await this.repo.holeMappe(d.mappeId) : undefined;
    if (!d || !m || !(await this.lesbare(z, [m.id])).has(m.id)) throw new Fachfehler(404, t('meldungen.dienst.zur-archivnummer-gibt-es', { wert: nr ?? '' }));
    return { dokument: d, mappeId: m.id, typId: m.typId, titel: m.titel ?? '' };
  }

  /**
   * Aufkleberbogen (#345): `anzahl` neue Nummern aus dem Kreis „Archivnummer“ ziehen – gedruckte Nummern
   * gelten als vergeben – und als PDF für das gewählte Etikettenformat ab Feld `start`.
   */
  async archivAufkleber(eingabe: unknown, von: string) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const anzahl = Number(e.anzahl ?? 0);
    const etikett = String(e.etikett ?? '48x25') as Etikett;
    const start = Number(e.start ?? 1);
    if (!(etikett in ETIKETTEN)) throw new Fachfehler(422, t('meldungen.dienst.unbekanntes-etikettenformat'));
    const f = ETIKETTEN[etikett];
    if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 500) throw new Fachfehler(422, t('meldungen.dienst.bitte-1-bis-500'));
    if (!Number.isInteger(start) || start < 1 || start > f.spalten * f.zeilen) throw new Fachfehler(422, t('meldungen.dienst.das-startfeld-muss-zwischen', { wert: f.spalten * f.zeilen }));
    await this.archivKreis();
    const nummern = await this.repo.zieheNummern(ARCHIV_KREIS, anzahl, new Date());
    const pdf = await aufkleberPdf(nummern, etikett, start, ARCHIV_PRAEFIX);
    protokoll.modul('werkbank').info('Aufkleber mit Archivnummern erzeugt', { von, anzahl, erste: nummern[0], letzte: nummern[nummern.length - 1], etikett });
    return { pdf, erste: nummern[0], letzte: nummern[nummern.length - 1] };
  }

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
    const sys = await this.sichereSystem();
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
    const sys = await this.sichereSystem();
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
    const sys = await this.sichereSystem();
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
    const sys = await this.sichereSystem();
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
    const post = (await this.sichereSystem()).post;
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
    protokoll.modul('datenschutz').info('Auskunft erstellt', { mappeId: d.start.id, mappen: n.mappen, dokumente: n.dokumente, notizen: n.notizen, ohneNotizen: n.ohneNotizen, verschluesselt: !!d.passwort, mb: Math.round(info.bytes / 1024 ** 2), von: von.email });
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
    await this.notiere(stand.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.auskunft-per-e-mail', { an: an.join(', '), max: Math.max(1, Math.round(stand.bytes / 1024)) }), zustellung: 'email', an, betreff, auskunft: stand.id, bytes: stand.bytes });
    protokoll.modul('datenschutz').info('Auskunft per E-Mail gesendet', { mappeId: stand.mappeId, empfaenger: an.length, mb: Math.round(stand.bytes / 1024 ** 2), von: ich.email });
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

  private async pruefeArchivDokument(mappeId: string, was: string) {
    const m = await this.repo.holeMappe(mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const bis = m ? aufbewahrenBis(typ?.archiv, m) : null;
    if (inFrist(bis)) throw new Fachfehler(409, t('meldungen.dienst.aufbewahrungspflicht-bis-dokumente', { datumText: datumText(bis!), was }), { aufbewahrenBis: bis });
  }

  /** Vorschau beim Einschalten: wie viele Mappen betroffen, wie viele schon „darf weg“. */
  async archivVorschau(typId: string, e: unknown) {
    const typ = istUuid(typId) ? await this.repo.holeTyp(typId) : undefined;
    const archiv = bereinigeTyp({ felder: typ?.felder ?? [], archiv: e }).archiv;
    if (!archiv) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-frist-von', { JAHRE_MAX }));
    const mappen = typ ? await this.repo.listeMappen(typ.id) : [];
    return { mappen: mappen.length, darfWeg: mappen.filter((m) => !inFrist(aufbewahrenBis(archiv, m))).length };
  }

  /** „Darf weg“: Mappen in Typen mit Archivmodus, deren Frist abgelaufen ist. Gelöscht wird nichts automatisch. */
  async darfWeg() {
    const erg: Array<{ id: string; typId: string; typ: string; titel: string; aufbewahrenBis: string }> = [];
    for (const t of (await this.repo.listeTypen()).filter((x) => x.archiv)) {
      for (const m of await this.repo.listeMappen(t.id)) {
        const bis = aufbewahrenBis(t.archiv, m);
        if (bis && !inFrist(bis)) erg.push({ id: m.id, typId: t.id, typ: t.name, titel: m.titel ?? '', aufbewahrenBis: bis });
      }
    }
    return erg.sort((a, b) => a.aufbewahrenBis.localeCompare(b.aufbewahrenBis) || a.titel.localeCompare(b.titel, 'de'));
  }

  /** Integrität (#212): jede Datei gegen ihren Prüfwert; als Auftrag im Hintergrund. */
  pruefeDateien(von: string) {
    return this.auftraege.starte('dateien-pruefen', 'Alle Dateien prüfen', async (fortschritt) => {
      const alle = await this.repo.alleDateien();
      const shas = [...new Set(alle.map((x) => x.sha256))];
      const abweichungen: Array<{ sha256: string; grund: string; dokumente: typeof alle }> = [];
      const fehlend: string[] = [];
      for (const [i, sha] of shas.entries()) {
        let grund: string | null = null;
        try {
          const s = await this.dateien.lies(sha);
          const h = createHash('sha256');
          if (Buffer.isBuffer(s)) h.update(s); else for await (const teil of s) h.update(teil as Buffer);
          if (h.digest('hex') !== sha) grund = t('meldungen.dienst.inhalt-veraendert');
        } catch { grund = t('meldungen.dienst.datei-fehlt'); fehlend.push(sha); }
        if (grund) abweichungen.push({ sha256: sha, grund, dokumente: alle.filter((x) => x.sha256 === sha) });
        fortschritt(i + 1, shas.length);
      }
      // Hinweis der Übersicht (#877): Die Prüfung kennt jetzt alle fehlenden Dateien.
      await this.schreibeFehlendeDateien(fehlend).catch(() => {});
      const log = protokoll.modul('werkbank');
      if (abweichungen.length) log.error('Dateien prüfen: Abweichungen gefunden', { von, dateien: shas.length, abweichungen: abweichungen.length, erste: abweichungen[0].dokumente[0]?.name });
      else log.info('Dateien prüfen: alle in Ordnung', { von, dateien: shas.length });
      return { dateien: shas.length, abweichungen };
    }, [{ key: 'dateien', name: 'Dateien prüfen', einheit: 'Dateien' }]);
  }

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
      if (weg.length) await this.protokolliere(this.dokEintraege(weg.map(versionInfo), { ...(await this.mappenInfo([neu.mappeId], new Map()))(neu.mappeId, neu.id), schritt: 'endgueltig', weg: 'version' }),
        await this.loeschKontext(benutzerId, { ausloeser: 'automatisch' }));
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
