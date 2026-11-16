import type { ReactNode } from 'react';
import type { Hilfeort } from '../../shared/src/hilfe';
import { Hilfe } from './Hilfe';

/**
 * Kopf über einer Liste in Ablage und Werkbank (#601): Überschrift mit dem Hilfe-Symbol direkt dahinter,
 * darunter die Beschreibung (falls es eine gibt), rechts Knöpfe wie „+ Neu“ (children).
 * Alle Listenköpfe nutzen diese Komponente, damit das „?“ überall an derselben Stelle steht –
 * auch ohne Beschreibung und am Handy, wo die Beschreibung ausgeblendet ist.
 */
export function Listenkopf({
  titel,
  hilfe,
  beschreibung,
  className,
  children,
}: {
  titel: ReactNode;
  hilfe?: Hilfeort;
  beschreibung?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className ? `listenkopf ${className}` : 'listenkopf'}>
      <div>
        <h1>
          {titel}
          {hilfe && (
            <>
              {' '}
              <Hilfe ort={hilfe} />
            </>
          )}
        </h1>
        {beschreibung && <p className="leise klein">{beschreibung}</p>}
      </div>
      {children}
    </div>
  );
}
