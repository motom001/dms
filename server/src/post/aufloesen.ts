/**
 * Post auflösen und abtrennen (#934, #936, #1077 aus dienst.ts): Dokumente in ein anderes Register, aus der Post wird
 * die Mappe, der Rest als neue Post; „Ab hier abtrennen“. Schicht 3 – bekommt den Kern, die Rechteprüfung, Mappen,
 * Dokumente und die Systemmappen dieses Ordners. Neue Post, Post-Aufgaben und das Löschen kommen über den Anschluss.
 */
import type { DokumenteDienst, DokumentVersionen } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Anlass, Kern, Zugriff } from '../kern';
import type { MappenHistorie, MappenTitel } from '../mappen';
import { protokoll } from '../protokoll';
import type { Repo, Rueckverweis } from '../repo';
import { t } from '../sprache';
import { VolltextDienst } from '../volltext';
import type { ZugriffDienst } from '../zugriff';
import type { Ausloeser } from '../../../shared/src/loeschprotokoll';
import { auswahlText, darfPostAnlegen, type Dokument, type Historieneintrag, istVersendet, type Mappe, type Mappentyp, POST_STAND, type Register, type Werte } from '../../../shared/src/model';
import { entfernteSeiten, type LeerseitenPlan, type PostLeerseiten } from './leerseiten';
import type { PostSystemmappen } from './systemmappen';

/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
/** Post auflösen (#936): „Aus Post … angelegt“ nur, wenn dieselbe Person die Mappe höchstens so lange vorher angelegt hat. */
const AUFLOESEN_FRIST_MS = 60 * 60 * 1000;

/** Die Teile, die das Auflösen ruft: Rechteprüfung, Historie, Titel, Dokumente, Versionen, Systemmappen. */
export interface AufloesenTeile { rechte: ZugriffDienst; historie: MappenHistorie; titel: MappenTitel; dokumente: DokumenteDienst; versionen: DokumentVersionen; systemmappen: PostSystemmappen; leerseiten: PostLeerseiten }

/** Was das Auflösen außer dem Kern braucht – über den Dienst (neue Post und Post-Aufgaben liefen sonst im Kreis). */
export interface AufloesenAnschluss {
  legePostAn(eingabe: unknown, ich: { id: string | null; name: string }, z?: Zugriff, kanal?: string, herkunft?: Historieneintrag['daten'], id?: string, alt?: Werte): Promise<Mappe>;
  postAufgaben(mappeId: string, von: string | null): Promise<void>;
  /** Prüfung vor dem Löschen und Löschen einer Mappe (noch im Dienst). */
  loeschPruefung(m: Mappe, typ: Mappentyp | undefined, rueck: Rueckverweis[]): Promise<{ ok: boolean; grund?: string }>;
  loescheMappe(id: string, benutzerId?: string | null, z?: Zugriff, anlass?: Anlass): Promise<void>;
}

export class PostAufloesen {
  constructor(private readonly kern: Kern, private readonly teile: AufloesenTeile, private readonly anschluss: AufloesenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get ocr() { return this.teile.dokumente.ocr; }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private papierkorbTage() { return this.kern.papierkorbTage(); }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.teile.rechte.pruefeRecht(...a); }
  private rechteAn(...a: Parameters<ZugriffDienst['rechteAn']>) { return this.teile.rechte.rechteAn(...a); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private titel(m: Mappe) { return this.teile.titel.titel(m); }
  private beruehre(mappeId: string, typ: Mappentyp | undefined, benutzerId: string | null) { return this.teile.versionen.beruehre(mappeId, typ, benutzerId); }
  private schreibeSystemMappe(...a: Parameters<PostSystemmappen['schreibeSystemMappe']>) { return this.teile.systemmappen.schreibeSystemMappe(...a); }
  private legePostAn(...a: Parameters<AufloesenAnschluss['legePostAn']>) { return this.anschluss.legePostAn(...a); }
  private postAufgaben(mappeId: string, von: string | null) { return this.anschluss.postAufgaben(mappeId, von); }
  private loeschPruefung(...a: Parameters<AufloesenAnschluss['loeschPruefung']>) { return this.anschluss.loeschPruefung(...a); }
  private loescheMappe(...a: Parameters<AufloesenAnschluss['loescheMappe']>) { return this.anschluss.loescheMappe(...a); }

  /** Dokument in ein anderes Register (einer anderen Mappe); dort ist die Texterkennung vielleicht aus oder an. */
  async verschiebeInRegister(d: Dokument, mappeId: string, typ: Mappentyp, registerKey: string) {
    await this.repo.verschiebeDokument(d.id, mappeId, registerKey);
    if (VolltextDienst.volltextAn(typ, registerKey) && (d.ocr?.stand === 'keiner' || d.ocr?.stand === 'ausgelassen')) { await this.repo.ocrEinreihen([d.id]); this.ocr?.anstossen(); }
  }

  /**
   * Eben aus dieser Post angelegt (#936)? Die Zielmappe hat dieselbe Person vor höchstens einer Stunde angelegt, und ihr
   * ist noch keine Post zugeordnet. Seit #934 nur noch für den Wortlaut der Historie („Aus Post … angelegt“ bzw.
   * „Post … übernommen“) – auflösen lässt sich Post auch in eine bestehende Mappe.
   */
  async ebenAngelegt(ziel: Mappe, von: string | null): Promise<boolean> {
    if ((ziel.erstelltVon ?? null) !== von) return false;
    if (Date.now() - Date.parse(ziel.erstellt) > AUFLOESEN_FRIST_MS) return false;
    return !(await this.repo.historie(ziel.id, { arten: ['zugeordnet'], max: 1 })).length;
  }

  /**
   * Warum sich die Post nicht auflösen lässt (#936), sonst null. Auflösen legt die Post in den Papierkorb – das darf nur,
   * wer sie auch löschen darf (Recht D und dieselbe Prüfung wie beim Löschen). Bleibt ein Teil der Dokumente übrig, kommt
   * er in eine neue Post – dafür braucht es das Recht, Post anzulegen.
   */
  async aufloesenSperre(post: Mappe, typ: Mappentyp, mitRest: boolean, z?: Zugriff): Promise<string | null> {
    if (z && !(await this.rechteAn(z, post)).D) return t('meldungen.dienst.kein-recht-zum-loeschen');
    const p = await this.loeschPruefung(post, typ, await this.repo.rueckverweise(post.id));
    if (!p.ok) return p.grund ?? t('meldungen.dienst.kein-recht-zum-loeschen');
    if (mitRest) {
      if (!darfPostAnlegen(typ)) return t('meldungen.dienst.post-laesst-sich-nicht');
      if (z && !z.admin) {
        const jetzt = new Date().toISOString();
        const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte: { ...post.werte, stand: POST_STAND.neu, bezug: null }, erstellt: jetzt, erstelltVon: z.ich.id, geaendert: jetzt, geaendertVon: z.ich.id };
        if (!(await this.rechteAn(z, entwurf, true)).C) return t('meldungen.dienst.post-anlegen-darfst-du');
      }
    }
    return null;
  }

  /**
   * Post auflösen (#936, #934): Aus der Post wird die Mappe – eben angelegt oder vorhanden. Die gewählten Dokumente wandern in ihr Register,
   * die übrigen („abgetrennt“) in eine neue Post mit Verweis auf die Herkunft. Historie, Notizen, Aufgaben und
   * Erinnerungen der Post gehören danach der Mappe, dazu der Eintrag „Aus Post … angelegt“. Die leere Post kommt mit
   * „Aufgelöst in …“ in den Papierkorb (bei ausgeschaltetem Papierkorb endgültig weg); wiederherstellen lässt sie sich
   * nicht – der Weg zurück ist, die neue Mappe zu löschen (Thomas, 07.11.2026). Alles in einer Transaktion.
   */
  async loesePostAuf(x: { post: Mappe; typ: Mappentyp; ziel: Mappe; zielTyp: Mappentyp; reg: Register | undefined; dokumente: Dokument[]; rest: Dokument[]; von: string | null; quelle?: Ausloeser; neu: boolean; leer?: Map<string, LeerseitenPlan> }) {
    const { post, typ, ziel, zielTyp, reg, dokumente, rest, von } = x;
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const zielTitel = await this.titel(ziel);
    const erg = await this.inTransaktion(async () => {
      for (const d of dokumente) {
        await this.verschiebeInRegister(d, ziel.id, zielTyp, reg!.key);
        // Leerseiten (#997): neue Fassung ohne sie, das Original bleibt als frühere Version.
        const plan = x.leer?.get(d.id);
        if (plan) await this.teile.leerseiten.lasseWeg(d.id, plan, von);
        else if (d.leerseiten) await this.teile.leerseiten.vergiss(d.id);
      }
      // Abgetrennt: die übrigen Dokumente als neue Post in „Neue Post“, Betreff, Datum, Absender, Kanal und „Für“ wie bisher.
      const abgetrennt = rest.length ? await this.legeAbgetrenntAn(post, typ, rest, von, {
        text: t(x.neu ? 'meldungen.dienst.abgetrennt-aus' : 'meldungen.dienst.abgetrennt-aus-uebernommen', { anzahl: rest.length, betreff, typ: zielTyp.name, zielTitel }),
        ziel: ziel.id, zielTyp: zielTyp.id,
      }) : undefined;
      // Stand „Zugeordnet“: erledigt die Aufgabe „Post für dich“ und Aufgaben mit Anlass „Post“; die Post verweist auf die Mappe.
      const bezug = [...new Set([...alsListe(post.werte.bezug), ziel.id, ...(abgetrennt ? [abgetrennt.id] : [])])];
      await this.schreibeSystemMappe(typ, post.id, { bezug, stand: POST_STAND.zugeordnet }, von);
      await this.postAufgaben(post.id, von);
      // Alles, was mit der Post passiert ist, steht jetzt bei der Mappe.
      const mit = await this.repo.uebertrageAnMappe(post.id, ziel.id);
      const n = dokumente.length;
      const doks = n ? t('meldungen.dienst.mit-dokumenten-ins-register', { anzahl: n, wert: '', name: reg!.name }) : '';
      const abg = abgetrennt ? t('meldungen.dienst.abgetrennt-als-neue-post', { anzahl: rest.length }) : '';
      await this.notiere(ziel.id, von, 'zugeordnet', {
        text: t(x.neu ? 'meldungen.dienst.aus-post-angelegt' : 'meldungen.dienst.aus-post-uebernommen', { betreff, doks, abg }), post: post.id, postTyp: typ.id, dokumente: n, aufgeloest: true,
        ...(abgetrennt ? { abgetrennt: abgetrennt.id } : {}),
      });
      await this.notiere(post.id, von, 'zugeordnet', { text: t('meldungen.dienst.aufgeloest-in', { typ: zielTyp.name, zielTitel }), ziel: ziel.id, zielTyp: zielTyp.id, aufgeloest: true });
      await this.beruehre(ziel.id, zielTyp, von);
      const vorher = (await this.repo.holeMappe(post.id))!;
      // Löschprotokoll (#470): Weg „aufgelöst“, als Grund nur Mappentyp und Id der Mappe – keine Titel.
      await this.loescheMappe(post.id, von, undefined, { weg: 'aufgeloest', ausloeser: x.quelle, text: t('meldungen.dienst.aufgeloest-grund', { typ: zielTyp.name, id: ziel.id }) });
      return { vorher, abgetrennt, mit };
    });
    const papierkorb = (await this.papierkorbTage()) > 0;
    protokoll.modul('ablage').info('Post aufgelöst', { post: post.id, ziel: ziel.id, dokumente: dokumente.length, abgetrennt: erg.abgetrennt?.id, papierkorb, ...erg.mit });
    return {
      post: erg.vorher, ziel: (await this.repo.holeMappe(ziel.id))!, aufgeloest: true as const, papierkorb,
      ...(x.leer?.size ? { leerseiten: entfernteSeiten(x.leer) } : {}),
      ...(erg.abgetrennt ? { abgetrennt: (await this.repo.holeMappe(erg.abgetrennt.id))! } : {}),
    };
  }

  /**
   * Abgetrennter Teil einer Post (#936, #934): neue Post in „Neue Post“ mit Betreff „… (abgetrennt)“, Datum, „Von“,
   * Kanal und „An“ wie bisher; die Dokumente wandern dorthin, ihre Historie nennt die Herkunft.
   */
  private async legeAbgetrenntAn(post: Mappe, typ: Mappentyp, dokumente: Dokument[], von: string | null, herkunft: { text: string } & Record<string, unknown>): Promise<Mappe> {
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const neu = await this.legePostAn({
      betreff: t('meldungen.dienst.abgetrennt-betreff', { betreff }), datum: post.werte.datum, von: post.werte.von ?? '', kanal: auswahlText(post.werte.kanal),
      an: alsListe(post.werte.an)[0] ?? null,
    }, { id: von, name: '' }, undefined, undefined, undefined, undefined, post.werte);
    for (const d of dokumente) await this.repo.verschiebeDokument(d.id, neu.id, d.registerKey);
    await this.notiere(neu.id, von, 'post_geteilt', { ...herkunft, post: post.id, postTyp: typ.id, dokumente: dokumente.length });
    await this.beruehre(neu.id, typ, von);
    return neu;
  }

  /**
   * „Ab hier abtrennen“ (#934): Passt ein Folgedokument nicht zur Mappe, kommen die gewählten Dokumente als neue Post
   * nach „Neue Post“ – mit Verweis auf die Herkunft in ihrer Historie. Die Post behält die übrigen (mindestens eins).
   * Braucht Bearbeiten an der Post und das Recht, Post anzulegen.
   */
  async trennePostAb(postId: string, eingabe: unknown, von: string | null, z?: Zugriff) {
    const post = z ? await this.pruefeRecht(z, postId, 'U') : await this.repo.holeMappe(postId);
    if (!post) throw new Fachfehler(404, t('meldungen.dienst.diese-post-gibt-es'));
    const typ = await this.repo.holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(422, t('meldungen.dienst.abtrennen-nur-post'));
    if (istVersendet(post.werte)) throw new Fachfehler(422, t('meldungen.dienst.abtrennen-versendet'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const alle = await this.repo.listeDokumente(postId);
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : [];
    const weg = ids.map((id) => alle.find((d) => d.id === id));
    if (!ids.length || weg.some((d) => !d)) throw new Fachfehler(422, t('meldungen.dienst.ein-ausgewaehltes-dokument-gehoert-3'));
    if (weg.length >= alle.length) throw new Fachfehler(422, t('meldungen.dienst.abtrennen-eins-bleibt'));
    if (!darfPostAnlegen(typ)) throw new Fachfehler(403, t('meldungen.dienst.post-laesst-sich-nicht'));
    if (z && !z.admin) {
      const jetzt = new Date().toISOString();
      const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte: { ...post.werte, stand: POST_STAND.neu, bezug: null }, erstellt: jetzt, erstelltVon: z.ich.id, geaendert: jetzt, geaendertVon: z.ich.id };
      if (!(await this.rechteAn(z, entwurf, true)).C) throw new Fachfehler(403, t('meldungen.dienst.post-anlegen-darfst-du'));
    }
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const neu = await this.inTransaktion(async () => {
      const n = await this.legeAbgetrenntAn(post, typ, weg as Dokument[], von, { text: t('meldungen.dienst.abgetrennt-von', { anzahl: weg.length, betreff }) });
      await this.notiere(post.id, von, 'post_geteilt', { text: t('meldungen.dienst.abgetrennt-nach', { anzahl: weg.length, betreff: auswahlText(n.werte.betreff) }), abgetrennt: n.id, postTyp: typ.id, dokumente: weg.length });
      await this.beruehre(post.id, typ, von);
      return n;
    });
    protokoll.modul('ablage').info('Post abgetrennt', { post: post.id, neu: neu.id, dokumente: weg.length });
    return { post: (await this.repo.holeMappe(post.id))!, neu: (await this.repo.holeMappe(neu.id))! };
  }
}
