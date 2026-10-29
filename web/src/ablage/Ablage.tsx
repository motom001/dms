import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { beschreibeBedingung, kinderVon, mitNachkommen, spaltenDerSicht, wirksameTypen, type Sicht } from '../../../shared/src/sichten';
import { liesDirektlink, type Direktlink } from '../../../shared/src/direktlink';
import { darfErstellen, formatiere, GEMISCHTE_SPALTEN, sortierbar, standardliste, TREFFER_ANFANG, TREFFER_ENDE, vorlageFelder, wirksameVorlage, type Ausschnitt, type Mappe, type Mappentyp, type Sortierung } from '../../../shared/src/model';
import { api, type Bezuege, type MappeDetails } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link } from '../ort';
import { Dreiteilung } from '../bereiche';
import { titelOder, useSeiten } from '../seiten';
import { MappeAnsicht, NeueMappe } from './MappeFormular';
import { PapierkorbDetail, PapierkorbListe, usePapierkorb } from './Papierkorb';
import { Stern } from './Stern';
import { spaltenName, zelle } from './spalten';

/**
 * Ablage in drei Spalten, von groß nach klein:
 *   Sichten  →  Mappen der Sicht  →  eine Mappe
 *
 * /ablage/:sicht                    „eingang“, „favoriten“ (#62), „papierkorb“ (#43), eine verwaltete Sicht (#38) oder die Id eines Mappentyps
 * /ablage/:sicht/:mappeId           Mappe rechts geöffnet
 * /ablage/:typId/neu?verweis=k:id   neue Mappe, optional mit vorbelegtem Verweis
 * /ablage/link?typ=…&feld=…         sprechender Link (#98); geöffnet: /ablage/link/:mappeId?typ=…
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
  // Spalten (#75): Trefferliste der Sicht, sonst Standard; bei mehreren Typen nur Gemeinsames.
  const sichtTypen = verwaltet ? wirksameTypen(d.sichten, verwaltet.id).map((t) => d.typ(t)).filter((t): t is Mappentyp => !!t) : typ ? [typ] : [];
  const wahl = verwaltet ? spaltenDerSicht(sichtTypen, verwaltet.trefferliste) : typ ? { key: 'standard', spalten: standardliste(typ).spalten } : { key: null, spalten: GEMISCHTE_SPALTEN };
  const papierkorb = usePapierkorb(false, sicht === 'papierkorb');
  // Sprechender Link (#98): die Adresse ist der Link; beim Öffnen einer Mappe bleibt sie erhalten.
  const istLink = sicht === 'link';
  const anhang = istLink ? `?${suche.toString()}` : '';
  const link = istLink ? liesDirektlink(suche, d.typen) : null;

  let rechts;
  if (dritt === 'neu' && !typ) {
    rechts = <div className="leer"><p>Diese Sicht zeigt mehrere Mappentypen. Lege neue Mappen in der Sicht eines einzelnen Typs an.</p></div>;
  } else if (dritt === 'neu' && typ && !darfErstellen(typ)) {
    rechts = <div className="leer"><p>Von „{typ.name}“ lassen sich in der Ablage keine neuen Mappen anlegen.{typ.system === 'benutzer' ? ' Benutzer legt ein Administrator in der Werkbank unter „Benutzer“ an.' : ''}</p></div>;
  } else if (dritt === 'neu' && typ) {
    rechts = <NeueMappe key={`${typ.id}-${suche.get('verweis') ?? ''}`} typ={typ} sicht={sicht} verweis={suche.get('verweis') ?? undefined} />;
  } else if (dritt && sicht === 'papierkorb') {
    rechts = <PapierkorbDetail key={dritt} id={dritt} werkbank={false} />;
  } else if (dritt) {
    rechts = <MappeLader key={dritt} id={dritt} sicht={sicht} anhang={anhang} />;
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
          <Link to="/ablage/favoriten" className={`sicht ${sicht === 'favoriten' ? 'an' : ''}`}>
            <span className="nm"><span aria-hidden="true" className="sternzeichen">★</span> Favoriten</span>{!!d.zaehler.favoriten && <span className="zahl">{zahl(d.zaehler.favoriten)}</span>}
          </Link>
          {/* Papierkorb (#43): sichtbar, solange er an ist oder noch etwas darin liegt. */}
          {(!!d.zaehler.papierkorbTage || !!d.zaehler.papierkorb) && (
            <Link to="/ablage/papierkorb" className={`sicht ${sicht === 'papierkorb' ? 'an' : ''}`}>
              <span className="nm">Papierkorb</span>{!!d.zaehler.papierkorb && <span className="zahl">{zahl(d.zaehler.papierkorb)}</span>}
            </Link>
          )}
          {d.sichten.length > 0 && <hr />}
          <SichtBaum aktiv={sicht} />
        </nav>
        {!d.typen.length && <p className="leise klein">Noch keine Mappentypen. {ich.rolle === 'admin' ? <Link to="/werkbank/typen" className="verweis">Zur Werkbank</Link> : 'Ein Administrator muss sie zuerst einrichten.'}</p>}
        {d.typen.length > 0 && !d.sichten.length && <p className="leise klein">Noch keine Sichten. {ich.rolle === 'admin' ? <Link to="/werkbank/sichten" className="verweis">Sichten einrichten</Link> : 'Ein Administrator muss sie zuerst einrichten.'}</p>}
      </aside>

      <section className="spalte liste" aria-label="Mappen">
        {link
          ? link.ok
            ? <LinkListe key={`${link.link.typ.id}:${JSON.stringify(link.link.bedingungen)}`} link={link.link} suche={suche} offen={dritt} />
            : <>
                <div className="listenkopf"><div><h1>Link</h1></div></div>
                <div className="hinweis schlecht stapel" role="alert">
                  <p>Dieser Link lässt sich nicht auflösen:</p>
                  <ul>{link.fehler.map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
              </>
          : sicht === 'papierkorb'
          ? <PapierkorbListe z={papierkorb} werkbank={false} offen={dritt} />
          : sicht === 'eingang'
          ? <Liste key="eingang" sicht="eingang" titel="Eingang" offen={dritt}
              beschreibung="Mappen, an denen du etwas tun sollst: Sie passen nicht mehr zur Definition, jemand hat dich erwähnt oder dir eine Aufgabe gegeben."
              leerText="Nichts zu tun." />
          : sicht === 'favoriten'
          ? <Liste key="favoriten" sicht="favoriten" titel="Favoriten" offen={dritt}
              beschreibung="Mappen, die du mit einem Stern markiert hast."
              leerText="Noch keine Favoriten. Markiere eine Mappe mit dem Stern ☆, um sie hier zu finden." />
          : verwaltet || typ ? <Liste key={sicht} sicht={sicht!} typ={typ} spaltenTyp={typ ?? sichtTypen[0]} spalten={wahl.spalten} listenSpalten={wahl.key ? wahl.spalten : []} titel={verwaltet?.name ?? typ!.name} beschreibung={verwaltet ? verwaltet.beschreibung : typ?.beschreibung}
              offen={dritt} neu={!!typ && darfErstellen(typ)} leerText="Noch keine Mappen in dieser Sicht." />
          : sicht ? <div className="leer"><p>Diese Sicht gibt es nicht (mehr).</p></div> : null}
      </section>

      <section className="spalte mappe" aria-label="Mappe">
        <Link to={`/ablage/${sicht ?? 'eingang'}${anhang}`} className="verweis nur-schmal">← Zur Liste</Link>
        {rechts}
      </section>
    </Dreiteilung>
  );
}

/** Lädt eine Mappe mit Rückverweisen, Dokumenten und Bezügen und zeigt sie an. */
function MappeLader({ id, sicht, anhang = '' }: { id: string; sicht: string; anhang?: string }) {
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
  return <MappeAnsicht key={details.mappe.id} typ={t} details={details} sicht={sicht} anhang={anhang} neuLaden={laden} />;
}

/** Nebenzeile eines Listeneintrags: zwei Felder, die nicht schon im Titel stehen. */
function unterzeile(typ: Mappentyp, m: Mappe, bezuege: Bezuege) {
  const imTitel = new Set(vorlageFelder(wirksameVorlage(typ)));
  const neben = typ.felder.filter((f) => !imTitel.has(f.key) && f.typ !== 'langtext' && f.typ !== 'formatiert' && f.typ !== 'passwort').slice(0, 2);
  return neben.map((f) => formatiere(f, m.werte[f.key], (id) => titelOder(bezuege[id]?.titel))).filter(Boolean).join(' · ');
}

/**
 * Trefferliste eines sprechenden Links (#98): vorübergehende Sicht, nicht im Baum.
 * Die erste Mappe öffnet sich von selbst; die Sortierung steht in der Adresse.
 */
function LinkListe({ link, suche, offen }: { link: Direktlink; suche: URLSearchParams; offen?: string }) {
  const sortierung = link.sortierung;
  const setze = (n: Sortierung | null) => {
    const q = new URLSearchParams(suche);
    if (!n || (n.spalte === '_titel' && !n.absteigend)) q.delete('sortierung');
    else q.set('sortierung', `${n.absteigend ? '-' : ''}${n.spalte}`);
    geheZu(`/ablage/link${offen ? `/${offen}` : ''}?${q.toString()}`, true);
  };
  const bedingungen = link.bedingungen.map((b) => beschreibeBedingung(b, [link.typ]));
  return (
    <Liste sicht="link" link={suche.toString()} anhang={`?${suche.toString()}`} typ={link.typ} spaltenTyp={link.typ}
      spalten={standardliste(link.typ).spalten} listenSpalten={standardliste(link.typ).spalten}
      titel={`Link: ${link.typ.name}`} beschreibung={bedingungen.length ? bedingungen.join(' · ') : 'Alle Mappen dieses Typs'}
      offen={offen} zuerstOeffnen sortierungFest={{ wert: sortierung, setze }} leerText="Keine Mappe passt zu diesem Link." />
  );
}

function Liste(p: {
  sicht: string; typ?: Mappentyp; spaltenTyp?: Mappentyp; spalten?: string[]; listenSpalten?: string[]; titel: string; beschreibung?: string; offen?: string; neu?: boolean; leerText: string;
  /** Sprechender Link (#98): seine Parameter, der Zusatz für Adressen, Sortierung aus der Adresse, erste Mappe öffnen. */
  link?: string; anhang?: string; sortierungFest?: { wert: Sortierung | null; setze(n: Sortierung | null): void }; zuerstOeffnen?: boolean;
}) {
  const d = useDaten();
  const anhang = p.anhang ?? '';
  const [eingabe, setEingabe] = useState('');
  const [suche, setSuche] = useState('');
  // Suche erst nach einer kurzen Tipppause an den Server schicken.
  useEffect(() => { const t = setTimeout(() => setSuche(eingabe.trim()), 250); return () => clearTimeout(t); }, [eingabe]);

  // Sortierung je Benutzer und Mappentyp (bzw. Eingang), auf dem Server gespeichert.
  const sortSchluessel = `sortierung:${p.sicht}`;
  const sortierung = p.sortierungFest ? p.sortierungFest.wert : (d.einstellungen[sortSchluessel] as Sortierung | undefined) ?? null;
  const setzeSortierung = (n: Sortierung | null) => (p.sortierungFest ? p.sortierungFest.setze(n) : d.setzeEinstellung(sortSchluessel, n));
  const sortiere = (spalte: string) => {
    const n: Sortierung | null = sortierung?.spalte === spalte ? { spalte, absteigend: !sortierung.absteigend } : { spalte, absteigend: false };
    setzeSortierung(n.spalte === '_titel' && !n.absteigend ? null : n);
  };
  // Volltextsuche (#45): je Benutzer gemerkt.
  const volltext = d.einstellungen.suche_volltext === true;
  const inNotizen = d.einstellungen.suche_notizen === true;
  const s = useSeiten(p.sicht, suche, d.stand, sortierung, volltext, inNotizen, p.link);

  // Link (#98): die erste Mappe öffnen – einmal, nicht nach „Zur Liste“.
  const geoeffnet = useRef(false);
  useEffect(() => {
    if (p.offen) { geoeffnet.current = true; return; }
    if (p.zuerstOeffnen && !geoeffnet.current && s.mappen.length) {
      geoeffnet.current = true;
      geheZu(`/ablage/${p.sicht}/${s.mappen[0].id}${anhang}`, true);
    }
  }, [p.offen, p.zuerstOeffnen, s.mappen]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Feste Sichten (Eingang, Favoriten): Systemspalten.
  const spalten = p.spalten ?? GEMISCHTE_SPALTEN;
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

  const gesamtSicht = p.sicht === 'eingang' ? d.zaehler.eingang : p.sicht === 'favoriten' ? d.zaehler.favoriten ?? 0 : d.zaehler.sichten?.[p.sicht] ?? (p.typ ? d.anzahl(p.typ.id) : 0);
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
        <div className="suchzeile">
          <label className="suche"><span className="sr">Suchen</span>
            <input type="search" placeholder={volltext ? 'Suchen in Titel, Werten und Dokumenten …' : 'Suchen in Titel und Werten …'} value={eingabe} onChange={(e) => setEingabe(e.target.value)} />
          </label>
          <label className="haken klein" title="Auch im Text der Dokumente suchen (Textebene und Texterkennung). Findet auch Wortformen, z. B. „Rechnungen“ bei „Rechnung“.">
            <input type="checkbox" checked={volltext} onChange={(e) => d.setzeEinstellung('suche_volltext', e.target.checked || null)} /><span>Volltext durchsuchen</span>
          </label>
          <label className="haken klein" title="Auch in den Notizen der Mappen suchen.">
            <input type="checkbox" checked={inNotizen} onChange={(e) => d.setzeEinstellung('suche_notizen', e.target.checked || null)} /><span>Notizen</span>
          </label>
        </div>
      )}
      {anzahlText && (
        <p className="listenzahl leise klein" aria-live="polite">
          {anzahlText}{s.mappen.length < (s.gesamt ?? 0) ? `, ${zahl(s.mappen.length)} geladen` : ''}
          {sortierung && <> · sortiert nach {spaltenName(sortierung.spalte, p.typ)} {sortierung.absteigend ? '↓' : '↑'} <button type="button" className="textknopf" onClick={() => setzeSortierung(null)}>nach Titel</button></>}
        </p>
      )}
      {s.fehler && <div className="hinweis schlecht"><p>{s.fehler}</p></div>}
      <div className="listenrumpf">
      {s.gesamt === 0
        ? <p className="leise leerliste">{suche ? 'Nichts gefunden.' : p.leerText}</p>
        : tabelle
          ? <Tabelle sicht={p.sicht} anhang={anhang} typ={p.typ} spaltenTyp={p.spaltenTyp} spalten={spalten} mappen={s.mappen} bezuege={s.bezuege} ausschnitte={s.ausschnitte} aufgaben={s.aufgaben} favoriten={s.favoriten} offen={p.offen}
              sortierung={sortierung} sortiere={sortiere} ende={nachladen ? (el) => { ende.current = el; } : undefined} nachladen={nachladen} />
          : <ul className="mappenliste">
              {s.mappen.map((m) => {
                const typ = d.typ(m.typId);
                const k = kompakt(p.listenSpalten ?? [], !!p.typ, typ, m, s.bezuege, d.person);
                return (
                  <li key={m.id} className="mit-stern">
                    <Stern mappeId={m.id} an={s.favoriten.has(m.id)} titel={k.titel} klein />
                    <Link to={`/ablage/${p.sicht}/${m.id}${anhang}`} className={`eintrag ${p.offen === m.id ? 'an' : ''}`}>
                      <span className="titel">{k.titel}</span>
                      <Unter text={k.unter} />
                      {s.ausschnitte[m.id] && <Fundstelle a={s.ausschnitte[m.id]} />}
                      {p.sicht === 'eingang' && s.aufgaben[m.id]
                        ? <span className="problem">{s.aufgaben[m.id]}</span>
                        : m.passt === false && <span className="problem">{p.typ ? 'passt nicht zur Definition' : m.problem}</span>}
                    </Link>
                  </li>
                );
              })}
              {nachladen && <li ref={(el) => { ende.current = el; }} className="nachladen leise klein">{nachladen}</li>}
            </ul>}
      </div>
    </>
  );
}

/** Kompakter Eintrag: mit Trefferliste Spalte 1 fett, 2 und 3 darunter; sonst Titel und zwei Nebenfelder (bzw. der Typ). */
function kompakt(liste: string[], einTyp: boolean, typ: Mappentyp | undefined, m: Mappe, bezuege: Bezuege, person: (id: string | null) => string) {
  if (liste.length) {
    const [a, ...rest] = liste.slice(0, 3).map((k) => zelle(k, m, typ, bezuege, person));
    return { titel: a || titelOder(m.titel), unter: rest.filter(Boolean).join(' · ') };
  }
  return { titel: titelOder(m.titel), unter: einTyp ? (typ ? unterzeile(typ, m, bezuege) : '') : typ?.name ?? '' };
}

function Tabelle(p: {
  sicht: string; anhang?: string; typ?: Mappentyp; spaltenTyp?: Mappentyp; spalten: string[]; mappen: Mappe[]; bezuege: Bezuege; ausschnitte?: Record<string, Ausschnitt>; aufgaben?: Record<string, string>; favoriten: Set<string>; offen?: string;
  sortierung: Sortierung | null; sortiere(spalte: string): void; ende?: (el: HTMLElement | null) => void; nachladen: ReactNode;
}) {
  const d = useDaten();
  const aktiv = p.sortierung ?? { spalte: '_titel', absteigend: false };
  const rechts = (k: string) => { const f = p.spaltenTyp?.felder.find((x) => x.key === k); return f?.typ === 'zahl' || f?.typ === 'betrag'; };
  // Datum, Ja/Nein und Zeitstempel nicht umbrechen; Texte dürfen umbrechen, damit die Tabelle in die Liste passt.
  const kurz = (k: string) => { const f = p.spaltenTyp?.felder.find((x) => x.key === k); return k === '_erstellt' || k === '_geaendert' || f?.typ === 'datum' || f?.typ === 'janein'; };
  return (
    <div className="trefferliste">
      <table>
        <thead>
          <tr>
            <th className="sternspalte"><span className="sr">Favorit</span></th>
            {p.spalten.map((k) => {
              const kann = sortierbar(k, p.typ);
              const an = aktiv.spalte === k;
              return (
                <th key={k} className={rechts(k) ? 'rechts' : ''} aria-sort={an ? (aktiv.absteigend ? 'descending' : 'ascending') : undefined}>
                  {kann
                    ? <button type="button" className="spaltenknopf" onClick={() => p.sortiere(k)} title={`Nach ${spaltenName(k, p.spaltenTyp)} sortieren`}>
                        {spaltenName(k, p.spaltenTyp)}<span className="pfeil" aria-hidden="true">{an ? (aktiv.absteigend ? '↓' : '↑') : '↕'}</span>
                      </button>
                    : spaltenName(k, p.spaltenTyp)}
                </th>
              );
            })}
            {p.sicht === 'eingang' && <th>Aufgabe</th>}
          </tr>
        </thead>
        <tbody>
          {p.mappen.map((m) => {
            const typ = d.typ(m.typId);
            const ziel = `/ablage/${p.sicht}/${m.id}${p.anhang ?? ''}`;
            return (
              <tr key={m.id} className={`${p.offen === m.id ? 'an' : ''} ${m.passt === false ? 'unpassend' : ''}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) geheZu(ziel); }}>
                <td className="sternspalte"><Stern mappeId={m.id} an={p.favoriten.has(m.id)} titel={titelOder(m.titel)} klein /></td>
                {p.spalten.map((k, i) => {
                  const text = zelle(k, m, typ, p.bezuege, d.person);
                  return <td key={k} className={rechts(k) ? 'rechts' : kurz(k) ? 'kurz' : ''}>{i === 0 ? <><Link to={ziel}>{text || titelOder(m.titel)}</Link>{p.ausschnitte?.[m.id] && <Fundstelle a={p.ausschnitte[m.id]} />}</> : text}</td>;
                })}
                {p.sicht === 'eingang' && <td className="problemzelle">{p.aufgaben?.[m.id] ?? m.problem}</td>}
              </tr>
            );
          })}
          {p.nachladen && <tr ref={p.ende} className="nachladen"><td colSpan={p.spalten.length + 1 + (p.sicht === 'eingang' ? 1 : 0)} className="leise klein">{p.nachladen}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const Unter = ({ text }: { text: string }) => (text ? <span className="unter">{text}</span> : null);

/** Fundstelle im Volltext (#45): Dokumentname und Ausschnitt, Treffer hervorgehoben (ohne HTML vom Server). */
function Fundstelle({ a }: { a: Ausschnitt }) {
  const teile = a.text.split(TREFFER_ANFANG).flatMap((t, i) => {
    if (i === 0) return [<span key={`t${i}`}>{t}</span>];
    const [treffer, rest = ''] = t.split(TREFFER_ENDE);
    return [<mark key={`m${i}`}>{treffer}</mark>, <span key={`r${i}`}>{rest}</span>];
  });
  return <span className="fundstelle"><span className="dok" title="Fundstelle im Dokument">{a.dokument}:</span> {teile}</span>;
}

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
