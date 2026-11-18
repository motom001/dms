import type { ReactNode } from 'react';
import { Link } from '../ort';
import type { Systemkonto } from '../api/konto';
import { Aufklapper, Etikett } from '../bausteine';
import { Symbol } from '../Symbol';
import { t } from '../sprache';
import { systemkontenKopf } from '../../../shared/src/systemkonten';

/**
 * Systemkonten als eingeklappte Gruppe oben (#817): Kopfzeile mit Anzahl und Zusammensetzung, Auffälligkeiten auch
 * eingeklappt („1 mit Fehler“, „1 mit weitreichenden Rechten“). Dasselbe Muster in Werkbank → Benutzer und im
 * Testlauf (#710). Wer aufklappt, entscheidet der Aufrufer (z. B. je Person gemerkt). `zumFehler` (#1181): Link unter
 * der Kopfzeile direkt zum ersten Konto mit Fehler, auch eingeklappt.
 */
export function SystemkontenGruppe({
  liste,
  auf,
  setzeAuf,
  id,
  kinder,
  zumFehler,
}: {
  liste: Systemkonto[];
  auf: boolean;
  setzeAuf: (auf: boolean) => void;
  id: string;
  kinder: ReactNode;
  zumFehler?: (k: Systemkonto) => string;
}) {
  const k = systemkontenKopf(liste);
  const mitFehler = liste.find((x) => x.fehler);
  const teile = [
    ...(k.pakete ? [t('konten.systemkonten.gruppe.pakete', { anzahl: k.pakete })] : []),
    ...(k.automatisierung ? [t('konten.systemkonten.gruppe.automatisierung', { anzahl: k.automatisierung })] : []),
  ];
  return (
    <section className="aufklappbereich systemkontengruppe">
      <Aufklapper
        offen={auf}
        steuert={id}
        umschalten={() => setzeAuf(!auf)}
        title={auf ? t('konten.systemkonten.gruppe.auf') : t('konten.systemkonten.gruppe.zu')}>
        <span>{t('konten.systemkonten.gruppe', { anzahl: k.anzahl })}</span>
        {teile.length > 0 && <span className="leise klein">· {teile.join(' · ')}</span>}
        {k.fehler > 0 && (
          <Etikett art="schlecht" klein>
            <Symbol name="warnung" /> {t('konten.systemkonten.gruppe.fehler', { anzahl: k.fehler })}
          </Etikett>
        )}
        {k.weitreichend > 0 && (
          <Etikett art="warn" klein>
            <Symbol name="schloss" /> {t('konten.systemkonten.gruppe.weitreichend', { anzahl: k.weitreichend })}
          </Etikett>
        )}
      </Aufklapper>
      {zumFehler && mitFehler && (
        <p className="klein systemkonten-zumfehler">
          <Link to={zumFehler(mitFehler)} className="verweis">
            {t('konten.systemkonten.gruppe.zum-fehler', { name: mitFehler.name })}
          </Link>
        </p>
      )}
      {auf && (
        <div id={id} className="aufklappinhalt">
          {kinder}
        </div>
      )}
    </section>
  );
}

/** Kennzeichen eines Kontos in der Liste: Fehler und weitreichende Rechte. */
export function SystemkontoKennzeichen({ k }: { k: Systemkonto }) {
  return (
    <>
      {k.fehler && (
        <>
          {' '}
          <Etikett art="schlecht" klein>
            <Symbol name="warnung" /> {t.frei(`konten.systemkonten.fehler.${k.fehler}`)}
          </Etikett>
        </>
      )}
      {k.weitreichend && (
        <>
          {' '}
          <Etikett art="warn" klein>
            <Symbol name="schloss" /> {t('konten.systemkonten.weitreichend')}
          </Etikett>
        </>
      )}
    </>
  );
}
