import { HANDBUCH_NAME, HILFE, handbuchUrl, hilfeUrl, type Handbuch, type Hilfeort } from '../../shared/src/hilfe';
import { useKonto } from './konto';

/**
 * Kontextbezogene Hilfe (#110): ein dezentes „?“, das den passenden Abschnitt im Handbuch
 * der installierten Version (#111) in einem neuen Tab öffnet. Welche Stelle wohin zeigt,
 * steht zentral in shared/src/hilfe.ts.
 */
export function Hilfe({ ort }: { ort: Hilfeort }) {
  const { version } = useKonto();
  const z = HILFE[ort];
  const text = `Hilfe zu ${z.titel} im ${HANDBUCH_NAME[z.handbuch]}`;
  return (
    <a className="hilfe" href={hilfeUrl(z, version)} target="_blank" rel="noreferrer" title={text} aria-label={`${text} (öffnet in neuem Tab)`}>
      <span aria-hidden="true">?</span>
    </a>
  );
}

/** Link aufs ganze Handbuch zur installierten Version. */
export function useHandbuch() {
  const { version } = useKonto();
  return (h: Handbuch, seite = '') => handbuchUrl(h, version, seite);
}
