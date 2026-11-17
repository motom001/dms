import type { AblaufErgebnis } from '../../../../shared/src/pakete';
import { Knopf } from '../../bausteine';
import { Link } from '../../ort';
import { t } from '../../sprache';

/** Was installiert ist, was nicht – und was noch Einstellungen braucht. */
export function AblaufErgebnisAnsicht({ e, weiter }: { e: AblaufErgebnis; weiter(): void }) {
  const spaeter = e.installiert.filter((x) => x.einstellungen === 'spaeter' || x.einstellungen === 'fehler');
  return (
    <div className="stapel">
      {e.installiert.length > 0 && (
        <div className="hinweis gut" role="status">
          <p>
            <strong>{t('pakete.ablauf.ergebnis.installiert')}</strong> {e.installiert.map((x) => `${x.name} ${x.version}`).join(', ')}.
          </p>
          {spaeter.length > 0 && (
            <p>
              {t('pakete.ablauf.ergebnis.spaeter')}{' '}
              {spaeter.map((x, i) => (
                <span key={x.id}>
                  {i > 0 && ', '}
                  <Link to={`/werkbank/pakete/${x.id}?reiter=einstellungen`} className="verweis">
                    {x.name}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}
        </div>
      )}
      {/* Zusammenfassung (#646): jedes gescheiterte Paket mit Grund, übersprungene mit Grund, Weg zum Nachholen. */}
      {(e.fehlgeschlagen ?? (e.fehler ? [e.fehler] : [])).map((f) => (
        <div key={f.id} className="hinweis schlecht stapel" role="alert">
          <p>
            <strong>{t('pakete.ablauf.ergebnis.fehler', { name: f.name })}</strong> {f.meldung}
          </p>
          {f.gruende.length > 0 && (
            <ul>
              {f.gruende.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
          <p>{t('pakete.ablauf.ergebnis.zurueck')}</p>
        </div>
      ))}
      {e.nichtInstalliert.length > 0 && (
        <div className="hinweis warn stapel" role="status">
          <p>
            <strong>{t('pakete.ablauf.ergebnis.nicht')}</strong>
          </p>
          <ul>
            {e.nichtInstalliert.map((x) => (
              <li key={x.id}>
                <strong>{x.name}</strong> {x.version}
                {x.grund ? `: ${x.grund}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(e.nichtInstalliert.length > 0 || !!e.fehler) && (
        <p className="leise">
          {t('pakete.ablauf.ergebnis.nachholen')}{' '}
          <Link to="/werkbank/pakete" className="verweis">
            {t('werkbank.paketablauf.werkbank-pakete')}
          </Link>
        </p>
      )}
      {!e.installiert.length && !e.fehler && !e.nichtInstalliert.length && <p className="leise">{t('pakete.ablauf.ergebnis.nichts')}</p>}
      <div className="knoepfe">
        <Knopf art="haupt" onClick={weiter}>
          {t('pakete.ablauf.ergebnis.weiter')}
        </Knopf>
      </div>
    </div>
  );
}
