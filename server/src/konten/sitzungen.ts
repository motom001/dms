/**
 * Sitzungen und Vertretung (#1278, Teil von `Konten`): Sitzungen einsehen und beenden, als anderer Benutzer anmelden.
 */
import { randomUUID } from 'node:crypto';
import { KontenVerwaltungsmodus } from './verwaltungsmodus';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { darfVerwalten, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import type { Benutzer } from '../../../shared/src/model';
import type { Geraet } from './hilfen';
import { hasheSchluessel } from '../passwort';
import type { SitzungIntern } from '../konto-repo';

/** Sitzungen (Verwaltung) und Vertretung. */
export abstract class KontenSitzungen extends KontenVerwaltungsmodus {
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
    const erg: Array<{
      id: string;
      benutzerId: string;
      name: string;
      email: string;
      rolle: string;
      geraet: string;
      ip: string;
      zuletztAktiv: string;
      erstellt: string;
      aktuell: boolean;
    }> = [];
    for (const b of await this.repo.listeBenutzer()) {
      for (const s of await this.repo.listeSitzungen(b.id)) {
        erg.push({
          id: s.id,
          benutzerId: b.id,
          name: b.name,
          email: b.email,
          rolle: darfVerwalten(b) ? 'admin' : 'mitglied',
          geraet: s.geraet,
          ip: s.ip,
          zuletztAktiv: s.zuletztAktiv,
          erstellt: s.erstellt,
          aktuell: s.id === aktuelleId,
        });
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

  /** Wer vertritt in dieser Sitzung (#1357, Systemprotokoll)? E-Mail der vertretenden Person, sonst ihr Name; null ohne Vertretung. */
  async vertretenVon(sitzung?: SitzungIntern): Promise<string | null> {
    if (!sitzung?.vertretungId) return null;
    const v = await this.repo.holeVertretung(sitzung.vertretungId);
    if (!v) return null;
    return (v.adminId ? (await this.repo.holeBenutzer(v.adminId))?.email : undefined) ?? v.adminName;
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
}
