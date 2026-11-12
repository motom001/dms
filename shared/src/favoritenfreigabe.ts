/**
 * Favoriten benachrichtigen – frühere Freigabe der Werkbank (#506, Folge von #422).
 *
 * Bis 0.256 erlaubte der Administrator unter Werkbank → Aufgaben „bei Änderungen an Favoriten benachrichtigen“ für
 * alle, nur für bestimmte Rollen oder für niemanden und setzte die Vorgabe für neue Benutzer (Einstellung
 * `favoriten_freigabe`). Seit #1001 steht das in der Automatisierung „Favoriten-Änderungen melden“ (Dann-Karte
 * `favoriten` mit `rollen` und `vorgabe`); beim Update liest der Motor die alte Einstellung einmal mit
 * {@link liesFavoritenFreigabe} und übernimmt sie (server/src/automatisierung.ts, `favoritenFreigabeUebernehmen`).
 */

export type Freigabe = 'alle' | 'rollen' | 'aus';
export const FREIGABEN: readonly Freigabe[] = ['alle', 'rollen', 'aus'];

export interface FavoritenFreigabe {
  erlaubt: Freigabe;
  /** Ids der Rollen-Mappen (Systemrollen und fachliche Rollen), nur bei `erlaubt: 'rollen'` wirksam. */
  rollen: string[];
  /** Vorgabe für neue Benutzer: Benachrichtigung an. Ändert keine bestehenden Benutzer. */
  vorgabe: boolean;
}

/** Gespeicherten Wert lesen; Unbekanntes fällt auf den Standard zurück (für alle, Vorgabe an). */
export function liesFavoritenFreigabe(v: unknown): FavoritenFreigabe {
  if (!v || typeof v !== 'object') return { erlaubt: 'alle', rollen: [], vorgabe: true };
  const o = v as Record<string, unknown>;
  const erlaubt = FREIGABEN.includes(o.erlaubt as Freigabe) ? o.erlaubt as Freigabe : 'alle';
  const rollen = Array.isArray(o.rollen) ? [...new Set(o.rollen.filter((x): x is string => typeof x === 'string' && !!x))] : [];
  return { erlaubt, rollen, vorgabe: o.vorgabe !== false };
}
