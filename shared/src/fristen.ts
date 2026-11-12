/**
 * Fristen (#129–#133): Erinnerungen an Datumsfeldern, wiederkehrende Termine, freie Erinnerungen.
 * Server und Oberfläche teilen diese Datei.
 *
 * Eine Frist entsteht aus einem Datumsfeld mit Erinnerung: Ab „Datum − Vorlauf“ legt der tägliche
 * Lauf eine Aufgabe der Art „frist“ an – für den Benutzer im gewählten Benutzerfeld, sonst für den
 * Ersteller der Mappe. Ändert sich das Datum oder wird es leer, erledigt sich die Aufgabe selbst.
 */
import type { Feld, Mappe, Mappentyp } from './model';
import { einzigesZiel } from './verweisziele';
import { verschiebe } from './sichten';
import { t } from './texte';

export const VORLAUF_EINHEITEN = { tage: 'Tage', wochen: 'Wochen', monate: 'Monate' } as const;
export type VorlaufEinheit = keyof typeof VORLAUF_EINHEITEN;

/** Wiederkehrend (#130): Abstand in Monaten. */
export const WIEDERHOLUNGEN: Record<number, string> = { 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' };
export const wiederholungText = (monate: number) => WIEDERHOLUNGEN[monate] ?? (monate % 12 === 0 ? t('gemeinsam.fristen.alle-jahre', { wert: monate / 12 }) : t('gemeinsam.fristen.alle-monate', { monate }));

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
  typ.felder.filter((f) => f.typ === 'referenz' && !f.mehrfach && !!benutzerTypId && einzigesZiel(f) === benutzerTypId);

/** Ab wann die Frist im Eingang steht. */
export const fristAb = (datum: string, f: FristEinstellung) => verschiebe(datum, -f.vorlauf, f.einheit);

/** Der nächste Termin bei wiederkehrenden Fristen; Monatsende wird gekappt (31.01. + 1 Monat = 28./29.02.). */
export const naechsterTermin = (datum: string, monate: number) => verschiebe(datum, monate, 'monate');

/**
 * Künftige Termine einer wiederkehrenden Frist (#528) im Zeitraum von … bis (je einschließlich), ohne das
 * Datum selbst. Jeder Termin wird vom Datum aus gerechnet (Datum + k · Abstand), damit ein 31. nicht nach
 * einem kurzen Monat auf dem 28. hängen bleibt.
 */
export function folgetermine(datum: string, monate: number, von: string, bis: string): string[] {
  const erg: string[] = [];
  if (!(monate >= 1) || datum > bis) return erg;
  for (let k = 1; k <= 1200; k++) {
    const x = verschiebe(datum, k * monate, 'monate');
    if (x > bis) break;
    if (x >= von) erg.push(x);
  }
  return erg;
}

/**
 * Monat eines Datums als Zahl (Jahr · 12 + Monat − 1) für den Vorfilter der Termine (#918); null, wenn das Rechnen mit
 * Monaten nicht sicher ist (Monat nicht 01–12, Tag nicht 01–31, Jahr vor 0100). Wie `dms_fristmonat` (Migration 086).
 */
export function fristMonat(d: string): number | null {
  const j = d.slice(0, 4); const m = d.slice(5, 7); const t = d.slice(8, 10);
  if (!(m >= '01' && m <= '12' && t >= '01' && t <= '31' && j >= '0100')) return null;
  return Number(j) * 12 + Number(m) - 1;
}

/**
 * Vorfilter der Termine (#918): Kann ein Feld mit diesem Datum im Zeitraum ab … bis einen Termin haben – das Datum selbst
 * oder, wiederkehrend alle `monate` Monate, einen Folgetermin? Ein Folgetermin Datum + k · monate liegt immer im Monat
 * (Monat des Datums + k · monate) – nur der Tag wird am Monatsende gekappt (`verschiebe`). Gesucht ist also ein Monat im
 * Zeitraum, der um ein Vielfaches des Rhythmus nach dem des Datums liegt. Lieber ein Kandidat zu viel: Den Termin
 * selbst rechnet danach `folgetermine`. Dieselbe Rechnung macht PostgreSQL (repo-pg.ts `fristKandidaten`).
 */
export function kannTerminHaben(datum: string, monate: number | null, ab: string, bis: string): boolean {
  if (datum >= ab && datum <= bis) return true;
  if (!monate || datum > bis) return false;
  const mi = fristMonat(datum);
  const von = fristMonat(ab); const ende = fristMonat(bis);
  if (mi === null || von === null || ende === null) return true;
  const s = Math.max(von, mi + monate);
  return s + ((((mi - s) % monate) + monate) % monate) <= ende;
}

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

/** Ein Termin im Kalender von „Zu erledigen“ (#528, #725): Frist, Erinnerung oder eine andere Aufgabe mit Datum. */
export type TerminArt = 'frist' | 'erinnerung' | 'aufgabe';
export interface Termin {
  art: TerminArt;
  /** Frist- bzw. Erinnerungsdatum, bei einer Aufgabe ihr Datum. */
  datum: string;
  /** Seit wann die Aufgabe offen ist; sonst das Datum selbst. */
  ab: string;
  text: string;
  mappeId: string; mappeTitel: string; typId: string;
  /** Steht schon als Aufgabe im Eingang. */
  faellig: boolean;
  feldKey?: string | null;
  erinnerungId?: string;
  /** Künftiger Termin einer wiederkehrenden Frist (#528) – berechnet, noch nicht im Feld eingetragen. */
  folgetermin?: boolean;
}

/** Antwort der Termine (Monat und Jahr in „Zu erledigen“, #528, #725): Zeitraum von … bis. */
export interface TermineAntwort {
  heute: string;
  von: string;
  bis: string;
  eintraege: Termin[];
  /** Gesetzliche Feiertage im Zeitraum (Region, #726), Datum → Name. */
  feiertage: Record<string, string>;
}

/** Freie Erinnerung an einer Mappe (#131), solange sie noch nicht fällig ist. */
export interface Erinnerung {
  id: string; mappeId: string; empfaengerId: string | null; datum: string; text: string;
  erstellt: string; erstelltVon: string | null;
  /** Für Listen. */
  mappeTitel?: string; typId?: string;
}

/**
 * „Datum erreicht“ (#724): Welche Feld-Daten sind an `tag` erreicht? Genau die D mit D − Vorlauf = tag. Bei Monaten
 * kappt das Monatsende (31.05. − 3 Monate = 28./29.02.) – am letzten Tag des Februars sind dann 28.–31.05. erreicht.
 */
export function erreichteDaten(tag: string, vorlauf: number, einheit: VorlaufEinheit): string[] {
  if (einheit !== 'monate') return [verschiebe(tag, vorlauf * (einheit === 'wochen' ? 7 : 1))];
  const ziel = verschiebe(tag, vorlauf, 'monate');
  const erg: string[] = [];
  for (let d = `${ziel.slice(0, 8)}01`; d.slice(0, 7) === ziel.slice(0, 7); d = verschiebe(d, 1)) if (verschiebe(d, -vorlauf, 'monate') === tag) erg.push(d);
  return erg;
}

/** Vorlauf lesbar: „heute“, „in 3 Monaten“, „vor 2 Wochen“. */
export function vorlaufText(vorlauf: number, einheit: VorlaufEinheit): string {
  if (!vorlauf) return 'heute';
  const n = Math.abs(vorlauf);
  const wort = einheit === 'tage' ? (t('gemeinsam.automatisierung.tagen', { anzahl: n })) : einheit === 'wochen' ? (t('gemeinsam.automatisierung.wochen', { anzahl: n })) : (t('gemeinsam.automatisierung.monaten', { anzahl: n }));
  return `${vorlauf > 0 ? 'in' : 'vor'} ${n} ${wort}`;
}
