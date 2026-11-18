import { useState } from 'react';
import { ANSICHT_SYMBOLE } from '../../../../shared/src/ansichtsymbole';
import { AnsichtSymbol, Symbol } from '../../Symbol';
import { t } from '../../sprache';
import { Knopf, Suchfeld } from '../../bausteine';

/**
 * Symbol der Ansicht (#428): Raster aus der festen Auswahl (Lucide), mit Suche nach Namen und Bedeutung.
 * Gespeichert wird nur der Name; „Ohne Symbol“ bleibt möglich.
 */
export function SymbolWahl({ wert, setze }: { wert: string | null; setze(n: string | null): void }) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const q = suche.trim().toLowerCase();
  const titel = ANSICHT_SYMBOLE.flatMap((g) => g.symbole).find((x) => x.name === wert)?.titel;
  return (
    <div className="eigenschaft symbolwahl">
      <span id="symbolwahl-t">
        {t('werkbank.sicht.symbol')} <small>{t('werkbank.sicht.symbol.hinweis')}</small>
      </span>
      <div className="knoepfe">
        <Knopf aria-expanded={offen} aria-labelledby="symbolwahl-t symbolwahl-w" onClick={() => setOffen(!offen)}>
          <span id="symbolwahl-w">
            {wert ? (
              <>
                <AnsichtSymbol name={wert} /> {titel ?? wert}
              </>
            ) : (
              t('werkbank.sicht.symbol.ohne')
            )}
          </span>{' '}
          <Symbol name="pfeil-unten" />
        </Knopf>
        {wert && (
          <Knopf symbol="schliessen" onClick={() => setze(null)}>
            {t('werkbank.sicht.symbol.entfernen')}
          </Knopf>
        )}
      </div>
      {offen && (
        <div className="symbolraster-rahmen">
          <Suchfeld
            wert={suche}
            setze={setSuche}
            beschriftung={t('werkbank.sicht.symbol.suchen')}
            platzhalter={t('werkbank.sicht.symbol.suchen')}
          />
          {ANSICHT_SYMBOLE.map((g) => {
            const liste = g.symbole.filter(
              (x) => !q || x.titel.toLowerCase().includes(q) || x.name.includes(q) || g.gruppe.toLowerCase().includes(q),
            );
            if (!liste.length) return null;
            return (
              <fieldset key={g.gruppe} className="symbolgruppe">
                <legend className="leise klein">{g.gruppe}</legend>
                <div className="symbolraster">
                  {liste.map((x) => (
                    <Knopf
                      key={x.name}
                      art="eigen"
                      className={`symbolknopf${wert === x.name ? ' an' : ''}`}
                      aria-pressed={wert === x.name}
                      nurSymbol={x.titel}
                      onClick={() => {
                        setze(x.name);
                        setOffen(false);
                      }}>
                      <AnsichtSymbol name={x.name} />
                    </Knopf>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}
