/** Eine Mappe rechts laden und zeigen (#1279 eigene Datei): ohne Leserecht nur die eigenen Aufgaben (#124). */
import { useCallback, useEffect, useState } from 'react';
import type { Aufgabe } from '../../../../shared/src/model';
import { verborgeneAufgaben } from '../../api/aufgaben';
import { mappenApi, type MappeDetails } from '../../api/mappen';
import { useDaten } from '../../daten';
import { geheZu } from '../../ort';
import { t } from '../../sprache';
import { AufgabenHinweis } from '../Aufgaben';
import { MappeAnsicht } from '../MappeFormular';
import { oeffnetUebernehmen } from '../Uebernehmen';

/** Lädt eine Mappe mit Rückverweisen, Dokumenten und Bezügen und zeigt sie an. */
export function MappeLader({ id, sicht, anhang = '', alsPost = false }: { id: string; sicht: string; anhang?: string; alsPost?: boolean }) {
  const d = useDaten();
  const [details, setDetails] = useState<MappeDetails | null | 'fehlt' | { verborgen: Aufgabe[] }>(null);
  const laden = useCallback(async () => {
    try {
      setDetails(await mappenApi.mappe(id));
    } catch (x) {
      const v = verborgeneAufgaben(x);
      setDetails(v ? { verborgen: v } : 'fehlt');
    }
  }, [id]);
  useEffect(() => {
    void laden();
  }, [laden, d.stand]);
  // Neue Post aus allen Eingängen (#934) öffnet die Seite „Dokument übernehmen“ – unter „Neue Post“, damit links sie markiert ist.
  const weiter =
    details && details !== 'fehlt' && !('verborgen' in details) && !alsPost && oeffnetUebernehmen(details, d.typ(details.mappe.typId));
  useEffect(() => {
    if (weiter) geheZu(`/ablage/${d.zaehler.neuePost ?? sicht}/${id}/uebernehmen`, true);
  }, [weiter]); // eslint-disable-line react-hooks/exhaustive-deps -- nur weiter, wenn „weiter“ gesetzt wird; die Adresse gilt zu diesem Zeitpunkt
  if (details === null || weiter) return <p className="leise">{t('ablage.ablage.lade')}</p>;
  if (details === 'fehlt')
    return (
      <div className="leer">
        <p>{t('ablage.ablage.diese-mappe-gibt-es')}</p>
      </div>
    );
  // Ohne Leserecht (#124): nur die eigenen Aufgaben dazu – erledigen oder weitergeben.
  if ('verborgen' in details)
    return (
      <div className="einspaltig">
        <div className="mappenkopf">
          <p className="ueber">{t('ablage.ablage.mappe')}</p>
          <h1 className="verborgen-titel">{t('ablage.ablage.nicht-sichtbare-mappe')}</h1>
        </div>
        <div className="hinweis info">
          <p>
            {t('ablage.ablage.diese-mappe-darfst-du', {
              wert: details.verborgen.length ? t('ablage.ablage.deine-aufgabe-dazu-kannst') : t('ablage.ablage.du-hast-hier-keine'),
            })}
          </p>
        </div>
        <AufgabenHinweis aufgaben={details.verborgen} neuLaden={laden} />
      </div>
    );
  const eintrag = d.typ(details.mappe.typId);
  if (!eintrag)
    return (
      <div className="leer">
        <p>{t('ablage.ablage.der-mappentyp-dieser-mappe')}</p>
      </div>
    );
  return <MappeAnsicht key={details.mappe.id} typ={eintrag} details={details} sicht={sicht} anhang={anhang} neuLaden={laden} />;
}
