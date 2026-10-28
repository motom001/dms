import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Drag & Drop für Listen und Bäume (#73, #74) – mit Maus, Touch (langes Antippen des Griffs)
 * und Tastatur (Alt+Pfeiltasten am Griff). Gezogen wird nur am Griff (⠿); ein Klick auf den
 * Eintrag selbst bleibt ein Klick.
 *
 *   const z = useZiehen({ fertig: (quelle, ziel, ort) => … });
 *   <li {...z.eintrag(id)}><button {...z.griff(id, name)} onKeyDown={…} /> …</li>
 *
 * Einträge einer Liste teilen sich eine Gruppe (je Aufruf von useZiehen). Weitere Ablagen
 * (z. B. Register, auf die man Felder zieht) bekommen z.ablage(id).
 */
export type Ort = 'vor' | 'nach' | 'in';

interface Optionen {
  /** Darf hier abgelegt werden? (z. B. keine Sicht in ihre eigene Untersicht) */
  erlaubt?: (quelle: string, ziel: string, ort: Ort) => boolean;
  /** Baum: die Mitte eines Eintrags heißt „hinein“ (als Kind). */
  hinein?: boolean;
  fertig: (quelle: string, ziel: string, ort: Ort) => void;
}

interface Zug { quelle: string; ziel?: string; ort?: Ort }

const LANG_DRUECKEN = 350;
const SCHWELLE_MAUS = 4;
const SCHWELLE_TOUCH = 10;

/** Nächster scrollbarer Vorfahr (für automatisches Scrollen am Rand). */
function scrollbarerVorfahr(el: HTMLElement | null): HTMLElement | null {
  for (let x = el?.parentElement ?? null; x; x = x.parentElement) {
    const s = getComputedStyle(x);
    if (/(auto|scroll)/.test(s.overflowY) && x.scrollHeight > x.clientHeight) return x;
  }
  return null;
}

export function useZiehen(o: Optionen) {
  const gruppe = useId();
  const [zug, setZug] = useState<Zug | null>(null);
  const opt = useRef(o);
  opt.current = o;
  const zugRef = useRef<Zug | null>(null);
  const aufraeumen = useRef<(() => void) | null>(null);
  useEffect(() => () => aufraeumen.current?.(), []);

  const zielBei = useCallback((quelle: string, x: number, y: number): { ziel: string; ort: Ort } | null => {
    const sel = `[data-zieh-gruppe="${CSS.escape(gruppe)}"], [data-zieh-ablage="${CSS.escape(gruppe)}"]`;
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(sel);
    if (!el) return null;
    const id = el.dataset.ziehId!;
    let ort: Ort;
    if (el.dataset.ziehAblage) ort = 'in';
    else {
      if (id === quelle) return null;
      const r = el.getBoundingClientRect();
      const rel = (y - r.top) / Math.max(1, r.height);
      ort = opt.current.hinein ? (rel < 0.28 ? 'vor' : rel > 0.72 ? 'nach' : 'in') : rel < 0.5 ? 'vor' : 'nach';
    }
    if (opt.current.erlaubt && !opt.current.erlaubt(quelle, id, ort)) return null;
    return { ziel: id, ort };
  }, [gruppe]);

  const setze = (z: Zug | null) => { zugRef.current = z; setZug(z); };

  function onPointerDown(id: string, e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    aufraeumen.current?.();
    const griff = e.currentTarget;
    const touch = e.pointerType !== 'mouse';
    const x0 = e.clientX, y0 = e.clientY;
    let aktiv = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scroller = scrollbarerVorfahr(griff);
    let rand: ReturnType<typeof setInterval> | undefined;
    let letztesY = y0;

    const beginne = () => {
      aktiv = true;
      try { griff.setPointerCapture(e.pointerId); } catch { /* egal */ }
      setze({ quelle: id });
      if (touch && navigator.vibrate) navigator.vibrate(15);
      // Am Rand des scrollbaren Bereichs weiterscrollen.
      rand = setInterval(() => {
        const r = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const d = letztesY < r.top + 40 ? -12 : letztesY > r.bottom - 40 ? 12 : 0;
        if (d) (scroller ?? window).scrollBy(0, d);
      }, 30);
    };
    if (touch) timer = setTimeout(beginne, LANG_DRUECKEN);

    const bewege = (ev: PointerEvent) => {
      const weit = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (!aktiv) {
        if (touch) { if (weit > SCHWELLE_TOUCH) ende(); return; }
        if (weit < SCHWELLE_MAUS) return;
        beginne();
      }
      ev.preventDefault();
      letztesY = ev.clientY;
      const t = zielBei(id, ev.clientX, ev.clientY);
      const alt = zugRef.current;
      if (alt?.ziel !== t?.ziel || alt?.ort !== t?.ort) setze({ quelle: id, ...(t ?? {}) });
    };
    const loslassen = () => {
      const z = zugRef.current;
      ende();
      if (aktiv && z?.ziel && z.ort) opt.current.fertig(z.quelle, z.ziel, z.ort);
    };
    const taste = (ev: globalThis.KeyboardEvent) => { if (ev.key === 'Escape') ende(); };
    const ende = () => {
      clearTimeout(timer); clearInterval(rand);
      window.removeEventListener('pointermove', bewege);
      window.removeEventListener('pointerup', loslassen);
      window.removeEventListener('pointercancel', ende);
      window.removeEventListener('keydown', taste);
      aufraeumen.current = null;
      setze(null);
    };
    window.addEventListener('pointermove', bewege, { passive: false });
    window.addEventListener('pointerup', loslassen);
    window.addEventListener('pointercancel', ende);
    window.addEventListener('keydown', taste);
    aufraeumen.current = ende;
  }

  const klasse = (id: string) => (!zug ? '' : zug.quelle === id ? 'gezogen' : zug.ziel === id ? `zieh-${zug.ort}` : '');

  return {
    /** Gerade gezogen? */
    aktiv: zug !== null,
    griff: (id: string, name: string) => ({
      type: 'button' as const,
      className: 'ziehgriff',
      'aria-label': `${name} verschieben`,
      title: 'Ziehen zum Verschieben (Touch: lange drücken) – per Tastatur mit Alt+Pfeiltasten',
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(id, e),
      onClick: (e: React.MouseEvent) => e.preventDefault(),
    }),
    eintrag: (id: string) => ({ 'data-zieh-gruppe': gruppe, 'data-zieh-id': id, className: klasse(id) }),
    ablage: (id: string) => ({ 'data-zieh-ablage': gruppe, 'data-zieh-id': id, className: zug && zug.ziel === id ? 'zieh-in' : zug ? 'zieh-bereit' : '' }),
  };
}

/** Alt+Pfeiltasten am Griff: ↑/↓ verschieben, → hinein (Untersicht), ← heraus (eine Ebene höher). */
export function ziehTasten(e: KeyboardEvent, f: { hoch?: () => void; runter?: () => void; rein?: () => void; raus?: () => void }) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  const fn = ({ ArrowUp: f.hoch, ArrowDown: f.runter, ArrowRight: f.rein, ArrowLeft: f.raus } as Record<string, (() => void) | undefined>)[e.key];
  if (fn) { e.preventDefault(); fn(); }
}

/** Neue Reihenfolge: Eintrag von `von` vor bzw. nach den Eintrag `ziel` setzen. */
export function umgestellt<T>(liste: T[], von: number, ziel: number, ort: 'vor' | 'nach'): T[] {
  if (von < 0 || ziel < 0 || von === ziel) return liste;
  const n = [...liste];
  const [x] = n.splice(von, 1);
  const z = ziel > von ? ziel - 1 : ziel;
  n.splice(ort === 'vor' ? z : z + 1, 0, x);
  return n;
}

/** Ansage für Screenreader, z. B. „Rechnungen steht jetzt an Stelle 2.“ */
export function Ansage({ text }: { text: string }) {
  return <p className="sr" role="status" aria-live="polite">{text}</p>;
}
