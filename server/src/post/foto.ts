/**
 * Post fotografieren (#490, #1077 aus dienst.ts): Fotos als neue Post, Fotos als Seiten an eine Mappe, zwei Posts
 * zusammenlegen. Schicht 3 – bekommt den Kern, die Rechteprüfung, Mappen, Dokumente, PDF bearbeiten und die übrigen
 * Teile dieses Ordners; das Löschen einer Mappe kommt über den Anschluss (noch im Dienst).
 */
import { dateiname, type DokumenteDienst, type DokumentVersionen } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Anlass, Kern, Zugriff } from '../kern';
import type { MappenArchiv, MappenHistorie, MappenTitel } from '../mappen';
import type { PdfBearbeiten } from '../pdf-bearbeiten/pdf-bearbeiten.dienst';
import { bilderZuPdf, fuegeZusammen, seitenInfo } from '../pdfseiten';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { auswahlText, type Dokument, fotoBetreff, istVersendet, type Mappe, MAX_DATEIGROESSE, POST_KANAL } from '../../../shared/src/model';
import type { Eingangskanaele } from './eingangskanaele';
import type { PostDienst } from './post.dienst';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
/** Die Teile, die die Fotos rufen: Rechteprüfung, Mappen, Dokumente, PDF bearbeiten, Post und Eingangskanäle. */
export interface FotoTeile {
  rechte: ZugriffDienst; historie: MappenHistorie; titel: MappenTitel; archiv: MappenArchiv; dokumente: DokumenteDienst;
  versionen: DokumentVersionen; pdf: PdfBearbeiten; post: PostDienst; eingang: Eingangskanaele;
}

/** Was die Fotos außer dem Kern brauchen – vom Dienst hereingereicht. */
export interface FotoAnschluss {
  /** Mappe löschen (Papierkorb, Löschprotokoll; noch im Dienst). */
  loescheMappe(id: string, benutzerId?: string | null, z?: Zugriff, anlass?: Anlass): Promise<void>;
}

export class PostFotos {
  constructor(private readonly kern: Kern, private readonly teile: FotoTeile, private readonly anschluss: FotoAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.teile.rechte.pruefeRecht(...a); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private titel(m: Mappe) { return this.teile.titel.titel(m); }
  private pruefeArchivDokument(mappeId: string, was: string) { return this.teile.archiv.pruefeArchivDokument(mappeId, was); }
  private ladeHoch(...a: Parameters<DokumenteDienst['ladeHoch']>) { return this.teile.dokumente.ladeHoch(...a); }
  private loescheDokument(...a: Parameters<DokumenteDienst['loescheDokument']>) { return this.teile.dokumente.loescheDokument(...a); }
  private ersetzeDokument(...a: Parameters<DokumentVersionen['ersetzeDokument']>) { return this.teile.versionen.ersetzeDokument(...a); }
  private registerVon(d: Dokument) { return this.teile.versionen.registerVon(d); }
  private pdfVon(id: string) { return this.teile.pdf.pdfVon(id); }
  private legePostAn(...a: Parameters<PostDienst['legePostAn']>) { return this.teile.post.legePostAn(...a); }
  private postTyp() { return this.teile.eingang.postTyp(); }
  private loescheMappe(...a: Parameters<FotoAnschluss['loescheMappe']>) { return this.anschluss.loescheMappe(...a); }

  /**
   * Fotos als eine Post: Aus den Fotos (in dieser Reihenfolge) wird ein PDF, daraus eine neue Post
   * (Betreff „Post vom …“, wenn keiner angegeben ist). Die Fotos kommen vom Handy einzeln über den
   * Fotostapel; ein mehrseitiger Brief ist so ein PDF und eine Post.
   */
  async postAusFotos(eingabe: unknown, fotos: Buffer[], ich: { id: string | null; name: string }, z?: Zugriff, kanal: string = POST_KANAL.hochgeladen): Promise<{ post: Mappe; dokument: Dokument; seiten: number }> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const pdf = await bilderZuPdf(fotos);
    if (pdf.length > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.als-pdf-waeren-die'));
    const betreff = text(e.betreff).replace(/[\r\n]+/g, ' ').trim().slice(0, 250) || fotoBetreff();
    const post = await this.legePostAn({ betreff, ...(e.fuer ? { fuer: e.fuer } : {}) }, ich, z, kanal);
    const typ = await this.postTyp();
    const register = typ.register.find((r) => r.art === 'dokumente')?.key;
    const dokument = (await this.ladeHoch(post.id, { register, name: `${dateiname(betreff)}.pdf`, typ: 'application/pdf', herkunft: 'hochgeladen' }, pdf, ich.id)).dokument;
    protokoll.modul('ablage').info('Post fotografiert', { mappe: post.id, seiten: fotos.length });
    return { post: (await this.repo.holeMappe(post.id))!, dokument, seiten: fotos.length };
  }

  /**
   * Seiten an ein PDF anhängen (#490, „Seite hinzufügen“; Mechanik aus #335 „zusammenfügen“): neue Version,
   * ohne Versionierung ersetzt das Ergebnis das bisherige (es kommt in den Papierkorb – verloren geht nichts,
   * alle Seiten stecken im neuen PDF). `pdfs`: weitere PDFs, `fotos`: Fotos als Seiten, in dieser Reihenfolge.
   */
  private async haengeSeitenAn(d: Dokument, inhalt: Buffer, anhang: Buffer[], von: string | null, text: string): Promise<{ dokument: Dokument; seiten: number }> {
    const { m, reg } = await this.registerVon(d).then(async (x) => ({ ...x, m: await this.repo.holeMappe(d.mappeId) }));
    if (!m || !reg) throw new Fachfehler(409, t('meldungen.dienst.das-register-dieses-dokuments'));
    await this.pruefeArchivDokument(m.id, 'ersetzen');
    const buf = await fuegeZusammen([inhalt, ...anhang]);
    if (buf.length > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.zusammen-waere-das-pdf'));
    let dokument: Dokument;
    if (reg.versionierung) dokument = await this.ersetzeDokument(d.id, { name: d.name, typ: 'application/pdf', herkunft: 'bearbeitet' }, buf, von);
    else {
      await this.loescheDokument(d.id, von);
      dokument = (await this.ladeHoch(m.id, { register: reg.key, name: d.name, typ: 'application/pdf', herkunft: 'bearbeitet' }, buf, von)).dokument;
    }
    const seiten = (await seitenInfo(buf)).anzahl;
    await this.notiere(m.id, von, 'pdf_bearbeitet', { dokument: d.name, seiten, vorher: (await seitenInfo(inhalt)).anzahl, text });
    return { dokument, seiten };
  }

  /**
   * Fotos als Seiten an eine Mappe (#490): mit `dokument` ans Ende dieses PDFs, sonst als neues PDF
   * „Fotos vom ….pdf“ im ersten Dokumentenregister (bzw. `register`).
   */
  async fotosAnMappe(mappeId: string, eingabe: unknown, fotos: Buffer[], von: string | null, z?: Zugriff): Promise<{ dokument: Dokument; seiten: number }> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const m = z ? await this.pruefeRecht(z, mappeId, 'U') : await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const neu = await bilderZuPdf(fotos);
    if (e.dokument) {
      const { d, inhalt } = await this.pdfVon(text(e.dokument));
      if (d.mappeId !== m.id) throw new Fachfehler(422, t('meldungen.dienst.das-dokument-gehoert-nicht'));
      const n = fotos.length;
      return this.haengeSeitenAn(d, inhalt, [neu], von, t('meldungen.dienst.seiten-an-angehaengt-fotografiert', { anzahl: n, name: d.name }));
    }
    const typ = await this.repo.holeTyp(m.typId);
    const regs = typ?.register.filter((r) => r.art === 'dokumente') ?? [];
    const reg = e.register ? regs.find((r) => r.key === text(e.register)) : regs[0];
    if (!reg) throw new Fachfehler(422, t('meldungen.dienst.die-mappe-hat-kein'));
    const dokument = (await this.ladeHoch(m.id, { register: reg.key, name: `${dateiname(fotoBetreff().replace(/^Post/, 'Fotos'))}.pdf`, typ: 'application/pdf', herkunft: 'hochgeladen' }, neu, von)).dokument;
    return { dokument, seiten: fotos.length };
  }

  /**
   * Zwei Posts zusammenlegen (#490): Die Seiten der zweiten Post (PDFs und Fotos, in ihrer Reihenfolge)
   * kommen ans Ende des ersten PDFs der ersten Post (hat sie keins, entsteht eins), die zweite Post kommt
   * in den Papierkorb. Andere Dateien (z. B. Word) lassen sich nicht anhängen – dann 422.
   */
  async legePostZusammen(zielId: string, eingabe: unknown, von: string | null, z?: Zugriff): Promise<{ post: Mappe; dokument: Dokument; seiten: number }> {
    const quelleId = text((eingabe as Record<string, unknown> | null)?.quelle);
    if (!istUuid(quelleId) || quelleId === zielId) throw new Fachfehler(422, t('meldungen.dienst.bitte-die-post-waehlen'));
    const ziel = z ? await this.pruefeRecht(z, zielId, 'U') : await this.repo.holeMappe(zielId);
    const quelle = z ? await this.pruefeRecht(z, quelleId, 'D') : await this.repo.holeMappe(quelleId);
    if (!ziel || !quelle) throw new Fachfehler(404, t('meldungen.dienst.diese-post-gibt-es'));
    const typ = await this.postTyp();
    if (ziel.typId !== typ.id || quelle.typId !== typ.id) throw new Fachfehler(422, t('meldungen.dienst.zusammenlegen-geht-nur-mit'));
    if (istVersendet(ziel.werte) || istVersendet(quelle.werte)) throw new Fachfehler(422, t('meldungen.dienst.versendete-e-mails-bleiben'));
    const quellDoks = await this.repo.listeDokumente(quelleId);
    if (!quellDoks.length) throw new Fachfehler(422, t('meldungen.dienst.die-gewaehlte-post-hat'));
    const fremd = quellDoks.filter((d) => d.mime !== 'application/pdf' && d.mime !== 'image/jpeg' && d.mime !== 'image/png');
    if (fremd.length) throw new Fachfehler(422, t('meldungen.dienst.ist-kein-pdf-und', { name: fremd[0].name }));
    const anhang: Buffer[] = [];
    for (const d of quellDoks) {
      const s = await this.dateien.lies(d.sha256);
      const b = Buffer.isBuffer(s) ? s : Buffer.concat(await s.toArray() as Buffer[]);
      anhang.push(d.mime === 'application/pdf' ? b : await bilderZuPdf([b]));
    }
    const zielPdf = (await this.repo.listeDokumente(zielId)).find((d) => d.mime === 'application/pdf');
    const qTitel = await this.titel(quelle);
    let erg: { dokument: Dokument; seiten: number };
    if (zielPdf) {
      const { inhalt } = await this.pdfVon(zielPdf.id);
      erg = await this.haengeSeitenAn(zielPdf, inhalt, anhang, von, t('meldungen.dienst.seiten-aus-der-post', { qTitel }));
    } else {
      const buf = await fuegeZusammen(anhang);
      const reg = typ.register.find((r) => r.art === 'dokumente')!;
      const dokument = (await this.ladeHoch(zielId, { register: reg.key, name: `${dateiname(auswahlText(ziel.werte.betreff) || 'Post')}.pdf`, typ: 'application/pdf', herkunft: 'bearbeitet' }, buf, von)).dokument;
      erg = { dokument, seiten: (await seitenInfo(buf)).anzahl };
      await this.notiere(zielId, von, 'pdf_bearbeitet', { dokument: dokument.name, seiten: erg.seiten, text: t('meldungen.dienst.seiten-aus-der-post-2', { qTitel }) });
    }
    await this.notiere(quelleId, von, 'zugeordnet', { text: t('meldungen.dienst.seiten-an-die-post', { titel: await this.titel(ziel) }), ziel: zielId, zielTyp: typ.id });
    await this.loescheMappe(quelleId, von);
    protokoll.modul('ablage').info('Posts zusammengelegt', { ziel: zielId, quelle: quelleId, seiten: erg.seiten });
    return { post: (await this.repo.holeMappe(zielId))!, ...erg };
  }
}
