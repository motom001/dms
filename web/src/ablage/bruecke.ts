import { createContext, useContext, type DragEvent, type ReactNode } from 'react';
import type { Sicherheit } from '../../../shared/src/erkennung';
import type { Feld, Wert } from '../../../shared/src/model';
import type { Bereich } from '../../../shared/src/schwaerzen';

/**
 * Brücke zwischen Dokument und Mappe auf der Seite „Dokument übernehmen“ (#934): Die Seite stellt sie bereit, das
 * Formular der Mappe (MappeFormular) schließt sich an. Über sie
 * - leuchtet beim Überfahren eines Rahmens das passende Feld auf und umgekehrt (`hervor`),
 * - merkt sich die Seite das zuletzt gewählte Feld (`aktiv`) – ein Klick auf einen Rahmen oder markierter Text geht dorthin,
 * - nimmt ein Feld Werte an, die man vom Dokument hineinzieht (`nimm`),
 * - setzt die Seite Werte und zeigt Felder (`anschliessen`: das Formular kennt Register, Abschnitte und Rohwerte).
 * Ohne Brücke (überall sonst) verhält sich das Formular wie immer.
 */

/** Was vom Dokument kommt: ein Rahmen (Wert schon in der Art seines Felds) oder markierter Text. */
export interface Nutzlast {
  text: string;
  /** Erkannter Wert und die Art des Felds, für das er erkannt wurde. */
  wert?: Wert;
  feldTyp?: Feld['typ'];
  /** Beleg bzw. Vorschlag für ein Verweisfeld: die Mappe. */
  mappeId?: string;
  typId?: string;
  titel?: string;
}

/** Ein nummerierter, farbiger Rahmen an einer Fundstelle (oder nur die Nummer am Feld, wenn die Stelle fehlt). */
export interface Marke {
  nr: number;
  feldKey: string;
  dokId: string;
  /** Seite ab 1 und Lage relativ zur Seite; leer: Stelle nicht gefunden. */
  bereiche: Bereich[];
  nutzlast: Nutzlast;
  sicherheit?: Sicherheit;
  /** Beleg „Woran Ablago das erkennt“ (Abgleich) statt Vorschlag der Erkennung: seine Stelle in der Liste der Belege. */
  beleg?: number;
}

/** Was das Formular der Seite anbietet. */
export interface FormularAnschluss {
  /** Wert setzen (bei Mehrfachfeldern dazu), mit Titel und Typ bei Verweisen. */
  setze(feldKey: string, wert: Wert, bezug?: { id: string; titel: string; typId: string }): void;
  /** Register und Abschnitt des Felds öffnen und hinrollen. */
  zeige(feldKey: string): void;
  /**
   * Bereich markieren (#1597): mehrere Werte auf einmal als „Vorschlag“ eintragen (`fundstelle` steht daneben). Gibt
   * zurück, womit sich das wieder rückgängig machen lässt; null, wenn nichts eingetragen werden durfte.
   */
  vorschlagen?(werte: Array<{ key: string; wert: Wert }>, fundstelle: string): (() => void) | null;
}

export interface Bruecke {
  marken: Marke[];
  hervor: string | null;
  setHervor(feldKey: string | null): void;
  aktiv: string | null;
  setAktiv(feldKey: string | null): void;
  /** Wert vom Dokument in ein Feld; `ziel`: ein anderes Formular als das der Seite (Fenster „+ … anlegen“, #935). */
  nimm(f: Feld, n: Nutzlast, ziel?: FormularAnschluss): void;
  anschliessen(a: FormularAnschluss): () => void;
  /**
   * Fenster „+ … anlegen“ (#935) über der Seite: Solange eins offen ist, gehen angeklickte Rahmen und markierter Text
   * in dessen zuletzt gewähltes Feld (`nimm` liefert false, wenn dort keins gewählt ist). null meldet es wieder ab.
   */
  fenster(nimm: ((n: Nutzlast) => boolean) | null): void;
  /** Unter einem Feld, z. B. die Belege eines Verweisfelds. */
  unterFeld(f: Feld): ReactNode;
}

export const BrueckeKontext = createContext<Bruecke | null>(null);
export const useBruecke = () => useContext(BrueckeKontext);

/** Eigene Art beim Ziehen – fremde Ziele (Suchfeld, Ablegen von Dateien) sehen nur den Text. */
export const ZIEH_ART = 'application/x-ablago-wert';
export const ziehtWert = (e: DragEvent) => [...e.dataTransfer.types].includes(ZIEH_ART);
export function liesNutzlast(e: DragEvent): Nutzlast | null {
  try {
    const n = JSON.parse(e.dataTransfer.getData(ZIEH_ART)) as Nutzlast;
    return n && typeof n.text === 'string' ? n : null;
  } catch {
    return null;
  }
}
export function setzeNutzlast(e: DragEvent, n: Nutzlast) {
  e.dataTransfer.setData(ZIEH_ART, JSON.stringify(n));
  e.dataTransfer.setData('text/plain', n.text);
  e.dataTransfer.effectAllowed = 'copy';
}
/** Sechs Farben der Rahmen, reihum nach Nummer. */
export const farbeVon = (nr: number) => `ue-farbe-${((nr - 1) % 6) + 1}`;

/** Seite, auf der eine Marke beginnt (ab 1); ohne Stelle 1. */
export const seiteVon = (m: Marke) => m.bereiche[0]?.seite ?? 1;

/**
 * Nummer am Feld angeklickt (#1647): zum Rahmen der Marke im Dokument rollen – auch auf eine spätere Seite, deren Platz
 * schon feststeht –, ihn fokussieren (das Feld leuchtet mit) und kurz aufblinken lassen; bei „Bewegung reduzieren“
 * ohne Animation. Die Rahmen tragen dafür `data-marke`.
 */
export function zeigeFundstelle(nr: number) {
  const el = document.querySelector<HTMLElement>(`[data-marke="${nr}"]`);
  if (!el) return;
  const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: ruhig ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
  if (!ruhig && typeof el.animate === 'function')
    el.animate([{ boxShadow: '0 0 0 0 var(--ue-f)' }, { boxShadow: '0 0 0 12px transparent' }], { duration: 700, iterations: 3 });
}
