import { useCallback, useEffect, useState } from 'react';
import { api, type WartungWerkbank } from '../api';
import { dauerText, WARTUNG_GEAENDERT, zeitpunkt } from '../wartung';
import { Hilfe } from '../Hilfe';
import { istWeg } from '../erreichbar';
import { rueckfrage } from '../rueckfrage';

/**
 * Werkbank → Wartungsmodus (#102): ankündigen, sofort beginnen, alle abmelden, beenden;
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

export function WartungsmodusPanel({ w }: { w: WartungsmodusZustand }) {
  const s = w.stand;
  const [text, setText] = useState('');
  const [ende, setEnde] = useState('');
  const [vorlauf, setVorlauf] = useState(30);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [vorbelegt, setVorbelegt] = useState(false);
  useEffect(() => {
    if (!s || vorbelegt) return;
    setText(s.text); setEnde(lokal(s.ende)); setVorbelegt(true);
  }, [s, vorbelegt]);
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
          {s.stufe === 'aktiv' && s.aktivAb && <><dt>Aktiv seit</dt><dd>{zeitpunkt(s.aktivAb)} Uhr</dd></>}
          {s.stufe !== 'aus' && s.von && <><dt>Eingeschaltet von</dt><dd>{s.von}</dd></>}
        </dl>

        <div className="raster">
          <label className="eigenschaft breit"><span>Text für alle <small>z. B. „Wiederherstellung, ca. 1 Stunde“</small></span>
            <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} /></label>
          <label className="eigenschaft"><span>Erwartetes Ende <small>optional</small></span>
            <input type="datetime-local" value={ende} onChange={(e) => setEnde(e.target.value)} /></label>
          {s.stufe === 'aus' && (
            <label className="eigenschaft"><span>Vorlaufzeit in Minuten <small>0 = sofort</small></span>
              <input type="number" min={0} max={1440} value={vorlauf} onChange={(e) => setVorlauf(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} /></label>
          )}
        </div>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <div className="knoepfe">
          {s.stufe === 'aus' && (
            <button className="knopf primaer" disabled={laeuft} onClick={async () => {
              if (!vorlauf && !(await rueckfrage({ titel: 'Wartung jetzt beginnen?', text: 'Alle außer dir werden sofort abgemeldet.', ja: 'Wartung beginnen', gefahr: true }))) return;
              void tu(() => api.wartungEin({ ...eingabe, vorlauf }), vorlauf ? `Wartung angekündigt – aktiv in ${vorlauf} Minuten.` : 'Wartungsmodus aktiv.');
            }}>{vorlauf ? 'Wartung ankündigen' : 'Wartung sofort beginnen'}</button>
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
