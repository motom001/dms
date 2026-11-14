import { useEffect, useRef, useState } from 'react';
import type { TippAnzeige } from '../../../shared/src/entdecken';
import { Knopf } from '../bausteine';
import { useDaten } from '../daten';
import { tippHandlung, useEntdecken, zeigeZiel } from '../entdecken/stand';
import { Link } from '../ort';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import s from './Begleiter.module.css';

/**
 * Reiter „Tipps“ im Assistenten (#1219): der Tipp des Tages (#832) als Karte mit „Zeig es mir“ und „Nächster Tipp“,
 * darunter „Alle Tipps ansehen ›“ (Ablago entdecken). Früher stand der Tipp als leise Zeile auf der Startseite.
 *
 * Sobald die Karte den Tipp des Tages zeigt, meldet sie ihn als gezeigt – damit verschwindet der Punkt am Knopf.
 * „Nächster Tipp“ blättert durch die übrigen Tipps, die nicht ausgeblendet sind; „Zeig es mir“ schließt das Fenster,
 * öffnet die Stelle und hebt sie hervor.
 */
export function TippKarte({ schliessen }: { schliessen(): void }) {
  const { stand } = useEntdecken();
  const d = useDaten();
  const liste = (stand?.tipps ?? []).filter((x) => !x.ausgeblendet);
  // Vorn der Tipp des Tages, dann die übrigen in ihrer Reihenfolge.
  const heute = stand?.tipp ? liste.find((x) => x.schluessel === stand.tipp!.schluessel) : undefined;
  const reihe = heute ? [heute, ...liste.filter((x) => x !== heute)] : liste;
  const [nr, setNr] = useState(0);
  const x: TippAnzeige | undefined = reihe[nr % Math.max(1, reihe.length)];
  const desTages = !!heute && x === heute;
  const gemeldet = useRef<string | null>(null);
  useEffect(() => {
    if (!x || gemeldet.current === x.schluessel) return;
    gemeldet.current = x.schluessel;
    if (desTages && !stand?.tipp?.gesehen) void tippHandlung(x.schluessel, 'gezeigt');
  }, [x, desTages, stand?.tipp?.gesehen]);

  if (!stand) return <p className="leise">{t('oberflaeche.begleiter.tipps.lade')}</p>;
  return (
    <div className={s.tipps}>
      {x ? (
        <section className={s.tippkarte} data-anker="startseite.tipp" aria-labelledby="begleiter-tipp">
          <h3 id="begleiter-tipp" className={s.tippkopf}><Symbol name="tipp" />{desTages ? t('oberflaeche.begleiter.tipps.des-tages') : t('oberflaeche.begleiter.tipps.tipp')}</h3>
          <p>{x.neu ? t('entdecken.zeile.neu', { text: x.text }) : x.text}</p>
          <div className="knoepfe">
            {(x.ziel || x.rundgang) && (
              <Knopf onClick={() => { schliessen(); if (desTages) void tippHandlung(x.schluessel, 'erledigt'); void zeigeZiel(x); }}>{t('oberflaeche.begleiter.tipps.zeigen')}</Knopf>
            )}
            {reihe.length > 1 && <Knopf onClick={() => setNr(nr + 1)}>{t('oberflaeche.begleiter.tipps.naechster')}</Knopf>}
          </div>
        </section>
      ) : <p className="leise">{t('entdecken.seite.keine-tipps')}</p>}
      {d.einstellungen.tipps === false && <p className="leise klein">{t('oberflaeche.begleiter.tipps.aus')}</p>}
      {/* Der Weg nach „Ablago entdecken“ schließt das Fenster – die Seite zeigt alle Tipps. */}
      <p onClickCapture={schliessen}><Link to="/entdecken" className="verweis">{t('oberflaeche.begleiter.tipps.alle')}</Link></p>
    </div>
  );
}
