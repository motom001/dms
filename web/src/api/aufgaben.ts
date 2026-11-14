/** Schnittstelle (#1234): Aufgaben, Termine und Empfänger von Aufgaben. */
import type { Aufgabe, FallOhneLeserecht, Mappe } from '../../../shared/src/model';
import type { Termin, TermineAntwort } from '../../../shared/src/fristen';
import { ApiFehler, anfrage } from './anfrage';

/** #719: gewählter Alltags-Benutzer (null = nur Administratoren); `gespeichert` kann ein inzwischen ungeeigneter sein. */
export type AufgabenEmpfaenger = { benutzerId: string | null; wirksam: string | null; gesetzt: boolean; gespeichert: string | null };
/** 404 ohne Leserecht (#124): eigene offene Aufgaben an der Mappe, zum Erledigen oder Weitergeben. */
export const verborgeneAufgaben = (x: unknown): Aufgabe[] | null => {
  const d = x instanceof ApiFehler && x.status === 404 ? x.details as { verborgen?: boolean; aufgaben?: Aufgabe[] } | undefined : undefined;
  return d?.verborgen ? d.aufgaben ?? [] : null;
};

export const aufgabenApi = {
  /* Aufgaben (#54) */
  /** Mit folgetermin bei wiederkehrenden Fristen (#130). */
  aufgabeErledigt: (id: string) => anfrage<Aufgabe & { folgetermin?: string }>('POST', `/api/aufgaben/${id}/erledigt`),
  /** Automatisch zugeordnet (#337): Rückgängig aus der Aufgabe. */
  zuordnungRueckgaengig: (id: string) => anfrage<{ post: Mappe; dokumente: number }>('POST', `/api/aufgaben/${id}/rueckgaengig`),
  folgetermin: (id: string) => anfrage<Mappe & { hinweis?: string }>('POST', `/api/aufgaben/${id}/folgetermin`),
  /** „Zu erledigen“ → Monat und Jahr (#528, #725): ein Zeitraum in einer Anfrage, mit Folgeterminen und Feiertagen. */
  termine: (von: string, bis: string, favoriten = false) => anfrage<TermineAntwort>('GET', `/api/termine?von=${von}&bis=${bis}${favoriten ? '&favoriten=1' : ''}`),
  /** Startseite (#725): Kachel „Nächster Termin“. */
  naechsterTermin: () => anfrage<{ termin: Termin | null; ueberfaellig: number }>('GET', '/api/termine/naechster'),
  aufgabeDelegieren: (id: string, empfaengerId: string) => anfrage<Aufgabe & { hinweis?: string }>('POST', `/api/aufgaben/${id}/delegieren`, { empfaengerId }),
  /** Sammel-Weitergabe und -Erledigen (#415, #419). */
  aufgabenWeitergeben: (ids: string[], empfaengerId: string) => anfrage<{ weitergegeben: string[]; nicht: Array<{ id: string; grund: string }> }>('POST', '/api/aufgaben/weitergeben', { ids, empfaengerId }),
  aufgabenErledigen: (ids: string[]) => anfrage<{ erledigt: string[]; nicht: Array<{ id: string; grund: string }> }>('POST', '/api/aufgaben/erledigt', { ids }),
  meineAufgaben: () => anfrage<Array<Aufgabe & { verborgen?: boolean }>>('GET', '/api/aufgaben'),
  /** Aufgaben bei Personen ohne Leserecht (#798): Übersicht und Leserecht auf Zeit (nur Administratoren). */
  ohneLeserecht: () => anfrage<{ offen: FallOhneLeserecht[]; vergangen: FallOhneLeserecht[] }>('GET', '/api/werkbank/aufgaben/ohne-leserecht'),
  leserechtAufZeit: (fallId: string) => anfrage<FallOhneLeserecht>('POST', `/api/werkbank/aufgaben/ohne-leserecht/${fallId}/leserecht`),
  aufgabenWerkbank: (erledigt = false) => anfrage<{ aufgaben: Aufgabe[]; unlesbar?: string[] }>('GET', `/api/werkbank/aufgaben${erledigt ? '?erledigt' : ''}`),
  // Aufgaben ohne Empfänger gehen an einen Alltags-Benutzer (#719).
  aufgabenEmpfaenger: () => anfrage<AufgabenEmpfaenger>('GET', '/api/werkbank/aufgaben-empfaenger'),
  aufgabenEmpfaengerSpeichern: (benutzerId: string | null) => anfrage<AufgabenEmpfaenger>('PUT', '/api/werkbank/aufgaben-empfaenger', { benutzerId }),
};
