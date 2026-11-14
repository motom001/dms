import { useCallback, useEffect, useState } from 'react';
import { kontoApi } from '../api/konto';
import { useKonto } from '../konto';
import { Hilfe } from '../Hilfe';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { HakenFeld, Knopf } from '../bausteine';

/** Profil → Meine Daten exportieren (#255): eigene Daten im Format des Vollexports. */
export function MeinExport() {
  const { vertretung } = useKonto();
  const [s, setS] = useState<Awaited<ReturnType<typeof kontoApi.meinExport>> | null>(null);
  const [pw, setPw] = useState(false);
  const [pwOk, setPwOk] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setS(await kontoApi.meinExport()); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => { if (!s?.laeuft) return; const timer = setInterval(() => void laden(), 2000); return () => clearInterval(timer); }, [s?.laeuft, laden]);
  if (!s) return null;
  return (
    <div className="blatt" id="export">
      <h2 className="h3">{tn('profil.meinexport.meine-daten-exportieren', { hilfe: <Hilfe ort="profil.export" /> })}</h2>
      {!s.erlaubt ? <p className="leise">{t('profil.meinexport.der-persoenliche-export-ist')}</p> : <>
        <p className="leise">{t('profil.meinexport.alle-mappen-die-du')}</p>
        <HakenFeld beschriftung={t('profil.meinexport.passwortfelder-die-ich-sehen')} hinweis={t('profil.meinexport.als-passwoerter-csv-fuer')}>
          <input type="checkbox" checked={pw} onChange={(e) => { setPw(e.target.checked); if (!e.target.checked) setPwOk(false); }} /></HakenFeld>
        {pw && <HakenFeld className="einzug" beschriftung={t('profil.meinexport.mir-ist-klar-die')}><input type="checkbox" checked={pwOk} onChange={(e) => setPwOk(e.target.checked)} /></HakenFeld>}
        {s.laeuft && <p className="leise">{t('profil.meinexport.export-laeuft')}</p>}
        {s.fehler && <p className="fehlertext">{s.fehler}</p>}
        {fehler && <p className="fehlertext">{fehler}</p>}
        {s.fertig && !s.laeuft && <p>{tn('profil.meinexport.fertig-am', { wert: s.fertig.erstellt ? new Date(s.fertig.erstellt).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–', link: <a className="knopf klein" href="/api/konto/export/zip">{t('profil.meinexport.herunterladen-zip')}</a>, klein: <small className="hilfe">{t('profil.export.bereit', { datum: new Date(s.fertig.bis).toLocaleDateString(gebietsschema(), { dateStyle: 'medium' }) })}</small> })}</p>}
        <div className="knoepfe"><Knopf gesperrt={s.laeuft || (pw && !pwOk) || !!vertretung}
          onClick={() => { setFehler(undefined); void kontoApi.meinExportStarten(pw, pwOk).then(laden).catch((e) => setFehler((e as Error).message)); }}>{s.fertig ? t('profil.meinexport.neu-exportieren') : t('profil.meinexport.export-erstellen')}</Knopf></div>
      </>}
    </div>
  );
}
