import { useCallback, useEffect, useState } from 'react';
import type { AblaufvorlageAnsicht } from '../../../../shared/src/ablaufvorlagen';
import { gebietsschema } from '../../../../shared/src/sprache';
import { automatisierungApi } from '../../api/automatisierung';
import type { Klappe } from '../../bausteine';

/**
 * Werkbank → Ablage aufbauen → Automatisierungsvorlagen (#1044): Mitte alle Vorlagen (an/aus, Zahl der offenen Abläufe),
 * rechts Name, Reihenfolge, Beschreibung, Mappentypen fürs Menü „Mappe“, Wann, Karten mit Platzhaltern und die Fragen
 * beim Anwenden; darunter Ausprobieren, „Gerade benutzt bei“, Verlauf und Änderungsverlauf. Nur Karten „Aufgabe /
 * Benachrichtigung“ – keine, die Daten nach außen schicken.
 */

type Stand = { vorlagen: AblaufvorlageAnsicht[]; angehalten: Array<{ id: string; vorlage: string; mappeId: string; grund: string }> };

export function useAblaufvorlagen(offen: boolean) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setStand(await automatisierungApi.ablaufvorlagen());
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (offen) void laden();
  }, [offen, laden]);
  return { stand, fehler, laden };
}
export type AblaufvorlagenZustand = ReturnType<typeof useAblaufvorlagen>;

export const zeit = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) : '';
/** Die Abschnitte des Editors sind nicht klappbar – Fassungen (#1006) ebenso. */
export const FEST: Klappe = { offen: true, umschalten: () => undefined, fest: true };
export const pfad = (kennung: string) => `/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}`;
