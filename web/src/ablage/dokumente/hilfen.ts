/** Dokumentenregister (#1279): Größen, Zeiten, Sortierung, Art und Herkunft in Worten und was die Anzeige zeigt. */
import { HERKUNFT, type Dokument, type Herkunft } from '../../../../shared/src/model';
import { sprachname } from '../../../../shared/src/textsprache';
import { fassungAusInfo } from '../../../../shared/src/dateiumwandlung';
import { gebietsschema } from '../../../../shared/src/sprache';
import { t } from '../../sprache';
import { archivfassungUrl, dokumentUrl, fassungUrl } from '../../api/dokumente';

/** „Verkleinern“ (#393) erst ab dieser Größe anbieten – kleinere PDFs lohnen die Mühe kaum. */
export const VERKLEINERN_AB = 500 * 1024;

export const HINWEIS_MEHRFACH = 'dms:mehrere-herunterladen-gesehen';

/** Eine Datei, die erst beim Speichern der Mappe hochgeladen wird. */
/** gleicherName (#194): was mit einem Dokument gleichen Namens im Register passiert. */
export interface NeueDatei {
  uid: string;
  datei: File;
  register: string;
  gleicherName?: 'zaehler' | 'version' | 'ersetzen';
}

export const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
export const groesse = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/** Reihenfolgen der Dokumente (#86); gemerkt je Benutzer für alle Dokumentenregister. */
export const DOKUMENT_SORTIERUNGEN = {
  name: t('ablage.dokumente.name-a-z'),
  name_ab: t('ablage.dokumente.name-z-a'),
  neu: t('ablage.dokumente.neueste-zuerst'),
  alt: t('ablage.dokumente.aelteste-zuerst'),
  gross: t('ablage.dokumente.groesste-zuerst'),
} as const;
export type Dokumentsortierung = keyof typeof DOKUMENT_SORTIERUNGEN;
const natuerlich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** Sortierte Kopie; bei Gleichstand nach Name, dann nach Id (stabil). */
export function sortiereDokumente(liste: Dokument[], s: Dokumentsortierung): Dokument[] {
  const name = (a: Dokument, b: Dokument) => natuerlich.compare(a.name, b.name) || a.id.localeCompare(b.id);
  const vergleich: Record<Dokumentsortierung, (a: Dokument, b: Dokument) => number> = {
    name,
    name_ab: (a, b) => -name(a, b),
    neu: (a, b) => b.erstellt.localeCompare(a.erstellt) || name(a, b),
    alt: (a, b) => a.erstellt.localeCompare(b.erstellt) || name(a, b),
    gross: (a, b) => b.groesse - a.groesse || name(a, b),
  };
  return [...liste].sort(vergleich[s]);
}

/** Art der Datei in Worten (#1211): „PDF“, „Bild“, „E-Mail“ – statt des Medientyps. */
export function artVon(x: Pick<Dokument, 'mime' | 'name'>): string {
  if (x.mime === 'application/pdf') return t('ablage.dokumente.art.pdf');
  if (x.mime.startsWith('image/')) return t('ablage.dokumente.art.bild');
  if (x.mime === 'message/rfc822' || /\.eml$/i.test(x.name)) return t('ablage.dokumente.art.email');
  return t('ablage.dokumente.art.datei');
}

/** Woher das Dokument kommt (#1211): „über einen Eingang gekommen“ statt „Eingangskanal“, nie „unbekannt“. */
export const herkunftVon = (h: Herkunft | null | undefined) =>
  h === 'eingang' ? t('ablage.dokumente.herkunft.eingang') : (HERKUNFT[h ?? 'hochgeladen'] ?? h ?? HERKUNFT.hochgeladen);

/**
 * Was die Anzeige zeigt (#631): die Archivfassung (PDF/A), wenn es eine zur aktuellen Datei gibt – sonst die Lesefassung
 * (#577) für Dateitypen, die der Browser nicht zeigt – sonst das Original. Mit `original` immer das Original. null:
 * nichts anzuzeigen.
 */
export function ansichtVon(x: Dokument, original: boolean): { art: Ansichtsart; url: string; pdf: boolean } | null {
  if (!original && x.archivfassung?.stand === 'fertig') return { art: 'archiv', url: archivfassungUrl(x.id), pdf: true };
  // Geschütztes PDF (#827): Der Server zeigt die entsperrte Fassung; ohne sie gibt es nichts anzuzeigen.
  if (x.pdfSchutz?.art === 'passwort') return x.pdfSchutz.entsperrt ? { art: 'entsperrt', url: dokumentUrl(x.id), pdf: true } : null;
  if (!x.anzeigbar && x.ocr?.stand === 'fertig' && fassungAusInfo(x.ocr.info))
    return { art: 'lesefassung', url: fassungUrl(x.id), pdf: true };
  if (!x.anzeigbar) return null;
  return { art: 'original', url: dokumentUrl(x.id), pdf: x.mime === 'application/pdf' };
}

type Ansichtsart = 'archiv' | 'lesefassung' | 'entsperrt' | 'original';
/** Was eine Zeile anzeigt (#631), wie `ansichtVon` es liefert. */
export type Sicht = ReturnType<typeof ansichtVon>;

/** „Deutsch, enthält auch Französisch“ (#579); einsprachig nur der Name. */
export function sprachenAnzeige(sprache: string, weitere?: string[] | null) {
  const w = (weitere ?? []).filter((k) => k !== sprache).map(sprachname);
  if (!w.length) return sprachname(sprache);
  return t('volltext.sprachen.auch', {
    sprache: sprachname(sprache),
    weitere: new Intl.ListFormat('de', { type: 'conjunction' }).format(w),
  });
}

/** „Rechnung.pdf“ → „Rechnung (2).pdf“ (wie der Server bei gleichem Namen). */
export function mitZaehler(name: string) {
  const p = name.lastIndexOf('.');
  return p > 0 ? `${name.slice(0, p)} (2)${name.slice(p)}` : `${name} (2)`;
}
