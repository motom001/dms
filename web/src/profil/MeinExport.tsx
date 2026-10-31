import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useKonto } from '../konto';
import { Hilfe } from '../Hilfe';

/** Profil → Meine Daten exportieren (#255): eigene Daten im Format des Vollexports. */
export function MeinExport() {
  const { vertretung } = useKonto();
  const [s, setS] = useState<Awaited<ReturnType<typeof api.meinExport>> | null>(null);
  const [pw, setPw] = useState(false);
  const [pwOk, setPwOk] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setS(await api.meinExport()); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => { if (!s?.laeuft) return; const t = setInterval(() => void laden(), 2000); return () => clearInterval(t); }, [s?.laeuft, laden]);
  if (!s) return null;
  return (
    <div className="blatt" id="export">
      <h2 className="h3">Meine Daten exportieren <Hilfe ort="profil.export" /></h2>
      {!s.erlaubt ? <p className="leise">Ein Administrator hat den persönlichen Export abgeschaltet.</p> : <>
        <p className="leise">Alle Mappen, die du lesen darfst, mit ihren Dokumenten, dazu deine Aufgaben, Erinnerungen, Favoriten und dein Profil – in offenen Formaten (CSV, JSON, Excel, PDF), lesbar ohne das DMS. Der Export ist unverschlüsselt.</p>
        <label className="haken"><input type="checkbox" checked={pw} onChange={(e) => { setPw(e.target.checked); if (!e.target.checked) setPwOk(false); }} /><span>Passwortfelder, die ich sehen darf, im Klartext mitnehmen<small className="hilfe">als passwoerter.csv für einen Passwortmanager</small></span></label>
        {pw && <label className="haken einzug"><input type="checkbox" checked={pwOk} onChange={(e) => setPwOk(e.target.checked)} /><span className="fehlertext">Mir ist klar: Die Passwörter stehen unverschlüsselt in der Datei.</span></label>}
        {s.laeuft && <p className="leise">Export läuft …</p>}
        {s.fehler && <p className="fehlertext">{s.fehler}</p>}
        {fehler && <p className="fehlertext">{fehler}</p>}
        {s.fertig && !s.laeuft && <p>Fertig am {s.fertig.erstellt ? new Date(s.fertig.erstellt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–'}: <a className="knopf klein" href="/api/konto/export/zip">Herunterladen (ZIP)</a></p>}
        <div className="knoepfe"><button type="button" className="knopf" disabled={s.laeuft || (pw && !pwOk) || !!vertretung}
          onClick={() => { setFehler(undefined); void api.meinExportStarten(pw, pwOk).then(laden).catch((e) => setFehler((e as Error).message)); }}>{s.fertig ? 'Neu exportieren' : 'Export erstellen'}</button></div>
      </>}
    </div>
  );
}
