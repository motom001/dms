/**
 * WebDAV-Laufwerk (#346; #1278: aufgeteilt in webdav-hilfen, webdav-basis, webdav-ordner, webdav-methoden): die Klasse,
 * die alle Teile zusammensetzt; hier selbst Anfrage, Anmeldung und Verteilung auf die Methoden.
 */
import { WebdavMethoden } from './webdav-methoden';
import {
  type WebdavAnfrage,
  type WebdavAntwort,
  verwerfe,
  text,
  LESEMETHODEN,
  WEBDAV_METHODEN,
  logKonto,
  type Ctx,
  EMAIL_MAX,
  SCHREIBEND,
  lies,
  xmlAntwort,
  istOrdner,
} from './webdav-hilfen';
import { t } from '../sprache/sprache';
import { zerlege, istHilfsdatei, basic, proppatchAntwort, proppatchNamen } from './webdav-baum';
import { Fachfehler } from '../grundlagen/fehler';
import { type ApiSchluessel, PRAEFIX, NUR_ZAEHLER } from '../anmeldung/apischluessel';
import type { Benutzer } from '../../../shared/src/model';
import { WEBDAV_XML_MAX as XML_MAX } from '../grundlagen/grenzen';

/** Was außerhalb des Ordners gebraucht wird (Routen, HTTP, Tests), unter dem bisherigen Pfad (#1278). */
export { etagVon, MAX_UPLOADS, WEBDAV_METHODEN, WEBDAV_ZUSATZMETHODEN, type WebdavAntwort } from './webdav-hilfen';

export class Webdav extends WebdavMethoden {
  /* ---------- Anfrage ---------- */

  async anfrage(a: WebdavAnfrage): Promise<WebdavAntwort> {
    const methode = a.methode.toUpperCase();
    if (!(await this.einstellung()).aktiv) {
      verwerfe(a.koerper);
      return text(404, t('meldungen.webdav.nicht-gefunden'));
    }
    const pfad = zerlege(a.url);
    if (!pfad) {
      verwerfe(a.koerper);
      return text(400, t('meldungen.webdav.ungueltiger-pfad'));
    }
    if (methode === 'OPTIONS') {
      verwerfe(a.koerper);
      // Nur lesend (#722): ohne „DAV: 2“ (keine Sperren) bindet macOS das Laufwerk schreibgeschützt ein.
      const nur = (await this.einstellung()).nurLesend;
      return {
        status: 200,
        lesend: true,
        koepfe: {
          dav: nur ? '1' : '1, 2',
          'ms-author-via': 'DAV',
          allow: (nur ? LESEMETHODEN : WEBDAV_METHODEN).join(', '),
          'content-length': '0',
        },
      };
    }
    this.anfragen++;
    let wer = '';
    const hilfsdatei = pfad.teile.length > 0 && istHilfsdatei(pfad.teile[pfad.teile.length - 1]);
    let antwort: WebdavAntwort;
    try {
      const ctx = await this.anmelden(a);
      if ('status' in ctx) {
        verwerfe(a.koerper);
        antwort = ctx.antwort;
        wer = ctx.wer;
      } else {
        wer = ctx.b.email;
        const r = await this.grenze.pruefe(ctx.b.id);
        if (!r.ok) {
          if (r.erstes) logKonto.warn('WebDAV: zu viele Anfragen, kurz gebremst', { benutzer: ctx.b.email, grenze: this.grenze.grenze });
          verwerfe(a.koerper);
          antwort = text(429, t('meldungen.webdav.zu-viele-anfragen-bitte'), { 'retry-after': String(r.sekunden) });
        } else {
          this.d.wartung?.pruefeAnfrage({ pfad: '/api/v1/webdav', zugang: 'angemeldet' }, ctx.b);
          antwort = await this.verarbeite(methode, pfad.teile, a, ctx);
        }
      }
    } catch (e) {
      verwerfe(a.koerper);
      const f = e as Fachfehler & { retryAfter?: number };
      if (!(e instanceof Fachfehler)) throw e;
      antwort = text(f.status, f.message, f.retryAfter ? { 'retry-after': String(f.retryAfter) } : {});
    }
    if (!hilfsdatei && wer) this.merke(wer, a, antwort.status);
    return antwort;
  }

  /** Basic mit E-Mail-Adresse und API-Schlüssel. Liefert den Kontext oder die Antwort (401/429). */
  private async anmelden(a: WebdavAnfrage): Promise<Ctx | { status: true; antwort: WebdavAntwort; wer: string }> {
    const nein = (text2: string) => text(401, text2, { 'www-authenticate': t('meldungen.webdav.basic-realm-ablago-charset') });
    const c = basic(a.kopf('authorization'));
    if (!c) return { status: true, wer: '', antwort: nein(t('meldungen.webdav.bitte-mit-e-mail')) };
    const email = c.name.toLowerCase();
    // Für Protokoll, Zugriffsliste und Anmeldeschutz gekürzt – die Eingabe stammt vom Anfragenden.
    const kurz = email.slice(0, EMAIL_MAX);
    // Anmeldeschutz (#240): gesperrte Adressen und Konten kommen auch hier nicht hinein.
    // Die Bremse je Konto (#1295) gilt nur für Passwörter; hier zählen nur API-Schlüssel, die sich nicht erraten lassen.
    // Sonst legte ein Fremder mit 30 falschen Passwörtern das Laufwerk einer Person für eine Stunde still.
    await this.d.konten.sperre.pruefe(kurz, a.ip, { kontoBremse: false });
    let s: ApiSchluessel | undefined;
    let b: Benutzer | undefined;
    // Nur API-Schlüssel – ein Passwort wird hier nie geprüft (Zwei-Faktor bleibt wirksam).
    if (c.passwort.startsWith(PRAEFIX) && this.d.schluessel) {
      try {
        s = await this.d.schluessel.pruefe(`Bearer ${c.passwort}`);
      } catch {
        s = undefined;
      }
      b = s ? await this.d.konten.benutzerMitId(s.benutzerId) : undefined;
    }
    // Dienstkonten aus #338 (Pakete) haben API-Schlüssel nur für den DMS-Prozess – nie über das Laufwerk.
    const dienstkonto = (b as { art?: string } | undefined)?.art === 'dienst';
    if (!s || !b || b.email.toLowerCase() !== email || dienstkonto) {
      // Gehört die Adresse zu einem aktiven Konto, meldet der Anmeldeschutz eine Sperre sofort (#368).
      await this.d.konten.sperre.fehlschlag(kurz, a.ip, email.length <= EMAIL_MAX && (await this.d.konten.istAktiveEmail(email)));
      logKonto.info('WebDAV: Anmeldung abgelehnt', {
        email: kurz,
        ip: a.ip,
        grund: dienstkonto
          ? 'Dienstkonto'
          : c.passwort.startsWith(PRAEFIX)
            ? 'Schlüssel ungültig oder gehört nicht zu dieser Adresse'
            : 'kein API-Schlüssel',
      });
      return { status: true, wer: kurz, antwort: nein(t('meldungen.webdav.e-mail-adresse-oder')) };
    }
    await this.d.konten.sperre.erfolg(kurz, a.ip);
    // „Nur Zähler“ (#625): Schlüssel stimmt, öffnet aber das Laufwerk nicht.
    if (s.recht === NUR_ZAEHLER) {
      logKonto.info('WebDAV: Anmeldung abgelehnt', { email: kurz, ip: a.ip, grund: 'Schlüssel nur Zähler' });
      return { status: true, wer: kurz, antwort: text(403, t('api.schluessel.nur-zaehler-laufwerk')) };
    }
    return {
      b,
      s,
      z: await this.d.dienst.rechtepruefung.zugriff(b),
      e: await this.einstellung(),
      mappen: new Map(),
      stempel: new Map(),
      raus: new Map(),
    };
  }

  private async verarbeite(methode: string, teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    // Nur lesend (#722): für alle Benutzer, auch Hilfsdateien und Schein-Sperren.
    if (ctx.e.nurLesend && SCHREIBEND.has(methode)) {
      verwerfe(a.koerper);
      return text(403, t('api.webdav.nur-lesend'));
    }
    // Register mit Pflicht-Stempel (#722): nichts ablegen, ändern, umbenennen, kopieren oder löschen.
    if (methode === 'MKCOL' || methode === 'DELETE' || methode === 'MOVE' || methode === 'COPY') {
      verwerfe(a.koerper);
      if (await this.inPflichtMappe(teile, ctx)) return text(403, t('api.webdav.pflicht'));
    }
    switch (methode) {
      case 'PROPFIND':
        return this.propfind(teile, a, ctx);
      case 'GET':
      case 'HEAD':
        verwerfe(a.koerper);
        return this.hole(teile, ctx, methode === 'HEAD', a);
      case 'PUT':
        return this.lege(teile, a, ctx);
      case 'LOCK':
        return this.sperre(teile, a, ctx);
      case 'UNLOCK':
        verwerfe(a.koerper);
        return { status: 204, koepfe: {} };
      case 'PROPPATCH': {
        const body = (await lies(a.koerper, XML_MAX)).toString('utf8');
        const k = await this.finde(teile, ctx);
        if (!k) return text(404, t('meldungen.webdav.nicht-gefunden'));
        if (await this.istPflicht(k, ctx)) return text(403, t('api.webdav.pflicht'));
        if (k.art === 'dokument' && (await this.auslieferung(k, ctx))?.gestempelt)
          return text(403, t('api.webdav.gestempelt', { name: k.dok.name }));
        return xmlAntwort(207, proppatchAntwort(teile, istOrdner(k), proppatchNamen(body)));
      }
      case 'MKCOL':
        verwerfe(a.koerper);
        return text(403, t('meldungen.webdav.ordner-lassen-sich-ueber'));
      case 'DELETE':
        verwerfe(a.koerper);
        return text(403, t('meldungen.webdav.loeschen-geht-ueber-das'));
      case 'MOVE':
        verwerfe(a.koerper);
        return text(403, t('meldungen.webdav.umbenennen-und-verschieben-gehen'));
      case 'COPY':
        verwerfe(a.koerper);
        return text(403, t('meldungen.webdav.kopieren-innerhalb-des-laufwerks'));
      default:
        verwerfe(a.koerper);
        return text(405, t('meldungen.webdav.diese-methode-unterstuetzt-das'), { allow: WEBDAV_METHODEN.join(', ') });
    }
  }
}
