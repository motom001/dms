import { useCallback, useEffect, useState } from 'react';
import { Feld, HakenFeld, Knopf, Schalter, Wahlhaken } from '../bausteine';
import { fortschrittText } from '../../../shared/src/auftrag';
import { ergebnisText, mb, STUFEN, STUFEN_LISTE, type Stufe } from '../../../shared/src/verkleinern';
import type { Auftrag } from '../../../shared/src/auftrag';
import { betriebApi } from '../api/betrieb';
import { dokumenteApi, type GrossePdfs, type VerkleinernEinstellung } from '../api/dokumente';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';

/**
 * Werkbank → Systemzustand (#393, #408): große PDFs verkleinern (Liste nach Größe mit geschätzter Ersparnis,
 * Sammelaktion als Hintergrundauftrag) und neue PDFs automatisch verkleinern (Standard aus).
 * Die Liste steht rechts mit fester Höhe (#366): eine Arbeitsliste, keine Sammlung zum Bearbeiten.
 */

const ABS = [1, 2, 5, 10, 20];

interface Ergebnis { stufe: Stufe; verkleinert: number; unveraendert: number; fehler: Array<{ id: string; name: string; grund: string }>; vorher: number; nachher: number; ohneOriginal: boolean }

export function GrossePdfsVerkleinern() {
  const d = useDaten();
  const [ab, setAb] = useState(2);
  const [stufe, setStufe] = useState<Stufe>('standard');
  const [liste, setListe] = useState<GrossePdfs | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [ohneOriginal, setOhneOriginal] = useState(false);
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    setListe(null); setFehler(undefined);
    try {
      const l = await dokumenteApi.grosseDokumente(ab, stufe);
      setListe(l);
      setAuswahl(new Set(l.eintraege.filter((x) => x.lohnt).map((x) => x.id)));
    } catch (e) { setFehler((e as Error).message); }
  }, [ab, stufe]);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const timer = setInterval(() => void betriebApi.auftrag().then((a) => { setAuftrag(a); if (a?.status !== 'laeuft') void laden(); }), 1000);
    return () => clearInterval(timer);
  }, [auftrag?.status, laden]);

  const alle = liste?.eintraege ?? [];
  const gewaehlt = alle.filter((x) => auswahl.has(x.id));
  const ersparnis = gewaehlt.reduce((s, x) => s + (x.lohnt && x.geschaetzt != null ? x.groesse - x.geschaetzt : 0), 0);
  const umschalten = (id: string) => setAuswahl((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const e = auftrag?.status === 'fertig' && auftrag.art === 'pdf-verkleinern' ? auftrag.ergebnis as Ergebnis : null;

  async function los() {
    const text = ohneOriginal
      ? t('werkbank.verkleinern.die-bisherigen-dateien-werden')
      : t('werkbank.verkleinern.mit-versionierung-bleibt-das');
    if (!(await rueckfrage({ titel: t('werkbank.verkleinern.pdfs-verkleinern', { anzahl: gewaehlt.length }), text: t('werkbank.verkleinern.stufe-dpi', { name: STUFEN[stufe].name, dpi: STUFEN[stufe].dpi, text }), ja: t('werkbank.verkleinern.verkleinern'), gefahr: ohneOriginal }))) return;
    setFehler(undefined);
    try { setAuftrag(await dokumenteApi.verkleinereViele({ ids: gewaehlt.map((x) => x.id), stufe, ohneOriginal, bestaetigt: true })); } catch (x) { setFehler((x as Error).message); }
  }

  return (
    <section className="blatt" id="verkleinern">
      <h2 className="h3">{t('werkbank.verkleinern.grosse-pdfs-verkleinern')} <Hilfe ort="werkbank.verkleinern" /></h2>
      <p className="leise klein">{t('werkbank.verkleinern.gescannte-und-fotografierte-pdfs')}</p>
      <div className="zeile-umbruch">
        <Feld beschriftung={t('werkbank.verkleinern.ab')}>
          <select value={ab} onChange={(x) => setAb(Number(x.target.value))}>{ABS.map((a) => <option key={a} value={a}>{t('werkbank.verkleinern.mb', { a })}</option>)}</select>
        </Feld>
        <Feld beschriftung={t('werkbank.verkleinern.stufe')}>
          <select value={stufe} onChange={(x) => setStufe(x.target.value as Stufe)}>
            {STUFEN_LISTE.map((s) => <option key={s} value={s}>{t('werkbank.verkleinern.dpi', { name: STUFEN[s].name, dpi: STUFEN[s].dpi })}</option>)}
          </select>
        </Feld>
      </div>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {liste === null ? <p className="leise" role="status">{t('werkbank.verkleinern.suche-grosse-pdfs-und')}</p> : !alle.length ? <p className="leise">{t('werkbank.verkleinern.keine-pdfs-ab-mb', { ab })}</p> : (
        <>
          <div className="tabellenrahmen festhoehe">
            <table className="auftraege grosse-pdfs">
              <thead><tr>
                <th><Wahlhaken beschriftung={t('werkbank.verkleinern.alle-waehlen')} an={auswahl.size === alle.length} teilweise={auswahl.size > 0 && auswahl.size < alle.length} setze={(an) => setAuswahl(an ? new Set(alle.map((a) => a.id)) : new Set())} /></th>
                <th>{t('werkbank.verkleinern.dokument')}</th><th>{t('werkbank.verkleinern.mappe')}</th><th className="zahlzelle">{t('werkbank.verkleinern.groesse')}</th><th className="zahlzelle">{t('werkbank.verkleinern.danach')}</th>
              </tr></thead>
              <tbody>{alle.map((x) => (
                <tr key={x.id} className={auswahl.has(x.id) ? 'an' : ''}>
                  <td><Wahlhaken beschriftung={t('werkbank.verkleinern.waehlen', { name: x.name })} an={auswahl.has(x.id)} setze={() => umschalten(x.id)} /></td>
                  <td className="umbruch">{x.name}{x.version > 1 ? <span className="leise klein"> {' '}{t('werkbank.verkleinern.version', { version: x.version })}</span> : null}
                    <span className="nur-schmal leise klein">{x.mappeTitel || t('werkbank.verkleinern.ohne-titel')}</span></td>
                  <td className="umbruch">{x.typId ? <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{x.mappeTitel || t('werkbank.verkleinern.ohne-titel')}</Link> : x.mappeTitel}{x.typId && d.typ(x.typId) ? <span className="leise klein"> · {d.typ(x.typId)!.name}</span> : null}</td>
                  <td className="zahlzelle">{mb(x.groesse)}</td>
                  <td className="zahlzelle">{x.fehler ? <span className="fehlertext klein" title={x.fehler}>{t('werkbank.verkleinern.nicht-lesbar')}</span> : x.geschaetzt == null ? <span className="leise">–</span> : x.lohnt ? <>{mb(x.geschaetzt)} <span className="leise klein">−{Math.round((1 - x.geschaetzt / x.groesse) * 100)} %</span></> : <span className="leise klein">{t('werkbank.verkleinern.lohnt-kaum')}</span>}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><th colSpan={3}>{t('werkbank.verkleinern.von-gewaehlt', { gewaehlt: gewaehlt.length, alle: alle.length })}</th><th className="zahlzelle">{mb(gewaehlt.reduce((s, x) => s + x.groesse, 0))}</th><th className="zahlzelle">≈ −{mb(ersparnis)}</th></tr></tfoot>
            </table>
          </div>
          {liste.mehr && <p className="leise klein">{t('werkbank.verkleinern.gezeigt-werden-die-groessten', { alle: alle.length })}</p>}
          <HakenFeld beschriftung={t('werkbank.verkleinern.originale-nicht-als-aeltere')} hinweis={t('werkbank.verkleinern.gibt-den-platz-sofort')}>
            <input type="checkbox" checked={ohneOriginal} onChange={(x) => setOhneOriginal(x.target.checked)} />
          </HakenFeld>
        </>
      )}
      {auftrag?.status === 'laeuft' && <p className="leise" role="status">{fortschrittText(auftrag, t('werkbank.verkleinern.dokumente'))}</p>}
      {e && <div className={`hinweis ${e.fehler.length ? 'warn' : 'gut'}`} role="status"><p>
        {e.verkleinert ? <>{t('werkbank.verkleinern.pdfs-verkleinert', { anzahl: e.verkleinert, ergebnisText: ergebnisText(e.vorher, e.nachher) })}</> : t('werkbank.verkleinern.nichts-verkleinert')}
        {e.unveraendert > 0 && t('werkbank.verkleinern.unveraendert-weniger-als-10', { unveraendert: e.unveraendert })}
        {e.verkleinert > 0 && !e.ohneOriginal && t('werkbank.verkleinern.wo-die-versionierung-an')}</p>
        {e.fehler.length > 0 && <ul className="klein">{e.fehler.map((f) => <li key={f.id}>{f.name}: {f.grund}</li>)}</ul>}
      </div>}
      {auftrag?.status === 'fehler' && <p className="fehlertext">{auftrag.fehler}</p>}
      <div className="knoepfe">
        <span className="leise klein">{gewaehlt.length ? t('werkbank.verkleinern.geschaetzt-frei', { mb: mb(ersparnis) }) : ''}</span>
        <Knopf art="haupt" gesperrt={!gewaehlt.length} laeuft={auftrag?.status === 'laeuft'} laeuftText={t('werkbank.verkleinern.wird-verkleinert')} onClick={() => void los()}>
          {t('werkbank.verkleinern.pdfs-verkleinern-2', { anzahl: gewaehlt.length, wert: gewaehlt.length || '' }).trim()}
        </Knopf>
      </div>
    </section>
  );
}

/** Neue PDFs von außen (Hochladen, Eingangsordner, Postfach, API, WebDAV) ab einer Größe automatisch verkleinern. */
export function AutomatischVerkleinern() {
  const [gespeichert, setGespeichert] = useState<VerkleinernEinstellung | null>(null);
  const [e, setE] = useState<VerkleinernEinstellung | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { dokumenteApi.verkleinernEinstellung().then((x) => { setGespeichert(x); setE(x); }, (x: Error) => setMeldung({ art: 'schlecht', text: x.message })); }, []);
  const ent = useEntwurf(gespeichert, e, { aus: !e, zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); } });
  if (!e) return <section className="blatt"><h2 className="h3">{t('werkbank.verkleinern.neue-pdfs-automatisch-verkleinern')}</h2><p className="leise">{meldung?.text ?? t('werkbank.verkleinern.lade')}</p></section>;
  async function speichern() {
    setLaeuft(true); setMeldung(undefined);
    try { const x = await dokumenteApi.setzeVerkleinernEinstellung(e!); setGespeichert(x); setE(x); setMeldung({ art: 'gut', text: t('werkbank.verkleinern.gespeichert') }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setLaeuft(false); }
  }
  return (
    <form className="blatt" id="automatisch-verkleinern" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.verkleinern.neue-pdfs-automatisch-verkleinern-2')} <Hilfe ort="werkbank.verkleinern" /></h2>
      <Schalter an={e.automatisch} setze={(an) => setE({ ...e, automatisch: an })} beschriftung={t('werkbank.verkleinern.schalter')}
        hinweis={t('werkbank.verkleinern.hochladen-eingangsordner-postfaecher')} />
      <div className="raster">
        <Feld beschriftung={t('werkbank.verkleinern.ab-groesse')} hinweis={t('werkbank.verkleinern.mb-2')}>
          <input type="number" min={1} max={100} step={0.5} value={e.abMb} disabled={!e.automatisch} onChange={(x) => setE({ ...e, abMb: Number(x.target.value) })} />
        </Feld>
        <Feld beschriftung={t('werkbank.verkleinern.stufe')}>
          <select value={e.stufe} disabled={!e.automatisch} onChange={(x) => setE({ ...e, stufe: x.target.value as Stufe })}>
            {STUFEN_LISTE.map((s) => <option key={s} value={s}>{t('werkbank.verkleinern.dpi', { name: STUFEN[s].name, dpi: STUFEN[s].dpi })}</option>)}
          </select>
        </Feld>
      </div>
      <p className="leise klein">{t('werkbank.verkleinern.standard-aus-eingeschaltet-wird')}</p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.verkleinern.einstellung')} sendet={laeuft} />
    </form>
  );
}
