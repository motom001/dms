/**
 * Aufgaben (#54, #56) und Notizen (#55) – #1278, vorher `shared/src/model.ts`.
 */
import { t } from '../texte';

/* ---------- Aufgaben (#54, #56) ---------- */
export const AUFGABENARTEN = {
  passung: t('gemeinsam.model.passt-nicht'),
  erwaehnung: 'Erwähnung',
  manuell: 'Zugewiesen',
  vertretung: 'Vertretung',
  frist: 'Frist',
  erinnerung: 'Erinnerung',
  post: t('gemeinsam.model.post-fuer-dich'),
  auskunft: 'Auskunft',
  aenderung: 'Geändert',
  zugeordnet: t('gemeinsam.model.automatisch-zugeordnet'),
} as const;
export type Aufgabenart = keyof typeof AUFGABENARTEN;
export interface Aufgabe {
  id: string;
  mappeId: string;
  /** null = Administratoren. */
  empfaengerId: string | null;
  art: Aufgabenart;
  text: string;
  feldKey?: string | null;
  /** Frist und Erinnerung (#129, #131): das Datum, um das es geht. */
  datum?: string | null;
  /** Warum es die Aufgabe gibt – fällt der Anlass weg, erledigt sie sich selbst (#724). Ohne: nur von Hand. */
  anlass?: AufgabenAnlass | null;
  erstellt: string;
  erstelltVon: string | null;
  erledigt: string | null;
  erledigtVon: string | null;
  /** Für Listen: Titel und Typ der Mappe. */
  mappeTitel?: string;
  typId?: string;
}
export const AUFGABE_MAX = 2000;
/**
 * Aufgabe bei einer Person ohne Leserecht (#798): Von wann bis wann lag die Aufgabe bei jemandem, der die Mappe nach
 * den Berechtigungen nicht lesen darf – und ob der Admin ein Leserecht auf Zeit gegeben hat. Offen, solange `ende` leer
 * ist. Das Leserecht auf Zeit gilt nur für diese Mappe und nur, solange die Aufgabe offen bei dieser Person liegt.
 */
export interface FallOhneLeserecht {
  id: string;
  aufgabeId: string;
  mappeId: string;
  benutzerId: string;
  /** Text der Aufgabe beim Entstehen des Falls (die Aufgabe kann es später nicht mehr geben). */
  aufgabentext: string;
  beginn: string;
  ende: string | null;
  /** Warum der Fall endete: Aufgabe erledigt, gelöscht, an jemand anderen gegeben – oder die Person darf jetzt lesen. */
  endeGrund: FallEnde | null;
  leserechtSeit: string | null;
  leserechtVon: string | null;
  /** Für Listen: Titel und Typ der Mappe (fehlen, wenn es die Mappe nicht mehr gibt). */
  mappeTitel?: string;
  typId?: string;
}
export type FallEnde = 'erledigt' | 'geloescht' | 'weitergegeben' | 'lesbar';
/**
 * Anlass einer Aufgabe (#724), gemeinsam für Kern und Automatisierungen:
 * - `datum`: Das Datumsfeld `feld` der Mappe hat das Datum der Aufgabe – geändert oder geleert → erledigt;
 *   `wiederholung` (Monate) → nach dem Erledigen den Folgetermin vorschlagen.
 * - `post`: Die Post ist neu – zugeordnet oder erledigt → erledigt.
 * - `abwesenheit`: Der Benutzer ist abwesend – Abwesenheit beendet → erledigt.
 * - `favorit` (#889): Ein Favorit (`mappe`) wurde erwähnt – nur zur Unterscheidung, erledigt sich nicht selbst.
 * `automatisierung`: Id der Automatisierung, die die Aufgabe angelegt hat (zur Anzeige und zum Erkennen).
 */
export type AufgabenAnlass = (
  | { art: 'datum'; feld: string; wiederholung?: number | null }
  | { art: 'post' }
  | { art: 'abwesenheit'; benutzer: string }
  | { art: 'favorit'; mappe: string }
) & { automatisierung?: string };

/* ---------- Notizen (#55) ---------- */
export interface Notiz {
  id: string;
  mappeId: string;
  text: string;
  erstellt: string;
  erstelltVon: string | null;
  geaendert: string;
  geaendertVon: string | null;
}
export const NOTIZ_MAX = 20_000;
