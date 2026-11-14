import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SYSTEMSPALTEN } from '../../../shared/src/model';
import { mappenApi, type DokumentImKorb, type PapierkorbEintrag } from '../api/mappen';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Listenkopf } from '../Listenkopf';
import { Feld, Fundstellen, Hervorgehoben, KeineTreffer, Knopf, ListenSuche, useListenSuche, Wahlhaken } from '../bausteine';
import { t, tn } from '../sprache';
import { typName } from '../../../shared/src/beschriftung';
import { AnlageMarke } from './Anlagen';
import { aufbewahrung, basis, datumZeit, melde, type PapierkorbZustand } from './papierkorbStand';

/**
 * Liste des Papierkorbs (#43) mit Suche, Filtern und Mehrfachauswahl (#1197): Suchfeld (Titel, Dateiname, Mappe),
 * Filter nach Art (Mappen/Dokumente), Mappentyp, gelöscht von (nur Werkbank) und Zeitraum – mit dem Baustein Suche wie
 * die übrigen Listen. Haken je Eintrag und „Alle auswählen“; für die Auswahl „Wiederherstellen“ und „Endgültig
 * löschen“, eins nach dem anderen, Fehlschläge bleiben gewählt und stehen mit Grund da. „Papierkorb leeren“ bleibt oben.
 * Die Aufbewahrung stellt man in der Werkbank unter Daten sichern → Einstellungen ein; hier steht nur eine Zeile dazu.
 */

type Art = 'alle' | 'mappen' | 'dokumente';
type Zeitraum = 'alle' | 'heute' | 'woche' | 'monat' | 'aelter';
const TAG_MS = 24 * 3600 * 1000;

/** Ein Eintrag der Liste: Mappe oder einzelnes Dokument; `schluessel` ist eindeutig über beide. */
type Eintrag = { art: 'mappe'; schluessel: string; m: PapierkorbEintrag } | { art: 'dokument'; schluessel: string; d: DokumentImKorb };
const geloeschtAm = (e: Eintrag) => (e.art === 'mappe' ? e.m.geloescht : e.d.geloescht);
const geloeschtVon = (e: Eintrag) => (e.art === 'mappe' ? e.m.geloeschtVon : e.d.geloeschtVon);
const typVon = (e: Eintrag) => (e.art === 'mappe' ? e.m.typId : e.d.typId);

function imZeitraum(iso: string, z: Zeitraum, jetzt = Date.now()): boolean {
  if (z === 'alle') return true;
  const alter = jetzt - Date.parse(iso);
  if (z === 'heute') return new Date(iso).toDateString() === new Date(jetzt).toDateString();
  if (z === 'woche') return alter <= 7 * TAG_MS;
  if (z === 'monat') return alter <= 30 * TAG_MS;
  return alter > 30 * TAG_MS;
}

/** Filter der Liste (#1197): Art, Mappentyp, gelöscht von (Werkbank), Zeitraum. */
function useFilter() {
  const [art, setArt] = useState<Art>('alle');
  const [typ, setTyp] = useState('');
  const [von, setVon] = useState('');
  const [zeitraum, setZeitraum] = useState<Zeitraum>('alle');
  const passt = (e: Eintrag) => (art === 'alle' || (art === 'mappen') === (e.art === 'mappe')) && (!typ || typVon(e) === typ)
    && (!von || geloeschtVon(e) === von) && imZeitraum(geloeschtAm(e), zeitraum);
  return { art, setArt, typ, setTyp, von, setVon, zeitraum, setZeitraum, passt, aktiv: art !== 'alle' || !!typ || !!von || zeitraum !== 'alle',
    zuruecksetzen: () => { setArt('alle'); setTyp(''); setVon(''); setZeitraum('alle'); } };
}
type Filter = ReturnType<typeof useFilter>;

function FilterFelder({ f, alle, werkbank }: { f: Filter; alle: Eintrag[]; werkbank: boolean }) {
  const d = useDaten();
  const typen = [...new Set(alle.map(typVon))].map((id) => ({ id, name: d.typ(id) ? typName(d.typ(id)!) : id })).sort((a, b) => a.name.localeCompare(b.name));
  const personen = [...new Set(alle.map(geloeschtVon).filter((x): x is string => !!x))].map((id) => ({ id, name: d.person(id) })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="zeile papierkorb-filter">
      <Feld beschriftung={t('ablage.papierkorb.filter.art')} className="klein">
        <select value={f.art} onChange={(x) => f.setArt(x.target.value as Art)}>
          <option value="alle">{t('ablage.papierkorb.filter.alle')}</option>
          <option value="mappen">{t('ablage.papierkorb.filter.mappen')}</option>
          <option value="dokumente">{t('ablage.papierkorb.filter.dokumente')}</option>
        </select>
      </Feld>
      <Feld beschriftung={t('ablage.papierkorb.mappentyp')} className="klein">
        <select value={f.typ} onChange={(x) => f.setTyp(x.target.value)}>
          <option value="">{t('ablage.papierkorb.filter.alle')}</option>
          {typen.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Feld>
      {werkbank && <Feld beschriftung={t('ablage.papierkorb.geloescht-von')} className="klein">
        <select value={f.von} onChange={(x) => f.setVon(x.target.value)}>
          <option value="">{t('ablage.papierkorb.filter.alle')}</option>
          {personen.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Feld>}
      <Feld beschriftung={t('ablage.papierkorb.filter.zeitraum')} className="klein">
        <select value={f.zeitraum} onChange={(x) => f.setZeitraum(x.target.value as Zeitraum)}>
          {(['alle', 'heute', 'woche', 'monat', 'aelter'] as const).map((z) => <option key={z} value={z}>{t.frei(`ablage.papierkorb.filter.zeitraum.${z}`)}</option>)}
        </select>
      </Feld>
    </div>
  );
}

/** Auswahl (#1197): Wiederherstellen und endgültig löschen, eins nach dem anderen; was scheitert, bleibt gewählt. */
function useAuswahl(werkbank: boolean, eintraege: Eintrag[]) {
  const d = useDaten();
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [laeuft, setLaeuft] = useState<{ fertig: number; gesamt: number } | null>(null);
  const [ergebnis, setErgebnis] = useState<{ gut?: string; fehler: string[] }>({ fehler: [] });
  const gewaehlt = eintraege.filter((e) => auswahl.has(e.schluessel));
  const waehle = (k: string, an: boolean) => setAuswahl((x) => { const y = new Set(x); if (an) y.add(k); else y.delete(k); return y; });
  async function fuerAlle(was: 'zurueck' | 'weg') {
    // Mappen zuerst: Ein Dokument aus einer Mappe im Papierkorb lässt sich erst danach zurückholen.
    const liste = [...gewaehlt].sort((a, b) => (a.art === b.art ? 0 : a.art === 'mappe' ? -1 : 1));
    const fehler: string[] = [];
    const bleibt = new Set<string>();
    setErgebnis({ fehler: [] });
    for (const [i, e] of liste.entries()) {
      setLaeuft({ fertig: i, gesamt: liste.length });
      try {
        if (e.art === 'mappe') await (was === 'zurueck' ? mappenApi.wiederherstellen(e.m.id, werkbank) : mappenApi.endgueltigLoeschen(e.m.id, werkbank));
        else await (was === 'zurueck' ? mappenApi.dokumentWiederherstellen(e.d.id, werkbank) : mappenApi.dokumentEndgueltig(e.d.id, werkbank));
      } catch (x) { fehler.push(`${e.art === 'mappe' ? titelOder(e.m.titel) : e.d.name}: ${(x as Error).message}`); bleibt.add(e.schluessel); }
    }
    setLaeuft(null);
    setAuswahl(bleibt);
    const n = liste.length - fehler.length;
    setErgebnis({ fehler, gut: n ? t(was === 'zurueck' ? 'ablage.papierkorb.auswahl.zurueck-fertig' : 'ablage.papierkorb.auswahl.weg-fertig', { anzahl: n }) : undefined });
    melde(); await d.neuLaden();
  }
  return { auswahl, setAuswahl, gewaehlt, waehle, laeuft, ergebnis, fuerAlle };
}
type Auswahl = ReturnType<typeof useAuswahl>;

function Auswahlleiste({ a, sichtbar }: { a: Auswahl; sichtbar: Eintrag[] }) {
  const n = a.gewaehlt.length;
  const alle = !!sichtbar.length && sichtbar.every((e) => a.auswahl.has(e.schluessel));
  return (
    <>
      <div className="zeile papierkorb-auswahl">
        <span className="papierkorb-alle">
          <Wahlhaken an={alle} teilweise={!alle && n > 0} gesperrt={!!a.laeuft || !sichtbar.length} beschriftung={t('ablage.papierkorb.auswahl.alle')}
            setze={(an) => a.setAuswahl(an ? new Set(sichtbar.map((e) => e.schluessel)) : new Set())} />
          <span aria-hidden="true" className="klein">{t('ablage.papierkorb.auswahl.alle')}</span>
        </span>
        {n > 0 && <>
          <Knopf symbol="zuruecksetzen" gesperrt={!!a.laeuft} onClick={() => a.fuerAlle('zurueck')}>{t('ablage.papierkorb.auswahl.zurueck', { anzahl: n })}</Knopf>
          <Knopf art="gefahr" symbol="geloescht" gesperrt={!!a.laeuft} onClick={() => a.fuerAlle('weg')}
            rueckfrage={{ titel: t('ablage.papierkorb.auswahl.weg-frage', { anzahl: n }), text: t('ablage.papierkorb.das-laesst-sich-nicht'), ja: t('ablage.papierkorb.endgueltig-loeschen-2') }}>{t('ablage.papierkorb.auswahl.weg', { anzahl: n })}</Knopf>
        </>}
      </div>
      {a.laeuft && <div className="stapel" role="status"><p>{t('ablage.papierkorb.auswahl.fortschritt', { fertig: a.laeuft.fertig + 1, gesamt: a.laeuft.gesamt })}</p><progress max={a.laeuft.gesamt} value={a.laeuft.fertig} /></div>}
      {a.ergebnis.gut && <p className="gutertext" role="status">{a.ergebnis.gut}</p>}
      {a.ergebnis.fehler.length > 0 && <div className="hinweis schlecht" role="alert"><p>{t('ablage.papierkorb.auswahl.fehler', { anzahl: a.ergebnis.fehler.length })}</p><ul>{a.ergebnis.fehler.map((x) => <li key={x}>{x}</li>)}</ul></div>}
    </>
  );
}

export function PapierkorbListe({ z, werkbank, offen }: { z: PapierkorbZustand; werkbank: boolean; offen?: string }) {
  const d = useDaten();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string>();
  const tage = werkbank ? z.tage : d.zaehler.papierkorbTage;
  const mappen = z.eintraege ?? [];
  // Wie die Ablage: schmal → kompakte Einträge, breit → Tabelle.
  const mess = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);
  useEffect(() => {
    const el = mess.current;
    if (!el) return;
    const o = new ResizeObserver(([e]) => setBreite(e.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const alle: Eintrag[] = [...mappen.map((m): Eintrag => ({ art: 'mappe', schluessel: `m:${m.id}`, m })), ...z.dokumente.map((x): Eintrag => ({ art: 'dokument', schluessel: `d:${x.id}`, d: x }))];
  const f = useFilter();
  const such = useListenSuche(alle.filter(f.passt), {
    quellen: (e) => (e.art === 'mappe'
      ? [{ wo: '', text: titelOder(e.m.titel), titel: true }, { wo: t('ablage.papierkorb.mappentyp'), text: d.typ(e.m.typId)?.name ?? '' }]
      : [{ wo: '', text: e.d.name, titel: true }, { wo: t('ablage.papierkorb.suche.mappe'), text: titelOder(e.d.mappeTitel) }]),
  });
  const sichtbar = such.treffer.map((x) => x.eintrag);
  const a = useAuswahl(werkbank, alle);

  // Rückfrage stellt der Gefahr-Knopf selbst (#1210, Leitsatz 5).
  const was = [mappen.length ? (t('ablage.papierkorb.mappen-samt-dokumenten', { anzahl: mappen.length })) : '', z.dokumente.length ? (t('ablage.papierkorb.dokumente', { anzahl: z.dokumente.length })) : ''].filter(Boolean).join(` ${t('ablage.papierkorb.und')} `);
  const leerenFrage = { titel: t('ablage.papierkorb.leeren', { wert: werkbank ? t('ablage.papierkorb.den-ganzen-papierkorb-alle') : t('ablage.papierkorb.deinen-papierkorb') }), text: t('ablage.papierkorb.werden-endgueltig-geloescht', { anzahl: alle.length, charAt: was.charAt(0).toUpperCase(), was: was.slice(1) }), ja: t('ablage.papierkorb.papierkorb-leeren') };
  async function leeren() {
    setLaeuft(true); setMeldung(undefined);
    try { await mappenApi.papierkorbLeeren(werkbank); melde(); await d.neuLaden(); geheZu(basis(werkbank)); }
    catch (e) { setMeldung((e as Error).message); }
    finally { setLaeuft(false); }
  }
  const leerenKnopf = alle.length > 0
    ? <Knopf art="gefahr" groesse="klein" symbol="geloescht" rueckfrage={leerenFrage} laeuft={laeuft} laeuftText={t('ablage.papierkorb.leere')} onClick={() => leeren()}>{t('ablage.papierkorb.papierkorb-leeren')}</Knopf> : null;
  const aktiv = such.aktiv || f.aktiv;
  return (
    <>
      <div ref={mess} className="breitenmesser" aria-hidden="true" />
      <Listenkopf titel={t('ablage.papierkorb.papierkorb')} hilfe={werkbank ? 'werkbank.papierkorb' : 'ablage.papierkorb'}
        beschreibung={werkbank ? t('ablage.papierkorb.was-alle-benutzer-geloescht') : <>{t('ablage.papierkorb.was-du-geloescht-hast')}{aufbewahrung(tage)}</>}>
        {leerenKnopf}
      </Listenkopf>
      {/* #1197: Die Aufbewahrung stellt man unter Daten sichern → Einstellungen ein; hier nur eine leise Zeile dazu. */}
      {werkbank && tage !== null && <p className="leise klein">{tage ? tn('ablage.papierkorb.aufbewahrung.zeile', { anzahl: tage, link: <Link to="/werkbank/daten#papierkorb" className="verweis">{t('werkbank.bereich.daten.name')}</Link> }) : tn('ablage.papierkorb.aufbewahrung.aus', { link: <Link to="/werkbank/daten#papierkorb" className="verweis">{t('werkbank.bereich.daten.name')}</Link> })}</p>}
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {meldung && <div className="hinweis schlecht"><p>{meldung}</p></div>}
      <div className="listenrumpf">
        {z.eintraege === null ? <p className="leise">{t('ablage.papierkorb.lade')}</p>
          : !alle.length ? <p className="leise leerliste">{t('ablage.papierkorb.der-papierkorb-ist-leer')}</p> : <>
            <ListenSuche wert={such.eingabe} setze={such.setEingabe} beschriftung={t('ablage.papierkorb.suche.beschriftung')} platzhalter={t('ablage.papierkorb.suche.platzhalter')}
              treffer={sichtbar.length} aktiv={aktiv} anzahl={t('ablage.papierkorb.suche.anzahl', { anzahl: alle.length })}
              filter={<FilterFelder f={f} alle={alle} werkbank={werkbank} />} />
            <Auswahlleiste a={a} sichtbar={sichtbar} />
            {!sichtbar.length ? <KeineTreffer zuruecksetzen={() => { such.zuruecksetzen(); f.zuruecksetzen(); }} /> : <>
              <MappenImKorb treffer={such.treffer.filter((x) => x.eintrag.art === 'mappe')} alleMappen={mappen} werkbank={werkbank} offen={offen} breite={breite} a={a} />
              <DokumenteImKorb treffer={such.treffer.filter((x) => x.eintrag.art === 'dokument')} werkbank={werkbank} a={a} />
            </>}
          </>}
      </div>
    </>
  );
}

type Treffer = ReturnType<typeof useListenSuche<Eintrag>>['treffer'];

/** Gelöschte Mappen: schmal als Einträge, breit als Tabelle – je mit Haken. */
function MappenImKorb({ treffer, alleMappen, werkbank, offen, breite, a }: { treffer: Treffer; alleMappen: PapierkorbEintrag[]; werkbank: boolean; offen?: string; breite: number; a: Auswahl }) {
  const d = useDaten();
  if (!treffer.length) return null;
  // Mit verknüpften Mappen gelöscht (#424): Mappen eines Vorgangs gehören zusammen.
  const imVorgang = new Map<string, number>();
  for (const e of alleMappen) if (e.vorgang) imVorgang.set(e.vorgang, (imVorgang.get(e.vorgang) ?? 0) + 1);
  const vorgangChip = (e: PapierkorbEintrag) => {
    const n = e.vorgang ? imVorgang.get(e.vorgang) ?? 0 : 0;
    return n > 1 ? <span className="chip lb-chip" title={t('ablage.papierkorb.zusammen-mit-weiteren-mappen', { wert: n - 1 })}>{e.id === e.vorgang ? t('ablage.papierkorb.mit-verknuepften', { wert: n - 1 }) : t('ablage.papierkorb.verknuepft')}</span> : null;
  };
  // Aufgelöste Post (#936): in welche Mappe – in der Tabelle mit Link, in der kompakten Liste nur als Text.
  const aufgeloest = (e: PapierkorbEintrag, mitLink: boolean): ReactNode => {
    const z = e.aufgeloestIn;
    if (!z) return null;
    const typ = d.typ(z.typId);
    const ziel = mitLink && z.da ? <Link to={`/ablage/${z.typId}/${z.id}`} className="verweis">{titelOder(z.titel)}</Link> : titelOder(z.titel);
    return <span className="leise klein">{tn('ablage.papierkorb.aufgeloest-in', { typ: typ ? typName(typ) : '', link: ziel })}</span>;
  };
  const haken = (e: PapierkorbEintrag, k: string) => <Wahlhaken an={a.auswahl.has(k)} gesperrt={!!a.laeuft} setze={(an) => a.waehle(k, an)} beschriftung={t('ablage.papierkorb.auswahl.waehlen', { titel: titelOder(e.titel) })} />;
  const spalten: Array<[string, (e: PapierkorbEintrag) => string]> = [
    [t('ablage.papierkorb.mappentyp'), (e) => d.typ(e.typId)?.name ?? ''],
    [SYSTEMSPALTEN._titel, (e) => titelOder(e.titel)],
    [SYSTEMSPALTEN._erstelltVon, (e) => d.person(e.erstelltVon)],
    [SYSTEMSPALTEN._erstellt, (e) => datumZeit(e.erstellt)],
    [SYSTEMSPALTEN._geaendertVon, (e) => d.person(e.geaendertVon)],
    [SYSTEMSPALTEN._geaendert, (e) => datumZeit(e.geaendert)],
    ...(werkbank ? [[t('ablage.papierkorb.geloescht-von'), (e: PapierkorbEintrag) => d.person(e.geloeschtVon)] as [string, (e: PapierkorbEintrag) => string]] : []),
    [t('ablage.papierkorb.geloescht'), (e) => datumZeit(e.geloescht)],
  ];
  const tabelle = breite >= spalten.length * 110;
  return (
    <div className="korbmappen">
      <p className="listenzahl leise klein">{treffer.length} {t('ablage.papierkorb.mappen', { anzahl: treffer.length })}</p>
      {!tabelle ? (
        <ul className="mappenliste">
          {treffer.map(({ eintrag, titel }) => {
            if (eintrag.art !== 'mappe') return null;
            const e = eintrag.m;
            return (
              <li key={e.id} className="korbzeile">
                {haken(e, eintrag.schluessel)}
                <Link to={`${basis(werkbank)}/${e.id}`} className={`eintrag ${offen === e.id ? 'an' : ''}`}>
                  <span className="titel">{titel ? <Hervorgehoben teile={titel} text={titelOder(e.titel)} /> : titelOder(e.titel)}{vorgangChip(e)}</span>
                  <span className="unter">{t('ablage.papierkorb.geloescht-2', { wert: d.typ(e.typId)?.name ?? '', datumZeit: datumZeit(e.geloescht), wert2: werkbank ? t('ablage.papierkorb.von', { person: d.person(e.geloeschtVon) }) : '' })}</span>
                  {aufgeloest(e, false)}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="trefferliste"><table>
          <thead><tr><th><span className="sr">{t('ablage.papierkorb.auswahl.spalte')}</span></th>{spalten.map(([n]) => <th key={n}>{n}</th>)}</tr></thead>
          <tbody>
            {treffer.map(({ eintrag, funde }) => {
              if (eintrag.art !== 'mappe') return null;
              const e = eintrag.m;
              const ziel = `${basis(werkbank)}/${e.id}`;
              return (
                <tr key={e.id} className={offen === e.id ? 'an' : ''} onClick={(ev) => { if (!(ev.target as HTMLElement).closest('a, input, label')) geheZu(ziel); }}>
                  <td>{haken(e, eintrag.schluessel)}</td>
                  {spalten.map(([n, wert], i) => (
                    <td key={n} className={i === spalten.length - 1 || n === SYSTEMSPALTEN._erstellt || n === SYSTEMSPALTEN._geaendert ? 'kurz' : ''}>
                      {i === 1 ? <><Link to={ziel}>{wert(e)}</Link>{vorgangChip(e)}{e.aufgeloestIn && <> {aufgeloest(e, true)}</>}<Fundstellen funde={funde} /></> : wert(e)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

const groesseText = (b: number) => (b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB`);

/** Einzelne Dokumente im Papierkorb (#344): aus welcher Mappe und welchem Register; direkt wiederherstellen. */
function DokumenteImKorb({ treffer, werkbank, a }: { treffer: Treffer; werkbank: boolean; a: Auswahl }) {
  const d = useDaten();
  const [laeuft, setLaeuft] = useState<string>();
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: ReactNode }>();
  if (!treffer.length) return null;
  async function zurueck(x: DokumentImKorb) {
    setLaeuft(x.id); setMeldung(undefined);
    try {
      const r = await mappenApi.dokumentWiederherstellen(x.id, werkbank);
      melde(); await d.neuLaden();
      setMeldung({ art: 'gut', text: <>{tn('ablage.papierkorb.liegt-wieder-in-register', { name: x.name, link: <Link to={`/ablage/${r.typId}/${x.mappeId}`} className="verweis">{titelOder(x.mappeTitel)}</Link>, register: x.register })}</> });
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setLaeuft(undefined); }
  }
  async function weg(x: DokumentImKorb) {
    setLaeuft(x.id); setMeldung(undefined);
    try { await mappenApi.dokumentEndgueltig(x.id, werkbank); melde(); await d.neuLaden(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setLaeuft(undefined); }
  }
  return (
    <section className="korbdokumente">
      <h2 className="h3">{t('ablage.papierkorb.dokumente-2')}</h2>
      <p className="listenzahl leise klein">{t('ablage.papierkorb.dokumente-einzeln-aus-einer', { anzahl: treffer.length })}</p>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <ul className="mappenliste">
        {treffer.map(({ eintrag, titel, funde }) => {
          if (eintrag.art !== 'dokument') return null;
          const x = eintrag.d;
          return (
            <li key={x.id} className="korbdokument korbzeile">
              <Wahlhaken an={a.auswahl.has(eintrag.schluessel)} gesperrt={!!a.laeuft} setze={(an) => a.waehle(eintrag.schluessel, an)} beschriftung={t('ablage.papierkorb.auswahl.waehlen', { titel: x.name })} />
              <div className="eintrag">
                <span className="titel"><span className="chip" title={t('ablage.papierkorb.art')}>{t('ablage.papierkorb.dokument')}</span> {titel ? <Hervorgehoben teile={titel} text={x.name} /> : x.name} <AnlageMarke d={x} /></span>
                <span className="unter">
                  {tn('ablage.papierkorb.aus-register-geloescht', { wert: x.mappe === 'da' ? <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{titelOder(x.mappeTitel)}</Link> : titelOder(x.mappeTitel), register: x.register, groesseText: groesseText(x.groesse), wert2: x.versionen ? t('ablage.papierkorb.versionen', { wert: x.versionen + 1 }) : '', datumZeit: datumZeit(x.geloescht), wert3: werkbank ? t('ablage.papierkorb.von', { person: d.person(x.geloeschtVon) }) : '' })}</span>
                {x.mappe === 'papierkorb' && <span className="leise klein">{t('ablage.papierkorb.die-mappe-liegt-selbst')}</span>}
                {x.mappe === 'weg' && <span className="leise klein">{t('ablage.papierkorb.die-mappe-gibt-es')}</span>}
                <Fundstellen funde={funde} />
              </div>
              <div className="knoepfe">
                <Knopf groesse="klein" symbol="zuruecksetzen" gesperrt={x.mappe !== 'da' || (!!laeuft && laeuft !== x.id) || !!a.laeuft} laeuft={laeuft === x.id} onClick={() => zurueck(x)}>{t('ablage.papierkorb.wiederherstellen')}</Knopf>
                <Knopf art="gefahr" groesse="klein" symbol="geloescht" gesperrt={!!laeuft || !!a.laeuft} onClick={() => weg(x)}
                  rueckfrage={{ titel: t('ablage.papierkorb.endgueltig-loeschen', { name: x.name, wert: x.versionen ? t('ablage.papierkorb.mit-allen-versionen', { wert: x.versionen + 1 }) : '' }), text: t('ablage.papierkorb.das-laesst-sich-nicht'), ja: t('ablage.papierkorb.endgueltig-loeschen-2') }}>{t('ablage.papierkorb.endgueltig-loeschen-2')}</Knopf>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
