/**
 * Feldformate und Datumsgrenzen (#535): Textfelder können ein Format haben (E-Mail, Telefon,
 * Internetseite, IBAN, PLZ), Datumsfelder Grenzen (`min`/`max`, fest wie `2000-01-01` oder `heute`).
 *
 * Grundsatz: Ein neues Format macht gespeicherte Werte **nicht ungültig und nicht anders**. Geprüft
 * und angeglichen (https:// ergänzen, IBAN in Vierergruppen) wird nur, was sich beim Speichern ändert –
 * bei einer neuen Mappe also alles, beim Bearbeiten nur die geänderten Felder. Was im Bestand nicht passt,
 * listet die Werkbank (Wartungsoperationen) auf. Die Passung einer Mappe (Zu erledigen) bleibt davon unberührt.
 *
 * Die IBAN-Prüfung kommt aus der Erkennung (`istIban`), damit es sie nur einmal gibt.
 * Texte stehen in `sprachen/de/felder.json`.
 */
import { IBAN_LAENGEN, istIban } from './erkennung';
import type { Feld, Mappentyp, Wert, Werte } from './model';
import { uebersetzer } from './sprache';
import felder from './sprachen/de/felder.json';

const t = uebersetzer({ felder });
/** Heute in der Zeitzone des Haushalts (wie `ZEITZONE` im Modell); hier eigen, damit es keinen Ring der Module gibt. */
const heuteIn = (jetzt = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(jetzt);

export const FELDFORMATE = ['email', 'telefon', 'internetseite', 'iban', 'plz'] as const;
export type Feldformat = (typeof FELDFORMATE)[number];
export const istFeldformat = (v: unknown): v is Feldformat => typeof v === 'string' && (FELDFORMATE as readonly string[]).includes(v);
/** Anzeigename eines Formats, z. B. „Telefon“. */
export const formatName = (f: Feldformat) => t.frei(`felder.format.${f}`);

/** Relative Datumsgrenze: der Tag, an dem geprüft wird. */
export const HEUTE = 'heute';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const gueltigesDatum = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
/** Ist das eine erlaubte Datumsgrenze? „heute“ oder ein Datum JJJJ-MM-TT. */
export const istDatumsgrenze = (v: unknown): v is string => typeof v === 'string' && (v === HEUTE || gueltigesDatum(v));
/** Datumsgrenze als Tag; null = keine. */
export function grenzeAlsTag(g: unknown, heute: string): string | null {
  if (g === HEUTE) return heute;
  return typeof g === 'string' && gueltigesDatum(g) ? g : null;
}
const datumText = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Handy-Tastatur je Format (#535, #490/#497). */
export function eingabemodus(f: Pick<Feld, 'format'>, deutschePlz = true): 'email' | 'tel' | 'url' | 'numeric' | undefined {
  switch (f.format) {
    case 'email': return 'email';
    case 'telefon': return 'tel';
    case 'internetseite': return 'url';
    case 'plz': return deutschePlz ? 'numeric' : undefined;
    default: return undefined;
  }
}

/* ---------- Einzelne Formate ---------- */

const EMAIL = /^[^\s@<>()[\]",;:]+@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+\p{L}{2,}$/u;
export const istEmail = (s: string) => EMAIL.test(s.trim());

/** Telefon: Ziffern, + nur am Anfang, Leerzeichen, /, -, Klammern; mindestens drei Ziffern. */
export const istTelefon = (s: string) => /^\+?[\d\s/()-]+$/.test(s.trim()) && (s.match(/\d/g)?.length ?? 0) >= 3;
/** Wählbare Nummer für einen tel:-Link: nur + und Ziffern. */
export const telefonLink = (s: string) => `tel:${s.trim().replace(/[^\d+]/g, '')}`;

/** Internetseite: ohne Schema wird https:// ergänzt. */
export function mitSchema(s: string): string {
  const x = s.trim();
  return !x || /^[a-z][a-z0-9+.-]*:\/\//i.test(x) ? x : `https://${x}`;
}
export function istInternetseite(s: string): boolean {
  const x = mitSchema(s);
  if (/\s/.test(x)) return false;
  try {
    const u = new URL(x);
    return (u.protocol === 'http:' || u.protocol === 'https:') && /^[^.]+(\.[^.]+)+$/.test(u.hostname) && !u.hostname.endsWith('.');
  } catch { return false; }
}

const ibanKompakt = (s: string) => s.replace(/\s/g, '').toUpperCase();
/** IBAN in Vierergruppen, z. B. „DE89 3704 0044 0532 0130 00“. */
export const ibanGruppen = (s: string) => ibanKompakt(s).replace(/(.{4})(?=.)/g, '$1 ');
const landName = (code: string) => {
  try { return new Intl.DisplayNames(['de'], { type: 'region' }).of(code) ?? code; } catch { return code; }
};
/** Fehler einer IBAN oder null. Länge je Land, Prüfziffer nach ISO 13616 (aus der Erkennung). */
export function ibanFehler(s: string): string | null {
  const i = ibanKompakt(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(i)) return t('felder.fehler.iban.aufbau');
  const laenge = IBAN_LAENGEN[i.slice(0, 2)];
  if (!laenge) return t('felder.fehler.iban.land', { land: i.slice(0, 2) });
  if (i.length !== laenge) return t('felder.fehler.iban.laenge', { land: landName(i.slice(0, 2)), laenge, ist: i.length });
  return istIban(i) ? null : t('felder.fehler.iban.pruefziffer');
}

/* ---------- PLZ und Land ---------- */

const DEUTSCHLAND = new Set(['deutschland', 'de', 'deu', 'd', 'germany', 'bundesrepublik deutschland', 'brd']);
/** Steht hier Deutschland? Leer zählt als Deutschland (Vorgabe). */
export const istDeutschland = (land: unknown) => {
  const s = (Array.isArray(land) ? land[0] : land) == null ? '' : String(Array.isArray(land) ? land[0] : land).trim().toLowerCase();
  return !s || DEUTSCHLAND.has(s);
};
/**
 * Gilt für dieses PLZ-Feld die deutsche Regel (genau 5 Ziffern)? Ja, wenn das Land-Feld (`landFeld`)
 * Deutschland enthält – oder leer ist und seine Vorgabe Deutschland bzw. leer ist. Ohne Land-Feld gilt Deutschland.
 */
export function deutschePlz(f: Pick<Feld, 'landFeld'>, alle: Pick<Feld, 'key' | 'standard'>[], werte: Werte): boolean {
  const lf = f.landFeld ? alle.find((x) => x.key === f.landFeld) : undefined;
  if (!lf) return true;
  const w = werte[lf.key];
  const leer = w == null || w === '' || (Array.isArray(w) && !w.length);
  return istDeutschland(leer ? lf.standard : w);
}

/* ---------- Prüfen ---------- */

export interface FormatKontext {
  /** Alle Felder des Typs (für das Land-Feld der PLZ). */
  felder: Pick<Feld, 'key' | 'standard'>[];
  /** Alle Werte der Mappe (für das Land-Feld der PLZ). */
  werte: Werte;
  /** Tag der Prüfung (JJJJ-MM-TT, Zeitzone des Haushalts); Standard: heute. */
  heute?: string;
}

/** Hat das Feld ein Format oder Grenzen, die hier geprüft werden? */
export const hatVorgaben = (f: Feld) =>
  (f.typ === 'text' && istFeldformat(f.format)) || (f.typ === 'datum' && (istDatumsgrenze(f.min) || istDatumsgrenze(f.max)));

/** Was an einem Wert nicht zum Format bzw. zu den Grenzen passt; null = passt (oder leer). */
export function formatFehler(f: Feld, v: Wert | undefined, k: FormatKontext): string | null {
  if (v == null || v === '') return null;
  if (f.typ === 'text' && istFeldformat(f.format) && typeof v === 'string') {
    switch (f.format) {
      case 'email': return istEmail(v) ? null : t('felder.fehler.email');
      case 'telefon': return istTelefon(v) ? null : t('felder.fehler.telefon');
      case 'internetseite': return istInternetseite(v) ? null : t('felder.fehler.internetseite');
      case 'iban': return ibanFehler(v);
      case 'plz': return !deutschePlz(f, k.felder, k.werte) || /^\d{5}$/.test(v.trim()) ? null : t('felder.fehler.plz');
    }
  }
  if (f.typ === 'datum' && typeof v === 'string' && ISO.test(v)) {
    const heute = k.heute ?? heuteIn();
    const min = grenzeAlsTag(f.min, heute), max = grenzeAlsTag(f.max, heute);
    if (min && v < min) return f.min === HEUTE ? t('felder.fehler.datum.vergangenheit') : t('felder.fehler.datum.vor', { datum: datumText(min) });
    if (max && v > max) return f.max === HEUTE ? t('felder.fehler.datum.zukunft') : t('felder.fehler.datum.nach', { datum: datumText(max) });
  }
  return null;
}

const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Muss dieses Feld beim Speichern zum Format passen? Neu (ohne `alt`) immer, sonst nur, wenn es (oder sein Land) sich ändert. */
function geaendert(f: Feld, werte: Werte, alt: Werte | undefined): boolean {
  if (!alt) return true;
  if (!gleich(werte[f.key], alt[f.key])) return true;
  return f.format === 'plz' && !!f.landFeld && !gleich(werte[f.landFeld], alt[f.landFeld]);
}

/**
 * Formate und Grenzen beim Speichern prüfen (#535): Fehler je Feldschlüssel. Mit `alt` (die gespeicherten
 * Werte) nur die Felder, die sich ändern – der Bestand bleibt gültig.
 */
export function pruefeFormate(typ: Pick<Mappentyp, 'felder'>, werte: Werte, alt?: Werte, heute?: string): Record<string, string[]> {
  const fehler: Record<string, string[]> = {};
  for (const f of typ.felder) {
    if (!hatVorgaben(f) || !geaendert(f, werte, alt)) continue;
    const x = formatFehler(f, werte[f.key], { felder: typ.felder, werte, heute });
    if (x) fehler[f.key] = [x];
  }
  return fehler;
}

/**
 * Eingaben angleichen, bevor sie geprüft und gespeichert werden: Internetseite bekommt https://, eine
 * gültige IBAN steht in Vierergruppen. Nur geänderte Werte; gespeicherte bleiben, wie sie sind.
 */
export function gleicheFormateAn(typ: Pick<Mappentyp, 'felder'>, werte: Werte, alt: Werte = {}): Werte {
  let neu: Werte | null = null;
  for (const f of typ.felder) {
    const v = werte[f.key];
    if (f.typ !== 'text' || typeof v !== 'string' || !v || gleich(v, alt[f.key])) continue;
    let w = v;
    if (f.format === 'internetseite' && istInternetseite(v)) w = mitSchema(v);
    else if (f.format === 'iban' && !ibanFehler(v)) w = ibanGruppen(v);
    else if (f.format === 'email' || f.format === 'telefon' || f.format === 'plz') w = v.trim();
    if (w !== v) (neu ??= { ...werte })[f.key] = w;
  }
  return neu ?? werte;
}

/* ---------- Bestand (Werkbank) ---------- */

export interface UnpassendeAngabe { mappeId: string; feldKey: string; wert: string; grund: string }

/** Gespeicherte Angaben, die nicht (mehr) zum Format bzw. zu den Grenzen passen. */
export function unpassendeAngaben(typ: Pick<Mappentyp, 'felder'>, mappen: Array<{ id: string; werte: Werte }>, heute = heuteIn()): UnpassendeAngabe[] {
  const felderMit = typ.felder.filter(hatVorgaben);
  if (!felderMit.length) return [];
  const aus: UnpassendeAngabe[] = [];
  for (const m of mappen) {
    for (const f of felderMit) {
      const grund = formatFehler(f, m.werte[f.key], { felder: typ.felder, werte: m.werte, heute });
      if (grund) aus.push({ mappeId: m.id, feldKey: f.key, wert: String(m.werte[f.key]), grund });
    }
  }
  return aus;
}

/* ---------- Definition ---------- */

/** Probleme der Format-Eigenschaften eines Felds (für die Prüfung des Mappentyps). */
export function pruefeFormatDefinition(f: Feld, alle: Feld[]): string[] {
  const m: string[] = [];
  if (f.format != null && (!istFeldformat(f.format) || f.typ !== 'text')) m.push(t('felder.definition.format'));
  if (f.landFeld) {
    const lf = alle.find((x) => x.key === f.landFeld);
    if (f.format !== 'plz') m.push(t('felder.definition.landfeld.nurplz'));
    else if (!lf || lf.key === f.key || (lf.typ !== 'text' && lf.typ !== 'auswahl')) m.push(t('felder.definition.landfeld.fehlt', { feld: f.landFeld }));
  }
  if (f.typ === 'datum') {
    for (const g of [f.min, f.max]) if (g != null && g !== '' && !istDatumsgrenze(g)) m.push(t('felder.definition.datum.grenze'));
    if (typeof f.min === 'string' && typeof f.max === 'string' && f.min !== HEUTE && f.max !== HEUTE && istDatumsgrenze(f.min) && istDatumsgrenze(f.max) && f.min > f.max) m.push(t('felder.definition.datum.reihenfolge'));
  }
  return m;
}
