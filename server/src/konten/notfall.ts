/**
 * Notfallcode vom Notfallblatt (#815) und Links per Mail (Einladung, Passwort setzen) – #1278, Teil von `Konten`.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { KontenProfil } from './profil';
import { NOTFALLCODE_LAENGE, NOTFALLCODE_ZEICHEN, normiereNotfallcode } from '../../../shared/src/notfallcode';
import { hashePasswort, pruefePasswort, neuerSchluessel, hasheSchluessel } from '../passwort';
import { type Benutzer, istPerson } from '../../../shared/src/model';
import { darfVerwalten, GESAMT } from '../../../shared/src/verwaltungsrecht';
import { pruefePasswortRegeln, type Ergebnis, EINLADUNG_TAGE, TAG, ZURUECKSETZEN_STUNDEN } from './hilfen';
import { Fachfehler } from '../fehler';
import { t, mitSpracheVon } from '../sprache';
import { zeitzone } from '../../../shared/src/region';
import type { Zweck } from '../konto-repo';
import { mailtexte } from '../mail';

/** Notfallcode und Links per Mail. */
export abstract class KontenNotfall extends KontenProfil {
  /* ---------- Notfallcode vom Notfallblatt (#815) ---------- */

  /**
   * Neuer Notfallcode für ein neues Notfallblatt: zufällig (140 Bit), gespeichert nur als Hash (scrypt wie beim
   * Abrufcode). Der bisherige gilt damit nicht mehr. Den Code selbst gibt es nur in diesem Rückgabewert – er steht
   * danach nur auf dem Blatt.
   */
  async neuerNotfallcode(): Promise<string> {
    let c = '';
    for (let i = 0; i < NOTFALLCODE_LAENGE; i++) c += NOTFALLCODE_ZEICHEN[randomInt(NOTFALLCODE_ZEICHEN.length)];
    await this.repo.setzeNotfallcode(await hashePasswort(c));
    return c;
  }

  /** Gibt es einen gültigen Notfallcode, und seit wann? */
  async notfallcodeStand(): Promise<{ vorhanden: boolean; erstellt: string | null }> {
    const n = await this.repo.notfallcode();
    return { vorhanden: !!n, erstellt: n?.erstellt.toISOString() ?? null };
  }

  /**
   * Notfallcode prüfen: immer ein scrypt-Durchlauf – auch ohne gespeicherten Code und bei falscher Schreibweise –,
   * damit die Antwortzeit nichts verrät. Liefert den Hash, gegen den er passte (fürs Einlösen), sonst null.
   */
  async pruefeNotfallcode(eingabe: unknown): Promise<string | null> {
    const code = normiereNotfallcode(eingabe);
    const n = await this.repo.notfallcode();
    const ok = await pruefePasswort(code ?? 'kein-notfallcode', code ? n?.hash : null);
    return ok && n ? n.hash : null;
  }

  /** Wählbar beim Notfallzugang: aktive Personen mit Verwaltungsrecht (#810: führt zu einer Person mit Verwaltungsrecht). */
  async notfallKonten(): Promise<Benutzer[]> {
    return (await this.repo.listeBenutzer()).filter((b) => istPerson(b) && b.aktiv && darfVerwalten(b));
  }

  /**
   * Notfallcode einlösen (#815): Code ungültig, neues Passwort, alle Sitzungen und Links weg – in einer Transaktion
   * (nur eine von zwei gleichzeitigen Anfragen gewinnt). Danach Zwei-Faktor zurücksetzen und Modus, Tagesmerker und
   * frische Anmeldung vergessen: Verwalten geht erst wieder nach einer neuen Anmeldung. Liefert die Person oder null,
   * wenn der Code inzwischen benutzt oder ersetzt ist.
   */
  async loeseNotfallcodeEin(hash: string, benutzerId: string, passwort: unknown): Promise<Benutzer | null> {
    const pw = pruefePasswortRegeln(passwort);
    const b = (await this.notfallKonten()).find((x) => x.id === benutzerId);
    if (!b) throw new Fachfehler(404, t('konten.notfall.fehler.konto'));
    if (!(await this.repo.loeseNotfallcodeEin(hash, b.id, await hashePasswort(pw)))) return null;
    if (this.zweifaktor) await this.zweifaktor.entferne(b.id, 'Notfallzugang');
    // Passkeys (#811) ebenso: Wer den Notfallzugang braucht, hat womöglich auch das Gerät nicht mehr.
    if (this.passkeys) await this.passkeys.entferneAlle(b.id, b.email, 'Notfallzugang');
    await this.repo.vergissVerwaltungVon(b.id);
    return (await this.repo.holeBenutzer(b.id)) ?? b;
  }

  /** Admin: neuen Link schicken (Einladung, wenn noch kein Passwort gesetzt ist, sonst Zurücksetzen). */
  /**
   * Notfallzugang (#108): neue Person mit „Gesamte Verwaltung“ (#818) ohne Passwort und ein Einmal-Link, der nur
   * `minuten` gilt; beim Öffnen legt man ein eigenes Passwort fest. Der Link wird nicht verschickt.
   */
  async notfallzugang(minuten: number, jetzt = new Date()): Promise<{ benutzer: Benutzer; link: string; ablauf: Date }> {
    const teile = Object.fromEntries(
      new Intl.DateTimeFormat('de-DE', {
        timeZone: zeitzone(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
        .formatToParts(jetzt)
        .map((x) => [x.type, x.value]),
    );
    const name = t('meldungen.konten.notfall-admin', {
      day: teile.day,
      month: teile.month,
      year: teile.year,
      hour: teile.hour,
      minute: teile.minute,
    });
    const email = `notfall-${teile.year}${teile.month}${teile.day}-${teile.hour}${teile.minute}${teile.second}@notfall.invalid`;
    const benutzer = await this.repo.legeBenutzerAn({ id: randomUUID(), email, name, verwaltung: [GESAMT], passwortHash: null });
    await this.spiegle(benutzer);
    const schluessel = neuerSchluessel();
    const ablauf = new Date(jetzt.getTime() + minuten * 60_000);
    await this.repo.legeLinkAn(hasheSchluessel(schluessel), benutzer.id, 'einladung', ablauf);
    return { benutzer, link: `${this.appUrl.replace(/\/$/, '')}/passwort/${schluessel}`, ablauf };
  }

  async neuerLink(id: string): Promise<Ergebnis> {
    const b = await this.person(id);
    if (!b) throw new Fachfehler(404, t('meldungen.konten.diesen-benutzer-gibt-es'));
    return this.verschickeLink(b, b.hatPasswort ? 'zuruecksetzen' : 'einladung');
  }

  protected async verschickeLink(b: Benutzer, zweck: Zweck): Promise<Ergebnis> {
    await this.repo.loescheLinksVon(b.id);
    const schluessel = neuerSchluessel();
    const dauer = zweck === 'einladung' ? EINLADUNG_TAGE * TAG : ZURUECKSETZEN_STUNDEN * 60 * 60 * 1000;
    await this.repo.legeLinkAn(hasheSchluessel(schluessel), b.id, zweck, new Date(Date.now() + dauer));
    const link = `${this.appUrl.replace(/\/$/, '')}/passwort/${schluessel}`;
    if (!this.mailer) return { benutzer: b, mailVerschickt: false, link };
    // Ohne gepflegte Adresse kein Link per Mail: Die Verwaltung bekommt ihn angezeigt wie ohne Mailversand.
    const basis = this.mailUrl;
    if (!basis) return { benutzer: b, mailVerschickt: false, link, mailFehler: t('meldungen.konten.link-ohne-adresse') };
    const mailLink = `${basis}/passwort/${schluessel}`;
    // In der Sprache der Person (#729); eine neue Person hat noch keine Wahl – dann die der Installation.
    const m = mitSpracheVon(b, () =>
      zweck === 'einladung'
        ? mailtexte.einladung(b.name, b.email, mailLink, EINLADUNG_TAGE)
        : mailtexte.zuruecksetzen(b.name, b.email, mailLink, ZURUECKSETZEN_STUNDEN),
    );
    try {
      await this.mailer.sende(b.email, m.betreff, m.text);
      return { benutzer: b, mailVerschickt: true };
    } catch (err) {
      return { benutzer: b, mailVerschickt: false, link, mailFehler: (err as Error).message };
    }
  }
}
