import { useCallback, useEffect, useState } from 'react';
import { automatisierungApi } from '../../api/automatisierung';
import type { Stand } from './hilfen';

/** Stand der Automatisierungen (#675; #1279 aus Automatisierungen.tsx gezogen): laden und alle 15 s nachfragen. */

export function useAutomatisierungen(offen: boolean) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setStand(await automatisierungApi.automatisierungen());
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (offen) void laden();
  }, [offen, laden]);
  // Liste aktuell halten (letzter Lauf, angehalten) – mehrere Server: einfach regelmäßig nachfragen.
  useEffect(() => {
    if (!offen) return;
    const z = setInterval(() => void laden(), 15_000);
    return () => clearInterval(z);
  }, [offen, laden]);
  return { stand, fehler, laden };
}
export type AutomatisierungenZustand = ReturnType<typeof useAutomatisierungen>;

/** Für die Leiste: angehaltene oder fehlerhafte Automatisierungen. */
export const automatisierungWarnungen = (s: Stand | null) =>
  s?.automatisierungen.filter((a) => a.aktiv && (a.angehalten || a.probleme.length)).length ?? 0;
