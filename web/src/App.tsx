import { useEffect, useRef, useState } from 'react';
import { leseSchrift, SCHRIFTEN, setzeSchrift, type Schrift } from './design';
import { api } from './api';
import { Ablage } from './ablage/Ablage';
import { useDaten } from './daten';
import { useKonto } from './konto';
import { geheZu, Link, useOrt } from './ort';
import { Messpanel } from './Messpanel';
import { ApiDoku } from './profil/ApiDoku';
import { Profil } from './profil/Profil';
import { Werkbank } from './werkbank/Werkbank';

export function App() {
  const { pfad, suche } = useOrt();
  const d = useDaten();
  const { ich, abmelden, vertretung, hinweise, aktualisieren } = useKonto();
  const admin = ich.rolle === 'admin';
  const teile = pfad.split('/').filter(Boolean);
  const bereich = teile[0] === 'werkbank' || teile[0] === 'profil' ? teile[0] : teile[0] === 'api-doku' ? 'profil' : 'ablage';

  useEffect(() => {
    if (pfad === '/' || pfad.startsWith('/passwort/')) geheZu('/ablage', true);
    // Frühere Adressen
    else if (teile[0] === 'einrichtung') geheZu(`/werkbank/typen${teile[1] ? `/${teile[1]}` : ''}`, true);
    else if (teile[0] === 'benutzer') geheZu('/werkbank/benutzer', true);
  }, [pfad]); // eslint-disable-line react-hooks/exhaustive-deps

  let inhalt;
  if (!d.geladen) inhalt = <p className="leise">Lade …</p>;
  else if (bereich === 'werkbank' && !admin) inhalt = <div className="leer"><p>Die Werkbank ist Administratoren vorbehalten.</p></div>;
  else if (bereich === 'werkbank') inhalt = <Werkbank teile={teile} />;
  else if (teile[0] === 'api-doku') inhalt = <ApiDoku />;
  else if (bereich === 'profil') inhalt = <Profil />;
  else inhalt = <Ablage teile={teile} suche={suche} />;

  return (
    <div className={`rahmen ${bereich}`}>
      {vertretung && (
        <div className="vertretungsbanner" role="alert">
          <p><strong>{vertretung.adminName}, du agierst als {ich.name || ich.email}</strong> ({ich.email}, seit {uhrzeit(vertretung.beginn)}). Alles, was du jetzt tust, geschieht unter diesem Konto.</p>
          <button className="knopf klein" onClick={() => void api.vertretungBeenden().then(() => { geheZu('/werkbank/benutzer', true); return aktualisieren(); })}>Zurück zu meinem Konto</button>
        </div>
      )}
      {!vertretung && hinweise.length > 0 && <Hinweise />}
      <header className="kopf">
        <div className="marke">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><rect x="4" y="7" width="24" height="21" rx="3" className="m1" /><rect x="8" y="3" width="9" height="7" rx="2" className="m2" /></svg>
          <span>DMS</span>
        </div>
        <nav className="bereiche" aria-label="Bereiche">
          <Link to="/ablage" className={bereich === 'ablage' ? 'an' : ''}>Ablage</Link>
          {admin && <Link to="/werkbank/typen" className={bereich === 'werkbank' ? 'an' : ''}>Werkbank</Link>}
        </nav>
        <div className="konto">
          <Benutzermenue an={bereich === 'profil'} abmelden={abmelden} />
          {/* AGPL: Wer das DMS über das Netz nutzt, soll an den Quellcode kommen. */}
          <a className="quelle" href="https://github.com/motom001/dms" target="_blank" rel="noreferrer">Quellcode</a>
        </div>
      </header>
      <main className="rumpf">
        {d.fehler && <div className="hinweis schlecht"><p>{d.fehler}</p><button className="knopf klein" onClick={() => void d.neuLaden()}>Erneut versuchen</button></div>}
        {inhalt}
      </main>
      {ich.entwicklermodus && <Messpanel />}
    </div>
  );
}

/** Handbücher auf GitHub Pages (#25). */
export const HANDBUCH = {
  benutzer: 'https://motom001.github.io/dms/benutzer/',
  admin: 'https://motom001.github.io/dms/admin/',
};

const uhrzeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

/** Hinweis an den Benutzer: Ein Administrator hat als er agiert. */
function Hinweise() {
  const { hinweise, aktualisieren } = useKonto();
  const [weg, setWeg] = useState(false);
  if (weg) return null;
  return (
    <div className="hinweisbanner" role="status">
      <div>
        <p><strong>{hinweise.length === 1 ? 'Ein Administrator hat' : 'Administratoren haben'} in deinem Namen gearbeitet</strong>, um einen Fehler nachzustellen:</p>
        <ul>{hinweise.map((h) => <li key={h.id}>{h.adminName}: {uhrzeit(h.beginn)} bis {h.ende ? uhrzeit(h.ende) : 'jetzt (noch nicht beendet)'}</li>)}</ul>
      </div>
      <button className="knopf klein" onClick={() => { setWeg(true); void api.hinweiseGesehen().then(aktualisieren); }}>Verstanden</button>
    </div>
  );
}

/** Menü unter dem eigenen Namen: Profil, Hilfe, Schriftgröße (je Gerät), Abmelden. */
function Benutzermenue({ an, abmelden }: { an: boolean; abmelden: () => Promise<void> }) {
  const { ich } = useKonto();
  const [offen, setOffen] = useState(false);
  const [schrift, setSchrift] = useState<Schrift>(() => leseSchrift(ich.id));
  const rahmen = useRef<HTMLDivElement>(null);
  useEffect(() => { setzeSchrift(ich.id, schrift); }, [ich.id, schrift]);
  useEffect(() => {
    if (!offen) return;
    const zu = (e: Event) => { if (!rahmen.current?.contains(e.target as Node)) setOffen(false); };
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    const weg = () => setOffen(false);
    addEventListener('pointerdown', zu); addEventListener('keydown', taste); addEventListener('popstate', weg);
    return () => { removeEventListener('pointerdown', zu); removeEventListener('keydown', taste); removeEventListener('popstate', weg); };
  }, [offen]);
  return (
    <div className="benutzermenue" ref={rahmen}>
      <button type="button" className={`wer ${an ? 'an' : ''}`} aria-haspopup="menu" aria-expanded={offen} onClick={() => setOffen(!offen)}>
        {ich.name || ich.email} <span aria-hidden="true">▾</span>
      </button>
      {offen && (
        <div className="menue" role="menu">
          <p className="leise klein">{ich.email}</p>
          <Link to="/profil" className="menuepunkt">Profil und Design</Link>
          <a href={HANDBUCH.benutzer} target="_blank" rel="noreferrer" className="menuepunkt" onClick={() => setOffen(false)}>Hilfe <span aria-hidden="true">↗</span></a>
          {ich.rolle === 'admin' && <a href={HANDBUCH.admin} target="_blank" rel="noreferrer" className="menuepunkt" onClick={() => setOffen(false)}>Administratorhandbuch <span aria-hidden="true">↗</span></a>}
          <div className="menuegruppe">
            <span className="leise klein">Schriftgröße auf diesem Gerät</span>
            <div className="segmente" role="radiogroup" aria-label="Schriftgröße">
              {(Object.keys(SCHRIFTEN) as Schrift[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={schrift === k} className={schrift === k ? 'an' : ''} onClick={() => setSchrift(k)}
                  style={{ fontSize: `${13 * SCHRIFTEN[k].skala}px` }}>{SCHRIFTEN[k].name}</button>
              ))}
            </div>
          </div>
          <button type="button" className="menuepunkt" onClick={() => void abmelden()}>Abmelden</button>
        </div>
      )}
    </div>
  );
}
