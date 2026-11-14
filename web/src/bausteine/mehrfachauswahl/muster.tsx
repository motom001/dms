import { useState } from 'react';
import { t } from '../../sprache';
import { Feld } from '../feld/Feld';
import { Mehrfachauswahl } from './Mehrfachauswahl';
import s from '../muster.module.css';

/** Mehrfachauswahl auf der Musterseite (#1211): Suchfeld mit Lupe, Vorschläge, gewählte Einträge mit „Entfernen“. */
const ALLE = ['Lena Beispiel', 'Jonas Beispiel', 'Markus Beispiel', 'Petra Beispiel'];

export function MehrfachauswahlMuster() {
  const [gewaehlt, setGewaehlt] = useState<string[]>(['Jonas Beispiel']);
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const vorschlaege = ALLE.filter((x) => !gewaehlt.includes(x) && x.toLowerCase().includes(eingabe.toLowerCase())).map((x) => ({ id: x, text: x }));
  return (
    <div className={s.raster}>
      <div className={s.karte} data-zustand="mehrfachauswahl-normal">
        <h3 className={s.zustand}>{t('oberflaeche.muster.mehrfachauswahl.personen')}</h3>
        <Feld beschriftung={t('oberflaeche.muster.mehrfachauswahl.personen')} id="muster-mehrfachauswahl">
          <Mehrfachauswahl id="muster-mehrfachauswahl" name={t('oberflaeche.muster.mehrfachauswahl.personen')} platzhalter={t('oberflaeche.muster.mehrfachauswahl.suchen')}
            eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen} vorschlaege={vorschlaege} leerText={t('oberflaeche.muster.mehrfachauswahl.leer')}
            waehle={(x) => { setGewaehlt((g) => [...g, x]); setEingabe(''); }}
            gewaehlt={gewaehlt.map((x) => ({ id: x, inhalt: x, entfernenText: t('oberflaeche.muster.mehrfachauswahl.entfernen', { name: x }) }))}
            entferne={(x) => setGewaehlt((g) => g.filter((y) => y !== x))} />
        </Feld>
      </div>
    </div>
  );
}
