import { Kopf } from './Kopf';
import { useEffect, useState } from 'react';
import { sucheApi, type SucheStand } from '../api/suche';
import { Link } from '../ort';
import { t, tn } from '../sprache';
import { Knopf, Schalter } from '../bausteine';
import { EIGENE_WOERTER } from '../../../shared/src/suche';
import { WOERTER_PFAD } from './Woerter';

/**
 * Werkbank → Suche und Volltext → Suche (#356): unscharfe Suche an/aus und das Wörterverzeichnis für „Meintest du …?“.
 * Die gleichbedeutenden Wörter haben seit #992 einen eigenen Bereich (Woerter.tsx); hier steht der Weg dorthin.
 */
export function SuchePanel({ abschnitt }: { abschnitt?: boolean } = {}) {
  const [s, setS] = useState<SucheStand | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { sucheApi.sucheStand().then(setS, (e) => setMeldung({ art: 'schlecht', text: (e as Error).message })); }, []);
  async function tu(f: () => Promise<SucheStand>, gut?: string) {
    setLaeuft(true); setMeldung(undefined);
    try { setS(await f()); if (gut) setMeldung({ art: 'gut', text: gut }); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setLaeuft(false); }
  }
  if (!s) return <div className="einspaltig">{meldung ? <p className="fehlertext">{meldung.text}</p> : <p className="leise">{t('suche.lade')}</p>}</div>;
  const eigene = s.synonyme.filter((g) => g.quelle === EIGENE_WOERTER).length;

  return (
    <div className="einspaltig stapel">
      <Kopf titel={t('suche.werkbank.titel')} hilfe="werkbank.suche" abschnitt={abschnitt} id="suche" ueber={t('suche.werkbank.ueber')} />
      <p className="leise">{t('suche.werkbank.text')}</p>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}

      <section className="blatt">
        <h2 className="h3">{t('suche.werkbank.unscharf')}</h2>
        <Schalter an={s.unscharf} gesperrt={laeuft} beschriftung={t('suche.werkbank.unscharf.schalter')} hinweis={t('suche.werkbank.unscharf.text')}
          setze={(an) => tu(() => sucheApi.sucheSetze({ unscharf: an }), t('suche.werkbank.gespeichert'))} />
        <p className="leise klein">{t('suche.werkbank.woerter', { anzahl: s.woerter })}{' '}
          <Knopf art="link" groesse="klein" laeuft={laeuft} onClick={() => tu(() => sucheApi.woerterNeu(), t('suche.werkbank.woerter.fertig'))}>{t('suche.werkbank.woerter.neu')}</Knopf>
        </p>
      </section>

      {/* Gleichbedeutende Wörter (#992): eigener Bereich mit Liste und Suche. */}
      <section className="blatt" id="synonyme">
        <h2 className="h3">{t('suche.werkbank.synonyme')}</h2>
        <p className="leise klein">{tn('suche.werkbank.synonyme.verweis', {
          link: <Link to={WOERTER_PFAD} className="verweis" anker="werkbank.suche.woerter">{t('suche.gruppen.titel')}</Link>,
          anzahl: s.synonyme.length, eigene,
        })}</p>
      </section>
    </div>
  );
}
