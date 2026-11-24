import { createContext, useContext } from 'react';
import type { Mappe, Mappentyp } from '../../../shared/src/model';
import type { RohWerte } from '../werte';

/**
 * Verknüpfte Mappe in der rechten Spalte anlegen (#1596): Auf der Seite „Neue Post“ öffnet „+ … anlegen“ an einem
 * Verweisfeld kein Fenster mehr, sondern eine weitere Ebene in der rechten Spalte – das Dokument bleibt in der Mitte
 * sichtbar. Die Seite stellt je Ebene diesen Kontext bereit; ohne ihn (überall sonst) bleibt es beim Fenster (#935).
 * Hier nur Kontext und Typen, damit das Verweisfeld (mappe-formular) und die Seite (uebernehmen) ohne Kreis zueinander
 * finden.
 */

/** Höchstens drei Ebenen (Thomas 24.11.2026): die Mappe aus der Post und zwei verknüpfte darunter. */
export const EBENEN_MAX = 3;

/** Was ein Verweisfeld zum Anlegen übergibt. */
export interface EbenenWunsch {
  typ: Mappentyp;
  /** Startwerte (Vorgaben des Typs, Auswahlfilter, Getipptes) ohne die Werte aus dem Dokument. */
  start: RohWerte;
  /** Werte, die Ablago im Dokument erkannt hat: stehen vorausgefüllt und mit „Vorschlag“ markiert. */
  erkannt: RohWerte;
  /** Beschriftung des Verweisfelds, z. B. „Aussteller“. */
  feld: string;
  /** Nach dem Speichern: die neue Mappe ins Verweisfeld. */
  gespeichert(m: Mappe): void;
  /** Nach „Entwurf verwerfen“ oder einem Sprung zurück: Fokus zurück ans Verweisfeld. */
  zurueck(): void;
}

export interface EbeneLage {
  /** Nummer dieser Ebene (die Mappe aus der Post ist 1). */
  nr: number;
  oeffne(w: EbenenWunsch): void;
}

export const EbenenKontext = createContext<EbeneLage | null>(null);
/** Vorsilbe der Feld-ids (`feld-<vorsilbe><key>`): auf Ebene 2 und 3 eigene, denn die Ebenen darunter bleiben im DOM. */
export const FeldIdPraefix = createContext('');
export const useEbene = () => useContext(EbenenKontext);
