import { randomBytes } from 'node:crypto';
import { NOTFALL_SPERRE_SEKUNDEN } from '../../../shared/src/notfallcode';
import { istPerson, type Benutzer } from '../../../shared/src/model';
import { darfVerwalten, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { zeitzone } from '../../../shared/src/region';
import { ipBereich, istPrivat, kuerzeIp } from '../datenschutz/abruf';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { Fachfehler } from '../grundlagen/fehler';
import { hashe, speicherKurzzustand, type Kurzzustand } from '../zwischenspeicher/kurzzustand';
import { pruefePasswortRegeln, type Konten } from '../konten';
import type { Mailer } from '../mail/mail';
import { mailtexte } from '../mail/mail';
import { protokoll } from '../protokoll/protokoll';
import type { ProxyVertrauen } from '../http/proxy';
import { mitSpracheVon, t } from '../sprache/sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Notfallzugang mit dem Notfallcode vom Notfallblatt (#815): ausgesperrt, trotzdem wieder hinein – ohne Dateien auf dem
 * NAS (die RESCUE-Datei, #108, bleibt als zweiter Weg). Ablauf auf `/notfall`: Code eingeben → erst danach die Konten
 * mit Verwaltungsrecht zur Wahl → neues Passwort direkt setzen → neues Notfallblatt herunterladen (Pflicht) → anmelden.
 *
 * Bauvorgaben von Sicherheit (#815):
 * - Code nur als Hash (scrypt), Vergleich in konstanter Zeit, gleich viel Arbeit bei richtigem und falschem Code.
 *   Einlösen in derselben Transaktion wie das neue Passwort (`Konten.loeseNotfallcodeEin`).
 * - „Nur aus dem Heimnetz“ (Vorgabe) mit der echten Client-Adresse hinter einem Reverse Proxy (`istHeimnetz`).
 * - Jede Fehleingabe sperrt 30 Sekunden – je Adressbereich (IPv4 einzeln, IPv6 je /64), damit niemand Lena durch eigene
 *   Fehlversuche aussperrt. Über alle Bereiche nur eine gebündelte Meldung; dazu zählt der allgemeine Anmeldeschutz.
 * - Die Benachrichtigung geht an die bisherige Adresse des Kontos und an alle mit Verwaltungsrecht, **bevor** sich
 *   etwas ändert. Danach: Sitzungen beenden, Zwei-Faktor zurücksetzen; verwalten erst nach neuer Anmeldung.
 *   API-Schlüssel des Kontos bleiben, die Meldung nennt sie.
 */

const log = protokoll.modul('konto');
const SPERRE_MS = NOTFALL_SPERRE_SEKUNDEN * 1000;
/** Gebündelte Meldung: ab so vielen Fehlversuchen in einer Stunde, höchstens einmal je Stunde. */
export const FEHLVERSUCHE_MELDEN = 5;
const STUNDE = 60 * 60_000;
/** Das neue Notfallblatt nach dem Einlösen: so lange herunterladbar (nur im Arbeitsspeicher). */
export const BLATT_MINUTEN = 15;
/** Arten im Kurzzustand (#744). */
const SPERRE = 'notfall-sperre';
const PRUEFUNG = 'notfall-pruefung';
const FEHLVERSUCHE = 'notfall-fehlversuche';
const GEMELDET = 'notfall-gemeldet';
const BLATT = 'notfall-blatt';
const BLATT_ERZEUGEN = 'notfall-blatt-erzeugen';
/** Eine Prüfung (scrypt, Mail) dauert Sekunden; danach gibt die Frist den Bereich frei, falls der Prozess endet. */
const PRUEFUNG_MS = 60_000;
const EINSTELLUNG = 'notfallzugang';
const BENUTZT = 'notfallcode_benutzt';

/* ---------- Heimnetz ---------- */

// Private Adressen (#885) stehen seit #1053 in abruf.ts (auch für die Nachweise der Fehlanmeldungen).
export { istPrivat };

/** Köpfe, mit denen ein Reverse Proxy die echte Adresse weitergibt. */
const WEITERGELEITET = ['x-forwarded-for', 'forwarded', 'x-real-ip'];

/**
 * Kommt die Anfrage aus dem Heimnetz (#815, Bauvorgabe Sicherheit)? Hinter einem Reverse Proxy kämen sonst alle
 * Anfragen scheinbar vom Proxy, also aus dem Heimnetz – dann wäre /notfall aus dem Internet offen. Darum:
 * - Mit Proxy-Angabe (X-Forwarded-For) gilt die Adresse, die Ablago nach `TRUST_PROXY` daraus bestimmt hat (`ip`).
 * - Kommt eine Proxy-Angabe an, obwohl kein Proxy vertrauenswürdig ist (`TRUST_PROXY=false`), gilt die Anfrage als
 *   „nicht Heimnetz“; ebenso mit `TRUST_PROXY=true` (die Angabe könnte jeder setzen) und mit Köpfen, die Ablago nicht
 *   auswertet (Forwarded, X-Real-IP ohne X-Forwarded-For).
 */
export function istHeimnetz(
  a: { ip: string; kopf?: (name: string) => string | undefined },
  vertrauen: ProxyVertrauen | undefined,
): boolean {
  const weiter = WEITERGELEITET.filter((k) => !!a.kopf?.(k)?.trim());
  if (weiter.length) {
    if (vertrauen === false || vertrauen === undefined || vertrauen === true) return false;
    if (!weiter.includes('x-forwarded-for')) return false;
  }
  return istPrivat(a.ip);
}

/** Warum „nicht aus dem Heimnetz“ (#885): die Proxy-Angabe wird nicht geglaubt, oder Ablago sieht eine öffentliche Adresse. */
export type HeimnetzGrund = 'oeffentlich' | 'proxy';

/**
 * Für die Werkbank (#885): `istHeimnetz` plus Grund, wenn nicht. Die Prüfung selbst bleibt `istHeimnetz`; hier wird nur
 * nachträglich unterschieden, damit Markus sieht, was er beheben kann (lokaler DNS-Eintrag oder Proxy-Einstellung).
 */
export function heimnetzStand(
  a: { ip: string; kopf?: (name: string) => string | undefined },
  vertrauen: ProxyVertrauen | undefined,
): { heimnetz: true } | { heimnetz: false; grund: HeimnetzGrund } {
  if (istHeimnetz(a, vertrauen)) return { heimnetz: true };
  const weiter = WEITERGELEITET.filter((k) => !!a.kopf?.(k)?.trim());
  const geglaubt = !weiter.length || (Array.isArray(vertrauen) && weiter.includes('x-forwarded-for'));
  return { heimnetz: false, grund: geglaubt ? 'oeffentlich' : 'proxy' };
}

/* ---------- Sperre je Adressbereich ---------- */

/**
 * 30 Sekunden je Fehleingabe, je Adressbereich; dazu höchstens eine Prüfung gleichzeitig je Bereich. Seit #744 im
 * Kurzzustand (Datenbank): Sperre und Belegung gelten für alle Prozesse. Die Belegung hat eine Frist, damit ein
 * Prozess, der mittendrin endet, den Bereich nicht dauerhaft blockiert.
 */
export class NotfallSperre {
  private zustand: Kurzzustand;
  constructor(
    private jetzt: () => number = Date.now,
    zustand?: Kurzzustand,
  ) {
    this.zustand = zustand ?? speicherKurzzustand(jetzt);
  }

  /** Noch gesperrt? Dann die Wartezeit in Sekunden, sonst 0. */
  async rest(bereich: string): Promise<number> {
    const b = (await this.zustand.lies(SPERRE, bereich))?.bis;
    return b ? Math.max(1, Math.ceil((b - this.jetzt()) / 1000)) : 0;
  }

  async fehlschlag(bereich: string) {
    await this.zustand.setze(SPERRE, bereich, null, this.jetzt() + SPERRE_MS);
  }

  /** Platz für eine Prüfung in diesem Bereich (parallele Anfragen kommen sonst an der Sperre vorbei); null = belegt. */
  async belege(bereich: string): Promise<(() => Promise<void>) | null> {
    if (!(await this.zustand.belege(PRUEFUNG, bereich, PRUEFUNG_MS))) return null;
    let frei = false;
    return async () => {
      if (!frei) {
        frei = true;
        await this.zustand.loesche(PRUEFUNG, bereich).catch(() => {});
      }
    };
  }
}

/* ---------- Ablauf ---------- */

export interface NotfallAnfrage {
  ip: string;
  kopf?: (name: string) => string | undefined;
}
export interface NotfallEinstellung {
  internet: boolean;
  von: string | null;
  am: string | null;
}
/** Ein benutzter Notfallcode: steht in der Werkbank, bis ihn jemand mit „Gesamte Verwaltung“ als gelesen markiert. */
export interface NotfallBenutzt {
  id: string;
  benutzerId: string;
  name: string;
  email: string;
  am: string;
  gelesen?: { von: string; am: string };
}

export interface NotfallDeps {
  konten: Konten;
  einstellungen: Einstellungen;
  mailer: () => Mailer | null;
  /** TRUST_PROXY (#234): wem Ablago die Proxy-Angaben glaubt. */
  proxy?: ProxyVertrauen;
  /** Zahl der API-Schlüssel einer Person – die Meldung nennt sie (sie bleiben gültig). */
  apiSchluessel?: (benutzerId: string) => Promise<number>;
  /** Nach dem Einlösen: Das Notfallblatt gilt nicht mehr (Hinweis in der Werkbank, bis ein neues da ist). */
  codeBenutzt?: () => Promise<void>;
  jetzt?: () => number;
  /** Zustand zwischen Anfragen (#744); ohne Angabe im Arbeitsspeicher. */
  zustand?: Kurzzustand;
  /** Das neue Notfallblatt nach dem Einlösen liegt bis zum Ablauf verschlüsselt im Kurzzustand (es trägt den Schlüssel). */
  verschluessele?: (klartext: string) => string;
  entschluessele?: (wert: string) => string | null;
}

const datumText = (d: Date) => d.toLocaleString(gebietsschema(), { timeZone: zeitzone(), dateStyle: 'long', timeStyle: 'short' });

export class Notfallcode {
  readonly sperre: NotfallSperre;
  private zustand: Kurzzustand;
  /** Erzeugte Blätter dieses Prozesses, wenn kein Schlüssel zum Verschlüsseln da ist (Tests). */
  private pdfs = new Map<string, Buffer>();
  private jetzt: () => number;

  constructor(private d: NotfallDeps) {
    this.jetzt = d.jetzt ?? Date.now;
    this.zustand = d.zustand ?? speicherKurzzustand(this.jetzt);
    this.sperre = new NotfallSperre(this.jetzt, this.zustand);
  }

  async einstellung(): Promise<NotfallEinstellung> {
    const e = (await this.d.einstellungen.lies(EINSTELLUNG)) as Partial<NotfallEinstellung> | null;
    return { internet: e?.internet === true, von: e?.von ?? null, am: e?.am ?? null };
  }

  /** „Notfallzugang aus dem Internet erlauben“ – eine heikle Handlung (frische Anmeldung, verwaltungsbereiche.ts). */
  async setzeEinstellung(eingabe: { internet?: unknown }, von: string): Promise<NotfallEinstellung> {
    const internet = eingabe.internet === true;
    const alt = await this.einstellung();
    if (alt.internet === internet) return alt;
    const neu: NotfallEinstellung = { internet, von, am: new Date(this.jetzt()).toISOString() };
    await this.d.einstellungen.schreibe(EINSTELLUNG, neu);
    log.warn(internet ? 'Notfallzugang aus dem Internet erlaubt' : 'Notfallzugang nur noch aus dem Heimnetz', {
      von,
      imVerwaltungsmodus: true,
    });
    return neu;
  }

  /** Stand für die Seite /notfall: geht es von hier, und wie lange ist die Eingabe noch gesperrt? Verrät sonst nichts. */
  async stand(a: NotfallAnfrage): Promise<{ erlaubt: boolean; warten: number }> {
    const heimnetz = istHeimnetz(a, this.d.proxy);
    return { erlaubt: heimnetz || (await this.einstellung()).internet, warten: await this.sperre.rest(ipBereich(a.ip)) };
  }

  /** Vor jeder Prüfung: von hier erlaubt, nicht gesperrt, Anmeldeschutz. Liefert den Bereich und den belegten Platz. */
  private async vorher(a: NotfallAnfrage): Promise<{ bereich: string; frei: () => Promise<void> }> {
    if (!(await this.stand(a)).erlaubt) throw new Fachfehler(403, t('konten.notfall.fehler.heimnetz'), { heimnetz: false });
    const bereich = ipBereich(a.ip);
    const warten = await this.sperre.rest(bereich);
    if (warten) throw new Fachfehler(429, t('konten.notfall.fehler.warten', { sekunden: warten }), { warten });
    await this.d.konten.sperre.pruefe('notfallzugang', a.ip);
    const frei = await this.sperre.belege(bereich);
    if (!frei)
      throw new Fachfehler(429, t('konten.notfall.fehler.warten', { sekunden: NOTFALL_SPERRE_SEKUNDEN }), {
        warten: NOTFALL_SPERRE_SEKUNDEN,
      });
    return { bereich, frei };
  }

  /** Falscher Code: 30 s Sperre für den Bereich, Anmeldeschutz, Protokoll, gebündelte Meldung. */
  private async falsch(a: NotfallAnfrage, bereich: string): Promise<never> {
    await this.sperre.fehlschlag(bereich);
    await this.d.konten.sperre.fehlschlag('notfallzugang', a.ip).catch(() => {});
    log.warn('Notfallzugang: falscher Notfallcode', { ip: kuerzeIp(a.ip) });
    // Über alle Prozesse gezählt (#744), festes Fenster von einer Stunde; die Meldung höchstens einmal je Stunde.
    const { anzahl } = await this.zustand.zaehle(FEHLVERSUCHE, 'alle', STUNDE);
    if (anzahl >= FEHLVERSUCHE_MELDEN && (await this.zustand.belege(GEMELDET, 'alle', STUNDE))) {
      await this.anVerwaltende(() => mailtexte.notfallFehlversuche(anzahl, kuerzeIp(a.ip))).catch((e) =>
        log.warn('Meldung zu Fehlversuchen am Notfallzugang nicht verschickt', { fehler: (e as Error).message }),
      );
      log.warn('Notfallzugang: viele Fehlversuche gemeldet', { anzahl });
    }
    throw new Fachfehler(403, t('konten.notfall.fehler.falsch'), { warten: NOTFALL_SPERRE_SEKUNDEN });
  }

  /** Schritt 1: Code prüfen. Erst danach – nie vorher – nennt die Seite die Konten zur Wahl. */
  async pruefe(a: NotfallAnfrage, code: unknown): Promise<{ konten: Array<{ id: string; name: string; email: string }> }> {
    const { bereich, frei } = await this.vorher(a);
    try {
      const hash = await this.d.konten.pruefeNotfallcode(code);
      if (!hash) return await this.falsch(a, bereich);
      log.info('Notfallzugang: Notfallcode richtig, Konto wird gewählt', { ip: kuerzeIp(a.ip) });
      return { konten: (await this.d.konten.notfallKonten()).map((b) => ({ id: b.id, name: b.name || b.email, email: b.email })) };
    } finally {
      await frei();
    }
  }

  /**
   * Schritt 2: Code erneut prüfen, zuerst benachrichtigen, dann einlösen (neues Passwort, Sitzungen weg, Zwei-Faktor
   * zurück). Liefert die Adresse fürs Anmelden und einen Schlüssel fürs neue Notfallblatt (15 Minuten).
   */
  async einloesen(
    a: NotfallAnfrage,
    e: { code?: unknown; konto?: unknown; passwort?: unknown },
  ): Promise<{ email: string; blatt: string }> {
    const { bereich, frei } = await this.vorher(a);
    try {
      const hash = await this.d.konten.pruefeNotfallcode(e.code);
      if (!hash) return await this.falsch(a, bereich);
      const konto = (await this.d.konten.notfallKonten()).find((b) => b.id === e.konto);
      if (!konto) throw new Fachfehler(404, t('konten.notfall.fehler.konto'));
      // Passwortregeln vor der Meldung: Ein zu kurzes Passwort soll keine Mail auslösen.
      pruefePasswortRegeln(e.passwort);
      // Benachrichtigung zuerst (Bauvorgabe Sicherheit): bisherige Adresse, alle mit Verwaltungsrecht – vor jeder Änderung.
      const am = new Date(this.jetzt());
      await this.meldeBenutzung(konto, am, a.ip);
      const neu = await this.d.konten.loeseNotfallcodeEin(hash, konto.id, e.passwort);
      if (!neu) throw new Fachfehler(409, t('konten.notfall.fehler.benutzt'));
      log.warn('Notfallzugang benutzt: neues Passwort mit dem Notfallcode', {
        konto: konto.email,
        ip: kuerzeIp(a.ip),
        zweifaktor: 'zurückgesetzt',
        sitzungen: 'beendet',
      });
      const liste = ((await this.d.einstellungen.lies(BENUTZT)) as NotfallBenutzt[] | null) ?? [];
      const id = randomBytes(6).toString('hex');
      await this.d.einstellungen.schreibe(
        BENUTZT,
        [...liste, { id, benutzerId: konto.id, name: konto.name || konto.email, email: konto.email, am: am.toISOString() }].slice(-20),
      );
      await this.d.codeBenutzt?.().catch((x) => log.warn('Notfallblatt nicht als veraltet vermerkt', { fehler: (x as Error).message }));
      return { email: neu.email, blatt: await this.blattSchluessel(konto) };
    } finally {
      await frei();
    }
  }

  private async meldeBenutzung(konto: Benutzer, am: Date, ip: string) {
    const api = (await this.d.apiSchluessel?.(konto.id).catch(() => 0)) ?? 0;
    // Je Empfänger in seiner Sprache (#729).
    const m = (b: Benutzer) =>
      mitSpracheVon(b, () => mailtexte.notfallBenutzt(konto.name || konto.email, konto.email, datumText(am), kuerzeIp(ip), api));
    const mailer = this.d.mailer();
    if (!mailer) {
      log.warn('Notfallzugang: kein E-Mail-Versand eingerichtet – niemand wurde benachrichtigt', { konto: konto.email });
      return;
    }
    const an = new Map<string, Benutzer>();
    if (konto.email && !konto.email.endsWith('.invalid')) an.set(konto.email.toLowerCase(), konto);
    for (const b of await this.d.konten.listeBenutzer())
      if (istPerson(b) && b.aktiv && darfVerwalten(b) && b.email && !b.email.endsWith('.invalid') && !an.has(b.email.toLowerCase()))
        an.set(b.email.toLowerCase(), b);
    for (const [x, b] of an) {
      const text = m(b);
      try {
        await mailer.sende(x, text.betreff, text.text);
      } catch (err) {
        log.warn('Mail zum Notfallzugang nicht verschickt', { an: x, fehler: (err as Error).message });
      }
    }
  }

  private async anVerwaltende(m: (b: Benutzer) => { betreff: string; text: string }) {
    const mailer = this.d.mailer();
    if (!mailer) return;
    for (const b of await this.d.konten.listeBenutzer()) {
      if (istPerson(b) && b.aktiv && darfVerwalten(b) && b.email && !b.email.endsWith('.invalid')) {
        const x = mitSpracheVon(b, () => m(b));
        await mailer.sende(b.email, x.betreff, x.text);
      }
    }
  }

  /* ---------- Neues Notfallblatt nach dem Einlösen ---------- */

  /** Schlüssel fürs neue Notfallblatt (#744: im Kurzzustand nur sein Hash, gültig `BLATT_MINUTEN`). */
  private async blattSchluessel(konto: Benutzer): Promise<string> {
    const s = randomBytes(32).toString('base64url');
    await this.zustand.setze(
      BLATT,
      hashe(s),
      { benutzerId: konto.id, name: konto.name || konto.email },
      this.jetzt() + BLATT_MINUTEN * 60_000,
    );
    return s;
  }

  /**
   * Das neue Notfallblatt zum Schlüssel aus `einloesen`: beim ersten Abruf erzeugt (mit neuem Notfallcode), danach
   * dasselbe Blatt, bis der Schlüssel abläuft – so gilt immer der Code auf dem heruntergeladenen Blatt. Mehrere Prozesse
   * (#744): Erzeugt wird unter einer Belegung (nur einer); das Blatt liegt verschlüsselt beim Schlüssel, damit auch ein
   * anderer Prozess genau dieses Blatt ausliefert.
   */
  async blatt(schluessel: unknown, erzeuge: (von: string) => Promise<Buffer>): Promise<Buffer> {
    const h = typeof schluessel === 'string' && schluessel ? hashe(schluessel) : '';
    const weg = () => new Fachfehler(410, t('konten.notfall.fehler.blatt'));
    const x = h ? await this.zustand.lies(BLATT, h) : null;
    if (!x || x.bis === null) throw weg();
    const w = x.wert as { benutzerId: string; name: string; pdf?: string };
    const vorhanden = async (): Promise<Buffer | null> => {
      const y = await this.zustand.lies(BLATT, h);
      const pdf = (y?.wert as { pdf?: string } | undefined)?.pdf;
      if (pdf) {
        const klar = this.d.entschluessele?.(pdf);
        return klar ? Buffer.from(klar, 'base64') : null;
      }
      return this.pdfs.get(h) ?? null;
    };
    const da = await vorhanden();
    if (da) return da;
    if (!(await this.zustand.belege(BLATT_ERZEUGEN, h, PRUEFUNG_MS))) {
      // Ein anderer erzeugt es gerade: kurz warten und dessen Blatt liefern.
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const p = await vorhanden();
        if (p) return p;
      }
      throw weg();
    }
    try {
      const pdf = await erzeuge(t('konten.notfall.von', { name: w.name }));
      if (this.d.verschluessele) await this.zustand.setze(BLATT, h, { ...w, pdf: this.d.verschluessele(pdf.toString('base64')) }, x.bis);
      else this.pdfs.set(h, pdf);
      return pdf;
    } finally {
      await this.zustand.loesche(BLATT_ERZEUGEN, h).catch(() => {});
    }
  }

  /* ---------- Hinweis in der Werkbank ---------- */

  /** Benutzte Notfallcodes, die noch niemand als gelesen markiert hat. */
  async offen(): Promise<NotfallBenutzt[]> {
    return (((await this.d.einstellungen.lies(BENUTZT)) as NotfallBenutzt[] | null) ?? []).filter((x) => !x.gelesen);
  }

  /** „Gelesen“: nur „Gesamte Verwaltung“; steht im Protokoll. */
  async gelesen(id: string, ich: Benutzer): Promise<void> {
    if (!hatGesamt(ich)) throw new Fachfehler(403, t('konten.verwaltung.fehler.vergeben'));
    const liste = ((await this.d.einstellungen.lies(BENUTZT)) as NotfallBenutzt[] | null) ?? [];
    const x = liste.find((y) => y.id === id && !y.gelesen);
    if (!x) return;
    x.gelesen = { von: ich.name || ich.email, am: new Date(this.jetzt()).toISOString() };
    await this.d.einstellungen.schreibe(BENUTZT, liste);
    log.info('Hinweis „Notfallzugang benutzt“ gelesen', { konto: x.email, von: ich.email, imVerwaltungsmodus: true });
  }
}
