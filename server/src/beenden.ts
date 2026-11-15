/**
 * Geordnet beenden (#1011, Frist seit #1340): Die Schritte laufen nacheinander; jeder läuft, auch wenn ein früherer
 * scheitert, Fehler kommen ins Protokoll. Danach endet der Prozess mit 0, oder mit 1, wenn ein Schritt gescheitert ist.
 *
 * Gesamtfrist ({@link BEENDEN_FRIST_MS}): `docker stop` schickt nach 10 Sekunden SIGKILL, mit mehreren Prozessen beendet
 * der Hauptprozess Säumige nach 8 Sekunden hart (#1328). Hängt ein Schritt (z. B. `app.close` mit offenen Anfragen), endet
 * der Prozess nach der Frist selbst – mit Eintrag im Protokoll, welcher Schritt hing und welche ausgelassen wurden, und
 * Code 1. So endet er geordnet, bevor ihn jemand von außen abbricht.
 */

/** Gesamtfrist für das Beenden (#1340): unter den 8 s des Hauptprozesses (#1328) und den 10 s von `docker stop`. */
export const BEENDEN_FRIST_MS = 7_000;

export interface Stoppschritt { name: string; f: () => unknown }

interface BeendenOptionen {
  log: { error(text: string, kontext?: Record<string, unknown>): void; warn(text: string, kontext?: Record<string, unknown>): void };
  /** Beendet den Prozess (`process.exit`); wird genau einmal gerufen. */
  ende: (code: number) => void;
  frist?: number;
}

export async function beendeGeordnet(schritte: Stoppschritt[], o: BeendenOptionen): Promise<void> {
  const frist = o.frist ?? BEENDEN_FRIST_MS;
  let gescheitert = 0;
  let aktuell = 0;
  let vorbei = false;
  const ende = (code: number) => { if (vorbei) return; vorbei = true; clearTimeout(uhr); o.ende(code); };
  // Nicht unref: Die Uhr hält den Prozess wach, falls ein hängender Schritt sonst nichts mehr zu tun hätte.
  const uhr = setTimeout(() => {
    o.log.warn(`Beenden: nach ${frist / 1000} s noch nicht fertig – hängt bei „${schritte[aktuell]?.name ?? '?'}“, Prozess wird beendet`, {
      ausgelassen: schritte.slice(aktuell + 1).map((s) => s.name),
    });
    ende(1);
  }, frist);
  for (; aktuell < schritte.length && !vorbei; aktuell++) {
    const s = schritte[aktuell];
    try { await s.f(); } catch (e) { gescheitert++; o.log.error(`Beenden: ${s.name} fehlgeschlagen`, { fehler: (e as Error).message }); }
  }
  ende(gescheitert ? 1 : 0);
}
