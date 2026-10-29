/**
 * Sichten der Ablage (#38) mit Bedingungen (#40, #41).
 *
 * Eine Sicht zeigt Mappen bestimmter Mappentypen, die ihre Bedingungen erfüllen – eine
 * gespeicherte Abfrage. Sichten bilden einen Baum: Eine Elternsicht zeigt ihre eigenen
 * Treffer und die aller Kinder (ohne Doppelte). Server und Oberfläche teilen diese Datei.
 */
import { GEMISCHTE_SPALTEN, istLeer, istSystemspalte, SYSTEMSPALTEN, trefferlistenVon, ZEITZONE, type Feld, type Feldtyp, type Mappe, type Mappentyp, type Quelle } from './model';

/* ---------- Bedingungen ---------- */

/** Wie ein Wert eines Feldes verglichen wird; Systemwerte haben eigene Arten. */
export type Feldart = Feldtyp | 'zeit' | 'person';

export const OPERATOREN = {
  gleich: 'ist gleich',
  enthaelt: 'enthält',
  kleiner: 'kleiner als',
  groesser: 'größer als',
  zwischen: 'zwischen',
  ausserhalb: 'außerhalb von',
  imZeitraum: 'im Zeitraum',
  einerVon: 'ist einer von',
  zeigtAuf: 'zeigt auf',
  ja: 'ja',
  nein: 'nein',
  leer: 'ist leer',
  nichtLeer: 'ist nicht leer',
} as const;
export type Operator = keyof typeof OPERATOREN;

/** Welche Operatoren es je Art gibt. */
export const OPERATOREN_JE_ART: Record<Feldart, Operator[]> = {
  text: ['gleich', 'enthaelt', 'leer', 'nichtLeer'],
  langtext: ['enthaelt', 'leer', 'nichtLeer'],
  formatiert: ['enthaelt', 'leer', 'nichtLeer'],
  zahl: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'leer', 'nichtLeer'],
  betrag: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'leer', 'nichtLeer'],
  datum: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'imZeitraum', 'leer', 'nichtLeer'],
  zeit: ['gleich', 'kleiner', 'groesser', 'zwischen', 'ausserhalb', 'imZeitraum'],
  janein: ['ja', 'nein'],
  auswahl: ['einerVon', 'leer', 'nichtLeer'],
  referenz: ['zeigtAuf', 'leer', 'nichtLeer'],
  person: ['zeigtAuf', 'leer'],
  // Passwörter taugen nicht für Bedingungen (#46).
  passwort: [],
};

export const EINHEITEN = { tage: 'Tage', wochen: 'Wochen', monate: 'Monate', jahre: 'Jahre' } as const;
export type Einheit = keyof typeof EINHEITEN;

/**
 * Ein Vergleichswert: fest oder dynamisch (zum Zeitpunkt der Abfrage berechnet).
 * - heute: Datum heute ± versatz einheit
 * - jahr / monat: Zeitraum (aktuelles Jahr bzw. aktueller Monat ± versatz), nur mit „im Zeitraum“
 * - ich: der angemeldete Benutzer; meineRollen: seine Rollen (Rollen-Mappen)
 */
export type WertAngabe =
  | { art: 'fest'; wert: string | number | boolean | string[] }
  | { art: 'heute'; versatz?: number; einheit?: Einheit }
  | { art: 'jahr'; versatz?: number }
  | { art: 'monat'; versatz?: number }
  | { art: 'ich' }
  | { art: 'meineRollen' };

export const DYNAMISCH = {
  heute: 'heute',
  jahr: 'Jahr (aktuelles ± n)',
  monat: 'Monat (aktueller ± n)',
  ich: 'aktueller Benutzer',
  meineRollen: 'Rollen des aktuellen Benutzers',
} as const;

export const ZAEHLVERGLEICHE = { mehr: 'mehr als', weniger: 'weniger als', gleich: 'genau' } as const;
export type Zaehlvergleich = keyof typeof ZAEHLVERGLEICHE;

export type Bedingung =
  /** Feld des Mappentyps oder Systemwert (_erstellt, _geaendert, _erstelltVon, _geaendertVon). */
  | { art: 'feld'; feld: string; op: Operator; wert?: WertAngabe; bis?: WertAngabe }
  /** Anzahl Dokumente in einem Dokumentenregister (#41). */
  | { art: 'dokumente'; register: string; vergleich: Zaehlvergleich; anzahl: number }
  /** Anzahl Mappen in einem Verknüpfungsregister (#41); bei mehreren Typen ein gemeinsames Register (#66). */
  | { art: 'verknuepfungen'; register: string; vergleich: Zaehlvergleich; anzahl: number }
  /** Anzahl aller Dokumente der Mappe, unabhängig vom Register (#67). */
  | { art: 'dokumenteGesamt'; vergleich: Zaehlvergleich; anzahl: number }
  /** Anzahl aller anderen Mappen, die auf diese verweisen (#67). */
  | { art: 'verknuepfungenGesamt'; vergleich: Zaehlvergleich; anzahl: number }
  /** Die Mappe ist ein Favorit des aktuellen Benutzers (#62). */
  | { art: 'favorit' }
  /** Frist in den nächsten n Tagen (#133): ein Datumsfeld oder (null) alle Datumsfelder mit Erinnerung; optional nur meine. */
  | { art: 'frist'; feld: string | null; tage: number; nurMeine?: boolean };

/** Datumsfelder mit Erinnerung (#129) – gleich wie fristFelder in fristen.ts, hier ohne Kreisimport. */
const mitFrist = (t: Pick<Mappentyp, 'felder'>) => t.felder.filter((f) => f.typ === 'datum' && f.frist);
export const FRIST_TAGE_MAX = 3650;

/* ---------- Sichten ---------- */

export interface SichtDaten {
  name: string;
  beschreibung: string;
  /** Elternsicht im Baum; null = oberste Ebene. */
  elternId: string | null;
  /** Reihenfolge unter Geschwistern. */
  position: number;
  /** Mappentypen, deren Mappen diese Sicht selbst zeigt; leer = nur zum Gruppieren. */
  typen: string[];
  /** Gelten zusammen (UND), für die eigenen Mappentypen dieser Sicht. */
  bedingungen: Bedingung[];
  /** Schlüssel der Trefferliste (#75); null/fehlt = Standard. */
  trefferliste?: string | null;
}
export interface Sicht extends SichtDaten { id: string; erstellt: string; geaendert: string }

/** Kinder einer Sicht in ihrer Reihenfolge. */
export function kinderVon(alle: Sicht[], id: string | null): Sicht[] {
  return alle.filter((s) => (s.elternId ?? null) === id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));
}

/** Die Sicht und alle Nachkommen (Tiefensuche, ohne Kreise). */
export function mitNachkommen(alle: Sicht[], id: string): Sicht[] {
  const erg: Sicht[] = [];
  const gesehen = new Set<string>();
  const besuche = (sid: string) => {
    if (gesehen.has(sid)) return;
    gesehen.add(sid);
    const s = alle.find((x) => x.id === sid);
    if (!s) return;
    erg.push(s);
    for (const k of kinderVon(alle, sid)) besuche(k.id);
  };
  besuche(id);
  return erg;
}

/** Würde `elternId` als Elternsicht von `id` einen Kreis ergeben? */
export function waereKreis(alle: Sicht[], id: string, elternId: string | null): boolean {
  if (!elternId) return false;
  if (elternId === id) return true;
  return mitNachkommen(alle, id).some((s) => s.id === elternId);
}

/** Alle Mappentypen, die eine Sicht samt Kindern zeigt. */
export function wirksameTypen(alle: Sicht[], id: string): string[] {
  return [...new Set(mitNachkommen(alle, id).flatMap((s) => s.typen))];
}

/* ---------- Felder, die eine Sicht für Bedingungen anbietet ---------- */

export interface Bedingungsfeld { key: string; label: string; art: Feldart; feld?: Feld }

const SYSTEMFELDER: Bedingungsfeld[] = [
  { key: '_erstellt', label: SYSTEMSPALTEN._erstellt, art: 'zeit' },
  { key: '_geaendert', label: SYSTEMSPALTEN._geaendert, art: 'zeit' },
  { key: '_erstelltVon', label: SYSTEMSPALTEN._erstelltVon, art: 'person' },
  { key: '_geaendertVon', label: SYSTEMSPALTEN._geaendertVon, art: 'person' },
];

/**
 * Felder für Bedingungen: bei einem Mappentyp alle seine Felder; bei mehreren nur Felder mit
 * gleichem Schlüssel und gleichem Datentyp in allen Typen (bei Referenzen auch gleichem Ziel).
 * Systemwerte gibt es immer.
 */
export function bedingungsfelder(typen: Array<Pick<Mappentyp, 'felder'>>): Bedingungsfeld[] {
  if (!typen.length) return SYSTEMFELDER;
  const [erster, ...rest] = typen;
  const gemeinsam = erster.felder.filter((f) => f.typ !== 'passwort' && f.zielTyp !== '*' && rest.every((t) => t.felder.some((g) => g.key === f.key && g.typ === f.typ && (f.typ !== 'referenz' || g.zielTyp === f.zielTyp))));
  return [...gemeinsam.map((f) => ({ key: f.key, label: f.label, art: f.typ as Feldart, feld: f })), ...SYSTEMFELDER];
}

/** Warum eine Bedingung nicht (mehr) passt – z. B. weil ihr Feld entfernt wurde. null = in Ordnung. */
export function bedingungsProblem(b: Bedingung, typen: Mappentyp[]): string | null {
  if (b.art === 'feld') {
    const f = bedingungsfelder(typen).find((x) => x.key === b.feld);
    if (!f) return `Das Feld „${b.feld}“ gibt es ${typen.length > 1 ? 'nicht in allen Mappentypen dieser Sicht' : 'nicht (mehr)'}.`;
    if (!OPERATOREN_JE_ART[f.art].includes(b.op)) return `„${OPERATOREN[b.op] ?? b.op}“ passt nicht zum Feld „${f.label}“.`;
    const brauchtWert = !['leer', 'nichtLeer', 'ja', 'nein'].includes(b.op);
    if (brauchtWert && !b.wert) return `Bei „${f.label}“ fehlt der Vergleichswert.`;
    if ((b.op === 'zwischen' || b.op === 'ausserhalb') && !b.bis) return `Bei „${f.label}“ fehlt der zweite Wert.`;
    if (b.op === 'imZeitraum' && b.wert?.art !== 'jahr' && b.wert?.art !== 'monat') return `„im Zeitraum“ braucht Jahr oder Monat.`;
    if (b.wert && (b.wert.art === 'jahr' || b.wert.art === 'monat') && b.op !== 'imZeitraum') return `Jahr und Monat gehen nur mit „im Zeitraum“.`;
    if (b.wert && (b.wert.art === 'ich' || b.wert.art === 'meineRollen') && b.op !== 'zeigtAuf') return `„${DYNAMISCH[b.wert.art]}“ geht nur mit „zeigt auf“.`;
    if (b.wert?.art === 'heute' && f.art !== 'datum' && f.art !== 'zeit') return `„heute“ geht nur bei Datumsfeldern.`;
    if (b.op === 'zeigtAuf' && b.wert?.art === 'meineRollen' && f.art === 'person') return `„Rollen des aktuellen Benutzers“ geht nicht bei „${f.label}“.`;
    return null;
  }
  if (b.art === 'favorit') return null;
  if (b.art === 'frist') {
    if (!Number.isInteger(b.tage) || b.tage < 0 || b.tage > FRIST_TAGE_MAX) return `Die Anzahl Tage muss zwischen 0 und ${FRIST_TAGE_MAX} liegen.`;
    if (!typen.length) return 'Fristen brauchen mindestens einen Mappentyp.';
    if (b.feld) {
      if (typen.some((t) => t.felder.find((f) => f.key === b.feld)?.typ !== 'datum')) return `Das Datumsfeld „${b.feld}“ gibt es ${typen.length > 1 ? 'nicht in allen Mappentypen dieser Sicht' : 'nicht (mehr)'}.`;
      return null;
    }
    if (!typen.some((t) => mitFrist(t).length)) return 'Keiner der Mappentypen hat ein Datumsfeld mit Erinnerung.';
    return null;
  }
  if (!Number.isInteger(b.anzahl) || b.anzahl < 0) return 'Die Anzahl muss eine ganze Zahl ab 0 sein.';
  if (b.art === 'dokumenteGesamt' || b.art === 'verknuepfungenGesamt') return null;
  if (!typen.length) return 'Bedingungen auf Register brauchen mindestens einen Mappentyp.';
  // Bei mehreren Typen: gleicher Schlüssel und gleiche Art in allen (#66).
  const art = b.art === 'dokumente' ? 'dokumente' : 'verknuepfungen';
  if (typen.some((t) => t.register.find((x) => x.key === b.register)?.art !== art)) {
    return `Das ${art === 'dokumente' ? 'Dokumenten' : 'Verknüpfungs'}register „${b.register}“ gibt es ${typen.length > 1 ? 'nicht in allen Mappentypen dieser Sicht' : 'nicht (mehr)'}.`;
  }
  return null;
}

/* ---------- Auflösen: dynamische Werte → feste (zum Zeitpunkt der Abfrage) ---------- */

export interface Aufloesung {
  /** Datum heute (JJJJ-MM-TT) in der Zeitzone des DMS. */
  heute: string;
  ich: string;
  meineRollen: string[];
}

/** Bedingung, wie das Repo sie braucht: Art des Feldes, Operator und feste Werte. */
export type Filter =
  | { art: 'feld'; key: string; feldart: Feldart; op: Operator; a?: unknown; b?: unknown }
  /** register null = alle Dokumente der Mappe (#67). */
  | { art: 'dokumente'; register: string | null; vergleich: Zaehlvergleich; anzahl: number }
  /** quellen [] = alle Rückverweise; quellenJeTyp: je Mappentyp die Quellen seines Registers (#66). */
  | { art: 'verknuepfungen'; quellen: Quelle[]; quellenJeTyp?: Record<string, Quelle[]>; vergleich: Zaehlvergleich; anzahl: number }
  | { art: 'favorit'; benutzer: string }
  /** Berechtigungen (#123): offene Aufgabe für diesen Benutzer an der Mappe. */
  | { art: 'aufgabe'; benutzer: string }
  /** Berechtigungen (#123): die Mappe ist eine dieser (z. B. die eigene Benutzer-Mappe). */
  | { art: 'id'; ids: string[] }
  /** Frist (#133): eines der Datumsfelder liegt zwischen von und bis; mit ich nur Fristen dieses Empfängers. */
  | { art: 'frist'; felder: Array<{ key: string; empfaengerFeld: string | null }>; von: string; bis: string; ich?: string };

/** Eine Klausel: Mappen dieser Typen, die alle Filter erfüllen. Eine Sicht = ODER ihrer Klauseln. */
export interface Klausel { typen: string[]; filter: Filter[] }

export const heuteIn = (jetzt = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: ZEITZONE }).format(jetzt);

/** Datum (JJJJ-MM-TT) ± n Einheiten; Monatsende wird gekappt (31.01. + 1 Monat = 28./29.02.). */
export function verschiebe(datum: string, n: number, einheit: Einheit = 'tage'): string {
  const [j, m, t] = datum.split('-').map(Number);
  if (einheit === 'tage' || einheit === 'wochen') {
    const d = new Date(Date.UTC(j, m - 1, t + n * (einheit === 'wochen' ? 7 : 1)));
    return d.toISOString().slice(0, 10);
  }
  const monate = n * (einheit === 'jahre' ? 12 : 1);
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzter));
  return ziel.toISOString().slice(0, 10);
}

function zeitraum(w: WertAngabe, heute: string): [string, string] {
  const versatz = 'versatz' in w ? Math.trunc(Number(w.versatz) || 0) : 0;
  const [j, m] = heute.split('-').map(Number);
  if (w.art === 'jahr') return [`${j + versatz}-01-01`, `${j + versatz}-12-31`];
  const start = new Date(Date.UTC(j, m - 1 + versatz, 1));
  const ende = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return [start.toISOString().slice(0, 10), ende.toISOString().slice(0, 10)];
}

function wertVon(w: WertAngabe | undefined, feldart: Feldart, a: Aufloesung): unknown {
  if (!w) return undefined;
  switch (w.art) {
    case 'heute': return verschiebe(a.heute, Math.trunc(Number(w.versatz) || 0), w.einheit ?? 'tage');
    case 'ich': return [a.ich];
    case 'meineRollen': return a.meineRollen;
    case 'jahr': case 'monat': return zeitraum(w, a.heute);
    case 'fest': {
      const v = w.wert;
      if (feldart === 'zahl' || feldart === 'betrag') return typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (feldart === 'referenz' || feldart === 'person' || feldart === 'auswahl') return Array.isArray(v) ? v.map(String) : [String(v)];
      return v;
    }
  }
}

/**
 * Bedingungen einer Sicht für ihre eigenen Typen auflösen. Bedingungen mit Problem
 * (z. B. entferntes Feld) werden ignoriert, bis sie in der Werkbank korrigiert sind.
 */
export function filterFuer(s: Pick<SichtDaten, 'bedingungen'>, typen: Mappentyp[], a: Aufloesung): Filter[] {
  const felder = bedingungsfelder(typen);
  const erg: Filter[] = [];
  for (const b of s.bedingungen) {
    if (bedingungsProblem(b, typen)) continue;
    if (b.art === 'feld') {
      const f = felder.find((x) => x.key === b.feld)!;
      if (b.op === 'imZeitraum') {
        const [von, bis] = wertVon(b.wert, f.art, a) as [string, string];
        erg.push({ art: 'feld', key: f.key, feldart: f.art, op: 'zwischen', a: von, b: bis });
      } else {
        erg.push({ art: 'feld', key: f.key, feldart: f.art, op: b.op, a: wertVon(b.wert, f.art, a), b: wertVon(b.bis, f.art, a) });
      }
    } else if (b.art === 'dokumente') {
      erg.push({ art: 'dokumente', register: b.register, vergleich: b.vergleich, anzahl: b.anzahl });
    } else if (b.art === 'dokumenteGesamt') {
      erg.push({ art: 'dokumente', register: null, vergleich: b.vergleich, anzahl: b.anzahl });
    } else if (b.art === 'verknuepfungenGesamt') {
      erg.push({ art: 'verknuepfungen', quellen: [], vergleich: b.vergleich, anzahl: b.anzahl });
    } else if (b.art === 'favorit') {
      erg.push({ art: 'favorit', benutzer: a.ich });
    } else if (b.art === 'frist') {
      // Je Feldschlüssel das Empfängerfeld des ersten Typs, der dort erinnert.
      const felder = new Map<string, string | null>();
      for (const t of typen) {
        for (const f of b.feld ? t.felder.filter((x) => x.key === b.feld) : mitFrist(t)) {
          if (!felder.has(f.key) || (felder.get(f.key) === null && f.frist?.empfaengerFeld)) felder.set(f.key, f.frist?.empfaengerFeld ?? null);
        }
      }
      erg.push({ art: 'frist', felder: [...felder].map(([key, empfaengerFeld]) => ({ key, empfaengerFeld })), von: a.heute, bis: verschiebe(a.heute, b.tage), ...(b.nurMeine ? { ich: a.ich } : {}) });
    } else if (typen.length === 1) {
      const r = typen[0].register.find((x) => x.key === b.register)!;
      erg.push({ art: 'verknuepfungen', quellen: r.quellen ?? [], vergleich: b.vergleich, anzahl: b.anzahl });
    } else {
      // Je Typ über die Quellen seines eigenen Registers, genau wie im Register an der Mappe (#66).
      const quellenJeTyp = Object.fromEntries(typen.map((t) => [t.id, t.register.find((x) => x.key === b.register)!.quellen ?? []]));
      erg.push({ art: 'verknuepfungen', quellen: [], quellenJeTyp, vergleich: b.vergleich, anzahl: b.anzahl });
    }
  }
  return erg;
}

/** Klauseln einer Sicht samt Nachkommen; jede Sicht mit eigenen Typen ergibt eine Klausel. */
export function klauselnFuer(alle: Sicht[], id: string, typen: Map<string, Mappentyp>, a: Aufloesung): Klausel[] {
  return mitNachkommen(alle, id)
    .filter((s) => s.typen.some((t) => typen.has(t)))
    .map((s) => {
      const eigene = s.typen.map((t) => typen.get(t)).filter((t): t is Mappentyp => !!t);
      return { typen: eigene.map((t) => t.id), filter: filterFuer(s, eigene, a) };
    });
}

/* ---------- Auswerten im Arbeitsspeicher (Tests, Repo ohne Datenbank) ---------- */

export interface Zaehlquelle {
  /** register null = alle Dokumente der Mappe. */
  dokumente(mappeId: string, register: string | null): number;
  verknuepfungen(mappeId: string, quellen: Quelle[]): number;
  favorit?(mappeId: string, benutzer: string): boolean;
  aufgabe?(mappeId: string, benutzer: string): boolean;
}

function vergleichswert(m: Mappe, f: Extract<Filter, { art: 'feld' }>): unknown {
  switch (f.key) {
    case '_erstellt': return m.erstellt ? heuteIn(new Date(m.erstellt)) : null;
    case '_geaendert': return m.geaendert ? heuteIn(new Date(m.geaendert)) : null;
    case '_erstelltVon': return m.erstelltVon ?? null;
    case '_geaendertVon': return m.geaendertVon ?? null;
  }
  const v = m.werte[f.key];
  if (f.feldart === 'betrag') return v && typeof v === 'object' && !Array.isArray(v) ? (v as { betrag: number }).betrag : null;
  return v ?? null;
}

function zaehltWie(n: number, v: Zaehlvergleich, soll: number) {
  return v === 'mehr' ? n > soll : v === 'weniger' ? n < soll : n === soll;
}

export function erfuellt(m: Mappe, filter: Filter[], z: Zaehlquelle): boolean {
  return filter.every((f) => {
    if (f.art === 'dokumente') return zaehltWie(z.dokumente(m.id, f.register), f.vergleich, f.anzahl);
    if (f.art === 'verknuepfungen') return zaehltWie(z.verknuepfungen(m.id, f.quellenJeTyp ? f.quellenJeTyp[m.typId] ?? [] : f.quellen), f.vergleich, f.anzahl);
    if (f.art === 'favorit') return !!z.favorit?.(m.id, f.benutzer);
    if (f.art === 'aufgabe') return !!z.aufgabe?.(m.id, f.benutzer);
    if (f.art === 'id') return f.ids.includes(m.id);
    if (f.art === 'frist') {
      return f.felder.some((x) => {
        const d = m.werte[x.key];
        if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < f.von || d > f.bis) return false;
        if (!f.ich) return true;
        const e = x.empfaengerFeld ? m.werte[x.empfaengerFeld] : null;
        return (typeof e === 'string' && e ? e : m.erstelltVon) === f.ich;
      });
    }
    const v = vergleichswert(m, f);
    const leer = istLeer(v);
    switch (f.op) {
      case 'leer': return leer;
      case 'nichtLeer': return !leer;
      case 'ja': return v === true;
      case 'nein': return v !== true;
      case 'zeigtAuf': case 'einerVon': {
        const soll = new Set(f.a as string[]);
        return (Array.isArray(v) ? v : leer ? [] : [String(v)]).some((x) => soll.has(String(x)));
      }
      case 'enthaelt': return !leer && String(v).toLowerCase().includes(String(f.a ?? '').toLowerCase());
    }
    if (leer) return false;
    const num = f.feldart === 'zahl' || f.feldart === 'betrag';
    const x = num ? Number(v) : String(v);
    const a = num ? Number(f.a) : String(f.a ?? '');
    const b = num ? Number(f.b) : String(f.b ?? '');
    if (f.feldart === 'text') return f.op === 'gleich' && String(v).toLowerCase() === String(f.a ?? '').toLowerCase();
    switch (f.op) {
      case 'gleich': return x === a;
      case 'kleiner': return x < a;
      case 'groesser': return x > a;
      case 'zwischen': return x >= a && x <= b;
      case 'ausserhalb': return x < a || x > b;
    }
    return false;
  });
}

/** Passt eine Mappe zu einer der Klauseln? */
export function inSicht(m: Mappe, klauseln: Klausel[], z: Zaehlquelle): boolean {
  return klauseln.some((k) => k.typen.includes(m.typId) && erfuellt(m, k.filter, z));
}

/* ---------- Eingaben bereinigen ---------- */

const ARTEN_WERT = ['fest', 'heute', 'jahr', 'monat', 'ich', 'meineRollen'];

function bereinigeWert(w: unknown): WertAngabe | undefined {
  if (!w || typeof w !== 'object') return undefined;
  const x = w as Record<string, unknown>;
  if (!ARTEN_WERT.includes(String(x.art))) return undefined;
  const versatz = Math.max(-1000, Math.min(1000, Math.trunc(Number(x.versatz) || 0)));
  switch (x.art) {
    case 'fest': {
      const v = x.wert;
      if (Array.isArray(v)) return { art: 'fest', wert: v.map(String).slice(0, 200) };
      if (typeof v === 'string') return { art: 'fest', wert: v.slice(0, 500) };
      if (typeof v === 'number' || typeof v === 'boolean') return { art: 'fest', wert: v };
      return undefined;
    }
    case 'heute': return { art: 'heute', versatz, einheit: (Object.keys(EINHEITEN) as Einheit[]).includes(x.einheit as Einheit) ? (x.einheit as Einheit) : 'tage' };
    case 'jahr': return { art: 'jahr', versatz };
    case 'monat': return { art: 'monat', versatz };
    default: return { art: x.art as 'ich' | 'meineRollen' };
  }
}

export function bereinigeBedingungen(e: unknown): Bedingung[] {
  if (!Array.isArray(e)) return [];
  const erg: Bedingung[] = [];
  for (const roh of e.slice(0, 50)) {
    const b = (roh ?? {}) as Record<string, unknown>;
    if (b.art === 'feld' && typeof b.feld === 'string' && Object.prototype.hasOwnProperty.call(OPERATOREN, String(b.op))) {
      const x: Bedingung = { art: 'feld', feld: b.feld.slice(0, 60), op: b.op as Operator };
      const wert = bereinigeWert(b.wert); const bis = bereinigeWert(b.bis);
      if (wert) x.wert = wert;
      if (bis && (x.op === 'zwischen' || x.op === 'ausserhalb')) x.bis = bis;
      erg.push(x);
    } else if ((b.art === 'dokumente' || b.art === 'verknuepfungen') && typeof b.register === 'string') {
      const vergleich = Object.prototype.hasOwnProperty.call(ZAEHLVERGLEICHE, String(b.vergleich)) ? (b.vergleich as Zaehlvergleich) : 'gleich';
      erg.push({ art: b.art, register: b.register.slice(0, 60), vergleich, anzahl: Math.max(0, Math.trunc(Number(b.anzahl) || 0)) });
    } else if (b.art === 'dokumenteGesamt' || b.art === 'verknuepfungenGesamt') {
      const vergleich = Object.prototype.hasOwnProperty.call(ZAEHLVERGLEICHE, String(b.vergleich)) ? (b.vergleich as Zaehlvergleich) : 'gleich';
      erg.push({ art: b.art, vergleich, anzahl: Math.max(0, Math.trunc(Number(b.anzahl) || 0)) });
    } else if (b.art === 'favorit') {
      erg.push({ art: 'favorit' });
    } else if (b.art === 'frist') {
      erg.push({ art: 'frist', feld: typeof b.feld === 'string' && b.feld ? b.feld.slice(0, 60) : null, tage: Math.max(0, Math.min(FRIST_TAGE_MAX, Math.trunc(Number(b.tage) || 0))), ...(b.nurMeine === true ? { nurMeine: true } : {}) });
    }
  }
  return erg;
}

/** Bedingung lesbar, z. B. „Kündigung bis zwischen heute und heute + 90 Tage“. */
export function beschreibeBedingung(b: Bedingung, typen: Mappentyp[], titelVon: (id: string) => string = (id) => id): string {
  if (b.art === 'favorit') return 'ist mein Favorit';
  if (b.art === 'frist') {
    const feld = b.feld ? typen.flatMap((t) => t.felder).find((f) => f.key === b.feld)?.label ?? b.feld : null;
    return `hat Frist in den nächsten ${b.tage} ${b.tage === 1 ? 'Tag' : 'Tagen'}${feld ? ` („${feld}“)` : ''}${b.nurMeine ? ', nur meine' : ''}`;
  }
  if (b.art === 'dokumenteGesamt') return `Dokumente insgesamt: ${ZAEHLVERGLEICHE[b.vergleich]} ${b.anzahl} ${b.anzahl === 1 ? 'Dokument' : 'Dokumente'}`;
  if (b.art === 'verknuepfungenGesamt') return `Verknüpfungen insgesamt: ${ZAEHLVERGLEICHE[b.vergleich]} ${b.anzahl} ${b.anzahl === 1 ? 'Verknüpfung' : 'Verknüpfungen'}`;
  if (b.art !== 'feld') {
    const namen = [...new Set(typen.map((t) => t.register.find((x) => x.key === b.register)?.name).filter(Boolean))];
    const r = { name: namen.length ? namen.join(' / ') : undefined };
    return `${r?.name ?? b.register}: ${ZAEHLVERGLEICHE[b.vergleich]} ${b.anzahl} ${b.art === 'dokumente' ? (b.anzahl === 1 ? 'Dokument' : 'Dokumente') : (b.anzahl === 1 ? 'Verknüpfung' : 'Verknüpfungen')}`;
  }
  const f = bedingungsfelder(typen).find((x) => x.key === b.feld);
  const wert = (w?: WertAngabe): string => {
    if (!w) return '…';
    switch (w.art) {
      case 'heute': { const n = Number(w.versatz) || 0; return n ? `heute ${n > 0 ? '+' : '−'} ${Math.abs(n)} ${EINHEITEN[w.einheit ?? 'tage']}` : 'heute'; }
      case 'jahr': { const n = Number(w.versatz) || 0; return n === 0 ? 'aktuelles Jahr' : n === -1 ? 'letztes Jahr' : n === 1 ? 'nächstes Jahr' : `Jahr ${n > 0 ? '+' : '−'} ${Math.abs(n)}`; }
      case 'monat': { const n = Number(w.versatz) || 0; return n === 0 ? 'aktueller Monat' : n === -1 ? 'letzter Monat' : n === 1 ? 'nächster Monat' : `Monat ${n > 0 ? '+' : '−'} ${Math.abs(n)}`; }
      case 'ich': return 'aktueller Benutzer';
      case 'meineRollen': return 'Rollen des aktuellen Benutzers';
      case 'fest': {
        const v = w.wert;
        if (f?.art === 'referenz' || f?.art === 'person') return (Array.isArray(v) ? v : [String(v)]).map((x) => `„${titelVon(String(x))}“`).join(' oder ');
        if (Array.isArray(v)) return v.map((x) => `„${x}“`).join(', ');
        if (f?.art === 'datum' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('.');
        return typeof v === 'string' ? `„${v}“` : String(v).replace('.', ',');
      }
    }
  };
  const name = f?.label ?? b.feld;
  if (b.op === 'leer' || b.op === 'nichtLeer' || b.op === 'ja' || b.op === 'nein') return `${name} ${OPERATOREN[b.op]}`;
  if (b.op === 'zwischen' || b.op === 'ausserhalb') return `${name} ${OPERATOREN[b.op]} ${wert(b.wert)} und ${wert(b.bis)}`;
  return `${name} ${OPERATOREN[b.op]} ${wert(b.wert)}`;
}

/* ---------- Trefferlisten einer Sicht (#75) ---------- */

/** Eine Trefferliste, wie sie eine Sicht verwenden kann. */
export interface Sichtliste { key: string; name: string; spalten: string[]; standard: boolean }

/**
 * Trefferlisten, die alle Typen haben (gleicher Schlüssel), mit nur den Spalten, die alle
 * diese Listen haben – Felder zudem mit gleichem Datentyp. Reihenfolge wie beim ersten Typ.
 * Standard ist eine Liste, wenn sie es bei allen Typen ist.
 */
export function gemeinsameTrefferlisten(typen: Mappentyp[]): Sichtliste[] {
  if (!typen.length) return [];
  const je = typen.map((t) => trefferlistenVon(t));
  return je[0].flatMap((l) => {
    const andere = je.map((ls) => ls.find((x) => x.key === l.key));
    if (andere.some((x) => !x)) return [];
    const feld = (t: Mappentyp, k: string) => t.felder.find((f) => f.key === k);
    const spalten = l.spalten.filter((k) => andere.every((x) => x!.spalten.includes(k))
      && (istSystemspalte(k) || typen.every((t) => feld(t, k) && feld(t, k)!.typ === feld(typen[0], k)!.typ)));
    return [{ key: l.key, name: [...new Set(andere.map((x) => x!.name))].join(' / '), spalten, standard: andere.every((x) => x!.standard) }];
  });
}

/** Spalten, die eine Sicht zeigt; ungueltig = die gewählte Liste gibt es nicht (mehr), es gilt der Standard. */
export interface Spaltenwahl { key: string | null; name: string; spalten: string[]; ungueltig: boolean }

/**
 * Welche Spalten eine Sicht mit diesen (wirksamen) Typen zeigt: die gewählte Trefferliste,
 * sonst die Standardliste (bei mehreren Typen die gemeinsame), sonst die Systemspalten.
 */
export function spaltenDerSicht(typen: Mappentyp[], wahl?: string | null): Spaltenwahl {
  const system: Spaltenwahl = { key: null, name: 'Systemspalten', spalten: GEMISCHTE_SPALTEN, ungueltig: false };
  if (!typen.length) return { ...system, ungueltig: !!wahl };
  const listen = gemeinsameTrefferlisten(typen);
  const gewaehlt = wahl ? listen.find((l) => l.key === wahl) : undefined;
  const ungueltig = !!wahl && !gewaehlt;
  const l = gewaehlt ?? listen.find((x) => x.standard);
  if (!l) return { ...system, ungueltig };
  if (typen.length === 1) return { key: l.key, name: l.name, spalten: l.spalten, ungueltig };
  // Mehrere Typen: Titel und Typ stehen immer vorn, damit jede Zeile erkennbar bleibt.
  const rest = l.spalten.filter((k) => k !== '_titel' && k !== '_typ');
  return { key: l.key, name: l.name, spalten: ['_titel', '_typ', ...rest], ungueltig };
}

/** Hinweis für die Werkbank, wenn die gewählte Trefferliste nicht (mehr) passt. */
export function trefferlistenProblem(wahl: string | null | undefined, typen: Mappentyp[]): string | null {
  if (!wahl) return null;
  if (!typen.length) return 'Die Sicht hat keine Mappentypen; eine Trefferliste lässt sich erst mit Mappentypen wählen.';
  return spaltenDerSicht(typen, wahl).ungueltig
    ? `Die Trefferliste „${wahl}“ gibt es nicht (mehr) in ${typen.length === 1 ? 'diesem Mappentyp' : 'allen Mappentypen dieser Sicht'}. Die Sicht zeigt stattdessen die Standardliste.`
    : null;
}
