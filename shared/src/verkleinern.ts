import { t } from './texte';
import { gebietsschema } from './sprache';
/**
 * PDF verkleinern (#393): Stufen und Texte – gemeinsam für Server und Oberfläche.
 * Das Rechnen selbst steht in server/src/dateien/verkleinern.ts.
 */
export const STUFEN = {
  bildschirm: { name: 'Bildschirm', dpi: 100, qualitaet: 55, text: t('gemeinsam.verkleinern.zum-lesen-am-bildschirm') },
  standard: { name: 'Standard', dpi: 150, qualitaet: 70, text: t('gemeinsam.verkleinern.gut-lesbar-und-ordentlich') },
  druck: { name: 'Druck', dpi: 300, qualitaet: 85, text: t('gemeinsam.verkleinern.fuer-den-druck-nur') },
} as const;
export type Stufe = keyof typeof STUFEN;
export const STUFEN_LISTE = Object.keys(STUFEN) as Stufe[];
export const STANDARD_STUFE: Stufe = 'standard';
/** Unter dieser Ersparnis bleibt das Dokument unverändert. */
export const MIN_ERSPARNIS = 0.1;

export const istStufe = (s: unknown): s is Stufe => typeof s === 'string' && Object.hasOwn(STUFEN, s);

/** „18,4 MB“ bzw. „640 KB“ */
export function mb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(gebietsschema())} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** „von 18,4 MB auf 2,1 MB (−89 %)“ */
export function ergebnisText(vorher: number, nachher: number): string {
  return t('gemeinsam.verkleinern.von-auf', { mb: mb(vorher), mb2: mb(nachher), round: Math.round((1 - nachher / vorher) * 100) });
}
