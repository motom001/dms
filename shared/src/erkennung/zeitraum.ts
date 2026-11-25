/**
 * Zeitraum aus zwei Daten (#1646): „vom 01.07.2012 – 31.07.2012“, „01.01.2026 bis 28.02.2026“, „Zeitraum 01.07. - 31.07.2012“
 * – auch über einen Zeilenumbruch. Das erste Datum geht an das Feld für den Beginn, das zweite an das Feld für das Ende.
 *
 * Welche Datumsfelder ein Paar bilden, steht am Feld für das Ende (`erkennung.endeVon`, in der Werkbank „Ende des
 * Zeitraums ab …“); ohne Angabe ergibt es sich aus Kennung und Bezeichnung: Beginn/Ende, Von/Bis, Start/Ende,
 * „Mietbeginn“/„Mietende“, „zeitraum_von“/„zeitraum_bis“. Reine Funktionen.
 */
import type { Feld, Mappentyp } from '../model';
import { ausschnitt, datumIso, type Fund, type Sicherheit } from './angaben';
import { klein, type Erkennungsart } from './arten';

/** Ein Zeitraum im Text: Beginn und Ende als JJJJ-MM-TT. */
export interface Zeitraumfund {
  von: string;
  bis: string;
  sicherheit: Sicherheit;
  fundstelle: string;
}

const MONAT = String.raw`Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Nov|Dez`;
const MONATE = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
/** Ein Datum; beim ersten darf das Jahr fehlen („01.07. – 31.07.2012“). */
const datum = (n: number, jahrPflicht: boolean) =>
  String.raw`(?<t${n}>\d{1,2})\.[ \t]?(?:(?<m${n}>\d{1,2})\.(?:[ \t]?(?<j${n}>\d{4}|\d{2})(?!\d))${jahrPflicht ? '' : '?'}|[ \t]?(?<mn${n}>${MONAT})\.?[ \t]+(?<jn${n}>\d{4}))` +
  String.raw`|(?<ij${n}>\d{4})-(?<im${n}>\d{2})-(?<it${n}>\d{2})`;
/** Wörter vor dem Zeitraum – sie machen ihn sicher. */
const VOR = String.raw`(?:f[üu]r[ \t]+den[ \t]+)?(?:vom|von|Zeitraum|Abrechnungszeitraum|Leistungszeitraum|Versicherungszeitraum|Abrechnungsjahr|Laufzeit|Periode|period|from)`;
/**
 * Zusatz nach „bis“ (#1669): „bis einschl. 19.12.2026“. Ablago zählt „Bis“ ohnehin als letzten Tag mit; „bis
 * ausschließlich“ ist kein Zeitraum (lieber kein Vorschlag als ein falscher Tag).
 */
const EINSCHL = String.raw`(?:\s+(?:einschl\.|einschließlich|einschliesslich|inkl\.|inklusive|incl\.|including|inclusive))?`;
/** Zwischen den Daten: Bindestrich, Strich, „bis“, „bis zum“ (auch mit „einschl.“), „to“, „until“ – Leerraum auch mit Zeilenumbruch. */
const ZWISCHEN = String.raw`\s*(?:[-–—]|bis(?:[ \t]+zum)?${EINSCHL}|to|until)\s*`;
const ZEITRAUM = new RegExp(
  String.raw`(?<![\p{L}\p{N}.])(?:(?<vor>${VOR})[ \t]*:?\s*)?(?:${datum(1, false)})${ZWISCHEN}(?:${datum(2, true)})(?![\p{N}])`,
  'giu',
);

/** Datum aus den Gruppen eines Treffers; `jahr` ergänzt ein fehlendes Jahr (das des zweiten Datums). */
function isoAus(g: Record<string, string | undefined>, n: number, jahr?: number): string | null {
  if (g[`ij${n}`]) return datumIso(Number(g[`it${n}`]), Number(g[`im${n}`]), Number(g[`ij${n}`]));
  const t = Number(g[`t${n}`]);
  if (g[`mn${n}`]) {
    const mon = MONATE.findIndex((x) => x.startsWith(klein(g[`mn${n}`]!).slice(0, 3)));
    return mon >= 0 ? datumIso(t, mon + 1, Number(g[`jn${n}`])) : null;
  }
  const j = g[`j${n}`] ? Number(g[`j${n}`]) : jahr;
  return j == null ? null : datumIso(t, Number(g[`m${n}`]), j);
}

/** Alle Zeiträume im Text, in ihrer Reihenfolge – nur, wenn der Beginn nicht nach dem Ende liegt. */
export function findeZeitraeume(roh: string): Zeitraumfund[] {
  const text = (roh ?? '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .slice(0, 200_000);
  const erg: Zeitraumfund[] = [];
  for (const m of text.matchAll(ZEITRAUM)) {
    const g = m.groups ?? {};
    const bis = isoAus(g, 2);
    const von = bis ? isoAus(g, 1, Number(bis.slice(0, 4))) : null;
    if (!von || !bis || von > bis) continue;
    erg.push({ von, bis, sicherheit: g.vor ? 'hoch' : 'mittel', fundstelle: ausschnitt(text, m.index!, m[0].length) });
  }
  return erg;
}

const BEGINN = ['beginn', 'von', 'ab', 'start', 'anfang', 'from', 'begin', 'seit'];
const ENDE = ['ende', 'bis', 'end', 'to', 'until', 'ablauf'];

/** Rolle und Stamm eines Namens: „mietbeginn“ → beginn/„miet“, „zeitraum bis“ → ende/„zeitraum“; sonst null. */
function rolle(name: string): { rolle: 'beginn' | 'ende'; stamm: string } | null {
  const teile = klein(name)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!teile.length) return null;
  const letztes = teile[teile.length - 1];
  const vorne = teile.slice(0, -1).join(' ');
  if (BEGINN.includes(letztes)) return { rolle: 'beginn', stamm: vorne };
  if (ENDE.includes(letztes)) return { rolle: 'ende', stamm: vorne };
  // Zusammengesetzt: „Mietbeginn“, „Vertragsende“, „Versicherungsbeginn“.
  for (const [r, w] of [
    ['beginn', 'beginn'],
    ['beginn', 'anfang'],
    ['beginn', 'start'],
    ['ende', 'ende'],
  ] as const)
    if (letztes.length > w.length + 2 && letztes.endsWith(w))
      return { rolle: r, stamm: [vorne, letztes.slice(0, -w.length).replace(/s$/, '')].filter(Boolean).join(' ') };
  return null;
}

/** Ein Paar von Datumsfeldern: Beginn und Ende eines Zeitraums. */
export interface Datumspaar {
  beginn: Feld;
  ende: Feld;
}

/**
 * Paare von Datumsfeldern im Mappentyp (#1646): zuerst die eingestellten (`erkennung.endeVon` am Ende), dann aus
 * Kennung bzw. Bezeichnung – Beginn und Ende mit demselben Stamm. Jedes Feld gehört zu höchstens einem Paar.
 * `nur`: nur diese Felder (z. B. die, die „Aus Dokument ausfüllen“ füllen darf).
 */
export function datumsPaare(t: Pick<Mappentyp, 'felder'>, nur?: readonly Feld[]): Datumspaar[] {
  const felder = (nur ?? t.felder).filter((f) => f.typ === 'datum');
  const paare: Datumspaar[] = [];
  const vergeben = new Set<string>();
  const nimm = (beginn: Feld, ende: Feld) => {
    if (beginn.key === ende.key || vergeben.has(beginn.key) || vergeben.has(ende.key)) return;
    paare.push({ beginn, ende });
    vergeben.add(beginn.key).add(ende.key);
  };
  for (const ende of felder) {
    const b = ende.erkennung?.endeVon ? felder.find((f) => f.key === ende.erkennung!.endeVon) : undefined;
    if (b) nimm(b, ende);
  }
  for (const quelle of [(f: Feld) => f.key.replace(/_/g, ' '), (f: Feld) => f.label] as const) {
    const rollen = felder.map((f) => ({ f, r: rolle(quelle(f) ?? '') }));
    for (const e of rollen.filter((x) => x.r?.rolle === 'ende')) {
      const b = rollen.find((x) => x.r?.rolle === 'beginn' && x.r.stamm === e.r!.stamm && !vergeben.has(x.f.key));
      if (b) nimm(b.f, e.f);
    }
  }
  return paare;
}

/**
 * Vorschläge für die Datumspaare eines Typs aus dem ersten Zeitraum im Text – ein Zeitraum mit „vom“, „Zeitraum“ …
 * davor geht vor. Beide Felder bekommen dieselbe Fundstelle, aber verschiedene Werte.
 */
export function zeitraumVorschlaege(
  t: Pick<Mappentyp, 'felder'>,
  text: string,
  felder: ReadonlyArray<{ feld: Feld; art: Erkennungsart }>,
): Record<string, Fund> {
  const paare = datumsPaare(
    t,
    felder.filter((x) => x.art === 'datum').map((x) => x.feld),
  );
  if (!paare.length) return {};
  const z = findeZeitraeume(text);
  const best = z.find((x) => x.sicherheit === 'hoch') ?? z[0];
  if (!best) return {};
  const erg: Record<string, Fund> = {};
  for (const p of paare) {
    erg[p.beginn.key] = { wert: best.von, sicherheit: best.sicherheit, fundstelle: best.fundstelle };
    erg[p.ende.key] = { wert: best.bis, sicherheit: best.sicherheit, fundstelle: best.fundstelle };
  }
  return erg;
}

/**
 * Steht in der Fundstelle ein Zeitraum „vom … bis …“ mit zwei Daten, den Ablago nicht als Paar erkannt hat (#1669, z. B.
 * „bis ausschließlich“)? Dann bekommt kein Feld eines Datumspaars ein einzelnes Datum daraus.
 */
export const ungeklaerterZeitraum = (s: string) =>
  datenIn(s) >= 2 && /(?:^|[^\p{L}])(?:vom|von|from)[^\p{L}][\s\S]*(?:^|[^\p{L}])(?:bis|to|until)(?:[^\p{L}]|$)/iu.test(s);

/** Wie viele Daten stehen in einer Fundstelle? (Zwei Felder sollen nicht denselben Wert aus einem Zeitraum bekommen.) */
export const datenIn = (s: string) => (s.match(/\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}|\d{4}-\d{2}-\d{2}/g) ?? []).length;
