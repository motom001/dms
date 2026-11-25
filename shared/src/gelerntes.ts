/**
 * Erkennung lernt aus Korrekturen (#1681) – sichtbar, löschbar, verlernt von selbst. Reine Teile für Server, Oberfläche
 * und Tests.
 *
 * - **Mappentyp:** Wählt jemand bei „Wohin gehört das?“ einen anderen Typ als vorgeschlagen (oder bestätigt einen, bei
 *   dem Ablago nicht sicher war), merkt sich Ablago den Typ je Absender. Beim nächsten Dokument dieses Absenders ist das
 *   ein starker Beleg.
 * - **Feld:** Korrigiert jemand einen Wert aus „Aus Dokument ausfüllen“ oder holt ihn vom Dokument (Ziehen, Klicken,
 *   Markieren), merkt sich Ablago je Absender und Feld das Kennwort davor (z. B. „Vertragskonto:“). Beim nächsten Brief
 *   dieses Absenders sucht Ablago zuerst dahinter.
 * - **Verlernt von selbst:** Wird ein gelernter Vorschlag `VERLERNEN_NACH`-mal in Folge abgelehnt bzw. anders
 *   korrigiert, nimmt Ablago ihn zurück (bleibt in der Übersicht mit „zurückgenommen am …“).
 *
 * Gelerntes enthält keine Inhalte aus Dokumenten außer dem Kennwort. Es liegt in der Einstellung `gelerntes` (Sicherung
 * und Vollexport); Rechte wie bei der Post.
 */
import { textformen, wertAusText } from './uebernehmen';
import type { Feld, Wert } from './model';

/** Schlüssel der Einstellung. */
export const GELERNTES_EINSTELLUNG = 'gelerntes';
/** Höchstens so viele Einträge; die ältesten zurückgenommenen fallen zuerst weg. */
const GELERNTES_MAX = 2000;
/** So oft in Folge abgelehnt, dann nimmt Ablago das Gelernte zurück. */
export const VERLERNEN_NACH = 2;
/** So viel zählt ein gelernter Typ bei „Wohin gehört das?“ (ein starker Beleg); jede Ablehnung halbiert ihn. */
export const GELERNT_SICHERHEIT = 0.8;
/** Kennwort: höchstens so lang (Zeichen). */
const KENNWORT_MAX = 40;

/** Ein gelernter Eintrag. */
export interface Gelernt {
  id: string;
  art: 'typ' | 'feld';
  /** Mappe des Absenders. */
  absender: string;
  /** Typ: der gelernte Mappentyp; Feld: der Mappentyp des Felds. */
  typId: string;
  /** Feld: Schlüssel und Kennwort davor. */
  feld?: string;
  kennwort?: string;
  /** Aus welcher Post (kann inzwischen aufgelöst sein). */
  post?: string;
  /** Wer korrigiert hat (Benutzer-Id). */
  von: string | null;
  /** Wann gelernt (ISO). */
  am: string;
  /** So oft in Folge abgelehnt bzw. anders korrigiert. */
  abgelehnt: number;
  /** Zurückgenommen am (ISO) – verlernt. */
  zurueck?: string;
}

/** Ein Eintrag für die Werkbank (#1681): dazu die Titel von Absender und Mappe, wenn die Person sie lesen darf. */
export type GelerntFuerWerkbank = Gelernt & { absenderTitel?: string; mappeTitel?: string };

/** Gelerntes aus der Einstellung lesen; Ungültiges fällt weg. */
export function liesGelerntes(v: unknown): Gelernt[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is Gelernt =>
      !!x &&
      typeof x === 'object' &&
      typeof (x as Gelernt).id === 'string' &&
      ((x as Gelernt).art === 'typ' || (x as Gelernt).art === 'feld') &&
      typeof (x as Gelernt).absender === 'string' &&
      typeof (x as Gelernt).typId === 'string' &&
      typeof (x as Gelernt).am === 'string',
  );
}

/** Aktiv (nicht zurückgenommen). */
export const aktiv = (g: Gelernt) => !g.zurueck;

/** Abgelehnt: zählt hoch; nach `VERLERNEN_NACH` in Folge zurückgenommen. */
function ablehnen(g: Gelernt, am: string): Gelernt {
  const abgelehnt = g.abgelehnt + 1;
  return { ...g, abgelehnt, ...(abgelehnt >= VERLERNEN_NACH ? { zurueck: am } : {}) };
}

/** Auf höchstens `GELERNTES_MAX` Einträge kürzen – zuerst die ältesten zurückgenommenen, dann die ältesten. */
function gekuerzt(liste: Gelernt[]): Gelernt[] {
  if (liste.length <= GELERNTES_MAX) return liste;
  const raus = [...liste]
    .sort((a, b) => Number(aktiv(a)) - Number(aktiv(b)) || a.am.localeCompare(b.am))
    .slice(0, liste.length - GELERNTES_MAX);
  const weg = new Set(raus.map((x) => x.id));
  return liste.filter((x) => !weg.has(x.id));
}

/** Was beim Zuordnen einer Post in eine neue Mappe gelernt wird. */
export interface Lernanlass {
  absender: string;
  typId: string;
  post: string;
  von: string | null;
  am: string;
  /** Hat Ablago einen anderen Typ vorgeschlagen bzw. war es nicht sicher? Dann lernt es den Typ. */
  korrektur: boolean;
  /** Korrigierte bzw. vom Dokument geholte Felder mit Kennwort; übernommene Vorschläge (bestätigt). */
  felder?: Array<{ feld: string; kennwort: string }>;
  bestaetigt?: string[];
  neueId: () => string;
}

/**
 * Lernen (#1681): Gelernte Typen dieses Absenders zählen als bestätigt (gewählter Typ) bzw. abgelehnt (anderer Typ). Ist
 * die Wahl eine Korrektur und der Typ noch nicht aktiv gelernt, kommt er dazu. Je korrigiertem Feld: ein anderes
 * Kennwort lehnt das bisherige ab und wird gelernt; dasselbe bestätigt. Übernommene Vorschläge bestätigen.
 */
export function lerne(liste: Gelernt[], l: Lernanlass): Gelernt[] {
  let neu = liste.map((g) => {
    if (!aktiv(g) || g.absender !== l.absender) return g;
    if (g.art === 'typ') return g.typId === l.typId ? { ...g, abgelehnt: 0 } : ablehnen(g, l.am);
    if (g.typId !== l.typId) return g;
    if (l.bestaetigt?.includes(g.feld!)) return { ...g, abgelehnt: 0 };
    const k = l.felder?.find((f) => f.feld === g.feld);
    if (!k) return g;
    return gleichesKennwort(k.kennwort, g.kennwort) ? { ...g, abgelehnt: 0 } : ablehnen(g, l.am);
  });
  const basis = { absender: l.absender, typId: l.typId, post: l.post, von: l.von, am: l.am, abgelehnt: 0 };
  if (l.korrektur && !neu.some((g) => aktiv(g) && g.art === 'typ' && g.absender === l.absender && g.typId === l.typId))
    neu.push({ id: l.neueId(), art: 'typ', ...basis });
  for (const f of l.felder ?? []) {
    const da = neu.some(
      (g) =>
        aktiv(g) &&
        g.art === 'feld' &&
        g.absender === l.absender &&
        g.typId === l.typId &&
        g.feld === f.feld &&
        gleichesKennwort(g.kennwort, f.kennwort),
    );
    if (!da) neu.push({ id: l.neueId(), art: 'feld', ...basis, feld: f.feld, kennwort: f.kennwort.slice(0, KENNWORT_MAX) });
  }
  neu = gekuerzt(neu);
  return neu;
}

const norm = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE');
const gleichesKennwort = (a: string | undefined, b: string | undefined) => norm(a) === norm(b);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Kennwort vor einem Wert (#1681): Wo der Wert im Text steht (in einer seiner Schreibweisen), die Wörter davor in
 * derselben Zeile – höchstens `KENNWORT_MAX` Zeichen, ab dem letzten Doppelpunkt oder großen Abstand. null, wenn der
 * Wert nicht im Text steht oder nichts davor.
 */
export function kennwortVor(text: string, f: Pick<Feld, 'typ' | 'beschriftungen'>, wert: Wert): string | null {
  const t = text.replace(/\u00a0/g, ' ');
  for (const form of textformen(f, wert)) {
    if (form.trim().length < 2) continue;
    const i = t.toLocaleLowerCase('de-DE').indexOf(form.toLocaleLowerCase('de-DE'));
    if (i < 0) continue;
    const zeile = t.slice(t.lastIndexOf('\n', i - 1) + 1, i);
    // Ab einem großen Abstand (Spalten) bzw. dem Doppelpunkt davor: nur das Kennwort direkt vor dem Wert.
    const teil = zeile.split(/\s{3,}|\t/).pop() ?? '';
    const m = /([\p{L}][\p{L}\p{N} .\-/]*[:.#]?)\s*$/u.exec(teil.slice(-KENNWORT_MAX));
    const k = m?.[1].trim();
    if (k && k.length >= 3 && /\p{L}{3}/u.test(k)) return k;
  }
  return null;
}

/**
 * Wert hinter einem gelernten Kennwort (#1681): das Kennwort (Leerraum und Groß-/Kleinschreibung egal), dann der Rest der
 * Zeile bis zu einem großen Abstand – gelesen wie eine Markierung (Datum, Betrag, Zahl, Text). Fundstelle ist Kennwort
 * und Wert.
 */
export function wertNachKennwort(
  text: string,
  f: Parameters<typeof wertAusText>[0],
  kennwort: string,
): { wert: Wert; fundstelle: string } | null {
  const muster = esc(kennwort.trim()).replace(/\s+/g, '\\s+');
  const m = new RegExp(`${muster}[ \\t]*([^\\n]{1,120})`, 'iu').exec(text.replace(/\u00a0/g, ' '));
  if (!m) return null;
  let roh = m[1].split(/\s{3,}|\t/)[0].trim();
  // Nummern und kurze Texte: nur das erste Wort (dahinter steht oft schon das nächste Kennwort).
  if (f.typ === 'text' && /^\S*\d\S*\s/.test(roh)) roh = roh.split(/\s/)[0];
  const wert = wertAusText(f, roh);
  if (wert == null || wert === '') return null;
  return { wert, fundstelle: `${kennwort.trim()} ${roh}`.slice(0, 200) };
}
