/** Schnittstelle des Repos (#1278 aus repo/index.ts): Mappentypen, Mappen, Nummernkreise, Favoriten, Zähler, Rechte, Sichten. */
import type { Mappentyp, MappentypDaten, Systemtyp, Mappe, Werte, Dokument, MappenBezug, Ausschnitt } from '../../../../shared/src/model';
import type {
  FristKandidat,
  Verweis,
  NummernZiehen,
  FeldweiseSchreiben,
  NeueMappe,
  SeitenAnfrage,
  Zaehlerstand,
  Rueckverweis,
  Kante,
} from './typen';
import type { Nummernkreis } from '../../../../shared/src/nummernkreis';
import type { Lesefilter, Ausdruck, Regelwerk } from '../../../../shared/src/rechte';
import type { Klausel, Sicht, SichtDaten } from '../../../../shared/src/sichten';
import type { Fundstelle } from '../../geheimnisse/geheimnisse';

/** Mappentypen und Mappen, Nummernkreise, Favoriten, Zähler und Stände, Rechte, Sichten, Schlüsselwechsel (#47). */
export interface RepoMappen {
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
  legeMappeAn(
    id: string,
    typId: string,
    werte: Werte,
    verweise: Verweis[],
    benutzerId: string | null,
    demo?: boolean,
    systemKennung?: string | null,
    nummern?: NummernZiehen,
  ): Promise<Mappe>;
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
  /** Vorgaben aus Paketen (#1038): feste Kennung an einer Mappe setzen oder (null) entfernen. */
  setzeVorgabe(id: string, kennung: string | null): Promise<void>;
  /** Mappen mit einer Vorgabe-Kennung, die so beginnt (z. B. `paket:vertraege:`) – nicht die im Papierkorb. */
  mappenMitVorgabe(praefix: string): Promise<Mappe[]>;
  /**
   * Werte ersetzen. Mit `feldweise` (#609) nur die Felder, die sich gegenüber dessen `basis` ändern – so
   * setzt ein Schreiber, der einen älteren Stand gelesen hat, keine Felder anderer zurück. „Zuletzt geändert“
   * steigt bei jedem Schreiben um mindestens eine Millisekunde, damit der Stand eindeutig bleibt.
   */
  aendereMappe(id: string, werte: Werte, verweise: Verweis[], benutzerId: string | null, feldweise?: FeldweiseSchreiben): Promise<Mappe>;
  /** Setzt nur „zuletzt geändert“ (z. B. nach Dokumenten, #76); Werte, Verweise und Passung bleiben. */
  beruehreMappe(id: string, benutzerId: string | null): Promise<void>;
  /**
   * Paket-Umbau (#1041): Mappen wechseln in einen anderen Mappentyp – Ids, Werte, Verweise, Dokumente und Historie
   * bleiben; die Werte zieht der Umbau danach mit `aendereMappe` um. Im Papierkorb nicht.
   */
  setzeMappenTyp(ids: string[], typId: string): Promise<void>;
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
  seite(o: SeitenAnfrage): Promise<{ gesamt: number; mappen: Mappe[]; ausschnitte?: Record<string, Ausschnitt>; verborgen?: number }>;
  /** Ob die Anfrage mindestens eine Mappe findet (#740, „Meintest du …?“) – ohne zu zählen und ohne Seite. */
  gibtTreffer(o: SeitenAnfrage): Promise<boolean>;
  /** Zähler für die Sichten. `lesen` gilt für typen und favoriten; eingang zählt immer ohne Lesefilter (#127: auch Aufgaben zu nicht lesbaren Mappen, #477: eigene schnelle Abfrage). */
  /** Gibt es mindestens eine Mappe dieser Typen? (Startseite, #334 – ohne alle zu zählen, #615) */
  gibtMappen(typIds: string[]): Promise<boolean>;
  zaehler(
    benutzerId: string,
    admin: boolean,
    lesen?: Lesefilter | null,
  ): Promise<{ typen: Map<string, { anzahl: number; unpassend: number; demo: number }>; eingang: number; favoriten: number }>;
  /** Favoriten (#62): setzen/entfernen; welche der Mappen Favoriten des Benutzers sind. */
  setzeFavorit(benutzerId: string, mappeId: string, an: boolean): Promise<void>;
  /** Vollexport (#254): alle Favoriten. */
  alleFavoriten(): Promise<Array<{ benutzerId: string; mappeId: string }>>;
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
  zaehleBestand(
    liste: Klausel[][],
    lesen?: Lesefilter | null,
  ): Promise<{ typen: Map<string, { anzahl: number; unpassend: number; demo: number }>; sichten: number[] }>;
  /**
   * Zahlen einer Person (#742) in einer Abfrage: Eingang (offene Aufgaben für sie, mit `ohneEmpfaenger` auch die ohne
   * Empfänger; ohne Lesefilter, #127), lesbare Favoriten, eigene Einträge im Papierkorb und die Ansichten, deren
   * Bedingungen die Person selbst meinen (`liste`, z. B. „ist mein Favorit“; gleiche Reihenfolge).
   */
  zaehlePersoenlich(
    benutzerId: string,
    ohneEmpfaenger: boolean,
    lesen?: Lesefilter | null,
    liste?: Klausel[][],
  ): Promise<{ eingang: number; favoriten: number; papierkorb: number; sichten: number[] }>;
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
  findeDoppelte(
    typId: string,
    liste: Array<{ mappeId: string | null; feldKey: string; wert: string }>,
  ): Promise<Map<string, { id: string; titel: string }>>;
  rueckverweise(zielId: string): Promise<Rueckverweis[]>;
  /** Baum-Sammlung (#396, #424): alle Verweise, deren Quelle oder Ziel eine dieser Mappen ist (beide Richtungen). */
  kantenVon(ids: string[]): Promise<Kante[]>;

  /**
   * Schlüsselwechsel (#47): alle verschlüsselten Werte (Mappen, Papierkorb, Einstellungen) umschlüsseln
   * und die angegebenen Einstellungen setzen – in einer Transaktion.
   */
  umschluesseln(
    um: (wert: string) => string | null,
    einstellungen: Record<string, unknown>,
  ): Promise<{ umgeschluesselt: number; unlesbar: number }>;
  /**
   * Alle verschlüsselten Werte mit Fundstelle (#410) – genau die, die `umschluesseln` anfasst
   * (Mappen, Papierkorb, Einstellungen außer den beim Wechsel neu gesetzten).
   */
  verschluesselteFundstellen(): Promise<Fundstelle[]>;
}
