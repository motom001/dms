import { useEffect, useId, useRef } from 'react';
import { useHandbuch } from './Hilfe';
import { useKonto } from './konto';
import { Marke } from './Marke';

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
        <h2 id={`${id}-t`} className="marke ueber-dms-marke"><Marke logo={null} schriftzug="DMS" gross /><span className="sr-only"> – Über das DMS</span></h2>
        <p>Das DMS ist ein selbst gehostetes Dokumentenmanagementsystem für Haushalte und kleine Betriebe. Es läuft auf eurem eigenen Rechner, NAS oder Server – deine Daten bleiben bei dir und gehen an keinen Cloud-Anbieter. Nutzungsdaten sendet es keine.</p>
        <dl className="ueber-dms-angaben">
          <dt>Version</dt>
          <dd>{version ?? 'unbekannt'}</dd>
          <dt>Lizenz</dt>
          <dd><a href={LIZENZ} {...extern}>Apache License 2.0</a> – freie Software: Du darfst das DMS kostenlos nutzen, verändern und weitergeben; der Quellcode ist für jeden einsehbar.</dd>
          <dt>Quellcode</dt>
          <dd><a href={quellcodeUrl(version)} {...extern}>{version ? `Quellcode der Version ${version}` : 'Quellcode auf GitHub'}</a></dd>
        </dl>
        <ul className="ueber-dms-links">
          <li><a href={handbuch('benutzer')} {...extern}>Benutzerhandbuch</a></li>
          <li><a href={handbuch('benutzer', 'neu/')} {...extern}>Neu in dieser Version</a>{version && <> · <a href={`${REPOSITORY}/releases/tag/v${version}`} {...extern}>Release-Notizen</a></>}</li>
          <li><a href={WER_NUTZT} {...extern}>Nutzt du das DMS? Erzähl uns davon</a> – freiwillig, das DMS selbst meldet nichts.</li>
        </ul>
        <div className="ueber-dms-knoepfe">
          <button ref={knopf} type="button" className="knopf primaer" onClick={schliessen}>Schließen</button>
        </div>
      </div>
    </dialog>
  );
}
