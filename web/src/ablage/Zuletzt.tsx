import { useEffect, useState } from 'react';
import { mappenApi, type ZuletztGeoeffnet } from '../api/mappen';
import { useDaten } from '../daten';
import { Listenkopf } from '../Listenkopf';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * „Zuletzt geöffnet“ als Liste (#940): die letzten 25 Mappen der Person, neueste oben, mit Mappentyp und Zeitpunkt.
 * Anlegen und Ändern zählen wie Öffnen (Entscheidung Thomas). Erreichbar nur über die Startseite – bewusst kein
 * Eintrag links unter den Ansichten; zurück geht es mit „← Start“.
 */

/** „geöffnet heute, 10:30“, „geöffnet gestern, 18:02“, sonst mit Datum. */
export function geoeffnetAm(iso: string, jetzt = new Date()): string {
  const d = new Date(iso);
  const zeit = d.toLocaleTimeString(gebietsschema(), { hour: '2-digit', minute: '2-digit' });
  const tag = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const tage = Math.round((tag(jetzt) - tag(d)) / 86_400_000);
  if (tage === 0) return t('ablage.zuletzt.heute', { zeit });
  if (tage === 1) return t('ablage.zuletzt.gestern', { zeit });
  return t('ablage.zuletzt.am', { datum: d.toLocaleDateString(gebietsschema(), { dateStyle: 'medium' }), zeit });
}

export function ZuletztListe({ offen }: { offen?: string }) {
  const d = useDaten();
  const [liste, setListe] = useState<ZuletztGeoeffnet[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => {
    let aktuell = true;
    mappenApi.zuletztGeoeffnet().then((x) => { if (aktuell) { setListe(x); setFehler(undefined); } }, (e) => { if (aktuell) setFehler((e as Error).message); });
    return () => { aktuell = false; };
    // Nach dem Öffnen einer Mappe nicht umsortieren (sonst springt der Eintrag unter dem Mauszeiger): nur bei neuem Stand.
  }, [d.stand]);
  return (
    <>
      <Link to="/ablage/start" className="verweis klein zl-zurueck">{t('ablage.zuletzt.zurueck')}</Link>
      <Listenkopf titel={t('ablage.startseite.zuletzt-geoeffnet')} hilfe="ablage.start" beschreibung={t('ablage.zuletzt.beschreibung')} />
      <div className="listenrumpf">
        {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
        {!liste ? !fehler && <p className="leise">{t('ablage.zuletzt.lade')}</p>
          : !liste.length ? <div className="leer"><p>{t('ablage.zuletzt.leer')}</p></div>
          : (
            <ul className="mappenliste">
              {liste.map((m) => (
                <li key={m.id}>
                  <Link to={`/ablage/zuletzt/${m.id}`} className={`eintrag ${offen === m.id ? 'an' : ''}`}>
                    <span className="titel">{titelOder(m.titel)}</span>
                    <span className="unter">{[d.typ(m.typId)?.name ?? '', m.am ? geoeffnetAm(m.am) : ''].filter(Boolean).join(' · ')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </div>
    </>
  );
}
