/**
 * Automatisierungen (#674): die Form – Wenn-, Und- und Dann-Karten, Automatisierung und Lauf (#1278, Schritt 5; vorher
 * in automatisierung.ts und den Teilen automatisierung-aufruf.ts, automatisierung-aussen.ts und
 * automatisierung-werkbank.ts). Die Teile prüfen und beschreiben je ihre Karten und brauchen dafür die Form aller
 * Karten; automatisierung.ts setzt die Teile zusammen. Liegt die Form hier, bindet kein Teil automatisierung.ts ein,
 * und es entsteht kein Kreis. automatisierung.ts reicht alles weiter – Importe von dort bleiben, wie sie sind.
 */
import type { EREIGNISKATALOG, KatalogArt } from './ereignisse';
import type { VorlaufEinheit } from './model/basis';
import type { Bedingung } from './sichten';

/** Die Wenn-Karte: Namen der Parameter, die ein Aufruf mitbringen darf. */
export interface WennAufruf {
  art: 'aufruf';
  parameter: string[];
}
/** Stufen der Wenn-Karte „Protokollmeldung“ (#677): ab Warnung oder ab Fehler – Hinweise kämen zu oft. */
export const PROTOKOLL_STUFEN = ['warn', 'error'] as const;
export type ProtokollStufe = (typeof PROTOKOLL_STUFEN)[number];
/** Wenn-Karten aus dem Betrieb (#677): ohne Mappe; „Protokollmeldung“ mit Stufe, Modul und Text als Filter. */
export type WennBetrieb =
  | { art: 'fehler.gemeldet' | 'version.neu' }
  | { art: 'protokoll.meldung'; stufe: ProtokollStufe; modul?: string | null; enthaelt?: string | null };
/** Wie viel eine Karte „URL aufrufen“ mitschickt (#671). */
export const INHALTSSTUFEN = ['meldung', 'kennungen', 'werte'] as const;
export type Inhaltsstufe = (typeof INHALTSSTUFEN)[number];
export const AUSSEN_METHODEN = ['POST', 'GET'] as const;
export type AussenMethode = (typeof AUSSEN_METHODEN)[number];
/** Ein Parameter: Name (wie ein Platzhalter) und Wert (Text mit Platzhaltern). */
export interface AussenParameter {
  name: string;
  wert: string;
}
/** Dann-Karte „URL aufrufen“. `bestaetigt`: „Daten verlassen Ablago“ bestätigt (nur bei Inhalt „Mit Werten“ nötig). */
export interface DannUrl {
  id: string;
  art: 'url';
  adresse: string;
  methode: AussenMethode;
  parameter: AussenParameter[];
  inhalt: Inhaltsstufe;
  bestaetigt?: boolean;
}
/** „An“ der E-Mail: wie bei Aufgaben, dazu beliebige Adressen; `feld` auch ein Textfeld mit Format E-Mail. */
export type MailEmpfaenger = Empfaenger | { art: 'adresse'; adresse: string };
/** Dann-Karte „E-Mail senden“ (nur Text). */
export interface DannEmail {
  id: string;
  art: 'email';
  an: MailEmpfaenger[];
  betreff: string;
  text: string;
}
/**
 * Ein freigegebenes Ziel (Werkbank → Automatisierungen → Ziele nach außen): Adresse als Präfix (Schema, Rechner, Port,
 * Pfad – ohne `?` und `#`). `heimnetz`: ausdrücklich ein Ziel im Heimnetz – dann auch `http://` und Adressen, die
 * Ablago sonst nie anspricht (privat, Loopback, Link-Local). Metadaten-Adressen von Cloud-Anbietern nie.
 */
export interface AussenZiel {
  adresse: string;
  heimnetz: boolean;
  notiz?: string;
  erstellt?: string;
  von?: string | null;
}
export type WennEreignis = Exclude<
  { [K in KatalogArt]: (typeof EREIGNISKATALOG)[K]['gruppe'] extends 'zaehler' | 'betrieb' | 'auftrag' ? never : K }[KatalogArt],
  'frist.erreicht'
>;
export type WennKarte =
  /**
   * Ein Ereignis des Katalogs; typ = nur Mappen dieses Typs (leer = alle), felder = nur bei Änderung dieser Felder.
   * `angelegt` (#1001, nur „Mappe gespeichert“): auch beim Anlegen – „neue Post oder ‚An‘ geändert“ ist dann eine Karte.
   */
  | { art: WennEreignis; typ?: string | null; felder?: string[]; angelegt?: boolean }
  /** Werkbank-Karten (#677): Fehler gemeldet, Protokollmeldung, neue Version – ohne Mappe. */
  | WennBetrieb
  /** „Aufruf von außen“ (#679): eigene Adresse mit Geheimnis; Parameter mit diesen Namen als Platzhalter – ohne Mappe. */
  | WennAufruf
  /**
   * „Datum erreicht“ (#724): Das Datumsfeld ist in `vorlauf` Tagen/Wochen/Monaten erreicht (0 = am Tag selbst,
   * negativ = so lange danach) – Monate sind Kalendermonate. Geprüft täglich zur Uhrzeit. `wiederholung`: Termin
   * kehrt alle n Monate wieder – eine Aufgabe schlägt nach dem Erledigen den Folgetermin vor.
   */
  | { art: 'datum'; typ: string; feld: string; vorlauf: number; einheit: VorlaufEinheit; uhrzeit: string; wiederholung?: number | null }
  /**
   * „Zeitplan“ (#678): an den Wochentagen `tage` (1 = Mo … 7 = So) um `uhrzeit`, an Feiertagen nur ohne `feiertage`.
   * `jeBenutzer`: läuft je aktivem Benutzer (nur der Rolle `rolle`) genau einmal je Tag – Kontext ist dann die
   * Benutzer-Mappe, Platzhalter {benutzer}. `profilzeit`: Uhrzeit, Wochentage und Feiertage aus dem Profil des
   * Benutzers (wie die Tägliche Zusammenfassung), sonst die Werte der Karte.
   */
  | {
      art: 'zeitplan';
      uhrzeit: string;
      tage: number[];
      feiertage: boolean;
      jeBenutzer: boolean;
      rolle?: string | null;
      profilzeit?: boolean;
    };
/** Wer gemeint ist: eine Person, alle aktiven Mitglieder einer Rolle, die Person(en) in einem Feld der Mappe oder wer die Mappe angelegt hat (#724). */
export type Empfaenger =
  | { art: 'person'; id: string }
  | { art: 'rolle'; id: string }
  /** sonst: ist das Feld leer, geht es an den Ersteller der Mappe (#712, wie die Erinnerung am Feld). */
  | { art: 'feld'; feld: string; sonst?: 'ersteller' }
  | { art: 'ersteller' }
  /** Person aus dem Ereignis (#678/#712), z. B. der Vertreter bei „Abwesenheit gesetzt“. */
  | { art: 'ereignis'; feld: string };
export type UndKarte =
  | { art: 'bedingung'; bedingung: Bedingung; nicht?: boolean }
  | { art: 'ansicht'; sicht: string; nicht?: boolean }
  | { art: 'favorit'; von: Empfaenger; nicht?: boolean }
  | { art: 'gruppe'; modus: 'alle' | 'eine'; karten: UndKarte[]; nicht?: boolean };
export interface UndBereich {
  modus: 'alle' | 'eine';
  karten: UndKarte[];
}
/** Dann-Karten; die Liste wächst mit #676 (Feld, Aufgabe) und Stufe 2 (#677, #671). */
export type DannKarte =
  /** „Danach keine weiteren Automatisierungen ausführen“ – nur für dieses eine Ereignis. */
  | { id: string; art: 'stopp' }
  /** Felder der Mappe setzen: je Feld ein fester Wert oder Text mit Platzhaltern (#676). */
  | { id: string; art: 'feld'; werte: Record<string, unknown> }
  /** Aufgabe (mit Fälligkeit in Tagen) oder Benachrichtigung an Personen, Rollen oder ein Feld (#676). */
  | { id: string; art: 'aufgabe'; empfaenger: Empfaenger[]; text: string; als: 'aufgabe' | 'benachrichtigung'; faellig?: number | null }
  /** Tägliche Zusammenfassung der offenen Aufgaben an den Benutzer des Laufs senden (#678; Zeitplan „für jeden Benutzer“). */
  | { id: string; art: 'zusammenfassung' }
  /**
   * Favoriten-Änderungen melden: gebündelte Benachrichtigung „Geändert“ an alle, die die Mappe als Favorit haben (#678, #422).
   * Seit #1001 hier statt in der Werkbank: `rollen` = nur an Mitglieder dieser Rollen (leer = alle); `vorgabe` false =
   * neue Benutzer haben die Benachrichtigung zunächst aus (im Profil einschaltbar).
   */
  | { id: string; art: 'favoriten'; rollen?: string[]; vorgabe?: boolean }
  /** Anmeldeschutz (#678, #368): `sammel` = Sammelmeldung über die Sperren vor heute, `konto` = sofort melden, dass ein Konto gesperrt ist. */
  | { id: string; art: 'anmeldeschutz'; was: 'sammel' | 'konto' }
  /**
   * „Paket nach Zeitplan ausführen“ (#1082): stellt dem Paket `paket` das Ereignis `zeitplan.ausgefuehrt` zu – nur mit der
   * Wenn-Karte „Zeitplan“ (nicht „für jeden Benutzer“). `aufgabe`: Kennung, damit ein Paket mehrere Läufe unterscheidet.
   * Mitgelieferte Automatisierungen rufen nur ihr eigenes Paket, selbst angelegte nur Pakete, die das Ereignis abonnieren.
   * Die Karte gibt dem Paket keine Rechte – es arbeitet mit seinen eigenen.
   */
  | {
      id: string;
      art: 'paket';
      paket: string;
      aufgabe?: string | null;
      /** Werte einer Karte aus dem Paket (#680). */ werte?: Record<string, string | number | boolean>;
    }
  /** „Sicherung anstoßen“ (#677): eine neue Sicherung – Ergebnis nur „angestoßen“ oder „läuft schon“. */
  | { id: string; art: 'sicherung' }
  /** Nach außen (#671): „URL aufrufen“ (freigegebenes Ziel, Inhaltsstufe, signiert) und „E-Mail senden“ – über den Ausgangskorb. */
  | DannUrl
  | DannEmail;
export interface AutomatisierungDaten {
  name: string;
  beschreibung: string;
  reihenfolge: number;
  wenn: WennKarte;
  und: UndBereich;
  dann: DannKarte[];
  /** Sonst (#677): laufen, wenn die Und-Bedingungen nicht zutreffen. */
  sonst: DannKarte[];
}
export type LaufZustand = 'laeuft' | 'abgeschlossen' | 'unzutreffend' | 'fehlgeschlagen' | 'uebersprungen' | 'wiederholt';
export type SchrittZustand = 'offen' | 'laeuft' | 'ok' | 'nein' | 'fehler' | 'uebersprungen';
export interface Schritt {
  teil: 'wenn' | 'und' | 'dann' | 'sonst';
  karte?: string;
  zustand: SchrittZustand;
  text?: string;
}
export interface Lauf {
  id: string;
  automatisierungId: string;
  ereignisId: string;
  art: string;
  /** Angaben des Ereignisses (nur Ids, Schlüssel, Datum) – zum Wiederholen. */
  daten: Record<string, unknown>;
  mappeId: string | null;
  zustand: LaufZustand;
  /** Trockenlauf: zeigt nur, was passieren würde. Testlauf: von Hand mit einer gewählten Mappe. */
  trocken: boolean;
  test: boolean;
  schritte: Schritt[];
  fehler: string | null;
  gestartet: string;
  beendet: string | null;
  wiederholtVon?: string | null;
  /** Fehlgeschlagen, aber bewusst nicht wiederholt (#707): wer und wann. Bleibt im Verlauf, zählt nicht mehr im Hinweis. */
  nichtWiederholt?: { von: string | null; zeit: string } | null;
}
