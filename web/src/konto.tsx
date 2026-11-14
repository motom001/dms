import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { PASSWORT_MINDESTLAENGE } from '../../shared/src/model';
import { ABGEMELDET, api, type KontoStatus, type WartungOeffentlich, type ZweiteWege } from './api';
import { erlaubteSprachen, setzeErlaubteSprachen } from '../../shared/src/beschriftung';
import { sprache } from '../../shared/src/sprache';
import { WartungsHinweis } from './wartung';
import { ErreichbarkeitsBanner, WIEDER_ERREICHBAR } from './erreichbar';
import { Wiederherstellungsbildschirm } from './wiederherstellen';
import { AssistentAngemeldet, Einrichtungsassistent } from './einrichtung';
import { geheZu, useOrt } from './ort';
import { Marke } from './Marke';
import { Hilfe } from './Hilfe';
import { ZweifaktorEinrichten } from './profil/Zweifaktor';
import { PasskeyHinzufuegen, PasskeyOhneHttps } from './profil/Passkeys';
import { passkeysImBrowser, passkeyVerwenden } from './passkey';
import { t, wechsleSprache } from './sprache';
import { Ctx } from './konto-kontext';

export { useKonto, useKontoOptional } from './konto-kontext';
import { LasttestSeite } from './lasttest';
import { setzeZeitzone } from '../../shared/src/region';
import { zielNachAnmeldung } from '../../shared/src/startseite';
import { darfVerwalten, type Verwaltungsstand } from '../../shared/src/verwaltungsrecht';
import { Verwaltungsanmeldung, verwaltungBeginnen } from './verwaltungsmodus';
import { abfangen, Feld, Knopf } from './bausteine';

const OHNE_MODUS: Verwaltungsstand = { darf: false, aktiv: false, bis: null, heuteBestaetigt: false, frisch: false, code: false, passwort: true, bereiche: [] };

/** Logo und Schriftzug des Standard-Designs für Anmeldung und Passwortseiten (#72). */
let MARKE: { schriftzug: string | null; logo: string | null } = { schriftzug: null, logo: null };

/** War beim letzten Status jemand angemeldet? Für die Fehlergrenze (#881), die außerhalb des Providers liegt. */
let ANGEMELDET = false;
export const jemandAngemeldet = () => ANGEMELDET;

/**
 * Entscheidet, was zu sehen ist: Ersteinrichtung, Anmeldung, Passwort setzen
 * oder – mit gültiger Sitzung – die eigentliche Anwendung.
 */
export function KontoProvider({ children }: { children: ReactNode }) {
  const { pfad } = useOrt();
  const [status, setStatus] = useState<KontoStatus | null>(null);
  const [fehler, setFehler] = useState<string>();
  // Ist die Anwendung schon offen, ersetzt ein Ausfall (#122) sie nicht durch „Keine Verbindung“ –
  // die Leiste oben meldet ihn, Eingaben bleiben stehen.
  const geladen = useRef(false);
  // War zuletzt niemand angemeldet? Dann ist das nächste Laden mit Benutzer eine frische Anmeldung (#721).
  const ohneBenutzer = useRef(false);

  const laden = useCallback(async () => {
    try {
      const st = await api.status();
      // Region (#726): „heute“, Uhrzeiten und Kalendertage wie auf dem Server.
      setzeZeitzone(st.zeitzone);
      // Sprachen (#729): Beschriftungen nur in erlaubten Sprachen; gilt nach der Anmeldung eine andere Sprache, neu laden.
      if (st.sprachen) {
        setzeErlaubteSprachen(st.sprachen.erlaubt);
        if (st.sprachen.sprache !== sprache()) { wechsleSprache(st.sprachen.sprache); return; }
      }
      if (st.marke) {
        MARKE = st.marke;
        if (!st.benutzer) {
          document.title = st.marke.schriftzug || 'Ablago';
          const el = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (el && st.marke.logo) el.href = st.marke.logo;
        }
      }
      // Nach der Anmeldung über einen Anbieter (#191): zurück zur Seite, von der sie ausging.
      // Nach der Anmeldung (Passwort, Anbieter, Zwei-Faktor): Admins in die Werkbank, ein Link dorthin hat Vorrang (#721).
      if (st.benutzer) {
        const hier = location.pathname + location.search;
        const gemerkt = nachAnmeldung();
        const frisch = gemerkt !== null || ohneBenutzer.current;
        const ziel = frisch ? zielNachAnmeldung(st.vertretung ? 'mitglied' : st.benutzer.rolle, gemerkt ?? hier) : null;
        if (ziel && ziel !== hier) geheZu(ziel, true);
      }
      ohneBenutzer.current = !st.benutzer;
      ANGEMELDET = !!st.benutzer;
      setStatus(st); setFehler(undefined); geladen.current = true;
    }
    catch (e) { if (!geladen.current) setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);
  // Wieder erreichbar: Sitzung und Version neu holen (nach einem Update ist es eine neue).
  useEffect(() => {
    const f = () => void laden();
    addEventListener(WIEDER_ERREICHBAR, f);
    return () => removeEventListener(WIEDER_ERREICHBAR, f);
  }, [laden]);
  useEffect(() => {
    const f = () => setStatus((s) => (s ? { ...s, benutzer: null } : s));
    addEventListener(ABGEMELDET, f);
    return () => removeEventListener(ABGEMELDET, f);
  }, []);

  const abmelden = useCallback(async () => {
    const r = await api.abmelden().catch(() => null);
    // Über einen Anbieter angemeldet (#241): auch dort abmelden.
    if (r?.abmelden) { location.href = r.abmelden; return; }
    setStatus((s) => (s ? { ...s, benutzer: null } : s));
    ohneBenutzer.current = true;
    ANGEMELDET = false;
    geheZu('/', true);
  }, []);

  // Außerhalb der angemeldeten Ablage dieselbe Leiste wie in App.tsx (#933): Ausfall, neue Version, wieder erreichbar.
  // Immer an derselben Stelle vor dem Inhalt, damit sie beim Wechsel zwischen den Bildschirmen stehen bleibt.
  const seite = (inhalt: ReactNode) => <><ErreichbarkeitsBanner aussen version={status?.version ?? null} ansichtNeuLaden={() => void laden()} />{inhalt}</>;
  // Anbieter bestätigt, jetzt der Code (#241, #242).
  if (pfad === '/anmelden/code' && location.hash.length > 1) {
    // Nach dem Anbieter (#241): „#<kennung>.<wege>“ – c = Code, p = Passkey (#811); ohne Angabe nur der Code.
    const [kennung, w] = location.hash.slice(1).split('.');
    const wege = w === undefined ? undefined : { code: w.includes('c'), passkey: w.includes('p') };
    return seite(<CodeSchritt kennung={kennung} wege={wege} fertig={async () => { geheZu(nachAnmeldung(false) ?? '/', true); await laden(); }} zurueck={() => geheZu('/', true)} />);
  }
  if (pfad.startsWith('/passwort/')) return seite(<PasswortSetzen schluessel={decodeURIComponent(pfad.slice('/passwort/'.length))} fertig={laden} />);
  if (fehler) return seite(<Karte titel={t('anmeldung.verbindung.titel')}><p className="hinweis schlecht">{fehler}</p><Knopf onClick={laden}>{t('anmeldung.verbindung.erneut')}</Knopf></Karte>);
  if (!status) return seite(<p className="leise mittig">{t('anmeldung.lade')}</p>);
  // Lasttest-Modus (#612): nur die Seite mit Fortschritt und Ergebnis – keine Anmeldung, keine Ablage.
  if (status.lasttest) return seite(<LasttestSeite />);
  // Wiederherstellung (#107): eigener Bildschirm, auch nach Neuladen und Neustart.
  if (status.wiederherstellung?.laeuft || status.wiederherstellung?.abschluss) return seite(<Wiederherstellungsbildschirm fertig={() => void laden()} />);
  // Einrichtungsassistent (#119, #804): ohne Datenbank, mit Code; sammeln bis „Jetzt einrichten“ …
  // Der Dialog für die erneute Anmeldung (#819) auch hier: Nach „Jetzt einrichten“ läuft der Assistent zunächst in
  // dieser Oberfläche weiter, und das Notfallblatt kann eine frische Anmeldung verlangen (#821). Danach nicht neu
  // laden – sonst wechselte die Oberfläche mitten im Herunterladen; das übernimmt „Einrichtung abschließen“.
  if (status.einrichtungNoetig || status.einrichtung?.phase === 'datenbank' || status.einrichtung?.phase === 'startet') return seite(
    <>
      <Einrichtungsassistent status={status} fertig={laden} />
      <Verwaltungsanmeldung stand={status.verwaltungsmodus ?? null} nachher={() => {}} />
    </>
  );
  if (!status.benutzer) return seite(<Anmelden mail={status.mail} wartung={status.wartung} anbieter={status.anbieter ?? null} passkey={!!status.passkey?.moeglich} fertig={laden} />);
  // Zwei-Faktor vorgeschrieben (#242), aber noch nicht eingerichtet: erst einrichten.
  if (status.zweifaktor?.fehlt) return seite(
    <Karte titel={t('anmeldung.zweifaktor.titel')} unter={t('anmeldung.zweifaktor.text')}>
      <ZweifaktorEinrichten fertig={() => void laden()} />
      {/* #811: Ein Passkey erfüllt die Pflicht ebenfalls. */}
      {status.passkey?.moeglich && passkeysImBrowser() && <>
        <p className="trenner">{t('anmeldung.zweifaktor.oder-passkey')}</p>
        <PasskeyHinzufuegen fertig={() => laden()} />
      </>}
      <Knopf art="link" onClick={abmelden}>{t('anmeldung.abmelden')}</Knopf>
      {darfVerwalten(status.benutzer) && <PflichtAusschalten fertig={laden} />}
      <Verwaltungsanmeldung stand={status.verwaltungsmodus ?? null} nachher={() => void laden()} />
    </Karte>
  );
  // Passkey vorgeschrieben (#811), aber noch keiner da: erst hinzufügen – wie bei der Zwei-Faktor-Anmeldung.
  if (status.passkey?.fehlt) return seite(
    <Karte titel={t('anmeldung.passkey.pflicht.titel')} unter={t('anmeldung.passkey.pflicht.text')}>
      {passkeysImBrowser() ? <PasskeyHinzufuegen fertig={() => laden()} /> : <PasskeyOhneHttps />}
      <Knopf art="link" onClick={abmelden}>{t('anmeldung.abmelden')}</Knopf>
      {darfVerwalten(status.benutzer) && <PflichtAusschalten art="passkey" fertig={laden} />}
      <Verwaltungsanmeldung stand={status.verwaltungsmodus ?? null} nachher={() => void laden()} />
    </Karte>
  );
  const modus = status.verwaltungsmodus ?? OHNE_MODUS;
  const verwalten = async () => {
    // Steht man schon auf einer Seite der Werkbank (z. B. Link aus einer E-Mail), bleibt man dort.
    if (await verwaltungBeginnen()) { if (!location.pathname.startsWith('/werkbank')) geheZu('/werkbank', true); await laden(); }
  };
  const verwaltungBeenden = async () => {
    await api.verwaltungBeenden().catch(() => undefined);
    if (location.pathname.startsWith('/werkbank')) geheZu('/ablage', true);
    await laden();
  };
  // key: Beim Wechsel des Benutzers (Vertretung) alles neu aufbauen und laden.
  return (
    <Ctx.Provider key={status.benutzer.id} value={{ ich: status.benutzer, mail: status.mail, passwoerterMoeglich: status.passwoerterMoeglich ?? false, abmelden, aktualisieren: laden, vertretung: status.vertretung ?? null, hinweise: status.hinweise ?? [], version: status.version ?? null, zweifaktor: { aktiv: !!status.zweifaktor?.aktiv, ausstehend: !!status.zweifaktor?.ausstehend }, passkey: { aktiv: !!status.passkey?.aktiv, ausstehend: !!status.passkey?.ausstehend }, favoritenBenachrichtigung: status.favoritenBenachrichtigung !== false, ohneEmpfaenger: !!status.aufgabenOhneEmpfaenger || status.benutzer.rolle === 'admin', verwaltung: !!status.verwaltung, laufwerk: status.laufwerk === true, verwaltungsmodus: modus, verwalten, verwaltungBeenden, sprachen: status.sprachen ?? { sprache: sprache(), standard: 'de', erlaubt: erlaubteSprachen(), maschinell: [] }, uebersetzen: status.uebersetzen ?? null }}>
      {/* … danach mit „Gesamte Verwaltung“ (#818) im Verwaltungsmodus: „Jetzt einrichten“ läuft weiter, dann Notfallblatt und Abschluss (#804). */}
      {status.einrichtung?.assistent ? seite(<AssistentAngemeldet />) : children}
      <Verwaltungsanmeldung stand={modus} nachher={() => void laden()} />
    </Ctx.Provider>
  );
}

/**
 * #416: Die Pflicht selbst bleibt für alle, die verwalten dürfen, immer erreichbar – auch hier, bevor sie eingerichtet
 * ist. Nur ausschalten; der Server lässt in diesem Zustand nichts anderes zu. Seit #819 im Verwaltungsmodus: Fehlt er,
 * fragt der Dialog die erneute Anmeldung ab und schickt die Anfrage danach noch einmal.
 */
function PflichtAusschalten({ fertig, art = 'zweifaktor' }: { fertig: () => Promise<void>; art?: 'zweifaktor' | 'passkey' }) {
  const [fehler, setFehler] = useState<string>();
  const frage = art === 'passkey'
    ? { titel: t('anmeldung.passkey.pflicht.frage'), text: t('anmeldung.passkey.pflicht.frage.text'), ja: t('anmeldung.zweifaktor.pflicht.frage.ja') }
    : { titel: t('anmeldung.zweifaktor.pflicht.frage'), text: t('anmeldung.zweifaktor.pflicht.frage.text'), ja: t('anmeldung.zweifaktor.pflicht.frage.ja') };
  async function aus() {
    try { await (art === 'passkey' ? api.passkeyPflichtSetzen({ admin: false }) : api.zweifaktorPflichtSetzen({ admin: false })); await fertig(); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <p className="leise klein">{t('anmeldung.zweifaktor.pflicht.hinweis')}{' '}
      <Knopf art="gefahr" symbol="verboten" rueckfrage={frage} onClick={aus}>{t('anmeldung.zweifaktor.pflicht.knopf')}</Knopf>
      {fehler && <span className="fehlertext" role="alert"> {fehler}</span>}
    </p>
  );
}

/** Ziel nach einer Anmeldung über einen Anbieter (#191), z. B. /werkbank/pakete?installieren=… */
const ZIEL = 'dms:nach-anmeldung';
function merkeZiel() { try { sessionStorage.setItem(ZIEL, location.pathname + location.search); } catch { /* ohne */ } }
function nachAnmeldung(entfernen = true): string | null {
  try { const z = sessionStorage.getItem(ZIEL); if (entfernen) sessionStorage.removeItem(ZIEL); return z && z.startsWith('/') && !z.startsWith('//') ? z : null; } catch { return null; }
}

function Karte({ titel, unter, children }: { titel: string; unter?: string; children: ReactNode }) {
  return (
    <div className="kartenseite">
      <div className="karte">
        <div className="marke gross">
          <Marke logo={MARKE.logo} schriftzug={MARKE.schriftzug ?? 'Ablago'} gross />
        </div>
        <h1>{titel}</h1>
        {unter && <p className="leise">{unter}</p>}
        {children}
      </div>
    </div>
  );
}

function useAbsenden(fn: () => Promise<void>) {
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  // Fehler stehen im Formular (fehler); abfangen gibt React kein Promise zurück (#1011).
  const absenden = abfangen(async (e: FormEvent) => {
    e.preventDefault();
    setSendet(true); setFehler(undefined);
    try { await fn(); } finally { setSendet(false); }
  }, setFehler);
  return { sendet, fehler, absenden };
}

/** Mit Passkey anmelden (#811): ohne E-Mail-Adresse oder – mit `zweiterSchritt` – als zweiter Faktor. */
async function mitPasskeyAnmelden(zweiterSchritt?: string) {
  const o = await api.passkeyOptionen(zweiterSchritt);
  const antwort = await passkeyVerwenden(o.optionen);
  await api.passkeyAnmelden({ kennung: o.kennung, antwort, ...(zweiterSchritt ? { zweiterSchritt } : {}) });
}

/** Zweiter Schritt der Anmeldung (#242): Code aus der App, ein Wiederherstellungscode oder ein Passkey (#811). */
function CodeSchritt({ kennung, wege = { code: true, passkey: false }, fertig, zurueck }: { kennung: string; wege?: ZweiteWege; fertig: () => Promise<void>; zurueck: () => void }) {
  const passkey = wege.passkey && passkeysImBrowser();
  const [code, setCode] = useState('');
  const [wiederherstellung, setWiederherstellung] = useState(false);
  const [genutzt, setGenutzt] = useState(false);
  const f = useAbsenden(async () => {
    const r = await api.anmeldenCode(kennung, code);
    if (r.wiederherstellung) { setGenutzt(true); return; }
    await fertig();
  });
  if (genutzt) return (
    <Karte titel={t('anmeldung.code.verbraucht.titel')}>
      <p className="hinweis warn">{t('anmeldung.code.verbraucht.text')}</p>
      <div className="knoepfe">
        <Knopf art="haupt" onClick={() => { geheZu('/profil/sicherheit', true); void fertig(); }}>{t('anmeldung.code.verbraucht.profil')}</Knopf>
        <Knopf onClick={fertig}>{t('anmeldung.weiter')}</Knopf>
      </div>
    </Karte>
  );
  const mitPasskey = passkey && <div className="anmelden-passkey">
    <Knopf id="anmelden-passkey-zweiter" art={wege.code ? 'neben' : 'haupt'} className="breit" laeuftText={t('anmeldung.passkey.warte')}
      symbol="passkey" onClick={async () => { await mitPasskeyAnmelden(kennung); await fertig(); }}>{t('anmeldung.passkey.bestaetigen')}</Knopf>
  </div>;
  // Nur Passkey (vorgeschrieben, ohne Code-App): kein Code-Feld.
  if (!wege.code) return (
    <Karte titel={t('anmeldung.passkey.zweiter.titel')} unter={t('anmeldung.passkey.zweiter.text')}>
      {mitPasskey || <PasskeyOhneHttps />}
      <Knopf art="link" onClick={zurueck}>{t('anmeldung.zurueck')}</Knopf>
    </Karte>
  );
  return (
    <Karte titel={t('anmeldung.code.titel')} unter={wiederherstellung ? t('anmeldung.code.text.wiederherstellung') : t('anmeldung.code.text')}>
      {mitPasskey && <>{mitPasskey}<p className="trenner">{t('anmeldung.passkey.oder-code')}</p></>}
      <form className="stapel" onSubmit={f.absenden}>
        <Feld beschriftung={wiederherstellung ? t('anmeldung.code.feld.wiederherstellung') : t('anmeldung.code.feld')} fehler={f.fehler}>
          <input id="anmelden-code" key={String(wiederherstellung)} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required
            {...(wiederherstellung ? { autoComplete: 'off', autoCapitalize: 'characters', spellCheck: false } : { inputMode: 'numeric' as const, autoComplete: 'one-time-code', maxLength: 7 })} />
        </Feld>
        <Knopf art="haupt" type="submit" laeuft={f.sendet} laeuftText={t('anmeldung.pruefe')}>{t('anmeldung.knopf')}</Knopf>
      </form>
      <Knopf art="link" onClick={() => { setWiederherstellung(!wiederherstellung); setCode(''); }}>{wiederherstellung ? t('anmeldung.code.wechsel.app') : t('anmeldung.code.wechsel.wiederherstellung')}</Knopf>
      <Knopf art="link" onClick={zurueck}>{t('anmeldung.zurueck')}</Knopf>
    </Karte>
  );
}

function Anmelden({ mail, wartung, anbieter, passkey, fertig }: { mail: boolean; wartung?: WartungOeffentlich | null; anbieter: KontoStatus['anbieter']; passkey: boolean; fertig: () => Promise<void> }) {
  // Fehler der Anmeldung über einen Anbieter (#241) kommen als ?anmeldefehler= zurück.
  const [anbieterFehler] = useState(() => {
    const m = new URLSearchParams(location.search).get('anmeldefehler');
    if (m) history.replaceState(null, '', location.pathname);
    return m;
  });
  const [mitPasswort, setMitPasswort] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [vergessen, setVergessen] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const [kennung, setKennung] = useState<{ kennung: string; wege?: ZweiteWege } | null>(null);
  const f = useAbsenden(async () => {
    if (vergessen) { await api.passwortVergessen(email); setGesendet(true); return; }
    const r = await api.anmelden({ email, passwort: pw });
    if (r.zweiterSchritt) { setKennung({ kennung: r.zweiterSchritt, wege: r.wege }); setPw(''); return; }
    await fertig();
  });

  if (kennung) return <CodeSchritt kennung={kennung.kennung} wege={kennung.wege} fertig={fertig} zurueck={() => setKennung(null)} />;

  if (vergessen) return (
    <Karte titel={t('anmeldung.vergessen.titel')} unter={mail ? t('anmeldung.vergessen.text') : undefined}>
      {!mail ? <p>{t('anmeldung.vergessen.ohne-mail')}</p>
        : gesendet ? <p className="hinweis gut">{t('anmeldung.vergessen.gesendet')}</p>
        : <form className="stapel" onSubmit={f.absenden}>
            <Feld beschriftung={t('anmeldung.email')} fehler={f.fehler}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required /></Feld>
            <Knopf art="haupt" type="submit" laeuft={f.sendet}>{t('anmeldung.vergessen.knopf')}</Knopf>
          </form>}
      <Knopf art="link" onClick={() => { setVergessen(false); setGesendet(false); }}>{t('anmeldung.zurueck')}</Knopf>
    </Karte>
  );

  return (
    <Karte titel={t('anmeldung.titel')}>
      <WartungsHinweis start={wartung} />
      {anbieter && <>
        <a id="anmelden-anbieter" className="knopf primaer breit" href="/api/konto/anbieter/start" onClick={merkeZiel}>{anbieter.knopf}</a>
        {anbieterFehler && <p className="fehlertext" role="alert">{anbieterFehler}</p>}
        {anbieter.lokalNurAdmins && !mitPasswort
          ? <Knopf art="link" onClick={() => setMitPasswort(true)}>{t('anmeldung.anbieter.admin')}</Knopf>
          : <p className="trenner">{t('anmeldung.anbieter.oder')}</p>}
      </>}
      {/* Passkey (#811): eigener Weg ohne E-Mail-Adresse – nur über HTTPS; sonst ein ruhiger Hinweis mit Weg ins Handbuch. */}
      {passkey && passkeysImBrowser() ? <div className="anmelden-passkey">
        <Knopf id="anmelden-passkey" className="breit" symbol="passkey" laeuftText={t('anmeldung.passkey.warte')} onClick={async () => { await mitPasskeyAnmelden(); await fertig(); }}>
          {t('anmeldung.passkey.knopf')}</Knopf>
        <p className="trenner">{t('anmeldung.passkey.oder')}</p>
      </div> : <p className="leise klein" id="anmelden-passkey-hinweis">{t('anmeldung.passkey.fehler.https')} <Hilfe ort="profil.passkeys" /></p>}
      {(!anbieter || !anbieter.lokalNurAdmins || mitPasswort) && <>
      <form className="stapel" onSubmit={f.absenden}>
        <Feld beschriftung={t('anmeldung.email')}><input id="anmelden-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus={!anbieter} required /></Feld>
        <Feld beschriftung={t('anmeldung.passwort')} fehler={f.fehler}><input id="anmelden-passwort" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></Feld>
        <Knopf art={anbieter ? 'neben' : 'haupt'} type="submit" laeuft={f.sendet} laeuftText={t('anmeldung.knopf.laeuft')}>{t('anmeldung.knopf')}</Knopf>
      </form>
      <Knopf art="link" onClick={() => setVergessen(true)}>{t('anmeldung.vergessen.link')}</Knopf>
      </>}
    </Karte>
  );
}

function PasswortSetzen({ schluessel, fertig }: { schluessel: string; fertig: () => Promise<void> }) {
  const [info, setInfo] = useState<{ email: string; name: string; zweck: string } | null>(null);
  const [ungueltig, setUngueltig] = useState<string>();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [kennung, setKennung] = useState<{ kennung: string; wege?: ZweiteWege } | null>(null);
  useEffect(() => { api.linkPruefen(schluessel).then(setInfo).catch((e) => setUngueltig((e as Error).message)); }, [schluessel]);
  const f = useAbsenden(async () => {
    if (pw !== pw2) throw new Error(t('anmeldung.passwort.ungleich'));
    const r = await api.passwortSetzen(schluessel, pw);
    // Zwei-Faktor (#242): Der Link ersetzt das Passwort, nicht den Code.
    if (r.zweiterSchritt) { setKennung({ kennung: r.zweiterSchritt, wege: r.wege }); return; }
    geheZu('/ablage', true);
    await fertig();
  });

  if (kennung) return <CodeSchritt kennung={kennung.kennung} wege={kennung.wege} fertig={async () => { if (location.pathname.startsWith('/passwort/')) geheZu('/ablage', true); await fertig(); }} zurueck={() => geheZu('/', true)} />;

  if (ungueltig) return <Karte titel={t('anmeldung.link.ungueltig')}><p>{ungueltig}</p><a className="knopf" href="/">{t('anmeldung.zur-anmeldung')}</a></Karte>;
  if (!info) return <p className="leise mittig">{t('anmeldung.link.pruefe')}</p>;
  return (
    <Karte titel={info.zweck !== 'einladung' ? t('anmeldung.passwort.neu') : info.name ? t('anmeldung.passwort.willkommen.name', { name: info.name }) : t('anmeldung.passwort.willkommen')} unter={t('anmeldung.passwort.zugang', { email: info.email })}>
      <form className="stapel" onSubmit={f.absenden}>
        <input type="email" value={info.email} autoComplete="username" readOnly hidden />
        <Feld beschriftung={t('anmeldung.passwort')} hinweis={t('anmeldung.passwort.mindestens', { anzahl: PASSWORT_MINDESTLAENGE })}><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus required /></Feld>
        <Feld beschriftung={t('anmeldung.passwort.wiederholen')} fehler={f.fehler}><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required /></Feld>
        <Knopf art="haupt" type="submit" laeuft={f.sendet}>{t('anmeldung.passwort.knopf')}</Knopf>
      </form>
    </Karte>
  );
}
