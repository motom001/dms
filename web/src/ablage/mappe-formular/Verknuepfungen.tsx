import { useEffect, useState, type ReactNode } from 'react';
import { feldLabel, typName } from '../../../../shared/src/beschriftung';
import { rechtsbuendig } from '../../../../shared/src/feldarten';
import { darfErstellen, VERWEISARTEN, type Mappe, type Mappentyp } from '../../../../shared/src/model';
import { gebietsschema } from '../../../../shared/src/sprache';
import { mappenApi, type Bezuege, type Rueckverweis } from '../../api/mappen';
import { Knopf, KnopfLink, type KnopfSperre } from '../../bausteine';
import { useDaten } from '../../daten';
import { geheZu, Link } from '../../ort';
import { Ehemalig } from '../../Person';
import { titelOder } from '../../seiten';
import { t, tn } from '../../sprache';
import { spaltenName, zelle } from '../spalten';
import type { verknuepfungsGruppen } from './hilfen';

/* ---------- Verknüpfungsregister ---------- */

/** Warum sich die Mappe nicht löschen lässt: Grund und ggf. die Mappen, die noch verweisen (#79). */
export interface Loeschsperre {
  grund: string;
  rueckverweise?: Rueckverweis[];
}

/**
 * „Mappe löschen“ mit der Begründung auf Klick (#423): Ist Löschen gesperrt (Verweise, Archivmodus, fehlendes Recht),
 * ist der Knopf in der Speicherleiste gesperrt aus einem Grund (#1210, Leitsatz 6) – gestrichelt mit Schloss und ⓘ; ein
 * Klick öffnet die Erklärung direkt am Knopf mit den verweisenden Mappen. Bildschirmleser hören den Grund schon am Knopf.
 *
 * `wege`: weitere Löschwege, die trotz Sperre gehen – sie stehen in der Erklärung unter „Stattdessen“ als Knöpfe
 * (z. B. „Mit verknüpften Mappen löschen …“, #424).
 */
export function useLoeschsperre(sperre: Loeschsperre | undefined, wege?: ReactNode): KnopfSperre | undefined {
  const d = useDaten();
  if (!sperre) return undefined;
  const quellen = [...new Map((sperre.rueckverweise ?? []).map((r) => [r.quelleId, r])).values()];
  const zeige = quellen.slice(0, 8);
  const eintraege = zeige.map((r) => (
    <>
      {r.verborgen ? (
        <span className="verborgen-titel">{r.titel}</span>
      ) : (
        <Link to={`/ablage/${r.quelleTypId}/${r.quelleId}`} className="verweis">
          <Ehemalig id={r.quelleId}>{titelOder(r.titel)}</Ehemalig>
        </Link>
      )}{' '}
      <span className="leise">({d.typ(r.quelleTypId)?.name ?? t('ablage.mappeformular.mappe')})</span>
    </>
  ));
  return {
    grund: sperre.grund,
    titel: t('ablage.mappeformular.loeschen-nicht-moeglich-2'),
    eintraege,
    weitere: quellen.length - zeige.length,
    stattdessen: wege || undefined,
  };
}

export function Verknuepfungen({ mappe, gruppen }: { mappe: Mappe; gruppen: ReturnType<typeof verknuepfungsGruppen> }) {
  const d = useDaten();
  if (!gruppen.length)
    return <p className="leise">{tn('ablage.mappeformular.kein-mappentyp-verweist-auf', { name: d.typ(mappe.typId)?.name })}</p>;
  return (
    <div className="gruppen">
      {gruppen.map(({ t: mappentyp, f, treffer, liste }) => (
        <section key={`${mappentyp.id}-${f.key}`} className="gruppe">
          <header>
            <span>
              <strong>{typName(mappentyp)}</strong>{' '}
              <span className="leise">{t('ablage.mappeformular.ueber', { label: feldLabel(f) })}</span>{' '}
              <span className="chip">{VERWEISARTEN[f.verweisart ?? 'bezug']}</span> <span className="anzahl">{treffer.length}</span>
            </span>
            {darfErstellen(mappentyp) && (
              <KnopfLink
                to={`/ablage/${mappentyp.id}/neu?verweis=${encodeURIComponent(`${f.key}:${mappe.id}`)}`}
                art="anlegen"
                groesse="klein">
                {t('ablage.mappeformular.anlegen-2', { name: mappentyp.name })}
              </KnopfLink>
            )}
          </header>
          {!treffer.length ? (
            <p className="leise">{t('ablage.mappeformular.noch-keine')}</p>
          ) : liste?.spalten.length ? (
            <VerweisTabelle mappeId={mappe.id} typ={mappentyp} feldKey={f.key} spalten={liste.spalten} anzahl={treffer.length} />
          ) : (
            <Trefferliste treffer={treffer} />
          )}
        </section>
      ))}
    </div>
  );
}

/** Verweisende Mappen als Tabelle mit den Spalten einer Trefferliste (#75). */
function VerweisTabelle({
  mappeId,
  typ,
  feldKey,
  spalten,
  anzahl,
}: {
  mappeId: string;
  typ: Mappentyp;
  feldKey: string;
  spalten: string[];
  anzahl: number;
}) {
  const d = useDaten();
  const [daten, setDaten] = useState<{ gesamt: number; mappen: Mappe[]; bezuege: Bezuege } | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => {
    mappenApi.verweisende(mappeId, typ.id, feldKey).then(setDaten, (e: Error) => setFehler(e.message));
  }, [mappeId, typ.id, feldKey, anzahl, d.stand]);
  if (fehler) return <p className="fehlertext klein">{fehler}</p>;
  if (!daten) return <p className="leise klein">{t('ablage.mappeformular.lade')}</p>;
  const rechts = (k: string) => rechtsbuendig(typ.felder.find((x) => x.key === k)?.typ);
  return (
    <div className="trefferliste verweistabelle">
      <table>
        <thead>
          <tr>
            {spalten.map((k) => (
              <th key={k} className={rechts(k) ? 'rechts' : ''}>
                {spaltenName(k, typ)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {daten.mappen.map((m) => {
            const ziel = `/ablage/${typ.id}/${m.id}`;
            return (
              <tr
                key={m.id}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a, button')) geheZu(ziel);
                }}>
                {spalten.map((k, i) => {
                  const text = zelle(k, m, typ, daten.bezuege, d.person);
                  return (
                    <td key={k} className={rechts(k) ? 'rechts' : ''}>
                      {i === 0 ? <Link to={ziel}>{text || titelOder(m.titel)}</Link> : text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {daten.gesamt > daten.mappen.length && (
        <p className="leise klein">
          {t('ablage.mappeformular.die-ersten-von', {
            mappen: daten.mappen.length.toLocaleString(gebietsschema()),
            gesamt: daten.gesamt.toLocaleString(gebietsschema()),
          })}
        </p>
      )}
    </div>
  );
}

/** Verweisende Mappen; bei sehr vielen erst die ersten 100. */
function Trefferliste({ treffer }: { treffer: Rueckverweis[] }) {
  const [alle, setAlle] = useState(false);
  const sichtbar = alle ? treffer : treffer.slice(0, 100);
  return (
    <>
      <ul>
        {sichtbar.map((r) => (
          <li key={r.quelleId + r.feldKey}>
            <Link to={`/ablage/${r.quelleTypId}/${r.quelleId}`} className="verweis">
              <Ehemalig id={r.quelleId}>{titelOder(r.titel)}</Ehemalig>
            </Link>
          </li>
        ))}
      </ul>
      {sichtbar.length < treffer.length && (
        <Knopf art="link" onClick={() => setAlle(true)}>
          {t('ablage.mappeformular.alle-zeigen', { treffer: treffer.length.toLocaleString(gebietsschema()) })}
        </Knopf>
      )}
    </>
  );
}
