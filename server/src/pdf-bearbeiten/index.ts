/**
 * PDF bearbeiten (#1077) – die einzige Tür: Dienst und Fachordner importieren nur von hier. Die Fachlogik (Seiten,
 * Verkleinern, Schwärzen, Stempel-Vorlagen); die PDF-Stelle mit pdf-lib bleibt in `pdf/` (Technik, #541).
 */
export { PdfBearbeiten, type PdfAnschluss, type PdfTeile } from './pdf-bearbeiten.dienst';
export {
  GROSSE_MAX, GROSSE_MIT_SCHAETZUNG, PdfVerkleinern, VERKLEINERN_STANDARD, verkleinernEinstellungAus,
  type VerkleinernAnschluss, type VerkleinernEinstellung, type VerkleinernTeile,
} from './verkleinern';
export { Schwaerzen, type SchwaerzenAnschluss, type SchwaerzenTeile } from './schwaerzen';
export { Stempelvorlagen } from './stempelvorlagen';
