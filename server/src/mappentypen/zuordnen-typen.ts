/**
 * Post automatisch zuordnen (#337) – eine Entscheidung an einer Stelle (#1639, wie #1635): Ob Ablago erkannte Post von
 * sich aus zuordnet, entscheidet „Was Ablago darf“, Frage 2 („Alles erledigen, ich prüfe danach“). Am Mappentyp steht
 * nur noch die Ausnahme „Hier nie automatisch zuordnen“ (z. B. für Verträge).
 *
 * Gespeichert als Einstellung `zuordnen_typen` (Teil der Sicherung):
 * - `{ ausgenommen: [...] }` – alle Mappentypen folgen „Was Ablago darf“ außer den genannten. Neue Mappentypen gehen mit.
 *   Neue Installationen bekommen bei der Einrichtung `{ ausgenommen: [] }` ({@link ZUORDNEN_ALLE}).
 * - fehlt (bestehende Installation): wie bisher folgt nur, wer den Schalter am Mappentyp eingeschaltet hatte
 *   (`erkennung_typen[id].auto`, #337); alle anderen gelten als Ausnahme. So wird nichts still auf automatisch gestellt.
 *   Die Übersicht fragt einmal „alle angleichen?“; `{ gefragt: true }` heißt: ausgeblendet, die bisherige Form bleibt.
 *
 * Mappentypen im Archivmodus und Systemtypen ordnet Ablago nie automatisch zu (unverändert seit #337).
 */

/** Name der Einstellung. */
export const ZUORDNEN_EINSTELLUNG = 'zuordnen_typen';

/** Wert für neue Installationen und nach „Alle angleichen“: alle Mappentypen folgen „Was Ablago darf“. */
export const ZUORDNEN_ALLE = { ausgenommen: [] as string[] };

/** `alle`: neue Form (alle außer `ausgenommen`); sonst die bisherige Form über den Schalter je Mappentyp. */
export interface ZuordnenStand {
  alle: boolean;
  ausgenommen: Set<string>;
  /** Bisherige Form: Den Hinweis „alle angleichen?“ hat jemand ausgeblendet. */
  gefragt: boolean;
}

/** Die Einstellung lesen; fehlt sie, gilt die bisherige Form. */
export function liesZuordnenStand(v: unknown): ZuordnenStand {
  const o = (v && typeof v === 'object' ? v : {}) as { ausgenommen?: unknown; gefragt?: unknown };
  const alle = Array.isArray(o.ausgenommen);
  return { alle, ausgenommen: new Set(alle ? (o.ausgenommen as unknown[]).map(String) : []), gefragt: o.gefragt === true };
}

/** Den Stand als Einstellung schreiben (null = bisherige Form, nichts gespeichert). */
export const zuordnenWert = (s: ZuordnenStand) =>
  s.alle ? { ausgenommen: [...s.ausgenommen].sort() } : s.gefragt ? { gefragt: true } : null;

/** Erkennung je Mappentyp (`erkennung_typen`), soweit sie hier zählt: der bisherige Schalter. */
type Schalter = Record<string, { auto?: boolean } | undefined>;

/** Folgt dieser Mappentyp „Was Ablago darf“ (true) oder gilt „Hier nie automatisch zuordnen“ (false)? */
export const folgtDarf = (s: ZuordnenStand, erk: Schalter, typId: string) => (s.alle ? !s.ausgenommen.has(typId) : !!erk[typId]?.auto);
