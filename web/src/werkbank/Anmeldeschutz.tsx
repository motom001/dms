import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Knopf, type KnopfErgebnis } from '../bausteine';
import { api, type AnbieterEingabe, type AnbieterStand, type AnmeldeschutzStand, type NotfallzugangStand, type SperrEinstellung, type ZweifaktorPflicht } from '../api';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto';
import { geheZu, Link } from '../ort';
import { t, tn } from '../sprache';
import { rueckfrage } from '../rueckfrage';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { gebietsschema } from '../../../shared/src/sprache';
import { NOTFALLBLATT_SEITE } from '../../../shared/src/werkbankansicht';
import { Kopf } from './Kopf';

/** Werkbank → Anmeldeschutz (#240): Fehlversuche je Konto und je IP, gesperrte IPs, Ausnahmen. */

type SperrFormular = Omit<SperrEinstellung, 'ausnahmen'> & { ausnahmen: string };
const sperrFormular = (s: SperrEinstellung): SperrFormular => ({ ...s, ausnahmen: s.ausnahmen.join(', ') });

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

export function useAnmeldeschutz(offen: boolean) {
  const [stand, setStand] = useState<AnmeldeschutzStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.anmeldeschutz()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => { if (!offen) return; const timer = setInterval(() => void laden(), 30_000); return () => clearInterval(timer); }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type AnmeldeschutzZustand = ReturnType<typeof useAnmeldeschutz>;

export function AnmeldeschutzPanel({ z }: { z: AnmeldeschutzZustand }) {
  const s = z.stand;
  const [e, setE] = useState<SperrFormular | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (s && !e) setE(sperrFormular(s.einstellung)); }, [s, e]);
  const gespeichert = s ? sperrFormular(s.einstellung) : null;
  const ent = useEntwurf(gespeichert, e, { aus: !e, zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); } });
  if (!s || !e) return <p className="leise">{z.fehler ?? t('werkbank.anmeldeschutz.lade')}</p>;
  async function speichern() {
    setSendet(true);
    try { const n = await api.anmeldeschutzSetzen({ ...e!, ausnahmen: e!.ausnahmen.split(/[\s,;]+/).filter(Boolean) }); z.setStand(n); setE(sperrFormular(n.einstellung)); setMeldung({ art: 'gut', text: t('werkbank.anmeldeschutz.gespeichert') }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  async function entsperren(ip: string) {
    try { z.setStand(await api.entsperren(ip)); setMeldung({ art: 'gut', text: t('werkbank.anmeldeschutz.freigegeben', { ip }) }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const zahl = (wert: number, f: (n: number) => void, min: number, id: string) => <input id={id} type="number" min={min} value={wert} onChange={(x) => f(Number(x.target.value))} />;
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.anmeldeschutz.anmeldeschutz')} ueber={t('werkbank.anmeldeschutz.werkbank')} hilfe="werkbank.anmeldeschutz">
        <p className="leise">{tn('werkbank.anmeldeschutz.nach-zu-vielen-falschen', { code: <code>{s.deineIp}</code> })}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <h2 className="h3">{t('werkbank.anmeldeschutz.je-e-mail-adresse')}</h2>
        <div className="raster">
          <label className="eigenschaft"><span>{t('werkbank.anmeldeschutz.fehlversuche')}</span>{zahl(e.konto.versuche, (n) => setE({ ...e, konto: { ...e.konto, versuche: n } }), 1, 'as-konto-versuche')}</label>
          <label className="eigenschaft"><span>{tn('werkbank.anmeldeschutz.sperre', { klein: <small>{t('werkbank.anmeldeschutz.in-minuten')}</small> })}</span>{zahl(e.konto.minuten, (n) => setE({ ...e, konto: { ...e.konto, minuten: n } }), 1, 'as-konto-minuten')}</label>
        </div>
        <h2 className="h3">{t('werkbank.anmeldeschutz.je-ip-adresse-ueber')}</h2>
        <div className="raster">
          <label className="eigenschaft"><span>{t('werkbank.anmeldeschutz.fehlversuche')}</span>{zahl(e.ip.versuche, (n) => setE({ ...e, ip: { ...e.ip, versuche: n } }), 1, 'as-ip-versuche')}</label>
          <label className="eigenschaft"><span>{tn('werkbank.anmeldeschutz.sperre', { klein: <small>{t('werkbank.anmeldeschutz.in-minuten-0-dauerhaft')}</small> })}</span>{zahl(e.ip.minuten, (n) => setE({ ...e, ip: { ...e.ip, minuten: n } }), 0, 'as-ip-minuten')}</label>
        </div>
        <label className="eigenschaft"><span>{tn('werkbank.anmeldeschutz.nie-sperren', { klein: <small>{t('werkbank.anmeldeschutz.adressen-oder-netze-z')}</small> })}</span>
          <input id="as-ausnahmen" value={e.ausnahmen} placeholder="192.168.0.0/16, 10.0.0.0/8" onChange={(x) => setE({ ...e, ausnahmen: x.target.value })} /></label>
        <h2 className="h3">{t('konten.verwaltende.anmeldeschutz.mail')}</h2>
        <p className="leise klein">{t('werkbank.anmeldeschutz.angriffsversuche-aus-dem-internet')}</p>
        {/* #678: Sammelmeldung und Sofortmeldung sind jetzt Automatisierungen (Paket „Benachrichtigungen“). */}
        <div className="hinweis info hinweiszeile"><p>{t('werkbank.anmeldeschutz.automatisierung')}</p><Link to="/werkbank/automatisierungen" className="knopf klein">{t('werkbank.zusammenfassung.automatisierung.knopf')}</Link></div>
        <Speicherleiste ent={ent} gegenstand={t('werkbank.anmeldeschutz.anmeldeschutz')} sendet={sendet} />
      </form>
      <ZweifaktorPflichtBlatt />
      <AnbieterBlatt />
      <NotfallzugangBlatt deineIp={s.deineIp} />
      {/* #366: früher die mittlere Spalte; ganz unten, mit fester Höhe – bei Dauerangriffen kommen viele zusammen. */}
      <div className="blatt" id="gesperrt">
        <h2 className="h3">{t('werkbank.anmeldeschutz.gesperrte-adressen')}{s.gesperrt.length > 0 && <> <span className="chip">{s.gesperrt.length}</span></>}</h2>
        {!s.gesperrt.length ? <p className="leise">{t('werkbank.anmeldeschutz.gerade-ist-keine-adresse')}</p> : (
          <ul className="sitzungsliste festhoehe">
            {s.gesperrt.map((g) => (
              <li key={g.ip}>
                <span><strong className="mono">{g.ip}</strong> <span className="leise klein">{t('werkbank.anmeldeschutz.seit', { grund: g.grund, zeit: zeit(g.seit), wert: g.bis ? t('werkbank.anmeldeschutz.bis', { zeit: zeit(g.bis) }) : t('werkbank.anmeldeschutz.bis-entsperrt') })}</span></span>
                <button type="button" className="knopf klein" onClick={() => void entsperren(g.ip)}>{t('werkbank.anmeldeschutz.freigeben')}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Notfallzugang mit dem Notfallcode vom Notfallblatt (#815): Vorgabe „nur aus dem Heimnetz“. Aus dem Internet erlauben
 * ist eine heikle Handlung (frische Anmeldung) und kommt mit Warnung.
 */
function NotfallzugangBlatt({ deineIp }: { deineIp: string }) {
  const [n, setN] = useState<NotfallzugangStand | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { api.notfallzugang().then(setN).catch((x) => setMeldung({ art: 'schlecht', text: (x as Error).message })); }, []);
  async function setze(internet: boolean) {
    if (internet && !(await rueckfrage({ titel: t('werkbank.notfallzugang.frage'), text: t('werkbank.notfallzugang.frage.text'), ja: t('werkbank.notfallzugang.frage.ja'), gefahr: true }))) return;
    setSendet(true); setMeldung(undefined);
    try { setN(await api.notfallzugangSetzen(internet)); setMeldung({ art: 'gut', text: t('werkbank.notfallzugang.gespeichert') }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  return (
    <div className="blatt" id="notfallzugang">
      <h2 className="h3">{t('werkbank.notfallzugang.titel')} <Hilfe ort="werkbank.notfallzugang" /></h2>
      <p className="leise">{t('werkbank.notfallzugang.text')}</p>
      {/* Das Notfallblatt mit dem Code steht unter Verschlüsselung (#993). */}
      {n && <p className="klein">{n.code.vorhanden && n.code.erstellt ? t('werkbank.notfallzugang.code', { datum: zeit(n.code.erstellt) }) : t('werkbank.notfallzugang.code.keiner')}{' '}
        <Link to={NOTFALLBLATT_SEITE} className="verweis">{t('werkbank.sicherung.zum-notfallblatt')}</Link></p>}
      {n && <>
        <label className="haken"><input id="notfall-internet" type="checkbox" checked={n.internet} disabled={sendet} onChange={(x) => void setze(x.target.checked)} />
          <span>{t('werkbank.notfallzugang.internet')}<small className="hilfe">{t('werkbank.notfallzugang.internet.hilfe')}</small></span></label>
        {n.internet && <div className="hinweis warn"><p>{t('werkbank.notfallzugang.internet.warnung')}</p></div>}
        {n.internet && n.von && n.am && <p className="leise klein">{t('werkbank.notfallzugang.internet.von', { von: n.von, am: zeit(n.am) })}</p>}
        {!n.heimnetz && !n.internet && <>
          <p className="leise klein">{t('werkbank.notfallzugang.nicht-heimnetz')}</p>
          {/* #885: welche Adresse Ablago sieht und warum es „nicht Heimnetz“ meint – mit Weg zur Abhilfe. */}
          <p className="leise klein" id="notfall-grund">{n.grund === 'proxy'
            ? tn('werkbank.notfallzugang.grund.proxy', { code: <code>{deineIp}</code>, hilfe: <Hilfe ort="werkbank.notfallzugang.proxy" /> })
            : tn('werkbank.notfallzugang.grund.oeffentlich', { code: <code>{deineIp}</code>, hilfe: <Hilfe ort="werkbank.notfallzugang.oeffentlich" /> })}</p>
        </>}
      </>}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}

/** Zwei-Faktor-Anmeldung je Rolle vorschreiben (#242). */
function ZweifaktorPflichtBlatt() {
  const { ich, zweifaktor, aktualisieren } = useKonto();
  const [p, setP] = useState<ZweifaktorPflicht | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { api.zweifaktorPflicht().then(setP).catch((x) => setMeldung({ art: 'schlecht', text: (x as Error).message })); }, []);
  async function setze(neu: Partial<ZweifaktorPflicht>) {
    if (!p) return;
    // #416: Pflicht für die eigene Rolle ohne eigenes Zwei-Faktor – vorher fragen, mit Weg zur Einrichtung.
    if (neu[ich.rolle] && !p[ich.rolle] && !zweifaktor.aktiv) {
      const trotzdem = await rueckfrage({
        titel: t('werkbank.anmeldeschutz.selbst-noch-ohne-zwei'),
        text: <>{tn('werkbank.anmeldeschutz.du-hast-die-zwei', { b: <strong>{t('werkbank.anmeldeschutz.naechsten-anmeldung')}</strong>, code: <code>{t('werkbank.anmeldeschutz.dms-zweifaktor-zuruecksetzen')}</code> })}</>,
        ja: t('werkbank.anmeldeschutz.trotzdem-vorschreiben'), nein: t('werkbank.anmeldeschutz.jetzt-einrichten'), gefahr: true,
      });
      if (!trotzdem) { geheZu('/profil/sicherheit'); return; }
    }
    // Sofort sichtbar; bei einem Fehler zurück auf den gespeicherten Stand.
    const alt = p;
    setP({ ...p, ...neu }); setSendet(true); setMeldung(undefined);
    try { setP(await api.zweifaktorPflichtSetzen(neu)); setMeldung({ art: 'gut', text: t('werkbank.anmeldeschutz.gespeichert') }); void aktualisieren(); }
    catch (x) { setP(alt); setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setSendet(false); }
  }
  return (
    <div className="blatt">
      <h2 className="h3">{t('werkbank.anmeldeschutz.zwei-faktor-anmeldung')} <Hilfe ort="werkbank.zweifaktor" /></h2>
      <p className="leise">{t('werkbank.anmeldeschutz.jeder-kann-sie-unter')}</p>
      {!p ? !meldung && <p className="leise">{t('werkbank.anmeldeschutz.lade')}</p> : <>
        <label className="haken"><input id="zf-admin" type="checkbox" checked={p.admin} disabled={sendet} onChange={(x) => void setze({ admin: x.target.checked })} /><span>{t('konten.verwaltende.zweifaktor.pflicht')}</span></label>
        <label className="haken"><input id="zf-mitglied" type="checkbox" checked={p.mitglied} disabled={sendet} onChange={(x) => void setze({ mitglied: x.target.checked })} /><span>{t('werkbank.anmeldeschutz.fuer-mitglieder-vorschreiben')}</span></label>
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
  const alsFormular = (s: AnbieterStand) => { const { secretGesetzt: _s, rueckkehr: _r, abmeldenZurueck: _a, ...rest } = s; return { ...rest, clientSecret: '' }; };
  const uebernehmen = (s: AnbieterStand) => { setStand(s); setE(alsFormular(s)); };
  const gespeichert = stand ? alsFormular(stand) : null;
  const ent = useEntwurf(gespeichert, e, { aus: !e, zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); } });
  useEffect(() => { api.anbieter().then(uebernehmen).catch((x) => setMeldung({ art: 'schlecht', text: (x as Error).message })); }, []);
  async function tu(f: () => Promise<string>) {
    setSendet(true); setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  const speichern = () => tu(async () => { uebernehmen(await api.anbieterSetzen({ ...e!, clientSecret: e!.clientSecret || undefined })); return t('werkbank.anmeldeschutz.gespeichert'); });
  // „Verbindung prüfen“ (#986): Ergebnis und Fehler stehen am Knopf.
  const pruefen = async (): Promise<KnopfErgebnis> => {
    setMeldung(undefined);
    uebernehmen(await api.anbieterSetzen({ ...e!, aktiv: stand!.aktiv, clientSecret: e!.clientSecret || undefined }));
    const r = await api.anbieterPruefen();
    return { art: 'gut', text: t('werkbank.anmeldeschutz.verbindung-klappt-schluessel', { anzahl: r.schluessel, aussteller: r.aussteller, wert: r.abmelden ? t('werkbank.anmeldeschutz.abmelden-beim-anbieter-moeglich') : t('werkbank.anmeldeschutz.ohne-abmelden-beim-anbieter') }) };
  };
  if (!stand || !e) return <div className="blatt"><h2 className="h3">{t('werkbank.anmeldeschutz.anmeldung-ueber-einen-anbieter')}</h2>{meldung ? <p className="fehlertext">{meldung.text}</p> : <p className="leise">{t('werkbank.anmeldeschutz.lade')}</p>}</div>;
  const feld = (k: 'aussteller' | 'clientId' | 'knopf' | 'adminGruppe' | 'gruppenClaim', titel: ReactNode, platzhalter = '') => (
    <label className="eigenschaft"><span>{titel}</span><input id={`oidc-${k}`} value={e[k]} placeholder={platzhalter} onChange={(x) => setE({ ...e, [k]: x.target.value })} /></label>
  );
  return (
    <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.anmeldeschutz.anmeldung-ueber-einen-anbieter-2')} <Hilfe ort="werkbank.anbieter" /></h2>
      <p className="leise">{t('werkbank.anmeldeschutz.anmelden-mit-dem-konto')}</p>
      <p className="klein">{tn('werkbank.anmeldeschutz.beim-anbieter-als-weiterleitungs', { code: <code className="mono">{stand.rueckkehr}</code>, umbruch: <br />, code2: <code className="mono">{stand.abmeldenZurueck}</code> })}</p>
      <div className="raster">
        {feld('aussteller', <>{tn('werkbank.anmeldeschutz.adresse-des-anbieters', { klein: <small>{t('werkbank.anmeldeschutz.issuer-z-b-https')}</small> })}</>, 'https://…')}
        {feld('clientId', t('werkbank.anmeldeschutz.client-id'))}
        <label className="eigenschaft"><span>{tn('werkbank.anmeldeschutz.client-secret', { klein: <small>{stand.secretGesetzt ? t('werkbank.anmeldeschutz.gespeichert-leer-lassen-um') : t('werkbank.anmeldeschutz.leer-fuer-oeffentliche-clients')}</small> })}</span>
          <input id="oidc-secret" type="password" autoComplete="new-password" value={e.clientSecret} onChange={(x) => setE({ ...e, clientSecret: x.target.value })} /></label>
        {feld('knopf', t('werkbank.anmeldeschutz.beschriftung-des-knopfes'))}
      </div>
      <label className="haken"><input id="oidc-anlegen" type="checkbox" checked={e.anlegen} onChange={(x) => setE({ ...e, anlegen: x.target.checked })} /><span>{tn('werkbank.anmeldeschutz.unbekannte-adressen-als-neue', { klein: <small className="leise">{t('werkbank.anmeldeschutz.sonst-nur-benutzer-die')}</small> })}</span></label>
      {e.anlegen && <label className="eigenschaft"><span>{t('konten.verwaltende.oidc.neu')}</span>
        <select id="oidc-rolle" value={e.standardrolle} onChange={(x) => setE({ ...e, standardrolle: x.target.value === 'admin' ? 'admin' : 'mitglied' })}><option value="mitglied">{t('konten.verwaltende.oidc.neu.ohne')}</option><option value="admin">{t('konten.verwaltende.oidc.neu.gesamt')}</option></select></label>}
      <div className="raster">
        {feld('adminGruppe', <>{t('konten.verwaltende.oidc.gruppe')} <small>{t('konten.verwaltende.oidc.gruppe.leer')}</small></>, t('werkbank.anmeldeschutz.z-b-dms-admins'))}
        {feld('gruppenClaim', <>{tn('werkbank.anmeldeschutz.claim-mit-den-gruppen', { klein: <small>{t('werkbank.anmeldeschutz.meist-groups')}</small> })}</>, 'groups')}
      </div>
      <label className="haken"><input id="oidc-lokal" type="checkbox" checked={e.lokalNurAdmins} onChange={(x) => setE({ ...e, lokalNurAdmins: x.target.checked })} /><span>{t('konten.verwaltende.oidc.lokal')}
        <small className="leise">{t('werkbank.anmeldeschutz.als-notzugang-falls-der')}</small></span></label>
      <label className="haken"><input id="oidc-abmelden" type="checkbox" checked={e.abmeldenBeimAnbieter} onChange={(x) => setE({ ...e, abmeldenBeimAnbieter: x.target.checked })} /><span>{t('werkbank.anmeldeschutz.beim-abmelden-auch-beim')}</span></label>
      <label className="haken"><input id="oidc-aktiv" type="checkbox" checked={e.aktiv} onChange={(x) => setE({ ...e, aktiv: x.target.checked })} /><span>{t('werkbank.anmeldeschutz.eingeschaltet-knopf-auf-der')}</span></label>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        <Knopf gesperrt={sendet || !e.aussteller} onClick={pruefen} laeuftText={t('werkbank.anmeldeschutz.prueft')}>{t('werkbank.anmeldeschutz.verbindung-pruefen')}</Knopf>
      </div>
      <Speicherleiste ent={ent} gegenstand={t('werkbank.anmeldeschutz.anbieter')} sendet={sendet}
        links={stand.secretGesetzt && <button type="button" className="textknopf gefahr" disabled={sendet} onClick={() => void tu(async () => { uebernehmen(await api.anbieterSetzen({ clientSecretLoeschen: true })); return t('werkbank.anmeldeschutz.client-secret-geloescht'); })}>{t('werkbank.anmeldeschutz.secret-loeschen')}</button>} />
    </form>
  );
}
