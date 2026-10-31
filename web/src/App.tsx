import { useEffect, useRef, useState } from 'react';
import { abwesenheitWirkt, ROLLEN } from '../../shared/src/model';
import { heuteIn } from '../../shared/src/sichten';
import { leseSchrift, setzeSchrift } from './design';
import { api } from './api';
import { Ablage } from './ablage/Ablage';
import { useDaten } from './daten';
import { useKonto } from './konto';
import { geheZu, Link, useOrt } from './ort';
import { Messpanel } from './Messpanel';
import { logoUrl, Marke, schriftzugVon } from './Marke';
import { ApiDoku } from './profil/ApiDoku';
import { Profil } from './profil/Profil';
import { Werkbank } from './werkbank/Werkbank';
import { WartungsBanner } from './wartung';
import { NeuKnopf, PostAblage } from './ablage/NeuePost';
import { ErreichbarkeitsBanner, useBeiWiederErreichbar } from './erreichbar';
import { useHandbuch } from './Hilfe';

export function App() {
  const { pfad, suche } = useOrt();
  const d = useDaten();
  const { ich, abmelden, vertretung, hinweise, aktualisieren, version } = useKonto();
  // Nach einem Ausfall (#122): gemeinsame Daten neu holen; „Ansicht neu laden“ baut den Inhalt neu auf.
  const [ansicht, setAnsicht] = useState(0);
  useBeiWiederErreichbar(() => void d.neuLaden());
  const admin = ich.rolle === 'admin';
  const teile = pfad.split('/').filter(Boolean);
  const bereich = teile[0] === 'werkbank' || teile[0] === 'profil' ? teile[0] : teile[0] === 'api-doku' ? 'profil' : 'ablage';
  // Titel und Symbol im Browser-Tab aus dem Design (#72).
  const marke = schriftzugVon(d.meinDesign) || 'DMS';
  const symbol = logoUrl(d.meinDesign);
  useEffect(() => {
    document.title = `${marke} – ${{ ablage: 'Ablage', werkbank: 'Werkbank', profil: 'Profil' }[bereich]}`;
    setzeSymbol(symbol);
  }, [marke, symbol, bereich]);
  // Schriftgröße dieses Geräts (#69: gewählt in Profil → Darstellung).
  useEffect(() => { setzeSchrift(ich.id, leseSchrift(ich.id)); }, [ich.id]);

  useEffect(() => {
    if (pfad === '/' || pfad.startsWith('/passwort/')) geheZu('/ablage', true);
    // Frühere Adressen
    else if (teile[0] === 'einrichtung') geheZu(`/werkbank/typen${teile[1] ? `/${teile[1]}` : ''}`, true);
    else if (teile[0] === 'benutzer') geheZu('/werkbank/benutzer', true);
  }, [pfad]); // eslint-disable-line react-hooks/exhaustive-deps

  let inhalt;
  if (!d.geladen) inhalt = <p className="leise">Lade …</p>;
  else if (bereich === 'werkbank' && !admin) inhalt = <div className="leer"><p>{teile[1] === 'pakete' && new URLSearchParams(location.search).has('installieren') ? 'Pakete installieren nur Administratoren. Schick den Link an einen Administrator deines DMS.' : 'Die Werkbank ist Administratoren vorbehalten.'}</p></div>;
  else if (bereich === 'werkbank') inhalt = <Werkbank teile={teile} />;
  else if (teile[0] === 'api-doku') inhalt = <ApiDoku />;
  else if (bereich === 'profil') inhalt = <Profil teile={teile} />;
  else inhalt = <Ablage teile={teile} suche={suche} />;

  return (
    <div className={`rahmen ${bereich}`}>
      {vertretung && (
        <div className="vertretungsbanner" role="alert">
          <p><strong>{vertretung.adminName}, du agierst als {ich.name || ich.email}</strong> ({ich.email}, seit {uhrzeit(vertretung.beginn)}). Alles, was du jetzt tust, geschieht unter diesem Konto.</p>
          <button className="knopf klein" onClick={() => void api.vertretungBeenden().then(() => { geheZu('/werkbank/benutzer', true); return aktualisieren(); })}>Zurück zum eigenen Konto</button>
        </div>
      )}
      {!vertretung && hinweise.length > 0 && <Hinweise />}
      <ErreichbarkeitsBanner version={version} ansichtNeuLaden={() => { setAnsicht((n) => n + 1); void d.neuLaden(); }} />
      <WartungsBanner admin={admin} abgemeldet={() => void aktualisieren()} />
      {/* #128: Administratoren richten ein, arbeiten aber nicht in der Ablage. */}
      {admin && !vertretung && bereich === 'ablage' && (
        <div className="adminbanner" role="alert">
          <p><strong>Du bist als Administrator in der Ablage.</strong> Ein Administrator sollte nicht für die tägliche Arbeit verwendet werden – du siehst hier alle Mappen, auch solche, die für andere gesperrt sind. Für den Alltag ist ein normaler Benutzer schnell angelegt.</p>
          <Link to="/werkbank/benutzer/neu" className="knopf klein">Benutzer anlegen</Link>
        </div>
      )}
      <header className="kopf">
        <Link to={d.einstellungen.startseite === false ? '/ablage/eingang' : '/ablage/start'} className="marke" title="Zur Startseite">
          <Marke logo={logoUrl(d.meinDesign)} schriftzug={schriftzugVon(d.meinDesign)} /><span className="sr-only">{schriftzugVon(d.meinDesign) ? '' : schriftzugVon(null)} – Startseite</span>
        </Link>
        <nav className="bereiche" aria-label="Bereiche">
          <Link to="/ablage" className={bereich === 'ablage' ? 'an' : ''}>Ablage</Link>
          {admin && <Link to="/werkbank/typen" className={bereich === 'werkbank' ? 'an' : ''}>Werkbank</Link>}
        </nav>
        <NeuKnopf />
        <div className="konto">
          <Benutzermenue an={bereich === 'profil'} abmelden={abmelden} />
          {/* AGPL: Wer das DMS über das Netz nutzt, soll an den Quellcode kommen. */}
          <a className="quelle" href="https://github.com/motom001/dms" target="_blank" rel="noreferrer">Quellcode</a>
        </div>
      </header>
      <main className="rumpf" key={ansicht}>
        {d.fehler && <div className="hinweis schlecht"><p>{d.fehler}</p><button className="knopf klein" onClick={() => void d.neuLaden()}>Erneut versuchen</button></div>}
        {inhalt}
      </main>
      <PostAblage />
      {ich.entwicklermodus && <Messpanel />}
    </div>
  );
}

/** Symbol im Browser-Tab: eigenes Logo oder das ursprüngliche (#72). */
let ursprungsSymbol: string | null = null;
export function setzeSymbol(url: string | null) {
  const el = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!el) return;
  ursprungsSymbol ??= el.href;
  el.href = url ?? ursprungsSymbol;
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

/** Menü unter dem eigenen Namen (#69): Konto, Einstellungen, Hilfe, Fehler melden, Abmelden. */
function Benutzermenue({ an, abmelden }: { an: boolean; abmelden: () => Promise<void> }) {
  const { ich, vertretung, aktualisieren } = useKonto();
  const handbuch = useHandbuch();
  const [offen, setOffen] = useState(false);
  const abwesend = abwesenheitWirkt(ich.abwesenheit, heuteIn());
  const rahmen = useRef<HTMLDivElement>(null);
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
        {ich.name || ich.email}{abwesend && <span className="abwesend-punkt" title="Du bist abwesend" aria-label="(abwesend)" />} <span aria-hidden="true">▾</span>
      </button>
      {offen && (
        <div className="menue" role="menu">
          <div className="menuekopf">
            <strong>{ich.name || ich.email}</strong>
            <span className="leise klein">{ich.email} · {ROLLEN[ich.rolle]}</span>
            {vertretung && <span className="chip warn">Als {ich.name || ich.email} angemeldet</span>}
            {abwesend && <Link to="/profil/abwesenheit" className="chip warn">Du bist abwesend{ich.abwesenheit?.bis ? ` (bis ${ich.abwesenheit.bis.split('-').reverse().join('.')})` : ''}</Link>}
          </div>
          {vertretung && <button type="button" className="menuepunkt" onClick={() => { setOffen(false); void api.vertretungBeenden().then(() => { geheZu('/werkbank/benutzer', true); return aktualisieren(); }); }}>Zurück zum eigenen Konto</button>}
          {/* Jeder Weg nur einmal (#175): Darstellung, Abwesenheit usw. sind Reiter unter „Mein Konto“. */}
          <Link to="/profil/konto" className="menuepunkt">Mein Konto</Link>
          <a href={handbuch('benutzer')} target="_blank" rel="noreferrer" className="menuepunkt" onClick={() => setOffen(false)}>Hilfe <span aria-hidden="true">↗</span></a>
          <Link to="/profil/fehler-melden" className="menuepunkt">Fehler melden</Link>
          <button type="button" className="menuepunkt" onClick={() => void abmelden()}>Abmelden</button>
        </div>
      )}
    </div>
  );
}
