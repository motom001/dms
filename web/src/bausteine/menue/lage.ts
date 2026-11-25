/**
 * Lage einer aufklappenden Liste (#1488): unter dem Knopf, wenn sie dort Platz hat – sonst darüber; passt sie nirgends
 * ganz, auf der Seite mit mehr Platz und mit eigener Rollleiste in der Liste. Der Platz des Assistenten unten rechts
 * (`frei`) zählt nicht als Platz. Waagerecht bündig mit dem Knopf, solange die Liste ins Fenster passt (#1556). Die Liste
 * liegt fest im Fenster (`position: fixed`) – so verlängert sie keine Spalte und erzeugt keine Rollleiste für die Seite.
 * Muster für alle Bausteine, die etwas aufklappen (Menü, Kalender, #1532).
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
  o: { frei?: number; links?: boolean; breite?: number } = {},
): Aufklapplage {
  const unten = fenster.hoehe - knopf.bottom - ABSTAND - RAND - (o.frei ?? 0);
  const oben = knopf.top - ABSTAND - RAND;
  const nachOben = hoehe > unten && oben > unten;
  const seite = waagerecht(knopf, fenster.breite, o.links, o.breite);
  return nachOben
    ? { oben: true, bottom: fenster.hoehe - knopf.top + ABSTAND, ...seite, maxHoehe: Math.max(0, oben) }
    : { oben: false, top: knopf.bottom + ABSTAND, ...seite, maxHoehe: Math.max(0, unten) };
}

/**
 * Waagerecht (#1556): bündig mit der bevorzugten Kante des Knopfs (links oder rechts), wenn die Liste dort ganz ins
 * Fenster passt; sonst bündig mit der anderen Kante; passt beides nicht, mit 8 px Abstand am Fensterrand. Ohne `breite`
 * (Liste noch nicht gemessen) nur die bevorzugte Kante.
 */
function waagerecht(knopf: Rechteck, fensterbreite: number, links?: boolean, breite?: number): { left?: number; right?: number } {
  const linksBuendig = { left: Math.max(RAND, knopf.left) };
  const rechtsBuendig = { right: Math.max(RAND, fensterbreite - knopf.right) };
  if (breite === undefined) return links ? linksBuendig : rechtsBuendig;
  const passtLinks = knopf.left >= RAND && knopf.left + breite <= fensterbreite - RAND;
  const passtRechts = knopf.right <= fensterbreite - RAND && knopf.right - breite >= RAND;
  if (links ? passtLinks : passtRechts) return links ? linksBuendig : rechtsBuendig;
  if (links ? passtRechts : passtLinks) return links ? rechtsBuendig : linksBuendig;
  // Passt an keiner Kante: so nah an der bevorzugten wie möglich, mit 8 px Abstand zum Fensterrand.
  return { left: Math.max(RAND, Math.min(links ? knopf.left : knopf.right - breite, fensterbreite - RAND - breite)) };
}

/** Platz des Assistenten unten rechts aus `--platz-begleiter` (tokens.css); ohne Angabe 0. */
function platzUnten(): number {
  if (typeof document === 'undefined') return 0;
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--platz-begleiter')) || 0;
}

/**
 * Die Liste fest ins Fenster legen. Ein Vorfahr kann der Bezugsrahmen für `position: fixed` sein (z. B. mit
 * `container`): Gemessen wird daher, wo die Liste bei 0/0 landet, und um diesen Versatz verschoben. Gesetzt werden nur
 * `top` und `left` – sie gelten in jedem Bezugsrahmen gleich. `hoechstens` (#1670): die Liste wird nie höher, auch wenn
 * mehr Platz ist (z. B. die Vorschläge der Mehrfachauswahl, sonst bis 280 px wie in gemeinsam-listen.css).
 */
export function legeFest(liste: HTMLElement, knopf: HTMLElement, links?: boolean, hoechstens = Infinity): Aufklapplage {
  const st = liste.style;
  Object.assign(st, { position: 'fixed', top: '0px', left: '0px', right: 'auto', bottom: 'auto', maxHeight: 'none' });
  const ursprung = liste.getBoundingClientRect();
  const fenster = { breite: innerWidth, hoehe: innerHeight };
  const gross = Math.min(ursprung.height, hoechstens);
  const lage = aufklapplage(knopf.getBoundingClientRect(), gross, fenster, { frei: platzUnten(), links, breite: ursprung.width });
  const l = { ...lage, maxHoehe: Math.min(lage.maxHoehe, hoechstens) };
  const hoehe = Math.min(ursprung.height, l.maxHoehe);
  const top = l.oben ? fenster.hoehe - (l.bottom ?? 0) - hoehe : (l.top ?? 0);
  const left = l.left ?? Math.max(RAND, fenster.breite - (l.right ?? 0) - ursprung.width);
  Object.assign(st, { top: `${top - ursprung.top}px`, left: `${left - ursprung.left}px`, maxHeight: `${l.maxHoehe}px` });
  liste.dataset.oben = l.oben ? 'ja' : 'nein';
  return l;
}
