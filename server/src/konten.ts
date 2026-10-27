import { randomUUID } from 'node:crypto';
import { istEmail, PASSWORT_MINDESTLAENGE, type Benutzer, type Rolle } from '../../shared/src/model';
import { Fachfehler } from './fehler';
import type { KontoRepo, Zweck } from './konto-repo';
import { mailtexte, type Mailer } from './mail';
import { hashePasswort, hasheSchluessel, neuerSchluessel, pruefePasswort } from './passwort';

const TAG = 24 * 60 * 60 * 1000;
export const SITZUNG_TAGE = 30;
const EINLADUNG_TAGE = 7;
const ZURUECKSETZEN_STUNDEN = 1;
const MAX_FEHLVERSUCHE = 5;
const SPERRE_MS = 60_000;

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
const rolleAus = (v: unknown): Rolle => (v === 'admin' ? 'admin' : 'mitglied');

function pruefePasswortRegeln(pw: unknown): string {
  const s = typeof pw === 'string' ? pw : '';
  if (s.length < PASSWORT_MINDESTLAENGE) throw new Fachfehler(422, `Das Passwort braucht mindestens ${PASSWORT_MINDESTLAENGE} Zeichen.`);
  if (s.length > 200) throw new Fachfehler(422, 'Das Passwort ist zu lang.');
  return s;
}
function pruefeEmail(v: unknown): string {
  const e = text(v);
  if (!istEmail(e)) throw new Fachfehler(422, 'Bitte eine gültige E-Mail-Adresse angeben.');
  return e;
}

export interface Ergebnis { benutzer: Benutzer; mailVerschickt: boolean; link?: string; mailFehler?: string }

/**
 * Anmeldung, Sitzungen, Benutzerverwaltung und Passwort-Links.
 * Schlüssel für Sitzungen und Links werden nur als Hash gespeichert.
 */
export class Konten {
  private fehlversuche = new Map<string, { anzahl: number; bis: number }>();

  constructor(private repo: KontoRepo, private mailer: Mailer | null, private appUrl: string) {}

  get mailAktiv() { return !!this.mailer; }

  async einrichtungNoetig() { return (await this.repo.anzahlBenutzer()) === 0; }

  /** Erster Aufruf: legt den Administrator an und meldet ihn an. */
  async einrichten(e: { email?: unknown; name?: unknown; passwort?: unknown }) {
    if (!(await this.einrichtungNoetig())) throw new Fachfehler(409, 'Die Einrichtung ist bereits abgeschlossen.');
    const email = pruefeEmail(e.email);
    const passwort = pruefePasswortRegeln(e.passwort);
    const benutzer = await this.repo.legeBenutzerAn({ id: randomUUID(), email, name: text(e.name) || email, rolle: 'admin', passwortHash: await hashePasswort(passwort) });
    return { benutzer, schluessel: await this.neueSitzung(benutzer.id) };
  }

  async anmelden(e: { email?: unknown; passwort?: unknown }, ip: string) {
    const email = text(e.email).toLowerCase();
    const passwort = typeof e.passwort === 'string' ? e.passwort : '';
    const key = `${email}|${ip}`;
    const sperre = this.fehlversuche.get(key);
    if (sperre && sperre.anzahl >= MAX_FEHLVERSUCHE && sperre.bis > Date.now()) {
      throw new Fachfehler(429, 'Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen.');
    }
    const treffer = email ? await this.repo.holeHash(email) : undefined;
    const ok = await pruefePasswort(passwort, treffer?.hash);
    if (!ok || !treffer || !treffer.benutzer.aktiv) {
      const n = (sperre && sperre.bis > Date.now() ? sperre.anzahl : 0) + 1;
      this.fehlversuche.set(key, { anzahl: n, bis: Date.now() + SPERRE_MS });
      throw new Fachfehler(401, 'E-Mail-Adresse oder Passwort stimmen nicht.');
    }
    this.fehlversuche.delete(key);
    await this.repo.notiereAnmeldung(treffer.benutzer.id);
    return { benutzer: treffer.benutzer, schluessel: await this.neueSitzung(treffer.benutzer.id) };
  }

  private async neueSitzung(benutzerId: string) {
    const schluessel = neuerSchluessel();
    await this.repo.legeSitzungAn(hasheSchluessel(schluessel), benutzerId, new Date(Date.now() + SITZUNG_TAGE * TAG));
    return schluessel;
  }

  async abmelden(schluessel?: string) {
    if (schluessel) await this.repo.loescheSitzung(hasheSchluessel(schluessel));
  }

  /** Benutzer zur Sitzung, oder undefined, wenn sie ungültig, abgelaufen oder der Benutzer deaktiviert ist. */
  async benutzerZu(schluessel?: string): Promise<Benutzer | undefined> {
    if (!schluessel) return undefined;
    const s = await this.repo.holeSitzung(hasheSchluessel(schluessel));
    if (!s || s.ablauf.getTime() < Date.now()) return undefined;
    const b = await this.repo.holeBenutzer(s.benutzerId);
    return b && b.aktiv ? b : undefined;
  }

  /* ---------- Eigenes Profil ---------- */

  private async bestaetige(ich: Benutzer, passwort: unknown) {
    const t = await this.repo.holeHash(ich.email);
    if (!t || !(await pruefePasswort(typeof passwort === 'string' ? passwort : '', t.hash))) {
      throw new Fachfehler(403, 'Das aktuelle Passwort stimmt nicht.');
    }
  }

  private async benachrichtige(an: string, m: { betreff: string; text: string }, log: (m: string) => void) {
    if (!this.mailer) return;
    try { await this.mailer.sende(an, m.betreff, m.text); } catch (e) { log(`Hinweis-Mail an ${an} fehlgeschlagen: ${(e as Error).message}`); }
  }

  async aendereProfil(ich: Benutzer, e: { name?: unknown }) {
    const name = text(e.name);
    if (!name) throw new Fachfehler(422, 'Bitte einen Namen angeben.');
    return this.repo.aendereBenutzer(ich.id, { name: name.slice(0, 120) });
  }

  async aendereEmail(ich: Benutzer, e: { email?: unknown; passwort?: unknown }, log: (m: string) => void = () => {}) {
    const email = pruefeEmail(e.email);
    await this.bestaetige(ich, e.passwort);
    if (email.toLowerCase() === ich.email.toLowerCase()) return ich;
    if (await this.repo.holeHash(email)) throw new Fachfehler(409, 'Diese E-Mail-Adresse wird schon von einem anderen Benutzer verwendet.');
    const neu = await this.repo.aendereBenutzer(ich.id, { email });
    await this.benachrichtige(ich.email, mailtexte.emailGeaendert(ich.name, ich.email, email), log);
    return neu;
  }

  /** Neues Passwort; beendet alle Sitzungen und gibt eine frische zurück. */
  async aenderePasswort(ich: Benutzer, e: { passwortAlt?: unknown; passwortNeu?: unknown }, log: (m: string) => void = () => {}) {
    await this.bestaetige(ich, e.passwortAlt);
    const neu = pruefePasswortRegeln(e.passwortNeu);
    await this.repo.setzeHash(ich.id, await hashePasswort(neu));
    await this.repo.loescheSitzungenVon(ich.id);
    await this.benachrichtige(ich.email, mailtexte.passwortGeaendert(ich.name, ich.email), log);
    return { benutzer: (await this.repo.holeBenutzer(ich.id))!, schluessel: await this.neueSitzung(ich.id) };
  }

  /* ---------- Benutzerverwaltung (nur Admin) ---------- */

  listeBenutzer() { return this.repo.listeBenutzer(); }

  /** Für alle Angemeldeten: nur Id und Name, z. B. für „angelegt von“. */
  async personen() { return (await this.repo.listeBenutzer()).map((b) => ({ id: b.id, name: b.name || b.email })); }

  async legeBenutzerAn(e: { email?: unknown; name?: unknown; rolle?: unknown }): Promise<Ergebnis> {
    const email = pruefeEmail(e.email);
    if (await this.repo.holeHash(email)) throw new Fachfehler(409, 'Für diese E-Mail-Adresse gibt es schon einen Benutzer.');
    const benutzer = await this.repo.legeBenutzerAn({ id: randomUUID(), email, name: text(e.name), rolle: rolleAus(e.rolle), passwortHash: null });
    return this.verschickeLink(benutzer, 'einladung');
  }

  private async anzahlAktiverAdmins(ausser?: string) {
    return (await this.repo.listeBenutzer()).filter((b) => b.rolle === 'admin' && b.aktiv && b.id !== ausser).length;
  }

  async aendereBenutzer(ich: Benutzer, id: string, e: { name?: unknown; rolle?: unknown; aktiv?: unknown }) {
    const b = await this.repo.holeBenutzer(id);
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    const d: Partial<Pick<Benutzer, 'name' | 'rolle' | 'aktiv'>> = {};
    if (e.name !== undefined) d.name = text(e.name);
    if (e.rolle !== undefined) d.rolle = rolleAus(e.rolle);
    if (e.aktiv !== undefined) d.aktiv = !!e.aktiv;
    const verliertAdmin = b.rolle === 'admin' && b.aktiv && (d.rolle === 'mitglied' || d.aktiv === false);
    if (verliertAdmin && (await this.anzahlAktiverAdmins(id)) === 0) throw new Fachfehler(409, 'Es muss mindestens einen aktiven Administrator geben.');
    if (id === ich.id && d.aktiv === false) throw new Fachfehler(409, 'Du kannst dich nicht selbst deaktivieren.');
    const neu = await this.repo.aendereBenutzer(id, d);
    if (d.aktiv === false) await this.repo.loescheSitzungenVon(id);
    return neu;
  }

  async loescheBenutzer(ich: Benutzer, id: string) {
    const b = await this.repo.holeBenutzer(id);
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    if (id === ich.id) throw new Fachfehler(409, 'Du kannst dich nicht selbst löschen.');
    if (b.rolle === 'admin' && b.aktiv && (await this.anzahlAktiverAdmins(id)) === 0) throw new Fachfehler(409, 'Es muss mindestens einen aktiven Administrator geben.');
    await this.repo.loescheBenutzer(id);
  }

  /** Admin: neuen Link schicken (Einladung, wenn noch kein Passwort gesetzt ist, sonst Zurücksetzen). */
  async neuerLink(id: string): Promise<Ergebnis> {
    const b = await this.repo.holeBenutzer(id);
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    return this.verschickeLink(b, b.hatPasswort ? 'zuruecksetzen' : 'einladung');
  }

  private async verschickeLink(b: Benutzer, zweck: Zweck): Promise<Ergebnis> {
    await this.repo.loescheLinksVon(b.id);
    const schluessel = neuerSchluessel();
    const dauer = zweck === 'einladung' ? EINLADUNG_TAGE * TAG : ZURUECKSETZEN_STUNDEN * 60 * 60 * 1000;
    await this.repo.legeLinkAn(hasheSchluessel(schluessel), b.id, zweck, new Date(Date.now() + dauer));
    const link = `${this.appUrl.replace(/\/$/, '')}/passwort/${schluessel}`;
    if (!this.mailer) return { benutzer: b, mailVerschickt: false, link };
    const m = zweck === 'einladung'
      ? mailtexte.einladung(b.name, b.email, link, EINLADUNG_TAGE)
      : mailtexte.zuruecksetzen(b.name, b.email, link, ZURUECKSETZEN_STUNDEN);
    try {
      await this.mailer.sende(b.email, m.betreff, m.text);
      return { benutzer: b, mailVerschickt: true };
    } catch (err) {
      return { benutzer: b, mailVerschickt: false, link, mailFehler: (err as Error).message };
    }
  }

  /* ---------- Passwort vergessen / setzen (öffentlich) ---------- */

  /** Antwortet immer gleich, damit niemand herausfinden kann, welche Adressen es gibt. */
  async passwortVergessen(e: { email?: unknown }, log: (m: string) => void = () => {}) {
    const email = text(e.email);
    if (!this.mailer || !istEmail(email)) return;
    const t = await this.repo.holeHash(email);
    if (!t || !t.benutzer.aktiv) return;
    const r = await this.verschickeLink(t.benutzer, t.benutzer.hatPasswort ? 'zuruecksetzen' : 'einladung');
    if (r.mailFehler) log(`Mail an ${email} fehlgeschlagen: ${r.mailFehler}`);
  }

  async linkPruefen(schluessel: string) {
    const l = await this.repo.holeLink(hasheSchluessel(schluessel));
    if (!l || l.benutzt || l.ablauf.getTime() < Date.now()) throw new Fachfehler(410, 'Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte einen neuen anfordern.');
    const b = await this.repo.holeBenutzer(l.benutzerId);
    if (!b || !b.aktiv) throw new Fachfehler(410, 'Dieser Link ist nicht mehr gültig.');
    return { email: b.email, name: b.name, zweck: l.zweck };
  }

  async passwortSetzen(e: { schluessel?: unknown; passwort?: unknown }) {
    const schluessel = text(e.schluessel);
    const passwort = pruefePasswortRegeln(e.passwort);
    await this.linkPruefen(schluessel);
    const hash = hasheSchluessel(schluessel);
    const l = (await this.repo.holeLink(hash))!;
    if (!(await this.repo.verbraucheLink(hash))) throw new Fachfehler(410, 'Dieser Link wurde schon benutzt.');
    await this.repo.setzeHash(l.benutzerId, await hashePasswort(passwort));
    await this.repo.loescheSitzungenVon(l.benutzerId);
    await this.repo.notiereAnmeldung(l.benutzerId);
    const benutzer = (await this.repo.holeBenutzer(l.benutzerId))!;
    return { benutzer, schluessel: await this.neueSitzung(l.benutzerId) };
  }
}
