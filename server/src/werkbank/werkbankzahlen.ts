/**
 * Zahlen für die linke Spalte der Werkbank (#375).
 *
 * Die Übersicht wird beim Betreten der Werkbank einmal abgerufen und liefert diese Zahlen mit,
 * damit die Navigation sie sofort zeigt – auch für Bereiche, die ihre Daten erst beim Öffnen laden.
 * Eine Quelle, die fehlt oder fehlschlägt, ergibt null (dann zeigt die Navigation keine Zahl).
 * Welche Zahlen es gibt, sagt die Liste der Werkbank-Seiten (`zaehler` in shared/src/werkbankansicht.ts, #1281).
 */
import { ZAEHLER, type Zaehler } from '../../../shared/src/werkbankansicht';

/** Je Zähler der Liste die Anzahl; `benutzer` zählt nur aktive Benutzer, `darfWeg` archivierte Mappen nach Ablauf der Frist (#212). */
export type WerkbankZahlen = Record<Zaehler, number | null>;

export type WerkbankZahlenQuellen = { [Z in Exclude<Zaehler, 'benutzer'>]?: () => Promise<readonly unknown[]> } & {
  benutzer?: () => Promise<ReadonlyArray<{ aktiv?: boolean }>>;
};

/** Was ein Zähler zählt, wenn nicht jedes Element: nur aktive Benutzer. */
const ZAEHLT: Partial<Record<Zaehler, (x: unknown) => boolean>> = { benutzer: (b) => (b as { aktiv?: boolean }).aktiv === true };

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
