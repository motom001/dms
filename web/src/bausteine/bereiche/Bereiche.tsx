import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Knopf } from '../knopf/Knopf';
import s from './Bereiche.module.css';

/**
 * Baustein Bereiche (#1000): das Muster „Editor rechts: Sprungleiste + Bereiche“, wie es mit dem Mappentyp (#144) und
 * der Ansicht (#148) begann. Anleitung im Entwicklerhandbuch, „Gestaltung und Bausteine → Bereiche“.
 *
 * - `useBereiche(liste, editor, id)` hält, welche Bereiche offen sind: neu (`id` null) = alles offen, bestehend = wie
 *   zuletzt auf diesem Gerät (sonst zu, mit `{ offen: true }` offen – für Editoren ohne Speichern), ein Anker in der
 *   Adresse (`#felder`) öffnet seinen Bereich und springt hin.
 * - Ein Sprung aus der Leiste öffnet den Bereich, rollt hin und setzt den Fokus auf seinen Kopf.
 * - `leiste()` zeichnet oben die Sprungleiste mit „Alle aufklappen / Alle zuklappen“ – erst ab drei Bereichen
 *   (`SPRUNGLEISTE_AB`). Kleinere Editoren zeigen ihre Bereiche fest offen, ohne Leiste und ohne Klappen.
 * - `Bereich` ist ein Blatt mit Kopf (Titel, Hilfe, Kurzinfo im zugeklappten Zustand) und Inhalt. Eingeklappt bleibt
 *   der Inhalt im Dokument (nur verborgen), damit Eingaben und Ergebnisse nicht verloren gehen.
 * - Fehler: `klappe(k, true)` färbt Bereich und Sprung; `oeffne([k])` klappt auf und springt hin – so öffnet eine
 *   Fehlermeldung beim Speichern den betroffenen Bereich.
 */

/** Auf- und Zuklappen eines Bereichs. `fest`: kleiner Editor ohne Sprungleiste – immer offen, kein Klappen. */
export interface Klappe { offen: boolean; umschalten(): void; fehler?: boolean; fest?: boolean }

/** Bereiche eines Editors in ihrer Reihenfolge: Schlüssel (zugleich Anker) und Name in der Sprungleiste. */
export type BereichListe<K extends string> = ReadonlyArray<readonly [K, string]>;

/** Ab so vielen Bereichen gibt es Sprungleiste und Klappen (Akzeptanzkriterium #1000). */
export const SPRUNGLEISTE_AB = 3;

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

/**
 * Ein Bereich: Kopf mit Titel und Kurzinfo, darunter der Inhalt. Die `id` ist zugleich der Anker in der Adresse und
 * das Sprungziel der Leiste.
 */
export function Bereich({ id, titel, hilfe, kurz, beschreibung, klappe, className, children }: {
  id: string; titel: string; hilfe?: ReactNode; kurz?: ReactNode; beschreibung?: ReactNode; klappe: Klappe; className?: string; children: ReactNode;
}) {
  const { offen, umschalten, fehler, fest } = klappe;
  const zeichen = fehler && <span className="chip schlecht">{t('oberflaeche.bereiche.fehler')}</span>;
  return (
    <section className={klassen('blatt', s.bereich, !offen && s.zu, fehler && s.mitfehler, className)} id={id} aria-labelledby={`${id}-kopf`} data-bereich={id}>
      <div className={s.kopf}>
        <h2 className="h3">
          {fest
            ? <span id={`${id}-kopf`} className={s.titel}>{titel}{zeichen}</span>
            : <button type="button" id={`${id}-kopf`} className={s.knopf} aria-expanded={offen} aria-controls={`${id}-inhalt`} onClick={umschalten}>
              <span className={s.pfeil} aria-hidden="true">▸</span>{titel}{zeichen}
            </button>}
          {hilfe}
        </h2>
        {!offen && kurz ? <p className={klassen(s.kurz, 'leise')}>{kurz}</p> : null}
      </div>
      <div id={`${id}-inhalt`} className={s.inhalt} hidden={!offen}>
        {beschreibung && <p className={klassen('leise', s.text)}>{beschreibung}</p>}
        {children}
      </div>
    </section>
  );
}

/** Mappentypen (#144) und Ansichten (#148) behalten ihre bisherigen Speicherorte; neue Editoren `dms.<editor>editor.offen`. */
const ALT: Record<string, string> = { typ: 'dms.typeditor.offen', sicht: 'dms.sichteditor.offen' };
const speicherort = (editor: string) => ALT[editor] ?? `dms.${editor}editor.offen`;

/** Welche Bereiche eines Eintrags auf diesem Gerät offen sind; null = noch nichts gemerkt. */
export function liesOffen<K extends string = string>(editor: string, id: string): K[] | null {
  try {
    const x = JSON.parse(localStorage.getItem(speicherort(editor)) ?? '{}') as Record<string, unknown>;
    return Array.isArray(x[id]) ? (x[id] as K[]) : null;
  } catch { return null; }
}

/** Merkt die offenen Bereiche eines Eintrags – je Editor die zuletzt bearbeiteten 200 Einträge. */
export function merkeOffen(editor: string, id: string, offen: Iterable<string>) {
  try {
    const x = JSON.parse(localStorage.getItem(speicherort(editor)) ?? '{}') as Record<string, unknown>;
    delete x[id];
    x[id] = [...offen];
    const keys = Object.keys(x);
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete x[k];
    localStorage.setItem(speicherort(editor), JSON.stringify(x));
  } catch { /* privates Fenster o. Ä. – dann eben nicht merken */ }
}

/**
 * Bereiche, die ein Fehler beim Speichern betrifft: `details.orte` der Antwort des Servers (nur Bereiche dieses
 * Editors), sonst `ersatz` – meist der Bereich mit den meisten Eingaben oder die Grunddaten.
 */
export function fehlerBereiche<K extends string>(x: unknown, liste: BereichListe<K>, ersatz: K[]): K[] {
  const orte = (x as { details?: { orte?: unknown } } | null)?.details?.orte;
  const bekannt = Array.isArray(orte) ? liste.map(([k]) => k).filter((k) => orte.includes(k)) : [];
  return bekannt.length ? bekannt : ersatz;
}

const anker = () => (typeof location === 'undefined' ? '' : decodeURIComponent(location.hash.slice(1)));
/**
 * Zum Bereich rollen. `fokus`: danach den Fokus auf seinen Kopf setzen (nach einem Sprung aus der Leiste), damit Tab im
 * Bereich weitergeht und nicht in der Sprungleiste bleibt (#1000, Musterkatalog C15).
 */
const springe = (k: string, fokus = false) => setTimeout(() => {
  document.getElementById(k)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  if (fokus) document.getElementById(`${k}-kopf`)?.focus({ preventScroll: true });
}, 30);

export interface BereicheZustand<K extends string> {
  /** Offene Bereiche. */
  auf: Set<K>;
  /** Gibt es Sprungleiste und Klappen (ab drei Bereichen)? */
  mitLeiste: boolean;
  /** Zustand eines Bereichs für `<Bereich klappe={…}>`; `fehler` färbt ihn. */
  klappe(k: K, fehler?: boolean): Klappe;
  /**
   * Bereiche öffnen und (Vorgabe) zum ersten springen – z. B. nach einem Fehler beim Speichern. `fokus`: auch den
   * Fokus auf seinen Kopf setzen, wie ein Sprung aus der Leiste (z. B. für einen Verweis „im Bereich …“ im Text).
   */
  oeffne(ks: K[], springen?: boolean, fokus?: boolean): void;
  /** Die Sprungleiste (oder nichts, unter drei Bereichen). `fehler` markiert Sprünge, `beschriftung` nennt den Editor. */
  leiste(fehler?: (k: K) => boolean, beschriftung?: string): ReactNode;
  /** Nach dem Anlegen: den offenen Zustand für die neue Kennung merken (bleibt aufgeklappt wie gerade). */
  merke(neueId: string): void;
}

/** Wahlweise Einstellungen für `useBereiche`. */
export interface BereicheOptionen {
  /**
   * Bestehende Einträge offen starten, solange dieses Gerät nichts gemerkt hat – für Editoren ohne Speichern (nur
   * Ansehen und Sofortaktionen, z. B. die Datenschutz-Auskunft), wo man sonst vor jeder Handlung erst aufklappen müsste.
   */
  offen?: boolean;
}

/**
 * Auf- und Zuklappen samt Sprungleiste für einen Editor. `editor` benennt den Speicherort (z. B. `'postfach'`),
 * `id` den Eintrag; `null` für „neu“ (dann ist alles offen und nichts wird gemerkt).
 */
export function useBereiche<K extends string>(liste: BereichListe<K>, editor: string, id: string | null, optionen: BereicheOptionen = {}): BereicheZustand<K> {
  const [auf, setAuf] = useState<Set<K>>(() => {
    const alle = liste.map(([k]) => k);
    const x = new Set<K>(!id ? alle : liesOffen<K>(editor, id) ?? (optionen.offen ? alle : []));
    const h = anker();
    if (liste.some(([k]) => k === h)) x.add(h as K);
    return x;
  });
  const mitLeiste = liste.length >= SPRUNGLEISTE_AB;
  // Ein Bereich, der erst beim Bearbeiten dazukommt (z. B. „Anmeldung per OAuth“ nach der Wahl), steht offen da.
  const gesehen = useRef(new Set<K>(liste.map(([k]) => k)));
  const neueKeys = liste.map(([k]) => k).filter((k) => !gesehen.current.has(k));
  useEffect(() => {
    if (!neueKeys.length) return;
    for (const k of neueKeys) gesehen.current.add(k);
    setAuf((x) => new Set([...x, ...neueKeys]));
  }, [neueKeys.join(' ')]); // eslint-disable-line react-hooks/exhaustive-deps -- nur wenn wirklich neue Bereiche dazukommen
  const stelle = (n: Set<K>) => { if (id) merkeOffen(editor, id, n); return n; };
  useEffect(() => { const h = anker(); if (liste.some(([k]) => k === h)) springe(h); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Sprungziel aus der Adresse nur beim ersten Anzeigen
  const oeffne = (ks: K[], springen = true, fokus = false) => {
    if (!ks.length) return;
    setAuf((x) => stelle(new Set([...x, ...ks])));
    if (springen) springe(ks[0], fokus);
  };
  const klappe = (k: K, fehler?: boolean): Klappe => (mitLeiste ? {
    offen: auf.has(k), fehler,
    umschalten: () => setAuf((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return stelle(n); }),
  } : { offen: true, fest: true, fehler, umschalten: () => undefined });
  const alle = liste.every(([k]) => auf.has(k));
  const leiste = (fehler: (k: K) => boolean = () => false, beschriftung = t('oberflaeche.bereiche.leiste')) => (!mitLeiste ? null : (
    <nav className={s.leiste} aria-label={beschriftung} data-sprungleiste="">
      {liste.map(([k, name]) => (
        <button key={k} type="button" className={klassen(s.sprung, auf.has(k) && s.an, fehler(k) && s.fehler)} onClick={() => oeffne([k], true, true)}
          title={fehler(k) ? t('oberflaeche.bereiche.fehler-name', { name }) : name}>
          {name}{fehler(k) && <span className={s.fehlerpunkt} aria-label={t('oberflaeche.bereiche.mit-fehler')}>!</span>}
        </button>
      ))}
      <span className={s.luecke} aria-hidden="true" />
      <Knopf art="link" groesse="klein" onClick={() => setAuf(stelle(alle ? new Set() : new Set(liste.map(([k]) => k))))}>
        {alle ? t('oberflaeche.bereiche.alle-zuklappen') : t('oberflaeche.bereiche.alle-aufklappen')}</Knopf>
    </nav>
  ));
  return { auf, mitLeiste, klappe, oeffne, leiste, merke: (neueId: string) => merkeOffen(editor, neueId, auf) };
}
