/**
 * Angaben an Feldern und Mappentypen, die ein Fachbereich auswertet (#1278, Schritt 5) – hier nur ihre Form. Sie
 * standen vorher bei der Auswertung (fristen.ts, folgtaus.ts, vorbelegen.ts, tabelle.ts, erkennung/arten.ts,
 * feldformate.ts, archiv.ts, berechnet.ts); das Feld und der Mappentyp bestehen aus ihnen, die Auswertung braucht
 * Feld und Mappentyp. Damit kein Kreis entsteht, liegt die Form beim Fachmodell, und jede dieser Dateien reicht ihre
 * Typen weiter, wo sie von dort eingebunden werden.
 */
import { t } from '../texte';

/* ---------- Quellen von Registern und Tabellen (mappentyp.ts, tabelle.ts) ---------- */

/** Quelle eines Verknüpfungsregisters: Mappen vom Typ `typId`, die über `feldKey` hierher verweisen. */
export interface Quelle {
  typId: string;
  feldKey: string;
  /** Trefferliste des Quelltyps, mit der das Register die Mappen als Tabelle zeigt (#75); leer = einfache Liste. */
  trefferliste?: string;
}

/** Quelle einer Tabelle: wie die eines Verknüpfungsregisters, dazu die Beschriftung von „+ Neu“. */
export interface Tabellenquelle extends Quelle {
  /** Beschriftung von „+ Neu“, z. B. „+ Position“ (Ausgangssprache); fehlt = „+ <Name des anderen Typs>“. */
  neu?: string;
}

/* ---------- Erinnerung an ein Datum (fristen.ts) ---------- */

export const VORLAUF_EINHEITEN = { tage: 'Tage', wochen: 'Wochen', monate: 'Monate' } as const;
export type VorlaufEinheit = keyof typeof VORLAUF_EINHEITEN;

export interface FristEinstellung {
  /** Wie lange vor dem Datum die Erinnerung im Eingang erscheint. */
  vorlauf: number;
  einheit: VorlaufEinheit;
  /** Benutzerfeld (Referenz auf Benutzer) für den Empfänger; null = Ersteller der Mappe. */
  empfaengerFeld: string | null;
  /** Text der Aufgabe mit Platzhaltern {feld}, {datum}, {titel}. */
  text: string;
  /** Wiederkehrend alle n Monate (#130); null = einmalig. */
  wiederholung: number | null;
}

/* ---------- Verweisfelder: „folgt aus“ und „beim Auswählen übernehmen“ (folgtaus.ts, vorbelegen.ts) ---------- */

/** Am Verweisfeld: `feld` ist ein anderes Verweisfeld dieser Mappe, `zielFeld` ein Verweisfeld der Mappe, auf die es zeigt. */
export interface FolgtAus {
  feld: string;
  zielFeld: string;
}

/** Ein Paar: `von` ist ein Feld der Mappe, auf die das Verweisfeld zeigt, `nach` ein Feld dieser Mappe. */
export interface Vorbelegung {
  von: string;
  nach: string;
}

/* ---------- Aus Dokument füllen – am Feld und am Mappentyp (erkennung/arten.ts) ---------- */

export const ERKENNUNGSARTEN = {
  name: t('gemeinsam.erkennung.name-oder-firma'),
  vorname: 'Vorname',
  nachname: 'Nachname',
  funktion: 'Funktion',
  nummer: t('gemeinsam.erkennung.nummer-kunden-vertrags'),
  iban: 'IBAN',
  ustid: t('gemeinsam.erkennung.umsatzsteuer-id'),
  email: t('gemeinsam.erkennung.e-mail-adresse'),
  internet: t('gemeinsam.erkennung.internetseite-oder-domain'),
  telefon: 'Telefon',
  mobil: 'Mobil',
  fax: 'Fax',
  strasse: 'Straße',
  hausnummer: 'Hausnummer',
  plz: 'PLZ',
  ort: 'Ort',
  datum: 'Datum',
  betrag: 'Betrag',
  zeitraum: 'Zeitraum',
  prozent: 'Prozent',
  verweis: t('gemeinsam.erkennung.passende-mappe-verweis'),
  auswahl: t('gemeinsam.erkennung.auswahlwert-der-im-text'),
} as const;
export type Erkennungsart = keyof typeof ERKENNUNGSARTEN;

/** Feld-Eigenschaft „Aus Dokument füllen“ (bis #938 „Für die Erkennung nutzen“): vorhanden = an. */
export interface FeldErkennung {
  /** Was im Feld steht; fehlt = aus Feldart, Kennung und Bezeichnung. */
  art?: Erkennungsart;
  /** Erkennungshinweis, z. B. „Kundennummer steht oben rechts, Muster 100-####“ (# = Ziffer). */
  hinweis?: string;
  /**
   * Nur am Datumsfeld für das Ende eines Zeitraums (#1646): Kennung des Datumsfelds für den Beginn („Ende des
   * Zeitraums ab …“). Steht im Dokument ein Zeitraum („vom 01.07.2012 – 31.07.2012“), bekommt der Beginn das erste
   * Datum und dieses Feld das zweite. Fehlt = aus Kennung und Bezeichnung (Beginn/Ende, Von/Bis …).
   */
  endeVon?: string;
}

/**
 * Verweisfeld aus einem Datum ableiten (#1648), z. B. Steuerjahr aus „Bis“: Ablago schlägt die Mappe des Zieltyps vor,
 * deren Feld `zielFeld` zum Jahr des Datumsfelds `datumFeld` dieser Mappe passt – gibt es keine, „… anlegen“.
 */
export interface AusDatum {
  /** Datumsfeld dieser Mappe. */
  datumFeld: string;
  /** Feld des Zieltyps mit dem Jahr (Text oder Zahl, z. B. „jahr“) oder ein Datumsfeld (gleiches Jahr). */
  zielFeld: string;
}

/**
 * „Aus Dokument ausfüllen“ am Mappentyp: ausgeblendet, Beschriftung und (#511) die Erkennung – eingebaut oder
 * ein Paket mit dms:erkennen; ohne Angabe gilt die Wahl aus der Werkbank. abfluss: Für ein Paket mit Netzzugriff
 * hat der Administrator den Hinweis auf den Datenabfluss ausdrücklich bestätigt.
 */
export interface AusDokument {
  aus?: boolean;
  beschriftung?: string;
  engine?: string;
  abfluss?: boolean;
}

/* ---------- Formate von Textfeldern (feldformate.ts) ---------- */

export const FELDFORMATE = ['email', 'telefon', 'internetseite', 'iban', 'plz'] as const;
export type Feldformat = (typeof FELDFORMATE)[number];

/* ---------- Aufbewahrung am Mappentyp (archiv.ts) ---------- */

export interface Archiv {
  /** Aufbewahrungsfrist in Jahren. */
  jahre: number;
  /** Datumsfeld, das zählt (z. B. Rechnungsdatum); null = Anlagedatum der Mappe. */
  stichtag: string | null;
  /**
   * Ist der Stichtag leer (#1051): „laeuftNicht“ = die Frist läuft noch nicht, die Mappe bleibt gesperrt, bis das Feld
   * gefüllt ist (laufender Vertrag, aktueller Stand). Fehlt = ab Anlagedatum (wie bisher). Nur mit `stichtag`.
   */
  leererStichtag?: 'laeuftNicht';
}

/* ---------- Berechnete Felder (berechnet.ts) ---------- */

/** Wer ein berechnetes Feld schreibt (je Paket-Id am Mappentyp, nur beim Lesen ergänzt). */
export interface Berechnung {
  /** Name des Pakets; bei einem entfernten Paket seine Id. */
  name: string;
  /** Rechnet das Paket noch? Sonst „nicht mehr berechnet“ – der letzte Wert bleibt. */
  aktiv: boolean;
}
