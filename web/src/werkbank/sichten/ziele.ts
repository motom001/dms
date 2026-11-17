import type { Mappentyp } from '../../../../shared/src/model';
import { OPERATOREN_JE_ART, type Bedingung, type Bedingungsfeld } from '../../../../shared/src/sichten';
import { merkmalText } from '../../../../shared/src/merkmale';
import { t } from '../../sprache';

/* ---------- Ziele einer Bedingung: Feld, Register, Anzahl, Frist, Favorit, Merkmal ---------- */

export type Ziel =
  | { wert: 'feld'; feld: Bedingungsfeld }
  | { wert: 'dokumente' | 'verknuepfungen'; register: string; name: string }
  | { wert: 'dokumenteGesamt' | 'verknuepfungenGesamt' | 'favorit' | 'frist' | 'merkmal' | 'merkmalNicht' };
export const ZIEL_GESAMT: Record<'dokumenteGesamt' | 'verknuepfungenGesamt' | 'favorit' | 'frist' | 'merkmal' | 'merkmalNicht', string> = {
  dokumenteGesamt: t('werkbank.sichten.dokumente-insgesamt'),
  verknuepfungenGesamt: t('werkbank.sichten.verknuepfungen-insgesamt'),
  favorit: t('werkbank.sichten.ist-mein-favorit'),
  frist: t('werkbank.sichten.hat-frist-in-den'),
  // Merkmal der Ablage (#1032).
  merkmal: merkmalText('beruflich'),
  merkmalNicht: merkmalText('beruflich', true),
};

/** Register, die alle Typen der Sicht mit gleichem Schlüssel und gleicher Art haben (#66). */
function gemeinsameRegister(typen: Mappentyp[]): Array<{ wert: 'dokumente' | 'verknuepfungen'; register: string; name: string }> {
  if (!typen.length) return [];
  return typen[0].register
    .filter(
      (r) =>
        (r.art === 'dokumente' || r.art === 'verknuepfungen') &&
        typen.every((mappentyp) => mappentyp.register.some((x) => x.key === r.key && x.art === r.art)),
    )
    .map((r) => ({
      wert: r.art as 'dokumente' | 'verknuepfungen',
      register: r.key,
      name: [...new Set(typen.map((mappentyp) => mappentyp.register.find((x) => x.key === r.key)!.name))].join(' / '),
    }));
}

/** Alle wählbaren Ziele für die Typen der Ansicht, in der Reihenfolge der Auswahl. */
export const zieleFuer = (felder: Bedingungsfeld[], typen: Mappentyp[]): Ziel[] => [
  ...felder.map((f) => ({ wert: 'feld' as const, feld: f })),
  { wert: 'dokumenteGesamt' },
  { wert: 'verknuepfungenGesamt' },
  ...gemeinsameRegister(typen),
  { wert: 'favorit' },
  { wert: 'frist' },
  { wert: 'merkmal' },
  { wert: 'merkmalNicht' },
];
export const zielKey = (z: Ziel) => (z.wert === 'feld' ? `feld:${z.feld.key}` : 'register' in z ? `${z.wert}:${z.register}` : z.wert);
export const bKey = (b: Bedingung) =>
  b.art === 'feld'
    ? `feld:${b.feld}`
    : b.art === 'dokumente' || b.art === 'verknuepfungen'
      ? `${b.art}:${b.register}`
      : b.art === 'merkmal' && b.nicht
        ? 'merkmalNicht'
        : b.art;
export const zielName = (z: Ziel) =>
  z.wert === 'feld'
    ? z.feld.label
    : 'register' in z
      ? t('werkbank.sichten.in', {
          wert: z.wert === 'dokumente' ? t('werkbank.sichten.dokumente') : t('werkbank.sichten.verknuepfungen'),
          name: z.name,
        })
      : ZIEL_GESAMT[z.wert];
/** Neue Bedingung für ein Ziel, mit dem ersten passenden Vergleich. */
export const neueBedingung = (z: Ziel): Bedingung =>
  z.wert === 'feld'
    ? { art: 'feld', feld: z.feld.key, op: OPERATOREN_JE_ART[z.feld.art][0] }
    : z.wert === 'favorit'
      ? { art: 'favorit' }
      : z.wert === 'merkmal' || z.wert === 'merkmalNicht'
        ? { art: 'merkmal', merkmal: 'beruflich', ...(z.wert === 'merkmalNicht' ? { nicht: true } : {}) }
        : z.wert === 'frist'
          ? { art: 'frist', feld: null, tage: 30 }
          : 'register' in z
            ? { art: z.wert, register: z.register, vergleich: z.wert === 'dokumente' ? 'gleich' : 'mehr', anzahl: 0 }
            : { art: z.wert, vergleich: z.wert === 'dokumenteGesamt' ? 'gleich' : 'mehr', anzahl: 0 };
