import { useState } from 'react';
import { t } from '../../sprache';
import { Feld, Knopf, KnopfLink } from '../../bausteine';
import { Symbol } from '../../Symbol';
import { akzeptierbar, GRUND_MAX } from '../../../../shared/src/meldungen';
import { gebietsschema } from '../../../../shared/src/sprache';
import type { Hinweis } from './hinweise';
import type { UebersichtZustand } from './zustand';

const kurzDatum = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });

/** „Zur Kenntnis nehmen“ (#816): nur für gelbe Warnungen und Hinweise; die Begründung ist freiwillig. */
export function Akzeptieren({ h, u }: { h: Hinweis; u: UebersichtZustand }) {
  const [offen, setOffen] = useState(false);
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  if (h.erledigen)
    return (
      <>
        <Knopf
          art="link"
          groesse="klein"
          laeuft={sendet}
          onClick={() => {
            setSendet(true);
            setFehler(undefined);
            return u
              .erledigen(h.schluessel)
              .catch((x) => setFehler((x as Error).message))
              .finally(() => setSendet(false));
          }}>
          {h.erledigen}
        </Knopf>
        {fehler && <p className="fehlertext klein">{fehler}</p>}
      </>
    );
  if (!akzeptierbar(h.art)) return null;
  if (!offen)
    return (
      <Knopf art="link" groesse="klein" onClick={() => setOffen(true)}>
        {t('werkbank.uebersicht.akzeptieren')}
      </Knopf>
    );
  return (
    <form
      className="akzeptieren"
      onSubmit={(e) => {
        e.preventDefault();
        setSendet(true);
        setFehler(undefined);
        u.akzeptieren(h, grund)
          .catch((x) => setFehler((x as Error).message))
          .finally(() => setSendet(false));
      }}>
      <p className="leise klein">{t('werkbank.uebersicht.akzeptieren.text')}</p>
      <Feld beschriftung={t('werkbank.uebersicht.akzeptieren.grund')} optional>
        <input
          value={grund}
          maxLength={GRUND_MAX}
          onChange={(e) => setGrund(e.target.value)}
          placeholder={t('werkbank.uebersicht.akzeptieren.grund.platzhalter')}
          autoFocus
        />
      </Feld>
      {fehler && <p className="fehlertext klein">{fehler}</p>}
      <div className="knoepfe">
        <Knopf art="haupt" type="submit" laeuft={sendet}>
          {t('werkbank.uebersicht.akzeptieren.ja')}
        </Knopf>
        <Knopf
          onClick={() => {
            setOffen(false);
            setGrund('');
          }}>
          {t('werkbank.uebersicht.akzeptieren.nein')}
        </Knopf>
      </div>
    </form>
  );
}

/** Eingeklappter Abschnitt ganz unten: „Bewusst akzeptiert (3)“, je Meldung wer, wann, warum – und „Wieder einblenden“. */
export function BewusstAkzeptiert({ u }: { u: UebersichtZustand }) {
  const [auf, setAuf] = useState(false);
  const liste = u.geordnet?.akzeptiert ?? [];
  if (!liste.length) return null;
  return (
    <section className="aufklappbereich akzeptiert">
      <Knopf art="link" className="aufklappkopf" aria-expanded={auf} aria-controls="uebersicht-akzeptiert" onClick={() => setAuf(!auf)}>
        <Symbol name={auf ? 'pfeil-unten' : 'pfeil-rechts'} className="zeichen" />
        <span>{t('werkbank.uebersicht.akzeptiert.titel', { anzahl: liste.length })}</span>
        <span className="leise klein">{t('werkbank.uebersicht.akzeptiert.unter')}</span>
      </Knopf>
      {auf && (
        <ul id="uebersicht-akzeptiert" className="aufklappinhalt akzeptiertliste">
          {liste.map((x) => (
            <li key={x.schluessel} className={`hinweis ${x.art === 'info' ? 'info' : x.art} stapel`}>
              <p>{x.text}</p>
              <p className="leise klein">
                {t('werkbank.uebersicht.akzeptiert.von', { von: x.akzeptanz.von, am: kurzDatum(x.akzeptanz.am) })}
                {x.akzeptanz.grund ? ` · ${t('werkbank.uebersicht.akzeptiert.grund', { grund: x.akzeptanz.grund })}` : ''}
              </p>
              <div className="knoepfe">
                <Knopf onClick={() => u.einblenden(x.schluessel)}>{t('werkbank.uebersicht.akzeptiert.einblenden')}</Knopf>
                <KnopfLink to={x.ziel}>{x.knopf}</KnopfLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
