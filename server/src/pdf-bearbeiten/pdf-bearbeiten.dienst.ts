/**
 * PDF bearbeiten (#335, #338, #1077 aus dienst.ts): Seiten als Bild und als Graubild, Seiten drehen, umsortieren und
 * teilen (bei Post: je Teil eine neue Post), PDFs zusammenfügen. Schicht 3 – bekommt den Kern, die Rechteprüfung,
 * Mappen und Dokumente, nicht den ganzen Dienst. Die Post (neue Post, Systemmappe, Post-Aufgaben) kommt über den
 * Anschluss: post/ hängt Fotos mit `pdfVon` an, andersherum liefe es im Kreis.
 */
import { dateiname, type DokumenteDienst, type DokumentUmwandlung, type DokumentVersionen } from '../dokumente';
import { Fachfehler } from '../fehler';
import { graubild } from '../graubild';
import type { Kern, Zugriff } from '../kern';
import type { MappenArchiv, MappenHistorie, MappenTitel } from '../mappen';
import { bildSeitePdf } from '../pdf';
import { fuegeZusammen, pruefeAuswahl, pruefeTeile, Seitenbilder, SEITENBILDER_MAX, seitenInfo, teile, teilName } from '../pdfseiten';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { kernTyp } from '../../../shared/src/dateiumwandlung';
import { auswahlText, type Dokument, type Historieneintrag, type Mappe, type Mappentyp, MAX_DATEIGROESSE, POST_STAND, type Register, type Werte } from '../../../shared/src/model';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
/** Kurztext der Historie für „PDF bearbeitet“ (#335). */
function pdfText(w: { seiten: number; vorher: number; gedreht?: number; teile?: number }): string {
  const eintrag: string[] = [];
  if (w.teile) eintrag.push(t('meldungen.dienst.in-teile-geteilt', { teile: w.teile }));
  if (w.seiten !== w.vorher && !w.teile) eintrag.push(`${w.vorher} → ${w.seiten} Seiten`);
  if (w.gedreht) eintrag.push(`${w.gedreht} ${t('meldungen.dienst.seiten', { anzahl: w.gedreht })} gedreht`);
  return eintrag.join(', ') || t('meldungen.dienst.seiten-umsortiert');
}

/** Die Teile, die PDF bearbeiten ruft: Rechteprüfung, Mappen (Historie, Titel, Archivmodus) und Dokumente. */
export interface PdfTeile {
  rechte: ZugriffDienst; historie: MappenHistorie; titel: MappenTitel; archiv: MappenArchiv;
  dokumente: DokumenteDienst; versionen: DokumentVersionen; umwandlung: DokumentUmwandlung;
}

/** Was PDF bearbeiten außer dem Kern braucht – die Post (post/) über den Dienst, sonst liefe es im Kreis. */
export interface PdfAnschluss {
  legePostAn(eingabe: unknown, ich: { id: string | null; name: string }, z?: Zugriff, kanal?: string, herkunft?: Historieneintrag['daten'], id?: string, alt?: Werte): Promise<Mappe>;
  schreibeSystemMappe(typ: Mappentyp, id: string, eingabe: Werte, von: string | null, kennung?: string | null): Promise<Mappe>;
  postAufgaben(mappeId: string, von: string | null): Promise<void>;
}

export class PdfBearbeiten {
  constructor(private readonly kern: Kern, private readonly teile: PdfTeile, private readonly anschluss: PdfAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private get umwandlung() { return this.teile.umwandlung.umwandlung; }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private papierkorbTage() { return this.kern.papierkorbTage(); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private titel(m: Mappe) { return this.teile.titel.titel(m); }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.teile.rechte.pruefeRecht(...a); }
  private pruefeArchivDokument(mappeId: string, was: string) { return this.teile.archiv.pruefeArchivDokument(mappeId, was); }
  private ladeHoch(...a: Parameters<DokumenteDienst['ladeHoch']>) { return this.teile.dokumente.ladeHoch(...a); }
  private loescheDokument(...a: Parameters<DokumenteDienst['loescheDokument']>) { return this.teile.dokumente.loescheDokument(...a); }
  private ersetzeDokument(...a: Parameters<DokumentVersionen['ersetzeDokument']>) { return this.teile.versionen.ersetzeDokument(...a); }
  private legePostAn(...a: Parameters<PdfAnschluss['legePostAn']>) { return this.anschluss.legePostAn(...a); }
  private schreibeSystemMappe(...a: Parameters<PdfAnschluss['schreibeSystemMappe']>) { return this.anschluss.schreibeSystemMappe(...a); }
  private postAufgaben(mappeId: string, von: string | null) { return this.anschluss.postAufgaben(mappeId, von); }

  /** Seitenbilder der Seitenansicht (im Arbeitsspeicher, für die letzten Dokumente). */
  readonly seitenbilder = new Seitenbilder();

  async pdfVon(id: string): Promise<{ d: Dokument; inhalt: Buffer }> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (d.mime !== 'application/pdf') throw new Fachfehler(422, t('meldungen.dienst.ist-kein-pdf-bearbeiten', { name: d.name }));
    const s = await this.dateien.lies(d.sha256);
    return { d, inhalt: Buffer.isBuffer(s) ? s : Buffer.concat(await s.toArray() as Buffer[]) };
  }

  /**
   * Eine Seite als Graustufenbild (PGM) für eine Texterkennung im Paket (#338). JPEG und PNG (#458) haben genau eine
   * Seite: Das Bild wird ohne Neuberechnung in ein einseitiges PDF gelegt (wie bei den Vorschaubildern) und genauso
   * gerastert – kein zusätzliches Bildwerkzeug im Image. Bilder kommen in Originalgröße, dpi zählt dort nicht.
   * `farbe` (#716): als Farbbild (PPM) statt Graustufen, z. B. für die Archivfassung.
   */
  async seiteAlsGraubild(id: string, nr: number, dpi: number, farbe = false, gestempelt?: { pdf: Buffer } | null): Promise<Buffer> {
    // Abruf mit API-Schlüssel und Stempel (#799): aus der gestempelten Kopie.
    if (gestempelt) return graubild(gestempelt.pdf, nr, dpi, farbe);
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    // Andere Dateitypen (#577): die Seiten der umgewandelten Fassung (PDF, PNG oder JPEG) eines Pakets.
    if (!kernTyp(d.mime)) {
      const f = await this.umwandlung?.lies(d.sha256);
      if (!f) throw new Fachfehler(422, t('meldungen.dienst.ist-weder-pdf-noch', { name: d.name }));
      if (f.info.mime === 'application/pdf') return graubild(f.inhalt, nr, dpi, farbe);
      if (nr !== 1) throw new Fachfehler(404, t('meldungen.dienst.seite-gibt-es-nicht', { nr }));
      return graubild(await bildSeitePdf(f.inhalt, f.info.mime), 1, 72, farbe);
    }
    if (d.mime === 'image/jpeg' || d.mime === 'image/png') {
      if (nr !== 1) throw new Fachfehler(404, t('meldungen.dienst.seite-gibt-es-nicht', { nr }));
      const s = await this.dateien.lies(d.sha256);
      const bild = Buffer.isBuffer(s) ? s : Buffer.concat(await s.toArray() as Buffer[]);
      // Das Bild liegt in Originalgröße (1 Bildpunkt = 1 pt): bei 72 dpi kommen genau seine Bildpunkte.
      return graubild(await bildSeitePdf(bild, d.mime), 1, 72, farbe);
    }
    if (d.mime !== 'application/pdf') throw new Fachfehler(422, t('meldungen.dienst.ist-weder-pdf-noch-2', { name: d.name }));
    const { inhalt } = await this.pdfVon(id);
    return graubild(inhalt, nr, dpi, farbe);
  }

  /** Seitenzahl und Drehung je Seite. */
  async pdfSeiten(id: string) {
    const { d, inhalt } = await this.pdfVon(id);
    return { id: d.id, name: d.name, version: d.version ?? 1, sha256: d.sha256, ...(await seitenInfo(inhalt)), bilderBis: SEITENBILDER_MAX };
  }

  /** Bild einer Seite (Seitenansicht); null, wenn es keins gibt. */
  async pdfSeitenbild(id: string, nr: number, gestempelt?: { schluessel: string; pdf: Buffer } | null): Promise<Buffer | null> {
    if (gestempelt) return Number.isInteger(nr) && nr >= 1 && nr <= SEITENBILDER_MAX ? this.seitenbilder.bild(gestempelt.schluessel, nr, async () => gestempelt.pdf) : null;
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (d.mime !== 'application/pdf' || !Number.isInteger(nr) || nr < 1 || nr > SEITENBILDER_MAX) return null;
    return this.seitenbilder.bild(d.sha256, nr, async () => (await this.pdfVon(id)).inhalt);
  }

  /**
   * Seiten bearbeiten (#335): `seiten` = die Seiten des Ergebnisses in Reihenfolge (Nummer im Original,
   * Drehung), `teile` = Positionen in dieser Liste, an denen ein neuer Teil beginnt.
   * - Ohne Teilen: neue Version (Versionierung) bzw. – ohne Versionierung – Ersetzen nach Rückfrage
   *   (`bestaetigt`), das bisherige kommt in den Papierkorb.
   * - Teilen in einer Mappe: Teil 1 wird so zur neuen Version, die weiteren Teile werden eigene Dokumente
   *   im selben Register.
   * - Teilen bei Post: je Teil eine neue Post; die Ausgangspost behält ihr Dokument, ist erledigt und
   *   verweist auf die neuen.
   */
  async bearbeitePdf(id: string, eingabe: unknown, von: string | null, z?: Zugriff) {
    const { d, inhalt } = await this.pdfVon(id);
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const info = await seitenInfo(inhalt);
    const seiten = pruefeAuswahl(e.seiten, info.anzahl);
    const starts = pruefeTeile(e.teile, seiten.length);
    const m = await this.repo.holeMappe(d.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const reg = typ?.register.find((r) => r.key === d.registerKey && r.art === 'dokumente');
    if (!m || !typ || !reg) throw new Fachfehler(409, t('meldungen.dienst.das-register-dieses-dokuments'));
    const gleich = starts.length === 1 && seiten.length === info.anzahl && seiten.every((s, i) => s.nr === i + 1 && !s.drehung);
    if (gleich) throw new Fachfehler(422, t('meldungen.dienst.es-hat-sich-nichts'));
    const teileBuf = await teile(inhalt, seiten, starts);
    const gedreht = seiten.filter((s) => s.drehung).length;
    const was = { dokument: d.name, seiten: seiten.length, vorher: info.anzahl, ...(gedreht ? { gedreht } : {}), ...(starts.length > 1 ? { teile: starts.length } : {}) };

    if (typ.system === 'post' && starts.length > 1) return this.teilePost(m, typ, reg, d, teileBuf, von, z, was);

    const korb = (await this.papierkorbTage()) > 0;
    let erstes: Dokument;
    const name1 = starts.length > 1 ? teilName(d.name, 1) : d.name;
    if (reg.versionierung) {
      erstes = await this.ersetzeDokument(d.id, { name: name1, typ: 'application/pdf', herkunft: 'bearbeitet' }, teileBuf[0], von);
    } else {
      if (e.bestaetigt !== true) {
        throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-3', { wert: korb ? t('meldungen.dienst.das-bisherige-kommt-in') : t('meldungen.dienst.das-bisherige-ist-danach') }), { rueckfrage: true, papierkorb: korb });
      }
      await this.loescheDokument(d.id, von);
      erstes = (await this.ladeHoch(m.id, { register: reg.key, name: name1, typ: 'application/pdf', herkunft: 'bearbeitet' }, teileBuf[0], von)).dokument;
    }
    const weitere: Dokument[] = [];
    for (const [i, b] of teileBuf.slice(1).entries()) {
      weitere.push((await this.ladeHoch(m.id, { register: reg.key, name: teilName(d.name, i + 2), typ: 'application/pdf', herkunft: 'bearbeitet' }, b, von)).dokument);
    }
    await this.notiere(m.id, von, 'pdf_bearbeitet', { ...was, text: pdfText(was) });
    protokoll.modul('dokumente').info('PDF bearbeitet', { id: d.id, seiten: seiten.length, vorher: info.anzahl, teile: starts.length });
    return { dokumente: [erstes, ...weitere], posten: [] as Mappe[] };
  }

  private async teilePost(post: Mappe, typ: Mappentyp, reg: Register, d: Dokument, teileBuf: Buffer[], von: string | null, z: Zugriff | undefined, was: Record<string, unknown>) {
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const posten: Mappe[] = [];
    const dokumente: Dokument[] = [];
    for (const [i, b] of teileBuf.entries()) {
      // Je Teil: neue Post mit ihrem Dokument und beiden Ereignissen (post.angelegt, dokument.hochgeladen) ganz oder gar nicht (#404).
      await this.inTransaktion(async () => {
        const neu = await this.legePostAn({
          betreff: t('meldungen.dienst.teil', { betreff, wert: i + 1 }), datum: post.werte.datum, absender: post.werte.absender ?? '', kanal: auswahlText(post.werte.kanal),
          fuer: alsListe(post.werte.fuer)[0] ?? null,
        }, { id: von, name: '' }, z, undefined, undefined, undefined, post.werte);
        await this.notiere(neu.id, von, 'post_geteilt', { text: t('meldungen.dienst.teil-von-aus', { wert: i + 1, teileBuf: teileBuf.length, betreff }), post: post.id, postTyp: typ.id });
        dokumente.push((await this.ladeHoch(neu.id, { register: reg.key, name: teilName(d.name, i + 1), typ: 'application/pdf', herkunft: 'bearbeitet' }, b, von)).dokument);
        posten.push((await this.repo.holeMappe(neu.id))!);
      });
    }
    const bezug = [...new Set([...alsListe(post.werte.bezug), ...posten.map((p) => p.id)])];
    await this.schreibeSystemMappe(typ, post.id, { bezug, stand: POST_STAND.erledigt }, von);
    await this.notiere(post.id, von, 'post_geteilt', { ...was, text: t('meldungen.dienst.in-posts-geteilt', { name: d.name, posten: posten.length }), posten: posten.map((p) => p.id), postTyp: typ.id });
    await this.postAufgaben(post.id, von);
    protokoll.modul('ablage').info('Post geteilt', { post: post.id, teile: posten.length });
    return { dokumente, posten };
  }

  /**
   * Zusammenfügen (#335): mehrere PDF-Dokumente (auch aus mehreren Mappen oder Posts) zu einem neuen
   * Dokument in `ziel` (Standard: die Mappe des ersten). `originaleEntfernen`: die Ausgangsdokumente
   * kommen in den Papierkorb (ohne Papierkorb nur mit `bestaetigt`); eine Post, die dadurch kein
   * Dokument mehr hat, ist erledigt und verweist auf das Ziel.
   */
  async fuegePdfZusammen(eingabe: unknown, von: string | null, z?: Zugriff) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : [];
    if (ids.length < 2) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-zwei-pdf'));
    if (ids.length > 100) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-100-dokumente-auf'));
    const entfernen = e.originaleEntfernen === true;
    const quellen: Array<{ d: Dokument; inhalt: Buffer }> = [];
    for (const id of ids) {
      const d = await this.repo.holeDokument(id);
      if (!d) throw new Fachfehler(404, t('meldungen.dienst.ein-gewaehltes-dokument-gibt'));
      if (z) await this.pruefeRecht(z, d.mappeId, entfernen ? 'U' : 'R');
      quellen.push(await this.pdfVon(id));
    }
    const zielId = istUuid(text(e.ziel)) ? text(e.ziel) : quellen[0].d.mappeId;
    const ziel = z ? await this.pruefeRecht(z, zielId, 'U') : await this.repo.holeMappe(zielId);
    if (!ziel) throw new Fachfehler(404, t('meldungen.dienst.die-gewaehlte-mappe-gibt'));
    const zielTyp = await this.repo.holeTyp(ziel.typId);
    const regs = zielTyp?.register.filter((r) => r.art === 'dokumente') ?? [];
    const reg = e.register ? regs.find((r) => r.key === text(e.register)) : regs.find((r) => r.key === quellen[0].d.registerKey && ziel.id === quellen[0].d.mappeId) ?? regs[0];
    if (!reg) throw new Fachfehler(422, regs.length ? t('meldungen.dienst.dieses-dokumentenregister-gibt-es-2') : t('meldungen.dienst.die-mappe-hat-kein'));
    const mappen = [...new Set(quellen.map((q) => q.d.mappeId))];
    if (entfernen) {
      for (const mid of mappen) await this.pruefeArchivDokument(mid, 'entfernen');
      if ((await this.papierkorbTage()) === 0 && e.bestaetigt !== true) {
        throw new Fachfehler(409, t('meldungen.dienst.der-papierkorb-ist-ausgeschaltet'), { rueckfrage: true, papierkorb: false });
      }
    }
    const buf = await fuegeZusammen(quellen.map((q) => q.inhalt));
    if (buf.length > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.zusammengefuegt-waere-das-pdf'));
    let name = dateiname(text(e.name) || quellen[0].d.name);
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    // Erst entfernen, dann ablegen: so bekommt das Ergebnis den Namen des ersten ohne „(2)“.
    if (entfernen) for (const q of quellen) await this.loescheDokument(q.d.id, von);
    const neu = (await this.ladeHoch(ziel.id, { register: reg.key, name, typ: 'application/pdf', herkunft: 'bearbeitet' }, buf, von)).dokument;
    const was = { dokument: neu.name, zusammengefuegt: quellen.map((q) => q.d.name), seiten: (await seitenInfo(buf)).anzahl };
    await this.notiere(ziel.id, von, 'pdf_bearbeitet', { ...was, text: t('meldungen.dienst.pdfs-zu-zusammengefuegt', { quellen: quellen.length, name: neu.name }) });
    const erledigt: string[] = [];
    if (entfernen) {
      const zielTitel = await this.titel(ziel);
      for (const mid of mappen.filter((x) => x !== ziel.id)) {
        const p = await this.repo.holeMappe(mid);
        const eintrag = p ? await this.repo.holeTyp(p.typId) : undefined;
        if (!p || eintrag?.system !== 'post' || (await this.repo.listeDokumente(mid)).length) continue;
        await this.schreibeSystemMappe(eintrag, p.id, { bezug: [...new Set([...alsListe(p.werte.bezug), ziel.id])], stand: POST_STAND.erledigt }, von);
        await this.notiere(p.id, von, 'zugeordnet', { text: t('meldungen.dienst.dokumente-zusammengefuegt-in', { zielTitel }), ziel: ziel.id, zielTyp: ziel.typId });
        await this.postAufgaben(p.id, von);
        erledigt.push(p.id);
      }
    }
    protokoll.modul('dokumente').info('PDFs zusammengefügt', { ziel: ziel.id, anzahl: quellen.length, entfernt: entfernen });
    return { dokument: neu, erledigtePost: erledigt };
  }
}
