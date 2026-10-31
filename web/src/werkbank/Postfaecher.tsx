import { useCallback, useEffect, useState } from 'react';
import { api, type PostfachAnsicht, type PostfachEingabe } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { Hilfe } from '../Hilfe';

/**
 * Werkbank → Postfächer (#196): Mails per IMAP abholen, jede Mail wird neue Post.
 * Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const NEU: PostfachEingabe = {
  name: '', aktiv: true, server: '', port: 993, verschluesselung: 'ssl', benutzer: '', passwort: '', ordner: 'INBOX', abstand: 5,
  fuer: null, absender: '', nachher: 'verschieben', zielordner: 'DMS', nurMitAnhang: false, original: true,
};
const PORT = { ssl: 993, starttls: 143, keine: 143 } as const;

export function usePostfaecher(offen: boolean) {
  const [liste, setListe] = useState<PostfachAnsicht[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await api.postfaecher()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  useEffect(() => {
    if (!offen) return;
    const t = setInterval(() => void laden(), 30_000);
    return () => clearInterval(t);
  }, [offen, laden]);
  return { liste, fehler, laden, setListe };
}
export type PostfachZustand = ReturnType<typeof usePostfaecher>;

export function PostfaecherListe({ z, offen }: { z: PostfachZustand; offen?: string }) {
  return (
    <>
      <div className="listenkopf"><div><h1>Postfächer</h1><p className="leise klein">Mails abholen – jede Mail wird neue Post. <Hilfe ort="werkbank.postfaecher" /></p></div>
        <Link to="/werkbank/postfaecher/neu" className="knopf gruen klein">+ Neu</Link></div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!z.liste ? <p className="leise">Lade …</p> : !z.liste.length ? <p className="leise leerliste">Noch kein Postfach.</p> : (
        <ul className="mappenliste">
          {z.liste.map((p) => (
            <li key={p.id}><Link to={`/werkbank/postfaecher/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
              <span className="titel">{p.name}</span>
              <span className="unter">{p.benutzer} · {p.aktiv ? (p.stand.letzterAbruf ? `zuletzt ${zeit(p.stand.letzterAbruf)}` : 'noch nicht abgerufen') : 'aus'}</span>
              {p.stand.fehlerFolge > 0 && <span className="problem">Fehler</span>}
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}

export function PostfachEditor({ z, id }: { z: PostfachZustand; id: string }) {
  const d = useDaten();
  const vorhanden = id !== 'neu' ? z.liste?.find((p) => p.id === id) : undefined;
  const [e, setE] = useState<PostfachEingabe>(() => (vorhanden ? { ...vorhanden, absender: vorhanden.absender.join(', '), passwort: '' } : NEU));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht' | 'info'; text: string }>();
  const [bestaetigt, setBestaetigt] = useState(false);
  if (id !== 'neu' && !vorhanden) return z.liste ? <div className="leer"><p>Dieses Postfach gibt es nicht (mehr).</p></div> : <p className="leise">Lade …</p>;
  const setze = (x: Partial<PostfachEingabe>) => setE({ ...e, ...x });
  const eingabe = { ...e, unverschluesseltBestaetigt: bestaetigt };

  async function speichern() {
    try {
      const l = vorhanden ? await api.postfachAendern(vorhanden.id, eingabe) : await api.postfachAnlegen(eingabe);
      z.setListe(l);
      setMeldung({ art: 'gut', text: 'Gespeichert.' });
      setE({ ...e, passwort: '' });
      if (!vorhanden) geheZu(`/werkbank/postfaecher/${l[l.length - 1].id}`, true);
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function testen() {
    setMeldung({ art: 'info', text: 'Verbinde …' });
    try { const r = await api.postfachTesten({ ...eingabe, id: vorhanden?.id }); setMeldung({ art: r.ok ? 'gut' : 'schlecht', text: r.text }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function abrufen() {
    if (!vorhanden) return;
    setMeldung({ art: 'info', text: 'Rufe ab …' });
    try { const r = await api.postfachAbrufen(vorhanden.id); setMeldung({ art: 'gut', text: r.uebernommen ? `${r.uebernommen} ${r.uebernommen === 1 ? 'Mail' : 'Mails'} übernommen.` : 'Keine neuen Mails.' }); await z.laden(); await d.neuLaden(); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); await z.laden(); }
  }
  async function loeschen() {
    if (!vorhanden || !confirm(`Postfach „${vorhanden.name}“ entfernen? Die Mails im Postfach bleiben, wie sie sind.`)) return;
    try { await api.postfachLoeschen(vorhanden.id); await z.laden(); geheZu('/werkbank/postfaecher'); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  const s = vorhanden?.stand;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank → Postfächer</p>
        <h1>{vorhanden?.name || 'Neues Postfach'}</h1>
        <p className="leise">Am besten ein eigenes Postfach oder eine Weiterleitung, z. B. <code>dms@…</code> – nicht das private Hauptpostfach. Viele Anbieter verlangen ein <strong>App-Passwort</strong>, siehe Handbuch.</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }}>
        <label className="haken"><input id="pf-aktiv" type="checkbox" checked={e.aktiv} onChange={(x) => setze({ aktiv: x.target.checked })} /><span>Abrufen</span></label>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input id="pf-name" value={e.name} maxLength={80} placeholder="z. B. Rechnungen" onChange={(x) => setze({ name: x.target.value })} /></label>
          <label className="eigenschaft"><span>Server</span><input id="pf-server" value={e.server} placeholder="imap.example.org" onChange={(x) => setze({ server: x.target.value.trim() })} /></label>
          <label className="eigenschaft"><span>Verschlüsselung</span>
            <select id="pf-verschluesselung" value={e.verschluesselung} onChange={(x) => { const v = x.target.value as PostfachEingabe['verschluesselung']; setze({ verschluesselung: v, port: PORT[v] }); }}>
              <option value="ssl">SSL/TLS (meist Port 993)</option><option value="starttls">STARTTLS (meist Port 143)</option><option value="keine">keine (unsicher)</option>
            </select></label>
          <label className="eigenschaft"><span>Port</span><input id="pf-port" type="number" min={1} max={65535} value={e.port} onChange={(x) => setze({ port: Number(x.target.value) })} /></label>
          <label className="eigenschaft"><span>Benutzername</span><input id="pf-benutzer" value={e.benutzer} autoComplete="off" onChange={(x) => setze({ benutzer: x.target.value })} /></label>
          <label className="eigenschaft"><span>Passwort <small>{vorhanden?.passwortGesetzt ? 'gespeichert – leer lassen, um es zu behalten' : 'wird verschlüsselt gespeichert'}</small></span>
            <input id="pf-passwort" type="password" autoComplete="new-password" value={e.passwort ?? ''} onChange={(x) => setze({ passwort: x.target.value })} /></label>
          <label className="eigenschaft"><span>Ordner</span><input id="pf-ordner" value={e.ordner} onChange={(x) => setze({ ordner: x.target.value })} /></label>
          <label className="eigenschaft"><span>Abrufabstand <small>in Minuten</small></span><input id="pf-abstand" type="number" min={1} max={1440} value={e.abstand} onChange={(x) => setze({ abstand: Number(x.target.value) })} /></label>
          <label className="eigenschaft"><span>Für <small>optional; steht an jeder Post</small></span>
            <select id="pf-fuer" value={e.fuer ?? ''} onChange={(x) => setze({ fuer: x.target.value || null })}>
              <option value="">– niemand –</option>
              {d.personen.filter((p) => p.aktiv !== false).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="eigenschaft"><span>Nur von diesen Absendern <small>Adressen oder Domains, durch Komma getrennt; leer = alle</small></span>
            <input id="pf-absender" value={Array.isArray(e.absender) ? e.absender.join(', ') : e.absender} placeholder="rechnung@stadtwerke.de, bank.de" onChange={(x) => setze({ absender: x.target.value })} /></label>
          <label className="eigenschaft"><span>Nach dem Übernehmen</span>
            <select id="pf-nachher" value={e.nachher} onChange={(x) => setze({ nachher: x.target.value as PostfachEingabe['nachher'] })}>
              <option value="verschieben">in einen Ordner verschieben</option><option value="gelesen">nur als gelesen markieren</option><option value="loeschen">löschen</option>
            </select></label>
          {e.nachher === 'verschieben' && <label className="eigenschaft"><span>Ordner für Übernommenes <small>wird bei Bedarf angelegt</small></span><input id="pf-zielordner" value={e.zielordner} onChange={(x) => setze({ zielordner: x.target.value })} /></label>}
        </div>
        <label className="haken"><input id="pf-anhang" type="checkbox" checked={e.nurMitAnhang} onChange={(x) => setze({ nurMitAnhang: x.target.checked })} /><span>Nur Mails mit Anhang <small className="leise">(andere bleiben unverändert im Postfach)</small></span></label>
        <label className="haken"><input id="pf-original" type="checkbox" checked={e.original} onChange={(x) => setze({ original: x.target.checked })} /><span>Original-Mail als .eml ablegen</span></label>
        {e.verschluesselung === 'keine' && vorhanden?.verschluesselung !== 'keine' && (
          <div className="hinweis schlecht"><p>Ohne Verschlüsselung gehen Passwort und Mails im Klartext über das Netz.</p>
            <label className="haken"><input id="pf-unsicher" type="checkbox" checked={bestaetigt} onChange={(x) => setBestaetigt(x.target.checked)} /><span>Trotzdem ohne Verschlüsselung verbinden</span></label></div>
        )}
        <div className="knoepfe">
          <button className="knopf primaer">Speichern</button>
          <button type="button" className="knopf" onClick={() => void testen()}>Verbindung testen</button>
          {vorhanden && <button type="button" className="knopf" onClick={() => void abrufen()}>Jetzt abrufen</button>}
          {vorhanden && <button type="button" className="knopf gefahr-rand" onClick={() => void loeschen()}>Entfernen</button>}
        </div>
      </form>
      {s && (
        <div className="blatt">
          <h2 className="h3">Stand</h2>
          <dl className="eigenschaften">
            <dt>Letzter Abruf</dt><dd>{s.letzterAbruf ? zeit(s.letzterAbruf) : '–'}</dd>
            {s.naechsterAbruf && <><dt>Nächster Versuch</dt><dd>{zeit(s.naechsterAbruf)}{s.fehlerFolge > 1 ? ` (nach ${s.fehlerFolge} Fehlern mit längerem Abstand)` : ''}</dd></>}
          </dl>
          {s.uebernommen.length > 0 && <><h3 className="h4">Zuletzt übernommen</h3>
            <ul>{s.uebernommen.map((u) => <li key={`${u.zeit}-${u.mappeId}`}>{zeit(u.zeit)}: {u.mappeId ? <Link to={`/ablage/eingang/${u.mappeId}`} className="verweis">{u.betreff || '(ohne Betreff)'}</Link> : u.betreff} <span className="leise">– {u.absender}</span></li>)}</ul></>}
          {s.fehler.length > 0 && <><h3 className="h4">Fehler</h3><ul>{s.fehler.map((f) => <li key={f.zeit}>{zeit(f.zeit)}: {f.fehler}</li>)}</ul></>}
        </div>
      )}
    </div>
  );
}
