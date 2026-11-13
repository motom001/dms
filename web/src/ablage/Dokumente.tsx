import { Vorschaubild } from './Vorschaubild';
import { PdfSeiten } from './PdfSeiten';
import { LeerseitenBlock, useLeerseiten } from './Leerseiten';
import { Link } from '../ort';
import { Fundstellen, fundstellenFuer } from './Doppelt';
import { useMappenZiel } from './NeuePost';
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { HERKUNFT, MAX_DATEIGROESSE, OCR_STAENDE, type Mappentyp, type Mappe, type Dokument, type DokumentVersion, type Herkunft, type OcrStand, type Register } from '../../../shared/src/model';
import { spracheAusInfo, sprachname } from '../../../shared/src/textsprache';
import { herkunftText } from '../volltext';
import { Uebersetzbar } from './Uebersetzung';
import { volltextHerkunft } from '../../../shared/src/volltext';
import { fassungAusInfo } from '../../../shared/src/dateiumwandlung';
import { t, tn } from '../sprache';
import { api, archivfassungUrl, dokumentUrl, fassungUrl, versionUrl, type Fundstelle } from '../api';
import { pdfaName, type ArchivStand } from '../../../shared/src/archivfassung';
import { namensvorschlag } from '../../../shared/src/entsperren';
import { useDaten } from '../daten';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';
import { Symbol } from '../Symbol';
import { useKonto } from '../konto';
import { rueckfrage } from '../rueckfrage';
import { StempelDialog } from './Stempel';
import { PdfVerkleinern } from './PdfVerkleinern';
import { Schwaerzen } from './Schwaerzen';
import { kannSchwaerzen } from '../../../shared/src/schwaerzen';
import { kannStempeln } from '../../../shared/src/stempel';
import { gebietsschema, sprache } from '../../../shared/src/sprache';
import { registerName } from '../../../shared/src/beschriftung';
import { Knopf } from '../bausteine';
import { anlagenVon, eingangsreihenfolge, gruppiere } from '../../../shared/src/anlagen';
import { AlsAnlage, AnlageMarke, AnlageZeile, HerunterladenMitAnlagen } from './Anlagen';

/** „Verkleinern“ (#393) erst ab dieser Größe anbieten – kleinere PDFs lohnen die Mühe kaum. */
const VERKLEINERN_AB = 500 * 1024;

/**
 * Dokumentenregister: hochladen (übernommen mit „Mappe speichern“), ansehen direkt unter der
 * Zeile (#85), sortieren (#86), mehrere auswählen und gemeinsam herunterladen oder löschen (#87).
 */

/** Eine Datei, die erst beim Speichern der Mappe hochgeladen wird. */
/** gleicherName (#194): was mit einem Dokument gleichen Namens im Register passiert. */
export interface NeueDatei { uid: string; datei: File; register: string; gleicherName?: 'zaehler' | 'version' | 'ersetzen' }

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
export const groesse = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/** Reihenfolgen der Dokumente (#86); gemerkt je Benutzer für alle Dokumentenregister. */
export const DOKUMENT_SORTIERUNGEN = {
  name: t('ablage.dokumente.name-a-z'), name_ab: t('ablage.dokumente.name-z-a'), neu: t('ablage.dokumente.neueste-zuerst'), alt: t('ablage.dokumente.aelteste-zuerst'), gross: t('ablage.dokumente.groesste-zuerst'),
} as const;
export type Dokumentsortierung = keyof typeof DOKUMENT_SORTIERUNGEN;
const natuerlich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** Sortierte Kopie; bei Gleichstand nach Name, dann nach Id (stabil). */
export function sortiereDokumente(liste: Dokument[], s: Dokumentsortierung): Dokument[] {
  const name = (a: Dokument, b: Dokument) => natuerlich.compare(a.name, b.name) || a.id.localeCompare(b.id);
  const vergleich: Record<Dokumentsortierung, (a: Dokument, b: Dokument) => number> = {
    name, name_ab: (a, b) => -name(a, b),
    neu: (a, b) => b.erstellt.localeCompare(a.erstellt) || name(a, b),
    alt: (a, b) => a.erstellt.localeCompare(b.erstellt) || name(a, b),
    gross: (a, b) => b.groesse - a.groesse || name(a, b),
  };
  return [...liste].sort(vergleich[s]);
}

const HINWEIS_MEHRFACH = 'dms:mehrere-herunterladen-gesehen';

export function Dokumente({ register, dokumente: roh, neue, entfernt, hinzufuegen, entferne, entferneMehrere, vergiss, nurLesen, setzeNeue, neuLaden, post, typ, mappeTitel = '', mitnehmen = true }: {
  register: Register; dokumente: Dokument[]; neue: NeueDatei[]; entfernt: string[];
  /** Ohne Recht „Bearbeiten“ (#126): nur ansehen und herunterladen. */
  nurLesen?: boolean;
  hinzufuegen(d: File[]): void; entferne(id: string): void; entferneMehrere(ids: string[]): void; vergiss(uid: string): void;
  /** Gleicher Name (#194): Wahl je neuer Datei. */
  setzeNeue?(uid: string, patch: Partial<NeueDatei>): void;
  /** Nach Ersetzen und Zurückholen (#194) – sofort, ohne „Mappe speichern“. */
  neuLaden?(): Promise<void>;
  /** Dokumente einer Post (#335): Teilen erzeugt neue Posts. */
  post?: boolean;
  /** Stempel beim Weitergeben (#394): Einstellung des Mappentyps, Titel für {mappe}. */
  typ?: Mappentyp; mappeTitel?: string;
  /**
   * Exportrecht (#723): Herunterladen ist Mitnehmen und braucht E. Ohne E bleiben die Dokumente zum Ansehen;
   * Herunterladen, Teilen und Kopien mit Stempel gibt es dann nicht – „Warum nicht?“ erklärt es an der Leiste.
   */
  mitnehmen?: boolean;
}) {
  const [stempelOffen, setStempelOffen] = useState<{ id: string; version?: number }>();
  const stempelPflicht = typ?.stempel?.modus === 'pflicht';
  const versioniert = !!register.versionierung;
  // Doppelte Dateien (#333): je neuer Datei einmal nachsehen, ob es sie schon gibt.
  const [doppelt, setDoppelt] = useState<Record<string, Fundstelle[]>>({});
  const geprueft = useRef(new Set<string>());
  const eigeneMappe = roh[0]?.mappeId;
  useEffect(() => {
    const offen = neue.filter((n) => !geprueft.current.has(n.uid));
    if (!offen.length) return;
    for (const n of offen) geprueft.current.add(n.uid);
    void fundstellenFuer(offen, eigeneMappe).then((m) => {
      if (m.size) setDoppelt((d) => ({ ...d, ...Object.fromEntries([...m].map(([n, f]) => [n.uid, f.filter((x) => x.mappeId !== eigeneMappe)]).filter(([, f]) => f.length)) }));
    });
  }, [neue, eigeneMappe]);
  const [versionenOffen, setVersionenOffen] = useState<string>();
  // Archivnummer (#345): direkt speichern, ohne „Mappe speichern“.
  const [asn, setAsn] = useState<{ id: string; wert: string; fehler?: string } | null>(null);
  async function speichereAsn() {
    if (!asn) return;
    try { await api.setzeArchivnummer(asn.id, asn.wert); setAsn(null); await neuLaden?.(); }
    catch (e) { setAsn({ ...asn, fehler: (e as Error).message }); }
  }
  const [ersetzeId, setErsetzeId] = useState<string>();
  const [versionFehler, setVersionFehler] = useState<string>();
  const ersetzFeld = useRef<HTMLInputElement>(null);
  async function ersetze(datei: File) {
    const id = ersetzeId; setErsetzeId(undefined);
    if (!id) return;
    setVersionFehler(undefined);
    if (datei.size > MAX_DATEIGROESSE) { setVersionFehler(t('ablage.dokumente.ist-zu-gross-ueber', { name: datei.name })); return; }
    try { await api.ersetzen(id, datei); await neuLaden?.(); } catch (e) { setVersionFehler((e as Error).message); }
  }
  const d = useDaten();
  // PDF bearbeiten (#335): Seitenansicht je Dokument, Zusammenfügen der Auswahl.
  const [seitenOffen, setSeitenOffen] = useState<string>();
  const [kleinOffen, setKleinOffen] = useState<string>();
  const [schwarzOffen, setSchwarzOffen] = useState<string>();
  const [pdfMeldung, setPdfMeldung] = useState<ReactNode>();
  const [zusammen, setZusammen] = useState<{ name: string; entfernen: boolean; laeuft?: boolean; fehler?: string } | null>(null);
  const bearbeitbar = !nurLesen && !!neuLaden;
  const auswahlFeld = useRef<HTMLInputElement>(null);
  const [ziehen, setZiehen] = useState(false);
  const [zuGross, setZuGross] = useState<string[]>([]);
  // ?dokument=… (#345: Sprung über die Archivnummer) zeigt dieses Dokument gleich an.
  const [ansicht, setAnsicht] = useState<string | undefined>(() => { const w = new URLSearchParams(location.search).get('dokument'); return roh.some((x) => x.id === w && ansichtVon(x, false)) ? w! : undefined; });
  // Archivfassung (#631): Dokumente, bei denen jemand „Original anzeigen“ gewählt hat.
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const offenRef = useRef<HTMLLIElement>(null);
  const sortierung = (d.einstellungen.dokumente_sortierung as Dokumentsortierung | undefined) ?? 'name';
  // Post (#999): in der Reihenfolge des Eingangs – bei einer E-Mail so, wie die Anhänge in ihr stehen; nie nach Namen.
  const dokumente = post ? eingangsreihenfolge(roh) : sortiereDokumente(roh, sortierung in DOKUMENT_SORTIERUNGEN ? sortierung : 'name');
  // Anlagen (#998): eingeklappt unter ihrem Hauptdokument, in ihrer Reihenfolge; sortiert werden nur Hauptdokumente.
  const reihe = gruppiere(dokumente).flatMap((g) => [g.haupt, ...g.anlagen]);
  const roh0 = roh;
  const hauptVon = (x: Dokument) => (x.anlageZu ? roh.find((y) => y.id === x.anlageZu) : undefined);
  const [alsAnlage, setAlsAnlage] = useState<string>();
  const anlagenFertig = async (m?: string) => { setAlsAnlage(undefined); if (m) setPdfMeldung(m); await neuLaden?.(); };
  // „Post ab hier teilen“ (#999): dieses Hauptdokument und alle danach (samt Anlagen) kommen als neue Post nach „Neue Post“.
  const hauptReihe = reihe.filter((y) => !hauptVon(y) && !entfernt.includes(y.id));
  async function postTeilenAb(x: Dokument) {
    const ab = hauptReihe.findIndex((y) => y.id === x.id);
    if (ab <= 0) return;
    const weg = hauptReihe.slice(ab);
    if (!(await rueckfrage({ titel: t('ablage.dokumente.post-teilen-ab-frage', { name: x.name }), text: t('ablage.dokumente.post-teilen-ab-text', { anzahl: weg.length }), ja: t('ablage.dokumente.post-teilen-ab') }))) return;
    setPdfMeldung(undefined); setVersionFehler(undefined);
    try {
      const r = await api.postAbtrennen(x.mappeId, weg.map((y) => y.id));
      setPdfMeldung(<>{t('ablage.dokumente.post-geteilt', { anzahl: weg.length })}{' '}<Link to={`/ablage/${r.neu.typId}/${r.neu.id}`} className="verweis">{String(r.neu.werte.betreff ?? t('ablage.dokumente.post'))}</Link></>);
      await neuLaden?.();
    } catch (e) { setVersionFehler((e as Error).message); }
  }
  const teilenAbKnopf = (x: Dokument, weg: boolean) => post && bearbeitbar && !weg && hauptReihe.findIndex((y) => y.id === x.id) > 0
    ? <Knopf art="link" title={t('ablage.dokumente.post-teilen-ab-titel')} onClick={() => postTeilenAb(x)}>{t('ablage.dokumente.post-teilen-ab')}</Knopf> : null;
  // Leerseiten (#997): nur an der Post – Seitenleiste mit „Doch behalten“ / „Auch weglassen“.
  const leer = useLeerseiten(post ? roh : []);
  // Auswahl (#87): je Register; verschwindet mit dem Register bzw. der Mappe (eigene Instanz).
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [anker, setAnker] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const waehlbar = dokumente.filter((x) => !entfernt.includes(x.id));
  const auswahl = waehlbar.filter((x) => gewaehlt.has(x.id));
  const pdfAuswahl = auswahl.filter((x) => x.mime === 'application/pdf');

  async function pdfFertig(r: { dokumente: Dokument[]; posten: Mappe[] }) {
    setSeitenOffen(undefined);
    setPdfMeldung(r.posten.length
      ? <>{t('ablage.dokumente.neue-posts-angelegt', { posten: r.posten.length })}{' '}{r.posten.map((p, i) => <span key={p.id}>{i > 0 && ', '}<Link to={`/ablage/${p.typId}/${p.id}`} className="verweis">{String(p.werte.betreff ?? t('ablage.dokumente.post'))}</Link></span>)}{t('ablage.dokumente.diese-post-ist-erledigt')}</>
      : r.dokumente.length > 1 ? t('ablage.dokumente.in-dokumente-geteilt', { dokumente: r.dokumente.length }) : t('ablage.dokumente.gespeichert', { name: r.dokumente[0]?.name, wert: versioniert ? t('ablage.dokumente.version', { wert: r.dokumente[0]?.version ?? 1 }) : '' }));
    await neuLaden?.();
  }
  async function fuegeZusammen() {
    if (!zusammen) return;
    const ohneKorb = !d.zaehler.papierkorbTage;
    if (zusammen.entfernen && ohneKorb && !(await rueckfrage({ titel: t('ablage.dokumente.ausgangsdokumente-endgueltig'), text: t('ablage.dokumente.der-papierkorb-ist-ausgeschaltet', { pdfAuswahl: pdfAuswahl.length }), ja: t('ablage.dokumente.zusammenfuegen-und-loeschen'), gefahr: true }))) return;
    setZusammen({ ...zusammen, laeuft: true, fehler: undefined });
    try {
      const r = await api.fuegePdfZusammen({ dokumente: pdfAuswahl.map((x) => x.id), name: zusammen.name.trim() || undefined, register: register.key, originaleEntfernen: zusammen.entfernen, bestaetigt: zusammen.entfernen && ohneKorb });
      setZusammen(null); setGewaehlt(new Set());
      setPdfMeldung(t('ablage.dokumente.pdfs-zu-zusammengefuegt', { pdfAuswahl: pdfAuswahl.length, name: r.dokument.name }));
      await neuLaden?.();
    } catch (e) { setZusammen((z) => z && { ...z, laeuft: false, fehler: (e as Error).message }); }
  }

  // Texterkennung (#45): Stand nachladen, solange etwas wartet oder läuft.
  const [ocr, setOcr] = useState<Record<string, OcrStand | undefined>>({});
  // Sprachen und Hinweis „Post teilen?“ (#579) kommen mit dem Ergebnis des Pakets – mit dem Stand nachgeladen.
  const [frisch, setFrisch] = useState<Record<string, Pick<Dokument, 'sprache' | 'weitereSprachen' | 'teilenAb'>>>({});
  const [teilenWeg, setTeilenWeg] = useState<Set<string>>(new Set());
  const [teilVorschlag, setTeilVorschlag] = useState<{ id: string; ab: number }>();
  const mitFrisch = (x: Dokument): Dokument => (frisch[x.id] ? { ...x, ...frisch[x.id] } : x);
  async function teilenAusblenden(id: string) {
    setTeilenWeg((w) => new Set(w).add(id));
    try { await api.teilenHinweisAus(id); } catch { /* bleibt ausgeblendet bis zum Neuladen */ }
  }
  const [text, setText] = useState<{ id: string; text: string | null } | null>(null);
  const standVon = (x: Dokument) => ocr[x.id] ?? x.ocr;
  // Wartet es auf das Paket, nur solange eins installiert ist (#459: ohne Paket wartet es, bis eins kommt).
  const offen = dokumente.some((x) => { const s = standVon(x)?.stand; const h = volltextHerkunft(standVon(x)); return s === 'wartet' || s === 'laeuft' || (h?.art === 'wartet' && !!h.paket) || h?.art === 'umwandlung' || h?.art === 'volltext'; });
  useEffect(() => {
    if (!offen || !dokumente.length) return;
    const timer = setTimeout(() => {
      void api.mappe(dokumente[0].mappeId).then((m) => {
        setOcr(Object.fromEntries(m.dokumente.map((x) => [x.id, x.ocr])));
        setFrisch(Object.fromEntries(m.dokumente.map((x) => [x.id, { sprache: x.sprache, weitereSprachen: x.weitereSprachen, teilenAb: x.teilenAb }])));
      }, () => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [offen, ocr, dokumente.length]); // eslint-disable-line react-hooks/exhaustive-deps -- Nachfrage nur neu planen, wenn sich Texterkennung oder Dokumentzahl ändern
  async function erneut(id: string) {
    try { const x = await api.texterkennungErneut(id); setOcr((o) => ({ ...o, [id]: x.ocr })); } catch { /* bleibt */ }
  }
  async function zeigeText(id: string) {
    if (text?.id === id) { setText(null); return; }
    try { setText({ id, text: (await api.volltext(id)).text }); } catch { setText({ id, text: null }); }
  }

  /** Anlage (#998): eingeklappte Zeile unter ihrem Hauptdokument; geht mit ihm, wenn es entfernt wird. */
  const anlageZeile = (x: Dokument, haupt: Dokument) => {
    const aWeg = entfernt.includes(x.id) || entfernt.includes(haupt.id);
    const aSicht = ansichtVon(x, original.has(x.id));
    const aAuf = x.id === ansicht && !aWeg;
    return <AnlageZeile key={x.id} a={x} haupt={haupt} auf={aAuf} weg={aWeg} bearbeitbar={bearbeitbar} erste={anlagenVon(roh0, haupt.id)[0]?.id === x.id}
      umschalten={aSicht ? () => umschalten(x) : undefined} fertig={anlagenFertig}
      herunterladen={!aWeg && !stempelPflicht && mitnehmen ? <Herunterladen x={x} archiv={aSicht?.art === 'archiv'} /> : undefined}
      vorschau={<div className="dokansicht" ref={aAuf ? (el) => { if (el) el.scrollIntoView({ block: 'nearest' }); } : undefined}>
        {aSicht && <AnsichtKopf x={x} art={aSicht.art} umschalten={() => { const n = new Set(original); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); setOriginal(n); }} />}
        {aSicht?.pdf ? <iframe src={aSicht.url} title={x.name} /> : <img src={aSicht?.url ?? dokumentUrl(x.id)} alt={x.name} />}
      </div>} />;
  };

  // Die geöffnete Anzeige steht direkt unter ihrer Zeile und wird sichtbar gescrollt (#85).
  useEffect(() => {
    if (ansicht) offenRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ansicht]);
  // Handy (#505): kein eingebetteter Rahmen – Tippen öffnet das Dokument im Vollbild (Anzeige des Browsers, Zwei-Finger-Zoom, Zurück mit einem Tipp).
  const handy = useHandy();
  const [menue, setMenue] = useState<string>();
  const umschalten = (x: Dokument) => {
    const v = ansichtVon(x, original.has(x.id));
    if (!v || entfernt.includes(x.id)) return;
    if (handy) { location.assign(v.url); return; }
    setAnsicht(x.id === ansicht ? undefined : x.id);
  };
  const zeilenKlick = (x: Dokument, e: MouseEvent) => {
    // Knöpfe, Links, Kästchen, der Volltext und die Dialoge (Seiten, Verkleinern, Schwärzen) behalten ihre eigene Funktion.
    if ((e.target as HTMLElement).closest('a, button, input, label, pre, .dokansicht, .pdfseiten, .leerseiten, .hy-schleier, .dk-blatt, form')) return;
    umschalten(x);
  };

  function waehle(x: Dokument, an: boolean, bereich: boolean) {
    const n = new Set(gewaehlt);
    if (bereich && anker) {
      const i = waehlbar.findIndex((y) => y.id === anker), j = waehlbar.findIndex((y) => y.id === x.id);
      if (i >= 0 && j >= 0) for (const y of waehlbar.slice(Math.min(i, j), Math.max(i, j) + 1)) { if (an) n.add(y.id); else n.delete(y.id); }
    } else if (an) n.add(x.id); else n.delete(x.id);
    setGewaehlt(n); setAnker(x.id);
  }
  function alleHerunterladen() {
    let ersterMal = false;
    try { ersterMal = auswahl.length > 1 && !localStorage.getItem(HINWEIS_MEHRFACH); localStorage.setItem(HINWEIS_MEHRFACH, '1'); } catch { /* egal */ }
    setHinweis(ersterMal ? t('ablage.dokumente.dein-browser-fragt-beim') : undefined);
    // Nacheinander, mit kleinem Abstand – sonst verwerfen manche Browser einen Teil.
    auswahl.forEach((x, i) => setTimeout(() => {
      const a = document.createElement('a');
      a.href = dokumentUrl(x.id, true); a.download = x.name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
    }, i * 400));
  }
  function auswahlLoeschen() {
    entferneMehrere(auswahl.map((x) => x.id));
    if (ansicht && gewaehlt.has(ansicht)) setAnsicht(undefined);
    setGewaehlt(new Set());
  }

  function nimm(liste: FileList | File[]) {
    const alle = [...liste];
    const gross = alle.filter((f) => f.size > MAX_DATEIGROESSE);
    setZuGross(gross.map((f) => f.name));
    hinzufuegen(alle.filter((f) => f.size <= MAX_DATEIGROESSE && f.size > 0));
  }
  const fallen = (e: DragEvent) => { e.preventDefault(); setZiehen(false); nimm(e.dataTransfer.files); };
  // Ablegen irgendwo im Fenster (#193): diese Mappe ist dann ein Ziel neben „als neue Post“.
  useMappenZiel(nurLesen ? null : { name: registerName(register), nimm });
  const alleAn = waehlbar.length > 0 && auswahl.length === waehlbar.length;

  return (
    <div className="dokumente">
      {!nurLesen && <div className={`ablagezone ${ziehen ? 'zieht' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setZiehen(true); }} onDragLeave={() => setZiehen(false)} onDrop={fallen}>
        <p>{t('ablage.dokumente.dateien-hierher-ziehen-oder')}{' '}<button type="button" className="textknopf" onClick={() => auswahlFeld.current?.click()}>{t('ablage.dokumente.auswaehlen')}</button></p>
        <p className="leise klein">{t('ablage.dokumente.bis-100-mb-je')}</p>
        <input ref={auswahlFeld} type="file" multiple hidden onChange={(e) => { if (e.target.files) nimm(e.target.files); e.target.value = ''; }} />
      </div>}
      {zuGross.length > 0 && <div className="hinweis schlecht"><p>{t('ablage.dokumente.zu-gross-ueber-100', { zuGross: zuGross.join(', ') })}</p></div>}
      <input ref={ersetzFeld} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ersetze(f); else setErsetzeId(undefined); }} />
      {versionFehler && <div className="hinweis schlecht"><p>{versionFehler}</p></div>}
      {dokumente.length + neue.length === 0
        ? <p className="leise">{t('ablage.dokumente.noch-keine-dokumente-in', { name: registerName(register) })}</p>
        : <>
            {dokumente.length > 0 && (
              <div className="dokleiste">
                <label className="haken klein"><input type="checkbox" checked={alleAn} disabled={!waehlbar.length}
                  ref={(el) => { if (el) el.indeterminate = auswahl.length > 0 && !alleAn; }}
                  onChange={() => setGewaehlt(alleAn ? new Set() : new Set(waehlbar.map((x) => x.id)))} />
                  <span>{auswahl.length ? t('ablage.dokumente.von-ausgewaehlt', { auswahl: auswahl.length, waehlbar: waehlbar.length }) : t('ablage.dokumente.alle-auswaehlen')}</span></label>
                <Hilfe ort="dokumente.mehrere" />
                {!mitnehmen && <NichtHerunterladen />}
                {auswahl.length > 0 && <>
                  {mitnehmen && <button type="button" className="knopf klein" onClick={alleHerunterladen} disabled={stempelPflicht}
                    title={stempelPflicht ? t('ablage.dokumente.dieser-mappentyp-verlangt-beim') : undefined}>{t('ablage.dokumente.herunterladen')}</button>}
                  {bearbeitbar && pdfAuswahl.length >= 2 && <button type="button" className="knopf klein" aria-expanded={!!zusammen}
                    onClick={() => setZusammen(zusammen ? null : { name: pdfAuswahl[0].name, entfernen: false })}>{t('ablage.dokumente.zusammenfuegen')}</button>}
                  {!nurLesen && <button type="button" className="knopf klein" onClick={auswahlLoeschen}>{t('ablage.dokumente.loeschen')}</button>}
                </>}
                {post
                  ? <span className="sortwahl klein leise">{t('ablage.dokumente.eingangsreihenfolge')}</span>
                  : <label className="sortwahl klein"><span className="leise">{t('ablage.dokumente.sortieren')}</span>
                      <select value={sortierung} onChange={(e) => d.setzeEinstellung('dokumente_sortierung', e.target.value === 'name' ? null : e.target.value)}>
                        {Object.entries(DOKUMENT_SORTIERUNGEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select></label>}
                <Hilfe ort="dokumente.sortieren" />
              </div>
            )}
            {hinweis && <div className="hinweis info"><p>{hinweis}</p></div>}
            {zusammen && pdfAuswahl.length >= 2 && (
              <div className="zusammenfuegen" role="group" aria-label={t('ablage.dokumente.pdfs-zusammenfuegen')}>
                <span className="klein">{t('ablage.dokumente.pdfs-in-der-reihenfolge', { pdfAuswahl: pdfAuswahl.length })}</span>
                <label className="eigenschaft klein"><span>{t('ablage.dokumente.name')}</span><input value={zusammen.name} onChange={(e) => setZusammen({ ...zusammen, name: e.target.value })} /></label>
                <label className="haken klein"><input type="checkbox" checked={zusammen.entfernen} onChange={(e) => setZusammen({ ...zusammen, entfernen: e.target.checked })} />
                  <span>{t('ablage.dokumente.ausgangsdokumente', { wert: d.zaehler.papierkorbTage ? t('ablage.dokumente.in-den-papierkorb-legen') : t('ablage.dokumente.loeschen-endgueltig') })}</span></label>
                <button type="button" className="knopf primaer klein" disabled={zusammen.laeuft} onClick={() => void fuegeZusammen()}>{zusammen.laeuft ? t('ablage.dokumente.wird-zusammengefuegt') : t('ablage.dokumente.zusammenfuegen')}</button>
                <button type="button" className="knopf klein" disabled={zusammen.laeuft} onClick={() => setZusammen(null)}>{t('ablage.dokumente.abbrechen')}</button>
                <Hilfe ort="dokumente.seiten" />
                {zusammen.fehler && <div className="hinweis schlecht"><p>{zusammen.fehler}</p></div>}
              </div>
            )}
            {pdfMeldung && <div className="hinweis gut"><p>{pdfMeldung}</p></div>}
            <ul className="dokumentliste">
              {neue.map((n) => (
                <li key={n.uid} className="neu">
                  <div className="dokzeile">
                    <div className="dokname">
                      <span>{n.datei.name} <span className="chip gut">{t('ablage.dokumente.neu')}</span></span>
                      <span className="leise klein">{t('ablage.dokumente.wird-beim-speichern-hochgeladen', { groesse: groesse(n.datei.size) })}</span>
                      {doppelt[n.uid] && <span className="hinweis warn doppelthinweis"><Fundstellen f={doppelt[n.uid]} /> {' '}{t('ablage.dokumente.beim-speichern-wird-sie')}</span>}
                      {/* Gleicher Name wie ein vorhandenes Dokument (#194): nachfragen. */}
                      {(() => {
                        const gleich = dokumente.find((x) => !entfernt.includes(x.id) && x.name.toLowerCase() === n.datei.name.toLowerCase());
                        if (!gleich || !setzeNeue) return null;
                        const wahl = n.gleicherName ?? (versioniert ? 'version' : 'zaehler');
                        return (
                          <label className="eigenschaft klein gleichername"><span>{t('ablage.dokumente.es-gibt-schon', { name: gleich.name })}</span>
                            <select value={wahl} onChange={(e) => setzeNeue(n.uid, { gleicherName: e.target.value as NeueDatei['gleicherName'] })}>
                              {versioniert && <option value="version">{t('ablage.dokumente.als-neue-version-von', { name: gleich.name })}</option>}
                              <option value="zaehler">{t('ablage.dokumente.als-eigenes-dokument-mit', { mitZaehler: mitZaehler(n.datei.name) })}</option>
                              {!versioniert && <option value="ersetzen">{t('ablage.dokumente.altes-dokument-loeschen-und')}</option>}
                            </select></label>
                        );
                      })()}
                    </div>
                    <div className="zeilenaktionen"><button type="button" className="textknopf" onClick={() => vergiss(n.uid)}>{t('ablage.dokumente.nicht-hochladen')}</button></div>
                  </div>
                </li>
              ))}
              {reihe.map((roh) => {
                const x = mitFrisch(roh);
                const haupt = hauptVon(x);
                if (haupt) return anlageZeile(x, haupt);
                const anlagen = anlagenVon(roh0, x.id);
                const ziele = reihe.filter((y) => !y.anlageZu && y.id !== x.id && !entfernt.includes(y.id));
                const weg = entfernt.includes(x.id);
                // Hinweis „Post teilen?“ (#579): nur an der Post, nur für PDFs, nur wer teilen darf – nie von selbst.
                const teilenHinweis = post && bearbeitbar && !weg && x.mime === 'application/pdf' && !!x.teilenAb && !teilenWeg.has(x.id) && seitenOffen !== x.id;
                const auf = x.id === ansicht && !weg;
                // Anzeige (#631): Archivfassung → Lesefassung → Original.
                const sicht = ansichtVon(x, original.has(x.id));
                const klickbar = !!sicht && !weg;
                return (
                  <li key={x.id} ref={auf ? offenRef : undefined} className={`${auf ? 'an' : ''} ${weg ? 'weg' : ''} ${klickbar ? 'klickbar' : ''} ${gewaehlt.has(x.id) && !weg ? 'gewaehlt' : ''}`}
                    onClick={(e) => zeilenKlick(x, e)}>
                    <div className="dokzeile">
                      <input type="checkbox" className="dokwahl" aria-label={t('ablage.dokumente.auswaehlen-2', { name: x.name })} disabled={weg} checked={gewaehlt.has(x.id) && !weg}
                        onClick={(e) => waehle(x, (e.target as HTMLInputElement).checked, e.shiftKey)} onChange={() => {}} />
                      <Vorschaubild d={x} />
                      <div className="dokname">
                        {klickbar
                          ? <button type="button" className="textknopf" aria-expanded={auf} onClick={() => umschalten(x)}>{x.name}</button>
                          : <span className="dateiname">{x.name}</span>}
                        <AnlageMarke d={x} />
                        <span className="leise klein">{weg ? (d.zaehler.papierkorbTage ? t('ablage.dokumente.kommt-beim-speichern-in') : t('ablage.dokumente.wird-beim-speichern-endgueltig')) : <>{groesse(x.groesse)} · {zeit(x.erstellt)} · <Person id={x.erstelltVon} />
                          {(versioniert || (x.version ?? 1) > 1) && <> · <button type="button" className="textknopf klein" aria-expanded={versionenOffen === x.id} onClick={() => setVersionenOffen(versionenOffen === x.id ? undefined : x.id)}>{t('ablage.dokumente.version-2', { wert: x.version ?? 1 })}</button></>}</>}</span>
                        {!weg && (x.archivnummer || asn?.id === x.id) && (asn?.id === x.id
                          ? <form className="asnform" onSubmit={(e) => { e.preventDefault(); void speichereAsn(); }}>
                              <label className="klein"><span className="sr">{t('ablage.dokumente.archivnummer')}</span>
                                <input autoFocus value={asn.wert} maxLength={40} placeholder="z. B. A-000123" onChange={(e) => setAsn({ ...asn, wert: e.target.value, fehler: undefined })} /></label>
                              <button className="knopf klein primaer">{t('ablage.dokumente.uebernehmen')}</button>
                              <button type="button" className="textknopf klein" onClick={() => setAsn(null)}>{t('ablage.dokumente.abbrechen')}</button>
                              <Hilfe ort="dokumente.archivnummer" />
                              {asn.fehler && <span className="fehlertext klein">{asn.fehler}</span>}
                            </form>
                          : <span className="klein">{tn('ablage.dokumente.archivnummer-2', { b: <strong className="mono">{x.archivnummer}</strong> })}{!nurLesen && neuLaden && <> · <button type="button" className="textknopf klein" onClick={() => setAsn({ id: x.id, wert: x.archivnummer ?? '' })}>{t('ablage.dokumente.aendern')}</button></>}</span>)}
                        {!weg && versionenOffen === x.id && <Versionen d={x} zurueck={!nurLesen && versioniert} neuLaden={neuLaden} mitnehmen={mitnehmen}
                          mitStempel={stempelPflicht && kannStempeln(x.mime) ? (n) => setStempelOffen({ id: x.id, version: n }) : undefined} />}
                        {!weg && <OcrAnzeige id={x.id} s={standVon(x)} sprache={x.sprache} weitere={x.weitereSprachen} erneut={() => void erneut(x.id)} neu={nurLesen ? undefined : () => void erneut(x.id)} text={() => void zeigeText(x.id)} textOffen={text?.id === x.id} />}
                        {!weg && <ArchivAnzeige s={x.archivfassung} />}
                        {!weg && x.pdfSchutz && <PdfSchutzAnzeige x={x} betreff={mappeTitel} fertig={() => void neuLaden?.()} />}
                        {!weg && text?.id === x.id && (text.text
                          ? <Uebersetzbar quelle={{ art: 'volltext', dokument: x.id }} original={text.text} darstellen={(v) => <pre className="volltext">{v}</pre>}><pre className="volltext">{text.text}</pre></Uebersetzbar>
                          : <pre className="volltext">{t('ablage.dokumente.kein-volltext-vorhanden')}</pre>)}
                      </div>
                      {handy ? (
                        <div className="zeilenaktionen dk-handy">
                          {klickbar && <a className="knopf primaer dk-gross" href={sicht!.url} aria-label={t('ablage.dokumente.oeffnen', { name: x.name })}>{t('ablage.dokumente.oeffnen-2')}</a>}
                          {!weg && !stempelPflicht && mitnehmen && <DokTeilen d={x} />}
                          <button type="button" className="knopf dk-gross dk-mehr" aria-haspopup="menu" aria-expanded={menue === x.id} aria-label={t('ablage.dokumente.weitere-aktionen-fuer', { name: x.name })} onClick={() => setMenue(x.id)}>⋯</button>
                          {menue === x.id && <>
                            <div className="hy-schleier" aria-hidden="true" onClick={() => setMenue(undefined)} />
                            <div className="dk-blatt" role="menu" aria-label={t('ablage.dokumente.aktionen-fuer', { name: x.name })} onClick={(e) => { if ((e.target as HTMLElement).closest('a, button')) setMenue(undefined); }}>
                              <p className="dk-titel">{x.name}</p>
                        {!weg && !stempelPflicht && mitnehmen && (anlagen.length
                          ? <HerunterladenMitAnlagen d={x} anlagen={anlagen} archiv={sicht?.art === 'archiv'} ohne={<Herunterladen x={x} archiv={sicht?.art === 'archiv'} />} />
                          : <Herunterladen x={x} archiv={sicht?.art === 'archiv'} />)}
                        {bearbeitbar && !weg && !x.anlageZu && ziele.length > 0 && <Knopf art="link" aria-expanded={alsAnlage === x.id} title={t('ablage.anlagen.als-anlage-knopf-titel')}
                          onClick={() => setAlsAnlage(alsAnlage === x.id ? undefined : x.id)}>{t('ablage.anlagen.als-anlage-knopf')}</Knopf>}
                        {teilenAbKnopf(x, weg)}
                        {!weg && mitnehmen && kannStempeln(x.mime) && typ && <button type="button" className="textknopf" aria-expanded={stempelOffen?.id === x.id && !stempelOffen.version}
                          title={t('ablage.dokumente.eine-kopie-mit-stempel')}
                          onClick={() => setStempelOffen(stempelOffen?.id === x.id && !stempelOffen.version ? undefined : { id: x.id })}>{stempelPflicht ? t('ablage.dokumente.herunterladen-mit-stempel') : t('ablage.dokumente.mit-stempel')}</button>}
                        {bearbeitbar && !weg && x.mime === 'application/pdf' && <button type="button" className="textknopf" aria-expanded={seitenOffen === x.id}
                          onClick={() => { setPdfMeldung(undefined); setKleinOffen(undefined); setSchwarzOffen(undefined); setSeitenOffen(seitenOffen === x.id ? undefined : x.id); }} title={t('ablage.dokumente.seiten-drehen-loeschen-umsortieren')}>{t('ablage.dokumente.seiten')}</button>}
                        {!weg && (mitnehmen || bearbeitbar) && x.mime === 'application/pdf' && x.groesse >= VERKLEINERN_AB && <button type="button" className="textknopf" aria-expanded={kleinOffen === x.id}
                          onClick={() => { setPdfMeldung(undefined); setSeitenOffen(undefined); setSchwarzOffen(undefined); setKleinOffen(kleinOffen === x.id ? undefined : x.id); }} title={t('ablage.dokumente.bilder-im-pdf-herunterrechnen')}>{t('ablage.dokumente.verkleinern')}</button>}
                        {bearbeitbar && !weg && kannSchwaerzen(x.mime) && <button type="button" className="textknopf" aria-expanded={schwarzOffen === x.id}
                          onClick={() => { setPdfMeldung(undefined); setSeitenOffen(undefined); setKleinOffen(undefined); setSchwarzOffen(schwarzOffen === x.id ? undefined : x.id); }} title={t('ablage.dokumente.stellen-endgueltig-schwaerzen-als')}>{t('ablage.dokumente.schwaerzen')}</button>}
                        {!weg && !nurLesen && neuLaden && !x.archivnummer && asn?.id !== x.id && <button type="button" className="textknopf" title={t('ablage.dokumente.nummer-vom-aufkleber-auf')} onClick={() => setAsn({ id: x.id, wert: '' })}>{t('ablage.dokumente.archivnummer')}</button>}
                        {!nurLesen && versioniert && !weg && <button type="button" className="textknopf" onClick={() => { setErsetzeId(x.id); ersetzFeld.current?.click(); }} title={t('ablage.dokumente.neue-version-hochladen-die')}>{t('ablage.dokumente.ersetzen')}</button>}
                        {!nurLesen && <Knopf art="link" className={weg ? undefined : 'gefahr'} onClick={async () => {
                          // Mit allen Versionen (#194): nachfragen, mit Zahl.
                          if (!weg && (x.aeltere ?? 0) > 0 && !(await rueckfrage({ titel: t('ablage.dokumente.mit-allen-versionen-loeschen', { name: x.name, wert: (x.aeltere ?? 0) + 1 }), text: d.zaehler.papierkorbTage ? t('ablage.dokumente.sie-kommen-beim-speichern') : t('ablage.dokumente.das-ist-endgueltig'), ja: t('ablage.dokumente.loeschen'), gefahr: true }))) return;
                          entferne(x.id);
                        }}>{weg ? t('ablage.dokumente.behalten') : t('ablage.dokumente.loeschen')}</Knopf>}

                              <button type="button" className="textknopf dk-zu">{t('ablage.dokumente.schliessen')}</button>
                            </div>
                          </>}
                        </div>
                      ) : (
                      <div className="zeilenaktionen">
                        {klickbar && <a className="symbolverweis" href={sicht!.url} target="_blank" rel="noreferrer" title={t('ablage.dokumente.in-neuem-tab-oeffnen')} aria-label={t('ablage.dokumente.in-neuem-tab-oeffnen-2', { name: x.name })}>↗</a>}
                        {!weg && !stempelPflicht && mitnehmen && (anlagen.length
                          ? <HerunterladenMitAnlagen d={x} anlagen={anlagen} archiv={sicht?.art === 'archiv'} ohne={<Herunterladen x={x} archiv={sicht?.art === 'archiv'} />} />
                          : <Herunterladen x={x} archiv={sicht?.art === 'archiv'} />)}
                        {bearbeitbar && !weg && !x.anlageZu && ziele.length > 0 && <Knopf art="link" aria-expanded={alsAnlage === x.id} title={t('ablage.anlagen.als-anlage-knopf-titel')}
                          onClick={() => setAlsAnlage(alsAnlage === x.id ? undefined : x.id)}>{t('ablage.anlagen.als-anlage-knopf')}</Knopf>}
                        {teilenAbKnopf(x, weg)}
                        {!weg && mitnehmen && kannStempeln(x.mime) && typ && <button type="button" className="textknopf" aria-expanded={stempelOffen?.id === x.id && !stempelOffen.version}
                          title={t('ablage.dokumente.eine-kopie-mit-stempel')}
                          onClick={() => setStempelOffen(stempelOffen?.id === x.id && !stempelOffen.version ? undefined : { id: x.id })}>{stempelPflicht ? t('ablage.dokumente.herunterladen-mit-stempel') : t('ablage.dokumente.mit-stempel')}</button>}
                        {bearbeitbar && !weg && x.mime === 'application/pdf' && <button type="button" className="textknopf" aria-expanded={seitenOffen === x.id}
                          onClick={() => { setPdfMeldung(undefined); setKleinOffen(undefined); setSchwarzOffen(undefined); setSeitenOffen(seitenOffen === x.id ? undefined : x.id); }} title={t('ablage.dokumente.seiten-drehen-loeschen-umsortieren')}>{t('ablage.dokumente.seiten')}</button>}
                        {!weg && (mitnehmen || bearbeitbar) && x.mime === 'application/pdf' && x.groesse >= VERKLEINERN_AB && <button type="button" className="textknopf" aria-expanded={kleinOffen === x.id}
                          onClick={() => { setPdfMeldung(undefined); setSeitenOffen(undefined); setSchwarzOffen(undefined); setKleinOffen(kleinOffen === x.id ? undefined : x.id); }} title={t('ablage.dokumente.bilder-im-pdf-herunterrechnen')}>{t('ablage.dokumente.verkleinern')}</button>}
                        {bearbeitbar && !weg && kannSchwaerzen(x.mime) && <button type="button" className="textknopf" aria-expanded={schwarzOffen === x.id}
                          onClick={() => { setPdfMeldung(undefined); setSeitenOffen(undefined); setKleinOffen(undefined); setSchwarzOffen(schwarzOffen === x.id ? undefined : x.id); }} title={t('ablage.dokumente.stellen-endgueltig-schwaerzen-als')}>{t('ablage.dokumente.schwaerzen')}</button>}
                        {!weg && !nurLesen && neuLaden && !x.archivnummer && asn?.id !== x.id && <button type="button" className="textknopf" title={t('ablage.dokumente.nummer-vom-aufkleber-auf')} onClick={() => setAsn({ id: x.id, wert: '' })}>{t('ablage.dokumente.archivnummer')}</button>}
                        {!nurLesen && versioniert && !weg && <button type="button" className="textknopf" onClick={() => { setErsetzeId(x.id); ersetzFeld.current?.click(); }} title={t('ablage.dokumente.neue-version-hochladen-die')}>{t('ablage.dokumente.ersetzen')}</button>}
                        {!nurLesen && <Knopf art="link" className={weg ? undefined : 'gefahr'} onClick={async () => {
                          // Mit allen Versionen (#194): nachfragen, mit Zahl.
                          if (!weg && (x.aeltere ?? 0) > 0 && !(await rueckfrage({ titel: t('ablage.dokumente.mit-allen-versionen-loeschen', { name: x.name, wert: (x.aeltere ?? 0) + 1 }), text: d.zaehler.papierkorbTage ? t('ablage.dokumente.sie-kommen-beim-speichern') : t('ablage.dokumente.das-ist-endgueltig'), ja: t('ablage.dokumente.loeschen'), gefahr: true }))) return;
                          entferne(x.id);
                        }}>{weg ? t('ablage.dokumente.behalten') : t('ablage.dokumente.loeschen')}</Knopf>}

                      </div>
                      )}
                    </div>
                    {alsAnlage === x.id && !weg && <AlsAnlage d={x} ziele={ziele} schliessen={() => setAlsAnlage(undefined)} fertig={anlagenFertig} />}
                    {stempelOffen?.id === x.id && !weg && (
                      <StempelDialog key={`${x.id}-${stempelOffen.version ?? ''}`} d={x} typ={typ} mappe={mappeTitel} version={stempelOffen.version} anlagen={anlagen} schliessen={() => setStempelOffen(undefined)} />
                    )}
                    {kleinOffen === x.id && !weg && (
                      <PdfVerkleinern d={x} bearbeitbar={bearbeitbar} mitnehmen={mitnehmen} schliessen={() => setKleinOffen(undefined)}
                        fertig={(m, geaendert) => { setKleinOffen(undefined); setPdfMeldung(m); if (geaendert) void neuLaden?.(); }} />
                    )}
                    {schwarzOffen === x.id && !weg && (
                      <Schwaerzen d={x} schliessen={() => setSchwarzOffen(undefined)}
                        fertig={(m) => { setSchwarzOffen(undefined); setPdfMeldung(m); void neuLaden?.(); }} />
                    )}
                    {teilenHinweis && (
                      <div className="hinweis info teilenhinweis" role="status">
                        <p>{t('volltext.teilen.hinweis', { seite: x.teilenAb! })}</p>
                        <span className="zeilenaktionen">
                          <button type="button" className="knopf klein primaer" onClick={() => { setPdfMeldung(undefined); setKleinOffen(undefined); setSchwarzOffen(undefined); setTeilVorschlag({ id: x.id, ab: x.teilenAb! }); setSeitenOffen(x.id); }}>{t('volltext.teilen.knopf')}</button>
                          <button type="button" className="textknopf klein" onClick={() => void teilenAusblenden(x.id)}>{t('volltext.teilen.weg')}</button>
                          <Hilfe ort="dokumente.sprachen" />
                        </span>
                      </div>
                    )}
                    {post && !weg && seitenOffen !== x.id && <LeerseitenBlock x={x} l={leer.von(x)} darf={bearbeitbar} geaendert={(l) => leer.setze(x.id, l)} />}
                    {seitenOffen === x.id && !weg && (
                      <PdfSeiten d={x} post={!!post} versioniert={versioniert} papierkorb={!!d.zaehler.papierkorbTage} teilAb={teilVorschlag?.id === x.id ? teilVorschlag.ab : undefined}
                        schliessen={() => { setSeitenOffen(undefined); setTeilVorschlag(undefined); }} fertig={(r) => { setTeilVorschlag(undefined); void pdfFertig(r); }} />
                    )}
                    {auf && (
                      <div className="dokansicht">
                        {sicht && <AnsichtKopf x={x} art={sicht.art} umschalten={() => { const n = new Set(original); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); setOriginal(n); }} />}
                        {sicht?.pdf
                          ? <iframe src={sicht.url} title={x.name} />
                          : <img src={sicht?.url ?? dokumentUrl(x.id)} alt={x.name} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>}
    </div>
  );
}

/** Schmaler Bildschirm (Handy, #505) – wie die Blätter von unten in styles.css (bis 600 px). */
function useHandy() {
  const abfrage = '(max-width: 600px)';
  const [an, setAn] = useState(() => typeof matchMedia === 'function' && matchMedia(abfrage).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(abfrage);
    const f = () => setAn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return an;
}

/**
 * Teilen (#505, Web Share API): „An … senden“ mit der Datei, wo der Browser das kann. Safari verlangt das
 * Teilen direkt aus dem Tipp; dauert das Laden zu lange, steht danach „Jetzt teilen“ da (zweiter Tipp).
 */
function DokTeilen({ d }: { d: Dokument }) {
  const [datei, setDatei] = useState<File | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const kann = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [new File([''], d.name, { type: d.mime })] });
  if (!kann) return null;
  async function teile() {
    setFehler(undefined);
    let f = datei;
    try {
      if (!f) {
        setLaeuft(true);
        const r = await fetch(dokumentUrl(d.id, true), { credentials: 'same-origin', headers: { 'x-dms': '1', 'x-sprache': sprache() } });
        if (!r.ok) throw new Error(t('ablage.dokumente.das-dokument-liess-sich'));
        f = new File([await r.blob()], d.name, { type: d.mime });
        setDatei(f);
      }
      await navigator.share({ files: [f], title: d.name });
    } catch (e) {
      const n = (e as Error).name;
      if (n === 'NotAllowedError') return; // zweiter Tipp: „Jetzt teilen“
      if (n !== 'AbortError') setFehler((e as Error).message);
    } finally { setLaeuft(false); }
  }
  return (
    <>
      <button type="button" className="knopf dk-gross" disabled={laeuft} onClick={() => void teile()}>{laeuft ? t('ablage.dokumente.lade') : datei ? t('ablage.dokumente.jetzt-teilen') : t('ablage.dokumente.teilen')}</button>
      {fehler && <span className="fehlertext klein">{fehler}</span>}
    </>
  );
}

/**
 * Was die Anzeige zeigt (#631): die Archivfassung (PDF/A), wenn es eine zur aktuellen Datei gibt – sonst die Lesefassung
 * (#577) für Dateitypen, die der Browser nicht zeigt – sonst das Original. Mit `original` immer das Original. null:
 * nichts anzuzeigen.
 */
export function ansichtVon(x: Dokument, original: boolean): { art: Ansichtsart; url: string; pdf: boolean } | null {
  if (!original && x.archivfassung?.stand === 'fertig') return { art: 'archiv', url: archivfassungUrl(x.id), pdf: true };
  // Geschütztes PDF (#827): Der Server zeigt die entsperrte Fassung; ohne sie gibt es nichts anzuzeigen.
  if (x.pdfSchutz?.art === 'passwort') return x.pdfSchutz.entsperrt ? { art: 'entsperrt', url: dokumentUrl(x.id), pdf: true } : null;
  if (!x.anzeigbar && x.ocr?.stand === 'fertig' && fassungAusInfo(x.ocr.info)) return { art: 'lesefassung', url: fassungUrl(x.id), pdf: true };
  if (!x.anzeigbar) return null;
  return { art: 'original', url: dokumentUrl(x.id), pdf: x.mime === 'application/pdf' };
}

/** Über der Anzeige (#631): was man sieht, und der Wechsel zwischen Archivfassung und Original. */
type Ansichtsart = 'archiv' | 'lesefassung' | 'entsperrt' | 'original';

function AnsichtKopf({ x, art, umschalten }: { x: Dokument; art: Ansichtsart; umschalten(): void }) {
  const a = x.archivfassung;
  const mitArchiv = a?.stand === 'fertig';
  return (
    <p className="dokansicht-kopf klein">
      <strong>{t.frei(`volltext.archiv.ansicht.${art}`)}</strong>
      {mitArchiv && x.anzeigbar && <> · <button type="button" className="textknopf" onClick={umschalten}>{art === 'archiv' ? t('volltext.archiv.original-anzeigen') : t('volltext.archiv.archiv-anzeigen')}</button></>}
      {/* Original, das der Browser nicht zeigt (#946, z. B. eine E-Mail): „Original anzeigen“ lädt die Datei herunter. */}
      {mitArchiv && !x.anzeigbar && <> · <a className="textknopf" href={dokumentUrl(x.id, true)} title={t('volltext.archiv.original-laden-titel')}>{t('volltext.archiv.original-anzeigen')}</a></>}
      {!mitArchiv && a?.stand === 'wartet' && <span className="leise"> · {t('volltext.archiv.wird-erstellt')}</span>}
      <Hilfe ort="dokumente.archivfassung" />
    </p>
  );
}

/**
 * „Herunterladen“ ohne Exportrecht (#723): gesperrt aus einem Grund (#1210, Leitsatz 6) – gestrichelt mit Schloss und
 * ⓘ, die Erklärung öffnet sich direkt am Knopf; Bildschirmleser hören den Grund schon am Knopf.
 */
function NichtHerunterladen() {
  return (
    <Knopf groesse="klein" gesperrt={{ grund: t('mappen.mitnehmen.grund'), titel: t('mappen.mitnehmen.titel'), stattdessen: <p className="leise">{t('mappen.mitnehmen.ansehen')} <Hilfe ort="dokumente.mitnehmen" /></p> }}>
      {t('mappen.mitnehmen.knopf')}
    </Knopf>
  );
}

/**
 * Herunterladen (#631): mit Archivfassung die Wahl – vorausgewählt (vorn) ist, was man gerade sieht, bei E-Rechnungen
 * immer das Original.
 */
function Herunterladen({ x, archiv }: { x: Dokument; archiv: boolean }) {
  const a = x.archivfassung?.stand === 'fertig' ? x.archivfassung.fassung : undefined;
  if (!a || a.imOriginal) return <a className="textknopf" href={dokumentUrl(x.id, true)}>{t('ablage.dokumente.herunterladen')}</a>;
  const zuerstArchiv = archiv && !a.erechnung;
  const orig = <a key="o" className="textknopf" href={dokumentUrl(x.id, true)} title={t('volltext.archiv.laden.original.titel')}>{zuerstArchiv ? t('volltext.archiv.laden.original') : t('ablage.dokumente.herunterladen')}</a>;
  const arch = <a key="a" className="textknopf" href={archivfassungUrl(x.id, true)} title={t('volltext.archiv.laden.archiv.titel')}>{zuerstArchiv ? t('ablage.dokumente.herunterladen') : t('volltext.archiv.laden.archiv')}</a>;
  return <>{zuerstArchiv ? [arch, orig] : [orig, arch]}</>;
}

/** Stand der Archivfassung am Dokument (#631) mit Hinweisen (signiert, externe Inhalte, Grund). */
function ArchivAnzeige({ s }: { s?: ArchivStand | null }) {
  if (!s) return null;
  const f = s.fassung;
  const klasse = s.stand === 'fertig' ? 'gut' : s.stand === 'fehler' ? 'schlecht' : s.stand === 'ausgelassen' ? '' : 'warn';
  return (
    <span className="ocrstand klein">
      <span className={`chip ${klasse}`} title={s.info ?? undefined}>{s.stand === 'fertig' && f ? t('volltext.archiv.chip.fertig', { pdfa: pdfaName(f.pdfa) }) : t.frei(`volltext.archiv.chip.${s.stand}`)}</span>
      {s.stand === 'fertig' && f?.imOriginal && <span className="leise">{t('volltext.archiv.im-original')}</span>}
      {s.stand === 'wartet' && s.paket && <span className="leise">{t('volltext.archiv.wartet', { paket: s.paket.name })}</span>}
      {s.stand !== 'wartet' && s.info && <span className="leise">{s.info}</span>}
      {f?.signiert && <span className="leise">{t('volltext.archiv.signiert')}</span>}
      {f?.weggelassen && <span className="leise">{t('volltext.archiv.weggelassen')}</span>}
      {f?.erechnung && <span className="leise">{t('volltext.archiv.erechnung')}</span>}
    </span>
  );
}

/**
 * Geschütztes PDF (#827): Hinweis mit Passwortfeld, solange es gesperrt ist; danach ein kurzer Vermerk. Mit
 * „Für weitere Dokumente merken“ kommt das Passwort verschlüsselt in das eigene Konto (Mein Konto → Sicherheit).
 */
function PdfSchutzAnzeige({ x, betreff, fertig }: { x: Dokument; betreff: string; fertig(): void }) {
  const s = x.pdfSchutz!;
  const { vertretung } = useKonto();
  const [passwort, setPasswort] = useState('');
  const [zeigen, setZeigen] = useState(false);
  const [merken, setMerken] = useState(false);
  const [name, setName] = useState(() => namensvorschlag(betreff));
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  if (s.entsperrt) return (
    <span className="ocrstand klein">
      <span className="chip">{t.frei(`mappen.entsperren.chip.${s.art}`)}</span>
      <span className="leise">{s.art === 'rechte' ? t('mappen.entsperren.rechte') : s.entsperrt.art === 'gemerkt' ? t('mappen.entsperren.entsperrt-gemerkt', { name: s.entsperrt.name ?? '' }) : t('mappen.entsperren.entsperrt')}</span>
      <Hilfe ort="dokumente.entsperren" />
    </span>
  );
  if (s.art !== 'passwort') return null;
  async function absenden(e: FormEvent) {
    e.preventDefault();
    setSendet(true); setMeldung(undefined);
    try {
      const r = await api.dokumentEntsperren(x.id, passwort, merken ? { name } : undefined);
      setPasswort('');
      setMeldung({ art: 'gut', text: r.hinweis ? t('mappen.entsperren.fertig-ohne-merken', { grund: r.hinweis }) : r.gemerkt ? t('mappen.entsperren.fertig-gemerkt') : t('mappen.entsperren.fertig') });
      fertig();
    } catch (f) { setMeldung({ art: 'schlecht', text: (f as Error).message }); } finally { setSendet(false); }
  }
  return (
    <form className="hinweis info entsperren" onSubmit={(e) => void absenden(e)} onClick={(e) => e.stopPropagation()}>
      <p><Symbol name="schloss" /> {t('mappen.entsperren.hinweis')} <Hilfe ort="dokumente.entsperren" /></p>
      <div className="passwort">
        <label className="sr" htmlFor={`entsperren-${x.id}`}>{t('mappen.entsperren.passwort')}</label>
        <input id={`entsperren-${x.id}`} type={zeigen ? 'text' : 'password'} value={passwort} autoComplete="off" spellCheck={false}
          placeholder={t('mappen.entsperren.passwort')} onChange={(e) => setPasswort(e.target.value)} />
        <button type="button" className="knopf klein" onClick={() => setZeigen(!zeigen)} aria-label={zeigen ? t('mappen.entsperren.verbergen') : t('mappen.entsperren.anzeigen')} title={zeigen ? t('mappen.entsperren.verbergen') : t('mappen.entsperren.anzeigen')}><Symbol name={zeigen ? 'auge-aus' : 'auge'} /></button>
        <button className="knopf klein primaer" disabled={sendet || !passwort || (merken && !name.trim())}>{t('mappen.entsperren.knopf')}</button>
      </div>
      {!vertretung && (
        <label className="haken"><input type="checkbox" checked={merken} onChange={(e) => setMerken(e.target.checked)} />
          <span>{t('mappen.entsperren.merken')}<small className="hilfe">{t('mappen.entsperren.merken.hilfe')}</small></span></label>
      )}
      {merken && (
        <label className="eigenschaft"><span>{t('mappen.entsperren.name')}</span>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t('mappen.entsperren.name.beispiel')} /></label>
      )}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </form>
  );
}

/** Stand der Texterkennung an einem Dokument (#45) mit Herkunft des Texts (#458). */
function OcrAnzeige({ id, s, sprache: feld, weitere, erneut, neu, text, textOffen }: { id: string; s?: OcrStand; sprache?: string | null; /** Weitere Sprachen (#579). */ weitere?: string[]; erneut(): void; /** „Neu erzeugen“ (#458), nur mit Recht Bearbeiten. */ neu?: () => void; text(): void; textOffen: boolean }) {
  if (!s || s.stand === 'keiner') return null;
  // Sprache des Volltexts (#400) als eigenes Feld; bei älteren Dokumenten aus dem Hinweis der Texterkennung (#395).
  const sprache = s.stand !== 'fertig' ? null : feld ? { sprache: feld } : spracheAusInfo(s.info);
  const klasse = s.stand === 'fertig' ? 'gut' : s.stand === 'fehler' ? 'schlecht' : s.stand === 'ausgelassen' ? '' : 'warn';
  // Woher der Text kommt (#458): aus dem PDF, vom Paket – oder es wartet auf das Paket (mit Fortschritt des Pakets).
  const herkunft = herkunftText(s);
  const fortschritt = s.stand === 'paket' ? /\(Paket .+?\) – (.+)$/.exec(s.info ?? '')?.[1] : undefined;
  // Aus der umgewandelten Fassung eines Pakets (#577): gekennzeichnet, mit Link zur Fassung.
  const fassung = s.stand === 'fertig' ? fassungAusInfo(s.info) : null;
  // Wartet es auf ein Paket, das umwandelt oder den Volltext liefert (#577, #614): nicht „wartet auf Texterkennung“.
  const art = volltextHerkunft(s)?.art;
  const standText = s.stand === 'paket' && (art === 'umwandlung' || art === 'volltext') ? t('volltext.stand.paket') : OCR_STAENDE[s.stand];
  return (
    <span className="ocrstand klein">
      <span className={`chip ${klasse}`} title={s.info ?? undefined}>{t('ablage.dokumente.volltext', { standText, wert: s.stand === 'fertig' && s.seiten ? t('ablage.dokumente.seiten-2', { anzahl: s.seiten }) : '', wert2: sprache ? ` · ${sprachenAnzeige(sprache.sprache, weitere)}` : '' })}</span>
      {herkunft && <span className="leise">{herkunft}{fortschritt ? ` · ${fortschritt}` : ''}</span>}
      {fassung && <span className="leise">{t('volltext.herkunft.fassung', { paket: fassung })} <a className="textknopf" href={fassungUrl(id)} target="_blank" rel="noreferrer" title={t('volltext.herkunft.fassung.titel')}>{t('volltext.herkunft.fassung.ansehen')}</a></span>}
      {(s.stand === 'fehler' || s.stand === 'ausgelassen') && s.info && <span className="leise">{s.info}</span>}
      {s.stand === 'fertig' && <button type="button" className="textknopf" onClick={text}>{textOffen ? t('ablage.dokumente.text-ausblenden') : t('ablage.dokumente.text-anzeigen')}</button>}
      {(s.stand === 'fehler' || s.stand === 'ausgelassen') && <button type="button" className="textknopf" onClick={erneut}>{t('ablage.dokumente.erneut-versuchen')}</button>}
      {neu && (s.stand === 'fertig' || s.stand === 'paket') && <button type="button" className="textknopf" title={t('volltext.dokument.neu.titel')} onClick={neu}>{t('volltext.dokument.neu')}</button>}
    </span>
  );
}

/** „Deutsch, enthält auch Französisch“ (#579); einsprachig nur der Name. */
export function sprachenAnzeige(sprache: string, weitere?: string[] | null) {
  const w = (weitere ?? []).filter((k) => k !== sprache).map(sprachname);
  if (!w.length) return sprachname(sprache);
  return t('volltext.sprachen.auch', { sprache: sprachname(sprache), weitere: new Intl.ListFormat('de', { type: 'conjunction' }).format(w) });
}

/** „Rechnung.pdf“ → „Rechnung (2).pdf“ (wie der Server bei gleichem Namen). */
function mitZaehler(name: string) {
  const p = name.lastIndexOf('.');
  return p > 0 ? `${name.slice(0, p)} (2)${name.slice(p)}` : `${name} (2)`;
}

/** Alle Versionen eines Dokuments (#194): ansehen, herunterladen, zurückholen. */
function Versionen({ d, zurueck, neuLaden, mitStempel, mitnehmen = true }: { d: Dokument; zurueck: boolean; neuLaden?: () => Promise<void>; /** Pflicht-Stempel (#394): Herunterladen nur über den Dialog. */ mitStempel?: (nummer: number) => void; /** Exportrecht (#723): ohne E nur ansehen. */ mitnehmen?: boolean }) {
  const [liste, setListe] = useState<DokumentVersion[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { api.versionen(d.id).then((r) => setListe(r.aeltere)).catch((e) => setFehler((e as Error).message)); }, [d.id, d.version]);
  async function hole(n: number) {
    setFehler(undefined);
    try { await api.zurueckholen(d.id, n); await neuLaden?.(); } catch (e) { setFehler((e as Error).message); }
  }
  const herkunft = (h: Herkunft | null | undefined) => (h ? HERKUNFT[h] ?? h : 'hochgeladen');
  return (
    <div className="versionen">
      {fehler && <p className="fehlertext">{fehler}</p>}
      <table className="tabelle klein">
        <thead><tr><th>{t('ablage.dokumente.version-3')}</th><th>{t('ablage.dokumente.datei')}</th><th>{t('ablage.dokumente.gespeichert-2')}</th><th>{t('ablage.dokumente.von')}</th><th>{t('ablage.dokumente.herkunft')}</th><th>{t('ablage.dokumente.groesse')}</th><th /></tr></thead>
        <tbody>
          <tr><td>{tn('ablage.dokumente.aktuell', { b: <strong>{d.version ?? 1}</strong> })}</td><td>{d.name}</td><td>{zeit(d.erstellt)}</td><td><Person id={d.erstelltVon} /></td><td>{herkunft(d.herkunft)}</td><td>{groesse(d.groesse)}</td><td /></tr>
          {liste === null ? <tr><td colSpan={7} className="leise">{t('ablage.dokumente.lade')}</td></tr> : liste.map((v) => (
            <tr key={v.nummer}>
              <td>{v.nummer}</td><td>{v.name}</td><td>{zeit(v.erstellt)}</td><td><Person id={v.erstelltVon} /></td><td>{herkunft(v.herkunft)}</td><td>{groesse(v.groesse)}</td>
              <td className="zeilenaktionen">
                {v.anzeigbar && <a className="symbolverweis" href={versionUrl(d.id, v.nummer)} target="_blank" rel="noreferrer" title={t('ablage.dokumente.ansehen')} aria-label={t('ablage.dokumente.version-ansehen', { nummer: v.nummer })}>↗</a>}
                {!mitnehmen ? null : mitStempel ? kannStempeln(v.mime) && <button type="button" className="textknopf" onClick={() => mitStempel(v.nummer)}>{t('ablage.dokumente.mit-stempel-herunterladen')}</button>
                  : <a className="textknopf" href={versionUrl(d.id, v.nummer, true)}>{t('ablage.dokumente.herunterladen')}</a>}
                {zurueck && <Knopf art="link" onClick={async () => { if (await rueckfrage({ titel: t('ablage.dokumente.version-zurueckholen', { nummer: v.nummer }), text: t('ablage.dokumente.sie-wird-zur-neuen', { wert: (d.version ?? 1) + 1 }), ja: t('ablage.dokumente.zurueckholen') })) void hole(v.nummer); }}>{t('ablage.dokumente.zurueckholen')}</Knopf>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {liste !== null && !liste.length && <p className="leise klein">{t('ablage.dokumente.keine-aelteren-versionen')}</p>}
      <p className="leise klein"><Hilfe ort="dokumente.versionen" /></p>
    </div>
  );
}
