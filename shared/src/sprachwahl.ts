/**
 * Sprache wählen (#729): Welche Sprachen gibt es in der Ablage, und welche gilt für wen?
 *
 * - **Werkbank → Sprachen:** Der Administrator legt die erlaubten Sprachen fest und die Sprache der Installation. Sie
 *   gilt für alle, die nichts gewählt haben, vor der Anmeldung, für Titel und Texte, die der Server einmal für alle
 *   bildet, und für E-Mails an Personen ohne eigene Wahl. Fest eingebaut sind Deutsch und Englisch, weitere kommen als
 *   Sprachpaket (#731).
 * - **Mein Konto:** Jede Person wählt ihre Sprache aus den erlaubten. Ist ihre Sprache nicht mehr erlaubt, gilt wieder
 *   die der Installation – gespeichert bleibt ihre Wahl.
 *
 * Gespeichert in der Einstellung `sprachen` (Server) und je Person in `benutzer.sprache` (Migration 081).
 */
import { AUSGANGSSPRACHE, EINGEBAUTE_SPRACHEN, registrierteSprachen, sprachangaben } from './sprache';
import { SPRACHKENNUNG } from './beschriftung';

export interface Spracheinstellung {
  /** Sprache der Installation. */
  standard: string;
  /** Erlaubte Sprachen; die Sprache der Installation ist immer dabei. */
  erlaubt: string[];
}
/** Neue Installation und Update: Deutsch, beide eingebauten Sprachen erlaubt – so ändert ein Update nichts. */
export const SPRACHEN_STANDARD: Spracheinstellung = { standard: AUSGANGSSPRACHE, erlaubt: [...EINGEBAUTE_SPRACHEN] };

/** Sprachen, die es in dieser Installation gibt: eingebaut und aus Sprachpaketen. */
export const verfuegbareSprachen = (): string[] => [...new Set<string>([...EINGEBAUTE_SPRACHEN, ...registrierteSprachen()])];
export const istVerfuegbar = (v: unknown): v is string =>
  typeof v === 'string' && SPRACHKENNUNG.test(v) && verfuegbareSprachen().includes(v);

/** Gespeicherten Wert lesen; Unbekanntes fällt weg, ohne gültige Sprache gilt die Vorgabe. */
export function liesSpracheinstellung(v: unknown): Spracheinstellung {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const standard = istVerfuegbar(o.standard) ? o.standard : SPRACHEN_STANDARD.standard;
  const liste = Array.isArray(o.erlaubt) ? o.erlaubt.filter(istVerfuegbar) : SPRACHEN_STANDARD.erlaubt;
  return { standard, erlaubt: verfuegbareSprachen().filter((s) => s === standard || liste.includes(s)) };
}

/** Sprache einer Person: ihre Wahl, wenn erlaubt, sonst die der Installation. */
export function wirksameSprache(gewaehlt: string | null | undefined, e: Spracheinstellung): string {
  return gewaehlt && e.erlaubt.includes(gewaehlt) ? gewaehlt : e.standard;
}

/** Maschinell übersetzt (aus dem Sprachpaket, #731)? Dann zeigt Mein Konto „Maschinell übersetzt – Verbesserungen willkommen“. */
export const istMaschinell = (spr: string) => !!sprachangaben(spr).maschinell;

/** Wo man bei einer Übersetzung mitmachen kann (Entwicklerhandbuch → Pakete → Sprachpakete, #731). */
export const MITMACHEN_URL = 'https://help.ablago.app/entwickler/aktuell/pakete/#sprachpakete';

/** Sprache aus einer Kopfzeile wie `Accept-Language: en-GB,en;q=0.9` bzw. `X-Sprache: en` – die erste verfügbare. */
export function spracheAusKopf(kopf: string | undefined, erlaubt: readonly string[]): string | undefined {
  if (!kopf) return undefined;
  for (const teil of kopf.split(',').slice(0, 10)) {
    const k = teil.split(';')[0].trim();
    if (erlaubt.includes(k)) return k;
    const grund = k.split('-')[0].toLowerCase();
    if (erlaubt.includes(grund)) return grund;
  }
  return undefined;
}
