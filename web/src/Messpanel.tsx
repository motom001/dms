import { useEffect, useState } from 'react';
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
        <span>⏱ {s.bisAnzeige !== undefined ? `${ms(s.bisAnzeige)} bis zur Anzeige` : 'Messung'}</span>
        <span className="leise">{s.anfragen.length} {s.anfragen.length === 1 ? 'Anfrage' : 'Anfragen'}{s.anfragen.some((a) => a.dbAnzahl) ? ` · ${summe('dbAnzahl')} DB-Zugriffe` : ''}</span>
      </button>
      {offen && (
        <div className="messinhalt">
          <p className="leise klein mono">{s.pfad}</p>
          {!s.anfragen.length && <p className="leise klein">Noch keine Anfrage auf dieser Seite.</p>}
          {s.anfragen.map((m) => (
            <div key={m.nr} className="messung">
              <p className="mono klein"><strong>{m.methode}</strong> {m.url.replace(/^\/api/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (x) => `${x.slice(0, 8)}…`)} <span className={m.status >= 400 ? 'fehlertext' : 'leise'}>{m.status}</span> · <strong>{ms(m.gesamt + (m.darstellung ?? 0))}</strong></p>
              <Balken m={m} />
              <ul className="klein">
                <li className="netz">Netzwerk {ms(m.netzwerk)}</li>
                <li className="aufb">Aufbereitung {ms(m.aufbereitung)}</li>
                <li className="db">{m.dbAnzahl ?? '?'} {m.dbAnzahl === 1 ? 'Datenbankzugriff' : 'Datenbankzugriffe'} {ms(m.db)}</li>
                <li className="ueb">Übertragung {ms(m.uebertragung)}</li>
                <li className="ausw">Auswerten {ms(m.auswerten)}</li>
                <li className="darst">Darstellung {ms(m.darstellung)}</li>
              </ul>
            </div>
          ))}
          <p className="leise klein">Netzwerk ist eine Näherung (Wartezeit minus Zeit auf dem Server). Abschalten im Profil.</p>
        </div>
      )}
    </aside>
  );
}

function Balken({ m }: { m: Anfragemessung }) {
  const teile = [
    { k: 'netz', w: m.netzwerk }, { k: 'aufb', w: m.aufbereitung }, { k: 'db', w: m.db },
    { k: 'ueb', w: m.uebertragung }, { k: 'ausw', w: m.auswerten }, { k: 'darst', w: m.darstellung },
  ];
  const ges = teile.reduce((a, t) => a + (t.w ?? 0), 0) || 1;
  return <div className="messbalken" aria-hidden="true">{teile.map((t) => <span key={t.k} className={t.k} style={{ width: `${((t.w ?? 0) / ges) * 100}%` }} />)}</div>;
}
