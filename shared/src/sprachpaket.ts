/**
 * Paketart „Sprache“ (#731): weitere Sprachen für Ablago als Paket aus dem Katalog, aus der Sammeldatei oder hochgeladen.
 *
 * Ein Sprachpaket bringt **nur Texte**: Sprachdateien für Oberfläche, Meldungen und E-Mails (`texte/<bereich>.json`, flach
 * wie `shared/src/sprachen/<sprache>/<bereich>.json`) und Beschriftungen der Standardpakete (`beschriftungen/<paket>.yaml`).
 * Kein Code, keine Mappentypen, kein HTML. Im Manifest steht der Abschnitt `sprache`:
 *
 * ```yaml
 * sprache:
 *   kennung: fr             # Sprachkennung wie „fr“ oder „pt-BR“; Deutsch und Englisch sind eingebaut
 *   gebietsschema: fr-FR    # für Datum, Zahlen und Beträge (fehlt: die Kennung selbst)
 *   ablago: 0.203.0         # Ablago-Version, für die die Texte gemacht sind
 *   maschinell: true        # maschinell übersetzt – Hinweis in Mein Konto und im Katalog
 *   geprueft_von: "…"       # optional: wer die Übersetzung geprüft hat
 * ```
 *
 * Geprüft wird beim Lesen des Pakets (Server) – hier stehen die reinen Regeln, damit Server und Tests dieselben haben:
 * Schlüssel und Platzhalter wie im Deutschen, keine Steuerzeichen, keine spitzen Klammern, wo das Deutsche keine hat
 * (also kein HTML), Grenzen je Text und für alle Texte. Was zu dieser Ablago-Version nicht passt (unbekannte Schlüssel,
 * andere Platzhalter), wird übergangen statt abgelehnt – so bleibt ein Paket für eine ältere Version installierbar, und
 * die fehlenden Texte erscheinen auf Englisch.
 */
import { AUSGANGSSPRACHE, EINGEBAUTE_SPRACHEN, ohneMehrzahl, platzhalter, type Sprachdatei } from './sprache';
import { BESCHRIFTUNG_MAX, SPRACHKENNUNG } from './beschriftung';
import { t } from './texte';
import { SCHLUESSEL } from './kennungen';

/** Ab dieser Version installiert Ablago Sprachpakete; Pakete schreiben `dms: ">=0.203.0"`. */
export const DMS_SPRACHPAKETE_AB = '0.203.0';
/** Höchstens so lang ist ein Text (Zeichen) – der längste eingebaute hat gut 600. */
export const SPRACHTEXT_MAX = 4000;
/** Höchstens so groß sind alle Texte eines Sprachpakets zusammen (Bytes, UTF-8); Deutsch hat rund 0,5 MB. */
export const SPRACHTEXTE_MAX = 4 * 1024 * 1024;
export const GEPRUEFT_VON_MAX = 200;
/** Ordner im Paket. */
export const TEXTE_ORDNER = 'texte/';
export const BESCHRIFTUNGEN_ORDNER = 'beschriftungen/';

/** Texte eines Sprachpakets: Bereich → Schlüssel → Text. */
export type Sprachtexte = Record<string, Record<string, string>>;

/** Angaben aus dem Manifest (`sprache:`). */
export interface Sprachangabe {
  kennung: string;
  gebietsschema: string;
  /** Ablago-Version, für die die Texte gemacht sind. */
  ablago: string;
  maschinell: boolean;
  geprueftVon?: string;
}

/** Was ein installiertes Sprachpaket am Paketeintrag festhält (InstalliertesPaket.sprache). */
export interface SprachpaketInfo extends Sprachangabe {
  /** Texte, die beim Installieren übernommen wurden, und übergangene (passten nicht zu dieser Version). */
  texte: number;
  uebergangen: number;
  /** Pakete, für die es Beschriftungen mitbringt. */
  beschriftungen: string[];
}

/** Abdeckung einer Sprache gegen das Deutsche: „Übersetzung 94 % vollständig“. */
export interface Abdeckung { vorhanden: number; gesamt: number; prozent: number }

/** Beschriftungen der Mappentypen und Ansichten eines Pakets in der Sprache des Sprachpakets. */
export interface SprachBeschriftung {
  mappentypen?: Record<string, {
    name?: string; beschreibung?: string;
    felder?: Record<string, { label?: string; hilfe?: string; optionen?: Record<string, string> }>;
    register?: Record<string, { name?: string }>;
  }>;
  sichten?: Record<string, { name?: string; beschreibung?: string }>;
}

const VERSION = /^\d+\.\d+\.\d+$/;
const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Steuerzeichen außer Zeilenumbruch und Tabulator. */
// eslint-disable-next-line no-control-regex -- Steuerzeichen in Sprachpaketen sind genau das, was hier gesucht wird
const STEUERZEICHEN = /[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/;
const KLAMMERN = /[<>]/;
const KODIERER = new TextEncoder();

/** Gültiges Gebietsschema nach `Intl`, sonst null. */
export function gueltigesGebietsschema(v: string): string | null {
  try { return Intl.getCanonicalLocales(v)[0] ?? null; } catch { return null; }
}

/** Liest den Abschnitt `sprache` des Manifests; Fehler mit Ort („manifest.yaml: sprache.…“). */
export function liesSprachangabe(v: unknown): { angabe: Sprachangabe | null; fehler: string[] } {
  if (!istObjekt(v)) return { angabe: null, fehler: [t('gemeinsam.sprachpaket.angabe-objekt')] };
  const fehler: string[] = [];
  const kennung = typeof v.kennung === 'string' ? v.kennung : '';
  if (!SPRACHKENNUNG.test(kennung)) fehler.push(t('gemeinsam.sprachpaket.kennung-ungueltig', { kennung: String(v.kennung ?? '') }));
  else if ((EINGEBAUTE_SPRACHEN as readonly string[]).includes(kennung)) fehler.push(t('gemeinsam.sprachpaket.kennung-eingebaut', { kennung }));
  const roh = v.gebietsschema === undefined ? kennung : typeof v.gebietsschema === 'string' ? v.gebietsschema : '';
  const gebietsschema = roh ? gueltigesGebietsschema(roh) : null;
  if (!gebietsschema && kennung) fehler.push(t('gemeinsam.sprachpaket.gebietsschema-ungueltig', { wert: String(v.gebietsschema ?? '') }));
  const ablago = typeof v.ablago === 'string' ? v.ablago : '';
  if (!VERSION.test(ablago)) fehler.push(t('gemeinsam.sprachpaket.ablago-version'));
  if (typeof v.maschinell !== 'boolean') fehler.push(t('gemeinsam.sprachpaket.maschinell'));
  const gv = v.geprueft_von;
  if (gv !== undefined && (typeof gv !== 'string' || !gv.trim() || gv.length > GEPRUEFT_VON_MAX || STEUERZEICHEN.test(gv) || KLAMMERN.test(gv))) fehler.push(t('gemeinsam.sprachpaket.geprueft-von', { max: GEPRUEFT_VON_MAX }));
  for (const k of Object.keys(v)) if (!['kennung', 'gebietsschema', 'ablago', 'maschinell', 'geprueft_von'].includes(k)) fehler.push(t('gemeinsam.sprachpaket.unbekannt', { k }));
  if (fehler.length) return { angabe: null, fehler };
  return { angabe: { kennung, gebietsschema: gebietsschema!, ablago, maschinell: v.maschinell === true, ...(typeof gv === 'string' ? { geprueftVon: gv.trim() } : {}) }, fehler };
}

/** Deutsche Texte eines Grundschlüssels (alle Mehrzahlformen). */
function deutscheFormen(datei: Sprachdatei, grund: string): string[] {
  return Object.entries(datei).filter(([k]) => k === grund || ohneMehrzahl(k) === grund).map(([, v]) => v);
}

/**
 * Prüft die Sprachdateien eines Pakets gegen das Deutsche dieser Ablago-Version (`de`: Bereich → Texte).
 * fehler: verhindern die Installation (kein Text, Steuerzeichen, HTML, zu lang, zu groß). uebergangen: passt nicht zu
 * dieser Version (Bereich oder Schlüssel unbekannt, andere Platzhalter) – fällt weg, das Paket bleibt installierbar.
 */
export function pruefeSprachtexte(de: Readonly<Record<string, Sprachdatei>>, roh: Readonly<Record<string, unknown>>): { texte: Sprachtexte; uebergangen: string[]; fehler: string[] } {
  const texte: Sprachtexte = {};
  const uebergangen: string[] = [];
  const fehler: string[] = [];
  let bytes = 0;
  for (const [bereich, datei] of Object.entries(roh)) {
    const ort = `${TEXTE_ORDNER}${bereich}.json`;
    if (!istObjekt(datei)) { fehler.push(t('gemeinsam.sprachpaket.datei-objekt', { ort })); continue; }
    const soll = Object.hasOwn(de, bereich) ? de[bereich] : undefined;
    if (!soll) { uebergangen.push(...Object.keys(datei).map((k) => `${bereich}.${k}`)); continue; }
    const aus: Record<string, string> = {};
    for (const [k, v] of Object.entries(datei)) {
      if (typeof v !== 'string') { fehler.push(t('gemeinsam.sprachpaket.kein-text', { ort, k })); continue; }
      if (!v.trim()) continue;
      if (v.length > SPRACHTEXT_MAX) { fehler.push(t('gemeinsam.sprachpaket.zu-lang', { ort, k, max: SPRACHTEXT_MAX })); continue; }
      if (STEUERZEICHEN.test(v)) { fehler.push(t('gemeinsam.sprachpaket.steuerzeichen', { ort, k })); continue; }
      const grund = ohneMehrzahl(k);
      const formen = Object.hasOwn(soll, k) ? [soll[k]] : grund !== k ? deutscheFormen(soll, grund) : [];
      // Mehrzahl: eine Form, die das Deutsche nicht hat (z. B. „_few“), gehört zum selben Grundschlüssel.
      if (!formen.length || (grund !== k && !Object.hasOwn(soll, `${grund}_other`))) { uebergangen.push(`${bereich}.${k}`); continue; }
      const alle = grund !== k ? deutscheFormen(soll, grund) : formen;
      // Kein HTML: spitze Klammern nur, wo auch der deutsche Text welche hat (z. B. „dms api <GET|POST>“).
      if (KLAMMERN.test(v) && !alle.some((x) => KLAMMERN.test(x))) { fehler.push(t('gemeinsam.sprachpaket.html', { ort, k })); continue; }
      // Platzhalter: nur, die das Deutsche auch hat (weglassen darf eine Form, z. B. „une mappe“ ohne {anzahl}).
      const erlaubt = new Set(alle.flatMap(platzhalter));
      if (platzhalter(v).some((p) => !erlaubt.has(p))) { uebergangen.push(`${bereich}.${k}`); continue; }
      bytes += KODIERER.encode(k).length + KODIERER.encode(v).length;
      aus[k] = v;
    }
    if (Object.keys(aus).length) texte[bereich] = aus;
  }
  if (bytes > SPRACHTEXTE_MAX) fehler.push(t('gemeinsam.sprachpaket.zu-gross', { mb: SPRACHTEXTE_MAX / 1048576 }));
  return { texte, uebergangen, fehler };
}

/** Wie viele Grundschlüssel des Deutschen die Sprache hat (Mehrzahlformen zählen einmal). Hinweis, nie Fehler. */
export function abdeckung(de: Readonly<Record<string, Sprachdatei>>, texte: Readonly<Sprachtexte>): Abdeckung {
  let vorhanden = 0, gesamt = 0;
  for (const [bereich, datei] of Object.entries(de)) {
    const da = new Set(Object.keys(texte[bereich] ?? {}).filter((k) => !!texte[bereich][k]?.trim()).map(ohneMehrzahl));
    for (const g of new Set(Object.keys(datei).map(ohneMehrzahl))) { gesamt++; if (da.has(g)) vorhanden++; }
  }
  // Abgerundet: 100 % heißt wirklich vollständig.
  return { vorhanden, gesamt, prozent: gesamt ? Math.floor((vorhanden / gesamt) * 100) : 0 };
}

/** Texte nur noch, wie sie zu dieser Version passen (nach einem Update von Ablago fallen alte Schlüssel weg). */
export function passendeTexte(de: Readonly<Record<string, Sprachdatei>>, texte: Readonly<Sprachtexte>): Sprachtexte {
  return pruefeSprachtexte(de, texte).texte;
}

/** Ein Beschriftungstext: kurz, ohne Steuerzeichen und spitze Klammern. */
function text(v: unknown, wo: string, fehler: string[]): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !v.trim() || v.length > BESCHRIFTUNG_MAX || STEUERZEICHEN.test(v) || KLAMMERN.test(v)) {
    fehler.push(t('gemeinsam.sprachpaket.beschriftung-text', { wo, max: BESCHRIFTUNG_MAX }));
    return undefined;
  }
  return v.trim();
}
function teile<T extends string>(o: Record<string, unknown>, erlaubt: readonly T[], wo: string, fehler: string[]): Partial<Record<T, string>> {
  const aus: Partial<Record<T, string>> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!(erlaubt as readonly string[]).includes(k)) { fehler.push(t('gemeinsam.sprachpaket.beschriftung-unbekannt', { wo: `${wo}.${k}` })); continue; }
    const x = text(v, `${wo}.${k}`, fehler);
    if (x) aus[k as T] = x;
  }
  return aus;
}
function liste<T>(v: unknown, wo: string, fehler: string[], eins: (o: Record<string, unknown>, wo: string) => T): Record<string, T> | undefined {
  if (v === undefined) return undefined;
  if (!istObjekt(v)) { fehler.push(t('gemeinsam.sprachpaket.beschriftung-objekt', { wo })); return undefined; }
  const aus: Record<string, T> = {};
  for (const [k, x] of Object.entries(v)) {
    if (!SCHLUESSEL.test(k)) { fehler.push(t('gemeinsam.sprachpaket.beschriftung-schluessel', { wo: `${wo}.${k}` })); continue; }
    if (!istObjekt(x)) { fehler.push(t('gemeinsam.sprachpaket.beschriftung-objekt', { wo: `${wo}.${k}` })); continue; }
    aus[k] = eins(x, `${wo}.${k}`);
  }
  return aus;
}

/** Liest `beschriftungen/<paket>.yaml`: Mappentypen (Name, Beschreibung, Felder, Register) und Ansichten. */
export function liesSprachBeschriftung(roh: unknown, wo: string): { beschriftung: SprachBeschriftung; fehler: string[] } {
  const fehler: string[] = [];
  if (!istObjekt(roh)) return { beschriftung: {}, fehler: [t('gemeinsam.sprachpaket.beschriftung-objekt', { wo })] };
  for (const k of Object.keys(roh)) if (k !== 'mappentypen' && k !== 'sichten') fehler.push(t('gemeinsam.sprachpaket.beschriftung-unbekannt', { wo: `${wo}: ${k}` }));
  const mappentypen = liste(roh.mappentypen, `${wo}: mappentypen`, fehler, (o, w) => {
    const { felder, register, ...rest } = o;
    return {
      ...teile(rest, ['name', 'beschreibung'] as const, w, fehler),
      ...(felder !== undefined ? { felder: liste(felder, `${w}.felder`, fehler, (f, wf) => {
        const { optionen, ...r } = f;
        const opt: Record<string, string> = {};
        if (optionen !== undefined) {
          if (!istObjekt(optionen)) fehler.push(t('gemeinsam.sprachpaket.beschriftung-objekt', { wo: `${wf}.optionen` }));
          else for (const [wert, x] of Object.entries(optionen)) { const s = text(x, `${wf}.optionen.${wert}`, fehler); if (s && wert.length <= BESCHRIFTUNG_MAX) opt[wert] = s; }
        }
        return { ...teile(r, ['label', 'hilfe'] as const, wf, fehler), ...(Object.keys(opt).length ? { optionen: opt } : {}) };
      }) } : {}),
      ...(register !== undefined ? { register: liste(register, `${w}.register`, fehler, (r, wr) => teile(r, ['name'] as const, wr, fehler)) } : {}),
    };
  });
  const sichten = liste(roh.sichten, `${wo}: sichten`, fehler, (o, w) => teile(o, ['name', 'beschreibung'] as const, w, fehler));
  return { beschriftung: { ...(mappentypen ? { mappentypen } : {}), ...(sichten ? { sichten } : {}) }, fehler };
}

/** Anzahl der Texte eines Sprachpakets. */
export const anzahlTexte = (texte: Readonly<Sprachtexte>) => Object.values(texte).reduce((n, d) => n + Object.keys(d).length, 0);

/** Ist das eine eingebaute Sprache (Deutsch, Englisch)? */
export const istEingebaut = (spr: string) => spr === AUSGANGSSPRACHE || (EINGEBAUTE_SPRACHEN as readonly string[]).includes(spr);
