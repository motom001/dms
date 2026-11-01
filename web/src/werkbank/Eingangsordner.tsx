import { useCallback, useEffect, useState } from 'react';
import { api, type EingangEinstellung, type EingangStand } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';

/**
 * Werkbank → Eingangsordner (#195): Ein/Aus, Prüfabstand, was nach dem Übernehmen geschieht,
 * zuletzt übernommene Dateien und Fehler. Nur sichtbar, wenn /eingang eingebunden ist.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });

export function useEingangsordner(offen: boolean) {
  const [stand, setStand] = useState<EingangStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.eingangsordner()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => {
    if (!offen) return;
    const t = setInterval(() => void laden(), 10_000);
    return () => clearInterval(t);
  }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type EingangZustand = ReturnType<typeof useEingangsordner>;

export function EingangsordnerPanel({ z }: { z: EingangZustand }) {
  const s = z.stand;
  const [e, setE] = useState<EingangEinstellung | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (s?.einstellung && !e) setE(s.einstellung); }, [s, e]);
  const ent = useEntwurf(s?.einstellung ?? null, e, { aus: !e, zuruecksetzen: () => { setE(s?.einstellung ?? null); setMeldung(undefined); } });
  if (!s) return <p className="leise">{z.fehler ?? 'Lade …'}</p>;
  if (!s.vorhanden || !e) {
    return (
      <div className="einspaltig"><div className="mappenkopf"><p className="ueber">Werkbank</p><h1>Eingangsordner</h1>
        <p className="leise">Es ist kein Eingangsordner eingebunden. Binde einen Ordner deines NAS als <code>/eingang</code> in den Container ein – siehe Handbuch. <Hilfe ort="werkbank.eingangsordner" /></p></div></div>
    );
  }
  async function speichern() {
    setSendet(true);
    try { const n = await api.eingangsordnerSetzen(e!); z.setStand(n); setE(n.einstellung ?? e); setMeldung({ art: 'gut', text: 'Gespeichert.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  async function jetzt() {
    try { const r = await api.eingangsordnerPruefen(); z.setStand(r.stand); setMeldung({ art: 'gut', text: r.uebernommen ? `${r.uebernommen} ${r.uebernommen === 1 ? 'Datei' : 'Dateien'} übernommen.` : 'Geprüft – nichts Fertiges gefunden. Eine Datei wird erst übernommen, wenn sie sich zwischen zwei Prüfungen nicht mehr ändert.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Eingangsordner</h1>
        <p className="leise">Jede fertige Datei im Ordner <code>{s.pfad}</code> wird eine neue Post (Kanal „Ordner“). Unterordner mit dem Namen eines Benutzers, z. B. <code>eingang/thomas/</code>, tragen ihn bei „Für“ ein. <Hilfe ort="werkbank.eingangsordner" /></p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {s.pausiert && <div className="hinweis warn"><p>Ruht gerade: {s.pausiert}.</p></div>}
      {s.andereInstanz && <div className="hinweis warn"><p>Eine andere Instanz des DMS übernimmt den Eingangsordner; diese hier wartet.</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <h2 className="h3">Einstellungen</h2>
        <label className="haken"><input id="eingang-aktiv" type="checkbox" checked={e.aktiv} onChange={(x) => setE({ ...e, aktiv: x.target.checked })} /><span>Eingangsordner prüfen</span></label>
        <div className="raster">
          <label className="eigenschaft"><span>Prüfabstand <small>in Sekunden, 5 bis 3600</small></span>
            <input id="eingang-abstand" type="number" min={5} max={3600} value={e.abstand} onChange={(x) => setE({ ...e, abstand: Number(x.target.value) })} /></label>
          <label className="eigenschaft"><span>Nach dem Übernehmen</span>
            <select id="eingang-nachher" value={e.nachher} onChange={(x) => setE({ ...e, nachher: x.target.value as EingangEinstellung['nachher'] })}>
              <option value="erledigt">in „erledigt/“ verschieben</option>
              <option value="loeschen">löschen</option>
            </select></label>
        </div>
        <label className="haken"><input type="checkbox" checked={e.doppelteUeberspringen === true} onChange={(x) => setE({ ...e, doppelteUeberspringen: x.target.checked })} />
          <span>Doppelte Dateien überspringen <small className="leise">– liegt genau diese Datei schon im DMS, wird keine Post angelegt; die Datei wird wie oben weggeräumt</small></span></label>
        <div className="knoepfe">
          <button type="button" className="knopf" onClick={() => void jetzt()}>Jetzt prüfen</button>
        </div>
        <Speicherleiste ent={ent} gegenstand="Einstellungen" sendet={sendet} />
      </form>
      <div className="blatt">
        <h2 className="h3">Stand</h2>
        <dl className="eigenschaften">
          <dt>Letzte Prüfung</dt><dd>{s.letztePruefung ? zeit(s.letztePruefung) : '–'}</dd>
          <dt>Noch nicht fertig</dt><dd>{s.wartend ?? 0} {s.wartend === 1 ? 'Datei' : 'Dateien'} <span className="leise klein">(werden übernommen, sobald sie sich nicht mehr ändern)</span></dd>
        </dl>
        {(s.fehler ?? []).length > 0 && <>
          <h3 className="h4">Fehler</h3>
          <ul>{(s.fehler ?? []).map((f) => <li key={`${f.datei}-${f.zeit}`}><strong>{f.datei}</strong> ({zeit(f.zeit)}): {f.grund}</li>)}</ul>
          <p className="leise klein">Abgelehnte Dateien liegen in <code>fehler/</code>, daneben eine Textdatei mit dem Grund.</p>
        </>}
      </div>
      <div className="blatt" id="uebernommen">
        <h2 className="h3">Zuletzt übernommen</h2>
        {!(s.uebernommen ?? []).length ? <p className="leise">Noch nichts übernommen.</p> : (
          <ul className="sitzungsliste festhoehe">
            {(s.uebernommen ?? []).map((u) => (
              <li key={`${u.datei}-${u.zeit}`}>
                <span><strong>{u.datei}</strong> <span className="leise klein">{zeit(u.zeit)}</span></span>
                {u.mappeId && <Link to={`/ablage/eingang/${u.mappeId}`} className="verweis klein">Post öffnen</Link>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
