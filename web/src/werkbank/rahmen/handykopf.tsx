import { GRUPPEN, handyBereicheWeg, handyZurueck } from '../../../../shared/src/werkbankansicht';
import { Link } from '../../ort';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';

/**
 * Kopf der Werkbank am Handy (#1204): eine Zeile über dem Inhalt statt der Liste aller Bereiche. Auf einer Seite der Weg
 * zurück („‹ Ablage aufbauen“, „‹ Bereiche“ oder „‹ Zur Liste“, `handyZurueck`), auf der Übersicht der Weg nach vorn in
 * die Bereiche. Der Inhalt beginnt gleich darunter; Suche, „Werkbank anpassen“, „Projekt unterstützen“ und das Handbuch
 * stehen in den Bereichen. `an`: nur am Handy (`useWerkbankHandy`), am Rechner und Tablet nichts.
 */
export function HandyKopf({ an, bereich, ebene }: { an: boolean; bereich: string; ebene: 'liste' | 'mappe' }) {
  if (!an) return null;
  const zurueck = handyZurueck(bereich, ebene);
  if (!zurueck)
    return (
      <div className="wb-handykopf vor">
        <Link to={handyBereicheWeg()} className="verweis zur-liste">
          {t('werkbank.werkbank.bereiche-2')} <Symbol name="pfeil-rechts" />
        </Link>
      </div>
    );
  const text = zurueck.liste
    ? t('werkbank.werkbank.zur-liste')
    : zurueck.gruppe
      ? GRUPPEN[zurueck.gruppe]
      : t('werkbank.werkbank.bereiche-2');
  return (
    <div className="wb-handykopf">
      <Link to={zurueck.weg} className="verweis zur-liste">
        <Symbol name="pfeil-links" /> {text}
      </Link>
    </div>
  );
}
