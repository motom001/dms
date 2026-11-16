/** Erkennung (#1278 aus erkennung.ts): Abgleich mit vorhandenen Mappen und einfacher Typ-Vorschlag. */
import { type Erkennungsart, merkmalsfelder, MERKMAL, wiederfindenArt } from './arten';

import { FREIE_MAILDIENSTE, type Sicherheit, ausschnitt } from './angaben';
import type { Mappentyp, Feld } from '../model';
import { zieleVon, zielErlaubt } from '../verweisziele';
import { teileVon } from '../zusammengesetzt';

/* ---------- Abgleich mit vorhandenen Mappen ---------- */

/** Regulärer Ausdruck für einen Wert im Text: Leerzeichen, Punkte, Bindestriche und / dazwischen dürfen fehlen oder anders sein. */
export function wertMuster(wert: string, art: Erkennungsart): RegExp | null {
  const w = wert.trim();
  if (!w) return null;
  if (art === 'email') return new RegExp(`(?<![\\w.+-])${esc(w)}(?![\\w-])`, 'i');
  if (art === 'internet') {
    const dom = domainVon(w);
    return dom ? new RegExp(`(?<![\\w-])(?:www\\.)?${esc(dom)}(?![\\w-])|@${esc(dom)}(?![\\w-])`, 'i') : null;
  }
  if (art === 'telefon' || art === 'mobil' || art === 'fax') {
    const ziffern = w.replace(/^\+49/, '0').replace(/\D/g, '');
    if (ziffern.length < 6) return null;
    // +49 statt 0 und beliebige Trennzeichen zwischen den Ziffern.
    const kern = ziffern.replace(/^0/, '');
    return new RegExp(`(?:\\+49[\\s()/-]*(?:\\(0\\))?[\\s()/-]*|0[\\s()/-]*)${kern.split('').map(esc).join('[\\s()/.\\-]*')}(?!\\d)`);
  }
  const zeichen = w
    .replace(/\s+/g, '')
    .split('')
    .filter((c) => !/[.\-/]/.test(c));
  if (art === 'name') {
    if (w.replace(/\s/g, '').length < 4) return null;
    return new RegExp(`(?<![\\wÄÖÜäöüß])${w.split(/\s+/).map(esc).join('\\s+')}(?![\\wÄÖÜäöüß])`, 'i');
  }
  if (zeichen.length < (art === 'nummer' ? 4 : 6) || (art === 'nummer' && !/\d/.test(w))) return null;
  return new RegExp(`(?<![A-Za-z0-9])${zeichen.map(esc).join('[\\s.\\-/]?')}(?![A-Za-z0-9])`, 'i');
}
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Domain aus E-Mail-Adresse oder Internetseite, ohne www.; freie Maildienste zählen nicht. */
export function domainVon(s: string): string | null {
  const t = s
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, '');
  const d = (t.includes('@') ? t.split('@')[1] : t.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0]).replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || FREIE_MAILDIENSTE.has(d)) return null;
  return d;
}

/** Eine Mappe, die sich vielleicht im Text wiederfindet. */
export interface Vergleichsmappe {
  id: string;
  typId: string;
  werte: Record<string, unknown>;
  geaendert?: string;
}
export interface Treffer {
  mappeId: string;
  typId: string;
  /** stark = an einem eindeutigen Merkmal (Kundennummer, IBAN, E-Mail …) erkannt. */
  stark: boolean;
  punkte: number;
  /** Begründung je Merkmal, z. B. „Kundennummer 100-4711“. */
  gruende: string[];
}

/** Welche Mappen finden sich im Text wieder (Werte ihrer markierten Felder)? Beste zuerst. */
export function findeMappen(text: string, typen: Array<Pick<Mappentyp, 'id' | 'felder'>>, mappen: Vergleichsmappe[]): Treffer[] {
  const t = (text ?? '').replace(/ /g, ' ');
  const felderJe = new Map(typen.map((x) => [x.id, merkmalsfelder(x)]));
  const erg: Treffer[] = [];
  for (const m of mappen) {
    const felder = felderJe.get(m.typId);
    if (!felder?.length) continue;
    const gruende: string[] = [];
    let punkte = 0;
    let stark = false;
    for (const { feld, art } of felder) {
      const roh = m.werte[feld.key];
      for (const w of (Array.isArray(roh) ? roh : [roh]).filter(
        (x): x is string | number => typeof x === 'string' || typeof x === 'number',
      )) {
        const re = wertMuster(String(w), art);
        if (!re || !re.test(t)) continue;
        const gewicht = MERKMAL[art] === 'stark' ? 3 : 1;
        punkte += gewicht;
        if (gewicht === 3) stark = true;
        gruende.push(`${feld.label} ${String(w).trim()}`);
        break;
      }
    }
    if (punkte) erg.push({ mappeId: m.id, typId: m.typId, stark, punkte, gruende });
  }
  return erg.sort((a, b) => b.punkte - a.punkte || Number(b.stark) - Number(a.stark));
}

/** Der eine Absender, wenn er eindeutig ist: genau ein Treffer mit starkem Merkmal. */
export function eindeutigerTreffer(treffer: Treffer[]): Treffer | null {
  const stark = treffer.filter((x) => x.stark);
  return stark.length === 1 ? stark[0] : null;
}

/* ---------- Abgleich mit vorhandenen Mappen (#938) ---------- */

/** Ein Beleg „Woran Ablago das erkennt“: ein Wert eines Wiederfinden-Felds, der im Dokument steht. */
export interface Beleg {
  /** Mappe, an der der Wert steht, und ihr Typ. */
  mappeId: string;
  typId: string;
  /** Feld mit dem Haken „Zum Wiederfinden nutzen“ und seine Bezeichnung (Ausgangstext). */
  feldKey: string;
  feld: string;
  /** Der Wert, wie er in der Mappe steht. */
  wert: string;
  /** Fundstelle im Dokument. */
  fundstelle: string;
  /** stark = ein eindeutiges Merkmal (Nummer, IBAN, E-Mail …); schwach = etwa nur der Name. */
  stark: boolean;
  /** Über einen Verweis (z. B. Vertrag → Vertragspartner): das Verweisfeld der vorgeschlagenen Mappe. */
  ueber?: { feldKey: string; feld: string };
}
/** Eine vorhandene Mappe, die das Dokument betrifft, mit ihren Belegen. */
export interface Abgleichtreffer {
  mappeId: string;
  typId: string;
  belege: Beleg[];
  /** hoch: ein starker Beleg und weitere; mittel: ein starker; niedrig: nur schwache. */
  sicherheit: Sicherheit;
  /** Nur schwache Belege (z. B. nur der Name) – so zeigen, nicht vorauswählen. */
  unsicher: boolean;
  punkte: number;
}
export interface Abgleich {
  /** Alle wiedergefundenen Mappen, beste zuerst. */
  treffer: Abgleichtreffer[];
  /** Je Verweisfeld des Zieltyps die passenden Mappen, beste zuerst (z. B. Aussteller → Vertragspartner, Vertrag → Vertrag). */
  verweise: Record<string, Abgleichtreffer[]>;
  /** Mappen des Zieltyps, die es schon gibt: Alle ihre Werte zum Wiederfinden stehen im Dokument (z. B. dieselbe Rechnungsnummer). */
  doppelt: Abgleichtreffer[];
  /**
   * Gehört dazu (#1043): Mappen anderer Typen, die im Dokument stehen und über ein leeres Verweisfeld zu einer Mappe des
   * Zieltyps gehören könnten – etwa der Lieferschein, dessen Nummer auf der Rechnung steht (Lieferschein → „Gehört zu
   * Rechnung“). Nur mit eigenem starkem Beleg (nicht nur über einen Verweis geerbt), beste zuerst.
   */
  dazu?: Array<Abgleichtreffer & { feldKey: string; feld: string }>;
  /** Treffer, die eigene Organisationen oder Personen des Haushalts sind (#1043) – setzt der Server. */
  eigene?: string[];
}
/** Höchstens so viele Vorschläge je Verweisfeld. */
export const ABGLEICH_JE_FELD = 5;

const sicherheitAus = (belege: Beleg[]): Sicherheit => {
  const stark = belege.some((b) => b.stark);
  return stark && belege.length >= 2 ? 'hoch' : stark ? 'mittel' : belege.length >= 2 ? 'mittel' : 'niedrig';
};

/**
 * Abgleich im Kern, ohne KI (#938): Welche vorhandenen Mappen finden sich im Text wieder – über die Werte ihrer Felder
 * mit „Zum Wiederfinden nutzen“? Jeder Fund ist ein Beleg mit Feld und Fundstelle. Eine Mappe, deren Verweisfeld mit
 * dem Haken auf eine wiedergefundene Mappe zeigt, erbt deren Belege (Vertrag → Vertragspartner, über die Kundennummer).
 * Mehrere Belege stärken einen Treffer; ein einzelner schwacher (nur der Name) bleibt „unsicher“.
 *
 * Mit `ziel` (dem gewählten Mappentyp) kommen Vorschläge für seine Verweisfelder und die Warnung vor Doppelten dazu.
 * `mappen` sind nur die, die die Person lesen darf – das prüft der Aufrufer. Reine Funktion.
 */
export function gleicheAb(
  text: string,
  typen: Array<Pick<Mappentyp, 'id' | 'felder'>>,
  mappen: Vergleichsmappe[],
  ziel?: Pick<Mappentyp, 'id' | 'felder'>,
): Abgleich {
  const t = (text ?? '').replace(/\u00a0/g, ' ');
  const typVon = new Map(typen.map((x) => [x.id, x]));
  const merkmale = new Map(typen.map((x) => [x.id, merkmalsfelder(x)]));
  // 1. Direkte Belege: Werte der Wiederfinden-Felder, die im Text stehen.
  const direkt = new Map<string, Beleg[]>();
  for (const m of mappen) {
    for (const { feld, art } of merkmale.get(m.typId) ?? []) {
      const roh = m.werte[feld.key];
      for (const w of (Array.isArray(roh) ? roh : [roh]).filter(
        (x): x is string | number => typeof x === 'string' || typeof x === 'number',
      )) {
        const re = wertMuster(String(w), art);
        const fund = re?.exec(t);
        if (!fund) continue;
        const b: Beleg = {
          mappeId: m.id,
          typId: m.typId,
          feldKey: feld.key,
          feld: feld.label || feld.key,
          wert: String(w).trim(),
          fundstelle: ausschnitt(t, fund.index, fund[0].length),
          stark: MERKMAL[art] === 'stark',
        };
        direkt.set(m.id, [...(direkt.get(m.id) ?? []), b]);
        break;
      }
    }
  }
  // 1b. Zusammengesetzt (#1050): Ein Beleg nur, wenn die ganze Kombination im Dokument steht.
  for (const m of mappen) {
    const typ = typVon.get(m.typId);
    for (const f of typ?.felder.filter((x) => x.wiederfinden && x.typ === 'zusammengesetzt') ?? []) {
      const b = kombinationsbeleg(t, typ!, f, m, direkt);
      if (b) direkt.set(m.id, [...(direkt.get(m.id) ?? []), b]);
    }
  }
  // 2. Über Verweise: Verweisfelder mit dem Haken, die auf eine wiedergefundene Mappe zeigen.
  const belegeJe = new Map<string, Beleg[]>(direkt);
  for (const m of mappen) {
    const typ = typVon.get(m.typId);
    for (const f of typ?.felder.filter((x) => x.wiederfinden && x.typ === 'referenz') ?? []) {
      const ziele = (Array.isArray(m.werte[f.key]) ? (m.werte[f.key] as unknown[]) : [m.werte[f.key]]).filter(
        (x): x is string => typeof x === 'string',
      );
      for (const z of ziele) {
        if (z === m.id) continue;
        const geerbt = (direkt.get(z) ?? []).map((b) => ({ ...b, ueber: { feldKey: f.key, feld: f.label || f.key } }));
        if (geerbt.length) belegeJe.set(m.id, [...(belegeJe.get(m.id) ?? []), ...geerbt]);
      }
    }
  }
  const punkteVon = (belege: Beleg[]) => belege.reduce((n, b) => n + (b.ueber ? (b.stark ? 2 : 1) : b.stark ? 3 : 1), 0);
  const treffer: Abgleichtreffer[] = [...belegeJe.entries()]
    .map(([mappeId, belege]) => {
      const sicherheit = sicherheitAus(belege);
      return {
        mappeId,
        typId: mappen.find((m) => m.id === mappeId)!.typId,
        belege,
        sicherheit,
        unsicher: sicherheit === 'niedrig',
        punkte: punkteVon(belege),
      };
    })
    .sort((a, b) => b.punkte - a.punkte || b.belege.length - a.belege.length);
  const verweise: Record<string, Abgleichtreffer[]> = {};
  const doppelt: Abgleichtreffer[] = [];
  if (ziel) {
    // Mehrere Zieltypen (#1036): Treffer jedes erlaubten Typs; „jede Mappe“ (Systemfelder) bleibt außen vor.
    for (const f of ziel.felder.filter((x) => x.typ === 'referenz' && zieleVon(x).length)) {
      const passend = treffer.filter((x) => zielErlaubt(f, x.typId)).slice(0, ABGLEICH_JE_FELD);
      if (passend.length) verweise[f.key] = passend;
    }
    // Doppelt: jede gefüllte Angabe zum Wiederfinden der vorhandenen Mappe steht im Dokument, mindestens eine stark –
    // ein zusammengesetztes Feld (#1050) als Ganzes.
    const felder = [
      ...merkmalsfelder(ziel),
      ...ziel.felder.filter((x) => x.wiederfinden && x.typ === 'zusammengesetzt').map((feld) => ({ feld })),
    ];
    for (const x of treffer.filter((y) => y.typId === ziel.id)) {
      const m = mappen.find((y) => y.id === x.mappeId)!;
      const eigene = x.belege.filter((b) => !b.ueber);
      const gefuellt = felder.filter(({ feld }) => {
        const w = m.werte[feld.key];
        return w != null && w !== '' && !(Array.isArray(w) && !w.length);
      });
      if (eigene.some((b) => b.stark) && gefuellt.every(({ feld }) => eigene.some((b) => b.feldKey === feld.key))) doppelt.push(x);
    }
    const dazu = gehoertDazu(treffer, typVon, mappen, ziel.id);
    if (dazu.length) return { treffer, verweise, doppelt, dazu };
  }
  return { treffer, verweise, doppelt };
}

/** Gehört dazu (#1043): Treffer anderer Typen mit eigenem starkem Beleg und einem leeren Verweisfeld auf den Zieltyp. */
function gehoertDazu(
  treffer: Abgleichtreffer[],
  typVon: Map<string, Pick<Mappentyp, 'id' | 'felder'>>,
  mappen: Vergleichsmappe[],
  zielId: string,
): NonNullable<Abgleich['dazu']> {
  const dazu: NonNullable<Abgleich['dazu']> = [];
  for (const x of treffer) {
    if (x.typId === zielId || !x.belege.some((b) => b.stark && !b.ueber)) continue;
    const m = mappen.find((y) => y.id === x.mappeId)!;
    const f = typVon.get(x.typId)?.felder.find((y) => y.typ === 'referenz' && zieleVon(y).length > 0 && zielErlaubt(y, zielId));
    const w = f ? m.werte[f.key] : null;
    if (!f || (w != null && w !== '' && !(Array.isArray(w) && !w.length))) continue;
    dazu.push({ ...x, feldKey: f.key, feld: f.label || f.key });
    if (dazu.length >= ABGLEICH_JE_FELD) break;
  }
  return dazu;
}

/**
 * Beleg für ein zusammengesetztes Feld mit „Zum Wiederfinden nutzen“ (#1050): Jeder gefüllte Teil aus Text oder Zahl steht
 * im Text (als Nummer bzw. in seiner Merkmalsart), jeder gefüllte Verweis zeigt auf eine Mappe, die sich schon
 * wiedergefunden hat (`direkt`). Andere Teile (Datum, Auswahl …) zählen nicht mit. Mindestens ein Teil aus Text oder Zahl.
 */
function kombinationsbeleg(
  text: string,
  typ: Pick<Mappentyp, 'felder'>,
  f: Feld,
  m: Vergleichsmappe,
  direkt: Map<string, Beleg[]>,
): Beleg | null {
  const werte: string[] = [];
  let fundstelle = '';
  for (const q of teileVon(typ.felder, f)) {
    const roh = m.werte[q.key];
    if (roh == null || roh === '' || (Array.isArray(roh) && !roh.length)) continue;
    if (q.typ === 'referenz') {
      if (!(Array.isArray(roh) ? roh : [roh]).some((z) => typeof z === 'string' && z !== m.id && direkt.has(z))) return null;
      continue;
    }
    if (q.typ !== 'text' && q.typ !== 'zahl') continue;
    const w = String(roh).trim();
    const fund = wertMuster(w, wiederfindenArt(q))?.exec(text);
    if (!fund) return null;
    if (!fundstelle) fundstelle = ausschnitt(text, fund.index, fund[0].length);
    werte.push(w);
  }
  if (!werte.length) return null;
  return { mappeId: m.id, typId: m.typId, feldKey: f.key, feld: f.label || f.key, wert: werte.join(' · '), fundstelle, stark: true };
}

/* ---------- Wohin gehört das? Einfacher Typ-Vorschlag ohne KI (#934) ---------- */

/** Ein Mappentyp, dessen Name im Dokument steht (z. B. „Rechnung“ oben im Brief). */
export interface TypFund {
  typId: string;
  wort: string;
  fundstelle: string;
}

/**
 * „Wohin gehört das?“ (#934) ohne KI: Der Mappentyp, dessen Name (oder eine Übersetzung) als Überschrift im Text steht –
 * am Anfang einer Zeile oder nach „Betreff:“, als eigenes Wort: „Rechnung“, „Rechnungen“, nicht aber „Rechnungsnummer“
 * und nicht „Ihr Vertrag …“ mitten im Satz. Es zählt die früheste Stelle in den ersten `TYP_FUND_ZEICHEN` Zeichen;
 * kürzere Namen als 4 Zeichen nie. Nur ein Vorschlag mit Fundstelle – die Klassifizierung aus Paketen (#939) ersetzt
 * ihn später. Reine Funktion.
 */
export const TYP_FUND_ZEICHEN = 1500;
export function typAusText(text: string, typen: Array<Pick<Mappentyp, 'id' | 'name' | 'beschriftungen'>>): TypFund | null {
  const kopf = (text ?? '').slice(0, TYP_FUND_ZEICHEN).replace(/\u00a0/g, ' ');
  let best: (TypFund & { i: number }) | null = null;
  for (const x of typen) {
    const namen = [
      ...new Set(
        [x.name, ...Object.values(x.beschriftungen ?? {}).map((b) => (b as { name?: string } | undefined)?.name ?? '')]
          .map((n) => n.trim())
          .filter((n) => n.length >= 4),
      ),
    ];
    for (const n of namen) {
      const m = new RegExp(`(^[ \\t]*|(?:betreff|betr\\.|subject|re)\\s*:\\s*)(${esc(n)}(?:en|e|n|s)?)(?![\\p{L}\\p{N}])`, 'imu').exec(
        kopf,
      );
      const i = m ? m.index + m[1].length : -1;
      if (m && (!best || i < best.i)) best = { typId: x.id, wort: m[2], fundstelle: ausschnitt(kopf, i, m[2].length), i };
    }
  }
  return best ? { typId: best.typId, wort: best.wort, fundstelle: best.fundstelle } : null;
}
