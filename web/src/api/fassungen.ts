/** Schnittstelle (#1234): Fassungen (#1006): Liste, Vergleich, Vorschau und Wiederherstellen für Mappen, Typen und Einstellungen. */
import { FASSUNG_PFAD, type FassungArt, type FassungsListe, type FassungsVorschau, type GeloeschterEintrag } from '../../../shared/src/fassungen';
import { anfrage } from './anfrage';

/** Adresse eines Eintrags für die Fassungen (#1006). */
const fassungsPfad = (art: FassungArt, eintrag: string) => FASSUNG_PFAD[art].replace(/:(id|schluessel|kennung)/, encodeURIComponent(eintrag));

export const fassungenApi = {
  // Fassungen (#1006): je Gegenstand unter der Adresse seines Eintrags.
  fassungen: (art: FassungArt, eintrag: string) => anfrage<FassungsListe>('GET', `${fassungsPfad(art, eintrag)}/fassungen`),
  fassungenVergleich: (art: FassungArt, eintrag: string, von: number, bis: number) => anfrage<{ von: number; bis: number; aenderungen: string[] }>('GET', `${fassungsPfad(art, eintrag)}/fassungen/vergleich?von=${von}&bis=${bis}`),
  fassungVorschau: (art: FassungArt, eintrag: string, nr: number) => anfrage<FassungsVorschau>('GET', `${fassungsPfad(art, eintrag)}/fassungen/${nr}`),
  fassungWiederherstellen: (art: FassungArt, eintrag: string, nr: number, e: { stand: string | null; bestaetigt?: boolean; doppelteBestaetigt?: boolean; adresseBestaetigt?: boolean }) =>
    anfrage<FassungsListe>('POST', `${fassungsPfad(art, eintrag)}/fassungen/${nr}/wiederherstellen`, e),
  fassungenGeloescht: (arten: FassungArt[]) => anfrage<GeloeschterEintrag[]>('GET', `/api/werkbank/fassungen/geloescht?art=${arten.join(',')}`),
};
