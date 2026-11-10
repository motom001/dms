import type { Zweifaktor } from './zweifaktor';
import type { AnbieterIdentitaet, OidcEinstellung } from './oidc';
import { protokoll } from './protokoll';

const log = protokoll.modul('konto');
import { Anmeldesperre } from './anmeldesperre';
import { randomInt, randomUUID } from 'node:crypto';
import { abwesenheitWirkt, istEmail, istPerson, KEINE_ABWESENHEIT, PASSWORT_MINDESTLAENGE, SYSTEMKONTEN, type Abwesenheit, type Benutzer, type Systemkonto } from '../../shared/src/model';
import { darfVerwalten, FRISCH_MINUTEN, GESAMT, gleicheVerwaltung, hatGesamt, liesVerwaltung, MODUS_MINUTEN, verwaltungText, type Verwaltungsstand } from '../../shared/src/verwaltungsrecht';
import { heuteIn } from '../../shared/src/sichten';
import { Fachfehler } from './fehler';
import type { KontoRepo, Schutzpruefung, SitzungIntern, SitzungsInfo, Zweck } from './konto-repo';
import type { Benutzerspiegel } from './mappentypen';
import { mailtexte, type Mailer } from './mail';
import { mitSpracheVon, t } from './sprache';
import { inSprache } from '../../shared/src/sprache';
import { erlaubteSprachen } from '../../shared/src/beschriftung';
import { hashePasswort, hasheSchluessel, neuerSchluessel, pruefePasswort } from './passwort';
import { hashe, speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import { zeitzone } from '../../shared/src/region';
import { NOTFALLCODE_LAENGE, NOTFALLCODE_ZEICHEN, normiereNotfallcode } from '../../shared/src/notfallcode';

const TAG = 24 * 60 * 60 * 1000;
export const SITZUNG_TAGE = 30;
const EINLADUNG_TAGE = 7;
const ZURUECKSETZEN_STUNDEN = 1;

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
const MINUTE = 60_000;

/**
 * Wer zählt für die Schutzregel (#818)? Aktive Personen mit „Gesamte Verwaltung“, die sich anmelden können: Passwort
 * gesetzt oder schon einmal angemeldet (Anbieter) – eine bloße Einladung zählt nicht (Bauvorgabe Sicherheit).
 */
export const zaehltAlsGesamt = (b: Benutzer) => istPerson(b) && b.aktiv && hatGesamt(b) && (b.hatPasswort || !!b.letzteAnmeldung);
/** Schutzregel: Mindestens eine Person behält „Gesamte Verwaltung“ – eine Änderung darf die Zahl nicht auf null bringen. */
export const schutzGesamt: Schutzpruefung = (nachher, vorher) =>
  (vorher.some(zaehltAlsGesamt) && !nachher.some(zaehltAlsGesamt) ? t('konten.verwaltung.fehler.letzte') : null);
/** Datum (JJJJ-MM-TT) in der Zeitzone der Ablage – der Tagesmerker endet um Mitternacht. */
const tagVon = (d: Date) => heuteIn(d);

export function pruefePasswortRegeln(pw: unknown): string {
  const s = typeof pw === 'string' ? pw : '';
  if (s.length < PASSWORT_MINDESTLAENGE) throw new Fachfehler(422, t('anmeldung.fehler.passwort.kurz', { anzahl: PASSWORT_MINDESTLAENGE }));
  if (s.length > 200) throw new Fachfehler(422, t('anmeldung.fehler.passwort.lang'));
  return s;
}
export function pruefeEmail(v: unknown): string {
  const e = text(v);
  if (!istEmail(e)) throw new Fachfehler(422, t('anmeldung.fehler.email'));
  return e;
}

/** Gerät und Adresse, von denen eine Anmeldung kommt. */
export type Geraet = Pick<SitzungsInfo, 'geraet' | 'ip'>;
const OHNE_GERAET: Geraet = { geraet: '', ip: '' };
/** Zweiter Anmeldeschritt (#242, seit #744 im Kurzzustand): Schlüssel ist der Hash der Kennung. */
const ZWEITER_SCHRITT = 'zweiter-schritt';
const ZWEITER_SCHRITT_MS = 5 * 60_000;
interface ZweiterSchritt { benutzerId: string; email: string; ip: string; geraet: string }
/** Letzte Aktivität höchstens einmal je Minute schreiben. */
const BERUEHREN_MS = 60_000;

export interface Ergebnis { benutzer: Benutzer; mailVerschickt: boolean; link?: string; mailFehler?: string }

/**
 * Anmeldung, Sitzungen, Benutzerverwaltung und Passwort-Links.
 * Schlüssel für Sitzungen und Links werden nur als Hash gespeichert.
 */
/** „Zuletzt geöffnet“ (#940): so viele zeigt die Liste, so viele merkt sich Ablago je Person. */
export const ZULETZT_LISTE = 25;
const ZULETZT_MERKEN = 40;

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
  /**
   * Zustand zwischen Anfragen (#744), u. a. der zweite Anmeldeschritt: Nach richtigem Passwort, vor dem Code eine
   * kurzlebige Kennung je Anmeldung – in der Datenbank nur ihr Hash, gültig 5 Minuten, einmal einlösbar.
   */
  private zustand: Kurzzustand = speicherKurzzustand();
  verbindeZustand(z: Kurzzustand) { this.zustand = z; }

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

  /** Benutzer-Mappe nachziehen; `abwesenheit` (#962), wenn sich die Abwesenheit geändert hat – dann in derselben Transaktion. */
  private async spiegle(b: Benutzer, von: string | null = null, abwesenheit?: { vorher: Abwesenheit; wegen?: string }) {
    if (this.spiegel) await this.spiegel.aktualisiere(b, von, abwesenheit);
    return b;
  }

  get mailAktiv() { return !!this.mailer; }

  async einrichtungNoetig() { return (await this.repo.anzahlBenutzer()) === 0; }

  /** Erster Aufruf: legt den Administrator an und meldet ihn an. */
  async einrichten(e: { email?: unknown; name?: unknown; passwort?: unknown }, info: Geraet = OHNE_GERAET) {
    if (!(await this.einrichtungNoetig())) throw new Fachfehler(409, t('meldungen.konten.die-einrichtung-ist-bereits'));
    const email = pruefeEmail(e.email);
    const passwort = pruefePasswortRegeln(e.passwort);
    // #818: Die erste Person bekommt „Gesamte Verwaltung“ – ein eigenes Admin-Konto gibt es nicht mehr.
    const benutzer = await this.repo.legeBenutzerAn({ id: randomUUID(), email, name: text(e.name) || email, verwaltung: [GESAMT], passwortHash: await hashePasswort(passwort) });
    await this.repo.notiereAnmeldung(benutzer.id);
    await this.spiegle(benutzer, benutzer.id);
    // Gleich im Verwaltungsmodus (#819): Der Einrichtungsassistent richtet danach weiter ein.
    const schluessel = await this.neueSitzung(benutzer.id, { ...info, voll: true });
    const jetzt = new Date();
    await this.repo.setzeSitzungsVerwaltung(hasheSchluessel(schluessel), { verwaltungSeit: jetzt, verwaltungAktiv: jetzt, verwaltungBestaetigt: jetzt });
    log.warn('Verwaltungsmodus begonnen', { person: benutzer.email, imVerwaltungsmodus: true, anmeldung: 'Einrichtung' });
    return { benutzer, schluessel };
  }

  async anmelden(e: { email?: unknown; passwort?: unknown }, ip: string, geraet = '') {
    const email = text(e.email).toLowerCase();
    const passwort = typeof e.passwort === 'string' ? e.passwort : '';
    // Vorab gezählt (#956): Auch gleichzeitige Anfragen kommen nicht an der Grenze vorbei.
    const v = await this.sperre.versuch(email, ip);
    const treffer = email ? await this.repo.holeHash(email) : undefined;
    const ok = await pruefePasswort(passwort, treffer?.hash);
    if (!ok || !treffer || !treffer.benutzer.aktiv) {
      await this.sperre.fehlschlag(email, ip, !!treffer?.benutzer.aktiv, v);
      throw new Fachfehler(401, t('anmeldung.fehler.falsch'));
    }
    await this.sperre.erfolg(email, ip);
    // Anbieter (#241): Passwort nur noch für Personen, die verwalten dürfen (Notzugang, #818)?
    const a = await this.anbieter();
    if (a?.lokalNurAdmins && !darfVerwalten(treffer.benutzer)) throw new Fachfehler(403, t('anmeldung.fehler.anbieter', { knopf: a.knopf }));
    return this.nachErstemFaktor(treffer.benutzer, { ip, geraet });
  }

  /** Nach Passwort oder Anbieter: Zwei-Faktor (#242) oder gleich die Sitzung. */
  private async nachErstemFaktor(b: Benutzer, g: Geraet) {
    if (this.zweifaktor && (await this.zweifaktor.aktiv(b.id))) {
      return { zweiterSchritt: await this.merkeZweitenSchritt(b.id, b.email, g) } as const;
    }
    await this.repo.notiereAnmeldung(b.id);
    return { benutzer: b, schluessel: await this.neueSitzung(b.id, { ...g, voll: true }) };
  }

  /**
   * Anmeldung über einen Anbieter (#241): Zuordnung über die E-Mail-Adresse; unbekannte Adressen nur,
   * wenn eingestellt. Mit Verwaltungsgruppe (#818, früher Admin-Gruppe) folgt „Gesamte Verwaltung“ bei jeder Anmeldung
   * der Gruppe: Mitglieder bekommen sie, wer nicht mehr dazugehört, verliert sie (die letzte Person behält sie).
   * Eine Auswahl einzelner Bereiche bleibt unberührt.
   */
  async anmeldenMitAnbieter(id: AnbieterIdentitaet, e: OidcEinstellung, g: Geraet) {
    const gruppeAdmin = e.adminGruppe ? id.gruppen.includes(e.adminGruppe) : null;
    let b = (await this.repo.holeHash(id.email))?.benutzer;
    if (!b) {
      if (!e.anlegen) throw new Fachfehler(403, t('anmeldung.fehler.anbieter.unbekannt', { email: id.email }));
      const gesamt = gruppeAdmin ?? e.standardrolle === 'admin';
      b = await this.repo.legeBenutzerAn({ id: randomUUID(), email: id.email, name: id.name || id.email, verwaltung: gesamt ? [GESAMT] : [], passwortHash: null });
      await this.spiegle(b, b.id);
      log.info('Benutzer über den Anbieter angelegt', { email: b.email, verwaltung: verwaltungText(b.verwaltung) });
    } else if (gruppeAdmin !== null && gruppeAdmin !== hatGesamt(b) && b.aktiv) {
      const neu = gruppeAdmin ? [GESAMT] : [];
      const r = await this.repo.aendereGeschuetzt(b.id, { verwaltung: neu }, schutzGesamt);
      if ('grund' in r) log.warn('Verwaltungsrecht nicht aus der Gruppe übernommen: letzte Person mit „Gesamte Verwaltung“', { email: b.email });
      else {
        log.warn('Verwaltungsrecht aus der Gruppe des Anbieters übernommen', { person: b.email, vorher: verwaltungText(b.verwaltung), nachher: verwaltungText(neu), von: 'Anbieter' });
        if (!gruppeAdmin) await this.repo.vergissVerwaltungVon(b.id);
        b = r.benutzer;
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
    const eintrag = await this.repo.holeHash(text(email).toLowerCase());
    if (!eintrag) throw new Fachfehler(404, t('meldungen.konten.unter-gibt-es-keinen', { text: text(email) }));
    await this.repo.setzeHash(eintrag.benutzer.id, await hashePasswort(pruefePasswortRegeln(passwort)));
    await this.repo.loescheLinksVon(eintrag.benutzer.id);
    await this.repo.loescheSitzungenVon(eintrag.benutzer.id);
    return eintrag.benutzer;
  }

  /** Eigenes Passwort bestätigen (z. B. vor dem Abschalten der Zwei-Faktor-Anmeldung). */
  async pruefeEigenesPasswort(b: Benutzer, passwort: unknown) {
    const eintrag = await this.repo.holeHash(b.email);
    if (!eintrag || !(await pruefePasswort(typeof passwort === 'string' ? passwort : '', eintrag.hash))) throw new Fachfehler(403, t('meldungen.konten.das-passwort-stimmt-nicht'));
  }

  /** Zweiter Schritt (#242): Code aus der App oder ein Wiederherstellungscode. */
  private async merkeZweitenSchritt(benutzerId: string, email: string, g: Geraet) {
    const kennung = neuerSchluessel();
    await this.zustand.setze(ZWEITER_SCHRITT, hashe(kennung), { benutzerId, email, ip: g.ip, geraet: g.geraet } satisfies ZweiterSchritt, Date.now() + ZWEITER_SCHRITT_MS);
    return kennung;
  }

  async anmeldenMitCode(e: { kennung?: unknown; code?: unknown }, ip: string) {
    const schluessel = typeof e.kennung === 'string' && e.kennung ? hashe(e.kennung) : '';
    const x = schluessel ? await this.zustand.lies(ZWEITER_SCHRITT, schluessel) : null;
    const k = x?.wert as ZweiterSchritt | undefined;
    if (!x || !k || k.ip !== ip) throw new Fachfehler(401, t('anmeldung.fehler.abgelaufen'));
    const v = await this.sperre.versuch(k.email, ip);
    // Höchstens 5 Codes je Kennung, vorab und atomar gezählt (#744, #956) – auch gleichzeitige Anfragen und mehrere
    // Prozesse kommen nicht darüber hinaus.
    const n = await this.zustand.erhoehe(ZWEITER_SCHRITT, schluessel);
    if (n === null || n > 5) {
      await this.zustand.loesche(ZWEITER_SCHRITT, schluessel);
      throw new Fachfehler(401, t('anmeldung.fehler.abgelaufen'));
    }
    const art = await this.zweifaktor?.pruefe(k.benutzerId, e.code);
    if (!art) {
      await this.sperre.fehlschlag(k.email, ip, true, v);
      if (n >= 5) await this.zustand.loesche(ZWEITER_SCHRITT, schluessel);
      throw new Fachfehler(401, t('anmeldung.fehler.code'));
    }
    await this.sperre.erfolg(k.email, ip);
    // Einmal einlösbar: Von zwei gleichzeitigen Anfragen mit derselben Kennung bekommt nur eine die Sitzung.
    if (!(await this.zustand.nimm(ZWEITER_SCHRITT, schluessel))) throw new Fachfehler(401, t('anmeldung.fehler.abgelaufen'));
    const benutzer = await this.repo.holeBenutzer(k.benutzerId);
    if (!benutzer || !benutzer.aktiv) throw new Fachfehler(401, t('anmeldung.fehler.falsch'));
    await this.repo.notiereAnmeldung(benutzer.id);
    return { benutzer, schluessel: await this.neueSitzung(benutzer.id, { ip, geraet: k.geraet, voll: true }), wiederherstellung: art === 'wiederherstellung' };
  }

  private async neueSitzung(benutzerId: string, info: Geraet & { voll?: boolean }, vertretungId: string | null = null) {
    const schluessel = neuerSchluessel();
    // Eine vertretene Sitzung (#43) ist nie eine Anmeldung mit allen Faktoren (#819).
    await this.repo.legeSitzungAn(hasheSchluessel(schluessel), benutzerId, new Date(Date.now() + SITZUNG_TAGE * TAG), { ...info, vertretungId, voll: !!info.voll && !vertretungId });
    return schluessel;
  }

  /* ---------- Verwaltungsmodus (#819) ---------- */

  /** Uhr des Verwaltungsmodus; Tests stellen sie vor. */
  uhr: () => number = () => Date.now();

  /**
   * Läuft der Verwaltungsmodus in dieser Sitzung? Nur für Personen mit Verwaltungsrecht, nie in einer Vertretung, und
   * nur bis `MODUS_MINUTEN` nach der letzten Aktivität. Ein Zustand auf dem Server – der Browser setzt ihn nie.
   */
  modusAktiv(b: Benutzer | undefined, s: SitzungIntern | undefined, jetzt = this.uhr()): boolean {
    if (!b || !s || s.vertretungId || !darfVerwalten(b) || !s.verwaltungSeit) return false;
    const zuletzt = (s.verwaltungAktiv ?? s.verwaltungSeit).getTime();
    return jetzt - zuletzt <= MODUS_MINUTEN * MINUTE;
  }

  /** Heute in diesem Browser schon erneut angemeldet (Tagesmerker, F3)? Endet um Mitternacht. */
  heuteBestaetigt(s: SitzungIntern | undefined, jetzt = new Date(this.uhr())): boolean {
    return !!s?.verwaltungBestaetigt && !s.vertretungId && tagVon(s.verwaltungBestaetigt) === tagVon(jetzt);
  }

  /** Frische Anmeldung (#819): Anmeldung mit allen Faktoren oder erneute Anmeldung vor höchstens `FRISCH_MINUTEN`. */
  istFrisch(s: SitzungIntern | undefined, jetzt = this.uhr()): boolean {
    if (!s || s.vertretungId) return false;
    return [s.frisch, s.anmeldungVoll].some((d) => !!d && jetzt - d.getTime() <= FRISCH_MINUTEN * MINUTE && d.getTime() <= jetzt + MINUTE);
  }

  /** Stand für die Oberfläche (`/api/konto/status`). */
  async verwaltungsstand(b: Benutzer, s: SitzungIntern | undefined): Promise<Verwaltungsstand> {
    const aktiv = this.modusAktiv(b, s);
    const zuletzt = s?.verwaltungAktiv ?? s?.verwaltungSeit;
    return {
      darf: darfVerwalten(b) && !s?.vertretungId, aktiv,
      bis: aktiv && zuletzt ? new Date(zuletzt.getTime() + MODUS_MINUTEN * MINUTE).toISOString() : null,
      heuteBestaetigt: this.heuteBestaetigt(s), frisch: this.istFrisch(s),
      code: !!this.zweifaktor && (await this.zweifaktor.aktiv(b.id)), passwort: b.hatPasswort,
      bereiche: hatGesamt(b) ? null : [...(b.verwaltung ?? [])],
    };
  }

  /**
   * Bei jeder Anfrage: Läuft der Modus, zählt eine Aktivität (Klick, Eingabe, Änderung) als „noch da“; ist er
   * abgelaufen, endet er hier – mit Eintrag im Protokoll. Liefert, ob er (noch) läuft.
   */
  async modusPruefen(b: Benutzer | undefined, schluessel: string | undefined, s: SitzungIntern | undefined, aktivitaet: boolean): Promise<boolean> {
    if (!b || !s || !schluessel || !s.verwaltungSeit) return false;
    const hash = hasheSchluessel(schluessel);
    if (!this.modusAktiv(b, s)) {
      await this.repo.setzeSitzungsVerwaltung(hash, { verwaltungSeit: null, verwaltungAktiv: null });
      s.verwaltungSeit = null; s.verwaltungAktiv = null;
      log.info(darfVerwalten(b) ? 'Verwaltungsmodus abgelaufen' : 'Verwaltungsmodus beendet: kein Verwaltungsrecht mehr', { person: b.email, imVerwaltungsmodus: true });
      return false;
    }
    // Höchstens alle 30 Sekunden schreiben – das genügt für 15 Minuten.
    if (aktivitaet && this.uhr() - (s.verwaltungAktiv ?? s.verwaltungSeit).getTime() > 30_000) {
      const jetzt = new Date(this.uhr());
      await this.repo.setzeSitzungsVerwaltung(hash, { verwaltungAktiv: jetzt });
      s.verwaltungAktiv = jetzt;
    }
    return true;
  }

  /**
   * Erneute Anmeldung (#819): Passwort und – falls eingerichtet – Code. Fehlversuche zählen in den Anmeldeschutz.
   * Ohne Passwort (nur Anbieter) gibt es hier keine Bestätigung; die Oberfläche meldet dann neu über den Anbieter an.
   */
  private async bestaetigeErneut(b: Benutzer, e: { passwort?: unknown; code?: unknown }, ip: string, wofuer: string): Promise<void> {
    if (!b.hatPasswort) throw new Fachfehler(409, t('konten.verwaltung.fehler.anbieter'), { anbieter: true });
    const email = b.email.toLowerCase();
    const v = await this.sperre.versuch(email, ip);
    const treffer = await this.repo.holeHash(email);
    const ok = await pruefePasswort(typeof e.passwort === 'string' ? e.passwort : '', treffer?.hash);
    const mitCode = !!this.zweifaktor && (await this.zweifaktor.aktiv(b.id));
    const codeOk = !ok || !mitCode ? true : !!(await this.zweifaktor!.pruefe(b.id, e.code));
    if (!ok || !codeOk) {
      await this.sperre.fehlschlag(email, ip, true, v);
      log.warn('Erneute Anmeldung fehlgeschlagen', { person: b.email, wofuer, ip, grund: ok ? 'Code' : 'Passwort' });
      throw new Fachfehler(401, t(ok ? 'anmeldung.fehler.code' : 'konten.verwaltung.fehler.passwort'), { bestaetigen: true, code: mitCode });
    }
    await this.sperre.erfolg(email, ip);
  }

  /**
   * „Ablago verwalten“ (#819): Modus beginnen. Ohne Angaben nur, wenn die Anmeldung höchstens 10 Minuten zurückliegt
   * oder heute in diesem Browser schon bestätigt wurde (Wiedereinstieg mit einem Klick); sonst mit erneuter Anmeldung.
   */
  async beginneVerwaltung(b: Benutzer, schluessel: string | undefined, s: SitzungIntern | undefined, e: { passwort?: unknown; code?: unknown }, ip: string) {
    if (!darfVerwalten(b)) throw new Fachfehler(403, t('konten.verwaltung.fehler.recht'));
    if (!schluessel || !s) throw new Fachfehler(401, t('anmeldung.fehler.bitte-anmelden'));
    if (s.vertretungId) throw new Fachfehler(403, t('konten.verwaltung.fehler.vertretung'));
    const hash = hasheSchluessel(schluessel);
    const jetzt = new Date(this.uhr());
    const mitAngaben = e.passwort !== undefined;
    let wie: 'bestaetigt' | 'frisch' | 'wieder';
    if (mitAngaben) { await this.bestaetigeErneut(b, e, ip, 'Verwaltungsmodus'); wie = 'bestaetigt'; }
    else if (this.istFrisch(s)) wie = 'frisch';
    else if (this.heuteBestaetigt(s)) wie = 'wieder';
    else {
      const mitCode = !!this.zweifaktor && (await this.zweifaktor.aktiv(b.id));
      throw new Fachfehler(401, t('konten.verwaltung.fehler.bestaetigen'), { bestaetigen: true, code: mitCode, anbieter: !b.hatPasswort });
    }
    await this.repo.setzeSitzungsVerwaltung(hash, {
      verwaltungSeit: jetzt, verwaltungAktiv: jetzt,
      // Die Anmeldung selbst oder die erneute zählt als Bestätigung für heute; der Wiedereinstieg verlängert nichts.
      ...(wie === 'wieder' ? {} : { verwaltungBestaetigt: jetzt }),
      ...(wie === 'bestaetigt' ? { frisch: jetzt } : {}),
    });
    log.warn(wie === 'wieder' ? 'Verwaltungsmodus wieder aufgenommen' : 'Verwaltungsmodus begonnen', { person: b.email, imVerwaltungsmodus: true, anmeldung: wie === 'bestaetigt' ? 'erneut angemeldet' : wie === 'frisch' ? 'Anmeldung vor höchstens 10 Minuten' : 'heute schon bestätigt', ip });
    return this.verwaltungsstand(b, { ...s, verwaltungSeit: jetzt, verwaltungAktiv: jetzt, ...(wie === 'bestaetigt' ? { frisch: jetzt, verwaltungBestaetigt: jetzt } : {}) });
  }

  /**
   * Werkbank (#921): Wer außer `ich` ist gerade im Verwaltungsmodus? Je Person der Name und der früheste Beginn eines
   * laufenden Modus (mehrere Sitzungen zählen einmal). Damit sich Verwaltende absprechen, bevor sie dieselbe
   * Konfiguration ändern – **kein Schutz** (den gibt der Konfliktschutz beim Speichern, #917).
   *
   * Quelle sind nur die Sitzungen mit laufendem Modus (#818/#819, Spalten aus Migration 073): Beendet endet er sofort,
   * abgelaufen gilt `modusAktiv` mit der Uhr – die Werkbank fragt alle 10–15 s nach, nach spätestens einer Minute ist
   * der Name weg. Dienst- und Systemkonten nie, Vertretungen nie, die eigene Person nie. Nichts wird gemerkt: keine
   * Historie der Anwesenheit (Beginn und Ende des Modus stehen wie bisher im Protokoll).
   *
   * Abgrenzung: Das ist nur „gerade auch im Verwaltungsmodus“ – nicht „schaut gerade die Mappe an“ (Anwesenheit an
   * Mappen ist ein eigenes Thema und wird hiermit nicht vermischt).
   */
  async andereImVerwaltungsmodus(ich: { id: string }): Promise<Array<{ name: string; seit: string }>> {
    const jetzt = this.uhr();
    const je = new Map<string, { name: string; seit: number }>();
    for (const { benutzer: b, sitzung: s } of await this.repo.sitzungenImVerwaltungsmodus()) {
      if (b.id === ich.id || b.art || !b.aktiv || !this.modusAktiv(b, s, jetzt)) continue;
      const seit = s.verwaltungSeit!.getTime();
      const da = je.get(b.id);
      if (!da || seit < da.seit) je.set(b.id, { name: b.name || b.email, seit });
    }
    return [...je.values()].sort((a, b) => a.seit - b.seit || a.name.localeCompare(b.name, 'de')).map((x) => ({ name: x.name, seit: new Date(x.seit).toISOString() }));
  }

  /** „Verwaltung beenden“ (#819). Der Tagesmerker bleibt – der Wiedereinstieg heute geht mit einem Klick. */
  async beendeVerwaltung(b: Benutzer, schluessel: string | undefined, s: SitzungIntern | undefined) {
    if (!schluessel || !s?.verwaltungSeit) return;
    await this.repo.setzeSitzungsVerwaltung(hasheSchluessel(schluessel), { verwaltungSeit: null, verwaltungAktiv: null });
    log.warn('Verwaltungsmodus beendet', { person: b.email, imVerwaltungsmodus: true });
  }

  /** Frische Anmeldung für eine heikle Handlung (#819): immer mit Passwort (und Code); gilt dann 10 Minuten. */
  async bestaetigeFrisch(b: Benutzer, schluessel: string | undefined, s: SitzungIntern | undefined, e: { passwort?: unknown; code?: unknown }, ip: string) {
    if (!schluessel || !s) throw new Fachfehler(401, t('anmeldung.fehler.bitte-anmelden'));
    if (s.vertretungId) throw new Fachfehler(403, t('konten.verwaltung.fehler.vertretung'));
    await this.bestaetigeErneut(b, e, ip, t('meldungen.konten.heikle-handlung'));
    const jetzt = new Date(this.uhr());
    await this.repo.setzeSitzungsVerwaltung(hasheSchluessel(schluessel), { frisch: jetzt, verwaltungBestaetigt: jetzt });
    log.info('Frisch angemeldet für eine heikle Handlung', { person: b.email, imVerwaltungsmodus: this.modusAktiv(b, s) });
  }

  /** Zwei-Faktor geändert (#819): Modus, Tagesmerker und frische Anmeldung in allen Sitzungen aufheben. */
  async zweifaktorGeaendert(benutzerId: string) { await this.repo.vergissVerwaltungVon(benutzerId); }

  async abmelden(schluessel?: string) {
    if (!schluessel) return;
    const hash = hasheSchluessel(schluessel);
    const s = await this.repo.holeSitzung(hash);
    if (s?.vertretungId) await this.repo.beendeVertretung(s.vertretungId);
    await this.repo.loescheSitzung(hash);
  }

  /** Benutzer und Sitzung zum Schlüssel, oder undefined, wenn sie ungültig, abgelaufen oder der Benutzer deaktiviert ist. */
  async anmeldungZu(schluessel?: string, o: { still?: boolean } = {}): Promise<{ benutzer: Benutzer; sitzung: SitzungIntern } | undefined> {
    if (!schluessel) return undefined;
    const hash = hasheSchluessel(schluessel);
    // Sitzung und Person in einer Abfrage (#741), nie aus einem Zwischenspeicher: Sperren, Abmelden und Löschen
    // wirken mit der nächsten Anfrage – in jedem Prozess.
    const x = this.repo.holeAnmeldung ? await this.repo.holeAnmeldung(hash)
      : await (async () => { const s = await this.repo.holeSitzung(hash); const b = s && await this.repo.holeBenutzer(s.benutzerId); return s && b ? { sitzung: s, benutzer: b } : undefined; })();
    const s = x?.sitzung; const b = x?.benutzer;
    if (!s || s.ablauf.getTime() < Date.now()) return undefined;
    // Systemkonten (#673) haben nie eine Sitzung – auch eine untergeschobene gilt nicht.
    if (!b || !b.aktiv || b.art === 'system') return undefined;
    // Abfragen im Hintergrund (#919, `still`) zählen nicht als Aktivität: „zuletzt aktiv“ bleibt, wie es war.
    if (!o.still && Date.now() - s.zuletztAktiv.getTime() > BERUEHREN_MS) await this.repo.beruehreSitzung(hash);
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

  /**
   * Systemkonto des DMS (#673) anlegen, falls es fehlt (beim Start). Meldet sich nie an: kein Passwort, keine Sitzung,
   * kein API-Schlüssel; nicht deaktivierbar oder löschbar (die Benutzerverwaltung kennt es nicht).
   */
  async systemkonto(kennung: Systemkonto): Promise<Benutzer> {
    const da = await this.repo.systemkonto(kennung);
    if (da) return da.aktiv ? da : this.repo.aendereBenutzer(da.id, { aktiv: true });
    return this.repo.legeSystemkontoAn({ id: randomUUID(), kennung, name: SYSTEMKONTEN[kennung] });
  }
  listeSystemkonten() { return this.repo.listeSystemkonten(); }

  /** Benutzer für Verwaltung, Vertretung, Abwesenheit, Links (#338): Dienstkonten von Paketen gibt es dort nicht. */
  private async person(id: string): Promise<Benutzer | undefined> {
    const b = await this.repo.holeBenutzer(id);
    return istPerson(b) ? b : undefined;
  }

  /** Mensch zur E-Mail-Adresse (#670: Ereignis „Benutzerkonto gesperrt“ nennt die Id, nicht die Adresse). */
  async personMitEmail(email: string): Promise<Benutzer | undefined> { return (await this.repo.holeHash(email))?.benutzer; }

  /** Aktiver Benutzer zur Id (für API-Schlüssel). */
  async benutzerMitId(id: string): Promise<Benutzer | undefined> {
    const b = await this.repo.holeBenutzer(id);
    // Systemkonten (#673) haben keinen API-Schlüssel.
    return b?.aktiv && b.art !== 'system' ? b : undefined;
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
    if (!(await this.person(benutzerId))) throw new Fachfehler(404, t('meldungen.konten.diesen-benutzer-gibt-es'));
    return (await this.repo.listeSitzungen(benutzerId)).map(({ hash: _h, ...x }) => ({ ...x, aktuell: x.id === aktuelleId }));
  }

  async beendeSitzung(benutzerId: string, id: string) {
    const s = (await this.repo.listeSitzungen(benutzerId)).find((x) => x.id === id);
    if (!s) throw new Fachfehler(404, t('meldungen.konten.diese-sitzung-gibt-es'));
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
        erg.push({ id: s.id, benutzerId: b.id, name: b.name, email: b.email, rolle: darfVerwalten(b) ? 'admin' : 'mitglied', geraet: s.geraet, ip: s.ip, zuletztAktiv: s.zuletztAktiv, erstellt: s.erstellt, aktuell: s.id === aktuelleId });
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
    if (admin.rolle !== 'admin') throw new Fachfehler(403, t('konten.verwaltung.fehler.modus'));
    const ziel = await this.person(zielId);
    if (!ziel) throw new Fachfehler(404, t('meldungen.konten.diesen-benutzer-gibt-es'));
    this.pruefeKontoVonVerwaltenden(admin, ziel);
    if (ziel.id === admin.id) throw new Fachfehler(409, t('meldungen.konten.du-bist-bereits-du'));
    if (!ziel.aktiv) throw new Fachfehler(409, t('meldungen.konten.der-benutzer-ist-deaktiviert'));
    const id = randomUUID();
    await this.repo.legeVertretungAn({ id, benutzerId: ziel.id, adminId: admin.id, adminName: admin.name || admin.email });
    const schluessel = await this.neueSitzung(ziel.id, info, id);
    if (adminSchluessel) await this.repo.loescheSitzung(hasheSchluessel(adminSchluessel));
    return { benutzer: ziel, schluessel };
  }

  /** Zurück ins eigene Konto: beendet die Vertretung und meldet den Administrator wieder an. */
  async vertretungBeenden(schluessel: string | undefined, info: Geraet) {
    const a = await this.anmeldungZu(schluessel);
    if (!a?.sitzung.vertretungId) throw new Fachfehler(409, t('meldungen.konten.du-agierst-gerade-nicht'));
    const v = await this.repo.holeVertretung(a.sitzung.vertretungId);
    await this.repo.beendeVertretung(a.sitzung.vertretungId);
    await this.repo.loescheSitzung(hasheSchluessel(schluessel!));
    const admin = v?.adminId ? await this.repo.holeBenutzer(v.adminId) : undefined;
    if (!admin || !admin.aktiv || !darfVerwalten(admin)) return { benutzer: null, schluessel: null };
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
    if (wert !== null && JSON.stringify(wert ?? null).length > 4000) throw new Fachfehler(422, t('meldungen.konten.die-einstellung-ist-zu'));
    await this.repo.setzeEinstellung(ich.id, schluessel, wert ?? null);
  }

  /** Hinweise für den Benutzer: Wer hat als er agiert? */
  hinweise(benutzerId: string) { return this.repo.ungeseheneVertretungen(benutzerId); }
  hinweiseGesehen(benutzerId: string) { return this.repo.markiereGesehen(benutzerId); }

  /* ---------- Eigenes Profil ---------- */

  private async bestaetige(ich: Benutzer, passwort: unknown) {
    const eintrag = await this.repo.holeHash(ich.email);
    if (!eintrag || !(await pruefePasswort(typeof passwort === 'string' ? passwort : '', eintrag.hash))) {
      throw new Fachfehler(403, t('meldungen.konten.das-aktuelle-passwort-stimmt'));
    }
  }

  private async benachrichtige(an: string, m: { betreff: string; text: string }, log: (m: string) => void) {
    if (!this.mailer) return;
    try { await this.mailer.sende(an, m.betreff, m.text); } catch (e) { log(`Hinweis-Mail an ${an} fehlgeschlagen: ${(e as Error).message}`); }
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
  async aenderePasswort(ich: Benutzer, e: { passwortAlt?: unknown; passwortNeu?: unknown }, log: (m: string) => void = () => {}, info: Geraet = OHNE_GERAET) {
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

  /* ---------- Benutzerverwaltung (nur Admin) ---------- */

  listeBenutzer() { return this.repo.listeBenutzer(); }

  /** Vollexport (#254): Benutzer ohne Passwörter, mit ihren Einstellungen; Vertretungen. */
  async exportDaten() {
    const benutzer = await Promise.all((await this.repo.listeBenutzer()).map(async (b) => ({
      id: b.id, email: b.email, name: b.name, verwaltung: b.verwaltung ?? [], aktiv: b.aktiv, erstellt: b.erstellt, letzteAnmeldung: b.letzteAnmeldung,
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
      return { id: b.id, name: b.name || b.email, aktiv: b.aktiv, ...(!b.aktiv && b.deaktiviert ? { deaktiviert: b.deaktiviert } : {}), ...(abwesend ? { abwesend } : {}) };
    }).concat(
      // Dienstkonten der Pakete (#338): nur für Namen in Historie und „angelegt von“ – nie auswählbar (aktiv: false).
      (await this.repo.listeDienstkonten()).map((b) => ({ id: b.id, name: b.name, aktiv: false, art: 'dienst' as const })),
      // Systemkonten (#673), z. B. „Automatisierung“: ebenso nur für Namen.
      (await this.repo.listeSystemkonten()).map((b) => ({ id: b.id, name: b.name, aktiv: false, art: 'system' as const })),
    );
  }

  /* ---------- Abwesenheit mit Vertreter (#78) ---------- */

  /** Abwesenheit setzen – für sich selbst oder (Administrator) für andere. Vertreter ist Pflicht, sobald sie an ist. */
  async setzeAbwesenheit(ich: Benutzer, id: string, e: { an?: unknown; von?: unknown; bis?: unknown; vertreterId?: unknown }) {
    const b = await this.person(id);
    if (!b) throw new Fachfehler(404, t('meldungen.konten.diesen-benutzer-gibt-es'));
    if (id !== ich.id && ich.rolle !== 'admin') throw new Fachfehler(403, t('konten.verwaltung.fehler.modus'));
    // Abwesenheit und Vertretung Verwaltender setzt nur „Gesamte Verwaltung“ (#957).
    if (id !== ich.id) this.pruefeKontoVonVerwaltenden(ich, b);
    const datum = (v: unknown, was: string): string | null => {
      const text2 = text(v);
      if (!text2) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text2) || Number.isNaN(Date.parse(text2))) throw new Fachfehler(422, t('meldungen.konten.bitte-ein-gueltiges-datum', { was }));
      return text2;
    };
    const a: Abwesenheit = { an: e.an === true || e.an === 'true', von: datum(e.von, 'von'), bis: datum(e.bis, 'bis'), vertreterId: text(e.vertreterId) || null };
    if (a.von && a.bis && a.bis < a.von) throw new Fachfehler(422, t('meldungen.konten.bis-liegt-vor-von'));
    if (a.an && a.bis && a.bis < heuteIn()) throw new Fachfehler(422, t('meldungen.konten.bis-liegt-in-der'));
    if (a.vertreterId) {
      if (a.vertreterId === id) throw new Fachfehler(422, t('meldungen.konten.als-vertreter-bitte-einen'));
      const v = await this.person(a.vertreterId);
      if (!v || !v.aktiv) throw new Fachfehler(422, t('meldungen.konten.der-vertreter-muss-ein'));
    } else if (a.an || !b.aktiv) throw new Fachfehler(422, t('meldungen.konten.bitte-einen-vertreter-waehlen'));
    const alt = b.abwesenheit ?? KEINE_ABWESENHEIT;
    const neu = await this.repo.setzeAbwesenheit(id, a);
    await this.spiegle(neu, ich.id, { vorher: alt });
    return neu;
  }

  /** Alle offenen Aufgaben an den hinterlegten Vertreter geben. */
  async aufgabenAnVertreter(ich: Benutzer, id: string) {
    if (id !== ich.id && ich.rolle !== 'admin') throw new Fachfehler(403, t('konten.verwaltung.fehler.modus'));
    const b = await this.person(id);
    if (!b) throw new Fachfehler(404, t('meldungen.konten.diesen-benutzer-gibt-es'));
    if (id !== ich.id) this.pruefeKontoVonVerwaltenden(ich, b);
    const v = b.abwesenheit?.vertreterId;
    if (!v) throw new Fachfehler(409, t('meldungen.konten.es-ist-kein-vertreter'));
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
        await this.spiegle(neu, null, { vorher: a, wegen: t('meldungen.konten.zeitraum-bis-abgelaufen', { reverse: a.bis.split('-').reverse().join('.') }) });
      } else if (a.an) await this.spiegle(b);
    }
  }

  /**
   * Neue Person mit Einladung. Ein Verwaltungsrecht (#818) bekommt sie dabei nur über den Befehl `dms` im Container
   * (`verwaltung`); in der Oberfläche vergibt es danach, wer „Gesamte Verwaltung“ hat (`setzeVerwaltung`).
   */
  async legeBenutzerAn(e: { email?: unknown; name?: unknown; verwaltung?: unknown }, von: string | null = null): Promise<Ergebnis> {
    const email = pruefeEmail(e.email);
    if (await this.repo.holeHash(email)) throw new Fachfehler(409, t('meldungen.konten.fuer-diese-e-mail'));
    const benutzer = await this.repo.legeBenutzerAn({ id: randomUUID(), email, name: text(e.name), verwaltung: liesVerwaltung(e.verwaltung), passwortHash: null });
    await this.spiegle(benutzer, von);
    if (benutzer.verwaltung?.length) log.warn('Verwaltungsrecht vergeben', { person: benutzer.email, vorher: '–', nachher: verwaltungText(benutzer.verwaltung), von: von ?? 'Konsole' });
    return this.verschickeLink(benutzer, 'einladung');
  }

  /**
   * Keine Rechteausweitung über „Benutzer“ (#818, Bauvorgabe Sicherheit): An Konten von Personen mit Verwaltungsrecht
   * (Passwort-Link, Zwei-Faktor zurücksetzen, deaktivieren, löschen, in ihrem Namen arbeiten, API-Schlüssel) darf nur,
   * wer „Gesamte Verwaltung“ hat – sonst übernähme jemand mit „Benutzer“ ein Gesamt-Konto über den Link zum Passwort-Setzen.
   */
  pruefeKontoVonVerwaltenden(ich: Benutzer, ziel: Pick<Benutzer, 'verwaltung' | 'art'>) {
    if (darfVerwalten(ziel) && !hatGesamt(ich)) throw new Fachfehler(403, t('konten.verwaltung.fehler.konto'));
  }
  /** Wie oben, mit der Id der Person. */
  async pruefeKontoVon(ich: Benutzer, id: string) {
    const b = await this.person(id);
    if (b) this.pruefeKontoVonVerwaltenden(ich, b);
  }

  /**
   * Verwaltungsrechte vergeben oder entziehen (#818): nur mit „Gesamte Verwaltung“ (die frische Anmeldung prüft die
   * Route). Schutzregel in einer Transaktion: Mindestens eine Person behält „Gesamte Verwaltung“. Protokoll mit
   * Vorher/Nachher; E-Mail an alle mit „Gesamte Verwaltung“. Wer Rechte verliert, verliert auch einen laufenden Modus.
   */
  async setzeVerwaltung(ich: Benutzer, id: string, eingabe: unknown, mailLog: (m: string) => void = () => {}): Promise<Benutzer> {
    if (!hatGesamt(ich)) throw new Fachfehler(403, t('konten.verwaltung.fehler.vergeben'));
    const b = await this.person(id);
    if (!b) throw new Fachfehler(404, t('meldungen.konten.diesen-benutzer-gibt-es'));
    const neu = liesVerwaltung(eingabe);
    if (gleicheVerwaltung(b.verwaltung, neu)) return b;
    const r = await this.repo.aendereGeschuetzt(id, { verwaltung: neu }, schutzGesamt);
    if ('grund' in r) throw new Fachfehler(409, r.grund);
    const vorher = b.verwaltung ?? [];
    const entzogen = vorher.some((x) => !neu.includes(x)) && !neu.includes(GESAMT);
    if (entzogen) await this.repo.vergissVerwaltungVon(id);
    // Protokoll deutsch, die Mail in der Sprache der Person, die sie bekommt (#729).
    const daten = inSprache('de', () => ({ person: b.email, vorher: verwaltungText(vorher), nachher: verwaltungText(neu), von: ich.email, imVerwaltungsmodus: ich.rolle === 'admin' }));
    log.warn(!neu.length ? 'Verwaltungsrecht entzogen' : !vorher.length ? 'Verwaltungsrecht vergeben' : 'Verwaltungsrecht geändert', daten);
    for (const x of await this.repo.listeBenutzer()) {
      if (!zaehltAlsGesamt(x) || x.email.endsWith('.invalid')) continue;
      const m = mitSpracheVon(x, () => mailtexte.verwaltungsrecht(b.name || b.email, verwaltungText(vorher), verwaltungText(neu), ich.name || ich.email));
      await this.benachrichtige(x.email, m, mailLog);
    }
    return r.benutzer;
  }

  async aendereBenutzer(ich: Benutzer, id: string, e: { name?: unknown; aktiv?: unknown }) {
    const b = await this.person(id);
    if (!b) throw new Fachfehler(404, t('meldungen.konten.diesen-benutzer-gibt-es'));
    const d: Partial<Pick<Benutzer, 'name' | 'aktiv'>> = {};
    if (e.name !== undefined) d.name = text(e.name);
    if (e.aktiv !== undefined) d.aktiv = !!e.aktiv;
    if (id === ich.id && d.aktiv === false) throw new Fachfehler(409, t('meldungen.konten.du-kannst-dich-nicht'));
    if (d.aktiv !== undefined && d.aktiv !== b.aktiv) this.pruefeKontoVonVerwaltenden(ich, b);
    // Deaktivieren nur mit Vertreter und ohne offene Aufgaben (#77, #78); der Vertreter wirkt danach dauerhaft.
    if (d.aktiv === false && b.aktiv) {
      if (!b.abwesenheit?.vertreterId) throw new Fachfehler(409, t('meldungen.konten.bitte-zuerst-einen-vertreter'));
      const offen = (await this.spiegel?.offeneAufgaben?.(id)) ?? 0;
      if (offen) throw new Fachfehler(409, t('meldungen.konten.hat-noch-offene-aufgaben', { anzahl: offen, wert: b.name || b.email }));
    }
    let neu = b;
    if (d.aktiv !== undefined && d.aktiv !== b.aktiv) {
      // Schutzregel (#818): die letzte Person mit „Gesamte Verwaltung“ lässt sich nicht deaktivieren.
      const r = await this.repo.aendereGeschuetzt(id, { aktiv: d.aktiv }, schutzGesamt);
      if ('grund' in r) throw new Fachfehler(409, r.grund);
      neu = r.benutzer;
    }
    if (d.name !== undefined) neu = await this.repo.aendereBenutzer(id, { name: d.name });
    if (d.aktiv === false) await this.repo.loescheSitzungenVon(id);
    return this.spiegle(neu, ich.id);
  }

  async loescheBenutzer(ich: Benutzer, id: string) {
    const b = await this.person(id);
    if (!b) throw new Fachfehler(404, t('meldungen.konten.diesen-benutzer-gibt-es'));
    if (id === ich.id) throw new Fachfehler(409, t('meldungen.konten.du-kannst-dich-nicht-2'));
    this.pruefeKontoVonVerwaltenden(ich, b);
    if (zaehltAlsGesamt(b) && !(await this.repo.listeBenutzer()).some((x) => x.id !== id && zaehltAlsGesamt(x))) throw new Fachfehler(409, t('konten.verwaltung.fehler.letzte'));
    // Wer schon angemeldet war, hat Spuren hinterlassen (angelegt von, Verweise): deaktivieren statt löschen (#26).
    // Löschen bleibt für Einladungen, die nie angenommen wurden, z. B. bei einer vertippten Adresse.
    if (b.hatPasswort || b.letzteAnmeldung) throw new Fachfehler(409, t('meldungen.konten.wer-sich-schon-angemeldet'));
    // Mit Papierkorb (#43): deaktivieren und die Mappe in den Papierkorb; das Konto wird erst beim Leeren gelöscht.
    if (this.spiegel?.inPapierkorb && (await this.spiegel.papierkorbAn?.())) {
      await this.spiegel.inPapierkorb(id, ich.id);
      const r = await this.repo.aendereGeschuetzt(id, { aktiv: false }, schutzGesamt);
      if ('grund' in r) throw new Fachfehler(409, r.grund);
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
      // Testlauf der Rechte (#710): auch Systemkonten und Dienstkonten der Pakete.
      ohneMensch: async () => [...await this.repo.listeSystemkonten(), ...await this.repo.listeDienstkonten()],
      dienstkonten: () => this.repo.listeDienstkonten(),
      // Favorit = Abo (#422): persönliche Einstellungen (Benachrichtigen, Hervorheben).
      einstellungen: (id: string) => this.repo.einstellungen(id),
      // #506: Vorgabe für neue Benutzer und „auf alle anwenden“.
      setzeEinstellung: (id: string, schluessel: string, wert: unknown) => this.repo.setzeEinstellung(id, schluessel, wert ?? null),
      wiederda: async (id: string, von: string | null) => {
        const b = await this.person(id);
        if (b && !b.aktiv) await this.spiegle(await this.repo.aendereBenutzer(id, { aktiv: true }), von);
      },
    };
  }

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
    await this.repo.vergissVerwaltungVon(b.id);
    return (await this.repo.holeBenutzer(b.id)) ?? b;
  }

  /** Admin: neuen Link schicken (Einladung, wenn noch kein Passwort gesetzt ist, sonst Zurücksetzen). */
  /**
   * Notfallzugang (#108): neue Person mit „Gesamte Verwaltung“ (#818) ohne Passwort und ein Einmal-Link, der nur
   * `minuten` gilt; beim Öffnen legt man ein eigenes Passwort fest. Der Link wird nicht verschickt.
   */
  async notfallzugang(minuten: number, jetzt = new Date()): Promise<{ benutzer: Benutzer; link: string; ablauf: Date }> {
    const teile = Object.fromEntries(new Intl.DateTimeFormat('de-DE', { timeZone: zeitzone(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(jetzt).map((x) => [x.type, x.value]));
    const name = t('meldungen.konten.notfall-admin', { day: teile.day, month: teile.month, year: teile.year, hour: teile.hour, minute: teile.minute });
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

  private async verschickeLink(b: Benutzer, zweck: Zweck): Promise<Ergebnis> {
    await this.repo.loescheLinksVon(b.id);
    const schluessel = neuerSchluessel();
    const dauer = zweck === 'einladung' ? EINLADUNG_TAGE * TAG : ZURUECKSETZEN_STUNDEN * 60 * 60 * 1000;
    await this.repo.legeLinkAn(hasheSchluessel(schluessel), b.id, zweck, new Date(Date.now() + dauer));
    const link = `${this.appUrl.replace(/\/$/, '')}/passwort/${schluessel}`;
    if (!this.mailer) return { benutzer: b, mailVerschickt: false, link };
    // In der Sprache der Person (#729); eine neue Person hat noch keine Wahl – dann die der Installation.
    const m = mitSpracheVon(b, () => (zweck === 'einladung'
      ? mailtexte.einladung(b.name, b.email, link, EINLADUNG_TAGE)
      : mailtexte.zuruecksetzen(b.name, b.email, link, ZURUECKSETZEN_STUNDEN)));
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
    // Anbieter (#241) mit „Passwort nur für Verwaltende“ (#818): kein Passwort für alle anderen.
    const a = await this.anbieter();
    if (a?.lokalNurAdmins && !darfVerwalten(await this.repo.holeBenutzer(l.benutzerId))) throw new Fachfehler(403, t('anmeldung.fehler.anbieter', { knopf: a.knopf }));
    if (!(await this.repo.verbraucheLink(hash))) throw new Fachfehler(410, t('anmeldung.fehler.link.benutzt'));
    await this.repo.setzeHash(l.benutzerId, await hashePasswort(passwort));
    await this.repo.loescheSitzungenVon(l.benutzerId);
    const benutzer = (await this.repo.holeBenutzer(l.benutzerId))!;
    // Zwei-Faktor (#242): Der Link ersetzt nur das Passwort, nicht den zweiten Faktor.
    if (this.zweifaktor && (await this.zweifaktor.aktiv(benutzer.id))) {
      return { benutzer, zweiterSchritt: await this.merkeZweitenSchritt(benutzer.id, benutzer.email, info) };
    }
    await this.repo.notiereAnmeldung(l.benutzerId);
    return { benutzer, schluessel: await this.neueSitzung(l.benutzerId, { ...info, voll: true }) };
  }
}
