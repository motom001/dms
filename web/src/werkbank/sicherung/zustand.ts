import { useCallback, useEffect, useState } from 'react';
import { betriebApi, type SicherungStand } from '../../api/betrieb';
import { useKontoOptional } from '../../konto-kontext';

/**
 * Werkbank → Sicherung (#103–#106): jetzt sichern, Liste mit Prüfsumme, Zeitplan und
 * Aufbewahrung, Speicherplatz und Speicherort. Das Notfallblatt steht nur unter Verschlüsselung (#993);
 * hier bleibt der Hinweis, wenn es fehlt oder nicht mehr gilt, mit Link dorthin (`NOTFALLBLATT_SEITE`).
 */

export const NOTFALLBLATT_URL = '/api/werkbank/notfallblatt';
const GEAENDERT = 'dms:sicherung';
export const meldeSicherung = () => dispatchEvent(new Event(GEAENDERT));

export function useSicherung(offen: boolean) {
  const [stand, setStand] = useState<SicherungStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setStand(await betriebApi.sicherung());
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!offen) return;
    // laden fängt Fehler selbst ab (fehler); der Ereignis-Handler gibt kein Promise zurück (#1011).
    const neu = () => void laden();
    neu();
    addEventListener(GEAENDERT, neu);
    return () => removeEventListener(GEAENDERT, neu);
  }, [offen, laden]);
  // Während ein Lauf läuft: jede Sekunde den Fortschritt, am Ende alles neu.
  const laeuft = stand?.lauf?.status === 'laeuft';
  useEffect(() => {
    if (!laeuft) return;
    const timer = setInterval(() => {
      void betriebApi.sicherungLauf().then(
        (lauf) => {
          setStand((s) => (s ? { ...s, lauf } : s));
          if (lauf?.status !== 'laeuft') void laden();
        },
        () => {},
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [laeuft, laden]);
  // Probe-Wiederherstellung (#109): Schritte live.
  const probeLaeuft = stand?.probe?.art === 'probe' && stand.probe.status === 'laeuft';
  useEffect(() => {
    if (!probeLaeuft) return;
    const timer = setInterval(() => {
      void betriebApi.probeLauf().then(
        (probe) => {
          setStand((s) => (s ? { ...s, probe } : s));
          if (probe?.status !== 'laeuft') void laden();
        },
        () => {},
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [probeLaeuft, laden]);
  return { stand, setStand, fehler, laden };
}
export type SicherungZustand = ReturnType<typeof useSicherung>;

/** Verwaltet die Person die Verschlüsselung (oder alles)? Nur dann erfährt sie hier vom Notfallblatt (#993). */
export function useVerwaltetVerschluesselung(): boolean {
  const b = useKontoOptional()?.verwaltungsmodus.bereiche;
  return b === null || (b?.includes('verschluesselung') ?? false);
}
