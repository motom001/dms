/** Schnittstelle der Werkbank → Rundgänge (#941): alle sehen, an/aus, eigene prüfen, speichern und löschen. */
import type { RundgangPruefergebnis, TippDaten, WerkbankRundgaengeStand, WerkbankTippsStand } from '../../../shared/src/entdecken-werkbank';
import { anfrage } from './anfrage';

interface Gespeichert {
  schluessel: string;
  yaml: string;
  geaendert: string;
  von: string | null;
}
const pfad = (schluessel: string) => `/api/werkbank/rundgaenge/${encodeURIComponent(schluessel)}`;

export const rundgaengeApi = {
  stand: () => anfrage<WerkbankRundgaengeStand>('GET', '/api/werkbank/rundgaenge'),
  /** `herkunft` (#1533): Rundgang von Ablago oder aus einem Paket mit seiner Herkunft prüfen (nur fürs Ausprobieren). */
  pruefen: (yaml: string, herkunft?: string) =>
    anfrage<RundgangPruefergebnis>('POST', '/api/werkbank/rundgaenge/pruefen', { yaml, ...(herkunft ? { herkunft } : {}) }),
  neu: (yaml: string) => anfrage<Gespeichert>('POST', '/api/werkbank/rundgaenge', { yaml }),
  /** `schluessel` ohne „eigen:“; `stand` = geaendert, wie gelesen (#917). */
  aendern: (schluessel: string, yaml: string, stand?: string) =>
    anfrage<Gespeichert>('PUT', pfad(schluessel), { yaml, ...(stand ? { stand } : {}) }),
  loeschen: (schluessel: string) => anfrage<null>('DELETE', pfad(schluessel)),
  /** Voller Schlüssel (ablago, paket:schluessel, eigen:schluessel). */
  schalten: (schluessel: string, an: boolean) => anfrage<null>('PUT', `${pfad(schluessel)}/an`, { an }),
};

/** Werkbank → Tipps (#942). `schluessel` voll (ablago-Tipp, paket:schluessel, eigen:tipp_1). */
const tippPfad = (schluessel: string) => `/api/werkbank/tipps/${encodeURIComponent(schluessel)}`;
export const tippsApi = {
  stand: () => anfrage<WerkbankTippsStand>('GET', '/api/werkbank/tipps'),
  neu: (daten: TippDaten) => anfrage<{ schluessel: string; geaendert: string }>('POST', '/api/werkbank/tipps', { daten }),
  /** Eigenen ändern bzw. Tipp von Ablago oder aus einem Paket anpassen; `stand` wie gelesen (#917). */
  aendern: (schluessel: string, daten: TippDaten, stand?: string) =>
    anfrage<{ schluessel: string; geaendert: string }>('PUT', tippPfad(schluessel), { daten, ...(stand !== undefined ? { stand } : {}) }),
  /** Eigenen löschen bzw. auf das Original zurücksetzen. */
  loeschen: (schluessel: string) => anfrage<null>('DELETE', tippPfad(schluessel)),
  schalten: (schluessel: string, an: boolean) => anfrage<null>('PUT', `${tippPfad(schluessel)}/an`, { an }),
  mappe: (typ: string) => anfrage<{ pfad: string | null }>('GET', `/api/werkbank/tipps/mappe/${encodeURIComponent(typ)}`),
};
