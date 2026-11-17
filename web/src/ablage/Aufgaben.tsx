/**
 * Aufgaben und Abläufe an einer Mappe – Tür zu aufgaben/ (#1279): Hinweis über der Mappe, „Geplant“, die Dialoge der
 * Automatisierungsvorlagen und die Personenwahl stehen dort.
 */
import type { VorlageZumAnwenden } from '../../../shared/src/ablaufvorlagen';
import { AblaufFormular, ErinnerungFormular, NeueAufgabe } from './aufgaben/formulare';
import type { Probe } from './aufgaben/gemeinsam';

export { BenutzerWahl } from './aufgaben/gemeinsam';
export { AufgabenHinweis } from './aufgaben/Hinweis';
export { Geplant } from './aufgaben/Geplant';
export { AblaufFormular, ErinnerungFormular, NeueAufgabe };

/**
 * Der kleine Dialog einer Automatisierungsvorlage, wie an der Mappe (#1176): „Aufgabe vergeben“, „Erinnern“ oder eine
 * weitere Vorlage – für das Ausprobieren in der Werkbank.
 */
export function VorlagenDialog({
  mappeId,
  vorlage,
  schliessen,
  probe,
}: {
  mappeId: string;
  vorlage: VorlageZumAnwenden;
  schliessen: () => void;
  probe: Probe;
}) {
  const nichts = async () => undefined;
  if (vorlage.kennung === 'aufgabe_vergeben')
    return <NeueAufgabe mappeId={mappeId} vorlage={vorlage} neuLaden={nichts} schliessen={schliessen} probe={probe} />;
  if (vorlage.kennung === 'erinnern')
    return <ErinnerungFormular mappeId={mappeId} vorlage={vorlage} neuLaden={nichts} schliessen={schliessen} probe={probe} />;
  return <AblaufFormular mappeId={mappeId} vorlage={vorlage} neuLaden={nichts} schliessen={schliessen} probe={probe} />;
}
