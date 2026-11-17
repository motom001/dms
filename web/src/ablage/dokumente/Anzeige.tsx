/** Die geöffnete Anzeige eines Dokuments (#1211, #1279). */
import type { ReactNode } from 'react';
import type { Dokument } from '../../../../shared/src/model';
import { t } from '../../sprache';
import { dokumentUrl } from '../../api/dokumente';
import { Hilfe } from '../../Hilfe';
import { Symbol } from '../../Symbol';
import { Knopf, Umschalter } from '../../bausteine';
import type { Sicht } from './hilfen';

/** Die geöffnete Anzeige (#1211): Umschalter „PDF/A · Original“, „In neuem Tab“, Betrachter mit fester Höhe, „Über dieses Dokument“. */
export function Anzeige({
  x,
  sicht,
  ueber,
  imOriginal,
  wechsle,
  laden,
}: {
  x: Dokument;
  sicht: Sicht;
  ueber?: ReactNode;
  imOriginal: boolean;
  wechsle(): void;
  /** Original herunterladen, wenn der Browser es nicht zeigt (mit Exportrecht und ohne Pflicht-Stempel). */
  laden: boolean;
}) {
  const mitArchiv = x.archivfassung?.stand === 'fertig';
  const endung = /\.([^.]{1,8})$/.exec(x.name)?.[1]?.toLowerCase();
  return (
    <div className="dokansicht">
      <div className="dokansicht-kopf klein">
        {mitArchiv ? (
          <Umschalter
            wert={imOriginal ? 'original' : 'archiv'}
            setze={() => wechsle()}
            beschriftung={t('ablage.dokumente.fassung')}
            wahlen={[
              { wert: 'archiv', text: t('ablage.dokumente.laden.pdfa') },
              { wert: 'original', text: t('ablage.dokumente.laden.original') },
            ]}
          />
        ) : (
          sicht && <strong>{t.frei(`volltext.archiv.ansicht.${sicht.art}`)}</strong>
        )}
        {!mitArchiv && x.archivfassung?.stand === 'wartet' && <span className="leise">{t('volltext.archiv.wird-erstellt')}</span>}
        <Hilfe ort="dokumente.archivfassung" />
        {sicht && (
          <a
            className="verweis dokansicht-tab"
            href={sicht.url}
            target="_blank"
            rel="noreferrer"
            aria-label={t('ablage.dokumente.in-neuem-tab-oeffnen-2', { name: x.name })}>
            {t('ablage.dokumente.in-neuem-tab')} <Symbol name="extern" />
          </a>
        )}
      </div>
      {sicht ? (
        sicht.pdf ? (
          <iframe src={sicht.url} title={x.name} />
        ) : (
          <img src={sicht.url} alt={x.name} />
        )
      ) : (
        // Original, das der Browser nicht zeigt (#946, z. B. eine E-Mail): kein Link, der heimlich herunterlädt.
        <div className="dokansicht-leer">
          <p>{endung ? t('ablage.dokumente.original-nicht-anzeigbar', { endung }) : t('ablage.dokumente.original-nicht-anzeigbar-ohne')}</p>
          {laden && (
            <Knopf
              symbol="herunterladen"
              onClick={() => {
                location.assign(dokumentUrl(x.id, true));
              }}>
              {t('ablage.dokumente.original-herunterladen')}
            </Knopf>
          )}
        </div>
      )}
      {ueber}
    </div>
  );
}
