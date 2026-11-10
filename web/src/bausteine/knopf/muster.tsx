import type { ReactNode } from 'react';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import { Knopf, type KnopfArt, type KnopfErgebnis } from './Knopf';
import k from './Knopf.module.css';
import s from '../muster.module.css';

/**
 * Knopf auf der Musterseite (#968): jede Art und jeder Zustand einmal, Hover und Fokus für alle Arten stehend (hell und
 * dunkel über die Darstellungswahl). Die Rauchtests fotografieren diesen Bereich und prüfen ihn mit axe
 * (web/rauchtest/muster.mjs); `data-zustand` beginnt mit „knopf-“, damit es sich nicht mit dem Feld überschneidet.
 */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={`knopf-${zustand}`}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const ARTEN: KnopfArt[] = ['anlegen', 'haupt', 'neben', 'gefahr', 'link'];
const beschriftung = (a: KnopfArt) => t.frei(`oberflaeche.muster.knopf.art.${a}`);
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Alle Arten in einer Reihe; `zusatz` gibt jedem Knopf dieselbe Klasse (Vorschau für Hover und Fokus). */
function Arten({ groesse, zusatz }: { groesse?: 'klein'; zusatz?: string }) {
  return <div className="knoepfe">{ARTEN.map((a) => <Knopf key={a} art={a} groesse={groesse} className={zusatz}>{beschriftung(a)}</Knopf>)}</div>;
}

const GUT: KnopfErgebnis = { art: 'gut', text: t('oberflaeche.muster.knopf.ergebnis.gut') };
const FEHLER: KnopfErgebnis = { art: 'schlecht', text: t('oberflaeche.muster.knopf.ergebnis.fehler') };

export function KnopfMuster() {
  return (
    <div className={s.raster}>
      <Karte zustand="arten" titel={t('oberflaeche.muster.knopf.zustand.arten')}><Arten /></Karte>
      <Karte zustand="klein" titel={t('oberflaeche.muster.knopf.zustand.klein')}><Arten groesse="klein" /></Karte>
      <Karte zustand="hover" titel={t('oberflaeche.muster.zustand.hover')}><Arten zusatz={k.vorschauhover} /></Karte>
      <Karte zustand="fokus" titel={t('oberflaeche.muster.zustand.fokus')}><Arten zusatz={k.vorschaufokus} /></Karte>
      <Karte zustand="gesperrt" titel={t('oberflaeche.muster.zustand.gesperrt')}>
        <div className="knoepfe"><Knopf art="haupt" gesperrt>{t('oberflaeche.muster.knopf.speichern')}</Knopf><Knopf gesperrt>{t('oberflaeche.muster.knopf.pruefen')}</Knopf></div>
      </Karte>
      <Karte zustand="grund" titel={t('oberflaeche.muster.knopf.zustand.grund')}>
        <div className="knoepfe"><Knopf gesperrt={t('oberflaeche.muster.knopf.grund')}>{t('oberflaeche.muster.knopf.abrufen')}</Knopf></div>
      </Karte>
      <Karte zustand="laeuft" titel={t('oberflaeche.muster.knopf.zustand.laeuft')}>
        <div className="knoepfe"><Knopf laeuft>{t('oberflaeche.muster.knopf.pruefen')}</Knopf><Knopf art="haupt" laeuft laeuftText={t('oberflaeche.muster.knopf.sichert')}>{t('oberflaeche.muster.knopf.sichern')}</Knopf></div>
      </Karte>
      <Karte zustand="symbol" titel={t('oberflaeche.muster.knopf.zustand.symbol')}>
        <div className="knoepfe">
          <Knopf nurSymbol={t('oberflaeche.muster.knopf.neu-laden')}><Symbol name="neu-laden" /></Knopf>
          <Knopf groesse="klein" nurSymbol={t('oberflaeche.muster.knopf.zurueck')}><Symbol name="pfeil-links" /></Knopf>
          <Knopf groesse="klein" nurSymbol={t('oberflaeche.muster.knopf.weiter')}><Symbol name="pfeil-rechts" /></Knopf>
        </div>
      </Karte>
      <Karte zustand="ergebnis" titel={t('oberflaeche.muster.knopf.zustand.ergebnis')}>
        <div className="knoepfe"><Knopf ergebnis={GUT}>{t('oberflaeche.muster.knopf.pruefen')}</Knopf></div>
      </Karte>
      <Karte zustand="fehler" titel={t('oberflaeche.muster.zustand.fehler')}>
        <div className="knoepfe"><Knopf ergebnis={FEHLER}>{t('oberflaeche.muster.knopf.testen')}</Knopf></div>
      </Karte>
      <Karte zustand="reihe" titel={t('oberflaeche.muster.knopf.zustand.reihe')}>
        <div className="knoepfe">
          <Knopf ergebnis={{ art: 'info', text: t('oberflaeche.muster.knopf.ergebnis.info') }}>{t('oberflaeche.muster.knopf.testen')}</Knopf>
          <Knopf>{t('oberflaeche.muster.knopf.abrufen')}</Knopf>
        </div>
      </Karte>
      <Karte zustand="ausprobieren" titel={t('oberflaeche.muster.knopf.zustand.ausprobieren')}>
        <p className="leise klein">{t('oberflaeche.muster.knopf.ausprobieren')}</p>
        <div className="knoepfe">
          <Knopf onClick={async () => { await warte(1500); return GUT; }}>{t('oberflaeche.muster.knopf.pruefen')}</Knopf>
          <Knopf onClick={async () => { await warte(1500); throw new Error(t('oberflaeche.muster.knopf.ergebnis.fehler')); }}>{t('oberflaeche.muster.knopf.testen')}</Knopf>
        </div>
      </Karte>
    </div>
  );
}
