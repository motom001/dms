import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Hilfeort } from '../../../shared/src/hilfe';
import { Knopf } from '../bausteine';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import { useWerkbankSchmal } from './rahmen/schmal';

/**
 * Kopf einer Werkbank-Seite. Seit #725 stehen manche frühere Bereiche als Abschnitt auf einer anderen Seite
 * (Wiederherstellen unter Sicherung, Wartungsmodus unter Wartung …): dann wird aus der Überschrift ein
 * Abschnittstitel mit Sprungmarke (`id`), damit alte Lesezeichen über `#…` an die richtige Stelle führen.
 *
 * Seiten-Hilfe (#985): `hilfe` setzt das „?“ direkt hinter die Überschrift – h1 wie Abschnitts-h2, überall mit
 * gleichem Abstand und gleicher Größe, nie am Ende der Beschreibung (children). Hilfe zu einem einzelnen Feld bleibt
 * an dessen Beschriftung (Feld, #801).
 *
 * Am Handy (#1291, bis 767 px) steht die Beschreibung einer Seite in einer Zeile mit „Mehr“ (`Einleitung`): Sonst
 * schöben sechs, sieben Zeilen Einleitung den Inhalt aus dem Bild. Abschnittsköpfe bleiben, wie sie sind.
 */
export function Kopf({
  titel,
  abschnitt,
  id,
  ueber = t('werkbank.kopf.werkbank'),
  hilfe,
  children,
}: {
  titel: ReactNode;
  abschnitt?: boolean;
  id?: string;
  ueber?: ReactNode;
  hilfe?: Hilfeort;
  children?: ReactNode;
}) {
  const mitHilfe = (
    <>
      {titel}
      {hilfe && (
        <>
          {' '}
          <Hilfe ort={hilfe} />
        </>
      )}
    </>
  );
  if (abschnitt) {
    return (
      <div className="teilkopf" id={id}>
        <h2>{mitHilfe}</h2>
        {children}
      </div>
    );
  }
  return (
    <div className="mappenkopf" id={id}>
      <p className="ueber">{ueber}</p>
      <h1>{mitHilfe}</h1>
      {children && <Einleitung>{children}</Einleitung>}
    </div>
  );
}

/**
 * Einleitung einer Werkbank-Seite (#1291): am Handy eine Zeile, „Mehr“ klappt den ganzen Text auf (und „Weniger“ wieder
 * zu). Den Knopf gibt es nur, wenn der Text wirklich länger ist als die Zeile. Am Rechner und Tablet der Text wie bisher.
 */
function Einleitung({ children }: { children: ReactNode }) {
  const schmal = useWerkbankSchmal();
  const [offen, setOffen] = useState(false);
  const [lang, setLang] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!schmal || offen || !el) return;
    // Länger als eine Zeile: Der erste Absatz ist abgeschnitten, oder es folgen weitere.
    const pruefe = () => {
      const erster = el.firstElementChild;
      setLang(el.childElementCount > 1 || (!!erster && erster.scrollHeight > erster.clientHeight + 1));
    };
    pruefe();
    if (typeof ResizeObserver !== 'function') return;
    const r = new ResizeObserver(pruefe);
    r.observe(el);
    return () => r.disconnect();
  }, [schmal, offen, children]);
  if (!schmal) return children;
  return (
    <div className="wb-einleitung" data-offen={offen || undefined}>
      <div ref={ref} id={id} className="wb-einleitung-text">
        {children}
      </div>
      {(lang || offen) && (
        <Knopf groesse="klein" className="wb-einleitung-mehr" aria-expanded={offen} aria-controls={id} onClick={() => setOffen(!offen)}>
          {offen ? t('werkbank.kopf.weniger') : t('werkbank.kopf.mehr')}
        </Knopf>
      )}
    </div>
  );
}
