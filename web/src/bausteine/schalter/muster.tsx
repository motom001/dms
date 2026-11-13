import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Schalter } from './Schalter';
import s from '../muster.module.css';
import k from './Schalter.module.css';

/**
 * Schalter auf der Musterseite (#1188): an, aus, mit Hinweis, gesperrt, Maus darüber und Fokus stehend, dazu einer mit
 * sofortiger Wirkung (Promise, das scheitert) zum Ausprobieren.
 */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={`schalter-${zustand}`}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const nichts = () => {};
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SchalterMuster() {
  const [an, setAn] = useState(true);
  const [aus, setAus] = useState(false);
  return (
    <div className={s.raster}>
      <Karte zustand="an" titel={t('oberflaeche.muster.schalter.an')}>
        <Schalter an={an} setze={setAn} beschriftung={t('oberflaeche.muster.schalter.webdav')} hinweis={t('oberflaeche.muster.schalter.webdav.hinweis')} />
      </Karte>
      <Karte zustand="aus" titel={t('oberflaeche.muster.schalter.aus')}>
        <Schalter an={aus} setze={setAus} beschriftung={t('oberflaeche.muster.schalter.eingang')} />
      </Karte>
      <Karte zustand="gesperrt" titel={t('oberflaeche.muster.zustand.gesperrt')}>
        <Schalter an={false} setze={nichts} gesperrt beschriftung={t('oberflaeche.muster.schalter.sicherung')} />
      </Karte>
      <Karte zustand="hover" titel={t('oberflaeche.muster.zustand.hover')}>
        <Schalter an setze={nichts} className={k.vorschauhover} beschriftung={t('oberflaeche.muster.schalter.mail')} />
      </Karte>
      <Karte zustand="fokus" titel={t('oberflaeche.muster.zustand.fokus')}>
        <Schalter an={false} setze={nichts} className={k.vorschaufokus} beschriftung={t('oberflaeche.muster.schalter.mail')} />
      </Karte>
      <Karte zustand="regel" titel={t('oberflaeche.muster.schalter.regel')}>
        <p className="leise klein">{t('oberflaeche.muster.schalter.regel.text')}</p>
      </Karte>
      <Karte zustand="ausprobieren" titel={t('oberflaeche.muster.knopf.zustand.ausprobieren')}>
        <Schalter an={false} beschriftung={t('oberflaeche.muster.schalter.fehler')}
          setze={async () => { await warte(800); throw new Error(t('oberflaeche.muster.knopf.ergebnis.fehler')); }} />
      </Karte>
    </div>
  );
}
