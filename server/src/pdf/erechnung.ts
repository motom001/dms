/**
 * Eingebettete E-Rechnung aus einem PDF holen (#1043, ZUGFeRD/Factur-X): die Datei `factur-x.xml` (bzw.
 * `zugferd-invoice.xml`, `xrechnung.xml` …) aus dem Namensbaum `/EmbeddedFiles` oder der Liste `/AF` des Katalogs.
 *
 * Sicherheit: geladen über `ladePdf()` mit den Grenzen für Objektströme (#823). Der Strom der Datei wird nur entpackt,
 * wenn er ungepackt oder mit FlateDecode gepackt ist, und nie größer als ERECHNUNG_XML_MAX (zlib `maxOutputLength`).
 * Der Namensbaum wird nur bis zu einer festen Tiefe und Zahl von Einträgen durchsucht. Das PDF selbst bleibt
 * unverändert – gelesen wird eine Kopie im Arbeiter.
 */
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFRawStream, PDFString, type PDFObject } from 'pdf-lib';
import { ERECHNUNG_DATEINAME } from '../../../shared/src/erechnung';
import { ERECHNUNG_XML_MAX } from '../grenzen';
import { ladePdf } from './laden';

const name = (o: PDFObject | undefined): string | null => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : o instanceof PDFName ? o.decodeText() : null);
/** Höchstens so tief und so viele Einträge im Namensbaum. */
const BAUM_TIEFE = 8;
const BAUM_EINTRAEGE = 1000;

/** XML der eingebetteten E-Rechnung als Text; null, wenn es keine gibt oder sie sich nicht sicher entpacken lässt. */
export async function eingebetteteERechnung(inhalt: Uint8Array): Promise<string | null> {
  let doc;
  try { doc = await ladePdf(inhalt, { updateMetadata: false, ignoreEncryption: true, throwOnInvalidObject: false }); } catch { return null; }
  try { return suche(doc); } catch { return null; }
}

function suche(doc: Awaited<ReturnType<typeof ladePdf>>): string | null {
  const kat = doc.catalog;
  if (!kat) return null;
  const dateien: PDFDict[] = [];
  // Liste /AF (PDF/A-3) …
  const af = kat.lookup(PDFName.of('AF'));
  if (af instanceof PDFArray) for (let i = 0; i < Math.min(af.size(), BAUM_EINTRAEGE); i++) { const x = af.lookup(i); if (x instanceof PDFDict) dateien.push(x); }
  // … und der Namensbaum /Names /EmbeddedFiles.
  const namen = kat.lookup(PDFName.of('Names'));
  const baum = namen instanceof PDFDict ? namen.lookup(PDFName.of('EmbeddedFiles')) : undefined;
  let gezaehlt = 0;
  const durch = (k: unknown, tiefe: number) => {
    if (!(k instanceof PDFDict) || tiefe > BAUM_TIEFE || gezaehlt > BAUM_EINTRAEGE) return;
    const n = k.lookup(PDFName.of('Names'));
    if (n instanceof PDFArray) for (let i = 1; i < n.size() && gezaehlt <= BAUM_EINTRAEGE; i += 2, gezaehlt++) { const x = n.lookup(i); if (x instanceof PDFDict) dateien.push(x); }
    const kids = k.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size() && gezaehlt <= BAUM_EINTRAEGE; i++, gezaehlt++) durch(kids.lookup(i), tiefe + 1);
  };
  durch(baum, 0);
  for (const fs of dateien) {
    const n = name(fs.get(PDFName.of('UF'))) ?? name(fs.get(PDFName.of('F')));
    if (!n || !ERECHNUNG_DATEINAME.test(n.trim())) continue;
    const ef = fs.lookup(PDFName.of('EF'));
    const strom = ef instanceof PDFDict ? ef.lookup(PDFName.of('UF')) ?? ef.lookup(PDFName.of('F')) : undefined;
    if (!(strom instanceof PDFRawStream)) continue;
    const xml = entpackt(strom);
    if (xml != null) return xml;
  }
  return null;
}

/** Inhalt eines Stroms: ungepackt oder FlateDecode, höchstens ERECHNUNG_XML_MAX; sonst null. */
function entpackt(s: PDFRawStream): string | null {
  const roh = s.getContents();
  const f = s.dict.lookup(PDFName.of('Filter'));
  const filter = f instanceof PDFArray ? (f.size() === 1 ? name(f.lookup(0)) : 'mehrere') : f ? name(f) : null;
  try {
    if (!filter) return roh.length <= ERECHNUNG_XML_MAX ? Buffer.from(roh).toString('utf8') : null;
    if (filter !== 'FlateDecode') return null;
    return inflateSync(roh, { maxOutputLength: ERECHNUNG_XML_MAX, finishFlush: 2 /* Z_SYNC_FLUSH */ }).toString('utf8');
  } catch {
    return null;
  }
}
