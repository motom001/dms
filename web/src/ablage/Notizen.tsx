import { useEffect, useState } from 'react';
import type { Notiz } from '../../../shared/src/model';
import { mappenApi, type ErwaehnungsUebersicht } from '../api/mappen';
import { Link } from '../ort';
import { Formatiert, FormatiertEingabe } from './Formatiert';
import { Uebersetzbar } from './Uebersetzung';
import { Person } from '../Person';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Knopf } from '../bausteine';

/** Notizen an einer Mappe (#55): lesen, anlegen, bearbeiten, löschen – jeder darf alles. Seit #427 ein System-Register. */
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

export function Notizen({ mappeId, notizen, neuLaden }: { mappeId: string; notizen: Notiz[]; neuLaden: () => Promise<void> }) {
  const [neu, setNeu] = useState('');
  const [bearbeite, setBearbeite] = useState<{ id: string; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();

  async function tu(f: () => Promise<unknown>) {
    setLaeuft(true); setFehler(undefined);
    try { await f(); await neuLaden(); return true; } catch (e) { setFehler((e as Error).message); return false; } finally { setLaeuft(false); }
  }

  return (
    <section className="notizen notizregister" aria-label={t('ablage.notizen.notizen')}>
      <ErwaehntIn mappeId={mappeId} />
      {!notizen.length && <p className="leise">{t('ablage.notizen.noch-keine-notizen-notizen')}</p>}
      <ul className="notizliste">
        {notizen.map((n) => (
          <li key={n.id}>
            <div className="notizkopf leise klein">
              <Person id={n.erstelltVon} /> · {zeit(n.erstellt)}{n.geaendert !== n.erstellt && n.geaendert.slice(0, 16) !== n.erstellt.slice(0, 16) && <> {' '}{t('ablage.notizen.geaendert', { zeit: zeit(n.geaendert) })}{n.geaendertVon !== n.erstelltVon && <> {' '}{t('ablage.notizen.von')}{' '}<Person id={n.geaendertVon} /></>}</>}
              {bearbeite?.id !== n.id && <span className="zeilenaktionen">
                <Knopf art="link" groesse="klein" onClick={() => setBearbeite({ id: n.id, text: n.text })}>{t('ablage.notizen.bearbeiten')}</Knopf>
                {/* Gefahr leise mit Symbol und Rückfrage (#1210, Leitsatz 4). */}
                <Knopf art="gefahr" groesse="klein" symbol="geloescht" gesperrt={laeuft} onClick={() => tu(() => mappenApi.notizLoeschen(n.id))}
                  rueckfrage={{ titel: t('ablage.notizen.diese-notiz-loeschen'), ja: t('ablage.notizen.loeschen') }}>{t('ablage.notizen.loeschen')}</Knopf>
              </span>}
            </div>
            {bearbeite?.id === n.id
              ? <>
                  <FormatiertEingabe id={`notiz-${n.id}`} wert={bearbeite.text} setze={(text) => setBearbeite({ id: n.id, text })} />
                  <div className="knoepfe">
                    <Knopf onClick={() => setBearbeite(null)}>{t('ablage.notizen.abbrechen')}</Knopf>
                    <Knopf art="haupt" gesperrt={!bearbeite.text.trim()} laeuft={laeuft} onClick={() => tu(() => mappenApi.notizAendern(n.id, bearbeite.text)).then((ok) => { if (ok) setBearbeite(null); })}>{t('ablage.notizen.speichern')}</Knopf>
                  </div>
                </>
              : <Uebersetzbar quelle={{ art: 'notiz', notiz: n.id }} original={n.text} darstellen={(x) => <Formatiert text={x} />}><Formatiert text={n.text} /></Uebersetzbar>}
          </li>
        ))}
      </ul>
      <div className="neuenotiz">
        <FormatiertEingabe id="neue-notiz" wert={neu} setze={setNeu} />
        <div className="knoepfe">
          <Knopf art="haupt" gesperrt={!neu.trim()} laeuft={laeuft} onClick={() => tu(() => mappenApi.notizAnlegen(mappeId, neu)).then((ok) => { if (ok) setNeu(''); })}>{t('ablage.notizen.notiz-hinzufuegen')}</Knopf>
        </div>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </section>
  );
}

/**
 * Erwähnt in … (#889): ruhiger Hinweis oben im Register – keine Notiz. Er entsteht aus Erwähnungen in Notizen und
 * formatierten Feldern anderer Mappen und verschwindet mit ihnen; der Server nennt nur Stellen in lesbaren Mappen.
 */
function ErwaehntIn({ mappeId }: { mappeId: string }) {
  const [liste, setListe] = useState<ErwaehnungsUebersicht['erwaehntIn']>([]);
  useEffect(() => {
    let weg = false;
    void mappenApi.erwaehnungen(mappeId).then((x) => { if (!weg) setListe(x.erwaehntIn); }, () => { if (!weg) setListe([]); });
    return () => { weg = true; };
  }, [mappeId]);
  if (!liste.length) return null;
  const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <ul className="erwaehnt-in leise klein" aria-label={t('ablage.notizen.erwaehnt-liste')}>
      {liste.map((x) => {
        const titel = <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{x.titel || t('ablage.formatiert.erwaehnung.ohne-titel')}</Link>;
        return <li key={`${x.mappeId}-${x.stelle}-${x.feld ?? ''}`}>{x.stelle === 'feld'
          ? tn('ablage.notizen.erwaehnt-in-feld', { feld: x.feld ?? '', titel, datum: datum(x.am) })
          : tn('ablage.notizen.erwaehnt-in', { titel, datum: datum(x.am) })}</li>;
      })}
    </ul>
  );
}
