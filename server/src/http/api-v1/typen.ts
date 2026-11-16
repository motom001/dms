import type { Route, Anfrage, Antwort } from '../routen-typen';

/**
 * Öffentliche, stabile Schnittstelle /api/v1 (#20).
 *
 * Sie verwendet dieselben Funktionen wie die Oberfläche, hat aber eigene, feste
 * Adressen: Ändert sich die Oberfläche intern, bleibt /api/v1 gleich. Nur hier
 * gelten API-Schlüssel (Authorization: Bearer dms_…); eine Sitzung der
 * Oberfläche funktioniert ebenfalls. Die OpenAPI-Beschreibung entsteht aus
 * derselben Tabelle und passt damit immer zur installierten Version.
 */

export type Schema = Record<string, unknown>;
export interface Parameter {
  name: string;
  wo: 'path' | 'query';
  typ: 'string' | 'integer' | 'boolean';
  pflicht?: boolean;
  beschreibung: string;
}
export interface V1 {
  methode: Route['methode'];
  pfad: string;
  gruppe: 'Konto' | 'Ablage' | 'Dokumente' | 'Werkbank';
  zusammenfassung: string;
  beschreibung?: string;
  /** Interne Route, deren Handler genutzt wird. */
  intern?: { methode: Route['methode']; pfad: string };
  /** Eigener Handler, wenn Parameter abweichen. */
  handler?: (a: Anfrage, intern: (m: Route['methode'], p: string) => Route) => Promise<Antwort>;
  parameter?: Parameter[];
  body?: string | 'binaer';
  antwort?: string | 'binaer' | null;
  status?: number;
  /** Beschreibung der Antwort 409 (z. B. gleichzeitig geändert, #609). */
  konflikt?: string;
  /** ETag und 304 bei If-None-Match (#625). */
  nichtGeaendert?: boolean;
}
