/** Trefferliste als Tabelle (#22, #75; #1279 eigene Datei): sortierbare Spaltenköpfe, Haken, Stern, Aufgabe. */
import type { ReactNode } from 'react';
import { rechtsbuendig } from '../../../../shared/src/feldarten';
import { sortierbar, type Ausschnitt, type Mappe, type Mappentyp, type Sortierung } from '../../../../shared/src/model';
import type { Bezuege } from '../../api/mappen';
import { useDaten } from '../../daten';
import { geheZu, Link } from '../../ort';
import { Ehemalig } from '../../Person';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { Knopf, Wahlhaken } from '../../bausteine';
import { spaltenName, zelle } from '../spalten';
import { Stern } from '../Stern';
import type { Auswahl } from './auswahl';
import { absenderFehlt } from './hilfen';
import { Fundstelle, GeaendertPunkt, Zeilenhaken } from './teile';

export function Tabelle(p: {
  sicht: string;
  anhang?: string;
  typ?: Mappentyp;
  spaltenTyp?: Mappentyp;
  spalten: string[];
  mappen: Mappe[];
  bezuege: Bezuege;
  ausschnitte?: Record<string, Ausschnitt>;
  aufgaben?: Record<string, string>;
  favoriten: Set<string>;
  geaendert?: Set<string>;
  offen?: string;
  sortierung: Sortierung | null;
  sortiere(spalte: string): void;
  ende?: (el: HTMLElement | null) => void;
  nachladen: ReactNode;
  wahl?: Auswahl;
}) {
  const d = useDaten();
  const geladen = p.mappen.filter((m) => !m.verborgen);
  const alleGeladen = !!p.wahl && geladen.length > 0 && geladen.every((m) => p.wahl!.gewaehlt.has(m.id));
  const einige = !!p.wahl && !alleGeladen && geladen.some((m) => p.wahl!.gewaehlt.has(m.id));
  const aktiv = p.sortierung ?? { spalte: '_titel', absteigend: false };
  const rechts = (k: string) => rechtsbuendig(p.spaltenTyp?.felder.find((x) => x.key === k)?.typ);
  // Datum, Ja/Nein und Zeitstempel nicht umbrechen; Texte dürfen umbrechen, damit die Tabelle in die Liste passt.
  const kurz = (k: string) => {
    const f = p.spaltenTyp?.felder.find((x) => x.key === k);
    return k === '_erstellt' || k === '_geaendert' || f?.typ === 'datum' || f?.typ === 'janein';
  };
  return (
    <div className="trefferliste">
      <table>
        <thead>
          <tr>
            {p.wahl && (
              <th className="hakenspalte">
                <Wahlhaken
                  an={alleGeladen}
                  teilweise={einige}
                  beschriftung={t('ablage.ablage.alle-geladenen-auswaehlen')}
                  setze={(an) => p.wahl!.setze(an ? [...new Set([...p.wahl!.gewaehlt, ...geladen.map((m) => m.id)])] : [], false)}
                />
              </th>
            )}
            <th className="sternspalte">
              <span className="sr">{t('ablage.ablage.favorit')}</span>
            </th>
            {p.spalten.map((k) => {
              const kann = sortierbar(k, p.typ);
              const an = aktiv.spalte === k;
              return (
                <th
                  key={k}
                  className={rechts(k) ? 'rechts' : ''}
                  aria-sort={an ? (aktiv.absteigend ? 'descending' : 'ascending') : undefined}>
                  {kann ? (
                    // Sortieren über die Spaltenköpfe (#1212): Klick sortiert, zweiter Klick dreht um; Pfeil an der sortierten Spalte.
                    <Knopf
                      art="link"
                      className={`spaltenknopf${an ? ' sortiert' : ''}`}
                      onClick={() => p.sortiere(k)}
                      title={t('ablage.ablage.nach-sortieren', { spaltenName: spaltenName(k, p.spaltenTyp) })}>
                      {spaltenName(k, p.spaltenTyp)}
                      <Symbol name={an ? (aktiv.absteigend ? 'sortiert-ab' : 'sortiert-auf') : 'sortierbar'} className="pfeil" />
                    </Knopf>
                  ) : (
                    spaltenName(k, p.spaltenTyp)
                  )}
                </th>
              );
            })}
            {p.sicht === 'eingang' && <th>{t('ablage.ablage.aufgabe')}</th>}
          </tr>
        </thead>
        <tbody>
          {p.mappen.map((m, i) => {
            const typ = d.typ(m.typId);
            const ziel = `/ablage/${p.sicht}/${m.id}${p.anhang ?? ''}`;
            return (
              <tr
                key={m.id}
                className={`${p.offen === m.id ? 'an' : ''} ${m.passt === false ? 'unpassend' : ''}${p.wahl?.gewaehlt.has(m.id) ? ' gewaehlt' : ''}${p.geaendert?.has(m.id) ? ' abo-geaendert' : ''}`}
                {...(p.wahl && !m.verborgen ? p.wahl.druck(i) : {})}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a, button, input')) geheZu(ziel);
                }}>
                {p.wahl && (
                  <td className="hakenspalte">
                    {!m.verborgen && (
                      <Zeilenhaken
                        an={p.wahl.gewaehlt.has(m.id)}
                        titel={titelOder(m.titel)}
                        waehle={(an, bereich) => p.wahl!.waehle(i, an, bereich)}
                      />
                    )}
                  </td>
                )}
                <td className="sternspalte">
                  <Stern mappeId={m.id} an={p.favoriten.has(m.id)} titel={titelOder(m.titel)} />
                </td>
                {p.spalten.map((k, i) => {
                  const text = zelle(k, m, typ, p.bezuege, d.person);
                  // Post ohne Absender (#494): „–“ als Hinweis zum Ergänzen beim Zuordnen.
                  const fehlt = i > 0 && k === 'von' && absenderFehlt(typ, m);
                  return (
                    <td key={k} className={rechts(k) ? 'rechts' : kurz(k) ? 'kurz' : ''}>
                      {i === 0 ? (
                        <>
                          {p.geaendert?.has(m.id) && <GeaendertPunkt />}
                          <Link to={ziel}>
                            <Ehemalig id={m.id}>{text || titelOder(m.titel)}</Ehemalig>
                          </Link>
                          {p.ausschnitte?.[m.id] && <Fundstelle a={p.ausschnitte[m.id]} />}
                        </>
                      ) : fehlt ? (
                        <span className="leise" title={t('ablage.ablage.absender-fehlt-trag-ihn')}>
                          –
                        </span>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
                {p.sicht === 'eingang' && <td className="problemzelle">{p.aufgaben?.[m.id] ?? m.problem}</td>}
              </tr>
            );
          })}
          {p.nachladen && (
            <tr ref={p.ende} className="nachladen">
              <td colSpan={p.spalten.length + 1 + (p.wahl ? 1 : 0) + (p.sicht === 'eingang' ? 1 : 0)} className="leise klein">
                {p.nachladen}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
