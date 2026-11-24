/**
 * KI-Dienste und Mappentypen (#796) im Reiter „Einstellungen“ eines KI-Pakets (#996, Feldart `ki_mappentypen`): welche
 * Mappentypen es bekommt, und alle Mappentypen zum Zulassen oder Sperren. Ein KI-Paket ist ein Paket, das Inhalte lesen
 * oder bekommen kann und ins Netz darf. Neue Mappentypen sind gesperrt, bis man sie zulässt. Gilt sofort für alle
 * KI-Pakete – gespeichert wird mit dem Knopf des Reiters.
 */
import { useEffect, useState } from 'react';
import type { KiUebersicht } from '../../../shared/src/pakete';
import { sucheApi } from '../api/suche';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { t } from '../sprache';
import { FeldGruppe, Knopf } from '../bausteine';

/** Die Feldart im Formular: `wert` sind die zugelassenen Mappentypen (Ids). */
export function KiTypenFeld({
  paket,
  k,
  wert,
  setze,
  fehler,
}: {
  paket: string;
  k: KiUebersicht;
  wert: string[];
  setze: (v: string[]) => void;
  fehler?: string;
}) {
  const bekommt = new Set(k.pakete.find((x) => x.id === paket)?.bekommt ?? []);
  const namen = k.typen.filter((x) => bekommt.has(x.id)).map((x) => x.name);
  const an = new Set(wert);
  return (
    <div className="stapel" data-anker="pakete.ki-typen">
      <p className="leise klein">
        {t('pakete.ki.text')} <Hilfe ort="pakete.ki" />
      </p>
      <p>{namen.length ? t('pakete.ki.bekommt', { namen: namen.join(', ') }) : <strong>{t('pakete.ki.bekommt-nichts')}</strong>}</p>
      <FeldGruppe
        beschriftung={t('pakete.ki.zulassen', { zugelassen: an.size, alle: k.typen.length })}
        hinweis={t('pakete.ki.zulassen.text')}
        fehler={fehler}>
        <ul className="auswahlliste">
          {k.typen.map((x) => (
            <li key={x.id}>
              <label className="haken">
                <input
                  type="checkbox"
                  checked={an.has(x.id)}
                  onChange={(ev) => setze(ev.target.checked ? [...wert, x.id] : wert.filter((y) => y !== x.id))}
                />
                <span>
                  <Link to={`/werkbank/typen/${x.id}#berechtigungen`} className="verweis">
                    {x.name}
                  </Link>
                  {x.zugelassen && !bekommt.has(x.id) && <small className="hilfe">{t('pakete.ki.nicht-lesbar')}</small>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </FeldGruppe>
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
