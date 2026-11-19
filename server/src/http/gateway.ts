import { readFileSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';

/**
 * Gateway-Adressen der eigenen Netze (#1355). In manchen Docker-Aufbauten kommen Anfragen mit der Gateway-Adresse des
 * Docker-Netzes an statt mit der des Geräts, das sie schickt (Userland-Proxy, oft bei IPv6, Docker Desktop, Rootless
 * Docker). Ablago kann für solche Anfragen nicht sagen, ob sie aus dem Heimnetz oder aus dem Internet kommen.
 *
 * - Die Gateways stehen in der Routing-Tabelle des eigenen Rechners bzw. Containers (`/proc/net/route`,
 *   `/proc/net/ipv6_route`). Ohne diese Dateien (kein Linux) gibt es keine Gateways – dann ändert sich nichts.
 * - Die Erkennung macht Ablago nur strenger: Eine Anfrage von einem Gateway gilt nie als Heimnetz (`istHeimnetz`). Sie
 *   macht nie eine Anfrage zum Heimnetz, die es vorher nicht war.
 * - Für den Hinweis in der Werkbank merkt sich jeder Prozess, wann er zuletzt eine solche Anfrage gesehen hat.
 */

/** Routen über ein Gateway (RTF_GATEWAY). */
const RTF_GATEWAY = 0x2;
/** So lange gilt die gelesene Routing-Tabelle; danach wird sie neu gelesen (ein Netz kann später dazukommen). */
const GUELTIG_MS = 60_000;
/** So lange nach der letzten Anfrage von einem Gateway steht der Hinweis in der Werkbank. */
export const GATEWAY_HINWEIS_MS = 24 * 60 * 60_000;

/** Adresse ohne IPv4-in-IPv6-Vorsatz und ohne Zonenangabe (`fe80::1%eth0`). */
function normaleAdresse(ip: string | undefined): string {
  return (ip ?? '')
    .trim()
    .replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1')
    .replace(/%.*$/, '');
}

/** IPv4-Gateways aus `/proc/net/route` (Adressen als Hex in Netzwerk-Byte-Reihenfolge, Little Endian geschrieben). */
export function gatewaysIpv4(text: string): string[] {
  const aus: string[] = [];
  for (const zeile of text.split('\n').slice(1)) {
    const f = zeile.trim().split(/\s+/);
    if (f.length < 4 || !/^[0-9a-f]{8}$/i.test(f[2])) continue;
    if (!(Number.parseInt(f[3], 16) & RTF_GATEWAY)) continue;
    const n = Number.parseInt(f[2], 16);
    if (!n) continue;
    aus.push([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff].join('.'));
  }
  return aus;
}

/** IPv6-Gateways aus `/proc/net/ipv6_route` (Ziel, Länge, Quelle, Länge, nächster Sprung, Metrik, …, Flags, Schnittstelle). */
export function gatewaysIpv6(text: string): string[] {
  const aus: string[] = [];
  for (const zeile of text.split('\n')) {
    const f = zeile.trim().split(/\s+/);
    if (f.length < 10 || !/^[0-9a-f]{32}$/i.test(f[4])) continue;
    if (!(Number.parseInt(f[8], 16) & RTF_GATEWAY) || /^0+$/.test(f[4])) continue;
    aus.push(f[4].match(/.{4}/g)!.join(':').toLowerCase());
  }
  return aus;
}

/** Die Gateways dieses Rechners bzw. Containers; eine Liste fester Adressen für Tests. */
export class Gateways {
  private liste = new BlockList();
  private adressen: string[] = [];
  private gelesen = -Infinity;

  constructor(
    private readonly lies: () => string[] = liesRoutingTabelle,
    private readonly jetzt: () => number = Date.now,
  ) {}

  private aktuell() {
    if (this.jetzt() - this.gelesen < GUELTIG_MS) return;
    this.gelesen = this.jetzt();
    let neu: string[];
    try {
      neu = this.lies();
    } catch {
      neu = [];
    }
    this.liste = new BlockList();
    this.adressen = [];
    for (const a of new Set(neu.map(normaleAdresse))) {
      const f = isIP(a);
      if (!f) continue;
      this.liste.addAddress(a, f === 6 ? 'ipv6' : 'ipv4');
      this.adressen.push(a);
    }
  }

  /** Ist die Adresse ein Gateway eines eigenen Netzes? */
  ist(ip: string | undefined): boolean {
    const a = normaleAdresse(ip);
    const f = isIP(a);
    if (!f) return false;
    this.aktuell();
    return this.liste.check(a, f === 6 ? 'ipv6' : 'ipv4');
  }

  /** Alle bekannten Gateways (für Tests und die Fehlersuche). */
  alle(): string[] {
    this.aktuell();
    return [...this.adressen];
  }
}

function liesRoutingTabelle(): string[] {
  const datei = (pfad: string) => {
    try {
      return readFileSync(pfad, 'utf8');
    } catch {
      return '';
    }
  };
  return [...gatewaysIpv4(datei('/proc/net/route')), ...gatewaysIpv6(datei('/proc/net/ipv6_route'))];
}

/** Die Gateways dieses Prozesses. */
export const eigeneGateways = new Gateways();

/**
 * Wann dieser Prozess zuletzt eine Anfrage gesehen hat, deren Adresse ein Gateway ist (nach `TRUST_PROXY`, also die
 * Adresse, mit der Ablago auch „Heimnetz“ prüft). Nur für den Hinweis in der Werkbank; die Prüfung je Anfrage ist
 * davon unabhängig.
 */
export class GatewayBeobachtung {
  private letzte: { adresse: string; am: number } | null = null;

  constructor(
    private readonly gateways: Gateways = eigeneGateways,
    private readonly jetzt: () => number = Date.now,
  ) {}

  /** Eine Anfrage mit dieser Adresse ist angekommen. */
  notiere(ip: string | undefined) {
    if (this.gateways.ist(ip)) this.letzte = { adresse: normaleAdresse(ip), am: this.jetzt() };
  }

  /** Für die Werkbank: die Gateway-Adresse und wann zuletzt – oder null, wenn in den letzten 24 Stunden keine kam. */
  stand(): { adresse: string; zuletzt: string } | null {
    const l = this.letzte;
    if (!l || this.jetzt() - l.am > GATEWAY_HINWEIS_MS) return null;
    return { adresse: l.adresse, zuletzt: new Date(l.am).toISOString() };
  }
}

/** Die Beobachtung dieses Prozesses. */
export const gatewayBeobachtung = new GatewayBeobachtung();
