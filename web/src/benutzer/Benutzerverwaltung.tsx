import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ROLLEN, type Benutzer, type Rolle } from '../../../shared/src/model';
import { api, type LinkErgebnis } from '../api';
import { useKonto } from '../konto';

const datumZeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

export function Benutzerverwaltung() {
  const { ich, mail } = useKonto();
  const [liste, setListe] = useState<Benutzer[]>([]);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [ergebnis, setErgebnis] = useState<LinkErgebnis>();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [rolle, setRolle] = useState<Rolle>('mitglied');
  const [sendet, setSendet] = useState(false);

  const laden = useCallback(async () => {
    try { setListe(await api.benutzer()); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function aktion(fn: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try { await fn(); if (gut) setMeldung({ art: 'gut', text: gut }); await laden(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setSendet(true); setErgebnis(undefined); setMeldung(undefined);
    try {
      const r = await api.benutzerAnlegen({ email, name, rolle });
      setErgebnis(r); setEmail(''); setName(''); setRolle('mitglied');
      await laden();
    } catch (err) { setMeldung({ art: 'schlecht', text: (err as Error).message }); }
    finally { setSendet(false); }
  }

  return (
    <div className="einspaltig">
      <div className="seitenkopf"><div>
        <p className="ueber">Verwaltung</p>
        <h1>Benutzer</h1>
        <p className="leise">{mail ? 'Neue Benutzer bekommen eine E-Mail mit einem Link, über den sie ihr Passwort festlegen.' : 'Kein E-Mail-Versand eingerichtet: Nach dem Anlegen erscheint ein Link, den du dem Benutzer selbst schickst.'}</p>
      </div></div>

      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {ergebnis && <LinkAnzeige e={ergebnis} schliessen={() => setErgebnis(undefined)} />}

      <form className="blatt" onSubmit={anlegen}>
        <h2 className="h3">Benutzer anlegen</h2>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="eigenschaft"><span>E-Mail-Adresse</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="eigenschaft"><span>Rolle</span>
            <select value={rolle} onChange={(e) => setRolle(e.target.value as Rolle)}>
              {Object.entries(ROLLEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
        </div>
        <div><button className="knopf primaer" disabled={sendet}>{sendet ? 'Lege an …' : mail ? 'Anlegen und einladen' : 'Anlegen'}</button></div>
      </form>

      <div className="blatt">
        <div className="tabellenrahmen">
          <table>
            <thead><tr><th scope="col">Name</th><th scope="col">E-Mail</th><th scope="col">Rolle</th><th scope="col">Status</th><th scope="col">Letzte Anmeldung</th><th scope="col"><span className="sr">Aktionen</span></th></tr></thead>
            <tbody>
              {liste.map((b) => (
                <tr key={b.id}>
                  <th scope="row">{b.name || '–'}{b.id === ich.id && <span className="chip">du</span>}</th>
                  <td>{b.email}</td>
                  <td>
                    <select aria-label={`Rolle von ${b.name || b.email}`} value={b.rolle} onChange={(e) => void aktion(() => api.benutzerAendern(b.id, { rolle: e.target.value as Rolle }), 'Rolle geändert.')}>
                      {Object.entries(ROLLEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td>{!b.aktiv ? <span className="chip">deaktiviert</span> : !b.hatPasswort ? <span className="chip warn">eingeladen</span> : <span className="chip gut">aktiv</span>}</td>
                  <td className="ziffern">{datumZeit(b.letzteAnmeldung)}</td>
                  <td>
                    <div className="zeilenaktionen">
                      <button className="textknopf" onClick={() => void aktion(async () => setErgebnis(await api.neuerLink(b.id)))}>{b.hatPasswort ? 'Passwort-Link' : 'Einladung erneut'}</button>
                      {b.id !== ich.id && <button className="textknopf" onClick={() => void aktion(() => api.benutzerAendern(b.id, { aktiv: !b.aktiv }), b.aktiv ? 'Benutzer deaktiviert, alle Sitzungen beendet.' : 'Benutzer aktiviert.')}>{b.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>}
                      {b.id !== ich.id && <button className="textknopf gefahr" onClick={() => { if (confirm(`Benutzer ${b.email} löschen? Seine Mappen bleiben erhalten.`)) void aktion(() => api.benutzerLoeschen(b.id), 'Benutzer gelöscht.'); }}>Löschen</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LinkAnzeige({ e, schliessen }: { e: LinkErgebnis; schliessen: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  if (e.mailVerschickt) return <div className="hinweis gut"><p>E-Mail an {e.benutzer.email} ist verschickt.</p><button className="textknopf" onClick={schliessen}>Schließen</button></div>;
  return (
    <div className="hinweis info stapel">
      <p>{e.mailFehler ? `Die E-Mail an ${e.benutzer.email} konnte nicht verschickt werden (${e.mailFehler}).` : `Schicke diesen Link an ${e.benutzer.email}.`} Er funktioniert nur einmal.</p>
      <div className="linkzeile">
        <input readOnly value={e.link} onFocus={(ev) => ev.target.select()} aria-label="Link zum Passwort setzen" className="mono" />
        <button className="knopf klein" onClick={async () => { try { await navigator.clipboard.writeText(e.link!); setKopiert(true); } catch { /* Feld ist markierbar */ } }}>{kopiert ? 'Kopiert' : 'Kopieren'}</button>
      </div>
      <button className="textknopf" onClick={schliessen}>Schließen</button>
    </div>
  );
}
