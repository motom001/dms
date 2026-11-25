import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';

/**
 * Welche Netzadressen Ablago ansprechen darf (#671, #1628) – gemeinsam für „URL aufrufen“ (`automatisierung/sicherer-abruf.ts`)
 * und die Abrufe der Pakete auf Adressen aus ihrem Manifest (`laeufer/prozess.ts`). Öffentliche Adressen immer;
 * Loopback, private Netze, Link-Local, CGNAT und Dokumentationsnetze nur bei einem ausdrücklichen Heimnetz-Ziel;
 * Metadaten-Adressen von Cloud-Anbietern, `0.0.0.0/8`, Multicast und Broadcast nie. Geprüft wird beim Verbinden über
 * ein eigenes `lookup` – kein zweites Auflösen danach, DNS-Rebinding greift nicht.
 */

/** Nie – auch nicht bei Heimnetz-Zielen: Metadaten-Dienste, „dieses Netz“, Multicast, reserviert/Broadcast. */
const NIE = new BlockList();
for (const a of ['169.254.169.254', '169.254.170.2', '169.254.169.123', '100.100.100.200']) NIE.addAddress(a, 'ipv4');
NIE.addAddress('fd00:ec2::254', 'ipv6');
NIE.addSubnet('0.0.0.0', 8, 'ipv4');
NIE.addSubnet('224.0.0.0', 4, 'ipv4');
NIE.addSubnet('240.0.0.0', 4, 'ipv4');
NIE.addAddress('::', 'ipv6');
NIE.addSubnet('ff00::', 8, 'ipv6');

/** Nur bei Heimnetz-Zielen: Loopback, private Netze, Link-Local, CGNAT, Benchmark- und Dokumentationsnetze. */
const HEIMNETZ = new BlockList();
for (const [n, l] of [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16],
  ['100.64.0.0', 10],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
] as const)
  HEIMNETZ.addSubnet(n, l, 'ipv4');
HEIMNETZ.addAddress('::1', 'ipv6');
HEIMNETZ.addSubnet('fc00::', 7, 'ipv6');
HEIMNETZ.addSubnet('fe80::', 10, 'ipv6');
HEIMNETZ.addSubnet('2001:db8::', 32, 'ipv6');

/** IPv4 aus IPv4-in-IPv6 (`::ffff:a.b.c.d`, auch hexadezimal) und NAT64 (`64:ff9b::a.b.c.d`); sonst unverändert. */
function alsIpv4(ip: string): string {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const m = /^(?:::ffff:|64:ff9b::)(?:0{1,4}:)?(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (m) return m[1];
  const h = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
  if (h) {
    const x = parseInt(h[1], 16),
      y = parseInt(h[2], 16);
    return `${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`;
  }
  return a;
}

export type AdressArt = 'oeffentlich' | 'heimnetz' | 'nie';

/** Wohin eine IP-Adresse gehört (ungültige gelten als „nie“). */
export function adressArt(ip: string): AdressArt {
  const a = alsIpv4(ip);
  const v = isIP(a);
  if (!v) return 'nie';
  const fam = v === 4 ? 'ipv4' : 'ipv6';
  if (NIE.check(a, fam)) return 'nie';
  if (HEIMNETZ.check(a, fam)) return 'heimnetz';
  // Weitere IPv4-in-IPv6-Formen (::a.b.c.d, 2002::/16 6to4, Teredo) nicht raten: nur bei Heimnetz-Zielen.
  if (fam === 'ipv6' && (/^::/.test(a) || /^2002:/.test(a) || /^2001:0?:/.test(a))) return 'heimnetz';
  return 'oeffentlich';
}

/** Darf Ablago diese Adresse ansprechen? Öffentlich immer, Heimnetz nur bei einem Heimnetz-Ziel, „nie“ nie. */
export const adresseErlaubt = (ip: string, heimnetz: boolean) => {
  const art = adressArt(ip);
  return art === 'oeffentlich' || (art === 'heimnetz' && heimnetz);
};

/** Fehler „Adresse gesperrt“ – dauerhaft, nie wiederholt. */
export class AdresseGesperrt extends Error {
  constructor(host: string) {
    super(`Adresse von ${host} nicht erlaubt (SSRF-Schutz)`);
  }
}

export type Aufloesen = (host: string, cb: (fehler: Error | null, adressen: LookupAddress[]) => void) => void;
export const dnsAlle: Aufloesen = (host, cb) => dnsLookup(host, { all: true, verbatim: true }, (e, a) => cb(e, a ?? []));

/**
 * `lookup` für die Verbindung: auflösen, alle Adressen prüfen, nur erlaubte weitergeben. IPv4 zuerst (#1588): Hat das
 * Netz keine IPv6-Route nach außen, scheiterte sonst schon die erste Adresse. Mit `all` (Happy Eyeballs, in Node
 * Standard: `net.getDefaultAutoSelectFamily()`) probiert Node alle nacheinander – jede ist hier geprüft.
 */
export function pruefendesLookup(heimnetz: boolean, aufloesen: Aufloesen) {
  return (
    host: string,
    opt: { all?: boolean; family?: number },
    cb: (e: Error | null, a: string | LookupAddress[], f?: number) => void,
  ) => {
    aufloesen(host, (e, adressen) => {
      if (e) {
        cb(e, '');
        return;
      }
      const passend = adressen
        .filter((x) => !opt.family || x.family === opt.family)
        .sort((a, b) => (a.family === 4 ? 0 : 1) - (b.family === 4 ? 0 : 1));
      if (!passend.length) {
        cb(new Error(`${host}: keine Adresse`), '');
        return;
      }
      if (passend.some((x) => !adresseErlaubt(x.address, heimnetz))) {
        cb(new AdresseGesperrt(host), '');
        return;
      }
      if (opt.all) cb(null, passend);
      else cb(null, passend[0].address, passend[0].family);
    });
  };
}
