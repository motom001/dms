import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Link, loeseWache } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { merkeStempelVorlagen, StempelBild } from '../ablage/Stempel';
import {
  ersetzePlatzhalter, pruefeVorlage, STEMPEL_LAGEN, STEMPEL_MODI, STEMPEL_NAME_MAX, STEMPEL_SEITEN, STEMPEL_TEXT_MAX,
  type StempelLage, type StempelSeiten, type StempelVorlage,
} from '../../../shared/src/stempel';

/**
 * Werkbank → Stempel (#394): Vorlagen für Stempel und Wasserzeichen beim Weitergeben.
 *
 * Zweiteilig nach der Regel aus #366: Die Mitte gibt es nur für große Sammlungen. Stempel-Vorlagen sind
 * eine kleine Sammlung (meist vier bis zehn) – sie stehen rechts als aufklappbare Liste wie „Gesperrte
 * Adressen“; aufgeklappt wird eine Vorlage direkt bearbeitet. Es ist immer nur eine offen, damit es nur
 * eine Speicherleiste gibt. ?offen=<id> klappt eine Vorlage auf (alte Links /werkbank/stempel/:id leiten dorthin).
 */

export function useStempelVorlagenWerkbank(offen: boolean) {
  const [liste, setL] = useState<StempelVorlage[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const setListe = useCallback((l: StempelVorlage[]) => { merkeStempelVorlagen(l); setL(l); }, []);
  const laden = useCallback(async () => { try { setListe(await api.stempelVorlagen()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, [setListe]);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { liste, fehler, laden, setListe };
}
export type StempelZustand = ReturnType<typeof useStempelVorlagenWerkbank>;

const beispiel = (text: string) => ersetzePlatzhalter(text, { empfaenger: 'Hausverwaltung Müller', benutzer: 'Anna Beispiel', mappe: 'Personalausweis' });

export function StempelPanel({ z }: { z: StempelZustand }) {
  const d = useDaten();
  const ausAdresse = new URLSearchParams(location.search).get('offen');
  const [offen, setOffen] = useState<string | null>(ausAdresse);
  // Auch nach der Umleitung eines alten Links (/werkbank/stempel/:id → ?offen=:id) aufklappen.
  useEffect(() => { if (ausAdresse) setOffen(ausAdresse); }, [ausAdresse]);
  const umschalten = async (id: string) => {
    if (offen === id) { setOffen(null); return; }
    // Ungespeicherte Änderungen der offenen Vorlage nicht stillschweigend verwerfen.
    if (offen && document.querySelector('.stempeleditor[data-geaendert="ja"]') && !(await rueckfrage({ titel: 'Änderungen verwerfen?', text: 'Die geöffnete Vorlage hat ungespeicherte Änderungen.', ja: 'Verwerfen', gefahr: true }))) return;
    loeseWache(); setOffen(id);
  };
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Stempel</h1>
        <p className="leise">Vorlagen für Stempel und Wasserzeichen beim Weitergeben. Benutzer wählen eine Vorlage beim Herunterladen, Exportieren oder Versenden und ergänzen den Empfänger; das gespeicherte Original bleibt immer unverändert. Ob ein Mappentyp einen Stempel vorschlägt oder verlangt, stellst du im Mappentyp ein. <Hilfe ort="werkbank.stempel" /></p>
      </div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      <div className="blatt stapel">
        <div className="zeile-zwischen"><h2 className="h3">Vorlagen</h2>
          <button type="button" className="knopf gruen klein" disabled={offen === 'neu'} onClick={() => void umschalten('neu')}>+ Neue Vorlage</button></div>
        {!z.liste ? <p className="leise">Lade …</p> : (
          <ul className="aufklappliste stempelvorlagen">
            {z.liste.map((v) => {
              const auf = offen === v.id;
              const genutzt = d.typen.filter((t) => t.stempel?.vorlage === v.id);
              return (
                <li key={v.id} className={auf ? 'an' : undefined}>
                  <button type="button" className="aufklappzeile" aria-expanded={auf} onClick={() => void umschalten(v.id)}>
                    <strong>{v.name}</strong> · <span className="stempeltext">{v.text}</span> <span className="leise klein">· {STEMPEL_LAGEN[v.lage].replace(/ \(.*\)$/, '')}{genutzt.length ? ` · ${genutzt.map((t) => t.name).join(', ')}` : ''}</span>
                  </button>
                  {auf && <StempelEditor key={v.id} z={z} id={v.id} schliessen={() => setOffen(null)} />}
                </li>
              );
            })}
            {offen === 'neu' && <li className="an"><p className="aufklappzeile" aria-expanded="true"><strong>Neue Vorlage</strong></p>
              <StempelEditor key="neu" z={z} id="neu" schliessen={() => setOffen(null)} geoeffnet={(id) => setOffen(id)} /></li>}
          </ul>
        )}
        {z.liste && !z.liste.length && offen !== 'neu' && <p className="leise">Noch keine Vorlage.</p>}
      </div>
    </div>
  );
}

interface Entwurf { name: string; text: string; lage: StempelLage; deckkraft: number; seiten: StempelSeiten; seitenzahlen: boolean; archivnummer: boolean }

function StempelEditor({ z, id, schliessen, geoeffnet }: { z: StempelZustand; id: string; schliessen(): void; geoeffnet?: (id: string) => void }) {
  const d = useDaten();
  const neu = id === 'neu';
  const v = neu ? undefined : z.liste?.find((x) => x.id === id);
  const gespeichert: Entwurf = { name: v?.name ?? '', text: v?.text ?? '', lage: v?.lage ?? 'diagonal', deckkraft: v?.deckkraft ?? 0.25, seiten: v?.seiten ?? 'alle', seitenzahlen: v?.seitenzahlen ?? false, archivnummer: v?.archivnummer ?? false };
  const [e, setE] = useState(gespeichert);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(gespeichert, e, { neu, zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); if (neu) schliessen(); } });
  if (!neu && !v) return z.liste ? <div className="leer"><p>Diese Vorlage gibt es nicht (mehr).</p></div> : <p className="leise">Lade …</p>;
  const fehler = pruefeVorlage(e, (z.liste ?? []).filter((x) => x.id !== v?.id).map((x) => x.name));
  const genutzt = d.typen.filter((t) => t.stempel?.vorlage === v?.id);
  async function speichern() {
    setSendet(true); setMeldung(undefined);
    try {
      const l = neu ? await api.stempelVorlageAnlegen(e) : await api.stempelVorlageAendern(v!.id, e);
      z.setListe(l);
      if (neu) { loeseWache(); geoeffnet?.(l[l.length - 1].id); return; }
      setMeldung({ art: 'gut', text: 'Gespeichert.' });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  async function loeschen() {
    if (!(await rueckfrage({ titel: `Vorlage „${v!.name}“ löschen?`, text: 'Bereits weitergegebene Kopien behalten ihren Stempel.', ja: 'Löschen', gefahr: true }))) return;
    try { z.setListe(await api.stempelVorlageLoeschen(v!.id)); loeseWache(); schliessen(); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <div className="stempeleditor" data-geaendert={ent.geaendert ? 'ja' : 'nein'}>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <form onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input id="stempel-name" value={e.name} maxLength={STEMPEL_NAME_MAX} onChange={(x) => setE({ ...e, name: x.target.value })} required /></label>
          <label className="eigenschaft breit"><span>Text <small>Platzhalter: {'{datum}'}, {'{empfänger}'}, {'{benutzer}'}, {'{mappe}'}</small></span>
            <input id="stempel-text" value={e.text} maxLength={STEMPEL_TEXT_MAX} onChange={(x) => setE({ ...e, text: x.target.value })} required /></label>
          <label className="eigenschaft"><span>Lage</span>
            <select id="stempel-lage" value={e.lage} onChange={(x) => setE({ ...e, lage: x.target.value as StempelLage })}>{Object.entries(STEMPEL_LAGEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
          <label className="eigenschaft"><span>Deckkraft <small>{Math.round(e.deckkraft * 100)} %</small></span>
            <input id="stempel-deckkraft" type="range" min={10} max={100} step={5} value={Math.round(e.deckkraft * 100)} onChange={(x) => setE({ ...e, deckkraft: Number(x.target.value) / 100 })} /></label>
          <label className="eigenschaft"><span>Seiten</span>
            <select id="stempel-seiten" value={e.seiten} onChange={(x) => setE({ ...e, seiten: x.target.value as StempelSeiten })}>{Object.entries(STEMPEL_SEITEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        </div>
        <div className="stempelzeile">
          <StempelBild text={beispiel(e.text)} lage={e.lage} deckkraft={e.deckkraft} fuss={[e.archivnummer ? 'A-000123' : '', e.seitenzahlen ? 'Seite 1 von 3' : ''].filter(Boolean).join(' · ')} />
          <div>
            <label className="haken"><input type="checkbox" checked={e.seitenzahlen} onChange={(x) => setE({ ...e, seitenzahlen: x.target.checked })} /><span>Seitenzahlen „Seite x von y“ als Fußzeile</span></label>
            <label className="haken"><input type="checkbox" checked={e.archivnummer} onChange={(x) => setE({ ...e, archivnummer: x.target.checked })} /><span>Archivnummer des Dokuments in der Fußzeile</span></label>
            {e.text.trim() && <p className="klein">Beispiel: <strong className="stempeltext">{beispiel(e.text)}</strong></p>}
          </div>
        </div>
        {Object.values(fehler).map((f) => <p key={f} className="fehlertext klein">{f}</p>)}
        <Speicherleiste ent={ent} gegenstand="Vorlage" sendet={sendet} ungueltig={Object.keys(fehler).length > 0}
          links={!neu && <button type="button" className="textknopf gefahr" disabled={genutzt.length > 0} title={genutzt.length ? 'Ein Mappentyp verwendet sie noch' : undefined} onClick={() => void loeschen()}>Vorlage löschen</button>} />
      </form>
      {!neu && <p className="leise klein">Verwendet in: {genutzt.length ? genutzt.map((t, i) => <span key={t.id}>{i > 0 && ', '}<Link to={`/werkbank/typen/${t.id}`} className="verweis">{t.name}</Link> ({STEMPEL_MODI[t.stempel!.modus]})</span>)
        : 'keinem Mappentyp. Das stellst du im Mappentyp unter „Stempel beim Weitergeben“ ein.'}</p>}
    </div>
  );
}
