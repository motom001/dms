import { useEffect, useId, useState } from 'react';
import { ANSICHT_SYMBOLE, symboleSuchen } from '../../../../shared/src/ansichtsymbole';
import { sucheApi } from '../../api/suche';
import { AnsichtSymbol, Symbol } from '../../Symbol';
import { t } from '../../sprache';
import { Aufklapper, Knopf, KeineTreffer, Suchfeld, Zahl } from '../../bausteine';

/**
 * Symbol der Ansicht (#428): Raster aus der festen Auswahl (Lucide), mit Suche nach Namen, Bedeutung und Gruppe.
 * Seit #1519 (259 Symbole) stehen die 16 Gruppen eingeklappt mit Anzahl da; offen ist zuerst nur die Gruppe mit dem
 * gewählten Symbol. Beim Suchen sind alle Gruppen mit Treffern offen; gesucht wird auch mit den gleichbedeutenden
 * Wörtern aus der Werkbank (#1548). Gespeichert wird nur der Name; „Ohne Symbol“ bleibt möglich.
 */
export function SymbolWahl({ wert, setze }: { wert: string | null; setze(n: string | null): void }) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const gleich = useGleichbedeutend(offen);
  const q = suche.trim();
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
          <SymbolGruppen
            q={q}
            gleich={gleich}
            wert={wert}
            zuruecksetzen={() => setSuche('')}
            waehle={(n) => {
              setze(n);
              setOffen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Gleichbedeutende Wörter (#1548), einmal beim Öffnen der Auswahl geladen; ohne sie sucht die Auswahl wie bisher. */
function useGleichbedeutend(offen: boolean) {
  const [gruppen, setGruppen] = useState<string[][]>([]);
  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    sucheApi
      .gleichbedeutend()
      .then((g) => aktuell && setGruppen(g))
      .catch(() => undefined);
    return () => {
      aktuell = false;
    };
  }, [offen]);
  return gruppen;
}

/** Die Gruppen als Abschnitte zum Auf- und Zuklappen (#1519); mit Suchwort nur die Treffer, alle offen. */
function SymbolGruppen({
  q,
  gleich,
  wert,
  waehle,
  zuruecksetzen,
}: {
  q: string;
  gleich: string[][];
  wert: string | null;
  waehle(n: string): void;
  zuruecksetzen(): void;
}) {
  const id = useId();
  const [offen, setOffen] = useState<ReadonlySet<string>>(
    () => new Set(ANSICHT_SYMBOLE.filter((g) => g.symbole.some((x) => x.name === wert)).map((g) => g.gruppe)),
  );
  const gruppen = symboleSuchen(q, gleich).map((g) => ({ ...g, liste: g.symbole }));
  if (!gruppen.length) return <KeineTreffer zuruecksetzen={zuruecksetzen} />;
  return (
    <>
      {gruppen.map((g, i) => {
        const auf = !!q || offen.has(g.gruppe);
        return (
          <section key={g.gruppe} className="symbolgruppe">
            <Aufklapper
              offen={auf}
              steuert={`${id}-${i}`}
              umschalten={() =>
                setOffen((o) => {
                  const n = new Set(o);
                  if (n.has(g.gruppe)) n.delete(g.gruppe);
                  else n.add(g.gruppe);
                  return n;
                })
              }>
              <span>{g.gruppe}</span> <Zahl wert={g.liste.length} />
            </Aufklapper>
            {auf && (
              <div id={`${id}-${i}`} className="symbolraster" role="group" aria-label={g.gruppe}>
                {g.liste.map((x) => (
                  <Knopf
                    key={x.name}
                    art="eigen"
                    className={`symbolknopf${wert === x.name ? ' an' : ''}`}
                    aria-pressed={wert === x.name}
                    nurSymbol={x.titel}
                    onClick={() => waehle(x.name)}>
                    <AnsichtSymbol name={x.name} />
                  </Knopf>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
