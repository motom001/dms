import type { ReactNode } from 'react';
import type { Systemkonto } from '../api';
import { Knopf } from '../bausteine';
import { Symbol } from '../Symbol';
import { t } from '../sprache';
import { systemkontenKopf } from '../../../shared/src/systemkonten';

/**
 * Systemkonten als eingeklappte Gruppe oben (#817): Kopfzeile mit Anzahl und Zusammensetzung, Auffälligkeiten auch
 * eingeklappt („1 mit Fehler“, „1 mit weitreichenden Rechten“). Dasselbe Muster in Werkbank → Benutzer und im
 * Testlauf (#710). Wer aufklappt, entscheidet der Aufrufer (z. B. je Person gemerkt).
 */
export function SystemkontenGruppe({ liste, auf, setzeAuf, id, kinder }: { liste: Systemkonto[]; auf: boolean; setzeAuf: (auf: boolean) => void; id: string; kinder: ReactNode }) {
  const k = systemkontenKopf(liste);
  const teile = [
    ...(k.pakete ? [t('konten.systemkonten.gruppe.pakete', { anzahl: k.pakete })] : []),
    ...(k.automatisierung ? [t('konten.systemkonten.gruppe.automatisierung', { anzahl: k.automatisierung })] : []),
  ];
  return (
    <section className="aufklappbereich systemkontengruppe">
      <Knopf art="link" className="aufklappkopf" aria-expanded={auf} aria-controls={id} onClick={() => setzeAuf(!auf)}
        title={auf ? t('konten.systemkonten.gruppe.auf') : t('konten.systemkonten.gruppe.zu')}>
        <Symbol name={auf ? 'pfeil-unten' : 'pfeil-rechts'} className="zeichen" />
        <span>{t('konten.systemkonten.gruppe', { anzahl: k.anzahl })}</span>
        {teile.length > 0 && <span className="leise klein">· {teile.join(' · ')}</span>}
        {k.fehler > 0 && <span className="chip schlecht klein"><Symbol name="warnung" /> {t('konten.systemkonten.gruppe.fehler', { anzahl: k.fehler })}</span>}
        {k.weitreichend > 0 && <span className="chip warn klein"><Symbol name="schloss" /> {t('konten.systemkonten.gruppe.weitreichend', { anzahl: k.weitreichend })}</span>}
      </Knopf>
      {auf && <div id={id} className="aufklappinhalt">{kinder}</div>}
    </section>
  );
}

/** Kennzeichen eines Kontos in der Liste: Fehler und weitreichende Rechte. */
export function SystemkontoKennzeichen({ k }: { k: Systemkonto }) {
  return (
    <>
      {k.fehler && <> <span className="chip schlecht klein"><Symbol name="warnung" /> {t.frei(`konten.systemkonten.fehler.${k.fehler}`)}</span></>}
      {k.weitreichend && <> <span className="chip warn klein"><Symbol name="schloss" /> {t('konten.systemkonten.weitreichend')}</span></>}
    </>
  );
}
