import { GESAMT, verwaltungsbaum } from '../../../../shared/src/verwaltungsrecht';
import { bereichName } from '../../../../shared/src/werkbankansicht';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import { Symbol } from '../../Symbol';
import { Etikett, FeldGruppe, HakenFeld } from '../../bausteine';

/**
 * Verwaltungsrecht an der Person (#818): Haken „Darf Ablago verwalten“, darunter der Baum der Werkbank-Bereiche aus
 * `BEREICHE`, ganz oben „Gesamte Verwaltung“ (auch künftige Bereiche). Ändern darf nur, wer selbst „Gesamte
 * Verwaltung“ hat – der Server verlangt dafür eine frische Anmeldung (der Dialog fragt sie ab). Seit #1000 speichert
 * die Speicherleiste des Benutzers mit.
 */
export function Verwaltungsrecht({
  wahl,
  setWahl,
  darfAendern,
  sperre,
}: {
  wahl: string[];
  setWahl: (w: string[] | ((w: string[]) => string[])) => void;
  darfAendern: boolean;
  sperre: boolean;
}) {
  const an = wahl.length > 0;
  const gesamt = wahl.includes(GESAMT);
  const baum = verwaltungsbaum();
  const umschalten = (pfad: string, x: boolean) =>
    setWahl((w) => (x ? [...w.filter((y) => y !== GESAMT), pfad] : w.filter((y) => y !== pfad)));
  return (
    <div className="verwaltungsrecht" id="verwaltungsrecht">
      <h3 className="h4">
        {t('werkbank.verwaltungsrecht.titel')} <Hilfe ort="werkbank.verwaltungsrecht" />
      </h3>
      <p className="leise">{t('werkbank.verwaltungsrecht.text')}</p>
      {!darfAendern && (
        <p className="hinweis info">
          <span>{t('werkbank.verwaltungsrecht.nurGesamt')}</span>
        </p>
      )}
      <fieldset disabled={!darfAendern || sperre} className="wahl">
        <legend className="sr">{t('werkbank.verwaltungsrecht.titel')}</legend>
        <HakenFeld beschriftung={t('werkbank.verwaltungsrecht.darf')}>
          <input id="darf-verwalten" type="checkbox" checked={an} onChange={(e) => setWahl(e.target.checked ? [GESAMT] : [])} />
        </HakenFeld>
        {an && (
          <div className="verwaltungsbaum">
            <HakenFeld beschriftung={t('werkbank.verwaltungsrecht.gesamt')} hinweis={t('werkbank.verwaltungsrecht.gesamt.text')}>
              <input
                id="gesamte-verwaltung"
                type="checkbox"
                checked={gesamt}
                onChange={(e) => setWahl(e.target.checked ? [GESAMT] : baum.flatMap((a) => a.bereiche.map((x) => x.pfad)))}
              />
            </HakenFeld>
            {baum.map((a) => (
              <FeldGruppe key={a.gruppe} beschriftung={a.name} className="verwaltungsgruppe">
                <div className="verwaltungsast">
                  {a.bereiche.map((x) => (
                    <label key={x.pfad} className="haken">
                      <input
                        type="checkbox"
                        checked={gesamt || wahl.includes(x.pfad)}
                        disabled={gesamt}
                        onChange={(e) => umschalten(x.pfad, e.target.checked)}
                      />
                      <span>
                        {bereichName(x.pfad)}
                        {x.heikel && (
                          <>
                            {' '}
                            <Etikett art="warn" klein title={t('werkbank.verwaltungsrecht.heikel.titel')}>
                              <Symbol name="warnung" /> {t('werkbank.verwaltungsrecht.heikel')}
                            </Etikett>
                          </>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </FeldGruppe>
            ))}
          </div>
        )}
      </fieldset>
      {an && !gesamt && <p className="leise klein">{t('werkbank.verwaltungsrecht.ordnung')}</p>}
    </div>
  );
}
