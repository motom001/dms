import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { rueckfrage } from './rueckfrage';

/* Kleiner Router: der Pfad ist der Zustand, Links schieben ihn in die History. */

type Wache = () => Promise<boolean>;
let wache: Wache | null = null;

/** Nach erfolgreichem Speichern: ohne Nachfrage weiter. */
export function loeseWache() { wache = null; }

export function geheZu(pfad: string, ersetzen = false) {
  if (pfad === location.pathname + location.search) return;
  const weiter = () => {
    history[ersetzen ? 'replaceState' : 'pushState'](null, '', pfad);
    dispatchEvent(new PopStateEvent('popstate'));
  };
  // Ungespeicherte Änderungen (#355: eigene Rückfrage statt confirm): erst nach „Verwerfen“ weiter.
  if (wache) void wache().then((ok) => { if (ok) { wache = null; weiter(); } });
  else weiter();
}

export function useOrt() {
  const [ort, setOrt] = useState(() => ({ pfad: location.pathname, suche: new URLSearchParams(location.search) }));
  useEffect(() => {
    const f = () => setOrt({ pfad: location.pathname, suche: new URLSearchParams(location.search) });
    addEventListener('popstate', f);
    return () => removeEventListener('popstate', f);
  }, []);
  return ort;
}

export function Link({ to, className, children, title }: { to: string; className?: string; children: ReactNode; title?: string }) {
  const klick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    geheZu(to);
  };
  const aktiv = location.pathname === to;
  return <a href={to} onClick={klick} className={className} title={title} aria-current={aktiv ? 'page' : undefined}>{children}</a>;
}

/** Fragt vor dem Verlassen nach, solange `ungespeichert` wahr ist. */
export function useUngespeichert(ungespeichert: boolean) {
  useEffect(() => {
    if (!ungespeichert) return;
    const vorher = wache;
    wache = () => rueckfrage({ titel: 'Änderungen verwerfen?', text: 'Es gibt ungespeicherte Änderungen. Verlässt du die Seite, gehen sie verloren.', ja: 'Verwerfen und verlassen', nein: 'Hierbleiben', gefahr: true });
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    addEventListener('beforeunload', unload);
    return () => { wache = vorher; removeEventListener('beforeunload', unload); };
  }, [ungespeichert]);
}
