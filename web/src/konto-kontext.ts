import { createContext, useContext } from 'react';
import type { Benutzer } from '../../shared/src/model';
import type { UebersetzenAngebot } from '../../shared/src/uebersetzung';
import type { Verwaltungsstand } from '../../shared/src/verwaltungsrecht';
import type { KontoStatus, SprachStatus } from './api';
import { t } from './sprache';

/**
 * Das angemeldete Konto als React-Kontext (aus konto.tsx gelöst, #968): Bausteine wie das Hilfesymbol lesen es, ohne
 * konto.tsx mit Anmeldung, Einrichtungsassistent und Co. zu laden – sonst entstünde über die Bausteine ein Kreislauf
 * (Seite des Assistenten → Bausteine → Hilfe → konto.tsx → Assistent). Den Provider setzt `KontoProvider` in konto.tsx.
 */
export interface Konto {
  ich: Benutzer; mail: boolean; abmelden(): Promise<void>; aktualisieren(): Promise<void>;
  /** Lassen sich Passwörter speichern (Schlüssel vorhanden)? */
  passwoerterMoeglich: boolean;
  vertretung: KontoStatus['vertretung'];
  hinweise: NonNullable<KontoStatus['hinweise']>;
  /** Version der Installation – für Links ins passende Handbuch (#111). */
  version: string | null;
  /** Zwei-Faktor (#242, #416): eingerichtet? Vorgeschrieben, aber erst ab der nächsten Anmeldung (Hinweis oben)? */
  zweifaktor: { aktiv: boolean; ausstehend: boolean };
  /** Passkeys (#811): eigener vorhanden? Vorgeschrieben, aber erst ab der nächsten Anmeldung (Hinweis oben)? */
  passkey: { aktiv: boolean; ausstehend: boolean };
  /** Favoriten benachrichtigen (#506): von der Werkbank erlaubt? Sonst kein Schalter an den Favoriten. */
  favoritenBenachrichtigung: boolean;
  /** Laufwerk (#720): vom Administrator eingeschaltet? Sonst kein Menüeintrag, kein Bereich. */
  laufwerk: boolean;
  /** Aufgaben ohne Empfänger (#719): Sieht er sie (Administrator oder gewählter Alltags-Benutzer)? */
  ohneEmpfaenger: boolean;
  /** Technische Aufgaben (#719): Für die Verwaltung liegt etwas an (nur ja/nein). */
  verwaltung: boolean;
  /** Verwaltungsmodus (#819): darf ich verwalten, läuft er, welche Bereiche? */
  verwaltungsmodus: Verwaltungsstand;
  /** Sprachen (#729): erlaubte Sprachen und Sprache der Installation – für Mein Konto. */
  sprachen: SprachStatus;
  /** Inhalte übersetzen (#732): Angebot (Paket, Zielsprache, Netz) oder null; `aus`, wenn die Person es abgeschaltet hat. */
  uebersetzen: UebersetzenAngebot | null;
  /** „Ablago verwalten“: Modus beginnen (wenn nötig mit erneuter Anmeldung) und in die Werkbank. */
  verwalten(): Promise<void>;
  /** „Verwaltung beenden“: zurück in die Ablage. */
  verwaltungBeenden(): Promise<void>;
}
export const Ctx = createContext<Konto | null>(null);

export function useKonto(): Konto {
  const k = useContext(Ctx);
  if (!k) throw new Error(t('oberflaeche.konto.kontoprovider-fehlt'));
  return k;
}

/**
 * Konto, falls jemand angemeldet ist – sonst null (#881). Für Bausteine, die auch im Einrichtungsassistenten
 * laufen: Der steht vor dem Provider, dort gibt es noch kein Konto.
 */
export function useKontoOptional(): Konto | null {
  return useContext(Ctx);
}

