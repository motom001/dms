/**
 * E-Mail aus der Ablage (#58, #151, #723, #1077 aus dienst.ts): eine oder mehrere Mappen per E-Mail, mit Angaben-PDF,
 * Stempel, Verkleinern und Archivfassung; danach eine Post (Kanal E-Mail, ausgehend, erledigt) und Einträge in der
 * Historie. Schicht 3 – bekommt den Kern, die Rechteprüfung, Mappen, Dokumente, den Ausgang, die Stempel-Vorlagen und
 * die Systemmappen der Post. Die Prüfstelle (`pruefeAusgang`) ruft er über seinen Anschluss.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { type Ausgabe, fuerAusgabe, weitergabeWas } from '../ausgabe';
import type { DokumenteDienst } from '../dokumente';
import { eindeutig, mappenPdf, sichererName } from '../export';
import { Fachfehler } from '../fehler';
import { EMAIL_MAX_ANHAENGE } from '../grenzen';
import type { Kern, Zugriff } from '../kern';
import type { Mailer } from '../mail';
import type { MappenHistorie } from '../mappen';
import type { Stempelvorlagen } from '../pdf-bearbeiten';
import type { PostSystemmappen } from '../post';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import { stufeAus } from '../verkleinern';
import { NICHT_SICHTBAR, type ZugriffDienst } from '../zugriff';
import { type Dokument, istEmail, type Mappe, type Mappentyp, NOTIZ_MAX, POST_KANAL, POST_RICHTUNG, POST_STAND, verweiseVon } from '../../../shared/src/model';
import { heuteIn } from '../../../shared/src/sichten';
import { type GeltenderStempel, wunschAus } from '../../../shared/src/stempel';
import type { AusgangDienst } from './ausgang.dienst';
import { inReihenfolge } from './export';
import type { Ausgang } from './pruefstelle';

/** Ein Anhang einer E-Mail (#723): Dokument (oder das PDF „Angaben“, dann ohne Dokument) und was hinausgeht. */
interface Versandanhang {
  dokument: Dokument | null; name: string; mime: string; groesse: number;
  /** Bearbeitet (Stempel, verkleinert) oder Archivfassung: liegt als eigene Datei in der Post. */
  ausgabe: Ausgabe | null;
  inhalt(): Promise<Buffer | Readable>;
}
/** Alles, was von einer Mappe per E-Mail hinausgeht. `ausgaben`: die bearbeiteten (für Historie und Hinweise). */
interface Versandteil { m: Mappe; plan: GeltenderStempel | null; angaben: Versandanhang | null; dokumente: Versandanhang[]; ausgaben: Ausgabe[]; groesse: number }

export const EMAIL_MAX_EMPFAENGER = 20;
/** Höchstens so viele Mappen in einer E-Mail (#151). */
export const EMAIL_MAX_MAPPEN = 100;

/** Die Teile, die die E-Mail ruft: Rechteprüfung, Historie, Dokumente, Ausgang, Stempel-Vorlagen, Systemmappen. */
export interface EmailTeile { rechte: ZugriffDienst; historie: MappenHistorie; dokumente: DokumenteDienst; ausgang: AusgangDienst; stempel: Stempelvorlagen; systemmappen: PostSystemmappen }

/** Was die E-Mail außer dem Kern braucht – vom Dienst hereingereicht. */
export interface EmailAnschluss {
  /** Die gemeinsame Prüfstelle (#723) – über den Anschluss (`dienst.ausgang.pruefeAusgang`), damit jeder Weg dieselbe Stelle fragt. */
  pruefeAusgang(ich: { id: string; rolle: string }, z: Zugriff, ausgang: Ausgang, ids: string[]): Promise<void>;
  /** Inhalt der entsperrten Fassung (#827; geschützte PDFs, am Dienst). */
  entsperrtZu(inhalt: Buffer): Promise<Buffer | null>;
}

export class AusgangEmail {
  constructor(private readonly kern: Kern, private readonly teile: EmailTeile, private readonly anschluss: EmailAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private entsperrtZu = (inhalt: Buffer) => this.anschluss.entsperrtZu(inhalt);
  private pruefeAusgang(...a: Parameters<EmailAnschluss['pruefeAusgang']>) { return this.anschluss.pruefeAusgang(...a); }
  private maskiereBezuege(...a: Parameters<ZugriffDienst['maskiereBezuege']>) { return this.teile.rechte.maskiereBezuege(...a); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private neueDateien(docs: Dokument[]) { this.teile.dokumente.neueDateien(docs); }
  private dokumenteJeMappe(ids: string[]) { return this.teile.ausgang.dokumenteJeMappe(ids); }
  private ausgabeQuelle(...a: Parameters<AusgangDienst['ausgabeQuelle']>) { return this.teile.ausgang.ausgabeQuelle(...a); }
  private stempelPlan(...a: Parameters<AusgangDienst['stempelPlan']>) { return this.teile.ausgang.stempelPlan(...a); }
  private liesGanz(sha256: string) { return this.teile.ausgang.liesGanz(sha256); }
  private stempelDaten() { return this.teile.stempel.stempelDaten(); }
  private schreibeSystemMappe(...a: Parameters<PostSystemmappen['schreibeSystemMappe']>) { return this.teile.systemmappen.schreibeSystemMappe(...a); }

  /**
   * Verschickt eine E-Mail mit ausgewählten Dokumenten der Mappe. Absender ist das DMS,
   * „Antworten an“ der Benutzer. Danach gibt es eine Post-Mappe (#192: Kanal E-Mail, ausgehend,
   * erledigt, zugeordnet zur Mappe) mit den Anhängen (dieselbe Datei, kein zweiter Speicherplatz)
   * und einen Eintrag im Protokoll.
   */
  /** Empfänger, Betreff und Nachricht einer E-Mail prüfen (#58, #151). */
  static emailKopf(e: Record<string, unknown>) {
    const an = [...new Set(String(e.an ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))];
    const betreff = String(e.betreff ?? '').replace(/[\r\n]+/g, ' ').trim();
    const nachricht = String(e.nachricht ?? '');
    const fehler: Record<string, string> = {};
    if (!an.length) fehler.an = t('meldungen.dienst.mindestens-einen-empfaenger-angeben');
    else if (an.length > EMAIL_MAX_EMPFAENGER) fehler.an = t('meldungen.dienst.hoechstens-empfaenger', { EMAIL_MAX_EMPFAENGER });
    else if (an.some((x) => !istEmail(x))) fehler.an = t('meldungen.dienst.keine-gueltige-adresse', { filter: an.filter((x) => !istEmail(x)).join(', ') });
    if (!betreff) fehler.betreff = t('meldungen.dienst.der-betreff-fehlt');
    else if (betreff.length > 250) fehler.betreff = t('meldungen.dienst.der-betreff-ist-zu');
    if (nachricht.length > NOTIZ_MAX) fehler.nachricht = t('meldungen.dienst.die-nachricht-ist-zu');
    if (Object.keys(fehler).length) throw new Fachfehler(422, Object.values(fehler).join(' '), { felder: fehler });
    return { an, betreff, nachricht };
  }

  /**
   * Mehrere Mappen per E-Mail (#151): eine E-Mail an alle Empfänger. Anhänge: je Mappe ihre Angaben als
   * PDF („Titel.pdf“, wenn `angaben`) und die gewählten Dokumente (`dokumente`: „alle“ oder Ids).
   * Rechte: Lesen und Versenden (Recht E einer Ansicht, Regel A wie beim Export) je Mappe – über die gemeinsame
   * Prüfstelle (#723). Anhänge wie bei einer Mappe (`versandTeil`). Danach eine Post (Kanal E-Mail, ausgehend,
   * erledigt), die auf alle Mappen verweist, und je Mappe ein Eintrag in der Historie.
   */
  async versendeMappen(eingabe: unknown, ich: { id: string; name: string; email: string; rolle: string }, z: Zugriff, mailer: Mailer | null) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = [...new Set((Array.isArray(e.ids) ? e.ids : []).map(String).filter(istUuid))];
    if (!ids.length) throw new Fachfehler(422, t('meldungen.dienst.keine-mappen-ausgewaehlt'));
    if (ids.length > EMAIL_MAX_MAPPEN) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-mappen-in-einer', { EMAIL_MAX_MAPPEN }));
    const { an, betreff, nachricht } = AusgangEmail.emailKopf(e);
    AusgangEmail.pruefeFassungswahl(e);
    // Rechte (#723, gemeinsame Prüfstelle): jede Mappe lesbar und versendbar – sonst nichts verschicken (keine stillen Lücken).
    await this.pruefeAusgang(ich, z, 'email', ids);
    if (!mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand'));
    const mappen = inReihenfolge(await this.repo.holeMappen(ids), ids);
    if (mappen.length !== ids.length) throw new Fachfehler(404, t('meldungen.dienst.eine-ausgewaehlte-mappe-gibt'));
    const angaben = e.angaben !== false;
    const gewaehlt = e.dokumente === 'alle' ? null : new Set((Array.isArray(e.dokumente) ? e.dokumente : []).map(String));
    const dokJe = await this.dokumenteJeMappe(mappen.map((m) => m.id));
    if (gewaehlt) {
      const bekannt = new Set(mappen.flatMap((m) => (dokJe.get(m.id) ?? []).map((d) => d.id)));
      if ([...gewaehlt].some((id) => !bekannt.has(id))) throw new Fachfehler(422, t('meldungen.dienst.ein-ausgewaehltes-dokument-gehoert'));
    }
    const quelle = angaben ? await this.angabenQuelle(z, mappen) : null;
    const stempelDaten = await this.stempelDaten();
    const je: Versandteil[] = [];
    for (const m of mappen) {
      // Anlagen (#998): „mit Anlagen?“ – Vorgabe ja; hinter jedem gewählten Hauptdokument seine Anlagen. Die
      // Original-E-Mail (#999) geht mit, außer `originalEmail: false` – bei „alle“ dann gar nicht.
      const alleDocs = dokJe.get(m.id) ?? [];
      const docs = gewaehlt ? this.teile.ausgang.mitAnlagen(alleDocs.filter((d) => gewaehlt.has(d.id)), alleDocs, e.mitAnlagen, e.originalEmail)
        : alleDocs.filter((d) => (e.mitAnlagen !== false || !d.anlageZu) && (e.originalEmail !== false || !d.originalEmail));
      je.push(await this.versandTeil(m, docs, { e, an, ich, quelle, stempelDaten }));
    }
    const groesse = je.reduce((a, x) => a + x.groesse, 0);
    if (groesse > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, t('meldungen.dienst.die-anhaenge-sind-zusammen', { round: Math.round(EMAIL_MAX_ANHAENGE / 1e6) }));
    const { namen, anhaenge } = await this.versandAnhaenge(je);
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge });
    } catch (x) {
      throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-wurde', { message: (x as Error).message }));
    }
    const { post: typ } = await this.kern.system();
    const id = randomUUID();
    await this.schreibeSystemMappe(typ, id, {
      betreff, an_adresse: an.join(', '), von: antwortAn.replace(/"/g, ''), datum: heuteIn(), bezug: ids, ...(nachricht.trim() ? { nachricht } : {}),
      kanal: POST_KANAL.email, richtung: POST_RICHTUNG.ausgehend, stand: POST_STAND.erledigt,
    }, ich.id);
    await this.legeVersandAb(typ, id, je, namen, ich.id);
    let i = 0;
    for (const x of je) {
      const teile = [...(x.angaben ? [x.angaben] : []), ...x.dokumente];
      const n = teile.length;
      const stempeltext = x.ausgaben.find((y) => y.stempeltext)?.stempeltext;
      const mitStempel = x.ausgaben.some((y) => y.gestempelt);
      const was = weitergabeWas(x.ausgaben);
      await this.notiere(x.m.id, ich.id, 'email', {
        text: t('meldungen.dienst.an-mit-mappen', { betreff, an: an.join(', '), mappen: mappen.length, wert: n ? t('meldungen.dienst.von-dieser-anhaenge', { anzahl: n }) : '', wert2: was ? `, ${was}` : '' }), email: id,
        an, betreff, nachricht: nachricht.slice(0, NOTIZ_MAX), mappen: mappen.length,
        anhaenge: teile.map((y) => ({ name: namen[i++], groesse: y.groesse })),
        ...(mitStempel ? { stempel: stempeltext ?? null, stempelAn: x.plan?.empfaenger ?? null } : {}),
      });
    }
    protokoll.modul('ablage').info('E-Mail mit mehreren Mappen verschickt', { mappen: mappen.length, empfaenger: an.length, anhaenge: anhaenge.length, bytes: groesse });
    return { id, typId: typ.id, mappen: mappen.length, anhaenge: anhaenge.length };
  }

  /** `fassung` und `fassungen` (je Dokument) kennen nur „original“ und „archiv“ – geprüft, bevor etwas geschieht. */
  private static pruefeFassungswahl(e: Record<string, unknown>) {
    const werte = [e.fassung, ...(e.fassungen && typeof e.fassungen === 'object' ? Object.values(e.fassungen) : [])];
    if (werte.some((v) => v !== undefined && v !== null && v !== 'original' && v !== 'archiv')) throw new Fachfehler(422, t('meldungen.dienst.fassung-kennt-nur-original'));
  }

  /** Typen und Titel der Verweise für das PDF „Angaben“ – mit `z` nur, was der Benutzer sehen darf. */
  private async angabenQuelle(z: Zugriff | undefined, mappen: Mappe[]): Promise<Parameters<typeof mappenPdf>[2]> {
    const typen = z?.typen ?? new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const verweise = mappen.flatMap((m) => { const t = typen.get(m.typId); return [...(t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v); });
    const bezuege = await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(verweise)]));
    return { typen, titel: (id: string | null | undefined) => (id ? bezuege[id]?.titel || NICHT_SICHTBAR : '') };
  }

  /**
   * Was von einer Mappe per E-Mail hinausgeht (#723: ein Weg für eine und mehrere Mappen). Für jedes Dokument gilt
   * dieselbe Wahl Original/Archivfassung (`fassungen` je Dokument, sonst `fassung` für alle; ohne Archivfassung
   * und bei E-Rechnungen das Original), derselbe Stempel (gewünscht oder Pflicht des Mappentyps) – auch auf dem
   * PDF „Angaben“ – und dasselbe Verkleinern. `groesse` zählt alles, was angehängt wird, das Angaben-PDF mit.
   */
  private async versandTeil(m: Mappe, docs: Dokument[], o: {
    e: Record<string, unknown>; an: string[]; ich: { name: string };
    /** Mit Angaben-PDF: Typen und Titel der Verweise; null = ohne. */
    quelle: Parameters<typeof mappenPdf>[2] | null;
    stempelDaten: Awaited<ReturnType<Stempelvorlagen['stempelDaten']>>;
  }): Promise<Versandteil> {
    const wahl = (o.e.fassungen && typeof o.e.fassungen === 'object' ? o.e.fassungen : {}) as Record<string, unknown>;
    const quellen = await Promise.all(docs.map((d) => this.ausgabeQuelle(d, wahl[d.id] ?? o.e.fassung, wahl[d.id] === undefined)));
    const pdf = o.quelle ? await mappenPdf(m.titel || t('meldungen.dienst.ohne-titel'), [{ mappe: m, typ: o.quelle.typen.get(m.typId), dokumente: [], inhalt: (d: Dokument) => this.liesGanz(d.sha256) }], o.quelle, null) : null;
    // Stempel (#394): gewünscht oder vom Mappentyp verlangt; {empfänger} sind ohne Angabe die Adressen.
    const plan = docs.length || pdf ? await this.stempelPlan(m.typId, wunschAus(o.e.stempel), o.an.join(', '), o.stempelDaten) : null;
    // Verkleinert senden (#393): PDFs als verkleinerte Kopie, vor dem Stempeln.
    const klein = stufeAus(o.e.verkleinern);
    const kontext = (d?: Dokument) => ({ benutzer: o.ich.name, mappe: m.titel || t('meldungen.dienst.ohne-titel'), archivnummer: d?.archivnummer ?? null, entsperrt: this.entsperrtZu });
    const bearbeiten = !!plan || (!!klein && docs.length > 0);
    const dokumente: Versandanhang[] = await Promise.all(quellen.map(async (q, i): Promise<Versandanhang> => {
      const d = docs[i];
      if (bearbeiten) {
        const roh = await fuerAusgabe({ name: q.name, mime: q.mime, inhalt: await q.inhalt() }, { stempel: plan, verkleinern: klein }, kontext(d));
        // Unverändert, aber Archivfassung: in der Post liegt dann die Fassung, nicht das Original.
        const a: Ausgabe = q.archiv && roh.unveraendert ? { ...roh, unveraendert: undefined } : roh;
        return { dokument: d, name: a.name, mime: a.mime, groesse: a.inhalt.length, ausgabe: a, inhalt: async () => a.inhalt };
      }
      if (q.archiv) {
        const b = await q.inhalt();
        return { dokument: d, name: q.name, mime: q.mime, groesse: b.length, ausgabe: { name: q.name, mime: q.mime, inhalt: b, stempeltext: null }, inhalt: async () => b };
      }
      return { dokument: d, name: d.name, mime: d.mime, groesse: d.groesse, ausgabe: null, inhalt: () => this.dateien.lies(d.sha256) as Promise<Buffer | Readable> };
    }));
    let angaben: Versandanhang | null = null;
    if (pdf) {
      const name = `${m.titel || t('meldungen.dienst.ohne-titel')}.pdf`;
      // Das PDF „Angaben“ geht ebenso hinaus: der Stempel (Pflicht oder gewünscht) gilt auch für es (#723).
      const a = plan ? await fuerAusgabe({ name, mime: 'application/pdf', inhalt: pdf }, { stempel: plan }, kontext()) : null;
      const b = a?.inhalt ?? pdf;
      angaben = { dokument: null, name, mime: 'application/pdf', groesse: b.length, ausgabe: a ?? { name, mime: 'application/pdf', inhalt: b, stempeltext: null }, inhalt: async () => b };
    }
    const ausgaben = [...(angaben?.ausgabe?.gestempelt ? [angaben.ausgabe] : []), ...dokumente.flatMap((x) => (x.ausgabe ? [x.ausgabe] : []))];
    const groesse = (angaben?.groesse ?? 0) + dokumente.reduce((s, x) => s + x.groesse, 0);
    return { m, plan, angaben, dokumente, ausgaben, groesse };
  }

  /** Anhänge der E-Mail mit eindeutigen Dateinamen: je Mappe erst „Titel.pdf“ der Angaben, dann die Dokumente. */
  private async versandAnhaenge(je: Versandteil[]) {
    const teile = je.flatMap((x) => [...(x.angaben ? [x.angaben] : []), ...x.dokumente]);
    const namen = eindeutig(teile.map((x) => sichererName(x.name, 120)));
    const anhaenge = await Promise.all(teile.map(async (x, i) => ({ name: namen[i], mime: x.mime, inhalt: await x.inhalt() })));
    return { namen, anhaenge };
  }

  /** In der Post liegt, was verschickt wurde: gestempelte Kopien und Fassungen als eigene Datei, sonst dieselbe Datei. */
  private async legeVersandAb(typ: Mappentyp, postId: string, je: Versandteil[], namen: string[], von: string) {
    const reg = typ.register.find((r) => r.art === 'dokumente');
    if (!reg) return;
    let i = 0;
    for (const x of je) {
      for (const y of [...(x.angaben ? [x.angaben] : []), ...x.dokumente]) {
        const name = namen[i++];
        if (y.dokument) { await this.legeVersandkopieAn(y.dokument, y.ausgabe ?? undefined, postId, reg.key, von, name); continue; }
        const inhalt = y.ausgabe!.inhalt;
        const sha256 = createHash('sha256').update(inhalt).digest('hex');
        await this.dateien.schreibe(sha256, inhalt);
        const neu = await this.repo.legeDokumentAn({ id: randomUUID(), mappeId: postId, registerKey: reg.key, name, mime: 'application/pdf', groesse: inhalt.length, sha256, anzeigbar: true, erstellt: new Date().toISOString(), erstelltVon: von, herkunft: 'hochgeladen' });
        this.neueDateien([neu]);
      }
    }
  }

  /** Kopie eines verschickten Dokuments in der Post: gestempelt als eigene Datei (#394), sonst dieselbe Datei. */
  private async legeVersandkopieAn(d: Dokument, a: Ausgabe | undefined, postId: string, registerKey: string, von: string, name?: string) {
    const jetzt = new Date().toISOString();
    if (!a || a.unveraendert) { await this.repo.legeDokumentAn({ ...d, id: randomUUID(), mappeId: postId, registerKey, name: name ?? d.name, erstellt: jetzt, erstelltVon: von }); return; }
    const sha256 = createHash('sha256').update(a.inhalt).digest('hex');
    await this.dateien.schreibe(sha256, a.inhalt);
    const neu = await this.repo.legeDokumentAn({ id: randomUUID(), mappeId: postId, registerKey, name: name ?? a.name, mime: a.mime, groesse: a.inhalt.length, sha256, anzeigbar: true, erstellt: jetzt, erstelltVon: von, herkunft: 'hochgeladen' });
    this.neueDateien([neu]);
  }

  /**
   * Eine Mappe per E-Mail (#58). Mit `z` prüft die gemeinsame Prüfstelle (#723) Lesen und Exportrecht, bevor
   * irgendetwas anderes geschieht. Anhänge wie bei mehreren Mappen (`versandTeil`): Archivfassung je Dokument
   * (`fassungen`) oder für alle (`fassung`), Stempel, Verkleinern; mit `angaben: true` auch das PDF „Angaben“.
   */
  async versendeMappe(mappeId: string, eingabe: unknown, ich: { id: string; name: string; email: string }, mailer: Mailer | null, z?: Zugriff) {
    if (z) await this.pruefeAusgang(z.ich, z, 'email', [mappeId]);
    if (!mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand'));
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const { an, betreff, nachricht } = AusgangEmail.emailKopf(e);
    AusgangEmail.pruefeFassungswahl(e);
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : [];
    const alle = await this.repo.listeDokumente(mappeId);
    const dokumente = ids.map((id) => alle.find((d) => d.id === id));
    if (dokumente.some((d) => !d)) throw new Fachfehler(422, t('meldungen.dienst.ein-ausgewaehltes-dokument-gehoert-2'));
    const quelle = e.angaben === true ? await this.angabenQuelle(z, [m]) : null;
    // Anlagen (#998): „mit Anlagen?“ – Vorgabe ja; hinter jedem gewählten Hauptdokument seine Anlagen; die
    // Original-E-Mail (#999) als Anlage nur ohne `originalEmail: false`.
    const teil = await this.versandTeil(m, this.teile.ausgang.mitAnlagen(dokumente as Dokument[], alle, e.mitAnlagen, e.originalEmail), { e, an, ich, quelle, stempelDaten: await this.stempelDaten() });
    if (teil.groesse > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, t('meldungen.dienst.die-anhaenge-sind-zusammen-2', { round: Math.round(EMAIL_MAX_ANHAENGE / 1e6) }));
    const { namen, anhaenge } = await this.versandAnhaenge([teil]);
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge });
    } catch (x) {
      throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-wurde', { message: (x as Error).message }));
    }
    const { post: typ } = await this.kern.system();
    const id = randomUUID();
    const datum = heuteIn();
    await this.schreibeSystemMappe(typ, id, {
      betreff, an_adresse: an.join(', '), von: antwortAn.replace(/"/g, ''), datum, bezug: [mappeId], ...(nachricht.trim() ? { nachricht } : {}),
      kanal: POST_KANAL.email, richtung: POST_RICHTUNG.ausgehend, stand: POST_STAND.erledigt,
    }, ich.id);
    await this.legeVersandAb(typ, id, [teil], namen, ich.id);
    const stempeltext = teil.ausgaben.find((x) => x.stempeltext)?.stempeltext;
    const mitStempel = teil.ausgaben.some((x) => x.gestempelt);
    const was = weitergabeWas(teil.ausgaben);
    const n = anhaenge.length;
    await this.notiere(mappeId, ich.id, 'email', { text: t('meldungen.dienst.an', { betreff, an: an.join(', '), wert: n ? t('meldungen.dienst.mit-anhaengen', { anzahl: n }) : '', wert2: was ? `, ${was}` : '' }), email: id,
      an, betreff, nachricht: nachricht.slice(0, NOTIZ_MAX), anhaenge: anhaenge.map((x, i) => ({ name: x.name, groesse: [...(teil.angaben ? [teil.angaben] : []), ...teil.dokumente][i].groesse })),
      ...(mitStempel ? { stempel: stempeltext ?? null, stempelAn: teil.plan?.empfaenger ?? null } : {}) });
    protokoll.modul('ablage').info('E-Mail aus Mappe verschickt', { mappe: mappeId, empfaenger: an.length, anhaenge: n, bytes: teil.groesse });
    return { id, typId: typ.id };
  }
}
