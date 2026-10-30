import { isIP } from 'node:net';

/**
 * Wem das DMS die Angaben eines Reverse-Proxys glaubt (X-Forwarded-For/-Proto/-Host; #234).
 *
 * - nicht gesetzt oder `auto`: dem eigenen Rechner und privaten Netzen (Loopback, Link-Local,
 *   10/8, 172.16/12, 192.168/16, fc00::/7). Dort sitzen Proxy-Container und NAS-Proxys praktisch immer;
 *   Anfragen direkt aus dem Internet können so weder IP noch HTTPS vortäuschen.
 * - `false`: niemandem, `true`: allen.
 * - sonst eine Liste von Adressen oder Netzen, durch Komma getrennt (z. B. `172.18.0.0/16`).
 */
export type ProxyVertrauen = boolean | string[];

export const PRIVATE_NETZE = ['loopback', 'linklocal', 'uniquelocal'];

const gueltig = (x: string) => {
  if (PRIVATE_NETZE.includes(x)) return true;
  const [ip, maske, ...rest] = x.split('/');
  if (rest.length || !isIP(ip)) return false;
  if (maske === undefined) return true;
  const max = isIP(ip) === 4 ? 32 : 128;
  return /^\d{1,3}$/.test(maske) && Number(maske) <= max;
};

export function proxyVertrauen(wert: string | undefined): { trust: ProxyVertrauen; text: string; fehler?: string } {
  const w = (wert ?? '').trim();
  if (!w || w.toLowerCase() === 'auto') return { trust: PRIVATE_NETZE, text: 'automatisch (eigener Rechner und private Netze)' };
  if (w.toLowerCase() === 'false') return { trust: false, text: 'aus' };
  if (w.toLowerCase() === 'true') return { trust: true, text: 'alle Absender' };
  const liste = w.split(',').map((x) => x.trim()).filter(Boolean);
  const falsch = liste.filter((x) => !gueltig(x));
  if (falsch.length || !liste.length) {
    return { trust: PRIVATE_NETZE, text: 'automatisch (eigener Rechner und private Netze)', fehler: `TRUST_PROXY: „${falsch.join(', ') || w}“ ist keine Adresse und kein Netz – es gilt „auto“.` };
  }
  return { trust: liste, text: liste.join(', ') };
}
