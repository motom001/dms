import type { Aufgabe, Aufgabenart, Benutzer } from '../../../shared/src/model';

/*
 * Was die übrigen Klassen dieses Ordners von der Vertretung rufen (#1278, Schritt 5b): beschrieben, nicht eingebunden –
 * die Vertretung ruft ihrerseits fast alle anderen (`AufgabenVertretung` erfüllt diese Schnittstelle).
 */

/** Schlüssel der Sammelbenachrichtigung der Weitergabe (#415; vorher in vertretung.ts). */
export const SAMMEL_WEITERGABE = 'weitergabe';

export interface VertretungTeil {
  /** Liest eine Person je Anfrage nur einmal (#1256); ohne `person` an den Konten keiner. */
  personenLeser(): ((id: string) => Promise<Benutzer | undefined>) | undefined;
  /** Vertreter abwesender Personen (#78), höchstens `VERTRETER_SCHRITTE` weit. */
  empfaengerAufloesen(
    id: string | null,
    lies?: ((id: string) => Promise<Benutzer | undefined>) | undefined,
  ): Promise<{ ziel: string | null; abwesende: string[] }>;
  /** Aufgabe einer abwesenden Person an die Vertretung (#78). */
  leiteUm(a: Aufgabe): Promise<Aufgabe>;
  /** Gebündelte Benachrichtigung (#415, #419, #422); liefert die Id der Aufgabe. */
  benachrichtigeGebuendelt(e: {
    empfaengerId: string;
    mappeId: string;
    art: Aufgabenart;
    schluessel: string;
    von: string | null;
    text: (bisher: Aufgabe | undefined) => string | Promise<string>;
  }): Promise<string>;
}
