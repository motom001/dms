import { useEffect, useState } from 'react';
import type { KiUebersicht } from '../../../../shared/src/pakete';
import { sucheApi } from '../../api/suche';
import { Aufklapper, HakenFeld, Knopf } from '../../bausteine';
import { Hilfe } from '../../Hilfe';
import { t } from '../../sprache';

/** Sprungziel der Feinabstimmung (Meldung bei Sperre, Hinweis in der Übersicht, Paket-Einstellungen). */
export const FEIN_ZIEL = '/werkbank#dienste-im-netz';

const vonAdresse = () => location.hash === '#dienste-im-netz';

/**
 * Feinabstimmung „Dienste im Netz“ (#1635) unter „Was Ablago darf“: die eine Stelle, an der man Bereiche (Mappentypen)
 * ausnimmt. „Auch Helfer, die Dienste im Netz nutzen“ heißt alle Bereiche; wer Gesundheit oder Post in Ablago lassen
 * will, nimmt hier den Haken weg. Jeder Haken wirkt sofort (steht so am Abschnitt). Bestehende Installationen mit
 * ihrer bisherigen Liste sehen das und können „Alle erlauben“. Am Mappentyp steht derselbe Haken.
 */
export function Feinabstimmung() {
  const [offen, setOffen] = useState(vonAdresse);
  const [k, setK] = useState<KiUebersicht | null>(null);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');
  const [sendet, setSendet] = useState('');
  useEffect(() => {
    const f = () => {
      if (!vonAdresse()) return;
      setOffen(true);
      document.getElementById('dienste-im-netz')?.scrollIntoView({ block: 'start' });
    };
    f();
    addEventListener('popstate', f);
    return () => removeEventListener('popstate', f);
  }, []);
  useEffect(() => {
    sucheApi.kiTypen().then(setK, (e: Error) => setFehler(e.message));
  }, []);
  const tu = async (id: string, f: () => Promise<KiUebersicht>, text: string) => {
    setSendet(id);
    setFehler('');
    setMeldung('');
    try {
      setK(await f());
      setMeldung(text);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSendet('');
    }
  };
  const an = k?.typen.filter((x) => x.zugelassen).length ?? 0;
  return (
    <section id="dienste-im-netz" className="aufklappbereich" data-anker="werkbank.darf.feinabstimmung">
      <Aufklapper offen={offen} steuert="dienste-im-netz-inhalt" umschalten={() => setOffen(!offen)}>
        <span>{t('werkbank.darf.fein.titel')}</span>
        {k && (
          <span className="leise klein">
            {k.alle && an === k.typen.length ? t('werkbank.darf.fein.kurz.alle') : t('werkbank.darf.fein.kurz', { an, alle: k.typen.length })}
          </span>
        )}
      </Aufklapper>
      {offen && (
        <div id="dienste-im-netz-inhalt" className="aufklappinhalt stapel">
          <p className="leise klein">
            {t('werkbank.darf.fein.text')} <Hilfe ort="pakete.ki" />
          </p>
          {fehler && (
            <p className="hinweis schlecht" role="alert">
              {fehler}
            </p>
          )}
          {k && !k.alle && (
            <div className="hinweis info">
              <p>{t('werkbank.darf.fein.bisher')}</p>
              <div className="knoepfe">
                <Knopf
                  groesse="klein"
                  laeuft={sendet === '*'}
                  onClick={() => void tu('*', () => sucheApi.kiAlleErlauben(), t('werkbank.darf.fein.alle-gespeichert'))}>
                  {t('werkbank.darf.fein.alle-erlauben')}
                </Knopf>
              </div>
            </div>
          )}
          {k && (
            <ul className="liste-ohne">
              {k.typen.map((x) => (
                <li key={x.id}>
                  <HakenFeld beschriftung={x.name}>
                    <input
                      type="checkbox"
                      checked={x.zugelassen}
                      disabled={!!sendet}
                      onChange={(ev) => {
                        const ja = ev.target.checked;
                        void tu(
                          x.id,
                          () => sucheApi.setzeKiTyp(x.id, ja),
                          t(ja ? 'werkbank.darf.fein.gespeichert.an' : 'werkbank.darf.fein.gespeichert.aus', { name: x.name }),
                        );
                      }}
                    />
                  </HakenFeld>
                </li>
              ))}
            </ul>
          )}
          {k && (
            <p className="leise klein">
              {k.alle ? t('werkbank.darf.fein.neu.alle') : t('werkbank.darf.fein.neu.liste')}{' '}
              {k.pakete.length
                ? t('werkbank.darf.fein.pakete', { namen: k.pakete.map((p) => p.name).join(', ') })
                : t('werkbank.darf.fein.keine-pakete')}
            </p>
          )}
          <p className="leise klein" role="status">
            {meldung}
          </p>
        </div>
      )}
    </section>
  );
}
