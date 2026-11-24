import { Bereich, HakenFeld, type Klappe } from '../../bausteine';
import type { TypNeben } from './useTypNeben';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';

/**
 * Abschnitt „Pakete“ im Mappentyp-Editor (#686): welche Pakete mit Code Mappen dieses Typs lesen dürften – mit Haken
 * „darf diesen Mappentyp sehen“. Seit #1640 Teil des Entwurfs wie alle anderen Felder: übernommen mit „Mappentyp
 * speichern“, zurückgenommen mit „Änderungen verwerfen“ (gespeichert bleibt es als eigene Einstellung am Typ).
 */
export function PaketeAmTyp({ typId, neben, klappe }: { typId: string; neben: TypNeben; klappe: Klappe }) {
  const { liste, stand, fehler } = neben;
  if (typId && liste && !liste.length) return null;
  const verwehrt = liste?.filter((p) => stand.verwehrt.includes(p.id)).length ?? 0;
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
      {typId && liste && (
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
                  checked={!stand.verwehrt.includes(p.id)}
                  onChange={(ev) => neben.setzePaket(p.id, ev.target.checked)}
                />
              </HakenFeld>
            </li>
          ))}
        </ul>
      )}
    </Bereich>
  );
}
