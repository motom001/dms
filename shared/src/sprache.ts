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
/**
 * Rückfallsprache (#729): Fehlt ein Text in einer weiteren Sprache (z. B. aus einem Sprachpaket), erscheint er auf
 * Englisch, sonst auf Deutsch. Ablago zeigt nie eine leere Stelle.
 */
export const RUECKFALLSPRACHE = 'en';
/** Fest eingebaute Sprachen (#729); weitere kommen als Sprachpaket (#731). */
export const EINGEBAUTE_SPRACHEN = [AUSGANGSSPRACHE, RUECKFALLSPRACHE] as const;

let aktuell = AUSGANGSSPRACHE;
/** Vorrang für einen kurzen, synchronen Abschnitt (`inSprache`), z. B. Beschriftungen in allen Sprachen bilden. */
let vorrang: string | null = null;
/** Woher die Sprache kommt: in der Oberfläche fest gesetzt, auf dem Server je Anfrage (siehe `setzeSprachquelle`). */
let quelle: () => string = () => aktuell;
/** Sprache der Oberfläche bzw. die Vorgabe des Servers (Sprache der Installation, #729). */
export const setzeSprache = (sprache: string) => {
  aktuell = sprache;
};
/**
 * Der Server liest die Sprache je Anfrage (#729): die der angemeldeten Person, sonst die der Installation. Die Quelle
 * liefert die Sprache der laufenden Anfrage oder `undefined`, dann gilt `setzeSprache`.
 */
export const setzeSprachquelle = (f: () => string | undefined) => {
  quelle = () => f() ?? aktuell;
};
export const sprache = () => vorrang ?? quelle();
/** Die gesetzte Sprache ohne Anfrage: in der Oberfläche die gewählte, auf dem Server die der Installation. */
export const grundsprache = () => aktuell;
/** Führt `f` in einer bestimmten Sprache aus (nur synchron). */
export function inSprache<T>(spr: string, f: () => T): T {
  const alt = vorrang;
  vorrang = spr;
  try {
    return f();
  } finally {
    vorrang = alt;
  }
}

/** Gebietsschema der Sprache für Datum, Zahlen und Beträge (#727, #729) – statt `'de-DE'` fest im Code. */
const GEBIET: Readonly<Record<string, string>> = { de: 'de-DE', en: 'en-GB' };
/** Sprachpakete (#731) nennen ihr Gebietsschema selbst (`sprache.gebietsschema`, z. B. „fr-FR“). */
export const gebietsschemaVon = (spr: string) => GEBIET[spr] ?? ANGABEN[spr]?.gebietsschema ?? spr;
export const gebietsschema = () => gebietsschemaVon(sprache());

/**
 * Weitere Sprachen (#729): Sprache → Bereich → Texte. Eingebaut ist Englisch; Sprachpakete (#731) kommen dazu.
 * Jeder Übersetzer sieht alle hier eingetragenen Sprachen, auch wenn er vorher gebildet wurde.
 */
const SPRACHEN: Record<string, Record<string, Sprachdatei>> = {};
/**
 * Angaben zu einer Sprache: maschinell übersetzt (dann der Hinweis in Mein Konto, #729/#731) und das Gebietsschema für
 * Datum, Zahlen und Beträge (Sprachpakete, #731).
 */
export interface Sprachangaben {
  maschinell?: boolean;
  gebietsschema?: string;
}
const ANGABEN: Record<string, Sprachangaben> = {};
export function registriereSprache(spr: string, bereiche: Readonly<Record<string, Sprachdatei>>, angaben: Sprachangaben = {}) {
  SPRACHEN[spr] = { ...SPRACHEN[spr], ...bereiche };
  ANGABEN[spr] = { ...ANGABEN[spr], ...angaben };
}
/** Sprache wieder austragen (Sprachpaket entfernt oder ersetzt, #731); danach gilt für sie der Rückfall. */
export function entferneSprache(spr: string) {
  delete SPRACHEN[spr];
  delete ANGABEN[spr];
}
export const sprachangaben = (spr: string): Sprachangaben => ANGABEN[spr] ?? {};
/** Ein Text genau in dieser Sprache, ohne Rückfall – z. B. für Beschriftungen, die gespeichert werden. */
export function textNur(spr: string, voll: string, werte: Werte = {}): string | undefined {
  const punkt = voll.indexOf('.');
  const v = SPRACHEN[spr]?.[voll.slice(0, punkt)]?.[voll.slice(punkt + 1)];
  return typeof v === 'string' && v.trim() ? fuelle(v, werte) : undefined;
}
/** Sprachen mit eingetragenen Texten (ohne die Ausgangssprache). */
export const registrierteSprachen = () => Object.keys(SPRACHEN);
/** Reihenfolge beim Suchen eines Textes: gewählte Sprache, Englisch, Deutsch. */
export const sprachfolge = (spr: string): string[] => [...new Set([spr, RUECKFALLSPRACHE, AUSGANGSSPRACHE])];

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
  if (!r) {
    r = new Intl.PluralRules(spr);
    regeln.set(spr, r);
  }
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
/** Wie `suche`, aber leere Texte zählen als fehlend (#729: nie eine leere Stelle). */
function sucheText(datei: Sprachdatei | undefined, schluessel: string, spr: string, anzahl: unknown): string | undefined {
  const v = suche(datei, schluessel, spr, anzahl);
  return typeof v === 'string' && v.trim() ? v : undefined;
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
 * Übersetzer für die übergebenen Bereiche der Ausgangssprache. `weitere` enthält andere Sprachen (auch unvollständig),
 * dazu kommen die mit `registriereSprache` eingetragenen. Was in der gewählten Sprache fehlt, kommt aus Englisch, sonst
 * aus der Ausgangssprache (#729). Fehlt ein Schlüssel ganz, erscheint der Schlüssel selbst – die Typprüfung und die
 * Prüfung in der CI verhindern das.
 */
export function uebersetzer<B extends Bereiche>(
  ausgang: B,
  weitere: Readonly<Record<string, Partial<Record<keyof B, Sprachdatei>>>> = {},
): Uebersetzer<B> {
  const finde = (voll: string, werte: Werte) => {
    const punkt = voll.indexOf('.');
    const bereich = voll.slice(0, punkt),
      schluessel = voll.slice(punkt + 1);
    for (const spr of sprachfolge(sprache())) {
      const datei =
        spr === AUSGANGSSPRACHE ? (ausgang as Bereiche)[bereich] : (weitere[spr]?.[bereich as keyof B] ?? SPRACHEN[spr]?.[bereich]);
      const text = sucheText(datei, schluessel, spr, werte.anzahl);
      if (text !== undefined) return text;
    }
    return undefined;
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
