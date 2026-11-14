import { t } from '../sprache';
import { Symbol } from '../Symbol';

/**
 * Die Dreiteilung als Bild (#831): dieselbe vereinfachte Darstellung wie auf ablago.app („Ein Blick hinein“, Projekt
 * motom001/dms-website, Apache-2.0) – links die Ansichten, in der Mitte die Liste, rechts die Mappe. Nachgebaut aus
 * HTML statt als Bilddatei: Es folgt dem Design (hell, dunkel, hoher Kontrast) und der Sprache. In der Handyfassung
 * zusammengeklappt: Ansicht oben, Liste darunter.
 */
export function DreiteilungBild({ schmal }: { schmal: boolean }) {
  const ansichten = [t('ablage.ablage.start'), t('ablage.ablage.zu-erledigen'), t('ablage.ablage.favoriten'), t('entdecken.bild.vertraege')];
  const zeilen = [t('entdecken.bild.handyvertrag'), t('entdecken.bild.kfz'), t('entdecken.bild.heizung')];
  return (
    <div className={`rg-bild${schmal ? ' rg-bild-schmal' : ''}`} role="img" aria-label={t(schmal ? 'entdecken.bild.titel-handy' : 'entdecken.bild.titel')}>
      <div className="rg-bild-spalte rg-bild-links" aria-hidden="true">
        <span className="rg-bild-name">{t('entdecken.bild.ansichten')}</span>
        {schmal
          ? <span className="rg-bild-eintrag an">{ansichten[3]} <Symbol name="pfeil-unten" /></span>
          : ansichten.map((a, i) => <span key={a} className={`rg-bild-eintrag${i === 3 ? ' an' : ''}`}>{a}</span>)}
      </div>
      <div className="rg-bild-spalte rg-bild-mitte" aria-hidden="true">
        <span className="rg-bild-name">{t('entdecken.bild.liste')}</span>
        {zeilen.map((z, i) => <span key={z} className={`rg-bild-zeile${i === 0 ? ' an' : ''}`}>{z}</span>)}
      </div>
      {!schmal && (
        <div className="rg-bild-spalte rg-bild-rechts" aria-hidden="true">
          <span className="rg-bild-name">{t('entdecken.bild.mappe')}</span>
          <strong>{zeilen[0]}</strong>
          <span className="rg-bild-feld"><span>{t('entdecken.bild.anbieter')}</span><span className="rg-bild-strich" /></span>
          <span className="rg-bild-feld"><span>{t('entdecken.bild.kuendigen')}</span><span className="rg-bild-strich" /></span>
        </div>
      )}
    </div>
  );
}
