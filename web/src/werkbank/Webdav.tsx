import { useCallback, useEffect, useState } from 'react';
import { api, type WebdavEinstellung, type WebdavStand } from '../api';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';

/**
 * Werkbank → WebDAV-Laufwerk (#346, Stufe 1): an/aus (Standard aus), Adresse zum Einbinden,
 * Stand und die letzten Zugriffe (nur im Arbeitsspeicher, nach einem Neustart leer).
 * Ohne mittlere Spalte (#366): die letzten Zugriffe stehen rechts mit fester Höhe, neueste oben.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });

export function useWebdav(offen: boolean) {
  const [stand, setStand] = useState<WebdavStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.webdav()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  useEffect(() => {
    if (!offen) return;
    const t = setInterval(() => void laden(), 15_000);
    return () => clearInterval(t);
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
  if (!s || !e) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">Lade …</p>;
  async function speichern() {
    setSendet(true);
    try { const n = await api.webdavSetzen(e!); z.setStand(n); setE(n.einstellung); setMeldung({ art: 'gut', text: 'Gespeichert.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>WebDAV-Laufwerk</h1>
        <p className="leise">Die Ablage als Laufwerk im Explorer, im Finder oder in der Dateien-App: Ordner lesen, Dokumente öffnen (mit Exportrecht) und Dateien in „Neue Post“ oder einen Register-Ordner legen. Angemeldet wird mit der E-Mail-Adresse und einem API-Schlüssel, nie mit dem Passwort. <Hilfe ort="werkbank.webdav" /></p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {!s.https && <div className="hinweis warn"><p>Die Adresse des DMS beginnt nicht mit <code>https://</code>. Windows bindet ein Laufwerk mit Anmeldung nur über HTTPS ein, und ohne HTTPS gingen die API-Schlüssel offen über das Netz. Richte zuerst HTTPS ein (Werkbank → E-Mail und Adresse, Reverse-Proxy).</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <h2 className="h3">Einstellungen</h2>
        <label className="haken"><input id="webdav-aktiv" type="checkbox" checked={e.aktiv} onChange={(x) => setE({ ...e, aktiv: x.target.checked })} />
          <span>WebDAV-Laufwerk einschalten <small className="leise">– ausgeschaltet antwortet <code>/webdav/</code> mit „nicht gefunden“</small></span></label>
        <Speicherleiste ent={ent} gegenstand="Einstellungen" sendet={sendet} />
      </form>
      <div className="blatt">
        <h2 className="h3">Stand</h2>
        <dl className="eigenschaften">
          <dt>Zustand</dt><dd>{s.einstellung.aktiv ? 'eingeschaltet' : 'ausgeschaltet'}</dd>
          <dt>Adresse zum Einbinden</dt><dd><code>{s.adresse}</code></dd>
          <dt>Anfragen seit dem Start</dt><dd>{s.anfragen}</dd>
          <dt>Grenze</dt><dd>{s.grenze} Anfragen je Benutzer und Minute</dd>
        </dl>
        <p className="leise klein">Benutzer erzeugen den Schlüssel selbst unter Profil → Sicherheit → API-Schlüssel („lesen und schreiben“, damit sie ablegen können). Administratoren bekommen keine API-Schlüssel und nutzen das Laufwerk darum nicht.</p>
      </div>
      {/* #366: früher die mittlere Spalte; ganz unten, mit fester Höhe (etwa zehn Einträge), neueste oben. */}
      <div className="blatt" id="zugriffe">
        <h2 className="h3">Letzte Zugriffe{s.zugriffe.length > 0 && <> <span className="chip">{s.zugriffe.length}</span></>}</h2>
        {!s.zugriffe.length ? <p className="leise">Seit dem letzten Start noch keine Zugriffe.</p> : (
          <ul className="sitzungsliste festhoehe">
            {s.zugriffe.map((z, i) => (
              <li key={`${z.zeit}-${i}`}>
                <span><strong className="mono">{z.methode}</strong> <span className="mono umbrechen">{z.pfad}</span>
                  <span className="leise klein"> – {zeit(z.zeit)} · {z.benutzer}</span></span>
                <span className={`chip ${z.status >= 400 ? 'schlecht' : ''}`} title="HTTP-Status">{z.status}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="leise klein">Nur im Arbeitsspeicher; nach einem Neustart ist die Liste leer.</p>
      </div>
    </div>
  );
}
