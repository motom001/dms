/**
 * Auskunft zustellen (#455, #666, #1078 aus dienst.ts): per E-Mail oder Abruf-Link mit Abrufcode – anlegen, zurückziehen,
 * am Abruf prüfen (Fehlversuche, eine Prüfung je Link), Abrufe zählen und melden; dazu „Meine Daten exportieren“ (#255,
 * #884) und die Abschätzung vor dem Vollexport. Schicht 3 – Teile und Anschluss wie `DatenschutzDienst`
 * (datenschutz.dienst.ts).
 */
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { neuerAbrufcode, SCHLUESSEL_MUSTER } from '../abruf';
import { AusgangEmail } from '../ausgang';
import { Fachfehler } from '../fehler';
import { EMAIL_MAX_ANHAENGE, KB, MB } from '../grenzen';
import type { Kern } from '../kern';
import type { Mailer } from '../mail';
import type { MappenHistorie } from '../mappen';
import { hashePasswort, hasheSchluessel, neuerSchluessel, pruefePasswort } from '../passwort';
import { protokoll } from '../protokoll';
import { type AuskunftLinkIntern, istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import { datumText } from '../../../shared/src/archiv';
import { type AuskunftLink, auskunftMail, type AuskunftStand, liesLinkEingabe, LINK_FEHLVERSUCHE_MAX, LINK_STATUS, linkStatus, normiereCode } from '../../../shared/src/auskunft';
import { type Aufgabe, AUFGABE_MAX, istEmail } from '../../../shared/src/model';
import type { DatenschutzAnschluss, DatenschutzTeile } from './datenschutz.dienst';

const ABRUF_PRUEFUNG = 'abruf-pruefung';
/** Belegung einer Code-Prüfung am Abruf-Link: endet spätestens nach dieser Zeit (scrypt dauert Bruchteile davon). */
const ABRUF_PRUEFUNG_MS = 60_000;

export class AuskunftZustellen {
  constructor(private readonly kern: Kern, private readonly teile: DatenschutzTeile, private readonly anschluss: DatenschutzAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }
  private get konten() { return this.anschluss.konten(); }
  private get kurzzustand() { return this.anschluss.kurzzustand(); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private neueAufgabe(a: Aufgabe, typ?: string) { return this.teile.ereignisse.neueAufgabe(a, typ); }
  private leiteUm(a: Aufgabe) { return this.teile.vertretung.leiteUm(a); }
  private persoenlichAn(benutzerId: string, schluessel: string) { return this.teile.mappen.persoenlichAn(benutzerId, schluessel); }
  private datenschutz() { return this.teile.datenschutz.datenschutz(); }

  /** Abruf-Links für die Werkbank – ohne die Hashes von Schlüssel und Code. */
  async auskunftLinks(f?: { mappeId?: string; auskunftId?: string; max?: number }): Promise<AuskunftLink[]> {
    return (await this.repo.auskunftLinks(f)).map(({ schluessel: _s, code: _c, ...l }) => l);
  }

  /** Gilt für diese Auskunft gerade ein Abruf-Link? Dann bleibt die ZIP nach dem eigenen Herunterladen liegen. */
  async auskunftLinkAktiv(auskunftId: string): Promise<boolean> {
    return (await this.repo.auskunftLinks({ auskunftId })).some((l) => linkStatus(l) === 'aktiv');
  }

  /**
   * Weg 1 (#455): die ZIP als Anhang über den E-Mail-Versand des DMS – nur verschlüsselt; das Passwort
   * kennt das DMS nicht und schickt es darum auch nie mit. Zu groß für E-Mail → Abruf-Link.
   */
  async auskunftPerEmail(stand: AuskunftStand & { name: string }, datei: () => Promise<Readable>, eingabe: unknown, ich: { id: string; name: string; email: string }, mailer: Mailer | null) {
    if (!mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand-2'));
    if (!stand.verschluesselt) throw new Fachfehler(422, t('meldungen.dienst.per-e-mail-geht'));
    if (stand.bytes > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, t('meldungen.dienst.die-auskunft-ist-mit', { round: Math.round(stand.bytes / 1e6), round2: Math.round(EMAIL_MAX_ANHAENGE / 1e6) }));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const vorlage = auskunftMail.zip((await this.datenschutz()).anrede);
    const { an, betreff, nachricht } = AusgangEmail.emailKopf({ betreff: vorlage.betreff, nachricht: vorlage.nachricht, ...e });
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge: [{ name: `${stand.name}.zip`, mime: 'application/zip', inhalt: await datei() }] });
    } catch (x) {
      throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-wurde', { message: (x as Error).message }));
    }
    await this.notiere(stand.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.auskunft-per-e-mail', { an: an.join(', '), max: Math.max(1, Math.round(stand.bytes / KB)) }), zustellung: 'email', an, betreff, auskunft: stand.id, bytes: stand.bytes });
    protokoll.modul('datenschutz').info('Auskunft per E-Mail gesendet', { mappeId: stand.mappeId, empfaenger: an.length, mb: Math.round(stand.bytes / MB), von: ich.email });
    return { an };
  }

  /**
   * Weg 2 (#455): Abruf-Link für genau diese Auskunft. Schlüssel (256 Bit) und Abrufcode liefert nur diese
   * Antwort im Klartext; gespeichert sind ihre Hashes. Ein noch gültiger Link derselben Auskunft wird
   * zurückgezogen. Mit `senden` geht der Link (ohne Code) per E-Mail an die Person.
   */
  async auskunftLinkAnlegen(stand: AuskunftStand, eingabe: unknown, ich: { id: string; name: string; email: string }, x: { adresse: string; mailer: Mailer | null }) {
    const e = liesLinkEingabe(eingabe);
    if (e.fehler.length) throw new Fachfehler(422, e.fehler.join(' '));
    if (e.senden && !x.mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand-3'));
    if (e.senden && !istEmail(e.an)) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-gueltige-e'));
    if (!x.adresse) throw new Fachfehler(409, t('meldungen.dienst.die-adresse-von-ablago'));
    for (const alt of await this.repo.auskunftLinks({ auskunftId: stand.id })) {
      if (linkStatus(alt) === 'aktiv' && (await this.repo.widerrufeAuskunftLink(alt.id))) await this.notiere(alt.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.abruf-link-zurueckgezogen-ersetzt'), zustellung: 'link', link: alt.id, auskunft: stand.id });
    }
    const schluessel = neuerSchluessel();
    const code = e.code ?? neuerAbrufcode();
    const jetzt = new Date();
    const link: AuskunftLinkIntern = {
      id: randomUUID(), auskunftId: stand.id, mappeId: stand.mappeId, titel: stand.titel, schluessel: hasheSchluessel(schluessel), code: await hashePasswort(code),
      codeArt: e.code ? 'eigen' : 'erzeugt', empfaenger: e.an || null, erstellt: jetzt.toISOString(), erstelltVon: ich.id,
      ablauf: new Date(jetzt.getTime() + e.tage * 24 * 3600 * 1000).toISOString(), maxAbrufe: e.abrufe, abrufe: 0, fehlversuche: 0, gesperrt: null, widerrufen: null, abgerufen: null,
    };
    await this.repo.legeAuskunftLinkAn(link);
    const url = `${x.adresse.replace(/\/+$/, '')}/abruf#${schluessel}`;
    const bis = datumText(link.ablauf.slice(0, 10));
    if (e.senden) {
      const ds = await this.datenschutz();
      const m = auskunftMail.link(ds.anrede, url, bis, link.maxAbrufe, ds.verantwortlicher);
      const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
      try { await x.mailer!.sende(e.an, m.betreff, m.nachricht, { antwortAn }); } catch (f) {
        await this.repo.widerrufeAuskunftLink(link.id);
        throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-mit', { message: (f as Error).message }));
      }
    }
    await this.notiere(stand.mappeId, ich.id, 'auskunft', {
      text: t('meldungen.dienst.abruf-link-erstellt-gueltig', { anzahl: link.maxAbrufe, bis, wert: e.senden ? t('meldungen.dienst.per-e-mail-an', { an: e.an }) : '', wert2: link.codeArt === 'eigen' ? t('meldungen.dienst.eigener-abrufcode') : '' }),
      zustellung: 'link', link: link.id, auskunft: stand.id, ablauf: link.ablauf, maxAbrufe: link.maxAbrufe, ...(e.senden ? { an: [e.an] } : {}),
    });
    protokoll.modul('datenschutz').info('Abruf-Link erstellt', { mappeId: stand.mappeId, link: link.id, tage: e.tage, abrufe: e.abrufe, code: link.codeArt, mail: e.senden, von: ich.email });
    const { schluessel: _s, code: _c, ...ohne } = link;
    // Eigener Code: so zurück, wie er eingegeben wurde (#666) – der Abruf vergleicht ohnehin normiert.
    return { link: ohne as AuskunftLink, url, code: e.codeWieEingegeben ?? code, gesendet: e.senden };
  }

  /** Zurückziehen (#455): Der Link gilt sofort nicht mehr; die Zeile bleibt als Nachweis. */
  async auskunftLinkWiderrufen(id: string, ich: { id: string; email: string }): Promise<AuskunftLink> {
    const [l] = await this.repo.auskunftLinks({ id, max: 1 });
    if (!l) throw new Fachfehler(404, t('meldungen.dienst.diesen-abruf-link-gibt'));
    if (await this.repo.widerrufeAuskunftLink(id)) {
      await this.notiere(l.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.abruf-link-zurueckgezogen'), zustellung: 'link', link: id, auskunft: l.auskunftId });
      protokoll.modul('datenschutz').info('Abruf-Link zurückgezogen', { mappeId: l.mappeId, link: id, von: ich.email });
    }
    return (await this.auskunftLinks({ auskunftId: l.auskunftId })).find((x) => x.id === id)!;
  }

  /**
   * Öffentliche Abrufseite (#455): Schlüssel und Abrufcode prüfen. Unbekannter Schlüssel, falscher Code und
   * gesperrter Link sehen nach außen gleich aus („falsch“) und kosten gleich viel Zeit (scrypt auch ohne
   * Treffer). Ein gesperrter Link prüft den Code gar nicht mehr. Erst mit richtigem Code sagt die Antwort,
   * dass der Link abgelaufen, verbraucht oder zurückgezogen ist. Jeder Versuch an einem bekannten Link
   * steht in der Historie (ohne IP, ohne Code).
   */
  async auskunftAbrufPruefen(schluessel: unknown, code: unknown, platz: () => (() => void) | null = () => () => {}): Promise<{ art: 'ok' | 'falsch' | 'ungueltig' | 'beschaeftigt'; link?: AuskunftLinkIntern }> {
    const s = typeof schluessel === 'string' && SCHLUESSEL_MUSTER.test(schluessel) ? schluessel : null;
    const c = normiereCode(code);
    const link = s ? await this.repo.auskunftLinkPerSchluessel(hasheSchluessel(s)) : undefined;
    // Ohne gültigen Link kein scrypt: Den 256-Bit-Schlüssel kann niemand erraten, ein gleicher Zeitaufwand
    // schützt hier nichts – er würde nur die Abrufseite zum Hebel für Last machen.
    if (!link || link.gesperrt || link.fehlversuche >= LINK_FEHLVERSUCHE_MAX) return { art: 'falsch' };
    // Je Link nur eine Prüfung gleichzeitig: Parallele Versuche könnten sonst alle vor dem Hochzählen
    // lesen und so mehr als LINK_FEHLVERSUCHE_MAX Codes ausprobieren.
    // Und insgesamt nur wenige scrypt-Prüfungen gleichzeitig (Platz vergibt die Bremse der Route).
    const frei = platz();
    if (!frei) return { art: 'beschaeftigt' };
    // Belegt in der Datenbank (#744), damit auch ein zweiter Prozess wartet; die Frist gibt den Platz frei, falls ein
    // Prozess mittendrin endet.
    if (!(await this.kurzzustand.belege(ABRUF_PRUEFUNG, link.id, ABRUF_PRUEFUNG_MS).catch((e) => { frei(); throw e; }))) { frei(); return { art: 'beschaeftigt' }; }
    try { return await this.auskunftAbrufCode(link, c); } finally { await this.kurzzustand.loesche(ABRUF_PRUEFUNG, link.id).catch(() => {}); frei(); }
  }

  private async auskunftAbrufCode(link: AuskunftLinkIntern, c: string): Promise<{ art: 'ok' | 'falsch' | 'ungueltig'; link?: AuskunftLinkIntern }> {
    if (!c || !(await pruefePasswort(c, link.code))) {
      const f = await this.repo.auskunftLinkFehlversuch(link.id, LINK_FEHLVERSUCHE_MAX);
      const gesperrt = !!f?.gesperrt;
      await this.notiere(link.mappeId, null, 'auskunft', { text: t('meldungen.dienst.abruf-fehlgeschlagen-falscher', { wert: gesperrt ? t('meldungen.dienst.link-nach-fehlversuchen-gesperrt', { fehlversuche: f!.fehlversuche }) : '' }), zustellung: 'abruf', erfolg: false, link: link.id, auskunft: link.auskunftId });
      if (gesperrt) {
        protokoll.modul('datenschutz').warn('Abruf-Link nach Fehlversuchen gesperrt', { mappeId: link.mappeId, link: link.id, versuche: f!.fehlversuche });
        await this.auskunftMelden(link, t('meldungen.dienst.abruf-link-fuer-die', { wert: link.titel || t('meldungen.dienst.ohne-titel'), fehlversuche: f!.fehlversuche }), 'gesperrt');
      }
      return { art: 'falsch', link };
    }
    const st = linkStatus(link);
    if (st !== 'aktiv') {
      await this.notiere(link.mappeId, null, 'auskunft', { text: t('meldungen.dienst.abruf-versucht-aber-der', { LINK_STATUS: LINK_STATUS[st] }), zustellung: 'abruf', erfolg: false, link: link.id, auskunft: link.auskunftId });
      return { art: 'ungueltig', link };
    }
    return { art: 'ok', link };
  }

  async auskunftLinkMitId(id: string): Promise<AuskunftLinkIntern | undefined> { return (await this.repo.auskunftLinks({ id, max: 1 }))[0]; }

  /** Einen Abruf zählen, solange der Link gilt (atomar); null = gilt nicht mehr. */
  auskunftAbrufZaehlen(id: string): Promise<number | null> { return this.repo.auskunftLinkAbruf(id); }

  /** Nachweis eines Abrufs (#455): Historie und Benachrichtigung an Ersteller und Favoriten-Inhaber. */
  async auskunftAbgerufen(link: AuskunftLink, nr: number, vollstaendig: boolean, standVon?: string) {
    await this.notiere(link.mappeId, null, 'auskunft', {
      text: vollstaendig ? t('meldungen.dienst.auskunft-abgerufen-von-hoechstens', { nr, maxAbrufe: link.maxAbrufe }) : t('meldungen.dienst.abruf-abgebrochen-von-hoechstens', { nr, maxAbrufe: link.maxAbrufe }),
      zustellung: 'abruf', erfolg: vollstaendig, link: link.id, auskunft: link.auskunftId, nr,
    });
    if (vollstaendig) await this.auskunftMelden(link, t('meldungen.dienst.auskunft-an-wurde-abgerufen', { wert: link.titel || t('meldungen.dienst.ohne-titel') }), 'abgerufen', standVon);
  }

  /**
   * Benachrichtigung (#455) als Aufgabe „Auskunft“ an der Mappe der Person: an den, der den Link erstellt
   * hat, den Ersteller der Auskunft und alle, die die Person als Favorit haben (Stern = Abo, #422).
   * Gebündelt: Solange eine solche Aufgabe offen ist, kommt für denselben Link keine zweite.
   */
  private async auskunftMelden(link: AuskunftLink, text: string, anlass: 'abgerufen' | 'gesperrt', standVon?: string) {
    // Favorit = Abo (#422): nur Favoriten mit eingeschalteter Benachrichtigung.
    const fav: string[] = [];
    for (const f of await this.repo.favoritenDerMappe(link.mappeId)) {
      if (f.benachrichtigen && await this.persoenlichAn(f.benutzerId, 'favoriten_benachrichtigen')) fav.push(f.benutzerId);
    }
    let an = [...new Set([link.erstelltVon, standVon, ...fav].filter((x): x is string => !!x && istUuid(x)))];
    if (this.konten?.benutzer) { const aktiv = new Set((await this.konten.benutzer()).filter((b) => b.aktiv).map((b) => b.id)); an = an.filter((id) => aktiv.has(id)); }
    const key = `${anlass}:${link.id}`;
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [link.mappeId] })).filter((a) => a.art === 'auskunft' && a.feldKey === key);
    for (const id of an) {
      if (offen.some((a) => a.empfaengerId === id)) continue;
      const a = await this.neueAufgabe({ id: randomUUID(), mappeId: link.mappeId, empfaengerId: id, art: 'auskunft', feldKey: key, text: text.slice(0, AUFGABE_MAX), erstellt: '', erstelltVon: null, erledigt: null, erledigtVon: null });
      await this.leiteUm(a);
    }
  }

  /** Dürfen Benutzer ihre Daten selbst exportieren (#255)? Ab Werk aus (#884): nur bei ausdrücklich `true`. */
  async persoenlicherExportErlaubt(): Promise<boolean> { return (await this.einstellungen?.lies('persoenlicher_export')) === true; }

  async setzePersoenlicherExport(an: unknown, von: string) {
    await this.einstellungen?.schreibe('persoenlicher_export', an === true);
    protokoll.modul('werkbank').info(an === true ? '„Meine Daten exportieren“ erlaubt' : '„Meine Daten exportieren“ abgeschaltet', { von });
    return this.persoenlicherExportErlaubt();
  }

  /** Abschätzung vor dem Vollexport: Mappen, Dokumente, Bytes (mit älteren Versionen). */
  async exportAbschaetzung() {
    const dateien = await this.repo.alleDateien();
    let mappen = 0;
    for (const t of await this.repo.listeTypen()) mappen += await this.repo.zaehleMappen(t.id);
    return { mappen, dokumente: dateien.length, bytes: dateien.reduce((a, d) => a + d.groesse, 0) };
  }
}
