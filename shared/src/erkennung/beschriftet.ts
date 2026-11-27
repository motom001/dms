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
import { esc } from './abgleich';

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

/* ---------- Erkennungswörter vor dem Wert (#1714) ---------- */

/**
 * Was hinter einem Erkennungswort steht: ein Wert mit seiner Länge, `'passtNicht'` (dort steht etwas, aber kein Wert
 * dieser Feldart – „8867 Betriebsstunden“ im Feld Kilometerstand, „April 2028“ im Datumsfeld) oder null (nichts
 * Erkennbares, z. B. weiterer Text).
 */
export type Gelesen<T> = { wert: T; laenge: number } | 'passtNicht' | null;

/** Platzhalter statt eines Werts: „–“, „-“, „—“ allein (nicht „-5“, nicht „-Erinnerung“). */
const PLATZHALTER = /^[-–—]+(?=\s|$)/;
/** Kurzer Vorspann bis zum Doppelpunkt, der kein Wert ist: „(8) Nächste HU / Plakette: Oktober 2028“. */
const VORSPANN = /^[^:\n]{1,25}:[ \t]*/;

/** Regulärer Ausdruck für die Wörter: ganze Wörter, Groß- und Kleinschreibung egal, Leerraum beliebig. */
function woerterMuster(woerter: readonly string[]): string {
  return [...woerter]
    .sort((a, b) => b.length - a.length)
    .map((w) => esc(w).replace(/ /g, '[ \\t]+') + (/[\p{L}\p{N}]$/u.test(w) ? '(?![\\p{L}\\p{N}])' : ''))
    .join('|');
}

/**
 * Wert direkt hinter einem der Erkennungswörter eines Pakets (#1714), in derselben Zeile: „(4) km-St. 9363“, „Kd.-Nr.:
 * 4711“. Mehrere Wörter hintereinander zählen wie eines („(4) km-Stand:“). Die erste Stelle mit passendem Wert gewinnt
 * (Sicherheit hoch – das Paket sagt, dass der Wert dort steht). Stehen die Wörter nur vor Platzhaltern („–“) oder vor
 * Werten, die nicht passen, heißt das `'leer'`: Das Feld bleibt leer, statt einen gleichartigen Wert von anderswo zu
 * nehmen. null = die Wörter stehen nicht im Text (oder nur vor Text ohne Wert) – dann sucht die Erkennung wie bisher.
 */
export function wertHinter<T>(text: string, woerter: readonly string[], lies: (rest: string) => Gelesen<T>): Fund<T> | 'leer' | null {
  if (!woerter.length) return null;
  const w = woerterMuster(woerter);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${w})(?:[ \\t]*[:.]?[ \\t]*(?:${w}))*[ \\t]*[:=]?[ \\t]*`, 'giu');
  let abgelehnt = false;
  for (const m of text.matchAll(re)) {
    const ab = m.index! + m[0].length;
    const ende = text.indexOf('\n', ab);
    const rest = text.slice(ab, ende < 0 ? text.length : ende);
    if (PLATZHALTER.test(rest)) {
      abgelehnt = true;
      continue;
    }
    const vorspann = VORSPANN.exec(rest)?.[0] ?? '';
    let g = lies(rest);
    let versatz = 0;
    if (g === null && vorspann) {
      g = lies(rest.slice(vorspann.length));
      versatz = vorspann.length;
    }
    if (g === 'passtNicht') abgelehnt = true;
    if (!g || g === 'passtNicht') continue;
    const bis = ab + versatz + g.laenge;
    return { wert: g.wert, sicherheit: 'hoch', fundstelle: ausschnitt(text, m.index!, bis - m.index!) };
  }
  return abgelehnt ? 'leer' : null;
}

/** Monat ohne Tag („April 2028“, „OKT. 2028“, „04/2028“): Das Datumsfeld kennt keinen Monat allein (#1714). */
const NUR_MONAT =
  /^(?:(?:Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan|Feb|Mär|Mrz|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Nov|Dez)\.?|\d{1,2}[./])[ \t]?\d{4}(?!\d)/i;

/** Datum direkt am Anfang (ISO); ein Monat ohne Tag passt nicht – lieber leer als ein erfundener Tag. */
export function liesDatumAmAnfang(rest: string): Gelesen<string> {
  const d = alleDaten(rest)[0];
  if (d && d.i === 0) return { wert: d.wert, laenge: d.laenge };
  return NUR_MONAT.test(rest) ? 'passtNicht' : null;
}

/** Betrag direkt am Anfang. */
export function liesBetragAmAnfang(rest: string): Gelesen<Betrag> {
  const b = alleBetraege(rest)[0];
  return b && b.i === 0 ? { wert: b.wert, laenge: b.laenge } : null;
}

/** Abkürzungen von Einheiten und das Wort, das im Feld stehen muss („km“ passt zu „Kilometerstand“). */
const EINHEITEN: Readonly<Record<string, string>> = {
  km: 'kilometer',
  kg: 'kilogramm',
  t: 'tonne',
  kwh: 'kilowattstunde',
  h: 'stunde',
  std: 'stunde',
  l: 'liter',
  m3: 'kubikmeter',
  'm³': 'kubikmeter',
};

/**
 * Zahl direkt am Anfang („9363“, „65.884“, „1.234,5“). Steht direkt dahinter ein Wort, muss es die Einheit des Felds
 * sein: Es kommt in den Wörtern des Felds vor (Bezeichnung, Kennung, Erkennungswörter – „km“ in „km-Stand“) oder ist die
 * Abkürzung eines dieser Wörter („km“ – „Kilometerstand“). „8867 Betriebsstunden“ ist darum kein Kilometerstand.
 */
export function liesZahlAmAnfang(rest: string, feldWorte: string): Gelesen<number> {
  const m = /^(\d{1,3}(?:[.\u202f ]\d{3})+|\d+)(?:,(\d+))?(?!\d|[.,]\d)/.exec(rest);
  if (!m) return null;
  const zahl = Number(`${m[1].replace(/[.\u202f ]/g, '')}${m[2] ? `.${m[2]}` : ''}`);
  if (!Number.isFinite(zahl)) return null;
  // Einheit nur, wenn sie direkt folgt (ein Leerzeichen) – zwei und mehr trennen in Tabellen die Spalten.
  const einheit = /^[ \t]?([\p{L}][\p{L}\p{N}³²/-]*)/u.exec(rest.slice(m[0].length))?.[1];
  if (einheit) {
    const e = klein(einheit);
    // Kurze Einheiten nur als eigenes Wort („km“ in „km-stand“), sonst passte „t“ zu fast allem.
    const worte = feldWorte.split(/[^\p{L}\p{N}]+/u);
    const lang = EINHEITEN[e];
    const passt = worte.includes(e) || (e.length >= 4 && feldWorte.includes(e)) || (lang !== undefined && feldWorte.includes(lang));
    if (!passt) return 'passtNicht';
  }
  return { wert: zahl, laenge: m[0].length };
}

/** Nummer direkt am Anfang („R-2026-1120“, „4711“): mit mindestens einer Ziffer, 3 bis 40 Zeichen, kein Datum. */
export function liesNummerAmAnfang(rest: string): Gelesen<string> {
  const m = /^[A-Za-z0-9](?:[A-Za-z0-9/.-]*[A-Za-z0-9])?(?![\p{L}\p{N}])/u.exec(rest);
  if (!m || !/\d/.test(m[0]) || m[0].length < 3 || m[0].length > 40) return null;
  if (alleDaten(m[0])[0]?.i === 0) return null;
  return { wert: m[0], laenge: m[0].length };
}

/** Wörter eines Felds für den Vergleich mit einer Einheit: Bezeichnungen, Kennung und Erkennungswörter, klein. */
export function feldWorteFuerEinheit(f: Pick<Feld, 'key' | 'label' | 'beschriftungen'> & { erkennung?: Feld['erkennung'] }): string {
  const labels = Object.values(f.beschriftungen ?? {}).map((b) => (b as { label?: string } | undefined)?.label ?? '');
  return klein([f.label, f.key, ...labels, ...(f.erkennung?.woerter?.vor ?? [])].join(' '));
}
