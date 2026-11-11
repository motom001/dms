import type postgres from 'postgres';
import nodemailer from 'nodemailer';
import { istEmail } from '../../shared/src/model';
import { OAUTH_VERSAND_SERVER, type OAuthVersandAnbieter } from '../../shared/src/mailanbieter';
import { Fachfehler } from './fehler';
import { sucheMailserver, standardSuche, type MailSuche, type SucheDeps } from './mailsuche';
import { VERSAND_OAUTH_ID, type OAuthStatus, type PostfachOAuth } from './postfach-oauth';
import { t } from './sprache';
import { pgEinstellungen } from './einstellungen';
import type { Mailer } from './mail';
import { kontext, protokoll } from './protokoll';
import { extern } from './externmessung';
import { istVerschluesselt, type Betroffen, type Tresor } from './tresor';

/**
 * Betriebseinstellungen, die früher Umgebungsvariablen waren (#37):
 * E-Mail-Versand (SMTP) und die Adresse, unter der Benutzer das DMS öffnen.
 * Sie liegen in der Tabelle `einstellungen` und gelten sofort, ohne Neustart.
 */

const log = protokoll.modul('mail');

export const VERBINDUNGEN = { starttls: t('meldungen.betrieb.starttls-meist-port-587'), ssl: t('meldungen.betrieb.ssl-tls-meist-port'), keine: t('meldungen.betrieb.unverschluesselt-nur-im-heimnetz') } as const;
export type Verbindung = keyof typeof VERBINDUNGEN;

export interface MailEinstellungen {
  aktiv: boolean;
  host: string;
  port: number;
  verbindung: Verbindung;
  benutzer: string;
  /**
   * Mit dem Schlüssel aus der Werkbank verschlüsselt (#39), so wie gespeichert.
   * Ältere Stände (bis 0.10) hielten es im Klartext; das wird verschlüsselt, sobald es einen Schlüssel gibt.
   * Geht nie an die Oberfläche.
   */
  passwort: string;
  absender: string;
  /** Selbstsigniertes Zertifikat des Mailservers erlauben (eigener Server im Heimnetz). */
  selbstsigniert: boolean;
  /** #813: Anmeldung mit Passwort (Standard, auch für ältere Stände) oder über OAuth (Microsoft 365, Google). */
  anmeldung: 'passwort' | 'oauth';
  /** Bei OAuth: Anbieter; die App-Registrierung ist dieselbe wie bei den Postfächern. */
  anbieter?: OAuthVersandAnbieter;
}
/** So sieht die Oberfläche die Einstellungen: ohne Passwort. */
export type MailAnsicht = Omit<MailEinstellungen, 'passwort'> & {
  passwortGesetzt: boolean;
  /** false = mit einem verlorenen Schlüssel verschlüsselt; bitte neu eingeben. */
  passwortLesbar: boolean;
  /** Liegt noch im Klartext (aus einer älteren Version), bis es einen Schlüssel gibt. */
  passwortUnverschluesselt: boolean;
};

const LEER: MailEinstellungen = { aktiv: false, host: '', port: 587, verbindung: 'starttls', benutzer: '', passwort: '', absender: '', selbstsigniert: false, anmeldung: 'passwort' };

export interface BetriebSpeicher {
  lies(schluessel: string): Promise<unknown>;
  schreibe(schluessel: string, wert: unknown): Promise<void>;
}

/** Normalisiert eine Adresse wie „nas:8080“ zu „http://nas:8080“; leer = nicht gepflegt. */
export function pruefeAdresse(e: unknown): string {
  const roh = typeof e === 'string' ? e.trim() : '';
  if (!roh) return '';
  const mitSchema = /^[a-z]+:\/\//i.test(roh) ? roh : `http://${roh}`;
  let u: URL;
  try { u = new URL(mitSchema); } catch { throw new Fachfehler(422, 'Bitte eine gültige Adresse angeben, z. B. http://nas.home.arpa:8080 oder https://dms.example.org.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Fachfehler(422, 'Die Adresse muss mit http:// oder https:// beginnen.');
  if (u.search || u.hash) throw new Fachfehler(422, t('meldungen.betrieb.die-adresse-darf-keine'));
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
}

function bereinige(e: unknown, alt: MailEinstellungen, verschluessele: (klartext: string) => string): MailEinstellungen {
  const x = (e ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const verbindung = (Object.keys(VERBINDUNGEN) as Verbindung[]).includes(x.verbindung as Verbindung) ? (x.verbindung as Verbindung) : 'starttls';
  const port = Math.floor(Number(x.port ?? (verbindung === 'ssl' ? 465 : 587)));
  const anmeldung = x.anmeldung === 'oauth' ? 'oauth' : 'passwort';
  const anbieter = x.anbieter === 'microsoft' || x.anbieter === 'google' ? x.anbieter : undefined;
  const m: MailEinstellungen = {
    aktiv: x.aktiv === true,
    host: text(x.host),
    port,
    verbindung,
    benutzer: text(x.benutzer),
    // Leeres Feld = bisheriges Passwort behalten; zum Löschen gibt es passwortLoeschen.
    passwort: x.passwortLoeschen === true ? '' : typeof x.passwort === 'string' && x.passwort !== '' ? verschluessele(x.passwort.slice(0, 500)) : alt.passwort,
    absender: text(x.absender),
    selbstsigniert: x.selbstsigniert === true,
    anmeldung,
    ...(anmeldung === 'oauth' ? { anbieter } : {}),
  };
  const fehler: string[] = [];
  if (anmeldung === 'oauth') {
    // Das Zugriffstoken geht nur an den Versandserver des Anbieters selbst, verschlüsselt und mit Zertifikat.
    m.passwort = '';
    m.selbstsigniert = false;
    if (!anbieter) fehler.push(t('werkbank.mail.oauth.anbieter-fehlt'));
    else if (!OAUTH_VERSAND_SERVER[anbieter].includes(m.host.toLowerCase())) fehler.push(t('werkbank.mail.oauth.server', { server: OAUTH_VERSAND_SERVER[anbieter].join(', ') }));
    if (m.verbindung === 'keine') fehler.push(t('werkbank.mail.oauth.verschluesselt'));
    if (!istEmail(m.benutzer)) fehler.push(t('werkbank.mail.oauth.benutzer'));
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) fehler.push(t('meldungen.betrieb.der-port-muss-zwischen'));
  if (m.host && !/^[a-z0-9.-]+$|^\[[0-9a-f:]+\]$/i.test(m.host)) fehler.push(t('meldungen.betrieb.der-server-ist-kein'));
  if (m.absender && !istEmail(m.absender.replace(/^.*<([^>]+)>\s*$/, '$1'))) fehler.push(t('meldungen.betrieb.der-absender-ist-keine'));
  if (m.aktiv && !m.host) fehler.push(t('meldungen.betrieb.zum-aktivieren-braucht-es'));
  if (fehler.length) throw new Fachfehler(422, fehler.join(' '));
  return m;
}

/** `zugriff`: OAuth-Zugriffstoken (#813) statt Passwort. */
export function transport(m: MailEinstellungen, passwort: string, zugriff?: string): Pick<ReturnType<typeof nodemailer.createTransport>, 'sendMail' | 'verify'> {
  return nodemailer.createTransport({
    host: m.host,
    port: m.port,
    secure: m.verbindung === 'ssl',
    requireTLS: m.verbindung === 'starttls',
    ignoreTLS: m.verbindung === 'keine',
    auth: zugriff ? { type: 'OAuth2', user: m.benutzer, accessToken: zugriff } : m.benutzer ? { user: m.benutzer, pass: passwort } : undefined,
    tls: { rejectUnauthorized: !m.selbstsigniert },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}
/**
 * Externe Dienste (#565): Versand und Verbindungsprüfung über den Mailserver messen – Dauer, bis der Server den
 * Umschlag angenommen hat, Gesamtdauer, Größe der Mail, Ergebnis. Nie Empfänger, Betreff oder Inhalt.
 */
function gemessen(baue: typeof transport): typeof transport {
  return (m, passwort, zugriff) => {
    const tr = baue(m, passwort, zugriff);
    return {
      sendMail: ((mail: Parameters<typeof tr.sendMail>[0]) => extern.messe({ dienst: 'smtp', funktion: 'versand' }, async (p) => {
        const info = await tr.sendMail(mail) as { envelopeTime?: number; messageSize?: number } | undefined;
        if (typeof info?.envelopeTime === 'number') p.ersteNach(info.envelopeTime); else p.erste();
        p.bytes(Number(info?.messageSize) || 0, 0);
        return info;
      })) as typeof tr.sendMail,
      verify: (() => extern.messe({ dienst: 'smtp', funktion: 'pruefen' }, () => tr.verify())) as typeof tr.verify,
    };
  };
}
const absenderVon = (m: MailEinstellungen) => m.absender || m.benutzer || `dms@${m.host}`;

/**
 * Meldung des Mailservers verständlich machen (#813), ohne Passwörter zu zeigen: `text` nennt die Ursache in
 * einem Satz, `technisch` die Antwort des Servers zum Nachlesen.
 */
export function mailFehler(e: unknown, anmeldung: 'passwort' | 'oauth' = 'passwort'): { text: string; technisch: string } {
  const f = e as Error & { code?: string; responseCode?: number; response?: string };
  const technisch = String(f.response || f.message || e).replace(/[\r\n]+/g, ' ').slice(0, 500);
  const alles = `${f.code ?? ''} ${f.responseCode ?? ''} ${technisch}`;
  const code = f.responseCode ?? 0;
  const k = (s: string) => t.frei(`werkbank.mail.fehler.${s}`);
  let text: string;
  if (/5\.7\.139|SmtpClientAuthentication is disabled|basic authentication is disabled/i.test(alles)) text = k('microsoft-oauth');
  else if (/5\.7\.9|application-specific password|InvalidSecondFactor/i.test(alles)) text = k('app-passwort');
  else if (f.code === 'EAUTH' || code === 535 || code === 534) text = anmeldung === 'oauth' ? k('oauth') : k('passwort');
  else if (code === 530) text = k('anmeldung-noetig');
  else if ((code === 550 || code === 553 || code === 554 || code === 501) && /sender|from|absender|5\.7\.1|not owned|relay/i.test(technisch)) text = k('absender');
  else if (/wrong version number|ssl3_get_record|packet length too long|unknown protocol/i.test(alles)) text = k('verbindungsart');
  else if (/self[- ]signed|unable to verify|certificate/i.test(alles)) text = k('zertifikat');
  else if (f.code === 'EDNS' || /ENOTFOUND|EAI_AGAIN/.test(alles)) text = k('unbekannt');
  else if (f.code === 'ETIMEDOUT' || /timeout|timed out/i.test(alles)) text = k('zeit');
  else if (f.code === 'ECONNECTION' || /ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/.test(alles)) text = k('verbindung');
  else if (f.code === 'ETLS') text = k('tls');
  else if (f.code === 'ESOCKET') text = k('abgebrochen');
  else text = k('sonst');
  return { text, technisch };
}

/** Für Protokoll und Fehler beim Versand: Ursache und Antwort des Servers in einem Text. */
const meldung = (e: unknown, anmeldung?: 'passwort' | 'oauth') => { const m = mailFehler(e, anmeldung); return `${m.text} Server: ${m.technisch}`.slice(0, 600); };

/** Ergebnis von „Verbindung prüfen“ und „Testmail senden“. */
export interface MailProbe { ok: boolean; meldung: string; technisch?: string }

export class Betrieb {
  private mail: MailEinstellungen = { ...LEER };
  private adresse = '';
  private aktuellerMailer: Mailer | null = null;
  private oauth?: PostfachOAuth;

  private suche: SucheDeps;
  private baue: typeof transport;

  /** `o.suche` und `o.transport` stellen Tests nach (DNS, Autoconfig, SMTP). */
  constructor(private speicher: BetriebSpeicher, private standardAdresse = 'http://localhost:3000', private tresor?: Tresor, o: { suche?: SucheDeps; transport?: typeof transport } = {}) {
    this.suche = o.suche ?? standardSuche();
    this.baue = gemessen(o.transport ?? transport);
    tresor?.registriere(async () => this.betroffen(), async () => this.verschluesseleAltes(), async (um) => this.nachWechsel(um));
  }

  /** #813: Anmeldung über OAuth – dieselbe wie bei den Postfächern (App-Registrierung, Ablauf, Tresor). */
  verbindeOAuth(oauth: PostfachOAuth) { this.oauth = oauth; }

  /** Zugriffstoken für den Versand; erneuert vor Ablauf. */
  private async zugriff(m: MailEinstellungen): Promise<string> {
    if (!this.oauth || !m.anbieter) throw new Fachfehler(409, t('werkbank.mail.oauth.nicht-eingerichtet'));
    return this.oauth.zugriffstoken({ id: VERSAND_OAUTH_ID, name: t('meldungen.betrieb.e-mail-versand'), benutzer: m.benutzer, anbieter: m.anbieter });
  }

  /** Neues Passwort verschlüsseln; ohne Schlüssel wird nichts gespeichert. */
  private verschluessele = (klartext: string): string => {
    if (!this.tresor) throw new Fachfehler(409, t('meldungen.betrieb.passwoerter-lassen-sich-erst'));
    return this.tresor.verschluessele(klartext);
  };

  /** Passwort für die Anmeldung am Mailserver; leer, wenn es nicht lesbar ist. */
  private klartext(gespeichert: string): string {
    if (!gespeichert) return '';
    if (!istVerschluesselt(gespeichert)) return gespeichert;
    return this.tresor?.entschluessele(gespeichert) ?? '';
  }

  private betroffen(): Betroffen[] {
    const p = this.mail.passwort;
    if (!p) return [];
    if (!istVerschluesselt(p)) return [{ bereich: t('meldungen.betrieb.e-mail-und-adresse'), was: t('meldungen.betrieb.passwort-des-mailservers'), wo: t('meldungen.betrieb.liegt-noch-unverschluesselt-und') }];
    return this.tresor?.lesbar(p) ? [] : [{ bereich: t('meldungen.betrieb.e-mail-und-adresse'), was: t('meldungen.betrieb.passwort-des-mailservers'), wo: t('meldungen.betrieb.bitte-in-der-werkbank') }];
  }

  /** Passwort aus älteren Ständen (Klartext) verschlüsseln, sobald es einen Schlüssel gibt. */
  async verschluesseleAltes() {
    const p = this.mail.passwort;
    if (!p || istVerschluesselt(p) || !this.tresor?.bereit) return;
    this.mail = { ...this.mail, passwort: this.tresor.verschluessele(p) };
    await this.speicher.schreibe('mail', this.mail);
    protokoll.modul('system').info('Passwort des Mailservers verschlüsselt');
  }

  /**
   * Nach dem Schlüsselwechsel (#47): Einstellungen neu laden – in PostgreSQL sind sie schon umgeschlüsselt.
   * Liegen sie woanders (Tests, Arbeitsspeicher), hier umschlüsseln.
   */
  private async nachWechsel(um: (wert: string) => string | null) {
    this.mail = { ...LEER, ...((await this.speicher.lies('mail')) as Partial<MailEinstellungen> | null ?? {}) };
    const p = this.mail.passwort;
    if (p && istVerschluesselt(p) && !this.tresor?.lesbar(p)) {
      const neu = um(p);
      if (neu) { this.mail = { ...this.mail, passwort: neu }; await this.speicher.schreibe('mail', this.mail); }
    }
    this.baueMailer();
  }

  /** Lädt die gespeicherten Einstellungen; einmal beim Start. */
  async laden() {
    this.mail = { ...LEER, ...((await this.speicher.lies('mail')) as Partial<MailEinstellungen> | null ?? {}) };
    this.adresse = String((await this.speicher.lies('adresse')) ?? '');
    await this.verschluesseleAltes();
    if (this.mail.passwort && !istVerschluesselt(this.mail.passwort)) {
      protokoll.modul('system').warn('Das Passwort des Mailservers liegt noch unverschlüsselt in der Datenbank. Erzeuge in der Werkbank unter „Verschlüsselung“ einen Schlüssel.');
    } else if (this.mail.passwort && !this.klartext(this.mail.passwort)) {
      log.error('Das Passwort des Mailservers ist mit dem vorhandenen Schlüssel nicht lesbar. Bitte in der Werkbank neu eingeben.');
    }
    this.baueMailer();
  }

  /** Mehrere Prozesse (#745): Einstellungen neu lesen, nachdem ein anderer Prozess sie geändert hat. */
  async nachladen() {
    this.mail = { ...LEER, ...((await this.speicher.lies('mail')) as Partial<MailEinstellungen> | null ?? {}) };
    this.adresse = String((await this.speicher.lies('adresse')) ?? '');
    this.baueMailer();
  }

  /**
   * Einmalige Übernahme der früheren Umgebungsvariablen (SMTP_*, APP_URL), damit der Versand
   * nach dem Update nicht ausfällt. Übernommen wird nur, was noch nicht gespeichert ist.
   */
  async uebernimmAlteVariablen(env: Record<string, string | undefined>) {
    const sys = protokoll.modul('system');
    const alte = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE', 'APP_URL'].filter((k) => env[k]);
    if (!alte.length) return;
    if (env.SMTP_HOST && (await this.speicher.lies('mail')) == null) {
      const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : 587;
      const ssl = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;
      this.mail = bereinige({
        aktiv: true, host: env.SMTP_HOST, port, verbindung: ssl ? 'ssl' : 'starttls',
        benutzer: env.SMTP_USER ?? '', passwort: env.SMTP_PASS ?? '', absender: env.SMTP_FROM ?? '',
        // Ohne Schlüssel bleibt es vorerst im Klartext und wird verschlüsselt, sobald es einen gibt.
      }, LEER, (k) => (this.tresor?.bereit ? this.tresor.verschluessele(k) : k));
      await this.speicher.schreibe('mail', this.mail);
      this.baueMailer();
      sys.info('E-Mail-Einstellungen aus den Umgebungsvariablen übernommen', { server: this.mail.host });
    }
    if (env.APP_URL && (await this.speicher.lies('adresse')) == null) {
      try {
        this.adresse = pruefeAdresse(env.APP_URL);
        await this.speicher.schreibe('adresse', this.adresse);
        sys.info('Adresse von Ablago aus APP_URL übernommen', { adresse: this.adresse });
      } catch { sys.warn('APP_URL ist keine gültige Adresse und wurde nicht übernommen', { APP_URL: env.APP_URL }); }
    }
    sys.warn(`Diese Umgebungsvariablen werden nicht mehr verwendet und können entfernt werden: ${alte.join(', ')}. E-Mail und Adresse stehen jetzt in der Werkbank.`);
  }

  private baueMailer() {
    if (!this.mail.aktiv || !this.mail.host) { this.aktuellerMailer = null; return; }
    const m = { ...this.mail };
    const fest = m.anmeldung === 'oauth' ? null : this.baue(m, this.klartext(m.passwort));
    // OAuth (#813): je Versand ein gültiges Zugriffstoken holen (erneuert vor Ablauf).
    const holeTransport = async () => fest ?? this.baue(m, '', await this.zugriff(m));
    this.aktuellerMailer = {
      async sende(an, betreff, text, o) {
        const start = Date.now();
        try {
          const tr = await holeTransport();
          await tr.sendMail({
            from: absenderVon(m), to: an, subject: betreff, text,
            ...(o?.antwortAn ? { replyTo: o.antwortAn } : {}),
            ...(o?.anhaenge?.length ? { attachments: o.anhaenge.map((a) => ({ filename: a.name, content: a.inhalt, contentType: a.mime })) } : {}),
          });
          log.info('E-Mail verschickt', { an, betreff, ms: Date.now() - start });
        } catch (e) {
          const grund = e instanceof Fachfehler ? e.message : meldung(e, m.anmeldung);
          log.error('E-Mail nicht verschickt', { an, betreff, fehler: grund });
          throw new Error(grund);
        }
      },
    };
  }

  /* ---------- für Konten und HTTP ---------- */

  /** Der Mailer, wie er gerade eingestellt ist; null = kein Versand. */
  mailer(): Mailer | null { return this.aktuellerMailer; }

  /**
   * Adresse für Links in E-Mails: gepflegt oder – solange nicht gepflegt – die Adresse der
   * aktuellen Anfrage (hinter einem Proxy über X-Forwarded-*, siehe TRUST_PROXY).
   */
  adresseFuerLinks(): string { return this.adresse || kontext.getStore()?.ursprung || this.standardAdresse; }

  /** Sitzungs-Cookie nur über HTTPS, wenn die Adresse https ist (oder die Anfrage über HTTPS kam). */
  cookieNurHttps(): boolean {
    if (this.adresse) return this.adresse.startsWith('https://');
    return (kontext.getStore()?.ursprung ?? '').startsWith('https://');
  }

  /** Kurzangabe für die Technikübersicht. */
  kurz() { return { mail: this.aktuellerMailer ? t('meldungen.betrieb.ueber', { host: this.mail.host, wert: this.mail.anmeldung === 'oauth' ? ' (OAuth)' : '' }) : 'aus', adresse: this.adresse || t('meldungen.betrieb.nicht-gepflegt-adresse-der') }; }

  /* ---------- für die Werkbank ---------- */

  ansicht(): { mail: MailAnsicht; adresse: string; vorschlag: string | null; verbindungen: typeof VERBINDUNGEN; passwoerterMoeglich: boolean } {
    const { passwort, ...ohne } = this.mail;
    return {
      mail: {
        ...ohne, passwortGesetzt: !!passwort,
        passwortLesbar: !passwort || !istVerschluesselt(passwort) || !!this.tresor?.lesbar(passwort),
        passwortUnverschluesselt: !!passwort && !istVerschluesselt(passwort),
      },
      adresse: this.adresse, vorschlag: kontext.getStore()?.ursprung ?? null, verbindungen: VERBINDUNGEN,
      passwoerterMoeglich: !!this.tresor?.bereit,
    };
  }

  /** Ansicht samt Zustand der OAuth-Anmeldung (#813) – für die Werkbank. */
  async stand(): Promise<ReturnType<Betrieb['ansicht']> & { oauth: OAuthStatus | null; oauthMoeglich: boolean }> {
    const a = this.ansicht();
    return { ...a, oauth: this.mail.anmeldung === 'oauth' && this.oauth ? await this.oauth.status(VERSAND_OAUTH_ID) : null, oauthMoeglich: !!this.oauth };
  }

  /** Server zur Adresse finden (#813); `thunderbird` nur auf Knopfdruck. */
  async findeServer(e: unknown): Promise<MailSuche> {
    const x = (e ?? {}) as Record<string, unknown>;
    return sucheMailserver(x.email, { thunderbird: x.thunderbird === true }, this.suche);
  }

  /** Für die Anmeldung beim Anbieter: nur mit gespeicherter Einstellung „OAuth“. */
  oauthZiel(): { id: string; anbieter: OAuthVersandAnbieter; benutzer: string } {
    const m = this.mail;
    if (m.anmeldung !== 'oauth' || !m.anbieter) throw new Fachfehler(409, t('werkbank.mail.oauth.erst-speichern'));
    return { id: VERSAND_OAUTH_ID, anbieter: m.anbieter, benutzer: m.benutzer };
  }

  async speichereMail(e: unknown, von = '') {
    const neu = bereinige(e, this.mail, this.verschluessele);
    const vorher = this.mail;
    await this.speicher.schreibe('mail', neu);
    this.mail = neu;
    this.baueMailer();
    // OAuth (#813): Anmeldeart, Anbieter, Konto oder Server geändert – die gespeicherte Anmeldung gilt nicht mehr.
    if (vorher.anmeldung === 'oauth' && (neu.anmeldung !== 'oauth' || vorher.anbieter !== neu.anbieter || vorher.benutzer !== neu.benutzer || vorher.host !== neu.host)) {
      await this.oauth?.abmelden(VERSAND_OAUTH_ID, von || 'Werkbank');
    }
    const { passwort: _p, ...ohne } = neu;
    protokoll.modul('werkbank').info('E-Mail-Einstellungen geändert', {
      ...ohne, passwortGeaendert: neu.passwort !== vorher.passwort || undefined,
    });
    return this.stand();
  }

  async speichereAdresse(e: unknown) {
    this.adresse = pruefeAdresse(e);
    await this.speicher.schreibe('adresse', this.adresse);
    protokoll.modul('werkbank').info('Adresse von Ablago geändert', { adresse: this.adresse || '(nicht gepflegt)' });
    return this.stand();
  }

  /** Mit den Werten aus dem Formular (noch nicht gespeichert); leeres Passwort = gespeichertes. */
  private async probe(e: unknown): Promise<{ m: MailEinstellungen; passwort: string; zugriff?: string }> {
    // Zum Prüfen wird nichts gespeichert: ein eingegebenes Passwort bleibt im Klartext.
    const x = (e ?? {}) as Record<string, unknown>;
    const eingegeben = typeof x.passwort === 'string' && x.passwort !== '' && x.passwortLoeschen !== true;
    const m = bereinige({ ...x, aktiv: false }, this.mail, (k) => k);
    if (!m.host) throw new Fachfehler(422, t('meldungen.betrieb.bitte-zuerst-den-server'));
    if (m.anmeldung === 'oauth') {
      // Das Token nur mit der gespeicherten Anmeldung (gleicher Anbieter, gleiches Konto, Server des Anbieters).
      const g = this.mail;
      if (g.anmeldung !== 'oauth' || g.anbieter !== m.anbieter || g.benutzer !== m.benutzer) throw new Fachfehler(409, t('werkbank.mail.oauth.erst-speichern'));
      return { m, passwort: '', zugriff: await this.zugriff(m) };
    }
    return { m, passwort: eingegeben ? m.passwort : this.klartext(m.passwort) };
  }

  private fehlschlag(f: unknown, m: MailEinstellungen): MailProbe {
    if (f instanceof Fachfehler) return { ok: false, meldung: f.message };
    const x = mailFehler(f, m.anmeldung);
    return { ok: false, meldung: x.text, technisch: x.technisch };
  }

  /** Meldet sich am Mailserver an, ohne etwas zu senden. */
  async pruefeVerbindung(e: unknown): Promise<MailProbe> {
    const { m, passwort, zugriff } = await this.probe(e);
    const start = Date.now();
    try {
      await this.baue(m, passwort, zugriff).verify();
      log.info('Verbindung zum Mailserver geprüft', { server: m.host, ms: Date.now() - start });
      return { ok: true, meldung: t('meldungen.betrieb.verbindung-zu-steht-ms', { host: m.host, port: m.port, wert: m.benutzer ? t('meldungen.betrieb.anmeldung-als-erfolgreich', { benutzer: m.benutzer }) : '', wert2: Date.now() - start }) };
    } catch (f) {
      log.warn('Verbindung zum Mailserver fehlgeschlagen', { server: m.host, fehler: meldung(f, m.anmeldung) });
      return this.fehlschlag(f, m);
    }
  }

  async sendeTestmail(e: unknown, an: unknown): Promise<MailProbe> {
    const ziel = typeof an === 'string' ? an.trim() : '';
    if (!istEmail(ziel)) throw new Fachfehler(422, t('meldungen.betrieb.bitte-eine-gueltige-e'));
    const { m, passwort, zugriff } = await this.probe(e);
    try {
      await this.baue(m, passwort, zugriff).sendMail({
        from: absenderVon(m), to: ziel, subject: t('meldungen.betrieb.testmail-von-ablago'),
        text: t('meldungen.betrieb.hallo-diese-testmail-kommt', { host: m.host }),
      });
      log.info('Testmail verschickt', { an: ziel, server: m.host });
      return { ok: true, meldung: t('meldungen.betrieb.testmail-an-verschickt-sie', { ziel }) };
    } catch (f) {
      log.warn('Testmail nicht verschickt', { an: ziel, server: m.host, fehler: meldung(f, m.anmeldung) });
      return this.fehlschlag(f, m);
    }
  }
}

/* ---------- Speicher ---------- */

export function pgBetriebSpeicher(sql: postgres.Sql, haushaltId: string): BetriebSpeicher {
  return pgEinstellungen(sql, haushaltId);
}

export function speicherBetrieb(): BetriebSpeicher {
  const m = new Map<string, unknown>();
  return {
    async lies(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async schreibe(k, w) { if (w === null || w === undefined) m.delete(k); else m.set(k, structuredClone(w)); },
  };
}
