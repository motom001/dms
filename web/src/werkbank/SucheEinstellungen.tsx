import { useEffect, useState } from 'react';
import { sucheApi, type SucheStand } from '../api/suche';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { t, tn } from '../sprache';
import { Feld, Knopf, Schalter } from '../bausteine';
import { EIGENE_WOERTER, MEINTEST, type Meintest } from '../../../shared/src/suche';
import { WOERTER_PFAD } from './Woerter';

/**
 * Werkbank → Suche und Volltext → Suche (#356): Tippfehler-Suche an/aus, wann „Meintest du …?“ kommt (#1191: nur ohne
 * Treffer oder auch, wenn eine ähnliche Schreibweise mehr findet) und die Größe des Wörterverzeichnisses. Steht seit
 * #1191 als gewöhnlicher Abschnitt unter der Texterkennung – ohne eigenen Seitenkopf und ohne Trennlinie.
 * Die gleichbedeutenden Wörter haben seit #992 einen eigenen Bereich (Woerter.tsx); hier steht der Weg dorthin.
 */
export function SuchePanel() {
  const [s, setS] = useState<SucheStand | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => {
    sucheApi.sucheStand().then(setS, (e) => setMeldung({ art: 'schlecht', text: (e as Error).message }));
  }, []);
  async function tu(f: () => Promise<SucheStand>, gut?: string) {
    setLaeuft(true);
    setMeldung(undefined);
    try {
      setS(await f());
      if (gut) setMeldung({ art: 'gut', text: gut });
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    } finally {
      setLaeuft(false);
    }
  }
  if (!s)
    return (
      <div className="einspaltig">
        {meldung ? <p className="fehlertext">{meldung.text}</p> : <p className="leise">{t('suche.lade')}</p>}
      </div>
    );
  const eigene = s.synonyme.filter((g) => g.quelle === EIGENE_WOERTER).length;

  return (
    <div className="einspaltig">
      <section className="blatt" id="suche">
        <h2 className="h3">
          {t('suche.werkbank.titel')} <Hilfe ort="werkbank.suche" />
        </h2>
        <p className="leise">{t('suche.werkbank.text')}</p>
        <Schalter
          an={s.unscharf}
          gesperrt={laeuft}
          beschriftung={t('suche.werkbank.unscharf.schalter')}
          hinweis={t('suche.werkbank.unscharf.text')}
          setze={(an) => tu(() => sucheApi.sucheSetze({ unscharf: an }), t('suche.werkbank.gespeichert'))}
        />
        {/* „Meintest du …?“ auch bei Treffern (#1191): eine Auswahl, kein zweiter Haken; ohne Tippfehler-Suche gesperrt, mit Grund. */}
        <Feld
          beschriftung={t('suche.werkbank.meintest')}
          anker="werkbank.suche.meintest"
          hinweis={s.unscharf ? t('suche.werkbank.meintest.hinweis') : t('suche.werkbank.meintest.gesperrt')}>
          <select
            value={s.meintest}
            disabled={laeuft || !s.unscharf}
            onChange={(e) => void tu(() => sucheApi.sucheSetze({ meintest: e.target.value as Meintest }), t('suche.werkbank.gespeichert'))}>
            {MEINTEST.map((m) => (
              <option key={m} value={m}>
                {t.frei(`suche.werkbank.meintest.${m}`)}
              </option>
            ))}
          </select>
        </Feld>
        <p className="leise klein">
          {t('suche.werkbank.woerter', { anzahl: s.woerter })}{' '}
          <Knopf groesse="klein" laeuft={laeuft} onClick={() => tu(() => sucheApi.woerterNeu(), t('suche.werkbank.woerter.fertig'))}>
            {t('suche.werkbank.woerter.neu')}
          </Knopf>
        </p>
        {meldung && (
          <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
            {meldung.text}
          </p>
        )}
      </section>

      {/* Gleichbedeutende Wörter (#992): eigener Bereich mit Liste und Suche. */}
      <section className="blatt" id="synonyme">
        <h2 className="h3">{t('suche.werkbank.synonyme')}</h2>
        <p className="leise klein">
          {tn('suche.werkbank.synonyme.verweis', {
            link: (
              <Link to={WOERTER_PFAD} className="verweis" anker="werkbank.suche.woerter">
                {t('suche.gruppen.titel')}
              </Link>
            ),
            anzahl: s.synonyme.length,
            eigene,
          })}
        </p>
      </section>
    </div>
  );
}
