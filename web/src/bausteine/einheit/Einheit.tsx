import type { ChangeEvent } from 'react';
import { einheitText, ZEITRAUM_EINHEITEN, type Zeitraumeinheit } from '../../../../shared/src/feldarten';
import { t } from '../../sprache';
import type { FeldVerknuepfung } from '../feld/Feld';
import s from './Einheit.module.css';

/**
 * Eingaben mit Einheit (#1035): Zeitraum („3“ + „Monate“) und Prozent („19“ + „%“). Sie stehen in einem Feldrahmen
 * (`Feld`) oder in einem eigenen Rahmen mit Beschriftung (`htmlFor` auf `id`) und nehmen dessen Verknüpfung an – `id`
 * und `aria-describedby` gehen an die Zahl, denn dort tippt man. Anleitung im Entwicklerhandbuch, „Gestaltung und
 * Bausteine → Eingaben mit Einheit“.
 */

/** Wert eines Zeitraums, wie getippt: Anzahl als Text, Einheit aus der Auswahl. */
export interface ZeitraumRoh { anzahl: string; einheit: Zeitraumeinheit }

interface Gemeinsam extends Partial<FeldVerknuepfung> {
  /** Name der Eingabe, wenn keine sichtbare Beschriftung auf `id` zeigt (z. B. in einer Bedingung). */
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
}

export interface ZeitraumEingabeProps extends Gemeinsam {
  wert: ZeitraumRoh;
  setze: (w: ZeitraumRoh) => void;
}

/**
 * Zeitraum: ganze Zahl und Einheit. Die Einheiten stehen in der Einzahl, solange die Anzahl 1 ist („1 Monat“), sonst in
 * der Mehrzahl („3 Monate“). Am Handy die Zifferntastatur.
 */
export function ZeitraumEingabe({ wert, setze, id, disabled, className, ...aria }: ZeitraumEingabeProps) {
  const anzahl = Number(wert.anzahl.trim());
  const zahl = Number.isInteger(anzahl) && wert.anzahl.trim() !== '' ? anzahl : 2;
  const name = aria['aria-label'];
  return (
    <span className={[s.einheit, s.zeitraum, className].filter(Boolean).join(' ')}>
      <input id={id} inputMode="numeric" autoComplete="off" value={wert.anzahl} disabled={disabled} {...aria}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setze({ ...wert, anzahl: e.target.value })} />
      <select aria-label={name ? t('oberflaeche.einheit.einheit-von', { name }) : t('oberflaeche.einheit.einheit')} value={wert.einheit} disabled={disabled}
        aria-invalid={aria['aria-invalid']} onChange={(e) => setze({ ...wert, einheit: e.target.value as Zeitraumeinheit })}>
        {ZEITRAUM_EINHEITEN.map((x) => <option key={x} value={x}>{einheitText(x, zahl)}</option>)}
      </select>
    </span>
  );
}

export interface ProzentEingabeProps extends Gemeinsam {
  wert: string;
  setze: (w: string) => void;
}

/** Prozent: Zahl mit Komma, das Zeichen „%“ steht fest dahinter (nur zum Ansehen; „19 %“ getippt geht auch). */
export function ProzentEingabe({ wert, setze, id, disabled, className, ...aria }: ProzentEingabeProps) {
  return (
    <span className={[s.einheit, s.prozent, className].filter(Boolean).join(' ')}>
      <input id={id} inputMode="decimal" autoComplete="off" value={wert} disabled={disabled} {...aria} onChange={(e) => setze(e.target.value)} />
      <span className={s.zeichen} aria-hidden="true">%</span>
    </span>
  );
}
