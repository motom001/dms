import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type DebugStand, type Protokolleintrag, type Stufe } from '../api';
import { Link } from '../ort';

/**
 * Protokoll in der Werkbank: Mitte die Einträge (neueste oben, mit Filtern und
 * Live-Aktualisierung), rechts der gewählte Eintrag oder der Debug-Modus.
 * Der Server hält die letzten 24 Stunden, höchstens 10.000 Einträge.
 */
const ANZEIGE_MAX = 2000;
const STUFEN: Array<{ wert: Stufe; name: string }> = [
  { wert: 'trace', name: 'Alles' }, { wert: 'debug', name: 'ab Debug' }, { wert: 'info', name: 'ab Info' },
  { wert: 'warn', name: 'Warnungen und Fehler' }, { wert: 'error', name: 'nur Fehler' },
];
const STUFENNAME: Record<Stufe, string> = { trace: 'Trace', debug: 'Debug', info: 'Info', warn: 'Warnung', error: 'Fehler', fatal: 'Fatal' };
const uhr = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const datumUhr = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'medium' });

export interface Filter { stufe: Stufe; modul: string; benutzer: string; anfrage: string; suche: string }

export function useProtokoll(sichtbar = true) {
  const [filter, setFilter] = useState<Filter>({ stufe: 'debug', modul: '', benutzer: '', anfrage: '', suche: '' });
  const [eintraege, setEintraege] = useState<Protokolleintrag[]>([]);
  const [module, setModule] = useState<string[]>([]);
  const [debug, setDebug] = useState<DebugStand | null>(null);
  const [gespeichert, setGespeichert] = useState(0);
  const [live, setLive] = useState(true);
  const [fehler, setFehler] = useState<string>();
  const letzte = useRef(0);
  const [suche, setSuche] = useState('');
  useEffect(() => { const t = setTimeout(() => setSuche(filter.suche.trim()), 250); return () => clearTimeout(t); }, [filter.suche]);
  const params = useMemo(() => ({ stufe: filter.stufe, modul: filter.modul, benutzer: filter.benutzer, anfrage: filter.anfrage, suche }), [filter.stufe, filter.modul, filter.benutzer, filter.anfrage, suche]);

  const laden = useCallback(async (nurNeue: boolean) => {
    try {
      const r = await api.protokoll({ ...params, seit: nurNeue ? letzte.current : undefined, max: nurNeue ? 500 : ANZEIGE_MAX });
      letzte.current = r.letzte;
      setModule(r.module); setDebug(r.debug); setGespeichert(r.gespeichert); setFehler(undefined);
      setEintraege((alt) => (nurNeue ? [...r.eintraege, ...alt].slice(0, ANZEIGE_MAX) : r.eintraege));
    } catch (e) { setFehler((e as Error).message); }
  }, [params]);

  // Die Werkbank hält den Zustand; geladen wird nur, solange das Protokoll offen ist.
  useEffect(() => { if (sichtbar) void laden(false); }, [laden, sichtbar]);
  useEffect(() => {
    if (!live || !sichtbar) return;
    const t = setInterval(() => void laden(true), 2000);
    return () => clearInterval(t);
  }, [live, laden, sichtbar]);

  return { filter, setFilter, eintraege, module, debug, setDebug, gespeichert, live, setLive, fehler, neu: () => laden(false) };
}
export type ProtokollZustand = ReturnType<typeof useProtokoll>;

export function ProtokollListe({ p, offen }: { p: ProtokollZustand; offen?: string }) {
  const f = p.filter;
  const setze = (x: Partial<Filter>) => p.setFilter({ ...f, ...x });
  const benutzer = useMemo(() => [...new Set(p.eintraege.map((e) => e.benutzer).filter(Boolean) as string[])].sort(), [p.eintraege]);
  return (
    <>
      <div className="listenkopf">
        <div><h1>Protokoll</h1><p className="leise klein">Letzte 24 Stunden, höchstens 10.000 Einträge ({p.gespeichert.toLocaleString('de-DE')} gespeichert). Neueste oben.</p></div>
      </div>
      <div className="protokollfilter">
        <label><span className="sr">Stufe</span>
          <select value={f.stufe} onChange={(e) => setze({ stufe: e.target.value as Stufe })}>{STUFEN.map((s) => <option key={s.wert} value={s.wert}>{s.name}</option>)}</select></label>
        <label><span className="sr">Modul</span>
          <select value={f.modul} onChange={(e) => setze({ modul: e.target.value })}><option value="">Alle Module</option>{p.module.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label><span className="sr">Benutzer</span>
          <select value={f.benutzer} onChange={(e) => setze({ benutzer: e.target.value })}><option value="">Alle Benutzer</option>{benutzer.map((b) => <option key={b}>{b}</option>)}{f.benutzer && !benutzer.includes(f.benutzer) && <option>{f.benutzer}</option>}</select></label>
        <label className="suche"><span className="sr">Text</span><input type="search" placeholder="Text …" value={f.suche} onChange={(e) => setze({ suche: e.target.value })} /></label>
        <label className="haken klein"><input type="checkbox" checked={p.live} onChange={(e) => p.setLive(e.target.checked)} /><span>Live</span></label>
      </div>
      {f.anfrage && <div className="hinweis info"><p>Nur Anfrage <span className="mono">{f.anfrage}</span></p><button className="textknopf" onClick={() => setze({ anfrage: '' })}>Alle zeigen</button></div>}
      {p.fehler && <div className="hinweis schlecht"><p>{p.fehler}</p></div>}
      {!p.eintraege.length
        ? <p className="leise leerliste">Keine Einträge{f.modul || f.benutzer || f.suche ? ' für diesen Filter' : ''}.</p>
        : <ul className="mappenliste protokoll">
            {p.eintraege.map((e) => (
              <li key={e.nr}>
                <Link to={`/werkbank/protokoll/${e.nr}`} className={`eintrag werk stufe-${e.stufe} ${offen === String(e.nr) ? 'an' : ''}`}>
                  <span className="zeile1"><span className="mono klein">{uhr(e.zeit)}</span> <span className={`chip stufe-${e.stufe}`}>{STUFENNAME[e.stufe]}</span> <span className="leise klein">{e.modul}</span></span>
                  <span className="titel">{e.text}</span>
                  {e.benutzer && <span className="unter">{e.benutzer}</span>}
                </Link>
              </li>
            ))}
          </ul>}
    </>
  );
}

export function ProtokollDetail({ p, nr }: { p: ProtokollZustand; nr?: string }) {
  const e = nr ? p.eintraege.find((x) => String(x.nr) === nr) : undefined;
  const [kopiert, setKopiert] = useState(false);
  if (nr && !e) return <div className="leer"><p>Dieser Eintrag ist nicht (mehr) in der Liste.</p><Link to="/werkbank/protokoll" className="verweis">Zum Debug-Modus</Link></div>;
  if (!e) return <DebugPanel p={p} />;
  const text = JSON.stringify(e, null, 2);
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Protokolleintrag {e.nr}</p>
        <h1>{e.text}</h1>
        <dl className="index">
          <div><dt>Zeit</dt><dd>{datumUhr(e.zeit)}</dd></div>
          <div><dt>Stufe</dt><dd><span className={`chip stufe-${e.stufe}`}>{STUFENNAME[e.stufe]}</span></dd></div>
          <div><dt>Modul</dt><dd>{e.modul}</dd></div>
          {e.benutzer && <div><dt>Benutzer</dt><dd>{e.benutzer}</dd></div>}
          {e.anfrage && <div><dt>Anfrage</dt><dd className="mono">{e.anfrage}</dd></div>}
        </dl>
      </div>
      {e.anfrage && <p><button type="button" className="textknopf" onClick={() => p.setFilter({ stufe: 'trace', modul: '', benutzer: '', anfrage: e.anfrage!, suche: '' })}>Alle Einträge dieser Anfrage zeigen</button></p>}
      {e.daten && <div className="blatt"><h2 className="h3">Daten</h2><pre className="protokolldaten">{Object.entries(e.daten).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`).join('\n')}</pre></div>}
      <div className="knoepfe">
        <button type="button" className="knopf" onClick={() => void navigator.clipboard?.writeText(text).then(() => setKopiert(true))}>{kopiert ? 'Kopiert' : 'Als Text kopieren'}</button>
        <Link to="/werkbank/protokoll" className="knopf">Schließen</Link>
      </div>
    </div>
  );
}

function DebugPanel({ p }: { p: ProtokollZustand }) {
  const [laeuft, setLaeuft] = useState(false);
  const d = p.debug;
  async function schalte(an: boolean) {
    setLaeuft(true);
    try { p.setDebug(await api.debug(an)); await p.neu(); } finally { setLaeuft(false); }
  }
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Protokoll</h1>
        <p className="leise">Wähle links einen Eintrag, um alle Angaben zu sehen. Jede Zeile steht auch in den Container-Logs des NAS; dort bleiben sie auch nach einem Neustart.</p>
      </div>
      <div className="blatt">
        <h2 className="h3">Debug-Modus</h2>
        {d?.an
          ? <div className="hinweis warn"><p>Eingeschaltet bis {new Date(d.bis!).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr. Danach schaltet er sich selbst ab.</p></div>
          : <p className="leise">Aus. Protokolliert wird ab Stufe „{d?.grundstufe ?? 'info'}“.</p>}
        <p className="leise">Im Debug-Modus kommen ausführliche Einträge dazu: jede Anfrage mit Dauer und Anzahl der Datenbankzugriffe, geladene Sichten, angezeigte Dokumente. Gut zum Nachstellen eines Fehlers; er schaltet sich nach einer Stunde selbst wieder ab.</p>
        <div className="knoepfe">
          {d?.an
            ? <><button className="knopf" disabled={laeuft} onClick={() => void schalte(true)}>Um eine Stunde verlängern</button><button className="knopf" disabled={laeuft} onClick={() => void schalte(false)}>Ausschalten</button></>
            : <button className="knopf primaer" disabled={laeuft} onClick={() => void schalte(true)}>Für eine Stunde einschalten</button>}
        </div>
      </div>
    </div>
  );
}
