/**
 * Zeitmessung für den Entwicklermodus (#11).
 *
 * Je Seite (Navigation) werden die Anfragen an den Server erfasst und zerlegt:
 *   Netzwerk      – Hin- und Rückweg ohne die Zeit auf dem Server (aus Resource Timing, Näherung)
 *   Aufbereitung  – Zeit auf dem Server ohne Datenbank (Header Server-Timing)
 *   Datenbank     – Anzahl und Dauer der Datenbankzugriffe (Server-Timing)
 *   Übertragung   – Senden der Antwort an den Browser (Resource Timing)
 *   Auswerten     – JSON im Browser lesen
 *   Darstellung   – bis der Browser das Ergebnis gezeichnet hat
 */
export interface Anfragemessung {
  nr: number;
  methode: string;
  url: string;
  status: number;
  gesamt: number;
  netzwerk?: number;
  aufbereitung?: number;
  db?: number;
  dbAnzahl?: number;
  uebertragung?: number;
  auswerten: number;
  darstellung?: number;
}
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
    const st = /app;dur=([\d.]+)/.exec(antwort.headers.get('server-timing') ?? '');
    const dbm = /db;dur=([\d.]+);desc="(\d+)"/.exec(antwort.headers.get('server-timing') ?? '');
    const app = st ? Number(st[1]) : undefined;
    const db = dbm ? Number(dbm[1]) : undefined;
    const rt = performance.getEntriesByName(new URL(url, location.href).href, 'resource').at(-1) as PerformanceResourceTiming | undefined;
    const uebertragung = rt && rt.responseEnd > 0 ? rt.responseEnd - rt.responseStart : undefined;
    const warten = rt && rt.responseStart > 0 ? rt.responseStart - rt.startTime : kopf - start;
    const m: Anfragemessung = {
      nr: ++nr, methode, url, status: antwort.status,
      gesamt: fertig - start,
      netzwerk: app !== undefined ? Math.max(0, warten - app) : undefined,
      aufbereitung: app !== undefined ? Math.max(0, app - (db ?? 0)) : undefined,
      db, dbAnzahl: dbm ? Number(dbm[2]) : undefined,
      uebertragung,
      auswerten: Math.max(0, fertig - kopf - (uebertragung ?? 0)),
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
