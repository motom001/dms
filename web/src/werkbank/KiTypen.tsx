/**
 * KI-Dienste und Mappentypen (#796) im Reiter „Einstellungen“ eines KI-Pakets (#996, Feldart `ki_mappentypen`): welche
 * Mappentypen es bekommt. Ein KI-Paket ist ein Paket, das Inhalte lesen oder bekommen kann und ins Netz darf. Seit #1635
 * gibt es dafür eine Stelle – die Feinabstimmung unter „Was Ablago darf“; hier steht nur, was das Paket bekommt, mit
 * einem Verweis dorthin (der Wert des Felds bleibt unverändert, gespeichert wird hier nichts).
 */
import { useEffect, useState } from 'react';
import type { KiUebersicht } from '../../../shared/src/pakete';
import { sucheApi } from '../api/suche';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import { Knopf, KnopfLink } from '../bausteine';
import { FEIN_ZIEL } from './uebersicht/Feinabstimmung';

/** Die Feldart im Formular (#1635): was das Paket bekommt, ausgenommene Bereiche und der Weg zur Feinabstimmung. */
export function KiTypenFeld({ paket, k }: { paket: string; k: KiUebersicht; wert?: string[]; setze?: (v: string[]) => void }) {
  const bekommt = new Set(k.pakete.find((x) => x.id === paket)?.bekommt ?? []);
  const namen = k.typen.filter((x) => bekommt.has(x.id)).map((x) => x.name);
  const aus = k.typen.filter((x) => !x.zugelassen).map((x) => x.name);
  return (
    <div className="stapel" data-anker="pakete.ki-typen">
      <p className="leise klein">
        {t('pakete.ki.text')} <Hilfe ort="pakete.ki" />
      </p>
      <p>{namen.length ? t('pakete.ki.bekommt', { namen: namen.join(', ') }) : <strong>{t('pakete.ki.bekommt-nichts')}</strong>}</p>
      {aus.length > 0 && <p className="leise klein">{t('pakete.ki.ausgenommen', { namen: aus.join(', ') })}</p>}
      <div className="knoepfe">
        <KnopfLink to={FEIN_ZIEL} groesse="klein">
          {t('pakete.ki.zur-feinabstimmung')}
        </KnopfLink>
      </div>
    </div>
  );
}

/** Übersicht eines KI-Pakets (#996): nur eine Zeile, aus wie vielen Mappentypen es Inhalte bekommt, mit „Ändern“. */
export function KiTypenZeile({ paket, aendern }: { paket: string; aendern: () => void }) {
  const [k, setK] = useState<KiUebersicht | null>(null);
  useEffect(() => {
    sucheApi.kiTypen().then(setK, () => setK(null));
  }, []);
  if (!k) return null;
  const n = k.pakete.find((x) => x.id === paket)?.bekommt.length ?? 0;
  return (
    <p>
      {n ? t('pakete.reiter.ki-zeile', { anzahl: n }) : <strong>{t('pakete.ki.bekommt-nichts')}</strong>}{' '}
      <Knopf onClick={aendern}>{t('pakete.reiter.aendern')}</Knopf>
    </p>
  );
}
