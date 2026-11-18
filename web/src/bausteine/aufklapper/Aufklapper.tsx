import type { ReactNode } from 'react';
import { Symbol } from '../../Symbol';
import { Knopf } from '../knopf/Knopf';
import s from './Aufklapper.module.css';

/**
 * Baustein Aufklapper (#1270): Kopf eines Abschnitts (`kopf`, z. B. „Expertenmodus“ in den Paketen) oder einer
 * Listenzeile (`zeile`, z. B. ein Eintrag der Datenbank-Messung), der einen Inhalt auf- und zuklappt. Pfeil, `aria-expanded`
 * und `aria-controls` bringt der Baustein mit; der Inhalt steht darunter beim Aufrufer. Früher die Sonderformen
 * `aufklappkopf` und `aufklappzeile` am Knopf. Anleitung im Entwicklerhandbuch, „Gestaltung und Bausteine → Aufklapper“.
 */
export interface AufklapperProps {
  form?: 'kopf' | 'zeile';
  offen: boolean;
  umschalten: () => void;
  /** Id des Inhalts, den der Aufklapper zeigt (`aria-controls`). */
  steuert?: string;
  title?: string;
  children: ReactNode;
}

export function Aufklapper({ form = 'kopf', offen, umschalten, steuert, title, children }: AufklapperProps) {
  return (
    <Knopf art="eigen" className={s[form]} aria-expanded={offen} aria-controls={steuert} title={title} onClick={umschalten}>
      <Symbol name={offen ? 'pfeil-unten' : 'pfeil-rechts'} className={s.zeichen} />
      {children}
    </Knopf>
  );
}
