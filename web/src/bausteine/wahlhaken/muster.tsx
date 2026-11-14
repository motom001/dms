import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Wahlhaken } from './Wahlhaken';
import s from '../muster.module.css';
import w from './Wahlhaken.module.css';

/** Wahlhaken auf der Musterseite (#1211): Zeilen einer Liste, „alle“ im Kopf mit „einige gewählt“, gesperrt. */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={`wahlhaken-${zustand}`}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const ZEILEN = ['Mietvertrag', 'Stromvertrag', 'Handyvertrag'];

export function WahlhakenMuster() {
  const [gewaehlt, setGewaehlt] = useState<string[]>(['Stromvertrag']);
  const alle = gewaehlt.length === ZEILEN.length;
  return (
    <div className={s.raster}>
      <Karte zustand="liste" titel={t('oberflaeche.muster.wahlhaken.liste')}>
        <div className="stapel">
          <div className={w.musterzeile}>
            <Wahlhaken an={alle} teilweise={!alle && gewaehlt.length > 0} beschriftung={t('oberflaeche.muster.wahlhaken.alle')} setze={(an) => setGewaehlt(an ? ZEILEN : [])} />
            <span aria-hidden="true" className="klein">{t('oberflaeche.muster.wahlhaken.alle')}</span>
          </div>
          {ZEILEN.map((z) => (
            <div key={z} className={w.musterzeile}>
              <Wahlhaken an={gewaehlt.includes(z)} beschriftung={t('oberflaeche.muster.wahlhaken.auswaehlen', { titel: z })}
                setze={(an) => setGewaehlt((g) => (an ? [...g, z] : g.filter((x) => x !== z)))} />
              <span>{z}</span>
            </div>
          ))}
        </div>
      </Karte>
      <Karte zustand="gesperrt" titel={t('oberflaeche.muster.zustand.gesperrt')}>
        <Wahlhaken an={false} gesperrt beschriftung={t('oberflaeche.muster.wahlhaken.auswaehlen', { titel: ZEILEN[0] })} setze={() => {}} />
      </Karte>
    </div>
  );
}
