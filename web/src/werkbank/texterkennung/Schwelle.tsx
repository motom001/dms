import { useEffect, useState } from 'react';
import { SCHWELLE_MAX, SCHWELLE_MIN, SCHWELLE_STANDARD } from '../../../../shared/src/klassifizierung';
import { sucheApi } from '../../api/suche';
import { Aufklapper, Feld, Knopf } from '../../bausteine';
import { t } from '../../sprache';

const prozent = (x: number) => Math.round(x * 100);

/**
 * Expertenmodus (#1645): Ab welcher Sicherheit „Wohin gehört das?“ einen Mappentyp vorschlägt. Vorgabe wie bisher
 * (30 %); darunter zeigt Ablago die Typen nur als Auswahl. Zugeklappt, damit niemand sie aus Versehen ändert.
 */
export function Schwelle() {
  const [offen, setOffen] = useState(false);
  const [wert, setWert] = useState<number | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => {
    if (!offen || wert !== null) return;
    sucheApi.erkennungStand().then(
      (s) => {
        const w = s.schwelle ?? SCHWELLE_STANDARD;
        setWert(w);
        setEingabe(String(prozent(w)));
      },
      (x: Error) => setMeldung({ art: 'schlecht', text: x.message }),
    );
  }, [offen, wert]);
  const speichere = (schwelle: number | null) => {
    setSendet(true);
    setMeldung(undefined);
    sucheApi
      .erkennungSchwelle(schwelle)
      .then((s) => {
        const w = s.schwelle ?? SCHWELLE_STANDARD;
        setWert(w);
        setEingabe(String(prozent(w)));
        setMeldung({ art: 'gut', text: t('werkbank.texterkennung.schwelle.gespeichert', { prozent: prozent(w) }) });
      })
      .catch((x: Error) => setMeldung({ art: 'schlecht', text: x.message }))
      .finally(() => setSendet(false));
  };
  return (
    <section className="aufklappbereich" id="schwelle">
      <Aufklapper offen={offen} steuert="schwelle-inhalt" umschalten={() => setOffen(!offen)}>
        <span>{t('werkbank.texterkennung.schwelle.experte')}</span>
        <span className="leise klein">{t('werkbank.texterkennung.schwelle.kurz')}</span>
      </Aufklapper>
      {offen && (
        <form
          id="schwelle-inhalt"
          className="aufklappinhalt"
          onSubmit={(e) => {
            e.preventDefault();
            speichere(Number(eingabe) / 100);
          }}>
          <p className="leise klein">{t('werkbank.texterkennung.schwelle.text', { vorgabe: prozent(SCHWELLE_STANDARD) })}</p>
          <Feld beschriftung={t('werkbank.texterkennung.schwelle')}>
            <input
              type="number"
              min={prozent(SCHWELLE_MIN)}
              max={prozent(SCHWELLE_MAX)}
              step={1}
              value={eingabe}
              disabled={wert === null}
              onChange={(e) => setEingabe(e.target.value)}
            />
          </Feld>
          <div className="knoepfe">
            <Knopf type="submit" laeuft={sendet} gesperrt={wert === null}>
              {t('werkbank.texterkennung.schwelle.speichern')}
            </Knopf>
            <Knopf gesperrt={wert === null || wert === SCHWELLE_STANDARD} onClick={() => speichere(null)}>
              {t('werkbank.texterkennung.schwelle.vorgabe')}
            </Knopf>
          </div>
          {meldung && (
            <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
              {meldung.text}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
