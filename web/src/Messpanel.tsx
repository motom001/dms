import { useEffect, useState } from 'react';
import { Symbol } from './Symbol';
import { messung, type Anfragemessung } from './messung';

const ms = (x: number | undefined) => (x === undefined ? '–' : `${x < 10 ? x.toFixed(1).replace('.', ',') : Math.round(x)} ms`);

/** Schwebende Anzeige der Zeitmessung (Entwicklermodus). */
export function Messpanel() {
  const [offen, setOffen] = useState(true);
  const [, setStand] = useState(0);
  useEffect(() => { messung.setzeAktiv(true); return () => messung.setzeAktiv(false); }, []);
  useEffect(() => messung.abonniere(() => setStand((x) => x + 1)), []);
  const s = messung.seite;
  const summe = (k: keyof Anfragemessung) => s.anfragen.reduce((a, m) => a + ((m[k] as number | undefined) ?? 0), 0);
  return (
    <aside className={`messpanel ${offen ? 'offen' : ''}`} aria-label="Zeitmessung">
      <button type="button" className="messkopf" onClick={() => setOffen(!offen)} aria-expanded={offen}>
        <span><Symbol name="stoppuhr" /> {s.bisAnzeige !== undefined ? `${ms(s.bisAnzeige)} bis zur Anzeige` : 'Messung'}</span>
        <span className="leise">{s.anfragen.length} {s.anfragen.length === 1 ? 'Anfrage' : 'Anfragen'}{s.anfragen.some((a) => a.dbAnzahl) ? ` · ${summe('dbAnzahl')} DB-Zugriffe` : ''}</span>
      </button>
      {offen && (
        <div className="messinhalt">
          <p className="leise klein mono">{s.pfad}</p>
          {!s.anfragen.length && <p className="leise klein">Noch keine Anfrage auf dieser Seite.</p>}
          {s.anfragen.length > 1 && <p className="leise klein">Summe aller Anfragen: {TEILE.filter((t) => summe(t.feld) >= 1).map((t) => `${t.name} ${ms(summe(t.feld))}`).join(' · ')}</p>}
          {s.anfragen.map((m) => (
            <div key={m.nr} className="messung">
              <p className="mono klein"><strong>{m.methode}</strong> {m.url.replace(/^\/api/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (x) => `${x.slice(0, 8)}…`)} <span className={m.status >= 400 ? 'fehlertext' : 'leise'}>{m.status}</span> · <strong>{ms(m.gesamt + (m.darstellung ?? 0))}</strong></p>
              <Balken m={m} />
              <ul className="klein">
                {TEILE.map((t) => t.k === 'db'
                  ? <li key={t.k} className={t.k}>{m.dbAnzahl ?? '?'} {m.dbAnzahl === 1 ? 'Datenbankzugriff' : 'Datenbankzugriffe'} {ms(m.db)}</li>
                  : <li key={t.k} className={t.k} title={t.erklaerung}>{t.name} {ms(m[t.feld] as number | undefined)}</li>)}
              </ul>
            </div>
          ))}
          <p className="leise klein">„Warten (Browser)“: Der Browser schickt höchstens etwa 6 Anfragen gleichzeitig, die übrigen warten. „Warten (Server)“: Eingang bis Bearbeitung. „Leitung“ ist eine Näherung (Hin- und Rückweg minus Zeit im Server) und enthält auch das Warten, bevor der Server die Anfrage annimmt – ist er beschäftigt, steht das unter Werkbank → Datenbank bei „Auslastung“. Abschalten im Profil.</p>
        </div>
      )}
    </aside>
  );
}

/** Abschnitte in Reihenfolge des Ablaufs, je mit eigener Farbe (styles.css: .messpanel .m-…). */
const TEILE: Array<{ k: string; feld: keyof Anfragemessung; name: string; erklaerung: string }> = [
  { k: 'm-wbrow', feld: 'wartenBrowser', name: 'Warten (Browser)', erklaerung: 'Die Anfrage wartete im Browser, bis eine Verbindung frei war.' },
  { k: 'netz', feld: 'leitung', name: 'Leitung', erklaerung: 'Hin- und Rückweg ohne die Zeit im Server (Näherung).' },
  { k: 'm-wserv', feld: 'wartenServer', name: 'Warten (Server)', erklaerung: 'Vom Eingang der Anfrage im Server bis zur Bearbeitung.' },
  { k: 'm-rechte', feld: 'rechte', name: 'Rechte', erklaerung: 'Berechtigungen auswerten (ohne die Datenbankzugriffe darin).' },
  { k: 'db', feld: 'db', name: 'Datenbank', erklaerung: '' },
  { k: 'aufb', feld: 'aufbereitung', name: 'Aufbereitung', erklaerung: 'Übrige Zeit im Server.' },
  { k: 'm-json', feld: 'json', name: 'JSON', erklaerung: 'Antwort im Server in Text umwandeln.' },
  { k: 'ueb', feld: 'uebertragung', name: 'Übertragung', erklaerung: 'Antwort an den Browser senden.' },
  { k: 'ausw', feld: 'auswerten', name: 'Auswerten', erklaerung: 'Antwort im Browser lesen.' },
  { k: 'darst', feld: 'darstellung', name: 'Darstellung', erklaerung: 'Bis der Browser das Ergebnis gezeichnet hat.' },
];

function Balken({ m }: { m: Anfragemessung }) {
  const teile = TEILE.map((t) => ({ k: t.k, w: m[t.feld] as number | undefined }));
  const ges = teile.reduce((a, t) => a + (t.w ?? 0), 0) || 1;
  return <div className="messbalken" aria-hidden="true">{teile.map((t) => <span key={t.k} className={t.k} style={{ width: `${((t.w ?? 0) / ges) * 100}%` }} />)}</div>;
}
