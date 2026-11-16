import { t } from './texte';
/**
 * Dateien umwandeln (#577): Pakete mit dem Recht `dms:umwandeln` wandeln Dateien, die der Kern nicht selbst lesen
 * kann (z. B. TIFF, WebP, GIF, BMP), in eine **Fassung**, die er kennt (PDF, PNG oder JPEG). Daraus macht der Kern
 * Vorschaubild und Volltext wie bei einem PDF oder Foto; das Original bleibt unverändert das Dokument.
 *
 * Diese Datei teilen Server und Oberfläche: welche Typen der Kern selbst liest, was ein Paket zurückgeben darf,
 * Grenzen, Namen der Dateitypen und die Erkennung am Inhalt.
 */

/** Diese Dateitypen liest der Kern selbst (Textebene, Seitenbilder, Vorschaubild). */
export const KERN_TYPEN = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const kernTyp = (mime: string) => (KERN_TYPEN as readonly string[]).includes(mime);

/** Das darf ein Paket als Fassung zurückgeben – genau die Typen, die der Kern liest. */
export const FASSUNG_TYPEN = KERN_TYPEN;

/** Größere Originale meldet der Kern nicht zum Umwandeln (das Paket hält die Datei im Speicher von 256 MB). */
export const UMWANDELN_MAX_BYTES = 50 * 1024 * 1024;
/** So groß darf eine Fassung sein. */
export const FASSUNG_MAX_BYTES = 50 * 1024 * 1024;
/** So groß darf ein Vorschaubild sein, das ein Paket liefert. */
export const VORSCHAUBILD_MAX_BYTES = 5 * 1024 * 1024;
/** Höchstens so viele Bildpunkte hat eine Fassung als Bild bzw. ein Vorschaubild (Breite × Höhe). */
export const BILDPUNKTE_MAX = 36_000_000;
/** Höchstens so viele Dateitypen nennt ein Paket in `code.umwandeln`. */
export const UMWANDELN_TYPEN_MAX = 20;
/** Ab dieser Version kennt das DMS `dms:umwandeln`, `code.umwandeln` und das Ereignis `datei.umwandeln` (#577). */
export const DMS_UMWANDELN_AB = '0.137.0';

/** Dateityp als MIME-Typ (Kleinbuchstaben, ohne Parameter). */
export const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/;

/** Kurze Namen bekannter Dateitypen für Hinweise („Für TIFF-Dateien …“). */
export const DATEITYP_NAMEN: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/tiff': 'TIFF',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/bmp': 'BMP',
  'image/heic': 'HEIC',
  'image/heif': 'HEIF',
  'image/avif': 'AVIF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/vnd.oasis.opendocument.text': t('gemeinsam.dateiumwandlung.opendocument-text'),
  'application/vnd.oasis.opendocument.spreadsheet': t('gemeinsam.dateiumwandlung.opendocument-tabelle'),
  'application/vnd.oasis.opendocument.presentation': t('gemeinsam.dateiumwandlung.opendocument-praesentation'),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template': 'Word',
  'application/vnd.ms-word.document.macroenabled.12': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template': 'Excel',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'Excel',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow': 'PowerPoint',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12': 'PowerPoint',
  'message/rfc822': 'E-Mail',
  'application/vnd.ms-outlook': t('gemeinsam.dateiumwandlung.outlook-e-mail'),
  'application/rtf': 'RTF',
  'text/rtf': 'RTF',
  'text/plain': 'Text',
};
export const dateitypName = (mime: string) => DATEITYP_NAMEN[mime] ?? mime;

/**
 * Dateityp am Inhalt (nicht am Namen) für Bildformate, die Browser oft ohne oder mit falschem Typ schicken:
 * TIFF, BMP, HEIC/HEIF/AVIF – dazu GIF und WebP. null, wenn nichts davon passt.
 */
export function erkenneBildtyp(b: Uint8Array): string | null {
  const t = (von: number, bis: number) => String.fromCharCode(...b.subarray(von, bis));
  if (b.length >= 4 && ((t(0, 2) === 'II' && b[2] === 42 && b[3] === 0) || (t(0, 2) === 'MM' && b[2] === 0 && b[3] === 42)))
    return 'image/tiff';
  if (b.length >= 4 && ((t(0, 2) === 'II' && b[2] === 43 && b[3] === 0) || (t(0, 2) === 'MM' && b[2] === 0 && b[3] === 43)))
    return 'image/tiff';
  if (b.length >= 6 && (t(0, 6) === 'GIF87a' || t(0, 6) === 'GIF89a')) return 'image/gif';
  if (b.length >= 12 && t(0, 4) === 'RIFF' && t(8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 26 && t(0, 2) === 'BM') {
    // BITMAPFILEHEADER: Größe des Kopfs der Bilddaten (12, 40, 52, 56, 64, 108, 124) – sonst ist „BM“ Zufall.
    const kopf = b[14] | (b[15] << 8) | (b[16] << 16) | (b[17] << 24);
    if ([12, 40, 52, 56, 64, 108, 124].includes(kopf)) return 'image/bmp';
  }
  if (b.length >= 12 && t(4, 8) === 'ftyp') {
    const marke = t(8, 12);
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx'].includes(marke)) return 'image/heic';
    if (['mif1', 'msf1'].includes(marke)) return 'image/heif';
    if (['avif', 'avis'].includes(marke)) return 'image/avif';
  }
  return null;
}

/**
 * Pakete im offiziellen Katalog, die Dateitypen umwandeln – für den Hinweis „… mit dem Paket Bildformate“, solange
 * keins installiert ist. HEIC und Office fehlen (noch, siehe dms-registry #48 und #30).
 */
export const KATALOG_UMWANDLUNG: Array<{ id: string; name: string; typen: string[] }> = [
  { id: 'bildformate', name: 'Bildformate', typen: ['image/tiff', 'image/webp', 'image/gif', 'image/bmp'] },
];
export const katalogUmwandlung = (mime: string) => KATALOG_UMWANDLUNG.find((p) => p.typen.includes(mime)) ?? null;

/** Hinweis am Dokument, solange es auf die Umwandlung durch ein Paket wartet (Stand `paket`). */
export const INFO_UMWANDLUNG = t('gemeinsam.dateiumwandlung.wartet-auf-umwandlung');
export const infoUmwandlung = (paket: { name: string }) => `${INFO_UMWANDLUNG} (Paket ${paket.name})`;
/** So steht im Hinweis des Volltexts, dass er aus der umgewandelten Fassung stammt. */
export const INFO_FASSUNG = t('gemeinsam.dateiumwandlung.aus-der-umgewandelten-fassung');
export const infoFassung = (paket: { name: string; version: string }) => `${INFO_FASSUNG} (Paket ${paket.name} ${paket.version})`;
/** Paket der Fassung aus einem Hinweis (oder null). */
export const fassungAusInfo = (info: string | null | undefined): string | null =>
  new RegExp(`${INFO_FASSUNG} \\(Paket ([^)]+)\\)`).exec(info ?? '')?.[1] ?? null;

/** Was der Kern über eine Fassung weiß (für API und Anzeige). */
export interface FassungInfo {
  /** Typ der Fassung: PDF, PNG oder JPEG. */
  mime: string;
  groesse: number;
  /** Prüfwert der Fassung selbst. */
  sha256: string;
  /** Welches Paket sie geliefert hat (Id, Name, Version). */
  paket: { id: string; name: string; version: string };
  erstellt: string;
  /**
   * Entsperrte Fassung eines geschützten PDFs (#827): kein Paket, sondern Ablago selbst (qpdf). Wie und von wem –
   * nie das Passwort.
   */
  entsperrt?: import('./entsperren').Entsperrt;
}
