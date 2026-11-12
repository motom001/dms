import { useCallback, useEffect, useState } from 'react';
import { AUFGABENARTEN, formatiere, type Aufgabe, type Aufgabenart } from '../../../shared/src/model';
import { FAELLIGKEITEN, filterAktiv, filterInAdresse, filtereAufgaben, type AufgabenFilter, type Faelligkeit } from '../../../shared/src/aufgabenfilter';
import { FilterHaken, KeineTreffer, ListenSuche } from '../bausteine';
import { api, type MappeDetails } from '../api';
import { BenutzerWahl } from '../ablage/Aufgaben';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Person } from '../Person';
import { Listenkopf } from '../Listenkopf';
import { SammelHaken, SammelKopf, SammelLeiste, useSammelauswahl } from '../ablage/Sammelweitergabe';
import { t, tn } from '../sprache';
import { OhneLeserechtPanel } from './OhneLeserecht';
import { gebietsschema } from '../../../shared/src/sprache';

/** Rechts statt einer Aufgabe (#798): Aufgaben bei Personen ohne Leserecht – /werkbank/aufgaben/ohne-leserecht. */
export const OHNE_LESERECHT = 'ohne-leserecht';

/**
 * Werkbank → Einstellungen → Aufgaben (#54, #366, #354): in der Mitte nur noch die Liste der Aufgaben (#1001) – Suchfeld
 * oben, Filter darunter (in der Adresse), Mehrfachauswahl zum gesammelten Weitergeben (#415); rechts die Mappe der
 * gewählten Aufgabe – mit „Weitergeben an“. Tägliche Zusammenfassung, Favoriten und „Post für dich“ stehen seit #1001
 * nur noch unter Automatisierungen.
 */
const datum = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
const tag = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(gebietsschema());

export function useAufgaben(aktiv: boolean, erledigt = false) {
  const [liste, setListe] = useState<Aufgabe[] | null>(null);
  const [unlesbar, setUnlesbar] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { const r = await api.aufgabenWerkbank(erledigt); setListe(r.aufgaben); setUnlesbar(new Set(r.unlesbar ?? [])); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, [erledigt]);
  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);
  return { liste, erledigt, fehler, laden, unlesbar };
}
export type AufgabenZustand = ReturnType<typeof useAufgaben>;

/** Abwesend (oder deaktiviert) und niemand vertritt: Aufgaben bleiben liegen. */
function useOhneVertretung() {
  const d = useDaten();
  return useCallback((id: string) => {
    const p = d.personen.find((x) => x.id === id);
    if (!p) return false;
    return ((p.abwesend?.wirkt ?? false) || p.aktiv === false) && !p.abwesend?.vertreter;
  }, [d.personen]);
}

export function AufgabenListe({ z, filter, offen }: { z: AufgabenZustand; filter: AufgabenFilter; offen?: string }) {
  const d = useDaten();
  const ohneVertretung = useOhneVertretung();
  const [fehler, setFehler] = useState<string>();
  const alle = z.liste ?? [];
  const liste = filtereAufgaben(alle, filter, { jetzt: new Date(), ohneVertretung });
  const suche = filterInAdresse(filter);
  const setze = (neu: Partial<AufgabenFilter>) => geheZu(`/werkbank/aufgaben${offen ? `/${offen}` : ''}${filterInAdresse({ ...filter, ...neu })}`, true);
  const zuruecksetzen = () => geheZu(`/werkbank/aufgaben${filterInAdresse({ erledigt: filter.erledigt })}`, true);
  const wahl = useSammelauswahl(z.erledigt ? [] : liste.map((a) => a.id));
  const titelVon = (id: string) => { const a = alle.find((x) => x.id === id); return a ? `${titelOder(a.mappeTitel)} – ${a.text}` : t('werkbank.aufgaben.aufgabe'); };
  async function weiter(a: Aufgabe, an: string) {
    setFehler(undefined);
    try { await api.aufgabeDelegieren(a.id, an); await z.laden(); await d.neuLaden(); } catch (e) { setFehler((e as Error).message); }
  }
  // Muster „Liste in der Mitte: Suchfeld oben, Filter darunter“ (#994, Baustein Suche #1143); Suche und Filter stehen in der Adresse.
  const filterTeil = (
    <>
      <div className="filterraster">
        <label className="eigenschaft klein"><span>{t('werkbank.aufgaben.empfaenger')}</span>
          <select value={filter.empfaenger ?? ''} onChange={(e) => setze({ empfaenger: e.target.value || undefined })}>
            <option value="">{t('werkbank.aufgaben.alle')}</option>
            <option value="admins">{t('konten.verwaltende.ohneEmpfaenger')}</option>
            <option value="ohne-vertretung">{t('werkbank.aufgaben.abwesend-ohne-vertretung')}</option>
            {d.personen.map((p) => <option key={p.id} value={p.id}>{p.name}{p.aktiv === false ? t('werkbank.aufgaben.deaktiviert') : ''}</option>)}
          </select></label>
        <label className="eigenschaft klein"><span>{t('werkbank.aufgaben.art')}</span>
          <select value={filter.art ?? ''} onChange={(e) => setze({ art: (e.target.value || undefined) as Aufgabenart | undefined })}>
            <option value="">{t('werkbank.aufgaben.alle')}</option>
            {Object.entries(AUFGABENARTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="eigenschaft klein"><span>{t('werkbank.aufgaben.mappentyp')}</span>
          <select value={filter.typ ?? ''} onChange={(e) => setze({ typ: e.target.value || undefined })}>
            <option value="">{t('werkbank.aufgaben.alle')}</option>
            {d.typen.map((mappentyp) => <option key={mappentyp.id} value={mappentyp.id}>{mappentyp.name}</option>)}
          </select></label>
        <label className="eigenschaft klein"><span>{t('werkbank.aufgaben.faelligkeit')}</span>
          <select value={filter.faellig ?? ''} onChange={(e) => setze({ faellig: (e.target.value || undefined) as Faelligkeit | undefined })}>
            <option value="">{t('werkbank.aufgaben.alle')}</option>
            {Object.entries(FAELLIGKEITEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
      </div>
      <FilterHaken an={!!filter.erledigt} setze={(an) => geheZu(`/werkbank/aufgaben${filterInAdresse({ ...filter, erledigt: an })}`, true)} anker="werkbank.aufgaben.erledigte">{t('werkbank.aufgaben.erledigte-zeigen')}</FilterHaken>
    </>
  );
  return (
    <>
      <Listenkopf titel={t('werkbank.bereich.aufgaben.name')} hilfe="werkbank.aufgaben" beschreibung={t('werkbank.aufgaben.unter')} />
      {/* #1001: Zusammenfassung, Favoriten und „Post für dich“ stellt man nur noch unter Automatisierungen ein. */}
      <p className="leise klein" data-anker="werkbank.aufgaben.automatisierungen">{tn('werkbank.aufgaben.benachrichtigungen', { link: <Link to="/werkbank/automatisierungen" className="verweis">{t('werkbank.aufgaben.benachrichtigungen.link')}</Link> })}</p>
      <ListenSuche wert={filter.text ?? ''} setze={(text) => setze({ text: text || undefined })} beschriftung={t('werkbank.aufgaben.im-titel-suchen')} platzhalter={t('werkbank.aufgaben.im-titel-suchen-2')} anker="werkbank.aufgaben.suche"
        treffer={z.liste === null ? null : liste.length} aktiv={filterAktiv(filter)}
        anzahl={z.erledigt ? t('werkbank.aufgaben.erledigte', { anzahl: alle.length }) : t('werkbank.aufgaben.aufgaben', { anzahl: alle.length })} filter={filterTeil} />
      {!z.erledigt && liste.length > 0 && <SammelKopf s={wahl} />}
      {!z.erledigt && <SammelLeiste s={wahl} titel={titelVon} erledigen nachher={async () => { await z.laden(); await d.neuLaden(); }} />}
      {(z.fehler || fehler) && <div className="hinweis schlecht"><p>{z.fehler ?? fehler}</p></div>}
      {/* #798: Aufgaben bei Personen ohne Leserecht – offen als Warnung, sonst ein leiser Link (auch zu den vergangenen). */}
      {!z.erledigt && z.unlesbar.size > 0
        ? <div className="hinweis warn hinweiszeile"><p><strong>{t('werkbank.ohne-leserecht.offen', { anzahl: z.unlesbar.size })}.</strong> {t('werkbank.ohne-leserecht.hinweis')}</p><Link to={`/werkbank/aufgaben/${OHNE_LESERECHT}${suche}`} className="knopf klein">{t('werkbank.ohne-leserecht.knopf')}</Link></div>
        : <p className="leise klein"><Link to={`/werkbank/aufgaben/${OHNE_LESERECHT}${suche}`} className={`verweis${offen === OHNE_LESERECHT ? ' an' : ''}`}>{t('werkbank.ohne-leserecht.titel')}</Link></p>}
      {/* Kästchen auch am Handy sichtbar (#415) – deshalb immer „mit-auswahl“. */}
      <div className={`listenrumpf${z.erledigt ? '' : ' mit-auswahl'}`}>
        {z.liste === null ? <p className="leise">{t('werkbank.aufgaben.lade')}</p>
          : !alle.length ? <p className="leise leerliste">{z.erledigt ? t('werkbank.aufgaben.noch-nichts-erledigt') : t('werkbank.aufgaben.keine-offenen-aufgaben')}</p>
          : !liste.length ? <KeineTreffer zuruecksetzen={zuruecksetzen} /> : (
          <ul className={`mappenliste${z.erledigt ? '' : ' sammel-liste'}`}>
            {liste.map((a) => (
              <li key={a.id} className={z.erledigt ? undefined : `mit-haken${wahl.ist(a.id) ? ' gewaehlt' : ''}`}>
                {!z.erledigt && <SammelHaken s={wahl} id={a.id} titel={`${titelOder(a.mappeTitel)}: ${a.text}`} />}
                <Link to={`/werkbank/aufgaben/${a.id}${suche}`} className={`eintrag ${offen === a.id ? 'an' : ''}`}>
                  <span className="titel">{titelOder(a.mappeTitel)}</span>
                  <span className="unter">{d.typ(a.typId ?? '')?.name} · {AUFGABENARTEN[a.art]}{a.datum ? ` · ${tag(a.datum)}` : ''} · {datum(z.erledigt && a.erledigt ? a.erledigt : a.erstellt)}</span>
                  <span className="unter">{a.text}</span>
                  {!z.erledigt && z.unlesbar.has(a.id) && <span className="problem">{t('werkbank.ohne-leserecht.marke')}</span>}
                </Link>
                <div className="aufgabenzeile">
                  {z.erledigt
                    ? <span className="leise klein">{t('werkbank.aufgaben.erledigt-von')}{' '}{a.erledigtVon ? <Person id={a.erledigtVon} /> : t('werkbank.aufgaben.selbst-mappe-passt-wieder')}</span>
                    : <><span className="leise klein">{t('werkbank.aufgaben.fuer')}{' '}{a.empfaengerId ? <Person id={a.empfaengerId} /> : t('konten.verwaltende.ohneEmpfaenger')} {' '}{t('werkbank.aufgaben.weitergeben-an')}</span>
                        <BenutzerWahl label={t('werkbank.aufgaben.aufgabe-weitergeben-an', { text: a.text })} wert="" setze={(an) => { if (an) void weiter(a, an); }} ohne={a.empfaengerId} /></>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Rechts: die Mappe der gewählten Aufgabe (#366), ohne Auswahl ein kurzer Leerzustand. */
export function AufgabenPanel({ z, id }: { z: AufgabenZustand; id?: string }) {
  if (id === OHNE_LESERECHT) return <OhneLeserechtPanel nachher={z.laden} />;
  if (!id) return (
    <div className="platzhalter"><p>{tn('werkbank.aufgaben.waehle-links-eine-aufgabe', { umbruch: <br />, span: <span className="leise klein">{t('werkbank.aufgaben.aufgaben-entstehen-wenn-eine')}</span> })}</p></div>
  );
  const a = z.liste?.find((x) => x.id === id);
  if (!a) return z.liste === null ? <p className="leise">{t('werkbank.aufgaben.lade')}</p> : <div className="leer"><p>{t('werkbank.aufgaben.diese-aufgabe-gibt-es')}</p></div>;
  return <AufgabeMappe key={a.id} a={a} z={z} />;
}

function AufgabeMappe({ a, z }: { a: Aufgabe; z: AufgabenZustand }) {
  const d = useDaten();
  const [an, setAn] = useState('');
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  /** Weitergeben rechts (#415): wie in der Liste; danach Liste und rechte Seite neu. */
  async function weitergeben() {
    const name = d.personen.find((p) => p.id === an)?.name ?? '';
    setSendet(true); setMeldung(undefined);
    try {
      const r = await api.aufgabeDelegieren(a.id, an);
      setAn(''); setMeldung({ art: 'gut', text: [t('werkbank.aufgaben.an-weitergegeben', { name }), r.hinweis].filter(Boolean).join(' ') });
      await z.laden(); await d.neuLaden();
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setSendet(false); }
  }
  const [m, setM] = useState<MappeDetails | null | 'fehlt'>(null);
  useEffect(() => { api.mappe(a.mappeId).then(setM, () => setM('fehlt')); }, [a.mappeId]);
  const typ = d.typ(a.typId ?? '');
  const ablage = `/ablage/${a.typId}/${a.mappeId}`;
  const felder = (typ?.felder ?? []).filter((f) => f.typ !== 'passwort' && f.typ !== 'formatiert' && f.typ !== 'langtext');
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.aufgaben.aufgabe-2', { wert: typ?.name ?? t('werkbank.aufgaben.mappe') })}</p>
        <h1>{titelOder(a.mappeTitel)}</h1>
        <dl className="index">
          <div><dt>{t('werkbank.aufgaben.art')}</dt><dd>{AUFGABENARTEN[a.art]}</dd></div>
          <div><dt>{t('werkbank.aufgaben.fuer-2')}</dt><dd>{a.empfaengerId ? <Person id={a.empfaengerId} /> : t('konten.verwaltende.ohneEmpfaenger')}</dd></div>
          {a.datum && <div><dt>{t('werkbank.aufgaben.datum')}</dt><dd>{tag(a.datum)}</dd></div>}
          <div><dt>{t('werkbank.aufgaben.seit')}</dt><dd>{datum(a.erstellt)}{a.erstelltVon && <> {' '}{t('werkbank.aufgaben.von')}{' '}<Person id={a.erstelltVon} /></>}</dd></div>
          {a.erledigt && <div><dt>{t('werkbank.aufgaben.erledigt')}</dt><dd>{datum(a.erledigt)}</dd></div>}
        </dl>
      </div>
      {a.text && <p>{a.text}</p>}
      {m === null ? <p className="leise">{t('werkbank.aufgaben.lade')}</p> : m === 'fehlt'
        ? <div className="hinweis info"><p>{t('werkbank.aufgaben.die-mappe-laesst-sich')}</p></div>
        : (
          <section className="blatt">
            <dl className="eigenschaften">
              {felder.map((f) => {
                const v = m.mappe.werte[f.key];
                const text = formatiere(f, v, (id) => titelOder(m.bezuege[id]?.titel), { felder: typ?.felder ?? [], werte: m.mappe.werte });
                return <div key={f.key} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{text || <span className="leise">–</span>}</dd></div>;
              })}
              <dt>{t('werkbank.aufgaben.dokumente')}</dt><dd>{m.dokumente.length || <span className="leise">{t('werkbank.aufgaben.keine')}</span>}</dd>
              <dt>{t('werkbank.aufgaben.offene-aufgaben')}</dt><dd>{m.aufgaben.filter((x) => !x.erledigt).length || <span className="leise">{t('werkbank.aufgaben.keine')}</span>}</dd>
            </dl>
          </section>
        )}
      <div className="knoepfe sammel-rechts">
        <Link to={ablage} className="knopf primaer">{t('werkbank.aufgaben.in-der-ablage-oeffnen')}</Link>
        {!a.erledigt && (
          <span className="sammel-ziel">
            <span className="klein">{t('werkbank.aufgaben.weitergeben-an-2')}</span>
            <BenutzerWahl label={t('werkbank.aufgaben.aufgabe-weitergeben-an', { text: a.text })} wert={an} setze={setAn} ohne={a.empfaengerId} />
            <button type="button" className="knopf" disabled={!an || sendet} onClick={() => void weitergeben()}>{t('werkbank.aufgaben.weitergeben')}</button>
          </span>
        )}
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}
