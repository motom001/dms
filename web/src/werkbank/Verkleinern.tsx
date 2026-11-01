import { useCallback, useEffect, useState } from 'react';
import { fortschrittText } from '../../../shared/src/auftrag';
import { ergebnisText, mb, STUFEN, STUFEN_LISTE, type Stufe } from '../../../shared/src/verkleinern';
import { api, type Auftrag, type GrossePdfs, type VerkleinernEinstellung } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';

/**
 * Werkbank → Speicherplatz (#393): große PDFs verkleinern (Liste nach Größe mit geschätzter Ersparnis,
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
      const l = await api.grosseDokumente(ab, stufe);
      setListe(l);
      setAuswahl(new Set(l.eintraege.filter((x) => x.lohnt).map((x) => x.id)));
    } catch (e) { setFehler((e as Error).message); }
  }, [ab, stufe]);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const t = setInterval(() => void api.auftrag().then((a) => { setAuftrag(a); if (a?.status !== 'laeuft') void laden(); }), 1000);
    return () => clearInterval(t);
  }, [auftrag?.status, laden]);

  const alle = liste?.eintraege ?? [];
  const gewaehlt = alle.filter((x) => auswahl.has(x.id));
  const ersparnis = gewaehlt.reduce((s, x) => s + (x.lohnt && x.geschaetzt != null ? x.groesse - x.geschaetzt : 0), 0);
  const umschalten = (id: string) => setAuswahl((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const e = auftrag?.status === 'fertig' && auftrag.art === 'pdf-verkleinern' ? auftrag.ergebnis as Ergebnis : null;

  async function los() {
    const text = ohneOriginal
      ? 'Die bisherigen Dateien werden nicht als ältere Version behalten – der Platz ist sofort frei, das Original aber weg (außer während einer Aufbewahrungsfrist).'
      : 'Mit Versionierung bleibt das Original als ältere Version (Platz wird erst frei, wenn sie wegfällt). Ohne Versionierung ersetzt das verkleinerte PDF das bisherige, das bisherige kommt in den Papierkorb.';
    if (!(await rueckfrage({ titel: `${gewaehlt.length} ${gewaehlt.length === 1 ? 'PDF' : 'PDFs'} verkleinern?`, text: `Stufe ${STUFEN[stufe].name} (≈ ${STUFEN[stufe].dpi} dpi). ${text}`, ja: 'Verkleinern', gefahr: ohneOriginal }))) return;
    setFehler(undefined);
    try { setAuftrag(await api.verkleinereViele({ ids: gewaehlt.map((x) => x.id), stufe, ohneOriginal, bestaetigt: true })); } catch (x) { setFehler((x as Error).message); }
  }

  return (
    <section className="blatt" id="verkleinern">
      <h2 className="h3">Große PDFs verkleinern <Hilfe ort="werkbank.verkleinern" /></h2>
      <p className="leise klein">Gescannte und fotografierte PDFs enthalten oft Bilder mit mehr Auflösung, als man zum Lesen braucht. Verkleinern rechnet sie herunter und komprimiert sie neu; Text und Volltext bleiben. Die Größe danach ist geschätzt.</p>
      <div className="zeile-umbruch">
        <label className="inline">Ab <select value={ab} onChange={(x) => setAb(Number(x.target.value))}>{ABS.map((a) => <option key={a} value={a}>{a} MB</option>)}</select></label>
        <label className="inline">Stufe <select value={stufe} onChange={(x) => setStufe(x.target.value as Stufe)}>
          {STUFEN_LISTE.map((s) => <option key={s} value={s}>{STUFEN[s].name} (≈ {STUFEN[s].dpi} dpi)</option>)}
        </select></label>
      </div>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {liste === null ? <p className="leise" role="status">Suche große PDFs und schätze die Ersparnis …</p> : !alle.length ? <p className="leise">Keine PDFs ab {ab} MB.</p> : (
        <>
          <div className="tabellenrahmen festhoehe">
            <table className="auftraege grosse-pdfs">
              <thead><tr>
                <th><input type="checkbox" aria-label="Alle wählen" checked={auswahl.size === alle.length} onChange={(x) => setAuswahl(x.target.checked ? new Set(alle.map((a) => a.id)) : new Set())} /></th>
                <th>Dokument</th><th>Mappe</th><th className="zahlzelle">Größe</th><th className="zahlzelle">danach ≈</th>
              </tr></thead>
              <tbody>{alle.map((x) => (
                <tr key={x.id} className={auswahl.has(x.id) ? 'an' : ''}>
                  <td><input type="checkbox" aria-label={`${x.name} wählen`} checked={auswahl.has(x.id)} onChange={() => umschalten(x.id)} /></td>
                  <td className="umbruch">{x.name}{x.version > 1 ? <span className="leise klein"> · Version {x.version}</span> : null}
                    <span className="nur-schmal leise klein">{x.mappeTitel || 'Ohne Titel'}</span></td>
                  <td className="umbruch">{x.typId ? <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{x.mappeTitel || 'Ohne Titel'}</Link> : x.mappeTitel}{x.typId && d.typ(x.typId) ? <span className="leise klein"> · {d.typ(x.typId)!.name}</span> : null}</td>
                  <td className="zahlzelle">{mb(x.groesse)}</td>
                  <td className="zahlzelle">{x.fehler ? <span className="fehlertext klein" title={x.fehler}>nicht lesbar</span> : x.geschaetzt == null ? <span className="leise">–</span> : x.lohnt ? <>{mb(x.geschaetzt)} <span className="leise klein">−{Math.round((1 - x.geschaetzt / x.groesse) * 100)} %</span></> : <span className="leise klein">lohnt kaum</span>}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><th colSpan={3}>{gewaehlt.length} von {alle.length} gewählt</th><th className="zahlzelle">{mb(gewaehlt.reduce((s, x) => s + x.groesse, 0))}</th><th className="zahlzelle">≈ −{mb(ersparnis)}</th></tr></tfoot>
            </table>
          </div>
          {liste.mehr && <p className="leise klein">Gezeigt werden die {alle.length} größten; geschätzt werden die ersten 60.</p>}
          <label className="haken"><input type="checkbox" checked={ohneOriginal} onChange={(x) => setOhneOriginal(x.target.checked)} />
            <span>Originale nicht als ältere Version behalten <span className="leise klein">– gibt den Platz sofort frei; nicht während einer Aufbewahrungsfrist</span></span></label>
        </>
      )}
      {auftrag?.status === 'laeuft' && <p className="leise" role="status">{fortschrittText(auftrag, 'Dokumente')}</p>}
      {e && <div className={`hinweis ${e.fehler.length ? 'warn' : 'gut'}`} role="status"><p>
        {e.verkleinert ? <>{e.verkleinert} {e.verkleinert === 1 ? 'PDF' : 'PDFs'} verkleinert {ergebnisText(e.vorher, e.nachher)}.</> : 'Nichts verkleinert.'}
        {e.unveraendert > 0 && ` ${e.unveraendert} unverändert (weniger als 10 % Ersparnis).`}
        {e.verkleinert > 0 && !e.ohneOriginal && ' Wo die Versionierung an ist, liegt das Original als ältere Version daneben.'}</p>
        {e.fehler.length > 0 && <ul className="klein">{e.fehler.map((f) => <li key={f.id}>{f.name}: {f.grund}</li>)}</ul>}
      </div>}
      {auftrag?.status === 'fehler' && <p className="fehlertext">{auftrag.fehler}</p>}
      <div className="knoepfe">
        <span className="leise klein">{gewaehlt.length ? `Geschätzt frei: ${mb(ersparnis)}` : ''}</span>
        <button type="button" className="knopf primaer" disabled={!gewaehlt.length || auftrag?.status === 'laeuft'} onClick={() => void los()}>
          {auftrag?.status === 'laeuft' ? 'Wird verkleinert …' : `${gewaehlt.length || ''} ${gewaehlt.length === 1 ? 'PDF' : 'PDFs'} verkleinern`.trim()}
        </button>
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
  useEffect(() => { api.verkleinernEinstellung().then((x) => { setGespeichert(x); setE(x); }, (x: Error) => setMeldung({ art: 'schlecht', text: x.message })); }, []);
  const ent = useEntwurf(gespeichert, e, { aus: !e, zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); } });
  if (!e) return <section className="blatt"><h2 className="h3">Neue PDFs automatisch verkleinern</h2><p className="leise">{meldung?.text ?? 'Lade …'}</p></section>;
  async function speichern() {
    setLaeuft(true); setMeldung(undefined);
    try { const x = await api.setzeVerkleinernEinstellung(e!); setGespeichert(x); setE(x); setMeldung({ art: 'gut', text: 'Gespeichert.' }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setLaeuft(false); }
  }
  return (
    <form className="blatt" id="automatisch-verkleinern" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h2 className="h3">Neue PDFs automatisch verkleinern <Hilfe ort="werkbank.verkleinern" /></h2>
      <label className="haken"><input type="checkbox" checked={e.automatisch} onChange={(x) => setE({ ...e, automatisch: x.target.checked })} />
        <span>Neue PDFs beim Ablegen verkleinern <span className="leise klein">– Hochladen, Eingangsordner, Postfächer, API und WebDAV</span></span></label>
      <div className="raster">
        <label className="eigenschaft"><span>Ab Größe <small>MB</small></span>
          <input type="number" min={1} max={100} step={0.5} value={e.abMb} disabled={!e.automatisch} onChange={(x) => setE({ ...e, abMb: Number(x.target.value) })} /></label>
        <label className="eigenschaft"><span>Stufe</span>
          <select value={e.stufe} disabled={!e.automatisch} onChange={(x) => setE({ ...e, stufe: x.target.value as Stufe })}>
            {STUFEN_LISTE.map((s) => <option key={s} value={s}>{STUFEN[s].name} (≈ {STUFEN[s].dpi} dpi)</option>)}
          </select></label>
      </div>
      <p className="leise klein">Standard: aus. Eingeschaltet wird nur das verkleinerte PDF gespeichert – das Original ist dann nicht im DMS. Bringt es weniger als 10 %, bleibt die Datei, wie sie kam. Im DMS bearbeitete PDFs werden nicht automatisch verkleinert.</p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand="Einstellung" sendet={laeuft} />
    </form>
  );
}
