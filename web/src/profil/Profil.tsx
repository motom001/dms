import { useState, type FormEvent, type ReactNode } from 'react';
import { PASSWORT_MINDESTLAENGE, ROLLEN } from '../../../shared/src/model';
import { api } from '../api';
import { useKonto } from '../konto';

function useFormular(fn: () => Promise<string>) {
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    setSendet(true); setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await fn() }); } catch (err) { setMeldung({ art: 'schlecht', text: (err as Error).message }); } finally { setSendet(false); }
  };
  const anzeige: ReactNode = meldung ? <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p> : null;
  return { sendet, absenden, anzeige };
}

export function Profil() {
  const { ich, mail, aktualisieren } = useKonto();
  const [name, setName] = useState(ich.name);
  const [email, setEmail] = useState(ich.email);
  const [pwEmail, setPwEmail] = useState('');
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [neu2, setNeu2] = useState('');
  const [entwickler, setEntwickler] = useState(!!ich.entwicklermodus);

  const fName = useFormular(async () => { await api.profil(name); await aktualisieren(); return 'Name gespeichert.'; });
  const fEmail = useFormular(async () => {
    await api.emailAendern(email, pwEmail); setPwEmail(''); await aktualisieren();
    return mail ? 'E-Mail-Adresse geändert. Die bisherige Adresse hat einen Hinweis bekommen.' : 'E-Mail-Adresse geändert.';
  });
  const fPw = useFormular(async () => {
    if (neu !== neu2) throw new Error('Die beiden neuen Passwörter stimmen nicht überein.');
    await api.passwortAendern(alt, neu); setAlt(''); setNeu(''); setNeu2('');
    return 'Passwort geändert. Alle anderen Anmeldungen wurden beendet.';
  });

  return (
    <div className="einspaltig schmal">
      <div className="mappenkopf">
        <p className="ueber">Profil</p>
        <h1>{ich.name || ich.email}</h1>
        <dl className="index"><div><dt>Rolle</dt><dd>{ROLLEN[ich.rolle]}</dd></div></dl>
      </div>

      <form className="blatt" onSubmit={fName.absenden}>
        <h2 className="h3">Name</h2>
        <label className="eigenschaft"><span>So erscheinst du bei „angelegt von“</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        {fName.anzeige}
        <div className="knoepfe"><button className="knopf primaer" disabled={fName.sendet || !name.trim() || name === ich.name}>Speichern</button></div>
      </form>

      <form className="blatt" onSubmit={fEmail.absenden}>
        <h2 className="h3">E-Mail-Adresse</h2>
        <p className="leise">Damit meldest du dich an{mail ? ' und bekommst Links zum Zurücksetzen des Passworts' : ''}.</p>
        <div className="raster">
          <label className="eigenschaft"><span>Neue Adresse</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label className="eigenschaft"><span>Aktuelles Passwort</span><input type="password" value={pwEmail} onChange={(e) => setPwEmail(e.target.value)} autoComplete="current-password" required /></label>
        </div>
        {fEmail.anzeige}
        <div className="knoepfe"><button className="knopf primaer" disabled={fEmail.sendet || email === ich.email || !pwEmail}>Adresse ändern</button></div>
      </form>

      <form className="blatt" onSubmit={fPw.absenden}>
        <h2 className="h3">Passwort</h2>
        <input type="email" value={ich.email} autoComplete="username" readOnly hidden />
        <div className="raster">
          <label className="eigenschaft"><span>Aktuelles Passwort</span><input type="password" value={alt} onChange={(e) => setAlt(e.target.value)} autoComplete="current-password" required /></label>
          <label className="eigenschaft"><span>Neues Passwort <small>mindestens {PASSWORT_MINDESTLAENGE} Zeichen</small></span><input type="password" value={neu} onChange={(e) => setNeu(e.target.value)} autoComplete="new-password" required /></label>
          <label className="eigenschaft"><span>Neues Passwort wiederholen</span><input type="password" value={neu2} onChange={(e) => setNeu2(e.target.value)} autoComplete="new-password" required /></label>
        </div>
        {fPw.anzeige}
        <div className="knoepfe"><button className="knopf primaer" disabled={fPw.sendet || !alt || !neu}>Passwort ändern</button></div>
      </form>

      <div className="blatt">
        <h2 className="h3">Entwicklermodus</h2>
        <p className="leise">Zeigt unten rechts bei jedem Seitenaufruf, wie lange die einzelnen Schritte gedauert haben: Netzwerk, Aufbereitung auf dem Server, Datenbankzugriffe, Übertragung, Auswerten und Darstellung im Browser. Gilt nur für dich.</p>
        <label className="haken"><input type="checkbox" checked={entwickler}
          onChange={(e) => { const an = e.target.checked; setEntwickler(an); void api.entwicklermodus(an).then(aktualisieren).catch(() => setEntwickler(!an)); }} /><span>Zeitmessung anzeigen</span></label>
      </div>
    </div>
  );
}
