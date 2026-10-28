import { randomUUID } from 'node:crypto';
import { istEmail, PASSWORT_MINDESTLAENGE, type Benutzer, type Rolle } from '../../shared/src/model';
import { Fachfehler } from './fehler';
import type { KontoRepo, SitzungIntern, SitzungsInfo, Zweck } from './konto-repo';
import type { Benutzerspiegel } from './dienst';
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

/** Gerät und Adresse, von denen eine Anmeldung kommt. */
export type Geraet = Pick<SitzungsInfo, 'geraet' | 'ip'>;
const OHNE_GERAET: Geraet = { geraet: '', ip: '' };
/** Letzte Aktivität höchstens einmal je Minute schreiben. */
const BERUEHREN_MS = 60_000;

export interface Ergebnis { benutzer: Benutzer; mailVerschickt: boolean; link?: string; mailFehler?: string }

/**
 * Anmeldung, Sitzungen, Benutzerverwaltung und Passwort-Links.
 * Schlüssel für Sitzungen und Links werden nur als Hash gespeichert.
 */
export class Konten {
  private fehlversuche = new Map<string, { anzahl: number; bis: number }>();

  /**
   * `spiegel` hält die Benutzer-Mappen (#26) auf dem Stand der Konten: Das Konto ist führend,
   * die Mappe zeigt Name, E-Mail, Rolle und ob der Benutzer aktiv ist.
   */
  constructor(
    private repo: KontoRepo,
    /** Mailer oder – seit #37 – eine Funktion, die den gerade eingestellten liefert (Werkbank, ohne Neustart). */
    private mailQuelle: Mailer | null | (() => Mailer | null),
    /** Adresse für Links; als Funktion je Anfrage (gepflegt oder Adresse der Anfrage). */
    private adresse: string | (() => string),
    private spiegel: Benutzerspiegel | null = null,
  ) {}

  private get mailer(): Mailer | null { return typeof this.mailQuelle === 'function' ? this.mailQuelle() : this.mailQuelle; }
  private get appUrl(): string { return typeof this.adresse === 'function' ? this.adresse() : this.adresse; }

  private async spiegle(b: Benutzer, von: string | null = null) {
    if (this.spiegel) await this.spiegel.aktualisiere(b, von);
    return b;
  }

  get mailAktiv() { return !!this.mailer; }

  async einrichtungNoetig() { return (await this.repo.anzahlBenutzer()) === 0; }

  /** Erster Aufruf: legt den Administrator an und meldet ihn an. */
  async einrichten(e: { email?: unknown; name?: unknown; passwort?: unknown }, info: Geraet = OHNE_GERAET) {
    if (!(await this.einrichtungNoetig())) throw new Fachfehler(409, 'Die Einrichtung ist bereits abgeschlossen.');
    const email = pruefeEmail(e.email);
    const passwort = pruefePasswortRegeln(e.passwort);
    const benutzer = await this.repo.legeBenutzerAn({ id: randomUUID(), email, name: text(e.name) || email, rolle: 'admin', passwortHash: await hashePasswort(passwort) });
    await this.repo.notiereAnmeldung(benutzer.id);
    await this.spiegle(benutzer, benutzer.id);
    return { benutzer, schluessel: await this.neueSitzung(benutzer.id, info) };
  }

  async anmelden(e: { email?: unknown; passwort?: unknown }, ip: string, geraet = '') {
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
    return { benutzer: treffer.benutzer, schluessel: await this.neueSitzung(treffer.benutzer.id, { ip, geraet }) };
  }

  private async neueSitzung(benutzerId: string, info: Geraet, vertretungId: string | null = null) {
    const schluessel = neuerSchluessel();
    await this.repo.legeSitzungAn(hasheSchluessel(schluessel), benutzerId, new Date(Date.now() + SITZUNG_TAGE * TAG), { ...info, vertretungId });
    return schluessel;
  }

  async abmelden(schluessel?: string) {
    if (!schluessel) return;
    const hash = hasheSchluessel(schluessel);
    const s = await this.repo.holeSitzung(hash);
    if (s?.vertretungId) await this.repo.beendeVertretung(s.vertretungId);
    await this.repo.loescheSitzung(hash);
  }

  /** Benutzer und Sitzung zum Schlüssel, oder undefined, wenn sie ungültig, abgelaufen oder der Benutzer deaktiviert ist. */
  async anmeldungZu(schluessel?: string): Promise<{ benutzer: Benutzer; sitzung: SitzungIntern } | undefined> {
    if (!schluessel) return undefined;
    const hash = hasheSchluessel(schluessel);
    const s = await this.repo.holeSitzung(hash);
    if (!s || s.ablauf.getTime() < Date.now()) return undefined;
    const b = await this.repo.holeBenutzer(s.benutzerId);
    if (!b || !b.aktiv) return undefined;
    if (Date.now() - s.zuletztAktiv.getTime() > BERUEHREN_MS) await this.repo.beruehreSitzung(hash);
    return { benutzer: b, sitzung: s };
  }

  /** Aktiver Benutzer zur Id (für API-Schlüssel). */
  async benutzerMitId(id: string): Promise<Benutzer | undefined> {
    const b = await this.repo.holeBenutzer(id);
    return b?.aktiv ? b : undefined;
  }

  async benutzerZu(schluessel?: string): Promise<Benutzer | undefined> {
    return (await this.anmeldungZu(schluessel))?.benutzer;
  }

  /* ---------- Sitzungen (Admin) ---------- */

  async sitzungenVon(benutzerId: string, aktuelleId?: string) {
    if (!(await this.repo.holeBenutzer(benutzerId))) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    return (await this.repo.listeSitzungen(benutzerId)).map(({ hash: _h, ...x }) => ({ ...x, aktuell: x.id === aktuelleId }));
  }

  async beendeSitzung(benutzerId: string, id: string) {
    const s = (await this.repo.listeSitzungen(benutzerId)).find((x) => x.id === id);
    if (!s) throw new Fachfehler(404, 'Diese Sitzung gibt es nicht (mehr).');
    if (s.vertretungId) await this.repo.beendeVertretung(s.vertretungId);
    await this.repo.loescheSitzungMitId(benutzerId, id);
  }

  /** Alle anderen eigenen Sitzungen beenden, z. B. nach einem verlorenen Handy (#69). */
  async beendeAndereSitzungen(benutzerId: string, aktuelleId: string | undefined) {
    const liste = (await this.repo.listeSitzungen(benutzerId)).filter((s) => s.id !== aktuelleId);
    for (const s of liste) await this.beendeSitzung(benutzerId, s.id);
    return { beendet: liste.length };
  }

  async beendeAlleSitzungen(benutzerId: string) {
    const liste = await this.repo.listeSitzungen(benutzerId);
    for (const s of liste) if (s.vertretungId) await this.repo.beendeVertretung(s.vertretungId);
    await this.repo.loescheSitzungenVon(benutzerId);
    return { beendet: liste.length };
  }

  /* ---------- Als anderer Benutzer anmelden (Admin) ---------- */

  /**
   * Der Administrator wechselt in eine Sitzung des Benutzers. Seine eigene Sitzung endet;
   * zurück geht es mit vertretungBeenden. Der Benutzer erfährt davon bei seiner nächsten Anmeldung.
   */
  async vertrete(admin: Benutzer, adminSchluessel: string | undefined, zielId: string, info: Geraet) {
    if (admin.rolle !== 'admin') throw new Fachfehler(403, 'Dafür sind Administratorrechte nötig.');
    const ziel = await this.repo.holeBenutzer(zielId);
    if (!ziel) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    if (ziel.id === admin.id) throw new Fachfehler(409, 'Du bist bereits du selbst.');
    if (!ziel.aktiv) throw new Fachfehler(409, 'Der Benutzer ist deaktiviert.');
    const id = randomUUID();
    await this.repo.legeVertretungAn({ id, benutzerId: ziel.id, adminId: admin.id, adminName: admin.name || admin.email });
    const schluessel = await this.neueSitzung(ziel.id, info, id);
    if (adminSchluessel) await this.repo.loescheSitzung(hasheSchluessel(adminSchluessel));
    return { benutzer: ziel, schluessel };
  }

  /** Zurück ins eigene Konto: beendet die Vertretung und meldet den Administrator wieder an. */
  async vertretungBeenden(schluessel: string | undefined, info: Geraet) {
    const a = await this.anmeldungZu(schluessel);
    if (!a?.sitzung.vertretungId) throw new Fachfehler(409, 'Du agierst gerade nicht als anderer Benutzer.');
    const v = await this.repo.holeVertretung(a.sitzung.vertretungId);
    await this.repo.beendeVertretung(a.sitzung.vertretungId);
    await this.repo.loescheSitzung(hasheSchluessel(schluessel!));
    const admin = v?.adminId ? await this.repo.holeBenutzer(v.adminId) : undefined;
    if (!admin || !admin.aktiv || admin.rolle !== 'admin') return { benutzer: null, schluessel: null };
    return { benutzer: admin, schluessel: await this.neueSitzung(admin.id, info) };
  }

  /** Läuft in dieser Sitzung eine Vertretung, wer ist der Administrator? */
  async vertretungZu(sitzung?: SitzungIntern) {
    if (!sitzung?.vertretungId) return null;
    const v = await this.repo.holeVertretung(sitzung.vertretungId);
    return v ? { adminName: v.adminName, beginn: v.beginn } : null;
  }

  /* ---------- Persönliche Einstellungen ---------- */

  einstellungen(ich: Benutzer) { return this.repo.einstellungen(ich.id); }

  async setzeEinstellung(ich: Benutzer, schluessel: string, wert: unknown) {
    if (!/^[a-z][a-z0-9:_-]{0,80}$/i.test(schluessel)) throw new Fachfehler(422, 'Ungültiger Name der Einstellung.');
    if (wert !== null && JSON.stringify(wert ?? null).length > 4000) throw new Fachfehler(422, 'Die Einstellung ist zu groß.');
    await this.repo.setzeEinstellung(ich.id, schluessel, wert ?? null);
  }

  /** Hinweise für den Benutzer: Wer hat als er agiert? */
  hinweise(benutzerId: string) { return this.repo.ungeseheneVertretungen(benutzerId); }
  hinweiseGesehen(benutzerId: string) { return this.repo.markiereGesehen(benutzerId); }

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

  async aendereProfil(ich: Benutzer, e: { name?: unknown; entwicklermodus?: unknown }) {
    const d: { name?: string; entwicklermodus?: boolean } = {};
    if (e.name !== undefined) {
      const name = text(e.name);
      if (!name) throw new Fachfehler(422, 'Bitte einen Namen angeben.');
      d.name = name.slice(0, 120);
    }
    if (e.entwicklermodus !== undefined) d.entwicklermodus = !!e.entwicklermodus;
    const neu = await this.repo.aendereBenutzer(ich.id, d);
    return d.name !== undefined ? this.spiegle(neu, ich.id) : neu;
  }

  async aendereEmail(ich: Benutzer, e: { email?: unknown; passwort?: unknown }, log: (m: string) => void = () => {}) {
    const email = pruefeEmail(e.email);
    await this.bestaetige(ich, e.passwort);
    if (email.toLowerCase() === ich.email.toLowerCase()) return ich;
    if (await this.repo.holeHash(email)) throw new Fachfehler(409, 'Diese E-Mail-Adresse wird schon von einem anderen Benutzer verwendet.');
    const neu = await this.repo.aendereBenutzer(ich.id, { email });
    await this.spiegle(neu, ich.id);
    await this.benachrichtige(ich.email, mailtexte.emailGeaendert(ich.name, ich.email, email), log);
    return neu;
  }

  /** Neues Passwort; beendet alle Sitzungen und gibt eine frische zurück. */
  async aenderePasswort(ich: Benutzer, e: { passwortAlt?: unknown; passwortNeu?: unknown }, log: (m: string) => void = () => {}, info: Geraet = OHNE_GERAET) {
    await this.bestaetige(ich, e.passwortAlt);
    const neu = pruefePasswortRegeln(e.passwortNeu);
    await this.repo.setzeHash(ich.id, await hashePasswort(neu));
    await this.repo.loescheSitzungenVon(ich.id);
    await this.benachrichtige(ich.email, mailtexte.passwortGeaendert(ich.name, ich.email), log);
    return { benutzer: (await this.repo.holeBenutzer(ich.id))!, schluessel: await this.neueSitzung(ich.id, info) };
  }

  /* ---------- Benutzerverwaltung (nur Admin) ---------- */

  listeBenutzer() { return this.repo.listeBenutzer(); }

  /** Für alle Angemeldeten: nur Id und Name, z. B. für „angelegt von“. */
  async personen() { return (await this.repo.listeBenutzer()).map((b) => ({ id: b.id, name: b.name || b.email, aktiv: b.aktiv })); }

  async legeBenutzerAn(e: { email?: unknown; name?: unknown; rolle?: unknown }, von: string | null = null): Promise<Ergebnis> {
    const email = pruefeEmail(e.email);
    if (await this.repo.holeHash(email)) throw new Fachfehler(409, 'Für diese E-Mail-Adresse gibt es schon einen Benutzer.');
    const benutzer = await this.repo.legeBenutzerAn({ id: randomUUID(), email, name: text(e.name), rolle: rolleAus(e.rolle), passwortHash: null });
    await this.spiegle(benutzer, von);
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
    return this.spiegle(neu, ich.id);
  }

  async loescheBenutzer(ich: Benutzer, id: string) {
    const b = await this.repo.holeBenutzer(id);
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    if (id === ich.id) throw new Fachfehler(409, 'Du kannst dich nicht selbst löschen.');
    if (b.rolle === 'admin' && b.aktiv && (await this.anzahlAktiverAdmins(id)) === 0) throw new Fachfehler(409, 'Es muss mindestens einen aktiven Administrator geben.');
    // Wer schon angemeldet war, hat Spuren hinterlassen (angelegt von, Verweise): deaktivieren statt löschen (#26).
    // Löschen bleibt für Einladungen, die nie angenommen wurden, z. B. bei einer vertippten Adresse.
    if (b.hatPasswort || b.letzteAnmeldung) throw new Fachfehler(409, 'Wer sich schon angemeldet hat, wird deaktiviert statt gelöscht. So bleiben Verweise und „angelegt von“ erhalten.');
    // Mit Papierkorb (#43): deaktivieren und die Mappe in den Papierkorb; das Konto wird erst beim Leeren gelöscht.
    if (this.spiegel?.inPapierkorb && (await this.spiegel.papierkorbAn?.())) {
      await this.spiegel.inPapierkorb(id, ich.id);
      await this.repo.aendereBenutzer(id, { aktiv: false });
      await this.repo.loescheSitzungenVon(id);
      return;
    }
    if (this.spiegel) await this.spiegel.entferne(id);
    await this.repo.loescheBenutzer(id);
  }

  /** Für den Papierkorb (#43): Konto einer Benutzer-Mappe löschen bzw. wieder aktivieren. */
  papierkorbHaken() {
    return {
      endgueltig: async (id: string) => {
        const b = await this.repo.holeBenutzer(id);
        // Nur Einladungen, die nie angenommen wurden (wie beim Löschen); sonst bleibt das Konto deaktiviert.
        if (b && !b.aktiv && !b.hatPasswort && !b.letzteAnmeldung) await this.repo.loescheBenutzer(id);
      },
      wiederda: async (id: string, von: string | null) => {
        const b = await this.repo.holeBenutzer(id);
        if (b && !b.aktiv) await this.spiegle(await this.repo.aendereBenutzer(id, { aktiv: true }), von);
      },
    };
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

  async passwortSetzen(e: { schluessel?: unknown; passwort?: unknown }, info: Geraet = OHNE_GERAET) {
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
    return { benutzer, schluessel: await this.neueSitzung(l.benutzerId, info) };
  }
}
