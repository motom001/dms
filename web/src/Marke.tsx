import type { Design } from './design';
import { t } from './sprache';

/** Logo und Schriftzug (#72): je Design anpassbar; ohne Angaben das Ablago-Symbol und „Ablago“ (#687). */
export const logoUrl = (d: Pick<Design, 'id' | 'logo'> | null | undefined) =>
  d?.logo ? `/api/designs/${d.id}/logo?v=${d.logo.sha256.slice(0, 8)}` : null;
export const schriftzugVon = (d: Pick<Design, 'schriftzug'> | null | undefined) =>
  d?.schriftzug === null || d?.schriftzug === undefined ? 'Ablago' : d.schriftzug;

/** Hell und dunkel liegen beide im DOM; welches sichtbar ist, steuern --marke-hell/--marke-dunkel aus dem Design. */
const zweiFarben = (hell: string, dunkel: string, h: number, klasse: string) => (
  <>
    <img src={hell} alt="" className={`${klasse} marke-hell`} style={{ height: h }} />
    <img src={dunkel} alt="" className={`${klasse} marke-dunkel`} style={{ height: h }} />
  </>
);

export function Marke({ logo, schriftzug, gross }: { logo: string | null; schriftzug: string; gross?: boolean }) {
  const h = gross ? 28 : 22;
  // Groß und unverändert: das Logo mit Schriftzug aus marke/ (mindestens 120 px breit, hier 137 px).
  if (!logo && gross && schriftzug === 'Ablago') {
    return (
      <span className="ablago-logo" role="img" aria-label={t('oberflaeche.marke.ablago')}>
        {zweiFarben('/ablago-logo-mit-schriftzug.svg', '/ablago-logo-mit-schriftzug-dunkel.svg', 40, 'markenlogo')}
      </span>
    );
  }
  return (
    <>
      {logo ? (
        <img src={logo} alt="" className="markenlogo" style={{ height: h }} />
      ) : (
        zweiFarben('/ablago-app-blau.svg', '/ablago-app-dunkelmodus.svg', h, 'markenzeichen')
      )}
      {schriftzug && <span>{schriftzug}</span>}
    </>
  );
}
