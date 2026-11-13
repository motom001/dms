import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import s from './Knopf.module.css';

/**
 * Gesperrt aus einem Grund (#1210, Leitsatz 6): die Erklärung am Knopf. Vorbild ist die Lösch-Erklärung der Mappe
 * (#423, #424): Grund, Liste der betroffenen Einträge, „Stattdessen“ mit Knöpfen.
 *
 * Der Knopf ist gestrichelt mit Schloss; daneben steht ein kleines ⓘ. Klick auf den Knopf oder das ⓘ öffnet die
 * Erklärung direkt am Knopf (darüber), Esc und ein Klick daneben schließen sie (Esc gibt den Fokus an den Knopf zurück). Für
 * Screenreader hängt der Grund am Knopf (`aria-describedby`), auch wenn die Erklärung zu ist. Kein „?“: Das führt ins
 * Handbuch (C7) – ⓘ erklärt genau diesen Fall in dieser Ablage.
 */
export interface KnopfSperre {
  /** Der Grund in einem Satz: „Drei Verträge verweisen auf diese Mappe.“ */
  grund: string;
  /** Fett vor dem Grund; Vorgabe „Geht gerade nicht:“. */
  titel?: string;
  /** Betroffene Einträge (z. B. Verweise als Links), als Liste unter dem Grund. */
  eintraege?: ReactNode[];
  /** Weitere Einträge, die die Liste nicht zeigt („und 4 weitere“). */
  weitere?: number;
  /** Wege, die trotzdem gehen – als Knöpfe (z. B. „Mit verknüpften Mappen löschen …“), nie als Links. */
  stattdessen?: ReactNode;
}

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

/**
 * Lage der Erklärung (#1210, Wunsch Thomas): über dem Knopf – so verlängert sie am Ende der Seite die Seite nicht.
 * Nach unten nur, wenn oben im sichtbaren Bereich nicht genug Platz ist (und unten mehr). Waagerecht nie über den
 * Bildschirmrand.
 */
function useLage(offen: boolean, gruppe: RefObject<HTMLSpanElement | null>, feld: RefObject<HTMLDivElement | null>) {
  const [lage, setLage] = useState({ oben: true, versatz: 0 });
  useLayoutEffect(() => {
    if (!offen || !gruppe.current || !feld.current || typeof window === 'undefined') return;
    const g = gruppe.current.getBoundingClientRect();
    const f = feld.current.getBoundingClientRect();
    const rand = 16;
    const platzOben = g.top - 8;
    const platzUnten = window.innerHeight - g.bottom - 8;
    const oben = platzOben >= f.height || platzOben >= platzUnten;
    let versatz = 0;
    if (g.left + f.width > window.innerWidth - rand) versatz = window.innerWidth - rand - f.width - g.left;
    if (g.left + versatz < rand) versatz = rand - g.left;
    setLage({ oben, versatz: Math.round(versatz) });
  }, [offen, gruppe, feld]);
  return lage;
}

/** Esc schließt und gibt den Fokus an den Knopf zurück, ein Klick außerhalb der Gruppe schließt. */
function useSchliessen(offen: boolean, setOffen: (x: boolean) => void, gruppe: RefObject<HTMLSpanElement | null>, knopf: RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc gehört hier der Erklärung, nicht dem Formular (das sonst „Verwerfen“ fragt).
      e.preventDefault();
      e.stopPropagation();
      setOffen(false);
      knopf.current?.focus();
    };
    const klick = (e: MouseEvent) => { if (!gruppe.current?.contains(e.target as Node)) setOffen(false); };
    document.addEventListener('keydown', taste, true);
    document.addEventListener('mousedown', klick);
    return () => { document.removeEventListener('keydown', taste, true); document.removeEventListener('mousedown', klick); };
  }, [offen, setOffen, gruppe, knopf]);
}

/**
 * Der gesperrte Knopf mit ⓘ und Erklärung. `knopf` ist das fertige `<button>` (der Baustein `Knopf` setzt
 * `aria-describedby` auf `grundId` und schaltet beim Klick `offen` um).
 */
export function Erklaerung({ sperre, knopf, knopfRef, knopfId, grundId, erklaerungId, offen, setOffen }: {
  sperre: KnopfSperre;
  knopf: ReactNode;
  knopfRef: RefObject<HTMLButtonElement | null>;
  knopfId: string;
  grundId: string;
  erklaerungId: string;
  offen: boolean;
  setOffen(x: boolean): void;
}) {
  const gruppe = useRef<HTMLSpanElement>(null);
  const feld = useRef<HTMLDivElement>(null);
  const lage = useLage(offen, gruppe, feld);
  useSchliessen(offen, setOffen, gruppe, knopfRef);
  const infoId = `${erklaerungId}i`;
  return (
    <span ref={gruppe} className={s.gruppe}>
      {knopf}
      <button type="button" className={s.warum} aria-labelledby={`${infoId} ${knopfId}`} aria-expanded={offen} aria-controls={offen ? erklaerungId : undefined} onClick={() => setOffen(!offen)}>
        <Symbol name="info" />
        <span id={infoId} hidden>{t('oberflaeche.knopf.warum')}</span>
      </button>
      <span id={grundId} className={s.sr}>{sperre.grund}</span>
      {offen && (
        <div ref={feld} id={erklaerungId} role="region" aria-labelledby={`${infoId} ${knopfId}`} className={klassen(s.erklaerung, lage.oben && s.oben)} style={lage.versatz ? { left: lage.versatz } : undefined} data-erklaerung="">
          <p><strong>{sperre.titel ?? t('oberflaeche.knopf.geht-nicht')}</strong> {sperre.grund}</p>
          {!!sperre.eintraege?.length && (
            <ul>
              {sperre.eintraege.map((e, i) => <li key={i}>{e}</li>)}
              {!!sperre.weitere && <li className="leise">{t('oberflaeche.knopf.und-weitere', { wert: sperre.weitere })}</li>}
            </ul>
          )}
          {sperre.stattdessen && <div className={s.wege}><p className="leise">{t('oberflaeche.knopf.stattdessen')}</p><div className={s.wegknoepfe}>{sperre.stattdessen}</div></div>}
        </div>
      )}
    </span>
  );
}
