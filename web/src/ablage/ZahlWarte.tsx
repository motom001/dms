/**
 * Platzhalter für die Zahl einer Ansicht, solange die Zahlen noch nachkommen (#512): Die Ablage
 * erscheint ohne sie; die Zahl füllt sich an derselben Stelle ein, ohne dass etwas springt.
 */
export function ZahlWarte() {
  return <span className="zahl sz-warte" aria-hidden="true">…</span>;
}
