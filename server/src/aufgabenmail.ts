import { ZEITZONE, type Aufgabe, type Benutzer } from '../../shared/src/model';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import type { Mailer } from './mail';
import { protokoll } from './protokoll';

/**
 * Tägliche Zusammenfassung der offenen Aufgaben (#54): keine Mail je Aufgabe, sondern einmal
 * am Tag zur eingestellten Uhrzeit eine Übersicht an jeden, der offene Aufgaben hat.
 * Abbestellen im Profil (Einstellung aufgaben_mail = false).
 */

export interface MailEinstellung { aktiv: boolean; uhrzeit: string }
export const MAIL_STANDARD: MailEinstellung = { aktiv: true, uhrzeit: '07:00' };

export interface AufgabenQuelle {
  benutzer(): Promise<Benutzer[]>;
  einstellungenVon(b: Benutzer): Promise<Record<string, unknown>>;
  aufgabenVon(b: Benutzer): Promise<Aufgabe[]>;
  typName(id: string | undefined): Promise<string>;
}

const HEUTE = new Intl.DateTimeFormat('sv-SE', { timeZone: ZEITZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const UHR = new Intl.DateTimeFormat('de-DE', { timeZone: ZEITZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export class Aufgabenmail {
  constructor(
    private quelle: AufgabenQuelle,
    private mailer: () => Mailer | null,
    private adresse: () => string,
    private einstellungen?: Einstellungen,
  ) {}

  async einstellung(): Promise<MailEinstellung> {
    const e = (this.einstellungen ? await this.einstellungen.lies('aufgaben_mail') : null) as Partial<MailEinstellung> | null;
    return { ...MAIL_STANDARD, ...(e ?? {}) };
  }

  async speichere(e: unknown): Promise<MailEinstellung> {
    if (!this.einstellungen) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    const x = (e ?? {}) as Record<string, unknown>;
    const alt = await this.einstellung();
    const uhrzeit = x.uhrzeit === undefined ? alt.uhrzeit : String(x.uhrzeit);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new Fachfehler(422, 'Uhrzeit als HH:MM, z. B. 07:00.');
    const neu = { aktiv: x.aktiv === undefined ? alt.aktiv : x.aktiv === true, uhrzeit };
    await this.einstellungen.schreibe('aufgaben_mail', neu);
    protokoll.modul('werkbank').info('Tägliche Aufgaben-Mail eingestellt', { ...neu });
    return neu;
  }

  /** Regelmäßig aufgerufen: einmal am Tag nach der eingestellten Uhrzeit senden. */
  async pruefe(jetzt = new Date()): Promise<number> {
    const e = await this.einstellung();
    if (!e.aktiv || !this.mailer() || !this.einstellungen) return 0;
    const heute = HEUTE.format(jetzt);
    if (UHR.format(jetzt) < e.uhrzeit) return 0;
    if ((await this.einstellungen.lies('aufgaben_mail_zuletzt')) === heute) return 0;
    await this.einstellungen.schreibe('aufgaben_mail_zuletzt', heute);
    return this.sende();
  }

  /** Jetzt senden (auch aus der Werkbank zum Ausprobieren). Liefert die Anzahl verschickter Mails. */
  async sende(): Promise<number> {
    const mailer = this.mailer();
    if (!mailer) throw new Fachfehler(409, 'Der E-Mail-Versand ist nicht eingerichtet (Werkbank → E-Mail und Adresse).');
    let n = 0;
    for (const b of await this.quelle.benutzer()) {
      if (!b.aktiv || !b.email) continue;
      if ((await this.quelle.einstellungenVon(b)).aufgaben_mail === false) continue;
      const liste = await this.quelle.aufgabenVon(b);
      if (!liste.length) continue;
      const basis = this.adresse().replace(/\/+$/, '');
      const zeilen = await Promise.all(liste.map(async (a) => `- ${a.mappeTitel || 'Ohne Titel'} (${await this.quelle.typName(a.typId)}): ${a.text}\n  ${basis}/ablage/eingang/${a.mappeId}`));
      const text = `Hallo ${b.name || b.email},\n\ndu hast ${liste.length === 1 ? 'eine offene Aufgabe' : `${liste.length} offene Aufgaben`} im DMS:\n\n${zeilen.join('\n')}\n\nAlle findest du im Eingang: ${basis}/ablage/eingang\n\nDiese Zusammenfassung kommt einmal am Tag. Abbestellen kannst du sie in deinem Profil.\n`;
      try {
        await mailer.sende(b.email, `DMS: ${liste.length === 1 ? 'eine offene Aufgabe' : `${liste.length} offene Aufgaben`}`, text);
        n++;
      } catch (e) {
        protokoll.modul('mail').warn('Aufgaben-Mail nicht verschickt', { an: b.email, fehler: (e as Error).message });
      }
    }
    protokoll.modul('mail').info('Tägliche Aufgaben-Mails verschickt', { anzahl: n });
    return n;
  }
}
