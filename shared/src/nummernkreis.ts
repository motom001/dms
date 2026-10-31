/**
 * Nummernkreise (#171): fortlaufende Nummern wie „202610-R0000001“ für Textfelder.
 * Ein Feld nutzt einen Kreis über den Standardwert `{nummernkreis:<schlüssel>}`; der Wert ist dann
 * schreibgeschützt und wird beim Anlegen der Mappe vergeben.
 */
import type { Feld } from './model';

const ZEITZONE = 'Europe/Berlin';

export interface Nummernkreis {
  schluessel: string;
  name: string;
  /** Platzhalter {jjjj} {jj} {mm} {tt} {zaehler} {zaehler:n}; alles andere bleibt stehen. */
  muster: string;
  /** Erster Zählerwert eines Zeitraums. */
  start: number;
  /** Je Zeitraum (siehe zeitraumVon) der zuletzt vergebene Zählerwert. */
  staende: Record<string, number>;
  /** Zuletzt vergebene Nummern, neueste zuerst. */
  zuletzt: Array<{ nummer: string; am: string; mappeId: string | null }>;
}

export const KREIS_SCHLUESSEL = /^[a-z][a-z0-9_]{0,39}$/;
const PLATZHALTER = /^\{nummernkreis:([a-z][a-z0-9_]{0,39})\}$/;

/** Schlüssel des Nummernkreises, den ein Feld nutzt (nur Textfelder), sonst null. */
export function kreisVon(f: Pick<Feld, 'typ' | 'standard'>): string | null {
  if (typeof f.standard !== 'string') return null;
  const m = PLATZHALTER.exec(f.standard.trim());
  return m && f.typ === 'text' ? m[1] : null;
}
/** Steht ein Nummernkreis im Standardwert – unabhängig vom Feldtyp (für die Prüfung des Mappentyps)? */
export function kreisImStandard(standard: unknown): string | null {
  return typeof standard === 'string' ? PLATZHALTER.exec(standard.trim())?.[1] ?? null : null;
}

export interface Datum { jahr: number; monat: number; tag: number }
/** Kalendertag in Europe/Berlin. */
export function datumIn(jetzt: Date): Datum {
  const [jahr, monat, tag] = new Intl.DateTimeFormat('sv-SE', { timeZone: ZEITZONE }).format(jetzt).split('-').map(Number);
  return { jahr, monat, tag };
}

const zwei = (n: number) => String(n).padStart(2, '0');

/** Fehler im Muster, sonst null. */
export function pruefeMuster(muster: string): string | null {
  if (!muster.trim()) return 'Das Muster ist leer.';
  if (muster.length > 100) return 'Das Muster ist zu lang (höchstens 100 Zeichen).';
  const zaehler = muster.match(/\{zaehler(?::(\d+))?\}/g) ?? [];
  if (zaehler.length !== 1) return 'Das Muster braucht genau einen Platzhalter {zaehler} (oder z. B. {zaehler:7}).';
  const n = /\{zaehler:(\d+)\}/.exec(muster)?.[1];
  if (n !== undefined && (Number(n) < 1 || Number(n) > 18)) return 'Die Stellenzahl im Zähler muss zwischen 1 und 18 liegen.';
  const fremd = (muster.match(/\{[^}]*\}/g) ?? []).filter((p) => !/^\{(jjjj|jj|mm|tt|zaehler(:\d+)?)\}$/.test(p));
  if (fremd.length) return `Unbekannter Platzhalter ${fremd[0]}. Erlaubt: {jjjj} {jj} {mm} {tt} {zaehler} {zaehler:n}.`;
  return null;
}

/** Wann der Zähler neu beginnt – aus dem Muster. */
export function neubeginn(muster: string): 'taeglich' | 'monatlich' | 'jaehrlich' | 'nie' {
  if (muster.includes('{tt}')) return 'taeglich';
  if (muster.includes('{mm}')) return 'monatlich';
  if (muster.includes('{jjjj}') || muster.includes('{jj}')) return 'jaehrlich';
  return 'nie';
}
export const NEUBEGINN_TEXT = { taeglich: 'täglich', monatlich: 'monatlich', jaehrlich: 'jährlich', nie: 'nie' } as const;

/** Schlüssel des Zeitraums, für den ein eigener Zählerstand gilt. */
export function zeitraumVon(muster: string, d: Datum): string {
  switch (neubeginn(muster)) {
    case 'taeglich': return `${d.jahr}-${zwei(d.monat)}-${zwei(d.tag)}`;
    case 'monatlich': return `${d.jahr}-${zwei(d.monat)}`;
    case 'jaehrlich': return String(d.jahr);
    default: return 'immer';
  }
}

export function formatiereNummer(muster: string, zaehler: number, d: Datum): string {
  return muster.replace(/\{(jjjj|jj|mm|tt|zaehler(?::(\d+))?)\}/g, (_, p: string, n?: string) => {
    if (p === 'jjjj') return String(d.jahr);
    if (p === 'jj') return zwei(d.jahr % 100);
    if (p === 'mm') return zwei(d.monat);
    if (p === 'tt') return zwei(d.tag);
    const s = String(zaehler);
    return n ? (zaehler < 0 ? s : s.padStart(Number(n), '0')) : s;
  });
}

/** Nächster Zählerwert und Nummer für einen Tag – ohne etwas zu verbrauchen. */
export function naechste(k: Pick<Nummernkreis, 'muster' | 'start' | 'staende'>, d: Datum) {
  const zeitraum = zeitraumVon(k.muster, d);
  const letzter = k.staende[zeitraum];
  const zaehler = letzter === undefined ? k.start : letzter + 1;
  return { zeitraum, zaehler, nummer: formatiereNummer(k.muster, zaehler, d) };
}

/** Nummer ziehen: neuer Stand des Kreises und die vergebene Nummer (der Aufrufer speichert beides zusammen). */
export function ziehe(k: Nummernkreis, d: Datum, mappeId: string | null, am: string): { kreis: Nummernkreis; nummer: string } {
  const n = naechste(k, d);
  return {
    nummer: n.nummer,
    kreis: { ...k, staende: { ...k.staende, [n.zeitraum]: n.zaehler }, zuletzt: [{ nummer: n.nummer, am, mappeId }, ...k.zuletzt].slice(0, 10) },
  };
}
