import type { Bundesland } from '../../shared/src/feiertage';
import { abwesenheitWirkt, type Aufgabe, type Benutzer } from '../../shared/src/model';
import { heuteIn } from '../../shared/src/sichten';
import { Fachfehler } from './fehler';
import type { Mailer } from './mail';
import { protokoll } from './protokoll';
import { mitSpracheVon, t } from './sprache';

/**
 * Tägliche Zusammenfassung der offenen Aufgaben (#54): keine Mail je Aufgabe, sondern einmal am Tag eine Übersicht an
 * jeden, der offene Aufgaben hat. Wann und für wen, entscheidet seit #678 die Automatisierung (Wenn „Zeitplan“ für jeden
 * Benutzer, Dann „Tägliche Zusammenfassung senden“); seit #1001 gibt es dafür keine Einstellung in der Werkbank mehr.
 * Hier stehen nur noch die Mail selbst und die persönlichen Zeiten. Abbestellen im Profil (Einstellung aufgaben_mail = false).
 */

/** Vorgaben für das Profil: Versand an (eine Automatisierung schickt sie), Uhrzeit der Automatisierung, Bundesland der Region. */
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
  if (uhrzeit !== null && (!UHRZEIT.test(uhrzeit) || Number(uhrzeit.slice(3)) % 15)) throw new Fachfehler(422, t('mail.aufgabenmail.uhrzeit-als-hh-mm'));
  if (x.tage !== undefined && !Array.isArray(x.tage)) throw new Fachfehler(422, t('mail.aufgabenmail.wochentage-als-liste-1'));
  const tage = x.tage === undefined ? STANDARD_TAGE : [...new Set((x.tage as unknown[]).map(Number))].sort();
  if (tage.some((t) => !Number.isInteger(t) || t < 1 || t > 7)) throw new Fachfehler(422, t('mail.aufgabenmail.wochentage-als-liste-1'));
  return { uhrzeit, tage, feiertage: x.feiertage !== false };
}

export interface AufgabenQuelle {
  benutzer(): Promise<Benutzer[]>;
  einstellungenVon(b: Benutzer): Promise<Record<string, unknown>>;
  aufgabenVon(b: Benutzer): Promise<Aufgabe[]>;
  typName(id: string | undefined): Promise<string>;
}


export class Aufgabenmail {
  constructor(
    private quelle: AufgabenQuelle,
    private mailer: () => Mailer | null,
    private adresse: () => string,
  ) {}

  /**
   * Dann-Karte „Tägliche Zusammenfassung senden“ (#678): an genau einen Benutzer, mit Grund für den Verlauf. Abbestellt
   * im Profil, abwesend oder nichts offen → nichts (wie bisher). Wann, entscheidet die Wenn-Karte „Zeitplan“.
   */
  async fuerAutomatisierung(benutzerId: string, trocken: boolean): Promise<{ gesendet: boolean; grund: string; schluessel: string; name: string; anzahl: number }> {
    const b = (await this.quelle.benutzer()).find((x) => x.id === benutzerId);
    const name = b?.name || b?.email || '?';
    const r = (schluessel: string, gesendet = false, anzahl = 0) => ({ gesendet, schluessel, name, anzahl, grund: '' });
    if (!b || !b.aktiv || !b.email) return r('ohne-adresse');
    if ((await this.quelle.einstellungenVon(b)).aufgaben_mail === false) return r('abbestellt');
    if (abwesenheitWirkt(b.abwesenheit, heuteIn())) return r('abwesend');
    const anzahl = (await this.quelle.aufgabenVon(b)).length;
    if (!anzahl) return r('nichts');
    const mailer = this.mailer();
    if (!mailer) return r('kein-versand');
    if (trocken) return r('trocken', false, anzahl);
    return (await this.sendeAn(b, mailer)) ? r('gesendet', true, anzahl) : r('fehler');
  }

  /** Zusammenfassung an einen Benutzer; false, wenn er nichts offen hat, abwesend ist oder der Versand scheitert. */
  private async sendeAn(b: Benutzer, mailer: Mailer): Promise<boolean> {
    // In der Sprache der Person (#729).
    return mitSpracheVon(b, async () => {
      // Abwesende bekommen keine Zusammenfassung (#78); ihr Vertreter sieht die weitergegebenen Aufgaben in seiner.
      if (abwesenheitWirkt(b.abwesenheit, heuteIn())) return false;
      const liste = await this.quelle.aufgabenVon(b);
      if (!liste.length) return false;
      const basis = this.adresse().replace(/\/+$/, '');
      const zeilen = await Promise.all(liste.map(async (a) => t('mail.aufgabenmail.ablage-eingang', { titel: a.mappeTitel || t('mail.aufgabenmail.ohne-titel'), typName: await this.quelle.typName(a.typId), text: a.text, basis, mappeId: a.mappeId })));
      const text = t('mail.aufgabenmail.hallo-du-hast-offene', { anzahl: liste.length, name: b.name || b.email, zeilen: zeilen.join('\n'), basis });
      try {
        await mailer.sende(b.email, `Ablago: ${t('mail.aufgabenmail.offene-aufgaben', { anzahl: liste.length })}`, text);
        return true;
      } catch (e) {
        protokoll.modul('mail').warn('Aufgaben-Mail nicht verschickt', { an: b.email, fehler: (e as Error).message });
        return false;
      }
    });
  }
}
