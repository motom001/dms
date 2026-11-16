/**
 * Persönliche Einstellungen und eigenes Profil (#1278, Teil von `Konten`).
 */
import { KontenSitzungen } from './sitzungen';
import type { Benutzer } from '../../../shared/src/model';
import { ZULETZT_MERKEN, text, pruefeEmail, type Geraet, OHNE_GERAET, pruefePasswortRegeln } from './hilfen';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { pruefePasswort, hashePasswort } from '../passwort';
import { erlaubteSprachen } from '../../../shared/src/beschriftung';
import { mailtexte } from '../mail';

/** Persönliche Einstellungen, Hinweise und eigenes Profil. */
export abstract class KontenProfil extends KontenSitzungen {
  /* ---------- Persönliche Einstellungen ---------- */

  einstellungen(ich: Benutzer) {
    return this.repo.einstellungen(ich.id);
  }

  /**
   * Startseite (#334): zuletzt geöffnete Mappen merken, neueste zuerst, mit Zeitpunkt (#940). Die Liste „Zuletzt
   * geöffnet“ zeigt bis zu {@link ZULETZT_LISTE} lesbare; gemerkt werden mehr, weil Mappen in den Papierkorb wandern
   * oder unlesbar werden können.
   */
  async merkeGeoeffnet(ich: Pick<Benutzer, 'id'>, mappeId: string) {
    await this.repo.merkeVorn(ich.id, 'zuletzt_geoeffnet', mappeId, ZULETZT_MERKEN);
  }

  async setzeEinstellung(ich: Benutzer, schluessel: string, wert: unknown) {
    if (!/^[a-z][a-z0-9:_-]{0,80}$/i.test(schluessel)) throw new Fachfehler(422, t('meldungen.konten.ungueltiger-name-der-einstellung'));
    if (wert !== null && JSON.stringify(wert ?? null).length > 4000)
      throw new Fachfehler(422, t('meldungen.konten.die-einstellung-ist-zu'));
    await this.repo.setzeEinstellung(ich.id, schluessel, wert ?? null);
  }

  /** Hinweise für den Benutzer: Wer hat als er agiert? */
  hinweise(benutzerId: string) {
    return this.repo.ungeseheneVertretungen(benutzerId);
  }
  hinweiseGesehen(benutzerId: string) {
    return this.repo.markiereGesehen(benutzerId);
  }

  /* ---------- Eigenes Profil ---------- */

  private async bestaetige(ich: Benutzer, passwort: unknown) {
    const eintrag = await this.repo.holeHash(ich.email);
    if (!eintrag || !(await pruefePasswort(typeof passwort === 'string' ? passwort : '', eintrag.hash))) {
      throw new Fachfehler(403, t('meldungen.konten.das-aktuelle-passwort-stimmt'));
    }
  }

  protected async benachrichtige(an: string, m: { betreff: string; text: string }, log: (m: string) => void) {
    if (!this.mailer) return;
    try {
      await this.mailer.sende(an, m.betreff, m.text);
    } catch (e) {
      log(`Hinweis-Mail an ${an} fehlgeschlagen: ${(e as Error).message}`);
    }
  }

  async aendereProfil(ich: Benutzer, e: { name?: unknown; entwicklermodus?: unknown; sprache?: unknown; uebersetzen?: unknown }) {
    const d: { name?: string; entwicklermodus?: boolean; sprache?: string | null; uebersetzen?: boolean } = {};
    // Sprache (#729): nur eine erlaubte; leer = wie die Installation.
    if (e.sprache !== undefined) {
      if (e.sprache === null || e.sprache === '') d.sprache = null;
      else if (typeof e.sprache === 'string' && erlaubteSprachen().includes(e.sprache)) d.sprache = e.sprache;
      else throw new Fachfehler(422, t('meldungen.konten.sprache-nicht-erlaubt'));
    }
    if (e.name !== undefined) {
      const name = text(e.name);
      if (!name) throw new Fachfehler(422, t('meldungen.konten.bitte-einen-namen-angeben'));
      d.name = name.slice(0, 120);
    }
    if (e.entwicklermodus !== undefined) d.entwicklermodus = !!e.entwicklermodus;
    // „Übersetzung anzeigen“ anbieten (#732): jede Person für sich, Vorgabe an.
    if (e.uebersetzen !== undefined) d.uebersetzen = e.uebersetzen !== false;
    const neu = await this.repo.aendereBenutzer(ich.id, d);
    return d.name !== undefined ? this.spiegle(neu, ich.id) : neu;
  }

  async aendereEmail(ich: Benutzer, e: { email?: unknown; passwort?: unknown }, log: (m: string) => void = () => {}) {
    const email = pruefeEmail(e.email);
    await this.bestaetige(ich, e.passwort);
    if (email.toLowerCase() === ich.email.toLowerCase()) return ich;
    if (await this.repo.holeHash(email)) throw new Fachfehler(409, t('meldungen.konten.diese-e-mail-adresse'));
    const neu = await this.repo.aendereBenutzer(ich.id, { email });
    await this.spiegle(neu, ich.id);
    await this.benachrichtige(ich.email, mailtexte.emailGeaendert(ich.name, ich.email, email), log);
    return neu;
  }

  /** Neues Passwort; beendet alle Sitzungen und gibt eine frische zurück. */
  async aenderePasswort(
    ich: Benutzer,
    e: { passwortAlt?: unknown; passwortNeu?: unknown },
    log: (m: string) => void = () => {},
    info: Geraet = OHNE_GERAET,
  ) {
    await this.bestaetige(ich, e.passwortAlt);
    const neu = pruefePasswortRegeln(e.passwortNeu);
    await this.repo.setzeHash(ich.id, await hashePasswort(neu));
    await this.repo.loescheSitzungenVon(ich.id);
    await this.benachrichtige(ich.email, mailtexte.passwortGeaendert(ich.name, ich.email), log);
    // Mit dem alten Passwort bestätigt: ohne Zwei-Faktor eine Anmeldung mit allen Faktoren (#819). Den Verwaltungsmodus
    // und den Tagesmerker hebt der Wechsel trotzdem auf – die alten Sitzungen sind weg.
    const voll = !this.zweifaktor || !(await this.zweifaktor.aktiv(ich.id));
    return { benutzer: (await this.repo.holeBenutzer(ich.id))!, schluessel: await this.neueSitzung(ich.id, { ...info, voll }) };
  }
}
