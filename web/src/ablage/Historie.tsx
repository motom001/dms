import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t, tn } from '../sprache';
import { AUFGABENARTEN, HISTORIENARTEN, HISTORIENGRUPPEN, historiengruppenVon, type Aufgabenart, type Feldaenderung, type Historieneintrag, type Mappentyp, type Register } from '../../../shared/src/model';
import { feldLabel } from '../../../shared/src/beschriftung';
import { api } from '../api';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { Person } from '../Person';
import { Formatiert } from './Formatiert';
import { gebietsschema } from '../../../shared/src/sprache';

/** Änderungshistorie einer Mappe (#57): je Eintrag eine Zeile, Einzelheiten zum Aufklappen (#80). */
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
const groesse = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * Bezeichnung eines geänderten Felds in der Sprache des Lesers (#729): aus dem Mappentyp, solange es das Feld gibt;
 * sonst die beim Ändern gespeicherte.
 */
const beschrifte = (a: Feldaenderung, typ?: Pick<Mappentyp, 'felder'>) => { const f = typ?.felder.find((x) => x.key === a.feld); return f && f.label === a.label ? feldLabel(f) : a.label; };

function kurz(e: Historieneintrag, typ?: Pick<Mappentyp, 'felder'>): string {
  const d = e.daten;
  if (d.aenderungen?.length) return d.aenderungen.map((a) => beschrifte(a, typ)).join(', ');
  if (e.art === 'post_geteilt' && typeof d.text === 'string') return d.text;
  // #820: im Verwaltungsmodus geöffnet, heruntergeladen … – nie ausgeblendet.
  if (e.art === 'verwaltungsmodus') return t.frei(`mappen.historie.verwaltungsmodus.${typeof d.was === 'string' ? d.was : 'angesehen'}`);
  if (d.dokument) return d.dokument;
  if (d.feld) return d.feld;
  if (typeof d.text === 'string') return d.text;
  return '';
}

/**
 * Einzelheiten eines Eintrags und ein kurzer Hinweis, wie viel dahintersteckt; null = nichts aufzuklappen.
 * Exportiert für den Test (#1010).
 */
export function einzelheiten(e: Historieneintrag, emailTyp: string | undefined, typ?: Pick<Mappentyp, 'felder'>): { hinweis: string; inhalt: ReactNode } | null {
  const d = e.daten;
  if (d.aenderungen?.length) {
    const n = d.aenderungen.length;
    return {
      hinweis: t('ablage.historie.felder', { anzahl: n }),
      inhalt: (
        <>
        {/* Anlass, z. B. die Umwandlung nach einem Paket-Update (#534). */}
        {str(d.text) && <p className="leise klein">{str(d.text)}</p>}
        <table className="aenderungen">
          <thead><tr><th>{t('ablage.historie.feld')}</th><th>{t('ablage.historie.vorher')}</th><th>{t('ablage.historie.nachher')}</th></tr></thead>
          <tbody>{d.aenderungen.map((a: Feldaenderung) => (
            <tr key={a.feld}><td>{beschrifte(a, typ)}</td>{a.geheim ? <td colSpan={2} className="leise">{t('ablage.historie.geaendert-passwort-ohne-werte')}</td> : <><td className={a.alt ? '' : 'leise'}>{a.alt || '–'}</td><td className={a.neu ? '' : 'leise'}>{a.neu || '–'}</td></>}</tr>
          ))}</tbody>
        </table>
        </>
      ),
    };
  }
  switch (e.art) {
    case 'notiz': {
      const alt = str(d.alt), neu = str(d.neu), voll = str(d.voll);
      if (alt !== undefined && neu !== undefined) return {
        hinweis: t('ablage.historie.vorher-nachher'),
        inhalt: <div className="vergleich"><div><p className="leise klein">{t('ablage.historie.vorher')}</p><Formatiert text={alt} /></div><div><p className="leise klein">{t('ablage.historie.nachher')}</p><Formatiert text={neu} /></div></div>,
      };
      if (voll) return { hinweis: t('ablage.historie.ganze-notiz'), inhalt: <div className="einzeln"><Formatiert text={voll} /></div> };
      return null;
    }
    case 'email': {
      const an = Array.isArray(d.an) ? (d.an as string[]) : undefined;
      if (!an) return null;
      const anhaenge = Array.isArray(d.anhaenge) ? (d.anhaenge as Array<{ name: string; groesse: number }>) : [];
      return {
        hinweis: anhaenge.length ? t('ablage.historie.anhaenge', { anzahl: anhaenge.length }) : t('ablage.historie.einzelheiten'),
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>{t('ablage.historie.an')}</dt><dd>{an.join(', ')}</dd>
            <dt>{t('ablage.historie.betreff')}</dt><dd>{str(d.betreff)}</dd>
            {str(d.nachricht) && <><dt>{t('ablage.historie.nachricht')}</dt><dd className="mehrzeilig">{str(d.nachricht)}</dd></>}
            {anhaenge.length > 0 && <><dt>{t('ablage.historie.anhaenge-2')}</dt><dd>{anhaenge.map((x) => `${x.name} (${groesse(x.groesse)})`).join(', ')}</dd></>}
            {emailTyp && str(d.email) && <><dt>{t('ablage.historie.e-mail')}</dt><dd><Link to={`/ablage/${emailTyp}/${str(d.email)}`} className="verweis">{t('ablage.historie.als-mappe-oeffnen')}</Link></dd></>}
          </dl>
        ),
      };
    }
    case 'uebernommen': {
      // Eingangskanal (#195): gleicher Inhalt wie in anderen Mappen.
      // Seit #333 nur noch die Anzahl (Titel fremder Mappen bleiben verborgen); die Fundstellen zeigt „Zuordnen“.
      if (typeof d.doppelt === 'number' && d.doppelt > 0) return { hinweis: t('ablage.historie.doppelt'), inhalt: <p>{t('ablage.historie.diese-datei-liegt-schon')}</p> };
      const gleich = Array.isArray(d.gleicherInhalt) ? (d.gleicherInhalt as Array<{ mappeId: string; titel: string; name: string }>) : [];
      if (!gleich.length) return null;
      return {
        hinweis: t('ablage.historie.gleicher-inhalt'),
        inhalt: <ul className="einzeln">{gleich.map((g) => <li key={g.mappeId}>{tn('ablage.historie.gleicher-inhalt-wie-in', { name: g.name, link: <Link to={`/ablage/eingang/${g.mappeId}`} className="verweis">{g.titel || t('ablage.historie.mappe')}</Link> })}</li>)}</ul>,
      };
    }
    case 'zugeordnet': {
      // Post (#192): Link zur Zielmappe bzw. zur Post. Aufgelöst mit abgetrenntem Teil (#936, #1010): dazu der Link
      // zur neuen Post; sie hat den Typ der aufgelösten Post.
      const ziel = str(d.ziel) ?? str(d.post);
      const typ = str(d.zielTyp) ?? str(d.postTyp);
      const abgetrennt = d.aufgeloest === true ? str(d.abgetrennt) : undefined;
      const abgetrenntTyp = str(d.postTyp) ?? emailTyp;
      const links: { zu: string; text: string }[] = [];
      if (ziel && typ) links.push({ zu: `/ablage/${typ}/${ziel}`, text: str(d.ziel) ? t('ablage.historie.mappe-oeffnen') : t('ablage.historie.post-oeffnen') });
      if (abgetrennt && abgetrenntTyp) links.push({ zu: `/ablage/${abgetrenntTyp}/${abgetrennt}`, text: t('ablage.historie.abgetrennte-post-oeffnen') });
      if (!links.length) return null;
      return { hinweis: t('ablage.historie.oeffnen-2'), inhalt: <ul className="einzeln">{links.map((l) => <li key={l.zu}><Link to={l.zu} className="verweis">{l.text}</Link></li>)}</ul> };
    }
    case 'aufgabe': {
      const text = str(d.aufgabentext);
      if (!text) return null;
      const art = str(d.aufgabenart) as Aufgabenart | undefined;
      return {
        hinweis: t('ablage.historie.aufgabe'),
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>{t('ablage.historie.aufgabe')}</dt><dd className="mehrzeilig">{text}</dd>
            {art && AUFGABENARTEN[art] && <><dt>{t('ablage.historie.art')}</dt><dd>{AUFGABENARTEN[art]}</dd></>}
            {d.fuer !== undefined && <><dt>{t('ablage.historie.fuer')}</dt><dd>{d.fuer ? <Person id={str(d.fuer)} /> : t('konten.verwaltende.ohneEmpfaenger')}</dd></>}
            {d.anId !== undefined && <><dt>{t('ablage.historie.weitergegeben')}</dt><dd>{d.vonId ? <Person id={str(d.vonId)} /> : t('konten.verwaltende.ohneEmpfaenger')} → <Person id={str(d.anId)} /></dd></>}
          </dl>
        ),
      };
    }
    case 'dokument_version': {
      // Versionierung (#194): „Version 3 von Kassenbon gespeichert (ersetzt Kassenbon.jpg)“, „Version 1 zurückgeholt“.
      const nr = typeof d.version === 'number' ? d.version : null;
      return {
        hinweis: typeof d.zurueckgeholt === 'number' ? t('ablage.historie.version-zurueckgeholt', { zurueckgeholt: d.zurueckgeholt }) : t('ablage.historie.version', { wert: nr ?? '?' }),
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>{t('ablage.historie.datei')}</dt><dd>{d.dokument}{str(d.vorher) && str(d.vorher) !== d.dokument && <> {' '}{tn('ablage.historie.ersetzt', { str: str(d.vorher) })}</>}</dd>
            {nr && <><dt>{t('ablage.historie.version-2')}</dt><dd>{nr}{typeof d.zurueckgeholt === 'number' && <> {' '}{t('ablage.historie.version-zurueckgeholt-2', { zurueckgeholt: d.zurueckgeholt })}</>}</dd></>}
            {typeof d.groesse === 'number' && <><dt>{t('ablage.historie.groesse')}</dt><dd>{groesse(d.groesse)}</dd></>}
            {str(d.register) && <><dt>{t('ablage.historie.register')}</dt><dd>{str(d.register)}</dd></>}
          </dl>
        ),
      };
    }
    case 'dokument_hochgeladen': case 'dokument_geloescht': case 'dokument_papierkorb': {
      if (typeof d.groesse !== 'number') return null;
      return {
        hinweis: groesse(d.groesse),
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>{t('ablage.historie.datei')}</dt><dd>{d.dokument}</dd>
            <dt>{t('ablage.historie.groesse')}</dt><dd>{groesse(d.groesse)}</dd>
            {str(d.verkleinert) && <><dt>{t('ablage.historie.verkleinert')}</dt><dd>{str(d.verkleinert)}</dd></>}
            {str(d.mime) && <><dt>{t('ablage.historie.typ')}</dt><dd>{str(d.mime)}</dd></>}
            {str(d.register) && <><dt>{t('ablage.historie.register')}</dt><dd>{str(d.register)}</dd></>}
          </dl>
        ),
      };
    }
    case 'pdf_bearbeitet': {
      // PDF bearbeiten (#335): was geändert wurde bzw. was zusammengefügt wurde.
      const quellen = Array.isArray(d.zusammengefuegt) ? (d.zusammengefuegt as string[]) : [];
      return {
        hinweis: quellen.length ? t('ablage.historie.zusammengefuegt', { quellen: quellen.length }) : t('ablage.historie.einzelheiten'),
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>{t('ablage.historie.datei')}</dt><dd>{d.dokument}</dd>
            {str(d.text) && <><dt>{t('ablage.historie.was')}</dt><dd>{str(d.text)}</dd></>}
            {typeof d.seiten === 'number' && <><dt>{t('ablage.historie.seiten')}</dt><dd>{typeof d.vorher === 'number' && d.vorher !== d.seiten ? `${d.vorher} → ` : ''}{d.seiten}</dd></>}
            {quellen.length > 0 && <><dt>{t('ablage.historie.aus')}</dt><dd>{quellen.join(', ')}</dd></>}
          </dl>
        ),
      };
    }
    case 'geschwaerzt': {
      // Schwärzen (#392): nur Zahlen – die Suchbegriffe und der geschwärzte Text stehen nirgends.
      return {
        hinweis: typeof d.stellen === 'number' ? t('ablage.historie.stellen', { anzahl: d.stellen }) : t('ablage.historie.einzelheiten'),
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>{t('ablage.historie.datei')}</dt><dd>{d.dokument}</dd>
            {str(d.quelle) && <><dt>{t('ablage.historie.aus')}</dt><dd>{str(d.quelle)}</dd></>}
            {typeof d.version === 'number' && <><dt>{t('ablage.historie.version-2')}</dt><dd>{d.version}</dd></>}
            {str(d.text) && <><dt>{t('ablage.historie.was')}</dt><dd>{str(d.text)}</dd></>}
          </dl>
        ),
      };
    }
    case 'auskunft': {
      // Auskunft nach Art. 15 DSGVO (#396): nur Zahlen, keine Inhalte; Begründungen für zurückgehaltene Notizen.
      const n = (k: string) => (typeof d[k] === 'number' ? d[k] as number : 0);
      // Zustellen (#455): per E-Mail, Abruf-Link, Abruf – Zeitpunkt und Ergebnis, ohne IP und ohne Code.
      const zustellung = str(d.zustellung);
      if (zustellung) {
        const an = Array.isArray(d.an) ? (d.an as unknown[]).filter((x): x is string => typeof x === 'string') : [];
        const wie = zustellung === 'email' ? t('ablage.historie.per-e-mail-verschluesselt') : zustellung === 'link' ? t('ablage.historie.abruf-link') : t('ablage.historie.abruf-ueber-den-link');
        return {
          hinweis: str(d.text) ?? wie,
          inhalt: (
            <dl className="eigenschaften einzeln">
              <dt>{t('ablage.historie.weg')}</dt><dd>{wie}</dd>
              {an.length > 0 && <><dt>{t('ablage.historie.an')}</dt><dd>{an.join(', ')}</dd></>}
              {typeof d.erfolg === 'boolean' && <><dt>{t('ablage.historie.ergebnis')}</dt><dd>{d.erfolg ? t('ablage.historie.erfolgreich') : t('ablage.historie.fehlgeschlagen')}</dd></>}
              {str(d.ablauf) && <><dt>{t('ablage.historie.gueltig-bis')}</dt><dd>{new Date(str(d.ablauf)!).toLocaleDateString(gebietsschema())}</dd></>}
              {n('maxAbrufe') > 0 && <><dt>{t('ablage.historie.abrufe')}</dt><dd>{t('ablage.historie.hoechstens', { n: n('maxAbrufe') })}</dd></>}
            </dl>
          ),
        };
      }
      const gruende = Array.isArray(d.gruende) ? (d.gruende as unknown[]).filter((g): g is string => typeof g === 'string') : [];
      return {
        hinweis: t('ablage.historie.mappen-dokumente', { n: n('mappen'), n2: n('dokumente') }),
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>{t('ablage.historie.mappen')}</dt><dd>{n('mappen')}</dd><dt>{t('ablage.historie.dokumente')}</dt><dd>{n('dokumente')}</dd>
            <dt>{t('ablage.historie.notizen')}</dt><dd>{n('notizen')}{n('ohneNotizen') ? t('ablage.historie.zurueckgehalten', { n: n('ohneNotizen') }) : ''}</dd>
            <dt>{t('ablage.historie.historie')}</dt><dd>{t('ablage.historie.von-mappen', { anzahl: n('historie') })}</dd>
            <dt>{t('ablage.historie.passwort')}</dt><dd>{d.verschluesselt ? t('ablage.historie.ja-aes-256') : t('ablage.historie.nein')}</dd>
            {gruende.length > 0 && <><dt>{t('ablage.historie.zurueckgehalten-weil')}</dt><dd><ul className="einzeln">{gruende.map((g, i) => <li key={i}>{g}</li>)}</ul></dd></>}
          </dl>
        ),
      };
    }
    case 'volltext': {
      // Texterkennung als Paket (#338): welches Paket den Volltext geschrieben hat.
      return { hinweis: str(d.dokument) ?? t('ablage.historie.volltext'), inhalt: <dl className="eigenschaften einzeln"><dt>{t('ablage.historie.datei')}</dt><dd>{str(d.dokument)}</dd>{str(d.text) && <><dt>{t('ablage.historie.von')}</dt><dd>{str(d.text)}</dd></>}</dl> };
    }
    case 'umgewandelt': {
      // Dateien umwandeln (#577): welches Paket aus welcher Datei welche Fassung gemacht hat; das Original bleibt.
      return { hinweis: str(d.dokument) ?? t('ablage.historie.fassung'), inhalt: <dl className="eigenschaften einzeln"><dt>{t('ablage.historie.datei')}</dt><dd>{str(d.dokument)}</dd>{str(d.text) && <><dt>{t('ablage.historie.fassung')}</dt><dd>{str(d.text)}</dd></>}</dl> };
    }
    case 'post_geteilt': {
      const typ = str(d.postTyp);
      const posten = Array.isArray(d.posten) ? (d.posten as string[]) : [];
      // Abgetrennt beim Auflösen (#936): Die Ausgangspost liegt im Papierkorb – der Link führt zur Mappe, die aus ihr wurde.
      if (str(d.ziel) && str(d.zielTyp)) return { hinweis: t('ablage.historie.oeffnen-2'), inhalt: <p className="einzeln"><Link to={`/ablage/${str(d.zielTyp)}/${str(d.ziel)}`} className="verweis">{t('ablage.historie.mappe-oeffnen')}</Link></p> };
      if (!typ) return null;
      // „Ab hier abtrennen“ (#934): Link zur neuen Post mit den abgetrennten Dokumenten.
      if (str(d.abgetrennt)) return { hinweis: t('ablage.historie.oeffnen-2'), inhalt: <p className="einzeln"><Link to={`/ablage/${typ}/${str(d.abgetrennt)}`} className="verweis">{t('ablage.historie.abgetrennte-post-oeffnen')}</Link></p> };
      if (posten.length) return { hinweis: t('ablage.historie.posts', { posten: posten.length }), inhalt: <ul className="einzeln">{posten.map((id, i) => <li key={id}><Link to={`/ablage/${typ}/${id}`} className="verweis">{t('ablage.historie.teil-oeffnen', { wert: i + 1 })}</Link></li>)}</ul> };
      if (str(d.post)) return { hinweis: t('ablage.historie.oeffnen-2'), inhalt: <p className="einzeln"><Link to={`/ablage/${typ}/${str(d.post)}`} className="verweis">{t('ablage.historie.ausgangspost-oeffnen')}</Link></p> };
      return null;
    }
    case 'heruntergeladen': case 'abruf_api': case 'abruf_webdav': {
      // Abrufe (#800): Weg, Datei bzw. Fassung; beim Export die Dateien der Mappe.
      const dateien = Array.isArray(d.dokumente) ? (d.dokumente as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      const fassung = str(d.fassung);
      const weg = str(d.weg) ?? (e.art === 'abruf_webdav' ? 'webdav' : e.art === 'abruf_api' ? 'api' : 'oberflaeche');
      return {
        hinweis: dateien.length ? t('ablage.historie.abruf-dateien', { anzahl: dateien.length }) : t.frei(`ablage.historie.abruf-fassung.${fassung ?? 'original'}`),
        inhalt: (
          <dl className="eigenschaften einzeln">
            <dt>{t('ablage.historie.weg')}</dt><dd>{t.frei(`ablage.historie.abruf-weg.${weg}`)}{str(d.schluessel) && <> {t('ablage.historie.abruf-schluessel', { name: str(d.schluessel)! })}</>}</dd>
            {dateien.length > 0
              ? <><dt>{t('ablage.historie.dateien')}</dt><dd>{dateien.join(', ')}</dd></>
              : <><dt>{t('ablage.historie.datei')}</dt><dd>{d.dokument}{str(d.datei) && <> {t('ablage.historie.abruf-als', { name: str(d.datei)! })}</>}</dd></>}
            {fassung && <><dt>{t('ablage.historie.fassung')}</dt><dd>{t.frei(`ablage.historie.abruf-fassung.${fassung}`)}{typeof d.version === 'number' && <> {d.version}</>}</dd></>}
            <dt>{t('ablage.historie.stempel')}</dt><dd>{d.gestempelt ? t('ablage.historie.mit-stempel') : t('ablage.historie.ohne-stempel')}</dd>
          </dl>
        ),
      };
    }
    case 'wiederhergestellt': {
      const n = typeof d.verweiseEntfallen === 'number' ? d.verweiseEntfallen : 0;
      if (!n) return null;
      return { hinweis: t('ablage.historie.verweise-entfallen', { anzahl: n }), inhalt: <p className="einzeln leise">{t('ablage.historie.verweise-zeigten-auf-mappen', { anzahl: n })}</p> };
    }
    default: return null;
  }
}

/** So viele Einträge lädt die Historie auf einmal (#800); „Weitere laden“ holt die nächsten. */
export const HISTORIE_SEITE = 100;

/**
 * Historie einer Mappe (#57). Seit #800 lädt sie erst, wenn man das Register öffnet, und seitenweise; sie zeigt, was
 * das Register „Historie“ zeigen soll (`register`, sonst die Vorauswahl). „Alles anzeigen“ zeigt jedem, der die Mappe
 * lesen darf, alle Einträge.
 */
export function Historie({ mappeId, stand, typ, register }: { mappeId: string; stand?: string; typ?: Pick<Mappentyp, 'felder'>; register?: Pick<Register, 'key' | 'zeigt'> }) {
  const d = useDaten();
  const [liste, setListe] = useState<Historieneintrag[] | null>(null);
  const [weitere, setWeitere] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [alles, setAlles] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const lauf = useRef(0);
  const emailTyp = d.typen.find((mappentyp) => mappentyp.system === 'post')?.id;
  // Blendet das Register etwas aus? Dann gibt es „Alles anzeigen“.
  const gefiltert = !!register && historiengruppenVon(register).length < Object.keys(HISTORIENGRUPPEN).length;
  const filter = gefiltert && !alles ? register!.key : undefined;
  const lade = (vor?: number) => {
    const nr = ++lauf.current;
    setLaedt(true);
    api.historie(mappeId, { register: filter, max: HISTORIE_SEITE, vor }).then((h) => {
      if (nr !== lauf.current) return;
      setListe((x) => (vor !== undefined && x ? [...x, ...h] : h)); setWeitere(h.length === HISTORIE_SEITE); setFehler(undefined); setLaedt(false);
    }, (e: Error) => { if (nr === lauf.current) { setFehler(e.message); setLaedt(false); } });
  };
  useEffect(() => { lade(); }, [mappeId, stand, filter]);
  if (fehler) return <div className="hinweis schlecht"><p>{fehler}</p></div>;
  if (!liste) return <p className="leise">{t('ablage.historie.lade')}</p>;
  const schalter = gefiltert && (
    <label className="haken klein historie-alles"><input type="checkbox" checked={alles} onChange={(e) => setAlles(e.target.checked)} />
      <span>{t('ablage.historie.alles-anzeigen')}</span></label>
  );
  if (!liste.length) return <>{schalter}<p className="leise">{t('ablage.historie.noch-keine-eintraege-die')}</p></>;
  const eintraege: Listeneintrag[] = liste.map((e) => {
    const x = einzelheiten(e, emailTyp, typ);
    return {
      id: e.id, wann: zeit(e.zeit),
      wer: <Person id={e.benutzerId} ersatz={typeof e.daten.system === 'string' ? e.daten.system : undefined} />,
      // Aus einer aufgelösten Post übernommen (#936): Eingang, Herkunft, Änderungen … der Post stehen jetzt hier.
      ...(typeof e.daten.ausPost === 'string' ? { zustand: <span className="chip" title={t('ablage.historie.aus-der-post-titel')}>{t('ablage.historie.aus-der-post')}</span> } : {}),
      was: <><strong>{HISTORIENARTEN[e.art] ?? e.art}</strong>{kurz(e, typ) ? `: ${kurz(e, typ)}` : ''}
        {e.art === 'email' && typeof e.daten.email === 'string' && emailTyp && <> · <Link to={`/ablage/${emailTyp}/${e.daten.email}`} className="verweis">{t('ablage.historie.oeffnen')}</Link></>}</>,
      ...(x ? { mehr: x.hinweis, inhalt: x.inhalt, label: t('ablage.historie.aufklappbar', { wert: HISTORIENARTEN[e.art] ?? e.art, hinweis: x.hinweis }) } : {}),
    };
  });
  return (
    <>
      {schalter}
      <Eintragsliste eintraege={eintraege} />
      {weitere && <p><button type="button" className="knopf klein" disabled={laedt} onClick={() => lade(liste[liste.length - 1].id)}>{laedt ? t('ablage.historie.lade') : t('ablage.historie.weitere-laden')}</button></p>}
    </>
  );
}

/** Ein Eintrag der Liste im Stil der Historie (#707): Zeile mit Zeit, wer, was, rechts Zähler; Einzelheiten zum Aufklappen. */
export interface Listeneintrag {
  id: string | number;
  wann: string;
  wer: ReactNode;
  was: ReactNode;
  /** Zustand o. Ä. als Chip vor dem Zähler (nicht nur über Farbe: immer mit Text). */
  zustand?: ReactNode;
  /** Zähler rechts, z. B. „3 Felder“, „3 Karten“. */
  mehr?: string;
  inhalt?: ReactNode;
  /** Name für Bildschirmleser, wenn aufklappbar. */
  label?: string;
  /** Immer offen, z. B. ein Lauf, der gerade läuft. */
  offen?: boolean;
}

/**
 * Liste wie die Historie einer Mappe (#57, #80): je Eintrag eine Zeile mit Pfeil, Datum und Uhrzeit, wer, Zusammenfassung
 * und Zähler; aufgeklappt die Einzelheiten; „Alle aufklappen“/„Alle zuklappen“. Auch für Verlauf und Änderungsverlauf
 * einer Automatisierung (#707), damit man sich überall gleich zurechtfindet.
 */
export function Eintragsliste({ eintraege }: { eintraege: Listeneintrag[] }) {
  const [alleOffen, setAlleOffen] = useState<boolean | null>(null);
  const aufklappbar = eintraege.some((x) => Boolean(x.inhalt));
  return (
    <>
      {aufklappbar && (
        <div className="historie-kopf">
          <button type="button" className="textknopf" onClick={() => setAlleOffen(true)}>{t('ablage.historie.alle-aufklappen')}</button>
          <button type="button" className="textknopf" onClick={() => setAlleOffen(false)}>{t('ablage.historie.alle-zuklappen')}</button>
        </div>
      )}
      <ul className="historie">
        {eintraege.map((x) => {
          const kopf = (
            <>
              <span className="zeichen" aria-hidden="true" />
              <span className="wann">{x.wann}</span>
              <span className="wer">{x.wer}</span>
              <span className="was">{x.was}</span>
              {x.zustand}
              {x.mehr && <span className="mehr chip">{x.mehr}</span>}
            </>
          );
          return (
            <li key={x.id}>
              {x.inhalt
                ? <details open={x.offen || (alleOffen ?? undefined)} key={String(alleOffen)}>
                    <summary aria-label={x.label}>{kopf}</summary>
                    <div className="einzelheiten">{x.inhalt}</div>
                  </details>
                : <div className="zeile">{kopf}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
