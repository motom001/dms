import { Bereich, HakenFeld, type Klappe } from '../../bausteine';
import { useEffect, useState } from 'react';
import { werkbankApi, type PaketAmTyp } from '../../api/werkbank';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';

/**
 * Abschnitt „Pakete“ im Mappentyp-Editor (#686): welche Pakete mit Code Mappen dieses Typs lesen dürften – mit Haken
 * „darf diesen Mappentyp sehen“. Gilt sofort (eigene Einstellung, nicht Teil von „Mappentyp speichern“).
 */
export function PaketeAmTyp({ typId, klappe }: { typId: string; klappe: Klappe }) {
  const [liste, setListe] = useState<PaketAmTyp[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');
  const [sendet, setSendet] = useState('');
  useEffect(() => {
    if (!typId) return;
    let weg = false;
    werkbankApi.paketeAmTyp(typId).then(
      (x) => {
        if (!weg) setListe(x);
      },
      (e: Error) => {
        if (!weg) setFehler(e.message);
      },
    );
    return () => {
      weg = true;
    };
  }, [typId]);
  if (typId && liste && !liste.length) return null;
  const verwehrt = liste?.filter((p) => p.verwehrt).length ?? 0;
  const setze = async (p: PaketAmTyp, darf: boolean) => {
    setSendet(p.id);
    setFehler('');
    setMeldung('');
    try {
      setListe(await werkbankApi.paketVerwehren(typId, p.id, !darf));
      setMeldung(t(darf ? 'pakete.amtyp.gespeichert.an' : 'pakete.amtyp.gespeichert.aus', { name: p.name }));
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSendet('');
    }
  };
  return (
    <Bereich
      id="pakete"
      titel={t('pakete.amtyp.titel')}
      hilfe={<Hilfe ort="werkbank.pakete_am_typ" />}
      klappe={klappe}
      kurz={liste ? t('pakete.amtyp.kurz', { anzahl: liste.length, verwehrt: verwehrt || t('pakete.amtyp.kurz.keine') }) : undefined}
      beschreibung={t('pakete.amtyp.beschreibung')}>
      {!typId && <p className="leise">{t('pakete.amtyp.neu')}</p>}
      {fehler && (
        <p className="hinweis schlecht" role="alert">
          {fehler}
        </p>
      )}
      {liste && (
        <ul className="liste-ohne">
          {liste.map((p) => (
            <li key={p.id}>
              <HakenFeld
                beschriftung={t('pakete.amtyp.darf', { name: p.name })}
                hinweis={[
                  t(p.schreiben ? 'pakete.amtyp.was.schreiben' : 'pakete.amtyp.was.lesen'),
                  ...(p.ereignisse ? [t('pakete.amtyp.was.ereignisse')] : []),
                ].join(' · ')}>
                <input
                  type="checkbox"
                  checked={!p.verwehrt}
                  disabled={sendet === p.id}
                  onChange={(ev) => void setze(p, ev.target.checked)}
                />
              </HakenFeld>
            </li>
          ))}
        </ul>
      )}
      <p className="leise klein" role="status">
        {meldung}
      </p>
    </Bereich>
  );
}
