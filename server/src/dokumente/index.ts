/** Dokumente (#1075) – die einzige Tür: Dienst und Fachordner importieren nur von hier. */
export { DokumenteDienst, type DokumenteAnschluss, type DokumenteTeile } from './dokumente.dienst';
export { dateiname, erkenneAnzeigbar, type TexterkennungAnbindung } from './gemeinsam';
export { GeschuetztePdfs, type GeschuetztePdfsAnschluss, type GeschuetztePdfsTeile } from './geschuetzte-pdf';
export { DokumentUmwandlung, type UmwandelnAnschluss } from './umwandeln';
export { DokumentArchivfassung, SCHRIFT_NEU_JE_LAUF, type ArchivfassungAnschluss } from './archivfassung';
export { FehlendeDateien } from './fehlende-dateien';
export { DokumentVersionen, type VersionenAnschluss } from './versionen';
export { DokumentAnlagen, type AnlagenStand } from './anlagen';
