/**
 * Fassungen (#1006): Jedes Speichern eines Eintrags der Werkbank – Mappentyp, Ansicht, Nummernkreis, Stempel-Vorlage,
 * Postfach, Paket-Einstellungen, Automatisierung – ergibt eine Fassung: Zeitpunkt, wer (Person, Paket mit Version,
 * Automatisierung, Update von Ablago, Ablago selbst) und der ganze Stand. Was sich geändert hat, beschreibt
 * `fassungsvergleich.ts` lesbar aus zwei Ständen – nie als JSON-Diff.
 *
 * Server und Oberfläche teilen diese Datei: Arten, Urheber, die Regel zum Zusammenfassen und die Antworten der API.
 */
import { t } from './texte';

/** Die Gegenstände mit Fassungen. Rechte-Regeln gehören zum Mappentyp bzw. zur Ansicht und stehen in deren Fassungen. */
export const FASSUNG_ARTEN = ['typ', 'sicht', 'nummernkreis', 'stempel', 'postfach', 'paketeinstellungen', 'automatisierung'] as const;
export type FassungArt = (typeof FASSUNG_ARTEN)[number];
/** Werkbank-Bereich je Gegenstand (#818): Fassungen sehen und wiederherstellen nur mit dem Verwaltungsrecht des Bereichs. */
export const FASSUNG_BEREICH: Readonly<Record<FassungArt, string>> = {
  typ: 'typen', sicht: 'sichten', nummernkreis: 'nummernkreise', stempel: 'stempel', postfach: 'postfaecher', paketeinstellungen: 'pakete', automatisierung: 'automatisierungen',
};
/**
 * Adressen der Fassungen je Gegenstand: unter der Adresse des Eintrags, damit dieselbe Zuordnung zum Bereich gilt
 * (`verwaltungsbereiche.ts`). `:id` bzw. `:schluessel` ist der Eintrag.
 */
export const FASSUNG_PFAD: Readonly<Record<FassungArt, string>> = {
  typ: '/api/typen/:id', sicht: '/api/sichten/definitionen/:id', nummernkreis: '/api/werkbank/nummernkreise/:schluessel',
  stempel: '/api/werkbank/stempel/vorlagen/:id', postfach: '/api/werkbank/postfaecher/:id', paketeinstellungen: '/api/werkbank/pakete/:id/einstellungen',
  automatisierung: '/api/werkbank/automatisierungen/:id',
};
export const istFassungArt = (x: unknown): x is FassungArt => typeof x === 'string' && (FASSUNG_ARTEN as readonly string[]).includes(x);

/**
 * Wer eine Fassung geschrieben hat. `person` = angemeldete Person (auch über den Befehl `dms`), `paket` = beim
 * Installieren, Aktualisieren oder Entfernen eines Pakets bzw. über sein Dienstkonto (mit Version, `person` hat es
 * angestoßen), `automatisierung` = eine Automatisierung, `update` = beim Start nach einem Update von Ablago
 * (Migrationen und Umzüge), `system` = Ablago selbst (z. B. eine Automatisierung hält an, weil ihr Feld fehlt).
 */
export type Urheber =
  | { art: 'person'; id: string }
  | { art: 'paket'; id: string; name?: string | null; version?: string | null; person?: string | null }
  | { art: 'automatisierung'; id: string }
  | { art: 'update'; version: string }
  | { art: 'system' };

/**
 * JSON mit geordneten Schlüsseln: PostgreSQL ordnet die Schlüssel in jsonb um – zwei gleiche Stände müssen trotzdem
 * gleich vergleichen. undefined fällt weg wie in JSON.
 */
export function kanonisch(x: unknown): string {
  const ordne = (v: unknown): unknown => (Array.isArray(v) ? v.map(ordne)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => [k, ordne((v as Record<string, unknown>)[k])])) : v);
  return JSON.stringify(ordne(x === undefined ? null : x)) ?? 'null';
}
/** Ein Objekt ohne die genannten Schlüssel (Stand für eine Fassung: ohne Id und Zeitstempel). */
export function ohne<T extends object, K extends keyof T>(x: T, ...schluessel: K[]): Omit<T, K> {
  const r = { ...x };
  for (const k of schluessel) delete r[k];
  return r;
}
export const gleicheStaende = (a: unknown, b: unknown): boolean => kanonisch(a) === kanonisch(b);

/** Gleicher Urheber? Pakete zählen mit Version, Personen mit Id. */
export function urheberSchluessel(u: Urheber): string {
  switch (u.art) {
    case 'person': return `person:${u.id}`;
    case 'paket': return `paket:${u.id}@${u.version ?? ''}`;
    case 'automatisierung': return `automatisierung:${u.id}`;
    case 'update': return `update:${u.version}`;
    default: return 'system';
  }
}

/**
 * Zusammenfassen (Regel #1006): Speichert **dieselbe Person** (bzw. dasselbe Paket in derselben Version, dieselbe
 * Automatisierung, dasselbe Update) denselben Eintrag innerhalb von **{@link ZUSAMMENFASSEN_MIN} Minuten** nach Beginn
 * ihrer letzten Fassung noch einmal, wird diese Fassung fortgeschrieben statt eine neue anzulegen – gemessen ab dem
 * Beginn, nicht gleitend, damit auch langes Feilen alle zehn Minuten eine Fassung hinterlässt. Was **ein Vorgang** in
 * mehreren Schritten speichert (eine Anfrage, eine Paket-Installation), ist immer eine Fassung. Nie zusammengefasst wird
 * mit einer **Wiederherstellung** (sie ist eine eigene Fassung, davor und danach bleibt alles stehen) und nach einem
 * **Löschvermerk**. Ergibt das Fortschreiben wieder den Stand davor, verschwindet die Fassung (nichts geändert).
 */
export const ZUSAMMENFASSEN_MIN = 10;

export interface FassungsMerkmale { urheber: Urheber; zeit: string; vorgang?: string | null; wiederhergestellt?: number | null; geloescht?: unknown }

/** Wird `neu` (gerade gespeichert) in die letzte Fassung `letzte` geschrieben statt als eigene Fassung? */
export function zusammenfassen(letzte: FassungsMerkmale, neu: FassungsMerkmale): boolean {
  if (letzte.geloescht) return false;
  if (neu.vorgang && neu.vorgang === letzte.vorgang) return true;
  if (letzte.wiederhergestellt || neu.wiederhergestellt) return false;
  if (urheberSchluessel(letzte.urheber) !== urheberSchluessel(neu.urheber)) return false;
  const ms = Date.parse(neu.zeit) - Date.parse(letzte.zeit);
  return ms >= 0 && ms < ZUSAMMENFASSEN_MIN * 60_000;
}

/** Löschvermerk: wann und durch wen der Eintrag gelöscht wurde; die letzte Fassung bleibt dafür stehen. */
export interface Loeschvermerk { zeit: string; urheber: Urheber }

/** Eine Fassung, wie sie gespeichert ist (Server, Vollexport). */
export interface GespeicherteFassung {
  art: FassungArt;
  /** Id bzw. Kennung des Eintrags (Nummernkreise: ihre Kennung, Paket-Einstellungen: die Paket-Id). */
  eintrag: string;
  /** Fortlaufend je Eintrag, ab 1. */
  nr: number;
  /** Name des Eintrags in dieser Fassung – für gelöschte Einträge und Listen. */
  name: string;
  /** Der ganze Stand (ohne Zeitstempel, ohne Geheimnisse). */
  daten: unknown;
  urheber: Urheber;
  /** Ein Vorgang (Anfrage, Paket-Installation): Schritte desselben Vorgangs sind eine Fassung. */
  vorgang: string | null;
  /** Aus welcher Fassung wiederhergestellt; sonst null. */
  wiederhergestellt: number | null;
  /** Beginn und letzte Änderung (beim Zusammenfassen wächst `bis`). */
  zeit: string;
  bis: string;
  geloescht: Loeschvermerk | null;
}

/** Eine Fassung in der Liste der Oberfläche: Wer als Text, Änderungen zur Fassung davor als lesbare Sätze. */
export interface FassungEintrag {
  nr: number;
  zeit: string;
  bis: string;
  name: string;
  urheber: Urheber;
  /** Urheber lesbar, z. B. „Markus“, „Paket Haushalt 1.4.0“, „Update auf Ablago 0.255.0“. */
  wer: string;
  wiederhergestellt: number | null;
  geloescht: (Loeschvermerk & { wer: string }) | null;
  /** Was sich gegenüber der Fassung davor geändert hat; bei der ersten „Angelegt“ bzw. „Erste Fassung“. */
  aenderungen: string[];
  /** Der aktuelle Stand des Eintrags (die neueste Fassung, solange er nicht gelöscht ist). */
  aktuell: boolean;
}

/** Antwort der Liste: neueste zuerst, dazu der Stand für den Schutz vor gleichzeitigem Speichern (#917). */
export interface FassungsListe { fassungen: FassungEintrag[]; stand: string | null; gesamt: number }

/** Vorschau einer Wiederherstellung: was sich gegenüber jetzt ändert und worauf zu achten ist. */
export interface FassungsVorschau { nr: number; aenderungen: string[]; hinweise: string[]; stand: string | null }

/** Gelöschte Einträge mit ihrer letzten Fassung (Nachweis). */
export interface GeloeschterEintrag { art: FassungArt; eintrag: string; name: string; nr: number; geloescht: Loeschvermerk & { wer: string } }

/** Stand für den Konfliktschutz: neueste Fassung und ihre letzte Änderung; null = noch keine Fassung. */
export const fassungsStand = (f: Pick<GespeicherteFassung, 'nr' | 'bis'> | undefined | null): string | null => (f ? `${f.nr}@${f.bis}` : null);

/** So viele Fassungen zeigt die Liste je Eintrag (die übrigen bleiben gespeichert und im Vollexport). */
export const FASSUNGEN_JE_SEITE = 50;

/**
 * Urheber lesbar. `name(id)` liefert den Namen einer Person, `automatisierung(id)` den einer Automatisierung (beide auch
 * für gelöschte, sonst „unbekannt“).
 */
export function urheberText(u: Urheber, name: (id: string) => string, automatisierung: (id: string) => string = () => '?'): string {
  switch (u.art) {
    case 'person': return name(u.id);
    case 'paket': {
      const paket = t('gemeinsam.fassungen.wer-paket', { name: u.name || u.id, version: u.version ? ` ${u.version}` : '' });
      return u.person ? t('gemeinsam.fassungen.wer-paket-person', { paket, person: name(u.person) }) : paket;
    }
    case 'automatisierung': return t('gemeinsam.fassungen.wer-automatisierung', { name: automatisierung(u.id) });
    case 'update': return t('gemeinsam.fassungen.wer-update', { version: u.version });
    default: return t('gemeinsam.fassungen.wer-system');
  }
}

/** Ids der Personen, die in Urhebern vorkommen – zum Nachschlagen der Namen. */
export function personenIn(liste: Array<Urheber | null | undefined>): string[] {
  const ids = new Set<string>();
  for (const u of liste) {
    if (u?.art === 'person') ids.add(u.id);
    if (u?.art === 'paket' && u.person) ids.add(u.person);
  }
  return [...ids];
}
