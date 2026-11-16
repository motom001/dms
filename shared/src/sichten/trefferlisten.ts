/** Sichten (#1278 aus sichten.ts): Trefferlisten und Spalten einer Sicht (#75). */
import { type Mappentyp, trefferlistenVon, istSystemspalte, GEMISCHTE_SPALTEN } from '../model';
import { t } from '../texte';

/* ---------- Trefferlisten einer Sicht (#75) ---------- */

/** Eine Trefferliste, wie sie eine Sicht verwenden kann. */
export interface Sichtliste {
  key: string;
  name: string;
  spalten: string[];
  standard: boolean;
}

/**
 * Trefferlisten, die alle Typen haben (gleicher Schlüssel), mit nur den Spalten, die alle
 * diese Listen haben – Felder zudem mit gleichem Datentyp. Reihenfolge wie beim ersten Typ.
 * Standard ist eine Liste, wenn sie es bei allen Typen ist.
 */
export function gemeinsameTrefferlisten(typen: Mappentyp[]): Sichtliste[] {
  if (!typen.length) return [];
  const je = typen.map((t) => trefferlistenVon(t));
  return je[0].flatMap((l) => {
    const andere = je.map((ls) => ls.find((x) => x.key === l.key));
    if (andere.some((x) => !x)) return [];
    const feld = (t: Mappentyp, k: string) => t.felder.find((f) => f.key === k);
    const spalten = l.spalten.filter(
      (k) =>
        andere.every((x) => x!.spalten.includes(k)) &&
        (istSystemspalte(k) || typen.every((t) => feld(t, k) && feld(t, k)!.typ === feld(typen[0], k)!.typ)),
    );
    return [
      { key: l.key, name: [...new Set(andere.map((x) => x!.name))].join(' / '), spalten, standard: andere.every((x) => x!.standard) },
    ];
  });
}

/** Spalten, die eine Sicht zeigt; ungueltig = die gewählte Liste gibt es nicht (mehr), es gilt der Standard. */
export interface Spaltenwahl {
  key: string | null;
  name: string;
  spalten: string[];
  ungueltig: boolean;
}

/**
 * Welche Spalten eine Sicht mit diesen (wirksamen) Typen zeigt: die gewählte Trefferliste,
 * sonst die Standardliste (bei mehreren Typen die gemeinsame), sonst die Systemspalten.
 */
export function spaltenDerSicht(typen: Mappentyp[], wahl?: string | null): Spaltenwahl {
  const system: Spaltenwahl = { key: null, name: 'Systemspalten', spalten: GEMISCHTE_SPALTEN, ungueltig: false };
  if (!typen.length) return { ...system, ungueltig: !!wahl };
  const listen = gemeinsameTrefferlisten(typen);
  const gewaehlt = wahl ? listen.find((l) => l.key === wahl) : undefined;
  const ungueltig = !!wahl && !gewaehlt;
  const l = gewaehlt ?? listen.find((x) => x.standard);
  if (!l) return { ...system, ungueltig };
  if (typen.length === 1) return { key: l.key, name: l.name, spalten: l.spalten, ungueltig };
  // Mehrere Typen: Titel und Typ stehen immer vorn, damit jede Zeile erkennbar bleibt.
  const rest = l.spalten.filter((k) => k !== '_titel' && k !== '_typ');
  return { key: l.key, name: l.name, spalten: ['_titel', '_typ', ...rest], ungueltig };
}

/** Hinweis für die Werkbank, wenn die gewählte Trefferliste nicht (mehr) passt. */
export function trefferlistenProblem(wahl: string | null | undefined, typen: Mappentyp[]): string | null {
  if (!wahl) return null;
  if (!typen.length) return t('gemeinsam.sichten.die-ansicht-hat-keine');
  return spaltenDerSicht(typen, wahl).ungueltig ? t('gemeinsam.sichten.die-trefferliste-gibt-es', { anzahl: typen.length, wahl }) : null;
}
