/** Sichten (#1278 aus sichten.ts): Bedingungen auflösen (dynamische Werte → feste) und im Arbeitsspeicher auswerten. */
import type { Merkmale, Merkmal } from '../merkmale';
import {
  type Feldart,
  type Operator,
  type Zaehlvergleich,
  type Einheit,
  type WertAngabe,
  zeitraumWert,
  istZahlvergleich,
} from './bedingungen';
import { type Quelle, type Mappentyp, type Mappe, istLeer } from '../model/basis';
import { datumsformat } from '../region';

import { leseProzent, istZeitraum, zeitraumTage } from '../feldarten';
import { type SichtDaten, type Sicht, typenDerSicht, mitNachkommen } from './baum';
import { bedingungsfelder, bedingungsProblem, mitFrist } from './felder';
import { istTeiltyp } from '../teile';

/* ---------- Auflösen: dynamische Werte → feste (zum Zeitpunkt der Abfrage) ---------- */

export interface Aufloesung {
  /** Datum heute (JJJJ-MM-TT) in der Zeitzone des DMS. */
  heute: string;
  ich: string;
  meineRollen: string[];
  /** Merkmale der Ablage (#1032); fehlt = keine (privat). */
  merkmale?: Merkmale;
  /**
   * Mappentypen, die die Person überhaupt sehen darf (#1036) – für Rechte-Regeln „zeigt auf Mappe vom Typ …“, die im
   * Zweifel geschlossen bleiben (rechte.ts). Fehlt = ohne diese Einschränkung (Administratoren, Ansichten, Tests).
   */
  sichtbareTypen?: string[];
}

/** Trifft eine Merkmal-Bedingung zu? Ohne Angabe gilt die Ablage als privat (#1032). */
export const merkmalTrifft = (b: { merkmal: Merkmal; nicht?: boolean }, m: Merkmale | undefined) => !!m?.[b.merkmal] !== !!b.nicht;

/** Bedingung, wie das Repo sie braucht: Art des Feldes, Operator und feste Werte. */
export type Filter =
  | { art: 'feld'; key: string; feldart: Feldart; op: Operator; a?: unknown; b?: unknown }
  /** register null = alle Dokumente der Mappe (#67). */
  | { art: 'dokumente'; register: string | null; vergleich: Zaehlvergleich; anzahl: number }
  /** quellen [] = alle Rückverweise; quellenJeTyp: je Mappentyp die Quellen seines Registers (#66). */
  | { art: 'verknuepfungen'; quellen: Quelle[]; quellenJeTyp?: Record<string, Quelle[]>; vergleich: Zaehlvergleich; anzahl: number }
  | { art: 'favorit'; benutzer: string }
  /**
   * Verweisfeld `key` zeigt auf (mindestens) eine Mappe, deren Typ einer von `typen` ist (#1036) – mit `ausser` eine,
   * deren Typ keiner davon ist (für Rechte-Regeln: „Typ der Zielmappe nicht sichtbar“).
   */
  | { art: 'zieltyp'; key: string; typen: string[]; ausser?: boolean }
  /** Berechtigungen (#123): offene Aufgabe für diesen Benutzer an der Mappe. */
  | { art: 'aufgabe'; benutzer: string }
  /** Berechtigungen (#123): die Mappe ist eine dieser (z. B. die eigene Benutzer-Mappe). */
  | { art: 'id'; ids: string[] }
  /** Frist (#133): eines der Datumsfelder liegt zwischen von und bis; mit ich nur Fristen dieses Empfängers. */
  | { art: 'frist'; felder: Array<{ key: string; empfaengerFeld: string | null }>; von: string; bis: string; ich?: string };

/** Eine Klausel: Mappen dieser Typen, die alle Filter erfüllen. Eine Sicht = ODER ihrer Klauseln. */
export interface Klausel {
  typen: string[];
  filter: Filter[];
}

// Einmal angelegt (#615): Ein neues Intl.DateTimeFormat kostet spürbar Rechenzeit, und „heute“ braucht jede Anfrage
// mit Rechten oder Ansichten mehrmals.
export const heuteIn = (jetzt = new Date()) => datumsformat('sv-SE').format(jetzt);

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
    case 'heute':
      return verschiebe(a.heute, Math.trunc(Number(w.versatz) || 0), w.einheit ?? 'tage');
    case 'ich':
      return [a.ich];
    case 'meineRollen':
      return a.meineRollen;
    case 'jahr':
    case 'monat':
      return zeitraum(w, a.heute);
    case 'eigenesFeld':
      return undefined;
    case 'fest':
      return festerWert(w.wert, feldart);
  }
}

/** Fester Vergleichswert, wie das Repo ihn vergleicht: Zahl, Prozent, Zeitraum in Tagen (#1035), Liste oder wie er ist. */
function festerWert(v: string | number | boolean | string[], feldart: Feldart): unknown {
  if (feldart === 'zahl' || feldart === 'betrag') return typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (feldart === 'prozent') return leseProzent(v) ?? NaN;
  if (feldart === 'zeitraum') return zeitraumWert(v);
  if (feldart === 'referenz' || feldart === 'person' || feldart === 'auswahl') return Array.isArray(v) ? v.map(String) : [String(v)];
  return v;
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
      if (b.op === 'zeigtAufTyp') {
        erg.push({ art: 'zieltyp', key: f.key, typen: wertVon(b.wert, f.art, a) as string[] });
      } else if (b.op === 'imZeitraum') {
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
    } else if (b.art === 'merkmal') {
      // Merkmal der Ablage (#1032): trifft es zu, schränkt es nichts ein; sonst trifft keine Mappe zu (leere Id-Liste).
      if (!merkmalTrifft(b, a.merkmale)) erg.push({ art: 'id', ids: [] });
    } else if (b.art === 'frist') {
      // Je Feldschlüssel das Empfängerfeld des ersten Typs, der dort erinnert.
      const felder = new Map<string, string | null>();
      for (const t of typen) {
        for (const f of b.feld ? t.felder.filter((x) => x.key === b.feld) : mitFrist(t)) {
          if (!felder.has(f.key) || (felder.get(f.key) === null && f.frist?.empfaengerFeld))
            felder.set(f.key, f.frist?.empfaengerFeld ?? null);
        }
      }
      erg.push({
        art: 'frist',
        felder: [...felder].map(([key, empfaengerFeld]) => ({ key, empfaengerFeld })),
        von: a.heute,
        bis: verschiebe(a.heute, b.tage),
        ...(b.nurMeine ? { ich: a.ich } : {}),
      });
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
export function klauselnFuer(alle: Sicht[], id: string, typen: Map<string, Mappentyp>, a: Aufloesung, verborgen?: Set<string>): Klausel[] {
  // Verborgene Untersichten (#148): ihre Mappen fehlen auch in der Elternsicht.
  // Teile (#1031) erscheinen in keiner Ansicht – nur an ihrer übergeordneten Mappe.
  const sichtbar = (s: Sicht) =>
    typenDerSicht(s, typen.keys())
      .map((t) => typen.get(t))
      .filter((t): t is Mappentyp => !!t && !istTeiltyp(t));
  return mitNachkommen(alle, id)
    .filter((s) => !verborgen?.has(s.id))
    .filter((s) => sichtbar(s).length > 0)
    .map((s) => {
      const eigene = sichtbar(s);
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
  /** Typ einer verwiesenen Mappe (#1036, „zeigt auf Mappe vom Typ …“); fehlt oder unbekannt = trifft nicht zu. */
  typVon?(mappeId: string): string | undefined;
}

function vergleichswert(m: Mappe, f: Extract<Filter, { art: 'feld' }>): unknown {
  switch (f.key) {
    case '_erstellt':
      return m.erstellt ? heuteIn(new Date(m.erstellt)) : null;
    case '_geaendert':
      return m.geaendert ? heuteIn(new Date(m.geaendert)) : null;
    case '_erstelltVon':
      return m.erstelltVon ?? null;
    case '_geaendertVon':
      return m.geaendertVon ?? null;
  }
  const v = m.werte[f.key];
  if (f.feldart === 'betrag') return v && typeof v === 'object' && !Array.isArray(v) ? (v as { betrag: number }).betrag : null;
  if (f.feldart === 'zeitraum') return istZeitraum(v) ? zeitraumTage(v) : null;
  return v ?? null;
}

const alsIds = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : istLeer(v) ? [] : [String(v)]);

function zaehltWie(n: number, v: Zaehlvergleich, soll: number) {
  return v === 'mehr' ? n > soll : v === 'weniger' ? n < soll : n === soll;
}

export function erfuellt(m: Mappe, filter: Filter[], z: Zaehlquelle): boolean {
  return filter.every((f) => {
    if (f.art === 'dokumente') return zaehltWie(z.dokumente(m.id, f.register), f.vergleich, f.anzahl);
    if (f.art === 'verknuepfungen')
      return zaehltWie(z.verknuepfungen(m.id, f.quellenJeTyp ? (f.quellenJeTyp[m.typId] ?? []) : f.quellen), f.vergleich, f.anzahl);
    if (f.art === 'favorit') return !!z.favorit?.(m.id, f.benutzer);
    if (f.art === 'aufgabe') return !!z.aufgabe?.(m.id, f.benutzer);
    if (f.art === 'id') return f.ids.includes(m.id);
    if (f.art === 'zieltyp') {
      const soll = new Set(f.typen);
      return alsIds(m.werte[f.key]).some((id) => {
        const typ = z.typVon?.(id);
        return typ !== undefined && soll.has(typ) !== !!f.ausser;
      });
    }
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
      case 'leer':
        return leer;
      case 'nichtLeer':
        return !leer;
      case 'ja':
        return v === true;
      case 'nein':
        return v !== true;
      case 'zeigtAuf':
      case 'einerVon': {
        const soll = new Set(f.a as string[]);
        return (Array.isArray(v) ? v : leer ? [] : [String(v)]).some((x) => soll.has(String(x)));
      }
      case 'enthaelt':
        return (
          !leer &&
          String(v)
            .toLowerCase()
            .includes(String(f.a ?? '').toLowerCase())
        );
    }
    if (leer) return false;
    const num = istZahlvergleich(f.feldart);
    const x = num ? Number(v) : String(v);
    const a = num ? Number(f.a) : String(f.a ?? '');
    const b = num ? Number(f.b) : String(f.b ?? '');
    if (f.feldart === 'text' || f.feldart === 'zusammengesetzt')
      return f.op === 'gleich' && String(v).toLowerCase() === String(f.a ?? '').toLowerCase();
    switch (f.op) {
      case 'gleich':
        return x === a;
      case 'kleiner':
        return x < a;
      case 'groesser':
        return x > a;
      case 'zwischen':
        return x >= a && x <= b;
      case 'ausserhalb':
        return x < a || x > b;
    }
    return false;
  });
}

/** Passt eine Mappe zu einer der Klauseln? */
export function inSicht(m: Mappe, klauseln: Klausel[], z: Zaehlquelle): boolean {
  return klauseln.some((k) => k.typen.includes(m.typId) && erfuellt(m, k.filter, z));
}
