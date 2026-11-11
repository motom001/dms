/**
 * Geschützte PDFs (#827, #1075 aus dienst.ts): Entsperren anbinden, mit Passwort entsperren, danach Vorschaubild,
 * Volltext, Archivfassung und Historie, Schutz je Dokument. Schicht 2.
 */
import type { FassungInfo } from '../../../shared/src/dateiumwandlung';
import { createHash } from 'node:crypto';
import type { Dokument, Mappentyp } from '../../../shared/src/model';
import type { EntsperrenAnbindung, PdfEntsperren } from '../entsperren';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { DokumentArchivfassung } from './archivfassung';
import type { TexterkennungAnbindung } from './dokumente.dienst';
import type { DokumentUmwandlung } from './umwandeln';

/** Wert eines Mehrfachverweises als Liste (wie in dienst.ts). */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Die Teile dieses Ordners, die die geschützten PDFs rufen. */
export interface GeschuetztePdfsTeile { umwandlung: DokumentUmwandlung; archiv: DokumentArchivfassung }

/** Was die geschützten PDFs außer dem Kern brauchen – vom Dienst hereingereicht. */
export interface GeschuetztePdfsAnschluss {
  /** Texterkennung (#45), angebunden an den Dokumenten. */
  ocr(): TexterkennungAnbindung | undefined;
  /** Alle Mappentypen (Mappentypen, über den Dienst). */
  listeTypen(): Promise<Mappentyp[]>;
}

export class GeschuetztePdfs {
  constructor(private readonly kern: Kern, private readonly teile: GeschuetztePdfsTeile, private readonly anschluss: GeschuetztePdfsAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get ocr() { return this.anschluss.ocr(); }
  private get vorschauFassung() { return this.teile.umwandlung.vorschauFassung; }
  private listeTypen() { return this.anschluss.listeTypen(); }
  private archivNachVolltext(id: string, neu?: boolean) { return this.teile.archiv.archivNachVolltext(id, neu); }
  private notiere(...a: Parameters<Kern['historie']['schreibe']>) { return this.kern.historie.schreibe(...a); }

  /* ---------- Geschützte PDFs (#827) ---------- */

  entsperren?: PdfEntsperren;
  verbindeEntsperren(e: PdfEntsperren) { this.entsperren = e; }
  get pdfEntsperren() { return this.entsperren; }

  /** Inhalt der entsperrten Fassung zum Inhalt einer Datei (Stempel, Verkleinern, #827); null ohne. */
  entsperrtZu = async (inhalt: Buffer): Promise<Buffer | null> => {
    if (!this.entsperren || inhalt.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
    return (await this.entsperren.fassung(createHash('sha256').update(inhalt).digest('hex')))?.inhalt ?? null;
  };

  /** Was PdfEntsperren vom Dienst braucht (#827) – für index.ts und Tests. */
  entsperrenAnbindung(o: Omit<EntsperrenAnbindung, 'datei' | 'dokumenteMitSha' | 'nachEntsperren'>): EntsperrenAnbindung {
    return { ...o, datei: (sha) => this.kern.liesGanz(sha), dokumenteMitSha: (sha) => this.repo.dokumenteMitSha(sha), nachEntsperren: (docs, info) => this.nachEntsperren(docs, info) };
  }

  /**
   * Wem gehört die Post (#827)? Das Konto aus „An“ einer Post-Mappe (#1042, bis dahin „Für“); bei Post für alle und anderen Mappen null –
   * dann probiert Ablago keine gemerkten Passwörter.
   */
  async besitzerDerPost(mappeId: string): Promise<string | null> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) return null;
    const typ = (await this.listeTypen()).find((x) => x.id === m.typId);
    if (typ?.system !== 'post') return null;
    return alsListe(m.werte.an)[0] ?? null;
  }

  /**
   * Eine entsperrte Fassung ist da (#827): Vorschaubild daraus, Volltext neu (wo er am Schutz scheiterte), Archivfassung
   * (wo der Volltext schon steht) und – wenn eine Person entsperrt hat – ein Eintrag in der Historie.
   */
  private async nachEntsperren(docs: Dokument[], info: FassungInfo) {
    this.vorschauFassung?.ausFassung(docs);
    const neu = docs.filter((d) => d.ocr && (d.ocr.stand === 'ausgelassen' || d.ocr.stand === 'fehler')).map((d) => d.id);
    if (neu.length) { await this.repo.ocrEinreihen(neu); this.ocr?.anstossen(); }
    for (const d of docs) if (d.ocr?.stand === 'fertig') void this.archivNachVolltext(d.id);
    const e = info.entsperrt;
    if (!e || e.art === 'rechte') return;
    for (const d of docs) {
      const text = e.art === 'gemerkt' ? t('mappen.entsperren.historie.gemerkt', { name: e.name ?? '' }) : t('mappen.entsperren.historie.passwort');
      await this.notiere(d.mappeId, e.von, 'entsperrt', { dokument: d.name, text })
        .catch((f: Error) => protokoll.modul('dokumente').warn('Historie zum Entsperren nicht geschrieben', { dokument: d.id, fehler: f.message }));
    }
  }

  /** Geschütztes PDF mit Passwort entsperren (POST /dokumente/{id}/entsperren); Lesen prüft die Route. */
  async entsperreDokument(id: string, konto: string, e: { passwort?: unknown; merken?: unknown; name?: unknown }, merkenErlaubt: boolean) {
    if (!this.entsperren) throw new Fachfehler(404, t('mappen.entsperren.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (e.merken === true && !merkenErlaubt) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.nur-browser'));
    const r = await this.entsperren.mitPasswort(d, konto, e.passwort, e.merken === true ? { name: e.name } : null);
    return { dokument: d.id, ...r };
  }

  /** Schutz je Dokument (#827), nur bei geschützten PDFs. */
  async mitPdfSchutz(docs: Dokument[]): Promise<Dokument[]> {
    if (!this.entsperren || !docs.length) return docs;
    return Promise.all(docs.map(async (d) => {
      const s = await this.entsperren!.stand(d).catch(() => null);
      return s ? { ...d, pdfSchutz: s } : d;
    }));
  }
}
