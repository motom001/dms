import type { ReactNode } from 'react';
import { t } from '../../sprache';
import { KnopfLink } from '../knopf/Knopf';
import { Tabelle, type TabelleSpalte, type TabelleZeile } from './Tabelle';
import s from '../muster.module.css';

/** Tabelle auf der Musterseite (#1030): mit Zeilen, schmal als Liste, leer. */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={zustand}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const spalten = (): TabelleSpalte[] => [
  { key: 'nr', titel: t('oberflaeche.muster.tabelle.nr'), rechts: true },
  { key: 'beschreibung', titel: t('oberflaeche.muster.tabelle.beschreibung') },
  { key: 'menge', titel: t('oberflaeche.muster.tabelle.menge'), rechts: true },
  { key: 'preis', titel: t('oberflaeche.muster.tabelle.preis'), rechts: true },
];
const zeilen = (): TabelleZeile[] => [
  { key: '1', ziel: '/muster#tabelle', ersatz: '–', zellen: { nr: '1', beschreibung: t('oberflaeche.muster.tabelle.zeile1'), menge: '2', preis: '24,00 €' } },
  { key: '2', ziel: '/muster#tabelle', ersatz: '–', zellen: { nr: '2', beschreibung: t('oberflaeche.muster.tabelle.zeile2'), menge: '1', preis: '89,90 €' } },
];

export function TabelleMuster() {
  const neu = <KnopfLink to="/muster#tabelle" art="neben" groesse="klein">{t('oberflaeche.muster.tabelle.neu')}</KnopfLink>;
  return (
    <div className={s.raster}>
      <Karte zustand="tabelle-breit" titel={t('oberflaeche.muster.tabelle.breit')}>
        <Tabelle beschriftung={t('oberflaeche.muster.tabelle.titel')} spalten={spalten()} zeilen={zeilen()} leer={t('oberflaeche.muster.tabelle.leer')} breitAb={200} fuss={neu} />
      </Karte>
      <Karte zustand="tabelle-schmal" titel={t('oberflaeche.muster.tabelle.schmal')}>
        <Tabelle beschriftung={t('oberflaeche.muster.tabelle.titel')} spalten={spalten()} zeilen={zeilen()} leer={t('oberflaeche.muster.tabelle.leer')} breitAb={100000} fuss={neu} />
      </Karte>
      <Karte zustand="tabelle-leer" titel={t('oberflaeche.muster.zustand.leer')}>
        <Tabelle beschriftung={t('oberflaeche.muster.tabelle.titel')} spalten={spalten()} zeilen={[]} leer={t('oberflaeche.muster.tabelle.leer')} fuss={neu} />
      </Karte>
    </div>
  );
}
