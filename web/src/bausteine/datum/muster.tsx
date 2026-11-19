import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Feld } from '../feld/Feld';
import { DatumEingabe } from './Datum';
import s from '../muster.module.css';

/** Datum auf der Musterseite (#1496): leer, gefüllt, mit offenem Kalender samt Kalenderwochen und gesperrt. */

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
      <Karte zustand="datum-kalender" titel={t('oberflaeche.muster.datum.kalender')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.faellig')}>
          {(v) => <DatumEingabe {...v} wert={offen} setze={setOffen} offenZeigen />}
        </Feld>
      </Karte>
      <Karte zustand="datum-gesperrt" titel={t('oberflaeche.muster.zustand.gesperrt')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.faellig')}>
          {(v) => <DatumEingabe {...v} wert="2026-11-30" setze={() => {}} disabled />}
        </Feld>
      </Karte>
    </div>
  );
}
