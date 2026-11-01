/**
 * Zahlen für die linke Spalte der Werkbank (#375).
 *
 * Die Übersicht wird beim Betreten der Werkbank einmal abgerufen und liefert diese Zahlen mit,
 * damit die Navigation sie sofort zeigt – auch für Bereiche, die ihre Daten erst beim Öffnen laden.
 * Eine Quelle, die fehlt oder fehlschlägt, ergibt null (dann zeigt die Navigation keine Zahl).
 */
export interface WerkbankZahlen {
  nummernkreise: number | null;
  pakete: number | null;
  /** Aktive Benutzer. */
  benutzer: number | null;
  postfaecher: number | null;
  /** Archivierte Mappen nach Ablauf der Frist (#212). */
  darfWeg: number | null;
}

export interface WerkbankZahlenQuellen {
  nummernkreise?: () => Promise<readonly unknown[]>;
  pakete?: () => Promise<readonly unknown[]>;
  benutzer?: () => Promise<ReadonlyArray<{ aktiv?: boolean }>>;
  postfaecher?: () => Promise<readonly unknown[]>;
  darfWeg?: () => Promise<readonly unknown[]>;
}

async function anzahl<T>(f: (() => Promise<readonly T[]>) | undefined, zaehlt: (x: T) => boolean = () => true): Promise<number | null> {
  if (!f) return null;
  try { return (await f()).filter(zaehlt).length; } catch { return null; }
}

export async function werkbankZahlen(q: WerkbankZahlenQuellen): Promise<WerkbankZahlen> {
  const [nummernkreise, pakete, benutzer, postfaecher, darfWeg] = await Promise.all([
    anzahl(q.nummernkreise),
    anzahl(q.pakete),
    anzahl(q.benutzer, (b) => b.aktiv === true),
    anzahl(q.postfaecher),
    anzahl(q.darfWeg),
  ]);
  return { nummernkreise, pakete, benutzer, postfaecher, darfWeg };
}
