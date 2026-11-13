import { useId, useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { fehlerText } from '../knopf/Knopf';
import s from './Schalter.module.css';

/**
 * Baustein Schalter (#1188): etwas ist an oder aus – eine Funktion, ein Dienst, eine Automatisierung. Überall derselbe
 * Schiebeschalter, mit der Beschriftung ohne Verb daneben („WebDAV-Laufwerk“, „Eingangsordner“) und dem Zustand als Wort
 * („An“/„Aus“), damit er nicht nur an der Farbe hängt. Anleitung im Entwicklerhandbuch, „Gestaltung und Bausteine →
 * Schalter“.
 *
 * Regel: **Schalter** = etwas ist an oder aus. **Haken** (`HakenFeld`) = eine Auswahl oder Option (mitnehmen ja/nein,
 * „auch beruflich genutzt“, „nur lesend“). Wo oben ein Schalter steht, wiederholt „Stand“ den Zustand nicht.
 *
 * Für Screenreader ein `role="switch"` mit `aria-checked`; Name ist die Beschriftung, der Hinweis hängt über
 * `aria-describedby` daran. `setze` darf ein Promise liefern (sofort wirksame Schalter): Solange es läuft, ist der
 * Schalter beschäftigt (`aria-busy`), ein Fehler steht darunter. Am Handy mindestens 44 px hoch.
 */
export interface SchalterProps {
  an: boolean;
  /** Neuer Zustand; darf ein Promise liefern (Fehler stehen dann am Schalter). */
  setze(an: boolean): void | Promise<unknown>;
  /** Was an oder aus ist, ohne Verb: „WebDAV-Laufwerk“. Name für Screenreader. */
  beschriftung: string;
  /** Erklärung darunter (z. B. was „aus“ bedeutet). */
  hinweis?: ReactNode;
  /** Beschriftung nur für Screenreader (wenn sie schon daneben steht, z. B. im Kopf einer Automatisierung). */
  beschriftungVerbergen?: boolean;
  gesperrt?: boolean;
  /** Feste `id` am Schalter (Sprungziele, Tests). */
  id?: string;
  className?: string;
}

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

export function Schalter({ an, setze, beschriftung, hinweis, beschriftungVerbergen, gesperrt, id, className }: SchalterProps) {
  const basis = useId();
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const hinweisId = `${basis}h`;
  const fehlerId = `${basis}f`;

  async function klick() {
    if (laeuft || gesperrt) return;
    setFehler(null);
    const r = setze(!an);
    if (!r || typeof (r as Promise<unknown>).then !== 'function') return;
    setLaeuft(true);
    try { await r; } catch (x) { setFehler(fehlerText(x)); } finally { setLaeuft(false); }
  }

  return (
    <div className={klassen(s.feld, className)}>
      <button id={id} type="button" role="switch" aria-checked={an} aria-busy={laeuft || undefined} disabled={gesperrt}
        aria-describedby={klassen(hinweis ? hinweisId : null, fehler ? fehlerId : null) || undefined}
        className={klassen(s.schalter, an && s.an)} onClick={() => void klick()} data-schalter={an ? 'an' : 'aus'}>
        <span className={s.spur} aria-hidden="true"><span className={s.griff} /></span>
        <span className={beschriftungVerbergen ? s.sr : s.beschriftung}>{beschriftung}</span>
        <span className={s.zustand} aria-hidden="true">{an ? t('oberflaeche.schalter.an') : t('oberflaeche.schalter.aus')}</span>
      </button>
      {hinweis && <small id={hinweisId} className={s.hinweis}>{hinweis}</small>}
      {fehler && <span id={fehlerId} className={s.fehler} role="alert">{fehler}</span>}
    </div>
  );
}
