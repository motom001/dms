/**
 * Erweiterte Suche (#199): Mappentypen wählen, in ihren gemeinsamen Feldern gezielt suchen und mit
 * einem Volltext in Dokumenten und Notizen kombinieren. Die Suche steht in der Adresse, z. B.
 *
 *   /ablage/suche?typ=rechnung&rechnungsdatum.von=2025-03-01&rechnungsdatum.bis=2025-11-30
 *     &vertragspartner=<Id>&vertragspartner=<Id>&volltext=Backofen&in=dokumente&in=notizen
 *
 * - typ: Schlüssel (oder Name) eines Mappentyps, mehrfach; ohne = alle lesbaren Typen, nur Systemfelder
 * - feld.von / feld.bis: Datum, Zahl, Betrag, Prozent, Zeitraum („3 Monate“ oder P3M; eins darf fehlen)
 * - feld=wert: mehrfach bei Verweisen und Auswahllisten (= ist einer von); Ja/Nein: ja oder nein; Text: enthält
 * - feld.leer=1 bzw. feld.nichtleer=1
 * - feld.typ=<Mappentyp>: Verweis mit mehreren Zieltypen (#1036) zeigt auf eine Mappe dieses Typs, mehrfach (= einer von)
 * - volltext=…, in=dokumente / in=notizen (ohne „in“: beide)
 * Zwischen den Feldern gilt UND, innerhalb eines Feldes ODER. Server und Oberfläche teilen diese Datei.
 */
import { wertZuOption } from './beschriftung';
import { typImLink } from './direktlink';
import type { Mappentyp } from './model';
import { bedingungsfelder, bedingungsProblem, OPERATOREN_JE_ART, verschiebe, type Bedingung, type Bedingungsfeld } from './sichten';
import { t } from './texte';
import { gebietsschema } from './sprache';
import { leseProzent, leseZeitraum, prozentText, ZEITRAUM_ANZAHL_MAX, zeitraumIso, zeitraumTage, zeitraumText } from './feldarten';

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
  /** Verweis mit mehreren Zieltypen (#1036): zeigt auf eine Mappe eines dieser Typen (Schlüssel, Name oder Id). */
  typen?: string[];
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
export type Eingabeart = 'datum' | 'zahl' | 'zeitraum' | 'verweis' | 'person' | 'auswahl' | 'janein' | 'text';
export function eingabeart(f: Bedingungsfeld): Eingabeart | null {
  switch (f.art) {
    case 'datum': case 'zeit': return 'datum';
    case 'zahl': case 'betrag': case 'prozent': return 'zahl';
    // Zeitraum (#1035): von–bis als Text („1 Monat“ – „6 Monate“), verglichen in Tagen.
    case 'zeitraum': return 'zeitraum';
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
  return !!e && (!!e.leer || !!e.von?.trim() || !!e.bis?.trim() || !!e.werte?.some((w) => w.trim()) || !!e.typen?.some((w) => w.trim()));
}

/* ---------- Schnellwahl für Datumsfelder ---------- */

export const ZEITRAEUME = {
  diesesJahr: t('gemeinsam.erweitertesuche.dieses-jahr'),
  letztesJahr: t('gemeinsam.erweitertesuche.letztes-jahr'),
  zwoelfMonate: t('gemeinsam.erweitertesuche.letzte-12-monate'),
  dieserMonat: t('gemeinsam.erweitertesuche.dieser-monat'),
  letzterMonat: t('gemeinsam.erweitertesuche.letzter-monat'),
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

/** Parameternamen, die nie als Feldschlüssel gelten (Schutz vor Prototype Pollution, #292). */
const VERBOTENE_NAMEN = new Set(['__proto__', 'constructor', 'prototype']);

export type Suchparameter = Iterable<[string, string]>;

/** Ein Parameter „feld.zusatz=w“ in die Eingabe des Felds. */
function setzeZusatz(e: Feldeingabe, zusatz: string, w: string) {
  if (zusatz === 'von') e.von = w;
  else if (zusatz === 'bis') e.bis = w;
  else if (zusatz === 'leer') { if (w !== '0') e.leer = 'leer'; }
  else if (zusatz === 'nichtleer') { if (w !== '0') e.leer = 'nichtLeer'; }
  // Verweis mit mehreren Zieltypen (#1036): „feld.typ=…“, jeder einmal.
  else if (zusatz === 'typ') { if (w && !(e.typen ??= []).includes(w)) e.typen.push(w.slice(0, 200)); }
  else if (zusatz === '' || zusatz === 'wert') { if (w) (e.werte ??= []).push(w.slice(0, 500)); }
}

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
    // Namen aus der Adresse nie als Eigenschaften von Object.prototype benutzen (#292).
    if (!key || VERBOTENE_NAMEN.has(key)) continue;
    setzeZusatz(Object.hasOwn(f.felder, key) ? f.felder[key] : (f.felder[key] = {}), zusatz, w);
  }
  if (ortGesetzt) { f.inDokumenten = orte.includes('dokumente'); f.inNotizen = orte.includes('notizen'); }
  for (const [k, e] of Object.entries(f.felder)) if (!istGesetzt(e)) delete f.felder[k];
  return f;
}

/** Nicht leere Werte einer Liste als Parameter `name` anhängen. */
function haengeAn(p: URLSearchParams, name: string, werte: string[] | undefined) {
  for (const w of werte ?? []) if (w.trim()) p.append(name, w.trim());
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
    haengeAn(p, name, e.werte);
    haengeAn(p, `${key}.typ`, e.typen);
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
    const eintrag = typImLink(name, alleTypen);
    if (!eintrag) fehler.push(t('gemeinsam.erweitertesuche.den-mappentyp-gibt-es', { name }));
    else if (!typen.includes(eintrag)) typen.push(eintrag);
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
      if (!kannLeer(feld, e.leer)) { fehler.push(t('gemeinsam.erweitertesuche.kann-nicht-sein', { name, wert: e.leer === 'leer' ? t('gemeinsam.erweitertesuche.leer') : t('gemeinsam.erweitertesuche.nicht-leer') })); continue; }
      b = { art: 'feld', feld: key, op: e.leer };
    } else if (art === 'zeitraum') {
      b = zeitraumBedingung(key, feld.label, e, fehler); if (!b) continue;
    } else if (art === 'datum' || art === 'zahl') {
      const lies = (s: string | undefined) => {
        if (!s?.trim()) return undefined;
        const v = art === 'datum' ? datumAus(s) : feld.art === 'prozent' ? prozentAus(s) : zahlAus(s);
        if (v === null) fehler.push(t('gemeinsam.erweitertesuche.ist-fuer', { s: s.trim(), wert: art === 'datum' ? t('gemeinsam.erweitertesuche.kein-datum') : t('gemeinsam.erweitertesuche.keine-zahl'), name }));
        return v;
      };
      const von = lies(e.von), bis = lies(e.bis);
      if (von === null || bis === null) continue;
      if (von === undefined && bis === undefined) continue;
      const min = art === 'datum' ? DATUM_MIN : -ZAHL_MAX, max = art === 'datum' ? DATUM_MAX : ZAHL_MAX;
      if (von !== undefined && bis !== undefined && von > bis) { fehler.push(t('gemeinsam.erweitertesuche.bei-liegt-von-nach', { name })); continue; }
      b = { art: 'feld', feld: key, op: 'zwischen', wert: { art: 'fest', wert: von ?? min }, bis: { art: 'fest', wert: bis ?? max } };
    } else {
      const r = werteBedingung(key, feld, art, e.werte ?? [], name);
      if (typeof r === 'string') { fehler.push(r); continue; }
      b = r;
    }
    // Verweis mit mehreren Zieltypen (#1036): „zeigt auf eine Mappe vom Typ …“ als weitere Bedingung (UND).
    if (!e.leer && art === 'verweis' && e.typen?.length) {
      const tb = zieltypBedingung(key, e.typen, typen, alleTypen);
      if (typeof tb === 'string') { fehler.push(tb); continue; }
      if (tb) bedingungen.push(tb);
    }
    if (!b) continue;
    const problem = bedingungsProblem(b, typen);
    if (problem) { fehler.push(problem); continue; }
    bedingungen.push(b);
  }
  const text = f.volltext.trim();
  const volltext = text && (f.inDokumenten || f.inNotizen) ? { text, dokumente: f.inDokumenten, notizen: f.inNotizen } : null;
  return { typen, bedingungen, volltext, entfallen, fehler };
}

/** Verweis, Person, Auswahl, Ja/Nein und Text: die Werte als Bedingung; ein Text ist ein Fehler, null = keine Werte. */
function werteBedingung(key: string, feld: Bedingungsfeld, art: Eingabeart, roh: string[], name: string): Bedingung | string | null {
  const werte = [...new Set(roh.map((w) => w.trim()).filter(Boolean))];
  if (!werte.length) return null;
  if (art === 'verweis' || art === 'person') return { art: 'feld', feld: key, op: 'zeigtAuf', wert: { art: 'fest', wert: werte } };
  if (art === 'auswahl') {
    // Fester Wert oder seine Beschriftung (#728) – gesucht wird immer mit dem festen Wert.
    const f = feld.feld ?? { optionen: [] };
    const falsch = werte.filter((w) => !wertZuOption(f, w));
    if (falsch.length) return t('gemeinsam.erweitertesuche.gibt-es-in-der', { falsch: falsch[0], name });
    return { art: 'feld', feld: key, op: 'einerVon', wert: { art: 'fest', wert: werte.map((w) => wertZuOption(f, w)!) } };
  }
  if (art === 'janein') {
    const w = werte[0].toLowerCase();
    return ['ja', 'nein'].includes(w) ? { art: 'feld', feld: key, op: w as 'ja' | 'nein' } : t('gemeinsam.erweitertesuche.bei-geht-nur-ja', { name });
  }
  return { art: 'feld', feld: key, op: 'enthaelt', wert: { art: 'fest', wert: werte[0] } };
}

/** „feld.typ=…“ (#1036) → Bedingung „zeigt auf Mappe vom Typ …“; ein Text ist ein Fehler, null = nichts gewählt. */
function zieltypBedingung(key: string, eingabe: string[], typen: Mappentyp[], alleTypen: Mappentyp[]): Bedingung | string | null {
  const wahl = [...new Set(eingabe.map((w) => w.trim()).filter(Boolean))];
  if (!wahl.length) return null;
  const ids = wahl.map((w) => typImLink(w, alleTypen)?.id);
  const fehlt = ids.findIndex((x) => !x);
  if (fehlt >= 0) return t('gemeinsam.erweitertesuche.den-mappentyp-gibt-es', { name: wahl[fehlt] });
  const b: Bedingung = { art: 'feld', feld: key, op: 'zeigtAufTyp', wert: { art: 'fest', wert: ids as string[] } };
  return bedingungsProblem(b, typen) ?? b;
}

/** „(vom Typ …)“ für den Chip eines Verweisfelds mit Typwahl (#1036). */
function typText(e: Feldeingabe, alleTypen: Mappentyp[]): string {
  const typen = (e.typen ?? []).map((w) => typImLink(w, alleTypen)?.name ?? w);
  return typen.length ? t('gemeinsam.erweitertesuche.vom-typ', { typen: typen.join(', ') }) : '';
}

/** Prozent (#1035) wie eine Zahl, „7 %“ geht auch; null = keine Zahl. */
function prozentAus(s: string): number | null {
  const n = leseProzent(s);
  return n === null || Number.isNaN(n) ? null : n;
}

/** Zeitraum von–bis (#1035) als „zwischen“ mit P3M-Werten; offene Grenze 0 Tage bzw. 9999 Jahre. null = gilt nicht. */
function zeitraumBedingung(key: string, label: string, e: Feldeingabe, fehler: string[]): Bedingung | null {
  const lies = (s: string | undefined) => {
    if (!s?.trim()) return undefined;
    const z = leseZeitraum(s);
    if (!z) fehler.push(t('gemeinsam.feldarten.bedingung-zeitraum', { label }));
    return z ?? null;
  };
  const von = lies(e.von), bis = lies(e.bis);
  if (von === null || bis === null || (von === undefined && bis === undefined)) return null;
  if (von && bis && zeitraumTage(von) > zeitraumTage(bis)) { fehler.push(t('gemeinsam.erweitertesuche.bei-liegt-von-nach', { name: `„${label}“` })); return null; }
  return { art: 'feld', feld: key, op: 'zwischen', wert: { art: 'fest', wert: von ? zeitraumIso(von) : 'P0D' }, bis: { art: 'fest', wert: bis ? zeitraumIso(bis) : `P${ZEITRAUM_ANZAHL_MAX}Y` } };
}

/* ---------- Chips über der Trefferliste ---------- */

const zahlText = (s: string, betrag: boolean) => {
  const n = zahlAus(s);
  return n === null ? s : n.toLocaleString(gebietsschema(), betrag ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});
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
    if (e.leer) text = `${feld.label} ${e.leer === 'leer' ? t('gemeinsam.erweitertesuche.ist-leer') : t('gemeinsam.erweitertesuche.ist-nicht-leer')}`;
    else if (art === 'datum' || art === 'zahl' || art === 'zeitraum') {
      const z = (s: string) => (art === 'datum' ? datumText(s) : art === 'zeitraum' ? (() => { const x = leseZeitraum(s); return x ? zeitraumText(x) : s; })()
        : feld.art === 'prozent' ? (() => { const n = leseProzent(s); return n === null || Number.isNaN(n) ? s : prozentText(n); })() : zahlText(s, feld.art === 'betrag'));
      const von = e.von?.trim(), bis = e.bis?.trim();
      text = `${feld.label} ${von && bis ? `${z(von)}–${z(bis)}` : von ? `ab ${z(von)}` : `bis ${z(bis!)}`}`;
    } else {
      const werte = (e.werte ?? []).filter((w) => w.trim());
      const namen = art === 'verweis' ? werte.map(titelVon) : art === 'person' ? werte.map(person) : werte;
      // Mehrere Zieltypen (#1036): „vom Typ …“ dazu.
      text = art === 'text' ? `${feld.label} enthält „${werte[0]}“` : [namen.length ? `${feld.label}: ${namen.join(', ')}` : feld.label, art === 'verweis' ? typText(e, alleTypen) : ''].filter(Boolean).join(' ');
    }
    chips.push({ key, text });
  }
  if (a.volltext) chips.push({ key: 'volltext', text: t('gemeinsam.erweitertesuche.in', { text: a.volltext.text, filter: [a.volltext.dokumente && 'Dokumenten', a.volltext.notizen && 'Notizen'].filter(Boolean).join(' oder ') }) });
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
