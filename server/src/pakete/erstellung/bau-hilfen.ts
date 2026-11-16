/**
 * Typen und Hilfen zum Bauen eines Pakets: Eingabe lesen, Art erkennen, freie Namen, Änderung eines Typs.
 */
import { type TippDaten } from '../../../../shared/src/entdecken-werkbank';
import type { Automatisierung } from '../../../../shared/src/automatisierung';
import { type Feld, type Mappe, type Mappentyp } from '../../../../shared/src/model';
import { BEREICH, VERSION, type InstalliertesPaket } from '../../../../shared/src/pakete';
import type { Synonymgruppe } from '../../repo';
import {
  LIZENZTEXT_MAX,
  type Fehlend,
  type PaketEntwurf,
  type PaketErstellenEingabe,
  type PaketPruefung,
  type VersionsArt,
  type VersionsLage,
} from '../../../../shared/src/paketerstellung';
import type { Sicht } from '../../../../shared/src/sichten';
import { t } from '../../sprache';
import { typBild, typUnterschiede, type TypUnterschiede } from '../../../../shared/src/typvergleich';

/**
 * Beim Auswählen übernehmen (#1037) ins Paket: Paare aus Feldkennungen, so wie sie sind – ohne Ziel und ohne Zielfeld
 * im Paket (Systemfelder kommen nicht mit) fallen sie weg.
 */
export function vorbelegenInsPaket(x: Record<string, unknown>, f: Feld, typ: Mappentyp) {
  delete x.vorbelegen;
  const paare = (f.typ === 'referenz' ? (f.vorbelegen ?? []) : []).filter((p) => typ.felder.some((g) => g.key === p.nach && !g.system));
  if (paare.length && (x.ziel !== undefined || x.zielOptional)) x.vorbelegen = paare.map(({ von, nach }) => ({ von, nach }));
}

/** Art der Änderung seit dem letzten Export: entfernt → größere, neu → neue Inhalte, sonst Korrektur. */
export function erkenneArt(
  e: PaketErstellenEingabe,
  entwurf: PaketEntwurf | null,
  felderJetzt: Record<string, string[]>,
  namen: Map<string, string>,
): { art: VersionsArt | null; grund: string | null } {
  if (!entwurf) return { art: null, grund: null };
  const weg = (alt: string[], neu: string[]) => alt.filter((x) => !neu.includes(x));
  const typWeg = weg(entwurf.typen, e.typen),
    sichtWeg = weg(entwurf.sichten, e.sichten);
  const name = (id: string) => namen.get(id) ?? t('meldungen.paketerstellung.ein-mappentyp');
  if (typWeg.length) return { art: 'gross', grund: t('meldungen.paketerstellung.mappentyp-nicht-mehr-dabei', { name: name(typWeg[0]) }) };
  if (sichtWeg.length) return { art: 'gross', grund: t('meldungen.paketerstellung.ansicht-nicht-mehr-dabei', { name: name(sichtWeg[0]) }) };
  const alt = entwurf.felder;
  if (alt)
    for (const [tid, keys] of Object.entries(alt)) {
      if (!e.typen.includes(tid) || !felderJetzt[tid]) continue;
      const f = weg(keys, felderJetzt[tid]);
      if (f.length) return { art: 'gross', grund: t('meldungen.paketerstellung.feld-in-entfernt', { f: f[0], name: name(tid) }) };
    }
  const typNeu = weg(e.typen, entwurf.typen),
    sichtNeu = weg(e.sichten, entwurf.sichten);
  if (typNeu.length) return { art: 'inhalt', grund: t('meldungen.paketerstellung.mappentyp-neu-dabei', { name: name(typNeu[0]) }) };
  if (sichtNeu.length) return { art: 'inhalt', grund: t('meldungen.paketerstellung.ansicht-neu-dabei', { name: name(sichtNeu[0]) }) };
  if (alt) {
    for (const tid of e.typen) {
      const f = felderJetzt[tid] ? weg(felderJetzt[tid], alt[tid] ?? []) : [];
      if (f.length) return { art: 'inhalt', grund: t('meldungen.paketerstellung.feld-in-neu', { f: f[0], name: name(tid) }) };
    }
    return { art: 'korrektur', grund: t('meldungen.paketerstellung.keine-felder-mappentypen-oder') };
  }
  return { art: null, grund: null };
}

/** Etwas, das wie eine Id aussieht (Mappe, Benutzer, Rolle) – gehört nie in ein Paket. */
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const mitId = (v: unknown) => ID.test(JSON.stringify(v) ?? '');

export const ENTWUERFE_MAX = 20;

/** Gemerkte Archive je selbst erstelltem Paket (#652): die letzten Versionen, je höchstens 5 MB (Einstellung, in der Sicherung). */
export const ARCHIVE_JE_PAKET = 10;

export type GemerktesArchiv = { version: string; erstellt: string; zip: string };

export const BEISPIELMAPPEN_MAX = 200;

/** Alles, was die Erzeugung aus dem DMS braucht. */
export interface ErstellenDaten {
  typen: Mappentyp[];
  sichten: Sicht[];
  pakete: InstalliertesPaket[];
  /** Mappentypen, auf die Pakete mit dms:… verweisen dürfen: Id → Kennung (benutzer, rolle; ablageort = früherer des Kerns, #883). */
  dmsTypen: Map<string, string>;
  /** Gewählte Beispiel-Mappen (nur aus gewählten eigenen Typen). */
  mappen: Mappe[];
  /**
   * Vorgaben aus Paketen (#1038), auf die Anzeige-Bedingungen „zeigt auf“ der Typen zeigen: Mappen-Id → feste Kennung
   * (`paket:<id>:<schluessel>`). So kommt die Bedingung mit der Kennung ins Paket statt mit der Id dieser Installation.
   */
  vorgaben?: Map<string, string>;
  /**
   * Beispiel-Dokumente (#878) je gewählter Mappe, wenn „mit Dokumenten“ gewählt ist: nur PDF, PNG und JPEG.
   * `ausgelassen`: Dokumente anderer Art, die nicht mitkommen.
   */
  dokumente?: Map<string, Array<{ name: string; registerKey: string; erstellt: string; inhalt: Buffer }>>;
  dokumenteAusgelassen?: number;
  /** Alle Beispiel-Dokumente zusammen in Bytes, wenn sie nicht ins Archiv passen (dann ist keines geladen, das zu viel wäre). */
  dokumenteZuGross?: number;
  /** Alle Gruppen gleichbedeutender Wörter (#661); eigene haben die Quelle „werkbank“. */
  wortlisten?: Synonymgruppe[];
  /** Eigene Rundgänge der Werkbank (#941), wie geschrieben (YAML gelesen, nicht geprüft). */
  rundgaenge?: Array<{ schluessel: string; roh: Record<string, unknown> }>;
  /** Eigene Tipps der Werkbank (#942). */
  tipps?: Array<{ schluessel: string; daten: TippDaten }>;
  /** Eigene Automatisierungen (#680), wie gespeichert. */
  automatisierungen?: Automatisierung[];
  dmsVersion: string;
  /** Zuletzt exportierter Entwurf mit derselben Id. */
  entwurf: PaketEntwurf | null;
  /** Alle gemerkten Entwürfe (#656): unter welcher Kennung ein eigener Typ in einem früher exportierten Paket steckt. */
  entwuerfe?: PaketEntwurf[];
  jetzt: Date;
}

export interface Bau {
  probleme: string[];
  fehlend: Array<Fehlend & { noetig: boolean }>;
  hinweise: string[];
  abhaengigkeiten: Record<string, string>;
  inhalt: PaketPruefung['inhalt'];
  /** Kennungen im Paket je Id im DMS (zum Merken). */
  schluessel: Record<string, string>;
  /** Dateien des Pakets (ohne Ordner davor). */
  dateien: Array<{ name: string; daten: Buffer }>;
  /** #651: Version und Mindestversion. */
  version: VersionsLage;
  /** Feldschlüssel je exportiertem Typ (zum Merken, #651). */
  felder: Record<string, string[]>;
  /** Lizenzangabe im Manifest. */
  lizenz: string;
}

/** Null, undefined, leere Texte und „false“ weglassen – das Schema kennt kein null. */
export function ohneLeere<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && !v.length)),
  ) as Partial<T>;
}

/** Eine freie Kennung: Basis gekürzt, bei Bedarf mit _2, _3 … */
export function frei(basis: string, max: number, belegt: Set<string>): string {
  let b = basis
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '');
  if (!b) b = 'typ';
  b = b.slice(0, max).replace(/_+$/, '') || 'typ';
  let k = b;
  for (let n = 2; belegt.has(k); n++) k = `${b.slice(0, max - String(n).length - 1)}_${n}`;
  belegt.add(k);
  return k;
}

/** Untergrenze eines Versionsbereichs, z. B. „>=0.75.0“ → 0.75.0. */
export const untergrenze = (bereich: string) => BEREICH.exec(bereich.trim())?.[2] ?? null;

/** Text für eine Markdown-Tabellenzelle: Backslash zuerst, dann „|“ escapen, Zeilenumbrüche weg. */
export const zelle = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** Eintrag im CHANGELOG für diese Version; ohne Angabe ein Standardtext. */
export const aenderungsText = (e: PaketErstellenEingabe, entwurf: PaketEntwurf | null) =>
  e.aenderungen.trim() || (entwurf ? t('meldungen.paketerstellung.neue-version-aus-ablago') : t('meldungen.paketerstellung.erste-fassung'));

/** Eingabe aus der Anfrage vereinheitlichen. */
export function liesEingabe(x: unknown): PaketErstellenEingabe {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const t = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const ids = (v: unknown, max: number) =>
    Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))].slice(0, max) : [];
  const a = (o.autor && typeof o.autor === 'object' ? o.autor : {}) as Record<string, unknown>;
  return {
    typen: ids(o.typen, 500),
    sichten: ids(o.sichten, 500),
    beispiele: ids(o.beispiele, 100),
    wortlisten: ids(o.wortlisten, 1000),
    ...(Array.isArray(o.rundgaenge) ? { rundgaenge: ids(o.rundgaenge, 50) } : {}),
    ...(Array.isArray(o.tipps) ? { tipps: ids(o.tipps, 20) } : {}),
    ...(Array.isArray(o.automatisierungen) ? { automatisierungen: ids(o.automatisierungen, 100) } : {}),
    id: t(o.id, 40),
    name: t(o.name, 200),
    version: t(o.version, 40),
    beschreibung: t(o.beschreibung, 1000),
    autor: { name: t(a.name, 200), github: t(a.github, 100) },
    lizenz: t(o.lizenz, 40),
    dms: t(o.dms, 60),
    aenderungen: t(o.aenderungen, 2000),
    lizenzArt: o.lizenzArt === 'eigen' || o.lizenzArt === 'keine' ? o.lizenzArt : 'frei',
    ...(typeof o.lizenzName === 'string' ? { lizenzName: t(o.lizenzName, 200) } : {}),
    ...(typeof o.lizenzText === 'string' ? { lizenzText: o.lizenzText.slice(0, LIZENZTEXT_MAX + 1) } : {}),
    ...(typeof o.bekannteVersion === 'string' && VERSION.test(o.bekannteVersion) ? { bekannteVersion: o.bekannteVersion } : {}),
    ...(o.vonHand === true ? { vonHand: true } : {}),
    ...(o.beispielDokumente === true ? { beispielDokumente: true } : {}),
  };
}

/**
 * Weicht ein Typ aus einem Paket von dessen Stand ab (#653)? Mit gespeichertem Paketstand inhaltlich (Speichern ohne
 * Änderung zählt nicht), sonst – bei älteren Installationen – wie bisher nach der Zeit, ohne Einzelheiten.
 */
export function aenderung(
  t: Mappentyp,
  p: InstalliertesPaket,
  kennungVon?: (typId: string) => string | undefined,
): { geaendert: boolean; unterschiede: TypUnterschiede | null } {
  const stand = p.typStand?.[t.id];
  if (stand) {
    const u = typUnterschiede(stand, typBild(t, kennungVon));
    return { geaendert: !!u, unterschiede: u };
  }
  return { geaendert: t.geaendert > (p.aktualisiert ?? p.installiert), unterschiede: null };
}
