/** Sichten (#1278 aus sichten.ts): Bedingungen – Arten, Operatoren, Wertangaben. */
import { leseZeitraum, zeitraumTage } from '../feldarten';
import type { Feldtyp } from '../model/feldtypen';
import { t } from '../texte';
import type { Merkmal } from '../merkmale';

/** Arten, die als Zahl verglichen werden – Zeitraum in Tagen (#1035). */
export const istZahlvergleich = (art: Feldart) => art === 'zahl' || art === 'betrag' || art === 'prozent' || art === 'zeitraum';
/** Fester Vergleichswert eines Zeitraums („P3M“, „3 Monate“) in Tagen; NaN = keiner. */
export function zeitraumWert(v: unknown): number {
  const z = leseZeitraum(v);
  return z ? zeitraumTage(z) : NaN;
}

/* ---------- Bedingungen ---------- */

/** Wie ein Wert eines Feldes verglichen wird; Systemwerte haben eigene Arten. */
export type Feldart = Feldtyp | 'zeit' | 'person';

export const OPERATOREN = {
  gleich: t('gemeinsam.sichten.ist-gleich'),
  enthaelt: 'enthält',
  kleiner: t('gemeinsam.sichten.kleiner-als'),
  groesser: t('gemeinsam.sichten.groesser-als'),
  zwischen: 'zwischen',
  ausserhalb: t('gemeinsam.sichten.ausserhalb-von'),
  imZeitraum: t('gemeinsam.sichten.im-zeitraum'),
  einerVon: t('gemeinsam.sichten.ist-einer-von'),
  zeigtAuf: t('gemeinsam.sichten.zeigt-auf'),
  /** Verweisfeld mit mehreren Zieltypen (#1036): zeigt auf (mindestens) eine Mappe eines dieser Mappentypen. */
  zeigtAufTyp: t('gemeinsam.sichten.zeigt-auf-typ'),
  ja: 'ja',
  nein: 'nein',
  leer: t('gemeinsam.sichten.ist-leer'),
  nichtLeer: t('gemeinsam.sichten.ist-nicht-leer'),
} as const;
export type Operator = keyof typeof OPERATOREN;

/** Welche Operatoren es je Art gibt. */
export const OPERATOREN_JE_ART: Record<Feldart, Operator[]> = {
  text: ['gleich', 'enthaelt', 'leer', 'nichtLeer'],
  langtext: ['enthaelt', 'leer', 'nichtLeer'],
  formatiert: ['enthaelt', 'leer', 'nichtLeer'],
  zahl: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'leer', 'nichtLeer'],
  betrag: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'leer', 'nichtLeer'],
  // Zeitraum und Prozent (#1035): wie Zahlen; ein Zeitraum zählt dabei in Tagen (feldarten.ts).
  prozent: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'leer', 'nichtLeer'],
  zeitraum: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'leer', 'nichtLeer'],
  datum: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'imZeitraum', 'leer', 'nichtLeer'],
  zeit: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'imZeitraum'],
  janein: ['ja', 'nein'],
  auswahl: ['einerVon', 'leer', 'nichtLeer'],
  referenz: ['zeigtAuf', 'zeigtAufTyp', 'leer', 'nichtLeer'],
  person: ['zeigtAuf', 'leer'],
  // Passwörter taugen nicht für Bedingungen (#46).
  passwort: [],
  // Tabellen (#1030) haben keinen Wert.
  tabelle: [],
  // Zusammengesetzt (#1050): wie Text – verglichen wird der gespeicherte Schlüssel (Verweise als Kennung).
  zusammengesetzt: ['gleich', 'enthaelt', 'leer', 'nichtLeer'],
};

export const EINHEITEN = { tage: 'Tage', wochen: 'Wochen', monate: 'Monate', jahre: 'Jahre' } as const;
export type Einheit = keyof typeof EINHEITEN;

/**
 * Ein Vergleichswert: fest oder dynamisch (zum Zeitpunkt der Abfrage berechnet).
 * - heute: Datum heute ± versatz einheit
 * - jahr / monat: Zeitraum (aktuelles Jahr bzw. aktueller Monat ± versatz), nur mit „im Zeitraum“
 * - ich: der angemeldete Benutzer; meineRollen: seine Rollen (Rollen-Mappen)
 */
export type WertAngabe =
  | { art: 'fest'; wert: string | number | boolean | string[] }
  | { art: 'heute'; versatz?: number; einheit?: Einheit }
  | { art: 'jahr'; versatz?: number }
  | { art: 'monat'; versatz?: number }
  | { art: 'ich' }
  | { art: 'meineRollen' }
  /** Nur im Auswahlfilter eines Referenzfelds (#173): der Wert eines Felds der eigenen Mappe. */
  | { art: 'eigenesFeld'; feld: string };

export const DYNAMISCH = {
  heute: 'heute',
  jahr: t('gemeinsam.sichten.jahr-aktuelles-n'),
  monat: t('gemeinsam.sichten.monat-aktueller-n'),
  ich: t('gemeinsam.sichten.aktueller-benutzer'),
  meineRollen: t('gemeinsam.sichten.rollen-des-aktuellen-benutzers'),
} as const;

export const ZAEHLVERGLEICHE = {
  mehr: t('gemeinsam.sichten.mehr-als'),
  weniger: t('gemeinsam.sichten.weniger-als'),
  gleich: 'genau',
} as const;
export type Zaehlvergleich = keyof typeof ZAEHLVERGLEICHE;

export type Bedingung =
  /** Feld des Mappentyps oder Systemwert (_erstellt, _geaendert, _erstelltVon, _geaendertVon). */
  | { art: 'feld'; feld: string; op: Operator; wert?: WertAngabe; bis?: WertAngabe }
  /** Anzahl Dokumente in einem Dokumentenregister (#41). */
  | { art: 'dokumente'; register: string; vergleich: Zaehlvergleich; anzahl: number }
  /** Anzahl Mappen in einem Verknüpfungsregister (#41); bei mehreren Typen ein gemeinsames Register (#66). */
  | { art: 'verknuepfungen'; register: string; vergleich: Zaehlvergleich; anzahl: number }
  /** Anzahl aller Dokumente der Mappe, unabhängig vom Register (#67). */
  | { art: 'dokumenteGesamt'; vergleich: Zaehlvergleich; anzahl: number }
  /** Anzahl aller anderen Mappen, die auf diese verweisen (#67). */
  | { art: 'verknuepfungenGesamt'; vergleich: Zaehlvergleich; anzahl: number }
  /** Die Mappe ist ein Favorit des aktuellen Benutzers (#62). */
  | { art: 'favorit' }
  /** Frist in den nächsten n Tagen (#133): ein Datumsfeld oder (null) alle Datumsfelder mit Erinnerung; optional nur meine. */
  | { art: 'frist'; feld: string | null; tage: number; nurMeine?: boolean }
  /**
   * Merkmal der Ablage (#1032), z. B. „Ablage wird beruflich genutzt“; `nicht` kehrt es um. Hängt nicht an der Mappe:
   * trifft für alle Mappen zu oder für keine.
   */
  | { art: 'merkmal'; merkmal: Merkmal; nicht?: boolean };

export const FRIST_TAGE_MAX = 3650;

/** Nur Bedingungen auf Felder und Systemwerte des Zieltyps; mehrere gelten zusammen. */
export type Feldbedingung = Extract<Bedingung, { art: 'feld' }>;
