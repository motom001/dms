import type { MouseEvent, ReactNode } from 'react';
import { gebietsschema } from '../../../../shared/src/sprache';
import { Link } from '../../ort';
import { Symbol } from '../../Symbol';
import s from './Kachel.module.css';

/**
 * Baustein Kachel (#1271, #1284): ein Weg mit einer Zahl – auf der Startseite der Ablage und auf der Übersicht der
 * Werkbank gleich. Fläche wie der Inhalt, Rand, oben der Titel, groß die Zahl in der Akzentfarbe, darunter leise eine
 * Zeile. Die ganze Kachel ist ein Link (Musterkatalog C8: ein Weg).
 *
 * - `wert`: Zahl (im Gebietsschema geschrieben) oder kurzer Text (Datum, Version); `null` = lädt noch („…“).
 * - `leer`: Text statt der 0 („Nichts zu erledigen“). Mit `leerGut` grün mit Haken – nur, wenn leer wirklich „erledigt“
 *   heißt; sonst leise (#1271: leer ist kein Erfolg, z. B. „Noch keine Favoriten“).
 * - `unter`, `zusatz`: Zeilen darunter (`zusatz` z. B. „2 überfällig“ in eigener Farbe des Aufrufers).
 * - `name` (`data-kachel`) und `anker` (`data-anker`): fester Schlüssel und Sprungziel für Rundgänge.
 * Mehrere Kacheln stehen in `Kacheln`: ein Raster, ab 420 px Breite nebeneinander, darunter als Zeilen.
 */
export interface KachelProps {
  to: string;
  titel: ReactNode;
  wert: number | string | null;
  leer?: string;
  leerGut?: boolean;
  unter?: ReactNode;
  zusatz?: ReactNode;
  name?: string;
  anker?: string;
  /** Vor dem Weg (z. B. Ansicht „Monat“ wählen, Termin-Kachel). */
  vorher?: (e: MouseEvent) => void;
}

export function Kachel({ to, titel, wert, leer, leerGut, unter, zusatz, name, anker, vorher }: KachelProps) {
  const nichts = wert === 0 && !!leer;
  return (
    <div className={s.feld} data-kachel={name} data-anker={anker} onClickCapture={vorher}>
      <Link to={to} className={s.kachel}>
        <span className={s.titel}>{titel}</span>
        {wert === null ? (
          <span className={`${s.wert} ${s.laedt}`}>…</span>
        ) : nichts ? (
          <span className={leerGut ? `${s.leer} ${s.gut}` : s.leer} data-leer={leerGut ? 'gut' : 'leise'}>
            {leerGut && (
              <>
                <Symbol name="haken" />{' '}
              </>
            )}
            {leer}
          </span>
        ) : (
          <span className={s.wert}>{typeof wert === 'number' ? wert.toLocaleString(gebietsschema()) : wert}</span>
        )}
        {unter && !nichts && <span className={s.unter}>{unter}</span>}
        {zusatz && <span className={s.unter}>{zusatz}</span>}
      </Link>
    </div>
  );
}

/** Raster für Kacheln (#1284): auf Startseite und Übersicht gleich. */
export function Kacheln({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `${s.raster} ${className}` : s.raster}>{children}</div>;
}
