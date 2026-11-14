import { useEffect, useState } from 'react';
import { speichereDatei } from '../api/anfrage';
import { useDaten } from '../daten';
import { alsWunsch, stempelFehler, StempelFelder, stempelStart, useStempelVorlagen, type StempelWahl } from './Stempel';
import { VerkleinertWahl } from './VerkleinertWahl';
import type { Stufe } from '../../../shared/src/verkleinern';
import type { Sortierung } from '../../../shared/src/model';
import { FassungWahl, type Fassung } from './FassungWahl';
import { t } from '../sprache';
import { FeldGruppe, HakenFeld, Knopf } from '../bausteine';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Export mehrerer Mappen (#152, #153): Excel, CSV, ZIP mit Dokumenten oder ein PDF –
 * für die Auswahl oder alle Treffer der Sicht (mit Suche und Sortierung der Liste).
 */
export type Exportformat = 'xlsx' | 'csv' | 'zip' | 'pdf';
const FORMATE: Array<{ f: Exportformat; name: string; text: string }> = [
  { f: 'xlsx', name: t('ablage.export.excel-xlsx'), text: t('ablage.export.tabelle-mit-echten-datums') },
  { f: 'csv', name: 'CSV', text: t('ablage.export.tabelle-fuer-jede') },
  { f: 'zip', name: t('ablage.export.zip-mit-dokumenten'), text: t('ablage.export.tabelle-excel-und-csv') },
  { f: 'pdf', name: 'PDF', text: t('ablage.export.je-mappe-eine-seite') },
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
  const pflichtTypen = d.typen.filter((mappentyp) => mappentyp.stempel?.modus === 'pflicht').map((mappentyp) => mappentyp.name);
  const stempelProblem = mitDokumenten ? stempelFehler(stempel) : null;
  // Verkleinert exportieren (#393): nur PDFs, das gespeicherte Dokument bleibt.
  const [klein, setKlein] = useState<Stufe | null>(null);
  // Archivfassung oder Original (#715), Vorgabe wie beim Herunterladen; die Dokumente kennt erst der Server.
  const [fassung, setFassung] = useState<Fassung>('archiv');
  async function los() {
    setLaeuft(true); setFehler(undefined);
    try {
      const r = await speichereDatei('/api/export', {
        sicht, link, format, spalten, uebersicht: format === 'pdf' && uebersicht,
        ids: umfang === 'auswahl' ? ids : null,
        suche: suche || undefined, volltext: suche ? volltext : undefined, notizen: suche ? notizen : undefined,
        sortierung: sortierung?.spalte, absteigend: sortierung?.absteigend,
        ...(mitDokumenten ? { stempel: alsWunsch(stempel), verkleinern: klein, fassung } : {}),
      }, t('ablage.export.export', { format }));
      const m = n - r.ausgelassen;
      const aus = r.ausgelassen ? t('ablage.export.mappen-ohne-exportrecht-ausgelassen', { anzahl: r.ausgelassen, ausgelassen: r.ausgelassen.toLocaleString(gebietsschema()) }) : '';
      fertig(t('ablage.export.gespeichert-mappen', { anzahl: m, name: r.name, m: m.toLocaleString(gebietsschema()), aus }));
    } catch (x) { setFehler((x as Error).message); }
    finally { setLaeuft(false); }
  }
  return (
    <div className="exportdialog blatt" role="dialog" aria-label={t('ablage.export.exportieren')}>
      <h2 className="h3">{t('ablage.export.exportieren')}</h2>
      {ids && (
        <FeldGruppe beschriftung={t('ablage.export.welche-mappen')} className="wahl">
          <label className="haken"><input type="radio" name="umfang" checked={umfang === 'auswahl'} onChange={() => setUmfang('auswahl')} /><span>{t('ablage.export.auswahl', { zahl: anzahl.toLocaleString(gebietsschema()) })}</span></label>
          <label className="haken"><input type="radio" name="umfang" checked={umfang === 'alle'} onChange={() => setUmfang('alle')} /><span>{t('ablage.export.alle-treffer-der-ansicht', { gesamt: gesamt.toLocaleString(gebietsschema()) })}</span></label>
        </FeldGruppe>
      )}
      <FeldGruppe beschriftung={t('ablage.export.format')} className="wahl">
        {FORMATE.map((x) => (
          <label key={x.f} className="haken"><input type="radio" name="format" checked={format === x.f} onChange={() => setFormat(x.f)} />
            <span>{x.name}<small className="hilfe">{x.text}</small></span></label>
        ))}
      </FeldGruppe>
      {format !== 'pdf'
        ? <FeldGruppe beschriftung={t('ablage.export.spalten')} className="wahl">
            <label className="haken"><input type="radio" name="spalten" checked={spalten === 'liste'} onChange={() => setSpalten('liste')} /><span>{t('ablage.export.wie-die-liste')}</span></label>
            <label className="haken"><input type="radio" name="spalten" checked={spalten === 'alle'} onChange={() => setSpalten('alle')} /><span>{t('ablage.export.alle-felder')}</span></label>
          </FeldGruppe>
        : <HakenFeld beschriftung={t('ablage.export.vorne-eine-uebersicht-als')}><input type="checkbox" checked={uebersicht} onChange={(e) => setUebersicht(e.target.checked)} /></HakenFeld>}
      {mitDokumenten && <FassungWahl wert={fassung} setze={setFassung} id="export-fassung" />}
      {mitDokumenten && <VerkleinertWahl wert={klein} setze={setKlein} wie="exportieren" id="export-verkleinert" />}
      {mitDokumenten && stempel && vorlagen && <StempelFelder wahl={stempel} setze={setStempel} vorlagen={vorlagen} id="export-stempel" />}
      {mitDokumenten && pflichtTypen.length > 0 && <p className="leise klein">{t('ablage.export.dokumente-aus')}{' '}{pflichtTypen.map((x) => `„${x}“`).join(', ')} {' '}{t('ablage.export.bekommen-immer-einen-stempel')}</p>}
      <p className="leise klein">{t('ablage.export.passwoerter-werden-nie-exportiert')}</p>
      {fehler && <p className="fehlertext klein">{fehler}</p>}
      <div className="knoepfe">
        {/* Gesperrt aus einem Grund (Leitsatz 6): der Grund am Knopf, nicht nur im Tooltip. */}
        <Knopf art="haupt" groesse="klein" gesperrt={stempelProblem || !n} laeuft={laeuft} laeuftText={t('ablage.export.exportiere')} onClick={() => void los()}>{t('ablage.export.mappen-exportieren', { anzahl: n, n: n.toLocaleString(gebietsschema()) })}</Knopf>
        <Knopf groesse="klein" onClick={() => fertig()}>{t('ablage.export.abbrechen')}</Knopf>
      </div>
    </div>
  );
}
