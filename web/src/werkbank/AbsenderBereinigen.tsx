import { useEffect, useState } from 'react';
import { api } from '../api';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { titelOder } from '../seiten';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Knopf, Wahlhaken } from '../bausteine';

type Posten = Awaited<ReturnType<typeof api.absenderVorschau>>['posten'];
const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema());

/**
 * Wartung „Absender bereinigen“ (#494): Bis 0.99 bekam eingehende Post ohne Absender den Namen dessen,
 * der sie angelegt hat. Die Vorschau zeigt die betroffenen Posts; geleert wird nur, was angehakt ist.
 */
export function AbsenderBereinigen() {
  const [posten, setPosten] = useState<Posten | null>(null);
  const [wahl, setWahl] = useState<Set<string>>(new Set());
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  async function laden() {
    try { const v = await api.absenderVorschau(); setPosten(v.posten); setWahl(new Set(v.posten.map((p) => p.id))); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  useEffect(() => { void laden(); }, []);
  async function los() {
    const ids = [...wahl];
    if (!ids.length || !(await rueckfrage({ titel: t('werkbank.absenderbereinigen.absender-bei-posts-leeren', { anzahl: ids.length }), text: t('werkbank.absenderbereinigen.das-feld-absender-ist'), ja: t('werkbank.absenderbereinigen.absender-leeren') }))) return;
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await api.absenderBereinigen(ids);
      setMeldung({ art: 'gut', text: t('werkbank.absenderbereinigen.bei-posts-ist-der', { anzahl: r.bereinigt }) });
      await laden();
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setLaeuft(false); }
  }
  const umschalten = (id: string) => setWahl((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <section className="blatt" id="absender">
      <h2 className="h3">{t('werkbank.absenderbereinigen.absender-bereinigen')} <Hilfe ort="werkbank.wartung.absender" /></h2>
      <p className="leise">{t('werkbank.absenderbereinigen.bis-version-0-99')}</p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      {posten === null ? <p className="leise">{t('werkbank.absenderbereinigen.lade')}</p> : !posten.length ? <p className="leise">{t('werkbank.absenderbereinigen.nichts-zu-bereinigen-keine')}</p> : <>
        <p>{t('werkbank.absenderbereinigen.posts-haben-vermutlich-einen', { anzahl: posten.length })}</p>
        <div className="tabellenrahmen festhoehe">
          <table className="absb-tabelle">
            <thead><tr>
              <th><Wahlhaken beschriftung={t('werkbank.absenderbereinigen.alle-waehlen')} an={wahl.size === posten.length} teilweise={wahl.size > 0 && wahl.size < posten.length} setze={(an) => setWahl(an ? new Set(posten.map((p) => p.id)) : new Set())} /></th>
              <th>{t('werkbank.absenderbereinigen.post')}</th><th>{t('werkbank.absenderbereinigen.absender')}</th><th>{t('werkbank.absenderbereinigen.kanal')}</th><th>{t('werkbank.absenderbereinigen.angelegt')}</th>
            </tr></thead>
            <tbody>{posten.map((p) => (
              <tr key={p.id}>
                <td><Wahlhaken beschriftung={t('werkbank.absenderbereinigen.bereinigen', { titelOder: titelOder(p.titel) })} an={wahl.has(p.id)} setze={() => umschalten(p.id)} /></td>
                <td><Link to={`/ablage/eingang/${p.id}`} className="verweis">{titelOder(p.titel)}</Link></td>
                <td>{p.absender}</td><td>{p.kanal}</td><td>{datum(p.erstellt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="knoepfe"><Knopf art="haupt" gesperrt={!wahl.size} laeuft={laeuft} laeuftText={t('werkbank.absenderbereinigen.leere')} onClick={() => void los()}>{t('werkbank.absenderbereinigen.absender-leeren-2', { size: wahl.size })}</Knopf></div>
      </>}
    </section>
  );
}
