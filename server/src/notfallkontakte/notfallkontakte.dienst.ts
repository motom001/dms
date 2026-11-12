/**
 * Notfallkontakte (#812): anlegen, ändern, löschen, Info-Mail verschicken (auch später, sobald der E-Mail-Versand
 * eingerichtet ist) und „Erneut senden“. Schicht 3 – bekommt den Kern (Repo, Einstellungen) und über den Anschluss
 * den Kurzzustand; Mailer, Name der Ablage und die eintragende Person verbindet der Start (`verbinde`).
 *
 * Regeln aus der Durchsicht Sicherheit (12.11.2026), siehe README.md in diesem Ordner.
 */
import { randomUUID } from 'node:crypto';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import type { Kurzzustand } from '../kurzzustand';
import type { Mailer } from '../mail';
import { protokoll } from '../protokoll';
import { mitSpracheVon, t } from '../sprache';
import { istEmail } from '../../../shared/src/model';
import {
  blattFingerabdruck, gekuerzteAdresse, linkartig, mailName, NOTFALLKONTAKT_MAILS_JE_TAG, NOTFALLKONTAKTE_MAX, pruefeNotfallkontakt,
  type Notfallkontakt, type NotfallkontakteStand, type NotfallMailStand,
} from '../../../shared/src/notfallkontakte';
import { heuteIn } from '../../../shared/src/sichten';

const log = protokoll.modul('werkbank');
const mailLog = protokoll.modul('mail');

/** Kurzzustand: Info-Mails je Ablage und Tag (über alle Prozesse), „Erneut senden“ je Kontakt und Tag, Versand belegt. */
const MAILS = 'notfallkontakt-mails';
const ERNEUT = 'notfallkontakt-erneut';
const SENDET = 'notfallkontakt-sendet';
/** Ein Tag mit Spielraum für die Zeitumstellung; der Schlüssel ist ohnehin das Datum. */
const TAG_MS = 26 * 3600_000;
/** Solange belegt ein Versand den Kontakt (ein anderer Prozess schickt dann nicht dieselbe Mail). */
const SENDET_MS = 5 * 60_000;
/** Einstellung: Fingerabdruck der Kontakte auf dem zuletzt heruntergeladenen Notfallblatt. */
const BLATT = 'notfallkontakte_blatt';

/** Wer handelt: die angemeldete Person (Werkbank, Einrichtungsassistent). */
export interface Handelnder { id: string; name: string; email: string; sprache?: string | null }

/** Was der Start verbindet: Mailer, Name der Ablage, die eintragende Person (Name, Adresse, Sprache). */
export interface NotfallkontakteVersand {
  mailer(): Mailer | null;
  ablageName(): Promise<string>;
  person(id: string): Promise<{ name: string; email: string; sprache?: string | null; aktiv?: boolean } | null | undefined>;
}

export interface NotfallkontakteAnschluss { kurzzustand(): Kurzzustand }

/** Ergebnis einer Änderung: der Kontakt und was mit der Mail geschah. */
export interface NotfallkontaktErgebnis {
  kontakt: Notfallkontakt | null;
  /** verschickt · offen (kein Versand eingerichtet) · fehler · keine (nichts zu verschicken) · grenze (nur beim Löschen). */
  mail: NotfallMailStand | 'keine' | 'grenze';
}

type Art = 'info' | 'geloescht';

export class NotfallkontakteDienst {
  private versand: NotfallkontakteVersand | null = null;
  /** Ohne Einstellungen (Tests ohne Datenbank): im Speicher. */
  private blattSpeicher: string | null = null;

  constructor(private readonly kern: Kern, private readonly anschluss: NotfallkontakteAnschluss) {}

  /** Mailer, Name der Ablage und Personen verbinden (Start, Tests). */
  verbinde(v: NotfallkontakteVersand) { this.versand = v; }

  private get repo() { return this.kern.repo; }
  private get zustand() { return this.anschluss.kurzzustand(); }
  private mailer(): Mailer | null { return this.versand?.mailer() ?? null; }

  /* ---------- Lesen ---------- */

  async liste(): Promise<Notfallkontakt[]> { return this.repo.notfallkontakte(); }

  /** Für die Werkbank: Kontakte, ob „Erneut senden“ heute noch geht, Versand eingerichtet, Notfallblatt veraltet. */
  async stand(blattAm: string | null): Promise<NotfallkontakteStand> {
    const kontakte = await this.liste();
    const tag = heuteIn();
    const erneut = new Set((await this.zustand.liste(ERNEUT, '', 1000)).map((e) => e.schluessel));
    return {
      kontakte: kontakte.map((k) => ({ ...k, erneutMoeglich: !erneut.has(`${k.id}:${tag}`) })),
      max: NOTFALLKONTAKTE_MAX,
      versand: !!this.mailer(),
      blattVeraltet: await this.blattVeraltet(blattAm, kontakte),
    };
  }

  /** Für das Notfallblatt: Name, Telefon, E-Mail und Notiz. */
  async fuerBlatt() { return (await this.liste()).map((k) => ({ name: k.name, telefon: k.telefon, email: k.email, notiz: k.notiz })); }

  /** Das Notfallblatt wurde mit diesen Kontakten heruntergeladen. */
  async blattErstellt(kontakte?: Notfallkontakt[]) {
    const abdruck = blattFingerabdruck(kontakte ?? await this.liste());
    if (this.kern.einstellungen) await this.kern.einstellungen.schreibe(BLATT, abdruck);
    else this.blattSpeicher = abdruck;
  }

  /** Haben sich die Kontakte seit dem letzten Notfallblatt geändert? Ohne Blatt (`blattAm` null) nicht – dann fehlt es ohnehin. */
  async blattVeraltet(blattAm: string | null, kontakte?: Notfallkontakt[]): Promise<boolean> {
    if (!blattAm) return false;
    const gespeichert = this.kern.einstellungen ? await this.kern.einstellungen.lies(BLATT) : this.blattSpeicher;
    // Ein Blatt aus der Zeit vor #812 hat keinen Abdruck: Es trug keine Kontakte.
    return (typeof gespeichert === 'string' ? gespeichert : '') !== blattFingerabdruck(kontakte ?? await this.liste());
  }

  /* ---------- Ändern ---------- */

  async anlegen(e: unknown, ich: Handelnder): Promise<NotfallkontaktErgebnis> {
    const w = await this.pruefe(e, ich);
    if ((await this.liste()).length >= NOTFALLKONTAKTE_MAX) throw new Fachfehler(409, t('meldungen.notfallkontakte.max', { max: NOTFALLKONTAKTE_MAX }));
    const mailer = this.mailer();
    // Vorab gezählt (#956): Auch gleichzeitige Anfragen kommen nicht über die Grenze der Mails.
    if (mailer) await this.zaehleMail(true);
    const k: Notfallkontakt = {
      id: randomUUID(), ...w, eingetragenVon: ich.id, eingetragenVonName: mailName(ich.name),
      mailStand: 'offen', mailAm: null, mailFehler: null, erstellt: new Date().toISOString(), geaendert: new Date().toISOString(),
    };
    if (!(await this.repo.legeNotfallkontaktAn(k, NOTFALLKONTAKTE_MAX))) throw new Fachfehler(409, t('meldungen.notfallkontakte.max', { max: NOTFALLKONTAKTE_MAX }));
    log.info('Notfallkontakt angelegt', { kontakt: k.name, adresse: gekuerzteAdresse(k.email), von: ich.email });
    const mail = mailer ? await this.sende(k, 'info', mailer) : 'offen';
    return { kontakt: await this.repo.holeNotfallkontakt(k.id), mail };
  }

  async aendern(id: string, e: unknown, ich: Handelnder): Promise<NotfallkontaktErgebnis> {
    const alt = await this.hole(id);
    const w = await this.pruefe(e, ich);
    // Reply-To auf die Adresse der eintragenden Person: Den Haken setzt nur sie selbst – sonst stünde ihre Adresse
    // ungefragt in einer Mail an Dritte.
    if (w.antwortAn && !alt.antwortAn && alt.eingetragenVon !== ich.id) throw new Fachfehler(403, t('meldungen.notfallkontakte.antwort-nur-selbst'));
    const neueAdresse = w.email !== alt.email;
    const mailer = neueAdresse ? this.mailer() : null;
    if (mailer) await this.zaehleMail(true);
    // Neue Adresse: Die Info-Mail geht an sie (bzw. wartet auf den Versand). Nur der Name geändert: keine Mail.
    const mailStand = neueAdresse ? { mailStand: 'offen' as const, mailAm: null, mailFehler: null } : { mailStand: alt.mailStand, mailAm: alt.mailAm, mailFehler: alt.mailFehler };
    if (!(await this.repo.aendereNotfallkontakt(id, { ...w, ...mailStand }))) throw new Fachfehler(404, t('meldungen.notfallkontakte.unbekannt'));
    // Genau das, was diese Anfrage geschrieben hat – auch wenn gleich danach jemand anderes ändert.
    const k: Notfallkontakt = { ...alt, ...w, ...mailStand };
    log.info('Notfallkontakt geändert', { kontakt: k.name, adresse: gekuerzteAdresse(k.email), ...(neueAdresse ? { vorher: gekuerzteAdresse(alt.email) } : {}), von: ich.email });
    const mail = !neueAdresse ? 'keine' : mailer ? await this.sende(k, 'info', mailer) : 'offen';
    return { kontakt: await this.repo.holeNotfallkontakt(id), mail };
  }

  /**
   * Löschen geht immer – auch über der Grenze der Mails (Widerspruch, Datenschutz). Die kurze Mitteilung geht nur an
   * einen Kontakt, der die Info-Mail bekommen hat, nur mit eingerichtetem Versand und nur innerhalb der Grenze.
   */
  async loeschen(id: string, ich: Handelnder): Promise<NotfallkontaktErgebnis> {
    await this.hole(id);
    const k = await this.repo.loescheNotfallkontakt(id);
    if (!k) throw new Fachfehler(404, t('meldungen.notfallkontakte.unbekannt'));
    log.info('Notfallkontakt gelöscht', { kontakt: k.name, adresse: gekuerzteAdresse(k.email), von: ich.email });
    const mailer = this.mailer();
    if (k.mailStand !== 'verschickt' || !mailer) return { kontakt: null, mail: 'keine' };
    if (!(await this.zaehleMail(false))) {
      mailLog.warn('Mitteilung an Notfallkontakt nicht verschickt: Grenze der Mails je Tag erreicht', { kontakt: k.name, adresse: gekuerzteAdresse(k.email) });
      return { kontakt: null, mail: 'grenze' };
    }
    return { kontakt: null, mail: await this.sende(k, 'geloescht', mailer) };
  }

  /** „Erneut senden“: höchstens einmal je Kontakt und Tag, nur mit eingerichtetem Versand. */
  async erneutSenden(id: string, ich: Handelnder): Promise<NotfallkontaktErgebnis> {
    const k = await this.hole(id);
    const mailer = this.mailer();
    if (!mailer) throw new Fachfehler(409, t('meldungen.notfallkontakte.ohne-versand'));
    if (!(await this.zustand.belege(ERNEUT, `${k.id}:${heuteIn()}`, TAG_MS))) throw new Fachfehler(429, t('meldungen.notfallkontakte.erneut-heute'));
    await this.zaehleMail(true);
    log.info('Info-Mail an Notfallkontakt erneut angestoßen', { kontakt: k.name, adresse: gekuerzteAdresse(k.email), von: ich.email });
    return { kontakt: await this.repo.holeNotfallkontakt(id), mail: await this.sende(k, 'info', mailer) };
  }

  /**
   * Wartende Info-Mails verschicken (Zeitplan, nur ein Prozess): Kontakte, die angelegt wurden, als es noch keinen
   * Versand gab („wird verschickt, sobald E-Mail eingerichtet ist“). Innerhalb der Grenze je Tag; der Rest wartet.
   */
  async zustellen(): Promise<number> {
    const mailer = this.mailer();
    if (!mailer) return 0;
    let n = 0;
    for (const k of (await this.liste()).filter((x) => x.mailStand === 'offen')) {
      if (!(await this.zaehleMail(false))) break;
      if ((await this.sende(k, 'info', mailer)) === 'verschickt') n++;
    }
    return n;
  }

  /* ---------- intern ---------- */

  private async hole(id: string): Promise<Notfallkontakt> {
    const k = await this.repo.holeNotfallkontakt(id);
    if (!k) throw new Fachfehler(404, t('meldungen.notfallkontakte.unbekannt'));
    return k;
  }

  /** Eingabe prüfen; dazu die Namen, die in die Mail kommen: eigener Name und Name der Ablage. */
  private async pruefe(e: unknown, ich: Handelnder) {
    const { wert, fehler } = pruefeNotfallkontakt(e);
    if (fehler.length) throw new Fachfehler(422, fehler.map((f) => t.frei(`meldungen.notfallkontakte.${f}`)).join(' '), { gruende: fehler.map((f) => t.frei(`meldungen.notfallkontakte.${f}`)) });
    if (!mailName(ich.name) || linkartig(ich.name)) throw new Fachfehler(422, t('meldungen.notfallkontakte.eigener-name'));
    const ablage = await this.ablageName();
    if (linkartig(ablage)) throw new Fachfehler(422, t('meldungen.notfallkontakte.ablage-name'));
    return wert;
  }

  private async ablageName() { return mailName((await this.versand?.ablageName()) ?? ''); }

  /**
   * Eine Mail mehr für heute (atomar, über alle Prozesse). `werfen`: über der Grenze 429; sonst false.
   */
  private async zaehleMail(werfen: boolean): Promise<boolean> {
    const { anzahl } = await this.zustand.zaehle(MAILS, heuteIn(), TAG_MS);
    if (anzahl <= NOTFALLKONTAKT_MAILS_JE_TAG) return true;
    if (werfen) throw new Fachfehler(429, t('meldungen.notfallkontakte.grenze', { max: NOTFALLKONTAKT_MAILS_JE_TAG }));
    return false;
  }

  /**
   * Die Mail selbst: nur Text, kein Link, kein Anhang, keine Adresse von Ablago. Platzhalter nur: eintragende Person,
   * Ablage, Kontakt – die Notiz nie. Reply-To nur mit dem Haken. Danach der Stand am Kontakt (außer beim Löschen).
   */
  private async sende(k: Notfallkontakt, art: Art, mailer: Mailer): Promise<NotfallMailStand> {
    // Belegt: Ein anderer Prozess (Zeitplan) verschickt gerade dieselbe Mail.
    if (!(await this.zustand.belege(SENDET, `${k.id}:${art}:${k.email}`, SENDET_MS))) return k.mailStand;
    try {
      const { person, namen } = await this.namen(k);
      if (!namen) return await this.vermerke(k, art, 'fehler', t('meldungen.notfallkontakte.mail-name'));
      const wer = namen.wer;
      const antwortAn = k.antwortAn && person?.email && istEmail(person.email) && !person.email.endsWith('.invalid') ? person.email : undefined;
      const [betreff, text] = mitSpracheVon(person, () => notfallMail(art, namen));
      try {
        await mailer.sende(k.email, betreff, text, { ...(antwortAn ? { antwortAn } : {}), anImProtokoll: gekuerzteAdresse(k.email) });
      } catch (x) {
        // Die Meldung des Mailservers nennt oft die Adresse – im Protokoll nur gekürzt.
        const grund = String((x as Error).message ?? x).split(k.email).join(gekuerzteAdresse(k.email));
        mailLog.warn(art === 'info' ? 'Info-Mail an Notfallkontakt nicht verschickt' : 'Mitteilung an Notfallkontakt nicht verschickt', { kontakt: k.name, adresse: gekuerzteAdresse(k.email), fehler: grund });
        return await this.vermerke(k, art, 'fehler', grund);
      }
      mailLog.info(art === 'info' ? 'Info-Mail an Notfallkontakt verschickt' : 'Mitteilung an Notfallkontakt verschickt (ausgetragen)', { kontakt: k.name, adresse: gekuerzteAdresse(k.email), eingetragenVon: wer, antwortAn: !!antwortAn });
      return await this.vermerke(k, art, 'verschickt', null);
    } finally {
      await this.zustand.loesche(SENDET, `${k.id}:${art}:${k.email}`);
    }
  }

  /** Die drei Namen der Mail, bereinigt – null, wenn einer fehlt oder wie ein Link aussieht. */
  private async namen(k: Notfallkontakt) {
    const person = k.eingetragenVon ? await this.versand?.person(k.eingetragenVon) : null;
    const wer = mailName(person?.name || k.eingetragenVonName);
    const ablage = await this.ablageName();
    const kontakt = mailName(k.name);
    const ok = !!wer && !!kontakt && ![wer, ablage, kontakt].some(linkartig);
    return { person, namen: ok ? { wer, ablage, kontakt } : null };
  }

  private async vermerke(k: Notfallkontakt, art: Art, stand: NotfallMailStand, fehler: string | null): Promise<NotfallMailStand> {
    if (art === 'info') await this.repo.setzeNotfallkontaktMail(k.id, { mailStand: stand, mailAm: stand === 'verschickt' ? new Date().toISOString() : k.mailAm, mailFehler: fehler });
    return stand;
  }
}

/**
 * Betreff und Text (Sprachdatei `mail.notfallkontakt.*`). Die Namen sind schon bereinigt (eine Zeile, höchstens 60
 * Zeichen, nichts Link-Artiges).
 */
export function notfallMail(art: Art, n: { wer: string; ablage: string; kontakt: string }): [string, string] {
  const ablage = n.ablage || t('mail.notfallkontakt.ablage-ohne-name');
  if (art === 'geloescht') {
    return [t('mail.notfallkontakt.geloescht.betreff', { wer: n.wer }), `${[
      t('mail.hallo', { name: n.kontakt }), t('mail.notfallkontakt.geloescht.text', { wer: n.wer, ablage }), t('mail.notfallkontakt.fremd', { wer: n.wer }),
    ].join('\n\n')}\n`];
  }
  return [t('mail.notfallkontakt.info.betreff', { wer: n.wer }), `${[
    t('mail.hallo', { name: n.kontakt }),
    t('mail.notfallkontakt.info.text', { wer: n.wer, ablage }),
    t('mail.notfallkontakt.info.zugang', { wer: n.wer }),
    t('mail.notfallkontakt.info.widerspruch', { wer: n.wer }),
    t('mail.notfallkontakt.fremd', { wer: n.wer }),
  ].join('\n\n')}\n`];
}
