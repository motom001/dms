import { useEffect, useState } from 'react';
import { t } from '../../sprache';
import { eingaengeApi, type OAuthAnbieter, type OAuthAppEingabe, type OAuthAppsStand } from '../../api/eingaenge';
import { useEntwurf } from '../../Speicherleiste';
import type { Meldung } from './hilfen';
import type { OAuthStatus } from '../../api/betrieb';

/** Was angemeldet wird: ein Postfach (#358) oder der E-Mail-Versand (#813). */
export interface OAuthZiel {
  oauth: OAuthStatus | null | undefined;
  start(): Promise<{ url: string }>;
  geraet(): Promise<{ code: string; adresse: string; bis: string; intervall: number }>;
  geraetPruefen(): Promise<{ fertig: boolean; text: string }>;
  abmelden(): Promise<void>;
  neuLaden(): Promise<void>;
}

export type Geraetecode = { code: string; adresse: string; bis: string; intervall: number };

/** App beim Anbieter (#370): gespeicherter Stand, Entwurf mit eigener Speicherleiste, Speichern. */
export function useOAuthApp(anbieter: OAuthAnbieter, setMeldung: (m: Meldung | undefined) => void) {
  const [stand, setStand] = useState<OAuthAppsStand>();
  const appAus = (st: OAuthAppsStand | undefined): OAuthAppEingabe => {
    const a = st?.apps[anbieter];
    return {
      clientId: a?.clientId ?? '',
      clientSecret: '',
      tenant: a?.tenant ?? (anbieter === 'microsoft' ? 'common' : ''),
      autorisierung: a?.autorisierung ?? '',
      token: a?.token ?? '',
      geraet: a?.geraet ?? '',
      bereich: a?.bereich ?? '',
    };
  };
  const appGespeichert = appAus(stand);
  const [app, setApp] = useState<OAuthAppEingabe>(appGespeichert);
  const [sendet, setSendet] = useState(false);
  // App-Registrierung (#370): eigenes Formular mit Speicherleiste; gilt für alle Postfächer dieses Anbieters.
  const appEnt = useEntwurf(appGespeichert, app, { neu: !stand?.apps[anbieter], aus: !stand, zuruecksetzen: () => setApp(appGespeichert) });
  const [geraet, setGeraet] = useState<Geraetecode>();
  useEffect(() => {
    void eingaengeApi
      .postfachOAuthApps()
      .then((st) => {
        setStand(st);
        setApp(appAus(st));
      })
      .catch((x) => setMeldung({ art: 'schlecht', text: (x as Error).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appAus hängt nur am Anbieter
  }, [anbieter, setMeldung]);
  async function appSpeichern() {
    setSendet(true);
    try {
      const st = await eingaengeApi.postfachOAuthApp(anbieter, app);
      setStand(st);
      setApp(appAus(st));
      setMeldung({ art: 'gut', text: t('werkbank.postfaecher.app-gespeichert') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally {
      setSendet(false);
    }
  }
  return { stand, app, setApp, sendet, appEnt, geraet, setGeraet, appSpeichern };
}

/** Gerätecode: im angegebenen Abstand nachfragen, bis angemeldet, abgelehnt oder abgelaufen. */
export function useGeraetecode(
  ziel: OAuthZiel | undefined,
  { geraet, setGeraet }: { geraet: Geraetecode | undefined; setGeraet: (g: Geraetecode | undefined) => void },
  setMeldung: (m: Meldung | undefined) => void,
  versand: boolean,
) {
  const neuLaden = ziel?.neuLaden;
  const geraetPruefen = ziel?.geraetPruefen;
  useEffect(() => {
    if (!geraet || !geraetPruefen) return;
    let aus = false;
    const uhr = setInterval(
      () => {
        if (aus) return;
        if (Date.parse(geraet.bis) < Date.now()) {
          setGeraet(undefined);
          setMeldung({ art: 'schlecht', text: t('werkbank.postfaecher.der-geraetecode-ist-abgelaufen') });
          return;
        }
        void geraetPruefen()
          .then(async (r) => {
            if (r.fertig && !aus) {
              aus = true;
              setGeraet(undefined);
              setMeldung({
                art: 'gut',
                text: versand ? t('werkbank.mail.oauth.angemeldet') : t('werkbank.postfaecher.beim-anbieter-angemeldet-mit'),
              });
              await neuLaden?.();
            }
          })
          .catch((x) => {
            aus = true;
            setGeraet(undefined);
            setMeldung({ art: 'schlecht', text: (x as Error).message });
          });
      },
      Math.max(geraet.intervall, 2) * 1000,
    );
    return () => {
      aus = true;
      clearInterval(uhr);
    };
  }, [geraet, geraetPruefen, setMeldung, neuLaden, versand, setGeraet]);
}

/** Im Browser anmelden, mit Gerätecode anmelden, abmelden. */
export function anmeldeAktionen(
  ziel: OAuthZiel | undefined,
  setGeraet: (g: Geraetecode | undefined) => void,
  setMeldung: (m: Meldung | undefined) => void,
) {
  async function imBrowser() {
    if (!ziel) return;
    try {
      const { url } = await ziel.start();
      if (!/^https?:\/\//.test(url)) throw new Error(t('werkbank.postfaecher.unerwartete-adresse-des-anbieters'));
      location.assign(url);
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  async function mitGeraetecode() {
    if (!ziel) return;
    try {
      setGeraet(await ziel.geraet());
      setMeldung(undefined);
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  async function abmelden() {
    if (!ziel) return;
    try {
      await ziel.abmelden();
      setMeldung({ art: 'gut', text: t('werkbank.postfaecher.abgemeldet') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  return { imBrowser, mitGeraetecode, abmelden };
}
