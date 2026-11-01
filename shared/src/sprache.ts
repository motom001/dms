/**
 * Mehrsprachigkeit, Stufe 1 (#473): Texte stehen in Sprachdateien statt im Code.
 *
 * Sprachdateien sind flache JSON-Dateien je Bereich unter `shared/src/sprachen/<sprache>/<bereich>.json`
 * (Ausgangssprache `de`, du-Form). Abgerufen wird ein Text als `<bereich>.<schluessel>`, z. B.
 * `t('anmeldung.titel')`. Platzhalter stehen in geschweiften Klammern (`{name}`), die Mehrzahl als
 * zwei Schlüssel mit `_one` und `_other` und dem Wert `anzahl` („1 Mappe“ / „3 Mappen“).
 *
 * Eigene, kleine Umsetzung statt i18next: keine neue Abhängigkeit, offline, gleiche Regeln in
 * Weboberfläche und Server. Format und Mehrzahl-Endungen entsprechen i18next (flaches JSON,
 * `_one`/`_other`, Platzhalter mit einfacher Klammer einstellbar) – ein späterer Wechsel bleibt möglich.
 */

/** Texte eines Bereichs: Schlüssel → Text. */
export type Sprachdatei = Readonly<Record<string, string>>;
/** Alle Bereiche einer Sprache. */
export type Bereiche = Readonly<Record<string, Sprachdatei>>;

/** Mehrzahlformen nach `Intl.PluralRules` (Deutsch braucht nur `one` und `other`). */
export const MEHRZAHLFORMEN = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
type Mehrzahlform = (typeof MEHRZAHLFORMEN)[number];
const MEHRZAHL = new RegExp(`_(${MEHRZAHLFORMEN.join('|')})$`);

/** Schlüssel ohne Mehrzahl-Endung: `mappen_one` → `mappen`. */
export const ohneMehrzahl = (k: string) => k.replace(MEHRZAHL, '');

export type OhneMehrzahl<K extends string> = K extends `${infer B}_${Mehrzahlform}` ? B : K;
/** Alle Schlüssel der übergebenen Bereiche als `<bereich>.<schluessel>`. */
export type Schluessel<B extends Bereiche> = { [N in keyof B & string]: `${N}.${OhneMehrzahl<keyof B[N] & string>}` }[keyof B & string];
export type Werte = Readonly<Record<string, string | number>>;

/** Ausgangssprache. Sie ist immer vollständig; andere Sprachen fallen auf sie zurück. */
export const AUSGANGSSPRACHE = 'de';
let aktuell = AUSGANGSSPRACHE;
/** Sprache der Oberfläche bzw. des Servers. Bis zur Sprachwahl (#357, Stufe 3) immer Deutsch. */
export const setzeSprache = (sprache: string) => { aktuell = sprache; };
export const sprache = () => aktuell;

/** Platzhalter eines Textes, sortiert und ohne Doppelte – für die Prüfung zwischen Sprachen. */
export function platzhalter(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]))].sort();
}

/** Setzt Werte für `{name}` ein; unbekannte Platzhalter bleiben stehen, damit sie auffallen. */
export function fuelle(text: string, werte: Werte = {}): string {
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (ganz, n: string) => (n in werte ? String(werte[n]) : ganz));
}

const regeln = new Map<string, Intl.PluralRules>();
function form(spr: string, anzahl: number): Mehrzahlform {
  let r = regeln.get(spr);
  if (!r) { r = new Intl.PluralRules(spr); regeln.set(spr, r); }
  return r.select(anzahl) as Mehrzahlform;
}

/** Sucht `schluessel` in einer Sprachdatei; mit `anzahl` erst die passende Mehrzahlform, dann `_other`. */
function suche(datei: Sprachdatei | undefined, schluessel: string, spr: string, anzahl: unknown): string | undefined {
  if (!datei) return undefined;
  if (typeof anzahl === 'number') {
    const k = `${schluessel}_${form(spr, anzahl)}`;
    if (k in datei) return datei[k];
    if (`${schluessel}_other` in datei) return datei[`${schluessel}_other`];
  }
  return Object.hasOwn(datei, schluessel) ? datei[schluessel] : undefined;
}

export interface Uebersetzer<B extends Bereiche> {
  /** Text zum Schlüssel; `werte` füllt die Platzhalter, `werte.anzahl` wählt die Mehrzahlform. */
  (schluessel: Schluessel<B>, werte?: Werte): string;
  /**
   * Für zusammengesetzte Schlüssel, z. B. `t.frei(\`werkbank.gruppe.${g}\`)`. Die Prüfung in der CI erkennt
   * solche Vorlagen am festen Anfang (`werkbank.gruppe.`) und zählt alle passenden Schlüssel als benutzt.
   */
  frei(schluessel: string, werte?: Werte): string;
  /** Gibt es den Schlüssel (in der Ausgangssprache)? */
  hat(schluessel: string): boolean;
}

/**
 * Übersetzer für die übergebenen Bereiche der Ausgangssprache. `weitere` enthält andere Sprachen
 * (auch unvollständig); was dort fehlt, kommt aus der Ausgangssprache. Fehlt ein Schlüssel ganz,
 * erscheint der Schlüssel selbst – die Typprüfung und die Prüfung in der CI verhindern das.
 */
export function uebersetzer<B extends Bereiche>(ausgang: B, weitere: Readonly<Record<string, Partial<Record<keyof B, Sprachdatei>>>> = {}): Uebersetzer<B> {
  const finde = (voll: string, werte: Werte) => {
    const punkt = voll.indexOf('.');
    const bereich = voll.slice(0, punkt), schluessel = voll.slice(punkt + 1);
    const spr = aktuell;
    return suche(weitere[spr]?.[bereich as keyof B], schluessel, spr, werte.anzahl)
      ?? suche((ausgang as Bereiche)[bereich], schluessel, AUSGANGSSPRACHE, werte.anzahl);
  };
  const frei = (voll: string, werte: Werte = {}) => {
    const text = finde(voll, werte);
    return text === undefined ? voll : fuelle(text, werte);
  };
  const t = ((voll: Schluessel<B>, werte?: Werte) => frei(voll, werte)) as Uebersetzer<B>;
  t.frei = frei;
  t.hat = (voll: string) => finde(voll, {}) !== undefined || finde(voll, { anzahl: 2 }) !== undefined;
  return t;
}
