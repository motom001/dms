import type { ReactNode } from 'react';
import { t } from '../../sprache';
import { Zahl, type ZahlArt } from './Zahl';
import s from '../muster.module.css';

/** Zahl auf der Musterseite (#1287, Leitsatz 9): die drei Arten an Einträgen einer Navigation, dazu die 0. */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={`zahl-${zustand}`}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const ZEILEN: Array<{ name: string; art: ZahlArt; wert: number }> = [
  { name: 'zu-erledigen', art: 'wartet', wert: 2 },
  { name: 'neue-post', art: 'wartet', wert: 0 },
  { name: 'favoriten', art: 'menge', wert: 0 },
  { name: 'vertraege', art: 'menge', wert: 14 },
  { name: 'uebersicht', art: 'warnung', wert: 3 },
];

export function ZahlMuster() {
  return (
    <div className={s.raster}>
      <Karte zustand="navigation" titel={t('oberflaeche.muster.zahl.navigation')}>
        <div className="sichtliste">
          {ZEILEN.map((z) => (
            <div key={z.name} className="sicht">
              <span className="nm">{t.frei(`oberflaeche.muster.zahl.${z.name}`)}</span>
              <Zahl wert={z.wert} art={z.art} />
            </div>
          ))}
        </div>
      </Karte>
    </div>
  );
}
