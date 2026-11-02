/**
 * Favoriten benachrichtigen – Freigabe für die Installation (#506, Folge von #422).
 *
 * Der Administrator erlaubt „bei Änderungen an Favoriten benachrichtigen“ für alle, nur für bestimmte
 * Rollen oder für niemanden, und setzt die Vorgabe für neue Benutzer. „Rolle“ meint beides: die
 * Systemrollen Administrator und Mitglied (feste Einträge) und die fachlichen Rollen aus der
 * Benutzerverwaltung. Beide sind Rollen-Mappen; gespeichert werden ihre Ids. Ein Benutzer ist frei-
 * gegeben, wenn er mindestens eine der gewählten Rollen hat.
 *
 * Die persönliche Einstellung („favoriten_benachrichtigen“, Profil und Favoritenliste) bleibt gespeichert
 * und greift wieder, sobald die Freigabe zurückkommt.
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

/** Ohne Einstellung wie bisher: für alle erlaubt, Vorgabe an. */
export const FREIGABE_STANDARD: FavoritenFreigabe = { erlaubt: 'alle', rollen: [], vorgabe: true };

/** Gespeicherten Wert lesen; Unbekanntes fällt auf den Standard zurück. */
export function liesFavoritenFreigabe(v: unknown): FavoritenFreigabe {
  if (!v || typeof v !== 'object') return { ...FREIGABE_STANDARD, rollen: [] };
  const o = v as Record<string, unknown>;
  const erlaubt = FREIGABEN.includes(o.erlaubt as Freigabe) ? o.erlaubt as Freigabe : 'alle';
  const rollen = Array.isArray(o.rollen) ? [...new Set(o.rollen.filter((x): x is string => typeof x === 'string' && !!x))] : [];
  return { erlaubt, rollen, vorgabe: o.vorgabe !== false };
}

/** Darf ein Benutzer mit diesen Rollen (Ids der Rollen-Mappen, Systemrolle eingeschlossen) benachrichtigt werden? */
export function favoritenErlaubt(f: FavoritenFreigabe, rollenDesBenutzers: Iterable<string>): boolean {
  if (f.erlaubt === 'alle') return true;
  if (f.erlaubt === 'aus') return false;
  const gewaehlt = new Set(f.rollen);
  for (const r of rollenDesBenutzers) if (gewaehlt.has(r)) return true;
  return false;
}

/** Gespeichert wird nur, was vom Standard abweicht (`null` löscht die Einstellung). */
export function freigabeZumSpeichern(f: FavoritenFreigabe): FavoritenFreigabe | null {
  const rollen = f.erlaubt === 'rollen' ? f.rollen : [];
  return f.erlaubt === 'alle' && f.vorgabe ? null : { erlaubt: f.erlaubt, rollen, vorgabe: f.vorgabe };
}
