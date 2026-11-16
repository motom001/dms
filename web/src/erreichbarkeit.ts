/**
 * Erreichbarkeit (#122) ohne Oberfläche (#1278, Schritt 5; vorher in erreichbar.tsx): der Zustand, den api/anfrage.ts
 * bei jeder Anfrage nachführt, und die Meldung, wenn Ablago nicht antwortet. Die Leiste und die Hooks stehen weiter in
 * erreichbar.tsx – die Anfragen binden so keine Bausteine der Oberfläche ein.
 */
import { Erreichbarkeit, type Gesundheit } from '../../shared/src/erreichbarkeit';
import { t } from './sprache';
import { sprache } from '../../shared/src/sprache';
import { antwortGekommen } from './startbild';

/** Wird ausgelöst, sobald das DMS nach einem Ausfall wieder antwortet. */
export const WIEDER_ERREICHBAR = 'dms:wieder-erreichbar';
export const NICHT_ERREICHBAR = t('oberflaeche.erreichbar.ablago-ist-gerade-nicht');
export const erreichbarkeit = new Erreichbarkeit(
  {
    gesundheit: async () => {
      const r = await fetch('/api/gesundheit', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'x-dms': '1', 'x-sprache': sprache() },
      });
      const g = (await r.json().catch(() => null)) as Gesundheit | null;
      // 503 mit „datenbank“ (#1198): Ablago antwortet, die Datenbank nicht – die Leiste sagt „beschäftigt“.
      return r.ok || g?.zustand === 'datenbank' ? g : null;
    },
    jetzt: () => Date.now(),
    spaeter: (f, ms) => setTimeout(f, ms),
    abbrechen: (eintrag) => clearTimeout(eintrag as ReturnType<typeof setTimeout>),
  },
  () => {
    antwortGekommen();
    dispatchEvent(new Event(WIEDER_ERREICHBAR));
  },
);
