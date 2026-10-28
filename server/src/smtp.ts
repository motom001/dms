import nodemailer from 'nodemailer';
import type { Mailer } from './mail';
import { protokoll } from './protokoll';

const log = protokoll.modul('mail');

export interface MailEinstellungen {
  host?: string; port?: number; secure?: boolean; user?: string; pass?: string; absender?: string;
}

/** Ohne SMTP_HOST gibt es keinen Versand; die Oberfläche zeigt Links dann zum Kopieren an. */
export function erstelleMailer(e: MailEinstellungen): Mailer | null {
  if (!e.host) return null;
  const port = e.port ?? 587;
  const transport = nodemailer.createTransport({
    host: e.host,
    port,
    secure: e.secure ?? port === 465,
    auth: e.user ? { user: e.user, pass: e.pass ?? '' } : undefined,
  });
  const absender = e.absender || e.user || `dms@${e.host}`;
  return {
    async sende(an, betreff, text) {
      const start = Date.now();
      try {
        await transport.sendMail({ from: absender, to: an, subject: betreff, text });
        log.info('E-Mail verschickt', { an, betreff, ms: Date.now() - start });
      } catch (e) {
        log.error('E-Mail nicht verschickt', { an, betreff, fehler: (e as Error).message });
        throw e;
      }
    },
  };
}
