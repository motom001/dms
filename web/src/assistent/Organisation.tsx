import { ORGANISATION_MAX, type PlanOrganisation } from '../../../shared/src/einrichtungsplan';
import { Feld } from '../bausteine';
import { t } from '../sprache';

/**
 * „Deine Organisation“ im Einrichtungsassistenten (#1045): wenige Felder, nur der Name ist Pflicht – den Rest kann man
 * leer lassen und später in der Ablage ergänzen (Hinweis Qualität: sonst bricht ab, wer die Telefonnummer gerade nicht
 * weiß). „Jetzt einrichten“ legt daraus die eigene Organisation an (#995).
 */
export function OrganisationFelder({ wert, setze, fehler }: { wert: PlanOrganisation; setze(o: PlanOrganisation): void; fehler?: string }) {
  const p = (k: keyof PlanOrganisation) => ({ value: wert[k], maxLength: ORGANISATION_MAX[k], onChange: (x: { target: { value: string } }) => setze({ ...wert, [k]: x.target.value }) });
  return (
    <div className="stapel">
      <Feld beschriftung={t('einrichtung.nutzung.organisation.name')} hinweis={t('einrichtung.nutzung.organisation.name.hinweis')} fehler={fehler}>
        <input {...p('name')} autoComplete="organization" />
      </Feld>
      <div className="formular">
        <Feld beschriftung={t('einrichtung.nutzung.organisation.strasse')} optional><input {...p('strasse')} autoComplete="address-line1" /></Feld>
        <Feld beschriftung={t('einrichtung.nutzung.organisation.hausnummer')} optional><input {...p('hausnummer')} autoComplete="off" /></Feld>
        <Feld beschriftung={t('einrichtung.nutzung.organisation.plz')} optional><input {...p('plz')} autoComplete="postal-code" inputMode="numeric" /></Feld>
        <Feld beschriftung={t('einrichtung.nutzung.organisation.ort')} optional><input {...p('ort')} autoComplete="address-level2" /></Feld>
        <Feld beschriftung={t('einrichtung.nutzung.organisation.email')} optional><input {...p('email')} type="email" autoComplete="email" /></Feld>
        <Feld beschriftung={t('einrichtung.nutzung.organisation.telefon')} optional><input {...p('telefon')} type="tel" autoComplete="tel" /></Feld>
      </div>
    </div>
  );
}
