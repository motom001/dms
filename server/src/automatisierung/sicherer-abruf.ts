import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { AUSSEN_GRENZEN } from '../../../shared/src/automatisierung';
import { AUSSEN_ANTWORT_MAX } from '../grenzen';

/**
 * Sicherer Abruf für „URL aufrufen“ (#671) – Schutz gegen SSRF. Eigener Baustein, weil der Abruf für Katalog und Pakete
 * (`holeDaten` in pakete.ts) für einen anderen Zweck gebaut ist: nur GET, folgt Weiterleitungen (auf https), liefert den
 * Inhalt und prüft keine Adressen. Hier dagegen:
 *
 * - **Keine Weiterleitungen:** 3xx ist ein Fehler (dauerhaft) – Ablago folgt nie.
 * - **Adressen prüfen beim Verbinden:** Der Rechnername wird hier aufgelöst (eigenes `lookup` an der Verbindung, kein
 *   zweites Auflösen danach – DNS-Rebinding greift nicht). Erlaubt sind nur öffentliche Adressen; Loopback, private Netze,
 *   Link-Local, CGNAT und Dokumentationsnetze nur bei einem ausdrücklichen Heimnetz-Ziel; Metadaten-Adressen von
 *   Cloud-Anbietern, `0.0.0.0/8`, Multicast und Broadcast nie. Zeigt ein Name auf **eine** gesperrte Adresse, gilt er
 *   ganz als gesperrt. IPv4 in IPv6 (`::ffff:…`, NAT64 `64:ff9b::/96`) wird wie IPv4 geprüft.
 * - **Zeitlimit** für alles (Verbinden bis Ende der Antwort), **Größenlimit der Antwort** – gelesen wird höchstens
 *   `AUSSEN_ANTWORT_MAX` und verworfen; Ablago wertet die Antwort nicht aus (kein API-Client), nur den Status.
 * - Kein Verbindungs-Pool (jede Zustellung verbindet und prüft neu), TLS immer geprüft, kein Proxy aus der Umgebung.
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
for (const [n, l] of [['127.0.0.0', 8], ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['169.254.0.0', 16], ['100.64.0.0', 10],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24]] as const) HEIMNETZ.addSubnet(n, l, 'ipv4');
HEIMNETZ.addAddress('::1', 'ipv6');
HEIMNETZ.addSubnet('fc00::', 7, 'ipv6');
HEIMNETZ.addSubnet('fe80::', 10, 'ipv6');
HEIMNETZ.addSubnet('2001:db8::', 32, 'ipv6');

/** IPv4 aus IPv4-in-IPv6 (`::ffff:a.b.c.d`, auch hexadezimal) und NAT64 (`64:ff9b::a.b.c.d`); sonst unverändert. */
export function alsIpv4(ip: string): string {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const m = /^(?:::ffff:|64:ff9b::)(?:0{1,4}:)?(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (m) return m[1];
  const h = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
  if (h) { const x = parseInt(h[1], 16), y = parseInt(h[2], 16); return `${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`; }
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
export const adresseErlaubt = (ip: string, heimnetz: boolean) => { const art = adressArt(ip); return art === 'oeffentlich' || (art === 'heimnetz' && heimnetz); };

/** Fehler „Adresse gesperrt“ – dauerhaft, nie wiederholt. */
export class AdresseGesperrt extends Error { constructor(host: string) { super(`Adresse von ${host} nicht erlaubt (SSRF-Schutz)`); } }

type Aufloesen = (host: string, cb: (fehler: Error | null, adressen: LookupAddress[]) => void) => void;
const dnsAlle: Aufloesen = (host, cb) => dnsLookup(host, { all: true, verbatim: true }, (e, a) => cb(e, a ?? []));

/** `lookup` für die Verbindung: auflösen, alle Adressen prüfen, nur erlaubte weitergeben. */
function pruefendesLookup(heimnetz: boolean, aufloesen: Aufloesen) {
  return (host: string, opt: { all?: boolean; family?: number }, cb: (e: Error | null, a: string | LookupAddress[], f?: number) => void) => {
    aufloesen(host, (e, adressen) => {
      if (e) { cb(e, ''); return; }
      const passend = adressen.filter((x) => !opt.family || x.family === opt.family);
      if (!passend.length) { cb(new Error(`${host}: keine Adresse`), ''); return; }
      if (passend.some((x) => !adresseErlaubt(x.address, heimnetz))) { cb(new AdresseGesperrt(host), ''); return; }
      if (opt.all) cb(null, passend);
      else cb(null, passend[0].address, passend[0].family);
    });
  };
}

export interface AbrufAuftrag { adresse: string; methode: 'GET' | 'POST'; koepfe: Record<string, string>; rumpf?: Buffer; heimnetz: boolean }
/**
 * Ergebnis: `ok` bei 2xx; `dauerhaft` = nicht wiederholen (Weiterleitung, 4xx außer 408/429, gesperrte Adresse,
 * ungültige Adresse) – sonst (Netz, Zeit, 408, 429, 5xx) später noch einmal.
 */
export interface AbrufErgebnis { ok: boolean; status: number | null; fehler: string | null; dauerhaft: boolean; ms: number }

export interface AbrufOptionen { zeitlimitMs?: number; antwortMax?: number; aufloesen?: Aufloesen }

export type SichererAbruf = (a: AbrufAuftrag, o?: AbrufOptionen) => Promise<AbrufErgebnis>;

export const sichererAbruf: SichererAbruf = (a, o = {}) => new Promise((fertig) => {
  const start = Date.now();
  const ende = (x: Omit<AbrufErgebnis, 'ms'>) => fertig({ ...x, ms: Date.now() - start });
  let u: URL;
  try { u = new URL(a.adresse); } catch { ende({ ok: false, status: null, fehler: 'Adresse ungültig', dauerhaft: true }); return; }
  if (u.username || u.password || (u.protocol !== 'https:' && !(u.protocol === 'http:' && a.heimnetz))) { ende({ ok: false, status: null, fehler: 'Nur https (http nur bei Heimnetz-Zielen), ohne Zugangsdaten', dauerhaft: true }); return; }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  // IP-Adresse direkt in der Adresse: Node ruft dann kein lookup – also hier prüfen.
  if (isIP(host) && !adresseErlaubt(host, a.heimnetz)) { ende({ ok: false, status: null, fehler: new AdresseGesperrt(host).message, dauerhaft: true }); return; }
  const max = o.antwortMax ?? AUSSEN_ANTWORT_MAX;
  const modul = u.protocol === 'https:' ? https : http;
  let erledigt = false;
  const req = modul.request(u, {
    method: a.methode, agent: false,
    headers: { 'user-agent': 'Ablago-Automatisierung', accept: '*/*', ...a.koepfe, ...(a.rumpf ? { 'content-length': String(a.rumpf.length) } : {}) },
    lookup: pruefendesLookup(a.heimnetz, o.aufloesen ?? dnsAlle) as never,
  }, (res) => {
    const status = res.statusCode ?? 0;
    let gelesen = 0;
    const abschluss = () => {
      if (erledigt) return;
      erledigt = true; clearTimeout(uhr);
      if (status >= 200 && status < 300) ende({ ok: true, status, fehler: null, dauerhaft: false });
      else if (status >= 300 && status < 400) ende({ ok: false, status, fehler: 'Weiterleitung – Ablago folgt keinen Weiterleitungen', dauerhaft: true });
      else ende({ ok: false, status, fehler: `HTTP ${status}`, dauerhaft: status !== 408 && status !== 429 && status < 500 });
    };
    // Antwort lesen und verwerfen – höchstens `max` Bytes, dann abbrechen (der Status zählt).
    res.on('data', (s: Buffer) => { gelesen += s.length; if (gelesen > max) { res.destroy(); abschluss(); } });
    res.on('end', abschluss);
    res.on('close', abschluss);
    res.on('error', abschluss);
  });
  const uhr = setTimeout(() => req.destroy(new Error(`Keine Antwort in ${Math.round((o.zeitlimitMs ?? AUSSEN_GRENZEN.zeitlimitS * 1000) / 1000)} Sekunden`)), o.zeitlimitMs ?? AUSSEN_GRENZEN.zeitlimitS * 1000);
  uhr.unref?.();
  req.on('error', (e) => {
    if (erledigt) return;
    erledigt = true; clearTimeout(uhr);
    ende({ ok: false, status: null, fehler: e.message.slice(0, 300), dauerhaft: e instanceof AdresseGesperrt || e.message.includes('SSRF-Schutz') });
  });
  req.end(a.rumpf);
});
