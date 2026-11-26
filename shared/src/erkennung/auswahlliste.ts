/**
 * Auswahllisten in der Erkennung (#1689): Einträge einer Liste wie „Vertragsart“ (Strom, Gas, Versicherung …) erkennt
 * Ablago im Text an ihrem Namen und an ihren Erkennungswörtern. Ein Treffer zählt für den Typ, der auf die Liste verweist
 * („Versicherungsschein“ → Vertrag, Vertragsart Versicherung) – die Liste selbst wird nie vorgeschlagen.
 *
 * Erkennungswörter stehen in einem Textfeld mit der Art `woerter` (eingestellt, oder Kennung bzw. Bezeichnung
 * „Erkennungswörter“): mit Komma getrennt, jedes Wort zählt einzeln, nur als ganzes Wort, Groß- und Kleinschreibung egal.
 * Es ist ein schwaches Merkmal: Es macht einen Typ weder zum Absender noch füllt „Aus Dokument ausfüllen“ das Feld.
 */
import type { Feld, Mappentyp } from '../model';
import { artVon, merkmalsfelder } from './arten';
import { esc } from './abgleich';

/** Höchstens so viele Einträge einer Auswahlliste werden im Text gesucht. */
export const AUSWAHL_EINTRAEGE_MAX = 500;
/** Höchstens so viele Wörter je Eintrag (Name und Erkennungswörter zusammen). */
const AUSWAHL_WOERTER_MAX = 50;
/** Kürzere Wörter zählen nicht – „KV“ oder „Gas“ ja, „ab“ nicht. */
const AUSWAHL_WORT_MIN = 3;

/**
 * Ist der Typ eine Auswahlliste? Nie aus Post angelegt (`ausPost: false`), kein Systemtyp, kein Teil und ohne Felder zum
 * Wiederfinden – so zählen Organisation und Person nicht dazu, die über den Abgleich gefunden werden.
 */
export const istAuswahlliste = (t: Pick<Mappentyp, 'ausPost' | 'felder' | 'system'> & { teilVon?: string | null }): boolean =>
  t.ausPost === false && !t.system && !t.teilVon && !merkmalsfelder(t).length;

/** Felder mit Erkennungswörtern (Text, Art `woerter`). */
const woerterFelder = (t: Pick<Mappentyp, 'felder'>): Feld[] =>
  t.felder.filter((f) => (f.typ === 'text' || f.typ === 'langtext') && artVon(f) === 'woerter');

/** Wörter eines Eintrags: sein Titel und seine Erkennungswörter, ohne Doppelte, begrenzt. */
export function woerterVon(t: Pick<Mappentyp, 'felder'>, m: { titel?: string | null; werte: Record<string, unknown> }): string[] {
  const roh = [m.titel ?? '', ...woerterFelder(t).flatMap((f) => String(m.werte[f.key] ?? '').split(/[,;\n]/))];
  const gesehen = new Set<string>();
  const erg: string[] = [];
  for (const w of roh.map((x) => x.trim().replace(/\s+/g, ' '))) {
    const k = w.toLocaleLowerCase('de-DE');
    if (w.length < AUSWAHL_WORT_MIN || gesehen.has(k)) continue;
    gesehen.add(k);
    erg.push(w);
    if (erg.length >= AUSWAHL_WOERTER_MAX) break;
  }
  return erg;
}

/**
 * Das längste der Wörter, das als ganzes Wort im Text steht (Groß- und Kleinschreibung egal); null = keins. Längere zuerst:
 * „Versicherungsschein“ sagt mehr als „Versicherung“, das auch im Namen des Absenders stehen kann.
 */
export function findeWort(text: string, woerter: readonly string[]): string | null {
  for (const w of [...woerter].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(w).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(text)) return w;
  }
  return null;
}
