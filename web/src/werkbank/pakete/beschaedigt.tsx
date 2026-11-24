import type { ReactNode } from 'react';
import { t } from '../../sprache';
import { Knopf } from '../../bausteine';
import { paketeApi } from '../../api/pakete';
import { geheZu } from '../../ort';
import { entferneMitFragen } from './teile';
import type { DetailZustand } from './detail-zustand';

/**
 * Beschädigtes Paket (#1551): Statt nur einer Sperre stehen am Paket Lösungen – je mit einem Satz, was passiert und was
 * mit vorhandenen Mappen geschieht. Reparieren läuft im Server in einer Transaktion; Neu installieren entfernt das Paket
 * und führt in den gewohnten Ablauf „Installieren“ derselben Version; Ganz entfernen ist das gewohnte Entfernen.
 */
export function Beschaedigt({ x }: { x: DetailZustand }) {
  const inst = x.inst;
  if (!inst?.fehlt) return null;
  const { id, name, version } = inst;
  const teile = [...inst.fehlt.typen, ...inst.fehlt.sichten].join(', ');
  const zeile = (knopf: ReactNode, satz: string) => (
    <li className="loesung">
      {knopf}
      <span className="leise klein">{satz}</span>
    </li>
  );
  return (
    <div className="hinweis warn stapel" role="region" aria-label={t('werkbank.pakete.beschaedigt')}>
      <p>
        <strong>{t('werkbank.pakete.beschaedigt.titel', { name })}</strong> {t('werkbank.pakete.beschaedigt.text', { teile })}
      </p>
      <ul className="loesungen">
        {zeile(
          <Knopf
            art="haupt"
            groesse="klein"
            gesperrt={x.laeuft}
            onClick={() =>
              void x.tu(async () => {
                await paketeApi.paketReparieren(id);
                return t('werkbank.pakete.reparieren.fertig', { name });
              })
            }>
            {t('werkbank.pakete.reparieren')}
          </Knopf>,
          t('werkbank.pakete.reparieren.satz'),
        )}
        {inst.herkunft.art === 'katalog' &&
          zeile(
            <Knopf
              groesse="klein"
              gesperrt={x.laeuft}
              onClick={() =>
                void x.tu(async () => {
                  await entferneMitFragen(id, true);
                  geheZu(`/werkbank/pakete?installieren=${encodeURIComponent(`${id}@${version}`)}`, true);
                  return t('werkbank.pakete.ist-entfernt', { name });
                })
              }>
              {t('werkbank.pakete.neu-installieren')}
            </Knopf>,
            t('werkbank.pakete.neu-installieren.satz'),
          )}
        {zeile(
          <Knopf groesse="klein" gesperrt={x.laeuft} onClick={x.entfernen}>
            {t('werkbank.pakete.ganz-entfernen')}
          </Knopf>,
          t('werkbank.pakete.ganz-entfernen.satz'),
        )}
      </ul>
    </div>
  );
}
