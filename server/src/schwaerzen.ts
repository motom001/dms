/**
 * Dokumente endgültig schwärzen (#392). Das Verfahren (alle Seiten neu rendern, Bereiche in die Bildpunkte
 * malen, neu zusammensetzen, Textebene ohne die geschwärzten Wörter) liegt in der PDF-Stelle
 * (`pdf/schwaerzen.ts`, #541).
 */
export {
  ANSICHT_PX,
  SCHWAERZEN_DPI,
  analysiereSchwaerzen as analysiere,
  arbeitsPdf,
  exifAusrichtung,
  liesBbox,
  maleSchwarz,
  pnmKopf,
  schwaerze,
  schwaerzSeitenbild as seitenbild,
  textAus,
  verbleibende,
  type SchwaerzAnalyse as Analyse,
  type SchwaerzErgebnis as Ergebnis,
} from './pdf';
