/**
 * Lage der Vorschläge der Mehrfachauswahl (#1670): dieselbe Regel wie bei den Menüs (`aufklapplage` aus menue/lage.ts) –
 * unter dem Suchfeld, wenn dort Platz ist, sonst darüber; höchstens 280 px hoch, der Rest rollt in der Liste. Anders als
 * das Menü bleibt die Liste am Feld (`position: absolute`, gemeinsam-listen.css) und rollt mit ihm: Gerechnet wird nur
 * im sichtbaren Teil der Spalte, in der das Feld rollt (nicht unter einer Kopfzeile, nicht über den Fensterrand).
 */
import { aufklapplage } from '../menue/lage';

/** Höchste Höhe wie `.wahlliste` in gemeinsam-listen.css. */
const LISTE_HOECHSTENS = 280;

interface Kante {
  top: number;
  bottom: number;
}

/** Richtung und Höchsthöhe: `feld` und `sichtbar` in Fensterkoordinaten, `hoehe` die volle Höhe der Liste. */
export function vorschlagLage(feld: Kante, sichtbar: Kante, hoehe: number, frei = 0): { oben: boolean; maxHoehe: number } {
  const innen = { top: feld.top - sichtbar.top, bottom: feld.bottom - sichtbar.top, left: 0, right: 0 };
  const l = aufklapplage(innen, Math.min(hoehe, LISTE_HOECHSTENS), { breite: 0, hoehe: sichtbar.bottom - sichtbar.top }, { frei });
  return { oben: l.oben, maxHoehe: Math.min(LISTE_HOECHSTENS, l.maxHoehe) };
}

/** Sichtbarer Teil des Fensters um `el`: das Fenster, beschnitten von jedem Vorfahren, der seinen Inhalt rollt oder abschneidet. */
function sichtbarUm(el: HTMLElement): Kante {
  let top = 0;
  let bottom = innerHeight;
  for (let x = el.parentElement; x && x !== document.body; x = x.parentElement) {
    if (!['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(x).overflowY)) continue;
    const r = x.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  return { top, bottom };
}

/** Platz des Assistenten unten rechts (`--platz-begleiter`, wie bei den Menüs); ohne Angabe 0. */
const platzUnten = () => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--platz-begleiter')) || 0;

/** Die offene Liste in `wahl` nach oben oder unten legen und ihre Höhe begrenzen; `data-oben` sagt, wohin. */
export function legeVorschlaege(wahl: HTMLElement | null) {
  const liste = wahl?.querySelector<HTMLElement>(':scope > .wahlliste');
  if (!wahl || !liste) return;
  const rand = liste.offsetHeight - liste.clientHeight;
  const l = vorschlagLage(wahl.getBoundingClientRect(), sichtbarUm(wahl), liste.scrollHeight + rand, platzUnten());
  Object.assign(liste.style, l.oben ? { top: 'auto', bottom: 'calc(100% + 4px)' } : { top: '', bottom: '' });
  liste.style.maxHeight = `${l.maxHoehe}px`;
  liste.dataset.oben = l.oben ? 'ja' : 'nein';
}
