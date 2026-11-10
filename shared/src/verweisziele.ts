/**
 * Ziele eines Verweisfelds (#1036): ein oder mehrere Mappentypen, bei Systemfeldern auch „jede Mappe“. Eigene Datei ohne
 * Abhängigkeiten, damit model.ts, folgtaus.ts, erkennung.ts und andere sie ohne Kreis nutzen können; model.ts gibt alles
 * weiter.
 */
import type { Feld } from './model';

/** Ziel eines Referenzfelds, das auf Mappen jedes Typs zeigen darf – nur für Systemfelder (Post → Zugeordnet zu, #58, #192). */
export const BELIEBIGER_TYP = '*';

/** Höchstzahl der Zieltypen eines Verweisfelds und der optionalen Zieltypen (Eingaben, Pakete). */
export const ZIELTYPEN_MAX = 50;
type MitZielen = Pick<Feld, 'zielTypen'>;
/** Darf das Feld auf Mappen jedes Typs zeigen (Systemfelder wie „Bezug“)? */
export const jedeMappe = (f: MitZielen): boolean => !!f.zielTypen?.includes(BELIEBIGER_TYP);
/** Die Ziel-Mappentypen (Ids) – ohne „jede Mappe“; leer bei „jede Mappe“ oder wenn (noch) keiner da ist. */
export const zieleVon = (f: MitZielen): string[] => (jedeMappe(f) ? [] : (f.zielTypen ?? []).filter(Boolean));
/** Darf das Feld auf eine Mappe dieses Typs zeigen? */
export const zielErlaubt = (f: MitZielen, typId: string | undefined): boolean => !!typId && (jedeMappe(f) || !!f.zielTypen?.includes(typId));
/** Der eine Zieltyp, wenn es genau einen gibt (Auswahlfilter, „folgt aus“, Spalten über den Verweis) – sonst undefined. */
export const einzigesZiel = (f: MitZielen): string | undefined => { const z = zieleVon(f); return !jedeMappe(f) && z.length === 1 ? z[0] : undefined; };
/** Mehr als ein möglicher Zieltyp (mehrere oder „jede Mappe“): Dann gibt es „zeigt auf Mappe vom Typ …“ und „alle vom selben Typ“. */
export const mehrereZiele = (f: MitZielen): boolean => jedeMappe(f) || zieleVon(f).length > 1;
/** Zeigen beide Felder auf dieselben Zieltypen (Reihenfolge egal)? */
export const gleicheZiele = (a: MitZielen, b: MitZielen): boolean => {
  const x = new Set(a.zielTypen ?? []); const y = new Set(b.zielTypen ?? []);
  return x.size === y.size && [...x].every((v) => y.has(v));
};

/**
 * Felder, die jede dieser Feldlisten hat – gleiche Kennung und Feldart, bei Verweisen dieselben Ziele (#1036): Grundlage
 * für Auswahlfilter und Spalten über ein Verweisfeld mit mehreren Zieltypen.
 */
export function gemeinsameFelder(listen: Feld[][]): Feld[] {
  const [erste, ...rest] = listen;
  if (!erste) return [];
  return erste.filter((f) => rest.every((l) => l.some((g) => g.key === f.key && g.typ === f.typ && (f.typ !== 'referenz' || gleicheZiele(f, g)))));
}

/** Liste von Typ-Ids aus einer Eingabe: Texte, ohne Doppelte, „*“ allein, höchstens {@link ZIELTYPEN_MAX}. */
export function zielTypenAus(v: unknown): string[] {
  const roh = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
  const l = [...new Set(roh.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))].slice(0, ZIELTYPEN_MAX);
  return l.includes(BELIEBIGER_TYP) ? [BELIEBIGER_TYP] : l;
}

/**
 * Alte Form lesen, neue schreiben (#1036): `zielTyp: "<id>"` → `zielTypen: ["<id>"]`. Für Eingaben (Schnittstelle,
 * Einrichtungsdatei, Sicherung, Vollexport) und alles, was gespeicherte Felder von außen bekommt; die Datenbank zieht
 * Migration 095 um. Andere Felder bleiben, wie sie sind.
 */
export function normalisiereZiele<F extends Partial<Feld>>(f: F): F {
  const x = f as F & { zielTyp?: unknown };
  if (!x || typeof x !== 'object' || !('zielTyp' in x)) return f;
  const { zielTyp, ...rest } = x;
  if (rest.typ !== 'referenz') return rest as unknown as F;
  return { ...rest, zielTypen: Array.isArray(rest.zielTypen) && rest.zielTypen.length ? zielTypenAus(rest.zielTypen) : zielTypenAus(zielTyp) } as unknown as F;
}

