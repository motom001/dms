import { darfNeuLaden, istOberflaechenDatei, type Ladeziel } from '../../shared/src/veraltet';

/**
 * Veraltete Oberfläche im Browser (#933) – ohne React, damit main.tsx es schon vor dem ersten Bild anbinden kann.
 * Fehlt ein nachgeladener Teil oder ein Stylesheet der Oberfläche, wird gemeldet (erreichbar.tsx zeigt dann die
 * Leiste „Eine neue Version ist da“). Selbst neu laden höchstens einmal je Minute (gemerkt in sessionStorage).
 */

const ZULETZT = 'ablago:selbst-neu-geladen';
const HINWEIS = 'ablago:selbst-neu-geladen-hinweis';

let melder: (() => void) | null = null;
let vorgemerkt = false;

/** Die Oberfläche gehört zu einem älteren Stand. */
export function meldeVeraltet() {
  if (melder) melder();
  else vorgemerkt = true;
}

/** Empfänger der Meldung (erreichbar.tsx); eine schon vorgemerkte Meldung kommt sofort. */
export function beiVeraltet(f: () => void) {
  melder = f;
  if (vorgemerkt) {
    vorgemerkt = false;
    f();
  }
}

let beobachtet = false;
/** Ladefehler beobachten: Vite meldet fehlende Teile (`vite:preloadError`), der Browser fehlende Stylesheets und Skripte. */
export function beobachteVeraltet() {
  if (beobachtet) return;
  beobachtet = true;
  addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    meldeVeraltet();
  });
  // Ladefehler von Elementen steigen nicht auf – nur in der Einfangphase am Fenster zu sehen.
  addEventListener(
    'error',
    (e) => {
      if (istOberflaechenDatei(e.target as Ladeziel | null, location.origin)) meldeVeraltet();
    },
    true,
  );
}

/** Zeitpunkt des letzten eigenen Neuladens; null, wenn keins (oder sessionStorage nicht nutzbar). */
export function zuletztNeuGeladen(): number | null {
  try {
    const v = sessionStorage.getItem(ZULETZT);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

/**
 * Selbst neu laden, wenn es erlaubt ist (höchstens einmal je Minute). Ohne sessionStorage lässt sich die Schleife
 * nicht ausschließen – dann nicht selbst laden, die Leiste bleibt stehen. Liefert, ob neu geladen wird.
 */
export function selbstNeuLaden(): boolean {
  try {
    const jetzt = Date.now();
    if (!darfNeuLaden(zuletztNeuGeladen(), jetzt)) return false;
    sessionStorage.setItem(ZULETZT, String(jetzt));
    sessionStorage.setItem(HINWEIS, '1');
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** Nach dem eigenen Neuladen einmal sagen, warum (z. B. warum ein Passwortfeld leer ist). Beim Laden gelesen. */
let hinweis = (() => {
  try {
    const v = sessionStorage.getItem(HINWEIS) === '1';
    sessionStorage.removeItem(HINWEIS);
    return v;
  } catch {
    return false;
  }
})();
export const neuGeladenHinweis = () => hinweis;
export function neuGeladenHinweisSchliessen() {
  hinweis = false;
}
