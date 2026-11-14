import { useState } from 'react';
import { t } from '../../sprache';
import { Feld } from '../feld/Feld';
import { Platzhalter, usePlatzhalterEinsetzen } from './Platzhalter';
import s from '../muster.module.css';

/**
 * Platzhalter auf der Musterseite (#1177): ein Text mit Platzhaltern zum Anklicken, gruppiert nach „Allgemein“ und
 * Mappentyp; ein Feld, das nicht in allen gewählten Mappentypen steht, ist gekennzeichnet. Klick setzt an der
 * Schreibmarke ein.
 */
export function PlatzhalterMuster() {
  const [text, setText] = useState(t('oberflaeche.muster.platzhalter.beispiel'));
  const ein = usePlatzhalterEinsetzen();
  return (
    <div className={s.raster}>
      <div className={`${s.karte} ${s.breit}`} data-zustand="platzhalter-gruppen">
        <h3 className={s.zustand}>{t('oberflaeche.muster.platzhalter.gruppen')}</h3>
        <Feld beschriftung={t('oberflaeche.muster.platzhalter.feld')}>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} {...ein.feld('text', text, setText)} />
        </Feld>
        <Platzhalter einsetzen={ein.einsetzen} gruppen={[
          { name: t('oberflaeche.muster.platzhalter.allgemein'), eintraege: [{ key: 'titel', text: t('oberflaeche.muster.platzhalter.mappentitel') }, { key: 'heute', text: t('oberflaeche.muster.platzhalter.heute') }] },
          { name: t('oberflaeche.muster.platzhalter.vertrag'), eintraege: [{ key: 'kuendigung', text: t('oberflaeche.muster.platzhalter.kuendigung') }, { key: 'anbieter', text: t('oberflaeche.muster.platzhalter.anbieter'), zusatz: t('oberflaeche.muster.platzhalter.nur-vertrag') }] },
        ]} />
      </div>
    </div>
  );
}
