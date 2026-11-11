import { StrictMode, useEffect, useState, type ComponentType } from 'react';
import type { Root } from 'react-dom/client';
import { GRUNDLAGEN, MARKE, wendeAn, type Grundlage } from '../design';
import { Fehlergrenze } from '../Fehlergrenze';
import { t } from '../sprache';
import { Feld } from './feld/Feld';
import { FeldMuster } from './feld/muster';
import { KnopfMuster } from './knopf/muster';
import { EinheitMuster } from './einheit/muster';
import { TabelleMuster } from './tabelle/muster';
import { SucheMuster } from './suche/muster';
import s from './muster.module.css';

/**
 * Musterseite der Bausteine (#967) unter /muster: jeder Baustein in jedem Zustand, hell und dunkel umschaltbar.
 * Nur im Entwicklungsmodus (`npm run dev`) und im Testbau (`VITE_MUSTER=1`); start.tsx lädt diese Datei nur dann,
 * der Produktivbau enthält sie nicht. Die Rauchtests fotografieren die Seite und prüfen sie mit axe.
 *
 * Neuer Baustein: eigenen Ordner mit `muster.tsx` anlegen und unten in BAUSTEINE eintragen – mehr braucht es nicht.
 */
interface Musterbereich { id: string; titel: () => string; text: () => string; Muster: ComponentType }

const BAUSTEINE: Musterbereich[] = [
  { id: 'feld', titel: () => t('oberflaeche.muster.feld.titel'), text: () => t('oberflaeche.muster.feld.text'), Muster: FeldMuster },
  { id: 'knopf', titel: () => t('oberflaeche.muster.knopf.titel'), text: () => t('oberflaeche.muster.knopf.text'), Muster: KnopfMuster },
  { id: 'einheit', titel: () => t('oberflaeche.muster.einheit.titel'), text: () => t('oberflaeche.muster.einheit.text'), Muster: EinheitMuster },
  { id: 'tabelle', titel: () => t('oberflaeche.muster.tabelle.titel'), text: () => t('oberflaeche.muster.tabelle.text'), Muster: TabelleMuster },
  { id: 'suche', titel: () => t('oberflaeche.muster.suche.titel'), text: () => t('oberflaeche.muster.suche.text'), Muster: SucheMuster },
];

const DARSTELLUNGEN = Object.keys(GRUNDLAGEN) as Grundlage[];

/** Darstellung aus der Adresse (?darstellung=dunkel), damit ein Link oder Bild sie festhalten kann. */
function anfangsDarstellung(): Grundlage {
  const d = new URLSearchParams(location.search).get('darstellung');
  return DARSTELLUNGEN.find((x) => x === d) ?? 'automatisch';
}

function Darstellungswahl() {
  const [d, setD] = useState<Grundlage>(anfangsDarstellung);
  useEffect(() => {
    // Wie ein Design (#21): „Automatisch“ nimmt tokens.css nach Gerät, sonst eine feste Grundlage.
    wendeAn(d === 'automatisch' ? null : { id: 'muster', name: '', grundlage: d, primaer: MARKE.blau, sekundaer: MARKE.gruen, css: '' });
    const u = new URL(location.href);
    if (d === 'automatisch') u.searchParams.delete('darstellung'); else u.searchParams.set('darstellung', d);
    history.replaceState(null, '', u);
  }, [d]);
  return (
    <Feld beschriftung={t('oberflaeche.muster.darstellung')} className={s.darstellung}>
      <select value={d} onChange={(e) => setD(e.target.value as Grundlage)}>
        {DARSTELLUNGEN.map((x) => <option key={x} value={x}>{GRUNDLAGEN[x]}</option>)}
      </select>
    </Feld>
  );
}

export function Musterseite() {
  useEffect(() => { document.title = t('oberflaeche.muster.titel'); }, []);
  return (
    <div className={s.seite}>
      <header className={s.kopf}>
        <div className={s.titel}>
          <h1>{t('oberflaeche.muster.titel')}</h1>
          <p className="leise">{t('oberflaeche.muster.einleitung')}</p>
        </div>
        <Darstellungswahl />
      </header>
      <nav aria-label={t('oberflaeche.muster.inhalt')} className={s.inhalt}>
        <ul>{BAUSTEINE.map((b) => <li key={b.id}><a href={`#${b.id}`}>{b.titel()}</a></li>)}</ul>
      </nav>
      <main className={s.bereiche}>
        {BAUSTEINE.map(({ id, titel, text, Muster }) => (
          <section key={id} id={id} aria-labelledby={`${id}-titel`} className={s.bereich}>
            <h2 id={`${id}-titel`}>{titel()}</h2>
            <p className="leise">{text()}</p>
            <Muster />
          </section>
        ))}
      </main>
    </div>
  );
}

/** Aufruf aus start.tsx. */
export function zeigeMuster(wurzel: Root) {
  wurzel.render(<StrictMode><Fehlergrenze><Musterseite /></Fehlergrenze></StrictMode>);
}
