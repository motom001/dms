import { kinderVon, type Sicht } from '../../../../shared/src/sichten';

/** Zeilen des Ansichtenbaums (#73): jede Sicht mit ihrer Tiefe, in der Reihenfolge des Baums. */
export type Zeile = { s: Sicht; tiefe: number };
export function baumzeilen(alle: Sicht[]): Zeile[] {
  const erg: Zeile[] = [];
  const gehe = (eltern: string | null, tiefe: number) => {
    for (const s of kinderVon(alle, eltern)) {
      erg.push({ s, tiefe });
      gehe(s.id, tiefe + 1);
    }
  };
  gehe(null, 0);
  return erg;
}
