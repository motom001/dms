import { useEffect } from 'react';
import { Ablage } from './ablage/Ablage';
import { Benutzerverwaltung } from './benutzer/Benutzerverwaltung';
import { useDaten } from './daten';
import { Einrichtung } from './einrichtung/Einrichtung';
import { useKonto } from './konto';
import { geheZu, Link, useOrt } from './ort';

export function App() {
  const { pfad, suche } = useOrt();
  const d = useDaten();
  const { ich, abmelden } = useKonto();
  const admin = ich.rolle === 'admin';
  const teile = pfad.split('/').filter(Boolean);
  const bereich = teile[0] === 'einrichtung' || teile[0] === 'benutzer' ? teile[0] : 'ablage';

  useEffect(() => { if (pfad === '/' || pfad.startsWith('/passwort/')) geheZu('/ablage', true); }, [pfad]);

  let inhalt;
  if (!d.geladen) inhalt = <p className="leise">Lade …</p>;
  else if (bereich !== 'ablage' && !admin) inhalt = <div className="leer"><p>Dieser Bereich ist Administratoren vorbehalten.</p></div>;
  else if (bereich === 'einrichtung') inhalt = <Einrichtung typId={teile[1]} />;
  else if (bereich === 'benutzer') inhalt = <Benutzerverwaltung />;
  else inhalt = <Ablage teile={teile} suche={suche} />;

  return (
    <div className={`rahmen ${bereich}`}>
      <header className="kopf">
        <div className="marke">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><rect x="4" y="7" width="24" height="21" rx="3" className="m1" /><rect x="8" y="3" width="9" height="7" rx="2" className="m2" /></svg>
          <span>DMS</span>
        </div>
        <nav className="bereiche" aria-label="Bereiche">
          <Link to="/ablage" className={bereich === 'ablage' ? 'an' : ''}>Ablage</Link>
          {admin && <Link to="/einrichtung" className={bereich === 'einrichtung' ? 'an' : ''}>Einrichtung</Link>}
          {admin && <Link to="/benutzer" className={bereich === 'benutzer' ? 'an' : ''}>Benutzer</Link>}
        </nav>
        <div className="konto">
          <span className="wer" title={ich.email}>{ich.name || ich.email}</span>
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
