/**
 * Systemzustand → Auslastung (#409): Typen und Schwellen, gemeinsam für Server (`server/src/systemlast.ts`)
 * und Oberfläche (Werkbank → Wartung und Fehlersuche → Systemzustand).
 */

/** Ein Messpunkt (jede Minute). Anteile in Prozent (0–100), Netz in Byte je Sekunde; `null` = nicht verfügbar. */
export interface Messpunkt { zeit: string; cpu: number | null; speicher: number | null; rx: number | null; tx: number | null }

/** Anteile am Arbeitsspeicher in Byte: DMS-Prozess, Paket-Läufer, PostgreSQL (nur bei dms-komplett im selben Container). */
export interface Anteile { dms: number | null; pakete: number | null; datenbank: number | null }

export interface SystemlastStand {
  /** Jetzt: seit der letzten Messung (mindestens eine Sekunde). */
  jetzt: Messpunkt;
  verlauf: Messpunkt[];
  cgroup: 'v2' | 'v1' | null;
  /** Erlaubte Kerne des Containers; ohne Grenze die des Rechners. */
  kerne: number;
  kerneBegrenzt: boolean;
  speicher: { belegt: number | null; grenze: number | null; ohneGrenze: boolean };
  anteile: Anteile;
  /** Systemlast des Rechners (1, 5, 15 Minuten) und seine Kerne. */
  last: [number, number, number];
  hostKerne: number;
  netz: boolean;
  /** PostgreSQL läuft im selben Container (dms-komplett)? Sonst sieht das DMS dessen Auslastung nicht. */
  datenbankImContainer: boolean;
  warnung: Warnung[];
  /** Mehrere Prozesse (#745): je Prozess; fehlt mit einem Prozess. */
  prozesse?: ProzessZeile[];
}

/**
 * Ein Prozess von Ablago (#745): Hauptprozess (verteilt nur), Leiter (Anfragen und Arbeit im Hintergrund) oder
 * Prozess für Anfragen. `speicher` in Byte (Pss, sonst RSS), `cpu` in Prozent eines Kerns, Wartezeit der
 * Ereignisschleife (p99) in ms, `anfragen` gerade in Arbeit; null = nicht verfügbar (z. B. keine Antwort).
 */
export interface ProzessZeile {
  nr: number; pid: number; rolle: 'haupt' | 'leiter' | 'anfragen';
  speicher: number | null; cpu: number | null; schleifeP99: number | null; anfragen: number | null;
}

/** Woran der Systemzustand warnt: CPU, Arbeitsspeicher (#409) und Wartezeit der Ereignisschleife (#542). */
export type Warnung = 'cpu' | 'speicher' | 'schleife';

/**
 * Warnung bei hoher Wartezeit des Servers (#542): Liegt die Verzögerung der Ereignisschleife bei 99 % der
 * Messungen (p99) über `SCHLEIFE_GRENZE_MS`, und das in jedem der letzten `SCHLEIFE_MINUTEN` Minutenfenster.
 */
export const SCHLEIFE_GRENZE_MS = 100;
export const SCHLEIFE_MINUTEN = 5;

/** Arbeiter für PDF und große Exporte (#542), wie Werkbank → Systemzustand sie zeigt. */
export type ArbeiterStand =
  | { aus: true; quelle: 'vorgabe' | 'umgebung'; kerne: number }
  | {
    aus: false; quelle: 'vorgabe' | 'umgebung'; kerne: number;
    groesse: number; arbeiter: number; beschaeftigt: number; wartend: number;
    erledigt: number; fehler: number; zeitueberschreitungen: number; abgewiesen: number;
    mittlereDauerMs: number | null; mittleresWartenMs: number | null; laengstesWartenMs: number; zeitMs: number; warteschlangeMax: number;
    zuletztAbgewiesen?: string | null;
  };

/**
 * Einstellungen für viele gleichzeitige Anfragen (#544): nur per Umgebungsvariable, im Systemzustand zum Ansehen –
 * mit ihrem Wert und ob er aus der Umgebung oder der Vorgabe stammt.
 */
export const VARIABLE = { prozesse: 'DMS_PROZESSE', arbeiter: 'DMS_ARBEITER', verbindungen: 'DMS_DB_VERBINDUNGEN', anfragen: 'DMS_MAX_ANFRAGEN' } as const;
export type Einstellbar = keyof typeof VARIABLE;
/**
 * `quelle` 'auto': DMS_PROZESSE=auto (#745). `prozesse` (#745): Mit mehreren Prozessen gelten Arbeiter und gleichzeitige
 * Anfragen **je Prozess** – dann steht hier ihre Zahl, die Oberfläche zeigt auch die Summe. Verbindungen gelten seit #874
 * für alle Prozesse zusammen: `wert` ist die Summe, `aufteilung` der Anteil des Leiters und jedes weiteren Prozesses.
 */
export interface Grenzwert {
  wert: number; quelle: 'vorgabe' | 'umgebung' | 'auto'; variable: (typeof VARIABLE)[Einstellbar]; min: number; max: number; prozesse?: number;
  aufteilung?: { leiter: number; andere: number; prozesse: number };
  /**
   * Nur bei `verbindungen` (#1198): Belegung des Pools gerade jetzt – in dem Prozess, der antwortet (mit mehreren
   * Prozessen `prozess`). `reserviert`: für eine Transaktion bzw. fest vergeben; `sperren`: gehaltene Sitzungssperren
   * (Zeitpläne, Dauersperren) auf der eigenen Sperrverbindung.
   */
  belegung?: { pool: number; belegt: number; reserviert: number; wartend: number; sperren: string[]; prozess?: number };
}
export type Grenzwerte = Partial<Record<Einstellbar, Grenzwert>>;

/**
 * Engpässe (#544), je mit der Variable, die man ändern müsste:
 * - schleife: Wartezeit des Servers dauerhaft hoch (siehe SCHLEIFE_GRENZE_MS) → DMS_ARBEITER (Arbeit aus dem Hauptfaden)
 * - verbindungen: Abfragen warten in der letzten Minute üblich länger als VERBINDUNG_WARTEN_MS → DMS_DB_VERBINDUNGEN
 * - arbeiter: Warteschlange der Arbeiter war voll (Aufträge abgewiesen) → DMS_ARBEITER
 * - ueberlast: Überlastschutz hat abgewiesen (503) → DMS_MAX_ANFRAGEN
 * Abgewiesenes zählt ENGPASS_MINUTEN lang.
 */
export type Engpass = 'schleife' | 'verbindungen' | 'arbeiter' | 'ueberlast';
export const ENGPASS_VARIABLE: Record<Engpass, (typeof VARIABLE)[Einstellbar]> = {
  schleife: VARIABLE.arbeiter, verbindungen: VARIABLE.verbindungen, arbeiter: VARIABLE.arbeiter, ueberlast: VARIABLE.anfragen,
};
export const VERBINDUNG_WARTEN_MS = 50;
export const ENGPASS_MINUTEN = 15;

export function engpaesseAus(o: {
  schleife: boolean;
  verbindungen?: { median: number | null; messungen: number } | null;
  arbeiterAbgewiesen?: string | null;
  ueberlastAbgewiesen?: string | null;
  jetzt?: number;
}): Engpass[] {
  const jetzt = o.jetzt ?? Date.now();
  const kuerzlich = (iso?: string | null) => !!iso && jetzt - Date.parse(iso) <= ENGPASS_MINUTEN * 60_000;
  const e: Engpass[] = [];
  if (o.schleife) e.push('schleife');
  if (o.verbindungen && o.verbindungen.messungen >= 6 && o.verbindungen.median !== null && o.verbindungen.median > VERBINDUNG_WARTEN_MS) e.push('verbindungen');
  if (kuerzlich(o.arbeiterAbgewiesen)) e.push('arbeiter');
  if (kuerzlich(o.ueberlastAbgewiesen)) e.push('ueberlast');
  return e;
}

/** Warnung, wenn ein Wert so lange über der Schwelle liegt (#409: „RAM > 90 % länger als 5 Minuten“). */
export const SCHWELLE_PROZENT = 90;
export const SCHWELLE_MINUTEN = 5;
export const VERLAUF_MINUTEN = 60;

/** Welche Werte die letzten `minuten` Messpunkte lang durchgehend über der Schwelle lagen. */
export function dauerhaftHoch(verlauf: Messpunkt[], minuten = SCHWELLE_MINUTEN, schwelle = SCHWELLE_PROZENT): Array<'cpu' | 'speicher'> {
  const letzte = verlauf.slice(-minuten);
  if (letzte.length < minuten) return [];
  return (['cpu', 'speicher'] as const).filter((k) => letzte.every((p) => p[k] !== null && p[k]! >= schwelle));
}
