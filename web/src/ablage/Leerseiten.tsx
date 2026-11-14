import { useEffect, useState, type ReactNode } from 'react';
import { faelltWeg, istErkannt, leerseitenGelten, wegfallendeSeiten, wirdGekuerzt, type Leerseiten } from '../../../shared/src/leerseiten';
import type { Dokument } from '../../../shared/src/model';
import { dokumenteApi, seitenbildUrl } from '../api/dokumente';
import { Knopf } from '../bausteine';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import s from './Leerseiten.module.css';

/**
 * Leerseiten (#997): Ein Paket mit `dms:leerseiten` hat Seiten eines Dokuments in neuer Post als leer markiert. In der
 * Post und auf „Dokument übernehmen“ zeigt die Seitenleiste jede Seite als Vorschaubild; markierte sind blass mit
 * „Leerseite – fällt beim Übernehmen weg“. Je Seite „Doch behalten“ bzw. „Auch weglassen“; gelöscht wird erst beim
 * Übernehmen in eine Mappe (das Original bleibt als frühere Version). Am Handy liegen die Bilder waagerecht.
 */

/** Markierung eines Dokuments, wie die Person sie gerade gewählt hat (ohne die Mappe neu zu laden). */
export function useLeerseiten(doks: Dokument[]) {
  const [eigen, setEigen] = useState<Record<string, Leerseiten | null>>({});
  const schluessel = doks.map((x) => `${x.id}:${x.sha256}:${x.leerseiten?.geaendert ?? ''}`).join(',');
  // Neue Daten vom Server (z. B. nach dem Neuladen) gehen vor.
  useEffect(() => { setEigen({}); }, [schluessel]);
  const von = (x: Dokument): Leerseiten | null => {
    const l = x.id in eigen ? eigen[x.id] : x.leerseiten ?? null;
    return l && leerseitenGelten({ sha256: x.sha256, leerseiten: l }) ? l : null;
  };
  return { von, setze: (id: string, l: Leerseiten | null) => setEigen((e) => ({ ...e, [id]: l })) };
}

/** Hinweiszeile über dem Dokument: „3 leere Seiten erkannt“ – oder warum nichts wegfällt. */
export function LeerseitenHinweis({ x, l }: { x: Dokument; l: Leerseiten }) {
  const weg = wegfallendeSeiten(l);
  const erkannt = l.erkannt.length;
  const ganz = weg.length > 0 && !wirdGekuerzt({ sha256: x.sha256, mime: x.mime, leerseiten: l });
  return (
    <p className={`hinweis info ${s.hinweis}`} role="status" data-anker="leerseiten.hinweis">
      <Symbol name="info" />
      <span>
        {/* Ohne Paket (nur die Wahl einer Person, z. B. über die Schnittstelle) gibt es nichts „Erkanntes“. */}
        {!l.paket ? t('ablage.leerseiten.gewaehlt', { anzahl: weg.length }) : erkannt ? t('ablage.leerseiten.erkannt', { anzahl: erkannt }) : t('ablage.leerseiten.keine-erkannt')}
        {' · '}
        {ganz ? t('ablage.leerseiten.ganz-leer') : weg.length ? t('ablage.leerseiten.fallen-weg', { anzahl: weg.length }) : t('ablage.leerseiten.alle-bleiben')}
        {l.paketName && <span className="leise"> · {t('ablage.leerseiten.von-paket', { paket: l.paketName })}</span>}
      </span>
      <Hilfe ort="post.leerseiten" />
    </p>
  );
}

/**
 * Die Seitenleiste: je Seite Vorschaubild, Nummer und – wer die Post bearbeiten darf – „Doch behalten“ bzw. „Auch
 * weglassen“. `senkrecht`: neben dem Dokument (Seite „Dokument übernehmen“, breit); sonst und am Handy waagerecht.
 */
export function LeerseitenLeiste({ x, l, darf, geaendert, senkrecht = false }: {
  x: Dokument; l: Leerseiten; darf: boolean; geaendert(l: Leerseiten | null): void; senkrecht?: boolean;
}) {
  const nummern = Array.from({ length: l.seiten }, (_, i) => i + 1);
  async function waehle(nr: number, weglassen: boolean) {
    const r = await dokumenteApi.leerseiteWaehlen(x.id, nr, weglassen);
    geaendert(r.leerseiten);
  }
  return (
    <div className={`leerseiten ${s.leiste} ${senkrecht ? s.senkrecht : ''}`} data-anker="leerseiten.leiste">
      <ol className={s.seiten} aria-label={t('ablage.leerseiten.seiten-von', { name: x.name })}>
        {nummern.map((nr) => {
          const weg = faelltWeg(l, nr);
          const erkannt = istErkannt(l, nr);
          return (
            <li key={nr} className={`${s.seite} ${weg ? s.weg : ''}`} data-leer={weg ? 'ja' : undefined}>
              <figure className={s.bild}>
                {x.mime === 'application/pdf' && nr <= 400
                  ? <img src={seitenbildUrl(x, nr)} alt={t('ablage.leerseiten.seite', { nr })} loading={nr <= 4 ? 'eager' : 'lazy'} />
                  : <span className={s.ohneBild} aria-hidden="true" />}
                <figcaption className="klein">
                  <span>{t('ablage.leerseiten.seite', { nr })}</span>
                  {weg && <span className={s.marke}>{erkannt ? t('ablage.leerseiten.leerseite') : t('ablage.leerseiten.weglassen-gewaehlt')}</span>}
                </figcaption>
              </figure>
              {darf && (weg
                ? <Knopf art="link" groesse="klein" onClick={() => waehle(nr, false)}>{t('ablage.leerseiten.doch-behalten')}</Knopf>
                : <Knopf art="link" groesse="klein" onClick={() => waehle(nr, true)}>{t('ablage.leerseiten.auch-weglassen')}</Knopf>)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Beides zusammen, wenn es eine Markierung gibt (für die Post: Liste der Dokumente). */
export function LeerseitenBlock({ x, l, darf, geaendert }: { x: Dokument; l: Leerseiten | null; darf: boolean; geaendert(l: Leerseiten | null): void }) {
  if (!l || x.mime !== 'application/pdf') return null;
  return (
    <div className={s.block}>
      <LeerseitenHinweis x={x} l={l} />
      <LeerseitenLeiste x={x} l={l} darf={darf} geaendert={geaendert} />
    </div>
  );
}

/**
 * Seite „Dokument übernehmen“: Hinweiszeile über dem Dokument, links die Leiste (senkrecht), rechts die großen Seiten;
 * ohne Markierung nur die Seiten. Am Handy steht die Leiste waagerecht darüber.
 */
export function MitLeerseiten({ x, l, darf, geaendert, children }: { x: Dokument; l: Leerseiten | null; darf: boolean; geaendert(l: Leerseiten | null): void; children: ReactNode }) {
  if (!l || x.mime !== 'application/pdf') return <>{children}</>;
  return (
    <>
      <LeerseitenHinweis x={x} l={l} />
      <div className={s.mitLeiste}>
        <LeerseitenLeiste x={x} l={l} darf={darf} geaendert={geaendert} senkrecht />
        <div>{children}</div>
      </div>
    </>
  );
}

/** Große Seite, die beim Übernehmen wegfällt: blass, mit Hinweis unter dem Bild. */
export const grosseSeite = (weg: boolean) => (weg ? s.grossWeg : '');
export function GrosseSeiteMarke({ weg }: { weg: boolean }) {
  return weg ? <span className={s.grossMarke}> · {t('ablage.leerseiten.leerseite')}</span> : null;
}
