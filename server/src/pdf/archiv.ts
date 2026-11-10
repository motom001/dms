/**
 * Archivfassung (PDF/A, #631): was der Kern an einem PDF nachsieht – am Original (verschlüsselt, signiert, E-Rechnung,
 * Formular, externe Inhalte, schon PDF/A?) und an der Archivfassung eines Pakets (PDF/A-Kennung, nichts Externes) –
 * und die Wörter mit Lage aus der Textebene (für die Wortpositionen, die ein Paket bekommt).
 *
 * Bewusst nur eine **Grundprüfung** ohne neue Abhängigkeit (kein veraPDF): PDF lesbar, nicht verschlüsselt, Metadaten
 * (XMP) im Katalog, ungefiltert wie PDF/A es verlangt, mit der PDF/A-Kennung `pdfaid:part`/`pdfaid:conformance`; dazu
 * „nie nachladen“: kein JavaScript, keine Aktionen, keine Verweise auf externe Inhalte. Die volle Konformität prüft
 * das Paket in seiner CI (veraPDF).
 */
import { execFile } from '../hintergrund';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFObject, PDFRawStream, PDFRef, PDFStream, PDFString } from 'pdf-lib';
import type { SchwaerzSeite } from '../../../shared/src/schwaerzen';
import { liesBbox, popplerDrehungen } from './schwaerzen';
import { eigenerPuffer } from './puffer';
import { ladePdf } from './laden';
import { t } from '../sprache';
import { AUSGABE_ARCHIV } from '../grenzen';

/** Was der Kern an einem PDF findet – Bewertung und Meldungen macht archivfassung.ts. */
export interface PdfaBefund {
  /** pdf-lib konnte es lesen. */
  lesbar: boolean;
  verschluesselt: boolean;
  seiten: number;
  /** Inhalt des Metadaten-Stroms (XMP) im Katalog, null ohne. */
  metadaten: string | null;
  /** Der Metadaten-Strom ist gefiltert (komprimiert) – PDF/A verbietet das. */
  gefiltert: boolean;
  /** Digital signiert (Signaturfeld mit Wert bzw. /ByteRange). */
  signiert: boolean;
  /** E-Rechnung: ZUGFeRD/Factur-X/XRechnung als eingebettete XML. */
  erechnung: boolean;
  /** Formularfelder (AcroForm). */
  formular: boolean;
  /** JavaScript (Dokument, Felder, Aktionen). */
  javascript: boolean;
  /** Aktionen, die etwas starten, senden oder nachladen (Art der Aktion), und Aktionen beim Öffnen/Ereignissen. */
  aktionen: string[];
  /** Verweise auf externe Inhalte (Adressen bzw. Dateinamen, höchstens 50) – nur fürs Protokoll. */
  extern: string[];
}

/** Aktionen, die die Archivfassung nicht enthalten darf (PDF/A verbietet sie bzw. sie laden nach oder senden). */
const VERBOTENE_AKTIONEN = new Set(['JavaScript', 'Launch', 'URI', 'SubmitForm', 'ImportData', 'GoToR', 'GoToE', 'ResetForm', 'Sound', 'Movie', 'Rendition', 'Hide', 'SetOCGState', 'Trans', 'GoTo3DView', 'RichMediaExecute']);
const ERECHNUNG = /^(factur-x|zugferd-invoice|zugferd|xrechnung|order-x)\.xml$/i;

const text = (o: PDFObject | undefined): string | null => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : o instanceof PDFName ? o.decodeText() : null);

/** PDF lesen: Verschlüsselung, Seiten, Metadaten (XMP), Signatur, E-Rechnung, Formular, JavaScript, Aktionen, Externes. */
export async function liesPdfA(inhalt: Uint8Array): Promise<PdfaBefund> {
  const leer: PdfaBefund = { lesbar: false, verschluesselt: false, seiten: 0, metadaten: null, gefiltert: false, signiert: false, erechnung: false, formular: false, javascript: false, aktionen: [], extern: [] };
  let doc: PDFDocument;
  try { doc = await ladePdf(inhalt, { updateMetadata: false, ignoreEncryption: true, throwOnInvalidObject: false }); } catch { return leer; }
  const b: PdfaBefund = { ...leer, lesbar: true, verschluesselt: doc.isEncrypted, seiten: doc.getPageCount() };
  if (b.verschluesselt) return b;
  const strom = doc.catalog.lookup(PDFName.of('Metadata'));
  if (strom instanceof PDFStream) {
    b.gefiltert = strom.dict.get(PDFName.of('Filter')) !== undefined;
    if (strom instanceof PDFRawStream) b.metadaten = Buffer.from(strom.getContents()).toString('utf8').slice(0, 1_000_000);
  }
  const form = doc.catalog.lookup(PDFName.of('AcroForm'));
  if (form instanceof PDFDict) {
    const felder = form.lookup(PDFName.of('Fields'));
    b.formular = felder instanceof PDFArray && felder.size() > 0;
  }
  const aktionen = new Set<string>();
  const extern = new Set<string>();
  const gesehen = new Set<PDFDict>();
  // Alle Wörterbücher (auch direkt eingebettete, z. B. /A einer Verknüpfung) durchgehen.
  const pruefe = (d: PDFDict) => {
    if (gesehen.has(d)) return;
    gesehen.add(d);
    const get = (k: string) => d.get(PDFName.of(k));
    const art = text(get('S'));
    if (art && VERBOTENE_AKTIONEN.has(art)) aktionen.add(art);
    if (art === 'JavaScript' || get('JS') !== undefined) b.javascript = true;
    if (get('AA') !== undefined) aktionen.add('AA');
    const uri = text(get('URI'));
    if (uri) extern.add(uri.slice(0, 300));
    if (text(get('FS')) === 'URL') extern.add((text(get('F')) ?? 'URL').slice(0, 300));
    if (text(get('FT')) === 'Sig' && get('V') !== undefined) b.signiert = true;
    if (text(get('Type')) === 'Sig' || get('ByteRange') !== undefined) b.signiert = true;
    // Eingebettete Datei einer E-Rechnung (Name im Namensbaum oder in der Dateiangabe).
    const name = text(get('UF')) ?? text(get('F'));
    if (name && text(get('Type')) === 'Filespec' && ERECHNUNG.test(name)) b.erechnung = true;
    for (const [, v] of d.entries()) {
      if (v instanceof PDFDict) pruefe(v);
      else if (v instanceof PDFArray) for (const x of v.asArray()) { if (x instanceof PDFDict) pruefe(x); else if (text(x) && ERECHNUNG.test(text(x)!)) b.erechnung = true; }
    }
  };
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFDict) pruefe(o);
    else if (o instanceof PDFStream) {
      pruefe(o.dict);
      // Ein Strom mit /F holt seine Daten aus einer externen Datei.
      if (o.dict.get(PDFName.of('F')) !== undefined && !(o.dict.get(PDFName.of('F')) instanceof PDFRef)) extern.add(text(o.dict.get(PDFName.of('F'))) ?? t('meldungen.archiv.externe-datei'));
    }
  }
  // Öffnen-Aktion: Sprungziele sind harmlos, Aktionen nicht.
  const auf = doc.catalog.lookup(PDFName.of('OpenAction'));
  if (auf instanceof PDFDict && text(auf.get(PDFName.of('S'))) !== 'GoTo') aktionen.add('OpenAction');
  const namen = doc.catalog.lookup(PDFName.of('Names'));
  if (namen instanceof PDFDict && namen.get(PDFName.of('JavaScript')) !== undefined) b.javascript = true;
  b.aktionen = [...aktionen].sort();
  b.extern = [...extern].slice(0, 50);
  return b;
}

function starte(befehl: string, args: string[]): Promise<string> {
  return new Promise((ok, fehler) => {
    execFile(befehl, args, { timeout: 5 * 60_000, maxBuffer: AUSGABE_ARCHIV }, (e, aus, err) => {
      if (!e) return ok(String(aus));
      const x = new Error(String(err).trim().slice(0, 300) || e.message) as NodeJS.ErrnoException;
      x.code = (e as NodeJS.ErrnoException).code;
      fehler(x);
    });
  });
}

/**
 * Wörter mit Lage aus der Textebene eines PDFs (pdftotext -bbox), je Seite relativ zur angezeigten (gedrehten)
 * Seite. Gescannte Seiten haben keine Wörter. null, wenn poppler fehlt oder das PDF sich nicht lesen lässt.
 */
export async function textebeneWoerter(inhalt: Uint8Array): Promise<SchwaerzSeite[] | null> {
  let drehungen: number[];
  try {
    const doc = await ladePdf(inhalt, { updateMetadata: false, ignoreEncryption: true });
    if (doc.isEncrypted) return null;
    drehungen = doc.getPages().map((p) => ((p.getRotation().angle % 360) + 360) % 360);
  } catch { return null; }
  const dir = await mkdtemp(join(tmpdir(), 'dms-archiv-'));
  try {
    const ein = join(dir, 'ein.pdf');
    await writeFile(ein, inhalt);
    const d = await popplerDrehungen(ein, drehungen);
    const html = await starte('pdftotext', ['-bbox', '-cropbox', '-enc', 'UTF-8', ein, '-']).catch(() => null);
    if (html === null) return null;
    const seiten = liesBbox(html, d);
    return seiten.length === d.length ? seiten : null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
