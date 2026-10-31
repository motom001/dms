import { WasSiehtBlatt } from './Berechtigungen';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { abwesenheitWirkt, AKTIV_MINUTEN, geraetText, istGeradeAktiv, KEINE_ABWESENHEIT, ROLLEN, type Benutzer, type Rolle, type Sitzung } from '../../../shared/src/model';
import { heuteIn } from '../../../shared/src/sichten';
import { AbwesenheitFormular, zeitraumText } from '../profil/Abwesenheit';
import { api, type LinkErgebnis } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link } from '../ort';
import { Hilfe } from '../Hilfe';

const datumZeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie');
const status = (b: Benutzer) => (!b.aktiv ? { text: 'deaktiviert', art: '' } : !b.hatPasswort ? { text: 'eingeladen', art: 'warn' } : { text: 'aktiv', art: 'gut' });

type RolleEintrag = { id: string; name: string; system: boolean };

/** Rollen für die Auswahl; „weitere“ sind die selbst angelegten (ohne Administrator und Mitglied). */
function useRollen() {
  const d = useDaten();
  const [rollen, setRollen] = useState<RolleEintrag[] | null>(null);
  useEffect(() => { api.rollen().then(setRollen).catch(() => setRollen([])); }, [d.stand]);
  return { weitere: (rollen ?? []).filter((r) => !r.system), geladen: rollen !== null, typ: d.typen.find((t) => t.system === 'rolle') };
}

/** Rollen als Haken; Administrator und Mitglied stehen in der Auswahl „Rolle“. */
function WeitereRollen({ gewaehlt, setze, sperre }: { gewaehlt: string[]; setze: (ids: string[]) => void; sperre?: boolean }) {
  const r = useRollen();
  return (
    <fieldset className="wahl rollenwahl">
      <legend>Rollen <small className="leise">z. B. als Verantwortliche in Verträgen</small></legend>
      {r.geladen && !r.weitere.length && <p className="leise klein">Noch keine Rollen angelegt.</p>}
      {r.weitere.map((x) => (
        <label key={x.id} className="haken"><input type="checkbox" disabled={sperre} checked={gewaehlt.includes(x.id)}
          onChange={(e) => setze(e.target.checked ? [...gewaehlt, x.id] : gewaehlt.filter((y) => y !== x.id))} /><span>{x.name}</span></label>
      ))}
      {r.typ && <Link to={`/ablage/${r.typ.id}`} className="verweis klein">Rollen in der Ablage verwalten →</Link>}
    </fieldset>
  );
}

export function useBenutzer() {
  const [liste, setListe] = useState<Benutzer[]>([]);
  const [geladen, setGeladen] = useState(false);
  const laden = useCallback(async () => { try { setListe(await api.benutzer()); } finally { setGeladen(true); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  return { liste, geladen, laden };
}

export function BenutzerListe({ liste: alle, offen }: { liste: Benutzer[]; offen?: string }) {
  const { ich } = useKonto();
  const d = useDaten();
  // Deaktivierte standardmäßig ausblenden (#77); die Wahl merkt sich die Werkbank je Benutzer.
  const zeigeDeaktivierte = d.einstellungen.benutzer_deaktivierte === true;
  const deaktiviert = alle.filter((b) => !b.aktiv);
  const liste = [...alle.filter((b) => b.aktiv), ...(zeigeDeaktivierte || deaktiviert.some((b) => b.id === offen) ? deaktiviert : [])];
  const aktiv = alle.filter((b) => istGeradeAktiv(b.zuletztAktiv)).length;
  const heute = heuteIn();
  return (
    <>
      <div className="listenkopf">
        <div><h1>Benutzer</h1><p className="leise klein">Wer sich anmelden darf und mit welcher Systemrolle. {aktiv} gerade aktiv (in den letzten {AKTIV_MINUTEN} Minuten). <Hilfe ort="werkbank.benutzer" /></p></div>
        <Link to="/werkbank/benutzer/neu" className="knopf primaer klein">+ Neu</Link>
      </div>
      {deaktiviert.length > 0 && (
        <label className="haken klein"><input type="checkbox" checked={zeigeDeaktivierte} onChange={(e) => d.setzeEinstellung('benutzer_deaktivierte', e.target.checked || null)} />
          <span>Deaktivierte zeigen ({deaktiviert.length})</span></label>
      )}
      <ul className="mappenliste">
        {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">Neuer Benutzer</span><span className="unter">noch nicht angelegt</span></span></li>}
        {liste.map((b) => {
          const s = status(b);
          return (
            <li key={b.id}>
              <Link to={`/werkbank/benutzer/${b.id}`} className={`eintrag werk ${offen === b.id ? 'an' : ''} ${b.aktiv ? '' : 'grau'}`}>
                <span className="titel">{b.name || b.email}{b.id === ich.id && <span className="chip">du</span>}</span>
                <span className="unter">{b.email} · {ROLLEN[b.rolle]}</span>
                <span className="unter">Letzte Anmeldung: {datumZeit(b.letzteAnmeldung)}</span>
                <span><span className={`chip ${s.art}`}>{s.text}</span>{istGeradeAktiv(b.zuletztAktiv) && <> <span className="chip gut punkt">gerade aktiv</span></>}
                  {b.aktiv && b.abwesenheit?.an && <> <span className="chip warn">{abwesenheitWirkt(b.abwesenheit, heute) ? 'abwesend' : 'demnächst abwesend'}{b.abwesenheit.bis ? ` bis ${b.abwesenheit.bis.split('-').reverse().join('.')}` : ''}</span></>}</span>
                {b.aktiv && b.abwesenheit?.an && <span className="unter">vertreten durch {d.person(b.abwesenheit.vertreterId)}</span>}
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
  const d = useDaten();
  const benutzerTyp = d.typen.find((t) => t.system === 'benutzer');
  // Löschen nur, solange eine Einladung nie angenommen wurde; sonst deaktivieren (#26).
  const loeschbar = !b.hatPasswort && !b.letzteAnmeldung;
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
        {benutzerTyp && <p className="leise klein"><Link to={`/ablage/${benutzerTyp.id}/${b.id}`} className="verweis">Mappe in der Ablage →</Link></p>}
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {ergebnis && <LinkAnzeige e={ergebnis} schliessen={() => setErgebnis(undefined)} />}

      <form className="blatt" onSubmit={(e) => { e.preventDefault(); void aktion(() => api.benutzerAendern(b.id, { name }), 'Gespeichert.'); }}>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="eigenschaft"><span>E-Mail-Adresse <small>{selbst ? 'änderst du in deinem Profil' : 'ändert der Benutzer selbst'}</small></span><input value={b.email} readOnly disabled /></label>
          <label className="eigenschaft"><span>Systemrolle</span>
            <select value={b.rolle} onChange={(e) => void aktion(() => api.benutzerAendern(b.id, { rolle: e.target.value as Rolle }), 'Systemrolle geändert.')}>
              {Object.entries(ROLLEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
        </div>
        <WeitereRollen gewaehlt={b.rollen ?? []} setze={(rollen) => void aktion(() => api.benutzerAendern(b.id, { rollen }), 'Rollen gespeichert.')} />
        <div className="knoepfe"><button className="knopf primaer" disabled={name === b.name}>Name speichern</button></div>
      </form>

      <div className="blatt">
        <h2 className="h3">Zugang</h2>
        <p className="leise">{b.hatPasswort
          ? 'Ein Passwort-Link ist eine Stunde gültig und funktioniert einmal. Das bisherige Passwort gilt, bis ein neues gesetzt ist.'
          : 'Der Benutzer hat sein Passwort noch nicht festgelegt. Eine neue Einladung macht die alte ungültig.'}
          {' '}{loeschbar ? 'Solange die Einladung nicht angenommen ist, lässt sich der Benutzer löschen.' : 'Wer schon angemeldet war, wird deaktiviert statt gelöscht – Verweise und „angelegt von“ bleiben so erhalten.'}</p>
        <div className="knoepfe">
          <button className="knopf" onClick={() => void aktion(async () => setErgebnis(await api.neuerLink(b.id)))}>{b.hatPasswort ? 'Passwort-Link erzeugen' : 'Einladung erneut senden'}</button>
        </div>
      </div>

      <AbwesenheitFormular hilfe="benutzer.abwesenheit" benutzerId={b.id} wer={selbst ? 'du' : b.name || b.email} wert={b.abwesenheit ?? KEINE_ABWESENHEIT} offeneAufgaben={b.offeneAufgaben ?? 0}
        speichern={(a) => api.benutzerAbwesenheit(b.id, a)} uebergeben={() => api.benutzerAufgabenAnVertreter(b.id)}
        nachSpeichern={async () => { await neuLaden(); if (selbst) await aktualisieren(); }} />

      <ZweifaktorVon b={b} />
      <Sitzungen b={b} neuLaden={neuLaden} />

      <WasSiehtBlatt key={b.id} benutzerId={b.id} admin={b.rolle === 'admin'} />

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

      <ZugangSperren b={b} selbst={selbst} loeschbar={loeschbar} aktion={aktion} />
    </div>
  );
}

/**
 * Zugang sperren (#77): deaktivieren nur mit Vertreter und ohne offene Aufgaben (#78); der Vertreter
 * wirkt danach dauerhaft. Löschen bleibt für Einladungen, die nie angenommen wurden.
 */
function ZugangSperren({ b, selbst, loeschbar, aktion }: { b: Benutzer; selbst: boolean; loeschbar: boolean; aktion: (fn: () => Promise<unknown>, gut?: string) => Promise<void> }) {
  const d = useDaten();
  const name = b.name || b.email;
  const vertreter = b.abwesenheit?.vertreterId ? d.person(b.abwesenheit.vertreterId) : null;
  const offen = b.offeneAufgaben ?? 0;
  if (!b.aktiv) return (
    <div className="blatt">
      <h2 className="h3">Zugang wieder freigeben</h2>
      <p className="leise">{name} ist deaktiviert{b.deaktiviert ? ` seit ${datumZeit(b.deaktiviert)}` : ''}{vertreter ? `; Aufgaben, die noch für ${name} entstehen, gehen an ${vertreter}` : ''}. Aktivieren gibt den Zugang wieder frei; das Passwort gilt weiter.</p>
      <div className="knoepfe"><button className="knopf primaer" onClick={() => void aktion(() => api.benutzerAendern(b.id, { aktiv: true }), 'Aktiviert.')}>Benutzer aktivieren</button></div>
    </div>
  );
  if (selbst) return null;
  const gruende = [!vertreter && 'Es ist kein Vertreter hinterlegt – wähle oben unter „Abwesenheit“ einen.', offen > 0 && `${name} hat noch ${offen === 1 ? 'eine offene Aufgabe' : `${offen} offene Aufgaben`}${vertreter ? ` – gib sie oben an ${vertreter}.` : '.'}`].filter(Boolean) as string[];
  return (
    <div className="blatt gefahrenzone">
      <h2 className="h3">Zugang sperren <Hilfe ort="benutzer.sperren" /></h2>
      <ul className="leise">
        <li>Der Zugang ist sofort gesperrt, alle Sitzungen werden beendet.</li>
        <li>Die Mappe bleibt erhalten und heißt „{name} (ehemalig)“; Verweise und „angelegt von“ bleiben gültig.</li>
        <li>Der Vertreter bleibt hinterlegt und bekommt dauerhaft, was noch für {name} entsteht (z. B. „passt nicht“ an Mappen, die {name} angelegt hat).</li>
        <li><strong>Aktivieren</strong> macht es jederzeit rückgängig.</li>
      </ul>
      {gruende.length > 0 && <div className="hinweis warn"><p>Deaktivieren geht erst, wenn ein Vertreter hinterlegt ist und keine Aufgaben mehr offen sind.</p><ul>{gruende.map((g) => <li key={g}>{g}</li>)}</ul></div>}
      <div className="knoepfe">
        {loeschbar && <button className="knopf gefahr-rand" onClick={() => {
          if (confirm(`Einladung an ${b.email} zurückziehen und den Benutzer löschen?`)) void aktion(async () => { await api.benutzerLoeschen(b.id); geheZu('/werkbank/benutzer'); });
        }}>Einladung löschen</button>}
        <button className="knopf gefahr" disabled={gruende.length > 0} onClick={() => {
          if (confirm(`${name} deaktivieren? Der Zugang ist sofort gesperrt, alle Sitzungen enden. Aufgaben, die noch für ${name} entstehen, gehen an ${vertreter}.`)) {
            void aktion(() => api.benutzerAendern(b.id, { aktiv: false }), 'Deaktiviert – alle Sitzungen beendet.');
          }
        }}>Benutzer deaktivieren</button>
      </div>
    </div>
  );
}

/** Zwei-Faktor-Anmeldung des Benutzers (#242): Stand und Zurücksetzen (z. B. Handy verloren). */
function ZweifaktorVon({ b }: { b: Benutzer }) {
  const [stand, setStand] = useState<{ aktiv: boolean; seit: string | null; codesUebrig: number } | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const laden = useCallback(async () => { try { setStand(await api.benutzerZweifaktor(b.id)); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } }, [b.id]);
  useEffect(() => { void laden(); }, [laden]);
  const name = b.name || b.email;
  return (
    <div className="blatt">
      <h2 className="h3">Zwei-Faktor-Anmeldung</h2>
      {!stand ? !meldung && <p className="leise">Lade …</p> : stand.aktiv ? <>
        <p><span className="chip gut punkt">eingerichtet</span>{stand.seit && <> seit {new Date(stand.seit).toLocaleDateString('de-DE')}</>} · {stand.codesUebrig} Wiederherstellungscodes übrig</p>
        <div className="knoepfe"><button type="button" className="knopf gefahr-rand" onClick={() => {
          if (confirm(`Zwei-Faktor-Anmeldung von ${name} zurücksetzen? Danach reicht das Passwort – ist sie vorgeschrieben, richtet ${name} sie bei der nächsten Anmeldung neu ein.`)) {
            void api.benutzerZweifaktorZuruecksetzen(b.id).then(() => { setMeldung({ art: 'gut', text: 'Zurückgesetzt.' }); return laden(); }).catch((e) => setMeldung({ art: 'schlecht', text: (e as Error).message }));
          }
        }}>Zurücksetzen</button></div>
      </> : <p className="leise">Nicht eingerichtet.</p>}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
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
  const [rollen, setRollen] = useState<string[]>([]);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [ergebnis, setErgebnis] = useState<LinkErgebnis>();

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setSendet(true); setFehler(undefined);
    try { setErgebnis(await api.benutzerAnlegen({ email, name, rolle, rollen })); await neuLaden(); }
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
          <label className="eigenschaft"><span>Systemrolle</span>
            <select value={rolle} onChange={(e) => setRolle(e.target.value as Rolle)}>
              {Object.entries(ROLLEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
        </div>
        <WeitereRollen gewaehlt={rollen} setze={setRollen} />
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
