/**
 * Dokumente und ihre Fassungen (#1278, vorher `shared/src/model.ts`).
 */
import type { OcrStand } from './texterkennung';
import { t } from '../texte';

/** Ein hochgeladenes Dokument in einem Dokumentenregister. */
export interface Dokument {
  id: string;
  mappeId: string;
  registerKey: string;
  name: string;
  mime: string;
  groesse: number;
  sha256: string;
  /** PDF oder Bild, das gefahrlos im Browser angezeigt werden kann. */
  anzeigbar: boolean;
  erstellt: string;
  erstelltVon: string | null;
  /** Stand der Texterkennung (#45). */
  ocr?: OcrStand;
  /** Versionierung (#194): Nummer der aktuellen Version (ohne Versionierung 1). */
  version?: number;
  /** Woher die aktuelle Version kam. */
  herkunft?: Herkunft | null;
  /** Anzahl älterer Versionen. */
  aeltere?: number;
  /** Archivnummer des Papieroriginals (#345), eindeutig je Haushalt. */
  archivnummer?: string | null;
  /**
   * Sprache des Volltexts (#400), Tesseract-Kennung wie „fra“: erkannt oder über die API gesetzt; ohne Angabe
   * Deutsch. Die Volltextsuche nimmt die Wortstämme dieser Sprache. Bei mehrsprachigen Dokumenten (#579) die
   * Hauptsprache – die mit dem meisten Text.
   */
  sprache?: string | null;
  /** Weitere Sprachen im Dokument (#579, „enthält auch“), nach Textmenge; leer bei einsprachigen. */
  weitereSprachen?: string[];
  /**
   * Hinweis „Post teilen?“ (#579): ab dieser Seite beginnt vermutlich ein eigenes Schreiben (die Sprache wechselt
   * zwischen zwei Seiten ganz). null: kein Wechsel oder Hinweis weggeklickt.
   */
  teilenAb?: number | null;
  /**
   * Archivfassung (PDF/A) eines Pakets mit `dms:archivfassung` (#631): fertig, wartet, ausgelassen oder Fehler – nur
   * in der Mappe (GET /mappen/{id}) und nur, wenn es eine gibt oder ein Paket dran ist.
   */
  archivfassung?: import('../archivfassung').ArchivStand | null;
  /**
   * Geschütztes PDF (#827): mit Passwort zum Öffnen oder nur mit Rechte-Sperre (Drucken, Kopieren) – und ob es eine
   * entsperrte Fassung gibt. Nur in der Mappe (GET /mappen/{id}) und nur bei geschützten PDFs.
   */
  pdfSchutz?: import('../entsperren').PdfSchutz | null;
  /**
   * Leerseiten (#997): Seiten, die ein Paket mit `dms:leerseiten` als leer markiert hat, und die Wahl der Person
   * („Doch behalten“, „Auch weglassen“). Gilt nur für die Datei mit diesem Prüfwert; fehlt, wenn nichts markiert ist.
   */
  leerseiten?: import('../leerseiten').Leerseiten | null;
  /**
   * Anlagen (#998): Id des Hauptdokuments, an dem dieses Dokument als Anlage hängt (gleiche Mappe, gleiches Register);
   * null bzw. fehlt bei eigenen Dokumenten. Siehe shared/src/anlagen.ts.
   */
  anlageZu?: string | null;
  /** Reihenfolge der Anlage ab 1 („Anlage 1“); nur mit `anlageZu`. */
  anlageNr?: number | null;
  /**
   * E-Mail-Postfach (#999): Platz in der Eingangsreihenfolge der Post (1, 2, 3 … wie die Anhänge in der E-Mail stehen);
   * fehlt bei allem, was nicht aus dem Postfach kam. Siehe `eingangsreihenfolge` in shared/src/anlagen.ts.
   */
  eingangNr?: number | null;
  /**
   * Eingangskanäle (#1489): für wen das Dokument kam – beim E-Mail-Abruf „für“ des Postfachs, beim Eingangsordner die
   * Person des Unterordners (Id der Benutzer-Mappe). Fehlt sonst.
   */
  eingangFuer?: string | null;
  /**
   * E-Mail-Postfach (#999): Das ist die abgeholte E-Mail selbst („Original-E-Mail“, .eml) – als letzte Anlage am letzten
   * Anhang oder, ohne Anhänge, als Hauptdokument. Erkennung, Klassifizieren und KI lassen sie weg. Fehlt sonst.
   */
  originalEmail?: boolean;
}

/** Herkunft einer Dokumentversion (#194). */
export const HERKUNFT = {
  hochgeladen: 'hochgeladen',
  api: t('gemeinsam.model.ueber-die-schnittstelle'),
  webdav: t('gemeinsam.model.ueber-webdav'),
  paket: t('gemeinsam.model.von-einem-paket'),
  eingang: 'Eingangskanal',
  // Eingangskanäle (#1489): E-Mail-Postfach und Eingangsordner (Scanner, Laufwerk) – vorher „hochgeladen“.
  email: t('gemeinsam.model.per-e-mail'),
  ordner: t('gemeinsam.model.aus-dem-eingangsordner'),
  zurueckgeholt: 'zurückgeholt',
  bearbeitet: t('gemeinsam.model.in-ablago-bearbeitet'),
  geschwaerzt: t('gemeinsam.model.in-ablago-geschwaerzt'),
  vorlage: t('gemeinsam.model.aus-einer-vorlage'),
} as const;
export type Herkunft = keyof typeof HERKUNFT;
/** Eine ältere Version eines Dokuments (#194). */
export interface DokumentVersion {
  dokumentId: string;
  nummer: number;
  name: string;
  mime: string;
  groesse: number;
  sha256: string;
  anzeigbar: boolean;
  erstellt: string;
  erstelltVon: string | null;
  herkunft: Herkunft | null;
}
