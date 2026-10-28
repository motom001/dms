import type { Design } from './design';

/** Logo und Schriftzug (#72): je Design anpassbar; ohne Angaben das Mappen-Symbol und „DMS“. */
export const logoUrl = (d: Pick<Design, 'id' | 'logo'> | null | undefined) => (d?.logo ? `/api/designs/${d.id}/logo?v=${d.logo.sha256.slice(0, 8)}` : null);
export const schriftzugVon = (d: Pick<Design, 'schriftzug'> | null | undefined) => (d?.schriftzug === null || d?.schriftzug === undefined ? 'DMS' : d.schriftzug);

export function Marke({ logo, schriftzug, gross }: { logo: string | null; schriftzug: string; gross?: boolean }) {
  const h = gross ? 28 : 22;
  return (
    <>
      {logo
        ? <img src={logo} alt="" className="markenlogo" style={{ height: h }} />
        : <svg viewBox="0 0 32 32" width={h} height={h} aria-hidden="true"><rect x="4" y="7" width="24" height="21" rx="3" className="m1" /><rect x="8" y="3" width="9" height="7" rx="2" className="m2" /></svg>}
      {schriftzug && <span>{schriftzug}</span>}
    </>
  );
}
