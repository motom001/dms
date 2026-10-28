import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PASSWORT_MINDESTLAENGE, type Benutzer } from '../../shared/src/model';
import { ABGEMELDET, api, type KontoStatus } from './api';
import { geheZu, useOrt } from './ort';
import { Marke } from './Marke';

/** Logo und Schriftzug des Standard-Designs für Anmeldung und Passwortseiten (#72). */
let MARKE: { schriftzug: string | null; logo: string | null } = { schriftzug: null, logo: null };

interface Konto {
  ich: Benutzer; mail: boolean; abmelden(): Promise<void>; aktualisieren(): Promise<void>;
  /** Lassen sich Passwörter speichern (Schlüssel vorhanden)? */
  passwoerterMoeglich: boolean;
  vertretung: KontoStatus['vertretung'];
  hinweise: NonNullable<KontoStatus['hinweise']>;
}
const Ctx = createContext<Konto | null>(null);

export function useKonto(): Konto {
  const k = useContext(Ctx);
  if (!k) throw new Error('KontoProvider fehlt');
  return k;
}

/**
 * Entscheidet, was zu sehen ist: Ersteinrichtung, Anmeldung, Passwort setzen
 * oder – mit gültiger Sitzung – die eigentliche Anwendung.
 */
export function KontoProvider({ children }: { children: ReactNode }) {
  const { pfad } = useOrt();
  const [status, setStatus] = useState<KontoStatus | null>(null);
  const [fehler, setFehler] = useState<string>();

  const laden = useCallback(async () => {
    try {
      const st = await api.status();
      if (st.marke) {
        MARKE = st.marke;
        if (!st.benutzer) {
          document.title = st.marke.schriftzug || 'DMS';
          const el = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (el && st.marke.logo) el.href = st.marke.logo;
        }
      }
      setStatus(st); setFehler(undefined);
    }
    catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => {
    const f = () => setStatus((s) => (s ? { ...s, benutzer: null } : s));
    addEventListener(ABGEMELDET, f);
    return () => removeEventListener(ABGEMELDET, f);
  }, []);

  const abmelden = useCallback(async () => {
    await api.abmelden().catch(() => {});
    setStatus((s) => (s ? { ...s, benutzer: null } : s));
    geheZu('/', true);
  }, []);

  if (pfad.startsWith('/passwort/')) return <PasswortSetzen schluessel={decodeURIComponent(pfad.slice('/passwort/'.length))} fertig={laden} />;
  if (fehler) return <Karte titel="Keine Verbindung"><p className="hinweis schlecht">{fehler}</p><button className="knopf" onClick={() => void laden()}>Erneut versuchen</button></Karte>;
  if (!status) return <p className="leise mittig">Lade …</p>;
  if (status.einrichtungNoetig) return <Ersteinrichtung fertig={laden} />;
  if (!status.benutzer) return <Anmelden mail={status.mail} fertig={laden} />;
  // key: Beim Wechsel des Benutzers (Vertretung) alles neu aufbauen und laden.
  return (
    <Ctx.Provider key={status.benutzer.id} value={{ ich: status.benutzer, mail: status.mail, passwoerterMoeglich: status.passwoerterMoeglich ?? false, abmelden, aktualisieren: laden, vertretung: status.vertretung ?? null, hinweise: status.hinweise ?? [] }}>
      {children}
    </Ctx.Provider>
  );
}

function Karte({ titel, unter, children }: { titel: string; unter?: string; children: ReactNode }) {
  return (
    <div className="kartenseite">
      <div className="karte">
        <div className="marke gross">
          <Marke logo={MARKE.logo} schriftzug={MARKE.schriftzug ?? 'DMS'} gross />
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

function Ersteinrichtung({ fertig }: { fertig: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const f = useAbsenden(async () => {
    if (pw !== pw2) throw new Error('Die beiden Passwörter stimmen nicht überein.');
    await api.einrichten({ name, email, passwort: pw });
    await fertig();
    geheZu('/werkbank/typen', true);
  });
  return (
    <Karte titel="Willkommen" unter="Lege das Administrator-Konto an. Damit richtest du Mappentypen ein und verwaltest weitere Benutzer.">
      <form className="stapel" onSubmit={f.absenden}>
        <label className="eigenschaft"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus /></label>
        <label className="eigenschaft"><span>E-Mail-Adresse <small>damit meldest du dich an</small></span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label className="eigenschaft"><span>Passwort <small>mindestens {PASSWORT_MINDESTLAENGE} Zeichen</small></span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></label>
        <label className="eigenschaft"><span>Passwort wiederholen</span><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required /></label>
        {f.fehler && <p className="fehlertext">{f.fehler}</p>}
        <button className="knopf primaer" disabled={f.sendet}>{f.sendet ? 'Lege an …' : 'Administrator anlegen'}</button>
      </form>
    </Karte>
  );
}

function Anmelden({ mail, fertig }: { mail: boolean; fertig: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [vergessen, setVergessen] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const f = useAbsenden(async () => {
    if (vergessen) { await api.passwortVergessen(email); setGesendet(true); return; }
    await api.anmelden({ email, passwort: pw });
    await fertig();
  });

  if (vergessen) return (
    <Karte titel="Passwort vergessen" unter={mail ? 'Gib deine E-Mail-Adresse ein. Du bekommst einen Link, mit dem du ein neues Passwort festlegst.' : undefined}>
      {!mail ? <p>Für diese Installation ist kein E-Mail-Versand eingerichtet. Bitte einen Administrator, dir in der Benutzerverwaltung einen neuen Link zu erzeugen.</p>
        : gesendet ? <p className="hinweis gut">Wenn es zu dieser Adresse einen Zugang gibt, ist eine E-Mail unterwegs. Der Link darin ist eine Stunde gültig.</p>
        : <form className="stapel" onSubmit={f.absenden}>
            <label className="eigenschaft"><span>E-Mail-Adresse</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required /></label>
            {f.fehler && <p className="fehlertext">{f.fehler}</p>}
            <button className="knopf primaer" disabled={f.sendet}>Link anfordern</button>
          </form>}
      <button className="textknopf" onClick={() => { setVergessen(false); setGesendet(false); }}>← Zur Anmeldung</button>
    </Karte>
  );

  return (
    <Karte titel="Anmelden">
      <form className="stapel" onSubmit={f.absenden}>
        <label className="eigenschaft"><span>E-Mail-Adresse</span><input id="anmelden-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required /></label>
        <label className="eigenschaft"><span>Passwort</span><input id="anmelden-passwort" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
        {f.fehler && <p className="fehlertext">{f.fehler}</p>}
        <button className="knopf primaer" disabled={f.sendet}>{f.sendet ? 'Melde an …' : 'Anmelden'}</button>
      </form>
      <button className="textknopf" onClick={() => setVergessen(true)}>Passwort vergessen?</button>
    </Karte>
  );
}

function PasswortSetzen({ schluessel, fertig }: { schluessel: string; fertig: () => Promise<void> }) {
  const [info, setInfo] = useState<{ email: string; name: string; zweck: string } | null>(null);
  const [ungueltig, setUngueltig] = useState<string>();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  useEffect(() => { api.linkPruefen(schluessel).then(setInfo).catch((e) => setUngueltig((e as Error).message)); }, [schluessel]);
  const f = useAbsenden(async () => {
    if (pw !== pw2) throw new Error('Die beiden Passwörter stimmen nicht überein.');
    await api.passwortSetzen(schluessel, pw);
    geheZu('/ablage', true);
    await fertig();
  });

  if (ungueltig) return <Karte titel="Link nicht mehr gültig"><p>{ungueltig}</p><a className="knopf" href="/">Zur Anmeldung</a></Karte>;
  if (!info) return <p className="leise mittig">Prüfe Link …</p>;
  return (
    <Karte titel={info.zweck === 'einladung' ? `Willkommen${info.name ? `, ${info.name}` : ''}` : 'Neues Passwort festlegen'} unter={`Für den Zugang ${info.email}`}>
      <form className="stapel" onSubmit={f.absenden}>
        <input type="email" value={info.email} autoComplete="username" readOnly hidden />
        <label className="eigenschaft"><span>Passwort <small>mindestens {PASSWORT_MINDESTLAENGE} Zeichen</small></span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus required /></label>
        <label className="eigenschaft"><span>Passwort wiederholen</span><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required /></label>
        {f.fehler && <p className="fehlertext">{f.fehler}</p>}
        <button className="knopf primaer" disabled={f.sendet}>Passwort speichern und anmelden</button>
      </form>
    </Karte>
  );
}
