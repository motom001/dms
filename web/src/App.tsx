import { useEffect } from 'react';
import { Ablage } from './ablage/Ablage';
import { useDaten } from './daten';
import { Einrichtung } from './einrichtung/Einrichtung';
import { geheZu, Link, useOrt } from './ort';

export function App() {
  const { pfad, suche } = useOrt();
  const d = useDaten();
  const teile = pfad.split('/').filter(Boolean);
  const bereich = teile[0] === 'einrichtung' ? 'einrichtung' : 'ablage';

  useEffect(() => { if (pfad === '/') geheZu('/ablage', true); }, [pfad]);

  return (
    <>
      <header className="kopf">
        <div className="marke">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><rect x="4" y="7" width="24" height="21" rx="3" className="m1" /><rect x="8" y="3" width="9" height="7" rx="2" className="m2" /></svg>
          <span>DMS</span>
        </div>
        <nav className="bereiche" aria-label="Bereiche">
          <Link to="/ablage" className={bereich === 'ablage' ? 'an' : ''}>Ablage</Link>
          <Link to="/einrichtung" className={bereich === 'einrichtung' ? 'an' : ''}>Einrichtung</Link>
        </nav>
      </header>
      <main className="rumpf">
        {d.fehler && <div className="hinweis schlecht"><p>{d.fehler}</p><button className="knopf klein" onClick={() => void d.neuLaden()}>Erneut versuchen</button></div>}
        {!d.geladen ? <p className="leise">Lade …</p> : bereich === 'einrichtung'
          ? <Einrichtung typId={teile[1]} />
          : <Ablage teile={teile} suche={suche} />}
      </main>
    </>
  );
}
