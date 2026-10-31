import { BlockList, isIP } from 'node:net';
import type { Einstellungen } from './einstellungen';
import { speicherEinstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';

/**
 * Anmeldeschutz (#240): nach zu vielen Fehlversuchen sperren – je E-Mail-Adresse und IP (wie bisher)
 * und zusätzlich je IP über alle Adressen, wahlweise dauerhaft bis zum Entsperren. Werte in der
 * Werkbank einstellbar, Sperren in der Datenbank (überstehen einen Neustart), Ausnahmen für eigene Netze.
 */

export interface Grenze { versuche: number; /** 0 = dauerhaft, bis entsperrt (nur IP). */ minuten: number }
export interface SperrEinstellung { konto: Grenze; ip: Grenze; ausnahmen: string[]; mail: boolean }
export const SPERRE_STANDARD: SperrEinstellung = { konto: { versuche: 5, minuten: 1 }, ip: { versuche: 30, minuten: 60 }, ausnahmen: [], mail: true };

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
  };
}

export class Anmeldesperre {
  private konten = new Map<string, Zaehler>();
  private ipZaehler = new Map<string, Zaehler>();
  private ips: IpSperre[] = [];
  private geladen = false;
  private e: SperrEinstellung = SPERRE_STANDARD;
  private ausnahmen = liste([]);

  constructor(private speicher: Einstellungen = speicherEinstellungen(), private anAdmins?: (betreff: string, text: string) => Promise<void>, private jetzt: () => number = Date.now) {}

  private async lade() {
    if (this.geladen) return;
    this.e = { ...SPERRE_STANDARD, ...((await this.speicher.lies('anmeldesperre')) as Partial<SperrEinstellung> | null ?? {}) };
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
    this.e = pruefeSperrEinstellung(x, this.e);
    this.ausnahmen = liste(this.e.ausnahmen);
    await this.speicher.schreibe('anmeldesperre', this.e);
    log.info('Anmeldeschutz eingestellt', { von, konto: `${this.e.konto.versuche}×/${this.e.konto.minuten} min`, ip: `${this.e.ip.versuche}×/${this.e.ip.minuten || 'dauerhaft'}`, ausnahmen: this.e.ausnahmen.join(' ') || '–' });
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

  /** Nach einem falschen Passwort: zählen und gegebenenfalls sperren. */
  async fehlschlag(email: string, ip: string) {
    await this.lade();
    const a = norm(ip);
    if (this.ausgenommen(a)) return;
    const t = this.jetzt();
    const key = `${email}|${a}`;
    const k = this.konten.get(key);
    const n = (k && k.bis > t ? k.anzahl : 0) + 1;
    this.konten.set(key, { anzahl: n, bis: t + this.e.konto.minuten * MIN });
    if (n === this.e.konto.versuche) { log.warn('Anmeldung gesperrt (Konto und IP)', { email, ip: a, versuche: n, minuten: this.e.konto.minuten }); await this.sichere(); }
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
      if (this.e.mail) await this.anAdmins?.('DMS: IP-Adresse nach Fehlversuchen gesperrt', `Von ${a} kamen ${m} fehlgeschlagene Anmeldungen. Die Adresse ist ${sperre.bis ? `bis ${new Date(sperre.bis).toLocaleString('de-DE')}` : 'gesperrt, bis ein Administrator sie freigibt'}.\n\nEntsperren: Werkbank → Anmeldeschutz.`).catch(() => {});
    }
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
