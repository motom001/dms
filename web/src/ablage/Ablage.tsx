import { useEffect, useMemo, useState } from 'react';
import { formatiere, istOk, titelFeld, type Mappentyp } from '../../../shared/src/model';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { MappeAnsicht, NeueMappe } from './MappeFormular';

/**
 * Ablage: hier wird mit Mappen gearbeitet. Feldeigenschaften und Schlüssel
 * bleiben unsichtbar – die gehören in die Einrichtung.
 *
 * /ablage                      erste Ablage öffnen
 * /ablage/:typId               Mappen eines Typs
 * /ablage/:typId/neu?verweis=  neue Mappe, optional mit vorbelegtem Verweis
 * /ablage/mappe/:id            eine Mappe
 */
export function Ablage({ teile, suche }: { teile: string[]; suche: URLSearchParams }) {
  const d = useDaten();
  const [, a, b] = teile;
  const mappe = a === 'mappe' ? d.mappe(b) : undefined;
  const typ = mappe ? d.typ(mappe.typId) : d.typ(a);

  useEffect(() => {
    if (!a && d.typen.length) geheZu(`/ablage/${d.typen[0].id}`, true);
  }, [a, d.typen]);

  let inhalt;
  if (!d.typen.length) {
    inhalt = (
      <div className="leer">
        <h2>Die Ablage ist noch leer</h2>
        <p>Lege in der Einrichtung fest, welche Arten von Mappen es gibt – zum Beispiel Vertragspartner, Verträge und Rechnungen. Oder lade die Beispiele, um das System kennenzulernen.</p>
        <Link to="/einrichtung" className="knopf primaer">Zur Einrichtung</Link>
      </div>
    );
  } else if (a === 'mappe') {
    inhalt = mappe && typ ? <MappeAnsicht key={mappe.id} typ={typ} mappe={mappe} /> : <div className="leer"><p>Diese Mappe gibt es nicht (mehr).</p></div>;
  } else if (typ && b === 'neu') {
    inhalt = <NeueMappe key={`${typ.id}-${suche.get('verweis') ?? ''}`} typ={typ} verweis={suche.get('verweis') ?? undefined} />;
  } else if (typ) {
    inhalt = <MappenListe key={typ.id} typ={typ} />;
  } else if (a) {
    inhalt = <div className="leer"><p>Diese Ablage gibt es nicht (mehr).</p></div>;
  }

  return (
    <div className="zweispaltig">
      <aside className="leiste">
        <h2 className="ueber">Ablage</h2>
        <nav className="typliste" aria-label="Mappentypen">
          {d.typen.map((t) => (
            <Link key={t.id} to={`/ablage/${t.id}`} className={`typeintrag ${typ?.id === t.id ? 'an' : ''}`}>
              <span className="nm">{t.name}</span><span className="zahl">{d.mappenVon(t.id).length}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <section className="inhalt">{inhalt}</section>
    </div>
  );
}

function MappenListe({ typ }: { typ: Mappentyp }) {
  const d = useDaten();
  const [filter, setFilter] = useState('');
  const tf = titelFeld(typ);
  const spalten = typ.felder.filter((f) => f.key !== tf?.key && f.typ !== 'langtext').slice(0, 3);
  const titelVon = (id: string) => d.titel(d.mappe(id));

  const zeilen = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return d.mappenVon(typ.id).filter((m) => !q || typ.felder.some((f) => formatiere(f, m.werte[f.key], titelVon).toLowerCase().includes(q)));
  }, [d, typ, filter]);

  return (
    <>
      <div className="seitenkopf">
        <div>
          <p className="ueber">Ablage</p>
          <h1>{typ.name}</h1>
          {typ.beschreibung && <p className="leise">{typ.beschreibung}</p>}
        </div>
        <Link to={`/ablage/${typ.id}/neu`} className="knopf gruen">+ Neue Mappe</Link>
      </div>
      <div className="blatt">
        <div className="werkzeug">
          <label className="suche" htmlFor="filter"><span className="sr">Mappen filtern</span>
            <input id="filter" type="search" placeholder={`In ${typ.name} suchen …`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <span className="leise">{zeilen.length} von {d.mappenVon(typ.id).length}</span>
        </div>
        {!zeilen.length ? (
          <div className="leer"><p>{filter ? 'Keine Mappe passt zum Filter.' : 'Noch keine Mappen in dieser Ablage.'}</p></div>
        ) : (
          <div className="tabellenrahmen">
            <table>
              <thead><tr><th scope="col">{tf?.label ?? 'Titel'}</th>{spalten.map((f) => <th key={f.key} scope="col">{f.label}</th>)}<th scope="col"><span className="sr">Prüfung</span></th></tr></thead>
              <tbody>
                {zeilen.map((m) => {
                  const ok = istOk(d.pruefe(typ, m.werte, m.id));
                  return (
                    <tr key={m.id}>
                      <th scope="row"><Link to={`/ablage/mappe/${m.id}`} className="verweis">{d.titel(m)}</Link></th>
                      {spalten.map((f) => <td key={f.key} className={['zahl', 'betrag', 'datum'].includes(f.typ) ? 'ziffern' : ''}>{formatiere(f, m.werte[f.key], titelVon)}</td>)}
                      <td>{!ok && <span className="chip warn" title="Passt nicht zur aktuellen Definition des Mappentyps">prüfen</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
