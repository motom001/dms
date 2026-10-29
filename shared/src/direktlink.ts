/**
 * Sprechende Links auf Mappen (#98): eine Mappe über ihren Typ und ihre Feldwerte finden
 * statt über ihre technische Id, z. B.
 *
 *   /ablage/link?typ=Rechnung&rechnungsnummer=A-2020-11380
 *   /ablage/link?typ=Rechnung&bezahlt=nein&rechnungsdatum.groesser=heute-30tage&sortierung=-rechnungsdatum
 *
 * - typ: Schlüssel des Mappentyps (#145); auch sein Name geht (ohne Groß-/Kleinschreibung), für ältere Links
 * - feld=wert: „ist gleich“ (Ja/Nein: ja/nein, Auswahlliste: ist einer von, Langtext: enthält)
 * - feld.operator=wert: die übrigen Operatoren der Sichtbedingungen
 * - sortierung=feld bzw. -feld; Standard: nach Titel
 * Mehrere Bedingungen gelten zusammen (UND). Server und Oberfläche teilen diese Datei.
 */
import { istIndexplatzhalter, sortierbar, istSystemspalte, vorlageFelder, wirksameVorlage, type Mappe, type Mappentyp, type Sortierung } from './model';
import { bedingungsfelder, bedingungsProblem, beschreibeBedingung, OPERATOREN, OPERATOREN_JE_ART, type Bedingung, type Bedingungsfeld, type Einheit, type Operator, type WertAngabe } from './sichten';

export const LINK_PFAD = '/ablage/link';
/** Parameter mit fester Bedeutung; gleichnamige Felder erreicht man mit „feld.operator“. */
export const LINK_PARAMETER = ['typ', 'sortierung'] as const;

/** Die Parameter eines Links, z. B. ein URLSearchParams. */
export type Linkparameter = Iterable<[string, string]> & { get(name: string): string | null };

export interface Direktlink { typ: Mappentyp; bedingungen: Bedingung[]; sortierung: Sortierung | null }
export type Linkergebnis = { ok: true; link: Direktlink } | { ok: false; fehler: string[] };

const OHNE_WERT: Operator[] = ['leer', 'nichtLeer', 'ja', 'nein'];
/** Operatoren ohne Rücksicht auf Groß-/Kleinschreibung: „nichtleer“ = „nichtLeer“. */
const OPERATOR_NAMEN = new Map((Object.keys(OPERATOREN) as Operator[]).map((o) => [o.toLowerCase(), o]));
/** Im Link nur einfache Felder; Verweise und Personen nur mit „ich“ bzw. leer/nicht leer. */
const NUR_ICH: Bedingungsfeld['art'][] = ['referenz', 'person'];

const EINHEITEN_IM_LINK: Record<string, Einheit> = {
  tag: 'tage', tage: 'tage', woche: 'wochen', wochen: 'wochen', monat: 'monate', monate: 'monate', jahr: 'jahre', jahre: 'jahre',
};

/**
 * Vorzeichen: „+“ wird in einer Adresse oft zu einem Leerzeichen (heute+12monate → „heute 12monate“),
 * deshalb zählt ein Leerzeichen wie „+“.
 */
const VORZEICHEN = String.raw`\s*([+\-\s])\s*`;
const HEUTE = new RegExp(String.raw`^heute(?:${VORZEICHEN}(\d{1,4})\s*(tage?|wochen?|monate?|jahre?))?$`, 'i');
const ZEITRAUM = new RegExp(String.raw`^(jahr|monat)(?:${VORZEICHEN}(\d{1,4}))?$`, 'i');

const versatz = (zeichen: string | undefined, zahl: string | undefined) => (zahl ? Number(zahl) * (zeichen === '-' ? -1 : 1) : 0);

/** Datum als JJJJ-MM-TT oder TT.MM.JJJJ; null = kein gültiges Datum. */
function datum(s: string): string | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let j: number, mo: number, t: number;
  if (m) [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) [t, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else return null;
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
  return d.toISOString().slice(0, 10);
}

/** Zahl mit Komma oder Punkt; „1.234,50“ geht auch. */
function zahl(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(norm)) return null;
  return Number(norm);
}

/** Ein Vergleichswert aus dem Link; ein Text = Fehlermeldung. */
function wertAus(f: Bedingungsfeld, op: Operator, roh: string): WertAngabe | string {
  const s = roh.trim();
  const name = `„${f.label}“`;
  if (!s) return `Bei ${name} fehlt der Wert.`;
  if (op === 'imZeitraum') {
    const m = ZEITRAUM.exec(s);
    if (!m) return `Bei ${name} „im Zeitraum“ geht nur jahr oder monat, z. B. jahr-1 oder monat.`;
    return { art: m[1].toLowerCase() as 'jahr' | 'monat', versatz: versatz(m[2], m[3]) };
  }
  if (NUR_ICH.includes(f.art)) {
    if (s.toLowerCase() === 'ich') return { art: 'ich' };
    return `${name} ist ein Verweis: Im Link geht dort nur „ich“ oder .leer bzw. .nichtLeer.`;
  }
  switch (f.art) {
    case 'datum': case 'zeit': {
      const h = HEUTE.exec(s);
      if (h) return { art: 'heute', versatz: versatz(h[1], h[2]), einheit: h[3] ? EINHEITEN_IM_LINK[h[3].toLowerCase()] : 'tage' };
      const d = datum(s);
      return d ? { art: 'fest', wert: d } : `„${s}“ ist kein Datum für ${name} (z. B. 2026-03-31, 31.03.2026 oder heute-30tage).`;
    }
    case 'zahl': case 'betrag': {
      const n = zahl(s);
      return n === null ? `„${s}“ ist keine Zahl für ${name}.` : { art: 'fest', wert: n };
    }
    case 'auswahl': {
      const optionen = f.feld?.optionen ?? [];
      const gewaehlt: string[] = [];
      for (const teil of s.split(',').map((x) => x.trim()).filter(Boolean)) {
        const o = optionen.find((x) => x.toLowerCase() === teil.toLowerCase());
        if (!o) return `„${teil}“ gibt es in der Auswahlliste ${name} nicht${optionen.length ? ` (möglich: ${optionen.join(', ')})` : ''}.`;
        gewaehlt.push(o);
      }
      return { art: 'fest', wert: gewaehlt };
    }
    default: return { art: 'fest', wert: s };
  }
}

/** Operator, wenn im Link keiner steht. */
function standardOperator(f: Bedingungsfeld, wert: string): { op: Operator; ohneWert?: boolean } | string {
  switch (f.art) {
    case 'janein': {
      const w = wert.trim().toLowerCase();
      if (['ja', 'true', '1'].includes(w)) return { op: 'ja', ohneWert: true };
      if (['nein', 'false', '0'].includes(w)) return { op: 'nein', ohneWert: true };
      return `Bei „${f.label}“ geht nur ja oder nein.`;
    }
    case 'auswahl': return { op: 'einerVon' };
    case 'langtext': case 'formatiert': return { op: 'enthaelt' };
    case 'referenz': case 'person': return { op: 'zeigtAuf' };
    default: return { op: 'gleich' };
  }
}

/** Mappentyp über seinen Schlüssel (#145), sonst über den Namen (ohne Groß-/Kleinschreibung); notfalls über die Id. */
export function typImLink(name: string, typen: Mappentyp[]): Mappentyp | undefined {
  const n = name.trim().toLowerCase();
  return typen.find((t) => t.schluessel === n) ?? typen.find((t) => t.name.trim().toLowerCase() === n) ?? typen.find((t) => t.id === name.trim());
}

/** Liest einen Link; Fehler werden gesammelt und nie stillschweigend übergangen. */
export function liesDirektlink(parameter: Linkparameter, typen: Mappentyp[]): Linkergebnis {
  const fehler: string[] = [];
  const typName = parameter.get('typ');
  if (!typName?.trim()) return { ok: false, fehler: ['Im Link fehlt der Mappentyp, z. B. typ=Rechnung.'] };
  const typ = typImLink(typName, typen);
  if (!typ) return { ok: false, fehler: [`Den Mappentyp „${typName.trim()}“ gibt es nicht.`] };
  const felder = bedingungsfelder([typ]);
  const bedingungen: Bedingung[] = [];
  let sortierung: Sortierung | null = null;

  for (const [schluessel, wert] of parameter) {
    if (schluessel === 'typ') continue;
    if (schluessel === 'sortierung') {
      const absteigend = wert.trim().startsWith('-');
      const spalte = wert.trim().replace(/^[-+]/, '').trim() || '_titel';
      if ((!istSystemspalte(spalte) && !typ.felder.some((f) => f.key === spalte)) || !sortierbar(spalte, typ) || spalte === '_typ') {
        fehler.push(`Nach „${spalte}“ lässt sich ${typ.felder.some((f) => f.key === spalte) ? 'nicht sortieren' : `nicht sortieren – das Feld gibt es bei ${typ.name} nicht`}.`);
      } else sortierung = spalte === '_titel' && !absteigend ? null : { spalte, absteigend };
      continue;
    }
    const teile = schluessel.split('.');
    if (teile.length > 2 || !teile[0]) { fehler.push(`„${schluessel}“ versteht das DMS nicht; erwartet ist feld oder feld.operator.`); continue; }
    const [feldKey, opName] = teile;
    const f = felder.find((x) => x.key === feldKey);
    if (!f) { fehler.push(`Feld „${feldKey}“ gibt es bei ${typ.name} nicht.`); continue; }
    if (f.art === 'passwort') { fehler.push(`Nach dem Passwortfeld „${f.label}“ lässt sich nicht suchen.`); continue; }
    let op: Operator;
    let ohneWert = false;
    if (opName !== undefined) {
      const o = OPERATOR_NAMEN.get(opName.toLowerCase());
      if (!o) { fehler.push(`Den Operator „${opName}“ gibt es nicht (möglich: ${Object.keys(OPERATOREN).join(', ')}).`); continue; }
      op = o; ohneWert = OHNE_WERT.includes(o);
    } else {
      const s = standardOperator(f, wert);
      if (typeof s === 'string') { fehler.push(s); continue; }
      op = s.op; ohneWert = !!s.ohneWert;
    }
    if (!OPERATOREN_JE_ART[f.art].includes(op)) {
      fehler.push(`„${OPERATOREN[op]}“ passt nicht zum Feld „${f.label}“ (möglich: ${OPERATOREN_JE_ART[f.art].join(', ')}).`);
      continue;
    }
    if (NUR_ICH.includes(f.art) && !ohneWert && op !== 'zeigtAuf') { fehler.push(`${f.label}: nicht möglich.`); continue; }
    const b: Bedingung = { art: 'feld', feld: f.key, op };
    if (!ohneWert) {
      if (op === 'zwischen' || op === 'ausserhalb') {
        const [von, bis, ...mehr] = wert.split('..');
        if (bis === undefined || mehr.length) { fehler.push(`Bei „${f.label}“ ${OPERATOREN[op]} gehören zwei Werte mit .. dazwischen, z. B. 2026-01-01..2026-03-31.`); continue; }
        const a = wertAus(f, op, von); const z = wertAus(f, op, bis);
        if (typeof a === 'string' || typeof z === 'string') { fehler.push([a, z].filter((x) => typeof x === 'string').join(' ')); continue; }
        b.wert = a; b.bis = z;
      } else {
        const a = wertAus(f, op, wert);
        if (typeof a === 'string') { fehler.push(a); continue; }
        b.wert = a;
      }
    }
    const problem = bedingungsProblem(b, [typ]);
    if (problem) { fehler.push(problem); continue; }
    bedingungen.push(b);
  }
  return fehler.length ? { ok: false, fehler } : { ok: true, link: { typ, bedingungen, sortierung } };
}

/** Lesbar, z. B. „Rechnung: Rechnungsnummer ist gleich „A-2020-11380““. */
export function beschreibeDirektlink(l: Direktlink): string {
  return l.bedingungen.length ? `${l.typ.name}: ${l.bedingungen.map((b) => beschreibeBedingung(b, [l.typ])).join(', ')}` : `${l.typ.name}: alle Mappen`;
}

/* ---------- Link zu einer Mappe bauen („Link kopieren“) ---------- */

/** Wie in Formularen: Leerzeichen als +, Komma lesbar. */
const kodiere = (s: string) => encodeURIComponent(s).replace(/%20/g, '+').replace(/%2C/gi, ',');

/** Wert eines Feldes, wie er im Link steht; null = nicht verwendbar. */
function linkwert(typ: Mappentyp, key: string, m: Mappe): { name: string; wert: string } | null {
  const f = typ.felder.find((x) => x.key === key);
  const v = m.werte[key];
  if (!f || v === null || v === undefined || v === '') return null;
  const reserviert = (LINK_PARAMETER as readonly string[]).includes(key);
  switch (f.typ) {
    case 'text': return { name: reserviert ? `${key}.gleich` : key, wert: String(v) };
    case 'zahl': return typeof v === 'number' ? { name: reserviert ? `${key}.gleich` : key, wert: String(v) } : null;
    case 'betrag': {
      const b = v as { betrag?: unknown };
      return typeof b?.betrag === 'number' ? { name: reserviert ? `${key}.gleich` : key, wert: String(b.betrag) } : null;
    }
    case 'datum': return typeof v === 'string' && datum(v) ? { name: reserviert ? `${key}.gleich` : key, wert: v } : null;
    case 'janein': return { name: reserviert ? `${key}.${v === true ? 'ja' : 'nein'}` : key, wert: v === true ? 'ja' : 'nein' };
    case 'auswahl': {
      const liste = (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
      if (!liste.length || liste.some((x) => x.includes(','))) return null;
      return { name: reserviert ? `${key}.einerVon` : key, wert: liste.join(',') };
    }
    default: return null;
  }
}

/**
 * Link auf eine Mappe: über ein eindeutiges Feld, sonst über die Felder ihres Titels
 * (dann können es mehrere Treffer sein). null = nichts Verwendbares.
 */
export function linkZuMappe(typ: Mappentyp, m: Mappe): string | null {
  const eindeutig = typ.felder.filter((f) => f.eindeutig).map((f) => linkwert(typ, f.key, m)).find((x) => !!x);
  const teile = eindeutig ? [eindeutig] : [...new Set(vorlageFelder(wirksameVorlage(typ)))]
    .filter((k) => !istIndexplatzhalter(k)).map((k) => linkwert(typ, k, m)).filter((x): x is { name: string; wert: string } => !!x);
  if (!teile.length) return null;
  return `${LINK_PFAD}?${[{ name: 'typ', wert: typ.schluessel ?? typ.name }, ...teile].map((t) => `${kodiere(t.name)}=${kodiere(t.wert)}`).join('&')}`;
}
