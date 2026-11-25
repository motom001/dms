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

/* ---------- Formate (#1610) ---------- */

/** Datumsformat für Daten in Ziffern; `null` heißt überall „wie die Sprache“. */
export const DATUMSFORMATE = ['tt.mm.jjjj', 'jjjj-mm-tt', 'tt/mm/jjjj', 'mm/tt/jjjj'] as const;
export const UHRZEITFORMATE = ['24', '12'] as const;
/** Tausender- und Dezimalzeichen, wie sie aussehen. */
export const ZAHLENFORMATE = ['1.234,56', '1,234.56', '1 234,56', '1’234.56'] as const;
export const WAEHRUNG_STELLUNGEN = ['vorne', 'hinten'] as const;
/** Telefonnummern (#1609): kanonisch „+49 (351) 1234567“, DIN 5008 international „+49 351 1234567“, national „0351 1234567“. */
export const TELEFONFORMATE = ['kanonisch', 'din-international', 'din-national'] as const;
/** Wochenbeginn: 1 = Montag, 7 = Sonntag, 6 = Samstag (wie die Wochentage im Profil). */
export const WOCHENBEGINNE = [1, 7, 6] as const;
type Datumsformat = (typeof DATUMSFORMATE)[number];
type Uhrzeitformat = (typeof UHRZEITFORMATE)[number];
type Zahlenformat = (typeof ZAHLENFORMATE)[number];
type WaehrungStellung = (typeof WAEHRUNG_STELLUNGEN)[number];
export type Telefonformat = (typeof TELEFONFORMATE)[number];
export type Wochenbeginn = (typeof WOCHENBEGINNE)[number];

/**
 * Formate der Region (#1610). `null` = Vorgabe aus der Sprache (Intl), eine eigene Wahl überschreibt sie. Arbeitstage
 * 1 = Mo … 7 = So; die ISO-Kalenderwoche beginnt immer am Montag, egal welcher Wochenbeginn gilt.
 */
export interface Formate {
  datum: Datumsformat | null;
  uhrzeit: Uhrzeitformat | null;
  zahlen: Zahlenformat | null;
  waehrungStellung: WaehrungStellung | null;
  /** Standardwährung (ISO 4217) für neue Beträge ohne eigene Währung am Feld. */
  waehrung: string;
  telefon: Telefonformat;
  /** Standard-Ländervorwahl ohne „+“, z. B. „49“: gilt für Nummern ohne Ländervorwahl. */
  vorwahl: string;
  arbeitstage: number[];
  wochenbeginn: Wochenbeginn | null;
}
/** Vorgabe – so ändert ein Update nichts an Datum, Zahlen und Beträgen; Telefonnummern zeigt Ablago nach DIN 5008. */
export const FORMATE_STANDARD: Formate = {
  datum: null,
  uhrzeit: null,
  zahlen: null,
  waehrungStellung: null,
  waehrung: 'EUR',
  telefon: 'din-national',
  vorwahl: '49',
  arbeitstage: [1, 2, 3, 4, 5],
  wochenbeginn: null,
};
const aus = <T extends string | number>(liste: readonly T[], v: unknown): T | null => (liste.includes(v as T) ? (v as T) : null);
export const istWaehrung = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
export const istVorwahl = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,2}$/.test(v);

/** Liest gespeicherte Formate; Unbekanntes fällt auf die Vorgabe zurück. */
export function liesFormate(v: unknown): Formate {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const tage = Array.isArray(o.arbeitstage)
    ? [...new Set(o.arbeitstage.filter((x): x is number => [1, 2, 3, 4, 5, 6, 7].includes(x as number)))]
    : null;
  return {
    datum: aus(DATUMSFORMATE, o.datum),
    uhrzeit: aus(UHRZEITFORMATE, o.uhrzeit),
    zahlen: aus(ZAHLENFORMATE, o.zahlen),
    waehrungStellung: aus(WAEHRUNG_STELLUNGEN, o.waehrungStellung),
    waehrung: istWaehrung(o.waehrung) ? o.waehrung : FORMATE_STANDARD.waehrung,
    telefon: aus(TELEFONFORMATE, o.telefon) ?? FORMATE_STANDARD.telefon,
    vorwahl: istVorwahl(o.vorwahl) ? o.vorwahl : FORMATE_STANDARD.vorwahl,
    arbeitstage: tage ? tage.sort((a, b) => a - b) : FORMATE_STANDARD.arbeitstage,
    wochenbeginn: aus(WOCHENBEGINNE, o.wochenbeginn),
  };
}

export interface Region {
  land: Land;
  bundesland: Bundesland | null;
  zeitzone: string;
  /** Formate (#1610); fehlen sie in einer älteren Einstellung, gelten die Vorgaben. */
  formate: Formate;
}
/** Neue Installation: Deutschland, ohne Bundesland, Europe/Berlin (Lena muss nichts tun). */
export const REGION_STANDARD: Region = { land: 'DE', bundesland: null, zeitzone: STANDARD_ZEITZONE, formate: FORMATE_STANDARD };

/** Liest einen gespeicherten Wert; Unbekanntes fällt auf die Vorgabe zurück. */
export function liesRegion(v: unknown, bundeslandAlt: unknown = null): Region {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    land: istLand(o.land) ? o.land : REGION_STANDARD.land,
    // Bis #726 stand das Bundesland bei der Täglichen Zusammenfassung – es zieht ohne Zutun mit um.
    bundesland: istBundesland(o.bundesland) ? o.bundesland : v ? null : istBundesland(bundeslandAlt) ? bundeslandAlt : null,
    zeitzone: istZeitzone(o.zeitzone) ? o.zeitzone : STANDARD_ZEITZONE,
    formate: liesFormate(o.formate),
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

let formateJetzt: Formate = FORMATE_STANDARD;
/** Die eingestellten Formate der Ablage (#1610). */
export const formate = () => formateJetzt;
/** Setzt die Formate für diesen Prozess (Server nach dem Lesen der Einstellung, Oberfläche nach dem Kontostatus). */
export function setzeFormate(f: unknown) {
  formateJetzt = liesFormate(f);
}
/** Rechnet mit anderen Formaten, etwa für die Vorschau eines Entwurfs in der Werkbank (#1610); danach gelten wieder die alten. */
export function mitFormaten<T>(f: Formate, rechne: () => T): T {
  const vorher = formateJetzt;
  formateJetzt = f;
  try {
    return rechne();
  } finally {
    formateJetzt = vorher;
  }
}
/** Wochenbeginn, der gilt: die eigene Wahl, sonst der der Sprache (Intl), sonst Montag. */
export function wochenbeginn(): Wochenbeginn {
  if (formateJetzt.wochenbeginn) return formateJetzt.wochenbeginn;
  try {
    const l = new Intl.Locale(gebietsschema()) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    return aus(WOCHENBEGINNE, (l.getWeekInfo?.() ?? l.weekInfo)?.firstDay) ?? 1;
  } catch {
    return 1;
  }
}

const datumsformate = new Map<string, Intl.DateTimeFormat>();
/**
 * Ein Datumsformat in der eingestellten Zeitzone – zwischengespeichert, damit nicht jeder Aufruf ein neues baut. Jedes
 * neue Format belegt Speicher außerhalb der Halde (ICU), den erst die Speicherbereinigung wieder freigibt – bei einem
 * Export über 20.000 Mappen je Zeile eines: über 100 MB nativer Speicher je Export (#970). `fest` statt der
 * eingestellten Zeitzone, z. B. 'UTC' für reine Kalendertage.
 */
export function datumsformat(sprache: string, optionen: Intl.DateTimeFormatOptions = {}, fest?: string): Intl.DateTimeFormat {
  const zone = fest ?? aktuell;
  const k = `${zone}|${sprache}|${JSON.stringify(optionen)}`;
  let f = datumsformate.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(sprache, { ...optionen, timeZone: zone });
    datumsformate.set(k, f);
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
export const zeitText = (d: Date, optionen: Intl.DateTimeFormatOptions, sprache = gebietsschema()) => {
  const o: Intl.DateTimeFormatOptions = DATUM_ZEIT_TEILE.some((k) => optionen[k] !== undefined)
    ? optionen
    : { ...optionen, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
  // Formate der Region (#1610) nur in der Sprache der Oberfläche – feste Formate wie „sv-SE“ bleiben, wie sie sind.
  return sprache === gebietsschema() ? regionDatum(d, o) : datumsformat(sprache, o).format(d);
};

/* ---------- Datum, Uhrzeit, Zahlen und Beträge nach den Formaten der Region (#1610) ---------- */

const ZIFFERN = new Set(['numeric', '2-digit']);
/** Steht das Datum nur in Ziffern da (Tag, Monat, Jahr)? Nur dann gilt das Datumsformat der Region. */
const nurZiffern = (o: Intl.DateTimeFormatOptions) =>
  o.dateStyle === 'short' ||
  (!o.dateStyle && ZIFFERN.has(String(o.day)) && ZIFFERN.has(String(o.month)) && o.year !== undefined && !o.weekday && !o.era);
/** Uhrzeit nach Region: 24 oder 12 Stunden, wenn die Optionen es nicht selbst festlegen. */
function mitUhrzeit(o: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  const u = formateJetzt.uhrzeit;
  if (!u || (o.hour === undefined && !o.timeStyle) || o.hourCycle !== undefined || o.hour12 !== undefined) return o;
  return { ...o, hourCycle: u === '12' ? 'h12' : 'h23' };
}
const zwei = (x: string) => x.padStart(2, '0');
/** „dateStyle: short“ schreibt das Jahr oft zweistellig – mit eigenem Datumsformat steht es immer vierstellig da. */
function ausgeschrieben(o: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  if (o.dateStyle !== 'short') return o;
  const { dateStyle: _d, timeStyle, ...rest } = o;
  const zeit: Intl.DateTimeFormatOptions = timeStyle
    ? { hour: '2-digit', minute: '2-digit', ...(timeStyle === 'short' ? {} : { second: '2-digit' }) }
    : {};
  return { ...rest, day: '2-digit', month: '2-digit', year: 'numeric', ...zeit };
}
function datumNach(f: Datumsformat, w: Record<string, string>): string {
  if (f === 'jjjj-mm-tt') return `${w.year}-${zwei(w.month)}-${zwei(w.day)}`;
  if (f === 'tt/mm/jjjj') return `${w.day}/${w.month}/${w.year}`;
  if (f === 'mm/tt/jjjj') return `${w.month}/${w.day}/${w.year}`;
  return `${w.day}.${w.month}.${w.year}`;
}
const DATUMSTEILE = new Set(['day', 'month', 'year']);
/**
 * Datum (und Uhrzeit) für Menschen in der Sprache der Oberfläche und nach den Formaten der Region (#1610): Uhrzeit mit
 * 24 oder 12 Stunden, ein Datum in Ziffern in der gewählten Reihenfolge. Ohne eigene Wahl wie `datumsformat`.
 */
export function regionDatum(d: Date, optionen: Intl.DateTimeFormatOptions, fest?: string): string {
  const df = formateJetzt.datum;
  if (!df || !nurZiffern(optionen)) return datumsformat(gebietsschema(), mitUhrzeit(optionen), fest).format(d);
  const f = datumsformat(gebietsschema(), mitUhrzeit(ausgeschrieben(optionen)), fest);
  const teile = f.formatToParts(d);
  const von = teile.findIndex((p) => DATUMSTEILE.has(p.type));
  const bis = teile.length - 1 - [...teile].reverse().findIndex((p) => DATUMSTEILE.has(p.type));
  if (von < 0) return f.format(d);
  const w = Object.fromEntries(teile.filter((p) => DATUMSTEILE.has(p.type)).map((p) => [p.type, p.value]));
  return [...teile.slice(0, von).map((p) => p.value), datumNach(df, w), ...teile.slice(bis + 1).map((p) => p.value)].join('');
}
const TRENNER: Record<Zahlenformat, [string, string]> = {
  '1.234,56': ['.', ','],
  '1,234.56': [',', '.'],
  '1 234,56': ['\u00a0', ','],
  '1’234.56': ['’', '.'],
};
/**
 * Zahl oder Betrag für Menschen in der Sprache der Oberfläche und nach den Formaten der Region (#1610): Tausender- und
 * Dezimalzeichen, Währung vorne oder hinten. Ohne eigene Wahl wie `zahlformat`.
 */
export function regionZahl(n: number, optionen: Intl.NumberFormatOptions = {}): string {
  const f = zahlformat(gebietsschema(), optionen);
  const { zahlen, waehrungStellung } = formateJetzt;
  if (!zahlen && !waehrungStellung) return f.format(n);
  const [gruppe, dezimal] = zahlen ? TRENNER[zahlen] : [null, null];
  const teile = f
    .formatToParts(n)
    .map((p) => (p.type === 'group' && gruppe ? gruppe : p.type === 'decimal' && dezimal ? dezimal : p.value));
  const w = f.formatToParts(n).findIndex((p) => p.type === 'currency');
  if (!waehrungStellung || w < 0) return teile.join('');
  const zeichen = teile[w];
  const rest = teile
    .filter((_, i) => i !== w)
    .join('')
    .trim();
  return waehrungStellung === 'vorne' ? `${zeichen}\u00a0${rest}` : `${rest}\u00a0${zeichen}`;
}
