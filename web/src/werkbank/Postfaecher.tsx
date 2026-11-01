import { useCallback, useEffect, useState } from 'react';
import { api, type OAuthAnbieter, type OAuthAppEingabe, type OAuthAppsStand, type PostfachAnsicht, type PostfachEingabe } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';

/**
 * Werkbank → Postfächer (#196): Mails per IMAP abholen, jede Mail wird neue Post.
 * Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const NEU: PostfachEingabe = {
  name: '', aktiv: true, server: '', port: 993, verschluesselung: 'ssl', benutzer: '', passwort: '', ordner: 'INBOX', abstand: 5,
  fuer: null, absender: '', nachher: 'verschieben', zielordner: 'DMS', nurMitAnhang: false, original: true, anmeldung: 'passwort', anbieter: 'microsoft',
};
const PORT = { ssl: 993, starttls: 143, keine: 143 } as const;
/** OAuth 2.0 (#358): Voreinstellungen je Anbieter. */
const ANBIETER: Record<OAuthAnbieter, { name: string; server: string; geraet: boolean }> = {
  microsoft: { name: 'Microsoft 365 / Outlook.com', server: 'outlook.office365.com', geraet: true },
  google: { name: 'Gmail / Google Workspace', server: 'imap.gmail.com', geraet: false },
  andere: { name: 'anderer Anbieter', server: '', geraet: true },
};
type Meldung = { art: 'gut' | 'schlecht' | 'info'; text: string };
/** Feste Fehlercodes der Rückkehr (#358) – Text nie aus der Adresse übernehmen. */
const RUECKRUF_FEHLER: Record<string, string> = {
  abgelaufen: 'Die Anmeldung ist abgelaufen oder unbekannt. Bitte noch einmal beginnen.',
  admin: 'Die Anmeldung wurde von einem anderen Administrator begonnen.',
  browser: 'Die Anmeldung wurde in einem anderen Browser begonnen. Bitte noch einmal beginnen.',
  abgelehnt: 'Der Anbieter hat die Anmeldung abgelehnt oder sie wurde abgebrochen. Einzelheiten stehen im Protokoll.',
  ohnecode: 'Der Anbieter hat keinen Code geliefert. Bitte noch einmal beginnen.',
  tausch: 'Der Anbieter hat keine Anmeldung ausgestellt. Einzelheiten stehen im Protokoll.',
};
/** Rückruf-Adresse für „Im Browser anmelden“: https, http nur für localhost. */
const rueckrufOk = (r: string) => /^https:\/\//.test(r) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(r);
const gleicherServer = (a: Pick<PostfachEingabe, 'server' | 'port' | 'verschluesselung'>, b: Pick<PostfachEingabe, 'server' | 'port' | 'verschluesselung'>) =>
  a.server.toLowerCase() === b.server.toLowerCase() && Number(a.port) === Number(b.port) && a.verschluesselung === b.verschluesselung;

/** Meldung aus der Rückkehr vom Anbieter (?oauth=angemeldet bzw. ?oauthfehler=<Code>) – einmal zeigen, dann aus der Adresse nehmen. */
function useRueckkehr(): Meldung | undefined {
  const [m] = useState<Meldung | undefined>(() => {
    const q = new URLSearchParams(location.search);
    const f = q.get('oauthfehler');
    if (f) return { art: 'schlecht', text: `Anmeldung beim Anbieter fehlgeschlagen. ${RUECKRUF_FEHLER[f] ?? 'Einzelheiten stehen im Protokoll.'}` };
    if (q.get('oauth') === 'angemeldet') return { art: 'gut', text: 'Beim Anbieter angemeldet. Mit „Verbindung testen“ prüfen.' };
    return undefined;
  });
  useEffect(() => { if (m) history.replaceState(null, '', location.pathname); }, [m]);
  return m;
}
/** Nur die Felder des Formulars – der Stand (letzter Abruf …) ändert sich beim Abfragen. */
const alsEingabe = (v: PostfachAnsicht): PostfachEingabe => ({
  ...(Object.fromEntries(Object.keys(NEU).map((k) => [k, (v as unknown as Record<string, unknown>)[k]])) as unknown as PostfachEingabe),
  absender: v.absender.join(', '), passwort: '', anmeldung: v.anmeldung ?? 'passwort', anbieter: v.anbieter ?? 'microsoft',
});

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
  const rueckkehr = useRueckkehr();
  return (
    <>
      <div className="listenkopf"><div><h1>Postfächer</h1><p className="leise klein">Mails abholen – jede Mail wird neue Post. <Hilfe ort="werkbank.postfaecher" /></p></div>
        <Link to="/werkbank/postfaecher/neu" className="knopf gruen klein">+ Neu</Link></div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!offen && rueckkehr && <div className={`hinweis ${rueckkehr.art}`} role="status"><p>{rueckkehr.text}</p></div>}
      {!z.liste ? <p className="leise">Lade …</p> : !z.liste.length ? <p className="leise leerliste">Noch kein Postfach.</p> : (
        <ul className="mappenliste">
          {z.liste.map((p) => (
            <li key={p.id}><Link to={`/werkbank/postfaecher/${p.id}`} className={`eintrag werk ${offen === p.id ? 'an' : ''}`}>
              <span className="titel">{p.name}</span>
              <span className="unter">{p.benutzer} · {p.aktiv ? (p.stand.letzterAbruf ? `zuletzt ${zeit(p.stand.letzterAbruf)}` : 'noch nicht abgerufen') : 'aus'}</span>
              {p.oauth && p.oauth.zustand !== 'ok' ? <span className="problem">{p.oauth.zustand === 'abgelaufen' ? 'Anmeldung abgelaufen' : 'nicht angemeldet'}</span>
                : p.stand.fehlerFolge > 0 && <span className="problem">Fehler</span>}
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
  const gespeichert = vorhanden ? alsEingabe(vorhanden) : NEU;
  const [e, setE] = useState<PostfachEingabe>(gespeichert);
  const rueckkehr = useRueckkehr();
  const [meldung, setMeldung] = useState<Meldung | undefined>(rueckkehr);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(gespeichert, e, { neu: !vorhanden, liste: '/werkbank/postfaecher', zuruecksetzen: () => { setE(gespeichert); setBestaetigt(false); setMeldung(undefined); } });
  if (id !== 'neu' && !vorhanden) return z.liste ? <div className="leer"><p>Dieses Postfach gibt es nicht (mehr).</p></div> : <p className="leise">Lade …</p>;
  const setze = (x: Partial<PostfachEingabe>) => setE({ ...e, ...x });
  const eingabe = { ...e, unverschluesseltBestaetigt: bestaetigt };

  async function speichern() {
    setSendet(true);
    try {
      const l = vorhanden ? await api.postfachAendern(vorhanden.id, eingabe) : await api.postfachAnlegen(eingabe);
      z.setListe(l);
      setMeldung({ art: 'gut', text: 'Gespeichert.' });
      const n = vorhanden && l.find((p) => p.id === vorhanden.id);
      setE(n ? alsEingabe(n) : { ...e, passwort: '' });
      if (!vorhanden) { loeseWache(); geheZu(`/werkbank/postfaecher/${l[l.length - 1].id}`, true); }
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  async function testen() {
    // Gespeichertes Geheimnis nur an den gespeicherten Server (#358) – der Server lehnt es sonst ebenso ab.
    if (vorhanden && !gleicherServer(e, vorhanden) && (e.anmeldung === 'oauth' || !e.passwort)) {
      setMeldung({ art: 'schlecht', text: e.anmeldung === 'oauth'
        ? 'Server, Port oder Verschlüsselung geändert: Bitte erst speichern und dann beim Anbieter neu anmelden.'
        : 'Server, Port oder Verschlüsselung geändert: Bitte das Passwort neu eingeben – das gespeicherte geht nur an den gespeicherten Server.' });
      return;
    }
    setMeldung({ art: 'info', text: 'Verbinde …' });
    try { const r = await api.postfachTesten({ ...eingabe, id: vorhanden?.id }); setMeldung({ art: r.ok ? 'gut' : 'schlecht', text: r.text }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function abrufen() {
    if (!vorhanden) return;
    setMeldung({ art: 'info', text: 'Rufe ab …' });
    try { const r = await api.postfachAbrufen(vorhanden.id); setMeldung({ art: 'gut', text: r.uebernommen ? `${r.uebernommen} ${r.uebernommen === 1 ? 'Mail' : 'Mails'} übernommen.` : 'Keine neuen Mails.' }); await z.laden(); await d.neuLaden(); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); await z.laden(); }
  }
  async function loeschen() {
    if (!vorhanden || !(await rueckfrage({ titel: `Postfach „${vorhanden.name}“ entfernen?`, text: 'Die Mails im Postfach bleiben, wie sie sind.', ja: 'Entfernen', gefahr: true }))) return;
    try { await api.postfachLoeschen(vorhanden.id); await z.laden(); loeseWache(); geheZu('/werkbank/postfaecher'); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  const s = vorhanden?.stand;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank → Postfächer</p>
        <h1>{vorhanden?.name || 'Neues Postfach'}</h1>
        <p className="leise">Am besten ein eigenes Postfach oder eine Weiterleitung, z. B. <code>dms@…</code> – nicht das private Hauptpostfach. Viele Anbieter verlangen ein <strong>App-Passwort</strong> oder die Anmeldung per <strong>OAuth 2.0</strong>, siehe Handbuch.</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <label className="haken"><input id="pf-aktiv" type="checkbox" checked={e.aktiv} onChange={(x) => setze({ aktiv: x.target.checked })} /><span>Abrufen</span></label>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input id="pf-name" value={e.name} maxLength={80} placeholder="z. B. Rechnungen" onChange={(x) => setze({ name: x.target.value })} /></label>
          <label className="eigenschaft"><span>Server</span><input id="pf-server" value={e.server} placeholder="imap.example.org" onChange={(x) => setze({ server: x.target.value.trim() })} /></label>
          <label className="eigenschaft"><span>Verschlüsselung</span>
            <select id="pf-verschluesselung" value={e.verschluesselung} onChange={(x) => { const v = x.target.value as PostfachEingabe['verschluesselung']; setze({ verschluesselung: v, port: PORT[v] }); }}>
              <option value="ssl">SSL/TLS (meist Port 993)</option><option value="starttls">STARTTLS (meist Port 143)</option><option value="keine" disabled={e.anmeldung === 'oauth'}>keine (unsicher)</option>
            </select></label>
          <label className="eigenschaft"><span>Port</span><input id="pf-port" type="number" min={1} max={65535} value={e.port} onChange={(x) => setze({ port: Number(x.target.value) })} /></label>
          <label className="eigenschaft"><span>Anmeldung <Hilfe ort="werkbank.postfaecher.oauth" /></span>
            <select id="pf-anmeldung" value={e.anmeldung ?? 'passwort'} onChange={(x) => {
              const anmeldung = x.target.value as 'passwort' | 'oauth';
              const vor = ANBIETER[e.anbieter ?? 'microsoft'].server;
              setze({ anmeldung, ...(anmeldung === 'oauth' && vor && !e.server ? { server: vor, port: 993, verschluesselung: 'ssl' } : anmeldung === 'oauth' && e.verschluesselung === 'keine' ? { verschluesselung: 'ssl', port: 993 } : {}) });
            }}>
              <option value="passwort">Passwort (oder App-Passwort)</option><option value="oauth">OAuth 2.0 (Microsoft, Google …)</option>
            </select></label>
          {e.anmeldung === 'oauth' && <label className="eigenschaft"><span>Anbieter</span>
            <select id="pf-anbieter" value={e.anbieter ?? 'microsoft'} onChange={(x) => {
              const anbieter = x.target.value as OAuthAnbieter;
              const vor = ANBIETER[anbieter].server;
              // Server nur vorbelegen, wenn er leer ist oder noch die Voreinstellung eines anderen Anbieters trägt.
              const ersetzen = vor && (!e.server || Object.values(ANBIETER).some((a) => a.server === e.server));
              setze({ anbieter, ...(ersetzen ? { server: vor, port: 993, verschluesselung: 'ssl' } : {}) });
            }}>
              {(Object.keys(ANBIETER) as OAuthAnbieter[]).map((a) => <option key={a} value={a}>{ANBIETER[a].name}</option>)}
            </select></label>}
          <label className="eigenschaft"><span>Benutzername {e.anmeldung === 'oauth' && <small>die Mail-Adresse des Kontos</small>}</span><input id="pf-benutzer" value={e.benutzer} autoComplete="off" onChange={(x) => setze({ benutzer: x.target.value })} /></label>
          {e.anmeldung !== 'oauth' && <label className="eigenschaft"><span>Passwort <small>{vorhanden?.passwortGesetzt ? (gleicherServer(e, vorhanden) ? 'gespeichert – leer lassen, um es zu behalten' : 'Server geändert – bitte neu eingeben') : 'wird verschlüsselt gespeichert'}</small></span>
            <input id="pf-passwort" type="password" autoComplete="new-password" value={e.passwort ?? ''} onChange={(x) => setze({ passwort: x.target.value })} /></label>}
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
          <button type="button" className="knopf" onClick={() => void testen()}>Verbindung testen</button>
          {vorhanden && <button type="button" className="knopf" disabled={ent.geaendert} title={ent.geaendert ? 'Erst speichern' : undefined} onClick={() => void abrufen()}>Jetzt abrufen</button>}
        </div>
        <Speicherleiste ent={ent} gegenstand="Postfach" sendet={sendet}
          links={vorhanden && <button type="button" className="textknopf gefahr" onClick={() => void loeschen()}>Postfach entfernen</button>} />
      </form>
      {e.anmeldung === 'oauth' && <OAuthBereich anbieter={e.anbieter ?? 'microsoft'} postfach={vorhanden?.anmeldung === 'oauth' ? vorhanden : undefined} geaendert={ent.geaendert} z={z} setMeldung={setMeldung} />}
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

/**
 * OAuth 2.0 (#358): App-Registrierung des Anbieters (je Installation) und Anmeldung des Postfachs –
 * im Browser (Autorisierungscode mit PKCE) oder mit Gerätecode. Token sieht die Oberfläche nie.
 */
function OAuthBereich({ anbieter, postfach, geaendert, z, setMeldung }: { anbieter: OAuthAnbieter; postfach?: PostfachAnsicht; geaendert: boolean; z: PostfachZustand; setMeldung: (m: Meldung | undefined) => void }) {
  const [stand, setStand] = useState<OAuthAppsStand>();
  const appAus = (st: OAuthAppsStand | undefined): OAuthAppEingabe => {
    const a = st?.apps[anbieter];
    return { clientId: a?.clientId ?? '', clientSecret: '', tenant: a?.tenant ?? (anbieter === 'microsoft' ? 'common' : ''), autorisierung: a?.autorisierung ?? '', token: a?.token ?? '', geraet: a?.geraet ?? '', bereich: a?.bereich ?? '' };
  };
  const appGespeichert = appAus(stand);
  const [app, setApp] = useState<OAuthAppEingabe>(appGespeichert);
  const [sendet, setSendet] = useState(false);
  // App-Registrierung (#370): eigenes Formular mit Speicherleiste; gilt für alle Postfächer dieses Anbieters.
  const appEnt = useEntwurf(appGespeichert, app, { neu: !stand?.apps[anbieter], aus: !stand, zuruecksetzen: () => setApp(appGespeichert) });
  const [geraet, setGeraet] = useState<{ code: string; adresse: string; bis: string; intervall: number }>();
  useEffect(() => {
    void api.postfachOAuthApps().then((st) => { setStand(st); setApp(appAus(st)); })
      .catch((x) => setMeldung({ art: 'schlecht', text: (x as Error).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appAus hängt nur am Anbieter
  }, [anbieter, setMeldung]);
  // Gerätecode: im angegebenen Abstand nachfragen, bis angemeldet, abgelehnt oder abgelaufen.
  const neuLaden = z.laden;
  const postfachId = postfach?.id;
  useEffect(() => {
    if (!geraet || !postfachId) return;
    let aus = false;
    const t = setInterval(() => {
      if (aus) return;
      if (Date.parse(geraet.bis) < Date.now()) { setGeraet(undefined); setMeldung({ art: 'schlecht', text: 'Der Gerätecode ist abgelaufen. Bitte neu anfordern.' }); return; }
      void api.postfachOAuthGeraetPruefen(postfachId).then(async (r) => {
        if (r.fertig && !aus) { aus = true; setGeraet(undefined); setMeldung({ art: 'gut', text: 'Beim Anbieter angemeldet. Mit „Verbindung testen“ prüfen.' }); await neuLaden(); }
      }).catch((x) => { aus = true; setGeraet(undefined); setMeldung({ art: 'schlecht', text: (x as Error).message }); });
    }, Math.max(geraet.intervall, 2) * 1000);
    return () => { aus = true; clearInterval(t); };
  }, [geraet, postfachId, setMeldung, neuLaden]);

  const gespeichert = stand?.apps[anbieter];
  async function appSpeichern() {
    setSendet(true);
    try { const st = await api.postfachOAuthApp(anbieter, app); setStand(st); setApp(appAus(st)); setMeldung({ art: 'gut', text: 'App gespeichert.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  async function imBrowser() {
    if (!postfach) return;
    try {
      const { url } = await api.postfachOAuthStart(postfach.id);
      if (!/^https?:\/\//.test(url)) throw new Error('Unerwartete Adresse des Anbieters.');
      location.assign(url);
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function mitGeraetecode() {
    if (!postfach) return;
    try { setGeraet(await api.postfachOAuthGeraet(postfach.id)); setMeldung(undefined); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function abmelden() {
    if (!postfach || !(await rueckfrage({ titel: 'Anmeldung entfernen?', text: 'Das DMS löscht die gespeicherten Token und holt bis zur neuen Anmeldung keine Mails aus diesem Postfach ab.', ja: 'Abmelden', gefahr: true }))) return;
    try { z.setListe(await api.postfachOAuthAbmelden(postfach.id)); setMeldung({ art: 'gut', text: 'Abgemeldet.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  const o = postfach?.oauth;
  const zeitpunkt = (iso: string | null) => (iso ? zeit(iso) : '–');
  return (
    <div className="blatt">
      <h2 className="h3">Anmeldung per OAuth 2.0 <Hilfe ort="werkbank.postfaecher.oauth" /></h2>
      {anbieter === 'google' && <div className="hinweis"><p><strong>Privates Gmail-Konto?</strong> Dann ist ein <strong>App-Passwort</strong> einfacher. Eine eigene Google-App im Status „Test“ muss alle 7 Tage neu angemeldet werden; ohne diese Grenze geht es nur innerhalb von Google Workspace („intern“) oder nach Googles Prüfung.</p></div>}
      <form onSubmit={(x) => { x.preventDefault(); void appSpeichern(); }} onKeyDown={appEnt.tasten}>
      <h3 className="h4">App beim Anbieter <small className="leise">gilt für alle Postfächer dieses Anbieters</small></h3>
      <div className="raster">
        <label className="eigenschaft"><span>Client-ID <small>Anwendungs-ID</small></span><input id="pf-oauth-client" value={app.clientId} autoComplete="off" onChange={(x) => setApp({ ...app, clientId: x.target.value })} /></label>
        <label className="eigenschaft"><span>Client-Geheimnis <small>{gespeichert?.secretGesetzt ? 'gespeichert – leer lassen, um es zu behalten' : 'wird verschlüsselt gespeichert; leer bei öffentlichen Clients'}</small></span>
          <input id="pf-oauth-geheimnis" type="password" autoComplete="new-password" value={app.clientSecret ?? ''} onChange={(x) => setApp({ ...app, clientSecret: x.target.value })} /></label>
        {anbieter === 'microsoft' && <label className="eigenschaft"><span>Mandant (Tenant) <small>common, consumers (nur Outlook.com), organizations oder Tenant-ID</small></span><input id="pf-oauth-tenant" value={app.tenant ?? ''} onChange={(x) => setApp({ ...app, tenant: x.target.value.trim() })} /></label>}
        {anbieter === 'andere' && <>
          <label className="eigenschaft"><span>Autorisierungs-Endpunkt</span><input id="pf-oauth-autorisierung" value={app.autorisierung ?? ''} placeholder="https://…/authorize" onChange={(x) => setApp({ ...app, autorisierung: x.target.value.trim() })} /></label>
          <label className="eigenschaft"><span>Token-Endpunkt</span><input id="pf-oauth-token" value={app.token ?? ''} placeholder="https://…/token" onChange={(x) => setApp({ ...app, token: x.target.value.trim() })} /></label>
          <label className="eigenschaft"><span>Gerätecode-Endpunkt <small>optional</small></span><input id="pf-oauth-geraet" value={app.geraet ?? ''} onChange={(x) => setApp({ ...app, geraet: x.target.value.trim() })} /></label>
          <label className="eigenschaft"><span>Bereich (Scope) <small>mit Leerzeichen getrennt, meist samt offline_access</small></span><input id="pf-oauth-bereich" value={app.bereich ?? ''} onChange={(x) => setApp({ ...app, bereich: x.target.value })} /></label>
        </>}
      </div>
      <p className="leise klein">Umleitungs-URI für die App: {stand?.rueckruf ? <><code>{stand.rueckruf}</code>{!rueckrufOk(stand.rueckruf) && ' – ohne https geht die Anmeldung im Browser nicht (außer über localhost)'}</> : <>erst nach Eintrag der Adresse unter <Link to="/werkbank/betrieb" className="verweis">E-Mail und Adresse</Link>{ANBIETER[anbieter].geraet ? ' – oder mit Gerätecode anmelden' : ''}</>}</p>
      <Speicherleiste ent={appEnt} gegenstand="App" sendet={sendet} />
      </form>

      <h3 className="h4">Postfach anmelden</h3>
      {!postfach || geaendert ? <p className="leise">Erst das Postfach speichern, dann hier beim Anbieter anmelden.</p> : (
        <>
          <dl className="eigenschaften">
            <dt>Zustand</dt><dd>{o?.zustand === 'ok' ? `angemeldet am ${zeitpunkt(o.angemeldetAm)}${o.von ? ` von ${o.von}` : ''}` : o?.zustand === 'abgelaufen' ? <strong>abgelaufen oder entzogen – bitte neu anmelden</strong> : 'nicht angemeldet'}</dd>
            {o?.fehler && <><dt>Grund</dt><dd>{o.fehler}</dd></>}
          </dl>
          {geraet && <div className="hinweis info" role="status"><p>Öffne <a href={geraet.adresse} target="_blank" rel="noreferrer noopener" className="verweis">{geraet.adresse} ↗</a> auf einem beliebigen Gerät und gib diesen Code ein: <strong className="mono">{geraet.code}</strong>. Gültig bis {zeit(geraet.bis)}. Diese Seite wartet, bis du dich angemeldet hast.</p></div>}
          <div className="knoepfe">
            <button type="button" className="knopf primaer" disabled={!gespeichert?.clientId || !stand?.rueckruf || !rueckrufOk(stand.rueckruf) || appEnt.geaendert} title={!stand?.rueckruf ? 'Ohne Adresse des DMS nur mit Gerätecode' : !rueckrufOk(stand.rueckruf) ? 'Nur mit https-Adresse des DMS – sonst mit Gerätecode' : appEnt.geaendert ? 'Erst die App speichern' : undefined} onClick={() => void imBrowser()}>Im Browser anmelden</button>
            {ANBIETER[anbieter].geraet && <button type="button" className="knopf" disabled={!gespeichert?.clientId || !!geraet || appEnt.geaendert} onClick={() => void mitGeraetecode()}>Mit Gerätecode anmelden</button>}
            {o && o.zustand !== 'abgemeldet' && <button type="button" className="knopf gefahr-rand" onClick={() => void abmelden()}>Abmelden</button>}
          </div>
        </>
      )}
    </div>
  );
}
