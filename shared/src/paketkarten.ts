/**
 * Karten aus Paketen mit Code (#680, `code.karten`): Beschreibung, Werte und Name für Automatisierungen. Eigene Datei,
 * damit automatisierung.ts schlank bleibt.
 */
import { SCHLUESSEL } from './kennungen';
import type { KontextPaket } from './automatisierung';

/** Eine Dann-Karte aus einem Paket: Name, Hilfe und Felder; ausgeführt als Ereignis `zeitplan.ausgefuehrt`. */
export interface PaketKarte { schluessel: string; name: string; hilfe?: string; felder?: Array<{ schluessel: string; name: string; typ: 'text' | 'zahl' | 'janein' }> }

/** Werte für Felder einer Paket-Karte: Schlüssel wie im Manifest, einfache Werte, Text höchstens 500 Zeichen. */
export function kartenWerteRoh(w: unknown): Record<string, string | number | boolean> {
  const roh = w && typeof w === 'object' && !Array.isArray(w) ? Object.entries(w as Record<string, unknown>).slice(0, 20) : [];
  const ok = (v: unknown): v is string | number | boolean => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string';
  return Object.fromEntries(roh.filter(([k, v]) => SCHLUESSEL.test(k) && ok(v)).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 500) : v])) as Record<string, string | number | boolean>;
}

/** Name der Aufgabe: eine Karte aus dem Paket mit ihrem Namen, sonst die Kennung. */
export const aufgabeName = (paket: string, aufgabe: string, pakete: KontextPaket[] | undefined): string =>
  pakete?.find((x) => x.id === paket)?.karten?.find((c) => c.schluessel === aufgabe)?.name ?? aufgabe;
