import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../../sprache';
import { zielDerTaste } from '../umschalter/Umschalter';
import s from './Reiter.module.css';

/**
 * Baustein Reiter (#1210): Register über einem Inhalt – genau ein Reiter ist aktiv, darunter steht sein Inhalt
 * (`ReiterFlaeche`). Ein aktives Aussehen für alle Stellen: Fläche wie der Inhalt, Rand, oben eine Linie in der
 * Akzentfarbe (Blau ist auch Auswahl, Leitsatz 1). Vorher sah der aktive Reiter in der Mappe anders aus als bei der
 * Texterkennung.
 *
 * Für Screenreader eine Registerliste nach WAI-ARIA (`role="tablist"`, je Reiter `role="tab"` mit `aria-selected` und
 * `aria-controls`, die Fläche `role="tabpanel"`). Tastatur: Tab erreicht nur den aktiven Reiter, Pfeiltasten (auch
 * Pos1/Ende) wählen den nächsten. Breiter als der Platz: Die Reihe rollt waagerecht, die Seite nicht.
 *
 * Abgrenzung: Der `Umschalter` ändert, *wie* etwas Gleiches arbeitet (z. B. „Liste · Monat · Jahr“); Reiter zeigen
 * verschiedene Inhalte.
 */

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

export interface ReiterWahl<T extends string> {
  wert: T;
  text: ReactNode;
  /** Zahl der Einträge hinter dem Reiter (z. B. Dokumente). */
  anzahl?: number;
  /** Zahl der Fehler auf diesem Reiter – rot, damit man ihn findet. */
  fehler?: number;
  /** Sprungziel für Rundgänge und Tests (`data-anker`). */
  anker?: string;
}

export interface ReiterProps<T extends string> {
  /** Kennung der Reihe; daraus entstehen die `id` der Reiter und der Fläche. */
  id: string;
  wert: T;
  setze(wert: NoInfer<T>): void;
  wahlen: ReadonlyArray<ReiterWahl<NoInfer<T>>>;
  /** Name der Reihe für Screenreader, z. B. „Register der Mappe“. */
  beschriftung: string;
  className?: string;
}

/** `id` eines Reiters und der Fläche – für `ReiterFlaeche` und Sprünge. */
export const reiterId = (id: string, wert: string) => `${id}-reiter-${wert}`;
export const flaecheId = (id: string) => `${id}-flaeche`;

export function Reiter<T extends string>({ id, wert, setze, wahlen, beschriftung, className }: ReiterProps<T>) {
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
    <div role="tablist" aria-label={beschriftung} className={klassen(s.reihe, className)} onKeyDown={taste}>
      {wahlen.map((w, i) => {
        const an = w.wert === wert;
        return (
          <button key={w.wert} ref={(el) => { knoepfe.current[i] = el; }} id={reiterId(id, w.wert)} type="button" role="tab"
            aria-selected={an} aria-controls={flaecheId(id)} tabIndex={an ? 0 : -1} data-anker={w.anker}
            className={klassen(s.reiter, an && s.an)} onClick={() => { if (!an) setze(w.wert); }}>
            <span className={s.text}>{w.text}</span>
            {!!w.fehler && <span className={s.fehler} title={t('oberflaeche.reiter.fehler', { anzahl: w.fehler })}><span aria-hidden="true">{w.fehler}</span><span className={s.sr}>{t('oberflaeche.reiter.fehler', { anzahl: w.fehler })}</span></span>}
            {w.anzahl !== undefined && <span className={s.anzahl}>{w.anzahl}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inhalt des aktiven Reiters: `role="tabpanel"`, benannt nach dem Reiter. Ohne eigenes `tabindex` – der Inhalt hat fast
 * immer Bedienelemente, und eine fokussierbare Fläche wäre am Handy ein Tippziel ohne Zweck.
 */
export function ReiterFlaeche({ id, wert, children, className }: { id: string; wert: string; children: ReactNode; className?: string }) {
  return <div role="tabpanel" id={flaecheId(id)} aria-labelledby={reiterId(id, wert)} className={klassen(s.flaeche, className)}>{children}</div>;
}
