/**
 * Archivmodus (#212): Aufbewahrungsfristen je Mappentyp. Die Frist läuft bis zum Ende des
 * Kalenderjahres des Stichtags plus N Jahre; vorher lässt sich nichts löschen.
 * Unterstützt eine GoBD-gerechte Aufbewahrung – ersetzt keine Verfahrensdokumentation.
 */
import type { Mappe } from './model';
import { datumsformat } from './region';
import { t } from './texte';

export interface Archiv {
  /** Aufbewahrungsfrist in Jahren. */
  jahre: number;
  /** Datumsfeld, das zählt (z. B. Rechnungsdatum); null = Anlagedatum der Mappe. */
  stichtag: string | null;
  /**
   * Ist der Stichtag leer (#1051): „laeuftNicht“ = die Frist läuft noch nicht, die Mappe bleibt gesperrt, bis das Feld
   * gefüllt ist (laufender Vertrag, aktueller Stand). Fehlt = ab Anlagedatum (wie bisher). Nur mit `stichtag`.
   */
  leererStichtag?: 'laeuftNicht';
}

/** Ist der Stichtag leer (#1051) – Schreibweise im Paketformat und in der Schnittstelle; „anlage“ ist die Vorgabe. */
export const LEERER_STICHTAG = ['anlage', 'laeuftNicht'] as const;
export type LeererStichtag = (typeof LEERER_STICHTAG)[number];

/** Vorschläge mit Begründung (Stand 2025). */
export const FRISTEN = [
  { jahre: 2, text: t('gemeinsam.archiv.handwerkerrechnungen-privat-14b-ustg') },
  { jahre: 6, text: t('gemeinsam.archiv.geschaeftsbriefe') },
  { jahre: 8, text: t('gemeinsam.archiv.buchungsbelege-seit-2025') },
  { jahre: 10, text: t('gemeinsam.archiv.buecher-und-aufzeichnungen') },
] as const;
export const JAHRE_MAX = 30;

const tag = (d: Date) => datumsformat('sv-SE').format(d);

type MitWerten = Pick<Mappe, 'werte' | 'erstellt'>;
const stichtagWert = (a: Archiv, m: MitWerten): string | null => {
  const v = a.stichtag ? m.werte?.[a.stichtag] : null;
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : null;
};

/**
 * Läuft die Frist noch nicht (#1051)? Archivmodus mit „Ist der Stichtag leer: läuft noch nicht ab“ und leerem Stichtag –
 * die Mappe ist gesperrt, ein Ende gibt es noch nicht.
 */
export const laeuftNochNicht = (a: Archiv | null | undefined, m: MitWerten): boolean =>
  !!a?.stichtag && a.leererStichtag === 'laeuftNicht' && stichtagWert(a, m) === null;

/**
 * „aufbewahren bis“ als JJJJ-12-31; null ohne Archivmodus – und wenn die Frist noch nicht läuft (#1051, siehe
 * `laeuftNochNicht`; ob gesperrt, sagt `gesperrt`).
 */
export function aufbewahrenBis(a: Archiv | null | undefined, m: MitWerten): string | null {
  if (!a || laeuftNochNicht(a, m)) return null;
  const datum = stichtagWert(a, m) ?? tag(m.erstellt ? new Date(m.erstellt) : new Date());
  return `${Number(datum.slice(0, 4)) + a.jahre}-12-31`;
}

/** Noch in der Frist? (Am letzten Tag der Frist noch geschützt.) */
export const inFrist = (bis: string | null, jetzt = new Date()) => bis !== null && tag(jetzt) <= bis;

/** Löschsperre des Archivmodus: in der Frist oder die Frist läuft noch nicht (#1051). */
export const gesperrt = (a: Archiv | null | undefined, m: MitWerten, jetzt = new Date()): boolean =>
  laeuftNochNicht(a, m) || inFrist(aufbewahrenBis(a, m), jetzt);

/** Beschriftung des Stichtag-Felds („Frist beginnt mit …“, #1051); ohne Feld dessen Kennung. */
export const stichtagName = (typ: { archiv?: Archiv | null; felder: Array<{ key: string; label: string }> } | null | undefined): string =>
  (typ?.archiv?.stichtag ? typ.felder.find((f) => f.key === typ.archiv!.stichtag)?.label || typ.archiv.stichtag : '');

/** Archivmodus aus Paket oder Schnittstelle (#212, #1051): Frist 1–30 Jahre, Stichtag ein Feldschlüssel oder null. */
export function archivAus(roh: unknown): Archiv | null {
  const a = roh && typeof roh === 'object' ? roh as Record<string, unknown> : null;
  const jahre = a ? Math.trunc(Number(a.jahre)) : 0;
  if (!a || !(jahre >= 1 && jahre <= JAHRE_MAX)) return null;
  const stichtag = (a.stichtag == null ? '' : String(a.stichtag)).trim() || null;
  return { jahre, stichtag, ...(stichtag && a.leererStichtag === 'laeuftNicht' ? { leererStichtag: 'laeuftNicht' as const } : {}) };
}

/** 2034-12-31 → 31.12.2034 */
export const datumText = (iso: string) => iso.split('-').reverse().join('.');

/**
 * Archivmodus aus dem Paket (#1051, Schreibweise der Entwürfe Compliance, Verträge und Rechnungen in dms-registry):
 * `archiv: { jahre, jahreBeruflich?, stichtag?, leererStichtag?: anlage | laeuftNicht }` am Mappentyp. Eine Vorgabe nur
 * für Typen, die das Paket neu anlegt – vorhandene Typen ändert es nie (auch kein Update), damit ein Paket den
 * Archivmodus nie lockern kann. Der Administrator ändert ihn danach am Mappentyp.
 */
export interface PaketArchiv {
  jahre: number;
  /** Mit dem Merkmal „beruflich genutzt“ (#1032) beim Installieren statt `jahre`. */
  jahreBeruflich?: number;
  /** Kennung eines Datumsfelds dieses Typs; ohne: Anlagedatum. */
  stichtag?: string;
  leererStichtag?: LeererStichtag;
}

/** Ab dieser Version übernimmt Ablago den Archivmodus aus dem Paket (#1051). Beim Einreihen auf die Version setzen, mit der es erscheint. */
export const DMS_ARCHIV_PAKET_AB = '0.237.0';

const ganzeJahre = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= JAHRE_MAX;

/** jahre und jahreBeruflich: ganze Zahlen 1–30, beruflich nicht kürzer (wie `pruefen.py`). */
function jahreFehler(a: Record<string, unknown>, wo: string): string[] {
  const fehler: string[] = [];
  if (!ganzeJahre(a.jahre)) fehler.push(`${wo}: archiv.jahre muss eine ganze Zahl von 1 bis ${JAHRE_MAX} sein.`);
  if (a.jahreBeruflich !== undefined && !ganzeJahre(a.jahreBeruflich)) fehler.push(`${wo}: archiv.jahreBeruflich muss eine ganze Zahl von 1 bis ${JAHRE_MAX} sein.`);
  else if (ganzeJahre(a.jahre) && ganzeJahre(a.jahreBeruflich) && (a.jahreBeruflich as number) < (a.jahre as number)) fehler.push(`${wo}: archiv.jahreBeruflich ist kürzer als jahre – beruflich gilt meist länger.`);
  return fehler;
}

/** Fehler in `archiv` eines Paket-Typs (wie `pruefen.py` der Registry); `felder` sind die des Typs im Paket. */
export function paketArchivFehler(roh: unknown, felder: Array<{ key: string; typ?: unknown }>, wo: string): string[] {
  if (roh === undefined || roh === null) return [];
  if (typeof roh !== 'object' || Array.isArray(roh)) return [`${wo}: archiv muss ein Objekt sein ({ jahre, jahreBeruflich, stichtag, leererStichtag }).`];
  const a = roh as Record<string, unknown>;
  const fehler: string[] = [];
  for (const k of Object.keys(a)) if (!['jahre', 'jahreBeruflich', 'stichtag', 'leererStichtag'].includes(k)) fehler.push(`${wo}: archiv kennt „${k}“ nicht (möglich: jahre, jahreBeruflich, stichtag, leererStichtag).`);
  fehler.push(...jahreFehler(a, wo));
  if (a.stichtag !== undefined && a.stichtag !== null && felder.find((f) => f.key === a.stichtag)?.typ !== 'datum') fehler.push(`${wo}: archiv.stichtag „${String(a.stichtag)}“ muss ein Datumsfeld dieses Typs sein.`);
  if (a.leererStichtag !== undefined && !(LEERER_STICHTAG as readonly unknown[]).includes(a.leererStichtag)) fehler.push(`${wo}: archiv.leererStichtag ist „anlage“ oder „laeuftNicht“.`);
  else if (a.leererStichtag !== undefined && (a.stichtag === undefined || a.stichtag === null)) fehler.push(`${wo}: archiv.leererStichtag nur mit archiv.stichtag.`);
  return fehler;
}

/** Archivmodus eines neuen Typs aus der Paketangabe; mit „beruflich genutzt“ (#1032) gilt `jahreBeruflich`. */
export function archivAusPaket(p: PaketArchiv | undefined, beruflich: boolean): Archiv | null {
  if (!p) return null;
  return archivAus({ jahre: beruflich && p.jahreBeruflich ? p.jahreBeruflich : p.jahre, stichtag: p.stichtag ?? null, leererStichtag: p.leererStichtag });
}

/** Archivmodus eines Typs ins Paket (Paket erstellen): wie eingestellt; `jahreBeruflich` gibt es am Typ nicht. */
export function archivInsPaket(a: Archiv | null | undefined, felder: Array<{ key: string }>): PaketArchiv | null {
  if (!a) return null;
  const stichtag = a.stichtag && felder.some((f) => f.key === a.stichtag) ? a.stichtag : undefined;
  return { jahre: a.jahre, ...(stichtag ? { stichtag } : {}), ...(stichtag && a.leererStichtag === 'laeuftNicht' ? { leererStichtag: 'laeuftNicht' as const } : {}) };
}
