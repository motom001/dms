/**
 * Mappentyp-Editor (#1640): „Darf an Dienste im Netz gehen“ und die Haken „… darf diesen Mappentyp sehen“ im Abschnitt
 * Pakete gehören zum Entwurf wie alle anderen Felder. Sie zählen als ungespeicherte Änderung, „Mappentyp speichern“
 * übernimmt sie (nach dem Mappentyp, über ihre eigenen Aufrufe), „Änderungen verwerfen“ nimmt sie zurück. Gespeichert
 * bleiben sie, wo sie hingehören: die Freigabe für Dienste im Netz in der Feinabstimmung (#1635, derselbe Stand wie
 * dort), „verwehrt“ je Paket am Mappentyp (#686).
 */
import { useEffect, useState } from 'react';
import type { KiUebersicht } from '../../../../shared/src/pakete';
import { sucheApi } from '../../api/suche';
import { werkbankApi, type PaketAmTyp } from '../../api/werkbank';

interface Stand {
  /** Darf an Dienste im Netz gehen. */
  netz: boolean;
  /** Pakete, denen der Mappentyp verwehrt ist. */
  verwehrt: string[];
}

const alsText = (s: Stand) => JSON.stringify({ netz: s.netz, verwehrt: [...s.verwehrt].sort() });

export function useTypNeben(typId: string | undefined, benutzer: boolean) {
  const [k, setK] = useState<KiUebersicht | null>(null);
  const [liste, setListe] = useState<PaketAmTyp[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [basis, setBasis] = useState<Stand>({ netz: false, verwehrt: [] });
  const [stand, setStand] = useState<Stand>(basis);
  useEffect(() => {
    if (benutzer) return;
    let weg = false;
    void Promise.all([sucheApi.kiTypen(), typId ? werkbankApi.paketeAmTyp(typId) : Promise.resolve(null)]).then(
      ([ki, pakete]) => {
        if (weg) return;
        // Neu: so, wie der Server einen neuen Mappentyp einordnet (alle Bereiche bzw. die bisherige Liste, #1635).
        const s = {
          netz: typId ? !!ki.typen.find((x) => x.id === typId)?.zugelassen : !!ki.alle,
          verwehrt: (pakete ?? []).filter((p) => p.verwehrt).map((p) => p.id),
        };
        setK(ki);
        setListe(pakete);
        setBasis(s);
        setStand(s);
      },
      (e: Error) => {
        if (!weg) setFehler(e.message);
      },
    );
    return () => {
      weg = true;
    };
  }, [typId, benutzer]);

  /** Nach dem Speichern des Mappentyps: nur Geändertes übernehmen. Wirft beim ersten Fehler. */
  async function speichern(id: string) {
    if (stand.netz !== basis.netz) setK(await sucheApi.setzeKiTyp(id, stand.netz));
    let neu = liste;
    for (const p of liste ?? []) {
      const v = stand.verwehrt.includes(p.id);
      if (v !== basis.verwehrt.includes(p.id)) neu = await werkbankApi.paketVerwehren(id, p.id, v);
    }
    setListe(neu);
    setBasis(stand);
  }

  return {
    k,
    liste,
    fehler,
    stand,
    /** Für den Vergleich „ungespeichert?“ im Editor. */
    basisText: alsText(basis),
    text: alsText(stand),
    setzeNetz: (netz: boolean) => setStand((s) => ({ ...s, netz })),
    setzePaket: (paket: string, darf: boolean) =>
      setStand((s) => ({ ...s, verwehrt: darf ? s.verwehrt.filter((x) => x !== paket) : [...s.verwehrt, paket] })),
    zuruecksetzen: () => setStand(basis),
    speichern,
  };
}
export type TypNeben = ReturnType<typeof useTypNeben>;
