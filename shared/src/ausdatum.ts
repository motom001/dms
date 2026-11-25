/**
 * Verweisfeld aus einem Datum ableiten (#1648): „Steuerjahr = das Steuerjahr, dessen Jahr dem Jahr von ‚Bis‘ entspricht“.
 * Einstellbar am Verweisfeld (`Feld.ausDatum`): Datumsfeld dieser Mappe und Feld des Zieltyps mit dem Jahr – Text oder
 * Zahl („2012“) oder ein Datum (dasselbe Jahr). Auch für Nebenkostenjahr, Versicherungsjahr und Ähnliches.
 *
 * Es ist nur ein **Vorschlag**: Gibt es genau eine passende Mappe, schlägt Ablago sie vor (beim Anlegen aus Post und
 * beim Ändern des Datums, solange das Verweisfeld nicht von Hand gesetzt ist); gibt es keine, bietet Ablago an, sie
 * anzulegen – nichts geschieht ohne Klick. Reine Funktionen für Server, Oberfläche und Tests; Texte über `t()`.
 */
import type { AusDatum, Feld } from './model/basis';
import { einzigesZiel } from './verweisziele';
import { t } from './texte';
import { SCHLUESSEL } from './kennungen';

/** Eingabe (Editor, Paket, Schnittstelle) bereinigen; ungültig = keine Angabe. */
export function bereinigeAusDatum(e: unknown): AusDatum | undefined {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return undefined;
  const x = e as Record<string, unknown>;
  const datumFeld = typeof x.datumFeld === 'string' ? x.datumFeld.trim() : '';
  const zielFeld = typeof x.zielFeld === 'string' ? x.zielFeld.trim() : '';
  return SCHLUESSEL.test(datumFeld) && SCHLUESSEL.test(zielFeld) ? { datumFeld, zielFeld } : undefined;
}

/** Datumsfelder dieser Mappe, aus denen ein Verweis folgen kann. */
export const moeglicheDatumsfelder = (felder: readonly Feld[]): Feld[] => felder.filter((x) => x.typ === 'datum');

/** Felder des Zieltyps, die ein Jahr tragen können: Text, Zahl oder Datum mit einem Wert. */
export const moeglicheJahresfelder = (zielFelder: readonly Feld[]): Feld[] =>
  zielFelder.filter((x) => (x.typ === 'text' || x.typ === 'zahl' || x.typ === 'datum') && !x.mehrfach);

/**
 * Prüfung im Mappentyp: nur an Verweisfeldern mit genau einem Zieltyp, das Datumsfeld gibt es hier, das Feld des
 * Zieltyps gibt es dort und es kann ein Jahr tragen. Kennt `felderVon` den Zieltyp (noch) nicht – etwa beim Einspielen
 * eines Pakets –, bleibt nur die Prüfung des Datumsfelds.
 */
export function ausDatumProbleme(felder: readonly Feld[], f: Feld, felderVon: (typId: string) => Feld[] | undefined): string[] {
  const a = f.ausDatum;
  if (!a) return [];
  if (f.typ !== 'referenz' || !einzigesZiel(f)) return [t('gemeinsam.ausdatum.nur-verweis')];
  const d = felder.find((x) => x.key === a.datumFeld);
  if (!d || d.typ !== 'datum') return [t('gemeinsam.ausdatum.kein-datum', { feld: a.datumFeld })];
  const ziel = felderVon(einzigesZiel(f)!);
  if (!ziel) return [];
  const zf = ziel.find((x) => x.key === a.zielFeld);
  if (!zf || !moeglicheJahresfelder(ziel).includes(zf)) return [t('gemeinsam.ausdatum.zielfeld', { feld: a.zielFeld })];
  return [];
}

/** Jahr eines Datums JJJJ-MM-TT; null, wenn es keins ist. */
export const jahrAus = (iso: unknown): string | null =>
  typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(0, 4) : null;

/** Passt der Wert `wert` im Feld `zf` des Zieltyps zum Jahr `jahr`? Text und Zahl: genau das Jahr; Datum: dasselbe Jahr. */
export function jahrPasst(zf: Pick<Feld, 'typ'>, wert: unknown, jahr: string): boolean {
  if (wert == null || wert === '') return false;
  if (zf.typ === 'zahl') return Number(wert) === Number(jahr);
  if (zf.typ === 'datum') return jahrAus(wert) === jahr;
  return typeof wert === 'string' && wert.trim() === jahr;
}

/** Werte einer neuen Mappe des Zieltyps für das Jahr – nur bei Text und Zahl (ein Datum wäre geraten). */
export function neueWerteFuer(zf: Pick<Feld, 'key' | 'typ'>, jahr: string): Record<string, string | number> | null {
  if (zf.typ === 'zahl') return { [zf.key]: Number(jahr) };
  if (zf.typ === 'text') return { [zf.key]: jahr };
  return null;
}
