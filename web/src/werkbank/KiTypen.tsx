/**
 * KI-Dienste und Mappentypen (#796) auf der Seite eines KI-Pakets: welche Mappentypen es bekommt, und alle Mappentypen
 * zum Zulassen oder Sperren. Ein KI-Paket ist ein Paket, das Inhalte lesen oder bekommen kann und ins Netz darf.
 * Neue Mappentypen sind gesperrt, bis man sie zulässt. Gilt sofort für alle KI-Pakete.
 */
import { useEffect, useState } from 'react';
import type { KiUebersicht } from '../../../shared/src/pakete';
import { api } from '../api';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { t } from '../sprache';
import { FeldGruppe } from '../bausteine';

export function KiTypenBlock({ paket }: { paket: string }) {
  const [k, setK] = useState<KiUebersicht | null>(null);
  const [fehler, setFehler] = useState('');
  const [sendet, setSendet] = useState('');
  useEffect(() => { api.kiTypen().then(setK, (e: Error) => setFehler(e.message)); }, []);
  if (!k) return fehler ? <p className="fehlertext">{fehler}</p> : null;
  const p = k.pakete.find((x) => x.id === paket);
  const bekommt = new Set(p?.bekommt ?? []);
  const setze = async (typId: string, zugelassen: boolean) => {
    setSendet(typId); setFehler('');
    try { setK(await api.setzeKiTyp(typId, zugelassen)); } catch (e) { setFehler((e as Error).message); } finally { setSendet(''); }
  };
  const namen = k.typen.filter((x) => bekommt.has(x.id)).map((x) => x.name);
  return (
    <section aria-labelledby="ki-typen-titel">
      <h2 className="h3" id="ki-typen-titel">{t('pakete.ki.titel')} <Hilfe ort="pakete.ki" /></h2>
      <p className="leise klein">{t('pakete.ki.text')}</p>
      <p>{namen.length ? t('pakete.ki.bekommt', { namen: namen.join(', ') }) : <strong>{t('pakete.ki.bekommt-nichts')}</strong>}</p>
      {fehler && <p className="hinweis schlecht" role="alert">{fehler}</p>}
      <details className="klein" open={!namen.length}>
        <summary>{t('pakete.ki.zulassen', { zugelassen: k.typen.filter((x) => x.zugelassen).length, alle: k.typen.length })}</summary>
        <p className="leise">{t('pakete.ki.zulassen.text')}</p>
        <FeldGruppe beschriftung={t('pakete.ki.zugelassene-typen')} beschriftungVerbergen>
          <ul className="auswahlliste">
            {k.typen.map((x) => (
              <li key={x.id}>
                <label className="haken"><input type="checkbox" checked={x.zugelassen} disabled={sendet === x.id} onChange={(ev) => void setze(x.id, ev.target.checked)} />
                  <span><Link to={`/werkbank/typen/${x.id}#ki`} className="verweis">{x.name}</Link>
                    {x.zugelassen && !bekommt.has(x.id) && <small className="hilfe">{t('pakete.ki.nicht-lesbar')}</small>}</span>
                </label>
              </li>
            ))}
          </ul>
        </FeldGruppe>
      </details>
    </section>
  );
}
