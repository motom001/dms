import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatiere, SYSTEMSPALTEN } from '../../../shared/src/model';
import { api, type DokumentImKorb, type PapierkorbEintrag } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Person } from '../Person';
import { Listenkopf } from '../Listenkopf';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { hinweis, rueckfrage } from '../rueckfrage';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { typName, feldLabel } from '../../../shared/src/beschriftung';
import { AnlageMarke } from './Anlagen';

/**
 * Papierkorb (#43). In der Ablage sieht jeder, was er selbst gelöscht hat; in der Werkbank
 * sehen Administratoren alles. Nach der eingestellten Aufbewahrung wird endgültig gelöscht.
 */

const GEAENDERT = 'dms:papierkorb';
const melde = () => dispatchEvent(new Event(GEAENDERT));
const datumZeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
const basis = (werkbank: boolean) => (werkbank ? '/werkbank/papierkorb' : '/ablage/papierkorb');

export function usePapierkorb(werkbank: boolean, aktiv = true) {
  const [eintraege, setEintraege] = useState<PapierkorbEintrag[] | null>(null);
  const [dokumente, setDokumente] = useState<DokumentImKorb[]>([]);
  const [tage, setTage] = useState<number | null>(null);
  const [historieTage, setHistorieTage] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      if (werkbank) { const r = await api.papierkorbWerkbank(); setEintraege(r.eintraege); setDokumente(r.dokumente ?? []); setTage(r.tage); setHistorieTage(r.historieTage); }
      else { const [m, dok] = await Promise.all([api.papierkorb(), api.papierkorbDokumente()]); setEintraege(m); setDokumente(dok); }
      setFehler(undefined);
    } catch (e) { setFehler((e as Error).message); }
  }, [werkbank]);
  useEffect(() => {
    if (!aktiv) return;
    // laden fängt Fehler selbst ab und zeigt sie (fehler); der Ereignis-Handler gibt kein Promise zurück (#1011).
    const neu = () => void laden();
    neu();
    addEventListener(GEAENDERT, neu);
    return () => removeEventListener(GEAENDERT, neu);
  }, [aktiv, laden]);
  return { eintraege, dokumente, tage, setTage, historieTage, setHistorieTage, fehler, laden };
}
export type PapierkorbZustand = ReturnType<typeof usePapierkorb>;

/** Aufbewahrung in Worten. */
export function aufbewahrung(tage: number | undefined | null) {
  if (!tage) return t('ablage.papierkorb.geloeschte-mappen-und-dokumente');
  return t('ablage.papierkorb.geloeschte-mappen-und-dokumente-2', { anzahl: tage });
}

export function PapierkorbListe({ z, werkbank, offen }: { z: PapierkorbZustand; werkbank: boolean; offen?: string }) {
  const d = useDaten();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string>();
  const tage = werkbank ? z.tage : d.zaehler.papierkorbTage;
  const liste = z.eintraege ?? [];
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

  async function leeren() {
    const was = [liste.length ? (t('ablage.papierkorb.mappen-samt-dokumenten', { anzahl: liste.length })) : '', z.dokumente.length ? (t('ablage.papierkorb.dokumente', { anzahl: z.dokumente.length })) : ''].filter(Boolean).join(` ${t('ablage.papierkorb.und')} `);
    if (!(await rueckfrage({ titel: t('ablage.papierkorb.leeren', { wert: werkbank ? t('ablage.papierkorb.den-ganzen-papierkorb-alle') : t('ablage.papierkorb.deinen-papierkorb') }), text: t('ablage.papierkorb.werden-endgueltig-geloescht', { anzahl: liste.length + z.dokumente.length, charAt: was.charAt(0).toUpperCase(), was: was.slice(1) }), ja: t('ablage.papierkorb.papierkorb-leeren'), gefahr: true }))) return;
    setLaeuft(true); setMeldung(undefined);
    try { await api.papierkorbLeeren(werkbank); melde(); await d.neuLaden(); geheZu(basis(werkbank)); }
    catch (e) { setMeldung((e as Error).message); }
    finally { setLaeuft(false); }
  }

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

  // Mit verknüpften Mappen gelöscht (#424): Mappen eines Vorgangs gehören zusammen.
  const imVorgang = new Map<string, number>();
  for (const e of liste) if (e.vorgang) imVorgang.set(e.vorgang, (imVorgang.get(e.vorgang) ?? 0) + 1);
  const vorgangChip = (e: PapierkorbEintrag) => {
    const n = e.vorgang ? imVorgang.get(e.vorgang) ?? 0 : 0;
    return n > 1 ? <span className="chip lb-chip" title={t('ablage.papierkorb.zusammen-mit-weiteren-mappen', { wert: n - 1 })}>{e.id === e.vorgang ? t('ablage.papierkorb.mit-verknuepften', { wert: n - 1 }) : t('ablage.papierkorb.verknuepft')}</span> : null;
  };
  // Aufgelöste Post (#936): in welche Mappe – in der Tabelle mit Link, in der kompakten Liste nur als Text (der Eintrag ist selbst ein Link).
  const aufgeloest = (e: PapierkorbEintrag, mitLink: boolean) => {
    const a = e.aufgeloestIn;
    if (!a) return null;
    const typ = d.typ(a.typId);
    const ziel = mitLink && a.da ? <Link to={`/ablage/${a.typId}/${a.id}`} className="verweis">{titelOder(a.titel)}</Link> : titelOder(a.titel);
    return <span className="leise klein">{tn('ablage.papierkorb.aufgeloest-in', { typ: typ ? typName(typ) : '', link: ziel })}</span>;
  };
  const tabelle = breite >= spalten.length * 110;
  const leerenKnopf = liste.length + z.dokumente.length > 0
    ? <button type="button" className="knopf klein" disabled={laeuft} onClick={() => void leeren()}>{laeuft ? t('ablage.papierkorb.leere') : t('ablage.papierkorb.papierkorb-leeren')}</button> : null;
  return (
    <>
      <div ref={mess} className="breitenmesser" aria-hidden="true" />
      <Listenkopf titel={t('ablage.papierkorb.papierkorb')} hilfe={werkbank ? 'werkbank.papierkorb' : 'ablage.papierkorb'}
        beschreibung={<>{werkbank ? t('ablage.papierkorb.was-alle-benutzer-geloescht') : t('ablage.papierkorb.was-du-geloescht-hast')}{aufbewahrung(tage)}</>}>
        {!werkbank && leerenKnopf}
      </Listenkopf>
      {/* Werkbank (#366): Aufbewahrung und Leeren gehören zusammen, oben in der Mitte. */}
      {werkbank && <PapierkorbEinstellungen z={z} leeren={leerenKnopf} />}
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {meldung && <div className="hinweis schlecht"><p>{meldung}</p></div>}
      <div className="listenrumpf">
      {z.eintraege === null
        ? <p className="leise">{t('ablage.papierkorb.lade')}</p>
        : !liste.length && !z.dokumente.length
          ? <p className="leise leerliste">{t('ablage.papierkorb.der-papierkorb-ist-leer')}</p>
          : !liste.length ? <DokumenteImKorb z={z} werkbank={werkbank} /> : <>
              <p className="listenzahl leise klein">{liste.length} {t('ablage.papierkorb.mappen', { anzahl: liste.length })}{z.dokumente.length ? t('ablage.papierkorb.dokumente-unten', { anzahl: z.dokumente.length }) : ''}</p>
              {!tabelle && (
                <ul className="mappenliste">
                  {liste.map((e) => (
                    <li key={e.id}>
                      <Link to={`${basis(werkbank)}/${e.id}`} className={`eintrag ${offen === e.id ? 'an' : ''}`}>
                        <span className="titel">{titelOder(e.titel)}{vorgangChip(e)}</span>
                        <span className="unter">{t('ablage.papierkorb.geloescht-2', { wert: d.typ(e.typId)?.name ?? '', datumZeit: datumZeit(e.geloescht), wert2: werkbank ? t('ablage.papierkorb.von', { person: d.person(e.geloeschtVon) }) : '' })}</span>
                        {aufgeloest(e, false)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {tabelle && <div className="trefferliste">
                <table>
                  <thead><tr>{spalten.map(([n]) => <th key={n}>{n}</th>)}</tr></thead>
                  <tbody>
                    {liste.map((e) => {
                      const ziel = `${basis(werkbank)}/${e.id}`;
                      return (
                        <tr key={e.id} className={offen === e.id ? 'an' : ''} onClick={(ev) => { if (!(ev.target as HTMLElement).closest('a')) geheZu(ziel); }}>
                          {spalten.map(([n, wert], i) => (
                            <td key={n} className={n === 'Gelöscht' || n === SYSTEMSPALTEN._erstellt || n === SYSTEMSPALTEN._geaendert ? 'kurz' : ''}>
                              {i === 1 ? <><Link to={ziel}>{wert(e)}</Link>{vorgangChip(e)}{e.aufgeloestIn && <> {aufgeloest(e, true)}</>}</> : wert(e)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>}
              <DokumenteImKorb z={z} werkbank={werkbank} />
            </>}
      </div>
    </>
  );
}

/** Einzelne Dokumente im Papierkorb (#344): Art „Dokument“, aus welcher Mappe und welchem Register; direkt wiederherstellen. */
function DokumenteImKorb({ z, werkbank }: { z: PapierkorbZustand; werkbank: boolean }) {
  const d = useDaten();
  const [laeuft, setLaeuft] = useState<string>();
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: ReactNode }>();
  if (!z.dokumente.length) return null;
  async function zurueck(x: DokumentImKorb) {
    setLaeuft(x.id); setMeldung(undefined);
    try {
      const r = await api.dokumentWiederherstellen(x.id, werkbank);
      melde(); await d.neuLaden();
      setMeldung({ art: 'gut', text: <>{tn('ablage.papierkorb.liegt-wieder-in-register', { name: x.name, link: <Link to={`/ablage/${r.typId}/${x.mappeId}`} className="verweis">{titelOder(x.mappeTitel)}</Link>, register: x.register })}</> });
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setLaeuft(undefined); }
  }
  async function weg(x: DokumentImKorb) {
    if (!(await rueckfrage({ titel: t('ablage.papierkorb.endgueltig-loeschen', { name: x.name, wert: x.versionen ? t('ablage.papierkorb.mit-allen-versionen', { wert: x.versionen + 1 }) : '' }), text: t('ablage.papierkorb.das-laesst-sich-nicht'), ja: t('ablage.papierkorb.endgueltig-loeschen-2'), gefahr: true }))) return;
    setLaeuft(x.id); setMeldung(undefined);
    try { await api.dokumentEndgueltig(x.id, werkbank); melde(); await d.neuLaden(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setLaeuft(undefined); }
  }
  return (
    <section className="korbdokumente">
      <h2 className="h3">{t('ablage.papierkorb.dokumente-2')}</h2>
      <p className="listenzahl leise klein">{t('ablage.papierkorb.dokumente-einzeln-aus-einer', { anzahl: z.dokumente.length })}</p>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <ul className="mappenliste">
        {z.dokumente.map((x) => (
          <li key={x.id} className="korbdokument">
            <div className="eintrag">
              <span className="titel"><span className="chip" title={t('ablage.papierkorb.art')}>{t('ablage.papierkorb.dokument')}</span> {x.name} <AnlageMarke d={x} /></span>
              <span className="unter">
                {tn('ablage.papierkorb.aus-register-geloescht', { wert: x.mappe === 'da' ? <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{titelOder(x.mappeTitel)}</Link> : titelOder(x.mappeTitel), register: x.register, groesseText: groesseText(x.groesse), wert2: x.versionen ? t('ablage.papierkorb.versionen', { wert: x.versionen + 1 }) : '', datumZeit: datumZeit(x.geloescht), wert3: werkbank ? t('ablage.papierkorb.von', { person: d.person(x.geloeschtVon) }) : '' })}</span>
              {x.mappe === 'papierkorb' && <span className="leise klein">{t('ablage.papierkorb.die-mappe-liegt-selbst')}</span>}
              {x.mappe === 'weg' && <span className="leise klein">{t('ablage.papierkorb.die-mappe-gibt-es')}</span>}
            </div>
            <div className="knoepfe">
              <button type="button" className="knopf klein" disabled={!!laeuft || x.mappe !== 'da'} onClick={() => void zurueck(x)}>{laeuft === x.id ? '…' : t('ablage.papierkorb.wiederherstellen')}</button>
              <button type="button" className="textknopf gefahr" disabled={!!laeuft} onClick={() => void weg(x)}>{t('ablage.papierkorb.endgueltig-loeschen-2')}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const groesseText = (b: number) => (b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB`);

/** Eine Mappe im Papierkorb: ansehen, wiederherstellen, endgültig löschen. */
export function PapierkorbDetail({ id, werkbank }: { id: string; werkbank: boolean }) {
  const d = useDaten();
  const [e, setE] = useState<PapierkorbEintrag | null | 'fehlt'>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [gruppe, setGruppe] = useState<PapierkorbEintrag[] | null>(null);
  useEffect(() => {
    setE(null);
    api.papierkorbEintrag(id, werkbank).then((x) => {
      setE(x);
      // Vorgang (#424): die anderen Mappen, die zusammen gelöscht wurden.
      if (x.vorgang) (werkbank ? api.papierkorbWerkbank().then((r) => r.eintraege) : api.papierkorb()).then(setGruppe, () => setGruppe([]));
    }, () => setE('fehlt'));
  }, [id, werkbank]);

  if (e === null) return <p className="leise">{t('ablage.papierkorb.lade')}</p>;
  if (e === 'fehlt') return <div className="leer"><p>{t('ablage.papierkorb.diese-mappe-liegt-nicht')}</p></div>;
  const typ = d.typ(e.typId);
  const zusammen = e.vorgang ? (gruppe ?? []).filter((x) => x.vorgang === e.vorgang) : [];

  async function alleWiederherstellen() {
    if (!e || e === 'fehlt' || !e.vorgang) return;
    setLaeuft('alle'); setMeldung(undefined);
    try {
      const r = await api.vorgangWiederherstellen(e.vorgang, werkbank);
      melde(); await d.neuLaden();
      await hinweis({ titel: t('ablage.papierkorb.wiederhergestellt'), text: t('ablage.papierkorb.mappen-samt-dokumenten-2', { anzahl: r.mappen, wert: r.verweiseWieder ? t('ablage.papierkorb.entfernte-verweise-sind-wieder', { anzahl: r.verweiseWieder }) : '', wert2: r.verweiseEntfallen ? t('ablage.papierkorb.verweise-auf-mappen-die', { anzahl: r.verweiseEntfallen }) : '' }) });
      const start = r.startId ? zusammen.find((x) => x.id === r.startId) : undefined;
      geheZu(start ? `/ablage/${start.typId}/${start.id}` : basis(werkbank));
    } catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }

  async function wiederherstellen() {
    setLaeuft('zurueck'); setMeldung(undefined);
    try {
      const r = await api.wiederherstellen(id, werkbank);
      melde(); await d.neuLaden();
      // Nach den Berechtigungen nicht mehr sichtbar (#126): Bescheid sagen und in den Papierkorb zurück.
      if (r.hinweis) { await hinweis({ titel: t('ablage.papierkorb.wiederhergestellt'), text: r.hinweis }); geheZu(basis(werkbank)); return; }
      // Passt sie nicht mehr (z. B. eindeutiger Wert inzwischen vergeben), zeigt die Mappe selbst den Grund.
      geheZu(`/ablage/${r.mappe.passt === false ? 'eingang' : r.mappe.typId}/${r.mappe.id}`);
    } catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }
  async function endgueltig() {
    if (!(await rueckfrage({ titel: t('ablage.papierkorb.endgueltig-loeschen-3', { titelOder: titelOder(e && e !== 'fehlt' ? e.titel : '') }), text: t('ablage.papierkorb.das-laesst-sich-nicht'), ja: t('ablage.papierkorb.endgueltig-loeschen-2'), gefahr: true }))) return;
    setLaeuft('weg'); setMeldung(undefined);
    try { await api.endgueltigLoeschen(id, werkbank); melde(); await d.neuLaden(); geheZu(basis(werkbank)); }
    catch (x) { setMeldung((x as Error).message); setLaeuft(null); }
  }

  const felder = (typ?.felder ?? []).filter((f) => f.typ !== 'passwort');
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('ablage.papierkorb.im-papierkorb', { wert: typ ? typName(typ) : t('ablage.papierkorb.mappe') })}</p>
        <h1>{titelOder(e.titel)}</h1>
        <dl className="index">
          <div><dt>{t('ablage.papierkorb.geloescht')}</dt><dd>{datumZeit(e.geloescht)}{werkbank && <> {' '}{t('ablage.papierkorb.von-2')}{' '}<Person id={e.geloeschtVon} /></>}</dd></div>
          <div><dt>{t('ablage.papierkorb.angelegt')}</dt><dd>{t('ablage.papierkorb.von-3', { datumZeit: datumZeit(e.erstellt) })}{' '}<Person id={e.erstelltVon} /></dd></div>
          <div><dt>{t('ablage.papierkorb.zuletzt-geaendert')}</dt><dd>{t('ablage.papierkorb.von-3', { datumZeit: datumZeit(e.geaendert) })}{' '}<Person id={e.geaendertVon} /></dd></div>
        </dl>
      </div>
      <section className="blatt">
        <dl className="eigenschaften">
          {felder.map((f) => {
            const v = e.werte[f.key];
            const text = f.typ === 'referenz'
              ? (Array.isArray(v) ? v.length : v ? 1 : 0) ? t('ablage.papierkorb.verknuepfte-mappen', { anzahl: Array.isArray(v) ? v.length : 1 }) : ''
              // Zusammengesetzt (#1050): ohne die Titel verwiesener Mappen – wie die Verweise hier.
              : formatiere(f, v, () => '', { felder, werte: e.werte });
            return <div key={f.key} style={{ display: 'contents' }}><dt>{feldLabel(f)}</dt><dd>{text || <span className="leise">–</span>}</dd></div>;
          })}
          <dt>{t('ablage.papierkorb.dokumente-2')}</dt><dd>{e.dokumente || <span className="leise">{t('ablage.papierkorb.keine')}</span>}</dd>
        </dl>
      </section>
      {zusammen.length > 1 && (
        <div className="hinweis info"><p>
          {zusammen.some((x) => x.id === x.vorgang) ? t('ablage.papierkorb.zusammen-geloescht-von', { anzahl: zusammen.length - 1, titel: titelOder(zusammen.find((x) => x.id === x.vorgang)!.titel) }) : t('ablage.papierkorb.zusammen-geloescht', { anzahl: zusammen.length - 1 })}{tn('ablage.papierkorb.holt-alle-zurueck-samt', { b: <strong>{t('ablage.papierkorb.alle-wiederherstellen')}</strong> })}</p></div>
      )}
      {/* Aufgelöste Post (#936): kein Wiederherstellen – der Weg zurück ist, die neue Mappe zu löschen. */}
      {e.aufgeloestIn
        ? <div className="hinweis info"><p>{tn('ablage.papierkorb.aufgeloest-in', { typ: d.typ(e.aufgeloestIn.typId) ? typName(d.typ(e.aufgeloestIn.typId)!) : '', link: e.aufgeloestIn.da ? <Link to={`/ablage/${e.aufgeloestIn.typId}/${e.aufgeloestIn.id}`} className="verweis">{titelOder(e.aufgeloestIn.titel)}</Link> : titelOder(e.aufgeloestIn.titel) })}{' '}{t('ablage.papierkorb.aufgeloest-zurueck')}</p></div>
        : <p className="leise klein">{t('ablage.papierkorb.beim-wiederherstellen-kommen')}</p>}
      {meldung && <div className="hinweis schlecht"><p>{meldung}</p></div>}
      <div className="knoepfe">
        <button type="button" className="knopf" disabled={!!laeuft} onClick={() => void endgueltig()}>{laeuft === 'weg' ? t('ablage.papierkorb.loesche') : t('ablage.papierkorb.endgueltig-loeschen-2')}</button>
        {!e.aufgeloestIn && <button type="button" className={`knopf ${zusammen.length > 1 ? '' : 'gruen'}`} disabled={!!laeuft} onClick={() => void wiederherstellen()}>{laeuft === 'zurueck' ? t('ablage.papierkorb.stelle-wieder-her') : zusammen.length > 1 ? t('ablage.papierkorb.nur-diese-wiederherstellen') : t('ablage.papierkorb.wiederherstellen')}</button>}
        {zusammen.length > 1 && <button type="button" className="knopf gruen" disabled={!!laeuft} onClick={() => void alleWiederherstellen()}>{laeuft === 'alle' ? t('ablage.papierkorb.stelle-wieder-her') : t('ablage.papierkorb.alle-wiederherstellen-2', { zusammen: zusammen.length })}</button>}
      </div>
    </div>
  );
}

/** Werkbank: Aufbewahrung einstellen und Papierkorb leeren (#366: oben in der Mitte). */
function PapierkorbEinstellungen({ z, leeren }: { z: PapierkorbZustand; leeren?: ReactNode }) {
  const d = useDaten();
  const [tage, setTage] = useState(String(z.tage ?? ''));
  const [hTage, setHTage] = useState(String(z.historieTage ?? ''));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { if (z.tage !== null) setTage(String(z.tage)); }, [z.tage]);
  useEffect(() => { if (z.historieTage !== null) setHTage(String(z.historieTage)); }, [z.historieTage]);
  const n = Number(tage);
  const h = Number(hTage);
  const ent = useEntwurf({ tage: String(z.tage), hTage: String(z.historieTage) }, { tage, hTage }, {
    aus: z.tage === null, zuruecksetzen: () => { setTage(String(z.tage)); setHTage(String(z.historieTage)); setMeldung(undefined); },
  });
  async function speichern() {
    const anzahl = (z.eintraege?.length ?? 0) + z.dokumente.length;
    if (n === 0 && anzahl && !(await rueckfrage({ titel: t('ablage.papierkorb.papierkorb-ausschalten'), text: t('ablage.papierkorb.alle-eintraege-darin-werden', { anzahl }), ja: t('ablage.papierkorb.ausschalten-und-leeren'), gefahr: true }))) return;
    try {
      const r = await api.papierkorbTage({ tage: n, historieTage: h });
      z.setTage(r.tage); z.setHistorieTage(r.historieTage); melde(); await d.neuLaden();
      setMeldung({ art: 'gut', text: t('ablage.papierkorb.gespeichert', { wert: r.geleert ? t('ablage.papierkorb.mappen-endgueltig-geloescht', { anzahl: r.geleert }) : '' }) });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
      <form className="blatt" id="aufbewahrung" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <div className="blattkopf zeile-zwischen"><h2 className="h3">{t('ablage.papierkorb.aufbewahrung')}</h2>{leeren}</div>
        <label className="eigenschaft"><span>{tn('ablage.papierkorb.tage', { klein: <small>{t('ablage.papierkorb.0-kein-papierkorb-loeschen')}</small> })}</span>
          <input type="number" min={0} max={3650} value={tage} onChange={(ev) => { setTage(ev.target.value); setMeldung(undefined); }} /></label>
        <p className="leise klein">{t('ablage.papierkorb.geloeschte-mappen-und-einzeln')}</p>
        <label className="eigenschaft"><span>{tn('ablage.papierkorb.historie-endgueltig-geloeschter', { klein: <small>{t('ablage.papierkorb.tage-danach-wird-ihre')}</small> })}</span>
          <input type="number" min={0} max={36500} value={hTage} onChange={(ev) => { setHTage(ev.target.value); setMeldung(undefined); }} /></label>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <Speicherleiste ent={ent} gegenstand={t('ablage.papierkorb.aufbewahrung')} ungueltig={!Number.isInteger(n) || n < 0 || !Number.isInteger(h) || h < 0} />
      </form>
  );
}
