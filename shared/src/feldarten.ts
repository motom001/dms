/**
 * Feldarten „Zeitraum“ und „Prozent“ (#1035) – Lesen, Schreiben und Vergleichen an einer Stelle für Server und
 * Oberfläche. Kündigungsfrist „3 Monate“, Laufzeit „24 Monate“, Steuersatz „19 %“.
 *
 * **Zeitraum** wird als `{ anzahl, einheit }` gespeichert (wie der Betrag als `{ betrag, waehrung }`): ganze Zahl
 * 0–9999 und eine der Einheiten Tage, Wochen, Monate, Jahre. Die Einheit bleibt, wie sie eingetragen wurde – „3 Monate“
 * wird nie zu „13 Wochen“. Zum Vergleichen (Sortieren, Bedingungen, Suche) zählt die Länge in Tagen: ein Monat
 * 30,4375 Tage, ein Jahr 365,25 Tage (beides im Mittel; so sind 12 Monate gleich 1 Jahr). Als kurze Schreibweise
 * (Bedingungen, Adressen, Pakete, Schnittstelle) gilt ISO 8601 `P3M` – `P10D`, `P2W`, `P3M`, `P1Y`.
 *
 * **Prozent** wird als Zahl gespeichert, wie sie auf dem Papier steht (19 für „19 %“, nicht 0,19). „19“, „19 %“ und
 * „19,0“ ergeben dasselbe. Angezeigt wird mit schmalem geschütztem Leerzeichen (U+202F) vor dem Zeichen, wenn die
 * Sprache dort einen Abstand setzt (Deutsch „19 %“, Englisch „19%“).
 */
import { gebietsschema } from './sprache';
import { t } from './texte';

/* ---------- Zeitraum ---------- */

export const ZEITRAUM_EINHEITEN = ['tage', 'wochen', 'monate', 'jahre'] as const;
export type Zeitraumeinheit = (typeof ZEITRAUM_EINHEITEN)[number];
export interface Zeitraum { anzahl: number; einheit: Zeitraumeinheit }
/** Größte Anzahl eines Zeitraums (9999 Jahre reichen für jede Frist). */
export const ZEITRAUM_ANZAHL_MAX = 9999;

/** Tage je Einheit – für Sortieren und Vergleichen (Monat und Jahr im Mittel, beide im Binärsystem genau). */
export const TAGE_JE_EINHEIT: Readonly<Record<Zeitraumeinheit, number>> = { tage: 1, wochen: 7, monate: 30.4375, jahre: 365.25 };
const ISO_BUCHSTABE: Readonly<Record<Zeitraumeinheit, string>> = { tage: 'D', wochen: 'W', monate: 'M', jahre: 'Y' };
const AUS_ISO: Readonly<Record<string, Zeitraumeinheit>> = { D: 'tage', W: 'wochen', M: 'monate', Y: 'jahre' };

export const istZeitraumeinheit = (e: unknown): e is Zeitraumeinheit => typeof e === 'string' && (ZEITRAUM_EINHEITEN as readonly string[]).includes(e);
/** Sieht der Wert aus wie ein Zeitraum (Objekt mit Einheit)? Ob er gültig ist, sagt `istZeitraum`. */
export const hatZeitraumform = (v: unknown): v is { anzahl?: unknown; einheit?: unknown } =>
  !!v && typeof v === 'object' && !Array.isArray(v) && 'einheit' in v;
/** Ein gültiger, gespeicherter Zeitraum. */
export function istZeitraum(v: unknown): v is Zeitraum {
  if (!hatZeitraumform(v)) return false;
  const n = v.anzahl;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= ZEITRAUM_ANZAHL_MAX && istZeitraumeinheit(v.einheit);
}

/** Einheiten, wie man sie schreibt – deutsch und englisch, Einzahl, Mehrzahl und gebeugt. */
const WOERTER: ReadonlyArray<[RegExp, Zeitraumeinheit]> = [
  [/^(t|tag|tage|tagen|tages|d|day|days)$/, 'tage'],
  [/^(w|wo|woche|wochen|wk|wks|week|weeks)$/, 'wochen'],
  [/^(m|mon|monat|monate|monaten|monats|mo|month|months)$/, 'monate'],
  [/^(j|jahr|jahre|jahren|jahres|y|yr|yrs|year|years)$/, 'jahre'],
];
const ISO = /^P(\d{1,4})([DWMY])$/i;

/**
 * Zeitraum aus einer Eingabe: `{ anzahl, einheit }` (Anzahl auch als Text), `P3M` oder Text wie „3 Monate“,
 * „1 Jahr“, „14 days“. null = leer, undefined = kein Zeitraum.
 */
export function leseZeitraum(v: unknown): Zeitraum | null | undefined {
  if (v == null || v === '') return null;
  if (hatZeitraumform(v)) {
    const roh = v.anzahl;
    if (roh == null || roh === '') return null;
    const n = typeof roh === 'number' ? roh : /^\s*\d{1,4}\s*$/.test(String(roh)) ? Number(String(roh).trim()) : NaN;
    const z = { anzahl: n, einheit: v.einheit };
    return istZeitraum(z) ? z : undefined;
  }
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\s\u00a0\u202f]+/g, ' ').trim();
  if (!s) return null;
  const iso = ISO.exec(s);
  if (iso) return { anzahl: Number(iso[1]), einheit: AUS_ISO[iso[2].toUpperCase()] };
  const m = /^(\d{1,4}) ?([A-Za-z.]+)$/.exec(s);
  if (!m) return undefined;
  const wort = m[2].toLowerCase().replace(/\.$/, '');
  const e = WOERTER.find(([re]) => re.test(wort))?.[1];
  return e ? { anzahl: Number(m[1]), einheit: e } : undefined;
}

/** Kurze Schreibweise nach ISO 8601: `P3M`. */
export const zeitraumIso = (z: Zeitraum) => `P${z.anzahl}${ISO_BUCHSTABE[z.einheit]}`;
/** Länge in Tagen (zum Vergleichen; Monat 30,4375 und Jahr 365,25 Tage). */
export const zeitraumTage = (z: Zeitraum) => z.anzahl * TAGE_JE_EINHEIT[z.einheit];

/** „1 Monat“, „3 Monate“ – Einzahl und Mehrzahl in der Sprache der Person (auch in Titeln und Platzhaltern). */
export function zeitraumText(z: Zeitraum): string {
  return t.frei(`gemeinsam.feldarten.zeitraum.${z.einheit}`, { anzahl: z.anzahl });
}
/** Name einer Einheit passend zur Anzahl: „Monat“ bei 1, sonst „Monate“ (Auswahl im Formular). */
export function einheitText(e: Zeitraumeinheit, anzahl: number = 2): string {
  return t.frei(`gemeinsam.feldarten.einheit.${e}`, { anzahl });
}

/* ---------- Prozent ---------- */

/** Prozent aus einer Eingabe: „19“, „19 %“, „19,0“, „7.5%“ oder eine Zahl. null = leer, NaN = keine Zahl. */
export function leseProzent(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[\s\u00a0\u202f]+/g, '').replace(/\u2212/g, '-').replace(/%$/, '');
  if (s === '') return null;
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(norm) ? Number(norm) : NaN;
}

/** Wo das Prozentzeichen steht und ob die Sprache einen Abstand setzt (aus `Intl`, je Gebietsschema gemerkt). */
const ZEICHEN = new Map<string, { vorne: boolean; abstand: boolean }>();
function zeichenart(gebiet: string) {
  let z = ZEICHEN.get(gebiet);
  if (!z) {
    const teile = new Intl.NumberFormat(gebiet, { style: 'percent' }).formatToParts(0.19);
    const i = teile.findIndex((x) => x.type === 'percentSign');
    const zahl = teile.findIndex((x) => x.type === 'integer');
    const zwischen = teile.slice(Math.min(i, zahl) + 1, Math.max(i, zahl));
    z = { vorne: i >= 0 && i < zahl, abstand: zwischen.some((x) => x.type === 'literal' && /\s/.test(x.value)) };
    ZEICHEN.set(gebiet, z);
  }
  return z;
}

/**
 * Minuszeichen (U+2212) statt Bindestrich – gut sichtbar in Listen, nicht nur über die Farbe (#1035). Nur für die
 * Anzeige in der Oberfläche; Titel, CSV und Schnittstelle behalten den Bindestrich, den Programme als Minus lesen.
 */
export const mitMinus = (s: string) => s.replace(/^-/, '\u2212').replace(/^(\D*?)-(?=\d)/, '$1\u2212');

/** „19 %“ (Deutsch, mit U+202F) bzw. „19%“ (Englisch); Nachkommastellen nach dem Feld, sonst wie eingetragen. */
export function prozentText(n: number, nachkomma?: number | null): string {
  const gebiet = gebietsschema();
  const zahl = n.toLocaleString(gebiet, { maximumFractionDigits: nachkomma ?? 10 });
  const z = zeichenart(gebiet);
  const abstand = z.abstand ? '\u202f' : '';
  return z.vorne ? `%${abstand}${zahl}` : `${zahl}${abstand}%`;
}

/* ---------- Gemeinsam ---------- */

/** Feldarten mit Zahlen: in Trefferlisten rechtsbündig, Ziffern gleich breit. */
export const ZAHLENARTEN = ['zahl', 'betrag', 'prozent'] as const;
export const rechtsbuendig = (typ: string | undefined) => !!typ && (ZAHLENARTEN as readonly string[]).includes(typ);
