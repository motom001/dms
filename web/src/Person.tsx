import { createContext, useContext, type ReactNode } from 'react';
import type { Person as PersonDaten } from './api/konto';
import { abwesenheitText, useDaten } from './daten';
import { useSichtbarkeit } from './sichtbarkeit';
import { Link } from './ort';
import { t } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';

/** In der Druckansicht stehen Namen als reiner Text (#65). */
const OhneLinks = createContext(false);
export const NamenOhneLinks = ({ children }: { children: ReactNode }) => <OhneLinks.Provider value>{children}</OhneLinks.Provider>;

/** Ein deaktivierter Mensch (#663) – Dienst- und Systemkonten zählen nicht, sie sind nie „aktiv“. */
export const istDeaktiviert = (p: PersonDaten | undefined): boolean => !!p && p.aktiv === false && !p.art;

/** Tooltip „deaktiviert seit …“ (#663). */
export const deaktiviertTitel = (p: PersonDaten) => (p.deaktiviert ? t('konten.deaktiviert.titel.seit', { datum: new Date(p.deaktiviert).toLocaleDateString(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric' }) }) : t('konten.deaktiviert.titel'));

/**
 * Name eines deaktivierten Benutzers (#663): kursiv und durchgestrichen, mit Tooltip und einem Zusatz
 * „(deaktiviert)“ für Screenreader – Durchstreichen allein wird nicht vorgelesen. Der Titel selbst bleibt unverändert.
 * `id` ist die Benutzer-Mappe (gleich der Benutzer-Id); bei allen anderen Mappen bleibt der Inhalt, wie er ist.
 */
export function Ehemalig({ id, children }: { id: string | null | undefined; children: ReactNode }) {
  const d = useDaten();
  const p = id ? d.personen.find((x) => x.id === id) : undefined;
  if (!p || !istDeaktiviert(p)) return <>{children}</>;
  return <span className="person-ehemalig" title={deaktiviertTitel(p)}>{children}<span className="sr">{t('konten.deaktiviert.vorlesen')}</span></span>;
}

/**
 * Ein Benutzer, der nicht unter den lesbaren ist (#888): Ablago fragt nach. Nicht sichtbar oder (noch) ohne Antwort:
 * kein Name – auch nicht der aus der Erwähnung; die Antwort ändert dann nur den Zusatz. Gelöscht (oder im Papierkorb):
 * der Name aus der Erwähnung grau mit Hinweis, sonst „gelöschter Benutzer“.
 */
function NichtLesbar({ id, ersatz, vor, className }: { id: string; ersatz?: string; vor: string; className?: string }) {
  const d = useDaten();
  const sichtbarkeit = useSichtbarkeit(id, d.geladen);
  if (sichtbarkeit === 'geloescht') return <span className={`person weg ${className ?? ''}`} title={t('oberflaeche.person.diesen-benutzer-gibt-es')}>{vor}{ersatz ?? t('oberflaeche.person.geloeschter-benutzer')}</span>;
  const verborgen = sichtbarkeit === 'verborgen';
  return <span className={`person weg verborgen-titel ${className ?? ''}`} title={verborgen ? t('oberflaeche.person.nicht-sichtbar.titel') : undefined}>{vor}{verborgen ? t('oberflaeche.person.nicht-sichtbar') : t('oberflaeche.person.benutzer')}</span>;
}

/**
 * Ein Benutzername als Link auf die Mappe des Benutzers (#65): aktueller Name. Fehlt der Benutzer unter den lesbaren,
 * unterscheidet `NichtLesbar` „nicht sichtbar“ von „gelöscht“ (#888). `vor` steht vor dem Namen (z. B. „@“).
 */
export function Person({ id, ersatz, vor = '', className }: { id: string | null | undefined; ersatz?: string; vor?: string; className?: string }) {
  const d = useDaten();
  const ohneLinks = useContext(OhneLinks);
  if (!id) return <span className={className}>{vor}{ersatz ?? t('oberflaeche.person.unbekannt')}</span>;
  const p = d.personen.find((x) => x.id === id);
  if (!p) return <NichtLesbar id={id} ersatz={ersatz} vor={vor} className={className} />;
  // Dienstkonto eines Pakets (#338): Name ohne Link, es gibt keine Benutzer-Mappe dazu.
  if (p.art === 'dienst') return <span className={`person paket ${className ?? ''}`} title={t('oberflaeche.person.paket-mit-code-dienstkonto')}>{vor}{p.name}</span>;
  // Systemkonto (#673), z. B. „Automatisierung“: ebenso ohne Mappe.
  if (p.art === 'system') return <span className={`person paket ${className ?? ''}`} title={t('konten.systemkonten.rolle.systemkonto')}>{vor}{p.name}</span>;
  const typ = d.typen.find((mappentyp) => mappentyp.system === 'benutzer');
  const name = istDeaktiviert(p) ? <span className="person-ehemalig" title={deaktiviertTitel(p)}>{p.name}<span className="sr">{t('konten.deaktiviert.vorlesen')}</span></span> : p.name;
  if (!typ || ohneLinks) return <span className={className}>{vor}{name}</span>;
  return <Link to={`/ablage/${typ.id}/${id}`} className={`person ${className ?? ''}`} title={t('oberflaeche.person.mappe-von-oeffnen', { name: p.name, wert: istDeaktiviert(p) ? ` – ${deaktiviertTitel(p)}` : p.abwesend ? ` – ${abwesenheitText(p)}` : '' })}>{vor}{name}</Link>;
}
