import { Kopf } from './Kopf';
import { useKonto } from '../konto';
import { useWartung } from '../wartung';
import { WiederherstellungsAssistent } from '../wiederherstellen';
import { t, tn } from '../sprache';
import { KnopfLink } from '../bausteine';

/** Werkbank → Wiederherstellen (#107): nur im aktiven Wartungsmodus. */

export function WiederherstellungPanel({ abschnitt }: { abschnitt?: boolean } = {}) {
  const { aktualisieren } = useKonto();
  const { stand } = useWartung();
  return (
    <div className="einspaltig">
      <Kopf
        titel={t('werkbank.wiederherstellung.wiederherstellen')}
        abschnitt={abschnitt}
        id="wiederherstellen"
        hilfe="werkbank.wiederherstellung">
        <p className="leise">{t('werkbank.wiederherstellung.ersetzt-den-jetzigen-stand')}</p>
      </Kopf>
      {stand && stand.stufe !== 'aktiv' ? (
        <div className="hinweis warn stapel">
          <p>
            {tn('werkbank.wiederherstellung.damit-niemand-gleichzeitig-arbeitet', {
              b: <strong>{t('werkbank.wiederherstellung.wiederherstellen-geht-nur-im')}</strong>,
            })}
          </p>
          <div>
            <KnopfLink to="/werkbank/wartung#wartungsmodus" groesse="klein">
              {t('werkbank.wiederherstellung.zum-wartungsmodus')}
            </KnopfLink>
          </div>
        </div>
      ) : (
        <section className="blatt">
          <WiederherstellungsAssistent frisch={false} gestartet={() => void aktualisieren()} />
        </section>
      )}
    </div>
  );
}
