import type { ReactNode } from 'react';
import { t } from '../../sprache';
import type { KnopfSperre } from '../knopf/Knopf';
import { Speicherleiste, type Entwurf, type SpeicherleisteLoeschen } from './Speicherleiste';
import s from '../muster.module.css';

/**
 * Speicherleiste auf der Musterseite (#1210): nichts geändert (Verwerfen und Speichern blass), geändert, „… löschen“
 * gesperrt aus einem Grund, neu (Entwurf verwerfen, anlegen). „… löschen“ steht links auf einer Linie mit den
 * anderen Knöpfen; ein Klick öffnet die echte Rückfrage.
 */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={`leiste-${zustand}`}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const entwurf = (neu: boolean, geaendert: boolean): Entwurf => ({ neu, geaendert, verwerfen: async () => {}, tasten: () => {} });
const gegenstand = () => t('oberflaeche.muster.leiste.gegenstand');
const loeschen = (gesperrt?: KnopfSperre): SpeicherleisteLoeschen => ({
  text: t('oberflaeche.muster.leiste.loeschen'),
  rueckfrage: { titel: t('oberflaeche.muster.leiste.frage.titel'), text: t('oberflaeche.muster.leiste.frage.text'), ja: t('oberflaeche.muster.leiste.frage.ja') },
  onClick: () => {},
  gesperrt,
});

export function SpeicherleisteMuster() {
  return (
    <div className={s.spalte}>
      <Karte zustand="ruhig" titel={t('oberflaeche.muster.leiste.ruhig')}>
        <Speicherleiste ent={entwurf(false, false)} gegenstand={gegenstand()} speichern={() => {}} loeschen={loeschen()} />
      </Karte>
      <Karte zustand="geaendert" titel={t('oberflaeche.muster.leiste.geaendert')}>
        <Speicherleiste ent={entwurf(false, true)} gegenstand={gegenstand()} speichern={() => {}} loeschen={loeschen()} />
      </Karte>
      <Karte zustand="gesperrt" titel={t('oberflaeche.muster.leiste.gesperrt')}>
        <Speicherleiste ent={entwurf(false, true)} gegenstand={gegenstand()} speichern={() => {}} loeschen={loeschen({ grund: t('oberflaeche.muster.leiste.grund') })} />
      </Karte>
      <Karte zustand="neu" titel={t('oberflaeche.muster.leiste.neu')}>
        <Speicherleiste ent={entwurf(true, true)} gegenstand={gegenstand()} speichern={() => {}} />
      </Karte>
    </div>
  );
}
