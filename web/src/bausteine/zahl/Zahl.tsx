import { gebietsschema } from '../../../../shared/src/sprache';
import { t } from '../../sprache';
import s from './Zahl.module.css';

/**
 * Baustein Zahl (#1287, Leitsatz 9 „Zahlen in der Navigation“): die Zahl hinter einem Eintrag der Navigation – in der
 * Ablage (Zu erledigen, Neue Post, Ansichten) und in der Werkbank (Bereiche). Drei Arten statt drei Klassen:
 *
 * - `menge` (Vorgabe): reine Menge – leise grau (Favoriten, Papierkorb, Ansichten, Zahlen in der Werkbank).
 * - `wartet`: was auf dich wartet (Zu erledigen, Neue Post) – fett in Textfarbe, ohne farbige Fläche. Bei 0 sieht sie
 *   aus wie eine Menge: leer ist kein Auftrag. Für Screenreader steht dazu ein Text („2 warten auf dich“), nicht nur die
 *   Schriftstärke.
 * - `warnung`: echte Warnung (Übersicht, Automatisierungen in der Werkbank) – gelbe Pille. Gelb heißt bei uns Warnung.
 *
 * Die 0 steht immer da (leise grau); nur während des Ladens steht der Platzhalter `ZahlWarte`. `beschriftung` ersetzt den
 * Text für Screenreader (z. B. „1 – Hinweis in Automatisierungen“), `title` den Tooltip.
 */
export type ZahlArt = 'menge' | 'wartet' | 'warnung';

export interface ZahlProps {
  wert: number | string;
  art?: ZahlArt;
  beschriftung?: string;
  title?: string;
}

const anzeige = (wert: number | string) => (typeof wert === 'number' ? wert.toLocaleString(gebietsschema()) : wert);

export function Zahl({ wert, art = 'menge', beschriftung, title }: ZahlProps) {
  // Nichts wartet: dann ist es nur eine Menge.
  const wirklich: ZahlArt = art === 'wartet' && wert === 0 ? 'menge' : art;
  const text =
    beschriftung ?? (wirklich === 'wartet' && typeof wert === 'number' ? t('oberflaeche.zahl.wartet', { anzahl: wert }) : undefined);
  return (
    <span className={`${s.zahl} ${s[wirklich]}`} data-zahl={wirklich} title={title}>
      {text ? (
        <>
          <span aria-hidden="true">{anzeige(wert)}</span>
          <span className={s.sr}>{text}</span>
        </>
      ) : (
        anzeige(wert)
      )}
    </span>
  );
}
