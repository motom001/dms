import { useEffect, useState } from 'react';
import { gebietsschema } from '../../../shared/src/sprache';
import { kontoApi, type MeineFehlermeldung } from '../api/konto';
import { Etikett } from '../bausteine';
import { t } from '../sprache';

const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'medium' });

/**
 * „Meine Meldungen“ (#1331) unter dem Formular: je eigene Meldung Datum, Anfang des Textes und „offen“ oder
 * „erledigt am …“, neueste zuerst. Bewusst kein Ticketsystem – keine Antworten, kein „gelesen“. Eine gelöschte Meldung
 * kommt vom Server ohne Text und steht hier nur mit Datum und „erledigt“. `stand` lädt neu (nach dem Absenden).
 */
export function MeineMeldungen({ stand }: { stand: number }) {
  const [liste, setListe] = useState<MeineFehlermeldung[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    let aktuell = true;
    kontoApi.meineFehlermeldungen().then(
      (x) => aktuell && setListe(x),
      (e: Error) => aktuell && setFehler(e.message),
    );
    return () => {
      aktuell = false;
    };
  }, [stand]);
  return (
    <section className="blatt" aria-labelledby="meine-meldungen">
      <h2 id="meine-meldungen" className="h3">
        {t('profil.fehlermelden.meine.titel')}
      </h2>
      <p className="leise klein">{t('profil.fehlermelden.meine.hilfe')}</p>
      {fehler ? (
        <p className="fehlertext">{fehler}</p>
      ) : !liste ? (
        <p className="leise">{t('profil.profil.lade')}</p>
      ) : !liste.length ? (
        <p className="leise">{t('profil.fehlermelden.meine.keine')}</p>
      ) : (
        <ul className="meldungsliste">
          {liste.map((m) => (
            <li key={m.id}>
              <span className="leise klein">{datum(m.erstellt)}</span>
              {m.anfang !== null && <span className="meldungsanfang">{m.anfang}</span>}
              {m.erledigt ? (
                <Etikett art="gut">{t('profil.fehlermelden.meine.erledigt', { datum: datum(m.erledigt) })}</Etikett>
              ) : (
                <Etikett art="info">{t('profil.fehlermelden.meine.offen')}</Etikett>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
