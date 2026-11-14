/** Schnittstelle (#1234): Dokumente: Inhalt, Versionen, Vorschau und Seitenbilder, Post, Fotostapel, Stempel, Verkleinern, Archivfassung. */
import type { StempelVorlage, StempelWunsch } from '../../../shared/src/stempel';
import type { Stufe as KleinStufe } from '../../../shared/src/verkleinern';
import type { Bereich, SchwaerzSeite } from '../../../shared/src/schwaerzen';
import type { Archiv } from '../../../shared/src/archiv';
import type { PdfSchutz } from '../../../shared/src/entsperren';
import type { Leerseiten } from '../../../shared/src/leerseiten';
import type { Dokument, DokumentVersion, Mappe } from '../../../shared/src/model';
import type { Auftrag } from '../../../shared/src/auftrag';
import type { LoeschAnlass } from '../../../shared/src/loeschprotokoll';
import type { WortSeite } from '../../../shared/src/archivfassung';
import { anfrage, sendeDatei, speichereDatei } from './anfrage';
import { anlassQuery } from './mappen';

/** Ein Dokument und seine Anlagen (#998, GET/POST/PUT/DELETE …/anlagen). */
export interface AnlagenStand { dokument: Dokument; anlagen: Dokument[] }
/** Vorschaubild der ersten Seite (#332); der Prüfwert in der Adresse sorgt für ein neues Bild nach einer neuen Version. */
export interface SchwaerzenVorschau {
  id: string; name: string; mime: string; sha256: string; seiten: SchwaerzSeite[];
  quelle: 'textebene' | 'gemischt' | 'keine'; versioniert: boolean; kopieName: string;
}
export const schwaerzBildUrl = (d: { id: string; sha256: string }, nr: number, archiv = false) => `/api/dokumente/${d.id}/schwaerzen/seiten/${nr}?v=${d.sha256.slice(0, 12)}${archiv ? '&fassung=archiv' : ''}`;
export interface VerkleinernVorschau {
  id: string; name: string; groesse: number; seiten: number; bilder: number; hoechsteDpi: number | null; versioniert: boolean; papierkorb: boolean; mindestens: number;
  stufen: Record<KleinStufe, { dpi: number; geschaetzt: number; lohnt: boolean; bilder: number }>;
}
export interface GrossePdfs {
  stufe: KleinStufe; ab: number; geschaetzteErsparnis: number; mehr: boolean;
  eintraege: Array<{ id: string; name: string; groesse: number; mappeId: string; mappeTitel: string; typId: string | null; version: number; geschaetzt: number | null; lohnt: boolean | null; fehler: string | null }>;
}
export interface VerkleinernEinstellung { automatisch: boolean; abMb: number; stufe: KleinStufe }
export interface PdfSeiten { id: string; name: string; version: number; sha256: string; anzahl: number; drehungen: number[]; bilderBis: number }
/** Bild einer Seite (#335); die Adresse trägt den Prüfwert, ein neues PDF hat neue Bilder. */
export const seitenbildUrl = (d: { id: string; sha256: string }, nr: number) => `/api/dokumente/${d.id}/seiten/${nr}/bild?v=${d.sha256.slice(0, 12)}`;
/** Umgewandelte Fassung eines Dokuments (#577): PDF, PNG oder JPEG aus einem Paket. */
export const fassungUrl = (id: string) => `/api/dokumente/${id}/fassung`;
/** Archivfassung (PDF/A) eines Dokuments (#631) – zur aktuellen Datei; 404 ohne. */
export const archivfassungUrl = (id: string, herunterladen = false) => `/api/dokumente/${id}/archivfassung${herunterladen ? '?herunterladen=1' : ''}`;
export const vorschauUrl = (d: { id: string; sha256: string }, versuch = 0) => `/api/dokumente/${d.id}/vorschau?v=${d.sha256.slice(0, 12)}${versuch ? `&n=${versuch}` : ''}`;
/** Wo eine gleiche Datei schon liegt (#333) – nur lesbare Mappen. */
export interface Fundstelle { mappeId: string; typId: string; titel: string; typ: string; register: string; name: string; erstellt: string }
export const dokumentUrl = (id: string, herunterladen = false) => `/api/dokumente/${id}/inhalt${herunterladen ? '?herunterladen=1' : ''}`;
export const versionUrl = (id: string, nummer: number, herunterladen = false) => `/api/dokumente/${id}/versionen/${nummer}/inhalt${herunterladen ? '?herunterladen=1' : ''}`;

/** Fassung und Umfang beim Herunterladen mit Stempel (#1234: ein Objekt statt fünf Parametern). */
export interface HerunterladenWahl { version?: number; verkleinern?: KleinStufe | null; fassung?: 'archiv' | 'original'; mitAnlagen?: boolean; originalEmail?: boolean }

export const dokumenteApi = {
  /** Geschütztes PDF entsperren (#827); mit `merken` zusätzlich im eigenen Konto. */
  dokumentEntsperren: (id: string, passwort: string, merken?: { name: string }) => anfrage<{ dokument: string; pdfSchutz: PdfSchutz | null; gemerkt: boolean; hinweis?: string }>('POST', `/api/dokumente/${id}/entsperren`, { passwort, ...(merken ? { merken: true, name: merken.name } : {}) }),
  /* Volltext und Texterkennung (#45) */
  volltext: (id: string) => anfrage<{ id: string; name: string; text: string | null }>('GET', `/api/dokumente/${id}/volltext`),
  texterkennungErneut: (id: string) => anfrage<Dokument>('POST', `/api/dokumente/${id}/texterkennung`),
  /** Post (#192): anlegen (Dokumente danach mit ladeHoch) und einer Mappe zuordnen. */
  postAnlegen: (e: { betreff?: string; an?: string | null }) => anfrage<Mappe>('POST', '/api/post', e),
  wortpositionen: (id: string) => anfrage<{ quelle: 'original' | 'lesefassung'; mime: string; vollstaendig: boolean; seiten: WortSeite[] }>('GET', `/api/dokumente/${id}/wortpositionen`),
  /** Mehrere Mappen per E-Mail (#151). */
  /* Stempel beim Weitergeben (#394) */
  stempelVorlagen: () => anfrage<StempelVorlage[]>('GET', '/api/stempel/vorlagen'),
  herunterladenMitStempel: (id: string, stempel: StempelWunsch | null, name: string, { version, verkleinern, fassung, mitAnlagen, originalEmail = true }: HerunterladenWahl = {}) => speichereDatei(`/api/dokumente/${id}/herunterladen`, { stempel, version, verkleinern, fassung, ...(mitAnlagen ? { mitAnlagen } : {}), ...(mitAnlagen && !originalEmail ? { originalEmail } : {}) }, name),
  dokumentLoeschen: (id: string, anlass?: LoeschAnlass) => anfrage<null>('DELETE', `/api/dokumente/${id}${anlassQuery(anlass)}`),
  /* Archivmodus (#212) */
  archivVorschau: (typId: string, archiv: Archiv) => anfrage<{ mappen: number; darfWeg: number; /** Mappen mit leerem Stichtag (#1051). */ stichtagLeer: number }>('POST', '/api/werkbank/archiv/vorschau', { typId, archiv }),
  /* Versionierung (#194) */
  versionen: (id: string) => anfrage<{ aktuell: Dokument; aeltere: DokumentVersion[] }>('GET', `/api/dokumente/${id}/versionen`),
  zurueckholen: (id: string, nummer: number) => anfrage<Dokument>('POST', `/api/dokumente/${id}/versionen/${nummer}/zurueckholen`),
  async ersetzen(id: string, datei: File): Promise<Dokument> {
    return sendeDatei(`/api/dokumente/${id}/ersetzen?${new URLSearchParams({ name: datei.name, typ: datei.type || 'application/octet-stream' })}`, datei) as Promise<Dokument>;
  },
  /** PDF bearbeiten (#335). */
  pdfSeiten: (id: string) => anfrage<PdfSeiten>('GET', `/api/dokumente/${id}/seiten`),
  bearbeitePdf: (id: string, e: { seiten: Array<{ nr: number; drehung?: number }>; teile?: number[]; bestaetigt?: boolean }) =>
    anfrage<{ dokumente: Dokument[]; posten: Mappe[] }>('POST', `/api/dokumente/${id}/seiten`, e),
  /** Schwärzen (#392). */
  schwaerzenVorschau: (id: string) => anfrage<SchwaerzenVorschau>('GET', `/api/dokumente/${id}/schwaerzen`),
  schwaerzen: (id: string, e: { bereiche: Bereich[]; begriffe: string[]; ziel: 'kopie' | 'version' }) =>
    anfrage<{ dokument: Dokument; ziel: 'kopie' | 'version'; stellen: number; seiten: number; begriffe: Array<{ gefunden: number }>; meldung: string }>('POST', `/api/dokumente/${id}/schwaerzen`, e),
  /** PDF verkleinern (#393). */
  verkleinernVorschau: (id: string) => anfrage<VerkleinernVorschau>('GET', `/api/dokumente/${id}/verkleinern`),
  verkleinern: (id: string, e: { stufe: KleinStufe; bestaetigt?: boolean }) =>
    anfrage<{ dokument: Dokument; unveraendert: boolean; vorher: number; nachher: number; stufe: KleinStufe; meldung: string }>('POST', `/api/dokumente/${id}/verkleinern`, e),
  grosseDokumente: (ab: number, stufe: KleinStufe) => anfrage<GrossePdfs>('GET', `/api/werkbank/verkleinern?${new URLSearchParams({ ab: String(ab), stufe })}`),
  verkleinereViele: (e: { ids: string[]; stufe: KleinStufe; ohneOriginal: boolean; bestaetigt: boolean }) => anfrage<Auftrag>('POST', '/api/werkbank/verkleinern', e),
  verkleinernEinstellung: () => anfrage<VerkleinernEinstellung>('GET', '/api/werkbank/verkleinern/einstellung'),
  setzeVerkleinernEinstellung: (e: VerkleinernEinstellung) => anfrage<VerkleinernEinstellung>('PUT', '/api/werkbank/verkleinern/einstellung', e),
  fuegePdfZusammen: (e: { dokumente: string[]; name?: string; ziel?: string; register?: string; originaleEntfernen?: boolean; bestaetigt?: boolean }) =>
    anfrage<{ dokument: Dokument; erledigtePost: string[] }>('POST', '/api/dokumente/zusammenfuegen', e),
  setzeArchivnummer: (id: string, archivnummer: string) => anfrage<Dokument>('PUT', `/api/dokumente/${id}/archivnummer`, { archivnummer }),
  /** Hinweis „Post teilen?“ wegklicken (#579). */
  // Anlagen (#998): lesen, „Als Anlage an … hängen“, umsortieren, umbenennen, „Zum eigenen Dokument machen“.
  anlagen: (id: string) => anfrage<AnlagenStand>('GET', `/api/dokumente/${id}/anlagen`),
  anlageAnhaengen: (haupt: string, dokument: string, name?: string) => anfrage<AnlagenStand>('POST', `/api/dokumente/${haupt}/anlagen`, { dokument, ...(name ? { name } : {}) }),
  anlagenSortieren: (haupt: string, reihenfolge: string[]) => anfrage<AnlagenStand>('PUT', `/api/dokumente/${haupt}/anlagen`, { reihenfolge }),
  anlageUmbenennen: (haupt: string, anlage: string, name: string) => anfrage<AnlagenStand>('PUT', `/api/dokumente/${haupt}/anlagen/${anlage}`, { name }),
  anlageLoesen: (haupt: string, anlage: string) => anfrage<AnlagenStand>('DELETE', `/api/dokumente/${haupt}/anlagen/${anlage}`),
  /** Herunterladen „mit Anlagen“ (#998): das Dokument und seine Anlagen als ZIP. */
  herunterladenMitAnlagen: (id: string, name: string, fassung?: 'archiv' | 'original', originalEmail = true) => speichereDatei(`/api/dokumente/${id}/herunterladen`, { mitAnlagen: true, ...(fassung ? { fassung } : {}), ...(originalEmail ? {} : { originalEmail }) }, name),
  teilenHinweisAus: (id: string) => anfrage<{ id: string; teilenAb: number | null }>('DELETE', `/api/dokumente/${id}/teilen-hinweis`),
  /** Leerseiten (#997): je Seite „Doch behalten“ (weglassen false) bzw. „Auch weglassen“ (true) – gelöscht wird erst beim Übernehmen. */
  leerseiteWaehlen: (id: string, nr: number, weglassen: boolean) => anfrage<{ dokument: string; sha256: string; seiten: number; leerseiten: Leerseiten | null; wegfallend: number[] }>('PUT', `/api/dokumente/${id}/leerseiten/${nr}`, { weglassen }),
  /** gleicherName (#194): zaehler (Standard), version oder ersetzen. */
  /** Doppelte Dateien (#333): Prüfwerte → Fundstellen in Mappen, die man lesen darf. */
  gleicheDateien: (pruefwerte: string[], ohneMappe?: string) => anfrage<{ fundstellen: Record<string, Fundstelle[]> }>('POST', '/api/dokumente/gleiche', { pruefwerte, ...(ohneMappe ? { ohneMappe } : {}) }),
  /** Post fotografieren (#490): ein Foto in den Stapel; „Fertig“ macht aus den Fotos ein PDF. */
  async fotoAblegen(foto: Blob): Promise<{ id: string }> { return sendeDatei('/api/fotostapel', foto) as Promise<{ id: string }>; },
  postAusFotos: (e: { stapel: string[]; betreff?: string }) => anfrage<{ post: Mappe; dokument: Dokument; seiten: number }>('POST', '/api/post/fotos', e),
  postZusammenlegen: (zielId: string, quelle: string) => anfrage<{ post: Mappe; dokument: Dokument; seiten: number }>('POST', `/api/post/${zielId}/zusammenlegen`, { quelle }),
};
