/**
 * Wert neben der Bezeichnung eines Felds (#1693): „Fällig am: 15.12.2026“, „zahlbar bis 15.12.2026“, „Netto 100,00 €“.
 *
 * Bisher bekam jedes Datumsfeld eines Typs das Briefdatum und jedes Betragsfeld den Gesamtbetrag. Für „Fällig am“,
 * „Netto gesamt“ oder „Zahlungseingang am“ war das falsch – deshalb hatten die Pakete diese Felder gar nicht zum
 * Ausfüllen markiert. Jetzt sucht die Erkennung zuerst den Wert in der Zeile, in der ein Wort des Felds steht (oder in
 * der Zeile darunter). Das Briefdatum bzw. den Gesamtbetrag bekommt nur noch das erste Feld dieser Art.
 *
 * Wörter des Felds: Bezeichnung und Kennung ohne Füllwörter („am“, „bis“, „gesamt“), dazu eingebaute gleichbedeutende
 * Wörter und die Gruppen aus Werkbank und Paketen. Ein Wort zählt auch als Teil eines längeren („Netto“ in
 * „Nettobetrag“).
 */
import type { Betrag, Feld } from '../model';
import { alleBetraege, alleDaten, ausschnitt, type Fund } from './angaben';

/** Klein und ohne Umlaute – Zeichen für Zeichen, damit die Stellen im Text gleich bleiben. */
const klein = (s: string) => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 's');

/** Wörter, die nichts über das Feld sagen. */
const FUELLWOERTER = new Set(
  [
    'am',
    'bis',
    'zum',
    'vom',
    'per',
    'der',
    'die',
    'das',
    'und',
    'von',
    'gesamt',
    'betrag',
    'datum',
    'summe',
    'nummer',
    'neue',
    'neuer',
  ].map(klein),
);
/** Kürzere Wörter zählen nicht. */
const WORT_MIN = 4;

/** Eingebaute gleichbedeutende Wörter für häufige Felder auf Rechnungen und Verträgen. */
const GLEICH: readonly (readonly string[])[] = [
  ['fällig', 'zahlbar', 'zahlungsziel', 'spätestens'],
  ['netto', 'nettobetrag', 'zwischensumme'],
  ['umsatzsteuer', 'mehrwertsteuer', 'mwst', 'ust'],
  ['zahlungseingang', 'eingegangen', 'gutgeschrieben'],
  ['bezahlt', 'beglichen'],
  ['hauptfälligkeit', 'fälligkeit'],
  ['kündigung', 'gekündigt', 'kündigen'],
].map((g) => g.map(klein));

/** Wörter eines Felds (klein, ohne Umlaute), längere zuerst. */
export function feldWoerter(f: Pick<Feld, 'key' | 'label'>, gruppen: readonly (readonly string[])[] = []): string[] {
  const roh = klein(`${f.label} ${f.key.replace(/_/g, ' ')}`)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= WORT_MIN || w === 'ust')
    .filter((w) => !FUELLWOERTER.has(w));
  const w = new Set(roh);
  for (const g of [...GLEICH, ...gruppen.map((x) => x.map(klein))]) if (g.some((x) => w.has(x))) for (const x of g) w.add(x);
  return [...w].filter((x) => x.length >= 3).sort((a, b) => b.length - a.length);
}

/**
 * Erster Wert in der Zeile hinter einem der Wörter, sonst in der Zeile darunter; null = keins. Sicherheit mittel – die
 * Bezeichnung steht da, aber die Erkennung weiß nicht sicher, dass sie zum Feld gehört.
 */
function neben<T>(text: string, woerter: readonly string[], werte: Array<{ wert: T; i: number; laenge: number }>): Fund<T> | null {
  if (!woerter.length || !werte.length) return null;
  const k = klein(text);
  let anfang = 0;
  const zeilen = text.split('\n').map((z) => {
    const a = anfang;
    anfang += z.length + 1;
    return { a, e: anfang };
  });
  for (let n = 0; n < zeilen.length; n++) {
    const z = k.slice(zeilen[n].a, zeilen[n].e);
    let ab = -1;
    for (const w of woerter) {
      const i = z.indexOf(w);
      if (i >= 0 && (ab < 0 || i < ab)) ab = i;
    }
    if (ab < 0) continue;
    const start = zeilen[n].a + ab;
    const x =
      werte.find((y) => y.i >= start && y.i < zeilen[n].e) ??
      (zeilen[n + 1] ? werte.find((y) => y.i >= zeilen[n + 1].a && y.i < zeilen[n + 1].e) : undefined);
    if (x) return { wert: x.wert, sicherheit: 'mittel', fundstelle: ausschnitt(text, start, x.i + x.laenge - start) };
  }
  return null;
}

/** Datum neben der Bezeichnung des Felds (ISO). */
export const datumNeben = (text: string, woerter: readonly string[]): Fund | null => neben(text, woerter, alleDaten(text));

/** Betrag neben der Bezeichnung des Felds. */
export const betragNeben = (text: string, woerter: readonly string[]): Fund<Betrag> | null => neben(text, woerter, alleBetraege(text));
