import { BlockList, isIP } from 'node:net';
import { heuteIn } from '../../shared/src/sichten';
import type { Einstellungen } from './einstellungen';
import { speicherEinstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';

/**
 * Anmeldeschutz (#240): nach zu vielen Fehlversuchen sperren – je E-Mail-Adresse und IP (wie bisher)
 * und zusätzlich je IP über alle Adressen, wahlweise dauerhaft bis zum Entsperren. Werte in der
 * Werkbank einstellbar, Sperren in der Datenbank (überstehen einen Neustart), Ausnahmen für eigene Netze.
 *
 * Mails (#368): Angriffsversuche aus dem Internet sind normal, darum im Standard keine Mail. Eingeschaltet
 * kommt höchstens eine Sammelmeldung am Tag (über die Sperren des Vortags), wahlweise zusätzlich sofort
 * eine Mail, wenn ein bestehendes Benutzerkonto gesperrt wird (je Konto höchstens einmal am Tag).
 */

export interface Grenze { versuche: number; /** 0 = dauerhaft, bis entsperrt (nur IP). */ minuten: number }
export interface SperrEinstellung {
  konto: Grenze; ip: Grenze; ausnahmen: string[];
  /** Tägliche Sammelmeldung über die Sperren (#368; bis 0.84.7 eine Mail je gesperrter IP, im Standard an). */
  mail: boolean;
  /** Zusätzlich sofort melden, wenn ein bestehendes Benutzerkonto gesperrt wird (#368). */
  mailKonto: boolean;
}
export const SPERRE_STANDARD: SperrEinstellung = { konto: { versuche: 5, minuten: 1 }, ip: { versuche: 30, minuten: 60 }, ausnahmen: [], mail: false, mailKonto: false };

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
  return { e: { ...SPERRE_STANDARD, ...rest, mail: gewaehlt ? rest.mail === true : SPERRE_STANDARD.mail, mailKonto: rest.mailKonto === true }, mailGewaehlt: gewaehlt };
}

/** Eine Sperre für die Sammelmeldung; `tag` als JJJJ-MM-TT (Europe/Berlin). */
export interface Meldung { tag: string; art: 'ip' | 'konto'; wer: string; versuche: number }
interface Meldestand { offen: Meldung[]; zuletzt?: string }
const MELDUNGEN_HOECHSTENS = 2000;

const datum = (tag: string) => tag.split('-').reverse().join('.');

/** Text der Sammelmeldung über die Sperren vor heute (#368). */
export function sammelText(meldungen: Meldung[]): { betreff: string; text: string } {
  const tage = [...new Set(meldungen.map((m) => m.tag))].sort();
  const zeitraum = tage.length === 1 ? `Am ${datum(tage[0])}` : `Vom ${datum(tage[0])} bis ${datum(tage[tage.length - 1])}`;
  const ips = meldungen.filter((m) => m.art === 'ip');
  const konten = meldungen.filter((m) => m.art === 'konto');
  const teile: string[] = [];
  if (ips.length) teile.push(ips.length === 1 ? 'eine IP-Adresse' : `${ips.length} IP-Adressen`);
  const kontenAnzahl = new Set(konten.map((m) => m.wer)).size;
  if (kontenAnzahl) teile.push(kontenAnzahl === 1 ? 'ein Benutzerkonto' : `${kontenAnzahl} Benutzerkonten`);
  const zeilen = [`${zeitraum} hat der Anmeldeschutz ${teile.join(' und ')} nach Fehlversuchen gesperrt.`, '', 'Angriffsversuche aus dem Internet sind normal; die Sperren passieren automatisch. Du musst nichts tun, solange du keine eigenen Adressen darunter findest.'];
  if (ips.length) {
    const top = [...ips].sort((a, b) => b.versuche - a.versuche).slice(0, 5);
    zeilen.push('', ips.length > 5 ? 'Die fünf mit den meisten Fehlversuchen:' : 'Gesperrte Adressen:', ...top.map((m) => `- ${m.wer}: ${m.versuche} Fehlversuche (${datum(m.tag)})`));
  }
  if (konten.length) {
    const je = new Map<string, number>();
    for (const m of konten) je.set(m.wer, (je.get(m.wer) ?? 0) + 1);
    zeilen.push('', 'Gesperrte Benutzerkonten (je E-Mail-Adresse und IP):', ...[...je].slice(0, 10).map(([wer, n]) => `- ${wer}${n > 1 ? ` (${n}×)` : ''}`));
  }
  zeilen.push('', 'Gesperrte Adressen entsperren: Werkbank → Anmeldeschutz.');
  return { betreff: `DMS: Anmeldeschutz – ${teile.join(' und ')} gesperrt`, text: zeilen.join('\n') };
}

export interface IpSperre { ip: string; seit: string; bis: string | null; grund: string }
interface Zaehler { anzahl: number; bis: number }
interface Gespeichert { ips: IpSperre[]; konten: Record<string, Zaehler> }

const log = protokoll.modul('konto');
const MIN = 60_000;

/** IPv4 in IPv6 (::ffff:1.2.3.4) wie IPv4 behandeln. */
const norm = (ip: string) => ip.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1').trim();

/** Ausnahmen prüfen: einzelne Adressen oder Netze wie 192.168.0.0/16. */
export function pruefeAusnahmen(liste: unknown): string[] {
  const roh = Array.isArray(liste) ? liste : String(liste ?? '').split(/[\s,;]+/);
  const aus = roh.map((x) => String(x).trim()).filter(Boolean);
  const schlecht = aus.filter((x) => { const [a, p] = x.split('/'); const f = isIP(a); return !f || (p !== undefined && !(Number.isInteger(Number(p)) && Number(p) >= 0 && Number(p) <= (f === 4 ? 32 : 128))); });
  if (schlecht.length) throw new Fachfehler(422, `Ausnahmen: ${schlecht.join(', ')} ist keine IP-Adresse und kein Netz wie 192.168.0.0/16.`);
  return aus.slice(0, 50);
}

function liste(ausnahmen: string[]) {
  const b = new BlockList();
  for (const x of ausnahmen) {
    const [a, p] = x.split('/');
    const typ = isIP(a) === 6 ? 'ipv6' : 'ipv4';
    if (p !== undefined) b.addSubnet(a, Number(p), typ); else b.addAddress(a, typ);
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
    if (!Number.isInteger(minuten) || minuten < (dauerhaft ? 0 : 1) || minuten > 525_600) throw new Fachfehler(422, `${name}: Sperrdauer ${dauerhaft ? '0 (dauerhaft) ' : '1 '}bis 525.600 Minuten.`);
    return { versuche, minuten };
  };
  return {
    konto: grenze(o.konto, alt.konto, 'Je Konto und IP', false),
    ip: grenze(o.ip, alt.ip, 'Je IP', true),
    ausnahmen: o.ausnahmen === undefined ? alt.ausnahmen : pruefeAusnahmen(o.ausnahmen),
    mail: o.mail === undefined ? alt.mail : o.mail === true,
    mailKonto: o.mailKonto === undefined ? alt.mailKonto : o.mailKonto === true,
  };
}

export class Anmeldesperre {
  private konten = new Map<string, Zaehler>();
  private ipZaehler = new Map<string, Zaehler>();
  private ips: IpSperre[] = [];
  private geladen = false;
  private e: SperrEinstellung = SPERRE_STANDARD;
  private mailGewaehlt = false;
  private ausnahmen = liste([]);
  /** Sofortmeldungen je Konto: E-Mail-Adresse → Tag der letzten Mail. */
  private sofortGemeldet = new Map<string, string>();

  constructor(private speicher: Einstellungen = speicherEinstellungen(), private anAdmins?: (betreff: string, text: string) => Promise<void>, private jetzt: () => number = Date.now) {}

  private async lade() {
    if (this.geladen) return;
    ({ e: this.e, mailGewaehlt: this.mailGewaehlt } = leseSperrEinstellung(await this.speicher.lies('anmeldesperre')));
    this.ausnahmen = liste(this.e.ausnahmen);
    const g = (await this.speicher.lies('anmeldesperren')) as Gespeichert | null;
    this.ips = g?.ips ?? [];
    this.konten = new Map(Object.entries(g?.konten ?? {}));
    this.geladen = true;
  }
  private async sichere() {
    const t = this.jetzt();
    this.ips = this.ips.filter((s) => s.bis === null || Date.parse(s.bis) > t);
    const gesperrteKonten = Object.fromEntries([...this.konten].filter(([, z]) => z.anzahl >= this.e.konto.versuche && z.bis > t));
    await this.speicher.schreibe('anmeldesperren', { ips: this.ips, konten: gesperrteKonten } satisfies Gespeichert);
  }

  private ausgenommen(ip: string) {
    const a = norm(ip);
    const f = isIP(a);
    return !!f && this.ausnahmen.check(a, f === 6 ? 'ipv6' : 'ipv4');
  }

  async einstellung(): Promise<SperrEinstellung> { await this.lade(); return this.e; }
  async speichere(x: unknown, von: string): Promise<SperrEinstellung> {
    await this.lade();
    const vorher = this.e.mail;
    this.e = pruefeSperrEinstellung(x, this.e);
    this.ausnahmen = liste(this.e.ausnahmen);
    // Nur ein umgelegter Schalter zählt als eigene Wahl; wer den Standard bloß mitspeichert, behält den Standard (#368).
    if (this.e.mail !== vorher) this.mailGewaehlt = true;
    const wert: GespeicherteEinstellung = this.mailGewaehlt ? { ...this.e, mailGewaehlt: true } : { ...this.e };
    await this.speicher.schreibe('anmeldesperre', wert);
    if (!this.e.mail) await this.speicher.schreibe('anmeldesperre_meldung', null);
    log.info('Anmeldeschutz eingestellt', { von, konto: `${this.e.konto.versuche}×/${this.e.konto.minuten} min`, ip: `${this.e.ip.versuche}×/${this.e.ip.minuten || 'dauerhaft'}`, ausnahmen: this.e.ausnahmen.join(' ') || '–', mail: this.e.mail ? 'täglich' : 'aus', mailKonto: this.e.mailKonto ? 'sofort' : 'aus' });
    return this.e;
  }

  /** Gerade gesperrte IPs (abgelaufene fallen heraus). */
  async gesperrt(): Promise<IpSperre[]> {
    await this.lade();
    const t = this.jetzt();
    return this.ips.filter((s) => s.bis === null || Date.parse(s.bis) > t);
  }

  async entsperre(ip: string, von: string): Promise<boolean> {
    await this.lade();
    const a = norm(ip);
    const vorher = this.ips.length;
    this.ips = this.ips.filter((s) => s.ip !== a);
    this.ipZaehler.delete(a);
    for (const k of [...this.konten.keys()]) if (k.endsWith(`|${a}`)) this.konten.delete(k);
    await this.sichere();
    if (this.ips.length < vorher) log.info('IP-Adresse entsperrt', { ip: a, von });
    return this.ips.length < vorher;
  }

  /** Vor der Anmeldung: wirft 429, wenn IP oder Konto gesperrt sind. */
  async pruefe(email: string, ip: string) {
    await this.lade();
    const a = norm(ip);
    if (this.ausgenommen(a)) return;
    const t = this.jetzt();
    const s = this.ips.find((x) => x.ip === a && (x.bis === null || Date.parse(x.bis) > t));
    if (s) throw new Fachfehler(429, s.bis ? `Von dieser Adresse kamen zu viele fehlgeschlagene Anmeldungen. Gesperrt bis ${new Date(s.bis).toLocaleString('de-DE', { timeStyle: 'short', dateStyle: 'short' })}.` : 'Von dieser Adresse kamen zu viele fehlgeschlagene Anmeldungen. Sie ist gesperrt, bis ein Administrator sie freigibt.');
    const k = this.konten.get(`${email}|${a}`);
    if (k && k.anzahl >= this.e.konto.versuche && k.bis > t) {
      const min = Math.max(1, Math.ceil((k.bis - t) / MIN));
      throw new Fachfehler(429, `Zu viele Fehlversuche. Bitte in ${min === 1 ? 'einer Minute' : `${min} Minuten`} erneut versuchen.`);
    }
  }

  private heute() { return heuteIn(new Date(this.jetzt())); }

  /** Sperre für die tägliche Sammelmeldung vormerken (nur bei eingeschalteter Mail). */
  private async vormerken(m: Omit<Meldung, 'tag'>) {
    if (!this.e.mail) return;
    const s = ((await this.speicher.lies('anmeldesperre_meldung')) as Meldestand | null) ?? { offen: [] };
    s.offen = [...s.offen, { tag: this.heute(), ...m }].slice(-MELDUNGEN_HOECHSTENS);
    await this.speicher.schreibe('anmeldesperre_meldung', s);
  }

  /**
   * Regelmäßig aufgerufen (#368): höchstens eine Sammelmeldung am Tag, über die Sperren vor heute.
   * Liefert true, wenn eine Mail verschickt wurde.
   */
  async meldeTaeglich(): Promise<boolean> {
    await this.lade();
    if (!this.e.mail || !this.anAdmins) return false;
    const s = (await this.speicher.lies('anmeldesperre_meldung')) as Meldestand | null;
    const heute = this.heute();
    if (!s || s.zuletzt === heute) return false;
    const faellig = s.offen.filter((m) => m.tag < heute);
    if (!faellig.length) return false;
    await this.speicher.schreibe('anmeldesperre_meldung', { offen: s.offen.filter((m) => m.tag >= heute), zuletzt: heute } satisfies Meldestand);
    const { betreff, text } = sammelText(faellig);
    await this.anAdmins(betreff, text).catch((e) => log.warn('Sammelmeldung Anmeldeschutz nicht verschickt', { fehler: (e as Error).message }));
    return true;
  }

  /**
   * Nach einem falschen Passwort: zählen und gegebenenfalls sperren. `bekannt`: Die E-Mail-Adresse
   * gehört zu einem bestehenden Benutzerkonto (nur dann kommt die Sofortmeldung, #368).
   */
  async fehlschlag(email: string, ip: string, bekannt = false) {
    await this.lade();
    const a = norm(ip);
    if (this.ausgenommen(a)) return;
    const t = this.jetzt();
    const key = `${email}|${a}`;
    const k = this.konten.get(key);
    const n = (k && k.bis > t ? k.anzahl : 0) + 1;
    this.konten.set(key, { anzahl: n, bis: t + this.e.konto.minuten * MIN });
    if (n === this.e.konto.versuche) {
      log.warn('Anmeldung gesperrt (Konto und IP)', { email, ip: a, versuche: n, minuten: this.e.konto.minuten });
      await this.sichere();
      if (bekannt) await this.kontoGesperrt(email, a, n);
    }
    // Je IP über alle Adressen; das Zählfenster ist die Sperrdauer (bei „dauerhaft“ eine Stunde).
    const fenster = (this.e.ip.minuten || 60) * MIN;
    const z = this.ipZaehler.get(a);
    const m = (z && z.bis > t ? z.anzahl : 0) + 1;
    this.ipZaehler.set(a, { anzahl: m, bis: z && z.bis > t ? z.bis : t + fenster });
    if (m >= this.e.ip.versuche && !this.ips.some((s) => s.ip === a)) {
      const sperre: IpSperre = { ip: a, seit: new Date(t).toISOString(), bis: this.e.ip.minuten ? new Date(t + this.e.ip.minuten * MIN).toISOString() : null, grund: `${m} fehlgeschlagene Anmeldungen (zuletzt ${email || 'ohne E-Mail-Adresse'})` };
      this.ips.push(sperre);
      this.ipZaehler.delete(a);
      await this.sichere();
      log.warn('IP-Adresse gesperrt', { ip: a, versuche: m, bis: sperre.bis ?? 'bis entsperrt' });
      await this.vormerken({ art: 'ip', wer: a, versuche: m });
    }
  }

  /** Ein bestehendes Konto wurde gesperrt: vormerken und – falls gewünscht – sofort melden, je Konto höchstens einmal am Tag. */
  private async kontoGesperrt(email: string, ip: string, versuche: number) {
    await this.vormerken({ art: 'konto', wer: email, versuche });
    if (!this.e.mailKonto || !this.anAdmins) return;
    const heute = this.heute();
    if (this.sofortGemeldet.get(email) === heute) return;
    this.sofortGemeldet.set(email, heute);
    await this.anAdmins('DMS: Benutzerkonto nach Fehlversuchen gesperrt', `Für ${email} kamen von ${ip} ${versuche} falsche Passwörter hintereinander. Die Anmeldung von dieser Adresse ist für ${this.e.konto.minuten === 1 ? 'eine Minute' : `${this.e.konto.minuten} Minuten`} gesperrt.\n\nWar das nicht der Benutzer selbst, versucht jemand, das Passwort zu erraten. Heute kommt zu diesem Konto keine weitere Sofortmeldung.\n\nEinstellungen: Werkbank → Anmeldeschutz.`).catch((e) => log.warn('Meldung zur Kontosperre nicht verschickt', { fehler: (e as Error).message }));
  }

  /** Nach erfolgreicher Anmeldung: Zähler für Konto und IP zurücksetzen. */
  async erfolg(email: string, ip: string) {
    await this.lade();
    const a = norm(ip);
    const hatte = this.konten.delete(`${email}|${a}`);
    this.ipZaehler.delete(a);
    if (hatte) await this.sichere();
  }
}
