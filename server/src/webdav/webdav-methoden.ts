/** WebDAV-Laufwerk (#1278, Teil von `Webdav`): die Methoden PROPFIND, GET, PUT und LOCK. */
import type { Readable } from 'node:stream';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebdavOrdner } from './webdav-ordner';
import {
  type WebdavAnfrage,
  type Ctx,
  type WebdavAntwort,
  lies,
  xmlAntwort,
  text,
  istOrdner,
  httpDatumSicher,
  log,
  ortVon,
  verwerfe,
  leere,
  MAX_UPLOADS,
  logKonto,
  SPERRE_SEKUNDEN,
} from './webdav-hilfen';
import { WEBDAV_XML_MAX as XML_MAX } from '../grundlagen/grenzen';
import { davFehler, multistatus, istHilfsdatei, sperrAntwort } from './webdav-baum';
import { t } from '../sprache/sprache';
import { dateiKoepfe } from '../http/routen';
import { Fachfehler } from '../grundlagen/fehler';
import { MAX_DATEIGROESSE, POST_KANAL } from '../../../shared/src/model';
import { nimmAuf, Hochgeladen } from '../dateien/hochladen';
import { MIME } from '../post/eingangsordner';

/** PROPFIND, Lesen, Ablegen und Sperren. */
export abstract class WebdavMethoden extends WebdavOrdner {
  /* ---------- Methoden ---------- */

  protected async propfind(teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    // Körper (welche Eigenschaften) wird nicht ausgewertet: Antwort immer wie „allprop“.
    await lies(a.koerper, XML_MAX);
    const tiefe = (a.kopf('depth') ?? '1').trim().toLowerCase();
    if (tiefe !== '0' && tiefe !== '1') {
      return xmlAntwort(403, davFehler('propfind-finite-depth'));
    }
    const k = await this.finde(teile, ctx);
    if (!k || k.art === 'hilfsdatei') return text(404, t('meldungen.webdav.nicht-gefunden'));
    const name = teile.length ? teile[teile.length - 1] : 'Ablago';
    const liste = [await this.eintrag(teile, name, k, ctx)];
    if (tiefe === '1' && istOrdner(k))
      for (const c of await this.kinder(k, ctx)) liste.push(await this.eintrag([...teile, c.name], c.name, c.k, ctx));
    return { ...xmlAntwort(207, multistatus(liste)), lesend: true };
  }

  protected async hole(teile: string[], ctx: Ctx, nurKopf: boolean, a: WebdavAnfrage): Promise<WebdavAntwort> {
    const k = await this.finde(teile, ctx);
    if (!k || k.art === 'hilfsdatei') return text(404, t('meldungen.webdav.nicht-gefunden'));
    if (istOrdner(k)) {
      return { ...text(200, t('meldungen.webdav.dies-ist-ein-ordner')), lesend: true };
    }
    if (k.art !== 'dokument') return text(404, t('meldungen.webdav.diese-datei-ist-noch'));
    // Herunterladen gibt Daten hinaus wie ein Export (#294): gemeinsame Prüfstelle aller Wege nach draußen (#723).
    if (!(await this.darfRaus(k.mappeId, ctx))) return text(403, t('api.ausgang.webdav.eine'));
    const d = k.dok;
    // Stempel beim Lesen (#722): Pflicht des Mappentyps oder Vorlage der Einstellung.
    const aus = await this.auslieferung(k, ctx);
    if (aus.fehler) return text(403, aus.fehler);
    const etag = aus.etag;
    const koepfe: Record<string, string> = {
      ...dateiKoepfe({ inhalt: Buffer.alloc(0), name: aus.name, mime: aus.mime, anzeigen: false, groesse: aus.groesse }),
      etag,
      'accept-ranges': 'none',
      ...(aus.gestempelt ? { 'x-dms-stempel': '1' } : {}),
    };
    const lm = httpDatumSicher(d.erstellt);
    if (lm) koepfe['last-modified'] = lm;
    const wenn = a.kopf('if-none-match');
    if (
      wenn &&
      wenn
        .split(',')
        .map((x) => x.trim().replace(/^W\//, ''))
        .includes(etag)
    ) {
      const { 'content-length': _l, ...rest } = koepfe;
      return { status: 304, koepfe: rest, lesend: true };
    }
    if (nurKopf) return { status: 200, koepfe, lesend: true };
    const inhalt = await aus.inhalt();
    // #800: Ein echter Inhaltsabruf (GET mit Inhalt – kein PROPFIND, HEAD oder „nicht geändert“) kommt in die Historie.
    // Explorer, Finder und Office lesen dieselbe Datei oft viele Male (auch für Vorschaubilder): Je Person, Datei und
    // Tag bleibt es bei einem Eintrag. Scheitert das Schreiben, geht die Datei nicht hinaus.
    try {
      await this.d.dienst.mappenHistorie.notiereAbruf({
        dokumentId: d.id,
        benutzerId: ctx.b.id,
        weg: 'webdav',
        schluessel: ctx.s.name,
        gestempelt: aus.gestempelt,
        datei: aus.name,
      });
    } catch (e) {
      if (!Buffer.isBuffer(inhalt)) (inhalt as Readable).destroy();
      throw e;
    }
    log.debug(aus.gestempelt ? 'Dokument über WebDAV mit Stempel heruntergeladen' : 'Dokument über WebDAV heruntergeladen', {
      name: d.name,
      id: d.id,
      von: ctx.b.email,
    });
    return { status: 200, koepfe, body: inhalt, lesend: true };
  }

  /** Ziel eines Ablegens (PUT/LOCK): Ordner Neue Post oder Register, sonst Fehler. */
  private async ablageZiel(teile: string[], ctx: Ctx) {
    if (!teile.length) throw new Fachfehler(405, t('meldungen.webdav.hier-laesst-sich-nichts'));
    const name = teile[teile.length - 1];
    const { k, eltern } = await this.loese(teile, ctx);
    if (!eltern && !k) throw new Fachfehler(409, t('meldungen.webdav.diesen-ordner-gibt-es'));
    if (k && istOrdner(k)) throw new Fachfehler(405, t('meldungen.webdav.das-ist-ein-ordner'));
    const ort = eltern ? ortVon(eltern) : null;
    if (!eltern || !ort) {
      throw new Fachfehler(403, t('meldungen.webdav.hier-laesst-sich-nichts-2'));
    }
    if (ctx.s.recht !== 'schreiben') throw new Fachfehler(403, t('meldungen.webdav.dieser-api-schluessel-darf'));
    // Pflicht-Stempel (#722): Register schreibgeschützt; gestempelt ausgelieferte Dokumente nicht überschreiben
    // (sonst käme der Stempel beim Zurückspeichern in eine neue Version) – neue Dateien ablegen geht.
    if (eltern.art === 'register' && (await this.pflichtMappe(eltern.mappeId, ctx))) throw new Fachfehler(403, t('api.webdav.pflicht'));
    if (k?.art === 'dokument' && (await this.istGestempelt(k, ctx)))
      throw new Fachfehler(403, t('api.webdav.gestempelt', { name: k.dok.name }));
    return { name, k, eltern, ort };
  }

  protected async lege(teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    const laenge = Number(a.kopf('content-length'));
    if (Number.isFinite(laenge) && laenge > MAX_DATEIGROESSE) {
      verwerfe(a.koerper);
      return text(413, t('meldungen.webdav.die-datei-ist-zu-2'));
    }
    // Hilfsdateien der Betriebssysteme (desktop.ini, .DS_Store, ._*, ~$*): überall still annehmen und verwerfen.
    // Nur Bytes zählen, nichts puffern – und das vor jeder Prüfung des Ziels (geht auch mit Lese-Schlüssel).
    if (teile.length && istHilfsdatei(teile[teile.length - 1])) {
      await leere(a.koerper, MAX_DATEIGROESSE);
      return { status: 201, koepfe: { 'content-length': '0' } };
    }
    const z = await this.ablageZiel(teile, ctx);
    if (z.eltern.art === 'register') await this.d.dienst.rechtepruefung.pruefeRecht(ctx.z, z.eltern.mappeId, 'U');
    // Jeder Upload belegt bis zu 100 MB (temporäre Datei, #746): nur wenige gleichzeitig je Benutzer.
    const laufend = this.uploads.get(ctx.b.id) ?? 0;
    if (laufend >= MAX_UPLOADS) {
      verwerfe(a.koerper);
      logKonto.info('WebDAV: zu viele gleichzeitige Uploads', { benutzer: ctx.b.email, laufend });
      return text(503, t('meldungen.webdav.es-laufen-schon-mehrere'), { 'retry-after': '5' });
    }
    this.uploads.set(ctx.b.id, laufend + 1);
    try {
      return await this.legeAb(z, a, ctx);
    } finally {
      const n = (this.uploads.get(ctx.b.id) ?? 1) - 1;
      if (n > 0) this.uploads.set(ctx.b.id, n);
      else this.uploads.delete(ctx.b.id);
    }
  }

  private async legeAb(z: Awaited<ReturnType<WebdavMethoden['ablageZiel']>>, a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    // Hochladen als Strom (#746): in eine temporäre Datei, Prüfsumme beim Lesen; danach ist sie wieder weg.
    const inhalt =
      a.koerper && !Buffer.isBuffer(a.koerper)
        ? await nimmAuf(a.koerper, MAX_DATEIGROESSE, Number(a.kopf('content-length') ?? NaN))
        : await lies(a.koerper, MAX_DATEIGROESSE);
    try {
      return await this.legeInhaltAb(z, inhalt, ctx);
    } finally {
      if (inhalt instanceof Hochgeladen) await inhalt.entferne();
    }
  }

  private async legeInhaltAb(
    z: Awaited<ReturnType<WebdavMethoden['ablageZiel']>>,
    inhalt: Buffer | Hochgeladen,
    ctx: Ctx,
  ): Promise<WebdavAntwort> {
    const groesse = Buffer.isBuffer(inhalt) ? inhalt.length : inhalt.groesse;
    // Leere Datei: Explorer und Finder legen erst eine leere Datei an und schreiben dann den Inhalt.
    if (groesse === 0) {
      if (z.k?.art === 'dokument') return { status: 204, koepfe: {} };
      await this.merkeSchwebend(ctx, z.ort, z.name, 0);
      return { status: 201, koepfe: { 'content-length': '0' } };
    }
    const typ = MIME[extname(z.name).toLowerCase()];
    if (z.eltern.art === 'post') {
      const post = await this.d.dienst.post.legePostAn(
        { betreff: z.name.replace(/\.[^.]{1,8}$/, '').slice(0, 250) || z.name },
        { id: ctx.b.id, name: ctx.b.name },
        ctx.z,
        POST_KANAL.webdav,
      );
      const register = (await this.d.dienst.eingangskanaele.postTyp()).register.find((r) => r.art === 'dokumente')?.key;
      await this.d.dienst.dokumente.ladeHoch(post.id, { register, name: z.name, typ, herkunft: 'webdav' }, inhalt, ctx.b.id);
      log.info('Post über WebDAV abgelegt', { datei: z.name, groesse, mappe: post.id, von: ctx.b.email });
      await this.merkeSchwebend(ctx, z.ort, z.name, groesse);
      return { status: 201, koepfe: { 'content-length': '0' } };
    }
    if (z.eltern.art !== 'register') throw new Fachfehler(403, t('meldungen.webdav.hier-laesst-sich-nichts'));
    const reg = z.eltern.register;
    if (z.k?.art === 'dokument') {
      // Gleicher Name: neue Version – nur mit Versionierung; sonst nichts überschreiben.
      if (!reg.versionierung) throw new Fachfehler(409, t('meldungen.webdav.im-register-gibt-es', { name: reg.name, name2: z.k.dok.name }));
      // Per Dokument-Id, nicht per Name: Laufwerksnamen sind bereinigt und eindeutig gemacht („X (2).pdf“),
      // im DMS können zwei Dokumente gleich (oder nach dem Bereinigen gleich) heißen.
      const neu = await this.d.dienst.dokumentVersionen.ersetzeDokument(
        z.k.dok.id,
        { name: z.k.dok.name, typ, herkunft: 'webdav' },
        inhalt,
        ctx.b.id,
      );
      log.info('Neue Version über WebDAV abgelegt', { datei: neu.name, id: neu.id, groesse, mappe: z.eltern.mappeId, von: ctx.b.email });
      return { status: 204, koepfe: {} };
    }
    const r = await this.d.dienst.dokumente.ladeHoch(
      z.eltern.mappeId,
      { register: reg.key, name: z.name, typ, gleicherName: 'zaehler', herkunft: 'webdav' },
      inhalt,
      ctx.b.id,
    );
    await this.vergiss(ctx, z.ort, z.name);
    log.info('Dokument über WebDAV abgelegt', { datei: r.dokument.name, groesse, mappe: z.eltern.mappeId, von: ctx.b.email });
    return { status: 201, koepfe: { 'content-length': '0' } };
  }

  /** Schein-Sperre (s. oben): nur, wo Ablegen erlaubt ist; neue Namen erscheinen als leere Datei. */
  protected async sperre(teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    await lies(a.koerper, XML_MAX);
    const hilfsdatei = teile.length > 0 && istHilfsdatei(teile[teile.length - 1]);
    const z = hilfsdatei ? null : await this.ablageZiel(teile, ctx);
    const vorhanden = /\(<(opaquelocktoken:[0-9a-f-]{36})>\)/i.exec(a.kopf('if') ?? '')?.[1];
    const token = vorhanden ?? `opaquelocktoken:${randomUUID()}`;
    let status = 200;
    if (z && !z.k) {
      if (z.eltern.art === 'register') await this.d.dienst.rechtepruefung.pruefeRecht(ctx.z, z.eltern.mappeId, 'U');
      await this.merkeSchwebend(ctx, z.ort, z.name, 0);
      status = 201;
    }
    return xmlAntwort(status, sperrAntwort(token, teile, false, SPERRE_SEKUNDEN), { 'lock-token': `<${token}>` });
  }
}
