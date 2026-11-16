/**
 * Texterkennung (#45) – #1278, vorher `shared/src/model.ts`: Ausschnitte und Stand der Erkennung.
 */
import { t } from '../texte';

/* ---------- Texterkennung (#45) ---------- */
/** Fundstelle im Volltext: Dokument und Textausschnitt; Treffer zwischen TREFFER_ANFANG und TREFFER_ENDE. */
export interface Ausschnitt {
  dokument: string;
  text: string;
  /** Anlagen (#998): gefunden in Anlage n eines Dokuments – die Liste zeigt „in Anlage 2“. */
  anlage?: number;
  /**
   * Teile (#1031): gefunden in einem Teil dieser Mappe („gefunden in Rechnungsposition …“) – nur, wenn die Person den Teil
   * lesen darf. `dokument` und `text` sind dann die Fundstelle im Teil (leer, wenn der Begriff in seinen Feldern steht).
   */
  teil?: { id: string; typId: string; titel: string };
}
export const TREFFER_ANFANG = '\u0002';
export const TREFFER_ENDE = '\u0003';
export const OCR_STAENDE = {
  keiner: t('gemeinsam.model.ohne-volltext'),
  wartet: 'wartet',
  laeuft: 'läuft',
  fertig: 'fertig',
  fehler: t('gemeinsam.model.fehler'),
  ausgelassen: 'ausgelassen',
  /** #458: Textebene gelesen, das Paket für die Texterkennung ist dran (bzw. noch nicht installiert). */
  paket: t('gemeinsam.model.wartet-auf-texterkennung'),
} as const;
export type OcrStandArt = keyof typeof OCR_STAENDE;
export interface OcrStand {
  stand: OcrStandArt;
  /** Fehlermeldung, Grund fürs Auslassen oder Herkunft des Texts (Textebene/Texterkennung). */
  info?: string | null;
  seiten?: number | null;
  zeit?: string | null;
}
