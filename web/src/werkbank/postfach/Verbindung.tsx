import { t } from '../../sprache';
import type { OAuthAnbieter, PostfachAnsicht, PostfachEingabe } from '../../api/eingaenge';
import { Bereich, Feld, HakenFeld, Knopf, type Klappe, type KnopfErgebnis } from '../../bausteine';
import { ANBIETER, gleicherServer, PORT } from './hilfen';

type Setze = (x: Partial<PostfachEingabe>) => void;

/** Verbindung zum IMAP-Server (#196, #358): Server, Anmeldung, Passwort – mit „Verbindung testen“. */
export function Verbindung({
  e,
  vorhanden,
  setze,
  bestaetigt,
  setBestaetigt,
  klappe,
  testen,
}: {
  e: PostfachEingabe;
  vorhanden?: PostfachAnsicht;
  setze: (x: Partial<PostfachEingabe>) => void;
  bestaetigt: boolean;
  setBestaetigt: (x: boolean) => void;
  klappe: Klappe;
  testen: () => Promise<KnopfErgebnis>;
}) {
  return (
    <Bereich
      id="verbindung"
      titel={t('werkbank.postfaecher.bereich.verbindung')}
      klappe={klappe}
      kurz={[e.benutzer, e.server, e.anmeldung === 'oauth' ? t('werkbank.postfaecher.oauth-2-0') : ''].filter(Boolean).join(' · ')}>
      <div className="raster">
        <Feld beschriftung={t('werkbank.postfaecher.server')}>
          <input
            id="pf-server"
            value={e.server}
            placeholder="imap.example.org"
            onChange={(x) => setze({ server: x.target.value.trim() })}
          />
        </Feld>
        <Feld beschriftung={t('werkbank.postfaecher.verschluesselung')}>
          <select
            id="pf-verschluesselung"
            value={e.verschluesselung}
            onChange={(x) => {
              const v = x.target.value as PostfachEingabe['verschluesselung'];
              setze({ verschluesselung: v, port: PORT[v] });
            }}>
            <option value="ssl">{t('werkbank.postfaecher.ssl-tls-meist-port')}</option>
            <option value="starttls">{t('werkbank.postfaecher.starttls-meist-port-143')}</option>
            <option value="keine" disabled={e.anmeldung === 'oauth'}>
              {t('werkbank.postfaecher.keine-unsicher')}
            </option>
          </select>
        </Feld>
        <Feld beschriftung={t('werkbank.postfaecher.port')}>
          <input id="pf-port" type="number" min={1} max={65535} value={e.port} onChange={(x) => setze({ port: Number(x.target.value) })} />
        </Feld>
        {anmeldungFelder(e, setze)}
        <Feld
          beschriftung={t('werkbank.postfaecher.benutzername')}
          hinweis={e.anmeldung === 'oauth' && t('werkbank.postfaecher.die-mail-adresse-des')}>
          <input id="pf-benutzer" value={e.benutzer} autoComplete="off" onChange={(x) => setze({ benutzer: x.target.value })} />
        </Feld>
        {e.anmeldung !== 'oauth' && (
          <Feld
            beschriftung={t('werkbank.postfaecher.passwort')}
            hinweis={
              vorhanden?.passwortGesetzt
                ? gleicherServer(e, vorhanden)
                  ? t('werkbank.postfaecher.gespeichert-leer-lassen-um')
                  : t('werkbank.postfaecher.server-geaendert-bitte-neu')
                : t('werkbank.postfaecher.wird-verschluesselt-gespeichert')
            }>
            <input
              id="pf-passwort"
              type="password"
              autoComplete="new-password"
              value={e.passwort ?? ''}
              onChange={(x) => setze({ passwort: x.target.value })}
            />
          </Feld>
        )}
      </div>
      {e.verschluesselung === 'keine' && vorhanden?.verschluesselung !== 'keine' && (
        <div className="hinweis schlecht">
          <p>{t('werkbank.postfaecher.ohne-verschluesselung-gehen-passwort')}</p>
          <HakenFeld beschriftung={t('werkbank.postfaecher.trotzdem-ohne-verschluesselung')}>
            <input id="pf-unsicher" type="checkbox" checked={bestaetigt} onChange={(x) => setBestaetigt(x.target.checked)} />
          </HakenFeld>
        </div>
      )}
      <div className="knoepfe">
        <Knopf onClick={testen} laeuftText={t('werkbank.postfaecher.verbinde')}>
          {t('werkbank.postfaecher.verbindung-testen')}
        </Knopf>
      </div>
    </Bereich>
  );
}

/** Anmeldung: Passwort oder OAuth 2.0 (#358), bei OAuth der Anbieter mit seinen Voreinstellungen. */
function anmeldungFelder(e: PostfachEingabe, setze: Setze) {
  return (
    <>
      <Feld beschriftung={t('werkbank.postfaecher.anmeldung')} hilfe="werkbank.postfaecher.oauth">
        <select
          id="pf-anmeldung"
          value={e.anmeldung ?? 'passwort'}
          onChange={(x) => {
            const anmeldung = x.target.value as 'passwort' | 'oauth';
            const vor = ANBIETER[e.anbieter ?? 'microsoft'].server;
            setze({
              anmeldung,
              ...(anmeldung === 'oauth' && vor && !e.server
                ? { server: vor, port: 993, verschluesselung: 'ssl' }
                : anmeldung === 'oauth' && e.verschluesselung === 'keine'
                  ? { verschluesselung: 'ssl', port: 993 }
                  : {}),
            });
          }}>
          <option value="passwort">{t('werkbank.postfaecher.passwort-oder-app-passwort')}</option>
          <option value="oauth">{t('werkbank.postfaecher.oauth-2-0-microsoft')}</option>
        </select>
      </Feld>
      {e.anmeldung === 'oauth' && (
        <Feld beschriftung={t('werkbank.postfaecher.anbieter')}>
          <select
            id="pf-anbieter"
            value={e.anbieter ?? 'microsoft'}
            onChange={(x) => {
              const anbieter = x.target.value as OAuthAnbieter;
              const vor = ANBIETER[anbieter].server;
              // Server nur vorbelegen, wenn er leer ist oder noch die Voreinstellung eines anderen Anbieters trägt.
              const ersetzen = vor && (!e.server || Object.values(ANBIETER).some((a) => a.server === e.server));
              setze({ anbieter, ...(ersetzen ? { server: vor, port: 993, verschluesselung: 'ssl' } : {}) });
            }}>
            {(Object.keys(ANBIETER) as OAuthAnbieter[]).map((a) => (
              <option key={a} value={a}>
                {ANBIETER[a].name}
              </option>
            ))}
          </select>
        </Feld>
      )}
    </>
  );
}
