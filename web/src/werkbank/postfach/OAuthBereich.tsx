import { Symbol } from '../../Symbol';
import { t, tn } from '../../sprache';
import type { OAuthStatus } from '../../api/betrieb';
import { eingaengeApi, type OAuthAnbieter, type PostfachAnsicht } from '../../api/eingaenge';
import { Link } from '../../ort';
import { Speicherleiste } from '../../Speicherleiste';
import { Hilfe } from '../../Hilfe';
import { Feld, Knopf } from '../../bausteine';
import { ANBIETER, rueckrufOk, zeit, type Meldung } from './hilfen';
import { anmeldeAktionen, useGeraetecode, useOAuthApp } from './oauth-zustand';
import type { PostfachZustand } from './zustand';

type App = ReturnType<typeof useOAuthApp>;

/** Was angemeldet wird: ein Postfach (#358) oder der E-Mail-Versand (#813). */
export interface OAuthZiel {
  oauth: OAuthStatus | null | undefined;
  start(): Promise<{ url: string }>;
  geraet(): Promise<{ code: string; adresse: string; bis: string; intervall: number }>;
  geraetPruefen(): Promise<{ fertig: boolean; text: string }>;
  abmelden(): Promise<void>;
  neuLaden(): Promise<void>;
}

export function postfachZiel(p: PostfachAnsicht, z: PostfachZustand): OAuthZiel {
  return {
    oauth: p.oauth,
    start: () => eingaengeApi.postfachOAuthStart(p.id),
    geraet: () => eingaengeApi.postfachOAuthGeraet(p.id),
    geraetPruefen: () => eingaengeApi.postfachOAuthGeraetPruefen(p.id),
    abmelden: async () => {
      z.setListe(await eingaengeApi.postfachOAuthAbmelden(p.id));
    },
    neuLaden: z.laden,
  };
}

/**
 * OAuth 2.0 (#358): App-Registrierung des Anbieters (je Installation) und Anmeldung des Postfachs –
 * im Browser (Autorisierungscode mit PKCE) oder mit Gerätecode. Token sieht die Oberfläche nie.
 * Seit #813 auch für den E-Mail-Versand (`versand`): dieselbe App, eigene Anmeldung.
 */
export function OAuthBereich({
  anbieter,
  ziel,
  geaendert,
  setMeldung,
  versand = false,
  eingebettet = false,
}: {
  anbieter: OAuthAnbieter;
  ziel?: OAuthZiel;
  geaendert: boolean;
  setMeldung: (m: Meldung | undefined) => void;
  versand?: boolean;
  eingebettet?: boolean;
}) {
  const x = useOAuthApp(anbieter, setMeldung);
  useGeraetecode(ziel, x, setMeldung, versand);
  const a = anmeldeAktionen(ziel, x.setGeraet, setMeldung);
  const inhalt = (
    <>
      {versand && (
        <p className="leise klein">
          {anbieter === 'microsoft' ? t('werkbank.mail.oauth.app.microsoft') : t('werkbank.mail.oauth.app.google')}
        </p>
      )}
      {anbieter === 'google' && (
        <div className="hinweis">
          <p>
            {tn('werkbank.postfaecher.dann-ist-ein-einfacher', {
              b: <strong>{t('werkbank.postfaecher.privates-gmail-konto')}</strong>,
              b2: <strong>{t('werkbank.postfaecher.app-passwort')}</strong>,
            })}
          </p>
        </div>
      )}
      {appFormular(x, anbieter, versand)}

      <h3 className="h4">{versand ? t('werkbank.mail.oauth.anmelden') : t('werkbank.postfaecher.postfach-anmelden')}</h3>
      {!ziel || geaendert ? (
        <p className="leise">{versand ? t('werkbank.mail.oauth.erst-speichern') : t('werkbank.postfaecher.erst-das-postfach-speichern')}</p>
      ) : (
        anmeldung(x, a, { anbieter, ziel: ziel!, versand })
      )}
    </>
  );
  // Im Postfach-Editor (#1000) steht der Inhalt in seinem Bereich, der Titel und Hilfe trägt.
  if (eingebettet) return inhalt;
  return (
    <div className="blatt">
      <h2 className="h3">
        {t('werkbank.postfaecher.anmeldung-per-oauth-2')} <Hilfe ort="werkbank.postfaecher.oauth" />
      </h2>
      {inhalt}
    </div>
  );
}

/** App beim Anbieter (#370): Client-ID, Geheimnis, Mandant bzw. Endpunkte, Umleitungs-URI; eigenes Speichern. */
function appFormular(x: App, anbieter: OAuthAnbieter, versand: boolean) {
  const { app, setApp, stand, appEnt, sendet, appSpeichern } = x;
  const gespeichert = stand?.apps[anbieter];
  return (
    <form
      onSubmit={(x) => {
        x.preventDefault();
        void appSpeichern();
      }}
      onKeyDown={appEnt.tasten}>
      <h3 className="h4">
        {tn('werkbank.postfaecher.app-beim-anbieter', {
          klein: (
            <small className="leise">
              {versand ? t('werkbank.mail.oauth.app.gilt') : t('werkbank.postfaecher.gilt-fuer-alle-postfaecher')}
            </small>
          ),
        })}
      </h3>
      <div className="raster">
        <Feld beschriftung={t('werkbank.postfaecher.client-id')} hinweis={t('werkbank.postfaecher.anwendungs-id')}>
          <input
            id="pf-oauth-client"
            value={app.clientId}
            autoComplete="off"
            onChange={(x) => setApp({ ...app, clientId: x.target.value })}
          />
        </Feld>
        <Feld
          beschriftung={t('werkbank.postfaecher.client-geheimnis')}
          hinweis={
            gespeichert?.secretGesetzt
              ? t('werkbank.postfaecher.gespeichert-leer-lassen-um')
              : t('werkbank.postfaecher.wird-verschluesselt-gespeichert-leer')
          }>
          <input
            id="pf-oauth-geheimnis"
            type="password"
            autoComplete="new-password"
            value={app.clientSecret ?? ''}
            onChange={(x) => setApp({ ...app, clientSecret: x.target.value })}
          />
        </Feld>
        {anbieter === 'microsoft' && (
          <Feld beschriftung={t('werkbank.postfaecher.mandant-tenant')} hinweis={t('werkbank.postfaecher.common-consumers-nur-outlook')}>
            <input id="pf-oauth-tenant" value={app.tenant ?? ''} onChange={(x) => setApp({ ...app, tenant: x.target.value.trim() })} />
          </Feld>
        )}
        {anbieter === 'andere' && (
          <>
            <Feld beschriftung={t('werkbank.postfaecher.autorisierungs-endpunkt')}>
              <input
                id="pf-oauth-autorisierung"
                value={app.autorisierung ?? ''}
                placeholder="https://…/authorize"
                onChange={(x) => setApp({ ...app, autorisierung: x.target.value.trim() })}
              />
            </Feld>
            <Feld beschriftung={t('werkbank.postfaecher.token-endpunkt')}>
              <input
                id="pf-oauth-token"
                value={app.token ?? ''}
                placeholder="https://…/token"
                onChange={(x) => setApp({ ...app, token: x.target.value.trim() })}
              />
            </Feld>
            <Feld beschriftung={t('werkbank.postfaecher.geraetecode-endpunkt')} optional>
              <input id="pf-oauth-geraet" value={app.geraet ?? ''} onChange={(x) => setApp({ ...app, geraet: x.target.value.trim() })} />
            </Feld>
            <Feld beschriftung={t('werkbank.postfaecher.bereich-scope')} hinweis={t('werkbank.postfaecher.mit-leerzeichen-getrennt-meist')}>
              <input id="pf-oauth-bereich" value={app.bereich ?? ''} onChange={(x) => setApp({ ...app, bereich: x.target.value })} />
            </Feld>
          </>
        )}
      </div>
      <p className="leise klein">
        {t('werkbank.postfaecher.umleitungs-uri-fuer-die')}{' '}
        {stand?.rueckruf ? (
          <>
            <code>{stand.rueckruf}</code>
            {!rueckrufOk(stand.rueckruf) && t('werkbank.postfaecher.ohne-https-geht-die')}
          </>
        ) : (
          <>
            {tn('werkbank.postfaecher.erst-nach-eintrag-der', {
              link: (
                <Link to="/werkbank/betrieb" className="verweis">
                  {t('werkbank.postfaecher.e-mail-und-adresse')}
                </Link>
              ),
              wert: ANBIETER[anbieter].geraet ? t('werkbank.postfaecher.oder-mit-geraetecode-anmelden') : '',
            })}
          </>
        )}
      </p>
      <Speicherleiste ent={appEnt} gegenstand={t('werkbank.postfaecher.app')} sendet={sendet} />
    </form>
  );
}

/** Zustand der Anmeldung, Gerätecode und die Knöpfe zum An- und Abmelden. */
function anmeldung(
  x: App,
  a: ReturnType<typeof anmeldeAktionen>,
  { anbieter, ziel, versand }: { anbieter: OAuthAnbieter; ziel: OAuthZiel; versand: boolean },
) {
  const { stand, appEnt, geraet } = x;
  const gespeichert = stand?.apps[anbieter];
  const { imBrowser, mitGeraetecode, abmelden } = a;
  const o = ziel?.oauth;
  return (
    <>
      {anmeldeZustand(o)}
      {geraet && (
        <div className="hinweis info" role="status">
          <p>
            {tn('werkbank.postfaecher.oeffne-auf-einem-beliebigen', {
              link: (
                <a href={geraet.adresse} target="_blank" rel="noreferrer noopener" className="verweis">
                  {geraet.adresse} <Symbol name="extern" />
                </a>
              ),
              b: <strong className="mono">{geraet.code}</strong>,
              zeit: zeit(geraet.bis),
            })}
          </p>
        </div>
      )}
      <div className="knoepfe">
        <Knopf
          art="haupt"
          gesperrt={
            !gespeichert?.clientId ||
            (!stand?.rueckruf
              ? t('werkbank.postfaecher.ohne-adresse-von-ablago')
              : !rueckrufOk(stand.rueckruf)
                ? t('werkbank.postfaecher.nur-mit-https-adresse')
                : appEnt.geaendert
                  ? t('werkbank.postfaecher.erst-die-app-speichern')
                  : false)
          }
          onClick={() => void imBrowser()}>
          {t('werkbank.postfaecher.im-browser-anmelden')}
        </Knopf>
        {ANBIETER[anbieter].geraet && (
          <Knopf gesperrt={!gespeichert?.clientId || !!geraet || appEnt.geaendert} onClick={() => void mitGeraetecode()}>
            {t('werkbank.postfaecher.mit-geraetecode-anmelden')}
          </Knopf>
        )}
        {o && o.zustand !== 'abgemeldet' && (
          <Knopf
            art="gefahr"
            symbol="abmelden"
            onClick={() => void abmelden()}
            rueckfrage={{
              titel: t('werkbank.postfaecher.anmeldung-entfernen'),
              text: versand ? t('werkbank.mail.oauth.abmelden.text') : t('werkbank.postfaecher.ablago-loescht-die-gespeicherten'),
              ja: t('werkbank.postfaecher.abmelden'),
            }}>
            {t('werkbank.postfaecher.abmelden')}
          </Knopf>
        )}
      </div>
    </>
  );
}

/** Zustand der Anmeldung: angemeldet am, abgelaufen oder nicht angemeldet, dazu der Grund. */
function anmeldeZustand(o: OAuthStatus | null | undefined) {
  const zeitpunkt = (iso: string | null) => (iso ? zeit(iso) : '–');
  return (
    <dl className="eigenschaften">
      <dt>{t('werkbank.postfaecher.zustand')}</dt>
      <dd>
        {o?.zustand === 'ok' ? (
          t('werkbank.postfaecher.angemeldet-am', {
            zeitpunkt: zeitpunkt(o.angemeldetAm),
            wert: o.von ? t('werkbank.postfaecher.von', { von: o.von }) : '',
          })
        ) : o?.zustand === 'abgelaufen' ? (
          <strong>{t('werkbank.postfaecher.abgelaufen-oder-entzogen-bitte')}</strong>
        ) : (
          t('werkbank.postfaecher.nicht-angemeldet')
        )}
      </dd>
      {o?.fehler && (
        <>
          <dt>{t('werkbank.postfaecher.grund')}</dt>
          <dd>{o.fehler}</dd>
        </>
      )}
    </dl>
  );
}
