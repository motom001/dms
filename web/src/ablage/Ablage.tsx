import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { beschreibeBedingung, heuteIn, kinderVon, mitNachkommen, spaltenDerSicht, wirksameTypen, type Sicht } from '../../../shared/src/sichten';
import { ANSTEHEND_TAGE, datumDe, type Anstehend } from '../../../shared/src/fristen';
import { liesDirektlink, type Direktlink } from '../../../shared/src/direktlink';
import { darfErstellen, darfPostAnlegen, formatiere, GEMISCHTE_SPALTEN, sortierbar, standardliste, TREFFER_ANFANG, TREFFER_ENDE, vorlageFelder, wirksameVorlage, type Ausschnitt, type Mappe, type Mappentyp, type Sortierung } from '../../../shared/src/model';
import { api, verborgeneAufgaben, type Bezuege, type MappeDetails } from '../api';
import type { Aufgabe } from '../../../shared/src/model';
import { AufgabenHinweis } from './Aufgaben';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link } from '../ort';
import { Dreiteilung } from '../bereiche';
import { titelOder, useSeiten } from '../seiten';
import { MappeAnsicht, NeueMappe } from './MappeFormular';
import { PapierkorbDetail, PapierkorbListe, usePapierkorb } from './Papierkorb';
import { Stern } from './Stern';
import { spaltenName, zelle } from './spalten';
import { Hilfe } from '../Hilfe';
import { ExportDialog } from './Export';
import { PostKnopf } from './Post';
import type { Hilfeort } from '../../../shared/src/hilfe';

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
  const anstehend = useAnstehend();
  // Sprechender Link (#98): die Adresse ist der Link; beim Öffnen einer Mappe bleibt sie erhalten.
  const istLink = sicht === 'link';
  const anhang = istLink ? `?${suche.toString()}` : '';
  const link = istLink ? liesDirektlink(suche, d.typen) : null;

  let rechts;
  if (dritt === 'neu' && !typ) {
    rechts = <div className="leer"><p>Diese Sicht zeigt mehrere Mappentypen. Lege neue Mappen in der Sicht eines einzelnen Typs an.</p></div>;
  } else if (dritt === 'neu' && typ && verwaltet?.rechte?.C === false) {
    rechts = <div className="leer"><p>In der Sicht „{verwaltet.name}“ lassen sich keine neuen Mappen anlegen.</p></div>;
  } else if (dritt === 'neu' && typ && !darfErstellen(typ)) {
    rechts = <div className="leer"><p>Von „{typ.name}“ lassen sich in der Ablage keine neuen Mappen anlegen.{typ.system === 'benutzer' ? ' Benutzer legt ein Administrator in der Werkbank unter „Benutzer“ an.' : ''}</p></div>;
  } else if (dritt === 'neu' && typ) {
    rechts = <NeueMappe key={`${typ.id}-${suche.get('verweis') ?? ''}-${suche.get('zuordnen') ?? ''}-${suche.get('vorbelegen') ?? ''}`} typ={typ} sicht={sicht} verweis={suche.get('verweis') ?? undefined} zuordnen={zuordnenAus(suche)} vorbelegen={suche.get('vorbelegen') ?? undefined} />;
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
          <Link to="/ablage/anstehend" className={`sicht ${sicht === 'anstehend' ? 'an' : ''}`} title="Fristen und Erinnerungen der nächsten Tage">
            <span className="nm">Anstehend</span>{!!anstehend.liste?.eintraege.length && <span className="zahl">{zahl(anstehend.liste.eintraege.length)}</span>}
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
          ? <Liste key="eingang" sicht="eingang" titel="Eingang" offen={dritt} hilfe="ablage.eingang"
              beschreibung="Mappen, an denen du etwas tun sollst: Sie passen nicht mehr zur Definition, jemand hat dich erwähnt oder dir eine Aufgabe gegeben."
              leerText="Nichts zu tun." />
          : sicht === 'anstehend'
          ? <AnstehendListe z={anstehend} offen={dritt} />
          : sicht === 'favoriten'
          ? <Liste key="favoriten" sicht="favoriten" titel="Favoriten" offen={dritt} hilfe="ablage.favoriten"
              beschreibung="Mappen, die du mit einem Stern markiert hast."
              leerText="Noch keine Favoriten. Markiere eine Mappe mit dem Stern ☆, um sie hier zu finden." />
          : verwaltet || typ ? <Liste key={sicht} sicht={sicht!} typ={typ} spaltenTyp={typ ?? sichtTypen[0]} spalten={wahl.spalten} listenSpalten={wahl.key ? wahl.spalten : []} titel={verwaltet?.name ?? typ!.name} beschreibung={verwaltet ? verwaltet.beschreibung : typ?.beschreibung}
              offen={dritt} neu={!!typ && darfErstellen(typ) && verwaltet?.rechte?.C !== false} post={!!typ && darfPostAnlegen(typ) && verwaltet?.rechte?.C !== false}
              leerText={typ?.system === 'post' ? 'Keine Post. Mit „+ Post“ legst du Dateien als neue Post ab.' : 'Noch keine Mappen in dieser Sicht.'} hilfe={typ?.system === 'post' ? 'ablage.post' : 'ablage.sicht'} auswahl export={verwaltet?.rechte?.E !== false} />
          : sicht ? <div className="leer"><p>Diese Sicht gibt es nicht (mehr).</p></div> : null}
      </section>

      <section className="spalte mappe" aria-label="Mappe">
        <Link to={`/ablage/${sicht ?? 'eingang'}${anhang}`} className="verweis nur-schmal">← Zur Liste</Link>
        {rechts}
      </section>
    </Dreiteilung>
  );
}

/** Zuordnen über eine neue Mappe (#192): ?zuordnen=<Post>&register=…&dokumente=a,b&kopieren=1&vorschlag={…} */
function zuordnenAus(q: URLSearchParams) {
  const post = q.get('zuordnen');
  if (!post) return undefined;
  let vorschlag: Record<string, string> = {};
  try { const v = JSON.parse(q.get('vorschlag') ?? '{}'); if (v && typeof v === 'object') vorschlag = v; } catch { /* ohne Vorschlag */ }
  return { post, register: q.get('register') ?? undefined, dokumente: (q.get('dokumente') ?? '').split(',').filter(Boolean), kopieren: q.get('kopieren') === '1', vorschlag };
}

/** Sicht „Anstehend“ (#132): eigene Fristen und Erinnerungen der nächsten Tage (Zeitraum im Profil). */
function useAnstehend() {
  const d = useDaten();
  const tage = Number(d.einstellungen.anstehend_tage ?? ANSTEHEND_TAGE);
  const [liste, setListe] = useState<{ tage: number; eintraege: Anstehend[] }>();
  const [fehler, setFehler] = useState<string>();
  useEffect(() => {
    let aktuell = true;
    api.anstehend(tage).then((x) => { if (aktuell) { setListe(x); setFehler(undefined); } }).catch((x) => aktuell && setFehler((x as Error).message));
    return () => { aktuell = false; };
  }, [tage, d.stand]);
  return { liste, fehler };
}

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });
const tagText = (iso: string) => `${WOCHENTAG.format(new Date(`${iso}T00:00:00Z`))} ${datumDe(iso)}`;

function AnstehendListe({ z, offen }: { z: ReturnType<typeof useAnstehend>; offen?: string }) {
  const l = z.liste;
  return (
    <>
      <div className="listenkopf">
        <div><h1>Anstehend</h1>
          <p className="leise klein">Deine Fristen und Erinnerungen der nächsten {l?.tage ?? ANSTEHEND_TAGE} Tage – auch die, die noch nicht im Eingang stehen. Den Zeitraum stellst du im <Link to="/profil/benachrichtigungen" className="verweis">Profil</Link> ein. <Hilfe ort="ablage.anstehend" /></p></div>
      </div>
      {z.fehler && <p className="fehlertext">{z.fehler}</p>}
      {!l ? <p className="leise leerliste">Lade …</p> : !l.eintraege.length ? <p className="leise leerliste">Nichts in Sicht.</p> : (
        <ul className="mappenliste">
          {l.eintraege.map((x, i) => (
            <li key={`${x.mappeId}-${x.feldKey ?? x.erinnerungId ?? i}-${x.datum}`}>
              <Link to={`/ablage/anstehend/${x.mappeId}`} className={`eintrag ${offen === x.mappeId ? 'an' : ''}`}>
                <span className="titel">{tagText(x.datum)} · {titelOder(x.mappeTitel)}</span>
                <span className="unter">{x.art === 'frist' ? 'Frist' : 'Erinnerung'}: {x.text}</span>
                {x.faellig ? <span className="problem">steht im Eingang</span> : x.art === 'frist' && x.ab > heuteIn() ? <span className="unter leise">im Eingang ab {datumDe(x.ab)}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Lädt eine Mappe mit Rückverweisen, Dokumenten und Bezügen und zeigt sie an. */
function MappeLader({ id, sicht, anhang = '' }: { id: string; sicht: string; anhang?: string }) {
  const d = useDaten();
  const [details, setDetails] = useState<MappeDetails | null | 'fehlt' | { verborgen: Aufgabe[] }>(null);
  const laden = useCallback(async () => {
    try { setDetails(await api.mappe(id)); } catch (x) { const v = verborgeneAufgaben(x); setDetails(v ? { verborgen: v } : 'fehlt'); }
  }, [id]);
  useEffect(() => { void laden(); }, [laden, d.stand]);
  if (details === null) return <p className="leise">Lade …</p>;
  if (details === 'fehlt') return <div className="leer"><p>Diese Mappe gibt es nicht (mehr).</p></div>;
  // Ohne Leserecht (#124): nur die eigenen Aufgaben dazu – erledigen oder weitergeben.
  if ('verborgen' in details) return (
    <div className="einspaltig">
      <div className="mappenkopf"><p className="ueber">Mappe</p><h1 className="verborgen-titel">Nicht sichtbare Mappe</h1></div>
      <div className="hinweis info"><p>Diese Mappe darfst du nach den Berechtigungen nicht sehen. {details.verborgen.length ? 'Deine Aufgabe dazu kannst du trotzdem erledigen oder an jemanden weitergeben, der sie sehen darf.' : 'Du hast hier keine offene Aufgabe mehr.'}</p></div>
      <AufgabenHinweis aufgaben={details.verborgen} neuLaden={laden} />
    </div>
  );
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
  /** Post (#192): „+ Post“ statt „+ Neu“. */
  post?: boolean;
  /** Kontextbezogene Hilfe (#110). */
  hilfe?: Hilfeort;
  /** Sprechender Link (#98): seine Parameter, der Zusatz für Adressen, Sortierung aus der Adresse, erste Mappe öffnen. */
  link?: string; anhang?: string; sortierungFest?: { wert: Sortierung | null; setze(n: Sortierung | null): void }; zuerstOeffnen?: boolean;
  /** Mehrere Mappen auswählen (#149) – in Sichten, nicht im Eingang oder bei Favoriten. */
  auswahl?: boolean;
  /** Export erlaubt (#153: Recht E an der Sicht). */
  export?: boolean;
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
  // Suche immer, sobald es Mappen gibt (#160) – der Volltext lohnt auch bei wenigen.
  const zeigeSuche = gesamtSicht > 0 || !!eingabe;
  const anzahlText = s.gesamt === null ? '' : suche
    ? `${zahl(s.gesamt)} Treffer`
    : `${zahl(s.gesamt)} ${s.gesamt === 1 ? 'Mappe' : 'Mappen'}`;
  const nachladen = !s.alle && (s.laedt ? 'Lade …' : <button type="button" className="textknopf" onClick={s.mehr}>Weitere laden</button>);
  const w = useAuswahl(s.mappen, s.gesamt, [p.sicht, suche, volltext, inNotizen, p.link ?? '']);
  const wahl = p.auswahl ? w : undefined;
  const [ergebnis, setErgebnis] = useState<{ text: string; liste: Array<{ id: string; titel: string; grund: string }> }>();
  const [exportOffen, setExportOffen] = useState(false);
  async function alleWaehlen() {
    try { const r = await api.auswahl(p.sicht, suche, volltext, inNotizen, p.link); w.setze(r.ids, true); }
    catch (x) { setErgebnis({ text: (x as Error).message, liste: [] }); }
  }
  // Mehrere Mappen löschen (#150): erst zählen und fragen, dann löschen; was nicht ging, mit Grund.
  async function loeschen() {
    setErgebnis(undefined);
    try {
      const ids = [...w.gewaehlt];
      const probe = await api.mappenLoeschen(ids, true);
      if (!probe.mappen) { setErgebnis({ text: 'Keine der ausgewählten Mappen lässt sich löschen.', liste: probe.ausgelassen }); return; }
      const korb = (d.zaehler.papierkorbTage ?? 0) > 0;
      const frage = `${zahl(probe.mappen)} ${probe.mappen === 1 ? 'Mappe' : 'Mappen'}${probe.dokumente ? ` mit ${zahl(probe.dokumente)} ${probe.dokumente === 1 ? 'Dokument' : 'Dokumenten'}` : ''} ${korb ? 'in den Papierkorb legen' : 'endgültig löschen'}?`
        + (probe.ausgelassen.length ? `\n\n${zahl(probe.ausgelassen.length)} ${probe.ausgelassen.length === 1 ? 'Mappe wird' : 'Mappen werden'} ausgelassen (kein Recht oder noch verwiesen).` : '');
      if (!confirm(frage)) return;
      const r = await api.mappenLoeschen(ids, false);
      w.leeren();
      await d.neuLaden();
      setErgebnis({ text: `${zahl(r.geloescht)} ${r.geloescht === 1 ? 'Mappe' : 'Mappen'} ${korb ? 'in den Papierkorb gelegt' : 'gelöscht'}.${r.ausgelassen.length ? ` ${zahl(r.ausgelassen.length)} ausgelassen:` : ''}`, liste: r.ausgelassen });
      if (p.offen && ids.includes(p.offen) && !r.ausgelassen.some((x) => x.id === p.offen)) geheZu(`/ablage/${p.sicht}${anhang}`);
    } catch (x) { setErgebnis({ text: (x as Error).message, liste: [] }); }
  }

  return (
    <>
      <div ref={mess} className="breitenmesser" aria-hidden="true" />
      <div className="listenkopf">
        <div>
          <h1>{p.titel}</h1>
          {(p.beschreibung || p.hilfe) && <p className="leise klein">{p.beschreibung}{p.hilfe && <> <Hilfe ort={p.hilfe} /></>}</p>}
        </div>
        {p.neu && <Link to={`/ablage/${p.sicht}/neu`} className="knopf gruen klein">+ Neu</Link>}
        {p.post && p.typ && <div className="postknopf"><PostKnopf /></div>}
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
          {p.export && !wahl?.gewaehlt.size && !!s.gesamt && <> · <button type="button" className="textknopf" onClick={() => setExportOffen(true)}>Exportieren …</button></>}
        </p>
      )}
      {exportOffen && (
        <ExportDialog sicht={p.sicht} link={p.link} ids={wahl?.gewaehlt.size ? [...wahl.gewaehlt] : null} anzahl={wahl?.gewaehlt.size ?? 0} gesamt={s.gesamt ?? 0}
          suche={suche} volltext={volltext} notizen={inNotizen} sortierung={sortierung}
          fertig={(meldung) => { setExportOffen(false); if (meldung) setErgebnis({ text: meldung, liste: [] }); }} />
      )}
      {s.fehler && <div className="hinweis schlecht"><p>{s.fehler}</p></div>}
      {wahl && wahl.gewaehlt.size > 0 && (
        <div className="aktionsleiste" role="region" aria-label="Auswahl">
          <span className="klein"><strong>{zahl(wahl.gewaehlt.size)}</strong> von {zahl(s.gesamt ?? 0)} ausgewählt</span>
          {!wahl.alle && (s.gesamt ?? 0) > wahl.gewaehlt.size && <button type="button" className="textknopf klein" onClick={() => void alleWaehlen()}>Alle {zahl(s.gesamt ?? 0)} auswählen</button>}
          <span className="luecke" aria-hidden="true" />
          {p.export && <button type="button" className="knopf klein" onClick={() => setExportOffen(true)}>Exportieren …</button>}
          <button type="button" className="knopf klein gefahr" onClick={() => void loeschen()}>Löschen</button>
          <button type="button" className="textknopf klein" onClick={wahl.leeren}>Auswahl aufheben</button>
        </div>
      )}
      {ergebnis && (
        <div className={`hinweis ${ergebnis.liste.length ? 'warn' : 'info'}`} role="status">
          <p>{ergebnis.text}</p>
          {ergebnis.liste.length > 0 && <ul className="klein">{ergebnis.liste.slice(0, 50).map((x) => <li key={x.id}>{titelOder(x.titel)}: {x.grund}</li>)}{ergebnis.liste.length > 50 && <li>… und {zahl(ergebnis.liste.length - 50)} weitere</li>}</ul>}
          <button type="button" className="textknopf klein" onClick={() => setErgebnis(undefined)}>Ausblenden</button>
        </div>
      )}
      <div className={`listenrumpf${wahl?.gewaehlt.size ? ' mit-auswahl' : ''}`}>
      {s.gesamt === 0
        ? <p className="leise leerliste">{suche ? 'Nichts gefunden.' : p.leerText}</p>
        : tabelle
          ? <Tabelle sicht={p.sicht} anhang={anhang} typ={p.typ} spaltenTyp={p.spaltenTyp} spalten={spalten} mappen={s.mappen} bezuege={s.bezuege} ausschnitte={s.ausschnitte} aufgaben={s.aufgaben} favoriten={s.favoriten} offen={p.offen} wahl={wahl}
              sortierung={sortierung} sortiere={sortiere} ende={nachladen ? (el) => { ende.current = el; } : undefined} nachladen={nachladen} />
          : <ul className="mappenliste">
              {s.mappen.map((m, i) => {
                const typ = d.typ(m.typId);
                const k = kompakt(p.listenSpalten ?? [], !!p.typ, typ, m, s.bezuege, d.person);
                return (
                  <li key={m.id} className={`mit-stern${wahl ? ' mit-haken' : ''}${wahl?.gewaehlt.has(m.id) ? ' gewaehlt' : ''}`} {...(wahl && !m.verborgen ? wahl.druck(i) : {})}>
                    {wahl && !m.verborgen && <Wahlhaken an={wahl.gewaehlt.has(m.id)} titel={k.titel} waehle={(an, bereich) => wahl.waehle(i, an, bereich)} />}
                    {m.verborgen ? <span /> : <Stern mappeId={m.id} an={s.favoriten.has(m.id)} titel={k.titel} klein />}
                    <Link to={`/ablage/${p.sicht}/${m.id}${anhang}`} className={`eintrag ${p.offen === m.id ? 'an' : ''}`}>
                      <span className={`titel ${m.verborgen ? 'verborgen-titel' : ''}`}>{m.verborgen ? 'Nicht sichtbare Mappe' : k.titel}</span>
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
  wahl?: Auswahl;
}) {
  const d = useDaten();
  const geladen = p.mappen.filter((m) => !m.verborgen);
  const alleGeladen = !!p.wahl && geladen.length > 0 && geladen.every((m) => p.wahl!.gewaehlt.has(m.id));
  const einige = !!p.wahl && !alleGeladen && geladen.some((m) => p.wahl!.gewaehlt.has(m.id));
  const aktiv = p.sortierung ?? { spalte: '_titel', absteigend: false };
  const rechts = (k: string) => { const f = p.spaltenTyp?.felder.find((x) => x.key === k); return f?.typ === 'zahl' || f?.typ === 'betrag'; };
  // Datum, Ja/Nein und Zeitstempel nicht umbrechen; Texte dürfen umbrechen, damit die Tabelle in die Liste passt.
  const kurz = (k: string) => { const f = p.spaltenTyp?.felder.find((x) => x.key === k); return k === '_erstellt' || k === '_geaendert' || f?.typ === 'datum' || f?.typ === 'janein'; };
  return (
    <div className="trefferliste">
      <table>
        <thead>
          <tr>
            {p.wahl && <th className="hakenspalte"><input type="checkbox" className="wahlhaken" aria-label="Alle geladenen auswählen" checked={alleGeladen}
              ref={(el) => { if (el) el.indeterminate = einige; }} onChange={(e) => p.wahl!.setze(e.target.checked ? [...new Set([...p.wahl!.gewaehlt, ...geladen.map((m) => m.id)])] : [], false)} /></th>}
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
          {p.mappen.map((m, i) => {
            const typ = d.typ(m.typId);
            const ziel = `/ablage/${p.sicht}/${m.id}${p.anhang ?? ''}`;
            return (
              <tr key={m.id} className={`${p.offen === m.id ? 'an' : ''} ${m.passt === false ? 'unpassend' : ''}${p.wahl?.gewaehlt.has(m.id) ? ' gewaehlt' : ''}`} {...(p.wahl && !m.verborgen ? p.wahl.druck(i) : {})}
                onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button, input')) geheZu(ziel); }}>
                {p.wahl && <td className="hakenspalte">{!m.verborgen && <Wahlhaken an={p.wahl.gewaehlt.has(m.id)} titel={titelOder(m.titel)} waehle={(an, bereich) => p.wahl!.waehle(i, an, bereich)} />}</td>}
                <td className="sternspalte"><Stern mappeId={m.id} an={p.favoriten.has(m.id)} titel={titelOder(m.titel)} klein /></td>
                {p.spalten.map((k, i) => {
                  const text = zelle(k, m, typ, p.bezuege, d.person);
                  return <td key={k} className={rechts(k) ? 'rechts' : kurz(k) ? 'kurz' : ''}>{i === 0 ? <><Link to={ziel}>{text || titelOder(m.titel)}</Link>{p.ausschnitte?.[m.id] && <Fundstelle a={p.ausschnitte[m.id]} />}</> : text}</td>;
                })}
                {p.sicht === 'eingang' && <td className="problemzelle">{p.aufgaben?.[m.id] ?? m.problem}</td>}
              </tr>
            );
          })}
          {p.nachladen && <tr ref={p.ende} className="nachladen"><td colSpan={p.spalten.length + 1 + (p.wahl ? 1 : 0) + (p.sicht === 'eingang' ? 1 : 0)} className="leise klein">{p.nachladen}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const Unter = ({ text }: { text: string }) => (text ? <span className="unter">{text}</span> : null);

/* ---------- Auswahl mehrerer Mappen (#149) ---------- */

type Auswahl = ReturnType<typeof useAuswahl>;

/**
 * Auswahl in einer Liste: Haken je Zeile, Bereich mit Shift, „Alle Treffer“ über Seiten hinweg.
 * Am Handy wählt langes Drücken; solange etwas gewählt ist, schaltet Tippen um. Neue Sicht oder Suche → leer.
 */
function useAuswahl(mappen: Mappe[], gesamt: number | null, abhaengig: unknown[]) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [alle, setAlle] = useState(false);
  const anker = useRef<number | null>(null);
  const lang = useRef<{ t?: number; ausgeloest?: boolean }>({});
  const schluessel = JSON.stringify(abhaengig);
  useEffect(() => { setGewaehlt(new Set()); setAlle(false); anker.current = null; }, [schluessel]);
  const waehle = (i: number, an: boolean, bereich: boolean) => {
    const von = bereich && anker.current !== null ? Math.min(anker.current, i) : i;
    const bis = bereich && anker.current !== null ? Math.max(anker.current, i) : i;
    setGewaehlt((x) => {
      const n = new Set(x);
      for (let j = von; j <= bis; j++) { const m = mappen[j]; if (m && !m.verborgen) { if (an) n.add(m.id); else n.delete(m.id); } }
      return n;
    });
    anker.current = i;
    setAlle(false);
  };
  const setze = (ids: string[], alleTreffer: boolean) => { setGewaehlt(new Set(ids)); setAlle(alleTreffer && ids.length >= (gesamt ?? 0)); };
  const leeren = () => { setGewaehlt(new Set()); setAlle(false); anker.current = null; };
  /** Langes Drücken (Handy) wählt; mit Auswahl schaltet Tippen um statt die Mappe zu öffnen. */
  const druck = (i: number) => ({
    onTouchStart: () => {
      window.clearTimeout(lang.current.t);
      lang.current = { t: window.setTimeout(() => { lang.current.ausgeloest = true; const m = mappen[i]; if (m) waehle(i, !gewaehlt.has(m.id), false); navigator.vibrate?.(20); }, 500) };
    },
    onTouchMove: () => window.clearTimeout(lang.current.t),
    onTouchEnd: () => window.clearTimeout(lang.current.t),
    onClickCapture: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('input, button')) return;
      const beruehrung = window.matchMedia?.('(pointer: coarse)').matches;
      if (lang.current.ausgeloest || (beruehrung && gewaehlt.size > 0)) {
        e.preventDefault(); e.stopPropagation();
        if (!lang.current.ausgeloest) { const m = mappen[i]; if (m) waehle(i, !gewaehlt.has(m.id), false); }
        lang.current.ausgeloest = false;
      }
    },
    onContextMenu: (e: React.MouseEvent) => { if (lang.current.ausgeloest) e.preventDefault(); },
  });
  return { gewaehlt, alle, waehle, setze, leeren, druck };
}

function Wahlhaken({ an, titel, waehle }: { an: boolean; titel: string; waehle(an: boolean, bereich: boolean): void }) {
  // onClick statt onChange: nur dort gibt es die Shift-Taste.
  return <input type="checkbox" className="wahlhaken" checked={an} aria-label={`${titel} auswählen`}
    onClick={(e) => waehle((e.target as HTMLInputElement).checked, e.shiftKey)} onChange={() => {}} />;
}

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
              <span className="nm">{s.name}</span>{n !== undefined && <span className={s.id === d.zaehler.neuePost && n > 0 ? 'zaehler' : 'zahl'}>{zahl(n)}</span>}
            </Link>
          </div>
        );
      })}
    </>
  );
}
