import { HakenFeld } from '../../bausteine';
import { Link } from '../../ort';
import type { TypNeben } from './useTypNeben';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import { FEIN_ZIEL } from '../uebersicht/Feinabstimmung';

/**
 * „Darf an Dienste im Netz gehen“ (#796, Wortlaut #1559): Dürfen Inhalte dieses Mappentyps Ablago über ein Paket mit
 * Netz verlassen? Seit #1559 eine feste Zeile im Abschnitt Berechtigungen, direkt unter „Standard“ – dort sucht man sie.
 * Technisch bleibt es die eigene Sperre im Server (getrennt von den Regeln; intern weiter `ki_typen`, `istKiPaket`):
 * Regeln sagen, wer eine Mappe sieht, die Sperre, wohin Inhalte fließen. Seit #1640 Teil des Entwurfs: übernommen mit
 * „Mappentyp speichern“, zurückgenommen mit „Änderungen verwerfen“. Derselbe Haken steht in der Feinabstimmung unter
 * „Was Ablago darf“ (#1635).
 */
export function KiAmTyp({ neben }: { neben: TypNeben }) {
  const { k, stand, fehler } = neben;
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
      {k && (
        <HakenFeld beschriftung={t('pakete.ki.typ.darf')} hinweis={stand.netz ? t('pakete.ki.typ.an.hilfe') : t('pakete.ki.typ.aus.hilfe')}>
          <input type="checkbox" checked={stand.netz} onChange={(ev) => neben.setzeNetz(ev.target.checked)} />
        </HakenFeld>
      )}
      {k && (
        <p className="leise klein">
          {pakete.length ? t('pakete.ki.typ.pakete', { namen: pakete.map((p) => p.name).join(', ') }) : t('pakete.ki.typ.keine-pakete')}{' '}
          <Link to={FEIN_ZIEL} className="verweis">
            {t('pakete.ki.zur-feinabstimmung')}
          </Link>
        </p>
      )}
    </div>
  );
}
