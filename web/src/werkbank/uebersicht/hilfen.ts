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
