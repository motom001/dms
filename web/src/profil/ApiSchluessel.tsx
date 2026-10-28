import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type ApiSchluessel, type ApiSchluesselEingabe } from '../api';
import { Link } from '../ort';

/** API-Schlüssel im eigenen Profil (#20): erzeugen, ändern, löschen; ganz sichtbar nur beim Erzeugen. */
const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const RECHTE = { lesen: 'nur lesen', schreiben: 'lesen und schreiben' } as const;
const alsDatum = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const ausDatum = (t: string) => (t ? new Date(`${t}T23:59:59`).toISOString() : null);

export function ApiSchluesselBlatt() {
  const [liste, setListe] = useState<ApiSchluessel[] | null>(null);
  const [neu, setNeu] = useState<(ApiSchluessel & { schluessel: string }) | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const laden = useCallback(async () => { try { setListe(await api.apiSchluessel()); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function aktion(fn: () => Promise<unknown>) {
    setFehler(undefined);
    try { await fn(); await laden(); return true; } catch (e) { setFehler((e as Error).message); return false; }
  }

  return (
    <div className="blatt">
      <div className="blattkopf">
        <h2 className="h3">API-Schlüssel</h2>
        <p className="leise">Damit greifen andere Programme auf das DMS zu – mit höchstens deinen Rechten. Header: <span className="mono">Authorization: Bearer dms_…</span>. <Link to="/api-doku" className="verweis">API-Dokumentation</Link></p>
      </div>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {neu && <NeuerSchluessel s={neu} schliessen={() => setNeu(null)} />}
      {liste && liste.length > 0 && (
        <ul className="sitzungsliste">
          {liste.map((s) => bearbeite === s.id
            ? <li key={s.id}><SchluesselFormular start={s} knopf="Speichern" abbrechen={() => setBearbeite(null)}
                senden={(d) => aktion(async () => { await api.apiSchluesselAendern(s.id, d); setBearbeite(null); })} /></li>
            : (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong> <span className="mono klein">{s.praefix}</span> <span className={`chip ${s.recht === 'schreiben' ? 'warn' : ''}`}>{RECHTE[s.recht]}</span>
                  {s.ablauf && Date.parse(s.ablauf) < Date.now() && <> <span className="chip stufe-error">abgelaufen</span></>}
                  <span className="leise klein blockzeile">Erstellt {datum(s.erstellt)} · zuletzt benutzt {datum(s.zuletztBenutzt)}{s.ablauf ? ` · gültig bis ${new Date(s.ablauf).toLocaleDateString('de-DE')}` : ' · ohne Ablauf'}</span>
                </div>
                <span className="zeilenaktionen">
                  <button type="button" className="textknopf" onClick={() => setBearbeite(s.id)}>Ändern</button>
                  <button type="button" className="textknopf gefahr" onClick={() => { if (confirm(`Schlüssel „${s.name}“ löschen? Programme, die ihn nutzen, kommen dann nicht mehr hinein.`)) void aktion(() => api.apiSchluesselLoeschen(s.id)); }}>Löschen</button>
                </span>
              </li>
            ))}
        </ul>
      )}
      {liste && !liste.length && !neu && <p className="leise">Noch keine Schlüssel.</p>}
      <details className="neuerschluessel">
        <summary className="knopf">Neuen Schlüssel erzeugen</summary>
        <SchluesselFormular knopf="Erzeugen" senden={(d) => aktion(async () => setNeu(await api.apiSchluesselAnlegen(d)))} />
      </details>
    </div>
  );
}

function SchluesselFormular({ start, knopf, senden, abbrechen }: { start?: ApiSchluessel; knopf: string; senden: (d: ApiSchluesselEingabe) => Promise<boolean>; abbrechen?: () => void }) {
  const [name, setName] = useState(start?.name ?? '');
  const [recht, setRecht] = useState<'lesen' | 'schreiben'>(start?.recht ?? 'lesen');
  const [ablauf, setAblauf] = useState(alsDatum(start?.ablauf ?? null));
  async function los(e: FormEvent) {
    e.preventDefault();
    if (await senden({ name, recht, ablauf: ausDatum(ablauf) }) && !start) { setName(''); setAblauf(''); }
  }
  return (
    <form className="raster schluesselformular" onSubmit={los}>
      <label className="eigenschaft"><span>Name <small>z. B. „Scanner Büro“</small></span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label className="eigenschaft"><span>Rechte</span>
        <select value={recht} onChange={(e) => setRecht(e.target.value as 'lesen' | 'schreiben')}>
          <option value="lesen">nur lesen</option><option value="schreiben">lesen und schreiben</option>
        </select></label>
      <label className="eigenschaft"><span>Gültig bis <small>leer = ohne Ablauf</small></span><input type="date" value={ablauf} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setAblauf(e.target.value)} /></label>
      <div className="knoepfe">
        {abbrechen && <button type="button" className="knopf" onClick={abbrechen}>Abbrechen</button>}
        <button className="knopf primaer">{knopf}</button>
      </div>
    </form>
  );
}

function NeuerSchluessel({ s, schliessen }: { s: ApiSchluessel & { schluessel: string }; schliessen: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="hinweis warn stapel" role="status">
      <p><strong>Schlüssel „{s.name}“ erzeugt.</strong> Kopiere ihn jetzt – er wird nur dieses eine Mal ganz angezeigt.</p>
      <input className="mono" readOnly value={s.schluessel} onFocus={(e) => e.target.select()} aria-label="Neuer API-Schlüssel" />
      <div className="knoepfe">
        <button type="button" className="knopf" onClick={() => void navigator.clipboard?.writeText(s.schluessel).then(() => setKopiert(true), () => {})}>{kopiert ? 'Kopiert' : 'Kopieren'}</button>
        <button type="button" className="knopf" onClick={schliessen}>Habe ihn gesichert</button>
      </div>
    </div>
  );
}
