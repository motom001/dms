import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AKTIV_MINUTEN, geraetText, istGeradeAktiv, ROLLEN, type Benutzer, type Rolle, type Sitzung } from '../../../shared/src/model';
import { api, type LinkErgebnis } from '../api';
import { useKonto } from '../konto';
import { geheZu, Link } from '../ort';

const datumZeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie');
const status = (b: Benutzer) => (!b.aktiv ? { text: 'deaktiviert', art: '' } : !b.hatPasswort ? { text: 'eingeladen', art: 'warn' } : { text: 'aktiv', art: 'gut' });

export function useBenutzer() {
  const [liste, setListe] = useState<Benutzer[]>([]);
  const [geladen, setGeladen] = useState(false);
  const laden = useCallback(async () => { try { setListe(await api.benutzer()); } finally { setGeladen(true); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  return { liste, geladen, laden };
}

export function BenutzerListe({ liste, offen }: { liste: Benutzer[]; offen?: string }) {
  const { ich } = useKonto();
  const aktiv = liste.filter((b) => istGeradeAktiv(b.zuletztAktiv)).length;
  return (
    <>
      <div className="listenkopf">
        <div><h1>Benutzer</h1><p className="leise klein">Wer sich anmelden darf und mit welcher Rolle. {aktiv} gerade aktiv (in den letzten {AKTIV_MINUTEN} Minuten).</p></div>
        <Link to="/werkbank/benutzer/neu" className="knopf primaer klein">+ Neu</Link>
      </div>
      <ul className="mappenliste">
        {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">Neuer Benutzer</span><span className="unter">noch nicht angelegt</span></span></li>}
        {liste.map((b) => {
          const s = status(b);
          return (
            <li key={b.id}>
              <Link to={`/werkbank/benutzer/${b.id}`} className={`eintrag werk ${offen === b.id ? 'an' : ''}`}>
                <span className="titel">{b.name || b.email}{b.id === ich.id && <span className="chip">du</span>}</span>
                <span className="unter">{b.email} · {ROLLEN[b.rolle]}</span>
                <span className="unter">Letzte Anmeldung: {datumZeit(b.letzteAnmeldung)}</span>
                <span><span className={`chip ${s.art}`}>{s.text}</span>{istGeradeAktiv(b.zuletztAktiv) && <> <span className="chip gut punkt">gerade aktiv</span></>}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function BenutzerDetail({ b, neuLaden }: { b: Benutzer; neuLaden: () => Promise<void> }) {
  const { ich, aktualisieren } = useKonto();
  const [name, setName] = useState(b.name);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [ergebnis, setErgebnis] = useState<LinkErgebnis>();
  const selbst = b.id === ich.id;
  const s = status(b);

  async function aktion(fn: () => Promise<unknown>, gut?: string) {
    setMeldung(undefined);
    try { await fn(); if (gut) setMeldung({ art: 'gut', text: gut }); await neuLaden(); if (selbst) await aktualisieren(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Benutzer</p>
        <h1>{b.name || b.email}</h1>
        <dl className="index">
          <div><dt>Status</dt><dd><span className={`chip ${s.art}`}>{s.text}</span></dd></div>
          <div><dt>Angelegt</dt><dd>{datumZeit(b.erstellt)}</dd></div>
          <div><dt>Letzte Anmeldung</dt><dd>{datumZeit(b.letzteAnmeldung)}</dd></div>
          <div><dt>Zuletzt aktiv</dt><dd>{datumZeit(b.zuletztAktiv ?? null)}{istGeradeAktiv(b.zuletztAktiv) && <> <span className="chip gut punkt">gerade aktiv</span></>}</dd></div>
        </dl>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {ergebnis && <LinkAnzeige e={ergebnis} schliessen={() => setErgebnis(undefined)} />}

      <form className="blatt" onSubmit={(e) => { e.preventDefault(); void aktion(() => api.benutzerAendern(b.id, { name }), 'Gespeichert.'); }}>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="eigenschaft"><span>E-Mail-Adresse <small>{selbst ? 'änderst du in deinem Profil' : 'ändert der Benutzer selbst'}</small></span><input value={b.email} readOnly disabled /></label>
          <label className="eigenschaft"><span>Rolle</span>
            <select value={b.rolle} onChange={(e) => void aktion(() => api.benutzerAendern(b.id, { rolle: e.target.value as Rolle }), 'Rolle geändert.')}>
              {Object.entries(ROLLEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
        </div>
        <div className="knoepfe"><button className="knopf primaer" disabled={name === b.name}>Name speichern</button></div>
      </form>

      <div className="blatt">
        <h2 className="h3">Zugang</h2>
        <p className="leise">{b.hatPasswort
          ? 'Ein Passwort-Link ist eine Stunde gültig und funktioniert einmal. Das bisherige Passwort gilt, bis ein neues gesetzt ist.'
          : 'Der Benutzer hat sein Passwort noch nicht festgelegt. Eine neue Einladung macht die alte ungültig.'}</p>
        <div className="knoepfe">
          <button className="knopf" onClick={() => void aktion(async () => setErgebnis(await api.neuerLink(b.id)))}>{b.hatPasswort ? 'Passwort-Link erzeugen' : 'Einladung erneut senden'}</button>
          {!selbst && <button className="knopf" onClick={() => void aktion(() => api.benutzerAendern(b.id, { aktiv: !b.aktiv }), b.aktiv ? 'Deaktiviert – alle Sitzungen beendet.' : 'Aktiviert.')}>{b.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>}
          {!selbst && <button className="knopf gefahr-rand" onClick={() => {
            if (confirm(`Benutzer ${b.email} löschen? Seine Mappen bleiben erhalten.`)) void aktion(async () => { await api.benutzerLoeschen(b.id); geheZu('/werkbank/benutzer'); });
          }}>Löschen</button>}
        </div>
      </div>

      <Sitzungen b={b} neuLaden={neuLaden} />

      {!selbst && b.aktiv && (
        <div className="blatt">
          <h2 className="h3">Fehler nachstellen</h2>
          <p className="leise">Du siehst und bedienst das DMS dann genau so wie {b.name || b.email}, mit den Rechten dieses Kontos. Oben steht die ganze Zeit ein Warnhinweis mit dem Weg zurück. {b.name || b.email} erfährt bei der nächsten Anmeldung, dass und wann du unter diesem Konto gearbeitet hast.</p>
          <div className="knoepfe"><button className="knopf" onClick={() => {
            if (confirm(`Als ${b.name || b.email} anmelden? Deine eigene Sitzung endet dabei; zurück geht es über den Warnhinweis oben.`)) {
              void aktion(async () => { await api.vertreten(b.id); geheZu('/ablage', true); await aktualisieren(); });
            }
          }}>Als {b.name || b.email} anmelden</button></div>
        </div>
      )}
    </div>
  );
}

/** Angemeldete Geräte des Benutzers; einzeln oder alle abmelden. */
function Sitzungen({ b, neuLaden }: { b: Benutzer; neuLaden: () => Promise<void> }) {
  const [liste, setListe] = useState<Sitzung[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await api.sitzungen(b.id)); } catch (e) { setFehler((e as Error).message); } }, [b.id]);
  useEffect(() => { void laden(); }, [laden]);
  async function beende(fn: () => Promise<unknown>, eigene: boolean) {
    try { await fn(); } catch (e) { setFehler((e as Error).message); }
    if (eigene) location.reload(); else { await laden(); await neuLaden(); }
  }
  return (
    <div className="blatt">
      <h2 className="h3">Angemeldet auf {liste?.length ?? '…'} {liste?.length === 1 ? 'Gerät' : 'Geräten'}</h2>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {liste && !liste.length && <p className="leise">Gerade nirgends angemeldet.</p>}
      {liste && liste.length > 0 && (
        <ul className="sitzungsliste">
          {liste.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{geraetText(s.geraet)}</strong>
                {s.aktuell && <> <span className="chip">diese Sitzung</span></>}
                {s.vertretungId && <> <span className="chip warn">Administrator agiert als Benutzer</span></>}
                {istGeradeAktiv(s.zuletztAktiv) && <> <span className="chip gut punkt">gerade aktiv</span></>}
                <span className="leise klein blockzeile">Zuletzt aktiv {datumZeit(s.zuletztAktiv)} · angemeldet seit {datumZeit(s.erstellt)}{s.ip ? ` · ${s.ip}` : ''}</span>
              </div>
              <button className="textknopf gefahr" onClick={() => void beende(() => api.sitzungBeenden(b.id, s.id), !!s.aktuell)}>Abmelden</button>
            </li>
          ))}
        </ul>
      )}
      {liste && liste.length > 1 && (
        <div className="knoepfe"><button className="knopf gefahr-rand" onClick={() => {
          if (confirm(`${b.name || b.email} auf allen ${liste.length} Geräten abmelden?`)) void beende(() => api.alleSitzungenBeenden(b.id), liste.some((s) => s.aktuell));
        }}>Überall abmelden</button></div>
      )}
    </div>
  );
}

export function BenutzerNeu({ neuLaden }: { neuLaden: () => Promise<void> }) {
  const { mail } = useKonto();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [rolle, setRolle] = useState<Rolle>('mitglied');
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [ergebnis, setErgebnis] = useState<LinkErgebnis>();

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setSendet(true); setFehler(undefined);
    try { setErgebnis(await api.benutzerAnlegen({ email, name, rolle })); await neuLaden(); }
    catch (err) { setFehler((err as Error).message); }
    finally { setSendet(false); }
  }

  if (ergebnis) return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">Benutzer</p><h1>{ergebnis.benutzer.name || ergebnis.benutzer.email} ist angelegt</h1></div>
      <LinkAnzeige e={ergebnis} />
      <div className="knoepfe"><Link to={`/werkbank/benutzer/${ergebnis.benutzer.id}`} className="knopf">Zum Benutzer</Link></div>
    </div>
  );

  return (
    <form className="einspaltig" onSubmit={anlegen}>
      <div className="mappenkopf"><p className="ueber">Benutzer</p><h1>Neuer Benutzer</h1>
        <p className="leise">{mail ? 'Er bekommt eine E-Mail mit einem Link, über den er sein Passwort festlegt.' : 'Kein E-Mail-Versand eingerichtet: Nach dem Anlegen erscheint ein Link, den du selbst weitergibst.'}</p></div>
      <div className="blatt">
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label className="eigenschaft"><span>E-Mail-Adresse</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="eigenschaft"><span>Rolle</span>
            <select value={rolle} onChange={(e) => setRolle(e.target.value as Rolle)}>
              {Object.entries(ROLLEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
        </div>
        {fehler && <p className="fehlertext">{fehler}</p>}
        <div className="knoepfe"><button className="knopf primaer" disabled={sendet}>{sendet ? 'Lege an …' : mail ? 'Anlegen und einladen' : 'Anlegen'}</button></div>
      </div>
    </form>
  );
}

function LinkAnzeige({ e, schliessen }: { e: LinkErgebnis; schliessen?: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  if (e.mailVerschickt) return <div className="hinweis gut"><p>E-Mail an {e.benutzer.email} ist verschickt.</p>{schliessen && <button className="textknopf" onClick={schliessen}>Schließen</button>}</div>;
  return (
    <div className="hinweis info stapel">
      <p>{e.mailFehler ? `Die E-Mail an ${e.benutzer.email} konnte nicht verschickt werden (${e.mailFehler}).` : `Schicke diesen Link an ${e.benutzer.email}.`} Er funktioniert nur einmal.</p>
      <div className="linkzeile">
        <input readOnly value={e.link} onFocus={(ev) => ev.target.select()} aria-label="Link zum Passwort setzen" className="mono" />
        <button className="knopf klein" onClick={async () => { try { await navigator.clipboard.writeText(e.link!); setKopiert(true); } catch { /* Feld ist markierbar */ } }}>{kopiert ? 'Kopiert' : 'Kopieren'}</button>
      </div>
      {schliessen && <button className="textknopf" onClick={schliessen}>Schließen</button>}
    </div>
  );
}
