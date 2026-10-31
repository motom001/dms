/**
 * Archivmodus (#212): Aufbewahrungsfristen je Mappentyp. Die Frist läuft bis zum Ende des
 * Kalenderjahres des Stichtags plus N Jahre; vorher lässt sich nichts löschen.
 * Unterstützt eine GoBD-gerechte Aufbewahrung – ersetzt keine Verfahrensdokumentation.
 */
import type { Mappe } from './model';

export interface Archiv {
  /** Aufbewahrungsfrist in Jahren. */
  jahre: number;
  /** Datumsfeld, das zählt (z. B. Rechnungsdatum); null = Anlagedatum der Mappe. */
  stichtag: string | null;
}

/** Vorschläge mit Begründung (Stand 2025). */
export const FRISTEN = [
  { jahre: 2, text: 'Handwerkerrechnungen privat (§ 14b UStG)' },
  { jahre: 6, text: 'Geschäftsbriefe' },
  { jahre: 8, text: 'Buchungsbelege (seit 2025)' },
  { jahre: 10, text: 'Bücher und Aufzeichnungen' },
] as const;
export const JAHRE_MAX = 30;

const ZEITZONE = 'Europe/Berlin';
const tag = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: ZEITZONE }).format(d);

/** „aufbewahren bis“ als JJJJ-12-31, oder null ohne Archivmodus. */
export function aufbewahrenBis(a: Archiv | null | undefined, m: Pick<Mappe, 'werte' | 'erstellt'>): string | null {
  if (!a) return null;
  const v = a.stichtag ? m.werte?.[a.stichtag] : null;
  const datum = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : tag(m.erstellt ? new Date(m.erstellt) : new Date());
  return `${Number(datum.slice(0, 4)) + a.jahre}-12-31`;
}

/** Noch in der Frist? (Am letzten Tag der Frist noch geschützt.) */
export const inFrist = (bis: string | null, jetzt = new Date()) => bis !== null && tag(jetzt) <= bis;

/** 2034-12-31 → 31.12.2034 */
export const datumText = (iso: string) => iso.split('-').reverse().join('.');
