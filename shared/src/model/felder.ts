/**
 * Felder (#1278, vorher `shared/src/model.ts`): das Feld selbst und seine Anzeigeregeln. Feldarten und Verweisarten
 * stehen in feldtypen.ts, die Angaben, die ein Fachbereich am Feld auswertet, in angaben.ts (#1278, Schritt 5).
 */
import type { Beschriftungen, FeldTeile } from './beschriftungen';
import type { Feldtyp, Verweisart } from './feldtypen';

export interface Feld {
  /** Fester Schlüssel, unter dem Werte gespeichert werden. */
  key: string;
  label: string;
  typ: Feldtyp;
  pflicht?: boolean;
  /** Wert darf je Mappentyp nur einmal vorkommen (Text, Zahl, Zusammengesetzt – dort die Kombination, #1050). */
  eindeutig?: boolean;
  hilfe?: string;
  standard?: string | boolean | null;
  minLen?: number | null;
  maxLen?: number | null;
  /** Regulärer Ausdruck, muss den ganzen Text treffen. */
  muster?: string;
  /** Zahl, Betrag und Prozent: Zahl. Datum (#535): „heute“ oder JJJJ-MM-TT. */
  min?: number | string | null;
  max?: number | string | null;
  nachkomma?: number | null;
  waehrung?: string;
  /**
   * Betrag (#1035): negative Beträge erlaubt (Gutschrift, Erstattung). Fehlt = aus – dann gilt wie bisher ≥ 0; das
   * Formular zeigt den Hinweis „mit Minus eintragen“ nur, wenn es an ist.
   */
  negativ?: boolean;
  /** Auswahl: die festen Werte (#728) – gespeichert wird der Wert, gezeigt die Beschriftung (`beschriftungen`). */
  optionen?: string[];
  mehrfach?: boolean;
  /**
   * Referenz: Ids der Ziel-Mappentypen (#1036; bis dahin ein einzelner Typ `zielTyp`) – einer oder mehrere, der eigene
   * darf dabei sein (Hierarchie). `['*']` (BELIEBIGER_TYP) = jede Mappe, nur an Systemfeldern. Gelesen immer über
   * {@link zieleVon}, {@link zielErlaubt} und {@link einzigesZiel}; ältere Daten mit `zielTyp` gleicht
   * {@link normalisiereZiele} an (Migration 095, Eingaben, Sicherungen, Einrichtungsdateien).
   */
  zielTypen?: string[];
  /**
   * Referenz mit mehreren Zieltypen und „mehrere Mappen erlaubt“ (#1036): alle gewählten Mappen vom selben Typ – ist
   * die erste ein Fahrzeug, dürfen die weiteren nur Fahrzeuge sein. Prüft der Server beim Speichern.
   */
  gleicherTyp?: boolean;
  /**
   * Referenz aus einem Paket (#1036, `ziel_optional`): Kennungen `paket:schluessel` von Zieltypen aus Paketen, von denen
   * das Paket nicht abhängt. Ablago nimmt jeden davon in `zielTypen` auf, sobald es ihn gibt – auch, wenn das andere
   * Paket erst später installiert wird – und lässt das Feld stehen, solange keiner da ist.
   */
  zielOptional?: string[];
  verweisart?: Verweisart;
  /** Systemfeld eines Systemmappentyps: nicht entfernbar, Datentyp und Eigenschaften fest (vom Server gesetzt). */
  system?: boolean;
  /** Datumsfeld (#129): Erinnerung als Aufgabe „Frist“ im Eingang; fehlt/null = keine. */
  frist?: import('./angaben').FristEinstellung | null;
  /** Referenzfeld (#172): nur Mappen des Zieltyps, die alle Bedingungen erfüllen. */
  auswahlFilter?: import('../sichten/bedingungen').Feldbedingung[];
  /**
   * Referenzfeld (#886): „folgt aus“ einem anderen Verweisfeld dieser Mappe über ein Verweisfeld von dessen Ziel, z. B.
   * Organisation aus Niederlassung → Organisation. Füllt nur ein leeres Feld (Vorbelegung, keine Sperre).
   */
  folgtAus?: import('./angaben').FolgtAus;
  /**
   * Referenzfeld (#1037): „beim Auswählen übernehmen“ – Paare „Feld der verwiesenen Mappe (`von`) → Feld dieser Mappe
   * (`nach`)“. Wählt man eine Mappe, schlägt Ablago deren Werte in leeren Feldern vor (vorbelegen.ts); nie überschreiben,
   * nie Passwörter, nie berechnete Felder, nur Werte, die die Person lesen darf. Gleiche Schreibweise im Paketformat.
   */
  vorbelegen?: import('./angaben').Vorbelegung[];
  /**
   * Referenzfeld (#1648): aus einem Datumsfeld dieser Mappe ableiten – z. B. Steuerjahr = das Steuerjahr, dessen „Jahr“
   * dem Jahr von „Bis“ entspricht. Nur ein Vorschlag (shared/src/ausdatum.ts); nur bei genau einem Zieltyp.
   */
  ausDatum?: import('./angaben').AusDatum;
  /**
   * Referenzfeld (#1671): Reihenfolge der Auswahl – Feld des Zieltyps oder Systemspalte und Richtung, z. B. Steuerjahr
   * absteigend nach „Jahr“. Fehlt = Titel aufsteigend in natürlicher Reihenfolge (shared/src/auswahlreihenfolge.ts).
   */
  auswahlReihenfolge?: import('./angaben').AuswahlReihenfolge;
  /**
   * „Aus Dokument füllen“ (#336, #391; bis #938 „Für die Erkennung nutzen“): vorhanden = an, mit Art und
   * Erkennungshinweis. Der Name im Code bleibt `erkennung` – gespeicherte Daten und Pakete ändern sich nicht.
   */
  erkennung?: import('./angaben').FeldErkennung | null;
  /**
   * „Zum Wiederfinden nutzen“ (#938): Über diesen Wert findet Ablago vorhandene Mappen wieder (Kundennummer,
   * Vertragsnummer, Rechnungsnummer, Kennzeichen …) – für Vorschläge, Belege und die Warnung vor Doppelten.
   * Unabhängig von „eindeutig“. Nur bei Text, Zahl und Verweis (WIEDERFINDEN_FELDTYPEN in erkennung/arten.ts).
   */
  wiederfinden?: boolean;
  /**
   * Verweisfeld aus einem Paket-Update (#534): Kennung des bisherigen Textfelds, aus dem es sich füllen lässt
   * (`aus_text` im Paket). Solange der Verweis leer ist, zeigen Titel und Trefferliste den alten Text.
   */
  ausText?: string;
  /** Textfeld (#535): Format E-Mail, Telefon, Internetseite, IBAN oder PLZ; fehlt = frei. */
  format?: import('./angaben').Feldformat | null;
  /** Format PLZ (#535): Kennung des Felds mit dem Land; Deutschland (oder leer) heißt genau 5 Ziffern. */
  landFeld?: string | null;
  /** Bezeichnung, Hilfetext und Optionen in weiteren Sprachen (#728); fehlt etwas, gilt der Ausgangstext. */
  beschriftungen?: Beschriftungen<FeldTeile>;
  /**
   * Ausgeblendet (#655): nicht im Formular, nicht in der Mappenansicht, nicht zur Auswahl für neue Spalten und
   * Bedingungen. Die Werte bleiben gespeichert (Sicherung, Vollexport, API). Nie Pflicht, nie an Systemfeldern.
   */
  ausgeblendet?: boolean;
  /**
   * „Anzeigen, wenn …“ (#1033): Das Formular zeigt das Feld nur, wenn die Regel zutrifft (anzeige.ts). Nur Ordnung,
   * kein Schutz – der Wert bleibt gespeichert und steht in Schnittstelle, Export und Auskunft. Pflicht nur, solange
   * es zu sehen ist. Fehlt = immer. Nie an Systemfeldern.
   */
  anzeigen?: Anzeigeregel;
  /**
   * Berechnet (#1034): Id des Pakets, dessen Code den Wert schreibt (im Paketformat `berechnet: true` am Feld eines Typs,
   * den das Paket mitbringt). In der Oberfläche nur lesbar; jeder andere Schreiber bekommt 400 mit dem Paketnamen.
   * Setzen kann es nur die Paketverwaltung, entfernen („Feld wieder freigeben“) der Administrator. Nie Pflicht.
   */
  berechnetVon?: string;
  /**
   * Tabelle (#1030): Mappen vom Typ `typId`, die über `feldKey` hierher verweisen, mit den Spalten der Trefferliste
   * `trefferliste` (fehlt = Standard) und der Beschriftung `neu` für „+ Neu“. Nur bei `typ: 'tabelle'`.
   */
  quelle?: import('./angaben').Tabellenquelle;
  /**
   * Merkmal am Ja/Nein-Feld (#995): `eigeneOrganisation` – „ja“ heißt, diese Mappe ist eine eigene Organisation
   * (organisation.ts). Kommt aus dem Paket (Basis); die Werkbank lässt es, wie es ist.
   */
  merkmal?: import('../feldmerkmale').Feldmerkmal;
  /**
   * Schreibschutz (#995): `verwaltung` – ändern nur im Verwaltungsmodus mit dem Bereich „Eigene Organisation“ oder mit
   * einer dort freigegebenen Rolle; sonst 403, auch über die Schnittstelle. Kommt aus dem Paket; die Werkbank lässt ihn.
   */
  schreibschutz?: import('../feldmerkmale').Schreibschutz;
  /**
   * Zusammengesetzt (#1050): Vorlage aus Platzhaltern und Filtern, z. B. „{bereich} · {zeitraum}“ (höchstens
   * VORLAGE_MAX Zeichen). Nur bei `typ: 'zusammengesetzt'`.
   */
  vorlage?: string;
}

/**
 * Eine Bedingung in „Anzeigen, wenn …“ (#1033); `nicht` kehrt sie um. Ausgewertet in anzeige.ts (hier nur der Typ,
 * damit das Modell nicht auf die Auswertung zeigt).
 */
export type Anzeigebedingung = { nicht?: boolean } &
  /** Merkmal der Ablage (#1032). */
  (
    | { art: 'merkmal'; merkmal: import('../merkmale').Merkmal }
    /** Feldwert der Mappe – wie in Ansichten, nur mit festen Vergleichswerten oder „heute“. */
    | { art: 'feld'; bedingung: import('../sichten/bedingungen').Feldbedingung }
    /** Ein Verweisfeld zeigt auf (mindestens) eine Mappe vom Typ `typ` (Id des Mappentyps). */
    | { art: 'verweistyp'; feld: string; typ: string }
    /** Ein Verweisfeld zeigt auf (mindestens) eine eigene Organisation (#995), z. B. „Rechnungssteller ist wir“. */
    | { art: 'eigeneOrganisation'; feld: string }
  );
/** „Anzeigen, wenn …“ (#1033): alle Bedingungen oder eine davon. */
export interface Anzeigeregel {
  /** alle: jede Bedingung muss zutreffen; eine: mindestens eine. */
  modus: 'alle' | 'eine';
  bedingungen: Anzeigebedingung[];
}
