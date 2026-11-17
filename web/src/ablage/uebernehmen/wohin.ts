import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Dokument, type Mappentyp } from '../../../../shared/src/model';
import { nurHauptdokumente } from '../../../../shared/src/anlagen';
import { istTeiltyp } from '../../../../shared/src/teile';
import { mappenApi, type Bezuege, type MappeDetails } from '../../api/mappen';
import { useDaten } from '../../daten';
import type { MappenVorschlag, Ziel } from '../WohinGehoert';
import { DOKS_MAX } from './hilfen';

/** „Wohin gehört das?“ (#1217): Neue Mappe · Vorhandene Mappe · Nur erledigen – mit der gewählten vorhandenen Mappe. */
export function useWohin(details: MappeDetails, post: boolean, erkennKey: string) {
  const d = useDaten();
  const m = details.mappe;
  const [ziel, setZiel] = useState<Ziel>('neu');
  const [vorhandenId, setVorhandenId] = useState('');
  const [bekannt, setBekannt] = useState<Bezuege>({});
  const merke = useCallback((id: string, b: { titel: string; typId: string }) => setBekannt((x) => ({ ...x, [id]: b })), []);
  // Vorhandene Mappen aller Typen, in die die Dokumente passen – ohne Post, Systemtypen und Teile.
  const mappenZiele = useMemo(
    () =>
      d.typen.filter((x) => !x.system && !istTeiltyp(x) && (!details.dokumente.length || x.register.some((r) => r.art === 'dokumente'))),
    [d.typen, details.dokumente.length],
  );
  const mappenVorschlaege = useMappenVorschlaege(post ? erkennKey : '', mappenZiele, m.id);
  const vorhandenZiel =
    vorhandenId && bekannt[vorhandenId] ? { id: vorhandenId, typId: bekannt[vorhandenId].typId, titel: bekannt[vorhandenId].titel } : null;
  /** „Stattdessen dorthin legen“ (#938): wählt „Vorhandene Mappe“ mit dieser Mappe – gelegt wird erst mit dem Hauptknopf. */
  const dorthin = (x: { id: string; typId: string; titel: string }) => {
    merke(x.id, x);
    setVorhandenId(x.id);
    setZiel('vorhanden');
  };
  return { ziel, setZiel, vorhandenId, setVorhandenId, bekannt, merke, mappenZiele, mappenVorschlaege, vorhandenZiel, dorthin };
}

/**
 * Wiedergefundene Mappen für „Vorhandene Mappe“ (#1217): derselbe Abgleich, den das automatische Zuordnen nutzt (Absender,
 * Vertrags- oder Kundennummer im Brief) – die besten drei in Typen, in die die Dokumente passen, ohne eigene Organisation
 * und Personen des Haushalts. null: lädt noch.
 */
function useMappenVorschlaege(erkennKey: string, ziele: Mappentyp[], postId: string): MappenVorschlag[] | null {
  const [liste, setListe] = useState<MappenVorschlag[] | null>(null);
  const zieleKey = ziele.map((x) => x.id).join(',');
  useEffect(() => {
    if (!erkennKey) {
      setListe([]);
      return;
    }
    let aktuell = true;
    setListe(null);
    const erlaubt = new Set(zieleKey.split(','));
    mappenApi.abgleich({ dokumente: erkennKey.split(',') }).then(
      (r) => {
        if (!aktuell) return;
        const eigene = new Set(r.eigene ?? []);
        setListe(
          r.treffer
            .filter((x) => x.mappeId !== postId && erlaubt.has(x.typId) && !eigene.has(x.mappeId))
            .slice(0, 3)
            .map((x) => ({ id: x.mappeId, typId: x.typId, titel: r.bezuege[x.mappeId]?.titel ?? '' })),
        );
      },
      () => aktuell && setListe([]),
    );
    return () => {
      aktuell = false;
    };
  }, [erkennKey, zieleKey, postId]);
  return liste;
}

/** „Passt eher zu …“ je Folgedokument: ein anderer Typ (Name im Text) oder eine andere wiedergefundene Mappe. */
export type Folge = Record<string, { typId?: string; mappe?: { id: string; typId: string; titel: string } }>;

/**
 * „Passt eher zu …“: Folgedokumente, deren Name im Text (Überschrift) zu einem anderen Typ passt oder deren beste
 * wiedergefundene Mappe eine andere ist als beim ersten Dokument.
 */
export function useFolge(post: boolean, doks: Dokument[], dokKey: string, zielId: string | null, ziele: Mappentyp[]) {
  const [folge, setFolge] = useState<Folge>({});
  useEffect(() => {
    if (!post || doks.length < 2) {
      setFolge({});
      return;
    }
    let aktuell = true;
    const mitT = nurHauptdokumente(doks)
      .filter((x) => x.ocr?.stand === 'fertig')
      .slice(0, DOKS_MAX);
    void Promise.allSettled(mitT.map((x) => mappenApi.abgleich({ dokumente: [x.id] }))).then((rs) => {
      if (!aktuell) return;
      const je = new Map(mitT.map((x, i) => [x.id, rs[i].status === 'fulfilled' ? rs[i].value : null]));
      const erster = je.get(doks[0].id);
      const besterVon = (r: typeof erster) => r?.treffer.find((x) => !x.unsicher);
      const e1 = besterVon(erster);
      const n: typeof folge = {};
      for (const x of doks.slice(1)) {
        if (x.anlageZu) continue;
        const r = je.get(x.id);
        if (!r) continue;
        const typId = r.typ?.typId && r.typ.typId !== zielId && ziele.some((z) => z.id === r.typ!.typId) ? r.typ.typId : undefined;
        const b = besterVon(r);
        const mappe =
          b && e1 && b.mappeId !== e1.mappeId ? { id: b.mappeId, typId: b.typId, titel: r.bezuege[b.mappeId]?.titel ?? '' } : undefined;
        if (typId || mappe) n[x.id] = { typId, mappe };
      }
      setFolge(n);
    });
    return () => {
      aktuell = false;
    };
  }, [post, dokKey, zielId]); // eslint-disable-line react-hooks/exhaustive-deps -- Folge nur bei anderer Post, anderen Dokumenten oder anderem Ziel neu bestimmen
  return folge;
}

/** Post: Zähler „Post 1 von N“ – die Reihe in „Neue Post“ und die Stelle dieser Post darin. */
export function useReihe(post: boolean, postId: string) {
  const d = useDaten();
  const np = d.zaehler.neuePost;
  const [reihe, setReihe] = useState<string[] | null>(null);
  useEffect(() => {
    if (!post || !np) return;
    let aktuell = true;
    mappenApi.seite(np, 0, 200).then(
      (s) => aktuell && setReihe(s.mappen.filter((x) => !x.verborgen).map((x) => x.id)),
      () => {},
    );
    return () => {
      aktuell = false;
    };
  }, [post, np, d.stand]);
  return { reihe, np, pos: reihe ? reihe.indexOf(postId) : -1 };
}
