import { Vorschaubild } from './Vorschaubild';
import { PdfSeiten } from './PdfSeiten';
import { Link } from '../ort';
import { Fundstellen, fundstellenFuer } from './Doppelt';
import { useMappenZiel } from './NeuePost';
import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { HERKUNFT, MAX_DATEIGROESSE, OCR_STAENDE, type Mappe, type Dokument, type DokumentVersion, type Herkunft, type OcrStand, type Register } from '../../../shared/src/model';
import { api, dokumentUrl, versionUrl, type Fundstelle } from '../api';
import { useDaten } from '../daten';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';

/**
 * Dokumentenregister: hochladen (übernommen mit „Mappe speichern“), ansehen direkt unter der
 * Zeile (#85), sortieren (#86), mehrere auswählen und gemeinsam herunterladen oder löschen (#87).
 */

/** Eine Datei, die erst beim Speichern der Mappe hochgeladen wird. */
/** gleicherName (#194): was mit einem Dokument gleichen Namens im Register passiert. */
export interface NeueDatei { uid: string; datei: File; register: string; gleicherName?: 'zaehler' | 'version' | 'ersetzen' }

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
export const groesse = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/** Reihenfolgen der Dokumente (#86); gemerkt je Benutzer für alle Dokumentenregister. */
export const DOKUMENT_SORTIERUNGEN = {
  name: 'Name A–Z', name_ab: 'Name Z–A', neu: 'Neueste zuerst', alt: 'Älteste zuerst', gross: 'Größte zuerst',
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

export function Dokumente({ register, dokumente: roh, neue, entfernt, hinzufuegen, entferne, entferneMehrere, vergiss, nurLesen, setzeNeue, neuLaden, post }: {
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
}) {
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
    if (datei.size > MAX_DATEIGROESSE) { setVersionFehler(`„${datei.name}“ ist zu groß (über 100 MB).`); return; }
    try { await api.ersetzen(id, datei); await neuLaden?.(); } catch (e) { setVersionFehler((e as Error).message); }
  }
  const d = useDaten();
  // PDF bearbeiten (#335): Seitenansicht je Dokument, Zusammenfügen der Auswahl.
  const [seitenOffen, setSeitenOffen] = useState<string>();
  const [pdfMeldung, setPdfMeldung] = useState<ReactNode>();
  const [zusammen, setZusammen] = useState<{ name: string; entfernen: boolean; laeuft?: boolean; fehler?: string } | null>(null);
  const bearbeitbar = !nurLesen && !!neuLaden;
  const auswahlFeld = useRef<HTMLInputElement>(null);
  const [ziehen, setZiehen] = useState(false);
  const [zuGross, setZuGross] = useState<string[]>([]);
  // ?dokument=… (#345: Sprung über die Archivnummer) zeigt dieses Dokument gleich an.
  const [ansicht, setAnsicht] = useState<string | undefined>(() => { const w = new URLSearchParams(location.search).get('dokument'); return roh.some((x) => x.id === w && x.anzeigbar) ? w! : undefined; });
  const offenRef = useRef<HTMLLIElement>(null);
  const sortierung = (d.einstellungen.dokumente_sortierung as Dokumentsortierung | undefined) ?? 'name';
  const dokumente = sortiereDokumente(roh, sortierung in DOKUMENT_SORTIERUNGEN ? sortierung : 'name');
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
      ? <>{r.posten.length} neue Posts angelegt: {r.posten.map((p, i) => <span key={p.id}>{i > 0 && ', '}<Link to={`/ablage/${p.typId}/${p.id}`} className="verweis">{String(p.werte.betreff ?? 'Post')}</Link></span>)}. Diese Post ist erledigt.</>
      : r.dokumente.length > 1 ? `In ${r.dokumente.length} Dokumente geteilt.` : `„${r.dokumente[0]?.name}“ gespeichert${versioniert ? ` – Version ${r.dokumente[0]?.version ?? 1}` : ''}.`);
    await neuLaden?.();
  }
  async function fuegeZusammen() {
    if (!zusammen) return;
    const ohneKorb = !d.zaehler.papierkorbTage;
    if (zusammen.entfernen && ohneKorb && !(await rueckfrage({ titel: 'Ausgangsdokumente endgültig löschen?', text: `Der Papierkorb ist ausgeschaltet: Die ${pdfAuswahl.length} Ausgangsdokumente sind nach dem Zusammenfügen endgültig weg.`, ja: 'Zusammenfügen und löschen', gefahr: true }))) return;
    setZusammen({ ...zusammen, laeuft: true, fehler: undefined });
    try {
      const r = await api.fuegePdfZusammen({ dokumente: pdfAuswahl.map((x) => x.id), name: zusammen.name.trim() || undefined, register: register.key, originaleEntfernen: zusammen.entfernen, bestaetigt: zusammen.entfernen && ohneKorb });
      setZusammen(null); setGewaehlt(new Set());
      setPdfMeldung(`${pdfAuswahl.length} PDFs zu „${r.dokument.name}“ zusammengefügt.`);
      await neuLaden?.();
    } catch (e) { setZusammen((z) => z && { ...z, laeuft: false, fehler: (e as Error).message }); }
  }

  // Texterkennung (#45): Stand nachladen, solange etwas wartet oder läuft.
  const [ocr, setOcr] = useState<Record<string, OcrStand | undefined>>({});
  const [text, setText] = useState<{ id: string; text: string | null } | null>(null);
  const standVon = (x: Dokument) => ocr[x.id] ?? x.ocr;
  const offen = dokumente.some((x) => { const s = standVon(x)?.stand; return s === 'wartet' || s === 'laeuft'; });
  useEffect(() => {
    if (!offen || !dokumente.length) return;
    const t = setTimeout(() => {
      void api.mappe(dokumente[0].mappeId).then((m) => setOcr(Object.fromEntries(m.dokumente.map((x) => [x.id, x.ocr]))), () => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [offen, ocr, dokumente.length]); // eslint-disable-line react-hooks/exhaustive-deps
  async function erneut(id: string) {
    try { const x = await api.texterkennungErneut(id); setOcr((o) => ({ ...o, [id]: x.ocr })); } catch { /* bleibt */ }
  }
  async function zeigeText(id: string) {
    if (text?.id === id) { setText(null); return; }
    try { setText({ id, text: (await api.volltext(id)).text }); } catch { setText({ id, text: null }); }
  }

  // Die geöffnete Anzeige steht direkt unter ihrer Zeile und wird sichtbar gescrollt (#85).
  useEffect(() => {
    if (ansicht) offenRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ansicht]);
  const umschalten = (x: Dokument) => { if (x.anzeigbar && !entfernt.includes(x.id)) setAnsicht(x.id === ansicht ? undefined : x.id); };
  const zeilenKlick = (x: Dokument, e: MouseEvent) => {
    // Knöpfe, Links, Kästchen und der Volltext behalten ihre eigene Funktion.
    if ((e.target as HTMLElement).closest('a, button, input, label, pre, .dokansicht')) return;
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
    setHinweis(ersterMal ? 'Dein Browser fragt beim ersten Mal womöglich, ob diese Seite mehrere Dateien auf einmal herunterladen darf – bitte erlauben.' : undefined);
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
  useMappenZiel(nurLesen ? null : { name: register.name, nimm });
  const alleAn = waehlbar.length > 0 && auswahl.length === waehlbar.length;

  return (
    <div className="dokumente">
      {!nurLesen && <div className={`ablagezone ${ziehen ? 'zieht' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setZiehen(true); }} onDragLeave={() => setZiehen(false)} onDrop={fallen}>
        <p>Dateien hierher ziehen oder <button type="button" className="textknopf" onClick={() => auswahlFeld.current?.click()}>auswählen</button></p>
        <p className="leise klein">Bis 100 MB je Datei. Übernommen wird mit „Mappe speichern“.</p>
        <input ref={auswahlFeld} type="file" multiple hidden onChange={(e) => { if (e.target.files) nimm(e.target.files); e.target.value = ''; }} />
      </div>}
      {zuGross.length > 0 && <div className="hinweis schlecht"><p>Zu groß (über 100 MB): {zuGross.join(', ')}</p></div>}
      <input ref={ersetzFeld} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ersetze(f); else setErsetzeId(undefined); }} />
      {versionFehler && <div className="hinweis schlecht"><p>{versionFehler}</p></div>}
      {dokumente.length + neue.length === 0
        ? <p className="leise">Noch keine Dokumente in „{register.name}“.</p>
        : <>
            {dokumente.length > 0 && (
              <div className="dokleiste">
                <label className="haken klein"><input type="checkbox" checked={alleAn} disabled={!waehlbar.length}
                  ref={(el) => { if (el) el.indeterminate = auswahl.length > 0 && !alleAn; }}
                  onChange={() => setGewaehlt(alleAn ? new Set() : new Set(waehlbar.map((x) => x.id)))} />
                  <span>{auswahl.length ? `${auswahl.length} von ${waehlbar.length} ausgewählt` : 'Alle auswählen'}</span></label>
                <Hilfe ort="dokumente.mehrere" />
                {auswahl.length > 0 && <>
                  <button type="button" className="knopf klein" onClick={alleHerunterladen}>Herunterladen</button>
                  {bearbeitbar && pdfAuswahl.length >= 2 && <button type="button" className="knopf klein" aria-expanded={!!zusammen}
                    onClick={() => setZusammen(zusammen ? null : { name: pdfAuswahl[0].name, entfernen: false })}>Zusammenfügen</button>}
                  {!nurLesen && <button type="button" className="knopf klein gefahr-rand" onClick={auswahlLoeschen}>Löschen</button>}
                </>}
                <label className="sortwahl klein"><span className="leise">Sortieren:</span>
                  <select value={sortierung} onChange={(e) => d.setzeEinstellung('dokumente_sortierung', e.target.value === 'name' ? null : e.target.value)}>
                    {Object.entries(DOKUMENT_SORTIERUNGEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></label>
                <Hilfe ort="dokumente.sortieren" />
              </div>
            )}
            {hinweis && <div className="hinweis info"><p>{hinweis}</p></div>}
            {zusammen && pdfAuswahl.length >= 2 && (
              <div className="zusammenfuegen" role="group" aria-label="PDFs zusammenfügen">
                <span className="klein">{pdfAuswahl.length} PDFs in der Reihenfolge der Liste zu einem:</span>
                <label className="eigenschaft klein"><span>Name</span><input value={zusammen.name} onChange={(e) => setZusammen({ ...zusammen, name: e.target.value })} /></label>
                <label className="haken klein"><input type="checkbox" checked={zusammen.entfernen} onChange={(e) => setZusammen({ ...zusammen, entfernen: e.target.checked })} />
                  <span>Ausgangsdokumente {d.zaehler.papierkorbTage ? 'in den Papierkorb legen' : 'löschen (endgültig)'}</span></label>
                <button type="button" className="knopf primaer klein" disabled={zusammen.laeuft} onClick={() => void fuegeZusammen()}>{zusammen.laeuft ? 'Wird zusammengefügt …' : 'Zusammenfügen'}</button>
                <button type="button" className="knopf klein" disabled={zusammen.laeuft} onClick={() => setZusammen(null)}>Abbrechen</button>
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
                      <span>{n.datei.name} <span className="chip gut">neu</span></span>
                      <span className="leise klein">{groesse(n.datei.size)} · wird beim Speichern hochgeladen</span>
                      {doppelt[n.uid] && <span className="hinweis warn doppelthinweis"><Fundstellen f={doppelt[n.uid]} /> Beim Speichern wird sie trotzdem abgelegt – sonst „Nicht hochladen“.</span>}
                      {/* Gleicher Name wie ein vorhandenes Dokument (#194): nachfragen. */}
                      {(() => {
                        const gleich = dokumente.find((x) => !entfernt.includes(x.id) && x.name.toLowerCase() === n.datei.name.toLowerCase());
                        if (!gleich || !setzeNeue) return null;
                        const wahl = n.gleicherName ?? (versioniert ? 'version' : 'zaehler');
                        return (
                          <label className="eigenschaft klein gleichername"><span>Es gibt schon „{gleich.name}“:</span>
                            <select value={wahl} onChange={(e) => setzeNeue(n.uid, { gleicherName: e.target.value as NeueDatei['gleicherName'] })}>
                              {versioniert && <option value="version">als neue Version von „{gleich.name}“ speichern</option>}
                              <option value="zaehler">als eigenes Dokument mit Zähler, z. B. „{mitZaehler(n.datei.name)}“</option>
                              {!versioniert && <option value="ersetzen">altes Dokument löschen und neues hochladen (Löschen ist endgültig)</option>}
                            </select></label>
                        );
                      })()}
                    </div>
                    <div className="zeilenaktionen"><button type="button" className="textknopf" onClick={() => vergiss(n.uid)}>Nicht hochladen</button></div>
                  </div>
                </li>
              ))}
              {dokumente.map((x) => {
                const weg = entfernt.includes(x.id);
                const auf = x.id === ansicht && !weg;
                const klickbar = x.anzeigbar && !weg;
                return (
                  <li key={x.id} ref={auf ? offenRef : undefined} className={`${auf ? 'an' : ''} ${weg ? 'weg' : ''} ${klickbar ? 'klickbar' : ''} ${gewaehlt.has(x.id) && !weg ? 'gewaehlt' : ''}`}
                    onClick={(e) => zeilenKlick(x, e)}>
                    <div className="dokzeile">
                      <input type="checkbox" className="dokwahl" aria-label={`${x.name} auswählen`} disabled={weg} checked={gewaehlt.has(x.id) && !weg}
                        onClick={(e) => waehle(x, (e.target as HTMLInputElement).checked, e.shiftKey)} onChange={() => {}} />
                      <Vorschaubild d={x} />
                      <div className="dokname">
                        {klickbar
                          ? <button type="button" className="textknopf" aria-expanded={auf} onClick={() => umschalten(x)}>{x.name}</button>
                          : <span className="dateiname">{x.name}</span>}
                        <span className="leise klein">{weg ? (d.zaehler.papierkorbTage ? 'kommt beim Speichern in den Papierkorb' : 'wird beim Speichern endgültig gelöscht') : <>{groesse(x.groesse)} · {zeit(x.erstellt)} · <Person id={x.erstelltVon} />
                          {(versioniert || (x.version ?? 1) > 1) && <> · <button type="button" className="textknopf klein" aria-expanded={versionenOffen === x.id} onClick={() => setVersionenOffen(versionenOffen === x.id ? undefined : x.id)}>Version {x.version ?? 1}</button></>}</>}</span>
                        {!weg && (x.archivnummer || asn?.id === x.id) && (asn?.id === x.id
                          ? <form className="asnform" onSubmit={(e) => { e.preventDefault(); void speichereAsn(); }}>
                              <label className="klein"><span className="sr">Archivnummer</span>
                                <input autoFocus value={asn.wert} maxLength={40} placeholder="z. B. A-000123" onChange={(e) => setAsn({ ...asn, wert: e.target.value, fehler: undefined })} /></label>
                              <button className="knopf klein primaer">Übernehmen</button>
                              <button type="button" className="textknopf klein" onClick={() => setAsn(null)}>Abbrechen</button>
                              <Hilfe ort="dokumente.archivnummer" />
                              {asn.fehler && <span className="fehlertext klein">{asn.fehler}</span>}
                            </form>
                          : <span className="klein">Archivnummer <strong className="mono">{x.archivnummer}</strong>
                              {!nurLesen && neuLaden && <> · <button type="button" className="textknopf klein" onClick={() => setAsn({ id: x.id, wert: x.archivnummer ?? '' })}>ändern</button></>}</span>)}
                        {!weg && versionenOffen === x.id && <Versionen d={x} zurueck={!nurLesen && versioniert} neuLaden={neuLaden} />}
                        {!weg && <OcrAnzeige s={standVon(x)} erneut={() => void erneut(x.id)} text={() => void zeigeText(x.id)} textOffen={text?.id === x.id} />}
                        {!weg && text?.id === x.id && <pre className="volltext">{text.text ?? 'Kein Volltext vorhanden.'}</pre>}
                      </div>
                      <div className="zeilenaktionen">
                        {klickbar && <a className="symbolverweis" href={dokumentUrl(x.id)} target="_blank" rel="noreferrer" title="In neuem Tab öffnen" aria-label={`${x.name} in neuem Tab öffnen`}>↗</a>}
                        {!weg && <a className="textknopf" href={dokumentUrl(x.id, true)}>Herunterladen</a>}
                        {bearbeitbar && !weg && x.mime === 'application/pdf' && <button type="button" className="textknopf" aria-expanded={seitenOffen === x.id}
                          onClick={() => { setPdfMeldung(undefined); setSeitenOffen(seitenOffen === x.id ? undefined : x.id); }} title="Seiten drehen, löschen, umsortieren oder teilen">Seiten</button>}
                        {!weg && !nurLesen && neuLaden && !x.archivnummer && asn?.id !== x.id && <button type="button" className="textknopf" title="Nummer vom Aufkleber auf dem Papieroriginal eintragen" onClick={() => setAsn({ id: x.id, wert: '' })}>Archivnummer</button>}
                        {!nurLesen && versioniert && !weg && <button type="button" className="textknopf" onClick={() => { setErsetzeId(x.id); ersetzFeld.current?.click(); }} title="Neue Version hochladen; die bisherige bleibt erhalten">Ersetzen</button>}
                        {!nurLesen && <button type="button" className={`textknopf ${weg ? '' : 'gefahr'}`} onClick={async () => {
                          // Mit allen Versionen (#194): nachfragen, mit Zahl.
                          if (!weg && (x.aeltere ?? 0) > 0 && !(await rueckfrage({ titel: `„${x.name}“ mit allen ${(x.aeltere ?? 0) + 1} Versionen löschen?`, text: d.zaehler.papierkorbTage ? 'Sie kommen beim Speichern in den Papierkorb und lassen sich von dort wiederherstellen.' : 'Das ist endgültig.', ja: 'Löschen', gefahr: true }))) return;
                          entferne(x.id);
                        }}>{weg ? 'Behalten' : 'Löschen'}</button>}
                      </div>
                    </div>
                    {seitenOffen === x.id && !weg && (
                      <PdfSeiten d={x} post={!!post} versioniert={versioniert} papierkorb={!!d.zaehler.papierkorbTage}
                        schliessen={() => setSeitenOffen(undefined)} fertig={(r) => void pdfFertig(r)} />
                    )}
                    {auf && (
                      <div className="dokansicht">
                        {x.mime === 'application/pdf'
                          ? <iframe src={dokumentUrl(x.id)} title={x.name} />
                          : <img src={dokumentUrl(x.id)} alt={x.name} />}
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

/** Stand der Texterkennung an einem Dokument (#45). */
function OcrAnzeige({ s, erneut, text, textOffen }: { s?: OcrStand; erneut(): void; text(): void; textOffen: boolean }) {
  if (!s || s.stand === 'keiner') return null;
  const klasse = s.stand === 'fertig' ? 'gut' : s.stand === 'fehler' ? 'schlecht' : s.stand === 'ausgelassen' ? '' : 'warn';
  return (
    <span className="ocrstand klein">
      <span className={`chip ${klasse}`} title={s.info ?? undefined}>Volltext: {OCR_STAENDE[s.stand]}{s.stand === 'fertig' && s.seiten ? ` · ${s.seiten} ${s.seiten === 1 ? 'Seite' : 'Seiten'}` : ''}</span>
      {(s.stand === 'fehler' || s.stand === 'ausgelassen') && s.info && <span className="leise">{s.info}</span>}
      {s.stand === 'fertig' && <button type="button" className="textknopf" onClick={text}>{textOffen ? 'Text ausblenden' : 'Text anzeigen'}</button>}
      {(s.stand === 'fehler' || s.stand === 'ausgelassen') && <button type="button" className="textknopf" onClick={erneut}>Erneut versuchen</button>}
    </span>
  );
}

/** „Rechnung.pdf“ → „Rechnung (2).pdf“ (wie der Server bei gleichem Namen). */
function mitZaehler(name: string) {
  const p = name.lastIndexOf('.');
  return p > 0 ? `${name.slice(0, p)} (2)${name.slice(p)}` : `${name} (2)`;
}

/** Alle Versionen eines Dokuments (#194): ansehen, herunterladen, zurückholen. */
function Versionen({ d, zurueck, neuLaden }: { d: Dokument; zurueck: boolean; neuLaden?: () => Promise<void> }) {
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
        <thead><tr><th>Version</th><th>Datei</th><th>Gespeichert</th><th>Von</th><th>Herkunft</th><th>Größe</th><th /></tr></thead>
        <tbody>
          <tr><td><strong>{d.version ?? 1}</strong> (aktuell)</td><td>{d.name}</td><td>{zeit(d.erstellt)}</td><td><Person id={d.erstelltVon} /></td><td>{herkunft(d.herkunft)}</td><td>{groesse(d.groesse)}</td><td /></tr>
          {liste === null ? <tr><td colSpan={7} className="leise">Lade …</td></tr> : liste.map((v) => (
            <tr key={v.nummer}>
              <td>{v.nummer}</td><td>{v.name}</td><td>{zeit(v.erstellt)}</td><td><Person id={v.erstelltVon} /></td><td>{herkunft(v.herkunft)}</td><td>{groesse(v.groesse)}</td>
              <td className="zeilenaktionen">
                {v.anzeigbar && <a className="symbolverweis" href={versionUrl(d.id, v.nummer)} target="_blank" rel="noreferrer" title="Ansehen" aria-label={`Version ${v.nummer} ansehen`}>↗</a>}
                <a className="textknopf" href={versionUrl(d.id, v.nummer, true)}>Herunterladen</a>
                {zurueck && <button type="button" className="textknopf" onClick={async () => { if (await rueckfrage({ titel: `Version ${v.nummer} zurückholen?`, text: `Sie wird zur neuen Version ${(d.version ?? 1) + 1}; nichts geht verloren.`, ja: 'Zurückholen' })) void hole(v.nummer); }}>Zurückholen</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {liste !== null && !liste.length && <p className="leise klein">Keine älteren Versionen.</p>}
      <p className="leise klein"><Hilfe ort="dokumente.versionen" /></p>
    </div>
  );
}
