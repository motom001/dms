import { useEffect, useState } from 'react';
import { speichereDatei } from '../api';
import { useDaten } from '../daten';
import { alsWunsch, stempelFehler, StempelFelder, stempelStart, useStempelVorlagen, type StempelWahl } from './Stempel';
import { VerkleinertWahl } from './VerkleinertWahl';
import type { Stufe } from '../../../shared/src/verkleinern';
import type { Sortierung } from '../../../shared/src/model';

/**
 * Export mehrerer Mappen (#152, #153): Excel, CSV, ZIP mit Dokumenten oder ein PDF –
 * für die Auswahl oder alle Treffer der Sicht (mit Suche und Sortierung der Liste).
 */
export type Exportformat = 'xlsx' | 'csv' | 'zip' | 'pdf';
const FORMATE: Array<{ f: Exportformat; name: string; text: string }> = [
  { f: 'xlsx', name: 'Excel (.xlsx)', text: 'Tabelle mit echten Datums- und Betragswerten' },
  { f: 'csv', name: 'CSV', text: 'Tabelle für jede Tabellenkalkulation, deutsches Format' },
  { f: 'zip', name: 'ZIP mit Dokumenten', text: 'Tabelle (Excel und CSV) und je Mappe ein Ordner mit ihren Dokumenten' },
  { f: 'pdf', name: 'PDF', text: 'Je Mappe eine Seite; PDF-Dokumente und Bilder werden eingebunden' },
];

export function ExportDialog({ sicht, link, ids, anzahl, gesamt, suche, volltext, notizen, sortierung, fertig }: {
  sicht: string; link?: string; ids: string[] | null; anzahl: number; gesamt: number;
  suche: string; volltext: boolean; notizen: boolean; sortierung: Sortierung | null; fertig(meldung?: string): void;
}) {
  const [format, setFormat] = useState<Exportformat>('xlsx');
  const [spalten, setSpalten] = useState<'liste' | 'alle'>('liste');
  const [uebersicht, setUebersicht] = useState(true);
  const [umfang, setUmfang] = useState<'auswahl' | 'alle'>(ids ? 'auswahl' : 'alle');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const n = umfang === 'auswahl' ? anzahl : gesamt;
  // Stempel (#394): nur für Dokumente (ZIP, PDF); Mappentypen mit Pflicht stempeln ohnehin.
  const d = useDaten();
  const vorlagen = useStempelVorlagen();
  const [stempel, setStempel] = useState<StempelWahl | null>(null);
  useEffect(() => { if (vorlagen && !stempel) setStempel(stempelStart(vorlagen)); }, [vorlagen, stempel]);
  const mitDokumenten = format === 'zip' || format === 'pdf';
  const pflichtTypen = d.typen.filter((t) => t.stempel?.modus === 'pflicht').map((t) => t.name);
  const stempelProblem = mitDokumenten ? stempelFehler(stempel) : null;
  // Verkleinert exportieren (#393): nur PDFs, das gespeicherte Dokument bleibt.
  const [klein, setKlein] = useState<Stufe | null>(null);
  async function los() {
    setLaeuft(true); setFehler(undefined);
    try {
      const r = await speichereDatei('/api/export', {
        sicht, link, format, spalten, uebersicht: format === 'pdf' && uebersicht,
        ids: umfang === 'auswahl' ? ids : null,
        suche: suche || undefined, volltext: suche ? volltext : undefined, notizen: suche ? notizen : undefined,
        sortierung: sortierung?.spalte, absteigend: sortierung?.absteigend,
        ...(mitDokumenten ? { stempel: alsWunsch(stempel), verkleinern: klein } : {}),
      }, `Export.${format}`);
      const m = n - r.ausgelassen;
      const aus = r.ausgelassen ? ` ${r.ausgelassen.toLocaleString('de-DE')} ${r.ausgelassen === 1 ? 'Mappe' : 'Mappen'} ohne Exportrecht ausgelassen.` : '';
      fertig(`„${r.name}“ gespeichert (${m.toLocaleString('de-DE')} ${m === 1 ? 'Mappe' : 'Mappen'}).${aus}`);
    } catch (x) { setFehler((x as Error).message); }
    finally { setLaeuft(false); }
  }
  return (
    <div className="exportdialog blatt" role="dialog" aria-label="Exportieren">
      <h2 className="h3">Exportieren</h2>
      {ids && (
        <fieldset className="wahl"><legend className="klein">Welche Mappen?</legend>
          <label className="haken"><input type="radio" name="umfang" checked={umfang === 'auswahl'} onChange={() => setUmfang('auswahl')} /><span>Auswahl ({anzahl.toLocaleString('de-DE')})</span></label>
          <label className="haken"><input type="radio" name="umfang" checked={umfang === 'alle'} onChange={() => setUmfang('alle')} /><span>Alle Treffer der Ansicht ({gesamt.toLocaleString('de-DE')})</span></label>
        </fieldset>
      )}
      <fieldset className="wahl"><legend className="klein">Format</legend>
        {FORMATE.map((x) => (
          <label key={x.f} className="haken"><input type="radio" name="format" checked={format === x.f} onChange={() => setFormat(x.f)} />
            <span>{x.name}<small className="hilfe">{x.text}</small></span></label>
        ))}
      </fieldset>
      {format !== 'pdf'
        ? <fieldset className="wahl"><legend className="klein">Spalten</legend>
            <label className="haken"><input type="radio" name="spalten" checked={spalten === 'liste'} onChange={() => setSpalten('liste')} /><span>wie die Liste</span></label>
            <label className="haken"><input type="radio" name="spalten" checked={spalten === 'alle'} onChange={() => setSpalten('alle')} /><span>alle Felder</span></label>
          </fieldset>
        : <label className="haken"><input type="checkbox" checked={uebersicht} onChange={(e) => setUebersicht(e.target.checked)} /><span>Vorne eine Übersicht als Tabelle (Spalten der Liste)</span></label>}
      {mitDokumenten && <VerkleinertWahl wert={klein} setze={setKlein} wie="exportieren" id="export-verkleinert" />}
      {mitDokumenten && stempel && vorlagen && <StempelFelder wahl={stempel} setze={setStempel} vorlagen={vorlagen} id="export-stempel" />}
      {mitDokumenten && pflichtTypen.length > 0 && <p className="leise klein">Dokumente aus {pflichtTypen.map((x) => `„${x}“`).join(', ')} bekommen immer einen Stempel (Pflicht des Mappentyps).</p>}
      <p className="leise klein">Passwörter werden nie exportiert. Der Export steht im Protokoll.</p>
      {fehler && <p className="fehlertext klein">{fehler}</p>}
      <div className="knoepfe">
        <button type="button" className="knopf primaer klein" disabled={laeuft || !n || !!stempelProblem} title={stempelProblem ?? undefined} onClick={() => void los()}>{laeuft ? 'Exportiere …' : `${n.toLocaleString('de-DE')} ${n === 1 ? 'Mappe' : 'Mappen'} exportieren`}</button>
        <button type="button" className="textknopf klein" onClick={() => fertig()}>Abbrechen</button>
      </div>
    </div>
  );
}
