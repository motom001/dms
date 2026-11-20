/**
 * Lage einer aufklappenden Liste (#1488): unter dem Knopf, wenn sie dort Platz hat – sonst darüber; passt sie nirgends
 * ganz, auf der Seite mit mehr Platz und mit eigener Rollleiste in der Liste. Der Platz des Assistenten unten rechts
 * (`frei`) zählt nicht als Platz. Die Liste liegt fest im Fenster (`position: fixed`) – so verlängert sie keine Spalte
 * und erzeugt keine Rollleiste für die Seite. Muster für alle Bausteine, die etwas aufklappen (Menü, Kalender).
 */
export interface Aufklapplage {
  /** Nach oben aufgeklappt. */
  oben: boolean;
  /** Abstand zum oberen bzw. unteren Fensterrand (je nach `oben`). */
  top?: number;
  bottom?: number;
  /** Rechts- bzw. linksbündig mit dem Knopf. */
  left?: number;
  right?: number;
  /** Höchste Höhe der Liste; was darüber hinausgeht, rollt in der Liste. */
  maxHoehe: number;
}

interface Rechteck {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Abstand zwischen Knopf und Liste und zum Fensterrand. */
const ABSTAND = 4;
const RAND = 8;

export function aufklapplage(
  knopf: Rechteck,
  hoehe: number,
  fenster: { breite: number; hoehe: number },
  o: { frei?: number; links?: boolean } = {},
): Aufklapplage {
  const unten = fenster.hoehe - knopf.bottom - ABSTAND - RAND - (o.frei ?? 0);
  const oben = knopf.top - ABSTAND - RAND;
  const nachOben = hoehe > unten && oben > unten;
  const seite = o.links ? { left: Math.max(RAND, knopf.left) } : { right: Math.max(RAND, fenster.breite - knopf.right) };
  return nachOben
    ? { oben: true, bottom: fenster.hoehe - knopf.top + ABSTAND, ...seite, maxHoehe: Math.max(0, oben) }
    : { oben: false, top: knopf.bottom + ABSTAND, ...seite, maxHoehe: Math.max(0, unten) };
}

/** Platz des Assistenten unten rechts aus `--platz-begleiter` (tokens.css); ohne Angabe 0. */
function platzUnten(): number {
  if (typeof document === 'undefined') return 0;
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--platz-begleiter')) || 0;
}

/**
 * Die Liste fest ins Fenster legen. Ein Vorfahr kann der Bezugsrahmen für `position: fixed` sein (z. B. mit
 * `container`): Gemessen wird daher, wo die Liste bei 0/0 landet, und um diesen Versatz verschoben. Gesetzt werden nur
 * `top` und `left` – sie gelten in jedem Bezugsrahmen gleich.
 */
export function legeFest(liste: HTMLElement, knopf: HTMLElement, links?: boolean): Aufklapplage {
  const st = liste.style;
  Object.assign(st, { position: 'fixed', top: '0px', left: '0px', right: 'auto', bottom: 'auto', maxHeight: 'none' });
  const ursprung = liste.getBoundingClientRect();
  const fenster = { breite: innerWidth, hoehe: innerHeight };
  const l = aufklapplage(knopf.getBoundingClientRect(), ursprung.height, fenster, { frei: platzUnten(), links });
  const hoehe = Math.min(ursprung.height, l.maxHoehe);
  const top = l.oben ? fenster.hoehe - (l.bottom ?? 0) - hoehe : (l.top ?? 0);
  const left = l.left ?? Math.max(RAND, fenster.breite - (l.right ?? 0) - ursprung.width);
  Object.assign(st, { top: `${top - ursprung.top}px`, left: `${left - ursprung.left}px`, maxHeight: `${l.maxHoehe}px` });
  liste.dataset.oben = l.oben ? 'ja' : 'nein';
  return l;
}
