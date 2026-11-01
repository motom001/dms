/**
 * PDF verkleinern (#393): Stufen und Texte – gemeinsam für Server und Oberfläche.
 * Das Rechnen selbst steht in server/src/verkleinern.ts.
 */
export const STUFEN = {
  bildschirm: { name: 'Bildschirm', dpi: 100, qualitaet: 55, text: 'zum Lesen am Bildschirm und zum Verschicken' },
  standard: { name: 'Standard', dpi: 150, qualitaet: 70, text: 'gut lesbar und ordentlich druckbar' },
  druck: { name: 'Druck', dpi: 300, qualitaet: 85, text: 'für den Druck – nur sehr fein gescannte Seiten werden kleiner' },
} as const;
export type Stufe = keyof typeof STUFEN;
export const STUFEN_LISTE = Object.keys(STUFEN) as Stufe[];
export const STANDARD_STUFE: Stufe = 'standard';
/** Unter dieser Ersparnis bleibt das Dokument unverändert. */
export const MIN_ERSPARNIS = 0.1;

export const istStufe = (s: unknown): s is Stufe => typeof s === 'string' && Object.hasOwn(STUFEN, s);

/** „18,4 MB“ bzw. „640 KB“ */
export function mb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('de-DE')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** „von 18,4 MB auf 2,1 MB (−89 %)“ */
export function ergebnisText(vorher: number, nachher: number): string {
  return `von ${mb(vorher)} auf ${mb(nachher)} (−${Math.round((1 - nachher / vorher) * 100)} %)`;
}
