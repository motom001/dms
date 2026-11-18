import { useState } from 'react';
import { betriebApi, type ProbeStand, type WhLauf } from '../../api/betrieb';
import { t } from '../../sprache';
import { Schritte } from '../../wiederherstellen';
import { Hilfe } from '../../Hilfe';
import { Speicherleiste, useEntwurf } from '../../Speicherleiste';
import { Etikett, etikettArt, Feld, Knopf, Schalter } from '../../bausteine';
import { zeit } from '../sicherungFormat';
import { AMPEL, TAGE } from './hilfen';

/** Probe-Wiederherstellung (#109): Ampel, letzte Probe, Zeitplan, jetzt prüfen. */
export function Probe({
  stand,
  lauf,
  sicherungen,
  gesperrt,
  neuLaden,
}: {
  stand: ProbeStand;
  lauf: WhLauf | null;
  sicherungen: boolean;
  gesperrt: boolean;
  neuLaden(): void;
}) {
  const [plan, setPlan] = useState(stand.plan);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(stand.plan, plan, {
    zuruecksetzen: () => {
      setPlan(stand.plan);
      setMeldung(undefined);
    },
  });
  const laeuft = lauf?.art === 'probe' && lauf.status === 'laeuft';
  async function tu(f: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try {
      await f();
      neuLaden();
      if (gut) setMeldung({ art: 'gut', text: gut });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  return (
    <form
      className="blatt"
      id="probe"
      onKeyDown={ent.tasten}
      onSubmit={(x) => {
        x.preventDefault();
        setSendet(true);
        void tu(() => betriebApi.probePlan(plan), t('werkbank.sicherung.gespeichert')).finally(() => setSendet(false));
      }}>
      <h2 className="h3">
        {t('werkbank.sicherung.probe-wiederherstellung')} <Hilfe ort="sicherung.probe" />
      </h2>
      <p>{t('werkbank.sicherung.spielt-die-neueste-sicherung')}</p>
      <dl className="eigenschaften">
        <dt>{t('werkbank.sicherung.ampel')}</dt>
        <dd>
          {stand.ampel ? (
            <Etikett art={etikettArt(AMPEL[stand.ampel][0])}>{AMPEL[stand.ampel][1]}</Etikett>
          ) : (
            <span className="leise">{t('werkbank.sicherung.noch-keine-sicherung')}</span>
          )}
        </dd>
        {stand.letzte && (
          <>
            <dt>{t('werkbank.sicherung.letzte-probe')}</dt>
            <dd>
              {zeit(stand.letzte.am)} · {stand.letzte.name}
              {!stand.letzte.ok && <div className="fehlertext klein">{stand.letzte.info}</div>}
            </dd>
          </>
        )}
      </dl>
      {lauf?.art === 'probe' && (laeuft || lauf.status === 'fehler') && <Schritte schritte={lauf.schritte} />}
      <div className="raster">
        <Schalter
          an={plan.aktiv}
          setze={(an) => setPlan({ ...plan, aktiv: an })}
          beschriftung={t('werkbank.sicherung.woechentlich-automatisch')}
        />
        <Feld beschriftung={t('werkbank.sicherung.wochentag')}>
          <select value={plan.wochentag} onChange={(e) => setPlan({ ...plan, wochentag: Number(e.target.value) })}>
            {TAGE.slice(1).map((text, i) => (
              <option key={text} value={i + 1}>
                {text}
              </option>
            ))}
          </select>
        </Feld>
        <Feld beschriftung={t('werkbank.sicherung.uhrzeit')}>
          <input type="time" value={plan.uhrzeit} onChange={(e) => setPlan({ ...plan, uhrzeit: e.target.value })} />
        </Feld>
      </div>
      <div className="knoepfe">
        <Knopf
          gesperrt={!sicherungen || gesperrt}
          laeuft={laeuft}
          laeuftText={t('werkbank.sicherung.probe-laeuft')}
          onClick={() => tu(() => betriebApi.probeStarten())}>
          {t('werkbank.sicherung.jetzt-probeweise-wiederherstellen')}
        </Knopf>
      </div>
      {/* Ergebnis unter dem Knopf (#986): darüber verschiebt sich nichts. */}
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.sicherung.probe-zeitplan')} sendet={sendet} />
    </form>
  );
}
