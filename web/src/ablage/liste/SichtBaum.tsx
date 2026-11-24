/** Verwaltete Sichten als Baum (#38; #1279 eigene Datei). */
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { sichtName } from '../../../../shared/src/beschriftung';
import { kinderVon, mitNachkommen, type Sicht } from '../../../../shared/src/sichten';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { Link } from '../../ort';
import { t } from '../../sprache';
import { AnsichtSymbol, Symbol } from '../../Symbol';
import { Knopf, Zahl } from '../../bausteine';
import { ZahlWarte } from '../ZahlWarte';

/**
 * Verwaltete Sichten als Baum (#38). Untersichten lassen sich zuklappen; gemerkt je Gerät
 * und Benutzer. Wird eine Sicht geöffnet, klappen ihre Vorfahren auf. Der Pfeil klappt danach immer, auch über der
 * gewählten Sicht (#1495); liegt sie dann verborgen, ist der zugeklappte Bereich als gewählt markiert.
 */
export function SichtBaum({ aktiv, ohne = [] }: { aktiv?: string; ohne?: string[] }) {
  const d = useDaten();
  const { ich } = useKonto();
  const schluessel = `dms:sichten-zu:${ich.id}`;
  const [zu, setZu] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(schluessel) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const merke = (n: Set<string>) => {
    setZu(n);
    try {
      localStorage.setItem(schluessel, JSON.stringify([...n]));
    } catch {
      /* nur für diese Sitzung */
    }
  };
  const umschalten = (id: string) => {
    const n = new Set(zu);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    merke(n);
  };
  // Vorfahren der gewählten Sicht, von außen nach innen.
  const vorfahren: string[] = [];
  for (let s = d.sicht(aktiv); s?.elternId && !vorfahren.includes(s.elternId); s = d.sicht(s.elternId)) vorfahren.unshift(s.elternId);
  // Eine Sicht öffnen (#1495): ihre Vorfahren klappen auf – einmal, danach entscheidet nur der Pfeil.
  const vorfahrenKey = vorfahren.join(',');
  useEffect(() => {
    if (vorfahren.some((id) => zu.has(id))) merke(new Set([...zu].filter((id) => !vorfahren.includes(id))));
  }, [aktiv, vorfahrenKey]); // eslint-disable-line react-hooks/exhaustive-deps -- nur, wenn eine andere Sicht gewählt wird
  // Zugeklappt über der gewählten Sicht (#1495): der äußerste zugeklappte Vorfahr steht für sie und ist markiert.
  const steht = vorfahren.find((id) => zu.has(id));

  const zeilen: Array<{ s: Sicht; tiefe: number; kinder: boolean; offen: boolean }> = [];
  const gehe = (eltern: string | null, tiefe: number) => {
    for (const s of kinderVon(d.sichten, eltern)) {
      if (ohne.includes(s.id)) continue;
      const kinder = kinderVon(d.sichten, s.id).length > 0;
      const offen = kinder && !zu.has(s.id);
      zeilen.push({ s, tiefe, kinder, offen });
      if (offen) gehe(s.id, tiefe + 1);
    }
  };
  gehe(null, 0);

  return (
    <>
      {zeilen.map(({ s, tiefe, kinder, offen }) => {
        const n = d.zaehler.sichten?.[s.id];
        const unter = kinder ? mitNachkommen(d.sichten, s.id).length - 1 : 0;
        return (
          <div key={s.id} className="sichtzeile" style={{ '--tiefe': tiefe } as CSSProperties}>
            {/* Aufklapper (#1212): 28 × 28 px, Lucide-Pfeil dreht sich; ohne Unteransichten bleibt der Platz frei. */}
            {kinder ? (
              <Knopf
                art="eigen"
                className="aufklapper"
                aria-expanded={offen}
                title={
                  offen ? t('ablage.ablage.unteransichten-zuklappen') : t('ablage.ablage.unteransichten-aufklappen', { anzahl: unter })
                }
                nurSymbol={`${sichtName(s)} ${offen ? t('ablage.ablage.zuklappen') : t('ablage.ablage.aufklappen')}`}
                onClick={() => umschalten(s.id)}>
                <Symbol name="pfeil-rechts" />
              </Knopf>
            ) : (
              <span className="aufklapper-platz" aria-hidden="true" />
            )}
            <Link
              to={`/ablage/${s.id}`}
              className={`sicht ${aktiv === s.id || steht === s.id ? 'an' : ''}${tiefe === 0 ? ' oben' : ''}`}
              title={s.beschreibung || undefined}>
              <span className="nm">
                {s.symbol && (
                  <>
                    <AnsichtSymbol name={s.symbol} className="fest-sym" />{' '}
                  </>
                )}
                {sichtName(s)}
              </span>
              {!d.zahlenDa ? <ZahlWarte /> : n !== undefined && <Zahl wert={n} art={s.id === d.zaehler.neuePost ? 'wartet' : 'menge'} />}
            </Link>
          </div>
        );
      })}
    </>
  );
}
