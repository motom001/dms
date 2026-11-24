import { useEffect, useState } from 'react';
import { betriebApi, type DateienPruefplan, type DateienPruefplanStand } from '../api/betrieb';
import { Feld, Knopf } from '../bausteine';
import { t } from '../sprache';
import { TAGE } from './sicherung/hilfen';
import { zeit } from './sicherungFormat';

/**
 * Zeitplan für „Alle Dateien prüfen“ (#1316): aus, monatlich (am 1., Vorgabe beim Einschalten), wöchentlich; Uhrzeit
 * wie bei der Sicherung, aber nicht gleichzeitig mit ihr (der Server prüft den Abstand). Darunter der letzte Lauf und
 * ein angefangener, der nach einem Neustart fortsetzt.
 */
export function DateienPruefplanFormular() {
  const [stand, setStand] = useState<DateienPruefplanStand | null>(null);
  const [p, setP] = useState<DateienPruefplan | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => {
    void betriebApi.dateienPruefplan().then(
      (s) => {
        setStand(s);
        setP(s.plan);
      },
      (e: Error) => setMeldung({ art: 'schlecht', text: e.message }),
    );
  }, []);
  if (!stand || !p) return meldung ? <p className="fehlertext">{meldung.text}</p> : null;
  return (
    <form
      className="stapel"
      onSubmit={(e) => {
        e.preventDefault();
        setSendet(true);
        setMeldung(undefined);
        betriebApi
          .dateienPruefplanSpeichern(p)
          .then((s) => {
            setStand(s);
            setP(s.plan);
            setMeldung({ art: 'gut', text: t('werkbank.archiv.pruefplan.gespeichert') });
          })
          .catch((x: Error) => setMeldung({ art: 'schlecht', text: x.message }))
          .finally(() => setSendet(false));
      }}>
      <h3 className="h3">{t('werkbank.archiv.pruefplan')}</h3>
      <div className="raster">
        <Feld beschriftung={t('werkbank.archiv.pruefplan.takt')}>
          <select value={p.takt} onChange={(e) => setP({ ...p, takt: e.target.value as DateienPruefplan['takt'] })}>
            <option value="aus">{t('werkbank.archiv.pruefplan.aus')}</option>
            <option value="monatlich">{t('werkbank.archiv.pruefplan.monatlich')}</option>
            <option value="woechentlich">{t('werkbank.archiv.pruefplan.woechentlich')}</option>
          </select>
        </Feld>
        {p.takt === 'woechentlich' && (
          <Feld beschriftung={t('werkbank.sicherung.wochentag')}>
            <select value={p.wochentag} onChange={(e) => setP({ ...p, wochentag: Number(e.target.value) })}>
              {TAGE.slice(1).map((text, i) => (
                <option key={text} value={i + 1}>
                  {text}
                </option>
              ))}
            </select>
          </Feld>
        )}
        {p.takt !== 'aus' && (
          <Feld
            beschriftung={t('werkbank.sicherung.uhrzeit')}
            hinweis={stand.sicherung ? t('werkbank.archiv.pruefplan.abstand', { uhrzeit: stand.sicherung }) : undefined}>
            <input type="time" value={p.uhrzeit} onChange={(e) => setP({ ...p, uhrzeit: e.target.value })} />
          </Feld>
        )}
      </div>
      <p className="leise klein">{t('werkbank.archiv.pruefplan.text')}</p>
      {stand.lauf && (
        <p className="leise klein">
          {t('werkbank.archiv.pruefplan.lauf', {
            zeit: zeit(stand.lauf.beginn),
            geprueft: stand.lauf.geprueft ?? 0,
            dateien: stand.lauf.dateien ?? '–',
          })}
        </p>
      )}
      {stand.ergebnis && (
        <p className={stand.ergebnis.abweichungen ? 'fehlertext klein' : 'leise klein'}>
          {stand.ergebnis.abweichungen
            ? t('werkbank.archiv.pruefplan.befund', {
                zeit: zeit(stand.ergebnis.am),
                abweichungen: stand.ergebnis.abweichungen,
                dateien: stand.ergebnis.dateien,
              })
            : t('werkbank.archiv.pruefplan.in-ordnung', { zeit: zeit(stand.ergebnis.am), dateien: stand.ergebnis.dateien })}
        </p>
      )}
      <div className="knoepfe">
        <Knopf type="submit" laeuft={sendet}>
          {t('werkbank.archiv.pruefplan.speichern')}
        </Knopf>
      </div>
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
    </form>
  );
}
