import { createHash } from 'node:crypto';

/**
 * Zeitpläne gestreut (#1198): Bis 0.266 startete jeder Zeitplan beim Prozessstart mit `setInterval`. Stündliche,
 * zehnminütige, fünfminütige und minütliche Läufe fielen damit immer wieder auf dieselbe Sekunde – zur vollen Stunde
 * nach dem Start alle zugleich. Jetzt beginnt jeder Zeitplan mit einem festen Versatz innerhalb seines Intervalls,
 * berechnet aus seinem Namen (gleich bei jedem Start, verschieden je Name), und läuft danach im Intervall weiter.
 */

/** Versatz des ersten Laufs: aus dem Namen, 0 bis unter `intervallMs`, auf ganze Sekunden (bei Intervallen ab 2 s). */
export function versatzMs(name: string, intervallMs: number): number {
  if (intervallMs <= 0) return 0;
  const zahl = createHash('sha256').update(name).digest().readUInt32BE(0);
  const schritt = intervallMs >= 2000 ? 1000 : 1;
  const plaetze = Math.max(1, Math.floor(intervallMs / schritt));
  return (zahl % plaetze) * schritt;
}

export interface Uhren {
  spaeter(f: () => void, ms: number): unknown;
  immer(f: () => void, ms: number): unknown;
  stoppe(u: unknown): void;
}

const echteUhren: Uhren = {
  spaeter: (f, ms) => setTimeout(f, ms).unref(),
  immer: (f, ms) => setInterval(f, ms).unref(),
  stoppe: (u) => { clearTimeout(u as NodeJS.Timeout); clearInterval(u as NodeJS.Timeout); },
};

/**
 * Wiederkehrend: erster Lauf nach {@link versatzMs}, danach alle `intervallMs`. Die Uhren halten den Prozess nicht am
 * Leben (unref). Liefert eine Funktion zum Anhalten.
 */
export function wiederkehrend(name: string, intervallMs: number, f: () => void, uhren: Uhren = echteUhren): () => void {
  let laufend: unknown = null;
  const erst = uhren.spaeter(() => { f(); laufend = uhren.immer(f, intervallMs); }, versatzMs(name, intervallMs));
  return () => { uhren.stoppe(erst); if (laufend) uhren.stoppe(laufend); };
}
