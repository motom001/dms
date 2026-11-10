import { Kopf } from './Kopf';
import { useEffect, useState } from 'react';
import { api, type SucheStand } from '../api';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { abfangen } from '../bausteine';

/**
 * Werkbank → Suche (#356): unscharfe Suche an/aus, gleichbedeutende Wörter (eigene Gruppen; Wortlisten aus Paketen
 * nur zum Ansehen) und das Wörterverzeichnis für „Meintest du …?“.
 */
export function SuchePanel({ abschnitt }: { abschnitt?: boolean } = {}) {
  const [s, setS] = useState<SucheStand | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [neu, setNeu] = useState('');
  const [bearbeiten, setBearbeiten] = useState<{ id: string; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { api.sucheStand().then(setS, (e) => setMeldung({ art: 'schlecht', text: (e as Error).message })); }, []);
  async function tu(f: () => Promise<SucheStand>, gut?: string) {
    setLaeuft(true); setMeldung(undefined);
    try { setS(await f()); if (gut) setMeldung({ art: 'gut', text: gut }); return true; }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); return false; }
    finally { setLaeuft(false); }
  }
  if (!s) return <div className="einspaltig">{meldung ? <p className="fehlertext">{meldung.text}</p> : <p className="leise">{t('suche.lade')}</p>}</div>;
  const eigene = s.synonyme.filter((g) => g.quelle === 'werkbank');
  const ausPaketen = s.synonyme.filter((g) => g.quelle !== 'werkbank');
  const pakete = [...new Set(ausPaketen.map((g) => g.quelle))];

  return (
    <div className="einspaltig stapel">
      <Kopf titel={t('suche.werkbank.titel')} hilfe="werkbank.suche" abschnitt={abschnitt} id="suche" ueber={t('suche.werkbank.ueber')} />
      <p className="leise">{t('suche.werkbank.text')}</p>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}

      <section className="blatt">
        <h2 className="h3">{t('suche.werkbank.unscharf')}</h2>
        <label className="haken">
          <input type="checkbox" checked={s.unscharf} disabled={laeuft} onChange={(e) => void tu(() => api.sucheSetze({ unscharf: e.target.checked }), t('suche.werkbank.gespeichert'))} />
          <span>{t('suche.werkbank.unscharf.an')}</span>
        </label>
        <p className="leise klein">{t('suche.werkbank.unscharf.text')}</p>
        <p className="leise klein">{t('suche.werkbank.woerter', { anzahl: s.woerter })}{' '}
          <button type="button" className="textknopf" disabled={laeuft} onClick={() => void tu(() => api.woerterNeu(), t('suche.werkbank.woerter.fertig'))}>{t('suche.werkbank.woerter.neu')}</button>
        </p>
      </section>

      <section className="blatt">
        <h2 className="h3">{t('suche.werkbank.synonyme')}</h2>
        <p className="leise klein">{t('suche.werkbank.synonyme.text')}</p>
        {!eigene.length && <p className="leise klein">{t('suche.werkbank.synonyme.leer')}</p>}
        <ul className="synonymliste">
          {eigene.map((g) => (
            <li key={g.id}>
              {bearbeiten?.id === g.id ? (
                <form className="zeile" onSubmit={(e) => { e.preventDefault(); void tu(() => api.synonymAendern(g.id, bearbeiten.text), t('suche.werkbank.gespeichert')).then((ok) => ok && setBearbeiten(null)); }}>
                  <input type="text" aria-label={t('suche.werkbank.synonyme.feld')} value={bearbeiten.text} onChange={(e) => setBearbeiten({ id: g.id, text: e.target.value })} autoFocus />
                  <button type="submit" className="knopf klein" disabled={laeuft}>{t('suche.werkbank.speichern')}</button>
                  <button type="button" className="textknopf klein" onClick={() => setBearbeiten(null)}>{t('suche.werkbank.abbrechen')}</button>
                </form>
              ) : (
                <>
                  <span className="synonymwoerter">{g.woerter.join(' · ')}</span>
                  <span className="verweisaktionen">
                    <button type="button" className="textknopf klein" onClick={() => setBearbeiten({ id: g.id, text: g.woerter.join(', ') })}>{t('suche.werkbank.aendern')}</button>
                    <button type="button" className="textknopf klein gefahr" aria-label={t('suche.werkbank.entfernen.titel', { woerter: g.woerter.join(', ') })}
                      onClick={abfangen(async () => { if (await rueckfrage({ titel: t('suche.werkbank.entfernen.frage'), text: g.woerter.join(', '), ja: t('suche.werkbank.entfernen'), gefahr: true })) await tu(() => api.synonymLoeschen(g.id)); })}>
                      <Symbol name="geloescht" /> {t('suche.werkbank.entfernen')}
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="zeile synonymneu" onSubmit={(e) => { e.preventDefault(); void tu(() => api.synonymNeu(neu), t('suche.werkbank.gespeichert')).then((ok) => ok && setNeu('')); }}>
          <input type="text" aria-label={t('suche.werkbank.synonyme.feld')} placeholder={t('suche.werkbank.synonyme.beispiel')} value={neu} onChange={(e) => setNeu(e.target.value)} />
          <button type="submit" className="knopf" disabled={laeuft || !neu.trim()}>{t('suche.werkbank.synonyme.neu')}</button>
        </form>
      </section>

      {pakete.length > 0 && (
        <section className="blatt">
          <h2 className="h3">{t('suche.werkbank.pakete')}</h2>
          <p className="leise klein">{t('suche.werkbank.pakete.text')}</p>
          {pakete.map((p) => {
            const gruppen = ausPaketen.filter((g) => g.quelle === p);
            return (
              <details key={p} className="aufklappbereich">
                <summary className="aufklappkopf">{t('suche.werkbank.paket', { paket: gruppen[0]?.paketName ?? p, anzahl: gruppen.length })}</summary>
                <ul className="aufklappinhalt synonymliste">{gruppen.map((g) => <li key={g.id}><span className="synonymwoerter">{g.woerter.join(' · ')}</span></li>)}</ul>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}
