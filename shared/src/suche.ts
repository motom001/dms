import { t } from './texte';
/**
 * Volltextsuche (#45, #161): Neben Wortformen („Rechnung“ → „Rechnungen“) findet die Suche einen Begriff
 * auch als Teil eines Wortes („Ofen“ → „Backofen“, „Ofenrohr“). Server (PostgreSQL und Arbeitsspeicher) teilt
 * diese Regeln.
 */

/** Ab so vielen Zeichen je Begriff wird auch in Wörtern gesucht; kürzere passen sonst fast überall. */
export const TEILWORT_MIN = 3;

/**
 * Begriffe für die Teilwortsuche, klein geschrieben – oder null, wenn nur ganze Wörter gesucht werden:
 * bei Anführungszeichen (bewusst ganze Wörter), mit Minus (Wort ausschließen) oder wenn ein Begriff kürzer als
 * TEILWORT_MIN ist.
 */
export function teilwoerter(suche: string): string[] | null {
  if (/["„“”]/.test(suche)) return null;
  const roh = suche.toLowerCase().split(/\s+/).filter(Boolean);
  // Ein Minus schließt ein Wort aus – dann bleibt es bei der Wortsuche.
  if (roh.some((x) => x.startsWith('-'))) return null;
  const w = roh.map((x) => x.replace(/^\++/, '')).filter(Boolean)
    // „or“ verknüpft in der Wortsuche zwei Begriffe; für Teilwörter zählt es nicht als Begriff.
    .filter((x) => x !== 'or');
  if (!w.length || w.some((x) => x.length < TEILWORT_MIN)) return null;
  return w;
}

/** Ganze Wörter eines Textes, klein geschrieben (für die Suche im Arbeitsspeicher). */
export const woerterIn = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));

/* ---------- Unscharfe Suche (#356) ---------- */

/**
 * Umlaute, Akzente und ß falten, klein schreiben – wie `dms_falte` in PostgreSQL (unaccent): „Müller“ → „muller“,
 * „Straße“ → „strasse“. Für den Vergleich mit Synonymen und im Arbeitsspeicher.
 */
export const falte = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[Œœ]/g, 'oe').replace(/[Łł]/g, 'l').toLowerCase();
/** Wie `falte`, dazu ohne Bindestriche: „Kfz-Versicherung“ und „Kfzversicherung“ werden gleich. */
export const normal = (s: string) => falte(s).replace(/[-‐‑­]/g, '');

/**
 * Begriffe einer einfachen Suche (ohne Anführungszeichen, Minus und „or“), so wie eingegeben – oder null.
 * Nur einfache Suchen bekommen Synonyme und Tippfehler-Varianten; wer die Suchsyntax nutzt, meint es genau.
 */
export function suchbegriffe(suche: string): string[] | null {
  if (/["„“”]/.test(suche)) return null;
  const roh = suche.trim().split(/\s+/).filter(Boolean);
  if (!roh.length || roh.length > 8 || roh.some((x) => x.startsWith('-') || x.toLowerCase() === 'or')) return null;
  return roh.map((x) => x.replace(/^\++/, '')).filter(Boolean);
}

/** Varianten je Begriff (Schlüssel: `falte(begriff)`): gleichbedeutende Wörter, Schreibweise ohne Bindestrich, Tippfehler. */
export type Varianten = Record<string, string[]>;

/** Höchstens so viele gleichbedeutende Wörter je Gruppe und so lang darf ein Wort sein. */
export const SYNONYM_MAX = 20;
export const SYNONYM_LAENGE = 60;

/**
 * Eine Gruppe gleichbedeutender Wörter aus der Werkbank („Kfz, Auto, PKW“) oder aus einer Wortliste eines Pakets:
 * Wörter getrennt durch Komma, Semikolon oder Zeilenumbruch, ohne Doppelte (gefaltet verglichen).
 */
export function liesWortgruppe(roh: unknown): { woerter: string[]; fehler: string | null } {
  const liste = Array.isArray(roh) ? roh.map((x) => (typeof x === 'string' ? x : String(x ?? ''))) : typeof roh === 'string' ? roh.split(/[,;\n]/) : [];
  const woerter: string[] = [];
  for (const w of liste.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
    if (w.length > SYNONYM_LAENGE) return { woerter: [], fehler: t('gemeinsam.suche.ist-zu-lang-hoechstens', { w: w.slice(0, 20), SYNONYM_LAENGE }) };
    if (w.length < 2) return { woerter: [], fehler: t('gemeinsam.suche.ist-zu-kurz-mindestens', { w }) };
    if (!woerter.some((x) => falte(x) === falte(w))) woerter.push(w);
  }
  if (woerter.length < 2) return { woerter: [], fehler: t('gemeinsam.suche.eine-gruppe-braucht-mindestens') };
  if (woerter.length > SYNONYM_MAX) return { woerter: [], fehler: t('gemeinsam.suche.hoechstens-woerter-je-gruppe', { SYNONYM_MAX }) };
  return { woerter, fehler: null };
}

/**
 * Gruppe gleichbedeutender Wörter, wie Werkbank und Schnittstelle sie sehen (#356, #992). Die Wörter stehen in ihrer
 * Reihenfolge: Unter dem ersten steht die Gruppe in der Liste. `quelle` ist „werkbank“ (eigene Gruppe) oder die Id des
 * Pakets, das sie mitbringt; `geaendert` der Stand für den Konfliktschutz (#917).
 *
 * Später je Wort eine Sprache (#992, „Andere Sprachen“): kommt als eigene, freiwillige Angabe dazu (z. B.
 * `sprachen: { [wort]: 'en' }`), `woerter` bleibt eine Liste von Texten. So bleiben Schnittstelle, Vollexport
 * (`struktur/synonyme.json`), Wortlisten der Pakete und bestehende Gruppen unverändert gültig.
 */
export interface Wortgruppe { id: string; woerter: string[]; quelle: string; geaendert: string; paketName?: string }
/** Quelle eigener Gruppen (Werkbank → Gleichbedeutende Wörter). */
export const EIGENE_WOERTER = 'werkbank';

/**
 * Prüfung einer Gruppe beim Bearbeiten (#992): leere Zeilen zählen nicht; doppelte Wörter (gefaltet verglichen,
 * „Kfz“ = „KFZ“) sind ein Fehler statt still zusammengelegt zu werden – `doppelt` nennt die Stellen der Wiederholungen.
 * Sonst gelten die Regeln von `liesWortgruppe` (2 bis 20 Wörter, je 2 bis 60 Zeichen).
 */
export function pruefeWortgruppe(woerter: readonly string[]): { fehler: string | null; doppelt: number[] } {
  const doppelt: number[] = [];
  const gesehen = new Set<string>();
  woerter.forEach((w, i) => {
    const k = falte(w.replace(/\s+/g, ' ').trim());
    if (!k) return;
    if (gesehen.has(k)) doppelt.push(i); else gesehen.add(k);
  });
  if (doppelt.length) return { fehler: t('gemeinsam.suche.doppelt', { w: woerter[doppelt[0]].trim() }), doppelt };
  return { fehler: liesWortgruppe([...woerter]).fehler, doppelt };
}

/** Andere Gruppen, in denen dieses Wort (gefaltet verglichen) schon steht – für den Hinweis beim Bearbeiten (#992). */
export function gruppenMitWort<G extends { id: string; woerter: readonly string[] }>(gruppen: readonly G[], wort: string, ausser?: string): G[] {
  const k = falte(wort.replace(/\s+/g, ' ').trim());
  return k ? gruppen.filter((g) => g.id !== ausser && g.woerter.some((w) => falte(w) === k)) : [];
}

/**
 * Varianten der Begriffe: gleichbedeutende Wörter (ganze Begriffe, gefaltet verglichen) und die Schreibweise ohne
 * Bindestrich („Kfz-Versicherung“ → „Kfzversicherung“).
 */
export function variantenVon(begriffe: string[], gruppen: string[][]): Varianten {
  const v: Varianten = {};
  for (const b of begriffe) {
    const k = falte(b);
    const dazu = new Set<string>();
    if (/[-‐‑]/.test(b)) dazu.add(b.replace(/[-‐‑­]/g, ''));
    for (const g of gruppen) if (g.some((w) => falte(w) === k)) for (const w of g) if (falte(w) !== k) dazu.add(w);
    if (dazu.size) v[k] = [...dazu];
  }
  return v;
}

/** Trigramme wie pg_trgm: Wörter mit zwei Leerzeichen davor und einem dahinter. */
function trigramme(s: string): Set<string> {
  const t = new Set<string>();
  for (const w of falte(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const x = `  ${w} `;
    for (let i = 0; i + 3 <= x.length; i++) t.add(x.slice(i, i + 3));
  }
  return t;
}
/** Ähnlichkeit zweier Wörter wie `similarity()` in pg_trgm (0 bis 1). */
export function aehnlichkeit(a: string, b: string): number {
  const x = trigramme(a), y = trigramme(b);
  if (!x.size || !y.size) return 0;
  let gemeinsam = 0;
  for (const t of x) if (y.has(t)) gemeinsam++;
  return gemeinsam / (x.size + y.size - gemeinsam);
}
/** Ab dieser Ähnlichkeit gilt ein Wort als mögliche andere Schreibweise („Waschmaschiene“ → „Waschmaschine“). */
export const AEHNLICH_AB = 0.45;
/** Tippfehler erst ab so vielen Zeichen – kürzere Wörter haben zu viele Nachbarn. */
export const TIPPFEHLER_MIN = 4;

/** „Meintest du …?“: die Suche mit dem jeweils besten ähnlichen Wort statt des Begriffs. */
export function vorschlagAus(begriffe: string[], aehnlich: Record<string, string[]>): string | null {
  let geaendert = false;
  const neu = begriffe.map((b) => { const a = aehnlich[falte(b)]?.[0]; if (a) { geaendert = true; return a; } return b; });
  return geaendert ? neu.join(' ') : null;
}
