import type postgres from 'postgres';
import nodemailer from 'nodemailer';
import { istEmail } from '../../shared/src/model';
import { Fachfehler } from './fehler';
import type { Mailer } from './mail';
import { kontext, protokoll } from './protokoll';
import { istVerschluesselt, type Betroffen, type Tresor } from './tresor';

/**
 * Betriebseinstellungen, die früher Umgebungsvariablen waren (#37):
 * E-Mail-Versand (SMTP) und die Adresse, unter der Benutzer das DMS öffnen.
 * Sie liegen in der Tabelle `einstellungen` und gelten sofort, ohne Neustart.
 */

const log = protokoll.modul('mail');

export const VERBINDUNGEN = { starttls: 'STARTTLS (meist Port 587)', ssl: 'SSL/TLS (meist Port 465)', keine: 'unverschlüsselt (nur im Heimnetz)' } as const;
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
}
/** So sieht die Oberfläche die Einstellungen: ohne Passwort. */
export type MailAnsicht = Omit<MailEinstellungen, 'passwort'> & {
  passwortGesetzt: boolean;
  /** false = mit einem verlorenen Schlüssel verschlüsselt; bitte neu eingeben. */
  passwortLesbar: boolean;
  /** Liegt noch im Klartext (aus einer älteren Version), bis es einen Schlüssel gibt. */
  passwortUnverschluesselt: boolean;
};

const LEER: MailEinstellungen = { aktiv: false, host: '', port: 587, verbindung: 'starttls', benutzer: '', passwort: '', absender: '', selbstsigniert: false };

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
  try { u = new URL(mitSchema); } catch { throw new Fachfehler(422, 'Bitte eine gültige Adresse angeben, z. B. http://nas.local:8080 oder https://dms.example.org.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Fachfehler(422, 'Die Adresse muss mit http:// oder https:// beginnen.');
  if (u.search || u.hash) throw new Fachfehler(422, 'Die Adresse darf keine Parameter (?…) oder Anker (#…) enthalten.');
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
}

function bereinige(e: unknown, alt: MailEinstellungen, verschluessele: (klartext: string) => string): MailEinstellungen {
  const x = (e ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const verbindung = (Object.keys(VERBINDUNGEN) as Verbindung[]).includes(x.verbindung as Verbindung) ? (x.verbindung as Verbindung) : 'starttls';
  const port = Math.floor(Number(x.port ?? (verbindung === 'ssl' ? 465 : 587)));
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
  };
  const fehler: string[] = [];
  if (!Number.isInteger(port) || port < 1 || port > 65535) fehler.push('Der Port muss zwischen 1 und 65535 liegen.');
  if (m.host && !/^[a-z0-9.-]+$|^\[[0-9a-f:]+\]$/i.test(m.host)) fehler.push('Der Server ist kein gültiger Rechnername, z. B. smtp.example.org.');
  if (m.absender && !istEmail(m.absender.replace(/^.*<([^>]+)>\s*$/, '$1'))) fehler.push('Der Absender ist keine gültige E-Mail-Adresse, z. B. dms@example.org oder „DMS <dms@example.org>“.');
  if (m.aktiv && !m.host) fehler.push('Zum Aktivieren braucht es einen Server.');
  if (fehler.length) throw new Fachfehler(422, fehler.join(' '));
  return m;
}

function transport(m: MailEinstellungen, passwort: string) {
  return nodemailer.createTransport({
    host: m.host,
    port: m.port,
    secure: m.verbindung === 'ssl',
    requireTLS: m.verbindung === 'starttls',
    ignoreTLS: m.verbindung === 'keine',
    auth: m.benutzer ? { user: m.benutzer, pass: passwort } : undefined,
    tls: { rejectUnauthorized: !m.selbstsigniert },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}
const absenderVon = (m: MailEinstellungen) => m.absender || m.benutzer || `dms@${m.host}`;

/** Meldung des Mailservers verständlich machen, ohne Passwörter zu zeigen. */
function meldung(e: unknown): string {
  const f = e as Error & { code?: string; responseCode?: number; response?: string };
  const hinweis: Record<string, string> = {
    EAUTH: 'Anmeldung abgelehnt – Benutzer oder Passwort prüfen.',
    ECONNECTION: 'Keine Verbindung zum Server – Server, Port und Verbindungsart prüfen.',
    ETIMEDOUT: 'Der Server antwortet nicht – Server und Port prüfen (Firewall?).',
    ESOCKET: 'Verbindung abgebrochen – passt die Verbindungsart zum Port?',
    EDNS: 'Den Server gibt es unter diesem Namen nicht.',
    ETLS: 'TLS-Fehler – Verbindungsart oder Zertifikat prüfen.',
  };
  const kern = f.response || f.message || String(e);
  return [f.code && hinweis[f.code], kern].filter(Boolean).join(' Server: ').slice(0, 600);
}

export class Betrieb {
  private mail: MailEinstellungen = { ...LEER };
  private adresse = '';
  private aktuellerMailer: Mailer | null = null;

  constructor(private speicher: BetriebSpeicher, private standardAdresse = 'http://localhost:3000', private tresor?: Tresor) {
    tresor?.registriere(async () => this.betroffen(), async () => this.verschluesseleAltes(), async (um) => this.nachWechsel(um));
  }

  /** Neues Passwort verschlüsseln; ohne Schlüssel wird nichts gespeichert. */
  private verschluessele = (klartext: string): string => {
    if (!this.tresor) throw new Fachfehler(409, 'Passwörter lassen sich erst speichern, wenn es einen Schlüssel gibt (Werkbank → Verschlüsselung).');
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
    if (!istVerschluesselt(p)) return [{ bereich: 'E-Mail und Adresse', was: 'Passwort des Mailservers', wo: 'liegt noch unverschlüsselt und wird verschlüsselt, sobald es einen Schlüssel gibt' }];
    return this.tresor?.lesbar(p) ? [] : [{ bereich: 'E-Mail und Adresse', was: 'Passwort des Mailservers', wo: 'bitte in der Werkbank unter „E-Mail und Adresse“ neu eingeben' }];
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
        sys.info('Adresse des DMS aus APP_URL übernommen', { adresse: this.adresse });
      } catch { sys.warn('APP_URL ist keine gültige Adresse und wurde nicht übernommen', { APP_URL: env.APP_URL }); }
    }
    sys.warn(`Diese Umgebungsvariablen werden nicht mehr verwendet und können entfernt werden: ${alte.join(', ')}. E-Mail und Adresse stehen jetzt in der Werkbank.`);
  }

  private baueMailer() {
    if (!this.mail.aktiv || !this.mail.host) { this.aktuellerMailer = null; return; }
    const m = { ...this.mail };
    const t = transport(m, this.klartext(m.passwort));
    this.aktuellerMailer = {
      async sende(an, betreff, text, o) {
        const start = Date.now();
        try {
          await t.sendMail({
            from: absenderVon(m), to: an, subject: betreff, text,
            ...(o?.antwortAn ? { replyTo: o.antwortAn } : {}),
            ...(o?.anhaenge?.length ? { attachments: o.anhaenge.map((a) => ({ filename: a.name, content: a.inhalt, contentType: a.mime })) } : {}),
          });
          log.info('E-Mail verschickt', { an, betreff, ms: Date.now() - start });
        } catch (e) {
          log.error('E-Mail nicht verschickt', { an, betreff, fehler: meldung(e) });
          throw new Error(meldung(e));
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
  kurz() { return { mail: this.aktuellerMailer ? `über ${this.mail.host}` : 'aus', adresse: this.adresse || '(nicht gepflegt – Adresse der Anfrage)' }; }

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

  async speichereMail(e: unknown) {
    const neu = bereinige(e, this.mail, this.verschluessele);
    const vorher = this.mail;
    await this.speicher.schreibe('mail', neu);
    this.mail = neu;
    this.baueMailer();
    const { passwort: _p, ...ohne } = neu;
    protokoll.modul('werkbank').info('E-Mail-Einstellungen geändert', {
      ...ohne, passwortGeaendert: neu.passwort !== vorher.passwort || undefined,
    });
    return this.ansicht();
  }

  async speichereAdresse(e: unknown) {
    this.adresse = pruefeAdresse(e);
    await this.speicher.schreibe('adresse', this.adresse);
    protokoll.modul('werkbank').info('Adresse des DMS geändert', { adresse: this.adresse || '(nicht gepflegt)' });
    return this.ansicht();
  }

  /** Mit den Werten aus dem Formular (noch nicht gespeichert); leeres Passwort = gespeichertes. */
  private probe(e: unknown): { m: MailEinstellungen; passwort: string } {
    // Zum Prüfen wird nichts gespeichert: ein eingegebenes Passwort bleibt im Klartext.
    const x = (e ?? {}) as Record<string, unknown>;
    const eingegeben = typeof x.passwort === 'string' && x.passwort !== '' && x.passwortLoeschen !== true;
    const m = bereinige({ ...x, aktiv: false }, this.mail, (k) => k);
    if (!m.host) throw new Fachfehler(422, 'Bitte zuerst den Server angeben.');
    return { m, passwort: eingegeben ? m.passwort : this.klartext(m.passwort) };
  }

  /** Meldet sich am Mailserver an, ohne etwas zu senden. */
  async pruefeVerbindung(e: unknown): Promise<{ ok: boolean; meldung: string }> {
    const { m, passwort } = this.probe(e);
    const start = Date.now();
    try {
      await transport(m, passwort).verify();
      log.info('Verbindung zum Mailserver geprüft', { server: m.host, ms: Date.now() - start });
      return { ok: true, meldung: `Verbindung zu ${m.host}:${m.port} steht${m.benutzer ? `, Anmeldung als ${m.benutzer} erfolgreich` : ''} (${Date.now() - start} ms).` };
    } catch (f) {
      log.warn('Verbindung zum Mailserver fehlgeschlagen', { server: m.host, fehler: meldung(f) });
      return { ok: false, meldung: meldung(f) };
    }
  }

  async sendeTestmail(e: unknown, an: unknown): Promise<{ ok: boolean; meldung: string }> {
    const ziel = typeof an === 'string' ? an.trim() : '';
    if (!istEmail(ziel)) throw new Fachfehler(422, 'Bitte eine gültige E-Mail-Adresse für die Testmail angeben.');
    const { m, passwort } = this.probe(e);
    try {
      await transport(m, passwort).sendMail({
        from: absenderVon(m), to: ziel, subject: 'Testmail vom DMS',
        text: `Hallo,\n\ndiese Testmail kommt aus der Werkbank deines DMS. Der E-Mail-Versand über ${m.host} funktioniert.\n`,
      });
      log.info('Testmail verschickt', { an: ziel, server: m.host });
      return { ok: true, meldung: `Testmail an ${ziel} verschickt. Sie sollte in wenigen Minuten ankommen (auch im Spam-Ordner nachsehen).` };
    } catch (f) {
      log.warn('Testmail nicht verschickt', { an: ziel, server: m.host, fehler: meldung(f) });
      return { ok: false, meldung: meldung(f) };
    }
  }
}

/* ---------- Speicher ---------- */

export function pgBetriebSpeicher(sql: postgres.Sql, haushaltId: string): BetriebSpeicher {
  return {
    async lies(k) {
      const [r] = await sql`SELECT wert FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel = ${k}`;
      return r ? r.wert : null;
    },
    async schreibe(k, w) {
      await sql`
        INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, ${k}, ${sql.json(w as postgres.JSONValue)})
        ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
    },
  };
}

export function speicherBetrieb(): BetriebSpeicher {
  const m = new Map<string, unknown>();
  return {
    async lies(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async schreibe(k, w) { m.set(k, structuredClone(w)); },
  };
}
