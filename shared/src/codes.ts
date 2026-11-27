/**
 * Codes auf Dokumenten (#1723): QR-Codes und Barcodes, die ein Paket mit `dms:codes` (z. B. „QR-Code lesen“) auf den
 * Seiten eines Dokuments liest. Ablago merkt sie sich am Dokument (Art, Inhalt, Seite) und trägt beim „Aus Dokument
 * ausfüllen“ den passenden Inhalt in Felder mit der Erkennungsart `code` ein – etwa den Link zum Digitalen
 * Untersuchungsbericht auf dem HU-Bericht. Eigene Datei ohne Abhängigkeiten zur Laufzeit, damit Fachmodell, Erkennung,
 * Server und Oberfläche sie ohne Kreis nutzen.
 *
 * Die Form eines Codes ist die Ausgabe der Leistung `dokument.lesen.barcode@1` (shared/src/leistungen/katalog.ts);
 * geprüft wird mit deren Schema im Server (server/src/erkennung/codes.ts).
 */

import { MUSTER_EINGABE_MAX, musterProblem } from './muster';

/** Ab dieser Version kennt Ablago `dms:codes` und die Erkennungsart `code` (#1723); ältere lehnen beides ab bzw. übergehen es. */
export const DMS_CODES_AB = '0.335.0';
/** `codeart` am Feld: ein kurzer Bezeichner aus Kleinbuchstaben und Ziffern, z. B. `qr`, `ean13`, `itf`, `aztec`. */
const CODEART = /^[a-z0-9]{1,20}$/;

/** Ein gelesener Code, wie ihn `dokument.lesen.barcode@1` liefert: Art (z. B. `qr`), Inhalt und Seite (ab 1, wenn bekannt). */
export interface GelesenerCode {
  art: string;
  inhalt: string;
  seite?: number;
}

/** Angaben am Feld zur Erkennungsart `code` (#1723). Fehlt beides, passt jeder Code. */
export interface CodeAngaben {
  /**
   * Regulärer Ausdruck, der auf den ganzen Inhalt passen muss, z. B. `https://www\.kba-online\.de/dub/#/zugriffsdaten/.+`.
   * Dieselben Grenzen wie das Prüfmuster an Textfeldern (muster.ts: Länge, keine verschachtelten Wiederholungen).
   */
  muster?: string;
  /**
   * Art des Codes als kurzer Bezeichner, z. B. `qr`. Keine feste Liste im Kern: Die Namen kommen von den Paketen, die
   * Codes lesen (z. B. „Barcodes“, dms-registry #294). Verglichen ohne Groß- und Kleinschreibung und Satzzeichen.
   */
  codeart?: string;
}

/**
 * `muster` und `codeart` aus einer Eingabe (Werkbank, API, Paket) lesen. Ein ungültiges oder unsicheres Muster bleibt
 * stehen, damit die Prüfung des Mappentyps es meldet (wie bei Textfeldern) – passen kann es dann nie.
 */
export function liesCodeAngaben(o: Record<string, unknown>): CodeAngaben {
  const muster = typeof o.muster === 'string' ? o.muster.trim() : '';
  const codeart = typeof o.codeart === 'string' ? o.codeart.trim().toLowerCase() : '';
  return {
    ...(muster ? { muster: muster.slice(0, 1000) } : {}),
    ...(CODEART.test(codeart) ? { codeart } : {}),
  };
}

/** Art eines Codes zum Vergleichen: nur Buchstaben und Ziffern, klein („QR“ → „qr“, „EAN-13“ → „ean13“). */
const artKlein = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Ist das ein QR-Code (für die Fundstelle „QR-Code auf Seite 1“)? */
export const istQrCode = (art: string) => artKlein(art).startsWith('qr');

/**
 * Prüfer für die Angaben eines Felds: Art gleich `codeart`, Inhalt ganz passend zu `muster` (nur bis
 * MUSTER_EINGABE_MAX Zeichen, wie bei Textfeldern – gegen ReDoS). Ein unsicheres Muster passt nie.
 */
function codePruefer(e: CodeAngaben): (c: GelesenerCode) => boolean {
  const art = e.codeart ? artKlein(e.codeart) : '';
  if (e.muster && musterProblem(e.muster)) return () => false;
  const re = e.muster ? new RegExp(`^(?:${e.muster})$`) : null;
  return (c) => !!c.inhalt && (!art || artKlein(c.art) === art) && (!re || (c.inhalt.length <= MUSTER_EINGABE_MAX && re.test(c.inhalt)));
}

/**
 * Der Code, der zu den Angaben eines Felds passt. Passen mehrere, gewinnt der auf der früheren Seite (ohne Seite:
 * dahinter), bei gleicher Seite der zuerst gelieferte.
 */
export function passenderCode<T extends GelesenerCode>(e: CodeAngaben, codes: readonly T[]): T | null {
  const passt = codePruefer(e);
  const seite = (c: T) => (typeof c.seite === 'number' ? c.seite : Number.MAX_SAFE_INTEGER);
  let bester: T | null = null;
  for (const c of codes) if (passt(c) && (!bester || seite(c) < seite(bester))) bester = c;
  return bester;
}
