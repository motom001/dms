/**
 * Beschriftungen je Sprache (#728): Auswahlfelder mit festen Werten, Namen von Mappentypen, Feldern, Registern,
 * Trefferlisten und Ansichten sowie Hilfetexte in mehreren Sprachen.
 *
 * - Gespeichert wird in einer Mappe immer der **feste Wert** einer Option (`Feld.optionen`). Bestehende Optionen sind
 *   ihr eigener fester Wert – gespeicherte Daten ändern sich nie. Ansichten, Suche, Bedingungen, Automatisierungen,
 *   API und Erkennung vergleichen den festen Wert; gezeigt wird die Beschriftung in der Sprache des Benutzers.
 * - Der **Ausgangstext** (`label`, `hilfe`, `name`, `beschreibung`) ist Deutsch, die Ausgangssprache. Andere Sprachen
 *   stehen unter `beschriftungen.<sprache>`; fehlt dort etwas, gilt der Ausgangstext.
 * - Optionen haben keinen eigenen Ausgangstext: Ihre Beschriftung ist `beschriftungen.<sprache>.optionen[wert]`, sonst
 *   die deutsche (`beschriftungen.de.optionen[wert]`), sonst der feste Wert selbst. So kann ein Paket den festen Wert
 *   „strom“ mit „Strom“ und „Electricity“ beschriften.
 */
import { AUSGANGSSPRACHE, EINGEBAUTE_SPRACHEN, sprache } from './sprache';
import type { Abschnitt, Feld, MappentypDaten, Register, Trefferliste } from './model';
import type { SichtDaten } from './sichten';

/** Beschriftungen je Sprache: Sprache → Teile. */
export type Beschriftungen<T> = Partial<Record<string, T>>;
/** Name eines Registers, einer Trefferliste. */
export interface NamensTeile { name?: string }
/** Überschrift eines Abschnitts im Feldregister (#890). */
export interface AbschnittTeile { titel?: string }
/** Name und Beschreibung eines Mappentyps bzw. einer Ansicht; beim Mappentyp auch „Woran man ihn erkennt“ (#937). */
export interface TypTeile { name?: string; beschreibung?: string; erkennbarAn?: string }
/** Bezeichnung, Hilfetext und Beschriftung der Optionen (fester Wert → Text) eines Felds. */
export interface FeldTeile { label?: string; hilfe?: string; optionen?: Record<string, string>;
  /** Tabelle (#1030): Beschriftung von „+ Neu“, z. B. „+ Item“. */
  neu?: string }

/**
 * Sprachen, in denen sich Beschriftungen pflegen lassen: die in der Werkbank erlaubten (#729, Werkbank → Sprachen).
 * Fest eingebaut sind Deutsch und Englisch, weitere kommen als Sprachpaket (#731). Der Server setzt die Liste nach dem
 * Lesen der Einstellung, die Oberfläche aus dem Kontostatus. Beschriftungen anderer Sprachen (z. B. aus einem Paket)
 * bleiben trotzdem gespeichert.
 */
export { EINGEBAUTE_SPRACHEN };
let erlaubt: string[] = [...EINGEBAUTE_SPRACHEN];
export const erlaubteSprachen = (): string[] => [...erlaubt];
/** Erlaubte Sprachen setzen; die Ausgangssprache ist immer dabei und steht vorn. */
export function setzeErlaubteSprachen(liste: readonly string[]) {
  erlaubt = [...new Set([AUSGANGSSPRACHE, ...liste.filter((x) => SPRACHKENNUNG.test(x))])];
}

/** Gültige Sprachkennung: „en“, „tr“, „pt-BR“. */
export const SPRACHKENNUNG = /^[a-z]{2,3}(-[A-Z]{2})?$/;
/** Höchstens so viele Sprachen je Eintrag und so lang je Text. */
export const BESCHRIFTUNG_SPRACHEN_MAX = 30;
export const BESCHRIFTUNG_MAX = 500;

/** Sprachname in der Sprache der Oberfläche, z. B. „Englisch“ (aus `Intl`, kein eigener Text nötig). */
export function sprachname(kennung: string, in_: string = sprache()): string {
  try { return new Intl.DisplayNames([in_], { type: 'language' }).of(kennung) ?? kennung; } catch { return kennung; }
}

const teil = <T>(b: Beschriftungen<T> | null | undefined, spr: string, k: keyof T): string | undefined => {
  const v = b?.[spr]?.[k];
  return typeof v === 'string' && v.trim() ? v : undefined;
};
/** Text in einer Sprache: Beschriftung, sonst Ausgangstext (Deutsch hat keine eigene Beschriftung außer bei Optionen). */
function inSprache<T>(ausgang: string, b: Beschriftungen<T> | null | undefined, k: keyof T, spr: string): string {
  return spr === AUSGANGSSPRACHE ? ausgang : teil(b, spr, k) ?? ausgang;
}

export const feldLabel = (f: Pick<Feld, 'label' | 'key' | 'beschriftungen'>, spr = sprache()) => inSprache(f.label || f.key, f.beschriftungen, 'label', spr);
export const feldHilfe = (f: Pick<Feld, 'hilfe' | 'beschriftungen'>, spr = sprache()) => (f.hilfe ? inSprache(f.hilfe, f.beschriftungen, 'hilfe', spr) : '');
export const typName = (t: Pick<MappentypDaten, 'name' | 'beschriftungen'>, spr = sprache()) => inSprache(t.name, t.beschriftungen, 'name', spr);
export const typBeschreibung = (t: Pick<MappentypDaten, 'beschreibung' | 'beschriftungen'>, spr = sprache()) => (t.beschreibung ? inSprache(t.beschreibung, t.beschriftungen, 'beschreibung', spr) : '');
/** „Woran man ihn erkennt“ (#937) in einer Sprache. */
export const typErkennbarAn = (t: Pick<MappentypDaten, 'erkennbarAn' | 'beschriftungen'>, spr = sprache()) => (t.erkennbarAn ? inSprache(t.erkennbarAn, t.beschriftungen, 'erkennbarAn', spr) : '');
export const registerName = (r: Pick<Register, 'name' | 'key' | 'beschriftungen'>, spr = sprache()) => inSprache(r.name || r.key, r.beschriftungen, 'name', spr);
/** Überschrift eines Abschnitts (#890) in einer Sprache; ohne Überschrift leer. */
export const abschnittTitel = (a: Pick<Abschnitt, 'titel' | 'beschriftungen'>, spr = sprache()) => (a.titel ? inSprache(a.titel, a.beschriftungen, 'titel', spr) : '');
export const listenName = (l: Pick<Trefferliste, 'name' | 'beschriftungen'>, spr = sprache()) => inSprache(l.name, l.beschriftungen, 'name', spr);
export const sichtName = (s: Pick<SichtDaten, 'name' | 'beschriftungen'>, spr = sprache()) => inSprache(s.name, s.beschriftungen, 'name', spr);
export const sichtBeschreibung = (s: Pick<SichtDaten, 'beschreibung' | 'beschriftungen'>, spr = sprache()) => (s.beschreibung ? inSprache(s.beschreibung, s.beschriftungen, 'beschreibung', spr) : '');

/** Beschriftung einer Option (fester Wert) in einer Sprache; ohne Beschriftung der feste Wert selbst. */
export function optionText(f: Pick<Feld, 'beschriftungen'>, wert: string, spr = sprache()): string {
  const b = f.beschriftungen;
  const in_ = (s: string) => { const v = b?.[s]?.optionen?.[wert]; return typeof v === 'string' && v.trim() ? v : undefined; };
  return in_(spr) ?? in_(AUSGANGSSPRACHE) ?? wert;
}

/** Alle Beschriftungen einer Option über alle Sprachen (ohne den festen Wert), z. B. für Suche und Erkennung. */
export function optionTexte(f: Pick<Feld, 'beschriftungen'>, wert: string): string[] {
  const texte = Object.values(f.beschriftungen ?? {}).map((x) => x?.optionen?.[wert]).filter((x): x is string => typeof x === 'string' && !!x.trim());
  return [...new Set(texte)];
}

/**
 * Fester Wert zu einer Eingabe: der Wert selbst oder eine seiner Beschriftungen (in jeder Sprache), ohne Groß- und
 * Kleinschreibung. Für Suche, Direktlinks, Import und Erkennung – gespeichert wird immer der feste Wert.
 */
export function wertZuOption(f: Pick<Feld, 'optionen' | 'beschriftungen'>, eingabe: string): string | undefined {
  const optionen = f.optionen ?? [];
  if (optionen.includes(eingabe)) return eingabe;
  const k = eingabe.trim().toLowerCase();
  if (!k) return undefined;
  return optionen.find((o) => o.toLowerCase() === k) ?? optionen.find((o) => optionTexte(f, o).some((x) => x.toLowerCase() === k));
}

/** Gruppen „fester Wert und seine Beschriftungen“ eines Typs – für die Suche wie gleichbedeutende Wörter (#356). */
export function optionsGruppen(felder: Array<Pick<Feld, 'typ' | 'optionen' | 'beschriftungen'>>): string[][] {
  const gruppen: string[][] = [];
  for (const f of felder) {
    if (f.typ !== 'auswahl') continue;
    for (const o of f.optionen ?? []) {
      const g = [...new Set([o, ...optionTexte(f, o)])];
      if (g.length > 1) gruppen.push(g);
    }
  }
  return gruppen;
}

/* ---------- Stand je Sprache (Werkbank: „12 von 14 Beschriftungen auf Englisch“) ---------- */

/** Wie viele der beschriftbaren Texte eines Mappentyps es in einer Sprache gibt. Hinweis, nie Fehler. */
export function beschriftungsstand(t: Pick<MappentypDaten, 'name' | 'beschreibung' | 'beschriftungen' | 'felder' | 'register' | 'trefferlisten'> & { erkennbarAn?: string }, spr: string): { vorhanden: number; gesamt: number } {
  let vorhanden = 0, gesamt = 0;
  const zaehle = (ausgang: string | undefined, da: boolean) => { if (!ausgang?.trim()) return; gesamt++; if (da) vorhanden++; };
  zaehle(t.name, !!teil(t.beschriftungen, spr, 'name'));
  zaehle(t.beschreibung, !!teil(t.beschriftungen, spr, 'beschreibung'));
  zaehle(t.erkennbarAn, !!teil(t.beschriftungen, spr, 'erkennbarAn'));
  for (const f of t.felder ?? []) {
    zaehle(f.label, !!teil(f.beschriftungen, spr, 'label'));
    zaehle(f.hilfe, !!teil(f.beschriftungen, spr, 'hilfe'));
    if (f.typ === 'auswahl') for (const o of f.optionen ?? []) zaehle(o, !!f.beschriftungen?.[spr]?.optionen?.[o]?.trim());
  }
  for (const r of t.register ?? []) {
    zaehle(r.name, !!teil(r.beschriftungen, spr, 'name'));
    for (const a of r.abschnitte ?? []) zaehle(a.titel, !!teil(a.beschriftungen, spr, 'titel'));
  }
  for (const l of t.trefferlisten ?? []) zaehle(l.name, !!teil(l.beschriftungen, spr, 'name'));
  return { vorhanden, gesamt };
}

/* ---------- Bereinigen (Server, Pakete) ---------- */

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const kurz = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, BESCHRIFTUNG_MAX) : '');

/**
 * Beschriftungen aus einer Eingabe (API, Paket, Oberfläche): nur gültige Sprachkennungen, nur die genannten Teile,
 * nur Texte; Optionen nur für vorhandene feste Werte. Deutsche Angaben außer Optionen fallen weg – Deutsch ist der
 * Ausgangstext (wer sie mitgibt, übernimmt sie über `ausgangAus`). Leer → undefined (nichts gespeichert).
 */
export function bereinigeBeschriftungen<T extends object>(roh: unknown, teile: ReadonlyArray<keyof T & string>, optionen?: string[]): Beschriftungen<T> | undefined {
  if (!istObjekt(roh)) return undefined;
  const aus: Record<string, Record<string, unknown>> = {};
  for (const [spr, x] of Object.entries(roh).slice(0, BESCHRIFTUNG_SPRACHEN_MAX)) {
    if (!SPRACHKENNUNG.test(spr) || !istObjekt(x)) continue;
    const eintrag: Record<string, unknown> = {};
    for (const k of teile) {
      if (k === 'optionen') {
        if (!optionen?.length || !istObjekt(x.optionen)) continue;
        const o = Object.fromEntries(Object.entries(x.optionen).filter(([w, v]) => optionen.includes(w) && kurz(v)).map(([w, v]) => [w, kurz(v)]));
        if (Object.keys(o).length) eintrag.optionen = o;
      } else if (spr !== AUSGANGSSPRACHE && kurz(x[k])) eintrag[k] = kurz(x[k]);
    }
    if (Object.keys(eintrag).length) aus[spr] = eintrag;
  }
  return Object.keys(aus).length ? aus as Beschriftungen<T> : undefined;
}

/** Deutscher Text aus den Beschriftungen einer Eingabe (`beschriftungen.de.label`), sonst der Ausgangstext. */
export function ausgangAus(roh: unknown, k: string, ausgang: string): string {
  const de = istObjekt(roh) && istObjekt(roh[AUSGANGSSPRACHE]) ? roh[AUSGANGSSPRACHE][k] : undefined;
  return kurz(de) || ausgang;
}

/**
 * Fehlende Beschriftungen aus `neu` in `alt` ergänzen (Paket-Update): Was der Administrator schon beschriftet hat,
 * bleibt; je Sprache, Teil und Option. Ergebnis undefined, wenn beide leer sind.
 */
export function ergaenzeBeschriftungen<T extends object>(alt: Beschriftungen<T> | undefined, neu: Beschriftungen<T> | undefined): Beschriftungen<T> | undefined {
  if (!neu) return alt;
  const aus = structuredClone(alt ?? {}) as Record<string, Record<string, unknown>>;
  for (const [spr, x] of Object.entries(neu as Record<string, Record<string, unknown> | undefined>)) {
    if (!x) continue;
    const ziel = (aus[spr] ??= {});
    for (const [k, v] of Object.entries(x)) {
      if (k === 'optionen' && istObjekt(v)) ziel.optionen = { ...v, ...(istObjekt(ziel.optionen) ? ziel.optionen : {}) };
      else if (ziel[k] === undefined || ziel[k] === '') ziel[k] = v;
    }
  }
  return Object.keys(aus).length ? aus as Beschriftungen<T> : undefined;
}
