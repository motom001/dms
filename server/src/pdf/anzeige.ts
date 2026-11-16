/**
 * Bereinigte Kopie eines PDFs für die Anzeige im Browser (#639): Der eingebaute Betrachter des Browsers bekommt
 * keine strenge Content-Security-Policy (sonst zeigt er nichts an), also entfernt das DMS vorher alles, was beim
 * Ansehen etwas ausführen oder nach außen schicken kann: JavaScript, automatische Aktionen (/OpenAction, /AA),
 * Formular-Übermittlung, Start- und Fernaktionen (Launch, GoToR, GoToE, ImportData), Medien und eingebettete Dateien.
 * Links (URI) und Sprünge im Dokument bleiben – sie öffnen sich nur auf Klick.
 *
 * Nur für die Anzeige: Das gespeicherte Original bleibt unverändert; Herunterladen und Weitergeben liefern es.
 * Verschlüsselte oder unlesbare PDFs lassen sich nicht bereinigen – dann gibt es sie nur zum Herunterladen.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject, PDFRef, PDFStream } from 'pdf-lib';
import { eigenerPuffer } from './puffer';
import { ladePdf } from './laden';
import { t } from '../sprache';

/** Aktionen, die beim Ansehen etwas ausführen, nachladen oder senden. URI, GoTo, Named u. a. bleiben. */
const GEFAEHRLICHE_AKTIONEN = new Set([
  'JavaScript',
  'Launch',
  'SubmitForm',
  'ImportData',
  'GoToR',
  'GoToE',
  'GoToDp',
  'Rendition',
  'Sound',
  'Movie',
  'RichMediaExecute',
  'GoTo3DView',
]);
/** Anmerkungen, die Dateien, Medien oder Skripte tragen. */
const GEFAEHRLICHE_ANMERKUNGEN = new Set(['FileAttachment', 'Sound', 'Movie', 'Screen', 'RichMedia', '3D']);
/** Schlüssel, die überall wegfallen: Skripte, automatische Aktionen, eingebettete Dateien, XFA-Formulare (mit Skripten). */
const WEG = ['JS', 'JavaScript', 'AA', 'OpenAction', 'EmbeddedFiles', 'EF', 'XFA', 'RichMediaContent', 'Collection'].map((k) =>
  PDFName.of(k),
);
const JS = PDFName.of('JS'),
  S = PDFName.of('S'),
  A = PDFName.of('A'),
  NEXT = PDFName.of('Next'),
  SUBTYPE = PDFName.of('Subtype'),
  ANNOTS = PDFName.of('Annots');

/** Art, die eine entfernte Aktion bekommt (unbekannt – Betrachter übergehen sie). */
const ENTFERNT = 'Entfernt';

export interface Bereinigt {
  pdf: Uint8Array;
  entfernt: string[];
}

const name = (o: PDFObject | undefined) => (o instanceof PDFName ? o.decodeText() : null);

/** Bereinigte Kopie; wirft bei verschlüsselten oder unlesbaren PDFs. entfernt: was es gefunden hat (fürs Protokoll). */
export async function bereinigePdf(inhalt: Uint8Array): Promise<Bereinigt> {
  const doc = await ladePdf(inhalt, { updateMetadata: false, ignoreEncryption: true });
  if (doc.isEncrypted) throw new Error('Das PDF ist verschlüsselt.');
  const entfernt = new Set<string>();
  const ctx = doc.context;
  const gesehen = new Set<PDFDict>();
  const gefaehrlich = (o: PDFObject | undefined) => {
    const d = o ? ctx.lookup(o) : undefined;
    const art = d instanceof PDFDict ? name(d.get(S)) : null;
    return !!art && (GEFAEHRLICHE_AKTIONEN.has(art) || art === ENTFERNT);
  };
  const reinige = (d: PDFDict) => {
    if (gesehen.has(d)) return;
    gesehen.add(d);
    // Erst hinein (auch in Teile, die gleich wegfallen – deren Skript-Ströme sollen mit weg), dann aufräumen.
    for (const [, v] of d.entries()) {
      if (v instanceof PDFDict) reinige(v);
      else if (v instanceof PDFArray) for (const x of v.asArray()) if (x instanceof PDFDict) reinige(x);
    }
    for (const k of WEG)
      if (d.has(k)) {
        // Skript-Ströme ganz weg (nicht nur den Verweis), damit der Text nicht in der Kopie steht.
        const v = d.get(k);
        if (k === JS && v instanceof PDFRef) ctx.delete(v);
        d.delete(k);
        entfernt.add(k.decodeText());
      }
    // Aktion: Verweise darauf (/A) und Ketten (/Next) fallen weg; die Aktion selbst wird unkenntlich (unbekannte Art –
    // Betrachter übergehen sie), falls sie noch von woanders erreichbar ist.
    for (const k of [A, NEXT])
      if (d.has(k) && (gefaehrlich(d.get(k)) || k === NEXT)) {
        d.delete(k);
        entfernt.add(k === A ? 'Aktion' : 'Next');
      }
    const art = name(d.get(S));
    if (art && GEFAEHRLICHE_AKTIONEN.has(art)) {
      d.set(S, PDFName.of(ENTFERNT));
      entfernt.add(art);
    }
    const annots = d.lookup(ANNOTS);
    if (annots instanceof PDFArray) {
      const bleiben = annots.asArray().filter((x) => {
        const an = ctx.lookup(x);
        const weg = an instanceof PDFDict && GEFAEHRLICHE_ANMERKUNGEN.has(name(an.get(SUBTYPE)) ?? '');
        if (weg) {
          entfernt.add(`Anmerkung ${name((an as PDFDict).get(SUBTYPE))}`);
          if (x instanceof PDFRef) ctx.delete(x);
        }
        return !weg;
      });
      if (bleiben.length !== annots.size()) d.set(ANNOTS, ctx.obj(bleiben));
    }
  };
  for (const [, o] of ctx.enumerateIndirectObjects()) {
    if (o instanceof PDFDict) reinige(o);
    else if (o instanceof PDFStream) reinige(o.dict);
  }
  // Eingebettete Dateien (Ströme /Type /EmbeddedFile) sind nach dem Entfernen von /EF nicht mehr erreichbar; save()
  // schreibt trotzdem alle Objekte – deshalb leeren.
  for (const [ref, o] of ctx.enumerateIndirectObjects()) {
    if (o instanceof PDFStream && name(o.dict.get(PDFName.of('Type'))) === 'EmbeddedFile') {
      ctx.delete(ref);
      entfernt.add(t('meldungen.anzeige.eingebettete-datei'));
    }
  }
  return { pdf: await doc.save({ updateFieldAppearances: false, useObjectStreams: false }), entfernt: [...entfernt].sort() };
}
