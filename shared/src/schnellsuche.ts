import { formatiere, type Mappe, type Mappentyp } from './model';

/**
 * Schnell finden auf der Startseite (#497): warum passt eine Mappe zur Suche, und welche zuerst?
 * Reine Funktionen, damit Oberfläche und Tests dasselbe rechnen.
 */

export const suchNormal = (s: string) => s.toLocaleLowerCase('de-DE');
export const suchWoerter = (s: string) => suchNormal(s).split(/\s+/).filter(Boolean);

/** Erstes Feld, dessen Wert alle Suchwörter enthält, sonst eines mit wenigstens einem; Passwörter nie. */
export function trefferGrund(m: Pick<Mappe, 'werte'>, typ: Mappentyp | undefined, woerter: string[], titelVon: (id: string) => string = (id) => id): { feld: string; wert: string } | null {
  if (!typ || !woerter.length) return null;
  const kandidaten = typ.felder.filter((f) => f.typ !== 'passwort')
    .map((f) => ({ feld: f.label, wert: formatiere(f, m.werte[f.key], titelVon) })).filter((x) => x.wert);
  return kandidaten.find((x) => woerter.every((w) => suchNormal(x.wert).includes(w)))
    ?? kandidaten.find((x) => woerter.some((w) => suchNormal(x.wert).includes(w))) ?? null;
}

export interface Suchtreffer<M extends Pick<Mappe, 'id' | 'typId' | 'titel' | 'werte'>> { m: M; titelTreffer: boolean; grund: { feld: string; wert: string } | null }

/**
 * Nach Mappentyp gruppieren: in jeder Gruppe Titeltreffer zuerst, dann alphabetisch; Gruppen mit
 * Titeltreffern zuerst, dann die größeren.
 */
export function gruppiereTreffer<M extends Pick<Mappe, 'id' | 'typId' | 'titel' | 'werte'>>(mappen: M[], typ: (id: string) => Mappentyp | undefined, woerter: string[], titelVon?: (id: string) => string) {
  const nachTyp = new Map<string, Suchtreffer<M>[]>();
  for (const m of mappen) {
    const t: Suchtreffer<M> = { m, titelTreffer: woerter.length > 0 && woerter.every((w) => suchNormal(m.titel ?? '').includes(w)), grund: trefferGrund(m, typ(m.typId), woerter, titelVon) };
    nachTyp.set(m.typId, [...(nachTyp.get(m.typId) ?? []), t]);
  }
  const titel = (m: M) => m.titel ?? '';
  return [...nachTyp.entries()].map(([typId, ts]) => ({
    typId, name: typ(typId)?.name ?? 'Mappe',
    treffer: ts.sort((a, b) => Number(b.titelTreffer) - Number(a.titelTreffer) || titel(a.m).localeCompare(titel(b.m), 'de')),
  })).sort((a, b) => Number(b.treffer[0].titelTreffer) - Number(a.treffer[0].titelTreffer) || b.treffer.length - a.treffer.length || a.name.localeCompare(b.name, 'de'));
}
