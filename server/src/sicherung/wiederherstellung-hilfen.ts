/** Wiederherstellung (#1278 aus wiederherstellung.ts): Typen, Schema-Namen und Hilfen ohne die Klasse. */
import postgres from 'postgres';
import { normalize, sep } from 'node:path';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';
import type { Metadaten, Sicherung } from './sicherung';

export const log = protokoll.modul('sicherung');
export const STAGING = 'dms_wh_';
export const ALT = 'dms_alt_';
/** Altes Schema, wenn vorher keine Sicherung möglich war: bleibt 7 Tage. */
export const BEHALTEN = 'dms_alt_behalten_';
export const BEHALTEN_TAGE = 7;
/** Prüfschritt (#562): Erweiterungen der Suche vorhanden und sicher vor dem Aufräumen, Trigramm-Indizes eingespielt. */
export const ERWEITERUNGEN_SCHRITT = t('meldungen.wiederherstellung.erweiterungen-der-datenbank');

export type Schrittstatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'hinweis' | 'ausgelassen';
export interface Schritt {
  name: string;
  status: Schrittstatus;
  info?: string;
}

export interface Wiederherstellungslauf {
  art: 'wiederherstellung' | 'probe';
  sicherung: string;
  von: string;
  status: 'laeuft' | 'fertig' | 'fehler' | 'neustart';
  schritte: Schritt[];
  bytes: number;
  gesamt: number;
  gestartet: string;
  beendet?: string;
  fehler?: string;
  /** Probe (#1383): alle Schritte erledigt, nur das Ergebnis ließ sich nicht speichern (Grund in `fehler`). */
  ergebnisNichtGespeichert?: boolean;
}

/** Was nach dem Neustart als Abschlussmeldung erscheint. */
export interface Abschluss {
  am: string;
  sicherung: string;
  von: string;
  schritte: Schritt[];
  hinweise: string[];
}

export interface Abgleich {
  name: string;
  meta: Metadaten;
  /** Versionen damals ↔ heute. */
  vergleich: Array<{ was: string; damals: string; heute: string; urteil: 'gleich' | 'ok' | 'hinweis' | 'fehler'; info?: string }>;
  probleme: string[];
  hinweise: string[];
  /** Ohne Eingabe vom Notfallblatt nicht lesbar (Schlüssel fehlt oder passt nicht). */
  schluesselNoetig: boolean;
}

export interface Laufzeit {
  dms: string;
  postgres: string;
  architektur: string;
  haushaltId: string;
  migrationen: string[];
}

export interface WiederherstellungsQuellen {
  /** Verbindungs-URL der Datenbank (für eigene Verbindungen ins neue Schema). */
  url: string;
  /** Hauptverbindung (Schema public). */
  sql: postgres.Sql;
  migrationen: string;
  dateiWurzel: string;
  sicherung: Sicherung;
  tresor: { datei: string; fingerabdruck: string | null; alsText(): string | null };
  laufzeit(): Promise<Laufzeit>;
  /** Läuft der Wartungsmodus aktiv (#102)? */
  wartungAktiv(): boolean;
  /** Gibt es schon Benutzer? (Frisches System = nein.) */
  einrichtungNoetig(): Promise<boolean>;
  /** Nach dem Umschalten: neu starten (im Container: Prozess beenden, Docker startet neu). */
  neustart(): void;
  /** Gehört die Sicherung zu einem anderen Mandanten: dessen Id für den Neustart übernehmen (#119). */
  mandantUebernehmen?: (id: string) => Promise<void>;
  /** Einrichtungscode prüfen (frisches System, #119); wirft bei falschem Code. */
  pruefeCode?: (code: unknown) => void | Promise<void>;
  anAdmins?: (betreff: import('../mail/mail').MailText, text: import('../mail/mail').MailText) => Promise<void>;
  jetzt?: () => Date;
}

/** Spaltenwerte eines Satzes; null = nicht gefunden. */
export const istSicherer = (pfad: string) => {
  const n = normalize(pfad);
  return !!pfad && !n.startsWith('..') && !n.startsWith(sep) && !n.includes(`..${sep}`) && !/^[a-zA-Z]:/.test(n);
};

/** Versionen vergleichen: „0.20.0“ < „0.21.0“. */
export function vergleicheVersion(a: string, b: string): number {
  const x = a.split(/[.-]/).map((t) => Number.parseInt(t, 10));
  const y = b.split(/[.-]/).map((t) => Number.parseInt(t, 10));
  for (let i = 0; i < 3; i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}
