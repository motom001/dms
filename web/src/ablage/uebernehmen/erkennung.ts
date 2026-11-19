import { useEffect, useMemo, useState } from 'react';
import type { Abgleich } from '../../../../shared/src/erkennung';
import type { Klassifizierung } from '../../../../shared/src/klassifizierung';
import { type Dokument, type Mappentyp, type Werte } from '../../../../shared/src/model';
import { kannSchwaerzen } from '../../../../shared/src/schwaerzen';
import { dokumenteApi } from '../../api/dokumente';
import { mappenApi, type Bezuege } from '../../api/mappen';
import { werkbankApi, type TypVorschlaege } from '../../api/werkbank';
import { t } from '../../sprache';
import type { Marke } from '../bruecke';
import { vorschlagFuer } from '../Post';
import { alsSeiten, HAEPPCHEN_MS, type Woerter } from './hilfen';
import { markenSchritte } from './rahmen';

/** Erkennung für den gewählten Typ: Vorschläge der Felder und Abgleich (Belege, Verweise, Doppelte). */
export interface Erkannt {
  typId: string;
  vorschlaege: TypVorschlaege | null;
  abgleich: (Abgleich & { bezuege: Bezuege }) | null;
}

/**
 * „Wohin gehört das?“ (nur Post): Vorschlag aus allen Wegen (#939): Pakete mit dms:klassifizieren, Überschrift im Text,
 * Abgleich. Einmal je Dokumentstand – wechselt die Person den Typ, läuft nur die Erkennung der Felder neu.
 */
export function useKlassifizierung(post: boolean, typ: Mappentyp, erkennKey: string, ziele: Mappentyp[]) {
  const [klass, setKlass] = useState<(Klassifizierung & { bezuege: Bezuege }) | null | undefined>(post ? undefined : null);
  const [zielId, setZielId] = useState<string | null>(post ? null : typ.id);
  const [gewaehlt, setGewaehlt] = useState(false);
  useEffect(() => {
    if (!post || gewaehlt) return;
    if (!erkennKey) {
      setKlass(null);
      return;
    }
    let aktuell = true;
    mappenApi.klassifizieren({ dokumente: erkennKey.split(',') }).then(
      (r) => {
        if (!aktuell) return;
        setKlass(r);
        if (r.vorschlag && ziele.some((x) => x.id === r.vorschlag!.typId)) setZielId(r.vorschlag.typId);
      },
      () => aktuell && setKlass(null),
    );
    return () => {
      aktuell = false;
    };
  }, [post, erkennKey, gewaehlt, ziele]);
  return { klass, zielId, setZielId, setGewaehlt };
}

/** Erkennung für den gewählten Typ: Vorschläge der Felder und Abgleich (Belege, Verweise, Doppelte). */
export function useErkannt(zielTyp: Mappentyp | undefined, erkennKey: string, post: boolean, mappeId: string) {
  const [erkannt, setErkannt] = useState<Erkannt | null>(null);
  useEffect(() => {
    if (!zielTyp) {
      setErkannt(null);
      return;
    }
    if (!erkennKey) {
      setErkannt({ typId: zielTyp.id, vorschlaege: null, abgleich: null });
      return;
    }
    let aktuell = true;
    setErkannt(null);
    const ids = erkennKey.split(',');
    void Promise.allSettled([
      werkbankApi.vorschlaege(zielTyp.id, { dokumente: ids, ...(post ? {} : { mappe: mappeId }) }),
      mappenApi.abgleich({ dokumente: ids, typ: zielTyp.id }),
    ]).then(([v, a]) => {
      if (aktuell)
        setErkannt({
          typId: zielTyp.id,
          vorschlaege: v.status === 'fulfilled' ? v.value : null,
          abgleich: a.status === 'fulfilled' ? a.value : null,
        });
    });
    return () => {
      aktuell = false;
    };
  }, [zielTyp, erkennKey, post, mappeId]);
  return erkannt;
}

/** Wörter mit Lage je Dokument (für Rahmen und Markieren); `dokKey` ändert sich mit den Dokumenten. */
export function useWoerter(doks: Dokument[]) {
  const [woerter, setWoerter] = useState<Record<string, Woerter | 'keine'>>({});
  const dokKey = doks.map((x) => `${x.id}:${x.sha256}:${x.ocr?.stand ?? ''}:${x.archivfassung?.stand ?? ''}`).join(',');
  useEffect(() => {
    let aktuell = true;
    for (const x of doks) {
      // Lässt sich das Original nicht als Seiten zeigen (E-Mail u. a.), die Seiten der fertigen Archivfassung (#1137).
      const archiv = !kannSchwaerzen(x.mime) && x.archivfassung?.stand === 'fertig';
      if (!kannSchwaerzen(x.mime) && !archiv) {
        setWoerter((w) => ({ ...w, [x.id]: 'keine' }));
        continue;
      }
      dokumenteApi.wortpositionen(x.id, archiv).then(
        (r) =>
          aktuell &&
          setWoerter((w) => ({
            ...w,
            [x.id]: {
              seiten: alsSeiten(r.seiten),
              mitText: r.seiten.some((s) => s.woerter.length > 0),
              ...(archiv ? { archiv: true } : {}),
            },
          })),
        () => aktuell && setWoerter((w) => ({ ...w, [x.id]: 'keine' })),
      );
    }
    return () => {
      aktuell = false;
    };
  }, [dokKey]); // eslint-disable-line react-hooks/exhaustive-deps -- Wortpositionen nur bei anderen Dokumenten (dokKey) laden
  return { woerter, dokKey };
}

/** Vorschläge, wie das Formular sie einträgt: Erkennung, dazu Verweise aus dem Abgleich und bei Post Betreff und Datum. */
export function useVorschlagStart(zielTyp: Mappentyp | undefined, erkannt: Erkannt | null, post: boolean, werte: Werte) {
  return useMemo<TypVorschlaege | undefined>(() => {
    if (!zielTyp || !erkannt || erkannt.typId !== zielTyp.id) return undefined;
    const r = ausErkennung(erkannt);
    verweiseDazu(r, zielTyp, erkannt.abgleich);
    if (post) {
      for (const [k, w] of Object.entries(vorschlagFuer(zielTyp, werte, null))) {
        if (!r.vorschlaege[k]) r.vorschlaege[k] = { wert: w, sicherheit: 'niedrig', fundstelle: t('ablage.uebernehmen.aus-der-post') };
      }
    }
    return r;
  }, [zielTyp, erkannt, post, werte]);
}

/** Die Vorschläge der Erkennung als neue Liste (das Formular trägt sie ein), mit den Bezügen aus dem Abgleich. */
function ausErkennung(erkannt: Erkannt): TypVorschlaege {
  const v: Partial<TypVorschlaege> = erkannt.vorschlaege ?? {};
  return {
    vorschlaege: { ...(v.vorschlaege ?? {}) },
    bezuege: { ...(v.bezuege ?? {}), ...(erkannt.abgleich?.bezuege ?? {}) },
    neu: { ...(v.neu ?? {}) },
    verworfen: v.verworfen ?? 0,
    zeichen: v.zeichen ?? 0,
    ...(v.engine ? { engine: v.engine } : {}),
    ...(v.hinweis ? { hinweis: v.hinweis } : {}),
    ...(v.positionen ? { positionen: v.positionen } : {}),
    ...(v.dazu ? { dazu: v.dazu } : {}),
    ...(v.erechnung ? { erechnung: v.erechnung } : {}),
  };
}

/**
 * Verweise aus dem Abgleich, wo die Erkennung nichts vorschlägt: der beste sichere Treffer, statt „neu anlegen“. Nicht
 * für „an“ (#1485): Bei einem eingehenden Beleg bleibt es leer („leer heißt wir“), bei einem ausgehenden schlägt es die
 * Erkennung selbst vor. Der Abgleich kennt die Richtung nicht und fände in „an“ den Absender, der im Text steht.
 */
function verweiseDazu(r: TypVorschlaege, zielTyp: Mappentyp, abgleich: Erkannt['abgleich']) {
  for (const [k, liste] of Object.entries(abgleich?.verweise ?? {})) {
    const f = zielTyp.felder.find((x) => x.key === k);
    const best = liste[0];
    if (!f || k === 'an' || r.vorschlaege[k] || !best || best.unsicher) continue;
    r.vorschlaege[k] = {
      wert: f.mehrfach ? [best.mappeId] : best.mappeId,
      sicherheit: best.sicherheit,
      fundstelle: best.belege.map((b) => `${b.feld} ${b.wert}`).join(', '),
    };
    delete r.neu[k];
  }
}

/**
 * Rahmen: je erkanntem Wert die Stelle im Dokument, bei Verweisen die Belege; nummeriert in der Reihenfolge der Felder.
 * Bei langen Dokumenten in Häppchen (#1255): erst die Seitentexte bauen, dann je Feld suchen; zwischendurch kommt
 * der Browser an die Reihe (Eingaben bleiben flüssig), die Rahmen erscheinen nach und nach.
 */
export function useMarken(
  zielTyp: Mappentyp | undefined,
  vorschlagStart: TypVorschlaege | undefined,
  erkannt: Erkannt | null,
  woerter: Record<string, Woerter | 'keine'>,
  doks: Dokument[],
) {
  const [marken, setMarken] = useState<Marke[]>([]);
  useEffect(() => {
    const liste: Marke[] = [];
    const schritte = markenSchritte({ zielTyp, vorschlagStart, abgleich: erkannt?.abgleich ?? null, woerter, doks }, liste);
    let i = 0;
    let gezeigt = 0; // bis zum ersten neuen Rahmen bleiben die bisherigen stehen (kein Flackern beim Nachladen)
    let zeit: ReturnType<typeof setTimeout>;
    const haeppchen = () => {
      const ende = performance.now() + HAEPPCHEN_MS;
      while (i < schritte.length && performance.now() < ende) schritte[i++]();
      if (i >= schritte.length || liste.length > gezeigt) {
        gezeigt = liste.length;
        setMarken([...liste]);
      }
      if (i < schritte.length) zeit = setTimeout(haeppchen, 0);
    };
    zeit = setTimeout(haeppchen, 0);
    return () => clearTimeout(zeit);
  }, [zielTyp, vorschlagStart, erkannt, woerter, doks]);
  return marken;
}
