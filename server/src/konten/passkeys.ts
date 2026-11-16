/**
 * Passkeys (#811, #1278 Teil von `Konten`): Anmelden mit Passkey und Bestätigen für Dokumente.
 */
import { KontenAnmeldung } from './anmeldung';
import type { Passkeys } from '../anmeldung/passkeys';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { type ZweiterSchritt, ZWEITER_SCHRITT } from './hilfen';
import { hashe } from '../zwischenspeicher/kurzzustand';
import type { Versuch } from '../anmeldung/anmeldesperre';
import { type Benutzer, istPerson } from '../../../shared/src/model';
import { darfVerwalten } from '../../../shared/src/verwaltungsrecht';
import type { SitzungIntern } from './konto-repo';

/** Anmelden und Bestätigen mit Passkey. */
export abstract class KontenPasskeys extends KontenAnmeldung {
  /* ---------- Passkeys (#811) ---------- */

  protected pk(): Passkeys {
    if (!this.passkeys) throw new Fachfehler(404, t('anmeldung.passkey.fehler.aus'));
    return this.passkeys;
  }

  /** Zweiter Schritt mit Kennung (aus dem Kurzzustand), nur von derselben Adresse wie der erste. */
  private async zweiterSchritt(kennung: unknown, ip: string): Promise<{ schluessel: string; k: ZweiterSchritt }> {
    const schluessel = typeof kennung === 'string' && kennung ? hashe(kennung) : '';
    const k = schluessel ? ((await this.zustand.lies(ZWEITER_SCHRITT, schluessel))?.wert as ZweiterSchritt | undefined) : undefined;
    if (!k || k.ip !== ip) throw new Fachfehler(401, t('anmeldung.fehler.abgelaufen'));
    return { schluessel, k };
  }

  /**
   * Optionen für die Anmeldung mit Passkey: ohne E-Mail-Adresse (das Gerät fragt, welcher Passkey) oder – mit der
   * Kennung des zweiten Schritts – nur mit den Passkeys dieser Person. Eine gesperrte Adresse bekommt keine.
   */
  async passkeyOptionen(e: { zweiterSchritt?: unknown }, ip: string) {
    const pk = this.pk();
    if (e.zweiterSchritt !== undefined && e.zweiterSchritt !== null) {
      const z = await this.zweiterSchritt(e.zweiterSchritt, ip);
      await this.sperre.pruefe(z.k.email.toLowerCase(), ip);
      return pk.beginneAnmeldung('zweiter-schritt', z.k.benutzerId, z.schluessel);
    }
    await this.sperre.pruefe('', ip);
    return pk.beginneAnmeldung('anmelden', null, null, ip);
  }

  /**
   * Anmeldung mit Passkey (#811) – als eigener Weg oder als zweiter Schritt. Der Anmeldeschutz (#240) gilt wie beim
   * Passwort: vorab gezählt (#956), je E-Mail-Adresse des genannten Kontos und je IP; ein Erfolg setzt zurück.
   */
  async anmeldenMitPasskey(e: { kennung?: unknown; antwort?: unknown; zweiterSchritt?: unknown }, ip: string, geraet = '') {
    const pk = this.pk();
    const z = e.zweiterSchritt !== undefined && e.zweiterSchritt !== null ? await this.zweiterSchritt(e.zweiterSchritt, ip) : null;
    const vermutet = z ? z.k.benutzerId : (await pk.vermutlich(e.kennung, e.antwort)).benutzerId;
    const kandidat = vermutet ? await this.repo.holeBenutzer(vermutet) : undefined;
    const email = (z?.k.email ?? kandidat?.email ?? '').toLowerCase();
    const v = await this.sperre.versuch(email, ip);
    if (z) await this.zaehleZweitenSchritt(z.schluessel);
    const treffer = await this.pruefePasskey(e, z, { email, ip, v, bekannt: !!z || !!kandidat?.aktiv });
    if (z && !(await this.zustand.nimm(ZWEITER_SCHRITT, z.schluessel))) throw new Fachfehler(401, t('anmeldung.fehler.abgelaufen'));
    const benutzer = await this.passkeyPerson(treffer.benutzerId, !z);
    await this.repo.notiereAnmeldung(benutzer.id);
    return {
      benutzer,
      schluessel: await this.neueSitzung(benutzer.id, { ip, geraet: z?.k.geraet ?? geraet, voll: true }),
      passkey: treffer.name,
    };
  }

  /** Höchstens 5 Versuche je Kennung des zweiten Schritts, wie beim Code (#744, #956). */
  private async zaehleZweitenSchritt(schluessel: string) {
    const n = await this.zustand.erhoehe(ZWEITER_SCHRITT, schluessel);
    if (n === null || n > 5) {
      await this.zustand.loesche(ZWEITER_SCHRITT, schluessel);
      throw new Fachfehler(401, t('anmeldung.fehler.abgelaufen'));
    }
  }

  /** Antwort des Geräts prüfen; ein Fehlschlag zählt in den Anmeldeschutz, ein Erfolg setzt ihn zurück. */
  private async pruefePasskey(
    e: { kennung?: unknown; antwort?: unknown },
    z: { schluessel: string; k: ZweiterSchritt } | null,
    s: { email: string; ip: string; v: Versuch; bekannt: boolean },
  ) {
    try {
      const treffer = await this.pk().pruefeAnmeldung(
        e.kennung,
        e.antwort,
        z ? { zweck: 'zweiter-schritt', benutzerId: z.k.benutzerId } : { zweck: 'anmelden' },
      );
      if (z && treffer.bezug !== z.schluessel) throw new Fachfehler(401, t('anmeldung.passkey.fehler.falsch'));
      await this.sperre.erfolg(s.email, s.ip, s.v);
      return treffer;
    } catch (x) {
      await this.sperre.fehlschlag(s.email, s.ip, s.bekannt, s.v);
      throw x;
    }
  }

  /** Die Person zum Passkey: aktiv, ein Mensch; als eigener Weg nicht, wenn der Anbieter Passwörter nur Verwaltenden lässt. */
  private async passkeyPerson(id: string, eigenerWeg: boolean): Promise<Benutzer> {
    const b = await this.repo.holeBenutzer(id);
    if (!b || !b.aktiv || !istPerson(b)) throw new Fachfehler(401, t('anmeldung.passkey.fehler.falsch'));
    // Anbieter (#241) mit „Passwort nur für Verwaltende“: Auch der Passkey ist dann nur für sie ein eigener Weg.
    const a = eigenerWeg ? await this.anbieter() : null;
    if (a?.lokalNurAdmins && !darfVerwalten(b)) throw new Fachfehler(403, t('anmeldung.fehler.anbieter', { knopf: a.knopf }));
    return b;
  }

  /** Optionen für die erneute Anmeldung mit Passkey (Verwaltungsmodus, heikle Handlungen, #819). */
  async passkeyBestaetigungOptionen(b: Benutzer, s: SitzungIntern | undefined, fuer?: unknown) {
    if (s?.vertretungId) throw new Fachfehler(403, t('konten.verwaltung.fehler.vertretung'));
    // Eigener Zweck für „Passwörter für Dokumente“ (#827): Eine solche Bestätigung taugt nicht für den Verwaltungsmodus.
    return this.pk().beginneAnmeldung(fuer === 'dokumentpasswoerter' ? 'dokumentpasswoerter' : 'bestaetigen', b.id);
  }

  /** Bestätigung für „Passwörter für Dokumente“ mit Passkey (#811, #827); wirft 403 bei Fehlern. */
  async pruefePasskeyFuerDokumente(b: Benutzer, passkey: unknown) {
    const p = (passkey && typeof passkey === 'object' ? passkey : {}) as { kennung?: unknown; antwort?: unknown };
    try {
      await this.pk().pruefeAnmeldung(p.kennung, p.antwort, { zweck: 'dokumentpasswoerter', benutzerId: b.id });
    } catch (x) {
      throw new Fachfehler(403, x instanceof Fachfehler ? x.message : t('anmeldung.passkey.fehler.falsch'));
    }
  }
}
