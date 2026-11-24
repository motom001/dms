import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Feld } from '../feld/Feld';
import { DatumEingabe } from './Datum';
import s from '../muster.module.css';

/**
 * Datum auf der Musterseite (#1496): leer, gefüllt, mit offenem Kalender samt Kalenderwochen und gesperrt; dazu ein Feld
 * am rechten Rand (#1556), dessen Kalender rechtsbündig öffnet.
 */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={zustand}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

export function DatumMuster() {
  const [leer, setLeer] = useState('');
  const [frist, setFrist] = useState('2026-12-11');
  const [offen, setOffen] = useState('2026-12-11');
  const [rechts, setRechts] = useState('2026-12-11');
  const breit = typeof matchMedia !== 'function' || !matchMedia('(max-width: 600px)').matches;
  return (
    <div className={s.raster}>
      <Karte zustand="datum-leer" titel={t('oberflaeche.muster.zustand.leer')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.faellig')} optional>
          {(v) => <DatumEingabe {...v} wert={leer} setze={setLeer} />}
        </Feld>
      </Karte>
      <Karte zustand="datum-gefuellt" titel={t('oberflaeche.muster.zustand.gefuellt')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.faellig')} hinweis={t('oberflaeche.muster.hinweis.datum')}>
          {(v) => <DatumEingabe {...v} wert={frist} setze={setFrist} />}
        </Feld>
      </Karte>
      {/* Am Handy ist der Kalender ein Blatt über die volle Breite – in einer Karte hätte er dafür keinen Platz. */}
      {breit && (
        <Karte zustand="datum-kalender" titel={t('oberflaeche.muster.datum.kalender')}>
          <Feld beschriftung={t('oberflaeche.muster.beschriftung.faellig')}>
            {(v) => <DatumEingabe {...v} wert={offen} setze={setOffen} offenZeigen />}
          </Feld>
        </Karte>
      )}
      <Karte zustand="datum-gesperrt" titel={t('oberflaeche.muster.zustand.gesperrt')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.faellig')}>
          {(v) => <DatumEingabe {...v} wert="2026-11-30" setze={() => {}} disabled />}
        </Feld>
      </Karte>
      {/* #1556: Feld am rechten Rand – der Kalender ist breiter als das Feld und öffnet rechtsbündig, nie über den Rand. */}
      <div className={`${s.karte} ${s.breit}`} data-zustand="datum-rechts">
        <h3 className={s.zustand}>{t('oberflaeche.muster.datum.rechts')}</h3>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.faellig')} className={s.rechtsbuendig}>
          {(v) => <DatumEingabe {...v} wert={rechts} setze={setRechts} />}
        </Feld>
      </div>
    </div>
  );
}
