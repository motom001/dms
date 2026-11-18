import { useEffect, useState } from 'react';
import { kontoApi } from '../../api/konto';
import { t } from '../../sprache';
import { useDaten } from '../../daten';
import { RollenWahl } from '../RollenWahl';

type RolleEintrag = { id: string; name: string; system: boolean };

/** Rollen für die Auswahl; „weitere“ sind die selbst angelegten (ohne die Systemrolle Mitglied). */
function useRollen() {
  const d = useDaten();
  const [rollen, setRollen] = useState<RolleEintrag[] | null>(null);
  useEffect(() => {
    kontoApi
      .rollen()
      .then(setRollen)
      .catch(() => setRollen([]));
  }, [d.stand]);
  return { weitere: (rollen ?? []).filter((r) => !r.system), geladen: rollen !== null };
}

/**
 * Weitere Rollen am Benutzer (#1311: Mehrfachauswahl wie auf „Eigene Organisation“ statt Haken). Die Systemrolle Mitglied
 * hat jeder und steht nicht zur Wahl; Verwalten ist keine Rolle (#818), sondern ein Recht.
 */
export function WeitereRollen({ gewaehlt, setze }: { gewaehlt: string[]; setze: (ids: string[]) => void }) {
  const r = useRollen();
  return (
    <RollenWahl
      id="benutzer-rollen"
      beschriftung={t('werkbank.benutzer.rollen')}
      rollen={r.geladen ? r.weitere : null}
      gewaehlt={gewaehlt}
      setze={setze}
      hinweis={t('werkbank.benutzer.z-b-als-verantwortliche')}
      immer={t('werkbank.benutzer.rollen.immer')}
    />
  );
}
