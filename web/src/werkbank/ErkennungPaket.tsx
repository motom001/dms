import { useEffect, useState } from 'react';
import { api, ApiFehler, type ErkennungStand } from '../api';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';

/** Bestätigung des Datenabflusses (#511), wenn ein Paket mit Netzzugriff die Erkennung übernehmen soll. */
export async function abflussBestaetigen(paket: string): Promise<boolean> {
  return rueckfrage({ titel: t('erkennung.abfluss.titel'), text: t('erkennung.abfluss.text', { paket }), ja: t('erkennung.abfluss.ja') });
}

/**
 * Werkbank → Pakete → Paket mit dms:erkennen (#511): als Standard für „Aus Dokument ausfüllen“ nutzen.
 * Ein Paket mit Netzzugriff nur mit ausdrücklicher Bestätigung des Datenabflusses.
 */
export function ErkennungPaketBlock({ paket }: { paket: string }) {
  const [s, setS] = useState<ErkennungStand | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { api.erkennungStand().then(setS, (e) => setMeldung({ art: 'schlecht', text: (e as Error).message })); }, []);
  if (!s) return meldung ? <p className="fehlertext">{meldung.text}</p> : null;
  const ich = s.pakete.find((p) => p.id === paket);
  async function setze(an: boolean) {
    if (an && ich?.netz && !(await abflussBestaetigen(ich.name))) return;
    setLaeuft(true); setMeldung(undefined);
    try { setS(await api.erkennungStandard(an ? paket : null, an && !!ich?.netz)); setMeldung({ art: 'gut', text: t('erkennung.werkbank.gespeichert') }); }
    catch (e) { setMeldung({ art: 'schlecht', text: e instanceof ApiFehler ? e.message : String(e) }); }
    finally { setLaeuft(false); }
  }
  return (
    <>
      <h2 className="h3">{t('erkennung.werkbank.titel')} <Hilfe ort="pakete.erkennung" /></h2>
      <p className="leise klein">{t('erkennung.werkbank.text')}</p>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      <label className="haken"><input type="checkbox" checked={s.standard.paket === paket} disabled={laeuft} onChange={(e) => void setze(e.target.checked)} /><span>{t('erkennung.werkbank.standard')}</span></label>
      <p className="leise klein">{t('erkennung.werkbank.standard.hilfe')}</p>
      {ich && !ich.laeuft && <p className="leise klein">{t('erkennung.werkbank.laeuft-nicht')}</p>}
    </>
  );
}
