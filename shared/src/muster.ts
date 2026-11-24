/**
 * Prüfmuster von Textfeldern (`muster`, #1315, Ergänzung Sicherheit): Ein Muster ist ein regulärer Ausdruck, den Ablago
 * bei jedem Speichern einer Mappe gegen die Eingabe prüft. Aus einer fremden Datei (Mappentypen-Datei, Paket) kann ein
 * Muster kommen, das sehr lange rechnet (ReDoS). Deshalb:
 *
 * - höchstens {@link FELD_MUSTER_MAX} Zeichen;
 * - keine verschachtelten Wiederholungen: Eine Gruppe, die selbst wiederholt wird (`*`, `+`, `{n,}`, `{n,m}` mit m > 1),
 *   darf keine unbegrenzte Wiederholung und keine Alternative enthalten – `(a+)+`, `(a*)*`, `(a|aa)+` gehen nicht,
 *   `(\d{3}-)+` und `(DE|AT)?` gehen;
 * - statt einer Zeitgrenze (ein regulärer Ausdruck lässt sich in JavaScript nicht abbrechen) prüft Ablago nur Eingaben
 *   bis {@link MUSTER_EINGABE_MAX} Zeichen gegen das Muster; längere sind ungültig.
 */
import { t } from './texte';

const FELD_MUSTER_MAX = 200;
export const MUSTER_EINGABE_MAX = 1000;

export type MusterProblem = 'ungueltig' | 'lang' | 'verschachtelt';

/** Steht an Stelle `i` ein Quantor? Liefert seine Länge und ob er wiederholt (Obergrenze > 1) bzw. unbegrenzt ist. */
function quantor(s: string, i: number): { laenge: number; wiederholt: boolean; unbegrenzt: boolean } | null {
  const z = s[i];
  const faul = (n: number) => (s[i + n] === '?' || s[i + n] === '+' ? n + 1 : n);
  if (z === '*' || z === '+') return { laenge: faul(1), wiederholt: true, unbegrenzt: true };
  if (z === '?') return { laenge: faul(1), wiederholt: false, unbegrenzt: false };
  if (z !== '{') return null;
  const m = /^\{(\d+)(,(\d*))?\}/.exec(s.slice(i));
  if (!m) return null;
  const bis = m[2] === undefined ? Number(m[1]) : m[3] === '' ? Infinity : Number(m[3]);
  return { laenge: faul(m[0].length), wiederholt: bis > 1, unbegrenzt: bis === Infinity };
}

/** Ende eines einzelnen Zeichens ab `i`: Escape, Zeichenklasse (bis zur schließenden Klammer) oder ein Zeichen. */
function atomEnde(s: string, i: number): number {
  if (s[i] === '\\') return i + 2;
  if (s[i] !== '[') return i + 1;
  let j = i + 1;
  if (s[j] === ']') j++;
  while (j < s.length && s[j] !== ']') j += s[j] === '\\' ? 2 : 1;
  return j + 1;
}

/** Je offene Gruppe: enthält sie eine unbegrenzte Wiederholung bzw. eine Alternative? */
interface Gruppe {
  unbegrenzt: boolean;
  alternative: boolean;
}
const neueGruppe = (): Gruppe => ({ unbegrenzt: false, alternative: false });

/** Ein Schritt durch das Muster ab `i`: die nächste Stelle – oder -1, wenn eine wiederholte Gruppe verschachtelt ist. */
function schritt(s: string, i: number, stapel: Gruppe[]): number {
  const oben = () => stapel[stapel.length - 1];
  if (s[i] === '(') {
    stapel.push(neueGruppe());
    return i + 1;
  }
  if (s[i] === '|') {
    oben().alternative = true;
    return i + 1;
  }
  const gruppe = s[i] === ')' ? (stapel.length > 1 ? stapel.pop()! : neueGruppe()) : null;
  const j = gruppe ? i + 1 : atomEnde(s, i);
  const q = quantor(s, j);
  if (q?.wiederholt && (gruppe?.unbegrenzt || gruppe?.alternative)) return -1;
  // Was in der Gruppe steckt (und eine unbegrenzte Wiederholung dahinter), gilt auch für die umgebende.
  oben().unbegrenzt ||= !!gruppe?.unbegrenzt || !!q?.unbegrenzt;
  oben().alternative ||= !!gruppe?.alternative;
  return j + (q?.laenge ?? 0);
}

/** Enthält das Muster eine wiederholte Gruppe mit unbegrenzter Wiederholung oder Alternative darin? */
function verschachtelt(s: string): boolean {
  const stapel: Gruppe[] = [neueGruppe()];
  for (let i = 0; i < s.length;) {
    i = schritt(s, i, stapel);
    if (i < 0) return true;
  }
  return false;
}

/** Was an einem Prüfmuster nicht passt – oder null. */
export function musterProblem(muster: string): MusterProblem | null {
  if ([...muster].length > FELD_MUSTER_MAX) return 'lang';
  try {
    new RegExp(muster);
  } catch {
    return 'ungueltig';
  }
  return verschachtelt(muster) ? 'verschachtelt' : null;
}

/** Meldung zu einem Problem mit einem Prüfmuster – im Editor der Mappentypen und beim Lesen eines Pakets gleich. */
export const musterText = (p: MusterProblem): string =>
  p === 'lang'
    ? t('gemeinsam.model.muster-zu-lang', { max: FELD_MUSTER_MAX })
    : p === 'verschachtelt'
      ? t('gemeinsam.model.muster-verschachtelt')
      : t('gemeinsam.model.das-muster-ist-kein');
