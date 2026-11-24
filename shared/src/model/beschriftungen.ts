/**
 * Beschriftungen in weiteren Sprachen (#728) – nur die Form, wie Feld, Register, Abschnitt und Mappentyp sie tragen
 * (#1278, Schritt 5; vorher in beschriftung.ts). Was sie bedeuten und wie sie gelesen werden, steht in beschriftung.ts.
 */

/** Beschriftungen je Sprache: Sprache → Teile. */
export type Beschriftungen<T> = Partial<Record<string, T>>;
/** Name eines Registers, einer Trefferliste. */
export interface NamensTeile {
  name?: string;
}

/** Überschrift eines Abschnitts im Feldregister (#890). */
export interface AbschnittTeile {
  titel?: string;
}

/** Name und Beschreibung eines Mappentyps bzw. einer Ansicht; beim Mappentyp auch „Woran man ihn erkennt“ (#937). */
export interface TypTeile {
  name?: string;
  beschreibung?: string;
  erkennbarAn?: string;
  /** Mehrzahl des Mappentyps (#1446), z. B. „Contracts“ zu „Contract“. */
  mehrzahl?: string;
}

/** Bezeichnung, Hilfetext und Beschriftung der Optionen (fester Wert → Text) eines Felds. */
export interface FeldTeile {
  label?: string;
  hilfe?: string;
  optionen?: Record<string, string>;
  /** Tabelle (#1030): Beschriftung von „+ Neu“, z. B. „+ Item“. */
  neu?: string;
}
