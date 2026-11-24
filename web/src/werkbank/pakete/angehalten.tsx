import { t } from '../../sprache';
import { Etikett, Knopf, KnopfLink } from '../../bausteine';
import { paketeApi } from '../../api/pakete';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import type { DetailZustand } from './detail-zustand';

/** Warum ein Paket angehalten ist, in Worten (#1563) – nie als Stufennummer. */
export const angehaltenGrund = (p: Pick<InstalliertesPaket, 'name' | 'angehalten'>) =>
  p.angehalten?.grund === 'darf' && p.angehalten.stufe
    ? t.frei(`werkbank.darf.grund.${p.angehalten.stufe}`, { name: p.name })
    : t('werkbank.darf.angehalten.hand', { name: p.name });

/**
 * Anhalten und Fortsetzen am Paket (#1563): angehalten steht der Grund in Worten da, dazu „Erlauben …“ (öffnet „Was
 * Ablago darf“, wenn die Grenze der Grund ist) und „Fortsetzen“; sonst „Anhalten“ für Pakete mit Code. Entfernen steht
 * wie immer bei den Knöpfen darunter.
 */
export function Angehalten({ x }: { x: DetailZustand }) {
  const inst = x.inst;
  if (!inst) return null;
  const id = inst.id;
  if (!inst.angehalten)
    return inst.code ? (
      <div className="knoepfe">
        <Knopf
          gesperrt={x.laeuft}
          title={t('werkbank.darf.anhalten.erklaerung')}
          onClick={() =>
            void x.tu(async () => {
              await paketeApi.paketAnhalten(id);
              return angehaltenGrund({ name: inst.name, angehalten: { grund: 'hand', am: '', von: '' } });
            })
          }>
          {t('werkbank.darf.anhalten')}
        </Knopf>
      </div>
    ) : null;
  return (
    <div className="hinweis warn">
      <p>
        <Etikett art="warn">{t('werkbank.darf.angehalten')}</Etikett> <strong>{angehaltenGrund(inst)}</strong>{' '}
        {t('werkbank.darf.angehalten.text')}
      </p>
      <div className="knoepfe">
        {inst.angehalten.grund === 'darf' && (
          <KnopfLink to="/werkbank#was-ablago-darf" groesse="klein">
            {t('werkbank.darf.erlauben')}
          </KnopfLink>
        )}
        <Knopf
          groesse="klein"
          gesperrt={x.laeuft}
          onClick={() =>
            void x.tu(async () => {
              await paketeApi.paketFortsetzen(id);
              return t('werkbank.darf.fortsetzen');
            })
          }>
          {t('werkbank.darf.fortsetzen')}
        </Knopf>
      </div>
    </div>
  );
}
