import { useEffect, useState, type ReactElement } from 'react';
import { t } from '../../sprache';
import { Reiter, ReiterFlaeche, reiterId, Zahl } from '../../bausteine';
import { GRUPPEN, HANDY_SCHWERPUNKT, imHandySchwerpunkt, type Gruppe } from '../../../../shared/src/werkbankansicht';

const REITER_ID = 'werkbank-gruppen';

/** Was die Bereiche von einem Eintrag der Leiste brauchen (`WerkbankEintrag` – ohne Einbinden, sonst ein Kreis). */
interface Eintrag {
  pfad: string;
  gruppe: Gruppe | null;
  warn?: string | number;
}

/**
 * Bereiche der Werkbank am Handy (#1204), ein eigener Schritt (`/werkbank?bereiche`): oben der Handy-Schwerpunkt in
 * fester Reihenfolge (`HANDY_SCHWERPUNKT`), darunter „Alle Bereiche“ – die übrigen, nach Gruppen als Baustein Reiter
 * (#1271). Tippen auf eine Gruppe zeigt ihre Bereiche, tippen auf einen Bereich öffnet die Seite ohne die Bereiche darüber.
 * Vorgewählt ist die Gruppe aus der Adresse (`?bereiche=ablage`, der Weg zurück einer Seite), sonst die erste. Ein
 * Schwerpunkt, keine Sperre: Jeder Bereich der Leiste steht genau einmal da.
 */
export function HandyBereiche<E extends Eintrag>({
  liste,
  gruppe,
  eintrag,
}: {
  /** Die sichtbaren Einträge der Leiste (ohne ausgeblendete, solange sie nicht aufgeklappt sind). */
  liste: E[];
  gruppe: Gruppe | null;
  eintrag: (e: E) => ReactElement;
}) {
  const vorn = HANDY_SCHWERPUNKT.flatMap((p) => liste.filter((e) => e.pfad === p));
  const rest = liste.filter((e) => e.gruppe && !imHandySchwerpunkt(e.pfad));
  const gruppen = (Object.keys(GRUPPEN) as Gruppe[]).filter((g) => rest.some((e) => e.gruppe === g));
  const [gewaehlt, setGewaehlt] = useState<Gruppe | null>(gruppe);
  useEffect(() => {
    setGewaehlt(gruppe);
  }, [gruppe]);
  const reiter = gewaehlt && gruppen.includes(gewaehlt) ? gewaehlt : (gruppen[0] ?? null);
  // Vom Weg zurück einer Seite („‹ Daten sichern“): Die Reihe der Reiter rollt selbst – den gewählten ins Bild holen.
  const vorgewaehlt = gruppe && gruppen.includes(gruppe) ? gruppe : null;
  useEffect(() => {
    const el = vorgewaehlt ? document.getElementById(reiterId(REITER_ID, vorgewaehlt)) : null;
    const reihe = el?.parentElement;
    if (el && reihe) reihe.scrollLeft += el.getBoundingClientRect().left - reihe.getBoundingClientRect().left - 16;
  }, [vorgewaehlt]);
  const warnIn = (g: Gruppe) => rest.filter((e) => e.gruppe === g && e.warn).length;
  return (
    <>
      {vorn.length > 0 && (
        <div className="wbgruppe">
          <h2 className="gruppentitel">{t('werkbank.uebersicht.handy.unterwegs')}</h2>
          {vorn.map(eintrag)}
        </div>
      )}
      {reiter && (
        <div className="wbgruppe wb-alle">
          <h2 className="gruppentitel">
            {t('werkbank.uebersicht.handy.alle')} <span className="wb-alle-hinweis">{t('werkbank.uebersicht.handy.bequemer')}</span>
          </h2>
          <Reiter
            id={REITER_ID}
            wert={reiter}
            setze={setGewaehlt}
            beschriftung={t('werkbank.uebersicht.bereiche-der-werkbank')}
            className="gruppenreiter"
            wahlen={gruppen.map((g) => {
              const n = warnIn(g);
              return {
                wert: g,
                text: (
                  <>
                    {GRUPPEN[g]}
                    {n > 0 && <Zahl wert={n} art="warnung" beschriftung={t('werkbank.uebersicht.mit-hinweis-zahl', { anzahl: n })} />}
                  </>
                ),
              };
            })}
          />
          <ReiterFlaeche id={REITER_ID} wert={reiter} className="wb-alle-flaeche">
            {rest.filter((e) => e.gruppe === reiter).map(eintrag)}
          </ReiterFlaeche>
        </div>
      )}
    </>
  );
}
