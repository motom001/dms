/**
 * Suche in Listen der Werkbank (#978, #994): Mappentypen, Ansichten, Nummernkreise, Auskünfte, gemeldete Fehler … – alles,
 * was die Oberfläche schon geladen hat. Gesucht wird beim Tippen, ohne Groß-/Kleinschreibung, Akzente und Umlaut-Varianten
 * („kuendigen“, „kundigen“ und „kündigen“ finden dasselbe). Jeder Treffer weiß, **wo** er gefunden wurde (Fundstellen),
 * mit einem kurzen Ausschnitt und den Stellen zum Hervorheben.
 *
 * Absichtlich ohne Oberfläche und ohne Texte: Die Liste beschreibt ihre Einträge als `Fundquelle`n (Bereich und
 * Beschriftung kommen fertig übersetzt aus der Oberfläche). Weitere Listen (Automatisierungen, Pakete, gleichbedeutende
 * Wörter #992) nutzen dieselbe Funktion; #992 kann über `varianten` je Suchwort weitere Wörter dazugeben.
 */
import { falte } from './suche';

/** Eine Stelle eines Eintrags, in der gesucht wird. */
export interface Fundquelle {
  /** Wo, fertig zum Anzeigen, z. B. „Feld „Kündigen bis“ · Hilfetext“; leer bei `titel`. */
  wo: string;
  /** Der durchsuchte Text. */
  text: string;
  /** Der Name des Eintrags selbst: Ein Treffer wird im Titel hervorgehoben, nicht als eigene Fundstelle gezeigt. */
  titel?: boolean;
}

/** Ein Stück Text, hervorgehoben oder nicht. */
export interface Textteil { text: string; treffer: boolean }

/** Eine Fundstelle: Quelle und Ausschnitt mit hervorgehobenen Treffern. */
export interface Fund { wo: string; teile: Textteil[]; titel: boolean }

export interface Suchtreffer<T> {
  eintrag: T;
  /** Fundstellen außer dem Titel, in der Reihenfolge der Quellen. */
  funde: Fund[];
  /** Der Titel mit hervorgehobenen Treffern – nur, wenn im Titel etwas gefunden wurde. */
  titel?: Textteil[];
}

export interface Suchoptionen {
  /**
   * Weitere Schreibweisen bzw. Wörter je Suchwort (#992: gleichbedeutende Wörter). Ein Suchwort gilt als gefunden,
   * wenn es selbst oder eine seiner Varianten vorkommt.
   */
  varianten?: (wort: string) => string[];
  /** Zeichen Umfeld links und rechts im Ausschnitt längerer Texte (Vorgabe 32). */
  umfeld?: number;
}

/** Ab dieser Länge zeigt eine Fundstelle nur einen Ausschnitt um den ersten Treffer. */
const AUSSCHNITT_AB = 80;

/** Suchwörter: durch Leerraum getrennt, höchstens zehn. */
export const suchwoerter = (suche: string): string[] => suche.trim().split(/\s+/).filter(Boolean).slice(0, 10);

/**
 * Text gefaltet und mit Rückweg: je gefaltetem Zeichen die Stelle im Original (von, bis). Gefaltet wie `falte`
 * (Akzente, ß, klein), dazu die Umlaut-Umschreibung ae/oe/ue → a/o/u, damit „Kuendigen“ „kündigen“ findet.
 */
export function gefaltet(text: string): { s: string; von: number[]; bis: number[] } {
  const zeichen: Array<{ c: string; von: number; bis: number }> = [];
  let i = 0;
  for (const c of text) {
    const n = c.length;
    for (const f of falte(c)) zeichen.push({ c: f, von: i, bis: i + n });
    i += n;
  }
  const aus: typeof zeichen = [];
  for (let k = 0; k < zeichen.length; k++) {
    const z = zeichen[k];
    const nach = zeichen[k + 1];
    if ((z.c === 'a' || z.c === 'o' || z.c === 'u') && nach?.c === 'e') { aus.push({ c: z.c, von: z.von, bis: nach.bis }); k++; continue; }
    aus.push(z);
  }
  return { s: aus.map((z) => z.c).join(''), von: aus.map((z) => z.von), bis: aus.map((z) => z.bis) };
}

/** Wie `gefaltet`, nur der Text – für Suchwörter. */
export const faltWort = (wort: string) => gefaltet(wort).s;

/** Alle Stellen (im Original), an denen eines der gefalteten Wörter vorkommt, sortiert und zusammengelegt. */
function stellen(text: string, woerter: string[]): Array<[number, number]> {
  const g = gefaltet(text);
  const roh: Array<[number, number]> = [];
  for (const w of woerter) {
    if (!w) continue;
    for (let p = g.s.indexOf(w); p >= 0; p = g.s.indexOf(w, p + w.length)) roh.push([g.von[p], g.bis[p + w.length - 1]]);
  }
  roh.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const aus: Array<[number, number]> = [];
  for (const s of roh) {
    const letzte = aus[aus.length - 1];
    if (letzte && s[0] <= letzte[1]) letzte[1] = Math.max(letzte[1], s[1]);
    else aus.push([s[0], s[1]]);
  }
  return aus;
}

/** Text in Teile zerlegen: hervorgehoben, was in `bereiche` liegt. */
function zerlege(text: string, bereiche: Array<[number, number]>): Textteil[] {
  const teile: Textteil[] = [];
  let p = 0;
  for (const [a, b] of bereiche) {
    if (a > p) teile.push({ text: text.slice(p, a), treffer: false });
    teile.push({ text: text.slice(a, b), treffer: true });
    p = b;
  }
  if (p < text.length) teile.push({ text: text.slice(p), treffer: false });
  return teile;
}

/**
 * Ausschnitt um den ersten Treffer: kurze Texte ganz, lange als „… bis wann du **kündigen** musst …“ – an Wortgrenzen
 * geschnitten, Zeilenumbrüche als Leerzeichen.
 */
export function ausschnitt(text: string, bereiche: Array<[number, number]>, umfeld = 32): Textteil[] {
  // Jedes Leerzeichen-Zeichen einzeln ersetzen: Die Länge bleibt, die Bereiche gelten weiter.
  const quelle = text.replace(/\s/g, ' ');
  if (quelle.length <= AUSSCHNITT_AB || !bereiche.length) return zerlege(quelle, bereiche);
  const [a, b] = bereiche[0];
  let von = Math.max(0, a - umfeld);
  let bis = Math.min(quelle.length, b + umfeld);
  // An Wortgrenzen schneiden: links nach dem nächsten Leerzeichen, rechts vor dem letzten – nie in den Treffer hinein.
  if (von > 0) { const l = quelle.indexOf(' ', von); if (l >= 0 && l < a) von = l + 1; }
  if (bis < quelle.length) { const r = quelle.lastIndexOf(' ', bis); if (r >= b) bis = r; }
  const innen = bereiche.filter(([x, y]) => x >= von && y <= bis).map(([x, y]) => [x - von, y - von] as [number, number]);
  const teile = zerlege(quelle.slice(von, bis), innen);
  if (von > 0) teile.unshift({ text: '… ', treffer: false });
  if (bis < quelle.length) teile.push({ text: ' …', treffer: false });
  return teile;
}

/**
 * Einträge durchsuchen: Jedes Suchwort (oder eine seiner Varianten) muss in mindestens einer Quelle des Eintrags
 * vorkommen. Ohne Suchwort kommen alle Einträge unverändert zurück (ohne Fundstellen). Die Reihenfolge bleibt.
 */
export function durchsuche<T>(eintraege: readonly T[], quellen: (e: T) => Fundquelle[], suche: string, o: Suchoptionen = {}): Array<Suchtreffer<T>> {
  const woerter = suchwoerter(suche);
  if (!woerter.length) return eintraege.map((eintrag) => ({ eintrag, funde: [] }));
  // Je Suchwort die gefalteten Formen (das Wort und seine Varianten).
  const formen = woerter.map((w) => [...new Set([w, ...(o.varianten?.(w) ?? [])].map(faltWort).filter(Boolean))]);
  const alle = formen.flat();
  const aus: Array<Suchtreffer<T>> = [];
  for (const eintrag of eintraege) {
    const qs = quellen(eintrag).filter((q) => q.text);
    const gefaltete = qs.map((q) => gefaltet(q.text).s);
    if (!formen.every((f) => gefaltete.some((g) => f.some((w) => g.includes(w))))) continue;
    const funde: Fund[] = [];
    let titel: Textteil[] | undefined;
    qs.forEach((q, i) => {
      if (!alle.some((w) => gefaltete[i].includes(w))) return;
      const b = stellen(q.text, alle);
      if (q.titel) { titel ??= zerlege(q.text, b); return; }
      funde.push({ wo: q.wo, teile: ausschnitt(q.text, b, o.umfeld), titel: false });
    });
    aus.push({ eintrag, funde, ...(titel ? { titel } : {}) });
  }
  return aus;
}

/* ---------- Herkunft: eigene oder aus einem Paket (#978, später #992) ---------- */

/** Wert des Filters „Paket“: alle, nur eigene (ohne Paket) oder die Id eines Pakets. */
export const ALLE_HERKUENFTE = '';
export const EIGENE = '-';

/** Passt die Herkunft eines Eintrags (Paket-Id oder null) zum Filter? */
export const herkunftPasst = (filter: string, herkunft: string | null | undefined): boolean =>
  filter === ALLE_HERKUENFTE || (filter === EIGENE ? !herkunft : herkunft === filter);
