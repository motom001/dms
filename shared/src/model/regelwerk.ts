/**
 * Regelwerk der Berechtigungen am Mappentyp (#123–#127, #137) – nur die Form (#1278, Schritt 5; vorher in rechte.ts).
 * Die Auswertung steht weiter in rechte.ts; sie braucht Mappe und Mappentyp, der Mappentyp trägt das Regelwerk.
 */
import type { Bedingung } from '../sichten/bedingungen';
import type { Merkmal } from '../merkmale';
import { t } from '../texte';

export const RECHTE = { C: 'Anlegen', R: 'Lesen', U: 'Bearbeiten', D: 'Löschen', P: t('gemeinsam.rechte.passwoerter-sehen') } as const;
export type Recht = keyof typeof RECHTE;

export type Rechte = Record<Recht, boolean>;

export type Wirkung = 'erteilen' | 'entziehen';

/** Eine Bedingung im „Wenn“ einer Regel; nicht = verneint („ist nicht“). */
export type RegelBedingung = { nicht?: boolean } &
  /** Der aktuelle Benutzer ist einer von … (Benutzer-Ids). */
  (
    | { art: 'benutzer'; benutzer: string[] }
    /** Der aktuelle Benutzer hat eine dieser Rollen (Rollen-Mappen, auch Administrator/Mitglied). */
    | { art: 'rolle'; rollen: string[] }
    /** Ein Feld der Mappe – wie in Sichten, auch „zeigt auf aktuellen Benutzer / seine Rollen“ und „Erstellt von“. */
    | { art: 'feld'; bedingung: Extract<Bedingung, { art: 'feld' }> }
    /** Die Mappe hat eine offene Aufgabe für den aktuellen Benutzer. */
    | { art: 'aufgabe' }
    /** Die Mappe ist die Benutzer-Mappe des aktuellen Benutzers (Typ Benutzer). */
    | { art: 'eigeneMappe' }
    /** Merkmal der Ablage (#1032), z. B. „Ablage wird beruflich genutzt“ – gilt für alle Mappen gleich. */
    | { art: 'merkmal'; merkmal: Merkmal }
  );

export interface Regel {
  id: string;
  name: string;
  wenn: RegelBedingung[];
  dann: Partial<Record<Recht, Wirkung>>;
  stopp: boolean;
}

/** grund: Standard je Recht (#146), gilt, solange keine Regel etwas anderes sagt. */
export interface Regelwerk {
  grund: Rechte;
  regeln: Regel[];
}
