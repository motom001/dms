import type { Zweifaktor } from './zweifaktor';
import type { AnbieterIdentitaet, OidcEinstellung } from './oidc';
import { protokoll } from './protokoll';

const log = protokoll.modul('konto');
import { Anmeldesperre } from './anmeldesperre';
import { randomUUID } from 'node:crypto';
import { abwesenheitWirkt, istEmail, KEINE_ABWESENHEIT, PASSWORT_MINDESTLAENGE, type Abwesenheit, type Benutzer, type Rolle } from '../../shared/src/model';
import { heuteIn } from '../../shared/src/sichten';
import { Fachfehler } from './fehler';
import type { KontoRepo, SitzungIntern, SitzungsInfo, Zweck } from './konto-repo';
import type { Benutzerspiegel } from './dienst';
import { mailtexte, type Mailer } from './mail';
import { t } from './sprache';
import { hashePasswort, hasheSchluessel, neuerSchluessel, pruefePasswort } from './passwort';

const TAG = 24 * 60 * 60 * 1000;
export const SITZUNG_TAGE = 30;
const EINLADUNG_TAGE = 7;
const ZURUECKSETZEN_STUNDEN = 1;

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
const rolleAus = (v: unknown): Rolle => (v === 'admin' ? 'admin' : 'mitglied');

function pruefePasswortRegeln(pw: unknown): string {
  const s = typeof pw === 'string' ? pw : '';
  if (s.length < PASSWORT_MINDESTLAENGE) throw new Fachfehler(422, t('anmeldung.fehler.passwort.kurz', { anzahl: PASSWORT_MINDESTLAENGE }));
  if (s.length > 200) throw new Fachfehler(422, t('anmeldung.fehler.passwort.lang'));
  return s;
}
function pruefeEmail(v: unknown): string {
  const e = text(v);
  if (!istEmail(e)) throw new Fachfehler(422, t('anmeldung.fehler.email'));
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
  /** Anmeldeschutz (#240); ohne Verbindung mit Standardwerten im Arbeitsspeicher. */
  sperre = new Anmeldesperre();
  verbindeSperre(s: Anmeldesperre) { this.sperre = s; }
  /** Zwei-Faktor-Anmeldung (#242); ohne Verbindung gibt es keine. */
  zweifaktor: Zweifaktor | null = null;
  verbindeZweifaktor(z: Zweifaktor) { this.zweifaktor = z; }
  /** Anmeldung über einen Anbieter (#241): aktive Einstellung, sonst null. */
  private anbieter: () => Promise<OidcEinstellung | null> = async () => null;
  verbindeAnbieter(f: () => Promise<OidcEinstellung | null>) { this.anbieter = f; }
  /** Nach richtigem Passwort, vor dem Code: kurzlebige Kennung je Anmeldung. */
  private zweiterSchritt = new Map<string, { benutzerId: string; email: string; ip: string; geraet: string; bis: number; versuche: number }>();

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
    await this.sperre.pruefe(email, ip);
    const treffer = email ? await this.repo.holeHash(email) : undefined;
    const ok = await pruefePasswort(passwort, treffer?.hash);
    if (!ok || !treffer || !treffer.benutzer.aktiv) {
      await this.sperre.fehlschlag(email, ip, !!treffer?.benutzer.aktiv);
      throw new Fachfehler(401, t('anmeldung.fehler.falsch'));
    }
    await this.sperre.erfolg(email, ip);
    // Anbieter (#241): Passwort nur noch für Administratoren (Notzugang)?
    const a = await this.anbieter();
    if (a?.lokalNurAdmins && treffer.benutzer.rolle !== 'admin') throw new Fachfehler(403, t('anmeldung.fehler.anbieter', { knopf: a.knopf }));
    return this.nachErstemFaktor(treffer.benutzer, { ip, geraet });
  }

  /** Nach Passwort oder Anbieter: Zwei-Faktor (#242) oder gleich die Sitzung. */
  private async nachErstemFaktor(b: Benutzer, g: Geraet) {
    if (this.zweifaktor && (await this.zweifaktor.aktiv(b.id))) {
      return { zweiterSchritt: this.merkeZweitenSchritt(b.id, b.email, g) } as const;
    }
    await this.repo.notiereAnmeldung(b.id);
    return { benutzer: b, schluessel: await this.neueSitzung(b.id, g) };
  }

  /**
   * Anmeldung über einen Anbieter (#241): Zuordnung über die E-Mail-Adresse; unbekannte Adressen nur,
   * wenn eingestellt. Mit Admin-Gruppe folgt die Rolle bei jeder Anmeldung der Gruppe (der letzte
   * aktive Administrator bleibt Administrator).
   */
  async anmeldenMitAnbieter(id: AnbieterIdentitaet, e: OidcEinstellung, g: Geraet) {
    const gruppeAdmin = e.adminGruppe ? id.gruppen.includes(e.adminGruppe) : null;
    let b = (await this.repo.holeHash(id.email))?.benutzer;
    if (!b) {
      if (!e.anlegen) throw new Fachfehler(403, t('anmeldung.fehler.anbieter.unbekannt', { email: id.email }));
      b = await this.repo.legeBenutzerAn({ id: randomUUID(), email: id.email, name: id.name || id.email, rolle: gruppeAdmin ? 'admin' : gruppeAdmin === false ? 'mitglied' : e.standardrolle, passwortHash: null });
      await this.spiegle(b, b.id);
      log.info('Benutzer über den Anbieter angelegt', { email: b.email, rolle: b.rolle });
    } else if (gruppeAdmin !== null && (gruppeAdmin ? 'admin' : 'mitglied') !== b.rolle && b.aktiv) {
      if (!gruppeAdmin && (await this.anzahlAktiverAdmins(b.id)) === 0) {
        log.warn('Rolle nicht aus der Gruppe übernommen: letzter aktiver Administrator', { email: b.email });
      } else {
        b = await this.spiegle(await this.repo.aendereBenutzer(b.id, { rolle: gruppeAdmin ? 'admin' : 'mitglied' }), b.id);
        log.info('Rolle aus der Gruppe des Anbieters übernommen', { email: b.email, rolle: b.rolle });
      }
    }
    if (!b.aktiv) throw new Fachfehler(403, t('anmeldung.fehler.deaktiviert'));
    return this.nachErstemFaktor(b, g);
  }

  /**
   * Passwort direkt setzen (#244, Befehl `dms passwort` im Container) – ohne Mail und Link.
   * Beendet alle Sitzungen des Benutzers.
   */
  async setzePasswortDirekt(email: unknown, passwort: unknown) {
    const t = await this.repo.holeHash(text(email).toLowerCase());
    if (!t) throw new Fachfehler(404, `Unter ${text(email)} gibt es keinen Benutzer.`);
    await this.repo.setzeHash(t.benutzer.id, await hashePasswort(pruefePasswortRegeln(passwort)));
    await this.repo.loescheLinksVon(t.benutzer.id);
    await this.repo.loescheSitzungenVon(t.benutzer.id);
    return t.benutzer;
  }

  /** Eigenes Passwort bestätigen (z. B. vor dem Abschalten der Zwei-Faktor-Anmeldung). */
  async pruefeEigenesPasswort(b: Benutzer, passwort: unknown) {
    const t = await this.repo.holeHash(b.email);
    if (!t || !(await pruefePasswort(typeof passwort === 'string' ? passwort : '', t.hash))) throw new Fachfehler(403, 'Das Passwort stimmt nicht.');
  }

  /** Zweiter Schritt (#242): Code aus der App oder ein Wiederherstellungscode. */
  private merkeZweitenSchritt(benutzerId: string, email: string, g: Geraet) {
    const kennung = neuerSchluessel();
    const t = Date.now();
    for (const [k, v] of this.zweiterSchritt) if (v.bis < t) this.zweiterSchritt.delete(k);
    this.zweiterSchritt.set(kennung, { benutzerId, email, ip: g.ip, geraet: g.geraet, bis: t + 5 * 60_000, versuche: 0 });
    return kennung;
  }

  async anmeldenMitCode(e: { kennung?: unknown; code?: unknown }, ip: string) {
    const k = typeof e.kennung === 'string' ? this.zweiterSchritt.get(e.kennung) : undefined;
    if (!k || k.bis < Date.now() || k.ip !== ip) throw new Fachfehler(401, t('anmeldung.fehler.abgelaufen'));
    await this.sperre.pruefe(k.email, ip);
    const art = await this.zweifaktor?.pruefe(k.benutzerId, e.code);
    if (!art) {
      await this.sperre.fehlschlag(k.email, ip, true);
      if (++k.versuche >= 5) this.zweiterSchritt.delete(e.kennung as string);
      throw new Fachfehler(401, t('anmeldung.fehler.code'));
    }
    this.zweiterSchritt.delete(e.kennung as string);
    const benutzer = await this.repo.holeBenutzer(k.benutzerId);
    if (!benutzer || !benutzer.aktiv) throw new Fachfehler(401, t('anmeldung.fehler.falsch'));
    await this.repo.notiereAnmeldung(benutzer.id);
    return { benutzer, schluessel: await this.neueSitzung(benutzer.id, { ip, geraet: k.geraet }), wiederherstellung: art === 'wiederherstellung' };
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

  /** Dienstkonto eines Pakets mit Code (#338) anlegen bzw. wieder einschalten; meldet sich nie an. */
  async dienstkonto(paketId: string, name: string): Promise<Benutzer> {
    const anzeige = `Paket ${name}`.slice(0, 120);
    const da = await this.repo.dienstkonto(paketId);
    if (!da) return this.repo.legeDienstkontoAn({ id: randomUUID(), paketId, name: anzeige });
    if (!da.aktiv || da.name !== anzeige) return this.repo.aendereBenutzer(da.id, { aktiv: true, name: anzeige });
    return da;
  }

  /** Dienstkonto ausschalten (Paket entfernt): Historie behält den Namen, Schlüssel gelten nicht mehr. */
  async dienstkontoAus(paketId: string): Promise<void> {
    const da = await this.repo.dienstkonto(paketId);
    if (da?.aktiv) await this.repo.aendereBenutzer(da.id, { aktiv: false });
  }

  listeDienstkonten() { return this.repo.listeDienstkonten(); }

  /** Benutzer für Verwaltung, Vertretung, Abwesenheit, Links (#338): Dienstkonten von Paketen gibt es dort nicht. */
  private async person(id: string): Promise<Benutzer | undefined> {
    const b = await this.repo.holeBenutzer(id);
    return b?.art === 'dienst' ? undefined : b;
  }

  /** Aktiver Benutzer zur Id (für API-Schlüssel). */
  async benutzerMitId(id: string): Promise<Benutzer | undefined> {
    const b = await this.repo.holeBenutzer(id);
    return b?.aktiv ? b : undefined;
  }

  /** Gehört die E-Mail-Adresse zu einem aktiven Konto? (Anmeldeschutz #368: Sofortmeldung, z. B. für WebDAV.) */
  async istAktiveEmail(email: string): Promise<boolean> {
    return !!email && !!(await this.repo.holeHash(email.toLowerCase()))?.benutzer.aktiv;
  }

  async benutzerZu(schluessel?: string): Promise<Benutzer | undefined> {
    return (await this.anmeldungZu(schluessel))?.benutzer;
  }

  /* ---------- Sitzungen (Admin) ---------- */

  async sitzungenVon(benutzerId: string, aktuelleId?: string) {
    if (!(await this.person(benutzerId))) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
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

  /** Alle angemeldeten Sitzungen aller Benutzer, für den Wartungsmodus (#102). */
  async alleSitzungen(aktuelleId?: string) {
    const erg: Array<{ id: string; benutzerId: string; name: string; email: string; rolle: string; geraet: string; ip: string; zuletztAktiv: string; erstellt: string; aktuell: boolean }> = [];
    for (const b of await this.repo.listeBenutzer()) {
      for (const s of await this.repo.listeSitzungen(b.id)) {
        erg.push({ id: s.id, benutzerId: b.id, name: b.name, email: b.email, rolle: b.rolle, geraet: s.geraet, ip: s.ip, zuletztAktiv: s.zuletztAktiv, erstellt: s.erstellt, aktuell: s.id === aktuelleId });
      }
    }
    return erg.sort((a, b) => b.zuletztAktiv.localeCompare(a.zuletztAktiv));
  }

  /** Beendet alle Sitzungen außer dieser einen (Wartungsmodus, #102). */
  async beendeAlleSitzungenAusser(sitzungId: string | null): Promise<number> {
    let n = 0;
    for (const s of await this.alleSitzungen()) {
      if (s.id === sitzungId) continue;
      await this.beendeSitzung(s.benutzerId, s.id).catch(() => {});
      n++;
    }
    return n;
  }

  /* ---------- Als anderer Benutzer anmelden (Admin) ---------- */

  /**
   * Der Administrator wechselt in eine Sitzung des Benutzers. Seine eigene Sitzung endet;
   * zurück geht es mit vertretungBeenden. Der Benutzer erfährt davon bei seiner nächsten Anmeldung.
   */
  async vertrete(admin: Benutzer, adminSchluessel: string | undefined, zielId: string, info: Geraet) {
    if (admin.rolle !== 'admin') throw new Fachfehler(403, 'Dafür sind Administratorrechte nötig.');
    const ziel = await this.person(zielId);
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

  /** Startseite (#334): zuletzt geöffnete Mappen merken – höchstens 10, neueste zuerst. */
  async merkeGeoeffnet(ich: Benutzer, mappeId: string) {
    const alt = (await this.repo.einstellungen(ich.id)).zuletzt_geoeffnet;
    const liste = Array.isArray(alt) ? alt.filter((x): x is string => typeof x === 'string') : [];
    if (liste[0] === mappeId) return;
    await this.repo.setzeEinstellung(ich.id, 'zuletzt_geoeffnet', [mappeId, ...liste.filter((x) => x !== mappeId)].slice(0, 10));
  }

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

  /** Vollexport (#254): Benutzer ohne Passwörter, mit ihren Einstellungen; Vertretungen. */
  async exportDaten() {
    const benutzer = await Promise.all((await this.repo.listeBenutzer()).map(async (b) => ({
      id: b.id, email: b.email, name: b.name, rolle: b.rolle, aktiv: b.aktiv, erstellt: b.erstellt, letzteAnmeldung: b.letzteAnmeldung,
      abwesenheit: b.abwesenheit ?? null, einstellungen: await this.repo.einstellungen(b.id),
    })));
    return { benutzer, vertretungen: await this.repo.alleVertretungen() };
  }
  /** Persönlicher Export (#255): nur der Benutzer selbst. */
  async exportDatenVon(id: string) {
    const d = await this.exportDaten();
    return { benutzer: d.benutzer.filter((b) => b.id === id), vertretungen: d.vertretungen.filter((v) => v.benutzerId === id) };
  }

  /** Für alle Angemeldeten: nur Id und Name, z. B. für „angelegt von“. */
  /** Für Namen und Empfängerauswahl; mit Abwesenheit, solange sie an ist (#78). */
  async personen() {
    const alle = await this.repo.listeBenutzer();
    const name = (id: string | null) => { const b = alle.find((x) => x.id === id); return b ? b.name || b.email : ''; };
    const heute = heuteIn();
    return alle.map((b) => {
      const a = b.abwesenheit;
      const abwesend = a?.an && (!a.bis || a.bis >= heute)
        ? { wirkt: abwesenheitWirkt(a, heute), von: a.von, bis: a.bis, vertreter: name(a.vertreterId) } : undefined;
      return { id: b.id, name: b.name || b.email, aktiv: b.aktiv, ...(abwesend ? { abwesend } : {}) };
    }).concat(
      // Dienstkonten der Pakete (#338): nur für Namen in Historie und „angelegt von“ – nie auswählbar (aktiv: false).
      (await this.repo.listeDienstkonten()).map((b) => ({ id: b.id, name: b.name, aktiv: false, art: 'dienst' as const })),
    );
  }

  /* ---------- Abwesenheit mit Vertreter (#78) ---------- */

  /** Abwesenheit setzen – für sich selbst oder (Administrator) für andere. Vertreter ist Pflicht, sobald sie an ist. */
  async setzeAbwesenheit(ich: Benutzer, id: string, e: { an?: unknown; von?: unknown; bis?: unknown; vertreterId?: unknown }) {
    const b = await this.person(id);
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    if (id !== ich.id && ich.rolle !== 'admin') throw new Fachfehler(403, 'Die Abwesenheit anderer pflegen nur Administratoren.');
    const datum = (v: unknown, was: string): string | null => {
      const t = text(v);
      if (!t) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) throw new Fachfehler(422, `Bitte ein gültiges Datum für „${was}“ angeben.`);
      return t;
    };
    const a: Abwesenheit = { an: e.an === true || e.an === 'true', von: datum(e.von, 'von'), bis: datum(e.bis, 'bis'), vertreterId: text(e.vertreterId) || null };
    if (a.von && a.bis && a.bis < a.von) throw new Fachfehler(422, '„bis“ liegt vor „von“.');
    if (a.an && a.bis && a.bis < heuteIn()) throw new Fachfehler(422, '„bis“ liegt in der Vergangenheit.');
    if (a.vertreterId) {
      if (a.vertreterId === id) throw new Fachfehler(422, 'Als Vertreter bitte einen anderen Benutzer wählen.');
      const v = await this.person(a.vertreterId);
      if (!v || !v.aktiv) throw new Fachfehler(422, 'Der Vertreter muss ein aktiver Benutzer sein.');
    } else if (a.an || !b.aktiv) throw new Fachfehler(422, 'Bitte einen Vertreter wählen.');
    const alt = b.abwesenheit ?? KEINE_ABWESENHEIT;
    const neu = await this.repo.setzeAbwesenheit(id, a);
    await this.spiegle(neu, ich.id);
    await this.spiegel?.abwesenheitGeaendert?.(neu, alt, ich.id);
    return neu;
  }

  /** Alle offenen Aufgaben an den hinterlegten Vertreter geben. */
  async aufgabenAnVertreter(ich: Benutzer, id: string) {
    if (id !== ich.id && ich.rolle !== 'admin') throw new Fachfehler(403, 'Nur für dich selbst oder als Administrator.');
    const b = await this.person(id);
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    const v = b.abwesenheit?.vertreterId;
    if (!v) throw new Fachfehler(409, 'Es ist kein Vertreter hinterlegt.');
    return { uebergeben: (await this.spiegel?.aufgabenUebergeben?.(id, v, ich.id)) ?? 0 };
  }

  /** Stündlich: abgelaufene Abwesenheiten beenden und „abwesend“ an den Mappen nachziehen. */
  async abwesenheitenPruefen() {
    const heute = heuteIn();
    for (const b of await this.repo.listeBenutzer()) {
      const a = b.abwesenheit;
      if (!a) continue;
      if (a.an && a.bis && a.bis < heute) {
        const neu = await this.repo.setzeAbwesenheit(b.id, { ...a, an: false, von: null, bis: null });
        await this.spiegle(neu);
        await this.spiegel?.abwesenheitGeaendert?.(neu, a, null, `Zeitraum bis ${a.bis.split('-').reverse().join('.')} abgelaufen`);
      } else if (a.an) await this.spiegle(b);
    }
  }

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
    const b = await this.person(id);
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    const d: Partial<Pick<Benutzer, 'name' | 'rolle' | 'aktiv'>> = {};
    if (e.name !== undefined) d.name = text(e.name);
    if (e.rolle !== undefined) d.rolle = rolleAus(e.rolle);
    if (e.aktiv !== undefined) d.aktiv = !!e.aktiv;
    const verliertAdmin = b.rolle === 'admin' && b.aktiv && (d.rolle === 'mitglied' || d.aktiv === false);
    if (verliertAdmin && (await this.anzahlAktiverAdmins(id)) === 0) throw new Fachfehler(409, 'Es muss mindestens einen aktiven Administrator geben.');
    if (id === ich.id && d.aktiv === false) throw new Fachfehler(409, 'Du kannst dich nicht selbst deaktivieren.');
    // Deaktivieren nur mit Vertreter und ohne offene Aufgaben (#77, #78); der Vertreter wirkt danach dauerhaft.
    if (d.aktiv === false && b.aktiv) {
      if (!b.abwesenheit?.vertreterId) throw new Fachfehler(409, 'Bitte zuerst einen Vertreter hinterlegen.');
      const offen = (await this.spiegel?.offeneAufgaben?.(id)) ?? 0;
      if (offen) throw new Fachfehler(409, `${b.name || b.email} hat noch ${offen === 1 ? 'eine offene Aufgabe' : `${offen} offene Aufgaben`}. Bitte zuerst an den Vertreter geben.`);
    }
    const neu = await this.repo.aendereBenutzer(id, d);
    if (d.aktiv === false) await this.repo.loescheSitzungenVon(id);
    return this.spiegle(neu, ich.id);
  }

  async loescheBenutzer(ich: Benutzer, id: string) {
    const b = await this.person(id);
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
        const b = await this.person(id);
        // Nur Einladungen, die nie angenommen wurden (wie beim Löschen); sonst bleibt das Konto deaktiviert.
        if (b && !b.aktiv && !b.hatPasswort && !b.letzteAnmeldung) await this.repo.loescheBenutzer(id);
      },
      benutzer: () => this.repo.listeBenutzer(),
      // Favorit = Abo (#422): persönliche Einstellungen (Benachrichtigen, Hervorheben).
      einstellungen: (id: string) => this.repo.einstellungen(id),
      wiederda: async (id: string, von: string | null) => {
        const b = await this.person(id);
        if (b && !b.aktiv) await this.spiegle(await this.repo.aendereBenutzer(id, { aktiv: true }), von);
      },
    };
  }

  /** Admin: neuen Link schicken (Einladung, wenn noch kein Passwort gesetzt ist, sonst Zurücksetzen). */
  /**
   * Notfallzugang (#108): neuer Administrator ohne Passwort und ein Einmal-Link, der nur
   * `minuten` gilt; beim Öffnen legt man ein eigenes Passwort fest. Der Link wird nicht verschickt.
   */
  async notfallzugang(minuten: number, jetzt = new Date()): Promise<{ benutzer: Benutzer; link: string; ablauf: Date }> {
    const teile = Object.fromEntries(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(jetzt).map((x) => [x.type, x.value]));
    const name = `Notfall-Admin ${teile.day}.${teile.month}.${teile.year} ${teile.hour}:${teile.minute}`;
    const email = `notfall-${teile.year}${teile.month}${teile.day}-${teile.hour}${teile.minute}${teile.second}@notfall.invalid`;
    const benutzer = await this.repo.legeBenutzerAn({ id: randomUUID(), email, name, rolle: 'admin', passwortHash: null });
    await this.spiegle(benutzer);
    const schluessel = neuerSchluessel();
    const ablauf = new Date(jetzt.getTime() + minuten * 60_000);
    await this.repo.legeLinkAn(hasheSchluessel(schluessel), benutzer.id, 'einladung', ablauf);
    return { benutzer, link: `${this.appUrl.replace(/\/$/, '')}/passwort/${schluessel}`, ablauf };
  }

  async neuerLink(id: string): Promise<Ergebnis> {
    const b = await this.person(id);
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
    // Anbieter (#241) mit „Passwort nur für Administratoren“: kein Passwort für Mitglieder.
    const a = await this.anbieter();
    if (a?.lokalNurAdmins && (await this.repo.holeBenutzer(l.benutzerId))?.rolle !== 'admin') throw new Fachfehler(403, t('anmeldung.fehler.anbieter', { knopf: a.knopf }));
    if (!(await this.repo.verbraucheLink(hash))) throw new Fachfehler(410, t('anmeldung.fehler.link.benutzt'));
    await this.repo.setzeHash(l.benutzerId, await hashePasswort(passwort));
    await this.repo.loescheSitzungenVon(l.benutzerId);
    const benutzer = (await this.repo.holeBenutzer(l.benutzerId))!;
    // Zwei-Faktor (#242): Der Link ersetzt nur das Passwort, nicht den zweiten Faktor.
    if (this.zweifaktor && (await this.zweifaktor.aktiv(benutzer.id))) {
      return { benutzer, zweiterSchritt: this.merkeZweitenSchritt(benutzer.id, benutzer.email, info) };
    }
    await this.repo.notiereAnmeldung(l.benutzerId);
    return { benutzer, schluessel: await this.neueSitzung(l.benutzerId, info) };
  }
}
