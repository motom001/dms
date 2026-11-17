import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { betriebApi, type WerkbankUebersicht } from '../../api/betrieb';
import { useVerwaltetVerschluesselung } from '../Sicherung';
import { ordneMeldungen, type Akzeptiert } from '../../../../shared/src/meldungen';
import { hinweiseAus, type Hinweis } from './hinweise';

/**
 * Werkbank → Übersicht (#68): was zu tun ist, auf einen Blick; Gruppen der Leiste.
 * Seit #816: oben die Kacheln, darunter die Meldungen nach Schwere (rot → gelb → Hinweis); gelbe Warnungen und
 * Hinweise lassen sich bewusst akzeptieren und stehen dann eingeklappt ganz unten.
 */
export function useUebersicht() {
  const [stand, setStand] = useState<WerkbankUebersicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [akzeptiert, setAkzeptiert] = useState<Akzeptiert>({});
  const laden = useCallback(async () => {
    try {
      const s = await betriebApi.uebersicht();
      setStand(s);
      setAkzeptiert(s.akzeptiert ?? {});
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void laden();
  }, [laden]);
  const mitNotfallblatt = useVerwaltetVerschluesselung();
  const geordnet = useMemo(
    () => (stand ? ordneMeldungen(hinweiseAus(stand, mitNotfallblatt), akzeptiert) : null),
    [stand, akzeptiert, mitNotfallblatt],
  );
  // Behoben oder schwerer geworden (#816): Die Akzeptanz gilt nicht mehr – einmal je Stand an den Server melden.
  const gemeldet = useRef<WerkbankUebersicht | null>(null);
  useEffect(() => {
    if (!stand || !geordnet?.aufheben.length || gemeldet.current === stand) return;
    gemeldet.current = stand;
    for (const anlass of ['erledigt', 'schwerer'] as const) {
      const liste = geordnet.aufheben.filter((x) => x.anlass === anlass).map((x) => x.schluessel);
      if (liste.length)
        betriebApi
          .akzeptanzAufheben(liste, anlass)
          .then(setAkzeptiert)
          .catch(() => {});
    }
  }, [stand, geordnet]);
  const akzeptieren = useCallback(
    async (h: Hinweis, grund: string) => setAkzeptiert(await betriebApi.meldungAkzeptieren(h.schluessel, h.art, grund.trim() || undefined)),
    [],
  );
  const einblenden = useCallback(
    async (schluessel: string) => setAkzeptiert(await betriebApi.akzeptanzAufheben([schluessel], 'eingeblendet')),
    [],
  );
  // „Nein, danke“ bzw. „Gelesen“ (#821, #815): Der Hinweis kommt danach nicht wieder.
  const erledigen = useCallback(
    async (schluessel: string) => {
      await betriebApi.meldungErledigt(schluessel);
      await laden();
    },
    [laden],
  );
  // Zahl in der Leiste: offene Warnungen und rote Meldungen, ohne Hinweise und ohne bewusst akzeptierte.
  const hinweise = geordnet ? geordnet.offen.filter((h) => h.art !== 'info').length : 0;
  return { stand, fehler, laden, hinweise, geordnet, akzeptieren, einblenden, erledigen };
}
export type UebersichtZustand = ReturnType<typeof useUebersicht>;
