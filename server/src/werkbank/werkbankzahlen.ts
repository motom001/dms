/**
 * Zahlen für die linke Spalte der Werkbank (#375).
 *
 * Die Übersicht wird beim Betreten der Werkbank einmal abgerufen und liefert diese Zahlen mit,
 * damit die Navigation sie sofort zeigt – auch für Bereiche, die ihre Daten erst beim Öffnen laden.
 * Eine Quelle, die fehlt oder fehlschlägt, ergibt null (dann zeigt die Navigation keine Zahl).
 * Welche Zahlen es gibt, sagt die Liste der Werkbank-Seiten (`zaehler` in shared/src/werkbankansicht.ts, #1281).
 */
import { ZAEHLER, type Zaehler } from '../../../shared/src/werkbankansicht';
import { istOffen, type AuskunftZustand } from '../../../shared/src/auskunft';

/**
 * Je Zähler der Liste die Anzahl; `benutzer` zählt nur aktive Benutzer, `darfWeg` archivierte Mappen nach Ablauf der
 * Frist (#212), `auskuenfte` nur offene Auskünfte (#1585, wie die Leiste nach dem Laden des Bereichs).
 */
export type WerkbankZahlen = Record<Zaehler, number | null>;

export type WerkbankZahlenQuellen = { [Z in Exclude<Zaehler, 'benutzer' | 'auskuenfte'>]?: () => Promise<readonly unknown[]> } & {
  benutzer?: () => Promise<ReadonlyArray<{ aktiv?: boolean }>>;
  auskuenfte?: () => Promise<ReadonlyArray<{ zustand: AuskunftZustand }>>;
};

/** Was ein Zähler zählt, wenn nicht jedes Element: nur aktive Benutzer, nur offene Auskünfte. */
const ZAEHLT: Partial<Record<Zaehler, (x: unknown) => boolean>> = {
  benutzer: (b) => (b as { aktiv?: boolean }).aktiv === true,
  auskuenfte: (e) => istOffen((e as { zustand: AuskunftZustand }).zustand),
};

async function anzahl(
  f: (() => Promise<readonly unknown[]>) | undefined,
  zaehlt: (x: unknown) => boolean = () => true,
): Promise<number | null> {
  if (!f) return null;
  try {
    return (await f()).filter(zaehlt).length;
  } catch {
    return null;
  }
}

export async function werkbankZahlen(q: WerkbankZahlenQuellen): Promise<WerkbankZahlen> {
  const werte = await Promise.all(ZAEHLER.map((z) => anzahl(q[z], ZAEHLT[z])));
  return Object.fromEntries(ZAEHLER.map((z, i) => [z, werte[i]])) as WerkbankZahlen;
}
