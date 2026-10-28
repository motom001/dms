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

export const REGISTERARTEN = {
  felder: 'Feldregister',
  dokumente: 'Dokumentenregister',
  verknuepfungen: 'Verknüpfungsregister',
} as const;
export type Registerart = keyof typeof REGISTERARTEN;

/** Quelle eines Verknüpfungsregisters: Mappen vom Typ `typId`, die über `feldKey` hierher verweisen. */
export interface Quelle { typId: string; feldKey: string }

/** Ein Trennblatt an der Mappe. */
export interface Register {
  /** Fester Schlüssel (Dokumente merken sich ihr Register darüber). */
  key: string;
  name: string;
  art: Registerart;
  /** Feldregister: Schlüssel der Felder auf diesem Blatt. Jedes Feld liegt auf genau einem Feldregister. */
  felder?: string[];
  /** Verknüpfungsregister: welche Verweise es zeigt; leer = alle. */
  quellen?: Quelle[];
}

export interface MappentypDaten {
  name: string;
  beschreibung: string;
  /** Vorlage für den Titel einer Mappe, z. B. „{verwendungszweck} vom {zahlungsdatum}“. Leer = erstes Textfeld. */
  titelVorlage: string;
  felder: Feld[];
  register: Register[];
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
  /** Feste Indexwerte, unabhängig vom Mappentyp. */
  erstellt: string;
  erstelltVon: string | null;
  geaendert: string;
  geaendertVon: string | null;
  /** Mit dem Demo-Generator erzeugt; lässt sich gesammelt entfernen. */
  demo?: boolean;
  /** Vom Server aus der Titel-Vorlage berechnet und gespeichert (leer = ohne Titel). */
  titel?: string;
}

export type Rolle = 'admin' | 'mitglied';
export const ROLLEN: Record<Rolle, string> = { admin: 'Administrator', mitglied: 'Mitglied' };

export interface Benutzer {
  id: string;
  email: string;
  name: string;
  rolle: Rolle;
  aktiv: boolean;
  /** false, solange der Benutzer sein Passwort noch nicht über den Link gesetzt hat. */
  hatPasswort: boolean;
  erstellt: string;
  letzteAnmeldung: string | null;
}

export const PASSWORT_MINDESTLAENGE = 10;
export const istEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

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
export interface TypKontext {
  eigeneId?: string;
  namenAndererTypen: string[];
  existiertTyp: (id: string) => boolean;
  /** Felder eines anderen Typs (für Quellen von Verknüpfungsregistern). */
  felderVon?: (typId: string) => Feld[] | undefined;
}

function pruefeRegister(t: MappentypDaten, ctx: TypKontext, p: Pruefergebnis) {
  const reg = t.register ?? [];
  if (!reg.length) { p.allgemein.push('Der Mappentyp braucht mindestens ein Register.'); return; }
  const keys = new Set<string>();
  const feldAuf = new Map<string, string>();
  for (const r of reg) {
    const name = (r.name ?? '').trim() || r.key;
    if (!(r.name ?? '').trim()) p.allgemein.push('Jedes Register braucht einen Namen.');
    if (!SCHLUESSEL_MUSTER.test(r.key ?? '')) p.allgemein.push(`Register „${name}“: ungültiger Schlüssel.`);
    else if (keys.has(r.key)) p.allgemein.push(`Der Register-Schlüssel „${r.key}“ kommt doppelt vor.`);
    keys.add(r.key);
    if (!(r.art in REGISTERARTEN)) p.allgemein.push(`Register „${name}“: unbekannte Art.`);
    if (r.art === 'felder') {
      for (const k of r.felder ?? []) {
        if (feldAuf.has(k)) p.allgemein.push(`Das Feld „${t.felder.find((f) => f.key === k)?.label ?? k}“ liegt auf zwei Registern.`);
        feldAuf.set(k, r.key);
      }
    }
    if (r.art === 'verknuepfungen') {
      for (const q of r.quellen ?? []) {
        const felder = q.typId === ctx.eigeneId ? t.felder : ctx.felderVon?.(q.typId);
        const f = felder?.find((x) => x.key === q.feldKey);
        if (!f || f.typ !== 'referenz' || (f.zielTyp !== ctx.eigeneId)) p.allgemein.push(`Register „${name}“: Eine Quelle verweist nicht (mehr) auf diesen Mappentyp.`);
      }
    }
  }
  if (t.felder.length && !reg.some((r) => r.art === 'felder')) p.allgemein.push('Es gibt Felder, aber kein Feldregister.');
  const ohne = t.felder.filter((f) => !feldAuf.has(f.key));
  if (ohne.length && reg.some((r) => r.art === 'felder')) p.allgemein.push(`Diese Felder liegen auf keinem Register: ${ohne.map((f) => f.label || f.key).join(', ')}.`);
}

export function pruefeMappentyp(t: MappentypDaten, ctx: TypKontext): Pruefergebnis {
  const p: Pruefergebnis = { allgemein: [], felder: {} };
  const name = (t.name ?? '').trim();
  if (!name) p.allgemein.push('Der Mappentyp braucht einen Namen.');
  else if (ctx.namenAndererTypen.some((n) => n.trim().toLowerCase() === name.toLowerCase()))
    p.allgemein.push(`Es gibt bereits einen Mappentyp „${name}“.`);
  if (!Array.isArray(t.felder)) {
    p.allgemein.push('Die Felder fehlen.');
    return p;
  }
  const unbekannt = vorlageFelder(t.titelVorlage ?? '').filter((k) => !istIndexplatzhalter(k) && !t.felder.some((f) => f.key === k));
  if (unbekannt.length) p.allgemein.push(`Die Titel-Vorlage nennt unbekannte Felder: ${unbekannt.map((k) => `{${k}}`).join(', ')}.`);
  pruefeRegister(t, ctx, p);

  const gesehen = new Set<string>();
  t.felder.forEach((f, i) => {
    const m: string[] = [];
    if (!(f.label ?? '').trim()) m.push('Bezeichnung fehlt.');
    if (!(f.typ in FELDTYPEN)) m.push('Unbekannter Datentyp.');
    if (!SCHLUESSEL_MUSTER.test(f.key ?? '')) m.push('Schlüssel: nur Kleinbuchstaben, Ziffern und _, beginnt mit einem Buchstaben.');
    else if (gesehen.has(f.key)) m.push(`Schlüssel „${f.key}“ kommt doppelt vor.`);
    else if (istIndexplatzhalter(f.key)) m.push(`Schlüssel „${f.key}“ ist für den Indexwert „${INDEXPLATZHALTER[f.key as Indexplatzhalter]}“ reserviert.`);
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

const PLATZHALTER = /\{([a-z][a-z0-9_]*)\}/g;

/** Feste Indexwerte, die jede Titel-Vorlage zusätzlich zu den Feldern verwenden kann. */
export const INDEXPLATZHALTER = { angelegt: 'Angelegt', geaendert: 'Zuletzt geändert' } as const;
export type Indexplatzhalter = keyof typeof INDEXPLATZHALTER;
export const istIndexplatzhalter = (k: string): k is Indexplatzhalter => Object.prototype.hasOwnProperty.call(INDEXPLATZHALTER, k);
export type Indexwerte = Partial<Pick<Mappe, 'erstellt' | 'geaendert'>>;

/** Zeitzone für Datumsangaben aus Zeitstempeln (Server und Browser sollen denselben Tag zeigen). */
export const ZEITZONE = 'Europe/Berlin';
const TAG_FORMAT = new Intl.DateTimeFormat('de-DE', { timeZone: ZEITZONE, day: '2-digit', month: '2-digit', year: 'numeric' });

/** Tag eines Zeitstempels als TT.MM.JJJJ in der Zeitzone des Haushalts. */
export function tagVon(zeitstempel: string | undefined): string {
  if (!zeitstempel) return '';
  const d = new Date(zeitstempel);
  return Number.isNaN(d.getTime()) ? '' : TAG_FORMAT.format(d);
}

/** Feldschlüssel, die eine Titel-Vorlage verwendet. */
export function vorlageFelder(vorlage: string): string[] {
  return [...vorlage.matchAll(PLATZHALTER)].map((m) => m[1]);
}

/** Wirksame Vorlage: die eingestellte oder das erste Textfeld. */
export function wirksameVorlage(t: Pick<Mappentyp, 'felder' | 'titelVorlage'>): string {
  if (t.titelVorlage?.trim()) return t.titelVorlage;
  const f = t.felder.find((x) => x.typ === 'text');
  return f ? `{${f.key}}` : '';
}

/** Titel einer Mappe aus der Vorlage; Platzhalter werden formatiert eingesetzt. */
export function titelAus(t: Pick<Mappentyp, 'felder' | 'titelVorlage'> | undefined, werte: Werte, titelVon: (id: string) => string = (id) => id, index: Indexwerte = {}): string {
  if (!t) return '';
  return wirksameVorlage(t)
    .replace(PLATZHALTER, (_, k: string) => {
      if (k === 'angelegt') return tagVon(index.erstellt);
      if (k === 'geaendert') return tagVon(index.geaendert);
      const f = t.felder.find((x) => x.key === k);
      return f ? formatiere(f, werte[k], titelVon) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Register für einen neuen oder alten Mappentyp ohne Register. */
export function standardRegister(felder: Feld[]): Register[] {
  return [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: felder.map((f) => f.key) },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    { key: 'verknuepfungen', name: 'Verknüpfungen', art: 'verknuepfungen', quellen: [] },
  ];
}

/** Ein hochgeladenes Dokument in einem Dokumentenregister. */
export interface Dokument {
  id: string;
  mappeId: string;
  registerKey: string;
  name: string;
  mime: string;
  groesse: number;
  sha256: string;
  /** PDF oder Bild, das gefahrlos im Browser angezeigt werden kann. */
  anzeigbar: boolean;
  erstellt: string;
  erstelltVon: string | null;
}
export const MAX_DATEIGROESSE = 100 * 1024 * 1024;

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
