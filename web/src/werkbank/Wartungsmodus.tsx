import { t, tn } from '../sprache';
import { Kopf } from './Kopf';
import { Knopf } from '../bausteine';
import { useCallback, useEffect, useState } from 'react';
import { api, type WartungWerkbank } from '../api';
import { dauerText, WARTUNG_GEAENDERT, zeitpunkt } from '../wartung';
import { Hilfe } from '../Hilfe';
import { istWeg } from '../erreichbar';
import { rueckfrage } from '../rueckfrage';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Werkbank → Wartungsmodus (#102): ankündigen (Zeitschiene Beginn → Ende, #402), sofort sperren, alle abmelden, beenden;
 * dazu die angemeldeten Sitzungen.
 */

/** Lädt einmal (für die Leiste); geöffnet alle 10 Sekunden. */
export function useWartungsmodus(offen: boolean) {
  const [stand, setStand] = useState<WartungWerkbank | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.werkbankWartung()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    // laden fängt Fehler selbst ab (fehler); der Ereignis-Handler gibt kein Promise zurück (#1011).
    const neu = () => void laden();
    neu();
    addEventListener(WARTUNG_GEAENDERT, neu);
    if (!offen) return () => removeEventListener(WARTUNG_GEAENDERT, neu);
    const timer = setInterval(() => { if (!istWeg()) neu(); }, 10_000);
    return () => { clearInterval(timer); removeEventListener(WARTUNG_GEAENDERT, neu); };
  }, [offen, laden]);
  return { stand, fehler, laden };
}
export type WartungsmodusZustand = ReturnType<typeof useWartungsmodus>;

const STUFE = { aus: t('werkbank.wartungsmodus.stufe.aus'), angekuendigt: t('werkbank.wartungsmodus.stufe.angekuendigt'), aktiv: t('werkbank.wartungsmodus.stufe.aktiv') } as const;
const geraetKurz = (ua: string) => {
  if (!ua) return t('werkbank.wartungsmodus.unbekanntes-geraet');
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|python/i.test(ua) ? t('werkbank.wartungsmodus.programm') : t('werkbank.wartungsmodus.browser');
  const s = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return s ? t('werkbank.wartungsmodus.auf', { b, s }) : b;
};
/** datetime-local ↔ ISO in der Zeitzone des Browsers. */
const lokal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const inMinuten = (min: number) => lokal(new Date(Date.now() + min * 60_000).toISOString());
const SCHNELL = [[15, t('werkbank.wartungsmodus.15-min')], [30, t('werkbank.wartungsmodus.30-min')], [60, t('werkbank.wartungsmodus.1-std')]] as const;
/** Uhrzeit, bei einem anderen Tag mit Datum. */
const uhr = (d: Date) => d.toDateString() === new Date().toDateString()
  ? d.toLocaleTimeString(gebietsschema(), { hour: '2-digit', minute: '2-digit' })
  : zeitpunkt(d.toISOString());
const wann = (d: Date) => t('werkbank.wartungsmodus.uhr', { wert: d.toDateString() === new Date().toDateString() ? t('werkbank.wartungsmodus.um') : t('werkbank.wartungsmodus.am'), uhr: uhr(d) });

/**
 * Zeitschiene Beginn → Ende (#402): Prüfung und der Satz, der die Wirkung zusammenfasst.
 * Werte aus datetime-local (Zeitzone des Browsers); leer = nicht gesetzt.
 */
export function zeitschiene(beginn: string, ende: string, jetzt = new Date()): { fehler?: string; satz?: string } {
  const b = beginn ? new Date(beginn) : null;
  const e = ende ? new Date(ende) : null;
  if (!b || Number.isNaN(b.getTime())) return { fehler: t('werkbank.wartungsmodus.bitte-gib-den-beginn') };
  if (b.getTime() <= jetzt.getTime()) return { fehler: t('werkbank.wartungsmodus.der-beginn-liegt-in') };
  if (b.getTime() > jetzt.getTime() + 24 * 3600_000) return { fehler: t('konten.verwaltende.wartung.beginn') };
  if (e && e.getTime() <= b.getTime()) return { fehler: t('werkbank.wartungsmodus.das-erwartete-ende-muss') };
  const ab = wann(b);
  return { satz: t('werkbank.wartungsmodus.ab-jetzt-sehen-alle', { ab: ab[0].toUpperCase(), ab2: ab.slice(1), wert: e ? t('werkbank.wartungsmodus.ende-voraussichtlich-uhr', { uhr: uhr(e) }) : '' }) };
}

export function WartungsmodusPanel({ w, abschnitt }: { w: WartungsmodusZustand; abschnitt?: boolean }) {
  const s = w.stand;
  const [text, setText] = useState('');
  const [ende, setEnde] = useState('');
  const [beginn, setBeginn] = useState(() => inMinuten(30));
  const [, setTakt] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [vorbelegt, setVorbelegt] = useState(false);
  useEffect(() => {
    if (!s || vorbelegt) return;
    setText(s.text); setEnde(lokal(s.ende)); setVorbelegt(true);
  }, [s, vorbelegt]);
  // Prüfung und Satz hängen an „jetzt“: einmal je Minute neu zeichnen.
  useEffect(() => { const timer = setInterval(() => setTakt((x) => x + 1), 30_000); return () => clearInterval(timer); }, []);
  if (w.fehler) return <div className="hinweis schlecht"><p>{w.fehler}</p></div>;
  if (!s) return <p className="leise">{t('werkbank.wartungsmodus.lade')}</p>;

  async function tu(f: () => Promise<unknown>, gut: string) {
    setLaeuft(true); setMeldung(undefined);
    try { await f(); await w.laden(); dispatchEvent(new Event(WARTUNG_GEAENDERT)); setMeldung({ art: 'gut', text: gut }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  const eingabe = { text, ende: ende ? new Date(ende).toISOString() : null };
  const andere = s.sitzungen.filter((x) => !x.aktuell).length;
  const schiene = zeitschiene(beginn, ende);

  return (
    <div className="einspaltig">
      <Kopf titel={abschnitt ? t('werkbank.wartungsmodus.wartungsmodus') : t('werkbank.wartungsmodus.wartung')} abschnitt={abschnitt} id="wartungsmodus" hilfe="werkbank.wartungsmodus">
        <p className="leise">{tn('werkbank.wartungsmodus.schalte-ihn-vor-einem', { b: <strong>{t('werkbank.wartungsmodus.wartungsmodus-2')}</strong> })}</p>
      </Kopf>

      <section className="blatt" id="stand">
        <h2 className="h3">{t('werkbank.wartungsmodus.stand')}</h2>
        <dl className="eigenschaften">
          <dt>{t('werkbank.wartungsmodus.wartungsmodus')}</dt><dd><span className={`chip ${s.stufe === 'aus' ? '' : s.stufe === 'aktiv' ? 'schlecht' : 'warn'}`}>{STUFE[s.stufe]}</span></dd>
          {s.stufe === 'angekuendigt' && s.aktivAb && <><dt>{t('werkbank.wartungsmodus.aktiv-ab')}</dt><dd>{t('werkbank.wartungsmodus.uhr-2', { zeitpunkt: zeitpunkt(s.aktivAb), wert: s.sekunden !== null ? t('werkbank.wartungsmodus.in', { dauerText: dauerText(s.sekunden) }) : '' })}</dd></>}
          {s.stufe === 'aktiv' && s.aktivAb && <><dt>{t('werkbank.wartungsmodus.aktiv-seit')}</dt><dd>{t('werkbank.wartungsmodus.uhr-2', { zeitpunkt: zeitpunkt(s.aktivAb), wert: s.sofort ? t('werkbank.wartungsmodus.sofort-gesperrt') : '' })}</dd></>}
          {s.stufe !== 'aus' && s.von && <><dt>{t('werkbank.wartungsmodus.eingeschaltet-von')}</dt><dd>{s.von}</dd></>}
        </dl>

        <div className="raster">
          <label className="eigenschaft breit"><span>{tn('werkbank.wartungsmodus.text-fuer-alle', { klein: <small>{t('werkbank.wartungsmodus.z-b-wiederherstellung-ca')}</small> })}</span>
            <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} /></label>
          {s.stufe === 'aus' && (
            <div className="eigenschaft wm-oben">
              <span><label htmlFor="wartung-beginn">{t('werkbank.wartungsmodus.beginn')}</label> <small>{t('werkbank.wartungsmodus.alle-anderen-werden-abgemeldet')}</small></span>
              <input id="wartung-beginn" type="datetime-local" value={beginn} onChange={(e) => setBeginn(e.target.value)} />
              <div className="wm-schnell" role="group" aria-label={t('werkbank.wartungsmodus.beginn-schnell-waehlen')}>
                {SCHNELL.map(([min, name]) => <button key={min} type="button" className="knopf klein" onClick={() => setBeginn(inMinuten(min))}>{name}</button>)}
              </div>
            </div>
          )}
          <label className={`eigenschaft${s.stufe === 'aus' ? ' wm-oben' : ''}`}><span>{tn('werkbank.wartungsmodus.erwartetes-ende', { klein: <small>{t('werkbank.wartungsmodus.optional')}</small> })}</span>
            <input type="datetime-local" value={ende} onChange={(e) => setEnde(e.target.value)} /></label>
        </div>
        {s.stufe === 'aus' && (schiene.fehler
          ? <p className="fehlertext" role="status">{schiene.fehler}</p>
          : <p className="leise" role="status">{schiene.satz}</p>)}
        <div className="knoepfe">
          {s.stufe === 'aus' && (
            <Knopf art="haupt" gesperrt={laeuft || !!schiene.fehler} onClick={() => {
              const ab = new Date(beginn);
              return tu(() => api.wartungEin({ ...eingabe, beginn: ab.toISOString() }), t('werkbank.wartungsmodus.wartung-angekuendigt-alle-anderen', { wann: wann(ab) }));
            }}>{t('werkbank.wartungsmodus.wartung-ankuendigen')}</Knopf>
          )}
          {s.stufe === 'aktiv' && <Knopf gesperrt={laeuft} onClick={() => tu(() => api.wartungEin({ ...eingabe, vorlauf: 0 }), t('werkbank.wartungsmodus.text-und-ende-uebernommen'))}>{t('werkbank.wartungsmodus.text-und-ende-uebernehmen')}</Knopf>}
          {s.stufe !== 'aus' && (
            <Knopf art="gefahr" gesperrt={laeuft} onClick={async () => {
              if (!(await rueckfrage({ titel: t('werkbank.wartungsmodus.alle-jetzt-abmelden'), text: andere ? t('werkbank.wartungsmodus.andere-sitzungen-werden-sofort', { anzahl: andere }) : t('werkbank.wartungsmodus.die-wartung-beginnt-sofort'), ja: t('werkbank.wartungsmodus.alle-abmelden'), gefahr: true }))) return;
              await tu(() => api.wartungJetzt(), t('werkbank.wartungsmodus.alle-anderen-sind-abgemeldet'));
            }}>{t('werkbank.wartungsmodus.alle-jetzt-abmelden-2')}</Knopf>
          )}
          {s.stufe !== 'aus' && <Knopf gesperrt={laeuft} onClick={() => tu(() => api.wartungAus(), t('werkbank.wartungsmodus.wartungsmodus-beendet-alle-koennen'))}>{t('werkbank.wartungsmodus.wartung-beenden')}</Knopf>}
        </div>
        {/* Ergebnis unter den Knöpfen (#986): darüber verschiebt sich nichts. */}
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        {s.stufe === 'aus' && (
          <div className="wm-sofort" id="sofort">
            <Knopf art="gefahr" gesperrt={laeuft} onClick={async () => {
              if (!(await rueckfrage({ titel: t('werkbank.wartungsmodus.jetzt-sofort-sperren'), text: t('werkbank.wartungsmodus.alle-anderen-sitzungen-werden'), ja: t('werkbank.wartungsmodus.jetzt-sofort-sperren-2'), gefahr: true }))) return;
              await tu(() => api.wartungEin({ ...eingabe, sofort: true }), t('werkbank.wartungsmodus.sofort-gesperrt-alle-anderen'));
            }}>{t('werkbank.wartungsmodus.jetzt-sofort-sperren-2')}</Knopf>
            <p className="leise klein">{tn('werkbank.wartungsmodus.fuer-notfaelle-z-b', { hilfe: <Hilfe ort="wartungsmodus.sofort" /> })}</p>
          </div>
        )}
      </section>

      <section className="blatt" id="sitzungen">
        <h2 className="h3">{t('werkbank.wartungsmodus.angemeldete-sitzungen')}</h2>
        {!s.sitzungen.length ? <p className="leise">{t('werkbank.wartungsmodus.niemand-ist-angemeldet')}</p> : (
          <div className="trefferliste"><table>
            <thead><tr><th>{t('werkbank.wartungsmodus.benutzer')}</th><th>{t('werkbank.wartungsmodus.geraet')}</th><th>{t('werkbank.wartungsmodus.letzte-aktivitaet')}</th></tr></thead>
            <tbody>{s.sitzungen.map((x) => (
              <tr key={x.id}>
                <td>{x.name || x.email}{x.rolle === 'admin' && <span className="chip">{t('konten.verwaltung.menue.darf')}</span>}{x.aktuell && <span className="chip gut">{t('werkbank.wartungsmodus.dieses-geraet')}</span>}</td>
                <td title={x.geraet}>{geraetKurz(x.geraet)}{x.ip ? <span className="leise"> · {x.ip}</span> : null}</td>
                <td className="kurz">{zeitpunkt(x.zuletztAktiv)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
