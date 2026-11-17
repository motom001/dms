import { useEffect, useState } from 'react';
import type { Mappe, Mappentyp, Werte } from '../../../../shared/src/model';
import { mappenApi, type Bezuege } from '../../api/mappen';
import { t } from '../../sprache';

/** Zuletzt geöffnet (#940, #1036): bei mehreren Zieltypen stehen diese Mappen in ihrer Gruppe oben. */
export function useZuletzt(mehrere: boolean, offen: boolean) {
  const [zuletzt, setZuletzt] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    if (!mehrere || !offen || zuletzt) return;
    let aktuell = true;
    mappenApi.zuletztGeoeffnet().then(
      (l) => aktuell && setZuletzt(new Map(l.map((x, i) => [x.id, i]))),
      () => aktuell && setZuletzt(new Map()),
    );
    return () => {
      aktuell = false;
    };
  }, [mehrere, offen, zuletzt]);
  return zuletzt;
}

/** Titel unbekannter Verweise nachladen (z. B. vorbelegt über ?verweis=…). */
export function useFehlendeTitel(gewaehlt: string[], bekannt: Bezuege, merke: (id: string, b: { titel: string; typId: string }) => void) {
  const fehlend = gewaehlt.filter((x) => !bekannt[x]).join(',');
  useEffect(() => {
    for (const x of fehlend ? fehlend.split(',') : []) {
      mappenApi
        .mappe(x)
        .then((r) => merke(x, { titel: r.mappe.titel ?? '', typId: r.mappe.typId }))
        .catch(() => merke(x, { titel: t('ablage.mappeformular.geloeschte-mappe'), typId: '' }));
    }
  }, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste der fehlenden Mappen ändert
}

/** Woher die Vorschläge kommen: Sicht des Felds, Seite des Zieltyps, je Typ eine Seite oder eine eigene Quelle. */
export interface TrefferQuelle {
  offen: boolean;
  eingabe: string;
  ziel: Mappentyp;
  sicht?: string;
  eigeneText: string;
  quelle?: (suche: string) => Promise<{ mappen: Array<Pick<Mappe, 'id' | 'titel' | 'typId'>>; gesamt: number }>;
  mehrere: boolean;
  alleIds: string;
}

/** Vorschläge zur Eingabe, kurz verzögert; null, solange noch nichts geladen ist. */
export function useTreffer({ offen, eingabe, ziel, sicht, eigeneText, quelle, mehrere, alleIds }: TrefferQuelle) {
  const [treffer, setTreffer] = useState<Mappe[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    const timer = setTimeout(() => {
      const eigen = eigeneText ? (JSON.parse(eigeneText) as Werte) : undefined;
      // Mehrere Zieltypen ohne Feld-Auswahl (#1036, z. B. erweiterte Suche): je Typ eine Seite, zusammen.
      const jeTyp = () =>
        Promise.all(alleIds.split(',').map((x) => mappenApi.seite(`typ:${x}`, 0, 15, eingabe.trim(), { eigene: eigen }))).then((l) => ({
          mappen: l.flatMap((x) => x.mappen),
          gesamt: l.reduce((n, x) => n + x.gesamt, 0),
        }));
      (quelle
        ? (quelle(eingabe.trim()) as Promise<{ mappen: Mappe[]; gesamt: number }>)
        : !sicht && mehrere
          ? jeTyp()
          : mappenApi.seite(sicht ?? `typ:${ziel.id}`, 0, mehrere ? 30 : 20, eingabe.trim(), { eigene: eigen })
      )
        .then((s) => {
          if (aktuell) {
            setTreffer(s.mappen);
            setGesamt(s.gesamt);
          }
        })
        .catch(() => aktuell && setTreffer([]));
    }, 200);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [offen, eingabe, ziel.id, sicht, eigeneText, quelle, mehrere, alleIds]);
  return { treffer, gesamt };
}

/** Passen die gewählten Mappen noch zu den Werten dieser Mappe (#173, #886)? Mit Grund (#887), schon vor dem Speichern. */
export function useLivePruefung(
  {
    pruefen,
    sicht,
    unpassend,
    gruende,
  }: { pruefen?: { typId: string; feldKey: string }; sicht?: string; unpassend?: string[]; gruende?: Record<string, string[]> },
  gewaehltText: string,
  eigeneText: string,
) {
  const [live, setLive] = useState<{ unpassend: string[]; gruende: Record<string, string[]> } | null>(null);
  const pruefTyp = pruefen?.typId ?? (sicht?.startsWith('feld:') ? sicht.split(':')[1] : undefined);
  const pruefFeld = pruefen?.feldKey ?? (sicht?.startsWith('feld:') ? sicht.split(':')[2] : undefined);
  useEffect(() => {
    if (!pruefTyp || !pruefFeld || !gewaehltText) {
      setLive(null);
      return;
    }
    let aktuell = true;
    const timer = setTimeout(() => {
      mappenApi
        .auswahlPruefen(pruefTyp, pruefFeld, gewaehltText.split(','), eigeneText ? (JSON.parse(eigeneText) as Werte) : {})
        .then((r) => aktuell && setLive({ unpassend: r.unpassend, gruende: r.gruende ?? {} }))
        .catch(() => {});
    }, 300);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [pruefTyp, pruefFeld, gewaehltText, eigeneText]);
  // Ohne Antwort (noch) die Angaben vom Server.
  return { unpassend: live?.unpassend ?? unpassend ?? [], gruende: live?.gruende ?? gruende ?? {} };
}

/** „… angelegt“ nach dem Fenster „+ … anlegen“ (#935): verschwindet nach sechs Sekunden. */
export function useAngelegt() {
  const [angelegt, setAngelegt] = useState<string>();
  useEffect(() => {
    if (!angelegt) return;
    const z = window.setTimeout(() => setAngelegt(undefined), 6000);
    return () => window.clearTimeout(z);
  }, [angelegt]);
  return [angelegt, setAngelegt] as const;
}
