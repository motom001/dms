/**
 * Eingebaute Werkzeuge (#1189): Programme, die das Image von Ablago mitbringt und die der Kern selbst aufruft.
 * Die Werkbank zeigt sie nur, wenn eins fehlt – dann mit Folge und Abhilfe in Alltagssprache; die Namen der
 * Programme stehen nur als Detail für Fachleute dabei.
 *
 * - **Poppler** (`pdftotext`, `pdftoppm`): Text aus PDFs lesen (Volltext, Schwärzen), Seiten- und Vorschaubilder,
 *   Bilder beim Verkleinern neu rechnen.
 * - **qpdf**: geschützte PDFs erkennen und entsperren, die Struktur beim Verkleinern optimieren.
 * - **Ersatzschriften** (#1329, Liberation und DejaVu): Text von PDFs, die ihre Schriften nicht einbetten, in Seiten-,
 *   Vorschaubildern und Archivfassung. Geprüft wird, ob poppler Ersatz findet (Probe-PDF; „Couldn't find a font“
 *   beim Rendern gilt ebenso).
 */
export interface Werkzeuge {
  pdftotext: boolean;
  pdftoppm: boolean;
  /** Fehlt bei Ständen, die qpdf noch nicht geprüft haben: dann gilt es als vorhanden. */
  qpdf?: boolean;
  /** Ersatzschriften (#1329); fehlt bei älteren Ständen und ohne pdftoppm: dann gilt es als vorhanden. */
  schriften?: boolean;
}

/** Ein Werkzeug, wie die Werkbank es nennt: Kennung für die Texte und die Programme, die dazu gehören. */
export type WerkzeugArt = 'poppler' | 'qpdf' | 'schriften';
/** Programme bzw. bei den Schriften die Alpine-Pakete, die dazugehören. */
export const WERKZEUG_PROGRAMME: Readonly<Record<WerkzeugArt, readonly string[]>> = {
  poppler: ['pdftotext', 'pdftoppm'],
  qpdf: ['qpdf'],
  schriften: ['font-liberation', 'font-dejavu'],
};

/** Welche Werkzeuge fehlen – in fester Reihenfolge; leer, wenn alles da ist oder noch nichts geprüft wurde. */
export function fehlendeWerkzeuge(w: Werkzeuge | null | undefined): WerkzeugArt[] {
  if (!w) return [];
  const fehlt: WerkzeugArt[] = [];
  if (!w.pdftotext || !w.pdftoppm) fehlt.push('poppler');
  if (w.qpdf === false) fehlt.push('qpdf');
  if (w.schriften === false) fehlt.push('schriften');
  return fehlt;
}

/** Die fehlenden Programme eines Werkzeugs (für Fachleute), z. B. „pdftoppm“. */
export function fehlendeProgramme(w: Werkzeuge, art: WerkzeugArt): string[] {
  if (art === 'schriften') return w.schriften === false ? [...WERKZEUG_PROGRAMME.schriften] : [];
  return WERKZEUG_PROGRAMME[art].filter((p) => w[p as keyof Werkzeuge] === false);
}
