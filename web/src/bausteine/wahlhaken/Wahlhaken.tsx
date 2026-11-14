import { useEffect, useRef, type MouseEvent } from 'react';
import s from './Wahlhaken.module.css';

/**
 * Baustein Wahlhaken (#1211, #1212): der Haken, mit dem man Zeilen einer Liste auswählt – Mappen einer Ansicht,
 * Dokumente einer Mappe, Einträge im Papierkorb. Er steht in der Zeile ohne sichtbare Beschriftung (die Zeile zeigt,
 * worum es geht); der Name für Screenreader nennt den Eintrag („Mietvertrag auswählen“). Für Haken mit sichtbarer
 * Beschriftung gibt es `HakenFeld`.
 *
 * - `setze(an, bereich)`: `bereich` ist true bei gedrückter Umschalttaste (Bereich von der letzten Wahl bis hier).
 * - `teilweise`: „einige gewählt“ (Haken im Kopf einer Liste, `indeterminate`).
 * - Am Handy (`pointer: coarse`) eine Tippfläche von 44 × 44 px um das Kästchen (D6), am Rechner mindestens 24 px.
 */
export interface WahlhakenProps {
  an: boolean;
  setze(an: boolean, bereich: boolean): void;
  /** Name für Screenreader, z. B. „Mietvertrag auswählen“. */
  beschriftung: string;
  /** Einige, aber nicht alle gewählt (Kopf einer Liste). */
  teilweise?: boolean;
  gesperrt?: boolean;
  className?: string;
}

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

export function Wahlhaken({ an, setze, beschriftung, teilweise, gesperrt, className }: WahlhakenProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!teilweise; }, [teilweise]);
  // onClick statt onChange: nur dort gibt es die Umschalttaste.
  const klick = (e: MouseEvent<HTMLInputElement>) => setze(e.currentTarget.checked, e.shiftKey);
  return (
    <span className={klassen(s.flaeche, 'wahlhaken-flaeche', className)}>
      <input ref={ref} type="checkbox" className={klassen(s.haken, 'wahlhaken')} checked={an} disabled={gesperrt} aria-label={beschriftung}
        onClick={klick} onChange={() => {}} />
    </span>
  );
}
