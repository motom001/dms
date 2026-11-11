import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Umschalter } from './Umschalter';
import s from '../muster.module.css';

/** Umschalter auf der Musterseite (#1002): zwei Wahlen wie über dem Feld der Startseite, drei Wahlen wie bei einer Ansicht. */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={zustand}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

export function UmschalterMuster() {
  const [zwei, setZwei] = useState<'fragen' | 'suchen'>('fragen');
  const [drei, setDrei] = useState<'liste' | 'monat' | 'jahr'>('monat');
  return (
    <div className={s.raster}>
      <Karte zustand="umschalter-zwei" titel={t('oberflaeche.muster.umschalter.zwei')}>
        <Umschalter wert={zwei} setze={setZwei} beschriftung={t('oberflaeche.muster.umschalter.zwei.beschriftung')}
          wahlen={[{ wert: 'fragen', text: t('oberflaeche.muster.umschalter.fragen') }, { wert: 'suchen', text: t('oberflaeche.muster.umschalter.suchen') }]} />
      </Karte>
      <Karte zustand="umschalter-drei" titel={t('oberflaeche.muster.umschalter.drei')}>
        <Umschalter wert={drei} setze={setDrei} beschriftung={t('oberflaeche.muster.umschalter.drei.beschriftung')}
          wahlen={[{ wert: 'liste', text: t('oberflaeche.muster.umschalter.liste') }, { wert: 'monat', text: t('oberflaeche.muster.umschalter.monat') }, { wert: 'jahr', text: t('oberflaeche.muster.umschalter.jahr') }]} />
      </Karte>
    </div>
  );
}
