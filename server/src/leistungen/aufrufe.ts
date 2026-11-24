/**
 * Kleine Hilfen für die Stellen, an denen Ablago selbst PDFs bearbeitet (#1570): Sie rufen die Leistungen über
 * `kern.leistung` ab statt die PDF-Stelle direkt – mit demselben Ergebnis wie bisher, wenn Ablago es macht.
 */
import type { Datei, Leistungsweg } from '../../../shared/src/leistungen';
import { MIN_ERSPARNIS, type Stufe } from '../../../shared/src/verkleinern';
import { seitenInfo, type SeitenWahl, type VerkleinerErgebnis } from '../pdf';

const PDF = 'application/pdf';
const pdf = (inhalt: Buffer, name = 'dokument.pdf'): Datei => ({ inhalt, mime: PDF, name });
const puffer = (d: Datei | undefined): Buffer => {
  if (!d) throw new Error('Ergebnis ohne Datei');
  return Buffer.isBuffer(d.inhalt) ? d.inhalt : Buffer.from(d.inhalt.buffer, d.inhalt.byteOffset, d.inhalt.byteLength);
};

/** Neues PDF aus Seiten des Originals (Reihenfolge, Drehung) – „Seiten drehen und ordnen“. */
async function seitenUeber(weg: Leistungsweg, inhalt: Buffer, seiten: SeitenWahl[], name?: string): Promise<Buffer> {
  const s = seiten.map((x) => ({ nr: x.nr, ...(x.drehung ? { drehung: x.drehung } : {}) }));
  return puffer((await weg('dokument.bearbeiten.seiten@1', { datei: pdf(inhalt, name), seiten: s })).datei);
}

/** In Teile zerlegen: je Teil ein PDF (je Teil einmal „Seiten drehen und ordnen“, wie bisher je Teil gebaut). */
export async function teileUeber(
  weg: Leistungsweg,
  inhalt: Buffer,
  seiten: SeitenWahl[],
  starts: number[],
  name?: string,
): Promise<Buffer[]> {
  const erg: Buffer[] = [];
  for (const [i, s] of starts.entries()) erg.push(await seitenUeber(weg, inhalt, seiten.slice(s, starts[i + 1] ?? seiten.length), name));
  return erg;
}

/** Mehrere PDFs hintereinander zu einem – „PDFs zusammenfügen“; ein einzelnes wird wie bisher neu geschrieben. */
export async function zusammenUeber(weg: Leistungsweg, inhalte: Buffer[], name?: string): Promise<Buffer> {
  if (inhalte.length === 1) {
    const { anzahl } = await seitenInfo(inhalte[0]);
    return seitenUeber(
      weg,
      inhalte[0],
      Array.from({ length: anzahl }, (_, i) => ({ nr: i + 1 })),
      name,
    );
  }
  return puffer((await weg('dokument.bearbeiten.zusammenfuegen@1', { dateien: inhalte.map((b) => pdf(b, name)) })).datei);
}

/**
 * „PDF verkleinern“: das ganze Ergebnis von Ablago (`intern`), sonst aus dem, was ein Paket liefert – mit derselben
 * Regel „lohnt erst ab 10 % weniger“.
 */
export async function verkleinereUeber(
  weg: Leistungsweg,
  inhalt: Buffer,
  stufe: Stufe,
  name?: string,
): Promise<Omit<VerkleinerErgebnis, 'hinweise'>> {
  const r = await weg('dokument.bearbeiten.verkleinern@1', { datei: pdf(inhalt, name), stufe });
  const ganz = r.intern?.ergebnis as Omit<VerkleinerErgebnis, 'hinweise'> | undefined;
  if (ganz) return ganz;
  const neu = puffer(r.datei);
  const lohnt = neu.length <= inhalt.length * (1 - MIN_ERSPARNIS);
  return { inhalt: lohnt ? neu : inhalt, vorher: inhalt.length, nachher: neu.length, lohnt, stufe, bilder: 0, seiten: 0 };
}
