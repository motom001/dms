/**
 * Zeitmessung (#11, #477): Server-Timing lesen und mit Resource Timing des Browsers zu einer
 * Aufteilung je Anfrage zusammenführen. Reine Funktionen für web/src/messung.ts (und Tests).
 */

/** Zeitpunkte aus Resource Timing (ms seit Seitenstart); 0 = unbekannt. */
export interface RessourcenZeiten { startTime: number; requestStart: number; responseStart: number; responseEnd: number; connectStart: number; connectEnd: number }

export interface Anfragemessung {
  nr: number;
  methode: string;
  url: string;
  status: number;
  gesamt: number;
  wartenBrowser?: number;
  leitung?: number;
  wartenServer?: number;
  rechte?: number;
  aufbereitung?: number;
  db?: number;
  dbAnzahl?: number;
  json?: number;
  uebertragung?: number;
  auswerten: number;
  darstellung?: number;
}

/** Server-Timing lesen: Name → Dauer (ms), dazu die Anzahl der Datenbankzugriffe aus desc. */
export function liesServerTiming(kopf: string): { werte: Record<string, number>; dbAnzahl?: number } {
  const werte: Record<string, number> = {};
  let dbAnzahl: number | undefined;
  for (const teil of kopf.split(',')) {
    const name = /^\s*([\w-]+)/.exec(teil)?.[1];
    const dur = /;\s*dur=([\d.]+)/.exec(teil)?.[1];
    if (!name || dur === undefined) continue;
    werte[name] = Number(dur);
    if (name === 'db') { const d = /;\s*desc="?(\d+)"?/.exec(teil)?.[1]; if (d !== undefined) dbAnzahl = Number(d); }
  }
  return { werte, dbAnzahl };
}

/** Zeiten aus Resource Timing (Browser) und Server-Timing zu einer Aufteilung zusammenführen. */
export function teileAuf(
  st: { werte: Record<string, number>; dbAnzahl?: number },
  rt: RessourcenZeiten | undefined,
  ersatzWarten: number,
): Omit<Anfragemessung, 'nr' | 'methode' | 'url' | 'status' | 'gesamt' | 'auswerten' | 'darstellung'> {
  const w = st.werte;
  const nn = (x: number) => Math.max(0, x);
  const app = w.app;
  // Ältere Server ohne „gesamt“: wie früher nur die Zeit im Handler.
  const server = w.gesamt ?? app;
  const db = w.db;
  const rechte = w.rechte;
  const zr = rt && rt.responseStart > 0 && rt.requestStart > 0 ? rt : undefined;
  const verbinden = zr ? nn(zr.connectEnd - zr.connectStart) : 0;
  const wartenBrowser = zr ? nn(zr.requestStart - zr.startTime - verbinden) : undefined;
  const hinUndZurueck = zr ? zr.responseStart - zr.requestStart + verbinden : ersatzWarten;
  return {
    wartenBrowser,
    leitung: server !== undefined ? nn(hinUndZurueck - server) : undefined,
    wartenServer: w.vor,
    rechte,
    aufbereitung: app !== undefined ? nn(app - (db ?? 0) - (rechte ?? 0)) : undefined,
    db, dbAnzahl: st.dbAnzahl,
    json: w.json,
    uebertragung: rt && rt.responseEnd > 0 && rt.responseStart > 0 ? nn(rt.responseEnd - rt.responseStart) : undefined,
  };
}
