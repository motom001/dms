import { useState } from 'react';
import { t } from '../../sprache';
import { Menue } from './Menue';
import s from '../muster.module.css';

/** Menüs auf der Musterseite (#1211): mit Beschriftung („Mappe“) und als „⋯“ mit Gruppen, gesperrtem Punkt und Gefahr. */
export function MenueMuster() {
  const [zuletzt, setZuletzt] = useState('');
  const tu = (x: string) => () => setZuletzt(x);
  return (
    <div className={s.raster}>
      <div className={s.karte} data-zustand="menue-knopf">
        <h3 className={s.zustand}>{t('oberflaeche.muster.menue.mit-text')}</h3>
        <Menue beschriftung={t('oberflaeche.muster.menue.mappe')} links punkte={[
          { key: 'aufgabe', symbol: 'aufgabe', inhalt: t('oberflaeche.muster.menue.aufgabe'), tu: tu(t('oberflaeche.muster.menue.aufgabe')) },
          { key: 'email', symbol: 'email', inhalt: t('oberflaeche.muster.menue.email'), tu: tu(t('oberflaeche.muster.menue.email')) },
          { key: 'paket', symbol: 'paket', inhalt: t('oberflaeche.muster.menue.paket'), gesperrt: t('oberflaeche.muster.menue.paket.grund'), tu: () => {} },
          { key: 'loeschen', symbol: 'geloescht', inhalt: t('oberflaeche.muster.menue.loeschen'), tu: tu(t('oberflaeche.muster.menue.loeschen')),
            gefahr: { titel: t('oberflaeche.muster.menue.loeschen.frage'), ja: t('oberflaeche.muster.menue.loeschen.ja') } },
        ]} />
      </div>
      <div className={s.karte} data-zustand="menue-mehr">
        <h3 className={s.zustand}>{t('oberflaeche.muster.menue.gruppen')}</h3>
        <Menue beschriftung={t('oberflaeche.muster.menue.mehr')} nurSymbol links punkte={[
          { key: 'tab', gruppe: t('oberflaeche.muster.menue.ansehen'), symbol: 'extern', inhalt: t('oberflaeche.muster.menue.tab'), tu: tu(t('oberflaeche.muster.menue.tab')) },
          { key: 'pdfa', gruppe: t('oberflaeche.muster.menue.herunterladen'), symbol: 'herunterladen', inhalt: 'PDF/A', tu: tu('PDF/A') },
          { key: 'original', gruppe: t('oberflaeche.muster.menue.herunterladen'), symbol: 'herunterladen', inhalt: t('oberflaeche.muster.menue.original'), tu: tu(t('oberflaeche.muster.menue.original')) },
        ]} />
        {zuletzt && <p className="leise klein" role="status">{zuletzt}</p>}
      </div>
    </div>
  );
}
