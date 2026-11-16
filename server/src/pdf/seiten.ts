/**
 * Seiten von PDFs (#335, #490), in der PDF-Stelle (#541): Seiten zählen, drehen, löschen, umsortieren,
 * teilen, zusammenfügen und Fotos als Seiten. Seiten werden kopiert, nicht neu gerendert: Text, Bilder und
 * Schriften bleiben, wie sie sind.
 */
import { degrees, PDFDocument } from 'pdf-lib';
import { Fachfehler } from '../fehler';
import { bildArt, exifAusrichtung } from './bild';
import { eigenerPuffer } from './puffer';
import { ladePdf } from './laden';
import { t } from '../sprache';

/** Eine Seite im Ergebnis: Nummer im Original (ab 1) und zusätzliche Drehung im Uhrzeigersinn. */
export interface SeitenWahl {
  nr: number;
  drehung?: number;
}

async function lade(inhalt: Buffer): Promise<PDFDocument> {
  try {
    return await ladePdf(inhalt, { updateMetadata: false });
  } catch (e) {
    const m = (e as Error).message;
    if (/encrypt/i.test(m)) throw new Fachfehler(422, t('meldungen.seiten.das-pdf-ist-mit'));
    throw new Fachfehler(422, t('meldungen.seiten.die-datei-laesst-sich'));
  }
}

/**
 * Kaputte Strukturen (kreisförmiger Seitenbaum, falsche Objektarten) zeigen sich oft erst nach dem Laden, beim Lesen
 * der Seiten (#823). Dann dieselbe verständliche Meldung wie beim Laden statt eines Fehlers aus pdf-lib.
 */
async function lesbar<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof Fachfehler) throw e;
    throw new Fachfehler(422, t('meldungen.seiten.die-datei-laesst-sich'));
  }
}

/** Seitenzahl und aktuelle Drehung je Seite. */
export async function seitenInfo(inhalt: Buffer): Promise<{ anzahl: number; drehungen: number[] }> {
  const doc = await lade(inhalt);
  return lesbar(async () => {
    const seiten = doc.getPages();
    return { anzahl: seiten.length, drehungen: seiten.map((s) => ((s.getRotation().angle % 360) + 360) % 360) };
  });
}

/** Neues PDF aus Seiten des Originals (Reihenfolge, Drehung, ohne die weggelassenen). */
export async function baueSeiten(inhalt: Buffer, seiten: SeitenWahl[]): Promise<Buffer> {
  const quelle = await lade(inhalt);
  return lesbar(async () => {
    const ziel = await PDFDocument.create();
    const kopien = await ziel.copyPages(
      quelle,
      seiten.map((s) => s.nr - 1),
    );
    kopien.forEach((p, i) => {
      const d = seiten[i].drehung ?? 0;
      if (d) p.setRotation(degrees((((p.getRotation().angle + d) % 360) + 360) % 360));
      ziel.addPage(p);
    });
    return Buffer.from(await ziel.save());
  });
}

/** In Teile zerlegen: je Teil ein PDF. */
export async function teileSeiten(inhalt: Buffer, seiten: SeitenWahl[], starts: number[]): Promise<Buffer[]> {
  const erg: Buffer[] = [];
  for (const [i, s] of starts.entries()) erg.push(await baueSeiten(inhalt, seiten.slice(s, starts[i + 1] ?? seiten.length)));
  return erg;
}

/** Mehrere PDFs hintereinander zu einem. */
export async function fuegeZusammen(inhalte: Buffer[]): Promise<Buffer> {
  const ziel = await PDFDocument.create();
  for (const b of inhalte) {
    const q = await lade(b);
    await lesbar(async () => {
      for (const p of await ziel.copyPages(q, q.getPageIndices())) ziel.addPage(p);
    });
  }
  return Buffer.from(await ziel.save());
}

/** Längste Seite einer Fotoseite in Punkten (A4-Höhe). */
const FOTOSEITE_PT = 842;
const DREHUNG_EXIF: Record<number, number> = { 3: 180, 6: 90, 8: 270 };

/**
 * Fotos als PDF (#490, „Post fotografieren“): je Foto eine Seite, das Bild unverändert eingebettet
 * (JPEG ohne neu zu packen), längste Seite so groß wie A4, Lage laut EXIF. Bilder nur über
 * eigenerPuffer() an pdf-lib (sonst übersieht es den Versatz des Buffers).
 */
export async function bilderZuPdf(bilder: Buffer[]): Promise<Buffer> {
  if (!bilder.length) throw new Fachfehler(422, t('meldungen.seiten.keine-fotos'));
  const doc = await PDFDocument.create();
  for (const [i, b] of bilder.entries()) {
    const art = bildArt(b);
    if (!art) throw new Fachfehler(422, t('meldungen.seiten.foto-nur-jpeg-und', { wert: i + 1 }));
    let bild;
    try {
      bild = art === 'image/png' ? await doc.embedPng(eigenerPuffer(b)) : await doc.embedJpg(eigenerPuffer(b));
    } catch {
      throw new Fachfehler(422, t('meldungen.seiten.foto-laesst-sich-nicht', { wert: i + 1 }));
    }
    const f = FOTOSEITE_PT / Math.max(bild.width, bild.height);
    const w = bild.width * f,
      h = bild.height * f;
    const seite = doc.addPage([w, h]);
    seite.drawImage(bild, { x: 0, y: 0, width: w, height: h });
    const d = art === 'image/jpeg' ? DREHUNG_EXIF[exifAusrichtung(b)] : undefined;
    if (d) seite.setRotation(degrees(d));
  }
  return Buffer.from(await doc.save());
}

/** Bild in ein einseitiges PDF in Bildgröße legen (für pdftoppm, das nur PDFs liest; Vorschaubilder #367). */
export async function bildSeitePdf(inhalt: Uint8Array, mime: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const bild = mime === 'image/png' ? await doc.embedPng(eigenerPuffer(inhalt)) : await doc.embedJpg(eigenerPuffer(inhalt));
  const seite = doc.addPage([bild.width, bild.height]);
  seite.drawImage(bild, { x: 0, y: 0, width: bild.width, height: bild.height });
  return Buffer.from(await doc.save());
}
