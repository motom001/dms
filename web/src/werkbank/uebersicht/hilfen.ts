import type { ReactNode } from 'react';
import type { Schwere } from '../../../../shared/src/meldungen';
import { t } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';

export const zahl = (n: number) => n.toLocaleString(gebietsschema());
export const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'medium' });
export const bytes = (b: number) =>
  b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;

export const platzText = (o: Array<{ frei: number | null }>) => {
  const f = Math.min(...o.map((x) => x.frei ?? Infinity));
  return Number.isFinite(f) ? bytes(f) : t('werkbank.uebersicht.genug-platz');
};

/** Eine Meldung der Übersicht; `schluessel` bleibt je Meldungsart gleich (#816: Akzeptieren), `datum` sortiert innerhalb der Stufe. */
export interface Hinweis {
  schluessel: string;
  art: Schwere;
  text: ReactNode;
  ziel: string;
  knopf: string;
  datum?: string | null;
  /** Statt „Zur Kenntnis nehmen“: ein Knopf, der den Hinweis endgültig abschließt (#821 „Nein, danke“, #815 „Gelesen“). */
  erledigen?: string;
}
