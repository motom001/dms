import type { ReactNode } from 'react';
import { t } from '../../sprache';
import { PaketChip } from './PaketChip';
import s from '../muster.module.css';

/**
 * PaketChip auf der Musterseite (#1192): hinter dem Namen eines Eintrags – Paket mit Name und Version (als Link), in
 * einer Listenzeile ohne eigenen Link, von Ablago mitgeliefert, selbst angelegt (ohne Chip).
 */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={`paketchip-${zustand}`}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const BASIS = { id: 'basis', name: 'Basis', version: '1.4.0' };

export function PaketChipMuster() {
  return (
    <div className={s.raster}>
      <Karte zustand="link" titel={t('oberflaeche.muster.paketchip.link')}>
        <p><strong>{t('oberflaeche.muster.paketchip.vertrag')}</strong><PaketChip paket={BASIS} /></p>
      </Karte>
      <Karte zustand="liste" titel={t('oberflaeche.muster.paketchip.liste')}>
        <p><strong>{t('oberflaeche.muster.paketchip.woerter')}</strong><PaketChip paket={{ id: 'fahrzeuge', name: 'Fahrzeuge' }} inLink /></p>
      </Karte>
      <Karte zustand="ablago" titel={t('oberflaeche.muster.paketchip.ablago')}>
        <p><strong>{t('oberflaeche.muster.paketchip.vorlage')}</strong><PaketChip paket="ablago" inLink /></p>
      </Karte>
      <Karte zustand="eigen" titel={t('oberflaeche.muster.paketchip.eigen')}>
        <p><strong>{t('oberflaeche.muster.paketchip.eigene')}</strong><PaketChip paket={null} /></p>
        <p className="leise klein">{t('oberflaeche.muster.paketchip.eigen.text')}</p>
      </Karte>
    </div>
  );
}
