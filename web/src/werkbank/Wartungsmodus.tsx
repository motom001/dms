import { useCallback, useEffect, useState } from 'react';
import { api, type WartungWerkbank } from '../api';
import { dauerText, WARTUNG_GEAENDERT, zeitpunkt } from '../wartung';
import { Hilfe } from '../Hilfe';
import { istWeg } from '../erreichbar';
import { rueckfrage } from '../rueckfrage';

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
    void laden();
    addEventListener(WARTUNG_GEAENDERT, laden);
    if (!offen) return () => removeEventListener(WARTUNG_GEAENDERT, laden);
    const t = setInterval(() => { if (!istWeg()) void laden(); }, 10_000);
    return () => { clearInterval(t); removeEventListener(WARTUNG_GEAENDERT, laden); };
  }, [offen, laden]);
  return { stand, fehler, laden };
}
export type WartungsmodusZustand = ReturnType<typeof useWartungsmodus>;

const STUFE = { aus: 'aus', angekuendigt: 'angekündigt', aktiv: 'an' } as const;
const geraetKurz = (ua: string) => {
  if (!ua) return 'unbekanntes Gerät';
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|python/i.test(ua) ? 'Programm' : 'Browser';
  const s = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return s ? `${b} auf ${s}` : b;
};
/** datetime-local ↔ ISO in der Zeitzone des Browsers. */
const lokal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const inMinuten = (min: number) => lokal(new Date(Date.now() + min * 60_000).toISOString());
const SCHNELL = [[15, '+15 min'], [30, '+30 min'], [60, '+1 Std']] as const;
/** Uhrzeit, bei einem anderen Tag mit Datum. */
const uhr = (d: Date) => d.toDateString() === new Date().toDateString()
  ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  : zeitpunkt(d.toISOString());
const wann = (d: Date) => `${d.toDateString() === new Date().toDateString() ? 'um' : 'am'} ${uhr(d)} Uhr`;

/**
 * Zeitschiene Beginn → Ende (#402): Prüfung und der Satz, der die Wirkung zusammenfasst.
 * Werte aus datetime-local (Zeitzone des Browsers); leer = nicht gesetzt.
 */
export function zeitschiene(beginn: string, ende: string, jetzt = new Date()): { fehler?: string; satz?: string } {
  const b = beginn ? new Date(beginn) : null;
  const e = ende ? new Date(ende) : null;
  if (!b || Number.isNaN(b.getTime())) return { fehler: 'Bitte gib den Beginn an.' };
  if (b.getTime() <= jetzt.getTime()) return { fehler: 'Der Beginn liegt in der Vergangenheit. Für sofort bitte „Jetzt sofort sperren“ nutzen.' };
  if (b.getTime() > jetzt.getTime() + 24 * 3600_000) return { fehler: 'Der Beginn darf höchstens 24 Stunden in der Zukunft liegen – ab der Ankündigung können sich nur noch Administratoren anmelden.' };
  if (e && e.getTime() <= b.getTime()) return { fehler: 'Das erwartete Ende muss nach dem Beginn liegen.' };
  const ab = wann(b);
  return { satz: `Ab jetzt sehen alle einen Hinweis mit Countdown; anmelden können sich nur noch Administratoren. ${ab[0].toUpperCase()}${ab.slice(1)} werden alle anderen abgemeldet.${e ? ` Ende voraussichtlich ${uhr(e)} Uhr.` : ''}` };
}

export function WartungsmodusPanel({ w }: { w: WartungsmodusZustand }) {
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
  useEffect(() => { const t = setInterval(() => setTakt((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  if (w.fehler) return <div className="hinweis schlecht"><p>{w.fehler}</p></div>;
  if (!s) return <p className="leise">Lade …</p>;

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
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Wartungsmodus</h1>
        <p className="leise">Schalte ihn vor einem Update oder einer Wiederherstellung ein. Erst sehen alle einen Hinweis mit Countdown und können ihre Arbeit speichern; dann werden alle außer dir abgemeldet, die Schnittstelle antwortet mit „503“, und Texterkennung, tägliche Zusammenfassung und das Aufräumen des Papierkorbs pausieren. <Hilfe ort="werkbank.wartungsmodus" /></p>
      </div>

      <section className="blatt" id="stand">
        <h2 className="h3">Stand</h2>
        <dl className="eigenschaften">
          <dt>Wartungsmodus</dt><dd><span className={`chip ${s.stufe === 'aus' ? '' : s.stufe === 'aktiv' ? 'schlecht' : 'warn'}`}>{STUFE[s.stufe]}</span></dd>
          {s.stufe === 'angekuendigt' && s.aktivAb && <><dt>Aktiv ab</dt><dd>{zeitpunkt(s.aktivAb)} Uhr{s.sekunden !== null ? ` (in ${dauerText(s.sekunden)})` : ''}</dd></>}
          {s.stufe === 'aktiv' && s.aktivAb && <><dt>Aktiv seit</dt><dd>{zeitpunkt(s.aktivAb)} Uhr{s.sofort ? ' – sofort gesperrt' : ''}</dd></>}
          {s.stufe !== 'aus' && s.von && <><dt>Eingeschaltet von</dt><dd>{s.von}</dd></>}
        </dl>

        <div className="raster">
          <label className="eigenschaft breit"><span>Text für alle <small>z. B. „Wiederherstellung, ca. 1 Stunde“</small></span>
            <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} /></label>
          {s.stufe === 'aus' && (
            <div className="eigenschaft wm-oben">
              <span><label htmlFor="wartung-beginn">Beginn</label> <small>alle anderen werden abgemeldet</small></span>
              <input id="wartung-beginn" type="datetime-local" value={beginn} onChange={(e) => setBeginn(e.target.value)} />
              <div className="wm-schnell" role="group" aria-label="Beginn schnell wählen">
                {SCHNELL.map(([min, name]) => <button key={min} type="button" className="knopf klein" onClick={() => setBeginn(inMinuten(min))}>{name}</button>)}
              </div>
            </div>
          )}
          <label className={`eigenschaft${s.stufe === 'aus' ? ' wm-oben' : ''}`}><span>Erwartetes Ende <small>optional</small></span>
            <input type="datetime-local" value={ende} onChange={(e) => setEnde(e.target.value)} /></label>
        </div>
        {s.stufe === 'aus' && (schiene.fehler
          ? <p className="fehlertext" role="status">{schiene.fehler}</p>
          : <p className="leise" role="status">{schiene.satz}</p>)}
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <div className="knoepfe">
          {s.stufe === 'aus' && (
            <button className="knopf primaer" disabled={laeuft || !!schiene.fehler} onClick={() => {
              const ab = new Date(beginn);
              void tu(() => api.wartungEin({ ...eingabe, beginn: ab.toISOString() }), `Wartung angekündigt – alle anderen werden ${wann(ab)} abgemeldet.`);
            }}>Wartung ankündigen</button>
          )}
          {s.stufe === 'aktiv' && <button className="knopf" disabled={laeuft} onClick={() => void tu(() => api.wartungEin({ ...eingabe, vorlauf: 0 }), 'Text und Ende übernommen.')}>Text und Ende übernehmen</button>}
          {s.stufe !== 'aus' && (
            <button className="knopf gefahr-rand" disabled={laeuft} onClick={async () => {
              if (!(await rueckfrage({ titel: 'Alle jetzt abmelden?', text: andere ? `${andere === 1 ? 'Eine andere Sitzung wird' : `${andere} andere Sitzungen werden`} sofort beendet.` : 'Die Wartung beginnt sofort.', ja: 'Alle abmelden', gefahr: true }))) return;
              void tu(() => api.wartungJetzt(), 'Alle anderen sind abgemeldet. Der Wartungsmodus ist aktiv.');
            }}>Alle jetzt abmelden</button>
          )}
          {s.stufe !== 'aus' && <button className="knopf" disabled={laeuft} onClick={() => void tu(() => api.wartungAus(), 'Wartungsmodus beendet. Alle können sich wieder anmelden.')}>Wartung beenden</button>}
        </div>
        {s.stufe === 'aus' && (
          <div className="wm-sofort" id="sofort">
            <button className="knopf gefahr" disabled={laeuft} onClick={async () => {
              if (!(await rueckfrage({ titel: 'Jetzt sofort sperren?', text: 'Alle anderen Sitzungen werden sofort beendet, die Schnittstelle antwortet mit 503. Du bleibst angemeldet.', ja: 'Jetzt sofort sperren', gefahr: true }))) return;
              void tu(() => api.wartungEin({ ...eingabe, sofort: true }), 'Sofort gesperrt: Alle anderen sind abgemeldet, der Wartungsmodus ist aktiv.');
            }}>Jetzt sofort sperren</button>
            <p className="leise klein">Für Notfälle, z. B. einen Sicherheitsvorfall: alle werden sofort abgemeldet. <Hilfe ort="wartungsmodus.sofort" /></p>
          </div>
        )}
      </section>

      <section className="blatt" id="sitzungen">
        <h2 className="h3">Angemeldete Sitzungen</h2>
        {!s.sitzungen.length ? <p className="leise">Niemand ist angemeldet.</p> : (
          <div className="trefferliste"><table>
            <thead><tr><th>Benutzer</th><th>Gerät</th><th>Letzte Aktivität</th></tr></thead>
            <tbody>{s.sitzungen.map((x) => (
              <tr key={x.id}>
                <td>{x.name || x.email}{x.rolle === 'admin' && <span className="chip">Administrator</span>}{x.aktuell && <span className="chip gut">dieses Gerät</span>}</td>
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
