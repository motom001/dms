/**
 * Ausgang (#394, #631, #715, #722, #723, #799, #1077 aus dienst.ts): die gemeinsame Prüfstelle für alle Wege nach
 * draußen (Lesen und Exportrecht, `pruefstelle.ts`), welcher Stempel gilt, Weitergabe in der Historie, Original oder
 * Archivfassung, Dokument und Fassung zum Herunterladen, Laufwerk und Seitenbilder über die API. Schicht 3 – bekommt
 * den Kern, die Rechteprüfung, Mappentypen, Mappen, Dokumente, Sichten und die Stempel-Vorlagen, nicht den ganzen Dienst.
 */
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { type Ausgabe, fuerAusgabe, weitergabeWas } from '../ausgabe';
import type { DokumentArchivfassung, DokumentUmwandlung, DokumentVersionen } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import type { MappenHistorie } from '../mappen';
import type { MappentypenDienst } from '../mappentypen';
import type { Stempelvorlagen } from '../pdf-bearbeiten/stempelvorlagen';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import type { SichtenVerwaltung } from '../sichten';
import { t } from '../sprache';
import { stufeAus } from '../verkleinern';
import type { ZugriffDienst } from '../zugriff';
import { archivfassungName } from '../../../shared/src/archivfassung';
import { type FassungInfo, kernTyp } from '../../../shared/src/dateiumwandlung';
import type { Dokument, Mappe, Mappentyp } from '../../../shared/src/model';
import { klauselnFuer, type Sicht } from '../../../shared/src/sichten';
import { alleSichtRechte } from '../../../shared/src/sichtrechte';
import { type GeltenderStempel, geltenderStempel, stempelDatum, StempelFehler, type StempelWunsch, wunschAus } from '../../../shared/src/stempel';
import { type Ausgang, type Ausgangsrechte, mitnehmbar, pruefeAlle } from './pruefstelle';

/** Empfänger aus Abfrageparametern (API v1) – gilt auch für den Pflicht-Stempel ohne eigenen Wunsch (#799). */
const empfaengerAus = (q: unknown) => { const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>; const e = o.empfaenger ?? o['empfänger']; const s = Array.isArray(e) ? e[0] : e; return typeof s === 'string' ? s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120) : ''; };

/** Die Teile, die der Ausgang ruft: Rechteprüfung, Mappentypen, Historie, Dokumente, Sichten, Stempel-Vorlagen. */
export interface AusgangTeile {
  rechte: ZugriffDienst; mappentypen: MappentypenDienst; historie: MappenHistorie; versionen: DokumentVersionen;
  umwandlung: DokumentUmwandlung; archiv: DokumentArchivfassung; verwalten: SichtenVerwaltung; stempel: Stempelvorlagen;
}

/** Was der Ausgang außer dem Kern braucht – vom Dienst hereingereicht. */
export interface AusgangAnschluss {
  /** Inhalt der entsperrten Fassung (#827; geschützte PDFs, am Dienst). */
  entsperrtZu(inhalt: Buffer): Promise<Buffer | null>;
}

export class AusgangDienst {
  constructor(private readonly kern: Kern, private readonly teile: AusgangTeile, private readonly anschluss: AusgangAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private get umwandlung() { return this.teile.umwandlung.umwandlung; }
  private get archiv() { return this.teile.archiv.archiv; }
  private entsperrtZu = (inhalt: Buffer) => this.anschluss.entsperrtZu(inhalt);
  private lesbare(z: Zugriff | undefined, ids: string[]) { return this.teile.rechte.lesbare(z, ids); }
  private aufloesung(benutzerId: string) { return this.teile.rechte.aufloesung(benutzerId); }
  private verborgeneSichten(alle: Sicht[], z?: Zugriff) { return this.teile.verwalten.verborgeneSichten(alle, z); }
  private typErkennungen() { return this.teile.mappentypen.typErkennungen(); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private versionInhalt(id: string, nummer: number) { return this.teile.versionen.versionInhalt(id, nummer); }
  private fassungVon(id: string) { return this.teile.umwandlung.fassungVon(id); }
  private archivfassungVon(id: string) { return this.teile.archiv.archivfassungVon(id); }
  private stempelDaten() { return this.teile.stempel.stempelDaten(); }

  /** Dokumente mehrerer Mappen mit einem Zugriff je 500 Mappen (#367), je Mappe neueste zuerst. */
  async dokumenteJeMappe(ids: string[]): Promise<Map<string, Dokument[]>> {
    const r = new Map<string, Dokument[]>();
    for (let i = 0; i < ids.length; i += 500) {
      for (const d of await this.repo.dokumenteVon(ids.slice(i, i + 500))) { const l = r.get(d.mappeId); if (l) l.push(d); else r.set(d.mappeId, [d]); }
    }
    return r;
  }

  /**
   * Exportrecht ohne Sicht (#294, Regel A): welche dieser Mappen der Benutzer in mindestens einer Sicht
   * mit den Rechten R und E sehen würde (einschließlich Untersichten, ohne verborgene). Administratoren: alle.
   */
  async exportierbar(ich: { id: string; rolle: string }, z: Zugriff, ids: string[]): Promise<Set<string>> {
    if (z.admin) return new Set(ids);
    const alle = await this.repo.listeSichten();
    const rechte = alleSichtRechte(alle, z.wer, false);
    const verborgen = this.verborgeneSichten(alle, z);
    // Die Auflösung (Rollen, heute) hat der Zugriff desselben Benutzers schon (#615).
    const a = z.a && z.ich?.id === ich.id ? z.a : await this.aufloesung(ich.id);
    const klauseln = alle.filter((s) => rechte.get(s.id)?.R && rechte.get(s.id)?.E)
      .flatMap((s) => klauselnFuer(alle, s.id, z.typen, a, verborgen));
    return klauseln.length ? this.repo.inKlauseln(ids, klauseln) : new Set();
  }

  /** Lesen und Exportrecht für die Prüfstelle der Wege nach draußen (#723, `ausgang.ts`). */
  private ausgangsrechte(ich: { id: string; rolle: string }, z: Zugriff): Ausgangsrechte {
    return { lesbar: (ids) => this.lesbare(z, ids), exportierbar: (ids) => this.exportierbar(ich, z, ids) };
  }

  /** Welche dieser Mappen dürfen hinaus (Herunterladen, E-Mail, Export, Laufwerk)? Lesen und Exportrecht (#723). */
  async mitnehmbar(ich: { id: string; rolle: string }, z: Zugriff, ids: string[]): Promise<Set<string>> {
    return mitnehmbar(this.ausgangsrechte(ich, z), ids);
  }

  /** Gemeinsame Prüfstelle (#723): alle Mappen müssen über diesen Weg hinausdürfen, sonst 404 bzw. 403. */
  async pruefeAusgang(ich: { id: string; rolle: string }, z: Zugriff, ausgang: Ausgang, ids: string[]): Promise<void> {
    return pruefeAlle(this.ausgangsrechte(ich, z), ausgang, ids);
  }

  /** Mappentypen mit ihrer Stempel-Einstellung (für die Oberfläche). */
  async mitStempel<T extends Mappentyp>(typen: T[]): Promise<T[]> {
    const { typen: s } = await this.stempelDaten();
    const e = await this.typErkennungen();
    return typen.map((t) => ({ ...t, stempel: s[t.id] ?? null, ausDokument: e[t.id]?.ausDokument ?? null, autoZuordnen: !!e[t.id]?.auto }));
  }

  /** Welcher Stempel für eine Mappe dieses Typs gilt (Wunsch, Pflicht); Fehler als 422. */
  async stempelPlan(typId: string, wunsch: StempelWunsch | null, empfaengerErsatz = '', daten?: Awaited<ReturnType<Stempelvorlagen['stempelDaten']>>): Promise<GeltenderStempel | null> {
    const d = daten ?? await this.stempelDaten();
    try { return geltenderStempel(wunsch, d.typen[typId], d.vorlagen, empfaengerErsatz); } catch (x) {
      if (x instanceof StempelFehler) throw new Fachfehler(422, x.message, { stempel: true, pflicht: d.typen[typId]?.modus === 'pflicht' });
      throw x;
    }
  }

  /**
   * Stempel beim Lesen über das WebDAV-Laufwerk (#722): Der Pflicht-Stempel des Mappentyps gewinnt immer – auch wenn
   * die Einstellung des Laufwerks „aus“ ist. Sonst gilt die Vorlage der Einstellung (`vorlage`, null = aus; eine
   * gelöschte Vorlage wirkt wie „aus“). {empfänger} und {benutzer} sind der lesende Benutzer (`leser`).
   * `fehler`: Der Stempel lässt sich nicht bilden – bei Pflicht geht die Datei dann nicht hinaus.
   */
  async laufwerkStempel(typId: string, vorlage: string | null, leser: string): Promise<{ pflicht: boolean; plan: GeltenderStempel | null; fehler?: string }> {
    const d = await this.stempelDaten();
    const pflicht = d.typen[typId]?.modus === 'pflicht';
    const wunsch = !pflicht && vorlage && d.vorlagen.some((v) => v.id === vorlage) ? { vorlage } : null;
    if (!pflicht && !wunsch) return { pflicht, plan: null };
    try { return { pflicht, plan: await this.stempelPlan(typId, wunsch, leser, d) }; } catch (x) {
      if (x instanceof Fachfehler) return { pflicht, plan: null, fehler: x.message };
      throw x;
    }
  }

  /** Gestempelte Kopie eines Dokuments fürs Laufwerk (#722); das gespeicherte Original bleibt unverändert. */
  async laufwerkAusgabe(d: Dokument, m: Pick<Mappe, 'titel'>, plan: GeltenderStempel, leser: string): Promise<Ausgabe> {
    return fuerAusgabe({ name: d.name, mime: d.mime, inhalt: await this.liesGanz(d.sha256) }, { stempel: plan },
      { benutzer: leser, mappe: m.titel || t('meldungen.dienst.ohne-titel'), archivnummer: d.archivnummer ?? null, entsperrt: this.entsperrtZu });
  }

  liesGanz(sha256: string): Promise<Buffer> { return this.kern.liesGanz(sha256); }

  /** Historie (#394, #393): „weitergegeben mit Stempel ‚…‘, verkleinert (… → …) an …“. */
  async notiereWeitergabe(mappeId: string, von: string | null, wie: string, plan: GeltenderStempel | null, ausgaben: Ausgabe[]) {
    const bearbeitet = ausgaben.filter((a) => a.gestempelt || a.verkleinert);
    if (!bearbeitet.length) return;
    const text = bearbeitet.find((a) => a.stempeltext)?.stempeltext ?? null;
    const klein = bearbeitet.filter((a) => a.verkleinert);
    await this.notiere(mappeId, von, 'weitergegeben', {
      text: `${weitergabeWas(ausgaben)}${plan?.empfaenger ? t('meldungen.dienst.an-2', { empfaenger: plan.empfaenger }) : ''} (${wie}: ${bearbeitet.map((a) => a.name).join(', ')})`,
      stempel: text, an: plan?.empfaenger || null, wie, vorlage: plan?.vorlage ?? null, pflicht: plan?.pflicht ?? false, dokumente: bearbeitet.map((a) => a.name),
      ...(klein.length ? { verkleinert: { vorher: klein.reduce((s, a) => s + a.verkleinert!.vorher, 0), nachher: klein.reduce((s, a) => s + a.verkleinert!.nachher, 0) } } : {}),
    });
  }

  /**
   * Ein Dokument oder eine ältere Version herunterladen (#394): mit Stempel, wenn gewünscht (`stempel`,
   * aus Anfragekörper oder Abfrageparametern) oder vom Mappentyp verlangt. Ohne Stempel unverändert als Strom.
   */
  /**
   * Archivfassung für mehrere Dokumente (#715: E-Mail mehrerer Mappen, Export): mit `fassung` = „archiv“ tritt an die
   * Stelle jedes Dokuments mit Archivfassung (keine E-Rechnung) ein Dokument mit Name, Typ und Größe der Fassung;
   * die übrigen bleiben Original – ohne Rückfrage. `lies`/`strom` lesen dann die richtige Datei.
   */
  async archivWahl(fassung: unknown) {
    if (fassung !== undefined && fassung !== null && fassung !== 'original' && fassung !== 'archiv') throw new Fachfehler(422, t('meldungen.dienst.fassung-kennt-nur-original'));
    const original = new Map<string, Dokument>();
    const waehle = async (d: Dokument): Promise<Dokument> => {
      if (fassung !== 'archiv') return d;
      const q = await this.ausgabeQuelle(d, 'archiv', true);
      if (!q.archiv) return d;
      original.set(d.id, d);
      return { ...d, name: q.name, mime: q.mime, groesse: q.groesse };
    };
    const lies = async (d: Dokument): Promise<Buffer> => (original.has(d.id) ? (await this.ausgabeQuelle(original.get(d.id)!, 'archiv', true)).inhalt() : this.liesGanz(d.sha256));
    const strom = async (d: Dokument): Promise<Buffer | Readable> => (original.has(d.id) ? lies(d) : this.dateien.lies(d.sha256) as Promise<Buffer | Readable>);
    return { waehle, lies, strom, anzahl: () => original.size, archiv: (d: Dokument) => original.has(d.id) };
  }

  /**
   * Archivfassung statt Original weitergeben (#631): `fassung` = „archiv“ nimmt die aktuelle Archivfassung des
   * Dokuments (gibt es keine, 404), sonst das Original. `nurWo` (mehrere Dokumente): ohne Archivfassung und bei
   * E-Rechnungen das Original, ohne Fehler.
   */
  async ausgabeQuelle(d: Pick<Dokument, 'name' | 'mime' | 'sha256' | 'groesse' | 'anzeigbar'>, fassung: unknown, nurWo = false): Promise<{ name: string; mime: string; sha256: string; groesse: number; anzeigbar: boolean; inhalt: () => Promise<Buffer>; archiv: boolean }> {
    const original = { name: d.name, mime: d.mime, sha256: d.sha256, groesse: d.groesse, anzeigbar: d.anzeigbar, inhalt: () => this.liesGanz(d.sha256), archiv: false };
    if (fassung === undefined || fassung === null || fassung === 'original') return original;
    if (fassung !== 'archiv') throw new Fachfehler(422, t('meldungen.dienst.fassung-kennt-nur-original'));
    const f = await this.archiv?.lies(d.sha256);
    if (!f || (nurWo && f.info.erechnung)) { if (nurWo) return original; throw new Fachfehler(404, t('pakete.archiv.keine')); }
    return { name: archivfassungName(d.name), mime: 'application/pdf', sha256: f.info.sha256, groesse: f.inhalt.length, anzeigbar: true, inhalt: async () => f.inhalt, archiv: true };
  }

  async dokumentFuerAusgabe(id: string, o: { version?: number; stempel?: unknown; verkleinern?: unknown; fassung?: unknown; ich: { id: string | null; name: string } }) {
    const dokument = await this.repo.holeDokument(id);
    if (!dokument) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const datei = o.version != null ? (await this.versionInhalt(id, o.version)).version : await this.ausgabeQuelle(dokument, o.fassung);
    const m = await this.repo.holeMappe(dokument.mappeId);
    const plan = m ? await this.stempelPlan(m.typId, wunschAus(o.stempel), empfaengerAus(o.stempel)) : null;
    // Verkleinert herunterladen (#393): nur PDFs; das gespeicherte Dokument bleibt, wie es ist.
    const klein = stufeAus(o.verkleinern);
    if (klein && datei.mime !== 'application/pdf' && !plan) throw new Fachfehler(422, t('meldungen.dienst.ist-kein-pdf-verkleinern', { name: datei.name }));
    const lies = async () => ('archiv' in datei && datei.archiv ? datei.inhalt() : this.liesGanz(datei.sha256));
    if (!plan && !klein) return { name: datei.name, mime: datei.mime, anzeigbar: datei.anzeigbar, groesse: datei.groesse, inhalt: ('archiv' in datei && datei.archiv ? await datei.inhalt() : await this.dateien.lies(datei.sha256)) as Buffer | Readable, gestempelt: false };
    const a = await fuerAusgabe({ name: datei.name, mime: datei.mime, inhalt: await lies() }, { stempel: plan, verkleinern: klein },
      { benutzer: o.ich.name, mappe: m!.titel || t('meldungen.dienst.ohne-titel'), archivnummer: dokument.archivnummer, entsperrt: this.entsperrtZu }, true);
    await this.notiereWeitergabe(m!.id, o.ich.id, o.version != null ? t('meldungen.dienst.heruntergeladen-version', { version: o.version }) : 'archiv' in datei && datei.archiv ? t('meldungen.dienst.heruntergeladen-archivfassung') : 'heruntergeladen', plan, [a]);
    if (plan) protokoll.modul('dokumente').info('Dokument mit Stempel heruntergeladen', { id, mappe: m!.id, pflicht: plan.pflicht });
    if (a.verkleinert) protokoll.modul('dokumente').info('Dokument verkleinert heruntergeladen', { id, mappe: m!.id, vorher: a.verkleinert.vorher, nachher: a.verkleinert.nachher });
    return { name: a.name, mime: a.mime, anzeigbar: true, groesse: a.inhalt.length, inhalt: a.inhalt as Buffer | Readable, gestempelt: !!a.gestempelt, verkleinert: a.verkleinert ?? null };
  }

  /**
   * Abruf mit API-Schlüssel ist Herausgeben (#799): die Archivfassung (#631) oder die umgewandelte Fassung (#577) mit
   * dem Stempel, den der Abruf wünscht oder der Mappentyp verlangt – auf den Seiten des Dokuments selbst, ohne eigenes
   * Deckblatt. Die gespeicherte Fassung bleibt unverändert. Ohne geltenden Stempel `null`: Dann geht die Fassung so
   * hinaus, wie sie gespeichert ist.
   */
  async fassungFuerAusgabe(id: string, art: 'archiv' | 'umgewandelt', o: { stempel?: unknown; ich: { id: string | null; name: string } }) {
    const f = art === 'archiv' ? await this.archivfassungVon(id) : await this.fassungVon(id);
    const m = await this.repo.holeMappe(f.d.mappeId);
    const wunsch = wunschAus(o.stempel);
    const plan = m ? await this.stempelPlan(m.typId, wunsch, empfaengerAus(o.stempel)) : null;
    if (!plan) return null;
    const punkt = f.d.name.lastIndexOf('.');
    const name = art === 'archiv' ? ((f.info as { imOriginal?: boolean }).imOriginal ? f.d.name : archivfassungName(f.d.name)) : `${punkt > 0 ? f.d.name.slice(0, punkt) : f.d.name} (umgewandelt).pdf`;
    const mime = art === 'archiv' ? 'application/pdf' : (f.info as FassungInfo).mime;
    const a = await fuerAusgabe({ name, mime, inhalt: f.inhalt }, { stempel: plan }, { benutzer: o.ich.name, mappe: m!.titel || t('meldungen.dienst.ohne-titel'), archivnummer: f.d.archivnummer ?? null }, true);
    await this.notiereWeitergabe(m!.id, o.ich.id, art === 'archiv' ? t('meldungen.dienst.ueber-die-api-archivfassung') : t('meldungen.dienst.ueber-die-api-umgewandelte'), plan, [a]);
    protokoll.modul('dokumente').info('Fassung mit Stempel über die API ausgegeben', { id, mappe: m!.id, art, pflicht: plan.pflicht });
    return a;
  }

  /** Gestempelte Kopien für Seitenbilder über die API (#799), kurz im Arbeitsspeicher: Seite für Seite wird nur einmal gestempelt. */
  private readonly apiKopien = new Map<string, Promise<Buffer>>();

  /**
   * Seitenbilder bei einem Abruf mit API-Schlüssel (#799): Gilt ein Stempel (Pflicht des Mappentyps oder gewünscht),
   * entstehen die Bilder aus der gestempelten Kopie – als PDF, auch bei Bildern und umgewandelten Dateien. Ohne
   * Stempel `null` (dann die üblichen Seitenbilder). Die Weitergabe steht einmal je Kopie in der Historie.
   */
  async gestempelteSeiten(id: string, o: { stempel?: unknown; ich: { id: string | null; name: string } }): Promise<{ schluessel: string; pdf: Buffer } | null> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const m = await this.repo.holeMappe(d.mappeId);
    if (!m) return null;
    const wunsch = wunschAus(o.stempel);
    const plan = await this.stempelPlan(m.typId, wunsch, empfaengerAus(o.stempel));
    if (!plan) return null;
    const kontext = { benutzer: o.ich.name, mappe: m.titel || t('meldungen.dienst.ohne-titel'), archivnummer: d.archivnummer ?? null, datum: stempelDatum() };
    const schluessel = `stempel:${d.sha256}:${createHash('sha256').update(JSON.stringify([plan, kontext])).digest('hex')}`;
    let p = this.apiKopien.get(schluessel);
    if (!p) {
      p = (async () => {
        let quelle: { name: string; mime: string; inhalt: Buffer };
        if (kernTyp(d.mime)) quelle = { name: d.name, mime: d.mime, inhalt: await this.liesGanz(d.sha256) };
        else {
          const f = await this.umwandlung?.lies(d.sha256);
          if (!f) throw new Fachfehler(422, t('meldungen.dienst.ist-weder-pdf-noch', { name: d.name }));
          quelle = { name: d.name, mime: f.info.mime, inhalt: f.inhalt };
        }
        const a = await fuerAusgabe(quelle, { stempel: plan }, kontext, true);
        await this.notiereWeitergabe(m.id, o.ich.id, t('meldungen.dienst.ueber-die-api-seitenbilder'), plan, [a]);
        return a.inhalt;
      })();
      this.apiKopien.set(schluessel, p);
      p.catch(() => this.apiKopien.delete(schluessel));
      while (this.apiKopien.size > 8) this.apiKopien.delete(this.apiKopien.keys().next().value!);
    }
    return { schluessel, pdf: await p };
  }
}
