import type { Aufgabe, Ausschnitt, FallEnde, FallOhneLeserecht, Dokument, DokumentVersion, Herkunft, Historienart, Historieneintrag, Mappe, Notiz, MappenBezug, Mappentyp, MappentypDaten, OcrStandArt, Systemtyp, Werte } from '../../shared/src/model';
import type { Klausel, Sicht, SichtDaten } from '../../shared/src/sichten';
import type { Ausdruck, Lesefilter, Regelwerk } from '../../shared/src/rechte';
import type { Erinnerung } from '../../shared/src/fristen';
import type { Nummernkreis } from '../../shared/src/nummernkreis';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import type { SprachBeschriftung, Sprachtexte } from '../../shared/src/sprachpaket';
import type { AuskunftLink } from '../../shared/src/auskunft';
import type { PaketHinweis } from '../../shared/src/berechnet';
import type { Fundstelle } from './geheimnisse';
import type { LoeschDokument, LoeschEintrag, LoeschFilter } from '../../shared/src/loeschprotokoll';
import type { Varianten } from '../../shared/src/suche';
import type { Seitensprache } from '../../shared/src/seitensprachen';
import { t } from './sprache';

/** Seitenweises Lesen der Historie (#800). */
export interface HistorieAbfrage { arten?: readonly string[]; max?: number; vor?: number }

export interface Verweis { feldKey: string; zielId: string }
/** Texte und Beschriftungen eines Sprachpakets (#731). */
export interface SprachpaketDaten { kennung: string; texte: Sprachtexte; beschriftungen: Record<string, SprachBeschriftung> }

/**
 * Gleichzeitig bearbeiten (#609): Mappe feldweise schreiben. `basis` sind die Werte, auf denen die neuen
 * beruhen (so wie sie gelesen wurden). Geschrieben wird nur, was sich gegenüber `basis` ändert; alle anderen
 * Felder bleiben, wie sie gerade in der Datenbank stehen – auch wenn sie inzwischen jemand anderes geändert hat.
 * `verweise` berechnet die Verweise aus dem Ergebnis. Mit `stand` (Zeitpunkt „zuletzt geändert“ als ISO-Text)
 * schreibt die Datenbank nur, wenn die Mappe noch genau diesen Stand hat, sonst kommt `StandVeraltet`.
 */
export interface FeldweiseSchreiben {
  basis: Werte; verweise: (werte: Werte) => Verweis[]; stand?: string;
  /**
   * Titel zu den Werten, die tatsächlich geschrieben werden (#743): im selben UPDATE gesetzt. undefined = nicht
   * bekannt (z. B. ein Verweis, dessen Titel nicht vorab gelesen wurde) – dann bleibt der Titel, wie er ist.
   */
  titel?: (werte: Werte) => string | undefined;
}

/** Die Mappe hat sich zwischen Lesen und Schreiben geändert (#609) – neu lesen und noch einmal versuchen. */
export class StandVeraltet extends Error {
  constructor() { super(t('meldungen.repo.die-mappe-hat-sich')); }
}

/**
 * Gleichzeitig bearbeitet (#917): Mappentyp oder Ansicht hat seit dem erwarteten Stand (`geaendert`) jemand anderes
 * gespeichert. Nichts wurde geändert; der Dienst macht daraus eine 409.
 */
export class KonfigurationVeraltet extends Error {
  constructor() { super('Stand veraltet'); this.name = 'KonfigurationVeraltet'; }
}

/** Neue Werte feldweise auf den aktuellen Stand legen (#609): nur Felder, die sich gegenüber `basis` ändern. */
export function feldweise(aktuell: Werte, basis: Werte, werte: Werte): Werte {
  const r: Werte = { ...aktuell };
  for (const k of new Set([...Object.keys(basis), ...Object.keys(werte)])) {
    if (JSON.stringify(basis[k] ?? null) === JSON.stringify(werte[k] ?? null)) continue;
    if (k in werte) r[k] = werte[k]; else delete r[k];
  }
  return r;
}
/** Abruf-Link (#455) mit den Hashes von Schlüssel und Abrufcode – verlässt den Server nie. */
export interface AuskunftLinkIntern extends AuskunftLink { schluessel: string; code: string }
/** Ein gespeicherter Verweis mit beiden Enden (#396). */
export interface Kante { quelleId: string; feldKey: string; zielId: string }
/** Sortierung, wie sie das Repo braucht: Art der Spalte (für den richtigen Vergleich) und ggf. Feldschlüssel. */
export interface SortierungIntern {
  /** Prozent sortiert wie Zahl; Zeitraum nach seiner Länge in Tagen (#1035). */
  art: 'titel' | 'typ' | 'erstellt' | 'geaendert' | 'erstelltVon' | 'geaendertVon' | 'text' | 'zahl' | 'betrag' | 'zeitraum' | 'datum' | 'janein';
  key?: string;
  absteigend: boolean;
}
export interface SeitenAnfrage {
  /** Mappen dieses Typs … */
  typId?: string;
  /** … oder der Eingang dieses Benutzers (nicht passende eigene Mappen; ohne Ersteller beim Admin). */
  eingang?: { benutzerId: string; admin: boolean };
  /** … oder die Favoriten dieses Benutzers (#62). */
  favoriten?: { benutzerId: string };
  /** … oder die Mappen einer Sicht (#38): ODER der Klauseln, Bedingungen aufgelöst. */
  klauseln?: Klausel[];
  /** Suche in Titel und Werten. */
  suche?: string;
  /** Suche auch im Volltext der Dokumente (deutsche Volltextsuche, #45). */
  volltext?: boolean;
  /** Suche auch in Notizen (#55). */
  notizen?: boolean;
  /** Erweiterte Suche (#199): der Begriff muss in Dokumenten und/oder Notizen stehen – UND mit allem anderen. */
  textfilter?: { text: string; dokumente: boolean; notizen: boolean };
  /**
   * Unscharfe Suche (#356): weitere Schreibweisen je Begriff (Schlüssel `falte(begriff)`) – gleichbedeutende Wörter,
   * ohne Bindestrich, bei keinem genauen Treffer ähnliche Wörter. Gilt für `suche` und `textfilter`.
   */
  varianten?: Varianten;
  /**
   * Ähnliche Schreibweisen aus dem Wörterverzeichnis (#356, Tippfehler) – wie `varianten`, aber nur für ganze Wörter,
   * nicht für die Suche nach Wortteilen im Volltext (die müsste dafür alle Texte lesen).
   */
  aehnlich?: Varianten;
  /**
   * Teile (#1031): Ids von Mappen, die als Treffer der Suche bzw. des Textfilters zählen, ohne den Begriff selbst zu
   * enthalten – übergeordnete Mappen, in deren Teilen er steht (die der Dienst vorher mit demselben Lesefilter gesucht
   * hat). Alle anderen Bedingungen und der Lesefilter gelten für sie wie immer. Nur mit `suche` bzw. `textfilter`.
   */
  auchIds?: string[];
  /** Reihenfolge; ohne: nach Titel. */
  sortierung?: SortierungIntern;
  /** Berechtigungen (#124): nur lesbare Mappen; fehlt/null = alle. */
  lesen?: Lesefilter | null;
  von: number;
  anzahl: number;
  /**
   * Gesamtzahl vom ersten Blatt (#740): Ohne Suche zählt das Repo beim Blättern (von > 0) nicht noch einmal, sondern
   * gibt diese Zahl zurück (mindestens so viele, wie bis hier geliefert sind). Fehlt sie, wird gezählt.
   */
  gesamt?: number;
  /**
   * Zahl der Treffer ist schon bekannt (#918, Zwischenspeicher bei gleichem Mappenstand): Das Repo zählt nicht, auch
   * nicht beim ersten Blatt oder mit Suche, und gibt diese Zahl zurück.
   */
  zahl?: number;
}
/** Mappe als Kandidat für Termine (#918): nur, was die Termine brauchen. */
export interface FristKandidat { id: string; typId: string; titel?: string | null; werte: Werte }
/** Gruppe gleichbedeutender Wörter (#356); quelle „werkbank“ oder die Id eines Pakets. */
export interface Synonymgruppe { id: string; woerter: string[]; quelle: string }
export interface NeueMappe {
  id: string; typId: string; werte: Werte; verweise: Verweis[]; titel: string; benutzerId: string | null; demo: boolean;
}

/** Ergebnis der Texterkennung für ein Dokument. */
/** Einträge je Lauf beim Einarbeiten ins Wörterverzeichnis (#575). */
export const WOERTER_JE_LAUF = 20_000;

export interface OcrErgebnis {
  stand: OcrStandArt; text?: string | null; info?: string | null; seiten?: number | null;
  /** Sprache des Texts (#400, Tesseract-Kennung); undefined = unverändert lassen, null = keine (Deutsch). */
  sprache?: string | null;
  /**
   * Mehrere Sprachen (#579). Mit `text` gilt: fehlt es, sind weitere Sprachen und Seitensprachen danach leer (ein
   * neuer Text hat neue Seiten); ohne `text` bleiben sie unverändert.
   */
  weitere?: string[] | null;
  seitensprachen?: Seitensprache[] | null;
}
export type OcrZaehler = Record<OcrStandArt, number>;

/** Ein Dokument in der Liste der Texterkennung (#61). */
export interface OcrAuftrag { dokument: Dokument; mappeTitel: string; typId: string }
export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string; titel: string }

/** Eine Mappe im Papierkorb (#43), mit ihren Werten, wie sie beim Löschen waren. */
export interface PapierkorbEintrag {
  id: string; typId: string; titel: string; werte: Werte; demo: boolean;
  erstellt: string; erstelltVon: string | null; geaendert: string; geaendertVon: string | null;
  geloescht: string; geloeschtVon: string | null;
  /** Anzahl Dokumente, die mit ihr im Papierkorb liegen. */
  dokumente: number;
  /** Mit verknüpften Mappen gelöscht (#424): gemeinsame Id des Vorgangs, sonst null. */
  vorgang: string | null;
  /** Verweise bleibender Mappen auf diese, die beim Löschen entfernt wurden (#424). */
  entkoppelt: Array<{ quelleId: string; feldKey: string }>;
}
/** Eine Mappe im Papierkorb, wie das Löschprotokoll sie braucht (#470). */
export interface KorbInhalt { id: string; typId: string; werte: Werte; demo: boolean; vorgang: string | null; entkoppelt: number; notizen: number; dokumente: LoeschDokument[] }
/** Ein einzelnes Dokument im Papierkorb (#344). */
export interface DokumentImPapierkorb {
  id: string; mappeId: string; registerKey: string; name: string; mime: string; groesse: number; sha256: string;
  erstellt: string; erstelltVon: string | null;
  /** Anzahl älterer Versionen, die mitgegangen sind. */
  versionen: number;
  geloescht: string; geloeschtVon: string | null;
}
export interface PapierkorbFilter {
  /** Nur, was dieser Benutzer gelöscht hat. */
  von?: string;
  /** Nur, was vor diesem Zeitpunkt gelöscht wurde. */
  vor?: string;
  typId?: string;
}

/**
 * Datenzugriff für einen Haushalt. Die Fachlogik (Dienst) kennt nur diese
 * Schnittstelle; PostgreSQL und der Arbeitsspeicher (für Tests) setzen sie um.
 */
/** Ein Ereignis für ein Paket (#338). */
export interface PaketEreignis { id: string; paketId: string; art: string; daten: Record<string, unknown>; erstellt: string; versuche: number }

/** Anzahl fertiger Dokumente je Herkunft des Volltexts (#459). */
export interface VolltextHerkunftZahlen { pdf: number; paket: number; api: number; eingebaut: number; sonst: number; ohneText: number }

/** Stand der Zahlen eines Benutzers (#625), in der Datenbank. */
export interface Zaehlerstand { stand: number; abdruck: string; geaendert: string }

/** Ein Ereignis des Katalogs (#670), wie es geschrieben wird. */
export interface NeuesKatalogEreignis { id: string; art: string; daten: Record<string, unknown>; ausloeser: Record<string, unknown>; buendel?: string; buendelS?: number }
export interface GespeichertesKatalogEreignis { id: string; nr: number; art: string; daten: Record<string, unknown>; ausloeser: Record<string, unknown>; erstellt: string; versuche: number }

export interface Repo {
  /**
   * Mehrere Änderungen ganz oder gar nicht (#404), z. B. eine Änderung samt Ereignis im Ausgangskorb:
   * `f` bekommt ein Repo, das in der Transaktion arbeitet. Im Speicher-Repo (Tests) ohne Zurückrollen.
   */
  transaktion<T>(f: (repo: Repo) => Promise<T>): Promise<T>;
  listeTypen(): Promise<Mappentyp[]>;
  holeTyp(id: string): Promise<Mappentyp | undefined>;
  /** `system` nur für die Systemtypen, die der Server selbst anlegt. */
  legeTypAn(id: string, d: MappentypDaten, system?: Systemtyp): Promise<Mappentyp>;
  /**
   * Aktualisiert den Typ und entfernt Verweise aus Feldern, die keine Referenzfelder mehr sind.
   * Mit `erwartet` (#917, `geaendert`, auf dem die Bearbeitung beruht) nur, wenn seitdem niemand gespeichert hat –
   * sonst {@link KonfigurationVeraltet} und nichts ändert sich. `geaendert` wächst bei jeder Änderung um mindestens 1 ms.
   */
  aendereTyp(id: string, d: MappentypDaten, erwartet?: string): Promise<Mappentyp>;
  loescheTyp(id: string): Promise<void>;
  zaehleMappen(typId: string): Promise<number>;

  listeMappen(typId?: string): Promise<Mappe[]>;
  /**
   * Mappen eines Typs, bei denen mindestens eines der Datumsfelder zwischen von und bis liegt
   * (je einschließlich, JJJJ-MM-TT). Für „Anstehend“ (#477), statt alle Mappen des Typs zu laden.
   */
  mappenMitDatum(typId: string, felder: string[], von: string, bis: string): Promise<Mappe[]>;
  /**
   * Termine (#918): Mappen des Typs, die im Zeitraum ab … bis (je einschließlich) einen Termin haben **können** – ein
   * Datum im Zeitraum in einem der Felder oder, bei wiederkehrenden Feldern (`monate`), einen Folgetermin (Datum +
   * k · monate Monate, k ≥ 1). Vorfilter: Es dürfen mehr kommen, nie weniger; entschieden wird beim Rechnen. Nur Id,
   * Typ, Titel und die Werte dieser Felder (Datumswerte JJJJ-MM-TT).
   */
  fristKandidaten(typId: string, felder: Array<{ key: string; monate: number | null }>, ab: string, bis: string): Promise<FristKandidat[]>;
  /** Nur Id, Typ und Titel aller Mappen (Demo-Daten, #248: auch bei 200.000 Mappen schlank). */
  mappenKurz(): Promise<Array<{ id: string; typId: string; titel: string }>>;
  /** Vorhandene Werte eines Feldes (für eindeutige Felder beim Erzeugen von Demo-Daten). */
  feldwerte(typId: string, key: string): Promise<string[]>;
  holeMappe(id: string): Promise<Mappe | undefined>;
  /** `nummern` (#171): in derselben Transaktion je Feld eine Nummer aus dem Kreis ziehen und eintragen. */
  legeMappeAn(id: string, typId: string, werte: Werte, verweise: Verweis[], benutzerId: string | null, demo?: boolean, systemKennung?: string | null, nummern?: NummernZiehen): Promise<Mappe>;
  /* ---------- Pakete (#188) ---------- */
  listePakete(): Promise<InstalliertesPaket[]>;
  /** Anlegen oder ersetzen (gleiche Id). */
  speicherePaket(p: InstalliertesPaket): Promise<void>;
  loeschePaket(id: string): Promise<void>;
  /**
   * Umzug auf eine neue Paket-Id (#1084, Manifest `ersetzt`, z. B. texterkennung_fra → texterkennung.fra): dieselbe
   * Installation unter neuer Id – Eintrag, Abhängigkeiten anderer Pakete, Code, Sprachtexte, Ereignisse, Wortlisten,
   * Herkunft der Mappentypen, Vektoren, mitgelieferte Automatisierungen und Dienstkonto (PostgreSQL in einer
   * Transaktion). Einstellungen zieht die Paketverwaltung über die Einstellungen um.
   */
  benennePaketUm(alt: string, neu: string): Promise<void>;
  /** Code eines Pakets (#338): code/modul.wasm und code/daten/…; ersetzt den bisherigen ganz. */
  speicherePaketCode(paketId: string, dateien: Array<{ name: string; inhalt: Buffer }>): Promise<void>;
  paketCode(paketId: string): Promise<Array<{ name: string; inhalt: Buffer }>>;
  loeschePaketCode(paketId: string): Promise<void>;
  /** Sprachpakete (#731): Texte und Beschriftungen je Paket; ersetzt die bisherigen ganz. */
  speichereSprachpaket(paketId: string, d: SprachpaketDaten): Promise<void>;
  sprachpakete(): Promise<Array<SprachpaketDaten & { paketId: string }>>;
  loescheSprachpaket(paketId: string): Promise<void>;
  /** Ereignisse für Pakete (#338): Ausgangskorb mit Wiederholung. */
  legeEreignisseAn(e: Array<{ id: string; paketId: string; art: string; daten: Record<string, unknown> }>): Promise<void>;
  /** Fällige, noch nicht zugestellte Ereignisse, älteste zuerst. */
  faelligeEreignisse(anzahl: number): Promise<PaketEreignis[]>;
  ereignisZugestellt(id: string): Promise<void>;
  /** Daten eines Ereignisses ersetzen (#458, Fortsetzung „weiter“): eine spätere Wiederholung setzt dort an. */
  ereignisDaten(id: string, daten: Record<string, unknown>): Promise<void>;
  /** Fehlschlag merken; naechster null = aufgeben. */
  ereignisFehlgeschlagen(id: string, fehler: string, naechster: Date | null): Promise<void>;
  /** Je Paket: offen, aufgegeben, zugestellt und wann zuletzt (#670). */
  ereignisStand(): Promise<Record<string, { offen: number; aufgegeben: number; zugestellt: number; zuletzt?: string | null }>>;
  /** Alle Ereignisse eines entfernten Pakets verwerfen. */
  loescheEreignisse(paketId: string): Promise<void>;
  /** Noch nicht zugestellte Ereignisse einer Art zu diesen Dokumenten verwerfen (#458, Texterkennung abbrechen); liefert die Anzahl. */
  loescheOffeneEreignisse(art: string, dokumente: string[]): Promise<number>;
  /* ---------- Ereigniskatalog (#670) ---------- */
  /**
   * Ereignis in den Ausgangskorb (in der Transaktion der Änderung). Mit `buendel`: Gibt es dazu noch ein offenes,
   * nicht geholtes Ereignis, dessen Frist (`buendelS`) noch läuft, bekommt es die mit `mische` zusammengeführten Daten
   * statt eines neuen Eintrags; liefert die Id des Ereignisses, das es aufnimmt.
   */
  legeKatalogEreignisAn(e: NeuesKatalogEreignis, mische?: (alt: Record<string, unknown>) => Record<string, unknown>): Promise<string>;
  /** Fällige Ereignisse holen und für `sperreS` Sekunden für diesen Server sperren (mehrere Server); älteste zuerst. */
  holeKatalogEreignisse(anzahl: number, sperreS: number): Promise<GespeichertesKatalogEreignis[]>;
  /** Diese Ereignisse sind an alle Abnehmer verteilt (#743: gesammelt in einer Anweisung). */
  katalogEreignisseVerteilt(ids: string[]): Promise<void>;
  /** Fehlschlag merken; naechster null = aufgeben (gilt als verteilt, Fehler bleibt stehen). */
  katalogEreignisFehlgeschlagen(id: string, fehler: string, naechster: Date | null): Promise<void>;
  /** Verteiltes nach `tage` Tagen löschen, alte Fristmeldungen nach einem Jahr. */
  raeumeKatalogEreignisseAuf(tage: number): Promise<number>;
  /** Stand des Ausgangskorbs (Werkbank, Tests). */
  katalogEreignisStand(): Promise<{ offen: number; aufgegeben: number; verteilt: number; aeltestesOffen: string | null }>;
  /** „Frist erreicht“ (#670) je Mappe, Feld, Datum und Zeitpunkt genau einmal: true, wenn diese Meldung neu ist. */
  merkeFristMeldung(f: { mappeId: string; feld: string; datum: string; zeitpunkt: 'vorlauf' | 'faellig' }): Promise<boolean>;
  /* ---------- Nummernkreise (#171) ---------- */
  listeNummernkreise(): Promise<Nummernkreis[]>;
  /** Anlegen oder Name, Muster und Start ändern; Zählerstände bleiben. */
  speichereNummernkreis(k: Pick<Nummernkreis, 'schluessel' | 'name' | 'muster' | 'start'>): Promise<Nummernkreis>;
  loescheNummernkreis(schluessel: string): Promise<void>;
  /** Zählerstand eines Zeitraums setzen (zuletzt vergebener Wert). */
  setzeZaehler(schluessel: string, zeitraum: string, letzter: number): Promise<Nummernkreis | undefined>;
  /** Einer vorhandenen Mappe eine Nummer geben, wenn das Feld leer ist (Wartung); sonst null. */
  vergebeNummer(mappeId: string, feldKey: string, kreis: string, jetzt: Date): Promise<string | null>;
  /** Archivnummern (#345): `anzahl` Nummern aus einem Kreis ziehen (ohne Mappe), in einer Transaktion. */
  zieheNummern(kreis: string, anzahl: number, jetzt: Date): Promise<string[]>;
  /** Archivnummer setzen (null = entfernen); false, wenn ein anderes Dokument sie schon hat. */
  setzeArchivnummer(dokumentId: string, nummer: string | null): Promise<boolean>;
  /** Dokument mit dieser Archivnummer (ohne Groß-/Kleinschreibung). */
  findeArchivnummer(nummer: string): Promise<Dokument | undefined>;
  /** Die Mappe mit dieser Systemkennung (z. B. rolle:admin). */
  holeSystemMappe(kennung: string): Promise<Mappe | undefined>;
  /** Kennung einer Systemmappe ändern oder (null) entfernen – #818: frühere Systemrolle „Administrator“. */
  setzeSystemKennung(id: string, kennung: string | null): Promise<void>;
  /**
   * Werte ersetzen. Mit `feldweise` (#609) nur die Felder, die sich gegenüber dessen `basis` ändern – so
   * setzt ein Schreiber, der einen älteren Stand gelesen hat, keine Felder anderer zurück. „Zuletzt geändert“
   * steigt bei jedem Schreiben um mindestens eine Millisekunde, damit der Stand eindeutig bleibt.
   */
  aendereMappe(id: string, werte: Werte, verweise: Verweis[], benutzerId: string | null, feldweise?: FeldweiseSchreiben): Promise<Mappe>;
  /** Setzt nur „zuletzt geändert“ (z. B. nach Dokumenten, #76); Werte, Verweise und Passung bleiben. */
  beruehreMappe(id: string, benutzerId: string | null): Promise<void>;
  /** Viele neue Mappen auf einmal (Demo-Daten): eine Transaktion, Titel schon berechnet. */
  legeMappenAn(liste: NeueMappe[]): Promise<void>;
  /** Statistik der großen Tabellen auffrischen (ANALYZE, #367) – nach Massenläufen wie Demo-Daten. */
  aktualisiereStatistik(): Promise<void>;
  loescheMappe(id: string): Promise<void>;

  /** Mehrere Mappen auf einmal (unbekannte Ids fehlen im Ergebnis). */
  holeMappen(ids: string[]): Promise<Mappe[]>;
  /** Gespeicherte Titel (leer, wenn noch nicht berechnet). */
  titelVon(ids: string[]): Promise<Map<string, string>>;
  setzeTitel(liste: Array<{ id: string; titel: string }>): Promise<void>;
  /** Ids der Mappen, die auf eine der angegebenen verweisen. */
  quellenVon(zielIds: string[]): Promise<string[]>;
  /** Titel und Typ je Mappe (unbekannte Ids fehlen). */
  bezuege(ids: string[]): Promise<Map<string, MappenBezug>>;
  /** Eine Seite einer Sicht, sortiert nach Titel. */
  seite(o: SeitenAnfrage): Promise<{ gesamt: number; mappen: Mappe[]; ausschnitte?: Record<string, Ausschnitt> }>;
  /** Ob die Anfrage mindestens eine Mappe findet (#740, „Meintest du …?“) – ohne zu zählen und ohne Seite. */
  gibtTreffer(o: SeitenAnfrage): Promise<boolean>;
  /** Zähler für die Sichten. `lesen` gilt für typen und favoriten; eingang zählt immer ohne Lesefilter (#127: auch Aufgaben zu nicht lesbaren Mappen, #477: eigene schnelle Abfrage). */
  /** Gibt es mindestens eine Mappe dieser Typen? (Startseite, #334 – ohne alle zu zählen, #615) */
  gibtMappen(typIds: string[]): Promise<boolean>;
  zaehler(benutzerId: string, admin: boolean, lesen?: Lesefilter | null): Promise<{ typen: Map<string, { anzahl: number; unpassend: number; demo: number }>; eingang: number; favoriten: number }>;
  /** Favoriten (#62): setzen/entfernen; welche der Mappen Favoriten des Benutzers sind. */
  setzeFavorit(benutzerId: string, mappeId: string, an: boolean): Promise<void>;
  /** Vollexport (#254): alle Favoriten. */
  alleFavoriten(): Promise<Array<{ benutzerId: string; mappeId: string }>>;

  /* ---------- Abruf-Links einer Auskunft (#455) ---------- */
  legeAuskunftLinkAn(l: AuskunftLinkIntern): Promise<void>;
  /** Über den Hash des Schlüssels (öffentliche Abrufseite). */
  auskunftLinkPerSchluessel(schluesselHash: string): Promise<AuskunftLinkIntern | undefined>;
  /** Neueste zuerst; ohne Angabe alle (höchstens `max`). */
  auskunftLinks(f?: { id?: string; mappeId?: string; auskunftId?: string; max?: number }): Promise<AuskunftLinkIntern[]>;
  /** Fehlversuch zählen (atomar); ab `max` gesperrt. Liefert den neuen Stand. */
  auskunftLinkFehlversuch(id: string, max: number): Promise<{ fehlversuche: number; gesperrt: boolean } | undefined>;
  /** Einen Abruf zählen – nur, solange der Link gilt (atomar). Liefert die neue Anzahl oder null. */
  auskunftLinkAbruf(id: string): Promise<number | null>;
  /** Zurückziehen; false, wenn er schon nicht mehr galt. */
  widerrufeAuskunftLink(id: string): Promise<boolean>;
  favoritenVon(benutzerId: string, mappeIds: string[]): Promise<Set<string>>;
  /** Favorit = Abo (#422): wer die Mappe als Favorit hat und ob er bei Änderungen benachrichtigt werden will. */
  favoritenDerMappe(mappeId: string): Promise<Array<{ benutzerId: string; benachrichtigen: boolean }>>;
  /** Je Favorit „bei Änderungen benachrichtigen“ an/aus (#422). */
  setzeFavoritBenachrichtigen(benutzerId: string, mappeId: string, an: boolean): Promise<void>;
  /** Welche dieser Mappen sind Favoriten des Benutzers mit ausgeschalteter Benachrichtigung? */
  stummeFavoriten(benutzerId: string, mappeIds: string[]): Promise<Set<string>>;
  /** Zähler-Endpunkt (#625): letzter Stand der Zahlen eines Benutzers (nur ein Hash der Zahlen, keine Inhalte). */
  zaehlerstand(benutzerId: string): Promise<Zaehlerstand | undefined>;
  /**
   * Zähler-Endpunkt (#625): Hash der aktuellen Zahlen merken. Weicht er vom gespeicherten ab (oder gibt es noch
   * keinen), zählt der Stand um eins hoch und `geaendert` wird jetzt; sonst bleibt alles, wie es ist.
   */
  setzeZaehlerstand(benutzerId: string, abdruck: string): Promise<Zaehlerstand>;
  /** Mappen als gesehen merken (geöffnet oder „als gesehen markiert“, #422). */
  merkeGesehen(benutzerId: string, mappeIds: string[]): Promise<void>;
  /**
   * Hervorhebung (#422): Welche dieser Mappen – nur Favoriten und selbst angelegte – haben andere seit dem letzten
   * Sehen (sonst seit Favorit bzw. Anlegen) geändert? Zählt nur Historieneinträge der Arten `arten` mit Benutzer.
   */
  geaendertVonAnderen(benutzerId: string, mappeIds: string[], arten: readonly string[]): Promise<Set<string>>;
  /** Anzahl Mappen je Klauselliste (eine je Sicht), in derselben Reihenfolge. */
  zaehleKlauseln(liste: Klausel[][], lesen?: Lesefilter | null): Promise<number[]>;
  /**
   * Zahlen der Ablage in **einem** Lauf über alle Mappen (#742): je Typ (davon unpassend, Demo) und je Klauselliste
   * (eine je Sicht, gleiche Reihenfolge). Hängt nur von den Klauseln und vom Lesefilter ab, nicht von der Person.
   */
  zaehleBestand(liste: Klausel[][], lesen?: Lesefilter | null): Promise<{ typen: Map<string, { anzahl: number; unpassend: number; demo: number }>; sichten: number[] }>;
  /**
   * Zahlen einer Person (#742) in einer Abfrage: Eingang (offene Aufgaben für sie, mit `ohneEmpfaenger` auch die ohne
   * Empfänger; ohne Lesefilter, #127), lesbare Favoriten, eigene Einträge im Papierkorb und die Ansichten, deren
   * Bedingungen die Person selbst meinen (`liste`, z. B. „ist mein Favorit“; gleiche Reihenfolge).
   */
  zaehlePersoenlich(benutzerId: string, ohneEmpfaenger: boolean, lesen?: Lesefilter | null, liste?: Klausel[][]): Promise<{ eingang: number; favoriten: number; papierkorb: number; sichten: number[] }>;
  /** Haushaltsstand `zahlen` aus der Datenbank (#742, Migration 077); fehlt ohne Datenbank (nur dieser Prozess). */
  haushaltsstand?(): Promise<number>;
  /** Haushaltsstand `zahlen` hochzählen; liefert den neuen Stand. */
  erhoeheHaushaltsstand?(): Promise<number>;
  /** Mappenstand (#918, Migration 086): wie `haushaltsstand`, zählt aber nicht bei Favoriten. */
  mappenstand?(): Promise<number>;
  /** Mappenstand hochzählen; liefert den neuen Stand. */
  erhoeheMappenstand?(): Promise<number>;
  /** Berechtigungen (#124): welche dieser Mappen der Filter durchlässt. */
  lesbare(ids: string[], lesen: Lesefilter | null): Promise<Set<string>>;
  /** Exportrecht (#294): welche dieser Mappen zu mindestens einer der Klauseln passen. */
  inKlauseln(ids: string[], klauseln: Klausel[]): Promise<Set<string>>;
  /** Anzahl Mappen eines Typs, für die der Ausdruck gilt (z. B. „niemand kann lesen“, #125). */
  zaehleAusdruck(typId: string, x: Ausdruck): Promise<number>;
  /** Regelwerk eines Mappentyps speichern; null = alles erteilt, keine Regeln. */
  setzeBerechtigungen(typId: string, rw: Regelwerk | null): Promise<Mappentyp>;
  /** Schlüssel nachtragen (#145; nur für Typen ohne). */
  setzeTypSchluessel(typId: string, schluessel: string): Promise<void>;
  /**
   * Kennung eines vorhandenen Typs setzen (#1084), Paket und Schlüssel aus `paket:schluessel` (bzw. ohne Paket) – nur
   * für die Paketverwaltung: Übernahme des früheren Ablageorts durch Basis (#883) und deren Rücknahme.
   */
  setzeTypKennung(typId: string, kennung: string): Promise<void>;

  listeSichten(): Promise<Sicht[]>;
  legeSichtAn(id: string, d: SichtDaten): Promise<Sicht>;
  /** Mit `erwartet` (#917) wie bei {@link Repo.aendereTyp}: nur auf dem Stand, auf dem die Bearbeitung beruht. */
  aendereSicht(id: string, d: SichtDaten, erwartet?: string): Promise<Sicht>;
  /**
   * Ort im Baum (Ordnen, Verschieben, #917): Nur ein Wechsel der Elternsicht zählt als Änderung der Ansicht
   * (`geaendert`); bloßes Umnummerieren unter Geschwistern lässt den Stand, damit offene Bearbeitungen weiter gelten.
   */
  setzeSichtOrt(id: string, elternId: string | null, position: number): Promise<void>;
  loescheSicht(id: string): Promise<void>;
  /** problem null = passt. */
  setzePassung(liste: Array<{ id: string; problem: string | null }>): Promise<void>;
  /** Ids der Mappen dieses Typs, die nicht passen. */
  unpassende(typId: string): Promise<string[]>;
  /** Typen mit noch nicht geprüften Mappen. */
  typenOhnePassung(): Promise<string[]>;
  /** Anzahl Mappen mit Wert je Feldschlüssel. */
  belegung(typId: string): Promise<Record<string, number>>;
  /** Ids der Mappen, deren Titel noch nie berechnet wurde. */
  ohneTitel(): Promise<string[]>;

  /** Typ-Id je existierender Mappe dieses Haushalts. */
  typenVon(ids: string[]): Promise<Map<string, string>>;
  /** Eine andere Mappe desselben Typs mit gleichem Wert (Groß-/Kleinschreibung egal). */
  findeDoppelt(typId: string, feldKey: string, wert: string, ausser?: string): Promise<Mappe | undefined>;
  /**
   * Viele Prüfungen „Bereits vergeben“ auf einmal (#743), über den Index der Feldwerte: je Eintrag (Mappe, Feld, Wert)
   * eine andere Mappe desselben Typs mit gleichem Wert (ohne Groß-/Kleinschreibung und Leerzeichen am Rand).
   * Schlüssel des Ergebnisses: `${mappeId}|${feldKey}`.
   */
  findeDoppelte(typId: string, liste: Array<{ mappeId: string | null; feldKey: string; wert: string }>): Promise<Map<string, { id: string; titel: string }>>;
  rueckverweise(zielId: string): Promise<Rueckverweis[]>;
  /** Baum-Sammlung (#396, #424): alle Verweise, deren Quelle oder Ziel eine dieser Mappen ist (beide Richtungen). */
  kantenVon(ids: string[]): Promise<Kante[]>;

  listeDokumente(mappeId: string): Promise<Dokument[]>;
  /** Dokumente mehrerer Mappen in einem Zugriff (#367: Export ohne N+1), je Mappe neueste zuerst. */
  dokumenteVon(mappeIds: string[]): Promise<Dokument[]>;
  /** Anzahl (lebender) Dokumente je Mappe (#396); Mappen ohne fehlen. */
  zaehleDokumente(mappeIds: string[]): Promise<Map<string, number>>;
  holeDokument(id: string): Promise<Dokument | undefined>;
  legeDokumentAn(d: Dokument): Promise<Dokument>;
  /** „Hochgeladen am“ eines Dokuments setzen (#878: Beispiel-Dokumente mit Datum aus dem Paket). */
  setzeDokumentErstellt(id: string, erstellt: string): Promise<void>;
  /* ---------- Versionierung (#194) ---------- */
  /** Ältere Versionen, neueste zuerst. */
  versionenVon(dokumentId: string): Promise<DokumentVersion[]>;
  /** Ältere Versionen mehrerer Dokumente (#367), je Dokument neueste zuerst. */
  versionenVonDokumenten(dokumentIds: string[]): Promise<DokumentVersion[]>;
  /** Volltext einer älteren Version (für „Zurückholen“). */
  holeVersion(dokumentId: string, nummer: number): Promise<(DokumentVersion & { volltext: string | null }) | undefined>;
  /**
   * Neue Version: den aktuellen Stand als ältere Version sichern und das Dokument mit der neuen Datei
   * überschreiben (Nummer + 1). `volltext` gesetzt = übernommen (Zurückholen), sonst Texterkennung neu.
   */
  ersetzeDokument(id: string, neu: NeueVersion): Promise<Dokument>;
  /** Integritätsprüfung (#212): jede gespeicherte Datei (aktuelle und ältere Versionen) mit Dokument und Mappe. */
  alleDateien(): Promise<Array<{ sha256: string; groesse: number; dokumentId: string; mappeId: string; name: string; version: number }>>;
  /** Ältere Versionen über die letzten `behalten` hinaus entfernen; liefert deren Dateien (sha256). */
  kuerzeVersionen(dokumentId: string, behalten: number): Promise<string[]>;
  loescheDokument(id: string): Promise<void>;
  /** Zuordnen (#192): Dokument samt Volltext in eine andere Mappe und ein anderes Register. */
  verschiebeDokument(id: string, mappeId: string, registerKey: string): Promise<void>;
  /** Andere Dokumente mit derselben Datei (gleicher Inhalt). */
  dokumenteMitSha(sha256: string): Promise<Dokument[]>;
  /** Dateien umwandeln (#577): lebende Dokumente dieser Dateitypen, ältere zuerst. */
  dokumenteMitTyp(mimes: string[]): Promise<Dokument[]>;
  /** Dateien umwandeln (#577): Anzahl lebender Dokumente je Dateityp. */
  dokumentTypen(): Promise<Record<string, number>>;
  /** PDF verkleinern (#393): lebende PDF-Dokumente ab `ab` Bytes, größte zuerst, höchstens `max`. */
  grossePdfs(ab: number, max: number): Promise<Dokument[]>;
  /** Eine ältere Version entfernen (Verkleinern ohne Original); liefert ihre Datei (sha256) oder null. */
  loescheVersion(dokumentId: string, nummer: number): Promise<string | null>;
  /** Anzahl Dokumente je Register-Schlüssel in Mappen dieses Typs. */
  dokumenteJeRegister(typId: string): Promise<Map<string, number>>;

  /** Demo-Mappen je Typ. */
  zaehleDemo(): Promise<Map<string, number>>;
  /** Anzahl echter Mappen, die auf Demo-Mappen verweisen. */
  echteVerweiseAufDemo(): Promise<number>;
  /**
   * Löscht Demo-Mappen; liefert ihre Anzahl und die Prüfwerte ihrer Dateien. Mit `max` höchstens so
   * viele (#248: in Paketen); erst wenn keine mehr übrig ist, auch die Demo-Mappen im Papierkorb.
   */
  loescheDemo(max?: number): Promise<{ anzahl: number; dateien: string[] }>;

  /* ---------- Papierkorb (#43) ---------- */
  /** Zieht die Mappe samt Verweisen und Dokumenten in den Papierkorb. */
  legeInPapierkorb(id: string, benutzerId: string | null): Promise<void>;
  papierkorb(f?: PapierkorbFilter): Promise<PapierkorbEintrag[]>;
  holeAusPapierkorb(id: string): Promise<PapierkorbEintrag | undefined>;
  /** Legt die Mappe wieder an; Verweise auf Mappen, die es nicht mehr gibt, entfallen (Anzahl). */
  stelleWiederHer(id: string): Promise<{ verweiseEntfallen: number }>;
  /**
   * Mit verknüpften Mappen löschen (#424): alle in einer Transaktion in den Papierkorb, als ein Vorgang –
   * auch bei Kreisen (Verweise untereinander gehen mit). `entkoppelt`: je Mappe die entfernten Verweise.
   */
  legeVorgangInPapierkorb(ids: string[], benutzerId: string | null, vorgang: string, entkoppelt: Record<string, Array<{ quelleId: string; feldKey: string }>>): Promise<void>;
  /** Mehrere zusammen wiederherstellen (#424): erst alle Mappen, dann die Verweise (auch untereinander). */
  stelleMehrereWiederHer(ids: string[]): Promise<{ verweiseEntfallen: number }>;
  /** Löscht endgültig; liefert die Prüfwerte der Dateien, die dabei frei werden könnten. */
  leerePapierkorb(ids: string[]): Promise<string[]>;
  /** Mappen und einzelne Dokumente (#344). */
  zaehlePapierkorb(von?: string): Promise<number>;
  /** Hängt noch ein Dokument (lebend oder im Papierkorb) an dieser Datei? */
  dateiBenutzt(sha256: string): Promise<boolean>;
  /* Einzelne Dokumente (#344): samt Volltext und älteren Versionen. */
  legeDokumentInPapierkorb(id: string, benutzerId: string | null): Promise<void>;
  papierkorbDokumente(f?: PapierkorbFilter & { mappeIds?: string[] }): Promise<DokumentImPapierkorb[]>;
  holeDokumentAusPapierkorb(id: string): Promise<DokumentImPapierkorb | undefined>;
  /** Legt das Dokument wieder an (die Mappe muss es geben). */
  stelleDokumentWiederHer(id: string): Promise<void>;
  /** Löscht endgültig; liefert die Prüfwerte der Dateien, die dabei frei werden könnten. */
  leereDokumentPapierkorb(ids: string[]): Promise<string[]>;

  /* ---------- Löschprotokoll (#470) ---------- */
  /** Was mit Mappen im Papierkorb endgültig geht: Zahlen und Prüfsummen, keine Namen. */
  papierkorbInhalt(ids: string[]): Promise<KorbInhalt[]>;
  /** Einzelne Dokumente im Papierkorb samt älterer Versionen, ohne Namen. */
  papierkorbDokumentInhalt(ids: string[]): Promise<Array<{ id: string; mappeId: string; dokumente: LoeschDokument[] }>>;
  /** Nur anfügen – ändern oder einzeln löschen lässt sich nichts. */
  loeschprotokollSchreibe(e: LoeschEintrag[]): Promise<void>;
  /** Neueste zuerst, höchstens f.max; gesamt = alle passenden. */
  loeschprotokoll(f: LoeschFilter): Promise<{ eintraege: LoeschEintrag[]; gesamt: number }>;
  /** Einträge vor diesem Zeitpunkt entfernen (eigene Aufbewahrung); liefert die Anzahl. */
  loeschprotokollAufraeumen(vor: string): Promise<number>;

  /* ---------- Erkennung (#336) ---------- */
  /** Gespeichertes Ergebnis der Erkennung einer Post. */
  erkennungLies(mappeId: string): Promise<{ ergebnis: unknown; zeit: string } | undefined>;
  /** Ergebnis speichern bzw. ersetzen; absenderId = eindeutig erkannter Absender. Gibt es die Mappe nicht (mehr), passiert nichts. */
  erkennungSchreibe(mappeId: string, ergebnis: unknown, absenderId: string | null): Promise<void>;
  /** Post mit diesem eindeutig erkannten Absender, neueste zuerst. */
  erkennungenMitAbsender(absenderId: string, max: number): Promise<string[]>;

  /* ---------- Unscharfe Suche (#356) ---------- */
  /** Ähnliche Wörter aus dem Wörterverzeichnis je Begriff (gefaltet), beste zuerst; ohne pg_trgm leer. */
  aehnlicheWoerter(woerter: string[], max: number): Promise<Record<string, string[]>>;
  /** Anzahl der Wörter im Wörterverzeichnis. */
  woerterAnzahl(): Promise<number>;
  /** Wörterverzeichnis aus dem Bestand neu aufbauen; liefert die Anzahl. */
  woerterNeu(): Promise<number>;
  /**
   * Neue Wörter aus dem Eingang ins Wörterverzeichnis übernehmen (#575, höchstens `grenze` Einträge); liefert deren
   * Zahl, -1 wenn gerade ein anderer Lauf arbeitet.
   */
  woerterEinarbeiten(grenze?: number): Promise<number>;
  /** Gruppen gleichbedeutender Wörter (Werkbank und Pakete). */
  synonyme(): Promise<Synonymgruppe[]>;
  legeSynonymAn(g: { id: string; woerter: string[]; quelle: string }): Promise<void>;
  aendereSynonym(id: string, woerter: string[]): Promise<boolean>;
  loescheSynonym(id: string): Promise<boolean>;
  /** Alle Gruppen einer Quelle (Paket-Id) ersetzen – leer = entfernen. */
  setzeSynonyme(quelle: string, gruppen: string[][]): Promise<void>;

  /* ---------- Vektoren zu Dokumenten (#442) ---------- */
  /** Vektor eines Dokuments für ein Modell setzen bzw. ersetzen. Gibt es das Dokument nicht (mehr): false. */
  vektorSetze(e: { dokumentId: string; paket: string; modell: string; vektor: Float32Array }): Promise<boolean>;
  /** Vektor(en) eines Dokuments löschen – eines Modells oder alle; liefert die Anzahl. */
  vektorLoesche(dokumentId: string, modell?: string): Promise<number>;
  /** Vektoren eines Pakets löschen, außer denen des Modells `ausser` (Modellwechsel, Neuberechnung); liefert die Anzahl. */
  vektorenLoeschePaket(paket: string, ausser?: string): Promise<number>;
  /** Alle Vektoren eines Modells mit der Mappe des Dokuments, in Teilen (für den Zwischenspeicher, ohne alles auf einmal im Speicher). */
  vektorenLaden(modell: string, jeTeil: (teil: Array<{ dokumentId: string; mappeId: string; vektor: Float32Array }>) => void): Promise<void>;
  /** Vektor eines Dokuments für ein Modell. */
  vektorVon(dokumentId: string, modell: string): Promise<Float32Array | null>;
  /** Anzahl je Paket und Modell. */
  vektorStand(): Promise<Array<{ paket: string; modell: string; anzahl: number }>>;
  /** Dokumente mit Volltext, aber ohne Vektor dieses Modells (nach Id, ab `nach`) – für die Nachberechnung des Bestands. */
  ohneVektor(modell: string, max: number, nach?: string | null): Promise<Array<{ id: string; mappeId: string }>>;
  /** Anzahl der Dokumente mit Volltext. */
  mitVolltext(): Promise<number>;

  /* ---------- Texterkennung (#45) ---------- */
  /** Dokumente in die Warteschlange stellen. */
  ocrEinreihen(ids: string[]): Promise<void>;
  /** Nimmt das älteste wartende Dokument und setzt es auf „läuft“. */
  ocrNaechster(): Promise<Dokument | undefined>;
  ocrSetze(id: string, e: OcrErgebnis): Promise<void>;
  /** Fertiger Volltext eines anderen Dokuments mit derselben Datei. */
  ocrVonSha(sha256: string, ausser: string): Promise<{ text: string; seiten: number | null; info: string | null; sprache?: string | null; weitere?: string[] | null; seitensprachen?: Seitensprache[] | null } | undefined>;
  /**
   * Sprache eines Dokuments setzen (#400); false, wenn es das Dokument nicht gibt. Mit `weitere` (#579) auch die
   * weiteren Sprachen – die Seitensprachen entfallen dann (die Angabe gilt fürs ganze Dokument).
   */
  setzeDokumentSprache(id: string, sprache: string | null, weitere?: string[]): Promise<boolean>;
  /** Seitensprachen eines Dokuments (#579), null ohne. */
  seitensprachen(id: string): Promise<Seitensprache[] | null>;
  /** Hinweis „Post teilen?“ an einem Dokument wegklicken (#579); false, wenn es das Dokument nicht gibt. */
  teilenHinweisAus(id: string): Promise<boolean>;
  /** Nach einem Neustart: „läuft“ → „wartet“. */
  ocrZurueckstellen(): Promise<number>;
  ocrZaehler(): Promise<OcrZaehler>;
  /** Aufträge der Texterkennung für die Werkbank (#61): Dokumente eines Stands mit Mappe, neueste zuerst. */
  ocrAuftraege(f: { stand: OcrStandArt; von: number; anzahl: number }): Promise<{ gesamt: number; eintraege: OcrAuftrag[] }>;
  /** Dokumente ohne Volltext (noch nie erkannt) mit Typ und Register ihrer Mappe. */
  ocrOhneVolltext(): Promise<Array<{ id: string; typId: string; registerKey: string }>>;
  /**
   * „Volltext neu erzeugen“ (#458): Dokumente ohne Text (Volltext leer, gleich welcher Stand außer wartet/läuft)
   * bzw. alle Dokumente, mit Typ und Register ihrer Mappe, ältere zuerst.
   */
  volltextKandidaten(umfang: 'ohne' | 'alle'): Promise<Array<{ id: string; typId: string; registerKey: string }>>;
  /**
   * Woher der Volltext fertiger Dokumente kommt (#459, Werkbank → Texterkennung): Textebene des PDFs, Paket, API,
   * frühere eingebaute Texterkennung, sonst (z. B. nach dem Schwärzen) – und fertige ohne Text. Wie volltextHerkunft
   * (shared/src/volltext.ts) aus dem Hinweis gelesen.
   */
  volltextHerkunft(): Promise<VolltextHerkunftZahlen>;
  /** Erkannte Sprachen (#395): Anzahl fertiger Dokumente je Sprachkennung (aus dem Hinweis der Texterkennung). */
  ocrSprachen(): Promise<Record<string, number>>;
  volltext(id: string): Promise<string | null>;
  /** Volltexte mehrerer Dokumente (#367); Dokumente ohne Volltext fehlen. Listen lesen ihn nie mit. */
  volltexte(ids: string[]): Promise<Map<string, string>>;
  /**
   * „Frag deine Ablage“ (#444): Fundstellen zu Suchwörtern – nur in Mappen, die `lesen` erlaubt. dokumente: beste
   * Dokumente (Volltext, ein Wort genügt) mit Ausschnitten um die Treffer; mappen: Mappen, deren Titel oder Werte
   * Wörter enthalten (meiste Wörter zuerst). woerter: nur Buchstaben und Ziffern (frageWoerter).
   */
  fragenFundstellen(o: { woerter: string[]; lesen: Lesefilter | null; dokumente: number; mappen: number }): Promise<{ dokumente: Array<{ id: string; mappeId: string; name: string; text: string }>; mappen: Mappe[] }>;

  /* ---------- Aufgaben (#54) ---------- */
  /** Passung → Aufgaben: offene „passt nicht“-Aufgabe anlegen oder Text nachziehen; passt sie, erledigt. */
  aufgabenZurPassung(liste: Array<{ id: string; problem: string | null }>): Promise<void>;
  legeAufgabeAn(a: Aufgabe): Promise<Aufgabe>;
  holeAufgabe(id: string): Promise<Aufgabe | undefined>;
  /** Aufgaben einer Mappe (offen und erledigt), neueste zuerst. */
  aufgabenVon(mappeId: string): Promise<Aufgabe[]>;
  /** Aufgaben mehrerer Mappen (#367), je Mappe wie `aufgabenVon`. */
  aufgabenVonMappen(mappeIds: string[]): Promise<Aufgabe[]>;
  /** Offene Aufgaben: alle, oder die eines Benutzers (mit admin auch die der Administratoren). */
  offeneAufgaben(f?: { benutzerId?: string; admin?: boolean; mappeIds?: string[] }): Promise<Aufgabe[]>;
  /** Erledigte Aufgaben (Werkbank), neueste zuerst. */
  erledigteAufgaben(max: number): Promise<Aufgabe[]>;
  erledigeAufgabe(id: string, von: string | null): Promise<void>;
  delegiereAufgabe(id: string, an: string | null): Promise<void>;
  /** Text einer offenen Aufgabe ersetzen – für gebündelte Benachrichtigungen, die hochzählen (#415, #422). */
  aendereAufgabeText(id: string, text: string): Promise<void>;
  /** Fristen (#129): alle Aufgaben der Art „frist“ (offen und erledigt), ggf. nur dieser Mappen. */
  fristAufgaben(mappeIds?: string[]): Promise<Aufgabe[]>;

  /* ---------- Aufgaben bei Personen ohne Leserecht (#798) ---------- */
  /** Fälle, neueste zuerst: nur offene oder alle; ggf. nur dieser Mappen. Mit Titel und Typ der Mappe, wenn es sie gibt. */
  faelleOhneLeserecht(f?: { offen?: boolean; mappeIds?: string[]; max?: number }): Promise<FallOhneLeserecht[]>;
  /** Neuen offenen Fall anlegen; gibt es für Aufgabe und Person schon einen offenen, passiert nichts (false). */
  legeFallAn(f: { id: string; aufgabeId: string; mappeId: string; benutzerId: string; aufgabentext: string }): Promise<boolean>;
  /** Offenen Fall beenden; false, wenn er schon beendet war (dann schreibt niemand ein zweites Mal in die Historie). */
  beendeFall(id: string, grund: FallEnde, zeit?: string | null): Promise<boolean>;
  /** Leserecht auf Zeit an einem offenen Fall vermerken; false, wenn er beendet ist oder schon eines hat. */
  gibLeserechtAufZeit(id: string, von: string | null): Promise<boolean>;
  /**
   * Wirksame Leserechte auf Zeit eines Benutzers: offener Fall mit Leserecht, dessen Aufgabe noch offen bei ihm liegt.
   * Mit Typ der Mappe für den Lesefilter.
   */
  leserechteAufZeit(benutzerId: string): Promise<Array<{ fallId: string; mappeId: string; typId: string; aufgabeId: string; aufgabentext: string; seit: string; von: string | null }>>;

  /**
   * Schlüsselwechsel (#47): alle verschlüsselten Werte (Mappen, Papierkorb, Einstellungen) umschlüsseln
   * und die angegebenen Einstellungen setzen – in einer Transaktion.
   */
  umschluesseln(um: (wert: string) => string | null, einstellungen: Record<string, unknown>): Promise<{ umgeschluesselt: number; unlesbar: number }>;
  /**
   * Alle verschlüsselten Werte mit Fundstelle (#410) – genau die, die `umschluesseln` anfasst
   * (Mappen, Papierkorb, Einstellungen außer den beim Wechsel neu gesetzten).
   */
  verschluesselteFundstellen(): Promise<Fundstelle[]>;

  /* ---------- Freie Erinnerungen (#131), solange nicht fällig ---------- */
  erinnerungen(f?: { mappeId?: string; empfaengerId?: string; bis?: string }): Promise<Erinnerung[]>;
  holeErinnerung(id: string): Promise<Erinnerung | undefined>;
  legeErinnerungAn(e: Erinnerung): Promise<Erinnerung>;
  aendereErinnerung(id: string, e: { datum: string; text: string; empfaengerId: string | null }): Promise<Erinnerung | undefined>;
  loescheErinnerung(id: string): Promise<void>;

  /* ---------- Hinweise von Paketen (#1034) ---------- */
  /** Hinweise an einer Mappe (alle Pakete), älteste zuerst; `paketName` ergänzt der Dienst. */
  hinweise(mappeId: string): Promise<Array<Omit<PaketHinweis, 'paketName'>>>;
  /** Hinweis setzen oder ersetzen (je Mappe, Paket und Schlüssel einer). */
  setzeHinweis(h: { mappeId: string; paket: string; schluessel: string; text: string }): Promise<void>;
  /** Hinweis entfernen; true, wenn es ihn gab. */
  loescheHinweis(mappeId: string, paket: string, schluessel: string): Promise<boolean>;
  /** Alle Hinweise eines Pakets (beim Entfernen des Pakets). */
  loescheHinweiseVon(paket: string): Promise<number>;

  /* ---------- Notizen (#55) ---------- */
  notizen(mappeId: string): Promise<Notiz[]>;
  /** Notizen mehrerer Mappen (#367), je Mappe älteste zuerst. */
  notizenVon(mappeIds: string[]): Promise<Notiz[]>;
  holeNotiz(id: string): Promise<Notiz | undefined>;
  legeNotizAn(n: Notiz): Promise<Notiz>;
  aendereNotiz(id: string, text: string, von: string | null): Promise<Notiz>;
  loescheNotiz(id: string): Promise<void>;

  /* ---------- Änderungshistorie (#57) ---------- */
  historieSchreibe(e: Array<{ mappeId: string; benutzerId: string | null; art: Historienart; daten?: Historieneintrag['daten'] }>): Promise<void>;
  /**
   * Historie einer Mappe, neueste zuerst. Mit `arten` nur diese Arten (#800: was ein Register zeigt), mit `max`
   * höchstens so viele, mit `vor` (Id eines Eintrags) nur die Einträge danach in dieser Reihenfolge – zum seitenweisen Laden.
   */
  historie(mappeId: string, o?: HistorieAbfrage): Promise<Historieneintrag[]>;
  /**
   * Letzter Abruf derselben Datei durch dieselbe Person auf demselben Weg seit `seit` (#800, Rauschen unterdrücken):
   * Zeitpunkt oder null. `fassung`/`version` wie in den Daten des Eintrags.
   */
  letzterAbruf(mappeId: string, art: Historienart, benutzerId: string | null, dokumentId: string, fassung: string, version: number | null, seit: string): Promise<string | null>;
  /** Historie mehrerer Mappen (#367), je Mappe neueste zuerst. */
  historieVon(mappeIds: string[]): Promise<Historieneintrag[]>;
  /**
   * Berechnete Werte (#1034, kein Rauschen): der neueste Eintrag „geändert“ dieser Person (Dienstkonto eines Pakets) an
   * der Mappe seit `seit`, der nur berechnete Werte enthält (`daten.berechnet`) – zum Bündeln je Mappe und Tag.
   */
  letzteBerechnung(mappeId: string, benutzerId: string | null, seit: string): Promise<Historieneintrag | null>;
  /** Daten eines Eintrags ersetzen (#1034: gebündelte berechnete Werte); Zeitpunkt und Art bleiben. null = Eintrag entfernen. */
  historieDatenErsetzen(id: number, daten: Historieneintrag['daten'] | null): Promise<void>;
  /**
   * Post auflösen (#936): Historie, Notizen, Aufgaben (ohne „Post für dich“) und Erinnerungen der Mappe `von` gehören
   * danach der Mappe `nach`. Jeder Historieneintrag bekommt `ausPost: von` dazu, damit man sieht, woher er stammt.
   */
  uebertrageAnMappe(von: string, nach: string): Promise<{ historie: number; notizen: number; aufgaben: number; erinnerungen: number }>;
  /** Aufgelöste Post (#936): Id → Zielmappe aus dem Eintrag „Aufgelöst in …“ in ihrer Historie. */
  aufgeloesteIn(ids: string[]): Promise<Map<string, { ziel: string; zielTyp: string }>>;
  /** Alle Einträge einer Art, neueste zuerst (#668: Verzeichnis der Auskünfte). */
  historieArt(art: Historienart, max: number): Promise<Historieneintrag[]>;
  /** Löscht die Historie von Mappen, die vor diesem Zeitpunkt endgültig gelöscht wurden. */
  historieAufraeumen(vor: string): Promise<number>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Adresse eines Dienstkontos (#338) – mit Haushalt, weil die Adresse über alle Haushalte eindeutig ist (benutzer_email_uq). */
export const dienstEmail = (paketId: string, haushaltId: string) => `paket-${paketId}.${haushaltId}@dienst.invalid`;
export const istUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

/** Nummern ziehen beim Anlegen (#171): Feld → Kreis, Tag des Ziehens. */
export interface NummernZiehen { felder: Array<{ feldKey: string; kreis: string }>; jetzt: Date }

/** Neue Version eines Dokuments (#194). */
export interface NeueVersion {
  name: string; mime: string; groesse: number; sha256: string; anzeigbar: boolean; erstelltVon: string | null; herkunft: Herkunft;
  /** Volltext übernehmen (Zurückholen); undefined = Texterkennung neu. */
  volltext?: string | null;
}
