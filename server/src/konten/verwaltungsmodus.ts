/**
 * Verwaltungsmodus (#819, #1278 Teil von `Konten`): beginnen, bestätigen, beenden; dazu Abmelden, Anmeldung zu einer
 * Sitzung und das Nachschlagen von Konten (Dienst-, System- und Personenkonten).
 */
import { randomUUID } from 'node:crypto';
import { KontenPasskeys } from './passkeys';
import { type Benutzer, type Systemkonto, SYSTEMKONTEN, istPerson } from '../../../shared/src/model';
import type { SitzungIntern } from '../konto-repo';
import { darfVerwalten, MODUS_MINUTEN, FRISCH_MINUTEN, type Verwaltungsstand, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { MINUTE, tagVon, log, type Bestaetigung, BERUEHREN_MS } from './hilfen';
import { hasheSchluessel, pruefePasswort } from '../passwort';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';

/** Verwaltungsmodus, Abmelden und Nachschlagen von Konten. */
export abstract class KontenVerwaltungsmodus extends KontenPasskeys {
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
      darf: darfVerwalten(b) && !s?.vertretungId,
      aktiv,
      bis: aktiv && zuletzt ? new Date(zuletzt.getTime() + MODUS_MINUTEN * MINUTE).toISOString() : null,
      heuteBestaetigt: this.heuteBestaetigt(s),
      frisch: this.istFrisch(s),
      code: !!this.zweifaktor && (await this.zweifaktor.aktiv(b.id)),
      passwort: b.hatPasswort,
      passkey: await this.passkeyNutzbar(b),
      bereiche: hatGesamt(b) ? null : [...(b.verwaltung ?? [])],
    };
  }

  /**
   * Bei jeder Anfrage: Läuft der Modus, zählt eine Aktivität (Klick, Eingabe, Änderung) als „noch da“; ist er
   * abgelaufen, endet er hier – mit Eintrag im Protokoll. Liefert, ob er (noch) läuft.
   */
  async modusPruefen(
    b: Benutzer | undefined,
    schluessel: string | undefined,
    s: SitzungIntern | undefined,
    aktivitaet: boolean,
  ): Promise<boolean> {
    if (!b || !s || !schluessel || !s.verwaltungSeit) return false;
    const hash = hasheSchluessel(schluessel);
    if (!this.modusAktiv(b, s)) {
      await this.repo.setzeSitzungsVerwaltung(hash, { verwaltungSeit: null, verwaltungAktiv: null });
      s.verwaltungSeit = null;
      s.verwaltungAktiv = null;
      log.info(darfVerwalten(b) ? 'Verwaltungsmodus abgelaufen' : 'Verwaltungsmodus beendet: kein Verwaltungsrecht mehr', {
        person: b.email,
        imVerwaltungsmodus: true,
      });
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
  private async bestaetigeErneut(b: Benutzer, e: Bestaetigung, ip: string, wofuer: string): Promise<void> {
    const email = b.email.toLowerCase();
    // Passkey (#811): statt Passwort und Code – auch für Personen, die sich sonst nur über einen Anbieter anmelden.
    if (e.passkey !== undefined && e.passkey !== null) {
      const p = (typeof e.passkey === 'object' ? e.passkey : {}) as { kennung?: unknown; antwort?: unknown };
      const v = await this.sperre.versuch(email, ip);
      try {
        await this.pk().pruefeAnmeldung(p.kennung, p.antwort, { zweck: 'bestaetigen', benutzerId: b.id });
      } catch (x) {
        await this.sperre.fehlschlag(email, ip, true, v);
        log.warn('Erneute Anmeldung fehlgeschlagen', { person: b.email, wofuer, ip, grund: 'Passkey' });
        const m = x instanceof Fachfehler ? x.message : t('anmeldung.passkey.fehler.falsch');
        throw new Fachfehler(401, m, { bestaetigen: true, passkey: true });
      }
      await this.sperre.erfolg(email, ip, v);
      return;
    }
    if (!b.hatPasswort)
      throw new Fachfehler(409, t('konten.verwaltung.fehler.anbieter'), { anbieter: true, passkey: await this.passkeyNutzbar(b) });
    const v = await this.sperre.versuch(email, ip);
    const treffer = await this.repo.holeHash(email);
    const ok = await pruefePasswort(typeof e.passwort === 'string' ? e.passwort : '', treffer?.hash);
    const mitCode = !!this.zweifaktor && (await this.zweifaktor.aktiv(b.id));
    const codeOk = !ok || !mitCode ? true : !!(await this.zweifaktor!.pruefe(b.id, e.code));
    if (!ok || !codeOk) {
      await this.sperre.fehlschlag(email, ip, true, v);
      log.warn('Erneute Anmeldung fehlgeschlagen', { person: b.email, wofuer, ip, grund: ok ? 'Code' : 'Passwort' });
      throw new Fachfehler(401, t(ok ? 'anmeldung.fehler.code' : 'konten.verwaltung.fehler.passwort'), {
        bestaetigen: true,
        code: mitCode,
        passkey: await this.passkeyNutzbar(b),
      });
    }
    await this.sperre.erfolg(email, ip, v);
  }

  /**
   * „Ablago verwalten“ (#819): Modus beginnen. Ohne Angaben nur, wenn die Anmeldung höchstens 10 Minuten zurückliegt
   * oder heute in diesem Browser schon bestätigt wurde (Wiedereinstieg mit einem Klick); sonst mit erneuter Anmeldung.
   */
  async beginneVerwaltung(b: Benutzer, schluessel: string | undefined, s: SitzungIntern | undefined, e: Bestaetigung, ip: string) {
    if (!darfVerwalten(b)) throw new Fachfehler(403, t('konten.verwaltung.fehler.recht'));
    if (!schluessel || !s) throw new Fachfehler(401, t('anmeldung.fehler.bitte-anmelden'));
    if (s.vertretungId) throw new Fachfehler(403, t('konten.verwaltung.fehler.vertretung'));
    const hash = hasheSchluessel(schluessel);
    const jetzt = new Date(this.uhr());
    const mitAngaben = e.passwort !== undefined || (e.passkey !== undefined && e.passkey !== null);
    let wie: 'bestaetigt' | 'frisch' | 'wieder';
    if (mitAngaben) {
      await this.bestaetigeErneut(b, e, ip, 'Verwaltungsmodus');
      wie = 'bestaetigt';
    } else if (this.istFrisch(s)) wie = 'frisch';
    else if (this.heuteBestaetigt(s)) wie = 'wieder';
    else {
      const mitCode = !!this.zweifaktor && (await this.zweifaktor.aktiv(b.id));
      throw new Fachfehler(401, t('konten.verwaltung.fehler.bestaetigen'), {
        bestaetigen: true,
        code: mitCode,
        anbieter: !b.hatPasswort,
        passkey: await this.passkeyNutzbar(b),
      });
    }
    await this.repo.setzeSitzungsVerwaltung(hash, {
      verwaltungSeit: jetzt,
      verwaltungAktiv: jetzt,
      // Die Anmeldung selbst oder die erneute zählt als Bestätigung für heute; der Wiedereinstieg verlängert nichts.
      ...(wie === 'wieder' ? {} : { verwaltungBestaetigt: jetzt }),
      ...(wie === 'bestaetigt' ? { frisch: jetzt } : {}),
    });
    log.warn(wie === 'wieder' ? 'Verwaltungsmodus wieder aufgenommen' : 'Verwaltungsmodus begonnen', {
      person: b.email,
      imVerwaltungsmodus: true,
      anmeldung:
        wie === 'bestaetigt' ? 'erneut angemeldet' : wie === 'frisch' ? 'Anmeldung vor höchstens 10 Minuten' : 'heute schon bestätigt',
      ip,
    });
    return this.verwaltungsstand(b, {
      ...s,
      verwaltungSeit: jetzt,
      verwaltungAktiv: jetzt,
      ...(wie === 'bestaetigt' ? { frisch: jetzt, verwaltungBestaetigt: jetzt } : {}),
    });
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
    return [...je.values()]
      .sort((a, b) => a.seit - b.seit || a.name.localeCompare(b.name, 'de'))
      .map((x) => ({ name: x.name, seit: new Date(x.seit).toISOString() }));
  }

  /** „Verwaltung beenden“ (#819). Der Tagesmerker bleibt – der Wiedereinstieg heute geht mit einem Klick. */
  async beendeVerwaltung(b: Benutzer, schluessel: string | undefined, s: SitzungIntern | undefined) {
    if (!schluessel || !s?.verwaltungSeit) return;
    await this.repo.setzeSitzungsVerwaltung(hasheSchluessel(schluessel), { verwaltungSeit: null, verwaltungAktiv: null });
    log.warn('Verwaltungsmodus beendet', { person: b.email, imVerwaltungsmodus: true });
  }

  /** Frische Anmeldung für eine heikle Handlung (#819): immer mit Passwort (und Code); gilt dann 10 Minuten. */
  async bestaetigeFrisch(b: Benutzer, schluessel: string | undefined, s: SitzungIntern | undefined, e: Bestaetigung, ip: string) {
    if (!schluessel || !s) throw new Fachfehler(401, t('anmeldung.fehler.bitte-anmelden'));
    if (s.vertretungId) throw new Fachfehler(403, t('konten.verwaltung.fehler.vertretung'));
    await this.bestaetigeErneut(b, e, ip, t('meldungen.konten.heikle-handlung'));
    const jetzt = new Date(this.uhr());
    await this.repo.setzeSitzungsVerwaltung(hasheSchluessel(schluessel), { frisch: jetzt, verwaltungBestaetigt: jetzt });
    log.info('Frisch angemeldet für eine heikle Handlung', { person: b.email, imVerwaltungsmodus: this.modusAktiv(b, s) });
  }

  /** Kann die Person hier mit einem Passkey bestätigen (#811)? */
  private async passkeyNutzbar(b: Benutzer): Promise<boolean> {
    return !!this.passkeys && (await this.passkeys.nutzbar(b.id));
  }

  /** Zwei-Faktor geändert (#819): Modus, Tagesmerker und frische Anmeldung in allen Sitzungen aufheben. */
  async zweifaktorGeaendert(benutzerId: string) {
    await this.repo.vergissVerwaltungVon(benutzerId);
  }

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
    const x = this.repo.holeAnmeldung
      ? await this.repo.holeAnmeldung(hash)
      : await (async () => {
          const s = await this.repo.holeSitzung(hash);
          const b = s && (await this.repo.holeBenutzer(s.benutzerId));
          return s && b ? { sitzung: s, benutzer: b } : undefined;
        })();
    const s = x?.sitzung;
    const b = x?.benutzer;
    if (!s || s.ablauf.getTime() < Date.now()) return undefined;
    // Systemkonten (#673) haben nie eine Sitzung – auch eine untergeschobene gilt nicht.
    if (!b || !b.aktiv || b.art === 'system') return undefined;
    // Abfragen im Hintergrund (#919, `still`) zählen nicht als Aktivität: „zuletzt aktiv“ bleibt, wie es war.
    if (!o.still && Date.now() - s.zuletztAktiv.getTime() > BERUEHREN_MS) await this.repo.beruehreSitzung(hash);
    return { benutzer: b, sitzung: s };
  }

  /**
   * Dienstkonto eines Pakets mit Code (#338) anlegen bzw. wieder einschalten; meldet sich nie an. `aktiv: false` für
   * Pakete ohne Code (#1038): Das Konto steht nur für die Herkunft und bleibt aus. Ein ausgeschaltetes Konto eines
   * installierten Pakets mit Code wird so beim Installieren und beim Abgleich (Start) wieder eingeschaltet (#1181).
   */
  async dienstkonto(paketId: string, name: string, aktiv = true): Promise<Benutzer> {
    const anzeige = `Paket ${name}`.slice(0, 120);
    const da = await this.repo.dienstkonto(paketId);
    if (!da) {
      const neu = await this.repo.legeDienstkontoAn({ id: randomUUID(), paketId, name: anzeige });
      return aktiv ? neu : this.repo.aendereBenutzer(neu.id, { aktiv: false });
    }
    if (aktiv && !da.aktiv) log.info('Dienstkonto eines installierten Pakets wieder eingeschaltet', { paket: paketId, konto: da.id });
    if (da.aktiv !== aktiv || da.name !== anzeige) return this.repo.aendereBenutzer(da.id, { aktiv, name: anzeige });
    return da;
  }

  /** Dienstkonto ausschalten (Paket entfernt): Historie behält den Namen, Schlüssel gelten nicht mehr. */
  async dienstkontoAus(paketId: string): Promise<void> {
    const da = await this.repo.dienstkonto(paketId);
    if (da?.aktiv) await this.repo.aendereBenutzer(da.id, { aktiv: false });
  }

  listeDienstkonten() {
    return this.repo.listeDienstkonten();
  }

  /**
   * Systemkonto des DMS (#673) anlegen, falls es fehlt (beim Start). Meldet sich nie an: kein Passwort, keine Sitzung,
   * kein API-Schlüssel; nicht deaktivierbar oder löschbar (die Benutzerverwaltung kennt es nicht).
   */
  async systemkonto(kennung: Systemkonto): Promise<Benutzer> {
    const da = await this.repo.systemkonto(kennung);
    if (da) return da.aktiv ? da : this.repo.aendereBenutzer(da.id, { aktiv: true });
    return this.repo.legeSystemkontoAn({ id: randomUUID(), kennung, name: SYSTEMKONTEN[kennung] });
  }
  listeSystemkonten() {
    return this.repo.listeSystemkonten();
  }

  /** Benutzer für Verwaltung, Vertretung, Abwesenheit, Links (#338): Dienstkonten von Paketen gibt es dort nicht. */
  protected async person(id: string): Promise<Benutzer | undefined> {
    const b = await this.repo.holeBenutzer(id);
    return istPerson(b) ? b : undefined;
  }

  /** Mensch zur E-Mail-Adresse (#670: Ereignis „Benutzerkonto gesperrt“ nennt die Id, nicht die Adresse). */
  async personMitEmail(email: string): Promise<Benutzer | undefined> {
    return (await this.repo.holeHash(email))?.benutzer;
  }

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
}
