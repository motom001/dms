import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ausschnitt, Mappe, Sortierung } from '../../shared/src/model';
import { api, type Bezuege } from './api';

export const SEITE = 100;

/** Anzeigetitel einer Mappe (der Server speichert ihn; leer = ohne Titel). */
export const titelOder = (t: string | undefined) => t || 'Ohne Titel';

/**
 * Mappen einer Sicht, seitenweise geladen (je 100, sortiert nach Titel).
 * mehr() lädt die nächste Seite; bei neuer Sicht oder Suche geht es von vorn los.
 * Nach einem Neuladen der Daten (stand) wird der bereits geladene Bereich erneuert,
 * damit die Liste nicht an den Anfang springt.
 */
export function useSeiten(sicht: string | undefined, suche: string, stand: number, sortierung?: Sortierung | null, volltext = false, notizen = false) {
  const [mappen, setMappen] = useState<Mappe[]>([]);
  /** Fundstellen im Volltext je Mappe (#45). */
  const [ausschnitte, setAusschnitte] = useState<Record<string, Ausschnitt>>({});
  /** Eingang: offene Aufgaben je Mappe (#54). */
  const [aufgaben, setAufgaben] = useState<Record<string, string>>({});
  const [bezuege, setBezuege] = useState<Bezuege>({});
  const [gesamt, setGesamt] = useState<number | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const lauf = useRef(0);
  const geladen = useRef(0);

  const lade = useCallback(async (von: number, anzahl: number, ersetzen: boolean) => {
    if (!sicht) return;
    const nr = ++lauf.current;
    setLaedt(true);
    try {
      const s = await api.seite(sicht, von, anzahl, suche, sortierung, volltext, notizen);
      if (nr !== lauf.current) return; // überholt
      setGesamt(s.gesamt);
      setMappen((alt) => (ersetzen ? s.mappen : [...alt, ...s.mappen]));
      setBezuege((alt) => (ersetzen ? s.bezuege : { ...alt, ...s.bezuege }));
      setAusschnitte((alt) => (ersetzen ? s.ausschnitte ?? {} : { ...alt, ...s.ausschnitte }));
      setAufgaben((alt) => (ersetzen ? s.aufgaben ?? {} : { ...alt, ...s.aufgaben }));
      geladen.current = (ersetzen ? 0 : geladen.current) + s.mappen.length;
      setFehler(undefined);
    } catch (e) {
      if (nr === lauf.current) setFehler((e as Error).message);
    } finally {
      if (nr === lauf.current) setLaedt(false);
    }
  }, [sicht, suche, sortierung?.spalte, sortierung?.absteigend, volltext, notizen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Neue Sicht oder Suche: von vorn.
  useEffect(() => { setMappen([]); setGesamt(null); geladen.current = 0; void lade(0, SEITE, true); }, [lade]);
  // Daten geändert: geladenen Bereich auffrischen (höchstens 500).
  const ersterStand = useRef(stand);
  useEffect(() => {
    if (stand === ersterStand.current) return;
    void lade(0, Math.min(500, Math.max(SEITE, geladen.current)), true);
  }, [stand]); // eslint-disable-line react-hooks/exhaustive-deps

  const mehr = useCallback(() => {
    if (laedt || gesamt === null || mappen.length >= gesamt) return;
    void lade(mappen.length, SEITE, false);
  }, [laedt, gesamt, mappen.length, lade]);

  return { mappen, bezuege, ausschnitte, aufgaben, gesamt, laedt, fehler, mehr, alle: gesamt !== null && mappen.length >= gesamt };
}
