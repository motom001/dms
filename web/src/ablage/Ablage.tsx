import { useEffect, useMemo, useState } from 'react';
import { formatiere, istOk, vorlageFelder, wirksameVorlage, type Mappe, type Mappentyp } from '../../../shared/src/model';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link } from '../ort';
import { MappeAnsicht, NeueMappe } from './MappeFormular';

/**
 * Ablage in drei Spalten, von groß nach klein:
 *   Sichten  →  Mappen der Sicht  →  eine Mappe
 *
 * /ablage/:sicht                    Sicht „eingang“ oder die Id eines Mappentyps
 * /ablage/:sicht/:mappeId           Mappe rechts geöffnet
 * /ablage/:typId/neu?verweis=k:id   neue Mappe, optional mit vorbelegtem Verweis
 */
interface Eintrag { mappe: Mappe; typ: Mappentyp; titel: string; unter: string; problem?: string }

export function Ablage({ teile, suche }: { teile: string[]; suche: URLSearchParams }) {
  const d = useDaten();
  const { ich } = useKonto();
  const [, sicht, dritt] = teile;

  useEffect(() => { if (!sicht) geheZu('/ablage/eingang', true); }, [sicht]);

  // Eingang: eigene Mappen, die nicht (mehr) zur Definition passen.
  // Mappen ohne bekannten Ersteller landen beim Administrator.
  const eingang = useMemo<Eintrag[]>(() => d.mappen.flatMap((m) => {
    const zustaendig = m.erstelltVon === ich.id || (ich.rolle === 'admin' && !m.erstelltVon);
    const typ = d.typ(m.typId);
    if (!zustaendig || !typ) return [];
    const p = d.pruefe(typ, m.werte, m.id);
    if (istOk(p)) return [];
    const [key, msg] = Object.entries(p.felder)[0] ?? [];
    const feld = typ.felder.find((f) => f.key === key);
    return [{ mappe: m, typ, titel: d.titel(m), unter: typ.name, problem: feld ? `${feld.label}: ${msg?.[0]}` : p.allgemein[0] }];
  }), [d, ich]);

  const typ = sicht && sicht !== 'eingang' ? d.typ(sicht) : undefined;
  const offen = dritt && dritt !== 'neu' ? d.mappe(dritt) : undefined;
  const ebene = dritt ? 'mappe' : 'liste';

  let rechts;
  if (dritt === 'neu' && typ) {
    rechts = <NeueMappe key={`${typ.id}-${suche.get('verweis') ?? ''}`} typ={typ} sicht={sicht} verweis={suche.get('verweis') ?? undefined} />;
  } else if (offen) {
    const t = d.typ(offen.typId);
    rechts = t ? <MappeAnsicht key={offen.id} typ={t} mappe={offen} sicht={sicht} /> : null;
  } else if (dritt) {
    rechts = <div className="leer"><p>Diese Mappe gibt es nicht (mehr).</p></div>;
  } else {
    rechts = <div className="platzhalter"><p>Wähle in der Liste eine Mappe aus{typ ? ' oder lege eine neue an' : ''}.</p></div>;
  }

  return (
    <div className="drei" data-ebene={ebene}>
      <aside className="spalte sichten" aria-label="Sichten">
        <h2 className="ueber">Sichten</h2>
        <nav className="sichtliste">
          <Link to="/ablage/eingang" className={`sicht ${sicht === 'eingang' ? 'an' : ''}`}>
            <span className="nm">Eingang</span>{eingang.length > 0 && <span className="zaehler">{eingang.length}</span>}
          </Link>
          {d.typen.length > 0 && <hr />}
          {d.typen.map((t) => (
            <Link key={t.id} to={`/ablage/${t.id}`} className={`sicht ${sicht === t.id ? 'an' : ''}`}>
              <span className="nm">{t.name}</span><span className="zahl">{d.mappenVon(t.id).length}</span>
            </Link>
          ))}
        </nav>
        {!d.typen.length && <p className="leise klein">Noch keine Mappentypen. {ich.rolle === 'admin' ? <Link to="/werkbank/typen" className="verweis">Zur Werkbank</Link> : 'Ein Administrator muss sie zuerst einrichten.'}</p>}
      </aside>

      <section className="spalte liste" aria-label="Mappen">
        {sicht === 'eingang'
          ? <Liste titel="Eingang" beschreibung="Deine Mappen, die nicht zur aktuellen Definition ihres Mappentyps passen. Sie verschwinden von hier, sobald sie korrigiert sind." eintraege={eingang} sicht="eingang" offen={offen?.id} leerText="Nichts zu tun." />
          : typ ? <TypListe typ={typ} offen={offen?.id} />
          : sicht ? <div className="leer"><p>Diese Sicht gibt es nicht (mehr).</p></div> : null}
      </section>

      <section className="spalte mappe" aria-label="Mappe">
        <Link to={`/ablage/${sicht ?? 'eingang'}`} className="verweis nur-schmal">← Zur Liste</Link>
        {rechts}
      </section>
    </div>
  );
}

function TypListe({ typ, offen }: { typ: Mappentyp; offen?: string }) {
  const d = useDaten();
  const imTitel = new Set(vorlageFelder(wirksameVorlage(typ)));
  const nebenfelder = typ.felder.filter((f) => !imTitel.has(f.key) && f.typ !== 'langtext').slice(0, 2);
  const titelVon = (id: string) => d.titel(d.mappe(id));
  const eintraege = d.mappenVon(typ.id).map((m) => ({
    mappe: m, typ, titel: d.titel(m),
    unter: nebenfelder.map((f) => formatiere(f, m.werte[f.key], titelVon)).filter(Boolean).join(' · '),
    problem: istOk(d.pruefe(typ, m.werte, m.id)) ? undefined : 'passt nicht zur Definition',
  }));
  return <Liste titel={typ.name} beschreibung={typ.beschreibung} eintraege={eintraege} sicht={typ.id} offen={offen} neu leerText="Noch keine Mappen in dieser Sicht." />;
}

function Liste(p: { titel: string; beschreibung?: string; eintraege: Eintrag[]; sicht: string; offen?: string; neu?: boolean; leerText: string }) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const sichtbar = q ? p.eintraege.filter((e) => `${e.titel} ${e.unter}`.toLowerCase().includes(q)) : p.eintraege;
  return (
    <>
      <div className="listenkopf">
        <div>
          <h1>{p.titel}</h1>
          {p.beschreibung && <p className="leise klein">{p.beschreibung}</p>}
        </div>
        {p.neu && <Link to={`/ablage/${p.sicht}/neu`} className="knopf gruen klein">+ Neu</Link>}
      </div>
      {p.eintraege.length > 5 && (
        <label className="suche"><span className="sr">Liste filtern</span>
          <input type="search" placeholder="Filtern …" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
      )}
      {!sichtbar.length
        ? <p className="leise leerliste">{q ? 'Nichts passt zum Filter.' : p.leerText}</p>
        : <ul className="mappenliste">
            {sichtbar.map((e) => (
              <li key={e.mappe.id}>
                <Link to={`/ablage/${p.sicht}/${e.mappe.id}`} className={`eintrag ${p.offen === e.mappe.id ? 'an' : ''}`}>
                  <span className="titel">{e.titel}</span>
                  {e.unter && <span className="unter">{e.unter}</span>}
                  {e.problem && <span className="problem">{e.problem}</span>}
                </Link>
              </li>
            ))}
          </ul>}
    </>
  );
}
