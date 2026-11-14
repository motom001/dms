import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { mitGrund } from '../rueckfrage/Loeschgrund';
import { rueckfrage as stelleRueckfrage } from '../../rueckfrage';
import { Symbol, type SymbolName } from '../../Symbol';
import { Knopf, fehlerText, type GefahrRueckfrage, type KnopfGroesse } from '../knopf/Knopf';
import { hinweis } from '../../rueckfrage';
import { t } from '../../sprache';
import type { LoeschAnlass } from '../../../../shared/src/loeschprotokoll';
import s from './Menue.module.css';

/**
 * Baustein Menü (#1211, #1212): ein Knopf, der eine Liste von Handlungen öffnet – „Mappe ▾“ in der Mappe, „⋯“ an einer
 * Dokumentzeile und im Kopf einer Ansicht. Ein Aussehen und eine Bedienung für alle Menüs:
 *
 * - Der Knopf ist ein `Knopf` (Neben, klein oder normal) mit Pfeil nach unten – oder nur das Symbol „⋯“ (`nurSymbol`).
 * - Punkte mit Symbol, in Gruppen mit Überschrift (`gruppe`), gesperrte mit Grund darunter (Leitsatz 6: kein Grund nur
 *   im Tooltip).
 * - Gefährliches steht abgesetzt am Ende, mit Symbol, in Ruhe nicht rot (Leitsatz 4) und **immer mit Rückfrage**
 *   (`gefahr`, Leitsatz 5) – auf Wunsch mit Grund fürs Löschprotokoll (`gefahr.mitGrund`).
 * - Tastatur nach WAI-ARIA (Menü-Knopf): Enter/Leertaste/Pfeil runter öffnen und setzen den Fokus auf den ersten Punkt,
 *   Pfeiltasten, Pos1/Ende wandern, Esc schließt und gibt den Fokus an den Knopf zurück; Klick daneben schließt.
 * - Am Handy (`pointer: coarse`) sind Punkte mindestens 48 px hoch.
 */
export interface MenuePunkt {
  key: string;
  inhalt: ReactNode;
  symbol?: SymbolName;
  /** Kurze Erklärung als Tooltip (zusätzlich zum Text, nie der einzige Ort einer Information). */
  titel?: string;
  /** Darf ein Promise liefern; ein Fehler kommt als Hinweisfenster. */
  tu(anlass?: LoeschAnlass): void | Promise<unknown>;
  /** Gesperrt aus einem Grund: der Grund steht klein unter dem Punkt. */
  gesperrt?: string;
  /** Überschrift der Gruppe, zu der der Punkt gehört (Punkte derselben Gruppe stehen beisammen). */
  gruppe?: string;
  /** Gefährlich (Leitsatz 4 und 5): abgesetzt am Ende, mit Rückfrage vor `tu`. */
  gefahr?: GefahrRueckfrage;
  /** Weg zu einer anderen Seite statt Handlung (nur fürs Aussehen gleich – `tu` navigiert). */
  anker?: string;
}

export interface MenueProps {
  /** Beschriftung des Knopfs („Mappe“); mit `nurSymbol` der Name für Screenreader. */
  beschriftung: string;
  /** Nur das Symbol „⋯“ zeigen. */
  nurSymbol?: boolean;
  punkte: MenuePunkt[];
  groesse?: KnopfGroesse;
  /** Menü rechtsbündig unter dem Knopf (Vorgabe) oder linksbündig. */
  links?: boolean;
  titel?: string;
  anker?: string;
  className?: string;
}

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

/** Punkte in Gruppen, Gefährliches zuletzt (eigene Gruppe ohne Überschrift). */
function gruppen(punkte: MenuePunkt[]): Array<{ name: string | null; punkte: MenuePunkt[]; gefahr: boolean }> {
  const aus: Array<{ name: string | null; punkte: MenuePunkt[]; gefahr: boolean }> = [];
  for (const p of punkte.filter((x) => !x.gefahr)) {
    const g = aus.find((x) => x.name === (p.gruppe ?? null));
    if (g) g.punkte.push(p); else aus.push({ name: p.gruppe ?? null, punkte: [p], gefahr: false });
  }
  const gefahr = punkte.filter((x) => x.gefahr);
  if (gefahr.length) aus.push({ name: null, punkte: gefahr, gefahr: true });
  return aus;
}

export function Menue({ beschriftung, nurSymbol, punkte, groesse = 'klein', links, titel, anker, className }: MenueProps) {
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const menue = useRef<HTMLDivElement>(null);
  const id = useId();
  const schliessen = (zurueck = true) => { setOffen(false); if (zurueck) knopf.current?.focus(); };
  useEffect(() => {
    if (!offen) return;
    const klick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOffen(false); };
    document.addEventListener('mousedown', klick);
    // Fokus auf den ersten Punkt, der sich wählen lässt.
    menue.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    return () => document.removeEventListener('mousedown', klick);
  }, [offen]);

  const eintraege = () => [...(menue.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  function taste(e: KeyboardEvent<HTMLDivElement>) {
    const liste = eintraege();
    const jetzt = liste.indexOf(document.activeElement as HTMLElement);
    let ziel = -1;
    if (e.key === 'ArrowDown') ziel = (jetzt + 1) % liste.length;
    else if (e.key === 'ArrowUp') ziel = (jetzt - 1 + liste.length) % liste.length;
    else if (e.key === 'Home') ziel = 0;
    else if (e.key === 'End') ziel = liste.length - 1;
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); schliessen(); return; }
    else if (e.key === 'Tab') { setOffen(false); return; }
    if (ziel < 0) return;
    e.preventDefault();
    liste[ziel]?.focus();
  }

  async function waehle(p: MenuePunkt) {
    if (p.gesperrt) return;
    schliessen(false);
    try {
      let anlass: LoeschAnlass | undefined;
      if (p.gefahr) {
        const { mitGrund: grund, ...r } = p.gefahr;
        if (grund) {
          const a = await mitGrund({ ...r, gefahr: true }, grund === true ? undefined : grund);
          if (!a) return;
          anlass = a;
        } else if (!(await stelleRueckfrage({ ...r, gefahr: true }))) return;
      }
      await p.tu(anlass);
    } catch (x) {
      void hinweis({ titel: t('oberflaeche.knopf.fehler'), text: fehlerText(x) });
    }
  }

  const punkt = (p: MenuePunkt) => (
    <button key={p.key} type="button" role="menuitem" tabIndex={-1} data-anker={p.anker} title={p.titel}
      aria-disabled={p.gesperrt ? true : undefined} aria-haspopup={p.gefahr ? 'dialog' : undefined}
      className={klassen(s.punkt, p.gefahr && s.gefahr, p.gesperrt && s.gesperrt)} onClick={() => void waehle(p)}>
      <span className={s.symbol} aria-hidden="true">{p.symbol && <Symbol name={p.symbol} />}</span>
      <span className={s.text}>{p.inhalt}</span>
      {p.gesperrt && <small className={s.grund}>{p.gesperrt}</small>}
    </button>
  );

  return (
    <div className={klassen(s.menue, 'menue-baustein', className)} ref={ref}>
      <Knopf ref={knopf} groesse={groesse} aria-haspopup="menu" aria-expanded={offen} aria-controls={offen ? id : undefined} data-anker={anker}
        title={titel} nurSymbol={nurSymbol ? beschriftung : undefined} className={klassen(offen && s.an)}
        onClick={() => setOffen(!offen)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !offen) { e.preventDefault(); setOffen(true); } }}>
        {nurSymbol ? <Symbol name="mehr" /> : <>{beschriftung}<Symbol name="pfeil-unten" className={s.pfeil} /></>}
      </Knopf>
      {offen && <div className={s.schleier} aria-hidden="true" onClick={() => setOffen(false)} />}
      {offen && (
        <div ref={menue} id={id} role="menu" aria-label={beschriftung} className={klassen(s.liste, links && s.links)} onKeyDown={taste}>
          {gruppen(punkte).map((g, i) => (
            <Fragment key={`${g.name ?? ''}${i}`}>
              {i > 0 && <div role="separator" className={s.trenner} />}
              {g.name
                ? <div role="group" aria-label={g.name}><p className={s.gruppe} aria-hidden="true">{g.name}</p>{g.punkte.map(punkt)}</div>
                : g.punkte.map(punkt)}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
