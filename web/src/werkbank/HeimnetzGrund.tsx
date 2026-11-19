import type { NotfallzugangStand } from '../api/konto';
import { Hilfe } from '../Hilfe';
import { t, tn } from '../sprache';

/**
 * Warum „nicht aus dem Heimnetz“ (#885): öffentliche Adresse oder nicht geglaubte Proxy-Angabe – nur, solange der
 * Notfallzugang auf das Heimnetz beschränkt ist. Die Gateway-Adresse (#1355, Heimnetz nicht bestimmbar) steht immer.
 */
export function HeimnetzGrund({ n, deineIp }: { n: NotfallzugangStand; deineIp: string }) {
  if (n.heimnetz) return null;
  if (n.grund === 'gateway')
    return (
      <div className="hinweis warn" id="notfall-gateway">
        <p>
          {tn('werkbank.notfallzugang.grund.gateway', {
            code: <code>{deineIp}</code>,
            hilfe: <Hilfe ort="werkbank.notfallzugang.gateway" />,
          })}
        </p>
      </div>
    );
  if (n.internet) return null;
  return (
    <>
      <p className="leise klein">{t('werkbank.notfallzugang.nicht-heimnetz')}</p>
      {/* #885: welche Adresse Ablago sieht und warum es „nicht Heimnetz“ meint – mit Weg zur Abhilfe. */}
      <p className="leise klein" id="notfall-grund">
        {n.grund === 'proxy'
          ? tn('werkbank.notfallzugang.grund.proxy', {
              code: <code>{deineIp}</code>,
              hilfe: <Hilfe ort="werkbank.notfallzugang.proxy" />,
            })
          : tn('werkbank.notfallzugang.grund.oeffentlich', {
              code: <code>{deineIp}</code>,
              hilfe: <Hilfe ort="werkbank.notfallzugang.oeffentlich" />,
            })}
      </p>
    </>
  );
}
