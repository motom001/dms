/**
 * Mappen und ihre Werte (#1278, vorher `shared/src/model.ts`): Werte, Mappe, Bezug und das Ergebnis einer Prüfung.
 */
import type { Zeitraum } from '../feldarten';
import type { Mappentyp } from './mappentyp';

export interface Betrag {
  betrag: number;
  waehrung: string;
}
/**
 * Wert eines Passwortfelds (#46), wie ihn Oberfläche und API sehen: nie das Passwort selbst.
 * - gesetzt/lesbar: kommt vom Server (lesbar = false, wenn der Schlüssel dazu fehlt)
 * - neu: zum Speichern eines neuen Passworts; entfernen: zum Löschen
 */
export interface PasswortWert {
  gesetzt?: boolean;
  lesbar?: boolean;
  neu?: string;
  entfernen?: boolean;
}
export type Wert = string | number | boolean | Betrag | Zeitraum | string[] | PasswortWert | null;
export const istPasswortWert = (v: unknown): v is PasswortWert =>
  !!v && typeof v === 'object' && !Array.isArray(v) && ('gesetzt' in v || 'neu' in v || 'entfernen' in v);
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
  /** Passt zur aktuellen Definition des Typs (vom Server geprüft); sonst steht in problem der erste Grund. */
  passt?: boolean;
  problem?: string | null;
  /** Mappen, die das System pflegt: Systemrollen (rolle:mitglied, rolle:systemkonto, rolle:paket). */
  systemKennung?: string | null;
  /**
   * Vorgabe aus einem Paket (#1038): feste Kennung `paket:<id>:<schluessel>` (siehe shared/src/vorgaben.ts). Fehlt bei
   * allen anderen Mappen. Eine Vorgabe ist eine gewöhnliche Mappe – sie lässt sich ändern und löschen.
   */
  vorgabe?: string | null;
  /** Berechtigungen (#124): im Eingang wegen einer Aufgabe, aber nicht lesbar – ohne Titel und Werte. */
  verborgen?: boolean;
}

/** Kurzangaben zu einer Mappe, auf die verwiesen wird oder die verweist. */
export interface MappenBezug {
  titel: string;
  typId: string;
  /** Berechtigungen (#124): nicht lesbar, Titel ausgeblendet. */ verborgen?: boolean;
}

/** Erster Grund, warum Werte nicht zur Definition passen (für Listen und den Eingang). */
export function ersterGrund(t: Pick<Mappentyp, 'felder'>, p: Pruefergebnis): string | null {
  const [key, msg] = Object.entries(p.felder)[0] ?? [];
  if (key) return `${t.felder.find((f) => f.key === key)?.label ?? key}: ${msg?.[0] ?? 'ungültig'}`;
  return p.allgemein[0] ?? null;
}

/** Ergebnis einer Prüfung: allgemeine Meldungen und Meldungen je Feld. */
export interface Pruefergebnis {
  allgemein: string[];
  /** Mappen: je Feldschlüssel. Mappentypen: je Feldposition. */
  felder: Record<string, string[]>;
  /** Mappentypen (#144): zu jeder allgemeinen Meldung der Bereich im Editor (grunddaten, titel, trefferlisten, register). */
  orte?: string[];
}
export const istOk = (p: Pruefergebnis) => p.allgemein.length === 0 && Object.keys(p.felder).length === 0;
