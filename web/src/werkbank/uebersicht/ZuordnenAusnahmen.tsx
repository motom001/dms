import { useEffect, useState } from 'react';
import { betriebApi } from '../../api/betrieb';
import { Knopf } from '../../bausteine';
import { t } from '../../sprache';
import type { UebersichtZustand } from './zustand';

/**
 * Post automatisch zuordnen (#1639) in der Karte „Was Ablago darf“: Die Antwort auf Frage 2 gilt für alle Mappentypen;
 * hier stehen die Ausnahmen („Hier nie automatisch zuordnen“) mit „Alle angleichen“. Nur wenn es Ausnahmen gibt.
 * Einzeln geändert wird am Mappentyp (Abschnitt „Erkennung“).
 */
export function ZuordnenAusnahmen({ u }: { u: UebersichtZustand }) {
  const nie = u.stand?.zuordnen?.nie ?? [];
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');
  // Sprungziel des Hinweises nach dem Update (`/werkbank#post-zuordnen`).
  useEffect(() => {
    if (location.hash === '#post-zuordnen') document.getElementById('post-zuordnen')?.scrollIntoView({ block: 'start' });
  }, []);
  if (!nie.length && !meldung && !fehler) return null;
  const angleichen = async () => {
    setSendet(true);
    setFehler('');
    try {
      await betriebApi.zuordnenAngleichen();
      await u.laden();
      setMeldung(t('werkbank.darf.zuordnen.angeglichen'));
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSendet(false);
    }
  };
  return (
    <div id="post-zuordnen" className="stapel" data-anker="werkbank.darf.zuordnen">
      {nie.length > 0 && (
        <div className="hinweis info">
          <p>
            <strong>{t('werkbank.darf.zuordnen.titel')}</strong> {t('werkbank.darf.zuordnen.text', { namen: nie.join(', ') })}
          </p>
          <div className="knoepfe">
            <Knopf groesse="klein" laeuft={sendet} onClick={() => void angleichen()}>
              {t('werkbank.darf.zuordnen.angleichen')}
            </Knopf>
          </div>
        </div>
      )}
      {fehler && (
        <p className="hinweis schlecht" role="alert">
          {fehler}
        </p>
      )}
      <p className="leise klein" role="status">
        {meldung}
      </p>
    </div>
  );
}
