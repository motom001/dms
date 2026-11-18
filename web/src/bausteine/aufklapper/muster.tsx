import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Aufklapper } from './Aufklapper';
import s from '../muster.module.css';

/** Aufklapper auf der Musterseite (#1270): Kopf eines Abschnitts (aufgeklappt) und Zeile einer Liste (zugeklappt). */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={`aufklapper-${zustand}`}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

export function AufklapperMuster() {
  const [kopf, setKopf] = useState(true);
  const [zeile, setZeile] = useState(false);
  return (
    <div className={s.raster}>
      <Karte zustand="kopf" titel={t('oberflaeche.muster.aufklapper.kopf')}>
        <section className="aufklappbereich">
          <Aufklapper offen={kopf} steuert="muster-aufklapper-kopf" umschalten={() => setKopf(!kopf)}>
            <span>{t('oberflaeche.muster.aufklapper.kopf.titel')}</span>
            <span className="leise klein">{t('oberflaeche.muster.aufklapper.kopf.zusatz')}</span>
          </Aufklapper>
          {kopf && (
            <p id="muster-aufklapper-kopf" className="aufklappinhalt">
              {t('oberflaeche.muster.aufklapper.inhalt')}
            </p>
          )}
        </section>
      </Karte>
      <Karte zustand="zeile" titel={t('oberflaeche.muster.aufklapper.zeile')}>
        <Aufklapper form="zeile" offen={zeile} steuert="muster-aufklapper-zeile" umschalten={() => setZeile(!zeile)}>
          <span className="mono klein">{t('oberflaeche.muster.aufklapper.zeile.text')}</span>
        </Aufklapper>
        {zeile && (
          <p id="muster-aufklapper-zeile" className="leise klein">
            {t('oberflaeche.muster.aufklapper.inhalt')}
          </p>
        )}
      </Karte>
    </div>
  );
}
