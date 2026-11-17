import { useCallback, useEffect, useState } from 'react';
import { t } from '../../sprache';
import { eingaengeApi, type PostfachAnsicht } from '../../api/eingaenge';
import { RUECKRUF_FEHLER, type Meldung } from './hilfen';

/** Meldung aus der Rückkehr vom Anbieter (?oauth=angemeldet bzw. ?oauthfehler=<Code>) – einmal zeigen, dann aus der Adresse nehmen. */
export function useRueckkehr(gut = t('werkbank.postfaecher.beim-anbieter-angemeldet-mit')): Meldung | undefined {
  const [m] = useState<Meldung | undefined>(() => {
    const q = new URLSearchParams(location.search);
    const f = q.get('oauthfehler');
    if (f)
      return {
        art: 'schlecht',
        text: t('werkbank.postfaecher.anmeldung-beim-anbieter', {
          wert: RUECKRUF_FEHLER[f] ?? t('werkbank.postfaecher.einzelheiten-stehen-im-protokoll'),
        }),
      };
    if (q.get('oauth') === 'angemeldet') return { art: 'gut', text: gut };
    return undefined;
  });
  useEffect(() => {
    if (m) history.replaceState(null, '', location.pathname);
  }, [m]);
  return m;
}

export function usePostfaecher(offen: boolean) {
  const [liste, setListe] = useState<PostfachAnsicht[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setListe(await eingaengeApi.postfaecher());
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (offen) void laden();
  }, [offen, laden]);
  useEffect(() => {
    if (!offen) return;
    const timer = setInterval(() => void laden(), 30_000);
    return () => clearInterval(timer);
  }, [offen, laden]);
  return { liste, fehler, laden, setListe };
}
export type PostfachZustand = ReturnType<typeof usePostfaecher>;
