/**
 * Vollexport aller Daten in offenen Formaten (#254): ein Ordner, lesbar ohne das DMS.
 * CSV (RFC 4180, Komma, UTF-8 mit BOM), JSON Lines, Excel, PDF, iCalendar, vCard 4.0,
 * Dokumente im Original (mit allen Versionen). manifest.json enthält SHA-256 und Größe jeder Datei.
 *
 * #1278: aufgeteilt, die Tür bleibt hier (vollexport, VOLLEXPORT_PHASEN und die außerhalb genutzten Namen): Tabellen
 * und Quelle in vollexport-quelle.ts, Formate in vollexport-formate.ts, Schreiben in vollexport-schreiben.ts, Verwaltung
 * der Exporte in vollexport-verwaltung.ts.
 */
import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { t } from '../sprache/sprache';
import type { ExportQuelle, ExportOptionen } from './vollexport-quelle';
import { type ExportErgebnis, schreibeExport } from './vollexport-schreiben';
import { Schreiber } from './vollexport-formate';

export { EXPORT_TABELLEN, type ExportOptionen, type ExportQuelle, type KontaktZuordnung } from './vollexport-quelle';
export { csv } from './vollexport-formate';
export { exportDateien, exporteIn, exportOrdner, freierPlatz, loescheExport, pruefeExport } from './vollexport-verwaltung';

/** Phasen des Auftrags (#364): je Mappe ein Schritt, danach Listen, Kalender und Manifest. */
export const VOLLEXPORT_PHASEN = [
  { key: 'mappen', name: t('meldungen.vollexport.mappen-exportieren'), einheit: 'Mappen' },
  { key: 'abschluss', name: t('meldungen.vollexport.listen-und-pruefwerte-schreiben'), einheit: 'Schritte' },
];

export async function vollexport(
  q: ExportQuelle,
  ziel: string,
  opt: ExportOptionen,
  fortschritt: (fertig: number, gesamt: number, phase?: string) => void = () => {},
  jetzt = new Date(),
): Promise<ExportErgebnis> {
  const name = `dms-export-${jetzt.toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;
  const ordner = join(ziel, name);
  await mkdir(ordner, { recursive: true });
  const w = new Schreiber(ordner);
  try {
    return await schreibeExport(q, w, name, opt, fortschritt, jetzt);
  } catch (e) {
    // Abgebrochen (#746, Sicherheit): Nichts Halbes liegen lassen – der Ordner ist unverschlüsselt.
    w.abbrechen();
    await rm(ordner, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}
