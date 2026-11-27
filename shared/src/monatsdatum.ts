/**
 * Datumsfeld mit Genauigkeit „Monat“ (#1722): nächste HU „04/2028“, Ablauf einer Karte, Garantie „bis März 2027“.
 *
 * - **Gespeichert** wird der Monatsletzte (JJJJ-MM-TT) – so stimmen Fristen, Erinnerungen, Kalender, Filter und
 *   Sortierung ohne Sonderfall („HU fällig“ endet am Monatsende).
 * - **Angezeigt** wird nur der Monat, „MM/JJJJ“ („04/2028“) – so steht es auf Plakette, Karte und HU-Bericht, in jeder
 *   Sprache gleich.
 * - **Eingegeben** genügen Monat und Jahr: „04/2028“, „4/2028“, „04.2028“, „042028“ oder „2028-04“; ein ganzes Datum
 *   gilt für seinen Monat.
 *
 * Ohne Importe, damit Modell, Erkennung und Oberfläche die Datei nutzen können, ohne einen Kreis zu schließen.
 */

/** Genauigkeiten eines Datumsfelds; `tag` ist die Vorgabe (wie vor #1722). */
export const DATUM_GENAUIGKEITEN = ['tag', 'monat'] as const;
export type DatumGenauigkeit = (typeof DATUM_GENAUIGKEITEN)[number];

/** Ab dieser Version kennt Ablago die Genauigkeit Monat (#1722). Beim Einreihen auf die Version setzen, mit der sie erscheint. */
export const DMS_DATUM_MONAT_AB = '0.336.0';

/** Ein Datumsfeld, das nur den Monat kennt. */
export const nurMonat = (f: { typ?: string; genauigkeit?: string | null } | undefined): boolean =>
  f?.typ === 'datum' && f.genauigkeit === 'monat';

const zwei = (n: number) => String(n).padStart(2, '0');

/** Letzter Tag eines Monats als JJJJ-MM-TT; null = kein Monat (1–12) oder Jahr außerhalb 1000–9999. */
function letzter(jahr: number, monat: number): string | null {
  if (!Number.isInteger(jahr) || !Number.isInteger(monat) || monat < 1 || monat > 12 || jahr < 1000 || jahr > 9999) return null;
  return `${jahr}-${zwei(monat)}-${zwei(new Date(Date.UTC(jahr, monat, 0)).getUTCDate())}`;
}

/**
 * Gespeicherte Form (#1722): „2028-04“ oder ein Tag im April 2028 („2028-04-15“) → „2028-04-30“. null = weder Monat
 * noch gültiges Datum – die Prüfung meldet es dann.
 */
export function monatsletzter(v: string): string | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v.trim());
  if (!m) return null;
  const ende = letzter(+m[1], +m[2]);
  if (!ende || (m[3] && (+m[3] < 1 || +m[3] > +ende.slice(8)))) return null;
  return ende;
}

/** Anzeige (#1722): „2028-04-30“ → „04/2028“; was kein Datum ist, bleibt, wie es ist. */
export function monatText(iso: string): string {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(iso);
  return m ? `${m[2]}/${m[1]}` : iso;
}

/**
 * Getippter Monat (#1722): „04/2028“, „4/2028“, „04.2028“, „4 2028“, „042028“, „2028-04“ oder ein Datum
 * („15.04.2028“, „2028-04-15“) → Monatsletzter. null = nichts Lesbares.
 */
export function leseMonat(text: string): string | null {
  const s = text.trim();
  const iso = monatsletzter(s);
  if (iso) return iso;
  const m = /^(?:(\d{1,2})\.)?(\d{1,2})\s*[./\s]\s*(\d{4})$|^(\d{2})(\d{4})$/.exec(s);
  if (!m) return null;
  return m[4] ? letzter(+m[5], +m[4]) : m[1] && (+m[1] < 1 || +m[1] > 31) ? null : letzter(+m[3], +m[2]);
}
