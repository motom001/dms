/**
 * Post (#192, #337, #1077 aus dienst.ts): Post anlegen, einer Mappe zuordnen, automatisch zuordnen und rückgängig
 * machen, die Aufgabe „Post für dich“. Schicht 3 – über Mappen und Dokumenten; bekommt den Kern, die Rechteprüfung,
 * Mappentypen, Mappen, Dokumente und die übrigen Teile dieses Ordners. Aufgaben, Ereignis und Verknüpfungen kommen
 * über den Anschluss (noch im Dienst).
 */
import { randomUUID } from 'node:crypto';
import type { DokumenteDienst, DokumentVersionen } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { bereinigeWerte, type MappenEingaben, type MappenHistorie, type MappenTitel } from '../mappen';
import type { MappentypenDienst } from '../mappentypen';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import { VolltextDienst } from '../volltext';
import type { ZugriffDienst } from '../zugriff';
import { istDatum } from '../../../shared/src/fristen';
import type { Ausloeser } from '../../../shared/src/loeschprotokoll';
import { type Aufgabe, type AufgabenAnlass, auswahlText, darfPostAnlegen, type Dokument, type Historieneintrag, istVersendet, type Mappe, type Mappentyp, NOTIZ_MAX, POST_KANAL, POST_RICHTUNG, POST_STAND, verweiseVon, type Werte } from '../../../shared/src/model';
import { heuteIn } from '../../../shared/src/sichten';
import { postWerteNeu } from '../../../shared/src/postfelder';
import type { PostAufloesen } from './aufloesen';
import type { KontenAnschluss, PostSystemmappen } from './systemmappen';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
/**
 * Was die Post von der Erkennung einer Post liest (#337; Auszug aus `PostErkennung` in erkennung.ts – die Erkennung
 * bekommt noch den ganzen Dienst und liegt darum nicht unter dieser Schicht). Ob sie sicher ist, sagt der Anschluss.
 */
interface PostErkennung {
  eindeutig: string | null;
  auto?: { ziel: string; zeit: string; grund: string; dokumente: Array<{ id: string; register: string }>; aufgabe: string | null; rueckgaengig?: { zeit: string; von: string | null } };
}

/** Die Teile, die die Post ruft: Rechteprüfung, Mappentypen, Mappen, Dokumente und die Teile dieses Ordners. */
export interface PostTeile {
  rechte: ZugriffDienst; mappentypen: MappentypenDienst; historie: MappenHistorie; titel: MappenTitel; eingaben: MappenEingaben;
  dokumente: DokumenteDienst; versionen: DokumentVersionen; aufloesen: PostAufloesen; systemmappen: PostSystemmappen;
}

/** Was die Post außer dem Kern braucht – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface PostAnschluss {
  /** Ereignis auslösen – über die Fassade des Dienstes (Tests ersetzen `dienst.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** Verknüpfte Mappen melden (#670; noch im Dienst). */
  meldeVerknuepft(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null): Promise<void>;
  /** Passwortfelder verschlüsseln (#46; Tresor am Dienst). */
  verschluessele(klartext: string): string;
  /** Aufgaben (noch im Dienst): anlegen, umleiten (#78), eigene holen, nach Anlass erledigen (#724). */
  neueAufgabe(a: Aufgabe, typ?: string): Promise<Aufgabe>;
  leiteUm(a: Aufgabe): Promise<Aufgabe>;
  eigeneAufgabe(id: string, ich: { id: string; rolle: string }): Promise<Aufgabe>;
  erledigeNachAnlass(mappeId: string, passt: (x: AufgabenAnlass, a: Aufgabe) => boolean, grund: string): Promise<number>;
  /** Konten (#43), vom Start angebunden. */
  konten(): KontenAnschluss | undefined;
  /** Ist die Erkennung sicher (#337; `sichereZuordnung` in erkennung.ts)? */
  sichereZuordnung(e: PostErkennung, autoTypen: Set<string>): { ziel: { mappeId: string } | null; grund: string };
}

export class PostDienst {
  constructor(private readonly kern: Kern, private readonly teile: PostTeile, private readonly anschluss: PostAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get ocr() { return this.teile.dokumente.ocr; }
  private get konten() { return this.anschluss.konten(); }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private verschluessele = (klartext: string) => this.anschluss.verschluessele(klartext);
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private meldeVerknuepft(...a: Parameters<PostAnschluss['meldeVerknuepft']>) { return this.anschluss.meldeVerknuepft(...a); }
  private neueAufgabe(a: Aufgabe, typ?: string) { return this.anschluss.neueAufgabe(a, typ); }
  private leiteUm(a: Aufgabe) { return this.anschluss.leiteUm(a); }
  private eigeneAufgabe(id: string, ich: { id: string; rolle: string }) { return this.anschluss.eigeneAufgabe(id, ich); }
  private sichereZuordnung(e: PostErkennung, autoTypen: Set<string>) { return this.anschluss.sichereZuordnung(e, autoTypen); }
  private erledigeNachAnlass(...a: Parameters<PostAnschluss['erledigeNachAnlass']>) { return this.anschluss.erledigeNachAnlass(...a); }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.teile.rechte.pruefeRecht(...a); }
  private rechteAn(...a: Parameters<ZugriffDienst['rechteAn']>) { return this.teile.rechte.rechteAn(...a); }
  private sichtbarFuer(benutzerId: string, ids: string[]) { return this.teile.rechte.sichtbarFuer(benutzerId, ids); }
  private typErkennungen() { return this.teile.mappentypen.typErkennungen(); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private aenderungen(typ: Mappentyp, alt: Werte, neu: Werte) { return this.teile.historie.aenderungen(typ, alt, neu); }
  private titel(m: Mappe) { return this.teile.titel.titel(m); }
  private aktualisiereTitel(ids: string[]) { return this.teile.titel.aktualisiereTitel(ids); }
  private pruefeVerweisziele(...a: Parameters<MappenEingaben['pruefeVerweisziele']>) { return this.teile.eingaben.pruefeVerweisziele(...a); }
  private pruefeWerte(...a: Parameters<MappenEingaben['pruefeWerte']>) { return this.teile.eingaben.pruefeWerte(...a); }
  private beruehre(mappeId: string, typ: Mappentyp | undefined, benutzerId: string | null) { return this.teile.versionen.beruehre(mappeId, typ, benutzerId); }
  private verschiebeInRegister(...a: Parameters<PostAufloesen['verschiebeInRegister']>) { return this.teile.aufloesen.verschiebeInRegister(...a); }
  private ebenAngelegt(ziel: Mappe, von: string | null) { return this.teile.aufloesen.ebenAngelegt(ziel, von); }
  private aufloesenSperre(...a: Parameters<PostAufloesen['aufloesenSperre']>) { return this.teile.aufloesen.aufloesenSperre(...a); }
  private loesePostAuf(...a: Parameters<PostAufloesen['loesePostAuf']>) { return this.teile.aufloesen.loesePostAuf(...a); }
  private schreibeSystemMappe(...a: Parameters<PostSystemmappen['schreibeSystemMappe']>) { return this.teile.systemmappen.schreibeSystemMappe(...a); }

  /**
   * Neue Post anlegen (Oberfläche „+ Post“, API): Stand Neu, eingehend, heute. Die Dokumente kommen
   * danach über das Hochladen ins Dokumentenregister. Ob man Post anlegen darf, regeln die Berechtigungen.
   */
  /**
   * Post anlegen. `ich.id` null: kein echter Benutzer, sondern ein Eingangskanal (#195: „Eingangsordner“);
   * `herkunft` steht dann als eigener Eintrag in der Historie.
   * `alt` (Teilen, #445): Werte der Ausgangspost – Verweise, die dort schon stehen (z. B. „An“), gelten nicht als neu.
   * „von“ und „an“ (#1042): bis 1.0.0 auch unter den alten Namen `absender` und `fuer` (Schnittstelle v1, uebergaenge.ts).
   */
  async legePostAn(eingabe: unknown, ich: { id: string | null; name: string }, z?: Zugriff, kanal: string = POST_KANAL.hochgeladen, herkunft?: Historieneintrag['daten'], id: string = randomUUID(), alt: Werte = {}): Promise<Mappe> {
    const { post: typ } = await this.kern.system();
    if (!darfPostAnlegen(typ)) throw new Fachfehler(403, t('meldungen.dienst.post-laesst-sich-nicht'));
    const e = postWerteNeu((eingabe ?? {}) as Record<string, unknown>);
    const betreff = text(e.betreff).replace(/[\r\n]+/g, ' ').trim().slice(0, 250) || t('meldungen.dienst.neue-post');
    const datum = istDatum(text(e.datum)) ? text(e.datum) : heuteIn();
    const werte = bereinigeWerte(typ, {
      ...(e.werte && typeof e.werte === 'object' ? e.werte as Record<string, unknown> : {}),
      betreff, datum, kanal: Object.values(POST_KANAL).includes(text(e.kanal) as never) ? text(e.kanal) : kanal,
      richtung: POST_RICHTUNG.eingehend, stand: POST_STAND.neu,
      // Kein Rückgriff auf den Namen des Anlegenden (#494): „von“ ist, wer den Brief geschickt hat.
      von: text(e.von).trim().slice(0, 250) || null, bezug: null,
      ...(e.an !== undefined ? { an: e.an || null } : {}), ...(typeof e.nachricht === 'string' ? { nachricht: e.nachricht.slice(0, NOTIZ_MAX) } : {}),
    }, {}, this.verschluessele);
    if (z && !z.admin) {
      const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte, erstellt: new Date().toISOString(), erstelltVon: ich.id, geaendert: new Date().toISOString(), geaendertVon: ich.id };
      if (!(await this.rechteAn(z, entwurf, true)).C) throw new Fachfehler(403, t('meldungen.dienst.post-anlegen-darfst-du'));
    }
    await this.pruefeVerweisziele(z, typ, werte, alt);
    await this.pruefeWerte(typ, werte);
    // Vorgegebene Id (#196): Eingangskanäle merken sie sich vorher und erkennen nach einem Absturz, dass es die Post schon gibt.
    // Post samt Historie, Aufgabe und Ereignis in einer Transaktion (#404).
    const { m, titel } = await this.inTransaktion(async () => {
      const m = await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), ich.id);
      await this.notiere(m.id, ich.id, 'angelegt', { aenderungen: await this.aenderungen(typ, {}, werte), ...(ich.id ? {} : { system: ich.name }) });
      if (herkunft) await this.notiere(m.id, null, 'uebernommen', { system: ich.name, ...herkunft });
      const titel = (await this.aktualisiereTitel([m.id])).get(m.id);
      await this.postAufgaben(m.id, ich.id);
      // „an“ (#1042); „fuer“ mit demselben Wert bis 1.0.0 (uebergaenge.ts).
      const an = typeof werte.an === 'string' ? werte.an : null;
      await this.ereignis('post.angelegt', { mappe: m.id, kanal: werte.kanal, an, fuer: an }, ich.id);
      await this.meldeVerknuepft(typ, m.id, alt, werte, ich.id);
      return { m, titel };
    });
    protokoll.modul('ablage').info('Post angelegt', { mappe: m.id, kanal: werte.kanal });
    return { ...m, titel };
  }

  /**
   * Zuordnen (#192): Post gehört zu einer Mappe. Die gewählten Dokumente wandern in ein
   * Dokumentenregister der Zielmappe (oder werden kopiert – dieselbe Datei, kein zweiter Platz),
   * die Post verweist auf die Mappe und hat danach Stand „Zugeordnet“. Mehrmals möglich.
   *
   * Auflösen (#936, `aufloesen: true`): Ist die Zielmappe eben aus dieser Post angelegt worden, wird aus der Post die
   * Mappe – siehe `loesePostAuf`. Darf die Person die Post nicht löschen, bleibt es beim Zuordnen, mit `hinweis`.
   */
  async ordneZu(postId: string, eingabe: unknown, von: string | null, z?: Zugriff, auto?: { grund: string }, quelle?: Ausloeser) {
    const post = z ? await this.pruefeRecht(z, postId, 'U') : await this.repo.holeMappe(postId);
    if (!post) throw new Fachfehler(404, t('meldungen.dienst.diese-post-gibt-es'));
    const typ = await this.repo.holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(422, t('meldungen.dienst.zuordnen-geht-nur-mit'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const zielId = text(e.ziel);
    if (!istUuid(zielId) || zielId === postId) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-mappe-waehlen'));
    const ziel = z ? await this.pruefeRecht(z, zielId, 'U') : await this.repo.holeMappe(zielId);
    if (!ziel) throw new Fachfehler(404, t('meldungen.dienst.die-gewaehlte-mappe-gibt'));
    const zielTyp = await this.repo.holeTyp(ziel.typId);
    if (!zielTyp) throw new Fachfehler(500, t('meldungen.dienst.der-mappentyp-der-zielmappe'));
    if (zielTyp.system === 'post') throw new Fachfehler(422, t('meldungen.dienst.post-laesst-sich-nicht-2'));
    const alle = await this.repo.listeDokumente(postId);
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : alle.map((d) => d.id);
    const dokumente = ids.map((id) => alle.find((d) => d.id === id));
    if (dokumente.some((d) => !d)) throw new Fachfehler(422, t('meldungen.dienst.ein-ausgewaehltes-dokument-gehoert-3'));
    const regs = zielTyp.register.filter((r) => r.art === 'dokumente');
    const reg = regs.find((r) => r.key === text(e.register)) ?? (e.register ? undefined : regs[0]);
    if (dokumente.length && !reg) throw new Fachfehler(422, regs.length ? t('meldungen.dienst.dieses-dokumentenregister-gibt-es') : t('meldungen.dienst.hat-kein-dokumentenregister-ordne', { name: zielTyp.name }));
    const kopieren = e.kopieren === true;
    // Auflösen (#936, #934): auf Wunsch – in eine neue wie in eine bestehende Mappe. Nie automatisch (wegen „Automatik
    // rückgängig“), nie mit „Kopie in der Post behalten“ und nie bei versendeten E-Mails (Nachweis des Versands).
    const rest = alle.filter((d) => !ids.includes(d.id));
    let hinweis: string | undefined;
    if (e.aufloesen === true && !auto && !kopieren && !istVersendet(post.werte)) {
      const grund = await this.aufloesenSperre(post, typ, rest.length > 0, z);
      if (!grund) return this.loesePostAuf({ post, typ, ziel, zielTyp, reg, dokumente: dokumente as Dokument[], rest, von, quelle, neu: await this.ebenAngelegt(ziel, von) });
      hinweis = t('meldungen.dienst.post-bleibt-zugeordnet', { grund });
    }
    for (const d of dokumente as Dokument[]) {
      if (kopieren) {
        const neu = await this.repo.legeDokumentAn({ ...d, id: randomUUID(), mappeId: ziel.id, registerKey: reg!.key, erstellt: new Date().toISOString(), erstelltVon: von });
        const fertig = await this.repo.ocrVonSha(d.sha256, neu.id);
        if (fertig) await this.repo.ocrSetze(neu.id, { stand: 'fertig', text: fertig.text, seiten: fertig.seiten, info: fertig.info, sprache: fertig.sprache ?? null });
        else if (VolltextDienst.volltextAn(zielTyp, reg!.key)) { await this.repo.ocrEinreihen([neu.id]); this.ocr?.anstossen(); }
      } else await this.verschiebeInRegister(d, ziel.id, zielTyp, reg!.key);
    }
    const betreff = auswahlText(post.werte.betreff) || t('meldungen.dienst.post');
    const zielTitel = await this.titel(ziel);
    const n = dokumente.length;
    const doks = n ? t('meldungen.dienst.mit-dokumenten-ins-register', { anzahl: n, wert: kopieren ? ' (kopiert)' : '', name: reg!.name }) : '';
    const bezug = [...new Set([...alsListe(post.werte.bezug), ziel.id])];
    await this.schreibeSystemMappe(typ, post.id, { bezug, stand: POST_STAND.zugeordnet }, von);
    // Automatisch (#337): Begründung in der Historie beider Mappen.
    const wie = auto ? { automatisch: true, grund: auto.grund, system: 'Erkennung' } : {};
    const warum = auto ? ` – automatisch: ${auto.grund}` : '';
    await this.notiere(post.id, von, 'zugeordnet', { text: t('meldungen.dienst.zugeordnet-zu', { wert: auto ? t('meldungen.dienst.automatisch') : '', zielTitel, doks, warum }), ziel: ziel.id, zielTyp: ziel.typId, dokumente: n, kopiert: kopieren, ...wie });
    await this.notiere(ziel.id, von, 'zugeordnet', { text: t('meldungen.dienst.post-zugeordnet', { betreff, wert: auto ? t('meldungen.dienst.automatisch') : '', doks, warum }), post: post.id, postTyp: typ.id, dokumente: n, kopiert: kopieren, ...wie });
    if (n) {
      await this.beruehre(ziel.id, zielTyp, von);
      await this.beruehre(post.id, typ, von);
    }
    await this.postAufgaben(post.id, von);
    protokoll.modul('ablage').info('Post zugeordnet', { post: post.id, ziel: ziel.id, dokumente: n, kopiert: kopieren, aufloesenGesperrt: hinweis ? true : undefined });
    return { post: (await this.repo.holeMappe(post.id))!, ziel: (await this.repo.holeMappe(ziel.id))!, aufgeloest: false as const, ...(hinweis ? { hinweis } : {}) };
  }

  /** Mappentypen mit „Post automatisch zuordnen“ (#337); Archivmodus- und Systemtypen nie (dort nur mit Bestätigung). */
  private async autoTypen(): Promise<Set<string>> {
    const e = await this.typErkennungen();
    return new Set((await this.repo.listeTypen()).filter((t) => e[t.id]?.auto && !t.archiv && !t.system).map((t) => t.id));
  }

  /**
   * Erkannte Post automatisch zuordnen (#337), wenn die Erkennung sicher ist (siehe sichereZuordnung) und der
   * Zieltyp das erlaubt (Standard aus). Nie: neue Mappen anlegen, Post ohne Leserecht des Empfängers zuordnen,
   * Archivmodus-Typen. Danach eine Aufgabe „Automatisch zugeordnet – bitte prüfen“ an den Empfänger (Feld „Für“,
   * sonst wer die Post ins DMS gebracht hat), mit Rückgängig. Je Post höchstens einmal.
   */
  async automatischZuordnen(postId: string, e: PostErkennung): Promise<{ ziel: string } | { nicht: string }> {
    const log = protokoll.modul('ablage');
    if (e.auto) return { nicht: t('meldungen.dienst.schon-einmal-automatisch-zugeordnet') };
    const autoTypen = await this.autoTypen();
    if (!autoTypen.size) return { nicht: t('meldungen.dienst.bei-keinem-mappentyp-eingeschaltet') };
    const post = await this.repo.holeMappe(postId);
    const typ = post && await this.repo.holeTyp(post.typId);
    if (!post || typ?.system !== 'post') return { nicht: t('meldungen.dienst.keine-post') };
    if (auswahlText(post.werte.stand) !== POST_STAND.neu || auswahlText(post.werte.richtung) === POST_RICHTUNG.ausgehend) return { nicht: t('meldungen.dienst.nicht-neu-oder-ausgehend') };
    const s = this.sichereZuordnung(e, autoTypen);
    const nicht = (grund: string) => { log.info('Post nicht automatisch zugeordnet', { post: postId, grund }); return { nicht: grund }; };
    if (!s.ziel) return nicht(s.grund);
    const empfaenger = alsListe(post.werte.an)[0] ?? post.erstelltVon;
    if (!empfaenger) return nicht(t('meldungen.dienst.niemand-der-es-pruefen'));
    if (!(await this.sichtbarFuer(empfaenger, [s.ziel.mappeId])).has(s.ziel.mappeId)) return nicht(t('meldungen.dienst.der-empfaenger-darf-die'));
    const ziel = await this.repo.holeMappe(s.ziel.mappeId);
    const zielTyp = ziel && await this.repo.holeTyp(ziel.typId);
    if (!ziel || !zielTyp || zielTyp.archiv) return nicht(t('meldungen.dienst.zielmappe-fehlt-oder-ist'));
    const dokumente = await this.repo.listeDokumente(post.id);
    if (dokumente.length && !zielTyp.register.some((r) => r.art === 'dokumente')) return nicht(t('meldungen.dienst.zielmappe-hat-kein'));
    const absender = (await this.repo.bezuege([e.eindeutig!])).get(e.eindeutig!)?.titel ?? '';
    const grund = s.grund.replace('Absender eindeutig', `Absender „${absender}“ eindeutig`);
    const zielTitel = await this.titel(ziel);
    let aufgabe: Aufgabe | null = null;
    await this.inTransaktion(async () => {
      await this.ordneZu(post.id, { ziel: ziel.id }, null, undefined, { grund });
      aufgabe = await this.neueAufgabe({
        id: randomUUID(), mappeId: post.id, empfaengerId: empfaenger, art: 'zugeordnet', text: t('meldungen.dienst.automatisch-zugeordnet-zu-bitte', { zielTitel }), feldKey: `auto:${ziel.id}`,
        erstellt: new Date().toISOString(), erstelltVon: null, erledigt: null, erledigtVon: null,
      });
      aufgabe = await this.leiteUm(aufgabe);
      await this.repo.erkennungSchreibe(post.id, { ...e, auto: { ziel: ziel.id, zeit: new Date().toISOString(), grund, dokumente: dokumente.map((d) => ({ id: d.id, register: d.registerKey })), aufgabe: aufgabe.id } }, e.eindeutig);
    });
    log.info('Post automatisch zugeordnet', { post: post.id, ziel: ziel.id, empfaenger, dokumente: dokumente.length });
    return { ziel: ziel.id };
  }

  /**
   * Rückgängig aus der Aufgabe „Automatisch zugeordnet – bitte prüfen“ (#337): Dokumente zurück in die Post (in ihr
   * altes Register), Verweis weg, Stand wieder „Neu“ (wenn sie sonst nirgends zugeordnet ist), Aufgabe erledigt.
   * Danach ordnet die Erkennung diese Post nie wieder von selbst zu.
   */
  async automatikRueckgaengig(aufgabeId: string, ich: { id: string; rolle: string }, z?: Zugriff) {
    const a = await this.eigeneAufgabe(aufgabeId, ich);
    if (a.art !== 'zugeordnet' || a.erledigt) throw new Fachfehler(409, t('meldungen.dienst.diese-aufgabe-gehoert-zu'));
    const post = await this.pruefeRecht(z, a.mappeId, 'U');
    const typ = (await this.repo.holeTyp(post.typId))!;
    const gespeichert = (await this.repo.erkennungLies(post.id))?.ergebnis as PostErkennung | undefined;
    const auto = gespeichert?.auto;
    if (!gespeichert || !auto || auto.rueckgaengig) throw new Fachfehler(409, t('meldungen.dienst.diese-automatische-zuordnung-ist'));
    const ziel = await this.repo.holeMappe(auto.ziel);
    let zurueck = 0;
    await this.inTransaktion(async () => {
      for (const x of auto.dokumente) {
        const d = await this.repo.holeDokument(x.id);
        if (!d || d.mappeId !== auto.ziel) continue;
        const reg = typ.register.find((r) => r.key === x.register && r.art === 'dokumente') ?? typ.register.find((r) => r.art === 'dokumente');
        if (!reg) continue;
        await this.repo.verschiebeDokument(d.id, post.id, reg.key);
        zurueck++;
      }
      const bezug = alsListe(post.werte.bezug).filter((id) => id !== auto.ziel);
      await this.schreibeSystemMappe(typ, post.id, { bezug, stand: bezug.length ? post.werte.stand : POST_STAND.neu }, ich.id);
      const zielTitel = ziel ? await this.titel(ziel) : t('meldungen.dienst.eine-geloeschte-mappe');
      const doks = zurueck ? t('meldungen.dienst.dokumente-zurueck-in-der', { anzahl: zurueck }) : '';
      await this.notiere(post.id, ich.id, 'zugeordnet', { text: t('meldungen.dienst.automatische-zuordnung-zu', { zielTitel, doks }), ziel: auto.ziel, rueckgaengig: true, dokumente: zurueck });
      if (ziel) await this.notiere(ziel.id, ich.id, 'zugeordnet', { text: t('meldungen.dienst.automatische-zuordnung-der-post', { wert: auswahlText(post.werte.betreff) || t('meldungen.dienst.post'), doks }), post: post.id, rueckgaengig: true, dokumente: zurueck });
      await this.repo.erledigeAufgabe(a.id, ich.id);
      await this.repo.erkennungSchreibe(post.id, { ...gespeichert, auto: { ...auto, rueckgaengig: { zeit: new Date().toISOString(), von: ich.id } } }, gespeichert.eindeutig);
      await this.postAufgaben(post.id, ich.id);
    });
    protokoll.modul('ablage').info('Automatische Zuordnung rückgängig gemacht', { post: post.id, ziel: auto.ziel, dokumente: zurueck });
    return { post: (await this.repo.holeMappe(post.id))!, dokumente: zurueck };
  }

  /**
   * „An“ (#192, bis #1042 „Für“): Solange Post neu ist und einem Benutzer gilt, hat dieser eine Aufgabe „Post für dich“
   * unter „Zu erledigen“ (bei Abwesenheit sein Vertreter). Nur ein Benutzer bekommt sie – zeigt „an“ auf etwas anderes,
   * entsteht keine. Zugeordnet, erledigt oder an jemand anderen → die Aufgabe ist erledigt.
   */
  async postAufgaben(mappeId: string, von: string | null) {
    const m = await this.repo.holeMappe(mappeId);
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).filter((a) => a.art === 'post');
    const an = m && auswahlText(m.werte.stand) === POST_STAND.neu ? alsListe(m.werte.an)[0] ?? null : null;
    // Schlüssel der Aufgabe: an:<Benutzer> (bis #1042 fuer:<Benutzer>, Migration 099 zieht offene um).
    const schluessel = an ? `an:${an}` : null;
    for (const a of offen) if (a.feldKey !== schluessel) await this.repo.erledigeAufgabe(a.id, von);
    // Aufgaben mit Anlass „Post“ (#724, z. B. aus „Wenn neue Post“): erledigt, sobald die Post nicht mehr neu ist.
    if (m && auswahlText(m.werte.stand) !== POST_STAND.neu) await this.erledigeNachAnlass(mappeId, (x) => x.art === 'post', t('meldungen.dienst.post-zugeordnet-2'));
    if (!an || offen.some((a) => a.feldKey === schluessel)) return;
    // Aufgaben gehen an Konten; ohne Kontenverwaltung (Tests) genügt der Verweis.
    if (this.konten?.benutzer && !(await this.konten.benutzer()).some((b) => b.id === an)) return;
    const a = await this.neueAufgabe({
      id: randomUUID(), mappeId, empfaengerId: an, art: 'post', text: t('meldungen.dienst.post-fuer-dich'), feldKey: schluessel,
      erstellt: new Date().toISOString(), erstelltVon: von, erledigt: null, erledigtVon: null,
    });
    await this.leiteUm(a);
  }
}
