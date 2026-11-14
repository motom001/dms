import { useCallback, useEffect, useState } from 'react';
import { Feld, HakenFeld, Schalter } from '../bausteine';
import { api, type WebdavEinstellung, type WebdavStand } from '../api';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Kopf } from './Kopf';

/**
 * Werkbank → WebDAV-Laufwerk (#346, Stufe 1): an/aus (Standard aus), Stempel beim Lesen und „nur lesend“ (#722), Adresse zum Einbinden,
 * Stand und die letzten Zugriffe (nur im Arbeitsspeicher, nach einem Neustart leer).
 * Ohne mittlere Spalte (#366): die letzten Zugriffe stehen rechts mit fester Höhe, neueste oben.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'medium' });

export function useWebdav(offen: boolean) {
  const [stand, setStand] = useState<WebdavStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.webdav()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  useEffect(() => {
    if (!offen) return;
    const timer = setInterval(() => void laden(), 15_000);
    return () => clearInterval(timer);
  }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type WebdavZustand = ReturnType<typeof useWebdav>;

export function WebdavPanel({ z }: { z: WebdavZustand }) {
  const s = z.stand;
  const [e, setE] = useState<WebdavEinstellung | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (s?.einstellung && !e) setE(s.einstellung); }, [s, e]);
  const ent = useEntwurf(s?.einstellung ?? null, e, { aus: !e, zuruecksetzen: () => { setE(s?.einstellung ?? null); setMeldung(undefined); } });
  if (!s || !e) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">{t('werkbank.webdav.lade')}</p>;
  async function speichern() {
    setSendet(true);
    try { const n = await api.webdavSetzen(e!); z.setStand(n); setE(n.einstellung); setMeldung({ art: 'gut', text: t('werkbank.webdav.gespeichert') }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.webdav.webdav-laufwerk')} ueber={t('werkbank.webdav.werkbank')} hilfe="werkbank.webdav">
        <p className="leise">{t('werkbank.webdav.die-ablage-als-laufwerk')}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {!s.https && <div className="hinweis warn"><p>{tn('werkbank.webdav.die-adresse-von-ablago', { code: <code>{'https://'}</code> })}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <h2 className="h3">{t('werkbank.webdav.einstellungen')}</h2>
        {/* An/aus als Schalter (#1188); was „aus“ heißt, steht darunter. */}
        <Schalter id="webdav-aktiv" an={e.aktiv} setze={(an) => setE({ ...e, aktiv: an })} beschriftung={t('werkbank.webdav.schalter')}
          hinweis={tn('werkbank.webdav.ausgeschaltet-antwortet-mit-nicht', { code: <code>{'/webdav/'}</code> })} />
        {/* Stempel beim Lesen (#722): Vorgabe ist die mitgelieferte Vorlage; Pflicht-Stempel der Mappentypen gelten immer. */}
        <Feld beschriftung={t('werkbank.webdav.stempel')} hilfe="webdav.stempel" hinweis={t('werkbank.webdav.stempel.hinweis')}>
          <select id="webdav-stempel" value={e.stempel ?? ''} onChange={(x) => setE({ ...e, stempel: x.target.value || null })}>
            <option value="">{t('werkbank.webdav.stempel.aus')}</option>
            {s.vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name} – {v.text.split('\n').join(' / ')}</option>)}
          </select>
        </Feld>
        <HakenFeld beschriftung={t('werkbank.webdav.nur-lesend')} hilfe="webdav.nurLesend" hinweis={t('werkbank.webdav.nur-lesend.hinweis')}>
          <input id="webdav-nur-lesend" type="checkbox" checked={e.nurLesend} onChange={(x) => setE({ ...e, nurLesend: x.target.checked })} />
        </HakenFeld>
        <Speicherleiste ent={ent} gegenstand={t('werkbank.webdav.einstellungen')} sendet={sendet} />
      </form>
      <div className="blatt">
        <h2 className="h3">{t('werkbank.webdav.stand')}</h2>
        <dl className="eigenschaften">
          {/* Kein „Zustand: eingeschaltet“ mehr (#1188): Den zeigt der Schalter oben. */}
          <dt>{t('werkbank.webdav.stempel')}</dt><dd>{s.einstellung.stempel ? s.vorlagen.find((v) => v.id === s.einstellung.stempel)?.name ?? s.einstellung.stempel : t('werkbank.webdav.stempel.aus')}</dd>
          <dt>{t('werkbank.webdav.adresse-zum-einbinden')}</dt><dd><code>{s.adresse}</code></dd>
          <dt>{t('werkbank.webdav.anfragen-seit-dem-start')}</dt><dd>{s.anfragen}</dd>
          <dt>{t('werkbank.webdav.grenze')}</dt><dd>{t('werkbank.webdav.anfragen-je-benutzer-und', { grenze: s.grenze })}</dd>
        </dl>
        <p className="leise klein">{t('werkbank.webdav.benutzer-erzeugen-den-schluessel')}</p>
      </div>
      {/* #366: früher die mittlere Spalte; ganz unten, mit fester Höhe (etwa zehn Einträge), neueste oben. */}
      <div className="blatt" id="zugriffe">
        <h2 className="h3">{t('werkbank.webdav.letzte-zugriffe')}{s.zugriffe.length > 0 && <> <span className="chip">{s.zugriffe.length}</span></>}</h2>
        {!s.zugriffe.length ? <p className="leise">{t('werkbank.webdav.seit-dem-letzten-start')}</p> : (
          <ul className="sitzungsliste festhoehe">
            {s.zugriffe.map((z, i) => (
              <li key={`${z.zeit}-${i}`}>
                <span><strong className="mono">{z.methode}</strong> <span className="mono umbrechen">{z.pfad}</span>
                  <span className="leise klein"> – {zeit(z.zeit)} · {z.benutzer}</span></span>
                <span className={`chip ${z.status >= 400 ? 'schlecht' : ''}`} title={t('werkbank.webdav.http-status')}>{z.status}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="leise klein">{t('werkbank.webdav.nur-im-arbeitsspeicher-nach')}</p>
      </div>
    </div>
  );
}
