/**
 * PDF für die Anzeige im Browser (#639): bereinigte Kopie aus dem Arbeiter-Pool, zwischengespeichert je Prüfsumme
 * des Originals (im Speicher, höchstens CACHE_BYTES). Gelingt das Bereinigen nicht, null – dann gibt es das PDF
 * nur zum Herunterladen.
 */
import { createHash } from 'node:crypto';
import { bereinigePdf } from './pdf';
import { protokoll } from './protokoll';
import { anteilVon } from './zwischenspeicher';
import { PDF_CACHE_BYTES as CACHE_BYTES } from './grenzen';

const L = protokoll.modul('dokumente');
export { CACHE_BYTES };
const grenze = () => anteilVon(CACHE_BYTES);

const cache = new Map<string, Buffer>();
let belegt = 0;
const laufend = new Map<string, Promise<Buffer | null>>();

/** Nur gelungene Kopien: Ein Fehlschlag kann vorübergehend sein (Pool voll, Zeitgrenze). */
const merke = (sha: string, b: Buffer | null) => {
  if (!b || b.length > grenze() / 4) return; // sehr große PDFs nicht behalten
  cache.set(sha, b);
  belegt += b.length;
  // Älteste zuerst hinaus (Map behält die Einfügereihenfolge; ein Treffer stellt den Eintrag nach hinten).
  for (const [k, v] of cache) {
    if (belegt <= grenze()) break;
    cache.delete(k);
    belegt -= v.length;
  }
};

/** Bereinigte Kopie eines PDFs für die Anzeige; null, wenn es sich nicht bereinigen lässt (verschlüsselt, beschädigt). */
export async function pdfFuerAnzeige(inhalt: Buffer): Promise<Buffer | null> {
  const sha = createHash('sha256').update(inhalt).digest('hex');
  if (cache.has(sha)) {
    const b = cache.get(sha)!;
    cache.delete(sha); cache.set(sha, b);
    return b;
  }
  let p = laufend.get(sha);
  if (!p) {
    p = bereinigePdf(inhalt).then((r) => {
      if (r.entfernt.length) L.info('PDF für die Anzeige bereinigt', { sha256: sha.slice(0, 12), entfernt: r.entfernt.join(', ') });
      return Buffer.from(r.pdf);
    }, (e) => {
      L.warn('PDF lässt sich nicht für die Anzeige bereinigen – nur Herunterladen', { sha256: sha.slice(0, 12), fehler: (e as Error).message.slice(0, 200) });
      return null;
    }).then((b) => { merke(sha, b); return b; }).finally(() => laufend.delete(sha));
    laufend.set(sha, p);
  }
  return p;
}

/** Für Tests. */
export function leereAnzeigeCache() { cache.clear(); belegt = 0; }
