import { kinderVon, type Sicht } from './sichten';

/**
 * Ansicht wählen am Handy (#498): statt 40 Reitern in einer Zeile eine Liste mit Suche, angehefteten
 * („Meine Ansichten“), zuletzt benutzten und gruppierten Ansichten. Angeheftet, ausgeblendet und
 * zuletzt benutzt sind Einstellungen des Benutzers (nur für ihn).
 */

export const EINSTELLUNG_ANGEHEFTET = 'ansichten_angeheftet';
export const EINSTELLUNG_AUSGEBLENDET = 'ansichten_ausgeblendet';
export const EINSTELLUNG_ZULETZT = 'ansichten_zuletzt';
export const ZULETZT_MAX = 5;

export interface WahlEintrag { sicht: Sicht; tiefe: number }
export interface WahlGruppe { schluessel: string; name: string; eintraege: WahlEintrag[] }

const liste = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const normal = (s: string) => s.toLocaleLowerCase('de-DE');

/** Zuletzt benutzt: die gerade gewählte Ansicht vorn, ohne Doppelte, höchstens ZULETZT_MAX. */
export function merkeZuletzt(alt: unknown, id: string): string[] {
  return [id, ...liste(alt).filter((x) => x !== id)].slice(0, ZULETZT_MAX);
}

/** Anheften bzw. Ausblenden umschalten. */
export function umschalten(alt: unknown, id: string): string[] {
  const l = liste(alt);
  return l.includes(id) ? l.filter((x) => x !== id) : [...l, id];
}

/**
 * Abschnitte der Auswahl. Mit Suchbegriff: alle passenden Ansichten (auch ausgeblendete) flach, mit dem
 * Namen der Elternansicht davor. Ohne: „Meine Ansichten“, „Zuletzt benutzt“, dann je Ansicht der obersten
 * Ebene mit Unteransichten eine Gruppe (Paket bzw. Bereich), die übrigen unter „Weitere Ansichten“.
 */
export function ansichtAbschnitte(sichten: Sicht[], o: { angeheftet?: unknown; ausgeblendet?: unknown; zuletzt?: unknown; suche?: string }): { meine: Sicht[]; zuletzt: Sicht[]; gruppen: WahlGruppe[]; treffer: Array<{ sicht: Sicht; pfad: string }> | null; ausgeblendet: number } {
  const nachId = new Map(sichten.map((s) => [s.id, s] as const));
  const weg = new Set(liste(o.ausgeblendet).filter((id) => nachId.has(id)));
  const such = normal((o.suche ?? '').trim());
  if (such) {
    const pfad = (s: Sicht) => { const teile: string[] = []; for (let e = s.elternId ? nachId.get(s.elternId) : undefined, n = 0; e && n < 20; e = e.elternId ? nachId.get(e.elternId) : undefined, n++) teile.unshift(e.name); return teile.join(' › '); };
    const treffer = sichten.filter((s) => normal(s.name).includes(such) || normal(s.beschreibung ?? '').includes(such))
      .map((s) => ({ sicht: s, pfad: pfad(s) }))
      .sort((a, b) => Number(normal(b.sicht.name).startsWith(such)) - Number(normal(a.sicht.name).startsWith(such)) || a.sicht.name.localeCompare(b.sicht.name, 'de'));
    return { meine: [], zuletzt: [], gruppen: [], treffer, ausgeblendet: weg.size };
  }
  const sichtbar = (s: Sicht | undefined): s is Sicht => !!s && !weg.has(s.id);
  const meine = liste(o.angeheftet).map((id) => nachId.get(id)).filter(sichtbar);
  const meineIds = new Set(meine.map((s) => s.id));
  const zuletzt = liste(o.zuletzt).map((id) => nachId.get(id)).filter(sichtbar).filter((s) => !meineIds.has(s.id));
  const gruppen: WahlGruppe[] = [];
  const weitere: WahlEintrag[] = [];
  for (const wurzel of kinderVon(sichten, null)) {
    const eintraege: WahlEintrag[] = [];
    const gehe = (s: Sicht, tiefe: number) => {
      if (weg.has(s.id)) return;
      eintraege.push({ sicht: s, tiefe });
      for (const k of kinderVon(sichten, s.id)) gehe(k, tiefe + 1);
    };
    gehe(wurzel, 0);
    if (eintraege.length > 1) gruppen.push({ schluessel: wurzel.id, name: wurzel.name, eintraege });
    else weitere.push(...eintraege);
  }
  if (weitere.length) gruppen.push({ schluessel: 'weitere', name: gruppen.length ? 'Weitere Ansichten' : 'Ansichten', eintraege: weitere });
  return { meine, zuletzt, gruppen, treffer: null, ausgeblendet: weg.size };
}
