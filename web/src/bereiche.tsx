import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useKonto } from './konto';
import { t } from './sprache';
import { Symbol } from './Symbol';

/**
 * Verschiebbare und einklappbare Bereiche der Dreiteilung (#23).
 *
 * Zwei Griffe sitzen mittig auf den Trennlinien:
 *   links:  zwischen Ansichten und Liste – ziehen ändert die Breite der Ansichten, kurz klicken klappt sie ein
 *   rechts: zwischen Liste und Mappe     – ziehen ändert die Breite der Liste,     kurz klicken klappt die Mappe ein
 * Der Pfeil im Griff zeigt, wohin die Spalte verschwindet (#536). Eingeklappt bleibt am Rand eine schmale,
 * beschriftete Lasche („Ansichten“, „Mappe“ bzw. der Titel der geöffneten Mappe); ein Klick darauf öffnet
 * die Spalte wieder. Gemerkt wird je Benutzer und Gerät (localStorage mit der Benutzer-Id im Schlüssel);
 * eine neu geöffnete Mappe klappt die rechte Spalte aber immer auf.
 * Auf schmalen Bildschirmen (Handy) bleibt die Einzelansicht ohne Griffe.
 */
export type Ort = 'ablage' | 'werkbank';
interface Stand { l: number; m: number; linksZu: boolean; rechtsZu: boolean }

const SCHMAL = 820;
const MIN_L = 140, MAX_L = 420, MIN_M = 240, MIN_RECHTS = 320;
/** Breite der Lasche einer eingeklappten Spalte (#536). */
const LASCHE = 32;
/** Längster Titel auf der Lasche; länger wird mit „…“ gekürzt. */
const TITEL_MAX = 40;
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
  // Auch dieselbe Mappe noch einmal aus der Liste öffnen klappt rechts auf (#536): Die Adresse ändert sich
  // dann nicht, deshalb zählt hier jeder Klick auf einen Link in der Mitte.
  const linkInMitte = (e: MouseEvent<HTMLDivElement>) => {
    if (!s.rechtsZu || !(e.target instanceof Element)) return;
    const a = e.target.closest('a[href]');
    if (a && a.closest('.spalte.liste')) merke({ ...s, rechtsZu: false });
  };

  const rechtsZu = s.rechtsZu && mitte && rechts;
  // Titel der geöffneten Mappe für die Lasche (#536): aus der Überschrift der rechten Spalte, die eingeklappt
  // weiter da ist (nur unsichtbar) und ihre Daten selbst nachlädt.
  const [titel, setTitel] = useState('');
  useEffect(() => {
    const spalte = rahmen.current?.querySelector('.spalte.mappe');
    if (!rechtsZu || !offen || !spalte) { setTitel(''); return; }
    const lies = () => setTitel((spalte.querySelector('h1')?.textContent ?? '').trim());
    lies();
    const beobachter = new MutationObserver(lies);
    beobachter.observe(spalte, { childList: true, subtree: true, characterData: true });
    return () => beobachter.disconnect();
  }, [rechtsZu, offen]);

  // Liste nie so breit, dass für die Mappe weniger als MIN_RECHTS bleibt.
  const gesamt = rahmen.current?.clientWidth ?? innerWidth;
  const l = s.linksZu ? LASCHE : Math.min(MAX_L, Math.max(MIN_L, s.l));
  const m = Math.max(MIN_M, Math.min(s.m, gesamt - l - MIN_RECHTS));
  const spalten = !mitte || !rechts ? `${l}px minmax(0, 1fr)` : rechtsZu ? `${l}px minmax(0, 1fr) ${LASCHE}px` : `${l}px ${m}px minmax(0, 1fr)`;
  const style = breit ? ({ gridTemplateColumns: spalten } as CSSProperties) : undefined;
  const name = (seite: 'links' | 'rechts') => t.frei(`spalten.name.${ort}.${seite}`);

  return (
    <div ref={rahmen} className={`drei ${s.linksZu ? 'links-zu' : ''} ${rechtsZu ? 'rechts-zu' : ''} ${mitte ? '' : 'ohne-mitte'} ${rechts ? '' : 'ohne-rechts'}`} data-ebene={ebene} style={style} onClickCapture={linkInMitte}>
      {children[0]}
      {mitte && children[1]}
      {(rechts || !mitte) && children[2]}
      {breit && <>
        {s.linksZu
          ? <Lasche seite="links" name={name('links')} oeffnen={() => merke({ ...s, linksZu: false })} />
          : <Griff seite="links" x={l} wert={l} name={name('links')}
            ziehe={(dx, start) => merke({ ...s, l: Math.min(MAX_L, Math.max(MIN_L, start + dx)) })}
            start={() => l}
            einklappen={() => merke({ ...s, linksZu: true })}
            zuruecksetzen={() => merke({ ...s, linksZu: false, l: standard().l })} />}
        {mitte && rechts && (rechtsZu
          ? <Lasche seite="rechts" name={name('rechts')} titel={titel} oeffnen={() => merke({ ...s, rechtsZu: false })} />
          : <Griff seite="rechts" x={l + m} wert={m} name={name('rechts')}
            ziehe={(dx, start) => merke({ ...s, m: Math.max(MIN_M, Math.min(start + dx, gesamt - l - MIN_RECHTS)) })}
            start={() => m}
            einklappen={() => merke({ ...s, rechtsZu: true })}
            zuruecksetzen={() => merke({ ...s, rechtsZu: false, m: standard().m })} />)}
      </>}
    </div>
  );
}

/**
 * Eingeklappte Spalte (#536): schmale Leiste am Rand über die ganze Höhe, mit Pfeil in die Richtung, in die
 * die Spalte aufgeht, und senkrechter Beschriftung. Klick, Enter oder Leertaste öffnen die Spalte wieder.
 */
function Lasche({ seite, name, titel, oeffnen }: { seite: 'links' | 'rechts'; name: string; titel?: string; oeffnen(): void }) {
  const kurz = titel && titel.length > TITEL_MAX ? `${titel.slice(0, TITEL_MAX - 1).trimEnd()} …` : titel;
  const text = titel ? t('spalten.lasche.aufklappen.titel', { name, titel }) : t('spalten.lasche.aufklappen', { name });
  return (
    <button type="button" className={`spl-lasche spl-lasche-${seite}`} onClick={oeffnen} aria-label={text} title={text}>
      <Symbol name={seite === 'links' ? 'pfeil-rechts' : 'pfeil-links'} />
      <span className="spl-lasche-text">{kurz || name}</span>
    </button>
  );
}

function Griff(p: {
  seite: 'links' | 'rechts'; x: number; wert: number; name: string;
  ziehe(dx: number, start: number): void; start(): number; einklappen(): void; zuruecksetzen(): void;
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
    if (z && !z.bewegt) p.einklappen();
  };
  const taste = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); p.ziehe(e.key === 'ArrowLeft' ? -20 : 20, p.start()); }
    if (e.key === 'Home') { e.preventDefault(); p.zuruecksetzen(); }
  };
  // Der Pfeil zeigt, wohin die Spalte beim Einklappen verschwindet (#536): links nach links, rechts nach rechts.
  return (
    <button type="button" className={`griff griff-${p.seite}`} style={{ left: p.x }}
      role="separator" aria-orientation="vertical" aria-valuenow={Math.round(p.wert)} aria-label={t('spalten.griff.einklappen', { name: p.name })} title={t('spalten.griff.ziehen', { name: p.name })}
      onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}
      onDoubleClick={p.zuruecksetzen} onKeyDown={taste} onClick={(e) => { if (e.detail === 0) p.einklappen(); }}>
      <Symbol name={p.seite === 'links' ? 'pfeil-links' : 'pfeil-rechts'} />
    </button>
  );
}
