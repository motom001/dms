/**
 * Die gemeinsame PDF-Stelle (#541). Alle Arbeiten an PDFs mit pdf-lib laufen über diesen Ordner; nur
 * hier wird pdf-lib eingebunden (die Prüfung `test/pdf-stelle.test.ts` sperrt Importe anderswo). Ein
 * späterer Austausch der Bibliothek trifft damit nur diesen Ordner.
 *
 * Die Vorgänge nehmen und liefern einfache Daten (Bytes, Zahlen, Texte, Listen) – keine Objekte der
 * Bibliothek. Darum laufen sie in einem Arbeiter-Faden (#542, `arbeit/`): Die Funktionen unten geben den
 * Auftrag an den Pool und warten auf das Ergebnis; der Hauptfaden bleibt frei für andere Anfragen.
 * Kleine Helfer ohne Rechenaufwand (Bildart, WinAnsi, Auswerten von Texten) laufen direkt.
 *
 * Aufbau:
 * - `seiten.ts`        Seiten zählen, drehen, löschen, umsortieren, teilen, zusammenfügen, Fotos als Seiten
 * - `stempel.ts`       Stempel und Fußzeile (Weitergeben, #394), Bild als A4-Seite
 * - `verkleinern.ts`   Bilder herunterrechnen, Struktur aufräumen (#393)
 * - `schwaerzen.ts`    Seiten neu aufbauen, Bereiche schwärzen, Textebene ohne geschwärzte Wörter (#392)
 * - `schreiber.ts`     Textdokumente nach Plan (Auskunft, Löschkonzept, Löschprotokoll)
 * - `export.ts`        PDF mehrerer Mappen (#152)
 * - `aufkleber.ts`     Aufkleberbogen mit Barcode (#345)
 * - `notfallblatt.ts`  Notfallblatt in Ablago-Optik (#106, #814)
 * - `brief.ts`        Brief aus einer Text-Vorlage (#1040), getaggt, im Aufbau ähnlich DIN 5008
 * - `anzeige.ts`       bereinigte Kopie für die Anzeige im Browser (#639)
 * - `demo-dokumente.ts` Demo-Dokumente für Wachstumstests (#248)
 * - `einfach.ts`      sehr kleiner Schreiber für Textseiten ohne Bibliothek (früher Notfallblatt, #106)
 * - `bild.ts`, `puffer.ts`, `text.ts` kleine Helfer (Bildart, EXIF, Umgehung #456, WinAnsi)
 */
import { arbeite, arbeiteBis } from '../arbeit';
import type { Zufall } from '../zufall';
import type { Dokumentart } from '../../../shared/src/demodaten';
import type { MappenInhalt } from './demo-dokumente';
import type * as S from './seiten';
import type * as St from './stempel';
import type * as V from './verkleinern';
import type * as Sw from './schwaerzen';
import type * as Sch from './schreiber';
import type * as E from './export';
import type * as Au from './aufkleber';
import type * as Ar from './archiv';
import type * as An from './anzeige';
import type * as Nf from './notfallblatt';
import type * as Br from './brief';
import { TEXTSATZ_ZEIT_MS } from '../grenzen';

export { pdfAus, type Absatz, type Schrift } from './einfach';
export { bildArt, exifAusrichtung, jpegMasse } from './bild';
export { eigenerPuffer } from './puffer';
export { groesseText, pdfSicher } from './text';
export type { SeitenWahl } from './seiten';
export type { StempelAuftrag } from './stempel';
export { hatQpdf, operatoren, type Analyse as VerkleinerAnalyse, type Ergebnis as VerkleinerErgebnis } from './verkleinern';
export {
  ANSICHT_PX, SCHWAERZEN_DPI, liesBbox, maleSchwarz, pnmKopf, textAus, verbleibende,
  type Analyse as SchwaerzAnalyse, type Ergebnis as SchwaerzErgebnis,
} from './schwaerzen';
export { planer, type Anweisung, type Textdokument } from './schreiber';
export type { MappenPdfDaten, PdfMappenSeite } from './export';
export type { Aufkleberbogen } from './aufkleber';
export { kannRastern, png, type ErzeugtesDokument, type MappenInhalt } from './demo-dokumente';

/* ---------- Vorgänge im Arbeiter (#542) ---------- */

/** Parameter eines Vorgangs. */
type A<F extends (...a: never[]) => unknown> = Parameters<F>;

export const seitenInfo = (...a: A<typeof S.seitenInfo>) => arbeite('seitenInfo', ...a);
export const baueSeiten = (...a: A<typeof S.baueSeiten>) => arbeite('baueSeiten', ...a);
export const teileSeiten = (...a: A<typeof S.teileSeiten>) => arbeite('teileSeiten', ...a);
export const fuegeZusammen = (...a: A<typeof S.fuegeZusammen>) => arbeite('fuegeZusammen', ...a);
export const bilderZuPdf = (...a: A<typeof S.bilderZuPdf>) => arbeite('bilderZuPdf', ...a);
export const bildSeitePdf = (...a: A<typeof S.bildSeitePdf>) => arbeite('bildSeitePdf', ...a);
export const stempelePdf = (...a: A<typeof St.stempelePdf>) => arbeite('stempelePdf', ...a);
export const bildAlsA4Pdf = (...a: A<typeof St.bildAlsA4Pdf>) => arbeite('bildAlsA4Pdf', ...a);
export const analysiereVerkleinern = (...a: A<typeof V.analysiere>) => arbeite('analysiereVerkleinern', ...a);
export const verkleinerePdf = (...a: A<typeof V.verkleinere>) => arbeite('verkleinerePdf', ...a);
export const analysiereSchwaerzen = (...a: A<typeof Sw.analysiere>) => arbeite('analysiereSchwaerzen', ...a);
export const schwaerze = (...a: A<typeof Sw.schwaerze>) => arbeite('schwaerze', ...a);
export const schwaerzSeitenbild = (...a: A<typeof Sw.seitenbild>) => arbeite('schwaerzSeitenbild', ...a);
export const arbeitsPdf = (...a: A<typeof Sw.arbeitsPdf>) => arbeite('arbeitsPdf', ...a);
export const textdokumentPdf = (...a: A<typeof Sch.textdokumentPdf>) => arbeite('textdokumentPdf', ...a);
export const mappenPdfZeichnen = (...a: A<typeof E.mappenPdfZeichnen>) => arbeite('mappenPdfZeichnen', ...a);
export const aufkleberbogenPdf = (...a: A<typeof Au.aufkleberbogenPdf>) => arbeite('aufkleberbogenPdf', ...a);
/** Notfallblatt (#814): eine Seite A4 in Ablago-Optik. */
export const notfallblattPdf = (...a: A<typeof Nf.notfallblattPdf>) => arbeite('notfallblattPdf', ...a);
/** Archivfassung (#631): PDF/A-Kennung nachsehen, Wörter mit Lage aus der Textebene. */
export const liesPdfA = (...a: A<typeof Ar.liesPdfA>) => arbeite('liesPdfA', ...a);
export const textebeneWoerter = (...a: A<typeof Ar.textebeneWoerter>) => arbeite('textebeneWoerter', ...a);
export const bereinigePdf = (...a: A<typeof An.bereinigePdf>) => arbeite('bereinigePdf', ...a);
export type { PdfaBefund } from './archiv';
/** Brief aus einer Text-Vorlage (#1040) – mit eigener Zeitgrenze (grenzen.ts). */
export const briefPdf = (...a: A<typeof Br.briefPdf>) => arbeiteBis(TEXTSATZ_ZEIT_MS, 'briefPdf', ...a);

/** Demo-Dokument (#248) im Arbeiter; der Zufall geht danach mit dem Stand aus dem Arbeiter weiter. */
export async function erzeugeDokument(z: Zufall, art: Dokumentart, m: MappenInhalt, kennung: string, rastern: boolean) {
  const r = await arbeite('demoDokument', z.zustand(), art, m, kennung, rastern);
  z.uebernimm(r.zustand);
  return r.dokument;
}
