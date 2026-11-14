import { Vorschaubild } from './Vorschaubild';
import { PdfSeiten } from './PdfSeiten';
import { LeerseitenBlock, useLeerseiten } from './Leerseiten';
import { Link } from '../ort';
import { Fundstellen, fundstellenFuer } from './Doppelt';
import { useMappenZiel } from './NeuePost';
import { Fragment, useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react';
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
import { Feld, HakenFeld, Knopf, knopfAussehen, Menue, Umschalter, Wahlhaken, type MenuePunkt } from '../bausteine';
import { anlagenVon, eingangsreihenfolge, gruppiere } from '../../../shared/src/anlagen';
import { AlsAnlage, AnlageMarke, AnlageZeile } from './Anlagen';

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
  // „Über dieses Dokument“ ohne geöffnete Anzeige (#1211), etwa bei Originalen, die der Browser nicht zeigt.
  const [ueberOffen, setUeberOffen] = useState<string>();
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
  const teilenAb = (x: Dokument, weg: boolean) => !!post && bearbeitbar && !weg && hauptReihe.findIndex((y) => y.id === x.id) > 0;
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
      vorschau={anzeige(x, aSicht)} />;
  };

  // Die geöffnete Anzeige steht direkt unter ihrer Zeile und wird sichtbar gescrollt (#85).
  useEffect(() => {
    if (ansicht) offenRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ansicht]);
  // Handy (#505): kein eingebetteter Rahmen – Tippen öffnet das Dokument im Vollbild (Anzeige des Browsers, Zwei-Finger-Zoom, Zurück mit einem Tipp).
  const handy = useHandy();
  const umschalten = (x: Dokument) => {
    // Auch aufklappen, wenn gerade das Original gewählt ist, das sich nicht anzeigen lässt (#1211): Dann steht dort der Satz.
    const v = ansichtVon(x, original.has(x.id)) ?? ansichtVon(x, false);
    if (!v || entfernt.includes(x.id)) return;
    if (handy) { location.assign(v.url); return; }
    setAnsicht(x.id === ansicht ? undefined : x.id);
  };
  const zeilenKlick = (x: Dokument, e: MouseEvent) => {
    // Knöpfe, Links, Kästchen, der Volltext und die Dialoge (Seiten, Verkleinern, Schwärzen) behalten ihre eigene Funktion.
    if ((e.target as HTMLElement).closest('a, button, input, select, label, pre, .dokansicht, .pdfseiten, .leerseiten, [role="menu"], form')) return;
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
  /** Was der Original-Wechsel zeigt (#631): gemerkt je Dokument. */
  const wechsle = (x: Dokument) => { const n = new Set(original); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); setOriginal(n); };
  /** Entfernen (#1211, Leitsatz 5): neutral, geht erst beim Speichern in den Papierkorb; mit älteren Versionen nachfragen. */
  async function entfernen(x: Dokument) {
    if ((x.aeltere ?? 0) > 0 && !(await rueckfrage({ titel: t('ablage.dokumente.mit-allen-versionen-loeschen', { name: x.name, wert: (x.aeltere ?? 0) + 1 }), text: d.zaehler.papierkorbTage ? t('ablage.dokumente.sie-kommen-beim-speichern') : t('ablage.dokumente.das-ist-endgueltig'), ja: t('ablage.dokumente.entfernen') }))) return;
    entferne(x.id);
  }
  const nurEins = (setze: (id: string | undefined) => void, id: string, jetzt: string | undefined) => {
    setPdfMeldung(undefined); setSeitenOffen(undefined); setKleinOffen(undefined); setSchwarzOffen(undefined);
    setze(jetzt === id ? undefined : id);
  };

  /**
   * „⋯“ einer Dokumentzeile (#1211, Vorgabe Dokumentliste): Gruppen Ansehen · Herunterladen · Bearbeiten · Ordnen, abgesetzt
   * „Entfernen“ (neutral, Leitsatz 5). Nur, was bei diesem Dokument geht.
   */
  function punkte(x: Dokument, z: { anlagen: Dokument[]; ziele: Dokument[]; sicht: ReturnType<typeof ansichtVon>; klickbar: boolean; auf: boolean }): MenuePunkt[] {
    const g = { ansehen: t('ablage.dokumente.gruppe.ansehen'), laden: t('ablage.dokumente.gruppe.herunterladen'), bearbeiten: t('ablage.dokumente.gruppe.bearbeiten'), ordnen: t('ablage.dokumente.gruppe.ordnen') };
    const s = standVon(x);
    const a = x.archivfassung?.stand === 'fertig' ? x.archivfassung.fassung : undefined;
    const archiv = z.sicht?.art === 'archiv';
    const laden = (url: string) => () => { location.assign(url); };
    const pdf = x.mime === 'application/pdf';
    const p: Array<MenuePunkt | false | undefined | null> = [
      z.klickbar && { key: 'tab', gruppe: g.ansehen, symbol: 'extern', inhalt: t('ablage.dokumente.in-neuem-tab-oeffnen'), tu: () => { window.open(z.sicht!.url, '_blank', 'noopener'); } },
      !z.auf && { key: 'ueber', gruppe: g.ansehen, symbol: 'info', inhalt: t('ablage.dokumente.ueber.titel'), tu: () => setUeberOffen(ueberOffen === x.id ? undefined : x.id) },
      s?.stand === 'fertig' && { key: 'text', gruppe: g.ansehen, symbol: 'dokument', inhalt: text?.id === x.id ? t('ablage.dokumente.text-ausblenden') : t('ablage.dokumente.text-anzeigen'), tu: () => zeigeText(x.id) },
      ...(!mitnehmen
        ? [{ key: 'laden', gruppe: g.laden, symbol: 'herunterladen' as const, inhalt: t('ablage.dokumente.herunterladen'), gesperrt: t('mappen.mitnehmen.grund'), tu: () => {} }]
        : stempelPflicht ? []
        : a && !a.imOriginal
          ? [{ key: 'pdfa', gruppe: g.laden, symbol: 'herunterladen' as const, inhalt: t('ablage.dokumente.laden.pdfa'), titel: t('volltext.archiv.laden.archiv.titel'), tu: laden(archivfassungUrl(x.id, true)) },
            { key: 'original', gruppe: g.laden, symbol: 'herunterladen' as const, inhalt: t('ablage.dokumente.laden.original'), titel: t('volltext.archiv.laden.original.titel'), tu: laden(dokumentUrl(x.id, true)) }]
          : [{ key: 'original', gruppe: g.laden, symbol: 'herunterladen' as const, inhalt: t('ablage.dokumente.herunterladen'), tu: laden(dokumentUrl(x.id, true)) }]),
      mitnehmen && !stempelPflicht && z.anlagen.length > 0 && { key: 'anlagen', gruppe: g.laden, symbol: 'bezug', inhalt: t('ablage.dokumente.laden.mit-anlagen'), titel: t('ablage.anlagen.mit-anlagen', { anzahl: z.anlagen.length }),
        tu: () => api.herunterladenMitAnlagen(x.id, t('ablage.anlagen.zip-name', { name: x.name.replace(/\.[^.]{1,5}$/, '') }), archiv ? 'archiv' : undefined) },
      mitnehmen && kannStempeln(x.mime) && typ && { key: 'stempel', gruppe: g.laden, symbol: 'pdf', inhalt: stempelPflicht ? t('ablage.dokumente.herunterladen-mit-stempel') : t('ablage.dokumente.laden.mit-stempel'), titel: t('ablage.dokumente.eine-kopie-mit-stempel'),
        tu: () => setStempelOffen(stempelOffen?.id === x.id && !stempelOffen.version ? undefined : { id: x.id }) },
      bearbeitbar && pdf && { key: 'seiten', gruppe: g.bearbeiten, symbol: 'dokument', inhalt: t('ablage.dokumente.menue.seiten'), titel: t('ablage.dokumente.seiten-drehen-loeschen-umsortieren'), tu: () => nurEins(setSeitenOffen, x.id, seitenOffen) },
      (mitnehmen || bearbeitbar) && pdf && x.groesse >= VERKLEINERN_AB && { key: 'klein', gruppe: g.bearbeiten, symbol: 'pdf', inhalt: t('ablage.dokumente.menue.verkleinern'), titel: t('ablage.dokumente.bilder-im-pdf-herunterrechnen'), tu: () => nurEins(setKleinOffen, x.id, kleinOffen) },
      bearbeitbar && kannSchwaerzen(x.mime) && { key: 'schwarz', gruppe: g.bearbeiten, symbol: 'auge-aus', inhalt: t('ablage.dokumente.menue.schwaerzen'), titel: t('ablage.dokumente.stellen-endgueltig-schwaerzen-als'), tu: () => nurEins(setSchwarzOffen, x.id, schwarzOffen) },
      !nurLesen && versioniert && { key: 'ersetzen', gruppe: g.bearbeiten, symbol: 'neu-laden', inhalt: t('ablage.dokumente.menue.neue-version'), titel: t('ablage.dokumente.neue-version-hochladen-die'), tu: () => { setErsetzeId(x.id); ersetzFeld.current?.click(); } },
      teilenAb(x, false) && { key: 'teilen-ab', gruppe: g.bearbeiten, symbol: 'posteingang', inhalt: t('ablage.dokumente.menue.post-teilen'), titel: t('ablage.dokumente.post-teilen-ab-titel'), tu: () => postTeilenAb(x) },
      bearbeitbar && !x.anlageZu && z.ziele.length > 0 && { key: 'anlage', gruppe: g.ordnen, symbol: 'bezug', inhalt: t('ablage.dokumente.menue.als-anlage'), titel: t('ablage.anlagen.als-anlage-knopf-titel'), tu: () => setAlsAnlage(alsAnlage === x.id ? undefined : x.id) },
      !nurLesen && neuLaden && { key: 'asn', gruppe: g.ordnen, symbol: 'stoppuhr', inhalt: t('ablage.dokumente.menue.archivnummer'), titel: t('ablage.dokumente.nummer-vom-aufkleber-auf'), tu: () => setAsn({ id: x.id, wert: x.archivnummer ?? '' }) },
      (versioniert || (x.version ?? 1) > 1) && { key: 'versionen', gruppe: g.ordnen, symbol: 'historie', inhalt: t('ablage.dokumente.menue.versionen'), tu: () => setVersionenOffen(versionenOffen === x.id ? undefined : x.id) },
    ];
    return p.filter((e): e is MenuePunkt => !!e);
  }

  /** Die geöffnete Anzeige (#1211): Umschalter „PDF/A · Original“, „In neuem Tab“, Betrachter mit fester Höhe, „Über dieses Dokument“. */
  const anzeige = (x: Dokument, sicht: ReturnType<typeof ansichtVon>, ueber?: ReactNode) => {
    const mitArchiv = x.archivfassung?.stand === 'fertig';
    const imOriginal = original.has(x.id);
    const endung = /\.([^.]{1,8})$/.exec(x.name)?.[1]?.toLowerCase();
    return (
      <div className="dokansicht">
        <div className="dokansicht-kopf klein">
          {mitArchiv
            ? <Umschalter wert={imOriginal ? 'original' : 'archiv'} setze={() => wechsle(x)} beschriftung={t('ablage.dokumente.fassung')}
                wahlen={[{ wert: 'archiv', text: t('ablage.dokumente.laden.pdfa') }, { wert: 'original', text: t('ablage.dokumente.laden.original') }]} />
            : sicht && <strong>{t.frei(`volltext.archiv.ansicht.${sicht.art}`)}</strong>}
          {!mitArchiv && x.archivfassung?.stand === 'wartet' && <span className="leise">{t('volltext.archiv.wird-erstellt')}</span>}
          <Hilfe ort="dokumente.archivfassung" />
          {sicht && <a className="verweis dokansicht-tab" href={sicht.url} target="_blank" rel="noreferrer" aria-label={t('ablage.dokumente.in-neuem-tab-oeffnen-2', { name: x.name })}>{t('ablage.dokumente.in-neuem-tab')} <Symbol name="extern" /></a>}
        </div>
        {sicht
          ? sicht.pdf ? <iframe src={sicht.url} title={x.name} /> : <img src={sicht.url} alt={x.name} />
          // Original, das der Browser nicht zeigt (#946, z. B. eine E-Mail): kein Link, der heimlich herunterlädt.
          : <div className="dokansicht-leer">
              <p>{endung ? t('ablage.dokumente.original-nicht-anzeigbar', { endung }) : t('ablage.dokumente.original-nicht-anzeigbar-ohne')}</p>
              {mitnehmen && !stempelPflicht && <Knopf symbol="herunterladen" onClick={() => { location.assign(dokumentUrl(x.id, true)); }}>{t('ablage.dokumente.original-herunterladen')}</Knopf>}
            </div>}
        {ueber}
      </div>
    );
  };

  const alleAuswahl = waehlbar.length > 0 && auswahl.length === waehlbar.length;
  return (
    <div className="dokumente">
      {!nurLesen && <div className={`ablagezone ${ziehen ? 'zieht' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setZiehen(true); }} onDragLeave={() => setZiehen(false)} onDrop={fallen}>
        <p>{t('ablage.dokumente.dateien-hierher-ziehen-oder')}{' '}<Knopf art="link" onClick={() => auswahlFeld.current?.click()}>{t('ablage.dokumente.auswaehlen')}</Knopf></p>
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
                <span className="dokleiste-alle">
                  <Wahlhaken an={alleAuswahl} teilweise={auswahl.length > 0 && !alleAuswahl} gesperrt={!waehlbar.length} beschriftung={t('ablage.dokumente.alle-auswaehlen')}
                    setze={() => setGewaehlt(alleAuswahl ? new Set() : new Set(waehlbar.map((x) => x.id)))} />
                  <span className="klein" aria-live="polite">{auswahl.length ? t('ablage.dokumente.von-ausgewaehlt', { auswahl: auswahl.length, waehlbar: waehlbar.length }) : t('ablage.dokumente.alle-auswaehlen')}</span>
                </span>
                <Hilfe ort="dokumente.mehrere" />
                {/* Nichts gewählt: blass (nichts zu tun); ohne Exportrecht oder mit Pflicht-Stempel: gesperrt aus einem Grund (Leitsatz 6). */}
                {!mitnehmen ? <NichtHerunterladen />
                  : <Knopf groesse="klein" symbol="herunterladen" onClick={alleHerunterladen}
                      gesperrt={stempelPflicht ? t('ablage.dokumente.dieser-mappentyp-verlangt-beim') : !auswahl.length}>{t('ablage.dokumente.herunterladen')}</Knopf>}
                {bearbeitbar && pdfAuswahl.length >= 2 && <Knopf groesse="klein" aria-expanded={!!zusammen}
                  onClick={() => setZusammen(zusammen ? null : { name: pdfAuswahl[0].name, entfernen: false })}>{t('ablage.dokumente.zusammenfuegen')}</Knopf>}
                {/* Entfernen der Auswahl (#87): erst beim Speichern, bis dahin „Behalten“ – nicht rot (Leitsatz 5). */}
                {!nurLesen && auswahl.length > 0 && <Knopf groesse="klein" symbol="geloescht" title={t('ablage.dokumente.entfernen.titel')} onClick={auswahlLoeschen}>{t('ablage.dokumente.entfernen')}</Knopf>}
                {post
                  ? <span className="sortwahl klein leise">{t('ablage.dokumente.eingangsreihenfolge')}</span>
                  : <Feld beschriftung={t('ablage.dokumente.sortieren-feld')} beschriftungVerbergen className="sortwahl">
                      <select value={sortierung} onChange={(e) => d.setzeEinstellung('dokumente_sortierung', e.target.value === 'name' ? null : e.target.value)}>
                        {Object.entries(DOKUMENT_SORTIERUNGEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </Feld>}
                <Hilfe ort="dokumente.sortieren" />
              </div>
            )}
            {hinweis && <div className="hinweis info"><p>{hinweis}</p></div>}
            {zusammen && pdfAuswahl.length >= 2 && (
              <div className="zusammenfuegen" role="group" aria-label={t('ablage.dokumente.pdfs-zusammenfuegen')}>
                <span className="klein">{t('ablage.dokumente.pdfs-in-der-reihenfolge', { pdfAuswahl: pdfAuswahl.length })}</span>
                <Feld beschriftung={t('ablage.dokumente.name')}><input value={zusammen.name} onChange={(e) => setZusammen({ ...zusammen, name: e.target.value })} /></Feld>
                <HakenFeld beschriftung={t('ablage.dokumente.ausgangsdokumente', { wert: d.zaehler.papierkorbTage ? t('ablage.dokumente.in-den-papierkorb-legen') : t('ablage.dokumente.loeschen-endgueltig') })}>
                  <input type="checkbox" checked={zusammen.entfernen} onChange={(e) => setZusammen({ ...zusammen, entfernen: e.target.checked })} />
                </HakenFeld>
                <Knopf art="haupt" groesse="klein" laeuft={zusammen.laeuft} laeuftText={t('ablage.dokumente.wird-zusammengefuegt')} onClick={() => fuegeZusammen()}>{t('ablage.dokumente.zusammenfuegen')}</Knopf>
                <Knopf groesse="klein" gesperrt={zusammen.laeuft} onClick={() => setZusammen(null)}>{t('ablage.dokumente.abbrechen')}</Knopf>
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
                          <Feld beschriftung={t('ablage.dokumente.es-gibt-schon', { name: gleich.name })} className="gleichername">
                            <select value={wahl} onChange={(e) => setzeNeue(n.uid, { gleicherName: e.target.value as NeueDatei['gleicherName'] })}>
                              {versioniert && <option value="version">{t('ablage.dokumente.als-neue-version-von', { name: gleich.name })}</option>}
                              <option value="zaehler">{t('ablage.dokumente.als-eigenes-dokument-mit', { mitZaehler: mitZaehler(n.datei.name) })}</option>
                              {!versioniert && <option value="ersetzen">{t('ablage.dokumente.altes-dokument-loeschen-und')}</option>}
                            </select>
                          </Feld>
                        );
                      })()}
                    </div>
                    <div className="zeilenaktionen"><Knopf groesse="klein" onClick={() => vergiss(n.uid)}>{t('ablage.dokumente.nicht-hochladen')}</Knopf></div>
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
                // Anzeige (#631): Archivfassung → Lesefassung → Original. Aufklappen geht auch, wenn nur das Original nicht anzeigbar ist.
                const sicht = ansichtVon(x, original.has(x.id));
                const klickbar = !weg && (!!sicht || !!ansichtVon(x, false));
                const s = standVon(x);
                const menuePunkte = weg ? [] : punkte(x, { anlagen, ziele, sicht, klickbar: !!sicht, auf });
                return (
                  <li key={x.id} ref={auf ? offenRef : undefined} className={`${auf ? 'an' : ''} ${weg ? 'weg' : ''} ${klickbar ? 'klickbar' : ''} ${gewaehlt.has(x.id) && !weg ? 'gewaehlt' : ''}`}
                    onClick={(e) => zeilenKlick(x, e)}>
                    <div className="dokzeile">
                      <Wahlhaken an={gewaehlt.has(x.id) && !weg} gesperrt={weg} beschriftung={t('ablage.dokumente.auswaehlen-2', { name: x.name })} setze={(an, bereich) => waehle(x, an, bereich)} />
                      <Vorschaubild d={x} />
                      <div className="dokname">
                        {klickbar
                          ? <Knopf art="link" className="dokname-knopf" aria-expanded={auf} onClick={() => umschalten(x)}>{x.name}</Knopf>
                          : <span className="dateiname">{x.name}</span>}
                        <AnlageMarke d={x} />
                        <span className="leise klein">{weg ? (d.zaehler.papierkorbTage ? t('ablage.dokumente.kommt-beim-speichern-in') : t('ablage.dokumente.wird-beim-speichern-endgueltig')) : <Infozeile x={x} s={s} />}</span>
                        {!weg && asn?.id === x.id && (
                          <form className="asnform" onSubmit={(e) => { e.preventDefault(); void speichereAsn(); }}>
                            <Feld beschriftung={t('ablage.dokumente.archivnummer')} beschriftungVerbergen fehler={asn.fehler}>
                              <input autoFocus value={asn.wert} maxLength={40} placeholder="z. B. A-000123" onChange={(e) => setAsn({ ...asn, wert: e.target.value, fehler: undefined })} />
                            </Feld>
                            <Knopf art="haupt" groesse="klein" type="submit">{t('ablage.dokumente.uebernehmen')}</Knopf>
                            <Knopf groesse="klein" onClick={() => setAsn(null)}>{t('ablage.dokumente.abbrechen')}</Knopf>
                            <Hilfe ort="dokumente.archivnummer" />
                          </form>
                        )}
                        {!weg && versionenOffen === x.id && <Versionen d={x} zurueck={!nurLesen && versioniert} neuLaden={neuLaden} mitnehmen={mitnehmen}
                          mitStempel={stempelPflicht && kannStempeln(x.mime) ? (n) => setStempelOffen({ id: x.id, version: n }) : undefined} />}
                        {/* Zustand nur, wenn etwas nicht stimmt (#1211): ruhige Zeile mit Ausweg. */}
                        {!weg && <Zustand s={s} archiv={x.archivfassung} erneut={() => void erneut(x.id)} />}
                        {!weg && x.pdfSchutz && <PdfSchutzAnzeige x={x} betreff={mappeTitel} fertig={() => void neuLaden?.()} />}
                        {!weg && text?.id === x.id && (text.text
                          ? <Uebersetzbar quelle={{ art: 'volltext', dokument: x.id }} original={text.text} darstellen={(v) => <pre className="volltext">{v}</pre>}><pre className="volltext">{text.text}</pre></Uebersetzbar>
                          : <pre className="volltext">{t('ablage.dokumente.kein-volltext-vorhanden')}</pre>)}
                      </div>
                      {/* Jede Zeile genau zwei Knöpfe (#1211): „Ansehen“ (am Handy „Öffnen“) und „⋯“; entfernt nur „Behalten“. */}
                      <div className={`zeilenaktionen${handy ? ' dk-handy' : ''}`}>
                        {weg
                          ? !nurLesen && <Knopf groesse="klein" onClick={() => entferne(x.id)}>{t('ablage.dokumente.behalten')}</Knopf>
                          : <>
                              {klickbar && (handy && sicht
                                ? <a {...knopfAussehen({ art: 'haupt' })} href={sicht.url} aria-label={t('ablage.dokumente.oeffnen', { name: x.name })}>{t('ablage.dokumente.oeffnen-2')}</a>
                                : !handy && <Knopf groesse="klein" aria-expanded={auf} onClick={() => umschalten(x)}>{auf ? t('ablage.dokumente.schliessen') : t('ablage.dokumente.ansehen')}</Knopf>)}
                              {handy && !stempelPflicht && mitnehmen && <DokTeilen d={x} />}
                              <Menue beschriftung={t('ablage.dokumente.mehr', { name: x.name })} nurSymbol groesse={handy ? 'normal' : 'klein'}
                                punkte={[...menuePunkte, ...(!nurLesen ? [{ key: 'entfernen', symbol: 'geloescht' as const, inhalt: t('ablage.dokumente.entfernen'), titel: t('ablage.dokumente.entfernen.titel'), tu: () => entfernen(x) }] : [])]} />
                            </>}
                      </div>
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
                          <Knopf art="haupt" groesse="klein" onClick={() => { setPdfMeldung(undefined); setKleinOffen(undefined); setSchwarzOffen(undefined); setTeilVorschlag({ id: x.id, ab: x.teilenAb! }); setSeitenOffen(x.id); }}>{t('volltext.teilen.knopf')}</Knopf>
                          <Knopf art="link" groesse="klein" onClick={() => teilenAusblenden(x.id)}>{t('volltext.teilen.weg')}</Knopf>
                          <Hilfe ort="dokumente.sprachen" />
                        </span>
                      </div>
                    )}
                    {post && !weg && seitenOffen !== x.id && <LeerseitenBlock x={x} l={leer.von(x)} darf={bearbeitbar} geaendert={(l) => leer.setze(x.id, l)} />}
                    {seitenOffen === x.id && !weg && (
                      <PdfSeiten d={x} post={!!post} versioniert={versioniert} papierkorb={!!d.zaehler.papierkorbTage} teilAb={teilVorschlag?.id === x.id ? teilVorschlag.ab : undefined}
                        schliessen={() => { setSeitenOffen(undefined); setTeilVorschlag(undefined); }} fertig={(r) => { setTeilVorschlag(undefined); void pdfFertig(r); }} />
                    )}
                    {auf && anzeige(x, sicht, <UeberDokument x={x} s={s} versioniert={versioniert} textOffen={text?.id === x.id}
                      text={() => void zeigeText(x.id)} neu={nurLesen ? undefined : () => void erneut(x.id)}
                      archivnummer={!nurLesen && neuLaden ? () => setAsn({ id: x.id, wert: x.archivnummer ?? '' }) : undefined}
                      versionen={() => setVersionenOffen(versionenOffen === x.id ? undefined : x.id)} />)}
                    {!auf && !weg && ueberOffen === x.id && <UeberDokument x={x} s={s} versioniert={versioniert} textOffen={text?.id === x.id}
                      text={() => void zeigeText(x.id)} neu={nurLesen ? undefined : () => void erneut(x.id)}
                      archivnummer={!nurLesen && neuLaden ? () => setAsn({ id: x.id, wert: x.archivnummer ?? '' }) : undefined}
                      versionen={() => setVersionenOffen(versionenOffen === x.id ? undefined : x.id)} />}
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
      <Knopf laeuft={laeuft} laeuftText={t('ablage.dokumente.lade')} onClick={() => void teile()}>{datei ? t('ablage.dokumente.jetzt-teilen') : t('ablage.dokumente.teilen')}</Knopf>
      {fehler && <span className="fehlertext klein">{fehler}</span>}
    </>
  );
}

/** Art der Datei in Worten (#1211): „PDF“, „Bild“, „E-Mail“ – statt des Medientyps. */
function artVon(x: Pick<Dokument, 'mime' | 'name'>): string {
  if (x.mime === 'application/pdf') return t('ablage.dokumente.art.pdf');
  if (x.mime.startsWith('image/')) return t('ablage.dokumente.art.bild');
  if (x.mime === 'message/rfc822' || /\.eml$/i.test(x.name)) return t('ablage.dokumente.art.email');
  return t('ablage.dokumente.art.datei');
}

/** Woher das Dokument kommt (#1211): „über einen Eingang gekommen“ statt „Eingangskanal“, nie „unbekannt“. */
const herkunftVon = (h: Herkunft | null | undefined) => (h === 'eingang' ? t('ablage.dokumente.herkunft.eingang') : HERKUNFT[h ?? 'hochgeladen'] ?? h ?? HERKUNFT.hochgeladen);

/** Eine Infozeile (#1211): Art · Seiten · Größe · Datum · Herkunft · Version und Archivnummer, wenn vorhanden. */
function Infozeile({ x, s }: { x: Dokument; s?: OcrStand }) {
  const teile: ReactNode[] = [artVon(x), s?.stand === 'fertig' && s.seiten ? t('ablage.dokumente.info.seiten', { anzahl: s.seiten }) : null, groesse(x.groesse), zeit(x.erstellt),
    <>{herkunftVon(x.herkunft)} · <Person id={x.erstelltVon} /></>, (x.version ?? 1) > 1 ? t('ablage.dokumente.version-2', { wert: x.version ?? 1 }) : null,
    x.archivnummer ? tn('ablage.dokumente.archivnummer-2', { b: <strong className="mono">{x.archivnummer}</strong> }) : null].filter((v) => v !== null && v !== '');
  return <>{teile.map((v, i) => <Fragment key={i}>{i > 0 && ' · '}{v}</Fragment>)}</>;
}

/** Zustand (#1211): nur, wenn etwas nicht stimmt – als ruhige Zeile mit Ausweg („Text nicht lesbar … [Erneut versuchen]“). */
function Zustand({ s, archiv, erneut }: { s?: OcrStand; archiv?: ArchivStand | null; erneut(): void }) {
  const text = s && (s.stand === 'fehler' || s.stand === 'ausgelassen');
  const archivFehler = archiv?.stand === 'fehler';
  if (!text && !archivFehler) return null;
  return (
    <span className="dokzustand klein">
      {text && <span><Symbol name="warnung" /> {s!.info ? t('ablage.dokumente.zustand.text', { grund: s!.info }) : t('ablage.dokumente.zustand.text-ohne')}{' '}
        <Knopf art="link" groesse="klein" onClick={erneut}>{t('ablage.dokumente.erneut-versuchen')}</Knopf></span>}
      {archivFehler && <span><Symbol name="warnung" /> {t('ablage.dokumente.zustand.archiv', { grund: archiv!.info ?? '' })}</span>}
    </span>
  );
}

/**
 * „Über dieses Dokument“ (#1211) unter der geöffneten Anzeige: Text, Archivnummer, Eingang, Versionen, Archivfassung –
 * je nur Wert und Knopf. Hier steht die Technik, die früher in der Zeile stand (Herkunft des Texts, PDF/A-Stufe).
 */
function UeberDokument({ x, s, versioniert, textOffen, text, neu, archivnummer, versionen }: {
  x: Dokument; s?: OcrStand; versioniert: boolean; textOffen: boolean; text(): void; neu?: () => void; archivnummer?: () => void; versionen(): void;
}) {
  const herkunft = s ? herkunftText(s) : '';
  const a = x.archivfassung;
  const f = a?.stand === 'fertig' ? a.fassung : undefined;
  const sprache = s?.stand === 'fertig' ? (x.sprache ? { sprache: x.sprache } : spracheAusInfo(s.info)) : null;
  // Fortschritt des Pakets (#458), umgewandelte Fassung mit Link (#577), „wartet auf Paket“ statt Texterkennung (#614).
  const fortschritt = s?.stand === 'paket' ? /\(Paket .+?\) – (.+)$/.exec(s.info ?? '')?.[1] : undefined;
  const fassung = s?.stand === 'fertig' ? fassungAusInfo(s.info) : null;
  const art = s ? volltextHerkunft(s)?.art : undefined;
  const standText = s?.stand === 'paket' && (art === 'umwandlung' || art === 'volltext') ? t('volltext.stand.paket') : s ? OCR_STAENDE[s.stand] : '';
  return (
    <dl className="dok-ueber klein" aria-label={t('ablage.dokumente.ueber.titel')}>
      <div><dt>{t('ablage.dokumente.ueber.text')}</dt>
        <dd>{s?.stand === 'fertig' ? [herkunft, sprache ? sprachenAnzeige(sprache.sprache, x.weitereSprachen) : ''].filter(Boolean).join(' · ') || t('ablage.dokumente.text-anzeigen') : s && s.stand !== 'keiner' ? [standText, herkunft, fortschritt].filter(Boolean).join(' · ') : t('ablage.dokumente.ueber.kein-text')}
          {fassung && <> · {t('volltext.herkunft.fassung', { paket: fassung })} <a className="verweis" href={fassungUrl(x.id)} target="_blank" rel="noreferrer" title={t('volltext.herkunft.fassung.titel')}>{t('volltext.herkunft.fassung.ansehen')}</a></>}
          {s?.stand === 'fertig' && <Knopf art="link" groesse="klein" onClick={text}>{textOffen ? t('ablage.dokumente.text-ausblenden') : t('ablage.dokumente.ueber.zeigen')}</Knopf>}
          {neu && (s?.stand === 'fertig' || s?.stand === 'paket') && <Knopf art="link" groesse="klein" title={t('volltext.dokument.neu.titel')} onClick={neu}>{t('volltext.dokument.neu')}</Knopf>}</dd></div>
      <div><dt>{t('ablage.dokumente.ueber.archivfassung')}</dt>
        <dd>{f ? t('volltext.archiv.chip.fertig', { pdfa: pdfaName(f.pdfa) }) : a ? t.frei(`volltext.archiv.chip.${a.stand}`) : t('ablage.dokumente.ueber.keine')}
          {f?.imOriginal && <> · {t('volltext.archiv.im-original')}</>}{a?.stand === 'wartet' && a.paket && <> · {t('volltext.archiv.wartet', { paket: a.paket.name })}</>}{a && a.stand !== 'wartet' && a.info && <> · {a.info}</>}
          {f?.signiert && <> · {t('volltext.archiv.signiert')}</>}{f?.weggelassen && <> · {t('volltext.archiv.weggelassen')}</>}{f?.erechnung && <> · {t('volltext.archiv.erechnung')}</>}</dd></div>
      <div><dt>{t('ablage.dokumente.ueber.archivnummer')}</dt>
        <dd>{x.archivnummer ? <strong className="mono">{x.archivnummer}</strong> : t('ablage.dokumente.ueber.keine')}
          {archivnummer && <Knopf art="link" groesse="klein" title={t('ablage.dokumente.nummer-vom-aufkleber-auf')} onClick={archivnummer}>{x.archivnummer ? t('ablage.dokumente.ueber.aendern') : t('ablage.dokumente.ueber.vergeben')}</Knopf>}</dd></div>
      <div><dt>{t('ablage.dokumente.ueber.eingang')}</dt><dd>{zeit(x.erstellt)} · {herkunftVon(x.herkunft)} · <Person id={x.erstelltVon} /></dd></div>
      {(versioniert || (x.version ?? 1) > 1) && <div><dt>{t('ablage.dokumente.ueber.versionen')}</dt>
        <dd>{t('ablage.dokumente.ueber.version', { wert: x.version ?? 1 })}<Knopf art="link" groesse="klein" onClick={versionen}>{t('ablage.dokumente.menue.versionen')}</Knopf></dd></div>}
    </dl>
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

type Ansichtsart = 'archiv' | 'lesefassung' | 'entsperrt' | 'original';

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
        <Feld id={`entsperren-${x.id}`} beschriftung={t('mappen.entsperren.passwort')} beschriftungVerbergen>
          <input type={zeigen ? 'text' : 'password'} value={passwort} autoComplete="off" spellCheck={false}
            placeholder={t('mappen.entsperren.passwort')} onChange={(e) => setPasswort(e.target.value)} />
        </Feld>
        <Knopf groesse="klein" nurSymbol={zeigen ? t('mappen.entsperren.verbergen') : t('mappen.entsperren.anzeigen')} onClick={() => setZeigen(!zeigen)}><Symbol name={zeigen ? 'auge-aus' : 'auge'} /></Knopf>
        <Knopf art="haupt" groesse="klein" type="submit" gesperrt={!passwort || (merken && !name.trim())} laeuft={sendet}>{t('mappen.entsperren.knopf')}</Knopf>
      </div>
      {!vertretung && (
        <HakenFeld beschriftung={t('mappen.entsperren.merken')} hinweis={t('mappen.entsperren.merken.hilfe')}>
          <input type="checkbox" checked={merken} onChange={(e) => setMerken(e.target.checked)} />
        </HakenFeld>
      )}
      {merken && (
        <Feld beschriftung={t('mappen.entsperren.name')}>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t('mappen.entsperren.name.beispiel')} />
        </Feld>
      )}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </form>
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
                {v.anzeigbar && <a className="symbolverweis" href={versionUrl(d.id, v.nummer)} target="_blank" rel="noreferrer" title={t('ablage.dokumente.ansehen')} aria-label={t('ablage.dokumente.version-ansehen', { nummer: v.nummer })}><Symbol name="extern" /></a>}
                {!mitnehmen ? null : mitStempel ? kannStempeln(v.mime) && <Knopf art="link" onClick={() => mitStempel(v.nummer)}>{t('ablage.dokumente.mit-stempel-herunterladen')}</Knopf>
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
