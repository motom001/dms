import { useEffect, useState } from 'react';
import type { Dokument } from '../../../shared/src/model';
import { ergebnisText, mb, STUFEN, STUFEN_LISTE, type Stufe } from '../../../shared/src/verkleinern';
import { api, type VerkleinernVorschau } from '../api';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';

/**
 * PDF verkleinern (#393): drei Stufen mit geschätzter Größe. „Verkleinern“ speichert das Ergebnis als neue
 * Version (ohne Versionierung nach Rückfrage als Ersatz); „Verkleinert herunterladen“ lässt das Dokument,
 * wie es ist. Bringt es weniger als 10 %, bleibt alles unverändert (Meldung).
 */
export function PdfVerkleinern({ d, bearbeitbar, schliessen, fertig }: {
  d: Dokument; bearbeitbar: boolean; schliessen(): void; fertig(meldung: string, geaendert: boolean): void;
}) {
  const [v, setV] = useState<VerkleinernVorschau>();
  const [stufe, setStufe] = useState<Stufe>('standard');
  const [fehler, setFehler] = useState<string>();
  const [laeuft, setLaeuft] = useState<'speichern' | 'laden'>();
  useEffect(() => { api.verkleinernVorschau(d.id).then(setV, (e: Error) => setFehler(e.message)); }, [d.id, d.sha256]);

  if (fehler && !v) return <div className="hinweis schlecht pdfseiten"><p>{fehler}</p><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>;
  if (!v) return <p className="leise pdfseiten" role="status">Sehe mir die Bilder im PDF an …</p>;
  const s = v.stufen[stufe];

  async function verkleinern() {
    let bestaetigt = false;
    if (!v!.versioniert) {
      if (!(await rueckfrage({ titel: `„${d.name}“ ersetzen?`, text: `Für dieses Register ist die Versionierung ausgeschaltet: Das verkleinerte PDF ersetzt das bisherige. ${v!.papierkorb ? 'Das bisherige kommt in den Papierkorb.' : 'Das bisherige ist danach weg.'}`, ja: 'Ersetzen', gefahr: !v!.papierkorb }))) return;
      bestaetigt = true;
    }
    setLaeuft('speichern'); setFehler(undefined);
    try {
      const r = await api.verkleinern(d.id, { stufe, bestaetigt });
      fertig(r.unveraendert ? r.meldung : `„${d.name}“ verkleinert ${ergebnisText(r.vorher, r.nachher)}${v!.versioniert ? ` – Version ${r.dokument.version ?? 1}, das Original bleibt als ältere Version` : ''}.`, !r.unveraendert);
    } catch (e) { setFehler((e as Error).message); setLaeuft(undefined); }
  }
  async function herunterladen() {
    setLaeuft('laden'); setFehler(undefined);
    try {
      const r = await api.herunterladenMitStempel(d.id, null, d.name, undefined, stufe);
      fertig(r.bytes < v!.groesse * 0.9 ? `Verkleinerte Kopie heruntergeladen (${ergebnisText(v!.groesse, r.bytes)}); „${d.name}“ bleibt unverändert.` : `„${d.name}“ lässt sich kaum verkleinern – heruntergeladen wurde das Original.`, false);
    } catch (e) { setFehler((e as Error).message); setLaeuft(undefined); }
  }

  return (
    <div className="pdfseiten verkleinern" role="region" aria-label={`${d.name} verkleinern`}>
      <div className="pdfseiten-kopf">
        <strong>PDF verkleinern</strong>
        <span className="leise klein">{mb(v.groesse)} · {v.seiten} {v.seiten === 1 ? 'Seite' : 'Seiten'}{v.hoechsteDpi ? ` · Bilder bis ${v.hoechsteDpi} dpi` : ' · ohne Bilder'}</span>
        <Hilfe ort="dokumente.verkleinern" />
      </div>
      <fieldset className="stufenwahl">
        <legend className="sr-only">Stufe</legend>
        {STUFEN_LISTE.map((k) => {
          const x = v.stufen[k];
          return (
            <label key={k} className={`stufe ${stufe === k ? 'gewaehlt' : ''}`}>
              <input type="radio" name={`stufe-${d.id}`} checked={stufe === k} onChange={() => setStufe(k)} />
              <span className="stufe-text">
                <strong>{STUFEN[k].name}</strong> <span className="leise klein">≈ {x.dpi} dpi{k === 'standard' ? ' · Vorgabe' : ''}</span>
                <span className="klein leise">{STUFEN[k].text}</span>
              </span>
              <span className={`stufe-groesse ${x.lohnt ? '' : 'leise'}`}>{x.lohnt ? <>≈ {mb(x.geschaetzt)} <span className="klein">(−{Math.round((1 - x.geschaetzt / v.groesse) * 100)} %)</span></> : <span className="klein">bringt kaum etwas</span>}</span>
            </label>
          );
        })}
      </fieldset>
      <p className="leise klein">Die Bilder werden heruntergerechnet und neu komprimiert; Text, Textebene und Volltext bleiben, wie sie sind. Die Größe danach ist geschätzt.
        {!s.lohnt && ' Bringt das Verkleinern weniger als 10 %, bleibt das Dokument unverändert.'}</p>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      <div className="pdfseiten-fuss">
        <span className="leise klein">{s.lohnt ? `${mb(v.groesse)} → ≈ ${mb(s.geschaetzt)}` : 'lohnt sich kaum'}</span>
        {bearbeitbar && <button type="button" className="knopf primaer klein" disabled={!!laeuft} onClick={() => void verkleinern()}>{laeuft === 'speichern' ? 'Wird verkleinert …' : v.versioniert ? 'Als neue Version speichern' : 'Verkleinern und ersetzen'}</button>}
        <button type="button" className="knopf klein" disabled={!!laeuft} onClick={() => void herunterladen()} title="Nur eine verkleinerte Kopie herunterladen; das Dokument bleibt unverändert">{laeuft === 'laden' ? 'Wird vorbereitet …' : 'Verkleinert herunterladen'}</button>
        <button type="button" className="knopf klein" disabled={!!laeuft} onClick={schliessen}>Abbrechen</button>
      </div>
    </div>
  );
}
