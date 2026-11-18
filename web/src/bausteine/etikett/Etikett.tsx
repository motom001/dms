import type { ReactNode } from 'react';
import { Symbol } from '../../Symbol';
import { Knopf } from '../knopf/Knopf';
import s from './Etikett.module.css';

/**
 * Baustein Etikett (#1289, Leitsatz 8): ein reines Kennzeichen – Art, Verweisart, Zustand wie „Warnung“, „aus Paket“.
 * Kleine Schrift, höchstens eine zarte Fläche, **kein Rand**, nicht klickbar: Ein Rand heißt „Knopf“. Was sich
 * anklicken lässt, ist ein `Knopf` oder ein `KnopfLink`, nie ein Etikett. Anleitung im Entwicklerhandbuch,
 * „Gestaltung und Bausteine → Etikett“.
 *
 * - Arten: `leise` (grau, Vorgabe), `info` (Akzent), `gut` (grün), `warn` (gelb), `schlecht` (rot).
 * - `punkt`: farbiger Punkt vor dem Text (Zustand einer Ampel).
 * - `entfernen`: gewählter Eintrag mit ✕ (Musterkatalog A1) – ein Etikett mit einem Knopf ✕ darin; nur der ✕ ist
 *   klickbar, `entfernenText` ist sein Name für Screenreader.
 * - `className` nur für Abstände und Umbruch in der Umgebung (`.bereich .etikett-…`), nie für Farbe oder Rand.
 */
export type EtikettArt = 'leise' | 'info' | 'gut' | 'warn' | 'schlecht';

export interface EtikettProps {
  art?: EtikettArt;
  punkt?: boolean;
  /** Etwas kleiner (in dichten Zeilen und Tabellen). */
  klein?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
  /** Gewählter Eintrag (A1): ✕ zum Entfernen. */
  entfernen?: () => void;
  entfernenText?: string;
}

const ARTEN: readonly string[] = ['leise', 'info', 'gut', 'warn', 'schlecht'];
/** Art aus einem Wert, der aus einer Tabelle kommt (`'gut'`, `'warn'` … oder leer): Unbekanntes und Leeres ist `leise`. */
export function etikettArt(x: string | null | undefined): EtikettArt {
  return x && ARTEN.includes(x) ? (x as EtikettArt) : 'leise';
}

export function Etikett({ art = 'leise', punkt, klein, title, className, children, entfernen, entfernenText }: EtikettProps) {
  const klassen = [s.etikett, s[art], punkt && s.punkt, klein && 'klein', className].filter(Boolean).join(' ');
  return (
    <span className={klassen} title={title} data-etikett={art}>
      {entfernen ? <span className={s.text}>{children}</span> : children}
      {entfernen && (
        <Knopf art="eigen" className={s.weg} nurSymbol={entfernenText ?? ''} onClick={entfernen}>
          <Symbol name="schliessen" />
        </Knopf>
      )}
    </span>
  );
}
