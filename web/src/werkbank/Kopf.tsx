import type { ReactNode } from 'react';
import type { Hilfeort } from '../../../shared/src/hilfe';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';

/**
 * Kopf einer Werkbank-Seite. Seit #725 stehen manche frühere Bereiche als Abschnitt auf einer anderen Seite
 * (Wiederherstellen unter Sicherung, Wartungsmodus unter Wartung …): dann wird aus der Überschrift ein
 * Abschnittstitel mit Sprungmarke (`id`), damit alte Lesezeichen über `#…` an die richtige Stelle führen.
 *
 * Seiten-Hilfe (#985): `hilfe` setzt das „?“ direkt hinter die Überschrift – h1 wie Abschnitts-h2, überall mit
 * gleichem Abstand und gleicher Größe, nie am Ende der Beschreibung (children). Hilfe zu einem einzelnen Feld bleibt
 * an dessen Beschriftung (Feld, #801).
 */
export function Kopf({ titel, abschnitt, id, ueber = t('werkbank.kopf.werkbank'), hilfe, children }: { titel: ReactNode; abschnitt?: boolean; id?: string; ueber?: ReactNode; hilfe?: Hilfeort; children?: ReactNode }) {
  const mitHilfe = <>{titel}{hilfe && <> <Hilfe ort={hilfe} /></>}</>;
  if (abschnitt) {
    return (
      <div className="teilkopf" id={id}>
        <h2>{mitHilfe}</h2>
        {children}
      </div>
    );
  }
  return (
    <div className="mappenkopf" id={id}>
      <p className="ueber">{ueber}</p>
      <h1>{mitHilfe}</h1>
      {children}
    </div>
  );
}
