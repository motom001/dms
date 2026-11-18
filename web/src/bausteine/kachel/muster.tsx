import { t } from '../../sprache';
import { Kachel, Kacheln } from './Kachel';
import s from '../muster.module.css';

/** Kachel auf der Musterseite (#1271, #1284): mit Zahl, leer und erledigt (grün), leer ohne Erfolg (leise), lädt, Text. */
export function KachelMuster() {
  return (
    <div className={`${s.karte} ${s.breit}`} data-zustand="kachel-arten">
      <h3 className={s.zustand}>{t('oberflaeche.muster.kachel.arten')}</h3>
      <Kacheln>
        <Kachel
          to="/muster#kachel"
          titel={t('oberflaeche.muster.kachel.post')}
          wert={2}
          unter={t('oberflaeche.muster.kachel.post.unter')}
        />
        <Kachel
          to="/muster#kachel"
          titel={t('oberflaeche.muster.kachel.erledigen')}
          wert={0}
          leer={t('oberflaeche.muster.kachel.erledigen.leer')}
          leerGut
        />
        <Kachel
          to="/muster#kachel"
          titel={t('oberflaeche.muster.kachel.favoriten')}
          wert={0}
          leer={t('oberflaeche.muster.kachel.favoriten.leer')}
        />
        <Kachel to="/muster#kachel" titel={t('oberflaeche.muster.kachel.laedt')} wert={null} />
        <Kachel
          to="/muster#kachel"
          titel={t('oberflaeche.muster.kachel.version')}
          wert="0.293.2"
          unter={t('oberflaeche.muster.kachel.version.unter')}
        />
      </Kacheln>
    </div>
  );
}
