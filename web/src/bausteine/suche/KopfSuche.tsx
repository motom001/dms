import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import { Knopf } from '../knopf/Knopf';
import s from './KopfSuche.module.css';

/**
 * Baustein Suche, Teil „Suchfeld in der Kopfzeile“ (#1218, Musterkatalog C16): ein Feld auf jeder Seite, oben in der
 * Mitte. Anleitung im Entwicklerhandbuch, „Gestaltung und Bausteine → Suche“.
 *
 * - Lupe, Platzhalter, „×“ zum Leeren; **Esc** leert, **Enter** ruft `onEnter` (in der Ablage: erweiterte Suche).
 * - Taste **„/“** springt von überall hinein – nicht aus Eingabefeldern und nicht, solange ein Dialog offen ist. Im
 *   leeren Feld steht der Hinweis `/`.
 * - **Bereich** (`bereich`): ein Chip „in: Verträge ×“ im Feld. „×“ oder die **Rücktaste** im leeren Feld nimmt ihn weg.
 * - **„Suchen in ▾“** (`suchenIn`): klappt darunter Haken und Wege auf (keine Menüpunkte, darum kein ARIA-Menü).
 * - **Am Handy** (bis 600 px) steht nur die Lupe (44 px) in der Kopfzeile; sie öffnet das Feld über die volle Breite,
 *   mit Chip und „Suchen in“. „Suche schließen“ leert es und schließt.
 */

export interface KopfSucheBereich {
  /** Sichtbar im Chip, z. B. „in: Verträge“. */
  text: string;
  /** Bereich wegnehmen: danach sucht das Feld in allem. */
  weg(): void;
}

export interface KopfSucheProps {
  wert: string;
  setze(wert: string): void;
  /** Name des Felds für Screenreader, z. B. „In deiner Ablage suchen“ oder „Verträge durchsuchen“. */
  beschriftung: string;
  platzhalter: string;
  bereich?: KopfSucheBereich | null;
  /** Enter im Feld. */
  onEnter?(wert: string): void;
  /** „Suchen in ▾“: Beschriftung und was darunter aufklappt (Haken, Links). */
  suchenIn?: { text: string; inhalt: ReactNode } | null;
  /** Taste „/“ springt ins Feld (Vorgabe an; auf der Musterseite aus, dort gibt es mehrere Felder). */
  tastenkuerzel?: boolean;
  /** Sprungziel für Rundgänge und Tests (`data-anker`). */
  anker?: string;
  className?: string;
}

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

/** Tippt die Person gerade irgendwo? Dann gehört „/“ dorthin. */
function tipptGerade(ziel: EventTarget | null): boolean {
  if (!(ziel instanceof HTMLElement)) return false;
  return ziel.isContentEditable || !!ziel.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]');
}

/** „/“ von überall ins Feld (#1218): öffnet es am Handy und setzt den Fokus. */
function useTastenkuerzel(an: boolean, oeffnen: () => void) {
  useEffect(() => {
    if (!an) return;
    const taste = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || tipptGerade(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      oeffnen();
    };
    addEventListener('keydown', taste);
    return () => removeEventListener('keydown', taste);
  }, [an, oeffnen]);
}

/** „Suchen in ▾“ klappt zu, sobald man daneben klickt oder Esc drückt. */
function useAufklapper(rahmen: RefObject<HTMLElement | null>) {
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    if (!offen) return;
    const weg = (e: Event) => { if (!rahmen.current?.contains(e.target as Node)) setOffen(false); };
    addEventListener('pointerdown', weg);
    return () => removeEventListener('pointerdown', weg);
  }, [offen, rahmen]);
  return [offen, setOffen] as const;
}

export function KopfSuche({ wert, setze, beschriftung, platzhalter, bereich, onEnter, suchenIn, tastenkuerzel = true, anker, className }: KopfSucheProps) {
  const feld = useRef<HTMLInputElement>(null);
  const lupe = useRef<HTMLButtonElement>(null);
  const rahmen = useRef<HTMLDivElement>(null);
  const id = useId();
  // Am Handy: Feld aufgeklappt? Mit Text bleibt es offen (sonst sähe man nicht, dass gefiltert wird).
  const [auf, setAuf] = useState(false);
  const offen = auf || !!wert;
  const [inOffen, setInOffen] = useAufklapper(rahmen);
  // Fokus ins Feld: sofort, wenn es zu sehen ist; am Handy erst, wenn es nach dem Aufklappen gezeichnet ist.
  const springe = useRef(false);
  const oeffnen = useCallback(() => { springe.current = true; setAuf(true); feld.current?.focus(); }, []);
  useEffect(() => {
    if (!springe.current) return;
    springe.current = false;
    feld.current?.focus();
  });
  useTastenkuerzel(tastenkuerzel, oeffnen);

  // Die Lupe ist erst nach dem Zuklappen wieder zu sehen – dann bekommt sie den Fokus zurück.
  const schliessen = () => { setze(''); setAuf(false); setInOffen(false); requestAnimationFrame(() => lupe.current?.focus()); };
  const taste = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (wert) { e.preventDefault(); e.stopPropagation(); setze(''); }
      // Nur am Handy (die Lupe ist zu sehen) klappt Esc das leere Feld wieder zu.
      else if (auf && !!lupe.current?.getClientRects().length) { e.preventDefault(); schliessen(); }
    } else if (e.key === 'Enter') {
      if (!e.nativeEvent.isComposing) onEnter?.(wert);
    } else if (e.key === 'Backspace' && !wert && bereich) {
      e.preventDefault();
      bereich.weg();
    }
  };
  const panelId = `${id}-in`;

  return (
    <div ref={rahmen} className={klassen(s.kopfsuche, offen && s.offen, className)} role="search" aria-label={beschriftung} data-anker={anker}>
      <Knopf ref={lupe} art="link" nurSymbol={t('oberflaeche.suche.kopf.oeffnen')} className={s.lupenknopf} aria-expanded={offen} aria-controls={id} onClick={oeffnen}>
        <Symbol name="suche" />
      </Knopf>
      <div className={s.rahmen}>
        <Symbol name="suche" className={s.lupe} />
        {bereich && (
          <span className={s.chip}>
            <span className={s.chiptext}>{bereich.text}</span>
            <Knopf art="link" nurSymbol={t('oberflaeche.suche.kopf.bereich-weg')} className={s.chipweg} onClick={() => { bereich.weg(); feld.current?.focus(); }}>
              <Symbol name="schliessen" />
            </Knopf>
          </span>
        )}
        <label htmlFor={id} className="sr">{beschriftung}</label>
        <input ref={feld} id={id} className={s.eingabe} type="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
          value={wert} placeholder={platzhalter} aria-keyshortcuts={tastenkuerzel ? '/' : undefined}
          onChange={(e) => setze(e.target.value)} onKeyDown={taste} />
        {tastenkuerzel && !wert && <kbd className={s.taste} aria-hidden="true">/</kbd>}
        {wert && (
          <Knopf art="link" nurSymbol={t('oberflaeche.suche.leeren')} className={s.leeren} onClick={() => { setze(''); feld.current?.focus(); }}>
            <Symbol name="schliessen" />
          </Knopf>
        )}
        {suchenIn && (
          <Knopf art="link" className={s.suchenIn} aria-expanded={inOffen} aria-controls={inOffen ? panelId : undefined} onClick={() => setInOffen(!inOffen)}>
            {suchenIn.text} <Symbol name="pfeil-unten" />
          </Knopf>
        )}
        <Knopf art="link" nurSymbol={t('oberflaeche.suche.kopf.schliessen')} className={s.zu} onClick={schliessen}>
          <Symbol name="schliessen" />
        </Knopf>
        {suchenIn && inOffen && (
          <div id={panelId} className={s.panel} role="group" aria-label={suchenIn.text}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setInOffen(false); feld.current?.focus(); } }}>
            {suchenIn.inhalt}
          </div>
        )}
      </div>
    </div>
  );
}
