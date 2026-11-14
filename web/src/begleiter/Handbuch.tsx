import { useEffect, useMemo, useState } from 'react';
import { handbuchVerzeichnis, sucheImHandbuch, type HandbuchAbschnitt } from '../../../shared/src/handbuchsuche';
import { handbuchSuchverzeichnisUrl, type Handbuch } from '../../../shared/src/hilfe';
import { Hervorgehoben, Suchfeld } from '../bausteine';
import { useHandbuch } from '../Hilfe';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import s from './Begleiter.module.css';

/**
 * Reiter „Handbuch“ im Assistenten (#1219): Suchfeld mit Treffern (Titel, Ort im Handbuch, Ausschnitt) aus dem
 * Suchverzeichnis des mitgelieferten Handbuchs – in der Ablage das Benutzerhandbuch, in der Werkbank das
 * Admin-Handbuch. Ohne Netz nach draußen (F2): Das Verzeichnis kommt von Ablago selbst (/hilfe/…); eine Umleitung zum
 * Online-Handbuch (Entwicklung ohne gebaute Handbücher) folgt die Anfrage nicht. Treffer öffnen die Stelle in einem
 * neuen Tab.
 */

/** Verzeichnis je Adresse, einmal je Laden der Seite; null = gibt es hier nicht. */
const verzeichnisse = new Map<string, Promise<HandbuchAbschnitt[] | null>>();
function ladeVerzeichnis(url: string): Promise<HandbuchAbschnitt[] | null> {
  let p = verzeichnisse.get(url);
  if (!p) {
    p = fetch(url, { redirect: 'error', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => (j ? handbuchVerzeichnis(j) : null))
      .catch(() => null);
    verzeichnisse.set(url, p);
  }
  return p;
}

function useVerzeichnis(url: string) {
  const [stand, setStand] = useState<{ url: string; abschnitte: HandbuchAbschnitt[] | null } | null>(null);
  useEffect(() => {
    let aktuell = true;
    void ladeVerzeichnis(url).then((abschnitte) => { if (aktuell) setStand({ url, abschnitte }); });
    return () => { aktuell = false; };
  }, [url]);
  return stand?.url === url ? stand : null;
}

export function HandbuchSuche({ handbuch }: { handbuch: Handbuch }) {
  const zu = useHandbuch();
  const [such, setSuch] = useState('');
  const v = useVerzeichnis(handbuchSuchverzeichnisUrl(handbuch));
  const treffer = useMemo(() => (v?.abschnitte ? sucheImHandbuch(v.abschnitte, such) : []), [v, such]);
  const name = handbuch === 'admin' ? t('oberflaeche.begleiter.handbuch.admin') : t('oberflaeche.begleiter.handbuch.benutzer');
  return (
    <div className={s.handbuch}>
      <Suchfeld wert={such} setze={setSuch} beschriftung={t('oberflaeche.begleiter.handbuch.suchen')} platzhalter={t('oberflaeche.begleiter.handbuch.suchen')} />
      <p className="leise klein">{handbuch === 'admin' ? t('oberflaeche.begleiter.handbuch.weil-werkbank', { name }) : t('oberflaeche.begleiter.handbuch.weil-ablage', { name })}</p>
      {!v ? <p className="leise klein">{t('oberflaeche.begleiter.handbuch.lade')}</p>
        : !v.abschnitte ? <p className="leise klein">{t('oberflaeche.begleiter.handbuch.fehlt')}</p>
        : such.trim() && !treffer.length ? <p className="leise klein" role="status">{t('oberflaeche.begleiter.handbuch.keine', { such: such.trim() })}</p>
        : (
          <ul className={s.treffer} aria-live="polite">
            {treffer.map((x) => (
              <li key={x.abschnitt.adresse}>
                <a href={zu(handbuch, x.abschnitt.adresse)} target="_blank" rel="noreferrer" className={s.treffertitel}>
                  <Hervorgehoben teile={x.titel} text={x.abschnitt.titel} /><span className="sr"> ({t('oberflaeche.begleiter.handbuch.neuer-tab')})</span>
                </a>
                <span className="leise klein">{x.abschnitt.istSeite || !x.abschnitt.seite ? name : `${name} › ${x.abschnitt.seite}`}</span>
                <span className={s.ausschnitt}><Hervorgehoben teile={x.ausschnitt} text="" /></span>
              </li>
            ))}
          </ul>
        )}
      <a href={zu(handbuch)} target="_blank" rel="noreferrer" className={`verweis ${s.ganz}`}>{t('oberflaeche.begleiter.handbuch.ganz')} <Symbol name="extern" /><span className="sr"> ({t('oberflaeche.begleiter.handbuch.neuer-tab')})</span></a>
    </div>
  );
}
