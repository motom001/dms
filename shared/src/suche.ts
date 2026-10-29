/**
 * Volltextsuche (#45, #161): Neben Wortformen („Rechnung“ → „Rechnungen“) findet die Suche einen Begriff
 * auch als Teil eines Wortes („Ofen“ → „Backofen“, „Ofenrohr“). Server (PostgreSQL und Arbeitsspeicher) teilt
 * diese Regeln.
 */

/** Ab so vielen Zeichen je Begriff wird auch in Wörtern gesucht; kürzere passen sonst fast überall. */
export const TEILWORT_MIN = 3;

/**
 * Begriffe für die Teilwortsuche, klein geschrieben – oder null, wenn nur ganze Wörter gesucht werden:
 * bei Anführungszeichen (bewusst ganze Wörter), mit Minus (Wort ausschließen) oder wenn ein Begriff kürzer als
 * TEILWORT_MIN ist.
 */
export function teilwoerter(suche: string): string[] | null {
  if (/["„“”]/.test(suche)) return null;
  const roh = suche.toLowerCase().split(/\s+/).filter(Boolean);
  // Ein Minus schließt ein Wort aus – dann bleibt es bei der Wortsuche.
  if (roh.some((x) => x.startsWith('-'))) return null;
  const w = roh.map((x) => x.replace(/^\++/, '')).filter(Boolean)
    // „or“ verknüpft in der Wortsuche zwei Begriffe; für Teilwörter zählt es nicht als Begriff.
    .filter((x) => x !== 'or');
  if (!w.length || w.some((x) => x.length < TEILWORT_MIN)) return null;
  return w;
}

/** Ganze Wörter eines Textes, klein geschrieben (für die Suche im Arbeitsspeicher). */
export const woerterIn = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
