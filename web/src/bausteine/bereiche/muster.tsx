import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Bereich, useBereiche } from './Bereiche';
import s from '../muster.module.css';

/**
 * Bereiche auf der Musterseite (#1000): ein Editor mit Sprungleiste (ein Bereich mit Fehler), ein zugeklappter Bereich
 * mit Kurzinfo und ein kleiner Editor unter drei Bereichen – ohne Leiste, fest offen. Nichts wird gemerkt (neu).
 */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={zustand}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

function MitLeiste() {
  const liste = [
    ['muster-grunddaten', t('oberflaeche.muster.bereiche.grunddaten')], ['muster-wenn', t('oberflaeche.muster.bereiche.wenn')],
    ['muster-dann', t('oberflaeche.muster.bereiche.dann')], ['muster-verlauf', t('oberflaeche.muster.bereiche.verlauf')],
  ] as const;
  const b = useBereiche(liste, 'muster', null);
  const fehler = (k: (typeof liste)[number][0]) => k === 'muster-dann';
  return (
    <>
      {b.leiste(fehler, t('oberflaeche.muster.bereiche.leiste'))}
      {liste.map(([k, name]) => (
        <Bereich key={k} id={k} titel={name} klappe={b.klappe(k, fehler(k))} kurz={t('oberflaeche.muster.bereiche.kurz')}>
          {fehler(k) ? <p className="fehlertext">{t('oberflaeche.muster.bereiche.fehlertext')}</p> : <p>{t('oberflaeche.muster.bereiche.inhalt')}</p>}
        </Bereich>
      ))}
    </>
  );
}

function Zugeklappt() {
  const [offen, setOffen] = useState(false);
  return (
    <Bereich id="muster-zu" titel={t('oberflaeche.muster.bereiche.stand')} kurz={t('oberflaeche.muster.bereiche.kurz')}
      klappe={{ offen, umschalten: () => setOffen(!offen) }}>
      <p>{t('oberflaeche.muster.bereiche.inhalt')}</p>
    </Bereich>
  );
}

function Klein() {
  // Eigene Namen je Karte: Bereiche sind Landmarken und brauchen auf der Seite verschiedene Namen (axe).
  const liste = [['muster-klein-vorschau', t('oberflaeche.muster.bereiche.vorschau')], ['muster-klein-notizen', t('oberflaeche.muster.bereiche.notizen')]] as const;
  const b = useBereiche(liste, 'muster', null);
  return (
    <>
      {b.leiste()}
      {liste.map(([k, name]) => <Bereich key={k} id={k} titel={name} klappe={b.klappe(k)}><p>{t('oberflaeche.muster.bereiche.inhalt')}</p></Bereich>)}
    </>
  );
}

export function BereicheMuster() {
  return (
    <div className={s.raster}>
      <Karte zustand="bereiche-leiste" titel={t('oberflaeche.muster.bereiche.mit-leiste')}><MitLeiste /></Karte>
      <Karte zustand="bereiche-zu" titel={t('oberflaeche.muster.bereiche.zu')}><Zugeklappt /></Karte>
      <Karte zustand="bereiche-klein" titel={t('oberflaeche.muster.bereiche.klein')}><Klein /></Karte>
    </div>
  );
}
