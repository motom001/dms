import { useCallback, useEffect, useState } from 'react';
import { betriebApi, type TresorStatus } from '../../api/betrieb';

/** Meldet anderen Teilen (Übersicht, Leiste), dass sich der Schlüssel geändert hat. */
const GEAENDERT = 'dms:tresor';
export const melde = () => dispatchEvent(new Event(GEAENDERT));

export function useTresor(aktiv = true) {
  const [stand, setStand] = useState<TresorStatus | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setStand(await betriebApi.tresor());
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!aktiv) return;
    // laden fängt Fehler selbst ab (fehler); der Ereignis-Handler gibt kein Promise zurück (#1011).
    const neu = () => void laden();
    neu();
    addEventListener(GEAENDERT, neu);
    return () => removeEventListener(GEAENDERT, neu);
  }, [aktiv, laden]);
  return { stand, setStand, fehler, laden };
}
export type TresorZustand = ReturnType<typeof useTresor>;
