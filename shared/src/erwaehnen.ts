/**
 * Erwähnen mit @ (#889): Server und Oberfläche teilen hier die persönliche Einstellung „Wenn ein Favorit erwähnt wird“
 * und was für die tägliche Zusammenfassung gemerkt wird.
 */

/** Schlüssel der persönlichen Einstellung. */
export const FAVORIT_ERWAEHNT = 'favorit_erwaehnt';
/** Gemerkte Erwähnungen von Favoriten bis zur nächsten täglichen Zusammenfassung. */
export const FAVORIT_ERWAEHNT_OFFEN = 'favorit_erwaehnt_offen';
export const FAVORIT_ERWAEHNT_WAHL = ['sofort', 'zusammenfassung', 'nie'] as const;
export type FavoritErwaehntWahl = typeof FAVORIT_ERWAEHNT_WAHL[number];
/** Gespeicherter Wert → Wahl; Vorgabe: in der täglichen Zusammenfassung. */
export const favoritErwaehntWahl = (v: unknown): FavoritErwaehntWahl => (FAVORIT_ERWAEHNT_WAHL as readonly unknown[]).includes(v) ? v as FavoritErwaehntWahl : 'zusammenfassung';
/** Eine gemerkte Erwähnung: in welcher Mappe (quelle), welcher Favorit (ziel), wo („in einer Notiz“), wann. */
export interface FavoritErwaehntMerk { quelle: string; ziel: string; ort: string; am: string }
