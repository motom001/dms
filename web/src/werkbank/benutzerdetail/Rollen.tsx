import { useEffect, useState } from 'react';
import { kontoApi } from '../../api/konto';
import { t } from '../../sprache';
import { useDaten } from '../../daten';
import { Link } from '../../ort';
import { FeldGruppe } from '../../bausteine';

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
  return {
    weitere: (rollen ?? []).filter((r) => !r.system),
    geladen: rollen !== null,
    typ: d.typen.find((mappentyp) => mappentyp.system === 'rolle'),
  };
}

/** Rollen als Haken; die Systemrolle Mitglied hat jeder. Verwalten ist keine Rolle (#818), sondern ein Recht. */
export function WeitereRollen({ gewaehlt, setze, sperre }: { gewaehlt: string[]; setze: (ids: string[]) => void; sperre?: boolean }) {
  const r = useRollen();
  return (
    <FeldGruppe
      beschriftung={t('werkbank.benutzer.rollen')}
      hinweis={t('werkbank.benutzer.z-b-als-verantwortliche')}
      className="rollenwahl">
      <div className="haken-untereinander">
        {r.geladen && !r.weitere.length && <p className="leise klein">{t('werkbank.benutzer.noch-keine-rollen-angelegt')}</p>}
        {r.weitere.map((x) => (
          <label key={x.id} className="haken">
            <input
              type="checkbox"
              disabled={sperre}
              checked={gewaehlt.includes(x.id)}
              onChange={(e) => setze(e.target.checked ? [...gewaehlt, x.id] : gewaehlt.filter((y) => y !== x.id))}
            />
            <span>{x.name}</span>
          </label>
        ))}
        {r.typ && (
          <Link to={`/ablage/${r.typ.id}`} className="verweis klein">
            {t('werkbank.benutzer.rollen-in-der-ablage')}
          </Link>
        )}
      </div>
    </FeldGruppe>
  );
}
