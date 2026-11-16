import { randomUUID } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import { heuteIn } from '../../../shared/src/sichten';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { speicherEinstellungen } from '../einstellungen/einstellungen';
import { Fachfehler } from '../grundlagen/fehler';
import { speicherKurzzustand, type Kurzzustand } from '../zwischenspeicher/kurzzustand';
import { protokoll } from '../protokoll/protokoll';
import { fehlanmeldung } from '../protokoll/nachweisjournal';
import { t } from '../sprache/sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Anmeldeschutz (#240): nach zu vielen Fehlversuchen sperren – je E-Mail-Adresse und IP (wie bisher)
 * und zusätzlich je IP über alle Adressen, wahlweise dauerhaft bis zum Entsperren. Werte in der
 * Werkbank einstellbar, Zähler und Sperren in der Datenbank (überstehen einen Neustart und gelten seit #744 für alle
 * Prozesse), Ausnahmen für eigene Netze.
 *
 * Mails (#368): Angriffsversuche aus dem Internet sind normal, darum im Standard keine Mail. Eingeschaltet
 * kommt höchstens eine Sammelmeldung am Tag (über die Sperren des Vortags), wahlweise zusätzlich sofort
 * eine Mail, wenn ein bestehendes Benutzerkonto gesperrt wird (je Konto höchstens einmal am Tag).
 */

export interface Grenze {
  versuche: number;
  /** 0 = dauerhaft, bis entsperrt (nur IP). */ minuten: number;
}
export interface SperrEinstellung {
  konto: Grenze;
  ip: Grenze;
  ausnahmen: string[];
  /** Tägliche Sammelmeldung über die Sperren (#368; bis 0.84.7 eine Mail je gesperrter IP, im Standard an). */
  mail: boolean;
  /** Zusätzlich sofort melden, wenn ein bestehendes Benutzerkonto gesperrt wird (#368). */
  mailKonto: boolean;
}
export const SPERRE_STANDARD: SperrEinstellung = {
  konto: { versuche: 5, minuten: 1 },
  ip: { versuche: 30, minuten: 60 },
  ausnahmen: [],
  mail: false,
  mailKonto: false,
};

/**
 * So liegt die Einstellung in der Datenbank. `mailGewaehlt` steht nur dort, wo ein Administrator den
 * Mail-Schalter selbst umgelegt hat (ab 0.84.8). Bis 0.84.7 schrieb die Werkbank beim Speichern immer den
 * ganzen Satz mit – ein gespeichertes `mail: true` heißt dort nur „Standard übernommen“. Ohne Kennzeichen
 * gilt darum der aktuelle Standard; so braucht es keine Migration.
 */
type GespeicherteEinstellung = Partial<SperrEinstellung> & { mailGewaehlt?: boolean };

/** Wirksame Einstellung aus dem gespeicherten Wert (#368). */
export function leseSperrEinstellung(roh: unknown): { e: SperrEinstellung; mailGewaehlt: boolean } {
  const g = (roh && typeof roh === 'object' ? roh : {}) as GespeicherteEinstellung;
  const { mailGewaehlt, ...rest } = g;
  const gewaehlt = mailGewaehlt === true;
  return {
    e: { ...SPERRE_STANDARD, ...rest, mail: gewaehlt ? rest.mail === true : SPERRE_STANDARD.mail, mailKonto: rest.mailKonto === true },
    mailGewaehlt: gewaehlt,
  };
}

/** Eine Sperre für die Sammelmeldung; `tag` als JJJJ-MM-TT (Zeitzone der Region). */
export interface Meldung {
  tag: string;
  art: 'ip' | 'konto';
  wer: string;
  versuche: number;
}
interface Meldestand {
  offen: Meldung[];
  zuletzt?: string;
}
const MELDUNGEN_HOECHSTENS = 2000;

const datum = (tag: string) => tag.split('-').reverse().join('.');

/** Text der Sammelmeldung über die Sperren vor heute (#368). */
export function sammelText(meldungen: Meldung[]): { betreff: string; text: string } {
  const tage = [...new Set(meldungen.map((m) => m.tag))].sort();
  const zeitraum = t('meldungen.anmeldesperre.vom-bis', {
    anzahl: tage.length,
    datum: datum(tage[0]),
    datum2: datum(tage[tage.length - 1]),
  });
  const ips = meldungen.filter((m) => m.art === 'ip');
  const konten = meldungen.filter((m) => m.art === 'konto');
  const teile: string[] = [];
  if (ips.length) teile.push(t('meldungen.anmeldesperre.ip-adressen', { anzahl: ips.length }));
  const kontenAnzahl = new Set(konten.map((m) => m.wer)).size;
  if (kontenAnzahl) teile.push(t('meldungen.anmeldesperre.benutzerkonten', { anzahl: kontenAnzahl }));
  const zeilen = [
    t('meldungen.anmeldesperre.hat-der-anmeldeschutz-nach', { zeitraum, teile: teile.join(' und ') }),
    '',
    t('meldungen.anmeldesperre.angriffsversuche-aus-dem-internet'),
  ];
  if (ips.length) {
    const top = [...ips].sort((a, b) => b.versuche - a.versuche).slice(0, 5);
    zeilen.push(
      '',
      ips.length > 5 ? t('meldungen.anmeldesperre.die-fuenf-mit-den') : t('meldungen.anmeldesperre.gesperrte-adressen'),
      ...top.map((m) => `- ${m.wer}: ${m.versuche} Fehlversuche (${datum(m.tag)})`),
    );
  }
  if (konten.length) {
    const je = new Map<string, number>();
    for (const m of konten) je.set(m.wer, (je.get(m.wer) ?? 0) + 1);
    zeilen.push(
      '',
      t('meldungen.anmeldesperre.gesperrte-benutzerkonten-je-e'),
      ...[...je].slice(0, 10).map(([wer, n]) => `- ${wer}${n > 1 ? ` (${n}×)` : ''}`),
    );
  }
  zeilen.push('', t('meldungen.anmeldesperre.gesperrte-adressen-entsperren'));
  return { betreff: t('meldungen.anmeldesperre.ablago-anmeldeschutz-gesperrt', { teile: teile.join(' und ') }), text: zeilen.join('\n') };
}

/** Ein vorab gezählter Anmeldeversuch (#956), siehe `Anmeldesperre.versuch`. */
export interface Versuch {
  konto: number;
  ip: number;
  ausgenommen: boolean;
  gesamt?: number;
}

export interface IpSperre {
  ip: string;
  seit: string;
  bis: string | null;
  grund: string;
}

const log = protokoll.modul('konto');
const MIN = 60_000;

/** IPv4 in IPv6 (::ffff:1.2.3.4) wie IPv4 behandeln. */
const ohneMapping = (ip: string) => ip.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1').trim();

/** Erste 64 Bit einer IPv6-Adresse als `a:b:c:d::/64` (ohne führende Nullen), sonst null. */
export function ipv6Netz64(ip: string): string | null {
  const a = ip.split('%')[0];
  if (isIP(a) !== 6) return null;
  const [links, rechts] = a.includes('::') ? a.split('::') : [a, undefined];
  const l = links ? links.split(':') : [];
  const r = rechts ? rechts.split(':') : [];
  // Eingebettetes IPv4 am Ende zählt als zwei Gruppen; für die ersten 64 Bit ohne Belang.
  const fehlt = 8 - l.length - r.length - (r.at(-1)?.includes('.') || l.at(-1)?.includes('.') ? 1 : 0);
  const gruppen = rechts === undefined ? l : [...l, ...Array<string>(Math.max(0, fehlt)).fill('0'), ...r];
  return `${gruppen
    .slice(0, 4)
    .map((g) => (parseInt(g, 16) || 0).toString(16))
    .join(':')}::/64`;
}

/**
 * Schlüssel einer Adresse für Zähler und Sperren: IPv4 wie sie ist, IPv6 je /64 (#1295). Ein Anschluss bekommt meist
 * ein ganzes /64 und könnte sonst mit jeder Anfrage eine neue Adresse nehmen. Schon gekürzte Angaben (`…/64`, aus der
 * Liste gesperrter Adressen) bleiben, wie sie sind.
 */
const norm = (ip: string) => {
  const a = ohneMapping(ip);
  return a.endsWith('/64') ? a : (ipv6Netz64(a) ?? a);
};

/**
 * Bremse je Konto (#1295), unabhängig von der Adresse: Kommen von vielen Adressen zusammen so viele Fehlversuche für
 * dasselbe Konto, nimmt Ablago für dieses Konto bis zum Ende des Fensters keine Passwörter mehr an (außer aus den
 * Ausnahmen). Gezählt je E-Mail-Adresse, ob es das Konto gibt oder nicht – die Antwort verrät also nichts.
 */
export const KONTO_GESAMT = { versuche: 30, minuten: 60 } as const;

/** Ausnahmen prüfen: einzelne Adressen oder Netze wie 192.168.0.0/16. */
export function pruefeAusnahmen(liste: unknown): string[] {
  const roh = Array.isArray(liste) ? liste : String(liste ?? '').split(/[\s,;]+/);
  const aus = roh.map((x) => String(x).trim()).filter(Boolean);
  const schlecht = aus.filter((x) => {
    const [a, p] = x.split('/');
    const f = isIP(a);
    return !f || (p !== undefined && !(Number.isInteger(Number(p)) && Number(p) >= 0 && Number(p) <= (f === 4 ? 32 : 128)));
  });
  if (schlecht.length) throw new Fachfehler(422, t('meldungen.anmeldesperre.ausnahmen-ist-keine-ip', { schlecht: schlecht.join(', ') }));
  return aus.slice(0, 50);
}

function liste(ausnahmen: string[]) {
  const b = new BlockList();
  for (const x of ausnahmen) {
    const [a, p] = x.split('/');
    const typ = isIP(a) === 6 ? 'ipv6' : 'ipv4';
    if (p !== undefined) b.addSubnet(a, Number(p), typ);
    else b.addAddress(a, typ);
  }
  return b;
}

export function pruefeSperrEinstellung(x: unknown, alt: SperrEinstellung): SperrEinstellung {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const grenze = (g: unknown, a: Grenze, name: string, dauerhaft: boolean): Grenze => {
    const v = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>;
    const versuche = v.versuche === undefined ? a.versuche : Math.round(Number(v.versuche));
    const minuten = v.minuten === undefined ? a.minuten : Math.round(Number(v.minuten));
    if (!Number.isInteger(versuche) || versuche < 1 || versuche > 1000) throw new Fachfehler(422, `${name}: 1 bis 1000 Fehlversuche.`);
    if (!Number.isInteger(minuten) || minuten < (dauerhaft ? 0 : 1) || minuten > 525_600)
      throw new Fachfehler(422, `${name}: Sperrdauer ${dauerhaft ? t('meldungen.anmeldesperre.0-dauerhaft') : '1 '}bis 525.600 Minuten.`);
    return { versuche, minuten };
  };
  return {
    konto: grenze(o.konto, alt.konto, t('meldungen.anmeldesperre.je-konto-und-ip'), false),
    ip: grenze(o.ip, alt.ip, 'Je IP', true),
    ausnahmen: o.ausnahmen === undefined ? alt.ausnahmen : pruefeAusnahmen(o.ausnahmen),
    mail: o.mail === undefined ? alt.mail : o.mail === true,
    mailKonto: o.mailKonto === undefined ? alt.mailKonto : o.mailKonto === true,
  };
}

/** Arten im Kurzzustand (#744). Schlüssel der Konten: „IP|E-Mail“, damit Entsperren einer IP alle ihre Konten trifft. */
const KONTO = 'anmeldung-konto';
const KONTO_GESAMT_ART = 'anmeldung-konto-gesamt';
const IP_ZAEHLER = 'anmeldung-ip';
const IP_SPERRE = 'anmeldung-ip-sperre';
const MELDUNG = 'anmeldung-meldung';
const SAMMEL = 'anmeldung-sammelmeldung';
const SOFORT = 'anmeldung-sofortmeldung';
/** Vorgemerkte Sperren für die Sammelmeldung: so lange, falls die Automatisierung länger nicht meldet. */
const MELDUNG_TAGE = 14;
/** Einstellung höchstens so lange gemerkt – Änderungen aus einem anderen Prozess gelten danach auch hier. */
const EINSTELLUNG_MS = 10_000;
const TAG_MS = 24 * 60 * MIN;

/**
 * Seit #744 liegen Zähler, Sperren und Meldungen im Kurzzustand (Datenbank): Mit mehreren Prozessen oder Servern zählt
 * jeder Fehlversuch für alle, und gezählt wird atomar (keine parallelen Anfragen an der Sperre vorbei).
 */
export class Anmeldesperre {
  private geladen = 0;
  private e: SperrEinstellung = SPERRE_STANDARD;
  private mailGewaehlt = false;
  private ausnahmen = liste([]);
  private zustand: Kurzzustand;

  /** Wird ein bestehendes Konto gesperrt, meldet der Start das als Ereignis (#670). */
  beiKontosperre?: (e: { email: string; ip: string; versuche: number; bis: string }) => Promise<void>;

  constructor(
    private speicher: Einstellungen = speicherEinstellungen(),
    private anAdmins?: (betreff: import('../mail/mail').MailText, text: import('../mail/mail').MailText) => Promise<void>,
    private jetzt: () => number = Date.now,
    zustand?: Kurzzustand,
  ) {
    this.zustand = zustand ?? speicherKurzzustand(jetzt);
  }

  private async lade() {
    if (this.geladen && this.jetzt() - this.geladen < EINSTELLUNG_MS) return;
    ({ e: this.e, mailGewaehlt: this.mailGewaehlt } = leseSperrEinstellung(await this.speicher.lies('anmeldesperre')));
    this.ausnahmen = liste(this.e.ausnahmen);
    this.geladen = this.jetzt();
  }

  private ausgenommen(ip: string) {
    // Ausnahmen gelten für die Adresse selbst, nicht für ihr /64.
    const a = ohneMapping(ip);
    const f = isIP(a);
    return !!f && this.ausnahmen.check(a, f === 6 ? 'ipv6' : 'ipv4');
  }

  async einstellung(): Promise<SperrEinstellung> {
    await this.lade();
    return this.e;
  }
  async speichere(x: unknown, von: string): Promise<SperrEinstellung> {
    this.geladen = 0;
    await this.lade();
    const vorher = this.e.mail;
    this.e = pruefeSperrEinstellung(x, this.e);
    this.ausnahmen = liste(this.e.ausnahmen);
    // Nur ein umgelegter Schalter zählt als eigene Wahl; wer den Standard bloß mitspeichert, behält den Standard (#368).
    if (this.e.mail !== vorher) this.mailGewaehlt = true;
    const wert: GespeicherteEinstellung = this.mailGewaehlt ? { ...this.e, mailGewaehlt: true } : { ...this.e };
    await this.speicher.schreibe('anmeldesperre', wert);
    this.geladen = this.jetzt();
    if (!this.e.mail) {
      await this.speicher.schreibe('anmeldesperre_meldung', null);
      await this.zustand.loesche(MELDUNG);
    }
    log.info('Anmeldeschutz eingestellt', {
      von,
      konto: `${this.e.konto.versuche}×/${this.e.konto.minuten} min`,
      ip: `${this.e.ip.versuche}×/${this.e.ip.minuten || 'dauerhaft'}`,
      ausnahmen: this.e.ausnahmen.join(' ') || '–',
      mail: this.e.mail ? 'täglich' : 'aus',
      mailKonto: this.e.mailKonto ? 'sofort' : 'aus',
    });
    return this.e;
  }

  /** Gerade gesperrte IPs (abgelaufene fallen heraus). */
  async gesperrt(): Promise<IpSperre[]> {
    return (await this.zustand.liste(IP_SPERRE))
      .map((x) => {
        const w = (x.wert ?? {}) as { seit?: string; grund?: string };
        return { ip: x.schluessel, seit: w.seit ?? '', bis: x.bis === null ? null : new Date(x.bis).toISOString(), grund: w.grund ?? '' };
      })
      .sort((a, b) => a.seit.localeCompare(b.seit));
  }

  async entsperre(ip: string, von: string): Promise<boolean> {
    const a = norm(ip);
    const war = (await this.zustand.loesche(IP_SPERRE, a)) > 0;
    await this.zustand.loesche(IP_ZAEHLER, a);
    await this.zustand.loesche(KONTO, `${a}|`, { praefix: true });
    if (war) log.info('IP-Adresse entsperrt', { ip: a, von });
    return war;
  }

  /** Vor der Anmeldung: wirft 429, wenn IP oder Konto gesperrt sind. */
  async pruefe(email: string, ip: string, o: { kontoBremse?: boolean } = {}) {
    await this.lade();
    const a = norm(ip);
    if (this.ausgenommen(a)) return;
    const zahl = this.jetzt();
    const s = await this.zustand.lies(IP_SPERRE, a);
    if (s)
      throw new Fachfehler(
        429,
        s.bis !== null
          ? t('meldungen.anmeldesperre.von-dieser-adresse-kamen', {
              wert: new Date(s.bis).toLocaleString(gebietsschema(), { timeStyle: 'short', dateStyle: 'short' }),
            })
          : t('meldungen.anmeldesperre.von-dieser-adresse-kamen-2'),
      );
    const k = await this.zustand.lies(KONTO, `${a}|${email}`);
    if (k && k.anzahl >= this.e.konto.versuche && k.bis !== null) {
      const min = Math.max(1, Math.ceil((k.bis - zahl) / MIN));
      throw new Fachfehler(429, t('meldungen.anmeldesperre.zu-viele-fehlversuche-bitte', { anzahl: min }));
    }
    const g = email && o.kontoBremse !== false ? await this.zustand.lies(KONTO_GESAMT_ART, email) : null;
    if (g && g.anzahl >= KONTO_GESAMT.versuche) throw this.gebremst(g.bis);
  }

  private gebremst(bis: number | null) {
    const min = Math.max(1, Math.ceil(((bis ?? this.jetzt() + KONTO_GESAMT.minuten * MIN) - this.jetzt()) / MIN));
    return new Fachfehler(429, t('meldungen.anmeldesperre.konto-gebremst', { anzahl: min }));
  }

  /**
   * Vor der Prüfung von Passwort oder Code (#956): den Versuch vorab als Fehlversuch zählen – atomar, bevor scrypt
   * oder der Code läuft. Vorher wurde erst nach der Prüfung gezählt; viele gleichzeitige Anfragen kamen so alle an der
   * Grenze vorbei. Wirft 429 wie `pruefe`. Stimmt alles, nimmt `erfolg` den Versuch zurück, sonst
   * `fehlschlag(…, versuch)` (zählt dann nicht noch einmal, sperrt aber wie bisher).
   */
  async versuch(email: string, ip: string): Promise<Versuch> {
    await this.pruefe(email, ip);
    const a = norm(ip);
    if (this.ausgenommen(a)) return { konto: 0, ip: 0, ausgenommen: true };
    const { anzahl: n, bis } = await this.zustand.zaehle(KONTO, `${a}|${email}`, this.e.konto.minuten * MIN, { gleitend: true });
    const { anzahl: m } = await this.zustand.zaehle(IP_ZAEHLER, a, (this.e.ip.minuten || 60) * MIN);
    if (n > this.e.konto.versuche || m > this.e.ip.versuche) {
      const min = Math.max(1, Math.ceil(((bis ?? this.jetzt()) - this.jetzt()) / MIN));
      throw new Fachfehler(
        429,
        t('meldungen.anmeldesperre.zu-viele-fehlversuche-bitte', { anzahl: n > this.e.konto.versuche ? min : this.e.ip.minuten || 60 }),
      );
    }
    // Je Konto über alle Adressen (#1295), festes Fenster.
    const g = email ? await this.zustand.zaehle(KONTO_GESAMT_ART, email, KONTO_GESAMT.minuten * MIN) : { anzahl: 0, bis: null };
    if (g.anzahl > KONTO_GESAMT.versuche) throw this.gebremst(g.bis);
    return { konto: n, ip: m, ausgenommen: false, gesamt: g.anzahl };
  }

  private heute() {
    return heuteIn(new Date(this.jetzt()));
  }

  /** Sperre für die tägliche Sammelmeldung vormerken – immer; ob gemeldet wird, entscheidet die Automatisierung (#678). */
  private async vormerken(m: Omit<Meldung, 'tag'>) {
    const t = this.jetzt();
    const tag = this.heute();
    // Je Sperre ein eigener Eintrag: Zwei Prozesse überschreiben sich so nie gegenseitig die Liste.
    await this.zustand.setze(
      MELDUNG,
      `${tag}|${String(t).padStart(15, '0')}|${randomUUID()}`,
      { tag, ...m } satisfies Meldung,
      t + MELDUNG_TAGE * TAG_MS,
    );
  }

  /**
   * Regelmäßig aufgerufen (#368): höchstens eine Sammelmeldung am Tag, über die Sperren vor heute.
   * Liefert true, wenn eine Mail verschickt wurde.
   */
  async meldeTaeglich(trocken = false): Promise<boolean> {
    await this.lade();
    if (!this.anAdmins) return false;
    const heute = this.heute();
    const alt = (await this.speicher.lies('anmeldesperre_meldung')) as Meldestand | null;
    if (alt?.zuletzt === heute || (await this.zustand.lies(SAMMEL, heute))) return false;
    const eintraege = (await this.zustand.liste(MELDUNG, '', MELDUNGEN_HOECHSTENS)).filter((x) => (x.wert as Meldung).tag < heute);
    // Vorgemerkt vor 0.196 (#744): noch in den Einstellungen.
    const frueher = (alt?.offen ?? []).filter((m) => m.tag < heute);
    const faellig = [...frueher, ...eintraege.map((x) => x.wert as Meldung)];
    if (!faellig.length) return false;
    if (trocken) return true;
    // Nur ein Prozess meldet den Tag (#744).
    if (!(await this.zustand.belege(SAMMEL, heute, 2 * TAG_MS))) return false;
    for (const x of eintraege) await this.zustand.loesche(MELDUNG, x.schluessel);
    if (alt?.offen?.length)
      await this.speicher.schreibe('anmeldesperre_meldung', {
        offen: alt.offen.filter((m) => m.tag >= heute),
        zuletzt: heute,
      } satisfies Meldestand);
    await this.anAdmins(
      () => sammelText(faellig).betreff,
      () => sammelText(faellig).text,
    ).catch((e) => log.warn('Sammelmeldung Anmeldeschutz nicht verschickt', { fehler: (e as Error).message }));
    return true;
  }

  /**
   * Nach einem falschen Passwort: zählen und gegebenenfalls sperren. `bekannt`: Die E-Mail-Adresse
   * gehört zu einem bestehenden Benutzerkonto (nur dann kommt die Sofortmeldung, #368).
   */
  async fehlschlag(email: string, ip: string, bekannt = false, v?: Versuch) {
    await this.lade();
    const a = norm(ip);
    // Nachweise (#1053): jede Fehlanmeldung, auch aus Ausnahmen – Konto nur, wenn es das Konto gibt; Adresse gekürzt.
    void fehlanmeldung(email, a, bekannt);
    if (v?.ausgenommen || this.ausgenommen(a)) return;
    const zahl = this.jetzt();
    // Atomar gezählt (#744): Jeder Fehlversuch schiebt das Ende der Kontosperre hinaus (wie bisher). Mit `versuch`
    // (#956) ist er schon gezählt.
    const n = v ? v.konto : (await this.zustand.zaehle(KONTO, `${a}|${email}`, this.e.konto.minuten * MIN, { gleitend: true })).anzahl;
    if (n === this.e.konto.versuche) {
      log.warn('Anmeldung gesperrt (Konto und IP)', { email, ip: a, versuche: n, minuten: this.e.konto.minuten });
      if (bekannt) await this.kontoGesperrt(email, a, n);
    }
    await this.kontoBremse(email, a, bekannt, v);
    // Je IP über alle Adressen; das Zählfenster ist die Sperrdauer (bei „dauerhaft“ eine Stunde), festes Fenster.
    const fenster = (this.e.ip.minuten || 60) * MIN;
    const m = v ? v.ip : (await this.zustand.zaehle(IP_ZAEHLER, a, fenster)).anzahl;
    if (m < this.e.ip.versuche) return;
    const grund = t('meldungen.anmeldesperre.fehlgeschlagene-anmeldungen-zuletzt', {
      m,
      wert: email || t('meldungen.anmeldesperre.ohne-e-mail-adresse'),
    });
    // Nur einer legt die Sperre an (auch bei gleichzeitigen Anfragen in mehreren Prozessen).
    if (
      !(await this.zustand.belege(IP_SPERRE, a, this.e.ip.minuten ? this.e.ip.minuten * MIN : null, {
        seit: new Date(zahl).toISOString(),
        grund,
      }))
    )
      return;
    await this.zustand.loesche(IP_ZAEHLER, a);
    log.warn('IP-Adresse gesperrt', {
      ip: a,
      versuche: m,
      bis: this.e.ip.minuten ? new Date(zahl + this.e.ip.minuten * MIN).toISOString() : 'bis entsperrt',
    });
    await this.vormerken({ art: 'ip', wer: a, versuche: m });
  }

  /** Bremse je Konto (#1295): mitzählen (falls nicht schon mit `versuch`) und einmal melden, wenn die Grenze erreicht ist. */
  private async kontoBremse(email: string, a: string, bekannt: boolean, v?: Versuch) {
    if (!email) return;
    const g = v ? (v.gesamt ?? 0) : (await this.zustand.zaehle(KONTO_GESAMT_ART, email, KONTO_GESAMT.minuten * MIN)).anzahl;
    if (g !== KONTO_GESAMT.versuche) return;
    log.warn('Anmeldung für ein Konto gebremst (Fehlversuche von mehreren Adressen)', {
      email,
      versuche: g,
      minuten: KONTO_GESAMT.minuten,
    });
    if (bekannt) await this.kontoGesperrt(email, a, g);
  }

  /** Ein bestehendes Konto wurde gesperrt: vormerken und – falls gewünscht – sofort melden, je Konto höchstens einmal am Tag. */
  private async kontoGesperrt(email: string, ip: string, versuche: number) {
    await this.vormerken({ art: 'konto', wer: email, versuche });
    // Ereigniskatalog (#670): „Benutzerkonto gesperrt“ – jede Sperre, unabhängig von der Sofortmeldung.
    try {
      await this.beiKontosperre?.({ email, ip, versuche, bis: new Date(this.jetzt() + this.e.konto.minuten * MIN).toISOString() });
    } catch (e) {
      log.warn('Ereignis zur Kontosperre nicht gespeichert', { fehler: (e as Error).message });
    }
    // Die Sofortmeldung macht seit #678 die Automatisierung „Kontosperre melden“ (Paket „Benachrichtigungen“).
  }

  /**
   * Dann-Karte „Kontosperre an Administratoren melden“ (#678): Mail wie bisher die Sofortmeldung (#368), je Konto
   * höchstens einmal am Tag. Liefert false, wenn heute zu diesem Konto schon gemeldet wurde oder niemand da ist.
   */
  async kontoMelden(email: string, ip: string, versuche: number, trocken = false): Promise<boolean> {
    await this.lade();
    if (!this.anAdmins) return false;
    const heute = this.heute();
    const schluessel = `${heute}|${email}`;
    if (trocken) return !(await this.zustand.lies(SOFORT, schluessel));
    if (!(await this.zustand.belege(SOFORT, schluessel, 2 * TAG_MS))) return false;
    await this.anAdmins(
      () => t('meldungen.anmeldesperre.ablago-benutzerkonto-nach'),
      () => t('meldungen.anmeldesperre.fuer-kamen-von-falsche', { anzahl: this.e.konto.minuten, email, ip, versuche }),
    );
    return true;
  }

  /** Nach erfolgreicher Anmeldung: Zähler für Konto und IP zurücksetzen. */
  async erfolg(email: string, ip: string, v?: Versuch) {
    const a = norm(ip);
    await this.zustand.loesche(KONTO, `${a}|${email}`);
    await this.zustand.loesche(IP_ZAEHLER, a);
    // Die Bremse je Konto bleibt (sonst setzte jede eigene Anmeldung den Zähler eines Angreifers zurück); nur der eben
    // mit `versuch` vorab gezählte Versuch (#956) zählt nicht. Ohne `v` (z. B. WebDAV) wurde nichts vorab gezählt.
    if (email && v?.gesamt) await this.zustand.erhoehe(KONTO_GESAMT_ART, email, -1);
  }
}
