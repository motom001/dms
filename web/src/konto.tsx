import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { PASSWORT_MINDESTLAENGE } from '../../shared/src/model';
import { ABGEMELDET, api, type KontoStatus, type WartungOeffentlich } from './api';
import { erlaubteSprachen, setzeErlaubteSprachen } from '../../shared/src/beschriftung';
import { sprache } from '../../shared/src/sprache';
import { WartungsHinweis } from './wartung';
import { ErreichbarkeitsBanner, WIEDER_ERREICHBAR } from './erreichbar';
import { Wiederherstellungsbildschirm } from './wiederherstellen';
import { AssistentAngemeldet, Einrichtungsassistent } from './einrichtung';
import { geheZu, useOrt } from './ort';
import { Marke } from './Marke';
import { ZweifaktorEinrichten } from './profil/Zweifaktor';
import { rueckfrage } from './rueckfrage';
import { t, wechsleSprache } from './sprache';
import { Ctx } from './konto-kontext';

export { useKonto, useKontoOptional } from './konto-kontext';
import { LasttestSeite } from './lasttest';
import { setzeZeitzone } from '../../shared/src/region';
import { zielNachAnmeldung } from '../../shared/src/startseite';
import { darfVerwalten, type Verwaltungsstand } from '../../shared/src/verwaltungsrecht';
import { Verwaltungsanmeldung, verwaltungBeginnen } from './verwaltungsmodus';

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
  if (pfad === '/anmelden/code' && location.hash.length > 1) return seite(<CodeSchritt kennung={location.hash.slice(1)} fertig={async () => { geheZu(nachAnmeldung(false) ?? '/', true); await laden(); }} zurueck={() => geheZu('/', true)} />);
  if (pfad.startsWith('/passwort/')) return seite(<PasswortSetzen schluessel={decodeURIComponent(pfad.slice('/passwort/'.length))} fertig={laden} />);
  if (fehler) return seite(<Karte titel={t('anmeldung.verbindung.titel')}><p className="hinweis schlecht">{fehler}</p><button className="knopf" onClick={() => void laden()}>{t('anmeldung.verbindung.erneut')}</button></Karte>);
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
  if (!status.benutzer) return seite(<Anmelden mail={status.mail} wartung={status.wartung} anbieter={status.anbieter ?? null} fertig={laden} />);
  // Zwei-Faktor vorgeschrieben (#242), aber noch nicht eingerichtet: erst einrichten.
  if (status.zweifaktor?.fehlt) return seite(
    <Karte titel={t('anmeldung.zweifaktor.titel')} unter={t('anmeldung.zweifaktor.text')}>
      <ZweifaktorEinrichten fertig={() => void laden()} />
      <button className="textknopf" onClick={() => void abmelden()}>{t('anmeldung.abmelden')}</button>
      {darfVerwalten(status.benutzer) && <PflichtAusschalten fertig={laden} />}
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
    <Ctx.Provider key={status.benutzer.id} value={{ ich: status.benutzer, mail: status.mail, passwoerterMoeglich: status.passwoerterMoeglich ?? false, abmelden, aktualisieren: laden, vertretung: status.vertretung ?? null, hinweise: status.hinweise ?? [], version: status.version ?? null, zweifaktor: { aktiv: !!status.zweifaktor?.aktiv, ausstehend: !!status.zweifaktor?.ausstehend }, favoritenBenachrichtigung: status.favoritenBenachrichtigung !== false, ohneEmpfaenger: !!status.aufgabenOhneEmpfaenger || status.benutzer.rolle === 'admin', verwaltung: !!status.verwaltung, laufwerk: status.laufwerk === true, verwaltungsmodus: modus, verwalten, verwaltungBeenden, sprachen: status.sprachen ?? { sprache: sprache(), standard: 'de', erlaubt: erlaubteSprachen(), maschinell: [] }, uebersetzen: status.uebersetzen ?? null }}>
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
function PflichtAusschalten({ fertig }: { fertig: () => Promise<void> }) {
  const [fehler, setFehler] = useState<string>();
  async function aus() {
    if (!(await rueckfrage({ titel: t('anmeldung.zweifaktor.pflicht.frage'), text: t('anmeldung.zweifaktor.pflicht.frage.text'), ja: t('anmeldung.zweifaktor.pflicht.frage.ja'), gefahr: true }))) return;
    try { await api.zweifaktorPflichtSetzen({ admin: false }); await fertig(); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <p className="leise klein">{t('anmeldung.zweifaktor.pflicht.hinweis')}{' '}
      <button className="textknopf" onClick={() => void aus()}>{t('anmeldung.zweifaktor.pflicht.knopf')}</button>
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
  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    setSendet(true); setFehler(undefined);
    try { await fn(); } catch (err) { setFehler((err as Error).message); } finally { setSendet(false); }
  };
  return { sendet, fehler, absenden };
}

/** Zweiter Schritt der Anmeldung (#242): Code aus der App oder ein Wiederherstellungscode. */
function CodeSchritt({ kennung, fertig, zurueck }: { kennung: string; fertig: () => Promise<void>; zurueck: () => void }) {
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
        <button className="knopf primaer" onClick={() => { geheZu('/profil/sicherheit', true); void fertig(); }}>{t('anmeldung.code.verbraucht.profil')}</button>
        <button className="knopf" onClick={() => void fertig()}>{t('anmeldung.weiter')}</button>
      </div>
    </Karte>
  );
  return (
    <Karte titel={t('anmeldung.code.titel')} unter={wiederherstellung ? t('anmeldung.code.text.wiederherstellung') : t('anmeldung.code.text')}>
      <form className="stapel" onSubmit={f.absenden}>
        <label className="eigenschaft"><span>{wiederherstellung ? t('anmeldung.code.feld.wiederherstellung') : t('anmeldung.code.feld')}</span>
          <input id="anmelden-code" key={String(wiederherstellung)} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required
            {...(wiederherstellung ? { autoComplete: 'off', autoCapitalize: 'characters', spellCheck: false } : { inputMode: 'numeric' as const, autoComplete: 'one-time-code', maxLength: 7 })} />
        </label>
        {f.fehler && <p className="fehlertext">{f.fehler}</p>}
        <button className="knopf primaer" disabled={f.sendet}>{f.sendet ? t('anmeldung.pruefe') : t('anmeldung.knopf')}</button>
      </form>
      <button className="textknopf" onClick={() => { setWiederherstellung(!wiederherstellung); setCode(''); }}>{wiederherstellung ? t('anmeldung.code.wechsel.app') : t('anmeldung.code.wechsel.wiederherstellung')}</button>
      <button className="textknopf" onClick={zurueck}>{t('anmeldung.zurueck')}</button>
    </Karte>
  );
}

function Anmelden({ mail, wartung, anbieter, fertig }: { mail: boolean; wartung?: WartungOeffentlich | null; anbieter: KontoStatus['anbieter']; fertig: () => Promise<void> }) {
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
  const [kennung, setKennung] = useState<string | null>(null);
  const f = useAbsenden(async () => {
    if (vergessen) { await api.passwortVergessen(email); setGesendet(true); return; }
    const r = await api.anmelden({ email, passwort: pw });
    if (r.zweiterSchritt) { setKennung(r.zweiterSchritt); setPw(''); return; }
    await fertig();
  });

  if (kennung) return <CodeSchritt kennung={kennung} fertig={fertig} zurueck={() => setKennung(null)} />;

  if (vergessen) return (
    <Karte titel={t('anmeldung.vergessen.titel')} unter={mail ? t('anmeldung.vergessen.text') : undefined}>
      {!mail ? <p>{t('anmeldung.vergessen.ohne-mail')}</p>
        : gesendet ? <p className="hinweis gut">{t('anmeldung.vergessen.gesendet')}</p>
        : <form className="stapel" onSubmit={f.absenden}>
            <label className="eigenschaft"><span>{t('anmeldung.email')}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required /></label>
            {f.fehler && <p className="fehlertext">{f.fehler}</p>}
            <button className="knopf primaer" disabled={f.sendet}>{t('anmeldung.vergessen.knopf')}</button>
          </form>}
      <button className="textknopf" onClick={() => { setVergessen(false); setGesendet(false); }}>{t('anmeldung.zurueck')}</button>
    </Karte>
  );

  return (
    <Karte titel={t('anmeldung.titel')}>
      <WartungsHinweis start={wartung} />
      {anbieter && <>
        <a id="anmelden-anbieter" className="knopf primaer breit" href="/api/konto/anbieter/start" onClick={merkeZiel}>{anbieter.knopf}</a>
        {anbieterFehler && <p className="fehlertext" role="alert">{anbieterFehler}</p>}
        {anbieter.lokalNurAdmins && !mitPasswort
          ? <button className="textknopf" onClick={() => setMitPasswort(true)}>{t('anmeldung.anbieter.admin')}</button>
          : <p className="trenner">{t('anmeldung.anbieter.oder')}</p>}
      </>}
      {(!anbieter || !anbieter.lokalNurAdmins || mitPasswort) && <>
      <form className="stapel" onSubmit={f.absenden}>
        <label className="eigenschaft"><span>{t('anmeldung.email')}</span><input id="anmelden-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus={!anbieter} required /></label>
        <label className="eigenschaft"><span>{t('anmeldung.passwort')}</span><input id="anmelden-passwort" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
        {f.fehler && <p className="fehlertext">{f.fehler}</p>}
        <button className={`knopf ${anbieter ? '' : 'primaer'}`} disabled={f.sendet}>{f.sendet ? t('anmeldung.knopf.laeuft') : t('anmeldung.knopf')}</button>
      </form>
      <button className="textknopf" onClick={() => setVergessen(true)}>{t('anmeldung.vergessen.link')}</button>
      </>}
    </Karte>
  );
}

function PasswortSetzen({ schluessel, fertig }: { schluessel: string; fertig: () => Promise<void> }) {
  const [info, setInfo] = useState<{ email: string; name: string; zweck: string } | null>(null);
  const [ungueltig, setUngueltig] = useState<string>();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [kennung, setKennung] = useState<string | null>(null);
  useEffect(() => { api.linkPruefen(schluessel).then(setInfo).catch((e) => setUngueltig((e as Error).message)); }, [schluessel]);
  const f = useAbsenden(async () => {
    if (pw !== pw2) throw new Error(t('anmeldung.passwort.ungleich'));
    const r = await api.passwortSetzen(schluessel, pw);
    // Zwei-Faktor (#242): Der Link ersetzt das Passwort, nicht den Code.
    if (r.zweiterSchritt) { setKennung(r.zweiterSchritt); return; }
    geheZu('/ablage', true);
    await fertig();
  });

  if (kennung) return <CodeSchritt kennung={kennung} fertig={async () => { if (location.pathname.startsWith('/passwort/')) geheZu('/ablage', true); await fertig(); }} zurueck={() => geheZu('/', true)} />;

  if (ungueltig) return <Karte titel={t('anmeldung.link.ungueltig')}><p>{ungueltig}</p><a className="knopf" href="/">{t('anmeldung.zur-anmeldung')}</a></Karte>;
  if (!info) return <p className="leise mittig">{t('anmeldung.link.pruefe')}</p>;
  return (
    <Karte titel={info.zweck !== 'einladung' ? t('anmeldung.passwort.neu') : info.name ? t('anmeldung.passwort.willkommen.name', { name: info.name }) : t('anmeldung.passwort.willkommen')} unter={t('anmeldung.passwort.zugang', { email: info.email })}>
      <form className="stapel" onSubmit={f.absenden}>
        <input type="email" value={info.email} autoComplete="username" readOnly hidden />
        <label className="eigenschaft"><span>{t('anmeldung.passwort')} <small>{t('anmeldung.passwort.mindestens', { anzahl: PASSWORT_MINDESTLAENGE })}</small></span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus required /></label>
        <label className="eigenschaft"><span>{t('anmeldung.passwort.wiederholen')}</span><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required /></label>
        {f.fehler && <p className="fehlertext">{f.fehler}</p>}
        <button className="knopf primaer" disabled={f.sendet}>{t('anmeldung.passwort.knopf')}</button>
      </form>
    </Karte>
  );
}
