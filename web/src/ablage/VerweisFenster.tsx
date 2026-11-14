import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Mappentyp } from '../../../shared/src/model';
import { typName } from '../../../shared/src/beschriftung';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { Knopf } from '../bausteine';
import { BrueckeKontext, useBruecke, type Bruecke, type FormularAnschluss, type Nutzlast } from './bruecke';

/**
 * Fenster „+ … anlegen“ an einem Verweisfeld (#935): eine neue Mappe des Zieltyps anlegen, ohne die Seite zu verlassen –
 * etwa mitten in einer ungespeicherten Mappe auf der Seite „Dokument übernehmen“. Klein, verschiebbar (am Kopf ziehen),
 * über der Seite; darin die Mappe wie rechts in der Ablage: Kopf, Register, Felder, Speicherleiste (das Formular gibt
 * der Aufrufer über `children`).
 *
 * - Nicht modal: Das Dokument dahinter bleibt bedienbar. Auf der Seite „Dokument übernehmen“ gehen Ziehen, Anklicken
 *   von Rahmen und markierter Text in das zuletzt gewählte Feld des Fensters (eigene Brücke, angemeldet über
 *   `fenster()` der Seite).
 * - Tastatur: Beim Öffnen steht der Fokus im ersten Feld; Esc schließt (wie „Abbrechen“ und ✕, ohne Änderung), danach
 *   steht der Fokus wieder am Verweisfeld (`zurueck`).
 * - Liegt als Portal am Ende der Seite (ein Formular im Formular gäbe es sonst). React reicht Ereignisse trotzdem durch
 *   den Komponentenbaum nach oben – Absenden, Tasten, Ziehen und Fokus enden deshalb am Fenster, sonst speicherte etwa
 *   „Mappe speichern“ im Fenster auch die Mappe dahinter.
 */
export function VerweisFenster({ ziel, zurueck, schliessen, children }: {
  ziel: Mappentyp;
  /** Wohin der Fokus nach dem Schließen geht (der Eintrag „+ … anlegen“ am Verweisfeld). */
  zurueck: RefObject<HTMLElement | null>;
  schliessen(): void;
  children: ReactNode;
}) {
  const titelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const aussen = useBruecke();
  const innen = useFensterBruecke(aussen, ziel);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const zieht = useRef<{ dx: number; dy: number } | null>(null);

  // Fokus ins Fenster, beim Schließen zurück ans Verweisfeld.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.registerinhalt input:not([type="hidden"]):not([disabled]), .registerinhalt select, .registerinhalt textarea');
    (el ?? ref.current)?.focus();
    const z = zurueck.current;
    return () => { window.setTimeout(() => z?.focus(), 0); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Fokus nur beim Öffnen setzen und beim Schließen zurückgeben

  /** Im sichtbaren Bereich halten (auch nach dem Drehen des Handys). */
  const begrenze = useCallback((x: number, y: number) => {
    const el = ref.current;
    const b = el?.offsetWidth ?? 0, h = el?.offsetHeight ?? 0;
    return { x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - b - 8)), y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - Math.min(h, 120) - 8)) };
  }, []);
  useEffect(() => {
    const neu = () => setPos((p) => (p ? begrenze(p.x, p.y) : p));
    window.addEventListener('resize', neu);
    return () => window.removeEventListener('resize', neu);
  }, [begrenze]);

  function greife(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button > 0 || (e.target as HTMLElement).closest('button')) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    zieht.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function ziehe(e: ReactPointerEvent<HTMLDivElement>) {
    if (!zieht.current) return;
    setPos(begrenze(e.clientX - zieht.current.dx, e.clientY - zieht.current.dy));
  }
  function lasse(e: ReactPointerEvent<HTMLDivElement>) {
    if (!zieht.current) return;
    zieht.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // Ereignisse enden am Fenster (siehe oben); Esc schließt, außer eine offene Vorschlagsliste ist gemeint.
  const halt = (e: SyntheticEvent) => e.stopPropagation();
  const taste = (e: ReactKeyboardEvent) => {
    e.stopPropagation();
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if ((e.target as HTMLElement).getAttribute('aria-expanded') === 'true') return;
    e.preventDefault();
    schliessen();
  };

  return createPortal(
    <BrueckeKontext.Provider value={innen}>
      <div ref={ref} className={`verweisfenster${pos ? ' verschoben' : ''}`} role="dialog" aria-modal="false" aria-labelledby={titelId} tabIndex={-1}
        style={pos ? { left: pos.x, top: pos.y } : undefined} data-anker="verweisfenster"
        onSubmit={halt} onKeyDown={taste} onClick={halt} onPointerDown={halt} onFocus={halt} onBlur={halt}
        onDragEnter={halt} onDragOver={halt} onDragLeave={halt} onDrop={halt} onMouseOver={halt}>
        <div className="vf-griff" onPointerDown={greife} onPointerMove={ziehe} onPointerUp={lasse} onPointerCancel={lasse} title={t('ablage.fenster.verschieben')}>
          <span className="vf-titel" id={titelId}>{t('ablage.fenster.titel', { typ: typName(ziel) })}</span>
          <Knopf art="link" className="vf-zu" nurSymbol={t('ablage.mappeformular.schliessen')} onClick={schliessen}><Symbol name="schliessen" /></Knopf>
        </div>
        <div className="vf-inhalt spalte mappe">{children}</div>
      </div>
    </BrueckeKontext.Provider>,
    document.body,
  );
}

/**
 * Eigene Brücke des Fensters (#935): Felder darin leuchten nicht mit Rahmen der Seite auf (die gehören zur Mappe
 * dahinter), merken sich aber ihr zuletzt gewähltes Feld und nehmen Werte vom Dokument – über die Seite, damit Prüfung
 * und Meldungen dieselben sind. Ohne Seite (überall sonst) gibt es keine Brücke, das Formular verhält sich wie immer.
 */
function useFensterBruecke(aussen: Bruecke | null, ziel: Mappentyp): Bruecke | null {
  const [aktiv, setAktiv] = useState<string | null>(null);
  const anschluss = useRef<FormularAnschluss | null>(null);
  const aktivRef = useRef<string | null>(null);
  aktivRef.current = aktiv;
  const anschliessen = useCallback((a: FormularAnschluss) => { anschluss.current = a; return () => { if (anschluss.current === a) anschluss.current = null; }; }, []);
  const nimm = useCallback((f: Parameters<Bruecke['nimm']>[0], n: Nutzlast) => {
    if (aussen && anschluss.current) aussen.nimm(f, n, anschluss.current);
  }, [aussen]);
  const fenster = aussen?.fenster;
  useEffect(() => {
    if (!fenster) return;
    fenster((n) => {
      const f = aktivRef.current ? ziel.felder.find((x) => x.key === aktivRef.current) : undefined;
      if (!f) return false;
      nimm(f, n);
      return true;
    });
    return () => fenster(null);
  }, [fenster, ziel, nimm]);
  return useMemo<Bruecke | null>(() => (aussen ? {
    marken: [], hervor: null, setHervor: () => {}, aktiv, setAktiv, nimm, anschliessen, unterFeld: () => null, fenster: () => {},
  } : null), [aussen, aktiv, nimm, anschliessen]);
}
