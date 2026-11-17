/** Bereich „Geplant“ an der Mappe (#1044, #1279 eigene Datei). */
import { useState } from 'react';
import type { MappenAblauf, VorlageZumAnwenden } from '../../../../shared/src/ablaufvorlagen';
import { datumDe } from '../../../../shared/src/fristen';
import { automatisierungApi } from '../../api/automatisierung';
import { useKonto } from '../../konto';
import { Person } from '../../Person';
import { Symbol } from '../../Symbol';
import { t, tn } from '../../sprache';
import { Knopf } from '../../bausteine';
import { ErinnerungFormular } from './formulare';

/**
 * Bereich „Geplant“ (#1044, früher die noch nicht fälligen Erinnerungen #131): offene Mappen-Abläufe aus
 * Automatisierungsvorlagen – „Erinnern“, Wiedervorlage und eigene. Ändern und löschen: wer ihn angelegt hat, der
 * Empfänger oder ein Administrator. Angehaltene (Rechte der Person fehlen) stehen mit Grund da.
 */
export function Geplant({
  liste,
  vorlagen = [],
  neuLaden,
}: {
  liste: MappenAblauf[];
  vorlagen?: VorlageZumAnwenden[];
  neuLaden: () => Promise<void>;
}) {
  const { ich } = useKonto();
  const [bearbeiten, setBearbeiten] = useState<string>();
  const [fehler, setFehler] = useState<string>();
  if (!liste.length) return null;
  async function loeschen(e: MappenAblauf) {
    try {
      await automatisierungApi.ablaufLoeschen(e.id);
      await neuLaden();
    } catch (x) {
      setFehler((x as Error).message);
    }
  }
  return (
    <div className="hinweis info stapel erinnerungen" role="status" data-anker="mappe.geplant">
      <p className="klein">
        <strong>{t('ablage.aufgaben.geplant')}</strong>
      </p>
      <ul>
        {liste.map((e) => {
          const darf = e.erstelltVon === ich.id || e.empfaengerId === ich.id || ich.rolle === 'admin';
          const an = e.empfaengerId ?? e.erstelltVon;
          const vorlage = vorlagen.find((v) => v.kennung === e.vorlage);
          return bearbeiten === e.id ? (
            <li key={e.id}>
              <ErinnerungFormular
                mappeId={e.mappeId}
                e={e}
                vorlage={vorlage}
                neuLaden={neuLaden}
                schliessen={() => setBearbeiten(undefined)}
                eingebettet
              />
            </li>
          ) : (
            <li key={e.id}>
              <div className="aufgabentext">
                {tn('ablage.aufgaben.fuer', { symbol: <Symbol name="erinnern" />, b: <strong>{datumDe(e.datum)}</strong> })}{' '}
                {an === ich.id ? t('ablage.aufgaben.dich') : <Person id={an} />}: {e.text || e.vorlageName}
                {e.vorlage !== 'erinnern' && (
                  <>
                    {' '}
                    <span className="chip klein">{e.vorlageName ?? e.vorlage}</span>
                  </>
                )}
                {e.angehalten && (
                  <>
                    {' '}
                    <span className="chip schlecht klein" title={e.angehalten.text}>
                      {t('ablage.aufgaben.angehalten')}
                    </span>
                  </>
                )}
              </div>
              {darf && (
                <div className="aufgabenaktionen">
                  <Knopf groesse="klein" onClick={() => setBearbeiten(e.id)}>
                    {t('ablage.aufgaben.aendern')}
                  </Knopf>
                  <Knopf
                    art="gefahr"
                    groesse="klein"
                    symbol="geloescht"
                    onClick={() => loeschen(e)}
                    rueckfrage={{
                      titel:
                        e.vorlage === 'erinnern'
                          ? t('ablage.aufgaben.erinnerung-loeschen')
                          : t('ablage.aufgaben.ablauf-loeschen', { name: e.vorlageName ?? e.vorlage }),
                      text: e.text ? `„${e.text}“` : '',
                      ja: t('ablage.aufgaben.loeschen'),
                    }}>
                    {t('ablage.aufgaben.loeschen')}
                  </Knopf>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}
