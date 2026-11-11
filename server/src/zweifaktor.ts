import { darfVerwalten } from '../../shared/src/verwaltungsrecht';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Rolle } from '../../shared/src/model';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import { protokoll } from './protokoll';
import { t } from './sprache';

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

/** Für die Pflicht zählt das Verwaltungsrecht (#818): Pflicht „admin“ gilt für alle, die verwalten dürfen. */
export type PflichtPerson = { id: string; verwaltung?: string[]; art?: string };
export const pflichtRolle = (b: PflichtPerson): Rolle => (darfVerwalten(b) ? 'admin' : 'mitglied');

/**
 * Eine Anmeldeart je Rolle vorschreiben (#242, #416, seit #811 auch für Passkeys): Schalter je Rolle unter `schluessel`,
 * seit wann je Rolle unter `<schluessel>_seit`. Die Pflicht gilt erst für Sitzungen, die nach dem Einschalten beginnen.
 */
export class RollenPflicht {
  constructor(private speicher: Einstellungen, private schluessel: string, private logText: string, private jetzt: () => number = Date.now) {}

  async pflicht(): Promise<Pflicht> { return { admin: false, mitglied: false, ...((await this.speicher.lies(this.schluessel)) as Partial<Pflicht> | null ?? {}) }; }
  /** Seit wann die Pflicht je Rolle gilt (#416); fehlt der Zeitpunkt (eingeschaltet vor 0.91.1), gilt sie für alle Sitzungen. */
  private async seit(): Promise<Partial<Record<Rolle, string>>> { return ((await this.speicher.lies(`${this.schluessel}_seit`)) as Partial<Record<Rolle, string>> | null) ?? {}; }
  async setze(x: unknown, von: string): Promise<Pflicht> {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const alt = await this.pflicht();
    const neu: Pflicht = { admin: o.admin === undefined ? alt.admin : o.admin === true, mitglied: o.mitglied === undefined ? alt.mitglied : o.mitglied === true };
    // #416: Die Pflicht gilt erst für Sitzungen, die nach dem Einschalten beginnen – laufende arbeiten weiter.
    const seit = await this.seit();
    const jetzt = new Date(this.jetzt()).toISOString();
    for (const r of ['admin', 'mitglied'] as const) {
      if (neu[r] && !alt[r]) seit[r] = jetzt;
      if (!neu[r]) delete seit[r];
    }
    await this.speicher.schreibe(`${this.schluessel}_seit`, seit);
    await this.speicher.schreibe(this.schluessel, neu);
    log.info(this.logText, { von, ...neu });
    return neu;
  }
  /** 'fehlt', 'ausstehend' oder 'ok' – siehe `Zweifaktor.lage`; `eingerichtet` fragt erst, wenn die Pflicht gilt. */
  async lage(b: PflichtPerson, sitzungSeit: Date | undefined, eingerichtet: () => Promise<boolean>): Promise<'ok' | 'ausstehend' | 'fehlt'> {
    if (!(await this.pflicht())[pflichtRolle(b)] || (await eingerichtet())) return 'ok';
    const ab = (await this.seit())[pflichtRolle(b)];
    if (sitzungSeit && ab && sitzungSeit.getTime() < Date.parse(ab)) return 'ausstehend';
    return 'fehlt';
  }
}

/** Entwurf beim Einrichten (#744: im Kurzzustand, das Geheimnis mit dem Schlüssel des DMS verschlüsselt). */
const ENTWURF = 'zweifaktor-entwurf';
const ENTWURF_MS = 10 * 60_000;

export class Zweifaktor {
  private zustand: Kurzzustand;

  constructor(private speicher: Einstellungen, private verschluessele: (k: string) => string, private entschluessele: (w: string) => string | null, private jetzt: () => number = Date.now, zustand?: Kurzzustand) {
    this.zustand = zustand ?? speicherKurzzustand(jetzt);
    this.vorschrift = new RollenPflicht(speicher, 'zweifaktor_pflicht', 'Pflicht zur Zwei-Faktor-Anmeldung geändert', jetzt);
  }

  private async lies(id: string) { return (await this.speicher.lies(`zweifaktor_${id}`)) as Gespeichert | null; }
  private async schreibe(id: string, g: Gespeichert | null) { await this.speicher.schreibe(`zweifaktor_${id}`, g); }
  /**
   * Nur schreiben, wenn noch `alt` gespeichert ist (#744): Derselbe Code bzw. Wiederherstellungscode gilt so auch bei
   * gleichzeitigen Anmeldungen in mehreren Prozessen nur einmal. Ohne `tausche` (Speicher im Arbeitsspeicher) wie bisher.
   */
  private async ersetze(id: string, alt: Gespeichert, neu: Gespeichert): Promise<boolean> {
    if (this.speicher.tausche) return this.speicher.tausche(`zweifaktor_${id}`, alt, neu);
    await this.schreibe(id, neu); return true;
  }

  /** Eingerichtet? Je Anfrage aus der Datenbank (#744: kein Zwischenspeicher, sonst sähe ein zweiter Prozess es zu spät). */
  async aktiv(id: string): Promise<boolean> { return !!(await this.lies(id)); }

  async status(id: string): Promise<ZweifaktorStatus> {
    const g = await this.lies(id);
    return { aktiv: !!g, seit: g?.seit ?? null, codesUebrig: g?.codes.filter(Boolean).length ?? 0 };
  }

  /** Pflicht je Rolle (#242, #416); dieselbe Logik nutzt die Passkey-Pflicht (#811). */
  readonly vorschrift: RollenPflicht;
  async pflicht(): Promise<Pflicht> { return this.vorschrift.pflicht(); }
  async setzePflicht(x: unknown, von: string): Promise<Pflicht> { return this.vorschrift.setze(x, von); }
  /**
   * Muss dieser Benutzer die Zwei-Faktor-Anmeldung noch einrichten?
   * - 'fehlt': ja, und diese Sitzung begann nach dem Einschalten der Pflicht – erst einrichten (#242).
   * - 'ausstehend': ja, aber die Sitzung lief schon vorher – weiterarbeiten, mit Hinweis (#416).
   * - 'ok': nein.
   * Ohne Sitzungsbeginn (z. B. reine Prüfung) zählt jede Pflicht als 'fehlt'.
   */
  async lage(b: PflichtPerson, sitzungSeit?: Date): Promise<'ok' | 'ausstehend' | 'fehlt'> {
    return this.vorschrift.lage(b, sitzungSeit, () => this.erfuellt(b.id));
  }
  /**
   * Erfüllt diese Person die Pflicht? Mit Code-App – oder (Entscheidung 11.11.2026, #811) mit einem Passkey, der hier
   * gilt: `alternative` verbindet `Konten` mit den Passkeys.
   */
  alternative: ((id: string) => Promise<boolean>) | null = null;
  async erfuellt(id: string): Promise<boolean> { return (await this.aktiv(id)) || (!!this.alternative && (await this.alternative(id))); }
  /** Gilt die Pflicht für die Rolle dieser Person (unabhängig davon, ob sie erfüllt ist)? */
  async pflichtFuer(b: PflichtPerson): Promise<boolean> { return (await this.pflicht())[pflichtRolle(b)]; }
  async fehlt(b: PflichtPerson, sitzungSeit?: Date): Promise<boolean> { return (await this.lage(b, sitzungSeit)) === 'fehlt'; }

  /** Einrichten, Schritt 1: neues Geheimnis (noch nicht gespeichert) und Adresse für den QR-Code. */
  async beginne(b: { id: string; email: string }, aussteller = 'Ablago') {
    const geheimnis = randomBytes(20);
    const g = base32(geheimnis);
    await this.zustand.setze(ENTWURF, b.id, this.verschluessele(g), this.jetzt() + ENTWURF_MS);
    const label = encodeURIComponent(`${aussteller}:${b.email}`);
    return { geheimnis: g.replace(/(.{4})/g, '$1 ').trim(), uri: `otpauth://totp/${label}?secret=${g}&issuer=${encodeURIComponent(aussteller)}&algorithm=SHA1&digits=6&period=30` };
  }

  /** Einrichten, Schritt 2: Code aus der App bestätigt das Geheimnis; liefert die Wiederherstellungscodes (einmalig). */
  async bestaetige(id: string, code: unknown, von: string): Promise<string[]> {
    const neu = () => new Fachfehler(409, t('meldungen.zweifaktor.bitte-die-einrichtung-neu'));
    const e = await this.zustand.lies(ENTWURF, id);
    const klar = typeof e?.wert === 'string' ? this.entschluessele(e.wert) : null;
    if (!klar) throw neu();
    const schritt = this.passt(ausBase32(klar), String(code ?? ''), -1);
    if (schritt === null) throw new Fachfehler(422, t('meldungen.zweifaktor.der-code-stimmt-nicht'));
    // Einmal einlösbar: Zwei gleichzeitige Bestätigungen legen nicht zweimal Wiederherstellungscodes an.
    if (!(await this.zustand.nimm(ENTWURF, id))) throw neu();
    const codes = neueCodes();
    await this.schreibe(id, { geheimnis: this.verschluessele(klar), seit: new Date(this.jetzt()).toISOString(), letzterSchritt: schritt, codes: codes.map(hash) });
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
      if (s !== null) return (await this.ersetze(id, g, { ...g, letzterSchritt: s })) ? 'totp' : null;
    }
    const h = hash(c);
    const i = g.codes.findIndex((x) => x && gleich(x, h));
    if (i >= 0 && c.replace(/[^A-Za-z0-9]/g, '').length >= 8) {
      const codes = [...g.codes]; codes[i] = '';
      if (!(await this.ersetze(id, g, { ...g, codes }))) return null;
      log.warn('Mit Wiederherstellungscode angemeldet', { benutzer: id, uebrig: codes.filter(Boolean).length });
      return 'wiederherstellung';
    }
    return null;
  }

  async neueCodes(id: string, von: string): Promise<string[]> {
    const g = await this.lies(id);
    if (!g) throw new Fachfehler(409, t('meldungen.zweifaktor.die-zwei-faktor-anmeldung'));
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
    const s = Array.from({ length: 10 }, () => z[randomInt(z.length)]).join('');
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 10)}`;
  });
}
