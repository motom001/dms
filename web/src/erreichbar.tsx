import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Erreichbarkeit, type Gesundheit } from '../../shared/src/erreichbarkeit';
import { t, tn } from './sprache';
import { sprache } from '../../shared/src/sprache';
import { automatischNeuLaden } from '../../shared/src/veraltet';
import { beiVeraltet, beobachteVeraltet, neuGeladenHinweis, neuGeladenHinweisSchliessen, selbstNeuLaden, zuletztNeuGeladen } from './veraltet';
import { Knopf } from './bausteine/knopf/Knopf';
import { antwortGekommen, neuLadenOhneAntwort, schonOhneAntwortNeuGeladen } from './startbild';
import { laedtNichtUrl } from '../../shared/src/startbild';

/**
 * Erreichbarkeit (#122): Leiste, wenn das DMS weg ist (Update, Neustart), wenn es wieder da ist
 * und wenn danach eine neue Version läuft. Erkannt wird zentral in api.ts.
 */

/** Wird ausgelöst, sobald das DMS nach einem Ausfall wieder antwortet. */
export const WIEDER_ERREICHBAR = 'dms:wieder-erreichbar';
export const NICHT_ERREICHBAR = t('oberflaeche.erreichbar.ablago-ist-gerade-nicht');

export const erreichbarkeit = new Erreichbarkeit({
  gesundheit: async () => {
    const r = await fetch('/api/gesundheit', { cache: 'no-store', credentials: 'same-origin', headers: { 'x-dms': '1', 'x-sprache': sprache() } });
    const g = await r.json().catch(() => null) as Gesundheit | null;
    // 503 mit „datenbank“ (#1198): Ablago antwortet, die Datenbank nicht – die Leiste sagt „beschäftigt“.
    return r.ok || g?.zustand === 'datenbank' ? g : null;
  },
  jetzt: () => Date.now(),
  spaeter: (f, ms) => setTimeout(f, ms),
  abbrechen: (eintrag) => clearTimeout(eintrag as ReturnType<typeof setTimeout>),
}, () => { antwortGekommen(); dispatchEvent(new Event(WIEDER_ERREICHBAR)); });

/** Beim Start: Stand merken, beim Zurückkehren ins Fenster nachsehen. */
export function starteErreichbarkeit() {
  void erreichbarkeit.pruefe();
  const bedarf = () => erreichbarkeit.bedarf();
  addEventListener('focus', bedarf);
  addEventListener('online', bedarf);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') bedarf(); });
  // Ein nachgeladener Teil oder ein Stylesheet fehlt (#933) – die Seite gehört zu einem älteren Stand.
  beobachteVeraltet();
  beiVeraltet(() => erreichbarkeit.veraltet());
}

/**
 * Ohne Rückfrage neu laden, sobald eine neue Version erkannt ist (#933) – für den Einrichtungsassistenten (der Stand
 * liegt im Browser) und die Fehlermeldung statt einer leeren Seite. Nicht, solange `laeuft` („Jetzt einrichten“), und
 * höchstens einmal je Minute; sonst bleibt die Leiste mit dem Knopf.
 */
export function useNeuLadenBeiNeuerVersion(laeuft = false, schritt?: string) {
  const z = useErreichbarkeit();
  useEffect(() => {
    if (automatischNeuLaden({ neueVersion: z.neueVersion, laeuft, zuletzt: zuletztNeuGeladen(), jetzt: Date.now() })) selbstNeuLaden();
  }, [laeuft, z.neueVersion]);
  // Am Schrittwechsel nachsehen (eine kleine Abfrage), nicht erst beim Zurückkehren ins Fenster.
  const erster = useRef(true);
  useEffect(() => {
    if (erster.current) { erster.current = false; return; }
    if (!laeuft) void erreichbarkeit.pruefe();
  }, [schritt]); // eslint-disable-line react-hooks/exhaustive-deps -- nur bei einem neuen Schritt prüfen, nicht bei jeder Änderung des Prüfstands
}

/** Für regelmäßige Abfragen: solange das DMS weg ist, auslassen. */
export const istWeg = () => erreichbarkeit.zustand.stufe === 'weg';

export function useErreichbarkeit() {
  return useSyncExternalStore(erreichbarkeit.abonniere, () => erreichbarkeit.zustand, () => erreichbarkeit.zustand);
}

/** Ruft f auf, sobald das DMS nach einem Ausfall wieder antwortet. */
export function useBeiWiederErreichbar(f: () => void) {
  const r = useRef(f);
  r.current = f;
  useEffect(() => {
    const h = () => r.current();
    addEventListener(WIEDER_ERREICHBAR, h);
    return () => removeEventListener(WIEDER_ERREICHBAR, h);
  }, []);
}

/**
 * Leiste oben. „Ansicht neu laden“ baut den Inhalt neu auf (Eingaben gehen dabei verloren,
 * deshalb nur auf Knopfdruck); „Seite neu laden“ holt die neue Oberfläche.
 */
export function ErreichbarkeitsBanner({ version, ansichtNeuLaden, aussen }: {
  version?: string | null; ansichtNeuLaden: () => void;
  /** Außerhalb der angemeldeten Ablage (#933): Anmelden, Einrichtung, Wiederherstellung – die Leiste bleibt oben stehen. */
  aussen?: boolean;
}) {
  const z = useErreichbarkeit();
  const [, setTick] = useState(0);
  const [neuGeladen, setNeuGeladen] = useState(neuGeladenHinweis);
  const art = aussen ? ' aussen' : '';
  useEffect(() => {
    if (z.stufe !== 'weg') return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [z.stufe]);

  if (z.stufe === 'weg' && z.datenbank) return <Beschaeftigt naechsterVersuch={z.naechsterVersuch} art={art} />;
  if (z.stufe === 'weg') {
    const s = z.naechsterVersuch === null ? null : Math.max(0, Math.ceil((z.naechsterVersuch - Date.now()) / 1000));
    return (
      <div className={`vertretungsbanner erreichbarkeit weg${art}`} role="alert">
        <p>{tn('oberflaeche.erreichbar.vermutlich-laeuft-ein-update', { b: <strong>{NICHT_ERREICHBAR}</strong>, wert: s ? t('oberflaeche.erreichbar.naechster-versuch-in-s', { s }) : ' …' })}</p>
        <button className="knopf klein" onClick={() => void erreichbarkeit.pruefe()}>{t('oberflaeche.erreichbar.jetzt-pruefen')}</button>
      </div>
    );
  }
  if (z.neueVersion) {
    return (
      <div className={`vertretungsbanner erreichbarkeit neu${art}`} role="alert">
        <p>{tn('oberflaeche.erreichbar.lade-die-seite-neu', { b: <strong>{version ? t('oberflaeche.erreichbar.neue-version-ist-da', { version }) : t('oberflaeche.erreichbar.eine-neue-version-ist')}</strong> })}</p>
        <button className="knopf klein" onClick={() => location.reload()}>{t('oberflaeche.erreichbar.seite-neu-laden')}</button>
      </div>
    );
  }
  if (z.stufe === 'zurueck') {
    return (
      <div className={`vertretungsbanner erreichbarkeit zurueck${art}`} role="status">
        <p>{tn('oberflaeche.erreichbar.zeigt-die-seite-noch', { b: <strong>{t('oberflaeche.erreichbar.ablago-ist-wieder-erreichbar')}</strong> })}</p>
        <span className="knoepfe">
          <button className="knopf klein" onClick={() => { erreichbarkeit.schliessen(); ansichtNeuLaden(); }}>{t('oberflaeche.erreichbar.seite-neu-laden')}</button>
          <button className="knopf klein" onClick={() => erreichbarkeit.schliessen()} aria-label={t('oberflaeche.erreichbar.hinweis-schliessen')}>{t('oberflaeche.erreichbar.ok')}</button>
        </span>
      </div>
    );
  }
  // Nach dem eigenen Neuladen (#933): einmal sagen, warum – etwa, warum ein Passwortfeld leer ist.
  if (neuGeladen) {
    return (
      <div className={`vertretungsbanner erreichbarkeit zurueck${art}`} role="status" id="neu-geladen-hinweis">
        <p>{tn('oberflaeche.veraltet.neu-geladen', { b: <strong>{t('oberflaeche.veraltet.neu-geladen-titel')}</strong> })}</p>
        <button className="knopf klein" onClick={() => { neuGeladenHinweisSchliessen(); setNeuGeladen(false); }} aria-label={t('oberflaeche.erreichbar.hinweis-schliessen')}>{t('oberflaeche.erreichbar.ok')}</button>
      </div>
    );
  }
  return null;
}

/**
 * Ablago antwortet, die Datenbank nicht (#1198): eigener Zustand statt „nicht erreichbar“ bzw. eines voreiligen „wieder
 * erreichbar“. Führte „Seite neu laden“ schon einmal wieder hierher, sagt die Leiste, was dann hilft.
 */
function Beschaeftigt({ naechsterVersuch, art }: { naechsterVersuch: number | null; art: string }) {
  const s = naechsterVersuch === null ? null : Math.max(0, Math.ceil((naechsterVersuch - Date.now()) / 1000));
  return (
    <div className={`vertretungsbanner erreichbarkeit weg${art}`} role="alert" id="erreichbarkeit-beschaeftigt">
      <p>{tn('oberflaeche.erreichbar.beschaeftigt-text', { b: <strong>{t('oberflaeche.erreichbar.beschaeftigt')}</strong>, wert: s ? t('oberflaeche.erreichbar.naechster-versuch-in-s', { s }) : ' …' })}
        {schonOhneAntwortNeuGeladen() ? <>{' '}{t('oberflaeche.erreichbar.schon-neu-geladen')}</> : null}
        {' '}<a href={laedtNichtUrl(sprache())} target="_blank" rel="noreferrer">{t('oberflaeche.startbild.was-tun')}</a></p>
      <span className="knoepfe">
        <Knopf groesse="klein" onClick={() => void erreichbarkeit.pruefe()}>{t('oberflaeche.erreichbar.jetzt-pruefen')}</Knopf>
        <Knopf groesse="klein" onClick={() => neuLadenOhneAntwort()}>{t('oberflaeche.erreichbar.seite-neu-laden')}</Knopf>
      </span>
    </div>
  );
}
