/**
 * Einrichten und Anmelden (#1278, Teil von `Konten`): Passwort, Anbieter (#241), zweiter Schritt mit Code (#242) und
 * neue Sitzung.
 */
import { randomUUID } from 'node:crypto';
import { KontenBasis } from './basis';
import {
  type Geraet,
  OHNE_GERAET,
  pruefeEmail,
  pruefePasswortRegeln,
  text,
  log,
  schutzGesamt,
  ZWEITER_SCHRITT,
  type ZweiterSchritt,
  ZWEITER_SCHRITT_MS,
  SITZUNG_TAGE,
  TAG,
} from './hilfen';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { GESAMT, darfVerwalten, verwaltungText, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { hashePasswort, hasheSchluessel, neuerSchluessel } from '../anmeldung/passwort';
import type { Benutzer } from '../../../shared/src/model';
import type { AnbieterIdentitaet, OidcEinstellung } from '../anmeldung/oidc';
import { hashe } from '../zwischenspeicher/kurzzustand';

/** Einrichten, Anmelden und neue Sitzungen. */
export abstract class KontenAnmeldung extends KontenBasis {
  async einrichtungNoetig() {
    return (await this.repo.anzahlBenutzer()) === 0;
  }

  /** Erster Aufruf: legt den Administrator an und meldet ihn an. */
  async einrichten(e: { email?: unknown; name?: unknown; passwort?: unknown }, info: Geraet = OHNE_GERAET) {
    if (!(await this.einrichtungNoetig())) throw new Fachfehler(409, t('meldungen.konten.die-einrichtung-ist-bereits'));
    const email = pruefeEmail(e.email);
    const passwort = pruefePasswortRegeln(e.passwort);
    // #818: Die erste Person bekommt „Gesamte Verwaltung“ – ein eigenes Admin-Konto gibt es nicht mehr.
    const benutzer = await this.repo.legeBenutzerAn({
      id: randomUUID(),
      email,
      name: text(e.name) || email,
      verwaltung: [GESAMT],
      passwortHash: await hashePasswort(passwort),
    });
    await this.repo.notiereAnmeldung(benutzer.id);
    await this.spiegle(benutzer, benutzer.id);
    // Gleich im Verwaltungsmodus (#819): Der Einrichtungsassistent richtet danach weiter ein.
    const schluessel = await this.neueSitzung(benutzer.id, { ...info, voll: true });
    const jetzt = new Date();
    await this.repo.setzeSitzungsVerwaltung(hasheSchluessel(schluessel), {
      verwaltungSeit: jetzt,
      verwaltungAktiv: jetzt,
      verwaltungBestaetigt: jetzt,
    });
    log.warn('Verwaltungsmodus begonnen', { person: benutzer.email, imVerwaltungsmodus: true, anmeldung: 'Einrichtung' });
    return { benutzer, schluessel };
  }

  async anmelden(e: { email?: unknown; passwort?: unknown }, ip: string, geraet = '') {
    const email = text(e.email).toLowerCase();
    const passwort = typeof e.passwort === 'string' ? e.passwort : '';
    // Vorab gezählt (#956): Auch gleichzeitige Anfragen kommen nicht an der Grenze vorbei.
    const v = await this.sperre.versuch(email, ip);
    const treffer = email ? await this.repo.holeHash(email) : undefined;
    const ok = await this.passwortStimmt(treffer?.benutzer.id, passwort, treffer?.hash, () => this.sperre.zurueck(email, ip, v));
    if (!ok || !treffer || !treffer.benutzer.aktiv) {
      await this.sperre.fehlschlag(email, ip, !!treffer?.benutzer.aktiv, v);
      throw new Fachfehler(401, t('anmeldung.fehler.falsch'));
    }
    await this.sperre.erfolg(email, ip, v);
    // Anbieter (#241): Passwort nur noch für Personen, die verwalten dürfen (Notzugang, #818)?
    const a = await this.anbieter();
    if (a?.lokalNurAdmins && !darfVerwalten(treffer.benutzer))
      throw new Fachfehler(403, t('anmeldung.fehler.anbieter', { knopf: a.knopf }));
    return this.nachErstemFaktor(treffer.benutzer, { ip, geraet });
  }

  /**
   * Welche zweiten Faktoren gelten für diese Person – oder null, wenn keiner nötig ist? Code aus der App (#242), sobald
   * eingerichtet; ein Passkey (#811) als Alternative dazu, und allein nur, wenn für die Rolle ein Passkey oder die
   * Zwei-Faktor-Anmeldung vorgeschrieben ist – ein Passkey erfüllt auch diese Pflicht (sonst bliebe ein verlorenes Handy
   * ohne Wiederherstellungscodes ein Aussperren).
   */
  async zweiteWege(b: Benutzer): Promise<{ code: boolean; passkey: boolean } | null> {
    const code = !!this.zweifaktor && (await this.zweifaktor.aktiv(b.id));
    const pk = this.passkeys;
    if (code) return { code, passkey: !!pk && (await pk.nutzbar(b.id)) };
    if (!pk || !(await pk.anzahl(b.id))) return null;
    const pkPflicht = await pk.pflichtGilt(b);
    const zfPflicht = !!this.zweifaktor && (await this.zweifaktor.pflichtFuer(b));
    if (!pkPflicht && !zfPflicht) return null;
    // Entschieden wird gegen die gepflegte Adresse (Durchsicht Sicherheit): Gilt dort ein Passkey und läuft die Anfrage
    // über sie, ist er der zweite Schritt. Sonst kein Durchwinken über eine IP-Adresse oder einen zweiten Namen.
    const rp = pk.pflichtRp();
    if (rp && (await pk.fuerPflicht(b.id)) && pk.rp()?.rpId === rp.rpId) return { code: false, passkey: true };
    if (rp) throw new Fachfehler(409, t('anmeldung.passkey.fehler.andere-adresse', { adresse: rp.origin }), { adresse: rp.origin });
    // Ohne gepflegte Adresse zählt kein Passkey: Passkey-Pflicht bleibt geschlossen; die Zwei-Faktor-Pflicht verlangt
    // dann wie ohne Passkey die Code-App (nach der Anmeldung, vor allem anderen).
    if (pkPflicht) throw new Fachfehler(409, t('anmeldung.passkey.fehler.ohne-adresse'), { adresse: null });
    return null;
  }

  /**
   * Ist der letzte Passkey nötig, um eine Pflicht zu erfüllen? Passkey vorgeschrieben – oder Zwei-Faktor vorgeschrieben
   * ohne Code-App (#811). Dann lässt er sich nicht selbst entfernen. Liefert den Grund oder null.
   */
  async passkeyNoetig(b: Benutzer): Promise<'passkey' | 'zweifaktor' | null> {
    if (!this.passkeys || !this.passkeys.pflichtRp()) return null;
    if (this.passkeys && (await this.passkeys.pflichtGilt(b))) return 'passkey';
    if (this.zweifaktor && (await this.zweifaktor.pflichtFuer(b)) && !(await this.zweifaktor.aktiv(b.id))) return 'zweifaktor';
    return null;
  }

  /** Nach Passwort oder Anbieter: zweiter Faktor (Code #242, Passkey #811) oder gleich die Sitzung. */
  private async nachErstemFaktor(b: Benutzer, g: Geraet) {
    const wege = await this.zweiteWege(b);
    if (wege) return { zweiterSchritt: await this.merkeZweitenSchritt(b.id, b.email, g), wege } as const;
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
      if (!e.anlegen)
        throw new Fachfehler(403, t('anmeldung.fehler.anbieter.unbekannt', { email: id.email }), { anmeldefehler: 'kein-konto' });
      const gesamt = gruppeAdmin ?? e.standardrolle === 'admin';
      b = await this.repo.legeBenutzerAn({
        id: randomUUID(),
        email: id.email,
        name: id.name || id.email,
        verwaltung: gesamt ? [GESAMT] : [],
        passwortHash: null,
      });
      await this.spiegle(b, b.id);
      log.info('Benutzer über den Anbieter angelegt', { email: b.email, verwaltung: verwaltungText(b.verwaltung) });
    } else if (gruppeAdmin !== null && gruppeAdmin !== hatGesamt(b) && b.aktiv) {
      const neu = gruppeAdmin ? [GESAMT] : [];
      const r = await this.repo.aendereGeschuetzt(b.id, { verwaltung: neu }, schutzGesamt);
      if ('grund' in r)
        log.warn('Verwaltungsrecht nicht aus der Gruppe übernommen: letzte Person mit „Gesamte Verwaltung“', { email: b.email });
      else {
        log.warn('Verwaltungsrecht aus der Gruppe des Anbieters übernommen', {
          person: b.email,
          vorher: verwaltungText(b.verwaltung),
          nachher: verwaltungText(neu),
          von: 'Anbieter',
        });
        if (!gruppeAdmin) await this.repo.vergissVerwaltungVon(b.id);
        b = r.benutzer;
      }
    }
    if (!b.aktiv) throw new Fachfehler(403, t('anmeldung.fehler.deaktiviert'), { anmeldefehler: 'deaktiviert' });
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
    if (!eintrag || !(await this.passwortStimmt(eintrag.benutzer.id, typeof passwort === 'string' ? passwort : '', eintrag.hash)))
      throw new Fachfehler(403, t('meldungen.konten.das-passwort-stimmt-nicht'));
  }

  /** Zweiter Schritt (#242): Code aus der App oder ein Wiederherstellungscode. */
  protected async merkeZweitenSchritt(benutzerId: string, email: string, g: Geraet) {
    const kennung = neuerSchluessel();
    await this.zustand.setze(
      ZWEITER_SCHRITT,
      hashe(kennung),
      { benutzerId, email, ip: g.ip, geraet: g.geraet } satisfies ZweiterSchritt,
      Date.now() + ZWEITER_SCHRITT_MS,
    );
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
    await this.sperre.erfolg(k.email, ip, v);
    // Einmal einlösbar: Von zwei gleichzeitigen Anfragen mit derselben Kennung bekommt nur eine die Sitzung.
    if (!(await this.zustand.nimm(ZWEITER_SCHRITT, schluessel))) throw new Fachfehler(401, t('anmeldung.fehler.abgelaufen'));
    const benutzer = await this.repo.holeBenutzer(k.benutzerId);
    if (!benutzer || !benutzer.aktiv) throw new Fachfehler(401, t('anmeldung.fehler.falsch'));
    await this.repo.notiereAnmeldung(benutzer.id);
    return {
      benutzer,
      schluessel: await this.neueSitzung(benutzer.id, { ip, geraet: k.geraet, voll: true }),
      wiederherstellung: art === 'wiederherstellung',
    };
  }

  protected async neueSitzung(benutzerId: string, info: Geraet & { voll?: boolean }, vertretungId: string | null = null) {
    const schluessel = neuerSchluessel();
    // Eine vertretene Sitzung (#43) ist nie eine Anmeldung mit allen Faktoren (#819).
    await this.repo.legeSitzungAn(hasheSchluessel(schluessel), benutzerId, new Date(Date.now() + SITZUNG_TAGE * TAG), {
      ...info,
      vertretungId,
      voll: !!info.voll && !vertretungId,
    });
    return schluessel;
  }
}
