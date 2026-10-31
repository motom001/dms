import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Erreichbarkeit } from '../../shared/src/erreichbarkeit';

/**
 * Erreichbarkeit (#122): Leiste, wenn das DMS weg ist (Update, Neustart), wenn es wieder da ist
 * und wenn danach eine neue Version läuft. Erkannt wird zentral in api.ts.
 */

/** Wird ausgelöst, sobald das DMS nach einem Ausfall wieder antwortet. */
export const WIEDER_ERREICHBAR = 'dms:wieder-erreichbar';
export const NICHT_ERREICHBAR = 'Das DMS ist gerade nicht erreichbar.';

export const erreichbarkeit = new Erreichbarkeit({
  gesundheit: async () => {
    const r = await fetch('/api/gesundheit', { cache: 'no-store', credentials: 'same-origin', headers: { 'x-dms': '1' } });
    return r.ok ? await r.json().catch(() => null) : null;
  },
  jetzt: () => Date.now(),
  spaeter: (f, ms) => setTimeout(f, ms),
  abbrechen: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
}, () => dispatchEvent(new Event(WIEDER_ERREICHBAR)));

/** Beim Start: Stand merken, beim Zurückkehren ins Fenster nachsehen. */
export function starteErreichbarkeit() {
  void erreichbarkeit.pruefe();
  const bedarf = () => erreichbarkeit.bedarf();
  addEventListener('focus', bedarf);
  addEventListener('online', bedarf);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') bedarf(); });
  // Vite: Ein nachgeladener Teil fehlt – die Seite gehört zu einem älteren Stand.
  addEventListener('vite:preloadError', (e) => { e.preventDefault(); erreichbarkeit.veraltet(); });
}

/** Für regelmäßige Abfragen: solange das DMS weg ist, auslassen. */
export const istWeg = () => erreichbarkeit.zustand.stufe === 'weg';

export function useErreichbarkeit() {
  return useSyncExternalStore(erreichbarkeit.abonniere, () => erreichbarkeit.zustand);
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
export function ErreichbarkeitsBanner({ version, ansichtNeuLaden }: { version?: string | null; ansichtNeuLaden: () => void }) {
  const z = useErreichbarkeit();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (z.stufe !== 'weg') return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [z.stufe]);

  if (z.stufe === 'weg') {
    const s = z.naechsterVersuch === null ? null : Math.max(0, Math.ceil((z.naechsterVersuch - Date.now()) / 1000));
    return (
      <div className="vertretungsbanner erreichbarkeit weg" role="alert">
        <p><strong>{NICHT_ERREICHBAR}</strong> Vermutlich läuft ein Update oder Neustart. Ich versuche es weiter{s ? ` – nächster Versuch in ${s} s` : ' …'}. Deine Eingaben bleiben stehen; speichere danach noch einmal.</p>
        <button className="knopf klein" onClick={() => void erreichbarkeit.pruefe()}>Jetzt prüfen</button>
      </div>
    );
  }
  if (z.neueVersion) {
    return (
      <div className="vertretungsbanner erreichbarkeit neu" role="alert">
        <p><strong>{version ? `Neue Version ${version} ist da.` : 'Eine neue Version ist da.'}</strong> Lade die Seite neu, damit Oberfläche und Server zusammenpassen. Ungespeicherte Eingaben vorher sichern.</p>
        <button className="knopf klein" onClick={() => location.reload()}>Seite neu laden</button>
      </div>
    );
  }
  if (z.stufe === 'zurueck') {
    return (
      <div className="vertretungsbanner erreichbarkeit zurueck" role="status">
        <p><strong>Das DMS ist wieder erreichbar.</strong> Zeigt die Seite noch Fehler, lade sie neu.</p>
        <span className="knoepfe">
          <button className="knopf klein" onClick={() => { erreichbarkeit.schliessen(); ansichtNeuLaden(); }}>Seite neu laden</button>
          <button className="knopf klein" onClick={() => erreichbarkeit.schliessen()} aria-label="Hinweis schließen">OK</button>
        </span>
      </div>
    );
  }
  return null;
}
