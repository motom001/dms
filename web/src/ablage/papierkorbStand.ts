import { useCallback, useEffect, useState } from 'react';
import { mappenApi, type DokumentImKorb, type PapierkorbEintrag } from '../api/mappen';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Papierkorb (#43): Stand und gemeinsame Hilfen für Liste und Detail. In der Ablage sieht jeder, was er selbst gelöscht
 * hat; in der Werkbank sehen Administratoren alles. Nach der eingestellten Aufbewahrung wird endgültig gelöscht.
 */

const GEAENDERT = 'dms:papierkorb';
export const melde = () => dispatchEvent(new Event(GEAENDERT));
export const datumZeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
export const basis = (werkbank: boolean) => (werkbank ? '/werkbank/papierkorb' : '/ablage/papierkorb');

export function usePapierkorb(werkbank: boolean, aktiv = true) {
  const [eintraege, setEintraege] = useState<PapierkorbEintrag[] | null>(null);
  const [dokumente, setDokumente] = useState<DokumentImKorb[]>([]);
  const [tage, setTage] = useState<number | null>(null);
  const [historieTage, setHistorieTage] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      if (werkbank) { const r = await mappenApi.papierkorbWerkbank(); setEintraege(r.eintraege); setDokumente(r.dokumente ?? []); setTage(r.tage); setHistorieTage(r.historieTage); }
      else { const [m, dok] = await Promise.all([mappenApi.papierkorb(), mappenApi.papierkorbDokumente()]); setEintraege(m); setDokumente(dok); }
      setFehler(undefined);
    } catch (e) { setFehler((e as Error).message); }
  }, [werkbank]);
  useEffect(() => {
    if (!aktiv) return;
    // laden fängt Fehler selbst ab und zeigt sie (fehler); der Ereignis-Handler gibt kein Promise zurück (#1011).
    const neu = () => void laden();
    neu();
    addEventListener(GEAENDERT, neu);
    return () => removeEventListener(GEAENDERT, neu);
  }, [aktiv, laden]);
  return { eintraege, dokumente, tage, setTage, historieTage, setHistorieTage, fehler, laden };
}
export type PapierkorbZustand = ReturnType<typeof usePapierkorb>;

/** Aufbewahrung in Worten. */
export function aufbewahrung(tage: number | undefined | null) {
  if (!tage) return t('ablage.papierkorb.geloeschte-mappen-und-dokumente');
  return t('ablage.papierkorb.geloeschte-mappen-und-dokumente-2', { anzahl: tage });
}

