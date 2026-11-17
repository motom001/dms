import { useState } from 'react';
import { Knopf } from '../../bausteine';
import { OCR_STAENDE, type OcrStandArt } from '../../../../shared/src/model';
import { betriebApi } from '../../api/betrieb';
import { sucheApi, type OcrStatus } from '../../api/suche';
import { rueckfrage } from '../../rueckfrage';
import { WARTUNG_GEAENDERT } from '../../wartung';
import { t, tn } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import type { TexterkennungZustand } from './zustand';

export const zahl = (n: number) => n.toLocaleString(gebietsschema());
const REIHENFOLGE: OcrStandArt[] = ['wartet', 'laeuft', 'paket', 'fertig', 'fehler', 'ausgelassen', 'keiner'];

export function Warteschlange({ s }: { s: OcrStatus }) {
  return (
    <dl className="eigenschaften">
      {REIHENFOLGE.map((k) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k === 'keiner' ? t('werkbank.texterkennung.ohne-volltext-noch-nie') : OCR_STAENDE[k]}</dt>
          <dd>{zahl(s.zaehler[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Warum die Warteschlange steht (#366): ausgeschaltet oder Wartungsmodus – mit dem Knopf, der es behebt.
 * Steht bei der Texterkennung und bei „Volltext neu erzeugen“.
 */
export function PauseHinweis({ t: eintrag, wartungAn }: { t: TexterkennungZustand; wartungAn?: boolean }) {
  const s = eintrag.stand!;
  const [meldung, setMeldung] = useState<string>();
  const offen = s.zaehler.wartet + s.zaehler.laeuft;
  const warten = offen ? t('werkbank.texterkennung.dokumente-warten', { anzahl: offen, zahl: zahl(offen) }) : '';
  async function einschalten() {
    try {
      eintrag.setStand(await sucheApi.texterkennungSpeichern({ ...s.einstellungen, aktiv: true }));
    } catch (e) {
      setMeldung((e as Error).message);
    }
  }
  async function wartungBeenden() {
    if (
      !(await rueckfrage({
        titel: t('werkbank.texterkennung.wartungsmodus-beenden'),
        text: t('werkbank.texterkennung.alle-koennen-sich-wieder'),
        ja: t('werkbank.texterkennung.wartung-beenden'),
      }))
    )
      return;
    try {
      await betriebApi.wartungAus();
      dispatchEvent(new Event(WARTUNG_GEAENDERT));
      await eintrag.laden();
    } catch (e) {
      setMeldung((e as Error).message);
    }
  }
  if (!s.einstellungen.aktiv)
    return (
      <div className="hinweis warn hinweiszeile" role="status">
        <p>
          {tn('werkbank.texterkennung.neue-dokumente-bleiben-in', {
            b: <strong>{t('werkbank.texterkennung.die-texterkennung-ist-ausgeschaltet')}</strong>,
            warten,
            wert: meldung && <span className="fehlertext blockzeile">{meldung}</span>,
          })}
        </p>
        <Knopf art="haupt" groesse="klein" onClick={einschalten}>
          {t('werkbank.texterkennung.einschalten')}
        </Knopf>
      </div>
    );
  if (wartungAn)
    return (
      <div className="hinweis warn hinweiszeile" role="status">
        <p>
          <strong>{t('werkbank.texterkennung.pausiert-solange-der-wartungsmodus')}</strong>
          {warten}
          {meldung && <span className="fehlertext blockzeile">{meldung}</span>}
        </p>
        <Knopf groesse="klein" onClick={wartungBeenden}>
          {t('werkbank.texterkennung.wartungsmodus-beenden-2')}
        </Knopf>
      </div>
    );
  return null;
}
