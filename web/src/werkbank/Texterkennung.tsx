import { DateienPruefen } from './Archiv';
import { NummernNachtragen } from './Nummernkreise';
import { useCallback, useEffect, useState } from 'react';
import { OCR_STAENDE, type OcrStandArt } from '../../../shared/src/model';
import { api, type OcrEinstellungen, type OcrStatus } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';

/**
 * Werkbank → Texterkennung (#45): Werkzeuge, Einstellungen, Warteschlange.
 * Werkbank → Wartungsoperationen: Volltext nachholen, alle Dateien prüfen (#212),
 * Nummern nachträglich vergeben. Sicherung, Wiederherstellung und Export sind eigene Bereiche.
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
      <div className="listenkopf"><div><h1>Texterkennung</h1><p className="leise klein">Volltext für die Suche: Textebene von PDFs und Texterkennung für Scans und Bilder. <Hilfe ort="werkbank.texterkennung" /></p></div></div>
      {s && (
        <ul className="mappenliste">
          <li><a className="eintrag werk" href="#werkzeuge"><span className="titel">Werkzeuge</span><span className="unter">{s.werkzeuge.tesseract ?? 'Texterkennung nicht installiert'}</span></a></li>
          <li><a className="eintrag werk" href="#einstellungen">
            <span className="titel">Einstellungen</span>
            <span className="unter">{s.einstellungen.aktiv ? `${s.einstellungen.auftraege} ${s.einstellungen.auftraege === 1 ? 'Auftrag' : 'Aufträge'} gleichzeitig · höchstens ${s.einstellungen.maxSeiten} Seiten` : 'ausgeschaltet'}</span>
            <span><span className={`chip ${s.einstellungen.aktiv ? 'gut' : ''}`}>{s.einstellungen.aktiv ? 'an' : 'aus'}</span></span>
          </a></li>
          <li><a className="eintrag werk" href="#auftraege"><span className="titel">Aufträge</span><span className="unter">einsehen, neu starten, abbrechen</span>{s.zaehler.fehler > 0 && <span><span className="chip schlecht">{zahl(s.zaehler.fehler)} Fehler</span></span>}</a></li>
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
        <p className="leise klein">Dokumente ohne Volltext aus der Zeit vor der Texterkennung holst du unter „Wartungsoperationen“ nach.</p>
      </section>

      <Auftraege t={t} />
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
        {geaendert && <button type="button" className="knopf" onClick={() => { setE(s.einstellungen); setMeldung(undefined); }}>Änderungen verwerfen</button>}
        <button className="knopf primaer" disabled={!geaendert}>Speichern</button>
      </div>
    </form>
  );
}

/* ---------- Wartungsoperationen ---------- */

export function WartungListe({ t }: { t: TexterkennungZustand }) {
  return (
    <>
      <div className="listenkopf"><div><h1>Wartungsoperationen</h1><p className="leise klein">Einmalige Arbeiten am Bestand. <Hilfe ort="werkbank.wartung" /></p></div></div>
      <ul className="mappenliste">
        <li><a className="eintrag werk" href="#volltext">
          <span className="titel">Volltext nachholen</span>
          <span className="unter">{t.stand ? `${zahl(t.stand.zaehler.keiner)} Dokumente ohne Volltext` : '…'}</span>
        </a></li>
        <li><a className="eintrag werk" href="#dateien"><span className="titel">Alle Dateien prüfen</span><span className="unter">Prüfwerte aller Dateien vergleichen</span></a></li>
        <li><a className="eintrag werk" href="#nummern"><span className="titel">Nummern nachträglich vergeben</span><span className="unter">für Mappen ohne Nummer</span></a></li>
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
      <VorschauNachholen />
      <DateienPruefen />
      <NummernNachtragen />
    </div>
  );
}

/** Aufträge der Texterkennung (#61): je Stand die Dokumente mit Mappe, neu starten, abbrechen. */
const STAENDE_LISTE: OcrStandArt[] = ['fehler', 'wartet', 'laeuft', 'ausgelassen', 'fertig'];
type Auftrag = Awaited<ReturnType<typeof api.ocrAuftraege>>['eintraege'][number];

function Auftraege({ t }: { t: TexterkennungZustand }) {
  const s = t.stand!;
  const [stand, setStand] = useState<OcrStandArt>(s.zaehler.fehler ? 'fehler' : s.zaehler.wartet || s.zaehler.laeuft ? 'wartet' : 'fehler');
  const [liste, setListe] = useState<{ gesamt: number; eintraege: Auftrag[] } | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const zaehlerText = JSON.stringify(s.zaehler);
  const laden = useCallback(async () => {
    try { setListe(await api.ocrAuftraege(stand)); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }, [stand]);
  useEffect(() => { void laden(); setAuswahl(new Set()); }, [laden, zaehlerText]);
  const ids = [...auswahl];
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try { const text = await f(); setMeldung({ art: 'gut', text }); setAuswahl(new Set()); await t.laden(); await laden(); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  const umschalten = (id: string) => setAuswahl((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alle = liste?.eintraege ?? [];
  const abbrechbar = stand === 'wartet' || stand === 'laeuft';
  return (
    <section className="blatt" id="auftraege">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">Aufträge</h2>
        {s.zaehler.fehler > 0 && <button type="button" className="knopf klein" onClick={() => void tu(async () => { const r = await api.ocrFehlerNeu(); return `${zahl(r.eingereiht)} ${r.eingereiht === 1 ? 'Dokument steht' : 'Dokumente stehen'} wieder in der Warteschlange.`; })}>Alle Fehler neu starten</button>}
      </div>
      <div className="registertaben klein" role="tablist" aria-label="Stand">
        {STAENDE_LISTE.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={stand === k} className={`registertab ${stand === k ? 'an' : ''}`} onClick={() => setStand(k)}>
            {OCR_STAENDE[k]} <span className="anzahl">{zahl(s.zaehler[k])}</span>
          </button>
        ))}
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      {liste === null ? <p className="leise">Lade …</p> : !alle.length ? <p className="leise">Keine Dokumente in diesem Stand.</p> : (
        <>
          <div className="tabellenrahmen">
            <table className="auftraege">
              <thead><tr>
                <th><input type="checkbox" aria-label="Alle wählen" checked={auswahl.size === alle.length} onChange={(e) => setAuswahl(e.target.checked ? new Set(alle.map((a) => a.dokument.id)) : new Set())} /></th>
                <th>Dokument</th><th>Mappe</th><th>Größe</th><th>{stand === 'fertig' ? 'Seiten' : 'Grund / Stand'}</th><th>seit</th>
              </tr></thead>
              <tbody>{alle.map((a) => {
                const o = a.dokument.ocr;
                return (
                  <tr key={a.dokument.id} className={auswahl.has(a.dokument.id) ? 'an' : ''}>
                    <td><input type="checkbox" aria-label={`${a.dokument.name} wählen`} checked={auswahl.has(a.dokument.id)} onChange={() => umschalten(a.dokument.id)} /></td>
                    <td>{a.dokument.name}</td>
                    <td><Link to={`/ablage/${a.typId}/${a.dokument.mappeId}`} className="verweis">{a.mappeTitel || 'Ohne Titel'}</Link></td>
                    <td className="zahlzelle">{groesse(a.dokument.groesse)}</td>
                    <td>{stand === 'fertig' ? (o?.seiten ?? '–') : (o?.info || OCR_STAENDE[o?.stand ?? 'keiner'])}</td>
                    <td className="leise">{o?.zeit ? new Date(o.zeit).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {liste.gesamt > alle.length && <p className="leise klein">Gezeigt werden die neuesten {zahl(alle.length)} von {zahl(liste.gesamt)}.</p>}
          <div className="knoepfe">
            {abbrechbar && <button type="button" className="knopf gefahr-rand" disabled={!ids.length} onClick={() => void tu(async () => { const r = await api.ocrAbbrechen(ids); return `${zahl(r.abgebrochen)} abgebrochen.`; })}>{stand === 'laeuft' ? 'Abbrechen' : 'Aus der Warteschlange nehmen'}</button>}
            <button type="button" className="knopf primaer" disabled={!ids.length} onClick={() => void tu(async () => { const r = await api.ocrNeu(ids); return `${zahl(r.eingereiht)} neu gestartet.`; })}>Neu starten{ids.length ? ` (${ids.length})` : ''}</button>
          </div>
        </>
      )}
    </section>
  );
}
const groesse = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/** Vorschaubilder der ersten Seite für vorhandene Dokumente erzeugen (#332). */
function VorschauNachholen() {
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  async function nachholen() {
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await api.vorschauNachholen();
      setMeldung({ art: 'gut', text: r.eingereiht ? `Für ${zahl(r.eingereiht)} ${r.eingereiht === 1 ? 'Datei entsteht' : 'Dateien entstehen'} jetzt im Hintergrund ein Vorschaubild.` : 'Nichts nachzuholen – alle PDFs und Bilder haben schon ein Vorschaubild.' });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  return (
    <section className="blatt" id="vorschau">
      <h2 className="h3">Vorschaubilder nachholen</h2>
      <p className="leise">Neben jedem PDF und Bild zeigt die Ablage ein kleines Bild der ersten Seite. Für neue Dokumente entsteht es gleich nach dem Hochladen, für ältere beim ersten Anzeigen. Das hier erzeugt die fehlenden auf einmal – eins nach dem anderen im Hintergrund.</p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe"><button type="button" className="knopf" disabled={laeuft} onClick={() => void nachholen()}>{laeuft ? 'Stelle ein …' : 'Vorschaubilder nachholen'}</button></div>
    </section>
  );
}
