/**
 * Große Dateien als Strom ausliefern, mit Weiterlesen nach Abbruch (#975): HTTP-Range nach RFC 9110 für genau einen
 * Bereich (`bytes=a-b`, `bytes=a-`, `bytes=-n`). Mehrere Bereiche, ein fremdes Maß oder ein unlesbarer Kopf ergeben
 * die ganze Datei (200) – das erlaubt die Norm. `If-Range` mit einem anderen ETag ebenso. Ein Bereich hinter dem Ende
 * ergibt 416, mit der Größe der Datei in `Content-Range`.
 *
 * Die Datei liest `oeffne` erst, wenn feststeht, welcher Teil gebraucht wird – nie ganz in den Arbeitsspeicher. So
 * passt dieselbe Schnittstelle auch für Dateien, die nicht im eigenen Ordner liegen (entfernte Sicherungen, #976):
 * Wer `Abrufbar` liefert, bekommt Range, Dateiname und Köpfe gleich.
 */
import { Readable } from 'node:stream';
import type { Antwort } from '../routen';
import { t } from '../sprache';

/** Eine Datei, die sich in Teilen lesen lässt. `ende` ist wie bei createReadStream eingeschlossen. */
export interface Abrufbar {
  /** Dateiname beim Speichern (Content-Disposition). */
  dateiname: string;
  groesse: number;
  /** Starker ETag ohne Anführungszeichen, z. B. die SHA-256 der Datei; fehlt er, gilt `If-Range` nie als passend. */
  etag?: string | null;
  mime?: string;
  oeffne(bereich: { start: number; ende: number }): Promise<Readable>;
}

export type Bereich = { start: number; ende: number };

/**
 * Den Range-Kopf lesen: `null` = ganze Datei, `'unerfuellbar'` = 416, sonst der Bereich (beide Grenzen eingeschlossen).
 * Eine leere Datei hat keinen erfüllbaren Bereich – dann immer die ganze (leere) Datei.
 */
export function liesBereich(kopf: string | undefined, groesse: number): Bereich | null | 'unerfuellbar' {
  if (!kopf || groesse === 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(kopf.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (!Number.isSafeInteger(n)) return null;
    if (n === 0) return 'unerfuellbar';
    return { start: Math.max(0, groesse - n), ende: groesse - 1 };
  }
  const start = Number(m[1]);
  const ende = m[2] === '' ? Number.MAX_SAFE_INTEGER : Number(m[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(ende) || ende < start) return null;
  if (start >= groesse) return 'unerfuellbar';
  return { start, ende: Math.min(ende, groesse - 1) };
}

/** Passt `If-Range` zum ETag? Ohne Kopf ja; ein Datum oder ein schwacher ETag gilt nie (wir vergleichen stark). */
function passtIfRange(kopf: string | undefined, etag: string | null | undefined): boolean {
  if (kopf === undefined) return true;
  return !!etag && kopf.trim() === `"${etag}"`;
}

/** Antwort für `d`: ganz (200) oder ein Teil (206), als Strom; `bereich` sagt, was ausgeliefert wird (für das Protokoll). */
export async function abruf(d: Abrufbar, kopf: (name: string) => string | undefined): Promise<{ antwort: Antwort; bereich: Bereich | null }> {
  const koepfe: Record<string, string> = { 'accept-ranges': 'bytes', 'cache-control': 'no-store', ...(d.etag ? { etag: `"${d.etag}"` } : {}) };
  const b = passtIfRange(kopf('if-range'), d.etag) ? liesBereich(kopf('range'), d.groesse) : null;
  if (b === 'unerfuellbar') {
    return { antwort: { status: 416, body: { fehler: t('meldungen.http.bereich-unerfuellbar', { groesse: d.groesse }) }, koepfe: { ...koepfe, 'content-range': `bytes */${d.groesse}` } }, bereich: null };
  }
  const teil = b ?? { start: 0, ende: d.groesse - 1 };
  const inhalt = d.groesse === 0 ? Readable.from([]) : await d.oeffne(teil);
  return {
    antwort: {
      ...(b ? { status: 206 } : {}),
      datei: {
        inhalt, name: d.dateiname, mime: d.mime ?? 'application/octet-stream', anzeigen: false, groesse: b ? b.ende - b.start + 1 : d.groesse,
        koepfe: { ...koepfe, ...(b ? { 'content-range': `bytes ${b.start}-${b.ende}/${d.groesse}` } : {}) },
      },
    },
    bereich: b,
  };
}
