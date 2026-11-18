/**
 * Rundgänge und Tipps aus Paketen in mehreren Sprachen (#1307): reine Regeln für Server und Tests.
 *
 * Ein Paket bringt die Texte seiner Rundgänge und Tipps wie Ablagos eigene als Sprachdatei mit –
 * `texte/<sprache>/entdecken.json`, flach, mit denselben Schlüsseln wie `shared/src/sprachen/<sprache>/entdecken.json`
 * (`rundgang.<rundgang>.titel`, `rundgang.<rundgang>.<schritt>.text`, `tipp.<tipp>` …; Unterstriche werden zu
 * Bindestrichen). Angezeigt wird die Sprache der Person; fehlt dort ein Text, gilt der Text in der YAML-Datei und danach
 * die Grundsprache des Pakets (Deutsch, wie bei den Beschriftungen). Pakete mit Text direkt in der YAML-Datei laufen
 * weiter – beim Installieren mit Hinweis.
 */
import { textSchluesselRundgang, textSchluesselSchritt, textSchluesselTipp, type Texte } from './entdecken';

/** Sprache, in der Pakete geschrieben sind (REGELN der Registry: „Deutsch ist der Grundtext“). */
export const PAKET_GRUNDSPRACHE = 'de';
/** Datei der Texte je Sprache im Paket, z. B. `texte/en/entdecken.json` oder `texte/pt-BR/entdecken.json`. */
export const PAKET_TEXTE_DATEI = /^texte\/([a-z]{2,3}(?:-[A-Z]{2})?)\/entdecken\.json$/;
/** Höchstens so viele Sprachen je Paket (wie bei den Beschriftungen). */
export const PAKET_SPRACHEN_MAX = 30;

/** Texte eines Pakets: Sprache → Schlüssel (ohne „entdecken.“) → Text. */
export type PaketTexte = Record<string, Record<string, string>>;

const ohnePraefix = (k: string) => k.replace(/^entdecken\./, '');
const aus = (d: Record<string, string> | undefined): Texte | undefined => (d ? (k) => d[ohnePraefix(k)] : undefined);

/** Übersetzung in der Sprache `spr` (sonst ihrer Hauptsprache: `pt` für `pt-BR`) – gilt vor dem Text in der Datei. */
export const paketUebersetzung = (texte: PaketTexte | undefined, spr: string): Texte | undefined =>
  aus(texte?.[spr] ?? texte?.[spr.split('-')[0]]);
/** Texte in der Grundsprache des Pakets – gelten, wenn weder Übersetzung noch Text in der Datei da sind. */
export const paketGrundtexte = (texte: PaketTexte | undefined): Texte | undefined => aus(texte?.[PAKET_GRUNDSPRACHE]);

const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const liste = (x: unknown) => (Array.isArray(x) ? x.filter(istObjekt) : []);
const schluesselVon = (x: Record<string, unknown>) => (typeof x.schluessel === 'string' ? x.schluessel : null);

const RUNDGANG_FELDER = [
  ['titel', true],
  ['beschreibung', true],
  ['ende', false],
  ['ersatz', false],
] as const;
const SCHRITT_FELDER = [
  ['titel', true],
  ['text', true],
  ['text-handy', false],
  ['text-verwalten', false],
  ['ort', false],
  ['sonst-verwalten', false],
] as const;

/** Ein Text, den ein Rundgang oder Tipp haben kann: Schlüssel in der Sprachdatei und Feld in der YAML-Datei. */
export interface PaketTextstelle {
  schluessel: string;
  /** Muss es den Text geben (Titel, Text …)? */
  pflicht: boolean;
  /** Steht der Text direkt in der YAML-Datei? */
  inDatei: boolean;
}

/** Alle Texte, die die Rundgänge und Tipps eines Pakets haben können (Schlüssel ohne „entdecken.“). */
export function paketTextstellen(rundgaenge: unknown, tipps: unknown): PaketTextstelle[] {
  const stellen: PaketTextstelle[] = [];
  const dazu = (schluessel: string, pflicht: boolean, roh: Record<string, unknown>, feld: string) =>
    stellen.push({ schluessel: ohnePraefix(schluessel), pflicht, inDatei: typeof roh[feld] === 'string' });
  for (const r of liste(rundgaenge)) {
    const rk = schluesselVon(r);
    if (!rk) continue;
    for (const [feld, pflicht] of RUNDGANG_FELDER) dazu(textSchluesselRundgang(rk, feld), pflicht, r, feld);
    for (const s of liste(r.schritte)) {
      const sk = schluesselVon(s);
      if (!sk) continue;
      for (const [feld, pflicht] of SCHRITT_FELDER) dazu(textSchluesselSchritt(rk, sk, feld), pflicht, s, feld.replace('-', '_'));
    }
  }
  for (const x of liste(tipps)) {
    const k = schluesselVon(x);
    if (k) dazu(textSchluesselTipp(k), true, x, 'text');
  }
  return stellen;
}

/** Was die Prüfung der Sprachdateien eines Pakets findet. */
export interface PaketTexteBefund {
  /** Schlüssel, die es zu keinem Rundgang, Schritt oder Tipp gibt – je Sprache (ein Fehler). */
  ueberzaehlig: Array<{ sprache: string; schluessel: string[] }>;
  /** Texte, die in der Grundsprache da sind, in einer Übersetzung aber fehlen – je Sprache (ein Hinweis). */
  fehlt: Array<{ sprache: string; schluessel: string[] }>;
  /** Texte direkt in der YAML-Datei. */
  inDatei: number;
  /** Texte direkt in der YAML-Datei und keine Übersetzung: Es gibt sie nur in einer Sprache (ein Hinweis). */
  nurEineSprache: boolean;
}

/** Schlüssel der Sprachdateien gegen die Rundgänge und Tipps des Pakets prüfen. */
export function pruefePaketTexte(texte: PaketTexte | undefined, rundgaenge: unknown, tipps: unknown): PaketTexteBefund {
  const stellen = paketTextstellen(rundgaenge, tipps);
  const bekannt = new Set(stellen.map((s) => s.schluessel));
  const grund = texte?.[PAKET_GRUNDSPRACHE] ?? {};
  // Was es in der Grundsprache gibt: in der Sprachdatei oder direkt in der YAML-Datei.
  const da = stellen.filter((s) => s.inDatei || grund[s.schluessel] !== undefined).map((s) => s.schluessel);
  const inDatei = stellen.filter((s) => s.inDatei).length;
  const uebersetzt = Object.keys(texte ?? {}).some((x) => x !== PAKET_GRUNDSPRACHE);
  const befund: PaketTexteBefund = { ueberzaehlig: [], fehlt: [], inDatei, nurEineSprache: inDatei > 0 && !uebersetzt };
  for (const [sprache, d] of Object.entries(texte ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const zuviel = Object.keys(d).filter((k) => !bekannt.has(k));
    if (zuviel.length) befund.ueberzaehlig.push({ sprache, schluessel: zuviel });
    const fehlt = sprache === PAKET_GRUNDSPRACHE ? [] : da.filter((k) => d[k] === undefined);
    if (fehlt.length) befund.fehlt.push({ sprache, schluessel: fehlt });
  }
  return befund;
}
