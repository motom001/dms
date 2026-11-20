/**
 * Kalender in „Zu erledigen“ (#528, #725): Rechnen mit Tagen, Wochen und Monaten für Monat und Jahr.
 * Server und Oberfläche teilen diese Datei – der Server prüft damit den Zeitraum einer Abfrage, die
 * Oberfläche baut daraus die Raster. Alle Daten als Text JJJJ-MM-TT, gerechnet in UTC.
 */
import { verschiebe } from './sichten';
import { t } from './texte';

/** Ansichten von „Zu erledigen“ (#725); die Wahl merkt sich Ablago je Benutzer. */
export const ERLEDIGEN_ANSICHTEN = ['liste', 'monat', 'jahr'] as const;
export type ErledigenAnsicht = (typeof ERLEDIGEN_ANSICHTEN)[number];
export const istAnsicht = (v: unknown): v is ErledigenAnsicht =>
  typeof v === 'string' && (ERLEDIGEN_ANSICHTEN as readonly string[]).includes(v);

/** Längster Zeitraum einer Abfrage in Tagen: ein ganzes Jahr samt angeschnittener Wochen. */
export const ZEITRAUM_MAX_TAGE = 400;

const utc = (iso: string) => {
  const [j, m, t] = iso.split('-').map(Number);
  return Date.UTC(j, m - 1, t);
};

/** Gültiges Kalenderdatum JJJJ-MM-TT (auch 31.02. fällt durch)? */
export function istTag(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return new Date(utc(v)).toISOString().slice(0, 10) === v;
}

/** Tage von a bis b (b − a); negativ, wenn b vor a liegt. */
export const tageZwischen = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);

/** Wochentag 1 = Montag … 7 = Sonntag. */
export const wochentag = (iso: string) => ((new Date(utc(iso)).getUTCDay() + 6) % 7) + 1;

/** Montag der Woche, in der der Tag liegt. */
export const montag = (iso: string) => verschiebe(iso, 1 - wochentag(iso));

/**
 * Kalenderwoche nach ISO 8601 (#1496): Wochen beginnen am Montag, Woche 1 enthält den ersten Donnerstag des Jahres. Der
 * Donnerstag der Woche bestimmt das Jahr – der 29.12.2025 liegt in KW 1 (2026), der 01.01.2027 in KW 53 (2026).
 */
export function kalenderwoche(iso: string): number {
  const donnerstag = verschiebe(montag(iso), 3);
  return Math.floor(tageZwischen(`${donnerstag.slice(0, 4)}-01-01`, donnerstag) / 7) + 1;
}

/**
 * Tag nach einer Taste im Kalender eines Datumsfelds (#1496): Pfeile (Tag, Woche), Pos1/Ende (Anfang und Ende der
 * Woche), Bild auf/ab (Monat, mit Umschalt Jahr). Andere Tasten: null.
 */
export function tagNachTaste(taste: string, tag: string, umschalt = false): string | null {
  const schritt: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (taste in schritt) return verschiebe(tag, schritt[taste]);
  if (taste === 'Home') return montag(tag);
  if (taste === 'End') return verschiebe(montag(tag), 6);
  if (taste === 'PageUp') return verschiebe(tag, umschalt ? -12 : -1, 'monate');
  if (taste === 'PageDown') return verschiebe(tag, umschalt ? 12 : 1, 'monate');
  return null;
}

/** Monat als JJJJ-MM. */
export const monatVon = (iso: string) => iso.slice(0, 7);
/** Monat ± n. */
export const blaettere = (monat: string, n: number) => verschiebe(`${monat}-01`, n, 'monate').slice(0, 7);
/** Letzter Tag des Monats. */
export const monatsende = (monat: string) => verschiebe(verschiebe(`${monat}-01`, 1, 'monate'), -1);

/**
 * Raster eines Monats wie im Kalender: Wochen von Montag bis Sonntag, vom Montag vor dem Ersten bis zum
 * Sonntag nach dem Letzten (4–6 Wochen). Tage außerhalb des Monats gehören zum Raster, damit jede Woche voll ist.
 */
export function monatsraster(monat: string): string[][] {
  const wochen: string[][] = [];
  const ende = monatsende(monat);
  for (let tag = montag(`${monat}-01`); tag <= ende; tag = verschiebe(tag, 7)) {
    wochen.push(Array.from({ length: 7 }, (_, i) => verschiebe(tag, i)));
  }
  return wochen;
}

/** Zeitraum, den die Monatsansicht lädt: das ganze Raster. */
export function monatsZeitraum(monat: string): { von: string; bis: string } {
  const r = monatsraster(monat);
  return { von: r[0][0], bis: r[r.length - 1][6] };
}

/** Zeitraum, den die Jahresansicht lädt: 01.01. bis 31.12. */
export const jahresZeitraum = (jahr: number) => ({
  von: `${String(jahr).padStart(4, '0')}-01-01`,
  bis: `${String(jahr).padStart(4, '0')}-12-31`,
});

/**
 * Zeitraum einer Abfrage prüfen: beide Tage gültig, von ≤ bis, höchstens `ZEITRAUM_MAX_TAGE`.
 * Gibt den Grund zurück, wenn etwas nicht stimmt, sonst null.
 */
export function zeitraumProblem(von: unknown, bis: unknown): string | null {
  if (!istTag(von) || !istTag(bis)) return t('gemeinsam.kalender.der-zeitraum-braucht-von');
  if (bis < von) return t('gemeinsam.kalender.bis-liegt-vor-von');
  if (tageZwischen(von, bis) + 1 > ZEITRAUM_MAX_TAGE) return t('gemeinsam.kalender.der-zeitraum-darf-hoechstens', { ZEITRAUM_MAX_TAGE });
  return null;
}

/** Überfällig seit … Tagen (0, wenn nicht überfällig). */
export const ueberfaelligSeit = (datum: string, heute: string) => Math.max(0, tageZwischen(datum, heute));
