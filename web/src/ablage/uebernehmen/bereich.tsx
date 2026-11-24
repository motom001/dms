import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { feldLabel } from '../../../../shared/src/beschriftung';
import { felderAusBlock, liesBlock, zeilenImBereich, type Blockart } from '../../../../shared/src/bereichsmuster';
import type { Bereich, SchwaerzSeite } from '../../../../shared/src/schwaerzen';
import { Knopf } from '../../bausteine';
import { t } from '../../sprache';
import type { Ebenen } from './ebenen';
import s from './Bereich.module.css';

/**
 * Bereich im Dokument markieren (#1597): Knopf „Bereich markieren“ im Kopf des Dokuments schaltet den Markiermodus ein;
 * ein gezogenes Rechteck (Maus, Stift, Finger) füllt die passenden Felder der gerade offenen Ebene rechts (#1596) als
 * „Vorschlag“. Erkannt wird ohne KI über die Wörter der Seite (shared/src/bereichsmuster.ts) – nichts verlässt den Server.
 */

type Rechteck = Pick<Bereich, 'x' | 'y' | 'b' | 'h'>;
interface Meldung {
  dokId: string;
  art: 'gut' | 'warn';
  text: string;
  rueckgaengig?: () => void;
}
/** Unter diesem Maß (px, Breite oder Höhe) ist ein Rechteck ein Versehen und wird nicht ausgewertet. */
const MINDESTENS_PX = 10;

const artName = (a: Blockart) =>
  ({
    anschrift: t('ablage.bereich.art.anschrift'),
    bank: t('ablage.bereich.art.bank'),
    kontakt: t('ablage.bereich.art.kontakt'),
    kopf: t('ablage.bereich.art.kopf'),
  })[a];
/** „… hat keine Felder für eine Anschrift“. */
const fuerArt = (a: Blockart) =>
  ({
    anschrift: t('ablage.bereich.fuer.anschrift'),
    bank: t('ablage.bereich.fuer.bank'),
    kontakt: t('ablage.bereich.fuer.kontakt'),
    kopf: t('ablage.bereich.fuer.kopf'),
  })[a];

/** Zustand des Markiermodus: in welchem Dokument er an ist, die letzte Meldung und was ein fertiges Rechteck tut. */
export function useBereich(eb: Ebenen, aktiv: boolean, postId: string) {
  const [an, setAn] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  useEffect(() => {
    setAn(null);
    setMeldung(null);
  }, [postId]);
  // Esc beendet den Modus.
  useEffect(() => {
    if (!an) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAn(null);
    };
    addEventListener('keydown', taste);
    return () => removeEventListener('keydown', taste);
  }, [an]);
  const ziel = eb.ziel();
  const umschalten = useCallback((dokId: string) => {
    setAn((x) => (x === dokId ? null : dokId));
    setMeldung(null);
  }, []);
  function fertig(dokId: string, seite: SchwaerzSeite, r: Rechteck) {
    const z = eb.ziel();
    const block = liesBlock(zeilenImBereich(seite, r));
    if (!z || !block) {
      setMeldung({ dokId, art: 'warn', text: z ? t('ablage.bereich.nichts') : t('ablage.bereich.ohne-mappe') });
      return;
    }
    const felder = felderAusBlock(block, z.typ.felder);
    const art = artName(block.art);
    const zurueck = felder.length
      ? z.anschluss.vorschlagen?.(
          felder.map((x) => ({ key: x.feld.key, wert: x.wert })),
          block.text,
        )
      : null;
    setAn(null);
    if (!zurueck) {
      const fuer = fuerArt(block.art);
      setMeldung({ dokId, art: 'warn', text: t('ablage.bereich.keine-felder', { art, text: block.text, mappe: z.name, fuer }) });
      return;
    }
    const text = eb.schmal
      ? t('ablage.bereich.eingetragen-kurz', { art })
      : t('ablage.bereich.eingetragen', { art, text: block.text, felder: felder.map((x) => feldLabel(x.feld)).join(', ') });
    setMeldung({
      dokId,
      art: 'gut',
      text,
      rueckgaengig: () => {
        zurueck();
        setMeldung({ dokId, art: 'gut', text: t('ablage.bereich.rueckgaengig-gemacht') });
      },
    });
    // Am Handy zur Mappe: auf einer Ebene über den Umschalter, sonst zur rechten Spalte unter dem Dokument.
    if (!eb.schmal) return;
    if (eb.offen) eb.setAnsicht('mappe');
    else document.querySelector('.ue-rechts')?.scrollIntoView({ block: 'start' });
  }
  if (!aktiv) return undefined;
  return { an, umschalten, fertig, meldung, schmal: eb.schmal, mappe: ziel?.name ?? '' };
}
export type BereichLage = NonNullable<ReturnType<typeof useBereich>>;

/** Im Kopf des Dokuments: „Bereich markieren“ als Umschalter (aria-pressed), an deutlich hervorgehoben. */
export function BereichKnopf({ b, dokId }: { b: BereichLage; dokId: string }) {
  const an = b.an === dokId;
  return (
    <Knopf
      // Am Handy in voller Größe (44 px), am Rechner klein wie der übrige Kopf.
      groesse={b.schmal ? 'normal' : 'klein'}
      aria-pressed={an}
      className={`${s.knopf}${an ? ` ${s.an}` : ''}`}
      onClick={() => b.umschalten(dokId)}>
      <span className={s.zeichen} aria-hidden="true" />
      {t('ablage.bereich.knopf')}
    </Knopf>
  );
}

/** Unter dem Kopf: der Hinweis, solange der Modus an ist, und (am Rechner) die Meldung danach. */
export function BereichZeilen({ b, dokId }: { b: BereichLage; dokId: string }) {
  return (
    <>
      {b.an === dokId && <p className={`klein ${s.hinweis}`}>{t('ablage.bereich.hinweis', { mappe: b.mappe })}</p>}
      {!b.schmal && b.meldung?.dokId === dokId && <BereichMeldung m={b.meldung} />}
    </>
  );
}

/** Am Handy steht die Meldung über der Mappe – dorthin springt die Ansicht nach dem Markieren. */
export function BereichOben({ b }: { b?: BereichLage }) {
  return b?.schmal && b.meldung ? <BereichMeldung m={b.meldung} /> : null;
}

function BereichMeldung({ m }: { m: Meldung }) {
  return (
    <div className={`hinweis ${m.art} ${s.meldung}`} role="status">
      <p>{m.text}</p>
      {m.rueckgaengig && (
        <Knopf groesse="klein" onClick={m.rueckgaengig}>
          {t('ablage.bereich.rueckgaengig')}
        </Knopf>
      )}
    </div>
  );
}

/** Über einer Seite, solange der Modus an ist: Rechteck ziehen (Fadenkreuz, oranger Rahmen); zu kleine zählen nicht. */
export function BereichFlaeche({ fertig }: { fertig(r: Rechteck): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zug, setZug] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const lage = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const klemme = (v: number) => Math.min(1, Math.max(0, v));
    return { x: klemme((e.clientX - r.left) / r.width), y: klemme((e.clientY - r.top) / r.height), r };
  };
  const rechteck = (z: NonNullable<typeof zug>): Rechteck => ({
    x: Math.min(z.x0, z.x1),
    y: Math.min(z.y0, z.y1),
    b: Math.abs(z.x1 - z.x0),
    h: Math.abs(z.y1 - z.y0),
  });
  return (
    <div
      ref={ref}
      className={s.flaeche}
      aria-hidden="true"
      onPointerDown={(e) => {
        if (e.button > 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const { x, y } = lage(e);
        setZug({ x0: x, y0: y, x1: x, y1: y });
      }}
      onPointerMove={(e) => {
        if (!zug) return;
        const { x, y } = lage(e);
        setZug({ ...zug, x1: x, y1: y });
      }}
      onPointerUp={(e) => {
        if (!zug) return;
        e.stopPropagation();
        const { r } = lage(e);
        const q = rechteck(zug);
        setZug(null);
        if (q.b * r.width >= MINDESTENS_PX && q.h * r.height >= MINDESTENS_PX) fertig(q);
      }}
      onPointerCancel={() => setZug(null)}>
      {zug && (
        <span
          className={s.rechteck}
          style={(({ x, y, b, h }) => ({ left: `${x * 100}%`, top: `${y * 100}%`, width: `${b * 100}%`, height: `${h * 100}%` }))(
            rechteck(zug),
          )}
        />
      )}
    </div>
  );
}
