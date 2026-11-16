/**
 * Grundlage des WebDAV-Laufwerks (#1278, vorher in `webdav/webdav.ts`): Zustand, Einstellung in der Werkbank, Stempel
 * und Mitnehmen (#722, #723). `Webdav` ist eine Kette von Teil-Klassen, je Aufgabe eine Datei: basis → ordner →
 * methoden → webdav. Jede Teil-Klasse ruft nur, was unter ihr steht; die Rümpfe sind unverändert übernommen.
 */
import { createHash } from 'node:crypto';
import { Ratenbegrenzung, WEBDAV_PFAD } from './webdav-baum';
import {
  type WebdavZugriff,
  type WebdavEinstellung,
  type WebdavDeps,
  STANDARD_GRENZE,
  type WebdavStand,
  logKonto,
  type WebdavAnfrage,
  decodeURIComponentSicher,
  ZUGRIFFE,
  type Ctx,
  type Knoten,
  type Auslieferung,
  etagVon,
  etagGestempelt,
  log,
  stempelSpeicher,
  STEMPEL_EINTRAEGE,
} from './webdav-hilfen';
import { type Kurzzustand, speicherKurzzustand } from '../zwischenspeicher/kurzzustand';
import { WEBDAV_VORLAGE, kannStempeln, type GeltenderStempel, ersetzePlatzhalter } from '../../../shared/src/stempel';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { pdfName } from '../ausgang/ausgabe';
import { DateiFehlt } from '../dateien/dateispeicher';
import type { Dokument, Mappe } from '../../../shared/src/model';

/** Zustand, Werkbank, Stempel und Auslieferung. */
export abstract class WebdavBasis {
  protected grenze: Ratenbegrenzung;
  private zugriffe: WebdavZugriff[] = [];
  protected anfragen = 0;
  protected zustand: Kurzzustand;
  private cache: { wert: WebdavEinstellung; bis: number } | null = null;
  /** Laufende Uploads je Benutzer-Id (MAX_UPLOADS). */
  protected uploads = new Map<string, number>();
  /** Gestempelte Fassungen (#722) je Dokument, Inhalt und Stempel; `inhalt` fällt bei Platzmangel weg. */
  private gestempelt = new Map<string, { gestempelt: boolean; groesse: number; inhalt: Buffer | null }>();
  private stempelBytes = 0;
  protected jetzt: () => number;

  constructor(protected d: WebdavDeps) {
    this.jetzt = d.jetzt ?? Date.now;
    this.zustand = d.zustand ?? speicherKurzzustand(this.jetzt);
    this.grenze = new Ratenbegrenzung(d.grenze ?? STANDARD_GRENZE, this.jetzt, 60_000, this.zustand);
  }

  /* ---------- Werkbank ---------- */

  async einstellung(): Promise<WebdavEinstellung> {
    if (this.cache && this.cache.bis > this.jetzt()) return this.cache.wert;
    const roh = (await this.d.einstellungen.lies('webdav')) as Partial<WebdavEinstellung> | null;
    // Stempel (#722): ohne Angabe die mitgelieferte Vorlage (neue Installationen; bestehende über Migration 067).
    const stempel = roh && 'stempel' in roh ? (typeof roh.stempel === 'string' && roh.stempel ? roh.stempel : null) : WEBDAV_VORLAGE;
    const wert: WebdavEinstellung = { aktiv: roh?.aktiv === true, stempel, nurLesend: roh?.nurLesend === true };
    this.cache = { wert, bis: this.jetzt() + 5000 };
    return wert;
  }

  async speichere(e: unknown, von: string): Promise<WebdavStand> {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const hat = (k: string) => k in x && x[k] !== undefined;
    if (!hat('aktiv') && !hat('stempel') && !hat('nurLesend')) throw new Fachfehler(422, t('meldungen.webdav.aktiv-true-oder-false'));
    if (hat('aktiv') && typeof x.aktiv !== 'boolean') throw new Fachfehler(422, t('meldungen.webdav.aktiv-true-oder-false'));
    if (hat('nurLesend') && typeof x.nurLesend !== 'boolean') throw new Fachfehler(422, t('api.webdav.nur-lesend-ungueltig'));
    if (hat('stempel') && x.stempel !== null && typeof x.stempel !== 'string') throw new Fachfehler(422, t('api.webdav.stempel-ungueltig'));
    if (hat('stempel') && x.stempel && !(await this.d.dienst.stempelvorlagen.stempelVorlagen()).some((v) => v.id === x.stempel))
      throw new Fachfehler(422, t('api.webdav.vorlage-fehlt'));
    const vorher = await this.einstellung();
    const neu: WebdavEinstellung = {
      aktiv: hat('aktiv') ? (x.aktiv as boolean) : vorher.aktiv,
      stempel: hat('stempel') ? (x.stempel as string | null) || null : vorher.stempel,
      nurLesend: hat('nurLesend') ? (x.nurLesend as boolean) : vorher.nurLesend,
    };
    await this.d.einstellungen.schreibe('webdav', neu);
    this.cache = null;
    if (vorher.aktiv !== neu.aktiv)
      (neu.aktiv ? logKonto.warn : logKonto.info)(
        neu.aktiv ? t('meldungen.webdav.webdav-laufwerk-eingeschaltet') : t('meldungen.webdav.webdav-laufwerk-ausgeschaltet'),
        { von },
      );
    if (vorher.stempel !== neu.stempel)
      logKonto.info('WebDAV-Laufwerk: Stempel beim Lesen eingestellt', { vorlage: neu.stempel ?? 'aus', von });
    if (vorher.nurLesend !== neu.nurLesend)
      logKonto.info(neu.nurLesend ? 'WebDAV-Laufwerk nur lesend' : 'WebDAV-Laufwerk wieder mit Ablegen', { von });
    return this.stand();
  }

  async stand(): Promise<WebdavStand> {
    const basis = (this.d.adresse?.() ?? '').replace(/\/+$/, '');
    return {
      einstellung: await this.einstellung(),
      adresse: `${basis}${WEBDAV_PFAD}/`,
      https: basis.startsWith('https://'),
      grenze: this.grenze.grenze,
      anfragen: this.anfragen,
      zugriffe: [...this.zugriffe].reverse(),
      vorlagen: (await this.d.dienst.stempelvorlagen.stempelVorlagen()).map((v) => ({ id: v.id, name: v.name, text: v.text })),
    };
  }

  protected merke(benutzer: string, a: WebdavAnfrage, status: number) {
    this.zugriffe.push({
      zeit: new Date(this.jetzt()).toISOString(),
      benutzer,
      methode: a.methode,
      pfad: decodeURIComponentSicher(a.url.split('?')[0]),
      status,
    });
    if (this.zugriffe.length > ZUGRIFFE) this.zugriffe.splice(0, this.zugriffe.length - ZUGRIFFE);
  }

  /* ---------- Baum ---------- */

  protected async mappe(id: string, ctx: Ctx) {
    let m = ctx.mappen.get(id);
    if (!m) {
      m = await this.d.dienst.berechtigungen.laufwerkMappe(id, ctx.z);
      ctx.mappen.set(id, m);
    }
    return m;
  }

  /* ---------- Stempel und Mitnehmen (#722, #723) ---------- */

  private leser(ctx: Ctx) {
    return ctx.b.name || ctx.b.email;
  }

  /** Stempel beim Lesen für Mappen dieses Typs: Pflicht des Typs, sonst die Vorlage der Einstellung. */
  private stempelFuer(typId: string, ctx: Ctx) {
    let p = ctx.stempel.get(typId);
    if (!p) {
      p = this.d.dienst.ausgang.laufwerkStempel(typId, ctx.e.stempel, this.leser(ctx));
      ctx.stempel.set(typId, p);
    }
    return p;
  }
  /** Hat der Mappentyp dieser Mappe einen Pflicht-Stempel? Dann ist sie über das Laufwerk nur lesbar. */
  protected async pflichtMappe(mappeId: string, ctx: Ctx): Promise<boolean> {
    const m = await this.mappe(mappeId, ctx);
    return (await this.stempelFuer(m.mappe.typId, ctx)).pflicht;
  }
  private mappeVon(k: Knoten): string | null {
    return k.art === 'mappe' || k.art === 'verknuepft' ? k.id : k.art === 'register' || k.art === 'dokument' ? k.mappeId : null;
  }
  protected async istPflicht(k: Knoten, ctx: Ctx): Promise<boolean> {
    const id = this.mappeVon(k);
    return !!id && this.pflichtMappe(id, ctx);
  }
  /** Darf die Mappe über das Laufwerk hinaus (Lesen und Exportrecht, gemeinsame Prüfstelle #723)? */
  protected darfRaus(mappeId: string, ctx: Ctx): Promise<boolean> {
    let p = ctx.raus.get(mappeId);
    if (!p) {
      p = this.d.dienst.ausgang.mitnehmbar(ctx.b, ctx.z, [mappeId]).then((x) => x.has(mappeId));
      ctx.raus.set(mappeId, p);
    }
    return p;
  }

  /**
   * Was beim Lesen herauskommt (#722). Pflicht: jede stempelbare Datei gestempelt (Bilder als PDF), sonst gar nicht;
   * Vorlage der Einstellung: nur PDFs, und lässt sich eins nicht stempeln (z. B. verschlüsselt), das Original.
   * Gestempelte Fassungen merkt sich das Laufwerk, damit Größe (PROPFIND) und Inhalt (GET) übereinstimmen.
   */
  protected async auslieferung(k: Extract<Knoten, { art: 'dokument' }>, ctx: Ctx): Promise<Auslieferung> {
    const d = k.dok;
    const original: Auslieferung = {
      gestempelt: false,
      name: d.name,
      mime: d.anzeigbar ? d.mime : 'application/octet-stream',
      groesse: d.groesse,
      etag: etagVon(d),
      inhalt: async () => (await this.d.dienst.dokumente.dokumentInhalt(d.id)).inhalt,
    };
    const m = await this.mappe(k.mappeId, ctx);
    const s = await this.stempelFuer(m.mappe.typId, ctx);
    if (s.pflicht && !s.plan) return { ...original, fehler: s.fehler ?? t('api.webdav.nicht-stempelbar', { name: d.name }) };
    if (!s.plan || (!s.pflicht && d.mime !== 'application/pdf')) return original;
    if (!kannStempeln(d.mime)) return { ...original, fehler: t('api.webdav.nicht-stempelbar', { name: d.name }) };
    const plan: GeltenderStempel = s.plan;
    const text = ersetzePlatzhalter(plan.stempel.text, {
      empfaenger: plan.empfaenger,
      benutzer: this.leser(ctx),
      mappe: m.mappe.titel || t('meldungen.webdav.ohne-titel'),
    });
    const signatur = createHash('sha256')
      .update(JSON.stringify([plan.stempel, text, d.archivnummer ?? null]))
      .digest('hex');
    const schluessel = `${d.id}:${d.sha256}:${signatur}`;
    const name = d.mime === 'application/pdf' ? d.name : pdfName(d.name);
    const fertig = (inhalt: Buffer | null, groesse: number): Auslieferung => ({
      gestempelt: true,
      name,
      mime: 'application/pdf',
      groesse,
      etag: etagGestempelt(d, signatur),
      inhalt: async () => inhalt ?? (await this.stemple(d, m.mappe, plan, ctx, schluessel)).inhalt!,
    });
    const alt = this.gestempelt.get(schluessel);
    if (alt) {
      this.gestempelt.delete(schluessel);
      this.gestempelt.set(schluessel, alt);
      if (!alt.gestempelt) return original;
      return fertig(alt.inhalt, alt.groesse);
    }
    try {
      const neu = await this.stemple(d, m.mappe, plan, ctx, schluessel);
      return fertig(neu.inhalt, neu.groesse);
    } catch (e) {
      // Datei fehlt (#877): nichts merken, nichts ausliefern – GET antwortet 404, PROPFIND zeigt das Dokument weiter.
      if (e instanceof DateiFehlt)
        return {
          ...original,
          inhalt: async () => {
            throw e;
          },
        };
      // Beschädigte PDFs scheitern auch unterwegs im PDF-Leser (kein Fachfehler) – das Laufwerk bleibt dabei ruhig.
      const grund = e instanceof Fachfehler ? e.message : t('api.webdav.nicht-stempelbar', { name: d.name });
      if (!(e instanceof Fachfehler)) log.debug('WebDAV: Stempeln fehlgeschlagen', { id: d.id, fehler: (e as Error).message });
      if (s.pflicht) return { ...original, fehler: grund };
      // Freiwilliger Stempel: Lässt sich das PDF nicht stempeln, geht das Original hinaus (und bleibt überschreibbar).
      this.merkeStempel(schluessel, { gestempelt: false, groesse: d.groesse, inhalt: null });
      log.debug('WebDAV: PDF ließ sich nicht stempeln, Original ausgeliefert', { id: d.id, grund });
      return original;
    }
  }
  private async stemple(d: Dokument, m: Mappe, plan: GeltenderStempel, ctx: Ctx, schluessel: string) {
    const a = await this.d.dienst.ausgang.laufwerkAusgabe(d, m, plan, this.leser(ctx));
    const eintrag = { gestempelt: true, groesse: a.inhalt.length, inhalt: a.inhalt };
    this.merkeStempel(schluessel, eintrag);
    return eintrag;
  }
  /** Merken mit Grenzen: älteste Inhalte fallen zuerst weg, Größen bleiben bis STEMPEL_EINTRAEGE. */
  private merkeStempel(schluessel: string, e: { gestempelt: boolean; groesse: number; inhalt: Buffer | null }) {
    const alt = this.gestempelt.get(schluessel);
    if (alt?.inhalt) this.stempelBytes -= alt.inhalt.length;
    this.gestempelt.delete(schluessel);
    if (e.inhalt && e.inhalt.length > stempelSpeicher() / 4) e = { ...e, inhalt: null };
    this.gestempelt.set(schluessel, e);
    if (e.inhalt) this.stempelBytes += e.inhalt.length;
    for (const [k, v] of this.gestempelt) {
      if (this.stempelBytes <= stempelSpeicher() && this.gestempelt.size <= STEMPEL_EINTRAEGE) break;
      if (k === schluessel) continue;
      if (this.gestempelt.size > STEMPEL_EINTRAEGE) {
        this.gestempelt.delete(k);
        if (v.inhalt) this.stempelBytes -= v.inhalt.length;
        continue;
      }
      if (v.inhalt) {
        this.stempelBytes -= v.inhalt.length;
        v.inhalt = null;
      }
    }
  }
  /** Wird dieses Dokument gestempelt ausgeliefert? Nur für Leser mit Exportrecht – andere bekommen es ohnehin nicht. */
  protected async istGestempelt(k: Extract<Knoten, { art: 'dokument' }>, ctx: Ctx): Promise<boolean> {
    return (await this.darfRaus(k.mappeId, ctx)) && (await this.auslieferung(k, ctx)).gestempelt;
  }
}
