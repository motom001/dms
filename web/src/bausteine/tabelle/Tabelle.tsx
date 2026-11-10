import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { geheZu, Link } from '../../ort';
import s from './Tabelle.module.css';

/**
 * Baustein Tabelle (#1030): Zeilen mit Spalten, jede Zeile führt zu einer Seite (meist einer Mappe). Breit eine Tabelle,
 * schmal – am Handy oder in einer schmalen Spalte – eine Liste mit den ersten zwei Spalten, wie Trefferlisten. Anleitung
 * im Entwicklerhandbuch, „Gestaltung und Bausteine → Tabelle“.
 *
 * - Die erste Spalte ist der Verweis (Tastatur, Bildschirmleser); ein Klick irgendwo in der Zeile führt ebenso hin.
 * - Leer zeigt sie einen ruhigen Satz statt einer leeren Tabelle (`leer`).
 * - Keine Summen, kein Sortieren und kein Bearbeiten in der Zeile – das bleibt der Seite dahinter.
 */

export interface TabelleSpalte {
  key: string;
  titel: string;
  /** Zahlen und Beträge rechtsbündig. */
  rechts?: boolean;
}

export interface TabelleZeile {
  key: string;
  /** Wohin die Zeile führt (Weg innerhalb von Ablago). */
  ziel: string;
  /** Inhalt je Spalte (`TabelleSpalte.key`). */
  zellen: Record<string, ReactNode>;
  /** Steht in der ersten Spalte, wenn sie leer ist (z. B. „Ohne Titel“). */
  ersatz: ReactNode;
}

export interface TabelleProps {
  /** Name der Tabelle für Bildschirmleser, z. B. „Positionen“. */
  beschriftung: string;
  spalten: TabelleSpalte[];
  zeilen: TabelleZeile[];
  /** Satz, wenn es keine Zeilen gibt, z. B. „Noch keine Positionen“. */
  leer: ReactNode;
  /** Unter den Zeilen, z. B. „weitere anzeigen“. */
  fuss?: ReactNode;
  /** Ab dieser Breite (px) eine Tabelle; Vorgabe: 480 bzw. 110 je Spalte. */
  breitAb?: number;
  /** Sprungziel für Rundgänge und Tests (`data-anker`). */
  anker?: string;
}

/** Breite des Rahmens (ResizeObserver) – 0, solange sie unbekannt ist. */
function useBreite() {
  const ref = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(([e]) => setBreite(e.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return { ref, breite };
}

export function Tabelle({ beschriftung, spalten, zeilen, leer, fuss, breitAb, anker }: TabelleProps) {
  const { ref, breite } = useBreite();
  const breit = breite >= (breitAb ?? Math.max(480, spalten.length * 110));
  const [erste, zweite] = spalten;
  const klick = (ziel: string) => (e: MouseEvent<HTMLElement>) => { if (!(e.target as HTMLElement).closest('a, button')) geheZu(ziel); };
  const zelle = (z: TabelleZeile, i: number, k: string) => (i === 0 ? <Link to={z.ziel}>{z.zellen[k] || z.ersatz}</Link> : z.zellen[k]);
  return (
    <div ref={ref} className={s.tabelle} data-anker={anker} data-darstellung={breit ? 'tabelle' : 'liste'}>
      {!zeilen.length ? <p className={s.leer}>{leer}</p>
        : breit ? (
          <table aria-label={beschriftung}>
            <thead><tr>{spalten.map((sp) => <th key={sp.key} scope="col" className={sp.rechts ? s.rechts : undefined}>{sp.titel}</th>)}</tr></thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.key} onClick={klick(z.ziel)}>
                  {spalten.map((sp, i) => <td key={sp.key} className={sp.rechts ? s.rechts : undefined}>{zelle(z, i, sp.key)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul aria-label={beschriftung} className={s.liste}>
            {zeilen.map((z) => (
              <li key={z.key} onClick={klick(z.ziel)}>
                <span className={s.haupt}>{erste ? zelle(z, 0, erste.key) : <Link to={z.ziel}>{z.ersatz}</Link>}</span>
                {zweite && z.zellen[zweite.key] ? <span className={s.neben}><span className={s.unsichtbar}>{zweite.titel}: </span>{z.zellen[zweite.key]}</span> : null}
              </li>
            ))}
          </ul>
        )}
      {fuss && <div className={s.fuss}>{fuss}</div>}
    </div>
  );
}
