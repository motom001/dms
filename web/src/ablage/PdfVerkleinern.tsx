import { useEffect, useState } from 'react';
import type { Dokument } from '../../../shared/src/model';
import { ergebnisText, mb, STUFEN, STUFEN_LISTE, type Stufe } from '../../../shared/src/verkleinern';
import { api, type VerkleinernVorschau } from '../api';
import { Hilfe } from '../Hilfe';
import { FeldGruppe, Knopf } from '../bausteine';
import { rueckfrage } from '../rueckfrage';
import { t, tn } from '../sprache';

/**
 * PDF verkleinern (#393): drei Stufen mit geschätzter Größe. „Verkleinern“ speichert das Ergebnis als neue
 * Version (ohne Versionierung nach Rückfrage als Ersatz); „Verkleinert herunterladen“ lässt das Dokument,
 * wie es ist. Bringt es weniger als 10 %, bleibt alles unverändert (Meldung).
 */
export function PdfVerkleinern({ d, bearbeitbar, mitnehmen = true, schliessen, fertig }: {
  d: Dokument; bearbeitbar: boolean;
  /** Exportrecht (#723): ohne E keine verkleinerte Kopie zum Herunterladen. */
  mitnehmen?: boolean;
  schliessen(): void; fertig(meldung: string, geaendert: boolean): void;
}) {
  const [v, setV] = useState<VerkleinernVorschau>();
  const [stufe, setStufe] = useState<Stufe>('standard');
  const [fehler, setFehler] = useState<string>();
  const [laeuft, setLaeuft] = useState<'speichern' | 'laden'>();
  useEffect(() => { api.verkleinernVorschau(d.id).then(setV, (e: Error) => setFehler(e.message)); }, [d.id, d.sha256]);

  if (fehler && !v) return <div className="hinweis schlecht pdfseiten"><p>{fehler}</p><Knopf art="link" onClick={schliessen}>{t('ablage.pdfverkleinern.schliessen')}</Knopf></div>;
  if (!v) return <p className="leise pdfseiten" role="status">{t('ablage.pdfverkleinern.sehe-mir-die-bilder')}</p>;
  const s = v.stufen[stufe];

  async function verkleinern() {
    let bestaetigt = false;
    if (!v!.versioniert) {
      if (!(await rueckfrage({ titel: t('ablage.pdfverkleinern.ersetzen', { name: d.name }), text: t('ablage.pdfverkleinern.fuer-dieses-register-ist', { wert: v!.papierkorb ? t('ablage.pdfverkleinern.das-bisherige-kommt-in') : t('ablage.pdfverkleinern.das-bisherige-ist-danach') }), ja: t('ablage.pdfverkleinern.ersetzen-2'), gefahr: !v!.papierkorb }))) return;
      bestaetigt = true;
    }
    setLaeuft('speichern'); setFehler(undefined);
    try {
      const r = await api.verkleinern(d.id, { stufe, bestaetigt });
      fertig(r.unveraendert ? r.meldung : t('ablage.pdfverkleinern.verkleinert', { name: d.name, ergebnisText: ergebnisText(r.vorher, r.nachher), wert: v!.versioniert ? t('ablage.pdfverkleinern.version-das-original-bleibt', { wert: r.dokument.version ?? 1 }) : '' }), !r.unveraendert);
    } catch (e) { setFehler((e as Error).message); setLaeuft(undefined); }
  }
  async function herunterladen() {
    setLaeuft('laden'); setFehler(undefined);
    try {
      const r = await api.herunterladenMitStempel(d.id, null, d.name, undefined, stufe);
      fertig(r.bytes < v!.groesse * 0.9 ? t('ablage.pdfverkleinern.verkleinerte-kopie-heruntergeladen', { ergebnisText: ergebnisText(v!.groesse, r.bytes), name: d.name }) : t('ablage.pdfverkleinern.laesst-sich-kaum-verkleinern', { name: d.name }), false);
    } catch (e) { setFehler((e as Error).message); setLaeuft(undefined); }
  }

  return (
    <div className="pdfseiten verkleinern" role="region" aria-label={t('ablage.pdfverkleinern.verkleinern', { name: d.name })}>
      <div className="pdfseiten-kopf">
        <strong>{t('ablage.pdfverkleinern.pdf-verkleinern')}</strong>
        <span className="leise klein">{mb(v.groesse)} · {v.seiten} {t('ablage.pdfverkleinern.seiten', { anzahl: v.seiten })}{v.hoechsteDpi ? t('ablage.pdfverkleinern.bilder-bis-dpi', { hoechsteDpi: v.hoechsteDpi }) : t('ablage.pdfverkleinern.ohne-bilder')}</span>
        <Hilfe ort="dokumente.verkleinern" />
      </div>
      <FeldGruppe beschriftung={t('ablage.pdfverkleinern.stufe')} beschriftungVerbergen className="stufenwahl">
        {STUFEN_LISTE.map((k) => {
          const x = v.stufen[k];
          return (
            <label key={k} className={`stufe ${stufe === k ? 'gewaehlt' : ''}`}>
              <input type="radio" name={`stufe-${d.id}`} checked={stufe === k} onChange={() => setStufe(k)} />
              <span className="stufe-text">
                <strong>{STUFEN[k].name}</strong> <span className="leise klein">{t('ablage.pdfverkleinern.dpi', { dpi: x.dpi, wert: k === 'standard' ? t('ablage.pdfverkleinern.vorgabe') : '' })}</span>
                <span className="klein leise">{STUFEN[k].text}</span>
              </span>
              <span className={`stufe-groesse ${x.lohnt ? '' : 'leise'}`}>{x.lohnt ? <>≈ {mb(x.geschaetzt)} <span className="klein">(−{Math.round((1 - x.geschaetzt / v.groesse) * 100)} %)</span></> : <span className="klein">{t('ablage.pdfverkleinern.bringt-kaum-etwas')}</span>}</span>
            </label>
          );
        })}
      </FeldGruppe>
      <p className="leise klein">{tn('ablage.pdfverkleinern.die-bilder-werden-heruntergerechnet', { wert: !s.lohnt && t('ablage.pdfverkleinern.bringt-das-verkleinern-weniger') })}</p>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      <div className="pdfseiten-fuss">
        <span className="leise klein">{s.lohnt ? `${mb(v.groesse)} → ≈ ${mb(s.geschaetzt)}` : t('ablage.pdfverkleinern.lohnt-sich-kaum')}</span>
        {bearbeitbar && <Knopf art="haupt" groesse="klein" gesperrt={laeuft === 'laden'} laeuft={laeuft === 'speichern'} laeuftText={t('ablage.pdfverkleinern.wird-verkleinert')} onClick={() => void verkleinern()}>{v.versioniert ? t('ablage.pdfverkleinern.als-neue-version-speichern') : t('ablage.pdfverkleinern.verkleinern-und-ersetzen')}</Knopf>}
        {mitnehmen && <Knopf groesse="klein" gesperrt={laeuft === 'speichern'} laeuft={laeuft === 'laden'} laeuftText={t('ablage.pdfverkleinern.wird-vorbereitet')} onClick={() => void herunterladen()} title={t('ablage.pdfverkleinern.nur-eine-verkleinerte-kopie')}>{t('ablage.pdfverkleinern.verkleinert-herunterladen')}</Knopf>}
        <Knopf groesse="klein" gesperrt={!!laeuft} onClick={schliessen}>{t('ablage.pdfverkleinern.abbrechen')}</Knopf>
      </div>
    </div>
  );
}
