import { useCallback, useEffect, useState } from 'react';
import { datenschutzApi, type DatenschutzStand } from '../../api/datenschutz';

/**
 * Werkbank → Datenschutz (#396): Auskunft nach Art. 15 DSGVO als ZIP.
 *   1. Betroffenen wählen (Mappentypen „betrifft eine Person“), optional Frist als Aufgabe
 *   2. Sammeln über Verweise (Baum, Tiefe einstellbar, nur über Zugehörigkeit weiter) und prüfen: Häkchen je
 *      Mappe, Dokument, Notiz, Historie; Bezug-Mappen nur als Erwähnung, bewusst ganz aufnehmbar (#472)
 *   3. Erzeugen als Hintergrundauftrag, optional mit Passwort (AES); Download, danach gelöscht
 *   4. Zustellen (#455): per E-Mail (nur verschlüsselt) oder als Abruf-Link mit Abrufcode
 * Löschkonzept (#469) und Löschprotokoll (#470) sind eigene Bereiche (Loeschkonzept.tsx, Loeschprotokoll.tsx, #1184); die
 * Vorgaben für jede Auskunft stehen auf „Eigene Organisation“ (AuskunftVorgaben.tsx, #1183).
 */
export function useDatenschutz(offen: boolean) {
  const [stand, setStand] = useState<DatenschutzStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setStand(await datenschutzApi.datenschutz());
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
export type DatenschutzZustand = ReturnType<typeof useDatenschutz>;
