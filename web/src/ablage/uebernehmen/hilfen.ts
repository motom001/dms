import type { SchwaerzSeite } from '../../../../shared/src/schwaerzen';
import type { WortSeite } from '../../../../shared/src/archivfassung';

/** Höchstens so viele Dokumente gehen in Erkennung und Abgleich (wie der Server). */
export const DOKS_MAX = 10;
/** Belege je Verweisfeld als Rahmen. */
export const BELEGE_MAX = 3;
/** Rahmen suchen in Scheiben dieser Länge (ms), dazwischen ist der Browser frei (#1255). */
export const HAEPPCHEN_MS = 8;

export type Laden<T> = T | null | 'fehlt';
/** Seiten mit Wörtern; `archiv` (#1137): Seiten der Archivfassung – das Original lässt sich nicht als Seiten zeigen (E-Mail). */
export interface Woerter {
  seiten: SchwaerzSeite[];
  mitText: boolean;
  archiv?: boolean;
}

export const alsSeiten = (w: WortSeite[]): SchwaerzSeite[] =>
  w.map((s) => ({ breite: s.breite ?? 1, hoehe: s.hoehe ?? 1, woerter: s.woerter }));
export const kurz = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()} …` : s);
