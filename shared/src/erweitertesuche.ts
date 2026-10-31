/**
 * Erweiterte Suche (#199): Mappentypen wählen, in ihren gemeinsamen Feldern gezielt suchen und mit
 * einem Volltext in Dokumenten und Notizen kombinieren. Die Suche steht in der Adresse, z. B.
 *
 *   /ablage/suche?typ=rechnung&rechnungsdatum.von=2025-03-01&rechnungsdatum.bis=2025-11-30
 *     &vertragspartner=<Id>&vertragspartner=<Id>&volltext=Backofen&in=dokumente&in=notizen
 *
 * - typ: Schlüssel (oder Name) eines Mappentyps, mehrfach; ohne = alle lesbaren Typen, nur Systemfelder
 * - feld.von / feld.bis: Datum, Zahl, Betrag (eins darf fehlen)
 * - feld=wert: mehrfach bei Verweisen und Auswahllisten (= ist einer von); Ja/Nein: ja oder nein; Text: enthält
 * - feld.leer=1 bzw. feld.nichtleer=1
 * - volltext=…, in=dokumente / in=notizen (ohne „in“: beide)
 * Zwischen den Feldern gilt UND, innerhalb eines Feldes ODER. Server und Oberfläche teilen diese Datei.
 */
import { typImLink } from './direktlink';
import type { Mappentyp } from './model';
import { bedingungsfelder, bedingungsProblem, OPERATOREN_JE_ART, verschiebe, type Bedingung, type Bedingungsfeld } from './sichten';

export const SUCHE_PFAD = '/ablage/suche';
/** Parameter mit fester Bedeutung; gleichnamige Felder erreicht man mit „feld.wert“. */
export const SUCHE_PARAMETER = ['typ', 'volltext', 'in'] as const;

/** Eingabe zu einem Feld; was leer ist, gilt nicht. */
export interface Feldeingabe {
  von?: string;
  bis?: string;
  /** Verweise, Auswahl (mehrere = ODER); Text und Ja/Nein: ein Wert. */
  werte?: string[];
  leer?: 'leer' | 'nichtLeer';
}
export interface Suchformular {
  /** Schlüssel (oder Namen/Ids) der Mappentypen, wie in der Adresse. */
  typen: string[];
  felder: Record<string, Feldeingabe>;
  volltext: string;
  inDokumenten: boolean;
  inNotizen: boolean;
}
export const leeresFormular = (): Suchformular => ({ typen: [], felder: {}, volltext: '', inDokumenten: true, inNotizen: true });

/** Welche Eingabe ein Feld bekommt – ohne dass man einen Operator wählt. */
export type Eingabeart = 'datum' | 'zahl' | 'verweis' | 'person' | 'auswahl' | 'janein' | 'text';
export function eingabeart(f: Bedingungsfeld): Eingabeart | null {
  switch (f.art) {
    case 'datum': case 'zeit': return 'datum';
    case 'zahl': case 'betrag': return 'zahl';
    case 'referenz': return 'verweis';
    case 'person': return 'person';
    case 'auswahl': return 'auswahl';
    case 'janein': return 'janein';
    case 'text': case 'langtext': case 'formatiert': return 'text';
    default: return null;
  }
}
/** Gibt es „leer“ bzw. „nicht leer“ für dieses Feld? */
export const kannLeer = (f: Bedingungsfeld, op: 'leer' | 'nichtLeer') => OPERATOREN_JE_ART[f.art].includes(op);

/** Felder für das Formular: was alle gewählten Typen gemeinsam haben, dazu die Systemfelder; nie Passwörter. */
export function suchfelder(typen: Mappentyp[]): Bedingungsfeld[] {
  return bedingungsfelder(typen).filter((f) => f.art !== 'passwort' && eingabeart(f) !== null);
}

/** Hat die Eingabe überhaupt einen Wert? */
export function istGesetzt(e: Feldeingabe | undefined): boolean {
  return !!e && (!!e.leer || !!e.von?.trim() || !!e.bis?.trim() || !!e.werte?.some((w) => w.trim()));
}

/* ---------- Schnellwahl für Datumsfelder ---------- */

export const ZEITRAEUME = {
  diesesJahr: 'dieses Jahr',
  letztesJahr: 'letztes Jahr',
  zwoelfMonate: 'letzte 12 Monate',
  dieserMonat: 'dieser Monat',
  letzterMonat: 'letzter Monat',
} as const;
export type Zeitraum = keyof typeof ZEITRAEUME;

/** Von–bis zu einer Schnellwahl, bezogen auf heute (JJJJ-MM-TT). */
export function zeitraumVon(z: Zeitraum, heute: string): [string, string] {
  const [j, m] = heute.split('-').map(Number);
  const monat = (versatz: number): [string, string] => {
    const a = new Date(Date.UTC(j, m - 1 + versatz, 1));
    const e = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0));
    return [a.toISOString().slice(0, 10), e.toISOString().slice(0, 10)];
  };
  switch (z) {
    case 'diesesJahr': return [`${j}-01-01`, `${j}-12-31`];
    case 'letztesJahr': return [`${j - 1}-01-01`, `${j - 1}-12-31`];
    case 'zwoelfMonate': return [verschiebe(verschiebe(heute, -12, 'monate'), 1), heute];
    case 'dieserMonat': return monat(0);
    case 'letzterMonat': return monat(-1);
  }
}

/* ---------- Adresse ↔ Formular ---------- */

export type Suchparameter = Iterable<[string, string]>;

/** Liest die Adresse in ein Formular; was nicht passt, merkt erst `abfrageAus`. */
export function liesSuche(parameter: Suchparameter): Suchformular {
  const f = leeresFormular();
  const orte: string[] = [];
  let ortGesetzt = false;
  for (const [k, roh] of parameter) {
    const w = roh.trim();
    if (k === 'typ') { for (const t of w.split(',').map((x) => x.trim()).filter(Boolean)) if (!f.typen.includes(t)) f.typen.push(t); continue; }
    if (k === 'volltext') { f.volltext = w.slice(0, 200); continue; }
    if (k === 'in') { ortGesetzt = true; orte.push(...w.toLowerCase().split(',')); continue; }
    if (k === 'sortierung') continue;
    const punkt = k.lastIndexOf('.');
    const [key, zusatz] = punkt > 0 ? [k.slice(0, punkt), k.slice(punkt + 1).toLowerCase()] : [k, ''];
    if (!key) continue;
    const e = (f.felder[key] ??= {});
    if (zusatz === 'von') e.von = w;
    else if (zusatz === 'bis') e.bis = w;
    else if (zusatz === 'leer') { if (w !== '0') e.leer = 'leer'; }
    else if (zusatz === 'nichtleer') { if (w !== '0') e.leer = 'nichtLeer'; }
    else if (zusatz === '' || zusatz === 'wert') { if (w) (e.werte ??= []).push(w.slice(0, 500)); }
  }
  if (ortGesetzt) { f.inDokumenten = orte.includes('dokumente'); f.inNotizen = orte.includes('notizen'); }
  for (const [k, e] of Object.entries(f.felder)) if (!istGesetzt(e)) delete f.felder[k];
  return f;
}

/** Formular → Parameter der Adresse (ohne „?“); leere Felder fallen weg. */
export function alsParameter(f: Suchformular): URLSearchParams {
  const p = new URLSearchParams();
  for (const t of f.typen) p.append('typ', t);
  for (const [key, e] of Object.entries(f.felder)) {
    if (!istGesetzt(e)) continue;
    const name = (SUCHE_PARAMETER as readonly string[]).includes(key) || key === 'sortierung' ? `${key}.wert` : key;
    if (e.leer) { p.append(`${key}.${e.leer === 'leer' ? 'leer' : 'nichtleer'}`, '1'); continue; }
    if (e.von?.trim()) p.append(`${key}.von`, e.von.trim());
    if (e.bis?.trim()) p.append(`${key}.bis`, e.bis.trim());
    for (const w of e.werte ?? []) if (w.trim()) p.append(name, w.trim());
  }
  if (f.volltext.trim()) {
    p.append('volltext', f.volltext.trim());
    if (f.inDokumenten) p.append('in', 'dokumente');
    if (f.inNotizen) p.append('in', 'notizen');
    if (!f.inDokumenten && !f.inNotizen) p.append('in', '');
  }
  return p;
}

/* ---------- Formular → Bedingungen ---------- */

/** Datum als JJJJ-MM-TT oder TT.MM.JJJJ; null = kein gültiges Datum. */
export function datumAus(s: string): string | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  let j: number, mo: number, t: number;
  if (m) [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim()))) [t, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else return null;
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
  return d.toISOString().slice(0, 10);
}
/** Zahl mit Komma oder Punkt; „1.234,50“ geht auch. */
export function zahlAus(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(norm)) return null;
  return Number(norm);
}

/** Offene Grenzen: „nur von“ bzw. „nur bis“ als „zwischen“ mit sehr weiter zweiter Grenze. */
const DATUM_MIN = '0001-01-01', DATUM_MAX = '9999-12-31';
const ZAHL_MAX = 1e15;

export interface Volltextfilter { text: string; dokumente: boolean; notizen: boolean }
export interface Abfrage {
  typen: Mappentyp[];
  bedingungen: Bedingung[];
  volltext: Volltextfilter | null;
  /** Felder mit Wert, die es bei den gewählten Typen nicht (gemeinsam) gibt – sie gelten nicht. */
  entfallen: string[];
  /** Ungültige Eingaben, z. B. kein Datum. */
  fehler: string[];
}

/** Bedingungen aus dem Formular; zwischen Feldern UND, in einem Feld ODER. */
export function abfrageAus(f: Suchformular, alleTypen: Mappentyp[]): Abfrage {
  const fehler: string[] = [];
  const typen: Mappentyp[] = [];
  for (const name of f.typen) {
    const t = typImLink(name, alleTypen);
    if (!t) fehler.push(`Den Mappentyp „${name}“ gibt es nicht.`);
    else if (!typen.includes(t)) typen.push(t);
  }
  const felder = suchfelder(typen);
  const bedingungen: Bedingung[] = [];
  const entfallen: string[] = [];
  for (const [key, e] of Object.entries(f.felder)) {
    if (!istGesetzt(e)) continue;
    const feld = felder.find((x) => x.key === key);
    if (!feld) { entfallen.push(key); continue; }
    const art = eingabeart(feld)!;
    const name = `„${feld.label}“`;
    let b: Bedingung | null = null;
    if (e.leer) {
      if (!kannLeer(feld, e.leer)) { fehler.push(`${name} kann nicht ${e.leer === 'leer' ? 'leer' : 'nicht leer'} sein.`); continue; }
      b = { art: 'feld', feld: key, op: e.leer };
    } else if (art === 'datum' || art === 'zahl') {
      const lies = (s: string | undefined) => {
        if (!s?.trim()) return undefined;
        const v = art === 'datum' ? datumAus(s) : zahlAus(s);
        if (v === null) fehler.push(`„${s.trim()}“ ist ${art === 'datum' ? 'kein Datum' : 'keine Zahl'} für ${name}.`);
        return v;
      };
      const von = lies(e.von), bis = lies(e.bis);
      if (von === null || bis === null) continue;
      if (von === undefined && bis === undefined) continue;
      const min = art === 'datum' ? DATUM_MIN : -ZAHL_MAX, max = art === 'datum' ? DATUM_MAX : ZAHL_MAX;
      if (von !== undefined && bis !== undefined && von > bis) { fehler.push(`Bei ${name} liegt „von“ nach „bis“.`); continue; }
      b = { art: 'feld', feld: key, op: 'zwischen', wert: { art: 'fest', wert: von ?? min }, bis: { art: 'fest', wert: bis ?? max } };
    } else {
      const werte = [...new Set((e.werte ?? []).map((w) => w.trim()).filter(Boolean))];
      if (!werte.length) continue;
      if (art === 'verweis' || art === 'person') b = { art: 'feld', feld: key, op: 'zeigtAuf', wert: { art: 'fest', wert: werte } };
      else if (art === 'auswahl') {
        const optionen = feld.feld?.optionen ?? [];
        const gueltig = werte.map((w) => optionen.find((o) => o.toLowerCase() === w.toLowerCase())).filter((o): o is string => !!o);
        const falsch = werte.filter((w) => !optionen.some((o) => o.toLowerCase() === w.toLowerCase()));
        if (falsch.length) { fehler.push(`„${falsch[0]}“ gibt es in der Auswahlliste ${name} nicht.`); continue; }
        b = { art: 'feld', feld: key, op: 'einerVon', wert: { art: 'fest', wert: gueltig } };
      } else if (art === 'janein') {
        const w = werte[0].toLowerCase();
        if (!['ja', 'nein'].includes(w)) { fehler.push(`Bei ${name} geht nur ja oder nein.`); continue; }
        b = { art: 'feld', feld: key, op: w as 'ja' | 'nein' };
      } else b = { art: 'feld', feld: key, op: 'enthaelt', wert: { art: 'fest', wert: werte[0] } };
    }
    const problem = bedingungsProblem(b, typen);
    if (problem) { fehler.push(problem); continue; }
    bedingungen.push(b);
  }
  const text = f.volltext.trim();
  const volltext = text && (f.inDokumenten || f.inNotizen) ? { text, dokumente: f.inDokumenten, notizen: f.inNotizen } : null;
  return { typen, bedingungen, volltext, entfallen, fehler };
}

/* ---------- Chips über der Trefferliste ---------- */

const zahlText = (s: string, betrag: boolean) => {
  const n = zahlAus(s);
  return n === null ? s : n.toLocaleString('de-DE', betrag ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});
};
const datumText = (s: string) => { const d = datumAus(s); return d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : s; };

export interface Chip { key: string; text: string }

/** Je wirksamer Bedingung ein Chip, z. B. „Rechnungsdatum 01.03.2025–30.11.2025“. */
export function chipsVon(f: Suchformular, alleTypen: Mappentyp[], titelVon: (id: string) => string, person: (id: string) => string): Chip[] {
  const a = abfrageAus(f, alleTypen);
  const felder = suchfelder(a.typen);
  const chips: Chip[] = [];
  if (a.typen.length) chips.push({ key: 'typ', text: a.typen.map((t) => t.name).join(' oder ') });
  for (const [key, e] of Object.entries(f.felder)) {
    const feld = felder.find((x) => x.key === key);
    if (!feld || !istGesetzt(e)) continue;
    const art = eingabeart(feld);
    let text: string;
    if (e.leer) text = `${feld.label} ${e.leer === 'leer' ? 'ist leer' : 'ist nicht leer'}`;
    else if (art === 'datum' || art === 'zahl') {
      const z = (s: string) => (art === 'datum' ? datumText(s) : zahlText(s, feld.art === 'betrag'));
      const von = e.von?.trim(), bis = e.bis?.trim();
      text = `${feld.label} ${von && bis ? `${z(von)}–${z(bis)}` : von ? `ab ${z(von)}` : `bis ${z(bis!)}`}`;
    } else {
      const werte = (e.werte ?? []).filter((w) => w.trim());
      const namen = art === 'verweis' ? werte.map(titelVon) : art === 'person' ? werte.map(person) : werte;
      text = art === 'text' ? `${feld.label} enthält „${werte[0]}“` : `${feld.label}: ${namen.join(', ')}`;
    }
    chips.push({ key, text });
  }
  if (a.volltext) chips.push({ key: 'volltext', text: `„${a.volltext.text}“ in ${[a.volltext.dokumente && 'Dokumenten', a.volltext.notizen && 'Notizen'].filter(Boolean).join(' oder ')}` });
  return chips;
}

/** Formular ohne die Bedingung eines Chips. */
export function ohneChip(f: Suchformular, key: string): Suchformular {
  if (key === 'typ') return { ...f, typen: [] };
  if (key === 'volltext') return { ...f, volltext: '' };
  const felder = { ...f.felder };
  delete felder[key];
  return { ...f, felder };
}
