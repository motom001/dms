import { Bereich, HakenFeld, type Klappe } from '../../bausteine';
import { useEffect, useState } from 'react';
import { sucheApi } from '../../api/suche';
import type { KiUebersicht } from '../../../../shared/src/pakete';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';

/**
 * Abschnitt „KI-Dienste“ im Mappentyp-Editor (#796): Darf der Mappentyp an KI-Pakete gehen (Pakete, die Inhalte ins Netz
 * schicken können)? Gilt sofort, eigene Einstellung. Neue Mappentypen sind gesperrt, bis man sie hier zulässt.
 */
export function KiAmTyp({ typId, klappe }: { typId: string; klappe: Klappe }) {
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
    <Bereich
      id="ki"
      titel={t('pakete.ki.typ.titel')}
      hilfe={<Hilfe ort="pakete.ki" />}
      klappe={klappe}
      kurz={k ? (!typId ? t('pakete.ki.typ.kurz.neu') : an ? t('pakete.ki.typ.kurz.an') : t('pakete.ki.typ.kurz.aus')) : undefined}
      beschreibung={t('pakete.ki.typ.beschreibung')}>
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
    </Bereich>
  );
}
