import { useCallback, useEffect, useState } from 'react';
import { OCR_STAENDE, type OcrStandArt } from '../../../shared/src/model';
import { api, type OcrEinstellungen, type OcrStatus } from '../api';

/**
 * Werkbank → Texterkennung (#45): Werkzeuge, Einstellungen, Warteschlange.
 * Werkbank → Wartungsoperationen: Volltext für vorhandene Dokumente nachholen
 * (später auch Sicherung, Wiederherstellung und Export).
 */

export function useTexterkennung(aktiv: boolean) {
  const [stand, setStand] = useState<OcrStatus | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async (werkzeugeNeu = false) => {
    try { setStand(await api.texterkennung(werkzeugeNeu)); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  // Solange etwas wartet oder läuft, alle paar Sekunden auffrischen.
  const offen = !!stand && (stand.zaehler.wartet > 0 || stand.zaehler.laeuft > 0);
  useEffect(() => {
    if (!aktiv) return;
    void laden();
  }, [aktiv, laden]);
  useEffect(() => {
    if (!aktiv || !offen) return;
    const t = setInterval(() => void laden(), 3000);
    return () => clearInterval(t);
  }, [aktiv, offen, laden]);
  return { stand, setStand, fehler, laden };
}
export type TexterkennungZustand = ReturnType<typeof useTexterkennung>;

const zahl = (n: number) => n.toLocaleString('de-DE');
const REIHENFOLGE: OcrStandArt[] = ['wartet', 'laeuft', 'fertig', 'fehler', 'ausgelassen', 'keiner'];

function Warteschlange({ s }: { s: OcrStatus }) {
  return (
    <dl className="eigenschaften">
      {REIHENFOLGE.map((k) => <div key={k} style={{ display: 'contents' }}><dt>{k === 'keiner' ? 'ohne Volltext (noch nie erkannt)' : OCR_STAENDE[k]}</dt><dd>{zahl(s.zaehler[k])}</dd></div>)}
    </dl>
  );
}

export function TexterkennungListe({ t }: { t: TexterkennungZustand }) {
  const s = t.stand;
  return (
    <>
      <div className="listenkopf"><div><h1>Texterkennung</h1><p className="leise klein">Volltext für die Suche: Textebene von PDFs und Texterkennung für Scans und Bilder.</p></div></div>
      {s && (
        <ul className="mappenliste">
          <li><a className="eintrag werk" href="#werkzeuge"><span className="titel">Werkzeuge</span><span className="unter">{s.werkzeuge.tesseract ?? 'Texterkennung nicht installiert'}</span></a></li>
          <li><a className="eintrag werk" href="#einstellungen">
            <span className="titel">Einstellungen</span>
            <span className="unter">{s.einstellungen.aktiv ? `${s.einstellungen.auftraege} ${s.einstellungen.auftraege === 1 ? 'Auftrag' : 'Aufträge'} gleichzeitig · höchstens ${s.einstellungen.maxSeiten} Seiten` : 'ausgeschaltet'}</span>
            <span><span className={`chip ${s.einstellungen.aktiv ? 'gut' : ''}`}>{s.einstellungen.aktiv ? 'an' : 'aus'}</span></span>
          </a></li>
          <li><a className="eintrag werk" href="#warteschlange"><span className="titel">Warteschlange</span><span className="unter">{zahl(s.zaehler.wartet + s.zaehler.laeuft)} offen · {zahl(s.zaehler.fehler)} mit Fehler</span></a></li>
        </ul>
      )}
    </>
  );
}

export function TexterkennungPanel({ t }: { t: TexterkennungZustand }) {
  if (t.fehler) return <div className="hinweis schlecht"><p>{t.fehler}</p></div>;
  if (!t.stand) return <p className="leise">Lade …</p>;
  const s = t.stand;
  const w = s.werkzeuge;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Texterkennung</h1>
        <p className="leise">Neue Dokumente bekommen im Hintergrund einen Volltext: Bei PDFs liest das DMS zuerst die vorhandene Textebene, nur Seiten ohne Text gehen durch die Texterkennung. Ob ein Dokumentenregister einen Volltext erzeugt, stellst du am Mappentyp ein.</p>
      </div>

      <section className="blatt" id="werkzeuge">
        <h2 className="h3">Werkzeuge</h2>
        <dl className="eigenschaften">
          <dt>Texterkennung</dt><dd>{w.tesseract ?? <span className="fehlertext">nicht installiert – nur PDFs mit Textebene bekommen einen Volltext</span>}</dd>
          <dt>Sprachen</dt><dd>{w.sprachen.join(', ') || '–'}</dd>
          <dt>PDF-Text (poppler)</dt><dd>{w.pdftotext && w.pdftoppm ? 'vorhanden' : <span className="fehlertext">fehlt</span>}</dd>
        </dl>
        <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => void t.laden(true)}>Erneut prüfen</button></div>
      </section>

      <Einstellungen key={JSON.stringify(s.einstellungen)} t={t} />

      <section className="blatt" id="warteschlange">
        <h2 className="h3">Warteschlange</h2>
        <Warteschlange s={s} />
        <p className="leise klein">Dokumente ohne Volltext aus der Zeit vor der Texterkennung holst du unter „Wartungsoperationen“ nach. Bei einem Fehler lässt sich die Texterkennung am Dokument erneut anstoßen.</p>
      </section>
    </div>
  );
}

function Einstellungen({ t }: { t: TexterkennungZustand }) {
  const s = t.stand!;
  const [e, setE] = useState<OcrEinstellungen>(s.einstellungen);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const geaendert = JSON.stringify(e) !== JSON.stringify(s.einstellungen);
  const setze = (p: Partial<OcrEinstellungen>) => { setE((x) => ({ ...x, ...p })); setMeldung(undefined); };
  async function speichern() {
    try { t.setStand(await api.texterkennungSpeichern(e)); setMeldung({ art: 'gut', text: 'Gespeichert – gilt ab sofort.' }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <form className="blatt" id="einstellungen" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }}>
      <h2 className="h3">Einstellungen</h2>
      <label className="haken"><input type="checkbox" checked={e.aktiv} onChange={(ev) => setze({ aktiv: ev.target.checked })} /><span>Volltext erzeugen<small className="hilfe">Ausgeschaltet bleiben neue Dokumente in der Warteschlange, bis es wieder an ist.</small></span></label>
      <div className="raster">
        <label className="eigenschaft"><span>Gleichzeitige Aufträge <small>1–4</small></span>
          <input type="number" min={1} max={4} value={e.auftraege} onChange={(ev) => setze({ auftraege: Number(ev.target.value) })} /></label>
        <label className="eigenschaft"><span>Höchstens Seiten <small>je Dokument</small></span>
          <input type="number" min={1} max={1000} value={e.maxSeiten} onChange={(ev) => setze({ maxSeiten: Number(ev.target.value) })} /></label>
        <label className="eigenschaft"><span>Größere Dateien auslassen <small>ab MB</small></span>
          <input type="number" min={1} max={100} value={e.maxMB} onChange={(ev) => setze({ maxMB: Number(ev.target.value) })} /></label>
        <label className="eigenschaft"><span>Sprachen <small>z. B. deu+eng</small></span>
          <input className="mono" value={e.sprachen} onChange={(ev) => setze({ sprachen: ev.target.value })} /></label>
      </div>
      <p className="leise klein">Mehr gleichzeitige Aufträge sind schneller, brauchen aber mehr Prozessor und Speicher – auf einem NAS reicht meist einer. Seiten über der Höchstzahl werden nicht gelesen.</p>
      <h3 className="zwischen">Je Dateityp</h3>
      <div className="trefferliste">
        <table>
          <thead><tr><th>Dateityp</th><th>Verfahren</th></tr></thead>
          <tbody>
            {Object.entries(s.dateitypen).map(([mime, name]) => (
              <tr key={mime}>
                <td>{name} <span className="leise mono klein">{mime}</span></td>
                <td><select aria-label={`Verfahren für ${name}`} value={e.typen[mime] ?? 'tesseract'} onChange={(ev) => setze({ typen: { ...e.typen, [mime]: ev.target.value as 'tesseract' | 'aus' } })}>
                  {Object.entries(s.verfahren).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="leise klein">Andere Dateitypen (z. B. Office-Dokumente) bekommen vorerst keinen Volltext. Externe Dienste für die Texterkennung kommen später dazu.</p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        {geaendert && <button type="button" className="knopf" onClick={() => { setE(s.einstellungen); setMeldung(undefined); }}>Verwerfen</button>}
        <button className="knopf primaer" disabled={!geaendert}>Speichern</button>
      </div>
    </form>
  );
}

/* ---------- Wartungsoperationen ---------- */

export function WartungListe({ t }: { t: TexterkennungZustand }) {
  return (
    <>
      <div className="listenkopf"><div><h1>Wartungsoperationen</h1><p className="leise klein">Einmalige Arbeiten am Bestand.</p></div></div>
      <ul className="mappenliste">
        <li><a className="eintrag werk" href="#volltext">
          <span className="titel">Volltext nachholen</span>
          <span className="unter">{t.stand ? `${zahl(t.stand.zaehler.keiner)} Dokumente ohne Volltext` : '…'}</span>
        </a></li>
        <li><span className="eintrag werk"><span className="titel">Sicherung, Wiederherstellung, Export</span><span className="unter">kommt später</span></span></li>
      </ul>
    </>
  );
}

export function WartungPanel({ t }: { t: TexterkennungZustand }) {
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const s = t.stand;
  async function nachholen() {
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await api.volltextNachholen();
      setMeldung({ art: 'gut', text: r.eingereiht ? `${zahl(r.eingereiht)} ${r.eingereiht === 1 ? 'Dokument steht' : 'Dokumente stehen'} jetzt in der Warteschlange der Texterkennung.` : 'Nichts nachzuholen – alle Dokumente haben einen Volltext oder liegen in Registern ohne Volltext.' });
      await t.laden();
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Wartungsoperationen</h1>
        <p className="leise">Arbeiten am ganzen Bestand, die du bei Bedarf anstößt. Sie laufen im Hintergrund; das DMS bleibt benutzbar.</p>
      </div>
      <section className="blatt" id="volltext">
        <h2 className="h3">Volltext für vorhandene Dokumente nachholen</h2>
        <p className="leise">Dokumente, die vor der Texterkennung hochgeladen wurden, haben noch keinen Volltext. Das hier stellt alle in die Warteschlange, deren Dokumentenregister einen Volltext erzeugt. Je nach Menge und Seitenzahl kann das Stunden dauern.</p>
        {s && <Warteschlange s={s} />}
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <div className="knoepfe"><button type="button" className="knopf primaer" disabled={laeuft || !s?.zaehler.keiner} onClick={() => void nachholen()}>{laeuft ? 'Stelle ein …' : 'Volltext nachholen'}</button></div>
      </section>
      <section className="blatt">
        <h2 className="h3">Sicherung, Wiederherstellung und Export</h2>
        <p className="leise">Kommt später an dieser Stelle (siehe Issue #48).</p>
      </section>
    </div>
  );
}
