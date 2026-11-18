import { BUNDESLAENDER, istBundesland, type Bundesland } from './feiertage';
import { gebietsschema } from './sprache';

/**
 * Region der Ablage (#726): Land, Bundesland und Zeitzone an einer Stelle (Werkbank → Einstellungen → Region).
 *
 * Die Zeitzone gilt für alles, was „heute“, Uhrzeiten oder Kalendertage braucht: Tägliche Zusammenfassung,
 * „Datum erreicht“ und Zeitpläne, Auskünfte, Kalender, Datumsangaben in E-Mails und Dokumenten.
 * Der Server liest sie aus der Datenbank (Einstellung „region“) und setzt sie hier mit `setzeZeitzone`;
 * die Oberfläche übernimmt sie aus dem Kontostatus. Vorgabe ist Europe/Berlin – so ändert ein Update nichts.
 */

/** Länder, für die es Feiertage gibt. Weitere kommen hier dazu (Schlüssel nach ISO 3166-1). */
export const LAENDER = { DE: 'Deutschland' } as const;
export type Land = keyof typeof LAENDER;
export const istLand = (v: unknown): v is Land => typeof v === 'string' && v in LAENDER;

export const STANDARD_ZEITZONE = 'Europe/Berlin';

/** Gängige Zeitzonen für die Auswahl (Europa zuerst); jede andere gültige IANA-Zone wird beim Speichern auch angenommen. */
export const ZEITZONEN: readonly string[] = [
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Luxembourg',
  'Europe/Paris',
  'Europe/Copenhagen',
  'Europe/Oslo',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Budapest',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Athens',
  'Europe/Istanbul',
  'Atlantic/Canary',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

/** Gibt es diese Zeitzone (IANA)? */
export function istZeitzone(v: unknown): v is string {
  if (typeof v !== 'string' || !v || v.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

export interface Region {
  land: Land;
  bundesland: Bundesland | null;
  zeitzone: string;
}
/** Neue Installation: Deutschland, ohne Bundesland, Europe/Berlin (Lena muss nichts tun). */
export const REGION_STANDARD: Region = { land: 'DE', bundesland: null, zeitzone: STANDARD_ZEITZONE };

/** Liest einen gespeicherten Wert; Unbekanntes fällt auf die Vorgabe zurück. */
export function liesRegion(v: unknown, bundeslandAlt: unknown = null): Region {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    land: istLand(o.land) ? o.land : REGION_STANDARD.land,
    // Bis #726 stand das Bundesland bei der Täglichen Zusammenfassung – es zieht ohne Zutun mit um.
    bundesland: istBundesland(o.bundesland) ? o.bundesland : v ? null : istBundesland(bundeslandAlt) ? bundeslandAlt : null,
    zeitzone: istZeitzone(o.zeitzone) ? o.zeitzone : STANDARD_ZEITZONE,
  };
}

export { BUNDESLAENDER };

let aktuell = STANDARD_ZEITZONE;
/** Die eingestellte Zeitzone der Ablage. */
export const zeitzone = () => aktuell;
/** Setzt die Zeitzone für diesen Prozess (Server nach dem Lesen der Einstellung, Oberfläche nach dem Kontostatus). */
export function setzeZeitzone(z: unknown) {
  if (istZeitzone(z)) aktuell = z;
}

const formate = new Map<string, Intl.DateTimeFormat>();
/**
 * Ein Datumsformat in der eingestellten Zeitzone – zwischengespeichert, damit nicht jeder Aufruf ein neues baut. Jedes
 * neue Format belegt Speicher außerhalb der Halde (ICU), den erst die Speicherbereinigung wieder freigibt – bei einem
 * Export über 20.000 Mappen je Zeile eines: über 100 MB nativer Speicher je Export (#970). `fest` statt der
 * eingestellten Zeitzone, z. B. 'UTC' für reine Kalendertage.
 */
export function datumsformat(sprache: string, optionen: Intl.DateTimeFormatOptions = {}, fest?: string): Intl.DateTimeFormat {
  const zone = fest ?? aktuell;
  const k = `${zone}|${sprache}|${JSON.stringify(optionen)}`;
  let f = formate.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(sprache, { ...optionen, timeZone: zone });
    formate.set(k, f);
  }
  return f;
}
const zahlformate = new Map<string, Intl.NumberFormat>();
/**
 * Ein Zahlformat (auch Währung) – zwischengespeichert wie {@link datumsformat} (#970). Wie `n.toLocaleString(sprache,
 * optionen)`; ungültige Optionen (unbekannte Währung) werfen wie dort und werden nicht gemerkt.
 */
export function zahlformat(sprache: string, optionen: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const k = `${sprache}|${JSON.stringify(optionen)}`;
  let f = zahlformate.get(k);
  if (!f) {
    f = new Intl.NumberFormat(sprache, optionen);
    zahlformate.set(k, f);
  }
  return f;
}
/** Kalendertag JJJJ-MM-TT in der eingestellten Zeitzone. */
export const tagIn = (d: Date = new Date()) => datumsformat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
/** Teile, die ein Datumsformat festlegen; fehlen alle, ergänzt `Date.toLocaleString` Datum und Uhrzeit (ECMA-402). */
const DATUM_ZEIT_TEILE = [
  'weekday',
  'year',
  'month',
  'day',
  'dayPeriod',
  'hour',
  'minute',
  'second',
  'fractionalSecondDigits',
  'dateStyle',
  'timeStyle',
] as const;
/**
 * Wie `Date.toLocaleString(sprache, optionen)`, aber in der eingestellten Zeitzone und mit dem gemerkten Format
 * ({@link datumsformat}, #1335) statt einem neuen je Aufruf. Ohne Angabe zu Datum oder Uhrzeit wie dort beides in
 * Ziffern; `zeitText(d, {}, 'sv-SE')` ergibt so „2026-11-18 14:03:05“.
 */
export const zeitText = (d: Date, optionen: Intl.DateTimeFormatOptions, sprache = gebietsschema()) =>
  datumsformat(
    sprache,
    DATUM_ZEIT_TEILE.some((k) => optionen[k] !== undefined)
      ? optionen
      : { ...optionen, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' },
  ).format(d);
