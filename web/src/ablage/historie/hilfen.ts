import { feldLabel } from '../../../../shared/src/beschriftung';
import type { Feldaenderung, Historieneintrag, Mappentyp } from '../../../../shared/src/model';
import type { ReactNode } from 'react';

/** Einzelheiten eines Eintrags und ein kurzer Hinweis, wie viel dahintersteckt (#80); null = nichts aufzuklappen. */
export type Einzelheiten = { hinweis: string; inhalt: ReactNode } | null;
/** Daten eines Historieneintrags. */
export type Eintragsdaten = Historieneintrag['daten'];

export const groesse = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
export const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * Bezeichnung eines geänderten Felds in der Sprache des Lesers (#729): aus dem Mappentyp, solange es das Feld gibt;
 * sonst die beim Ändern gespeicherte.
 */
export const beschrifte = (a: Feldaenderung, typ?: Pick<Mappentyp, 'felder'>) => {
  const f = typ?.felder.find((x) => x.key === a.feld);
  return f && f.label === a.label ? feldLabel(f) : a.label;
};
