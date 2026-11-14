import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type DebugStand, type ModusEintrag, type Protokolleintrag, type Stufe } from '../api';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { Listenkopf } from '../Listenkopf';
import { Feld, HakenFeld, Knopf, KnopfLink, Suchfeld } from '../bausteine';
import { istWeg } from '../erreichbar';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Protokoll in der Werkbank: Mitte die Einträge (neueste oben, mit Filtern und
 * Live-Aktualisierung), rechts der gewählte Eintrag oder der Debug-Modus.
 * Der Server hält die letzten 24 Stunden, höchstens 10.000 Einträge.
 */
const ANZEIGE_MAX = 2000;
const STUFEN: Array<{ wert: Stufe; name: string }> = [
  { wert: 'trace', name: t('werkbank.protokoll.alles') }, { wert: 'debug', name: t('werkbank.protokoll.ab-debug') }, { wert: 'info', name: t('werkbank.protokoll.ab-info') },
  { wert: 'warn', name: t('werkbank.protokoll.warnungen-und-fehler') }, { wert: 'error', name: t('werkbank.protokoll.nur-fehler') },
];
const STUFENNAME: Record<Stufe, string> = { trace: t('werkbank.protokoll.trace'), debug: t('werkbank.protokoll.debug'), info: t('werkbank.protokoll.info'), warn: t('werkbank.protokoll.warnung'), error: t('werkbank.protokoll.fehler'), fatal: t('werkbank.protokoll.fatal') };
const uhr = (iso: string) => new Date(iso).toLocaleTimeString(gebietsschema(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const datumUhr = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'medium' });

/** Verständlicher Name eines Moduls (#682); unbekannte Kürzel bleiben, wie sie sind. */
export const modulName = (m: string): string => (t.hat(`werkbank.protokoll.modul.${m}`) ? t.frei(`werkbank.protokoll.modul.${m}`) : m);

export interface Filter { stufe: Stufe; modul: string; benutzer: string; anfrage: string; suche: string }

export function useProtokoll(sichtbar = true) {
  const [filter, setFilter] = useState<Filter>({ stufe: 'debug', modul: '', benutzer: '', anfrage: '', suche: '' });
  const [eintraege, setEintraege] = useState<Protokolleintrag[]>([]);
  const [module, setModule] = useState<string[]>([]);
  const [jeModul, setJeModul] = useState<Record<string, number>>({});
  const [debug, setDebug] = useState<DebugStand | null>(null);
  const [gespeichert, setGespeichert] = useState(0);
  const [live, setLive] = useState(true);
  const [fehler, setFehler] = useState<string>();
  const letzte = useRef(0);
  const [suche, setSuche] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSuche(filter.suche.trim()), 250); return () => clearTimeout(timer); }, [filter.suche]);
  const params = useMemo(() => ({ stufe: filter.stufe, modul: filter.modul, benutzer: filter.benutzer, anfrage: filter.anfrage, suche }), [filter.stufe, filter.modul, filter.benutzer, filter.anfrage, suche]);

  const laden = useCallback(async (nurNeue: boolean) => {
    try {
      const r = await api.protokoll({ ...params, seit: nurNeue ? letzte.current : undefined, max: nurNeue ? 500 : ANZEIGE_MAX });
      letzte.current = r.letzte;
      setModule(r.module); setJeModul(r.jeModul ?? {}); setDebug(r.debug); setGespeichert(r.gespeichert); setFehler(undefined);
      setEintraege((alt) => (nurNeue ? [...r.eintraege, ...alt].slice(0, ANZEIGE_MAX) : r.eintraege));
    } catch (e) { setFehler((e as Error).message); }
  }, [params]);

  // Die Werkbank hält den Zustand; geladen wird nur, solange das Protokoll offen ist.
  useEffect(() => { if (sichtbar) void laden(false); }, [laden, sichtbar]);
  useEffect(() => {
    if (!live || !sichtbar) return;
    const timer = setInterval(() => { if (!istWeg()) void laden(true); }, 2000);
    return () => clearInterval(timer);
  }, [live, laden, sichtbar]);

  return { filter, setFilter, eintraege, module, jeModul, debug, setDebug, gespeichert, live, setLive, fehler, neu: () => laden(false) };
}
export type ProtokollZustand = ReturnType<typeof useProtokoll>;

export function ProtokollListe({ p, offen }: { p: ProtokollZustand; offen?: string }) {
  const f = p.filter;
  const setze = (x: Partial<Filter>) => p.setFilter({ ...f, ...x });
  const benutzer = useMemo(() => [...new Set(p.eintraege.map((e) => e.benutzer).filter(Boolean) as string[])].sort(), [p.eintraege]);
  return (
    <>
      <Listenkopf titel={t('werkbank.protokoll.protokoll')} hilfe="werkbank.protokoll" beschreibung={<>{t('werkbank.protokoll.letzte-24-stunden-hoechstens', { gespeichert: p.gespeichert.toLocaleString(gebietsschema()) })}</>} />
      <div className="protokollfilter">
        <Feld beschriftung={t('werkbank.protokoll.stufe')} beschriftungVerbergen>
          <select value={f.stufe} onChange={(e) => setze({ stufe: e.target.value as Stufe })}>{STUFEN.map((s) => <option key={s.wert} value={s.wert}>{s.name}</option>)}</select>
        </Feld>
        <Feld beschriftung={t('werkbank.protokoll.modul')} beschriftungVerbergen>
          <select value={f.modul} onChange={(e) => setze({ modul: e.target.value })}><option value="">{t('werkbank.protokoll.alle-module')}</option>{p.module.map((m) => <option key={m} value={m}>{modulName(m)}{p.jeModul[m] ? '' : ` ${t('werkbank.protokoll.modul.leer')}`}</option>)}</select>
        </Feld>
        <Feld beschriftung={t('werkbank.protokoll.benutzer')} beschriftungVerbergen>
          <select value={f.benutzer} onChange={(e) => setze({ benutzer: e.target.value })}><option value="">{t('werkbank.protokoll.alle-benutzer')}</option>{benutzer.map((b) => <option key={b}>{b}</option>)}{f.benutzer && !benutzer.includes(f.benutzer) && <option>{f.benutzer}</option>}</select>
        </Feld>
        <Suchfeld wert={f.suche} setze={(suche) => setze({ suche })} beschriftung={t('werkbank.protokoll.text')} platzhalter={t('werkbank.protokoll.text-2')} />
        <HakenFeld beschriftung={t('werkbank.protokoll.live')} className="klein">
          <input type="checkbox" checked={p.live} onChange={(e) => p.setLive(e.target.checked)} />
        </HakenFeld>
      </div>
      {f.anfrage && <div className="hinweis info"><p>{tn('werkbank.protokoll.nur-anfrage', { span: <span className="mono">{f.anfrage}</span> })}</p><Knopf art="link" onClick={() => setze({ anfrage: '' })}>{t('werkbank.protokoll.alle-zeigen')}</Knopf></div>}
      {p.fehler && <div className="hinweis schlecht"><p>{p.fehler}</p></div>}
      {!p.eintraege.length
        ? <p className="leise leerliste">{t('werkbank.protokoll.keine-eintraege', { wert: f.modul || f.benutzer || f.suche ? t('werkbank.protokoll.fuer-diesen-filter') : '' })}</p>
        : <ul className="mappenliste protokoll">
            {p.eintraege.map((e) => (
              <li key={e.nr}>
                <Link to={`/werkbank/protokoll/${e.nr}`} className={`eintrag werk stufe-${e.stufe} ${offen === String(e.nr) ? 'an' : ''}`}>
                  <span className="zeile1"><span className="mono klein">{uhr(e.zeit)}</span> <span className={`chip stufe-${e.stufe}`}>{STUFENNAME[e.stufe]}</span> <span className="leise klein" title={e.modul}>{modulName(e.modul)}</span></span>
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
  if (nr && !e) return <div className="leer"><p>{t('werkbank.protokoll.dieser-eintrag-ist-nicht')}</p><Link to="/werkbank/protokoll" className="verweis">{t('werkbank.protokoll.zum-debug-modus')}</Link></div>;
  if (!e) return <><DebugPanel p={p} /><ImVerwaltungsmodus /></>;
  const text = JSON.stringify(e, null, 2);
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.protokoll.protokolleintrag', { nr: e.nr })}</p>
        <h1>{e.text}</h1>
        <dl className="index">
          <div><dt>{t('werkbank.protokoll.zeit')}</dt><dd>{datumUhr(e.zeit)}</dd></div>
          <div><dt>{t('werkbank.protokoll.stufe')}</dt><dd><span className={`chip stufe-${e.stufe}`}>{STUFENNAME[e.stufe]}</span></dd></div>
          <div><dt>{t('werkbank.protokoll.modul')}</dt><dd>{modulName(e.modul)} <span className="mono leise klein">{e.modul}</span></dd></div>
          {e.benutzer && <div><dt>{t('werkbank.protokoll.benutzer')}</dt><dd>{e.benutzer}</dd></div>}
          {e.anfrage && <div><dt>{t('werkbank.protokoll.anfrage')}</dt><dd className="mono">{e.anfrage}</dd></div>}
        </dl>
      </div>
      {e.anfrage && <p><Knopf art="link" onClick={() => p.setFilter({ stufe: 'trace', modul: '', benutzer: '', anfrage: e.anfrage!, suche: '' })}>{t('werkbank.protokoll.alle-eintraege-dieser-anfrage')}</Knopf></p>}
      {e.daten && <div className="blatt"><h2 className="h3">{t('werkbank.protokoll.daten')}</h2><pre className="protokolldaten">{Object.entries(e.daten).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`).join('\n')}</pre></div>}
      <div className="knoepfe">
        <Knopf onClick={() => navigator.clipboard?.writeText(text).then(() => setKopiert(true))}>{kopiert ? t('werkbank.protokoll.kopiert') : t('werkbank.protokoll.als-text-kopieren')}</Knopf>
        <KnopfLink to="/werkbank/protokoll">{t('werkbank.protokoll.schliessen')}</KnopfLink>
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
        <p className="ueber">{t('werkbank.protokoll.werkbank')}</p>
        <h1>{t('werkbank.protokoll.protokoll')}</h1>
        <p className="leise">{t('werkbank.protokoll.waehle-links-einen-eintrag')}</p>
      </div>
      <div className="blatt">
        <h2 className="h3">{t('werkbank.protokoll.debug-modus')}</h2>
        {d?.an
          ? <div className="hinweis warn"><p>{t('werkbank.protokoll.eingeschaltet-bis-uhr-danach', { uhrzeit: new Date(d.bis!).toLocaleTimeString(gebietsschema(), { hour: '2-digit', minute: '2-digit' }) })}</p></div>
          : <p className="leise">{t('werkbank.protokoll.aus-protokolliert-wird-ab', { wert: d?.grundstufe ?? t('werkbank.protokoll.info-2') })}</p>}
        <p className="leise">{t('werkbank.protokoll.im-debug-modus-kommen')}</p>
        <div className="knoepfe">
          {d?.an
            ? <><Knopf gesperrt={laeuft} onClick={() => schalte(true)}>{t('werkbank.protokoll.um-eine-stunde-verlaengern')}</Knopf><Knopf gesperrt={laeuft} onClick={() => schalte(false)}>{t('werkbank.protokoll.ausschalten')}</Knopf></>
            : <Knopf art="haupt" gesperrt={laeuft} onClick={() => schalte(true)}>{t('werkbank.protokoll.fuer-eine-stunde-einschalten')}</Knopf>}
        </div>
      </div>
    </div>
  );
}

/**
 * Im Verwaltungsmodus angesehen (#820): wer im Modus welche Mappe geöffnet, heruntergeladen, geändert, exportiert oder
 * versendet hat, die er sonst nicht sehen dürfte – nicht löschbar. Nur für „Gesamte Verwaltung“.
 */
function ImVerwaltungsmodus() {
  const { verwaltungsmodus } = useKonto();
  const [liste, setListe] = useState<ModusEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const gesamt = verwaltungsmodus.bereiche === null;
  useEffect(() => { if (gesamt) api.imVerwaltungsmodus().then(setListe).catch((x) => setFehler((x as Error).message)); }, [gesamt]);
  if (!gesamt) return null;
  return (
    <div className="einspaltig" id="im-verwaltungsmodus">
      <div className="blatt">
        <h2 className="h3">{t('werkbank.verwaltungsmodus.liste.titel')}</h2>
        <p className="leise">{t('werkbank.verwaltungsmodus.liste.text')}</p>
        {fehler && <p className="fehlertext">{fehler}</p>}
        {liste && !liste.length && <p className="leise">{t('werkbank.verwaltungsmodus.liste.leer')}</p>}
        {liste && liste.length > 0 && (
          <div className="tabellenrahmen">
            <table className="tabelle">
              <thead><tr><th>{t('werkbank.verwaltungsmodus.liste.zeit')}</th><th>{t('werkbank.verwaltungsmodus.liste.person')}</th><th>{t('werkbank.verwaltungsmodus.liste.mappe')}</th><th>{t('werkbank.verwaltungsmodus.liste.was')}</th></tr></thead>
              <tbody>{liste.map((x) => (
                <tr key={x.id}><td>{datumUhr(x.zeit)}</td><td>{x.person || '–'}</td><td>{x.typId ? <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{x.titel || t('werkbank.verwaltungsmodus.liste.ohneTitel')}</Link> : x.titel || t('werkbank.verwaltungsmodus.liste.ohneTitel')}</td><td>{t.frei(`mappen.historie.verwaltungsmodus.${x.was}`)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
