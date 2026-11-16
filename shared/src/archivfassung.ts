/**
 * Archivfassung (PDF/A) für Pakete (#631): Pakete mit dem Recht `dms:archivfassung` legen zu einem Dokument ein
 * **durchsuchbares PDF/A** ab – ein Langzeitformat mit unsichtbarer Textebene genau auf den Wörtern. Das Original bleibt
 * unverändert das Dokument; die Archivfassung kommt dazu (ansehen, herunterladen, Sicherung, Vollexport).
 *
 * - Der Kern meldet ein Dokument erst, wenn sein **Volltext feststeht** (Ereignis `datei.archivfassung`) – beim
 *   Hochladen, bei einer neuen Version, bei „Volltext neu erzeugen“ und nach der Installation des Pakets (Bestand).
 *   E-Mails (#946) auch ohne Volltext: Liefert kein Paket ihn, gilt er als feststehend (leer).
 * - Das Paket liest die Datei (bzw. bei TIFF und Co. die Lesefassung aus `dms:umwandeln`), den Volltext und die
 *   **Wortpositionen** (`GET /dokumente/{id}/wortpositionen`) und gibt das PDF/A zurück
 *   (`PUT /dokumente/{id}/archivfassung?sha256=…`). Der Kern nimmt nur ein PDF mit PDF/A-Kennung an.
 *
 * Diese Datei teilen Server und Oberfläche: Grenzen, Stand, Wortpositionen und ihre Prüfung.
 */
import type { Wort } from './schwaerzen';
import { t } from './texte';

/** Ab dieser Version kennt das DMS `dms:archivfassung`, `code.archivfassung` und das Ereignis `datei.archivfassung`. */
export const DMS_ARCHIVFASSUNG_AB = '0.149.0';
/** Dateitypen einer E-Mail (#946): `.eml` und Outlook `.msg`. */
export const MAIL_TYPEN: readonly string[] = ['message/rfc822', 'application/vnd.ms-outlook'];
/**
 * Ist das Dokument eine E-Mail (Art `emails`, #946)? Liefert ihren Dateityp – `message/rfc822` bzw.
 * `application/vnd.ms-outlook`, bei `application/octet-stream` nach der Endung `.eml`/`.msg` – oder null.
 */
export function mailTyp(mime: string, name?: string | null): string | null {
  const m = mime.toLowerCase();
  if (MAIL_TYPEN.includes(m)) return m;
  if (m !== 'application/octet-stream' || !name) return null;
  const n = name.trim().toLowerCase();
  return n.endsWith('.eml') ? 'message/rfc822' : n.endsWith('.msg') ? 'application/vnd.ms-outlook' : null;
}
/** Höchstens so viele Dateitypen nennt ein Paket in `code.archivfassung.typen`. */
export const ARCHIV_TYPEN_MAX = 40;
/** Größere Dateien meldet der Kern nicht (das Paket hält Datei und Ergebnis im Speicher von 256 MB). */
export const ARCHIV_QUELLE_MAX_BYTES = 50 * 1024 * 1024;
/** So groß darf eine Archivfassung sein (Bilder, eingebettete Schriften und Textebene kommen zum Original dazu). */
export const ARCHIVFASSUNG_MAX_BYTES = 100 * 1024 * 1024;
/** Höchstens so viele Seiten hat eine Archivfassung (wie die Textebene im Kern). */
export const ARCHIVFASSUNG_SEITEN_MAX = 1000;
/** PDF/A-Teile, die der Kern als Kennung annimmt (ISO 19005-1 bis -4). */
export const PDFA_TEILE = [1, 2, 3, 4] as const;
/** Konformitätsstufen je Teil (Teil 4 kennt keine oder E/F). */
export const PDFA_STUFEN: Record<number, readonly string[]> = { 1: ['A', 'B'], 2: ['A', 'B', 'U'], 3: ['A', 'B', 'U'], 4: ['E', 'F'] };

/** PDF/A-Kennung aus den XMP-Metadaten. */
export interface PdfaKennung {
  teil: number;
  stufe: string | null;
}
/** „PDF/A-2b“ */
export const pdfaName = (k: PdfaKennung) => `PDF/A-${k.teil}${k.stufe ? k.stufe.toLowerCase() : ''}`;

/** Was der Kern über eine Archivfassung weiß (für API und Anzeige). */
export interface ArchivfassungInfo {
  mime: 'application/pdf';
  groesse: number;
  /** Prüfwert der Archivfassung selbst. */
  sha256: string;
  seiten: number | null;
  pdfa: PdfaKennung;
  /** Welches Paket sie geliefert hat. */
  paket: { id: string; name: string; version: string };
  erstellt: string;
  /** Das Original ist schon gültiges PDF/A (Grundprüfung) – es gilt selbst als Archivfassung, keine zweite Datei. */
  imOriginal?: boolean;
  /** Das Original ist digital signiert – die Archivfassung trägt die Signatur nicht. */
  signiert?: boolean;
  /** E-Rechnung (ZUGFeRD/Factur-X): Herunterladen und Weitergeben nehmen das Original vor. */
  erechnung?: boolean;
  /** Das Original enthielt externe Inhalte, JavaScript oder Aktionen, die nicht übernommen wurden. */
  weggelassen?: boolean;
}

/** Stand der Archivfassung an einem Dokument. */
export type ArchivStandArt = 'fertig' | 'wartet' | 'ausgelassen' | 'fehler';
export interface ArchivStand {
  stand: ArchivStandArt;
  /** Grund (ausgelassen, Fehler) bzw. Hinweis. */
  info?: string | null;
  paket?: { id: string; name: string; version?: string } | null;
  zeit: string;
  /** Nur bei `fertig`: die Archivfassung. */
  fassung?: ArchivfassungInfo;
}

/* ---------- Wortpositionen ---------- */

/** Höchstens so lang ist ein Wort (längere kürzt niemand: die Angabe wird abgelehnt). */
export const WORT_MAX_LAENGE = 200;
/** Höchstens so viele Wörter je Dokument (alle Seiten zusammen). */
export const WOERTER_MAX = 1_500_000;

/** Woher die Wörter einer Seite kommen. */
export type WortQuelle = 'textebene' | 'texterkennung' | 'keine';
/** Eine Seite mit Wörtern: [Text, x, y, Breite, Höhe] relativ zur Seite (0…1, Ursprung oben links). */
export interface WortSeite {
  seite: number;
  quelle: WortQuelle;
  breite?: number;
  hoehe?: number;
  woerter: Wort[];
}

const zahl = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/**
 * Wortpositionen aus `PUT /dokumente/{id}/volltext` (Feld `woerter`) prüfen: je Seite des Texts (getrennt durch \f)
 * eine Liste von Wörtern `[Text, x, y, b, h]` (relativ, 0…1) oder null (Seite ohne Angabe, z. B. Textebene eines
 * gemischten PDFs). Liefert die Seiten oder wirft einen Fehler mit verständlichem Grund.
 */
export function pruefeWoerter(x: unknown, seiten: number): Array<Wort[] | null> {
  if (!Array.isArray(x)) throw new Error('woerter: eine Liste je Seite erwartet (Liste von [Text, x, y, b, h] oder null).');
  if (x.length !== seiten) throw new Error(`woerter: ${x.length} Seiten, der Text hat ${seiten} (getrennt durch Seitenvorschub \\f).`);
  let gesamt = 0;
  return x.map((s, i) => {
    if (s === null) return null;
    if (!Array.isArray(s)) throw new Error(`woerter: Seite ${i + 1} ist keine Liste.`);
    gesamt += s.length;
    if (gesamt > WOERTER_MAX) throw new Error(`woerter: höchstens ${WOERTER_MAX} Wörter je Dokument.`);
    return s.map((w, j): Wort => {
      const wo = t('gemeinsam.archivfassung.woerter-seite-wort', { wert: i + 1, wert2: j + 1 });
      if (!Array.isArray(w) || w.length !== 5 || typeof w[0] !== 'string' || !w.slice(1).every(zahl))
        throw new Error(`${wo}: [Text, x, y, b, h] erwartet.`);
      const [text, xx, y, b, h] = w as Wort;
      if (!text.trim() || text.length > WORT_MAX_LAENGE)
        throw new Error(`${wo}: der Text ist leer oder länger als ${WORT_MAX_LAENGE} Zeichen.`);
      const e = 0.001;
      if (xx < -e || y < -e || b <= 0 || h <= 0 || xx + b > 1 + e || y + h > 1 + e)
        throw new Error(`${wo}: Lage außerhalb der Seite (relativ 0…1, x + b und y + h höchstens 1).`);
      const r = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1e5) / 1e5;
      return [text, r(xx), r(y), r(b), r(h)];
    });
  });
}

/**
 * PDF/A-Kennung aus XMP-Metadaten lesen: `pdfaid:part` und `pdfaid:conformance` (als Attribut oder Element, mit dem
 * Präfix, unter dem der Namensraum `http://www.aiim.org/pdfa/ns/id/` steht). null, wenn sie fehlt.
 */
export function pdfaKennungAus(xmp: string): PdfaKennung | null {
  const praefixe = [...xmp.matchAll(/xmlns:([A-Za-z_][\w.-]*)\s*=\s*["']http:\/\/www\.aiim\.org\/pdfa\/ns\/id\/["']/g)].map((m) => m[1]);
  for (const p of praefixe) {
    const wert = (name: string) => {
      const e = p.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
      const a = new RegExp(`${e}:${name}\\s*=\\s*["']\\s*([^"'<]*?)\\s*["']`).exec(xmp);
      const k = new RegExp(`<${e}:${name}>\\s*([^<]*?)\\s*</${e}:${name}>`).exec(xmp);
      return (a ?? k)?.[1] ?? null;
    };
    const teil = wert('part');
    if (teil === null) continue;
    const stufe = wert('conformance');
    return { teil: /^\d+$/.test(teil) ? Number(teil) : Number.NaN, stufe: stufe ? stufe.toUpperCase() : null };
  }
  return null;
}

/** „Rechnung.pdf“ → „Rechnung (PDF-A).pdf“ – Dateiname der Archivfassung zum Herunterladen und Weitergeben. */
export function archivfassungName(name: string): string {
  const p = name.lastIndexOf('.');
  return `${p > 0 ? name.slice(0, p) : name} (PDF-A).pdf`;
}
