/** Die geöffnete Anzeige eines Dokuments (#1211, #1279). */
import type { ReactNode } from 'react';
import type { Dokument } from '../../../../shared/src/model';
import { t } from '../../sprache';
import { dokumentUrl, schwaerzBildUrl } from '../../api/dokumente';
import { Hilfe } from '../../Hilfe';
import { Symbol } from '../../Symbol';
import { Knopf, Umschalter } from '../../bausteine';
import { klebenderKopf, Seitenbilder, SeitenSprung, useSeitenlage, useSeitenmasse, type Seitenlage } from '../Seitenbetrachter';
import type { Sicht } from './hilfen';

/**
 * Die geöffnete Anzeige (#1211): Umschalter „PDF/A · Original“, „In neuem Tab“, das Dokument, „Über dieses Dokument“.
 * PDF/A und PDFs zeigt sie wie „Dokument übernehmen“ als Seiten in Spaltenbreite (#1324) mit „Seite n von N“; Bilder,
 * Lesefassungen und entsperrte PDFs der Browser selbst.
 */
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
  const art = sicht?.art === 'archiv' || sicht?.art === 'original' ? sicht.art : null;
  const seiten = useSeitenmasse(x, art);
  const lage = useSeitenlage(Array.isArray(seiten) ? seiten.length : 0);
  const mitSeiten = Array.isArray(seiten) && seiten.length > 0;
  return (
    <div className="dokansicht" ref={lage.wurzel}>
      <Kopf x={x} sicht={sicht} imOriginal={imOriginal} wechsle={wechsle} lage={mitSeiten ? lage : null} />
      {mitSeiten ? (
        <div className="dokansicht-seiten" tabIndex={0} role="group" aria-label={x.name}>
          <Seitenbilder lage={lage} seiten={seiten} bild={(nr) => schwaerzBildUrl(x, nr, art === 'archiv')} />
        </div>
      ) : sicht && seiten === null ? (
        <p className="leise dokansicht-lade">{t('ablage.uebernehmen.lade')}</p>
      ) : (
        <Browseranzeige x={x} sicht={sicht} laden={laden} />
      )}
      {ueber}
    </div>
  );
}

/** Kopf der Anzeige: „PDF/A · Original“ bzw. was zu sehen ist, „Seite n von N“ (mit Seiten, klebend), „In neuem Tab“. */
function Kopf({
  x,
  sicht,
  imOriginal,
  wechsle,
  lage,
}: {
  x: Dokument;
  sicht: Sicht;
  imOriginal: boolean;
  wechsle(): void;
  lage: Seitenlage | null;
}) {
  const mitArchiv = x.archivfassung?.stand === 'fertig';
  return (
    <div className={`dokansicht-kopf klein ${lage ? klebenderKopf : ''}`} data-seitenkopf>
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
      {lage && <SeitenSprung lage={lage} />}
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
  );
}

/** Ohne Seiten: der Browser zeigt PDF oder Bild – oder, wenn er das Original nicht zeigt, ein Satz und „Original herunterladen“. */
function Browseranzeige({ x, sicht, laden }: { x: Dokument; sicht: Sicht; laden: boolean }) {
  const endung = /\.([^.]{1,8})$/.exec(x.name)?.[1]?.toLowerCase();
  if (sicht) return sicht.pdf ? <iframe src={sicht.url} title={x.name} /> : <img src={sicht.url} alt={x.name} />;
  // Original, das der Browser nicht zeigt (#946, z. B. eine E-Mail): kein Link, der heimlich herunterlädt.
  return (
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
  );
}
