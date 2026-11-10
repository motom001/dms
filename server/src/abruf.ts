/**
 * Öffentliche Abrufseite einer Auskunft (#455) – Bausteine ohne Datenbank.
 *
 * Der Link trägt nur einen zufälligen Schlüssel (256 Bit) im Fragment (`/abruf#<schlüssel>`): Der Browser
 * schickt ihn nie von selbst mit, er steht also in keinem Zugriffsprotokoll und in keinem Referer. Die
 * Seite schickt Schlüssel und Abrufcode per POST; stimmt beides, gibt es ein Ticket für genau einen
 * Download (zwei Minuten gültig). In der Datenbank liegen nur Hashes (seit #744 auch vom Ticket).
 */
import { randomBytes, randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import { CODE_LAENGE, CODE_ZEICHEN } from '../../shared/src/auskunft';
import { hashe, speicherKurzzustand, type Kurzzustand } from './kurzzustand';

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
const TICKET = 'abruf-ticket';

/**
 * Einmal-Tickets für den Download nach richtig eingegebenem Code. Seit #744 im Kurzzustand (Datenbank): Der Download
 * darf bei einem anderen Prozess landen. Gespeichert ist nur der Hash des Tickets; Einlösen löscht es (genau einmal).
 */
export class AbrufTickets {
  private zustand: Kurzzustand;
  constructor(private jetzt: () => number = Date.now, zustand?: Kurzzustand) { this.zustand = zustand ?? speicherKurzzustand(jetzt); }

  async stelleAus(linkId: string): Promise<string> {
    const t = randomBytes(32).toString('base64url');
    await this.zustand.setze(TICKET, hashe(t), linkId, this.jetzt() + TICKET_MS);
    return t;
  }

  /** Löst ein Ticket ein (nur einmal); liefert die Id des Links oder null. */
  async loese(ticket: unknown): Promise<string | null> {
    if (typeof ticket !== 'string' || !SCHLUESSEL_MUSTER.test(ticket)) return null;
    const x = await this.zustand.nimm(TICKET, hashe(ticket));
    return typeof x?.wert === 'string' ? x.wert : null;
  }
}

/**
 * Bereich einer IP für den Zähler der Abrufseite: IPv4 einzeln, IPv6 je /64 (sonst hätte jeder
 * Anschluss mit IPv6 praktisch unbegrenzt viele Adressen).
 */
export function ipBereich(ip: string | undefined): string {
  const a = (ip ?? '').replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1').trim().replace(/%.*$/, '');
  const f = isIP(a);
  if (f === 4) return a;
  if (f !== 6) return '–';
  const [kopf, rest] = a.includes('::') ? a.split('::') : [a, ''];
  const vorn = kopf ? kopf.split(':') : [];
  const hinten = rest ? rest.split(':') : [];
  const gruppen = [...vorn, ...Array(Math.max(0, 8 - vorn.length - hinten.length)).fill('0'), ...hinten];
  return `${gruppen.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export interface BremseOptionen {
  /** Fehlversuche je IP-Bereich, bevor er für `sperreMs` gesperrt ist. */
  fehlerMax: number;
  sperreMs: number;
  /** Höchstens so viele Code-Prüfungen (scrypt) gleichzeitig über alle Links – je Prozess (Rechenzeit dieses Prozesses). */
  gleichzeitig: number;
  jetzt: () => number;
  /** Fehlversuche (#744): in der Datenbank, für alle Prozesse; ohne Angabe im Arbeitsspeicher (mit `jetzt`). */
  zustand?: Kurzzustand;
}
const FEHLER = 'abruf-fehler';

/**
 * Bremse der öffentlichen Abrufseite – getrennt vom Anmeldeschutz der Benutzerkonten. Fehlversuche an
 * Abruf-Links sperren also nie die Anmeldung (auch nicht hinter einem Reverse Proxy, der alle Anfragen
 * mit derselben IP weitergibt), und Ausnahmen des Anmeldeschutzes gelten hier nicht. Dazu begrenzt sie
 * die Zahl gleichzeitiger Code-Prüfungen: Jede kostet einen scrypt-Durchlauf, und parallele Anfragen
 * dürfen weder den Server auslasten noch an den Zählern vorbei raten. Die Fehlversuche zählt seit #744 die
 * Datenbank (atomar, für alle Prozesse); die Zahl gleichzeitiger Prüfungen schützt die Rechenzeit je Prozess.
 */
export class AbrufBremse {
  private laufend = 0;
  private o: BremseOptionen;
  private zustand: Kurzzustand;
  constructor(o: Partial<BremseOptionen> = {}) {
    this.o = { fehlerMax: 5, sperreMs: 15 * 60_000, gleichzeitig: 2, jetzt: Date.now, ...o };
    this.zustand = this.o.zustand ?? speicherKurzzustand(this.o.jetzt);
  }

  /** Ist der Bereich gerade gesperrt? */
  async gesperrt(bereich: string): Promise<boolean> {
    const x = await this.zustand.lies(FEHLER, bereich);
    return !!x && x.anzahl >= this.o.fehlerMax;
  }

  /** Fehlversuch zählen (atomar); jeder schiebt das Ende der Sperre hinaus. */
  async fehlschlag(bereich: string) {
    await this.zustand.zaehle(FEHLER, bereich, this.o.sperreMs, { gleitend: true });
  }

  /**
   * Vor der Code-Prüfung (#956): den Versuch vorab als Fehlversuch zählen – atomar in der Datenbank, für alle
   * Prozesse. So kommen gleichzeitige Anfragen (auch auf mehrere Prozesse verteilt) nicht an der Grenze vorbei.
   * null = gesperrt. War der Code richtig oder wurde gar nicht geprüft, nimmt `zurueck` den Versuch zurück.
   */
  async versuch(bereich: string): Promise<{ zurueck(): Promise<void> } | null> {
    const { anzahl } = await this.zustand.zaehle(FEHLER, bereich, this.o.sperreMs, { gleitend: true });
    let weg = false;
    const zurueck = async () => { if (!weg) { weg = true; await this.zustand.erhoehe(FEHLER, bereich, -1); } };
    if (anzahl > this.o.fehlerMax) { await zurueck(); return null; }
    return { zurueck };
  }

  /** Belegt einen Platz für eine Code-Prüfung; null, wenn alle belegt sind. Freigeben genau einmal. */
  belege(): (() => void) | null {
    if (this.laufend >= this.o.gleichzeitig) return null;
    this.laufend++;
    let frei = false;
    return () => { if (!frei) { frei = true; this.laufend--; } };
  }
}
