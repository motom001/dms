import { useState } from 'react';
import { t } from '../../sprache';
import { Feld } from '../feld/Feld';
import { Mehrfachauswahl, type GewaehlterEintrag, type Vorschlag } from './Mehrfachauswahl';
import s from '../muster.module.css';

/**
 * Mehrfachauswahl auf der Musterseite (#1211, #1288): leer, offen mit Treffern, ohne Treffer (mit „+ … anlegen“ als
 * letztem Eintrag), gesetzt (ein Verweis mit ✕) und mehrfach (zum Ausprobieren).
 */
const ALLE = ['Lena Beispiel', 'Jonas Beispiel', 'Markus Beispiel', 'Petra Beispiel'];
const nichts = () => {};
/** Was im Zustand „ohne Treffer“ getippt ist. */
const GETIPPT = 'Kim Beispiel';

/** Ein Zustand als Karte; `offen` hält die Vorschläge stehend offen (mit Platz darunter). */
function Zustand(p: {
  id: string;
  zustand: string;
  beschriftung: string;
  offen?: boolean;
  eingabe?: string;
  vorschlaege?: Vorschlag[];
  leerText?: string;
  anlegen?: Vorschlag[];
  gewaehlt?: string[];
  entfernenText?: string;
}) {
  return (
    <div className={`${s.karte}${p.offen ? ` ${s.platzunten}` : ''}`} data-zustand={`mehrfachauswahl-${p.id}`}>
      <h3 className={s.zustand}>{p.zustand}</h3>
      <Feld beschriftung={p.beschriftung} id={`muster-mehrfachauswahl-${p.id}`}>
        <Mehrfachauswahl
          id={`muster-mehrfachauswahl-${p.id}`}
          name={p.beschriftung}
          platzhalter={t('oberflaeche.muster.mehrfachauswahl.suchen')}
          eingabe={p.eingabe ?? ''}
          setEingabe={nichts}
          offen={!!p.offen}
          setOffen={nichts}
          vorschlaege={p.vorschlaege ?? []}
          leerText={p.leerText ?? t('oberflaeche.muster.mehrfachauswahl.leer')}
          anlegen={p.anlegen}
          legeAn={nichts}
          waehle={nichts}
          ohneSuche={!!p.gewaehlt?.length}
          gewaehlt={(p.gewaehlt ?? []).map((x): GewaehlterEintrag => ({ id: x, inhalt: x, entfernenText: p.entfernenText ?? x }))}
          entferne={nichts}
          imFluss
        />
      </Feld>
    </div>
  );
}

/** Mehrfach: zum Ausprobieren – wählen, mit ✕ entfernen, Pfeiltasten und Enter. */
function Mehrfach() {
  const [gewaehlt, setGewaehlt] = useState<string[]>(['Jonas Beispiel', 'Petra Beispiel']);
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const vorschlaege = ALLE.filter((x) => !gewaehlt.includes(x) && x.toLowerCase().includes(eingabe.toLowerCase())).map((x) => ({
    id: x,
    text: x,
  }));
  return (
    <div className={s.karte} data-zustand="mehrfachauswahl-normal">
      <h3 className={s.zustand}>{t('oberflaeche.muster.mehrfachauswahl.zustand.mehrfach')}</h3>
      <Feld beschriftung={t('oberflaeche.muster.mehrfachauswahl.personen')} id="muster-mehrfachauswahl">
        <Mehrfachauswahl
          id="muster-mehrfachauswahl"
          name={t('oberflaeche.muster.mehrfachauswahl.personen')}
          platzhalter={t('oberflaeche.muster.mehrfachauswahl.suchen')}
          eingabe={eingabe}
          setEingabe={setEingabe}
          offen={offen}
          setOffen={setOffen}
          vorschlaege={vorschlaege}
          leerText={t('oberflaeche.muster.mehrfachauswahl.leer')}
          waehle={(x) => {
            setGewaehlt((g) => [...g, x]);
            setEingabe('');
          }}
          gewaehlt={gewaehlt.map((x) => ({
            id: x,
            inhalt: x,
            entfernenText: t('oberflaeche.muster.mehrfachauswahl.entfernen', { name: x }),
          }))}
          entferne={(x) => setGewaehlt((g) => g.filter((y) => y !== x))}
        />
      </Feld>
    </div>
  );
}

export function MehrfachauswahlMuster() {
  const halter = t('oberflaeche.muster.mehrfachauswahl.halter');
  const zustand = (k: string) => t.frei(`oberflaeche.muster.mehrfachauswahl.zustand.${k}`);
  return (
    <div className={s.raster}>
      <Zustand id="leer" zustand={zustand('leer')} beschriftung={halter} />
      <Zustand
        id="offen"
        zustand={zustand('offen')}
        beschriftung={halter}
        offen
        vorschlaege={ALLE.slice(0, 3).map((x) => ({ id: x, text: x }))}
        anlegen={[{ id: 'neu', text: t('oberflaeche.muster.mehrfachauswahl.anlegen') }]}
      />
      <Zustand
        id="ohne"
        zustand={zustand('ohne')}
        beschriftung={halter}
        offen
        eingabe={GETIPPT}
        leerText={t('oberflaeche.muster.mehrfachauswahl.nicht-gefunden', { text: GETIPPT })}
        anlegen={[{ id: 'neu', text: t('oberflaeche.muster.mehrfachauswahl.anlegen-mit', { text: GETIPPT }) }]}
      />
      <Zustand
        id="gesetzt"
        zustand={zustand('gesetzt')}
        beschriftung={halter}
        gewaehlt={['Lena Beispiel']}
        entfernenText={t('oberflaeche.muster.mehrfachauswahl.halter-entfernen')}
      />
      <Mehrfach />
    </div>
  );
}
