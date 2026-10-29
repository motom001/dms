import { useEffect, useState } from 'react';
import { api, type WartungOeffentlich } from './api';
import { Link } from './ort';

/**
 * Wartungsmodus (#102) in der Oberfläche: Stand regelmäßig abfragen (auch ohne Neuladen der Seite)
 * und als Banner mit Countdown zeigen.
 */

export const WARTUNG_GEAENDERT = 'dms:wartung';
const ABFRAGE_MS = 20_000;

export function useWartung(start?: WartungOeffentlich | null) {
  const [stand, setStand] = useState<WartungOeffentlich | null>(start ?? null);
  // Zeitpunkt der letzten Antwort: Der Countdown läuft lokal weiter.
  const [geholt, setGeholt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  useEffect(() => {
    let aus = false;
    const hole = () => api.wartung().then((w) => { if (!aus) { setStand(w); setGeholt(Date.now()); } }, () => {});
    void hole();
    const t = setInterval(hole, ABFRAGE_MS);
    const sofort = () => void hole();
    addEventListener(WARTUNG_GEAENDERT, sofort);
    addEventListener('focus', sofort);
    return () => { aus = true; clearInterval(t); removeEventListener(WARTUNG_GEAENDERT, sofort); removeEventListener('focus', sofort); };
  }, []);
  useEffect(() => {
    if (stand?.stufe !== 'angekuendigt') return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [stand?.stufe]);
  const rest = stand?.sekunden === null || stand?.sekunden === undefined ? null : Math.max(0, stand.sekunden - Math.floor((Date.now() - geholt) / 1000));
  return { stand, rest };
}

/** „29 Minuten“, „45 Sekunden“, „1 Stunde 5 Minuten“. */
export function dauerText(s: number): string {
  if (s < 60) return `${s} Sekunde${s === 1 ? '' : 'n'}`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} Minute${m === 1 ? '' : 'n'}`;
  const h = Math.floor(m / 60); const r = m % 60;
  return `${h} Stunde${h === 1 ? '' : 'n'}${r ? ` ${r} Minute${r === 1 ? '' : 'n'}` : ''}`;
}

export const zeitpunkt = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

/** Banner für alle Angemeldeten; Administratoren sehen zusätzlich den Weg zur Werkbank. */
export function WartungsBanner({ admin, abgemeldet }: { admin: boolean; abgemeldet: () => void }) {
  const { stand, rest } = useWartung();
  // Aktiv und kein Admin: Die Sitzung ist beendet – gleich zur Anmeldeseite mit dem Hinweis.
  useEffect(() => { if (stand?.stufe === 'aktiv' && !admin) abgemeldet(); }, [stand?.stufe, admin]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!stand || stand.stufe === 'aus') return null;
  const zusatz = <>{stand.text && <> {stand.text}.</>}{stand.ende && <> Voraussichtlich bis {zeitpunkt(stand.ende)} Uhr.</>}</>;
  if (stand.stufe === 'angekuendigt') {
    return (
      <div className="vertretungsbanner wartungsbanner" role="alert">
        <p>
          <strong>Wartung – {admin ? 'alle anderen werden' : 'du wirst'} in {dauerText(rest ?? 0)} abgemeldet.</strong>{' '}
          {admin ? 'Neue Anmeldungen gehen nur noch für Administratoren.' : 'Bitte speichere deine Arbeit.'}{zusatz}
        </p>
        {admin && <Link to="/werkbank/wartungsmodus" className="knopf klein">Zum Wartungsmodus</Link>}
      </div>
    );
  }
  return (
    <div className="vertretungsbanner wartungsbanner" role="status">
      <p><strong>Wartungsmodus aktiv.</strong> Nur Administratoren sind angemeldet; Schnittstelle und Hintergrundarbeiten pausieren.{zusatz}</p>
      {admin && <Link to="/werkbank/wartungsmodus" className="knopf klein">Zum Wartungsmodus</Link>}
    </div>
  );
}

/** Hinweis auf der Anmeldeseite. */
export function WartungsHinweis({ start }: { start?: WartungOeffentlich | null }) {
  const { stand } = useWartung(start);
  if (!stand || stand.stufe === 'aus') return null;
  return (
    <div className="hinweis warn stapel" role="status">
      <p><strong>{stand.stufe === 'aktiv' ? 'Das DMS wird gerade gewartet.' : 'Gleich beginnt eine Wartung.'}</strong> Anmelden können sich {stand.stufe === 'aktiv' ? 'nur' : 'bis dahin nur noch'} Administratoren.</p>
      {(stand.text || stand.ende) && <p>{stand.text}{stand.text && stand.ende ? ' – ' : ''}{stand.ende && <>voraussichtlich bis {zeitpunkt(stand.ende)} Uhr</>}</p>}
    </div>
  );
}
