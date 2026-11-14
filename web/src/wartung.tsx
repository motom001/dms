import { t, tn } from './sprache';
import { useEffect, useState } from 'react';
import { betriebApi } from './api/betrieb';
import type { WartungOeffentlich } from './api/konto';
import { Link } from './ort';
import { istWeg, WIEDER_ERREICHBAR } from './erreichbar';
import { gebietsschema } from '../../shared/src/sprache';

/**
 * Wartungsmodus (#102) in der Oberfläche: Stand regelmäßig abfragen (auch ohne Neuladen der Seite)
 * und als Banner mit Countdown zeigen.
 */

export const WARTUNG_GEAENDERT = 'dms:wartung';
const ABFRAGE_MS = 20_000;
/** Zuletzt bekannter Stand – für Stellen, die nur nachsehen und nicht selbst abfragen (#193). */
let zuletzt: WartungOeffentlich | null = null;
export const wartungAktiv = () => zuletzt?.stufe === 'aktiv';

export function useWartung(start?: WartungOeffentlich | null) {
  const [stand, setStand] = useState<WartungOeffentlich | null>(start ?? null);
  // Zeitpunkt der letzten Antwort: Der Countdown läuft lokal weiter.
  const [geholt, setGeholt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  useEffect(() => {
    let aus = false;
    const hole = () => betriebApi.wartung().then((w) => { zuletzt = w; if (!aus) { setStand(w); setGeholt(Date.now()); } }, () => {});
    void hole();
    // Solange das DMS nicht erreichbar ist (#122), pausiert die Abfrage.
    const timer = setInterval(() => { if (!istWeg()) void hole(); }, ABFRAGE_MS);
    const sofort = () => void hole();
    addEventListener(WARTUNG_GEAENDERT, sofort);
    addEventListener(WIEDER_ERREICHBAR, sofort);
    addEventListener('focus', sofort);
    return () => { aus = true; clearInterval(timer); removeEventListener(WARTUNG_GEAENDERT, sofort); removeEventListener(WIEDER_ERREICHBAR, sofort); removeEventListener('focus', sofort); };
  }, []);
  useEffect(() => {
    if (stand?.stufe !== 'angekuendigt') return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [stand?.stufe]);
  const rest = stand?.sekunden === null || stand?.sekunden === undefined ? null : Math.max(0, stand.sekunden - Math.floor((Date.now() - geholt) / 1000));
  return { stand, rest };
}

/** „29 Minuten“, „45 Sekunden“, „1 Stunde 5 Minuten“. */
export function dauerText(s: number): string {
  if (s < 60) return t('oberflaeche.wartung.sekunden', { anzahl: s });
  const m = Math.ceil(s / 60);
  if (m < 60) return t('oberflaeche.wartung.minuten', { anzahl: m });
  const h = Math.floor(m / 60); const r = m % 60;
  return t('oberflaeche.wartung.stunden', { anzahl: h, wert: r ? t('oberflaeche.wartung.minuten-2', { anzahl: r }) : '' });
}

export const zeitpunkt = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

/** Banner für alle Angemeldeten; Administratoren sehen zusätzlich den Weg zur Werkbank. */
export function WartungsBanner({ admin, abgemeldet }: { admin: boolean; abgemeldet: () => void }) {
  const { stand, rest } = useWartung();
  // Aktiv und kein Admin: Die Sitzung ist beendet – gleich zur Anmeldeseite mit dem Hinweis.
  useEffect(() => { if (stand?.stufe === 'aktiv' && !admin) abgemeldet(); }, [stand?.stufe, admin]); // eslint-disable-line react-hooks/exhaustive-deps -- nur bei geänderter Stufe oder Rolle abmelden
  if (!stand || stand.stufe === 'aus') return null;
  const zusatz = <>{stand.text && <> {stand.text}.</>}{stand.ende && <> {' '}{t('oberflaeche.wartung.voraussichtlich-bis-uhr', { zeitpunkt: zeitpunkt(stand.ende) })}</>}</>;
  if (stand.stufe === 'angekuendigt') {
    return (
      <div className="vertretungsbanner wartungsbanner" role="alert">
        <p>
          <strong>{(admin ? t('oberflaeche.wartung.abmeldung-andere', { dauerText: dauerText(rest ?? 0) }) : t('oberflaeche.wartung.abmeldung-du', { dauerText: dauerText(rest ?? 0) }))}</strong>{' '}
          {admin ? t('konten.verwaltende.wartung.neu') : t('oberflaeche.wartung.bitte-speichere-deine-arbeit')}{zusatz}
        </p>
        {admin && <Link to="/werkbank/wartung#wartungsmodus" className="knopf klein">{t('oberflaeche.wartung.zum-wartungsmodus')}</Link>}
      </div>
    );
  }
  return (
    <div className="vertretungsbanner wartungsbanner" role="status">
      <p>{tn('oberflaeche.wartung.nur-personen-die-verwalten', { b: <strong>{t('oberflaeche.wartung.wartungsmodus-aktiv')}</strong>, zusatz })}</p>
      {admin && <Link to="/werkbank/wartung#wartungsmodus" className="knopf klein">{t('oberflaeche.wartung.zum-wartungsmodus')}</Link>}
    </div>
  );
}

/** Hinweis auf der Anmeldeseite. */
export function WartungsHinweis({ start }: { start?: WartungOeffentlich | null }) {
  const { stand } = useWartung(start);
  if (!stand || stand.stufe === 'aus') return null;
  return (
    <div className="hinweis warn stapel" role="status">
      <p>{(stand.stufe === 'aktiv' ? tn('oberflaeche.wartung.anmelden-aktiv', { b: <strong>{t('oberflaeche.wartung.ablago-wird-gerade-gewartet')}</strong> }) : tn('oberflaeche.wartung.anmelden-bald', { b: <strong>{t('oberflaeche.wartung.gleich-beginnt-eine-wartung')}</strong> }))}</p>
      {(stand.text || stand.ende) && <p>{stand.text}{stand.text && stand.ende ? ' – ' : ''}{stand.ende && <>{t('oberflaeche.wartung.voraussichtlich-bis-uhr-2', { zeitpunkt: zeitpunkt(stand.ende) })}</>}</p>}
    </div>
  );
}
