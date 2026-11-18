/**
 * Benutzerverwaltung und Abwesenheit mit Vertreter (#78) – #1278, Teil von `Konten`.
 */
import { randomUUID } from 'node:crypto';
import { KontenNotfall } from './notfall';
import { heuteIn } from '../../../shared/src/sichten';
import { abwesenheitWirkt, type Benutzer, type Abwesenheit, KEINE_ABWESENHEIT } from '../../../shared/src/model';
import { Fachfehler } from '../grundlagen/fehler';
import { t, mitSpracheVon } from '../sprache/sprache';
import { text, type Ergebnis, pruefeEmail, log, schutzGesamt, zaehltAlsGesamt } from './hilfen';
import { liesVerwaltung, verwaltungText, hatGesamt, gleicheVerwaltung, GESAMT } from '../../../shared/src/verwaltungsrecht';
import { inSprache } from '../../../shared/src/sprache';
import { nachweis } from '../protokoll/nachweisjournal';
import { mailtexte } from '../mail/mail';

/** Benutzerverwaltung, Export der eigenen Daten und Abwesenheit. */
export abstract class KontenBenutzer extends KontenNotfall {
  /* ---------- Benutzerverwaltung (nur Admin) ---------- */

  listeBenutzer() {
    return this.repo.listeBenutzer();
  }

  /** Vollexport (#254): Benutzer ohne Passwörter, mit ihren Einstellungen; Vertretungen. */
  async exportDaten() {
    const benutzer = await Promise.all(
      (await this.repo.listeBenutzer()).map(async (b) => ({
        id: b.id,
        email: b.email,
        name: b.name,
        verwaltung: b.verwaltung ?? [],
        aktiv: b.aktiv,
        erstellt: b.erstellt,
        letzteAnmeldung: b.letzteAnmeldung,
        abwesenheit: b.abwesenheit ?? null,
        einstellungen: await this.repo.einstellungen(b.id),
        // Passkeys (#811): nur Name und Zeitpunkte – Schlüssel gehören zur Installation, nicht in einen Export.
        passkeys: this.passkeys
          ? (await this.passkeys.liste(b.id)).map((p) => ({ name: p.name, erstellt: p.erstellt, zuletzt: p.zuletzt }))
          : [],
      })),
    );
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
    const name = (id: string | null) => {
      const b = alle.find((x) => x.id === id);
      return b ? b.name || b.email : '';
    };
    const heute = heuteIn();
    return alle
      .map((b) => {
        const a = b.abwesenheit;
        const abwesend =
          a?.an && (!a.bis || a.bis >= heute)
            ? { wirkt: abwesenheitWirkt(a, heute), von: a.von, bis: a.bis, vertreter: name(a.vertreterId) }
            : undefined;
        return {
          id: b.id,
          name: b.name || b.email,
          aktiv: b.aktiv,
          ...(!b.aktiv && b.deaktiviert ? { deaktiviert: b.deaktiviert } : {}),
          ...(abwesend ? { abwesend } : {}),
        };
      })
      .concat(
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text2) || Number.isNaN(Date.parse(text2)))
        throw new Fachfehler(422, t('meldungen.konten.bitte-ein-gueltiges-datum', { was }));
      return text2;
    };
    const a: Abwesenheit = {
      an: e.an === true || e.an === 'true',
      von: datum(e.von, 'von'),
      bis: datum(e.bis, 'bis'),
      vertreterId: text(e.vertreterId) || null,
    };
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
        await this.spiegle(neu, null, {
          vorher: a,
          wegen: t('meldungen.konten.zeitraum-bis-abgelaufen', { reverse: a.bis.split('-').reverse().join('.') }),
        });
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
    const benutzer = await this.repo.legeBenutzerAn({
      id: randomUUID(),
      email,
      name: text(e.name),
      verwaltung: liesVerwaltung(e.verwaltung),
      passwortHash: null,
    });
    await this.spiegle(benutzer, von);
    if (benutzer.verwaltung?.length)
      log.warn('Verwaltungsrecht vergeben', {
        person: benutzer.email,
        vorher: '–',
        nachher: verwaltungText(benutzer.verwaltung),
        von: von ?? 'Konsole',
      });
    return this.verschickeLink(benutzer, 'einladung');
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
    const daten = inSprache('de', () => ({
      person: b.email,
      vorher: verwaltungText(vorher),
      nachher: verwaltungText(neu),
      von: ich.email,
      imVerwaltungsmodus: ich.rolle === 'admin',
    }));
    log.warn(!neu.length ? 'Verwaltungsrecht entzogen' : !vorher.length ? 'Verwaltungsrecht vergeben' : 'Verwaltungsrecht geändert', daten);
    void nachweis('zugang.rechte', { was: 'verwaltung', konto: b.email, vorher, nachher: neu, von: ich.email });
    for (const x of await this.repo.listeBenutzer()) {
      if (!zaehltAlsGesamt(x) || x.email.endsWith('.invalid')) continue;
      const m = mitSpracheVon(x, () =>
        mailtexte.verwaltungsrecht(b.name || b.email, verwaltungText(vorher), verwaltungText(neu), ich.name || ich.email),
      );
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
    if (zaehltAlsGesamt(b) && !(await this.repo.listeBenutzer()).some((x) => x.id !== id && zaehltAlsGesamt(x)))
      throw new Fachfehler(409, t('konten.verwaltung.fehler.letzte'));
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
    await this.nachLoeschen(id);
  }

  /** Was nach dem Löschen einer Person mit weg muss (Nachtrag zu #1331: Reste ihrer gelöschten Fehlermeldungen). */
  private beimLoeschen: ((id: string) => Promise<void>)[] = [];
  verbindeLoeschen(f: (id: string) => Promise<void>) {
    this.beimLoeschen.push(f);
  }
  /** Das Konto ist schon weg: Scheitert das Aufräumen, steht es nur im Protokoll (in Postgres holt es das nächste Löschen nach). */
  private async nachLoeschen(id: string) {
    for (const f of this.beimLoeschen)
      await f(id).catch((x: Error) => log.warn('Aufräumen nach dem Löschen einer Person gescheitert', { fehler: x.message }));
  }

  /** Für den Papierkorb (#43): Konto einer Benutzer-Mappe löschen bzw. wieder aktivieren. */
  papierkorbHaken() {
    return {
      endgueltig: async (id: string) => {
        const b = await this.person(id);
        // Nur Einladungen, die nie angenommen wurden (wie beim Löschen); sonst bleibt das Konto deaktiviert.
        if (b && !b.aktiv && !b.hatPasswort && !b.letzteAnmeldung) {
          await this.repo.loescheBenutzer(id);
          await this.nachLoeschen(id);
        }
      },
      benutzer: () => this.repo.listeBenutzer(),
      // Eine Person ohne die Liste aller (#1256): Vertretung und Alltags-Empfänger je Anfrage.
      person: (id: string) => this.person(id),
      // Testlauf der Rechte (#710): auch Systemkonten und Dienstkonten der Pakete.
      ohneMensch: async () => [...(await this.repo.listeSystemkonten()), ...(await this.repo.listeDienstkonten())],
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
}
