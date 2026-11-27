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

/** Ab dieser Version kennt Ablago `dms:codes` und die Erkennungsart `code` (#1723); ältere lehnen beides ab bzw. übergehen es. */
export const DMS_CODES_AB = '0.335.0';
/** Höchstens so lang ist `muster` an einem Feld mit der Erkennungsart `code` (Zeichen). */
export const CODE_MUSTER_MAX = 200;
/** `codeart` am Feld: kleine Buchstaben, Ziffern, `_` und `-`, z. B. `qr`, `ean13`, `code128`. */
const CODEART = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Ein gelesener Code, wie ihn `dokument.lesen.barcode@1` liefert: Art (z. B. `qr`), Inhalt und Seite (ab 1, wenn bekannt). */
export interface GelesenerCode {
  art: string;
  inhalt: string;
  seite?: number;
}

/** Angaben am Feld zur Erkennungsart `code` (#1723). Fehlt beides, passt jeder Code. */
export interface CodeAngaben {
  /** Anfang des Inhalts, z. B. `https://www.kba-online.de/dub/#/zugriffsdaten/` – ohne Groß- und Kleinschreibung. */
  muster?: string;
  /** Art des Codes, z. B. `qr` – passt auf jede Art, die so beginnt (`qr`, `qrcode`, „QR_CODE“). */
  codeart?: string;
}

/** `muster` und `codeart` aus einer Eingabe (Werkbank, API, Paket) lesen; Ungültiges fällt still weg. */
export function liesCodeAngaben(o: Record<string, unknown>): CodeAngaben {
  const muster = typeof o.muster === 'string' ? o.muster.trim() : '';
  const codeart = typeof o.codeart === 'string' ? o.codeart.trim().toLowerCase() : '';
  return {
    ...(muster && muster.length <= CODE_MUSTER_MAX ? { muster } : {}),
    ...(CODEART.test(codeart) ? { codeart } : {}),
  };
}

/** Art eines Codes zum Vergleichen: nur Buchstaben und Ziffern, klein („QR_CODE“ → „qrcode“). */
const artKlein = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Ist das ein QR-Code (für die Fundstelle „QR-Code auf Seite 1“)? */
export const istQrCode = (art: string) => artKlein(art).startsWith('qr');

/**
 * Der Code, der zu den Angaben eines Felds passt: Inhalt beginnt mit `muster`, Art beginnt mit `codeart`. Passen
 * mehrere, gewinnt der auf der früheren Seite (ohne Seite: dahinter), bei gleicher Seite der zuerst gelieferte.
 */
export function passenderCode<T extends GelesenerCode>(e: CodeAngaben, codes: readonly T[]): T | null {
  const muster = e.muster?.toLowerCase() ?? '';
  const art = e.codeart ? artKlein(e.codeart) : '';
  const seite = (c: T) => (typeof c.seite === 'number' ? c.seite : Number.MAX_SAFE_INTEGER);
  let bester: T | null = null;
  for (const c of codes) {
    if (!c.inhalt || !c.inhalt.toLowerCase().startsWith(muster) || !artKlein(c.art).startsWith(art)) continue;
    if (!bester || seite(c) < seite(bester)) bester = c;
  }
  return bester;
}
