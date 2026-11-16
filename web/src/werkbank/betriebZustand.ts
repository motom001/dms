/**
 * Zustand der Werkbank-Seite „Betrieb“ (#37): Stand laden und merken (#1278, Schritt 5; vorher in Betrieb.tsx). Eigene
 * Datei, weil auch der E-Mail-Versand (MailVersand.tsx) ihn bekommt und Betrieb.tsx den E-Mail-Versand zeigt.
 */
import { useCallback, useState } from 'react';
import { betriebApi, type BetriebAnsicht } from '../api/betrieb';

/** Stand der Seite „Betrieb“ laden; `laden` holt ihn neu (z. B. nach dem Speichern). */
export function useBetrieb() {
  const [stand, setStand] = useState<BetriebAnsicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setStand(await betriebApi.betrieb());
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  return { stand, setStand, fehler, laden };
}
export type BetriebZustand = ReturnType<typeof useBetrieb>;
