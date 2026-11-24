import { useEffect, useState } from 'react';
import { t } from '../../sprache';
import { Aufklapper, Feld, Knopf, KnopfLink } from '../../bausteine';
import { akzeptierbar, GRUND_MAX } from '../../../../shared/src/meldungen';
import { gebietsschema } from '../../../../shared/src/sprache';
import type { Hinweis } from './hinweise';
import type { UebersichtZustand } from './zustand';

const kurzDatum = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });

/**
 * „Zur Kenntnis nehmen“ (#816) bzw. bei Hinweisen „Ausblenden“: nur für gelbe Warnungen und Hinweise. Seit #1587 wirkt
 * der Knopf sofort – danach steht einige Sekunden „Rückgängig“ oben ({@link ZuletztAkzeptiert}); eine Begründung lässt
 * sich danach ergänzen.
 */
export function Akzeptieren({ h, u }: { h: Hinweis; u: UebersichtZustand }) {
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  if (h.erledigen)
    return (
      <>
        <Knopf
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
  return (
    <>
      <Knopf
        groesse="klein"
        laeuft={sendet}
        onClick={() => {
          setSendet(true);
          setFehler(undefined);
          return u
            .akzeptieren(h, '')
            .then(() => u.setZuletzt({ schluessel: h.schluessel, art: h.art }))
            .catch((x) => {
              setFehler((x as Error).message);
              setSendet(false);
            });
        }}>
        {h.art === 'info' ? t('werkbank.uebersicht.ausblenden') : t('werkbank.uebersicht.akzeptieren')}
      </Knopf>
      {fehler && <p className="fehlertext klein">{fehler}</p>}
    </>
  );
}

/** So lange steht „Rückgängig“ nach dem Zur-Kenntnis-Nehmen (#1587); mit offener Begründung bleibt es stehen. */
const RUECKGAENGIG_MS = 8000;

/** Eben zur Kenntnis genommen (#1587): „Rückgängig“ für ein paar Sekunden und „Begründung ergänzen“. */
export function ZuletztAkzeptiert({ u }: { u: UebersichtZustand }) {
  const [grundOffen, setGrundOffen] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const z = u.zuletzt;
  const { setZuletzt } = u;
  useEffect(() => {
    if (!z || grundOffen) return;
    const uhr = window.setTimeout(() => setZuletzt(null), RUECKGAENGIG_MS);
    return () => window.clearTimeout(uhr);
  }, [z, grundOffen, setZuletzt]);
  if (!z) return null;
  const fertig = () => {
    setGrundOffen(false);
    setZuletzt(null);
  };
  return (
    <div className="hinweis info" role="status">
      <p>{z.art === 'info' ? t('werkbank.uebersicht.akzeptiert.ausgeblendet') : t('werkbank.uebersicht.akzeptiert.eben')}</p>
      {grundOffen ? (
        <GrundErgaenzen h={z} u={u} fertig={fertig} />
      ) : (
        <div className="knoepfe">
          <Knopf
            groesse="klein"
            onClick={() =>
              u
                .einblenden(z.schluessel)
                .then(() => setZuletzt(null))
                .catch((x) => setFehler((x as Error).message))
            }>
            {t('werkbank.uebersicht.rueckgaengig')}
          </Knopf>
          <Knopf groesse="klein" onClick={() => setGrundOffen(true)}>
            {t('werkbank.uebersicht.akzeptiert.grund-ergaenzen')}
          </Knopf>
        </div>
      )}
      {fehler && <p className="fehlertext klein">{fehler}</p>}
    </div>
  );
}

/** Begründung nachtragen (#1587): freiwillig, nach dem Zur-Kenntnis-Nehmen – oben gleich danach oder unten in der Liste. */
function GrundErgaenzen({ h, u, fertig }: { h: Pick<Hinweis, 'schluessel' | 'art'>; u: UebersichtZustand; fertig(): void }) {
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  return (
    <form
      className="akzeptieren"
      onSubmit={(e) => {
        e.preventDefault();
        setSendet(true);
        setFehler(undefined);
        u.akzeptieren(h as Hinweis, grund)
          .then(fertig)
          .catch((x) => setFehler((x as Error).message))
          .finally(() => setSendet(false));
      }}>
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
          {t('werkbank.uebersicht.akzeptiert.grund-speichern')}
        </Knopf>
        <Knopf onClick={fertig}>{t('werkbank.uebersicht.akzeptieren.nein')}</Knopf>
      </div>
    </form>
  );
}

/** Eingeklappter Abschnitt ganz unten: „Bewusst akzeptiert (3)“, je Meldung wer, wann, warum – und „Wieder einblenden“. */
export function BewusstAkzeptiert({ u }: { u: UebersichtZustand }) {
  const [auf, setAuf] = useState(false);
  const [ergaenzen, setErgaenzen] = useState<string | null>(null);
  const liste = u.geordnet?.akzeptiert ?? [];
  if (!liste.length) return null;
  return (
    <section className="aufklappbereich akzeptiert">
      <Aufklapper offen={auf} steuert="uebersicht-akzeptiert" umschalten={() => setAuf(!auf)}>
        <span>{t('werkbank.uebersicht.akzeptiert.titel', { anzahl: liste.length })}</span>
        <span className="leise klein">{t('werkbank.uebersicht.akzeptiert.unter')}</span>
      </Aufklapper>
      {auf && (
        <ul id="uebersicht-akzeptiert" className="aufklappinhalt akzeptiertliste">
          {liste.map((x) => (
            <li key={x.schluessel} className={`hinweis ${x.art === 'info' ? 'info' : x.art} stapel`}>
              <p>{x.text}</p>
              <p className="leise klein">
                {t('werkbank.uebersicht.akzeptiert.von', { von: x.akzeptanz.von, am: kurzDatum(x.akzeptanz.am) })}
                {x.akzeptanz.grund ? ` · ${t('werkbank.uebersicht.akzeptiert.grund', { grund: x.akzeptanz.grund })}` : ''}
              </p>
              {ergaenzen === x.schluessel ? (
                <GrundErgaenzen h={x} u={u} fertig={() => setErgaenzen(null)} />
              ) : (
                <div className="knoepfe">
                  <Knopf onClick={() => u.einblenden(x.schluessel)}>{t('werkbank.uebersicht.akzeptiert.einblenden')}</Knopf>
                  <KnopfLink to={x.ziel}>{x.knopf}</KnopfLink>
                  {!x.akzeptanz.grund && (
                    <Knopf onClick={() => setErgaenzen(x.schluessel)}>{t('werkbank.uebersicht.akzeptiert.grund-ergaenzen')}</Knopf>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
