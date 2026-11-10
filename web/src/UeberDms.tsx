import { useEffect, useId, useRef } from 'react';
import { useHandbuch } from './Hilfe';
import { useKonto } from './konto';
import { Marke } from './Marke';
import { t, tn } from './sprache';

/** Offizielles Repository; mit Version zeigt der Quellcode-Link auf genau diesen Stand (Tag vX.Y.Z). */
export const REPOSITORY = 'https://github.com/motom001/dms';
export const WER_NUTZT = `${REPOSITORY}/issues/466`;
const LIZENZ = 'https://www.apache.org/licenses/LICENSE-2.0';

export const quellcodeUrl = (version: string | null | undefined) => (version ? `${REPOSITORY}/tree/v${version}` : REPOSITORY);

/**
 * Fenster „Über das DMS“ (#430): Was das DMS ist, laufende Version, Lizenz (Apache-2.0) und
 * Quellcode der laufenden Version. Schließt mit „Schließen“, Esc und Klick daneben.
 */
export function UeberDms({ schliessen }: { schliessen: () => void }) {
  const { version } = useKonto();
  const handbuch = useHandbuch();
  const ref = useRef<HTMLDialogElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    knopf.current?.focus();
  }, []);
  const extern = { target: '_blank', rel: 'noreferrer', className: 'verweis' } as const;
  return (
    <dialog ref={ref} className="ueber-dms" aria-labelledby={`${id}-t`}
      onCancel={(e) => { e.preventDefault(); schliessen(); }}
      // Klick auf den abgedunkelten Rand (das <dialog> selbst, nicht sein Inhalt) schließt.
      onClick={(e) => { if (e.target === ref.current) schliessen(); }}>
      <div className="ueber-dms-inhalt">
        <h2 id={`${id}-t`} className="marke ueber-dms-marke"><Marke logo={null} schriftzug="Ablago" gross /><span className="sr"> {' '}{t('oberflaeche.ueberdms.ueber-ablago')}</span></h2>
        <p>{t('oberflaeche.ueberdms.ablago-ist-die-dokumentenablage')}</p>
        <dl className="ueber-dms-angaben">
          <dt>{t('oberflaeche.ueberdms.version')}</dt>
          <dd>{version ?? t('oberflaeche.ueberdms.unbekannt')}</dd>
          <dt>{t('oberflaeche.ueberdms.lizenz')}</dt>
          <dd>{tn('oberflaeche.ueberdms.freie-software-du-darfst', { link: <a href={LIZENZ} {...extern}>{t('oberflaeche.ueberdms.apache-license-2-0')}</a> })}</dd>
          <dt>{t('oberflaeche.ueberdms.quellcode')}</dt>
          <dd><a href={quellcodeUrl(version)} {...extern}>{version ? t('oberflaeche.ueberdms.quellcode-der-version', { version }) : t('oberflaeche.ueberdms.quellcode-auf-github')}</a></dd>
        </dl>
        <ul className="ueber-dms-links">
          <li><a href={handbuch('benutzer')} {...extern}>{t('oberflaeche.ueberdms.benutzerhandbuch')}</a></li>
          <li><a href={handbuch('benutzer', 'neu/')} {...extern}>{t('oberflaeche.ueberdms.neu-in-dieser-version')}</a>{version && <> · <a href={`${REPOSITORY}/releases/tag/v${version}`} {...extern}>{t('oberflaeche.ueberdms.release-notizen')}</a></>}</li>
          <li>{tn('oberflaeche.ueberdms.freiwillig-ablago-selbst-meldet', { link: <a href={WER_NUTZT} {...extern}>{t('oberflaeche.ueberdms.nutzt-du-ablago-erzaehl')}</a> })}</li>
        </ul>
        <div className="ueber-dms-knoepfe">
          <button ref={knopf} type="button" className="knopf primaer" onClick={schliessen}>{t('oberflaeche.ueberdms.schliessen')}</button>
        </div>
      </div>
    </dialog>
  );
}
