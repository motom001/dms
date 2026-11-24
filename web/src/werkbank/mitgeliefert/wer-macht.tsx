import { useState } from 'react';
import { zurWahl, type Taetigkeitswahl } from '../../../../shared/src/leistungen';
import { Feld } from '../../bausteine';
import { Hilfe } from '../../Hilfe';
import { Link } from '../../ort';
import { t } from '../../sprache';
import { dateitypenText, type MitgeliefertZustand } from './zustand';

/** Sprungmarke des Abschnitts „Wer macht das?“ auf Werkbank → Pakete. */
const WER_MACHT_WEG = '/werkbank/pakete#wer-macht-das';

const VORGABE = '';
/** Wer es ohne Wahl macht: eingebaut, sonst der erste (wie die Vermittlung, server/src/leistungen/anbieter.ts). */
const vorgabeVon = (x: Taetigkeitswahl) => x.macher.find((m) => m.art === 'eingebaut') ?? x.macher[0];
const wer = (x: Taetigkeitswahl, id: string | null) => {
  const m = (id && x.macher.find((y) => y.id === id)) || vorgabeVon(x);
  return m.art === 'eingebaut' ? t('werkbank.pakete.wer-macht.ablago') : m.name;
};

/**
 * „Wer macht das?“ (#1570, Qualität 14.1): Wahl je Tätigkeit – nur sichtbar, wenn eine Tätigkeit mehr als einen hat, der
 * sie kann; sonst gibt es nichts zu wählen. Tabelle Tätigkeit | macht | Dateitypen, Vorgabe „Ablago“.
 */
export function WerMachtDas({ z }: { z: MitgeliefertZustand }) {
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const liste = z.stand ? zurWahl(z.stand) : [];
  if (!liste.length) return null;
  async function waehle(x: Taetigkeitswahl, id: string) {
    setMeldung(undefined);
    try {
      await z.waehle(x.leistung, id === VORGABE ? null : id);
      setMeldung({ art: 'gut', text: t('werkbank.pakete.wer-macht.gespeichert', { taetigkeit: x.name, wer: wer(x, id || null) }) });
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    }
  }
  return (
    <section className="blatt" id="wer-macht-das">
      <h2 className="h3">
        {t('werkbank.pakete.wer-macht.titel')} <Hilfe ort="werkbank.pakete.wer-macht" />
      </h2>
      <p className="leise">{t('werkbank.pakete.wer-macht.text')}</p>
      <table className="tabelle klein">
        <thead>
          <tr>
            <th>{t('werkbank.pakete.wer-macht.taetigkeit')}</th>
            <th>{t('werkbank.pakete.wer-macht.macht')}</th>
            <th>{t('werkbank.pakete.wer-macht.dateitypen')}</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((x) => (
            <tr key={x.leistung}>
              <td>{x.name}</td>
              <td>
                <Feld beschriftung={t('werkbank.pakete.wer-macht.feld', { taetigkeit: x.name })} beschriftungVerbergen>
                  <select value={x.gewaehlt ?? VORGABE} onChange={(e) => void waehle(x, e.target.value)}>
                    <option value={VORGABE}>{t('werkbank.pakete.wer-macht.vorgabe', { wer: wer(x, null) })}</option>
                    {x.macher
                      .filter((m) => m.id !== vorgabeVon(x).id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.an ? m.name : t('werkbank.pakete.wer-macht.aus', { wer: m.name })}
                        </option>
                      ))}
                  </select>
                </Feld>
              </td>
              <td>{dateitypenText(x.dateitypen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {meldung && (
        <p className={meldung.art === 'gut' ? 'leise klein' : 'fehlertext klein'} role="status">
          {meldung.text}
        </p>
      )}
    </section>
  );
}

/**
 * Reiter „Bietet an“ an der Seite eines Pakets (#1570): welche Tätigkeiten das Paket für Ablago übernehmen kann und wer
 * sie gerade macht – mit dem Weg zu „Wer macht das?“. Nur, wenn das Paket etwas anbietet.
 */
export function BietetAn({ z, paket }: { z: MitgeliefertZustand | undefined; paket: string }) {
  const liste = bietetAn(z, paket);
  return (
    <div className="stapel">
      <p className="leise">{t('werkbank.pakete.bietet-an.text')}</p>
      <ul>
        {liste.map((x) => (
          <li key={x.leistung}>
            <strong>{x.name}</strong> –{' '}
            {(x.gewaehlt ?? vorgabeVon(x).id) === paket
              ? t('werkbank.pakete.bietet-an.macht')
              : t('werkbank.pakete.bietet-an.macht-anderer', { wer: wer(x, x.gewaehlt) })}
          </li>
        ))}
      </ul>
      <p>
        <Link to={WER_MACHT_WEG} className="verweis">
          {t('werkbank.pakete.bietet-an.link')}
        </Link>
      </p>
    </div>
  );
}

/** Tätigkeiten, die ein Paket anbietet (leer, solange keine Pakete Tätigkeiten anbieten, #1572). */
export const bietetAn = (z: MitgeliefertZustand | undefined, paket: string): Taetigkeitswahl[] =>
  z?.stand?.taetigkeiten.filter((x) => x.macher.some((m) => m.art === 'paket' && m.id === paket)) ?? [];
