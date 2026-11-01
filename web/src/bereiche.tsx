import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useKonto } from './konto';

/**
 * Verschiebbare und einklappbare Bereiche der Dreiteilung (#23).
 *
 * Zwei Griffe („Picker“) sitzen mittig auf den Trennlinien:
 *   links:  zwischen Sichten und Liste  – ziehen ändert die Breite der Sichten, kurz klicken klappt sie ein/aus
 *   rechts: zwischen Liste und Mappe    – ziehen ändert die Breite der Liste,   kurz klicken klappt die Mappe ein/aus
 * Gemerkt wird je Benutzer und Gerät (localStorage mit der Benutzer-Id im Schlüssel).
 * Auf schmalen Bildschirmen (Handy) bleibt die Einzelansicht ohne Griffe.
 */
export type Ort = 'ablage' | 'werkbank';
interface Stand { l: number; m: number; linksZu: boolean; rechtsZu: boolean }

const SCHMAL = 820;
const MIN_L = 140, MAX_L = 420, MIN_M = 240, MIN_RECHTS = 320;
const RESET = 'dms:bereiche-zurueckgesetzt';
const schluessel = (ort: Ort, benutzer: string) => `dms:bereiche:${ort}:${benutzer}`;

function standard(): Stand {
  const mittel = typeof innerWidth === 'number' && innerWidth <= 1100;
  return { l: mittel ? 180 : 220, m: mittel ? 280 : 340, linksZu: false, rechtsZu: false };
}
function lies(k: string): Stand {
  try { const s = JSON.parse(localStorage.getItem(k) ?? 'null') as Partial<Stand> | null; if (s) return { ...standard(), ...s }; } catch { /* Speicher nicht verfügbar */ }
  return standard();
}

/** Für das Profil: gemerkte Breiten dieses Benutzers auf diesem Gerät löschen. */
export function bereicheZuruecksetzen(benutzer: string) {
  for (const ort of ['ablage', 'werkbank'] as Ort[]) { try { localStorage.removeItem(schluessel(ort, benutzer)); } catch { /* egal */ } }
  dispatchEvent(new Event(RESET));
}

export function Dreiteilung({ ort, ebene, offen, mitte = true, rechts = true, children }: {
  ort: Ort; ebene: string;
  /** Was rechts geöffnet ist; wechselt es, wird ein eingeklappter rechter Bereich wieder gezeigt. */
  offen?: string;
  /** Ohne Mitte (#366): links die Bereiche, rechts die ganze Seite – ohne rechten Griff. */
  mitte?: boolean;
  /**
   * Ohne rechten Bereich (#429, Startseite ohne geöffnete Mappe): die Mitte nimmt die ganze
   * restliche Breite – gleiche Regel wie #366, nur von der anderen Seite. Am Handy unverändert.
   */
  rechts?: boolean;
  children: [ReactNode, ReactNode, ReactNode];
}) {
  const { ich } = useKonto();
  const k = schluessel(ort, ich.id);
  const [s, setS] = useState<Stand>(() => lies(k));
  const [breit, setBreit] = useState(() => innerWidth > SCHMAL);
  const rahmen = useRef<HTMLDivElement>(null);

  useEffect(() => { setS(lies(k)); }, [k]);
  useEffect(() => {
    const f = () => setS(lies(k));
    addEventListener(RESET, f);
    return () => removeEventListener(RESET, f);
  }, [k]);
  useEffect(() => {
    const f = () => setBreit(innerWidth > SCHMAL);
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);

  const merke = useCallback((n: Stand) => {
    setS(n);
    try { localStorage.setItem(k, JSON.stringify(n)); } catch { /* nur für diese Sitzung */ }
  }, [k]);

  // Eine Mappe (oder ein Eintrag) wird geöffnet, während rechts eingeklappt ist: wieder einblenden.
  const vorher = useRef(offen);
  useEffect(() => {
    if (offen && offen !== vorher.current && s.rechtsZu) merke({ ...s, rechtsZu: false });
    vorher.current = offen;
  }, [offen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Liste nie so breit, dass für die Mappe weniger als MIN_RECHTS bleibt.
  const gesamt = rahmen.current?.clientWidth ?? innerWidth;
  const l = s.linksZu ? 0 : Math.min(MAX_L, Math.max(MIN_L, s.l));
  const m = Math.max(MIN_M, Math.min(s.m, gesamt - l - MIN_RECHTS));
  const rechtsZu = s.rechtsZu && mitte && rechts;
  const spalten = !mitte || !rechts ? `${l}px minmax(0, 1fr)` : rechtsZu ? `${l}px minmax(0, 1fr) 0` : `${l}px ${m}px minmax(0, 1fr)`;
  const style = breit ? ({ gridTemplateColumns: spalten } as CSSProperties) : undefined;

  return (
    <div ref={rahmen} className={`drei ${s.linksZu ? 'links-zu' : ''} ${rechtsZu ? 'rechts-zu' : ''} ${mitte ? '' : 'ohne-mitte'} ${rechts ? '' : 'ohne-rechts'}`} data-ebene={ebene} style={style}>
      {children[0]}
      {mitte && children[1]}
      {(rechts || !mitte) && children[2]}
      {breit && <>
        <Griff seite="links" x={l} zu={s.linksZu} wert={l}
          titel={s.linksZu ? 'Ansichten einblenden' : 'Ansichten ausblenden (ziehen ändert die Breite)'}
          ziehe={(dx, start) => merke({ ...s, linksZu: false, l: Math.min(MAX_L, Math.max(MIN_L, start + dx)) })}
          start={() => (s.linksZu ? MIN_L : l)}
          umschalten={() => merke({ ...s, linksZu: !s.linksZu })}
          zuruecksetzen={() => merke({ ...s, linksZu: false, l: standard().l })} />
        {mitte && rechts && <Griff seite="rechts" x={s.rechtsZu ? gesamt : l + m} zu={s.rechtsZu} wert={m}
          titel={s.rechtsZu ? 'Mappe einblenden' : 'Mappe ausblenden (ziehen ändert die Breite der Liste)'}
          ziehe={(dx, start) => merke({ ...s, rechtsZu: false, m: Math.max(MIN_M, Math.min(start + dx, gesamt - l - MIN_RECHTS)) })}
          start={() => (s.rechtsZu ? gesamt - l - MIN_RECHTS : m)}
          umschalten={() => merke({ ...s, rechtsZu: !s.rechtsZu })}
          zuruecksetzen={() => merke({ ...s, rechtsZu: false, m: standard().m })} />}
      </>}
    </div>
  );
}

function Griff(p: {
  seite: 'links' | 'rechts'; x: number; zu: boolean; wert: number; titel: string;
  ziehe(dx: number, start: number): void; start(): number; umschalten(): void; zuruecksetzen(): void;
}) {
  const zug = useRef<{ x: number; start: number; bewegt: boolean } | null>(null);
  const runter = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    zug.current = { x: e.clientX, start: p.start(), bewegt: false };
  };
  const bewegen = (e: PointerEvent<HTMLButtonElement>) => {
    const z = zug.current;
    if (!z) return;
    const dx = e.clientX - z.x;
    if (!z.bewegt && Math.abs(dx) < 4) return;
    z.bewegt = true;
    document.body.classList.add('zieht-bereich');
    p.ziehe(dx, z.start);
  };
  const hoch = () => {
    const z = zug.current;
    zug.current = null;
    document.body.classList.remove('zieht-bereich');
    if (z && !z.bewegt) p.umschalten();
  };
  const taste = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); p.ziehe(e.key === 'ArrowLeft' ? -20 : 20, p.start()); }
    if (e.key === 'Home') { e.preventDefault(); p.zuruecksetzen(); }
  };
  // Eingeklappt zeigt der Pfeil, wohin der Bereich beim Klick aufgeht.
  const nachLinks = p.seite === 'rechts';
  return (
    <button type="button" className={`griff griff-${p.seite} ${p.zu ? 'zu' : ''}`} style={{ left: p.x }}
      role="separator" aria-orientation="vertical" aria-valuenow={Math.round(p.wert)} aria-label={p.titel} title={`${p.titel}. Doppelklick: Standardbreite.`}
      onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}
      onDoubleClick={p.zuruecksetzen} onKeyDown={taste} onClick={(e) => { if (e.detail === 0) p.umschalten(); }}>
      {/* Offen: zwei gegenläufige Pfeile (ziehen oder einklappen); eingeklappt: Pfeil zum Aufklappen. */}
      <svg viewBox="0 0 12 28" width="12" height="28" aria-hidden="true">
        {p.zu
          ? (nachLinks ? <path d="M8 8 4 14l4 6" /> : <path d="M4 8l4 6-4 6" />)
          : <><path d="M5 4 2 9l3 5" /><path d="M7 14l3 5-3 5" /></>}
      </svg>
    </button>
  );
}
