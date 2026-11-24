import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { betriebApi, type WerkbankUebersicht } from '../../api/betrieb';
import { useVerwaltetVerschluesselung } from '../Sicherung';
import { ordneMeldungen, type Akzeptiert } from '../../../../shared/src/meldungen';
import { hinweiseAus, type Hinweis } from './hinweise';

/**
 * Werkbank → Übersicht (#68): was zu tun ist, auf einen Blick; Gruppen der Leiste.
 * Seit #816: oben die Kacheln, darunter die Meldungen nach Schwere (rot → gelb → Hinweis); gelbe Warnungen und
 * Hinweise lassen sich bewusst akzeptieren und stehen dann eingeklappt ganz unten.
 * Seit #1513 lädt die Übersicht ihre Hinweise selbst neu, sobald man zu ihr zurückkommt (`offen` wird wahr, z. B. nach
 * „E-Mail einrichten“) oder den Tab bzw. das Fenster wieder nach vorn holt – erledigte Hinweise verschwinden ohne „Neu laden“.
 */
export function useUebersicht(offen = true) {
  const [stand, setStand] = useState<WerkbankUebersicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [akzeptiert, setAkzeptiert] = useState<Akzeptiert>({});
  // Eben zur Kenntnis genommen (#1587): einige Sekunden „Rückgängig“.
  const [zuletzt, setZuletzt] = useState<Pick<Hinweis, 'schluessel' | 'art'> | null>(null);
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
  useNeuBeiRueckkehr(offen, laden);
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
  return { stand, fehler, laden, hinweise, geordnet, akzeptieren, einblenden, erledigen, zuletzt, setZuletzt };
}
export type UebersichtZustand = ReturnType<typeof useUebersicht>;

/**
 * #1513: neu laden, wenn die Übersicht wieder offen ist oder Tab bzw. Fenster wieder vorn sind. Fokus und Sichtbarkeit
 * kommen beim Wechsel des Tabs oft zusammen – dafür höchstens einmal je Sekunde.
 */
function useNeuBeiRueckkehr(offen: boolean, laden: () => Promise<void>) {
  const vorher = useRef(offen);
  const zuletzt = useRef(0);
  useEffect(() => {
    if (offen && !vorher.current) void laden();
    vorher.current = offen;
    if (!offen) return;
    const sichtbar = () => {
      if (document.visibilityState !== 'visible' || Date.now() - zuletzt.current < 1000) return;
      zuletzt.current = Date.now();
      void laden();
    };
    addEventListener('focus', sichtbar);
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      removeEventListener('focus', sichtbar);
      document.removeEventListener('visibilitychange', sichtbar);
    };
  }, [offen, laden]);
}
