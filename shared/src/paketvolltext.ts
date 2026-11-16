import { t } from './texte';
/**
 * Volltext aus Paketen (#614): Pakete mit dem Recht `dms:volltext` liefern den Volltext für Dateitypen, die der Kern
 * nicht selbst liest (z. B. Word, Excel, E-Mails) – sie lesen die Datei und schreiben **nur** den Volltext, ohne
 * Schreibrecht auf Dokumente. Muster wie `dms:umwandeln` (#577): zuständige Dateitypen im Manifest (`code.volltext`),
 * ein Ereignis an genau das zuständige Paket (`datei.volltext`), Stand „wartet auf Volltext (Paket …)“ am Dokument.
 *
 * Diese Datei teilen Server und Oberfläche.
 */

/** Ab dieser Version kennt das DMS `dms:volltext`, `code.volltext` und das Ereignis `datei.volltext` (#614). */
export const DMS_PAKET_VOLLTEXT_AB = '0.145.0';
/** Höchstens so viele Dateitypen nennt ein Paket in `code.volltext`. */
export const VOLLTEXT_TYPEN_MAX = 40;
/** Größere Dateien meldet der Kern nicht (das Paket hält die Datei im Speicher von 256 MB, entpackte Teile kommen dazu). */
export const VOLLTEXT_PAKET_MAX_BYTES = 50 * 1024 * 1024;

/** Höchstzahl Zeichen eines Volltexts im Kern (wie VOLLTEXT_MAX im Server). */
export const VOLLTEXT_ZEICHEN_MAX = 5_000_000;
/**
 * So groß darf der Körper von PUT /dokumente/{id}/volltext sein (sonst 2 MB je Anfrage): 5 Mio. Zeichen als JSON, auch
 * mit Umlauten, Sonderzeichen und Escapes – damit ein Paket den ganzen Text in einer Anfrage schreibt (#614).
 */
export const VOLLTEXT_KOERPER_MAX = 32 * 1024 * 1024;

/** Hinweis am Dokument, solange es auf den Volltext eines Pakets wartet (Stand `paket`). */
export const INFO_VOLLTEXT_PAKET = t('gemeinsam.paketvolltext.wartet-auf-volltext');
export const infoVolltextPaket = (paket: { name: string }) => `${INFO_VOLLTEXT_PAKET} (Paket ${paket.name})`;
/** So beginnt der Hinweis, wenn das Paket fertig ist, aber keinen Volltext geschrieben hat (mit seinem Grund). */
export const INFO_VOLLTEXT_DURCH = t('gemeinsam.paketvolltext.volltext-durch-paket');

/**
 * Pakete im offiziellen Katalog, die Volltext für Dateitypen liefern – für den Hinweis „… mit dem Paket Office und
 * E-Mail“, solange keins installiert ist (dms-registry #30).
 */
export const KATALOG_VOLLTEXT: Array<{ id: string; name: string; typen: string[] }> = [
  {
    id: 'office_email',
    name: t('gemeinsam.paketvolltext.office-und-e-mail'),
    typen: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
      'application/vnd.ms-word.document.macroenabled.12',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
      'application/vnd.ms-excel.sheet.macroenabled.12',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
      'application/vnd.ms-powerpoint.presentation.macroenabled.12',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
      'message/rfc822',
      'application/vnd.ms-outlook',
      'application/rtf',
      'text/rtf',
      'text/plain',
    ],
  },
];
export const katalogVolltext = (mime: string) => KATALOG_VOLLTEXT.find((p) => p.typen.includes(mime.toLowerCase())) ?? null;
