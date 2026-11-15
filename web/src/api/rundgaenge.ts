/** Schnittstelle der Werkbank → Rundgänge (#941): alle sehen, an/aus, eigene prüfen, speichern und löschen. */
import type { RundgangPruefergebnis, WerkbankRundgaengeStand } from '../../../shared/src/entdecken-werkbank';
import { anfrage } from './anfrage';

interface Gespeichert { schluessel: string; yaml: string; geaendert: string; von: string | null }
const pfad = (schluessel: string) => `/api/werkbank/rundgaenge/${encodeURIComponent(schluessel)}`;

export const rundgaengeApi = {
  stand: () => anfrage<WerkbankRundgaengeStand>('GET', '/api/werkbank/rundgaenge'),
  pruefen: (yaml: string) => anfrage<RundgangPruefergebnis>('POST', '/api/werkbank/rundgaenge/pruefen', { yaml }),
  neu: (yaml: string) => anfrage<Gespeichert>('POST', '/api/werkbank/rundgaenge', { yaml }),
  /** `schluessel` ohne „eigen:“; `stand` = geaendert, wie gelesen (#917). */
  aendern: (schluessel: string, yaml: string, stand?: string) => anfrage<Gespeichert>('PUT', pfad(schluessel), { yaml, ...(stand ? { stand } : {}) }),
  loeschen: (schluessel: string) => anfrage<null>('DELETE', pfad(schluessel)),
  /** Voller Schlüssel (ablago, paket:schluessel, eigen:schluessel). */
  schalten: (schluessel: string, an: boolean) => anfrage<null>('PUT', `${pfad(schluessel)}/an`, { an }),
};
