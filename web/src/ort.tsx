import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { rueckfrage } from './rueckfrage';
import { t } from './sprache';

/* Kleiner Router: der Pfad ist der Zustand, Links schieben ihn in die History. */

/** Formulare mit ungespeicherten Änderungen; mehrere auf einer Seite gehen (#370). */
const wachen = new Set<object>();
const wache = () =>
  rueckfrage({
    titel: t('oberflaeche.ort.aenderungen-verwerfen'),
    text: t('oberflaeche.ort.es-gibt-ungespeicherte-aenderungen'),
    ja: t('oberflaeche.ort.verwerfen-und-verlassen'),
    nein: t('oberflaeche.ort.hierbleiben'),
    gefahr: true,
  });

/** Nach erfolgreichem Speichern: ohne Nachfrage weiter. */
export function loeseWache() {
  wachen.clear();
}

export function geheZu(pfad: string, ersetzen = false) {
  if (pfad === location.pathname + location.search) return;
  const weiter = () => {
    history[ersetzen ? 'replaceState' : 'pushState'](null, '', pfad);
    dispatchEvent(new PopStateEvent('popstate'));
  };
  // Ungespeicherte Änderungen (#355: eigene Rückfrage statt confirm): erst nach „Verwerfen“ weiter.
  if (wachen.size)
    void darfVerlassen().then((ok) => {
      if (ok) weiter();
    });
  else weiter();
}

/** Für Wechsel ohne neuen Pfad (z. B. Reiter): fragt nach, wenn Ungespeichertes offen ist. */
export async function darfVerlassen(): Promise<boolean> {
  if (!wachen.size) return true;
  const ok = await wache();
  if (ok) wachen.clear();
  return ok;
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

/** `anker`: fester Ankerpunkt für Rundgänge und Tipps (#831, `data-anker`). */
export function Link({
  to,
  className,
  children,
  title,
  anker,
}: {
  to: string;
  className?: string;
  children: ReactNode;
  title?: string;
  anker?: string;
}) {
  const klick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    geheZu(to);
  };
  const aktiv = location.pathname === to;
  return (
    <a href={to} onClick={klick} className={className} title={title} aria-current={aktiv ? 'page' : undefined} data-anker={anker}>
      {children}
    </a>
  );
}

/** Fragt vor dem Verlassen nach, solange `ungespeichert` wahr ist. */
export function useUngespeichert(ungespeichert: boolean) {
  useEffect(() => {
    if (!ungespeichert) return;
    const marke = {};
    wachen.add(marke);
    const unload = (e: BeforeUnloadEvent) => {
      if (wachen.has(marke)) e.preventDefault();
    };
    addEventListener('beforeunload', unload);
    return () => {
      wachen.delete(marke);
      removeEventListener('beforeunload', unload);
    };
  }, [ungespeichert]);
}
