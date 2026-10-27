import { useEffect } from 'react';
import { Ablage } from './ablage/Ablage';
import { useDaten } from './daten';
import { useKonto } from './konto';
import { geheZu, Link, useOrt } from './ort';
import { Profil } from './profil/Profil';
import { Werkbank } from './werkbank/Werkbank';

export function App() {
  const { pfad, suche } = useOrt();
  const d = useDaten();
  const { ich, abmelden } = useKonto();
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
