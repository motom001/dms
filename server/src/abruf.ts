/**
 * Öffentliche Abrufseite einer Auskunft (#455) – Bausteine ohne Datenbank.
 *
 * Der Link trägt nur einen zufälligen Schlüssel (256 Bit) im Fragment (`/abruf#<schlüssel>`): Der Browser
 * schickt ihn nie von selbst mit, er steht also in keinem Zugriffsprotokoll und in keinem Referer. Die
 * Seite schickt Schlüssel und Abrufcode per POST; stimmt beides, gibt es ein Ticket für genau einen
 * Download (zwei Minuten gültig, nur im Arbeitsspeicher). In der Datenbank liegen nur Hashes.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import { CODE_LAENGE, CODE_ZEICHEN } from '../../shared/src/auskunft';

/** Abrufcode aus gut unterscheidbaren Zeichen (ohne 0/O, 1/I), gleichverteilt. */
export function neuerAbrufcode(): string {
  let c = '';
  for (let i = 0; i < CODE_LAENGE; i++) c += CODE_ZEICHEN[randomInt(CODE_ZEICHEN.length)];
  return c;
}

/** Schlüssel eines Abruf-Links: 32 Byte base64url, also genau 43 Zeichen. */
export const SCHLUESSEL_MUSTER = /^[A-Za-z0-9_-]{43}$/;

/** IP fürs Protokoll gekürzt (Datensparsamkeit): IPv4 auf /24, IPv6 auf /48. */
export function kuerzeIp(ip: string | undefined): string {
  const a = (ip ?? '').replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1').trim();
  const f = isIP(a);
  if (f === 4) return a.replace(/\.\d+$/, '.0');
  if (f === 6) {
    const teile = a.split('::')[0].split(':').filter(Boolean).slice(0, 3);
    return `${teile.join(':')}::`;
  }
  return '–';
}

export const TICKET_MS = 2 * 60_000;
const TICKETS_MAX = 1000;

/** Einmal-Tickets für den Download nach richtig eingegebenem Code. */
export class AbrufTickets {
  private tickets = new Map<string, { linkId: string; bis: number }>();
  constructor(private jetzt: () => number = Date.now) {}

  stelleAus(linkId: string): string {
    this.aufraeumen();
    // Gegen Fluten des Speichers: die ältesten fallen heraus.
    while (this.tickets.size >= TICKETS_MAX) this.tickets.delete(this.tickets.keys().next().value as string);
    const t = randomBytes(32).toString('base64url');
    this.tickets.set(t, { linkId, bis: this.jetzt() + TICKET_MS });
    return t;
  }

  /** Löst ein Ticket ein (nur einmal); liefert die Id des Links oder null. */
  loese(ticket: unknown): string | null {
    this.aufraeumen();
    if (typeof ticket !== 'string' || !SCHLUESSEL_MUSTER.test(ticket)) return null;
    const x = this.tickets.get(ticket);
    if (!x) return null;
    this.tickets.delete(ticket);
    return x.linkId;
  }

  private aufraeumen() {
    const t = this.jetzt();
    for (const [k, v] of this.tickets) if (v.bis <= t) this.tickets.delete(k);
  }
}
