import { useCallback, useEffect, useRef, useState } from 'react';
import type { Speicherwahl } from '../../../shared/src/lasttest';
import type { LasttestStandMitAblauf } from '../../../shared/src/lasttestablauf';
import { einrichtungApi } from '../api/einrichtung';

/** Stand der Lasttest-Seite (#1279 aus `LasttestSeite` gezogen): abfragen alle 2 s, solange er läuft, und Eingaben. */
export function useLasttest() {
  const [stand, setStand] = useState<LasttestStandMitAblauf | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [geraet, setGeraet] = useState<string | null>(null);
  const [speicher, setSpeicher] = useState<Speicherwahl | null | undefined>(undefined);
  const [kopiert, setKopiert] = useState<'ja' | 'nein' | null>(null);
  const [beendet, setBeendet] = useState(false);
  /** Heruntergeladen (#697): gilt wie kopiert – dann sagt die Rückfrage beim Herunterfahren nichts vom Ergebnis. */
  const [gesichert, setGesichert] = useState(false);
  const senden = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Wann der Stand kam (Uhr des Browsers): Die Restdauer rechnet mit der Uhr des Servers weiter. */
  const geholt = useRef(0);

  const hole = useCallback(async () => {
    try {
      const s = await einrichtungApi.lasttest();
      geholt.current = Date.now();
      setStand(s);
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void hole();
  }, [hole]);
  const laeuft = !beendet && (!stand || stand.zustand === 'laeuft');
  useEffect(() => {
    if (!laeuft) return;
    const z = setInterval(() => void hole(), 2000);
    return () => clearInterval(z);
  }, [laeuft, hole]);
  // Sekunden des Durchgangs mitzählen, ohne den Server öfter zu fragen.
  const [, setTick] = useState(0);
  useEffect(() => {
    const z = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(z);
  }, []);
  return {
    ...{ stand, fehler, setFehler, geraet, setGeraet, speicher, setSpeicher, kopiert, setKopiert },
    ...{ beendet, setBeendet, gesichert, setGesichert, senden, geholt },
  };
}
