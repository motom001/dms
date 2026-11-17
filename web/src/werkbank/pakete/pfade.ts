import { gebietsschema } from '../../../../shared/src/sprache';
import { t } from '../../sprache';

/** Kennungen in der Adresse der Paketseite und kleine Hilfen der Seite „Pakete“ (#1279 aus Pakete.tsx gezogen). */

/** Kennung des hochgeladenen Pakets in der Adresse. */
export const UPLOAD = t('werkbank.pakete.hochgeladen');
/** Hochgeladene Sammeldatei mit mehreren Paketen (#461). */
export const SAMMEL = t('werkbank.pakete.sammeldatei');
/** Alle aktualisieren (#1168). */
export const ALLE = t('werkbank.pakete.alle-pfad');
/** Frisch installiert (#1047): Die Paketseite zeigt einmal die Kurzanleitung, bis man sie schließt. */
export const NEU = 'neu=1';

export const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–';
