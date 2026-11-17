import { useEffect } from 'react';
import { geheZu, Link } from '../../ort';
import { t, tn } from '../../sprache';
import { bereichName } from '../../../../shared/src/werkbankansicht';
import { KnopfLink } from '../../bausteine';
import { Kopf } from '../Kopf';
import { VORGABEN_SEITE } from './hilfen';
import type { DatenschutzZustand } from './zustand';
import { AuskunftDetail } from './AuskunftDetail';
import { AuskunftErteilen } from './AuskunftErteilen';

/** Rechte Spalte: „neu“ = Assistent, ohne Auswahl der Weg zu den Vorgaben, sonst eine Auskunft (auch Anfrage oder Auftrag). */
export function AuskunftRechts({ z, id }: { z: DatenschutzZustand; id?: string }) {
  const s = z.stand;
  // Alte Links aus der Mappe der Person (/werkbank/datenschutz?mappe=…) führen in den Assistenten.
  const mappe = new URLSearchParams(location.search).get('mappe');
  useEffect(() => {
    if (!id && mappe) geheZu(`/werkbank/auskuenfte/neu?mappe=${encodeURIComponent(mappe)}`, true);
  }, [id, mappe]);
  if (!s) return <p className="leise">{z.fehler ?? t('werkbank.datenschutz.lade')}</p>;
  if (id === 'neu')
    return (
      <div className="einspaltig">
        <Kopf titel={t('werkbank.auskunft.neu.titel')} ueber={bereichName('auskuenfte')} hilfe="werkbank.datenschutz">
          <p className="leise">{t('werkbank.datenschutz.fragt-ein-kunde-mieter')}</p>
          {/* #994: Woher Empfänger, Rechte-Text und Anrede kommen – am Handy der Weg zu den Vorgaben. */}
          <p className="leise klein">
            {tn('werkbank.auskunft.neu.vorgaben', {
              link: (
                <Link to={VORGABEN_SEITE} className="verweis">
                  {t('werkbank.auskunft.neu.vorgaben.link')}
                </Link>
              ),
            })}
          </p>
        </Kopf>
        <AuskunftErteilen
          einstellung={s.einstellung}
          nachher={z.laden}
          zustellen={(aid) => geheZu(`/werkbank/auskuenfte/${aid}?zustellen=1`)}
        />
      </div>
    );
  // Vorgaben für jede Auskunft (#994) stehen seit #1183 auf „Eigene Organisation“ (/werkbank/auskuenfte/einstellungen leitet um).
  if (!id)
    return (
      <div className="einspaltig">
        <Kopf titel={bereichName('auskuenfte')} hilfe="werkbank.auskunft">
          <p className="leise">{t('werkbank.auskunft.rechts.waehlen')}</p>
        </Kopf>
        <section className="blatt" aria-labelledby="auskunft-vorgaben-verweis">
          <h2 className="h3" id="auskunft-vorgaben-verweis">
            {t('werkbank.auskunft.einstellungen.titel')}
          </h2>
          <p className="leise klein">{t('werkbank.auskunft.vorgaben.verlegt')}</p>
          <KnopfLink to={VORGABEN_SEITE}>{t('werkbank.auskunft.vorgaben.oeffnen')}</KnopfLink>
        </section>
      </div>
    );
  const e = s.verzeichnis.find((x) => x.id === id);
  if (!e)
    return (
      <div className="leer">
        <p>{t('werkbank.auskunft.rechts.fehlt')}</p>
      </div>
    );
  return <AuskunftDetail key={e.id} e={e} z={z} />;
}
