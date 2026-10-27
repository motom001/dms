/**
 * Gemeinsames Fachmodell für Server und Weboberfläche.
 *
 * Ein Mappentyp definiert Felder. Eine Mappe ist eine Instanz eines
 * Mappentyps und speichert ihre Werte je Feldschlüssel.
 * Die Prüfregeln hier gelten auf beiden Seiten: die Oberfläche zeigt
 * Fehler früh an, der Server lässt nichts Ungültiges in die Datenbank.
 */

export const FELDTYPEN = {
  text: 'Text',
  langtext: 'Langtext',
  zahl: 'Zahl',
  betrag: 'Betrag',
  datum: 'Datum',
  janein: 'Ja/Nein',
  auswahl: 'Auswahlliste',
  referenz: 'Referenz',
} as const;
export type Feldtyp = keyof typeof FELDTYPEN;

export const VERWEISARTEN = {
  zugehoerigkeit: 'Zugehörigkeit',
  bezug: 'Bezug',
} as const;
export type Verweisart = keyof typeof VERWEISARTEN;

export interface Feld {
  /** Fester Schlüssel, unter dem Werte gespeichert werden. */
  key: string;
  label: string;
  typ: Feldtyp;
  pflicht?: boolean;
  /** Wert darf je Mappentyp nur einmal vorkommen (Text, Zahl). */
  eindeutig?: boolean;
  hilfe?: string;
  standard?: string | boolean | null;
  minLen?: number | null;
  maxLen?: number | null;
  /** Regulärer Ausdruck, muss den ganzen Text treffen. */
  muster?: string;
  min?: number | null;
  max?: number | null;
  nachkomma?: number | null;
  waehrung?: string;
  optionen?: string[];
  mehrfach?: boolean;
  /** Referenz: Id des Ziel-Mappentyps (darf der eigene sein → Hierarchie). */
  zielTyp?: string;
  verweisart?: Verweisart;
}

export interface MappentypDaten {
  name: string;
  beschreibung: string;
  /** Schlüssel des Feldes, das eine Mappe benennt; leer = erstes Textfeld. */
  titelFeld: string;
  felder: Feld[];
}
export interface Mappentyp extends MappentypDaten {
  id: string;
  erstellt: string;
  geaendert: string;
}

export interface Betrag { betrag: number; waehrung: string }
export type Wert = string | number | boolean | Betrag | string[] | null;
export type Werte = Record<string, Wert>;

export interface Mappe {
  id: string;
  typId: string;
  werte: Werte;
  erstellt: string;
  geaendert: string;
}

/** Ergebnis einer Prüfung: allgemeine Meldungen und Meldungen je Feld. */
export interface Pruefergebnis {
  allgemein: string[];
  /** Mappen: je Feldschlüssel. Mappentypen: je Feldposition. */
  felder: Record<string, string[]>;
}
export const istOk = (p: Pruefergebnis) => p.allgemein.length === 0 && Object.keys(p.felder).length === 0;

/* ---------------------------------------------------------------- */

export const SCHLUESSEL_MUSTER = /^[a-z][a-z0-9_]{0,39}$/;

export function istLeer(v: unknown): boolean {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && 'betrag' in (v as object)) {
    const b = (v as Betrag).betrag;
    return b == null || (b as unknown) === '';
  }
  return false;
}

/** Prüft die Definition eines Mappentyps. */
export function pruefeMappentyp(
  t: MappentypDaten,
  ctx: { eigeneId?: string; namenAndererTypen: string[]; existiertTyp: (id: string) => boolean },
): Pruefergebnis {
  const p: Pruefergebnis = { allgemein: [], felder: {} };
  const name = (t.name ?? '').trim();
  if (!name) p.allgemein.push('Der Mappentyp braucht einen Namen.');
  else if (ctx.namenAndererTypen.some((n) => n.trim().toLowerCase() === name.toLowerCase()))
    p.allgemein.push(`Es gibt bereits einen Mappentyp „${name}“.`);
  if (!Array.isArray(t.felder)) {
    p.allgemein.push('Die Felder fehlen.');
    return p;
  }
  if (t.titelFeld && !t.felder.some((f) => f.key === t.titelFeld))
    p.allgemein.push('Das Titelfeld gibt es nicht.');

  const gesehen = new Set<string>();
  t.felder.forEach((f, i) => {
    const m: string[] = [];
    if (!(f.label ?? '').trim()) m.push('Bezeichnung fehlt.');
    if (!(f.typ in FELDTYPEN)) m.push('Unbekannter Datentyp.');
    if (!SCHLUESSEL_MUSTER.test(f.key ?? '')) m.push('Schlüssel: nur Kleinbuchstaben, Ziffern und _, beginnt mit einem Buchstaben.');
    else if (gesehen.has(f.key)) m.push(`Schlüssel „${f.key}“ kommt doppelt vor.`);
    gesehen.add(f.key);
    if (f.typ === 'referenz') {
      if (!f.zielTyp) m.push('Ziel-Mappentyp auswählen.');
      else if (f.zielTyp !== ctx.eigeneId && !ctx.existiertTyp(f.zielTyp)) m.push('Der Ziel-Mappentyp existiert nicht.');
    }
    if (f.typ === 'auswahl' && !(f.optionen ?? []).length) m.push('Mindestens einen Auswahlwert eintragen.');
    if ((f.typ === 'text' || f.typ === 'langtext') && f.minLen != null && f.maxLen != null && f.minLen > f.maxLen)
      m.push('Mindestlänge ist größer als Höchstlänge.');
    if ((f.typ === 'zahl' || f.typ === 'betrag') && f.min != null && f.max != null && f.min > f.max)
      m.push('Minimum ist größer als Maximum.');
    if (f.typ === 'text' && f.muster) {
      try { new RegExp(f.muster); } catch { m.push('Das Muster ist kein gültiger regulärer Ausdruck.'); }
    }
    if (m.length) p.felder[String(i)] = m;
  });
  return p;
}

export interface MappenKontext {
  /** Typ-Id der Mappe mit dieser Id, oder undefined, wenn es sie nicht gibt. */
  typVon: (mappeId: string) => string | undefined;
  /** Titel einer anderen Mappe desselben Typs mit gleichem Wert, sonst undefined. */
  doppelt: (feldKey: string, wert: string | number) => string | undefined;
}

/** Prüft die Werte einer Mappe gegen die aktuelle Definition ihres Typs. */
export function pruefeMappe(t: Pick<Mappentyp, 'felder'>, werte: Werte, ctx: MappenKontext): Pruefergebnis {
  const p: Pruefergebnis = { allgemein: [], felder: {} };
  const fehler = (k: string, msg: string) => { p.felder[k] = [msg]; };

  for (const f of t.felder) {
    const v = werte?.[f.key];
    if (istLeer(v)) {
      if (f.pflicht && f.typ !== 'janein') fehler(f.key, 'Pflichtfeld – bitte ausfüllen.');
      continue;
    }
    switch (f.typ) {
      case 'text':
      case 'langtext': {
        if (typeof v !== 'string') { fehler(f.key, 'Text erwartet.'); break; }
        if (f.minLen != null && v.length < f.minLen) fehler(f.key, `Mindestens ${f.minLen} Zeichen.`);
        else if (f.maxLen != null && v.length > f.maxLen) fehler(f.key, `Höchstens ${f.maxLen} Zeichen.`);
        else if (f.typ === 'text' && f.muster) {
          try { if (!new RegExp('^(?:' + f.muster + ')$').test(v)) fehler(f.key, 'Passt nicht zum vorgegebenen Muster.'); } catch { /* Definition prüft das */ }
        }
        break;
      }
      case 'zahl':
      case 'betrag': {
        const x = f.typ === 'betrag' ? (v as Betrag)?.betrag : v;
        if (typeof x !== 'number' || !Number.isFinite(x)) { fehler(f.key, f.typ === 'betrag' ? 'Kein gültiger Betrag.' : 'Keine gültige Zahl.'); break; }
        if (f.min != null && x < f.min) fehler(f.key, `Mindestens ${f.min.toLocaleString('de-DE')}.`);
        else if (f.max != null && x > f.max) fehler(f.key, `Höchstens ${f.max.toLocaleString('de-DE')}.`);
        else if (f.typ === 'zahl' && f.nachkomma != null && (String(x).split('.')[1] ?? '').length > f.nachkomma)
          fehler(f.key, `Höchstens ${f.nachkomma} Nachkommastellen.`);
        if (f.typ === 'betrag' && !p.felder[f.key] && !/^[A-Z]{3}$/.test((v as Betrag).waehrung ?? ''))
          fehler(f.key, 'Währung als dreistelliger Code, z. B. EUR.');
        break;
      }
      case 'datum':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) fehler(f.key, 'Kein gültiges Datum.');
        break;
      case 'janein':
        if (typeof v !== 'boolean') fehler(f.key, 'Ja oder Nein erwartet.');
        break;
      case 'auswahl': {
        const liste = Array.isArray(v) ? v : [v];
        if (!f.mehrfach && Array.isArray(v)) { fehler(f.key, 'Nur ein Wert erlaubt.'); break; }
        const falsch = liste.filter((x) => !(f.optionen ?? []).includes(String(x)));
        if (falsch.length) fehler(f.key, `Nicht in der Auswahlliste: ${falsch.join(', ')}.`);
        break;
      }
      case 'referenz': {
        const ids = Array.isArray(v) ? v : [v];
        if (!f.mehrfach && Array.isArray(v)) { fehler(f.key, 'Nur ein Verweis erlaubt.'); break; }
        if (ids.some((id) => typeof id !== 'string' || ctx.typVon(id) === undefined)) fehler(f.key, 'Verweist auf eine Mappe, die es nicht gibt.');
        else if (ids.some((id) => ctx.typVon(id as string) !== f.zielTyp)) fehler(f.key, 'Verweist auf eine Mappe eines anderen Typs.');
        break;
      }
    }
    if (!p.felder[f.key] && f.eindeutig && (f.typ === 'text' || f.typ === 'zahl')) {
      const titel = ctx.doppelt(f.key, v as string | number);
      if (titel !== undefined) fehler(f.key, `Bereits vergeben in „${titel}“.`);
    }
  }
  return p;
}

/** Alle Verweise einer Mappe: [feldKey, zielId] je Referenzwert. */
export function verweiseVon(t: Pick<Mappentyp, 'felder'>, werte: Werte): Array<{ feldKey: string; zielId: string }> {
  const out: Array<{ feldKey: string; zielId: string }> = [];
  for (const f of t.felder) {
    if (f.typ !== 'referenz') continue;
    const v = werte?.[f.key];
    if (istLeer(v)) continue;
    for (const id of Array.isArray(v) ? v : [v]) if (typeof id === 'string') out.push({ feldKey: f.key, zielId: id });
  }
  return out;
}

/** Feld, das eine Mappe benennt. */
export function titelFeld(t: Pick<Mappentyp, 'felder' | 'titelFeld'> | undefined): Feld | undefined {
  if (!t) return undefined;
  return t.felder.find((f) => f.key === t.titelFeld) ?? t.felder.find((f) => f.typ === 'text');
}

/** Wert lesbar formatieren (deutsch). `titelVon` löst Referenzen auf. */
export function formatiere(f: Feld, v: Wert | undefined, titelVon: (id: string) => string = (id) => id): string {
  if (v == null || v === '') return '';
  switch (f.typ) {
    case 'betrag': {
      const b = v as Betrag;
      if (typeof b.betrag !== 'number') return '';
      try { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: b.waehrung || 'EUR' }).format(b.betrag); }
      catch { return `${b.betrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${b.waehrung}`; }
    }
    case 'datum': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
      return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v);
    }
    case 'janein': return v ? 'Ja' : 'Nein';
    case 'zahl': return typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: f.nachkomma ?? 10 }) : String(v);
    case 'auswahl': return Array.isArray(v) ? v.join(', ') : String(v);
    case 'referenz': return (Array.isArray(v) ? v : [String(v)]).map(titelVon).join(', ');
    default: return String(v);
  }
}

/** Zahl aus deutscher oder technischer Schreibweise lesen. null = leer, NaN = ungültig. */
export function leseZahl(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  let t = String(s).trim().replace(/\s/g, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isNaN(n) ? NaN : n;
}

/** Schlüssel aus einer Bezeichnung ableiten: „Kündigung bis“ → kuendigung_bis. */
export function schluesselAus(label: string): string {
  let k = String(label || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!k) k = 'feld';
  if (/^[0-9]/.test(k)) k = 'f_' + k;
  return k.slice(0, 40);
}
