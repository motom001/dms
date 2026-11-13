import type { ReactNode } from 'react';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import { RueckfrageVorschau } from '../rueckfrage/Rueckfrage';
import { Knopf, type GefahrRueckfrage, type KnopfArt, type KnopfErgebnis, type KnopfSperre } from './Knopf';
import k from './Knopf.module.css';
import s from '../muster.module.css';

/**
 * Knopf auf der Musterseite (#968, #1210): jede Art und jeder Zustand einmal, Hover und Fokus für alle Arten stehend
 * (hell und dunkel über die Darstellungswahl). Gefahr in Ruhe, Hover, Fokus und mit seiner Rückfrage; gesperrt in den
 * zwei Formen (blass · gestrichelt mit Schloss und ⓘ) samt geöffneter Erklärung. Die Rauchtests fotografieren diesen
 * Bereich und prüfen ihn mit axe (web/rauchtest/muster.mjs); `data-zustand` beginnt mit „knopf-“, damit es sich nicht
 * mit dem Feld überschneidet.
 */

function Karte({ zustand, titel, children, breit }: { zustand: string; titel: string; children: ReactNode; breit?: boolean }) {
  return (
    <div className={`${s.karte} ${breit ? s.breit : ''}`} data-zustand={`knopf-${zustand}`}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const ARTEN: KnopfArt[] = ['anlegen', 'haupt', 'neben', 'gefahr', 'link'];
const beschriftung = (a: KnopfArt) => t.frei(`oberflaeche.muster.knopf.art.${a}`);
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rückfrage des Gefahr-Knopfs der Musterseite: „Notiz löschen?“ */
const FRAGE: GefahrRueckfrage = { titel: t('oberflaeche.muster.knopf.frage.titel'), text: t('oberflaeche.muster.knopf.frage.text'), ja: t('oberflaeche.muster.knopf.art.gefahr') };

/** Ein Knopf jeder Art; Gefahr mit Symbol und Rückfrage, wie es die Typprüfung verlangt. */
function EinKnopf({ art, groesse, zusatz }: { art: KnopfArt; groesse?: 'klein'; zusatz?: string }) {
  if (art === 'gefahr') return <Knopf art="gefahr" symbol="geloescht" rueckfrage={FRAGE} groesse={groesse} className={zusatz}>{beschriftung(art)}</Knopf>;
  return <Knopf art={art} groesse={groesse} className={zusatz}>{beschriftung(art)}</Knopf>;
}

/** Alle Arten in einer Reihe; `zusatz` gibt jedem Knopf dieselbe Klasse (Vorschau für Hover und Fokus). */
function Arten({ groesse, zusatz }: { groesse?: 'klein'; zusatz?: string }) {
  return <div className="knoepfe">{ARTEN.map((a) => <EinKnopf key={a} art={a} groesse={groesse} zusatz={zusatz} />)}</div>;
}

const GUT: KnopfErgebnis = { art: 'gut', text: t('oberflaeche.muster.knopf.ergebnis.gut') };
const FEHLER: KnopfErgebnis = { art: 'schlecht', text: t('oberflaeche.muster.knopf.ergebnis.fehler') };

/** Gesperrt aus einem Grund wie „Mappe löschen“ (#423, #424): Grund, betroffene Einträge, „Stattdessen“ als Knopf. */
const SPERRE: KnopfSperre = {
  grund: t('oberflaeche.muster.knopf.sperre.grund'),
  eintraege: [t('oberflaeche.muster.knopf.sperre.eintrag1'), t('oberflaeche.muster.knopf.sperre.eintrag2')],
  weitere: 3,
  stattdessen: <Knopf groesse="klein">{t('oberflaeche.muster.knopf.sperre.weg')}</Knopf>,
};

/** Gefahr: Ruhe, Maus darüber, Fokus – nebeneinander, damit der Unterschied auffällt. */
function GefahrZustaende() {
  const zustaende = [['ruhe', undefined], ['hover', k.vorschauhover], ['fokus', k.vorschaufokus]] as const;
  return (
    <div className={s.zustaende}>
      {zustaende.map(([z, klasse]) => (
        <div key={z} className={s.zustandsspalte}>
          <span className="leise klein">{t.frei(`oberflaeche.muster.knopf.gefahr.${z}`)}</span>
          <Knopf art="gefahr" symbol="geloescht" rueckfrage={FRAGE} className={klasse}>{beschriftung('gefahr')}</Knopf>
        </div>
      ))}
    </div>
  );
}

function Gesperrt() {
  return (
    <>
      <Karte zustand="gesperrt" titel={t('oberflaeche.muster.knopf.zustand.nichts')}>
        <p className="leise klein">{t('oberflaeche.muster.knopf.nichts')}</p>
        <div className="knoepfe"><Knopf gesperrt>{t('oberflaeche.muster.knopf.verwerfen')}</Knopf><Knopf art="haupt" gesperrt>{t('oberflaeche.muster.knopf.speichern')}</Knopf></div>
      </Karte>
      <Karte zustand="grund" titel={t('oberflaeche.muster.knopf.zustand.grund')}>
        <p className="leise klein">{t('oberflaeche.muster.knopf.grund-text')}</p>
        <div className="knoepfe"><Knopf gesperrt={t('oberflaeche.muster.knopf.grund')}>{t('oberflaeche.muster.knopf.abrufen')}</Knopf></div>
      </Karte>
      <Karte zustand="erklaerung" titel={t('oberflaeche.muster.knopf.zustand.erklaerung')} breit>
        <div className={`knoepfe ${s.platz}`}><Knopf gesperrt={SPERRE} erklaerungOffen>{t('oberflaeche.muster.knopf.sperre.knopf')}</Knopf></div>
      </Karte>
    </>
  );
}

export function KnopfMuster() {
  return (
    <div className={s.raster}>
      <Karte zustand="arten" titel={t('oberflaeche.muster.knopf.zustand.arten')}><Arten /></Karte>
      <Karte zustand="klein" titel={t('oberflaeche.muster.knopf.zustand.klein')}><Arten groesse="klein" /></Karte>
      <Karte zustand="hover" titel={t('oberflaeche.muster.zustand.hover')}><Arten zusatz={k.vorschauhover} /></Karte>
      <Karte zustand="fokus" titel={t('oberflaeche.muster.zustand.fokus')}><Arten zusatz={k.vorschaufokus} /></Karte>
      <Karte zustand="gefahr" titel={t('oberflaeche.muster.knopf.zustand.gefahr')}><GefahrZustaende /></Karte>
      <Karte zustand="rueckfrage" titel={t('oberflaeche.muster.knopf.zustand.rueckfrage')}>
        <RueckfrageVorschau r={{ ...FRAGE, gefahr: true }} />
      </Karte>
      <Gesperrt />
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
          <Knopf art="gefahr" symbol="geloescht" rueckfrage={FRAGE} onClick={async () => { await warte(800); return { art: 'gut', text: t('oberflaeche.muster.knopf.ergebnis.geloescht') }; }}>{beschriftung('gefahr')}</Knopf>
        </div>
      </Karte>
    </div>
  );
}
