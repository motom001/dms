import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Reiter, ReiterFlaeche } from './Reiter';
import s from '../muster.module.css';

/** Reiter auf der Musterseite (#1210): Register einer Mappe mit Anzahl und Fehlern; ein aktives Aussehen. */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={`${s.karte} ${s.breit}`} data-zustand={zustand}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

type Wahl = 'felder' | 'dokumente' | 'verknuepfungen' | 'notizen';

export function ReiterMuster() {
  const [wert, setWert] = useState<Wahl>('felder');
  const wahlen = [
    { wert: 'felder' as const, text: t('oberflaeche.muster.reiter.felder'), fehler: 2 },
    { wert: 'dokumente' as const, text: t('oberflaeche.muster.reiter.dokumente'), anzahl: 3 },
    { wert: 'verknuepfungen' as const, text: t('oberflaeche.muster.reiter.verknuepfungen'), anzahl: 1 },
    { wert: 'notizen' as const, text: t('oberflaeche.muster.reiter.notizen') },
  ];
  return (
    <div className={s.raster}>
      <Karte zustand="reiter-register" titel={t('oberflaeche.muster.reiter.register')}>
        <Reiter id="muster-reiter" wert={wert} setze={setWert} wahlen={wahlen} beschriftung={t('oberflaeche.muster.reiter.beschriftung')} />
        <ReiterFlaeche id="muster-reiter" wert={wert}><p className="leise">{t('oberflaeche.muster.reiter.inhalt', { reiter: wahlen.find((w) => w.wert === wert)?.text ?? '' })}</p></ReiterFlaeche>
      </Karte>
    </div>
  );
}
