/**
 * Dokumente in mehreren Sprachen (#579): Sprache je Seite, Hauptsprache plus „enthält auch“, Hinweis „Post teilen?“.
 *
 * Ein Dokument ist nicht immer einsprachig – etwa ein deutscher Begleitbrief und dahinter das französische Schreiben
 * einer Botschaft. Das Paket Texterkennung (bzw. der Kern bei PDFs mit Textebene) nennt deshalb für jede Seite ihre
 * Sprache, auf Mischseiten zwei. Das DMS speichert dazu, wo jede Seite im Volltext beginnt (Zeichen ab Anfang,
 * gezählt in Unicode-Codepunkten wie PostgreSQL), und baut den Suchindex je Seite mit den Wortstämmen ihrer
 * Sprache(n) (Migration 053, dms_suchindex_text).
 *
 * Gespeichert wird das nur, wenn es etwas bringt: bei mehr als einer Sprache im Dokument – oder (nur der Kern) bei
 * gemischten PDFs, deren gescannte Seiten das Paket noch erkennt; dann kann es die Seiten in der richtigen
 * Reihenfolge zusammensetzen. Einsprachige Dokumente bleiben wie bisher (eine Sprache, ein Suchindex).
 */
import { erkenneSprache, istTextsprache } from './textsprache';

/** Eine Seite im Volltext: ab welchem Zeichen sie beginnt und in welcher Sprache sie steht (leer: unbekannt). */
export interface Seitensprache {
  ab: number;
  sprachen: string[];
}

/** Höchstens so viele Sprachen je Seite (Mischseite). */
export const SPRACHEN_JE_SEITE = 2;
/** Höchstens so viele Seiten mit eigener Sprache (wie viele Seiten der Kern aus der Textebene liest). */
export const MAX_SEITENSPRACHEN = 1000;
/** Seitenvorschub: trennt im Text eines Pakets die Seiten (wie pdftotext). */
export const SEITENVORSCHUB = '\f';

/** Länge in Unicode-Codepunkten (wie length() in PostgreSQL), nicht in UTF-16-Einheiten. */
export function zeichenzahl(s: string): number {
  let n = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff && i > 0) {
      const v = s.charCodeAt(i - 1);
      if (v >= 0xd800 && v <= 0xdbff) n--;
    }
  }
  return n;
}

/**
 * Sprachen einer Seite aus ihrem Text (für PDFs mit Textebene und für Seiten, deren Sprache ein Paket offenlässt):
 * jeder Absatz für sich; eine zweite Sprache zählt, wenn sie mindestens ein Fünftel des erkannten Texts ausmacht
 * (Mischseite). Kurze Absätze (Anschrift, Beträge) zählen nicht. Ohne Ergebnis je Absatz: die Seite als Ganzes.
 */
export function sprachenEinerSeite(text: string): string[] {
  const anteile = new Map<string, number>();
  let gesamt = 0;
  for (const absatz of text.split(/\n[ \t]*\n/)) {
    const e = erkenneSprache(absatz);
    if (!e || e.konfidenz < 0.5 || !istTextsprache(e.sprache)) continue;
    const n = absatz.trim().length;
    anteile.set(e.sprache, (anteile.get(e.sprache) ?? 0) + n);
    gesamt += n;
  }
  const liste = [...anteile]
    .filter(([, n]) => n >= 150 && n / gesamt >= 0.2)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .slice(0, SPRACHEN_JE_SEITE);
  if (liste.length) return liste;
  const ganz = erkenneSprache(text);
  return ganz && istTextsprache(ganz.sprache) ? [ganz.sprache] : [];
}

/**
 * Seiten zu einem Volltext zusammensetzen: Seiten mit Text, getrennt durch eine Leerzeile (wie bisher), dazu der
 * Anfang jeder Seite. Leere Seiten beginnen dort, wo die nächste beginnen würde. Ohne `sprachen` erkennt die
 * Funktion sie aus dem Text der Seite (außer `erkennen` ist aus).
 */
export function seitenZusammensetzen(
  seiten: Array<{ text: string; sprachen?: string[] | null }>,
  erkennen = true,
): { text: string; seiten: Seitensprache[] } {
  let text = '';
  let laenge = 0;
  const out: Seitensprache[] = [];
  for (const s of seiten) {
    const t = s.text.replace(/\u0000/g, '').trim();
    if (t && text) {
      text += '\n\n';
      laenge += 2;
    }
    out.push({
      ab: laenge,
      sprachen: !t ? [] : s.sprachen?.length ? [...new Set(s.sprachen)].slice(0, SPRACHEN_JE_SEITE) : erkennen ? sprachenEinerSeite(t) : [],
    });
    text += t;
    laenge += zeichenzahl(t);
  }
  return { text, seiten: out };
}

/** Sprachen eines Dokuments aus seinen Seiten. */
export interface Dokumentsprachen {
  /** Sprache mit dem meisten Text (null: keine erkannt). */
  sprache: string | null;
  /** Weitere Sprachen („enthält auch“), nach Textmenge. */
  weitere: string[];
  /** Mehr als eine Sprache im Dokument. */
  mehrsprachig: boolean;
}

/**
 * Hauptsprache und weitere Sprachen: Jede Seite zählt mit ihrer Textmenge für ihre Sprache(n); eine Mischseite teilt
 * sich auf beide. `gesamt`: Zeichen des ganzen Volltexts (für die letzte Seite).
 */
export function dokumentsprachen(seiten: Seitensprache[], gesamt: number): Dokumentsprachen {
  const menge = new Map<string, number>();
  seiten.forEach((s, i) => {
    const n = Math.max(1, (i + 1 < seiten.length ? seiten[i + 1].ab : gesamt) - s.ab);
    for (const k of s.sprachen) menge.set(k, (menge.get(k) ?? 0) + n / s.sprachen.length);
  });
  const liste = [...menge].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  return { sprache: liste[0] ?? null, weitere: liste.slice(1), mehrsprachig: liste.length > 1 };
}

/**
 * Ab welcher Seite vermutlich ein eigenes Schreiben beginnt (#579): die erste Seite, deren Sprache(n) mit denen der
 * Seite davor (mit Text) nichts gemeinsam haben. Deutsch → Französisch ja, Deutsch → Deutsch + Französisch nein
 * (das ist eher ein Zitat oder eine zweisprachige Seite). null: kein Wechsel.
 */
export function teilenAb(seiten: Seitensprache[] | null | undefined): number | null {
  let vorher: string[] | null = null;
  for (let i = 0; i < (seiten?.length ?? 0); i++) {
    const s = seiten![i].sprachen;
    if (!s.length) continue;
    if (vorher && !s.some((k) => vorher!.includes(k))) return i + 1;
    vorher = s;
  }
  return null;
}

/** Text einer Seite aus dem Volltext (Zeichen in Codepunkten). */
export function seitentexte(text: string, seiten: Seitensprache[]): string[] {
  const zeichen = Array.from(text);
  return seiten.map((s, i) =>
    zeichen
      .slice(s.ab, i + 1 < seiten.length ? seiten[i + 1].ab : zeichen.length)
      .join('')
      .trim(),
  );
}

/** Gespeicherte Seitensprachen prüfen (aus der Datenbank oder vom Paket); null, wenn sie nicht passen. */
export function alsSeitensprachen(x: unknown): Seitensprache[] | null {
  if (!Array.isArray(x) || !x.length) return null;
  let vorher = -1;
  const out: Seitensprache[] = [];
  for (const s of x as Array<{ ab?: unknown; sprachen?: unknown }>) {
    if (!s || !Number.isInteger(s.ab) || (s.ab as number) < vorher || !Array.isArray(s.sprachen)) return null;
    vorher = s.ab as number;
    out.push({ ab: vorher, sprachen: (s.sprachen as unknown[]).filter(istTextsprache).slice(0, SPRACHEN_JE_SEITE) });
  }
  return out;
}
