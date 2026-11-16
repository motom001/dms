/**
 * PDF verkleinern (#393). Das Verfahren (Bilder verorten, herunterrechnen, Struktur aufräumen) liegt in der
 * PDF-Stelle (`pdf/verkleinern.ts`, #541); hier bleiben die Eingabeprüfung und das Protokoll.
 */
import { Fachfehler } from '../grundlagen/fehler';
import { protokoll } from '../protokoll/protokoll';
import { analysiereVerkleinern, verkleinerePdf, type VerkleinerErgebnis } from '../pdf';
import { ergebnisText, istStufe, mb, MIN_ERSPARNIS, STANDARD_STUFE, STUFEN, type Stufe } from '../../../shared/src/verkleinern';
import { t } from '../sprache/sprache';

const log = protokoll.modul('dokumente');

export { ergebnisText, istStufe, mb, MIN_ERSPARNIS, STANDARD_STUFE, STUFEN, type Stufe };
export { hatQpdf, jpegMasse, operatoren, type VerkleinerAnalyse as Analyse } from '../pdf';
export type Ergebnis = Omit<VerkleinerErgebnis, 'hinweise'>;

/** Stufe aus einer Eingabe: true/„ja“ = Standard, unbekannt/leer = keine. */
export function stufeAus(v: unknown): Stufe | null {
  if (v === true || v === 'true' || v === '1' || v === 'ja') return STANDARD_STUFE;
  if (istStufe(v)) return v;
  if (v === undefined || v === null || v === false || v === '' || v === 'false' || v === 'nein') return null;
  throw new Fachfehler(422, t('meldungen.verkleinern.verkleinern-bildschirm-standard-oder'));
}

/** Schätzung je Stufe – ohne etwas zu rechnen (schnell, für den Dialog). */
export const analysiere = analysiereVerkleinern;

/** Verkleinert ein PDF. Bringt es weniger als 10 %, ist `lohnt` falsch und `inhalt` das Original. */
export async function verkleinere(inhalt: Buffer, stufe: Stufe = STANDARD_STUFE): Promise<Ergebnis> {
  const { hinweise, ...r } = await verkleinerePdf(inhalt, stufe);
  for (const h of hinweise) log.warn(h.text, { fehler: h.fehler });
  return r;
}
