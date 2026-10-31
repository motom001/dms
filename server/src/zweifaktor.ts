import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Rolle } from '../../shared/src/model';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';

/**
 * Zwei-Faktor-Anmeldung (#242): TOTP (Authenticator-App, RFC 6238) und Wiederherstellungscodes.
 * Das Geheimnis liegt verschlüsselt mit dem Schlüssel des DMS in den Einstellungen – damit auch in
 * der Sicherung, und ein Schlüsselwechsel schlüsselt es mit um. Wiederherstellungscodes nur als Prüfwert.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(b: Buffer): string {
  let bits = 0, wert = 0, aus = '';
  for (const byte of b) {
    wert = (wert << 8) | byte; bits += 8;
    while (bits >= 5) { aus += B32[(wert >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) aus += B32[(wert << (5 - bits)) & 31];
  return aus;
}
export function ausBase32(s: string): Buffer {
  const t = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, wert = 0;
  const aus: number[] = [];
  for (const c of t) {
    wert = (wert << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { aus.push((wert >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(aus);
}

/** Sechsstelliger Code für einen Zeitschritt (30 Sekunden, HMAC-SHA1). */
export function totp(geheimnis: Buffer, schritt: number): string {
  const z = Buffer.alloc(8);
  z.writeBigUInt64BE(BigInt(schritt));
  const h = createHmac('sha1', geheimnis).update(z).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

const SCHRITT_MS = 30_000;
const hash = (s: string) => createHash('sha256').update(s.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
const gleich = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const log = protokoll.modul('konto');

interface Gespeichert { geheimnis: string; seit: string; letzterSchritt: number; codes: string[] }
export interface ZweifaktorStatus { aktiv: boolean; seit: string | null; codesUebrig: number }
export type Pflicht = Record<Rolle, boolean>;

export class Zweifaktor {
  private entwuerfe = new Map<string, { geheimnis: Buffer; bis: number }>();
  private cache = new Map<string, boolean>();

  constructor(private speicher: Einstellungen, private verschluessele: (k: string) => string, private entschluessele: (w: string) => string | null, private jetzt: () => number = Date.now) {}

  private async lies(id: string) { return (await this.speicher.lies(`zweifaktor_${id}`)) as Gespeichert | null; }
  private async schreibe(id: string, g: Gespeichert | null) { await this.speicher.schreibe(`zweifaktor_${id}`, g); this.cache.set(id, !!g); }

  async aktiv(id: string): Promise<boolean> {
    if (!this.cache.has(id)) this.cache.set(id, !!(await this.lies(id)));
    return this.cache.get(id)!;
  }

  async status(id: string): Promise<ZweifaktorStatus> {
    const g = await this.lies(id);
    return { aktiv: !!g, seit: g?.seit ?? null, codesUebrig: g?.codes.filter(Boolean).length ?? 0 };
  }

  async pflicht(): Promise<Pflicht> { return { admin: false, mitglied: false, ...((await this.speicher.lies('zweifaktor_pflicht')) as Partial<Pflicht> | null ?? {}) }; }
  async setzePflicht(x: unknown, von: string): Promise<Pflicht> {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const alt = await this.pflicht();
    const neu: Pflicht = { admin: o.admin === undefined ? alt.admin : o.admin === true, mitglied: o.mitglied === undefined ? alt.mitglied : o.mitglied === true };
    await this.speicher.schreibe('zweifaktor_pflicht', neu);
    log.info('Pflicht zur Zwei-Faktor-Anmeldung geändert', { von, ...neu });
    return neu;
  }
  /** Muss dieser Benutzer die Zwei-Faktor-Anmeldung noch einrichten? */
  async fehlt(b: { id: string; rolle: Rolle }): Promise<boolean> { return (await this.pflicht())[b.rolle] && !(await this.aktiv(b.id)); }

  /** Einrichten, Schritt 1: neues Geheimnis (noch nicht gespeichert) und Adresse für den QR-Code. */
  beginne(b: { id: string; email: string }, aussteller = 'DMS') {
    const geheimnis = randomBytes(20);
    this.entwuerfe.set(b.id, { geheimnis, bis: this.jetzt() + 10 * 60_000 });
    const g = base32(geheimnis);
    const label = encodeURIComponent(`${aussteller}:${b.email}`);
    return { geheimnis: g.replace(/(.{4})/g, '$1 ').trim(), uri: `otpauth://totp/${label}?secret=${g}&issuer=${encodeURIComponent(aussteller)}&algorithm=SHA1&digits=6&period=30` };
  }

  /** Einrichten, Schritt 2: Code aus der App bestätigt das Geheimnis; liefert die Wiederherstellungscodes (einmalig). */
  async bestaetige(id: string, code: unknown, von: string): Promise<string[]> {
    const e = this.entwuerfe.get(id);
    if (!e || e.bis < this.jetzt()) throw new Fachfehler(409, 'Bitte die Einrichtung neu beginnen (nach 10 Minuten verfällt der QR-Code).');
    const schritt = this.passt(e.geheimnis, String(code ?? ''), -1);
    if (schritt === null) throw new Fachfehler(422, 'Der Code stimmt nicht. Uhrzeit von Handy und DMS prüfen und den aktuellen Code eingeben.');
    const codes = neueCodes();
    await this.schreibe(id, { geheimnis: this.verschluessele(base32(e.geheimnis)), seit: new Date(this.jetzt()).toISOString(), letzterSchritt: schritt, codes: codes.map(hash) });
    this.entwuerfe.delete(id);
    log.info('Zwei-Faktor-Anmeldung eingerichtet', { benutzer: id, von });
    return codes;
  }

  /** Zeitschritt, wenn der Code passt (±1 Schritt, nicht schon benutzt), sonst null. */
  private passt(geheimnis: Buffer, code: string, letzter: number): number | null {
    const c = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(c)) return null;
    const jetzt = Math.floor(this.jetzt() / SCHRITT_MS);
    for (const s of [jetzt, jetzt - 1, jetzt + 1]) if (s > letzter && gleich(totp(geheimnis, s), c)) return s;
    return null;
  }

  /** Code bei der Anmeldung: TOTP oder Wiederherstellungscode (wird verbraucht). */
  async pruefe(id: string, code: unknown): Promise<'totp' | 'wiederherstellung' | null> {
    const g = await this.lies(id);
    if (!g) return null;
    const c = String(code ?? '').trim();
    const klar = this.entschluessele(g.geheimnis);
    if (klar) {
      const s = this.passt(ausBase32(klar), c, g.letzterSchritt);
      if (s !== null) { await this.schreibe(id, { ...g, letzterSchritt: s }); return 'totp'; }
    }
    const h = hash(c);
    const i = g.codes.findIndex((x) => x && gleich(x, h));
    if (i >= 0 && c.replace(/[^A-Za-z0-9]/g, '').length >= 8) {
      const codes = [...g.codes]; codes[i] = '';
      await this.schreibe(id, { ...g, codes });
      log.warn('Mit Wiederherstellungscode angemeldet', { benutzer: id, uebrig: codes.filter(Boolean).length });
      return 'wiederherstellung';
    }
    return null;
  }

  async neueCodes(id: string, von: string): Promise<string[]> {
    const g = await this.lies(id);
    if (!g) throw new Fachfehler(409, 'Die Zwei-Faktor-Anmeldung ist nicht eingerichtet.');
    const codes = neueCodes();
    await this.schreibe(id, { ...g, codes: codes.map(hash) });
    log.info('Neue Wiederherstellungscodes', { benutzer: id, von });
    return codes;
  }

  async entferne(id: string, von: string) {
    if (!(await this.lies(id))) return false;
    await this.schreibe(id, null);
    log.warn('Zwei-Faktor-Anmeldung entfernt', { benutzer: id, von });
    return true;
  }
}

/** Zehn Einmalcodes wie „K7PX-3MNA-Q9“ (ohne verwechselbare Zeichen). */
function neueCodes(): string[] {
  const z = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => {
    const b = randomBytes(10);
    const s = [...b].map((x) => z[x % z.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 10)}`;
  });
}
