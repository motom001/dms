import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type AnbieterEingabe, type AnbieterStand, type AnmeldeschutzStand, type SperrEinstellung, type ZweifaktorPflicht } from '../api';
import { Hilfe } from '../Hilfe';

/** Werkbank → Anmeldeschutz (#240): Fehlversuche je Konto und je IP, gesperrte IPs, Ausnahmen. */

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export function useAnmeldeschutz(offen: boolean) {
  const [stand, setStand] = useState<AnmeldeschutzStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.anmeldeschutz()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => { if (!offen) return; const t = setInterval(() => void laden(), 30_000); return () => clearInterval(t); }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type AnmeldeschutzZustand = ReturnType<typeof useAnmeldeschutz>;

export function AnmeldeschutzListe({ z }: { z: AnmeldeschutzZustand }) {
  const s = z.stand;
  return (
    <>
      <div className="listenkopf"><div><h1>Anmeldeschutz</h1><p className="leise klein">Gesperrte IP-Adressen. <Hilfe ort="werkbank.anmeldeschutz" /></p></div></div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!s ? <p className="leise">Lade …</p> : !s.gesperrt.length ? <p className="leise leerliste">Gerade ist keine Adresse gesperrt.</p> : (
        <ul className="mappenliste">
          {s.gesperrt.map((g) => (
            <li key={g.ip}><span className="eintrag werk">
              <span className="titel mono">{g.ip}</span>
              <span className="unter">seit {zeit(g.seit)} · {g.bis ? `bis ${zeit(g.bis)}` : 'bis entsperrt'}</span>
            </span></li>
          ))}
        </ul>
      )}
    </>
  );
}

export function AnmeldeschutzPanel({ z }: { z: AnmeldeschutzZustand }) {
  const s = z.stand;
  const [e, setE] = useState<(Omit<SperrEinstellung, 'ausnahmen'> & { ausnahmen: string }) | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { if (s && !e) setE({ ...s.einstellung, ausnahmen: s.einstellung.ausnahmen.join(', ') }); }, [s, e]);
  if (!s || !e) return <p className="leise">Lade …</p>;
  async function speichern() {
    try { const n = await api.anmeldeschutzSetzen({ ...e!, ausnahmen: e!.ausnahmen.split(/[\s,;]+/).filter(Boolean) }); z.setStand(n); setMeldung({ art: 'gut', text: 'Gespeichert.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function entsperren(ip: string) {
    try { z.setStand(await api.entsperren(ip)); setMeldung({ art: 'gut', text: `${ip} entsperrt.` }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const zahl = (wert: number, f: (n: number) => void, min: number, id: string) => <input id={id} type="number" min={min} value={wert} onChange={(x) => f(Number(x.target.value))} />;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Anmeldeschutz</h1>
        <p className="leise">Nach zu vielen falschen Passwörtern sperrt das DMS die Anmeldung – je E-Mail-Adresse und IP und zusätzlich je IP über alle Adressen. Sperren überstehen einen Neustart. Deine Adresse gerade: <code>{s.deineIp}</code></p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {s.gesperrt.length > 0 && (
        <div className="blatt">
          <h2 className="h3">Gesperrte Adressen</h2>
          <ul className="stapel">
            {s.gesperrt.map((g) => (
              <li key={g.ip}><strong className="mono">{g.ip}</strong> – {g.grund}; seit {zeit(g.seit)}, {g.bis ? `bis ${zeit(g.bis)}` : 'bis entsperrt'}{' '}
                <button type="button" className="knopf klein" onClick={() => void entsperren(g.ip)}>Entsperren</button></li>
            ))}
          </ul>
        </div>
      )}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }}>
        <h2 className="h3">Je E-Mail-Adresse und IP</h2>
        <div className="raster">
          <label className="eigenschaft"><span>Fehlversuche</span>{zahl(e.konto.versuche, (n) => setE({ ...e, konto: { ...e.konto, versuche: n } }), 1, 'as-konto-versuche')}</label>
          <label className="eigenschaft"><span>Sperre <small>in Minuten</small></span>{zahl(e.konto.minuten, (n) => setE({ ...e, konto: { ...e.konto, minuten: n } }), 1, 'as-konto-minuten')}</label>
        </div>
        <h2 className="h3">Je IP-Adresse, über alle E-Mail-Adressen</h2>
        <div className="raster">
          <label className="eigenschaft"><span>Fehlversuche</span>{zahl(e.ip.versuche, (n) => setE({ ...e, ip: { ...e.ip, versuche: n } }), 1, 'as-ip-versuche')}</label>
          <label className="eigenschaft"><span>Sperre <small>in Minuten, 0 = dauerhaft bis entsperrt</small></span>{zahl(e.ip.minuten, (n) => setE({ ...e, ip: { ...e.ip, minuten: n } }), 0, 'as-ip-minuten')}</label>
        </div>
        <label className="eigenschaft"><span>Nie sperren <small>Adressen oder Netze, z. B. 192.168.0.0/16 – dein Heimnetz</small></span>
          <input id="as-ausnahmen" value={e.ausnahmen} placeholder="192.168.0.0/16, 10.0.0.0/8" onChange={(x) => setE({ ...e, ausnahmen: x.target.value })} /></label>
        <h2 className="h3">Mail an die Administratoren</h2>
        <p className="leise klein">Angriffsversuche aus dem Internet sind normal; Sperren passieren automatisch. Gesperrte Adressen siehst du jederzeit hier und im Protokoll.</p>
        <label className="haken"><input id="as-mail" type="checkbox" checked={e.mail} onChange={(x) => setE({ ...e, mail: x.target.checked })} /><span>Einmal am Tag eine Sammelmeldung über die Sperren schicken
          <small className="leise">höchstens eine Mail am Tag, über die Sperren des Vortags – nicht eine je gesperrter IP</small></span></label>
        <label className="haken"><input id="as-mail-konto" type="checkbox" checked={e.mailKonto} onChange={(x) => setE({ ...e, mailKonto: x.target.checked })} /><span>Sofort melden, wenn ein Benutzerkonto gesperrt wird
          <small className="leise">nur für bestehende Konten, je Konto höchstens einmal am Tag</small></span></label>
        <div className="knoepfe"><button className="knopf primaer">Speichern</button></div>
      </form>
      <ZweifaktorPflichtBlatt />
      <AnbieterBlatt />
    </div>
  );
}

/** Zwei-Faktor-Anmeldung je Rolle vorschreiben (#242). */
function ZweifaktorPflichtBlatt() {
  const [p, setP] = useState<ZweifaktorPflicht | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { api.zweifaktorPflicht().then(setP).catch((x) => setMeldung({ art: 'schlecht', text: (x as Error).message })); }, []);
  async function setze(neu: Partial<ZweifaktorPflicht>) {
    try { setP(await api.zweifaktorPflichtSetzen(neu)); setMeldung({ art: 'gut', text: 'Gespeichert.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <div className="blatt">
      <h2 className="h3">Zwei-Faktor-Anmeldung <Hilfe ort="werkbank.zweifaktor" /></h2>
      <p className="leise">Jeder kann sie unter Profil → Sicherheit für sich einrichten. Hier schreibst du sie für eine Rolle vor: Wer sie noch nicht hat, muss sie nach der nächsten Anmeldung einrichten, bevor es weitergeht. Ein verlorenes Handy setzt du unter Benutzer zurück.</p>
      {!p ? !meldung && <p className="leise">Lade …</p> : <>
        <label className="haken"><input id="zf-admin" type="checkbox" checked={p.admin} onChange={(x) => void setze({ admin: x.target.checked })} /><span>Für Administratoren vorschreiben</span></label>
        <label className="haken"><input id="zf-mitglied" type="checkbox" checked={p.mitglied} onChange={(x) => void setze({ mitglied: x.target.checked })} /><span>Für Mitglieder vorschreiben</span></label>
      </>}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}

/** Anmeldung über einen Anbieter per OpenID Connect (#241): Entra ID, Google, Keycloak, Authentik … */
function AnbieterBlatt() {
  const [stand, setStand] = useState<AnbieterStand | null>(null);
  const [e, setE] = useState<Omit<AnbieterEingabe, 'clientSecretLoeschen'> | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const uebernehmen = (s: AnbieterStand) => { setStand(s); const { secretGesetzt: _s, rueckkehr: _r, abmeldenZurueck: _a, ...rest } = s; setE({ ...rest, clientSecret: '' }); };
  useEffect(() => { api.anbieter().then(uebernehmen).catch((x) => setMeldung({ art: 'schlecht', text: (x as Error).message })); }, []);
  async function tu(f: () => Promise<string>) {
    setSendet(true); setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  const speichern = () => tu(async () => { uebernehmen(await api.anbieterSetzen({ ...e!, clientSecret: e!.clientSecret || undefined })); return 'Gespeichert.'; });
  const pruefen = () => tu(async () => {
    uebernehmen(await api.anbieterSetzen({ ...e!, aktiv: stand!.aktiv, clientSecret: e!.clientSecret || undefined }));
    const r = await api.anbieterPruefen();
    return `Verbindung klappt: ${r.aussteller}, ${r.schluessel} ${r.schluessel === 1 ? 'Schlüssel' : 'Schlüssel'}${r.abmelden ? ', Abmelden beim Anbieter möglich' : ', ohne Abmelden beim Anbieter'}.`;
  });
  if (!stand || !e) return <div className="blatt"><h2 className="h3">Anmeldung über einen Anbieter</h2>{meldung ? <p className="fehlertext">{meldung.text}</p> : <p className="leise">Lade …</p>}</div>;
  const feld = (k: 'aussteller' | 'clientId' | 'knopf' | 'adminGruppe' | 'gruppenClaim', titel: ReactNode, platzhalter = '') => (
    <label className="eigenschaft"><span>{titel}</span><input id={`oidc-${k}`} value={e[k]} placeholder={platzhalter} onChange={(x) => setE({ ...e, [k]: x.target.value })} /></label>
  );
  return (
    <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }}>
      <h2 className="h3">Anmeldung über einen Anbieter <Hilfe ort="werkbank.anbieter" /></h2>
      <p className="leise">Anmelden mit dem Konto eines Identitätsanbieters per OpenID Connect – z. B. Microsoft Entra ID (Microsoft 365), Google Workspace, Keycloak, Authentik oder Authelia. Zugeordnet wird über die E-Mail-Adresse.</p>
      <p className="klein">Beim Anbieter als Weiterleitungs-URI eintragen: <code className="mono">{stand.rueckkehr}</code><br />
        Nach dem Abmelden zurück zu: <code className="mono">{stand.abmeldenZurueck}</code></p>
      <div className="raster">
        {feld('aussteller', <>Adresse des Anbieters <small>Issuer, z. B. https://login.microsoftonline.com/&lt;Tenant&gt;/v2.0</small></>, 'https://…')}
        {feld('clientId', 'Client-ID')}
        <label className="eigenschaft"><span>Client-Secret <small>{stand.secretGesetzt ? 'gespeichert – leer lassen, um es zu behalten' : 'leer für öffentliche Clients'}</small></span>
          <input id="oidc-secret" type="password" autoComplete="new-password" value={e.clientSecret} onChange={(x) => setE({ ...e, clientSecret: x.target.value })} /></label>
        {feld('knopf', 'Beschriftung des Knopfes')}
      </div>
      <label className="haken"><input id="oidc-anlegen" type="checkbox" checked={e.anlegen} onChange={(x) => setE({ ...e, anlegen: x.target.checked })} /><span>Unbekannte Adressen als neue Benutzer anlegen
        <small className="leise">sonst nur Benutzer, die es im DMS schon gibt</small></span></label>
      {e.anlegen && <label className="eigenschaft"><span>Systemrolle neuer Benutzer</span>
        <select id="oidc-rolle" value={e.standardrolle} onChange={(x) => setE({ ...e, standardrolle: x.target.value === 'admin' ? 'admin' : 'mitglied' })}><option value="mitglied">Mitglied</option><option value="admin">Administrator</option></select></label>}
      <div className="raster">
        {feld('adminGruppe', <>Gruppe für Administratoren <small>leer: Rollen nur im DMS pflegen</small></>, 'z. B. dms-admins oder Objekt-ID')}
        {feld('gruppenClaim', <>Claim mit den Gruppen <small>meist groups</small></>, 'groups')}
      </div>
      <label className="haken"><input id="oidc-lokal" type="checkbox" checked={e.lokalNurAdmins} onChange={(x) => setE({ ...e, lokalNurAdmins: x.target.checked })} /><span>Passwort-Anmeldung nur noch für Administratoren
        <small className="leise">als Notzugang, falls der Anbieter ausfällt</small></span></label>
      <label className="haken"><input id="oidc-abmelden" type="checkbox" checked={e.abmeldenBeimAnbieter} onChange={(x) => setE({ ...e, abmeldenBeimAnbieter: x.target.checked })} /><span>Beim Abmelden auch beim Anbieter abmelden</span></label>
      <label className="haken"><input id="oidc-aktiv" type="checkbox" checked={e.aktiv} onChange={(x) => setE({ ...e, aktiv: x.target.checked })} /><span>Eingeschaltet – Knopf auf der Anmeldeseite</span></label>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        {stand.secretGesetzt && <button type="button" className="knopf gefahr-rand" disabled={sendet} onClick={() => void tu(async () => { uebernehmen(await api.anbieterSetzen({ clientSecretLoeschen: true })); return 'Client-Secret gelöscht.'; })}>Secret löschen</button>}
        <button type="button" className="knopf" disabled={sendet || !e.aussteller} onClick={() => void pruefen()}>Verbindung prüfen</button>
        <button className="knopf primaer" disabled={sendet}>Speichern</button>
      </div>
    </form>
  );
}
