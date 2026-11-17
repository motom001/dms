import { t } from '../../sprache';
import { Link } from '../../ort';
import { Listenkopf } from '../../Listenkopf';
import { GeloeschteEintraege, KnopfLink } from '../../bausteine';
import { zeit } from './hilfen';
import { useRueckkehr, type PostfachZustand } from './zustand';

export function PostfaecherListe({ z, offen }: { z: PostfachZustand; offen?: string }) {
  const rueckkehr = useRueckkehr();
  return (
    <>
      <Listenkopf
        titel={t('werkbank.postfaecher.postfaecher')}
        hilfe="werkbank.postfaecher"
        beschreibung={t('werkbank.postfaecher.mails-abholen-jede-mail')}>
        <KnopfLink to="/werkbank/postfaecher/neu" art="anlegen" groesse="klein">
          {t('werkbank.postfaecher.neu')}
        </KnopfLink>
      </Listenkopf>
      {z.fehler && (
        <div className="hinweis schlecht">
          <p>{z.fehler}</p>
        </div>
      )}
      {!offen && rueckkehr && (
        <div className={`hinweis ${rueckkehr.art}`} role="status">
          <p>{rueckkehr.text}</p>
        </div>
      )}
      {!z.liste ? (
        <p className="leise">{t('werkbank.postfaecher.lade')}</p>
      ) : !z.liste.length ? (
        <p className="leise leerliste">{t('werkbank.postfaecher.noch-kein-postfach')}</p>
      ) : (
        <ul className="mappenliste">
          {z.liste.map((p) => (
            <li key={p.id}>
              <Link to={`/werkbank/postfaecher/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
                <span className="titel">{p.name}</span>
                <span className="unter">
                  {p.benutzer} ·{' '}
                  {p.aktiv
                    ? p.stand.letzterAbruf
                      ? t('werkbank.postfaecher.zuletzt', { zeit: zeit(p.stand.letzterAbruf) })
                      : t('werkbank.postfaecher.noch-nicht-abgerufen')
                    : t('werkbank.postfaecher.aus')}
                </span>
                {p.oauth && p.oauth.zustand !== 'ok' ? (
                  <span className="problem">
                    {p.oauth.zustand === 'abgelaufen'
                      ? t('werkbank.postfaecher.anmeldung-abgelaufen')
                      : t('werkbank.postfaecher.nicht-angemeldet')}
                  </span>
                ) : (
                  p.stand.fehlerFolge > 0 && <span className="problem">{t('werkbank.postfaecher.fehler')}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <GeloeschteEintraege art="postfach" />
    </>
  );
}
