import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type BetriebAnsicht, type MailEingabe, type Probe, type Verbindung } from '../api';
import { useKonto } from '../konto';
import { Link, useUngespeichert } from '../ort';
import { Hilfe } from '../Hilfe';

/**
 * E-Mail-Versand und Adresse des DMS (#37) – früher Umgebungsvariablen (SMTP_*, APP_URL),
 * jetzt hier gepflegt, sofort wirksam und testbar.
 */
export function useBetrieb() {
  const [stand, setStand] = useState<BetriebAnsicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.betrieb()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  return { stand, setStand, fehler, laden };
}
export type BetriebZustand = ReturnType<typeof useBetrieb>;

export function BetriebListe({ b }: { b: BetriebZustand }) {
  const s = b.stand;
  return (
    <>
      <div className="listenkopf"><div><h1>E-Mail und Adresse</h1><p className="leise klein">Wie das DMS E-Mails verschickt und unter welcher Adresse es erreichbar ist. <Hilfe ort="werkbank.betrieb" /></p></div></div>
      {s && (
        <ul className="mappenliste">
          <li><a className="eintrag werk" href="#adresse"><span className="titel">Adresse des DMS</span><span className="unter">{s.adresse || 'nicht gepflegt – Adresse der Anfrage'}</span></a></li>
          <li><a className="eintrag werk" href="#mail">
            <span className="titel">E-Mail-Versand</span>
            <span className="unter">{s.mail.aktiv ? `über ${s.mail.host}` : 'aus – Links werden zum Kopieren angezeigt'}</span>
            {s.mail.aktiv ? <span><span className="chip gut">aktiv</span></span> : <span><span className="chip">aus</span></span>}
          </a></li>
        </ul>
      )}
    </>
  );
}

export function BetriebPanel({ b }: { b: BetriebZustand }) {
  useEffect(() => { void b.laden(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (b.fehler) return <div className="hinweis schlecht"><p>{b.fehler}</p></div>;
  if (!b.stand) return <p className="leise">Lade …</p>;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>E-Mail und Adresse</h1>
        <p className="leise">Änderungen gelten sofort, ohne Neustart.</p>
      </div>
      <Adresse b={b} />
      <Mail key={JSON.stringify(b.stand.mail)} b={b} />
    </div>
  );
}

function Adresse({ b }: { b: BetriebZustand }) {
  const s = b.stand!;
  const [adresse, setAdresse] = useState(s.adresse);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const geaendert = adresse.trim() !== s.adresse;
  async function speichern(ev?: FormEvent, wert = adresse) {
    ev?.preventDefault();
    try { const n = await api.adresseSpeichern(wert); b.setStand(n); setAdresse(n.adresse); setMeldung({ art: 'gut', text: n.adresse ? 'Gespeichert.' : 'Keine Adresse gepflegt – Links nutzen die Adresse der Anfrage.' }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <form className="blatt" id="adresse" onSubmit={speichern}>
      <h2 className="h3">Adresse des DMS</h2>
      <p className="leise">Unter dieser Adresse öffnen die Benutzer das DMS. Sie steht in den Links der E-Mails (Einladungen, Passwort vergessen). Beginnt sie mit <span className="mono">https://</span>, gilt die Anmeldung nur noch über HTTPS.</p>
      <label className="eigenschaft"><span>Adresse <small>z. B. http://nas.local:8080 oder https://dms.example.org</small></span>
        <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder={s.vorschlag ?? 'http://nas.local:8080'} inputMode="url" autoComplete="off" /></label>
      {!s.adresse && (
        <div className="hinweis info"><p>Noch keine Adresse gepflegt. Bis dahin nimmt das DMS die Adresse, unter der es gerade aufgerufen wird{s.vorschlag ? <> – hier <span className="mono">{s.vorschlag}</span></> : ''}.</p>
          {s.vorschlag && <button type="button" className="knopf klein" onClick={() => { setAdresse(s.vorschlag!); void speichern(undefined, s.vorschlag!); }}>Diese Adresse übernehmen</button>}
        </div>
      )}
      {s.adresse.startsWith('https://') && s.vorschlag?.startsWith('http://') && (
        <div className="hinweis warn"><p>Du rufst das DMS gerade über HTTP auf, die Adresse ist aber HTTPS. Nach der nächsten Anmeldung geht das nur noch über HTTPS. Läuft ein Reverse-Proxy davor, muss <span className="mono">TRUST_PROXY</span> gesetzt sein.</p></div>
      )}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe"><button className="knopf primaer" disabled={!geaendert}>Adresse speichern</button></div>
    </form>
  );
}

function Mail({ b }: { b: BetriebZustand }) {
  const { ich, aktualisieren } = useKonto();
  const s = b.stand!;
  const start = (): MailEingabe & { passwort: string } => ({
    aktiv: s.mail.aktiv, host: s.mail.host, port: s.mail.port, verbindung: s.mail.verbindung,
    benutzer: s.mail.benutzer, absender: s.mail.absender, selbstsigniert: s.mail.selbstsigniert, passwort: '',
  });
  const [m, setM] = useState(start);
  const [loeschen, setLoeschen] = useState(false);
  const [an, setAn] = useState(ich.email);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [probe, setProbe] = useState<Probe & { was: string }>();
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const geaendert = JSON.stringify({ ...m, passwort: '' }) !== JSON.stringify({ ...start(), passwort: '' }) || !!m.passwort || loeschen;
  useUngespeichert(geaendert);
  const setze = (p: Partial<typeof m>) => { setM((x) => ({ ...x, ...p })); setMeldung(undefined); };
  const eingabe = (): MailEingabe => ({ ...m, passwortLoeschen: loeschen || undefined });

  async function speichern(ev: FormEvent) {
    ev.preventDefault();
    setLaeuft('speichern');
    try { b.setStand(await api.mailSpeichern(eingabe())); await aktualisieren(); setMeldung({ art: 'gut', text: 'Gespeichert – gilt ab sofort.' }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(null); }
  }
  async function teste(was: 'pruefen' | 'testmail') {
    setLaeuft(was); setProbe(undefined);
    try { setProbe({ ...(was === 'pruefen' ? await api.mailPruefen(eingabe()) : await api.testmail(eingabe(), an)), was }); }
    catch (x) { setProbe({ ok: false, meldung: (x as Error).message, was }); }
    finally { setLaeuft(null); }
  }
  const portFuer = (v: Verbindung) => (v === 'ssl' ? 465 : v === 'starttls' ? 587 : 25);

  return (
    <form className="blatt" id="mail" onSubmit={speichern} noValidate>
      <h2 className="h3">E-Mail-Versand</h2>
      <p className="leise">Für Einladungen, „Passwort vergessen“ und Hinweise bei geänderter E-Mail-Adresse oder geändertem Passwort. Ohne E-Mail-Versand zeigt die Benutzerverwaltung die Links zum Kopieren an.</p>
      <label className="haken"><input type="checkbox" checked={m.aktiv} onChange={(e) => setze({ aktiv: e.target.checked })} /><span>E-Mails verschicken</span></label>
      <div className="raster">
        <label className="eigenschaft"><span>Server <small>z. B. smtp.example.org</small></span><input value={m.host} onChange={(e) => setze({ host: e.target.value })} autoComplete="off" spellCheck={false} /></label>
        <label className="eigenschaft"><span>Verbindungsart</span>
          <select value={m.verbindung} onChange={(e) => { const v = e.target.value as Verbindung; setze({ verbindung: v, port: m.port === portFuer(m.verbindung) ? portFuer(v) : m.port }); }}>
            {(Object.entries(s.verbindungen) as Array<[Verbindung, string]>).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="eigenschaft"><span>Port</span><input type="number" min={1} max={65535} value={m.port} onChange={(e) => setze({ port: Number(e.target.value) })} /></label>
        <label className="eigenschaft"><span>Benutzer <small>leer = ohne Anmeldung</small></span><input value={m.benutzer} onChange={(e) => setze({ benutzer: e.target.value })} autoComplete="off" spellCheck={false} /></label>
        <label className="eigenschaft"><span>Passwort <small>{s.mail.passwortGesetzt && !loeschen ? 'gesetzt – leer lassen, um es zu behalten' : 'nicht gesetzt'}</small></span>
          <input type="password" value={m.passwort} disabled={!s.passwoerterMoeglich} onChange={(e) => { setze({ passwort: e.target.value }); setLoeschen(false); }} autoComplete="new-password" placeholder={s.mail.passwortGesetzt && !loeschen ? '••••••••' : ''} /></label>
        <label className="eigenschaft"><span>Absender <small>z. B. DMS &lt;dms@example.org&gt;; leer = Benutzer</small></span><input value={m.absender} onChange={(e) => setze({ absender: e.target.value })} autoComplete="off" spellCheck={false} /></label>
      </div>
      {s.mail.passwortGesetzt && <label className="haken"><input type="checkbox" checked={loeschen} onChange={(e) => { setLoeschen(e.target.checked); if (e.target.checked) setze({ passwort: '' }); }} /><span>Gespeichertes Passwort entfernen</span></label>}
      <label className="haken"><input type="checkbox" checked={m.selbstsigniert} onChange={(e) => setze({ selbstsigniert: e.target.checked })} />
        <span>Selbstsigniertes Zertifikat erlauben<small className="hilfe">Nur für einen eigenen Mailserver im Heimnetz; sonst ausgeschaltet lassen.</small></span></label>
      {!s.passwoerterMoeglich
        ? <div className="hinweis warn"><p>Ein Passwort lässt sich erst speichern, wenn es einen Schlüssel gibt. <Link to="/werkbank/verschluesselung" className="verweis">Schlüssel unter „Verschlüsselung“ erzeugen</Link>.{s.mail.passwortUnverschluesselt ? ' Das bisher gespeicherte Passwort liegt noch unverschlüsselt in der Datenbank.' : ''}</p></div>
        : !s.mail.passwortLesbar
          ? <div className="hinweis schlecht"><p>Das gespeicherte Passwort wurde mit einem anderen, nicht mehr vorhandenen Schlüssel verschlüsselt und ist nicht lesbar. Bitte neu eingeben.</p></div>
          : <p className="leise klein">Das Passwort wird verschlüsselt gespeichert. Den Schlüssel dazu hält das DMS in einer eigenen Datei, nicht in der Datenbank.</p>}

      <h3 className="zwischen">Testen – mit den Werten oben, auch ungespeichert</h3>
      <div className="raster">
        <label className="eigenschaft"><span>Testmail an</span><input type="email" value={an} onChange={(e) => setAn(e.target.value)} /></label>
        <div className="eigenschaft unten"><div className="knoepfe">
          <button type="button" className="knopf" disabled={!!laeuft || !m.host} onClick={() => void teste('pruefen')}>{laeuft === 'pruefen' ? 'Prüfe …' : 'Verbindung prüfen'}</button>
          <button type="button" className="knopf" disabled={!!laeuft || !m.host || !an} onClick={() => void teste('testmail')}>{laeuft === 'testmail' ? 'Sende …' : 'Testmail senden'}</button>
        </div></div>
      </div>
      {probe && <div className={`hinweis ${probe.ok ? 'gut' : 'schlecht'}`} role="status"><p>{probe.meldung}</p></div>}

      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        {geaendert && <button type="button" className="knopf" onClick={() => { setM(start()); setLoeschen(false); setMeldung(undefined); }}>Änderungen verwerfen</button>}
        <button className="knopf primaer" disabled={!geaendert || laeuft === 'speichern'}>{laeuft === 'speichern' ? 'Speichere …' : 'E-Mail-Einstellungen speichern'}</button>
      </div>
    </form>
  );
}
