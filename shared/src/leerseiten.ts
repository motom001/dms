/**
 * Leerseiten (#997): Ein Paket mit `dms:leerseiten` (z. B. „Leerseiten“ aus dem Paketkatalog) markiert Seiten eines
 * Dokuments in neuer Post als leer. Der Kern zeigt die Markierung (Seitenleiste in der Post und auf „Dokument
 * übernehmen“), die Person kann je Seite „Doch behalten“ bzw. „Auch weglassen“ wählen, und beim Übernehmen in eine
 * Mappe entsteht das Dokument ohne diese Seiten – das Original bleibt als frühere Fassung. Ohne Übernehmen wird nichts
 * gelöscht. Eigene Datei ohne Abhängigkeiten zur Laufzeit, damit Modell, Server und Oberfläche sie ohne Kreis nutzen.
 *
 * Regeln (Sicherheit): Das Paket markiert nur – es löscht nichts und ändert weder Datei noch Mappe (kein „zuletzt
 * geändert“, keine Historie, kein Ereignis). Nur Dokumente in Post, die das Paket lesen darf; die Markierung gilt nur
 * für die Datei, für die sie gesetzt wurde (`sha256`) – nach einer neuen Fassung ist sie weg.
 */

/** Ab dieser Version kennt Ablago `dms:leerseiten` (#997); ältere lehnen die Schnittstelle beim Installieren ab. */
export const DMS_LEERSEITEN_AB = '0.255.0';
/** Höchstens so viele Seiten prüft und markiert ein Paket je Dokument (wie die Seitenbilder der Seitenansicht). */
export const LEERSEITEN_SEITEN_MAX = 400;

/** Markierung an einem Dokument, wie sie das Dokument mitliefert (`Dokument.leerseiten`). */
export interface Leerseiten {
  /** Id des Pakets, das markiert hat; null, wenn nur eine Person gewählt hat. */
  paket: string | null;
  /** Name des Pakets beim Markieren (steht neben der Hinweiszeile). */
  paketName?: string | null;
  /** Prüfwert der Datei, für die die Markierung gilt. */
  sha256: string;
  /** Seitenzahl der Datei beim Markieren. */
  seiten: number;
  /** Vom Paket als leer erkannte Seiten (ab 1). */
  erkannt: number[];
  /** „Doch behalten“: erkannte Seiten, die bleiben sollen. */
  behalten: number[];
  /** „Auch weglassen“: weitere Seiten, die beim Übernehmen wegfallen sollen. */
  weglassen: number[];
  /** Zeitpunkt (ISO) der letzten Änderung. */
  geaendert: string;
}

/** Was beim Übernehmen mit markierten Seiten geschieht (Eingabe `leerseiten` an „Zuordnen“). */
export type LeerseitenWahl = 'weglassen' | 'behalten';

const sortiert = (l: Iterable<number>) => [...new Set(l)].sort((a, b) => a - b);

/** Gilt die Markierung für diese Datei? (Nach einer neuen Fassung nicht mehr.) */
export const leerseitenGelten = (d: { sha256: string; leerseiten?: Leerseiten | null }): d is { sha256: string; leerseiten: Leerseiten } =>
  !!d.leerseiten && d.leerseiten.sha256 === d.sha256;

/** Die Seiten, die beim Übernehmen wegfallen: erkannt ohne „Doch behalten“, dazu „Auch weglassen“ – aufsteigend. */
export function wegfallendeSeiten(l: Leerseiten | null | undefined): number[] {
  if (!l) return [];
  const behalten = new Set(l.behalten);
  return sortiert([...l.erkannt.filter((n) => !behalten.has(n)), ...l.weglassen]).filter((n) => n >= 1 && n <= l.seiten);
}

/**
 * Fallen beim Übernehmen Seiten weg – und bleibt mindestens eine? Ein Dokument fällt nie ganz weg: Sind alle Seiten
 * markiert (z. B. ein leerer Scan), bleibt es so, wie es ist.
 */
export function wirdGekuerzt(d: { sha256: string; mime: string; leerseiten?: Leerseiten | null }): boolean {
  if (d.mime !== 'application/pdf' || !leerseitenGelten(d)) return false;
  const weg = wegfallendeSeiten(d.leerseiten);
  return weg.length > 0 && weg.length < d.leerseiten.seiten;
}

/** Ist die Seite markiert (fällt sie weg)? */
export const faelltWeg = (l: Leerseiten | null | undefined, nr: number): boolean => wegfallendeSeiten(l).includes(nr);

/** Ist die Seite vom Paket als leer erkannt? */
export const istErkannt = (l: Leerseiten | null | undefined, nr: number): boolean => !!l?.erkannt.includes(nr);

/**
 * Seitenliste aus einer Eingabe prüfen: ganze Zahlen von 1 bis `seiten`, je einmal, aufsteigend. Gibt die Liste zurück
 * oder den Grund (`liste`, `seite`, `zu-viele`) für die Fehlermeldung.
 */
export function pruefeSeitenliste(roh: unknown, seiten: number): { seiten: number[] } | { fehler: 'liste' | 'seite' | 'zu-viele' } {
  if (!Array.isArray(roh)) return { fehler: 'liste' };
  if (roh.length > LEERSEITEN_SEITEN_MAX) return { fehler: 'zu-viele' };
  if (roh.some((n) => typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > seiten)) return { fehler: 'seite' };
  return { seiten: sortiert(roh as number[]) };
}

/**
 * Wahl einer Person für eine Seite (#997, „Doch behalten“ / „Auch weglassen“): `weglassen` true = die Seite fällt
 * beim Übernehmen weg, false = sie bleibt. Für erkannte Seiten über `behalten`, für andere über `weglassen`.
 */
export function waehle(l: Leerseiten, nr: number, weglassen: boolean, jetzt: string): Leerseiten {
  const erkannt = l.erkannt.includes(nr);
  const behalten = new Set(l.behalten), weg = new Set(l.weglassen);
  if (erkannt) { weg.delete(nr); if (weglassen) behalten.delete(nr); else behalten.add(nr); }
  else { behalten.delete(nr); if (weglassen) weg.add(nr); else weg.delete(nr); }
  return { ...l, behalten: sortiert(behalten), weglassen: sortiert(weg), geaendert: jetzt };
}

/**
 * Neue Erkennung eines Pakets: erkannte Seiten ersetzen. Die Wahl der Person bleibt, wenn die Markierung für dieselbe
 * Datei gilt (sonst beginnt sie leer); „Doch behalten“ nur für Seiten, die weiter erkannt sind.
 */
export function neueErkennung(alt: Leerseiten | null | undefined, e: { paket: string; paketName: string; sha256: string; seiten: number; erkannt: number[] }, jetzt: string): Leerseiten {
  const gleich = !!alt && alt.sha256 === e.sha256;
  const erkannt = sortiert(e.erkannt);
  return {
    paket: e.paket, paketName: e.paketName, sha256: e.sha256, seiten: e.seiten, erkannt,
    behalten: gleich ? alt.behalten.filter((n) => erkannt.includes(n)) : [],
    weglassen: gleich ? alt.weglassen.filter((n) => !erkannt.includes(n) && n <= e.seiten) : [],
    geaendert: jetzt,
  };
}

/** Markierung aus der Datenbank (jsonb) lesen – Fremdes oder Kaputtes ergibt null. */
export function alsLeerseiten(roh: unknown): Leerseiten | null {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null;
  const r = roh as Record<string, unknown>;
  const zahlen = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1) : []);
  if (typeof r.sha256 !== 'string' || typeof r.seiten !== 'number') return null;
  return {
    paket: typeof r.paket === 'string' ? r.paket : null, paketName: typeof r.paketName === 'string' ? r.paketName : null,
    sha256: r.sha256, seiten: r.seiten, erkannt: zahlen(r.erkannt), behalten: zahlen(r.behalten), weglassen: zahlen(r.weglassen),
    geaendert: typeof r.geaendert === 'string' ? r.geaendert : '',
  };
}
