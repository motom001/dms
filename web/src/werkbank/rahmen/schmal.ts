import { useEffect, useState } from 'react';
import { handyGruppe } from '../../../../shared/src/werkbankansicht';

/**
 * Bis zu welcher Breite die Werkbank den Handy-Aufbau zeigt (#1204): nach Breite, nicht nach Gerät. Das iPad hoch
 * (ab 768 px) und quer bekommt die volle Werkbank wie der Rechner – für Petra mit iPhone und iPad ist das Tablet der
 * Rechner. Die übrige Oberfläche (Ablage, Kopfzeile) bricht weiter bei 820 px um. Dieselbe Grenze steht in den
 * Stylesheets der Werkbank als `(max-width: 767px)` bzw. `(min-width: 768px)`.
 */
export const WERKBANK_SCHMAL = 767;

/** Schmal wie die Werkbank am Handy (bis 767 px)? Folgt dem Drehen und dem Ändern der Fenstergröße. */
function useWerkbankSchmal() {
  const abfrage = `(max-width: ${WERKBANK_SCHMAL}px)`;
  const [an, setAn] = useState(() => typeof matchMedia === 'function' && matchMedia(abfrage).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(abfrage);
    const f = () => setAn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [abfrage]);
  return an;
}

/**
 * Werkbank am Handy (#1204): schmal? Stehen die Bereiche gerade als eigener Schritt da (`/werkbank?bereiche`)? `handy`
 * für die Navigation, mit der Gruppe aus `?bereiche=<gruppe>`; am Rechner und Tablet `null`.
 */
export function useWerkbankHandy(bereich: string) {
  const schmal = useWerkbankSchmal();
  const suche = new URLSearchParams(location.search);
  return {
    schmal,
    bereiche: schmal && bereich === 'uebersicht' && suche.has('bereiche'),
    handy: schmal ? { gruppe: handyGruppe(suche.get('bereiche')) } : null,
  };
}
