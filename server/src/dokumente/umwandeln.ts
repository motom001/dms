/**
 * Dateien umwandeln (#577, #1075 aus dienst.ts): Paket zum Umwandeln anbinden, nach einer neuen Fassung Vorschaubild,
 * Volltext, Ereignis und Historie, Bestand an ein neues Paket melden, Fassung und Vorschaubild eines Pakets
 * übernehmen, Stand für die Werkbank. Schicht 2.
 */
import { dateitypName, type FassungInfo, INFO_UMWANDLUNG, infoUmwandlung, katalogUmwandlung, kernTyp, UMWANDELN_MAX_BYTES } from '../../../shared/src/dateiumwandlung';
import type { Dokument } from '../../../shared/src/model';
import { katalogVolltext } from '../../../shared/src/paketvolltext';
import type { Dateiumwandlung, FassungsAblage, UmwandlungsAnbindung } from '../dateiumwandlung';
import type { PdfEntsperren } from '../entsperren';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import type { PaketVolltext } from '../paketvolltext';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { TexterkennungAnbindung } from './dokumente.dienst';

/** Was das Umwandeln außer dem Kern braucht – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface UmwandelnAnschluss {
  /** Texterkennung (#45), angebunden an den Dokumenten. */
  ocr(): TexterkennungAnbindung | undefined;
  /** Geschützte PDFs (#827): `fassungVon` zeigt die entsperrte Fassung. */
  entsperren(): PdfEntsperren | undefined;
  /** Volltext aus Paketen (#614; Volltext, noch im Dienst). */
  paketVolltext(): PaketVolltext;
  /** Ereignis an genau ein Paket (Ereignisse, noch im Dienst). */
  auftrag(paket: string, art: 'datei.umwandeln', daten: Record<string, unknown>): Promise<'gesperrt' | void>;
  /** Ereignis auslösen – über den Anschluss (`kern.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
}

export class DokumentUmwandlung {
  constructor(private readonly kern: Kern, private readonly anschluss: UmwandelnAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get ocr() { return this.anschluss.ocr(); }
  private get entsperren() { return this.anschluss.entsperren(); }
  private get paketVolltext() { return this.anschluss.paketVolltext(); }
  private get paketKonten() { return this.kern.paketKonten; }
  private auftrag(...a: Parameters<UmwandelnAnschluss['auftrag']>) { return this.anschluss.auftrag(...a); }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private typVon(mappeId: string) { return this.kern.typVon(mappeId); }
  private notiere(...a: Parameters<Kern['historie']['schreibe']>) { return this.kern.historie.schreibe(...a); }

  /* ---------- Dateien umwandeln (#577) ---------- */

  /** Dateien umwandeln anbinden (#577, dateiumwandlung.ts). */
  umwandlung?: Dateiumwandlung;
  vorschauFassung?: { ausFassung(d: Dokument[]): unknown; setze(sha: string, bild: Buffer, mime: string): Promise<void> };
  verbindeUmwandlung(u: Dateiumwandlung, vorschau?: { ausFassung(d: Dokument[]): unknown; setze(sha: string, bild: Buffer, mime: string): Promise<void> }) {
    this.umwandlung = u;
    this.vorschauFassung = vorschau;
  }
  get dateiumwandlung() { return this.umwandlung; }

  /** Was Dateiumwandlung vom Dienst braucht (#577) – für index.ts und Tests. */
  umwandlungAnbindung(ablage: FassungsAblage, vorschau?: { setze(sha: string, bild: Buffer, mime: string): Promise<void> }): UmwandlungsAnbindung {
    return {
      ablage,
      pakete: () => this.repo.listePakete(),
      melde: (paket, daten) => this.auftrag(paket, 'datei.umwandeln', daten),
      dokumenteMitSha: (sha) => this.repo.dokumenteMitSha(sha),
      nachFassung: (docs, info) => this.nachFassung(docs, info),
      ...(vorschau ? { vorschaubild: (sha: string, bild: Buffer, mime: string) => vorschau.setze(sha, bild, mime) } : {}),
    };
  }

  /**
   * Eine neue Fassung ist da (#577): Vorschaubild daraus, Volltext neu (für Dokumente, die darauf warteten oder bisher
   * ohne Text ausgelassen waren) und ein Eintrag in der Historie jeder betroffenen Mappe.
   */
  async nachFassung(docs: Dokument[], info: FassungInfo) {
    this.vorschauFassung?.ausFassung(docs);
    // Liefert ein Paket mit dms:volltext den Text (#614), bleibt es dabei: Die Fassung gibt nur das Vorschaubild.
    const vp = await this.paketVolltext.pakete().catch(() => []);
    const neu = docs.filter((d) => !vp.some((p) => p.typen.includes(d.mime.toLowerCase())) && d.ocr && (d.ocr.stand === 'ausgelassen' || d.ocr.stand === 'fehler' || (d.ocr.stand === 'paket' && (d.ocr.info ?? '').startsWith(INFO_UMWANDLUNG)))).map((d) => d.id);
    if (neu.length) { await this.repo.ocrEinreihen(neu); this.ocr?.anstossen(); }
    const konto = [...this.paketKonten.entries()].find(([, p]) => p === info.paket.id)?.[0] ?? null;
    for (const d of docs) {
      await this.ereignis('datei.umgewandelt', { dokument: d.id, mappe: d.mappeId, typ: await this.typVon(d.mappeId), paket: info.paket.id }, konto);
      await this.notiere(d.mappeId, konto, 'umgewandelt', { dokument: d.name, text: `${dateitypName(d.mime)} → ${dateitypName(info.mime)} (${info.paket.name} ${info.paket.version})`, fassung: info.mime, groesse: info.groesse, paket: `${info.paket.name} ${info.paket.version}` })
        .catch((e: Error) => protokoll.modul('umwandlung').warn('Historie zur Fassung nicht geschrieben', { dokument: d.id, fehler: e.message }));
    }
  }

  /**
   * Ein Paket zum Umwandeln ist neu installiert (oder kann neue Dateitypen): Alle Dokumente dieser Typen ohne Fassung
   * gehen an das Paket; wer auf ein Paket wartete (ausgelassen, „mit dem Paket …“), bekommt so Vorschau und Volltext.
   */
  async umwandelPaketDa(typen: string[]): Promise<number> {
    if (!this.umwandlung || !typen.length) return 0;
    const docs = await this.repo.dokumenteMitTyp(typen);
    const n = await this.umwandlung.anfordern(docs);
    // Was bisher ohne Paket ausgelassen war, wartet jetzt sichtbar auf die Fassung.
    for (const d of docs) {
      if (d.ocr?.stand !== 'ausgelassen' || (await this.umwandlung.info(d.sha256))) continue;
      const p = await this.umwandlung.paketFuer(d.mime);
      if (p && d.groesse <= UMWANDELN_MAX_BYTES) await this.repo.ocrSetze(d.id, { stand: 'paket', info: infoUmwandlung(p), seiten: d.ocr.seiten ?? null });
    }
    protokoll.modul('umwandlung').info('Paket zum Umwandeln installiert – vorhandene Dateien gemeldet', { typen, dateien: n });
    return n;
  }

  /** Fassung eines Pakets übernehmen (#577, PUT /dokumente/{id}/fassung); Lesen des Dokuments prüft die Route. */
  async setzeFassung(z: Zugriff | undefined, id: string, sha: unknown, inhalt: unknown) {
    if (!this.umwandlung) throw new Fachfehler(404, t('pakete.vorschaubild.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const f = await this.umwandlung.setzeFassung(z?.paket, d, sha, inhalt);
    return { dokument: d.id, fassung: f };
  }

  /** Vorschaubild eines Pakets übernehmen (#577, PUT /dokumente/{id}/vorschaubild). */
  async setzeVorschaubild(z: Zugriff | undefined, id: string, sha: unknown, inhalt: unknown) {
    if (!this.umwandlung) throw new Fachfehler(404, t('pakete.vorschaubild.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return this.umwandlung.setzeVorschaubild(z?.paket, d, sha, inhalt);
  }

  /** Die umgewandelte Fassung eines Dokuments (#577) zum Ansehen; 404, wenn es keine gibt. */
  async fassungVon(id: string): Promise<{ d: Dokument; info: FassungInfo; inhalt: Buffer }> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    // Geschützte PDFs (#827): die entsperrte Fassung.
    const f = kernTyp(d.mime) ? (d.mime === 'application/pdf' ? await this.entsperren?.fassung(d.sha256) : null) : await this.umwandlung?.lies(d.sha256);
    if (!f) throw new Fachfehler(404, t('pakete.fassung.keine'));
    return { d, ...f };
  }

  /**
   * Für die Werkbank (#577): Pakete zum Umwandeln und je Dateityp, den der Kern nicht selbst liest, wie viele
   * Dokumente es gibt, welches Paket zuständig ist – oder welches aus dem Katalog es wäre.
   */
  async umwandlungStand() {
    const pakete = this.umwandlung ? await this.umwandlung.pakete() : [];
    const volltextPakete = await this.paketVolltext.pakete();
    const typen = await this.repo.dokumentTypen();
    const liste = await Promise.all(Object.entries(typen).filter(([m]) => !kernTyp(m) && (m !== 'application/octet-stream' || volltextPakete.some((p) => p.typen.includes(m)))).map(async ([mime, anzahl]) => {
      const p = this.umwandlung ? await this.umwandlung.paketFuer(mime, pakete) : null;
      const k = katalogUmwandlung(mime);
      // Volltext aus Paketen (#614): zuständiges Paket bzw. das aus dem Katalog.
      const v = await this.paketVolltext.paketFuer(mime, volltextPakete);
      const kv = katalogVolltext(mime);
      return { mime, name: dateitypName(mime), anzahl, paket: p ? { id: p.id, name: p.name } : null, katalog: k ? { id: k.id, name: k.name } : null,
        volltext: v ? { id: v.id, name: v.name } : null, volltextKatalog: kv ? { id: kv.id, name: kv.name } : null };
    }));
    return { pakete, volltextPakete, typen: liste.sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name)) };
  }

  /** Nach dem Ereignis „Datei umwandeln“ (#577): Wartet ein Dokument noch, aber es gibt keine Fassung, steht der Grund daran. */
  async nachUmwandlungsEreignis(paket: string, e: { daten: Record<string, unknown> }, r: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }) {
    const sha = typeof e.daten.sha256 === 'string' ? e.daten.sha256 : '';
    if (!this.umwandlung || !sha) return;
    if (!r.ok && !r.aufgegeben) return;
    this.umwandlung.erledigt(sha);
    if (await this.umwandlung.info(sha)) return;
    const p = (await this.repo.listePakete()).find((x) => x.id === paket);
    const grund = (r.ok ? r.text : r.fehler ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
    for (const d of await this.repo.dokumenteMitSha(sha)) {
      if (d.ocr?.stand !== 'paket' || !(d.ocr.info ?? '').startsWith(INFO_UMWANDLUNG)) continue;
      const info = r.ok ? t('meldungen.dienst.umwandlung-durch-paket', { wert: p?.name ?? paket, wert2: grund || t('meldungen.dienst.keine-fassung-geliefert') }) : t('meldungen.dienst.umwandlung-durch-paket-2', { wert: p?.name ?? paket, wert2: grund ? `: ${grund}` : '' });
      await this.repo.ocrSetze(d.id, { stand: r.ok ? 'ausgelassen' : 'fehler', info: info.slice(0, 500), text: null });
    }
  }
}
