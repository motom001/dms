import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Etikett, type EtikettArt } from './Etikett';
import s from '../muster.module.css';

/**
 * Etikett auf der Musterseite (#1289, Leitsatz 8): alle Arten, mit Punkt und klein, ein gewählter Eintrag mit ✕.
 * Kein Etikett hat einen Rand – ein Rand heißt „Knopf“.
 */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={`etikett-${zustand}`}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const ARTEN: EtikettArt[] = ['leise', 'info', 'gut', 'warn', 'schlecht'];

export function EtikettMuster() {
  const [gewaehlt, setGewaehlt] = useState([t('oberflaeche.muster.etikett.gewaehlt.eintrag')]);
  return (
    <div className={s.raster}>
      <Karte zustand="arten" titel={t('oberflaeche.muster.etikett.arten')}>
        <div className={s.zustaende}>
          {ARTEN.map((art) => (
            <Etikett key={art} art={art}>
              {t.frei(`oberflaeche.muster.etikett.${art}`)}
            </Etikett>
          ))}
        </div>
      </Karte>
      <Karte zustand="zusatz" titel={t('oberflaeche.muster.etikett.zusatz')}>
        <div className={s.zustaende}>
          <Etikett art="gut" punkt>
            {t('oberflaeche.muster.etikett.punkt')}
          </Etikett>
          <Etikett art="warn" klein>
            {t('oberflaeche.muster.etikett.klein')}
          </Etikett>
        </div>
      </Karte>
      <Karte zustand="gewaehlt" titel={t('oberflaeche.muster.etikett.gewaehlt')}>
        <div className={s.zustaende}>
          {gewaehlt.length ? (
            gewaehlt.map((x) => (
              <Etikett
                key={x}
                entfernen={() => setGewaehlt(gewaehlt.filter((y) => y !== x))}
                entfernenText={t('oberflaeche.muster.etikett.entfernen', { text: x })}>
                {x}
              </Etikett>
            ))
          ) : (
            <p className="leise klein">{t('oberflaeche.muster.etikett.entfernt')}</p>
          )}
        </div>
      </Karte>
    </div>
  );
}
