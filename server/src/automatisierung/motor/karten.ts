/**
 * Dann-Karten (#674, #1278): was eine Karte zum Ausführen bekommt und die Liste der ausführenden Karten – neue Karten
 * melden sich dort an (`automatisierung-karten.ts`, `automatisierung-aussen.ts`).
 */
import type { Dienst } from '../../dienst/dienst';
import type { Zugriff } from '../../kern';
import type { Benutzer, Mappe, Mappentyp } from '../../../../shared/src/model';
import type { Automatisierung, Empfaenger, DannKarte, DannArt } from '../../../../shared/src/automatisierung';
import type { SystemWerkbank } from '../automatisierung-werkbank';
import { Ausleitung } from '../ausleitung';

/* ---------- Dann-Karten ---------- */

/** Was eine Dann-Karte zum Ausführen bekommt. */
export interface KartenKontext {
  dienst: Dienst;
  /** Zugriff des Kontos, unter dem die Automatisierung läuft (Systemkonto „Automatisierung“). */
  z: Zugriff;
  konto: Benutzer;
  automatisierung: Automatisierung;
  mappe: Mappe | null;
  typ: Mappentyp | null;
  /** Angaben des Ereignisses (nur Ids, Schlüssel, Datum). */
  daten: Record<string, unknown>;
  /** Id des auslösenden Ereignisses (#1082: feste Ids für Folge-Ereignisse; beim Probelauf die des Laufs). */
  ereignisId: string;
  /** Nur beschreiben, was passieren würde. */
  trocken: boolean;
  /** Text mit Platzhaltern füllen (Werte mit den Rechten des Kontos). */
  fuelle(text: string): Promise<string>;
  /**
   * Text mit Platzhaltern für einen Empfänger füllen (#795): mit den Rechten des Kontos **und** des Empfängers (null =
   * Administratoren: nur die des Kontos). `verborgen`: Platzhalter, die er nicht sehen darf („(nicht sichtbar)“) –
   * mehr als beim Konto selbst; `mappe`: false, wenn er die Mappe gar nicht lesen darf.
   */
  fuelleFuer(text: string, an: string | null): Promise<{ text: string; verborgen: number; mappe: boolean }>;
  /** Personen hinter einem Empfänger (aktive Benutzer). */
  personen(e: Empfaenger): Promise<string[]>;
  /**
   * Auslösende Person (#671): Benutzer-Id, wenn ein Mensch das Ereignis ausgelöst hat; sonst null (Zeitplan, Datum,
   * System, Paket, Automatisierung, Probelauf). Mails an ein Feld füllen ihre Platzhalter mit deren Rechten.
   */
  person: string | null;
  /** Vermerk für die Historie der Mappe: „durch Automatisierung ‚…‘ (eingerichtet von …)“. */
  anlass: Record<string, unknown>;
  /** Werkbank-Rechte des Systemkontos (#677) – genau die Liste, sonst nichts; fehlt in Tests ohne Werkbank. */
  werkbank?: SystemWerkbank;
  /** Id des Laufs und Art des Ereignisses (#671: Karten nach außen nennen sie in der Meldung). */
  laufId?: string;
  anlassArt?: string;
  /** Karten nach außen (#671): Ausgangskorb und Adresse von Ablago (für Links und den Hinweissatz der E-Mail). */
  aussen?: { ausleitung: Ausleitung; basis: () => string };
}
/**
 * Die Karte hat nichts zu tun, weil ihr Ziel fehlt (#1082: Paket entfernt oder ohne das Ereignis) – der Schritt gilt als
 * übersprungen, nicht als Fehler: kein Wiederholen, keine Fehlerflut, die Automatisierung bleibt an.
 */
export class KarteLeer extends Error {}
/** Führt eine Karte aus (bzw. beschreibt sie im Trockenlauf) und liefert eine Zeile fürs Protokoll. */
export type DannAusfuehrer = (k: DannKarte, c: KartenKontext) => Promise<string>;
/** Ausführende Karten; „stopp“ erledigt der Motor selbst. */
export const DANN_AUSFUEHRER: Partial<Record<DannArt, DannAusfuehrer>> = {};
