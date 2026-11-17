/** Auswahl mehrerer Mappen (#149, #1279). */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Mappe } from '../../../../shared/src/model';

/* ---------- Auswahl mehrerer Mappen (#149) ---------- */

export type Auswahl = ReturnType<typeof useAuswahl>;

/**
 * Auswahl in einer Liste: Haken je Zeile, Bereich mit Shift, „Alle Treffer“ über Seiten hinweg.
 * Am Handy wählt langes Drücken; solange etwas gewählt ist, schaltet Tippen um. Neue Sicht oder Suche → leer.
 */
export function useAuswahl(mappen: Mappe[], gesamt: number | null, abhaengig: unknown[]) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [alle, setAlle] = useState(false);
  const anker = useRef<number | null>(null);
  const lang = useRef<{ t?: number; ausgeloest?: boolean }>({});
  const schluessel = JSON.stringify(abhaengig);
  useEffect(() => {
    setGewaehlt(new Set());
    setAlle(false);
    anker.current = null;
  }, [schluessel]);
  const waehle = (i: number, an: boolean, bereich: boolean) => {
    const von = bereich && anker.current !== null ? Math.min(anker.current, i) : i;
    const bis = bereich && anker.current !== null ? Math.max(anker.current, i) : i;
    setGewaehlt((x) => {
      const n = new Set(x);
      for (let j = von; j <= bis; j++) {
        const m = mappen[j];
        if (m && !m.verborgen) {
          if (an) n.add(m.id);
          else n.delete(m.id);
        }
      }
      return n;
    });
    anker.current = i;
    setAlle(false);
  };
  const setze = (ids: string[], alleTreffer: boolean) => {
    setGewaehlt(new Set(ids));
    setAlle(alleTreffer && ids.length >= (gesamt ?? 0));
  };
  const leeren = () => {
    setGewaehlt(new Set());
    setAlle(false);
    anker.current = null;
  };
  /** Langes Drücken (Handy) wählt; mit Auswahl schaltet Tippen um statt die Mappe zu öffnen. */
  const druck = (i: number) => ({
    onTouchStart: () => {
      window.clearTimeout(lang.current.t);
      lang.current = {
        t: window.setTimeout(() => {
          lang.current.ausgeloest = true;
          const m = mappen[i];
          if (m) waehle(i, !gewaehlt.has(m.id), false);
          navigator.vibrate?.(20);
        }, 500),
      };
    },
    onTouchMove: () => window.clearTimeout(lang.current.t),
    onTouchEnd: () => window.clearTimeout(lang.current.t),
    onClickCapture: (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('input, button')) return;
      const beruehrung = window.matchMedia?.('(pointer: coarse)').matches;
      if (lang.current.ausgeloest || (beruehrung && gewaehlt.size > 0)) {
        e.preventDefault();
        e.stopPropagation();
        if (!lang.current.ausgeloest) {
          const m = mappen[i];
          if (m) waehle(i, !gewaehlt.has(m.id), false);
        }
        lang.current.ausgeloest = false;
      }
    },
    onContextMenu: (e: MouseEvent) => {
      if (lang.current.ausgeloest) e.preventDefault();
    },
  });
  return { gewaehlt, alle, waehle, setze, leeren, druck };
}
