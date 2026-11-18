import { useCallback, useEffect, useState } from 'react';
import type { AblaufVerlauf, AblaufvorlageAnsicht, MappenAblauf } from '../../../../shared/src/ablaufvorlagen';
import { datumDe } from '../../../../shared/src/fristen';
import { automatisierungApi } from '../../api/automatisierung';
import { useDaten } from '../../daten';
import { Link } from '../../ort';
import { t } from '../../sprache';
import { Eintragsliste, Etikett, etikettArt, Knopf, type Listeneintrag } from '../../bausteine';
import { zeit } from './zustand';

/** „Gerade benutzt bei“: offene Abläufe mit Link zur Mappe; angehaltene mit Grund und „Fortsetzen“. */
export function GeradeBenutzt({ v, nachher }: { v: AblaufvorlageAnsicht; nachher: () => void }) {
  const d = useDaten();
  const [liste, setListe] = useState<MappenAblauf[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setListe(await automatisierungApi.ablaufvorlageBenutzt(v.kennung));
    } catch (x) {
      setFehler((x as Error).message);
    }
  }, [v.kennung]);
  useEffect(() => {
    void laden();
  }, [laden, v.offen]);
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.vorlage.ui.benutzt')}</h2>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {!liste ? (
        <p className="leise">{t('automatisierung.ui.lade')}</p>
      ) : !liste.length ? (
        <p className="leise">{t('automatisierung.vorlage.ui.benutzt.leer')}</p>
      ) : (
        <ul className="mappenliste benutzt-liste">
          {liste.map((a) => (
            <li key={a.id}>
              <span>
                <Link to={`/ablage/${a.typId}/${a.mappeId}`} className="verweis">
                  {a.mappeTitel || a.mappeId}
                </Link>{' '}
                <span className="leise klein">
                  {t('automatisierung.vorlage.ui.benutzt.zeile', { datum: datumDe(a.datum), person: d.person(a.erstelltVon ?? '') })}
                </span>
                {a.angehalten && (
                  <>
                    {' '}
                    <Etikett art="schlecht" klein>
                      {t('ablage.aufgaben.angehalten')}
                    </Etikett>{' '}
                    <span className="problem">{a.angehalten.text}</span>
                  </>
                )}
              </span>
              {a.angehalten && (
                <Knopf
                  groesse="klein"
                  onClick={async () => {
                    await automatisierungApi.ablaufFortsetzen(a.id);
                    await laden();
                    nachher();
                  }}>
                  {t('automatisierung.vorlage.ui.fortsetzen')}
                </Knopf>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Verlauf der Vorlage: was mit ihren Abläufen geschah – auch, nachdem sie gelaufen sind. */
export function Verlauf({ v }: { v: AblaufvorlageAnsicht }) {
  const d = useDaten();
  const [liste, setListe] = useState<AblaufVerlauf[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => {
    automatisierungApi
      .ablaufvorlageVerlauf(v.kennung)
      .then(setListe)
      .catch((x) => setFehler((x as Error).message));
  }, [v.kennung, v.offen]);
  const eintraege: Listeneintrag[] = (liste ?? []).map((x) => ({
    id: x.id,
    wann: zeit(x.zeit),
    wer: x.personId ? d.person(x.personId) : '–',
    was: <>{x.text}</>,
    zustand: (
      <Etikett art={etikettArt(x.art === 'angehalten' ? 'schlecht' : x.art === 'gelaufen' || x.art === 'angewendet' ? 'gut' : '')}>
        {t.frei(`automatisierung.vorlage.ui.verlauf.${x.art}`)}
      </Etikett>
    ),
  }));
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.ui.verlauf')}</h2>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {!liste ? (
        <p className="leise">{t('automatisierung.ui.lade')}</p>
      ) : !liste.length ? (
        <p className="leise">{t('automatisierung.vorlage.ui.verlauf.leer')}</p>
      ) : (
        <Eintragsliste eintraege={eintraege} />
      )}
    </div>
  );
}
