import { useCallback, useEffect, useRef, useState } from 'react';
import { formatiere, vorlageFelder, wirksameVorlage, type Mappe, type Mappentyp } from '../../../shared/src/model';
import { api, type Bezuege, type MappeDetails } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link } from '../ort';
import { titelOder, useSeiten } from '../seiten';
import { MappeAnsicht, NeueMappe } from './MappeFormular';

/**
 * Ablage in drei Spalten, von groß nach klein:
 *   Sichten  →  Mappen der Sicht  →  eine Mappe
 *
 * /ablage/:sicht                    Sicht „eingang“ oder die Id eines Mappentyps
 * /ablage/:sicht/:mappeId           Mappe rechts geöffnet
 * /ablage/:typId/neu?verweis=k:id   neue Mappe, optional mit vorbelegtem Verweis
 *
 * Die Liste lädt je 100 Mappen nach Titel sortiert und beim Scrollen die nächsten.
 */
const zahl = (n: number) => n.toLocaleString('de-DE');

export function Ablage({ teile, suche }: { teile: string[]; suche: URLSearchParams }) {
  const d = useDaten();
  const { ich } = useKonto();
  const [, sicht, dritt] = teile;

  useEffect(() => { if (!sicht) geheZu('/ablage/eingang', true); }, [sicht]);

  const typ = sicht && sicht !== 'eingang' ? d.typ(sicht) : undefined;
  const ebene = dritt ? 'mappe' : 'liste';

  let rechts;
  if (dritt === 'neu' && typ) {
    rechts = <NeueMappe key={`${typ.id}-${suche.get('verweis') ?? ''}`} typ={typ} sicht={sicht} verweis={suche.get('verweis') ?? undefined} />;
  } else if (dritt) {
    rechts = <MappeLader key={dritt} id={dritt} sicht={sicht} />;
  } else {
    rechts = <div className="platzhalter"><p>Wähle in der Liste eine Mappe aus{typ ? ' oder lege eine neue an' : ''}.</p></div>;
  }

  return (
    <div className="drei" data-ebene={ebene}>
      <aside className="spalte sichten" aria-label="Sichten">
        <h2 className="ueber">Sichten</h2>
        <nav className="sichtliste">
          <Link to="/ablage/eingang" className={`sicht ${sicht === 'eingang' ? 'an' : ''}`}>
            <span className="nm">Eingang</span>{d.zaehler.eingang > 0 && <span className="zaehler">{zahl(d.zaehler.eingang)}</span>}
          </Link>
          {d.typen.length > 0 && <hr />}
          {d.typen.map((t) => (
            <Link key={t.id} to={`/ablage/${t.id}`} className={`sicht ${sicht === t.id ? 'an' : ''}`}>
              <span className="nm">{t.name}</span><span className="zahl">{zahl(d.anzahl(t.id))}</span>
            </Link>
          ))}
        </nav>
        {!d.typen.length && <p className="leise klein">Noch keine Mappentypen. {ich.rolle === 'admin' ? <Link to="/werkbank/typen" className="verweis">Zur Werkbank</Link> : 'Ein Administrator muss sie zuerst einrichten.'}</p>}
      </aside>

      <section className="spalte liste" aria-label="Mappen">
        {sicht === 'eingang'
          ? <Liste key="eingang" sicht="eingang" titel="Eingang" offen={dritt}
              beschreibung="Deine Mappen, die nicht zur aktuellen Definition ihres Mappentyps passen. Sie verschwinden von hier, sobald sie korrigiert sind."
              leerText="Nichts zu tun." />
          : typ ? <Liste key={typ.id} sicht={typ.id} typ={typ} titel={typ.name} beschreibung={typ.beschreibung} offen={dritt} neu leerText="Noch keine Mappen in dieser Sicht." />
          : sicht ? <div className="leer"><p>Diese Sicht gibt es nicht (mehr).</p></div> : null}
      </section>

      <section className="spalte mappe" aria-label="Mappe">
        <Link to={`/ablage/${sicht ?? 'eingang'}`} className="verweis nur-schmal">← Zur Liste</Link>
        {rechts}
      </section>
    </div>
  );
}

/** Lädt eine Mappe mit Rückverweisen, Dokumenten und Bezügen und zeigt sie an. */
function MappeLader({ id, sicht }: { id: string; sicht: string }) {
  const d = useDaten();
  const [details, setDetails] = useState<MappeDetails | null | 'fehlt'>(null);
  const laden = useCallback(async () => {
    try { setDetails(await api.mappe(id)); } catch { setDetails('fehlt'); }
  }, [id]);
  useEffect(() => { void laden(); }, [laden, d.stand]);
  if (details === null) return <p className="leise">Lade …</p>;
  if (details === 'fehlt') return <div className="leer"><p>Diese Mappe gibt es nicht (mehr).</p></div>;
  const t = d.typ(details.mappe.typId);
  if (!t) return <div className="leer"><p>Der Mappentyp dieser Mappe fehlt.</p></div>;
  return <MappeAnsicht key={details.mappe.id} typ={t} details={details} sicht={sicht} neuLaden={laden} />;
}

/** Nebenzeile eines Listeneintrags: zwei Felder, die nicht schon im Titel stehen. */
function unterzeile(typ: Mappentyp, m: Mappe, bezuege: Bezuege) {
  const imTitel = new Set(vorlageFelder(wirksameVorlage(typ)));
  const neben = typ.felder.filter((f) => !imTitel.has(f.key) && f.typ !== 'langtext').slice(0, 2);
  return neben.map((f) => formatiere(f, m.werte[f.key], (id) => titelOder(bezuege[id]?.titel))).filter(Boolean).join(' · ');
}

function Liste(p: { sicht: string; typ?: Mappentyp; titel: string; beschreibung?: string; offen?: string; neu?: boolean; leerText: string }) {
  const d = useDaten();
  const [eingabe, setEingabe] = useState('');
  const [suche, setSuche] = useState('');
  // Suche erst nach einer kurzen Tipppause an den Server schicken.
  useEffect(() => { const t = setTimeout(() => setSuche(eingabe.trim()), 250); return () => clearTimeout(t); }, [eingabe]);
  const s = useSeiten(p.sicht, suche, d.stand);

  // Ende der Liste erreicht → nächste Seite laden.
  const ende = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = ende.current;
    if (!el) return;
    const o = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) s.mehr(); }, { rootMargin: '300px' });
    o.observe(el);
    return () => o.disconnect();
  }, [s.mehr, s.mappen.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const gesamtSicht = p.typ ? d.anzahl(p.typ.id) : d.zaehler.eingang;
  const zeigeSuche = gesamtSicht > 5 || !!eingabe;
  const anzahlText = s.gesamt === null ? '' : suche
    ? `${zahl(s.gesamt)} ${s.gesamt === 1 ? 'Treffer' : 'Treffer'}`
    : `${zahl(s.gesamt)} ${s.gesamt === 1 ? 'Mappe' : 'Mappen'}`;

  return (
    <>
      <div className="listenkopf">
        <div>
          <h1>{p.titel}</h1>
          {p.beschreibung && <p className="leise klein">{p.beschreibung}</p>}
        </div>
        {p.neu && <Link to={`/ablage/${p.sicht}/neu`} className="knopf gruen klein">+ Neu</Link>}
      </div>
      {zeigeSuche && (
        <label className="suche"><span className="sr">Suchen</span>
          <input type="search" placeholder="Suchen in Titel und Werten …" value={eingabe} onChange={(e) => setEingabe(e.target.value)} />
        </label>
      )}
      {anzahlText && <p className="listenzahl leise klein" aria-live="polite">{anzahlText}{s.mappen.length < (s.gesamt ?? 0) ? `, ${zahl(s.mappen.length)} geladen` : ''}</p>}
      {s.fehler && <div className="hinweis schlecht"><p>{s.fehler}</p></div>}
      {s.gesamt === 0
        ? <p className="leise leerliste">{suche ? 'Nichts gefunden.' : p.leerText}</p>
        : <ul className="mappenliste">
            {s.mappen.map((m) => {
              const typ = d.typ(m.typId);
              return (
                <li key={m.id}>
                  <Link to={`/ablage/${p.sicht}/${m.id}`} className={`eintrag ${p.offen === m.id ? 'an' : ''}`}>
                    <span className="titel">{titelOder(m.titel)}</span>
                    {p.typ ? (typ && <Unter text={unterzeile(typ, m, s.bezuege)} />) : <span className="unter">{typ?.name}</span>}
                    {m.passt === false && <span className="problem">{p.typ ? 'passt nicht zur Definition' : m.problem}</span>}
                  </Link>
                </li>
              );
            })}
            {!s.alle && <li ref={ende} className="nachladen leise klein">{s.laedt ? 'Lade …' : <button type="button" className="textknopf" onClick={s.mehr}>Weitere laden</button>}</li>}
          </ul>}
    </>
  );
}

const Unter = ({ text }: { text: string }) => (text ? <span className="unter">{text}</span> : null);
