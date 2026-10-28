import { createContext, useContext, type ReactNode } from 'react';
import { useDaten } from './daten';
import { Link } from './ort';

/** In der Druckansicht stehen Namen als reiner Text (#65). */
const OhneLinks = createContext(false);
export const NamenOhneLinks = ({ children }: { children: ReactNode }) => <OhneLinks.Provider value>{children}</OhneLinks.Provider>;

/**
 * Ein Benutzername als Link auf die Mappe des Benutzers (#65): aktueller Name; gibt es den
 * Benutzer nicht mehr, grauer Text mit Hinweis. `vor` steht vor dem Namen (z. B. „@“).
 */
export function Person({ id, ersatz, vor = '', className }: { id: string | null | undefined; ersatz?: string; vor?: string; className?: string }) {
  const d = useDaten();
  const ohneLinks = useContext(OhneLinks);
  if (!id) return <span className={className}>{vor}{ersatz ?? 'unbekannt'}</span>;
  const p = d.personen.find((x) => x.id === id);
  if (!p) return <span className={`person weg ${className ?? ''}`} title="Diesen Benutzer gibt es nicht mehr">{vor}{ersatz ?? 'gelöschter Benutzer'}</span>;
  const typ = d.typen.find((t) => t.system === 'benutzer');
  if (!typ || ohneLinks) return <span className={className}>{vor}{p.name}</span>;
  return <Link to={`/ablage/${typ.id}/${id}`} className={`person ${className ?? ''}`} title={`Mappe von ${p.name} öffnen`}>{vor}{p.name}</Link>;
}
