import { useCallback, useEffect, useState } from 'react';
import { sucheApi, type OcrStatus } from '../../api/suche';

/**
 * Werkbank → Texterkennung (#45, #459): Übersicht – welches Paket die Texterkennung übernimmt, woher der Text der
 * Dokumente kommt, erkannte Sprachen, Warteschlange und Aufträge. Einstellungen der Erkennung stehen beim Paket.
 * Eingebaute Werkzeuge (Poppler, qpdf) erscheinen nur, wenn eins fehlt (#1189).
 * Werkbank → Wartungsoperationen: Volltext neu erzeugen (#458), alle Dateien prüfen (#212),
 * Nummern nachträglich vergeben. Sicherung, Wiederherstellung und Export sind eigene Bereiche.
 */

export function useTexterkennung(aktiv: boolean) {
  const [stand, setStand] = useState<OcrStatus | null>(null);
  const [fehler, setFehler] = useState<string>();
  /** Lädt den Stand; Rückgabe: der Fehler, falls es nicht geklappt hat (für „Erneut prüfen“ am Knopf, #986). */
  const laden = useCallback(async (werkzeugeNeu = false): Promise<string | undefined> => {
    try {
      setStand(await sucheApi.texterkennung(werkzeugeNeu));
      setFehler(undefined);
      return undefined;
    } catch (e) {
      setFehler((e as Error).message);
      return (e as Error).message;
    }
  }, []);
  // Solange etwas wartet oder läuft, alle paar Sekunden auffrischen.
  const offen = !!stand && (stand.zaehler.wartet > 0 || stand.zaehler.laeuft > 0 || (stand.zaehler.paket ?? 0) > 0);
  useEffect(() => {
    if (!aktiv) return;
    void laden();
  }, [aktiv, laden]);
  useEffect(() => {
    if (!aktiv || !offen) return;
    const timer = setInterval(() => void laden(), 3000);
    return () => clearInterval(timer);
  }, [aktiv, offen, laden]);
  return { stand, setStand, fehler, laden };
}
export type TexterkennungZustand = ReturnType<typeof useTexterkennung>;
