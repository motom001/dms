/**
 * Konten (#1278, vorher `server/src/konten.ts`): die Klasse, die alle Teile zusammensetzt; hier selbst „Passwort
 * vergessen / setzen“.
 */
import { KontenBenutzer } from './benutzer';
import { text, type Geraet, OHNE_GERAET, pruefePasswortRegeln } from './hilfen';
import { istEmail } from '../../../shared/src/model';
import { t } from '../sprache/sprache';
import { hasheSchluessel, hashePasswort } from '../anmeldung/passwort';
import { Fachfehler } from '../grundlagen/fehler';
import { darfVerwalten } from '../../../shared/src/verwaltungsrecht';

/**
 * Anmeldung, Sitzungen, Benutzerverwaltung und Passwort-Links.
 * Schlüssel für Sitzungen und Links werden nur als Hash gespeichert.
 */
export class Konten extends KontenBenutzer {
  /* ---------- Passwort vergessen / setzen (öffentlich) ---------- */

  /** Antwortet immer gleich, damit niemand herausfinden kann, welche Adressen es gibt. */
  async passwortVergessen(e: { email?: unknown }, log: (m: string) => void = () => {}) {
    const email = text(e.email);
    if (!this.mailer || !istEmail(email)) return;
    // Ohne gepflegte Adresse keine Mail mit Link (siehe mailAdresse); antwortet trotzdem gleich.
    if (!this.mailUrl) {
      log('Passwort vergessen: keine Mail, weil die Adresse von Ablago nicht gepflegt ist');
      return;
    }
    const t = await this.repo.holeHash(email);
    if (!t || !t.benutzer.aktiv) return;
    const r = await this.verschickeLink(t.benutzer, t.benutzer.hatPasswort ? 'zuruecksetzen' : 'einladung');
    if (r.mailFehler) log(`Mail an ${email} fehlgeschlagen: ${r.mailFehler}`);
  }

  async linkPruefen(schluessel: string) {
    const l = await this.repo.holeLink(hasheSchluessel(schluessel));
    if (!l || l.benutzt || l.ablauf.getTime() < Date.now()) throw new Fachfehler(410, t('anmeldung.fehler.link.abgelaufen'));
    const b = await this.repo.holeBenutzer(l.benutzerId);
    if (!b || !b.aktiv) throw new Fachfehler(410, t('anmeldung.fehler.link.ungueltig'));
    return { email: b.email, name: b.name, zweck: l.zweck };
  }

  async passwortSetzen(e: { schluessel?: unknown; passwort?: unknown }, info: Geraet = OHNE_GERAET) {
    const schluessel = text(e.schluessel);
    const passwort = pruefePasswortRegeln(e.passwort);
    await this.linkPruefen(schluessel);
    const hash = hasheSchluessel(schluessel);
    const l = (await this.repo.holeLink(hash))!;
    // Anbieter (#241) mit „Passwort nur für Verwaltende“ (#818): kein Passwort für alle anderen.
    const a = await this.anbieter();
    if (a?.lokalNurAdmins && !darfVerwalten(await this.repo.holeBenutzer(l.benutzerId)))
      throw new Fachfehler(403, t('anmeldung.fehler.anbieter', { knopf: a.knopf }));
    if (!(await this.repo.verbraucheLink(hash))) throw new Fachfehler(410, t('anmeldung.fehler.link.benutzt'));
    await this.repo.setzeHash(l.benutzerId, await hashePasswort(passwort));
    await this.repo.loescheSitzungenVon(l.benutzerId);
    const benutzer = (await this.repo.holeBenutzer(l.benutzerId))!;
    // Zwei-Faktor (#242) und Passkey (#811): Der Link ersetzt nur das Passwort, nicht den zweiten Faktor.
    const wege = await this.zweiteWege(benutzer);
    if (wege) return { benutzer, zweiterSchritt: await this.merkeZweitenSchritt(benutzer.id, benutzer.email, info), wege };
    await this.repo.notiereAnmeldung(l.benutzerId);
    return { benutzer, schluessel: await this.neueSitzung(l.benutzerId, { ...info, voll: true }) };
  }
}
