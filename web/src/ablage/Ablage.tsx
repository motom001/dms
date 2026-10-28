import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { kinderVon, mitNachkommen, type Sicht } from '../../../shared/src/sichten';
import { darfErstellen, formatiere, GEMISCHTE_SPALTEN, istSystemspalte, sortierbar, SYSTEMSPALTEN, vorlageFelder, wirksameVorlage, type Mappe, type Mappentyp, type Sortierung } from '../../../shared/src/model';
import { api, type Bezuege, type MappeDetails } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link } from '../ort';
import { Dreiteilung } from '../bereiche';
import { titelOder, useSeiten } from '../seiten';
import { MappeAnsicht, NeueMappe } from './MappeFormular';

/**
 * Ablage in drei Spalten, von groß nach klein:
 *   Sichten  →  Mappen der Sicht  →  eine Mappe
 *
 * /ablage/:sicht                    „eingang“, eine verwaltete Sicht (#38) oder die Id eines Mappentyps
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

  // Der eine Mappentyp der Sicht (für Trefferliste, Sortierung, „+ Neu“); bei mehreren Typen keiner.
  const verwaltet = d.sicht(sicht);
  const typ = d.typDerSicht(sicht);
  const ebene = dritt ? 'mappe' : 'liste';

  let rechts;
  if (dritt === 'neu' && !typ) {
    rechts = <div className="leer"><p>Diese Sicht zeigt mehrere Mappentypen. Lege neue Mappen in der Sicht eines einzelnen Typs an.</p></div>;
  } else if (dritt === 'neu' && typ && !darfErstellen(typ)) {
    rechts = <div className="leer"><p>Von „{typ.name}“ lassen sich in der Ablage keine neuen Mappen anlegen.{typ.system === 'benutzer' ? ' Benutzer legt ein Administrator in der Werkbank unter „Benutzer“ an.' : ''}</p></div>;
  } else if (dritt === 'neu' && typ) {
    rechts = <NeueMappe key={`${typ.id}-${suche.get('verweis') ?? ''}`} typ={typ} sicht={sicht} verweis={suche.get('verweis') ?? undefined} />;
  } else if (dritt) {
    rechts = <MappeLader key={dritt} id={dritt} sicht={sicht} />;
  } else {
    rechts = <div className="platzhalter"><p>Wähle in der Liste eine Mappe aus{typ ? ' oder lege eine neue an' : ''}.</p></div>;
  }

  return (
    <Dreiteilung ort="ablage" ebene={ebene} offen={dritt}>
      <aside className="spalte sichten" aria-label="Sichten">
        <h2 className="ueber">Sichten</h2>
        <nav className="sichtliste">
          <Link to="/ablage/eingang" className={`sicht ${sicht === 'eingang' ? 'an' : ''}`}>
            <span className="nm">Eingang</span>{d.zaehler.eingang > 0 && <span className="zaehler">{zahl(d.zaehler.eingang)}</span>}
          </Link>
          {d.sichten.length > 0 && <hr />}
          <SichtBaum aktiv={sicht} />
        </nav>
        {!d.typen.length && <p className="leise klein">Noch keine Mappentypen. {ich.rolle === 'admin' ? <Link to="/werkbank/typen" className="verweis">Zur Werkbank</Link> : 'Ein Administrator muss sie zuerst einrichten.'}</p>}
        {d.typen.length > 0 && !d.sichten.length && <p className="leise klein">Noch keine Sichten. {ich.rolle === 'admin' ? <Link to="/werkbank/sichten" className="verweis">Sichten einrichten</Link> : 'Ein Administrator muss sie zuerst einrichten.'}</p>}
      </aside>

      <section className="spalte liste" aria-label="Mappen">
        {sicht === 'eingang'
          ? <Liste key="eingang" sicht="eingang" titel="Eingang" offen={dritt}
              beschreibung="Deine Mappen, die nicht zur aktuellen Definition ihres Mappentyps passen. Sie verschwinden von hier, sobald sie korrigiert sind."
              leerText="Nichts zu tun." />
          : verwaltet || typ ? <Liste key={sicht} sicht={sicht!} typ={typ} titel={verwaltet?.name ?? typ!.name} beschreibung={verwaltet ? verwaltet.beschreibung : typ?.beschreibung}
              offen={dritt} neu={!!typ && darfErstellen(typ)} leerText="Noch keine Mappen in dieser Sicht." />
          : sicht ? <div className="leer"><p>Diese Sicht gibt es nicht (mehr).</p></div> : null}
      </section>

      <section className="spalte mappe" aria-label="Mappe">
        <Link to={`/ablage/${sicht ?? 'eingang'}`} className="verweis nur-schmal">← Zur Liste</Link>
        {rechts}
      </section>
    </Dreiteilung>
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
  const neben = typ.felder.filter((f) => !imTitel.has(f.key) && f.typ !== 'langtext' && f.typ !== 'passwort').slice(0, 2);
  return neben.map((f) => formatiere(f, m.werte[f.key], (id) => titelOder(bezuege[id]?.titel))).filter(Boolean).join(' · ');
}

function Liste(p: { sicht: string; typ?: Mappentyp; titel: string; beschreibung?: string; offen?: string; neu?: boolean; leerText: string }) {
  const d = useDaten();
  const [eingabe, setEingabe] = useState('');
  const [suche, setSuche] = useState('');
  // Suche erst nach einer kurzen Tipppause an den Server schicken.
  useEffect(() => { const t = setTimeout(() => setSuche(eingabe.trim()), 250); return () => clearTimeout(t); }, [eingabe]);

  // Sortierung je Benutzer und Mappentyp (bzw. Eingang), auf dem Server gespeichert.
  const sortSchluessel = `sortierung:${p.sicht}`;
  const sortierung = (d.einstellungen[sortSchluessel] as Sortierung | undefined) ?? null;
  const sortiere = (spalte: string) => {
    const n: Sortierung | null = sortierung?.spalte === spalte ? { spalte, absteigend: !sortierung.absteigend } : { spalte, absteigend: false };
    d.setzeEinstellung(sortSchluessel, n.spalte === '_titel' && !n.absteigend ? null : n);
  };
  const s = useSeiten(p.sicht, suche, d.stand, sortierung);

  // Breite der Liste: schmal → kompakte Einträge, breit → Tabelle (#22).
  const mess = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);
  useEffect(() => {
    const el = mess.current;
    if (!el) return;
    const o = new ResizeObserver(([e]) => setBreite(e.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const spalten = spaltenFuer(p.typ);
  const tabelle = spalten.length > 0 && breite >= Math.max(560, spalten.length * 120);

  // Ende der Liste erreicht → nächste Seite laden.
  const ende = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ende.current;
    if (!el) return;
    const o = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) s.mehr(); }, { rootMargin: '300px' });
    o.observe(el);
    return () => o.disconnect();
  }, [s.mehr, s.mappen.length, tabelle]); // eslint-disable-line react-hooks/exhaustive-deps

  const gesamtSicht = p.sicht === 'eingang' ? d.zaehler.eingang : d.zaehler.sichten?.[p.sicht] ?? (p.typ ? d.anzahl(p.typ.id) : 0);
  const zeigeSuche = gesamtSicht > 5 || !!eingabe;
  const anzahlText = s.gesamt === null ? '' : suche
    ? `${zahl(s.gesamt)} Treffer`
    : `${zahl(s.gesamt)} ${s.gesamt === 1 ? 'Mappe' : 'Mappen'}`;
  const nachladen = !s.alle && (s.laedt ? 'Lade …' : <button type="button" className="textknopf" onClick={s.mehr}>Weitere laden</button>);

  return (
    <>
      <div ref={mess} className="breitenmesser" aria-hidden="true" />
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
      {anzahlText && (
        <p className="listenzahl leise klein" aria-live="polite">
          {anzahlText}{s.mappen.length < (s.gesamt ?? 0) ? `, ${zahl(s.mappen.length)} geladen` : ''}
          {sortierung && <> · sortiert nach {spaltenName(sortierung.spalte, p.typ)} {sortierung.absteigend ? '↓' : '↑'} <button type="button" className="textknopf" onClick={() => d.setzeEinstellung(sortSchluessel, null)}>nach Titel</button></>}
        </p>
      )}
      {s.fehler && <div className="hinweis schlecht"><p>{s.fehler}</p></div>}
      {s.gesamt === 0
        ? <p className="leise leerliste">{suche ? 'Nichts gefunden.' : p.leerText}</p>
        : tabelle
          ? <Tabelle sicht={p.sicht} typ={p.typ} spalten={spalten} mappen={s.mappen} bezuege={s.bezuege} offen={p.offen}
              sortierung={sortierung} sortiere={sortiere} ende={nachladen ? (el) => { ende.current = el; } : undefined} nachladen={nachladen} />
          : <ul className="mappenliste">
              {s.mappen.map((m) => {
                const typ = d.typ(m.typId);
                const k = kompakt(p.typ, typ, m, s.bezuege, d.person);
                return (
                  <li key={m.id}>
                    <Link to={`/ablage/${p.sicht}/${m.id}`} className={`eintrag ${p.offen === m.id ? 'an' : ''}`}>
                      <span className="titel">{k.titel}</span>
                      <Unter text={k.unter} />
                      {m.passt === false && <span className="problem">{p.typ ? 'passt nicht zur Definition' : m.problem}</span>}
                    </Link>
                  </li>
                );
              })}
              {nachladen && <li ref={(el) => { ende.current = el; }} className="nachladen leise klein">{nachladen}</li>}
            </ul>}
    </>
  );
}

/** Kompakter Eintrag: mit Trefferliste Spalte 1 fett, 2 und 3 darunter; sonst Titel und zwei Nebenfelder. */
function kompakt(sichtTyp: Mappentyp | undefined, typ: Mappentyp | undefined, m: Mappe, bezuege: Bezuege, person: (id: string | null) => string) {
  const liste = sichtTyp?.trefferliste ?? [];
  if (sichtTyp && liste.length) {
    const [a, ...rest] = liste.slice(0, 3).map((k) => zelle(k, m, typ, bezuege, person));
    return { titel: a || titelOder(m.titel), unter: rest.filter(Boolean).join(' · ') };
  }
  return { titel: titelOder(m.titel), unter: sichtTyp ? (typ ? unterzeile(typ, m, bezuege) : '') : typ?.name ?? '' };
}

function Tabelle(p: {
  sicht: string; typ?: Mappentyp; spalten: string[]; mappen: Mappe[]; bezuege: Bezuege; offen?: string;
  sortierung: Sortierung | null; sortiere(spalte: string): void; ende?: (el: HTMLElement | null) => void; nachladen: ReactNode;
}) {
  const d = useDaten();
  const aktiv = p.sortierung ?? { spalte: '_titel', absteigend: false };
  const rechts = (k: string) => { const f = p.typ?.felder.find((x) => x.key === k); return f?.typ === 'zahl' || f?.typ === 'betrag'; };
  // Datum, Ja/Nein und Zeitstempel nicht umbrechen; Texte dürfen umbrechen, damit die Tabelle in die Liste passt.
  const kurz = (k: string) => { const f = p.typ?.felder.find((x) => x.key === k); return k === '_erstellt' || k === '_geaendert' || f?.typ === 'datum' || f?.typ === 'janein'; };
  return (
    <div className="trefferliste">
      <table>
        <thead>
          <tr>
            {p.spalten.map((k) => {
              const kann = sortierbar(k, p.typ);
              const an = aktiv.spalte === k;
              return (
                <th key={k} className={rechts(k) ? 'rechts' : ''} aria-sort={an ? (aktiv.absteigend ? 'descending' : 'ascending') : undefined}>
                  {kann
                    ? <button type="button" className="spaltenknopf" onClick={() => p.sortiere(k)} title={`Nach ${spaltenName(k, p.typ)} sortieren`}>
                        {spaltenName(k, p.typ)}<span className="pfeil" aria-hidden="true">{an ? (aktiv.absteigend ? '↓' : '↑') : '↕'}</span>
                      </button>
                    : spaltenName(k, p.typ)}
                </th>
              );
            })}
            {p.sicht === 'eingang' && <th>Problem</th>}
          </tr>
        </thead>
        <tbody>
          {p.mappen.map((m) => {
            const typ = d.typ(m.typId);
            const ziel = `/ablage/${p.sicht}/${m.id}`;
            return (
              <tr key={m.id} className={`${p.offen === m.id ? 'an' : ''} ${m.passt === false ? 'unpassend' : ''}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) geheZu(ziel); }}>
                {p.spalten.map((k, i) => {
                  const text = zelle(k, m, typ, p.bezuege, d.person);
                  return <td key={k} className={rechts(k) ? 'rechts' : kurz(k) ? 'kurz' : ''}>{i === 0 ? <Link to={ziel}>{text || titelOder(m.titel)}</Link> : text}</td>;
                })}
                {p.sicht === 'eingang' && <td className="problemzelle">{m.problem}</td>}
              </tr>
            );
          })}
          {p.nachladen && <tr ref={p.ende} className="nachladen"><td colSpan={p.spalten.length + (p.sicht === 'eingang' ? 1 : 0)} className="leise klein">{p.nachladen}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** Spalten einer Sicht: Trefferliste des Typs; gemischte Sichten nur systemeigene Spalten. */
export function spaltenFuer(typ?: Mappentyp): string[] {
  return typ ? typ.trefferliste ?? [] : GEMISCHTE_SPALTEN;
}
export function spaltenName(k: string, typ?: Mappentyp): string {
  return istSystemspalte(k) ? SYSTEMSPALTEN[k] : typ?.felder.find((f) => f.key === k)?.label ?? k;
}
const datumZeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
/** Inhalt einer Zelle, formatiert wie in der Mappe. */
export function zelle(k: string, m: Mappe, typ: Mappentyp | undefined, bezuege: Bezuege, person: (id: string | null) => string): string {
  switch (k) {
    case '_titel': return titelOder(m.titel);
    case '_typ': return typ?.name ?? '';
    case '_erstellt': return datumZeit(m.erstellt);
    case '_geaendert': return datumZeit(m.geaendert);
    case '_erstelltVon': return person(m.erstelltVon);
    case '_geaendertVon': return person(m.geaendertVon);
  }
  const f = typ?.felder.find((x) => x.key === k);
  return f ? formatiere(f, m.werte[k], (id) => titelOder(bezuege[id]?.titel)) : '';
}

const Unter = ({ text }: { text: string }) => (text ? <span className="unter">{text}</span> : null);

/**
 * Verwaltete Sichten als Baum (#38). Untersichten lassen sich zuklappen; gemerkt je Gerät
 * und Benutzer. Die Vorfahren der geöffneten Sicht bleiben immer offen.
 */
function SichtBaum({ aktiv }: { aktiv?: string }) {
  const d = useDaten();
  const { ich } = useKonto();
  const schluessel = `dms:sichten-zu:${ich.id}`;
  const [zu, setZu] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(schluessel) ?? '[]') as string[]); } catch { return new Set(); }
  });
  const umschalten = (id: string) => {
    const n = new Set(zu);
    if (n.has(id)) n.delete(id); else n.add(id);
    setZu(n);
    try { localStorage.setItem(schluessel, JSON.stringify([...n])); } catch { /* nur für diese Sitzung */ }
  };
  const vorfahren = new Set<string>();
  for (let s = d.sicht(aktiv); s?.elternId && !vorfahren.has(s.elternId); s = d.sicht(s.elternId)) vorfahren.add(s.elternId);

  const zeilen: Array<{ s: Sicht; tiefe: number; kinder: boolean; offen: boolean }> = [];
  const gehe = (eltern: string | null, tiefe: number) => {
    for (const s of kinderVon(d.sichten, eltern)) {
      const kinder = kinderVon(d.sichten, s.id).length > 0;
      const offen = kinder && (!zu.has(s.id) || vorfahren.has(s.id));
      zeilen.push({ s, tiefe, kinder, offen });
      if (offen) gehe(s.id, tiefe + 1);
    }
  };
  gehe(null, 0);

  return (
    <>
      {zeilen.map(({ s, tiefe, kinder, offen }) => {
        const n = d.zaehler.sichten?.[s.id];
        const unter = kinder ? mitNachkommen(d.sichten, s.id).length - 1 : 0;
        return (
          <div key={s.id} className="sichtzeile" style={{ '--tiefe': tiefe } as React.CSSProperties}>
            {kinder
              ? <button type="button" className="aufklapper" aria-expanded={offen} title={offen ? 'Untersichten zuklappen' : `${unter} Untersicht${unter === 1 ? '' : 'en'} aufklappen`}
                  onClick={() => umschalten(s.id)}><span aria-hidden="true">{offen ? '▾' : '▸'}</span><span className="sr">{s.name} {offen ? 'zuklappen' : 'aufklappen'}</span></button>
              : null}
            <Link to={`/ablage/${s.id}`} className={`sicht ${aktiv === s.id ? 'an' : ''}`} title={s.beschreibung || undefined}>
              <span className="nm">{s.name}</span>{n !== undefined && <span className="zahl">{zahl(n)}</span>}
            </Link>
          </div>
        );
      })}
    </>
  );
}
