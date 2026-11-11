import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import s from './Umschalter.module.css';

/**
 * Baustein Umschalter (#1002): zwei bis vier gleichrangige Wahlen nebeneinander, genau eine ist an – ein Segmentknopf,
 * z. B. „Fragen · Suchen“ über dem Feld der Startseite. Anleitung im Entwicklerhandbuch, „Gestaltung und Bausteine →
 * Umschalter“.
 *
 * Für Screenreader eine Gruppe von Optionsfeldern (`role="radiogroup"`, je Wahl `role="radio"` mit `aria-checked`): Die
 * Gruppe hat einen Namen, jede Wahl sagt, ob sie an ist. Tastatur wie bei Optionsfeldern: Tab erreicht nur die gewählte
 * Wahl, Pfeiltasten (auch Pos1/Ende) wählen die nächste und bleiben in der Gruppe; Tab führt weiter zum Feld.
 *
 * Für Reiter mit eigenem Inhalt darunter (Register einer Mappe) gibt es das Muster Registerkarten – der Umschalter
 * ändert, *wie* etwas Gleiches arbeitet (Ansicht, Art der Eingabe).
 */

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

export interface UmschalterWahl<T extends string> {
  wert: T;
  text: ReactNode;
}

export interface UmschalterProps<T extends string> {
  /** Die gewählte Wahl. */
  wert: T;
  setze(wert: NoInfer<T>): void;
  wahlen: ReadonlyArray<UmschalterWahl<NoInfer<T>>>;
  /** Name der Gruppe für Screenreader, z. B. „Fragen oder suchen“. */
  beschriftung: string;
  className?: string;
  /** Sprungziel der ganzen Gruppe (`data-anker`). */
  anker?: string;
}

/**
 * Welche Wahl eine Taste wählt (Optionsfelder nach WAI-ARIA): rechts/runter die nächste, links/hoch die vorige – am Ende
 * wieder vorn –, Pos1 die erste, Ende die letzte; -1 für jede andere Taste.
 */
export function zielDerTaste(taste: string, jetzt: number, anzahl: number): number {
  if (anzahl < 1) return -1;
  if (taste === 'ArrowRight' || taste === 'ArrowDown') return (jetzt + 1) % anzahl;
  if (taste === 'ArrowLeft' || taste === 'ArrowUp') return (jetzt - 1 + anzahl) % anzahl;
  if (taste === 'Home') return 0;
  if (taste === 'End') return anzahl - 1;
  return -1;
}

/** Segmentknopf: eine Reihe gleich breiter Wahlen, die gewählte gefüllt. */
export function Umschalter<T extends string>({ wert, setze, wahlen, beschriftung, className, anker }: UmschalterProps<T>) {
  const knoepfe = useRef<Array<HTMLButtonElement | null>>([]);
  const jetzt = Math.max(0, wahlen.findIndex((w) => w.wert === wert));

  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    const ziel = zielDerTaste(e.key, jetzt, wahlen.length);
    if (ziel < 0) return;
    e.preventDefault();
    setze(wahlen[ziel].wert);
    knoepfe.current[ziel]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={beschriftung} className={klassen(s.umschalter, className)} data-anker={anker} onKeyDown={taste}>
      {wahlen.map((w, i) => {
        const an = w.wert === wert;
        return (
          <button key={w.wert} ref={(el) => { knoepfe.current[i] = el; }} type="button" role="radio" aria-checked={an} tabIndex={an ? 0 : -1}
            className={klassen(s.wahl, an && s.an)} onClick={() => { if (!an) setze(w.wert); }}>
            {w.text}
          </button>
        );
      })}
    </div>
  );
}
