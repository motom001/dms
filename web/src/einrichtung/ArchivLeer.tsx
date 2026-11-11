import type { Archiv } from '../../../shared/src/archiv';
import { Feld } from '../bausteine';
import { t } from '../sprache';

/** Archivmodus ohne Stichtag-Wert in „Ist er leer“: nur mit Stichtag; ohne Stichtag fällt die Angabe weg. */
export const mitStichtag = (a: Archiv, stichtag: string | null): Archiv => {
  const { leererStichtag, ...rest } = a;
  return { ...rest, stichtag, ...(stichtag && leererStichtag ? { leererStichtag } : {}) };
};

/**
 * „Ist ‹Stichtag› leer: ab Anlagedatum (wie bisher) · läuft noch nicht ab“ (#1051) im Archivmodus des Mappentyps.
 * Nur mit Stichtag-Feld; „ab Anlagedatum“ ist die Vorgabe und wird nicht gespeichert.
 */
export function ArchivLeer({ archiv, feldName, setze }: { archiv: Archiv; feldName: string; setze: (a: Archiv) => void }) {
  const laeuftNicht = archiv.leererStichtag === 'laeuftNicht';
  return (
    <Feld beschriftung={t('mappentypen.editor.leerer-stichtag', { feld: feldName })} hilfe="mappentyp.archiv.leer"
      hinweis={laeuftNicht ? t('mappentypen.editor.leer-laeuft-nicht-hinweis', { feld: feldName }) : undefined}>
      <select value={laeuftNicht ? 'laeuftNicht' : 'anlage'} onChange={(ev) => setze(ev.target.value === 'laeuftNicht' ? { ...archiv, leererStichtag: 'laeuftNicht' } : mitStichtag({ ...archiv, leererStichtag: undefined }, archiv.stichtag))}>
        <option value="anlage">{t('mappentypen.editor.leer-ab-anlage')}</option>
        <option value="laeuftNicht">{t('mappentypen.editor.leer-laeuft-nicht')}</option>
      </select>
    </Feld>
  );
}
