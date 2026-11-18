import { t } from '../sprache';

/**
 * Die Dreiteilung als Skizze (#831, #1301): links die Ansichten, in der Mitte die Liste, rechts die Mappe – am Handy
 * zusammengeklappt (Ansicht oben, Liste darunter). Aus HTML statt als Bilddatei, damit es dem Design und der Sprache folgt.
 *
 * Bewusst **keine** Nachbildung der Oberfläche (Leitsatz 8: Was wie bedienbar aussieht, muss bedienbar sein): Im ersten
 * Versuch einer neuen Benutzerin sah das frühere Bild mit echten Einträgen aus wie Ablago selbst, und sie hat darin
 * geklickt. Jetzt flach, mit der Beschriftung „Skizze“, nur Spaltennamen und graue Balken – keine Texte, die wie
 * Einträge wirken, keine gewählte Zeile, kein Zeiger, keine Hover-Zustände.
 */
export function DreiteilungBild({ schmal }: { schmal: boolean }) {
  const balken = (breiten: number[]) => breiten.map((b, i) => <span key={i} className="rg-bild-balken" style={{ width: `${b}%` }} />);
  return (
    <figure
      className={`rg-bild${schmal ? ' rg-bild-schmal' : ''}`}
      role="img"
      aria-label={t(schmal ? 'entdecken.bild.titel-handy' : 'entdecken.bild.titel')}>
      <figcaption className="rg-bild-skizze" aria-hidden="true">
        {t('entdecken.bild.skizze')}
      </figcaption>
      <div className="rg-bild-raster" aria-hidden="true">
        <div className="rg-bild-spalte">
          <span className="rg-bild-name">{t('entdecken.bild.ansichten')}</span>
          {balken(schmal ? [70] : [70, 55, 62, 48])}
        </div>
        <div className="rg-bild-spalte">
          <span className="rg-bild-name">{t('entdecken.bild.liste')}</span>
          {balken([85, 72, 80])}
        </div>
        {!schmal && (
          <div className="rg-bild-spalte">
            <span className="rg-bild-name">{t('entdecken.bild.mappe')}</span>
            {balken([60, 90, 90, 75])}
          </div>
        )}
      </div>
    </figure>
  );
}
