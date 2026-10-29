/**
 * Fristen (#129–#133): Erinnerungen an Datumsfeldern, wiederkehrende Termine, freie Erinnerungen.
 * Server und Oberfläche teilen diese Datei.
 *
 * Eine Frist entsteht aus einem Datumsfeld mit Erinnerung: Ab „Datum − Vorlauf“ legt der tägliche
 * Lauf eine Aufgabe der Art „frist“ an – für den Benutzer im gewählten Benutzerfeld, sonst für den
 * Ersteller der Mappe. Ändert sich das Datum oder wird es leer, erledigt sich die Aufgabe selbst.
 */
import type { Feld, Mappe, Mappentyp } from './model';
import { verschiebe } from './sichten';

export const VORLAUF_EINHEITEN = { tage: 'Tage', wochen: 'Wochen', monate: 'Monate' } as const;
export type VorlaufEinheit = keyof typeof VORLAUF_EINHEITEN;

/** Wiederkehrend (#130): Abstand in Monaten. */
export const WIEDERHOLUNGEN: Record<number, string> = { 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' };
export const wiederholungText = (monate: number) => WIEDERHOLUNGEN[monate] ?? (monate % 12 === 0 ? `alle ${monate / 12} Jahre` : `alle ${monate} Monate`);

export interface FristEinstellung {
  /** Wie lange vor dem Datum die Erinnerung im Eingang erscheint. */
  vorlauf: number;
  einheit: VorlaufEinheit;
  /** Benutzerfeld (Referenz auf Benutzer) für den Empfänger; null = Ersteller der Mappe. */
  empfaengerFeld: string | null;
  /** Text der Aufgabe mit Platzhaltern {feld}, {datum}, {titel}. */
  text: string;
  /** Wiederkehrend alle n Monate (#130); null = einmalig. */
  wiederholung: number | null;
}

export const FRIST_TEXT = '{feld} {datum}';
export const FRIST_STANDARD: FristEinstellung = { vorlauf: 4, einheit: 'wochen', empfaengerFeld: null, text: FRIST_TEXT, wiederholung: null };
export const FRIST_TEXT_MAX = 200;
/** Freie Erinnerungen (#131). */
export const ERINNERUNG_TEXT_MAX = 500;
/** Sicht „Anstehend“ (#132): Standard-Zeitraum in Tagen. */
export const ANSTEHEND_TAGE = 30;
export const ANSTEHEND_MAX = 366;

/** Eingabe bereinigen; null = keine Erinnerung. */
export function bereinigeFrist(e: unknown): FristEinstellung | null {
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  const vorlauf = Math.min(999, Math.max(0, Math.trunc(Number(x.vorlauf) || 0)));
  const einheit = (typeof x.einheit === 'string' && x.einheit in VORLAUF_EINHEITEN ? x.einheit : 'tage') as VorlaufEinheit;
  const text = (typeof x.text === 'string' ? x.text : '').replace(/\s+/g, ' ').trim().slice(0, FRIST_TEXT_MAX) || FRIST_TEXT;
  const w = Math.trunc(Number(x.wiederholung) || 0);
  return {
    vorlauf, einheit, text,
    empfaengerFeld: typeof x.empfaengerFeld === 'string' && x.empfaengerFeld ? x.empfaengerFeld : null,
    wiederholung: w >= 1 && w <= 120 ? w : null,
  };
}

/** Datumsfelder eines Typs, die erinnern. */
export const fristFelder = (typ: Pick<Mappentyp, 'felder'>): Feld[] => typ.felder.filter((f) => f.typ === 'datum' && f.frist);

/** Benutzerfelder, die als Empfänger taugen: Referenz auf den Typ Benutzer, einfach. */
export const empfaengerFelder = (typ: Pick<Mappentyp, 'felder'>, benutzerTypId: string | undefined): Feld[] =>
  typ.felder.filter((f) => f.typ === 'referenz' && !f.mehrfach && !!benutzerTypId && f.zielTyp === benutzerTypId);

/** Ab wann die Frist im Eingang steht. */
export const fristAb = (datum: string, f: FristEinstellung) => verschiebe(datum, -f.vorlauf, f.einheit);

/** Der nächste Termin bei wiederkehrenden Fristen; Monatsende wird gekappt (31.01. + 1 Monat = 28./29.02.). */
export const naechsterTermin = (datum: string, monate: number) => verschiebe(datum, monate, 'monate');

export const datumDe = (iso: string) => { const [j, m, t] = iso.slice(0, 10).split('-'); return `${t}.${m}.${j}`; };

/** Text der Aufgabe, z. B. „Kündigung bis 30.09.2027“. */
export function fristText(f: FristEinstellung, feld: Pick<Feld, 'label'>, datum: string, titel: string): string {
  return (f.text || FRIST_TEXT).replaceAll('{feld}', feld.label).replaceAll('{datum}', datumDe(datum)).replaceAll('{titel}', titel || 'Ohne Titel').slice(0, 2000);
}

/** Wer die Erinnerung bekommt: der Benutzer im gewählten Feld, sonst der Ersteller (null = Administratoren). */
export function fristEmpfaenger(f: FristEinstellung, m: Pick<Mappe, 'werte' | 'erstelltVon'>): string | null {
  const v = f.empfaengerFeld ? m.werte[f.empfaengerFeld] : null;
  return typeof v === 'string' && v ? v : m.erstelltVon ?? null;
}

/** Gültiges Datum JJJJ-MM-TT? */
export const istDatum = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Ein Eintrag der Sicht „Anstehend“ (#132). */
export interface Anstehend {
  art: 'frist' | 'erinnerung';
  /** Frist- bzw. Erinnerungsdatum. */
  datum: string;
  /** Ab wann im Eingang (Frist: Datum − Vorlauf). */
  ab: string;
  text: string;
  mappeId: string; mappeTitel: string; typId: string;
  /** Steht schon als Aufgabe im Eingang. */
  faellig: boolean;
  feldKey?: string | null;
  erinnerungId?: string;
}

/** Freie Erinnerung an einer Mappe (#131), solange sie noch nicht fällig ist. */
export interface Erinnerung {
  id: string; mappeId: string; empfaengerId: string | null; datum: string; text: string;
  erstellt: string; erstelltVon: string | null;
  /** Für Listen. */
  mappeTitel?: string; typId?: string;
}
