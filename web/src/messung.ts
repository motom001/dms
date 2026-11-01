/**
 * Zeitmessung für den Entwicklermodus (#11, #477).
 *
 * Je Seite (Navigation) werden die Anfragen an den Server erfasst und zerlegt:
 *   Warten (Browser) – Anfrage wartet im Browser, z. B. weil schon 6 Anfragen an den Server laufen (Resource Timing)
 *   Leitung          – Hin- und Rückweg ohne die Zeit im Server (Näherung; enthält auch Warten, bevor der Server die Anfrage annimmt)
 *   Warten (Server)  – Eingang der Anfrage bis zum Handler (Server-Timing „vor“)
 *   Rechte           – Berechtigungen auswerten, ohne die Datenbankzugriffe darin (Server-Timing „rechte“)
 *   Datenbank        – Anzahl und Dauer der Datenbankzugriffe (Server-Timing „db“)
 *   Aufbereitung     – übrige Zeit im Handler (Server-Timing „app“ minus Datenbank und Rechte)
 *   JSON             – Antwort auf dem Server in Text umwandeln (Server-Timing „json“)
 *   Übertragung      – Senden der Antwort an den Browser (Resource Timing)
 *   Auswerten        – JSON im Browser lesen
 *   Darstellung      – bis der Browser das Ergebnis gezeichnet hat
 */
import { liesServerTiming, teileAuf, type Anfragemessung } from '../../shared/src/zeitmessung';

export type { Anfragemessung };
export interface Seitenmessung { pfad: string; start: number; anfragen: Anfragemessung[]; bisAnzeige?: number }

let aktiv = false;
let seite: Seitenmessung = { pfad: location.pathname, start: 0, anfragen: [] };
let nr = 0;
const hoerer = new Set<() => void>();
const melde = () => hoerer.forEach((f) => f());

function neueSeite() {
  seite = { pfad: location.pathname + location.search, start: performance.now(), anfragen: [] };
  try { performance.clearResourceTimings(); } catch { /* ältere Browser */ }
  melde();
}
// Vor dem Router registriert: Eine neue Seite beginnt, bevor ihre Anfragen starten.
addEventListener('popstate', neueSeite);
try { performance.setResourceTimingBufferSize(1000); } catch { /* egal */ }

export const messung = {
  get aktiv() { return aktiv; },
  setzeAktiv(an: boolean) { if (aktiv !== an) { aktiv = an; melde(); } },
  get seite() { return seite; },
  abonniere(f: () => void) { hoerer.add(f); return () => { hoerer.delete(f); }; },

  /** Nach einer Anfrage: Zeiten zusammentragen; die Darstellung folgt nach dem nächsten Zeichnen. */
  erfasse(s: Seitenmessung, methode: string, url: string, antwort: Response, start: number, kopf: number, fertig: number) {
    if (!aktiv) return;
    const st = liesServerTiming(antwort.headers.get('server-timing') ?? '');
    const rt = performance.getEntriesByName(new URL(url, location.href).href, 'resource').at(-1) as PerformanceResourceTiming | undefined;
    const teile = teileAuf(st, rt, kopf - start);
    const m: Anfragemessung = {
      nr: ++nr, methode, url, status: antwort.status,
      gesamt: fertig - start,
      ...teile,
      auswerten: Math.max(0, fertig - kopf - (teile.uebertragung ?? 0)),
    };
    // Zählt zur Seite, auf der die Anfrage begann (auch wenn schon weiter navigiert wurde).
    s.anfragen.push(m);
    melde();
    // Zwei Frames später hat der Browser das Ergebnis gezeichnet.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const jetzt = performance.now();
      m.darstellung = jetzt - fertig;
      s.bisAnzeige = Math.max(s.bisAnzeige ?? 0, jetzt - s.start);
      melde();
    }));
  },
};
