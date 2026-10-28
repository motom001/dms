import { feiertagAm, istBundesland, type Bundesland } from '../../shared/src/feiertage';
import { abwesenheitWirkt, ZEITZONE, type Aufgabe, type Benutzer } from '../../shared/src/model';
import { heuteIn } from '../../shared/src/sichten';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import type { Mailer } from './mail';
import { protokoll } from './protokoll';

/**
 * Tägliche Zusammenfassung der offenen Aufgaben (#54): keine Mail je Aufgabe, sondern einmal
 * am Tag zur eingestellten Uhrzeit eine Übersicht an jeden, der offene Aufgaben hat.
 * Abbestellen im Profil (Einstellung aufgaben_mail = false).
 */

/** Werkbank: Versand an/aus, Standard-Uhrzeit (#92) und Bundesland für Feiertage (#94). */
export interface MailEinstellung { aktiv: boolean; uhrzeit: string; bundesland: Bundesland | null }
export const MAIL_STANDARD: MailEinstellung = { aktiv: true, uhrzeit: '07:00', bundesland: null };
/** Je Benutzer (#92, #94): eigene Uhrzeit (null = Standard), Wochentage 1 = Mo … 7 = So, „nicht an Feiertagen“. */
export interface MailZeit { uhrzeit: string | null; tage: number[]; feiertage: boolean }
export const STANDARD_TAGE = [1, 2, 3, 4, 5];
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Eigene Angaben (Einstellung „aufgaben_mail_zeit“) oder die Standards. */
export function wirksameZeit(eigen: unknown, std: MailEinstellung): MailZeit & { uhrzeit: string } {
  const x = (eigen && typeof eigen === 'object' ? eigen : {}) as Partial<MailZeit>;
  return {
    uhrzeit: typeof x.uhrzeit === 'string' && UHRZEIT.test(x.uhrzeit) ? x.uhrzeit : std.uhrzeit,
    tage: Array.isArray(x.tage) ? x.tage.filter((t) => Number.isInteger(t) && t >= 1 && t <= 7) : STANDARD_TAGE,
    feiertage: x.feiertage !== false,
  };
}

/** Prüft die Eingabe aus Profil bzw. Schnittstelle: Uhrzeit im 15-Minuten-Raster, Wochentage 1–7. */
export function pruefeZeit(e: unknown): MailZeit {
  const x = (e ?? {}) as Record<string, unknown>;
  const uhrzeit = x.uhrzeit == null || x.uhrzeit === '' ? null : String(x.uhrzeit);
  if (uhrzeit !== null && (!UHRZEIT.test(uhrzeit) || Number(uhrzeit.slice(3)) % 15)) throw new Fachfehler(422, 'Uhrzeit als HH:MM im 15-Minuten-Raster, z. B. 07:00 oder 18:45.');
  if (x.tage !== undefined && !Array.isArray(x.tage)) throw new Fachfehler(422, 'Wochentage als Liste, 1 = Montag bis 7 = Sonntag.');
  const tage = x.tage === undefined ? STANDARD_TAGE : [...new Set((x.tage as unknown[]).map(Number))].sort();
  if (tage.some((t) => !Number.isInteger(t) || t < 1 || t > 7)) throw new Fachfehler(422, 'Wochentage als Liste, 1 = Montag bis 7 = Sonntag.');
  return { uhrzeit, tage, feiertage: x.feiertage !== false };
}

export interface AufgabenQuelle {
  benutzer(): Promise<Benutzer[]>;
  einstellungenVon(b: Benutzer): Promise<Record<string, unknown>>;
  aufgabenVon(b: Benutzer): Promise<Aufgabe[]>;
  typName(id: string | undefined): Promise<string>;
}

const HEUTE = new Intl.DateTimeFormat('sv-SE', { timeZone: ZEITZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const UHR = new Intl.DateTimeFormat('de-DE', { timeZone: ZEITZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const WOCHENTAG = new Intl.DateTimeFormat('en-US', { timeZone: ZEITZONE, weekday: 'short' });
const TAGNR: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export class Aufgabenmail {
  constructor(
    private quelle: AufgabenQuelle,
    private mailer: () => Mailer | null,
    private adresse: () => string,
    private einstellungen?: Einstellungen,
  ) {}

  async einstellung(): Promise<MailEinstellung> {
    const e = (this.einstellungen ? await this.einstellungen.lies('aufgaben_mail') : null) as Partial<MailEinstellung> | null;
    const x = { ...MAIL_STANDARD, ...(e ?? {}) };
    return { ...x, bundesland: istBundesland(x.bundesland) ? x.bundesland : null };
  }

  async speichere(e: unknown): Promise<MailEinstellung> {
    if (!this.einstellungen) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    const x = (e ?? {}) as Record<string, unknown>;
    const alt = await this.einstellung();
    const uhrzeit = x.uhrzeit === undefined ? alt.uhrzeit : String(x.uhrzeit);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new Fachfehler(422, 'Uhrzeit als HH:MM, z. B. 07:00.');
    if (x.bundesland !== undefined && x.bundesland !== null && x.bundesland !== '' && !istBundesland(x.bundesland)) throw new Fachfehler(422, 'Unbekanntes Bundesland.');
    const bundesland = x.bundesland === undefined ? alt.bundesland : istBundesland(x.bundesland) ? x.bundesland : null;
    const neu: MailEinstellung = { aktiv: x.aktiv === undefined ? alt.aktiv : x.aktiv === true, uhrzeit, bundesland };
    await this.einstellungen.schreibe('aufgaben_mail', neu);
    protokoll.modul('werkbank').info('Tägliche Aufgaben-Mail eingestellt', { ...neu });
    return neu;
  }

  /**
   * Regelmäßig aufgerufen: je Benutzer höchstens einmal am Tag, frühestens zu seiner Uhrzeit, nur an
   * seinen Wochentagen und – wenn gewünscht – nicht an Feiertagen (#92, #94). War das DMS zur Uhrzeit
   * nicht erreichbar, kommt die Mail noch am selben Tag; am nächsten Tag wird nichts nachgeholt.
   */
  async pruefe(jetzt = new Date()): Promise<number> {
    const e = await this.einstellung();
    const mailer = this.mailer();
    if (!e.aktiv || !mailer || !this.einstellungen) return 0;
    const heute = HEUTE.format(jetzt);
    // Bis 0.16 gab es nur einen gemeinsamen Zeitpunkt: wurde heute schon so verschickt, nicht noch einmal.
    if ((await this.einstellungen.lies('aufgaben_mail_zuletzt')) === heute) return 0;
    const uhr = UHR.format(jetzt);
    const wochentag = TAGNR[WOCHENTAG.format(jetzt)];
    const feiertag = feiertagAm(heute, e.bundesland);
    let n = 0;
    for (const b of await this.quelle.benutzer()) {
      if (!b.aktiv || !b.email) continue;
      const einst = await this.quelle.einstellungenVon(b);
      if (einst.aufgaben_mail === false) continue;
      const z = wirksameZeit(einst.aufgaben_mail_zeit, e);
      if (!z.tage.includes(wochentag) || (feiertag && z.feiertage) || uhr < z.uhrzeit) continue;
      const schluessel = `aufgaben_mail_zuletzt:${b.id}`;
      if ((await this.einstellungen.lies(schluessel)) === heute) continue;
      await this.einstellungen.schreibe(schluessel, heute);
      if (await this.sendeAn(b, mailer)) n++;
    }
    if (n) protokoll.modul('mail').info('Tägliche Aufgaben-Mails verschickt', { anzahl: n });
    return n;
  }

  /** Jetzt senden (auch aus der Werkbank zum Ausprobieren). Liefert die Anzahl verschickter Mails. */
  async sende(): Promise<number> {
    const mailer = this.mailer();
    if (!mailer) throw new Fachfehler(409, 'Der E-Mail-Versand ist nicht eingerichtet (Werkbank → E-Mail und Adresse).');
    let n = 0;
    for (const b of await this.quelle.benutzer()) {
      if (!b.aktiv || !b.email) continue;
      if ((await this.quelle.einstellungenVon(b)).aufgaben_mail === false) continue;
      if (await this.sendeAn(b, mailer)) n++;
    }
    protokoll.modul('mail').info('Tägliche Aufgaben-Mails verschickt', { anzahl: n });
    return n;
  }

  /** Zusammenfassung an einen Benutzer; false, wenn er nichts offen hat, abwesend ist oder der Versand scheitert. */
  private async sendeAn(b: Benutzer, mailer: Mailer): Promise<boolean> {
    {
      // Abwesende bekommen keine Zusammenfassung (#78); ihr Vertreter sieht die weitergegebenen Aufgaben in seiner.
      if (abwesenheitWirkt(b.abwesenheit, heuteIn())) return false;
      const liste = await this.quelle.aufgabenVon(b);
      if (!liste.length) return false;
      const basis = this.adresse().replace(/\/+$/, '');
      const zeilen = await Promise.all(liste.map(async (a) => `- ${a.mappeTitel || 'Ohne Titel'} (${await this.quelle.typName(a.typId)}): ${a.text}\n  ${basis}/ablage/eingang/${a.mappeId}`));
      const text = `Hallo ${b.name || b.email},\n\ndu hast ${liste.length === 1 ? 'eine offene Aufgabe' : `${liste.length} offene Aufgaben`} im DMS:\n\n${zeilen.join('\n')}\n\nAlle findest du im Eingang: ${basis}/ablage/eingang\n\nUhrzeit und Wochentage dieser Zusammenfassung stellst du in deinem Profil ein; dort kannst du sie auch abbestellen.\n`;
      try {
        await mailer.sende(b.email, `DMS: ${liste.length === 1 ? 'eine offene Aufgabe' : `${liste.length} offene Aufgaben`}`, text);
        return true;
      } catch (e) {
        protokoll.modul('mail').warn('Aufgaben-Mail nicht verschickt', { an: b.email, fehler: (e as Error).message });
        return false;
      }
    }
  }
}
