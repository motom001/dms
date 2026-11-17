/**
 * Grundlage der Konten (#1278): Verbindungen (Anmeldesperre, Zwei-Faktor, Passkeys, Anbieter, Kurzzustand), Repo,
 * Mailer, Adressen und Benutzer-Spiegel. `Konten` ist eine Kette von Teil-Klassen, je Aufgabe eine Datei:
 * basis → anmeldung → passkeys → verwaltungsmodus → sitzungen → profil → notfall → benutzer → konten. Jede Teil-Klasse
 * ruft nur, was unter ihr steht. Die Rümpfe sind aus konten.ts unverändert übernommen, `this` ist überall dasselbe
 * Konten-Objekt.
 */
import { Anmeldesperre } from '../anmeldung/anmeldesperre';
import type { Zweifaktor } from '../anmeldung/zweifaktor';
import type { Passkeys } from '../anmeldung/passkeys';
import type { OidcEinstellung } from '../anmeldung/oidc';
import { type Kurzzustand, speicherKurzzustand } from '../zwischenspeicher/kurzzustand';
import type { KontoRepo } from './konto-repo';
import type { Mailer } from '../mail/mail';
import type { Benutzerspiegel } from '../mappentypen';
import type { Benutzer, Abwesenheit } from '../../../shared/src/model';
import { hashePasswort, hashVeraltet, pruefePasswort } from '../anmeldung/passwort';
import { log } from './hilfen';

/** Zustand, Verbindungen und gemeinsame Hilfen. */
export abstract class KontenBasis {
  /** Anmeldeschutz (#240); ohne Verbindung mit Standardwerten im Arbeitsspeicher. */
  sperre = new Anmeldesperre();
  verbindeSperre(s: Anmeldesperre) {
    this.sperre = s;
  }
  /** Zwei-Faktor-Anmeldung (#242); ohne Verbindung gibt es keine. */
  zweifaktor: Zweifaktor | null = null;
  verbindeZweifaktor(z: Zweifaktor) {
    this.zweifaktor = z;
    this.verbindeAlternative();
  }
  /** Passkeys (#811); ohne Verbindung gibt es keine. */
  passkeys: Passkeys | null = null;
  verbindePasskeys(p: Passkeys) {
    this.passkeys = p;
    this.verbindeAlternative();
  }
  /** Ein Passkey erfüllt auch die Zwei-Faktor-Pflicht (Entscheidung 11.11.2026, #811). */
  private verbindeAlternative() {
    // Nur ein Passkey für die gepflegte Adresse zählt (Durchsicht Sicherheit): nie die Adresse der Anfrage.
    if (this.zweifaktor) this.zweifaktor.alternative = async (id) => !!this.passkeys && (await this.passkeys.fuerPflicht(id));
  }
  /** Anmeldung über einen Anbieter (#241): aktive Einstellung, sonst null. */
  protected anbieter: () => Promise<OidcEinstellung | null> = async () => null;
  verbindeAnbieter(f: () => Promise<OidcEinstellung | null>) {
    this.anbieter = f;
  }
  /**
   * Zustand zwischen Anfragen (#744), u. a. der zweite Anmeldeschritt: Nach richtigem Passwort, vor dem Code eine
   * kurzlebige Kennung je Anmeldung – in der Datenbank nur ihr Hash, gültig 5 Minuten, einmal einlösbar.
   */
  protected zustand: Kurzzustand = speicherKurzzustand();
  verbindeZustand(z: Kurzzustand) {
    this.zustand = z;
  }

  /**
   * `spiegel` hält die Benutzer-Mappen (#26) auf dem Stand der Konten: Das Konto ist führend,
   * die Mappe zeigt Name, E-Mail, Rolle und ob der Benutzer aktiv ist.
   */
  constructor(
    protected repo: KontoRepo,
    /** Mailer oder – seit #37 – eine Funktion, die den gerade eingestellten liefert (Werkbank, ohne Neustart). */
    private mailQuelle: Mailer | null | (() => Mailer | null),
    /** Adresse für Links; als Funktion je Anfrage (gepflegt oder Adresse der Anfrage). */
    private adresse: string | (() => string),
    protected spiegel: Benutzerspiegel | null = null,
  ) {}

  protected get mailer(): Mailer | null {
    return typeof this.mailQuelle === 'function' ? this.mailQuelle() : this.mailQuelle;
  }
  protected get appUrl(): string {
    return typeof this.adresse === 'function' ? this.adresse() : this.adresse;
  }

  /**
   * Adresse für Links **in Mails**: nur die gepflegte Adresse, nie die der Anfrage. Sonst könnte jemand mit einem
   * eigenen Host-Kopf „Passwort vergessen“ aufrufen und Ablago eine echte Mail mit Link auf seinen Server verschicken
   * lassen. Leer: keine Links per Mail – wie ohne Mailversand. Ohne Verbindung (Tests) gilt `adresse`.
   */
  private mailAdresse?: () => string;
  verbindeMailAdresse(f: () => string) {
    this.mailAdresse = f;
  }
  protected get mailUrl(): string {
    return (this.mailAdresse ? this.mailAdresse() : this.appUrl).replace(/\/+$/, '');
  }

  /** Benutzer-Mappe nachziehen; `abwesenheit` (#962), wenn sich die Abwesenheit geändert hat – dann in derselben Transaktion. */
  protected async spiegle(b: Benutzer, von: string | null = null, abwesenheit?: { vorher: Abwesenheit; wegen?: string }) {
    if (this.spiegel) await this.spiegel.aktualisiere(b, von, abwesenheit);
    return b;
  }

  get mailAktiv() {
    return !!this.mailer;
  }

  /**
   * Passwort prüfen (#1358): Stimmt es und trägt der Hash ältere scrypt-Parameter, speichert Ablago ihn gleich mit den
   * aktuellen neu – ohne dass jemand etwas tun muss. Nur, wenn noch derselbe Hash gespeichert ist (ein gleichzeitiger
   * Passwortwechsel gewinnt). Ein Fehler dabei verhindert die Anmeldung nicht.
   */
  protected async passwortStimmt(benutzerId: string | undefined, passwort: string, hash: string | null | undefined): Promise<boolean> {
    const ok = await pruefePasswort(passwort, hash);
    if (ok && benutzerId && hash && hashVeraltet(hash)) {
      try {
        if (await this.repo.ersetzeHash(benutzerId, hash, await hashePasswort(passwort)))
          log.info('Passwort-Hash mit neuen Parametern gespeichert', { benutzer: benutzerId });
      } catch (e) {
        log.warn('Passwort-Hash nicht neu gespeichert', { benutzer: benutzerId, fehler: (e as Error).message });
      }
    }
    return ok;
  }
}
