import { useEffect, useState } from 'react';
import { api } from './api';
import { Ablage } from './ablage/Ablage';
import { useDaten } from './daten';
import { useKonto } from './konto';
import { geheZu, Link, useOrt } from './ort';
import { Profil } from './profil/Profil';
import { Werkbank } from './werkbank/Werkbank';

export function App() {
  const { pfad, suche } = useOrt();
  const d = useDaten();
  const { ich, abmelden, vertretung, hinweise, aktualisieren } = useKonto();
  const admin = ich.rolle === 'admin';
  const teile = pfad.split('/').filter(Boolean);
  const bereich = teile[0] === 'werkbank' || teile[0] === 'profil' ? teile[0] : 'ablage';

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
          <Link to="/profil" className={`wer ${bereich === 'profil' ? 'an' : ''}`} title={`Profil von ${ich.email}`}>{ich.name || ich.email}</Link>
          <button className="textknopf" onClick={() => void abmelden()}>Abmelden</button>
          {/* AGPL: Wer das DMS über das Netz nutzt, soll an den Quellcode kommen. */}
          <a className="quelle" href="https://github.com/motom001/dms" target="_blank" rel="noreferrer">Quellcode</a>
        </div>
      </header>
      <main className="rumpf">
        {d.fehler && <div className="hinweis schlecht"><p>{d.fehler}</p><button className="knopf klein" onClick={() => void d.neuLaden()}>Erneut versuchen</button></div>}
        {inhalt}
      </main>
    </div>
  );
}

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
