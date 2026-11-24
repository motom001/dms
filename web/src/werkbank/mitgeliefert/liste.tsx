import { Etikett, PaketChip } from '../../bausteine';
import { anbieterSeite } from '../../../../shared/src/werkbankansicht';
import { Link } from '../../ort';
import { t } from '../../sprache';
import { taetigkeitenText, type MitgeliefertZustand } from './zustand';

/**
 * Werkbank → Pakete, Abschnitt „Von Ablago mitgeliefert“ (#1570): unter den installierten Paketen, damit deren Liste
 * nicht doppelt so lang wird. Je mitgeliefertem Anbieter dieselbe Zeile wie ein Paket – Name ohne „Ablago ·“, das
 * Etikett „Ablago“ (PaketChip, Titel „von Ablago mitgeliefert“) und ausgeschaltet zusätzlich „aus“. Darunter die
 * Tätigkeiten als Verben. Entfernen gibt es nicht, nur den Schalter auf der Seite.
 */
export function MitgeliefertListe({ z, offen }: { z: MitgeliefertZustand; offen?: string }) {
  return (
    <section aria-labelledby="mitgeliefert-titel" data-anker="werkbank.pakete.mitgeliefert">
      <h2 className="ueber" id="mitgeliefert-titel">
        {t('werkbank.pakete.mitgeliefert.titel')}
      </h2>
      {z.fehler ? (
        <p className="fehlertext klein">{z.fehler}</p>
      ) : !z.stand ? (
        <p className="leise">{t('werkbank.pakete.mitgeliefert.lade')}</p>
      ) : (
        <ul className="mappenliste">
          {z.stand.mitgeliefert.map((a) => (
            <li key={a.id}>
              <Link to={anbieterSeite(a.id)} className={`eintrag werk ${offen === a.id ? 'an' : ''}`}>
                <span className="titel">
                  {a.name} <PaketChip paket="ablago" inLink />
                  {!a.an && (
                    <>
                      {' '}
                      <Etikett title={t('werkbank.pakete.mitgeliefert.aus.titel')}>{t('werkbank.pakete.mitgeliefert.aus')}</Etikett>
                    </>
                  )}
                </span>
                <span className="unter">{taetigkeitenText(a)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
