import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { kannSchwaerzen, SCHWAERZEN_MAX_SEITEN } from '../../../shared/src/schwaerzen';
import type { Dokument } from '../../../shared/src/model';
import { dokumenteApi } from '../api/dokumente';
import { Feld } from '../bausteine';
import { t } from '../sprache';
import s from './Seitenbetrachter.module.css';

/**
 * Seitenbetrachter (#1323, #1324, #1339): ein Dokument als Seitenbilder in Spaltenbreite untereinander – in der Mappe
 * wie beim Übernehmen. Es gibt keinen eigenen Scrollbereich: Die Seiten rollen mit der Spalte (am Handy mit der Seite).
 * Der Kopf des Dokuments bleibt am Rechner oben stehen, bis das Dokument endet, und trägt „Seite n von N“ zum
 * Springen. Bild und Wörter einer Seite entstehen erst, wenn sie in die Nähe kommt; der Platz steht vorher schon fest,
 * damit Springen und Rollen nicht zucken.
 */

/** Maße einer Seite in Punkten; 1 × 1: unbekannt (dann bestimmt das Bild die Höhe). */
export interface Seitenmass {
  breite: number;
  hoehe: number;
}

/** So weit über und unter dem Fenster (in Fensterhöhen) gilt eine Seite als „in der Nähe“. */
const NAEHE = 1.5;
/** Vor dem ersten Messen gelten so viele Seiten als nah – das erste Bild kommt ohne Warten. */
const ANFANG = 2;

/**
 * Lage im Dokument: welche Seite gerade oben steht, welche in der Nähe sind, und Springen. `wurzel` kommt an das
 * Element, das Kopf (`data-seitenkopf`) und Seiten (`data-seite`) enthält. Gemessen wird beim Rollen jeder Spalte
 * (Rollen-Ereignis im Einfangen) und bei Größenänderungen – der Betrachter selbst rollt nie.
 */
export function useSeitenlage(anzahl: number) {
  const wurzel = useRef<HTMLElement | null>(null);
  const [aktuell, setAktuell] = useState(1);
  const [nah, setNah] = useState<[number, number]>([1, Math.min(anzahl, ANFANG)]);
  /** Ziel des letzten Sprungs: gilt als aktuell, solange es zu sehen ist (auch die letzte Seite, die nie oben steht). */
  const ziel = useRef<number | null>(null);

  useEffect(() => {
    const el = wurzel.current;
    if (!el || !anzahl) return;
    let plan = 0;
    const messe = () => {
      plan = 0;
      const lage = vermessen(el, ziel.current);
      if (!lage) return;
      if (lage.zielWeg) ziel.current = null;
      setAktuell(lage.aktuell);
      setNah((v) => (v[0] === lage.von && v[1] === lage.bis ? v : [lage.von, lage.bis]));
    };
    const bald = () => {
      if (!plan) plan = requestAnimationFrame(messe);
    };
    messe();
    document.addEventListener('scroll', bald, { capture: true, passive: true });
    window.addEventListener('resize', bald);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(bald);
    ro?.observe(el);
    return () => {
      if (plan) cancelAnimationFrame(plan);
      document.removeEventListener('scroll', bald, { capture: true });
      window.removeEventListener('resize', bald);
      ro?.disconnect();
    };
  }, [anzahl]);

  const springe = useCallback(
    (nr: number) => {
      const n = Math.min(Math.max(1, Math.round(nr)), anzahl);
      const seite = wurzel.current?.querySelector<HTMLElement>(`[data-seite="${n}"]`);
      if (!seite) return;
      ziel.current = n;
      setAktuell(n);
      // Unter dem klebenden Kopf ankommen, nicht dahinter (er kann zweizeilig sein).
      const kopf = wurzel.current?.querySelector<HTMLElement>('[data-seitenkopf]');
      const klebt = !!kopf && getComputedStyle(kopf).position === 'sticky';
      seite.style.scrollMarginTop = `${(klebt ? kopf.offsetHeight : 0) + 8}px`;
      seite.scrollIntoView({ block: 'start' });
      // Fokus auf die Seite (Name „Seite n“), ohne noch einmal zu rollen.
      seite.focus({ preventScroll: true });
    },
    [anzahl],
  );
  const istNah = useCallback((nr: number) => nr >= nah[0] && nr <= nah[1], [nah]);
  const setzeWurzel = useCallback((x: HTMLElement | null) => {
    wurzel.current = x;
  }, []);
  return { wurzel: setzeWurzel, aktuell, istNah, springe, anzahl };
}
export type Seitenlage = ReturnType<typeof useSeitenlage>;

/** Eine Messung: nahe Seiten (von–bis) und die Seite, deren Oberkante zuletzt das obere Drittel unter dem Kopf erreicht hat. */
function vermessen(el: HTMLElement, ziel: number | null) {
  const seiten = el.querySelectorAll<HTMLElement>('[data-seite]');
  if (!seiten.length) return null;
  const hoehe = window.innerHeight || document.documentElement.clientHeight;
  const rand = hoehe * NAEHE;
  const kopf = Math.max(0, el.querySelector('[data-seitenkopf]')?.getBoundingClientRect().bottom ?? 0);
  const linie = kopf + (hoehe - kopf) / 3;
  let von = 0;
  let bis = 0;
  let aktuell = 1;
  let zielWeg = ziel !== null;
  seiten.forEach((x, i) => {
    const r = x.getBoundingClientRect();
    if (r.bottom > -rand && r.top < hoehe + rand) {
      if (!von) von = i + 1;
      bis = i + 1;
    }
    if (r.top <= linie) aktuell = i + 1;
    if (ziel === i + 1 && r.bottom > kopf && r.top < hoehe) zielWeg = false;
  });
  return { von: von || 1, bis: bis || 1, aktuell: ziel !== null && !zielWeg ? ziel : aktuell, zielWeg };
}

/**
 * „Seite [n] von N“ im Kopf (ab zwei Seiten): Die Zahl folgt dem Rollen; eine Zahl eingeben und Enter springt dorthin,
 * Escape verwirft die Eingabe.
 */
export function SeitenSprung({ lage }: { lage: Seitenlage }) {
  const [eingabe, setEingabe] = useState<string | null>(null);
  const { anzahl } = lage;
  // Eine Seite: nichts zu springen.
  if (anzahl < 2) return null;
  return (
    <span className={s.sprung}>
      <span aria-hidden="true">{t('ablage.seitenbetrachter.seite')}</span>
      <Feld beschriftung={t('ablage.seitenbetrachter.springen', { anzahl })} beschriftungVerbergen className={s.sprungFeld}>
        <input
          type="text"
          inputMode="numeric"
          enterKeyHint="go"
          autoComplete="off"
          className={s.zahl}
          size={Math.max(2, String(anzahl).length)}
          value={eingabe ?? String(lage.aktuell)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setEingabe(e.currentTarget.value.replace(/\D/g, '').slice(0, 5))}
          onBlur={() => setEingabe(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const n = Number(eingabe ?? lage.aktuell);
              setEingabe(null);
              if (n >= 1) lage.springe(n);
            } else if (e.key === 'Escape' && eingabe !== null) {
              e.preventDefault();
              setEingabe(null);
            }
          }}
        />
      </Feld>
      <span>{t('ablage.seitenbetrachter.von', { anzahl })}</span>
    </span>
  );
}

/** Klasse für den Kopf eines Dokuments mit Seiten: bleibt am Rechner oben stehen, bis das Dokument endet. */
export const klebenderKopf = s.kopf;

/**
 * Eine Seite: fester Platz (Seitenverhältnis), das Bild erst in der Nähe. `children` liegen über dem Bild (Wörter,
 * Rahmen); `flaeche` nimmt deren Zeiger-Ereignisse.
 */
export function SeiteFigur({
  nr,
  lage,
  mass,
  bild,
  klasse = '',
  leer,
  flaeche,
  unter,
  children,
}: {
  nr: number;
  lage: Seitenlage;
  mass: Seitenmass;
  bild: string;
  klasse?: string;
  /** Leerseite (#997): fällt beim Übernehmen weg. */
  leer?: boolean;
  flaeche?: HTMLAttributes<HTMLDivElement>;
  unter?: ReactNode;
  children?: ReactNode;
}) {
  const bekannt = mass.breite > 1 && mass.hoehe > 1;
  const nah = lage.istNah(nr);
  return (
    <figure className={`${s.seite} ${klasse}`} data-seite={nr} data-leer={leer ? 'ja' : undefined} tabIndex={-1}>
      <div
        {...flaeche}
        className={`${s.flaeche} ${bekannt ? s.mass : ''}`}
        style={bekannt ? { aspectRatio: `${mass.breite} / ${mass.hoehe}` } : nah ? undefined : { aspectRatio: '210 / 297' }}>
        {nah && <img src={bild} alt={t('ablage.seitenbetrachter.seite-von', { nr, anzahl: lage.anzahl })} draggable={false} />}
        {children}
      </div>
      <figcaption className="leise klein">
        {t('ablage.uebernehmen.seite', { nr })}
        {unter}
      </figcaption>
    </figure>
  );
}

/** Seiten ohne Wörter und Rahmen (Mappe): nur die Bilder. */
export function Seitenbilder({ lage, seiten, bild }: { lage: Seitenlage; seiten: Seitenmass[]; bild(nr: number): string }) {
  return (
    <>
      {seiten.map((m, i) => (
        <SeiteFigur key={i} nr={i + 1} lage={lage} mass={m} bild={bild(i + 1)} />
      ))}
    </>
  );
}

/**
 * Maße der Seiten für die Mappe: bei Archivfassung und PDF nur Seitenzahl und Seitengrößen (#1445, ohne die Wörter, die
 * nur „Übernehmen“ braucht; bei E-Mails die der Archivfassung). null: lädt noch; 'keine': nicht als Seiten zeigen (Bild, Lesefassung, entsperrtes PDF, zu viele
 * Seiten) – dann bleibt die Anzeige des Browsers.
 */
export function useSeitenmasse(x: Dokument, art: 'archiv' | 'original' | null): Seitenmass[] | null | 'keine' {
  const passt = art === 'archiv' || (art === 'original' && x.mime === 'application/pdf' && x.pdfSchutz?.art !== 'passwort');
  const [masse, setMasse] = useState<{ schluessel: string; seiten: Seitenmass[] | 'keine' } | null>(null);
  const schluessel = `${x.id}:${x.sha256}:${art}`;
  useEffect(() => {
    if (!passt) return;
    let aktuell = true;
    dokumenteApi.seitenmasse(x.id, art === 'archiv' && !kannSchwaerzen(x.mime)).then(
      (r) => {
        const seiten = r.seiten.map((w) => ({ breite: w.breite ?? 1, hoehe: w.hoehe ?? 1 }));
        if (aktuell) setMasse({ schluessel, seiten: seiten.length && seiten.length <= SCHWAERZEN_MAX_SEITEN ? seiten : 'keine' });
      },
      () => aktuell && setMasse({ schluessel, seiten: 'keine' }),
    );
    return () => {
      aktuell = false;
    };
  }, [schluessel, passt]); // eslint-disable-line react-hooks/exhaustive-deps -- Maße nur neu laden, wenn Dokument, Inhalt oder Fassung wechseln
  if (!passt) return 'keine';
  return masse?.schluessel === schluessel ? masse.seiten : null;
}
