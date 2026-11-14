import { useEffect, useState } from 'react';
import type { SelbstErstelltDetail } from '../../../shared/src/paketerstellung';
import { api } from '../api';
import { geheZu } from '../ort';
import { Knopf, KnopfLink } from '../bausteine';
import { t } from '../sprache';
import { ERSTELLEN } from './Pakete';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Selbst erstelltes Paket in der Paketverwaltung (#652): was damals erstellt wurde, der Vergleich mit heute,
 * „Neue Version erstellen“, jede gespeicherte Version „Als ZIP herunterladen“ und „Aus der Liste nehmen“.
 * Kein Entfernen, das Typen oder Ansichten löscht – sie sind das Original in diesem Ablago.
 */
export function SelbstErstelltAnsicht({ id, konflikt, onGeaendert }: { id: string; konflikt: boolean; onGeaendert(): void }) {
  const [d, setD] = useState<SelbstErstelltDetail | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { setD(null); api.selbstErstelltDetail(id).then(setD, (e) => setFehler((e as Error).message)); }, [id]);
  if (fehler) return <div className="einspaltig"><div className="hinweis schlecht"><p>{fehler}</p></div></div>;
  if (!d) return <div className="leer"><p>{t('werkbank.selbsterstellt.lade')}</p></div>;
  const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema());
  async function ausListe() {
    if (!d) return;
    try { await api.selbstAusListe(d.id); onGeaendert(); geheZu('/werkbank/pakete', true); }
    catch (e) { setFehler((e as Error).message); }
  }
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('pakete.selbst.ueber')}</p>
        <h1>{d.name} <span className="chip" title={t('pakete.selbst.chipTitel')}>{t('pakete.selbst.chip')}</span></h1>
        <p className="leise">{d.beschreibung}</p>
        <p className="leise klein">{t('pakete.selbst.text')}</p>
      </div>
      {konflikt && <div className="hinweis warn"><p>{t('pakete.selbst.konflikt', { id: d.id })}</p></div>}
      <div className="knoepfe">
        <KnopfLink to={`/werkbank/pakete/${ERSTELLEN}?von=${encodeURIComponent(d.id)}`} art="haupt">{t('pakete.selbst.neueVersion')}</KnopfLink>
        {d.versionen[0] && <a className="knopf" href={api.selbstErstelltZip(d.id, d.versionen[0].version)}>{t('pakete.selbst.zip')}</a>}
        <Knopf art="gefahr" symbol="schliessen" onClick={() => ausListe()}
          rueckfrage={{ titel: t('pakete.selbst.ausListe'), text: t('pakete.selbst.ausListeFrage', { name: d.name }), ja: t('pakete.selbst.ausListe') }}>{t('pakete.selbst.ausListe')}</Knopf>
      </div>
      <section className="blatt">
        <h2 className="h3">{t('pakete.selbst.umfang')}</h2>
        <dl className="eigenschaften">
          <dt>{t('pakete.selbst.typen')}</dt>
          <dd>{d.typen.length ? d.typen.map((x, i) => <span key={x.id}>{i > 0 && ', '}{x.name ?? <em className="leise">{t('pakete.selbst.weg')}</em>}{x.geaendert && <> <span className="chip warn">{t('pakete.selbst.geaendert')}</span></>}</span>) : '–'}</dd>
          <dt>{t('pakete.selbst.sichten')}</dt>
          <dd>{d.sichten.length ? d.sichten.map((x, i) => <span key={x.id}>{i > 0 && ', '}{x.name ?? <em className="leise">{t('pakete.selbst.weg')}</em>}</span>) : '–'}</dd>
          <dt>{t('pakete.selbst.beispiele')}</dt><dd>{d.beispiele || '–'}</dd>
        </dl>
      </section>
      <section className="blatt">
        <h2 className="h3">{t('pakete.selbst.angaben')}</h2>
        <dl className="eigenschaften">
          <dt>{t('werkbank.selbsterstellt.id')}</dt><dd><code>{d.id}</code></dd>
          <dt>{t('werkbank.selbsterstellt.version')}</dt><dd>{d.version} · {datum(d.erstellt)}{d.von ? ` · ${d.von}` : ''}</dd>
          <dt>{t('werkbank.selbsterstellt.lizenz')}</dt><dd>{d.lizenz}</dd>
          <dt>{t('werkbank.selbsterstellt.noetige-ablago-version')}</dt><dd>{d.dms}</dd>
          <dt>{t('werkbank.selbsterstellt.autor')}</dt><dd>{d.autor.name}{d.autor.github ? ` (@${d.autor.github})` : ''}</dd>
        </dl>
      </section>
      <section className="blatt">
        <h2 className="h3">{t('pakete.selbst.versionen')}</h2>
        <ul className="stapel">
          {d.versionen.map((v) => (
            <li key={v.version}><a className="textknopf" href={api.selbstErstelltZip(d.id, v.version)}>{t('pakete.selbst.zipVersion', { version: v.version })}</a>
              <small className="leise"> · {datum(v.erstellt)}{v.version === d.version && d.aenderungen ? ` · ${d.aenderungen}` : d.verlauf.find((x) => x.version === v.version)?.text ? ` · ${d.verlauf.find((x) => x.version === v.version)!.text}` : ''}</small></li>
          ))}
        </ul>
        {d.verlauf.some((x) => !d.versionen.some((v) => v.version === x.version)) && <p className="leise klein">{t('pakete.selbst.nichtGespeichert')}</p>}
      </section>
    </div>
  );
}
