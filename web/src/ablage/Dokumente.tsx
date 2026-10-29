import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { MAX_DATEIGROESSE, OCR_STAENDE, type Dokument, type OcrStand, type Register } from '../../../shared/src/model';
import { api, dokumentUrl } from '../api';
import { useDaten } from '../daten';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';

/**
 * Dokumentenregister: hochladen (übernommen mit „Mappe speichern“), ansehen direkt unter der
 * Zeile (#85), sortieren (#86), mehrere auswählen und gemeinsam herunterladen oder löschen (#87).
 */

/** Eine Datei, die erst beim Speichern der Mappe hochgeladen wird. */
export interface NeueDatei { uid: string; datei: File; register: string }

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

export function Dokumente({ register, dokumente: roh, neue, entfernt, hinzufuegen, entferne, entferneMehrere, vergiss }: {
  register: Register; dokumente: Dokument[]; neue: NeueDatei[]; entfernt: string[];
  hinzufuegen(d: File[]): void; entferne(id: string): void; entferneMehrere(ids: string[]): void; vergiss(uid: string): void;
}) {
  const d = useDaten();
  const auswahlFeld = useRef<HTMLInputElement>(null);
  const [ziehen, setZiehen] = useState(false);
  const [zuGross, setZuGross] = useState<string[]>([]);
  const [ansicht, setAnsicht] = useState<string>();
  const offenRef = useRef<HTMLLIElement>(null);
  const sortierung = (d.einstellungen.dokumente_sortierung as Dokumentsortierung | undefined) ?? 'name';
  const dokumente = sortiereDokumente(roh, sortierung in DOKUMENT_SORTIERUNGEN ? sortierung : 'name');
  // Auswahl (#87): je Register; verschwindet mit dem Register bzw. der Mappe (eigene Instanz).
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [anker, setAnker] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  const waehlbar = dokumente.filter((x) => !entfernt.includes(x.id));
  const auswahl = waehlbar.filter((x) => gewaehlt.has(x.id));

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
  const alleAn = waehlbar.length > 0 && auswahl.length === waehlbar.length;

  return (
    <div className="dokumente">
      <div className={`ablagezone ${ziehen ? 'zieht' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setZiehen(true); }} onDragLeave={() => setZiehen(false)} onDrop={fallen}>
        <p>Dateien hierher ziehen oder <button type="button" className="textknopf" onClick={() => auswahlFeld.current?.click()}>auswählen</button></p>
        <p className="leise klein">Bis 100 MB je Datei. Übernommen wird mit „Mappe speichern“.</p>
        <input ref={auswahlFeld} type="file" multiple hidden onChange={(e) => { if (e.target.files) nimm(e.target.files); e.target.value = ''; }} />
      </div>
      {zuGross.length > 0 && <div className="hinweis schlecht"><p>Zu groß (über 100 MB): {zuGross.join(', ')}</p></div>}
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
                  <button type="button" className="knopf klein gefahr-rand" onClick={auswahlLoeschen}>Löschen</button>
                </>}
                <label className="sortwahl klein"><span className="leise">Sortieren:</span>
                  <select value={sortierung} onChange={(e) => d.setzeEinstellung('dokumente_sortierung', e.target.value === 'name' ? null : e.target.value)}>
                    {Object.entries(DOKUMENT_SORTIERUNGEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></label>
                <Hilfe ort="dokumente.sortieren" />
              </div>
            )}
            {hinweis && <div className="hinweis info"><p>{hinweis}</p></div>}
            <ul className="dokumentliste">
              {neue.map((n) => (
                <li key={n.uid} className="neu">
                  <div className="dokzeile">
                    <div className="dokname">
                      <span>{n.datei.name} <span className="chip gut">neu</span></span>
                      <span className="leise klein">{groesse(n.datei.size)} · wird beim Speichern hochgeladen</span>
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
                      <div className="dokname">
                        {klickbar
                          ? <button type="button" className="textknopf" aria-expanded={auf} onClick={() => umschalten(x)}>{x.name}</button>
                          : <span className="dateiname">{x.name}</span>}
                        <span className="leise klein">{weg ? 'wird beim Speichern gelöscht' : <>{groesse(x.groesse)} · {zeit(x.erstellt)} · <Person id={x.erstelltVon} /></>}</span>
                        {!weg && <OcrAnzeige s={standVon(x)} erneut={() => void erneut(x.id)} text={() => void zeigeText(x.id)} textOffen={text?.id === x.id} />}
                        {!weg && text?.id === x.id && <pre className="volltext">{text.text ?? 'Kein Volltext vorhanden.'}</pre>}
                      </div>
                      <div className="zeilenaktionen">
                        {klickbar && <a className="symbolverweis" href={dokumentUrl(x.id)} target="_blank" rel="noreferrer" title="In neuem Tab öffnen" aria-label={`${x.name} in neuem Tab öffnen`}>↗</a>}
                        {!weg && <a className="textknopf" href={dokumentUrl(x.id, true)}>Herunterladen</a>}
                        <button type="button" className={`textknopf ${weg ? '' : 'gefahr'}`} onClick={() => entferne(x.id)}>{weg ? 'Behalten' : 'Löschen'}</button>
                      </div>
                    </div>
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
