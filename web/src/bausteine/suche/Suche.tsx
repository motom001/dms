import { useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { ALLE_HERKUENFTE, durchsuche, EIGENE, herkunftPasst, suchwoerter, type Fund, type Fundquelle, type Suchoptionen, type Suchtreffer, type Textteil } from '../../../../shared/src/listensuche';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import { Knopf } from '../knopf/Knopf';
import s from './Suche.module.css';

/**
 * Baustein Suche (#978, #994): ein Suchfeld für alle Listen – in den Trefferlisten der Ablage wie in der Mitte der
 * Werkbank. Anleitung im Entwicklerhandbuch, „Gestaltung und Bausteine → Suche“.
 *
 * - `Suchfeld`: das Feld selbst – Lupe, Platzhalter, Leeren per Klick auf „×“ oder mit Esc, Enter für eigene Wege
 *   (z. B. Archivnummer in der Ablage). Die Beschriftung ist für Screenreader da, sichtbar steht der Platzhalter.
 * - `ListenSuche`: Muster „Liste in der Mitte: Suchfeld oben, Filter darunter“ – Suchfeld, darunter die Filter
 *   (`FilterHaken`, `PaketFilter`), darunter die Trefferzahl („12 Treffer“, angesagt über `aria-live`).
 * - `KeineTreffer`: leerer Zustand mit „Suche und Filter zurücksetzen“.
 * - `Hervorgehoben` und `Fundstellen`: Titel mit hervorgehobenem Suchwort, darunter wo gefunden wurde (die ersten zwei,
 *   dann „+ 3 weitere“), wie die Fundstellen der Volltextsuche.
 * - `useListenSuche`: Zustand von Suche und Paketfilter und die gefundenen Einträge (Logik in shared/src/listensuche.ts).
 */

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');
const zahl = (n: number) => n.toLocaleString(gebietsschema());

export interface SuchfeldProps {
  wert: string;
  setze(wert: string): void;
  /** Name des Felds für Screenreader, z. B. „Mappentypen durchsuchen“. */
  beschriftung: string;
  /** Sichtbarer Platzhalter: worin gesucht wird, z. B. „Suchen in Name, Feldern, Registern …“. */
  platzhalter?: string;
  /** Enter im Feld (z. B. Archivnummer in der Ablage). */
  onEnter?(wert: string): void;
  className?: string;
  /** Sprungziel für Rundgänge und Tests (`data-anker`). */
  anker?: string;
  /** Zugriff auf die Eingabe, z. B. um den Fokus nach dem Umschalten zurückzugeben (Startseite, #1002). */
  feldRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Das Suchfeld: Lupe, Eingabe, „×“ zum Leeren (nur mit Inhalt). Esc leert ebenfalls und bleibt im Feld. Ohne
 * Vorschläge des Browsers und ohne Rechtschreibprüfung (Namen und Nummern); die Bildschirmtastatur zeigt „Suchen“.
 */
export function Suchfeld({ wert, setze, beschriftung, platzhalter, onEnter, className, anker, feldRef }: SuchfeldProps) {
  const eigen = useRef<HTMLInputElement>(null);
  const ref = feldRef ?? eigen;
  const taste = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && wert) { e.preventDefault(); e.stopPropagation(); setze(''); }
    else if (e.key === 'Enter' && onEnter) onEnter(wert);
  };
  return (
    <div className={klassen('suche', s.suchfeld, className)} data-anker={anker}>
      <label className={s.feld}>
        <span className="sr">{beschriftung}</span>
        <Symbol name="suche" className={s.lupe} />
        <input ref={ref} type="search" enterKeyHint="search" autoComplete="off" spellCheck={false} value={wert} placeholder={platzhalter} onChange={(e) => setze(e.target.value)} onKeyDown={taste} />
      </label>
      {wert && (
        <Knopf art="link" nurSymbol={t('oberflaeche.suche.leeren')} className={s.leeren} onClick={() => { setze(''); ref.current?.focus(); }}>
          <Symbol name="schliessen" />
        </Knopf>
      )}
    </div>
  );
}

export interface ListenSucheProps extends Omit<SuchfeldProps, 'className'> {
  /** Filter unter dem Suchfeld: `FilterHaken`, `PaketFilter` … */
  filter?: ReactNode;
  /** Wie viele Einträge passen; null = lädt noch (dann keine Zahl). */
  treffer: number | null;
  /** Suche oder ein Filter aktiv? Dann „12 Treffer“, sonst `anzahl`. */
  aktiv: boolean;
  /** Ohne Suche und Filter, z. B. „12 Mappentypen“; leer = keine Zeile. */
  anzahl?: string;
}

/**
 * Muster „Liste in der Mitte: Suchfeld oben, Filter darunter“ (#994): eine Suchregion mit dem Suchfeld, den Filtern
 * und der Trefferzahl. Am Handy bleibt die Suchregion oben stehen, wenn die Liste rollt.
 */
export function ListenSuche({ filter, treffer, aktiv, anzahl, ...feld }: ListenSucheProps) {
  const zahlText = treffer === null ? '' : aktiv ? t('oberflaeche.suche.treffer', { anzahl: treffer, zahl: zahl(treffer) }) : anzahl ?? '';
  return (
    <div className={s.listensuche} role="search" aria-label={feld.beschriftung}>
      <Suchfeld {...feld} />
      {filter && <div className={s.filter} role="group" aria-label={t('oberflaeche.suche.filter')}>{filter}</div>}
      <p className={klassen('listenzahl leise klein', s.zahl)} aria-live="polite">{zahlText}</p>
    </div>
  );
}

/** Ein Haken unter dem Suchfeld, z. B. „Nur offene zeigen“ oder „Erledigte zeigen“. */
export function FilterHaken({ an, setze, children, anker }: { an: boolean; setze(an: boolean): void; children: ReactNode; anker?: string }) {
  return (
    <label className="haken klein" data-anker={anker}>
      <input type="checkbox" checked={an} onChange={(e) => setze(e.target.checked)} /><span>{children}</span>
    </label>
  );
}

export interface PaketFilterProps {
  /** `ALLE_HERKUENFTE` (''), `EIGENE` ('-') oder die Id eines Pakets. */
  wert: string;
  setze(wert: string): void;
  /** Pakete zur Wahl (nur die, die in der Liste vorkommen), mit Namen. */
  pakete: Array<{ id: string; name: string }>;
  /** Gibt es Einträge ohne Paket? Dann steht „Eigene (ohne Paket)“ zur Wahl. */
  eigene: boolean;
  /** Andere Beschriftung, z. B. „Herkunft“ (#992). */
  beschriftung?: string;
}

/** Filter „Paket“: alle, eigene (ohne Paket) oder ein Paket. Ohne Pakete in der Liste gibt es ihn nicht. */
export function PaketFilter({ wert, setze, pakete, eigene, beschriftung }: PaketFilterProps) {
  if (!pakete.length && wert === ALLE_HERKUENFTE) return null;
  return (
    <label className={s.wahl}>
      <span>{beschriftung ?? t('oberflaeche.suche.paket')}</span>
      <select value={wert} onChange={(e) => setze(e.target.value)}>
        <option value={ALLE_HERKUENFTE}>{t('oberflaeche.suche.paket.alle')}</option>
        {(eigene || wert === EIGENE) && <option value={EIGENE}>{t('oberflaeche.suche.paket.eigene')}</option>}
        {pakete.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}

/** Leerer Zustand, wenn Suche oder Filter alles ausblenden – mit dem Weg zurück. */
export function KeineTreffer({ zuruecksetzen, text, knopf }: { zuruecksetzen(): void; text?: ReactNode; knopf?: ReactNode }) {
  return (
    <p className={klassen('leise leerliste', s.keine)}>
      <span>{text ?? t('oberflaeche.suche.keine')}</span>{' '}
      <Knopf art="link" onClick={zuruecksetzen}>{knopf ?? t('oberflaeche.suche.zuruecksetzen')}</Knopf>
    </p>
  );
}

/** Text mit hervorgehobenen Treffern (`<mark>`); ohne Teile der Text selbst. */
export function Hervorgehoben({ teile, text }: { teile?: Textteil[]; text: ReactNode }) {
  if (!teile) return <>{text}</>;
  return <>{teile.map((x, i) => (x.treffer ? <mark key={i} className={s.mark}>{x.text}</mark> : <span key={i}>{x.text}</span>))}</>;
}

/** Wo gefunden: die ersten `max` Fundstellen, darunter „+ 3 weitere“. */
export function Fundstellen({ funde, max = 2 }: { funde: Fund[]; max?: number }) {
  if (!funde.length) return null;
  const rest = funde.length - max;
  return (
    <span className={s.funde}>
      {funde.slice(0, max).map((f, i) => (
        <span key={i} className={s.fund}>
          <span className={s.wo}>{f.wo}</span>{f.teile.length > 0 && <>: <Hervorgehoben teile={f.teile} text="" /></>}
        </span>
      ))}
      {rest > 0 && <span className={s.weitere}>{t('oberflaeche.suche.weitere', { anzahl: rest, zahl: zahl(rest) })}</span>}
    </span>
  );
}

export interface ListenSucheOptionen<T> extends Suchoptionen {
  /** Worin gesucht wird, je Eintrag (Name mit `titel: true`). */
  quellen(e: T): Fundquelle[];
  /** Herkunft eines Eintrags: Paket-Id oder null für eigene. Ohne Angabe gibt es keinen Paketfilter. */
  herkunft?(e: T): string | null | undefined;
}

/**
 * Zustand einer durchsuchbaren Liste: Eingabe, Paketfilter und die passenden Einträge mit Fundstellen. Gesucht wird
 * beim Tippen in dem, was die Seite geladen hat – ohne Anfrage an den Server.
 */
export function useListenSuche<T>(eintraege: readonly T[], o: ListenSucheOptionen<T>) {
  const [eingabe, setEingabe] = useState('');
  const [paket, setPaket] = useState(ALLE_HERKUENFTE);
  const gefiltert = o.herkunft ? eintraege.filter((e) => herkunftPasst(paket, o.herkunft!(e))) : eintraege;
  const treffer: Array<Suchtreffer<T>> = durchsuche(gefiltert, o.quellen, eingabe, o);
  const herkuenfte = o.herkunft ? eintraege.map((e) => o.herkunft!(e) ?? null) : [];
  const gesucht = suchwoerter(eingabe).length > 0;
  return {
    eingabe, setEingabe, paket, setPaket, treffer, gesucht,
    /** Suche oder Paketfilter aktiv. Weitere Filter der Liste rechnet die Seite selbst dazu. */
    aktiv: gesucht || paket !== ALLE_HERKUENFTE,
    /** Paket-Ids, die in der Liste vorkommen, und ob es eigene Einträge gibt. */
    paketeDa: [...new Set(herkuenfte.filter((x): x is string => !!x))],
    eigeneDa: herkuenfte.some((x) => !x),
    zuruecksetzen: () => { setEingabe(''); setPaket(ALLE_HERKUENFTE); },
  };
}
export type ListenSucheZustand<T> = ReturnType<typeof useListenSuche<T>>;
