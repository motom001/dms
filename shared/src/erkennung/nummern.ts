/**
 * Nummer direkt hinter dem Wort des Felds (#1657): „Rechnung R-2026-1120“, „Rechnung Nr. 4711“, „Invoice INV-123“.
 *
 * Die Muster in angaben.ts finden Nummern nur mit fester Beschriftung („Rechnungsnummer:“, „Rechnungs-Nr.“). Steht
 * über der Rechnung nur „Rechnung R-2026-1120“, blieb das Feld leer. Hier sucht die Erkennung die Wortformen aus
 * Bezeichnung, Kennung und Übersetzungen des Felds („Rechnungsnummer“ → „Rechnung“, „Invoice number“ → „Invoice“) und
 * aus den Gruppen gleichbedeutender Wörter, die eine dieser Formen enthalten (Werkbank und Pakete: „Rechnung, Beleg“).
 * Kein Datum, keine IBAN und kein Betrag gelten als Nummer – und eine andere Beschriftung („Kundennummer“) bleibt, was
 * sie ist, weil die Nummer in derselben Zeile direkt hinter dem Wort stehen muss.
 */
import type { Feld } from '../model';
import { ausschnitt, istIban, type Fund } from './angaben';
import { esc } from './abgleich';

/** Endungen, die zur Nummer gehören und nicht zum Wort: „Rechnungs|nummer“, „Beleg-|Nr.“, „Invoice |number“. */
const NUMMER_ENDUNG = /[\s_-]*(?:nummern?|nr\.?|number|no\.?|#)$/i;
/** Kürzeste Wortform, die zählt – kürzere träfen zu viel („Nr“, „Re“). */
const WORT_MIN = 4;

/**
 * Wortformen aus einer Bezeichnung: ohne die Endung für Nummer, dazu ohne Fugen-s, wenn eine Endung abgetrennt wurde
 * („Rechnungsnummer“ → „rechnungs“, „rechnung“; „Auszugsnummer“ → „auszugs“, „auszug“).
 */
function wortformen(roh: string): string[] {
  const klein = roh.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
  const s = klein.replace(NUMMER_ENDUNG, '').replace(/[\s_.-]+$/, '');
  return s !== klein && s.endsWith('s') ? [s, s.slice(0, -1)] : [s];
}

/** Wortformen des Felds: Bezeichnung, Kennung, Übersetzungen und gleichbedeutende Wörter aus den Gruppen. */
export function nummernWoerter(
  f: Pick<Feld, 'key' | 'label'> & { beschriftungen?: Feld['beschriftungen'] },
  gruppen: readonly (readonly string[])[] = [],
): string[] {
  const namen = [
    f.label,
    f.key.replace(/_/g, ' '),
    ...Object.values(f.beschriftungen ?? {}).map((b) => (b as { label?: string } | undefined)?.label ?? ''),
  ];
  const formen = new Set(namen.flatMap(wortformen).filter((w) => w.length >= WORT_MIN));
  for (const g of gruppen) {
    const eigene = g.flatMap(wortformen);
    if (eigene.some((w) => formen.has(w))) for (const w of eigene) if (w.length >= WORT_MIN) formen.add(w);
  }
  return [...formen].sort((a, b) => b.length - a.length);
}

/** Eine Nummer: beginnt mit Buchstabe oder Ziffer, enthält eine Ziffer, endet mit Buchstabe oder Ziffer. */
const WERT = String.raw`([A-Za-z0-9](?:[A-Za-z0-9/.\-]*[A-Za-z0-9])?)`;
const DATUM = /^\d{1,2}\.\d{1,2}\.(?:\d{2}|\d{4})$|^\d{4}-\d{2}-\d{2}$/;

/**
 * Erste Nummer direkt hinter einer der Wortformen – in derselben Zeile, getrennt durch Leerzeichen, „:“ oder „Nr.“.
 * Sicherheit hoch mit „Nr.“/„-nummer“ (eindeutig beschriftet), sonst mittel.
 */
export function nummerHinterWort(text: string, woerter: readonly string[]): Fund | null {
  if (!woerter.length) return null;
  const wort = woerter.map((w) => esc(w).replace(/ /g, '[ \\t]+')).join('|');
  const re = new RegExp(
    String.raw`(?<![\p{L}\p{N}])(?:${wort})(?:s|en|e|n)?` +
      // Mit Endung („-Nr.“, „nummer“), mit Doppelpunkt oder nur mit Leerzeichen; danach höchstens „Nr.“ und „:“.
      String.raw`(?:([ \t]*[-]?[ \t]*(?:nummer|nr\.?|number|no\.?|#))[ \t]*[:.]?|[ \t]*:|[ \t]+(?:(nr\.?|no\.?|#)[ \t]*)?:?)[ \t]*` +
      WERT +
      String.raw`(?![\p{L}\p{N}]|,\d)`,
    'giu',
  );
  for (const m of text.matchAll(re)) {
    const w = m[3].replace(/[.\-/]+$/, '');
    if (!/\d/.test(w) || w.length < 3 || w.length > 40 || DATUM.test(w) || istIban(w)) continue;
    // „Rechnung 2026“ allein ist eher eine Jahreszahl als eine Nummer.
    if (/^(19|20)\d{2}$/.test(w) && !m[1] && !m[2]) continue;
    const i = m.index! + m[0].length - m[3].length;
    // Eine IBAN mit Leerzeichen („DE89 3704 …“) beginnt wie eine Nummer – sie ist keine.
    const iban = /^[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?/.exec(text.slice(i, i + 42))?.[0];
    if (iban && istIban(iban)) continue;
    return { wert: w, sicherheit: m[1] || m[2] ? 'hoch' : 'mittel', fundstelle: ausschnitt(text, m.index!, i - m.index! + w.length) };
  }
  return null;
}
