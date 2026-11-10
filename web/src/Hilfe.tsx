import { HANDBUCH_NAME, HILFE, handbuchUrl, hilfeUrl, type Handbuch, type Hilfeort } from '../../shared/src/hilfe';
import { useKontoOptional } from './konto-kontext';
import { t } from './sprache';

/**
 * Kontextbezogene Hilfe (#110): ein dezentes „?“, das den passenden Abschnitt im Handbuch
 * der installierten Version (#111) in einem neuen Tab öffnet – aus dem DMS selbst, ohne Internet (#219). Welche Stelle wohin zeigt,
 * steht zentral in shared/src/hilfe.ts. Auch ohne angemeldetes Konto (Einrichtungsassistent, #881): dann das
 * aktuelle Handbuch.
 */
export function Hilfe({ ort }: { ort: Hilfeort }) {
  const version = useKontoOptional()?.version ?? null;
  const z = HILFE[ort];
  const text = t('oberflaeche.hilfe.hilfe-zu-im', { titel: z.titel, HANDBUCH_NAME: HANDBUCH_NAME[z.handbuch] });
  return (
    <a className="hilfesymbol" href={hilfeUrl(z, version)} target="_blank" rel="noreferrer" title={text} aria-label={t('oberflaeche.hilfe.oeffnet-in-neuem-tab', { text })}>
      <span aria-hidden="true">?</span>
    </a>
  );
}

/** Link aufs ganze Handbuch zur installierten Version – ohne Konto (#881) aufs aktuelle. */
export function useHandbuch() {
  const version = useKontoOptional()?.version ?? null;
  return (h: Handbuch, seite = '') => handbuchUrl(h, version, seite);
}
