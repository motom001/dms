import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { blaettere, istTag, kwDerZeile, monatVon, monatsraster, tagNachTaste } from '../../../../shared/src/kalender';
import { gebietsschema } from '../../../../shared/src/sprache';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import type { FeldVerknuepfung } from '../feld/Feld';
import { Knopf } from '../knopf/Knopf';
import { legeFest } from '../menue/lage';
import s from './Datum.module.css';

/**
 * Baustein Datum (#1496): ein Datumsfeld mit eigenem Kalender, der vor jeder Zeile die Kalenderwoche (ISO 8601) zeigt.
 *
 * - **Tippen bleibt direkt:** Die Eingabe ist das Datumsfeld des Browsers – Tag, Monat und Jahr werden wie gewohnt
 *   getippt, Tab wandert weiter, ohne dass sich etwas öffnet.
 * - **Ein Klick mit der Maus ins Feld** (Tag, Monat oder Jahr) öffnet den Kalender, ohne den Fokus zu nehmen: Wer gleich
 *   tippt, tippt ins Feld, der Kalender folgt dem getippten Datum. Am Handy öffnet ein Tippen ins Feld wie bisher die
 *   Auswahl des Systems; den Kalender mit Kalenderwochen öffnet dort der Knopf.
 * - **Knopf „Kalender“** rechts im Feld (statt des Symbols des Browsers) und **Alt + Pfeil runter** öffnen den Kalender
 *   mit dem Fokus darin: Pfeiltasten wandern, Bild auf/ab blättert Monate, Enter wählt, Esc schließt und gibt den Fokus
 *   ans Feld zurück. Klick daneben schließt.
 * - Lage wie bei allen aufklappenden Bausteinen (#1532, #1556, `menue/lage.ts`): unten, wenn Platz ist, sonst oben, nie
 *   über dem Assistenten; waagerecht bündig mit dem Feld, solange er ganz ins Fenster passt. Am Handy (schmal) ist er
 *   ein Blatt von unten.
 *
 * Wert wie beim Datumsfeld des Browsers: JJJJ-MM-TT oder leer. Anleitung im Entwicklerhandbuch, „Gestaltung und
 * Bausteine → Datum“.
 */
export interface DatumEingabeProps extends Partial<FeldVerknuepfung> {
  wert: string;
  setze: (w: string) => void;
  /** Name der Eingabe, wenn keine sichtbare Beschriftung auf `id` zeigt. */
  'aria-label'?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  /** Kalender gleich offen (nur für Musterseite und Bilder). */
  offenZeigen?: boolean;
}

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');
/** Heute im Kalender des Geräts (JJJJ-MM-TT). */
const heuteHier = () => new Intl.DateTimeFormat('sv-SE').format(new Date());

/** Offen ohne Fokus (`zeigen`, nach einem Klick ins Feld) oder mit dem Fokus im Kalender (`fokus`). */
type Offen = false | 'zeigen' | 'fokus';

export function DatumEingabe({ wert, setze, id, min, max, disabled, className, offenZeigen, ...aria }: DatumEingabeProps) {
  const [offen, setOffen] = useState<Offen>(offenZeigen ? 'zeigen' : false);
  const rahmen = useRef<HTMLSpanElement>(null);
  const eingabe = useRef<HTMLInputElement>(null);
  useAussenKlick(rahmen, !!offen && !offenZeigen, () => setOffen(false));
  const zurueck = () => {
    setOffen(false);
    eingabe.current?.focus();
  };
  function taste(e: KeyboardEvent<HTMLInputElement>) {
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      setOffen('fokus');
    } else if (e.key === 'Escape' && offen) {
      e.preventDefault();
      e.stopPropagation();
      setOffen(false);
    } else if (e.key === 'Tab') setOffen(false);
  }
  return (
    <span className={klassen(s.datum, className)} ref={rahmen}>
      <span className={s.eingabe}>
        <input
          ref={eingabe}
          id={id}
          type="date"
          value={wert}
          min={min}
          max={max}
          disabled={disabled}
          {...aria}
          onChange={(e) => setze(e.target.value)}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && !disabled && !offen) setOffen('zeigen');
          }}
          onKeyDown={taste}
        />
        <Knopf
          art="eigen"
          className={s.knopf}
          nurSymbol={t('oberflaeche.datum.kalender-oeffnen')}
          aria-haspopup="dialog"
          aria-expanded={!!offen}
          gesperrt={disabled}
          onClick={() => setOffen(offen === 'fokus' ? false : 'fokus')}>
          <Symbol name="kalender" />
        </Knopf>
      </span>
      {offen && (
        <Kalender
          wert={wert}
          min={min}
          max={max}
          fokus={offen === 'fokus'}
          fest={offenZeigen}
          waehle={(iso) => {
            setze(iso);
            zurueck();
          }}
          schliessen={zurueck}
        />
      )}
    </span>
  );
}

/** Klick (Maus oder Finger) außerhalb des Rahmens schließt. */
function useAussenKlick(rahmen: RefObject<HTMLElement | null>, an: boolean, zu: () => void) {
  useEffect(() => {
    if (!an) return;
    const klick = (e: PointerEvent) => {
      if (!rahmen.current?.contains(e.target as Node)) zu();
    };
    document.addEventListener('pointerdown', klick);
    return () => document.removeEventListener('pointerdown', klick);
  }, [an]); // eslint-disable-line react-hooks/exhaustive-deps -- `zu` setzt nur den Zustand, der Rahmen ist fest
}

interface KalenderProps {
  wert: string;
  min?: string;
  max?: string;
  fokus: boolean;
  /** Im Fluss der Seite statt darüber (Musterseite). */
  fest?: boolean;
  waehle: (iso: string) => void;
  schliessen: () => void;
}

/** Der Kalender: Kopf mit Monat und Blättern, Raster mit Kalenderwochen, darunter „Heute“. */
function Kalender({ wert, min, max, fokus, fest, waehle, schliessen }: KalenderProps) {
  const heute = heuteHier();
  const start = istTag(wert) ? wert : heute;
  const [aktiv, setAktiv] = useState(start);
  const [monat, setMonat] = useState(monatVon(start));
  const [tastatur, setTastatur] = useState(fokus);
  const kasten = useRef<HTMLDivElement>(null);
  useKalenderLage(kasten, fest);
  // Getipptes Datum (#1496): Der Kalender folgt dem Feld.
  useEffect(() => {
    if (!istTag(wert)) return;
    setAktiv(wert);
    setMonat(monatVon(wert));
  }, [wert]);
  useEffect(() => {
    if (fokus) setTastatur(true);
  }, [fokus]);
  useEffect(() => {
    if (tastatur) kasten.current?.querySelector<HTMLElement>(`[data-tag="${aktiv}"]`)?.focus();
  }, [tastatur, aktiv, monat]);
  const erlaubt = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  const geh = (iso: string) => {
    setAktiv(iso);
    setMonat(monatVon(iso));
  };
  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    const ziel = tagNachTaste(e.key, aktiv, e.shiftKey);
    if (ziel) geh(ziel);
    else if (e.key === 'Escape') {
      e.stopPropagation();
      schliessen();
    } else return;
    e.preventDefault();
  };
  return (
    <div
      ref={kasten}
      role="dialog"
      aria-label={t('oberflaeche.datum.kalender')}
      className={klassen(s.kalender, fest && s.fest)}
      data-anker="datum.kalender"
      onKeyDown={taste}>
      <Kopf monat={monat} blaettern={(n) => setMonat(blaettere(monat, n))} />
      <Raster monat={monat} wert={wert} aktiv={aktiv} heute={heute} erlaubt={erlaubt} waehle={waehle} />
      <div className={s.fuss}>
        <Knopf groesse="klein" gesperrt={!erlaubt(heute)} onClick={() => waehle(heute)}>
          {t('oberflaeche.datum.heute')}
        </Knopf>
      </div>
    </div>
  );
}

/**
 * Lage des Kalenders (#1532, #1556): nach der gemeinsamen Regel der Menüs (`legeFest`), am Feld ausgerichtet und
 * linksbündig bevorzugt – beim Öffnen, bei jedem Rollen und jeder neuen Größe. Schmal liegt er als Blatt unten
 * (Datum.module.css), auf der Musterseite im Fluss (`fest`).
 */
function useKalenderLage(kasten: RefObject<HTMLElement | null>, fest?: boolean) {
  useLayoutEffect(() => {
    if (fest) return;
    const setze = () => {
      const el = kasten.current;
      const feld = el?.previousElementSibling;
      if (!el || !(feld instanceof HTMLElement)) return;
      if (matchMedia('(max-width: 600px)').matches) {
        el.removeAttribute('style');
        return;
      }
      legeFest(el, feld, true);
    };
    setze();
    addEventListener('resize', setze);
    document.addEventListener('scroll', setze, true);
    return () => {
      removeEventListener('resize', setze);
      document.removeEventListener('scroll', setze, true);
    };
  }, [fest]); // eslint-disable-line react-hooks/exhaustive-deps -- der Ref ist fest
}

function Kopf({ monat, blaettern }: { monat: string; blaettern: (n: number) => void }) {
  return (
    <div className={s.kopf}>
      <Knopf art="eigen" className={s.blaettern} nurSymbol={t('oberflaeche.datum.monat-zurueck')} onClick={() => blaettern(-1)}>
        <Symbol name="pfeil-links" />
      </Knopf>
      <span className={s.monat} aria-live="polite">
        {MONAT().format(new Date(`${monat}-01T12:00:00Z`))}
      </span>
      <Knopf art="eigen" className={s.blaettern} nurSymbol={t('oberflaeche.datum.monat-vor')} onClick={() => blaettern(1)}>
        <Symbol name="pfeil-rechts" />
      </Knopf>
    </div>
  );
}

const MONAT = () => new Intl.DateTimeFormat(gebietsschema(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
const TAG = () =>
  new Intl.DateTimeFormat(gebietsschema(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const WOCHENTAG = () => new Intl.DateTimeFormat(gebietsschema(), { weekday: 'short', timeZone: 'UTC' });
const WOCHENTAG_LANG = () => new Intl.DateTimeFormat(gebietsschema(), { weekday: 'long', timeZone: 'UTC' });
const alsDatum = (iso: string) => new Date(`${iso}T12:00:00Z`);

interface RasterProps {
  monat: string;
  wert: string;
  aktiv: string;
  heute: string;
  erlaubt: (iso: string) => boolean;
  waehle: (iso: string) => void;
}

/** Monat als Tabelle: erste Spalte die Kalenderwoche (ISO), dann die Wochentage ab dem Wochenbeginn der Region (#1610). */
function Raster({ monat, wert, aktiv, heute, erlaubt, waehle }: RasterProps) {
  const wochen = monatsraster(monat);
  return (
    <table role="grid" className={s.raster} aria-label={MONAT().format(alsDatum(`${monat}-01`))}>
      <thead>
        <tr>
          <th scope="col" className={s.kw}>
            <abbr title={t('oberflaeche.datum.kalenderwoche')}>{t('oberflaeche.datum.kw')}</abbr>
          </th>
          {wochen[0].map((tag) => (
            <th key={tag} scope="col">
              <abbr title={WOCHENTAG_LANG().format(alsDatum(tag))}>{WOCHENTAG().format(alsDatum(tag)).replace('.', '')}</abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {wochen.map((woche) => (
          <tr key={woche[0]}>
            <th scope="row" className={s.kw} data-kw={kwDerZeile(woche)}>
              <span aria-hidden="true">{kwDerZeile(woche)}</span>
              <span className={s.sr}>{t('oberflaeche.datum.kw-lang', { kw: kwDerZeile(woche) })}</span>
            </th>
            {woche.map((tag) => (
              <td key={tag} role="gridcell" aria-selected={tag === wert}>
                <button
                  type="button"
                  data-tag={tag}
                  tabIndex={tag === aktiv ? 0 : -1}
                  aria-label={TAG().format(alsDatum(tag))}
                  aria-current={tag === heute ? 'date' : undefined}
                  aria-disabled={erlaubt(tag) ? undefined : true}
                  className={klassen(s.tag, monatVon(tag) !== monat && s.fremd, tag === wert && s.gewaehlt, tag === heute && s.heute)}
                  onClick={() => erlaubt(tag) && waehle(tag)}>
                  {Number(tag.slice(8))}
                </button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
