/**
 * Dann-Karte „Feld in verknüpfter Mappe setzen“ (#1557): setzt Felder der Mappe(n), auf die ein Verweisfeld der
 * auslösenden Mappe zeigt – z. B. „Nächste HU“ aus dem Prüfbericht als „HU fällig“ am Fahrzeug. Bei `mehrfach` jede.
 *
 * - **Werte** wie bei „Feld ändern“: fest, Text mit Platzhaltern, Datum auch `heute+7`. Steht nur ein Platzhalter
 *   `{feld}` da, übernimmt die Karte den gespeicherten Wert dieses Felds der auslösenden Mappe unverändert (Datum bleibt
 *   Datum, Zahl bleibt Zahl) – dafür müssen die Feldarten passen (oder das Ziel ist ein Textfeld).
 * - **`nurWenn`** (im Paket `nur_wenn`): `immer` (Vorgabe), `leer` (nur ein leeres Ziel), `spaeter` / `frueher` (nur ein
 *   späteres bzw. früheres Datum oder eine größere bzw. kleinere Zahl). So überschreibt ein nachgetragener alter
 *   Prüfbericht kein neueres Datum. Geprüft je Feld.
 * - **Rechte:** Der Server schreibt mit den Rechten, unter denen die Automatisierung läuft; fehlen sie, bleibt die
 *   Zielmappe, wie sie ist, und der Lauf vermerkt es (kein Fehler). Hier nur Modell, Bereinigen, Prüfen und Kurzform.
 */
import type { Feld, Mappentyp } from './model/basis';
import { t } from './texte';
import { jedeMappe, zieleVon } from './verweisziele';
import { NUR_WENN, type DannVerknuepft, type NurWenn } from './automatisierung-typen';

export const istNurWenn = (v: unknown): v is NurWenn => typeof v === 'string' && (NUR_WENN as readonly string[]).includes(v);

/** Feldarten, die `spaeter` und `frueher` vergleichen können. */
const VERGLEICHBAR = new Set<string>(['datum', 'zahl', 'prozent']);
const vergleichbar = (f: Pick<Feld, 'typ'>) => VERGLEICHBAR.has(f.typ);
/** Felder, die keine Automatisierung setzt (wie bei „Feld ändern“). */
const NICHT_SETZBAR = new Set<string>(['passwort', 'zusammengesetzt', 'tabelle']);
export const setzbar = (f: Pick<Feld, 'typ' | 'berechnetVon'>) => !NICHT_SETZBAR.has(f.typ) && !f.berechnetVon;
/** Textfelder nehmen jeden Platzhalter als Text. */
const TEXTARTEN = new Set<string>(['text', 'langtext', 'formatiert']);

/** Steht nur ein Platzhalter `{feld}` ohne Filter da? Dann sein Schlüssel. */
export function einzelnerPlatzhalter(v: unknown): string | null {
  return typeof v === 'string' ? (/^\{([a-z][a-z0-9_]*)\}$/.exec(v.trim())?.[1] ?? null) : null;
}

/** Karte aus einer Eingabe (Editor, Schnittstelle, Paket); `nur_wenn` (Paketformat) gilt wie `nurWenn`. */
export function bereinigeVerknuepft(x: Record<string, unknown>, kid: string, id: (v: unknown) => string, textMax: number): DannVerknuepft {
  const w = x.werte && typeof x.werte === 'object' && !Array.isArray(x.werte) ? (x.werte as Record<string, unknown>) : {};
  const nw = x.nurWenn ?? x.nur_wenn;
  return {
    id: kid,
    art: 'feld_verknuepft',
    ueber: id(x.ueber),
    werte: Object.fromEntries(
      Object.entries(w)
        .slice(0, 50)
        .map(([k, v]) => [id(k), typeof v === 'string' ? v.slice(0, textMax) : v])
        .filter(([k]) => k),
    ),
    ...(istNurWenn(nw) && nw !== 'immer' ? { nurWenn: nw } : {}),
  };
}

/** Das Verweisfeld `ueber` und die Typen, auf die es zeigt. */
export function verknuepfteTypen(
  d: Pick<DannVerknuepft, 'ueber'>,
  typ: Pick<Mappentyp, 'felder'> | null,
  typen: readonly Mappentyp[],
): { feld?: Feld; ziele: Mappentyp[] } {
  const feld = typ?.felder.find((f) => f.key === d.ueber);
  if (!feld || feld.typ !== 'referenz' || jedeMappe(feld)) return { feld, ziele: [] };
  return { feld, ziele: zieleVon(feld).flatMap((id) => typen.filter((x) => x.id === id)) };
}

const name = (typen: readonly Mappentyp[]) => typen.map((x) => `„${x.name}“`).join(', ');

/** Probleme eines Werts für das Feld `key` in allen Zieltypen. */
function wertProbleme(key: string, v: unknown, d: DannVerknuepft, typ: Mappentyp, ziele: Mappentyp[]): string[] {
  const p: string[] = [];
  const quelle = einzelnerPlatzhalter(v);
  const qf = quelle ? typ.felder.find((f) => f.key === quelle) : undefined;
  for (const z of ziele) {
    const f = z.felder.find((x) => x.key === key);
    if (!f) p.push(t('gemeinsam.automatisierung.verknuepft-feld-fehlt', { key, name: z.name }));
    else if (!setzbar(f)) p.push(t('gemeinsam.automatisierung.verknuepft-feld-nicht-setzbar', { label: f.label }));
    else if (d.nurWenn && d.nurWenn !== 'immer' && d.nurWenn !== 'leer' && !vergleichbar(f))
      p.push(t('gemeinsam.automatisierung.verknuepft-nur-wenn-art', { label: f.label }));
    else if (quelle && !TEXTARTEN.has(f.typ)) {
      if (!qf) p.push(t('gemeinsam.automatisierung.verknuepft-quelle-fehlt', { key: quelle, name: typ.name }));
      else if (qf.typ !== f.typ || qf.typ === 'passwort')
        p.push(t('gemeinsam.automatisierung.verknuepft-art-passt-nicht', { quelle: qf.label, label: f.label }));
    }
  }
  return p;
}

/** Was an der Karte nicht (mehr) passt: Mappentyp, Verweisfeld, Zieltypen, Felder, Feldarten und `nurWenn`. */
export function verknuepftProbleme(d: DannVerknuepft, typ: Mappentyp | null, typen: readonly Mappentyp[]): string[] {
  if (!typ) return [t('gemeinsam.automatisierung.verknuepft-braucht-typ')];
  const { feld, ziele } = verknuepfteTypen(d, typ, typen);
  if (!feld) return [t('gemeinsam.automatisierung.verknuepft-ueber-fehlt', { key: d.ueber || '?', name: typ.name })];
  if (feld.typ !== 'referenz') return [t('gemeinsam.automatisierung.verknuepft-kein-verweis', { label: feld.label })];
  if (!ziele.length) return [t('gemeinsam.automatisierung.verknuepft-ohne-ziel', { label: feld.label })];
  if (!Object.keys(d.werte).length) return [t('gemeinsam.automatisierung.verknuepft-keine-werte')];
  return Object.entries(d.werte).flatMap(([key, v]) => wertProbleme(key, v, d, typ, ziele));
}

/** Kurzform: „HU fällig in „Fahrzeug“ setzen (nur, wenn später)“. */
export function verknuepftKurz(d: DannVerknuepft, typ: Mappentyp | null, typen: readonly Mappentyp[]): string {
  const { feld, ziele } = verknuepfteTypen(d, typ, typen);
  const felder = Object.keys(d.werte)
    .map((k) => ziele.map((z) => z.felder.find((f) => f.key === k)?.label).find(Boolean) ?? k)
    .join(', ');
  return t('gemeinsam.automatisierung.verknuepft-kurz', {
    felder: felder || '?',
    ueber: feld?.label ?? (d.ueber || '?'),
    ziel: name(ziele) || '?',
    wann: d.nurWenn && d.nurWenn !== 'immer' ? t.frei(`gemeinsam.automatisierung.verknuepft-wann.${d.nurWenn}`) : '',
  });
}

const leer = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length);
/** Vergleichswert für `spaeter`/`frueher`: Datum als JJJJ-MM-TT, Zahl als Zahl; sonst null. */
function vergleichswert(f: Pick<Feld, 'typ'>, v: unknown): string | number | null {
  if (f.typ === 'datum') return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Darf der neue Wert den vorhandenen ersetzen? Ein leerer neuer Wert ersetzt bei `spaeter`/`frueher` nichts. */
export function nurWennErfuellt(nurWenn: NurWenn | undefined, f: Pick<Feld, 'typ'>, alt: unknown, neu: unknown): boolean {
  if (!nurWenn || nurWenn === 'immer') return true;
  if (nurWenn === 'leer') return leer(alt);
  const n = vergleichswert(f, neu);
  if (n === null) return false;
  const a = vergleichswert(f, alt);
  if (a === null) return leer(alt);
  return nurWenn === 'spaeter' ? n > a : n < a;
}
