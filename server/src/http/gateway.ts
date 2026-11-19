import { readFileSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';
import type { Kurzzustand } from '../zwischenspeicher/kurzzustand';

/**
 * Gateway-Adressen der eigenen Netze (#1355). In manchen Docker-Aufbauten kommen Anfragen mit der Gateway-Adresse des
 * Docker-Netzes an statt mit der des Geräts, das sie schickt (Userland-Proxy, oft bei IPv6, Docker Desktop, Rootless
 * Docker). Ablago kann für solche Anfragen nicht sagen, ob sie aus dem Heimnetz oder aus dem Internet kommen.
 *
 * - Die Gateways stehen in der Routing-Tabelle des eigenen Rechners bzw. Containers (`/proc/net/route`,
 *   `/proc/net/ipv6_route`). Ohne diese Dateien (kein Linux) gibt es keine Gateways – dann ändert sich nichts.
 * - Die Erkennung macht Ablago nur strenger: Eine Anfrage von einem Gateway gilt nie als Heimnetz (`istHeimnetz`). Sie
 *   macht nie eine Anfrage zum Heimnetz, die es vorher nicht war.
 * - Für den Hinweis in der Werkbank meldet jeder Prozess die letzte solche Anfrage in den Kurzzustand (alle Prozesse).
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

/** Art im Kurzzustand (#744): Schlüssel ist die Gateway-Adresse, Wert der Zeitpunkt der letzten Anfrage. */
const ART = 'heimnetz-gateway';
/** Jeder Prozess meldet höchstens so oft in den Kurzzustand (keine Last je Anfrage). */
export const GATEWAY_MELDEN_MS = 60_000;

type Stand = { adresse: string; zuletzt: string } | null;

/**
 * Anfragen, deren Adresse (nach `TRUST_PROXY`, also die, mit der Ablago auch „Heimnetz“ prüft) ein Gateway ist – nur für
 * den Hinweis in der Werkbank; die Prüfung je Anfrage ist davon unabhängig und bleibt lokal.
 *
 * Mit mehreren Prozessen (`DMS_PROZESSE`) bedient irgendein Prozess die Werkbank. Darum meldet jeder Prozess Adresse und
 * Zeitpunkt in den Kurzzustand (#744, in der Datenbank für alle Prozesse) – höchstens einmal je Minute, ohne auf die
 * Datenbank zu warten. Die Werkbank liest dort und nimmt den eigenen, noch nicht gemeldeten Stand dazu.
 */
export class GatewayBeobachtung {
  private letzte: { adresse: string; am: number } | null = null;
  private gemeldet = -Infinity;

  constructor(
    private readonly gateways: Gateways = eigeneGateways,
    private readonly jetzt: () => number = Date.now,
  ) {}

  /** Eine Anfrage mit dieser Adresse ist angekommen; mit `zustand` höchstens einmal je Minute dorthin gemeldet. */
  notiere(ip: string | undefined, zustand?: Kurzzustand) {
    if (!this.gateways.ist(ip)) return;
    const am = this.jetzt();
    this.letzte = { adresse: normaleAdresse(ip), am };
    if (!zustand || am - this.gemeldet < GATEWAY_MELDEN_MS) return;
    this.gemeldet = am;
    void zustand.setze(ART, this.letzte.adresse, am, am + GATEWAY_HINWEIS_MS).catch(() => {
      // Nur ein Hinweis: Scheitert das Schreiben, versucht es die nächste Anfrage nach einer Minute wieder.
    });
  }

  /** Für die Werkbank: die zuletzt gesehene Gateway-Adresse aller Prozesse – oder null, wenn in 24 Stunden keine kam. */
  async stand(zustand?: Kurzzustand): Promise<Stand> {
    const t = this.jetzt();
    const kandidaten: Array<{ adresse: string; am: number }> = this.letzte ? [this.letzte] : [];
    if (zustand) {
      try {
        for (const e of await zustand.liste(ART, '', 20))
          if (typeof e.wert === 'number') kandidaten.push({ adresse: e.schluessel, am: e.wert });
      } catch {
        // Datenbank nicht erreichbar: dann nur, was dieser Prozess selbst gesehen hat.
      }
    }
    const l = kandidaten.filter((k) => t - k.am <= GATEWAY_HINWEIS_MS).sort((a, b) => b.am - a.am)[0];
    return l ? { adresse: l.adresse, zuletzt: new Date(l.am).toISOString() } : null;
  }
}

/** Die Beobachtung dieses Prozesses. */
export const gatewayBeobachtung = new GatewayBeobachtung();
