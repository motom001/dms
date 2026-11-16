/**
 * Woher der Volltext eines Dokuments kommt (#458) – für die Anzeige am Dokument und in der Werkbank.
 *
 * Der Kern liest die Textebene von PDFs selbst (poppler). Scans und Bilder erkennt ein Paket mit der Schnittstelle
 * `dms:texterkennung`; bis es den Volltext schreibt, steht das Dokument auf „wartet auf Texterkennung“ (Stand
 * `paket`). Die Herkunft steht im Hinweis `ocr.info`; diese Datei liest sie daraus zurück.
 */
import type { OcrStand } from './model';
import { INFO_UMWANDLUNG } from './dateiumwandlung';
import { INFO_VOLLTEXT_PAKET } from './paketvolltext';
import { PAKET_TEXT, PAKET_VOLLTEXT } from './pakete';
import { t } from './texte';

/** Id des Pakets Texterkennung im offiziellen Katalog (#459: für „jetzt installieren“). */
export const TEXTERKENNUNG_PAKET = 'texterkennung';

/** Hinweis bei Text aus der Textebene eines PDFs. */
export const INFO_TEXTEBENE = t('gemeinsam.volltext.textebene-des-pdfs');
/** So beginnt der Hinweis, solange ein Dokument auf das Paket wartet. */
export const INFO_WARTET = t('gemeinsam.volltext.wartet-auf-texterkennung');

/** Hinweis für Stand `paket`: mit dem Namen des Pakets oder ohne installiertes Paket. */
export const infoWartet = (paket: { name: string } | null) =>
  paket ? `${INFO_WARTET} (Paket ${paket.name})` : t('gemeinsam.volltext.kein-paket-installiert', { INFO_WARTET });

export type VolltextHerkunft =
  | { art: 'pdf' }
  | { art: 'paket'; paket: string; ausgelesen?: true }
  | { art: 'wartet'; paket: string | null }
  /** Andere Dateitypen (#577): wartet auf die Fassung eines Pakets zum Umwandeln. */
  | { art: 'umwandlung'; paket: string }
  /** Andere Dateitypen (#614): wartet auf den Volltext eines Pakets mit dms:volltext. */
  | { art: 'volltext'; paket: string }
  | { art: 'eingebaut' }
  | { art: 'api' };

/** Herkunft aus dem Stand; null, wenn es (noch) keine gibt oder sie unbekannt ist. */
export function volltextHerkunft(o: OcrStand | null | undefined): VolltextHerkunft | null {
  if (!o) return null;
  if (o.stand === 'paket' && (o.info ?? '').startsWith(INFO_UMWANDLUNG))
    return { art: 'umwandlung', paket: /\(Paket (.+?)\)/.exec(o.info ?? '')?.[1] ?? '' };
  if (o.stand === 'paket' && (o.info ?? '').startsWith(INFO_VOLLTEXT_PAKET))
    return { art: 'volltext', paket: /\(Paket (.+?)\)/.exec(o.info ?? '')?.[1] ?? '' };
  if (o.stand === 'paket') return { art: 'wartet', paket: /\(Paket (.+?)\)/.exec(o.info ?? '')?.[1] ?? null };
  if (o.stand !== 'fertig' || !o.info) return null;
  // „übernommen (gleicher Inhalt): …“ – die Herkunft des übernommenen Texts zählt.
  const info = o.info.replace(/^übernommen \(gleicher Inhalt\): /, '');
  if (info.startsWith(PAKET_TEXT))
    return {
      art: 'paket',
      paket: info
        .slice(PAKET_TEXT.length)
        .split(/ · | – /)[0]
        .trim(),
    };
  if (info.startsWith(PAKET_VOLLTEXT)) {
    // „Volltext durch Paket X: Grund“ bzw. „… fehlgeschlagen“ heißt: kein Text geliefert (#614) – das ist keine Herkunft.
    const name = info
      .slice(PAKET_VOLLTEXT.length)
      .split(/ · | – /)[0]
      .trim();
    return name.includes(':') || name.endsWith('fehlgeschlagen') ? null : { art: 'paket', ausgelesen: true, paket: name };
  }
  if (info.startsWith(INFO_TEXTEBENE)) return { art: 'pdf' };
  if (info.startsWith('Volltext über die API')) return { art: 'api' };
  if (/Texterkennung/.test(info)) return { art: 'eingebaut' };
  return null;
}

/** Hinweis am Dokument, wenn die Datenbank ein Ergebnis auch nach mehreren Versuchen nicht annahm (#575). */
export const NICHT_GESPEICHERT = t('gemeinsam.volltext.text-erkannt-aber-nicht');
