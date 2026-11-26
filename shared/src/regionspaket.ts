import { ostersonntag } from './feiertage';
import { sprache, sprachfolge } from './sprache';
import { t } from './texte';

/**
 * Regionspakete (#1696): Ein Paket bringt Feiertage und Regionen (z. B. Bundesländer) eines Landes als Regeln mit –
 * rein beschreibend, ohne Code (Stufe `vorlagen`). Manifest: `inhalt.region: inhalt/region.yaml`. Die Osterformel bleibt
 * im Kern (`ostersonntag`), das Paket nennt nur Abstände zu Ostersonntag.
 *
 * Ablago prüft die Datei beim Installieren und Aktualisieren streng (`pruefeRegionsregeln`, auch für `pakete-pruefen`
 * der Registry) und speichert sie am installierten Paket (`region`). Welche Region gewählt ist, bleibt eine Einstellung
 * des Kerns (Werkbank → Region): Das Paket liefert nur Regeln und die Liste der Regionen.
 */

/** Ab dieser Ablago-Version wirkt `inhalt.region`; ältere übergehen die Angabe (Paket: `dms: ">=0.333.0"`). */
export const DMS_REGIONSPAKETE_AB = '0.333.0';

/** Größe von `inhalt/region.yaml` (#1696). */
export const REGION_DATEI_MAX = 64 * 1024;
/** Grenzen der Datei: genug für alle Länder mit Regionen (Deutschland: 16 Regionen, 22 Regeln). */
const REGIONEN_MAX = 60;
const FEIERTAGSREGELN_MAX = 80;
const REGEL_REGIONEN_MAX = 60;
const REGEL_JAHRE_MAX = 30;
const REGION_NAME_MAX = 80;
const REGION_SPRACHEN_MAX = 30;
/** Jahre: gregorianischer Kalender (Osterformel) bis vierstellig. */
const JAHR_MIN = 1583;
const JAHR_MAX = 9999;
/** Ostersonntag fällt zwischen 22.03. und 25.04. – mit -80 … 250 Tagen bleibt jeder Feiertag im selben Jahr. */
const OSTERN_MIN = -80;
const OSTERN_MAX = 250;

/** Kennung einer Region im Land: 1–3 Großbuchstaben oder Ziffern (ISO 3166-2 ohne Land, z. B. SN). */
export const REGION_KENNUNG = /^[A-Z0-9]{1,3}$/;
const LAND = /^[A-Z]{2}$/;
const SPRACHE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const MONAT_TAG = /^(\d{2})-(\d{2})$/;

/** Name je Sprache; Deutsch (Ausgangssprache) ist Pflicht, Englisch empfohlen. */
type RegionName = Record<string, string>;

interface FeiertagRegel {
  name: RegionName;
  /** Fester Tag `MM-TT`. */
  datum?: string;
  /** Tage relativ zu Ostersonntag (Karfreitag -2, Pfingstmontag 50). */
  ostern?: number;
  /** Der letzte `wochentag` (0 = Sonntag … 6 = Samstag) vor `datum` (Buß- und Bettag: Mittwoch vor dem 23.11.). */
  vorDatum?: { wochentag: number; datum: string };
  /** Nur in diesen Regionen; fehlt: im ganzen Land. */
  regionen?: string[];
  /** Gilt ab bzw. bis zu diesem Jahr (einschließlich). */
  ab?: number;
  bis?: number;
  /** Gilt nur in diesen Jahren (z. B. Reformationstag 2017 bundesweit). */
  jahre?: number[];
}

export interface Regionsregeln {
  /** Land nach ISO 3166-1, z. B. DE – passt zu Werkbank → Region → Land. */
  land: string;
  regionen: Array<{ id: string; name: RegionName }>;
  /** Bei gleichem Tag gewinnt die spätere Regel (Name). */
  feiertage: FeiertagRegel[];
}

type Fehler = string[];
const istObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ganz = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function unbekannte(o: Record<string, unknown>, erlaubt: readonly string[], wo: string, f: Fehler) {
  for (const k of Object.keys(o)) if (!erlaubt.includes(k)) f.push(t('gemeinsam.regionspaket.unbekannt', { wo, schluessel: k }));
}

function pruefeName(v: unknown, wo: string, f: Fehler): RegionName {
  const ok =
    istObj(v) &&
    Object.keys(v).length <= REGION_SPRACHEN_MAX &&
    typeof v.de === 'string' &&
    Object.entries(v).every(([k, x]) => SPRACHE.test(k) && typeof x === 'string' && !!x.trim() && x.length <= REGION_NAME_MAX);
  if (!ok) {
    f.push(t('gemeinsam.regionspaket.name', { wo, max: REGION_NAME_MAX }));
    return { de: '' };
  }
  return Object.fromEntries(Object.entries(v as Record<string, string>).map(([k, x]) => [k, x.trim()]));
}

/** `MM-TT` als gültiger Tag in jedem Jahr (der 29. Februar nicht). */
function istMonatTag(v: unknown): v is string {
  const m = typeof v === 'string' ? MONAT_TAG.exec(v) : null;
  if (!m) return false;
  const [mo, ta] = [Number(m[1]), Number(m[2])];
  const d = new Date(Date.UTC(2001, mo - 1, ta));
  return mo >= 1 && mo <= 12 && d.getUTCMonth() === mo - 1 && d.getUTCDate() === ta;
}

function liste(v: unknown, max: number, wo: string, f: Fehler): unknown[] | null {
  if (Array.isArray(v) && v.length <= max) return v;
  f.push(t('gemeinsam.regionspaket.liste', { wo, max }));
  return null;
}

function pruefeRegionen(v: unknown, f: Fehler): Regionsregeln['regionen'] {
  const roh = liste(v, REGIONEN_MAX, 'regionen', f) ?? [];
  const gesehen = new Set<string>();
  return roh.map((r, i) => {
    const wo = `regionen[${i + 1}]`;
    if (!istObj(r)) {
      f.push(t('gemeinsam.regionspaket.format', { wo }));
      return { id: '', name: { de: '' } };
    }
    unbekannte(r, ['id', 'name'], wo, f);
    const id = typeof r.id === 'string' ? r.id : '';
    if (!REGION_KENNUNG.test(id)) f.push(t('gemeinsam.regionspaket.kennung', { wo, wert: String(r.id ?? '') }));
    else if (gesehen.has(id)) f.push(t('gemeinsam.regionspaket.doppelt', { wo, wert: id }));
    gesehen.add(id);
    return { id, name: pruefeName(r.name, wo, f) };
  });
}

/** Genau eine Art: datum, ostern oder vorDatum. */
function pruefeTag(r: Record<string, unknown>, wo: string, f: Fehler): Pick<FeiertagRegel, 'datum' | 'ostern' | 'vorDatum'> {
  const arten = (['datum', 'ostern', 'vorDatum'] as const).filter((k) => r[k] !== undefined);
  if (arten.length !== 1) {
    f.push(t('gemeinsam.regionspaket.art', { wo }));
    return {};
  }
  if (arten[0] === 'datum') {
    if (!istMonatTag(r.datum)) f.push(t('gemeinsam.regionspaket.datum', { wo, wert: String(r.datum) }));
    return { datum: String(r.datum) };
  }
  if (arten[0] === 'ostern') {
    if (!ganz(r.ostern, OSTERN_MIN, OSTERN_MAX)) f.push(t('gemeinsam.regionspaket.ostern', { wo, min: OSTERN_MIN, max: OSTERN_MAX }));
    return { ostern: Number(r.ostern) };
  }
  const v = r.vorDatum;
  if (!istObj(v)) {
    f.push(t('gemeinsam.regionspaket.wochentag', { wo }));
    return {};
  }
  unbekannte(v, ['wochentag', 'datum'], `${wo}.vorDatum`, f);
  if (!ganz(v.wochentag, 0, 6)) f.push(t('gemeinsam.regionspaket.wochentag', { wo }));
  if (!istMonatTag(v.datum)) f.push(t('gemeinsam.regionspaket.datum', { wo: `${wo}.vorDatum`, wert: String(v.datum) }));
  return { vorDatum: { wochentag: Number(v.wochentag), datum: String(v.datum) } };
}

/** ab, bis und jahre: ganze Jahre im gregorianischen Kalender, ab nicht nach bis. */
function pruefeJahre(r: Record<string, unknown>, wo: string, f: Fehler): Pick<FeiertagRegel, 'ab' | 'bis' | 'jahre'> {
  const erg: Pick<FeiertagRegel, 'ab' | 'bis' | 'jahre'> = {};
  for (const k of ['ab', 'bis'] as const) {
    if (r[k] === undefined) continue;
    if (!ganz(r[k], JAHR_MIN, JAHR_MAX)) f.push(t('gemeinsam.regionspaket.jahr', { wo, feld: k, min: JAHR_MIN, max: JAHR_MAX }));
    else erg[k] = r[k];
  }
  if (erg.ab !== undefined && erg.bis !== undefined && erg.ab > erg.bis) f.push(t('gemeinsam.regionspaket.ab-bis', { wo }));
  if (r.jahre !== undefined) {
    const j = liste(r.jahre, REGEL_JAHRE_MAX, `${wo}.jahre`, f);
    if (j && (!j.length || !j.every((x) => ganz(x, JAHR_MIN, JAHR_MAX))))
      f.push(t('gemeinsam.regionspaket.jahr', { wo, feld: 'jahre', min: JAHR_MIN, max: JAHR_MAX }));
    else if (j) erg.jahre = j as number[];
  }
  return erg;
}

function pruefeRegel(r: unknown, i: number, regionen: Set<string>, f: Fehler): FeiertagRegel {
  const wo = `feiertage[${i + 1}]`;
  if (!istObj(r)) {
    f.push(t('gemeinsam.regionspaket.format', { wo }));
    return { name: { de: '' } };
  }
  unbekannte(r, ['name', 'datum', 'ostern', 'vorDatum', 'regionen', 'ab', 'bis', 'jahre'], wo, f);
  const regel: FeiertagRegel = { name: pruefeName(r.name, wo, f), ...pruefeTag(r, wo, f), ...pruefeJahre(r, wo, f) };
  if (r.regionen !== undefined) {
    const l = liste(r.regionen, REGEL_REGIONEN_MAX, `${wo}.regionen`, f);
    for (const x of l ?? [])
      if (typeof x !== 'string' || !regionen.has(x)) f.push(t('gemeinsam.regionspaket.region-fehlt', { wo, wert: String(x) }));
    if (l && !l.length) f.push(t('gemeinsam.regionspaket.liste', { wo: `${wo}.regionen`, max: REGEL_REGIONEN_MAX }));
    regel.regionen = (l ?? []).map(String);
  }
  return regel;
}

/**
 * Prüft den Inhalt von `inhalt/region.yaml` (#1696). Streng: unbekannte Angaben, falsche Tage, Regionen ohne Eintrag
 * unter `regionen` und zu lange Listen sind Fehler – ein Fehler in den Feiertagen verschöbe sonst still Zeitpläne.
 */
export function pruefeRegionsregeln(roh: unknown): { regeln: Regionsregeln | null; fehler: string[] } {
  const f: Fehler = [];
  if (!istObj(roh)) return { regeln: null, fehler: [t('gemeinsam.regionspaket.format', { wo: 'region' })] };
  unbekannte(roh, ['land', 'regionen', 'feiertage'], 'region', f);
  if (typeof roh.land !== 'string' || !LAND.test(roh.land)) f.push(t('gemeinsam.regionspaket.land', { wert: String(roh.land ?? '') }));
  const regionen = pruefeRegionen(roh.regionen, f);
  const ids = new Set(regionen.map((r) => r.id));
  const feiertage = (liste(roh.feiertage, FEIERTAGSREGELN_MAX, 'feiertage', f) ?? []).map((r, i) => pruefeRegel(r, i, ids, f));
  return f.length ? { regeln: null, fehler: f } : { regeln: { land: String(roh.land), regionen, feiertage }, fehler: [] };
}

/** Name in der Sprache der Anfrage, sonst Englisch, sonst Deutsch (wie die Texte von Ablago). */
function regionText(n: RegionName): string {
  for (const s of sprachfolge(sprache())) if (n[s]) return n[s];
  return Object.values(n)[0] ?? '';
}

/** Die Regionen des Pakets als Kennung → Name (in der Sprache der Anfrage), in der Reihenfolge der Datei. */
export function regionenAusRegeln(r: Regionsregeln): Record<string, string> {
  return Object.fromEntries(r.regionen.map((x) => [x.id, regionText(x.name)]));
}

const tagUtc = (jahr: number, mmtt: string) => new Date(Date.UTC(jahr, Number(mmtt.slice(0, 2)) - 1, Number(mmtt.slice(3, 5))));
const TAG_MS = 86_400_000;

function tagDerRegel(r: FeiertagRegel, jahr: number, ostern: () => Date): Date | null {
  if (r.datum) return tagUtc(jahr, r.datum);
  if (r.ostern !== undefined) return new Date(ostern().getTime() + r.ostern * TAG_MS);
  if (r.vorDatum) {
    const vor = new Date(tagUtc(jahr, r.vorDatum.datum).getTime() - TAG_MS);
    return new Date(vor.getTime() - ((vor.getUTCDay() - r.vorDatum.wochentag + 7) % 7) * TAG_MS);
  }
  return null;
}

const giltIm = (r: FeiertagRegel, jahr: number, region: string | null) =>
  (r.ab === undefined || jahr >= r.ab) &&
  (r.bis === undefined || jahr <= r.bis) &&
  (!r.jahre || r.jahre.includes(jahr)) &&
  (!r.regionen || (region !== null && r.regionen.includes(region)));

/**
 * Feiertage eines Jahres aus Regeln (#1696): Datum (JJJJ-MM-TT) → Name. Ohne Region (`null`) nur die Regeln ohne
 * `regionen` (im ganzen Land). Liefert für die deutschen Regeln (`shared/regionen/de.yaml`, Test in server/test/regionspaket.test.ts) dasselbe wie `feiertage()`.
 */
export function feiertageAusRegeln(regeln: Regionsregeln, jahr: number, region: string | null): Map<string, string> {
  const f = new Map<string, string>();
  let o: Date | null = null;
  const ostern = () => (o ??= ostersonntag(jahr));
  for (const r of regeln.feiertage) {
    if (!giltIm(r, jahr, region)) continue;
    const d = tagDerRegel(r, jahr, ostern);
    if (d) f.set(d.toISOString().slice(0, 10), regionText(r.name));
  }
  return f;
}

/**
 * Das Regionspaket für ein Land unter den installierten Paketen (#1696); bei mehreren das erste nach Id, damit Server
 * und Einrichtungsassistent dasselbe wählen.
 */
export function regionspaketFuer<P extends { id: string; region?: Regionsregeln }>(
  pakete: readonly P[],
  land: string,
): (P & { region: Regionsregeln }) | null {
  const p = [...pakete].sort((a, b) => a.id.localeCompare(b.id)).find((x) => x.region?.land === land);
  return (p as (P & { region: Regionsregeln }) | undefined) ?? null;
}
