import { useState, type ReactNode } from 'react';
import { leseProzent, leseZeitraum } from '../../../../shared/src/feldarten';
import { t } from '../../sprache';
import { Feld } from '../feld/Feld';
import { ProzentEingabe, ZeitraumEingabe, type ZeitraumRoh } from './Einheit';
import s from '../muster.module.css';

/** Eingaben mit Einheit auf der Musterseite (#1035): Zeitraum und Prozent, je leer, gefüllt, mit Fehler und gesperrt. */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={zustand}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

export function EinheitMuster() {
  const [frist, setFrist] = useState<ZeitraumRoh>({ anzahl: '3', einheit: 'monate' });
  const [laufzeit, setLaufzeit] = useState<ZeitraumRoh>({ anzahl: '1', einheit: 'jahre' });
  const [falsch, setFalsch] = useState<ZeitraumRoh>({ anzahl: 'drei', einheit: 'monate' });
  const [satz, setSatz] = useState('19');
  const [ermaessigt, setErmaessigt] = useState('');
  return (
    <div className={s.raster}>
      <Karte zustand="zeitraum" titel={t('oberflaeche.muster.einheit.zeitraum')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.kuendigungsfrist')}><ZeitraumEingabe wert={frist} setze={setFrist} /></Feld>
      </Karte>
      <Karte zustand="zeitraum-einzahl" titel={t('oberflaeche.muster.einheit.einzahl')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.laufzeit')} hinweis={t('oberflaeche.muster.hinweis.einzahl')}><ZeitraumEingabe wert={laufzeit} setze={setLaufzeit} /></Feld>
      </Karte>
      <Karte zustand="zeitraum-fehler" titel={t('oberflaeche.muster.zustand.fehler')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.kuendigungsfrist')} fehler={leseZeitraum(falsch) ? null : t('oberflaeche.muster.fehler.zeitraum')}>
          <ZeitraumEingabe wert={falsch} setze={setFalsch} />
        </Feld>
      </Karte>
      <Karte zustand="prozent" titel={t('oberflaeche.muster.einheit.prozent')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.steuersatz')} hinweis={t('oberflaeche.muster.hinweis.prozent')}>
          <ProzentEingabe wert={satz} setze={setSatz} />
        </Feld>
      </Karte>
      <Karte zustand="prozent-leer" titel={t('oberflaeche.muster.zustand.optional')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.ermaessigt')} optional
          fehler={ermaessigt.trim() && !Number.isFinite(leseProzent(ermaessigt)) ? t('oberflaeche.muster.fehler.prozent') : null}>
          <ProzentEingabe wert={ermaessigt} setze={setErmaessigt} />
        </Feld>
      </Karte>
      <Karte zustand="einheit-gesperrt" titel={t('oberflaeche.muster.zustand.gesperrt')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.laufzeit')}><ZeitraumEingabe wert={{ anzahl: '24', einheit: 'monate' }} setze={() => {}} disabled /></Feld>
      </Karte>
    </div>
  );
}
