import { HakenFeld } from '../../bausteine';
import { useEffect, useState } from 'react';
import { sucheApi } from '../../api/suche';
import type { KiUebersicht } from '../../../../shared/src/pakete';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';

/**
 * „Darf an Dienste im Netz gehen“ (#796, Wortlaut #1559): Dürfen Inhalte dieses Mappentyps Ablago über ein Paket mit
 * Netz verlassen? Seit #1559 eine feste Zeile im Abschnitt Berechtigungen, direkt unter „Standard“ – dort sucht man sie.
 * Technisch bleibt es die eigene Sperre im Server (getrennt von den Regeln; intern weiter `ki_typen`, `istKiPaket`):
 * Regeln sagen, wer eine Mappe sieht, die Sperre, wohin Inhalte fließen. Gilt sofort, ohne „Mappentyp speichern“. Neue
 * Mappentypen bleiben in Ablago, bis man sie hier zulässt.
 */
export function KiAmTyp({ typId }: { typId: string }) {
  const [k, setK] = useState<KiUebersicht | null>(null);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');
  const [sendet, setSendet] = useState(false);
  useEffect(() => {
    let weg = false;
    sucheApi.kiTypen().then(
      (x) => {
        if (!weg) setK(x);
      },
      (e: Error) => {
        if (!weg) setFehler(e.message);
      },
    );
    return () => {
      weg = true;
    };
  }, [typId]);
  const eintrag = k?.typen.find((x) => x.id === typId);
  const an = !!eintrag?.zugelassen;
  const setze = async (zugelassen: boolean) => {
    setSendet(true);
    setFehler('');
    setMeldung('');
    try {
      setK(await sucheApi.setzeKiTyp(typId, zugelassen));
      setMeldung(t(zugelassen ? 'pakete.ki.typ.gespeichert.an' : 'pakete.ki.typ.gespeichert.aus'));
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSendet(false);
    }
  };
  const pakete = k?.pakete ?? [];
  return (
    <div id="ki" className="stapel">
      <h3 className="zwischen">
        {t('pakete.ki.typ.titel')} <Hilfe ort="pakete.ki" />
      </h3>
      <p className="leise klein">{t('pakete.ki.typ.beschreibung')}</p>
      {fehler && (
        <p className="hinweis schlecht" role="alert">
          {fehler}
        </p>
      )}
      {!typId ? (
        <p className="leise">{t('pakete.ki.typ.neu')}</p>
      ) : (
        k && (
          <HakenFeld beschriftung={t('pakete.ki.typ.darf')} hinweis={an ? t('pakete.ki.typ.an.hilfe') : t('pakete.ki.typ.aus.hilfe')}>
            <input type="checkbox" checked={an} disabled={sendet} onChange={(ev) => void setze(ev.target.checked)} />
          </HakenFeld>
        )
      )}
      {k && (
        <p className="leise klein">
          {pakete.length ? t('pakete.ki.typ.pakete', { namen: pakete.map((p) => p.name).join(', ') }) : t('pakete.ki.typ.keine-pakete')}
        </p>
      )}
      <p className="leise klein" role="status">
        {meldung}
      </p>
    </div>
  );
}
