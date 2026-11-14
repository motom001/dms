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
import { UmschalterMuster } from './umschalter/muster';
import { BereicheMuster } from './bereiche/muster';
import { FassungenMuster } from './fassungen/muster';
import { SpeicherleisteMuster } from './speicherleiste/muster';
import { ReiterMuster } from './reiter/muster';
import { SchalterMuster } from './schalter/muster';
import { PaketChipMuster } from './paketchip/muster';
import { WahlhakenMuster } from './wahlhaken/muster';
import { MehrfachauswahlMuster } from './mehrfachauswahl/muster';
import { MenueMuster } from './menue/muster';
import { PlatzhalterMuster } from './platzhalter/muster';
import { Rueckfragen } from './rueckfrage/Rueckfrage';
import s from './muster.module.css';

/**
 * Musterseite der Bausteine (#967) unter /muster: jeder Baustein in jedem Zustand, hell und dunkel umschaltbar.
 * Oben die Leitsätze (#1210), damit jeder sie neben den Bausteinen liest.
 * Nur im Entwicklungsmodus (`npm run dev`) und im Testbau (`VITE_MUSTER=1`); start.tsx lädt diese Datei nur dann,
 * der Produktivbau enthält sie nicht. Die Rauchtests fotografieren die Seite und prüfen sie mit axe.
 *
 * Neuer Baustein: eigenen Ordner mit `muster.tsx` anlegen und unten in BAUSTEINE eintragen – mehr braucht es nicht.
 */
interface Musterbereich { id: string; titel: () => string; text: () => string; Muster: ComponentType }

const BAUSTEINE: Musterbereich[] = [
  { id: 'feld', titel: () => t('oberflaeche.muster.feld.titel'), text: () => t('oberflaeche.muster.feld.text'), Muster: FeldMuster },
  { id: 'knopf', titel: () => t('oberflaeche.muster.knopf.titel'), text: () => t('oberflaeche.muster.knopf.text'), Muster: KnopfMuster },
  { id: 'speicherleiste', titel: () => t('oberflaeche.muster.leiste.titel'), text: () => t('oberflaeche.muster.leiste.text'), Muster: SpeicherleisteMuster },
  { id: 'reiter', titel: () => t('oberflaeche.muster.reiter.titel'), text: () => t('oberflaeche.muster.reiter.text'), Muster: ReiterMuster },
  { id: 'schalter', titel: () => t('oberflaeche.muster.schalter.titel'), text: () => t('oberflaeche.muster.schalter.text'), Muster: SchalterMuster },
  { id: 'paketchip', titel: () => t('oberflaeche.muster.paketchip.titel'), text: () => t('oberflaeche.muster.paketchip.text'), Muster: PaketChipMuster },
  { id: 'menue', titel: () => t('oberflaeche.muster.menue.titel'), text: () => t('oberflaeche.muster.menue.text'), Muster: MenueMuster },
  { id: 'wahlhaken', titel: () => t('oberflaeche.muster.wahlhaken.titel'), text: () => t('oberflaeche.muster.wahlhaken.text'), Muster: WahlhakenMuster },
  { id: 'mehrfachauswahl', titel: () => t('oberflaeche.muster.mehrfachauswahl.titel'), text: () => t('oberflaeche.muster.mehrfachauswahl.text'), Muster: MehrfachauswahlMuster },
  { id: 'einheit', titel: () => t('oberflaeche.muster.einheit.titel'), text: () => t('oberflaeche.muster.einheit.text'), Muster: EinheitMuster },
  { id: 'tabelle', titel: () => t('oberflaeche.muster.tabelle.titel'), text: () => t('oberflaeche.muster.tabelle.text'), Muster: TabelleMuster },
  { id: 'suche', titel: () => t('oberflaeche.muster.suche.titel'), text: () => t('oberflaeche.muster.suche.text'), Muster: SucheMuster },
  { id: 'umschalter', titel: () => t('oberflaeche.muster.umschalter.titel'), text: () => t('oberflaeche.muster.umschalter.text'), Muster: UmschalterMuster },
  { id: 'bereiche', titel: () => t('oberflaeche.muster.bereiche.titel'), text: () => t('oberflaeche.muster.bereiche.text'), Muster: BereicheMuster },
  { id: 'fassungen', titel: () => t('oberflaeche.muster.fassungen.titel'), text: () => t('oberflaeche.muster.fassungen.text'), Muster: FassungenMuster },
  { id: 'platzhalter', titel: () => t('oberflaeche.muster.platzhalter.titel'), text: () => t('oberflaeche.muster.platzhalter.text'), Muster: PlatzhalterMuster },
];

/** Leitsätze für Knöpfe (#1210), ausführlich im Entwicklerhandbuch unter „Gestaltung und Bausteine“. */
const LEITSAETZE = [1, 2, 3, 4, 5, 6];

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
      <section aria-labelledby="leitsaetze-titel" className={s.leitsaetze}>
        <h2 id="leitsaetze-titel">{t('oberflaeche.muster.leitsaetze')}</h2>
        <ol>{LEITSAETZE.map((n) => <li key={n}>{t.frei(`oberflaeche.muster.leitsatz.${n}`)}</li>)}</ol>
      </section>
      <main className={s.bereiche}>
        {BAUSTEINE.map(({ id, titel, text, Muster }) => (
          <section key={id} id={id} aria-labelledby={`${id}-titel`} className={s.bereich}>
            <h2 id={`${id}-titel`}>{titel()}</h2>
            <p className="leise">{text()}</p>
            <Muster />
          </section>
        ))}
      </main>
      {/* Die echte Rückfrage für „Ausprobieren“ und „… löschen“ (#1210). */}
      <Rueckfragen />
    </div>
  );
}

/** Aufruf aus start.tsx. */
export function zeigeMuster(wurzel: Root) {
  wurzel.render(<StrictMode><Fehlergrenze><Musterseite /></Fehlergrenze></StrictMode>);
}
